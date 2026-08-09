'use strict';
/**
 * 요청 사건 하나의 **내용 지문** — 멱등키 충돌이 손실을 「성공」으로 위장하는 자리를 막는다.
 *
 * ■ 무엇이 걸려 있나 (C0 심문 B2 · 3벌 공통 지적 · 소급 불가)
 *   `functions/events` 는 `on conflict (learner_id, idempotency_key) do nothing` 뒤에
 *   **내용을 안 보고** `duplicate` + 기존 `event_id` 를 돌려줬다. 앱은 그걸 성공으로 읽고
 *   (`src/사건통로.js` — `stored` 와 같은 갈래) 큐에서 지운다. 그래서 같은 키가 **다른 내용**에
 *   두 번 쓰이면 **뒤엣것이 통째로 사라지고**, 사라지는 쪽은 늘 학생 발화다.
 *   증상이 「조용함」뿐이라 개원 뒤엔 발견할 방법도 없다 — 그래서 첫 제출 전에 건다.
 *
 * ■ 무엇을 해시하나 — **앱이 보낸 사건 원본 그대로**
 *   서버가 얹는 것(`capture_meta.server`·`consent_id`·`source_kind`…)은 요청이 아니다.
 *   그것까지 섞으면 같은 요청이 서버 상태에 따라 다른 지문이 되고, 정상 재전송이 충돌로 뜬다.
 *   `idempotency_key` 자체는 **포함한다** — 같은 키끼리만 비교하므로 늘 같고, 빼려면 키 이름을
 *   여기 한 번 더 적어야 한다(적는 순간 갈라진다).
 *
 * ■ 정규화가 이 파일의 전부다
 *   JSON 은 키 순서를 보장하지 않는다. 앱이 같은 객체를 다른 순서로 직렬화하면 지문이 달라지고,
 *   그러면 **정상 재전송이 충돌로 거절된다** — 막으려던 것보다 나쁜 고장이다.
 *   그래서 재귀 키 정렬 후 직렬화한다. 배열은 순서가 의미이므로 그대로 둔다.
 *
 * ⚠ 트레이드오프를 밝혀 둔다: 앱이 재전송하며 필드를 **하나라도 더 채우면** 지문이 갈리고
 *   그 항목은 새 키로 다시 저장된다(= 중복 행). 손실보다 중복을 고른 것이다 —
 *   손실은 소급 불가이고 중복은 나중에 지문으로 묶어 정리할 수 있다.
 *
 * 🔑 `crypto.subtle` 은 Deno·Node 18+ 에 다 있다. **앱은 이 파일을 안 쓴다** —
 *   기기엔 `crypto` 전역이 없을 수 있고(`lib/제출로그.js` 흐름id 머리말), 지문은 서버 몫이다.
 */

/** 키를 재귀 정렬한 사본. 배열 순서·null·원시값은 그대로. */
function 정렬(v) {
  if (Array.isArray(v)) return v.map(정렬);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      // undefined 는 JSON.stringify 가 어차피 지운다 — 여기서 지워 키 목록까지 같게 만든다.
      if (v[k] !== undefined) out[k] = 정렬(v[k]);
    }
    return out;
  }
  return v;
}

/** 정규화 문자열. 지문의 입력이자, 어긋났을 때 사람이 눈으로 볼 수 있는 유일한 형태다. */
function 정규화(사건) {
  return JSON.stringify(정렬(사건));
}

/**
 * 사건 하나의 sha256 지문(hex 64자).
 * @param {object} 사건  앱이 보낸 events[] 원소 하나 (서버가 얹기 **전**)
 * @returns {Promise<string>}
 */
async function 요청해시(사건) {
  const bytes = new TextEncoder().encode(정규화(사건));
  const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

module.exports = { 요청해시, 정규화, 정렬 };
