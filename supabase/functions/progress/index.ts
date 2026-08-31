/* GET /v1/progress — 어제의 나와 비교 (C0 §4-3 ③).
 *
 * ■ 이 자리가 무엇을 닫나
 *   S1 조회 3종의 **마지막 칸**이다(①`tasks` ②`corrections` ③여기). C0 §4-3 이 「이 셋 말고는
 *   S1 에서 열지 않는다」고 못박았으니, 이걸로 화면이 읽을 서버 자리가 전부 선다.
 *
 * ■ 왜 랭킹이 아니라 「어제의 나」인가 (P0 §2-1 · S1-11)
 *   타 학생 값·점수·등수를 담지 않는다. 담는 순간 그건 다른 제품이고, P0 가 금지한 것이다.
 *   🔑 S1-3(교정 재발화)과 이 화면은 **한 데이터의 양면**이다 — 수집으로는 3점 종단 라벨이고
 *   학생에게는 동기 부여 화면이다. 지표를 위해 따로 만든 화면이 아니다.
 *
 * ■ 🔴 「제출 수」는 반드시 `event_type` 으로 거른다
 *   `submissions` 표에는 배치가 쓴 `task.assigned` 행이 산다(P0 §6-1). 그래서 이 엔드포인트는
 *   `submissions` 를 세지 않고 **`learning_events` 를** 센다. 안 걸면 배정 1건이 제출 1건으로
 *   세어져 **첫날부터 「어제의 나」가 거짓말**을 한다(C0 §4-3 ① ⚠ 가 이 자리를 지목해 뒀다).
 *
 * ■ 세 숫자가 각각 어디서 오나 (계약 c8)
 *   · 제출 수     = `submission.created` 건수
 *   · 재시도 수   = 그중 `payload.attempt_no >= 2` — **같은 과제를 다시 말한 것**(S1-7: 재시도는
 *                   새 event_type 이 아니라 attempt 증가로 남는다)
 *   · 교정 재발화 = 그중 `retry_of_event_id` 가 달린 것 — **교정을 받고 다시 낸 고리**(c5).
 *                   지금 설계에서 **결과 변수는 이것 하나뿐**이라, 이 칸이 비면 엔진은 상관만
 *                   배우고 처방을 못 배운다(L0 §9-2).
 *   ⚠ 앞의 둘은 같은 축이 아니다 — 재시도는 한 과제 안의 반복이고, 교정 재발화는 날을 건넌
 *   학습 고리다. 한 칸으로 합치면 「연습을 많이 했다」와 「교정이 먹혔다」가 섞인다.
 *
 * ■ 빈 상태는 오류가 아니다 (C0 §4-3 공통)
 *   `data: []` + **200** = 「오늘이 첫날이라 비교 대상이 없다」. 404 를 주면 앱이 오류 화면을
 *   띄우고, 그건 첫날 학생 전원에게 「고장」으로 보인다. 화면은 빈 배열을 받으면 **그 칸 자체를
 *   안 띄운다**(빈 카드 금지 — corrections 와 같은 규칙).
 *
 * ■ 읽기는 사건을 만들지 않는다
 *   S1-11 은 **조회 전용 · 사건 없음**이다(P0 §10-⑧: 열람 기록이 필요해지면 그때 계약 개정).
 */
import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';
import 과제모듈 from './오늘과제.mjs';
import 계약판모듈 from './계약판.mjs';
import 성향확인모듈 from './성향확인.mjs';
import 목표확인모듈 from './목표확인.mjs';
import 상태모듈 from './학습자상태.mjs';
import CORS모듈 from './CORS.mjs';

const { 예비응답 } = CORS모듈 as {
  예비응답: (req: Request, 메서드?: string) => Response | null;
  머리: () => Record<string, string>;
};

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };
const { 몽골날짜, 시간대 } = 과제모듈 as { 몽골날짜: (때?: Date) => string; 시간대: string };
/* Ⅲ⑥ — 오늘 보여줄 성향 확인 하나. 판정의 정본은 lib 하나(서버·앱·회귀가 같은 함수를 본다).
 * 리듬 «추정» 자체는 학습자상태() 그대로다 — 배정↔제출 구간 잇기를 SQL 로 다시 적으면 두 벌이다. */
const { 확인카드, 부정키 } = 성향확인모듈 as {
  확인카드: (리듬: unknown, 이력: unknown, 기준시각: string, 추정판: string) => Record<string, unknown> | null;
  부정키: (축: string, 키: string) => string;
};
/* c14 교실 수집 ② — 오늘 밤 목표 카드 하나. 판정의 정본은 lib 하나(성향확인과 같은 규율). */
const { 목표카드 } = 목표확인모듈 as {
  목표카드: (이력: { 오늘답함: boolean }, 오늘: string) => Record<string, unknown> | null;
};
const { 학습자상태 } = 상태모듈 as {
  학습자상태: (행들: unknown[], 옵션: Record<string, unknown>) =>
    { estimator_version: string; 축: { 리듬: unknown } };
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 「누구인가」 다음은 「아직 살아 있는가」 — 정본은 `lib/토큰.js` 하나다(절단문서 ②-15).
 * `sql` 뒤에서 꺼낸다: 조각의 타입이 이 클라이언트에 매여 있다. */
const { 발급시각, 살아있는학생 } = 토큰모듈 as {
  발급시각: (req: Request) => number | null;
  살아있는학생: (질의: typeof sql, 주체: string, iat: number | null) => ReturnType<typeof sql>;
};

const { 판번호, 행들에서판, 앞선판인가 } = 계약판모듈 as {
  판번호: (판: unknown) => number | null;
  행들에서판: (행들: unknown) => string | null;
  앞선판인가: (앞: unknown, 뒤: unknown) => boolean;
};

type 오류 = { code: string; message: string; retryable: boolean; field?: string };

function 봉투(status: number, body: Record<string, unknown>, ver: string) {
  return new Response(JSON.stringify({ contract_ver: ver, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS모듈.머리() },
  });
}
const 실패 = (status: number, e: 오류, ver: string) => 봉투(status, { ok: false, error: e }, ver);

Deno.serve(async (req: Request) => {
  /* 🔴 preflight 는 **어떤 검사보다 앞**이다 — 커스텀 헤더를 안 싣고 오므로 계약판 검문에
   걸려 죽는다(08-27 실측: 그 400 은 게이트웨이가 아니라 우리 코드가 냈다 · `lib/CORS.js`). */
  const 예비 = 예비응답(req);
  if (예비) return 예비;
  const 선언 = req.headers.get('X-Contract-Ver') ?? '';
  if (!선언) return 실패(400, { code: 'CONTRACT_VER_MISSING', message: 'X-Contract-Ver 헤더가 없습니다', retryable: false }, 선언);
  if (판번호(선언) === null) {
    return 실패(426, { code: 'CONTRACT_VER_UNSUPPORTED', message: `계약판 형식이 아닙니다: ${선언}`, retryable: false }, 선언);
  }
  if (req.method !== 'GET') return 실패(405, { code: 'CONTRACT_VIOLATION', message: 'GET 만 받는다', retryable: false }, 선언);

  /* 뒷마디를 본다 — `tasks`·`corrections` 와 같은 이유다. 안 보면 `/progress/아무거나` 가 전부
   * 이 조회로 동작하고, 나중에 형제 경로를 내는 날 옛 오타 경로가 **이미 돌던 것**이 된다. */
  const url = new URL(req.url);
  if (!url.pathname.replace(/\/+$/, '').endsWith('/progress')) {
    return 실패(404, { code: 'CONTRACT_VIOLATION', message: '없는 경로입니다 — GET /v1/progress', retryable: false }, 선언);
  }

  const 주체 = 토큰주체(req);
  if (!주체) return 실패(401, { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false }, 선언);

  // 학생 확정과 DB 계약판을 한 번에 읽는다(왕복 1회) — 판은 **DB 에게 묻는다**(손 상수 금지).
  const [행] = await sql`
    select (select learner_id from engine.learners where ${살아있는학생(sql, 주체, 발급시각(req))}) as learner_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const ver = 행들에서판(행);
  if (!ver) {
    console.error('[progress] DB 계약판을 못 읽었다', 행?.최신조각);
    return 실패(500, { code: 'SERVER_ERROR', message: '서버 설정 오류입니다', retryable: true }, 선언);
  }

  if (앞선판인가(선언, ver)) {
    return 실패(426, {
      code: 'CONTRACT_VER_UNSUPPORTED', retryable: false,
      message: `서버가 아직 ${선언} 을 모릅니다(현재 ${ver}) — 잠시 뒤 다시 시도해 주세요`,
    }, ver);
  }

  // 유효한 JWT 여도 학생 행이 없으면 학생이 아니다(직원·서비스 토큰).
  if (!행?.learner_id) {
    return 실패(401, { code: 'AUTH_REQUIRED', message: '학생 계정이 아닙니다', retryable: false }, ver);
  }

  /* 🔴 오늘·어제는 **서버가 정한다** — 쿼리로 안 받는다(C0 §4-3 ③). 기기 시계를 믿으면 시계를
   *   돌린 학생이 자기 비교 대상을 고르게 된다. 어제는 JS 가 아니라 **Postgres 가 빼게 한다** —
   *   달 경계·윤년을 두 곳에서 각자 계산하면 그 둘이 갈리는 날이 반드시 온다. */
  const 오늘 = 몽골날짜();

  try {
    /* 🔑 **자기 것만** — 학생은 토큰에서 왔고 쿼리로 지정할 수 없다(C0 §4-3 공통).
     *   `service_role` 은 RLS 를 우회하므로 이 `where` 가 유일한 방어선이다.
     *
     * 날짜 변환·「제출인가」·「재시도인가」를 **안쪽에서 한 번만** 정하고 바깥에서 세기만 한다 —
     * 같은 판정을 filter 마다 되풀이하면 그중 하나만 고치는 날 숫자들이 조용히 갈라진다.
     *
     * ⚠ `attempt_no` 는 payload(자유 JSON)라 숫자가 아닐 수 있다. 바로 `::int` 로 캐스팅하면
     *   행 하나가 **조회 전체를 500** 으로 만들고, 5xx 는 `retryable` 이라 앱이 무한 재시도한다.
     *   그래서 숫자꼴일 때만 읽고 아니면 1(첫 시도)로 본다 — 모르는 값을 재시도로 세지 않는다. */
    const [값] = await sql`
      select
        min(x.occurred_at) is null
          or (min(x.occurred_at) at time zone ${시간대})::date >= ${오늘}::date as 첫날인가,
        count(*) filter (where x.제출 and x.날 = ${오늘}::date)                        as 오늘_제출,
        count(*) filter (where x.제출 and x.재시도 and x.날 = ${오늘}::date)            as 오늘_재시도,
        count(*) filter (where x.제출 and x.교정재발화 and x.날 = ${오늘}::date)        as 오늘_교정재발화,
        count(*) filter (where x.제출 and x.날 = ${오늘}::date - 1)                    as 어제_제출,
        count(*) filter (where x.제출 and x.재시도 and x.날 = ${오늘}::date - 1)        as 어제_재시도,
        count(*) filter (where x.제출 and x.교정재발화 and x.날 = ${오늘}::date - 1)    as 어제_교정재발화
      from (
        select e.occurred_at,
               (e.occurred_at at time zone ${시간대})::date as 날,
               e.event_type = 'submission.created' as 제출,
               (case when (e.payload->>'attempt_no') ~ '^[0-9]+$'
                     then (e.payload->>'attempt_no')::int else 1 end) >= 2 as 재시도,
               e.retry_of_event_id is not null as 교정재발화
          from engine.learning_events e
         where e.learner_id = ${행.learner_id}::uuid) x`;

    /* 🔴 「첫날」은 어제가 0 인 것과 다르다. 어제 있었는데 아무것도 안 낸 학생에게 「어제 0」은
     *   참이고 보여줄 값이다(오늘 1 > 어제 0 이 곧 동기다). 여기서 비우는 것은 **어제라는 시점이
     *   이 학생에게 아직 없는** 경우뿐이다 — 그때 0 을 보여주면 없는 과거를 지어내는 것이 된다. */
    const data = 값.첫날인가 ? [] : [{
      today: {
        submission_count: Number(값.오늘_제출),
        retry_count: Number(값.오늘_재시도),
        correction_retry: Number(값.오늘_교정재발화) > 0,
      },
      yesterday: {
        submission_count: Number(값.어제_제출),
        retry_count: Number(값.어제_재시도),
        correction_retry: Number(값.어제_교정재발화) > 0,
      },
    }];

    /* Ⅲ⑥ — 오늘의 성향 확인 카드(c13 · 유호 확정 08-22). growth_note 선례: 서버가 짓고 앱은
     * 그린다(응답 필드 추가 = 판올림 아님 · null 이면 앱이 안 그린다). 판정 재료는 방향·등식뿐
     * (문턱 0 — lib/성향확인.js 머리말) · 하루 1회·부정 재노출 금지는 estimate.responded 행이 진다.
     * 실패는 null 로 낸다 — 확인 카드는 «없어도 되는» 꼬리라 본 응답을 절대 안 깨뜨린다. */
    let 오늘의확인: Record<string, unknown> | null = null;
    try {
      /* 행만 걷는다 — 리듬 추정(배정↔제출 구간 잇기·마감 여유)은 학습자상태() 정본이 계산한다.
       * 창(30일)도 그 함수의 as_of 절단이 지므로 여기선 40일을 넉넉히 걷는다(두 벌 방지). */
      const 원행들 = await sql`
        select e.event_id, e.event_type, e.occurred_at, e.due_at
          from engine.learning_events e
         where e.learner_id = ${행.learner_id}::uuid
           and e.event_type in ('task.assigned', 'submission.created')
           and e.occurred_at >= now() - interval '40 days'`;
      /* 🔴 「오늘」의 축 = ingested_at(서버 수신 시각 · default now()) — occurred_at 은 앱 시계라
       * (C0 「기기 시계는 못 믿는다」) 시계 앞선 기기가 «내일»로 찍으면 오늘 또 묻고 내일 억제된다
       * (심문 G12). 예산 판정만 서버 시계다 — 학습 사건의 «일어난 때»는 그대로 occurred_at 이 정본.
       * 🔴 부정키는 SQL 이 쌍(축·키)을 내고 조립은 lib `부정키` 한 원천이 진다(심문 G13 — 형식을
       * 두 곳에 적으면 새 축이 서는 날 갈리고, 갈린 쪽 증상은 «재노출»이라 학생이 먼저 겪는다). */
      const [답이력] = await sql`
        select count(*) filter (where (e.ingested_at at time zone ${시간대})::date = ${오늘}::date) as 오늘답수,
               coalesce(jsonb_agg(jsonb_build_object('축', e.payload->>'trait_axis', '키', e.payload->>'shown_key'))
                 filter (where e.payload->>'response' = '아니다'), '[]'::jsonb) as 부정쌍들
          from engine.learning_events e
         where e.learner_id = ${행.learner_id}::uuid
           and e.event_type = 'estimate.responded'`;
      const 부정키들 = ((답이력.부정쌍들 ?? []) as Array<{ 축: string; 키: string }>)
        .map((p) => 부정키(String(p.축), String(p.키)));
      const 기준 = new Date().toISOString();
      const 상태 = 학습자상태(원행들 as unknown[], { as_of: 기준, 시간대 });
      오늘의확인 = 확인카드(
        상태.축.리듬,
        { 오늘답함: Number(답이력.오늘답수) > 0, 부정키들 },
        기준, 상태.estimator_version);
    } catch (e) {
      console.error('[progress] 오늘의확인 판정 실패(null 로 낸다)', String((e as Error)?.message ?? e));
    }

    /* c14 교실 수집 ② — 오늘 밤 목표 카드(유호 확정 08-31 「웅 그대로 가」 · 정본 = appsscript
     * docs/교실수집_목표왕복_설계_v1.md). 하루 1회는 goal.responded 행이 지고(오늘의확인과 같은
     * ingested_at 축 — 심문 G12), 평일 근사·문구는 lib/목표확인.js 정본이 진다. 실패는 null —
     * 목표 카드도 «없어도 되는» 꼬리라 본 응답을 절대 안 깨뜨린다. */
    let 오늘의목표: Record<string, unknown> | null = null;
    try {
      const [목표이력] = await sql`
        select count(*) filter (where (e.ingested_at at time zone ${시간대})::date = ${오늘}::date) as 오늘답수
          from engine.learning_events e
         where e.learner_id = ${행.learner_id}::uuid
           and e.event_type = 'goal.responded'`;
      오늘의목표 = 목표카드({ 오늘답함: Number(목표이력.오늘답수) > 0 }, 오늘);
    } catch (e) {
      console.error('[progress] 오늘의목표 판정 실패(null 로 낸다)', String((e as Error)?.message ?? e));
    }

    // 두 날짜 고정이라 넘길 쪽이 없다(C0 §4-3 ③ — 쿼리 없음).
    return 봉투(200, { ok: true, date: 오늘, data, next_cursor: null, 오늘의확인, 오늘의목표 }, ver);
  } catch (e) {
    console.error('[progress] 조회 실패', String((e as Error)?.message ?? e));
    return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});
