-- 「반」을 물리로 세운다 — 강사 반 단위 피드백의 §8-1 조각
--
-- 정본 = SYNK-talk `docs/강사_반단위_피드백_설계.md` v2 §3 (유호님 신규 지시 2026-08-12
--   「반을 보기 쉽게 정해서 해당 반에 들어가서 피드백하기 쉽도록」).
-- 이 조각이 세우는 것은 **착수 순서 ①뿐**이다 — 표 2 + 칸 1. §8-3 `teach` 라우트·§8-4 화면은
--   여기 없다(자리를 미리 파 두면 「이미 있다」가 되어 배선 없는 표가 남는다).
--
-- 🔴 파일 이름이 **c12 가 아니라 c11 인 이유** — 설계 문서는 「c12 조각」이라 적었지만 그건
--   이름 오류다. 네 Edge Function(auth·events·uploads·deliver)이 계약판을 **최신 조각 이름**에서
--   읽고(`tests/마이그레이션이름.test.js`), 제약 이름의 접미는 `계약/수집_교정_계약.json` 의
--   `버전`에서 파생된다(`tests/L0스키마.test.js` 의 `제약()`). 이 조각은 계약을 **안 바꾼다**:
--   새 `event_type` 0 · 새 값목록 0 · `learning_events` 0. 그래서 계약판은 c11 그대로이고,
--   파일 이름을 c12 로 올리면 이름과 계약 파일이 갈려 제약 접미가 어느 쪽을 따르는지 알 수 없게
--   된다. `season_c11`·`season_review_c11`·`learner_profile_c11` 셋이 `engine_c11` 뒤에 c11 을
--   그대로 이어 쓴 것과 같은 판단이다.
--
-- ■ 왜 `class_name` 한 칸이 아니라 표 둘인가 (설계 §3)
--   시즌(교재 1권, 약 2달)마다 반이 재편된다. `learners.class_name text` 한 칸이면 재편되는 날
--   과거 행과 계보가 끊긴다 — `corrections` 에 이름 문자열 대신 `staff_id` 를 적기로 한 것과
--   같은 이유다. 그리고 `staff_classes` 가 없으면 「자기 반」이라는 말이 정의되지 않아 **모든
--   강사가 전교생 큐를 본다** — 유호님 지시의 정반대다.
--
-- ■ 왜 PK 가 `class_key` 가 아닌가 — 그 키는 **시즌을 넘어 재사용된다**
--   `평일11A` 는 「평일 11시 A실」이라는 **좌표**이지 학생 무리의 정체성이 아니다. 다음 시즌 같은
--   슬롯에 다른 무리가 앉으면 같은 키에 다른 반이 온다. 그래서 `class_id`(정체성) ·
--   `class_key`(좌표) · `season_id`(언제) 셋을 나눈다. ⚠ 그래도 `class_key` 를 **버리지 않는다** —
--   시트와 원본을 대조하는 유일한 자연키이고, 없으면 다리가 어긋난 날 증상이 「조용함」뿐이다.
--
-- ■ 유일성을 제약이 아니라 **부분 인덱스 둘**로 거는 이유
--   `unique (class_key, season_id)` 하나로는 못 막는다 — Postgres 유일 제약은 NULL 을 서로 다른
--   값으로 보므로 `season_id is null`(아직 시즌이 없는 미개원 상태)에서 같은 키가 **몇 벌이든**
--   들어온다. 그 상태가 정확히 지금이라, 제약 하나로 두면 이 표는 태어나는 날부터 안 지켜진다.
--   그래서 시즌 안(`season_id is not null`)과 시즌 밖(`is null`)을 갈라 각각 건다.
--
-- ■ `active` 없이 만들지 않는다
--   지난 시즌 반은 지우는 게 아니라 닫는다 — 과거 행의 FK 가 살아야 한다. 그래서 삭제 경로를
--   기본(NO ACTION)으로 두어, 학생이 매달린 반은 **지우려 하면 DB 가 막는다**.
--
-- ■ 채우는 코드는 이 조각에 0줄이다 — 정직 표기
--   생산자 = `functions/roster-ingest`(시트 5열 `class_name` → `engine.classes` upsert →
--   `learners.class_id`)이고 이 조각과 **같은 커밋**에 선다. 「표가 섰다」를 「반이 돈다」로
--   읽지 않는다(엔진도달 §5 확인 ③).
--   ⚠ 아직 **없는 것**을 여기 적어 둔다: 시즌이 넘어갈 때 지난 시즌 반을 `active=false` 로
--     닫는 일감(시즌 롤오버)은 이 조각에도, 어디에도 없다. 첫 시즌이 끝나기 전에 서야 한다.
--
-- ■ 강사↔반 배정은 시트에 없다
--   「이 반을 누가 가르치나」가 운영 시트 어디에도 없다. 그건 원장 화면의 입력 칸 하나가 맞다 —
--   반 수가 한 자릿수~24라 사람이 눌러도 철학 ㉡ 위반이 아니다(**판단이 필요한 자리**다).
--   그래서 이 표는 물리만 세우고 채우는 통로는 §8-3 에서 선다.
--
-- 되돌림: alter table engine.learners drop column if exists class_id;
--        drop table if exists engine.staff_classes;
--        drop table if exists engine.classes;
--        delete from engine.schema_migrations where version = '20260812200000';

begin;

do $migration$
declare
  migration_version constant text := '20260812200000';
  migration_name constant text := '20260812200000_class_c11.sql';
  expected_checksum constant text := '01e6ba27c02fbcc305cb90642f3e1f9c06c1d5e87bc815d4e000ae590b65e2e4'; -- migration-checksum
  base_version constant text := '20260812180000';
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

  if to_regclass('engine.season') is null then
    raise exception
      'engine.season 이 없다 — 반은 시즌에 매달린다(20260812140000_season_c11 이 먼저 서야 한다)';
  end if;

  -- ① 반 — 정체성(class_id) · 좌표(class_key) · 언제(season_id)를 나눠 든다.
  --    `season_id` 가 null 인 행 = 「시즌 밖」이다. 미개원 지금이 그 상태이고, 첫 시즌이
  --    열리면 그 시즌의 반은 **새 행**으로 선다(같은 좌표라도 다른 무리다 · 위 머리말).
  create table if not exists engine.classes (
    class_id     uuid primary key default gen_random_uuid(),
    class_key    text not null constraint classes_key_nonblank_c11 check (btrim(class_key) <> ''),
    season_id    uuid references engine.season(season_id),
    display_name text,
    active       boolean not null default true,
    created_at   timestamptz not null default now(),
    schema_ver   text not null
  );

  -- 🔴 유일성 — 제약 하나로 못 건다(머리말 참고). 시즌 안과 밖을 갈라 각각 건다.
  --    이게 없으면 명부 스윕이 같은 반을 매 판 새로 만들고, 학생마다 다른 class_id 가 붙어
  --    「내 반」이 갈라진다 — 증상은 「강사 큐에 학생이 몇 명 없다」뿐이라 조용하다.
  create unique index if not exists classes_key_in_season
    on engine.classes (class_key, season_id) where season_id is not null;
  create unique index if not exists classes_key_no_season
    on engine.classes (class_key) where season_id is null;

  -- ② 학생이 어느 반인가 — **null 이 정상 상태**다.
  --    아직 반이 안 정해진 학생은 있고(등록은 했는데 배정 전), 그 학생도 앱은 써야 한다.
  --    `if not exists` 를 쓰지 않는 것은 위 이력 판정이 「이 판은 아직」을 이미 못박았기
  --    때문이다 — 칸이 이미 있다면 이력과 실물이 어긋난 상태이고 조용히 넘기지 않는다.
  --    삭제 경로는 기본(NO ACTION)이다: 학생이 매달린 반은 지우려 하면 DB 가 막는다.
  alter table engine.learners
    add column class_id uuid references engine.classes(class_id);

  -- ③ 강사↔반 — 「자기 반」의 정의. 이 표가 없으면 권한이 화면 규약이 되고, 화면 규약은
  --    서버가 안 지킨다. `staff_id` 는 감사가 사람을 가리키는 안정 키다(계정이 다시 서도 잇는다).
  create table if not exists engine.staff_classes (
    staff_id    uuid not null references engine.staff(staff_id),
    class_id    uuid not null references engine.classes(class_id),
    assigned_at timestamptz not null default now(),
    schema_ver  text not null,
    primary key (staff_id, class_id)
  );

  -- engine 취급 그대로 — RLS 켜고 정책 0(전면 거부) · service_role 만 쓰기 · PostgREST 비노출.
  -- 나중에 노출하는 날 잊어도 **닫힌 채로 실패한다**.
  alter table engine.classes       enable row level security;
  alter table engine.staff_classes enable row level security;

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
  ('staff_classes','staff_id'), ('staff_classes','class_id'), ('staff_classes','schema_ver')
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
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000) — 행이 사라지는 것만 막는다(개서는 촉진 세션의 정상 통로)
  ('season_compass_protect'),
  -- 회고(20260812170000) — 굳힌 근거 불변 + 학생 판정은 강사 「전」에만 + 삭제 금지.
  --   freeze 가 꺼지면 재계산한 숫자로 옛 판정을 덮어쓸 수 있고 그건 조용히 통과한다.
  ('season_review_freeze'), ('season_review_protect')
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
  -- ⚠ 상태::text 캐스트가 필수다. tgenabled 는 "char"(1바이트) 타입이라 || 후보가 갈려
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
  -- 🔑 14 → 16 (20260812200000): engine.classes · engine.staff_classes 둘이 섰다.
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 5 (20260812170000 이 4 에서 올렸다): 회고가 `season_review.learner_id` 에 restrict 를
  --    하나 더 건다. 이 조각은 이 수를 안 건드린다 — `learners.class_id` 는 learners 를
  --    «가리키는» 고리가 아니라 learners «에서 나가는» 고리라 confrelid 가 classes 다.
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
  (select count(*) from engine.skills) as 스킬시드수
)
select case when 테이블수=16 and RLS켜짐=16 and 정책수=7
              and 새는테이블권한=0 and 새는스키마권한=0 and 삭제차단=5 and 실패상태=1
              and 이력정책=0 and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
              and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
              and 검수판열=22 and 검수판원문=0 and 근거없는라벨=0 and 목록밖프로필=0
              and 겹친반좌표=0 and 반좌표유일=2
              and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
              and 라디오새는권한=0 and 라디오새는스키마=0 and 라디오kind제약=1
              and 연동보호트리거=1 and 연동활성유일=1 and 스킬시드수=30
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260812200000'
              and (select checksum from 현재이력)='01e6ba27c02fbcc305cb90642f3e1f9c06c1d5e87bc815d4e000ae590b65e2e4' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 16·16·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260812180000_learner_profile_c11.sql` «뒤»에만 선다(base_version).
--    그 앞의 c11 조각들이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 **+2**(`classes`·`staff_classes`) · RLS **+2** · 정책 0 · 트리거 0 · 열 +1(`learners.class_id`).
--    `삭제차단`(5)은 앞 조각 그대로다 — 이 조각의 고리는 learners 를 «가리키지» 않는다.
-- ② 새 칸 `겹친반좌표` = **0** · `반좌표유일` = **2**. 뒤엣것이 2 가 아니면 유일성이 물리가
--    아니고, 그러면 앞엣것의 0 은 「지켜졌다」가 아니라 「아직 안 겹쳤다」일 뿐이다.
--    두 칸을 함께 읽는다 — 하나만 보면 미설치와 준수가 같은 모양이다.
-- ③ 이 조각은 **행을 하나도 안 만든다**. `engine.classes` 는 명부 스윕(`roster-ingest`)이
--    시트 5열에서 채우고, `engine.staff_classes` 는 §8-3 원장 화면이 채운다 — 지금 둘 다 0행이
--    정상이다. 「표가 섰다」를 「반이 돈다」로 읽지 않는다.
-- ④ 🔴 아직 **없는 것** — 시즌 롤오버(지난 시즌 반을 `active=false` 로 닫기)는 어디에도 없다.
--    첫 시즌이 끝나기 전에 서야 하고, 안 서면 반 목록이 시즌마다 누적된다.
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 하나를 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--      📏 실측 2026-08-12: 이 조각을 짓다 정확히 그걸 밟았다(위 ⓪의 파일명이 잡혔다).
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
--         · submissions_translation_source_c11
