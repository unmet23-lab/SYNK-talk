/* `review` — 검수자(직원) 통로. 정본 = `docs/검수_내부계약.md`.
 *
 * ■ 이 자리가 무엇을 닫나
 *   판(`engine.review_queue` 22열)은 2026-08-09 에 섰는데 **그 위에 얹을 함수가 0개**였다.
 *   판은 「무엇을 보여줄 것인가」만 정하고, `engine` 스키마는 API 에 노출돼 있지 않아
 *   브라우저·앱이 그 판에 닿는 길이 애초에 없다. 즉 검수 화면은 **판정이 아니라 통로가 없어서**
 *   못 서 있었다. 검수가 없으면 승격이 없고, 승격이 없으면 엔진 도달이 영원히 0이다.
 *
 * ■ 함수는 **하나**고 경로가 둘이다 (§0)
 *   발주의 「4구멍」은 능력 목록이지 배포 단위가 아니다. 넷으로 쪼개면 「읽는 지점이 하나」라는
 *   L0 §4-5 ④ 의 전제를 **배포 구조가 먼저 흔든다** — 새 형제가 감사 1행을 빠뜨려도 증상은
 *   「통과」다. 직원 확정도 한 자리에 남는다.
 *   🚫 `action` 파라미터로 가르지 않는다(경로가 이미 그 일을 한다).
 *
 * ■ 🔴 `event_id` 는 **응답에 안 싣는다**
 *   판이 그 열을 여는 이유는 승격 멱등키를 서버가 쓰기 위해서지 화면에 그리기 위해서가 아니다
 *   (`20260809050000` 머리말이 「그 경계는 Edge Function 이 서는 날 그 자리에서 검사가 붙는다」
 *   고 적고 미뤄 둔 자리 — 그 날이 오늘이다). 학생 사건 줄 전체로 가는 지렛대를 검수자 브라우저에
 *   두면 판을 좁혀 둔 것이 이 문으로 도로 나간다.
 *
 * ■ 감사가 **응답의 조건**이다 (§2)
 *   「큐 응답 1회 = `staff_access_log` 1행」은 나중에 보는 장부가 아니라 **다음 단계가 읽는
 *   입력**이다 — 승인 게이트 ②가 「그 항목의 서명 발급 기록이 실재하는가」를 묻는다. 그래서
 *   감사가 실패하면 응답을 내주지 않는다(큐는 같은 트랜잭션 · 서명은 아래 순서 주석).
 *
 * ■ 아직 없는 것 — `POST /v1/review/approve`·`/discard` (§5 ⛔ c11 선행)
 *   담을 물리 칸이 넷 없다(`corrections.supersedes`·`promote_intent`·
 *   `transcript_verified_at_review` · `pipeline_jobs.discard_reason`). 열 없이 요청/응답을
 *   지어내면 **구현 불가능한 채로 정본이 된다** — 계약이 그 자리를 비워 둔 이유다.
 *   이 함수도 같은 이유로 그 경로를 **404 로 둔다**(빈 껍데기를 두면 화면이 그것을 부른다).
 */
import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';
import 커서모듈 from './검수커서.mjs';
import 경로모듈 from './업로드경로.mjs';

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };
const { 버킷 } = 경로모듈 as { 버킷: string };

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 「누구인가」 다음은 「아직 살아 있는가」 — 정본은 `lib/토큰.js` 하나다(절단문서 ②-15).
 * `sql` 뒤에서 꺼낸다: 조각의 타입이 이 클라이언트에 매여 있다. */
const { 발급시각, 살아있는직원 } = 토큰모듈 as {
  발급시각: (req: Request) => number | null;
  살아있는직원: (질의: typeof sql, 주체: string, iat: number | null) => ReturnType<typeof sql>;
};

type 커서값 = { 감사: boolean; 신뢰: string | null; 시각: string; id: string };
const { 쪽크기, 커서읽기, 커서만들기, 커서키 } = 커서모듈 as {
  쪽크기: (raw: string | null) => { 값: number | null; 이유: string | null };
  커서읽기: (raw: string | null) => { 값: 커서값 | null; 이유: string | null };
  커서만들기: (행: Record<string, unknown> | undefined) => string | null;
  커서키: (값: 커서값 | null) => { 감사키: boolean; 널키: boolean; 신뢰키: string; 시각: string; id: string } | null;
};

const 계약판 = /^c(\d+)$/;
const uuid꼴 = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/* 🔑 **허용 목록**이다(차단 목록이 아니다 — 못 적은 역할이 새는 방향은 언제나 「통과」다).
 *   `director` 가 있는 이유: 검수자 채용은 2027-02 이고 그때까지 검수자는 원장 본인이라,
 *   빼면 오늘 이 통로를 쓸 수 있는 사람이 0명이다(§1). `teacher` 는 직원이지만 검수자가 아니다. */
const 검수역할 = ['inspector', 'director'];

/* 서명 수명 10분 — `uploads` 와 같은 사유다(철회 뒤에도 수명만큼 살아 있는 「꼬리」). */
const 서명수명초 = 600;

type 오류 = { code: string; message: string; retryable: boolean; field?: string };

function 봉투(status: number, body: Record<string, unknown>, ver: string) {
  return new Response(JSON.stringify({ contract_ver: ver, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const 실패 = (status: number, e: 오류, ver: string) => 봉투(status, { ok: false, error: e }, ver);

/* 판의 열을 **골라 싣는다**(`select *` 가 아니다).
 * 🔴 뷰가 곧 허용 목록이지만 그 판에는 `event_id` 처럼 **서버 전용** 열이 산다. `*` 로 퍼가면
 *   판을 넓히는 날 새 열이 아무 판정 없이 브라우저까지 간다 — 새는 방향이 「통과」다.
 *   반대로 판이 넓어졌는데 여기를 안 고치면 증상은 **화면이 빈다**이고, 그건 그날 사람이 온다. */
const 큐열 = [
  'submission_id',
  'task_type', 'task_format', 'occurred_at',
  'audio_ref', 'audio_duration_sec',
  'transcript', 'transcript_verified', 'transcript_state',
  'stt_segments', 'stt_confidence', 'code_switch_spans',
  'task_instruction', 'task_prompt',
  'ai_correction_id', 'ai_corrected_text', 'ai_error_tags',
  'ai_explanation', 'ai_model', 'ai_prompt_ver',
  'is_audit_sample',
];

Deno.serve(async (req: Request) => {
  const 선언 = req.headers.get('X-Contract-Ver') ?? '';
  if (!선언) return 실패(400, { code: 'CONTRACT_VER_MISSING', message: 'X-Contract-Ver 헤더가 없습니다', retryable: false }, 선언);
  const 선언판 = 계약판.exec(선언);
  if (!선언판) {
    return 실패(426, { code: 'CONTRACT_VER_UNSUPPORTED', message: `계약판 형식이 아닙니다: ${선언}`, retryable: false }, 선언);
  }

  /* 뒷마디로 가른다 — `uploads`·`corrections` 와 같은 이유다. 안 보면 `/review/아무거나` 가
   * 전부 큐 조회로 동작하고, §5 가 서는 날 옛 오타 경로가 **이미 돌던 것**이 된다. */
  const url = new URL(req.url);
  const 경로 = url.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  if (경로 !== 'queue' && 경로 !== 'audio') {
    return 실패(404, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: '없는 경로입니다 — GET /v1/review/queue · POST /v1/review/audio',
    }, 선언);
  }
  const 기대메서드 = 경로 === 'queue' ? 'GET' : 'POST';
  if (req.method !== 기대메서드) {
    return 실패(405, { code: 'CONTRACT_VIOLATION', message: `${기대메서드} 만 받는다`, retryable: false }, 선언);
  }

  const 주체 = 토큰주체(req);
  if (!주체) return 실패(401, { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false }, 선언);

  /* 직원 확정과 DB 계약판을 한 번에 읽는다(왕복 1회). 판은 **DB 에게 묻는다** — 함수가 DB 보다
   * 앞설 수 없어야 하고, 손 상수를 두면 마이그레이션마다 사람이 같이 올려야 한다.
   * 🔴 `service_role` 은 RLS 를 우회하므로 이 사슬이 유일한 방어선이다(§4-3 ⚠). */
  const [행] = await sql`
    select (select staff_id from engine.staff
             where ${살아있는직원(sql, 주체, 발급시각(req))}
               and role = any(${검수역할}::text[])) as staff_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const db판 = 계약판.exec(String(행?.최신조각 ?? '').match(/_(c\d+)\.sql$/)?.[1] ?? '');
  if (!db판) {
    console.error('[review] DB 계약판을 못 읽었다', 행?.최신조각);
    return 실패(500, { code: 'INTERNAL', message: '서버 설정 오류입니다', retryable: true }, 선언);
  }
  const ver = db판[0];

  if (Number(선언판[1]) > Number(db판[1])) {
    return 실패(426, {
      code: 'CONTRACT_VER_UNSUPPORTED', retryable: false,
      message: `서버가 아직 ${선언} 을 모릅니다(현재 ${ver}) — 잠시 뒤 다시 시도해 주세요`,
    }, ver);
  }

  /* 🔑 「직원이 아니다」와 「폐기됐다」를 **같은 코드**로 묶는다(§1) — 가르면 응답 자체가
   *   「그 계정은 있다」를 말한다. 역할이 `teacher` 인 사람도 여기서 걸린다. */
  if (!행?.staff_id) {
    return 실패(403, { code: 'NOT_STAFF', message: '검수 권한이 없습니다', retryable: false }, ver);
  }
  const staff_id: string = 행.staff_id;

  try {
    return 경로 === 'queue'
      ? await 큐읽기(url, staff_id, ver)
      : await 오디오서명(req, staff_id, ver);
  } catch (e) {
    console.error(`[review/${경로}] 실패`, String((e as Error)?.message ?? e));
    return 실패(500, { code: 'INTERNAL', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});

/* ── §3 GET /v1/review/queue ─────────────────────────────────────────── */

async function 큐읽기(url: URL, staff_id: string, ver: string) {
  const 쪽 = 쪽크기(url.searchParams.get('limit'));
  if (쪽.이유) {
    return 실패(400, { code: 'CONTRACT_VIOLATION', field: 'limit', message: 쪽.이유, retryable: false }, ver);
  }
  const 커서 = 커서읽기(url.searchParams.get('cursor'));
  if (커서.이유) {
    return 실패(400, { code: 'CONTRACT_VIOLATION', field: 'cursor', message: 커서.이유, retryable: false }, ver);
  }
  const k = 커서키(커서.값);
  const 크기 = 쪽.값 as number;

  /* 🔴 **읽기와 감사가 한 트랜잭션**이다(§2). 나누면 감사가 실패해도 응답이 이미 나간 뒤라
   *   「감사 없는 읽기」가 성립하고, 그 순간 §4-5 ④ 의 「읽는 지점이 하나」는 세는 것이 없는
   *   문장이 된다. 게다가 그 장부는 승인 게이트 ②가 읽는 입력이다. */
  const { data, next_cursor } = await sql.begin(async (tx) => {
    /* 정렬 = §3 「감사 표본 우선 혼입 + 저신뢰 낮은 순」. 방향이 섞인 세 축을 **오름차순
     * 하나로 편 것**이 `lib/검수커서.js` 머리말이고, `order by` 와 `where` 가 같은 축을 쓴다.
     * 🔴 뷰에는 `order by` 를 안 넣는다 — 순서는 읽는 쪽의 판단이다(`20260809050000`). */
    const 행들 = await tx`
      select ${tx(큐열)}
        from engine.review_queue
       where ${k === null ? tx`true` : tx`
             ((not is_audit_sample), (stt_confidence is null), coalesce(stt_confidence, 0),
              occurred_at, submission_id)
             > (${k.감사키}::boolean, ${k.널키}::boolean, ${k.신뢰키}::numeric,
                ${k.시각}::timestamptz, ${k.id}::uuid)`}
       order by (not is_audit_sample), (stt_confidence is null), coalesce(stt_confidence, 0),
                occurred_at, submission_id
       limit ${크기 + 1}`;

    /* 한 건 더 받아 다음 쪽이 있는지 **세지 않고** 안다 — count 를 따로 세면 그 사이 확정·폐기가
     * 일어나 총계와 목록이 어긋난다(`corrections` 와 같은 골격). */
    const data = 행들.slice(0, 크기);
    const 실린것 = data.map((r: Record<string, unknown>) => r.submission_id);

    /* ⚠ **0건도 1행 남긴다.** 「아무것도 안 왔다」도 읽은 것이고, 빈 응답에만 장부가 없으면
     *   조회 횟수의 분모가 조용히 달라진다(감사가 세는 것이 무엇인지 흐려진다). */
    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'review.queue', ${실린것}::uuid[])`;

    return {
      data,
      next_cursor: 행들.length > 크기 ? 커서만들기(data[data.length - 1]) : null,
    };
  });

  return 봉투(200, { ok: true, data, next_cursor }, ver);
}

/* ── §4 POST /v1/review/audio ────────────────────────────────────────── */

async function 오디오서명(req: Request, staff_id: string, ver: string) {
  let 본문: { submission_id?: unknown };
  try {
    본문 = JSON.parse((await req.text()) || '{}');
  } catch {
    return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'JSON 이 아닙니다', retryable: false }, ver);
  }
  const sid = String(본문.submission_id ?? '');
  if (!uuid꼴.test(sid)) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', field: 'submission_id', retryable: false,
      message: 'submission_id(uuid)가 필요합니다',
    }, ver);
  }

  /* 🔴 발급 전에 그 행이 **지금** 큐에 있는지 본다(§4). 폐기·철회·확정분에 서명이 나가면
   *   뷰가 막아 둔 것이 이 문으로 도로 나간다 — 큐 소속은 시간이 지나면 바뀐다. */
  const [행] = await sql`
    select audio_ref from engine.review_queue where submission_id = ${sid}::uuid`;
  if (!행?.audio_ref) {
    /* 음성이 없는 행도 여기로 온다(쓰기 검수가 서는 날의 자리) — 「지금 들을 것이 없다」는
     * 같은 뜻이라 같은 코드를 쓴다. 가르면 큐 밖 항목의 존재 여부가 샌다. */
    return 실패(404, { code: 'NOT_FOUND', message: '지금 큐에 없는 항목입니다', retryable: false }, ver);
  }

  const base = Deno.env.get('SUPABASE_URL')!;
  const 키 = Deno.env.get('STORAGE_SIGN_KEY') ?? '';
  /* 모양을 **먼저** 본다 — `uploads` 가 이미 한 바퀴 돈 자리다(플랫폼이 `SERVICE_ROLE_KEY`
   * 이름에 넣어주는 새 형식 `sb_secret_…` 을 Storage 가 거절한다 · 레거시 JWT 여야 한다). */
  if (키.split('.').length !== 3) {
    console.error('[review/audio] STORAGE_SIGN_KEY 가 JWT 형태가 아니다 — 레거시 service_role 키여야 한다');
    return 실패(500, {
      code: 'INTERNAL', retryable: false,
      message: 'STORAGE_SIGN_KEY 설정 오류입니다 — 레거시 service_role(JWT) 키가 필요합니다',
    }, ver);
  }

  /* 🔑 **서명을 먼저 받고 감사를 적는다.** 순서를 뒤집으면 서명이 실패한 항목에도 「발급됨」이
   *   남고, 그 행은 §5 승인 게이트 ②를 그대로 통과시킨다 — 한 번도 못 들은 발화가 청취 게이트를
   *   지난다. 반대로 감사가 실패하면 응답을 안 내주므로(아래 예외는 상위 catch 가 500 으로 받는다)
   *   서명은 아무도 손에 못 쥔 채 수명만큼 떠 있다가 죽는다. 그 방향이 안전하다. */
  const r = await fetch(`${base}/storage/v1/object/sign/${버킷}/${행.audio_ref}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${키}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 서명수명초 }),
  });
  if (!r.ok) {
    /* 상류 상태를 응답에도 싣는다(본문은 아니다 — 거기엔 키가 섞일 수 있다). 안 실으면
     * 버킷이 없는 것과 키가 틀린 것과 파일이 지워진 것이 전부 같은 모양이 된다. */
    console.error('[review/audio] 서명 실패', r.status, (await r.text()).slice(0, 200));
    /* ⚠ 502 가 더 정직해 보이지만 **계약 표에 없는 상태**다(§1). 표에 없는 상태를 내기 시작하면
     *   읽는 쪽의 오류 분기가 그 표를 못 믿게 된다 — 상류 상태는 문구로 싣는다. */
    return 실패(500, { code: 'INTERNAL', retryable: true, message: `재생 주소를 만들지 못했습니다 (storage ${r.status})` }, ver);
  }
  const { signedURL } = JSON.parse(await r.text()) as { signedURL: string };

  await sql`
    insert into engine.staff_access_log (staff_id, action, target_ids)
    values (${staff_id}::uuid, 'review.audio', array[${sid}::uuid])`;

  return 봉투(200, {
    ok: true,
    url: `${base}/storage/v1${signedURL}`,
    expires_at: new Date(Date.now() + 서명수명초 * 1000).toISOString(),
  }, ver);
}
