/* GET /v1/tasks — 오늘 낼 것 (C0 §4-3 ①).
 *
 * ■ 이 자리가 무엇을 닫나
 *   배치(`functions/deliver`)가 전날 밤 큐에 넣은 것을 **앱이 읽는** 자리다. 여기까지 서야
 *   「배달 → 화면」 왕복이 닫힌다. 배치가 쓴 것과 여기서 읽는 것이 갈리면 증상은
 *   「학생 화면이 비어 있다」 하나뿐이라, 그 대조를 `tools/배달왕복시험.js` ⑧ 이 실측한다.
 *
 * ■ 큐는 새 테이블이 아니다 (P0 §6-1 · F124)
 *   `task.assigned` 사건 + 그 `submissions.task_snapshot` 이 곧 큐다. 그래서 읽을 곳도 거기다.
 *   🔴 **그 대가로 `submissions` 에는 제출이 아닌 행이 산다** — 그래서 여기서도, 「제출 수」를
 *   세는 `/v1/progress` 에서도 **반드시 `learning_events.event_type` 으로 거른다.** 안 걸면
 *   배정 1건이 제출 1건으로 세어진다(C0 §4-3 ① ⚠).
 *
 * ■ 빈 상태는 오류가 아니다 (C0 §4-3 공통)
 *   `data: []` + **200**. 첫날·배치 실패·동의 없음이 전부 정상 경로고, 404 를 주면 앱이 오류
 *   화면을 띄운다 — 그건 학생에게 「고장」으로 보인다. 앱은 빈 배열을 받으면 고정 도입 과제로
 *   내려간다(P0 §6-4).
 *
 * ■ 날짜는 **몽골 달력**으로 끊는다
 *   UTC 로 끊으면 몽골 오전 8시(=00:00Z)까지가 「어제」라, 아침에 앱을 연 학생이 어제 것을
 *   오늘 것으로 받는다. 규칙은 `lib/오늘과제.js` 가 지고 배치와 **같은 파일**을 동봉해 쓴다 —
 *   두 곳에 적으면 갈라지고, 갈라진 날 배치는 오늘에 쓰고 조회는 어제를 읽는다.
 *
 * ■ 읽기는 사건을 만들지 않는다
 *   `correction.viewed` 같은 표시는 앱이 `POST /v1/events` 로 따로 보낸다(C0 §4-3 ②).
 *   조회가 쓰기를 겸하면 재시도 한 번이 곧 데이터 오염이다.
 */
import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';
import 과제모듈 from './오늘과제.mjs';

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };
const { 몽골날짜 } = 과제모듈 as { 몽골날짜: (때?: Date) => string };

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

const 계약판 = /^c(\d+)$/;
const 날짜꼴 = /^\d{4}-\d{2}-\d{2}$/;

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

  /* 뒷마디를 본다 — `uploads` 와 같은 이유다. 안 보면 `/tasks/아무거나` 가 전부 이 조회로
   * 동작하고, 나중에 형제 경로를 만드는 날 옛 오타 경로가 **이미 돌고 있던 것**이 된다. */
  const url = new URL(req.url);
  if (!url.pathname.replace(/\/+$/, '').endsWith('/tasks')) {
    return 실패(404, { code: 'CONTRACT_VIOLATION', message: '없는 경로입니다 — GET /v1/tasks', retryable: false }, 선언);
  }

  const 주체 = 토큰주체(req);
  if (!주체) return 실패(401, { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false }, 선언);

  /* 🔴 날짜는 **모양을 먼저** 본다. 안 보면 `date=어제` 가 Postgres 까지 내려가 `22007` 로 죽고,
   *   400 이어야 할 것이 500 이 된다 — 5xx 는 `retryable` 이라 앱이 영구 오류를 무한 재시도한다
   *   (C0 §3 이 uuid 칸에 대해 못박은 것과 같은 축). */
  const 요청날짜 = url.searchParams.get('date');
  if (요청날짜 !== null && !날짜꼴.test(요청날짜)) {
    return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'date 는 YYYY-MM-DD 여야 합니다', field: 'date', retryable: false }, 선언);
  }
  const 날짜 = 요청날짜 ?? 몽골날짜();

  // 학생 확정과 DB 계약판을 한 번에 읽는다(왕복 1회). 계약판은 **DB 에게 묻는다** —
  // 손 상수를 두면 마이그레이션마다 사람이 같이 올려야 하고, 안 올리면 앱 전체가 426 이다.
  const [행] = await sql`
    select (select learner_id from engine.learners where auth_user_id = ${주체}::uuid) as learner_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const db판 = 계약판.exec(String(행?.최신조각 ?? '').match(/_(c\d+)\.sql$/)?.[1] ?? '');
  if (!db판) {
    console.error('[tasks] DB 계약판을 못 읽었다', 행?.최신조각);
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
     *   `service_role` 은 RLS 를 우회하므로 이 `where` 절이 유일한 방어선이다.
     *
     * ①듣기(`intervention.delivered` 의 `output_text`)는 배정과 **같은 `intervention_id`** 로
     *   붙어 있다. 시각·순서로 잇지 않는다 — 그건 하루 2건이 서는 날 조용히 어긋난다. */
    const 행들 = await sql`
      select e.event_id as task_id, e.degraded, e.intervention_id,
             s.task_snapshot, s.task_format, s.task_ref,
             e.level_snapshot, e.goal_snapshot,
             개입.payload->>'output_text' as output_text
        from engine.learning_events e
        join engine.submissions s on s.event_id = e.event_id
        left join lateral (
          select i.payload from engine.learning_events i
           where i.learner_id = e.learner_id
             and i.event_type = 'intervention.delivered'
             and i.intervention_id = e.intervention_id
           order by i.occurred_at desc limit 1) 개입 on true
       where e.learner_id = ${행.learner_id}::uuid
         and e.event_type = 'task.assigned'
         and (e.occurred_at at time zone 'Asia/Ulaanbaatar')::date = ${날짜}::date
       order by e.occurred_at desc`;

    /* 🔑 `task_ref`·`level_snapshot`·`goal_snapshot` 은 **되돌려 주려고** 싣는다(C0 §4-1).
     *   셋 다 제출 사건의 필드인데 **앱이 채우는 칸**이다 — 그때 화면이 알던 값을 그때 적는 것이
     *   유일하게 정확하기 때문이다(3일 전 오프라인 제출을 오늘 올리면 서버의 현재 급수는 그때 급수가
     *   아니다). 문제는 앱이 그 값을 **알 길이 없었다**는 것이다: 급수는 로그인 응답에도 없고,
     *   `task_ref` 는 배치의 작명 규칙(`task-{날짜}`)이라 앱이 지어내면 그건 규칙의 사본이다.
     *   🔴 사본은 배치가 규칙을 바꾸는 날 조용히 갈라지고, 증상은 **제출이 큐와 안 이어지는 것**
     *   뿐이라 어디에도 오류로 안 남는다. 그래서 배정 행의 값을 그대로 실어 보내고 앱은 되돌린다. */
    const data = 행들.map((r: Record<string, unknown>) => ({
      task_id: r.task_id,
      task_ref: r.task_ref,
      task_snapshot: r.task_snapshot,
      task_format: r.task_format,          // 🔴 배정 행은 비어 있다 — 형식은 호흡마다다(P0 §2-1)
      level_snapshot: r.level_snapshot ?? null,
      goal_snapshot: r.goal_snapshot ?? null,
      degraded: r.degraded,
      intervention: r.intervention_id
        ? { intervention_id: r.intervention_id, output_text: r.output_text ?? null }
        : null,
    }));

    // 하루 1건이 멱등으로 보장되므로 `next_cursor` 는 항상 null 이다(C0 §4-3 ①).
    return 봉투(200, { ok: true, date: 날짜, data, next_cursor: null }, ver);
  } catch (e) {
    console.error('[tasks] 조회 실패', String((e as Error)?.message ?? e));
    return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});
