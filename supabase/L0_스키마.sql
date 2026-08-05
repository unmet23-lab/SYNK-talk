-- ============================================================================
-- SYNK L0 데이터 계약 — Postgres 스키마 실물
-- 정본 문서 = docs/L0_데이터계약.md (이 파일은 그 문서의 실행 가능한 형태)
-- 필드 「무엇이 필수인가」 정본 = 계약/수집_교정_계약.json (c3)
--
-- 적용법: Supabase 대시보드 → SQL Editor → 전문 붙여넣기 → Run
--
-- ⚠ 재실행의 정확한 성질 — 두 가지가 다르다:
--    · 안전하다  = 여러 번 돌려도 에러가 안 나고 **데이터를 안 지운다**  ✅
--    · 반영된다  = 이 파일을 고친 뒤 다시 돌리면 그 변경이 적용된다      ❌ 아니다
--    `create table if not exists` 는 테이블이 이미 있으면 **문장 전체를 건너뛴다.**
--    그래서 나중에 열·CHECK 를 고치고 재실행해도 **아무 일도 안 일어나는데 초록으로 보인다.**
--    → 이미 선 테이블의 변경은 반드시 별도 `alter table` 로 적는다.
--    → CHECK 이름에 계약 버전이 박혀 있다(지금 `..._c4`). 다음 개정은 이름째 갈아끼운다:
--         alter table engine.learning_events drop constraint learning_events_event_type_c4;
--         alter table engine.learning_events add  constraint learning_events_event_type_c5 check (...);
--       꼬리의 확인 ④ 가 「옛 이름이 그대로 남아 있음」을 드러낸다.
--    ⚠ 이 파일은 2026-08-06에 c3→c4로 올랐다(event_type 6→9종). **그 전에 이미 적용한 DB가 있다면**
--       재실행이 아니라 위 alter 3쌍(event_type·task_type·corrections_verdict)으로 이행한다.
-- ============================================================================

create schema if not exists engine;

-- engine 스키마는 API(PostgREST)에 노출하지 않는다. 앱은 Edge Function만 통한다.
-- RLS는 그래도 켠다 — 나중에 노출하는 날 잊어도 닫힌 채로 실패하게.
revoke all on schema engine from anon, authenticated;

do $$ begin
  create type engine.actor_kind as enum ('learner', 'ai', 'teacher');
exception when duplicate_object then null; end $$;


-- ─── 3-1. learners ──────────────────────────────────────────────────────────
create table if not exists engine.learners (
  learner_id      uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique references auth.users(id),  -- 로그인 코드 계정 (§4)
  student_code    text unique not null,      -- SYNK-001 · 사람이 부르는 이름표 (비밀 아님)
  display_name    text,
  contact         text,
  birth_year      int,
  level_current   text,
  created_at      timestamptz not null default now(),
  schema_ver      text not null
);


-- ─── 3-2. learning_events (N1) ──────────────────────────────────────────────
create table if not exists engine.learning_events (
  event_id         uuid primary key default gen_random_uuid(),
  learner_id       uuid not null references engine.learners(learner_id) on delete cascade,
  event_type       text not null,
  task_type        text,
  actor_kind       engine.actor_kind not null default 'learner',
  occurred_at      timestamptz not null,
  ingested_at      timestamptz not null default now(),
  correlation_id   uuid,
  idempotency_key  text not null,
  session_id       uuid,
  content_id       uuid,
  skill_ids        text[] not null default '{}',
  level_snapshot   text,
  intervention_id  uuid,
  model            text,
  prompt_ver       text,
  policy_ver       text,
  consent_ver      text not null,
  degraded         boolean not null default false,
  payload          jsonb not null default '{}',
  schema_ver       text not null,
  unique (learner_id, idempotency_key),

  -- c4 9종 (계약 `계약/수집_교정_계약.json` 값목록이 정본 — 여기는 파생이다).
  -- c3 6종 + 3종 추가: intervention.delivered · correction.viewed · data_use.granted (문서 §6-1 해소).
  constraint learning_events_event_type_c4 check (event_type in (
    'submission.created', 'quiz.answered', 'choice.selected',
    'correction.responded', 'correction.viewed', 'preference.stated',
    'session.abandoned', 'intervention.delivered', 'data_use.granted')),
  constraint learning_events_task_type_c4 check (task_type is null or task_type in (
    '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'))
);

create index if not exists learning_events_learner_time_idx
  on engine.learning_events (learner_id, occurred_at desc);
create index if not exists learning_events_type_time_idx
  on engine.learning_events (event_type, occurred_at desc);
create index if not exists learning_events_intervention_idx
  on engine.learning_events (intervention_id) where intervention_id is not null;
create index if not exists learning_events_skills_idx
  on engine.learning_events using gin (skill_ids);


-- ─── 3-3. submissions ───────────────────────────────────────────────────────
-- learner_id를 두지 않는다 — event_id로만 조회한다 (문서 §3-3 · 중요-6)
create table if not exists engine.submissions (
  submission_id    uuid primary key default gen_random_uuid(),
  event_id         uuid not null references engine.learning_events(event_id) on delete restrict,
  task_type        text not null,
  task_ref         text,
  task_snapshot    jsonb,
  task_schema_ver  text,
  body_original    text,        -- 원문 — 절대 갱신하지 않는다
  audio_ref        text,
  transcript       text,
  transcript_state text,
  redaction_ver    text,
  redaction_result jsonb,
  occurred_at      timestamptz not null,
  schema_ver       text not null
);

create index if not exists submissions_event_idx on engine.submissions (event_id);


-- ─── 3-4. corrections (생성 후 불변) ────────────────────────────────────────
create table if not exists engine.corrections (
  correction_id          uuid primary key default gen_random_uuid(),
  submission_id          uuid not null references engine.submissions(submission_id) on delete restrict,
  reviewed_correction_id uuid references engine.corrections(correction_id),
  actor_kind             engine.actor_kind not null,
  corrected_text         text,
  -- 오류 태그 23종 검증은 서버(계약 파일 정본). DB CHECK로 복제하지 않는다 —
  -- 배열 CHECK는 23개 리터럴을 여기 박아 계약 파일과 이중 정본이 된다 (문서 §5).
  error_tags             text[] not null default '{}',
  explanation            text,
  model                  text,
  prompt_ver             text,
  reviewer               text,
  verdict                text,
  verdict_reason         text,
  reviewer_confidence    numeric(3,2) check (reviewer_confidence between 0 and 1),
  created_at             timestamptz not null default now(),
  schema_ver             text not null,

  constraint corrections_verdict_c4 check (verdict is null or verdict in (
    'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'))
);

create index if not exists corrections_submission_idx on engine.corrections (submission_id);


-- ─── 3-5. skills ────────────────────────────────────────────────────────────
create table if not exists engine.skills (
  skill_id     text primary key,
  label_ko     text not null,
  label_mn     text,
  domain       text not null,
  parent_id    text references engine.skills(skill_id),
  error_tags   text[] default '{}',
  schema_ver   text not null
);


-- ─── 3-6. consents ──────────────────────────────────────────────────────────
create table if not exists engine.consents (
  consent_id    uuid primary key default gen_random_uuid(),
  learner_id    uuid not null references engine.learners(learner_id) on delete cascade,
  consent_ver   text not null,
  doc_hash      text,
  agreed_at     timestamptz not null,
  revoked_at    timestamptz,
  schema_ver    text not null
);

create index if not exists consents_learner_idx on engine.consents (learner_id);


-- ─── 4. 권한 (RLS) ──────────────────────────────────────────────────────────
-- 학생 토큰 = 읽기만, 자기 것만. 쓰기는 전부 Edge Function(service_role).
-- service_role은 RLS를 우회하므로 서버는 항상 토큰에서 학생을 확정한다
-- (요청 본문의 learner_id를 믿지 않는다).

alter table engine.learners        enable row level security;
alter table engine.learning_events enable row level security;
alter table engine.submissions     enable row level security;
alter table engine.corrections     enable row level security;
alter table engine.consents        enable row level security;
alter table engine.skills          enable row level security;

-- 조인을 정책마다 다시 적으면 갈라진다 — 한 곳에서 파생시킨다.
create or replace function engine.current_learner_id() returns uuid
  language sql stable security invoker set search_path = engine, public as
$$ select learner_id from engine.learners where auth_user_id = auth.uid() $$;

drop policy if exists learner_self on engine.learners;
create policy learner_self on engine.learners for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists learner_self_events on engine.learning_events;
create policy learner_self_events on engine.learning_events for select to authenticated
  using (learner_id = engine.current_learner_id());

drop policy if exists learner_self_submissions on engine.submissions;
create policy learner_self_submissions on engine.submissions for select to authenticated
  using (event_id in (select event_id from engine.learning_events
                      where learner_id = engine.current_learner_id()));

drop policy if exists learner_self_corrections on engine.corrections;
create policy learner_self_corrections on engine.corrections for select to authenticated
  using (submission_id in (
    select s.submission_id from engine.submissions s
    join engine.learning_events e on e.event_id = s.event_id
    where e.learner_id = engine.current_learner_id()));

drop policy if exists learner_self_consents on engine.consents;
create policy learner_self_consents on engine.consents for select to authenticated
  using (learner_id = engine.current_learner_id());

-- skills = 개념 사전(개인정보 없음). 정책을 안 만들어 닫아둔다 — 앱이 필요해지면 그때 연다.


-- ============================================================================
-- 확인 (한 번에) — 위를 Run 한 뒤, 아래 select 를 통째로 복사해 Run 한다.
--   `판정` 칸에 「✅ 전부 통과」가 나오면 끝. 숫자를 비교할 필요가 없다.
-- ============================================================================
/*
select case when 테이블수=6 and RLS켜짐=6 and 정책수=5 and 새는권한=0 and c3제약=3
            then '✅ 전부 통과'
            else '❌ 아래 숫자를 그대로 알려주세요 (기대: 6·6·5·0·3)' end as 판정, *
from (select
  (select count(*) from pg_tables  where schemaname='engine')                    as 테이블수,
  (select count(*) from pg_tables  where schemaname='engine' and rowsecurity)    as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine')                   as 정책수,
  (select count(*) from information_schema.role_table_grants
     where table_schema='engine' and grantee in ('anon','authenticated'))        as 새는권한,
  (select count(*) from pg_constraint
     where connamespace='engine'::regnamespace and contype='c'
       and right(conname,3)='_c4')                                               as c4제약
) t;
*/

-- ============================================================================
-- 확인 (갈래별) — 위 한 줄이 ❌ 일 때 어디가 어긋났는지 보는 용도.
-- ============================================================================
-- ① 테이블 6개 · RLS 전부 true 여야 한다
--    select tablename, rowsecurity from pg_tables where schemaname='engine' order by 1;
--
-- ② 정책 5개가 나와야 한다 (skills 제외)
--    select tablename, policyname, cmd from pg_policies where schemaname='engine' order by 1;
--
-- ③ 아무 행도 안 나와야 한다 — anon·authenticated에 engine 권한이 남아 있으면 구멍이다
--    select grantee, table_name, privilege_type from information_schema.role_table_grants
--    where table_schema='engine' and grantee in ('anon','authenticated');
--
-- ④ CHECK 제약 3개가 **_c4 이름으로** 붙어 있어야 한다 — 위 ⚠의 「조용한 미적용」을 드러낸다.
--    계약이 c5로 올라갔는데 여기 _c4가 그대로면, 파일만 고치고 DB엔 안 들어간 상태다.
--    🔴 여기 `_c3`가 나오면 **이 파일이 c4로 오르기 전(2026-08-06)에 이미 적용된 DB**다 —
--       재실행으로는 안 바뀐다(create table if not exists가 통째로 건너뛴다). 헤더 ⚠의 alter 경로로 간다.
--    select conname from pg_constraint
--    where connamespace='engine'::regnamespace and contype='c' and conname like '%\_c_' order by 1;
--    기대: corrections_verdict_c3 · learning_events_event_type_c3 · learning_events_task_type_c3
