/* 회차 장부 — 대조 뷰 수리: SQL 직접 잡의 «가짜 안적힘» (20260815080000 후속 · ops 층 · v5.14 시점)
 *
 * ■ 무엇 — `ops.회차_대조` 재정의 «하나»: 돈것(cron.job_run_details)에 «장부경유» 판별을 더해,
 *   `ops.발사` 를 지나도록 등록된 잡만 «안적힘» 으로 센다. SQL 직접 잡(ops-harvest ·
 *   generate-deadline · 활성 뒤 deliver-check)은 장부를 지나지 않는 것이 **설계**라
 *   그 회차는 안적힘이 아니다 — 다만 그 잡들의 SQL층실패는 계속 센다(그건 진짜 신호다).
 *
 * ■ 왜 — 실측 2026-08-24(운영): `ops-harvest` 가 매일 288회 돌고 장부엔 0회 적혀
 *   **안적힘 288 로 영구 적색**이었다. 수확 잡은 순수 SQL(`select ops.수확()`)이라 장부를
 *   지나지 않는 것이 c11 자신의 설계인데, c11 의 대조 뷰가 자기 수확 잡을 «침묵»으로 셌다 —
 *   양치기 적색은 진짜 침묵(이 뷰가 잡으려던 그것)을 덮는다.
 *   ⚠이 오탐이 아무에게도 안 보였던 까닭이 더 나쁘다: 자동 독자(형제 저장소 rot-check)가
 *   리허설만 보고 있어 **운영 장부는 reader 0** 이었다 — 「writer 만 세우고 reader 0」(c11 머리말이
 *   고치려던 병)이 한 층 위에서 재발한 모양이다. 독자 재조준은 형제 저장소 커밋이 진다.
 *
 * ■ 판별이 «이름표»가 아니라 «명령 본문»인 까닭 — 잡 이름 목록으로 가르면 새 SQL 직접 잡마다
 *   이 뷰를 다시 부어야 하고, 잊으면 그 잡이 영구 적색이 된다(같은 병의 재발). 등록 명령에
 *   `ops.발사(` 가 있는가는 «장부를 지나기로 했는가» 그 자체라 목록 유지가 필요 없다.
 *
 * 되돌림: 20260815080000 의 ops.회차_대조 정의를 다시 부으면 전 판으로 돌아간다. */

begin;

do $migration$
declare
  migration_version constant text := '20260824010000';
  migration_name constant text := '20260824010000_cron_ledger_recon_c13.sql';
  expected_checksum constant text := '2f7cc6b9394cebc7503cb931344ca0d60211cd02dc86054cff4ef6f335d88e60'; -- migration-checksum
  base_version constant text := '20260822150000';   -- 체인 규약: 직전 조각(estimate_responded_c13). 뷰의 의미 의존은 20260815080000(cron_ledger_c11)이고 그 실재는 아래 to_regclass 가 따로 잰다
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

  /* 원문(20260815080000)과 다른 곳은 «장부경유» 한 축뿐이다 — 열 이름·차례는 그대로 두고
   * 끝에만 더한다(create or replace view 의 제약이자, 읽는 쪽(tools/회차장부.js)의 안전선). */
  create or replace view ops.회차_대조 as
  with 돈것 as (
    select j.jobname, count(*) as 돈횟수, max(d.start_time) as 마지막회차,
           count(*) filter (where d.status <> 'succeeded') as SQL층실패,
           (j.command like '%ops.발사(%') as 장부경유
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where d.start_time > now() - interval '24 hours'
     group by j.jobname, j.command
  ), 적힌것 as (
    select jobname, count(*) as 적힌횟수
      from ops.cron_runs
     where queued_at > now() - interval '24 hours'
     group by jobname
  )
  select coalesce(돈것.jobname, 적힌것.jobname)                  as jobname,
         coalesce(돈횟수, 0)                                    as 돈횟수,
         coalesce(적힌횟수, 0)                                   as 적힌횟수,
         /* SQL 직접 잡(장부경유 false)의 회차는 «안 적히는 것이 옳다» — 0 으로 못박는다.
          * 장부에만 남은 잡(돈것 없음 · 장부경유 null)은 원문 셈을 그대로 둔다(음수 = 잡이 걷힌 흔적). */
         case when 장부경유 is false then 0
              else coalesce(돈횟수, 0) - coalesce(적힌횟수, 0) end as 안적힌횟수,
         coalesce(SQL층실패, 0)                                 as SQL층실패,
         마지막회차,
         coalesce(장부경유, true)                                as 장부경유
    from 돈것 full join 적힌것 on 돈것.jobname = 적힌것.jobname;

end
$migration$;

do $migration2$
declare
  expected_checksum constant text := '2f7cc6b9394cebc7503cb931344ca0d60211cd02dc86054cff4ef6f335d88e60'; -- migration-checksum
begin
  if not exists (select 1 from engine.schema_migrations where version = '20260824010000') then
    insert into engine.schema_migrations(version, name, checksum)
    values ('20260824010000', '20260824010000_cron_ledger_recon_c13.sql', expected_checksum);
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
              and (select version from 현재이력)='20260824010000'
              and (select checksum from 현재이력)='2f7cc6b9394cebc7503cb931344ca0d60211cd02dc86054cff4ef6f335d88e60' -- migration-checksum
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

