/**
 * 서류관문제출 — G4 「서류 관문」이 낼 **사건들의 조립기**. 순수 함수만(네트워크·저장 0).
 *
 * ■ 자리 (발주_게임모듈.md G4 §6-1 두 스테이지 · §6-2 ⓑ · §6-6 봉투)
 *   순수 로직 3벌(`contents/서류관문문항.js`·`lib/서류관문.js`·`lib/게임스냅샷.js`)이 값
 *   재료를 대고, 여기가 **봉투**를 조립한다. 화면(2단계 커밋 몫)은 이 조립기가 낸 사건을
 *   큐(`lib/게임로그.js`)에 담아 `src/사건통로.js` 하나로 보낸다 — `POST /v1/events` 하나뿐이고
 *   **새 엔드포인트 0**. G2(`lib/보고서교정제출.js`)와 같은 규약이고, 갈리는 자리는 「턴이
 *   빈칸·변환으로 갈린다」와 「⑥ 구멍을 이 층이 진다」 둘이다.
 *
 * ■ 🔴 사건이 **둘로 갈린다** — 1단계가 `게임스냅샷.G4과제유형` 에 못박은 그대로
 *   `빈칸` = 닫힌 정답(기계 채점) → `quiz.answered` + `퀴즈응답` + `task_format='응답'`
 *   `변환` = 열린 산출(검수 큐)   → `submission.created` + `숙제제출` + 팩 `펴기().형식`
 *   섞으면 progress 제출 수가 부풀거나 검수 큐가 빈칸 채점을 빨아들인다(G4 §6-1 그 근거).
 *
 * ■ 🔴 §6-6 ⑥ 구멍은 **이 조립기가 진다** (⑨ 「막는 자리는 생산자 하나뿐」 패턴)
 *   `이벤트별필수['quiz.answered']` 는 `task_type` 하나라, 빈칸에 친 문자열이 빠진 행도
 *   검증기를 **원리상 통과**한다. G2 무산출에서는 그 구멍이 정확히 필요한 성질이었지만(산출물이
 *   정말 없다), G4 빈칸 제출은 산출물이 **있어야 하는** 사건이다 — 본문 없는 빈칸 제출이 새면
 *   「직접 써 본다」(이 모듈의 존재 이유)가 행에서 사라지는데 증상이 없다. 그래서 본문이 비면
 *   키를 빼는 게 아니라 **사건 자체를 null** 로 낸다(반쪽을 내느니 안 낸다 — G2 §9-② 규율).
 *   「모르겠어요」는 다른 사건이다: `모름제출사건` 이 `body_original` **키 자체 없음** +
 *   `skipped:true` 로 낸다 — 산출물이 없다는 것이 그 사건의 뜻이다(G2 무산출과 같은 무늬).
 *
 * ■ 🚫 안 싣는 것
 *   `confidence`(G4 확신도 질문은 이 판에 없다 — 묻지 않은 것을 실으면 그 축이 거짓이 된다) ·
 *   `is_correct`·판정(파생 · C0 §4-1 금지 — 즉시 표시는 연출이고 저장 판정은 서버 재채점이다
 *   · `lib/서류관문.채점` 한 함수를 둘이 쓴다) · `audio_ref`·`capture_meta`(쓰기라 잴 소리가
 *   없다 — 키 자체를 만들지 않는다 · §6-8 규칙 1) · `correction_id`(c8 — viewed/responded 에만).
 *
 * ■ 🔴 이 파일은 ESM 이다 — 앱 번들 쪽이라 동봉 대상이 아니다(`lib/보고서교정제출.js` 와 같은 자리).
 */

import { 검수확정, 펴기, 관문편성 } from '../contents/서류관문문항.js';
import { G4스냅샷, G4스냅샷모양판, G4과제유형, G4스냅샷인가 } from './게임스냅샷.js';
import { 칸들 } from './작성과정.js';

/* §6-1 표의 고정값. `task_type` 정본은 CJS 쪽(`게임스냅샷.G4과제유형`)이다 — 서버 배정
 * (deliver)과 같은 행 규격을 말해야 하는데 저쪽은 동봉이고 이쪽은 앱 번들이라, 여기 리터럴을
 * 두면 배정 행과 제출 행이 다른 통로 이름을 말하는 날이 온다(§6-8 규칙 3).
 * `task_format` 은 배정 행에 안 실리는 값이라 G1·G2 처럼 조립기가 고정값을 박는다 —
 * 빈칸 = '응답'(§6-1 표), 변환 = 팩 `펴기().형식`(문항이 정본 · v1 은 전부 '높임전환'). */
const 빈칸형식 = '응답';
/* 이탈의 「어디서 막혔나」 — 이 모듈의 **열린 산출 통로** 이름을 쓴다(G2 이탈 선례: 이탈은
 * 판정 없이 나간 것이라 산출 갈래 쪽 이름이다). v1 팩의 변환이 전부 높임전환이라 리터럴이
 * 정직하다 — `번역` 변환이 서는 날(몽골어 검수 확정 커밋) 이 줄을 다시 판정한다. */
const 이탈형식 = '높임전환';

/* 재수출 — 정의는 조립기 한 곳이다(정의 두 곳 금지 · `lib/게임제출.js` 와 같은 규약).
 * 🔑 별칭 재수출(`export { A as B }`)이 아니라 «지역 상수»로 받는다(G2 파일 규약 그대로). */
const 스냅샷모양판 = G4스냅샷모양판;
export { 스냅샷모양판 };

/**
 * 이 배정이 G4 인가 — 라우팅 판정. 정본은 `게임스냅샷.G4스냅샷인가` 하나다(값을 여기 다시
 * 적으면 갈라진 쪽이 조용히 통과한다). 🔴 거름망의 `게임스냅샷인가`(등록된 게임 «전부»)와
 * 다른 축이다 — 넓은 쪽을 여기 쓰면 G4 화면이 남의 배정을 연다.
 */
export function 게임과제인가(항목) {
  return G4스냅샷인가(항목 && 항목.task_snapshot);
}

/**
 * 배정 항목 → 화면·조립이 쓸 재료(앵커). **못 읽으면 null** — 지어내지 않는다.
 *
 * 🔑 `앵커시드` 는 배정 스냅샷의 `prompt_seed` 다 — G1·G2 와 **같은 칸**(스냅샷 «안» ·
 *   `lib/게임스냅샷.js` G2 머리말 「prompt_seed 는 공개다」의 실측을 그대로 승계).
 *   배정 행이 싣는 것은 관문 첫 턴(`g4t01.b1`) 하나고, 나머지 턴은 `관문재료` 가
 *   같은 팩에서 결정적으로 편다(G2 앵커 하나 규약 그대로).
 * 🔑 `level_snapshot`·`goal_snapshot`·`retry_of_event_id` 는 전부 서버 배정 행이 낸 값이다 —
 *   앱이 만드는 것은 하나도 없다(`lib/오늘과제.화면과제` 의 제출재료와 같은 규약).
 */
export function 게임재료(항목) {
  /* 🔴 fail-closed — 몽골어 검수 전 판은 학생에게 열지 않는다(발주_게임콘텐츠팩 §3).
   * 팩이 `검수확정 = false` 인 동안 이 함수는 **언제나 null** 이고, 라우팅이 이 null 을 받으면
   * 말하기 폴백으로 조용히 내려간다(G1·G2 와 같은 규율). */
  if (검수확정 !== true) return null;
  if (!게임과제인가(항목)) return null;
  if (!항목.task_ref) return null; // 큐와 못 잇는 제출은 만들지 않는다
  const 앵커시드 = String((항목.task_snapshot && 항목.task_snapshot.prompt_seed) || '');
  if (앵커시드 === '') return null;
  const 스냅샷 = G4스냅샷(앵커시드);
  if (!스냅샷) return null; // 못 펴는 시드 — 화면은 이 null 로 「읽지 못했다」를 정직하게 낸다
  return Object.freeze({
    앵커시드,
    스냅샷,
    task_ref: String(항목.task_ref),
    level_snapshot: 항목.level_snapshot === undefined ? null : 항목.level_snapshot,
    goal_snapshot: 항목.goal_snapshot === undefined ? null : 항목.goal_snapshot,
    retry_of_event_id: 항목.retry_of_event_id || null,
  });
}

/**
 * 한 관문(빈칸 3~5 + 변환 1)의 턴 재료 — 앵커 하나에서 **화면에 뜰 순서 그대로** 편다.
 *
 * 🔴 왜 화면이 아니라 여기인가 — 편성(`팩.관문편성`)과 스냅샷 조립(`G4스냅샷`)을 화면이 직접
 *   부르면 「그날 학생이 본 것」의 조립이 두 곳이 되고, 갈라지는 날 행에 적힌 턴과 화면에
 *   뜬 턴이 다르다(증상 없음 — G2 `앉음재료` 머리말 그대로).
 * 🔑 한 벌이 아니면 `null` — 반쪽 관문을 내지 않는다(턴 하나라도 못 펴면 그날 게임을 접고
 *   말하기가 나간다).
 * 🔴 `retry_of_event_id` 는 **앵커 턴만** 진다 — 서버가 「이 사건의 재제출」로 배정한 것은 그
 *   턴 하나다(G2 `앉음재료` 규약 그대로 — 전부 지면 나머지 턴이 남의 사건의 재제출로 적힌다).
 * 🔑 각 벌의 키 모양은 `게임재료()` 와 같다. G2 와 달리 `앵커시드` 는 턴마다 **안 바꾼다** —
 *   그 값의 뜻이 「이 관문의 앵커」라 바꾸면 이름이 거짓이 된다. 턴 자신의 열쇠는 언제나
 *   `스냅샷.prompt_seed` 다(§6-8 — 행에 남는 그 칸이 정본이다).
 *
 * @param {object} 재료 `게임재료()` 의 결과(앵커)
 * @returns {readonly object[]|null}
 */
export function 관문재료(재료) {
  if (검수확정 !== true) return null; // 게이트는 통로마다 다시 본다(fail-closed · `게임재료` 와 한 축)
  if (!재료 || !재료.앵커시드 || !재료.task_ref) return null;
  const 앵커 = 펴기(재료.앵커시드);
  if (!앵커) return null;
  const 순서 = 관문편성(앵커.관문id);
  if (!순서) return null;
  const 벌 = [];
  for (const 시드 of 순서) {
    const 스냅샷 = G4스냅샷(시드);
    if (!스냅샷) return null; // 반쪽 관문을 내지 않는다
    /* 변환 턴의 `task_format` 은 팩이 정본이라(머리말) **마운트 시점에 함께 편다** — 제출
     * 순간에 팩을 다시 열면 앉음 중 팩 개정(OTA)이 그 관문을 걷어 간 날, 학생이 친 변환문이
     * null 로 증발한다(적대 리뷰 P2-2 — 「그날 학생이 본 것」과 같은 시점의 값이어야 한다). */
    const 문항 = 펴기(시드);
    if (!문항) return null;
    벌.push(Object.freeze({
      ...재료,
      스냅샷,
      ...(문항.종류 === '변환' ? { 형식: 문항.형식 } : {}),
      retry_of_event_id: 시드 === 재료.앵커시드 ? 재료.retry_of_event_id : null,
    }));
  }
  return Object.freeze(벌);
}

/* ── 봉투 — 갈래 전부가 **같은 함수**를 지난다(값을 두 곳에 적으면 한쪽이 조용히 갈린다) ── */

function 봉투(재료, { correlation_id, idempotency_key, occurred_at }, task_type) {
  return {
    idempotency_key,
    /* 🔑 `event_type` 은 여기서 «안» 만든다 — 키가 아예 없으면 검증기 공통필수가 그 자리에서
     *   거절한다(명시적 null 은 오독을 부른다 · G2 봉투 규약 그대로). */
    occurred_at: occurred_at || new Date().toISOString(),
    correlation_id,
    level_snapshot: 재료.level_snapshot,
    goal_snapshot: 재료.goal_snapshot,
    task_type,
    /* 결과 변수 — 있을 때만 싣는다. `null` 을 박으면 「재제출 아님」과 「모른다」가 섞인다. */
    ...(재료.retry_of_event_id ? { retry_of_event_id: 재료.retry_of_event_id } : {}),
  };
}

/** 앉음 키·멱등키는 **호출자가 한 번 지어 들고 온다**(C0 §4-1 · 절단문서 ①-5·①-10).
 *  여기서 지으면 재시도마다 새 키가 나고, 그때부터 회선이 끊길 때마다 같은 것이 쌓인다. */
function 키있나(입력) {
  return !!(입력 && 입력.correlation_id && 입력.idempotency_key);
}

/* 잰 값만 싣는다 — 못 잰 체류를 0 으로 적으면 「즉시 답했다」가 된다(가장 값진 오독). */
const 지연칸 = (latency_ms) => (Number.isFinite(latency_ms) && latency_ms >= 0
  ? { latency_ms: Math.round(latency_ms) } : {});

/* compose_meta 가 한 벌인가 — `작성과정.칸들` 에서 파생한다(`lib/게임제출.한벌인가` 규약
 * 그대로 — 목록을 다시 적으면 갈라진다). 한 벌 아니면 키가 없다(§6-6 ⑨ 처분 규칙 1·3). */
const 한벌인가 = (o) => !!o && typeof o === 'object'
  && 칸들.every((k) => Number.isInteger(o[k]))
  && Object.keys(o).length === 칸들.length;

/* ── 세 갈래 + 이탈 ─────────────────────────────────────────────────────────── */

/**
 * 빈칸에 쳐서 냈다 → `quiz.answered` 하나 (§6-1 · 닫힌 정답 스테이지).
 *
 * @param {object} 턴재료 `관문재료()` 의 원소(빈칸 턴)
 * @param {object} 입력 { 본문, attempt_no, latency_ms?, correlation_id, idempotency_key, occurred_at? }
 * @returns {object|null} 보낼 사건. 재료가 모자라면 null(= 보내지 않는다).
 *
 * 🔴 `body_original` = **그 빈칸에 학생이 실제로 친 문자열 원문**이다(§6-2 ⓑ — 정규화·자동교정
 *   적용 전 값 · 정규화는 채점 «대조 시점»의 일이지 저장의 일이 아니다).
 * 🔴 본문이 비면 **사건 자체가 null** — 검증기의 ⑥ 구멍(quiz.answered 는 산출물 무요구)을
 *   이 줄이 진다(머리말). 비우고 넘긴 것은 `모름제출사건` 의 몫이다.
 */
export function 빈칸제출사건(턴재료, 입력 = {}) {
  if (!턴재료 || !턴재료.task_ref || !턴재료.스냅샷) return null;
  /* 변환 턴에는 `빈칸` 키가 없다(§6-8 규칙 1) — 교차 호출은 여기서 접는다. 열린 산출을
   * 퀴즈 통로로 보내면 검수 큐가 그 행을 영영 못 본다(§6-1 그 사고의 반대 방향). */
  if (!('빈칸' in 턴재료.스냅샷)) return null;
  if (!키있나(입력)) return null;
  const { 본문, attempt_no, latency_ms = null } = 입력;
  if (typeof 본문 !== 'string' || 본문.trim() === '') return null; // 🔴 ⑥ 구멍 — 이 층이 막는다
  if (!Number.isInteger(attempt_no) || attempt_no < 1) return null;
  return {
    ...봉투(턴재료, 입력, G4과제유형.빈칸),
    event_type: 'quiz.answered',
    submission: {
      task_ref: 턴재료.task_ref,
      task_format: 빈칸형식,
      task_snapshot: 턴재료.스냅샷, // 그 턴의 채점 근거(정답집합·채점기판본)가 행과 함께 남는다(§6-2 ⓑ)
      body_original: 본문,
      task_schema_ver: G4스냅샷모양판,
      /* 🔴 `audio_ref`·`capture_meta`·`correction_id` — **키 자체를 만들지 않는다**(머리말). */
    },
    payload: { ver: 1, attempt_no, ...지연칸(latency_ms) },
  };
}

/**
 * 「모르겠어요」 — 비우고 넘겼다 → `quiz.answered` 하나 (§4-2 · 회피 자체가 신호다).
 *
 * 🚫 `body_original` 을 싣지 않는다 — 낸 산출물이 없다는 것이 이 사건의 뜻이다(G2 무산출과
 *   같은 무늬 · 빈 문자열로 채우면 「비웠다」와 「빈 답을 냈다」가 같은 모양이 된다).
 * 🔑 `submission` 칸은 낸다 — 「어느 턴에 대한 모름인가」가 없으면 모름넘김률의 분모(그날
 *   받은 빈칸 수)를 못 만든다.
 *
 * @param {object} 입력 { attempt_no, latency_ms?, correlation_id, idempotency_key, occurred_at? }
 */
export function 모름제출사건(턴재료, 입력 = {}) {
  if (!턴재료 || !턴재료.task_ref || !턴재료.스냅샷) return null;
  if (!('빈칸' in 턴재료.스냅샷)) return null; // 변환 턴에는 「모르겠어요」 버튼이 없다
  if (!키있나(입력)) return null;
  const { attempt_no, latency_ms = null } = 입력;
  if (!Number.isInteger(attempt_no) || attempt_no < 1) return null;
  return {
    ...봉투(턴재료, 입력, G4과제유형.빈칸),
    event_type: 'quiz.answered',
    submission: {
      task_ref: 턴재료.task_ref,
      task_format: 빈칸형식,
      task_snapshot: 턴재료.스냅샷,
      task_schema_ver: G4스냅샷모양판,
    },
    payload: { ver: 1, attempt_no, skipped: true, ...지연칸(latency_ms) },
  };
}

/**
 * 문장을 바꿔 냈다 → `submission.created` 하나 (§6-1 · 열린 산출 스테이지 → 검수 큐).
 *
 * 🔑 `task_format` 은 팩 `펴기(시드).형식` 이다 — 문항이 정본이다(v1 은 전부 `높임전환`,
 *   `번역` 문항이 서는 날 이 줄은 안 바뀌고 팩만 바뀐다). 스냅샷 종류가 변환이 아니면 null —
 *   닫힌 채점 근거가 있는 턴을 검수 큐로 보내면 검수 용량 사고다(§6-1).
 *
 * @param {object} 입력 { 본문, attempt_no, compose_meta?, correlation_id, idempotency_key, occurred_at? }
 */
export function 변환제출사건(턴재료, 입력 = {}) {
  if (!턴재료 || !턴재료.task_ref || !턴재료.스냅샷) return null;
  if (!키있나(입력)) return null;
  /* 빈칸 턴 교차 호출 차단 — 판정을 **마운트 스냅샷**으로 한다(빈칸제출사건과 대칭 · 적대 리뷰
   * P2-2). 형식도 마운트 때 `관문재료` 가 편 값이다 — 제출 순간의 팩 상태에 아무것도 안 기댄다
   * (앉음 중 팩 개정이 학생이 친 변환문을 증발시키던 자리). 형식을 모르면 지어내지 않는다. */
  if ('빈칸' in 턴재료.스냅샷) return null;
  if (typeof 턴재료.형식 !== 'string' || 턴재료.형식 === '') return null;
  const { 본문, attempt_no, compose_meta = null } = 입력;
  if (typeof 본문 !== 'string' || 본문.trim() === '') return null; // 내용물 없는 제출은 제출이 아니다
  if (!Number.isInteger(attempt_no) || attempt_no < 1) return null;
  return {
    ...봉투(턴재료, 입력, G4과제유형.변환),
    event_type: 'submission.created',
    submission: {
      task_ref: 턴재료.task_ref,
      task_format: 턴재료.형식,
      task_snapshot: 턴재료.스냅샷,
      body_original: 본문,
      task_schema_ver: G4스냅샷모양판,
    },
    payload: {
      ver: 1,
      attempt_no,
      /* 🔴 한 벌 아니면 키가 없다 — 반쪽을 걸러내는 유일한 층이 여기다(§6-6 ⑨ · G1 규약). */
      ...(한벌인가(compose_meta) ? { compose_meta } : {}),
    },
  };
}

/**
 * 하다 나감 → `session.abandoned` 하나 (§5 포기·회피 행 · §6-7 ④ 쓰기 생산자).
 *
 * 공통 필수 + 「어디서 막혔나」(task_type·submission.task_format)뿐이다 — 문턱 없음이 설계다.
 * 🔴 「어디서」는 **스테이지가 말한다**(적대 리뷰 P2-3) — G2 는 두 스테이지의 형식이 같아
 *   상수가 정직했지만, G4 는 스테이지가 형식·통로를 가르는 첫 모듈이라 상수로 두면 빈칸에서
 *   막힌 학생(관문 구조상 대다수)이 전부 「변환에서 막혔다」로 적힌다 — 값이 상수인 순간
 *   그 칸은 아무 기능도 하지 않는다. 화면이 자기 단계를 넘긴다 · 모르면 변환(열린 산출 통로
 *   이름 — G2 이탈 선례의 원 뜻)으로 접는다.
 * 🚫 `body_original` 을 싣지 않는다 — 낸 답이 없다는 것이 이 사건의 뜻이다.
 * 🚫 `retry_of_event_id` 를 싣지 않는다 — 이탈은 재제출이 아니다(계약 주석 「재제출일 때만」 ·
 *   G1 이탈과 같은 판정 — 봉투 스프레드가 재배정 앵커의 고리를 이탈에 옮겨 싣던 자리).
 */
export function 이탈사건(재료, 입력 = {}, 스테이지 = '변환') {
  if (!재료 || !재료.task_ref) return null;
  if (!키있나(입력)) return null;
  const 빈칸에서 = 스테이지 === '빈칸';
  // 재제출 고리를 이탈로 옮겨 싣지 않는다 — 봉투는 falsy 면 키를 안 만든다(위 🚫).
  const 공통 = 봉투({ ...재료, retry_of_event_id: null }, 입력, 빈칸에서 ? G4과제유형.빈칸 : G4과제유형.변환);
  return {
    ...공통,
    event_type: 'session.abandoned',
    submission: { task_ref: 재료.task_ref, task_format: 빈칸에서 ? 빈칸형식 : 이탈형식 },
    payload: { ver: 1 },
  };
}

/* 고름 항목에 붙는 **로컬 닻**(전송되지 않는 큐 항목 칸 · 발주 §6-6 ⑩ C5). 앱이 죽어 화면
 * cleanup 이 못 돈 날의 이탈은 「어느 배정의 것인가」를 지어낼 수 없어, 죽은 앉음 수거(H2)가
 * 이 세 칸으로 위 `이탈사건` 을 짓는다 — G1 `이탈닻` 과 같은 모양·같은 이유다. */
export function 이탈닻(재료) {
  if (!재료 || !재료.task_ref) return null;
  return { task_ref: 재료.task_ref, level_snapshot: 재료.level_snapshot, goal_snapshot: 재료.goal_snapshot };
}
