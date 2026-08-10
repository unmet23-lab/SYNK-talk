/* `teach` — 강사(직원) 통로. 정본 = `docs/M2_라벨회로_설계.md`.
 *
 * ■ 이 자리가 무엇을 닫나
 *   Glide 폐기로 죽는 **유일한 라벨 입구**(AS `엔진_수집.js goldenSampleWeekly_`)의 talk 이관이다.
 *   강사가 폰에서 매주 무작위 5건의 AI 첨삭을 판정하면 그 행이 그대로 모델·프롬프트 채점표와
 *   파인튜닝 쌍의 재료가 된다 — 사람 손은 **확정 한 번**뿐이다.
 *   🔴 라벨은 소급이 비싸다: 지금 안 모으면 그 주의 판정은 두 번 다시 못 만든다.
 *
 * ■ 🔴 `review` 문을 넓히지 않고 **새 문**을 세운 이유 (설계 §2)
 *   `review` 의 `검수역할` 에 teacher 를 넣으면 강사가 골든셋 **승인·폐기 권한**까지 얻고,
 *   approve 는 `transcript_verified` 도 갱신하므로 **전사 덮어쓰기**까지 열린다. 실왕복
 *   `검수왕복시험:230` 이 teacher→403 을 핀으로 박았다 — 그 핀을 뒤집는 설계는 내지 않는다.
 *   역할 경계가 곧 축의 경계다: 검수자 = 전사 축(무엇을 말했나) · 강사 = 교정 축(교정이
 *   교육적으로 맞나). 같은 제출물에 두 행이 다 서는 것이 **정상이다**.
 *
 * ■ 🔴 골든 소속의 정본은 **감사 원장**이다 (설계 §3 · 반박 C1)
 *   approve 행도 `actor_kind='teacher'`·`reviewed_correction_id`·`verdict` 를 싣고, 오늘 두 문을
 *   지나는 사람은 **원장 한 명**이라(양쪽 허용 목록에 `director`) 역할 조인으로는 두 행을
 *   못 가른다. 그래서 judge 는 골든 행 insert 와 **같은 트랜잭션**에 `teach.gold.judge` 감사를
 *   남기고, 골든 판별·완료 표시·중복 검사·N12 조인이 **전부 그 조인 하나에서** 나온다
 *   (같은 판정을 두 곳에 적으면 갈라진다). 감사를 판정 근거로 쓰는 선례 = 청취 게이트 ②.
 *
 * ■ 🔴 표본은 저장하지 않고 **재현**한다 (설계 §4 · `lib/골든표본.js`)
 *   소비자 둘(이 문 · `tools/성적표.js`)이 같은 lib 를 쓴다. 각자 뽑으면 다른 5건이 나오고
 *   완료율·승률의 분모와 분자가 다른 표본을 센다. 풀은 **지난 완결 UTC 주**라 주중에 안 변한다.
 *
 * ■ 🔴 「어느 주의 표본인가」는 그 행의 `created_at` 이 정한다
 *   judge 가 「이번 주」를 묻지 않는 이유: 주말에 큐를 열고 월요일에 마치면 「이번 주」가
 *   갈려 **판정하던 5건이 통째로 사라진다**. 대상 행이 속한 주를 역산해 그 주의 표본과
 *   대조하면, 지난 주 표본은 다음 주에도 그대로 판정된다(늦게 끝내는 것을 막을 이유가 없다).
 *
 * ■ 게이트 상수 0 (설계 §3)
 *   청취·시간 게이트를 걸지 않는다 — **텍스트 판정**이다. 도장찍기(전건 ② 원클릭)는 막지 않고
 *   **먼저 센다**: verdict 분포와 사유 기입률 자체가 감사 재료다(관찰태그 §2 선례).
 *
 * ■ 접근층
 *   `review` 처럼 `SUPABASE_DB_URL` 직결이라 **RLS 를 우회한다** — 방어선은 RLS 가 아니라
 *   문(역할 검사)+감사다. 그래서 teacher SELECT RLS 신설이 불요다(설계 §1-③).
 *
 * ■ ⏳ 관찰 경로(`/v1/teach/observe`)는 **여기 없다**
 *   `관찰태그_자동화_설계.md` 가 정본이고 선행이 유호님 계약 판정(`observation.noted`+물리칸 2
 *   +RLS 개정)이다. 골든 경로는 그 판정과 독립이라 먼저 선다 — 판정 전에 짓지 않는다.
 */
import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';
import 확정모듈 from './검수확정.mjs';
import 표본모듈 from './골든표본.mjs';
import 동의모듈 from './동의게이트.mjs';

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

const { 발급시각, 살아있는직원 } = 토큰모듈 as {
  발급시각: (req: Request) => number | null;
  살아있는직원: (질의: typeof sql, 주체: string, iat: number | null) => ReturnType<typeof sql>;
};

type 요청검증 = { 값: Record<string, never> | null; 이유: string | null; 칸: string | null };
const { 골든판정요청, 골든정합 } = 확정모듈 as {
  골든판정요청: (본문: unknown) => 요청검증;
  골든정합: (셋: {
    verdict: string; corrected_text: unknown; ai교정문: unknown; 전사: unknown;
  }) => string | null;
};

type 풀행 = { correction_id: string };
const { 표본, 지난주키, 주범위, 키, iso주, 주당건수 } = 표본모듈 as {
  표본: (풀: 풀행[], 주키: string, n?: number) => 풀행[] | null;
  지난주키: (지금?: Date) => string;
  주범위: (주키: string) => { 시작: string; 끝: string } | null;
  키: (연: number, 주: number) => string;
  iso주: (when: Date) => { 연: number; 주: number };
  주당건수: number;
};

const { 지금유효, 그때유효, 거절몸통 } = 동의모듈 as {
  지금유효: (질의: unknown, learner_id: string) => Promise<Array<{ consent_id: string }>>;
  그때유효: (질의: unknown, learner_id: string, occurred_at: string) => Promise<Array<{ consent_id: string }>>;
  거절몸통: { code: string; field: string; retryable: boolean };
};

const 계약판 = /^c(\d+)$/;

/* 🔑 **허용 목록**이다(차단 목록이 아니다 — 못 적은 역할이 새는 방향은 언제나 「통과」다).
 *   `director` 가 있는 이유는 `review` 와 같다: 오늘 이 통로를 쓸 사람이 원장 본인뿐이다.
 *   ⚠ 그래서 **역할로는 두 문을 못 가른다** — 골든 소속은 감사가 진다(머리말 🔴). */
const 강사역할 = ['teacher', 'director'];

type 오류 = { code: string; message: string; retryable: boolean; field?: string };

/* 코드→상태를 **한 자리에 리터럴로**(`review` 와 같은 사유 — 두 경로가 각자 삼항으로 정하면
 * 같은 `else` 가 한쪽은 409, 한쪽은 400 이 된다). */
const 거절상태 = {
  NOT_FOUND: 404,
  CONTRACT_VIOLATION: 400,
  NOT_IN_SAMPLE: 409,
  ALREADY_JUDGED: 409,
  VERDICT_TEXT_MISMATCH: 409,
  CONSENT_MISSING: 403,
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

/** 카드 상태 — 화면이 그리는 세 모양. `blocked` 는 **숨기지 않는다**(설계 §4). */
const 상태 = { 열림: 'open', 판정됨: 'judged', 막힘: 'blocked' } as const;

Deno.serve(async (req: Request) => {
  const 선언 = req.headers.get('X-Contract-Ver') ?? '';
  if (!선언) return 실패(400, { code: 'CONTRACT_VER_MISSING', message: 'X-Contract-Ver 헤더가 없습니다', retryable: false }, 선언);
  const 선언판 = 계약판.exec(선언);
  if (!선언판) {
    return 실패(426, { code: 'CONTRACT_VER_UNSUPPORTED', message: `계약판 형식이 아닙니다: ${선언}`, retryable: false }, 선언);
  }

  /* 🔴 **뒷 두 마디**로 가른다(`review` 는 한 마디였다 — 여기는 경로가 `gold/queue` 라 두 마디다).
   *   마지막 마디만 보면 `/v1/teach/아무거나/queue` 가 전부 큐 조회로 동작하고, 관찰 경로가
   *   서는 날 옛 오타 경로가 **이미 돌던 것**이 된다. 새는 방향이 「통과」인 자리는 좁게 연다. */
  const url = new URL(req.url);
  const 마디 = url.pathname.replace(/\/+$/, '').split('/');
  const 경로 = 마디.slice(-2).join('/');
  const 아는경로 = ['gold/queue', 'gold/judge'];
  if (!아는경로.includes(경로)) {
    return 실패(404, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: '없는 경로입니다 — GET /v1/teach/gold/queue · POST /v1/teach/gold/judge',
    }, 선언);
  }
  const 기대메서드 = 경로 === 'gold/queue' ? 'GET' : 'POST';
  if (req.method !== 기대메서드) {
    return 실패(405, { code: 'CONTRACT_VIOLATION', message: `${기대메서드} 만 받는다`, retryable: false }, 선언);
  }

  const 주체 = 토큰주체(req);
  if (!주체) return 실패(401, { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false }, 선언);

  /* 직원 확정과 DB 계약판을 한 번에(왕복 1회) — `review` §1 사슬 그대로.
   * 🔴 `service_role` 은 RLS 를 우회하므로 이 사슬이 유일한 방어선이다. */
  const [행] = await sql`
    select (select staff_id from engine.staff
             where ${살아있는직원(sql, 주체, 발급시각(req))}
               and role = any(${강사역할}::text[])) as staff_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const db판 = 계약판.exec(String(행?.최신조각 ?? '').match(/_(c\d+)\.sql$/)?.[1] ?? '');
  if (!db판) {
    console.error('[teach] DB 계약판을 못 읽었다', 행?.최신조각);
    return 실패(500, { code: 'INTERNAL', message: '서버 설정 오류입니다', retryable: true }, 선언);
  }
  const ver = db판[0];

  if (Number(선언판[1]) > Number(db판[1])) {
    return 실패(426, {
      code: 'CONTRACT_VER_UNSUPPORTED', retryable: false,
      message: `서버가 아직 ${선언} 을 모릅니다(현재 ${ver}) — 잠시 뒤 다시 시도해 주세요`,
    }, ver);
  }

  /* 🔑 「직원이 아니다」와 「폐기됐다」를 **같은 코드**로 묶는다 — 가르면 응답 자체가
   *   「그 계정은 있다」를 말한다. 역할이 `inspector` 인 사람도 여기서 걸린다. */
  if (!행?.staff_id) {
    return 실패(403, { code: 'NOT_STAFF', message: '강사 권한이 없습니다', retryable: false }, ver);
  }
  const staff_id: string = 행.staff_id;

  try {
    if (경로 === 'gold/queue') return await 큐읽기(url, staff_id, ver);
    const 본문 = await 본문읽기(req);
    if (본문 === undefined) {
      return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'JSON 이 아닙니다', retryable: false }, ver);
    }
    return await 판정하기(본문, staff_id, ver);
  } catch (e) {
    console.error(`[teach/${경로}] 실패`, String((e as Error)?.message ?? e));
    return 실패(500, { code: 'INTERNAL', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});

/** 본문 파서 — 통로를 하나로 둔다(`review` 와 같은 사유: 경로마다 try/catch 를 쓰면 새 경로가
 *  그것을 안 두고 500 이 된다). */
async function 본문읽기(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch (_) {
    return undefined;
  }
}

/* ── 풀 ─────────────────────────────────────────────────────────────── */

/**
 * 그 주의 **풀** — `correction_id` 만 읽는다.
 *
 * 🔑 상세를 여기서 안 읽는 이유: 풀은 주당 수백~수천 행이 될 수 있는데 화면에 서는 것은 5건이다.
 *   전량을 끌어와 5건만 쓰면 그 왕복이 통째로 낭비고, 그 낭비는 학생이 늘수록 커진다.
 *
 * 🔴 앞 두 줄이 `lib/골든표본.풀술어` 와 **글자까지 같아야 한다**(그래서 순서가 이렇다 —
 *   시각 경계가 그 사이에 끼면 텍스트가 끊겨 대조가 불가능해진다). 소비자가 두 모양이라
 *   (여기는 태그 질의 · `tools/성적표.js` 는 문자열 SQL) 사본을 피할 수 없고, 없앨 수 없는
 *   사본은 기계에 물린다 — `tests/골든표본.test.js` 가 두 소스를 그 텍스트로 대조한다.
 *   그 둘째 줄이 **「학생 목록에 서는 행」**이다(`functions/corrections:167` 의 빈 카드 필터와
 *   같은 식 · AS 원형 「노출분만 평가」의 talk 번역). 갈라지면 학생이 못 본 교정을 강사가
 *   판정하게 되고, 그 라벨은 「학생에게 먹혔나」와 짝이 안 맞는다.
 *   🚫 `sql.unsafe` 로 술어를 끼워 넣지 않는다 — 런타임에서 깨지면 수집이 멈춘다.
 */
function 풀질의(tx: unknown, 범위: { 시작: string; 끝: string }) {
  const q = tx as typeof sql;
  return q`
    select c.correction_id
      from engine.corrections c
     where c.actor_kind = 'ai'
       and (c.corrected_text is not null or array_length(c.error_tags, 1) is not null)
       and c.created_at >= ${범위.시작}::timestamptz
       and c.created_at <  ${범위.끝}::timestamptz
     order by c.correction_id`;
}

/* ── GET /v1/teach/gold/queue ────────────────────────────────────────── */

async function 큐읽기(url: URL, staff_id: string, ver: string) {
  /* 주는 **서버가 정한다** — 파라미터로 받으면 강사가 임의의 주를 열어 표본을 「골라」 볼 수
   * 있고, 그 순간 무작위가 깨진다(설계 §4 의 심장). 화면은 어느 주인지 응답으로 안다. */
  const 주키 = 지난주키();
  const 범위 = 주범위(주키)!;

  const { 항목들, 풀크기 } = await sql.begin(async (tx) => {
    const 풀 = (await 풀질의(tx, 범위)) as unknown as 풀행[];
    const 뽑힘 = 표본(풀, 주키) ?? [];
    const ids = 뽑힘.map((r) => r.correction_id);

    /* ⚠ **0건도 감사 1행 남긴다**(`review` §2 와 같은 판정) — 「아무것도 안 왔다」도 읽은
     *   것이고, 빈 응답에만 장부가 없으면 조회 횟수의 분모가 조용히 달라진다. */
    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.gold.queue', ${ids}::uuid[])`;

    if (!ids.length) return { 항목들: [], 풀크기: 풀.length };

    const 상세 = await tx`
      select c.correction_id, c.submission_id,
             c.corrected_text as ai_corrected_text,
             c.error_tags     as ai_error_tags,
             c.explanation    as ai_explanation,
             coalesce(s.transcript_verified, s.transcript) as transcript,
             (s.transcript_verified is not null) as transcript_confirmed,
             e.learner_id, e.occurred_at,
             /* 골든 소속의 정본 = 감사 원장(머리말 🔴). 「이미 판정됨」도 여기서 나온다 —
              * «corrections» 를 뒤지면 검수 확정 행과 구분이 안 된다.
              * ⚠ 이 주석은 템플릿 리터럴 «안»이다 — 백틱을 쓰면 SQL 이 거기서 끊긴다
              *   (review:460 이 남긴 경고 · 실제로 한 번 밟았다). */
             exists (select 1 from engine.staff_access_log l
                      where l.action = 'teach.gold.judge'
                        and c.correction_id = any(l.target_ids)) as 이미판정됨
        from engine.corrections c
        join engine.submissions s on s.submission_id = c.submission_id
        join engine.learning_events e on e.event_id = s.event_id
       where c.correction_id = any(${ids}::uuid[])`;

    /* 🔴 동의는 **표본이 아니라 판정에 건다**(설계 §4 · 반박 C3). 추첨은 이미 불변 풀에서
     *   끝났으므로 철회 한 건이 남의 표본을 재배열하지 못한다 — 여기서는 카드의 «상태»만 바꾼다.
     *   두 뜻을 다 건다: `그때유효`(발화 시점) ∧ `지금유효`(지금) — 사후 동의는 과거를 유효하게
     *   만들지 못한다. 🚫 세 번째 뜻을 만들지 않는다. */
    const 상세맵 = new Map(상세.map((r: Record<string, unknown>) => [String(r.correction_id), r]));
    const 항목들 = [];
    for (const id of ids) {
      const r = 상세맵.get(id);
      if (!r) continue; // 풀에는 있었는데 상세가 없다 = 조인 대상이 사라진 것. 지어내지 않는다.
      const [그때] = await 그때유효(tx, String(r.learner_id), new Date(r.occurred_at as string).toISOString());
      const [지금] = await 지금유효(tx, String(r.learner_id));
      const 막힘 = !그때 || !지금;

      항목들.push(막힘
        /* 막힌 카드에는 **전사·교정 내용을 싣지 않는다**(설계 §4). 숨기지도 않는다 —
         * 숨기면 「이번 주 끝」이 거짓이 되고 강사는 4건만 보고도 다 했다고 믿는다. */
        ? { correction_id: id, submission_id: r.submission_id, status: 상태.막힘 }
        : {
          correction_id: id,
          submission_id: r.submission_id,
          transcript: r.transcript,
          transcript_confirmed: r.transcript_confirmed,
          ai_corrected_text: r.ai_corrected_text,
          ai_error_tags: r.ai_error_tags,
          ai_explanation: r.ai_explanation,
          /* 🚫 `model`·`prompt_ver` 는 **안 싣는다** — 판정 전에 어느 모델인지 보이면 강사의
           *   판정에 편향이 생기고, 그 편향은 N12 승률에 그대로 들어간다(성적표가 사후 조인한다). */
          status: r.이미판정됨 ? 상태.판정됨 : 상태.열림,
        });
    }
    return { 항목들, 풀크기: 풀.length };
  });

  const 남음 = 항목들.filter((it) => it.status === 상태.열림).length;
  return 봉투(200, {
    ok: true,
    week: 주키,
    /* 화면이 「남은 건수」를 상시 표시한다(P0 §2-3 ③ 선례) — 다 끝나면 「이번 주 끝」.
     * 분모를 같이 싣는 이유: 5건이 안 되는 주는 **풀이 작은 것**이지 화면이 빠뜨린 게 아니다. */
    remaining: 남음,
    sample_size: 주당건수,
    pool_size: 풀크기,
    data: 항목들,
  }, ver);
}

/* ── POST /v1/teach/gold/judge ───────────────────────────────────────── */

/** 거절 봉투 — 상태는 `거절상태` 하나에서 온다. */
function 거절응답(결과: { 거절: 거절코드; 문구: string; 칸?: string }, ver: string) {
  return 실패(거절상태[결과.거절], {
    code: 결과.거절,
    message: 결과.문구,
    /* 재시도가 뜻이 있는 것은 서버 쪽 사정뿐이다 — 표본·동의·정합 거절은 다시 눌러도 같다. */
    retryable: 결과.거절 === 'INTERNAL',
    ...(결과.칸 ? { field: 결과.칸 } : {}),
  }, ver);
}

/**
 * 판정 1건 = 골든 행 + 감사 1행이 **한 쓰기**에.
 *
 * 🔴 감사를 뒤로 미루면 그 사이 실패에 **소속이 증발**한다 — 골든 행은 남는데 그것이 골든인지
 *   검수 확정인지 아무도 못 가른다(역할 조인은 director 겹침으로 불가). 성적표가 그 행을
 *   조용히 빠뜨리거나 잘못 세고, 어느 쪽이든 증상이 없다.
 */
async function 판정하기(본문: unknown, staff_id: string, ver: string) {
  const 검증 = 골든판정요청(본문);
  if (검증.이유) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: 검증.이유, ...(검증.칸 ? { field: 검증.칸 } : {}),
    }, ver);
  }
  const q = 검증.값 as unknown as {
    reviewed_correction_id: string; verdict: string;
    corrected_text: string | null; error_tags: string[];
    l1_source_phrase: string | null; rubric_scores: unknown; verdict_reason: string | null;
  };

  const 결과 = await sql.begin(async (tx) => {
    /* ① **먼저 잠근다.** 같은 AI 행에 대한 동시 판정을 직렬화한다 — 두 번째 요청은 잠금이
     *   풀린 뒤 감사를 다시 읽어 「이미 판정됨」으로 떨어진다(중복 골든 행이 원리상 안 생긴다).
     *   ⚠ 검수 approve 는 `pipeline_jobs` 를 잠그는 **다른 장치**고 쓰는 행이 달라 서로 막을
     *     것이 없다 — 「선례」라 부르지 않는다(설계 §3). */
    const [ai] = await tx`
      select c.correction_id, c.submission_id, c.corrected_text, c.created_at,
             coalesce(s.transcript_verified, s.transcript) as 전사,
             e.learner_id, e.occurred_at
        from engine.corrections c
        join engine.submissions s on s.submission_id = c.submission_id
        join engine.learning_events e on e.event_id = s.event_id
       where c.correction_id = ${q.reviewed_correction_id}::uuid
         and c.actor_kind = 'ai'
       for update of c`;
    /* 🔑 「없다」와 「AI 행이 아니다」를 같은 코드로 묶는다 — 가르면 응답이 「그 행은 있다」를
     *   말한다. teacher 행을 평가 대상으로 가리키면 **사람이 사람을 평가한 라벨**이 된다. */
    if (!ai) {
      return { 거절: 'NOT_FOUND' as const, 문구: '평가할 AI 교정을 찾을 수 없습니다' };
    }

    /* ② **그 행이 속한 주의 표본인가** — 「이번 주」를 안 묻는 이유는 머리말 🔴.
     *   표본 밖의 행을 받으면 강사가 고르고 싶은 것만 판정할 수 있고, 그 순간 무작위가 깨져
     *   승률이 「AI 가 틀린 것만 모은」 반쪽 채점표가 된다. */
    const 속한주 = ((w) => 키(w.연, w.주))(iso주(new Date(ai.created_at as string)));
    const 범위 = 주범위(속한주)!;
    const 풀 = (await 풀질의(tx, 범위)) as unknown as 풀행[];
    const 뽑힘 = (표본(풀, 속한주) ?? []).map((r) => String(r.correction_id));
    if (!뽑힘.includes(String(ai.correction_id))) {
      return {
        거절: 'NOT_IN_SAMPLE' as const,
        문구: `${속한주} 주의 표본에 없는 항목입니다 — 큐에 있는 것만 판정할 수 있습니다`,
      };
    }

    /* ③ 이미 판정됨 — 소속과 같은 조인에서 나온다(같은 판정을 두 곳에 적지 않는다). */
    const [중복] = await tx`
      select exists (select 1 from engine.staff_access_log l
                      where l.action = 'teach.gold.judge'
                        and ${ai.correction_id}::uuid = any(l.target_ids)) as 있다`;
    if (중복?.있다) {
      return { 거절: 'ALREADY_JUDGED' as const, 문구: '이미 판정한 항목입니다' };
    }

    /* ④ 동의 두 뜻 — 큐가 `blocked` 로 그렸어도 여기서 **다시 잰다**(화면만 막으면 직접
     *   호출로 그대로 통과한다 · 게이트의 주체는 화면이 아니라 이 함수다). */
    const [그때] = await 그때유효(tx, String(ai.learner_id), new Date(ai.occurred_at as string).toISOString());
    const [지금] = await 지금유효(tx, String(ai.learner_id));
    if (!그때 || !지금) {
      return {
        거절: 'CONSENT_MISSING' as const, 칸: 거절몸통.field,
        문구: '이 학생의 동의가 유효하지 않아 판정할 수 없습니다',
      };
    }

    /* ⑤ 정합 — 순수 규칙은 `lib/검수확정.js` 한 곳에서 파생한다(설계 §3). */
    const 어긋남 = 골든정합({
      verdict: q.verdict,
      corrected_text: q.corrected_text,
      ai교정문: ai.corrected_text,
      전사: ai.전사,
    });
    if (어긋남) {
      return { 거절: 'VERDICT_TEXT_MISMATCH' as const, 칸: 'corrected_text', 문구: 어긋남 };
    }

    /* ⑥ 골든 행. 🔑 `transcript_at_review` 는 **서버가 채운다** — 강사가 무엇을 보고
     *   판정했는지가 행에 남아야 N12 가 전사 기반을 층화할 수 있다(설계 §5).
     *   🚫 `promotion_intent` 는 건드리지 않는다 — 승격은 검수 축의 판단이고 기본값 false 다. */
    const [골든] = await tx`
      insert into engine.corrections (
        submission_id, reviewed_correction_id, actor_kind, corrected_text, error_tags,
        reviewer, verdict, verdict_reason, l1_source_phrase, rubric_scores,
        transcript_at_review, schema_ver
      ) values (
        ${ai.submission_id}::uuid, ${ai.correction_id}::uuid, 'teacher'::engine.actor_kind,
        ${q.corrected_text}, ${q.error_tags},
        ${staff_id}, ${q.verdict}, ${q.verdict_reason}, ${q.l1_source_phrase},
        ${q.rubric_scores as never},
        ${ai.전사}, ${ver}
      ) returning correction_id`;

    /* ⑦ 감사 = **소속의 정본**. `target_ids` 에 둘을 담는 것이 설계다:
     *   [AI 행] 으로 「이미 판정됨」과 N12 조인이 서고, [골든 행] 으로 그 teacher 행이
     *   검수 확정이 아니라 골든임을 가른다. 순서도 계약이다(0=평가 대상 · 1=골든 행). */
    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.gold.judge',
              array[${ai.correction_id}::uuid, ${골든.correction_id}::uuid])`;

    return {
      correction_id: 골든.correction_id as string,
      reviewed_correction_id: String(ai.correction_id),
      verdict: q.verdict,
      week: 속한주,
    };
  });

  if ('거절' in 결과) return 거절응답(결과, ver);
  return 봉투(200, { ok: true, ...결과 }, ver);
}
