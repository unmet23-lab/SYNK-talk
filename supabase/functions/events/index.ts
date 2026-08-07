/* POST /v1/events — C0 §4-1 「유일한 쓰기 통로」.
 *
 * ■ 왜 supabase-js 가 아니라 Postgres 직결인가 (2026-08-06 실측으로 갈랐다)
 *   `engine` 스키마는 **API 에 노출돼 있지 않다**(L0 §4-3 — 노출을 미루면 정책 실수의 영향 범위가 0).
 *   그래서 PostgREST 를 지나는 `supabase.from()` 은 **service_role 이어도** 닿지 않는다:
 *       PGRST106 · Only the following schemas are exposed: public, graphql_public
 *   추측이 아니라 진단 함수로 재고 확인했다. 대신 플랫폼이 넣어주는 `SUPABASE_DB_URL` 로
 *   직접 붙는다(역할 `postgres` · PG 17.6 실측). 스키마 노출도, 새 SQL 객체도 필요 없다.
 *
 * ■ 검증은 여기 한 곳 (C0 §4-1)
 *   필드 조합은 `lib/이벤트검증.js`, 이름·값목록은 `계약/수집_교정_계약.json` — **둘 다 저장소 정본을
 *   그대로 동봉한다**(베끼면 갈라지고, 갈라지는 방향은 언제나 「통과」다). `동봉.json` 참고.
 *
 * ■ 계약판은 **DB 에게 묻는다** (손 상수를 두지 않는다)
 *   초판은 `지원계약 = ['c6']` 상수였다. 그건 마이그레이션을 올릴 때마다 사람이 같이 올려야 하고,
 *   **안 올리면 앱 전체가 426, 먼저 올리면 400 이어야 할 것이 500** 이 된다. 어느 쪽으로 틀려도
 *   증상이 크고 원인이 안 보인다. 그래서 `engine.schema_migrations` 의 최신 조각 이름(`..._c7.sql`)
 *   에서 판을 읽는다 — **함수가 DB 보다 앞설 수 없는 구조**가 된다.
 *   받는 규칙: 앱이 말한 판 ≤ DB 의 판. 옛 앱은 계속 돌고(값목록이 부분집합이라 안전),
 *   DB 보다 새 판은 거절한다(그 앱은 DB 가 모르는 값을 보낼 수 있다).
 *
 * ■ 앱을 믿지 않는 자리 셋
 *   ① 학생은 **토큰에서** 확정한다 — 본문의 learner_id 는 400 (service_role 은 RLS 를 우회하므로
 *      본문을 믿는 순간 남의 데이터를 쓴다).
 *   ② 서버 칸·서버 사건은 앱이 못 보낸다(위조 방지).
 *   ③ 동의는 `occurred_at` 시점 기준으로 서버가 고른다 — 사후 동의가 과거를 유효하게 만들지 않는다.
 */
import postgres from 'npm:postgres@3.4.4';
import 검증모듈 from './이벤트검증.mjs';
import 출처모듈 from './사건출처.mjs';
import 계약 from './계약.mjs';
import 경로모듈 from './업로드경로.mjs';
import 헤더모듈 from './음성헤더.mjs';
import 토큰모듈 from './토큰.mjs';

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };
const { 검증 } = 검증모듈 as { 검증: (e: unknown, c: unknown) => { ok: boolean; 오류들: string[] } };
const { 사건출처 } = 출처모듈 as { 사건출처: (event_type: string) => string | null };
const { 버킷, 경로검사 } = 경로모듈 as {
  버킷: string;
  경로검사: (ref: string, learner_id: string) => { ok: boolean; 이유: string | null };
};
const { 헤더읽기, 파일없음 } = 헤더모듈 as {
  헤더읽기: (앞머리: Uint8Array, 전체바이트: number | null) => Record<string, unknown>;
  파일없음: (status: number, 본문: string) => boolean;
};

const 최대건수 = 100;
const 최대바이트 = 1_000_000;

/* 헤더는 앞머리에 있다 — 25MB 를 통째로 받을 이유가 없다(함수 메모리가 곧 상한이다). */
const 앞머리바이트 = 4096;
const 측정제한밀리 = 5000;

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 「누구인가」 다음은 「아직 살아 있는가」 — 정본은 `lib/토큰.js` 하나다(절단문서 ②-15).
 * `sql` 뒤에서 꺼낸다: 조각의 타입이 이 클라이언트에 매여 있다. */
const { 발급시각, 살아있는학생 } = 토큰모듈 as {
  발급시각: (req: Request) => number | null;
  살아있는학생: (질의: typeof sql, 주체: string, iat: number | null) => ReturnType<typeof sql>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const 계약판 = /^c(\d+)$/;

type 오류 = { code: string; message: string; retryable: boolean; field?: string };

function 봉투(status: number, body: Record<string, unknown>, ver: string) {
  return new Response(JSON.stringify({ contract_ver: ver, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const 실패 = (status: number, e: 오류, ver: string) => 봉투(status, { ok: false, error: e }, ver);

/** 응답 스트림에서 앞 n 바이트만 받고 끊는다 — 상류가 `Range` 를 무시해도 상한이 지켜진다. */
async function 앞부분(r: Response, n: number): Promise<Uint8Array> {
  const reader = r.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const 조각: Uint8Array[] = [];
  let 길이 = 0;
  while (길이 < n) {
    const { done, value } = await reader.read();
    if (done) break;
    조각.push(value);
    길이 += value.length;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(길이);
  let off = 0;
  for (const c of 조각) { out.set(c, off); off += c.length; }
  return out.subarray(0, Math.min(길이, n));
}

/** 객체 전체 크기 — 206 이면 `Content-Range` 의 분모, 200 이면 `Content-Length`. 없으면 **모른다**. */
function 총바이트(r: Response): number | null {
  const m = r.headers.get('Content-Range')?.match(/\/(\d+)\s*$/);
  if (m) return Number(m[1]);
  const cl = r.headers.get('Content-Length');
  return r.status === 200 && cl ? Number(cl) : null;
}

/* 🔴 서버가 **파일을 직접 열어** 잰다 — 앱이 적은 값은 관측이 아니라 주장이고, c6 가
 *   `capture_meta` 를 만든 이유가 정확히 그 구분이다(`이벤트검증` 이 `.server` 를 앱에게서 거부한다).
 *
 * 못 재도 **행은 저장한다** — 「수집이 채점보다 우선」(C0 §4-2). Storage 가 흔들린다고 학생의
 * 발화를 버리지 않는다. 대신 못 잰 사실을 `state` 로 남긴다: 조용히 비우면 「측정 실패」와
 * 「규격 정상」이 빈 칸 하나로 같아진다.
 * 🔑 `state:'missing'` 은 덤이 아니라 이 자리의 두 번째 값이다 — **참조가 가리키는 파일이 없는
 *   행**을 ingest 시점에 못 박는다. 안 적으면 그 행은 나중에 「전사 실패」와 구분되지 않는다
 *   (C0 §4-2 가 업로드를 먼저 하라고 못박은 그 사고다).
 */
async function 헤더측정(ref: string): Promise<Record<string, unknown>> {
  // `agc_verified` 는 언제나 `unknown` 이다 — AGC·노이즈 억제는 헤더에 흔적이 없다(C0 §4-2).
  // 모르는 것을 `false` 로 적으면 그 행이 「off 였다」는 거짓 증거가 된다.
  const 봉 = (v: Record<string, unknown>) => ({ measured_at: new Date().toISOString(), agc_verified: 'unknown', ...v });
  const base = Deno.env.get('SUPABASE_URL') ?? '';
  const 키 = Deno.env.get('STORAGE_SIGN_KEY') ?? '';
  // 모양을 **먼저** 본다 — `SUPABASE_SERVICE_ROLE_KEY` 는 새 형식(`sb_secret_…`)이라 Storage 가
  // 거절하고, 증상은 「측정만 안 됨」이라 원인이 어디에도 안 남는다(2026-08-06 실측 · uploads 와 같은 자리).
  if (!base || 키.split('.').length !== 3) {
    console.error('[events] STORAGE_SIGN_KEY 가 JWT 형태가 아니다 — capture_meta.server 를 못 잰다');
    return 봉({ state: 'unmeasured', reason: 'storage_key' });
  }
  try {
    const r = await fetch(`${base}/storage/v1/object/${버킷}/${ref}`, {
      headers: { Authorization: `Bearer ${키}`, Range: `bytes=0-${앞머리바이트 - 1}` },
      signal: AbortSignal.timeout(측정제한밀리),
    });
    if (!r.ok) {
      /* 🔴 없는 객체는 **404 가 아니라 400** 이고 404 는 본문 안에만 있다(2026-08-07 리허설 실측).
       *   판정은 `lib/음성헤더.js` 가 진다 — 여기 적으면 리허설을 쏴야만 검증된다. */
      const 글 = (await r.text()).slice(0, 300);
      if (파일없음(r.status, 글)) return 봉({ state: 'missing' });
      console.error('[events] 헤더 측정 실패', r.status, 글);
      return 봉({ state: 'unmeasured', reason: `storage_${r.status}` });
    }
    const 전체 = 총바이트(r);
    return 봉({ state: 'measured', byte_size: 전체, ...헤더읽기(await 앞부분(r, 앞머리바이트), 전체) });
  } catch (e) {
    console.error('[events] 헤더 측정 예외', String((e as Error)?.message ?? e));
    return 봉({ state: 'unmeasured', reason: 'fetch' });
  }
}

Deno.serve(async (req: Request) => {
  const 선언 = req.headers.get('X-Contract-Ver') ?? '';
  if (!선언) return 실패(400, { code: 'CONTRACT_VER_MISSING', message: 'X-Contract-Ver 헤더가 없습니다', retryable: false }, 선언);
  const 선언판 = 계약판.exec(선언);
  if (!선언판) {
    return 실패(426, { code: 'CONTRACT_VER_UNSUPPORTED', message: `계약판 형식이 아닙니다: ${선언}`, retryable: false }, 선언);
  }
  if (req.method !== 'POST') return 실패(405, { code: 'CONTRACT_VIOLATION', message: 'POST 만 받는다', retryable: false }, 선언);

  const 주체 = 토큰주체(req);
  if (!주체) return 실패(401, { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false }, 선언);

  const 원문 = await req.text();
  // ⚠ 바이트로 잰다 — `length` 는 UTF-16 칸 수라 한국어·몽골어에서 상한이 조용히 헐거워진다.
  if (new TextEncoder().encode(원문).length > 최대바이트) {
    return 실패(413, { code: 'PAYLOAD_TOO_LARGE', message: '배치가 너무 큽니다 — 나눠 보내주세요', retryable: false }, 선언);
  }

  let 본문: { events?: unknown };
  try {
    본문 = JSON.parse(원문 || '{}');
  } catch {
    return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'JSON 이 아닙니다', retryable: false }, 선언);
  }
  const 사건들 = 본문.events;
  if (!Array.isArray(사건들)) {
    return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'events 배열이 없습니다', field: 'events', retryable: false }, 선언);
  }
  if (사건들.length > 최대건수) {
    return 실패(413, { code: 'PAYLOAD_TOO_LARGE', message: `한 번에 ${최대건수}건까지입니다`, retryable: false }, 선언);
  }

  // 학생 확정과 DB 계약판을 **한 번에** 읽는다(왕복 1회).
  // 유효한 JWT 여도 학생 행이 없으면 학생이 아니다(직원·서비스 토큰).
  const [행] = await sql`
    select (select learner_id from engine.learners where ${살아있는학생(sql, 주체, 발급시각(req))}) as learner_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const db판 = 계약판.exec(String(행?.최신조각 ?? '').match(/_(c\d+)\.sql$/)?.[1] ?? '');
  if (!db판) {
    console.error('[events] DB 계약판을 못 읽었다', 행?.최신조각);
    return 실패(500, { code: 'SERVER_ERROR', message: '서버 설정 오류입니다', retryable: true }, 선언);
  }
  const ver = db판[0];

  if (Number(선언판[1]) > Number(db판[1])) {
    return 실패(426, {
      code: 'CONTRACT_VER_UNSUPPORTED', retryable: false,
      message: `서버가 아직 ${선언} 을 모릅니다(현재 ${ver}) — 잠시 뒤 다시 시도해 주세요`,
    }, ver);
  }

  if (!행?.learner_id) {
    return 실패(401, { code: 'AUTH_REQUIRED', message: '학생 계정이 아닙니다', retryable: false }, ver);
  }
  const learner_id: string = 행.learner_id;

  const results: Record<string, unknown>[] = [];
  for (const 사건 of 사건들 as Record<string, unknown>[]) {
    results.push(await 한건(사건, learner_id, ver));
  }
  return 봉투(200, { ok: true, results }, ver);
});

/** 한 건 = 한 트랜잭션. learning_events 와 submissions 는 같이 서거나 같이 없다. */
async function 한건(사건: Record<string, unknown>, learner_id: string, ver: string) {
  const key = 사건.idempotency_key;
  const 거절 = (e: 오류) => ({ idempotency_key: key, status: 'rejected', error: e });

  const r = 검증(사건, 계약);
  if (!r.ok) {
    return 거절({ code: 'CONTRACT_VIOLATION', message: r.오류들.join(' · '), retryable: false });
  }

  // payload 는 **있으면 판이 붙어야 한다**(C0 §4-1 payload 규격). 빈 payload 는 규격 밖이 아니다 —
  // 모양이 없는 사건도 있다. 여기 있는 이유: `이벤트검증` 은 조합을 지고 판은 봉투 규칙이다.
  const payload = (사건.payload ?? {}) as Record<string, unknown>;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return 거절({ code: 'PAYLOAD_INVALID', message: 'payload 는 객체여야 합니다', field: 'payload', retryable: false });
  }
  if (Object.keys(payload).length && !Number.isInteger(payload.ver)) {
    return 거절({ code: 'PAYLOAD_INVALID', message: 'payload.ver(정수)가 필요합니다', field: 'payload.ver', retryable: false });
  }

  // uuid 칸은 모양을 먼저 본다 — 안 그러면 DB 가 22P02 로 죽어 500 이 되고, 앱은 영구 오류를 재시도한다.
  for (const 칸 of ['correlation_id', 'session_id', 'content_id', 'retry_of_event_id', 'parent_event_id']) {
    const v = 사건[칸];
    if (v != null && v !== '' && !UUID.test(String(v))) {
      return 거절({ code: 'CONTRACT_VIOLATION', message: `${칸} 는 uuid 여야 합니다`, field: 칸, retryable: false });
    }
  }

  /* 업로드 참조는 **이 학생의** 규칙 안이어야 한다(L0 §9-3-1 · `uploads-sign` 이 만든 그 경로).
   * 🔴 남의 learner_id 밑을 가리키는 참조를 받으면, 그 학생이 철회했을 때 우리 폴더 삭제가
   *   **다른 학생의 행이 가리키던 파일**을 지운다 — 두 사람의 보증이 한 번에 깨진다.
   *   서명을 우리가 냈어도 여기서 다시 본다: 앱이 참조를 **손으로 지어내는 것**은 막을 수 없고,
   *   막을 수 없는 것은 받는 자리에서 거른다. */
  const s참조 = 사건.submission as Record<string, unknown> | undefined;
  if (s참조) {
    const 이미지 = Array.isArray(s참조.image_refs) ? (s참조.image_refs as unknown[]) : [];
    for (const [칸, p] of [['audio_ref', s참조.audio_ref], ...이미지.map((v) => ['image_refs', v] as const)]) {
      if (p == null || p === '') continue;
      const c = 경로검사(String(p), learner_id);
      if (!c.ok) {
        return 거절({
          code: 'CONTRACT_VIOLATION', field: `submission.${칸}`, retryable: false,
          message: `업로드 참조가 규칙 밖입니다: ${c.이유}`,
        });
      }
    }
  }

  /* `capture_meta` 는 두 갈래다(C0 §4-2): `app` = 앱이 **요청한** 설정 / `server` = 서버가 파일
   * 헤더에서 **실제로 잰** 값. 앱 것은 그대로 두고 `server` 만 얹는다 — 덮으면 「요청」과 「관측」이
   * 한 칸에서 섞이고, 그 둘이 다르다는 것이 이 열의 존재 이유다.
   * ⚠ 측정은 **트랜잭션 밖**에서 한다(네트워크 왕복 동안 DB 트랜잭션을 붙들지 않는다). */
  let capture_meta: unknown = s참조 ? (s참조.capture_meta ?? null) : null;
  if (capture_meta != null && (typeof capture_meta !== 'object' || Array.isArray(capture_meta))) {
    // 객체가 아니면 여기서 막는다 — 아니면 문자열 하나가 `server` 측정을 통째로 삼킨다.
    return 거절({
      code: 'PAYLOAD_INVALID', field: 'submission.capture_meta', retryable: false,
      message: 'capture_meta 는 객체여야 합니다',
    });
  }
  if (s참조?.audio_ref) {
    capture_meta = { ...((capture_meta as Record<string, unknown>) ?? {}), server: await 헤더측정(String(s참조.audio_ref)) };
  }

  const occurred_at = String(사건.occurred_at);
  if (Number.isNaN(Date.parse(occurred_at))) {
    return 거절({ code: 'CONTRACT_VIOLATION', message: 'occurred_at 이 ISO 8601 이 아닙니다', field: 'occurred_at', retryable: false });
  }

  /* jsonb 는 **드라이버의 `sql.json()` 으로만** 싣는다.
   * 🔴 실측(2026-08-06 왕복시험): `${JSON.stringify(v)}::jsonb` 로 보내면 드라이버가 그 문자열을
   *   **한 번 더** JSON 으로 감싸서, 저장된 값이 객체가 아니라 **JSON 문자열**이 된다
   *   (`jsonb_typeof` = `string` · `payload->>'attempt_no'` = null).
   *   오류가 안 나고 행도 멀쩡히 생겨서 **저장된 뒤에야, 그것도 조회할 때에야** 드러난다 —
   *   `choice.selected` 의 보기·선택 기록이 통째로 죽는 자리였다. */
  const 제이슨 = (v: unknown) => (v == null ? null : sql.json(v as never));

  try {
    return await sql.begin(async (tx) => {
      // ① 동의 — `occurred_at` 시점에 살아 있던 것만. 사후 동의는 과거를 유효하게 만들지 못한다(C0 §5).
      //    그리고 **철회한 뒤에는 과거 시각을 주장해도 새 수집이 없다** — 저장은 지금 벌어지는
      //    일이라 지금(now()) 기준으로도 살아 있어야 한다(동의문 「철회 시 중단」 · 왕복 ⑫).
      //    `consent_id` 까지 읽는 이유: 행이 「어느 동의 문서 판」이 아니라 **정확히 어느 동의 행**에
      //    근거했는지를 남긴다(20260807120000 · 서버 파생이라 앱 payload 는 그대로다).
      const 동의 = await tx`
        select consent_id, consent_ver from engine.consents
         where learner_id = ${learner_id}::uuid
           and agreed_at <= ${occurred_at}::timestamptz
           and (revoked_at is null or (revoked_at > ${occurred_at}::timestamptz and revoked_at > now()))
         order by agreed_at desc limit 1`;
      if (!동의.length) {
        return 거절({
          code: 'CONSENT_MISSING', field: 'consent_ver', retryable: false,
          message: '이 시점에 유효한 동의가 없습니다 — 동의 화면을 먼저 띄워야 합니다',
        });
      }

      /* ②-a **인과 고리를 푸는 자리 하나**(절단문서 ①-4) — `retry_of_event_id`·`parent_event_id`.
       *   여기까지 이 둘은 **서버가 발급한 event_id** 만 받았다. 그런데 이 앱의 제출 로그는
       *   오프라인 큐다(`lib/제출로그.js` — 3일 뒤에 올라가는 항목이 실제로 있다): 한 배치 안에서
       *   둘째 항목이 첫째를 가리키려 해도 첫째는 **아직 event_id 가 없다.** 즉 그 고리는 틀리게
       *   저장되는 게 아니라 **보낼 수단 자체가 없어** 사라진다 — 재제출 인과와 대화 순서가 통째로.
       *   🔑 **새 이름을 안 만든다(c9 불요).** 앱은 항목마다 v4 uuid 를 한 번 짓고 다시는 안 바꾸고
       *     (`idempotency_key` · 절단문서 ①-5), 서버엔 그 값으로 찾을 유일 색인이 **이미 있다**
       *     (`unique (learner_id, idempotency_key)`). 가리킬 이름은 있었고 받는 쪽이 안 읽었을 뿐이다.
       *     저장되는 값은 그대로 **진짜 event_id** 라 하류 조회는 아무것도 안 바뀐다.
       *   🔴 `parent_event_id` 는 **존재 검사가 아예 없었다** — FK(`learning_events_parent_same_learner`)
       *     가 대신 터져 400 이어야 할 것이 500 이 되고, 5xx 는 `retryable` 이라 그 발화가 큐에서
       *     영원히 재시도한다(§78 이 uuid **모양**에 대해 못박은 그 사고의 다른 얼굴이다).
       *     한 통로로 들어오니 한 자리에서 함께 막는다. */
      const 고리풀기 = async (v: unknown) => {
        const s = String(v);
        /* event_id 를 **먼저** 본다. 두 이름이 한 값에 겹칠 확률은 사실상 0 이지만, 순서를 안
         * 정해 두면 그 드문 날의 판정이 계획에 없던 대로 갈린다(둘 다 uuid 라 눈으로는 못 가린다). */
        const 원 = await tx`
          select event_id, intervention_id from engine.learning_events
           where learner_id = ${learner_id}::uuid
             and (event_id = ${s}::uuid or idempotency_key = ${s})
           order by (event_id = ${s}::uuid) desc limit 1`;
        return 원.length ? 원[0] : null;
      };

      // ② 개입 계승(c6) — 앱은 「무엇에 대한 재시도인가」만 말하고, 그 사건의 intervention_id 는 서버가 잇는다.
      let intervention_id: string | null = null;
      let retry_of: string | null = null;
      let parent_of: string | null = null;
      if (사건.retry_of_event_id) {
        const 원 = await 고리풀기(사건.retry_of_event_id);
        if (!원) {
          return 거절({
            code: 'CONTRACT_VIOLATION', field: 'retry_of_event_id', retryable: false,
            message: 'retry_of_event_id 가 이 학생의 사건이 아닙니다',
          });
        }
        retry_of = 원.event_id;
        intervention_id = 원.intervention_id;
      } else if (s참조?.task_ref) {
        /* 🔴 **최초 제출도 개입을 가리켜야 한다**(절단문서 ①-11). 여기까지는 `retry_of_event_id`
         *   가 있을 때만 이었고, 그래서 **즉시 성과 — 개입이 먹힌 바로 그 경우 — 만 고리가 없었다.**
         *   재시도한 학생은 남고 한 번에 해낸 학생은 안 남는 편향이라, 그 위의 「어느 개입이
         *   먹혔나」는 영영 재시도 쪽으로 기운다. 소급 불가: 지금 안 이으면 그 기간은 null 이다.
         *   🔑 새 필드를 안 만든다 — `task_ref` 는 배치가 지은 이름이고 제출이 이미 들고 온다.
         *   못 찾으면 **거절하지 않고 null 로 둔다**: 고정 도입 과제처럼 배정 행 없이 낸 갈래가
         *   실제로 있고, 거기서 400 을 내면 그 학생의 발화가 큐에서 영영 재시도한다. */
        const 배정 = await tx`
          select e.intervention_id from engine.learning_events e
            join engine.submissions s on s.event_id = e.event_id
           where e.learner_id = ${learner_id}::uuid
             and e.event_type = 'task.assigned'
             and s.task_ref = ${String(s참조.task_ref)}
           order by e.occurred_at desc limit 1`;
        intervention_id = 배정.length ? 배정[0].intervention_id : null;
      }

      /* 선행 턴. 🔴 여기서 거절하는 것이 **완화가 아니라 강화**다 — 지금까지 이 칸은 검사 없이
       * FK 로 갔고, 그 결과가 500 + 무한 재시도였다(위 ②-a). 거절 사유를 400 으로 돌려주면
       * 앱은 그 항목을 `send_final` 로 접는다(`lib/제출로그.js` — 계약 위반은 100번 보내도 위반이다). */
      if (사건.parent_event_id) {
        const 원 = await 고리풀기(사건.parent_event_id);
        if (!원) {
          return 거절({
            code: 'CONTRACT_VIOLATION', field: 'parent_event_id', retryable: false,
            message: 'parent_event_id 가 이 학생의 사건이 아닙니다',
          });
        }
        parent_of = 원.event_id;
      }

      /* ②-b `skill_ids` — L0 §3-2 가 「배열이라 외래키가 안 걸린다 → **서버 검증으로 막고**
       * 연결 테이블은 만들지 않는다」고 적어 둔 자리다. 그 서버 검증이 없었다(절단문서 ①-13):
       * `${사건.skill_ids ?? []}` 를 그대로 INSERT 해서 오타·폐기된 id·다른 판본의 id 가
       * 전부 통과했다. 🔴 어휘 지도의 축이라 한 번 오염되면 그 위의 집계가 전부 흔들리고,
       * 「이 학생이 무엇을 피하는가」(회피 편향)는 그 축으로만 계산된다 — 소급 복구 불가.
       * 🔑 빈 배열은 정상이다(축 없는 과업). 검사는 **값이 있을 때만** 돈다. */
      const skill_ids = 사건.skill_ids ?? [];
      if (!Array.isArray(skill_ids) || skill_ids.some((v) => typeof v !== 'string' || !v.trim())) {
        return 거절({
          code: 'CONTRACT_VIOLATION', field: 'skill_ids', retryable: false,
          message: 'skill_ids 는 빈 문자열이 없는 문자열 배열이어야 합니다',
        });
      }
      if (skill_ids.length) {
        // 판본을 모르면 그 id 가 어느 지도의 것인지 나중에 못 되짚는다(이름은 판본 간 재사용된다).
        if (!사건.skill_taxonomy_ver) {
          return 거절({
            code: 'CONTRACT_VIOLATION', field: 'skill_taxonomy_ver', retryable: false,
            message: 'skill_ids 를 실었으면 skill_taxonomy_ver 도 필요합니다',
          });
        }
        const 실재 = await tx`
          select skill_id from engine.skills where skill_id = any(${skill_ids as string[]})`;
        const 있는것 = new Set(실재.map((r: Record<string, unknown>) => String(r.skill_id)));
        const 없는것 = (skill_ids as string[]).filter((id) => !있는것.has(id));
        if (없는것.length) {
          return 거절({
            code: 'CONTRACT_VIOLATION', field: 'skill_ids', retryable: false,
            message: `engine.skills 에 없는 skill_id: ${없는것.join(', ')}`,
          });
        }
      }

      // ③ 멱등 — 같은 (학생, key) 재전송은 오류가 아니라 원래 event_id 를 돌려준다.
      const 넣기 = await tx`
        insert into engine.learning_events (
          learner_id, event_type, task_type, actor_kind, occurred_at, correlation_id,
          idempotency_key, session_id, content_id, retry_of_event_id, parent_event_id, turn_no,
          correction_id,
          skill_ids, skill_taxonomy_ver, level_snapshot, goal_snapshot,
          intervention_id, consent_id, consent_ver, source_kind, payload, schema_ver
        ) values (
          ${learner_id}::uuid, ${String(사건.event_type)}, ${(사건.task_type ?? null) as string | null},
          'learner', ${occurred_at}::timestamptz, ${(사건.correlation_id ?? null) as string | null}::uuid,
          ${String(key)}, ${(사건.session_id ?? null) as string | null}::uuid,
          ${(사건.content_id ?? null) as string | null}::uuid,
          /* 🔑 푼 값을 넣는다(②-a). 앱이 자기 idempotency_key 로 가리켰어도 열에 남는 것은 늘
           * 진짜 event_id 라 FK 도 하류 조회(progress 의 correction_retry 등)도 그대로다.
           * ⚠ 이 주석도 SQL 템플릿 리터럴 안이다 — 백틱 금지(바로 아래 F180 경고와 같은 자리). */
          ${retry_of}::uuid,
          ${parent_of}::uuid,
          ${(사건.turn_no ?? null) as number | null},
          /* c8 교정 고리. 🔴 2026-08-07 F179: 이 한 칸이 빠져 있었고, 그 결과
           * 「correction.viewed」·「correction.responded」 는 **API 로는 100% 거절**됐다 —
           * ⚠ 이 주석은 SQL 템플릿 리터럴 **안**이다 — 백틱을 쓰면 문자열이 여기서 끊겨
           *   함수가 번들조차 안 된다(2026-08-07 실사고 · 회귀 tests/화면구문.test.js).
           * 검증기(이벤트검증)는 이 필드를 필수로 요구하고, DB CHECK
           * (learning_events_correction_target_c8)는 그 두 사건에 not null 을 거는데,
           * 서버만 값을 조용히 버려 null 로 넣었기 때문이다. 세 층이 서로 다른 계약을 믿었다.
           * ☠️ 「12/12 실왕복 초록」이 못 잡은 이유: 왕복시험이 **직접 SQL 로** 넣어
           *   이 통로를 안 탔다. DB 를 증명한 것이지 API 를 증명한 게 아니었다. */
          ${(사건.correction_id ?? null) as string | null}::uuid,
          ${skill_ids as string[]}, ${(사건.skill_taxonomy_ver ?? null) as string | null},
          ${(사건.level_snapshot ?? null) as string | null}, ${(사건.goal_snapshot ?? null) as string | null},
          ${intervention_id}::uuid, ${동의[0].consent_id}::uuid, ${동의[0].consent_ver},
          /* 「어떻게 알게 됐나」 — 서버가 정한다(절단문서 ①-7). 앱은 이 칸을 못 보낸다
           * (검증기 서버칸: 앱이 자기 사건을 「관측입니다」라고 선언하면 자기 증명이다).
           * 표는 lib/사건출처.js 하나고 배달 통로도 같은 표를 읽는다 — 둘이 각자 적으면
           * 같은 사건이 한쪽에선 관측, 다른 쪽에선 추정이 된다.
           * event_type 은 위 검증에서 계약 값목록 안임이 확정됐다(값목록 밖이면 400). */
          ${사건출처(String(사건.event_type))}::engine.source_kind, ${제이슨(payload)}, ${ver}
        )
        on conflict (learner_id, idempotency_key) do nothing
        returning event_id`;

      if (!넣기.length) {
        const 기존 = await tx`
          select event_id from engine.learning_events
           where learner_id = ${learner_id}::uuid and idempotency_key = ${String(key)}`;
        return { idempotency_key: key, status: 'duplicate', event_id: 기존[0].event_id };
      }
      const event_id: string = 넣기[0].event_id;

      // ④ 제출물 원문 — 있을 때만. task_type 은 not null 이라 사건에서 받아 온다.
      const s = 사건.submission as Record<string, unknown> | undefined;
      if (s) {
        await tx`
          insert into engine.submissions (
            event_id, task_type, task_format, task_ref, task_snapshot, task_schema_ver,
            body_original, image_refs, audio_ref, capture_meta, occurred_at, schema_ver
          ) values (
            ${event_id}::uuid, ${String(사건.task_type)}, ${(s.task_format ?? null) as string | null},
            ${(s.task_ref ?? null) as string | null},
            ${제이슨(s.task_snapshot)},
            ${(s.task_schema_ver ?? null) as string | null},
            ${(s.body_original ?? null) as string | null},
            ${(s.image_refs ?? null) as string[] | null},
            ${(s.audio_ref ?? null) as string | null},
            ${제이슨(capture_meta)},
            ${occurred_at}::timestamptz, ${ver}
          )`;
      }
      return { idempotency_key: key, status: 'stored', event_id };
    });
  } catch (e) {
    const 글 = String((e as Error)?.message ?? e);
    // DB 가 막은 것은 대개 **계약 위반**이지 서버 잘못이 아니다 — 그걸 5xx 로 주면 앱이 영원히 재시도한다.
    if (/violates check constraint|invalid input|violates foreign key|violates not-null/i.test(글)) {
      return 거절({ code: 'CONTRACT_VIOLATION', message: 글.slice(0, 200), retryable: false });
    }
    console.error('[events] 저장 실패', 글);
    return { idempotency_key: key, status: 'rejected', error: { code: 'SERVER_ERROR', message: '저장하지 못했습니다', retryable: true } };
  }
}
