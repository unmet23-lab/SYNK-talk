'use strict';
/* 관통검증 — 관통왕복시험(tools/관통왕복시험.js)의 «순수» 판정 조각. DB·네트워크·시계 0.
 *
 * ■ 왜 lib 인가(2026-09-11 · 「아니야」 N 계열) — 왕복 도구는 리허설에서만 돈다(골격 리허설 게이트 ·
 *   배포판 게이트). 그 안의 판정 조각(첫 카드 파생 · 요약 줄 술어 · axes_used 차 · 검증점 장부)은 순수라
 *   회귀가 리허설 없이 못박을 수 있다 — 도구 안에 두면 배포 전엔 한 줄도 못 재고, 「못 잰 판정」이 초록의
 *   얼굴을 한다(F207). 도구는 이 조각을 «부르기만» 한다.
 * ■ 규칙을 다시 적지 않는다 — 카드·부정키의 정본은 lib/성향확인.js, 축은 lib/학습자상태.js, 요약 줄 모양
 *   (「{축}: …」)은 lib/과제요약.js 다. 여기는 그 셋을 잇고, 도구가 손으로 들던 장부를 한 벌로 든다.
 * ■ 이름 — N1~N3 는 관통왕복 명세 v0.4 밖의 «아니야» 계열이다. V6~V9 는 엔진 v3 §3-5-1 이 예약한 번호라
 *   쓰지 않는다(이름이 겹치면 다른 뜻의 초록이 같은 칸에 앉는다).
 */
const { 학습자상태 } = require('./학습자상태.js');
const { 확인카드, 부정키 } = require('./성향확인.js');

/** progress(functions/progress) 가 카드를 내는 그 이력 모양 — 「한 번도 안 물음」. */
const 첫이력 = () => ({ 오늘답수: 0, 오늘답한키들: [], 부정키들: [], 축별마지막날: {} });

/**
 * 원행들 → 오늘의 확인 카드 (progress 와 같은 사슬: 학습자상태 → 확인카드).
 * 🔴 키를 손으로 적지 않는다 — «그 학생이 받을 첫 카드»는 이 파생이 낸다(부정할 (축·키)의 원천).
 * @param {Array<object>} 원행들 progress/index.ts 원행들 모양({event_id, event_type, occurred_at, due_at?,
 *   task_type?, task_schema_ver?, payload?} — 세 사건 · 40일 창). ⚠ due_at·task_schema_ver 의 DDL 상 자리는
 *   engine.submissions 라, 걷는 쪽이 그 표에서 이어 와야 리듬(마감 여유)이 산다.
 * @param {{기준: string, 시간대: string, 이력?: object}} 옵션 기준 = as_of(ISO · now) · 이력 없으면 첫이력
 * @returns {{카드: object|null, 상태: object}}
 */
function 확인카드파생(원행들, { 기준, 시간대, 이력 } = {}) {
  const 상태 = 학습자상태(Array.isArray(원행들) ? 원행들 : [], { as_of: 기준, 시간대 });
  const 카드 = 확인카드(
    { 리듬: 상태.축.리듬, 작성과정: 상태.축.작성과정, 집중띠: 상태.축.집중띠 },
    이력 ?? 첫이력(), 기준, 상태.estimator_version);
  return { 카드, 상태 };
}

/** 카드(또는 쌍) → (trait_axis, shown_key). 카드가 아니거나 반쪽이면 null — 지어내지 않는다. */
function 카드쌍(카드) {
  if (!카드 || typeof 카드 !== 'object') return null;
  const 축 = 카드.trait_axis, 키 = 카드.shown_key;
  if (typeof 축 !== 'string' || !축 || typeof 키 !== 'string' || !키) return null;
  return { trait_axis: 축, shown_key: 키 };
}

/** 두 쌍(카드)이 같은가 — 둘 다 null 이면 «같다»(카드 없음 = 카드 없음) · 한쪽만 null 이면 다르다. */
function 같은쌍(a, b) {
  const x = 카드쌍(a), y = 카드쌍(b);
  if (x === null && y === null) return true;
  if (x === null || y === null) return false;
  return x.trait_axis === y.trait_axis && x.shown_key === y.shown_key;
}

/**
 * 그 쌍에 오늘 「아니다」로 답한 뒤 progress 가 같은 행에서 파생시키는 이력 — 오늘 답 1 · 오늘 답한 키 = 그 쌍 ·
 * 부정 키 = 그 쌍 · 축별 마지막 날 = {그 축: 오늘}(progress/index.ts 답이력·축별마지막날 조립과 같은 모양).
 */
function 부정뒤이력(쌍, 오늘) {
  const p = 카드쌍(쌍);
  if (!p) throw new TypeError('부정뒤이력: (trait_axis, shown_key) 쌍이 필요하다');
  const k = 부정키(p.trait_axis, p.shown_key);
  return { 오늘답수: 1, 오늘답한키들: [k], 부정키들: [k], 축별마지막날: { [p.trait_axis]: String(오늘) } };
}

/** 학생 화면이 받는 확인 카드의 다섯 칸 — 앱이 그대로 되싣는 값 전부(lib/성향확인.js 확인사건 필수 다섯). */
const 확인카드칸들 = Object.freeze(['trait_axis', 'shown_key', 'shown_text', 'estimator_version', 'estimate_as_of']);
/** 오늘의목표 카드의 칸(lib/목표확인.js 목표카드 산출 — 상태 유래가 아니라 날짜 유래다). */
const 목표카드칸들 = Object.freeze(['class_date', '키', '문장', 'card_version']);

/** 카드에서 빈 칸 — 없거나 null · 빈 문자열 · 빈 배열. 카드가 아니면 «전부 빠짐». */
function 카드칸빠짐(카드, 칸들) {
  const 목록 = Array.isArray(칸들) ? 칸들.map(String) : [];
  if (!카드 || typeof 카드 !== 'object') return [...목록];
  return 목록.filter((k) => {
    const v = 카드[k];
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    return String(v).trim() === '';
  });
}

/** 요약(과제요약 §6-2 문자열)에 그 축의 줄이 있나 — 줄 시작 「{축}: 」. 다른 축 줄 안의 낱말(예: 확인 줄에 든
 *  축 이름)은 안 센다 — «줄»이 단위다(과제요약이 축마다 한 줄을 낸다). */
function 축줄있나(요약, 축) {
  if (typeof 축 !== 'string' || !축) return false;
  return String(요약 ?? '').split('\n').some((줄) => 줄.startsWith(`${축}: `));
}

/** 두 axes_used 의 차 — 기준에 있고 대상에 없는 것(빠진) · 대상에만 있는 것(늘어난). 순서 보존 · 중복 접음. */
function 축차이(기준축들, 대상축들) {
  const a = [...new Set((Array.isArray(기준축들) ? 기준축들 : []).map(String))];
  const b = [...new Set((Array.isArray(대상축들) ? 대상축들 : []).map(String))];
  return { 빠진: a.filter((x) => !b.includes(x)), 늘어난: b.filter((x) => !a.includes(x)) };
}

/**
 * 검증점 장부 — 확인(초록/빨강)과 별개로 «어느 검증점의 것인가»를 든다(V1~V5 · N1~N3 공용).
 * 규칙(명세 ④ · F207): 검사 0건 = «못쟀다»(미실행은 통과가 아니다) · 못쟀다 표식은 ✓ 를 이긴다 · ✗ 하나면 ✗.
 * @param {string[]} 칸들 검증점 이름(순서가 곧 줄 순서)
 * @param {{확인?: function, 알림?: function}} [옵] 확인 = 골격의 확인(이름, 조건, 실제) → 불리언(없으면 !!조건) ·
 *   알림(칸, 이유) = 못쟀다 소리(없으면 조용히 든다)
 */
function 검증장부(칸들, { 확인 = null, 알림 = null } = {}) {
  const 이름들 = Object.freeze((Array.isArray(칸들) ? 칸들 : []).map(String));
  if (!이름들.length) throw new TypeError('검증장부: 칸이 0개다 — 빈 장부는 «전부 못쟀다»이자 «전부 ✓»가 된다');
  if (new Set(이름들).size !== 이름들.length) throw new TypeError('검증장부: 칸 이름이 겹친다');
  const 결과 = Object.fromEntries(이름들.map((k) => [k, []]));
  const 못쟀다표 = {};
  const 칸검사 = (칸) => {
    if (!Object.prototype.hasOwnProperty.call(결과, 칸)) throw new RangeError(`검증장부: 모르는 칸 「${칸}」`);
  };
  const 잰다 = (칸, 이름, 조건, 실제) => {
    칸검사(칸);
    const r = 확인 ? !!확인(`${칸} ${이름}`, 조건, 실제) : !!조건;
    결과[칸].push(r);
    return r;
  };
  const 못쟀다 = (칸, 이유) => {
    칸검사(칸);
    const 글 = String(이유);
    못쟀다표[칸] = 못쟀다표[칸] ? `${못쟀다표[칸]} · ${글}` : 글;
    if (알림) 알림(칸, 글);
  };
  const 상태 = (칸) => {
    칸검사(칸);
    if (못쟀다표[칸]) return '못쟀다';
    if (결과[칸].length === 0) return '못쟀다';   // 검사 0건 = 미실행이지 통과가 아니다(F207)
    return 결과[칸].every(Boolean) ? '✓' : '✗';
  };
  const 줄 = () => 이름들.map((k) => ({ '✓': '✓', '✗': '✗', 못쟀다: '?' })[상태(k)]).join('');
  const 요약 = () => 이름들.map((k) => `${k} ${상태(k)}`).join(' · ');
  const 전부초록 = () => 이름들.every((k) => 상태(k) === '✓');
  return { 칸들: 이름들, 잰다, 못쟀다, 상태, 줄, 요약, 전부초록, 못쟀다표, 결과 };
}

module.exports = {
  첫이력, 확인카드파생, 카드쌍, 같은쌍, 부정뒤이력,
  확인카드칸들, 목표카드칸들, 카드칸빠짐, 축줄있나, 축차이, 검증장부,
};
