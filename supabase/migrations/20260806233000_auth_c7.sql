-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md §4-1·§4-2
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- 학생 로그인 = 「학생번호 + 학생이 정한 비밀번호」 (유호님 확정 2026-08-06).
--   앞 판(학원 발급 코드)을 대체한다. 목표는 **전달물 0** — 카드·QR·문자·메일을 만들지 않고,
--   학생이 이미 아는 것(자기 학생번호·자기 전화번호)만으로 첫 로그인이 선다.
--
-- 🔑 **이 조각은 계약(학습 데이터)을 바꾸지 않는다.** 그래서 CHECK 값목록도 그 접미(c7)도
--   건드리지 않는다 — 늘어나는 것은 인증 인프라 4칸뿐이고, 계약 파일은 c7 그대로다.
--   (값목록을 안 바꾸면서 접미만 올리면 「어느 판인지」가 계약과 어긋난다.)
--
-- 왜 열이 4개인가 — 각각이 없으면 무엇이 무너지는지:
--   recovery_email·recovery_phone : 비밀번호를 잊었을 때 **본인 확인 대조용**(L0 §4-2-1).
--     🔴 여기로 발송하지 않는다(합성 주소는 배달 불가고 SMTP·SMS 공급자를 안 들이는 것이 전제).
--     지금 안 받으면 **소급이 안 된다** — 나중에 발송을 붙이는 날 값은 이미 쌓여 있어야 한다.
--   temp_password_expires_at : 원장 「비밀번호 초기화」가 낸 임시번호의 만료(30분 · §4-2-2).
--     이 칸이 없으면 임시번호가 영원히 살아 있고, 그건 그 학생 계정의 두 번째 비밀번호가 된다.
--   signup_attempts : 첫 로그인 게이트의 시도 횟수(§4-1-1 ①). 🔴 **이 칸이 이 판의 급소다** —
--     게이트가 요구하는 전화 뒤 4자리는 **1만 가지뿐**이라, 제한이 없으면 대입으로 반드시 뚫린다.
--     5에 이르면 그 학생의 첫 등록 경로가 잠기고, 푸는 것은 원장의 초기화뿐이다.
--
-- 첫 등록 가능 여부는 새 칸을 만들지 않는다 — `auth_user_id is null` 이 곧 「아직 계정 없음」이고,
--   계정이 서는 순간 그 경로는 그 학생에게 영원히 닫힌다(§4-1-1 ②).
--
-- 이 조각은 **c7이 선 DB 위에서만** 돈다. 빈 DB에는 합본(c6 → c7 → 이 조각) 순으로 붓는다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260806233000';
  migration_name constant text := '20260806233000_auth_c7.sql';
  expected_checksum constant text := 'c5115077c33d8b0811848988c12acab86088ff83e5ca0a91e8c3ee0e64e3ffcf'; -- migration-checksum
  base_version constant text := '20260806210000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 기준선 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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
      '이 조각은 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;

  -- `if not exists`를 쓰지 않는다: 위 이력 판정이 「c7이 섰고 이 판은 아직」을 이미 못박았으므로,
  -- 여기서 칸이 이미 있다면 그것은 이력과 실물이 어긋난 상태다 — 조용히 넘기지 말고 멈춘다.
  alter table engine.learners
    add column recovery_email text,
    add column recovery_phone text,
    add column temp_password_expires_at timestamptz,
    add column signup_attempts int not null default 0;

  -- 음수 시도 횟수는 상한 판정을 무력화한다(-5 에서 시작하면 10회를 시도할 수 있다).
  alter table engine.learners
    add constraint learners_signup_attempts_nonneg_c7 check (signup_attempts >= 0);

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

-- ============================================================================
-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at'),
  -- 학생 로그인(L0 §4-1·§4-2 · 20260806233000_auth_c7)
  ('learners','recovery_email'), ('learners','recovery_phone'),
  ('learners','temp_password_expires_at'), ('learners','signup_attempts')
), 기대제약(n) as (values
  ('learning_events_event_type_c7'), ('learning_events_task_type_c7'),
  ('submissions_task_format_c7'), ('submissions_translation_source_c7'), ('corrections_verdict_c7'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c7')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable')
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
), 빠진트리거 as (
  select string_agg(n, ', ' order by n) v from 기대트리거 e
   where not exists (
     select 1 from pg_trigger g
     join pg_class r on r.oid=g.tgrelid
      where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n
   )
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
    where schemaname='engine' and tablename='schema_migrations') as 이력정책
)
select case when 테이블수=9 and RLS켜짐=9 and 정책수=5
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260806233000'
              and (select checksum from 현재이력)='c5115077c33d8b0811848988c12acab86088ff83e5ca0a91e8c3ee0e64e3ffcf' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 9·9·5·0·0·3·1·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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

-- 확인 (갈래별)
-- ① 테이블과 RLS: schema_migrations를 포함한 전부가 true여야 한다.
-- ② 정책: 기존 읽기 정책만 있고 schema_migrations 정책은 0이어야 한다.
-- ③ anon·authenticated의 engine 스키마·테이블 권한은 0이어야 한다.
-- ④ 학생 로그인 4칸(learners.recovery_email·recovery_phone
--    ·temp_password_expires_at·signup_attempts)이 「빠진열」에 안 나와야 한다.
-- ⑤ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.
-- ⑥ CHECK 제약은 현행 접미사만 남아야 한다. 옛 이름이 하나라도 보이면 조각이 안 돈 것이다.
--    기대: corrections_verdict_c7 · learners_signup_attempts_nonneg_c7
--         · learning_events_event_type_c7 · learning_events_task_type_c7
--         · submissions_task_format_c7 · submissions_translation_source_c7

commit;
