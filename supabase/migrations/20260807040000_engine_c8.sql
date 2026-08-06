-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- c7 → c8 델타 — 교정을 가리킬 이름을 낸다 (P0 §10-A-11 · S1 착수 차단자).
--   `correction.viewed`·`correction.responded`가 **어느 교정**에 대한 것인지 지목할 필드가
--   없었다. `retry_of_event_id`는 사건→사건(재제출) 고리라 그 자리를 대신하지 못한다.
--   그래서 검증기(lib/이벤트검증.js)가 `correction.viewed: []`로 **비워 둔 채** 서 있었다 —
--   없는 이름을 필수로 걸면 앱은 못 보내는데 검증은 전건 거부하기 때문이다(A-11 원문).
--   S1-8(교정 열람·응답)은 「학습이 일어났다」의 유일한 직접 신호인데, 어느 교정을 봤는지
--   모르면 그 신호가 학생 단위 집계로만 남고 교정 단위 판정이 영영 불가능하다.
--
-- 🔴 새 테이블 0(F124) · **새 정본 0**.
--   「이 교정은 누구 것인가」의 답은 이미 DB 안에 하나 있다 — RLS 정책
--   `learner_self_corrections`가 corrections→submissions→learning_events→learner_id로 걷는
--   그 사슬이다. 그래서 corrections·submissions에 learner_id를 복제하지 않는다. 복제하면
--   「누구 것인가」의 정본이 둘이 되고, 둘이 어긋나는 날 RLS와 FK가 서로 다른 답을 낸다 —
--   L0 §3-3이 `seen_at`·`responded_at`에서 이미 겪은 「정본이 두 군데」와 같은 사고다.
--
--   그래서 교차 학생 연결(c6 §788)은 복합 FK가 아니라 **같은 사슬을 걷는 트리거**로 막는다.
--   복합 FK로 하려면 `unique (learner_id, correction_id)`가 필요하고, 그 unique는 corrections에
--   learner_id를 심어야 성립한다 — 즉 복합 FK 경로는 복제를 **강제한다**. 트리거는 정본을
--   늘리지 않고 같은 불변식을 진다(c6이 reject_mutation·reject_original_overwrite로 이미
--   쓰는 도구다). ⚠트리거는 FK와 달리 `alter table ... disable trigger`로 꺼진다 —
--   그 대가를 알고 고른 것이고, 확인 블록의 기대트리거가 꺼짐·사라짐을 드러낸다.
--
-- 🔑 CHECK 접미는 **살아 있는 것 전부**를 c8로 통일한다 — 값목록이 안 바뀐 것도 포함해서.
--   초안은 반대로 갔다: 「c8은 어떤 값목록도 바꾸지 않으니 이름을 갈 이유가 없고, 갈면
--   `learners`·`staff`의 c7 제약(인증 트랙이 운영에 올린 것)까지 건드리게 된다」. 그럴듯했지만
--   틀렸고, `tests/L0스키마.test.js`의 「CHECK 제약 이름이 계약 버전을 달고 있다」가 그 자리에서
--   빨개졌다. 그 가드가 지키는 것은 값목록의 최신성이 아니라 **판이 조용히 미적용되는 것**이다 —
--   `create table if not exists`는 테이블이 있으면 문장을 통째로 건너뛰므로, 이름이 그대로면
--   「c8 계약 + c7 물리」가 초록으로 보인다. 판 이름은 접미 하나로 읽혀야 한다.
--   그래서 살아 있는 CHECK 8개를 전부 `_c7`→`_c8`로 갈고, 값 자체는 한 글자도 안 바꾼다.
--
-- ⚠ `correction_id`를 두 event_type에 **필수**로 거는 CHECK는 기존 행을 검사한다.
--   위반 행이 있으면 이 조각은 조용히 통과하지 않고 그 자리에서 실패한다 — 의도한 실패다
--   (2026-08-06 기준 운영 learning_events 0행이지만 「0행일 것이다」에 기대지 않는다).
--
-- 이 조각은 **c7이 선 DB 위에서만** 돈다. 빈 DB에는 합본(c6 → c7 → 이 조각) 순으로 붓는다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807040000';
  migration_name constant text := '20260807040000_engine_c8.sql';
  expected_checksum constant text := '158d55f17d54ab173721dc8945935eed93c6451c3a22a3b37059de171c42fdb6'; -- migration-checksum
  -- 체인은 **판 이름이 아니라 바로 앞 조각**에 건다. 초안은 20260806210000(engine_c7)을
  -- 걸었는데 그 뒤로 auth·staff·temp_code 세 조각이 더 붙어 있었다 — 그러면 c8이 그 셋을
  -- 건너뛴 DB 위에서도 선다(이 조각이 staff·learners 제약을 갈므로 그건 실패가 아니라 오염이다).
  base_version constant text := '20260807024500';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      'c8은 c7 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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
      'c8은 기준선 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;

  -- ① 이름 자체. corrections 를 직접 가리킨다 — 사슬을 payload jsonb 로 흉내내지 않는다
  --    (jsonb 키는 FK 를 못 걸어 c6 이 닫은 「가리키는 대상이 실재하는가」가 다시 열린다).
  alter table engine.learning_events
    add column if not exists correction_id uuid;

  alter table engine.learning_events
    add constraint learning_events_correction_id_fkey
      foreign key (correction_id)
      references engine.corrections (correction_id) on delete restrict;

  -- ② 자리를 비워 두지 않는다. 두 사건에는 반드시 있고, 나머지에는 반드시 없다 —
  --    「있어도 되고 없어도 되는」 칸이면 S1 은 여전히 교정 단위로 판정할 수 없고,
  --    엉뚱한 사건에 붙은 값은 나중에 집계에서 조용히 섞인다.
  alter table engine.learning_events
    add constraint learning_events_correction_target_c8 check (
      case when event_type in ('correction.viewed', 'correction.responded')
           then correction_id is not null
           else correction_id is null
      end
    );

  -- ③ 교차 학생 연결 금지. RLS 정책 learner_self_corrections 와 **같은 사슬**을 걷는다.
  --    service_role 은 RLS 를 우회하므로 정책이 이것을 막아주지 않는다 — 서버 코드 버그
  --    하나면 A 학생의 열람 사건이 B 학생의 교정을 가리킨다(c6 이 복합 FK 로 막은 그 형태).
  --    NEW.correction_id null 검사를 함수 안에도 둔다: when 절 없이 다시 등록되는 날
  --    `not exists`가 null 에 대해 참이 되어 **정상 사건을 전부 거부**한다.
  create or replace function engine.reject_cross_learner_correction() returns trigger
    language plpgsql security invoker set search_path = engine, public as $function$
  begin
    if NEW.correction_id is not null and not exists (
      select 1
        from engine.corrections c
        join engine.submissions s on s.submission_id = c.submission_id
        join engine.learning_events e on e.event_id = s.event_id
       where c.correction_id = NEW.correction_id
         and e.learner_id = NEW.learner_id
    ) then
      raise exception
        '다른 학생의 교정을 가리킬 수 없다 — correction_id=%는 learner_id=%의 제출물에 달린 교정이 아니다 (L0 §8 교차 학생 연결 금지)',
        NEW.correction_id, NEW.learner_id;
    end if;
    return NEW;
  end
  $function$;

  drop trigger if exists learning_events_correction_same_learner on engine.learning_events;
  create trigger learning_events_correction_same_learner
    before insert on engine.learning_events
    for each row when (NEW.correction_id is not null)
    execute function engine.reject_cross_learner_correction();

  -- ④ 사슬을 되짚는 조회(교정 1건에 달린 열람·응답)가 전건 훑기가 되지 않게.
  create index if not exists learning_events_correction_idx
    on engine.learning_events (correction_id) where correction_id is not null;

  -- ⑤ 판 접미 통일 — 값은 한 글자도 안 바꾸고 이름만 c7→c8. 위 머리말 🔑의 이유다.
  --    `if exists`는 재실행 관용이 아니다: 위 이력 판정이 「c7까지 섰고 c8은 아직」을 이미
  --    못박았으므로, 여기서 이름이 없다면 그건 이력과 실물이 어긋난 상태이고 그 판정은
  --    확인 블록의 「빠진제약」이 낸다.
  alter table engine.learning_events
    drop constraint if exists learning_events_event_type_c7,
    drop constraint if exists learning_events_task_type_c7,
    add constraint learning_events_event_type_c8 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result'
    )),
    add constraint learning_events_task_type_c8 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    ));

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c7,
    drop constraint if exists submissions_translation_source_c7,
    add constraint submissions_task_format_c8 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    add constraint submissions_translation_source_c8 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c7,
    add constraint corrections_verdict_c8 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c7,
    drop constraint if exists learners_temp_password_paired_c7,
    add constraint learners_signup_attempts_nonneg_c8 check (signup_attempts >= 0),
    add constraint learners_temp_password_paired_c8
      check (temp_password_hash is null or temp_password_expires_at is not null);

  alter table engine.staff
    drop constraint if exists staff_role_c7,
    add constraint staff_role_c8 check (role in ('teacher', 'inspector', 'director'));

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
             and (select version from 현재이력)='20260807040000'
              and (select checksum from 현재이력)='158d55f17d54ab173721dc8945935eed93c6451c3a22a3b37059de171c42fdb6' -- migration-checksum
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
-- ① 테이블과 RLS: 전부 true여야 한다(c8은 테이블을 늘리지 않는다 — 11 그대로).
-- ② 정책: c8은 정책을 늘리지 않는다 — 8 그대로. 「누구 것인가」는 기존 정책의 사슬을 쓴다.
-- ③ anon·authenticated의 engine 스키마·테이블 권한은 0이어야 한다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다. c7 이름이 하나라도 보이면 이 조각이 안 돈 것이다.
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
--    c8 고유분: learning_events_correction_id_fkey · 트리거 learning_events_correction_same_learner
--    그리고 learning_events.correction_id 열이 「빠진열」에 안 보여야 한다.
-- ⑤ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.

commit;
