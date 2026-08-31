'use strict';
/**
 * 저작 신뢰 회귀 — 철학 Ⅱ-9 의 엔진 쪽 문 (`lib/저작신뢰.js` · 설계 = `docs/저작신뢰_설계_v1.md`).
 *
 * 이 파일이 지키는 것은 «잡아내는 힘»이 아니라 **안 잡는 힘**이다. 급소 넷:
 *   ① **음성 제출이 승격 통로에서 죽지 않는다** — `못잼` 을 보류로 접으면 학생 앱 제출 대부분이
 *      훈련 후보에서 사라진다. 잰 것이 있고 그것이 덩어리인 행 하나만 막는다.
 *   ② **짧은 답의 받아쓰기가 안 걸린다** — 조건 둘(크기·비율)이 **함께** 걸려야 한다.
 *      하나만 쓰면 「네, 저는 학교에 가요」 한 번에 말한 학생이 매일 걸린다.
 *   ③ **「안 쟀다」가 「깨끗하다」로 안 바뀐다** — `못잼` 은 통과가 아니라 모름이다.
 *   ④ **사람이 누른 승격 의사를 기계가 덮지 않는다**(소스층) — 덮으면 「누르려 했다」가 증발한다.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { 저작판정, 승격보류인가, 등급들, 덩어리하한, 지배비율, 보류문구 } = require('../lib/저작신뢰.js');
const { 코드만, 파일소스, 구간 } = require('./lib/소스검사.js');

/** 온전한 `compose_meta` 한 벌 — 네 칸이 다 정수여야 «잰 것»이다(`lib/작성과정.js` 규칙 1). */
const 계측 = (덩어리, 덧 = {}) => ({
  first_keystroke_ms: 3000,
  total_compose_ms: 40000,
  revision_count: 2,
  input_burst_max: 덩어리,
  ...덧,
});

/* ─────────────── ① 못잼 — 모름은 통과가 아니다 ─────────────── */

test('🔴 계측이 없으면 «못잼» — 음성 제출은 잴 것이 없다', () => {
  for (const m of [null, undefined, {}, '문자열', []]) {
    const p = 저작판정({ compose_meta: m, 본문길이: 100 });
    assert.equal(p.등급, 등급들.못잼, JSON.stringify(m));
    assert.equal(p.덩어리비율, null, '못 잰 자리에 비율을 지어내지 않는다');
  }
});

test('네 칸 중 하나만 빠져도 «못잼» — 반쪽 객체를 잰 것으로 읽지 않는다', () => {
  const 온전 = 계측(10);
  for (const 칸 of Object.keys(온전)) {
    const 반쪽 = { ...온전 };
    delete 반쪽[칸];
    assert.equal(저작판정({ compose_meta: 반쪽, 본문길이: 100 }).등급, 등급들.못잼, 칸);
  }
});

test('🔴 본문 길이를 모르면 «못잼» — 0 으로 접으면 나눗셈이 모든 행을 덩어리로 만든다', () => {
  for (const 길이 of [0, null, undefined, NaN, -5, '긴글']) {
    assert.equal(저작판정({ compose_meta: 계측(50), 본문길이: 길이 }).등급, 등급들.못잼, String(길이));
  }
});

test('🔴 «못잼» 은 훈련 승격을 보류하지 않는다 — 접으면 음성 제출이 통째로 후보에서 사라진다', () => {
  assert.equal(승격보류인가(저작판정({ compose_meta: null, 본문길이: 100 })), false);
});

/* ─────────────── ② 손으로 — 안 잡는 힘 ─────────────── */

test('타건으로 쓴 글은 «손으로»', () => {
  const p = 저작판정({ compose_meta: 계측(6), 본문길이: 120 });
  assert.equal(p.등급, 등급들.손으로);
  assert.equal(승격보류인가(p), false);
});

test('🔴 짧은 답의 받아쓰기 한 어절이 안 걸린다 — 비율만 보면 매일 걸린다', () => {
  /* 18자 답에 12자가 한 번에: 비율 0.67 로 지배선을 넘지만 크기가 하한 아래다. */
  const p = 저작판정({ compose_meta: 계측(12), 본문길이: 18 });
  assert.ok(12 / 18 >= 지배비율, '이 표본은 비율 조건을 «넘어야» 시험이 뜻을 갖는다');
  assert.ok(12 < 덩어리하한);
  assert.equal(p.등급, 등급들.손으로);
});

test('🔴 긴 글에 한 문장만 받아쓰기 한 것도 안 걸린다 — 크기만 보면 걸린다', () => {
  /* 120자 글에 30자가 한 번에: 크기는 하한을 넘지만 비율이 낮다. */
  const p = 저작판정({ compose_meta: 계측(30), 본문길이: 120 });
  assert.ok(30 >= 덩어리하한, '이 표본은 크기 조건을 «넘어야» 시험이 뜻을 갖는다');
  assert.ok(30 / 120 < 지배비율);
  assert.equal(p.등급, 등급들.손으로);
});

/* ─────────────── ③ 덩어리 — 구멍이 실제로 있는 그 자리 ─────────────── */

test('🔴 통째로 한 번에 들어온 글은 «덩어리» — 그리고 훈련 승격만 보류된다', () => {
  const p = 저작판정({
    compose_meta: 계측(118, { revision_count: 0, total_compose_ms: 4000, first_keystroke_ms: 1200 }),
    본문길이: 120,
  });
  assert.equal(p.등급, 등급들.덩어리);
  assert.equal(p.덩어리비율, 0.98);
  assert.equal(승격보류인가(p), true);
});

test('비율이 1 을 넘어도 안 자른다 — 자르면 「많이 지운 학생」과 「통째로 넣은 학생」이 같은 값이 된다', () => {
  const p = 저작판정({ compose_meta: 계측(200), 본문길이: 100 });
  assert.equal(p.덩어리비율, 2);
  assert.equal(p.등급, 등급들.덩어리);
});

test('경계 — 두 조건은 «각각» 문턱에서 갈린다(임계를 조회 시점에 두는 근거)', () => {
  const 딱 = 저작판정({ compose_meta: 계측(덩어리하한), 본문길이: Math.floor(덩어리하한 / 지배비율) });
  assert.equal(딱.등급, 등급들.덩어리, '하한·지배선을 «둘 다» 만족하면 덩어리다');
  const 하나아래 = 저작판정({ compose_meta: 계측(덩어리하한 - 1), 본문길이: 덩어리하한 - 1 });
  assert.equal(하나아래.등급, 등급들.손으로, '크기가 하한 아래면 비율이 1 이어도 안 걸린다');
});

/* ─────────────── ④ 낙인 금지 — 무엇을 «안» 하는가 ─────────────── */

test('🚫 등급 이름이 원인을 말하지 않는다 — 「AI」·「부정」·「의심」을 안 쓴다', () => {
  const 금칙 = /AI|부정|의심|표절|베낌|치팅/i;
  for (const v of Object.values(등급들)) assert.doesNotMatch(v, 금칙, v);
  assert.doesNotMatch(보류문구, 금칙, '검수자에게 보이는 문구도 원인을 단정하지 않는다');
});

test('🔴 보류하는 것은 훈련 승격 «하나»다 — 판정이 다른 축을 안 만든다', () => {
  const p = 저작판정({ compose_meta: 계측(118), 본문길이: 120 });
  assert.deepEqual(Object.keys(p).sort(), ['덩어리비율', '등급', '잰것'].sort(),
    '산출이 늘면 그만큼 「이 값으로 무엇을 더 할까」가 열린다 — 늘리려면 설계부터 고친다');
});

/* ─────────────── ⑤ 배선 — 사람이 누른 것을 기계가 덮지 않는다(소스층) ─────────────── */

const 배선 = 파일소스(path.resolve(__dirname, '..', 'supabase', 'functions', 'review', 'index.ts'));

test('🔴 `promotion_intent` 에는 사람이 누른 값이 그대로 들어간다 — 기계가 덮으면 의사가 증발한다', () => {
  const 코드 = 코드만(배선);
  assert.match(코드, /promotion_intent[\s\S]{0,600}\$\{q\.promote\}/,
    'insert 가 q.promote 가 아닌 값을 쓴다 — 사람이 누른 의사가 행에서 사라진다');
  assert.doesNotMatch(코드, /promote\s*&&\s*!승격보류인가|q\.promote\s*&&\s*!/,
    '승격 의사를 저작 판정으로 접고 있다 — 그건 응답으로 «알리는» 자리지 덮는 자리가 아니다');
});

test('승인 응답이 저작 등급을 싣는다 — 소비자가 0 이면 이 판정은 아무 데도 안 닿는다', () => {
  const 코드 = 코드만(배선);
  assert.match(코드, /authorship:\s*\{\s*grade:/, '응답에 authorship 이 없다');
  assert.match(코드, /q\.promote\s*&&\s*승격보류인가\(저작\)/,
    '보류 문구가 «승격을 눌렀고 덩어리인» 그 조합에서만 뜨지 않는다 — 아니면 소음이 된다');
});

test('🔴 재료를 새 열이 아니라 «이미 있는 자리»에서 가져온다 — 스키마 개정 0', () => {
  const 질의 = 구간(배선, 'const [재료] = await tx`', '`;');
  assert.match(질의, /s\.body_original/, '본문 길이의 재료가 질의에 없다');
  assert.match(질의, /payload->'compose_meta'/, 'compose_meta 를 사건 payload 에서 안 읽는다');
});

/* ─────────────── ⑥ 통로 — 병기 글의 계측이 실제로 흐르는가 (08-26 신설) ───────────────
 * 🔴 이 절이 있는 까닭: 말하기 ③의 «텍스트 병기»는 선택 입력이라 가벼워 보이는데, 교정 엔진이
 *   `coalesce(body_original, transcript)` 로 읽어 **병기 글이 전사를 이긴다**(functions/correct).
 *   즉 여기 들어온 글이 그날의 코퍼스 행이 되고 검수·훈련 승격이 그 위에 앉는다 — 자유 서술
 *   통로 중 유일하게 계측이 없던 자리였다. */
const { 항목추가: 항목추가2 } = require('../lib/제출로그.js');
const { 제출사건: 제출사건2, 화면과제: 화면과제2 } = require('../lib/오늘과제.js');
const { 한벌인가 } = require('../lib/작성과정.js');

const 한벌 = { first_keystroke_ms: 2000, total_compose_ms: 9000, revision_count: 1, input_burst_max: 7 };
const 폴백2 = { id: 'intro', 본문: '안녕하세요.', 핵심문장: '안녕하세요.', 질문: '이름이 뭐예요?' };
const 서버항목2 = () => ({
  task_id: 't1', task_ref: 'task-2026-08-26',
  task_snapshot: {
    ver: 1, 날짜: '2026-08-26',
    호흡: [
      { 차례: 1, 무엇: '듣기' },
      { 차례: 2, 무엇: '따라말하기', task_format: '낭독', 문장: '저는 학교에 가요.' },
      { 차례: 3, 무엇: '답하기', task_format: '자유발화', 프롬프트: '어떻게 가요?' },
    ],
  },
  level_snapshot: 'Lv3', goal_snapshot: '유학', intervention: null,
});

const 항목입력 = () => ({
  date: '2026-08-26', step: '답하기', status: 'submitted', duration_ms: 1200, hesitation_ms: 0,
  spoke: true, threshold_db: -40, text: '저는 버스로 가요.', audio: null, prompt_id: 'p1',
  created_at: '2026-08-26T01:00:00.000Z', capture_app: null,
  correlation_id: '11111111-1111-4111-8111-111111111111', replayed_at: null,
});

const 봉투내기 = (compose_meta) => {
  const { 제출재료 } = 화면과제2(서버항목2(), 폴백2);
  const { 항목 } = 항목추가2([], { ...항목입력(), task_meta: 제출재료, compose_meta });
  return { 항목, 사건: 제출사건2(항목, 'voice/a/b.m4a') };
};

test('🔴 항목이 계측을 «들고 간다» — 화면 ref 에 두면 사흘 밀린 항목의 과정이 사라진다', () => {
  const { 항목 } = 봉투내기(한벌);
  assert.deepEqual(항목.compose_meta, 한벌, '오프라인 큐 규율 — replayed_at·선택과 같은 자리');
});

test('한 벌이면 payload 에 실린다 — 저작 판정의 재료가 서버에 닿는 유일한 길', () => {
  const { 사건 } = 봉투내기(한벌);
  assert.deepEqual(사건.payload.compose_meta, 한벌);
  assert.equal(사건.payload.attempt_no, 1, '기존 칸은 그대로다');
});

test('🔴 반쪽·없음이면 키 자체가 없다 — 「안 쟀다」가 「0회였다」로 안 바뀐다', () => {
  for (const m of [null, undefined, { input_burst_max: 7 }, { ...한벌, 군더더기: 1 }]) {
    const { 사건 } = 봉투내기(m);
    assert.ok(!('compose_meta' in 사건.payload), JSON.stringify(m));
    assert.equal(한벌인가(m), false, '한벌인가 판정과 봉투가 같은 답을 내야 한다');
  }
});

test('🔴 화면은 «글이 실릴 때만» 계측을 싣는다 — 안 쓴 학생에게 「즉답」을 적지 않는다(소스층)', () => {
  const 화면 = 파일소스(path.resolve(__dirname, '..', 'src', '말하기화면.js'));
  const 코드 = 코드만(화면);
  assert.match(코드, /compose_meta:\s*텍스트병기\s*&&\s*병기글ref\.current\.trim\(\)\s*\?\s*계측payload\(/,
    '병기 글이 비어도 계측이 실린다 — 그러면 안 쓴 학생이 「0초에 0번 고쳤다」로 남는다'
    + ' (병기글은 ref다 — controlled로 되돌리면 한글 조합이 깨져 계측이 렌더 결함을 잰다)');
  assert.match(코드, /if\s*\(!병기계측\.current\)\s*병기계측\.current = 계측시작\(/,
    '계측이 첫 글자에서 시작하지 않는다 — 안 쓰는 학생의 대기가 「미룸」으로 잡힌다');
});
