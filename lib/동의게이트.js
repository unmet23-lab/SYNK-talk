/* 동의 게이트 — 「이 학생의 동의가 유효한가」의 **유일한 정본**.
 *
 * ■ 왜 생겼나 (2026-08-07 실측) — 같은 판정이 **네 곳에 네 가지로** 적혀 있었다.
 *
 *   | 자리 | `agreed_at` | `revoked_at` |
 *   |---|---|---|
 *   | `functions/uploads` | `<= now()` | `is null or > now()` |
 *   | `functions/events`  | `<= occurred_at`(기기 시계) | `is null or (> occurred_at and > now())` |
 *   | `functions/deliver` | **조건 없음** | `is null` |
 *   | `tools/동의발급.js` | uploads 소스를 파싱해 파생 | 동 |
 *
 *   🔴 `deliver` 가 **양쪽으로** 어긋나 있었고 증상은 둘 다 「이유 없음」이다:
 *     · 미래 날짜 동의 → **배정은 되는데 업로드는 403** (학생은 과제를 보고도 못 올린다 ·
 *       `동의발급.js` 가 도구 안에서 막으려던 그 함정이 배치 쪽으로 열려 있었다)
 *     · 철회가 미래로 예약된 학생 → **배정이 안 되는데 업로드는 통과** (화면이 비는데 이유가 없다)
 *   🔴 그리고 F(장부): `events` 가 기기 시계와 DB 시계를 직접 비교해 왕복이 **같은 조건에서
 *     적색 2회·초록 2회**로 흔들렸다. 판정이 흩어져 있으면 그런 seam 이 한 자리의 사고로 안 보인다.
 *
 * ■ 그래서 두 가지 **뜻**만 남긴다 — 이름이 시점을 말한다.
 *   · `지금유효` : 수집이 **지금** 벌어진다(서명 발급·배정). 시계는 DB 하나뿐이다.
 *   · `그때유효` : **그 발화 시점**에 살아 있던 동의(사건 적재). 사후 동의는 과거를 유효하게
 *     만들지 못하고, 철회 뒤에는 과거 시각을 주장해도 새 수집이 없다.
 *   🚫 **세 번째 뜻을 만들지 않는다.** 새 자리가 생기면 둘 중 하나를 고르는 것이지 조건을 새로
 *     적는 것이 아니다 — 네 곳이 네 가지가 된 경로가 정확히 그 「조금 다른 한 줄」이었다.
 *
 * ⚠ **`그때유효` 의 `occurred_at` 은 기기 시계다**(C0 §4-1 이 「못 믿는다」고 못박은 값).
 *   시계가 뒤처진 학생은 방금 동의하고도 `CONSENT_MISSING` 을 받는다 — 설계 seam 이고
 *   **여기서 몰래 고치지 않는다**(동의 효력 시점은 법적 판단 = 유호님 몫). 이 파일이 하는 일은
 *   그 seam 을 **한 자리에 모아 보이게** 하는 것까지다.
 *
 * ■ 쓰는 곳
 *   Deno Edge Function 은 `동봉.json` 으로 `동의게이트.mjs` 를 실어 쓴다(손 사본 금지).
 *   첫 인자는 `sql` 태그거나 트랜잭션 `tx` — 둘 다 같은 모양이라 그대로 받는다.
 */
'use strict';

/* 술어 **텍스트**도 정본이다 — 소비자가 두 모양이라서 그렇다:
 *   · Edge Function = 태그 질의(`sql\`\``) — 아래 함수들
 *   · `tools/동의발급.js 현황SQL` = 문자열로 조립하는 lateral join(태그를 못 쓴다)
 * 둘이 각자 적으면 그게 다섯 번째 사본이다. 같은 파일 안 세 줄 거리로 두고
 * `tests/동의게이트.test.js` 가 **함수 본문이 이 텍스트를 담고 있는지** 기계로 대조한다.
 * 🚫 `sql.unsafe` 로 텍스트를 태그에 끼워 넣지 않는다 — 런타임에서 깨지면 수집이 멈춘다. */
const 지금유효술어 = 'agreed_at <= now()\n       and (revoked_at is null or revoked_at > now())';

/**
 * 지금 유효한 동의 1행 — 없으면 빈 배열.
 * @param {Function} sql  postgres 태그 함수(또는 트랜잭션 `tx`)
 * @param {string} learner_id
 */
function 지금유효(sql, learner_id) {
  return sql`
    select consent_id, consent_ver from engine.consents
     where learner_id = ${learner_id}::uuid
       and agreed_at <= now()
       and (revoked_at is null or revoked_at > now())
     order by agreed_at desc limit 1`;
}

/**
 * 그 시점에 유효했던 동의 1행 — 없으면 빈 배열.
 * 🔴 `agreed_at <= occurred_at` **그리고** 철회는 그 시점·지금 **양쪽**으로 살아 있어야 한다.
 * @param {Function} sql
 * @param {string} learner_id
 * @param {string} occurred_at  ISO 8601 (기기 시계 — 위 ⚠ 참조)
 */
function 그때유효(sql, learner_id, occurred_at) {
  return sql`
    select consent_id, consent_ver from engine.consents
     where learner_id = ${learner_id}::uuid
       and agreed_at <= ${occurred_at}::timestamptz
       and (revoked_at is null or (revoked_at > ${occurred_at}::timestamptz and revoked_at > now()))
     order by agreed_at desc limit 1`;
}

/** 학생에게 나가는 거절 봉투의 몸통 — 문구까지 한 곳에서 낸다(세 함수가 각자 적으면 갈라진다). */
const 거절몸통 = {
  code: 'CONSENT_MISSING',
  field: 'consent_ver',
  retryable: false,
};

module.exports = { 지금유효, 그때유효, 지금유효술어, 거절몸통 };
