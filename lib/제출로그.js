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
 *     text: string|null, audio: string|null, prompt_id, created_at,
 *     event_id: string|null, send_error: string|null, send_final: boolean }
 *
 * 뒤 세 칸은 **서버에 닿았는가**다(C0 §4-1). 셋이 각각 다른 사실이라 하나로 못 합친다:
 *   `event_id` 있음 = 저장됐다 · `send_error` = 마지막 실패 사유 · `send_final` = 다시 보내도 소용없다.
 *   🔴 실패를 `event_id: null` 하나로만 두면 「아직 안 보냄」과 「보냈는데 거절당함」이 같은 모양이
 *   되고, 후자는 영원히 재시도된다(계약 위반은 100번 보내도 계약 위반이다).
 */

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
function 항목추가(로그, { date, step, status, duration_ms, hesitation_ms, spoke, threshold_db, text, audio, prompt_id, created_at, task_meta, capture_app }) {
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

module.exports = { 다음시도번호, 항목추가, 직렬화, 역직렬화, 학습출석, 전송기록, 밀린것 };
