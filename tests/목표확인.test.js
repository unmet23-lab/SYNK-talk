/* 목표 왕복 회귀(교실 수집 ② · c14) — 판정·카드·사건 조립을 행동으로 못박는다.
 *   설계(유호 확정 08-31 「웅 그대로 가」 · 카피 08-31 「이대로 확정」 · 정본 = appsscript
 *   docs/교실수집_목표왕복_설계_v1.md): 새 사건 · 하루 1회 · 평일만 · 「아직」에 벌 0 · 되싣기 강제.
 * 🔑 성향확인.test.js 와 같은 뼈대다 — 두 카드가 같은 규율로 서는 것이 화면의 약속이라
 *   회귀도 같은 자를 써야 「한쪽만 조용히 달라지는」 날을 잡는다. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 판정판, 요일번호, 평일인가, 목표카드, 목표사건 } = require('../lib/목표확인.js');
const { 목표문구, 목표반응, 답라벨, 카피확정 } = require('../contents/문구_목표확인.js');
const { 검증 } = require('../lib/이벤트검증.js');

const 계약 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '계약', '수집_교정_계약.json'), 'utf8'));
const 이력 = (덧 = {}) => ({ 오늘답함: false, ...덧 });
const 키들 = { correlation_id: 'c0ffee00-0000-4000-8000-000000000e14', idempotency_key: 'k-목표-1' };
/* 실측 달력(2026): 08-31 월 · 09-04 금 · 09-05 토 · 09-06 일. 리터럴로 둔다 —
 * 계산으로 기대값을 만들면 같은 버그가 양쪽에 들어 검사가 자기 자신을 통과시킨다. */
const 월요일 = '2026-08-31';
const 토요일 = '2026-09-05';

test('카피 확정 표식 — 유호 확정 08-31 · 임시로 되돌아오면 카피가 낡은 것이다', () => {
  assert.equal(카피확정, true);
});

test('요일번호 — 월1~일7(엔진 F열과 같은 눈금) · 못 읽으면 null 이지 0 이 아니다', () => {
  assert.equal(요일번호(월요일), 1);
  assert.equal(요일번호('2026-09-04'), 5);
  assert.equal(요일번호(토요일), 6);
  assert.equal(요일번호('2026-09-06'), 7);
  assert.equal(요일번호('아무거나'), null, '못 읽은 것을 요일로 접으면 주말에 카드가 뜬다');
  assert.equal(평일인가(토요일), false);
  assert.equal(평일인가(월요일), true);
});

test('목표카드 — 하루 1회 · 평일만 · 문구 결속 · class_date 되싣기 재료', () => {
  const 카드 = 목표카드(이력(), 월요일);
  assert.ok(카드, '평일·미답인데 카드가 안 섰다');
  assert.equal(카드.class_date, 월요일, '어느 날의 목표였나 — 이 값이 사건으로 그대로 간다');
  assert.equal(카드.card_version, 판정판);
  assert.deepEqual(카드.문장, [목표문구.오늘목표.ko], '학생이 볼 문장이 카피 정본과 다르다');
  assert.deepEqual(카드.답라벨, 답라벨);

  assert.equal(목표카드(이력({ 오늘답함: true }), 월요일), null, '오늘 답했는데 또 물었다 — 하루 1회가 깨졌다');
  assert.equal(목표카드(이력(), 토요일), null, '주말엔 아침 서클이 없다 — 없던 목표를 물으면 그 왕복은 거짓이다');
  assert.equal(목표카드(null, 월요일), null, '이력을 모르면 안 낸다(모름을 「안 답함」으로 접지 않는다)');
});

test('두 단추는 같은 무게다 — 「아직」이 벌이 아니라는 것이 값·문구 둘 다에 있다', () => {
  assert.deepEqual(Object.keys(답라벨), ['해냈다', '아직'], '값록(계약 「목표응답」)과 라벨 키가 같아야 한다');
  assert.deepEqual(계약.learning_events.값목록.목표응답, ['해냈다', '아직']);
  for (const 답 of ['해냈다', '아직']) {
    const 줄 = 목표반응(답);
    assert.ok(줄.length && 줄[0].length > 0, `${답} 에 즉시 반응이 없다 — 반영이 안 보이면 설문이다`);
  }
  const 아직 = 목표반응('아직')[0];
  for (const 벌말 of ['안 했', '못 했', '아쉽', '유감', '실패']) {
    assert.ok(!아직.includes(벌말), `「아직」 반응에 나무라는 말이 있다: ${벌말}`);
  }
  assert.deepEqual(목표반응('모르는값'), [], '값록 밖은 빈 배열 — 지어낸 반응을 내지 않는다');
});

test('목표사건 — 카드 되싣기 강제 · 값록 밖 거부 · 검증기 통과', () => {
  const 카드 = 목표카드(이력(), 월요일);
  const 사건 = 목표사건(카드, '해냈다', 키들);
  assert.equal(사건.event_type, 'goal.responded');
  assert.equal(사건.payload.class_date, 월요일, '앱이 날짜를 지어내면 「어느 날의 목표였나」가 갈린다');
  assert.equal(사건.payload.card_version, 판정판);
  assert.equal(사건.payload.ver, 1, 'ver 없는 payload 는 서버(events)가 거절한다');
  assert.equal(사건.level_snapshot, null, '이 카드엔 급수가 안 흐른다 — null 이 유일하게 정확한 값이다');
  assert.ok('level_snapshot' in 사건, '키 자체는 있어야 「모른다」와 「앱이 빠뜨렸다」가 갈린다');

  assert.equal(목표사건(카드, '했음', 키들), null, '값록 밖 답을 조립했다');
  assert.equal(목표사건(null, '해냈다', 키들), null, '카드 없이 사건을 지어냈다');
  assert.equal(목표사건(카드, '해냈다', { correlation_id: 'x' }), null, '멱등키 없이 내보내면 중복이 그대로 쌓인다');

  const r = 검증(사건, 계약);
  assert.equal(r.ok, true, `검증기가 막았다: ${JSON.stringify(r.문제 ?? r)}`);
});

test('필수 셋은 하나씩 빠뜨리면 전부 잡힌다 — 반쪽 왕복은 학습 재료가 못 된다', () => {
  const 카드 = 목표카드(이력(), 월요일);
  for (const 칸 of ['response', 'class_date', 'card_version']) {
    const 사건 = 목표사건(카드, '아직', 키들);
    delete 사건.payload[칸];
    assert.equal(검증(사건, 계약).ok, false, `payload.${칸} 가 없는데 통과했다`);
  }
});
