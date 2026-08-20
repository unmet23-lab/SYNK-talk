'use strict';
/* 시즌 맥락 조립기 — ㉢ 첫 배선(경로 A)의 순수층 회귀 (2026-08-20 · 엔진검토 Ⅰ-②).
 * 배선(조회·두 통로)의 원문 대조는 tests/교정배치.test.js 가, 배치 통과는 tests/교정엔진.test.js 가 진다. */
const test = require('node:test');
const assert = require('node:assert');
const { 시즌줄 } = require('../lib/시즌맥락.js');
const { 한줄상한 } = require('../lib/나침반문항.js');

test('없음·빈 값은 null — 「목표: 미정」 채움말을 만들지 않는다(맥락 없음=v1 바이트 동일이 이 층의 폴백 규약)', () => {
  for (const v of [null, undefined, '', '   ']) assert.equal(시즌줄(v), null, String(v));
});

test('값이 있으면 접두가 정확히 「이번 시즌 목표: 」다 — 표본·프롬프트 v7 이 이 표기를 본다', () => {
  assert.equal(시즌줄('토픽 4급 합격'), '이번 시즌 목표: 토픽 4급 합격');
  assert.equal(시즌줄('  앞뒤 공백  '), '이번 시즌 목표: 앞뒤 공백');
});

test('몽골어(키릴)를 그대로 통과시킨다 — 언어 변환·음역은 이 층의 일이 아니다(출력 언어는 프롬프트가 지킨다)', () => {
  assert.equal(시즌줄('Солонгос хэл сурах'), '이번 시즌 목표: Солонгос хэл сурах');
});

test('자르지 않는다 — 상한의 정본은 입구(나침반문항·DB CHECK) 하나다. 여기서 또 자르면 잘린 곳이 두 곳이 된다', () => {
  const 긴 = '가'.repeat(한줄상한);
  assert.equal(시즌줄(긴), `이번 시즌 목표: ${긴}`);
});

test('인자가 값 하나다 — 집계·남의 값이 들어올 모양 자체가 없다(철학 ㉢ 학생끼리 비교 금지)', () => {
  assert.equal(시즌줄.length, 1);
});
