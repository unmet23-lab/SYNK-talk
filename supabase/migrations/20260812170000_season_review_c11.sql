/* 시즌 회고 ③④ — 사람이 판정한 것이 앉을 자리 + **굳힌 근거**
 *
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §3-2·§4·§5·§6 (유호님 확정 6건 · 2026-08-12).
 * ①②(`20260812140000_season_c11.sql`)가 왼쪽(나침반)을 세웠고, 이 조각이 오른쪽과 라벨을 세운다.
 *
 * 🔴 **③④는 한 커밋이다**(설계 §8 인수 조건) — 나누면 첫 회고 행이 **근거 없는 판정**이 된다.
 *   그래서 이 조각·통로·화면·회귀가 같은 커밋에 있다. 표만 먼저 파 두는 것을 ①② 조각이
 *   일부러 안 한 이유도 그것이다(자리가 있으면 「이미 있다」가 되어 나누는 문이 열린다).
 *
 * 🔴 **파일 이름의 `_c11` 은 장식이 아니다** — Edge Function 넷이 계약판을 최신 조각 이름에서
 *   읽는다(`tests/마이그레이션이름.test.js`). 이 조각은 **계약을 안 바꾼다**: 새 값목록 0 ·
 *   `learning_events` 0 · 새 `event_type` 0 · 기존 engine 표 변경 0.
 *   그래서 `radio_c10`·`season_c11` 선례대로 c11 을 이어 쓴다(판을 올리면 구앱이 426 이 된다).
 *
 * ■ 왜 근거를 «굳히나» — 창 30일이 판정을 배신한다 (설계 §4)
 *   `학습자상태.v6` 은 창 30일이고 시즌은 2달이다. 회고 시점에 그냥 조회하면 8축이 덮는 것은
 *   시즌의 **뒤 절반**뿐이고, 한 달 뒤 다시 조회하면 창이 밀려 **다른 숫자**가 나온다.
 *   「가까워졌다」고 적힌 행 옆에 나중에 조회한 숫자를 붙이면 그 숫자는 **그 판정을 낸 사람이
 *   본 적 없는 숫자**다 — 판정과 근거가 갈리면 판정이 근거를 잃는다.
 *   → `record_snapshot` 은 회고를 **연 그 순간**에 한 번 쓰이고 그 뒤로 **절대 안 바뀐다**
 *     (아래 `season_review_freeze` 트리거가 물리로 막는다).
 *
 * ■ 왜 라벨과 근거가 «같은 행»인가 (설계 §7)
 *   성향 8축은 「지금 어떤가」만 알고 **부호(sign)를 모른다** — 「그게 이 학생에게 좋은
 *   방향이었나」를 아는 것은 사람뿐이고, 사람이 그걸 말하는 자리는 회고 하나뿐이다.
 *   특징(`record_snapshot`)과 라벨(`verdict`)이 갈라져 있으면 나중에 짝을 못 맞추고
 *   (창이 밀리므로 **원리상** 못 맞춘다), 그러면 이 그릇은 예쁜 화면으로 끝나고
 *   엔진에는 한 방울도 안 닿는다. 그게 이 설계의 실패 모드다.
 *
 * ■ 판정이 «3갈래»인 이유 (설계 §5)
 *   2갈래면 목적 변경이 「멀어짐」으로 접히고 엔진이 **「학생이 목적을 바꾸는 것 = 나쁜 신호」**
 *   를 배운다 — 철학 Ⅱ-4(목적 변경은 정상 경로)를 정면으로 뒤집는 학습이 조용히 일어난다.
 *
 * ■ 판정칸이 «둘»인 이유 — 학생 먼저, 강사 다음 (설계 §7 도전안 · ✅유호님 채택 08-12)
 *   강사만 판정하면 회고는 성적표가 되고, 학생만 판정하면 근거가 없다. **둘이 갈리는 행이
 *   가장 값진 신호**다(`자기인식축`의 유일한 대조군).
 *   🔴 순서가 규격이다 — 강사 판정을 보고 학생이 고르면 그 칸은 대조군이 아니라 **메아리**가
 *      된다. 화면 순서로만 두면 언젠가 갈리므로 **DB 가 막는다**: `verdict` 가 이미 있는 행에
 *      `verdict_by_self` 를 새로 쓰거나 고치는 것을 트리거가 거절한다.
 *   🔑 `verdict_by_self` 는 **null 허용**이다 — 학생이 안 눌러도 강사 판정은 진행된다
 *      (필수로 걸면 한 명이 안 눌러 그 시즌 라벨이 통째로 안 생기고, **회고는 밀리는 순간
 *      라벨 0**이다). 그리고 null(안 눌렀다)과 「눌렀는데 강사와 같다」는 **다른 값**이다.
 *
 * ■ 개서·삭제 판정 — ①② 조각이 이 조각의 몫으로 남긴 자리
 *   ① `record_snapshot`·`learner_id`·`season_id`·`opened_at` = **불변**(위 §4).
 *   ② `verdict_by_self` = 강사 판정 «전»에만 쓴다(위 메아리).
 *   ③ `verdict`·`note` = **개서 허용**. 강사가 버튼을 잘못 눌렀을 때 남는 통로가 「행을 지우고
 *      다시 넣기」밖에 없으면 그 우회가 정상 통로가 된다(F103). 삭제는 막으므로 그 우회는
 *      애초에 없다 — 그래서 고치는 문을 열어 둔다. 고친 사실은 `decided_at` 이 갱신되고
 *      `staff_access_log` 에 매번 한 줄 남는다.
 *   ④ 삭제 = 전면 금지(나침반과 같다 — 라벨은 사람 손에서만 나오므로 소급이 안 된다).
 *
 * ■ 채우는 코드는 이 조각에 0줄이다 — 정직 표기
 *   생산자 = `functions/teach` 의 `retro/*` 세 경로이고 이 조각과 **같은 커밋**에 선다.
 *   「표가 섰다」를 「라벨이 쌓인다」로 읽지 않는다(엔진도달 §5 확인 ③).
 *   ⑤라벨→엔진 배선은 **시즌 2 이후**다(설계 §8) — 행이 몇 개 쌓인 뒤에 한다.
 *
 * 되돌림: drop table if exists engine.season_review;
 *        delete from engine.schema_migrations where version = '20260812170000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260812170000';
  migration_name constant text := '20260812170000_season_review_c11.sql';
  expected_checksum constant text := '36472be667bfecc8f02b4964b84839509ecc167ac90acede34a4eff5fa72b0ff'; -- migration-checksum
  base_version constant text := '20260812140000';
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

  /* 시즌 «끝»에 사람이 판정한 것 + 그 판정이 본 근거. 학생×시즌 1행.
   *
   * `record_snapshot` = `axes_전반`·`axes_후반`·`season_totals` 세 층 + `추정판` + 창 경계
   *   (설계 §4-1·§4-2 · 조립은 `lib/회고.js` 하나가 진다).
   *   🔑 not null 이다 — 「근거 없이 먼저 판정만 적어 두기」를 원리상 못 하게 한다.
   * `opened_by`/`decided_by` 는 **text** 다(uuid 아님). 나침반 `recorded_by` 와 같은 사유 —
   *   v1 의 통로는 강사뿐이라 값은 `staff_id` 문자열이고, 학생 본인 통로가 서는 날 'self' 가
   *   같은 칸에 들어온다(그날 열을 새로 파면 옛 행과 새 행이 다른 칸을 쓰게 된다).
   * ⚠ `verdict_by_self` 에 「누가·언제」를 안 둔다 — v1 은 촉진 세션 한 화면에서 학생이
   *   그 자리에 누르는 것이라 주체가 학생 본인 하나뿐이고, 시각은 `opened_at`~`decided_at`
   *   사이로 이미 좁다. 통로가 갈리는 날(학생 앱에서 따로 누르는 날) 열을 더한다. */
  create table if not exists engine.season_review (
    review_id       bigint generated always as identity primary key,
    learner_id      uuid not null references engine.learners(learner_id) on delete restrict,
    season_id       uuid not null references engine.season(season_id),
    record_snapshot jsonb not null,
    verdict         text,                    -- null = 아직 강사가 안 눌렀다
    verdict_by_self text,                    -- null = 학생이 안 눌렀다(건너뛰어도 진행한다)
    note            text,
    opened_by       text not null,
    opened_at       timestamptz not null default now(),
    decided_by      text,
    decided_at      timestamptz,
    schema_ver      text not null,
    constraint season_review_once_c11 unique (learner_id, season_id),
    /* 🔴 세 값의 정본은 `lib/회고.js` 의 `판정목록` 이다. 두 층이 같은 파일을 못 쓰므로
     *   (하나는 JS·하나는 DDL) 사본을 피할 수 없고, 없앨 수 없는 사본은 기계에 물린다 —
     *   `tests/회고.test.js` 가 이 CHECK 의 리터럴과 lib 을 대조한다. */
    constraint season_review_verdict_c11
      check (verdict is null or verdict in ('closer', 'same', 'redirected')),
    constraint season_review_self_c11
      check (verdict_by_self is null or verdict_by_self in ('closer', 'same', 'redirected')),
    /* 판정·사유·주체·시각은 **한 벌로** 선다. 갈라 두면 「판정은 있는데 언제 누가 했는지
     *   모르는 행」이 서고, 그 행은 라벨로 못 쓴다(오염을 가려낼 방법이 없다). */
    constraint season_review_decided_c11 check (
      (verdict is null and note is null and decided_by is null and decided_at is null)
      or (verdict is not null and decided_by is not null and decided_at is not null
          and note is not null and btrim(note) <> '')
    )
  );
  comment on table engine.season_review is
    '시즌 회고 — 사람이 판정한 라벨 + 그 판정이 본 근거를 굳힌 것(시즌회고_설계 §3-2·§4). 엔진의 유일한 「부호」 생산자. record_snapshot 은 연 순간 고정(🚫재계산).';
  create index if not exists season_review_season_decided
    on engine.season_review (season_id, decided_at);

  /* 🔴 **굳힌 것은 안 바뀐다** — 이 트리거가 없으면 위 §4 의 보장이 프로즈로만 남는다.
   *   프로즈보다 기계 강제로 막을 수 있는 규칙은 기계로 옮긴다.
   *   🔑 `verdict_by_self` 를 **강사 판정 뒤에** 못 쓰게 하는 것도 여기다 — 화면 순서로만
   *     두면 통로가 하나 더 서는 날 조용히 갈리고, 갈린 쪽은 「값이 있다」로 보인다. */
  create or replace function engine.season_review_freeze() returns trigger
    language plpgsql as $freeze$
  begin
    if new.record_snapshot is distinct from old.record_snapshot then
      raise exception '굳힌 근거는 바뀌지 않는다 — 판정과 근거가 갈리면 판정이 근거를 잃는다(시즌회고_설계 §4)';
    end if;
    if new.learner_id is distinct from old.learner_id
       or new.season_id is distinct from old.season_id
       or new.opened_at is distinct from old.opened_at
       or new.opened_by is distinct from old.opened_by then
      raise exception '회고 행의 대상·연 시각은 바뀌지 않는다 — 굳힌 근거가 다른 시즌의 것이 된다';
    end if;
    if old.verdict is not null and new.verdict_by_self is distinct from old.verdict_by_self then
      raise exception '학생 판정은 강사 판정 «전»에만 적는다 — 뒤에 적으면 대조군이 아니라 메아리다(시즌회고_설계 §7)';
    end if;
    return new;
  end
  $freeze$;

  drop trigger if exists season_review_freeze on engine.season_review;
  create trigger season_review_freeze
    before update on engine.season_review
    for each row execute function engine.season_review_freeze();

  /* 삭제 금지 — 나침반과 같다. 라벨은 사람 손에서만 나오므로 사라지면 소급이 안 된다.
   * ⚠ 개서를 «같이» 막지 않는 이유는 머리말 ③ 참조(막으면 우회가 정상 통로가 된다 · F103). */
  create or replace function engine.season_review_protect() returns trigger
    language plpgsql as $protect$
  begin
    raise exception '회고 행은 삭제하지 않는다 — 사람이 낸 라벨은 소급이 안 된다(시즌회고_설계 §7)';
  end
  $protect$;

  drop trigger if exists season_review_protect on engine.season_review;
  create trigger season_review_protect
    before delete on engine.season_review
    for each row execute function engine.season_review_protect();

  /* engine 취급 그대로 — RLS 켜고 정책 0(전면 거부) · service_role 만 쓰기 · PostgREST 비노출. */
  alter table engine.season_review enable row level security;

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
  ('season_review','decided_by'), ('season_review','decided_at')
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
  ('season_review_learner_id_fkey'), ('season_review_season_id_fkey')
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
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 4 → **5**: 회고가 `season_review.learner_id` 에 restrict 를 하나 더 건다.
  --    학생 행이 지워지면 그 학생의 라벨까지 사라지는데, 사람이 낸 라벨은 소급이 안 된다.
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
select case when 테이블수=14 and RLS켜짐=14 and 정책수=7
              and 새는테이블권한=0 and 새는스키마권한=0 and 삭제차단=5 and 실패상태=1
              and 이력정책=0 and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
              and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
              and 검수판열=22 and 검수판원문=0 and 근거없는라벨=0
              and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
              and 라디오새는권한=0 and 라디오새는스키마=0 and 라디오kind제약=1
              and 연동보호트리거=1 and 연동활성유일=1 and 스킬시드수=30
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260812170000'
              and (select checksum from 현재이력)='36472be667bfecc8f02b4964b84839509ecc167ac90acede34a4eff5fa72b0ff' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 14·14·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·6·6·0·0·0·1·1·1·30 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260812140000_season_c11.sql` «뒤»에만 선다(base_version).
--    그 조각과 c11 두 조각이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 1 · RLS 1 · 정책 0 — `테이블수`·`RLS켜짐` 이 13 → **14** 로 오른다.
--    정책은 안 늘린다: engine 취급 그대로 전면 거부이고, 쓰기는 `functions/teach` 하나를 지난다.
-- ② `삭제차단` 이 4 → **5** 다 — `season_review.learner_id` 의 restrict 하나가 늘었다.
-- ③ 트리거 둘이 늘었다 — `season_review_freeze`(굳힌 근거 불변 + 학생 판정 순서)와
--    `season_review_protect`(삭제 금지). **켜짐**까지 센다(꺼진 트리거는 행이 그대로 남는다).
-- ④ 첫 회고는 나침반 행이 있어야 열린다 — 통로가 그 학생의 «나침반이 있는데 회고가 아직
--    확정 안 된 가장 오래된 시즌»을 고른다. 없으면 409 `RETRO_NOT_DUE` 로 정직하게 멈춘다.
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 셋을 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    기대: broadcast_segment_kind_c11 · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11
