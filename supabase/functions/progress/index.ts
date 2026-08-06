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

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };
const { 몽골날짜, 시간대 } = 과제모듈 as { 몽골날짜: (때?: Date) => string; 시간대: string };

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

const 계약판 = /^c(\d+)$/;

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
    select (select learner_id from engine.learners where auth_user_id = ${주체}::uuid) as learner_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const db판 = 계약판.exec(String(행?.최신조각 ?? '').match(/_(c\d+)\.sql$/)?.[1] ?? '');
  if (!db판) {
    console.error('[progress] DB 계약판을 못 읽었다', 행?.최신조각);
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

    // 두 날짜 고정이라 넘길 쪽이 없다(C0 §4-3 ③ — 쿼리 없음).
    return 봉투(200, { ok: true, date: 오늘, data, next_cursor: null }, ver);
  } catch (e) {
    console.error('[progress] 조회 실패', String((e as Error)?.message ?? e));
    return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});
