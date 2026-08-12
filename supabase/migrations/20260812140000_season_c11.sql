/* 시즌 그릇 ①② — 나침반 답이 앉을 자리 + 시즌 경계
 *
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §3-1·§8·§9-0 (유호님 확정 6건 · 2026-08-12).
 * 이 조각이 세우는 것은 **구현 순서 ①②뿐**이다 — ③회고 화면·④`record_snapshot` 굳히기는
 * 「첫 시즌 종료 전」이고 **한 커밋**으로 서야 한다(설계 §8 · 나누면 첫 회고 행이 근거 없는
 * 판정이 된다). 그래서 `engine.season_review` 는 **여기서 안 만든다** — 자리를 미리 파 두면
 * 그 표가 빈 채로 「이미 있다」가 되어 ③④를 나누는 문이 열린다.
 *
 * 🔴 **파일 이름의 `_c11` 은 장식이 아니다** — Edge Function 넷이 계약판을 최신 조각 이름에서
 *   읽는다(`tests/마이그레이션이름.test.js`). 이 조각은 **계약을 안 바꾼다**: 새 값목록 0 ·
 *   `learning_events` 0 · 새 `event_type` 0 · 기존 engine 표 변경 0(FK 하나만 읽기로 건다).
 *   그래서 `radio_c10` 선례대로 c11 을 그대로 이어 쓴다(판을 올리면 그 순간 구앱이 426 이 된다).
 *
 * ■ 왜 지금인가 — **소급 불가** (설계 §2)
 *   회고는 「그때 학생이 스스로 뭐라고 말했나」와 「그 뒤 실기록」을 나란히 놓는 일이다.
 *   오른쪽은 사건이 쌓이면 다시 계산되지만 **왼쪽은 그날 안 물으면 영원히 빈칸**이다.
 *   🔴 시한은 개원일이 아니라 **첫 학생의 «입학일»** 이다 — 대외로 이미 「입학할 때, 그리고
 *      시즌마다 나침반 세션을 엽니다」로 약속 중이다(상담AI FAQ Q11 `확정: true`).
 *   📏 실측 2026-08-12: 두 저장소에 `compass`·`season` 구현 **0건**(약속문만 살아 있었다).
 *
 * ■ 왜 표가 «둘»인가 — 합치면 이 설계가 고발한 병이 된다 (설계 §3)
 *   시즌 «시작»에 학생이 선언한 것과 시즌 «끝»에 사람이 판정한 것은 시점·기록자·소급 성질이
 *   전부 다르다. 한 행에 두면 시작에 만든 행을 끝에 **덮어쓰게** 되고, 그게 정확히
 *   `learners.goal_track` 이 죽은 방식이다. 표를 가르는 것은 비용이 아니라 **덮어쓰기를
 *   원리상 못 하게 하는 장치**다.
 *   🔑 급소 낱말은 「갱신」이다 — 대외 문장의 「시즌마다 갱신됩니다」를 구현 규격으로 그대로
 *      옮기면 덮어쓰기가 된다. 규격 = **보이는 것은 최신 한 장, 남는 것은 전부**(시즌마다 새 행).
 *
 * ■ 시즌 경계의 정본은 달력이 아니라 **교재 1권**이다 (유호님 08-12 · 설계 §9-0)
 *   「교재 1권당 2달 걸리니 2달에 한 번씩 돌아보며 점검한다」 — 「2달」은 근사값이고 정본은
 *   교재다. 교재가 한 주 늦게 끝나면 시즌도 늦게 끝나야 한다.
 *   🚫 **코드에 시즌 주기 상수를 박지 않는다.** 확정값 2달은 `season` 행의 데이터이지 코드
 *      상수가 아니다 — 운영이 한 시즌을 늘리는 날 배포가 필요하면 그 설계가 진 것이다.
 *   🚫 달력으로 시즌 자동 생성.
 *
 * ■ 채우는 코드는 이 조각에 0줄이다 — 정직 표기
 *   생산자 = `functions/teach` 의 `compass/*` 두 경로이고 이 조각과 **같은 커밋**에 선다.
 *   「표가 섰다」를 「수집이 돈다」로 읽지 않는다(엔진도달 §5 확인 ③).
 *
 * 되돌림: drop table if exists engine.season_compass;
 *        drop table if exists engine.season;
 *        delete from engine.schema_migrations where version = '20260812140000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260812140000';
  migration_name constant text := '20260812140000_season_c11.sql';
  expected_checksum constant text := '2582bafc74dbe5e1337b4f2e8f6bf0ddf8f41ce0c3abf20e47cd9474143aac52'; -- migration-checksum
  base_version constant text := '20260812130000';
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

  /* ① 시즌 경계 — **날짜 범위를 가진 행**. 주기는 데이터이지 상수가 아니다(§9-0).
   *
   * `ends_on is null` = 아직 안 끝난 시즌이다. 「교재를 아직 안 뗐다」가 정상 상태라
   *   미리 끝을 박지 않는다 — 박아 두면 교재가 늦어지는 날 운영이 DDL 을 고치게 된다.
   * `textbook` 이 이 표의 심장이다 — 시즌의 정의가 교재이므로, 그 칸이 비면 이 행은
   *   「달력으로 만든 시즌」이라는 뜻이 된다(그래서 not null). */
  create table if not exists engine.season (
    season_id  uuid primary key default gen_random_uuid(),
    code       text unique not null,          -- 사람이 부르는 이름표('2027-S1') — 비밀 아님
    textbook   text not null,                 -- 교재 1권 = 시즌의 정본 단위(§9-0)
    starts_on  date not null,
    ends_on    date,                          -- null = 진행 중(교재를 아직 안 뗐다)
    schema_ver text not null,
    constraint season_dates_c11 check (ends_on is null or ends_on >= starts_on),
    /* 🔑 겹침을 **물리로** 막는다 — 안 막으면 「오늘이 속한 시즌」 조회가 여러 행을 물고,
     *   그때 나침반 행이 어느 시즌에 붙는지가 조회 순서에 달린다(조용히 틀리는 자리다).
     *   범위형 gist 는 확장 없이 돈다(btree_gist 불필요 — 동등 열을 섞지 않았다). */
    constraint season_no_overlap_c11
      exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
  );
  comment on table engine.season is
    '시즌 경계 — 정본은 달력이 아니라 교재 1권(시즌회고_설계 §9-0 · 유호님 확정 2026-08-12). 주기는 이 행의 데이터이지 코드 상수가 아니다.';

  /* ② 나침반 — 시즌 «시작»에 학생이 선언한 것. 학생×시즌 1행.
   *
   * `answers` 는 문항키→서술의 jsonb 다. **키는 코드값**이고 화면 글자는 라벨이라
   *   문구를 다듬어도 쌓인 답이 안 흔들린다(`lib/나침반문항.js` · 가입문항 규약 승계).
   * `self_in_5y_changed` 는 시즌 회차의 [그대로]/[바꿀래]다 — `redirected` 판정의 **직접**
   *   근거. 값이 「그대로」여도 답을 복사해 담으므로(행마다 자족), 「안 바꿨다」를 값 비교로
   *   추측하지 않는다. `null` = 안 물었다(입학 행).
   * `goal_track_at_open` 은 그날의 3값 목적이다. `goal_snapshot` 으로 못 대신한다 —
   *   그 칸은 사건에 붙으므로 나침반 날 그 학생의 사건이 0이면 그날의 목적을 가리키는 행이
   *   아예 없다(신입이 특히 그렇다).
   *   ⚠ CHECK 를 **안 건다**: `learners.goal_track` 에도 없다(c6 실측). 여기만 걸면 계약이
   *     4번째 값을 내는 날 이 표만 거절해 통로가 조용히 죽는다 — 어휘 정본은 계약 JSON 이다.
   * `recorded_by` 는 **누가 적었나**다. 나침반은 강사가 촉진하는 세션이라 대필이 정상
   *   경로다(설계 §3-1). v1 의 유일한 통로는 강사이므로 값은 `staff_id` 문자열이고,
   *   학생 본인 통로가 서는 날 `'self'` 가 같은 칸에 들어온다 — 그래서 uuid 가 아니라 text 다
   *   (그날 열을 새로 파면 옛 행과 새 행이 다른 칸을 쓰게 된다). */
  create table if not exists engine.season_compass (
    compass_id         bigint generated always as identity primary key,
    learner_id         uuid not null references engine.learners(learner_id) on delete restrict,
    season_id          uuid not null references engine.season(season_id),
    answers            jsonb not null,
    self_in_5y_changed boolean,               -- null = 안 물었다(입학 행)
    goal_track_at_open text,
    recorded_by        text not null,         -- staff_id (대필) · 뒤에 'self'
    recorded_at        timestamptz not null default now(),
    schema_ver         text not null,
    constraint season_compass_once_c11 unique (learner_id, season_id),
    /* 🔴 **문항 묶음을 DB 가 지킨다**(c6 §10 「문서에만 있던 불변을 DB 가 지킨다」 축).
     *   두 회차의 키 집합이 정확히 이 둘 중 하나여야 한다 — 안 걸면 오타 키(`why_learn`)가
     *   그대로 앉고, 병치 쿼리는 그 학생만 빈칸으로 그린다. 실패가 「데이터가 없다」의
     *   얼굴로 오는 자리다.
     *   🔑 `?&`(전부 있나) + `-`(남는 키 0)로 **정확히 그 집합**을 못박는다. CHECK 안에는
     *     서브쿼리를 못 쓰므로 `jsonb_object_keys` 로 세는 판은 애초에 못 쓴다.
     *   🔑 `self_in_5y_changed` 의 null 여부가 회차를 가른다 — 회차를 따로 열로 두면 같은
     *     판정이 두 칸에 앉아 갈린다(가드 맹점 ④ · 목록은 하나에서 파생시킨다). */
    constraint season_compass_answers_c11 check (
      (
        self_in_5y_changed is null
        and answers ?& array['why_learning', 'self_in_5y', 'topik_use', 'season_goal']
        and answers - array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] = '{}'::jsonb
      ) or (
        self_in_5y_changed is not null
        and answers ?& array['self_in_5y', 'season_goal']
        and answers - array['self_in_5y', 'season_goal'] = '{}'::jsonb
      )
    )
  );
  comment on table engine.season_compass is
    '나침반 — 시즌 시작에 학생이 스스로 선언한 것(시즌회고_설계 §3-1). 회고가 병치할 왼쪽이자 유일한 소급 불가 재료. 시즌마다 새 행(🚫덮어쓰기).';
  create index if not exists season_compass_learner_recorded
    on engine.season_compass (learner_id, recorded_at desc);

  /* 🔴 삭제만 막는다 — **개서는 막지 않는다.**
   *   막아야 할 것은 「지난 시즌 답이 이번 시즌 저장에 덮여 사라지는 것」인데, 그건
   *   `(learner_id, season_id)` 유일키가 이미 원리상 막는다(다른 시즌 = 다른 행).
   *   남은 위험은 **행이 통째로 사라지는 것**이고 그건 소급이 안 된다 — 그래서 delete 만.
   *   ⚠ update 를 같이 막으면 강사가 촉진 세션 «그 자리»에서 오타를 못 고친다. 그때 남는
   *     통로는 「행을 지우고 다시 넣기」인데 그것이 곧 delete 라, 막는 순간 우회가 정상
   *     통로가 된다(F103 축 — 따를 수 없는 처방은 우회를 정상 통로로 만든다).
   *   ⏭ 확정 시각을 따로 두어 「확정 뒤 개서 금지」로 좁히는 판은 ③회고 조각의 몫이다
   *     (지금 파 두면 ③④를 나누는 문이 열린다 · 위 머리말). */
  create or replace function engine.season_compass_protect() returns trigger
    language plpgsql as $protect$
  begin
    raise exception '나침반 행은 삭제하지 않는다 — 소급이 원리상 불가능하다(시즌회고_설계 §2)';
  end
  $protect$;

  drop trigger if exists season_compass_protect on engine.season_compass;
  create trigger season_compass_protect
    before delete on engine.season_compass
    for each row execute function engine.season_compass_protect();

  /* engine 취급 그대로 — RLS 켜고 정책 0(전면 거부) · service_role 만 쓰기 · PostgREST 비노출.
   * 나중에 노출하는 날 잊어도 **닫힌 채로 실패한다**. */
  alter table engine.season          enable row level security;
  alter table engine.season_compass  enable row level security;

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
  ('season_compass','goal_track_at_open'), ('season_compass','recorded_by')
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
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000) — 행이 사라지는 것만 막는다(개서는 촉진 세션의 정상 통로)
  ('season_compass_protect')
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
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 3 → **4**: 시즌 그릇이 `season_compass.learner_id` 에 restrict 를 하나 더 건다.
  --    학생 행이 지워지면 그 학생의 나침반이 함께 사라지는데, 그건 소급이 안 된다.
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
select case when 테이블수=13 and RLS켜짐=13 and 정책수=7
              and 새는테이블권한=0 and 새는스키마권한=0 and 삭제차단=4 and 실패상태=1
              and 이력정책=0 and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
              and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
              and 검수판열=22 and 검수판원문=0
              and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
              and 라디오새는권한=0 and 라디오새는스키마=0 and 라디오kind제약=1
              and 연동보호트리거=1 and 연동활성유일=1 and 스킬시드수=30
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260812140000'
              and (select checksum from 현재이력)='2582bafc74dbe5e1337b4f2e8f6bf0ddf8f41ce0c3abf20e47cd9474143aac52' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 13·13·7·0·0·4·1·0·0·1·0·0·0·0·22·0·6·6·0·0·0·1·1·1·30 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 c11 두 조각(20260812120000·20260812130000) «뒤»에만 선다.
--    그 둘은 지금 유호님 승인 대기라, 이 조각도 같은 승인에 얹혀 한 번에 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 2 · RLS 2 · 정책 0 — 위 판정 블록의 `테이블수`·`RLS켜짐` 이 11 → **13** 으로 오른다.
--    정책은 안 늘린다: engine 취급 그대로 전면 거부이고, 쓰기는 `functions/teach` 하나를 지난다.
-- ② `삭제차단` 이 3 → **4** 다 — `season_compass.learner_id` 의 restrict 하나가 늘었다.
--    학생 행이 지워지면 그 학생의 나침반이 함께 사라지는데 **그건 소급이 안 된다.**
-- ③ 첫 시즌 행은 **운영이 손으로 연다**(교재 1권 단위 · 🚫 달력 자동 생성):
--      insert into engine.season(code, textbook, starts_on, schema_ver)
--      values ('2027-S1', '<교재 이름>', '2027-02-25', 'c11');
--    ⚠ `ends_on` 은 교재를 뗀 날 채운다 — 미리 박으면 늦어지는 날 DDL 을 고치게 된다.
--    ⚠ 이 행이 없으면 나침반 통로가 `SEASON_NOT_OPEN`(409) 으로 정직하게 멈춘다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 둘을 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    기대: broadcast_segment_kind_c11 · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11
