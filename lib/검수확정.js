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
 *   정본은 DB CHECK(`pipeline_jobs_discard_reason_c*` — 접미는 현행 계약판 · c11 이 이름째
 *   갈았고 배선은 like 패턴으로 읽어 접미를 안 탄다) 하나고, 산문 사본 둘은 검수자가
 *   읽는 자리라 남겨 `tests/폐기사유.test.js` 가 CHECK 와 대조한다. 코드까지 베끼면 **네 번째
 *   사본**이 되고 그 검사는 코드를 안 본다. 그래서 배선이 CHECK 정의를 읽어 오고 이 파일은
 *   그것을 **파싱만** 한다(`폐기어휘`). 값목록 사본이 이 저장소에서 낡은 것이 이미 두 번이다(F285).
 *
 * ■ ⚠ 청취 게이트의 재료 — 2026-08-09 「없음」 → 2026-08-10 **생겼고, 재 보니 게이트가 못 선다**
 *   ㉠ 08-09 실측: 게이트 ①은 「저신뢰 구간 길이 합」을 문턱으로 쓰는데 `submissions.stt_segments`
 *      에 **쓰는 코드가 0줄**이라 이 함수가 내는 문턱은 언제나 하한 3초였다.
 *   ㉡ 08-10 실측(`ccee460`): 생산자는 그 뒤 섰고, 리허설 907건에 세그먼트가 0이던 것은 배선이
 *      아니라 **재료**였다(오디오가 붙은 행이 전부 0.1초 무음 WAV — 전사가 죄다 「고맙습니다.」인
 *      것이 무음 환각의 자국이다). 한국어 TTS 실말소리를 정상 통로로 태워 16.2초→4조각 ·
 *      59.6초→14조각을 얻었다. 그 위에서 아래 두 상수를 처음으로 쟀다 — 결과는 각 상수 옆에.
 *   🔑 **그래도 오늘 게이트는 여전히 못 선다** — 이유가 「재료 0」에서 「해상도 30초」로 바뀌었을
 *      뿐이다(아래 `저신뢰문턱`). 과제 발화 대부분이 한 윈도우 안이라 문턱이 내는 값은 실질적으로
 *      **「발화 전체 길이」 또는 「하한 3초」 둘뿐**이고, 그 사이의 「이 구간만」은 아직 없다.
 *      🚫 이것을 「게이트가 선다」로 읽지 않는다. 🚫 상수를 옮겨 푸는 것으로도 읽지 않는다.
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

/* 저신뢰의 경계.
 * ✅ **2026-08-10 실측 — 값이 아니라 해상도의 문제였다**(`ccee460` · 머리말 ㉡).
 *   59.6초 오디오 14조각의 `avg_logprob` 이 **서로 다른 값 3개**뿐이고 경계가 27초·56초 —
 *   Whisper 의 **30초 디코딩 윈도우**와 대응한다. 같은 윈도우의 모든 조각에 같은 값이 복사돼
 *   온다(`no_speech_prob` 도 같고 `confidence` 는 그 파생이라 같이 간다).
 *   ⇒ 30초 미만 발화는 **한 윈도우**라 전 조각이 통째로 저신뢰이거나 통째로 고신뢰다.
 *   ⇒ **문턱을 0.7 에서 어디로 옮겨도 이 성질은 안 바뀐다.** 그래서 값은 그대로 둔다 —
 *      바꿔야 할 것은 상수가 아니라 **세그먼트별 신뢰도를 실제로 주는 재료**다.
 * ⚠ 아직 못 잰 것(잰 것처럼 적지 않는다): 실측이 **합성 발화**라 관측 구간이 0.87~0.90 뿐이고
 *   **저신뢰 쪽은 한 번도 안 봤다.** 더듬는 실학생 발화가 와야 이 경계가 처음 시험된다.
 * 🚫 그때까지 이 값을 「검증됐다」로 인용하지 않는다. */
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

/** `stt_segments`(jsonb · 모양이 안 정해진 칸)를 **한 모양으로 편다.**
 *
 *  🔑 서버 게이트(`청취문턱`)와 검수 화면(구간 단위 청취 · UX ②)이 **같은 해석을 쓴다.**
 *    각자 읽으면 화면이 「이 구간만 들으면 된다」고 칠한 자리와 서버가 요구하는 문턱이
 *    갈리고, 그 갈림의 증상은 **승인이 안 되는데 이유를 화면이 못 말하는 것**이다.
 *    갈라질 수 있는 판정은 하나에서 파생시킨다(이 저장소에서 같은 병이 여러 번 났다).
 *
 *  ⚠ 단위를 **세그먼트가 스스로 말하게** 한다: `start_ms`·`end_ms` 가 있으면 밀리초,
 *    없으면 `start`·`end` 를 초로 읽는다. 생산자가 0인 지금 단위를 한쪽으로 가정하면
 *    그 가정이 1000배 틀린 문턱으로 굳는다 — 둘 다 받고, 어느 쪽도 없으면 그 조각을 버린다.
 *  🔴 신뢰도가 **없는** 조각은 저신뢰가 아니다 — 「안 잰 것」과 「나쁜 것」은 다르다.
 *
 *  @returns {{시작ms:number, 끝ms:number, 신뢰:number|null, 저신뢰:boolean, 글:string|null}[]}
 */
function 세그먼트펴기(세그먼트들) {
  if (!Array.isArray(세그먼트들)) return [];
  const 펴진 = [];
  for (const 조각 of 세그먼트들) {
    if (!조각 || typeof 조각 !== 'object') continue;
    const ms단위 = Number.isFinite(Number(조각.start_ms)) && Number.isFinite(Number(조각.end_ms));
    const 시작 = ms단위 ? Number(조각.start_ms) : Number(조각.start) * 1000;
    const 끝 = ms단위 ? Number(조각.end_ms) : Number(조각.end) * 1000;
    if (!Number.isFinite(시작) || !Number.isFinite(끝) || 끝 <= 시작) continue;
    const c = Number(조각.confidence);
    const 신뢰 = Number.isFinite(c) ? c : null;
    펴진.push({
      시작ms: 시작,
      끝ms: 끝,
      신뢰,
      저신뢰: 신뢰 !== null && 신뢰 < 저신뢰문턱,
      글: typeof 조각.text === 'string' ? 조각.text : null,
    });
  }
  return 펴진;
}

/** 청취 문턱(ms) — 저신뢰 구간 길이의 합. 재료가 없으면 하한.
 *  @returns {{ms: number, 재료: boolean}} 재료=false 면 문턱은 하한이고 그 사실이 응답·로그로 간다.
 */
function 청취문턱(세그먼트들) {
  const 펴진 = 세그먼트펴기(세그먼트들);
  if (펴진.length === 0) return { ms: 하한ms, 재료: false };
  let 합 = 0;
  for (const s of 펴진) {
    if (s.저신뢰) 합 += s.끝ms - s.시작ms;
  }
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

/* ── 골든 판정(M2 · `POST /v1/teach/gold/judge`) ─────────────────────────
 *
 * 🔑 **여기가 검수와 방향이 반대인 자리다.** 검수자는 세 텍스트를 내고 서버가 `판정()` 으로
 *   verdict 를 **파생**한다(계약 :123 「서버가 파생 — 사람이 고르지 않는다」의 주어가 그것이다).
 *   강사의 산출물은 **판정 그 자체**라 verdict 가 입력이고, 서버는 그것을 파생하는 대신
 *   **정합을 검증**한다. 같은 어휘·같은 NFC 정규화를 쓰므로 두 방향이 이 파일에 함께 산다 —
 *   가르면 정규화가 두 번째 사본이 되고, 그 사본이 갈리는 날 라벨이 뒤집히는데 증상이 없다.
 */

/** 골든 판정에서 **텍스트를 싣는 갈래는 ③ 하나뿐이다**(설계 §3). ①② 는 null 로 저장한다. */
const 텍스트내는판정 = VERDICT.수정;

/**
 * `POST /v1/teach/gold/judge` 요청 검증 — 모양과 **갈래 정합**만 본다(AI 교정문 대조는 배선).
 *
 * 🔴 ①② 에 `corrected_text`·`error_tags` 를 싣는 것을 **거절**한다. 조용히 버리지 않는 이유:
 *   강사가 편집기에 뭔가 써 놓고 버튼만 ② 를 누른 경우, 버리면 그 사람의 입력이 말없이
 *   사라지고 「저장됐다」가 돌아온다. 거절해야 화면이 「①②는 고침을 안 받는다」를 말할 수 있다.
 *   왜 아예 안 싣나 = 학생의 **최신 1건 답장 화면**을 옛 문장의 확인 카드가 점거하고,
 *   ① 에는 「선생님이 고쳐 줬어요」가 **안 고친 행 위에** 찍힌다(설계 §3 · 반박 C4).
 *
 * @returns {{값: object|null, 이유: string|null, 칸: string|null}}
 */
function 골든판정요청(본문) {
  const b = 본문 && typeof 본문 === 'object' ? 본문 : {};
  const 거절 = (칸, 이유) => ({ 값: null, 이유, 칸 });

  if (!uuid꼴.test(String(b.reviewed_correction_id ?? ''))) {
    return 거절('reviewed_correction_id', 'reviewed_correction_id(uuid)가 필요합니다');
  }

  /* 어휘는 `VERDICT` 하나에서 온다 — 배선이 DB CHECK 와 대조하는 것과 같은 세 값이다
   * (`tests/검수확정.test.js` ②가 그 사본을 기계로 물린다). */
  const 어휘 = Object.values(VERDICT);
  const verdict = typeof b.verdict === 'string' ? b.verdict.normalize('NFC') : '';
  if (!어휘.includes(verdict)) {
    return 거절('verdict', `verdict 는 ${어휘.map((v) => `「${v}」`).join(' · ')} 중 하나입니다`);
  }
  const 고침갈래 = verdict === 텍스트내는판정;

  for (const 칸 of ['corrected_text', 'verdict_reason', 'l1_source_phrase']) {
    if (문자열아니면(b[칸])) return 거절(칸, `${칸} 은 문자열입니다`);
  }
  if (b.error_tags !== null && b.error_tags !== undefined && !Array.isArray(b.error_tags)) {
    return 거절('error_tags', 'error_tags 는 문자열 배열입니다');
  }
  if (b.rubric_scores !== null && b.rubric_scores !== undefined
      && (typeof b.rubric_scores !== 'object' || Array.isArray(b.rubric_scores))) {
    return 거절('rubric_scores', 'rubric_scores 는 객체입니다');
  }

  const 고침 = 정규화(b.corrected_text);
  const 태그 = (b.error_tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  const 사유 = 정규화(b.verdict_reason);

  if (고침갈래) {
    if (고침 === '') return 거절('corrected_text', `「${텍스트내는판정}」 은 고친 문장이 필요합니다`);
    /* 🔑 ③ 의 사유만 필수다(설계 §10-③ — ①② 는 v1 선택, 기입률 실측이 쌓이면 게이트를 판정).
     *   AI 가 틀렸다는 판정은 **왜 틀렸는지가 곧 라벨의 값**이라 빈 채로 받으면 라벨이 반쪽이다. */
    if (사유 === '') return 거절('verdict_reason', `「${텍스트내는판정}」 은 사유가 필요합니다`);
  } else {
    if (고침 !== '') return 거절('corrected_text', `「${verdict}」 에는 고친 문장을 싣지 않습니다`);
    if (태그.length) return 거절('error_tags', `「${verdict}」 에는 오류 태그를 싣지 않습니다`);
    if (b.rubric_scores !== null && b.rubric_scores !== undefined) {
      return 거절('rubric_scores', `「${verdict}」 에는 첨삭 점수를 싣지 않습니다`);
    }
    if (정규화(b.l1_source_phrase) !== '') {
      return 거절('l1_source_phrase', `「${verdict}」 에는 모국어 출처를 싣지 않습니다`);
    }
  }

  return {
    값: {
      reviewed_correction_id: String(b.reviewed_correction_id),
      verdict,
      /* ①② 는 **저장 자체가 빈 값**이다 — 위 🔴 의 처방이 여기서 물리로 굳는다.
       * ⚠ `error_tags` 는 `not null default '{}'` 라(c6 :466) null 이 아니라 **빈 배열**이다.
       *   빈 배열은 `array_length(...,1) is null` 이라 학생 조회의 빈 카드 필터를 그대로
       *   통과 못 한다(`functions/corrections:167`) — 물리 제약과 화면 처방이 여기서 만난다. */
      corrected_text: 고침갈래 ? 고침 : null,
      error_tags: 고침갈래 ? 태그 : [],
      l1_source_phrase: 고침갈래 && 정규화(b.l1_source_phrase) !== '' ? String(b.l1_source_phrase) : null,
      rubric_scores: 고침갈래 ? (b.rubric_scores ?? null) : null,
      /* 🚫 서버가 아무것도 자동 기입하지 않는다(검수 계약 :277 그대로 — 기계 문자열 금지).
       *   빈 사유는 `null` 이지 「사유 없음」 같은 문장이 아니다. */
      verdict_reason: 사유 === '' ? null : 사유,
    },
    이유: null,
    칸: null,
  };
}

/**
 * 배선이 AI 교정문을 읽은 **뒤** 거는 정합 — 순수 규칙이라 여기 둔다(배선이 각자 적으면 갈라진다).
 *
 * 🔴 ③ 인데 낸 문장이 AI 교정과 **같으면** 그것은 ② 다. 그대로 받으면 성적표에서 그 행이
 *   「AI 가 틀렸다」로 세어져 **승률이 거짓으로 내려간다** — 부호가 뒤집히는 오염이다.
 * 🔑 ③ 인데 낸 문장이 **원문 전사와 같은 것**도 막는다: 그건 ① 이고, 안 막으면 과교정률
 *   계기판(설계 §5)이 그만큼 낮게 나온다.
 *
 * @returns {string|null} 어긋난 이유(사람이 읽는 문구) · 정합이면 null
 */
function 골든정합({ verdict, corrected_text, ai교정문, 전사 }) {
  if (verdict !== 텍스트내는판정) return null;
  const 낸것 = 정규화(corrected_text);
  if (낸것 === 정규화(ai교정문)) {
    return `AI 교정과 같은 문장입니다 — 그대로 두려면 「${VERDICT.AI}」 를 골라 주세요`;
  }
  if (낸것 === 정규화(전사)) {
    return `학생이 말한 문장 그대로입니다 — 고칠 것이 없다면 「${VERDICT.원문}」 을 골라 주세요`;
  }
  return null;
}

module.exports = {
  VERDICT, 하한ms, 저신뢰문턱, 텍스트내는판정,
  정규화, 판정, 세그먼트펴기, 청취문턱, 폐기어휘, 승인요청, 폐기요청,
  골든판정요청, 골든정합,
};
