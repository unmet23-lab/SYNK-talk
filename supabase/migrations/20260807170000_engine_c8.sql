-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8 — 이 조각은 계약을 안 바꾼다.
--   `source_kind`·`estimator_confidence`·`estimator_version`·`evidence_refs` 는 계약
--   「추정메타」에 c3부터 있던 이름이고 값목록도 c3이 정했다. 없던 것은 그 이름을 담을
--   **물리 칸**이다.)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 닫나 — 「어떻게 알게 됐나」를 담을 칸이 없다 (절단문서 ①-7)
--   `lib/이벤트검증.js` 의 `서버칸` 은 이 넷을 **앱이 보내면 400** 으로 막는다. 그런데
--   `supabase/` 전량에 DDL 열도 INSERT 도 **0건**이었다 — 앱은 못 보내고 서버는 담을 데가
--   없으니 그 넷은 계약에만 사는 이름이었다. F185 가 계약층에서 잡은 고아 필드의
--   **물리층 판**이다.
--
-- ■ 왜 지금인가 — 그리고 무엇이 아닌가 (정직하게)
--   지금은 추정을 만드는 것이 아무것도 없어서 **잃고 있는 행이 0건**이다. 그래서 이 조각은
--   「지금 새는 것을 막는다」가 아니라 「엔진의 **첫 추정 행** 전에 칸을 연다」이다.
--   열이 없는 채로 첫 추정이 쓰이면 그 행은 관측 행과 **모양이 같아** 사후에 못 가른다.
--   ⚠ 이 커밋이 실제로 **쓰는 것은 `source_kind` 하나**다(functions/events·deliver 양쪽).
--     나머지 셋은 추정기가 서는 날 첫 값을 받는다 — 그때 열이 없으면 그 값이 조용히
--     버려지는 것이 ①-7 이 지목한 상태다. 「열은 냈는데 아무도 안 채운다」를 알고도
--     안 적으면 그것이 다음 사람에게는 다시 고아로 보인다.
--
-- ■ 왜 `actor_kind` 로 대신하지 않나
--   `actor_kind` 는 **누가 했나**(learner·ai·teacher)이고 `source_kind` 는 **어떻게 알게
--   됐나**(explicit·teacher·observed·inferred)다. L0 §중요-3 이 v1에서 두 뜻이 한 칸에서
--   섞인 사고(`inferred` 를 「AI가 교정했다」로 씀)를 기록하고 갈라 놓은 축이라, 다시
--   합치면 그 사고로 되돌아간다.
--
-- ■ 이 조각은 **열만 연다. 강제는 다음 조각 몫이다.**
--   c8 의 `consents.recorded_by`(20260807140000)와 같은 순서다 — 쓰는 자가 **전부**
--   스탬프하는 것을 왕복이 증명한 뒤에 `before insert` 트리거로 조인다. 지금 `not null`
--   은 기존 리허설 행 때문에 애초에 안 걸리고, `check ... not valid` 는 UPDATE 도 검사해
--   옛 행을 건드리는 통로를 막는다(그 판정의 전문 = 20260807140000 머리말).
--
-- ■ 🔴 CHECK 를 일부러 안 걸었다
--   `estimator_confidence` 는 계약상 0~1 인데 범위 CHECK 를 지금 걸지 않는다 — 쓰는 자가
--   없어 **아무 행도 안 재는 제약**이 되고, 제약이 하나 늘면 확인 블록·테스트·다음 조각이
--   전부 그것을 이고 간다. 추정기가 서는 조각에서 그 자리와 함께 건다.
--
-- 이 조각은 20260807140000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807170000';
  migration_name constant text := '20260807170000_engine_c8.sql';
  expected_checksum constant text := 'd49f922e163dd6e0a51012d2c332e49b12f37479c4405144395e185ee900629c'; -- migration-checksum
  base_version constant text := '20260807140000';
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

  -- ── 값목록은 계약 `수집_교정_계약.json` 의 `source_kind` 4종 그대로다.
  --    `create type` 에는 `if not exists` 가 없어 존재를 먼저 묻는다(engine.actor_kind 와 같은 꼴).
  if to_regtype('engine.source_kind') is null then
    create type engine.source_kind as enum ('explicit', 'teacher', 'observed', 'inferred');
  end if;

  -- ── 추정메타. 기존 행은 null 로 남는다(소급 불가라 그게 사실이다).
  alter table engine.learning_events
    add column if not exists source_kind engine.source_kind,
    add column if not exists estimator_confidence numeric,
    add column if not exists estimator_version text,
    add column if not exists evidence_refs jsonb;

  comment on column engine.learning_events.source_kind is
    '이 행의 앎이 어디서 왔나(explicit·teacher·observed·inferred). actor_kind(누가 했나)와 다른 축 — L0 §중요-3. 서버가 채운다(앱이 보내면 400 · lib/이벤트검증.js 서버칸). null 은 이 열이 생기기 전에 선 행이다.';
  comment on column engine.learning_events.estimator_confidence is
    '추정 신뢰도 0~1. 학생이 스스로 매긴 확신도(payload.confidence)와 다른 것이라 이름을 갈랐다(계약 c3). 추정기가 서기 전까지 null 이 정상이다.';
  comment on column engine.learning_events.estimator_version is
    '그 추정을 낸 추정기의 판본. 규칙이 바뀌면 같은 입력이 다른 값을 내므로, 없으면 과거 추정을 재현할 수 없다.';
  comment on column engine.learning_events.evidence_refs is
    '그 추정이 근거로 삼은 사건·자료 참조. cited_refs(생성에 들어간 입력)와 다르다 — 이쪽은 추정의 근거다(계약 c3).';

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
             and (select version from 현재이력)='20260807170000'
              and (select checksum from 현재이력)='d49f922e163dd6e0a51012d2c332e49b12f37479c4405144395e185ee900629c' -- migration-checksum
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
-- ① 빠진열이 비어야 한다 — 이 조각이 낸 4열이 거기 실려 있다.
-- ② `source_kind` 가 **채워지기 시작하는지**를 본다. 이 조각과 같은 커밋에서 두 통로
--    (functions/events · functions/deliver)가 스탬프하므로, 적용 뒤 새로 선 행은 null 이
--    아니어야 한다. 옛 행의 null 은 정상이다(이 열이 생기기 전에 선 행 · 소급 불가).
--      select source_kind, count(*) from engine.learning_events group by 1 order by 2 desc;
-- ③ 나머지 셋(estimator_confidence·estimator_version·evidence_refs)은 **전부 null 이 정상**이다
--    — 추정기가 아직 없다. 값이 보이기 시작하면 그때 강제(트리거)와 범위 CHECK 를 건다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 안 바꾼다 — c8 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
