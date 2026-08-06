create schema engine;
revoke all on schema engine from anon, authenticated;

create type engine.actor_kind as enum ('learner', 'ai', 'teacher');

create table engine.learners (
  learner_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id),
  student_code text unique not null,
  display_name text,
  contact text,
  birth_year int,
  level_current text,
  created_at timestamptz not null default now(),
  schema_ver text not null
);

create table engine.learning_events (
  event_id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references engine.learners(learner_id) on delete cascade,
  event_type text not null,
  task_type text,
  actor_kind engine.actor_kind not null default 'learner',
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  correlation_id uuid,
  idempotency_key text not null,
  session_id uuid,
  content_id uuid,
  skill_ids text[] not null default '{}',
  level_snapshot text,
  intervention_id uuid,
  model text,
  prompt_ver text,
  policy_ver text,
  consent_ver text not null,
  degraded boolean not null default false,
  payload jsonb not null default '{}',
  schema_ver text not null,
  unique (learner_id, idempotency_key),
  constraint learning_events_event_type_c3 check (event_type in (
    'submission.created', 'quiz.answered', 'choice.selected',
    'correction.responded', 'preference.stated', 'session.abandoned'
  )),
  constraint learning_events_task_type_c3 check (task_type is null or task_type in (
    '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
  ))
);

create index learning_events_learner_time_idx
  on engine.learning_events (learner_id, occurred_at desc);
create index learning_events_type_time_idx
  on engine.learning_events (event_type, occurred_at desc);
create index learning_events_intervention_idx
  on engine.learning_events (intervention_id) where intervention_id is not null;
create index learning_events_skills_idx
  on engine.learning_events using gin (skill_ids);

create table engine.submissions (
  submission_id uuid primary key default gen_random_uuid(),
  event_id uuid not null references engine.learning_events(event_id) on delete restrict,
  task_type text not null,
  task_ref text,
  task_snapshot jsonb,
  task_schema_ver text,
  body_original text,
  audio_ref text,
  transcript text,
  transcript_state text,
  redaction_ver text,
  redaction_result jsonb,
  occurred_at timestamptz not null,
  schema_ver text not null
);

create index submissions_event_idx on engine.submissions (event_id);

create table engine.corrections (
  correction_id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references engine.submissions(submission_id) on delete restrict,
  reviewed_correction_id uuid references engine.corrections(correction_id),
  actor_kind engine.actor_kind not null,
  corrected_text text,
  error_tags text[] not null default '{}',
  explanation text,
  model text,
  prompt_ver text,
  reviewer text,
  verdict text,
  verdict_reason text,
  reviewer_confidence numeric(3,2) check (reviewer_confidence between 0 and 1),
  created_at timestamptz not null default now(),
  schema_ver text not null,
  constraint corrections_verdict_c3 check (verdict is null or verdict in (
    'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
  ))
);

create index corrections_submission_idx on engine.corrections (submission_id);

create table engine.skills (
  skill_id text primary key,
  label_ko text not null,
  label_mn text,
  domain text not null,
  parent_id text references engine.skills(skill_id),
  error_tags text[] default '{}',
  schema_ver text not null
);

create table engine.consents (
  consent_id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references engine.learners(learner_id) on delete cascade,
  consent_ver text not null,
  doc_hash text,
  agreed_at timestamptz not null,
  revoked_at timestamptz,
  schema_ver text not null
);

create index consents_learner_idx on engine.consents (learner_id);

alter table engine.learners enable row level security;
alter table engine.learning_events enable row level security;
alter table engine.submissions enable row level security;
alter table engine.corrections enable row level security;
alter table engine.consents enable row level security;
alter table engine.skills enable row level security;

create or replace function engine.current_learner_id() returns uuid
  language sql stable security invoker set search_path = engine, public as
$$ select learner_id from engine.learners where auth_user_id = auth.uid() $$;

create policy learner_self on engine.learners for select to authenticated
  using (auth_user_id = auth.uid());
create policy learner_self_events on engine.learning_events for select to authenticated
  using (learner_id = engine.current_learner_id());
create policy learner_self_submissions on engine.submissions for select to authenticated
  using (event_id in (
    select event_id from engine.learning_events
     where learner_id = engine.current_learner_id()
  ));
create policy learner_self_corrections on engine.corrections for select to authenticated
  using (submission_id in (
    select s.submission_id
      from engine.submissions s
      join engine.learning_events e on e.event_id = s.event_id
     where e.learner_id = engine.current_learner_id()
  ));
create policy learner_self_consents on engine.consents for select to authenticated
  using (learner_id = engine.current_learner_id());
