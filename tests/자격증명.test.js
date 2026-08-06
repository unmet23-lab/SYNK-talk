/* lib/자격증명.js — 토큰을 **시간으로 가두는** 장치와 그 공용 통로.
 *
 * 이 회귀가 지는 것 둘:
 *   ① 만료 판정이 실제로 갈리는가(경계 포함).
 *   ② **옛 통로가 되살아나지 않는가.** 같은 `env읽기()` 가 도구 6곳에 복사돼 있었고, 그래서
 *      「작업 끝나면 폐기」는 6곳 어디에서도 강제되지 않았다. 통로를 하나로 모았으면
 *      **옛 통로를 금지하는 것까지가 한 벌**이다 — 안 그러면 다음 도구가 다시 복사해 온다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { 만료판정, 새날짜, 만료칸 } = require('../lib/자격증명.js');

const TOOLS = path.join(__dirname, '..', 'tools');

test('만료일이 없으면 「없음」 — 조용한 통과와 구분된다', () => {
  assert.equal(만료판정({}).상태, '없음');
  assert.equal(만료판정({ [만료칸]: '  ' }).상태, '없음');
});

test('지난 날짜는 「지남」', () => {
  assert.equal(만료판정({ [만료칸]: '2026-08-01' }, '2026-08-07').상태, '지남');
});

test('경계 — 만료일 당일은 아직 살아 있다(그날 하루를 뺏지 않는다)', () => {
  assert.equal(만료판정({ [만료칸]: '2026-08-07' }, '2026-08-07').상태, 'ok');
  assert.equal(만료판정({ [만료칸]: '2026-08-06' }, '2026-08-07').상태, '지남');
});

test('YYYY-MM-DD 가 아니면 「모양이상」 — 못 재는 것을 통과로 접지 않는다', () => {
  for (const v of ['2026/08/07', '내일', '20260807', '2026-8-7']) {
    assert.equal(만료판정({ [만료칸]: v }).상태, '모양이상', `${v} 를 통과시켰다`);
  }
});

test('자기 처방 — 안내가 주는 날짜를 넣으면 통과한다', () => {
  // 폐기안내가 「예: <새날짜(30)>」 을 보여 준다. 그대로 넣었는데 또 막히면 따를 수 없는 처방이다.
  const 처방 = 새날짜(30);
  assert.match(처방, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(만료판정({ [만료칸]: 처방 }).상태, 'ok', '처방대로 넣었는데 아직 막힌다');
});

/* ── 옛 통로 금지 ───────────────────────────────────────────────────────────── */

const 옛통로 = (글) => /function\s+env읽기\s*\(/.test(글) || /\.\.\.env읽기\(\)/.test(글);

test('탐지력 픽스처 — 옛 통로가 되살아나면 반드시 잡는다', () => {
  assert.ok(옛통로('function env읽기() {\n  return {};\n}'), '함수 선언을 못 잡는다');
  assert.ok(옛통로('const e = { ...env읽기(), ...process.env };'), '호출 형태를 못 잡는다');
  assert.ok(!옛통로("const e = 자격증명.읽기('원격SQL');"), '새 통로를 옛것으로 잘못 잡는다');
});

test('실저장소 — 액세스 토큰을 쓰는 도구에 옛 통로가 없다', () => {
  const 파일들 = fs.readdirSync(TOOLS).filter((f) => f.endsWith('.js'));
  assert.ok(파일들.length > 5, '도구 목록을 못 읽었다(통과와 미실행이 같은 모양이 된다)');

  const 되살아난것 = [];
  for (const f of 파일들) {
    const 글 = fs.readFileSync(path.join(TOOLS, f), 'utf8');
    if (!글.includes('SUPABASE_ACCESS_TOKEN')) continue;   // 토큰을 안 쓰면 이 규칙 밖이다
    if (옛통로(글)) 되살아난것.push(f);
  }
  assert.deepEqual(되살아난것, [], `옛 통로가 남아 있다: ${되살아난것.join(', ')}`);
});

test('실저장소 — 액세스 토큰을 쓰는 도구는 전부 공용 통로를 지난다', () => {
  const 파일들 = fs.readdirSync(TOOLS).filter((f) => f.endsWith('.js'));
  const 안지나는것 = [];
  for (const f of 파일들) {
    const 글 = fs.readFileSync(path.join(TOOLS, f), 'utf8');
    if (!글.includes('SUPABASE_ACCESS_TOKEN')) continue;
    if (!/자격증명\.읽기\(/.test(글)) 안지나는것.push(f);
  }
  // 🔑 「옛 통로가 없다」만으론 부족하다 — 아예 안 읽는 새 방식이 생기면 게이트를 또 비껴간다.
  assert.deepEqual(안지나는것, [], `공용 통로를 안 지난다: ${안지나는것.join(', ')}`);
});
