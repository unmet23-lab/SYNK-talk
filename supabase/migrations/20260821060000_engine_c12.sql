/* c12 — 상태기반 과제선택의 착지 계약: CHECK 접미 통일 c11→c12 (물리 값 변화 0)
 *   (계약 수집_교정_계약.json c12 · 정본 = appsscript docs/상태기반_과제선택_설계.md §11-2·§4-1·§3-1
 *    · 유호 승인 08-20 Ⅰ-① · 착수 순서 = ①c12 계약 → ②검증기·마이그(이 조각) → ③첫 생성 행)
 *
 * ■ 무엇이 바뀌나 — 표 0 · 열 0 · 트리거 0 · «값도 0». c12 가 여는 세 가지는 전부 물리 밖이다:
 *   · payload 3칸(generation_outcome·generation_gate_failed·generation_input_text)은 jsonb 안이라
 *     DDL 이 원리상 못 닿는다 — 지키는 층은 검증기(lib/이벤트검증.js ⑧⑨) 하나다.
 *   · payload 화이트리스트의 원천은 계약 JSON(payload_허용필드)이다 — 여기 사본을 두지 않는다.
 *   · assignment_status 는 /tasks «응답» 칸이다(C0 §4-3) — 행에 안 남으니 CHECK 가 없다.
 *
 * ■ CHECK 접미 통일 c11→c12 (c7·c8·c11 선례 — 값이 바뀐 것이 0이어도 판 접미는 전체를 통일한다.
 *   같은 이름이 두 계약판을 가리키면 DB 확인 ④가 어느 판인지 못 가른다. 살아 있는 CHECK 31개:
 *   engine 29 + radio 1 + ops 1. ⚠ UNIQUE(…once…)·EXCLUDE(season_no_overlap)·FK·PK 는 값목록이
 *   없어 판 판별과 무관하다 — 이름을 안 간다(tests/L0스키마.test.js 의 접미 검사도 CHECK 만 본다).
 *
 * ■ Edge Function 은 계약판을 schema_migrations 최신 조각 이름(_c12.sql)에서 읽는다(lib/계약판.js).
 *   저장소 계약이 c12 로 오른 뒤 이 조각이 DB 에 앉기 «전»까지 원격배포 판 대조가 「저장소 c12 ·
 *   DB c11」로 빨갛다 — 그 빨강이 이 조각을 배포보다 먼저 부으라는 순서 강제다.
 *
 * 되돌림: 각 CHECK 를 _c11 정의로 재교체(값이 같으니 이름만 되돌리면 된다) +
 *        delete from engine.schema_migrations where version='20260821060000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260821060000';
  migration_name constant text := '20260821060000_engine_c12.sql';
  expected_checksum constant text := '072c72e26709deda7893908ce44e7286298fea7df3c795c7ed684e9571980b3d'; -- migration-checksum
  base_version constant text := '20260815080000';
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

  -- ── learning_events 3 ──
  alter table engine.learning_events
    drop constraint if exists learning_events_event_type_c11,
    drop constraint if exists learning_events_task_type_c11,
    drop constraint if exists learning_events_correction_target_c11,
    add constraint learning_events_event_type_c12 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected', 'correction.responded', 'correction.viewed', 'preference.stated', 'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result', 'content.viewed', 'affect.reported'
    )),
    add constraint learning_events_task_type_c12 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화', '라디오퀴즈', '목표선언', '자습체크인'
    )),
    add constraint learning_events_correction_target_c12 check (
      case when event_type in ('correction.viewed', 'correction.responded')
           then correction_id is not null
           else correction_id is null
      end
    );

  -- ── submissions 3 ──
  alter table engine.submissions
    drop constraint if exists submissions_task_format_c11,
    drop constraint if exists submissions_translation_source_c11,
    drop constraint if exists submissions_due_paired_c11,
    add constraint submissions_task_format_c12 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    add constraint submissions_translation_source_c12 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    ),
    add constraint submissions_due_paired_c12 check (
      (due_at is null) = (due_ver is null)
    );

  /* ⚠ verdict 는 **혼자 한 문장**이다 — tests/검수확정.test.js 의 값 추출이 「check … ));」 로
   *   끝나는 블록을 비탐욕으로 집는다. 다른 CHECK 와 한 alter 에 묶으면 종결이 「)),」 가 되어
   *   추출이 다음 「));」 까지 흘러 들어가 대조가 거짓 적색이 된다(c11 조각 실측 그대로). */
  alter table engine.corrections
    drop constraint if exists corrections_verdict_c11,
    add constraint corrections_verdict_c12 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.corrections
    drop constraint if exists corrections_supersedes_not_self_c11,
    drop constraint if exists corrections_promotion_intent_c11,
    add constraint corrections_supersedes_not_self_c12
      check (supersedes is null or supersedes <> correction_id),
    add constraint corrections_promotion_intent_c12
      check (promotion_intent = false or actor_kind = 'teacher');

  -- ── learners 7 ──
  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c11,
    drop constraint if exists learners_temp_password_paired_c11,
    drop constraint if exists learners_gender_c11,
    drop constraint if exists learners_goal_track_c11,
    drop constraint if exists learners_home_aimag_c11,
    drop constraint if exists learners_group_no_c11,
    drop constraint if exists learners_seat_no_c11,
    add constraint learners_signup_attempts_nonneg_c12 check (signup_attempts >= 0),
    add constraint learners_temp_password_paired_c12
      check (temp_password_hash is null or temp_password_expires_at is not null),
    add constraint learners_gender_c12
      check (gender is null or gender in ('female', 'male', 'undisclosed')),
    add constraint learners_goal_track_c12
      check (goal_track is null or goal_track in ('study', 'work', 'culture')),
    add constraint learners_home_aimag_c12
      check (home_aimag is null or home_aimag in (
        'ulaanbaatar', 'arkhangai', 'bayan-olgii', 'bayankhongor', 'bulgan', 'darkhan-uul',
        'dornod', 'dornogovi', 'dundgovi', 'govi-altai', 'govisumber', 'khentii',
        'khovd', 'khovsgol', 'omnogovi', 'orkhon', 'ovorkhangai', 'selenge',
        'sukhbaatar', 'tov', 'uvs', 'zavkhan')),
    add constraint learners_group_no_c12 check (group_no between 1 and 20),
    add constraint learners_seat_no_c12 check (seat_no between 1 and 20);

  -- ── staff 1 · pipeline_jobs 1 · radio 1 · classes 1 · ops 1 ──
  alter table engine.staff
    drop constraint if exists staff_role_c11,
    add constraint staff_role_c12 check (role in ('teacher', 'inspector', 'director'));

  alter table engine.pipeline_jobs
    drop constraint if exists pipeline_jobs_discard_reason_c11,
    add constraint pipeline_jobs_discard_reason_c12
      check (discard_reason is null
             or (status = 'discarded'
                 and discard_reason in
                   ('무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가')));

  alter table radio.broadcast_segment
    drop constraint if exists broadcast_segment_kind_c11,
    add constraint broadcast_segment_kind_c12
      check (kind in ('radio_loop', 'live_lecture', 'asmr_mode', 'other'));

  alter table engine.classes
    drop constraint if exists classes_key_nonblank_c11,
    add constraint classes_key_nonblank_c12 check (btrim(class_key) <> '');

  alter table ops.cron_runs
    drop constraint if exists cron_runs_outcome_c11,
    add constraint cron_runs_outcome_c12 check (outcome in
      ('대기', '성공', '실패', '타임아웃', '전송오류', '상태없음', '유실', '발사실패'));

  -- ── season 1 · season_compass 1 · season_review 3 ──
  alter table engine.season
    drop constraint if exists season_dates_c11,
    add constraint season_dates_c12 check (ends_on is null or ends_on >= starts_on);

  alter table engine.season_compass
    drop constraint if exists season_compass_answers_c11,
    add constraint season_compass_answers_c12 check (
      (
        self_in_5y_changed is null
        and answers ?& array['why_learning', 'self_in_5y', 'topik_use', 'season_goal']
        and answers - array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] = '{}'::jsonb
      ) or (
        self_in_5y_changed is not null
        and answers ?& array['self_in_5y', 'season_goal']
        and answers - array['self_in_5y', 'season_goal'] = '{}'::jsonb
      )
    );

  alter table engine.season_review
    drop constraint if exists season_review_verdict_c11,
    drop constraint if exists season_review_self_c11,
    drop constraint if exists season_review_decided_c11,
    add constraint season_review_verdict_c12
      check (verdict is null or verdict in ('closer', 'same', 'redirected')),
    add constraint season_review_self_c12
      check (verdict_by_self is null or verdict_by_self in ('closer', 'same', 'redirected')),
    add constraint season_review_decided_c12 check (
      (verdict is null and note is null and decided_by is null and decided_at is null)
      or (verdict is not null and decided_by is not null and decided_at is not null
          and note is not null and btrim(note) <> '')
    );

  -- ── teacher_notes 3 · companion_qa 2 ──
  alter table engine.teacher_notes
    drop constraint if exists teacher_notes_origin_c11,
    drop constraint if exists teacher_notes_disposition_c11,
    drop constraint if exists teacher_notes_body_nonblank_c11,
    add constraint teacher_notes_origin_c12
      check (origin in ('as_is', 'edited', 'written')),
    add constraint teacher_notes_disposition_c12
      check (disposition in ('confirmed', 'retry')),
    add constraint teacher_notes_body_nonblank_c12 check (btrim(body) <> '');

  alter table engine.companion_qa
    drop constraint if exists companion_qa_question_nonblank_c11,
    drop constraint if exists companion_qa_answer_paired_c11,
    add constraint companion_qa_question_nonblank_c12 check (btrim(question) <> ''),
    add constraint companion_qa_answer_paired_c12 check (handoff or btrim(answer) <> '');

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
  ('season_review','record_snapshot'), ('season_review','verdict'),
  ('season_review','verdict_by_self'), ('season_review','note'),
  ('season_review','opened_by'), ('season_review','opened_at'),
  ('season_review','decided_by'), ('season_review','decided_at'),
  -- 가입 1회 문항(20260806150000 이 낸 열 · 20260812180000 이 값을 조인다).
  ('learners','home_aimag'), ('learners','gender'), ('learners','goal_track'),
  -- 반(20260812200000) — 좌표·시즌·활성이 전부 있어야 「지난 시즌 반」을 닫을 수 있다.
  ('classes','class_key'), ('classes','season_id'), ('classes','display_name'),
  ('classes','active'), ('classes','schema_ver'),
  ('learners','class_id'),
  ('staff_classes','staff_id'), ('staff_classes','class_id'), ('staff_classes','schema_ver'),
  -- 강사 한 마디(20260812210000)
  ('teacher_notes','submission_id'), ('teacher_notes','staff_id'), ('teacher_notes','body'),
  ('teacher_notes','origin'), ('teacher_notes','disposition'),
  ('teacher_notes','updated_at'), ('teacher_notes','schema_ver'),
  -- 조·좌석 거울(20260814100000 · 숙제서클 §10-3)
  ('learners','group_no'), ('learners','seat_no')
), 기대제약(n) as (values
  -- ── c12: CHECK 는 전부 _c12 접미 — 이 조각이 _c11 서른하나를 이름째 교체했다.
  --    UNIQUE·EXCLUDE·FK·PK 는 값목록이 없어 판 판별과 무관하니 c11 이름 그대로다.
  ('learning_events_event_type_c12'), ('learning_events_task_type_c12'),
  ('submissions_task_format_c12'), ('submissions_translation_source_c12'),
  ('submissions_due_paired_c12'), ('corrections_verdict_c12'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c12'), ('staff_role_c12'),
  ('learners_temp_password_paired_c12'),
  ('learning_events_correction_target_c12'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c12'), ('corrections_promotion_intent_c12'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c12'),
  -- 시즌 그릇(20260812140000) — 겹침 배제·날짜 순서·학생×시즌 유일·문항 묶음 + 고리 둘.
  ('season_no_overlap_c11'), ('season_dates_c12'),
  ('season_compass_once_c11'), ('season_compass_answers_c12'),
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey'),
  -- 시즌 회고(20260812170000) — 판정 3갈래 둘 + 「판정·사유·주체·시각 한 벌」 + 고리 둘.
  ('season_review_once_c11'), ('season_review_verdict_c12'),
  ('season_review_self_c12'), ('season_review_decided_c12'),
  ('season_review_learner_id_fkey'), ('season_review_season_id_fkey'),
  -- 가입 1회 문항 값목록(20260812180000) — 세 칸 전부.
  ('learners_home_aimag_c12'), ('learners_gender_c12'), ('learners_goal_track_c12'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  ('classes_pkey'), ('classes_key_nonblank_c12'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  -- 강사 한 마디(20260812210000) — 유일(한 산출물에 하나) + 값목록 둘 + 빈 말 금지 + 고리 둘.
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c12'),
  ('teacher_notes_origin_c12'), ('teacher_notes_disposition_c12'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey'),
  -- 조·좌석 쓰레기 못(20260814100000)
  ('learners_group_no_c12'), ('learners_seat_no_c12'),
  -- companion 빈칸 로그(20260814110000)
  ('companion_qa_question_nonblank_c12'), ('companion_qa_answer_paired_c12'),
  ('companion_qa_staff_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000)
  ('season_compass_protect'),
  -- 회고(20260812170000) — 굳힌 근거 불변 + 학생 판정은 강사 「전」에만 + 삭제 금지.
  ('season_review_freeze'), ('season_review_protect'),
  -- 강사 한 마디 삭제 금지(20260812210000)
  ('teacher_notes_protect'),
  -- companion 빈칸 로그 개서·삭제 금지(20260814110000)
  ('companion_qa_immutable')
), 대상역할(r) as (values ('anon'), ('authenticated'))
, 대상권한(p) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
, 대상테이블(t) as (
  select tablename from pg_tables where schemaname='engine'
  union all
  select viewname from pg_views where schemaname='engine'
), 라디오테이블(t) as (
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
  select e.n,
         (select g.tgenabled from pg_trigger g
            join pg_class r on r.oid=g.tgrelid
           where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n) as 상태
    from 기대트리거 e
), 빠진트리거 as (
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
  -- 🔑 이 조각은 표를 안 만든다 — 숫자 전부 20260815080000 그대로다(값 변화 0 의 증거).
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
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue') as 검수뷰,
  (select count(*) from pg_policies
    where schemaname='engine' and policyname='inspector_queue_submissions') as 옛검수정책,
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출,
  (select count(*) from engine.submissions s
     join engine.learning_events e on e.event_id = s.event_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and s.occurred_at >= (select applied_at from engine.schema_migrations
                             where version = '20260808010000')) as 마감없는배정,
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염,
  (select count(*) from engine.pipeline_jobs j
    where j.status = 'discarded' and j.discard_reason is null
      and j.updated_at >= (select applied_at from engine.schema_migrations
                            where version = '20260809090000')) as 폐기사유없는폐기,
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문,
  (select count(*) from engine.season_review
    where verdict is not null
      and (record_snapshot = '{}'::jsonb
           or record_snapshot -> 'axes_전반' is null
           or record_snapshot -> 'axes_후반' is null)) as 근거없는라벨,
  (select count(*) from engine.learners
    where (home_aimag is not null and home_aimag not in (
             'ulaanbaatar','arkhangai','bayan-olgii','bayankhongor','bulgan','darkhan-uul',
             'dornod','dornogovi','dundgovi','govi-altai','govisumber','khentii',
             'khovd','khovsgol','omnogovi','orkhon','ovorkhangai','selenge',
             'sukhbaatar','tov','uvs','zavkhan'))
       or (gender is not null and gender not in ('female','male','undisclosed'))
       or (goal_track is not null and goal_track not in ('study','work','culture')))
    as 목록밖프로필,
  (select count(*) from (
     select class_key, season_id from engine.classes
      group by class_key, season_id having count(*) > 1) d) as 겹친반좌표,
  (select count(*) from pg_indexes
    where schemaname='engine'
      and indexname in ('classes_key_in_season','classes_key_no_season')) as 반좌표유일,
  (select count(*) from pg_tables where schemaname='radio') as 라디오표수,
  (select count(*) from pg_tables where schemaname='radio' and rowsecurity) as 라디오RLS수,
  (select count(*) from pg_policies where schemaname='radio') as 라디오정책수,
  (select count(*) from 대상역할 r cross join 라디오테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','radio',t.t), p.p)) as 라디오새는권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('radio'), 'USAGE')) as 라디오새는스키마,
  -- c12 가 접미를 갈았다 — 옛 이름을 세면 「적용 전」과 「적용 후」가 같은 0 으로 보인다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('radio')
      and conname='broadcast_segment_kind_c12') as 라디오kind제약,
  (select count(*) from pg_trigger g
     join pg_class c2 on c2.oid=g.tgrelid
    where c2.relnamespace=to_regnamespace('radio')
      and g.tgname='viewer_link_protect' and g.tgenabled in ('O','A')) as 연동보호트리거,
  (select count(*) from pg_indexes
    where schemaname='radio' and indexname='viewer_link_active') as 연동활성유일,
  (select count(*) from engine.skills) as 스킬시드수,
  (select count(*) from (
     select submission_id from engine.teacher_notes
      group by submission_id having count(*) > 1) d2) as 겹친한마디,
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue_class') as 반검수뷰,
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class') as 반검수판열,
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 반검수판원문,
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='companion_qa') as 컴패니언열,
  (select count(*) from pg_policies
    where schemaname='engine' and tablename='companion_qa') as 컴패니언정책,
  -- ops 회차 장부(20260815080000) — c12 가 outcome CHECK 접미를 갈았으니 새 이름을 센다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('ops')
      and conname='cron_runs_outcome_c12') as 회차제약
)
select case when 테이블수=18 and RLS켜짐=18 and 정책수=7
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
              and 컴패니언열=11 and 컴패니언정책=0 and 회차제약=1
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260821060000'
              and (select checksum from 현재이력)='072c72e26709deda7893908ce44e7286298fea7df3c795c7ed684e9571980b3d' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 18·18·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- 사후 메모:
-- ① 이 조각의 몫은 이름 교체 «만»이다 — c12 의 실체(payload 3칸·화이트리스트·assignment_status)는
--    전부 물리 밖이라 검증기·계약 JSON·C0 가 진다. DB 가 지는 것은 「어느 계약판 위인가」 하나다.
-- ② CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 _c11 서른하나를 _c12 로 이름째 교체했다).
--    ⚠ 이 줄은 마지막 조각이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `season_no_overlap_c11`(EXCLUDE) · `…_once_c11`(UNIQUE) · `companion_qa_*_fkey` 는 여기
--      없다 — CHECK 가 아니라 이 줄의 대상이 아니고, 이름도 c11 그대로 산다(값목록이 없어
--      판 판별과 무관하다 · 위 기대제약 목록에는 그 이름 그대로 들어 있다).
--    기대: broadcast_segment_kind_c12 · classes_key_nonblank_c12
--         · companion_qa_answer_paired_c12 · companion_qa_question_nonblank_c12
--         · corrections_promotion_intent_c12
--         · corrections_supersedes_not_self_c12 · corrections_verdict_c12
--         · cron_runs_outcome_c12
--         · learners_gender_c12 · learners_goal_track_c12 · learners_group_no_c12
--         · learners_home_aimag_c12 · learners_seat_no_c12
--         · learners_signup_attempts_nonneg_c12 · learners_temp_password_paired_c12
--         · learning_events_correction_target_c12 · learning_events_event_type_c12
--         · learning_events_task_type_c12 · pipeline_jobs_discard_reason_c12
--         · season_compass_answers_c12 · season_dates_c12
--         · season_review_decided_c12 · season_review_self_c12 · season_review_verdict_c12
--         · staff_role_c12 · submissions_due_paired_c12 · submissions_task_format_c12
--         · submissions_translation_source_c12 · teacher_notes_body_nonblank_c12
--         · teacher_notes_disposition_c12 · teacher_notes_origin_c12
