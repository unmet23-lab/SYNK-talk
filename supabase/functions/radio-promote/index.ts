/* 라디오 승격기 Fn — 원장(radio.*) → engine.learning_events 의 **문** (설계 §4-3 · c11 · Lane B)
 *
 * ■ 층 분리 (P0 ④와 같은 이유)
 *   판정(링크·동의·중복·마감·해석·규격)은 전부 `라디오승격.mjs`(= lib/라디오승격.js)다 —
 *   여기는 조회·insert·재도전 고리 풀기만 한다. fetch 옆의 판정은 회귀가 원리상 못 닿는다.
 *
 * ■ 호출자
 *   `pg_cron` 이 `Authorization: Bearer <service_role>` 로 부른다(deliver 와 같은 자리).
 *   학생 토큰은 여기 못 들어온다 — 승격 사건의 절반이 `이벤트검증` 앱사건이지만 이 문은
 *   앱 문(functions/events)이 아니라 내부 생산자다(intervention.delivered 를 deliver 가
 *   직접 넣는 것과 같은 자리 · 원장이 이미 관측을 들고 있다).
 *
 * ■ 원장은 안 고친다
 *   제외(비링크·무동의·마감후·중복·해석불가…)는 응답의 **분모**로 나간다. 별도 제외 표 없음 —
 *   링크·동의·라운드가 전부 이력이라 「그때 왜 제외됐나」는 언제든 재산출된다(설계 §4-3 주석).
 *
 * ■ 승격 행의 submissions 는 pipeline_jobs 트리거를 그대로 탄다
 *   배정 행(deliver)이 이미 같은 길을 간다 — 잡의 소비자(교정배치)가 형식으로 거른다.
 *   자습체크인·목표선언의 「한 문장」은 실제 교정 대상이기도 하다(매일 한 문장 철학).
 */
import postgres from 'npm:postgres@3.4.4';
import 승격모듈 from './라디오승격.mjs';
import 출처모듈 from './사건출처.mjs';
import 토큰모듈 from './토큰.mjs';

const { 승격계획, 승격표, 승격판 } = 승격모듈 as {
  승격판: string;
  승격표: Record<string, string>;
  승격계획: (재료: Record<string, unknown>) => {
    계획: Array<Record<string, unknown>>;
    제외: Array<{ message_id: string; command_kind: string; 사유: string }>;
    승격판: string;
  };
};
const { 사건출처 } = 출처모듈 as { 사건출처: (event_type: string) => string | null };
const { 서비스역할 } = 토큰모듈 as { 서비스역할: (req: Request) => boolean };

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 되돌아보는 창(일). 봇이 죽었다 살아나도 이 창 안이면 승격이 따라잡는다 — 멱등이라
 * 겹쳐 읽기는 공짜다. 창 밖 원장 행은 소급 승격 절차가 계약에 생긴 뒤에만(§4-3 「v1 없음」). */
const 되돌아보기일 = 7;

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return 봉투(405, { error: 'method_not_allowed' });
  if (!서비스역할(req)) return 봉투(403, { error: 'service_role_only' });

  /* 계약판은 DB 에게 묻는다(events·deliver·radio-ingest 와 같은 근거). 🔴 c11 게이트:
   * c11 전 DB 에 '라디오퀴즈' 등을 넣으면 CHECK 가 거절한다 — 절반 승격보다 멈춤이 낫다. */
  const [{ 최신조각 }] = await sql`
    select name as 최신조각 from engine.schema_migrations order by version desc limit 1`;
  const ver = String(최신조각 ?? '').match(/_(c\d+)\.sql$/)?.[1];
  if (!ver) {
    console.error('[radio-promote] schema_migrations 에서 계약판을 못 읽었다');
    return 봉투(500, { error: 'schema_ver_unreadable' });
  }
  if (Number(ver.slice(1)) < 11) return 봉투(503, { error: 'contract_below_c11', ver });

  const 지금 = new Date().toISOString();

  const 메시지들 = await sql`
    select message_id, channel_id, body, sent_at, command_kind, command_arg
      from radio.chat_message
     where command_kind = any(${Object.keys(승격표)})
       and sent_at > now() - make_interval(days => ${되돌아보기일})
     order by sent_at asc
     limit 5000`;
  if (!메시지들.length) {
    return 봉투(200, { ok: true, ver, 검토: 0, 승격: 0, 중복: 0, 제외: {}, 승격판 });
  }

  const 채널들 = [...new Set(메시지들.map((m) => String(m.channel_id)))];
  const 링크들 = await sql`
    select channel_id, learner_id, confirmed_at, unlinked_at
      from radio.viewer_link where channel_id = any(${채널들})`;
  const 학생ids = [...new Set(링크들.map((l) => String(l.learner_id)))];

  const 라운드들 = await sql`
    select round_id, task_ref, task_snapshot, shown_at, closed_at, retry_of_round_id
      from radio.quiz_round where shown_at > now() - make_interval(days => ${되돌아보기일 + 1})`;
  const 카드들 = await sql`
    select content_ref, content_snapshot, shown_from, shown_to
      from radio.subtitle_card_log where shown_from > now() - make_interval(days => ${되돌아보기일 + 1})`;

  const 학생행 = 학생ids.length ? await sql`
    select learner_id, level_current, goal_track from engine.learners
     where learner_id = any(${학생ids}::uuid[])` : [];
  const 동의행 = 학생ids.length ? await sql`
    select learner_id, consent_id, consent_ver, agreed_at, revoked_at from engine.consents
     where learner_id = any(${학생ids}::uuid[])` : [];

  const 키들 = 메시지들.map((m) => String(m.message_id));
  const 이미행 = await sql`
    select idempotency_key from engine.learning_events where idempotency_key = any(${키들})`;
  const 라운드짝 = await sql`
    select learner_id, payload->>'round_id' as round_id from engine.learning_events
     where event_type = 'quiz.answered' and task_type = '라디오퀴즈'
       and occurred_at > now() - make_interval(days => ${되돌아보기일 + 1})
       and payload ? 'round_id'`;

  const 동의들: Record<string, unknown[]> = {};
  for (const c of 동의행) (동의들[String(c.learner_id)] ||= []).push(c);
  const 학생들: Record<string, unknown> = {};
  for (const l of 학생행) 학생들[String(l.learner_id)] = l;

  const { 계획, 제외 } = 승격계획({
    메시지들, 라운드들, 링크들, 동의들, 학생들, 카드들,
    이미승격키: new Set(이미행.map((r) => String(r.idempotency_key))),
    이미승격라운드: new Set(라운드짝.map((r) => `${r.learner_id}:${r.round_id}`)),
    지금,
  });

  /* skill 실재 대조 — 수집 문(functions/events)과 같은 근거. 시드 없는 skill 을 실은 행은
   * 지어내지 않고 제외로 센다(시드는 c11 조각이 승격보다 먼저 심는다 — 여기 걸리면 그건
   * 스냅샷과 팩이 갈린 날이고, 그 갈림이 분모로 드러나는 것이 이 검사의 몫이다). */
  const 스킬합 = [...new Set(계획.flatMap((p) => (p.skill_ids as string[] | undefined) ?? []))];
  const 있는스킬 = 스킬합.length ? new Set((await sql`
    select skill_id from engine.skills where skill_id = any(${스킬합})`)
    .map((r) => String(r.skill_id))) : new Set<string>();
  const 확정 = [];
  for (const p of 계획) {
    const 없는것 = ((p.skill_ids as string[] | undefined) ?? []).filter((id) => !있는스킬.has(id));
    if (없는것.length) 제외.push({ message_id: String(p.idempotency_key), command_kind: '답', 사유: 'skill미등재' });
    else 확정.push(p);
  }

  let 승격수 = 0;
  let 중복수 = 0;
  const 방금 = new Map<string, string>(); // `${learner}:${round_id}` → event_id (재도전 고리)

  try {
    await sql.begin(async (tx) => {
      for (const 행 of 확정) {
        /* 60초 재도전 고리 — 1차 승격 행을 (learner, round) 로 푼다. 같은 묶음 안이면 방금 넣은
         * 행, 앞선 실행분이면 DB. 1차가 승격 안 된 재도전은 고리 없이 넣는다(지어내지 않는다). */
        let retry_of: string | null = null;
        const 부모라운드 = 행.retry_parent_round_id as string | null;
        if (부모라운드) {
          retry_of = 방금.get(`${행.learner_id}:${부모라운드}`) ?? null;
          if (!retry_of) {
            const r = await tx`
              select event_id from engine.learning_events
               where learner_id = ${행.learner_id as string}::uuid
                 and event_type = 'quiz.answered' and payload->>'round_id' = ${부모라운드}
               limit 1`;
            retry_of = r.length ? String(r[0].event_id) : null;
          }
        }

        const 넣기 = await tx`
          insert into engine.learning_events (
            learner_id, event_type, task_type, actor_kind, occurred_at, correlation_id,
            idempotency_key, retry_of_event_id, skill_ids, skill_taxonomy_ver,
            level_snapshot, goal_snapshot, consent_id, consent_ver, source_kind, payload, schema_ver
          ) values (
            ${행.learner_id as string}::uuid, ${행.event_type as string},
            ${(행.task_type ?? null) as string | null}, 'learner',
            ${행.occurred_at as string}::timestamptz, ${행.correlation_id as string}::uuid,
            ${행.idempotency_key as string}, ${retry_of}::uuid,
            ${((행.skill_ids as string[] | undefined) ?? []) as string[]},
            ${(행.skill_taxonomy_ver ?? null) as string | null},
            ${(행.level_snapshot ?? null) as string | null}, ${(행.goal_snapshot ?? null) as string | null},
            ${행.consent_id as string}::uuid, ${행.consent_ver as string},
            ${사건출처(String(행.event_type))}::engine.source_kind,
            ${sql.json((행.payload ?? {}) as Record<string, unknown>)}, ${ver}
          )
          on conflict (learner_id, idempotency_key) do nothing
          returning event_id`;
        if (!넣기.length) { 중복수 += 1; continue; }
        승격수 += 1;
        const event_id = String(넣기[0].event_id);

        const p = 행.payload as Record<string, unknown> | undefined;
        if (p && p.round_id) 방금.set(`${행.learner_id}:${p.round_id}`, event_id);

        const s = 행.submission as Record<string, unknown> | undefined;
        if (s) {
          await tx`
            insert into engine.submissions (
              event_id, task_type, task_format, task_ref, task_snapshot, task_schema_ver,
              body_original, occurred_at, schema_ver
            ) values (
              ${event_id}::uuid, ${행.task_type as string}, ${s.task_format as string},
              ${s.task_ref as string}, ${sql.json(s.task_snapshot as Record<string, unknown>)},
              ${s.task_schema_ver as string}, ${(s.body_original ?? null) as string | null},
              ${행.occurred_at as string}::timestamptz, ${ver}
            )`;
        }
      }
    });
  } catch (e) {
    /* 전건 롤백 — 반쯤 승격된 묶음을 남기지 않는다. 다음 실행이 멱등으로 처음부터 다시 간다. */
    console.error('[radio-promote] 승격 트랜잭션 실패', String((e as Error)?.message ?? e));
    return 봉투(500, { error: 'promote_failed' });
  }

  const 제외셈: Record<string, number> = {};
  for (const x of 제외) 제외셈[x.사유] = (제외셈[x.사유] || 0) + 1;

  /* 분모 명시(§9) — 몇 건 보고 몇 건 넣고 몇 건 왜 뺐나. 「조용한 0」이 이 응답의 적이다. */
  return 봉투(200, {
    ok: true, ver, 검토: 메시지들.length, 승격: 승격수, 중복: 중복수, 제외: 제외셈, 승격판,
  });
});
