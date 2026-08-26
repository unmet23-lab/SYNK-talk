/* 예비과제 고르기 — «빈손 방지» 풀에서 오늘 한 벌을 고른다 (순수 · DB 0 · 벤더 0)
 *
 * ■ 왜 있나 (유호 지시 2026-08-26) — 개인화 생성이 깨진 날에도 학생이 «빈손»이 되지 않게.
 *   풀의 정본은 생성물 `contents/예비과제.js`(굽는 자 = `tools/예비과제굽기.js`)이고,
 *   여기는 **고르는 규칙만** 진다. 콘텐츠와 규칙을 갈라 두는 이유는 `갈래판정`·`오늘과제` 와 같다 —
 *   문구를 다듬은 날과 규칙을 고친 날이 행에서 갈려야 한다.
 *
 * ■ 🔑 고르는 규칙 = **학생마다 다른 출발점에서 «한 칸씩» 걷는다**
 *   `(학생 지문 + 날짜) mod 목록길이`. 무작위가 아니다 — 같은 학생·같은 날이면 언제 불러도 같은 값이라
 *   재실행·재시도가 다른 과제를 만들지 않는다(스냅샷 불변 규율과 한 몸).
 *   그리고 날짜가 하루 가면 한 칸 가므로 **연속으로 같은 문장이 안 나온다** — 목록 길이(≈30)만큼
 *   지나야 한 바퀴다. 학생마다 출발점이 달라 같은 날 옆자리와도 안 겹친다.
 *
 * ■ 🔴 초급(Lv1~2)·미정은 **없다** — §8-B 표본이 Lv3~6 뿐이라 검증된 초급 문장이 0벌이다.
 *   `있나()` 가 false 를 내고, 부르는 쪽은 도입 폴백으로 간다. **없는 것을 지어내지 않는다.**
 *
 * ■ Node 와 Deno(Edge Fn 동봉) 둘 다에서 돈다 — import 0 · 순수 JS 만 쓴다.
 */
'use strict';
const { 예비과제 } = require('../contents/예비과제풀.js');

/** 문자열 → 32비트 부호 없는 지문(FNV-1a). 암호용이 아니라 «흩기»용이다 — 결정적이면 된다. */
function 지문(s) {
  let h = 0x811c9dc5;
  const 글자 = String(s ?? '');
  for (let i = 0; i < 글자.length; i++) {
    h ^= 글자.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** `YYYY-MM-DD` → 에포크 이후 날수. 시간대를 안 탄다(UTC 자정 고정 · 문자열이 이미 몽골 날짜다). */
function 날수(날짜) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(날짜 ?? ''));
  if (!m) throw new TypeError(`예비과제: 날짜는 YYYY-MM-DD 여야 한다 (${날짜})`);
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

/** 그 급수에 예비가 «있나». 없으면 부르는 쪽이 도입 폴백으로 간다. */
function 있나(급수) {
  const 목록 = 예비과제[String(급수 ?? '')];
  return Array.isArray(목록) && 목록.length > 0;
}

/** 그 급수의 예비 벌 수(0 이면 없다) — 진단·회귀가 분모로 쓴다(F207: 초록은 분모와 함께 읽는다). */
const 벌수 = (급수) => (있나(급수) ? 예비과제[String(급수)].length : 0);

/**
 * 오늘 한 벌을 고른다.
 * @param {{급수: string, learner_id: string, 날짜: string}} 재료
 * @returns {{문장: string, 질문: string, 판: string, case_id: string}|null} 그 급수에 없으면 null
 */
function 고르기({ 급수, learner_id, 날짜 } = {}) {
  if (!있나(급수)) return null;
  const 목록 = 예비과제[String(급수)];
  const 자리 = (지문(learner_id) + 날수(날짜)) % 목록.length;
  return 목록[자리];
}

module.exports = { 고르기, 있나, 벌수, 지문, 날수 };
