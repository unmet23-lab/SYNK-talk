/* 가입 1회 문항 세 칸의 값목록을 **DB 로 내린다** — 코드에만 살아 있던 규칙의 마지막 구멍
 *
 * 정본 = `lib/가입문항.js`(값목록) · L0 §9-2 `learners` 줄 · appsscript 메모리
 *        `collection-axes-recheck-0812`(유호님 지시 2026-08-12 「지역별 출신 칸 … 앞으로도
 *        이런 방향으로 디테일하게 단단하게」).
 *
 * ■ 무엇이 열려 있었나 (2026-08-12 실측)
 *   `learners.home_aimag`·`gender`·`goal_track` 은 c6(`20260806150000`)에서 **`text` 로만** 섰다.
 *   값목록은 `lib/가입문항.js` 한 곳에 있고, 그 파일 머리말이 자유 입력을 이렇게 금지한다:
 *       「같은 아이막이 열 가지 표기로 쌓이면 이 칸의 존재 이유(「지역 억양 편차의 유일한
 *         축」)가 그 자리에서 죽는다」
 *   그런데 그 금지가 **앱 화면에만** 살아 있었다. 앱이 아닌 통로 — SQL 콘솔·리허설 도구·
 *   명부 적재·앞으로 설 다른 클라이언트 — 로 들어오는 값은 아무도 안 막는다. `text` 는
 *   'ulaanbaatar' 도 'Ulaanbaatar' 도 'УБ' 도 'ub' 도 똑같이 받는다.
 *   🔴 **섞이면 소급 복원이 안 된다** — 어느 표기가 어느 아이막이었는지는 나중에 아무도
 *   못 정한다(사람이 손으로 매핑하는 순간 그건 복원이 아니라 추정이다).
 *
 * ■ 왜 CHECK 인가 — 프로즈로 막을 수 있는 규칙은 기계로 옮긴다
 *   화면 검사(`답검사`)는 **그 화면을 지나는 값만** 본다. 이 칸들이 지켜야 할 것은 「학생이
 *   무엇을 눌렀나」가 아니라 「이 열에 무엇이 앉는가」라, 지키는 자리도 열이어야 맞다.
 *   화면 검사를 없애는 것이 아니라 **밑에 한 겹 더** 까는 것이다(앱은 어느 칸이 틀렸는지
 *   말해 줘야 하고, DB 는 그게 뚫려도 안 앉게 해야 한다).
 *
 * ■ 왜 null 을 허용하나 — null 은 값이 아니라 **뜻**이다
 *   ① c6 이전 등록분과 명부 적재분은 세 칸이 영원히 null 이다. not null 로 걸면 이 판이
 *      그 행들 때문에 아예 적용되지 않는다(적용 안 된 판은 아무것도 안 지킨다).
 *   ② null = 「안 물어봤다」다. 「물었는데 안 밝혔다」는 `gender` 의 `undisclosed` 가 따로
 *      든다 — 가입문항 머리말이 그 둘을 일부러 가른 자리라, 여기서 접으면 그 판단이 죽는다.
 *
 * ■ 값목록이 두 곳에 적히는 대가와 그 처방
 *   정본은 `lib/가입문항.js` **하나**다. 이 파일은 그 사본이고, 사본은 갈라진다 — 갈라지는
 *   방향은 언제나 「통과」다(코드는 새 아이막을 알고 DB 는 모르면, 그 학생의 가입만 조용히
 *   거절된다). 그래서 회귀 `tests/가입문항.test.js` 가 **이 파일을 읽어** 세 목록을 글자
 *   단위로 대조한다. 한쪽만 고치면 CI 가 빨개진다(L0스키마 회귀가 계약 JSON ↔ DDL 에 쓰는
 *   것과 같은 형태 — 「목록은 하나에서 파생시키거나, 갈라지면 빨개지게 만든다」).
 *
 * ■ 계약을 안 바꾼다 — 그래서 `_c11` 을 이어 쓴다
 *   새 값목록 0 · 새 열 0 · 새 표 0 · `learning_events` 0. **이미 있는 값목록을 물리로
 *   내리는 것**뿐이라 앱이 보내는 것도 받는 것도 한 글자도 안 바뀐다. 판을 올리면 구앱이
 *   426 이 된다(`radio_c10`·`season_c11` 선례와 같은 판단).
 *
 * 되돌림: alter table engine.learners
 *           drop constraint if exists learners_home_aimag_c11,
 *           drop constraint if exists learners_gender_c11,
 *           drop constraint if exists learners_goal_track_c11;
 *        delete from engine.schema_migrations where version = '20260812180000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260812180000';
  migration_name constant text := '20260812180000_learner_profile_c11.sql';
  expected_checksum constant text := '049957bcecd4d42b63f9301e880e7c7bccad7dc711b6ae368c2b27ac140b0b06'; -- migration-checksum
  base_version constant text := '20260812170000';
  recorded_checksum text;
  어긋난행 text;
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

  /* 🔴 **먼저 이미 앉아 있는 값을 본다.** CHECK 는 목록 밖 행이 하나라도 있으면 판 전체를
   *   중단시키는데, 그때 postgres 가 주는 말은 「제약 위반」뿐이라 **어느 학생의 어느 칸이
   *   무슨 값인지**를 안 알려준다. 그 상태에서 할 수 있는 일은 손으로 찾는 것뿐이고, 그건
   *   운영에서 유호님 앞이 막히는 자리다. 그래서 우리가 먼저 세어 이름을 대고 멈춘다.
   *   ⚠ 정정 SQL 을 여기서 자동으로 돌리지 않는다 — 목록 밖 표기를 어느 아이막으로 옮길지는
   *     **추정**이고, 추정으로 원본을 덮으면 그 학생의 값은 영원히 복원 불가가 된다. */
  select string_agg(format('%s=%L', 칸, 값), ', ' order by 칸, 값) into 어긋난행
    from (
      select 'home_aimag' as 칸, home_aimag as 값 from engine.learners
       where home_aimag is not null and home_aimag not in (
         'ulaanbaatar', 'arkhangai', 'bayan-olgii', 'bayankhongor', 'bulgan', 'darkhan-uul',
         'dornod', 'dornogovi', 'dundgovi', 'govi-altai', 'govisumber', 'khentii',
         'khovd', 'khovsgol', 'omnogovi', 'orkhon', 'ovorkhangai', 'selenge',
         'sukhbaatar', 'tov', 'uvs', 'zavkhan')
      union all
      select 'gender', gender from engine.learners
       where gender is not null and gender not in ('female', 'male', 'undisclosed')
      union all
      select 'goal_track', goal_track from engine.learners
       where goal_track is not null and goal_track not in ('study', 'work', 'culture')
    ) 밖;

  if 어긋난행 is not null then
    raise exception
      '목록 밖 값이 이미 앉아 있다: % — 무엇으로 옮길지는 추정이라 이 판이 대신 정하지 않는다(사람이 정한 뒤 다시 부어라)',
      어긋난행;
  end if;

  /* 아이막 22 = 21 아이막 + 울란바토르. 정본 = `lib/가입문항.js` `아이막`.
   * 🔑 묻는 것은 **「성장한 곳」**이지 지금 사는 곳이 아니다 — 억양이 굳는 자리라 그렇다.
   *   그래서 이 칸은 이사로 바뀌지 않고, 스냅샷이 아니라 `learners` 열로 서는 것이 맞다
   *   (`goal_track` 이 `goal_snapshot` 을 따로 필요로 한 것과 다른 성질이다). */
  /* ⚠ `drop constraint if exists` 로 열지 않는다 — 두 이유가 겹친다.
   *   ① 살아 있는 표에서 잠깐 제약이 없는 창이 생긴다(그 창에 들어온 값은 아무도 안 막는다).
   *   ② `tests/L0스키마.test.js` 는 「뒤 조각이 drop 한 이름은 최종 상태에 없다」로 세므로,
   *      drop 을 적으면 방금 세운 제약이 **없는 것으로 세어져** 회귀가 빨개진다(실측 08-12).
   *   재실행 안전은 위 checksum 조기 반환 + 아래 존재 검사 두 겹으로 든다. */
  if not exists (select 1 from pg_constraint
                  where connamespace = to_regnamespace('engine')
                    and conname = 'learners_home_aimag_c11') then
    alter table engine.learners add constraint learners_home_aimag_c11
      check (home_aimag is null or home_aimag in (
        'ulaanbaatar', 'arkhangai', 'bayan-olgii', 'bayankhongor', 'bulgan', 'darkhan-uul',
        'dornod', 'dornogovi', 'dundgovi', 'govi-altai', 'govisumber', 'khentii',
        'khovd', 'khovsgol', 'omnogovi', 'orkhon', 'ovorkhangai', 'selenge',
        'sukhbaatar', 'tov', 'uvs', 'zavkhan'));
  end if;

  /* 성별 — **분포 점검 전용**이고 학습 라벨이 아니다(L0 §9-2). 「이 엔진이 남학생 목소리에만
   * 강한가」를 묻는 계기판이라, `undisclosed` 가 한 무리로 세어져도 목적은 달성된다. */
  if not exists (select 1 from pg_constraint
                  where connamespace = to_regnamespace('engine')
                    and conname = 'learners_gender_c11') then
    alter table engine.learners add constraint learners_gender_c11
      check (gender is null or gender in ('female', 'male', 'undisclosed'));
  end if;

  /* 목적 — 같은 오류도 목적에 따라 처방이 다르다(발주_수집파이프라인 [CHK-4]).
   * ⚠ 이 칸은 덮어쓰기 열이라 과거를 못 든다 — 그 자리는 `learning_events.goal_snapshot` 이
   *   진다(c6). 여기서 막는 것은 「오늘의 목적이 목록 안인가」까지다. */
  if not exists (select 1 from pg_constraint
                  where connamespace = to_regnamespace('engine')
                    and conname = 'learners_goal_track_c11') then
    alter table engine.learners add constraint learners_goal_track_c11
      check (goal_track is null or goal_track in ('study', 'work', 'culture'));
  end if;

  insert into engine.schema_migrations (version, name, checksum, applied_at)
  values (migration_version, migration_name, expected_checksum, now());
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
  ('learners','home_aimag'), ('learners','gender'), ('learners','goal_track')
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
  ('learners_home_aimag_c11'), ('learners_gender_c11'), ('learners_goal_track_c11')
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
  -- 🔑 5 (20260812170000 이 4 에서 올렸다): 회고가 `season_review.learner_id` 에 restrict 를
  --    하나 더 건다. 학생 행이 지워지면 그 학생의 라벨까지 사라지는데, 사람이 낸 라벨은
  --    소급이 안 된다. 이 조각은 이 수를 안 건드린다(CHECK 만 더한다).
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
              and 검수판열=22 and 검수판원문=0 and 근거없는라벨=0 and 목록밖프로필=0
              and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
              and 라디오새는권한=0 and 라디오새는스키마=0 and 라디오kind제약=1
              and 연동보호트리거=1 and 연동활성유일=1 and 스킬시드수=30
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260812180000'
              and (select checksum from 현재이력)='049957bcecd4d42b63f9301e880e7c7bccad7dc711b6ae368c2b27ac140b0b06' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 14·14·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·6·6·0·0·0·1·1·1·30 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260812170000_season_review_c11.sql` «뒤»에만 선다(base_version).
--    그 앞의 c11 조각들이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 0 · RLS 0 · 정책 0 · 트리거 0 · 열 0 — **이 조각이 새로 만드는 것은 CHECK 셋뿐**이다.
--    `테이블수`·`RLS켜짐`(14)·`삭제차단`(5)은 앞 조각 그대로다.
-- ② 새 칸 `목록밖프로필` = **0** — 목록 밖 값이 앉은 학생 행 수다. CHECK 가 섰으면 앞으로
--    0 이 유지되고, 이 수가 오르는 날은 제약이 빠진 날이다(그날이 표기가 섞이기 시작한 날).
-- ③ 부을 때 목록 밖 값이 이미 있으면 판이 **이름을 대고 멈춘다**(`어긋난행`). 자동 정정은
--    하지 않는다 — 어느 아이막으로 옮길지는 추정이고, 추정으로 원본을 덮으면 복원이 안 된다.
-- ④ 코드 쪽 정본은 `lib/가입문항.js` 하나다. 이 파일은 사본이라 `tests/가입문항.test.js` 가
--    **이 파일을 읽어** 세 목록을 글자 단위로 대조한다 — 한쪽만 고치면 CI 가 빨개진다.
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 셋을 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    기대: broadcast_segment_kind_c11 · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_gender_c11 · learners_goal_track_c11 · learners_home_aimag_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11
