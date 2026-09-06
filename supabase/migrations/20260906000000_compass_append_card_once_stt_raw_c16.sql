/* 철학 심문(4·5회차)이 잡은 소급 불가 셋 — 나침반 덧붙임 · 확인 답 «하루 두 장» · STT 원신호 불변 보관 (2026-09-06)
 *
 * ■ 셋 다 「첫 학생 뒤엔 되살릴 수 없는」 자리다(철학 v1.21~v1.24 · 발전안 §6-3·§6-4·§6-5).
 *
 * ① 나침반 뿌리 문항 «덧붙임» — season_compass_answers_c16 의 시즌 회차 규칙을 넓힌다.
 *    옛 규칙: 시즌 행의 키 집합은 정확히 {self_in_5y, season_goal}. 그래서 학생이 시즌 회고에서 「왜 배우나」·
 *    「토픽 쓸 곳」을 「바꿀래」 해도 실을 칸이 없었다(철학 Ⅱ-4 v1.21 · 유호 확정 09-06 「자동으로 다시 묻지 않되
 *    「바꿀래」를 누르면 새 답을 덧붙인다 · 옛 답은 남긴다」). 새 규칙: 시즌 행은 둘이 필수이고 why_learning·topik_use 는
 *    «있어도 되는» 키다. 입학 행 규칙은 그대로(넷 정확히). 옛 답은 입학 행에 그대로 산다 — 시즌마다 새 행 · 덮어쓰기 없음.
 *    이름은 그대로 `_c16` 이다 — 계약판이 안 올랐다(값목록이 아니라 «허용 범위»만 넓혔다 · 접미는 판을 말한다).
 *    JS 쪽 같은 판정 = lib/나침반문항.js 답검사(허용키) · 회귀 tests/나침반덧붙임.test.js 가 두 층을 대조한다.
 *
 * ② 확인 답 «하루 두 장» — estimate_daily_once_c13(learner × 몽골 날짜) → estimate_card_once_c16(learner × 날짜 × shown_key).
 *    철학 Ⅱ-8(v1.22) 「맞아? 카드 하루 두 장」인데 물리 방벽이 하루 1행이라 둘째 카드의 답이 duplicate 로 접혀 버려졌다
 *    (4회차 심문 A1 · «재전송»과 «새 답»을 못 갈랐다). 같은 카드(shown_key)의 재전송은 여전히 duplicate 로 접힌다.
 *    functions/events 는 두 이름을 다 duplicate 로 읽고, functions/progress 는 오늘 답한 카드를 둘째 장 후보에서 뺀다.
 *
 * ③ STT 원신호 불변 보관 — engine.stt_raw(append-only). submissions.stt_segments 는 재전사가 덮을 수 있는 «최신 판»이고,
 *    여기 남는 것은 벤더 응답 그대로다(철학 A-1 v1.23 「원신호도 음성 원본도 안에서 버리지 않는다」 · 4회차 G3 · 5회차 G1).
 *    모델이 바뀌어 다시 채점할 사슬은 원본이 있어야 산다. 쓰는 자리는 functions/transcribe 하나(전사 UPDATE 뒤 INSERT 한 문장).
 *    학생 식별자 0(event_id 만 · 원문 텍스트는 벤더 응답 안에 있으므로 RLS 켜고 정책 0 = 서비스 역할만).
 *
 * ■ 되돌림: alter table engine.season_compass drop constraint season_compass_answers_c16, add constraint … (20260902100000 본문);
 *          drop index if exists engine.estimate_card_once_c16; create unique index estimate_daily_once_c13 … (20260824090000 본문);
 *          drop table if exists engine.stt_raw; delete from engine.schema_migrations where version='20260906000000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260906000000';
  migration_name constant text := '20260906000000_compass_append_card_once_stt_raw_c16.sql';
  expected_checksum constant text := 'a5be782a9a734d541260922ed079b3d152c2e7e6a835f11c3474824427221a52'; -- migration-checksum
  base_version constant text := '20260903000000';   -- 체인은 «바로 앞 조각»을 가리킨다
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
      '이 조각은 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;
end
$migration$;

-- ══════════ ① 나침반 뿌리 문항 덧붙임 — 시즌 행이 why_learning·topik_use 를 «실을 수» 있다 ══════════
-- 🔑 필수는 그대로 둘(self_in_5y·season_goal) · 덧붙임 둘은 있어도 되고 없어도 된다 · 그 밖의 키는 여전히 거절.
alter table engine.season_compass
  drop constraint if exists season_compass_answers_c16,
  add constraint season_compass_answers_c16 check (
    (
      self_in_5y_changed is null
      and answers ?& array['why_learning', 'self_in_5y', 'topik_use', 'season_goal']
      and answers - array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] = '{}'::jsonb
    ) or (
      self_in_5y_changed is not null
      and answers ?& array['self_in_5y', 'season_goal']
      and answers - array['self_in_5y', 'season_goal', 'why_learning', 'topik_use'] = '{}'::jsonb
    )
  );

comment on constraint season_compass_answers_c16 on engine.season_compass is
  '입학 행 = 넷 정확히 · 시즌 행 = 둘 필수 + 뿌리 둘(why_learning·topik_use) 덧붙임 허용(09-06 · 철학 Ⅱ-4 v1.21 「바꿀래」). 옛 답은 입학 행에 그대로.';

-- ══════════ ② 확인 답 «하루 두 장» — 카드(shown_key)마다 하루 1행 ══════════
drop index if exists engine.estimate_daily_once_c13;
create unique index if not exists estimate_card_once_c16
  on engine.learning_events (learner_id, engine.ub_date(ingested_at), (payload->>'shown_key'))
  where event_type = 'estimate.responded';

-- ══════════ ③ STT 원신호 불변 보관 ══════════
create table if not exists engine.stt_raw (
  raw_id          bigint generated always as identity primary key,
  event_id        uuid not null references engine.learning_events(event_id) on delete restrict,   -- 제출 사건(submissions.event_id 와 같은 값 · 유일키는 사건 표가 쥔다)
  stt_model       text,
  stt_lang        text,
  vendor_response jsonb not null,
  recorded_at     timestamptz not null default now()
);
comment on table engine.stt_raw is
  'STT 벤더 응답 원본 — append-only · 재전사가 submissions.stt_segments 를 덮어도 여기 원신호는 남는다(철학 A-1 v1.23 · 09-06). 학생 식별자 0(event_id 만).';
create index if not exists stt_raw_event on engine.stt_raw (event_id, recorded_at desc);
alter table engine.stt_raw enable row level security;   -- 정책 0 = 서비스 역할만 읽고 쓴다

create or replace function engine.stt_raw_protect() returns trigger
  language plpgsql as $protect$
begin
  raise exception 'stt_raw 는 덧붙이기만 한다 — 원신호는 고치지도 지우지도 않는다(철학 A-1)';
end
$protect$;
drop trigger if exists stt_raw_protect on engine.stt_raw;
create trigger stt_raw_protect
  before update or delete on engine.stt_raw
  for each row execute function engine.stt_raw_protect();

do $migration2$
declare
  expected_checksum constant text := 'a5be782a9a734d541260922ed079b3d152c2e7e6a835f11c3474824427221a52'; -- migration-checksum
begin
  if not exists (select 1 from engine.schema_migrations where version = '20260906000000') then
    insert into engine.schema_migrations(version, name, checksum)
    values ('20260906000000', '20260906000000_compass_append_card_once_stt_raw_c16.sql', expected_checksum);
  end if;
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
              and (select version from 현재이력)='20260906000000'
              and (select checksum from 현재이력)='a5be782a9a734d541260922ed079b3d152c2e7e6a835f11c3474824427221a52' -- migration-checksum
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
-- ① 이 조각 = 나침반 덧붙임(CHECK 몸만 · 이름 그대로) + 확인 답 카드 유일 색인(옛 색인 drop) + stt_raw 표 하나(RLS 켜짐 · 정책 0 · 트리거 하나).
-- ② 아래 기대 목록은 20260903000000 의 현행 그대로다 — CHECK 이름은 변경 0(season_compass_answers_c16 은 몸만 넓혔다).
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
