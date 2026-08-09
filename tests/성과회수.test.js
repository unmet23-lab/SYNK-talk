/* 성과 회수(`lib/성과회수.js`) — **판정**을 못박는다.
 *
 * 이 파일이 지키는 것은 「함수가 돈다」가 아니라 **틀린 값이 조용히 나가지 않는다**이다.
 * 성과 회수의 실패는 예외가 아니라 «그럴듯한 숫자»로 온다 — 아직 안 온 창이 0 으로 적히면
 * 개원 첫 달의 모든 개입이 「효과 없음」으로 쌓이고, 그 오염은 소급으로 못 고친다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { 성과회수, 회수판, 부품, 회수창, 쓰는사건 } = require('../lib/성과회수.js');
const { 쓰는사건: 상태가쓰는사건 } = require('../lib/학습자상태.js');

const 기점 = Date.UTC(2026, 7, 1);
const t = (일) => new Date(기점 + 일 * 86400000).toISOString();

const 개입 = (덧 = {}) => ({
  event_id: 'iv1', event_type: 'intervention.delivered', occurred_at: t(10),
  intervention_id: 'IV-1', ...덧,
});

/* 축이 값을 내려면 배정↔제출 쌍이 필요하다(리듬축은 배정이 0이면 null 이다). */
const 배정제출 = (일) => ([
  { event_id: `a${일}`, event_type: 'task.assigned', occurred_at: t(일), due_at: t(일 + 1) },
  { event_id: `s${일}`, event_type: 'submission.created', occurred_at: t(일 + 0.5) },
]);

test('🔴 아직 안 온 창은 0 이 아니라 「미도래」다 — 그리고 언제 물으면 되는지를 낸다', () => {
  /* 이 검사가 이 파일의 존재 이유다. 0 으로 접으면 「재료가 없다」가 「효과가 없다」로 읽히고,
   * 값만 보고는 둘을 영원히 못 가른다(학습자상태의 「분모 0 은 null」과 같은 축). */
  const r = 성과회수(개입(), [...배정제출(8), ...배정제출(11)], { 기준시각: t(12) });

  assert.equal(r.성과['1일'].상태, '측정', '개입 2일 뒤인데 1일 창을 못 쟀다');
  assert.equal(r.성과['7일'].상태, '미도래');
  assert.equal(r.성과['30일'].상태, '미도래');
  assert.equal(r.성과['7일'].잴수있는때, t(17), '다시 물을 시각이 없으면 호출부가 매번 전량을 되돌린다');

  for (const 창 of ['7일', '30일']) {
    assert.ok(!('이전' in r.성과[창]) && !('이후' in r.성과[창]),
      `${창}: 미도래인데 값 칸이 있다 — 빈 값은 곧 0 으로 읽힌다`);
  }
});

test('🔴 관측 짝은 `parent_event_id` 로 잇는다 — `intervention_id` 로 이으면 영원히 0건이다', () => {
  /* 계약 c9: *"대상은 이미 있는 이름으로 가리킨다(`parent_event_id` = 무엇을 봤나)"*.
   * `intervention_id` 는 개입 행 «자신»의 출처 칸이라 관측 행에는 안 실린다. */
  const 옳게 = { event_id: 'v1', event_type: 'content.viewed', occurred_at: t(10.5), parent_event_id: 'iv1' };
  assert.equal(성과회수(개입(), [옳게], { 기준시각: t(40) }).관측.닿음, true);

  // 고리를 intervention_id 로 바꾸면 — 잡아야 한다(안 잡으면 검사가 헛돈다).
  const 틀리게 = { event_id: 'v1', event_type: 'content.viewed', occurred_at: t(10.5), intervention_id: 'IV-1' };
  const r = 성과회수(개입(), [틀리게], { 기준시각: t(40) });
  assert.equal(r.관측.닿음, false, '`intervention_id` 만 든 관측 행을 짝으로 셌다 — 고리가 계약과 갈렸다');
});

test('🔴 개입 «이전»의 열람은 이 개입의 관측이 아니다', () => {
  /* 같은 행이 다른 개입의 짝일 수 있다. 시각을 안 자르면 「배달 전에 이미 봤다」가
   * 「빨리 반응했다」로 뒤집혀 적히고, 지연분은 음수가 된다. */
  const 이전열람 = { event_id: 'v0', event_type: 'content.viewed', occurred_at: t(9), parent_event_id: 'iv1' };
  const r = 성과회수(개입(), [이전열람], { 기준시각: t(40) });
  assert.equal(r.관측.닿음, false, '개입 이전의 열람을 관측 짝으로 셌다');
});

test('닿음:false 는 「안 봤다」가 아니라 「기록이 없다」다 — 사유를 함께 낸다', () => {
  /* 관측 생산자가 아직 한 화면뿐이라(`lib/오늘과제.js`) 화면을 안 거친 배달은 원리상 0건이다.
   * 사유가 없으면 미구현이 「학생이 무시했다」로 읽힌다. */
  const r = 성과회수(개입(), [], { 기준시각: t(40) });
  assert.equal(r.관측.닿음, false);
  assert.match(r.관측.사유, /미배선|미열람/, '구분할 사유가 없다');
});

test('🔴 기준시각이 없으면 던진다 — 기본값 「지금」은 미도래 판정을 조용히 어긋나게 한다', () => {
  assert.throws(() => 성과회수(개입(), [], {}), /기준시각/);
  assert.throws(() => 성과회수(개입(), [], undefined), /기준시각/);
});

test('🔴 닻이 intervention.delivered 가 아니면 던진다', () => {
  /* 다른 사건을 닻으로 받으면 붙일 성과가 «없는» 것이 「효과 0」으로 쌓인다. */
  assert.throws(() => 성과회수({ event_id: 'x', event_type: 'submission.created', occurred_at: t(1) }, [], { 기준시각: t(40) }),
    /intervention\.delivered/);
  assert.throws(() => 성과회수(null, [], { 기준시각: t(40) }), /intervention\.delivered/);
});

test('🔴 증감 칸이 없다 — 창 길이가 다른 두 값을 빼면 뜻이 없다', () => {
  /* `이전` 은 30일 추세이고 `이후` 는 N일만 본다. `증감` 칸을 하나라도 내면 읽는 쪽은 반드시
   * 뺀다 — 그래서 «내지 않는 것»이 설계다. 칸이 생기면 이 검사가 빨개진다. */
  const r = 성과회수(개입(), [...배정제출(8), ...배정제출(11)], { 기준시각: t(60) });
  const 한창 = r.성과['7일'];
  assert.equal(한창.상태, '측정');
  assert.deepEqual(Object.keys(한창).sort(), ['상태', '이전', '이후'].sort(),
    '창 결과에 칸이 늘었다 — 증감·점수 같은 파생을 여기서 내지 않는다');
  assert.equal(한창.이전.창일수, 30, '기준선은 30일 추세다');
  assert.equal(한창.이후.창일수, 7, '이후는 그 창 길이만 본다');
});

test('🔴 이후 창은 개입 «전» 사건을 안 본다 — 안 자르면 「1일 성과」가 구조적으로 0 이 된다', () => {
  /* 같은 30일 창으로 양쪽을 재면 하루치 새 데이터가 30일 추세를 거의 안 움직여 민감도가
   * 원리상 없다. 그래서 이후는 창을 N일로 좁힌다 — 그 좁힘이 실제로 도는지 여기서 잰다. */
  const 전만 = [...배정제출(8)];               // 개입(10일) 전에만 활동
  const r = 성과회수(개입(), 전만, { 기준시각: t(60) });
  assert.equal(r.성과['1일'].상태, '표본0', '개입 뒤 활동이 0인데 이후 창이 값을 냈다 — 창이 안 잘렸다');
  assert.ok(r.성과['1일'].이전.표본충분도 > 0, '기준선까지 비었다면 픽스처가 아무것도 안 재고 있다');
});

test('쓰는사건은 학습자상태의 것을 **파생**한다 — 손으로 다시 적으면 축이 조용히 죽는다', () => {
  for (const et of 상태가쓰는사건) {
    assert.ok(쓰는사건.includes(et), `${et} 가 빠졌다 — 질의가 안 실어 주면 이후 창이 늘 표본0 이다`);
  }
  for (const et of ['intervention.delivered', 'content.viewed']) {
    assert.ok(쓰는사건.includes(et), `${et} 가 빠졌다`);
  }
});

test('판·부품·창은 값으로 고정돼 있다 — 도달 장부가 이 낱말을 원문에서 찾는다', () => {
  assert.equal(부품, 'AI 게이트웨이',
    '부품 문자열이 바뀌면 `이벤트검증.낡은도달` 이 이 파일을 낡은 지목으로 잡는다');
  assert.match(회수판, /^성과회수\.v\d+$/);
  assert.deepEqual([...회수창], [1, 7, 30], '창을 바꿨으면 회수판을 올린다(코어엔진 §10 의 눈금)');
});
