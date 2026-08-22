/* 성향 확인 답 사건 — event_type +1 `estimate.responded` (계약 c13 · 엔진검토 Ⅲ⑥)
 *
 * ■ 무엇 — **살아 있는 CHECK 64개를 `_c12`→`_c13` 이름째 교체**(c8·c12 방식 — 접미를 안 갈면
 *   「c13 계약 + c12 물리」가 초록으로 보인다 · tests/L0스키마 「이름이 계약 버전」 자물쇠).
 *   값이 바뀌는 것은 `learning_events_event_type` 하나(+`estimate.responded` · 기존 행 검사
 *   없음 = 넓히기만) — 나머지 63개는 합본에서 **기계 추출한 본문 그대로**다(조립기는 스크래치
 *   1회용 · 손 복사 변형 0 — 20260822090000 의 그 방식).
 *   payload 5칸(trait_axis·shown_key·shown_text·response·estimate_as_of)은 jsonb 안이라
 *   물리 0 — 지키는 층은 검증기(`lib/이벤트검증.js` 이벤트별필수)와 계약 `payload_허용필드` 다.
 * ■ 왜 — 봇이 관찰로 추정한 성향을 학생에게 확인받는 답(「맞아요/아니에요」)의 자리(유호 확정
 *   08-22 「리듬부터 · 새 사건 · 이 설계로 진행」 · 정본 = appsscript docs/코어엔진_설계.md §10).
 *   `preference.stated`(스스로 말함)와 다른 사실이라 다른 이름 — 섞이면 개인화가 자기 추측을
 *   학생의 말로 착각한다. 이 행이 「추정기 정확도의 실측 라벨」이다.
 * ■ 파일 이름의 _c13 — Edge Function 이 계약판을 최신 `_c<숫자>` 이름에서 읽는다(판 올림).
 *   c13 을 모르는 앱(c12 선언)은 그대로 동작한다 — 서버가 더 새 판인 것은 막지 않는다.
 *
 * 되돌림: drop constraint learning_events_event_type_c13; 뒤 c12 본문(값 14)으로 다시 add.
 *         delete from engine.schema_migrations where version='20260822150000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260822150000';
  migration_name constant text := '20260822150000_estimate_responded_c13.sql';
  expected_checksum constant text := '3f3b49afc63cdcf71d3ec2078e0df3fbc47b492dfd59be1272263ff6234317a5'; -- migration-checksum
  base_version constant text := '20260822090000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c12 위에서만 돈다 — engine.schema_migrations 가 없다(빈 DB 면 합본을 처음부터 부어라)';
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

-- 살아 있는 CHECK 65개 — c12 본문 그대로 이름만 c13(값이 는 것은 event_type 하나 · +estimate.responded).
alter table engine.learning_events
  drop constraint if exists learning_events_event_type_c12,
  add constraint learning_events_event_type_c13 check (event_type in (
    'submission.created', 'quiz.answered', 'choice.selected', 'correction.responded', 'correction.viewed', 'preference.stated', 'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
    'task.assigned', 'exam.result', 'content.viewed', 'affect.reported',
    'estimate.responded'
  ));
alter table engine.generation_attempts
  drop constraint if exists attempts_gate_values_c12,
  add constraint attempts_gate_values_c13 check ( gate_failed_reasons is null or gate_failed_reasons <@ array[ '길이','한국어비율','빈출력','금칙서식','질문형태','식별자역유입','중복']::text[] );

alter table engine.generation_attempts
  drop constraint if exists attempts_response_present_c12,
  add constraint attempts_response_present_c13 check ( result is null or result not in ('성공','검문탈락','응답파손','응답초과') or (raw_response is not null and responded_at is not null) );

alter table engine.generation_attempts
  drop constraint if exists attempts_result_gate_c12,
  add constraint attempts_result_gate_c13 check ( case when result = '검문탈락' then gate_failed_reasons is not null and cardinality(gate_failed_reasons) >= 1 else gate_failed_reasons is null end );

alter table engine.generation_attempts
  drop constraint if exists attempts_ver_nonempty_c12,
  add constraint attempts_ver_nonempty_c13 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_counts_order_c12,
  add constraint batch_runs_counts_order_c13 check ( target_count is null or (target_count >= 0 and loaded_count <= enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_counts_pair_c12,
  add constraint batch_runs_counts_pair_c13 check ((target_count is null) = (loaded_count is null));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_enrolled_nonneg_c12,
  add constraint batch_runs_enrolled_nonneg_c13 check (enrolled_count >= 0);

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_finished_cols_c12,
  add constraint batch_runs_finished_cols_c13 check ( finished_at is null or (target_count is not null and loaded_count is not null and partial_count is not null and skipped_game_count is not null and skipped_existing_count is not null) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_level_dist_ok_c12,
  add constraint batch_runs_level_dist_ok_c13 check (engine.level_dist_ok(level_distribution, enrolled_count));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_partial_pair_c12,
  add constraint batch_runs_partial_pair_c13 check ((partial_count is null) = (loaded_count is null));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_partial_range_c12,
  add constraint batch_runs_partial_range_c13 check ( partial_count is null or (partial_count >= 0 and partial_count <= enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_roster_equation_c12,
  add constraint batch_runs_roster_equation_c13 check ( finished_at is null or run_kind <> '배치' or (loaded_count + skipped_game_count + skipped_existing_count = enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_skipped_range_c12,
  add constraint batch_runs_skipped_range_c13 check ( (skipped_game_count is null or (skipped_game_count >= 0 and skipped_game_count <= enrolled_count)) and (skipped_existing_count is null or (skipped_existing_count >= 0 and skipped_existing_count <= enrolled_count)) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_ver_nonempty_c12,
  add constraint batch_runs_ver_nonempty_c13 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table radio.broadcast_segment
  drop constraint if exists broadcast_segment_kind_c12,
  add constraint broadcast_segment_kind_c13 check (kind in ('radio_loop', 'live_lecture', 'asmr_mode', 'other'));

alter table engine.classes
  drop constraint if exists classes_key_nonblank_c12,
  add constraint classes_key_nonblank_c13 check (btrim(class_key) <> '');

alter table engine.companion_qa
  drop constraint if exists companion_qa_answer_paired_c12,
  add constraint companion_qa_answer_paired_c13 check (handoff or btrim(answer) <> '');

alter table engine.companion_qa
  drop constraint if exists companion_qa_question_nonblank_c12,
  add constraint companion_qa_question_nonblank_c13 check (btrim(question) <> '');

alter table engine.corrections
  drop constraint if exists corrections_promotion_intent_c12,
  add constraint corrections_promotion_intent_c13 check (promotion_intent = false or actor_kind = 'teacher');

alter table engine.corrections
  drop constraint if exists corrections_supersedes_not_self_c12,
  add constraint corrections_supersedes_not_self_c13 check (supersedes is null or supersedes <> correction_id);

alter table engine.corrections
  drop constraint if exists corrections_verdict_c12,
  add constraint corrections_verdict_c13 check (verdict is null or verdict in ( 'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다' ));

alter table ops.cron_runs
  drop constraint if exists cron_runs_outcome_c12,
  add constraint cron_runs_outcome_c13 check (outcome in ('대기', '성공', '실패', '타임아웃', '전송오류', '상태없음', '유실', '발사실패'));

alter table engine.generation_jobs
  drop constraint if exists jobs_anchor_present_c12,
  add constraint jobs_anchor_present_c13 check ( status not in ('착지','마감폴백','대상아님') or assigned_event_id is not null );

alter table engine.generation_jobs
  drop constraint if exists jobs_claim_cols_c12,
  add constraint jobs_claim_cols_c13 check (status <> 'claimed' or (owner is not null and lease_until is not null));

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_pair_c12,
  add constraint jobs_deciding_pair_c13 check ((deciding_attempt_id is null) = (deciding_result is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_result_matches_c12,
  add constraint jobs_deciding_result_matches_c13 check (deciding_result is null or deciding_result = outcome);

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_scope_c12,
  add constraint jobs_deciding_scope_c13 check ( case when outcome is null then deciding_attempt_id is null when outcome in ('검문탈락','타임아웃','벤더오류','응답파손','입력초과','응답초과') then deciding_attempt_id is not null else deciding_attempt_id is null end );

alter table engine.generation_jobs
  drop constraint if exists jobs_draft_present_c12,
  add constraint jobs_draft_present_c13 check (status = '적재실패' or event_draft is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_idle_cols_c12,
  add constraint jobs_idle_cols_c13 check (status <> '대기' or (owner is null and lease_until is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_load_failed_cols_c12,
  add constraint jobs_load_failed_cols_c13 check ( status <> '적재실패' or (outcome = '내부오류' and assigned_event_id is null and event_draft is null and load_error is not null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_nontarget_cols_c12,
  add constraint jobs_nontarget_cols_c13 check (status <> '대상아님' or not_target_reason is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_nonterminal_cols_c12,
  add constraint jobs_nonterminal_cols_c13 check ( status in ('착지','마감폴백','대상아님','적재실패') or (outcome is null and closed_at is null and assigned_event_id is null and winning_attempt_id is null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_skill_ids_present_c12,
  add constraint jobs_skill_ids_present_c13 check ( status = '적재실패' or not_target_reason is not null or cardinality(skill_ids) between 1 and 2 );

alter table engine.generation_jobs
  drop constraint if exists jobs_status_outcome_pairs_c12,
  add constraint jobs_status_outcome_pairs_c13 check ( case status when '대상아님' then outcome = '대상아님' when '마감폴백' then outcome = '예산소진' when '적재실패' then outcome = '내부오류' when '착지' then outcome is null or outcome not in ('대상아님','예산소진') else true end );

alter table engine.generation_jobs
  drop constraint if exists jobs_terminal_cols_c12,
  add constraint jobs_terminal_cols_c13 check ( status not in ('착지','마감폴백','대상아님','적재실패') or (outcome is not null and closed_at is not null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_ver_nonempty_c12,
  add constraint jobs_ver_nonempty_c13 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_fence_current_c12,
  add constraint jobs_winner_fence_current_c13 check (winning_fence is null or winning_fence = fence);

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_fence_pair_c12,
  add constraint jobs_winner_fence_pair_c13 check ((winning_attempt_id is null) = (winning_fence is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_only_success_c12,
  add constraint jobs_winner_only_success_c13 check (winning_attempt_id is null or outcome = '성공');

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_present_c12,
  add constraint jobs_winner_present_c13 check (outcome <> '성공' or winning_attempt_id is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_result_only_success_c12,
  add constraint jobs_winner_result_only_success_c13 check (winning_result is null or winning_result = '성공');

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_result_pair_c12,
  add constraint jobs_winner_result_pair_c13 check ((winning_attempt_id is null) = (winning_result is null));

alter table engine.learners
  drop constraint if exists learners_gender_c12,
  add constraint learners_gender_c13 check (gender is null or gender in ('female', 'male', 'undisclosed'));

alter table engine.learners
  drop constraint if exists learners_goal_track_c12,
  add constraint learners_goal_track_c13 check (goal_track is null or goal_track in ('study', 'work', 'culture'));

alter table engine.learners
  drop constraint if exists learners_group_no_c12,
  add constraint learners_group_no_c13 check (group_no between 1 and 20);

alter table engine.learners
  drop constraint if exists learners_home_aimag_c12,
  add constraint learners_home_aimag_c13 check (home_aimag is null or home_aimag in ( 'ulaanbaatar', 'arkhangai', 'bayan-olgii', 'bayankhongor', 'bulgan', 'darkhan-uul', 'dornod', 'dornogovi', 'dundgovi', 'govi-altai', 'govisumber', 'khentii', 'khovd', 'khovsgol', 'omnogovi', 'orkhon', 'ovorkhangai', 'selenge', 'sukhbaatar', 'tov', 'uvs', 'zavkhan'));

alter table engine.learners
  drop constraint if exists learners_seat_no_c12,
  add constraint learners_seat_no_c13 check (seat_no between 1 and 20);

alter table engine.learners
  drop constraint if exists learners_signup_attempts_nonneg_c12,
  add constraint learners_signup_attempts_nonneg_c13 check (signup_attempts >= 0);

alter table engine.learners
  drop constraint if exists learners_temp_password_paired_c12,
  add constraint learners_temp_password_paired_c13 check (temp_password_hash is null or temp_password_expires_at is not null);

alter table engine.learning_events
  drop constraint if exists learning_events_correction_target_c12,
  add constraint learning_events_correction_target_c13 check ( case when event_type in ('correction.viewed', 'correction.responded') then correction_id is not null else correction_id is null end );

alter table engine.learning_events
  drop constraint if exists learning_events_task_type_c12,
  add constraint learning_events_task_type_c13 check (task_type is null or task_type in ( '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화', '라디오퀴즈', '목표선언', '자습체크인' ));

alter table engine.pipeline_jobs
  drop constraint if exists pipeline_jobs_discard_reason_c12,
  add constraint pipeline_jobs_discard_reason_c13 check (discard_reason is null or (status = 'discarded' and discard_reason in ('무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가')));

alter table engine.season_compass
  drop constraint if exists season_compass_answers_c12,
  add constraint season_compass_answers_c13 check ( ( self_in_5y_changed is null and answers ?& array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] and answers - array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] = '{}'::jsonb ) or ( self_in_5y_changed is not null and answers ?& array['self_in_5y', 'season_goal'] and answers - array['self_in_5y', 'season_goal'] = '{}'::jsonb ) );

alter table engine.season
  drop constraint if exists season_dates_c12,
  add constraint season_dates_c13 check (ends_on is null or ends_on >= starts_on);

alter table engine.season_review
  drop constraint if exists season_review_decided_c12,
  add constraint season_review_decided_c13 check ( (verdict is null and note is null and decided_by is null and decided_at is null) or (verdict is not null and decided_by is not null and decided_at is not null and note is not null and btrim(note) <> '') );

alter table engine.season_review
  drop constraint if exists season_review_self_c12,
  add constraint season_review_self_c13 check (verdict_by_self is null or verdict_by_self in ('closer', 'same', 'redirected'));

alter table engine.season_review
  drop constraint if exists season_review_verdict_c12,
  add constraint season_review_verdict_c13 check (verdict is null or verdict in ('closer', 'same', 'redirected'));

alter table engine.staff
  drop constraint if exists staff_role_c12,
  add constraint staff_role_c13 check (role in ('teacher', 'inspector', 'director'));

alter table engine.submissions
  drop constraint if exists submissions_due_paired_c12,
  add constraint submissions_due_paired_c13 check ( (due_at is null) = (due_ver is null) );

alter table engine.submissions
  drop constraint if exists submissions_task_format_c12,
  add constraint submissions_task_format_c13 check (task_format is null or task_format in ( '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역' ));

alter table engine.submissions
  drop constraint if exists submissions_translation_source_c12,
  add constraint submissions_translation_source_c13 check ( task_format is distinct from '번역' or nullif(btrim(task_snapshot->>'mn'), '') is not null );

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_body_nonblank_c12,
  add constraint teacher_notes_body_nonblank_c13 check (btrim(body) <> '');

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_disposition_c12,
  add constraint teacher_notes_disposition_c13 check (disposition in ('confirmed', 'retry'));

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_origin_c12,
  add constraint teacher_notes_origin_c13 check (origin in ('as_is', 'edited', 'written'));

do $migration2$
declare
  expected_checksum constant text := '3f3b49afc63cdcf71d3ec2078e0df3fbc47b492dfd59be1272263ff6234317a5'; -- migration-checksum
begin
  insert into engine.schema_migrations(version, name, checksum)
  values ('20260822150000', '20260822150000_estimate_responded_c13.sql', expected_checksum);
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
  ('generation_batch_runs','snapshot_as_of')
), 기대제약(n) as (values
  -- ── c12: CHECK 는 전부 _c13 접미 — 이 조각이 _c11 서른하나를 이름째 교체했다.
  --    UNIQUE·EXCLUDE·FK·PK 는 값목록이 없어 판 판별과 무관하니 c11 이름 그대로다.
  ('learning_events_event_type_c13'), ('learning_events_task_type_c13'),
  ('submissions_task_format_c13'), ('submissions_translation_source_c13'),
  ('submissions_due_paired_c13'), ('corrections_verdict_c13'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c13'), ('staff_role_c13'),
  ('learners_temp_password_paired_c13'),
  ('learning_events_correction_target_c13'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c13'), ('corrections_promotion_intent_c13'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c13'),
  -- 시즌 그릇(20260812140000) — 겹침 배제·날짜 순서·학생×시즌 유일·문항 묶음 + 고리 둘.
  ('season_no_overlap_c11'), ('season_dates_c13'),
  ('season_compass_once_c11'), ('season_compass_answers_c13'),
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey'),
  -- 시즌 회고(20260812170000) — 판정 3갈래 둘 + 「판정·사유·주체·시각 한 벌」 + 고리 둘.
  ('season_review_once_c11'), ('season_review_verdict_c13'),
  ('season_review_self_c13'), ('season_review_decided_c13'),
  ('season_review_learner_id_fkey'), ('season_review_season_id_fkey'),
  -- 가입 1회 문항 값목록(20260812180000) — 세 칸 전부.
  ('learners_home_aimag_c13'), ('learners_gender_c13'), ('learners_goal_track_c13'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  ('classes_pkey'), ('classes_key_nonblank_c13'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  -- 강사 한 마디(20260812210000) — 유일(한 산출물에 하나) + 값목록 둘 + 빈 말 금지 + 고리 둘.
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c13'),
  ('teacher_notes_origin_c13'), ('teacher_notes_disposition_c13'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey'),
  -- 조·좌석 쓰레기 못(20260814100000)
  ('learners_group_no_c13'), ('learners_seat_no_c13'),
  -- companion 빈칸 로그(20260814110000)
  ('companion_qa_question_nonblank_c13'), ('companion_qa_answer_paired_c13'),
  ('companion_qa_staff_id_fkey'),
  -- 생성 실행 장부(20260821120000) — CHECK 34 + FK 3 + UNIQUE 3(전이·계보의 물리).
  ('attempts_gate_values_c13'),
  ('attempts_response_present_c13'),
  ('attempts_result_gate_c13'),
  ('attempts_ver_nonempty_c13'),
  ('batch_runs_counts_order_c13'),
  ('batch_runs_counts_pair_c13'),
  ('batch_runs_enrolled_nonneg_c13'),
  ('batch_runs_finished_cols_c13'),
  ('batch_runs_level_dist_ok_c13'),
  ('batch_runs_partial_pair_c13'),
  ('batch_runs_partial_range_c13'),
  ('batch_runs_roster_equation_c13'),
  ('batch_runs_skipped_range_c13'),
  ('batch_runs_ver_nonempty_c13'),
  ('jobs_anchor_present_c13'),
  ('jobs_claim_cols_c13'),
  ('jobs_deciding_pair_c13'),
  ('jobs_deciding_result_matches_c13'),
  ('jobs_deciding_scope_c13'),
  ('jobs_draft_present_c13'),
  ('jobs_idle_cols_c13'),
  ('jobs_load_failed_cols_c13'),
  ('jobs_nontarget_cols_c13'),
  ('jobs_nonterminal_cols_c13'),
  ('jobs_skill_ids_present_c13'),
  ('jobs_status_outcome_pairs_c13'),
  ('jobs_terminal_cols_c13'),
  ('jobs_ver_nonempty_c13'),
  ('jobs_winner_fence_current_c13'),
  ('jobs_winner_fence_pair_c13'),
  ('jobs_winner_only_success_c13'),
  ('jobs_winner_present_c13'),
  ('jobs_winner_result_only_success_c13'),
  ('jobs_winner_result_pair_c13'),
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
      and conname='broadcast_segment_kind_c13') as 라디오kind제약,
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
      and conname='cron_runs_outcome_c13') as 회차제약
)
select case when 테이블수=21 and RLS켜짐=21 and 정책수=7
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
              and (select version from 현재이력)='20260822090000'
              and (select checksum from 현재이력)='3f3b49afc63cdcf71d3ec2078e0df3fbc47b492dfd59be1272263ff6234317a5' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 21·21·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 이 조각의 몫은 jobs_load 활성일 가드 «하나»다(v5.13-d) — CHECK 를 만들지도 지우지도 않는다.
-- ② 아래 기대 목록은 generation_c13 가 세운 현행 그대로다(변경 0 — 마지막 조각이 이 줄을 든다).
--    ⚠ 이 줄은 마지막 조각이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `season_no_overlap_c11`(EXCLUDE) · `…_once_c11`(UNIQUE) · `companion_qa_*_fkey` 는 여기
--      없다 — CHECK 가 아니라 이 줄의 대상이 아니고, 이름도 c11 그대로 산다(값목록이 없어
--      판 판별과 무관하다 · 위 기대제약 목록에는 그 이름 그대로 들어 있다).
--    기대: attempts_gate_values_c13 · attempts_response_present_c13 · attempts_result_gate_c13
--         · attempts_ver_nonempty_c13 · batch_runs_counts_order_c13 · batch_runs_counts_pair_c13
--         · batch_runs_enrolled_nonneg_c13 · batch_runs_finished_cols_c13
--         · batch_runs_level_dist_ok_c13 · batch_runs_partial_pair_c13
--         · batch_runs_partial_range_c13 · batch_runs_roster_equation_c13
--         · batch_runs_skipped_range_c13 · batch_runs_ver_nonempty_c13 · broadcast_segment_kind_c13
--         · classes_key_nonblank_c13 · companion_qa_answer_paired_c13
--         · companion_qa_question_nonblank_c13 · corrections_promotion_intent_c13
--         · corrections_supersedes_not_self_c13 · corrections_verdict_c13 · cron_runs_outcome_c13
--         · jobs_anchor_present_c13 · jobs_claim_cols_c13 · jobs_deciding_pair_c13
--         · jobs_deciding_result_matches_c13 · jobs_deciding_scope_c13 · jobs_draft_present_c13
--         · jobs_idle_cols_c13 · jobs_load_failed_cols_c13 · jobs_nontarget_cols_c13
--         · jobs_nonterminal_cols_c13 · jobs_skill_ids_present_c13 · jobs_status_outcome_pairs_c13
--         · jobs_terminal_cols_c13 · jobs_ver_nonempty_c13 · jobs_winner_fence_current_c13
--         · jobs_winner_fence_pair_c13 · jobs_winner_only_success_c13 · jobs_winner_present_c13
--         · jobs_winner_result_only_success_c13 · jobs_winner_result_pair_c13 · learners_gender_c13
--         · learners_goal_track_c13 · learners_group_no_c13 · learners_home_aimag_c13
--         · learners_seat_no_c13 · learners_signup_attempts_nonneg_c13
--         · learners_temp_password_paired_c13 · learning_events_correction_target_c13
--         · learning_events_event_type_c13 · learning_events_task_type_c13
--         · pipeline_jobs_discard_reason_c13 · season_compass_answers_c13 · season_dates_c13
--         · season_review_decided_c13 · season_review_self_c13 · season_review_verdict_c13
--         · staff_role_c13 · submissions_due_paired_c13 · submissions_task_format_c13
--         · submissions_translation_source_c13 · teacher_notes_body_nonblank_c13
--         · teacher_notes_disposition_c13 · teacher_notes_origin_c13

