/* 요청의 `Authorization` 에서 **누가 부르는가**를 꺼낸다 — Edge Function 전부가 같은 판정을 한다.
 * (「누구인가」에 이어 「아직 살아 있는가」까지 여기서 판정한다 — 맨 아래 `살아있는학생`.)
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

/** 이 토큰이 **언제 발급됐나**(`iat`, 초). 없으면 `null`.
 *
 *  🔴 폐기 판정의 시계는 이것 하나다. 서버 현재 시각으로 대신하면 방금 폐기한 계정이
 *    「지금 온 요청이니 최신」으로 되살아난다 — 판정이 정확히 반대로 뒤집힌다. */
function 발급시각(req) {
  const p = 클레임(req);
  return p && Number.isFinite(p.iat) ? p.iat : null;
}

/** 학생을 찾는 **유일한 조건**(postgres.js 조각). `where ${살아있는학생(sql, 주체, iat)}`.
 *
 * ■ 왜 여기 사나 (절단문서 ②-15 · 2026-08-07 실측)
 *   폐기 판정 자체는 DB 에 이미 있다 — `engine.session_alive()`. 그런데 그건 **RLS 정책
 *   안에서만** 불린다. `events`·`tasks`·`uploads`·`corrections`·`progress` 다섯은
 *   `service_role` 로 돌아 **RLS 를 지나지 않으므로**, 다섯 곳 모두 `auth_user_id` 하나만
 *   보고 학생을 찾고 있었다: 비밀번호를 초기화해도 옛 토큰이 읽기·쓰기·업로드 서명을
 *   그대로 이어갔다. `supabase/L0_스키마.sql` 이 "service_role 은 RLS 를 우회하므로 Edge
 *   Function 은 같은 판정을 자기 손으로 한 번 더 해야 한다"고 적어 둔 자리이고,
 *   다섯 곳 다 안 한 상태였다. 사본 다섯을 만드는 대신 조건을 여기 하나로 둔다 —
 *   이 판정도 **새는 방향이 언제나 「통과」**라, 한 곳에서 빠지면 증상이 없다.
 *
 * ■ `iat` 는 **폐기된 적 있는 계정에서만** 본다 — `session_alive()` 와 같은 순서다.
 *   · `revoked_before` 가 null = 폐기된 적 없음 → 비교할 것이 없으니 `iat` 없이도 통과.
 *     (초판이 `coalesce(revoked_before,'-infinity')` 로 전원을 잠근 사고가 여기 근거다.)
 *   · 값이 있는데 `iat` 를 못 읽으면 비교가 `null` → **거부**. 모르는 토큰은 못 지나간다.
 *   두 갈래가 SQL 정본과 어긋나지 않는지는 `tests/세션폐기.test.js` 가 기계로 대조한다.
 */
function 살아있는학생(sql, 주체, iat) {
  return sql`
    auth_user_id = ${주체}::uuid
      and active
      and (revoked_before is null or to_timestamp(${iat}::bigint) >= revoked_before)`;
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

module.exports = { 토큰주체, 발급시각, 살아있는학생, 서비스역할 };
