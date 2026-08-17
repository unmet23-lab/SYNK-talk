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
const { 띄우기 } = require('./lib/띄우기');

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

/** @returns {{code:number, out:string}} 가드 실행 결과 — 0(통과)·1(차단)만 결과다.
 * 스폰 실패·다른 종료코드는 `띄우기` 가 던진다. 옛 판(execFileSync catch 의 e.status 번역)은
 * 가드가 크래시해도 node 가 exit 1 이라 「차단」과 같은 모양이었다 — 그래서 크래시와 차단은
 * 코드로 못 가르고, **차단 검사는 rule 앵커(assert.match)로 의도된 차단임을 증명해야 한다**
 * (08-07 실측: 자격증명 검사가 앵커 없이 code===1 만 봐서 가드 전사에도 초록이었다). */
function runGuard(cwd, env) {
  const r = 띄우기(PRECOMMIT, { cwd, env: env ? { ...process.env, ...env } : process.env, 통과코드: [0, 1] });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
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
    // 앵커가 곧 「의도된 차단」의 증명이다 — 크래시도 exit 1 이라 코드만 보면 가드 전사가 초록이 된다.
    assert.match(r.out, /자격증명 파일명/, `막히긴 했는데 그 rule 때문이라는 근거가 없다:\n${r.out}`);
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

    const r = runGuard(dir, { SYNK_SKIP_GUARD: '1' });
    assert.strictEqual(r.code, 0, `건너뛰지 않았다:\n${r.out}`);
  });
});

/* ── 옛 글자(한자·가나) — F351 · F379 ──────────────────────────────────────
 * 왜 **이 저장소**에 이 칸이 있어야 하나: 「쓰는 문자는 한글·몽골어·영어 셋뿐」(유호님 확정
 * 2026-08-07)을 지키던 장치는 형제(SYNK-appsscript)의 `tests/문서문자.test.js` 하나였는데,
 * **이 저장소 세션은 그 스위트를 안 돌린다** — 즉 그 층에서는 원리상 안 잡힌다.
 * 실측 2026-08-12: `prompts/교정.md` 에 「한자·가나 금지」 규칙을 넣으면서 그 «보기»로 금지
 * 문자를 썼고, 이 파일은 전문이 그대로 모델 `system` 에 실린다(lib/교정엔진.js) — 문서 흠이
 * 아니라 **모델 입력 오염**이었다. 커밋은 조용히 지나갔고 한참 뒤 남이 발견했다.
 * 🔑 판정은 형제의 `tools/lib/옛글자.js` 하나가 진다. 여기서 재는 것은 **배선이 실제로 도는가**다.
 * ⚠ 이 파일에도 그 글자를 적지 않는다 — `String.fromCodePoint` 로 조립한다. */
const 옛글자도구 = path.resolve(__dirname, '..', '..', 'SYNK-appsscript', 'tools', '옛글자검사.js');
const 옛글자 = String.fromCodePoint(0x683C);       // 실제로 새 나갔던 그 자리(U+683C)

test('차단: 옛 글자(한자·가나)가 스테이징되면 막는다', (t) => {
  if (!fs.existsSync(옛글자도구)) {
    return t.skip('형제 저장소가 이 기계에 없다 — 판정 정본이 거기 산다(통과와 미실행을 가른다)');
  }
  withRepo((dir) => {
    write(dir, 'prompts/교정.md', `금지 예시: ${옛글자}\n`);
    git(dir, ['add', 'prompts/교정.md']);

    const r = runGuard(dir);
    assert.strictEqual(r.code, 1, `막았어야 한다:\n${r.out}`);
    // 앵커가 곧 「의도된 차단」의 증명이다 — 크래시도 exit 1 이라 코드만 보면 가드 전사가 초록이 된다.
    assert.match(r.out, /prompts\/교정\.md:1\s+U\+683C/,
      `막히긴 했는데 옛 글자 때문이라는 근거가 없다:\n${r.out}`);
  });
});

/* 🔴 초록은 분모와 함께만 읽는다(F207). 이 저장소에서 「돌았는데 깨끗」과 「안 돌았다」가 같은
 *   모양이면, F379 의 병(이 층은 원리상 안 잡히는데 아무도 몰랐다)이 그대로 재발한다. */
test('통과: 깨끗해도 몇 개를 열었는지 말한다 — 미실행과 같은 모양이 되지 않게', (t) => {
  if (!fs.existsSync(옛글자도구)) return t.skip('형제 저장소가 이 기계에 없다');
  withRepo((dir) => {
    write(dir, 'src/화면.tsx', 'export const 제목 = "한글 · Latin · Монгол";\n');
    git(dir, ['add', 'src/화면.tsx']);

    const r = runGuard(dir);
    assert.strictEqual(r.code, 0, `거짓양성:\n${r.out}`);
    assert.match(r.out, /옛글자.*개 파일을 열었다/, `분모를 안 말한다:\n${r.out}`);
  });
});

/* ⚠ 형제가 없는 기계(폰·클라우드)에서는 **막지 않고 말한다** — 확인 불가를 차단으로 바꾸면
 *   그 세션은 아무것도 커밋 못 한다(따를 수 없는 처방은 우회를 정상 통로로 만든다 · F103).
 *   대신 침묵하지 않는다: 통과와 미실행이 같은 모양이 되면 안 된다. */
test('형제가 없는 기계에서는 막지 않고 «못 했다»고 말한다', () => {
  withRepo((dir) => {
    write(dir, 'prompts/교정.md', `금지 예시: ${옛글자}\n`);
    git(dir, ['add', 'prompts/교정.md']);

    const r = runGuard(dir, { SYNK_LEGACY_GLYPH_TOOL: path.join(dir, '없는도구.js') });
    assert.strictEqual(r.code, 0, `형제가 없다고 커밋을 막으면 그 세션은 아무것도 못 한다:\n${r.out}`);
    assert.match(r.out, /못 했다/, `확인을 못 했다는 말이 없다 — 미실행이 통과와 같은 모양이다:\n${r.out}`);
  });
});
