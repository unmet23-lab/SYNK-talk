-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8 — 이 조각은 계약을 안 바꾼다)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- 🔴 DDL 0 — 이 조각이 바꾸는 것은 **사후 확인 쿼리**뿐이다.
--
-- ■ 무엇이 새고 있었나 (2026-08-07 리허설 실측)
--   확인 블록의 `빠진트리거`는 pg_trigger에 **행이 있는가**만 물었다. 그런데 트리거를 끄면
--   (`alter table ... disable trigger`) 행은 그대로 남고 `tgenabled`만 'D'가 된다 —
--   즉 **꺼진 트리거는 존재 검사에 걸리지 않는다.** 리허설에서 c8 트리거를 실제로 끄고
--   `supabase/확인_적용후상태.sql`을 돌린 결과가 「✅ 전부 통과」였다(빠진트리거: null).
--   c8 조각의 머리말이 「확인 블록의 기대트리거가 꺼짐·사라짐을 드러낸다」고 적은 것은
--   **사라짐만** 참이었다. 새는 방향은 언제나 「통과」다.
--
--   걸린 것은 c8 하나가 아니다. 기대트리거 5개 중 넷이 불변식을 지는 트리거다 —
--   learning_events_immutable · corrections_immutable · submissions_original_immutable ·
--   staff_access_log_immutable. 그것들이 꺼진 DB는 append-only가 아닌데, 이 확인은
--   그 DB를 초록으로 보고한다. 확인 쿼리가 「안 잰 것」을 통과로 내는 자리다.
--
-- ■ 왜 c8 조각을 고치지 않고 새 조각인가
--   ① 같은 버전을 고쳐 쓰면 checksum이 갈리고, 이미 c8이 선 DB(리허설)가 그 자리에서 멈춘다.
--      기록된 checksum을 손으로 갱신하는 길은 이 저장소가 기계로 막아 온 바로 그 우회다.
--   ② 사후 확인 쿼리의 정본은 **마지막 조각의 꼬리**다(tools/마이그레이션_합본.js가 거기서
--      supabase/확인_적용후상태.sql을 파생시킨다). 확인 쿼리를 바꾸는 유일한 통로가 새 조각이다.
--   그래서 계약 버전은 c8 그대로고(값목록·열·제약 한 글자도 안 바뀐다) 조각만 하나 늘어난다.
--
-- ■ 처방이 갈리므로 상태를 이름 옆에 붙인다
--   「없음」의 처방은 판을 붓는 것이고 「꺼짐」의 처방은 `enable trigger` 한 줄이다.
--   이름만 내면 유호님은 정상 DB에 판을 다시 부으려 하게 된다 — 따를 수 없는 처방은
--   우회를 정상 통로로 만든다(CLAUDE.md 가드 맹점 ③).
--
-- 이 조각은 c8(20260807040000)이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807060000';
  migration_name constant text := '20260807060000_engine_c8.sql';
  expected_checksum constant text := 'a198ff4c8f3e0bb48640366988782806fe16f7423ca5163fcb86c582b29d2dcb'; -- migration-checksum
  base_version constant text := '20260807040000';
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

  -- DDL 없음. 이 조각이 바꾸는 것은 아래 꼬리의 확인 쿼리이고, 그 쿼리는 DB 안에 살지 않는다.
  -- 이력 행을 남기는 이유는 **어느 DB가 눈이 밝은 확인을 쓰는 판인가**를 확인 쿼리 자신이
  -- 현재버전으로 판정하기 때문이다(c8까지만 선 DB는 여기서 ❌가 난다 — 의도한 결과다).
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
  ('learning_events','correction_id'),
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
  ('learning_events_correction_target_c8'), ('learning_events_correction_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner')
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
    where schemaname='engine' and tablename='schema_migrations') as 이력정책
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=8
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807060000'
              and (select checksum from 현재이력)='a198ff4c8f3e0bb48640366988782806fe16f7423ca5163fcb86c582b29d2dcb' -- migration-checksum
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
-- ① 테이블과 RLS: 전부 true여야 한다(이 조각은 테이블을 늘리지 않는다 — 11 그대로).
-- ② 정책: 8 그대로. 「누구 것인가」는 기존 정책의 사슬을 쓴다.
-- ③ anon·authenticated의 engine 스키마·테이블 권한은 0이어야 한다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다. c7 이름이 하나라도 보이면 c8 조각이 안 돈 것이다.
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
--    c8 고유분: learning_events_correction_id_fkey · 트리거 learning_events_correction_same_learner
--    그리고 learning_events.correction_id 열이 「빠진열」에 안 보여야 한다.
-- ⑤ 빠진트리거 칸에 `(꺼짐:D)` 가 붙어 나오면 판이 아니라 **트리거가 꺼진 것**이다 —
--    처방은 `alter table engine.<표> enable trigger <이름>` 한 줄이고, 판을 다시 붓지 않는다.
-- ⑥ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.

commit;
