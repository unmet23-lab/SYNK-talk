/* 일요일 자율일 묶음 — engine.sunday_bundles (2026-09-07 · appsscript 자율일 설계 v1.3 §⑧ 「talk 가 받을 것」)
 *
 * ■ 무엇이 비어 있었나 — 토요일 밤에 appsscript 가 지은 «그 학생의 일요일 묶음»을 talk 가 놓을 자리가 없었다.
 *   묶음 = 굳히기 8 · 낭독 2 · 답하기 2 · 오답 ≤5 · (필수진단 주면) 진단 1. 학생마다 다르고, 그날 한 번만 짓는다.
 *
 * ■ 🔴 왜 «큐»가 아니라 «재료»인가 — 큐는 새 테이블이 아니다(P0 §6-1 · F124)
 *   과제 큐는 `task.assigned` 사건 + 그 `submissions.task_snapshot` 이고 그 규칙은 그대로다. 이 표는 큐가 아니라
 *   **배치가 조립할 재료**를 담는다. 재료와 큐를 가르는 까닭은 «조립을 한 곳이 지게» 하기 위해서다 —
 *   배정 사건에는 동의판·급수 스냅샷·목표 스냅샷·consent_id 가 함께 실려야 하고, 그 조립은 `functions/deliver`
 *   하나가 안다. 받는 문이 사건을 직접 쓰면 같은 조립이 두 곳에 살아 갈라진다(이 저장소가 가장 크게 데인 유형).
 *   ⇒ 받는 문(`functions/sunday-bundle`)은 여기까지만 놓고, 일요일 배치가 이 행을 읽어 평소와 같은 길로 배정한다.
 *
 * ■ 하루 한 벌 — (learner_id, autonomy_date) unique
 *   배정 사건의 멱등키가 `task:{learner}:{날짜}` 라 「그날 배정 1건」이 이미 유일 제약이다. 재료도 같은 폭이라야
 *   둘이 어긋나지 않는다. 🔴 **발행 뒤 불변**(자율일 설계 §③-㉠) — 같은 배정ID 가 다시 와도 안 갈아 끼운다.
 *   예외 하나: 항목이 0 이던 묶음이 채워져 오는 경우만 받는다(공급 실패가 늦게 나은 날 · 배포 검수 P3 21f680c14c40).
 *   그 판정은 적재 쪽(함수)이 지고, 표는 «덮어쓰기가 기본이 아니다»만 진다.
 *
 * ■ 칸 뜻
 *   assignment_id  = appsscript 가 채번한 배정ID(`학생번호|yyyy-MM-dd` 꼴) — 항목ID 가 `배정ID#종류N` 로 여기 붙는다.
 *   autonomy_date  = 그 자율일(일요일 · 몽골 달력으로 끊은 날짜 · 배정 사건의 날짜와 같은 글자라야 짝이 선다).
 *   week_no·week_ver = 1기 차시 1~8 과 그때의 차시 표 판(`c1w-…`). 표가 바뀌어도 옛 묶음은 옛 판을 쥔다.
 *   bundle         = 받은 묶음 그대로(항목 배열 · 문항 스냅샷 포함). 🔴 서버가 베껴 채우지 않는다(C0 §task_snapshot 규약).
 *   delivered_event_id = 배치가 이 재료로 배정을 쓴 뒤 그 사건을 가리킨다. null = 아직 안 냈다(재료만 있다).
 *
 * ■ 🔴 정답이 이 표에 산다 — 앱으로는 안 나간다
 *   굳히기·오답 항목의 문항 스냅샷에는 정답 자리가 들어 있다(채점은 appsscript `quiz_log` 가 한다 · 설계 §⑥).
 *   학생에게 나가는 것은 `lib/오늘과제.js` 의 **허용 목록**이 가른다 — 새 키의 기본값은 「안 나감」이라
 *   이 표에 정답이 있어도 통로가 열리지 않는다. 그 목록을 넓혀 정답을 내보내지 않는다.
 *
 * ■ 소급 0 · 트리거 0 · 뷰 0 · RLS 0(engine 스키마는 함수만 붙는다 · 다른 표와 같은 꼴) · 계약판 그대로(c16 · 제출 쪽 새 칸 0).
 *
 * 되돌림: drop table if exists engine.sunday_bundles;
 *         delete from engine.schema_migrations where version='20260907200000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260907200000';
  migration_name constant text := '20260907200000_sunday_bundles_c16.sql';
  expected_checksum constant text := 'f14953ab3a11bb7f9b5487a387c91e5a30d850379d13faac8a7f16a20ac7691b'; -- migration-checksum
  base_version constant text := '20260907100000';   -- 체인은 «바로 앞 조각»을 가리킨다
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 합본 위에서만 돈다 — engine.schema_migrations 가 없다(빈 DB 면 합본을 처음부터 부어라)';
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
      'migration % 는 % 위에서만 돈다 — 체인이 끊겼다',
      migration_version, base_version;
  end if;
end
$migration$;

-- ══════════ 표 하나 — 소급 0 · default 는 받은 시각뿐 ══════════
create table if not exists engine.sunday_bundles (
  assignment_id      text primary key,
  learner_id         uuid not null references engine.learners(learner_id),
  autonomy_date      date not null,
  week_no            smallint not null,
  week_ver           text not null,
  bundle             jsonb not null,
  received_at        timestamptz not null default now(),
  delivered_event_id uuid references engine.learning_events(event_id),
  schema_ver         text not null
);

create unique index if not exists sunday_bundles_learner_date_uk
  on engine.sunday_bundles (learner_id, autonomy_date);

create index if not exists sunday_bundles_undelivered_idx
  on engine.sunday_bundles (autonomy_date)
  where delivered_event_id is null;

comment on table engine.sunday_bundles is
  '일요일 자율일 묶음의 «재료» — appsscript 토요일 밤 배치가 보낸 것을 그대로 놓는 자리. 큐가 아니다(큐는 task.assigned + submissions.task_snapshot). 일요일 배치가 이 행을 읽어 평소와 같은 조립으로 배정한다 — 조립을 두 곳에 두지 않기 위해서다.';
comment on column engine.sunday_bundles.assignment_id is
  'appsscript 배정ID(학생번호|yyyy-MM-dd). 항목ID 가 「배정ID#종류N」 로 여기 붙는다. 발행 뒤 불변 — 같은 값이 다시 와도 안 갈아 끼운다(항목 0 이던 묶음이 채워져 오는 경우만 예외 · 판정은 함수가 진다).';
comment on column engine.sunday_bundles.bundle is
  '받은 묶음 그대로(항목 배열 · 문항 스냅샷 포함). 서버가 베껴 채우지 않는다. 🔴 굳히기·오답의 정답이 여기 산다 — 학생에게 나가는 것은 lib/오늘과제.js 허용 목록이 가른다(새 키 기본값 = 안 나감).';
comment on column engine.sunday_bundles.delivered_event_id is
  '이 재료로 쓴 task.assigned 사건. null = 아직 안 냈다. 배정 사건 자체가 하루 1건 유일이라 이 칸은 «냈나»의 표시일 뿐 큐 상태가 아니다.';

do $migration2$
declare
  expected_checksum constant text := 'f14953ab3a11bb7f9b5487a387c91e5a30d850379d13faac8a7f16a20ac7691b'; -- migration-checksum
begin
  insert into engine.schema_migrations(version, name, checksum)
  values ('20260907200000', '20260907200000_sunday_bundles_c16.sql', expected_checksum);
end
$migration2$;

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
  ('learning_events','observer_staff_id'), ('learning_events','draft_modified'),
  ('consents','recorded_by'),
  ('learning_events','source_kind'), ('learning_events','estimator_confidence'),
  ('learning_events','estimator_version'), ('learning_events','evidence_refs'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
  ('submissions','due_at'), ('submissions','due_ver'),
  ('corrections','supersedes'), ('corrections','promotion_intent'),
  ('corrections','transcript_at_review'), ('pipeline_jobs','discard_reason'),
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at'),
  ('learners','is_test'),
  ('learners','recovery_email'), ('learners','recovery_phone'),
  ('learners','temp_password_expires_at'), ('learners','signup_attempts'),
  ('learners','active'), ('learners','revoked_before'),
  ('staff','role'), ('staff','staff_id'), ('staff','active'), ('staff','revoked_before'),
  ('staff_access_log','action'), ('staff_access_log','target_ids'),
  ('learners','temp_password_hash'),
  ('season','textbook'), ('season','starts_on'), ('season','ends_on'),
  ('season_compass','answers'), ('season_compass','self_in_5y_changed'),
  ('season_compass','goal_track_at_open'), ('season_compass','recorded_by'),
  ('season_review','record_snapshot'), ('season_review','verdict'),
  ('season_review','verdict_by_self'), ('season_review','note'),
  ('season_review','opened_by'), ('season_review','opened_at'),
  ('season_review','decided_by'), ('season_review','decided_at'),
  ('learners','home_aimag'), ('learners','gender'), ('learners','goal_track'),
  ('classes','class_key'), ('classes','season_id'), ('classes','display_name'),
  ('classes','active'), ('classes','schema_ver'),
  ('learners','class_id'),
  ('staff_classes','staff_id'), ('staff_classes','class_id'), ('staff_classes','schema_ver'),
  ('teacher_notes','submission_id'), ('teacher_notes','staff_id'), ('teacher_notes','body'),
  ('teacher_notes','origin'), ('teacher_notes','disposition'),
  ('teacher_notes','updated_at'), ('teacher_notes','schema_ver'),
  ('learners','group_no'), ('learners','seat_no'),
  ('generation_jobs','batch_run_id'), ('generation_jobs','snapshot_as_of'),
  ('generation_jobs','branch_snapshot'), ('generation_jobs','event_draft'),
  ('generation_jobs','fence'), ('generation_jobs','outcome'),
  ('generation_jobs','winning_attempt_id'), ('generation_jobs','deciding_attempt_id'),
  ('generation_jobs','load_retry_count'),
  ('generation_attempts','request_body'), ('generation_attempts','raw_response'),
  ('generation_attempts','result'), ('generation_attempts','gate_failed_reasons'),
  ('generation_attempts','fence'),
  ('generation_batch_runs','run_kind'), ('generation_batch_runs','roster_hash'),
  ('generation_batch_runs','level_distribution'), ('generation_batch_runs','finished_at'),
  ('generation_batch_runs','snapshot_as_of'),
  ('generation_attempts','acked_at'),
  ('generation_batch_runs','deliver_check_reds'), ('generation_batch_runs','deliver_check_at'),
  ('l10n_strings','string_id'), ('l10n_strings','source_ko'), ('l10n_strings','draft_mn'),
  ('l10n_strings','context'), ('l10n_strings','max_len'), ('l10n_strings','status'),
  ('l10n_strings','created_at'), ('l10n_strings','updated_at'),
  ('l10n_reviews','review_id'), ('l10n_reviews','string_id'), ('l10n_reviews','reviewer'),
  ('l10n_reviews','verdict'), ('l10n_reviews','final_mn'), ('l10n_reviews','note'),
  ('l10n_reviews','supersedes'), ('l10n_reviews','created_at'),
  ('submissions','stt_model'), ('submissions','stt_lang'),
  ('learners','enrolled_at'), ('learners','observed_at'), ('learners','effective_at'),
  ('learners','exit_reason'), ('learners','lifecycle_status'),
  -- 입학 시즌(20260907100000 · 브랜드 v2 ㉢-1 · appsscript v9.318~319)
  ('learners','entry_season'),
  -- 일요일 자율일 묶음의 재료(20260907200000 · appsscript 자율일 설계 v1.3 §⑧)
  ('sunday_bundles','assignment_id'), ('sunday_bundles','learner_id'),
  ('sunday_bundles','autonomy_date'), ('sunday_bundles','week_no'),
  ('sunday_bundles','week_ver'), ('sunday_bundles','bundle'),
  ('sunday_bundles','received_at'), ('sunday_bundles','delivered_event_id'),
  ('sunday_bundles','schema_ver'),
  -- STT 원신호 불변 보관(20260906000000 · 철학 A-1 v1.23)
  ('stt_raw','event_id'), ('stt_raw','vendor_response'), ('stt_raw','stt_model'), ('stt_raw','recorded_at')
), 기대제약(n) as (values
  ('learning_events_event_type_c16'), ('learning_events_task_type_c16'),
  ('submissions_task_format_c16'), ('submissions_translation_source_c16'),
  ('submissions_due_paired_c16'), ('corrections_verdict_c16'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c16'), ('staff_role_c16'),
  ('learners_temp_password_paired_c16'),
  ('learning_events_correction_target_c16'), ('learning_events_correction_id_fkey'),
  ('learning_events_consent_id_fkey'),
  ('corrections_supersedes_not_self_c16'), ('corrections_promotion_intent_c16'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c16'),
  ('season_no_overlap_c11'), ('season_dates_c16'),
  ('season_compass_once_c11'), ('season_compass_answers_c16'),
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey'),
  ('season_review_once_c11'), ('season_review_verdict_c16'),
  ('season_review_self_c16'), ('season_review_decided_c16'),
  ('season_review_learner_id_fkey'), ('season_review_season_id_fkey'),
  ('learners_home_aimag_c16'), ('learners_gender_c16'), ('learners_goal_track_c16'),
  ('classes_pkey'), ('classes_key_nonblank_c16'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c16'),
  ('teacher_notes_origin_c16'), ('teacher_notes_disposition_c16'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey'),
  ('learners_group_no_c16'), ('learners_seat_no_c16'),
  ('companion_qa_question_nonblank_c16'), ('companion_qa_answer_paired_c16'),
  ('companion_qa_staff_id_fkey'),
  ('attempts_gate_values_c16'),
  ('attempts_response_present_c16'),
  ('attempts_result_gate_c16'),
  ('attempts_ver_nonempty_c16'),
  ('batch_runs_counts_order_c16'),
  ('batch_runs_counts_pair_c16'),
  ('batch_runs_enrolled_nonneg_c16'),
  ('batch_runs_finished_cols_c16'),
  ('batch_runs_level_dist_ok_c16'),
  ('batch_runs_partial_pair_c16'),
  ('batch_runs_partial_range_c16'),
  ('batch_runs_roster_equation_c16'),
  ('batch_runs_skipped_range_c16'),
  ('batch_runs_ver_nonempty_c16'),
  ('jobs_anchor_present_c16'),
  ('jobs_claim_cols_c16'),
  ('jobs_deciding_pair_c16'),
  ('jobs_deciding_result_matches_c16'),
  ('jobs_deciding_scope_c16'),
  ('jobs_draft_present_c16'),
  ('jobs_idle_cols_c16'),
  ('jobs_load_failed_cols_c16'),
  ('jobs_nontarget_cols_c16'),
  ('jobs_nonterminal_cols_c16'),
  ('jobs_skill_ids_present_c16'),
  ('jobs_status_outcome_pairs_c16'),
  ('jobs_terminal_cols_c16'),
  ('jobs_ver_nonempty_c16'),
  ('jobs_winner_fence_current_c16'),
  ('jobs_winner_fence_pair_c16'),
  ('jobs_winner_only_success_c16'),
  ('jobs_winner_present_c16'),
  ('jobs_winner_result_only_success_c16'),
  ('jobs_winner_result_pair_c16'),
  ('l10n_strings_id_ascii_c16'), ('l10n_strings_ko_nonblank_c16'),
  ('l10n_strings_max_len_c16'), ('l10n_strings_status_c16'),
  ('l10n_reviews_verdict_c16'), ('l10n_reviews_final_paired_c16'),
  ('l10n_reviews_supersedes_not_self_c16'),
  ('jobs_winning_attempt_fk'), ('jobs_deciding_attempt_fk'), ('jobs_batch_run_fk'),
  ('attempts_id_job_result_uk'), ('attempts_id_job_fence_result_uk'), ('batch_runs_run_date_uq'),
  -- STT 원신호(20260906000000) — PK + 제출 고리
  ('stt_raw_pkey'), ('stt_raw_event_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  ('submissions_enqueue_job'), ('consents_protect'),
  ('season_compass_protect'),
  ('season_review_freeze'), ('season_review_protect'),
  ('teacher_notes_protect'),
  ('companion_qa_immutable'),
  ('generation_jobs_freeze'), ('generation_batch_runs_freeze'), ('jobs_nontarget_settled'),
  -- STT 원신호 덧붙이기만(20260906000000)
  ('stt_raw_protect')
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
  -- 🔑 이 조각은 표를 **하나** 만든다(stt_raw) — 테이블수·RLS켜짐이 23 → 24. 정책은 0 이라 정책수는 7 그대로다.
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
     left join engine.learners l on l.learner_id = e.learner_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and not coalesce(l.is_test, false)
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
  (select count(*) from information_schema.columns where table_schema='radio' and (
     (table_name='ingest_heartbeat' and column_name in ('ok','error_kind','page_token','next_page_token','pages_fetched'))
     or (table_name='chat_message' and column_name='video_id')
     or (table_name='quiz_round' and column_name in ('video_id','idempotency_key','posted_message_ids','post_status'))
   )) as 라디오보강열,
  (select count(*) from pg_indexes where (schemaname='radio' and indexname in ('quiz_round_idem','chat_message_video_sent'))
     or (schemaname='engine' and indexname='radio_quiz_answer_once')) as 라디오보강인덱스,
  (select count(*) from pg_tables where schemaname='radio') as 라디오표수,
  (select count(*) from pg_tables where schemaname='radio' and rowsecurity) as 라디오RLS수,
  (select count(*) from pg_policies where schemaname='radio') as 라디오정책수,
  (select count(*) from 대상역할 r cross join 라디오테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','radio',t.t), p.p)) as 라디오새는권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('radio'), 'USAGE')) as 라디오새는스키마,
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('radio')
      and conname='broadcast_segment_kind_c16') as 라디오kind제약,
  (select count(*) from pg_trigger g
     join pg_class c2 on c2.oid=g.tgrelid
    where c2.relnamespace=to_regnamespace('radio')
      and g.tgname='viewer_link_protect' and g.tgenabled in ('O','A')) as 연동보호트리거,
  (select count(*) from pg_indexes
    where schemaname='radio' and indexname='viewer_link_active') as 연동활성유일,
  (select count(*) from engine.skills where schema_ver = 'c11') as 스킬시드수,
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
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('ops')
      and conname='cron_runs_outcome_c16') as 회차제약,
  -- 09-06 — 확인 답 방벽이 «하루 1행»에서 «카드마다 하루 1행»(estimate_card_once_c16)으로. 옛 이름은 0 이어야 한다.
  (select count(*) from pg_indexes
    where schemaname='engine' and indexname='estimate_card_once_c16') as 확인카드유일,
  (select count(*) from pg_indexes
    where schemaname='engine' and indexname='estimate_daily_once_c13') as 옛확인하루유일,
  (select count(*) from pg_indexes
    where schemaname='engine' and indexname='goal_daily_once_c14') as 목표하루유일
)
select case when 테이블수=24 and RLS켜짐=24 and 정책수=7
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
              and 확인카드유일=1 and 옛확인하루유일=0 and 목표하루유일=1
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and 라디오보강열=10 and 라디오보강인덱스=3
              and (select version from 현재이력)='20260907100000'
              and (select checksum from 현재이력)='f14953ab3a11bb7f9b5487a387c91e5a30d850379d13faac8a7f16a20ac7691b' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 24·24·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0·1·1·0·1·10·3 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 이 조각 = learners.entry_season 칸 하나(입학 시즌 키 · 소급 0 · CHECK 0 · 트리거 0 · 뷰 0 · 표 0). 테이블수·RLS·정책 전부 그대로(24·24·7).
-- ② 아래 기대 목록은 20260906000000 의 현행 그대로다 — CHECK 이름 변경 0(칸 하나만 더했다).
--    ⚠ 이 줄은 마지막 조각이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `season_no_overlap_c11`(EXCLUDE) · `…_once_c11`(UNIQUE) · `companion_qa_*_fkey` · `stt_raw_*` 는 여기
--      없다 — CHECK 가 아니라 이 줄의 대상이 아니고, 이름도 그대로 산다(값목록이 없어
--      판 판별과 무관하다 · 위 기대제약 목록에는 그 이름 그대로 들어 있다).
--    기대: attempts_gate_values_c16 · attempts_response_present_c16 · attempts_result_gate_c16
--         · attempts_ver_nonempty_c16 · batch_runs_counts_order_c16 · batch_runs_counts_pair_c16
--         · batch_runs_enrolled_nonneg_c16 · batch_runs_finished_cols_c16
--         · batch_runs_level_dist_ok_c16 · batch_runs_partial_pair_c16
--         · batch_runs_partial_range_c16 · batch_runs_roster_equation_c16
--         · batch_runs_skipped_range_c16 · batch_runs_ver_nonempty_c16 · broadcast_segment_kind_c16
--         · classes_key_nonblank_c16 · companion_qa_answer_paired_c16
--         · companion_qa_question_nonblank_c16 · corrections_promotion_intent_c16
--         · corrections_supersedes_not_self_c16 · corrections_verdict_c16 · cron_runs_outcome_c16
--         · jobs_anchor_present_c16 · jobs_claim_cols_c16 · jobs_deciding_pair_c16
--         · jobs_deciding_result_matches_c16 · jobs_deciding_scope_c16 · jobs_draft_present_c16
--         · jobs_idle_cols_c16 · jobs_load_failed_cols_c16 · jobs_nontarget_cols_c16
--         · jobs_nonterminal_cols_c16 · jobs_skill_ids_present_c16 · jobs_status_outcome_pairs_c16
--         · jobs_terminal_cols_c16 · jobs_ver_nonempty_c16 · jobs_winner_fence_current_c16
--         · jobs_winner_fence_pair_c16 · jobs_winner_only_success_c16 · jobs_winner_present_c16
--         · jobs_winner_result_only_success_c16 · jobs_winner_result_pair_c16
--         · l10n_reviews_final_paired_c16 · l10n_reviews_supersedes_not_self_c16
--         · l10n_reviews_verdict_c16 · l10n_strings_id_ascii_c16
--         · l10n_strings_ko_nonblank_c16 · l10n_strings_max_len_c16
--         · l10n_strings_status_c16 · learners_gender_c16
--         · learners_goal_track_c16 · learners_group_no_c16 · learners_home_aimag_c16
--         · learners_seat_no_c16 · learners_signup_attempts_nonneg_c16
--         · learners_temp_password_paired_c16 · learning_events_correction_target_c16
--         · learning_events_event_type_c16 · learning_events_task_type_c16
--         · pipeline_jobs_discard_reason_c16 · season_compass_answers_c16 · season_dates_c16
--         · season_review_decided_c16 · season_review_self_c16 · season_review_verdict_c16
--         · staff_role_c16 · submissions_due_paired_c16 · submissions_task_format_c16
--         · submissions_translation_source_c16 · teacher_notes_body_nonblank_c16
--         · teacher_notes_disposition_c16 · teacher_notes_origin_c16
