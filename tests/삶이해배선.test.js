/* ㉢ 삶 이해 — 입학 회차 나침반 둘이 «읽히는가» (2026-09-05 · 유호 픽 ㉮)
 *
 * ■ 왜 이 자가 생겼나 — 실측으로 **묻고 나서 아무도 안 읽고 있었다.**
 *   나침반 문항은 넷인데, 두 저장소를 전수 검색하니 `why_learning`·`topik_use` 는
 *   **정의한 파일(lib/나침반문항.js) 말고 읽는 곳이 0곳**이었다. 입학 첫날 학생에게 물어
 *   놓고 그 답이 어디에도 안 쓰이는 상태다(현황 = appsscript `docs/삶이해_현황.md`).
 *   그리고 그 답은 **그날에만 얻을 수 있다** — 나중에 다시 물으면 오늘의 답이 나온다.
 *
 * ■ 🔒 이 자가 지키는 잠금 — **판정하지 않고 맥락으로만 싣는다.** 세 곳이 같은 말을 한다:
 *   철학 정본 Ⅰ-4 「맥락으로 쓰는 데까지만」 · 그릇 설계 §10 「🚫 답을 시스템이 자동 채점하기」 ·
 *   유호 확정 09-05 「학생의 답을 엔진 재료로 보내려 한 것이 세 판이 헛돈 뿌리」.
 *   그래서 아래 등록층 검사는 조회에 «점수·태그·분류»가 끼어드는 것을 막는다.
 *
 * ■ 층 셋을 따로 잰다 — 순수(줄 만들기) · 요약(어디에 앉나) · 등록(실제로 걷어 오나).
 *   순수만 초록이면 「함수는 있는데 아무도 안 부른다」가 그대로 재현된다(그게 09-05 전 상태다).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { 목적줄들, 시즌줄, 목적말 } = require('../lib/시즌맥락.js');
const { 과제요약, 축줄상한 } = require('../lib/과제요약.js');
const { 학습자상태 } = require('../lib/학습자상태.js');
const { 서술상한 } = require('../lib/나침반문항.js');
const { 코드만 } = require('./lib/소스검사.js');

// ───────────────────────────────── ① 순수층 — 줄을 어떻게 만드나

test('없음·빈 값은 «빈 배열» — 「왜 배우나: 미정」 같은 채움말을 만들지 않는다(시즌줄과 같은 규약)', () => {
  for (const 답 of [undefined, null, {}, { why_learning: null, topik_use: '' },
    { why_learning: '   ', topik_use: undefined }]) {
    assert.deepStrictEqual(목적줄들(답), [], JSON.stringify(답));
  }
});

test('접두가 정확하다 — 벤더가 읽는 말이라 표기가 흔들리면 재료가 달라진다', () => {
  assert.deepStrictEqual(
    목적줄들({ why_learning: '한국에서 간호사로 일하고 싶다', topik_use: '대학 졸업 요건' }),
    ['왜 배우나: 한국에서 간호사로 일하고 싶다', '토픽 쓸 곳: 대학 졸업 요건']
  );
});

test('순서는 넓은 것 → 좁은 것이고 이 층이 정한다 — 부르는 쪽이 정하면 통로마다 갈린다', () => {
  const 줄들 = 목적줄들({ topik_use: '나중', why_learning: '먼저' });   // 인자 순서를 뒤집어도
  assert.deepStrictEqual(줄들, ['왜 배우나: 먼저', '토픽 쓸 곳: 나중']);
  assert.deepStrictEqual(목적말.map(([키]) => 키), ['why_learning', 'topik_use'], '순서 정본이 바뀌었다');
});

test('하나만 있으면 하나만 낸다 — 없는 것을 빈칸으로 그리지 않는다', () => {
  assert.deepStrictEqual(목적줄들({ why_learning: '취업' }), ['왜 배우나: 취업']);
  assert.deepStrictEqual(목적줄들({ topik_use: '입학' }), ['토픽 쓸 곳: 입학']);
});

test('몽골어(키릴)를 그대로 통과시킨다 — 언어 변환은 이 층의 일이 아니다', () => {
  assert.deepStrictEqual(목적줄들({ why_learning: 'Солонгост ажиллах' }),
    ['왜 배우나: Солонгост ажиллах']);
});

test('자르지 않는다 — 상한의 정본은 입구(나침반문항·DB CHECK) 하나다', () => {
  const 긴 = '가'.repeat(서술상한);
  assert.deepStrictEqual(목적줄들({ why_learning: 긴 }), [`왜 배우나: ${긴}`]);
});

test('🔒 판정을 안 낸다 — 답은 오직 «줄»이고 점수·등급·태그 칸이 없다', () => {
  const 줄들 = 목적줄들({ why_learning: '취업', topik_use: '졸업' });
  for (const 줄 of 줄들) assert.strictEqual(typeof 줄, 'string', '문자열이 아닌 것이 나왔다 — 판정 객체는 이 층의 산출이 아니다');
});

// ───────────────────────────────── ② 요약층 — 어디에 앉나

const 기준 = '2026-09-05T12:00:00Z';
const 일 = 86400000;
const 전 = (밀리) => new Date(Date.parse(기준) - 밀리).toISOString();
let 번호 = 0;
const 사건 = (t, at, 더 = {}) => ({ event_id: `E${(번호 += 1)}`, event_type: t, occurred_at: at, ingested_at: at, ...더 });

function 실물상태() {
  const 행 = [];
  for (let d = 5; d >= 1; d -= 1) {
    행.push(사건('task.assigned', 전(d * 일), { due_at: 전(d * 일 - 12 * 3600000) }));
    행.push(사건('submission.created', 전(d * 일 - 3600000)));
  }
  return 학습자상태(행, { as_of: 기준, ingested_as_of: 기준, 시간대: 'Asia/Ulaanbaatar' });
}

test('🔴 요약에 실린다 — 이 자가 빨개지면 「함수는 있는데 아무도 안 부른다」로 되돌아간 것이다', () => {
  const r = 과제요약(실물상태(), { 왜배우나: '간호사', 토픽쓸곳: '졸업 요건' });
  assert.ok(r.요약.includes('왜 배우나: 간호사'), r.요약);
  assert.ok(r.요약.includes('토픽 쓸 곳: 졸업 요건'), r.요약);
});

test('시즌 목표 «뒤»에 온다 — 앞에 끼우면 쌓인 요약의 줄 순서가 바뀌어 대조가 깨진다', () => {
  const r = 과제요약(실물상태(), { 시즌목표: '4급', 왜배우나: '간호사', 토픽쓸곳: '졸업' });
  const 줄 = r.요약.split('\n');
  const i = 줄.findIndex((s) => s.startsWith('이번 시즌 목표:'));
  const j = 줄.findIndex((s) => s.startsWith('왜 배우나:'));
  const k = 줄.findIndex((s) => s.startsWith('토픽 쓸 곳:'));
  assert.ok(i >= 0 && j >= 0 && k >= 0, r.요약);
  assert.ok(i < j && j < k, `순서가 어긋났다 — 시즌(${i}) < 왜(${j}) < 토픽(${k}) 이어야 한다`);
});

test('axes_used 에 안 센다 — 세면 상태 없는 학생도 쓸축수≥1 이 되어 「상태없음」이 원리상 안 나온다', () => {
  const 없이 = 과제요약(실물상태(), {});
  const 있게 = 과제요약(실물상태(), { 왜배우나: '간호사', 토픽쓸곳: '졸업' });
  assert.deepStrictEqual(있게.axes_used, 없이.axes_used, '목표 조각이 축으로 세어졌다');
  assert.strictEqual(있게.쓸축수, 없이.쓸축수);
});

test('이 층의 절단을 받는다 — 입구 상한은 500 이지만 여기는 «요약»이다(§6-2)', () => {
  const 긴 = '가'.repeat(서술상한);
  const r = 과제요약(실물상태(), { 왜배우나: 긴 });
  const 줄 = r.요약.split('\n').find((s) => s.startsWith('왜 배우나:'));
  assert.ok(줄.endsWith('…'), '절단 표시가 없다');
  assert.ok(Array.from(줄).length <= 축줄상한 + 1, `줄 길이 ${Array.from(줄).length} — 상한 ${축줄상한}(+말줄임)`);
});

test('없으면 안 실린다 — 널 규칙 그대로(나침반 0행이 개원 전 정상 상태다)', () => {
  const r = 과제요약(실물상태(), { 시즌목표: '4급' });
  assert.ok(!r.요약.includes('왜 배우나'), r.요약);
  assert.ok(!r.요약.includes('토픽 쓸 곳'), r.요약);
});

// ───────────────────────────────── ③ 등록층 — 실제로 걷어 오나

const 배달방 = path.join(__dirname, '..', 'supabase', 'functions', 'deliver');
const 배달본체 = 코드만(fs.readFileSync(path.join(배달방, 'index.ts'), 'utf8'));
const 생성모드 = 코드만(fs.readFileSync(path.join(배달방, '생성모드.ts'), 'utf8'));

test('🔴 조회가 입학 회차 답 둘을 실제로 걷는다 — 순수층만 초록이면 아무도 안 부르는 상태다', () => {
  assert.ok(배달본체.includes("answers->>'why_learning'"), 'why_learning 을 조회하지 않는다');
  assert.ok(배달본체.includes("answers->>'topik_use'"), 'topik_use 를 조회하지 않는다');
});

test('🔴 회차를 «self_in_5y_changed is null» 로 가른다 — 시즌 행에서 찾으면 셋째 시즌부터 영원히 null 이다', () => {
  /* 이 둘은 입학 회차에만 저장된다(DB CHECK season_compass_answers_c11 이 회차별 키 집합을
   * 못박는다). 「오늘을 덮는 시즌」 행에서 찾으면 값이 없는 게 아니라 «다른 행에» 있는 것이라,
   * 증상이 「데이터가 없다」의 얼굴로 온다 — 0건이 성공 얼굴인 그 무늬. */
  const 납작 = 배달본체.replace(/\s+/g, ' ');
  assert.ok(/season_compass[^;]*self_in_5y_changed is null/.test(납작),
    '입학 회차를 가르는 술어가 없다 — 시즌 행에서 찾고 있다');
});

test('🔴 걷은 값이 요약 조각으로 «넘어간다» — 조회만 하고 안 넘기면 SQL 만 무거워진다', () => {
  assert.ok(/왜배우나:\s*\(학생\.왜배우나/.test(생성모드), '왜배우나 를 과제요약 조각으로 안 넘긴다');
  assert.ok(/토픽쓸곳:\s*\(학생\.토픽쓸곳/.test(생성모드), '토픽쓸곳 을 과제요약 조각으로 안 넘긴다');
});

test('🔒 조회가 «판정»을 만들지 않는다 — 걷어 오는 것은 원값뿐이다', () => {
  /* 막힌 길로 되돌아가는 첫 걸음은 언제나 조회 안에서 값을 가공하는 것이다(case when …
   * then '적극적' 같은 것). 원값을 그대로 걷고, 말은 lib/시즌맥락.js 하나가 정한다. */
  /* ⚠ 둘레를 «글자 수»로 자르면 옆 칸의 낱말을 잡는다(첫 판이 그렇게 빨갰다 — 근처에 점수
   *   조회가 있었다). 그래서 그 lateral **블록 자체**를 뽑아 잰다. */
  const 시작 = 배달본체.indexOf("answers->>'why_learning'");
  assert.ok(시작 > 0, '조회가 아예 없다');
  const 끝 = 배달본체.indexOf('입학나침반 on true', 시작);
  assert.ok(끝 > 시작, 'lateral 별칭이 `입학나침반` 이 아니다 — 블록을 못 집는다');
  const 블록 = 배달본체.slice(시작, 끝);
  for (const 금지 of ['case when', 'score', 'classify', '점수', '등급', '태그']) {
    assert.ok(!블록.toLowerCase().includes(금지.toLowerCase()),
      `입학 나침반 lateral 안에 「${금지}」 가 있다 — 이 층은 판정하지 않는다`);
  }
});

test('🔴 주석 제거기가 살아 있다 — 죽으면 위 등록층 검사가 원문 검사로 되돌아간다', () => {
  const 픽스처 = "const a = 1; /* answers->>'why_learning' 은 여기서 조회한다 */\n";
  assert.ok(!코드만(픽스처).includes("answers->>'why_learning'"),
    '주석 안 글자가 코드로 세어졌다 — 이 파일의 등록층 단언이 전부 무의미해진다');
});
