/* GET /v1/corrections — 나에게 온 교정 (C0 §4-3 ②).
 *
 * ■ 이 자리가 무엇을 닫나
 *   c8 이 `correction_id` 를 깔아 「어느 교정을 봤나」의 고리를 냈는데, 정작 **교정을 꺼내
 *   보여주는 통로가 없었다.** 앱은 자기가 받은 correction_id 를 알 길이 없고, 모르면
 *   `correction.viewed` 를 보낼 수 없다 — S1-8 「학습이 일어났다」의 **유일한 직접 신호**가
 *   영영 안 쌓인다. 그 마지막 한 칸이 여기다.
 *
 * ■ 왜 Edge Function 인가 — 다른 길이 **없다**
 *   RLS 정책 `learner_self_corrections`(c6)가 이미 「자기 교정만 SELECT」를 허용한다. 그런데
 *   `engine` 스키마는 API 에 노출돼 있지 않아 앱의 `supabase.from('corrections')` 는
 *   `PGRST106` 으로 죽는다(C0 §4-3). 노출로 푸는 길은 L0 §4-3 이 미룬 이유(정책 실수의 영향
 *   범위가 0)를 되돌리는 값이라 쓰지 않는다. → `SUPABASE_DB_URL` 직결, `tasks` 와 같은 골격.
 *
 * ■ `confirmed_at` 은 새 열이 아니다 — `created_at` 이다
 *   계약 §4-3 ② 는 `confirmed_at` 을 요구하는데 물리 `engine.corrections` 에 그 열이 없다.
 *   🔑 **`corrections` 는 「생성 후 불변」**(L0 §3-4)이라 행이 선 순간이 곧 확정 순간이고,
 *   따라서 확정 시각의 정본은 이미 `created_at` **하나**다. 열을 새로 두면 같은 사실의 정본이
 *   둘이 되고 어긋나는 날 어느 쪽도 못 믿는다 — c8 이 `learner_id` 복제를 기각한 것과 같은 축.
 *   그래서 **계약 개정 0 · 마이그레이션 0**. 표면 이름만 계약대로 씌운다.
 *
 * ■ `actor_kind` 를 그대로 준다 (누가 확정했나)
 *   ai 교정과 강사 교정이 한 목록에 산다. 가려서 주지 않는다 — 학생에게 「누가 고쳐줬나」는
 *   교정 내용만큼 중요하고, 계약이 이 칸을 `data[]` 에 둔 이유가 그것이다.
 *
 * ■ 읽기는 사건을 만들지 않는다 (C0 §4-3 ②)
 *   열람 표시(`correction.viewed`)는 앱이 `POST /v1/events` 로 **따로** 보낸다. 조회가 쓰기를
 *   겸하면 재시도 한 번이 곧 데이터 오염이다.
 */
import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 「누구인가」 다음은 「아직 살아 있는가」 — 정본은 `lib/토큰.js` 하나다(절단문서 ②-15).
 * `sql` 뒤에서 꺼낸다: 조각의 타입이 이 클라이언트에 매여 있다. */
const { 발급시각, 살아있는학생 } = 토큰모듈 as {
  발급시각: (req: Request) => number | null;
  살아있는학생: (질의: typeof sql, 주체: string, iat: number | null) => ReturnType<typeof sql>;
};

const 계약판 = /^c(\d+)$/;

/* 커서 = `<ISO 시각>|<uuid>`. **시각만으로는 부족하다** — 같은 밀리초에 둘이 서면 경계에서
 * 한 건이 조용히 사라진다(append-only 라 되짚을 수도 없다). 그래서 정렬키와 같은 짝을 싣는다. */
const 커서꼴 = /^(.+)\|([0-9a-fA-F-]{36})$/;
const 쪽크기 = 20;

type 오류 = { code: string; message: string; retryable: boolean; field?: string };

function 봉투(status: number, body: Record<string, unknown>, ver: string) {
  return new Response(JSON.stringify({ contract_ver: ver, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const 실패 = (status: number, e: 오류, ver: string) => 봉투(status, { ok: false, error: e }, ver);

Deno.serve(async (req: Request) => {
  const 선언 = req.headers.get('X-Contract-Ver') ?? '';
  if (!선언) return 실패(400, { code: 'CONTRACT_VER_MISSING', message: 'X-Contract-Ver 헤더가 없습니다', retryable: false }, 선언);
  const 선언판 = 계약판.exec(선언);
  if (!선언판) {
    return 실패(426, { code: 'CONTRACT_VER_UNSUPPORTED', message: `계약판 형식이 아닙니다: ${선언}`, retryable: false }, 선언);
  }
  if (req.method !== 'GET') return 실패(405, { code: 'CONTRACT_VIOLATION', message: 'GET 만 받는다', retryable: false }, 선언);

  /* 뒷마디를 본다 — `tasks`·`uploads` 와 같은 이유다. 안 보면 `/corrections/아무거나` 가 전부
   * 이 조회로 동작하고, 나중에 형제 경로를 내는 날 옛 오타 경로가 **이미 돌던 것**이 된다. */
  const url = new URL(req.url);
  if (!url.pathname.replace(/\/+$/, '').endsWith('/corrections')) {
    return 실패(404, { code: 'CONTRACT_VIOLATION', message: '없는 경로입니다 — GET /v1/corrections', retryable: false }, 선언);
  }

  const 주체 = 토큰주체(req);
  if (!주체) return 실패(401, { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false }, 선언);

  /* 🔴 커서도 **모양을 먼저** 본다(`tasks` 의 `date` 와 같은 축). 안 보면 `since=어제` 가
   *   Postgres 까지 내려가 `22007` 로 죽고, 400 이어야 할 것이 500 이 된다 — 5xx 는
   *   `retryable` 이라 앱이 영구 오류를 무한 재시도한다. */
  const 요청커서 = url.searchParams.get('since');
  let 커서시각: string | null = null;
  let 커서id: string | null = null;
  if (요청커서 !== null) {
    const m = 커서꼴.exec(요청커서);
    if (!m || Number.isNaN(Date.parse(m[1]))) {
      return 실패(400, {
        code: 'CONTRACT_VIOLATION', field: 'since', retryable: false,
        message: 'since 는 앞선 응답의 next_cursor 를 그대로 실어야 합니다',
      }, 선언);
    }
    커서시각 = m[1];
    커서id = m[2];
  }

  // 학생 확정과 DB 계약판을 한 번에 읽는다(왕복 1회) — `tasks` 와 같은 근거로 판은 **DB 에게 묻는다**.
  const [행] = await sql`
    select (select learner_id from engine.learners where ${살아있는학생(sql, 주체, 발급시각(req))}) as learner_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const db판 = 계약판.exec(String(행?.최신조각 ?? '').match(/_(c\d+)\.sql$/)?.[1] ?? '');
  if (!db판) {
    console.error('[corrections] DB 계약판을 못 읽었다', 행?.최신조각);
    return 실패(500, { code: 'SERVER_ERROR', message: '서버 설정 오류입니다', retryable: true }, 선언);
  }
  const ver = db판[0];

  if (Number(선언판[1]) > Number(db판[1])) {
    return 실패(426, {
      code: 'CONTRACT_VER_UNSUPPORTED', retryable: false,
      message: `서버가 아직 ${선언} 을 모릅니다(현재 ${ver}) — 잠시 뒤 다시 시도해 주세요`,
    }, ver);
  }

  // 유효한 JWT 여도 학생 행이 없으면 학생이 아니다(직원·서비스 토큰).
  if (!행?.learner_id) {
    return 실패(401, { code: 'AUTH_REQUIRED', message: '학생 계정이 아닙니다', retryable: false }, ver);
  }

  try {
    /* 🔑 **자기 것만** — 학생은 토큰에서 왔고 쿼리로 지정할 수 없다(C0 §4-3 공통).
     *   `service_role` 은 RLS 를 우회하므로 이 사슬이 유일한 방어선이다. 걷는 길은 RLS 정책
     *   `learner_self_corrections` 와 **같다**: corrections → submissions → learning_events.
     *
     * 🔴 **보여줄 것이 없는 행은 빼낸다.** `corrected_text` 도 `error_tags` 도 비운 행이 설 수
     *   있다(강사가 판정만 남긴 골든셋 행 등). 그대로 주면 화면에 **빈 카드**가 뜨는데,
     *   계약 §4-3 ② 가 빈 상태에 대해 금지한 것이 정확히 그 모양이다.
     *
     * 한 건 더 받아(`쪽크기 + 1`) 다음 쪽이 있는지 **세지 않고** 안다 — count 를 따로 세면
     *   그 사이 새 교정이 서서 총계와 목록이 어긋난다. */
    const 행들 = await sql`
      select c.correction_id, c.submission_id, c.corrected_text, c.error_tags,
             c.explanation, c.actor_kind, c.created_at as confirmed_at
        from engine.corrections c
        join engine.submissions s on s.submission_id = c.submission_id
        join engine.learning_events e on e.event_id = s.event_id
       where e.learner_id = ${행.learner_id}::uuid
         and (c.corrected_text is not null or array_length(c.error_tags, 1) is not null)
         and (${커서시각}::timestamptz is null
              or (c.created_at, c.correction_id)
                  < (${커서시각}::timestamptz, ${커서id}::uuid))
       order by c.created_at desc, c.correction_id desc
       limit ${쪽크기 + 1}`;

    const 다음있음 = 행들.length > 쪽크기;
    const data = 행들.slice(0, 쪽크기).map((r: Record<string, unknown>) => ({
      correction_id: r.correction_id,
      submission_id: r.submission_id,
      corrected_text: r.corrected_text ?? null,
      error_tags: r.error_tags ?? [],
      /* 🔑 **몽골어 해설**(발주_수집파이프라인 §87 — 「교정문은 한국어 1문장, 해설은 몽골어」).
       *   발주_게임모듈 §780 이 「화면에 그대로 나간다」고 적어 둔 칸인데 응답에 없어서 앱에
       *   닿는 길이 0이었다 — 물리에 값이 쌓여도 학생은 영영 못 본다(유호님 승인 2026-08-09).
       * 🔴 위 `where` 의 「보여줄 것이 있나」 판정에는 **일부러 넣지 않았다**: 해설은 교정에
       *   딸리는 한 줄이라 `corrected_text`·`error_tags` 없이 홀로 서는 행은 설계에 없다.
       *   넣으면 강사가 판정만 남긴 골든셋 행이 해설 한 줄만 든 카드로 학생 화면에 뜬다. */
      explanation: r.explanation ?? null,
      actor_kind: r.actor_kind,
      confirmed_at: r.confirmed_at,
    }));

    const 끝 = data[data.length - 1] as { confirmed_at: Date; correction_id: string } | undefined;
    const next_cursor = 다음있음 && 끝
      ? `${new Date(끝.confirmed_at).toISOString()}|${끝.correction_id}`
      : null;

    return 봉투(200, { ok: true, data, next_cursor }, ver);
  } catch (e) {
    console.error('[corrections] 조회 실패', String((e as Error)?.message ?? e));
    return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});
