-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c7)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- c6 → c7 델타 — 병렬 코퍼스(몽골어↔한국어)의 축을 낸다.
--   `task_format` +1 `번역`. 새 테이블은 만들지 않는다(F124): `task_snapshot`(그날 학생이 본
--   몽골어 제시문) · `body_original`(학생의 한국어 답) · `corrected_text`(검수 확정 한국어)가
--   이미 정렬 3원쌍이고, 이 값은 **그 세 칸을 병렬 쌍으로 읽어도 되는지 가르는 유일한 축**이다.
--   축이 없으면 자유발화 답안과 번역 답안이 한 칸에 섞이고, 섞이면 「몽골어 원문이 있는 답」과
--   「없는 답」을 나중에 못 가른다 — c5가 낭독/자유발화를 가른 것과 같은 계열의 사고다.
--
-- 값이 바뀐 것은 task_format 하나지만 CHECK 접미는 판 전체를 c7로 통일한다 —
--   같은 이름이 두 값목록을 가리키면 DB 확인 ④가 어느 판인지 못 가른다.
--
-- 이 조각은 **c6 기준선이 선 DB 위에서만** 돈다. 빈 DB에는 합본(c6 조각 → 이 조각) 순으로 붓는다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260806210000';
  migration_name constant text := '20260806210000_engine_c7.sql';
  expected_checksum constant text := 'f7c53ce43e94220ca07e1156875825913923fe55a119cf16cd83f9ddce84eb56'; -- migration-checksum
  base_version constant text := '20260806150000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      'c7은 c6 기준선 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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
      'c7은 기준선 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;

  -- CHECK 이름째 교체. `if exists`를 붙이는 이유는 재실행 관용이 아니라,
  -- 위 이력 판정이 이미 「c6이 섰고 c7은 아직」을 못박았기 때문이다 — 여기서 이름이 없으면
  -- 그건 이력과 실물이 어긋난 상태이고, 그 판정은 아래 확인 쿼리의 「빠진제약」이 낸다.
  alter table engine.learning_events
    drop constraint if exists learning_events_event_type_c6,
    drop constraint if exists learning_events_task_type_c6,
    add constraint learning_events_event_type_c7 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result'
    )),
    add constraint learning_events_task_type_c7 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    ));

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c6,
    add constraint submissions_task_format_c7 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    -- 병렬 쌍의 왼쪽이 실제로 저장되게 만든다. 값만 늘리면 「번역인데 몽골어 원문이 없는 행」이
    -- 통과하고, 그건 코퍼스가 아니라 그냥 한국어 문장이다 — 그리고 제시문은 **그때만** 남길 수 있다
    -- (문항이 수정되면 학생이 무엇을 보고 답했는지 사라진다 = c4가 task_ref/task_snapshot 을 가른 이유).
    add constraint submissions_translation_source_c7 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c6,
    add constraint corrections_verdict_c7 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

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
  ('schema_migrations','checksum'), ('schema_migrations','applied_at')
), 기대제약(n) as (values
  ('learning_events_event_type_c7'), ('learning_events_task_type_c7'),
  ('submissions_task_format_c7'), ('submissions_translation_source_c7'), ('corrections_verdict_c7'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey')
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
             and (select version from 현재이력)='20260806210000'
              and (select checksum from 현재이력)='f7c53ce43e94220ca07e1156875825913923fe55a119cf16cd83f9ddce84eb56' -- migration-checksum
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
-- ④ CHECK 제약은 현행 접미사만 남아야 한다. c6 이름이 하나라도 보이면 이 조각이 안 돈 것이다.
--    기대: corrections_verdict_c7 · learning_events_event_type_c7
--         · learning_events_task_type_c7 · submissions_task_format_c7
--         · submissions_translation_source_c7
-- ⑤ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.

commit;
