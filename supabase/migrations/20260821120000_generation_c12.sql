/* c12 — 상태기반 과제선택의 실행 장부 «물리 계약» 착지 (§3-5-b 전량 · §16-1 #1 ③의 물리 절반)
 *   (정본 = appsscript docs/상태기반_과제선택_설계.md §3-5-b — 「이 절은 규격이 아니라 계약이다.
 *    구현은 이 DDL 과 시그니처를 그대로 쓴다」 · DDL·제약·트리거는 그 절의 SQL 원문 그대로이고,
 *    RPC 본문은 같은 절의 계약(가드·대조 ①~⑩·반환 표·전이표)을 SQL 로 옮긴 것이다.)
 *
 * ■ 무엇이 서나 — 표 3(generation_jobs·generation_attempts·generation_batch_runs) ·
 *   ⓪ 제약 함수 1(level_dist_ok) · freeze 트리거 2 + deferred 제약 트리거 1 ·
 *   권한(RLS 3 · revoke) · RPC 10(⓪ batch_run_start ~ ㉨ jobs_load_one).
 *
 * ■ 여기 «없는» 것 — cron 3잡(generate-worker·generate-deadline 신설 + deliver-check 변경)과
 *   «활성 시작일» 상수. §3-2-a C5 가 「활성 시작일부터만 등록한다 · 값은 배포 커밋에서 정하고
 *   마이그에 적는다」로 못박았고 그 값의 정의는 v5.8 갈래 12 「c12 신앱이 스토어에 나간 뒤」다 —
 *   신앱이 아직 스토어에 없으므로 그 값은 지금 정할 수 없고, 자리표로 박으면 거짓 상수다.
 *   ⇒ cron 등록·감시 7항 개정·`jobs_load` 활성일 가드는 **활성 조각**(스토어 출시 커밋과 한 벌)이
 *   진다. 그 전까지 이 물리는 「아무도 안 부르는 계약」으로 서 있는 것이 정확한 상태다(라이브
 *   경로가 그 날들을 진다 — C5).
 *
 * ■ 적용 순서(§3-5-b v5.11 — 어느 문장도 자기보다 아래에서 처음 만들어지는 대상을 참조하지 않는다):
 *   ⓪ 제약이 부르는 함수 → ① 표 → ② 제약·인덱스·트리거 → ③ 권한 → ④ RPC. (⑤ cron 은 활성 조각)
 *
 * 되돌림: drop function engine.jobs_load_one, engine.jobs_finalize_due, engine.jobs_release,
 *          engine.jobs_reclaim, engine.jobs_finalize, engine.attempt_close, engine.attempt_open,
 *          engine.jobs_claim, engine.jobs_load, engine.batch_run_start, engine.gen_deadline,
 *          engine.gen_leader_grace, engine.gen_parse_sentence, engine.level_dist_ok cascade;
 *        drop table engine.generation_attempts, engine.generation_jobs,
 *          engine.generation_batch_runs cascade;
 *        delete from engine.schema_migrations where version='20260821120000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260821120000';
  migration_name constant text := '20260821120000_generation_c12.sql';
  expected_checksum constant text := '4c6946fc912ad5749151dabea0d4bab08a6c3dad800dbe5b78367ed92380f67b'; -- migration-checksum
  base_version constant text := '20260821060000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c12 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- ══════════ ⓪ 제약이 부르는 함수 — 표보다 «먼저» 선다 ══════════
  -- CHECK 는 서브쿼리를 못 쓰므로 집합 검사(키 수·값 합계)는 immutable 함수로 감싼다(§3-5-b ⓪).
  create or replace function engine.level_dist_ok(_d jsonb, _enrolled int) returns boolean
    language sql immutable as $function$
    select _d is not null
       and jsonb_typeof(_d) = 'object'
       -- ① 목록 «밖» 키 거절 — `?&` 는 일곱이 다 있나만 보고 여덟째를 안 막는다.
       and (select count(*) from jsonb_object_keys(_d)) = 7
       -- ② 각 값은 «비음수 정수» — 문자열·null·음수·소수를 전부 거른다.
       and not exists (
         select 1 from jsonb_each(_d) e(k, v)
          where jsonb_typeof(v) <> 'number'
             or (v #>> '{}')::numeric < 0
             or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
       )
       -- ③ 합 = 그날 재적 수. §12-8 분모와 §8-B E8 배분이 이 등식 위에 선다.
       and (select coalesce(sum((v #>> '{}')::numeric), -1) from jsonb_each(_d) e(k, v)) = _enrolled;
  $function$;

  /* 배달 마감 시각의 «SQL 층 원천 하나» — ㉡ 집기 가드·㉤ 정상 거절이 같은 값을 읽는다(B3 —
   * 두 곳에 적으면 갈린다). 값 = 배정일 «다음날» 06:00 Asia/Ulaanbaatar(§3-2 상수 표
   * `배달마감_시각`). 오프셋 상수를 코드에 안 적는다 — DB 에게 시킨다(c10 due.v1 선례). */
  create or replace function engine.gen_deadline(_assign_date date) returns timestamptz
    language sql immutable as $function$
    select ((_assign_date + 1)::timestamp + time '06:00') at time zone 'Asia/Ulaanbaatar';
  $function$;

  /* 실행 리더 여유(§3-2 상수 표 `실행리더여유_MS` = 900000 = 15분)의 «한 원천» — ⓪ 리더
   * 게이트와 감시 ②-b(활성 조각)가 같은 하나를 읽는다(v5.12 — 갈리면 「죽었다」와 「살아 있다」가
   * 동시에 참인 창이 열리고, 그 창에서는 학생이 빈손인데 아무도 못 고친다). */
  create or replace function engine.gen_leader_grace() returns interval
    language sql immutable as $function$ select interval '900000 milliseconds'; $function$;

  /* 승자 시도의 원응답에서 §5-3 파서가 읽는 {sentence, question} 을 «같은 규칙으로» 꺼낸다 —
   * ㉤ 대조 ⑥(산출 바이트: 사건 output_text·프롬프트 = 원응답의 그 값)의 재료. 벤더 봉투 모양
   * (Anthropic Messages: content[0].text 가 구조화 출력 JSON)은 lib/과제생성.js 파서와 «같은
   * 원천»이다 — 벤더를 갈면 둘을 같이 간다(§12 픽스처가 두 층의 동치를 잰다). 파싱이 안 되는
   * 원응답으로 «성공» 착지가 오면 그 자체가 계보 결함이라 null 을 내고 ㉤ 가 예외로 죽인다.
   * 🔴 v5.13-b — §8 정규화(NFC → 공백류 1칸 → 앞뒤 제거)를 «여기서도» 건다. §7 이 사건에
   *   싣는 바이트를 「검문(정규화 후)이 본 것」으로 못박았으므로, 이 파서가 원문 그대로를 내면
   *   모델이 앞뒤 공백 하나만 붙여도 대조 ⑥ 이 정상 착지를 죽인다(갈리는 두 정본). 공백 클래스는
   *   JS `\s` 의 유니코드 목록을 명시로 편다 — PG `\s`(=[[:space:]]) 는 U+00A0 등을 안 물어
   *   「같은 정규화」가 로케일에 따라 거짓이 된다. 동치는 §12 픽스처가 잰다. */
  create or replace function engine.gen_parse_sentence(_raw text)
    returns table (sentence text, question text)
    language sql immutable as $function$
    with 본 as (
      select case when _raw is null then null
                  else (_raw::jsonb -> 'content' -> 0 ->> 'text')::jsonb end as j
    ),
    값 as (select j ->> 'sentence' as s, j ->> 'question' as q from 본)
    select
      btrim(regexp_replace(normalize(s, NFC),
        '[\f\n\r\t\v \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'), ' '),
      btrim(regexp_replace(normalize(q, NFC),
        '[\f\n\r\t\v \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'), ' ')
    from 값;
  $function$;

  -- ══════════ ① 표 — jobs → attempts → batch_runs (FK 는 ② 에서) ══════════
  -- ① 일감 장부 — 오케스트레이터가 큐를 만들 때 «전량» 쓴다. 대상 분모의 «저장된» 정본.
  create table if not exists engine.generation_jobs (
    job_id             uuid primary key default gen_random_uuid(),
    learner_id         uuid not null references engine.learners(learner_id),
    assign_date        date not null,                  -- Asia/Ulaanbaatar (§11-4 · F군)
    -- 이 job 을 만든 «실행»(④ batch_runs.run_id) — 구제도 자기 시작 행을 만들므로 전량 not null
    -- (v5.9 갈래 1 — null 이면 복합 FK 의 날짜 결속 검사 자체가 사라진다 · MATCH SIMPLE).
    batch_run_id       uuid not null,
    status             text not null default '대기'
                       check (status in ('대기','claimed','착지','마감폴백','대상아님','적재실패')),
    -- 상태를 «언제 기준으로» 읽을지 — ④ 시작 행 값을 jobs_load 가 상속한다(A6 · 배치 한 벌).
    snapshot_as_of     timestamptz not null,
    -- 「왜 대상이었나」의 선판정 «출력» 봉투(C1) — 상태 «값»은 안 싣는다(§6-2).
    branch_snapshot    jsonb not null,
    -- 겨냥한 기술을 «생성 전에» 고른다(사후 합리화 차단 · §6-0).
    skill_ids          text[] not null default '{}',
    skill_taxonomy_ver text not null,
    -- 「왜 대상이 아니었나」(B4) — §7-1 초급 도달률 분포(§12-8)의 재료.
    not_target_reason  text check (not_target_reason in ('첫날','교정문','초급','미정')),
    -- 폴백 착지 재료 — `적재실패` 만 빼고 전량 필수(A1 · C1 「전량」).
    event_draft        jsonb,
    load_error         text,   -- 조립 실패 원인(200자 절단) · 재적재·구제가 되살려도 보존(A2)
    -- 최초 실패의 계보 3칸(A13) — 갱신표가 덮지 않는다.
    load_failed_at     timestamptz,
    load_fail_run_id   uuid,
    load_retry_count   int not null default 0,
    -- 펜싱(A5) — 집기와 마감 스윕에서만 +1(회수는 안 올린다 · 전이표).
    fence              bigint not null default 0,
    owner              text,                           -- 워커 실행 id (claimed 중에만)
    lease_until        timestamptz,
    -- 배치 실행판 봉투(V6-3 · A14) — jobs_load 가 ④ 시작 행 값을 전 행에 박는다.
    model              text not null,
    prompt_ver         text not null,
    policy_ver         text not null,
    estimator_version  text not null,
    schema_ver         text not null,
    -- 값목록을 물리로(V6-5) — «행에 남는» 15값(§4-1 산술 · `이미배정` 은 응답 전용).
    outcome            text check (outcome is null or outcome in (
                         '성공','대상아님','구제경로','키없음','예산소진','타임아웃','벤더오류',
                         '응답파손','입력초과','응답초과','검문탈락','상태없음','상태오류','내부오류',
                         '판불일치')),
    assigned_event_id  uuid references engine.learning_events(event_id),
    winning_attempt_id uuid,                           -- FK 는 attempts 가 선 뒤(③)
    deciding_attempt_id uuid,                          -- 실패 쪽 계보(A8) · FK 는 ③
    created_at         timestamptz not null default now(),
    closed_at          timestamptz,
    -- 하루 한 학생 한 일감 — 재실행이 큐를 두 배로 만들지 않는다.
    unique (learner_id, assign_date),
    -- 한 배정 사건에 두 job 금지(B3 — 이중 착지의 마지막 문).
    unique (assigned_event_id),
    -- 종료 3상태는 전부 outcome·closed_at 을 갖는다(B3).
    constraint jobs_terminal_cols_c12 check (
      status not in ('착지','마감폴백','대상아님','적재실패')
      or (outcome is not null and closed_at is not null)
    ),
    -- 닻은 종료 «셋»만 요구한다 — `적재실패` 는 사건을 지어내지 않는다(A9).
    constraint jobs_anchor_present_c12 check (
      status not in ('착지','마감폴백','대상아님') or assigned_event_id is not null
    ),
    constraint jobs_load_failed_cols_c12 check (
      status <> '적재실패' or (outcome = '내부오류' and assigned_event_id is null
                               and event_draft is null and load_error is not null)
    ),
    -- status×outcome 조합을 값 단위로(A6 · A9 역방향 — `착지` 는 보집합으로 · 사본 금지).
    constraint jobs_status_outcome_pairs_c12 check (
      case status
        when '대상아님' then outcome = '대상아님'
        when '마감폴백' then outcome = '예산소진'
        when '적재실패' then outcome = '내부오류'
        when '착지'     then outcome is null or outcome not in ('대상아님','예산소진')
        else true
      end
    ),
    -- draft 는 `적재실패` 만 빼고 필수(A1 — C1 「전량」의 물리).
    constraint jobs_draft_present_c12 check (status = '적재실패' or event_draft is not null),
    -- 결정 시도는 «시도가 있었던 실패» 여섯에만(A8 · A4 — CASE 로 3값 구멍을 닫는다).
    constraint jobs_deciding_scope_c12 check (
      case when outcome is null then deciding_attempt_id is null
           when outcome in ('검문탈락','타임아웃','벤더오류','응답파손','입력초과','응답초과')
             then deciding_attempt_id is not null
           else deciding_attempt_id is null
      end
    ),
    -- 비종료 상태에 종료 칸이 하나라도 들어가면 거절(A4 — 칸별).
    constraint jobs_nonterminal_cols_c12 check (
      status in ('착지','마감폴백','대상아님','적재실패')
      or (outcome is null and closed_at is null and assigned_event_id is null
          and winning_attempt_id is null)
    ),
    -- 승자는 «생성이 실제로 나간 날» 하나(A1 — 키는 outcome).
    constraint jobs_winner_present_c12 check (outcome <> '성공' or winning_attempt_id is not null),
    constraint jobs_winner_only_success_c12 check (winning_attempt_id is null or outcome = '성공'),
    -- 생성 대상 job 의 겨냥은 1~2개(§6-0 · A12) — 비대상·적재실패는 예외.
    constraint jobs_skill_ids_present_c12 check (
      status = '적재실패' or not_target_reason is not null
      or cardinality(skill_ids) between 1 and 2
    ),
    -- 실행판 여섯 비공백(A14 · A12 btrim — 공백 문자열이 판 대조를 정상으로 통과하지 않게).
    constraint jobs_ver_nonempty_c12 check (
      btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> ''
      and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> ''
    ),
    constraint jobs_idle_cols_c12   check (status <> '대기'    or (owner is null and lease_until is null)),
    constraint jobs_claim_cols_c12  check (status <> 'claimed' or (owner is not null and lease_until is not null)),
    -- 편방향(A4 뒷단 처방 기각 그대로) — 역방향은 deferred 트리거가 커밋 시점에 진다(갈래 10).
    constraint jobs_nontarget_cols_c12 check (status <> '대상아님' or not_target_reason is not null)
  );

  -- ② 시도 장부 — append-only(A3 재정의: 행 삭제·값 덮어쓰기 금지 · 응답 칸의 1회 채움만).
  create table if not exists engine.generation_attempts (
    attempt_id       uuid primary key default gen_random_uuid(),
    job_id           uuid not null references engine.generation_jobs(job_id),
    attempt_no       int  not null,
    fence            bigint not null,                  -- 그 시도가 어느 claim 세대인지
    owner            text not null,
    model            text not null,                    -- §5-2 세 판 표
    prompt_ver       text not null,
    policy_ver       text not null,
    estimator_version text not null,
    schema_ver       text not null,                    -- 실행판 여섯(A5 — 층마다 같은 폭)
    skill_taxonomy_ver text not null,
    -- «호출 전에» 쓴다(착지 못해도 남는다) — 입력초과도 행을 만들고 전문 보존(C2·C3).
    request_body     text not null,
    requested_at     timestamptz not null default now(),
    -- 성공·실패 «모두» 보존(C6) — usage·request-id 가 이 안에 산다. 못 받았으면 null.
    raw_response     text,
    responded_at     timestamptz,
    result           text check (result in
                       ('성공','검문탈락','타임아웃','벤더오류','응답파손','입력초과','응답초과')),
    gate_failed_reasons text[],                        -- result='검문탈락' 일 때만 · §4-1 7값
    unique (job_id, attempt_no),
    -- 복합 FK 가 물릴 자리(V6-7) — 「같은 job 의 시도인가」를 DB 가 본다.
    unique (attempt_id, job_id),
    constraint attempts_ver_nonempty_c12 check (
      btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> ''
      and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> ''
    )
  );

  -- ④ 배치 실행 표식 — 「돌았는데 0」과 「안 돌았다」를 가른다. 실행마다 append(A1 · 덮기 0).
  create table if not exists engine.generation_batch_runs (
    run_id          uuid primary key default gen_random_uuid(),
    assign_date     date not null,
    -- 실행의 «종류»(v5.9 갈래 16·22) — 구제 행은 등식·감시 분모 밖.
    run_kind        text not null check (run_kind in ('배치','구제')),
    started_at      timestamptz not null default now(),
    -- 배치 기준시각 — 한 벌(A6). 시작 행에 굳고 jobs_load 가 전 job 에 상속한다.
    snapshot_as_of  timestamptz not null,
    -- 그날이 달력 게임일이었나(B6) — 0-job 날의 원인이 사후에 갈리게.
    calendar_game_day boolean not null,
    -- 그날의 재적 수를 적재 시점에 굳힌다(D7) — 재현 불가능한 분모는 분모가 아니다.
    enrolled_count  int not null,
    -- 명단 스냅샷(A2) — 「전원 누락」이 감시를 다 통과하던 자리. 규격 = v5.9 갈래 21:
    -- 소문자 uuid 를 바이트 오름차순(collate "C") 정렬 · \n 연결 · UTF-8 SHA-256 소문자 hex 전문.
    roster_hash        text not null,
    -- 급수 분포 — 키 = A10 값목록 + "null" 전량 존재(값·합계는 ⓪ 함수가 진다 · 갈래 3).
    level_distribution jsonb not null
                       check (level_distribution ?& array['Lv1','Lv2','Lv3','Lv4','Lv5','Lv6','null']),
    -- 실행판 여섯 — 「그 실행이 쓴 판」(0-job 날에도 남는다 · A5 — jobs 의 것과 다른 사실).
    model              text not null,
    prompt_ver         text not null,
    policy_ver         text not null,
    estimator_version  text not null,
    schema_ver         text not null,
    skill_taxonomy_ver text not null,
    -- 적재가 끝나야 아는 값들 — nullable(A4 · 둘 다 null + finished_at null = 도중에 죽었다).
    target_count    int,                   -- 대상 식의 정본 = §3-6 분모 표 ⓑ(여기 다시 안 적는다)
    loaded_count    int,                   -- 만든 job 총수(대상아님·적재실패 포함)
    skipped_game_count     int,            -- 계정 등식의 나머지 항(A2)
    skipped_existing_count int,
    partial_count   int,                   -- C5 결손 수의 영속(B2)
    finished_at     timestamptz,           -- null = 도중에 죽었다
    constraint batch_runs_counts_pair_c12 check ((target_count is null) = (loaded_count is null)),
    -- 🔴 v5.13-c: `target <= loaded` 를 걷었다 — target 은 «날짜» 분모(§3-6 ⓑ), loaded 는 «이 실행»
    --    행 수라 재실행(B10)에서 순서가 원리상 안 선다(선행 실행의 대상 job 이 날짜 분모에 남는다).
    --    생성왕복시험 B4 실측 — 정당한 재적재 완주 채움이 여기서 죽었다.
    constraint batch_runs_counts_order_c12 check (
      target_count is null
      or (target_count >= 0 and loaded_count <= enrolled_count)
    ),
    constraint batch_runs_enrolled_nonneg_c12 check (enrolled_count >= 0),
    constraint batch_runs_level_dist_ok_c12
      check (engine.level_dist_ok(level_distribution, enrolled_count)),
    constraint batch_runs_ver_nonempty_c12 check (
      btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> ''
      and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> ''
    ),
    constraint batch_runs_partial_pair_c12 check ((partial_count is null) = (loaded_count is null)),
    constraint batch_runs_partial_range_c12 check (
      partial_count is null or (partial_count >= 0 and partial_count <= enrolled_count)
    ),
    -- 두 skip 칸의 부호·상한(갈래 9) — 등식은 «합», 이건 «각 항».
    constraint batch_runs_skipped_range_c12 check (
      (skipped_game_count is null
       or (skipped_game_count >= 0 and skipped_game_count <= enrolled_count))
      and (skipped_existing_count is null
       or (skipped_existing_count >= 0 and skipped_existing_count <= enrolled_count))
    ),
    constraint batch_runs_finished_cols_c12 check (
      finished_at is null
      or (target_count is not null and loaded_count is not null and partial_count is not null
          and skipped_game_count is not null and skipped_existing_count is not null)
    ),
    -- 계정 등식(A2 · 다섯 항) — 배치 행만(갈래 22 · 구제는 원리상 안 선다).
    constraint batch_runs_roster_equation_c12 check (
      finished_at is null or run_kind <> '배치'
      or (loaded_count + skipped_game_count + skipped_existing_count = enrolled_count)
    )
  );

  -- ══════════ ② 제약·인덱스·트리거 — 표가 «전부» 선 뒤 ══════════
  -- 검문탈락 쌍조건 + 빈 배열(A2 — cardinality · CHECK 는 NULL 을 거절하지 않는다).
  begin
    alter table engine.generation_attempts
      add constraint attempts_result_gate_c12 check (
        case when result = '검문탈락'
             then gate_failed_reasons is not null and cardinality(gate_failed_reasons) >= 1
             else gate_failed_reasons is null
        end
      );
  exception when duplicate_object then null; end;
  -- 원응답 없이 영구 종결하는 길을 막는다(A5) — 왔어야 하는 결과 넷.
  begin
    alter table engine.generation_attempts
      add constraint attempts_response_present_c12 check (
        result is null
        or result not in ('성공','검문탈락','응답파손','응답초과')
        or (raw_response is not null and responded_at is not null)
      );
  exception when duplicate_object then null; end;
  -- 사유 원소 허용목록(§4-1 7값) — 순서·중복은 ㉣ 이 예외로 거절한다(C8 · CHECK 는 서브쿼리 불가).
  begin
    alter table engine.generation_attempts
      add constraint attempts_gate_values_c12 check (
        gate_failed_reasons is null or gate_failed_reasons <@ array[
          '길이','한국어비율','빈출력','금칙서식','질문형태','식별자역유입','중복']::text[]
      );
  exception when duplicate_object then null; end;
  -- 승자·결정 FK 의 과녁 유일키(V6-7 · A3).
  begin
    alter table engine.generation_attempts
      add constraint attempts_id_job_result_uk unique (attempt_id, job_id, result);
  exception when duplicate_object then null; end;
  begin
    alter table engine.generation_attempts
      add constraint attempts_id_job_fence_result_uk unique (attempt_id, job_id, fence, result);
  exception when duplicate_object then null; end;

  alter table engine.generation_jobs add column if not exists winning_result text;
  alter table engine.generation_jobs add column if not exists winning_fence bigint;
  alter table engine.generation_jobs add column if not exists deciding_result text;
  -- 한 블록 한 제약(F1 — 첫 제약이 있으면 나머지가 조용히 스킵되는 꼴을 안 만든다).
  begin
    alter table engine.generation_jobs
      add constraint jobs_winner_result_only_success_c12
        check (winning_result is null or winning_result = '성공');
  exception when duplicate_object then null; end;
  begin
    alter table engine.generation_jobs
      add constraint jobs_winner_result_pair_c12
        check ((winning_attempt_id is null) = (winning_result is null));
  exception when duplicate_object then null; end;
  begin
    alter table engine.generation_jobs
      add constraint jobs_winner_fence_pair_c12
        check ((winning_attempt_id is null) = (winning_fence is null));
  exception when duplicate_object then null; end;
  begin
    alter table engine.generation_jobs
      add constraint jobs_winner_fence_current_c12
        check (winning_fence is null or winning_fence = fence);
  exception when duplicate_object then null; end;
  begin
    alter table engine.generation_jobs
      add constraint jobs_winning_attempt_fk
      foreign key (winning_attempt_id, job_id, winning_fence, winning_result)
      references engine.generation_attempts(attempt_id, job_id, fence, result);
  exception when duplicate_object then null; end;
  begin
    alter table engine.generation_jobs
      add constraint jobs_deciding_pair_c12
        check ((deciding_attempt_id is null) = (deciding_result is null));
  exception when duplicate_object then null; end;
  begin
    alter table engine.generation_jobs
      add constraint jobs_deciding_result_matches_c12
        check (deciding_result is null or deciding_result = outcome);
  exception when duplicate_object then null; end;
  begin
    alter table engine.generation_jobs
      add constraint jobs_deciding_attempt_fk
      foreign key (deciding_attempt_id, job_id, deciding_result)
      references engine.generation_attempts(attempt_id, job_id, result);
  exception when duplicate_object then null; end;
  -- jobs → 실행 복합 FK(A1) — 날짜를 결속한다.
  begin
    alter table engine.generation_batch_runs
      add constraint batch_runs_run_date_uq unique (run_id, assign_date);
  exception when duplicate_object then null; end;
  begin
    alter table engine.generation_jobs
      add constraint jobs_batch_run_fk
      foreign key (batch_run_id, assign_date)
      references engine.generation_batch_runs(run_id, assign_date);
  exception when duplicate_object then null; end;

  create index if not exists generation_jobs_pick_order
    on engine.generation_jobs (assign_date, status, learner_id);
  create index if not exists batch_runs_by_date
    on engine.generation_batch_runs (assign_date, started_at);
end
$migration$;

-- 트리거 함수 셋 — do 블록 밖(중첩 $function$ 딜리미터 사정) · create or replace 라 멱등이다.
-- 선판정 스냅샷의 불변을 «전이»로 정의한다(갈래 1 — 되돌리는 전이 `적재실패→대기` 하나만 연다).
create or replace function engine.generation_jobs_freeze() returns trigger
  language plpgsql as $function$
begin
  if OLD.status = '적재실패' and NEW.status = '대기' then
    return NEW;
  end if;
  if NEW.branch_snapshot  is distinct from OLD.branch_snapshot
  or NEW.event_draft      is distinct from OLD.event_draft
  or NEW.snapshot_as_of   is distinct from OLD.snapshot_as_of
  or NEW.batch_run_id     is distinct from OLD.batch_run_id then
    raise exception 'generation_jobs: 선판정 스냅샷은 고치지 않는다 — 계보가 거짓이 된다 (설계 §3-5-b · 예외는 되돌리는 전이 «적재실패→대기» 하나)';
  end if;
  return NEW;
end
$function$;
drop trigger if exists generation_jobs_freeze on engine.generation_jobs;
create trigger generation_jobs_freeze before update on engine.generation_jobs
  for each row execute function engine.generation_jobs_freeze();

-- 비대상 사유가 붙은 job 은 «커밋 시점에» 대상아님이어야 한다(갈래 10 — deferred 라 적재
-- 트랜잭션 안의 「대기+사유」 중간 상태는 살고, finalize 를 빠뜨린 커밋만 거절된다).
create or replace function engine.jobs_nontarget_settled() returns trigger
  language plpgsql as $function$
begin
  if exists (
    select 1 from engine.generation_jobs
     where job_id = NEW.job_id
       and not_target_reason is not null
       and status <> '대상아님'
  ) then
    raise exception '비대상 사유가 붙은 job 이 «대상아님» 이 아닌 채 커밋된다 — 워커가 집어 학생에게 낸다 (설계 §3-5-b · 13회차 갈래 10 · job_id=%)', NEW.job_id;
  end if;
  return null;
end
$function$;
drop trigger if exists jobs_nontarget_settled on engine.generation_jobs;
create constraint trigger jobs_nontarget_settled
  after insert or update on engine.generation_jobs
  deferrable initially deferred
  for each row
  when (NEW.not_target_reason is not null and NEW.status <> '대상아님')
  execute function engine.jobs_nontarget_settled();

-- 실행 장부의 계보 불변(갈래 18) — 갱신 가능 = 완주 채움 여섯 칸뿐(화이트리스트 — 새 칸이
-- 늘어도 닫힌 채로 실패한다 · 시끄럽고 되돌릴 수 있는 쪽을 고른다).
create or replace function engine.generation_batch_runs_freeze() returns trigger
  language plpgsql as $function$
declare
  mutable_cols constant text[] := array[
    'target_count','loaded_count','skipped_game_count','skipped_existing_count',
    'partial_count','finished_at'];
begin
  if to_jsonb(NEW) - mutable_cols is distinct from to_jsonb(OLD) - mutable_cols then
    raise exception 'generation_batch_runs: 실행 계보는 고치지 않는다 — job 과 run 의 판이 갈리면 감시·재현·성과 귀속이 전부 거짓이 된다 (설계 §3-5-b · 갱신 가능 = 완주 채움 여섯 칸뿐)';
  end if;
  return NEW;
end
$function$;
drop trigger if exists generation_batch_runs_freeze on engine.generation_batch_runs;
create trigger generation_batch_runs_freeze before update on engine.generation_batch_runs
  for each row execute function engine.generation_batch_runs_freeze();

-- ══════════ ③ 권한 — 표·제약·트리거가 «전부» 선 뒤(갈래 9 · 갈래 18·19) ══════════
-- append-only 를 권한이 진다(V6-8) — RPC(security definer) 열만이 통로.
revoke insert, update, delete on engine.generation_attempts from anon, authenticated, service_role;
alter table engine.generation_jobs       enable row level security;
alter table engine.generation_attempts   enable row level security;
alter table engine.generation_batch_runs enable row level security;
revoke all on table engine.generation_jobs, engine.generation_batch_runs,
  engine.generation_attempts
  from anon, authenticated;

-- ══════════ ④ RPC 열 — 전이는 이 열 밖에서 일어나지 않는다(전부 security definer) ══════════

-- ⓪ 시작 행(A3) — 배치 실행의 «존재 증거». 날짜 리더 게이트(갈래 11) 포함.
create or replace function engine.batch_run_start(
  _assign_date date, _run_kind text, _batch jsonb, _enrolled jsonb default null)
  returns uuid
  language plpgsql security definer set search_path = engine, public as $function$
declare
  정본 engine.generation_batch_runs%rowtype;
  새행 engine.generation_batch_runs%rowtype;
  명단해시 text;
  분포 jsonb;
  재적 int;
begin
  if _run_kind not in ('배치','구제') then
    raise exception 'batch_run_start: _run_kind 는 배치·구제 뿐이다 — %', _run_kind;
  end if;
  if _batch is null or jsonb_typeof(_batch) <> 'object' then
    raise exception 'batch_run_start: _batch(실행판 봉투)가 객체가 아니다';
  end if;

  if _run_kind = '구제' then
    /* 구제는 _enrolled 를 «안 받는다»(갈래 22) — 명단 세 칸은 그 날짜 정본 실행에서 복사한다.
     * 정본 실행이 0이면(배치 전멸일) ㉯: 그 시각 명단을 직접 읽는다(v5.13 ⓓ-14 — 구제 행은
     * 등식·감시 분모 밖이라 오염이 0이다. 이 조회가 도는 날은 정의상 전멸일뿐이라 평시 비용 0). */
    if _enrolled is not null then
      raise exception 'batch_run_start: 구제는 _enrolled 를 받지 않는다 — 명단은 정본 실행에서 복사한다(갈래 22)';
    end if;
    select * into 정본 from engine.generation_batch_runs r
     where r.assign_date = _assign_date and r.run_kind = '배치' and r.finished_at is not null
     order by r.started_at desc limit 1;
    if found then
      재적 := 정본.enrolled_count; 명단해시 := 정본.roster_hash; 분포 := 정본.level_distribution;
    else
      select count(*),
             coalesce(jsonb_object_agg(급수, 수), '{}'::jsonb)
        into 재적, 분포
        from (
          select coalesce(l.level_current, 'null') as 급수, count(*) as 수
            from engine.learners l group by 1) d;
      -- 키 전량 보장 — 없는 급수는 0 으로 채운다(CHECK ?& 가 일곱 전부를 요구한다).
      select jsonb_object_agg(k, coalesce(분포 -> k, '0'::jsonb))
        into 분포
        from unnest(array['Lv1','Lv2','Lv3','Lv4','Lv5','Lv6','null']) k;
      select coalesce(sum((v #>> '{}')::int), 0) into 재적 from jsonb_each(분포) e(k, v);
      select encode(extensions.digest(
               convert_to(coalesce(string_agg(lid, E'\n' order by lid collate "C"), ''), 'UTF8'),
               'sha256'), 'hex')
        into 명단해시
        from (select learner_id::text as lid from engine.learners) m;
    end if;
  else
    /* 배치 — 리더 게이트(갈래 11): 검사와 삽입 사이 경합을 advisory 잠금으로 닫고,
     * 살아 있는 미완 리더가 있으면 새 행 없이 null(예외 아님 — 물러남은 사고가 아니다). */
    perform pg_advisory_xact_lock(hashtext('gen:batch:' || _assign_date::text));
    if exists (
      select 1 from engine.generation_batch_runs r
       where r.assign_date = _assign_date and r.run_kind = '배치'
         and r.finished_at is null
         and r.started_at > now() - engine.gen_leader_grace()
    ) then
      return null;
    end if;
    if _enrolled is null or jsonb_typeof(_enrolled) <> 'object' then
      raise exception 'batch_run_start: 배치는 _enrolled(명단 봉투)가 필수다';
    end if;
    재적 := (_enrolled ->> 'enrolled_count')::int;
    명단해시 := _enrolled ->> 'roster_hash';
    분포 := _enrolled -> 'level_distribution';
  end if;

  insert into engine.generation_batch_runs (
    assign_date, run_kind, snapshot_as_of, calendar_game_day,
    enrolled_count, roster_hash, level_distribution,
    model, prompt_ver, policy_ver, estimator_version, schema_ver, skill_taxonomy_ver)
  values (
    _assign_date, _run_kind,
    coalesce((_batch ->> 'snapshot_as_of')::timestamptz, now()),
    (_batch ->> 'calendar_game_day')::boolean,
    재적, 명단해시, 분포,
    _batch ->> 'model', _batch ->> 'prompt_ver', _batch ->> 'policy_ver',
    _batch ->> 'estimator_version', _batch ->> 'schema_ver', _batch ->> 'skill_taxonomy_ver')
  returning * into 새행;
  return 새행.run_id;
end
$function$;

-- ㉡ 집기(SKIP LOCKED) — 회전 정렬은 계약 문장 그대로(G7 · D4 md5).
create or replace function engine.jobs_claim(
  _assign_date date, _owner text, _count int, _lease_sec int, _learner uuid default null)
  returns setof engine.generation_jobs
  language plpgsql security definer set search_path = engine, public as $function$
declare
  상한 constant int := 3;   -- 워커학생상한(§3-2 — 150÷생성타임아웃 파생 · 판지문 재료 5)
  총수 bigint;
  시작학생 uuid;
begin
  if _count > 상한 then
    raise exception 'jobs_claim: _count % 가 워커학생상한 % 를 넘는다 (V6-28)', _count, 상한;
  end if;
  -- 마감 시각 조건(B3) — 집기 자체가 마감 «계약»의 일부다.
  if now() >= engine.gen_deadline(_assign_date) then
    return;
  end if;
  select count(*) into 총수 from engine.generation_jobs
   where assign_date = _assign_date and status = '대기'
     and (_learner is null or learner_id = _learner);
  if 총수 = 0 then
    return;   -- 0 나눗셈 방지(A11) — 무대상일이 cron 오류로 안 바뀐다.
  end if;
  select learner_id into 시작학생 from (
    select learner_id, row_number() over (order by learner_id) - 1 as rn
      from engine.generation_jobs
     where assign_date = _assign_date and status = '대기'
       and (_learner is null or learner_id = _learner)) t
   where rn = mod(('x'||substr(md5(_assign_date::text),1,8))::bit(32)::int::bigint
                  + 2147483648, 총수);
  return query
    update engine.generation_jobs j
       set status = 'claimed', owner = _owner,
           lease_until = now() + make_interval(secs => _lease_sec),
           fence = j.fence + 1
     where j.job_id in (
       select job_id from engine.generation_jobs
        where assign_date = _assign_date and status = '대기'
          and (_learner is null or learner_id = _learner)
        order by (learner_id < 시작학생), learner_id   -- false(0) 먼저 = 시작부터 돌아 감싼다
        for update skip locked
        limit _count)
    returning j.*;
end
$function$;

-- ㉢ 시도 열기 — 벤더를 부르기 «전». 여섯 판 대조·중복열림(세대 불문)·거절 사유.
create or replace function engine.attempt_open(
  _job_id uuid, _fence bigint, _model text, _prompt_ver text,
  _policy_ver text, _estimator_version text,
  _schema_ver text, _skill_taxonomy_ver text,
  _request_body text)
  returns table (attempt_id uuid, reject_reason text)
  language plpgsql security definer set search_path = engine, public as $function$
#variable_conflict use_column
declare
  j engine.generation_jobs%rowtype;
  새 uuid;
  다음번 int;
begin
  select * into j from engine.generation_jobs where job_id = _job_id for update;
  if not found or j.status <> 'claimed' then
    return query select null::uuid, '상태불일치'::text; return;
  end if;
  if j.fence <> _fence then
    return query select null::uuid, '펜스불일치'::text; return;
  end if;
  if j.model <> _model or j.prompt_ver <> _prompt_ver or j.policy_ver <> _policy_ver
     or j.estimator_version <> _estimator_version or j.schema_ver <> _schema_ver
     or j.skill_taxonomy_ver <> _skill_taxonomy_ver then
    return query select null::uuid, '판불일치'::text; return;
  end if;
  -- 같은 job · 같은 본문 · «열린» 시도면 세대를 안 가리고 거절(갈래 12 — 중복 과금 차단).
  if exists (
    select 1 from engine.generation_attempts a
     where a.job_id = _job_id and a.result is null and a.request_body = _request_body
  ) then
    return query select null::uuid, '중복열림'::text; return;
  end if;
  select coalesce(max(a.attempt_no), 0) + 1 into 다음번
    from engine.generation_attempts a where a.job_id = _job_id;
  insert into engine.generation_attempts (
    job_id, attempt_no, fence, owner,
    model, prompt_ver, policy_ver, estimator_version, schema_ver, skill_taxonomy_ver,
    request_body)
  values (_job_id, 다음번, _fence, j.owner,
          _model, _prompt_ver, _policy_ver, _estimator_version, _schema_ver, _skill_taxonomy_ver,
          _request_body)
  returning generation_attempts.attempt_id into 새;
  return query select 새, null::text;
end
$function$;

-- ㉣ 시도 닫기 — 응답 칸을 null → 값으로 «1회만». 종결 표식은 result(A3 정정).
create or replace function engine.attempt_close(
  _attempt_id uuid, _raw_response text, _result text,
  _gate_failed_reasons text[] default null)
  returns boolean
  language plpgsql security definer set search_path = engine, public as $function$
declare
  -- 캐논 = §8 «판정표의 행 순서»(C8 — 값 «목록»의 나열 순서가 아니다). 검문(JS)의 push 순서와
  -- 같은 하나여야 한다 — 갈리면 복수 사유 검문탈락(빈출력은 길이도 함께 무는 것이 §8 판정식)이
  -- 여기서 예외로 죽어 «내부오류» 로 오분류된다. tests/생성사유픽스처.test.js 가 두 원천을 대조한다.
  캐논 constant text[] := array['빈출력','길이','한국어비율','금칙서식','질문형태','식별자역유입','중복'];
  달라진 int;
begin
  if _result is null then
    raise exception 'attempt_close: _result 가 null 이다 — 닫는 게 아니라 계약 위반이다(A7)';
  end if;
  -- 사유 배열의 캐논 순서·무중복(C8) — CHECK 는 서브쿼리 불가라 함수 검사가 곧 물리다.
  if _gate_failed_reasons is not null then
    if (select count(*) from unnest(_gate_failed_reasons)) <> (select count(distinct r) from unnest(_gate_failed_reasons) r) then
      raise exception 'attempt_close: gate_failed_reasons 에 중복이 있다(C8)';
    end if;
    if (select array_agg(r order by array_position(캐논, r)) from unnest(_gate_failed_reasons) r)
       is distinct from _gate_failed_reasons then
      raise exception 'attempt_close: gate_failed_reasons 가 §8 캐논 순서가 아니다(C8)';
    end if;
  end if;
  update engine.generation_attempts
     set raw_response = _raw_response,
         responded_at = now(),         -- 함수가 박는다 — 워커는 시각을 안 만든다(A5)
         result = _result,
         gate_failed_reasons = _gate_failed_reasons
   where attempt_id = _attempt_id and result is null;
  get diagnostics 달라진 = row_count;
  return 달라진 = 1;
end
$function$;

-- ㉥ 회수 — 임대가 지난 claimed 를 대기로(펜싱 그대로 · 열린 attempt 는 안 닫는다).
create or replace function engine.jobs_reclaim(_assign_date date, _now timestamptz default now())
  returns int
  language plpgsql security definer set search_path = engine, public as $function$
declare 수 int;
begin
  update engine.generation_jobs
     set status = '대기', owner = null, lease_until = null
   where assign_date = _assign_date and status = 'claimed' and lease_until < _now;
  get diagnostics 수 = row_count;
  return 수;
end
$function$;

-- ㉦ 반납 — 살아 있는 워커의 자발 반납(집었는데 안 부른 job · attempts 0행 그대로).
create or replace function engine.jobs_release(_job_id uuid, _fence bigint)
  returns boolean
  language plpgsql security definer set search_path = engine, public as $function$
declare 수 int;
begin
  update engine.generation_jobs
     set status = '대기', owner = null, lease_until = null
   where job_id = _job_id and status = 'claimed' and fence = _fence;
  get diagnostics 수 = row_count;
  return 수 = 1;
end
$function$;

-- ㉤ 종료 — 착지·마감·적재·구제가 «이 하나». 두 사건 + submissions + job 종료가 한 트랜잭션.
create or replace function engine.jobs_finalize(
  _job_id uuid, _fence bigint, _outcome text, _event jsonb,
  _winning_attempt_id uuid default null,
  _deciding_attempt_id uuid default null,
  _mode text default '정상')
  returns table (assigned_event_id uuid, landed boolean, reason text)
  language plpgsql security definer set search_path = engine, public as $function$
#variable_conflict use_column
declare
  j engine.generation_jobs%rowtype;
  ta jsonb; iv jsonb; sr jsonb;
  실시각 timestamptz := now();
  개입id uuid := gen_random_uuid();
  배정사건 uuid := gen_random_uuid();
  개입사건 uuid := gen_random_uuid();
  동의 record;
  결정 record;
  스스로결정 uuid;
  deg boolean;
  기대상태 text;
  새펜스 bigint;
  승자 record;
  파싱 record;
  함수몫 constant text[] := array[
    'learner_id','event_type','task_type','actor_kind','occurred_at','idempotency_key',
    'consent_ver','consent_id','source_kind','level_snapshot','goal_snapshot','intervention_id',
    'skill_ids','skill_taxonomy_ver','model','prompt_ver','policy_ver','schema_ver','degraded'];
  k text;
begin
  select * into j from engine.generation_jobs where job_id = _job_id for update;
  if not found then
    return query select null::uuid, false, '거절'::text; return;
  end if;
  -- 멱등(셋째 줄) — 이미 종료된 job 은 기존 값을 돌려준다(HTTP 응답을 잃은 워커의 답).
  if j.status in ('착지','마감폴백','대상아님','적재실패') then
    return query select j.assigned_event_id, false, '멱등'::text; return;
  end if;

  if _mode = '정상' then
    if j.status <> 'claimed' or j.fence <> _fence then
      return query select null::uuid, false, '거절'::text; return;
    end if;
    if now() >= engine.gen_deadline(j.assign_date) then
      return query select null::uuid, false, '거절'::text; return;   -- 마감 뒤 정상 착지는 낡은 실행(B3)
    end if;
    기대상태 := '착지'; 새펜스 := j.fence;
  elsif _mode = '마감' then
    if j.status not in ('대기','claimed') then
      return query select null::uuid, false, '거절'::text; return;
    end if;
    기대상태 := '마감폴백'; 새펜스 := j.fence + 1;   -- 임대를 존중하지 않는다 — 빼앗는다.
  elsif _mode = '적재' then
    if j.status <> '대기' or j.not_target_reason is null then
      return query select null::uuid, false, '거절'::text; return;
    end if;
    기대상태 := '대상아님'; 새펜스 := j.fence;
  elsif _mode = '구제' then
    if j.status not in ('대기','claimed','적재실패') then
      return query select null::uuid, false, '거절'::text; return;
    end if;
    -- 벤더 0 강제(B1) — 이 모드의 착지에는 그 job 의 attempts 가 0행이어야 한다.
    if exists (select 1 from engine.generation_attempts a where a.job_id = _job_id) then
      raise exception 'jobs_finalize(구제): attempts 가 있는 job 이다 — 마감 뒤 벤더 경합(B1)';
    end if;
    if _outcome <> '구제경로' then
      raise exception 'jobs_finalize(구제): _outcome 은 구제경로 하나다 — %', _outcome;
    end if;
    기대상태 := '착지'; 새펜스 := j.fence + 1;
  else
    raise exception 'jobs_finalize: 모르는 _mode % — 정상·마감·적재·구제 뿐이다', _mode;
  end if;

  if _event is null or jsonb_typeof(_event) <> 'object' then
    raise exception 'jobs_finalize: _event 봉투가 객체가 아니다';
  end if;
  ta := _event -> 'task_assigned';
  iv := _event -> 'intervention_delivered';
  sr := _event -> 'submission_row';
  if ta is null or iv is null or sr is null then
    raise exception 'jobs_finalize: 봉투 세 블록(task_assigned·intervention_delivered·submission_row)이 전부 필요하다 — 부분 착지 금지';
  end if;
  -- 함수 몫 칸이 실려 오면 예외(A12) — 조용히 덮든 이기든 갈림을 감춘다. 목록은 봉투 표
  -- 「함수」 칸에서 파생(§3-5-b — v5.2 예시 블록의 event_type·occurred_at 등은 그 표가 걷었다).
  foreach k in array 함수몫 loop
    if ta ? k or iv ? k or sr ? k then
      raise exception 'jobs_finalize: 함수 몫 칸 «%» 이 _event 에 실려 왔다(A12 — 함수가 job 에서 읽는다)', k;
    end if;
  end loop;

  -- 대조 ①(A6): _outcome ↔ payload.generation_outcome.
  if (iv -> 'payload' ->> 'generation_outcome') is distinct from _outcome then
    raise exception 'jobs_finalize: _outcome(%) 과 payload.generation_outcome(%) 이 갈렸다(A6)',
      _outcome, iv -> 'payload' ->> 'generation_outcome';
  end if;
  -- 대조 ②(A13): submission_row.task_snapshot = task_assigned.task_snapshot 동일 바이트.
  if (sr -> 'task_snapshot') is distinct from (ta -> 'task_snapshot') then
    raise exception 'jobs_finalize: 두 task_snapshot 이 다르다(A13 — 첫째가 정본·둘째는 투영)';
  end if;
  -- 대조 ⑦(A6): estimator_version = job 실행판 · evidence_refs.as_of = job.snapshot_as_of.
  -- (상태 메타 셋의 자리는 _event 스키마 그대로 iv 블록 최상위 — 호출자 몫 · 봉투 표)
  if (iv ->> 'estimator_version') is distinct from j.estimator_version then
    raise exception 'jobs_finalize: estimator_version 이 job 실행판과 갈렸다(⑦)';
  end if;
  if ((iv -> 'evidence_refs' ->> 'as_of')::timestamptz)
     is distinct from j.snapshot_as_of then
    raise exception 'jobs_finalize: evidence_refs.as_of 가 job.snapshot_as_of 와 갈렸다(⑦)';
  end if;
  -- 대조 ⑩(ⓓ-16): evidence_refs «전체» = draft 에 굳힌 값(jsonb 동등 — A8 의 마지막 잠금).
  if j.event_draft is not null
     and (iv -> 'evidence_refs') is distinct from (j.event_draft -> 'evidence_refs') then
    raise exception 'jobs_finalize: evidence_refs 가 event_draft 에 굳힌 값과 다르다(⑩ — 다른 요약으로 생성하고도 정상 사건이 서는 자리)';
  end if;
  -- 대조 ⑨(갈래 6): 근거 사건 전량이 그 학생·이중 cutoff 안(§11-4).
  if exists (
    select 1 from jsonb_array_elements_text(iv -> 'evidence_refs' -> 'events') ev(id)
    left join engine.learning_events e on e.event_id = ev.id::uuid
    where e.event_id is null
       or e.learner_id <> j.learner_id
       or e.occurred_at > j.snapshot_as_of
       or e.ingested_at > j.snapshot_as_of
  ) then
    raise exception 'jobs_finalize: evidence_refs.events 에 남의 학생·창 밖·늦적재 사건이 있다(⑨ — §11-4 이중 cutoff)';
  end if;
  -- 대조 ③(A9): generation_gate_failed = 결정 시도의 첫 사유(검문탈락일 때만).
  -- 결정 시도 자체 산출(㉤ — 현재 fence 에서 마지막으로 닫힌 시도) + 호출값 대조.
  select a.attempt_id, a.result, a.gate_failed_reasons, a.raw_response
    into 결정
    from engine.generation_attempts a
   where a.job_id = _job_id and a.result is not null and a.fence = j.fence
   order by a.attempt_no desc limit 1;
  스스로결정 := 결정.attempt_id;
  if _outcome in ('검문탈락','타임아웃','벤더오류','응답파손','입력초과','응답초과') then
    if _deciding_attempt_id is distinct from 스스로결정 then
      raise exception 'jobs_finalize: _deciding_attempt_id 가 함수 산출(%)과 다르다(A4 — 규칙은 하나다)', 스스로결정;
    end if;
  elsif _deciding_attempt_id is not null then
    raise exception 'jobs_finalize: %(은)는 결정 시도를 받지 않는다(jobs_deciding_scope else 갈래)', _outcome;
  end if;
  if _outcome = '검문탈락' then
    if (iv -> 'payload' ->> 'generation_gate_failed') is distinct from 결정.gate_failed_reasons[1] then
      raise exception 'jobs_finalize: payload.generation_gate_failed 가 결정 시도의 첫 사유와 다르다(③)';
    end if;
  elsif (iv -> 'payload' ->> 'generation_gate_failed') is not null then
    raise exception 'jobs_finalize: 검문탈락이 아닌데 generation_gate_failed 가 실렸다(③)';
  end if;
  -- 대조 ⑧ + ⑤⑥(성공): 승자 현재성·입력 바이트·산출 바이트.
  if _outcome = '성공' then
    if _winning_attempt_id is null then
      raise exception 'jobs_finalize: 성공인데 승자 시도가 없다(A1)';
    end if;
    select a.* into 승자 from engine.generation_attempts a
     where a.attempt_id = _winning_attempt_id and a.job_id = _job_id
       and a.fence = j.fence and a.result = '성공';
    if not found then
      raise exception 'jobs_finalize: 승자 시도가 이 job·현재 fence·성공이 아니다(⑧)';
    end if;
    if (iv -> 'payload' ->> 'generation_input_text') is distinct from 승자.request_body then
      raise exception 'jobs_finalize: generation_input_text 가 승자 시도의 request_body 와 다르다(⑤ — input_hash 정합이 여기서 선다)';
    end if;
    select * into 파싱 from engine.gen_parse_sentence(승자.raw_response);
    if 파싱.sentence is null or 파싱.question is null then
      raise exception 'jobs_finalize: 승자 원응답에서 §5-3 파서가 문장·질문을 못 읽었다(⑥)';
    end if;
    if (iv -> 'payload' ->> 'output_text') is distinct from 파싱.sentence then
      raise exception 'jobs_finalize: payload.output_text 가 승자 원응답의 sentence 와 다르다(⑥ — 검문이 본 것과 같은 바이트)';
    end if;
    if exists (
      select 1 from jsonb_array_elements(ta -> 'task_snapshot' -> '호흡') h
      where (h ->> '차례')::int = 3 and (h ->> '프롬프트') is distinct from 파싱.question
    ) then
      raise exception 'jobs_finalize: ③답하기 프롬프트가 승자 원응답의 question 과 다르다(⑥ C5)';
    end if;
  elsif _winning_attempt_id is not null then
    raise exception 'jobs_finalize: 성공이 아닌데 승자를 받았다(jobs_winner_only_success)';
  end if;

  -- degraded — 착지 «모드·갈래표»가 정한다(D1 · A10 — outcome 에서 파생하지 않는다).
  if _outcome = '성공' then deg := false;
  elsif _outcome = '대상아님' then
    deg := j.not_target_reason in ('초급','미정');
  else deg := true;
  end if;

  -- 착지 시점의 동의(봉투 표 — not null 칸).
  select c.consent_id, c.consent_ver into 동의
    from engine.consents c
   where c.learner_id = j.learner_id and c.agreed_at <= now()
     and (c.revoked_at is null or c.revoked_at > now())
   order by c.agreed_at desc limit 1;
  if not found then
    raise exception 'jobs_finalize: 유효한 동의가 없다 — 동의 없이 착지하는 우회로를 만들지 않는다';
  end if;

  -- 원자 착지 — 배정 사건 · submissions 보조 행 · 개입 사건 · job 종료.
  insert into engine.learning_events (
    event_id, learner_id, event_type, actor_kind, occurred_at, ingested_at,
    task_type, idempotency_key, intervention_id,
    consent_ver, consent_id, source_kind, payload, schema_ver,
    level_snapshot, goal_snapshot, retry_of_event_id)
  values (
    배정사건, j.learner_id, 'task.assigned', 'ai', 실시각, 실시각,
    '발화녹음', 'task:' || j.learner_id || ':' || j.assign_date,
    개입id, 동의.consent_ver, 동의.consent_id, 'inferred'::engine.source_kind,
    coalesce(ta -> 'payload', '{"ver":1}'::jsonb), j.schema_ver,
    j.branch_snapshot ->> 'level', j.branch_snapshot ->> 'goal',
    nullif(ta ->> 'retry_of_event_id', '')::uuid)
  on conflict (learner_id, idempotency_key) do nothing;
  if not found then
    -- 멱등키가 이미 쓰였다 — 라이브 경로가 그날을 이미 세운 것. 부분 착지 금지라 통째 거절.
    return query select null::uuid, false, '거절'::text; return;
  end if;

  insert into engine.submissions (
    event_id, occurred_at, task_type, task_ref, task_snapshot, task_schema_ver,
    schema_ver, due_at, due_ver)
  values (
    배정사건, 실시각, '발화녹음', 'task-' || j.assign_date, ta -> 'task_snapshot',
    coalesce(sr ->> 'task_schema_ver', 'task.v1'), j.schema_ver,
    ((j.assign_date + 1)::timestamp) at time zone 'Asia/Ulaanbaatar', 'due.v1');

  insert into engine.learning_events (
    event_id, learner_id, event_type, actor_kind, occurred_at, ingested_at,
    task_type, idempotency_key, intervention_id,
    consent_ver, consent_id, source_kind, payload, schema_ver,
    level_snapshot, goal_snapshot,
    model, prompt_ver, policy_ver, estimator_version, estimator_confidence, evidence_refs,
    skill_ids, skill_taxonomy_ver, degraded)
  values (
    개입사건, j.learner_id, 'intervention.delivered', 'ai', 실시각, 실시각,
    '발화녹음', 'intervention:' || j.learner_id || ':' || j.assign_date,
    개입id, 동의.consent_ver, 동의.consent_id, 'inferred'::engine.source_kind,
    iv -> 'payload', j.schema_ver,
    j.branch_snapshot ->> 'level', j.branch_snapshot ->> 'goal',
    j.model, j.prompt_ver, j.policy_ver,
    j.estimator_version,
    (iv ->> 'estimator_confidence')::numeric,
    iv -> 'evidence_refs',
    -- E3 — 안 나간 겨냥은 안 싣는다. 「없음」의 물리 = '{}' (learning_events.skill_ids 는
    -- not null default '{}' · c6 :419 — null 을 넣으면 폴백 착지가 통째로 죽는다 · 08-21 실측).
    case when _outcome = '성공' then j.skill_ids else '{}'::text[] end,
    case when _outcome = '성공' then j.skill_taxonomy_ver else null end,
    deg);

  update engine.generation_jobs
     set status = 기대상태, outcome = _outcome, closed_at = 실시각,
         assigned_event_id = 배정사건, fence = 새펜스,
         owner = null, lease_until = null,
         winning_attempt_id = _winning_attempt_id,
         winning_result = case when _winning_attempt_id is null then null else '성공' end,
         winning_fence  = case when _winning_attempt_id is null then null else j.fence end,
         deciding_attempt_id = _deciding_attempt_id,
         deciding_result = case when _deciding_attempt_id is null then null else _outcome end,
         not_target_reason = case when _mode = '적재' then j.not_target_reason else j.not_target_reason end
   where job_id = _job_id;

  return query select 배정사건, true, '정상'::text;
end
$function$;

-- ㉧ 마감 스윕 — 마감 지난 «모든» 배정일의 남은 것 전부(B2) + draft 있는 적재실패(ⓓ-15).
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
          'payload', jsonb_build_object('ver', 1)),
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

-- ㉠ 큐 적재 — 오케스트레이터가 «한 트랜잭션»에서 대상 전량을 만든다.
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
  draft허용 constant text[] := array['task_ref','task_snapshot','estimator_version','estimator_confidence','evidence_refs','요약'];
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

-- ㉨ 구제 적재 — 큐가 없으면 만들어 집게 한다(§3-1 · 갈래 봉투 반환).
create or replace function engine.jobs_load_one(
  _assign_date date, _run_id uuid, _target jsonb)
  returns table (kind text, job engine.generation_jobs, assigned_event_id uuid)
  language plpgsql security definer set search_path = engine, public as $function$
declare
  run engine.generation_batch_runs%rowtype;
  기존 engine.generation_jobs%rowtype;
  기존사건 record;
  결손 boolean; 게임행 boolean;
  새행 engine.generation_jobs%rowtype;
  결과 jsonb;
begin
  select * into run from engine.generation_batch_runs r where r.run_id = _run_id;
  if not found or run.assign_date <> _assign_date then
    raise exception 'jobs_load_one: _run_id 가 그 날짜의 시작 행이 아니다';
  end if;

  -- 기존 «사건» 경합(B4) — 라이브가 세운 날이면 job 을 안 만들고 그 배정을 돌려준다.
  select e.event_id, e.task_type, e.intervention_id into 기존사건
    from engine.learning_events e
   where e.learner_id = (_target ->> 'learner_id')::uuid
     and e.event_type = 'task.assigned'
     and e.idempotency_key = 'task:' || (_target ->> 'learner_id') || ':' || _assign_date
   order by e.occurred_at limit 1;
  if found then
    return query select '이미배정'::text, null::engine.generation_jobs, 기존사건.event_id;
    return;
  end if;

  select * into 기존 from engine.generation_jobs g
   where g.learner_id = (_target ->> 'learner_id')::uuid and g.assign_date = _assign_date;
  if found then
    if 기존.status = '적재실패' and (_target -> 'event_draft') is not null then
      update engine.generation_jobs
         set status = '대기', outcome = null, closed_at = null,
             branch_snapshot = _target -> 'branch_snapshot',
             event_draft = _target -> 'event_draft',
             -- 🔴 갱신표(v5.8) 그대로 «시작 행에서» 읽는다 — now() 로 스스로 굳히면 호출자 draft 의
             --    evidence_refs.as_of(호출자 스냅기준 = 구제 run 의 그 값)와 영원히 갈려 ㉤ 대조 ⑦이
             --    부활 job 의 착지를 전부 거절한다(§12 픽스처 7차 실측 — 「가장 필요한 날에만 안 도는
             --    구제」의 재현). A6 의 「함수가 스스로」는 «호출자 임의 값 금지»지 run 결속 해제가 아니다.
             snapshot_as_of = run.snapshot_as_of,
             skill_ids = coalesce((select array_agg(x) from jsonb_array_elements_text(_target -> 'skill_ids') x), '{}'),
             skill_taxonomy_ver = run.skill_taxonomy_ver,
             model = run.model, prompt_ver = run.prompt_ver, policy_ver = run.policy_ver,
             estimator_version = run.estimator_version, schema_ver = run.schema_ver,
             batch_run_id = _run_id,
             load_retry_count = 기존.load_retry_count + 1
       where generation_jobs.job_id = 기존.job_id
      returning * into 새행;
      return query select '신규'::text, 새행, null::uuid;
    else
      return query select '기존'::text, 기존, 기존.assigned_event_id;
    end if;
    return;
  end if;

  -- 신규 — jobs_load 원소 하나와 같은 스키마(A8 검사는 조립이 성공한 경우라 면제 없음).
  begin
    select engine.jobs_load(_assign_date, _run_id,
      jsonb_build_array(_target), '{}'::uuid[]) into 결과;
  exception when others then
    -- 조립·검사 실패도 값으로(A7 — 예외를 올리면 B8 의 「행 0·상태 0」으로 되돌아간다).
    insert into engine.generation_jobs (
      learner_id, assign_date, batch_run_id, status, snapshot_as_of,
      branch_snapshot, skill_ids, skill_taxonomy_ver,
      load_error, load_failed_at, load_fail_run_id,
      model, prompt_ver, policy_ver, estimator_version, schema_ver,
      outcome, closed_at)
    values (
      (_target ->> 'learner_id')::uuid, _assign_date, _run_id, '적재실패', now(),
      coalesce(_target -> 'branch_snapshot', '{"ver":1}'::jsonb), '{}'::text[],
      run.skill_taxonomy_ver,
      left(SQLERRM, 200), now(), _run_id,
      run.model, run.prompt_ver, run.policy_ver, run.estimator_version, run.schema_ver,
      '내부오류', now())
    on conflict (learner_id, assign_date) do nothing
    returning * into 새행;
    if 새행.job_id is null then
      select * into 새행 from engine.generation_jobs g
       where g.learner_id = (_target ->> 'learner_id')::uuid and g.assign_date = _assign_date;
    end if;
    return query select '조립실패'::text, 새행, null::uuid;
    return;
  end;
  select * into 새행 from engine.generation_jobs g
   where g.learner_id = (_target ->> 'learner_id')::uuid and g.assign_date = _assign_date;
  return query select '신규'::text, 새행, 새행.assigned_event_id;
end
$function$;

do $migration2$
declare
  migration_version constant text := '20260821120000';
  migration_name constant text := '20260821120000_generation_c12.sql';
  expected_checksum constant text := '4c6946fc912ad5749151dabea0d4bab08a6c3dad800dbe5b78367ed92380f67b'; -- migration-checksum
begin
  if exists (select 1 from engine.schema_migrations where version = migration_version) then
    return;
  end if;
  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
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
  ('companion_qa_staff_id_fkey'),
  -- 생성 실행 장부(20260821120000) — CHECK 34 + FK 3 + UNIQUE 3(전이·계보의 물리).
  ('attempts_gate_values_c12'),
  ('attempts_response_present_c12'),
  ('attempts_result_gate_c12'),
  ('attempts_ver_nonempty_c12'),
  ('batch_runs_counts_order_c12'),
  ('batch_runs_counts_pair_c12'),
  ('batch_runs_enrolled_nonneg_c12'),
  ('batch_runs_finished_cols_c12'),
  ('batch_runs_level_dist_ok_c12'),
  ('batch_runs_partial_pair_c12'),
  ('batch_runs_partial_range_c12'),
  ('batch_runs_roster_equation_c12'),
  ('batch_runs_skipped_range_c12'),
  ('batch_runs_ver_nonempty_c12'),
  ('jobs_anchor_present_c12'),
  ('jobs_claim_cols_c12'),
  ('jobs_deciding_pair_c12'),
  ('jobs_deciding_result_matches_c12'),
  ('jobs_deciding_scope_c12'),
  ('jobs_draft_present_c12'),
  ('jobs_idle_cols_c12'),
  ('jobs_load_failed_cols_c12'),
  ('jobs_nontarget_cols_c12'),
  ('jobs_nonterminal_cols_c12'),
  ('jobs_skill_ids_present_c12'),
  ('jobs_status_outcome_pairs_c12'),
  ('jobs_terminal_cols_c12'),
  ('jobs_ver_nonempty_c12'),
  ('jobs_winner_fence_current_c12'),
  ('jobs_winner_fence_pair_c12'),
  ('jobs_winner_only_success_c12'),
  ('jobs_winner_present_c12'),
  ('jobs_winner_result_only_success_c12'),
  ('jobs_winner_result_pair_c12'),
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
              and (select version from 현재이력)='20260821120000'
              and (select checksum from 현재이력)='4c6946fc912ad5749151dabea0d4bab08a6c3dad800dbe5b78367ed92380f67b' -- migration-checksum
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
-- ① 이 조각의 몫은 이름 교체 «만»이다 — c12 의 실체(payload 3칸·화이트리스트·assignment_status)는
--    전부 물리 밖이라 검증기·계약 JSON·C0 가 진다. DB 가 지는 것은 「어느 계약판 위인가」 하나다.
-- ② CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 _c11 서른하나를 _c12 로 이름째 교체했다).
--    ⚠ 이 줄은 마지막 조각이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `season_no_overlap_c11`(EXCLUDE) · `…_once_c11`(UNIQUE) · `companion_qa_*_fkey` 는 여기
--      없다 — CHECK 가 아니라 이 줄의 대상이 아니고, 이름도 c11 그대로 산다(값목록이 없어
--      판 판별과 무관하다 · 위 기대제약 목록에는 그 이름 그대로 들어 있다).
--    기대: attempts_gate_values_c12 · attempts_response_present_c12 · attempts_result_gate_c12
--         · attempts_ver_nonempty_c12 · batch_runs_counts_order_c12 · batch_runs_counts_pair_c12
--         · batch_runs_enrolled_nonneg_c12 · batch_runs_finished_cols_c12
--         · batch_runs_level_dist_ok_c12 · batch_runs_partial_pair_c12
--         · batch_runs_partial_range_c12 · batch_runs_roster_equation_c12
--         · batch_runs_skipped_range_c12 · batch_runs_ver_nonempty_c12 · broadcast_segment_kind_c12
--         · classes_key_nonblank_c12 · companion_qa_answer_paired_c12
--         · companion_qa_question_nonblank_c12 · corrections_promotion_intent_c12
--         · corrections_supersedes_not_self_c12 · corrections_verdict_c12 · cron_runs_outcome_c12
--         · jobs_anchor_present_c12 · jobs_claim_cols_c12 · jobs_deciding_pair_c12
--         · jobs_deciding_result_matches_c12 · jobs_deciding_scope_c12 · jobs_draft_present_c12
--         · jobs_idle_cols_c12 · jobs_load_failed_cols_c12 · jobs_nontarget_cols_c12
--         · jobs_nonterminal_cols_c12 · jobs_skill_ids_present_c12 · jobs_status_outcome_pairs_c12
--         · jobs_terminal_cols_c12 · jobs_ver_nonempty_c12 · jobs_winner_fence_current_c12
--         · jobs_winner_fence_pair_c12 · jobs_winner_only_success_c12 · jobs_winner_present_c12
--         · jobs_winner_result_only_success_c12 · jobs_winner_result_pair_c12 · learners_gender_c12
--         · learners_goal_track_c12 · learners_group_no_c12 · learners_home_aimag_c12
--         · learners_seat_no_c12 · learners_signup_attempts_nonneg_c12
--         · learners_temp_password_paired_c12 · learning_events_correction_target_c12
--         · learning_events_event_type_c12 · learning_events_task_type_c12
--         · pipeline_jobs_discard_reason_c12 · season_compass_answers_c12 · season_dates_c12
--         · season_review_decided_c12 · season_review_self_c12 · season_review_verdict_c12
--         · staff_role_c12 · submissions_due_paired_c12 · submissions_task_format_c12
--         · submissions_translation_source_c12 · teacher_notes_body_nonblank_c12
--         · teacher_notes_disposition_c12 · teacher_notes_origin_c12
