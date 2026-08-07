-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8 — 이 조각은 계약을 안 바꾼다.
--   새 열 consent_id 는 앱 payload 가 아니라 **서버 파생**이다 · capture_meta.server 와 같은 축)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 닫나 — 운영 배포 전 차단 4 중 물리 3 (유호님 확정 2026-08-07 · sol 심문 P0)
--   ② 원문 불변 확대 — L0 §3-3 은 task_snapshot·audio_ref·capture_meta 를 「최대 소급 불가」라
--      선언했는데 자물쇠(reject_original_overwrite)는 body_original·transcript 둘만 잠갔다.
--      선언과 자물쇠의 범위를 일치시킨다. 패턴은 그대로 「값이 이미 있는 칸만」이라
--      철회의 audio_deleted_at·뒤에 채워지는 전사(null→값 첫 채움)는 계속 산다.
--   ③ 동의 귀속 — learning_events 에는 consent_ver 문자열뿐이라 「정확히 어느 동의 행에
--      근거했나」를 증명할 수 없었다. consent_id(FK) 열을 열고, 세 쓰기 통로(events·deliver·
--      §9-3-2 철회 절차)가 스탬프한다. NOT NULL 강제는 다음 조각 몫이다 — 쓰는 자가 다
--      스탬프하는 것을 왕복이 증명한 뒤에 조인다(기존 행은 소급 스탬프 불가·append-only).
--      곁들여 동의 증거 자체를 보호한다(consents_protect): 개서·삭제·철회 되돌림 차단.
--      철회(revoked_at null→값)와 재동의(새 행)만 통과한다.
--   ④ 수집→처리 배선 — pipeline_jobs 는 표·lease_until·attempt_id 만 있고 **행을 만드는
--      코드가 0줄**이었다(제출은 서고 처리 job 은 영영 없는 고아). 제출 insert 와 같은
--      트랜잭션에서 트리거가 job 을 만들고, 이미 선 제출은 backfill 한다.
--   (차단 ① 「철회 후 수집 0건」은 DB 가 아니라 functions/events 의 게이트가 진다 —
--    같은 커밋의 코드 변경과 tools/왕복시험.js ⑫ 가 그 증명이다.)
--
-- ■ 왜 지금인가 — 전부 소급 불가다. S1 스택이 운영에 서기 전이 공짜로 고치는 마지막 창이다.
--
-- 이 조각은 20260807060000(계약 c8)이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807120000';
  migration_name constant text := '20260807120000_engine_c8.sql';
  expected_checksum constant text := '7745dfed827ed302b2bd0ec2448f33252207d59183fedb33b8ae998cfbdea780'; -- migration-checksum
  base_version constant text := '20260807060000';
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

  -- ── ② 원문 불변 확대 — 선언(「최대 소급 불가」)과 자물쇠의 범위를 일치시킨다.
  create or replace function engine.reject_original_overwrite() returns trigger
    language plpgsql as $function$
  begin
    if OLD.body_original is not null and NEW.body_original is distinct from OLD.body_original then
      raise exception '학생 원문은 고치지 않는다 — 오류가 곧 데이터다 (L0 §2 원문 불변)';
    end if;
    if OLD.transcript is not null and NEW.transcript is distinct from OLD.transcript then
      raise exception '기계 전사는 덮지 않는다 — 사람이 고친 값은 transcript_verified로 간다 (L0 §9-2)';
    end if;
    if OLD.task_snapshot is not null and NEW.task_snapshot is distinct from OLD.task_snapshot then
      raise exception '과제 스냅숏은 고치지 않는다 — 그날 학생이 본 것이 증거다 (L0 §3-3)';
    end if;
    if OLD.audio_ref is not null and NEW.audio_ref is distinct from OLD.audio_ref then
      raise exception '음성 참조는 바꾸지 않는다 — 삭제는 audio_deleted_at 이 진다 (L0 §9-3)';
    end if;
    if OLD.image_refs is not null and NEW.image_refs is distinct from OLD.image_refs then
      raise exception '이미지 참조는 바꾸지 않는다 (L0 §3-3)';
    end if;
    if OLD.capture_meta is not null and NEW.capture_meta is distinct from OLD.capture_meta then
      raise exception '녹음 관측은 바꾸지 않는다 — 요청과 관측의 어긋남이 곧 데이터다 (C0 §4-2)';
    end if;
    if OLD.transcript_verified is not null and NEW.transcript_verified is distinct from OLD.transcript_verified then
      raise exception '사람 확인 전사는 덮지 않는다 — 재검수는 새 교정 행으로 간다 (L0 §9-2)';
    end if;
    if NEW.occurred_at is distinct from OLD.occurred_at then
      raise exception '발생 시각은 바꾸지 않는다 (L0 §2)';
    end if;
    return NEW;
  end
  $function$;

  -- ── ③ 동의 귀속 — 사건이 정확히 어느 동의 행에 근거했는지 가리키는 고리.
  alter table engine.learning_events
    add column if not exists consent_id uuid references engine.consents(consent_id);

  -- 동의 증거 보호 — 법적 근거 테이블이 append-only 원칙 밖에 있었다(sol P0).
  create or replace function engine.protect_consents() returns trigger
    language plpgsql as $function$
  begin
    if TG_OP = 'DELETE' then
      raise exception '동의 행은 지우지 않는다 — 법적 증거다. 철회는 revoked_at 를 세운다 (L0 §9-3)';
    end if;
    if NEW.learner_id is distinct from OLD.learner_id
       or NEW.consent_ver is distinct from OLD.consent_ver
       or NEW.doc_hash is distinct from OLD.doc_hash
       or NEW.agreed_at is distinct from OLD.agreed_at then
      raise exception '동의 증거는 개서하지 않는다 — 새 동의는 새 행이다 (L0 §9-3)';
    end if;
    if OLD.revoked_at is not null and NEW.revoked_at is distinct from OLD.revoked_at then
      raise exception '철회는 되돌리지 않는다 — 재동의는 새 행이다 (L0 §9-3)';
    end if;
    return NEW;
  end
  $function$;

  drop trigger if exists consents_protect on engine.consents;
  create trigger consents_protect before update or delete on engine.consents
    for each row execute function engine.protect_consents();

  -- ── ④ 수집→처리 배선 — 제출과 같은 트랜잭션에서 처리 대기표에 줄이 선다.
  create or replace function engine.enqueue_pipeline_job() returns trigger
    language plpgsql as $function$
  begin
    insert into engine.pipeline_jobs (submission_id) values (NEW.submission_id)
    on conflict (submission_id) do nothing;
    return NEW;
  end
  $function$;

  drop trigger if exists submissions_enqueue_job on engine.submissions;
  create trigger submissions_enqueue_job after insert on engine.submissions
    for each row execute function engine.enqueue_pipeline_job();

  -- 이미 선 제출의 backfill — 「제출은 있는데 job 이 없는 고아」를 0으로 만든다.
  insert into engine.pipeline_jobs (submission_id)
    select submission_id from engine.submissions
  on conflict (submission_id) do nothing;

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
  ('learning_events','consent_id'),
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
             and (select version from 현재이력)='20260807120000'
              and (select checksum from 현재이력)='7745dfed827ed302b2bd0ec2448f33252207d59183fedb33b8ae998cfbdea780' -- migration-checksum
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

-- 확인 (갈래별)
-- ① 테이블과 RLS: 전부 true여야 한다(이 조각은 테이블을 늘리지 않는다 — 11 그대로).
-- ② 정책: 8 그대로. 「누구 것인가」는 기존 정책의 사슬을 쓴다.
-- ③ anon·authenticated의 engine 스키마·테이블 권한은 0이어야 한다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 바꾸지 않는다 — c8 그대로).
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
--    이 조각 고유분: learning_events.consent_id 열 + learning_events_consent_id_fkey
--    · 트리거 submissions_enqueue_job(수집→처리 배선) · consents_protect(동의 증거 보호)
--    · 잡없는제출 = 0 (backfill 이 돌았고 트리거가 이후를 진다 — 0이 아니면 고아가 생긴 것).
-- ⑤ 빠진트리거 칸에 `(꺼짐:D)` 가 붙어 나오면 판이 아니라 **트리거가 꺼진 것**이다 —
--    처방은 `alter table engine.<표> enable trigger <이름>` 한 줄이고, 판을 다시 붓지 않는다.
-- ⑥ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.

commit;
