'use strict';
/* 성향 확인 되돌려주기 — 추정 후보 판정과 답 사건 조립. **순수 함수만** (Ⅲ⑥ · 계약 c13 ·
 * 유호 확정 08-22 「리듬부터 · 새 사건 · 이 설계로 진행」 · 정본 = appsscript docs/코어엔진_설계.md §10 ·
 * 다축 확장 = 세층합류_설계_v1 §5 · 유호 위임 09-01).
 *
 * ■ 세 소비자가 이 한 파일을 쓴다 — 판정이 두 벌이 되면 서버가 보여준 것과 행에 남는 것이 갈린다.
 *   · 서버(functions/progress) — `확인카드`: 오늘 보여줄 확인 하나(하루 1회 · 부정 재노출 금지).
 *   · 앱(교수멘탈화면) — `확인사건`: 학생 답을 `estimate.responded` 로 조립(검증기 필수 6 전부).
 *   · 학습자상태 — 확인축이 이 사건을 읽는다(생산자·소비자 한 벌 — §6-6 ⑨ 래칫).
 *
 * ■ 🔴 문턱을 만들지 않는다(돌려주기 규율 — 실학생 0명이라 눈금이 없다). 판정 재료는 전부
 *   **방향·등식·어의**다: 「마감 전」(부호) · 「빠짐없이」(배정수=제출수 등식) · 「복수 표본」
 *   (n≥2 — 「요즘 ~하고 계시던데요」라는 복수형 문장이 성립하는 최소 어의이지 품질 눈금이 아니다) ·
 *   「주로」(과반 — 그 띠가 절반을 넘어야 「주로 그 시간에」가 참말이 된다 · v2) ·
 *   「고치면서」(되돌림 중앙값의 방향 — 절반 이상의 제출에서 한 번은 고쳤다 · v2).
 * ■ 🔴 부정된 추정은 다시 안 묻는다 — 「아니에요」 받은 (축·키)를 또 물으면 「내 말을 안 듣네」가
 *   되고, 그 순간 확인은 상호작용이 아니라 설문이 된다(재미없는 설문 금지 · §10).
 * ■ 🔴 하루 1회 상한은 축이 늘어도 그대로다(세층합류 §5) — 채널이 셋이 되어도 학생이 받는 것은
 *   하루 카드 한 장이고, 늘어나는 것은 후보 «목록»뿐이다.
 * ■ 판 = `성향확인.v2` — v2(2026-09-01 · 세층합류 §5 · 유호 위임): 후보 축이 리듬 하나에서
 *   **리듬·작성과정·집중띠 셋**이 됐다(판정 «규칙 집합»이 바뀌므로 판을 올린다 — 같은 판 아래
 *   다른 후보 공간이 섞이면 §6 동의율 자가 판별을 잃는다). `trait_axis` 값은 학습자상태 축
 *   이름 그대로라 **계약 개정 0**(이벤트검증 — 「축이 늘 때마다 계약 개정을 부르지 않는다」).
 *   이 값이 사건 `estimator_version` 에 실려 「어느 판의 추정에 답했나」가 행에 남는다
 *   (추정기 정확도 실측 라벨의 열쇠 — 세층합류 §6 «본인 동의율» 자의 판별 축).
 */

const { 확인안내 } = require('../contents/문구_성향확인.js');

/** 이 «후보 판정»의 판 — 규칙이 바뀌면 올린다. 사건에 실리는 `estimator_version` 은 추정을 낸
 *  학습자상태 판과 이 판을 `+` 로 합친다(둘 중 하나만 적으면 나머지 반쪽의 판올림이 행에서 안 갈린다). */
const 판정판 = '성향확인.v2';

/** 판정 우선순위 — 앞이 먼저다(더 구체적인 관찰 먼저: 리듬(제출 습관) → 작성과정(쓰는 손) →
 *  집중띠(시간대)). (축·키) 쌍의 «축» 순서 정본이고, 키의 소비자는 `contents/문구_성향확인.js`. */
const 후보순서 = Object.freeze(['여유제출', '반복제출', '고쳐쓰기', '한번에쓰기',
  '주로새벽', '주로오전', '주로오후', '주로저녁']);

/** 부정 재노출 금지 키의 «형식» 한 원천 (심문 G13 — SQL 조립과 lib 리터럴 두 곳이던 것).
 *  서버(progress)는 SQL 이 (trait_axis, shown_key) 쌍을 내고 TS 층이 이 함수로 조립한다 —
 *  SQL 문자열 안에 구분자를 다시 적지 않는다(두 곳에 적힌 형식은 새 축이 서는 날 갈린다). */
const 부정키 = (축, 키) => `${축}:${키}`;

/**
 * 리듬축 산출 → 확인 후보 키들(없으면 [] — 지어내지 않는다).
 * 🔴 재료는 **`학습자상태()` 의 리듬축 산출 그대로**다 — 배정↔제출 구간 잇기·마감 여유 계산의
 *   정본이 그 함수 하나이고, 여기서 다시 재면 서버가 보여준 추정과 상태가 배운 추정이 갈린다.
 * @param {{제출률: number, 마감여유분_중앙: number|null, n: number, 여유n: number}|null} 리듬
 */
function 리듬후보들(리듬) {
  if (!리듬 || typeof 리듬 !== 'object') return [];
  const 후보 = [];
  // 방향 — 마감 «전»(중앙값 양수). 복수 어의: 「요즘 ~들」이 성립하려면 여유 표본이 둘은 있어야 한다.
  if (Number.isFinite(리듬.마감여유분_중앙) && 리듬.마감여유분_중앙 > 0
    && Number.isFinite(리듬.여유n) && 리듬.여유n >= 2) 후보.push('여유제출');
  // 등식 — 빠짐없이(제출률 1). 같은 복수 어의로 배정이 둘은 있어야 「빠짐없이」가 말이 된다.
  if (리듬.제출률 === 1 && Number.isFinite(리듬.n) && 리듬.n >= 2) 후보.push('반복제출');
  return 후보;   // 성립하는 것 전부 · 우선순위 순 — 부정 건너뛰기가 다음 후보를 쓴다
}

/** 첫 후보 하나(없으면 null) — 후보 «목록»의 정본은 위 함수다. */
const 리듬후보 = (리듬) => 리듬후보들(리듬)[0] ?? null;

/**
 * 작성과정축 산출 → 확인 후보 키들 (v2 · 세층합류 §5).
 * 🔴 재료는 `학습자상태()` 작성과정축 그대로 — compose_meta 온전 행의 중앙값 넷.
 *   되돌림_중앙의 **방향**(≥1 = 절반 이상의 제출에서 한 번은 고쳤다)과 **등식**(0 = 절반 이상이
 *   한 번에)만 본다 — 「몇 번이면 많은가」 같은 품질 문턱은 없다(문턱 금지 규율 그대로).
 * @param {{되돌림_중앙: number|null, n: number}|null} 작성과정
 */
function 작성과정후보들(작성과정) {
  if (!작성과정 || typeof 작성과정 !== 'object') return [];
  if (!Number.isFinite(작성과정.n) || 작성과정.n < 2) return [];   // 복수 어의
  const 중앙 = 작성과정.되돌림_중앙;
  if (!Number.isFinite(중앙)) return [];
  if (중앙 >= 1) return ['고쳐쓰기'];       // 방향 — 고치면서 완성하는 편
  if (중앙 === 0) return ['한번에쓰기'];    // 등식 — 한 번에 쭉 쓰는 편
  return [];
}

/** 띠 이름 → 확인 키. 키 공간의 정본은 이 표다(문구 파일이 같은 키를 그린다). */
const 띠키 = Object.freeze({ 새벽: '주로새벽', 오전: '주로오전', 오후: '주로오후', 저녁: '주로저녁' });

/**
 * 집중띠축 산출 → 확인 후보 키들 (v2 · 세층합류 §5).
 * 🔴 재료는 `학습자상태()` 집중띠축 그대로 — 띠별 {완주율, n}.
 *   「주로」의 어의 = **과반**(그 띠의 n 이 전체 n 의 절반을 넘는다 — 절반이면 「주로」가 아니라
 *   「반반」이다). 복수 어의 = 그 띠 n≥2. 완주율은 안 본다 — 「그때 잘되더라」 판정은 품질
 *   문턱이라 금지고, 묻는 것은 「그 시간이 집중이 잘돼요?」라는 **학생의 답**이다.
 * @param {{띠: Record<string,{완주율:number|null,n:number}>, n: number}|null} 집중띠
 */
function 집중띠후보들(집중띠) {
  if (!집중띠 || typeof 집중띠 !== 'object' || !집중띠.띠 || typeof 집중띠.띠 !== 'object') return [];
  if (!Number.isFinite(집중띠.n) || 집중띠.n < 2) return [];
  for (const [이름, t] of Object.entries(집중띠.띠)) {
    if (!띠키[이름] || !t || !Number.isFinite(t.n)) continue;
    if (t.n >= 2 && t.n * 2 > 집중띠.n) return [띠키[이름]];   // 과반 — 있으면 하나뿐이다
  }
  return [];
}

/**
 * 축들 산출 → (축, 키) 후보 쌍 전부 · 우선순위 순. 축 이름은 학습자상태 축 이름 그대로다
 * (trait_axis 열린 집합 — 계약 개정 0).
 * @param {{리듬?: unknown, 작성과정?: unknown, 집중띠?: unknown}|null} 축들
 */
function 축후보들(축들) {
  const a = 축들 && typeof 축들 === 'object' ? 축들 : {};
  return [
    ...리듬후보들(a.리듬).map((키) => ({ 축: '리듬', 키 })),
    ...작성과정후보들(a.작성과정).map((키) => ({ 축: '작성과정', 키 })),
    ...집중띠후보들(a.집중띠).map((키) => ({ 축: '집중띠', 키 })),
  ];
}

/**
 * 오늘 보여줄 확인 카드 — 하루 1회 · 부정 재노출 금지 · 문구 없는 키는 안 낸다.
 * v2: 첫 인자가 리듬 산출 «하나»에서 **축들 객체**가 됐다(세층합류 §5 — 확인카드 다축 일반화).
 *   소비자 전량(progress·회귀)이 같은 커밋에서 함께 옮긴다 — 두 시그니처를 겸용으로 받으면
 *   어느 판으로 불렸는지 행에서 안 갈린다.
 * @param {{리듬?: unknown, 작성과정?: unknown, 집중띠?: unknown}|null} 축들
 *   `학습자상태()` 산출의 `축` 그대로(서버가 행을 걷어 그 함수에 먹인다)
 * @param {{오늘답함: boolean, 부정키들: string[]}} 이력  `estimate.responded` 행에서 파생(서버)
 * @param {string} 기준시각  그 상태 계산의 as_of — 사건 `estimate_as_of` 로 그대로 실린다
 * @param {string} 추정판  그 상태의 `estimator_version`(예: 학습자상태.v15)
 * @returns {{trait_axis: string, shown_key: string, shown_text: string,
 *           estimator_version: string, estimate_as_of: string}|null}
 */
function 확인카드(축들, 이력, 기준시각, 추정판) {
  if (!이력 || 이력.오늘답함) return null;                    // 하루 1회 — 답한 날은 더 안 묻는다
  const 부정 = new Set(Array.isArray(이력.부정키들) ? 이력.부정키들.map(String) : []);
  /* 부정 재노출 금지 — 부정된 (축·키)는 «건너뛰고 다음 후보»다(전부 부정이면 카드 없음). */
  const 후보 = 축후보들(축들).find(({ 축, 키 }) => !부정.has(부정키(축, 키))) ?? null;
  if (!후보) return null;
  const 안 = 확인안내(후보.키);
  if (!안 || !안.문장.length) return null;                    // 문구 없는 키 — 빈 카드를 내지 않는다
  return {
    trait_axis: 후보.축,
    shown_key: 후보.키,
    shown_text: 안.문장.join('\n'),                           // 학생이 실제로 본 문장 그대로 행에 남는다
    estimator_version: `${String(추정판 || '')}+${판정판}`,
    estimate_as_of: String(기준시각),
  };
}

/**
 * 학생 답 → `estimate.responded` 사건 (계약 c13 · 검증기 필수 6 전부).
 * 🔴 카드의 다섯 값을 **그대로 되싣는다** — 앱이 지어내면 「무엇의 긍정/부정인가」가 갈린다
 *   (task_ref 되돌리기와 같은 무늬). 모르는 답 값은 null(보내지 않는다 — 조립기가 값록을 진다).
 * @param {ReturnType<typeof 확인카드>} 카드  서버가 내려준 그대로
 * @param {'맞다'|'아니다'} 응답
 * @param {{correlation_id: string, idempotency_key: string, occurred_at?: string}} 키들
 */
function 확인사건(카드, 응답, 키들) {
  if (!카드 || !카드.trait_axis || !카드.shown_key || !카드.shown_text
    || !카드.estimator_version || !카드.estimate_as_of) return null;
  if (응답 !== '맞다' && 응답 !== '아니다') return null;      // 값록(계약 「확인응답」) — 모르는 값 거부
  if (!키들 || !키들.correlation_id || !키들.idempotency_key) return null;
  return {
    event_type: 'estimate.responded',
    correlation_id: String(키들.correlation_id),
    idempotency_key: String(키들.idempotency_key),
    /* 공통 필수 — occurred_at 은 답한 «그 순간»(호출자가 들면 그것 · 아니면 지금). level_snapshot
     * 은 ⓑ 완화 규약(키 존재 + null) 그대로다: 이 카드에 급수가 안 흐르니 null 이 유일하게
     * 정확한 값이다(「그때 화면이 알던 값」— 화면이 몰랐으면 null · 이벤트검증 널허용). */
    occurred_at: String(키들.occurred_at || new Date().toISOString()),
    level_snapshot: null,
    payload: {
      /* ver — 서버(events)가 «모든» payload 에 정수 ver 를 요구한다. 이 칸이 빠져 있던 것을
       * 08-24 첫 실왕복(⑯)이 잡았다 — 게임로그 접두 구멍에 가려 이 조립기의 산출이 서버에
       * 닿아본 적이 없었고, 그래서 lib 검증만으로는 안 보였다(다른 조립기는 전부 ver:1). */
      ver: 1,
      trait_axis: String(카드.trait_axis),
      shown_key: String(카드.shown_key),
      shown_text: String(카드.shown_text),
      response: 응답,
      estimator_version: String(카드.estimator_version),
      estimate_as_of: String(카드.estimate_as_of),
    },
  };
}

module.exports = {
  판정판, 후보순서, 부정키,
  리듬후보들, 리듬후보, 작성과정후보들, 집중띠후보들, 축후보들,
  확인카드, 확인사건,
};
