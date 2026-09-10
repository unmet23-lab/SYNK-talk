/* 교정 자동화 연결 — 기존 ops 회차 장부·Vault·처리 잡 재사용 (2026-09-11).
 * 야간 16:13 UTC(몽골 다음날 00:13): 완료 배치 회수 후 새 배치 최대 100건 제출.
 * 회수 전용: 매시 07/17/27/37/47/57분. 새 벤더 제출은 0이며 학생 데이터 쓰기는 완료 결과만.
 * 배달 16:05 UTC보다 뒤이므로 그 밤 새로 접수한 교정은 이미 배달한 과제를 소급 변경하지 않는다.
 * 원문/동의/학습 계약판(c16)/기존 5개 예약/AI 모델을 변경하지 않는다. 새 표·유일 제약도 없다.
 * pipeline_jobs의 nullable correction_batch_id는 내부 접수 영수증이다(외부 API 계약 불변).
 * 리허설처럼 기존 예약이 0인 환경에는 자동 예약을 만들지 않는다. 부분 등록 상태는 멈춘다.
 * 운영의 신규 2개 예약은 비활성으로 등록한다. 새 correct 배포·대조 뒤에만 두 잡을 활성화한다.
 * HTTP는 트랜잭션 commit 뒤 실행되는 pg_net 큐다. 이 조각 적용 자체는 교정을 호출하지 않는다.
 * 복구: 두 새 예약만 비활성화하고 이전 correct 배포로 되돌린다. 원문/이력은 삭제하지 않는다.
 */
begin;

do $migration$
declare
  migration_version constant text := '20260911070000';
  migration_name constant text := '20260911070000_correct_automation_c16.sql';
  expected_checksum constant text := 'cb9d8c7d3b254ac4cf2702ffadcf03dc5952e59ab5fc3485e0a38d4807794da8'; -- migration-checksum
  base_version constant text := '20260907200000';
  recorded_checksum text;
  previous_jobs integer;
  active_jobs integer;
  target_url text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception '교정 자동화: 기준 이력 없음';
  end if;
  select checksum into recorded_checksum from engine.schema_migrations where version = migration_version;
  if found then
    if recorded_checksum is distinct from expected_checksum then
      raise exception '교정 자동화: 적용 이력 checksum 불일치';
    end if;
    return;
  end if;
  if not exists (select 1 from engine.schema_migrations where version = base_version) then
    raise exception '교정 자동화: 이전 c16 조각 미적용';
  end if;
  if to_regprocedure('ops.발사(text,text)') is null or to_regprocedure('ops.수확()') is null then
    raise exception '교정 자동화: 기존 ops 발사/수확 없음';
  end if;

  select count(*), count(*) filter (where active) into previous_jobs, active_jobs
    from cron.job where jobname in
      ('deliver-daily', 'deliver-check', 'transcribe-batch', 'radio-promote-hourly', 'ops-harvest');
  if previous_jobs not in (0, 5) or active_jobs <> previous_jobs then
    raise exception '교정 자동화: 기존 예약 부분 등록/비활성 상태';
  end if;
  if exists (select 1 from cron.job where jobname in ('correct-nightly', 'correct-collect')) then
    raise exception '교정 자동화: 같은 이름의 미등록 이력 예약 존재';
  end if;

  alter table engine.pipeline_jobs add column correction_batch_id text;
  comment on column engine.pipeline_jobs.correction_batch_id is
    '교정 내부 접수 영수증: null=미접수, submitting=접수 미확정(자동 재과금 금지), 그 외=벤더 batch ID. 학생 원문/공개 API에 노출하지 않는다.';

  /* 기존 두 인자 API를 유지한다. 교정에만 130초, 기존 잡은 종전 pg_net 기본값 5초.
   * 함수 전체 교체는 하나의 트랜잭션 안이다. 기존 ACL은 보존되며 새 자격증명은 만들지 않는다. */
  create or replace function ops.발사(p_job text, p_url text) returns bigint
  language plpgsql as $fn$
  declare rid bigint;
  begin
    select net.http_post(
      url := p_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
      body := '{}'::jsonb,
      timeout_milliseconds := case when p_job in ('correct-nightly', 'correct-collect') then 130000 else 5000 end)
      into rid;
    begin
      insert into ops.cron_runs(jobname, request_id, outcome) values (p_job, rid, '대기');
    exception when others then null;
    end;
    return rid;
  exception when others then
    insert into ops.cron_runs(jobname, request_id, outcome, error_msg)
      values (p_job, null, '발사실패', 'dispatch_failed:' || sqlstate);
    return null;
  end
  $fn$;

  if previous_jobs = 5 then
    select decrypted_secret into target_url from vault.decrypted_secrets where name = 'functions_base_url';
    if target_url is null or target_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1$'
       or not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key' and length(decrypted_secret) > 0) then
      raise exception '교정 자동화: 기존 Vault 설정 확인 필요';
    end if;
    perform cron.schedule('correct-nightly', '13 16 * * *', $job$
      select ops.발사('correct-nightly',
        (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/correct');
    $job$);
    perform cron.schedule('correct-collect', '7-57/10 * * * *', $job$
      select ops.발사('correct-collect',
        (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/correct?%ED%9A%8C%EC%88%98=1');
    $job$);
    perform cron.alter_job(job_id := jobid, active := false)
      from cron.job where jobname in ('correct-nightly', 'correct-collect');
  end if;

  insert into engine.schema_migrations(version, name, checksum)
    values (migration_version, migration_name, expected_checksum);
end
$migration$;
commit;

-- 확인 (한 번에) — c16 구조에 내부 접수 영수증 1칸과 최신 이력/체크섬을 확인한다.
/*
with 기대열(t, c) as (values
  ('pipeline_jobs','correction_batch_id'),
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
select case when 테이블수=25 and RLS켜짐=25 and 정책수=7
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
              and (select version from 현재이력)='20260911070000'
              and (select checksum from 현재이력)='cb9d8c7d3b254ac4cf2702ffadcf03dc5952e59ab5fc3485e0a38d4807794da8' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 25·25·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0·1·1·0·1·10·3 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 이 조각 = pipeline_jobs 내부 접수 영수증 1칸 + 기존 ops 함수 갱신 + 신규 교정 예약 2개 비활성 등록.
-- ② 아래 CHECK 기대 목록은 직전 c16 그대로다 — CHECK 이름 변경 0.
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
