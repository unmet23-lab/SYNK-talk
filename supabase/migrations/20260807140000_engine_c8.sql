-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8 — 이 조각은 계약을 안 바꾼다.
--   recorded_by 는 앱 payload 도 학습 필드도 아니다 · 운영자 기록이라 event_type 이 없다)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 닫나 — 동의 행의 **출처**가 어디에도 안 남던 자리 (유호님 확정 2026-08-07)
--   `tools/동의발급.js`(922703b)와 `tools/로그인코드발급.js` 둘 다 「누가 이걸 했는지」를
--   **화면에만** 찍고 끝냈다. 넣을 칸이 없어서였다. 그런데 동의는 법적 근거고, 근거에
--   출처가 없으면 나중에 「이 동의는 누가 받았나」에 답할 수 있는 사람이 아무도 없다.
--   그건 소급이 안 된다 — 실학생이 들어오기 전이 공짜로 고치는 마지막 창이다.
--
-- ■ 왜 새 표가 아니라 열인가
--   ① 「누가 기록했나」는 그 동의의 **속성**이지 별개 사건이 아니다.
--   ② 표를 나누면 동의 행과 감사 행이 **따로 쓰인다** — 한쪽만 서는 순간 출처 없는 동의가
--      생기고, 그게 생겼다는 것조차 아무도 모른다. 같은 행에 있으면 원리상 못 갈라진다.
--   ③ 표가 하나 늘면 RLS·불변 트리거·보존 정책이 전부 따라 붙는다(F124 — 새 표 금지).
--
-- ■ 이 조각은 **열만 연다. 강제는 다음 조각 몫이다.**
--   c8 의 `learning_events.consent_id` 와 같은 순서다 — 쓰는 자가 **전부** 스탬프하는 것을
--   왕복이 증명한 뒤에 조인다. 지금 강제를 함께 걸면 아직 안 고친 통로(동의발급·왕복시험
--   ·배달왕복시험·검증_마이그레이션)가 그 순간 전부 죽는다.
--   그래서 이 조각은 **아무것도 안 깨뜨린다** — 열이 늘 뿐이고 기존 insert 는 그대로 돈다.
--
-- ■ 🔴 다음 조각을 짤 사람에게 — 강제 수단을 잘못 고르면 **철회가 막힌다**
--   기존 행(리허설 3건 · 운영 0건)은 출처를 소급할 수 없다. consents_protect(20260807120000)
--   가 개서를 막고, 막는 게 맞다 — 없는 사실을 지어내는 것이 백필이다.
--   그래서 「새 행만」 강제해야 하는데:
--     · `not null`             → 기존 행 때문에 애초에 못 건다.
--     · `check ... not valid`  → 초기 전수검사만 건너뛸 뿐 **UPDATE 도 검사한다.** 그러면
--       출처 없는 옛 행은 `update ... set revoked_at = now()` 가 영원히 거절된다 =
--       **철회가 막힌다.** 철회는 법적 의무라 어떤 이유로도 막으면 안 된다(D5 · P0 §192).
--     · ✅ `before insert` 트리거 → 새 동의는 출처 없이 못 서고, 옛 행의 철회는 그대로 산다.
--       (consents_protect 는 `before update or delete` 라 겹치지 않는다.)
--
-- 이 조각은 20260807120000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807140000';
  migration_name constant text := '20260807140000_engine_c8.sql';
  expected_checksum constant text := '8395b3c08c5df18857da15825676f4077fdfd4ea135334404fb5dd0fa573792c'; -- migration-checksum
  base_version constant text := '20260807120000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c8 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- ── 동의 행의 출처. 기존 행은 null 로 남는다(소급 불가라 그게 사실이다).
  alter table engine.consents add column if not exists recorded_by text;

  comment on column engine.consents.recorded_by is
    '이 동의를 시스템에 기록한 사람·통로(학생이 아니라 운영자). 강제는 다음 조각의 before insert 트리거 — null 은 이 열이 생기기 전에 선 행이다.';

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
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
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
  ('learning_events_event_type_c8'), ('learning_events_task_type_c8'),
  ('submissions_task_format_c8'), ('submissions_translation_source_c8'), ('corrections_verdict_c8'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c8'), ('staff_role_c8'),
  ('learners_temp_password_paired_c8'),
  ('learning_events_correction_target_c8'), ('learning_events_correction_id_fkey'),
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
  select tablename from pg_tables where schemaname='engine'
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
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=8
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807140000'
              and (select checksum from 현재이력)='8395b3c08c5df18857da15825676f4077fdfd4ea135334404fb5dd0fa573792c' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·8·0·0·3·1·0·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 빠진열이 비어야 한다.
-- ② 무기명 = 이 조각 **전에** 선 동의 행 수다. 0 이 아닌 게 정상이고, 소급 불가라 안 채운다.
-- ③ 기명이 **늘기 시작하면** 쓰는 통로가 스탬프하기 시작한 것이다 — 넷이 다 스탬프하는 것을
--    왕복이 보인 뒤에 다음 조각으로 조인다(그 전에 조이면 안 고친 통로가 그 순간 죽는다).
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 안 바꾼다 — c8 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**(...engine_c8)이 제약 이름으로 읽혀 빨개진다(2026-08-07 실측).
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
