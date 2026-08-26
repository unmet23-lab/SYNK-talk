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
import 동의모듈 from './동의게이트.mjs';
import 계약판모듈 from './계약판.mjs';
import 사유모듈 from './벤더사유.mjs';
import 생성문구모듈 from './문구_생성.mjs';
import CORS모듈 from './CORS.mjs';

const { 예비응답 } = CORS모듈 as {
  예비응답: (req: Request, 메서드?: string) => Response | null;
  머리: () => Record<string, string>;
};

/* 진단 한 칸(`blocked`)을 위해서만 쓴다 — 이 함수는 막는 게이트가 아니다(아래 주석). */
const { 지금유효, 거절몸통 } = 동의모듈 as {
  지금유효: (sql: unknown, learner_id: string) => Promise<Array<{ consent_ver: string }>>;
  거절몸통: { code: string; field: string; retryable: boolean };
};

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };
const { 벤더사유 } = 사유모듈 as { 벤더사유: (글: unknown, 상한?: number) => string | null };
/* 🔴 `시간대` 도 여기서 가져온다 — 리터럴을 다시 적으면 배치와 조회가 갈린다(절단문서 ①-14). */
const { 몽골날짜, 시간대, 학생판스냅샷, 구제할까, 생성중상태들, 창안생성중, 구앱안내항목 } = 과제모듈 as {
  몽골날짜: (때?: Date) => string;
  시간대: string;
  /* 🔴 배정 0인 날을 구제할지의 판정 — **여기 인라인으로 다시 적지 않는다**(B3).
   *   글자로만 검사되는 조건은 하나를 통째로 죽여도 초록이라(F287), 판정은 순수 함수가 지고
   *   회귀는 값을 먹여 행동으로 잰다. */
  구제할까: (상황: { 배정수: number; 막힘: unknown; 날짜: string; 오늘: string }) => boolean;
  /* T8 재판정(유호 픽 C · 08-24) — 창 안 «생성 진행 중» 판정. 구제할까와 같은 규칙으로
   *   순수 함수 하나가 정본이고, 「생성중」 상태 집합도 같은 파일 한 곳이다. */
  생성중상태들: readonly string[];
  창안생성중: (잡: { 상태: string; 마감뒤: boolean } | null) => boolean;
  /* 🔴 이 응답이 답안지가 되지 않게 거르는 자리(절단문서 ②-20) — 목록도 정본도 저 파일 하나다. */
  학생판스냅샷: (snap: unknown) => unknown;
  /* ⓔ-22 — 활성 뒤 구앱 응답의 `data` 에 싣는 안내 항목. 모양의 정본은 저 파일(`화면과제` 옆)이고
   *   문구는 `contents/문구_생성.js`(카피 소관) — 이 함수는 둘을 잇기만 한다. */
  구앱안내항목: (날짜: string, 안내: unknown) => Record<string, unknown> | null;
};
const { 생성안내 } = 생성문구모듈 as {
  생성안내: (상태: unknown) => { 제목: string[]; 본문: string[] } | null;
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 배정이 0인 날을 구제할 때만 쓴다(아래 `지금세우기`) — `auth` 의 첫배정과 **같은 통로**다. */
const 함수기지 = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1`;
const 서비스키 = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/* 오늘 배정을 **지금** 세운다 — C0 심문 B3 (소급 불가).
 *
 * ■ 무엇이 새고 있었나
 *   배치(`deliver`)는 하루 1회다. 그 배치가 죽은 날, 또는 첫 등록 때 `auth` 의 첫배정이 실패한 날,
 *   `/tasks` 는 빈 배열을 낸다. 그러면 앱은 고정 도입 과제로 내려가고 **발화를 서버로 보내지
 *   않는다**(`lib/오늘과제.js` 화면과제 → `제출재료: null` → `src/제출API.js` 가 `끝: true`).
 *   즉 그날 학생이 말한 것은 기기에만 남고 **사건이 되지 않는다.** 다음 날 배치가 돌아도
 *   어제 목소리는 소급되지 않는다 — 이 자리의 손실만 되돌릴 수 없다.
 *
 * ■ 🔑 새 통로를 만들지 않는다
 *   배정을 만드는 코드는 `deliver` 하나여야 한다(`auth:첫배정세우기` 가 같은 이유로 그렇게 섰다).
 *   여기서 INSERT 하면 배정 생성이 셋이 되고, 갈라진 쪽이 낸 행은 계약 밖 모양이 된다.
 *
 * ■ ⚠ **한 번만 부른다 — 루프가 아니다**
 *   불러도 여전히 0일 수 있다(그 학생이 오늘 대상이 아닌 경우). 그때 다시 부르면 그건 재시도가
 *   아니라 매 요청마다 배치를 때리는 것이다. 한 번 부르고, 다시 읽고, 그래도 비면 **빈 채로 낸다.**
 *
 * ■ ⚠ 실패해도 200 을 깨지 않는다
 *   「빈 상태는 오류가 아니다」(C0 §4-3)가 이 함수의 계약이다. 구제 시도가 실패했다고 500 을 내면
 *   정상 경로가 오류 경로로 바뀌고, 앱은 고장 화면을 띄운다. 실패는 로그로만 남긴다.
 */
type 구제결과 = { 결과: '세움' | '설정없음' | '실패' | '조준생성'; 사유: string | null };

/* T8(유호 픽 C · 08-24 결정.md) — 창 안 «대기» 잡의 조준 생성 깨우기. 발사-망각이다:
 * /tasks 응답을 벤더 왕복(수십 초)에 안 묶는다. `EdgeRuntime.waitUntil` 로 응답 뒤 생존을
 * 부탁하고, 그마저 잘리거나 킥이 죽어도 다음 워커 회차(10분 간격)가 그 잡을 집는다 —
 * 지는 방향이 «조금 늦음»뿐이게 설계한다. 인증은 `지금세우기` 와 같은 서버 열쇠 통로다.
 * 비용 상한은 안 는다 — `jobs_claim` 유일성이 학생·일 1회(배치와 같은 총량)를 보장한다. */
function 조준생성킥(learner_id: string): void {
  if (!서비스키 || !함수기지.startsWith('http')) {
    console.error('[tasks] 조준 생성을 못 부른다 — SUPABASE_URL·SERVICE_ROLE_KEY 미설정', learner_id);
    return;
  }
  const p = fetch(`${함수기지}/deliver-one?learner_id=${encodeURIComponent(learner_id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${서비스키}` },
  }).then((r) => {
    if (!r.ok) console.error('[tasks] 조준 생성 킥 응답 이상(다음 워커 회차가 집는다)', learner_id, r.status);
  }).catch((e) => {
    console.error('[tasks] 조준 생성 킥 실패(다음 워커 회차가 집는다)', learner_id, String((e as Error)?.message ?? e));
  });
  try {
    (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(p);
  } catch { /* 구런타임 — 응답 뒤 잘릴 수 있으나 안전망(워커 회차)은 그대로다 */ }
}

async function 지금세우기(learner_id: string): Promise<구제결과> {
  if (!서비스키 || !함수기지.startsWith('http')) {
    console.error('[tasks] 🔴 배정 0인데 구제를 못 부른다 — SUPABASE_URL·SERVICE_ROLE_KEY 미설정', learner_id);
    return { 결과: '설정없음', 사유: '설정없음:SUPABASE_URL·SERVICE_ROLE_KEY' };
  }
  try {
    const r = await fetch(`${함수기지}/deliver?learner_id=${encodeURIComponent(learner_id)}&${new URLSearchParams({ 맥락: '구제' })}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${서비스키}`, 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      /* 🔑 위 머리말의 「실패는 로그로만 남긴다」에서 **로그«만»을 뺀다**(2026-08-15).
       *   깨지 말라던 것은 **200 이라는 상태**이지 사유의 소재가 아니었다 — 상태는 그대로 두고
       *   「왜」만 봉투에 싣는다. 이 갈래가 학생에게 뜻하는 것은 「오늘 발화가 사건으로 안 남는다」라
       *   소급이 안 되는데, 지금까지 그 사유는 하루 뒤 사라지는 로그에만 있었다. */
      const 글 = (await r.text()).slice(0, 200);
      console.error('[tasks] 🔴 배정 0 구제 실패 — 오늘 발화가 사건으로 안 남는다',
        learner_id, r.status, 글);
      const 말 = 벤더사유(글);
      return { 결과: '실패', 사유: `deliver:${r.status}${말 ? ` ${말}` : ''}` };
    }
    return { 결과: '세움', 사유: null };
  } catch (e) {
    const 말 = e instanceof Error ? e.message : String(e);
    console.error('[tasks] 🔴 배정 0 구제 호출 예외', learner_id, 말);
    return { 결과: '실패', 사유: `예외:${벤더사유(말) ?? '(빈 메시지)'}` };
  }
}

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
const 날짜꼴 = /^\d{4}-\d{2}-\d{2}$/;

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
    select (select learner_id from engine.learners where ${살아있는학생(sql, 주체, 발급시각(req))}) as learner_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const ver = 행들에서판(행);
  if (!ver) {
    console.error('[tasks] DB 계약판을 못 읽었다', 행?.최신조각);
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

  try {
    /* 🔑 **자기 것만** — 학생은 토큰에서 왔고 쿼리로 지정할 수 없다(C0 §4-3 공통).
     *   `service_role` 은 RLS 를 우회하므로 이 `where` 절이 유일한 방어선이다.
     *
     * ①듣기(`intervention.delivered` 의 `output_text`)는 배정과 **같은 `intervention_id`** 로
     *   붙어 있다. 시각·순서로 잇지 않는다 — 그건 하루 2건이 서는 날 조용히 어긋난다. */
    const 배정읽기 = () => sql`
      select e.event_id as task_id, e.degraded, e.intervention_id,
             s.task_snapshot, s.task_format, s.task_ref,
             e.level_snapshot, e.goal_snapshot, e.retry_of_event_id,
             개입.payload->>'output_text' as output_text, 개입.event_id as intervention_event_id
        from engine.learning_events e
        join engine.submissions s on s.event_id = e.event_id
        left join lateral (
          select i.payload, i.event_id from engine.learning_events i
           where i.learner_id = e.learner_id
             and i.event_type = 'intervention.delivered'
             and i.intervention_id = e.intervention_id
           order by i.occurred_at desc limit 1) 개입 on true
       where e.learner_id = ${행.learner_id}::uuid
         and e.event_type = 'task.assigned'
         and (e.occurred_at at time zone ${시간대})::date = ${날짜}::date
       order by e.occurred_at desc`;

    let 행들 = await 배정읽기();

    /* 동의는 **여기서** 읽는다 — 아래 구제가 「동의 있는데 배정만 0인 날」에만 도는데,
     *   그 판정을 하려면 `blocked` 가 먼저 서야 한다. 정본은 `lib/동의게이트.js` 하나다.
     * 🔑 `data` 가 있어도 잰다 — 배정 뒤 철회한 학생은 과제를 보면서 업로드만 막힌다.
     *   「비었을 때만」 재면 `blocked: null` 이 **측정이 아니라 추측**이 된다. */
    const 동의 = await 지금유효(sql, 행.learner_id as string);
    const blocked = 동의.length ? null : { code: 거절몸통.code };

    /* 🔴 **배정 0인 날을 여기서 구제한다** — C0 심문 B3(소급 불가).
     *   조건 셋(배정 0 · 동의 있음 · 오늘)의 정본은 `lib/오늘과제.js` 의 `구제할까` 다.
     * ⚠ 한 번만 부르고 한 번만 다시 읽는다. 그래도 비면 빈 채로 낸다(루프 금지 — 위 주석).
     *   횟수는 이 **구조**가 지고 판정은 저 함수가 진다 — 한쪽에 둘 다 넣으면 갈라진다. */
    /* 🔑 **안 부른 것과 불렀는데 실패한 것을 가른다** — 둘 다 「data 가 비었다」로 끝나므로,
     *   구제 칸이 없으면 빈 응답의 사유가 응답 어디에도 안 남는다(그리고 로그는 하루 뒤 없다). */
    /* ── 오늘 생성 잡 — **한 번** 읽어 구제 분기(T8)와 `assignment_status` 둘이 같이 쓴다.
     * 판정 실패는 «못 읽음»으로 들고 간다(심문 T9 status_degraded — «없음»과 «못 쟀다»가 같은
     * 모양이면 생성중 안내가 조용히 침묵한다). 새 응답 칸은 growth_note 선례(모르는 앱은 무시 ·
     * null 아님 때만 존재)라 판올림이 아니다. */
    let 잡: { 상태: string; 마감뒤: boolean } | null = null;
    let status_degraded = false;   // T9 — 판정 실패 표식(값록 4 는 그대로 · 봉투에만 붙는다)
    if (!행들.length) {
      try {
        const 물리 = await sql`
          select to_regclass('engine.generation_jobs') is not null as 있음`;
        if (물리[0]?.있음) {
          const j = await sql`
            select g.status, (now() >= engine.gen_deadline(${날짜}::date)) as 마감뒤
              from engine.generation_jobs g
             where g.learner_id = ${행.learner_id}::uuid and g.assign_date = ${날짜}::date`;
          if (j[0]?.status) 잡 = { 상태: String(j[0].status), 마감뒤: Boolean(j[0].마감뒤) };
        }
      } catch (e) {
        status_degraded = true;
        console.error('[tasks] 생성 잡 판정 실패(없음으로 낸다 · status_degraded)', String((e as Error)?.message ?? e));
      }
    }

    let 구제: 구제결과 | null = null;
    if (구제할까({ 배정수: 행들.length, 막힘: blocked, 날짜, 오늘: 몽골날짜() })) {
      if (창안생성중(잡)) {
        /* T8 재판정(유호 픽 C · 08-24 결정.md) — 창 안 «생성 진행 중»은 구제 대상이 아니다.
         * 폴백으로 잡아채면 새벽형 학생이 생성이 살아 있어도 매일 강등된다(채택 트레이드의 뒷면).
         * 「생성중」 카드를 보이고, 아직 아무도 안 집은 잡(대기)이면 그 학생만 조준 생성을 깨운다
         * (~1분 안 착지 · 킥이 죽어도 다음 워커 회차가 집는다). 마감 뒤·터미널 상태는 이 분기
         * 밖이라 구제가 종전대로 접는다 — 전멸일·죽은 밤의 안전망은 한 뼘도 안 줄었다. */
        구제 = { 결과: '조준생성', 사유: null };
        if (잡!.상태 === '대기') 조준생성킥(행.learner_id as string);
      } else {
        구제 = await 지금세우기(행.learner_id as string);
        if (구제.결과 === '세움') {
          /* 다시 읽기가 죽어도 **빈 응답으로 돌아간다** — 첫 조회는 이미 성공했으니 여기서 500 을
           * 내면 「빈 상태는 오류가 아니다」를 구제 시도가 깨뜨리는 꼴이다. */
          try {
            행들 = await 배정읽기();
          } catch (e) {
            const 말 = String((e as Error)?.message ?? e);
            console.error('[tasks] 구제 뒤 재조회 실패 — 빈 채로 낸다', 말);
            /* 구제는 «섰는데» 재조회가 죽은 자리다 — 결과를 덮어써 「세움인데 빈 응답」이라는
             * 앞뒤 안 맞는 조합이 응답에 안 남게 한다(다음 요청이 다시 읽으면 보인다). */
            구제 = { 결과: '실패', 사유: `재조회:${벤더사유(말) ?? '(빈 메시지)'}` };
          }
        }
      }
    }

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
      /* 🔴 **통째로 주지 않는다**(절단문서 ②-20). 계약은 `task_snapshot` 안에 정답을 두고
       *   (C0 §4-1 예시 · L0 §3-3 필수 4), 채점은 그걸로 나중에 계산하는 파생이다 — 앱은 정답이
       *   필요 없는데 이 줄은 그걸 실을 자리를 갖고 있었다. 허용 키만 내보낸다(목록 = 저 lib). */
      task_snapshot: 학생판스냅샷(r.task_snapshot),
      task_format: r.task_format,          // 🔴 배정 행은 비어 있다 — 형식은 호흡마다다(P0 §2-1)
      level_snapshot: r.level_snapshot ?? null,
      goal_snapshot: r.goal_snapshot ?? null,
      /* 🔴 **오늘 것이 교정문이면 그 교정의 원 제출 사건**(`functions/deliver` 가 배정 행에 박는다).
       *   앱은 이걸 제출 사건의 `retry_of_event_id` 로 되돌려 싣는다 — 설계 전체의 **유일한 결과
       *   변수**(L0 §9-2)이고, 없으면 엔진이 상관만 배우고 처방을 못 배운다. `task_ref`·급수와
       *   같은 무늬다: 앱이 채우는 칸인데 앱이 알 길이 없으니 배정 행의 값을 그대로 실어 준다.
       * 🔑 `null` 이 정상이다 — 교정문 날이 아니면 재시도가 아니다(지어내면 첫 제출이 재시도로
       *   둔갑하고, 그 오염은 결과축 자체를 못 믿게 만든다). */
      retry_of_event_id: r.retry_of_event_id ?? null,
      degraded: r.degraded,
      /* 🔴 `event_id` 는 `intervention_id` 의 사본이 아니다 — **`content.viewed` 가 `parent_event_id`
       *   로 가리킬 유일한 값**이다(c9 · 절단문서 ①-2·①-12). `intervention_id` 는 업무 키라
       *   배달·성과가 **여러 행에 걸쳐 같은 값**을 들고, 그 값으로는 「어느 배달을 열었나」가 안
       *   갈린다(같은 개입을 두 번 내보낸 날 두 열람이 한 행으로 접힌다 — `lib/이벤트검증.js` 가
       *   `task_ref` 대안을 기각한 것과 같은 이유). 이게 없어서 생산자가 0이었다.
       * 🔑 `null` 일 수 있다 — 배정에 `intervention_id` 는 있는데 배달 사건 행을 못 찾은 경우다.
       *   그때 앱은 열람을 **안 보낸다**(가리킬 대상이 없는 관측은 학생 단위 집계로만 남는다). */
      intervention: r.intervention_id
        ? {
            intervention_id: r.intervention_id,
            event_id: r.intervention_event_id ?? null,
            output_text: r.output_text ?? null,
          }
        : null,
    }));

    /* 🔴 **빈 배열의 이유를 앱이 알 수 없었다**(F176 ① · 2026-08-07 실측).
     *   `deliver` 는 동의 없는 학생을 배정하지 않으므로(P0 §345) 그 학생의 `data` 는 빈다.
     *   그런데 배치가 안 돈 날도 똑같이 빈다 — **원인이 둘인데 응답이 하나**라 앱은 못 가르고,
     *   화면에는 「오늘 받은 과제가 아직 없어요」만 뜬다. 갓 등록한 학생은 그 화면을 보며
     *   무엇을 해야 하는지 알 길이 없고, 운영자도 그 학생이 왜 조용한지 모른다.
     *
     *   그래서 **왜 비었나**를 한 칸 싣는다. C0 §4-3 「빈 상태는 오류가 아니다」의 연장이다 —
     *   200 을 유지하면서 이유만 말한다(4xx 로 바꾸면 앱의 정상 경로가 오류 경로가 된다).
     *
     * 🔑 이 함수는 **막지 않는다.** 게이트는 `uploads`(서명)·`events`(적재)·`deliver`(배정)이고
     *   여기는 그 게이트를 **미리 읽어 알려주는** 자리다. 술어가 갈라지면 「화면은 초록인데
     *   업로드는 403」이 되므로 정본(`lib/동의게이트.js`)을 그대로 부른다.
     * 🔑 `동의`·`blocked` 는 위에서 이미 읽었다(구제 판정이 그것을 먼저 필요로 한다). */

    /* `assignment_status`(§3-1 v5.4~v5.6 · c12 값 4: 있음|없음|생성중|오류) — 「오늘 낼 것이
     * 없다」와 「지금 짓는 중이라 곧 생긴다」를 가른다(같은 화면이면 학생은 닫는다).
     * · 판정 주체는 서버 «하나»다 — 마감 경계(`gen_deadline`)를 앱이 시각으로 되짚으면 같은
     *   판정이 두 곳에 살고 시계가 어긋난 날 갈린다(v5.6 D2).
     * · `생성중` = 그 학생 job 이 대기·claimed·적재실패(마감 «전» — v5.7 B11: lease 유효/만료
     *   불문 실리는 값은 하나다) · 마감 «뒤» 잔존은 `오류`(감시 ①과 같은 집합 — 같은 사실).
     * · 신구조 물리가 없는 DB(활성 전 운영)는 표 존재 가드로 현행 이분법(있음/없음) 그대로 —
     *   구앱 규칙(§3-1: 이 칸을 안 읽는 클라이언트는 data 만 본다)과 같은 방향이다. */
    /* 잡은 위(구제 앞)에서 한 번 읽었다 — 판정은 `창안생성중`(lib 정본) 하나가 진다(T8).
     * 마감 «뒤» 잔존만 여기서 `오류` 로 가른다(감시 ①과 같은 집합 — 같은 사실). */
    let assignment_status: string = 행들.length ? '있음' : '없음';
    if (!행들.length && 잡) {
      if (창안생성중(잡)) assignment_status = '생성중';
      else if (잡.마감뒤 && 생성중상태들.includes(잡.상태)) assignment_status = '오류';
    }

    /* ⓔ-22 «구앱 간주»의 서버 반쪽(§3-1 v5.13 · C0 §4-3 ① 「창의 수명」) — **활성 시작일 이후**의
     * 구앱(c12 전 판 선언) 접속은 `assignment_status` 미지원으로 간주하고, 생성중·오류의 안내를
     * `data` 에 실어 보낸다(새 칸 0 — 구앱이 이미 읽는 그 칸이다). 그래야 「곧 생기는데 없다고
     * 읽고 닫는」 경험이 빈 화면이 아니라 안내로 닫힌다.
     * · 활성 «전»은 무동작 — `gen_active_from` 은 활성 조각이 세우므로 함수 부재 = 현행 그대로
     *   (`deliver` 의 생성 모드 게이트와 같은 무늬 · 배포 순서가 어긋나도 행동이 안 바뀐다).
     * · 신앱(c12 이상 선언)은 이 분기 밖 — 그 칸을 읽고 문구는 앱이 그린다(§12-11 어댑터).
     * · 안내 항목은 `task_ref` 가 null 이라 구앱이 발화를 서버로 안 보낸다(`화면과제` 의 안전판) —
     *   안내를 향해 말한 것이 사건이 되면 안 된다. */
    if ((assignment_status === '생성중' || assignment_status === '오류') && (판번호(선언) as number) < 12) {
      try {
        const fn = await sql`select (to_regprocedure('engine.gen_active_from()') is not null) as 있음`;
        if (fn[0]?.있음) {
          const 활성 = await sql`select engine.gen_active_from() <= ${날짜}::date as 켜짐`;
          if (활성[0]?.켜짐) {
            const 항목 = 구앱안내항목(날짜, 생성안내(assignment_status));
            if (항목) (data as Array<Record<string, unknown>>).push(항목);
          }
        }
      } catch (e) {
        /* 안내 조립 실패는 빈 채로 낸다 — 부속이 본 응답을 깨지 않는다(위 판정과 같은 규율). */
        console.error('[tasks] 구앱 안내 조립 실패(빈 채로 낸다)', String((e as Error)?.message ?? e));
      }
    }

    // 하루 1건이 멱등으로 보장되므로 `next_cursor` 는 항상 null 이다(C0 §4-3 ①).
    return 봉투(200, { ok: true, date: 날짜, data, blocked, next_cursor: null, 구제, assignment_status, ...(status_degraded ? { status_degraded } : {}) }, ver);
  } catch (e) {
    console.error('[tasks] 조회 실패', String((e as Error)?.message ?? e));
    return 실패(500, { code: 'SERVER_ERROR', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});
