/* 라디오 승격기 Fn — 원장(radio.*) → engine.learning_events 의 **문** (설계 §4-3 · c11 · Lane B)
 *
 * ■ 층 분리 (P0 ④와 같은 이유)
 *   판정(링크·동의·중복·마감·해석·규격·하루접기)은 전부 `라디오승격.mjs`(= lib/라디오승격.js)다 —
 *   여기는 조회·insert·재도전 고리 풀기만 한다. fetch 옆의 판정은 회귀가 원리상 못 닿는다.
 *
 * ■ 호출자
 *   `pg_cron` 이 `Authorization: Bearer <service_role>` 로 부른다(deliver 와 같은 자리 ·
 *   등록 조각 = `migrations/20260812130000_cron_radio_c11.sql` — 반박 ⑦: 조각 없이는
 *   배포해도 아무도 안 불러 「도달 0」과 「활동 0」이 같은 모양이 된다).
 *   학생 토큰은 여기 못 들어온다 — 승격 사건의 절반이 `이벤트검증` 앱사건이지만 이 문은
 *   앱 문(functions/events)이 아니라 내부 생산자다(intervention.delivered 를 deliver 가
 *   직접 넣는 것과 같은 자리 · 원장이 이미 관측을 들고 있다).
 *
 * ■ 원장은 안 고친다
 *   제외(비링크·무동의·마감후·중복·해석불가·링크겹침·하루접힘…)는 응답의 **분모**로 나간다.
 *   별도 제외 표 없음 — 링크·동의·라운드가 전부 이력이라 「그때 왜 제외됐나」는 언제든
 *   재산출된다(설계 §4-3 주석).
 *
 * ■ 커서 진행 — 창이 차도 굶주리지 않는다 (반박 ④·⑭)
 *   옛 판은 `order by sent_at asc limit 5000` 한 방이라, 7일 창의 명령이 5000건을 넘으면
 *   매 실행이 가장 오래된 5000건만 집어 **새 메시지가 영원히 승격되지 않았다**(전부 이미승격 ·
 *   잘림 신호도 없음). 지금은 (sent_at, message_id) 키셋 커서로 배치를 이어 걷고, 배치마다
 *   자기 트랜잭션으로 닫는다 — 멱등이라 중간에 죽어도 다음 실행이 그 자리부터 따라잡는다
 *   (배치 롤백 단위가 「전 실행」에서 「한 배치」로 줄었을 뿐, 반쯤 승격된 배치는 여전히 없다).
 *   실행당 배치 상한을 넘기면 응답에 `잘림: true` 를 명시한다 — 조용한 절단이 이 문의 적이다.
 *
 * ■ 승격 행의 submissions 는 pipeline_jobs 트리거를 그대로 탄다
 *   자습체크인·목표선언의 「한 문장」은 실제 교정 대상이고(매일 한 문장 철학), 교정배치
 *   (functions/correct)의 대기 술어가 `event_type = 'submission.created'` 로 걸러 **퀴즈 행
 *   (quiz.answered)은 교정 큐에 들어가지 않는다** — 「형식으로 거른다」던 옛 주석은 거짓이었다
 *   (반박 ⑨ · task_format 은 그 술어에 없다). ⚠ 남는 실물: 퀴즈 submissions 행에도 트리거가
 *   pipeline_jobs 를 만들고 그 잡은 집는 소비자가 없어 queued 로 남는다 — 잡 생성 트리거와
 *   폐기 어휘는 검수 계약 몫이라 이 문이 손대지 않는다(반박 처분 기록 참조).
 */
import postgres from 'npm:postgres@3.4.4';
import 승격모듈 from './라디오승격.mjs';
import 출처모듈 from './사건출처.mjs';
import 토큰모듈 from './토큰.mjs';
import 계약판모듈 from './계약판.mjs';

const { 승격계획, 승격표, 승격판, 선호정서키 } = 승격모듈 as {
  승격판: string;
  승격표: Record<string, string>;
  선호정서키: (learner_id: string, 갈래: string, sent_at: unknown) => string;
  승격계획: (재료: Record<string, unknown>) => {
    계획: Array<Record<string, unknown>>;
    제외: Array<{ message_id: string; command_kind: string; 사유: string }>;
    승격판: string;
  };
};
const { 사건출처 } = 출처모듈 as { 사건출처: (event_type: string) => string | null };
const { 서비스역할 } = 토큰모듈 as { 서비스역할: (req: Request) => boolean };
const { 판번호, 행들에서판 } = 계약판모듈 as {
  판번호: (판: unknown) => number | null;
  행들에서판: (행들: unknown) => string | null;
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 되돌아보는 창(일). 봇이 죽었다 살아나도 이 창 안이면 승격이 따라잡는다 — 멱등이라
 * 겹쳐 읽기는 공짜다. 창 밖 원장 행은 소급 승격 절차가 계약에 생긴 뒤에만(§4-3 「v1 없음」). */
const 되돌아보기일 = 7;

/* 한 배치 = 한 트랜잭션 = 한 키셋 페이지. 값이 아니라 **눈금**이다 — 작을수록 실패 시 다시
 * 걷는 양이 줄고, 클수록 왕복이 준다. */
const 배치크기 = 1000;
/* 실행당 **시간 예산**(ms) — 재반박 ④가 잡았다: 배치 «개수» 상한은 커서를 저장하지 않는 이
 * 설계에서 굶주림 문턱을 5,000→N×배치크기로 올릴 뿐 구조가 같다(매 실행이 창 머리부터 걷고,
 * 이미승격 구간도 배치 수를 먹는다). 진짜 제약은 Edge 벽시계(실측 idle 150s)라 그것으로 자른다:
 * 이미승격 구간은 fetch+제외 셈뿐이라 배치당 수십 ms — 예산 안에서 실제 진행이 항상 앞으로
 * 나아가고, 예산이 끝나면 `잘림` 을 응답과 **로그 양쪽**에 낸다(새 치명 ② — cron 의
 * net.http_post 는 응답 본문을 안 읽는다). 폭주 백스톱으로 배치 수 상한도 남긴다. */
const 시간예산ms = 60_000;
const 최대배치 = 200;

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  /* 예산 시계는 핸들러 첫 줄에서 돈다(3차 반박) — 프리페치 뒤에서 시작하면 실제 벽시계가
   * 「프리페치 + 예산」이 되어 Edge 한도(실측 idle 150s)를 예산이 못 지킨다. */
  const 시작ms = Date.now();
  if (req.method !== 'POST') return 봉투(405, { error: 'method_not_allowed' });
  if (!서비스역할(req)) return 봉투(403, { error: 'service_role_only' });

  /* 계약판은 DB 에게 묻는다(events·deliver·radio-ingest 와 같은 근거). 🔴 c11 게이트:
   * c11 전 DB 에 '라디오퀴즈' 등을 넣으면 CHECK 가 거절한다 — 절반 승격보다 멈춤이 낫다.
   * ⚠ 0행 가드(반박 ⑮)는 `lib/계약판.js` 가 진다 — 빈 이력에서 죽으면 500 의 이유가 로그에
   * 안 남는다. 못 읽은 것은 못 읽었다고 말한다. */
  const 판행 = await sql`
    select name as 최신조각 from engine.schema_migrations order by version desc limit 1`;
  const ver = 행들에서판(판행);
  if (!ver) {
    console.error('[radio-promote] schema_migrations 에서 계약판을 못 읽었다');
    return 봉투(500, { error: 'schema_ver_unreadable' });
  }
  if ((판번호(ver) ?? 0) < 11) return 봉투(503, { error: 'contract_below_c11', ver });

  const 지금 = new Date().toISOString();

  /* 창 전체 공통 재료 — 배치와 무관하게 한 번만 걷는다. */
  const 라운드들 = await sql`
    select round_id, task_ref, task_snapshot, shown_at, closed_at, retry_of_round_id
      from radio.quiz_round where shown_at > now() - make_interval(days => ${되돌아보기일 + 1})`;
  const 카드들 = await sql`
    select content_ref, content_snapshot, shown_from, shown_to
      from radio.subtitle_card_log where shown_from > now() - make_interval(days => ${되돌아보기일 + 1})`;
  const 라운드짝 = await sql`
    select learner_id, payload->>'round_id' as round_id from engine.learning_events
     where event_type = 'quiz.answered' and task_type = '라디오퀴즈'
       and occurred_at > now() - make_interval(days => ${되돌아보기일 + 1})
       and payload ? 'round_id'`;
  /* 선호·정서 하루 접기(반박 ⑥)의 「이미 승격된 날」 — 키 조립은 lib 의 `선호정서키` 하나다.
   * ⚠ stated_via 로 **라디오 표면만** 걷는다(재반박 경미 ⑧) — c11 이 affect.reported 를
   * 앱사건으로도 열어 두어, 정의적 여과막 화면이 서는 날 앱 아침 신고가 저녁 `!슬럼프` 를
   * 접어 버린다. 접기는 방송 채팅 반복을 죽이는 장치지 표면 간 장치가 아니다. */
  const 하루행 = await sql`
    select learner_id, occurred_at,
           coalesce(payload->>'preference_dimension', payload->>'affect_kind') as 갈래
      from engine.learning_events
     where event_type in ('preference.stated', 'affect.reported')
       and payload->>'stated_via' = 'radio_chat'
       and occurred_at > now() - make_interval(days => ${되돌아보기일 + 1})`;

  const 이미승격라운드 = new Set(라운드짝.map((r) => `${r.learner_id}:${r.round_id}`));
  const 이미하루키 = new Set(
    하루행.filter((r) => r.갈래).map((r) => 선호정서키(String(r.learner_id), String(r.갈래), r.occurred_at)),
  );

  let 검토 = 0;
  let 승격수 = 0;
  let 중복수 = 0;
  let 배치수 = 0;
  let 완주 = false;
  const 제외셈: Record<string, number> = {};
  const 세기 = (사유: string, n = 1) => { 제외셈[사유] = (제외셈[사유] || 0) + n; };
  const 방금 = new Map<string, string>(); // `${learner}:${round_id}` → event_id (재도전 고리 · 실행 전체)
  /* 커서의 sent_at 은 **text 로 받는다**(재반박 경미 ⑥) — 드라이버가 timestamptz 를 JS Date(ms)로
   * 접으면 µs 가 잘려 경계 행을 매 배치 다시 읽고, 같은 ms 에 배치크기 이상이 몰리면 전진이
   * 멈춘다. text 왕복은 µs 를 그대로 보존한다. */
  let 커서: { sent_at글자: string; message_id: string } | null = null;

  while (배치수 < 최대배치 && Date.now() - 시작ms < 시간예산ms) {
    /* 커서 직렬화는 to_char 로 형식을 못박는다(3차 반박) — `::text` 는 세션 DateStyle GUC 를
     * 타서 롤 설정이 갈리는 날 커서가 조용히 어긋난다. 이 형식은 어느 DateStyle 에서도
     * 같은 값으로 되읽힌다(TimeZone=UTC 실측 · µs 보존). */
    const 메시지들 = await sql`
      select message_id, channel_id, body, sent_at,
             to_char(sent_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00' as sent_at글자,
             command_kind, command_arg
        from radio.chat_message
       where command_kind = any(${Object.keys(승격표)})
         and sent_at > now() - make_interval(days => ${되돌아보기일})
         ${커서 ? sql`and (sent_at, message_id) > (${커서.sent_at글자}::timestamptz, ${커서.message_id})` : sql``}
       order by sent_at asc, message_id asc
       limit ${배치크기}`;
    if (!메시지들.length) { 완주 = true; break; }
    배치수 += 1;
    검토 += 메시지들.length;
    커서 = { sent_at글자: String(메시지들[메시지들.length - 1].sent_at글자), message_id: String(메시지들[메시지들.length - 1].message_id) };

    const 채널들 = [...new Set(메시지들.map((m) => String(m.channel_id)))];
    const 링크들 = await sql`
      select channel_id, learner_id, confirmed_at, unlinked_at
        from radio.viewer_link where channel_id = any(${채널들})`;
    const 학생ids = [...new Set(링크들.map((l) => String(l.learner_id)))];

    const 학생행 = 학생ids.length ? await sql`
      select learner_id, level_current, goal_track from engine.learners
       where learner_id = any(${학생ids}::uuid[])` : [];
    const 동의행 = 학생ids.length ? await sql`
      select learner_id, consent_id, consent_ver, agreed_at, revoked_at from engine.consents
       where learner_id = any(${학생ids}::uuid[])` : [];

    const 키들 = 메시지들.map((m) => String(m.message_id));
    const 이미행 = await sql`
      select idempotency_key from engine.learning_events where idempotency_key = any(${키들})`;

    const 동의들: Record<string, unknown[]> = {};
    for (const c of 동의행) (동의들[String(c.learner_id)] ||= []).push(c);
    const 학생들: Record<string, unknown> = {};
    for (const l of 학생행) 학생들[String(l.learner_id)] = l;

    const { 계획, 제외 } = 승격계획({
      메시지들, 라운드들, 링크들, 동의들, 학생들, 카드들,
      이미승격키: new Set(이미행.map((r) => String(r.idempotency_key))),
      이미승격라운드, 이미하루키, 지금,
    });
    for (const x of 제외) 세기(x.사유);

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
      /* 옛 판은 여기서 제외 행에 command_kind: '답' 을 **손값**으로 적었다(반박 ⑬) — 지금은
       * 명령이 필요한 자리가 없고(분모는 사유별 합만 나간다), 필요해지면 계획 행이 든
       * `command_kind`(승격계획이 싣는다)를 쓴다 — 손값을 다시 적지 않는다. */
      if (없는것.length) 세기('skill미등재');
      else 확정.push(p);
    }

    /* 카운터는 배치 지역값으로 세고 **커밋된 뒤에만** 누계에 더한다(재반박 경미 ⑤) — tx 안에서
     * 전역을 올리면 롤백된 행이 500 응답에 「앉았다」로 나간다. 세트(방금·이미…)는 실패 시
     * 즉시 return 이라 오염이 다음 배치에 닿지 않는다. */
    let 배치승격 = 0;
    let 배치중복 = 0;
    try {
      await sql.begin(async (tx) => {
        for (const 행 of 확정) {
          /* 60초 재도전 고리 — 1차 승격 행을 (learner, round) 로 푼다. 같은 실행 안이면 방금
           * 넣은 행, 앞선 실행분이면 DB. 1차가 승격 안 된 재도전은 고리 없이 넣는다. */
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
          if (!넣기.length) { 배치중복 += 1; continue; }
          배치승격 += 1;
          const event_id = String(넣기[0].event_id);

          const p = 행.payload as Record<string, unknown> | undefined;
          if (p && p.round_id) {
            방금.set(`${행.learner_id}:${p.round_id}`, event_id);
            이미승격라운드.add(`${행.learner_id}:${p.round_id}`); // 다음 배치의 중복 판정 재료
          }
          if (행.하루키) 이미하루키.add(String(행.하루키));       // 다음 배치의 하루 접기 재료

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
      /* 배치 롤백 — 반쯤 승격된 «배치»를 남기지 않는다. 앞 배치들은 이미 닫혔고 그게 맞다:
       * 멱등이라 다음 실행이 이 배치부터 다시 간다. `승격` 은 커밋된 수만 담는다(경미 ⑤). */
      console.error('[radio-promote] 승격 트랜잭션 실패(배치 ' + 배치수 + ')', String((e as Error)?.message ?? e));
      return 봉투(500, { error: 'promote_failed', 배치: 배치수, 검토, 승격: 승격수 });
    }
    승격수 += 배치승격;
    중복수 += 배치중복;

    if (메시지들.length < 배치크기) { 완주 = true; break; }
  }

  /* 잘림은 로그에도 낸다(새 치명 ② — cron 의 net.http_post 는 응답 본문을 소비하지 않는다.
   * deliver 의 배치 미달 경고와 같은 자리·같은 채널이다). 응답 body 는 왕복시험 몫으로 그대로. */
  if (!완주) {
    console.error('[radio-promote] 🔴 잘림 — 시간 예산 안에 창을 다 못 걸었다(다음 실행이 잇는다)',
      JSON.stringify({ 검토, 승격: 승격수, 배치: 배치수 }));
  }

  /* 분모 명시(§9) — 몇 건 보고 몇 건 넣고 몇 건 왜 뺐나. 「조용한 0」이 이 응답의 적이다. */
  return 봉투(200, {
    ok: true, ver, 검토, 승격: 승격수, 중복: 중복수, 제외: 제외셈,
    배치: 배치수, 잘림: !완주, 승격판,
  });
});
