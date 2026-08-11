/* 라디오24 원장(Lane A) — `radio` 스키마 6표: 송출 첫날부터 원문이 남는 자리
 *
 * 🔴 **파일 이름의 `_c10` 은 장식이 아니다.** Edge Function 이 계약판을 최신 조각 이름에서
 *   읽는다(`tests/마이그레이션이름.test.js`). 이 조각은 **계약을 안 바꾼다** — 새 값목록 0 ·
 *   `learning_events` 0 · engine 변경 0(읽기 전용 FK 하나만 건다). 그래서 c10 을 그대로 이어 쓴다.
 *   라디오 승격(Lane B)의 c11 소개정(`task_type` +'라디오퀴즈' 등 · 유호 확정 §7-5)은 이 조각
 *   몫이 아니다 — 래칫 `생산자섰는데도달0상한=0` 이라 승격기·소비자와 **한 커밋**으로만 선다.
 *
 * 정본 = appsscript `docs/라디오24_설계.md` §4(v1.2) · 유호님 트랙 재개 지시 2026-08-11
 *   (VPS ✅승인 · 채널 분리 ⏸대기 — **송출은 못 켜도 원장은 먼저 선다**, §5-P0 선행 확정).
 *
 * ■ 왜 지금인가 — 소급 불가 (설계 §4-2)
 *   채팅 원문·라운드 스냅샷·노출 실적·그때 시청자 수는 **그날 안 담으면 영원히 빈칸**이다.
 *   송출 개시가 채널 판정에 막혀 있는 지금이 「첫 방송 전에 원장이 서 있어야 한다」를
 *   공짜로 만족시키는 마지막 창이다(c9·c10 머리말과 같은 성질 — 「첫 학생 전에 칸을 연다」).
 *
 * ■ 왜 새 표 6개인가 — F124(새 테이블 최소)와의 대조를 설계가 이미 지났다
 *   라디오 시청자는 **비학생을 포함**한다(잠재고객·링크 전 학생). `learning_events` 는
 *   학생 사건의 표라 이 표면을 원리상 못 담는다(설계 §1 원칙 10). 파생(구간 귀속·시청자
 *   프로필·「그날」)은 표가 아니라 **뷰**로만 낸다(원칙 11 — 이 조각은 뷰도 안 만든다).
 *
 * ■ 두 레인 경계 (설계 §0-4 · L0 관문 구조)
 *   여기는 **원장(Lane A)** 뿐이다. 엔진 입력 통로는 `learning_events` 하나이고(원칙 12),
 *   엔진은 radio.* 를 직접 읽지 않는다 — 승격기(Edge Fn · c11 게이트 뒤)만 원장을 읽어
 *   동의·링크·중복 게이트를 지나 승격한다. 그래서 취급은 engine 과 동일하다:
 *   **RLS 켜고 정책 0(전면 거부) · service_role 만 쓰기 · PostgREST 비노출.**
 *
 * ■ 설계에서 그대로 온 결정들 (여기서 재론하지 않는다)
 *   · 멱등키 = YouTube liveChat 메시지 id(`chat_message.message_id` PK · textMessageEvent
 *     화이트리스트 — 선물 이벤트는 같은 id 로 갱신이 와 멱등이 깨진다 · 원칙 7).
 *   · `raw` jsonb = 원 API 항목 그대로 — 파서를 고치는 날 재파싱 근거(원칙 5 · parser_ver 동반).
 *   · `command_kind` 에 CHECK 를 **안 건다** — 계약 밖 값목록을 DDL 에 만들지 않는다(§4-1).
 *     명령 어휘의 정본은 파서(P0 수집봇)이고 `parser_ver` 가 판을 든다.
 *   · `broadcast_segment.kind` 만 CHECK — 수집기 자체의 닫힌 어휘 4값 + `kind_detail` 탈출구.
 *     계약 어휘가 아니라 радио 내부 축이지만, 접미는 저장소 규칙(`_c10` 통일)을 따른다.
 *   · 구간 귀속은 물리 저장하지 않는다 — 두 시계의 어긋남을 데이터에 굳히지 않는다(시각 조인 뷰).
 *   · `viewer_link` = append-only + protect 트리거(consents_protect 와 같은 형태) —
 *     학습 승격의 신원 근거라 개서·삭제가 곧 오귀속이다. 해제는 `unlinked_at` 세우기,
 *     재연동·정정은 **새 행**이다. 활성 링크는 채널당 1개(부분 유일 인덱스).
 *   · `ingest_heartbeat` = 봇이 죽은 구간과 조용한 구간을 가른다(§6-3 OAuth 7일 만료가
 *     「조용히 죽음」으로 오는 자리) + `concurrent_viewers` = 노출 분모의 유일한 그날 증거.
 *
 * ■ 채우는 코드는 오늘 0줄이다 — 정직 표기
 *   생산자 = P0 수집봇(읽기 전용 폴링·§5-P0)과 인제스트 Fn 이고 이 조각 뒤에 선다.
 *   「표가 섰다」를 「수집이 돈다」로 읽지 않는다(엔진도달 §5 의 경계 — 확인 ③).
 *
 * 되돌림: drop schema if exists radio cascade;
 *        delete from engine.schema_migrations where version = '20260811160000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260811160000';
  migration_name constant text := '20260811160000_radio_c10.sql';
  expected_checksum constant text := '26add75082845c81c60e696bf9e3943eb74bb321a47bd4cc1c1e71e126d03d59'; -- migration-checksum
  base_version constant text := '20260809090000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c10 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  create schema if not exists radio;
  comment on schema radio is
    '라디오24 원장(Lane A) — 유튜브 라이브 표면의 원본. 엔진은 이 스키마를 직접 읽지 않는다(승격기만 · 라디오24_설계 §4-3). engine 과 같은 취급: RLS 정책 0 · service_role 만 · PostgREST 비노출.';

  -- 새 스키마에 기본 부여가 있든 없든 명시로 끊는다(c6 이 engine 에 한 것과 같은 자물쇠).
  revoke all on schema radio from anon, authenticated;

  /* ① 송출 구간 — 맥락 축. 구간 귀속은 물리 저장하지 않는다(시각 조인 뷰 몫). */
  create table if not exists radio.broadcast_segment (
    segment_id  bigint generated always as identity primary key,
    kind        text not null
      constraint broadcast_segment_kind_c10
        check (kind in ('radio_loop', 'live_lecture', 'asmr_mode', 'other')),
    kind_detail text,                          -- 'other' 의 실제 사정(정전·공지·재방송…)
    started_at  timestamptz not null,
    ended_at    timestamptz,
    title       text,
    source      text not null,                 -- 감지 출처(사람 기입·봇 감지·시트 운영층)
    schema_ver  text not null
  );
  comment on table radio.broadcast_segment is
    '그때 무엇이 나오고 있었나 — 모든 라디오 사건의 맥락 조인 열쇠(라디오24_설계 §2-A).';

  /* ② 채팅 원장 — 라디오 표면의 원본. 멱등키 = YouTube 메시지 id. */
  create table if not exists radio.chat_message (
    message_id   text primary key,             -- textMessageEvent 화이트리스트(원칙 7)
    channel_id   text not null,                -- 외부 가명 식별자(§3) — 학생 코드는 영원히 없다
    display_name text not null,                -- 그때 표시명 스냅샷(식별 근거 아님)
    body         text not null,                -- 원문 그대로
    raw          jsonb not null,               -- 원 API 항목 — 파서를 고치는 날 재파싱 근거
    sent_at      timestamptz not null,
    ingested_at  timestamptz not null default now(),
    command_kind text,                         -- 파서 산출(CHECK 없음 — 계약 밖 값목록을 DDL 에 안 만든다)
    command_arg  text,
    parser_ver   text not null,
    schema_ver   text not null
  );
  comment on table radio.chat_message is
    '라디오 채팅 원장 — 명령·퀴즈 응답·자발 발화 전부의 원본. 승격 재료(라디오24_설계 §4-2 보증).';
  create index if not exists chat_message_channel_sent
    on radio.chat_message (channel_id, sent_at desc);
  create index if not exists chat_message_command_sent
    on radio.chat_message (command_kind, sent_at desc) where command_kind is not null;

  /* ③ 수집 맥박 — 봇이 죽은 구간과 조용한 구간을 가른다 + 그때 몇 명이 보고 있었나. */
  create table if not exists radio.ingest_heartbeat (
    id                 bigint generated always as identity primary key,
    polled_at          timestamptz not null,
    video_id           text,
    messages_seen      int not null,
    concurrent_viewers int,                    -- liveStreamingDetails 샘플 — 노출 분모의 유일한 그날 증거
    schema_ver         text not null
  );
  comment on table radio.ingest_heartbeat is
    '수집 맥박 — 행이 없는 구간 = 봇이 죽어 있던 구간(OAuth 7일 만료가 「조용히」 오는 자리 · §6-3).';

  /* ④ 신원 링크 — 사람 확정 고리 하나. append-only(protect 트리거 · consents_protect 형태). */
  create table if not exists radio.viewer_link (
    link_id          bigint generated always as identity primary key,
    channel_id       text not null,
    learner_id       uuid not null references engine.learners(learner_id),
    claim_message_id text references radio.chat_message(message_id),  -- `!연동` 노크(있으면)
    confirmed_by     text not null,            -- 확정한 운영자(§3 — 확정은 언제나 운영 화면에서)
    confirmed_at     timestamptz not null,
    unlinked_at      timestamptz,
    schema_ver       text not null
  );
  comment on table radio.viewer_link is
    '유튜브 채널↔학생 링크 — 승격 귀속의 유일 근거(라디오24_설계 §3). 개서·삭제 금지, 해제 후 새 행.';
  create unique index if not exists viewer_link_active
    on radio.viewer_link (channel_id) where unlinked_at is null;

  create or replace function radio.protect_viewer_link() returns trigger
    language plpgsql as $function$
  begin
    if TG_OP = 'DELETE' then
      raise exception '링크 이력은 지우지 않는다 — 해제는 unlinked_at 를 세우는 것이다 (라디오24_설계 §3)';
    end if;
    if NEW.link_id is distinct from OLD.link_id
       or NEW.channel_id is distinct from OLD.channel_id
       or NEW.learner_id is distinct from OLD.learner_id
       or NEW.claim_message_id is distinct from OLD.claim_message_id
       or NEW.confirmed_by is distinct from OLD.confirmed_by
       or NEW.confirmed_at is distinct from OLD.confirmed_at
       or NEW.schema_ver is distinct from OLD.schema_ver then
      raise exception '링크 행은 개서하지 않는다 — 정정은 해제 후 새 행이다 (라디오24_설계 §3)';
    end if;
    if OLD.unlinked_at is not null and NEW.unlinked_at is distinct from OLD.unlinked_at then
      raise exception '해제는 되돌리지 않는다 — 재연동은 새 행이다 (라디오24_설계 §3)';
    end if;
    return NEW;
  end
  $function$;

  drop trigger if exists viewer_link_protect on radio.viewer_link;
  create trigger viewer_link_protect before update or delete on radio.viewer_link
    for each row execute function radio.protect_viewer_link();

  /* ⑤ 퀴즈 출제 실적 — 그때 화면에 나간 문항의 스냅샷(정답 포함 — 그래서 이 표는 절대 비노출). */
  create table if not exists radio.quiz_round (
    round_id          bigint generated always as identity primary key,
    task_ref          text not null,           -- 문항 팩 id(앱과 같은 체계 — 접두 변형 금지 · §10 기각 4)
    task_snapshot     jsonb not null,          -- 질문·보기 [{option_id,label}]·정답·지시문·문항버전(L0 §3-3)
    shown_at          timestamptz not null,
    closed_at         timestamptz,
    retry_of_round_id bigint references radio.quiz_round(round_id),  -- 60초 재도전 짝(같은 skill 다른 문항)
    schema_ver        text not null
  );
  comment on table radio.quiz_round is
    '라디오 퀴즈 라운드 — 승격 시 task_ref/task_snapshot 의 원천(라디오24_설계 §2-J·§4-3).';

  /* ⑥ TOPIK 자막 노출 실적 — ⓖ 낭독 과제의 task_ref 원천(§2-2 — 「봤다」를 발화가 대신 증명). */
  create table if not exists radio.subtitle_card_log (
    id               bigint generated always as identity primary key,
    content_ref      text not null,
    content_snapshot jsonb not null,
    shown_from       timestamptz not null,
    shown_to         timestamptz,
    schema_ver       text not null
  );
  comment on table radio.subtitle_card_log is
    '12시간 TOPIK 자막 카드 노출 실적 — 노출 이력(운영 기록)이자 낭독 과제의 제시문 원천.';

  /* 전 표 RLS — 정책 0 = 전면 거부. 나중에 노출하는 날 잊어도 닫힌 채로 실패한다. */
  alter table radio.broadcast_segment  enable row level security;
  alter table radio.chat_message       enable row level security;
  alter table radio.ingest_heartbeat   enable row level security;
  alter table radio.viewer_link        enable row level security;
  alter table radio.quiz_round         enable row level security;
  alter table radio.subtitle_card_log  enable row level security;

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
  -- 검수 확정이 담길 칸 넷(20260809090000 · 소급 불가 · 발주 §3 「c11 선행」)
  ('corrections','supersedes'), ('corrections','promotion_intent'),
  ('corrections','transcript_at_review'), ('pipeline_jobs','discard_reason'),
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at'),
  -- ⚠ 아래 세 묶음은 c7 **뒤에 붙은 조각들**이 낸 열이다. 이 확인 블록은 앞 조각에서
  --   베끼는 것이 아니라 **바로 앞 조각**에서 이어야 한다 — c8 초안이 20260806210000 의
  --   블록을 베껴 이 13열을 통째로 떨어뜨렸고, 그 상태의 확인은 「빠진열 없음」으로 초록이
  --   나온다(검사가 사라진 것이 통과와 같은 모양이 되는 자리 · 생성기 diff 가 잡았다).
  -- 학생 로그인(L0 §4-1·§4-2 · 20260806233000_auth_c7)
  ('learners','recovery_email'), ('learners','recovery_phone'),
  ('learners','temp_password_expires_at'), ('learners','signup_attempts'),
  -- 직원 인증·세션 폐기(L0 §4-5·§4-2 ③ · 20260806234000_staff_c7)
  ('learners','active'), ('learners','revoked_before'),
  ('staff','role'), ('staff','staff_id'), ('staff','active'), ('staff','revoked_before'),
  ('staff_access_log','action'), ('staff_access_log','target_ids'),
  -- 임시번호를 해시로 든다(L0 §4-2-2 · 20260807024500_temp_password_c7)
  ('learners','temp_password_hash')
), 기대제약(n) as (values
  ('learning_events_event_type_c10'), ('learning_events_task_type_c10'),
  ('submissions_task_format_c10'), ('submissions_translation_source_c10'),
  ('submissions_due_paired_c10'), ('corrections_verdict_c10'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c10'), ('staff_role_c10'),
  ('learners_temp_password_paired_c10'),
  ('learning_events_correction_target_c10'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c10'), ('corrections_promotion_intent_c10'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c10')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect')
), 대상역할(r) as (values ('anon'), ('authenticated'))
, 대상권한(p) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
, 대상테이블(t) as (
  -- ⚠ 뷰는 pg_tables 에 없다. engine 첫 뷰(review_queue · 20260807190000)가 서면서 합쳤다 —
  --    안 합치면 뷰에 grant 가 붙어도 「새는테이블권한=0」이 그대로 초록이다.
  select tablename from pg_tables where schemaname='engine'
  union all
  select viewname from pg_views where schemaname='engine'
), 라디오테이블(t) as (
  -- radio 는 아직 뷰가 0이다 — 첫 뷰(구간 귀속·「그날」)가 서는 조각이 여기에 union 을 더한다.
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
  -- 🔴 존재만 묻지 않는다. 꺼진 트리거는 pg_trigger 에 **행이 그대로 남고** tgenabled 만
  --    'D'(꺼짐)·'R'(복제본에서만)이 된다 — 2026-08-07 리허설 실측: 트리거를 끈 채로 이
  --    쿼리가 「✅ 전부 통과」를 냈다. 안 잰 것을 통과로 내면 그건 확인이 아니다.
  select e.n,
         (select g.tgenabled from pg_trigger g
            join pg_class r on r.oid=g.tgrelid
           where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n) as 상태
    from 기대트리거 e
), 빠진트리거 as (
  -- 상태를 이름 옆에 붙인다 — 「없음」은 판을 부어야 하고 「꺼짐」은 enable 한 줄이라 처방이 갈린다.
  -- ⚠ `상태::text` 캐스트가 필수다. tgenabled 는 `"char"`(1바이트) 타입이라 `||` 후보가 갈려
  --    `operator is not unique` 로 **쿼리 전체가 안 돈다** — 파일 층 검사는 이걸 못 본다(2026-08-07 실측).
  select string_agg(n || case when 상태 is null then '' else ' (꺼짐:' || 상태::text || ')' end,
                    ', ' order by n) v
    from 트리거상태 where 상태 is null or 상태 not in ('O', 'A')
), 현재이력xml as (
  select CASE WHEN to_regclass('engine.schema_migrations') is null THEN null::xml
              ELSE query_to_xml(
                'select version, name, checksum, applied_at::text as applied_at
                   from engine.schema_migrations
                  order by applied_at desc, version desc
                  limit 1',
                false, false, '')
         END as x
), 현재이력 as (
  select ((xpath('/table/row/version/text()', x))[1])::text as version,
         ((xpath('/table/row/name/text()', x))[1])::text as name,
         ((xpath('/table/row/checksum/text()', x))[1])::text as checksum,
         ((xpath('/table/row/applied_at/text()', x))[1])::text as applied_at
    from 현재이력xml
), 셈 as (select
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
  -- 검수자 판(20260807190000 · 절단문서 ②-17): 뷰가 있고 옛 정책이 없어야 **둘 다** 맞다.
  --   뷰만 세고 정책을 안 세면 「옛 통로가 남았다」가 통과로 보인다.
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue') as 검수뷰,
  (select count(*) from pg_policies
    where schemaname='engine' and policyname='inspector_queue_submissions') as 옛검수정책,
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출,
  -- 마감(20260808010000): 열만 서고 **아무도 안 채우는** 상태가 이 저장소에서 네 번째다
  --   (`daily_activity.expected`·`model`·`prompt_ver` 가 그렇게 서 있다). 배정에 마감이
  --   없으면 「마감 대비 여유」가 그 학생에게 영영 없다 — 조용히 빈칸으로 남지 않게 센다.
  --   ⚠ **c10 이 선 뒤에 만들어진 배정만** 센다. 옛 행의 마감은 아무도 모르고, 지어내
  --      채우는 것은 복원이 아니라 날조다(머리말 ⛔).
  (select count(*) from engine.submissions s
     join engine.learning_events e on e.event_id = s.event_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and s.occurred_at >= (select applied_at from engine.schema_migrations
                             where version = '20260808010000')) as 마감없는배정,
  -- 분모의 정본은 `task.assigned` 사건 하나다(머리말). `daily_activity.expected` 는 파생
  --   캐시 자리로 남겨 뒀고, 여기 값이 들어오면 분모가 둘이 된 것이다 — 그 순간 빨개진다.
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염,
  -- 폐기 사유(20260809090000): CHECK 는 「사유가 있으면 폐기」만 걸고 역방향은 일부러 안 건다
  --   (조각 이전 행이 있으면 부어지지 않는다 · F103). 그 자리를 이 카운터가 진다 —
  --   **이 조각이 선 뒤에 갱신된 job 만** 센다. 옛 폐기의 사유는 아무도 모른다.
  (select count(*) from engine.pipeline_jobs j
    where j.status = 'discarded' and j.discard_reason is null
      and j.updated_at >= (select applied_at from engine.schema_migrations
                            where version = '20260809090000')) as 폐기사유없는폐기,
  -- 검수 판이 **올라간 판인지**(20260809050000): `검수뷰=1` 은 뷰의 존재만 말한다.
  --   c8 의 12열 판이 그대로 서 있어도 그 칸은 1이라 초록이다 — 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문,
  -- ── 라디오 원장(20260811160000 · radio 스키마 — engine 칸을 안 건드린다) ──
  -- 표 6 · RLS 6 · 정책 0(전면 거부가 정상 — 정책이 생기는 순간 노출 설계가 필요하다).
  (select count(*) from pg_tables where schemaname='radio') as 라디오표수,
  (select count(*) from pg_tables where schemaname='radio' and rowsecurity) as 라디오RLS수,
  (select count(*) from pg_policies where schemaname='radio') as 라디오정책수,
  (select count(*) from 대상역할 r cross join 라디오테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','radio',t.t), p.p)) as 라디오새는권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('radio'), 'USAGE')) as 라디오새는스키마,
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('radio')
      and conname='broadcast_segment_kind_c10') as 라디오kind제약,
  -- 링크 보호 트리거 — 존재가 아니라 **켜짐**을 센다(engine 트리거상태와 같은 이유).
  (select count(*) from pg_trigger g
     join pg_class c2 on c2.oid=g.tgrelid
    where c2.relnamespace=to_regnamespace('radio')
      and g.tgname='viewer_link_protect' and g.tgenabled in ('O','A')) as 연동보호트리거,
  -- 활성 링크는 채널당 1개 — 부분 유일 인덱스가 서 있어야 §3 의 유일성이 물리다.
  (select count(*) from pg_indexes
    where schemaname='radio' and indexname='viewer_link_active') as 연동활성유일
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
             and 검수판열=22 and 검수판원문=0
             and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
             and 라디오새는권한=0 and 라디오새는스키마=0
             and 라디오kind제약=1 and 연동보호트리거=1 and 연동활성유일=1
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260811160000'
              and (select checksum from 현재이력)='26add75082845c81c60e696bf9e3943eb74bb321a47bd4cc1c1e71e126d03d59' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·0·0·22·0·6·6·0·0·0·1·1·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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

-- 확인
-- ① 라디오 원장 6표는 **radio 스키마**라 engine 카운터가 하나도 안 움직인다(테이블수=11 그대로).
--    새 칸 여덟: 라디오표수 6 · 라디오RLS수 6 · 라디오정책수 0(정책 0 = 전면 거부가 정상) ·
--    라디오새는권한 0 · 라디오새는스키마 0 · 라디오kind제약 1 · 연동보호트리거 1(존재가 아니라
--    **켜짐**을 센다 — 꺼진 트리거는 0으로 떨어진다) · 연동활성유일 1(채널당 활성 링크 1).
-- ② ❌ 문구 칸 이름 — 위 판정 CASE 와 **같은 순서**다:
--    테이블수 · RLS켜짐 · 정책수 · 새는테이블권한 · 새는스키마권한 · 삭제차단 · 실패상태
--    · 이력정책 · 잡없는제출 · 검수뷰 · 옛검수정책 · 마감없는배정 · 분모칸오염
--    · 폐기사유없는폐기 · 검수판열 · 검수판원문 · 라디오표수 · 라디오RLS수 · 라디오정책수
--    · 라디오새는권한 · 라디오새는스키마 · 라디오kind제약 · 연동보호트리거 · 연동활성유일
-- ③ 🔴 **이 조각은 자리만 판다 — 채우는 코드는 0줄이다.** 생산자 = P0 수집봇(읽기 전용
--    폴링)·인제스트 Fn 이고 이 조각 뒤에 선다. `ingest_heartbeat` 행이 0인 동안은 「봇이
--    한 번도 안 돌았다」가 사실이다 — 표가 섰다는 것을 「수집이 돈다」로 읽지 않는다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 radio 쪽 1개를 더했다 — engine 쪽은
--    한 글자도 안 바꿨다).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: broadcast_segment_kind_c10 · corrections_promotion_intent_c10
--         · corrections_supersedes_not_self_c10 · corrections_verdict_c10
--         · learners_signup_attempts_nonneg_c10 · learners_temp_password_paired_c10
--         · learning_events_correction_target_c10 · learning_events_event_type_c10
--         · learning_events_task_type_c10 · pipeline_jobs_discard_reason_c10
--         · staff_role_c10 · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
