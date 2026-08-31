'use strict';
/**
 * 시한 있는 fetch — 앱의 모든 HTTP 왕복이 같은 자를 쓰는 자리 하나 (08-31 감사 D7-5·G1-7).
 *
 * ■ 왜 있나
 *   연결은 됐는데 바이트가 안 오는 회선(몽골 모바일의 정상 상태 중 하나)에서 fetch 는
 *   OS 기본 시한까지 매달린다 — 학생 화면은 그동안 「도는 중」으로 굳는다. 상한을 여기
 *   한 곳에 두면 소비자가 늘어도 값이 안 갈라진다(한 값을 두 곳이 알면 갈린다).
 *
 * ■ 시한 초과는 **NETWORK 로 접힌다**
 *   abort 는 fetch 의 reject 라 호출부의 기존 catch(NETWORK · retryable:true)로 떨어진다 —
 *   재시도 규약 무변경, 키체인도 안 지운다(기다리면 낫는 실패가 맞다).
 *
 * ⚠ **반드시 ESM 이다** — CJS 로 두면 `tests/lib/앱모듈세우기.js` 의 지름길 require 를 타서
 *   가짜 fetch 주입이 안 걸리고, 회귀가 진짜 네트워크 층을 재지 못한다.
 */

/** 조회(GET)의 상한 ms. */
export const 조회상한 = 15000;
/** 제출(POST·PUT — 본문이 실린다)의 상한 ms. */
export const 제출상한 = 30000;

export function 시한fetch(url, 옵션, 상한ms) {
  // 구형 런타임 방어 — AbortController 가 없으면 시한 없이 현행 그대로 돈다(막는 것보다 낫다).
  if (typeof AbortController !== 'function') return fetch(url, 옵션);
  const 조종 = new AbortController();
  const 시계 = setTimeout(() => 조종.abort(), 상한ms);
  // 🔴 clearTimeout 은 finally 다 — 없으면 node 회귀가 열린 타이머로 매달린다.
  return fetch(url, { ...옵션, signal: 조종.signal }).finally(() => clearTimeout(시계));
}
