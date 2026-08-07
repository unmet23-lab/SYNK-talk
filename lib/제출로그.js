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
 *   { id, date, step: '따라'|'답하기', attempt, status: 'submitted'|'retried'|'abandoned',
 *     duration_ms, hesitation_ms, spoke: boolean, threshold_db,
 *     text: string|null, audio: string|null, prompt_id, created_at, correlation_id,
 *     idempotency_key, event_id: string|null, send_error: string|null, send_final: boolean }
 *
 * 뒤 세 칸은 **서버에 닿았는가**다(C0 §4-1). 셋이 각각 다른 사실이라 하나로 못 합친다:
 *   `event_id` 있음 = 저장됐다 · `send_error` = 마지막 실패 사유 · `send_final` = 다시 보내도 소용없다.
 *   🔴 실패를 `event_id: null` 하나로만 두면 「아직 안 보냄」과 「보냈는데 거절당함」이 같은 모양이
 *   되고, 후자는 영원히 재시도된다(계약 위반은 100번 보내도 계약 위반이다).
 */

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
function 항목추가(로그, { date, step, status, duration_ms, hesitation_ms, spoke, threshold_db, text, audio, prompt_id, created_at, task_meta, capture_app, correlation_id }) {
  if (step !== '따라' && step !== '답하기') throw new Error(`녹음이 없는 호흡: ${step}`);
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
    못보냄: 오늘것.filter((e) => !e.event_id && e.send_final).length, // 다시 보내도 소용없다
  };
}

module.exports = { 흐름id, 다음시도번호, 항목추가, 직렬화, 역직렬화, 학습출석, 전송기록, 밀린것, 배달상태 };
