/* jobs_load 활성일 가드 «복원» — 09-01 이 덮어 지운 것을 되살린다 (2026-09-03)
 *
 * ■ 무슨 일이 있었나 (실측 09-03 · 왕복시험 16벌 전량 실행에서 잡았다)
 *   08-22 `gen_active_guard_c12` 가 jobs_load 에 활성일 가드를 넣었다(표식 skipped_inactive 2군데).
 *   09-01 `confluence_reads_c15` 가 «세층합류 읽기»를 더하려고 같은 함수를 create or replace 하면서
 *   그 가드를 데려오지 않았다 — 파일 실측 2군데 → 0군데. 리허설·운영 «양쪽» 모두 가드가 없었다
 *   (DB 실측: position('skipped_inactive' in pg_get_functiondef(...)) = 0).
 *
 * ■ 무엇이 깨져 있었나
 *   활성 시작일 «이전» 날짜로 배치를 부르면 job 이 선다(생성왕복 B6 실측 created:1).
 *   설계가 막으려던 것은 「큐가 과거를 되짚어 이미 착지한 배정 위에 두 번째 판이 앉는 일」이다.
 *   지금은 실학생 0이라 값이 밖으로 나가지 않았다.
 *
 * ■ 무엇 — jobs_load 재정의 «하나». 09-01 판의 몸을 그대로 두고 잃어버린 둘만 되돌린다:
 *   ㉠ declare 의 `활성일 date;`  ㉡ _targets 검증 뒤의 활성일 가드 블록.
 *   두 조각 다 원본 파일에서 그대로 떠 왔다(옮겨 적기 오타 0).
 *
 * ■ 되돌림: 09-01 판 그대로의 jobs_load 를 create or replace 로 다시 부으면 된다.
 *   delete from engine.schema_migrations where version='20260903000000';
 *
 * 🔑 이 결함을 잡은 검사의 이름이 「덮임 탐지」였다(생성왕복 A1). 잡는 자는 이미 있었는데
 *    그 자가 «안 돌아서» 두 판이 지나도록 몰랐다. 함수를 재정의하는 조각을 쓸 때는
 *    그 함수의 앞선 판 전량을 먼저 훑는다 — grep -c '<표식>' 이 한 줄로 답한다.
 */

begin;

do $migration$
declare
  migration_version constant text := '20260903000000';
  migration_name constant text := '20260903000000_jobs_load_guard_restore_c16.sql';
  expected_checksum constant text := 'cc31d9270f26708adc6aeb5fa079ac953182fee7d98a57d8d75e903d784a5baf'; -- migration-checksum
  base_version constant text := '20260902600000';   -- 체인은 «바로 앞 조각»을 가리킨다(고치려는 판이 아니라)
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
      '이 조각은 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;
end
$migration$;

-- ══════════ ① jobs_load 재정의 — 09-01 판의 몸 + 되살린 활성일 가드 ══════════
-- 🔑 create or replace 라 재적용 멱등이다(생성왕복 A층 §12-21 이 재는 그 성질).
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
  활성일 date;                                    -- 활성일 가드(아래) 전용 — 09-01 판이 이 줄을 잃었다
begin
  select * into run from engine.generation_batch_runs where run_id = _run_id;
  if not found or run.assign_date <> _assign_date then
    raise exception 'jobs_load: _run_id 가 그 날짜의 시작 행이 아니다(A1 — 날짜 결속)';
  end if;
  if _targets is null or jsonb_typeof(_targets) <> 'array' then
    raise exception 'jobs_load: _targets 는 배열이어야 한다';
  end if;

  -- 활성일 가드(§3-2-a C5 · §12-28 «전환» · v5.13-d) — 활성 시작일 «이전» 날짜로 부르면
  -- job 을 하나도 안 만든다(0건 적재): 큐가 과거를 되짚으면 이미 착지한 배정 위에 두 번째
  -- 판이 앉는다. 활성 함수(engine.gen_active_from · 활성 조각 대기 파일이 세운다)가 아직
  -- 없으면 무동작이다 — 동적 execute 라 파스 시점에도 안 죽는다(왕복시험 B층이 함수 없이
  -- 이 RPC 를 직접 잰다 · 행동 불변). 발동은 반환 봉투의 skipped_inactive 하나로 관측한다.
  if to_regprocedure('engine.gen_active_from()') is not null then
    execute 'select engine.gen_active_from()' into 활성일;
    if 활성일 is not null and _assign_date < 활성일 then
      return jsonb_build_object('created', 0, 'existing', 0, 'partial', 0,
                                'skipped_game', 0, 'skipped_inactive', true);
    end if;
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

do $migration2$
declare
  expected_checksum constant text := 'cc31d9270f26708adc6aeb5fa079ac953182fee7d98a57d8d75e903d784a5baf'; -- migration-checksum
begin
  insert into engine.schema_migrations(version, name, checksum)
  values ('20260903000000', '20260903000000_jobs_load_guard_restore_c16.sql', expected_checksum);
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
  ('learners','is_test'),
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
  ('l10n_reviews','supersedes'), ('l10n_reviews','created_at'),
  -- STT 요청판·벤더 보고 언어(20260902500000 · 소급 불가 — 둘째 벤더 전에 선다 · null = 장부 이전)
  ('submissions','stt_model'), ('submissions','stt_lang'),
  -- 학습자 생애 다섯(20260902600000 · 학생ID 종단 설계 v2 §5 ㉣ · 소급 불가 — 나간 날의 값은 그날 사람만 안다)
  ('learners','enrolled_at'), ('learners','observed_at'), ('learners','effective_at'),
  ('learners','exit_reason'), ('learners','lifecycle_status')
), 기대제약(n) as (values
  -- ── c12: CHECK 는 전부 _c13 접미 — 이 조각이 _c11 서른하나를 이름째 교체했다.
  --    UNIQUE·EXCLUDE·FK·PK 는 값목록이 없어 판 판별과 무관하니 c11 이름 그대로다.
  ('learning_events_event_type_c16'), ('learning_events_task_type_c16'),
  ('submissions_task_format_c16'), ('submissions_translation_source_c16'),
  ('submissions_due_paired_c16'), ('corrections_verdict_c16'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c16'), ('staff_role_c16'),
  ('learners_temp_password_paired_c16'),
  ('learning_events_correction_target_c16'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c16'), ('corrections_promotion_intent_c16'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c16'),
  -- 시즌 그릇(20260812140000) — 겹침 배제·날짜 순서·학생×시즌 유일·문항 묶음 + 고리 둘.
  ('season_no_overlap_c11'), ('season_dates_c16'),
  ('season_compass_once_c11'), ('season_compass_answers_c16'),
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey'),
  -- 시즌 회고(20260812170000) — 판정 3갈래 둘 + 「판정·사유·주체·시각 한 벌」 + 고리 둘.
  ('season_review_once_c11'), ('season_review_verdict_c16'),
  ('season_review_self_c16'), ('season_review_decided_c16'),
  ('season_review_learner_id_fkey'), ('season_review_season_id_fkey'),
  -- 가입 1회 문항 값목록(20260812180000) — 세 칸 전부.
  ('learners_home_aimag_c16'), ('learners_gender_c16'), ('learners_goal_track_c16'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  ('classes_pkey'), ('classes_key_nonblank_c16'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  -- 강사 한 마디(20260812210000) — 유일(한 산출물에 하나) + 값목록 둘 + 빈 말 금지 + 고리 둘.
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c16'),
  ('teacher_notes_origin_c16'), ('teacher_notes_disposition_c16'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey'),
  -- 조·좌석 쓰레기 못(20260814100000)
  ('learners_group_no_c16'), ('learners_seat_no_c16'),
  -- companion 빈칸 로그(20260814110000)
  ('companion_qa_question_nonblank_c16'), ('companion_qa_answer_paired_c16'),
  ('companion_qa_staff_id_fkey'),
  -- 생성 실행 장부(20260821120000) — CHECK 34 + FK 3 + UNIQUE 3(전이·계보의 물리).
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
  -- 몽골어 문구 감수(20260826130000)
  ('l10n_strings_id_ascii_c16'), ('l10n_strings_ko_nonblank_c16'),
  ('l10n_strings_max_len_c16'), ('l10n_strings_status_c16'),
  ('l10n_reviews_verdict_c16'), ('l10n_reviews_final_paired_c16'),
  ('l10n_reviews_supersedes_not_self_c16'),
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
     -- 🔴 09-02: 시험 학습자는 이 자의 과녁이 아니다(왕복시험이 심고 안 걷는 행들).
     --    left join + coalesce — learner_id 없는 사건을 join 이 조용히 떨어뜨리면
     --    그 순간 이 자가 「덜 세는」 쪽으로 새고, 새는 방향은 여기서도 「통과」다.
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
  -- c12 가 접미를 갈았다 — 옛 이름을 세면 「적용 전」과 「적용 후」가 같은 0 으로 보인다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('radio')
      and conname='broadcast_segment_kind_c16') as 라디오kind제약,
  (select count(*) from pg_trigger g
     join pg_class c2 on c2.oid=g.tgrelid
    where c2.relnamespace=to_regnamespace('radio')
      and g.tgname='viewer_link_protect' and g.tgenabled in ('O','A')) as 연동보호트리거,
  (select count(*) from pg_indexes
    where schemaname='radio' and indexname='viewer_link_active') as 연동활성유일,
  -- 🔴 09-02: 「시드」를 이름대로 센다 — 옛 셈은 count(*) 라 왕복시험이 심는 test 행까지 셌고,
  --    그래서 리허설만 31(기대 30)로 영원히 ❌ 였다. 그 행은 `tools/왕복시험.js` 가 «일부러»
  --    남긴다(on conflict do nothing 으로 재사용 · 그 행을 참조하는 사건도 append-only 로 남는다).
  --    지우는 게 아니라 «세는 자»를 고치는 자리다.
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
  -- ops 회차 장부(20260815080000) — c12 가 outcome CHECK 접미를 갈았으니 새 이름을 센다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('ops')
      and conname='cron_runs_outcome_c16') as 회차제약,
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
              and 라디오보강열=10 and 라디오보강인덱스=3
              and (select version from 현재이력)='20260903000000'
              and (select checksum from 현재이력)='cc31d9270f26708adc6aeb5fa079ac953182fee7d98a57d8d75e903d784a5baf' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 23·23·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0·1·1·1·10·3 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 이 조각 = engine.jobs_load 활성일 가드 «복원»(09-01 confluence_reads_c15 가 덮어 지운 것) — 표·칸·CHECK 변경 0 · 함수 하나만 다시 만든다.
-- ② 아래 기대 목록은 20260831130000 이 세운 현행 그대로다(변경 0 — 마지막 조각이 이 줄을 든다).
--    ⚠ 이 줄은 마지막 조각이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `season_no_overlap_c11`(EXCLUDE) · `…_once_c11`(UNIQUE) · `companion_qa_*_fkey` 는 여기
--      없다 — CHECK 가 아니라 이 줄의 대상이 아니고, 이름도 c11 그대로 산다(값목록이 없어
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
