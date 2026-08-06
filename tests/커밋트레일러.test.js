'use strict';
/**
 * Session-Id 트레일러 회귀 — 이 저장소의 커밋에 주인이 남는가.
 *
 * 왜 있나 (2026-08-07 실측): CLAUDE.md 는 「커밋 주인은 prepare-commit-msg 훅이 자동으로
 *   박는다」고 적는데 **그게 참인 곳은 appsscript 뿐이었다.** 이 저장소는 core.hooksPath 를
 *   `.githooks` 로 갈아탔고 그 폴더엔 pre-commit 하나뿐이라, 여기서 난 커밋은 전부 주인이
 *   없었다. 규칙은 하나인데 장치가 한쪽에만 있던 것 — 그래서 인계문의 형제 읽기(F142)도,
 *   board-move 의 생사 판정(F146)도 여기서만 조용히 0건을 물었다.
 *
 * 🔑 새는 방향은 언제나 「통과」다 — 훅이 없으면 커밋은 그냥 성공하고, 트레일러가 없다는
 *   사실은 **나중에 인계가 비어 있을 때**야 드러난다. 그래서 여기서 못박는다.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const 훅폴더 = path.join(ROOT, '.githooks');
const 스탬퍼 = path.join(훅폴더, 'prepare-commit-msg');

test('.githooks 에 prepare-commit-msg 가 있다 — 없으면 이 저장소 커밋은 전부 주인이 없다', () => {
  assert.ok(fs.existsSync(스탬퍼),
    '.githooks/prepare-commit-msg 이 없다 — core.hooksPath 가 .githooks 라 이 폴더에 없는 훅은 안 돈다');
});

test('install-hooks 의 훅 목록이 .githooks 실물과 같다 (하나만 늘리면 그 훅은 안 돈다)', () => {
  /* 목록을 손으로 들고 있으면 훅을 늘릴 때 갈라진다. 갈라진 쪽 증상은 「그 훅만 조용히
   * 실행 비트를 못 받는다」라 통과와 구별되지 않는다. */
  const 소스 = fs.readFileSync(path.join(ROOT, 'tools', 'install-hooks.js'), 'utf8');
  const 목록 = [...소스.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  const 실물 = fs.readdirSync(훅폴더).filter((f) => !f.startsWith('.')).sort();
  const 빠진것 = 실물.filter((f) => !목록.includes(f));
  assert.deepEqual(빠진것, [],
    `.githooks 에 있는데 install-hooks 가 모르는 훅: ${빠진것.join(', ')}`);
});

test('🔑 스탬퍼가 실제로 트레일러를 박는다 — 그리고 없을 땐 안 박는다 (양방향)', (t) => {
  if (spawnSync('sh', ['--version']).error) return t.skip('sh 없음(POSIX 셸이 있어야 훅이 돈다)');

  const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-trailer-'));
  const 돌리기 = (env) => {
    const 파일 = path.join(임시, `msg-${Math.abs([...JSON.stringify(env)].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7))}.txt`);
    fs.writeFileSync(파일, '테스트 커밋 제목\n');
    const r = spawnSync('sh', [스탬퍼, 파일], { env: { ...process.env, ...env }, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `훅이 비정상 종료했다(귀속은 커밋을 막으면 안 된다): ${r.stderr}`);
    return fs.readFileSync(파일, 'utf8');
  };

  const 있음 = 돌리기({ CLAUDE_CODE_HOST_SESSION_ID: 'local_TESTSID-0000' });
  assert.match(있음, /^Session-Id: local_TESTSID-0000$/m,
    `트레일러를 안 박았다 — 이게 안 되면 이 저장소 커밋은 주인 없이 쌓인다:\n${있음}`);

  // 반대 방향: 환경변수가 없으면 손커밋·CI 를 건드리지 않는다.
  const 없음 = 돌리기({ CLAUDE_CODE_HOST_SESSION_ID: '' });
  assert.doesNotMatch(없음, /Session-Id:/,
    '환경변수가 없는데 무언가를 박았다 — 유호님 손커밋·CI 를 오염시킨다');
});
