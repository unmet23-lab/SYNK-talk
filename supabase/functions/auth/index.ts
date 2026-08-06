/* POST /v1/auth/first-login — 학생의 첫 등록 (L0 §4-1-1 · §4-2)
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
 *   ① `signup_attempts` 가 5 에 이르면 잠긴다(해제는 원장만)
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

const { 학생번호맞나, 이메일, 뒷자리맞나, 시도상한 } = 학생계정 as {
  학생번호맞나: (v: unknown) => boolean;
  이메일: (v: string) => string;
  뒷자리맞나: (명단: unknown, 입력: unknown) => boolean;
  시도상한: number;
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });
const AUTH = `${Deno.env.get('SUPABASE_URL')!}/auth/v1`;
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

/** GoTrue 관리자 API — PostgREST 가 아니라 Auth 통로라 `engine` 미노출과 무관하다. */
async function 계정만들기(email: string, password: string) {
  const r = await fetch(`${AUTH}/admin/users`, {
    method: 'POST',
    headers: {
      apikey: 서비스키,
      Authorization: `Bearer ${서비스키}`,
      'Content-Type': 'application/json',
    },
    // `email_confirm: true` 는 대시보드의 「이메일 확인」 설정과 무관하게 확인된 계정을 만든다(§4-2 실측).
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  return { ok: r.ok, status: r.status, 본문: await r.text() };
}

Deno.serve(async (req: Request) => {
  let ver = '';
  try {
    if (req.method !== 'POST') {
      return 실패(405, { code: 'CONTRACT_VIOLATION', message: 'POST 만 받는다', retryable: false }, ver);
    }
    if (!new URL(req.url).pathname.replace(/\/+$/, '').endsWith('/first-login')) {
      return 실패(404, { code: 'NOT_FOUND', message: '없는 경로입니다', retryable: false }, ver);
    }

    let 본문: Record<string, unknown>;
    try {
      본문 = JSON.parse((await req.text()) || '{}');
    } catch {
      return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'JSON 이 아닙니다', retryable: false }, ver);
    }

    // 🔴 앱은 자기가 누구인지 본문에 적지 않는다(C0 §2). 적으면 그 자체가 계약 위반이다.
    for (const 금지 of ['learner_id', 'auth_user_id']) {
      if (금지 in 본문) {
        return 실패(400, {
          code: 'CONTRACT_VIOLATION', field: 금지, retryable: false,
          message: `${금지} 는 보내지 않습니다 — 학생은 서버가 확정합니다`,
        }, ver);
      }
    }

    const 학생번호 = String(본문.student_code ?? '');
    const 뒷자리 = String(본문.phone_last4 ?? '');
    const 비밀번호 = typeof 본문.password === 'string' ? 본문.password : '';

    // 비밀번호 규격은 **게이트와 별개로** 알려준다 — 이건 학생 본인이 방금 정한 값이라
    // 알려줘도 새는 정보가 없고, 안 알려주면 「왜 안 되는지 모르는」 화면이 된다.
    const 바이트 = new TextEncoder().encode(비밀번호).length;
    if (비밀번호.length < 최소비번) {
      return 실패(400, {
        code: 'PASSWORD_TOO_SHORT', field: 'password', retryable: false,
        message: `비밀번호는 ${최소비번}자 이상으로 정해 주세요`,
      }, ver);
    }
    if (바이트 > 최대비번바이트) {
      return 실패(400, {
        code: 'PASSWORD_TOO_LONG', field: 'password', retryable: false,
        message: '비밀번호가 너무 깁니다 — 짧게 정해 주세요',
      }, ver);
    }

    // DB 계약판은 봉투용으로만 읽는다(게이트가 아니다).
    const [판] = await sql`
      select name from engine.schema_migrations order by version desc limit 1`;
    ver = String(판?.name ?? '').match(/_(c\d+)\.sql$/)?.[1] ?? '';

    // 규격 밖 학생번호는 **DB 를 건드리기 전에** 게이트 실패로 접는다 — 같은 응답이라
    // 「형식이 틀렸다」와 「없는 번호다」가 밖에서 구분되지 않는다.
    if (!학생번호맞나(학생번호)) return 게이트실패(ver);

    // 🔑 `student_code` 의 저장 형태는 **우리 발급기가 낸 것**이라 `SYNK-042` 하나뿐이다
    //    (`학생ID_포맷_`). 그래서 정규화는 하이픈 제거·대문자로 끝난다 — 임의 입력을
    //    맞추는 것이 아니라 **우리 형식**을 맞추는 것이라 SQL 쪽이 단순하고 갈라질 여지가 없다.
    const 정규 = 학생번호.trim().replace(/[-\s]/g, '').toUpperCase();

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
    } else {
      console.error('[auth] 계정 생성 실패', 생성.status, 생성.본문.slice(0, 300));
      return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
    }

    /* 🔴 `where auth_user_id is null` 이 **동시 요청의 심판**이다. 두 번 눌려도 한 번만 이긴다
     *   — 조건 없이 쓰면 나중 요청이 앞선 연결을 덮어써 계정이 바뀐다. */
    const 이음 = await sql`
      update engine.learners
         set auth_user_id = ${uid}::uuid,
             recovery_email = ${본문.recovery_email == null ? null : String(본문.recovery_email).trim() || null},
             recovery_phone = ${본문.recovery_phone == null ? null : String(본문.recovery_phone).trim() || null},
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
    }, ver);
  } catch (e) {
    console.error('[auth] 예외', e instanceof Error ? e.message : String(e));
    return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});
