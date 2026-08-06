/* 요청의 `Authorization` 에서 **누가 부르는가**를 꺼낸다 — Edge Function 넷이 같은 판정을 한다.
 *
 * ■ 왜 정본을 하나 두나 (2026-08-07 · `tasks` 가 세 번째 사본이 될 자리였다)
 *   서명 검증은 플랫폼이 이미 했다(`verify_jwt=true`). 여기서 가르는 것은 서명이 아니라
 *   **권한**이고, 그 판정은 클레임 한 칸을 보느냐 마느냐가 전부다:
 *     · `sub` 가 없으면 사람이 아니다 — **anon 키도 유효한 JWT 라 verify_jwt 를 통과한다.**
 *     · `role === 'service_role'` 이어야 배치를 부를 수 있다.
 *   🔴 그 한 줄이 사본 하나에서 빠져도 **증상이 없다 — 통과한다.** 새는 방향이 언제나
 *   「통과」인 판정이라 사본을 늘릴 수 없게 만든다(`tests/토큰.test.js` 가 사본을 금지한다).
 *
 * ■ base64url 은 base64 가 아니다
 *   `-`·`_` 를 되돌리지 않으면 특정 토큰에서만 `atob` 가 던지고, 그 학생만 401 이 된다.
 *   되돌림이 사본마다 있으면 그 한 줄이 빠진 사본을 찾는 데 가장 오래 걸린다.
 */
'use strict';

/** JWT 의 가운데 마디(클레임)만 읽는다. 못 읽으면 `null` — 던지지 않는다. */
function 클레임(req) {
  const m = req && req.headers && req.headers.get('Authorization');
  const 매치 = typeof m === 'string' ? m.match(/^Bearer\s+(.+)$/i) : null;
  if (!매치) return null;
  const 마디 = 매치[1].trim().split('.');
  if (마디.length !== 3) return null;
  try {
    const p = JSON.parse(atob(마디[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

/** 이 요청의 **사람**(`auth.users.id`). 사람이 아니면 `null`. */
function 토큰주체(req) {
  const p = 클레임(req);
  return p && typeof p.sub === 'string' && p.sub ? p.sub : null;
}

/** 배치 호출자인가 — 키 문자열 비교가 아니라 **권한**으로 가른다.
 *
 *  🔴 2026-08-07 실측: 이 프로젝트의 `SUPABASE_SERVICE_ROLE_KEY`(플랫폼 주입)는 새 형식
 *    `sb_secret_…`(41자)이고 Management API 가 주는 `service_role` 은 legacy JWT(219자)다.
 *    **둘은 같은 값이 아니라** 문자열 비교로는 아무도 못 부르고, 증상은 「배치가 조용히 안 돈다」다. */
function 서비스역할(req) {
  const p = 클레임(req);
  return !!p && p.role === 'service_role';
}

module.exports = { 토큰주체, 서비스역할 };
