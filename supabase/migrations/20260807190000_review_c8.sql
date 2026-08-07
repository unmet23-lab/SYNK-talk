-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md §4-5 ②
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8 — 이 조각은 계약을 안 바꾼다.
--   새 열도 새 값목록도 없다. 바꾸는 것은 **검수자가 무엇을 읽는가** 하나다.)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 닫나 — 익명화가 이름만 가리고 있었다 (절단문서 ②-17)
--   `20260806234000_staff_c7` 의 `inspector_queue_submissions` 는 큐에 든 제출물의 **행 전체**를
--   연다. RLS 는 행 단위라 열을 못 좁힌다. 그래서 `learners` 를 안 열어 `display_name` 을
--   가려 놓고도 `body_original`·`task_snapshot`·`redaction_result` 가 같이 나갔다.
--   L0 §3-1 이 스스로 적어 둔 대로 **학생은 작문·음성에서 제 이름·전화를 말한다** — 즉
--   「검수 화면은 제출물 ID 로 돈다」는 익명화 주장은 구조로 뒷받침되지 않았다.
--
-- ■ 🔴 그런데 진짜 통로는 이 정책이 아니다 (②-15 와 같은 자리)
--   `engine` 은 API 에 노출돼 있지 않고 `authenticated` 에게 테이블 권한이 0이라 **오늘
--   이 정책에 닿는 것은 아무것도 없다**(`supabase/검증_직원정책.sql` 머리말이 그래서
--   문을 잠깐 열고 잰다). 검수 대시보드는 `service_role` Edge Function 뒤에 서고, 그 역할은
--   RLS 를 **우회한다.** 그러니 정책만 좁히면 고친 것처럼 보이고 실제로는 아무것도 안 막는다.
--   → 좁히는 자리를 **정책이 아니라 판(projection)** 으로 옮긴다. `service_role` 도 이 뷰를
--     읽으면 그 열만 얻는다. 옛 정책은 **지운다** — 남겨 두면 「검수자가 읽는 것」의 정본이
--     둘이 되고, 둘 중 넓은 쪽이 조용히 이긴다.
--
-- ■ 허용 목록이지 차단 목록이 아니다
--   `submissions` 에 열이 붙는 날 차단 목록은 **못 적은 이름을 그대로 흘리고** 증상은
--   「통과」다. 허용 목록이면 새 열의 기본값이 「안 나감」이고 증상은 **화면이 비는 것**이라
--   그날 사람이 온다 — 그 자리에서 「이걸 검수자가 봐도 되나」를 정하게 되는 것이 이
--   목록의 값이다. 반대방향 장부(빠진 열마다 사유)는 `tests/검수큐.test.js` 가 든다.
--
-- ■ 무엇을 안 담았나 (오늘 화면이 안 쓰는 것 · 발주_수집파이프라인 §3)
--   `body_original`·`task_snapshot` — 오늘 검수 화면은 **음성**이다(오디오 + 「들린 대로」 +
--     「교정문」 세 칸뿐). 쓰기·번역 검수 화면이 서는 날 이 줄에 더한다. 그날이 「사람이
--     원문을 읽는다」를 다시 판정할 자리고, 지금 미리 열어 두면 그 판정이 영영 안 일어난다.
--   `redaction_ver`·`redaction_result` — 후자는 **가려낸 식별자 자체**를 담는 칸이다.
--     비식별의 산출물을 검수자에게 주는 것은 비식별을 안 한 것보다 나쁘다.
--   `event_id` — 학생의 사건 줄 전체로 가는 지렛대. 화면은 `submission_id` 로 돈다.
--   `capture_meta`·`image_refs`·`task_ref`·`task_schema_ver`·`schema_ver` — 화면에 자리가 없다.
--
-- ■ 🔴 남는 것은 줄일 수 없다 — 그건 열 목록으로 못 푼다
--   `audio_ref` 와 `transcript` 는 **검수 대상 그 자체**다. 학생이 거기서 제 이름을 말하면
--   검수자는 그것을 듣는다. 그래서 이 조각은 「검수자는 개인정보를 안 본다」를 만들지 못하고,
--   만들었다고 적지도 않는다 — L0 §4-5 ② 의 그 문장을 이 커밋이 함께 고친다.
--   남은 통제는 동의·수탁 계약·조회 감사(`staff_access_log`)이고 그건 유호님 판정 자리다.
--
-- ■ 철회분은 큐에서 뺀다
--   `audio_deleted_at` 이 찍힌 행은 학생이 철회한 것이다(L0 §9-3 · 발주 §4 수용기준 6).
--   행은 남지만 사람에게 다시 보여줄 이유가 없다. ⚠ 이 필터는 **음성 축만** 덮는다 —
--   음성이 없는 제출(쓰기·번역)의 철회는 이 칸에 안 찍히고, 그 갈래는 ②-16 몫이다.
--
-- ■ 새 물건이 하나 늘었으니 새는지 보는 눈도 넓힌다
--   확인 쿼리의 `대상테이블` 은 `pg_tables` 만 훑었다 — **뷰는 거기 없다.** 이 조각이 engine
--   첫 뷰를 만들므로 같은 조각에서 `pg_views` 를 합친다. 안 넓히면 뷰에 grant 가 붙어도
--   「새는테이블권한=0」 이 그대로 초록이다(가드가 등록층에서 새는 네 형태 중 ③).
--
-- 이 조각은 20260807170000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807190000';
  migration_name constant text := '20260807190000_review_c8.sql';
  expected_checksum constant text := '949655b398b49f55b0629fdb718c5c18e5c10833af3c4905fcebd0d9165860b9'; -- migration-checksum
  base_version constant text := '20260807170000';
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
      '선행 조각 %가 없다 — 순서대로 부어라(합본은 처음부터 붓는다)', base_version;
  end if;

  -- ── 검수자가 읽는 판 (L0 §4-5 ② · 절단문서 ②-17) ────────────────────────
  -- 🔴 역할 판정을 여기 넣지 않는다. 이 뷰의 소비자는 `service_role` Edge Function 이라
  --    `auth.uid()` 가 null 이고, `current_staff()` 를 걸면 **정상 호출이 0행**이 된다.
  --    「이 토큰이 검수자인가」는 §4-5 ② 대로 서버가 `engine.staff` 에서 확정한다 —
  --    이 뷰가 정하는 것은 **무엇을 보여줄 것인가** 하나다.
  create or replace view engine.review_queue as
    select s.submission_id,
           s.task_type,
           s.task_format,
           s.occurred_at,
           s.audio_ref,
           s.audio_duration_sec,
           s.transcript,
           s.transcript_verified,
           s.transcript_state,
           s.stt_segments,
           s.stt_confidence,
           s.code_switch_spans
      from engine.submissions s
     where engine.in_review_queue(s.submission_id)
       and s.audio_deleted_at is null;

  comment on view engine.review_queue is
    '검수자에게 내보내도 되는 제출물 열 — 허용 목록(절단문서 ②-17). 역할 판정은 Edge Function 몫.';

  -- 🔴 grant 하지 않는다. `engine` 은 API 에 노출돼 있지 않고, 조회 감사(`staff_access_log`)는
  --    「읽는 지점이 하나뿐」이라는 전제 위에 선다(§4-5 ④). 통로를 하나 더 내면 그 감사가 샌다.

  -- 옛 통로를 지운다 — 뷰와 정책이 같이 살면 정본이 둘이고 넓은 쪽이 이긴다.
  drop policy if exists inspector_queue_submissions on engine.submissions;

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
             and (select version from 현재이력)='20260807190000'
              and (select checksum from 현재이력)='949655b398b49f55b0629fdb718c5c18e5c10833af3c4905fcebd0d9165860b9' -- migration-checksum
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
-- ① 검수뷰=1 · 옛검수정책=0 — 둘을 같이 본다. 뷰만 서고 정책이 남으면 넓은 쪽이 이긴다.
-- ② 뷰가 실제로 좁은지는 열 목록으로 본다(파일 층 검사는 `tests/검수큐.test.js` 가 든다):
--      select column_name from information_schema.columns
--       where table_schema='engine' and table_name='review_queue' order by ordinal_position;
--    12열이어야 하고 body_original·task_snapshot·redaction_result 는 **없어야** 한다.
-- ③ 새는테이블권한=0 이 이제 뷰까지 센다 — review_queue 에 grant 를 붙이면 여기가 빨개진다.
--    (붙이면 안 된다: 조회 감사는 「읽는 지점이 하나」라는 전제 위에 선다 · L0 §4-5 ④)
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 안 바꾼다 — c8 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
