/* 몽골 달력의 「오늘」 — 시간대 이름과 YYYY-MM-DD 접기, 이 한 벌만 산다.
 *
 * ■ 왜 제 파일인가 (라디오 반박 ⑤ · 2026-08-13)
 *   승격기(`lib/라디오승격.js`)가 이 함수 **하나** 때문에 `오늘과제.js` 를 물면, radio-promote
 *   동봉이 오늘과제→게임스냅샷→문항 팩 트리 전체를 실어 게임 트랙이 lib 을 만질 때마다
 *   radio-promote 배포가 밀렸다(3회 실측). 날짜 접기는 소비자가 여럿(과제·승격·게임)인
 *   바닥층이라 require 트리 없는 제 파일이 정공이다 — 라디오 쪽이 `오늘과제.js` 를 다시 무는
 *   것은 `tests/라디오승격.test.js` 의 동봉 회귀가 막는다.
 *
 * ■ 날짜는 **몽골 달력**으로 끊는다(C0 §4-3 ① · §10-A-4)
 *   UTC 로 끊으면 몽골 오전 8시(=00:00Z)까지가 「어제」라, 아침에 앱을 연 학생이
 *   어제 것을 오늘 것으로 받는다. 오프셋을 상수로 적지 않는 이유는 그게 규칙의 사본이기
 *   때문이다 — 규칙은 tzdata 가 지고, 여기는 이름만 든다. */
'use strict';

const 시간대 = 'Asia/Ulaanbaatar';
const 날짜형식 = new Intl.DateTimeFormat('en-CA', {
  timeZone: 시간대, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** @param {Date|string|number} [때] @returns {string} `YYYY-MM-DD` (몽골 기준) */
function 몽골날짜(때) {
  const d = 때 == null ? new Date() : 때 instanceof Date ? 때 : new Date(때);
  if (Number.isNaN(d.getTime())) throw new TypeError('몽골날짜: 날짜가 아니다');
  return 날짜형식.format(d);
}

module.exports = { 시간대, 몽골날짜 };
