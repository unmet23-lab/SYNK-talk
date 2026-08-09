/* 검수 확정 — 승인·폐기의 **순수 규칙만** (docs/검수_내부계약.md §5).
 *
 * ■ 왜 배선(Edge Function)이 아니라 여기 사나
 *   이 파일이 정하는 것은 **라벨의 뜻**이다. verdict 를 한 칸 잘못 내면 증상이 없다 —
 *   행은 정상으로 쌓이고 검수자는 자기가 누른 대로 저장됐다고 믿는다. 틀린 것은 2년 뒤
 *   그 라벨로 학습한 모델에서만 드러나고, 그때는 어느 행이 오염됐는지 가릴 수 없다.
 *   배선 안에 두면 회귀가 문자열로만 닿는다(`lib/검수커서.js` 와 같은 판정).
 *
 * ■ verdict 는 **사람이 고르지 않는다** — 세 텍스트에서 파생한다
 *   발주 §3 이 못박은 순서가 이 파일의 급소다(심문 합집합 08-08). 두 칸(전사·교정문)의
 *   「변경 여부」로는 세 값을 못 내고, 순서를 바꾸면 **두 오답이 각각 조용히 성립한다**:
 *     ▸ 「AI 가 원문을 그대로 반환한 정상 문장」 — 검수자가 아무것도 안 고쳤으니 변경 0이라
 *       `AI 교정이 맞다` 로 접히는데, 사실은 고칠 것이 없었던 것이다.
 *     ▸ 「사람이 AI 교정을 원문으로 되돌린 것」 — 편집이 있었으니 `고칠 곳이 있다` 로 접히는데,
 *       그건 **AI 가 틀렸다**는 뜻이다. 라벨은 학생이 틀렸다고 적힌다.
 *   그래서 ①`③=①` ②`③=②` ③나머지 **이 순서**다.
 *
 * ■ 🔴 폐기 사유의 값목록은 **여기 없다**
 *   정본은 DB CHECK(`pipeline_jobs_discard_reason_c10`) 하나고, 산문 사본 둘은 검수자가
 *   읽는 자리라 남겨 `tests/폐기사유.test.js` 가 CHECK 와 대조한다. 코드까지 베끼면 **네 번째
 *   사본**이 되고 그 검사는 코드를 안 본다. 그래서 배선이 CHECK 정의를 읽어 오고 이 파일은
 *   그것을 **파싱만** 한다(`폐기어휘`). 값목록 사본이 이 저장소에서 낡은 것이 이미 두 번이다(F285).
 *
 * ■ ⚠ 청취 게이트의 재료가 지금 **없다** — 정직하게 적는다
 *   게이트 ①은 「저신뢰 구간 길이 합」을 문턱으로 쓰는데, `submissions.stt_segments` 에
 *   **쓰는 코드가 이 저장소에 0줄**이다(2026-08-09 실측 · 읽는 곳 3 · 전사 통로도 안 채운다).
 *   그래서 오늘 이 함수가 내는 문턱은 **언제나 하한 3초**다. 그것을 「게이트가 선다」로 읽지
 *   않는다 — 지금 막는 것은 0초 승인뿐이고, 구간 단위 청취(UX ②)의 실효는 생산자가 서는 날
 *   함께 온다. 그 날 첫 실측 대상이 아래 `저신뢰문턱`·단위 해석 둘이다.
 */
'use strict';

/* verdict 세 값 — 정본은 DB CHECK `corrections_verdict_c10` 이다.
 * 여기 사본을 피할 수 없는 이유: 이 값은 클라이언트가 고르는 것이 아니라 **서버가 계산해
 * 넣는** 값이라 코드가 반드시 알아야 한다(폐기 사유는 고르는 값이라 검증만 하면 됐다).
 * 없앨 수 없는 사본은 기계에 물린다 — `tests/검수확정.test.js` 가 CHECK 와 대조한다. */
const VERDICT = Object.freeze({
  원문: '원문이 이미 맞다',
  AI: 'AI 교정이 맞다',
  수정: '고칠 곳이 있다',
});

/* 청취 하한 — 저신뢰 구간이 0이거나 잰 적이 없을 때(발주 §3 게이트 ①). */
const 하한ms = 3000;

/* 저신뢰의 경계. ⚠ **미측정 상수다** — 생산자가 0이라 오늘은 어떤 값을 넣어도 결과가 같다.
 * 실측 없이 정한 값을 「정해졌다」로 두지 않으려고 여기 한 자리에만 적는다. */
const 저신뢰문턱 = 0.7;

/** 텍스트 비교 정규화 — `trim` + **NFC**.
 *
 *  🔑 NFC 가 장식이 아니다: 같은 한글이 조합형(NFD)과 완성형(NFC) 두 바이트열로 오고
 *  (iOS·macOS 입력이 NFD 를 낸다), 그 둘을 `===` 로 비교하면 **눈에 같은 글자가 다르다**.
 *  그러면 아무것도 안 고친 확정이 `고칠 곳이 있다` 로 적힌다 — 라벨이 뒤집히는데 증상이 없다.
 *  🚫 그 이상은 정규화하지 않는다(공백 접기·구두점 제거). 「다른 것을 같다고」 판정하기
 *     시작하면 이 함수가 내는 라벨이 사람이 본 화면과 갈린다. */
function 정규화(s) {
  return String(s ?? '').normalize('NFC').trim();
}

/** verdict 자동 판정 — 세 텍스트를 **순서대로** 본다(머리말).
 *  @returns {'원문이 이미 맞다'|'AI 교정이 맞다'|'고칠 곳이 있다'} */
function 판정({ 검증전사, ai교정문, 최종교정문 }) {
  const 최종 = 정규화(최종교정문);
  /* ① 학생이 말한 그대로가 최종 교정문이면 고칠 것이 없었던 것이다(②와 무관하게 먼저 본다). */
  if (최종 === 정규화(검증전사)) return VERDICT.원문;
  /* ② 최종이 AI 교정과 같다 — AI 가 맞았다. */
  if (최종 === 정규화(ai교정문)) return VERDICT.AI;
  return VERDICT.수정;
}

/** 청취 문턱(ms) — 저신뢰 구간 길이의 합. 재료가 없으면 하한.
 *
 *  ⚠ 단위를 **세그먼트가 스스로 말하게** 한다: `start_ms`·`end_ms` 가 있으면 밀리초,
 *    없으면 `start`·`end` 를 초로 읽는다. 생산자가 0인 지금 단위를 한쪽으로 가정하면
 *    그 가정이 1000배 틀린 문턱으로 굳는다 — 둘 다 받고, 어느 쪽도 없으면 「재료 없음」이다.
 *  @returns {{ms: number, 재료: boolean}} 재료=false 면 문턱은 하한이고 그 사실이 응답·로그로 간다.
 */
function 청취문턱(세그먼트들) {
  if (!Array.isArray(세그먼트들) || 세그먼트들.length === 0) return { ms: 하한ms, 재료: false };
  let 합 = 0;
  let 잰것 = 0;
  for (const 조각 of 세그먼트들) {
    if (!조각 || typeof 조각 !== 'object') continue;
    const ms단위 = Number.isFinite(Number(조각.start_ms)) && Number.isFinite(Number(조각.end_ms));
    const 시작 = ms단위 ? Number(조각.start_ms) : Number(조각.start) * 1000;
    const 끝 = ms단위 ? Number(조각.end_ms) : Number(조각.end) * 1000;
    if (!Number.isFinite(시작) || !Number.isFinite(끝) || 끝 <= 시작) continue;
    잰것 += 1;
    const c = Number(조각.confidence);
    /* 신뢰도가 없는 조각은 **저신뢰로 세지 않는다** — 「안 잰 것」을 「나쁜 것」으로 읽으면
     * 문턱이 발화 전체 길이로 부풀고, 그 순간 UX ② 와 이 게이트가 서로를 무효화한다. */
    if (!Number.isFinite(c) || c >= 저신뢰문턱) continue;
    합 += 끝 - 시작;
  }
  if (잰것 === 0) return { ms: 하한ms, 재료: false };
  /* 저신뢰 구간이 하나도 없으면(=전부 또렷하면) 하한으로 되돌린다 — 발주 §3 「0이면 하한 3초」. */
  return { ms: 합 > 0 ? Math.round(합) : 하한ms, 재료: true };
}

/** 폐기 사유 어휘 — `pg_get_constraintdef` 문자열에서 뽑는다(머리말 🔴).
 *
 *  정규화된 CHECK 정의는 값마다 캐스트를 달고 나온다:
 *    `… (status = 'discarded'::engine.job_status) AND (discard_reason = ANY (ARRAY['…'::text, …]))`
 *  🔑 `::text` 를 **요구**하는 것이 상태값을 거르는 장치다 — 그쪽은 enum 캐스트라 자동으로
 *    빠진다. 따옴표만 세면 상태값이 사유 목록에 섞인다.
 *  ⚠ 위 예시에 **실제 어휘를 안 적는다** — 적는 순간 이 파일이 넷째 사본이 되고,
 *    `tests/폐기사유.test.js` 는 산문 둘만 보므로 그 사본은 아무도 안 본다.
 *  @returns {string[]} 순서 그대로. 빈 배열이면 **DB 에 그 CHECK 가 없다**(= 조각 미적용).
 */
function 폐기어휘(constraintdef) {
  const 정의 = String(constraintdef ?? '');
  const 안쪽 = /ARRAY\[([^\]]*)\]/.exec(정의);
  const 훑을것 = 안쪽 ? 안쪽[1] : 정의;
  return [...훑을것.matchAll(/'((?:[^']|'')*)'::text/g)].map((m) => m[1].replace(/''/g, "'"));
}

/* ── 요청 모양 ──────────────────────────────────────────────────── */

const uuid꼴 = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u;

const 문자열아니면 = (v) => v !== null && v !== undefined && typeof v !== 'string';

/** `POST /v1/review/approve` 요청 검증 — 모양만 본다(게이트는 배선이 DB 를 보고 잰다).
 *  @returns {{값: object|null, 이유: string|null, 칸: string|null}} */
function 승인요청(본문) {
  const b = 본문 && typeof 본문 === 'object' ? 본문 : {};
  const 거절 = (칸, 이유) => ({ 값: null, 이유, 칸 });

  for (const 칸 of ['submission_id', 'reviewed_correction_id']) {
    if (!uuid꼴.test(String(b[칸] ?? ''))) return 거절(칸, `${칸}(uuid)가 필요합니다`);
  }
  if (b.supersedes !== null && b.supersedes !== undefined && !uuid꼴.test(String(b.supersedes))) {
    return 거절('supersedes', 'supersedes 는 uuid 입니다');
  }

  /* 🔴 전사·교정문은 **빈 문자열도 거절**한다. 둘 다 비면 verdict 는 「원문이 이미 맞다」로
   *   접히는데(빈 것끼리 같다), 그건 사람이 아무것도 안 한 확정이 정답 라벨이 되는 자리다. */
  for (const 칸 of ['transcript_verified', 'corrected_text']) {
    if (문자열아니면(b[칸])) return 거절(칸, `${칸} 은 문자열입니다`);
    if (정규화(b[칸]) === '') return 거절(칸, `${칸} 이 비어 있습니다`);
  }
  for (const 칸 of ['explanation', 'l1_source_phrase']) {
    if (문자열아니면(b[칸])) return 거절(칸, `${칸} 은 문자열입니다`);
  }

  const 들은 = b.review_listened_ms;
  if (!Number.isInteger(들은) || 들은 < 0) {
    return 거절('review_listened_ms', 'review_listened_ms 는 0 이상의 정수(밀리초)입니다');
  }

  /* 태그는 **어휘를 여기서 안 검증한다** — 정본은 `계약/수집_교정_계약.json` 의 `오류태그` 이고
   * AI 행도 같은 수준(trim·빈 값 제거)으로 쓴다(`lib/교정엔진.js`). 한쪽만 조이면 사람 라벨이
   * AI 라벨보다 좁아지는데, 검수자가 고르는 태그는 화면의 닫힌 버튼이라 새는 입구가 아니다. */
  if (b.error_tags !== null && b.error_tags !== undefined && !Array.isArray(b.error_tags)) {
    return 거절('error_tags', 'error_tags 는 문자열 배열입니다');
  }
  const 태그 = (b.error_tags ?? []).map((t) => String(t).trim()).filter(Boolean);

  const 확신 = b.reviewer_confidence;
  if (확신 !== null && 확신 !== undefined) {
    if (typeof 확신 !== 'number' || !Number.isFinite(확신) || 확신 < 0 || 확신 > 1) {
      return 거절('reviewer_confidence', 'reviewer_confidence 는 0~1 의 수입니다');
    }
  }
  if (b.rubric_scores !== null && b.rubric_scores !== undefined
      && (typeof b.rubric_scores !== 'object' || Array.isArray(b.rubric_scores))) {
    return 거절('rubric_scores', 'rubric_scores 는 객체입니다');
  }
  if (b.promote !== null && b.promote !== undefined && typeof b.promote !== 'boolean') {
    return 거절('promote', 'promote 는 boolean 입니다');
  }

  return {
    값: {
      submission_id: String(b.submission_id),
      reviewed_correction_id: String(b.reviewed_correction_id),
      supersedes: b.supersedes ? String(b.supersedes) : null,
      transcript_verified: 정규화(b.transcript_verified),
      corrected_text: 정규화(b.corrected_text),
      error_tags: 태그,
      explanation: b.explanation ? String(b.explanation) : null,
      l1_source_phrase: b.l1_source_phrase ? String(b.l1_source_phrase) : null,
      rubric_scores: b.rubric_scores ?? null,
      reviewer_confidence: 확신 ?? null,
      review_listened_ms: 들은,
      /* 🚫 기본값은 **승격 안 함**이다. 빠뜨린 요청이 승격으로 접히면 「검수 완료 = 훈련 적격」이
       *   이름만 바꿔 성립한다(발주 §3 · 엔진도달 v1 이 P0 를 받은 그 자리). */
      promote: b.promote === true,
    },
    이유: null,
    칸: null,
  };
}

/** `POST /v1/review/discard` 요청 검증. 어휘 대조는 배선이 DB CHECK 로 한다(머리말 🔴). */
function 폐기요청(본문) {
  const b = 본문 && typeof 본문 === 'object' ? 본문 : {};
  if (!uuid꼴.test(String(b.submission_id ?? ''))) {
    return { 값: null, 이유: 'submission_id(uuid)가 필요합니다', 칸: 'submission_id' };
  }
  if (typeof b.reason !== 'string' || b.reason.trim() === '') {
    return { 값: null, 이유: 'reason(폐기 사유)이 필요합니다', 칸: 'reason' };
  }
  return {
    값: { submission_id: String(b.submission_id), reason: b.reason.trim() },
    이유: null,
    칸: null,
  };
}

module.exports = {
  VERDICT, 하한ms, 저신뢰문턱,
  정규화, 판정, 청취문턱, 폐기어휘, 승인요청, 폐기요청,
};
