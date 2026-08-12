-- 강사 한 마디를 담을 자리 — 강사 반 단위 피드백의 §6 ㉠ 조각
--
-- 정본 = SYNK-talk `docs/강사_반단위_피드백_설계.md` v2 §6 (유호님 신규 지시 2026-08-12
--   「반을 보기 쉽게 정해서 해당 반에 들어가서 피드백하기 쉽도록」).
-- 앞 조각(`20260812200000_class_c11`)이 「반」을 세웠고, 이 조각은 그 반 안에서 강사가 낸
--   한 마디가 **어디에 앉는가**를 세운다. 통로(§8-3 `teach` 라우트 셋)는 같은 커밋에 선다.
--
-- ■ 🔴 왜 `corrections` 가 아닌가 (설계 §2 — 이 설계의 급소)
--   `actor_kind='teacher'` 는 「강사」가 아니라 **「사람 직원」**이고 검수 확정이 그 값으로 앉는다
--   (`review/index.ts:572`). 강사 한 마디를 그 표에 쓰면 세 자리가 한꺼번에 오염된다:
--     ① `supersedes` 대상 판정이 `actor_kind='teacher'` **하나로만** 가른다(`review:490`) →
--        강사 행이 정당한 재검수 대상이 되고, 거절 문구조차 사람 눈엔 정상으로 보인다.
--     ② `promotion_intent` CHECK(`= false or actor_kind='teacher'`) → 검수 안 거친 한 마디가
--        **훈련 승격 후보** 자리에 선다.
--     ③ `verdict` 계보가 검수 확정과 섞인다.
--   🚫 `actor_kind` 에 값을 더하는 길도 막혀 있다 — c6 이 `actor_values` 를 못박아 검사하므로
--      계약·CHECK·검사 셋이 동시에 흔들린다. 그래서 **표를 따로 둔다**.
--
-- ■ 왜 ㉡(기존 `learning_events`)이 아닌가 — 지금은 «소비자»가 그쪽에 없다
--   설계 §6 ▶권고 그대로다. 사건으로 쓰면 새 표는 0인데 그 사건을 읽어 학생 화면에 배달하는
--   배선이 아직 판정도 안 섰다 — 소비자 없는 생산자가 되어 도달 래칫에 걸린다.
--   이 표는 **태어나는 순간 소비자가 있다**: 강사 큐가 「한 마디가 이미 있는 것」을 빼는 데 쓴다.
--   ⚠ 배달 배선이 서는 날 ㉡ 을 «더한다»(이 표를 지우는 것이 아니라 — 여기는 강사가 쓴 원문이고
--     거기는 학생에게 간 사건이다. 뜻이 다르므로 합치지 않는다).
--
-- ■ 🔴 파일 이름이 c12 가 아니라 c11 인 이유 — 앞 조각의 판단을 **그대로** 잇는다
--   설계 문서는 §6 을 「계약 변경」이라 적었지만, 그 판정은 `20260812200000` 이 이미 한 번
--   바로잡은 것과 같은 이름 오류다. 계약판은 `계약/수집_교정_계약.json` 의 `버전`에서 파생되고
--   (`tests/L0스키마.test.js` 의 `제약()`), 네 Edge Function 이 계약판을 **최신 조각 이름**에서
--   읽는다(`tests/마이그레이션이름.test.js`). 이 조각이 계약을 바꾸는가를 셋으로 잰다:
--     새 `event_type` **0** · 새 값목록(`계약`의 열거) **0** · `learning_events` 손댐 **0**.
--   셋 다 0이라 계약판은 c11 그대로다. `season_c11`·`season_review_c11`·`learner_profile_c11`·
--   `class_c11` 이 `engine_c11` 뒤에 c11 을 이어 쓴 것과 같은 판단이다.
--   ⚠ 이 표의 값목록 둘(`origin`·`disposition`)은 **계약 파일에 없다** — 앱↔서버 계약이 아니라
--     강사 화면 안에서만 도는 어휘라 `lib/반피드백.js` 가 정본이고 아래 CHECK 가 그 사본이다.
--     사본을 없앨 수 없으니 기계에 물린다 — `tests/반피드백.test.js` 가 두 소스를 대조한다.
--
-- ■ 한 산출물에 한 마디 — 유일 제약으로 못박는다
--   두 벌을 허용하면 「기다리는 것 n」의 뜻이 즉시 갈린다(마디 수인가 산출물 수인가).
--   대신 **개서는 연다**(`on conflict do update`) — 삭제가 막힌 자리에서 개서까지 막으면
--   남는 통로가 0이 되고, 그때 우회가 정상 통로가 된다(F103 · 회고 조각과 같은 판단).
--   `updated_at` 을 둬서 고쳐 쓴 사실이 **행에 남게** 한다(개서를 열되 조용하지는 않게).
--
-- ■ 삭제는 막는다
--   강사가 낸 말은 사람 손에서만 나오므로 사라지면 소급이 안 된다 — 나침반·회고와 같다.
--
-- ■ 채우는 코드는 이 조각에 0줄이다 — 정직 표기
--   생산자 = `functions/teach` 의 `POST feedback/give` 이고 **같은 커밋**에 선다.
--   「표가 섰다」를 「강사 피드백이 돈다」로 읽지 않는다 — 라이브 붓기는 ⏳유호님 승인이고,
--   그 전까지 이 표의 행 수는 0이다.
--   ⚠ 아직 **없는 것**: 학생에게 배달하는 배선(§6 ㉡)과 시즌 롤오버는 여기에도, 어디에도 없다.
--
-- 되돌림: drop table if exists engine.teacher_notes;
--        drop function if exists engine.teacher_notes_protect();
--        delete from engine.schema_migrations where version = '20260812210000';

begin;

do $migration$
declare
  migration_version constant text := '20260812210000';
  migration_name constant text := '20260812210000_teacher_notes_c11.sql';
  expected_checksum constant text := '0b8347b2d9a9541c9601f7f4f2b69e5db675217bf4f2e2caa3bcbe2babbd818d'; -- migration-checksum
  base_version constant text := '20260812200000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c11 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  if to_regclass('engine.classes') is null then
    raise exception
      'engine.classes 가 없다 — 한 마디는 반 안에서 나온다(20260812200000_class_c11 이 먼저 서야 한다)';
  end if;

  -- 강사 한 마디 — 산출물 하나에 하나. `body` 는 강사가 실제로 «보낸» 글이고,
  --   `origin` 은 그 글이 **어디서 왔나**(AI 문장 그대로냐 · 고쳤냐 · 직접 썼냐)다.
  --   ⚠ `origin` 을 안 두면 설계 §6 도전안(기본 동작을 「고르기」로)이 답 나는 날 마이그가
  --     한 벌 더 필요해지고, 그때는 이미 쌓인 행의 갈래를 **영원히 복원 못 한다**.
  --     지금 칸을 두면 어느 답이 나와도 화면 버튼만 갈리고 물리는 안 흔들린다.
  create table if not exists engine.teacher_notes (
    note_id       uuid primary key default gen_random_uuid(),
    submission_id uuid not null references engine.submissions(submission_id) on delete restrict,
    staff_id      uuid not null references engine.staff(staff_id),
    body          text not null constraint teacher_notes_body_nonblank_c11 check (btrim(body) <> ''),
    origin        text not null constraint teacher_notes_origin_c11
                    check (origin in ('as_is', 'edited', 'written')),
    disposition   text not null constraint teacher_notes_disposition_c11
                    check (disposition in ('confirmed', 'retry')),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz,
    schema_ver    text not null,
    constraint teacher_notes_once_c11 unique (submission_id)
  );

  comment on table engine.teacher_notes is
    '강사가 한 산출물에 낸 한 마디(강사_반단위_피드백_설계 §6 ㉠). 🚫corrections 아님 — actor_kind=teacher 는 「사람 직원」이라 검수 계보를 오염시킨다(§2).';

  -- 「이번 주 이 강사가 누구에게 한 마디를 냈나」가 이 인덱스를 탄다(설계 §5 한 수 더).
  create index if not exists teacher_notes_staff_created
    on engine.teacher_notes (staff_id, created_at);

  /* 삭제 금지 — 회고·나침반과 같다. 사람 손에서만 나오는 말은 사라지면 소급이 안 된다.
   * ⚠ 개서를 «같이» 막지 않는 이유는 머리말 참조(막으면 우회가 정상 통로가 된다 · F103). */
  create or replace function engine.teacher_notes_protect() returns trigger
    language plpgsql as $protect$
  begin
    raise exception '강사 한 마디는 삭제하지 않는다 — 사람이 낸 말은 소급이 안 된다(강사_반단위_피드백_설계 §6)';
  end
  $protect$;

  drop trigger if exists teacher_notes_protect on engine.teacher_notes;
  create trigger teacher_notes_protect
    before delete on engine.teacher_notes
    for each row execute function engine.teacher_notes_protect();

  -- engine 취급 그대로 — RLS 켜고 정책 0(전면 거부) · service_role 만 쓰기 · PostgREST 비노출.
  -- 나중에 노출하는 날 잊어도 **닫힌 채로 실패한다**.
  alter table engine.teacher_notes enable row level security;

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- ============================================================================
-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'),
  ('learning_events', 'request_hash'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('learning_events','correction_id'),
  ('learning_events','consent_id'),
  -- 동의 출처(20260807140000)
  ('consents','recorded_by'),
  -- 추정메타 물리 칸(20260807170000 · 절단문서 ①-7)
  ('learning_events','source_kind'), ('learning_events','estimator_confidence'),
  ('learning_events','estimator_version'), ('learning_events','evidence_refs'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
  -- 마감 시각·마감 판본(20260808010000 · 소급 불가 · 유호님 승인 2026-08-08)
  ('submissions','due_at'), ('submissions','due_ver'),
  -- 검수 확정이 담길 칸 넷(20260809090000 · 검수_내부계약 §5 — c10 으로 섰다)
  ('corrections','supersedes'), ('corrections','promotion_intent'),
  ('corrections','transcript_at_review'), ('pipeline_jobs','discard_reason'),
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at'),
  -- ⚠ 아래 세 묶음은 c7 뒤에 붙은 조각들이 낸 열이다. 이 확인 블록은 앞 조각에서
  --   베끼는 것이 아니라 바로 앞 조각에서 이어야 한다 — c8 초안이 20260806210000 의
  --   블록을 베껴 13열을 통째로 떨어뜨린 실측이 있다(빠진 검사 = 통과와 같은 모양).
  -- 학생 로그인(L0 §4-1·§4-2 · 20260806233000_auth_c7)
  ('learners','recovery_email'), ('learners','recovery_phone'),
  ('learners','temp_password_expires_at'), ('learners','signup_attempts'),
  -- 직원 인증·세션 폐기(L0 §4-5·§4-2 ③ · 20260806234000_staff_c7)
  ('learners','active'), ('learners','revoked_before'),
  ('staff','role'), ('staff','staff_id'), ('staff','active'), ('staff','revoked_before'),
  ('staff_access_log','action'), ('staff_access_log','target_ids'),
  -- 임시번호를 해시로 든다(L0 §4-2-2 · 20260807024500_temp_password_c7)
  ('learners','temp_password_hash'),
  -- 시즌 그릇 ①②(20260812140000 · 소급 불가 — 나침반은 그날 안 물으면 영원히 빈칸이다)
  ('season','textbook'), ('season','starts_on'), ('season','ends_on'),
  ('season_compass','answers'), ('season_compass','self_in_5y_changed'),
  ('season_compass','goal_track_at_open'), ('season_compass','recorded_by'),
  -- 시즌 회고 ③④(20260812170000) — 근거·라벨·대조군이 「한 행」에 있어야 한다(설계 §7).
  --   갈라 두면 창이 밀려 원리상 짝을 못 맞추고, 그릇은 화면으로 끝나고 엔진엔 안 닿는다.
  ('season_review','record_snapshot'), ('season_review','verdict'),
  ('season_review','verdict_by_self'), ('season_review','note'),
  ('season_review','opened_by'), ('season_review','opened_at'),
  ('season_review','decided_by'), ('season_review','decided_at'),
  -- 가입 1회 문항(20260806150000 이 낸 열 · 20260812180000 이 값을 조인다).
  --   열이 사라지면 「지역 억양 편차의 유일한 축」이 통째로 없어지는데, 그 손실은 조용하다 —
  --   가입은 그대로 성공하고 세 칸만 안 쌓인다(2026-08-09 에 실제로 그 상태였다).
  ('learners','home_aimag'), ('learners','gender'), ('learners','goal_track'),
  -- 반(20260812200000) — 좌표·시즌·활성이 전부 있어야 「지난 시즌 반」을 닫을 수 있다.
  --   `class_key` 가 빠지면 시트와 대조할 자연키가 사라지고, 어긋난 날 증상은 조용함뿐이다.
  ('classes','class_key'), ('classes','season_id'), ('classes','display_name'),
  ('classes','active'), ('classes','schema_ver'),
  ('learners','class_id'),
  ('staff_classes','staff_id'), ('staff_classes','class_id'), ('staff_classes','schema_ver'),
  -- 강사 한 마디(20260812210000) — `origin` 이 빠지면 설계 §6 도전안이 답 나는 날 이미 쌓인
  --   행의 갈래를 영원히 복원 못 한다. `updated_at` 이 빠지면 개서가 조용해진다.
  ('teacher_notes','submission_id'), ('teacher_notes','staff_id'), ('teacher_notes','body'),
  ('teacher_notes','origin'), ('teacher_notes','disposition'),
  ('teacher_notes','updated_at'), ('teacher_notes','schema_ver')
), 기대제약(n) as (values
  ('learning_events_event_type_c11'), ('learning_events_task_type_c11'),
  ('submissions_task_format_c11'), ('submissions_translation_source_c11'),
  ('submissions_due_paired_c11'), ('corrections_verdict_c11'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c11'), ('staff_role_c11'),
  ('learners_temp_password_paired_c11'),
  ('learning_events_correction_target_c11'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c11'), ('corrections_promotion_intent_c11'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c11'),
  -- 시즌 그릇(20260812140000) — 겹침 배제·날짜 순서·학생×시즌 유일·문항 묶음 + 고리 둘.
  --   유일키가 빠지면 같은 시즌에 두 행이 서고, 회고가 어느 것을 왼쪽으로 쓸지 모른다.
  ('season_no_overlap_c11'), ('season_dates_c11'),
  ('season_compass_once_c11'), ('season_compass_answers_c11'),
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey'),
  -- 시즌 회고(20260812170000) — 판정 3갈래 둘 + 「판정·사유·주체·시각 한 벌」 + 고리 둘.
  --   값목록이 빠지면 오타 라벨('closser')이 그대로 앉고 엔진은 그걸 4번째 갈래로 배운다.
  ('season_review_once_c11'), ('season_review_verdict_c11'),
  ('season_review_self_c11'), ('season_review_decided_c11'),
  ('season_review_learner_id_fkey'), ('season_review_season_id_fkey'),
  -- 가입 1회 문항 값목록(20260812180000) — 세 칸 전부. 하나만 서면 나머지 둘은 여전히
  --   자유 입력이라, 「조였다」가 참인 칸과 거짓인 칸이 한 표에 섞인다.
  ('learners_home_aimag_c11'), ('learners_gender_c11'), ('learners_goal_track_c11'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  --   고리가 빠지면 없는 반·없는 강사를 가리키는 행이 앉고, 그건 화면에서 「빈 반」으로만 보인다.
  ('classes_pkey'), ('classes_key_nonblank_c11'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  -- 강사 한 마디(20260812210000) — 유일(한 산출물에 하나) + 값목록 둘 + 빈 말 금지 + 고리 둘.
  --   유일이 빠지면 「기다리는 것 n」의 뜻이 즉시 갈린다(마디 수인가 산출물 수인가).
  --   값목록이 빠지면 오타 갈래('writen')가 그대로 앉고, 그 행은 어느 갈래도 아니게 된다.
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c11'),
  ('teacher_notes_origin_c11'), ('teacher_notes_disposition_c11'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000) — 행이 사라지는 것만 막는다(개서는 촉진 세션의 정상 통로)
  ('season_compass_protect'),
  -- 회고(20260812170000) — 굳힌 근거 불변 + 학생 판정은 강사 「전」에만 + 삭제 금지.
  --   freeze 가 꺼지면 재계산한 숫자로 옛 판정을 덮어쓸 수 있고 그건 조용히 통과한다.
  ('season_review_freeze'), ('season_review_protect'),
  -- 강사 한 마디 삭제 금지(20260812210000)
  ('teacher_notes_protect')
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
), 라디오테이블(t) as (
  -- radio 는 아직 뷰가 0이다 — 첫 뷰(구간 귀속·「그날」)가 서는 조각이 여기에 union 을 더한다.
  select tablename from pg_tables where schemaname='radio'
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
  -- 🔴 존재만 묻지 않는다. 꺼진 트리거는 pg_trigger 에 행이 그대로 남고 tgenabled 만
  --    'D'(꺼짐)·'R'(복제본에서만)이 된다 — 안 잰 것을 통과로 내면 그건 확인이 아니다.
  select e.n,
         (select g.tgenabled from pg_trigger g
            join pg_class r on r.oid=g.tgrelid
           where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n) as 상태
    from 기대트리거 e
), 빠진트리거 as (
  -- 상태를 이름 옆에 붙인다 — 「없음」은 판을 부어야 하고 「꺼짐」은 enable 한 줄이라 처방이 갈린다.
  --    ⚠ `상태` 는 "char" 다 — text 와 직접 비교하면 Postgres 가 연산자를 못 고르고
  --    operator is not unique 로 쿼리 전체가 안 돈다 — 파일 층 검사는 이걸 못 본다(2026-08-07 실측).
  select string_agg(n || case when 상태 is null then '' else ' (꺼짐:' || 상태::text || ')' end,
                    ', ' order by n) v
    from 트리거상태 where 상태 is null or 상태 not in ('O', 'A')
), 현재이력xml as (
  select CASE WHEN to_regclass('engine.schema_migrations') is null THEN null::xml
              ELSE query_to_xml(
                'select version, name, checksum, applied_at::text as applied_at
                   from engine.schema_migrations order by applied_at desc, version desc limit 1',
                false, false, '') END as x
), 현재이력 as (
  select ((xpath('/table/row/version/text()', x))[1])::text as version,
         ((xpath('/table/row/name/text()', x))[1])::text as name,
         ((xpath('/table/row/checksum/text()', x))[1])::text as checksum,
         ((xpath('/table/row/applied_at/text()', x))[1])::text as applied_at
    from 현재이력xml
), 셈 as (select
  -- 🔑 16 → 17 (20260812210000): engine.teacher_notes 가 섰다.
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 5 (20260812170000 이 4 에서 올렸다). 이 조각도 이 수를 안 건드린다 — `teacher_notes` 의
  --    restrict 고리는 `submissions` 를 가리키지 learners 를 가리키지 않는다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('engine') and contype='f'
      and confrelid=to_regclass('engine.learners') and confdeltype='r') as 삭제차단,
  (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typnamespace=to_regnamespace('engine')
      and t.typname='job_status' and e.enumlabel='failed') as 실패상태,
  (select count(*) from pg_policies
    where schemaname='engine' and tablename='schema_migrations') as 이력정책,
  -- 검수자 판(20260807190000 · 절단문서 ②-17): 뷰가 있고 옛 정책이 없어야 둘 다 맞다.
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue') as 검수뷰,
  (select count(*) from pg_policies
    where schemaname='engine' and policyname='inspector_queue_submissions') as 옛검수정책,
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출,
  -- 마감(20260808010000): c10 이 선 뒤에 만들어진 배정만 센다 — 옛 행의 마감은 아무도 모른다.
  (select count(*) from engine.submissions s
     join engine.learning_events e on e.event_id = s.event_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and s.occurred_at >= (select applied_at from engine.schema_migrations
                             where version = '20260808010000')) as 마감없는배정,
  -- 분모의 정본은 task.assigned 사건 하나다 — daily_activity.expected 에 값이 들어오면 빨개진다.
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염,
  -- 폐기 사유(20260809090000): 그 조각이 선 뒤에 갱신된 job 만 센다.
  (select count(*) from engine.pipeline_jobs j
    where j.status = 'discarded' and j.discard_reason is null
      and j.updated_at >= (select applied_at from engine.schema_migrations
                            where version = '20260809090000')) as 폐기사유없는폐기,
  -- 검수 판이 올라간 판인지(20260809050000): 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문,
  -- 🔴 회고(20260812170000): 라벨이 있는데 근거가 「비어 있는」 행 — 0이어야 한다.
  --    not null 은 「칸이 있다」만 보장하고 '{}' 는 통과시킨다. 근거 없는 라벨은 엔진으로
  --    그대로 흘러 들어가고, 그 오염은 나중에 가려낼 방법이 없다.
  (select count(*) from engine.season_review
    where verdict is not null
      and (record_snapshot = '{}'::jsonb
           or record_snapshot -> 'axes_전반' is null
           or record_snapshot -> 'axes_후반' is null)) as 근거없는라벨,
  -- 🔴 가입 1회 문항(20260812180000): 목록 밖 값이 앉은 행 — 0이어야 한다.
  --    CHECK 가 섰으므로 «앞으로»는 0 이 유지된다. 이 칸이 재는 것은 **CHECK 가 실제로
  --    걸려 있는가**다 — 제약이 빠진 DB 에서는 이 수가 조용히 오르고, 그때가 아이막 표기가
  --    섞이기 시작한 날이다(섞인 뒤엔 어느 표기가 어느 아이막이었는지 복원이 안 된다).
  (select count(*) from engine.learners
    where (home_aimag is not null and home_aimag not in (
             'ulaanbaatar','arkhangai','bayan-olgii','bayankhongor','bulgan','darkhan-uul',
             'dornod','dornogovi','dundgovi','govi-altai','govisumber','khentii',
             'khovd','khovsgol','omnogovi','orkhon','ovorkhangai','selenge',
             'sukhbaatar','tov','uvs','zavkhan'))
       or (gender is not null and gender not in ('female','male','undisclosed'))
       or (goal_track is not null and goal_track not in ('study','work','culture')))
    as 목록밖프로필,
  -- 🔴 반(20260812200000): 같은 좌표가 두 벌 앉은 반 — 0이어야 한다.
  --    이 칸이 재는 것은 **부분 유일 인덱스 둘이 실제로 걸려 있는가**다. 빠지면 명부 스윕이
  --    매 판 같은 반을 새로 만들고 학생마다 다른 class_id 가 붙는데, 증상은 「강사 큐에
  --    학생이 몇 명 없다」뿐이라 조용하다.
  (select count(*) from (
     select class_key, season_id from engine.classes
      group by class_key, season_id having count(*) > 1) d) as 겹친반좌표,
  (select count(*) from pg_indexes
    where schemaname='engine'
      and indexname in ('classes_key_in_season','classes_key_no_season')) as 반좌표유일,
  -- ── 라디오 원장(20260811160000 · radio 스키마) ──
  (select count(*) from pg_tables where schemaname='radio') as 라디오표수,
  (select count(*) from pg_tables where schemaname='radio' and rowsecurity) as 라디오RLS수,
  (select count(*) from pg_policies where schemaname='radio') as 라디오정책수,
  (select count(*) from 대상역할 r cross join 라디오테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','radio',t.t), p.p)) as 라디오새는권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('radio'), 'USAGE')) as 라디오새는스키마,
  -- c11 이 접미를 갈았다 — 옛 이름을 세면 「적용 전」과 「적용 후」가 같은 0 으로 보인다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('radio')
      and conname='broadcast_segment_kind_c11') as 라디오kind제약,
  -- 링크 보호 트리거 — 존재가 아니라 켜짐을 센다(engine 트리거상태와 같은 이유).
  (select count(*) from pg_trigger g
     join pg_class c2 on c2.oid=g.tgrelid
    where c2.relnamespace=to_regnamespace('radio')
      and g.tgname='viewer_link_protect' and g.tgenabled in ('O','A')) as 연동보호트리거,
  -- 활성 링크는 채널당 1개 — 부분 유일 인덱스가 서 있어야 §3 의 유일성이 물리다.
  (select count(*) from pg_indexes
    where schemaname='radio' and indexname='viewer_link_active') as 연동활성유일,
  -- ── c11: engine.skills 첫 시드(문항 팩 스킬표 30 · skills.v1) — 0이면 승격이 전건 거절된다.
  (select count(*) from engine.skills) as 스킬시드수,
  -- 🔴 강사 한 마디(20260812210000): 한 산출물에 두 마디가 앉은 것 — 0이어야 한다.
  --    유일 «제약»의 존재는 위 빠진제약이 이미 본다. 이 칸이 재는 것은 **데이터**다 —
  --    제약을 떼고 부은 DB 에서는 이 수가 조용히 오르고, 그때부터 「기다리는 것 n」이
  --    산출물 수가 아니라 마디 수를 세게 된다(강사가 보는 숫자가 뜻을 잃는다).
  (select count(*) from (
     select submission_id from engine.teacher_notes
      group by submission_id having count(*) > 1) d2) as 겹친한마디
)
select case when 테이블수=17 and RLS켜짐=17 and 정책수=7
              and 새는테이블권한=0 and 새는스키마권한=0 and 삭제차단=5 and 실패상태=1
              and 이력정책=0 and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
              and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
              and 검수판열=22 and 검수판원문=0 and 근거없는라벨=0 and 목록밖프로필=0
              and 겹친반좌표=0 and 반좌표유일=2
              and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
              and 라디오새는권한=0 and 라디오새는스키마=0 and 라디오kind제약=1
              and 연동보호트리거=1 and 연동활성유일=1 and 스킬시드수=30
              and 겹친한마디=0
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260812210000'
              and (select checksum from 현재이력)='0b8347b2d9a9541c9601f7f4f2b69e5db675217bf4f2e2caa3bcbe2babbd818d' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 17·17·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260812200000_class_c11.sql` «뒤»에만 선다(base_version).
--    앞의 c11 조각들이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 **+1**(`teacher_notes`) · RLS **+1** · 정책 0 · 트리거 **+1**(삭제 금지) · 열 신설 9.
--    `삭제차단`(5)은 앞 조각 그대로다 — 이 조각의 restrict 고리는 `submissions` 를 가리킨다.
-- ② 새 칸 `겹친한마디` = **0**. 유일 «제약»의 존재는 `빠진제약` 이 이미 보므로 이 칸은
--    **데이터**만 잰다(앞 조각의 `겹친반좌표`+`반좌표유일` 두 칸이 필요했던 이유는 부분 인덱스가
--    pg_constraint 에 안 잡히기 때문이다 — 여기는 제약이라 한 칸으로 족하다).
-- ③ 이 조각은 **행을 하나도 안 만든다**. `engine.teacher_notes` 는 `POST feedback/give` 가
--    채운다 — 지금 0행이 정상이다. 「표가 섰다」를 「강사 피드백이 돈다」로 읽지 않는다.
-- ④ 🔴 아직 **없는 것** — ㉠에 앉은 한 마디를 학생 화면으로 배달하는 배선(§6 ㉡)이 없다.
--    지금 소비자는 강사 큐 하나뿐이고(「한 마디가 이미 있는 것」을 뺀다), 학생은 아직 못 본다.
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 셋을 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--      📏 앞 조각이 이 자리를 밟고 경고를 남겼는데 **이 조각도 그대로 밟았다**(위 ⓪의 파일명이
--        잡혔다) — 경고문은 다음 사람을 못 막는다. 막는 것은 이 회귀 하나다.
--    ⚠ `teacher_notes_once_c11` 은 여기 없다 — UNIQUE 라 CHECK 목록의 대상이 아니다.
--    기대: broadcast_segment_kind_c11 · classes_key_nonblank_c11
--         · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_gender_c11 · learners_goal_track_c11 · learners_home_aimag_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11 · teacher_notes_body_nonblank_c11
--         · teacher_notes_disposition_c11 · teacher_notes_origin_c11
