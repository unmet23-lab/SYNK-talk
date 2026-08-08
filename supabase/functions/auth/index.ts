/* POST /v1/auth/* — 학생 계정이 서고 되살아나는 통로 (L0 §4-1-1 · §4-2 · §4-2-2)
 *
 *   /first-login  학생의 첫 등록 (anon)
 *   /reset        원장의 「비밀번호 초기화」 — 6자리 임시번호를 **1회** 낸다 (director 토큰)
 *                 계정이 아직 없는 학생에게는 임시번호 대신 **첫 등록 잠금을 푼다**(`unlocked:true`)
 *   /temp-login   학생이 그 번호로 들어와 새 비밀번호를 정한다 (anon)
 *
 * ■ 임시번호는 **GoTrue에 넣지 않는다**(유호님 확정 2026-08-07 「해시로 들고 있는 방식」)
 *   넣으면 만료라는 개념이 없어 30분이 지나도 영원히 유효하고, `temp_password_expires_at`은
 *   아무도 안 보는 장식이 된다 — 그건 **영구히 발급된 두 번째 비밀번호**다.
 *   대신 우리가 **해시+만료로** 들고 있다가 `/temp-login`에서 검증한다. 우리 코드가 반드시
 *   지나가므로 시각을 볼 수 있고, 그래서 30분이 **참**이 된다.
 *   🔑 원장 화면 흐름(버튼 → 6자리 → 말로 전달)은 한 글자도 안 바뀐다.
 *
 * ■ 초기화는 **옛 비밀번호도 죽인다** — GoTrue 비밀번호를 아무도 모르는 난수로 갈아끼운다.
 *   초기화가 필요한 현실적 사고는 「친구가 내 비번을 안다」이기도 한데, 옛 값을 살려 두면
 *   그 경우에 초기화가 아무것도 안 한 것이 된다. 세션은 `revoked_before`가 함께 끊는다.
 *
 * ■ 이 함수가 존재하는 이유
 *   계정은 **첫 로그인 때 만든다**(유호님 확정 2026-08-06). 미리 만들면 그 순간 전달해야 할
 *   초기 비밀번호가 생기고 **전달물 0** 이 깨진다. 그래서 계정 생성은 여기 한 곳에서만 일어나고,
 *   앱은 `signUp` 을 **영원히 부르지 않는다**(C0 §10 — 그 금지는 그대로 살아 있다).
 *
 * ■ 앱이 보내는 것 / 서버가 믿지 않는 것
 *   앱은 `student_code`·`phone_last4`·`password`(+복구 2칸)를 보낸다. 🔴 `learner_id` 는
 *   **받지 않는다** — 본문의 학생을 믿는 순간 `service_role` 이 RLS 를 우회해 남의 계정을 만든다
 *   (C0 §2 🔴 의 첫 등록판: 여기선 토큰이 없으므로 **게이트가 그 자리를 대신한다**).
 *
 * ■ 게이트 셋 (§4-1-1) — 뒤 4자리는 1만 가지뿐이라 자릿수가 지키는 게 아니다
 *   ① `signup_attempts` 가 5 에 이르면 잠긴다 — 해제는 원장의 `/reset` **하나뿐이고, 그게 실제로
 *      그 학생을 집는다**(2026-08-07 · 절단문서 ②-19. 그전엔 `auth_user_id is not null` 로 걸러
 *      **잠긴 학생만 정확히 빠져나가** 출구가 문서에만 있었다)
 *   ② `auth_user_id is null` 일 때만 열린다 — 성공하는 순간 이 경로는 영원히 닫힌다
 *   ③ **실패 메시지는 하나뿐이다.** 「없는 학생번호」와 「뒷자리 불일치」와 「이미 등록됨」을
 *      가르면 학생번호의 **존재 여부가 새어** 명단을 훑을 수 있다. 잠김도 가르지 않는다 —
 *      가르면 「잠겼다」는 응답 자체가 **그 번호가 실재한다**는 뜻이 되기 때문이다.
 *
 * ■ 계약판 헤더(`X-Contract-Ver`)를 **요구하지 않는다** — events 와 다른 판단이다.
 *   그 헤더는 **학습 데이터의 모양**을 가르는 것이고 로그인은 학습 데이터를 싣지 않는다.
 *   요구하면 앱의 계약판이 DB 보다 앞선 날 **학생이 앱에 아예 못 들어온다** — 막으려던 것보다
 *   사고가 크다. 응답 봉투에는 일관성을 위해 DB 의 판을 실어 준다.
 *
 * ■ `engine` 은 API 에 노출돼 있지 않다 — `supabase-js` 의 `.from()` 은 service_role 이어도
 *   PostgREST 를 못 지난다(events 가 실측). 그래서 DB 는 `SUPABASE_DB_URL` 직결이고,
 *   계정 생성만 GoTrue 관리자 API(다른 통로)를 쓴다.
 */
import postgres from 'npm:postgres@3.4.4';
import 학생계정 from './학생계정.mjs';
import 가입문항 from './가입문항.mjs';

const { 학생번호맞나, 이메일, 뒷자리맞나, 시도상한 } = 학생계정 as {
  학생번호맞나: (v: unknown) => boolean;
  이메일: (v: string) => string;
  뒷자리맞나: (명단: unknown, 입력: unknown) => boolean;
  시도상한: number;
};
/* 🔴 값목록을 여기 다시 적지 않는다 — 앱과 서버가 각자 적으면 갈라지고, 갈라진 날 증상은
 *   「어떤 학생만 등록이 안 된다」다(`학생계정` 을 동봉으로 쓰는 것과 같은 이유 · L0 §4-2). */
const { 답검사 } = 가입문항 as {
  답검사: (답: unknown) => { 필드: string; 사유: string } | null;
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });
const AUTH = `${Deno.env.get('SUPABASE_URL')!}/auth/v1`;
const 함수기지 = `${Deno.env.get('SUPABASE_URL')!}/functions/v1`;
const 서비스키 = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** §4-2 표: 6자 이상만 요구하고 복잡도 규칙은 두지 않는다(몽골 10대가 매일 치는 값이다). */
const 최소비번 = 6;
/** bcrypt 는 72바이트에서 자른다 — 조용히 잘리면 「긴 비번을 넣었는데 앞부분만 맞아도 들어가진다」. */
const 최대비번바이트 = 72;

type 오류 = { code: string; message: string; retryable: boolean; field?: string };

function 봉투(status: number, body: Record<string, unknown>, ver: string) {
  return new Response(JSON.stringify({ contract_ver: ver, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const 실패 = (status: number, e: 오류, ver: string) => 봉투(status, { ok: false, error: e }, ver);

/* 🔴 게이트 실패는 **어느 칸이 틀렸는지 알려주지 않는다**(§4-1-1 ③). 호출부가 실수로
 *   구분되는 메시지를 만들지 못하게, 문구를 여기 한 곳에 둔다. */
const 게이트실패 = (ver: string) =>
  실패(401, {
    code: 'SIGNUP_GATE_FAILED',
    message: '학생번호 또는 전화번호 뒤 4자리가 맞지 않습니다. 계속 안 되면 학원에 문의해 주세요.',
    retryable: false,
  }, ver);

const 관리자헤더 = () => ({
  apikey: 서비스키,
  Authorization: `Bearer ${서비스키}`,
  'Content-Type': 'application/json',
});

/** GoTrue 관리자 API — PostgREST 가 아니라 Auth 통로라 `engine` 미노출과 무관하다. */
async function 계정만들기(email: string, password: string) {
  const r = await fetch(`${AUTH}/admin/users`, {
    method: 'POST',
    headers: 관리자헤더(),
    // `email_confirm: true` 는 대시보드의 「이메일 확인」 설정과 무관하게 확인된 계정을 만든다(§4-2 실측).
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  return { ok: r.ok, status: r.status, 본문: await r.text() };
}

async function 비밀번호갈기(uid: string, password: string) {
  const r = await fetch(`${AUTH}/admin/users/${uid}`, {
    method: 'PUT', headers: 관리자헤더(), body: JSON.stringify({ password }),
  });
  return { ok: r.ok, status: r.status, 본문: await r.text() };
}

/** 🔴 `Math.random()` 이 아니다 — 임시번호는 비밀이고, 예측 가능한 난수는 비밀이 아니다. */
function 임시번호() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(b[0] % 1_000_000).padStart(6, '0');
}
/** 초기화가 옛 비밀번호를 죽일 때 넣는, **아무도 모르는** 값. */
function 아무도모르는값() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** JWT 가운데 마디 — 서명 검증은 플랫폼이 이미 했다(verify_jwt). */
function 토큰주장(req: Request): { sub: string; iat: number } | null {
  const m = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const 마디 = m[1].split('.');
  if (마디.length !== 3) return null;
  try {
    const p = JSON.parse(atob(마디[1].replace(/-/g, '+').replace(/_/g, '/')));
    // anon 키도 유효한 JWT 라 verify_jwt 를 통과한다 — 그건 **사람이 아니다**(sub 가 없다).
    if (typeof p.sub !== 'string' || !p.sub) return null;
    return { sub: p.sub, iat: Number(p.iat) || 0 };
  } catch {
    return null;
  }
}

async function 계약판읽기() {
  const [판] = await sql`select name from engine.schema_migrations order by version desc limit 1`;
  return String(판?.name ?? '').match(/_(c\d+)\.sql$/)?.[1] ?? '';
}

/** 임시번호가 사는 시간 (L0 §4-2-2). 이 값이 참이 되려면 우리 코드가 로그인 길목에 있어야 한다. */
const 만료분 = 30;

/* ── POST /auth/reset — 원장의 「비밀번호 초기화」 (L0 §4-2-2) ────────────────
 * 🔴 **서버가 역할을 확정한다.** 클라이언트는 자기가 원장이라고 주장만 하고,
 *   `service_role` 은 RLS 를 우회하므로 그 주장을 믿는 순간 아무나 남의 비밀번호를 초기화한다.
 * 🔑 살아 있는지 판정은 `engine.session_alive()` **한 곳**에서 온다 — 토큰 주장을
 *   `request.jwt.claims` 에 넣어 두면 RLS 가 쓰는 그 함수를 그대로 부를 수 있다.
 *   여기서 조건을 다시 적으면 두 축이 갈라지고, 갈라지는 방향은 언제나 「통과」다.
 */
async function 초기화(req: Request, 본문: Record<string, unknown>) {
  const ver = await 계약판읽기();
  const 주장 = 토큰주장(req);
  const 거부 = () => 실패(403, {
    code: 'FORBIDDEN', message: '권한이 없습니다', retryable: false,
  }, ver);
  if (!주장) return 실패(401, { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false }, ver);

  const 학생번호 = String(본문.student_code ?? '');
  if (!학생번호맞나(학생번호)) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', field: 'student_code', retryable: false,
      message: '학생번호 형식이 아닙니다',
    }, ver);
  }

  type 대상 = { learner_id: string; auth_user_id: string | null; student_code: string; staff_id: string };

  /* ①원장인가 ②그런 학생이 있나 — 여기서는 **읽기만 한다.** 쓰기는 GoTrue 를 갈아끼운 뒤다
   * (아래 🔴 순서). 권한 판정이 트랜잭션 안에 있어야 하는 이유는 그대로다 — `set_config` 의
   * `true` 는 트랜잭션 지역이라, 밖에서 부르면 커넥션 재사용 때 남의 주장이 살아 있게 된다. */
  const 대상 = (await sql.begin(async (tx) => {
    // 트랜잭션 안에서만 사는 주장(`true`) — 커넥션이 재사용돼도 남지 않는다.
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: 주장.sub, role: 'authenticated', iat: 주장.iat })}, true)`;
    // ⚠ `current_staff()` 는 못 찾으면 **전 칸이 null 인 행 하나**를 낸다 — 「행이 없다」가 아니다.
    //   그래서 존재가 아니라 **role 값**을 본다(행 유무만 보면 아무나 통과한다).
    const [직원] = await tx`select staff_id, role from engine.current_staff()`;
    if (!직원 || 직원.role !== 'director') return null;

    /* 🔴 `auth_user_id is not null` 로 **거르지 않는다**(절단문서 ②-19).
     *   거르면 아직 계정이 없는 학생 — 즉 첫 등록 게이트에 **잠긴 바로 그 학생** — 이 이 통로에서
     *   빠진다. `signup_attempts` 를 0 으로 되돌리는 곳은 ⓐ첫 등록 성공 ⓑ임시로그인 성공 ⓒ여기
     *   셋뿐이고 앞의 둘은 잠긴 학생이 못 지나므로, 거른 상태에서 5회를 채운 학생은 **앱으로는
     *   영원히 등록하지 못한다**(되돌리는 길이 DB 직접 수정뿐이었다). 학생번호는 순번이라
     *   아무나 그 상태를 학생 수만큼 만들 수 있다 — 잠금은 남기고 **출구를 연다**. */
    const [학생] = await tx`
      select learner_id, auth_user_id, student_code
        from engine.learners
       where upper(replace(student_code, '-', '')) = ${정규화(학생번호)}`;
    if (!학생) return null;

    return { ...학생, staff_id: 직원.staff_id };
  })) as 대상 | null;

  // 🔑 「원장이 아니다」와 「그런 학생이 없다」를 **가르지 않는다** — 가르면 원장 아닌 토큰으로
  //    학생번호의 실재 여부를 훑을 수 있다. 둘 다 403 이다.
  if (!대상) return 거부();

  /* ── 아직 계정이 없는 학생 = 첫 등록 잠금 해제. **임시번호를 내지 않는다** —
   *   줄 계정이 없어서다(비밀번호도 세션도 없으니 GoTrue 도 `revoked_before` 도 할 일이 없다).
   *   학생이 할 일은 첫 로그인을 다시 하는 것이고, 그 게이트(전화 뒤 4자리)는 그대로 서 있다. */
  if (!대상.auth_user_id) {
    await sql.begin(async (tx) => {
      await tx`update engine.learners set signup_attempts = 0 where learner_id = ${대상.learner_id}`;
      await tx`
        insert into engine.staff_access_log(staff_id, action, target_ids)
        values (${대상.staff_id}, 'learner.signup_unlock', ${[대상.learner_id]}::uuid[])`;
    });
    return 봉투(200, { ok: true, student_code: 대상.student_code, unlocked: true }, ver);
  }

  const 코드 = 임시번호();

  /* 🔴 **GoTrue 를 먼저 갈고 DB 를 나중에 쓴다**(절단문서 ②-18). 둘은 한 트랜잭션에 못 묶이므로
   *   순서가 곧 「반쯤 실패했을 때 남는 상태」다. 반대로 하면(DB 먼저) GoTrue 가 실패한 날
   *   **감사표엔 「초기화했다」가 남고 옛 비밀번호는 살아 있다** — 초기화가 막으려던 바로 그 사고
   *   (「누가 내 비번을 안다」)에서 초기화가 아무것도 안 한 것이 되고, 원장 화면엔 500 만 떠서
   *   아무도 그 사실을 모른다. 이 순서면 실패는 「비번은 죽었고 임시번호는 안 나왔다」로 남는다 —
   *   학생이 잠깐 못 들어오지만 원장이 **한 번 더 누르면 복구된다**(조용한 영구 대신 시끄러운 가역).
   * ⚠ 대가: 여기 다음 줄에서 죽으면 감사표에 행이 없다. 「빠진 기록」이 「거짓 기록」보다 낫다는 판단이다.
   * 🔴 옛 비밀번호를 죽이는 이유는 그대로다 — 살려 두면 위 사고에서 초기화가 무의미해진다. */
  const 갈기 = await 비밀번호갈기(대상.auth_user_id, 아무도모르는값());
  if (!갈기.ok) {
    console.error('[auth] 초기화 — 옛 비밀번호 무효화 실패', 갈기.status, 갈기.본문.slice(0, 200));
    return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }

  await sql.begin(async (tx) => {
    await tx`
      update engine.learners
         set temp_password_hash = extensions.crypt(${코드}, extensions.gen_salt('bf')),
             temp_password_expires_at = now() + ${`${만료분} minutes`}::interval,
             signup_attempts = 0,
             revoked_before = now()
       where learner_id = ${대상.learner_id}`;
    // 🔴 평문 임시번호는 **적지 않는다** — 감사표 하나가 다수 계정이 되면 안 된다.
    await tx`
      insert into engine.staff_access_log(staff_id, action, target_ids)
      values (${대상.staff_id}, 'learner.password_reset', ${[대상.learner_id]}::uuid[])`;
  });

  return 봉투(200, {
    ok: true,
    student_code: 대상.student_code,
    temp_password: 코드,            // 🔴 화면이 1회 보여주고 끝. 저장·전달 금지(L0 §4-2-2 ⚠).
    expires_in_minutes: 만료분,
  }, ver);
}

/* ── POST /auth/temp-login — 학생이 임시번호로 들어와 새 비밀번호를 정한다 ──── */
async function 임시로그인(본문: Record<string, unknown>) {
  const ver = await 계약판읽기();
  const 학생번호 = String(본문.student_code ?? '');
  const 임시 = String(본문.temp_password ?? '');
  const 새비번 = typeof 본문.new_password === 'string' ? 본문.new_password : '';

  const 규격 = 비번규격(새비번, ver);
  if (규격) return 규격;
  if (!학생번호맞나(학생번호)) return 게이트실패(ver);

  const [학생] = await sql`
    select learner_id, auth_user_id, signup_attempts,
           temp_password_hash is not null
             and temp_password_expires_at > now()
             and temp_password_hash = extensions.crypt(${임시}, temp_password_hash) as 맞나
      from engine.learners
     where upper(replace(student_code, '-', '')) = ${정규화(학생번호)}`;

  // 없는 번호 · 초기화된 적 없음 · 만료 · 틀림 · 잠김 — **전부 같은 응답**이다(§4-1-1 ③과 같은 축).
  if (!학생 || !학생.auth_user_id) return 게이트실패(ver);
  if (Number(학생.signup_attempts) >= 시도상한) return 게이트실패(ver);
  if (!학생.맞나) {
    // 🔴 세지 않으면 6자리(100만 가지)를 만료 전까지 마음껏 대입할 수 있다.
    await sql`update engine.learners set signup_attempts = signup_attempts + 1
               where learner_id = ${학생.learner_id}`;
    return 게이트실패(ver);
  }

  const 갈기 = await 비밀번호갈기(String(학생.auth_user_id), 새비번);
  if (!갈기.ok) {
    console.error('[auth] 임시로그인 — 비밀번호 설정 실패', 갈기.status, 갈기.본문.slice(0, 200));
    return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }

  // 🔴 **1회용이다** — 쓰고 나면 지운다. 안 지우면 만료까지 계속 되는 두 번째 비밀번호가 된다.
  await sql`
    update engine.learners
       set temp_password_hash = null, temp_password_expires_at = null, signup_attempts = 0
     where learner_id = ${학생.learner_id}`;

  return 봉투(200, { ok: true }, ver);
}

/** 비밀번호 규격 — 통과하면 null. 게이트와 **별개로** 알려준다(본인이 방금 정한 값이다). */
function 비번규격(비밀번호: string, ver: string) {
  if (비밀번호.length < 최소비번) {
    return 실패(400, {
      code: 'PASSWORD_TOO_SHORT', field: 'password', retryable: false,
      message: `비밀번호는 ${최소비번}자 이상으로 정해 주세요`,
    }, ver);
  }
  if (new TextEncoder().encode(비밀번호).length > 최대비번바이트) {
    return 실패(400, {
      code: 'PASSWORD_TOO_LONG', field: 'password', retryable: false,
      message: '비밀번호가 너무 깁니다 — 짧게 정해 주세요',
    }, ver);
  }
  return null;
}

/** `student_code` 의 저장 형태는 우리 발급기가 낸 `SYNK-042` 하나뿐이라 정규화가 단순하다. */
const 정규화 = (v: string) => v.trim().replace(/[-\s]/g, '').toUpperCase();

Deno.serve(async (req: Request) => {
  let ver = '';
  try {
    if (req.method !== 'POST') {
      return 실패(405, { code: 'CONTRACT_VIOLATION', message: 'POST 만 받는다', retryable: false }, ver);
    }
    const 경로 = new URL(req.url).pathname.replace(/\/+$/, '');
    const 갈래 = ['first-login', 'reset', 'temp-login'].find((g) => 경로.endsWith(`/${g}`));
    if (!갈래) {
      return 실패(404, { code: 'NOT_FOUND', message: '없는 경로입니다', retryable: false }, ver);
    }

    let 본문: Record<string, unknown>;
    try {
      본문 = JSON.parse((await req.text()) || '{}');
    } catch {
      return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'JSON 이 아닙니다', retryable: false }, ver);
    }

    // 🔴 앱은 자기가 누구인지 본문에 적지 않는다(C0 §2). 적으면 그 자체가 계약 위반이다.
    // ⚠ 세 갈래 **전부**에 건다 — 한 갈래만 열어 두면 그쪽이 우회로가 된다.
    for (const 금지 of ['learner_id', 'auth_user_id']) {
      if (금지 in 본문) {
        return 실패(400, {
          code: 'CONTRACT_VIOLATION', field: 금지, retryable: false,
          message: `${금지} 는 보내지 않습니다 — 학생은 서버가 확정합니다`,
        }, ver);
      }
    }

    if (갈래 === 'reset') return await 초기화(req, 본문);
    if (갈래 === 'temp-login') return await 임시로그인(본문);

    const 학생번호 = String(본문.student_code ?? '');
    const 뒷자리 = String(본문.phone_last4 ?? '');
    const 비밀번호 = typeof 본문.password === 'string' ? 본문.password : '';

    const 규격 = 비번규격(비밀번호, ver);
    if (규격) return 규격;

    /* 가입 1회 문항 3개 — **계정을 만들기 전에** 본다(`lib/가입문항.js`).
     * 🔴 순서가 전부다: 계정이 선 뒤에 거절하면 그 학생은 `auth_user_id` 가 박힌 채 세 칸이
     *   비어 남고, 그 상태를 고치는 길은 이 통로에 다시 못 들어온다(위 「이미 등록됨 = 게이트
     *   실패」). 그러면 잃는 것이 **소급 불가인 그 세 값**이라 정확히 이 조항이 막으려던 손실이다.
     * 🔑 게이트 실패(401)와 **다른 응답**이다 — 이건 학생번호의 존재를 감추는 자리가 아니라
     *   호출부가 잘못 보낸 자리다. 어느 칸인지 말해 주지 않으면 앱 버그가 안 보인다. */
    const 문항오류 = 답검사(본문);
    if (문항오류) {
      return 실패(400, {
        code: 'CONTRACT_VIOLATION', field: 문항오류.필드, message: 문항오류.사유, retryable: false,
      }, ver);
    }

    // DB 계약판은 봉투용으로만 읽는다(게이트가 아니다).
    ver = await 계약판읽기();

    // 규격 밖 학생번호는 **DB 를 건드리기 전에** 게이트 실패로 접는다 — 같은 응답이라
    // 「형식이 틀렸다」와 「없는 번호다」가 밖에서 구분되지 않는다.
    if (!학생번호맞나(학생번호)) return 게이트실패(ver);

    // 🔑 `student_code` 의 저장 형태는 **우리 발급기가 낸 것**이라 `SYNK-042` 하나뿐이다
    //    (`학생ID_포맷_`). 그래서 정규화는 하이픈 제거·대문자로 끝난다 — 임의 입력을
    //    맞추는 것이 아니라 **우리 형식**을 맞추는 것이라 SQL 쪽이 단순하고 갈라질 여지가 없다.
    const 정규 = 정규화(학생번호);

    const [학생] = await sql`
      select learner_id, contact, auth_user_id, signup_attempts
        from engine.learners
       where upper(replace(student_code, '-', '')) = ${정규}`;

    // 없는 번호 · 이미 등록됨 · 잠김 · 뒷자리 불일치 — **전부 같은 응답**이다(§4-1-1 ③).
    if (!학생) return 게이트실패(ver);
    if (학생.auth_user_id) return 게이트실패(ver);
    if (Number(학생.signup_attempts) >= 시도상한) return 게이트실패(ver);

    if (!뒷자리맞나(학생.contact, 뒷자리)) {
      // 🔴 실패할 때마다 세어 둔다. 이 한 줄이 없으면 1만 번 대입으로 반드시 뚫린다.
      await sql`
        update engine.learners
           set signup_attempts = signup_attempts + 1
         where learner_id = ${학생.learner_id}`;
      return 게이트실패(ver);
    }

    const 주소 = 이메일(학생번호);

    /* 계정을 만들고 잇는다.
     * 🔴 **순서가 사고의 자리다.** 계정이 생겼는데 잇기가 실패하면 학생은 영원히 못 들어온다
     *   (다시 시도하면 「이미 있는 이메일」로 죽는다). 그래서 이미 있으면 **그 계정을 잇는다** —
     *   여기까지 온 요청은 이미 게이트를 통과했으므로 그 학생 본인이다. */
    let uid = '';
    const 생성 = await 계정만들기(주소, 비밀번호);
    if (생성.ok) {
      uid = String(JSON.parse(생성.본문).id ?? '');
    } else if (생성.status === 422 || /already|exists|registered/i.test(생성.본문)) {
      const [기존] = await sql`select id from auth.users where email = ${주소}`;
      uid = String(기존?.id ?? '');
      if (!uid) {
        console.error('[auth] 계정 생성 실패 · 기존 계정도 못 찾았다', 생성.status, 생성.본문.slice(0, 300));
        return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
      }
      /* ☠️ **계정 선점 차단** (2026-08-07 설계 심문 · 유호님 확정 ㉯).
       *   위 주석은 「여기까지 왔으면 그 학생 본인이다」라고 했는데, 그건 *우리가 만들다 실패한*
       *   계정일 때만 참이다. 공개 가입이 열려 있으면(`disable_signup=false` — L0 §8-2 실측)
       *   **남이 먼저** `synk042@synk.invalid` 로 가입할 수 있다. 학생번호는 순번이라 주소가 예측된다.
       *   그러면 이 분기가 **공격자 계정을 그 학생의 learners 행에 이어 주고**, 비밀번호는 공격자
       *   것이라 그 사람이 그 학생이 된다 — 진짜 학생은 자기 계정에 영영 못 들어간다.
       *   L0 §8-2 는 두 사실(공개 가입 열림 · 이미 있으면 잇는다)을 각각 맞게 적고 **곱을 안 봤다**.
       * 🔑 그래서 잇기 전에 비밀번호를 **방금 이 학생이 정한 값으로 덮는다.** 원래 이 분기가 다루려던
       *   「우리가 만든 계정」에서는 같은 값이라 무해하고, 남의 계정이면 그 순간 통제권이 넘어온다.
       *   실패하면 잇지 않는다 — 비밀번호를 모르는 계정을 이으면 학생이 못 들어오는 건 마찬가지다.
       * ⚠ 천장: `.invalid` 는 예약 TLD라 어떤 OAuth 제공자도 소유를 확인해 주지 않는다. 그래서
       *   비밀번호 통로만 닫으면 된다. 다른 도메인을 쓰게 되면 연결된 identity 도 봐야 한다. */
      const 덮기 = await 비밀번호갈기(uid, 비밀번호);
      if (!덮기.ok) {
        console.error('[auth] 선점 방지 비밀번호 덮기 실패', 덮기.status, 덮기.본문.slice(0, 300));
        return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
      }
    } else {
      console.error('[auth] 계정 생성 실패', 생성.status, 생성.본문.slice(0, 300));
      return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
    }

    /* 🔴 `where auth_user_id is null` 이 **동시 요청의 심판**이다. 두 번 눌려도 한 번만 이긴다
     *   — 조건 없이 쓰면 나중 요청이 앞선 연결을 덮어써 계정이 바뀐다.
     *
     * 🔑 가입 1회 문항 셋도 **이 한 문장에 같이 실린다**(L0 §704 · §850). 두 번째 쓰기로
     *   미루지 않는다: 이 문장은 이겼는데 뒤따르는 쓰기가 죽으면 그 학생은 등록은 됐는데 세
     *   칸이 빈 채로 남고, 그 자리는 되물어도 못 채운다(`goal_track` 은 덮어써지는 값이라
     *   나중에 물으면 **오늘의 목적**이 나온다 — `goal_snapshot` = 유일한 완전 소급 불가).
     *   위 `답검사` 를 이미 지났으므로 여기 오는 값은 셋 다 값목록 안이다. */
    const 이음 = await sql`
      update engine.learners
         set auth_user_id = ${uid}::uuid,
             recovery_email = ${본문.recovery_email == null ? null : String(본문.recovery_email).trim() || null},
             recovery_phone = ${본문.recovery_phone == null ? null : String(본문.recovery_phone).trim() || null},
             home_aimag = ${String(본문.home_aimag)},
             gender = ${String(본문.gender)},
             goal_track = ${String(본문.goal_track)},
             signup_attempts = 0
       where learner_id = ${학생.learner_id}
         and auth_user_id is null
      returning learner_id, student_code, display_name`;

    if (!이음.length) {
      // 진 쪽이다. 계정은 이미 서 있으므로 **성공으로 돌려준다** — 학생 눈엔 한 번 누른 것이다.
      return 봉투(200, { ok: true, already: true }, ver);
    }

    return 봉투(200, {
      ok: true,
      student_code: 이음[0].student_code,
      display_name: 이음[0].display_name,
      // 조용히 실패하지 않게 결과를 싣는다 — 앱은 안 쓰지만 이 값이 없으면 첫날 소실이 로그에만 남는다.
      첫배정: await 첫배정세우기(String(이음[0].learner_id)),
    }, ver);
  } catch (e) {
    console.error('[auth] 예외', e instanceof Error ? e.message : String(e));
    return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});

/* 첫 배정을 **지금** 세운다 — 오디오 타임캡슐 N23 (유호님 확정 2026-08-08 · ㉱ⓐ).
 *
 * ■ 왜 등록 시점인가
 *   배치(`deliver`)는 하루 1회다. 등록 당일 낮에 앱을 켠 학생에게는 오늘 배정이 아직 없고,
 *   그때 앱은 `contents/첫편지.js` 폴백 화면으로 내려가 **발화를 서버로 보내지 않는다**
 *   (`lib/오늘과제.js` 화면과제 — `제출재료: null`. 지어내지 않는 그 판단 자체는 옳다).
 *   그런데 그 하루가 정확히 **「입학 첫날 목소리」**이고, 그것은 소급이 안 된다.
 *
 * ■ 🔑 배정을 만드는 코드는 `deliver` 하나뿐이다
 *   여기서 직접 INSERT 하면 배정 생성이 두 곳이 되고, 갈라진 쪽이 낸 행은 계약 밖 모양이 된다
 *   (같은 이유로 `deliver` 도 단건 모드를 **새 경로가 아니라 대상만 좁힌 같은 `한명()`** 으로 냈다).
 *
 * ■ ⚠ 실패해도 등록은 되돌리지 않는다
 *   계정은 이미 섰고, 못 세운 배정은 다음 배치가 집는다. 다만 **그날 안에 앱을 켜면 폴백이라
 *   첫 목소리는 잃는다** — 그래서 조용히 넘기지 않고 로그 + 응답(`첫배정`)에 남긴다.
 *   ⚠ 동의가 없는 학생은 `deliver` 가 `skipped`(consent_missing)로 건너뛴다. 그때도 응답은
 *     `true`(호출 성공)라 이 값만으로 「배정이 섰다」를 단정하지 않는다 — 분모는 `deliver` 의
 *     §6-5 점검 모드가 진다. */
async function 첫배정세우기(learner_id: string): Promise<boolean> {
  try {
    const r = await fetch(`${함수기지}/deliver?learner_id=${encodeURIComponent(learner_id)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${서비스키}`, 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      console.error('[auth] 🔴 첫 배정 실패 — 오늘 앱을 켜면 폴백이라 첫 목소리를 잃는다',
        learner_id, r.status, (await r.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[auth] 🔴 첫 배정 호출 예외', learner_id, e instanceof Error ? e.message : String(e));
    return false;
  }
}
