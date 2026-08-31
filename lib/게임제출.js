/**
 * 게임제출 — G1 「교수님 멘탈 구하기」가 낼 **사건들의 조립기**. 순수 함수만(네트워크·저장 0).
 *
 * ■ 자리 (발주_게임모듈.md G1 §6 · §6-6 ⑨ · 발주_게임콘텐츠팩.md §1)
 *   순수 로직 3벌(`contents/교수멘탈문항.js`·`lib/멘탈게이지.js`·`lib/게임스냅샷.js`·
 *   `lib/작성과정.js`)이 값 재료를 대고, 여기가 **봉투**를 조립한다 — `submission.created`(메일
 *   제출) · `choice.selected`(사과 전략) · `session.abandoned`(쓰다 나감). 화면(`src/교수멘탈화면.js`)
 *   은 이 조립기가 낸 사건을 큐(`lib/게임로그.js`)에 담아 `src/사건통로.js` 하나로 보낸다.
 *   전송은 `POST /v1/events` 하나뿐이다 — 새 엔드포인트 0.
 *
 * ■ 🔴 `submission.created` 의 모양은 발주 G1 §6 표가 정본이다
 *   `task_type='숙제제출'` · `submission{task_ref, task_format:'쓰기첨삭', body_original,
 *   task_snapshot, task_schema_ver}` · **`audio_ref`·`capture_meta` 키 없음**(쓰기라 잴 소리가
 *   없다 — 빈 값으로 채우면 「모른다」와 「없다」가 같은 모양이 된다 · §6-8 규칙 1) ·
 *   **`correction_id` 금지**(c8 — viewed/responded 에만) · 서버칸(event_id·learner_id·
 *   consent_ver·schema_ver·model·prompt_ver·degraded·source_kind) 금지. 조립한 사건이 실제로
 *   계약을 지나는지는 회귀가 `lib/이벤트검증.검증` 에 **실제로 태워** 못박는다(§6-6 머리말 —
 *   「대조했다」는 서술은 이 저장소가 5건 반증한 형태다).
 *
 * ■ 🔴 `compose_meta` 는 한 벌 아니면 없다 (§6-6 ⑨ 처분 규칙 1·3)
 *   계약·검증기는 반쪽 객체를 **못 막는다**(⑨ 실측 — 계약에 넣든 안 넣든 통과). 막는 자리는
 *   생산자 하나뿐이라, 여기서 `작성과정.칸들` 네 칸이 전부 정수인 객체만 payload 에 싣고
 *   아니면 **키를 아예 안 만든다**. 자리는 `payload` 안이다(봉투 최상위도 통과하므로 회귀가
 *   자리를 못박는다).
 *
 * ■ 🔴 재제출 = 새 앉음 (발주 G1 §6 `correlation_id` 행)
 *   날을 건넌 재제출은 새 `correlation_id` 를 들고 `retry_of_event_id` 로 잇는다. 그 고리는
 *   앱이 지어내지 않는다 — 서버 배정 행이 낸 값을 항목이 들고 온다(`lib/오늘과제.js` 의
 *   `retry_of_event_id` 와 같은 통로·같은 이유).
 *
 * ■ 🔑 사과 전략 3장 (발주 G1 §4-4 — 문구 그대로)
 *   자리 섞기·추천 표시·position 기록은 **`lib/선택로그.js` 조립기 재사용**이다(보기세우기·
 *   선택payload) — 여기서 다시 적으면 「행에 적힌 자리와 학생이 본 자리」가 갈리고 그 갈림은
 *   증상이 없다. 차원 어휘도 그 파일의 `차원들` 에서만 가져온다(오타 = 조용한 새 차원).
 *   추천은 서버가 안 내므로 **앱이 미는 것을 앱이 적는다** — 시드에서 결정적으로 골라
 *   같은 날 같은 추천이 서고, `recommended_option` 은 그 사실 그대로다(지어낸 값이 아니다).
 */

import { 펴기, 검수확정 } from '../contents/교수멘탈문항.js';
import { G1스냅샷, 스냅샷모양판, 과제유형, G1스냅샷인가 } from './게임스냅샷.js';
import { 차원들, 보기세우기, 선택payload } from './선택로그.js';
import { 칸들 } from './작성과정.js';

/* §6 표의 고정값 — 값목록 정본은 계약 JSON 이고 여기는 지목만 한다.
 * `task_type` 은 서버 배정(deliver)과 같은 행 규격이라 CJS 정본(`게임스냅샷.과제유형`)을 지목한다
 * (배정 배선 ④ — 여기 리터럴을 두면 배정 행과 제출 행이 다른 통로 이름을 말하는 날이 온다). */
const TASK_TYPE = 과제유형;
const TASK_FORMAT = '쓰기첨삭';

/* 스냅샷모양판의 정의는 `게임스냅샷.js` 로 이사했다(배정 배선 ①단계) — 서버 배정 동봉이
 * 앱 제출 사슬 없이 같은 판을 읽는다. 여기서는 재수출만 한다(정의 두 곳 금지). */
export { 스냅샷모양판 };

/**
 * 사과 전략 3장 — 발주 G1 §4-4 문구 그대로. 보기와 차원은 **한 객체**다
 * (`lib/오늘과제.도입` 의 선택 쌍과 같은 이유 — 따로 두면 「남의 축 + 내 보기」가 조용히 선다).
 * `option_id` 는 안 바뀌는 조인 키, `label` 은 그때 화면 문구의 스냅샷이다(C0 §156).
 */
export const 사과전략 = Object.freeze({
  차원: 차원들.사과전략,
  보기들: Object.freeze([
    Object.freeze({ option_id: 'g1-사과-솔직', label: '사정을 솔직히 말한다' }),
    Object.freeze({ option_id: 'g1-사과-간결', label: '짧게 사과하고 바로 부탁한다' }),
    Object.freeze({ option_id: 'g1-사과-대안', label: '대신할 방법을 제안한다' }),
  ]),
});

/**
 * 오늘의 추천 1장 — **시드에서 결정적으로** 고른다(같은 시드 = 같은 추천).
 * 무작위로 고르면 「그날 우리가 민 것」이 재현 불가가 되고, 배정↔화면↔행이 서로 다른
 * 추천을 말할 수 있다. 해시는 단순 문자 합으로 충분하다 — 비밀이 아니라 배분이다.
 * @returns {string|null} 전략 `option_id`. 시드가 글자가 아니면 null(추천 없이 간다 — 정직).
 */
export function 오늘추천(prompt_seed) {
  if (typeof prompt_seed !== 'string' || prompt_seed === '') return null;
  let 합 = 0;
  for (const ch of prompt_seed) 합 = (합 * 31 + ch.codePointAt(0)) % 997;
  return 사과전략.보기들[합 % 사과전략.보기들.length].option_id;
}

/**
 * 이 배정이 G1 인가 — 라우팅 판정(발주 §6-7 ⑥ · 모듈을 가르는 키 = `task_snapshot.challenge_id`).
 * 🔑 판정 정본은 `게임스냅샷.G1스냅샷인가` 하나다(배정 배선 ④) — 값을 여기 다시 적으면
 *   갈라진 쪽이 조용히 통과한다(값은 팩 `모듈상수` 지목 그대로).
 * 🔴 **거름망의 `게임스냅샷인가`(등록된 게임 전부)와 다른 축이다**(2026-08-12 · G2 등재).
 *   모듈이 하나였을 땐 두 판정이 같은 함수였다 — 넓은 쪽을 여기 쓰면 **G1 화면이 G2 배정을
 *   연다**(문항 팩이 달라 화면이 빈 채로 뜬다). 좁은 쪽을 거름망에 쓰면 G2 가 통째로 벗겨진다.
 * ⚠ `task_format` 은 배정 스냅샷의 키가 아니라(§6-8 — 그 축은 `submission` 안이다) 여기서
 *   안 묻는다. 형식은 제출 조립이 고정값으로 박는다.
 */
export function 게임과제인가(항목) {
  return G1스냅샷인가(항목 && 항목.task_snapshot);
}

/**
 * 배정 항목 → 화면·조립이 쓸 재료. **못 읽으면 null** — 지어내지 않는다.
 *
 * 🔑 `문항` 은 팩 `펴기(prompt_seed)` 산출이다 — 화면이 그리는 것과 제출 스냅샷이 **같은
 *   조립**(`G1스냅샷`)을 지나므로 「그날 학생이 본 것」과 행이 같은 모양이 된다(§6-8 규칙 4).
 * 🔑 `level_snapshot`·`goal_snapshot`·`retry_of_event_id` 는 전부 서버 배정 행이 낸 값이다 —
 *   앱이 만드는 것은 하나도 없다(`lib/오늘과제.화면과제` 의 제출재료와 같은 규약).
 */
export function 게임재료(항목) {
  /* 🔴 fail-closed — 몽골어 검수 전 판은 학생에게 열지 않는다(발주_게임콘텐츠팩 §3).
   * 배정 통로 게이트는 아직 0줄이라(배정 배선 커밋 몫) 지금 이걸 막는 층은 여기 하나다.
   * 라우팅이 이 null 을 받으면 말하기 폴백으로 조용히 내려간다 — 학생이 그날 아무것도
   * 못 하는 상태를 만들지 않는다(`src/말하기화면.js` 갈래). */
  if (검수확정 !== true) return null;
  if (!게임과제인가(항목)) return null;
  if (!항목.task_ref) return null; // 큐와 못 잇는 제출은 만들지 않는다
  const 시드 = String(항목.task_snapshot.prompt_seed || '');
  const 문항 = 펴기(시드);
  if (!문항) return null; // 못 펴는 시드 — 화면은 이 null 로 「읽지 못했다」를 정직하게 낸다
  return Object.freeze({
    prompt_seed: 시드,
    문항,
    task_ref: String(항목.task_ref),
    level_snapshot: 항목.level_snapshot === undefined ? null : 항목.level_snapshot,
    goal_snapshot: 항목.goal_snapshot === undefined ? null : 항목.goal_snapshot,
    retry_of_event_id: 항목.retry_of_event_id || null,
  });
}

/* compose_meta 가 한 벌인가 — `작성과정.칸들` 에서 파생한다(목록을 다시 적으면 갈라진다). */
const 한벌인가 = (o) => !!o && typeof o === 'object'
  && 칸들.every((k) => Number.isInteger(o[k]))
  && Object.keys(o).length === 칸들.length;

/**
 * 메일 제출 → `submission.created` 하나 (발주 G1 §6 표 그대로).
 *
 * @param {object} 재료 `게임재료()` 의 결과
 * @param {object} 입력 { 본문, correlation_id, idempotency_key, attempt_no,
 *                        compose_meta?, occurred_at? }
 * @returns {object|null} 보낼 사건. 재료가 모자라면 null(= 보내지 않는다 — 지어내지 않는다)
 */
export function 메일제출사건(재료, { 본문, correlation_id, idempotency_key, attempt_no, compose_meta = null, occurred_at } = {}) {
  if (!재료 || !재료.task_ref || !재료.prompt_seed) return null;
  /* 앉음 키·멱등키는 **호출자가 한 번 지어 들고 온다**(C0 §4-1 · 절단문서 ①-5·①-10).
   * 여기서 지으면 재시도마다 새 키가 나고, 그때부터 회선이 끊길 때마다 같은 것이 쌓인다. */
  if (!correlation_id || !idempotency_key) return null;
  if (typeof 본문 !== 'string' || 본문.trim() === '') return null; // 내용물 없는 제출은 제출이 아니다
  if (!Number.isInteger(attempt_no) || attempt_no < 1) return null;
  const task_snapshot = G1스냅샷(재료.prompt_seed);
  if (!task_snapshot) return null; // 반쪽 스냅샷을 내느니 안 낸다(조립기 판정 그대로)
  return {
    idempotency_key,
    event_type: 'submission.created',
    occurred_at: occurred_at || new Date().toISOString(),
    correlation_id,
    level_snapshot: 재료.level_snapshot,
    goal_snapshot: 재료.goal_snapshot,
    task_type: TASK_TYPE,
    /* 결과 변수 — 있을 때만 싣는다. `null` 을 박으면 「재제출 아님」과 「모른다」가 섞인다. */
    ...(재료.retry_of_event_id ? { retry_of_event_id: 재료.retry_of_event_id } : {}),
    submission: {
      task_ref: 재료.task_ref,
      task_format: TASK_FORMAT,
      task_snapshot,
      body_original: 본문,
      task_schema_ver: 스냅샷모양판,
      /* 🔴 `audio_ref`·`capture_meta`·`correction_id` — **키 자체를 만들지 않는다**(머리말). */
    },
    payload: {
      ver: 1,
      attempt_no,
      /* 🔴 한 벌 아니면 키가 없다 — 반쪽을 걸러내는 유일한 층이 여기다(§6-6 ⑨). */
      ...(한벌인가(compose_meta) ? { compose_meta } : {}),
    },
  };
}

/**
 * 사과 전략 고름 → `choice.selected` 하나.
 *
 * 🔴 제출과 **독립**이다(S1-5 규칙 · `lib/오늘과제.선택사건` 과 같은 판정) — 부모를 달지
 *   않는다. 메일이 영영 못 나가는 날에도 「그날 무엇에 끌렸나」는 사실로 남는다. 한 앉음과의
 *   연결은 `correlation_id` 가 진다.
 * 🔑 payload 는 `선택로그.선택payload` **그대로**다 — 택1 판정·자리 대조·차원 어휘를 여기서
 *   다시 적지 않는다. 조립이 계약을 못 지키면 null(= 보내지 않는다).
 *
 * @param {object} 재료 `게임재료()` 의 결과(급수 스냅샷을 쓴다)
 * @param {object} 입력 { 보기: 보기세우기 결과, 고른것, 시작, 끝, correlation_id,
 *                        idempotency_key, occurred_at? }
 */
export function 전략선택사건(재료, { 보기, 고른것, 시작 = null, 끝 = null, correlation_id, idempotency_key, occurred_at } = {}) {
  if (!재료 || !correlation_id || !idempotency_key) return null;
  const payload = 선택payload({ 차원: 사과전략.차원, 보기, 고른것, 시작, 끝 });
  if (!payload) return null;
  return {
    idempotency_key,
    event_type: 'choice.selected',
    occurred_at: occurred_at || new Date().toISOString(),
    correlation_id,
    level_snapshot: 재료.level_snapshot,
    payload: { ver: 1, ...payload },
  };
}

/**
 * 쓰다 나감 → `session.abandoned` 하나 (발주 §5 이탈 행 · §6-7 ④ 쓰기 3종 생산자).
 *
 * 공통 필수 + 「어디서 막혔나」(task_type·submission.task_format — `lib/이벤트검증.js` 이벤트별
 * 필수)뿐이다 — 문턱 없음이 설계다. `task_ref` 를 함께 싣는 것은 말하기 이탈과 같은 이유다:
 * 없으면 그 이탈이 어느 배정에 대한 것인지 사라져 「받고 안 냈다」의 분모를 못 만든다.
 * 🚫 `body_original` 을 싣지 않는다 — 낸 답이 없다는 것이 이 사건의 뜻이다.
 */
export function 이탈사건(재료, { correlation_id, idempotency_key, occurred_at } = {}) {
  if (!재료 || !재료.task_ref) return null;
  if (!correlation_id || !idempotency_key) return null;
  return {
    idempotency_key,
    event_type: 'session.abandoned',
    occurred_at: occurred_at || new Date().toISOString(),
    correlation_id,
    level_snapshot: 재료.level_snapshot,
    goal_snapshot: 재료.goal_snapshot,
    task_type: TASK_TYPE,
    submission: { task_ref: 재료.task_ref, task_format: TASK_FORMAT },
    payload: { ver: 1 },
  };
}

/* 고름 항목에 붙는 **로컬 닻**(전송되지 않는 큐 항목 칸 · 발주 §6-6 ⑩ C5). 앱이 죽어 화면
 * cleanup 이 못 돈 날의 이탈은 「어느 배정의 것인가」를 지어낼 수 없어, 죽은 앉음 수거(H2)가
 * 이 세 칸으로 위 `이탈사건` 을 짓는다 — 요구 칸이 정확히 같다(task_ref 필수 · 스냅샷 둘은
 * 그때 화면이 알던 값). 닻 없는 항목은 수거가 걷지 않는다. */
export function 이탈닻(재료) {
  if (!재료 || !재료.task_ref) return null;
  return { task_ref: 재료.task_ref, level_snapshot: 재료.level_snapshot, goal_snapshot: 재료.goal_snapshot };
}

/* 화면이 자리 섞기까지 같은 문으로 가져가게 다시 낸다 — 화면이 `선택로그` 를 직접 열면
 * 추천을 다른 값으로 넘기는 실수가 회귀 밖에서 난다(여기 한 곳이면 회귀가 그 문을 잰다). */
export { 보기세우기 };
