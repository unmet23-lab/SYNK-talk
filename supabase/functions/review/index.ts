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
 *   입력**이다 — 승인 게이트 ②가 그 장부를 읽는다. 그래서 감사가 실패하면 응답을 내주지
 *   않는다(큐는 같은 트랜잭션 · 서명은 아래 순서 주석).
 *
 * ■ 🔴 감사 종류가 **셋**이다 — 「미리 받음」과 「열어 봄」을 가른다 (§2 개정 · 유호 판정 ㉮)
 *   `review.audio`(발급)를 게이트의 증거로 쓰면 **두 자리에서 동시에 샌다**:
 *   ①프리로드가 다음 항목을 당기는 것만으로 열지도 않은 항목이 통과 상태가 되고
 *   ②이 장부는 append-only 라 행이 영원히 살아, **612초 전 서명 기록으로 재검수가 통과**했다
 *     (2026-08-09 실왕복 실측 · 같은 순간 §4 는 404 라 정직한 검수자는 다시 들을 수도 없었다).
 *   그래서 `review.audio.played`(재생 시작)를 게이트 ②의 **유일한** 증거로 삼는다. 발급은
 *   더 이상 증거가 아니므로 프리로드는 **몇 개를 당겨도 게이트를 0개 연다.**
 *
 * ■ §5 승인·폐기 — 물리 칸 넷이 서서(`20260809090000`) 이 경로가 열렸다
 *   🔴 **이름 둘이 이 머리말의 옛 판과 다르다**: 채택된 물리 정본은 `promotion_intent`·
 *   `transcript_at_review` 다(`promote_intent`·`transcript_verified_at_review` 가 아니다 —
 *   그 조각 머리말이 세션 조율로 못박았다. `_verified_` 를 뺀 것이 판정이다: 검수자가 보는
 *   것은 보통 기계 전사이고 `transcript_verified` 는 그 판정의 **산출물**이라, 이름에 넣으면
 *   행마다 거짓을 적게 된다).
 *
 * ■ 게이트의 주체는 **화면이 아니라 이 함수**다 (§5 · 발주 §3)
 *   UI 만 막으면 직접 호출·재전송으로 0초 승인 행이 그대로 만들어진다. 넷을 매 승인에서
 *   다시 잰다: ①청취 ②그 항목을 **본인이 재생한 기록**(§2 감사가 여기서 **입력**이 된다 ·
 *   재검수는 **마지막 판정 이후의** 재생을 요구한다) ③활성 직원(위 공통 사슬)
 *   ④`reviewed_correction_id` 가 **그 제출물의** AI 행.
 *   🚫 게이트에 **시간 리터럴을 박지 않는다** — 재검수 창은 상수 없이 성립한다: 확정분에는
 *   §4 가 새 서명을 안 주므로 다시 듣는 길은 **아직 살아 있는 옛 URL** 뿐이고, 그것이 죽으면
 *   새 `played` 행을 만들 수 없어 재검수가 자연히 닫힌다(창을 만드는 것은 서버의 상수가
 *   아니라 서명 수명이라는 물리다). 상수를 박으면 첫 확정까지 같이 조인다.
 */
import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';
import 커서모듈 from './검수커서.mjs';
import 경로모듈 from './업로드경로.mjs';
import 확정모듈 from './검수확정.mjs';
import 계약판모듈 from './계약판.mjs';
/* 저작 신뢰 — 철학 Ⅱ-9 의 엔진 쪽 문(정본 = `docs/저작신뢰_설계_v1.md`). 판정은 순수하고
   재료는 행에 남아, 여기서 재든 나중에 승격 통로가 재든 **같은 답**이 나온다. */
import 저작모듈 from './저작신뢰.mjs';
import 작성과정모듈 from './작성과정.mjs';

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };
const { 버킷, 저장소헤더, 저장소키흠 } = 경로모듈 as {
  버킷: string;
  저장소헤더: (키: string) => Record<string, string>;
  저장소키흠: (키: string) => string | null;
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 「누구인가」 다음은 「아직 살아 있는가」 — 정본은 `lib/토큰.js` 하나다(절단문서 ②-15).
 * `sql` 뒤에서 꺼낸다: 조각의 타입이 이 클라이언트에 매여 있다. */
const { 발급시각, 살아있는직원 } = 토큰모듈 as {
  발급시각: (req: Request) => number | null;
  살아있는직원: (질의: typeof sql, 주체: string, iat: number | null) => ReturnType<typeof sql>;
};

type 커서값 = { 감사: boolean; 신뢰: string | null; 시각: string; id: string };
type 반커서값 = { 조: number | null; 좌석: number | null; 시각: string; id: string };
const { 쪽크기, 커서읽기, 커서만들기, 커서키, 반커서읽기, 반커서만들기, 반커서키 } = 커서모듈 as {
  쪽크기: (raw: string | null) => { 값: number | null; 이유: string | null };
  커서읽기: (raw: string | null) => { 값: 커서값 | null; 이유: string | null };
  커서만들기: (행: Record<string, unknown> | undefined) => string | null;
  커서키: (값: 커서값 | null) => { 감사키: boolean; 널키: boolean; 신뢰키: string; 시각: string; id: string } | null;
  반커서읽기: (raw: string | null) => { 값: 반커서값 | null; 이유: string | null };
  반커서만들기: (행: Record<string, unknown> | undefined) => string | null;
  반커서키: (값: 반커서값 | null) => {
    조널키: boolean; 조키: number; 좌석널키: boolean; 좌석키: number; 시각: string; id: string;
  } | null;
};

type 요청검증 = { 값: Record<string, never> | null; 이유: string | null; 칸: string | null };
const { 판정, 청취문턱, 폐기어휘, 승인요청, 폐기요청 } = 확정모듈 as {
  판정: (셋: { 검증전사: unknown; ai교정문: unknown; 최종교정문: unknown }) => string;
  청취문턱: (세그먼트들: unknown) => { ms: number; 재료: boolean };
  폐기어휘: (constraintdef: unknown) => string[];
  승인요청: (본문: unknown) => 요청검증;
  폐기요청: (본문: unknown) => 요청검증;
};

const { 저작판정, 승격보류인가, 보류문구 } = 저작모듈 as {
  저작판정: (재료: { compose_meta: unknown; 본문길이: number }) => { 등급: string; 덩어리비율: number | null };
  승격보류인가: (판정: unknown) => boolean;
  보류문구: string;
};
/* 길이는 **코드포인트**로 센다 — `String.length` 는 이모지를 둘로 세서 비율이 조용히 낮아진다
   (`lib/작성과정.js` 가 같은 이유로 쓰는 그 함수를 그대로 빌린다 · 두 곳이 다르게 세면 안 된다). */
const { 글자수 } = 작성과정모듈 as { 글자수: (s: unknown) => number };

const { 판번호, 행들에서판, 앞선판인가 } = 계약판모듈 as {
  판번호: (판: unknown) => number | null;
  행들에서판: (행들: unknown) => string | null;
  앞선판인가: (앞: unknown, 뒤: unknown) => boolean;
};
const uuid꼴 = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/* 🔑 **허용 목록**이다(차단 목록이 아니다 — 못 적은 역할이 새는 방향은 언제나 「통과」다).
 *   `director` 가 있는 이유: 검수자 채용은 2027-02 이고 그때까지 검수자는 원장 본인이라,
 *   빼면 오늘 이 통로를 쓸 수 있는 사람이 0명이다(§1). `teacher` 는 직원이지만 검수자가 아니다. */
const 검수역할 = ['inspector', 'director'];

/* 서명 수명 10분 — `uploads` 와 같은 사유다(철회 뒤에도 수명만큼 살아 있는 「꼬리」). */
const 서명수명초 = 600;

type 오류 = { code: string; message: string; retryable: boolean; field?: string };

/* §5 거절 — 코드→상태를 **한 자리에 리터럴로** 둔다(계약 §1 표의 코드층 짝).
 * 🔑 두 이유로 표가 필요하다:
 *   ① 초판은 승인·폐기가 **각자** 삼항으로 상태를 정했고, 그 둘이 이미 갈려 있었다
 *      (같은 `else` 가 한쪽은 409, 한쪽은 400). 같은 판정을 두 곳에 적으면 갈라진다.
 *   ② 코드를 변수로 흘리면 `tests/검수통로.test.js` 의 계약 대조가 **눈이 먼다** —
 *      그 검사는 리터럴을 세므로, 표에만 사는 코드가 생겨도 아무도 모르게 된다. */
const 거절상태 = {
  NOT_FOUND: 404,
  CONTRACT_VIOLATION: 400,
  GATE_NOT_MET: 409,
  SUPERSEDE_CONFLICT: 409,
  INTERNAL: 500,
} as const;
type 거절코드 = keyof typeof 거절상태;

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
  if (판번호(선언) === null) {
    return 실패(426, { code: 'CONTRACT_VER_UNSUPPORTED', message: `계약판 형식이 아닙니다: ${선언}`, retryable: false }, 선언);
  }

  /* 뒷마디로 가른다 — `uploads`·`corrections` 와 같은 이유다. 안 보면 `/review/아무거나` 가
   * 전부 큐 조회로 동작하고, §5 가 서는 날 옛 오타 경로가 **이미 돌던 것**이 된다. */
  const url = new URL(req.url);
  const 경로 = url.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  const 아는경로 = ['queue', 'classes', 'audio', 'played', 'approve', 'discard'];
  if (!아는경로.includes(경로)) {
    return 실패(404, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: '없는 경로입니다 — GET /v1/review/{queue,classes} · POST /v1/review/{audio,played,approve,discard}',
    }, 선언);
  }
  const 기대메서드 = 경로 === 'queue' || 경로 === 'classes' ? 'GET' : 'POST';
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

  const ver = 행들에서판(행);
  if (!ver) {
    console.error('[review] DB 계약판을 못 읽었다', 행?.최신조각);
    return 실패(500, { code: 'INTERNAL', message: '서버 설정 오류입니다', retryable: true }, 선언);
  }

  if (앞선판인가(선언, ver)) {
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
    if (경로 === 'queue') return await 큐읽기(url, staff_id, ver);
    if (경로 === 'classes') return await 반목록읽기(staff_id, ver);
    if (경로 === 'audio') return await 오디오서명(req, staff_id, ver);
    if (경로 === 'played') return await 열어봄(req, staff_id, ver);
    const 본문 = await 본문읽기(req);
    if (본문 === undefined) {
      return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'JSON 이 아닙니다', retryable: false }, ver);
    }
    return 경로 === 'approve'
      ? await 승인(본문, staff_id, ver)
      : await 폐기(본문, staff_id, ver);
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
  /* §3-2 반 모드 — `?class=` 가 오면 판·정렬·커서가 통째로 갈린다(교사 동선 축).
   * 여기서 가르고 아래는 손대지 않는다 — 기본 큐의 정렬·커서는 바이트 그대로다. */
  const 반 = url.searchParams.get('class');
  if (반 !== null) {
    if (!uuid꼴.test(반)) {
      return 실패(400, { code: 'CONTRACT_VIOLATION', field: 'class', message: 'class 는 반의 uuid 입니다', retryable: false }, ver);
    }
    return await 반큐읽기(url, 반, staff_id, ver);
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

/* ── §3-2 반 모드 (숙제서클 §10-3) ───────────────────────────────────── */

/* 반 모드가 여는 열 = 기본 22 + 정체 3. `class_id` 는 **안 되돌린다** — 요청이 이미 들고
 * 왔고, 되돌리면 화면이 서버 값과 자기 값 중 무엇을 믿을지 갈린다. 정체 3열을 여는 판정의
 * 근거는 판 쪽 머리말이다(`20260814100000` — 순회 검수는 교사가 학생 눈앞에 앉는 자리다). */
const 반큐열 = [...큐열, 'display_name', 'group_no', 'seat_no'];

/** §3-2 `GET /v1/review/queue?class=` — 그 반 학생들의 큐를 **교사 동선 순**으로.
 *  정렬 = 조 → 좌석 → 시각(nulls last 둘 · `lib/검수커서.js` 반 모드 머리말). 감사 표본·저신뢰
 *  우선은 여기 없다 — 수업 첫 20분의 축은 「눈앞의 조」이지 「의심스러운 발화」가 아니다.
 *  감사는 기본 큐와 **같은 장부·같은 action** 이다: 조회 1회 = `review.queue` 1행이라는 분모를
 *  모드가 가르지 않는다(가르면 게이트 ②의 입력이 두 갈래가 된다). */
async function 반큐읽기(url: URL, 반: string, staff_id: string, ver: string) {
  const 쪽 = 쪽크기(url.searchParams.get('limit'));
  if (쪽.이유) {
    return 실패(400, { code: 'CONTRACT_VIOLATION', field: 'limit', message: 쪽.이유, retryable: false }, ver);
  }
  const 커서 = 반커서읽기(url.searchParams.get('cursor'));
  if (커서.이유) {
    return 실패(400, { code: 'CONTRACT_VIOLATION', field: 'cursor', message: 커서.이유, retryable: false }, ver);
  }
  const k = 반커서키(커서.값);
  const 크기 = 쪽.값 as number;

  /* 읽기와 감사가 한 트랜잭션 — 기본 큐와 같은 이유(§2). */
  const { data, next_cursor } = await sql.begin(async (tx) => {
    const 행들 = await tx`
      select ${tx(반큐열)}
        from engine.review_queue_class
       where class_id = ${반}::uuid
         and ${k === null ? tx`true` : tx`
             ((group_no is null), coalesce(group_no, 0), (seat_no is null), coalesce(seat_no, 0),
              occurred_at, submission_id)
             > (${k.조널키}::boolean, ${k.조키}::smallint, ${k.좌석널키}::boolean, ${k.좌석키}::smallint,
                ${k.시각}::timestamptz, ${k.id}::uuid)`}
       order by (group_no is null), coalesce(group_no, 0), (seat_no is null), coalesce(seat_no, 0),
                occurred_at, submission_id
       limit ${크기 + 1}`;

    const data = 행들.slice(0, 크기);
    const 실린것 = data.map((r: Record<string, unknown>) => r.submission_id);

    /* 0건도 1행 — 「그 반에 기다리는 것이 없다」도 읽은 것이다(기본 큐와 같은 판단). */
    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'review.queue', ${실린것}::uuid[])`;

    return {
      data,
      next_cursor: 행들.length > 크기 ? 반커서만들기(data[data.length - 1]) : null,
    };
  });

  return 봉투(200, { ok: true, data, next_cursor }, ver);
}

/** §3-2 `GET /v1/review/classes` — 반 카드 목록 + 반마다 「기다리는 것 n」.
 *  🔴 「반이 0개」와 「전부 처리됨」은 다른 상태다 — 목록 자체가 비면 화면이 그 사실을 말해야
 *  하므로(반 다리가 안 섰다) 여기서 거르지 않고 다 내준다. `waiting` 은 목록을 그리는 순간의
 *  스냅샷이고, 그 반을 여는 순간 큐가 다시 세므로 두 수가 어긋나는 것은 정상이다.
 *  감사 = `review.classes` 1행(대상 = 실린 반들) — 큐 분모(`review.queue`)와 갈라 둔다:
 *  이 조회가 내주는 것은 제출물이 아니라 **반의 존재와 개수**뿐이라, 큐 장부에 섞으면
 *  「무엇을 보여 줬나」의 뜻이 흐려진다. */
async function 반목록읽기(staff_id: string, ver: string) {
  const { classes } = await sql.begin(async (tx) => {
    const 행들 = await tx`
      select c.class_id, c.class_key, c.display_name,
             count(v.submission_id)::int as waiting
        from engine.classes c
        left join engine.review_queue_class v on v.class_id = c.class_id
       where c.active
       group by c.class_id, c.class_key, c.display_name
       order by c.class_key, c.class_id`;

    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'review.classes',
              ${행들.map((r: Record<string, unknown>) => r.class_id)}::uuid[])`;

    return { classes: 행들 };
  });

  return 봉투(200, { ok: true, classes }, ver);
}

/* ── §4 POST /v1/review/audio ────────────────────────────────────────── */

/** §4·§4-2 가 **같은 모양의 요청**을 받는다 — 그 검증을 한 자리에 둔다.
 *  두 곳에 적으면 갈라지고, 갈리는 방향은 보통 「느슨한 쪽」이다(uuid 가 아닌 값이 SQL 까지
 *  내려가 400 이어야 할 것이 500 으로 나온다).
 *  @returns 문자열이면 검증된 uuid · `Response` 면 그대로 내보낼 실패 봉투. */
async function 제출물id(req: Request, ver: string): Promise<string | Response> {
  const 읽은것 = await 본문읽기(req);
  if (읽은것 === undefined) {
    return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'JSON 이 아닙니다', retryable: false }, ver);
  }
  const 본문 = (읽은것 ?? {}) as { submission_id?: unknown };
  const sid = String(본문.submission_id ?? '');
  if (!uuid꼴.test(sid)) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', field: 'submission_id', retryable: false,
      message: 'submission_id(uuid)가 필요합니다',
    }, ver);
  }
  return sid;
}

async function 오디오서명(req: Request, staff_id: string, ver: string) {
  const 읽힌것 = await 제출물id(req, ver);
  if (읽힌것 instanceof Response) return 읽힌것;
  const sid = 읽힌것;

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
  const 키흠 = 저장소키흠(키);
  if (키흠) {
    console.error('[review/audio] STORAGE_SIGN_KEY 를 쓸 수 없다 —', 키흠);
    return 실패(500, {
      code: 'INTERNAL', retryable: false,
      message: `STORAGE_SIGN_KEY 설정 오류입니다 — ${키흠}`,
    }, ver);
  }

  /* 🔑 **서명을 먼저 받고 감사를 적는다.** 순서를 뒤집으면 서명이 실패한 항목에도 「발급됨」이
   *   남고, 그 행은 §5 승인 게이트 ②를 그대로 통과시킨다 — 한 번도 못 들은 발화가 청취 게이트를
   *   지난다. 반대로 감사가 실패하면 응답을 안 내주므로(아래 예외는 상위 catch 가 500 으로 받는다)
   *   서명은 아무도 손에 못 쥔 채 수명만큼 떠 있다가 죽는다. 그 방향이 안전하다. */
  const r = await fetch(`${base}/storage/v1/object/sign/${버킷}/${행.audio_ref}`, {
    method: 'POST',
    headers: { ...저장소헤더(키), 'Content-Type': 'application/json' },
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

/* ── §4-2 POST /v1/review/played ─────────────────────────────────────── */

/** 재생이 실제로 **시작**됐다 — 승인 게이트 ②의 유일한 증거를 남긴다.
 *
 *  🔑 **아무것도 발급하지 않는다.** 이 경로가 여는 것은 감사 1행뿐이라 서명 누수 위험이 0이고,
 *    그래서 §4 가 지키는 「확정분에 서명을 안 준다」를 **한 글자도 안 건드리고** 재검수 창이
 *    열린다. 그것이 ㉮ 가 ㉯(재검수 전용 서명 경로)보다 나은 유일한 이유다.
 *
 *  🔴 소속이 §4 보다 **넓다** — 큐 안 **또는** `verified`(재검수 창). 확정분은 뷰에서 빠지므로
 *    큐만 보면 `Z` 가 원리상 못 지난다. 반대로 `discarded`·`revoked` 는 다시 들을 대상이
 *    아니라서 막는다(폐기·철회분에 감사만 쌓이면 「누가 왜 열었나」가 흐려진다).
 *
 *  ⚠ 정직하게: 서명 URL 은 Storage 가 직접 내려주고 이 함수를 안 지나므로 **서버는 재생을
 *    관측할 수 없다.** 이 경로는 자백을 없애지 않는다 — 자백의 단위를 「밀리초」에서 「열었다는
 *    사실」로 옮겨, **아무 우회도 없이 통과하던 두 자리**(프리로드 · 옛 기록)를 없앤다.
 */
async function 열어봄(req: Request, staff_id: string, ver: string) {
  const 읽힌것 = await 제출물id(req, ver);
  if (읽힌것 instanceof Response) return 읽힌것;
  const sid = 읽힌것;

  /* 🔑 소속과 감사를 **한 트랜잭션**에 둔다(§2). 나누면 소속 판정 뒤 상태가 바뀌는 사이에
   *   폐기된 항목의 `played` 가 남고, 그 행은 append-only 라 지울 수 없다. */
  const 결과 = await sql.begin(async (tx) => {
    const [소속] = await tx`
      select exists (select 1 from engine.review_queue v
                      where v.submission_id = ${sid}::uuid) as 큐안,
             (select status::text from engine.pipeline_jobs
               where submission_id = ${sid}::uuid) as status`;
    /* 큐 밖이면서 `verified` 도 아니면 — 없는 제출물·폐기·철회가 전부 여기로 온다.
     * 가르지 않는 이유는 §4 와 같다: 가르면 큐 밖 항목의 존재 여부가 샌다. */
    if (!소속?.큐안 && 소속?.status !== 'verified') {
      return { 거절: 'NOT_FOUND' as const, 문구: '지금 들을 수 있는 항목이 아닙니다' };
    }

    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'review.audio.played', array[${sid}::uuid])`;
    return {};
  });

  if ('거절' in 결과) return 거절응답(결과 as { 거절: 거절코드; 문구: string }, ver);
  return 봉투(200, { ok: true }, ver);
}

/* ── §5 승인·폐기 ────────────────────────────────────────────────── */

/** 본문 파서 — **통로를 하나로 둔다.** 경로마다 try/catch 를 따로 쓰면 새 경로가 그것을
 *  빠뜨렸을 때 증상이 500 이고, 그건 「잘못된 JSON」과 구분이 안 된다.
 *  @returns 파싱값 · `undefined` 면 JSON 이 아니다(본문이 비면 `{}`). */
async function 본문읽기(req: Request): Promise<unknown> {
  try {
    return JSON.parse((await req.text()) || '{}');
  } catch {
    return undefined;
  }
}

type 승인본문 = {
  submission_id: string; reviewed_correction_id: string; supersedes: string | null;
  transcript_verified: string; corrected_text: string; error_tags: string[];
  explanation: string | null; l1_source_phrase: string | null;
  rubric_scores: unknown; reviewer_confidence: number | null;
  review_listened_ms: number; promote: boolean;
};

/** §5-1 `POST /v1/review/approve` — 확정 = 기록 둘(교정 판정 + 승격 의사)이 **한 쓰기**에.
 *
 *  🔴 이 함수의 원자성이 계약의 절반이다. 셋이 한 트랜잭션에 있어야 한다:
 *    ①teacher 행 ②`submissions.transcript_verified` ③`pipeline_jobs.status='verified'`.
 *    ③을 빠뜨리면 확정한 항목이 **큐에 남아** 검수자가 같은 발화를 또 만나고,
 *    ②를 빠뜨리면 최신 판정과 제출물의 검증 전사가 갈린다.
 *    승격 의사(`promotion_intent`)도 같은 쓰기다 — 뒤로 미루면 그 사이 실패에 **사람이 누른
 *    의사가 증발**하고, 그 항목은 이미 큐에서 나가 다시 물을 방법이 없다(발주 §3).
 */
async function 승인(본문: unknown, staff_id: string, ver: string) {
  const 검증 = 승인요청(본문);
  if (검증.이유) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: 검증.이유, ...(검증.칸 ? { field: 검증.칸 } : {}),
    }, ver);
  }
  const q = 검증.값 as unknown as 승인본문;
  const 재검수 = q.supersedes !== null;

  const 결과 = await sql.begin(async (tx) => {
    /* ① **먼저 잠근다.** 소속의 상태 축을 지는 것이 이 표라, 여기를 잠그면 같은 항목의
     *   동시 승인·폐기가 직렬화된다. 두 번째 요청은 잠금이 풀린 뒤 상태를 다시 읽어
     *   「이미 끝난 항목」으로 떨어진다 — 중복 teacher 행이 원리상 안 생긴다.
     *   🔴 뷰(`review_queue`)에는 `for update` 를 걸 수 없다. 그래서 잠금과 소속 판정을
     *   갈랐고, 순서는 **잠금이 먼저**여야 한다(반대면 그 사이 상태가 바뀐다). */
    const [job] = await tx`
      select status::text as status from engine.pipeline_jobs
       where submission_id = ${q.submission_id}::uuid
       for update`;
    if (!job) return { 거절: 'NOT_FOUND' as const, 문구: '없는 제출물입니다' };

    const [재료] = await tx`
      select s.stt_segments,
             /* 🔴 저작 신뢰의 재료(철학 Ⅱ-9 · lib/저작신뢰.js). 새 열을 안 만들었다 —
              *   compose_meta 는 그 제출을 낳은 사건의 payload 에 이미 있고(lib/작성과정.js),
              *   body_original 은 이 표의 열이다. 판정은 **읽는 자리**에서 한다.
              *   ⚠ 이 주석은 템플릿 리터럴 «안»이다 — 백틱을 쓰면 SQL 이 거기서 끊긴다
              *     (아래 청취 게이트 주석이 같은 이유로 백틱을 안 쓴다 · 08-26 에 여기서 재발). */
             s.body_original,
             (select le.payload->'compose_meta' from engine.learning_events le
               where le.event_id = s.event_id) as compose_meta,
             exists (select 1 from engine.review_queue v
                      where v.submission_id = s.submission_id) as 큐안,
             (select c.corrected_text from engine.corrections c
               where c.correction_id = ${q.reviewed_correction_id}::uuid
                 and c.submission_id = s.submission_id
                 and c.actor_kind = 'ai') as ai교정문,
             exists (select 1 from engine.corrections c
                      where c.correction_id = ${q.reviewed_correction_id}::uuid
                        and c.submission_id = s.submission_id
                        and c.actor_kind = 'ai') as ai행,
             /* 게이트 ② — **요청자 본인이 재생한 기록**이어야 한다(§2 개정). 발급
              *   (review.audio)이 아니다: 그건 프리로드가 미리 하므로 열지도 않은 항목을
              *   통과시킨다. 남이 연 기록으로 내가 확정하면 이 게이트는 「누군가 들었다」만
              *   보증한다(검수자가 여럿이 되는 2027-02 에 새는 방향이 「통과」다).
              *   🔑 exists 가 아니라 max(at) 를 든다 — 재검수는 「있나」가 아니라
              *   「마지막 판정 **이후**인가」를 물어야 하고, 그 비교는 아래 계보 질의가 한다.
              *   ⚠ 이 주석은 템플릿 리터럴 «안»이다 — 백틱을 쓰면 SQL 이 거기서 끊긴다. */
             (select max(l.at) from engine.staff_access_log l
               where l.staff_id = ${staff_id}::uuid
                 and l.action = 'review.audio.played'
                 and s.submission_id = any(l.target_ids)) as 마지막청취
        from engine.submissions s
       where s.submission_id = ${q.submission_id}::uuid`;
    if (!재료) return { 거절: 'NOT_FOUND' as const, 문구: '없는 제출물입니다' };

    /* 소속 — 갈래가 둘이다.
     *   ▸ 첫 확정: 지금 큐에 있어야 한다.
     *   ▸ 재검수(`Z`): 확정으로 큐에서 **나간** 항목이라 큐에 없는 것이 정상이고,
     *     대신 `verified` 여야 한다. 폐기·철회분은 어느 쪽으로도 안 받는다. */
    if (!재검수 && !재료.큐안) {
      return { 거절: 'NOT_FOUND' as const, 문구: '지금 큐에 없는 항목입니다' };
    }
    if (재검수 && job.status !== 'verified') {
      return { 거절: 'NOT_FOUND' as const, 문구: '재검수할 수 있는 상태가 아닙니다(확정된 항목만)' };
    }

    /* 재검수의 게이트 ②는 「들었나」가 아니라 「**마지막 판정 이후에** 들었나」다. 그 비교를
     * JS 로 올리지 않고 SQL 에 두는 이유: 두 값이 다 `timestamptz` 라 DB 가 타임존·정밀도를
     * 그대로 비교하고, 한쪽이 null 이면 결과가 null(=거짓)이라 **모르는 채 통과**가 없다. */
    let 판정후재청취 = false;

    if (재검수) {
      const [계보] = await tx`
        select exists (select 1 from engine.corrections c
                        where c.correction_id = ${q.supersedes}::uuid
                          and c.submission_id = ${q.submission_id}::uuid
                          and c.actor_kind = 'teacher') as 대상,
               exists (select 1 from engine.corrections x
                        where x.supersedes = ${q.supersedes}::uuid) as 이미대체됨,
               ((select max(l.at) from engine.staff_access_log l
                  where l.staff_id = ${staff_id}::uuid
                    and l.action = 'review.audio.played'
                    and ${q.submission_id}::uuid = any(l.target_ids))
                > (select c.created_at from engine.corrections c
                    where c.correction_id = ${q.supersedes}::uuid)) as 판정후재청취`;
      판정후재청취 = 계보?.판정후재청취 === true;
      if (!계보?.대상) {
        return {
          거절: 'CONTRACT_VIOLATION' as const, 칸: 'supersedes',
          문구: 'supersedes 는 그 제출물의 teacher 교정이어야 합니다',
        };
      }
      /* 🔴 사슬이 갈라지면 「원본당 최신 미폐기 행 하나」가 **둘**이 된다 — 소비자 쿼리는
       *   그 순간 어느 라벨이 정본인지 못 고르고, 두 라벨이 나란히 훈련·개인화로 흘러간다.
       *   c11 의 CHECK 는 자기 참조만 막는다(더 긴 갈래는 물리로 못 막는 자리라 여기가 진다).
       *   ▶ c11 권고: `unique (supersedes) where supersedes is not null` 로 물리에 못박으면
       *     이 검사는 잉여가 된다 — 그때까지는 이 줄이 유일한 방어선이다. */
      if (계보.이미대체됨) {
        return {
          거절: 'SUPERSEDE_CONFLICT' as const,
          문구: '그 판정은 이미 다른 재검수가 대신했습니다 — 최신 판정을 다시 열어 주세요',
        };
      }
    }

    /* 게이트 ④ — `reviewed_correction_id` 가 **그 제출물의** AI 행인가.
     *   다른 제출물의 교정을 가리키는 것은 트리거가 막지만, `teacher` 행을 평가 대상으로
     *   가리키는 것은 물리가 안 막는다(그러면 사람이 사람을 평가한 라벨이 된다). */
    if (!재료.ai행) {
      return {
        거절: 'GATE_NOT_MET' as const, 칸: 'reviewed_correction_id',
        문구: 'reviewed_correction_id 가 그 제출물의 AI 교정이 아닙니다',
      };
    }
    /* 게이트 ② — 갈래 둘. 문구를 가르는 것이 UX 의 절반이다: 「한 번도 안 열었다」와
     *   「옛날에 열었다」는 검수자가 할 일이 다른데, 한 문구로 뭉치면 재검수 중인 사람이
     *   무엇을 해야 하는지 알 수 없다(그 마찰의 처방은 언제나 「자백을 적어 보낸다」다). */
    if (!재료.마지막청취) {
      return {
        거절: 'GATE_NOT_MET' as const, 칸: 'audio',
        문구: '오디오를 연 기록이 없습니다 — 먼저 재생해 주세요',
      };
    }
    /* 🔴 여기가 2026-08-09 실측으로 드러난 구멍이다 — 612초 된 기록으로 재검수가 200 이었다.
     *   시간 상수는 안 건다(§5 🔑): 창은 서명 수명이 물리적으로 만든다. */
    if (재검수 && !판정후재청취) {
      return {
        거절: 'GATE_NOT_MET' as const, 칸: 'audio',
        문구: '마지막 판정 이후에 다시 듣지 않았습니다 — 한 번 더 재생해 주세요',
      };
    }

    /* 게이트 ① — 청취. ⚠ `문턱.재료` 는 행에 `stt_segments` 가 있을 때만 true 다.
     *   생산자는 섰지만(`functions/transcribe` · 08-09) 행은 합성 발화 2건뿐이라(08-11)
     *   옛 행 전부에서 여전히 false 고, 재료가 와도 30초 윈도우 해상도 문제가 남는다
     *   (`lib/검수확정.js` 머리말). 그 사실을 응답에 실어 화면·로그가 「게이트가 세다」로
     *   읽지 않게 한다 — 미측정을 통과로 두지 않는다. */
    const 문턱 = 청취문턱(재료.stt_segments);
    if (q.review_listened_ms < 문턱.ms) {
      return {
        거절: 'GATE_NOT_MET' as const, 칸: 'review_listened_ms',
        문구: `아직 충분히 듣지 않았습니다(${문턱.ms}ms 필요 · 들은 ${q.review_listened_ms}ms)`,
      };
    }

    const verdict = 판정({
      검증전사: q.transcript_verified,
      ai교정문: 재료.ai교정문,
      최종교정문: q.corrected_text,
    });

    const [행] = await tx`
      insert into engine.corrections (
        submission_id, reviewed_correction_id, actor_kind, corrected_text, error_tags,
        explanation, reviewer, verdict, reviewer_confidence, l1_source_phrase,
        rubric_scores, review_listened_ms, supersedes, promotion_intent,
        transcript_at_review, schema_ver
      ) values (
        ${q.submission_id}::uuid, ${q.reviewed_correction_id}::uuid, 'teacher'::engine.actor_kind,
        ${q.corrected_text}, ${q.error_tags},
        ${q.explanation}, ${staff_id}, ${verdict}, ${q.reviewer_confidence}, ${q.l1_source_phrase},
        ${q.rubric_scores as never}, ${q.review_listened_ms}, ${q.supersedes}, ${q.promote},
        ${q.transcript_verified}, ${ver}
      ) returning correction_id`;

    /* 제출물의 검증 전사는 **최신 판정에서 파생**한다(발주 §3 UX ③ 🔴). 계보는 teacher 행의
     * `transcript_at_review` 가 들고 있으므로 여기를 덮어도 과거 판정의 근거는 안 사라진다.
     * 🔑 기계 전사(`transcript`)는 안 건드린다 — 트리거가 그것을 막고, 그게 이 열의 존재 이유다. */
    await tx`
      update engine.submissions
         set transcript_verified = ${q.transcript_verified}
       where submission_id = ${q.submission_id}::uuid`;

    await tx`
      update engine.pipeline_jobs
         set status = 'verified', updated_at = now()
       where submission_id = ${q.submission_id}::uuid`;

    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'review.approve', array[${q.submission_id}::uuid])`;

    /* 저작 신뢰(철학 Ⅱ-9) — **행을 안 고친다.** `promotion_intent` 에는 사람이 누른 것이 그대로
     *   들어간다(위 insert). 기계가 그것을 false 로 덮으면 「사람이 누르려 했다」가 증발하고,
     *   그건 이 함수 머리말이 이미 금지한 형태다(§5 원자성 — 의사는 잃지 않는다).
     * 🔑 덮지 않아도 방어가 서는 이유 = **판정이 순수하고 재료가 행에 남아 소급 재현된다.**
     *   훈련 승격(Core §6 경로 B)이 서는 날 그 통로가 같은 함수로 다시 재고 «덩어리» 행을
     *   분모에서 뺀다(규격 = `docs/저작신뢰_설계_v1.md` §4 · 회귀가 그 게이트를 잠근다).
     *   그때까지 이 응답이 검수자에게 **그 자리에서** 알린다 — 재검수 통로가 살아 있어
     *   사람이 되돌릴 수 있다. */
    const 저작 = 저작판정({
      compose_meta: 재료.compose_meta,
      본문길이: 글자수(재료.body_original as string | null),
    });
    return {
      correction_id: 행.correction_id as string,
      verdict,
      promotion_intent: q.promote,
      listen_gate: { required_ms: 문턱.ms, measured: 문턱.재료 },
      authorship: { grade: 저작.등급, burst_ratio: 저작.덩어리비율 },
      /* 사람이 승격을 눌렀는데 «덩어리»인 그 조합에서만 말한다 — 아닌 날 띄우면 소음이고,
       * 소음이 되면 정작 그날 안 읽힌다(감시 늑대소년 · 심문 T12 와 같은 축). */
      ...(q.promote && 승격보류인가(저작) ? { promotion_notice: 보류문구 } : {}),
    };
  });

  if ('거절' in 결과) return 거절응답(결과, ver);
  return 봉투(200, { ok: true, ...결과 }, ver);
}

/** 거절 봉투 — 상태는 `거절상태` 하나에서 온다(승인·폐기가 각자 정하지 않는다). */
function 거절응답(결과: { 거절: 거절코드; 문구: string; 칸?: string }, ver: string) {
  return 실패(거절상태[결과.거절], {
    code: 결과.거절,
    message: 결과.문구,
    /* 재시도가 뜻이 있는 것은 서버 쪽 사정뿐이다 — 게이트·계보 거절은 다시 눌러도 같다. */
    retryable: 결과.거절 === 'INTERNAL',
    ...(결과.칸 ? { field: 결과.칸 } : {}),
  }, ver);
}

/** §5-2 `POST /v1/review/discard` — 소프트 폐기. 파일은 **남긴다**(노이즈도 강건성 재료).
 *  ⚠ 철회(`revoked`)는 다른 사건이고 파일을 지운다(L0 §9-3) — 이 경로가 아니다. */
async function 폐기(본문: unknown, staff_id: string, ver: string) {
  const 검증 = 폐기요청(본문);
  if (검증.이유) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: 검증.이유, ...(검증.칸 ? { field: 검증.칸 } : {}),
    }, ver);
  }
  const q = 검증.값 as unknown as { submission_id: string; reason: string };

  const 결과 = await sql.begin(async (tx) => {
    const [job] = await tx`
      select status::text as status from engine.pipeline_jobs
       where submission_id = ${q.submission_id}::uuid
       for update`;
    if (!job) return { 거절: 'NOT_FOUND' as const, 문구: '없는 제출물입니다' };

    const [소속] = await tx`
      select exists (select 1 from engine.review_queue v
                      where v.submission_id = ${q.submission_id}::uuid) as 큐안`;
    if (!소속?.큐안) return { 거절: 'NOT_FOUND' as const, 문구: '지금 큐에 없는 항목입니다' };

    /* 🔴 **어휘를 코드에 안 든다 — DB CHECK 에서 읽는다**(`lib/검수확정.js` 머리말).
     *   이름을 접두로 찾는 이유: 판이 올라가면 제약 이름이 `_c11` 로 통째 바뀌는 것이
     *   이 저장소의 관행이고, 이름을 박아 두면 그 날 **전 폐기가 조용히 500** 이 된다. */
    const [제약] = await tx`
      select pg_get_constraintdef(oid) as def from pg_constraint
       where connamespace = to_regnamespace('engine')
         and conname like 'pipeline_jobs_discard_reason_c%'
       limit 1`;
    const 어휘 = 폐기어휘(제약?.def);
    if (어휘.length === 0) {
      /* 조각이 아직 안 부어진 DB 다. 그 상태에서 폐기를 통과시키면 사유 없는 폐기가 남고
       * 그건 「왜 뺐는지 모르는 행」이라 나중에 오염 데이터와 구별할 수 없다 — 거절이 맞다. */
      console.error('[review/discard] 폐기 사유 CHECK 를 못 읽었다 — 20260809090000 미적용?');
      return { 거절: 'INTERNAL' as const, 문구: '폐기 사유 목록을 읽지 못했습니다(서버 판 확인 필요)' };
    }
    if (!어휘.includes(q.reason)) {
      return {
        거절: 'CONTRACT_VIOLATION' as const, 칸: 'reason',
        문구: `폐기 사유는 다음 중 하나입니다: ${어휘.join(' · ')}`,
      };
    }

    await tx`
      update engine.pipeline_jobs
         set status = 'discarded', discard_reason = ${q.reason}, updated_at = now()
       where submission_id = ${q.submission_id}::uuid`;

    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'review.discard', array[${q.submission_id}::uuid])`;

    return { discarded: true, reason: q.reason };
  });

  if ('거절' in 결과) return 거절응답(결과, ver);
  return 봉투(200, { ok: true, ...결과 }, ver);
}
