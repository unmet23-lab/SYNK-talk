/* 라디오 편성 가중 회귀 — §4-5 집단 되돌림 계산기(유호 채택 08-11). 난수 없음 = 값으로 잰다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { 표본하한, 가중표, 문항가중, 추첨가중 } = require('../lib/라디오편성.js');

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
