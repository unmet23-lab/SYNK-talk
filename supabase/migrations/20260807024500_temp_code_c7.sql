-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md §4-2-2 (원장 「비밀번호 초기화」)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- 🔴 **왜 칸이 하나 더 필요한가 — 「30분 만료」가 장식이었다.**
--   §4-2-2는 임시번호가 **30분 뒤 만료**된다고 못박았는데, 임시번호를 그냥 GoTrue 비밀번호로
--   넣으면 **만료라는 개념 자체가 없다.** 30분이 지나도 그 번호는 영원히 유효하고,
--   `temp_password_expires_at`은 아무도 보지 않는 **장식**이 된다. 그건 「두 번째 비밀번호를
--   영구히 발급한 것」이고, 학원에서 가장 현실적인 사고(학생이 그 값을 알고 친구 계정에
--   들어가는 것)를 정확히 열어 준다.
--
--   유호님 확정 2026-08-07: **해시로 들고 있는 방식.** 임시번호는 GoTrue에 넣지 않는다 —
--   우리가 **해시 + 만료로** 들고 있다가, 학생이 그 번호로 `/auth/temp-login`을 부르면
--   그때 검증하고 **그 자리에서 학생이 정한 새 비밀번호**를 GoTrue에 넣는다.
--   그래야 만료가 **참**이 된다(우리 코드가 반드시 지나가므로 시각을 볼 수 있다).
--   유호님 화면 흐름(버튼 → 6자리 → 말로 전달)은 **한 글자도 안 바뀐다.**
--
-- 🔑 **평문은 어디에도 저장하지 않는다.** 원장 화면이 1회 보여주고 끝이고, 감사표
--   (`staff_access_log`)에도 **번호는 안 적는다** — 적으면 그 표 하나가 다수 계정이 된다.
--
-- 🔑 **시도 횟수는 새 칸을 만들지 않는다.** `signup_attempts`를 그대로 쓴다 — 둘 다
--   「이 학생 계정을 여는 시도」이고 잠금을 푸는 것도 **같은 원장 버튼 하나**다.
--   초기화가 그 값을 0으로 풀므로, 학생은 초기화 뒤 임시번호를 5번까지 틀릴 수 있다.
--   (6자리는 100만 가지지만 30분·5회가 지키는 것이지 자릿수가 지키는 게 아니다.)
--
-- 해시는 `extensions.crypt` + `gen_salt('bf')`(pgcrypto · 이미 설치돼 있다 — 실측).
--   대조도 DB 안에서 한다(`hash = crypt(입력, hash)`) — **해시가 DB 밖으로 나가지 않는다.**
--
-- 이 조각은 **20260806234000 위에서만** 돈다. 빈 DB에는 합본을 처음부터 붓는다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807024500';
  migration_name constant text := '20260807024500_temp_code_c7.sql';
  expected_checksum constant text := 'a267639129d28b77a8c3e7d360727ae8ba1a9c4ccfc217626bf847feca592cf5'; -- migration-checksum
  base_version constant text := '20260806234000';
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

  -- 해시 원시함수가 없으면 여기서 멈춘다 — 없는 채로 칸만 만들면 초기화가 **런타임에** 죽고,
  -- 그때는 원장이 학생 앞에서 버튼을 누르는 순간이다.
  if to_regprocedure('extensions.gen_salt(text)') is null then
    raise exception 'pgcrypto(extensions.gen_salt)가 없다 — 임시번호를 해시로 들 수 없다';
  end if;

  alter table engine.learners
    add column temp_password_hash text;

  -- 🔴 **해시만 있고 만료가 없으면 그것이 곧 「영구 두 번째 비밀번호」**다 —
  --   이 판이 없애려던 바로 그 상태라, 문서가 아니라 DB가 막는다.
  alter table engine.learners
    add constraint learners_temp_password_paired_c7
      check (temp_password_hash is null or temp_password_expires_at is not null);

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
  ('learners','temp_password_expires_at'), ('learners','signup_attempts'),
  -- 직원 인증·세션 폐기(L0 §4-5·§4-2 ③ · 20260806234000_staff_c7)
  ('learners','active'), ('learners','revoked_before'),
  ('staff','role'), ('staff','staff_id'), ('staff','active'), ('staff','revoked_before'),
  ('staff_access_log','action'), ('staff_access_log','target_ids'),
  -- 임시번호를 해시로 든다(L0 §4-2-2 · 20260807024500_temp_password_c7)
  ('learners','temp_password_hash')
), 기대제약(n) as (values
  ('learning_events_event_type_c7'), ('learning_events_task_type_c7'),
  ('submissions_task_format_c7'), ('submissions_translation_source_c7'), ('corrections_verdict_c7'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c7'), ('staff_role_c7'),
  ('learners_temp_password_paired_c7')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable')
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
select case when 테이블수=11 and RLS켜짐=11 and 정책수=8
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807024500'
              and (select checksum from 현재이력)='a267639129d28b77a8c3e7d360727ae8ba1a9c4ccfc217626bf847feca592cf5' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·8·0·0·3·1·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 테이블과 RLS: 11개 전부 true. 이 조각은 표를 늘리지 않는다(칸 1 + CHECK 1뿐).
-- ② 정책: 8 그대로. 임시번호는 토큰이 아니라 Edge Function 이 다루므로 정책이 늘지 않는다.
-- ③ anon·authenticated 의 engine 권한은 0이어야 한다.
-- ④ `learners.temp_password_hash` 가 「빠진열」에 안 나와야 한다.
-- ⑤ 현재버전과 checksum 은 engine.schema_migrations 의 최신 행에서 읽는다.
-- ⑥ CHECK 제약은 현행 접미사만 남아야 한다. 옛 이름이 하나라도 보이면 조각이 안 돈 것이다.
--    기대: corrections_verdict_c7 · learners_signup_attempts_nonneg_c7
--         · learners_temp_password_paired_c7 · learning_events_event_type_c7
--         · learning_events_task_type_c7 · staff_role_c7
--         · submissions_task_format_c7 · submissions_translation_source_c7

commit;
