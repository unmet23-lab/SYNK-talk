/* 멱등 충돌 판정의 근거 열 — `learning_events.request_hash` (C0 심문 B2 ②/③)

 * 🔴 **파일 이름의 `_c10` 은 장식이 아니다.** Edge Function 넷이 계약판을 `schema_migrations` 의
 *   최신 이름 `_c<숫자>.sql` 에서 읽는다(회귀 `tests/마이그레이션이름.test.js`).
 *   판을 올리는 게 아니므로 c10 을 **그대로** 이어 쓴다 — 값목록도 필드 정본도 안 바뀐다.
 *   앱이 보내는 것도 없다(이 열은 **서버가 요청 본문에서 계산해** 적는다).
 *
 * ■ 무엇을 막나
 *   `functions/events` 는 `on conflict (learner_id, idempotency_key) do nothing` 뒤에 내용을
 *   **안 보고** `duplicate` + 기존 event_id 를 돌려줬다. 앱은 그것을 `stored` 와 같은 갈래로 읽고
 *   큐에서 지운다(`src/사건통로.js`). 같은 키가 **다른 내용**에 두 번 쓰이면 뒤엣것이 통째로
 *   사라지고, 사라지는 쪽은 늘 학생 발화다. 증상이 「조용함」뿐이라 개원 뒤엔 못 찾는다.
 *   이 열이 생기면 서버가 「같은 키 + 다른 내용」을 **가를 수 있다**(가르는 코드는 함수 쪽).
 *
 * 🔑 인덱스를 안 만든다 — 이 열은 조건절에 안 쓰인다. `unique (learner_id, idempotency_key)`
 *   로 이미 한 행을 집은 **뒤에** 그 행의 지문을 읽어 비교할 뿐이다.
 *
 * 🔑 null 을 허용한다 — 이 조각 이전에 쌓인 행은 지문이 없다. not null 로 걸면 그 행들 때문에
 *   조각 자체가 안 부어지고, 기본값을 지어 넣으면 **없는 지문이 있는 척**한다(더 나쁘다).
 *
 * 되돌림: alter table engine.learning_events drop column if exists request_hash;
 *        delete from engine.schema_migrations where version = '20260809080000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260809080000';
  migration_name constant text := '20260809080000_engine_c10.sql';
  expected_checksum constant text := '3b41867b0dac52d6c38bc52ced7a0cef2fe864115084f444840c27d62c91f58e'; -- migration-checksum
  base_version constant text := '20260809070000';
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

  /* 요청 지문 — 서버가 `lib/요청해시.js` 로 계산해 적는다. 앱은 이 칸을 못 보낸다. */
  alter table engine.learning_events
    add column if not exists request_hash text;

  comment on column engine.learning_events.request_hash is
    '앱이 보낸 사건 원본의 sha256(lib/요청해시.js). 같은 idempotency_key 에 다른 내용이 왔는지 가른다. 이 조각 이전 행은 null.';

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
             and (select version from 현재이력)='20260809080000'
              and (select checksum from 현재이력)='3b41867b0dac52d6c38bc52ced7a0cef2fe864115084f444840c27d62c91f58e' -- migration-checksum
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
-- ① 검수판열=22 · 검수판원문=0 — 앞 조각과 같다(이 조각은 review 판을 안 건드린다).
--    🔑 이 조각이 더하는 것은 `learning_events.request_hash` 하나이고, 그 검사는 위
--    확인 쿼리의 `기대열`(=`빠진열`)이 진다 — 판정 숫자를 손으로 늘리지 않았다.
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
-- ⑥ 지문 열 실측 — 부은 뒤 한 줄로 (1 이어야 한다):
--      select count(*) from information_schema.columns
--       where table_schema='engine' and table_name='learning_events' and column_name='request_hash';
--    ⚠ 열만 서고 값은 **부은 뒤 들어오는 행부터** 찬다. 옛 행의 `request_hash` 는 null 이고,
--      그 행과의 멱등 충돌은 판정 불가라 서버가 옛 동작(`duplicate`)으로 접는다 — 의도다.
