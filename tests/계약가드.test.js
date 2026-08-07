/* precommit 계약 갈라짐 가드 회귀 (유호님 확정 ㉮ · 2026-08-07)
 *
 * 무엇을 지키나 — 이 저장소의 `계약/수집_교정_계약.json` 은 **사본**이고 정본은 형제
 *   (SYNK-appsscript)에 있다. 갈라짐을 잡던 유일한 장치인 `tests/계약.test.js` 는 형제가 없으면
 *   `t.skip` 이고 GitHub Actions 는 자기 저장소만 checkout 한다 — 그래서 계약이 갈라져도
 *   **양쪽 CI 가 다 초록**이었다(2026-08-07 설계 심문 지목 · 워크플로 2개 실측).
 *
 * 🔑 판정은 형제의 `계약동기화.js` 하나가 진다. 여기서 지키는 건 **발동 조건**이다:
 *   ① 계약 파일이 스테이징되면 그 도구를 부르고 ② 도구가 갈라졌다고 하면 커밋을 막고
 *   ③ 무관한 파일에는 아예 안 부르고 ④ 형제가 없으면 **막지 않되 「못 했다」고 말한다.**
 *   ④가 중요하다 — 확인 불가를 차단으로 바꾸면 폰·클라우드 세션이 아무것도 커밋 못 한다.
 *
 * 탐지력은 픽스처가 진다(실계약 파일을 흔들지 않는다 — 그게 더 위험하다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { 띄우기 } = require('./lib/띄우기');

const 훅 = path.join(__dirname, '..', 'tools', 'precommit.js');
const 계약경로 = '계약/수집_교정_계약.json';

function 픽스처(상대경로) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contractguard-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-b', 'master']);
  const 절대 = path.join(dir, 상대경로);
  fs.mkdirSync(path.dirname(절대), { recursive: true });
  fs.writeFileSync(절대, '{}\n', 'utf8');
  git(['add', '--', 상대경로]);
  return dir;
}

/** 부르면 티가 나는 가짜 도구. `종료코드` 1 = 갈라짐. */
function 가짜도구(dir, 종료코드) {
  const p = path.join(dir, '가짜계약동기화.js');
  fs.writeFileSync(p, `console.error('계약이 갈라졌다(가짜)'); process.exit(${종료코드});\n`, 'utf8');
  return p;
}

/* execFileSync 가 아닌 이유: 훅의 말은 **stderr** 로 나가는데 execFileSync 는 성공했을 때
 * stdout 만 돌려준다. 그러면 「막지 않았다」와 「막지 않고 아무 말도 안 했다」가 같은 모양이
 * 된다 — 이 파일이 ④에서 재려는 게 정확히 그 차이다(첫 판이 그래서 빨갛게 났다).
 * 통로가 `띄우기` 인 이유: 옛 판정 `r.status !== 0` 은 스폰 실패(status=null)까지 「막혔다」로
 * 번역했다 — 미실행은 판정이 아니라 예외여야 한다(tests/lib/띄우기.js · 통과코드 0|1 만 결과다). */
function 검사(dir, 도구) {
  const env = { ...process.env, SYNK_계약도구: 도구 };
  const r = 띄우기(훅, { cwd: dir, env, 통과코드: [0, 1] });
  return { 막혔나: r.status !== 0, 출력: String(r.stdout || '') + String(r.stderr || '') };
}

test('🔴 계약이 정본과 갈라지면 커밋을 막는다', (t) => {
  let dir;
  try { dir = 픽스처(계약경로); } catch (_) { return t.skip('git 을 못 돌린다'); }
  const r = 검사(dir, 가짜도구(dir, 1));
  assert.ok(r.막혔나, '정본과 갈라졌는데 커밋이 그대로 됐다');
  assert.match(r.출력, /갈라진 계약/, '막히긴 했는데 계약 때문이라는 근거가 없다');
});

test('계약이 같으면 막지 않는다 (거짓 차단은 곧 꺼지는 가드다)', (t) => {
  let dir;
  try { dir = 픽스처(계약경로); } catch (_) { return t.skip('git 을 못 돌린다'); }
  assert.strictEqual(검사(dir, 가짜도구(dir, 0)).막혔나, false, '도구가 0을 냈는데 막혔다');
});

test('계약과 무관한 파일에는 도구를 아예 안 부른다 (매 커밋 세금이 되면 안 된다)', (t) => {
  let dir;
  try { dir = 픽스처('docs/아무거나.md'); } catch (_) { return t.skip('git 을 못 돌린다'); }
  // 도구는 1을 내도록 두되 **불리지 말아야** 한다 — 불리면 막힌다.
  assert.strictEqual(검사(dir, 가짜도구(dir, 1)).막혔나, false, '무관한 커밋에서 계약 검사가 돌았다');
});

test('🔴 형제가 없으면 막지 않되 「못 했다」고 말한다 (통과와 미실행이 같은 모양이면 안 된다)', (t) => {
  let dir;
  try { dir = 픽스처(계약경로); } catch (_) { return t.skip('git 을 못 돌린다'); }
  const r = 검사(dir, path.join(dir, '없는도구.js'));
  assert.strictEqual(r.막혔나, false, '형제가 없다고 커밋을 막았다 — 폰·클라우드 세션이 통째로 멈춘다');
  assert.match(r.출력, /못 했다/, '대조를 못 했는데 아무 말도 안 했다 — 그건 통과와 같은 모양이다');
});
