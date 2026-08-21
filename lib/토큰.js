/* 요청의 `Authorization` 에서 **누가 부르는가**를 꺼낸다 — Edge Function 전부가 같은 판정을 한다.
 * (「누구인가」에 이어 「아직 살아 있는가」까지 여기서 판정한다 — `살아있는학생`·`살아있는직원`.)
 *
 * ■ 왜 정본을 하나 두나 (2026-08-07 · `tasks` 가 세 번째 사본이 될 자리였다)
 *   서명 검증은 플랫폼이 이미 했다(`verify_jwt=true`). 여기서 가르는 것은 서명이 아니라
 *   **권한**이고, 그 판정은 클레임 한 칸을 보느냐 마느냐가 전부다:
 *     · `sub` 가 없으면 사람이 아니다 — **anon 키도 유효한 JWT 라 verify_jwt 를 통과한다.**
 *     · 배치를 부를 수 있는 것은 `role === 'service_role'` 인 레거시 JWT **또는** 이 프로젝트의
 *       신형 시크릿 키(`sb_secret_…`)뿐이다 — 통로가 둘인 근거는 `서비스역할` 머리말에 있다.
 *   🔴 그 한 줄이 사본 하나에서 빠져도 **증상이 없다 — 통과한다.** 새는 방향이 언제나
 *   「통과」인 판정이라 사본을 늘릴 수 없게 만든다(`tests/토큰.test.js` 가 사본을 금지한다).
 *
 * ■ base64url 은 base64 가 아니다
 *   `-`·`_` 를 되돌리지 않으면 특정 토큰에서만 `atob` 가 던지고, 그 학생만 401 이 된다.
 *   되돌림이 사본마다 있으면 그 한 줄이 빠진 사본을 찾는 데 가장 오래 걸린다.
 */
'use strict';

/** `Authorization: Bearer <값>` 의 **값 그대로**. 없으면 `null` — 던지지 않는다.
 *  🔑 JWT 든 시크릿 키든 이 자리를 지난다. 꺼내는 곳이 둘이면 한쪽만 고쳐지는 날이 온다. */
function 베어러(req) {
  const m = req && req.headers && req.headers.get('Authorization');
  const 매치 = typeof m === 'string' ? m.match(/^Bearer\s+(.+)$/i) : null;
  return 매치 ? 매치[1].trim() : null;
}

/** JWT 의 가운데 마디(클레임)만 읽는다. 못 읽으면 `null` — 던지지 않는다. */
function 클레임(req) {
  const 값 = 베어러(req);
  if (!값) return null;
  const 마디 = 값.split('.');
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
  return 살아있는사람(sql, 주체, iat);
}

/** 직원을 찾는 **유일한 조건**(`engine.staff` · 검수_내부계약 §1).
 *
 * ■ 왜 학생과 **같은 술어**를 쓰나
 *   `engine.staff` 도 `auth_user_id`·`active`·`revoked_before` 세 칸을 그대로 진다 —
 *   판정이 같으니 텍스트도 하나여야 한다. 두 벌로 적으면 한쪽만 고쳐지는 날이 오고,
 *   **새는 방향은 여기서도 「통과」**다(폐기한 검수자의 옛 토큰이 큐를 계속 읽는다).
 *   그래서 이름만 둘이고 몸은 `살아있는사람` 하나다 — 부르는 쪽이 어느 표를 여는지만 다르다.
 *
 * ■ 🔴 **역할은 여기서 안 본다**
 *   「살아 있나」와 「무엇을 해도 되나」는 다른 판정이고, 섞으면 이 술어가 통로마다 달라진다
 *   (검수는 `inspector`·`director`, 강사 통로는 `teacher`). 역할 허용 목록은 부르는 쪽이
 *   자기 계약에 적는다 — `functions/review` 가 그렇게 한다. */
function 살아있는직원(sql, 주체, iat) {
  return 살아있는사람(sql, 주체, iat);
}

/** 두 술어의 **한 몸** — 표를 안 가린다(위 두 함수의 주석이 근거). */
function 살아있는사람(sql, 주체, iat) {
  return sql`
    auth_user_id = ${주체}::uuid
      and active
      and (revoked_before is null or to_timestamp(${iat}::bigint) >= revoked_before)`;
}

/* ── 배치 호출자 판정 ────────────────────────────────────────────────
 *
 * ■ 🔴 통로가 **둘**이다 — 플랫폼이 키 시대를 갈아탔기 때문이다(2026-08-22 리허설 실측)
 *   ① **레거시 JWT**(`eyJ…`) — `role` 클레임을 본다. `pg_cron` 이 vault 의 `service_role_key`
 *      로 부르는 통로가 이것이고, 지금도 산다.
 *   ② **신형 시크릿 키**(`sb_secret_…`) — JWT 가 아니라 **클레임이 없다.** 함수 런타임의
 *      `SUPABASE_SERVICE_ROLE_KEY` 에 플랫폼이 넣어주는 값이 지금 이것이라, 함수끼리 부르는
 *      통로(`tasks:지금세우기`·`auth:첫배정세우기` → `deliver`)는 전부 ②로 온다.
 *   ①만 보던 동안 ②는 게이트웨이를 지나 **함수 안에서만** 401 이었다 — 증상은 「배정 0인 날
 *   구제가 조용히 안 돈다」 하나였고, 그날 학생 발화는 사건이 안 된다(소급 불가 · C0 심문 B3).
 *
 * ■ 왜 ②는 문자열 비교인가 — 규칙이 바뀐 게 아니라 **키의 성격**이 바뀌었다
 *   JWT 는 서명이 실려 있어 「무엇을 주장하는가」를 읽을 수 있었다. 신형 시크릿 키는 클레임이
 *   없는 **불투명한 비밀**이라, 읽을 것이 없고 **가지고 있음**이 곧 권한이다. Supabase 자신도
 *   같은 판정을 한다(`auth: 'secret'` — 대시보드의 시크릿 키와 대조).
 *   ⚠ 그래서 이 파일 옛 판의 「키 문자열 비교가 아니라 권한으로 가른다」는 ①에 대해서만 참이다.
 *
 * ■ 🔴 게이트웨이는 **키의 등급을 안 가른다** (실측 · `deliver?점검` 왕복)
 *     legacy service_role JWT → 통과   |  진짜 sb_secret_        → **통과**
 *     legacy anon JWT         → 통과   |  진짜 sb_publishable_   → **통과**
 *     가짜 sb_secret_ 문자열   → 401 게이트웨이 `Invalid API key`
 *     서명 위조 JWT(role=service_role) → 401 게이트웨이 `UNAUTHORIZED_LEGACY_JWT`
 *   즉 플랫폼이 보증하는 것은 **「이 프로젝트의 진짜 키다」**까지고, 그것이 공개 키인지
 *   시크릿 키인지는 **여기서** 갈라야 한다. 🔴 `sb_publishable_…` 는 **학생 앱 번들에 들어
 *   있다** — 등급을 안 가르면 배치 통로가 전교생에게 열린다.
 *
 * ■ 그래서 좁게 판정한다 — 넓히는 실수는 전부 「통과」로 새기 때문이다
 *   ②는 **이 프로젝트의 시크릿 키 원문과 같은가**만 본다(접두사만 보고 통과시키지 않는다).
 *   비교 대상은 플랫폼이 런타임에 넣어주는 것뿐이고, **공개 키 값은 후보에서 뺀다.**
 *
 * ⏳ 레거시 JWT 키는 Supabase 가 **2026년 말 폐기**를 예고했다 — ① 통로가 그때 죽는다.
 *   지금 사는 소비자는 `pg_cron`(vault `service_role_key`)이고, 폐기 전에 그 vault 값을
 *   시크릿 키로 갈아 끼우면 ② 통로로 넘어간다(이 판정은 그때도 그대로 선다).
 */

/** 함수 런타임의 환경변수 한 칸 — Deno(배포)·Node(회귀) 어디서든 같은 답을 준다. */
function 환경(이름) {
  /* 🔑 `Deno` 를 **맨이름으로 안 쓴다** — 이 파일은 앱 번들에도 실려서, 거기엔 그 이름이 없다
   *   (`tests/미정의심볼.test.js` 가 그 자리를 잡는다). `globalThis` 넘어로 보면 어느 런타임에서도 안전하다. */
  const D = globalThis.Deno;
  try {
    if (D && D.env && typeof D.env.get === 'function') return D.env.get(이름) || '';
  } catch { /* env 권한이 없으면 없는 것으로 친다 — 던지면 401 이어야 할 것이 500 이 된다. */ }
  try {
    const P = globalThis.process;
    if (P && P.env) return P.env[이름] || '';
  } catch { /* 같은 이유 */ }
  return '';
}

/** `{"default":"sb_secret_…"}` 같은 JSON 사전에서 **값만** 꺼낸다. 못 읽으면 빈 배열. */
function 사전값들(글) {
  if (!글) return [];
  try {
    const o = JSON.parse(글);
    if (!o || typeof o !== 'object') return [];
    return Object.values(o).filter((v) => typeof v === 'string' && v);
  } catch {
    return [];
  }
}

/** 길이·내용을 **끝까지** 비교한다 — 앞글자에서 끊으면 그 차이가 시계로 새어 나간다. */
function 같은비밀(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a) return false;
  let 차 = 0;
  for (let i = 0; i < a.length; i += 1) 차 |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return 차 === 0;
}

/** 신형 시크릿 키의 접두사 — 이 모양이 아닌 것은 ② 통로로 들어오지 못한다(닫히는 방향). */
const 시크릿접두사 = 'sb_secret_';

/** 이 프로젝트의 **시크릿 키 목록**. 🔴 공개 키(앱 번들에 있는 값)는 여기서 반드시 빠진다. */
function 시크릿키들() {
  const 공개 = new Set([환경('SUPABASE_ANON_KEY'), ...사전값들(환경('SUPABASE_PUBLISHABLE_KEYS'))].filter(Boolean));
  const 후보 = [...사전값들(환경('SUPABASE_SECRET_KEYS')), 환경('SUPABASE_SERVICE_ROLE_KEY')];
  return 후보.filter((k) => k && k.startsWith(시크릿접두사) && !공개.has(k));
}

/** 배치 호출자인가 — ①레거시 JWT 의 `role` · ②신형 시크릿 키의 원문 일치. 위 머리말이 근거다. */
function 서비스역할(req) {
  const p = 클레임(req);
  if (p) return p.role === 'service_role';       // ① JWT 통로 — 클레임이 있으면 그것만 본다
  const 제시 = 베어러(req);                       // ② 시크릿 키 통로 — 클레임이 없는 불투명 비밀
  if (!제시 || !제시.startsWith(시크릿접두사)) return false;
  return 시크릿키들().some((k) => 같은비밀(제시, k));
}

module.exports = { 토큰주체, 발급시각, 살아있는학생, 살아있는직원, 서비스역할 };
