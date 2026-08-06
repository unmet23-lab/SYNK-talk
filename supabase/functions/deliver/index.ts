/* 배달 배치 — P0 §6「하루 한 문장」. 전날 밤에 학생마다 1건을 큐에 넣는다.
 *
 * ■ 큐의 실체는 새 테이블이 아니다 (P0 §6-1 · F124)
 *   `task.assigned` 사건 + 그 `submissions.task_snapshot` 이 곧 큐다. 앱은 「오늘 날짜의 내
 *   `task.assigned` 1건」을 읽는다(C0 §4-3 ①). 발주가 여기서 테이블을 만들면 그게 정확히
 *   `발주_수집파이프라인` 이 한 번 겪은 사고다(새 3테이블이 전부 기존 테이블의 재발명).
 *
 * ■ `task_snapshot` 을 payload 가 아니라 `submissions` 에 싣는 이유
 *   계약(`수집_교정_계약.json` 필드층)이 `task_snapshot` 을 **「내용」층**에 두었고, 그 층의
 *   물리 자리는 `engine.submissions` 다. payload 로 옮기려면 C0 §4-1 의 허용 payload 목록
 *   개정(=계약 새 판)이 필요한데, **계약을 안 바꾸고 서는 길이 이미 있다.**
 *   ⚠ 대신 「제출 수」를 셀 때 반드시 `learning_events.event_type` 으로 걸러야 한다 —
 *     `count(submissions)` 로 세면 배정이 제출로 세어진다. 왕복시험이 그 자리를 지킨다.
 *
 * ■ 행의 `task_format` 은 비운다
 *   배정 1건에 ②낭독 + ③자유발화 두 형식이 들어간다(P0 §2-1). 한 칸에 담으면
 *   「낭독 데이터로 회화 모델을 학습」이 배정 단계에서 성립한다. 형식은 호흡마다 적는다.
 *
 * ■ AI 문장 생성은 아직 없다 — 그리고 그 사실이 행에 남는다
 *   §6-1 셋째 갈래(급수·목적으로 생성)는 모델·프롬프트 계약이 없다. 그 자리는 §6-4 강등
 *   경로가 그대로 받는다: 전날 문장 → 없으면 고정 도입 과제 · **`degraded=true`**.
 *   판정은 `lib/오늘과제.js` 가 지고 회귀가 DB 없이 잰다.
 *
 * ■ 호출자
 *   `pg_cron` 이 `Authorization: Bearer <service_role>` 로 부른다. 학생 토큰은 여기 못 들어온다
 *   (`intervention.delivered`·`task.assigned` 는 `이벤트검증` 의 **서버사건**이다).
 */
import postgres from 'npm:postgres@3.4.4';
import 과제모듈 from './오늘과제.mjs';
import 토큰모듈 from './토큰.mjs';

const { 서비스역할 } = 토큰모듈 as { 서비스역할: (req: Request) => boolean };
const { 몽골날짜, 멱등키, 오늘과제, 따라말하기문장 } = 과제모듈 as {
  몽골날짜: (때?: Date) => string;
  멱등키: (종류: string, learner_id: string, 날짜: string) => string;
  오늘과제: (재료: Record<string, unknown>) => {
    task_snapshot: Record<string, unknown>; task_ref: string; degraded: boolean; 출처: string;
  };
  따라말하기문장: (snap: unknown) => string | null;
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 배정이 여는 통로는 「발화녹음」이다(계약 값목록). `submissions.task_type` 이 not null 이라
 * 배정 행도 통로를 말해야 하고, 그날 학생이 낼 것이 실제로 그것이다. */
const 통로 = '발화녹음';

const 봉투 = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  /* 호출자는 **JWT 의 `role` 로** 가른다 — 키 문자열 비교가 아니다(정본 `lib/토큰.js`).
   * 서명 검증은 플랫폼이 이미 했지만(`verify_jwt=true`) 그건 **anon 키도 통과시킨다**. */
  if (!서비스역할(req)) {
    return 봉투(401, { ok: false, error: { code: 'AUTH_REQUIRED', message: '배치 호출 권한이 없습니다' } });
  }
  const 오늘 = 몽골날짜();
  const 점검 = new URL(req.url).searchParams.has('점검');

  try {
    return 점검 ? await 점검하기(오늘) : await 배달하기(오늘);
  } catch (e) {
    const 글 = String((e as Error)?.message ?? e);
    console.error('[deliver] 실패', 글);
    return 봉투(500, { ok: false, date: 오늘, error: { code: 'SERVER_ERROR', message: 글.slice(0, 300) } });
  }
});

/* 🔴 §6-5 — 배치가 **안 돈 것**은 강등으로 잡히지 않는다.
 *   전원이 며칠 고정 과제로 돌아도 증상은 조용하고, 그걸 보는 눈은 원장 주 1회 화면뿐이다.
 *   배치 예정 시각 +30분에 이 모드로 한 번 더 부른다: 오늘 배정 수 < 재적 수면 미달이다.
 *   S1 구간의 수신자는 유호님 한 명이라 별도 발송 통로를 만들지 않는다 — 로그 1행 + 응답. */
async function 점검하기(오늘: string) {
  const [r] = await sql`
    select (select count(*) from engine.learners) as 재적,
           (select count(*) from engine.learning_events
             where event_type = 'task.assigned'
               and (occurred_at at time zone 'Asia/Ulaanbaatar')::date = ${오늘}::date) as 배정,
           (select count(*) from engine.learning_events
             where event_type = 'task.assigned' and degraded
               and (occurred_at at time zone 'Asia/Ulaanbaatar')::date = ${오늘}::date) as 강등`;
  const 재적 = Number(r.재적), 배정 = Number(r.배정), 강등 = Number(r.강등);
  const 미달 = 배정 < 재적;
  if (미달) console.error(`[deliver] 🔴 배치 미달 — ${오늘} 배정 ${배정}/${재적}`);
  return 봉투(200, { ok: true, mode: '점검', date: 오늘, 재적, 배정, 강등, 미달 });
}

async function 배달하기(오늘: string) {
  /* 학생과 재료를 **한 번에** 읽는다(학생 수만큼 왕복하지 않는다).
   * · 마지막 배정 = 「첫날인가」와 「전날 문장」의 근거
   * · 교정문 = **지난 배정 뒤에 새로 확정된 것**만. 「최신 1건」으로 잡으면 같은 교정문이
   *   매일 ②슬롯에 다시 오고, 그건 §6-3 이 말한 「어제 나간 교정」이 아니다.
   * · 동의 = 지금 유효한 것. 없으면 배정하지 않는다(consent_ver 는 not null) — 그 학생은
   *   건너뛴 채 §6-5 미달로 드러난다. 동의 없이 배정하는 우회로를 만들지 않는다. */
  const 대상 = await sql`
    select l.learner_id, l.level_current, l.goal_track,
           배정.occurred_at as 마지막배정, 배정.task_snapshot as 마지막스냅샷,
           교정.corrected_text as 교정문, 동의.consent_ver
      from engine.learners l
      left join lateral (
        select e.occurred_at, s.task_snapshot
          from engine.learning_events e
          join engine.submissions s on s.event_id = e.event_id
         where e.learner_id = l.learner_id and e.event_type = 'task.assigned'
         order by e.occurred_at desc limit 1) 배정 on true
      left join lateral (
        select c.corrected_text
          from engine.corrections c
          join engine.submissions s on s.submission_id = c.submission_id
          join engine.learning_events e on e.event_id = s.event_id
         where e.learner_id = l.learner_id
           and c.corrected_text is not null
           and c.created_at > coalesce(배정.occurred_at, '-infinity'::timestamptz)
         order by c.created_at desc limit 1) 교정 on true
      left join lateral (
        select consent_ver from engine.consents
         where learner_id = l.learner_id and revoked_at is null
         order by agreed_at desc limit 1) 동의 on true`;

  const [{ 최신조각 }] = await sql`
    select name as 최신조각 from engine.schema_migrations order by version desc limit 1`;
  const ver = String(최신조각 ?? '').match(/_(c\d+)\.sql$/)?.[1];
  if (!ver) {
    // events 와 같은 근거로 DB 에게 판을 묻는다 — 함수가 DB 보다 앞설 수 없게.
    console.error('[deliver] DB 계약판을 못 읽었다', 최신조각);
    return 봉투(500, { ok: false, date: 오늘, error: { code: 'SERVER_ERROR', message: '서버 설정 오류입니다' } });
  }

  const results: Record<string, unknown>[] = [];
  for (const 학생 of 대상) {
    results.push(await 한명(학생 as Record<string, unknown>, 오늘, ver));
  }

  const 센다 = (s: string) => results.filter((r) => r.status === s).length;
  const 몸 = {
    ok: true, date: 오늘, contract_ver: ver, 재적: 대상.length,
    배정: 센다('assigned') + 센다('duplicate'),
    신규: 센다('assigned'), 재실행: 센다('duplicate'),
    강등: results.filter((r) => r.degraded).length,
    건너뜀: results.filter((r) => r.status === 'skipped'),
    실패: results.filter((r) => r.status === 'failed'),
  };
  if (몸.배정 < 몸.재적) console.error(`[deliver] 🔴 배정 미달 — ${오늘} ${몸.배정}/${몸.재적}`);
  return 봉투(200, 몸);
}

/** 한 학생 = 한 트랜잭션. 개입과 배정은 같이 서거나 같이 없다. */
async function 한명(학생: Record<string, unknown>, 오늘: string, ver: string) {
  const learner_id = String(학생.learner_id);
  if (!학생.consent_ver) {
    return { learner_id, status: 'skipped', 사유: 'consent_missing' };
  }

  const 결정 = 오늘과제({
    날짜: 오늘,
    첫날: !학생.마지막배정,
    교정문: 학생.교정문 ?? null,
    전날문장: 따라말하기문장(학생.마지막스냅샷),
  });

  /* 개입 하나에 붙는 식별자다 — `event_id`(사건 채번)와 축이 다르다. 두 행이 **같은 값**을
   * 들어야 나중에 성과가 「어느 개입에 대한 것인가」를 이 값 하나로 잇는다(C0 §4-1 계승). */
  const intervention_id = crypto.randomUUID();
  const 지금 = new Date().toISOString();
  const 공통 = {
    actor_kind: 'ai' as const,   // 배치가 만드는 사건의 행위자(§10-A-1 — `system` 을 새로 만들지 않는다)
    level_snapshot: (학생.level_current ?? null) as string | null,
    goal_snapshot: (학생.goal_track ?? null) as string | null,
    consent_ver: String(학생.consent_ver),
  };

  try {
    return await sql.begin(async (tx) => {
      // ① 무엇을 배달했나 — 강등이면 `ai` + `degraded` 조합이 「AI 자리인데 AI가 못 했다」를 담는다.
      const 개입 = await tx`
        insert into engine.learning_events (
          learner_id, event_type, actor_kind, occurred_at, idempotency_key,
          level_snapshot, goal_snapshot, intervention_id, consent_ver, degraded, payload, schema_ver
        ) values (
          ${learner_id}::uuid, 'intervention.delivered', ${공통.actor_kind}, ${지금}::timestamptz,
          ${멱등키('intervention', learner_id, 오늘)},
          ${공통.level_snapshot}, ${공통.goal_snapshot}, ${intervention_id}::uuid,
          ${공통.consent_ver}, ${결정.degraded},
          ${sql.json({ ver: 1, output_text: 따라말하기문장(결정.task_snapshot) })}, ${ver}
        )
        on conflict (learner_id, idempotency_key) do nothing
        returning event_id, intervention_id`;

      // 이미 오늘 것이 있으면 **그 개입을 잇는다** — 새 uuid 로 갈아끼우면 재실행이 고리를 끊는다.
      const 개입id = 개입.length
        ? intervention_id
        : (await tx`select intervention_id from engine.learning_events
                     where learner_id = ${learner_id}::uuid
                       and idempotency_key = ${멱등키('intervention', learner_id, 오늘)}`)[0].intervention_id;

      // ② 배정 — 「제출 안 함」의 분모(P0 §2-1). 없으면 「안 온 날」과 「낼 게 없던 날」이 같은 모양이다.
      const 배정 = await tx`
        insert into engine.learning_events (
          learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
          level_snapshot, goal_snapshot, intervention_id, consent_ver, degraded, payload, schema_ver
        ) values (
          ${learner_id}::uuid, 'task.assigned', ${통로}, ${공통.actor_kind}, ${지금}::timestamptz,
          ${멱등키('task', learner_id, 오늘)},
          ${공통.level_snapshot}, ${공통.goal_snapshot}, ${개입id}::uuid,
          ${공통.consent_ver}, ${결정.degraded}, ${sql.json({ ver: 1 })}, ${ver}
        )
        on conflict (learner_id, idempotency_key) do nothing
        returning event_id`;

      if (!배정.length) {
        // 재실행. 결정론적 키가 접었다 — 오류가 아니다(C0 §4-1 · §10-A-4).
        return { learner_id, status: 'duplicate', degraded: 결정.degraded, 출처: 결정.출처 };
      }

      // ③ 그날 학생이 볼 것 그대로 — task_format 은 비운다(호흡마다 다르다).
      await tx`
        insert into engine.submissions (
          event_id, task_type, task_ref, task_snapshot, task_schema_ver, occurred_at, schema_ver
        ) values (
          ${배정[0].event_id}::uuid, ${통로}, ${결정.task_ref},
          ${sql.json(결정.task_snapshot)}, 'task.v1', ${지금}::timestamptz, ${ver}
        )`;

      return {
        learner_id, status: 'assigned', event_id: 배정[0].event_id,
        intervention_id: 개입id, degraded: 결정.degraded, 출처: 결정.출처,
      };
    });
  } catch (e) {
    /* 한 학생이 실패해도 나머지는 배달한다 — 전건을 4xx 로 접으면 그 한 명이 반 전체의
     * 큐를 막는다(C0 §4-1 이 head-of-line blocking 으로 못박은 그 형태). */
    const 글 = String((e as Error)?.message ?? e);
    console.error('[deliver] 배정 실패', learner_id, 글);
    return { learner_id, status: 'failed', 사유: 글.slice(0, 200) };
  }
}
