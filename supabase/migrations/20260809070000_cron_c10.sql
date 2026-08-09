/* 스케줄러 배선 — P0 §373 「`pg_cron` 등록(배치 시각 + 그 30분 뒤 점검)」 · 2026-08-09 유호 지시
 *
 * 🔴 **파일 이름의 `_c10` 은 장식이 아니다.** Edge Function 넷이 계약판을 `schema_migrations` 의
 *   최신 이름 `_c<숫자>.sql` 에서 읽는다(P0 §374 · 회귀 `tests/마이그레이션이름.test.js`).
 *   `..._cron.sql` 처럼 판 없이 지으면 **API 4개가 동시에 500** 이 된다 — 앱 전체가 죽는데
 *   원인은 파일 이름이다. 판을 올리는 게 아니므로 c10 을 **그대로** 이어 쓴다.
 *
 * 🔑 **시각은 UTC 다**(DB `TimeZone` = UTC · 실측). 몽골(`Asia/Ulaanbaatar`)은 UTC+8 이라 8을 뺀다:
 *     배달  몽골 00:05 → UTC 16:05 (전날)
 *     점검  몽골 00:35 → UTC 16:35 (전날)  ← 배달 +30분(§373)
 *     전사  10분마다 (시간대 무관)
 *   🔴 배달이 **자정 직후**인 이유: `deliver` 는 호출 시점의 `몽골날짜()` 로 「오늘」을 정하고
 *   `due_at` 은 그날 자정이다(c10 `due.v1`). 몽골 자정 **전**에 돌리면 전날 것을 만들고,
 *   학생은 아침에 어제 과제를 받는다. 「전날 밤」이라는 말과 어긋나 보이지만 기준은 몽골 날짜다.
 *
 * 🔑 **자격증명이 이 파일에 없다** — Vault 에서 읽는다. ref 를 파일에 박으면 그 파일이 환경에
 *   묶여 리허설·운영이 갈린다(08-07 과녁 사고와 같은 층).
 *   ⛔ 두 항목은 이 파일이 만들지 않는다. 붓기 **전에** 그 프로젝트에서 넣어야 한다:
 *        vault: `service_role_key` · `functions_base_url`(= https://<ref>.supabase.co/functions/v1)
 *      없으면 잡은 걸리되 URL 이 null 이라 호출이 **에러로** 죽는다(조용한 실패가 아니다 — 의도).
 *
 * ⛔ **리허설엔 일부러 안 건다** — 스케줄러가 돌면 옆 세션 왕복시험의 배정 상태를 흔든다.
 *   리허설에 부을 일이 생기면 그 판단을 먼저 하고 붓는다.
 *
 * 되돌림: select cron.unschedule('deliver-daily'), cron.unschedule('deliver-check'),
 *                cron.unschedule('transcribe-batch'); */

/* ── 합본 프로토콜 수리(2026-08-09 · 세션 af79333d) ─────────────────────────────
 * 첫 판은 잡 3개만 들고 태어나 합본 검사 6건을 깨뜨렸다(트랜잭션·checksum·체인 등재 없음).
 * 이 판은 골격만 두른다 — 잡 이름·시각·본문은 첫 판과 같은 바이트다. 운영엔 첫 판이 이미
 * 돌았으므로(잡 3개 라이브 · 이력 행 없음) 이 판을 그대로 다시 부으면 체인이 아문다. */

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $migration$
declare
  migration_version constant text := '20260809070000';
  migration_name constant text := '20260809070000_cron_c10.sql';
  expected_checksum constant text := 'e520a69de0398278f517aeacd3ae4c1909aaa249bb8379de118e87f1022d4fd5'; -- migration-checksum
  base_version constant text := '20260809060000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c10 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  /* 멱등 — 같은 이름이 있으면 떼고 다시 건다(없으면 0행이라 조용하다). */
  perform cron.unschedule(jobname)
    from cron.job
   where jobname in ('deliver-daily', 'deliver-check', 'transcribe-batch');

  /* ① 배달 — 그날 몫 1건을 학생마다 큐에 넣는다. */
  perform cron.schedule('deliver-daily', '5 16 * * *', $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
      body    := '{}'::jsonb);
  $job$);

  /* ② 점검 — 배달 +30분. 「오늘 배정 수 < 재적 수」면 미달을 낸다(§373 · 지금 수신자는 유호님 로그뿐).
   *   `?점검` 은 한글 쿼리라 퍼센트 인코딩해 넣는다 — 함수 쪽 `URLSearchParams` 가 되돌려 읽는다. */
  perform cron.schedule('deliver-check', '35 16 * * *', $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver?%EC%A0%90%EA%B2%80',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
      body    := '{}'::jsonb);
  $job$);

  /* ③ 전사 — 10분마다. 한 번에 집는 수는 함수가 정한다(지금 5). 검수자가 오디오만 받는 시간을 줄인다. */
  perform cron.schedule('transcribe-batch', '*/10 * * * *', $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/transcribe',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
      body    := '{}'::jsonb);
  $job$);

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
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
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at'),
  -- ⚠ 아래 세 묶음은 c7 **뒤에 붙은 조각들**이 낸 열이다. 이 확인 블록은 앞 조각에서
  --   베끼는 것이 아니라 **바로 앞 조각**에서 이어야 한다 — c8 초안이 20260806210000 의
  --   블록을 베껴 이 13열을 통째로 떨어뜨렸고, 그 상태의 확인은 「빠진열 없음」으로 초록이
  --   나온다(검사가 사라진 것이 통과와 같은 모양이 되는 자리 · 생성기 diff 가 잡았다).
  -- 학생 로그인(L0 §4-1·§4-2 · 20260806233000_auth_c7)
  ('learners','recovery_email'), ('learners','recovery_phone'),
  ('learners','temp_password_expires_at'), ('learners','signup_attempts'),
  -- 직원 인증·세션 폐기(L0 §4-5·§4-2 ③ · 20260806234000_staff_c7)
  ('learners','active'), ('learners','revoked_before'),
  ('staff','role'), ('staff','staff_id'), ('staff','active'), ('staff','revoked_before'),
  ('staff_access_log','action'), ('staff_access_log','target_ids'),
  -- 임시번호를 해시로 든다(L0 §4-2-2 · 20260807024500_temp_password_c7)
  ('learners','temp_password_hash')
), 기대제약(n) as (values
  ('learning_events_event_type_c10'), ('learning_events_task_type_c10'),
  ('submissions_task_format_c10'), ('submissions_translation_source_c10'),
  ('submissions_due_paired_c10'), ('corrections_verdict_c10'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c10'), ('staff_role_c10'),
  ('learners_temp_password_paired_c10'),
  ('learning_events_correction_target_c10'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect')
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
  -- 🔴 존재만 묻지 않는다. 꺼진 트리거는 pg_trigger 에 **행이 그대로 남고** tgenabled 만
  --    'D'(꺼짐)·'R'(복제본에서만)이 된다 — 2026-08-07 리허설 실측: 트리거를 끈 채로 이
  --    쿼리가 「✅ 전부 통과」를 냈다. 안 잰 것을 통과로 내면 그건 확인이 아니다.
  select e.n,
         (select g.tgenabled from pg_trigger g
            join pg_class r on r.oid=g.tgrelid
           where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n) as 상태
    from 기대트리거 e
), 빠진트리거 as (
  -- 상태를 이름 옆에 붙인다 — 「없음」은 판을 부어야 하고 「꺼짐」은 enable 한 줄이라 처방이 갈린다.
  -- ⚠ `상태::text` 캐스트가 필수다. tgenabled 는 `"char"`(1바이트) 타입이라 `||` 후보가 갈려
  --    `operator is not unique` 로 **쿼리 전체가 안 돈다** — 파일 층 검사는 이걸 못 본다(2026-08-07 실측).
  select string_agg(n || case when 상태 is null then '' else ' (꺼짐:' || 상태::text || ')' end,
                    ', ' order by n) v
    from 트리거상태 where 상태 is null or 상태 not in ('O', 'A')
), 현재이력xml as (
  select CASE WHEN to_regclass('engine.schema_migrations') is null THEN null::xml
              ELSE query_to_xml(
                'select version, name, checksum, applied_at::text as applied_at
                   from engine.schema_migrations
                  order by applied_at desc, version desc
                  limit 1',
                false, false, '')
         END as x
), 현재이력 as (
  select ((xpath('/table/row/version/text()', x))[1])::text as version,
         ((xpath('/table/row/name/text()', x))[1])::text as name,
         ((xpath('/table/row/checksum/text()', x))[1])::text as checksum,
         ((xpath('/table/row/applied_at/text()', x))[1])::text as applied_at
    from 현재이력xml
), 셈 as (select
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('engine') and contype='f'
      and confrelid=to_regclass('engine.learners') and confdeltype='r') as 삭제차단,
  (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typnamespace=to_regnamespace('engine')
      and t.typname='job_status' and e.enumlabel='failed') as 실패상태,
  (select count(*) from pg_policies
    where schemaname='engine' and tablename='schema_migrations') as 이력정책,
  -- 검수자 판(20260807190000 · 절단문서 ②-17): 뷰가 있고 옛 정책이 없어야 **둘 다** 맞다.
  --   뷰만 세고 정책을 안 세면 「옛 통로가 남았다」가 통과로 보인다.
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue') as 검수뷰,
  (select count(*) from pg_policies
    where schemaname='engine' and policyname='inspector_queue_submissions') as 옛검수정책,
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출,
  -- 마감(20260808010000): 열만 서고 **아무도 안 채우는** 상태가 이 저장소에서 네 번째다
  --   (`daily_activity.expected`·`model`·`prompt_ver` 가 그렇게 서 있다). 배정에 마감이
  --   없으면 「마감 대비 여유」가 그 학생에게 영영 없다 — 조용히 빈칸으로 남지 않게 센다.
  --   ⚠ **c10 이 선 뒤에 만들어진 배정만** 센다. 옛 행의 마감은 아무도 모르고, 지어내
  --      채우는 것은 복원이 아니라 날조다(머리말 ⛔).
  (select count(*) from engine.submissions s
     join engine.learning_events e on e.event_id = s.event_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and s.occurred_at >= (select applied_at from engine.schema_migrations
                             where version = '20260808010000')) as 마감없는배정,
  -- 분모의 정본은 `task.assigned` 사건 하나다(머리말). `daily_activity.expected` 는 파생
  --   캐시 자리로 남겨 뒀고, 여기 값이 들어오면 분모가 둘이 된 것이다 — 그 순간 빨개진다.
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염,
  -- 검수 판이 **올라간 판인지**(20260809050000): `검수뷰=1` 은 뷰의 존재만 말한다.
  --   c8 의 12열 판이 그대로 서 있어도 그 칸은 1이라 초록이다 — 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and 마감없는배정=0 and 분모칸오염=0
             and 검수판열=22 and 검수판원문=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260809070000'
              and (select checksum from 현재이력)='e520a69de0398278f517aeacd3ae4c1909aaa249bb8379de118e87f1022d4fd5' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·22·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 검수판열=22 · 검수판원문=0 — 앞 조각과 같다(이 조각도 열을 안 바꾼다 — pg_cron 스케줄러 등록뿐이다).
-- ② 🔴 **큐에 배정 행이 섞였는지는 판 파일이 못 잰다.** 부은 뒤 한 줄로 실측한다 — 0이어야 한다:
--      select count(*) from engine.review_queue q
--        join engine.submissions s on s.submission_id = q.submission_id
--        join engine.learning_events e on e.event_id = s.event_id
--       where e.event_type <> 'submission.created';
-- ③ ⚠ 큐가 0행이어도 판이 틀린 게 아니다 — 2026-08-09 리허설 실측: 학생 제출 행에 붙은
--    AI 교정이 **0**이다(생산자가 배정 행에 붙이고 있다). 그건 판이 아니라 그 생산자 자리다.
--      select count(distinct c.submission_id) from engine.corrections c
--        join engine.submissions s on s.submission_id=c.submission_id
--        join engine.learning_events e on e.event_id=s.event_id
--       where c.actor_kind='ai' and e.event_type='submission.created';
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 한 개도 안 바꾼다 — c10 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c10 · learners_signup_attempts_nonneg_c10
--         · learners_temp_password_paired_c10 · learning_events_correction_target_c10
--         · learning_events_event_type_c10 · learning_events_task_type_c10
--         · staff_role_c10 · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
-- ⑤ 스케줄러 3잡 실측 — 부은 뒤 한 줄로 (3 이어야 한다):
--      select count(*) from cron.job
--       where jobname in ('deliver-daily','deliver-check','transcribe-batch');
--    ⚠ 리허설은 이 조각 머리말의 ⛔ 정책대로 일부러 안 붓는다 — 확인 쿼리 판정이
--      「현재버전=20260809060000」으로 ❌ 를 내면 고장이 아니라 그 정책이다(✅ 대상은 운영뿐).
--    ⚠ 운영에 처음 부은 판(2026-08-09)은 이력 등재가 없던 옛 내용이었다 — 이 조각을 그대로
--      다시 부으면 잡은 멱등으로 재등록되고 이력 행이 생겨 체인이 이어진다(잡 내용 불변).
