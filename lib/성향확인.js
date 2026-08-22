'use strict';
/* 성향 확인 되돌려주기 — 추정 후보 판정과 답 사건 조립. **순수 함수만** (Ⅲ⑥ · 계약 c13 ·
 * 유호 확정 08-22 「리듬부터 · 새 사건 · 이 설계로 진행」 · 정본 = appsscript docs/코어엔진_설계.md §10).
 *
 * ■ 세 소비자가 이 한 파일을 쓴다 — 판정이 두 벌이 되면 서버가 보여준 것과 행에 남는 것이 갈린다.
 *   · 서버(functions/progress) — `확인카드`: 오늘 보여줄 확인 하나(하루 1회 · 부정 재노출 금지).
 *   · 앱(교수멘탈화면) — `확인사건`: 학생 답을 `estimate.responded` 로 조립(검증기 필수 6 전부).
 *   · 학습자상태 — 확인축이 이 사건을 읽는다(생산자·소비자 한 벌 — §6-6 ⑨ 래칫).
 *
 * ■ 🔴 문턱을 만들지 않는다(돌려주기 규율 — 실학생 0명이라 눈금이 없다). 판정 재료는 전부
 *   **방향·등식·어의**다: 「마감 전」(부호) · 「빠짐없이」(배정수=제출수 등식) · 「복수 표본」
 *   (n≥2 — 「요즘 ~하고 계시던데요」라는 복수형 문장이 성립하는 최소 어의이지 품질 눈금이 아니다).
 * ■ 🔴 부정된 추정은 다시 안 묻는다 — 「아니에요」 받은 (축·키)를 또 물으면 「내 말을 안 듣네」가
 *   되고, 그 순간 확인은 상호작용이 아니라 설문이 된다(재미없는 설문 금지 · §10).
 * ■ 판 = `성향확인.v1` — 판정 규칙이 바뀌면 올린다. 이 값이 사건 `estimator_version` 에 실려
 *   「어느 판의 추정에 답했나」가 행에 남는다(추정기 정확도 실측 라벨의 열쇠).
 */

const { 확인안내 } = require('../contents/문구_성향확인.js');

/** 이 «후보 판정»의 판 — 규칙이 바뀌면 올린다. 사건에 실리는 `estimator_version` 은 추정을 낸
 *  학습자상태 판과 이 판을 `+` 로 합친다(둘 중 하나만 적으면 나머지 반쪽의 판올림이 행에서 안 갈린다). */
const 판정판 = '성향확인.v1';

/** 판정 우선순위 — 앞이 먼저다(더 구체적인 관찰 먼저). 키의 소비자는 `contents/문구_성향확인.js`. */
const 후보순서 = Object.freeze(['여유제출', '반복제출']);

/**
 * 리듬축 산출 → 확인 후보 키 하나(없으면 null — 지어내지 않는다).
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
 * 오늘 보여줄 확인 카드 — 하루 1회 · 부정 재노출 금지 · 문구 없는 키는 안 낸다.
 * @param {{제출률: number, 마감여유분_중앙: number|null, n: number, 여유n: number}|null} 리듬
 *   `학습자상태()` 산출의 `축.리듬` 그대로(서버가 행을 걷어 그 함수에 먹인다)
 * @param {{오늘답함: boolean, 부정키들: string[]}} 이력  `estimate.responded` 행에서 파생(서버)
 * @param {string} 기준시각  그 상태 계산의 as_of — 사건 `estimate_as_of` 로 그대로 실린다
 * @param {string} 추정판  그 상태의 `estimator_version`(예: 학습자상태.v12)
 * @returns {{trait_axis: string, shown_key: string, shown_text: string,
 *           estimator_version: string, estimate_as_of: string}|null}
 */
function 확인카드(리듬, 이력, 기준시각, 추정판) {
  if (!이력 || 이력.오늘답함) return null;                    // 하루 1회 — 답한 날은 더 안 묻는다
  const 부정 = new Set(Array.isArray(이력.부정키들) ? 이력.부정키들.map(String) : []);
  /* 부정 재노출 금지 — 부정된 키는 «건너뛰고 다음 후보»다(전부 부정이면 카드 없음). */
  const 키 = 리듬후보들(리듬).find((k) => !부정.has(`리듬:${k}`)) ?? null;
  if (!키) return null;
  const 안 = 확인안내(키);
  if (!안 || !안.문장.length) return null;                    // 문구 없는 키 — 빈 카드를 내지 않는다
  return {
    trait_axis: '리듬',
    shown_key: 키,
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
      trait_axis: String(카드.trait_axis),
      shown_key: String(카드.shown_key),
      shown_text: String(카드.shown_text),
      response: 응답,
      estimator_version: String(카드.estimator_version),
      estimate_as_of: String(카드.estimate_as_of),
    },
  };
}

module.exports = { 판정판, 후보순서, 리듬후보들, 리듬후보, 확인카드, 확인사건 };
