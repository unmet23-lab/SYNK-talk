/* 라디오 편성 가중 회귀 — §4-5 집단 되돌림 계산기(유호 채택 08-11). 난수 없음 = 값으로 잰다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { 표본하한, 창기본, 승격요약, 가중표, 문항가중, 추첨가중 } = require('../lib/라디오편성.js');

/* ── 승격요약 — 「오답」의 생산자. 정오는 저장값이 아니라 «고른 것 ↔ 스냅샷 정답» 파생이다. ── */

const 기준 = '2026-08-13T00:00:00.000Z';
const 행 = (덮기) => ({
  occurred_at: '2026-08-12T00:00:00.000Z',
  task_type: '라디오퀴즈',
  skill_ids: ['a'],
  payload: { selected_option: 'opt-1' },
  task_snapshot: { 정답: 'opt-1' },
  ...덮기,
});

test('승격요약 — 정오를 두 칸 대조로 파생한다(승격 행에 정오 칸이 없기 때문)', () => {
  const { 요약, 분모 } = 승격요약(
    [
      행({}),                                                   // 맞음
      행({ payload: { selected_option: 'opt-2' } }),            // 틀림
      행({ payload: { selected_option: 'opt-2' }, skill_ids: ['a', 'b'] }), // 틀림 — 두 축에 각각
    ],
    { 기준시각: 기준 },
  );
  assert.deepEqual(요약.a, { 응답: 3, 오답: 2 });
  assert.deepEqual(요약.b, { 응답: 1, 오답: 1 }, '여러 축 행이 각 축에 안 실렸다');
  assert.equal(분모.센행, 3);
});

test('승격요약 — 한 행에 같은 축이 두 번 적혀도 한 번만 센다', () => {
  const { 요약 } = 승격요약([행({ skill_ids: ['a', 'a'] })], { 기준시각: 기준 });
  assert.deepEqual(요약.a, { 응답: 1, 오답: 0 }, '중복 축이 분모를 부풀렸다 — 한 행이 한 축을 두 번 민다');
});

test('승격요약 — 못 가르는 행은 «응답»에도 안 들어간다(모름을 통과로 세지 않는다)', () => {
  const { 요약, 분모 } = 승격요약(
    [
      행({ task_snapshot: {} }),                    // 정답없음
      행({ payload: {} }),                          // 선택없음
      행({ skill_ids: [] }),                        // 축없음
      행({ task_type: '숙제' }),                    // 딴통로 — 라디오 되돌림은 라디오 행만 먹는다
      행({ occurred_at: '아무말' }),                // 시각불량
      null,                                         // 행불량
    ],
    { 기준시각: 기준 },
  );
  assert.deepEqual(요약, {}, '판정 불가 행이 분모에 섞였다 — 오답률이 조용히 기운다');
  assert.equal(분모.센행, 0);
  assert.equal(분모.받은, 6);
  assert.deepEqual(분모.뺀, { 정답없음: 1, 선택없음: 1, 축없음: 1, 딴통로: 1, 시각불량: 1, 행불량: 1 });
});

test('승격요약 — 창은 (기준-28일, 기준] 이고 미래 행은 안 센다', () => {
  const 창밖 = new Date(Date.parse(기준) - (창기본 + 1) * 86400000).toISOString();
  const 창안 = new Date(Date.parse(기준) - (창기본 - 1) * 86400000).toISOString();
  const 미래 = '2026-08-14T00:00:00.000Z';
  const { 요약, 분모 } = 승격요약(
    [행({ occurred_at: 창밖 }), 행({ occurred_at: 창안 }), 행({ occurred_at: 미래 })],
    { 기준시각: 기준 },
  );
  assert.deepEqual(요약.a, { 응답: 1, 오답: 0 });
  assert.equal(분모.뺀.창밖, 2, '시계 어긋난 미래 행이 창을 조용히 넓혔다');
});

test('승격요약 — 기준시각을 안 주면 던진다(현재 시각을 몰래 읽지 않는다)', () => {
  assert.throws(() => 승격요약([], {}), TypeError);
  assert.throws(() => 승격요약([], { 기준시각: '아무말' }), TypeError);
});

test('승격요약 의 출력이 가중표 입력과 맞물린다 — 두 사람이 모양을 따로 정하지 않았나', () => {
  const 행들 = Array.from({ length: 표본하한 }, () => 행({ payload: { selected_option: 'opt-2' } }));
  const { 요약 } = 승격요약(행들, { 기준시각: 기준 });
  assert.equal(가중표(요약).a, 2, '오답률 1.0 이 가중 2 로 안 왔다 — 요약 모양이 가중표와 어긋났다');
});

test('가중표 — 오답률이 가중이 되고, 소표본·이상 모양은 중립 1 이다', () => {
  const 표 = 가중표({
    'skill-a': { 응답: 10, 오답: 5 },     // w = 1.5
    'skill-b': { 응답: 4, 오답: 4 },      // 표본하한(5) 미달 — 극단값이어도 안 믿는다
    'skill-c': { 응답: 10, 오답: 0 },     // w = 1 (틀린 적 없음)
    'skill-d': { 응답: 10, 오답: 11 },    // 오답 > 응답 — 깨진 요약은 중립으로
    'skill-e': { 응답: '많이', 오답: 1 }, // 숫자 아님
  });
  assert.equal(표['skill-a'], 1.5);
  assert.equal(표['skill-b'], 1, `소표본이 가중을 얻었다(하한 ${표본하한})`);
  assert.equal(표['skill-c'], 1);
  assert.equal(표['skill-d'], 1);
  assert.equal(표['skill-e'], 1);
});

test('문항가중 — 여러 skill 은 평균이고, 태그 없음·모르는 skill 은 중립이다', () => {
  const 표 = { a: 2, b: 1 };
  assert.equal(문항가중({ skill_ids: ['a', 'b'] }, 표), 1.5, '평균이 아니다 — 극단 skill 이 문항을 독점한다');
  assert.equal(문항가중({ skill_ids: ['모름'] }, 표), 1);
  assert.equal(문항가중({ skill_ids: [] }, 표), 1);
  assert.equal(문항가중({}, 표), 1);
});

test('추첨가중 — 미노출 우선(재고 축)이 1차이고 가중은 후보군 안에서만 산다', () => {
  const r = 추첨가중({
    문항들: [
      { 문항id: 'q1', skill_ids: ['a'] },
      { 문항id: 'q2', skill_ids: ['a'] },
      { 문항id: 'q3', skill_ids: ['b'] },
    ],
    노출수: { q1: 3 },                       // q2·q3 은 미노출(0)
    승격요약: { a: { 응답: 10, 오답: 10 }, b: { 응답: 10, 오답: 0 } },
  });
  const 맵 = Object.fromEntries(r.map((x) => [x.문항id, x]));
  assert.equal(맵.q1.후보, false);
  assert.equal(맵.q1.가중, 0, '노출된 문항이 미노출 계층을 제치고 추첨에 남았다');
  assert.equal(맵.q2.후보, true);
  assert.equal(맵.q2.가중, 2, '약점 skill(오답률 1.0) 가중이 안 실렸다');
  assert.equal(맵.q3.가중, 1);
});

test('빈 입력은 빈 결과 — 지어내지 않는다', () => {
  assert.deepEqual(추첨가중({}), []);
  assert.deepEqual(추첨가중({ 문항들: [] }), []);
});
