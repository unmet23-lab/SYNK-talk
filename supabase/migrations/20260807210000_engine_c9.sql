-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c9)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- c8 → c9 델타 — 「학생이 실제로 보고·들었다」는 **관측** 사건 이름 하나.
--   유호님 확정 2026-08-07. 정본 = appsscript `docs/_ops/심문_P0_소급불가_절단.md` §결정 요청.
--   `event_type` 값목록에 `content.viewed` 하나를 더한다. **그게 전부다** — 새 표 0 · 새 열 0.
--
-- ■ 왜 이름 하나가 소급불가 둘을 닫나
--   ①-2 의 남은 자리(재생 완료·자기 목소리 되듣기)와 ①-12 의 남은 절반(전달의 관측 짝)은
--   서로 다른 화면인데 **같은 사실**을 묻는다: 「그날 학생 앞에 놓인 것에 눈·귀가 닿았는가」.
--   ①-2 는 오디오 **밖**의 화면 행동이라 WAV 에서 파생이 안 되고(파생 가능한 것은 이미
--   `hesitation_ms` 계열로 기각됐다 · 발주_게임모듈 §646), ①-12 는 `intervention.delivered` 가
--   전날 밤 배치의 **추정**이라(lib/사건출처.js 가 `inferred` 로 박아 둔 자리) 관측 짝이 없으면
--   네트워크 실패가 「전달 완료」로 학습된다.
--
-- ■ 왜 지금인가 — 소급 불가
--   「그날 열었는가」는 그날에만 알 수 있다. 나중에 이름을 내도 그 전 기간은 영원히 빈칸이고,
--   개원 첫 주가 이탈이 제일 많은 창이다. 지금은 학생이 0이라 **잃는 행이 0** 이다 —
--   즉 이 조각은 「새는 것을 막는다」가 아니라 「첫 학생 전에 칸을 연다」이다.
--
-- ■ 🚫 `correction.viewed` 의 뜻을 넓히는 안은 기각(자기 기각)
--   그 사건은 `correction_id` 를 **필수**로 물고 있어(c8 · learning_events_correction_target)
--   넓히려면 그 필수를 풀어야 하고, 그 순간 「교정을 봤다」와 「오디오를 들었다」가 한 칸에서
--   섞인다. c6·§6-6 이 두 번 잡은 형태다. 교정 열람은 그대로 `correction.viewed` 다.
--
-- ■ 🔑 CHECK 접미는 **살아 있는 것 전부**를 c9 로 통일한다 — 값이 안 바뀐 여덟도 포함해서.
--   c8 머리말이 같은 판정을 적어 뒀고 `tests/L0스키마.test.js` 의 「CHECK 제약 이름이 계약
--   버전을 달고 있다」가 그 자리에서 빨개진다. 지키는 것은 값의 최신성이 아니라 **판이 조용히
--   미적용되는 것**이다 — 이름이 그대로면 「c9 계약 + c8 물리」가 초록으로 보인다.
--   여덟은 술어를 한 글자도 안 바꾸고 이름만 간다.
--
-- ■ ⚠ 이 조각은 **넓히기만 한다** — 기존 행을 떨어뜨리는 좁힘이 없다.
--   `event_type` 은 값이 늘기만 하고, 다시 거는 여덟은 술어가 c8 과 동일하므로 위반 행이
--   있을 수 없다. 즉 이 조각이 실패하면 그건 데이터가 아니라 이력·권한 문제다.
--
-- ■ ⛔ 생산자는 아직 0 이다 — 알고 남긴다.
--   낼 화면 셋(재생 완료·되듣기·개입 열람)이 `parent_event_id` 로 쓸 대상 사건 id 를 아직
--   손에 안 들고 있다(배달 payload 에 `intervention.delivered` 의 event_id 가 실려야 한다).
--   그 부재는 `lib/이벤트검증.js` 의 생산자 장부에 **사유로** 적혀 있고, 그 장부를
--   `tests/이벤트검증.test.js` 가 강제한다 — 이름만 서고 아무도 안 내는 상태가 조용히
--   초록으로 남지 않는다(전층감사 발견 A).
--
-- 이 조각은 20260807190000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807210000';
  migration_name constant text := '20260807210000_engine_c9.sql';
  expected_checksum constant text := '6539abce7a626aa59a03c213e331de94cc335fae9db7f4fc70e06b873831e85d'; -- migration-checksum
  base_version constant text := '20260807190000';
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

  -- ── learning_events — 값목록 +1(content.viewed) · 나머지 둘은 이름만 c8→c9.
  alter table engine.learning_events
    drop constraint if exists learning_events_event_type_c8,
    drop constraint if exists learning_events_task_type_c8,
    drop constraint if exists learning_events_correction_target_c8,
    add constraint learning_events_event_type_c9 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result', 'content.viewed'
    )),
    add constraint learning_events_task_type_c9 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    )),
    -- 🔑 술어는 c8 과 한 글자도 같다. `content.viewed` 는 교정 사건이 아니므로 else 가지로
    --    떨어져 `correction_id is null` 을 요구한다 — 그게 옳다(그 행의 대상은 correction 이
    --    아니라 `parent_event_id` 다 · lib/이벤트검증.js 이벤트별필수).
    add constraint learning_events_correction_target_c9 check (
      case when event_type in ('correction.viewed', 'correction.responded')
           then correction_id is not null
           else correction_id is null
      end
    );

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c8,
    drop constraint if exists submissions_translation_source_c8,
    add constraint submissions_task_format_c9 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    add constraint submissions_translation_source_c9 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c8,
    add constraint corrections_verdict_c9 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c8,
    drop constraint if exists learners_temp_password_paired_c8,
    add constraint learners_signup_attempts_nonneg_c9 check (signup_attempts >= 0),
    add constraint learners_temp_password_paired_c9
      check (temp_password_hash is null or temp_password_expires_at is not null);

  alter table engine.staff
    drop constraint if exists staff_role_c8,
    add constraint staff_role_c9 check (role in ('teacher', 'inspector', 'director'));

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
  ('learning_events_event_type_c9'), ('learning_events_task_type_c9'),
  ('submissions_task_format_c9'), ('submissions_translation_source_c9'), ('corrections_verdict_c9'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c9'), ('staff_role_c9'),
  ('learners_temp_password_paired_c9'),
  ('learning_events_correction_target_c9'), ('learning_events_correction_id_fkey'),
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
                       where j.submission_id = s.submission_id)) as 잡없는제출
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807210000'
              and (select checksum from 현재이력)='6539abce7a626aa59a03c213e331de94cc335fae9db7f4fc70e06b873831e85d' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 빠진제약이 비어야 한다 — 아홉 이름이 전부 `_c9` 로 바뀐 뒤라 하나라도 `_c8` 로 남으면
--    여기 이름이 뜬다(재실행으론 안 바뀐다 · drop/add 를 따로 돌린 자리다).
-- ② 값목록이 실제로 넓어졌는지는 넣어 보고 본다 — 리허설에서만:
--      insert 로 `content.viewed` 한 행을 세우고 지운다. c8 물리 위에서는 23514 로 거절된다.
-- ③ 🔴 **넓히기만 했다** — 기존 행을 검사하는 좁힘이 없으므로 이 조각은 위반 행으로 실패하지
--    않는다. `learning_events_correction_target_c9` 는 c8 과 술어가 한 글자도 같다(이름만 갈았다).
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 아홉을 `_c8`→`_c9` 로 갈았다).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c9 · learners_signup_attempts_nonneg_c9
--         · learners_temp_password_paired_c9 · learning_events_correction_target_c9
--         · learning_events_event_type_c9 · learning_events_task_type_c9
--         · staff_role_c9 · submissions_task_format_c9 · submissions_translation_source_c9
