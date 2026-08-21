/* 성과 회수(`lib/성과회수.js`) — **판정**을 못박는다.
 *
 * 이 파일이 지키는 것은 「함수가 돈다」가 아니라 **틀린 값이 조용히 나가지 않는다**이다.
 * 성과 회수의 실패는 예외가 아니라 «그럴듯한 숫자»로 온다 — 아직 안 온 창이 0 으로 적히면
 * 개원 첫 달의 모든 개입이 「효과 없음」으로 쌓이고, 그 오염은 소급으로 못 고친다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { 성과회수, 회수요약, 회수판, 부품, 회수창, 쓰는사건 } = require('../lib/성과회수.js');
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

test('🔴 미도래 경계 — 창이 «정확히» 닫히는 순간은 측정이다(변이 ⑧이 드러낸 눈먼 자리)', () => {
  /* 창 [개입때, 개입때+N일] 은 개입때+N일 에 **완성된다** — 그 순간을 미도래로 접으면 매일
   * 도는 배치가 만 하루를 통째로 놓치고, 놓친 창은 다음 날 「N+1일 창」이 되어 눈금이 어긋난다.
   * 부등호 한 글자라 diff 로는 안 보이고 값으로만 드러난다. */
  const 사건들 = [...배정제출(8), ...배정제출(10)];
  const 정각 = 성과회수(개입(), 사건들, { 기준시각: t(11) });      // 개입 t(10) + 1일
  assert.equal(정각.성과['1일'].상태, '측정', '창이 닫힌 순간을 미도래로 접었다 — 하루가 통째로 샌다');

  const 직전 = 성과회수(개입(), 사건들, { 기준시각: new Date(기점 + 11 * 86400000 - 1).toISOString() });
  assert.equal(직전.성과['1일'].상태, '미도래', '1ms 모자란데 측정이라고 했다 — 경계가 반대로 샌다');
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

/* ── 회수요약 — 배치가 매일 부르는 자리(2026-08-12) ────────────────────────────────
 * 이 함수가 서기 전까지 회수의 호출부는 손 CLI 하나뿐이었다. 아래 검사가 지키는 것은
 * 「접힌 숫자가 원인을 안 지운다」 — 합계 하나로 접으면 미배선과 무시가 같은 값이 된다. */

const 관측 = (부모, 일) => ({ event_id: `v${부모}`, event_type: 'content.viewed', occurred_at: t(일), parent_event_id: 부모 });
const 개입행 = (id, 일) => ({ event_id: id, event_type: 'intervention.delivered', occurred_at: t(일), intervention_id: `IV-${id}` });

test('회수요약 — 개입 여럿을 접되 «닿음»과 «고리없음»을 따로 센다', () => {
  /* 고리없음(=event_id 가 없어 관측을 이을 수 없는 개입)을 「안 닿음」에 합치면 **미배선이
   * 「학생이 무시했다」로 읽힌다.** 그 오독은 값만 보고는 못 가른다. */
  const 사건들 = [
    개입행('i1', 10), 관측('i1', 10.2),   // 닿음
    개입행('i2', 11),                      // 안 닿음(관측 행 없음)
    { event_type: 'intervention.delivered', occurred_at: t(12), intervention_id: 'IV-x' }, // 고리없음
    ...배정제출(9),
  ];
  const r = 회수요약(사건들, { 기준시각: t(13) });

  assert.equal(r.개입, 3, '닻 사건을 다 못 셌다');
  assert.equal(r.닿음, 1);
  assert.equal(r.고리없음, 1, 'event_id 없는 개입을 「안 닿음」에 합쳤다 — 미배선이 무시로 읽힌다');
  /* 분모는 «잴 수 있는 것»이다 — 고리없음을 분모에 넣으면 배선 결함이 학생 탓으로 보인다. */
  assert.equal(r.연결률, 0.5, '분모가 «잴 수 있는 개입»(3-1=2)이 아니다');
});

test('🔴 개입이 0건이면 연결률은 0% 가 아니라 `null` 이다 — 사유를 함께 낸다', () => {
  /* 0% 로 접으면 «배달이 아직 없는 날»과 «나갔는데 아무도 안 본 날»이 같은 값이 되고,
   * 그 둘은 처방이 정반대다(하나는 배치를 고치고 하나는 화면을 고친다). */
  const r = 회수요약([...배정제출(9)], { 기준시각: t(13) });
  assert.equal(r.개입, 0);
  assert.equal(r.연결률, null, '분모 0 을 0% 로 접었다');
  assert.match(r.사유, /개입 행이 0건/, '왜 null 인지를 안 남기면 읽는 쪽이 0 으로 옮겨 적는다');
});

test('🔴 창별로 «미도래»와 «측정»을 갈라 센다 — 합치면 개원 첫 달이 「효과 0」이 된다', () => {
  const r = 회수요약([개입행('i1', 10), 관측('i1', 10.2), ...배정제출(9), ...배정제출(11)], { 기준시각: t(12) });
  assert.equal(r.창별['1일'].미도래, 0, '개입 2일 뒤인데 1일 창이 미도래로 남았다');
  assert.equal(r.창별['7일'].미도래, 1, '아직 안 온 창을 측정으로 셌다');
  assert.equal(r.창별['30일'].미도래, 1);
  assert.equal(r.창별['1일'].측정 + r.창별['1일'].표본0, 1, '1일 창이 어느 칸에도 안 세어졌다');
});

test('🔴 기준시각이 없으면 던진다 — 배치가 「지금」을 암묵으로 쓰면 과거 재계산이 오염된다', () => {
  assert.throws(() => 회수요약([], {}), /기준시각/);
  assert.throws(() => 회수요약([]), /기준시각/);
});

/* ── 기술 축(#7 · v2) — 겨냥 skill_ids × 후속 correction.* «닿았나» ── */
const 교정관측 = (iid, 일, 종류 = 'correction.viewed') => ({
  event_id: `co-${iid}-${일}`, event_type: 종류, occurred_at: t(일),
  correction_id: `C-${iid}`, assigned_intervention_id: `IV-${iid}`,
});

test('기술 칸 — 겨냥이 실린 개입만 분모다(E3) · 후속 correction.* 을 intervention 고리로 잇는다', () => {
  const 겨냥개입 = { ...개입행('g1', 10), skill_ids: ['skill-a', 'skill-b'] };
  const r = 성과회수(겨냥개입, [겨냥개입, 교정관측('g1', 11), 교정관측('g1', 12, 'correction.responded')],
    { 기준시각: t(13) });
  assert.deepEqual(r.기술.겨냥, ['skill-a', 'skill-b']);
  assert.equal(r.기술.관측수, 2, '같은 배정의 교정 관측은 전부 센다(F1 — 고르지 않는 것이 규칙)');
  assert.deepEqual(r.기술.관측.map((o) => o.event_type),
    ['correction.viewed', 'correction.responded']);

  const 폴백개입 = { ...개입행('g2', 10), skill_ids: [] };
  const r2 = 성과회수(폴백개입, [폴백개입], { 기준시각: t(13) });
  assert.equal(r2.기술.겨냥, null, '폴백 행(빈 배열)은 겨냥이 아니다 — E3');
  assert.match(r2.기술.사유, /E3/);
});

test('기술 칸 — 개입 «이전» 교정·남의 개입 교정은 안 센다 · 관측 0 은 사유가 든다', () => {
  const 겨냥개입 = { ...개입행('g3', 10), skill_ids: ['skill-a'] };
  const r = 성과회수(겨냥개입,
    [겨냥개입, 교정관측('g3', 9.5), 교정관측('다른개입', 11)], { 기준시각: t(13) });
  assert.equal(r.기술.관측수, 0, '이전 교정 또는 남의 고리가 이 개입의 후속으로 세어졌다');
  assert.match(r.기술.사유, /못 가른다/, '교정 미착과 미열람을 이 층에서 단정하면 거짓 경보다');
});

test('회수요약 기술 집계 — 겨냥개입(분모)·관측있음·관측수를 따로 낸다', () => {
  const a = { ...개입행('k1', 10), skill_ids: ['skill-a'] };
  const b = { ...개입행('k2', 10), skill_ids: ['skill-b'] };
  const c = 개입행('k3', 10);   // 겨냥 없음(라이브 경로) — 분모 밖
  const r = 회수요약([a, b, c, 교정관측('k1', 11)], { 기준시각: t(13) });
  assert.deepEqual(r.기술, { 겨냥개입: 2, 관측있음: 1, 관측수: 1 });
  assert.match(r.회수판, /^성과회수\.v2$/, '반환 모양이 늘었으면 판이 올라야 소급 대조가 선다');
});
