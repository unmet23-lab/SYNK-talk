/* 회차 장부 — 요약 뷰 수리: «대기»는 이상이 아니다 (20260815080000 후속 3판 · ops 층)
 *
 * ■ 무엇 — `ops.회차_요약` 재정의 «하나»: `마지막이상` 의 필터가 `outcome <> '성공'` 이라
 *   **수확 전 정상 상태(대기)까지 이상으로 셌다.** `not in ('성공','대기')` 로 좁힌다.
 *   열 이름·차례는 그대로다(읽는 쪽 tools/회차장부.js 의 안전선 · recon2 와 같은 규칙).
 *
 * ■ 왜 — 실측 2026-08-25(운영): transcribe-batch 가 08-21 타임아웃 1회 뒤 505회 연속
 *   성공했는데, 10분 주기 잡은 «방금 발사한 대기 행»이 거의 항상 있어 `마지막이상` 이
 *   상시 «지금» 으로 갱신됐다 — 화면에 「마지막 발사 = 마지막 이상」이 찍혀 방금 발사가
 *   이상처럼 읽히고, 아묾 판정(도구 · 이상 뒤 24시간 무재발)은 원리상 영영 못 선다.
 *   장부의 다른 두 층(도구의 잡이상수 · 이상행 질의)은 이미 대기를 빼고 있었다 —
 *   뷰만 어휘가 갈라져 있었고, 갈라진 쪽의 증상이 여기선 «영구 적색»이었다(F482).
 *
 * ■ 대기가 진짜 죽으면 — 수확(ops.수확)이 안 오는 응답을 «유실» 로 못박는 순간
 *   `마지막이상` 에 잡힌다. 「아직 판정 전」과 「이상」을 가르는 것이 정확히 수확의 몫이라,
 *   이 필터는 판정을 늦추는 게 아니라 판정 «전» 상태를 이상으로 세지 않는 것이다.
 *
 * 되돌림: 20260815080000 의 ops.회차_요약 정의를 다시 부으면 전 판으로 돌아간다. */

begin;

do $migration$
declare
  migration_version constant text := '20260825000000';
  migration_name constant text := '20260825000000_cron_ledger_wait_c13.sql';
  expected_checksum constant text := 'a1e5394ad0bf0d85525639623de4286774dab0e9eec4d4a904c64927a568829b'; -- migration-checksum
  base_version constant text := '20260824090000';   -- 체인 규약: 직전 조각(estimate_once)
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

  if to_regclass('ops.cron_runs') is null then
    raise exception
      'migration % 는 장부 판(20260815080000 cron_ledger_c11) 위에서만 돈다 — ops.cron_runs 가 없다',
      migration_version;
  end if;

  /* 원문(20260815080000)과 다른 곳은 `마지막이상` 필터 한 줄뿐이다. */
  create or replace view ops.회차_요약 as
  select jobname,
         count(*)                                          as 전체,
         count(*) filter (where outcome = '성공')            as 성공,
         count(*) filter (where outcome = '실패')            as 실패,
         count(*) filter (where outcome = '타임아웃')         as 타임아웃,
         count(*) filter (where outcome = '전송오류')         as 전송오류,
         count(*) filter (where outcome = '상태없음')         as 상태없음,
         count(*) filter (where outcome = '발사실패')         as 발사실패,
         count(*) filter (where outcome = '유실')            as 유실,
         count(*) filter (where outcome = '대기')            as 대기,
         max(queued_at)                                    as 마지막발사,
         max(queued_at) filter (where outcome not in ('성공', '대기')) as 마지막이상
    from ops.cron_runs
   where queued_at > now() - interval '7 days'
   group by jobname;

end
$migration$;

do $migration2$
declare
  expected_checksum constant text := 'a1e5394ad0bf0d85525639623de4286774dab0e9eec4d4a904c64927a568829b'; -- migration-checksum
begin
  if not exists (select 1 from engine.schema_migrations where version = '20260825000000') then
    insert into engine.schema_migrations(version, name, checksum)
    values ('20260825000000', '20260825000000_cron_ledger_wait_c13.sql', expected_checksum);
  end if;
end
$migration2$;

commit;

-- 사후 메모:
-- ① 이 조각의 몫은 ops.회차_요약 재정의 «하나»다(마지막이상에서 대기 제외) — CHECK 를 만들지도 지우지도 않는다.
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
