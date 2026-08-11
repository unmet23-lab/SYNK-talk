'use strict';
/**
 * 게임 사건 로그 — G1 화면의 **오프라인 큐**. 순수 함수만(파일 I/O 는 `src/저장.js`).
 *
 * ■ 🔑 큐를 새로 짓지 않는다 — `lib/제출로그.js` 의 일반 칸들을 그대로 쓴다
 *   `전송기록`·`밀린것`·`보낼것`·`직렬화`·`역직렬화` 는 항목의 `id`·`event_id`·`send_error`·
 *   `send_final` 만 본다. `lib/교정로그.js` 가 밟은 길 그대로다 — 판정을 두 벌로 적으면
 *   「아직 안 보냄」과 「거절당함」을 가르는 판정이 갈라지고, 갈라진 쪽은 조용히 영원히
 *   재시도한다. 막힌 학생의 것이 안 나가는 것(`보낼것`)도 같은 한 벌이다.
 *
 * ■ 🚫 제출 로그(`talk_log.jsonl`)·교정 로그에 섞지 않는다
 *   `학습출석`·`배달상태` 가 talk_log 의 모든 항목을 발화로 세므로, 메일 한 통이 발화 수를
 *   늘린다. 파일이 따로다(`game_log.jsonl` · `src/저장.js`).
 *
 * ■ 항목 id = **결정론** (`교정로그.항목id` 와 같은 판정)
 *   「한 앉음의 한 사건 종류」에 항목 하나 — `mail:{correlation_id}` 꼴. 그래서 화면이 몇 번
 *   다시 불러도 같은 앉음의 고름·제출·이탈이 두 벌 서지 않는다(앉음당 1번의 기계적 실체).
 *   `idempotency_key`(서버 중복 방지)와 다른 축이다 — 이건 기기 안 중복 방지다.
 *
 * ■ `사건` 을 통째로 들고 있는다
 *   다시 보낼 때 **그 객체 그대로** 보내야 멱등키가 같고, 같아야 서버가 `duplicate` 로 접는다
 *   (C0 §4-1 「한 번 정하고 안 바꾼다」). compose_meta·선택 payload 도 그 안에 있어 사흘 밀린
 *   항목이 그날 잰 값을 그대로 들고 올라간다.
 */
const { 전송기록, 밀린것, 보낼것, 직렬화, 역직렬화 } = require('./제출로그.js');

/* event_type → 항목 id 접두. 목록 밖 사건은 이 큐에 못 든다(어느 큐 소속인지가 이 표다). */
const 접두 = Object.freeze({
  'submission.created': 'mail',
  'choice.selected': 'choice',
  'session.abandoned': 'abandon',
});

/** 항목 id — 앉음×사건종류당 하나. 모양이 아니면 null. */
function 항목id(사건) {
  if (!사건 || !사건.correlation_id) return null;
  const p = 접두[사건.event_type];
  return p ? `${p}:${사건.correlation_id}` : null;
}

/**
 * 사건을 항목으로 붙인 **새 배열**을 돌려준다. 이미 있으면 그대로(`교정로그` 와 같은 접기 —
 * 「이미 냈나」를 호출부마다 묻게 두면 한 곳이 잊고, 잊은 쪽은 조용히 사건을 늘린다).
 * @returns {{로그: object[], 항목: object|null, 새것: boolean}}
 */
function 항목추가(로그, 사건) {
  const id = 항목id(사건);
  if (!id) return { 로그, 항목: null, 새것: false };
  const 이미 = 로그.find((e) => e.id === id);
  if (이미) return { 로그, 항목: 이미, 새것: false };
  const 항목 = {
    id,
    event_type: 사건.event_type,
    사건,
    event_id: null,
    send_error: null,
    send_final: false,
  };
  return { 로그: 로그.concat([항목]), 항목, 새것: true };
}

/**
 * 이 배정(`task_ref`)의 다음 attempt 번호 — 1부터. 같은 배정 안의 재제출만 센다.
 * 날을 건넌 재제출은 **새 배정**(새 task_ref)이라 1로 시작하고, 사슬은 `retry_of_event_id` 가
 * 잇는다(`lib/제출로그.다음시도번호` 가 날짜·호흡으로 센 것과 같은 눈금 — 사슬 길이를 로컬이
 * 지어내지 않는다).
 */
function 다음시도번호(로그, task_ref) {
  let n = 0;
  for (const e of 로그) {
    if (e.event_type === 'submission.created'
      && e.사건 && e.사건.submission && e.사건.submission.task_ref === task_ref) n += 1;
  }
  return n + 1;
}

/**
 * 이 배정의 제출 항목 — 화면이 「이미 보냈다」를 판정하는 근거(다시 열면 대기 화면으로 간다).
 * 없으면 null.
 */
function 제출항목(로그, task_ref) {
  return 로그.find((e) => e.event_type === 'submission.created'
    && e.사건 && e.사건.submission && e.사건.submission.task_ref === task_ref) || null;
}

module.exports = { 항목id, 항목추가, 다음시도번호, 제출항목, 전송기록, 밀린것, 보낼것, 직렬화, 역직렬화 };
