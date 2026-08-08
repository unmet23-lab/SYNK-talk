'use strict';
/**
 * 「어제의 나」 순수 로직 회귀 (P0 §5 S1-11 · C0 §4-3 ③).
 *
 * 화면(`src/어제의나.js`)은 react-native 를 끌고 와 node 가 못 연다 — 그래서 판정은 `lib/견줌.js`
 * 에 있고 여기서 잰다. 화면이 실제로 그려지는지는 다른 층이다(`tests/화면구문.test.js`).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { 견줌, 늘어난말 } = require('../lib/견줌.js');

/** 서버 응답 봉투 그대로의 모양(`GET /v1/progress`). */
const 봉투 = (today, yesterday) => ({
  contract_ver: 'c10', ok: true, date: '2026-08-09', next_cursor: null,
  data: [{ today, yesterday }],
});
const 하루 = (제출, 재시도, 고리) => ({
  submission_count: 제출, retry_count: 재시도, correction_retry: 고리,
});

test('첫날은 빈 배열로 온다 — 화면을 아예 안 띄운다', () => {
  assert.equal(견줌({ ok: true, date: '2026-08-09', data: [] }), null);
  assert.equal(견줌({}), null, '응답이 망가져도 화면이 죽지 않는다');
  assert.equal(견줌(null), null);
});

test('🔴 「어제 0」은 첫날이 아니다 — 참이고 보여줄 값이다', () => {
  const v = 견줌(봉투(하루(1, 0, false), 하루(0, 0, false)));
  assert.notEqual(v, null, '어제 아무것도 안 낸 학생을 첫날로 접으면 동기가 통째로 사라진다');
  assert.deepEqual(v.낸것, { 오늘: 1, 어제: 0, 늘었나: true });
  assert.equal(늘어난말(v), '어제보다 1개 더 냈어요.');
});

test('같으면 늘어난 것이 아니다 (엄격히 클 때만)', () => {
  const v = 견줌(봉투(하루(2, 1, false), 하루(2, 1, false)));
  assert.equal(v.낸것.늘었나, false);
  assert.equal(v.다시말한것.늘었나, false);
  assert.equal(늘어난말(v), null);
});

test('🚫 줄어도 숫자는 그대로 내고, 말은 안 붙인다', () => {
  const v = 견줌(봉투(하루(1, 0, false), 하루(3, 2, false)));
  assert.deepEqual(v.낸것, { 오늘: 1, 어제: 3, 늘었나: false }, '감추면 그 화면을 못 믿는다');
  assert.equal(늘어난말(v), null, '「어제보다 적어요」는 동기가 아니라 평가다');
});

test('🔴 교정 재발화는 bool 그대로 — 숫자로 접지 않는다 (유일한 결과 변수)', () => {
  const v = 견줌(봉투(하루(2, 1, true), 하루(2, 1, false)));
  assert.deepEqual(v.교정재발화, { 오늘: true, 어제: false });
  assert.equal(v.낸것.오늘, 2, '고리가 제출 수에 섞이면 두 축이 한 칸이 된다');
});

test('숫자가 아닌 값은 0 — 화면에 NaN 을 그리지 않는다', () => {
  const v = 견줌(봉투(하루('둘', null, 1), 하루(undefined, -3, 0)));
  assert.deepEqual(v.낸것, { 오늘: 0, 어제: 0, 늘었나: false });
  assert.deepEqual(v.다시말한것, { 오늘: 0, 어제: 0, 늘었나: false }, '음수도 모르는 값이다');
  assert.deepEqual(v.교정재발화, { 오늘: false, 어제: false }, '1·0 은 bool 이 아니다 — 접지 않는다');
});

test('탐지력 픽스처 — 판정기가 죽으면 위 검사들이 무엇이든 통과한다', () => {
  assert.equal(견줌(봉투(하루(1, 0, false), null)), null, 'yesterday 가 없으면 견줄 수 없다');
  assert.equal(견줌({ data: [{ today: 하루(1, 0, false) }] }), null);
});
