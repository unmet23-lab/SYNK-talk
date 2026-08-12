/**
 * 보고서교정제출 — G2 「보고서 교정」이 낼 **사건들의 조립기**. 순수 함수만(네트워크·저장 0).
 *
 * ■ 자리 (발주_게임모듈.md G2 §6-1 축값 · §6-3 payload · §9-② 자체 가드)
 *   순수 로직 3벌(`contents/보고서교정문항.js`·`lib/보고서교정.js`·`lib/게임스냅샷.js`)이 값
 *   재료를 대고, 여기가 **봉투**를 조립한다. 화면(`src/보고서교정화면.js`)은 이 조립기가 낸
 *   사건을 큐(`lib/게임로그.js`)에 담아 `src/사건통로.js` 하나로 보낸다 — `POST /v1/events`
 *   하나뿐이고 **새 엔드포인트 0**. G1(`lib/게임제출.js`)과 같은 규약이고, 갈리는 자리는 아래
 *   「두 갈래」와 「선택로그」 둘뿐이다.
 *
 * ■ 🔴 사건이 **둘로 갈린다** — 1단계가 `게임스냅샷.G2과제유형` 에 못박은 그대로
 *   `짚음`   = 어절을 짚어 고쳐 냈다 → `submission.created` + `숙제제출` (산출물이 있다)
 *   `무산출` = 「고칠 곳 없음」·건너뜀 → `quiz.answered` + `퀴즈응답`
 *   무산출을 `submission.created` 로 보내면 검증기가 `body_original|audio_ref` 필수로 **전건
 *   400** 이고, 앱 큐는 거절을 조용히 격리하므로 화면은 멀쩡한 채 **과잉 교정 성향이 영원히
 *   0 으로 보인다.** 🚫 우회로 원문장을 `body_original` 에 넣지 않는다 — 우리가 심은 문장이
 *   학습자 코퍼스에 학생 산출물로 섞인다(§9-① 이 막으려던 오염이 다른 문으로 들어온다).
 *
 * ■ 🔴 §9-② 자체 가드 — 지목(span)이 빠진 제출은 **안 낸다**
 *   앱이 `selected_option`·`position`·`options_shown` 을 빠뜨려도 제출은 정상 저장되고 화면도
 *   멀쩡하다. 남는 것은 「고친 문장」뿐이고 **학생이 어디를 틀렸다고 봤나**는 그 순간에만 있다 —
 *   이 모듈의 존재 이유가 통째로 사라지는데 증상이 없다. 검증기 자가검증으로는 안 잡힌다(선택
 *   필드라 `이벤트별필수` 에 없다). 그래서 **이 파일이 그 층이다**: 선택로그 축이 한 벌이 아니면
 *   `null`(= 보내지 않는다). 반쪽을 내느니 안 낸다는 규율은 `compose_meta`(§6-6 ⑨)와 같다.
 *
 * ■ 🔑 `position` 은 **호출자에게서 받지 않는다** — `options_shown` 에서 «파생»한다
 *   검증기 규칙 ⑦은 `options_shown[position-1].option_id === selected_option` 을 요구한다
 *   (1부터 센다 · L0 §140). 화면이 자기 색인을 따로 세어 보내면 두 벌이 갈리고, 갈라진 행은
 *   오류가 아니라 «다른 자리에서 골랐다»로 읽힌다 — 소비자는 범위 안의 거짓말을 못 가려낸다.
 *
 * ■ 🚫 안 싣는 것 (§6-3 말미)
 *   `recommended_option`(G2 는 정답을 밀어주지 않는다 — 넣을 정직한 값이 «없다») ·
 *   `confidence`(안 묻는다 · 질문 총량 상한) · `is_correct`(파생 · C0 §4-1 금지) ·
 *   `changed_selection`(어절 탭은 마지막 것만 남아 값이 «항상 거짓»이 된다 — 거짓 신호를
 *   만드느니 안 보낸다).
 *
 * ■ 🔴 이 파일은 ESM 이다 — 앱 번들 쪽이라 동봉 대상이 아니다(`lib/게임제출.js` 와 같은 자리).
 */

import { 검수확정 } from '../contents/보고서교정문항.js';
import { G2스냅샷, G2스냅샷모양판, G2과제유형, G2스냅샷인가 } from './게임스냅샷.js';

/* §6-1 표의 고정값. `task_type` 정본은 CJS 쪽(`게임스냅샷.G2과제유형`)이다 — 서버 배정
 * (deliver)과 같은 행 규격을 말해야 하는데 저쪽은 동봉이고 이쪽은 앱 번들이라, 여기 리터럴을
 * 두면 배정 행과 제출 행이 다른 통로 이름을 말하는 날이 온다(§6-8 규칙 3). */
const TASK_FORMAT = '쓰기첨삭';

/* 재수출 — 정의는 조립기 한 곳이다(정의 두 곳 금지 · `lib/게임제출.js` 와 같은 규약).
 * 🔑 별칭 재수출(`export { A as B }`)이 아니라 «지역 상수»로 받는다 — 앱 소스 이름 가드가
 *   별칭 쪽 이름을 「선언 없이 참조된 이름」으로 읽는다(회귀 `tests/앱이름.test.js` 실측). */
const 스냅샷모양판 = G2스냅샷모양판;
export { 스냅샷모양판 };

/**
 * 이 배정이 G2 인가 — 라우팅 판정. 정본은 `게임스냅샷.G2스냅샷인가` 하나다(값을 여기 다시
 * 적으면 갈라진 쪽이 조용히 통과한다). 🔴 거름망의 `게임스냅샷인가`(등록된 게임 «전부»)와
 * 다른 축이다 — 넓은 쪽을 여기 쓰면 G2 화면이 G1 배정을 연다.
 */
export function 게임과제인가(항목) {
  return G2스냅샷인가(항목 && 항목.task_snapshot);
}

/**
 * 배정 항목 → 화면·조립이 쓸 재료. **못 읽으면 null** — 지어내지 않는다.
 *
 * 🔑 `문항id` 는 배정 항목이 «봉투 밖»으로 들고 온다(`항목.prompt_seed`). G2 스냅샷 표(§6-8)에는
 *   그 키가 없다 — G1 은 `prompt_seed` 를 스냅샷 «안»에 갖는데 G2 는 안 갖는 것이 1단계의 판정
 *   이었고, 그래서 앱이 문항을 되짚을 열쇠가 스냅샷에는 없다. 표를 고치지 않고 봉투 밖 칸으로
 *   받는 이유: 스냅샷은 **불변 기록**이라 키를 하나 더하면 이미 나간 배정 행과 모양이 갈린다.
 * 🔑 `level_snapshot`·`goal_snapshot`·`retry_of_event_id` 는 전부 서버 배정 행이 낸 값이다 —
 *   앱이 만드는 것은 하나도 없다(`lib/오늘과제.화면과제` 의 제출재료와 같은 규약).
 */
export function 게임재료(항목) {
  /* 🔴 fail-closed — 몽골어 검수 전 판은 학생에게 열지 않는다(발주_게임콘텐츠팩 §3).
   * 팩이 `검수확정 = false` 인 동안 이 함수는 **언제나 null** 이고, 그래서 G2 는 지어졌지만
   * 학생에게는 안 열린다. 라우팅이 이 null 을 받으면 말하기 폴백으로 조용히 내려간다. */
  if (검수확정 !== true) return null;
  if (!게임과제인가(항목)) return null;
  if (!항목.task_ref) return null; // 큐와 못 잇는 제출은 만들지 않는다
  const 문항id = String(항목.prompt_seed || '');
  if (문항id === '') return null;
  const 스냅샷 = G2스냅샷(문항id);
  if (!스냅샷) return null; // 못 펴는 문항 — 화면은 이 null 로 「읽지 못했다」를 정직하게 낸다
  return Object.freeze({
    문항id,
    스냅샷,
    보기: 스냅샷.보기,
    task_ref: String(항목.task_ref),
    level_snapshot: 항목.level_snapshot === undefined ? null : 항목.level_snapshot,
    goal_snapshot: 항목.goal_snapshot === undefined ? null : 항목.goal_snapshot,
    retry_of_event_id: 항목.retry_of_event_id || null,
  });
}

/* ── 선택로그 조립 — 두 갈래가 **같은 함수**를 지난다(§9-② 가드의 유일한 자리) ────────── */

/** 그 보기 목록에서 그 자리의 순번(1부터). 없으면 0 — 호출부가 그 값으로 거절한다. */
function 자리순번(보기, 고른것) {
  if (!Array.isArray(보기)) return 0;
  for (let i = 0; i < 보기.length; i += 1) {
    const 칸 = 보기[i];
    if (칸 && 칸.option_id === 고른것) return i + 1;
  }
  return 0;
}

/**
 * `options_shown` — **그때 화면이 실제로 보여 준 어절 목록**의 스냅샷.
 * 🔴 재료는 배정 스냅샷의 `보기` 하나다(§6-8 규칙 4) — 화면이 자기 목록을 따로 조립해 보내면
 *   「행에 적힌 자리」와 「학생이 본 자리」가 갈리고, 그 갈림은 증상이 없다.
 * @returns {{option_id:string,label:string}[]|null} 한 칸이라도 모양이 아니면 null.
 */
function 보여준보기(보기) {
  if (!Array.isArray(보기) || 보기.length === 0) return null;
  const 낸것 = [];
  for (const 칸 of 보기) {
    if (!칸 || typeof 칸.option_id !== 'string' || 칸.option_id === '') return null;
    if (typeof 칸.label !== 'string' || 칸.label.trim() === '') return null;
    낸것.push({ option_id: 칸.option_id, label: 칸.label });
  }
  return 낸것;
}

/**
 * 선택로그 payload 를 조립한다 — **§9-② 가드의 본체**.
 *
 * @param {object} 입력
 * @param {readonly object[]} 입력.보기 배정 스냅샷의 `보기`
 * @param {string|null} 입력.고른것 짚은 어절의 option_id. `null` = 안 짚었다
 * @param {boolean} 입력.전량거절 「고칠 곳 없음」을 눌렀다
 * @param {boolean} 입력.건너뜀 무반응(시간 초과·안 함) — 🔴 전량거절과 **다른 사건이다**(c4 판정)
 * @param {number|null} 입력.latency_ms 문장 표시 → 첫 탭
 * @param {number} 입력.attempt_no 1 이상
 * @param {string|null} 입력.사유 `selection_reason` — 보스 문항에서 물었을 때만
 * @returns {object|null} 못 쓸 모양이면 null(= 사건을 안 낸다).
 */
function 선택로그(입력) {
  const {
    보기, 고른것 = null, 전량거절 = false, 건너뜀 = false,
    latency_ms = null, attempt_no, 사유 = null,
  } = 입력 || {};

  const options_shown = 보여준보기(보기);
  if (!options_shown) return null; // 🔴 분모가 없는 지목은 지목이 아니다(§6-2 · L0 못박음)
  if (!Number.isInteger(attempt_no) || attempt_no < 1) return null;
  if (typeof 전량거절 !== 'boolean' || typeof 건너뜀 !== 'boolean') return null;

  /* 🔴 「안 골랐다」의 세 뜻을 섞지 않는다 — 짚음 / 고칠 곳 없음 / 무반응은 **각각 다른 사실**
   *   이다(§5 A행 · c4 판정: 합치면 「우리 문항이 다 틀렸다」와 「관심 없었다」를 엔진이 같은
   *   신호로 배운다). 그래서 셋 중 «정확히 하나»가 아니면 조립하지 않는다. */
  const 짚었나 = typeof 고른것 === 'string' && 고른것 !== '';
  const 켜진칸 = (짚었나 ? 1 : 0) + (전량거절 ? 1 : 0) + (건너뜀 ? 1 : 0);
  if (켜진칸 !== 1) return null;
  if (고른것 !== null && !짚었나) return null; // 빈 문자열 따위 — 못 읽는 재료다

  const payload = {
    ver: 1,
    options_shown,
    attempt_no,
    rejected_all: 전량거절,
    skipped: 건너뜀,
  };

  if (짚었나) {
    /* 🔑 자리는 파생이다(머리말) — 목록에 없는 id 면 조립 자체를 접는다. 검증기 ⑦이 잡기
     *   전에 여기서 접는 이유: 큐는 거절을 조용히 격리하므로 화면은 멀쩡한 채 신호만 사라진다. */
    const position = 자리순번(options_shown, 고른것);
    if (position === 0) return null;
    payload.selected_option = 고른것;
    payload.position = position;
  }
  /* 🔴 안 짚었으면 `position` 키를 **만들지 않는다** — 0·-1 로 지어내면 「안 골랐다」가
   *   「첫째를 골랐다」로 적히고, 검증기 ⑦이 그 반대 방향(안 골랐는데 자리가 적힘)도 막는다. */

  /* 잰 값만 싣는다 — 못 잰 지연을 0 으로 적으면 「즉시 알아챘다」가 된다(가장 값진 오독). */
  if (Number.isFinite(latency_ms) && latency_ms >= 0) payload.latency_ms = Math.round(latency_ms);
  /* 물었을 때만 — 안 물은 화면은 이 칸을 아예 안 싣는다(선택필드 장부 규칙). */
  if (typeof 사유 === 'string' && 사유.trim() !== '') payload.selection_reason = 사유;

  return payload;
}

/* ── 두 갈래 ─────────────────────────────────────────────────────────────────── */

/** 두 갈래가 공유하는 봉투 앞칸. 값을 두 곳에 적으면 한쪽이 조용히 갈린다. */
function 봉투(재료, { correlation_id, idempotency_key, occurred_at }, task_type) {
  return {
    idempotency_key,
    /* 🔑 `event_type` 은 여기서 «안» 만든다 — `null` 을 두고 부르는 쪽이 덮게 하면, 덮기를
     *   빠뜨린 날 그 사건이 「모르는 값」이 아니라 «명시적 null» 로 나가 오독을 부른다.
     *   키가 아예 없으면 검증기 공통필수가 그 자리에서 거절한다(새는 방향을 막는 쪽). */
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

/**
 * 짚어 고쳐 냈다 → `submission.created` 하나 (§6-1 · §6-3).
 *
 * @param {object} 재료 `게임재료()` 의 결과
 * @param {object} 입력 { 교정문, 고른것, latency_ms?, attempt_no, 사유?,
 *                        correlation_id, idempotency_key, occurred_at? }
 * @returns {object|null} 보낼 사건. 재료가 모자라면 null(= 보내지 않는다).
 *
 * 🔴 `body_original` 은 **그 어절만 바꾼 문장 전문**이다(§5 A행 — span 만 저장하지 않는다).
 *   `task_snapshot.질문`(오류문) ↔ `body_original`(학생 교정) ↔ `corrections.corrected_text`
 *   (검수 확정)의 정렬 3원쌍이 이 게임 코퍼스의 모양이고, span 만 남기면 그 쌍이 깨진다.
 */
export function 짚음제출사건(재료, 입력 = {}) {
  if (!재료 || !재료.task_ref || !재료.스냅샷) return null;
  if (!키있나(입력)) return null;
  const { 교정문, 고른것 } = 입력;
  if (typeof 교정문 !== 'string' || 교정문.trim() === '') return null; // 내용물 없는 제출은 제출이 아니다
  if (typeof 고른것 !== 'string' || 고른것 === '') return null; // 짚음 갈래인데 자리가 없다

  const payload = 선택로그({ ...입력, 보기: 재료.보기, 전량거절: false, 건너뜀: false });
  if (!payload) return null; // 🔴 §9-② — 지목이 반쪽이면 안 낸다

  return {
    ...봉투(재료, 입력, G2과제유형.짚음),
    event_type: 'submission.created',
    submission: {
      task_ref: 재료.task_ref,
      task_format: TASK_FORMAT,
      task_snapshot: 재료.스냅샷,
      body_original: 교정문,
      task_schema_ver: G2스냅샷모양판,
      /* 🔴 `audio_ref`·`capture_meta`·`correction_id` — **키 자체를 만들지 않는다**(쓰기라 잴
       * 소리가 없다 · 빈 값으로 채우면 「모른다」와 「없다」가 같은 모양이 된다 · §6-8 규칙 1). */
    },
    payload,
  };
}

/**
 * 「고칠 곳 없음」·건너뜀 → `quiz.answered` 하나 (§6-1 · 1단계 `G2과제유형.무산출`).
 *
 * 🔑 **이 갈래가 §9-③ 조기 경보의 유일한 재료다** — 대조 문항(오류 없는 문장)에서
 *   `rejected_all` 이 서는 비율이 곧 「멀쩡한 것을 멀쩡하다고 판정하는 능력」이고, 심은 문항
 *   정답률만 오르고 이 곡선이 제자리면 학생이 능력이 아니라 **문항 패턴을 배운 것**이다.
 * 🚫 `body_original` 을 싣지 않는다 — 낸 산출물이 없다는 것이 이 사건의 뜻이다.
 *
 * @param {object} 입력 { 전량거절, 건너뜀, latency_ms?, attempt_no, correlation_id,
 *                        idempotency_key, occurred_at? } — 둘 중 «정확히 하나»가 true
 */
export function 무산출사건(재료, 입력 = {}) {
  if (!재료 || !재료.task_ref || !재료.스냅샷) return null;
  if (!키있나(입력)) return null;

  const payload = 선택로그({ ...입력, 보기: 재료.보기, 고른것: null });
  if (!payload) return null;

  return {
    ...봉투(재료, 입력, G2과제유형.무산출),
    event_type: 'quiz.answered',
    /* 🔑 `submission` 칸은 낸다 — 「어느 배정에 대한 무산출인가」가 없으면 과잉 교정률의
     *   분모(그날 받은 대조 문항 수)를 못 만든다. 산출물 칸(`body_original`)만 없다. */
    submission: {
      task_ref: 재료.task_ref,
      task_format: TASK_FORMAT,
      task_snapshot: 재료.스냅샷,
      task_schema_ver: G2스냅샷모양판,
    },
    payload,
  };
}

/**
 * 쓰다 나감 → `session.abandoned` 하나 (§5 이탈 행 · §6-7 ④ 쓰기 3종 생산자).
 *
 * 공통 필수 + 「어디서 막혔나」(task_type·submission.task_format)뿐이다 — 문턱 없음이 설계다.
 * 🔑 `task_type` 은 **`짚음`** 을 쓴다: 이탈은 「고칠 곳 없음」을 «누르지도 않고» 나간 것이라
 *   무산출 갈래의 뜻(판정을 했다)과 다르다. 🚫 `body_original` 을 싣지 않는다.
 */
export function 이탈사건(재료, 입력 = {}) {
  if (!재료 || !재료.task_ref) return null;
  if (!키있나(입력)) return null;
  return {
    ...봉투(재료, 입력, G2과제유형.짚음),
    event_type: 'session.abandoned',
    submission: { task_ref: 재료.task_ref, task_format: TASK_FORMAT },
    payload: { ver: 1 },
  };
}
