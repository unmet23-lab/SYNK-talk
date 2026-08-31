'use strict';
/**
 * 제출 로그 — 순수 함수만. 파일을 읽고 쓰는 것은 저장 어댑터(src/저장.js)의 일이다.
 *
 * 핵심 규약 (설계 §3):
 *   · **지우지 않는다.** 재시도는 attempt 를 올려 새 항목으로 쌓인다 — 이전 항목은 그대로.
 *     「몽골 학생이 스스로 고친 지점」이 이 로그의 존재 이유라서, 덮어쓰기는 곧 데이터 파괴다.
 *   · **무발화도 항목이다**(status 'abandoned'). 성공만 남기면 「어디서 막혔는지」가 사라진다.
 *   · 필드는 늘려도 되지만 이름 변경·삭제는 금지 — 어휘가 갈라지면 집계가 깨진다(수집층 규약 승계).
 *
 * 항목 모양:
 *   { id, date, step, attempt, status: 'submitted'|'retried'|'abandoned',
 *     ⌞ step 의 정본은 `lib/걸음.js` 하나다(따라 · 따라1..N · 답하기 · 라디오낭독).
 *       여기 목록을 다시 적으면 이름을 늘리는 자리와 아는 자리가 갈라진다 — 08-14 실사고.
 *     duration_ms, hesitation_ms, spoke: boolean, threshold_db,
 *     text: string|null, audio: string|null, prompt_id, created_at, correlation_id,
 *     replayed_at: string|null,
 *     선택: object|null, 선택때: string|null,
 *     idempotency_key, event_id: string|null, send_error: string|null, send_final: boolean,
 *     replay_event_id: string|null, replay_error: string|null, replay_final: boolean,
 *     choice_event_id: string|null, choice_error: string|null, choice_final: boolean }
 *
 * 뒤 세 칸은 **서버에 닿았는가**다(C0 §4-1). 셋이 각각 다른 사실이라 하나로 못 합친다:
 *   `event_id` 있음 = 저장됐다 · `send_error` = 마지막 실패 사유 · `send_final` = 다시 보내도 소용없다.
 *   🔴 실패를 `event_id: null` 하나로만 두면 「아직 안 보냄」과 「보냈는데 거절당함」이 같은 모양이
 *   되고, 후자는 영원히 재시도된다(계약 위반은 100번 보내도 계약 위반이다).
 *
 * 맨 뒤 세 칸은 **되듣기 관측이 닿았는가**다(전층감사 §2-7 · 아래 `되듣기기록`). 한 항목이 사건을
 *   **둘** 낳으므로(제출 · 되듣기) 칸을 나눈다 — 겹쳐 적으면 되듣기 실패가 제출을 「안 닿음」으로
 *   되돌리고, 그러면 이미 저장된 발화가 다시 올라간다.
 */

const { 녹음걸음인가 } = require('./걸음.js');

/**
 * 앱이 짓는 **v4 uuid** — 이 파일의 두 이름이 다 이걸로 난다:
 *   · `correlation_id` = 한 앉음(흐름 · P0 §3-1 ④ · L0 「한 수업·한 세션의 흐름」)
 *   · `idempotency_key` = 한 항목(C0 §4-1 「이벤트를 만들 때 한 번 생성하고 재시도해도 안 바꾼다」)
 *
 * 🔴 **uuid 여야 한다.** `correlation_id` 는 L0 의 그 열이 `uuid` 라 서버가 모양을 먼저 보고
 *   아니면 400 `CONTRACT_VIOLATION`(`retryable:false`) 로 접는다 — 그 발화는 다시 보내지지도
 *   않는다. `submission:{날짜}:{호흡}:{시도}` 같은 읽히는 문자열을 쓰고 싶어지는 자리인데,
 *   **그 문자열은 멱등키의 규칙도 아니다**(절단문서 ①-5 · 아래 `항목추가` 참조).
 *
 * ⚠ 이 파일의 **유일한 비순수 함수**다. 그래도 여기 두는 이유: 항목의 정체(`id`·`attempt`)를
 *   정하는 곳이 여기 하나이고, 화면에 두면 회귀가 못 닿는다(화면 검사는 구문뿐이다).
 * 🔑 `crypto.randomUUID` 는 **기기에 있다고 가정하지 않는다** — Hermes 에도 Expo 57 winter
 *   런타임에도 `crypto` 전역이 없다(실측: `node_modules/expo/build/winter` 에 없음).
 *   있으면 쓰고 없으면 `Math.random` 으로 v4 모양을 짠다. 이 값은 **묶는 키지 비밀이 아니다.**
 */
function 흐름id() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * 같은 날·같은 호흡의 다음 attempt 번호. 1부터.
 * abandoned 도 시도다 — 세지 않으면 「두 번 막히고 세 번째에 말했다」가 「한 번에 말했다」로 둔갑한다.
 */
function 다음시도번호(로그, date, step) {
  let max = 0;
  for (const e of 로그) {
    if (e.date === date && e.step === step && e.attempt > max) max = e.attempt;
  }
  return max + 1;
}

/**
 * 항목을 만들어 붙인 **새 배열**을 돌려준다. 원본은 건드리지 않는다.
 * @returns {{로그: object[], 항목: object}}
 */
function 항목추가(로그, { date, step, status, duration_ms, hesitation_ms, spoke, threshold_db, text, audio, prompt_id, created_at, task_meta, capture_app, correlation_id, replayed_at, 선택, 선택때, compose_meta }) {
  /* 🔴 **목록을 여기 적지 않는다** — 그게 08-14~08-26 의 병이었다. 라디오 낭독이 자기 걸음
   *   이름을 세웠는데 이 줄의 `'따라'|'답하기'` 가 안 따라와, 낭독 제출이 **전건 던지고**
   *   화면은 「제출」을 눌러도 아무 일이 안 일어났다(오류 한 줄 없이). 정본 = `lib/걸음.js`. */
  if (!녹음걸음인가(step)) throw new Error(`녹음이 없는 호흡: ${step}`);
  // retried = 「다시 말하기」로 대체된 시도 — 음성은 그대로 보관된다(설계 §3-1: 자기수정 데이터의 몸통)
  if (status !== 'submitted' && status !== 'retried' && status !== 'abandoned')
    throw new Error(`알 수 없는 status: ${status}`);
  const attempt = 다음시도번호(로그, date, step);
  const 항목 = {
    id: `${date}-${step}-${attempt}`,
    date,
    step,
    attempt,
    status,
    duration_ms,
    hesitation_ms,
    spoke: !!spoke,
    threshold_db,
    text: text || null,
    audio: audio || null,
    prompt_id: prompt_id || null,
    created_at,
    /* 🔑 **그때 서버가 준 봉투 재료를 항목이 들고 간다**(`task_ref`·급수·목적·호흡별 형식).
     *   이 로그가 사실상 오프라인 큐라서, 3일 뒤에 올라가는 항목도 있다. 그때 오늘 재료로 보내면
     *   **어제 발화가 오늘 과제에 붙는다** — 오류 없이, 조회할 때에야 어긋나 보인다.
     *   C0 §4-1 이 급수를 앱이 보내라고 한 근거와 같다: 그때 화면이 알던 값을 그때 적는 것. */
    task_meta: task_meta || null,
    capture_app: capture_app || null,
    /* 🔑 **항목이 들고 간다** — task_meta 와 같은 이유다. 이 로그가 오프라인 큐라서 3일 뒤에
     *   올라가는 항목이 있고, 보낼 때 「지금 흐름」을 붙이면 그 항목이 **남의 앉음에 묶인다**.
     *   오류 없이, 조회할 때에야 어긋나 보인다(그때는 어느 쪽이 맞는지 아무도 모른다). */
    correlation_id: correlation_id || null,
    /* 🔴 **기기 안에서만 사는 칸이다 — 제출 사건에는 안 실린다**(절단문서 ①-2 의 마지막 값).
     *   「자기 목소리를 되들었나」는 c9 `content.viewed` **한 행**으로 따로 나가고, 그 행의 부모는
     *   바로 이 항목의 제출 사건이라 **서버 `event_id` 가 나온 뒤에야** 보낼 수 있다(없는 부모는
     *   `functions/events` 고리풀기가 `retryable:false` 로 접는다 = 그 한 건 영구 소멸).
     * 🔑 화면 ref 가 아니라 **항목**에 두는 이유는 offline 이다 — 회선이 죽어 사흘 밀린 항목도
     *   올라가는 날 그 관측이 함께 간다. ref 에 두면 화면을 닫는 순간 사라지고, 되듣기는 소급 불가다.
     *   (`task_meta`·`correlation_id` 를 항목이 들고 가는 것과 같은 이유·같은 자리다.) */
    replayed_at: replayed_at || null,
    /* 🔴 **「보기 중에서 골랐다」의 재료**(`choice.selected` · 성향 축 ⑤의 유일한 입구).
     *   `replayed_at` 과 **같은 자리·같은 이유**다: 이 로그가 오프라인 큐라 사흘 밀린 항목도
     *   올라가는 날 그 관측이 함께 가야 한다. 화면 ref 에 두면 앱을 닫는 순간 사라지고,
     *   「그날 무엇에 끌렸나」는 소급이 없다.
     * 🔴 **payload 를 통째로 들고 온다** — 여기서 조립하지 않는다. `latency_ms` 가 단조 시계
     *   두 값의 차라 그 화면에서만 잴 수 있고(`lib/선택로그.js`), 나중에 벽시계로 되재면
     *   그 행이 «오래 망설인 학생»으로 조용히 둔갑한다.
     * ⚠ **한 앉음에 한 번만 실린다** — 「다시 말하기」로 시도가 늘어도 고름은 한 번이다.
     *   시도마다 담으면 사건이 시도 수만큼 나가고, ⑤축의 분포는 «많이 다시 말한 학생»쪽으로
     *   통째로 기운다. 그 규칙은 넘겨 주고 비우는 화면 쪽이 진다(`되들은때` 와 같은 형태). */
    선택: 선택 || null,
    선택때: 선택때 || null,
    /* 🔴 **병기 글의 작성 과정**(철학 Ⅱ-9 · `lib/저작신뢰.js`). `replayed_at`·`선택` 과 **같은 자리·
     *   같은 이유**다: 이 로그가 오프라인 큐라 사흘 밀린 항목도 올라가는 날 자기 것을 들고 가야 한다.
     *   화면 ref 에 두면 앱을 닫는 순간 사라지고, 「어떻게 썼나」는 소급이 없다(키스트로크 로그를
     *   안 남기므로 집계값이 곧 원본이다 · `lib/작성과정.js` 머리말).
     * 🔑 없으면 `null` — 음성만 낸 날은 잴 것이 없었던 것이고, 그건 「즉답으로 썼다」와 다른 사실이다. */
    compose_meta: compose_meta || null,
    /* 🔴 **여기서 한 번 짓고 다시는 안 짓는다**(C0 §4-1). 보낼 때 항목 좌표로 조립하면
     *   `submission:{날짜}:{호흡}:{시도}` 가 되는데, `attempt` 는 **로컬 로그에서 세는 값**이라
     *   재설치·로그 초기화·다른 기기에서 1 로 되돌아간다. 그러면 오늘 새로 녹음한 발화가 이미
     *   서버에 있는 옛 행과 **같은 키**가 되고, 서버는 `duplicate` + 원래 `event_id` 를
     *   **성공으로** 돌려준다 — 앱은 「도착」이라 적고 그 녹음은 어디에도 안 남는다.
     *   👉 손실이 성공과 **똑같은 모양**이라 아무도 못 알아챈다(절단문서 ①-5 · 심문 6건 전부 지적).
     * 🔑 재시도가 새 행을 만들지 않는 것은 **항목이 이 값을 들고 있기** 때문이다 — 같은 항목을
     *   백 번 보내도 키가 같다. uuid 가 위험해지는 것은 보낼 때마다 새로 짓는 경우뿐이다.
     * ⚠ 서버 **배치**는 반대로 결정론 키를 쓴다(`task:{learner_id}:{날짜}`) — 배치는 재실행이
     *   같은 사실을 다시 쓰는 것이라 접혀야 맞고, 앱은 매번 다른 발화라 접히면 안 된다. */
    idempotency_key: 흐름id(),
    event_id: null,
    send_error: null,
    send_final: false,
  };
  return { 로그: 로그.concat([항목]), 항목 };
}

/**
 * 전송 결과를 그 항목에 적는다 — **항목을 지우거나 다시 만들지 않는다**(같은 id 그대로).
 * @param {object[]} 로그
 * @param {string} id
 * @param {{event_id?: string|null, 오류?: string|null, 끝?: boolean}} 결과
 * @returns {object[]} 새 배열
 */
function 전송기록(로그, id, { event_id = null, 오류 = null, 끝 = false } = {}) {
  return 로그.map((e) =>
    e.id === id ? { ...e, event_id: event_id || null, send_error: 오류 || null, send_final: !!끝 } : e
  );
}

/**
 * 아직 서버에 닿지 않았고 **다시 보낼 값이 있는** 항목들 — 만들어진 순서 그대로.
 * 🔑 순서를 유지하는 것이 규약이다: 같은 호흡의 attempt 1·2 가 뒤집혀 올라가면
 *   `payload.attempt_no` 는 맞아도 서버가 받은 순서와 학생이 말한 순서가 갈린다.
 */
function 밀린것(로그) {
  return 로그.filter((e) => !e.event_id && !e.send_final);
}

/**
 * **지금** 회선에 실어도 되는 것 — 막힌 학생의 발화는 나가지 않는다 (C0 §7 왕복 5).
 *
 * 🔴 `밀린것` 과 뜻이 다르다. 저쪽은 「기기에 남아 있고 다시 보낼 값이 있는가」(도착 표시가 읽는
 *   값)이고, 이쪽은 「지금 보내도 되는가」다. 막힌 학생의 발화를 보내면 서버가
 *   `CONSENT_MISSING`(`retryable:false`)으로 접고 앱은 그것을 `send_final` 로 적어
 *   **`밀린것` 에서 영영 뺀다** — 동의가 다시 서는 날 나갈 수 있었던 발화를 버리는 셈이다
 *   (append-only · 소급 0). 멈추는 것이지 **기기에서 지우는 것이 아니다.**
 * 🔑 인자를 **둘 다 필수**로 둔다. 기본값을 주면 안 넘긴 호출부가 조용히 옛 동작으로 돌아가고,
 *   새는 방향은 언제나 「보낸다」다.
 * @param {object[]} 로그
 * @param {{code: string}|null|undefined} 막힘  `GET /v1/tasks` 의 `blocked`
 */
function 보낼것(로그, 막힘) {
  return 막힘 ? [] : 밀린것(로그);
}

/* ── 되듣기 관측의 도착 (전층감사 §2-7) ──────────────────────────────────────────
 * 🔴 **제출이 닿는 순간 그 항목은 재전송 대상에서 빠진다** — `밀린것` 이 고르는 것은 `event_id`
 *   가 **없는** 항목이다. 그런데 되듣기 `content.viewed` 는 그 제출이 착지한 «뒤에»야 만들어진다
 *   (`오늘과제.되듣기사건` — 부모가 그 제출 사건이라 먼저 보내면 서버가 `retryable:false` 로 접는다).
 *   그래서 되듣기는 **구조적으로 재전송 대상 밖**이었고, 한 번 실패하면 다시 볼 자리가 없었다.
 *   회선이 상시 끊기는 몽골에서 그 한 번은 곧 영구 소멸이고 소급도 없다(「그날 되들었는가」).
 * 🔑 **키는 이미 안정적이다** — `${idempotency_key}:replay` 는 디스크에 남는 항목 키에서 파생하니
 *   앱을 껐다 켜도 같은 값이 난다. 그래서 필요한 것은 새 키가 아니라 **적어 두는 칸**뿐이다:
 *   몇 번을 다시 보내도 서버가 같은 키를 `duplicate` 로 접는다. */
function 되듣기기록(로그, id, { event_id = null, 오류 = null, 끝 = false } = {}) {
  return 로그.map((e) =>
    e.id === id
      ? { ...e, replay_event_id: event_id || null, replay_error: 오류 || null, replay_final: !!끝 }
      : e
  );
}

/**
 * 되듣기 관측을 **아직 못 보낸** 항목들 — 제출이 이미 착지한 것만, 만들어진 순서 그대로.
 *
 * 🔑 조건 넷이 각각 다른 사실이다: `replayed_at` = 되들은 적이 있다 · `event_id` = 가리킬 부모가
 *   생겼다 · `replay_event_id` = 이미 닿았다 · `replay_final` = 다시 보내도 소용없다.
 * 🔴 막힘은 `보낼것` 과 **같은 규칙**으로 진다. 막힌 학생 것을 보내면 서버가 `retryable:false` 로
 *   접고 앱이 그것을 `replay_final` 로 적어, **동의가 서는 날 나갈 수 있었던 관측을 버린다.**
 *   인자를 둘 다 필수로 두는 이유도 같다 — 기본값을 주면 안 넘긴 호출부가 조용히 옛 동작으로
 *   돌아가고, 새는 방향은 언제나 「보낸다」다.
 * 🔑 옛 로그에는 이 칸들이 **아예 없다.** 없음은 「아직 안 보냄」으로 읽힌다(`!undefined`) — 그래서
 *   판이 올라간 뒤 그동안 소멸했던 되듣기가 한 번씩 다시 나가고, 이미 닿았던 것은 키가 같아 접힌다.
 * @param {object[]} 로그
 * @param {{code: string}|null|undefined} 막힘  `GET /v1/tasks` 의 `blocked`
 */
function 되듣기보낼것(로그, 막힘) {
  if (막힘) return [];
  return 로그.filter((e) => e.replayed_at && e.event_id && !e.replay_event_id && !e.replay_final);
}

/* ── 고름의 도착 (`choice.selected` · 성향 축 ⑤) ─────────────────────────────
 * 되듣기와 **칸을 나눈다** — 한 항목이 사건을 셋까지 낳으므로(제출 · 되듣기 · 고름) 겹쳐 적으면
 * 한쪽 실패가 다른 쪽을 「안 닿음」으로 되돌리고, 그러면 이미 저장된 것이 다시 올라간다. */
function 선택기록(로그, id, { event_id = null, 오류 = null, 끝 = false } = {}) {
  return 로그.map((e) =>
    e.id === id
      ? { ...e, choice_event_id: event_id || null, choice_error: 오류 || null, choice_final: !!끝 }
      : e
  );
}

/**
 * 고름 관측을 **아직 못 보낸** 항목들 — 만들어진 순서 그대로.
 *
 * 🔴 **제출 착지를 안 기다린다** — 되듣기와 갈리는 유일한 자리다. 되듣기의 부모는 그 제출
 *   사건이라 `event_id` 가 나와야 만들어지지만(`되듣기사건`), 고름은 부모가 없다: 학생이 보기를
 *   고른 것은 그 자체로 완결된 관측이고 한 앉음과의 연결은 `correlation_id` 가 진다.
 *   여기서 `e.event_id` 를 같이 걸면 **제출이 영영 못 나가는 날 고름까지 함께 죽는다** —
 *   회선이 상시 끊기는 몽골에서 그건 드문 경우가 아니다.
 * 🔴 막힘은 `보낼것` 과 **같은 규칙**으로 진다(인자 둘 다 필수 · 새는 방향은 언제나 「보낸다」).
 * 🔑 옛 로그에는 이 칸들이 아예 없다 — 없음은 「아직 안 보냄」으로 읽힌다(`!undefined`).
 * @param {object[]} 로그
 * @param {{code: string}|null|undefined} 막힘  `GET /v1/tasks` 의 `blocked`
 */
function 선택보낼것(로그, 막힘) {
  if (막힘) return [];
  return 로그.filter((e) => e.선택 && !e.choice_event_id && !e.choice_final);
}

/** JSONL 직렬화 — 한 줄 한 항목. 파일이 중간에 깨져도 앞 줄들은 산다. */
function 직렬화(로그) {
  return 로그.map((e) => JSON.stringify(e)).join('\n') + (로그.length ? '\n' : '');
}

/** JSONL 역직렬화 — 깨진 줄은 버리되 **몇 줄을 버렸는지 센다**(「모름」을 「정상」으로 바꾸지 않는다). */
function 역직렬화(text) {
  const 로그 = [];
  let 깨진줄 = 0;
  for (const line of String(text || '').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      로그.push(JSON.parse(s));
    } catch (_) {
      깨진줄++;
    }
  }
  return { 로그, 깨진줄 };
}

/** 오늘 제출이 완료됐는가 — 답하기가 submitted 면 학습 출석이다(설계 §2). */
function 학습출석(로그, date) {
  return 로그.some((e) => e.date === date && e.step === '답하기' && e.status === 'submitted');
}

/**
 * 오늘 낸 것이 **서버에 닿았는가**를 센다 — 화면이 「도착했어요」라고 말해도 되는지의 근거.
 * 🔴 기기 저장과 서버 도착을 합치지 않는다. 저장만 끝난 발화는 우리 눈에 없는 것인데, 화면이
 *   도착을 선언하면 그 사실을 몇 주 뒤에나 알게 된다(P0 §4-1 「막힌 것이 통과한 것처럼 보이는 상태」).
 * 🔑 「보내는 중」의 판정은 `밀린것` 에서 **파생**시킨다 — 같은 판정을 두 곳에 적으면 갈라지고,
 *   갈라진 쪽은 언제나 화면(=학생이 믿는 쪽)이 틀린다.
 */
function 배달상태(로그, date) {
  const 오늘것 = 로그.filter((e) => e.date === date);
  return {
    도착: 오늘것.filter((e) => e.event_id).length,
    보내는중: 밀린것(오늘것).length, // 아직 안 닿았고 **다시 보낼 값이 있다**
    못보냄: 오늘것.filter((e) => !e.event_id && e.send_final && e.task_meta).length, // 다시 보내도 소용없다
    /* 폴백 날 — 실패가 아니라 «기기 저장». 끝:true + task_meta 없음 조합은 제출API 폴백 갈래
     * (그날 서버 과제를 못 받아 기기에만 남김)뿐이다 — 항목추가가 task_meta 를 항상 싣는다. */
    기기보관: 오늘것.filter((e) => !e.event_id && e.send_final && !e.task_meta).length,
  };
}

/* 보존창의 첫 날 — `오늘` 포함 뒤로 `보존일수` 만큼. 오늘이 날짜 모양이 아니면 null(= 걷지 않는다). */
function 보존경계(오늘, 보존일수) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(오늘 || ''));
  if (!m || !(보존일수 > 0)) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] - (보존일수 - 1))).toISOString().slice(0, 10);
}

/**
 * 로그 압축 — 파일이 영영 자라는 것을 막는 **유일한** 처방(G2-9).
 *   저장(`src/저장.js`)이 매 담기·밀기마다 전체 파일을 파싱·재직렬화하므로, 파일 크기가 곧
 *   그 비용이다(쓰기 API 는 동기 `write` 뿐이라 「비동기로」는 이 판에 없다 — 작게 유지가 실효 처방).
 *
 * 남기는 규칙 — **소비자의 답이 압축 전후 같아야 한다**(`tests/로그압축.test.js` 가 그 동일성을 잰다):
 *   · 보존창 안(date ≥ 경계) 행 전부 — 화면 소비자(학습출석·배달상태·다음시도번호)는 오늘만 묻는다.
 *   · 창 밖이라도 **아직 못 보낸 것 전부** — 제출(`밀린것`)·되듣기(`되듣기보낼것`)·고름(`선택보낼것`).
 *     이 로그는 오프라인 큐라, 걷으면 사흘 밀린 발화가 조용히 소멸한다(지우지 않는다 규약의 실체).
 *   · 창 밖의 끝난 것은 (date,step)별 **최대 attempt 행 하나**를 골격으로 — `다음시도번호` 가
 *     그 최대값에서 이어 센다. `학습출석` 이 갈리지 않게 최대 attempt 가 submitted 가 아니면
 *     submitted 최대 행도 하나 더 남긴다(status 를 지어내 바꾸지 않는다).
 *   · 골격 = 무거운 칸(text·task_meta·compose_meta·선택·선택때)만 null 로 걷은 같은 행 —
 *     배달상태의 재료(event_id·send_final)와 정체(id·date·step·attempt·status)는 그대로다.
 *
 * @param {object[]} 로그
 * @param {string} 오늘 `YYYY-MM-DD`(몽골 달력 — `lib/몽골날짜.js`)
 * @param {number} [보존일수]
 * @returns {object[]} 걷을 것이 없으면 **원본 그대로**(참조 동일) — 호출부가 「다르면 쓰기」로 가른다.
 */
function 압축(로그, 오늘, 보존일수 = 14) {
  if (!Array.isArray(로그) || 로그.length === 0) return 로그;
  const 경계 = 보존경계(오늘, 보존일수);
  if (!경계) return 로그;
  /* 못 보낸 것 판정은 **그 함수들을 재사용**한다 — 여기 다시 적으면 두 자가 갈라진다.
     막힘은 null 로 묻는다: 「보낼 것이 남았는가」는 지금 막혔는지와 무관한 사실이다. */
  const 못보낸 = new Set([
    ...밀린것(로그), ...되듣기보낼것(로그, null), ...선택보낼것(로그, null),
  ].map((e) => e.id));
  const 창밖끝난 = (e) => !!e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
    && e.date < 경계 && !못보낸.has(e.id);

  const 최대 = new Map();      // date\0step → 최대 attempt 행
  const 출석최대 = new Map();  // date\0step → 최대 attempt «submitted» 행
  for (const e of 로그) {
    if (!창밖끝난(e)) continue;
    const k = `${e.date} ${e.step}`;
    const 앞 = 최대.get(k);
    if (!앞 || (e.attempt || 0) > (앞.attempt || 0)) 최대.set(k, e);
    if (e.status === 'submitted') {
      const 앞2 = 출석최대.get(k);
      if (!앞2 || (e.attempt || 0) > (앞2.attempt || 0)) 출석최대.set(k, e);
    }
  }
  const 남김 = new Set();
  for (const e of 최대.values()) 남김.add(e.id);
  for (const e of 출석최대.values()) 남김.add(e.id);

  let 바뀜 = false;
  const 결과 = [];
  for (const e of 로그) {  // 순서 유지가 규약이다(`밀린것` 머리말) — 원래 자리 그대로 거른다
    if (!창밖끝난(e)) { 결과.push(e); continue; }
    if (!남김.has(e.id)) { 바뀜 = true; continue; }
    if (e.text == null && e.task_meta == null && e.compose_meta == null && e.선택 == null && e.선택때 == null) {
      결과.push(e); // 이미 골격 — 다시 만들면 매 호출이 「다르다」가 되어 쓰기가 영영 돈다
      continue;
    }
    결과.push({ ...e, text: null, task_meta: null, compose_meta: null, 선택: null, 선택때: null });
    바뀜 = true;
  }
  return 바뀜 ? 결과 : 로그;
}

/**
 * 깨진 줄 수를 학생 화면 문구 한 줄로 바꾼다 — **이 문장은 여기에만 산다.**
 *
 * 🔴 같은 문구가 세 화면(말하기·교수멘탈·보고서교정)에 그대로 복제돼 있었고, 셋 다
 *   반말 「…읽지 못했다」였다 — 앱 전체가 해요체인데 학생 오류칸에서만 말이 갈렸다.
 *   호출부마다 고치면 네 번째 복제가 또 갈린다(같은 절차 3번째 = 원인을 못 쓰게 만들 자리).
 *   그래서 문장을 **숫자를 만드는 여기**(`역직렬화`가 깨진줄을 센다)에 두고,
 *   사본·미호출은 `tests/기록안내.test.js` 가 막는다.
 *   카피 전수감사 ㉠ · 유호 확정 2026-08-13(「따뜻하되 직관적」).
 *
 * @param {number} 깨진줄 역직렬화가 못 읽고 버린 줄 수
 * @returns {string|null} 띄울 문구 — 0줄이면 null(아무것도 띄우지 않는다)
 */
function 깨진기록안내(깨진줄) {
  if (!(깨진줄 > 0)) return null;
  return `저장된 기록 중 ${깨진줄}줄을 읽지 못했어요 — 남은 기록으로 이어가요`;
}

module.exports = { 흐름id, 다음시도번호, 항목추가, 직렬화, 역직렬화, 학습출석, 전송기록, 밀린것, 보낼것, 되듣기기록, 되듣기보낼것, 선택기록, 선택보낼것, 배달상태, 압축, 보존경계, 깨진기록안내 };
