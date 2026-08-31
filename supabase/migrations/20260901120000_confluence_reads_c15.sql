/* 세 층 합류 — 읽기 기록(reads) c15 (세층합류_설계_v1 §3·§10-1 · 유호 채택·위임 09-01)
 *
 * ■ 무엇 —
 *   ① **살아 있는 CHECK 72개를 `_c14`→`_c15` 이름째 교체**(c12~c14 방식 그대로 — 접미를 안 갈면
 *      「c15 계약 + c14 물리」가 초록으로 보인다). 이번 판은 **값이 는 CHECK 0** — 어휘가 는 곳은
 *      payload(자유 jsonb)와 계약 파일 층이다: payload_허용필드 +4(reads·evidence_text·
 *      confirm_status·hw_ref) · 값목록 +1(확인상태) — DDL 값목록 무접촉.
 *   ② `engine.jobs_load` 재정의 — `draft허용` 에 'reads'(널허용 · ⓒ-13 필수 다섯은 그대로).
 *   ③ `engine.jobs_finalize_due` 재정의 — 스윕 착지의 task_assigned payload 에 draft.reads 합류
 *      (정상·폴백·구제 경로는 lib/착지봉투 가 같은 규칙으로 싣는다 — 두 층이 한 규칙).
 * ■ 왜 — 과제 한 장이 세 층(㉠실력·㉡사람·㉢삶)에서 무엇을 읽었는지의 «증거»가 행에 없었다.
 *   읽기는 기록 없이는 없다(세층합류 §1 네 기둥 — 배포≠반영과 같은 원리). 새 테이블 0 ·
 *   새 사건 0 · 새 열 0 — 기존 사건 payload 확장뿐(불변식 6 그대로).
 * ■ 파일 이름의 _c15 — Edge Function 이 계약판을 최신 `_c<숫자>` 이름에서 읽는다(판 올림).
 *   c15 를 모르는 앱(c14 이하 선언)은 그대로 동작한다 — 서버가 더 새 판인 것은 막지 않는다.
 *
 * 되돌림: 72개를 _c14 본문으로 다시 add · jobs_load/jobs_finalize_due 를 20260901010000 시점
 *         본문으로 재정의 · delete from engine.schema_migrations where version='20260901120000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260901120000';
  migration_name constant text := '20260901120000_confluence_reads_c15.sql';
  expected_checksum constant text := 'a3a335fc5194962c2c4ac79ae801e2d54a7e5ec235b8cecc29ba5d58ebc05e4c'; -- migration-checksum
  base_version constant text := '20260901010000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c14 위에서만 돈다 — engine.schema_migrations 가 없다(빈 DB 면 합본을 처음부터 부어라)';
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
end
$migration$;

-- 살아 있는 CHECK 72개 — c14 본문 그대로 이름만 c15(이번 판은 값이 는 CHECK 0 — 어휘는 payload·계약 층).
alter table engine.generation_attempts
  drop constraint if exists attempts_gate_values_c14,
  add constraint attempts_gate_values_c15 check ( gate_failed_reasons is null or gate_failed_reasons <@ array[ '길이','한국어비율','빈출력','금칙서식','질문형태','식별자역유입','중복']::text[] );

alter table engine.generation_attempts
  drop constraint if exists attempts_response_present_c14,
  add constraint attempts_response_present_c15 check ( result is null or result not in ('성공','검문탈락','응답파손','응답초과') or (raw_response is not null and responded_at is not null) );

alter table engine.generation_attempts
  drop constraint if exists attempts_result_gate_c14,
  add constraint attempts_result_gate_c15 check ( case when result = '검문탈락' then gate_failed_reasons is not null and cardinality(gate_failed_reasons) >= 1 else gate_failed_reasons is null end );

alter table engine.generation_attempts
  drop constraint if exists attempts_ver_nonempty_c14,
  add constraint attempts_ver_nonempty_c15 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_counts_order_c14,
  add constraint batch_runs_counts_order_c15 check ( target_count is null or (target_count >= 0 and loaded_count <= enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_counts_pair_c14,
  add constraint batch_runs_counts_pair_c15 check ((target_count is null) = (loaded_count is null));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_enrolled_nonneg_c14,
  add constraint batch_runs_enrolled_nonneg_c15 check (enrolled_count >= 0);

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_finished_cols_c14,
  add constraint batch_runs_finished_cols_c15 check ( finished_at is null or (target_count is not null and loaded_count is not null and partial_count is not null and skipped_game_count is not null and skipped_existing_count is not null) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_level_dist_ok_c14,
  add constraint batch_runs_level_dist_ok_c15 check (engine.level_dist_ok(level_distribution, enrolled_count));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_partial_pair_c14,
  add constraint batch_runs_partial_pair_c15 check ((partial_count is null) = (loaded_count is null));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_partial_range_c14,
  add constraint batch_runs_partial_range_c15 check ( partial_count is null or (partial_count >= 0 and partial_count <= enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_roster_equation_c14,
  add constraint batch_runs_roster_equation_c15 check ( finished_at is null or run_kind <> '배치' or (loaded_count + skipped_game_count + skipped_existing_count = enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_skipped_range_c14,
  add constraint batch_runs_skipped_range_c15 check ( (skipped_game_count is null or (skipped_game_count >= 0 and skipped_game_count <= enrolled_count)) and (skipped_existing_count is null or (skipped_existing_count >= 0 and skipped_existing_count <= enrolled_count)) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_ver_nonempty_c14,
  add constraint batch_runs_ver_nonempty_c15 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table radio.broadcast_segment
  drop constraint if exists broadcast_segment_kind_c14,
  add constraint broadcast_segment_kind_c15 check (kind in ('radio_loop', 'live_lecture', 'asmr_mode', 'other'));

alter table engine.classes
  drop constraint if exists classes_key_nonblank_c14,
  add constraint classes_key_nonblank_c15 check (btrim(class_key) <> '');

alter table engine.companion_qa
  drop constraint if exists companion_qa_answer_paired_c14,
  add constraint companion_qa_answer_paired_c15 check (handoff or btrim(answer) <> '');

alter table engine.companion_qa
  drop constraint if exists companion_qa_question_nonblank_c14,
  add constraint companion_qa_question_nonblank_c15 check (btrim(question) <> '');

alter table engine.corrections
  drop constraint if exists corrections_promotion_intent_c14,
  add constraint corrections_promotion_intent_c15 check (promotion_intent = false or actor_kind = 'teacher');

alter table engine.corrections
  drop constraint if exists corrections_supersedes_not_self_c14,
  add constraint corrections_supersedes_not_self_c15 check (supersedes is null or supersedes <> correction_id);

alter table engine.corrections
  drop constraint if exists corrections_verdict_c14,
  add constraint corrections_verdict_c15 check (verdict is null or verdict in ( 'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다' ));

alter table ops.cron_runs
  drop constraint if exists cron_runs_outcome_c14,
  add constraint cron_runs_outcome_c15 check (outcome in ('대기', '성공', '실패', '타임아웃', '전송오류', '상태없음', '유실', '발사실패'));

alter table engine.generation_jobs
  drop constraint if exists jobs_anchor_present_c14,
  add constraint jobs_anchor_present_c15 check ( status not in ('착지','마감폴백','대상아님') or assigned_event_id is not null );

alter table engine.generation_jobs
  drop constraint if exists jobs_claim_cols_c14,
  add constraint jobs_claim_cols_c15 check (status <> 'claimed' or (owner is not null and lease_until is not null));

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_pair_c14,
  add constraint jobs_deciding_pair_c15 check ((deciding_attempt_id is null) = (deciding_result is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_result_matches_c14,
  add constraint jobs_deciding_result_matches_c15 check (deciding_result is null or deciding_result = outcome);

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_scope_c14,
  add constraint jobs_deciding_scope_c15 check ( case when outcome is null then deciding_attempt_id is null when outcome in ('검문탈락','타임아웃','벤더오류','응답파손','입력초과','응답초과') then deciding_attempt_id is not null else deciding_attempt_id is null end );

alter table engine.generation_jobs
  drop constraint if exists jobs_draft_present_c14,
  add constraint jobs_draft_present_c15 check (status = '적재실패' or event_draft is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_idle_cols_c14,
  add constraint jobs_idle_cols_c15 check (status <> '대기' or (owner is null and lease_until is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_load_failed_cols_c14,
  add constraint jobs_load_failed_cols_c15 check ( status <> '적재실패' or (outcome = '내부오류' and assigned_event_id is null and event_draft is null and load_error is not null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_nontarget_cols_c14,
  add constraint jobs_nontarget_cols_c15 check (status <> '대상아님' or not_target_reason is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_nonterminal_cols_c14,
  add constraint jobs_nonterminal_cols_c15 check ( status in ('착지','마감폴백','대상아님','적재실패') or (outcome is null and closed_at is null and assigned_event_id is null and winning_attempt_id is null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_skill_ids_present_c14,
  add constraint jobs_skill_ids_present_c15 check ( status = '적재실패' or not_target_reason is not null or cardinality(skill_ids) between 1 and 2 );

alter table engine.generation_jobs
  drop constraint if exists jobs_status_outcome_pairs_c14,
  add constraint jobs_status_outcome_pairs_c15 check ( case status when '대상아님' then outcome = '대상아님' when '마감폴백' then outcome = '예산소진' when '적재실패' then outcome = '내부오류' when '착지' then outcome is null or outcome not in ('대상아님','예산소진') else true end );

alter table engine.generation_jobs
  drop constraint if exists jobs_terminal_cols_c14,
  add constraint jobs_terminal_cols_c15 check ( status not in ('착지','마감폴백','대상아님','적재실패') or (outcome is not null and closed_at is not null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_ver_nonempty_c14,
  add constraint jobs_ver_nonempty_c15 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_fence_current_c14,
  add constraint jobs_winner_fence_current_c15 check (winning_fence is null or winning_fence = fence);

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_fence_pair_c14,
  add constraint jobs_winner_fence_pair_c15 check ((winning_attempt_id is null) = (winning_fence is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_only_success_c14,
  add constraint jobs_winner_only_success_c15 check (winning_attempt_id is null or outcome = '성공');

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_present_c14,
  add constraint jobs_winner_present_c15 check (outcome <> '성공' or winning_attempt_id is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_result_only_success_c14,
  add constraint jobs_winner_result_only_success_c15 check (winning_result is null or winning_result = '성공');

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_result_pair_c14,
  add constraint jobs_winner_result_pair_c15 check ((winning_attempt_id is null) = (winning_result is null));

alter table engine.l10n_reviews
  drop constraint if exists l10n_reviews_final_paired_c14,
  add constraint l10n_reviews_final_paired_c15 check (
      (verdict = '원문을 고쳐야 한다' and final_mn is null)
      or (verdict <> '원문을 고쳐야 한다' and btrim(coalesce(final_mn, '')) <> '')
    );

alter table engine.l10n_reviews
  drop constraint if exists l10n_reviews_supersedes_not_self_c14,
  add constraint l10n_reviews_supersedes_not_self_c15 check (supersedes is distinct from review_id);

alter table engine.l10n_reviews
  drop constraint if exists l10n_reviews_verdict_c14,
  add constraint l10n_reviews_verdict_c15 check (verdict in ('초벌이 맞다', '고쳤다', '원문을 고쳐야 한다'));

alter table engine.l10n_strings
  drop constraint if exists l10n_strings_id_ascii_c14,
  add constraint l10n_strings_id_ascii_c15 check (string_id ~ '^[a-z0-9]+([._-][a-z0-9]+)+$');

alter table engine.l10n_strings
  drop constraint if exists l10n_strings_ko_nonblank_c14,
  add constraint l10n_strings_ko_nonblank_c15 check (btrim(source_ko) <> '');

alter table engine.l10n_strings
  drop constraint if exists l10n_strings_max_len_c14,
  add constraint l10n_strings_max_len_c15 check (max_len is null or max_len between 1 and 4000);

alter table engine.l10n_strings
  drop constraint if exists l10n_strings_status_c14,
  add constraint l10n_strings_status_c15 check (status in ('pending', 'verified', 'discarded'));

alter table engine.learners
  drop constraint if exists learners_gender_c14,
  add constraint learners_gender_c15 check (gender is null or gender in ('female', 'male', 'undisclosed'));

alter table engine.learners
  drop constraint if exists learners_goal_track_c14,
  add constraint learners_goal_track_c15 check (goal_track is null or goal_track in ('study', 'work', 'culture'));

alter table engine.learners
  drop constraint if exists learners_group_no_c14,
  add constraint learners_group_no_c15 check (group_no between 1 and 20);

alter table engine.learners
  drop constraint if exists learners_home_aimag_c14,
  add constraint learners_home_aimag_c15 check (home_aimag is null or home_aimag in ( 'ulaanbaatar', 'arkhangai', 'bayan-olgii', 'bayankhongor', 'bulgan', 'darkhan-uul', 'dornod', 'dornogovi', 'dundgovi', 'govi-altai', 'govisumber', 'khentii', 'khovd', 'khovsgol', 'omnogovi', 'orkhon', 'ovorkhangai', 'selenge', 'sukhbaatar', 'tov', 'uvs', 'zavkhan'));

alter table engine.learners
  drop constraint if exists learners_seat_no_c14,
  add constraint learners_seat_no_c15 check (seat_no between 1 and 20);

alter table engine.learners
  drop constraint if exists learners_signup_attempts_nonneg_c14,
  add constraint learners_signup_attempts_nonneg_c15 check (signup_attempts >= 0);

alter table engine.learners
  drop constraint if exists learners_temp_password_paired_c14,
  add constraint learners_temp_password_paired_c15 check (temp_password_hash is null or temp_password_expires_at is not null);

alter table engine.learning_events
  drop constraint if exists learning_events_correction_target_c14,
  add constraint learning_events_correction_target_c15 check ( case when event_type in ('correction.viewed', 'correction.responded') then correction_id is not null else correction_id is null end );

alter table engine.learning_events
  drop constraint if exists learning_events_event_type_c14,
  add constraint learning_events_event_type_c15 check (event_type in (
    'submission.created', 'quiz.answered', 'choice.selected', 'correction.responded', 'correction.viewed', 'preference.stated', 'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
    'task.assigned', 'exam.result', 'content.viewed', 'affect.reported',
    'estimate.responded', 'goal.responded', 'observation.noted'
  ));

alter table engine.learning_events
  drop constraint if exists learning_events_task_type_c14,
  add constraint learning_events_task_type_c15 check (task_type is null or task_type in ( '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화', '라디오퀴즈', '목표선언', '자습체크인' ));

alter table engine.pipeline_jobs
  drop constraint if exists pipeline_jobs_discard_reason_c14,
  add constraint pipeline_jobs_discard_reason_c15 check (discard_reason is null or (status = 'discarded' and discard_reason in ('무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가')));

alter table engine.season_compass
  drop constraint if exists season_compass_answers_c14,
  add constraint season_compass_answers_c15 check ( ( self_in_5y_changed is null and answers ?& array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] and answers - array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] = '{}'::jsonb ) or ( self_in_5y_changed is not null and answers ?& array['self_in_5y', 'season_goal'] and answers - array['self_in_5y', 'season_goal'] = '{}'::jsonb ) );

alter table engine.season
  drop constraint if exists season_dates_c14,
  add constraint season_dates_c15 check (ends_on is null or ends_on >= starts_on);

alter table engine.season_review
  drop constraint if exists season_review_decided_c14,
  add constraint season_review_decided_c15 check ( (verdict is null and note is null and decided_by is null and decided_at is null) or (verdict is not null and decided_by is not null and decided_at is not null and note is not null and btrim(note) <> '') );

alter table engine.season_review
  drop constraint if exists season_review_self_c14,
  add constraint season_review_self_c15 check (verdict_by_self is null or verdict_by_self in ('closer', 'same', 'redirected'));

alter table engine.season_review
  drop constraint if exists season_review_verdict_c14,
  add constraint season_review_verdict_c15 check (verdict is null or verdict in ('closer', 'same', 'redirected'));

alter table engine.staff
  drop constraint if exists staff_role_c14,
  add constraint staff_role_c15 check (role in ('teacher', 'inspector', 'director', 'l10n_reviewer'));

alter table engine.submissions
  drop constraint if exists submissions_due_paired_c14,
  add constraint submissions_due_paired_c15 check ( (due_at is null) = (due_ver is null) );

alter table engine.submissions
  drop constraint if exists submissions_task_format_c14,
  add constraint submissions_task_format_c15 check (task_format is null or task_format in ( '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역' ));

alter table engine.submissions
  drop constraint if exists submissions_translation_source_c14,
  add constraint submissions_translation_source_c15 check ( task_format is distinct from '번역' or nullif(btrim(task_snapshot->>'mn'), '') is not null );

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_body_nonblank_c14,
  add constraint teacher_notes_body_nonblank_c15 check (btrim(body) <> '');

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_disposition_c14,
  add constraint teacher_notes_disposition_c15 check (disposition in ('confirmed', 'retry'));

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_origin_c14,
  add constraint teacher_notes_origin_c15 check (origin in ('as_is', 'edited', 'written'));


-- ── c15 함수 재정의 둘 — reads 를 나르는 두 통로(적재 허용 · 스윕 합류) ──────
create or replace function engine.jobs_load(
  _assign_date date, _run_id uuid, _targets jsonb, _skipped_game uuid[] default '{}')
  returns jsonb
  language plpgsql security definer set search_path = engine, public as $function$
declare
  run engine.generation_batch_runs%rowtype;
  t jsonb;
  bs jsonb;
  draft jsonb;
  lvl text;
  실패 boolean;
  실패사유 text;
  새행 engine.generation_jobs%rowtype;
  기존 engine.generation_jobs%rowtype;
  created int := 0; existing int := 0; partial int := 0;
  대상수 int; 만든수 int;
  명단 text[];
  해시 text;
  기존사건 record;
  결손 boolean;
  게임행 boolean;
  fin record;
  draft키들 constant text[] := array['task_ref','task_snapshot','estimator_version','estimator_confidence','evidence_refs'];
  draft허용 constant text[] := array['task_ref','task_snapshot','estimator_version','estimator_confidence','evidence_refs','요약','reads'];  -- reads = c15(세층합류 §3 · 널허용 — 옛 draft·재적재 경로 호환)
  dk text;
begin
  select * into run from engine.generation_batch_runs where run_id = _run_id;
  if not found or run.assign_date <> _assign_date then
    raise exception 'jobs_load: _run_id 가 그 날짜의 시작 행이 아니다(A1 — 날짜 결속)';
  end if;
  if _targets is null or jsonb_typeof(_targets) <> 'array' then
    raise exception 'jobs_load: _targets 는 배열이어야 한다';
  end if;

  for t in select * from jsonb_array_elements(_targets) loop
    실패 := false; 실패사유 := null;
    bs := t -> 'branch_snapshot';
    draft := t -> 'event_draft';

    if t ->> 'load_error' is not null then
      실패 := true; 실패사유 := left(t ->> 'load_error', 200);
    else
      -- A8 — branch_snapshot 스키마·의미 검사(적재가 유일한 검사 기회다).
      if bs is null or jsonb_typeof(bs) <> 'object'
         or (bs ->> 'ver') is null or jsonb_typeof(bs -> 'ver') <> 'number'
         or jsonb_typeof(bs -> 'is_first_day') <> 'boolean'
         or jsonb_typeof(bs -> 'is_game_day') <> 'boolean' then
        raise exception 'jobs_load: branch_snapshot 스키마 위반(A8) — learner %', t ->> 'learner_id';
      end if;
      if exists (select 1 from jsonb_object_keys(bs) k
                  where k not in ('ver','is_first_day','correction_ref','is_game_day','level','goal')) then
        raise exception 'jobs_load: branch_snapshot 에 모르는 키(A8 — 임의 jsonb 로 되돌아간다) — learner %', t ->> 'learner_id';
      end if;
      if (bs ->> 'is_game_day')::boolean then
        raise exception 'jobs_load: is_game_day=true 원소(A11 ① — 게임날은 job 자체를 안 만든다) — learner %', t ->> 'learner_id';
      end if;
      -- ② 교정문 사유 ↔ correction_ref 는 «쌍»이다(xor 면 어긋남). 대상 원소(사유 null)에
      --    ref 가 남는 것도 어긋남이다 — 갈래판정 우선순위상 교정문이 있으면 ②갈래로 빠졌어야 한다.
      if ((t ->> 'not_target_reason') = '교정문') <> ((bs ->> 'correction_ref') is not null) then
        raise exception 'jobs_load: 교정문 사유 ↔ correction_ref 어긋남(A11 ②) — learner %', t ->> 'learner_id';
      end if;
      if (bs ->> 'is_first_day')::boolean and coalesce(t ->> 'not_target_reason', '') <> '첫날' then
        raise exception 'jobs_load: is_first_day=true 인데 사유가 첫날이 아니다(A11 ③) — learner %', t ->> 'learner_id';
      end if;
      if (t ->> 'not_target_reason') = '첫날' and not (bs ->> 'is_first_day')::boolean then
        raise exception 'jobs_load: 사유는 첫날인데 스냅샷은 아니다(A11 ④ 거울) — learner %', t ->> 'learner_id';
      end if;
      lvl := bs ->> 'level';
      if lvl is not null and lvl not in ('Lv1','Lv2','Lv3','Lv4','Lv5','Lv6') then
        raise exception 'jobs_load: level 값목록 밖(A11 ⑤ — 실물 값은 Lv3 이지 3급이 아니다) — %', lvl;
      end if;
      if (t ->> 'not_target_reason') = '초급' and (lvl is null or lvl not in ('Lv1','Lv2'))
         or (t ->> 'not_target_reason') = '미정' and lvl is not null then
        raise exception 'jobs_load: 초급·미정 사유 ↔ level 정합 위반(A11 ⑥) — learner %', t ->> 'learner_id';
      end if;
      -- ⑦ skill_ids 존재 대조(§6-0 — 없는 ID 는 적재에서 거절 · 빈 배열 면제).
      if exists (
        select 1 from jsonb_array_elements_text(coalesce(t -> 'skill_ids', '[]'::jsonb)) s(id)
        where not exists (select 1 from engine.skills sk where sk.skill_id = s.id)
      ) then
        raise exception 'jobs_load: skill_ids 에 engine.skills 에 없는 ID(A11 ⑦) — learner %', t ->> 'learner_id';
      end if;
      -- 갈래 20 — 대상인데 기술선택이 빈 배열이면 그 원소만 적재실패(전량 롤백이 아니다).
      if (t ->> 'not_target_reason') is null
         and jsonb_array_length(coalesce(t -> 'skill_ids', '[]'::jsonb)) = 0 then
        실패 := true; 실패사유 := '기술선택 0건 — 시드 확인';
      end if;
      -- ⓒ-13 — event_draft 독립 스키마(다섯 키 필수 · 미지 키 거절 · 결속).
      if not 실패 then
        if draft is null or jsonb_typeof(draft) <> 'object' then
          실패 := true; 실패사유 := 'event_draft 없음(C1 전량)';
        else
          foreach dk in array draft키들 loop
            if not draft ? dk then
              실패 := true; 실패사유 := 'event_draft 필수 키 누락: ' || dk;
            end if;
          end loop;
          if not 실패 and exists (
            select 1 from jsonb_object_keys(draft) k where k <> all(draft허용)) then
            실패 := true; 실패사유 := 'event_draft 미지 키(ⓒ-13 — degraded 가 이 문으로 되돌아온다)';
          end if;
          -- v5.13-a — 생성 «대상» 원소는 §6-2 요약 문자열까지 여섯(D2 수거 · 워커는 렌더만).
          if not 실패 and (t ->> 'not_target_reason') is null
             and nullif(btrim(coalesce(draft ->> '요약', '')), '') is null then
            실패 := true; 실패사유 := 'event_draft 요약 누락 — 생성 대상은 §6-2 요약이 필수다(v5.13-a)';
          end if;
          if not 실패 and (draft ->> 'task_ref') is distinct from ('task-' || _assign_date) then
            실패 := true; 실패사유 := 'event_draft 결속 위반 — task_ref 날짜(A7 ②)';
          end if;
          if not 실패 and not exists (
            select 1 from jsonb_array_elements(draft -> 'task_snapshot' -> '호흡') h
             where (h ->> '차례')::int = 3) then
            실패 := true; 실패사유 := 'event_draft 호흡에 ③답하기 행이 없다(ⓒ-13)';
          end if;
        end if;
      end if;
    end if;

    -- 기존 사건 경합 + C5 결손 검사(v5.5 B4 · v5.7 B5 ⓐⓑⓒ).
    select e.event_id, e.task_type, e.intervention_id into 기존사건
      from engine.learning_events e
     where e.learner_id = (t ->> 'learner_id')::uuid
       and e.event_type = 'task.assigned'
       and e.idempotency_key = 'task:' || (t ->> 'learner_id') || ':' || _assign_date
     order by e.occurred_at limit 1;
    if found then
      /* C5 결손을 두 축으로 가른다 — 게임날(ⓐ∧ⓑ∧ⓒ)의 정상 모양은 「개입 없음 + submissions
       * 있음」(§3-6 ⓪)이라, 개입 부재만 게임이 면제하고 제출 보조행 부재는 어느 날이든 결손이다. */
      게임행 := run.calendar_game_day
        and not exists (select 1 from engine.generation_jobs g
                         where g.learner_id = (t ->> 'learner_id')::uuid and g.assign_date = _assign_date)
        and 기존사건.task_type = '숙제제출';
      결손 := not exists (select 1 from engine.submissions s where s.event_id = 기존사건.event_id)
        or (not 게임행
            and (기존사건.intervention_id is null or not exists (
              select 1 from engine.learning_events e2
               where e2.intervention_id = 기존사건.intervention_id
                 and e2.event_type = 'intervention.delivered')));
      if 결손 then
        partial := partial + 1;
      else
        existing := existing + 1;
      end if;
      continue;   -- 기존 사건이 있으면 job 을 새로 안 만든다(C5).
    end if;

    -- 유일키 충돌 — 기존 행 무변경(A6 · 첫 적재가 정본) · 적재실패+draft 면 되살린다(B4).
    select * into 기존 from engine.generation_jobs g
     where g.learner_id = (t ->> 'learner_id')::uuid and g.assign_date = _assign_date;
    if found then
      if 기존.status = '적재실패' and not 실패 and draft is not null then
        update engine.generation_jobs
           set status = '대기', outcome = null, closed_at = null,
               branch_snapshot = bs, event_draft = draft,
               snapshot_as_of = run.snapshot_as_of,
               skill_ids = coalesce((select array_agg(x) from jsonb_array_elements_text(t -> 'skill_ids') x), '{}'),
               skill_taxonomy_ver = run.skill_taxonomy_ver,
               model = run.model, prompt_ver = run.prompt_ver, policy_ver = run.policy_ver,
               estimator_version = run.estimator_version, schema_ver = run.schema_ver,
               batch_run_id = _run_id,
               load_retry_count = 기존.load_retry_count + 1
         where generation_jobs.job_id = 기존.job_id;
        created := created + 1;   -- 되돌린 건은 created 로 센다(B4 — 재실행이 실제로 큐를 세웠다).
      else
        existing := existing + 1;
      end if;
      continue;
    end if;

    insert into engine.generation_jobs (
      learner_id, assign_date, batch_run_id, status, snapshot_as_of,
      branch_snapshot, skill_ids, skill_taxonomy_ver, not_target_reason,
      event_draft, load_error, load_failed_at, load_fail_run_id, load_retry_count,
      model, prompt_ver, policy_ver, estimator_version, schema_ver,
      outcome, closed_at)
    values (
      (t ->> 'learner_id')::uuid, _assign_date, _run_id,
      case when 실패 then '적재실패' else '대기' end,
      run.snapshot_as_of,
      case when 실패 then coalesce(bs, '{"ver":1}'::jsonb) else bs end,
      case when 실패 then '{}'::text[]
           else coalesce((select array_agg(x) from jsonb_array_elements_text(t -> 'skill_ids') x), '{}') end,
      run.skill_taxonomy_ver,
      t ->> 'not_target_reason',
      case when 실패 then null else draft end,
      case when 실패 then 실패사유 else null end,
      case when 실패 then now() else null end,
      case when 실패 then _run_id else null end,
      0,
      run.model, run.prompt_ver, run.policy_ver, run.estimator_version, run.schema_ver,
      case when 실패 then '내부오류' else null end,
      case when 실패 then now() else null end)
    returning * into 새행;
    created := created + 1;

    -- 비대상은 같은 트랜잭션에서 ⑥' 착지(D1 — 별도 착지 경로 0).
    if not 실패 and (t ->> 'not_target_reason') is not null then
      select * into fin from engine.jobs_finalize(
        새행.job_id, 새행.fence, '대상아님',
        jsonb_build_object(
          'task_assigned', jsonb_build_object(
            'task_snapshot', draft -> 'task_snapshot', 'payload', jsonb_build_object('ver', 1)),
          'intervention_delivered', jsonb_build_object(
            'payload', jsonb_build_object(
              'ver', 2,
              'output_text', (
                select h ->> '문장' from jsonb_array_elements(draft -> 'task_snapshot' -> '호흡') h
                 where (h ->> '차례')::int = 2 limit 1),
              'generation_outcome', '대상아님',
              'generation_gate_failed', null,
              'generation_input_text', null),
            'estimator_version', run.estimator_version,
            'estimator_confidence', draft -> 'estimator_confidence',
            'evidence_refs', draft -> 'evidence_refs'),
          'submission_row', jsonb_build_object(
            'task_snapshot', draft -> 'task_snapshot', 'task_schema_ver', 'task.v1')),
        null, null, '적재');
      if not fin.landed then
        raise exception 'jobs_load: 비대상 착지 실패(%) — learner %', fin.reason, t ->> 'learner_id';
      end if;
    end if;
  end loop;

  -- 명단 집합 대조(갈래 5) — targets ∪ skipped_game ∪ existing(기존사건 갈래는 targets 안).
  select array_agg(distinct lid) into 명단 from (
    select t2 ->> 'learner_id' as lid from jsonb_array_elements(_targets) t2
    union
    select g::text from unnest(_skipped_game) g) u(lid);
  select encode(extensions.digest(
           convert_to(coalesce(string_agg(lid, E'\n' order by lid collate "C"), ''), 'UTF8'),
           'sha256'), 'hex')
    into 해시 from unnest(명단) lid;
  if 해시 is distinct from run.roster_hash and run.run_kind = '배치' then
    raise exception 'jobs_load: 명단 집합이 시작 행의 roster_hash 와 다르다(갈래 5 — 「누구」가 갈렸다)';
  end if;

  -- 완주 채움 — 자기 실행 행(A4 · 대상 식의 정본 = §3-6 ⓑ).
  -- ⚠ 구제 실행(㉨ 경유)은 finished_at 을 영영 안 채운다(갈래 2·22) — 배치만 채운다.
  if run.run_kind = '배치' then
  select count(*) into 만든수 from engine.generation_jobs g
   where g.assign_date = _assign_date and g.batch_run_id = _run_id;
  select count(*) into 대상수 from engine.generation_jobs g
   where g.assign_date = _assign_date
     and g.status not in ('대상아님','적재실패');
  update engine.generation_batch_runs
     set target_count = 대상수, loaded_count = 만든수,
         skipped_game_count = cardinality(_skipped_game),
         skipped_existing_count = existing,
         partial_count = partial,
         finished_at = now()
   where run_id = _run_id;
  end if;

  return jsonb_build_object(
    'created', created, 'existing', existing, 'partial', partial,
    'skipped_game', cardinality(_skipped_game));
end
$function$;

create or replace function engine.jobs_finalize_due(_assign_date date)
  returns table (job_id uuid, landed boolean, reason text)
  language plpgsql security definer set search_path = engine, public as $function$
declare
  j record;
  결과 record;
  봉투 jsonb;
begin
  for j in
    select g.* from engine.generation_jobs g
     where g.assign_date <= _assign_date
       and now() >= engine.gen_deadline(g.assign_date)
       and (g.status in ('대기','claimed')
            or (g.status = '적재실패' and g.event_draft is not null))
     order by g.assign_date, g.learner_id
  loop
    begin
      if j.status = '적재실패' then
        -- ⓓ-15 — draft 를 품은 적재실패는 스윕이 «구제» 모드로 닫는다(벤더 0 · 새 상태 0).
        update engine.generation_jobs
           set status = '대기', outcome = null, closed_at = null
         where generation_jobs.job_id = j.job_id;   -- 되돌리는 전이(freeze 의 그 하나)
      end if;
      봉투 := jsonb_build_object(
        'task_assigned', jsonb_build_object(
          'task_snapshot', j.event_draft -> 'task_snapshot',
          -- reads(c15 · 세층합류 §3) — draft 에 굳힌 읽기 기록을 스윕 착지도 나른다(착지봉투와
          -- 같은 규칙 · 없으면 {ver:1} 그대로 = 옛 draft 의 정직한 모양 · 커버리지가 「기록 없음」으로 센다).
          'payload', case when j.event_draft ? 'reads'
                          then jsonb_build_object('ver', 1, 'reads', j.event_draft -> 'reads')
                          else jsonb_build_object('ver', 1) end),
        'intervention_delivered', jsonb_build_object(
          'payload', jsonb_build_object(
            'ver', 2,
            'output_text', (
              select h ->> '문장' from jsonb_array_elements(j.event_draft -> 'task_snapshot' -> '호흡') h
               where (h ->> '차례')::int = 2 limit 1),
            'generation_outcome', case when j.status = '적재실패' then '구제경로' else '예산소진' end,
            'generation_gate_failed', null,
            'generation_input_text', null),
          'estimator_version', j.estimator_version,
          'estimator_confidence', j.event_draft -> 'estimator_confidence',
          'evidence_refs', j.event_draft -> 'evidence_refs'),
        'submission_row', jsonb_build_object(
          'task_snapshot', j.event_draft -> 'task_snapshot',
          'task_schema_ver', 'task.v1'));
      if j.status = '적재실패' then
        select * into 결과 from engine.jobs_finalize(
          j.job_id, j.fence, '구제경로', 봉투, null, null, '구제');
      else
        select * into 결과 from engine.jobs_finalize(
          j.job_id, j.fence, '예산소진', 봉투, null, null, '마감');
      end if;
      return query select j.job_id, 결과.landed, 결과.reason;
    exception when others then
      -- 한 건 실패는 그 행만 — 나머지는 닫는다(A9 와 같은 판정).
      return query select j.job_id, false, SQLERRM::text;
    end;
  end loop;
end
$function$;

do $migration2$
declare
  expected_checksum constant text := 'a3a335fc5194962c2c4ac79ae801e2d54a7e5ec235b8cecc29ba5d58ebc05e4c'; -- migration-checksum
begin
  insert into engine.schema_migrations(version, name, checksum)
  values ('20260901120000', '20260901120000_confluence_reads_c15.sql', expected_checksum);
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
  -- 교실 수집 물리칸 2(20260831130000 · 관찰태그 설계 §5)
  ('learning_events','observer_staff_id'), ('learning_events','draft_modified'),
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
  ('learners','group_no'), ('learners','seat_no'),
  -- 생성 실행 장부 세 표(20260821120000 · §3-5-b) — 계보 핵심 열이 빠지면 재현·감시가 정의부터 죽는다.
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
  -- 감시 처분·적색 착지 칸 셋(20260901000000·20260901010000 — 감사 08-31)
  ('generation_attempts','acked_at'),
  ('generation_batch_runs','deliver_check_reds'), ('generation_batch_runs','deliver_check_at'),
  -- 몽골어 문구 감수(20260826130000) — 학생 식별자 0 인 표 둘.
  ('l10n_strings','string_id'), ('l10n_strings','source_ko'), ('l10n_strings','draft_mn'),
  ('l10n_strings','context'), ('l10n_strings','max_len'), ('l10n_strings','status'),
  ('l10n_strings','created_at'), ('l10n_strings','updated_at'),
  ('l10n_reviews','review_id'), ('l10n_reviews','string_id'), ('l10n_reviews','reviewer'),
  ('l10n_reviews','verdict'), ('l10n_reviews','final_mn'), ('l10n_reviews','note'),
  ('l10n_reviews','supersedes'), ('l10n_reviews','created_at')
), 기대제약(n) as (values
  -- ── c12: CHECK 는 전부 _c13 접미 — 이 조각이 _c11 서른하나를 이름째 교체했다.
  --    UNIQUE·EXCLUDE·FK·PK 는 값목록이 없어 판 판별과 무관하니 c11 이름 그대로다.
  ('learning_events_event_type_c15'), ('learning_events_task_type_c15'),
  ('submissions_task_format_c15'), ('submissions_translation_source_c15'),
  ('submissions_due_paired_c15'), ('corrections_verdict_c15'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c15'), ('staff_role_c15'),
  ('learners_temp_password_paired_c15'),
  ('learning_events_correction_target_c15'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c15'), ('corrections_promotion_intent_c15'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c15'),
  -- 시즌 그릇(20260812140000) — 겹침 배제·날짜 순서·학생×시즌 유일·문항 묶음 + 고리 둘.
  ('season_no_overlap_c11'), ('season_dates_c15'),
  ('season_compass_once_c11'), ('season_compass_answers_c15'),
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey'),
  -- 시즌 회고(20260812170000) — 판정 3갈래 둘 + 「판정·사유·주체·시각 한 벌」 + 고리 둘.
  ('season_review_once_c11'), ('season_review_verdict_c15'),
  ('season_review_self_c15'), ('season_review_decided_c15'),
  ('season_review_learner_id_fkey'), ('season_review_season_id_fkey'),
  -- 가입 1회 문항 값목록(20260812180000) — 세 칸 전부.
  ('learners_home_aimag_c15'), ('learners_gender_c15'), ('learners_goal_track_c15'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  ('classes_pkey'), ('classes_key_nonblank_c15'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  -- 강사 한 마디(20260812210000) — 유일(한 산출물에 하나) + 값목록 둘 + 빈 말 금지 + 고리 둘.
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c15'),
  ('teacher_notes_origin_c15'), ('teacher_notes_disposition_c15'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey'),
  -- 조·좌석 쓰레기 못(20260814100000)
  ('learners_group_no_c15'), ('learners_seat_no_c15'),
  -- companion 빈칸 로그(20260814110000)
  ('companion_qa_question_nonblank_c15'), ('companion_qa_answer_paired_c15'),
  ('companion_qa_staff_id_fkey'),
  -- 생성 실행 장부(20260821120000) — CHECK 34 + FK 3 + UNIQUE 3(전이·계보의 물리).
  ('attempts_gate_values_c15'),
  ('attempts_response_present_c15'),
  ('attempts_result_gate_c15'),
  ('attempts_ver_nonempty_c15'),
  ('batch_runs_counts_order_c15'),
  ('batch_runs_counts_pair_c15'),
  ('batch_runs_enrolled_nonneg_c15'),
  ('batch_runs_finished_cols_c15'),
  ('batch_runs_level_dist_ok_c15'),
  ('batch_runs_partial_pair_c15'),
  ('batch_runs_partial_range_c15'),
  ('batch_runs_roster_equation_c15'),
  ('batch_runs_skipped_range_c15'),
  ('batch_runs_ver_nonempty_c15'),
  ('jobs_anchor_present_c15'),
  ('jobs_claim_cols_c15'),
  ('jobs_deciding_pair_c15'),
  ('jobs_deciding_result_matches_c15'),
  ('jobs_deciding_scope_c15'),
  ('jobs_draft_present_c15'),
  ('jobs_idle_cols_c15'),
  ('jobs_load_failed_cols_c15'),
  ('jobs_nontarget_cols_c15'),
  ('jobs_nonterminal_cols_c15'),
  ('jobs_skill_ids_present_c15'),
  ('jobs_status_outcome_pairs_c15'),
  ('jobs_terminal_cols_c15'),
  ('jobs_ver_nonempty_c15'),
  ('jobs_winner_fence_current_c15'),
  ('jobs_winner_fence_pair_c15'),
  ('jobs_winner_only_success_c15'),
  ('jobs_winner_present_c15'),
  ('jobs_winner_result_only_success_c15'),
  ('jobs_winner_result_pair_c15'),
  -- 몽골어 문구 감수(20260826130000)
  ('l10n_strings_id_ascii_c15'), ('l10n_strings_ko_nonblank_c15'),
  ('l10n_strings_max_len_c15'), ('l10n_strings_status_c15'),
  ('l10n_reviews_verdict_c15'), ('l10n_reviews_final_paired_c15'),
  ('l10n_reviews_supersedes_not_self_c15'),
  ('jobs_winning_attempt_fk'), ('jobs_deciding_attempt_fk'), ('jobs_batch_run_fk'),
  ('attempts_id_job_result_uk'), ('attempts_id_job_fence_result_uk'), ('batch_runs_run_date_uq')
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
  ('companion_qa_immutable'),
  -- 생성 실행 장부(20260821120000) — 선판정 스냅샷·실행 계보 freeze + 비대상 커밋 게이트.
  ('generation_jobs_freeze'), ('generation_batch_runs_freeze'), ('jobs_nontarget_settled')
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
  -- 🔑 이 조각은 표를 **둘** 만든다(l10n_strings·l10n_reviews) — 테이블수·RLS켜짐이 21 → 23.
  --    뷰(l10n_queue)는 pg_tables 에 없어 이 셈에 안 든다. 정책은 0 이라 정책수는 7 그대로다.
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
      and conname='broadcast_segment_kind_c15') as 라디오kind제약,
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
      and conname='cron_runs_outcome_c15') as 회차제약,
  -- G11(08-24) — 확인 답 하루 1회의 물리 방벽(부분 유일 · engine.ub_date 식). CHECK 가 아니라
  -- 「기대:」 줄 대상이 아니고, pg_constraint 에도 안 잡혀 pg_indexes 로 센다(연동활성유일 선례).
  (select count(*) from pg_indexes
    where schemaname='engine' and indexname='estimate_daily_once_c13') as 확인하루유일,
  -- c14 — 목표 답 하루 1회의 물리 방벽(estimate 동형 · 같은 pg_indexes 셈).
  (select count(*) from pg_indexes
    where schemaname='engine' and indexname='goal_daily_once_c14') as 목표하루유일
)
select case when 테이블수=23 and RLS켜짐=23 and 정책수=7
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
              and 컴패니언열=11 and 컴패니언정책=0 and 회차제약=1 and 확인하루유일=1 and 목표하루유일=1
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260901120000'
              and (select checksum from 현재이력)='a3a335fc5194962c2c4ac79ae801e2d54a7e5ec235b8cecc29ba5d58ebc05e4c' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 23·23·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0·1·1·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 이 조각 = 적색 착지 칸 둘(deliver_check_reds·deliver_check_at) + freeze 화이트리스트 +2 — CHECK 변경 0.
-- ② 아래 기대 목록은 20260831130000 이 세운 현행 그대로다(변경 0 — 마지막 조각이 이 줄을 든다).
--    ⚠ 이 줄은 마지막 조각이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `season_no_overlap_c11`(EXCLUDE) · `…_once_c11`(UNIQUE) · `companion_qa_*_fkey` 는 여기
--      없다 — CHECK 가 아니라 이 줄의 대상이 아니고, 이름도 c11 그대로 산다(값목록이 없어
--      판 판별과 무관하다 · 위 기대제약 목록에는 그 이름 그대로 들어 있다).
--    기대: attempts_gate_values_c15 · attempts_response_present_c15 · attempts_result_gate_c15
--         · attempts_ver_nonempty_c15 · batch_runs_counts_order_c15 · batch_runs_counts_pair_c15
--         · batch_runs_enrolled_nonneg_c15 · batch_runs_finished_cols_c15
--         · batch_runs_level_dist_ok_c15 · batch_runs_partial_pair_c15
--         · batch_runs_partial_range_c15 · batch_runs_roster_equation_c15
--         · batch_runs_skipped_range_c15 · batch_runs_ver_nonempty_c15 · broadcast_segment_kind_c15
--         · classes_key_nonblank_c15 · companion_qa_answer_paired_c15
--         · companion_qa_question_nonblank_c15 · corrections_promotion_intent_c15
--         · corrections_supersedes_not_self_c15 · corrections_verdict_c15 · cron_runs_outcome_c15
--         · jobs_anchor_present_c15 · jobs_claim_cols_c15 · jobs_deciding_pair_c15
--         · jobs_deciding_result_matches_c15 · jobs_deciding_scope_c15 · jobs_draft_present_c15
--         · jobs_idle_cols_c15 · jobs_load_failed_cols_c15 · jobs_nontarget_cols_c15
--         · jobs_nonterminal_cols_c15 · jobs_skill_ids_present_c15 · jobs_status_outcome_pairs_c15
--         · jobs_terminal_cols_c15 · jobs_ver_nonempty_c15 · jobs_winner_fence_current_c15
--         · jobs_winner_fence_pair_c15 · jobs_winner_only_success_c15 · jobs_winner_present_c15
--         · jobs_winner_result_only_success_c15 · jobs_winner_result_pair_c15
--         · l10n_reviews_final_paired_c15 · l10n_reviews_supersedes_not_self_c15
--         · l10n_reviews_verdict_c15 · l10n_strings_id_ascii_c15
--         · l10n_strings_ko_nonblank_c15 · l10n_strings_max_len_c15
--         · l10n_strings_status_c15 · learners_gender_c15
--         · learners_goal_track_c15 · learners_group_no_c15 · learners_home_aimag_c15
--         · learners_seat_no_c15 · learners_signup_attempts_nonneg_c15
--         · learners_temp_password_paired_c15 · learning_events_correction_target_c15
--         · learning_events_event_type_c15 · learning_events_task_type_c15
--         · pipeline_jobs_discard_reason_c15 · season_compass_answers_c15 · season_dates_c15
--         · season_review_decided_c15 · season_review_self_c15 · season_review_verdict_c15
--         · staff_role_c15 · submissions_due_paired_c15 · submissions_task_format_c15
--         · submissions_translation_source_c15 · teacher_notes_body_nonblank_c15
--         · teacher_notes_disposition_c15 · teacher_notes_origin_c15
