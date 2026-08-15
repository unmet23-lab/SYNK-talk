/* 회차 단위 장부 — cron 이 «무엇을 냈는지»를 오래 사는 표에 남긴다 (조용한 실패 장부 ④)
 *
 * ■ 왜 이 조각인가 — 계기는 추측이 아니라 실측이다(2026-08-15 07:30Z · 운영 qiwxeddwwnzkwalpsuty):
 *   · `cron.job_run_details` : **972건 · 6일치**(08-09~)가 살아 있고 **전부 `succeeded`**.
 *     `net.http_post` 는 **비동기 발사**라 SQL 은 함수가 죽어도 성공한다 — 이 표는
 *     「회차가 돌았나」까지만 말하고 「무엇을 냈나」는 **원리상 못 본다**.
 *   · `net._http_response` : **42건 · 5시간 50분치**뿐(`pg_net.ttl = 6 hours` 실측). 그리고 열이
 *     `id·status_code·content_type·headers·content·timed_out·error_msg·created` 라 **url 이 없다**.
 *     응답만 걷어서는 「어느 cron 이었나」를 **가릴 재료가 없다**.
 *   · 겹치는 구간 = 972 중 42 = **4.3%**. 회차의 95.7% 는 「돌았다」만 남고 결과는 영영 모른다.
 *
 * 🔴 그래서 장부에 적혀 있던 처방(「응답 표를 걷어 표에 옮기면 된다 — cron 4개 한꺼번에」)은
 *   **그것만으로 안 선다.** 부르는 쪽이 발사 번호를 스스로 적어야 귀속이 산다. 그 자리가 여기다.
 *
 * 🔑 **SQL 층에서 죽는 갈래가 따로 있다** — 리허설 실측: radio 잡이 `url` NULL(vault 시크릿 빈칸)로
 *   **16회 전부** 죽어 HTTP 호출이 0회였고, 15시간 동안 아무도 몰랐다. 그 실패는 응답 표에
 *   **도달조차 못 한다**. `ops.발사()` 가 그 예외를 잡아 «발사실패» 로 적는다.
 *
 * ⛔ 엣지 함수는 한 줄도 안 바꾼다. 잡 이름·주기·URL·헤더·본문 전부 그대로다 —
 *   바뀌는 것은 「누가 http_post 를 부르는가」 하나뿐(직접 → `ops.발사` 경유).
 *   URL 조립을 **잡 몸통에 그대로 둔 것은 일부러다**: `tests/조용한실패.test.js` 가 마이그레이션에서
 *   「이어붙인 함수 경로」를 훑어 cron 함수 목록을 뽑는다. 함수 안으로 감추면 그 분모가 조용히 낡는다.
 *   ⚠ 그래서 이 파일의 **주석에도** 그 꼴을 예시로 적지 않는다 — 주석 한 줄이 그 목록에 유령을
 *     하나 더한다(초판이 그랬고 `tests/회차장부.test.js` 가 잡았다).
 *
 * ⚠ **대가 — 장부가 본업을 막으면 안 된다.** `ops.발사()` 는 http_post 를 **먼저** 하고, 장부 기입은
 *   따로 감싸 실패해도 삼킨다(부르는 일은 이미 끝났으므로). 장부가 통째로 깨져도 cron 은 계속 부른다.
 *   틀릴 때의 모습: 장부는 비었는데 함수는 정상 동작 — 그래서 `ops.회차_대조` 가
 *   `cron.job_run_details` 와 건수를 맞대 「돈 횟수 > 적힌 횟수」를 드러낸다(자기 침묵을 자기가 못 봄 방지).
 *
 * 🔑 제약 이름은 `_c11` 을 **붙인다**. 처음엔 「ops 는 계약 밖이니 접미사도 빼자」고 지었는데,
 *   `tests/L0스키마.test.js` 가 **저장소의 모든 CHECK** 에 계약 접미사를 요구한다(실측으로 빨개졌다).
 *   그 규칙이 옳다 — 접미사 없는 제약은 계약이 올라갈 때 「고쳐야 하나」를 아무도 안 묻게 된다.
 *   대신 이 조각은 engine·radio 를 한 칸도 안 건드리므로 판정 블록의 기대값은 앞 조각 것 그대로다.
 *
 * 되돌림:
 *   select cron.unschedule('ops-harvest');
 *   -- 잡 넷을 옛 몸통으로: 20260809070000 / 20260812130000 조각의 cron.schedule 블록 재실행
 *   drop schema ops cascade;
 *   delete from engine.schema_migrations where version='20260815080000'; */

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $migration$
declare
  migration_version constant text := '20260815080000';
  migration_name constant text := '20260815080000_cron_ledger_c11.sql';
  expected_checksum constant text := 'f469945ef1f94713ef9636fdb66181aa4e0e50cb61ba3dcdaae8c3d3f2261166'; -- migration-checksum
  base_version constant text := '20260814110000';
  recorded_checksum text;
  걸린잡수 int;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c11 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
  end if;

  select checksum into recorded_checksum
    from engine.schema_migrations
   where version = migration_version;

  if found then
    if recorded_checksum is distinct from expected_checksum then
      raise exception
        'migration % checksum 불일치: DB=%, 파일=% — 같은 버전을 고쳐 쓰지 않는다',
        migration_version, recorded_checksum, expected_checksum;
    end if;
    return;
  end if;

  if not exists (select 1 from engine.schema_migrations where version = base_version) then
    raise exception
      '이 조각은 기준선 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;

  /* ── ① 관측층 스키마 ─────────────────────────────────────────────────────
   * engine·radio 와 나란히 두지 않는다 — 학습 계약(c11)의 표가 아니라 운영 관측 표다.
   * 계약 표에 섞으면 c11 판정·왕복시험·권한 검사가 전부 이 표까지 재게 된다. */
  create schema if not exists ops;

  /* ── ② 회차 장부 본체 ────────────────────────────────────────────────────
   * 한 행 = 「cron 이 함수를 한 번 불렀다」. `pipeline_jobs` 로는 못 앉는 단위다
   * (거긴 `submission_id unique` 라 제출 단위이고, 회차·재시도가 구조적으로 안 들어간다). */
  create table if not exists ops.cron_runs (
    id           bigserial primary key,
    jobname      text        not null,
    /* net.http_post 가 준 발사 번호. null = 발사 자체가 못 나갔다(리허설 16건의 모양). */
    request_id   bigint,
    queued_at    timestamptz not null default now(),
    outcome      text        not null,
    status_code  integer,
    timed_out    boolean,
    error_msg    text,
    /* 봉투 본문 — ②가 talk 에 붙인 «왜»(사유 칸)가 여기로 흘러 들어와 오래 산다. */
    body         text,
    harvested_at timestamptz,
    /* 🔑 닫힌 어휘로 못박는다 — 오타 하나가 조용히 새 갈래를 만들면 분모가 갈라진다.
     *   그건 이 장부가 없애려던 실패 모양 그 자체다. */
    constraint cron_runs_outcome_c11 check (outcome in
      ('대기', '성공', '실패', '타임아웃', '전송오류', '상태없음', '유실', '발사실패'))
  );

  /* 수확이 매번 훑는 자리는 «대기» 뿐이다 — 부분 인덱스라 표가 커져도 비용이 안 는다. */
  create index if not exists cron_runs_대기_idx on ops.cron_runs (request_id) where outcome = '대기';
  create index if not exists cron_runs_시각_idx on ops.cron_runs (queued_at desc);

  /* 🔒 학생 토큰에게는 존재하지 않는 표다(철학 ㉣ 계열 — 운영 관측치는 밖으로 안 나간다).
   *   RLS 를 켜고 정책은 **하나도 안 만든다** = service_role 만 본다(그건 RLS 를 우회한다). */
  alter table ops.cron_runs enable row level security;
  revoke all on schema ops from anon, authenticated;
  revoke all on ops.cron_runs from anon, authenticated;

  /* ── ③ 발사 — 부르고, 번호를 적는다 ──────────────────────────────────────
   * 순서가 곧 안전 설계다: http_post 가 **먼저**, 장부는 그 뒤. 장부가 터져도 호출은 이미 나갔다. */
  create or replace function ops.발사(p_job text, p_url text) returns bigint
  language plpgsql
  as $fn$
  declare
    rid bigint;
  begin
    select net.http_post(
             url     := p_url,
             headers := jsonb_build_object(
                          'Content-Type',  'application/json',
                          'Authorization', 'Bearer ' ||
                            (select decrypted_secret from vault.decrypted_secrets
                              where name = 'service_role_key')),
             body    := '{}'::jsonb)
      into rid;

    begin
      insert into ops.cron_runs(jobname, request_id, outcome) values (p_job, rid, '대기');
    exception when others then
      /* 장부가 본업을 못 막는다 — 부르는 일은 위에서 이미 끝났다. */
      null;
    end;
    return rid;
  exception when others then
    /* 여기까지 왔다 = http_post 가 **못 나갔다**(URL NULL · 시크릿 빈칸 · 확장 없음 · 권한).
     * 리허설에서 16회 전부 이 모양이었고, 응답 표에는 흔적이 하나도 안 남았다. */
    insert into ops.cron_runs(jobname, request_id, outcome, error_msg)
         values (p_job, null, '발사실패', left(sqlerrm, 500));
    return null;
  end
  $fn$;

  /* ── ④ 수확 — 6시간 안에 응답을 옮겨 적는다 ──────────────────────────────
   * `pg_net.ttl = 6 hours`(실측)라, 이 함수가 도는 주기가 곧 「무엇을 냈는지」의 보존 기간이다. */
  create or replace function ops.수확() returns jsonb
  language plpgsql
  as $fn$
  declare
    v수확 int := 0;
    v유실 int := 0;
  begin
    update ops.cron_runs r
       set status_code  = resp.status_code,
           timed_out    = resp.timed_out,
           error_msg    = resp.error_msg,
           body         = left(resp.content, 2000),
           harvested_at = now(),
           outcome      = case
                            when coalesce(resp.timed_out, false)      then '타임아웃'
                            when resp.error_msg is not null           then '전송오류'
                            when resp.status_code is null             then '상태없음'
                            when resp.status_code between 200 and 299 then '성공'
                            else '실패'
                          end
      from net._http_response resp
     where resp.id = r.request_id
       and r.outcome = '대기';
    get diagnostics v수확 = row_count;

    /* 끝내 응답이 안 온 것 = 유실. 요청 타임아웃이 5초라 30분이면 넉넉하다 —
     * 이 칸이 0이 아닌 날은 pg_net 자체가 밀렸다는 뜻이고, 그것도 알아야 할 사실이다. */
    update ops.cron_runs
       set outcome = '유실', harvested_at = now()
     where outcome = '대기'
       and queued_at < now() - interval '30 minutes';
    get diagnostics v유실 = row_count;

    return jsonb_build_object('수확', v수확, '유실', v유실);
  end
  $fn$;

  /* ── ⑤ 읽는 자리 ─────────────────────────────────────────────────────────
   * 🔑 ③(건 단위 사유)이 «writer 만 세우고 reader 0» 으로 끝난 자리를 여기서 반복하지 않는다.
   *   두 뷰가 각각 다른 질문에 답한다 — 하나로 합치면 어느 쪽이 침묵인지 안 보인다. */

  /* 「무엇을 냈나」 — 분모를 갈래로 쪼갠다(합계만 보면 좋은 0과 안 재본 0이 같은 모양이다). */
  create or replace view ops.회차_요약 as
  select jobname,
         count(*)                                          as 전체,
         count(*) filter (where outcome = '성공')            as 성공,
         count(*) filter (where outcome = '실패')            as 실패,
         count(*) filter (where outcome = '타임아웃')         as 타임아웃,
         count(*) filter (where outcome = '전송오류')         as 전송오류,
         count(*) filter (where outcome = '상태없음')         as 상태없음,
         count(*) filter (where outcome = '발사실패')         as 발사실패,
         count(*) filter (where outcome = '유실')            as 유실,
         count(*) filter (where outcome = '대기')            as 대기,
         max(queued_at)                                    as 마지막발사,
         max(queued_at) filter (where outcome <> '성공')     as 마지막이상
    from ops.cron_runs
   where queued_at > now() - interval '7 days'
   group by jobname;

  /* 「장부 자신이 침묵하고 있나」 — cron 은 돌았는데 행이 없으면 여기서 드러난다.
   * 가드는 자기 전처리에 눈이 먼다: `ops.발사` 가 통째로 안 불리면 위 요약은 **조용히 비어 있다**. */
  create or replace view ops.회차_대조 as
  with 돈것 as (
    select j.jobname, count(*) as 돈횟수, max(d.start_time) as 마지막회차,
           count(*) filter (where d.status <> 'succeeded') as SQL층실패
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where d.start_time > now() - interval '24 hours'
     group by j.jobname
  ), 적힌것 as (
    select jobname, count(*) as 적힌횟수
      from ops.cron_runs
     where queued_at > now() - interval '24 hours'
     group by jobname
  )
  select coalesce(돈것.jobname, 적힌것.jobname)                  as jobname,
         coalesce(돈횟수, 0)                                    as 돈횟수,
         coalesce(적힌횟수, 0)                                   as 적힌횟수,
         coalesce(돈횟수, 0) - coalesce(적힌횟수, 0)              as 안적힌횟수,
         coalesce(SQL층실패, 0)                                 as SQL층실패,
         마지막회차
    from 돈것 full join 적힌것 on 돈것.jobname = 적힌것.jobname;

  /* ── ⑥ 잡 넷을 장부 경유로 다시 건다(이름·주기·URL 불변) ────────────────
   * ⛔ **잡을 «새로» 만들지 않는다 — 이미 걸린 것만 다시 건다.**
   *   20260809070000·20260812130000 두 조각은 「리허설엔 일부러 안 붓는다」를 정책으로 적어 뒀다
   *   (스케줄러가 돌면 옆 세션 왕복시험의 원장·엔진 상태를 흔든다). 그 정책을 이 조각이 조용히
   *   깨면 안 된다 — 리허설은 `cron.job` 0행이라(실측 08-15) 아래 분기가 통째로 안 돈다.
   * 🔑 판정을 «환경 이름»이 아니라 «지금 상태»로 한다. 이름으로 가르면 프로젝트가 늘어나는 날
   *   조용히 틀리고, 그 틀림은 「잡이 안 걸렸다」가 아니라 「잡이 더 걸렸다」로 나온다. */
  select count(*) into 걸린잡수
    from cron.job
   where jobname in ('deliver-daily', 'deliver-check', 'transcribe-batch', 'radio-promote-hourly');

  if 걸린잡수 = 0 then
    raise notice '[cron_ledger] 잡이 하나도 안 걸린 DB 다 — 표·함수·뷰만 세우고 스케줄은 건드리지 않는다(리허설 정책).';
  else

  perform cron.unschedule(jobname)
    from cron.job
   where jobname in ('deliver-daily', 'deliver-check', 'transcribe-batch',
                     'radio-promote-hourly', 'ops-harvest');

  perform cron.schedule('deliver-daily', '5 16 * * *', $job$
    select ops.발사('deliver-daily',
      (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver');
  $job$);

  perform cron.schedule('deliver-check', '35 16 * * *', $job$
    select ops.발사('deliver-check',
      (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver?%EC%A0%90%EA%B2%80');
  $job$);

  perform cron.schedule('transcribe-batch', '*/10 * * * *', $job$
    select ops.발사('transcribe-batch',
      (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/transcribe');
  $job$);

  perform cron.schedule('radio-promote-hourly', '21 * * * *', $job$
    select ops.발사('radio-promote-hourly',
      (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/radio-promote');
  $job$);

  /* 수확은 5분마다 — TTL 6시간의 1/72 이라 pg_net 이 크게 밀려도 놓칠 창이 없다.
   * ⚠ 이 잡은 URL 이 없다(순수 SQL) — `tests/조용한실패.test.js` 의 slug 추출에 안 잡힌다.
   *   그래서 그 회귀에 「URL 없는 cron 도 센다」를 같은 커밋에서 함께 넣는다(등록층 사각). */
  perform cron.schedule('ops-harvest', '*/5 * * * *', $job$
    select ops.수확();
  $job$);

  end if;

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- ============================================================================
-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'),
  ('learning_events', 'request_hash'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('learning_events','correction_id'),
  ('learning_events','consent_id'),
  -- 동의 출처(20260807140000)
  ('consents','recorded_by'),
  -- 추정메타 물리 칸(20260807170000 · 절단문서 ①-7)
  ('learning_events','source_kind'), ('learning_events','estimator_confidence'),
  ('learning_events','estimator_version'), ('learning_events','evidence_refs'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
  -- 마감 시각·마감 판본(20260808010000 · 소급 불가 · 유호님 승인 2026-08-08)
  ('submissions','due_at'), ('submissions','due_ver'),
  -- 검수 확정이 담길 칸 넷(20260809090000 · 검수_내부계약 §5 — c10 으로 섰다)
  ('corrections','supersedes'), ('corrections','promotion_intent'),
  ('corrections','transcript_at_review'), ('pipeline_jobs','discard_reason'),
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at'),
  -- ⚠ 아래 세 묶음은 c7 뒤에 붙은 조각들이 낸 열이다. 이 확인 블록은 앞 조각에서
  --   베끼는 것이 아니라 바로 앞 조각에서 이어야 한다 — c8 초안이 20260806210000 의
  --   블록을 베껴 13열을 통째로 떨어뜨린 실측이 있다(빠진 검사 = 통과와 같은 모양).
  -- 학생 로그인(L0 §4-1·§4-2 · 20260806233000_auth_c7)
  ('learners','recovery_email'), ('learners','recovery_phone'),
  ('learners','temp_password_expires_at'), ('learners','signup_attempts'),
  -- 직원 인증·세션 폐기(L0 §4-5·§4-2 ③ · 20260806234000_staff_c7)
  ('learners','active'), ('learners','revoked_before'),
  ('staff','role'), ('staff','staff_id'), ('staff','active'), ('staff','revoked_before'),
  ('staff_access_log','action'), ('staff_access_log','target_ids'),
  -- 임시번호를 해시로 든다(L0 §4-2-2 · 20260807024500_temp_password_c7)
  ('learners','temp_password_hash'),
  -- 시즌 그릇 ①②(20260812140000 · 소급 불가 — 나침반은 그날 안 물으면 영원히 빈칸이다)
  ('season','textbook'), ('season','starts_on'), ('season','ends_on'),
  ('season_compass','answers'), ('season_compass','self_in_5y_changed'),
  ('season_compass','goal_track_at_open'), ('season_compass','recorded_by'),
  -- 시즌 회고 ③④(20260812170000) — 근거·라벨·대조군이 「한 행」에 있어야 한다(설계 §7).
  --   갈라 두면 창이 밀려 원리상 짝을 못 맞추고, 그릇은 화면으로 끝나고 엔진엔 안 닿는다.
  ('season_review','record_snapshot'), ('season_review','verdict'),
  ('season_review','verdict_by_self'), ('season_review','note'),
  ('season_review','opened_by'), ('season_review','opened_at'),
  ('season_review','decided_by'), ('season_review','decided_at'),
  -- 가입 1회 문항(20260806150000 이 낸 열 · 20260812180000 이 값을 조인다).
  --   열이 사라지면 「지역 억양 편차의 유일한 축」이 통째로 없어지는데, 그 손실은 조용하다 —
  --   가입은 그대로 성공하고 세 칸만 안 쌓인다(2026-08-09 에 실제로 그 상태였다).
  ('learners','home_aimag'), ('learners','gender'), ('learners','goal_track'),
  -- 반(20260812200000) — 좌표·시즌·활성이 전부 있어야 「지난 시즌 반」을 닫을 수 있다.
  --   `class_key` 가 빠지면 시트와 대조할 자연키가 사라지고, 어긋난 날 증상은 조용함뿐이다.
  ('classes','class_key'), ('classes','season_id'), ('classes','display_name'),
  ('classes','active'), ('classes','schema_ver'),
  ('learners','class_id'),
  ('staff_classes','staff_id'), ('staff_classes','class_id'), ('staff_classes','schema_ver'),
  -- 강사 한 마디(20260812210000) — `origin` 이 빠지면 설계 §6 도전안이 답 나는 날 이미 쌓인
  --   행의 갈래를 영원히 복원 못 한다. `updated_at` 이 빠지면 개서가 조용해진다.
  ('teacher_notes','submission_id'), ('teacher_notes','staff_id'), ('teacher_notes','body'),
  ('teacher_notes','origin'), ('teacher_notes','disposition'),
  ('teacher_notes','updated_at'), ('teacher_notes','schema_ver'),
  -- 조·좌석 거울(20260814100000 · 숙제서클 §10-3) — 빠지면 반 모드 판이 정의부터 죽는데,
  --   그 죽음은 합본을 부을 때만 보인다. 여기서 세면 「덜 부은 DB」가 이름으로 말한다.
  ('learners','group_no'), ('learners','seat_no')
), 기대제약(n) as (values
  ('learning_events_event_type_c11'), ('learning_events_task_type_c11'),
  ('submissions_task_format_c11'), ('submissions_translation_source_c11'),
  ('submissions_due_paired_c11'), ('corrections_verdict_c11'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c11'), ('staff_role_c11'),
  ('learners_temp_password_paired_c11'),
  ('learning_events_correction_target_c11'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c11'), ('corrections_promotion_intent_c11'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c11'),
  -- 시즌 그릇(20260812140000) — 겹침 배제·날짜 순서·학생×시즌 유일·문항 묶음 + 고리 둘.
  --   유일키가 빠지면 같은 시즌에 두 행이 서고, 회고가 어느 것을 왼쪽으로 쓸지 모른다.
  ('season_no_overlap_c11'), ('season_dates_c11'),
  ('season_compass_once_c11'), ('season_compass_answers_c11'),
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey'),
  -- 시즌 회고(20260812170000) — 판정 3갈래 둘 + 「판정·사유·주체·시각 한 벌」 + 고리 둘.
  --   값목록이 빠지면 오타 라벨('closser')이 그대로 앉고 엔진은 그걸 4번째 갈래로 배운다.
  ('season_review_once_c11'), ('season_review_verdict_c11'),
  ('season_review_self_c11'), ('season_review_decided_c11'),
  ('season_review_learner_id_fkey'), ('season_review_season_id_fkey'),
  -- 가입 1회 문항 값목록(20260812180000) — 세 칸 전부. 하나만 서면 나머지 둘은 여전히
  --   자유 입력이라, 「조였다」가 참인 칸과 거짓인 칸이 한 표에 섞인다.
  ('learners_home_aimag_c11'), ('learners_gender_c11'), ('learners_goal_track_c11'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  --   고리가 빠지면 없는 반·없는 강사를 가리키는 행이 앉고, 그건 화면에서 「빈 반」으로만 보인다.
  ('classes_pkey'), ('classes_key_nonblank_c11'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  -- 강사 한 마디(20260812210000) — 유일(한 산출물에 하나) + 값목록 둘 + 빈 말 금지 + 고리 둘.
  --   유일이 빠지면 「기다리는 것 n」의 뜻이 즉시 갈린다(마디 수인가 산출물 수인가).
  --   값목록이 빠지면 오타 갈래('writen')가 그대로 앉고, 그 행은 어느 갈래도 아니게 된다.
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c11'),
  ('teacher_notes_origin_c11'), ('teacher_notes_disposition_c11'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey'),
  -- 조·좌석 쓰레기 못(20260814100000) — 빠지면 시트 좌표 밀림이 조용히 앉는다.
  ('learners_group_no_c11'), ('learners_seat_no_c11'),
  -- companion 빈칸 로그(20260814110000) — 질문이 비면 로그가 아니고,
  --   답도 인계도 없으면 「답한 척」이 행으로 남는다.
  ('companion_qa_question_nonblank_c11'), ('companion_qa_answer_paired_c11'),
  ('companion_qa_staff_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000) — 행이 사라지는 것만 막는다(개서는 촉진 세션의 정상 통로)
  ('season_compass_protect'),
  -- 회고(20260812170000) — 굳힌 근거 불변 + 학생 판정은 강사 「전」에만 + 삭제 금지.
  --   freeze 가 꺼지면 재계산한 숫자로 옛 판정을 덮어쓸 수 있고 그건 조용히 통과한다.
  ('season_review_freeze'), ('season_review_protect'),
  -- 강사 한 마디 삭제 금지(20260812210000)
  ('teacher_notes_protect'),
  -- companion 빈칸 로그 개서·삭제 금지(20260814110000)
  ('companion_qa_immutable')
), 대상역할(r) as (values ('anon'), ('authenticated'))
, 대상권한(p) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
, 대상테이블(t) as (
  -- ⚠ 뷰는 pg_tables 에 없다. engine 첫 뷰(review_queue · 20260807190000)가 서면서 합쳤다 —
  --    안 합치면 뷰에 grant 가 붙어도 「새는테이블권한=0」이 그대로 초록이다.
  select tablename from pg_tables where schemaname='engine'
  union all
  select viewname from pg_views where schemaname='engine'
), 라디오테이블(t) as (
  -- radio 는 아직 뷰가 0이다 — 첫 뷰(구간 귀속·「그날」)가 서는 조각이 여기에 union 을 더한다.
  select tablename from pg_tables where schemaname='radio'
), 빠진열 as (
  select string_agg(t||'.'||c, ', ' order by t, c) v from 기대열 e
   where not exists (
     select 1 from information_schema.columns
      where table_schema='engine' and table_name=e.t and column_name=e.c
   )
), 빠진제약 as (
  select string_agg(n, ', ' order by n) v from 기대제약 e
   where not exists (
     select 1 from pg_constraint
      where connamespace=to_regnamespace('engine') and conname=e.n
   )
), 트리거상태 as (
  -- 🔴 존재만 묻지 않는다. 꺼진 트리거는 pg_trigger 에 행이 그대로 남고 tgenabled 만
  --    'D'(꺼짐)·'R'(복제본에서만)이 된다 — 안 잰 것을 통과로 내면 그건 확인이 아니다.
  select e.n,
         (select g.tgenabled from pg_trigger g
            join pg_class r on r.oid=g.tgrelid
           where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n) as 상태
    from 기대트리거 e
), 빠진트리거 as (
  -- 상태를 이름 옆에 붙인다 — 「없음」은 판을 부어야 하고 「꺼짐」은 enable 한 줄이라 처방이 갈린다.
  --    ⚠ `상태` 는 "char" 다 — text 와 직접 비교하면 Postgres 가 연산자를 못 고르고
  --    operator is not unique 로 쿼리 전체가 안 돈다 — 파일 층 검사는 이걸 못 본다(2026-08-07 실측).
  select string_agg(n || case when 상태 is null then '' else ' (꺼짐:' || 상태::text || ')' end,
                    ', ' order by n) v
    from 트리거상태 where 상태 is null or 상태 not in ('O', 'A')
), 현재이력xml as (
  select CASE WHEN to_regclass('engine.schema_migrations') is null THEN null::xml
              ELSE query_to_xml(
                'select version, name, checksum, applied_at::text as applied_at
                   from engine.schema_migrations order by applied_at desc, version desc limit 1',
                false, false, '') END as x
), 현재이력 as (
  select ((xpath('/table/row/version/text()', x))[1])::text as version,
         ((xpath('/table/row/name/text()', x))[1])::text as name,
         ((xpath('/table/row/checksum/text()', x))[1])::text as checksum,
         ((xpath('/table/row/applied_at/text()', x))[1])::text as applied_at
    from 현재이력xml
), 셈 as (select
  -- 🔑 17 그대로(20260814100000): 이 조각은 표를 안 만든다 — 뷰 하나와 열 둘뿐이다.
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 5 (20260812170000 이 4 에서 올렸다). 이 조각도 이 수를 안 건드린다 — 새 FK 가 없다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('engine') and contype='f'
      and confrelid=to_regclass('engine.learners') and confdeltype='r') as 삭제차단,
  (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typnamespace=to_regnamespace('engine')
      and t.typname='job_status' and e.enumlabel='failed') as 실패상태,
  (select count(*) from pg_policies
    where schemaname='engine' and tablename='schema_migrations') as 이력정책,
  -- 검수자 판(20260807190000 · 절단문서 ②-17): 뷰가 있고 옛 정책이 없어야 둘 다 맞다.
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue') as 검수뷰,
  (select count(*) from pg_policies
    where schemaname='engine' and policyname='inspector_queue_submissions') as 옛검수정책,
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출,
  -- 마감(20260808010000): c10 이 선 뒤에 만들어진 배정만 센다 — 옛 행의 마감은 아무도 모른다.
  (select count(*) from engine.submissions s
     join engine.learning_events e on e.event_id = s.event_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and s.occurred_at >= (select applied_at from engine.schema_migrations
                             where version = '20260808010000')) as 마감없는배정,
  -- 분모의 정본은 task.assigned 사건 하나다 — daily_activity.expected 에 값이 들어오면 빨개진다.
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염,
  -- 폐기 사유(20260809090000): 그 조각이 선 뒤에 갱신된 job 만 센다.
  (select count(*) from engine.pipeline_jobs j
    where j.status = 'discarded' and j.discard_reason is null
      and j.updated_at >= (select applied_at from engine.schema_migrations
                            where version = '20260809090000')) as 폐기사유없는폐기,
  -- 검수 판이 올라간 판인지(20260809050000): 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문,
  -- 🔴 회고(20260812170000): 라벨이 있는데 근거가 「비어 있는」 행 — 0이어야 한다.
  --    not null 은 「칸이 있다」만 보장하고 '{}' 는 통과시킨다. 근거 없는 라벨은 엔진으로
  --    그대로 흘러 들어가고, 그 오염은 나중에 가려낼 방법이 없다.
  (select count(*) from engine.season_review
    where verdict is not null
      and (record_snapshot = '{}'::jsonb
           or record_snapshot -> 'axes_전반' is null
           or record_snapshot -> 'axes_후반' is null)) as 근거없는라벨,
  -- 🔴 가입 1회 문항(20260812180000): 목록 밖 값이 앉은 행 — 0이어야 한다.
  --    CHECK 가 섰으므로 «앞으로»는 0 이 유지된다. 이 칸이 재는 것은 **CHECK 가 실제로
  --    걸려 있는가**다 — 제약이 빠진 DB 에서는 이 수가 조용히 오르고, 그때가 아이막 표기가
  --    섞이기 시작한 날이다(섞인 뒤엔 어느 표기가 어느 아이막이었는지 복원이 안 된다).
  (select count(*) from engine.learners
    where (home_aimag is not null and home_aimag not in (
             'ulaanbaatar','arkhangai','bayan-olgii','bayankhongor','bulgan','darkhan-uul',
             'dornod','dornogovi','dundgovi','govi-altai','govisumber','khentii',
             'khovd','khovsgol','omnogovi','orkhon','ovorkhangai','selenge',
             'sukhbaatar','tov','uvs','zavkhan'))
       or (gender is not null and gender not in ('female','male','undisclosed'))
       or (goal_track is not null and goal_track not in ('study','work','culture')))
    as 목록밖프로필,
  -- 🔴 반(20260812200000): 같은 좌표가 두 벌 앉은 반 — 0이어야 한다.
  --    이 칸이 재는 것은 **부분 유일 인덱스 둘이 실제로 걸려 있는가**다. 빠지면 명부 스윕이
  --    매 판 같은 반을 새로 만들고 학생마다 다른 class_id 가 붙는데, 증상은 「강사 큐에
  --    학생이 몇 명 없다」뿐이라 조용하다.
  (select count(*) from (
     select class_key, season_id from engine.classes
      group by class_key, season_id having count(*) > 1) d) as 겹친반좌표,
  (select count(*) from pg_indexes
    where schemaname='engine'
      and indexname in ('classes_key_in_season','classes_key_no_season')) as 반좌표유일,
  -- ── 라디오 원장(20260811160000 · radio 스키마) ──
  (select count(*) from pg_tables where schemaname='radio') as 라디오표수,
  (select count(*) from pg_tables where schemaname='radio' and rowsecurity) as 라디오RLS수,
  (select count(*) from pg_policies where schemaname='radio') as 라디오정책수,
  (select count(*) from 대상역할 r cross join 라디오테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','radio',t.t), p.p)) as 라디오새는권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('radio'), 'USAGE')) as 라디오새는스키마,
  -- c11 이 접미를 갈았다 — 옛 이름을 세면 「적용 전」과 「적용 후」가 같은 0 으로 보인다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('radio')
      and conname='broadcast_segment_kind_c11') as 라디오kind제약,
  -- 링크 보호 트리거 — 존재가 아니라 켜짐을 센다(engine 트리거상태와 같은 이유).
  (select count(*) from pg_trigger g
     join pg_class c2 on c2.oid=g.tgrelid
    where c2.relnamespace=to_regnamespace('radio')
      and g.tgname='viewer_link_protect' and g.tgenabled in ('O','A')) as 연동보호트리거,
  -- 활성 링크는 채널당 1개 — 부분 유일 인덱스가 서 있어야 §3 의 유일성이 물리다.
  (select count(*) from pg_indexes
    where schemaname='radio' and indexname='viewer_link_active') as 연동활성유일,
  -- ── c11: engine.skills 첫 시드(문항 팩 스킬표 30 · skills.v1) — 0이면 승격이 전건 거절된다.
  (select count(*) from engine.skills) as 스킬시드수,
  -- 🔴 강사 한 마디(20260812210000): 한 산출물에 두 마디가 앉은 것 — 0이어야 한다.
  --    유일 «제약»의 존재는 위 빠진제약이 이미 본다. 이 칸이 재는 것은 **데이터**다 —
  --    제약을 떼고 부은 DB 에서는 이 수가 조용히 오르고, 그때부터 「기다리는 것 n」이
  --    산출물 수가 아니라 마디 수를 세게 된다(강사가 보는 숫자가 뜻을 잃는다).
  (select count(*) from (
     select submission_id from engine.teacher_notes
      group by submission_id having count(*) > 1) d2) as 겹친한마디,
  -- ── 반 모드 판(20260814100000 · 숙제서클 §10-3) ──
  -- 판이 서 있는가 — 기본 판(검수뷰)과 별개로 센다(둘 중 하나만 선 DB 가 실재할 수 있다).
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue_class') as 반검수뷰,
  -- 기본 22열 + 정체 4열(class_id·display_name·group_no·seat_no). 수로 재야 「덜 넓힌 판」이 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class') as 반검수판열,
  -- 정체는 열되 원문 셋은 반 모드에서도 안 연다 — 기본 판의 「검수판원문=0」과 같은 못이다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 반검수판원문,
  -- ── companion 빈칸 로그(20260814110000 · 컴패니언_내부계약 §4) ──
  -- 11열 = qa_id·staff_id·at·screen·question·answer·cited_refs·handoff·handoff_reason·model·prompt_ver
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='companion_qa') as 컴패니언열,
  -- 이 표에는 어떤 토큰에게도 열지 않는다(감사표 선례) — 정책이 하나라도 붙으면 여기서 빨개진다.
  (select count(*) from pg_policies
    where schemaname='engine' and tablename='companion_qa') as 컴패니언정책
)
select case when 테이블수=18 and RLS켜짐=18 and 정책수=7
              and 새는테이블권한=0 and 새는스키마권한=0 and 삭제차단=5 and 실패상태=1
              and 이력정책=0 and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
              and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
              and 검수판열=22 and 검수판원문=0 and 근거없는라벨=0 and 목록밖프로필=0
              and 겹친반좌표=0 and 반좌표유일=2
              and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
              and 라디오새는권한=0 and 라디오새는스키마=0 and 라디오kind제약=1
              and 연동보호트리거=1 and 연동활성유일=1 and 스킬시드수=30
              and 겹친한마디=0
              and 반검수뷰=1 and 반검수판열=26 and 반검수판원문=0
              and 컴패니언열=11 and 컴패니언정책=0
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260815080000'
              and (select checksum from 현재이력)='f469945ef1f94713ef9636fdb66181aa4e0e50cb61ba3dcdaae8c3d3f2261166' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 18·18·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0 · 빠진 칸은 전부 비어 있어야 합니다)'
       end as 판정,
       (select version from 현재이력) as 현재버전,
       (select checksum from 현재이력) as checksum,
       (select name from 현재이력) as migration_name,
       (select applied_at from 현재이력) as applied_at,
       (select v from 빠진열) as 빠진열,
       (select v from 빠진제약) as 빠진제약,
       (select v from 빠진트리거) as 빠진트리거,
       *
from 셈;
*/

-- 확인
-- ⓪ 🔴 **순서** — 이 조각은 `20260814110000`(companion) «뒤»에만 선다(base_version).
--    앞 조각이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
--
-- ① 이 조각은 engine·radio 의 표·열·제약·트리거·정책을 **하나도 안 바꾼다**.
--    그래서 위 판정 블록의 기대값은 앞 조각의 것이 그대로 현행이다.
--    새로 생기는 것은 전부 `ops` 스키마 안이다 — 표 1 · 함수 2 · 뷰 2 · 인덱스 2 · RLS 1(정책 0).
--
-- ② 잡 다섯 실측 (부은 뒤 한 줄로 · **잡이 이미 걸려 있던 DB 에서만** 5 가 된다):
--      select jobname, schedule, active from cron.job order by jobname;
--    기대(운영): deliver-check · deliver-daily · ops-harvest · radio-promote-hourly · transcribe-batch
--    ⚠ 리허설은 잡이 0개인 것이 정책이다(옛 cron 조각 둘의 ⛔ 그대로) — 이 조각은 «이미 걸린 것만»
--      다시 걸므로 리허설에선 스케줄을 한 칸도 안 건드린다. 0 이 나오면 고장이 아니라 그 정책이다.
--
-- ③ 🔴 **첫 수확까지 최대 5분** — 부은 직후 `ops.cron_runs` 가 0행인 것은 정상이다.
--    「판이 섰다」를 「장부가 찼다」로 읽지 않는다. 처음 채워지는 것은 transcribe(10분마다)다:
--      node tools/회차장부.js            (운영은 SUPABASE_PROJECT_REF 덮어쓰기 · F462)
--
-- ④ 🔴 **대조를 먼저 본다.** `안적힌 > 0` 이면 cron 은 돌았는데 장부가 침묵한 것이고,
--    그건 이 조각 «자신»의 결함이다. 요약만 보면 그 침묵이 「조용하다 = 문제없다」로 읽힌다.
--    도구는 그 자리에서 종료 1 을 내고, 판이 아예 없으면 **종료 2(못 쟀다)** 로 갈라 낸다.
--
-- ⑤ 이 조각이 실제로 그 판으로 들어갔는지는 **위 판정 블록이 이미 본다**(`현재이력` 의 checksum 대조).
--    여기에 같은 검사를 또 적지 않는다 — 같은 판정을 두 곳에 적으면 갈라지고, 갈리는 쪽은
--    언제나 「덜 쓰이는 쪽」이라 낡은 채로 초록을 낸다.
--
-- ⑥ 계약 §6 ④ 게이트 — 이 커밋 시점의 정직한 표기는 **✓✓✗** 다:
--    모였나 ✓(발사마다 행이 남는다 · 리허설 실탄으로 두 갈래 실증) ·
--    닿았나 ✓(뷰 둘 + `tools/회차장부.js` 가 사람 손 없이 읽는다) ·
--    늘었나 ✗(이해 대장의 칸이 아니라 운영 관측층이다).
--    ⚠ 「스스로 «알리는»」 층은 아직 0이다 — 뷰는 부르면 답할 뿐 먼저 말하지 않는다.
--
-- ⑦ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 하나를 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `teacher_notes_once_c11`·`companion_qa_*_fkey` 는 여기 없다 — UNIQUE·FK 라 CHECK 목록의
--      대상이 아니다(기대제약 목록에는 FK 도 들어가지만 이 줄은 CHECK 만 센다).
--    기대: broadcast_segment_kind_c11 · classes_key_nonblank_c11
--         · companion_qa_answer_paired_c11 · companion_qa_question_nonblank_c11
--         · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · cron_runs_outcome_c11
--         · learners_gender_c11 · learners_goal_track_c11 · learners_group_no_c11
--         · learners_home_aimag_c11 · learners_seat_no_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11 · teacher_notes_body_nonblank_c11
--         · teacher_notes_disposition_c11 · teacher_notes_origin_c11
