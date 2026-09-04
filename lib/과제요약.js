/* 과제요약 — 학습자 상태를 «생성 입력의 요약 문자열»과 «사건용 evidence_refs» 로 변환하는
 * 유일한 자리 (정본 = appsscript docs/상태기반_과제선택_설계.md §6-1·§6-2 · 2026-08-21).
 *
 * ■ 이 파일이 «계약»이다(§6-2) — 어느 하위 지표를 어떤 단위·반올림·순서·널 표기로 싣는지의
 *   정본. 목록을 문서에 베끼지 않는 대가로 `policy_ver` 재료 1 이 이 파일의 해시다(§5-1 G4) —
 *   조립 규칙이 바뀌면 판이 오른다.
 * ■ 변환 주체 규칙(§6-1 V6-14): `lib/학습자상태.js` 는 **안 고친다** — 그 파일의 근거 상한
 *   200·`잘림`(원래 개수)·한글 키는 그 파일의 자기 이름으로 정본으로 살고, 여기가 «옮겨 적는»
 *   모양(§6-1 · 영문 snake_case)이 사건 계보다. `estimator_version` 도 안 올린다 — 추정이
 *   바뀐 게 아니라 옮겨 적는 모양이 다를 뿐이다.
 * ■ 상태가 결정을 가르지 않는다(불변식 5) — 이 문자열은 렌더된 요청 본문에 박혀 벤더가 읽는
 *   «재료»다. 여기서 어떤 분기도 만들지 않는다. 유일한 갈림(`쓸축수 === 0` → 상태없음)은
 *   §4-3 이 값으로 정의했고, 그 수는 이 파일이 낸 `axes_used` 의 길이 하나다(두 곳에서 안 센다).
 *
 * ■ 인코딩 규칙(§6-2 표 — 「무엇을」이 아니라 「어떻게」):
 *   · 단위 — 비율은 0~1 소수 · 시간은 분 · 개수는 정수(상류가 이미 그 규격으로 내고, 여기서
 *     소수 2자리 반올림(0.5 올림)·분 정수 반올림을 한 번 더 보장한다 — 상류를 «믿기만» 하면
 *     상류 규격이 바뀐 날 이 계약이 조용히 깨진다).
 *   · 순서 — 상태 객체가 내는 축 순서 «그대로»(재정렬 금지 — 같은 상태가 다른 문자열이 되면
 *     `generation_input_text` 대조가 깨진다). 하위 지표도 객체 순서 그대로.
 *   · 널 — 그 축·지표를 «싣지 않는다»(빈 문자열·0·'null' 전부 금지 — 0 은 관측이지 부재가 아니다).
 *   · 절단 — 축 한 줄이 50 코드포인트를 넘으면 50 에서 잘라 `…` 를 붙인다.
 *   · 표본 수 — n·여유n 같은 표본 칸은 싣는다(얇은 근거를 앞에서 자르지 않는다 · §4-3).
 *   · 목표 조각 — 급수·목적(§4-3 C4)은 값이 있으면 «필수»로 실리고 `axes_used` 엔 안 센다.
 *     null 이면 안 싣는다(개원 첫 주의 정상 상태 · §8-B F2).
 *   · 시즌 나침반(㉢ 경로 A · §6-2 v5.13-f) — `season_goal`(학생이 제 말로 적은 이번 시즌 목표)도
 *     목표 조각이다: 값이 있으면 싣고 `axes_used` 엔 안 센다(C4 그대로 — 상태 축이 아니라 목표다).
 *     줄의 «말»은 `lib/시즌맥락.js 시즌줄` 하나가 정본이다(correct 첨삭 배선 08-20 과 같은 낱말 —
 *     두 통로가 같은 답을 다른 말로 실으면 벤더가 다른 재료로 읽는다). 없으면 안 싣는다(널 규칙 ·
 *     나침반 0행이 개원 전 정상 상태다). ⚠ 이 층에선 축줄상한 절단을 «받는다» — correct 의
 *     [학생 맥락] 줄은 그쪽 문서 규격이고, 여기는 요약 문자열이라 §6-2 절단 규칙이 이긴다.
 *
 * ■ evidence_refs 변환(§6-1): { events(원천 배열 순서 그대로 앞 50 · C4), as_of,
 *   window_days, axes_used, truncated } — 키는 영문 snake_case(D1 · c12 검증기와 같은 규약).
 *   `truncated` 는 「이 봉투에서 잘렸다」는 별개 사실이고 원래 개수를 대신하지 않는다(C2 —
 *   원래 개수의 정본은 상류 상태 객체의 `잘림`, 재현 절차는 §6-1 v5.9). */
'use strict';

const { 시즌줄, 목적줄들 } = require('./시즌맥락.js');   // ㉢ 나침반 줄의 «말»은 그 파일 하나(correct 와 공유)

const 근거상한 = 50;   // §6-1 — evidence_refs.events 의 봉투 상한(상류 200 과 별개)
const 축줄상한 = 50;   // §6-2 — 축 한 줄의 코드포인트 상한

const 수렌더 = (v) => {
  if (!Number.isFinite(v)) return null;
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 100) / 100);   // 소수 2자리 · 0.5 올림(§6-2)
};

/** 하위 지표 하나 → `이름=값` 조각. 값이 널·빈 객체면 null(= 안 싣는다). */
function 지표렌더(이름, v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    const s = 수렌더(v);
    return s === null ? null : `${이름}=${s}`;
  }
  if (typeof v === 'string') return v === '' ? null : `${이름}=${v}`;
  if (typeof v === 'object') {
    const 안 = Object.entries(v)
      .map(([k, w]) => 지표렌더(k, w))
      .filter(Boolean);
    return 안.length ? `${이름}(${안.join(' ')})` : null;
  }
  return null;   // boolean 등 — 상류가 안 내는 모양은 지어서 싣지 않는다
}

const 절단 = (줄) => {
  const 자 = Array.from(줄);
  return 자.length > 축줄상한 ? `${자.slice(0, 축줄상한).join('')}…` : 줄;
};

/**
 * @param {{estimator_version: string, estimator_confidence: number,
 *          evidence_refs: object, 축: Record<string, object|null>}} 상태 `학습자상태()` 산출
 * @param {{목표?: string|null, 급수?: string|null, 시즌목표?: string|null,
 *          왜배우나?: string|null, 토픽쓸곳?: string|null}} [조각]
 *   goal_snapshot·level_snapshot·나침반 `season_goal`(㉢ — 원값을 받는다 · 렌더는 시즌줄이 진다) ·
 *   나침반 입학 회차 `why_learning`·`topik_use`(09-05 — 원값 · 렌더는 목적줄들이 진다)
 * @returns {{요약: string, 쓸축수: number, axes_used: string[], evidence_refs: object}}
 */
function 과제요약(상태, 조각) {
  if (!상태 || typeof 상태 !== 'object' || !상태.축 || typeof 상태.축 !== 'object') {
    throw new TypeError('과제요약: 학습자상태() 산출(축 객체 포함)이 필요하다');
  }
  const { 목표 = null, 급수 = null, 시즌목표 = null, 왜배우나 = null, 토픽쓸곳 = null } = 조각 || {};

  const axes_used = [];
  const 줄들 = [];
  for (const [축이름, 값] of Object.entries(상태.축)) {   // 순서 = 상태 객체 그대로(재정렬 금지)
    if (값 === null || 값 === undefined) continue;         // 널 축 — 싣지 않는다
    const 안 = Object.entries(값).map(([k, v]) => 지표렌더(k, v)).filter(Boolean);
    if (!안.length) continue;                              // 하위 전부 널 — 축을 안 센다(§4-3)
    axes_used.push(축이름);
    줄들.push(절단(`${축이름}: ${안.join(' ')}`));
  }

  /* 목표 조각 — 값이 있으면 필수로 실리고(§6-2 F5 — 빠지면 계약 v3.6 의 「목표가 셋째 입력」
   * 전제가 입력 층에서 무언으로 무너진다) `axes_used` 엔 안 센다(§4-3 C4 — 세면 상태 없는
   * 학생도 쓸축수≥1 이 되어 「상태없음」이 원리상 안 나온다). */
  if (급수 != null && String(급수) !== '') 줄들.push(절단(`급수: ${급수}`));
  if (목표 != null && String(목표) !== '') 줄들.push(절단(`목표: ${목표}`));
  /* 시즌 나침반(㉢) — 말은 시즌줄 하나가 정본(없으면 null → 안 싣는다 · 널 규칙 그대로).
   * 절단은 이 층 규격(§6-2)이 이긴다 — 머리말 인코딩 규칙 참조. */
  const 시즌 = 시즌줄(시즌목표);
  if (시즌) 줄들.push(절단(시즌));
  /* 입학 나침반(㉢ · 2026-09-05) — 「왜 배우나」·「토픽 쓸 곳」. 시즌 목표 «뒤»에 붙인다:
   * 앞에 끼우면 이미 쌓인 요약 문자열의 줄 순서가 바뀌어 `generation_input_text` 대조가
   * 깨진다(머리말 「순서 — 재정렬 금지」). 이 둘도 목표 조각이라 `axes_used` 엔 안 센다.
   * ⚠ 이 층의 축줄상한 절단을 받는다 — 입구 상한은 500 이지만 여기는 «요약»이다(§6-2). */
  for (const 줄 of 목적줄들({ why_learning: 왜배우나, topik_use: 토픽쓸곳 })) 줄들.push(절단(줄));

  const 상류 = (상태.evidence_refs && typeof 상태.evidence_refs === 'object') ? 상태.evidence_refs : {};
  const 원사건 = Array.isArray(상류.사건) ? 상류.사건.map(String) : [];
  return {
    요약: 줄들.join('\n'),
    쓸축수: axes_used.length,
    axes_used,
    evidence_refs: {
      events: 원사건.slice(0, 근거상한),      // 원천 배열 순서 그대로 앞 50(C4 — 시각 정렬은 수행 불가)
      as_of: 상류.as_of ?? null,
      window_days: 상류.창일수 ?? null,        // 값 = 그 산출이 실제로 쓴 창(상수 아님 · §6-1)
      axes_used,
      truncated: 원사건.length > 근거상한,     // 「이 봉투에서 잘렸다」 — 원래 개수의 정본은 상류 `잘림`
    },
  };
}

module.exports = { 과제요약, 근거상한, 축줄상한 };
