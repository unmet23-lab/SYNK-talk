/* 오늘 낼 것을 고른다 — P0 §6「하루 한 문장」 배달 경로의 **의미 부분**.
 *
 * ■ 왜 함수로 떼어 놨나
 *   배치 본체(`functions/deliver`)는 DB 왕복이라 실행에 원격 프로젝트가 필요하다.
 *   「무엇을 낼 것인가」는 순수 판정이므로 여기서 서고, 회귀가 **DB 없이** 탐지력을 잰다.
 *   앱에도 얹을 수 있다(강등으로 큐가 비었을 때 화면이 같은 고정 과제를 띄운다 · C0 §4-3 ①).
 *
 * ■ 하루 1건인데 호흡은 셋 (P0 §2-1)
 *   ①듣기는 `intervention.delivered` 의 `output_text`(AI 가 한 말)이고,
 *   ②따라 말하기·③답하기가 이 스냅샷에 든다.
 *   🔴 **행의 `task_format` 을 채우지 않는다** — ②는 `낭독`, ③은 `자유발화` 로 형식이 둘이다.
 *   한 칸에 담으면 P0 §2-1 이 경계한 「낭독 데이터로 회화 모델을 학습시키는 사고」가
 *   배정 단계에서부터 성립한다. 형식은 **호흡마다** 적고, 제출 행은 각자 자기 형식을 갖는다.
 *
 * ■ AI 문장 생성이 아직 없다는 사실을 숨기지 않는다
 *   §6-1 의 셋째 갈래(급수·목적으로 다음 문장 생성)는 모델·프롬프트 계약이 아직 없다.
 *   그 자리는 §6-4 **강등 경로**가 이미 정의해 뒀다 — 큐의 전날 문장 → 없으면 고정 도입 과제.
 *   그래서 그 갈래로 나가는 배정은 `degraded: true` 로 **행에 남는다**. 안 그러면 원장 화면의
 *   「강등 발생 건수」가 0으로 보이고, **막힌 것이 통과한 것처럼 보이는 상태**가 된다(§4-1).
 */
'use strict';

/* 날짜는 **몽골 달력**으로 끊는다(C0 §4-3 ① · §10-A-4).
 * UTC 로 끊으면 몽골 오전 8시(=00:00Z)까지가 「어제」라, 아침에 앱을 연 학생이
 * 어제 것을 오늘 것으로 받는다. 오프셋을 상수로 적지 않는 이유는 그게 규칙의 사본이기
 * 때문이다 — 규칙은 tzdata 가 지고, 여기는 이름만 든다. */
const 시간대 = 'Asia/Ulaanbaatar';
const 날짜형식 = new Intl.DateTimeFormat('en-CA', {
  timeZone: 시간대, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** @param {Date|string|number} [때] @returns {string} `YYYY-MM-DD` (몽골 기준) */
function 몽골날짜(때) {
  const d = 때 == null ? new Date() : 때 instanceof Date ? 때 : new Date(때);
  if (Number.isNaN(d.getTime())) throw new TypeError('몽골날짜: 날짜가 아니다');
  return 날짜형식.format(d);
}

/* 배치의 멱등키는 **결정론적**이다(C0 §4-1 · §10-A-4).
 * 두 번 돌면 두 번째는 기존 멱등이 `duplicate` 로 접으므로 「하루 1건」에 새 유일 제약이 없다. */
const 멱등키 = (종류, learner_id, 날짜) => `${종류}:${learner_id}:${날짜}`;

/* 고정 도입 과제 — §4-5 유호님 확정(1일차 = 자기 소개 낭독 + 자유 한 마디).
 * §6-4 의 마지막 강등 단계도 **같은 것**을 쓴다(둘째 세트를 만들면 그게 계약 밖 콘텐츠다). */
const 도입 = Object.freeze({
  따라말하기: '안녕하세요. 저는 (이름)입니다. 몽골에서 왔습니다.',
  답하기: '오늘 하루 어땠어요? 한 마디로 말해 주세요.',
});

/** 호흡 2개짜리 스냅샷 — 「그날 학생이 본 것 그대로」(C0 §4-3 ①). */
function 스냅샷(날짜, 문장, 출처, 프롬프트) {
  return {
    ver: 1,
    날짜,
    호흡: [
      { 차례: 2, 무엇: '따라 말하기', task_format: '낭독', 문장, 출처 },
      { 차례: 3, 무엇: '답하기', task_format: '자유발화', 프롬프트 },
    ],
  };
}

/**
 * 오늘 이 학생에게 낼 것을 고른다.
 *
 * @param {object} 재료
 * @param {string} 재료.날짜          몽골 기준 `YYYY-MM-DD`
 * @param {boolean} [재료.첫날]       이 학생에게 배정 이력이 없다
 * @param {string|null} [재료.교정문]  지난 배정 뒤에 새로 확정된 교정문(있으면 ②슬롯 · §6-3)
 * @param {string|null} [재료.전날문장] 마지막 배정의 ②문장(강등 1단계 · §6-4)
 * @returns {{task_snapshot: object, task_ref: string, degraded: boolean, 출처: string}}
 */
function 오늘과제(재료) {
  const { 날짜, 첫날 = false, 교정문 = null, 전날문장 = null } = 재료 || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(날짜))) throw new TypeError('오늘과제: 날짜는 YYYY-MM-DD 여야 한다');

  /* 순서가 곧 우선순위다(§6-1 의 세 갈래 + §6-4 의 두 단계).
   * `첫날` 이 교정문보다 앞이다 — 배정 이력이 없는데 교정이 있는 상태는 데이터가 어긋난
   * 것이고, 그때 「어제 교정문」을 내면 그 학생의 **첫 발화 기준선**(§4-5 · 소급 불가)을 잃는다. */
  const [문장, 출처, degraded] =
    첫날 ? [도입.따라말하기, '도입', false]
    : 교정문 ? [String(교정문), '교정문', false]
    : 전날문장 ? [String(전날문장), '전날', true]
    : [도입.따라말하기, '도입', true];

  return {
    task_snapshot: 스냅샷(날짜, 문장, 출처, 도입.답하기),
    task_ref: `task-${날짜}`,
    degraded,
    출처,
  };
}

/** 스냅샷의 한 호흡. 셋이 같은 자리를 읽으므로 찾는 규칙도 한 곳이다. */
const 호흡찾기 = (snap, 차례) =>
  (snap && Array.isArray(snap.호흡) ? snap.호흡.find((x) => x && x.차례 === 차례) : null) || null;

/** 스냅샷에서 ②문장만 되꺼낸다 — 다음 날 강등의 「전날 문장」이 여기서 나온다. */
const 따라말하기문장 = (snap) => {
  const h = 호흡찾기(snap, 2);
  return h && h.문장 ? String(h.문장) : null;
};

/** 스냅샷에서 ③프롬프트를 되꺼낸다. */
const 답하기프롬프트 = (snap) => {
  const h = 호흡찾기(snap, 3);
  return h && h.프롬프트 ? String(h.프롬프트) : null;
};

/** 호흡의 형식(`낭독`·`자유발화`). 제출 행은 **자기 호흡의 형식**을 갖는다(P0 §2-1). */
const 호흡형식 = (snap, 차례) => {
  const h = 호흡찾기(snap, 차례);
  return h && h.task_format ? String(h.task_format) : null;
};

/** 화면의 호흡 이름 → 스냅샷의 차례. 두 어휘가 만나는 자리는 여기 하나다. */
const 호흡차례 = { 따라: 2, 답하기: 3 };

/**
 * `GET /v1/tasks` 의 `data[0]` → 화면이 쓰는 「편지」 모양 (C0 §4-3 ①).
 *
 * ■ 왜 **여기**에 있나 — 스냅샷을 만드는 곳과 읽는 곳이 같은 파일이어야 안 갈린다.
 *   호흡 배열의 모양(`차례`·`문장`·`프롬프트`)을 아는 곳이 둘이 되면, 배치가 키 이름을
 *   바꾸는 날 조회는 **오류 없이 빈 화면**을 낸다 — 그 증상엔 원인이 안 적혀 있다.
 *
 * ■ 못 읽으면 **폴백으로 내려가되 그 사실을 낸다**(P0 §6-4 · C0 §4-3 「빈 상태는 오류가 아니다」).
 *   🔴 폴백을 조용히 쓰면 화면은 늘 멀쩡해 보이고, **배치가 몇 날 안 돌아도 아무도 모른다.**
 *   그건 P0 §4-1 이 경계한 「막힌 것이 통과한 것처럼 보이는 상태」다. 그래서 `사유` 를 함께 낸다.
 *
 * @param {object|null} 항목  `data[0]`(없으면 null)
 * @param {object} 폴백       `contents/첫편지.js` 의 급수편지(급수) — 첫날·배치 실패 때 쓰는 고정 과제
 */
function 화면과제(항목, 폴백) {
  const 내려감 = (사유) => ({
    편지: 폴백, 출처: '고정', 사유, degraded: true, task_id: null, intervention_id: null,
    // 🔴 폴백 날의 발화는 **서버로 못 보낸다** — 어느 과제에 대한 것인지(`task_ref`)도, 그때
    //   급수(`level_snapshot`)도 앱이 알 길이 없다. 지어내면 큐와 안 이어진 행이 조용히 쌓인다.
    //   보낼 수 없다는 사실은 로그 항목에 사유로 남는다(`src/말하기화면.js`).
    제출재료: null,
  });
  if (!폴백) throw new TypeError('화면과제: 폴백이 필요하다 — 빈 화면을 내지 않는다');
  if (!항목) return 내려감('오늘 받은 과제가 아직 없어요');

  const snap = 항목.task_snapshot;
  const 핵심문장 = 따라말하기문장(snap);
  const 질문 = 답하기프롬프트(snap);
  // 둘 중 하나만 있어도 화면은 반쪽이다 — ②③은 쌍이라서 값이 있다(P0 §2-1).
  if (!핵심문장 || !질문) return 내려감('오늘 과제를 읽지 못했어요');

  const 개입 = 항목.intervention || null;
  return {
    편지: {
      id: 항목.task_id || null,
      // ①듣기 = AI 가 실제로 한 말. 없으면 ②문장이 곧 그날 나간 말이다(강등 경로 · §6-4).
      본문: (개입 && 개입.output_text) || 핵심문장,
      핵심문장,
      질문,
      // 🔴 선택지(급수 1~2 골라서 답하기)는 **서버가 아직 안 낸다** — 지어내지 않는다.
      선택지: null,
    },
    출처: '서버',
    사유: null,
    degraded: Boolean(항목.degraded),
    task_id: 항목.task_id || null,
    intervention_id: (개입 && 개입.intervention_id) || null,
    /* 제출 사건에 **되돌려 실을** 값들(C0 §4-3 ①). 앱이 만드는 것은 하나도 없다 —
     * 셋 다 배정 행이 낸 것이고, 여기 없으면 `제출사건` 이 사건을 못 만든다(=안 보낸다). */
    제출재료: 항목.task_ref
      ? {
          task_ref: String(항목.task_ref),
          /* 🔴 그날 **이 화면이 실제로 그린 판**. 위 `핵심문장`·`질문` 이 전부 여기서 나왔으므로
           *   이 값이 곧 학생이 본 것이다 — 나중에 배정 행에서 베껴 오면 「앱이 배정대로 그렸다」는
           *   추정이 관측 칸에 들어간다(절단문서 ①-3·①-7). 오프라인 큐가 며칠 들고 있어도
           *   항목이 자기 것을 들고 가므로 그 사이 문항이 개정돼도 안 흔들린다. */
          task_snapshot: snap,
          level_snapshot: 항목.level_snapshot || null,
          goal_snapshot: 항목.goal_snapshot || null,
          형식: { 따라: 호흡형식(snap, 2), 답하기: 호흡형식(snap, 3) },
        }
      : null,
  };
}

/**
 * 로그 항목 하나 → `POST /v1/events` 의 사건 하나 (C0 §4-1). **순수 함수다.**
 *
 * ■ 왜 여기인가
 *   스냅샷의 호흡 형식을 읽는 곳이 이미 여기다. 조립을 화면에 두면 **같은 어휘를 아는 곳이 둘**이
 *   되고, 갈라지는 날 증상은 「제출이 400 으로 거절된다」가 아니라 **엉뚱한 형식으로 저장되는 것**
 *   이다 — 낭독 데이터가 자유발화로 섞여 들어가면 P0 §2-1 이 경계한 그 사고가 조용히 성립한다.
 *
 * ■ 멱등키는 **항목이 들고 온다** — 여기서 짓지 않는다
 *   `lib/제출로그.js` 가 항목을 만들 때 v4 uuid 로 한 번 짓는다(C0 §4-1). 서버는
 *   `(learner_id, idempotency_key)` 로 접으므로 재전송은 여전히 중복 행을 안 만든다 —
 *   같은 항목을 몇 번 조립해도 같은 값이 실리기 때문이다.
 *   🔴 여기서 `submission:{날짜}:{호흡}:{시도}` 로 조립하면 안 된다: `attempt` 는 로컬 로그에서
 *   세는 값이라 재설치·로그 초기화·다른 기기에서 1 로 되돌아가고, 그때 **새 녹음이 옛 행에
 *   `duplicate` 로 접혀 성공과 같은 모양으로 사라진다**(절단문서 ①-5).
 *
 * ■ 무발화는 `session.abandoned` 다
 *   내용물이 없어 `submission.created` 로는 검증을 못 지나고(택1 필수), 지난다 해도
 *   `submission_count` 가 「말 안 한 날」에 올라 「어제의 나」가 거짓말을 한다(C0 §4-3 ③).
 *   「막혔다」는 그 자체가 신호라 문턱이 없다(`lib/이벤트검증.js` 이벤트별필수 참조).
 *
 * ⚠ **머뭇거림·발화길이·문턱은 아직 안 나간다.** payload 이름은 현행 계약 목록에서만 고르는데
 *   (`C0 §4-1` payload 규격) `hesitation_ms`·`duration_ms` 가 그 목록에 없다. 지어 넣으면
 *   서버가 거절하고, 우회로 `capture_meta` 에 넣는 것은 「요청한 설정」과 「관측」을 섞지 말라는
 *   c6 판정에 정면으로 어긋난다. 기기 로그에는 남아 있으니 c9 개정 때 함께 올린다.
 *
 * @param {object} 항목      `lib/제출로그.js` 의 항목 — **재료도 그 안에 있다**(`task_meta`)
 * @param {string|null} [audio_ref]  업로드가 끝났으면 그 참조
 * @returns {object|null} 보낼 사건. 재료가 없거나 형식을 모르면 `null`(=보내지 않는다)
 */
function 제출사건(항목, audio_ref) {
  if (!항목) return null;
  const 재료 = 항목.task_meta;
  const capture_app = 항목.capture_app || null;
  if (!재료 || !재료.task_ref) return null;
  /* 한 앉음을 묶는 키가 없으면 **보내지 않는다.** 계약이 이제 공통 필수로 걸므로 보내 봐야
   * 400 이고, 그 항목은 큐에서 영영 재시도한다. 없는 값을 지어내지도 않는다 — 지어낸 키는
   * 흩어진 것을 「한 앉음」이라고 거짓말하고, 그 거짓은 나중에 못 가려낸다(절단문서 ①-10). */
  if (!항목.correlation_id) return null;
  /* 멱등키도 같다 — **항목이 들고 온 것만 쓴다.** 없다고 여기서 지어내면 그 순간 좌표 조립으로
   * 되돌아가고(=①-5 가 다시 성립), 그 손실은 `duplicate` 라 성공과 같은 모양이다. 옛 판 큐 항목은
   * `correlation_id` 가 없어 어차피 이미 안 나간다 — 여기서 갈래를 하나 더 만들지 않는다. */
  if (!항목.idempotency_key) return null;
  const 차례 = 호흡차례[항목.step];
  if (!차례) return null;

  const 공통 = {
    idempotency_key: 항목.idempotency_key,
    occurred_at: 항목.created_at,
    /* 한 앉음을 묶는 키(P0 §3-1 ④). ②낭독과 ③자유발화가 **같은 값**을 들어야 「한 번에 낸 쌍」이
     * 선다. 🔴 `task_ref` 로 대신하지 않는다 — 그건 그날 배정이라 아침에 ②, 저녁에 ③ 을 낸 날도
     * 같은 값이고, 무발화로 접힌 앉음까지 한 덩어리가 된다. `occurred_at` 정렬로도 못 대신한다
     * (C0 §4-1 이 「기기 시계는 못 믿는다」를 이미 못박았다).
     * 🔴 c9 부터 **공통 필수**라 없으면 위에서 이미 사건을 안 만든다(옛 판 큐 항목은 안 나간다). */
    correlation_id: 항목.correlation_id,
    level_snapshot: 재료.level_snapshot,
    goal_snapshot: 재료.goal_snapshot,
    // 재시도는 새 event_type 이 아니라 attempt 증가로 남는다(P0 S1-7 · C0 §4-3 ③ `retry_count`).
    payload: { ver: 1, attempt_no: 항목.attempt },
  };

  if (항목.status === 'abandoned') return { ...공통, event_type: 'session.abandoned' };

  const task_format = 재료.형식 ? 재료.형식[항목.step] : null;
  if (!task_format) return null;   // 형식을 모르면 지어내지 않는다 — 안 보내는 편이 옳다
  // 판(스냅샷)을 못 들고 온 옛 큐 항목도 같다. 「막혔다」(abandoned)는 위에서 이미 나갔다.
  if (!재료.task_snapshot) return null;
  return {
    ...공통,
    event_type: 'submission.created',
    task_type: '발화녹음',
    submission: {
      task_ref: 재료.task_ref,
      task_format,
      // 그때 이 화면이 그린 판 — 항목이 들고 온 것을 그대로 되싣는다(위 `화면과제` 주석).
      task_snapshot: 재료.task_snapshot,
      body_original: 항목.text || null,
      audio_ref: audio_ref || null,
      /* `app` = 앱이 **요청한** 설정. 서버는 파일 헤더에서 **잰** 값을 `.server` 에 따로 얹는다
       * (C0 §4-2). 지금 앱은 AGC 를 끄라고 요청조차 하지 않으므로 그 사실이 그대로 적혀야 한다 —
       * 안 적으면 「요청」 칸이 영원히 비고, 나중에 규격 밖 행을 봐도 **앱 설정 탓인지 기기 탓인지**
       * 가를 근거가 없다. 🚫 여기에 헤더에서 잰 값을 적지 않는다(그건 관측이지 요청이 아니다). */
      ...(capture_app ? { capture_meta: { app: capture_app } } : {}),
    },
  };
}

module.exports = {
  몽골날짜, 멱등키, 오늘과제, 따라말하기문장, 답하기프롬프트, 호흡형식, 호흡차례,
  화면과제, 제출사건, 도입, 시간대,
};
