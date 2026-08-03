'use strict';
/**
 * pre-commit 게이트 통합 회귀 — git 호출부.
 *
 * 왜 필요한가: 순수함수(tools/guard.js)에는 회귀 23건이 있었는데 git 호출부에는 0건이었고,
 * 그 틈에서 실제 결함이 나왔다 — `git check-ignore` 는 기본적으로 「이미 추적 중인 파일」을
 * 무시 대상에서 빼기 때문에 `--no-index` 없이는 `git add -f` 를 **하나도 못 잡는다**.
 * 0일차 실측으로 발견. 이 파일이 그 재발을 막는다.
 *
 * 임시 저장소를 매번 새로 만든다 — 실저장소의 상태를 세지 않는다.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PRECOMMIT = path.resolve(__dirname, '..', 'tools', 'precommit.js');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

/** 임시 저장소를 만들고 콜백에 넘긴다. 끝나면 지운다. */
function withRepo(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-talk-guard-'));
  try {
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.name', 'test']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {{code:number, out:string}} 가드 실행 결과 */
function runGuard(cwd) {
  try {
    const out = execFileSync('node', [PRECOMMIT], { cwd, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

function write(dir, rel, text) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
}

test('차단: .gitignore 대상이 `git add -f` 로 들어오면 막는다', () => {
  withRepo((dir) => {
    write(dir, '.gitignore', 'dist/\n');
    write(dir, 'dist/note.txt', '빌드 산출물');
    git(dir, ['add', '-f', 'dist/note.txt']);

    const r = runGuard(dir);
    assert.strictEqual(r.code, 1, `막았어야 한다:\n${r.out}`);
    assert.match(r.out, /강제 추가/);
  });
});

test('차단: 자격증명 파일명', () => {
  withRepo((dir) => {
    write(dir, 'secrets/service-account-prod.json', '{}');
    git(dir, ['add', 'secrets/service-account-prod.json']);

    const r = runGuard(dir);
    assert.strictEqual(r.code, 1, `막았어야 한다:\n${r.out}`);
  });
});

test('통과: 평범한 소스만 스테이징되면 통과한다', () => {
  withRepo((dir) => {
    write(dir, '.gitignore', 'dist/\n');
    write(dir, 'src/App.tsx', 'export default function App() { return null }\n');
    git(dir, ['add', 'src/App.tsx']);

    const r = runGuard(dir);
    assert.strictEqual(r.code, 0, `거짓양성:\n${r.out}`);
  });
});

test('통과: 스테이징이 비어 있으면 통과한다', () => {
  withRepo((dir) => {
    const r = runGuard(dir);
    assert.strictEqual(r.code, 0, `거짓양성:\n${r.out}`);
  });
});

test('통과: 이진 파일은 내용 검사를 하지 않는다', () => {
  withRepo((dir) => {
    const p = path.join(dir, 'assets', 'icon.png');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x00, 0x03]));
    git(dir, ['add', 'assets/icon.png']);

    const r = runGuard(dir);
    assert.strictEqual(r.code, 0, `거짓양성:\n${r.out}`);
  });
});

test('SYNK_SKIP_GUARD=1 이면 검사를 건너뛴다(끄는 통로가 실제로 있다)', () => {
  withRepo((dir) => {
    write(dir, '.env', 'K=1');
    git(dir, ['add', '-f', '.env']);

    const r = (() => {
      try {
        const out = execFileSync('node', [PRECOMMIT], {
          cwd: dir,
          encoding: 'utf8',
          env: { ...process.env, SYNK_SKIP_GUARD: '1' },
        });
        return { code: 0, out };
      } catch (e) {
        return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
      }
    })();

    assert.strictEqual(r.code, 0, `건너뛰지 않았다:\n${r.out}`);
  });
});
