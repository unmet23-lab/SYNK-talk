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
--    → CHECK 이름에 계약 버전이 박혀 있다(지금 `..._c5`). 다음 개정은 이름째 갈아끼운다:
--         alter table engine.learning_events drop constraint learning_events_event_type_c5;
--         alter table engine.learning_events add  constraint learning_events_event_type_c6 check (...);
--       꼬리의 확인 ④ 가 「옛 이름이 그대로 남아 있음」을 드러낸다.
--    ⚠ 이 파일은 2026-08-06에 c4→c5로 올랐다(수집 파이프라인 확장 · 문서 §9).
--       **아직 어느 DB에도 적용되지 않았으므로** 확장을 alter 체인이 아니라 기준선에 흡수했다 —
--       행이 0인 스키마에 마이그레이션 이력을 쌓는 것은 비용만 남는다.
--       🔴 **만약 c3·c4 판이 이미 선 DB가 있다면** 이 파일 재실행으로는 안 바뀐다.
--       그때는 `docs/L0_데이터계약.md` §9-4 의 alter 목록으로 이행하고, 꼬리 확인 ④ 가 옛 이름을 드러낸다.
-- ============================================================================

create schema if not exists engine;

-- engine 스키마는 API(PostgREST)에 노출하지 않는다. 앱은 Edge Function만 통한다.
-- RLS는 그래도 켠다 — 나중에 노출하는 날 잊어도 닫힌 채로 실패하게.
revoke all on schema engine from anon, authenticated;

do $$ begin
  create type engine.actor_kind as enum ('learner', 'ai', 'teacher');
exception when duplicate_object then null; end $$;

-- 처리 상태는 **학습 어휘가 아니라 운영 어휘**다 — 계약 파일(c5)이 소유하지 않는다.
-- 그래서 CHECK가 아니라 enum으로 둔다: CHECK로 두면 이름에 계약 버전을 달게 되어
-- 「계약에서 파생된 값목록」처럼 보이고, 그 순간 정본이 어디인지가 흐려진다.
do $$ begin
  create type engine.job_status as enum (
    'pending', 'processing', 'ai_processed', 'verified', 'discarded', 'revoked');
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
  -- c5: 가입 1회 문항 3종 (문서 §9-2 · 전부 학생 화면 비노출).
  -- 나중에 붙이면 그때 재적 전원에게 다시 물어야 한다 — 한 번에 낸다.
  home_aimag      text,     -- 성장한 아이막 — 지역 억양 편차의 유일한 축(UB/지방 이분법은 예측력이 없다)
  gender          text,     -- 🔴화자 편향(소수 화자 과적합)을 재는 유일한 계기판. **분포 점검 전용 · 학습 라벨 아님**
  goal_track      text,     -- 'study'(유학) | 'work'(EPS·취업) | 'culture' — 같은 오류도 목적에 따라 처방이 다르다
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
  -- c5: 교정을 받고 **다시 낸** 고리. correlation_id(한 세션의 흐름)와 다른 축이다 —
  -- 「학습이 실제로 일어났는가」의 유일한 결과 변수라, 두 행을 잇는 기회는 그때뿐이다.
  retry_of_event_id uuid references engine.learning_events(event_id),
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

  -- c5 10종 (계약 `계약/수집_교정_계약.json` 값목록이 정본 — 여기는 파생이다).
  -- c3 6종 + c4 3종(intervention.delivered · correction.viewed · data_use.granted)
  --        + c5 1종 data_use.revoked — 🔴폐기(discarded)와 철회(revoked)는 다른 사건이다(문서 §9-3).
  constraint learning_events_event_type_c5 check (event_type in (
    'submission.created', 'quiz.answered', 'choice.selected',
    'correction.responded', 'correction.viewed', 'preference.stated',
    'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked')),
  constraint learning_events_task_type_c5 check (task_type is null or task_type in (
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
  task_format      text,        -- c5: 낭독·자유발화… 🔴task_type과 **다른 축**(계약 `왜_task_format이_따로인가`)
  task_ref         text,
  task_snapshot    jsonb,       -- 그때 학생이 본 것 + 과제 설계 속성(문서 §9-2: challenge_id·addressee_level·target_phonemes·prompt_seed)
  task_schema_ver  text,
  body_original    text,        -- 원문 — 절대 갱신하지 않는다
  image_refs       text[],      -- c5: 손글씨 답안 사진(TOPIK 쓰기 첨삭) — 원본이 이미지인 제출의 자리
  audio_ref        text,
  audio_duration_sec numeric(6,2),  -- c5: 검수 예산·큐 정렬에 상시 쓰인다(세그먼트에서도 나오지만 매번 펴는 비용이 크다)
  -- c5 전사 2칸 — 🔴한 칸이면 파인튜닝 **입력쪽이 소실된다**.
  --   Whisper 는 오발음을 정타로 「고쳐 듣기」 한다: 학생이 "작다"라고 발음한 것을 "적다"로 정규화해 버린다.
  --   그래서 기계 전사(transcript)를 남긴 채, 사람이 **들린 대로** 되돌린 값을 옆 칸에 적는다.
  --   두 칸의 diff 자체가 ASR 오류 학습 쌍이다 — 🚫이것을 `error_tags`의 `mishearing` 으로 만들지 않는다
  --   (학생 오류가 아니라 기계 오류일 수 있어 라벨이 거짓이 된다 · 계약 c5 ③).
  transcript          text,     -- 기계 전사 (STT 출력 · 갱신하지 않는다)
  transcript_verified text,     -- 사람이 확인·수정한 「들린 대로」 — 누가·언제는 corrections 행이 들고 있다
  transcript_state    text,     -- 'ai' | 'verified' | 'failed'
  stt_segments     jsonb,       -- verbose_json [{start,end,text,avg_logprob,no_speech_prob}] — 무음 하이라이트·구간 지정·검수 우선순위의 원천
  stt_confidence   numeric(6,3),-- 세그먼트 평균 logprob (낮을수록 저신뢰 → 검수 우선 배정)
  code_switch_spans jsonb,      -- [{start_ms,end_ms,mn_text}] — За·Тийм 추임새 포함
  redaction_ver    text,
  redaction_result jsonb,
  -- c5: 동의 **철회** 이행 표식. 폐기(job status='discarded')는 파일을 남기지만 철회는 지운다.
  -- 행 자체는 남는다 — 통계·계보는 유지하고 내용만 없어진다(동의문 §철회 · 문서 §9-3).
  audio_deleted_at timestamptz,
  occurred_at      timestamptz not null,
  schema_ver       text not null,

  constraint submissions_task_format_c5 check (task_format is null or task_format in (
    '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭'))
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
  -- c5: 검수 산출 3종.
  --   🔑 `was_edited` 는 만들지 않는다 — **`verdict` 3값이 이미 그것이다**
  --      ('AI 교정이 맞다'=무편집 승인 / '고칠 곳이 있다'=수정 승인 / '원문이 이미 맞다').
  --      따로 두면 둘이 어긋나는 행이 반드시 생기고, 그때 어느 쪽이 진실인지 알 방법이 없다.
  l1_source_phrase       text,   -- 직역 오류의 원인이 된 몽골어 관용구 — L1 간섭 1:1 매핑의 집계 키
  rubric_scores          jsonb,  -- TOPIK 쓰기 첨삭 {"내용":12,"전개":8,"어휘문법":9,"예상등급":"4급"} — 🔴강사만 매길 수 있다
  review_listened_ms     integer,-- 검수자가 실제로 들은 시간 — **검수자 1명 체제의 유일한 품질 계기판**
  created_at             timestamptz not null default now(),
  schema_ver             text not null,

  constraint corrections_verdict_c5 check (verdict is null or verdict in (
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


-- ─── 3-7. pipeline_jobs (c5) — 처리 상태만. 학습 내용은 한 글자도 담지 않는다 ──
-- 왜 별도 테이블인가: learning_events 는 append-only 이고 submissions 의 원문은 불변인데,
-- 큐는 **본질적으로 가변**이다(집었다 놓았다 재시도한다). 불변 테이블에 가변 열을 섞는 순간
-- 「원문을 갱신하지 않는다」가 지켜지는지 아무도 못 본다.
-- ⚠ status 는 **처리 상태이지 학습 사실이 아니다** — 「검수됐다」의 진실은 언제나 corrections 행이고
--    여기 'verified' 는 그 사실의 캐시다. 둘이 어긋나면 corrections 가 맞다.
create table if not exists engine.pipeline_jobs (
  job_id          uuid primary key default gen_random_uuid(),
  submission_id   uuid not null unique references engine.submissions(submission_id) on delete restrict,
  status          engine.job_status not null default 'pending',
  -- 큐 신뢰성은 3개면 실패 모드가 덮인다(파일럿 10~20명·단일 워커).
  -- 🚫 claim/heartbeat/DLQ/outbox 풀세트는 이 규모에 과하다 — 규모가 오면 그때.
  attempt_count   integer not null default 0,
  attempt_id      uuid,           -- 이번 시도의 표식 — **늦게 돌아온 유령 워커**의 쓰기를 가른다
  lease_until     timestamptz,    -- 이 시각이 지나면 다른 워커가 집어간다(죽은 워커가 행을 영원히 잠그지 않게)
  is_audit_sample boolean not null default (random() < 0.05),  -- 무작위 5% 감사 레인
                                  -- 🔑 고신뢰 오전사는 저신뢰 샘플링만으로는 **영원히 안 잡힌다**
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 워커는 `... where status='pending' and (lease_until is null or lease_until < now())
--          order by is_audit_sample desc, created_at for update skip locked limit 10`
-- 으로 집는다 — 두 워커가 같은 행을 잡지 않고, 잠긴 행에서 멈추지도 않는다.
create index if not exists pipeline_jobs_queue_idx
  on engine.pipeline_jobs (status, created_at) where status = 'pending';


-- ─── 3-8. daily_activity (c5) — 부재는 이벤트가 아니다 ──────────────────────
-- 접속 0인 날은 아무 이벤트도 남기지 않는다. 그래서 이벤트 테이블만 보면
-- 「안 왔다」와 「기록이 안 됐다」가 똑같이 생겼다 — 이탈 신호를 영영 못 배운다.
-- 매일 1회 재적 전원에 대해 행을 만든다(활동 없으면 0).
create table if not exists engine.daily_activity (
  learner_id     uuid not null references engine.learners(learner_id) on delete cascade,
  activity_date  date not null,
  session_count  integer not null default 0,
  primary key (learner_id, activity_date)
);


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
alter table engine.pipeline_jobs   enable row level security;
alter table engine.daily_activity  enable row level security;

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
-- pipeline_jobs·daily_activity(c5) 도 같다 — **운영 테이블이라 학생이 볼 이유가 없다.**
-- RLS만 켜고 정책을 안 만들면 학생 토큰에는 0행으로 보인다(닫힌 채로 실패). 검수 대시보드·n8n은
-- service_role 로 접근하고, 검수자 역할 인증은 L0 §4-5(S1 범위 밖)에서 확정한다.


-- ============================================================================
-- 확인 (한 번에) — 위를 Run 한 뒤, 아래 select 를 통째로 복사해 Run 한다.
--   `판정` 칸에 「✅ 전부 통과」가 나오면 끝. 숫자를 비교할 필요가 없다.
-- ============================================================================
/*
select case when 테이블수=8 and RLS켜짐=8 and 정책수=5 and 새는권한=0 and c5제약=4
            then '✅ 전부 통과'
            else '❌ 아래 숫자를 그대로 알려주세요 (기대: 8·8·5·0·4)' end as 판정, *
from (select
  (select count(*) from pg_tables  where schemaname='engine')                    as 테이블수,
  (select count(*) from pg_tables  where schemaname='engine' and rowsecurity)    as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine')                   as 정책수,
  (select count(*) from information_schema.role_table_grants
     where table_schema='engine' and grantee in ('anon','authenticated'))        as 새는권한,
  (select count(*) from pg_constraint
     where connamespace='engine'::regnamespace and contype='c'
       and right(conname,3)='_c5')                                               as c5제약
) t;
*/

-- ============================================================================
-- 확인 (갈래별) — 위 한 줄이 ❌ 일 때 어디가 어긋났는지 보는 용도.
-- ============================================================================
-- ① 테이블 8개 · RLS 전부 true 여야 한다 (c5에서 pipeline_jobs·daily_activity 둘 늘었다)
--    select tablename, rowsecurity from pg_tables where schemaname='engine' order by 1;
--
-- ② 정책 5개가 나와야 한다 (skills·pipeline_jobs·daily_activity 제외 — 학생이 볼 이유가 없다)
--    select tablename, policyname, cmd from pg_policies where schemaname='engine' order by 1;
--
-- ③ 아무 행도 안 나와야 한다 — anon·authenticated에 engine 권한이 남아 있으면 구멍이다
--    select grantee, table_name, privilege_type from information_schema.role_table_grants
--    where table_schema='engine' and grantee in ('anon','authenticated');
--
-- ④ CHECK 제약 4개가 **_c5 이름으로** 붙어 있어야 한다 — 위 ⚠의 「조용한 미적용」을 드러낸다.
--    계약이 c6로 올라갔는데 여기 _c5가 그대로면, 파일만 고치고 DB엔 안 들어간 상태다.
--    🔴 여기 `_c3`·`_c4`가 나오면 **이 파일이 c5로 오르기 전에 이미 적용된 DB**다 —
--       재실행으로는 안 바뀐다(create table if not exists가 통째로 건너뛴다).
--       그때는 문서 §9-4의 alter 목록으로 이행한다(새 열·새 테이블도 함께 따라간다).
--    select conname from pg_constraint
--    where connamespace='engine'::regnamespace and contype='c' and conname like '%\_c_' order by 1;
--    기대: corrections_verdict_c5 · learning_events_event_type_c5 · learning_events_task_type_c5
--         · submissions_task_format_c5
