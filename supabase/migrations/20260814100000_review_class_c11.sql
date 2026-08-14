-- 검수 콘솔 「오늘 수업 반」 뷰의 물리 — 숙제 서클 §10-3 조각
--
-- 정본 = SYNK-appsscript `docs/숙제서클_설계.md` §10-3 (유호님 확정 2026-08-13 「수업 첫 20분 =
--   서클(4인조 발화) ∥ 몽골쌤 순회 검수」 · 집행 지시 08-14) + `docs/검수_내부계약.md` §3-2(같은
--   커밋에서 개정). 교사는 조 옆에 앉아 손으로는 **그 조 4명의 AI 초안**을 넘기고 귀로는 브리핑을
--   듣는다(설계 §4) — 그 화면이 서려면 서버가 「이 제출물이 어느 반·어느 조·누구 것인가」를
--   낼 수 있어야 한다. 이 조각은 그 두 가지를 세운다: 조·좌석 거울 2칸 + 반 모드 전용 판.
--
-- ■ 🔴 왜 `review_queue` 를 넓히지 않고 **판을 따로** 세우나
--   기본 큐는 검수자에게 학생 정체를 **일부러 안 준다**(`20260807190000` — 검수자 = 전사 축).
--   그 판을 넓히면 모든 소비자가 이름을 받고, 「검수자가 봐도 되나」의 판정 지점(§3)이 소리 없이
--   지나간다. 반 모드는 다르다 — 순회 검수는 교사가 학생 **눈앞에** 앉아 있는 자리라, 이름 없이는
--   어느 초안이 그 학생 것인지 원리상 못 가른다(종이 서클 시트에도 같은 이름이 이미 인쇄돼 있다).
--   그래서 정체 열은 이 판에만 열고, 기본 큐는 바이트 그대로 둔다 — 어느 통로가 정체를 내는지가
--   판 이름으로 갈린다.
--
-- ■ 왜 `learners` 에 거울 2칸이고 새 표가 아닌가
--   조·좌석의 정본은 시트 `groups`(시즌×반 1벌 · `assignGroupsAll` 이 채운다)다. 여기는 그
--   **표시용 거울**이고, 아침 명부 스윕(`명부스윕_` → `roster-ingest`)이 매일 전체 스냅샷을 다시
--   부어 스스로 낫는다(명부가 이미 그 방식이다). 계보 표(`classes` 방식)로 안 세우는 이유:
--   `corrections`·사건 어느 것도 조를 참조하지 않는다 — 조는 화면 묶음 전용이라 «지금 값» 하나면
--   족하고, 시즌이 바뀌면 스윕이 그날 아침 덮는다. ⚠ null 이 정상 상태다(편성 전 · 배정 전).
--
-- ■ 채우는 코드는 이 조각에 0줄이다 — 정직 표기
--   생산자 = `명부스윕_`(appsscript)의 `조편성` 동봉 + `roster-ingest` 신판이고 **같은 트랙**에
--   선다. 🔴 `roster-ingest` 신판은 반피드백 §10-4 와 같은 ⏳유호님 승인 자리라, 이 조각도 그
--   승인에 얹혀 부어진다 — 그 전까지 운영·리허설 어디에도 미적용이고 두 칸은 어디에도 없다.
--   「판이 섰다」를 「반 모드가 돈다」로 읽지 않는다.
--
-- 되돌림: drop view if exists engine.review_queue_class;
--        alter table engine.learners drop column if exists group_no;
--        alter table engine.learners drop column if exists seat_no;
--        delete from engine.schema_migrations where version = '20260814100000';

begin;

do $migration$
declare
  migration_version constant text := '20260814100000';
  migration_name constant text := '20260814100000_review_class_c11.sql';
  expected_checksum constant text := '875ab1717d864025ef1e24c0445b3c72a975101f5950ade10f6d55798ccea340'; -- migration-checksum
  base_version constant text := '20260812210000';
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
      'engine.classes 가 없다 — 반 모드는 반 위에서만 선다(20260812200000_class_c11 이 먼저 서야 한다)';
  end if;

  if to_regclass('engine.review_queue') is null then
    raise exception
      'engine.review_queue 가 없다 — 반 판은 기본 판에서 파생한다(20260809050000_review_c10 이 먼저 서야 한다)';
  end if;

  -- ① 조·좌석 거울 — null 이 정상(편성 전). 상한 20 은 규모 못이 아니라 쓰레기 못이다:
  --    시트에서 좌표가 밀려 학번·전화가 이 칸으로 흘러든 날, 조용히 앉는 대신 여기서 죽는다
  --    (지금 조는 4개·좌석은 4이지만 편성 규모는 시트가 정하므로 느슨하게 둔다).
  alter table engine.learners
    add column group_no smallint constraint learners_group_no_c11 check (group_no between 1 and 20),
    add column seat_no  smallint constraint learners_seat_no_c11  check (seat_no  between 1 and 20);

  -- ② 반 모드 전용 판 — 기본 판 22열 + 정체 4열. `learning_events` 를 지나는 이유는
  --    `submissions` 가 learner_id 복제를 거부해서다(c10 머리말) — 제출의 주인은 사건이 안다.
  --    반이 없는 학생(class_id null)도 행은 나온다 — 자르는 것은 읽는 쪽의 where 다
  --    (판은 무엇을 보여줄지만 정한다 · `20260809050000` 머리말과 같은 축).
  create view engine.review_queue_class as
    select v.*,
           l.class_id,
           l.display_name,
           l.group_no,
           l.seat_no
      from engine.review_queue v
      join engine.learning_events e on e.event_id = v.event_id
      join engine.learners l on l.learner_id = e.learner_id;

  comment on view engine.review_queue_class is
    '검수 큐의 반 모드 판(숙제서클 §10-3 · 검수_내부계약 §3-2). 기본 판과 달리 학생 정체(이름·조·좌석)를 연다 — 순회 검수는 교사가 학생 눈앞에 앉는 자리라 정체 없이는 초안을 못 가른다. 소비자는 review Fn 의 ?class= 갈래 하나다.';

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
  ('teacher_notes','updated_at'), ('teacher_notes','schema_ver'),
  -- 조·좌석 거울(20260814100000 · 숙제서클 §10-3) — 빠지면 반 모드 판이 정의부터 죽는데,
  --   그 죽음은 합본을 부을 때만 보인다. 여기서 세면 「덜 부은 DB」가 이름으로 말한다.
  ('learners','group_no'), ('learners','seat_no')
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
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey'),
  -- 조·좌석 쓰레기 못(20260814100000) — 빠지면 시트 좌표 밀림이 조용히 앉는다.
  ('learners_group_no_c11'), ('learners_seat_no_c11')
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
  -- 🔑 17 그대로(20260814100000): 이 조각은 표를 안 만든다 — 뷰 하나와 열 둘뿐이다.
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 5 (20260812170000 이 4 에서 올렸다). 이 조각도 이 수를 안 건드린다 — 새 FK 가 없다.
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
      group by submission_id having count(*) > 1) d2) as 겹친한마디,
  -- ── 반 모드 판(20260814100000 · 숙제서클 §10-3) ──
  -- 판이 서 있는가 — 기본 판(검수뷰)과 별개로 센다(둘 중 하나만 선 DB 가 실재할 수 있다).
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue_class') as 반검수뷰,
  -- 기본 22열 + 정체 4열(class_id·display_name·group_no·seat_no). 수로 재야 「덜 넓힌 판」이 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class') as 반검수판열,
  -- 정체는 열되 원문 셋은 반 모드에서도 안 연다 — 기본 판의 「검수판원문=0」과 같은 못이다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 반검수판원문
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
              and 반검수뷰=1 and 반검수판열=26 and 반검수판원문=0
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260814100000'
              and (select checksum from 현재이력)='875ab1717d864025ef1e24c0445b3c72a975101f5950ade10f6d55798ccea340' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 17·17·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260812210000` «뒤»에만 선다(base_version). 앞의 c11 조각들과
--    `roster-ingest` 신판이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 **0** · 뷰 **+1**(`review_queue_class`) · 열 **+2**(`learners.group_no`·`seat_no`) ·
--    트리거 0 · RLS 변화 0(뷰는 RLS 대상이 아니고 정책 0·grant 0 이라 닫힌 채로 태어난다 —
--    `새는테이블권한` 이 뷰까지 세므로 열리는 날 빨개진다).
-- ② 새 칸 셋 = `반검수뷰`(1) · `반검수판열`(26) · `반검수판원문`(0). 수로 재는 이유는
--    「덜 넓힌 판」과 「안 선 판」이 존재 검사에서 같은 모양이기 때문이다.
-- ③ 이 조각은 **행을 하나도 안 바꾼다**. 두 칸은 `명부스윕_` 의 `조편성` 동봉 +
--    `roster-ingest` 신판이 채운다 — 지금 전원 null 이 정상이다(편성 전).
--    「판이 섰다」를 「반 모드가 돈다」로 읽지 않는다.
-- ④ 🔴 아직 **없는 것** — 이 판을 읽는 통로(`review` Fn 의 `?class=` 갈래·`classes` 경로)는
--    같은 트랙의 코드 커밋에 선다. 운영 재배포는 ⏳유호님 승인 자리다(반피드백 §10-4 와 같다).
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 둘을 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `teacher_notes_once_c11` 은 여기 없다 — UNIQUE 라 CHECK 목록의 대상이 아니다.
--    기대: broadcast_segment_kind_c11 · classes_key_nonblank_c11
--         · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_gender_c11 · learners_goal_track_c11 · learners_group_no_c11
--         · learners_home_aimag_c11 · learners_seat_no_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11 · teacher_notes_body_nonblank_c11
--         · teacher_notes_disposition_c11 · teacher_notes_origin_c11
