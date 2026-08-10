'use strict';
/**
 * 선택로그 — S1-5 「골라서 답하기」가 낼 `choice.selected` 의 **조립기**. 순수 함수만.
 *
 * ■ 무엇이 어려운 자리인가 (P0 §275 · C0 §156 · 절단문서 ①-8)
 *   고른 것을 적는 것은 쉽다. 어려운 것은 **「이 학생이 좋아해서 골랐다」와 「우리가 밀어서
 *   골랐다」를 나중에 가를 수 있게** 적는 것이다. 그래서 계약이 9칸을 전부 필수로 건다:
 *   무엇을 보여줬나(`options_shown`) · 그것이 **몇 번째 자리**에 있었나(`position`) ·
 *   우리가 민 것은 무엇인가(`recommended_option`). 셋 중 하나라도 빠지면 2년차 개인화 추천의
 *   근거가 통째로 사라지고, **그 손실은 소급이 없다**(그때 무엇을 어느 자리에 보여줬는지는
 *   다시 알 길이 없다).
 *
 * ■ 🔴 자리를 섞는 것이 이 파일의 값이다
 *   추천을 늘 첫째 자리에 두면 「1번을 습관적으로 고르는 손버릇」과 「그 선택지를 좋아함」이
 *   **영원히 같은 모양**이 된다. 그래서 표시 순서를 섞고 그 순서를 `options_shown` 에 그대로
 *   남긴다 — 섞기를 주입받는 것은 시험을 결정적으로 만들기 위해서다(`Math.random` 직접 호출 금지).
 *
 * ■ 🔴 `latency_ms` 는 **단조 시계**로 잰다
 *   이 값은 `말하기_설계 §5` 가 「확신도의 대체물」로 지목한 칸이다. 벽시계 두 시점의 차로
 *   재면 그 사이 시각 동기화·타임존 변경이 **음수나 몇 시간짜리 값**을 만들고, 그 행은 오류가
 *   아니라 «아주 오래 망설인 학생»으로 읽힌다. C0 가 「기기 시계는 못 믿는다」로 이미 정렬
 *   근거에서 뺀 것과 같은 축이다 — 그래서 여기 들어오는 두 값은 **경과 시계**(performance.now)여야
 *   하고, 음수는 조립 단계에서 버린다(`null` = 「안 쟀다」).
 *
 * ■ 🔴 택1을 **조립기가 판정한다**
 *   `selected_option` / `skipped` / `rejected_all` 은 계약상 택1이다. 화면마다 이 분기를 적으면
 *   「아무것도 안 고르고 넘긴 것」과 「둘 다 아니라고 답한 것」이 화면마다 다르게 접힌다 —
 *   그 둘은 성향 축에서 **정반대 신호**다(무관심 vs 뚜렷한 거절).
 *
 * ⚠ 이 파일은 **아직 생산자가 아니다.** 사건을 실제로 내는 것은 선택 화면이고 그 화면은
 *   아직 없다(`lib/이벤트검증.js` 생산자 장부의 `choice.selected` 는 그대로 「사유」다).
 *   화면이 서는 커밋에서 장부를 파일로 바꾸고 **엔진 도달을 같은 커밋에** 낸다 —
 *   `생산자섰는데도달0상한 = 0` 이라 생산자만 내면 그 자리에서 막힌다.
 */

/** 계약이 요구하는 보기 모양 — `{option_id, label}`(C0 §156). id 는 안 바뀌는 조인 키,
 *  label 은 **그때 표시된 문구의 스냅샷**이다(문구를 개정해도 옛 행이 살아남는 이유). */
function 보기인가(o) {
  return !!o && typeof o === 'object'
    && o.option_id !== undefined && o.option_id !== null && o.option_id !== ''
    && typeof o.label === 'string' && o.label !== '';
}

/**
 * 표시 순서를 **확정한다.** 화면은 이 결과가 준 순서대로 그려야 한다 —
 * 그리지 않으면 행에 적힌 자리와 학생이 실제로 본 자리가 갈리고, 그 갈림은 증상이 없다.
 *
 * @param {Array<{option_id:string,label:string}>} 선택지들  2개 이상
 * @param {string|null} 추천id  우리가 미는 것(없으면 null — 밀지 않은 날도 정직하게 적는다)
 * @param {(n:number)=>number[]} [섞기]  길이 n → 순열. 기본은 무작위. 시험은 항등·역순을 넣는다
 * @returns {{options_shown:Array, recommended_option:string|null}|null} 모양이 아니면 null
 */
function 보기세우기(선택지들, 추천id = null, 섞기 = 무작위순열) {
  if (!Array.isArray(선택지들) || 선택지들.length < 2) return null;
  if (!선택지들.every(보기인가)) return null;
  const ids = 선택지들.map((o) => String(o.option_id));
  /* 🔴 id 중복은 모양 위반이다 — 조인 키가 겹치면 「무엇을 골랐나」가 두 곳을 가리킨다
   *   (`이벤트검증.보기id들` 과 같은 판정 · 여기서 먼저 막아 400 을 왕복하지 않는다). */
  if (new Set(ids).size !== ids.length) return null;
  /* 추천이 보기 안에 없으면 조립을 거부한다. 서버가 없는 것을 밀었다고 적는 순간
   * 「밀어준 것」 축이 통째로 거짓이 된다 — 지어내느니 안 낸다. */
  if (추천id !== null && !ids.includes(String(추천id))) return null;

  const 순열 = 섞기(선택지들.length);
  if (!Array.isArray(순열) || 순열.length !== 선택지들.length
      || new Set(순열).size !== 순열.length
      || 순열.some((i) => !Number.isInteger(i) || i < 0 || i >= 선택지들.length)) return null;

  return {
    options_shown: 순열.map((i) => ({ option_id: String(선택지들[i].option_id), label: 선택지들[i].label })),
    recommended_option: 추천id === null ? null : String(추천id),
  };
}

/** Fisher–Yates. 화면이 매번 다른 자리를 보여주게 하는 유일한 자리다. */
function 무작위순열(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 경과 시계 두 값 → `latency_ms`. 못 쟀거나 말이 안 되면 `null`(「0」이 아니다). */
function 걸린시간(시작, 끝) {
  if (!Number.isFinite(시작) || !Number.isFinite(끝)) return null;
  const d = 끝 - 시작;
  /* 🔴 음수는 「빨랐다」가 아니라 「시계가 뒤로 갔다」다. 0 으로 접으면 그 행이
   *   «즉답»으로 읽혀 확신도 축이 조용히 거짓이 된다. */
  if (!Number.isFinite(d) || d < 0) return null;
  return Math.round(d);
}

/**
 * `choice.selected` 의 payload 를 조립한다.
 *
 * @param {object} 재료
 * @param {{options_shown:Array,recommended_option:string|null}} 재료.보기  `보기세우기` 의 결과
 * @param {string|null} [재료.고른것]      학생이 고른 `option_id`
 * @param {boolean} [재료.전량거절]        「둘 다 아니에요」
 * @param {number|null} [재료.시작]        화면에 보기가 뜬 순간(경과 시계)
 * @param {number|null} [재료.끝]          확정한 순간(경과 시계)
 * @param {number} [재료.바꾼횟수]         고른 뒤 마음을 바꾼 횟수
 * @param {string|null} [재료.사유]        `selection_reason` — 안 물었으면 null
 * @returns {object|null} payload. 재료가 계약을 못 지키면 null(= 보내지 않는다)
 */
function 선택payload({ 보기, 고른것 = null, 전량거절 = false, 시작 = null, 끝 = null, 바꾼횟수 = 0, 사유 = null } = {}) {
  if (!보기 || !Array.isArray(보기.options_shown) || 보기.options_shown.length < 2) return null;
  const ids = 보기.options_shown.map((o) => String(o.option_id));

  /* 택1 판정 — 여기 한 곳에서만 한다(화면마다 접으면 「무관심」과 「거절」이 섞인다). */
  const 골랐다 = 고른것 !== null && 고른것 !== undefined && 고른것 !== '';
  if (골랐다 && 전량거절) return null;              // 둘 다 참인 상태는 뜻이 없다
  if (골랐다 && !ids.includes(String(고른것))) return null;  // 안 보여준 것을 골랐다고 적지 않는다

  const payload = {
    options_shown: 보기.options_shown,
    recommended_option: 보기.recommended_option ?? null,
    /* 🔴 **고른 것의 자리**이고 **1부터 센다**(L0 §140 정본 예시: 보기 3개 중 `cs2` 를 골랐고
     *   `position: 2` — 0 부터 셌으면 1 이었다). 이 값이 있어야 「1번을 습관적으로 누르는
     *   손버릇」과 「그 선택지를 좋아함」이 갈린다.
     * 🔴 **안 골랐으면 가리킬 자리가 없어 `null` 인데, 지금 계약은 이 칸을 무조건 필수로 건다**
     *   (`이벤트검증.이벤트별필수['choice.selected']` · `널허용` 에도 없다). 그래서 `skipped` ·
     *   `rejected_all` 갈래는 **원리상 계약을 통과하지 못한다** — 택1에 넣어 둔 두 갈래를
     *   같은 계약이 막고 있다(2026-08-10 회귀가 잡았다 · 처방은 계약 판정 자리라 여기서 안 한다).
     *   👉 여기서 0 이나 -1 로 지어내지 않는다: 그러면 「안 골랐다」가 「첫째를 골랐다」로 적힌다. */
    position: 골랐다 ? ids.indexOf(String(고른것)) + 1 : null,
    selected_option: 골랐다 ? String(고른것) : null,
    skipped: !골랐다 && !전량거절,
    rejected_all: !!전량거절,
    /* 마음을 바꾼 것은 **횟수가 아니라 여부**로 계약이 받는다(`changed_selection`).
     * 횟수를 담을 칸이 없어서 여기서 접는다 — 없는 칸을 지어내지 않는다. */
    changed_selection: Number(바꾼횟수) > 0,
    latency_ms: 걸린시간(시작, 끝),
    /* 안 물어본 화면은 이 칸을 **null 로** 싣는다 — 빈 문자열로 두면 「말 안 함」과
     * 「모름」이 같은 모양이 된다(`널이거나있음` 과 같은 축). */
    selection_reason: typeof 사유 === 'string' && 사유 !== '' ? 사유 : null,
  };
  return payload;
}

module.exports = { 보기세우기, 선택payload, 걸린시간, 보기인가, 무작위순열 };
