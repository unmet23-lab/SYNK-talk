'use strict';
/* 경과 시계 — `latency_ms` 를 재는 **유일한** 자리다(`lib/선택로그.js` 머리말).
 * 🔴 `Date.now()` 로 재지 않는다: 두 벽시계 시점의 차는 그 사이 시각 동기화·타임존 변경이
 *   음수나 몇 시간짜리 값을 만들고, 그 행은 오류가 아니라 «아주 오래 망설인 학생»으로 읽힌다.
 * 🔑 `performance` 가 없는 런타임이면 `null` 을 낸다 — 그러면 조립기가 `latency_ms: null`
 *   (「안 쟀다」)로 접는다. 0 으로 접으면 «즉답»이 되어 확신도 축이 조용히 거짓이 된다.
 * 🔑 정본은 여기 하나다 — 화면(말하기·교수멘탈·보고서교정·서류관문)은 import 만 한다.
 *   화면 안에 `const 경과시계` 를 다시 적으면 사본이 부활한다(`tests/경과시계.test.js` 가 잰다). */
const 경과시계 = () =>
  (typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
    ? performance.now() : null);

module.exports = { 경과시계 };
