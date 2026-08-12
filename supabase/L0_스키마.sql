-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c6)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- 부트스트랩은 세 갈래뿐이다.
--   1) engine 없음 + public 테이블 0 + Auth 계정 0: 빈 DB 기준선 생성
--   2) 정확한 낮은 판 c3 또는 c4: ALTER로 c6까지 이행
--   3) 부분·혼합·불명: 트랜잭션 중단, 이력 기록 금지
-- 이력 없는 현행 c6 전용 갈래는 의도적으로 없다.
-- ============================================================================

begin;

create temp table synk_migration_preflight (
  engine_existed boolean not null,
  history_existed boolean not null,
  public_table_count bigint not null,
  auth_user_count bigint not null
) on commit drop;

insert into synk_migration_preflight
select
  exists (select 1 from information_schema.schemata where schema_name = 'engine'),
  to_regclass('engine.schema_migrations') is not null,
  (select count(*) from pg_tables where schemaname = 'public'),
  (select count(*) from auth.users);

create temp table synk_expected_lower_columns (
  table_name text not null,
  column_name text not null,
  udt_name text not null,
  is_nullable text not null,
  primary key (table_name, column_name)
) on commit drop;

insert into synk_expected_lower_columns values
  ('learners','learner_id','uuid','NO'),
  ('learners','auth_user_id','uuid','YES'),
  ('learners','student_code','text','NO'),
  ('learners','display_name','text','YES'),
  ('learners','contact','text','YES'),
  ('learners','birth_year','int4','YES'),
  ('learners','level_current','text','YES'),
  ('learners','created_at','timestamptz','NO'),
  ('learners','schema_ver','text','NO'),
  ('learning_events','event_id','uuid','NO'),
  ('learning_events','learner_id','uuid','NO'),
  ('learning_events','event_type','text','NO'),
  ('learning_events','task_type','text','YES'),
  ('learning_events','actor_kind','actor_kind','NO'),
  ('learning_events','occurred_at','timestamptz','NO'),
  ('learning_events','ingested_at','timestamptz','NO'),
  ('learning_events','correlation_id','uuid','YES'),
  ('learning_events','idempotency_key','text','NO'),
  ('learning_events','session_id','uuid','YES'),
  ('learning_events','content_id','uuid','YES'),
  ('learning_events','skill_ids','_text','NO'),
  ('learning_events','level_snapshot','text','YES'),
  ('learning_events','intervention_id','uuid','YES'),
  ('learning_events','model','text','YES'),
  ('learning_events','prompt_ver','text','YES'),
  ('learning_events','policy_ver','text','YES'),
  ('learning_events','consent_ver','text','NO'),
  ('learning_events','degraded','bool','NO'),
  ('learning_events','payload','jsonb','NO'),
  ('learning_events','schema_ver','text','NO'),
  ('submissions','submission_id','uuid','NO'),
  ('submissions','event_id','uuid','NO'),
  ('submissions','task_type','text','NO'),
  ('submissions','task_ref','text','YES'),
  ('submissions','task_snapshot','jsonb','YES'),
  ('submissions','task_schema_ver','text','YES'),
  ('submissions','body_original','text','YES'),
  ('submissions','audio_ref','text','YES'),
  ('submissions','transcript','text','YES'),
  ('submissions','transcript_state','text','YES'),
  ('submissions','redaction_ver','text','YES'),
  ('submissions','redaction_result','jsonb','YES'),
  ('submissions','occurred_at','timestamptz','NO'),
  ('submissions','schema_ver','text','NO'),
  ('corrections','correction_id','uuid','NO'),
  ('corrections','submission_id','uuid','NO'),
  ('corrections','reviewed_correction_id','uuid','YES'),
  ('corrections','actor_kind','actor_kind','NO'),
  ('corrections','corrected_text','text','YES'),
  ('corrections','error_tags','_text','NO'),
  ('corrections','explanation','text','YES'),
  ('corrections','model','text','YES'),
  ('corrections','prompt_ver','text','YES'),
  ('corrections','reviewer','text','YES'),
  ('corrections','verdict','text','YES'),
  ('corrections','verdict_reason','text','YES'),
  ('corrections','reviewer_confidence','numeric','YES'),
  ('corrections','created_at','timestamptz','NO'),
  ('corrections','schema_ver','text','NO'),
  ('skills','skill_id','text','NO'),
  ('skills','label_ko','text','NO'),
  ('skills','label_mn','text','YES'),
  ('skills','domain','text','NO'),
  ('skills','parent_id','text','YES'),
  ('skills','error_tags','_text','YES'),
  ('skills','schema_ver','text','NO'),
  ('consents','consent_id','uuid','NO'),
  ('consents','learner_id','uuid','NO'),
  ('consents','consent_ver','text','NO'),
  ('consents','doc_hash','text','YES'),
  ('consents','agreed_at','timestamptz','NO'),
  ('consents','revoked_at','timestamptz','YES'),
  ('consents','schema_ver','text','NO');

create schema if not exists engine;
revoke all on schema engine from anon, authenticated;

create table if not exists engine.schema_migrations (
  version text primary key,
  name text not null,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null default now()
);

alter table engine.schema_migrations enable row level security;
revoke all on table engine.schema_migrations from anon, authenticated;

-- 아래 부트스트랩 판정이 기대 목록을 **손으로 정렬한 순서**에 기대면 안 된다.
-- `array_agg(... order by ...)` 는 DB 콜레이션 순인데 사람은 눈으로 정렬하다 틀린다
-- (실측: `corrections` 를 `consents` 앞에 적어 표·인덱스·정책 세 축이 동시에 어긋났고,
--  증상은 「부분·혼합·불명」 한 줄이라 어느 축인지 안 보였다). 양쪽을 같은 자리에서
-- 정렬해 **순서가 판정에 영향을 못 주게** 만든다.
create or replace function pg_temp.synk_sorted(names text[]) returns text[]
  language sql stable as
$$ select coalesce(array_agg(n order by n), array[]::text[]) from unnest(names) as n $$;

do $migration$
declare
  migration_version constant text := '20260806150000';
  migration_name constant text := '20260806150000_engine_c6.sql';
  expected_checksum constant text := '551d9a9e8d4327ff4d0731794c6a19eef90177038ff129dd53be3ec96ba442e3'; -- migration-checksum
  recorded_checksum text;
  pre_engine boolean;
  pre_history boolean;
  pre_public bigint;
  pre_auth bigint;
  actual_tables text[];
  actual_columns_exact boolean;
  actual_constraints text[];
  actual_indexes text[];
  actual_policies text[];
  actor_values text[];
  common_exact boolean;
  mismatched text[] := array[]::text[];
  lower_version text;
begin
  select engine_existed, history_existed, public_table_count, auth_user_count
    into pre_engine, pre_history, pre_public, pre_auth
    from synk_migration_preflight;

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

  if pre_history then
    raise exception
      'engine.schema_migrations는 있으나 현행 version %가 없다 — 부분·혼합·불명 상태라 중단한다',
      migration_version;
  end if;

  if not pre_engine then
    if pre_public <> 0 or pre_auth <> 0 then
      raise exception
        'engine은 없지만 빈 DB가 아니다(public 테이블 %, Auth 계정 %) — 중단한다',
        pre_public, pre_auth;
    end if;
    lower_version := 'empty';
  else
    select coalesce(array_agg(tablename::text order by tablename::text)
                    filter (where tablename <> 'schema_migrations'), array[]::text[])
      into actual_tables
      from pg_tables
     where schemaname = 'engine';

    select not exists (
      select 1
        from synk_expected_lower_columns e
        full join (
          select table_name::text, column_name::text, udt_name::text, is_nullable::text
            from information_schema.columns
           where table_schema = 'engine'
             and table_name <> 'schema_migrations'
        ) a using (table_name, column_name)
       where e.table_name is null
          or a.table_name is null
          or e.udt_name is distinct from a.udt_name
          or e.is_nullable is distinct from a.is_nullable
    ) into actual_columns_exact;

    select coalesce(array_agg(c.conname::text order by c.conname::text), array[]::text[])
      into actual_constraints
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
     where c.connamespace = 'engine'::regnamespace
       and r.relname <> 'schema_migrations';

    select coalesce(array_agg(indexname::text order by indexname::text), array[]::text[])
      into actual_indexes
      from pg_indexes
     where schemaname = 'engine'
       and tablename <> 'schema_migrations';

    select coalesce(array_agg(
             (tablename || '.' || policyname || '.' || cmd)::text
             order by tablename, policyname, cmd), array[]::text[])
      into actual_policies
      from pg_policies
     where schemaname = 'engine';

    select coalesce(array_agg(e.enumlabel::text order by e.enumsortorder), array[]::text[])
      into actor_values
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'engine' and t.typname = 'actor_kind';

    -- 축마다 따로 재서 어긋난 이름을 모은다. 한 덩어리 boolean 이면 「아니다」만 남고
    -- 어디가 아닌지가 사라진다 — 그게 이 판정을 두 번 헛돌게 했다.
    if actual_tables <> pg_temp.synk_sorted(array[
      'consents','corrections','learners','learning_events','skills','submissions'
    ]) then
      mismatched := mismatched || '표';
    end if;

    if not actual_columns_exact then
      mismatched := mismatched || '열';
    end if;

    if actual_indexes <> pg_temp.synk_sorted(array[
      'consents_learner_idx',
      'consents_pkey',
      'corrections_pkey',
      'corrections_submission_idx',
      'learners_auth_user_id_key',
      'learners_pkey',
      'learners_student_code_key',
      'learning_events_intervention_idx',
      'learning_events_learner_id_idempotency_key_key',
      'learning_events_learner_time_idx',
      'learning_events_pkey',
      'learning_events_skills_idx',
      'learning_events_type_time_idx',
      'skills_pkey',
      'submissions_event_idx',
      'submissions_pkey'
    ]) then
      mismatched := mismatched || '인덱스';
    end if;

    if actual_policies <> pg_temp.synk_sorted(array[
      'consents.learner_self_consents.SELECT',
      'corrections.learner_self_corrections.SELECT',
      'learners.learner_self.SELECT',
      'learning_events.learner_self_events.SELECT',
      'submissions.learner_self_submissions.SELECT'
    ]) then
      mismatched := mismatched || '정책';
    end if;

    -- enum 은 선언 순서가 값의 일부라 정렬하지 않는다.
    if actor_values <> array['learner','ai','teacher']::text[] then
      mismatched := mismatched || 'actor_kind 값';
    end if;

    if to_regtype('engine.job_status') is not null then
      mismatched := mismatched || 'job_status 가 이미 있다';
    end if;

    if to_regprocedure('engine.current_learner_id()') is null then
      mismatched := mismatched || 'current_learner_id() 없음';
    end if;

    if not (select count(*) = 6 and bool_and(rowsecurity)
              from pg_tables
             where schemaname = 'engine' and tablename <> 'schema_migrations') then
      mismatched := mismatched || 'RLS';
    end if;

    if (select count(*)
          from pg_trigger g
          join pg_class r on r.oid = g.tgrelid
         where r.relnamespace = 'engine'::regnamespace and not g.tgisinternal) <> 0 then
      mismatched := mismatched || '트리거';
    end if;

    if (select count(*)
          from pg_constraint c
         where c.connamespace = 'engine'::regnamespace
           and c.conname in ('learning_events_learner_id_fkey','consents_learner_id_fkey')
           and c.confdeltype = 'c') <> 2 then
      mismatched := mismatched || 'FK on delete cascade';
    end if;

    if (select count(*)
          from pg_constraint c
         where c.connamespace = 'engine'::regnamespace
           and c.conname in ('submissions_event_id_fkey','corrections_submission_id_fkey')
           and c.confdeltype = 'r') <> 2 then
      mismatched := mismatched || 'FK on delete restrict';
    end if;

    common_exact := cardinality(mismatched) = 0;

    if common_exact and actual_constraints = pg_temp.synk_sorted(array[
      'consents_learner_id_fkey',
      'consents_pkey',
      'corrections_pkey',
      'corrections_reviewed_correction_id_fkey',
      'corrections_reviewer_confidence_check',
      'corrections_submission_id_fkey',
      'corrections_verdict_c3',
      'learners_auth_user_id_fkey',
      'learners_auth_user_id_key',
      'learners_pkey',
      'learners_student_code_key',
      'learning_events_event_type_c3',
      'learning_events_learner_id_fkey',
      'learning_events_learner_id_idempotency_key_key',
      'learning_events_pkey',
      'learning_events_task_type_c3',
      'skills_parent_id_fkey',
      'skills_pkey',
      'submissions_event_id_fkey',
      'submissions_pkey'
    ]) then
      lower_version := 'c3';
    elsif common_exact and actual_constraints = pg_temp.synk_sorted(array[
      'consents_learner_id_fkey',
      'consents_pkey',
      'corrections_pkey',
      'corrections_reviewed_correction_id_fkey',
      'corrections_reviewer_confidence_check',
      'corrections_submission_id_fkey',
      'corrections_verdict_c4',
      'learners_auth_user_id_fkey',
      'learners_auth_user_id_key',
      'learners_pkey',
      'learners_student_code_key',
      'learning_events_event_type_c4',
      'learning_events_learner_id_fkey',
      'learning_events_learner_id_idempotency_key_key',
      'learning_events_pkey',
      'learning_events_task_type_c4',
      'skills_parent_id_fkey',
      'skills_pkey',
      'submissions_event_id_fkey',
      'submissions_pkey'
    ]) then
      lower_version := 'c4';
    else
      if common_exact then
        mismatched := mismatched || '제약(c3·c4 목록 어느 쪽과도 다르다)';
      end if;
      raise exception
        'engine이 정확한 c3/c4가 아니다 — 어긋난 축: % · 실제 제약: %',
        array_to_string(mismatched, ', '),
        array_to_string(actual_constraints, ', ');
    end if;
  end if;

  if to_regtype('engine.actor_kind') is null then
    create type engine.actor_kind as enum ('learner', 'ai', 'teacher');
  end if;

  if to_regtype('engine.job_status') is null then
    create type engine.job_status as enum (
      'pending', 'processing', 'ai_processed', 'verified', 'discarded', 'revoked', 'failed'
    );
  end if;

  if lower_version = 'empty' then
    create table if not exists engine.learners (
      learner_id uuid primary key default gen_random_uuid(),
      auth_user_id uuid unique references auth.users(id),
      student_code text unique not null,
      display_name text,
      contact text,
      birth_year int,
      level_current text,
      home_aimag text,
      gender text,
      goal_track text,
      created_at timestamptz not null default now(),
      schema_ver text not null
    );

    create table if not exists engine.learning_events (
      event_id uuid primary key default gen_random_uuid(),
      learner_id uuid not null references engine.learners(learner_id) on delete restrict,
      event_type text not null,
      task_type text,
      actor_kind engine.actor_kind not null default 'learner',
      occurred_at timestamptz not null,
      ingested_at timestamptz not null default now(),
      correlation_id uuid,
      idempotency_key text not null,
      session_id uuid,
      content_id uuid,
      retry_of_event_id uuid,
      parent_event_id uuid,
      turn_no integer,
      skill_ids text[] not null default '{}',
      skill_taxonomy_ver text,
      level_snapshot text,
      goal_snapshot text,
      intervention_id uuid,
      model text,
      prompt_ver text,
      policy_ver text,
      consent_ver text not null,
      degraded boolean not null default false,
      payload jsonb not null default '{}',
      schema_ver text not null,
      unique (learner_id, idempotency_key)
    );

    create table if not exists engine.submissions (
      submission_id uuid primary key default gen_random_uuid(),
      event_id uuid not null references engine.learning_events(event_id) on delete restrict,
      task_type text not null,
      task_format text,
      task_ref text,
      task_snapshot jsonb,
      task_schema_ver text,
      body_original text,
      image_refs text[],
      audio_ref text,
      audio_duration_sec numeric(6,2),
      transcript text,
      transcript_verified text,
      transcript_state text,
      stt_segments jsonb,
      stt_confidence numeric(6,3),
      code_switch_spans jsonb,
      capture_meta jsonb,
      redaction_ver text,
      redaction_result jsonb,
      audio_deleted_at timestamptz,
      occurred_at timestamptz not null,
      schema_ver text not null
    );

    create table if not exists engine.corrections (
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
      l1_source_phrase text,
      rubric_scores jsonb,
      review_listened_ms integer,
      created_at timestamptz not null default now(),
      schema_ver text not null
    );

    create table if not exists engine.skills (
      skill_id text primary key,
      label_ko text not null,
      label_mn text,
      domain text not null,
      parent_id text references engine.skills(skill_id),
      superseded_by text references engine.skills(skill_id),
      error_tags text[] default '{}',
      schema_ver text not null
    );

    create table if not exists engine.consents (
      consent_id uuid primary key default gen_random_uuid(),
      learner_id uuid not null references engine.learners(learner_id) on delete restrict,
      consent_ver text not null,
      doc_hash text,
      agreed_at timestamptz not null,
      revoked_at timestamptz,
      schema_ver text not null
    );
  else
    alter table engine.learners
      add column if not exists home_aimag text,
      add column if not exists gender text,
      add column if not exists goal_track text;

    alter table engine.learning_events
      add column if not exists retry_of_event_id uuid,
      add column if not exists parent_event_id uuid,
      add column if not exists turn_no integer,
      add column if not exists skill_taxonomy_ver text,
      add column if not exists goal_snapshot text;

    alter table engine.submissions
      add column if not exists task_format text,
      add column if not exists image_refs text[],
      add column if not exists audio_duration_sec numeric(6,2),
      add column if not exists transcript_verified text,
      add column if not exists stt_segments jsonb,
      add column if not exists stt_confidence numeric(6,3),
      add column if not exists code_switch_spans jsonb,
      add column if not exists capture_meta jsonb,
      add column if not exists audio_deleted_at timestamptz;

    alter table engine.corrections
      add column if not exists l1_source_phrase text,
      add column if not exists rubric_scores jsonb,
      add column if not exists review_listened_ms integer;

    alter table engine.skills
      add column if not exists superseded_by text references engine.skills(skill_id);

    execute format(
      'alter table engine.learning_events drop constraint %I',
      'learning_events_event_type_' || lower_version
    );
    execute format(
      'alter table engine.learning_events drop constraint %I',
      'learning_events_task_type_' || lower_version
    );
    execute format(
      'alter table engine.corrections drop constraint %I',
      'corrections_verdict_' || lower_version
    );

    alter table engine.learning_events
      drop constraint learning_events_learner_id_fkey,
      add constraint learning_events_learner_id_fkey
        foreign key (learner_id) references engine.learners(learner_id) on delete restrict;

    alter table engine.consents
      drop constraint consents_learner_id_fkey,
      add constraint consents_learner_id_fkey
        foreign key (learner_id) references engine.learners(learner_id) on delete restrict;
  end if;

  create table if not exists engine.pipeline_jobs (
    job_id uuid primary key default gen_random_uuid(),
    submission_id uuid not null unique references engine.submissions(submission_id) on delete restrict,
    status engine.job_status not null default 'pending',
    attempt_count integer not null default 0,
    attempt_id uuid,
    lease_until timestamptz,
    is_audit_sample boolean not null default (random() < 0.05),
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table if not exists engine.daily_activity (
    learner_id uuid not null references engine.learners(learner_id) on delete restrict,
    activity_date date not null,
    session_count integer not null default 0,
    expected boolean,
    primary key (learner_id, activity_date)
  );

  alter table engine.learning_events
    add constraint learning_events_learner_id_event_id_key unique (learner_id, event_id),
    add constraint learning_events_retry_same_learner
      foreign key (learner_id, retry_of_event_id)
      references engine.learning_events (learner_id, event_id),
    add constraint learning_events_parent_same_learner
      foreign key (learner_id, parent_event_id)
      references engine.learning_events (learner_id, event_id),
    add constraint learning_events_event_type_c6 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result'
    )),
    add constraint learning_events_task_type_c6 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    ));

  alter table engine.submissions
    add constraint submissions_task_format_c6 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭'
    ));

  alter table engine.corrections
    add constraint corrections_submission_id_correction_id_key unique (submission_id, correction_id),
    add constraint corrections_reviewed_same_submission
      foreign key (submission_id, reviewed_correction_id)
      references engine.corrections (submission_id, correction_id),
    add constraint corrections_verdict_c6 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  create index if not exists learning_events_learner_time_idx
    on engine.learning_events (learner_id, occurred_at desc);
  create index if not exists learning_events_type_time_idx
    on engine.learning_events (event_type, occurred_at desc);
  create index if not exists learning_events_intervention_idx
    on engine.learning_events (intervention_id) where intervention_id is not null;
  create index if not exists learning_events_skills_idx
    on engine.learning_events using gin (skill_ids);
  create index if not exists submissions_event_idx on engine.submissions (event_id);
  create index if not exists corrections_submission_idx on engine.corrections (submission_id);
  create index if not exists consents_learner_idx on engine.consents (learner_id);
  create index if not exists pipeline_jobs_queue_idx
    on engine.pipeline_jobs (status, created_at) where status = 'pending';

  create or replace function engine.reject_mutation() returns trigger
    language plpgsql as $function$
  begin
    raise exception '%: append-only 테이블이다 — 갱신·삭제하지 않는다. 잘못된 사건은 정정 이벤트를 새로 쌓는다 (L0 §2)', TG_TABLE_NAME;
  end
  $function$;

  drop trigger if exists learning_events_immutable on engine.learning_events;
  create trigger learning_events_immutable before update or delete on engine.learning_events
    for each row execute function engine.reject_mutation();

  drop trigger if exists corrections_immutable on engine.corrections;
  create trigger corrections_immutable before update or delete on engine.corrections
    for each row execute function engine.reject_mutation();

  create or replace function engine.reject_original_overwrite() returns trigger
    language plpgsql as $function$
  begin
    if OLD.body_original is not null and NEW.body_original is distinct from OLD.body_original then
      raise exception '학생 원문은 고치지 않는다 — 오류가 곧 데이터다 (L0 §2 원문 불변)';
    end if;
    if OLD.transcript is not null and NEW.transcript is distinct from OLD.transcript then
      raise exception '기계 전사는 덮지 않는다 — 사람이 고친 값은 transcript_verified로 간다 (L0 §9-2)';
    end if;
    return NEW;
  end
  $function$;

  drop trigger if exists submissions_original_immutable on engine.submissions;
  create trigger submissions_original_immutable before update on engine.submissions
    for each row execute function engine.reject_original_overwrite();

  alter table engine.learners enable row level security;
  alter table engine.learning_events enable row level security;
  alter table engine.submissions enable row level security;
  alter table engine.corrections enable row level security;
  alter table engine.consents enable row level security;
  alter table engine.skills enable row level security;
  alter table engine.pipeline_jobs enable row level security;
  alter table engine.daily_activity enable row level security;
  alter table engine.schema_migrations enable row level security;

  create or replace function engine.current_learner_id() returns uuid
    language sql stable security invoker set search_path = engine, public as
  $function$
    select learner_id from engine.learners where auth_user_id = auth.uid()
  $function$;

  drop policy if exists learner_self on engine.learners;
  create policy learner_self on engine.learners for select to authenticated
    using (auth_user_id = auth.uid());

  drop policy if exists learner_self_events on engine.learning_events;
  create policy learner_self_events on engine.learning_events for select to authenticated
    using (learner_id = engine.current_learner_id());

  drop policy if exists learner_self_submissions on engine.submissions;
  create policy learner_self_submissions on engine.submissions for select to authenticated
    using (event_id in (
      select event_id from engine.learning_events
       where learner_id = engine.current_learner_id()
    ));

  drop policy if exists learner_self_corrections on engine.corrections;
  create policy learner_self_corrections on engine.corrections for select to authenticated
    using (submission_id in (
      select s.submission_id
        from engine.submissions s
        join engine.learning_events e on e.event_id = s.event_id
       where e.learner_id = engine.current_learner_id()
    ));

  drop policy if exists learner_self_consents on engine.consents;
  create policy learner_self_consents on engine.consents for select to authenticated
    using (learner_id = engine.current_learner_id());

  -- CI는 이 주석을 raise exception으로 바꿔 commit 전 실패를 주입한다.
  -- SYNK_MIGRATION_FAILURE_INJECTION_POINT
  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

-- ============================================================================
-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at')
), 기대제약(n) as (values
  ('learning_events_event_type_c6'), ('learning_events_task_type_c6'),
  ('submissions_task_format_c6'), ('corrections_verdict_c6'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable')
), 대상역할(r) as (values ('anon'), ('authenticated'))
, 대상권한(p) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
, 대상테이블(t) as (
  select tablename from pg_tables where schemaname='engine'
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
), 빠진트리거 as (
  select string_agg(n, ', ' order by n) v from 기대트리거 e
   where not exists (
     select 1 from pg_trigger g
     join pg_class r on r.oid=g.tgrelid
      where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n
   )
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
    where schemaname='engine' and tablename='schema_migrations') as 이력정책
)
select case when 테이블수=9 and RLS켜짐=9 and 정책수=5
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260806150000'
              and (select checksum from 현재이력)='551d9a9e8d4327ff4d0731794c6a19eef90177038ff129dd53be3ec96ba442e3' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 9·9·5·0·0·3·1·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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

-- 확인 (갈래별)
-- ① 테이블과 RLS: schema_migrations를 포함한 전부가 true여야 한다.
-- ② 정책: 기존 읽기 정책만 있고 schema_migrations 정책은 0이어야 한다.
-- ③ anon·authenticated의 engine 스키마·테이블 권한은 0이어야 한다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다.
--    기대: corrections_verdict_c6 · learning_events_event_type_c6
--         · learning_events_task_type_c6 · submissions_task_format_c6
-- ⑤ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.

commit;
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c7)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- c6 → c7 델타 — 병렬 코퍼스(몽골어↔한국어)의 축을 낸다.
--   `task_format` +1 `번역`. 새 테이블은 만들지 않는다(F124): `task_snapshot`(그날 학생이 본
--   몽골어 제시문) · `body_original`(학생의 한국어 답) · `corrected_text`(검수 확정 한국어)가
--   이미 정렬 3원쌍이고, 이 값은 **그 세 칸을 병렬 쌍으로 읽어도 되는지 가르는 유일한 축**이다.
--   축이 없으면 자유발화 답안과 번역 답안이 한 칸에 섞이고, 섞이면 「몽골어 원문이 있는 답」과
--   「없는 답」을 나중에 못 가른다 — c5가 낭독/자유발화를 가른 것과 같은 계열의 사고다.
--
-- 값이 바뀐 것은 task_format 하나지만 CHECK 접미는 판 전체를 c7로 통일한다 —
--   같은 이름이 두 값목록을 가리키면 DB 확인 ④가 어느 판인지 못 가른다.
--
-- 이 조각은 **c6 기준선이 선 DB 위에서만** 돈다. 빈 DB에는 합본(c6 조각 → 이 조각) 순으로 붓는다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260806210000';
  migration_name constant text := '20260806210000_engine_c7.sql';
  expected_checksum constant text := 'f7c53ce43e94220ca07e1156875825913923fe55a119cf16cd83f9ddce84eb56'; -- migration-checksum
  base_version constant text := '20260806150000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      'c7은 c6 기준선 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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
      'c7은 기준선 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;

  -- CHECK 이름째 교체. `if exists`를 붙이는 이유는 재실행 관용이 아니라,
  -- 위 이력 판정이 이미 「c6이 섰고 c7은 아직」을 못박았기 때문이다 — 여기서 이름이 없으면
  -- 그건 이력과 실물이 어긋난 상태이고, 그 판정은 아래 확인 쿼리의 「빠진제약」이 낸다.
  alter table engine.learning_events
    drop constraint if exists learning_events_event_type_c6,
    drop constraint if exists learning_events_task_type_c6,
    add constraint learning_events_event_type_c7 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result'
    )),
    add constraint learning_events_task_type_c7 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    ));

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c6,
    add constraint submissions_task_format_c7 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    -- 병렬 쌍의 왼쪽이 실제로 저장되게 만든다. 값만 늘리면 「번역인데 몽골어 원문이 없는 행」이
    -- 통과하고, 그건 코퍼스가 아니라 그냥 한국어 문장이다 — 그리고 제시문은 **그때만** 남길 수 있다
    -- (문항이 수정되면 학생이 무엇을 보고 답했는지 사라진다 = c4가 task_ref/task_snapshot 을 가른 이유).
    add constraint submissions_translation_source_c7 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c6,
    add constraint corrections_verdict_c7 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

-- ============================================================================
-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at')
), 기대제약(n) as (values
  ('learning_events_event_type_c7'), ('learning_events_task_type_c7'),
  ('submissions_task_format_c7'), ('submissions_translation_source_c7'), ('corrections_verdict_c7'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable')
), 대상역할(r) as (values ('anon'), ('authenticated'))
, 대상권한(p) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
, 대상테이블(t) as (
  select tablename from pg_tables where schemaname='engine'
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
), 빠진트리거 as (
  select string_agg(n, ', ' order by n) v from 기대트리거 e
   where not exists (
     select 1 from pg_trigger g
     join pg_class r on r.oid=g.tgrelid
      where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n
   )
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
    where schemaname='engine' and tablename='schema_migrations') as 이력정책
)
select case when 테이블수=9 and RLS켜짐=9 and 정책수=5
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260806210000'
              and (select checksum from 현재이력)='f7c53ce43e94220ca07e1156875825913923fe55a119cf16cd83f9ddce84eb56' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 9·9·5·0·0·3·1·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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

-- 확인 (갈래별)
-- ① 테이블과 RLS: schema_migrations를 포함한 전부가 true여야 한다.
-- ② 정책: 기존 읽기 정책만 있고 schema_migrations 정책은 0이어야 한다.
-- ③ anon·authenticated의 engine 스키마·테이블 권한은 0이어야 한다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다. c6 이름이 하나라도 보이면 이 조각이 안 돈 것이다.
--    기대: corrections_verdict_c7 · learning_events_event_type_c7
--         · learning_events_task_type_c7 · submissions_task_format_c7
--         · submissions_translation_source_c7
-- ⑤ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.

commit;
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md §4-1·§4-2
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- 학생 로그인 = 「학생번호 + 학생이 정한 비밀번호」 (유호님 확정 2026-08-06).
--   앞 판(학원 발급 코드)을 대체한다. 목표는 **전달물 0** — 카드·QR·문자·메일을 만들지 않고,
--   학생이 이미 아는 것(자기 학생번호·자기 전화번호)만으로 첫 로그인이 선다.
--
-- 🔑 **이 조각은 계약(학습 데이터)을 바꾸지 않는다.** 그래서 CHECK 값목록도 그 접미(c7)도
--   건드리지 않는다 — 늘어나는 것은 인증 인프라 4칸뿐이고, 계약 파일은 c7 그대로다.
--   (값목록을 안 바꾸면서 접미만 올리면 「어느 판인지」가 계약과 어긋난다.)
--
-- 왜 열이 4개인가 — 각각이 없으면 무엇이 무너지는지:
--   recovery_email·recovery_phone : 비밀번호를 잊었을 때 **본인 확인 대조용**(L0 §4-2-1).
--     🔴 여기로 발송하지 않는다(합성 주소는 배달 불가고 SMTP·SMS 공급자를 안 들이는 것이 전제).
--     지금 안 받으면 **소급이 안 된다** — 나중에 발송을 붙이는 날 값은 이미 쌓여 있어야 한다.
--   temp_password_expires_at : 원장 「비밀번호 초기화」가 낸 임시번호의 만료(30분 · §4-2-2).
--     이 칸이 없으면 임시번호가 영원히 살아 있고, 그건 그 학생 계정의 두 번째 비밀번호가 된다.
--   signup_attempts : 첫 로그인 게이트의 시도 횟수(§4-1-1 ①). 🔴 **이 칸이 이 판의 급소다** —
--     게이트가 요구하는 전화 뒤 4자리는 **1만 가지뿐**이라, 제한이 없으면 대입으로 반드시 뚫린다.
--     5에 이르면 그 학생의 첫 등록 경로가 잠기고, 푸는 것은 원장의 초기화뿐이다.
--
-- 첫 등록 가능 여부는 새 칸을 만들지 않는다 — `auth_user_id is null` 이 곧 「아직 계정 없음」이고,
--   계정이 서는 순간 그 경로는 그 학생에게 영원히 닫힌다(§4-1-1 ②).
--
-- 이 조각은 **c7이 선 DB 위에서만** 돈다. 빈 DB에는 합본(c6 → c7 → 이 조각) 순으로 붓는다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260806233000';
  migration_name constant text := '20260806233000_auth_c7.sql';
  expected_checksum constant text := 'c5115077c33d8b0811848988c12acab86088ff83e5ca0a91e8c3ee0e64e3ffcf'; -- migration-checksum
  base_version constant text := '20260806210000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 기준선 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- `if not exists`를 쓰지 않는다: 위 이력 판정이 「c7이 섰고 이 판은 아직」을 이미 못박았으므로,
  -- 여기서 칸이 이미 있다면 그것은 이력과 실물이 어긋난 상태다 — 조용히 넘기지 말고 멈춘다.
  alter table engine.learners
    add column recovery_email text,
    add column recovery_phone text,
    add column temp_password_expires_at timestamptz,
    add column signup_attempts int not null default 0;

  -- 음수 시도 횟수는 상한 판정을 무력화한다(-5 에서 시작하면 10회를 시도할 수 있다).
  alter table engine.learners
    add constraint learners_signup_attempts_nonneg_c7 check (signup_attempts >= 0);

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

-- ============================================================================
-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at'),
  -- 학생 로그인(L0 §4-1·§4-2 · 20260806233000_auth_c7)
  ('learners','recovery_email'), ('learners','recovery_phone'),
  ('learners','temp_password_expires_at'), ('learners','signup_attempts')
), 기대제약(n) as (values
  ('learning_events_event_type_c7'), ('learning_events_task_type_c7'),
  ('submissions_task_format_c7'), ('submissions_translation_source_c7'), ('corrections_verdict_c7'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c7')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable')
), 대상역할(r) as (values ('anon'), ('authenticated'))
, 대상권한(p) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
, 대상테이블(t) as (
  select tablename from pg_tables where schemaname='engine'
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
), 빠진트리거 as (
  select string_agg(n, ', ' order by n) v from 기대트리거 e
   where not exists (
     select 1 from pg_trigger g
     join pg_class r on r.oid=g.tgrelid
      where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n
   )
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
    where schemaname='engine' and tablename='schema_migrations') as 이력정책
)
select case when 테이블수=9 and RLS켜짐=9 and 정책수=5
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260806233000'
              and (select checksum from 현재이력)='c5115077c33d8b0811848988c12acab86088ff83e5ca0a91e8c3ee0e64e3ffcf' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 9·9·5·0·0·3·1·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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

-- 확인 (갈래별)
-- ① 테이블과 RLS: schema_migrations를 포함한 전부가 true여야 한다.
-- ② 정책: 기존 읽기 정책만 있고 schema_migrations 정책은 0이어야 한다.
-- ③ anon·authenticated의 engine 스키마·테이블 권한은 0이어야 한다.
-- ④ 학생 로그인 4칸(learners.recovery_email·recovery_phone
--    ·temp_password_expires_at·signup_attempts)이 「빠진열」에 안 나와야 한다.
-- ⑤ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.
-- ⑥ CHECK 제약은 현행 접미사만 남아야 한다. 옛 이름이 하나라도 보이면 조각이 안 돈 것이다.
--    기대: corrections_verdict_c7 · learners_signup_attempts_nonneg_c7
--         · learning_events_event_type_c7 · learning_events_task_type_c7
--         · submissions_task_format_c7 · submissions_translation_source_c7

commit;
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md §4-5 (직원 인증) · §4-2 ③ (전 세션 폐기)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- 직원(강사·검수자·원장) 인증의 **물리**다. 설계는 §4-5에서 확정됐고 여기가 그 실물이며,
--   발주서 §3(검수 대시보드)이 이것 때문에 착수 차단돼 있었다.
--
-- 🔑 **역할은 토큰이 아니라 표에 산다**(§4-5 ②). JWT(`app_metadata`)에 넣으면 토큰이 발급
--   시점에 굳어 **해임·강등이 만료까지 반영되지 않는다.** 표에 두면 매 요청 살아 있는 값을 읽는다.
--
-- 🔑 **`engine.session_alive()` 하나가 학생·직원 두 축을 함께 닫는다**(§4-2 ③ · §4-5 ③).
--   §4-2 🔴가 남긴 완료조건은 「재발급 뒤 **만료 전 옛 access token**도 보호 데이터에 못 닿는다」다.
--   비밀번호 교체만으로는 이미 발급된 토큰이 죽지 않으므로 표식(`revoked_before`)을 두고
--   **매 요청 토큰의 발급시각(`iat`)과 비교**한다 — 창이 0이다(ⓐ 짧은 TTL은 창이 남아 기각).
--   같은 규칙을 두 곳에 적으면 갈라지므로 **판정 함수는 하나**고 두 축이 그것을 부른다.
--
-- 왜 표가 둘인가 — 각각이 없으면 무엇이 무너지는지:
--   staff            : 역할·`active`·`revoked_before`가 사는 곳. 없으면 「이 토큰이 검수자인가」를
--                      물을 데가 없어 서버가 **클라이언트의 주장을 믿게 된다**(service_role은 RLS를
--                      우회하므로 그 순간 방어선이 0이다 · §4-5 ② 🔴).
--   staff_access_log : **열어보고 손대지 않은 제출물은 `corrections`에 흔적이 0**이다(§4-5 ④ 🔴).
--                      P0 §7-1 유호님 확정(「누가 어느 학생 행을 열었나」)이 요구하는 자리가 정확히
--                      그것이고, Postgres에는 select 감사 훅이 없다. `engine`이 API에 노출돼 있지
--                      않아 모든 조회가 Edge Function을 지나므로 **기록 지점이 하나뿐**이다.
--
-- ⚠ **`role` 값목록의 정본은 이 조각의 CHECK(`staff_role_c7`)다 — 계약 파일이 아니다.**
--   §4-5 ②의 초안은 「계약 파일에 c7로 등재」라 적었으나, `계약/수집_교정_계약.json`은 스스로를
--   「수집층(Apps Script) ↔ 교정 엔진 ↔ L0」가 **공유하는 학습 데이터 어휘**로 정의하고 두 저장소에
--   같은 바이트로 들어간다. 직원 역할은 학습 데이터가 아니고 Apps Script는 읽지 않는다 —
--   넣으면 저 저장소가 **자기가 안 쓰는 값목록 때문에 CI를 지게 된다.** 정본은 여기 한 곳이다.
--
-- ⛔ **`corrections.reviewer`에는 `staff_id`를 적는다**(§4-5 ④ 🔴 · 이름 문자열이 들어가면
--   동명이인·개명에 계보가 끊긴다). 그건 쓰기 규약이라 **Edge Function 몫**이고 여기 DDL은 아니다 —
--   `corrections`는 append-only라 열 타입을 바꾸는 것이 소급 불가이기도 하다.
--
-- 이 조각은 **20260806233000(학생 로그인) 위에서만** 돈다. 빈 DB에는 합본을 처음부터 붓는다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260806234000';
  migration_name constant text := '20260806234000_staff_c7.sql';
  expected_checksum constant text := 'f3099646ca81e6636bd574de18092a90e9ced8046b3c45ba44b71a07a5376d1c'; -- migration-checksum
  base_version constant text := '20260806233000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 기준선 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- ── 학생 축에도 같은 두 칸 (§4-2 ③ · §4-5 ③ 🔑) ──────────────────────────
  -- `if not exists`를 쓰지 않는다: 위 이력 판정이 「이 판은 아직」을 이미 못박았으므로,
  -- 칸이 이미 있다면 그것은 이력과 실물이 어긋난 상태다 — 조용히 넘기지 않는다.
  alter table engine.learners
    add column active boolean not null default true,
    add column revoked_before timestamptz;

  -- ── 직원 표 (§4-5 ②) ─────────────────────────────────────────────────────
  -- pk가 `auth_user_id`인 것은 `learners`와 같은 모양이다 — 한 사람이 한 계정이고,
  -- `staff_id`는 감사가 사람을 가리키는 **안정 키**라 따로 둔다(계정이 다시 서도 계보가 잇는다).
  create table if not exists engine.staff (
    auth_user_id uuid primary key references auth.users(id),
    staff_id uuid not null unique default gen_random_uuid(),
    role text not null constraint staff_role_c7
      check (role in ('teacher', 'inspector', 'director')),
    display_name text,
    active boolean not null default true,
    revoked_before timestamptz,
    created_at timestamptz not null default now()
  );

  -- ── 조회 감사 (§4-5 ④) ───────────────────────────────────────────────────
  -- 🔴 **행 단위가 아니라 「큐 응답 1회 = 1행」**이다. 모든 조회가 Edge Function 하나를 지나므로
  --   기록 지점이 하나뿐이고, 행마다 적으면 감사표가 검수 데이터보다 빨리 커진다.
  -- ⚠ `action`에 CHECK를 두지 않는다 — 감사 행위는 화면이 늘 때마다 늘어난다. 값목록을 박으면
  --   **새 화면마다 마이그레이션이 필요해지고**, 그 마찰은 「감사를 안 남기는」 쪽으로 샌다.
  create table if not exists engine.staff_access_log (
    log_id uuid primary key default gen_random_uuid(),
    staff_id uuid not null references engine.staff(staff_id) on delete restrict,
    at timestamptz not null default now(),
    action text not null,
    target_ids uuid[] not null default '{}'
  );

  create index if not exists staff_access_log_staff_idx
    on engine.staff_access_log (staff_id, at desc);

  -- 감사 기록이 고쳐지면 감사가 아니다. 기존 append-only 트리거 함수를 그대로 쓴다.
  drop trigger if exists staff_access_log_immutable on engine.staff_access_log;
  create trigger staff_access_log_immutable before update or delete on engine.staff_access_log
    for each row execute function engine.reject_mutation();

  alter table engine.staff enable row level security;
  alter table engine.staff_access_log enable row level security;

  -- ── 세션 유효 판정 — 두 축이 함께 부르는 한 곳 (§4-2 ③ · §4-5 ③) ──────────
  -- 🔴 **`iat`는 폐기된 계정에서만 본다.** 초판은 `coalesce(revoked_before,'-infinity')`로
  --   **언제나** `iat`와 비교했다 — 그러면 토큰에 `iat`가 없거나 안 읽히는 순간 결과가 null이라
  --   **폐기된 적 없는 전원이 함께 잠긴다.** 막으려던 것(폐기 1명)보다 사고가 크고 더 잦다
  --   (2026-08-06 CI 실측: `iat` 없는 주장으로 학생이 자기 행을 0행 봤다).
  --   `revoked_before`가 null이면 폐기된 적이 없으니 **비교할 것 자체가 없다.**
  -- 🔴 그래도 **폐기된 계정에서는 그대로 fail-closed다** — 값이 있는데 `iat`를 못 읽으면
  --   null이라 거부된다. 모르는 토큰이 통과하는 쪽으로는 기울지 않는다.
  -- ⚠ 이것은 RLS의 방어선이다. **`service_role`은 RLS를 우회하므로** Edge Function은
  --   같은 판정을 자기 손으로 한 번 더 해야 한다(§4-3 ⚠).
  create or replace function engine.session_alive(active boolean, revoked_before timestamptz)
    returns boolean language sql stable security invoker set search_path = engine, public as
  $function$
    select active and (
      revoked_before is null
      or to_timestamp((auth.jwt()->>'iat')::bigint) >= revoked_before
    )
  $function$;

  -- 학생 축: `current_learner_id()`는 **RLS를 지나** learners를 읽으므로(security invoker),
  -- 이 정책 한 줄이 학생 쪽 다섯 정책 전부에 그대로 걸린다 — 폐기가 한 곳에서 산다.
  -- 🔴 여기서 `current_learner_id()`를 부르면 정책이 자기를 다시 불러 **무한 재귀**가 된다.
  drop policy if exists learner_self on engine.learners;
  create policy learner_self on engine.learners for select to authenticated
    using (auth_user_id = auth.uid() and engine.session_alive(active, revoked_before));

  create or replace function engine.current_staff() returns engine.staff
    language sql stable security invoker set search_path = engine, public as
  $function$
    select s.* from engine.staff s
     where s.auth_user_id = auth.uid()
       and engine.session_alive(s.active, s.revoked_before)
  $function$;

  -- 자기 행 읽기. 여기에 폐기 판정을 걸지 않는 이유 — 위 함수가 이 정책을 지나 staff를 읽으므로
  -- 걸면 재귀가 되고, 게다가 **자기 계정 상태(내가 해임됐나)는 보호 데이터가 아니다.**
  -- 보호 데이터로 가는 문은 전부 `current_staff()`고 그쪽이 폐기를 본다.
  drop policy if exists staff_self on engine.staff;
  create policy staff_self on engine.staff for select to authenticated
    using (auth_user_id = auth.uid());

  -- ── 검수 큐 (§4-5 ②) ─────────────────────────────────────────────────────
  -- 🔴 **학생 신원은 열지 않는다** — `learners`에는 검수자 정책이 없다. 검수 화면은
  --   `student_code`도 아닌 **제출물 ID**로 돈다(§4-5 ② 표).
  -- ⚠ 두 정책은 permissive라 학생 정책과 **OR**로 합쳐진다 — 학생은 자기 것, 검수자는 큐를 본다.
  drop policy if exists inspector_queue_corrections on engine.corrections;
  create policy inspector_queue_corrections on engine.corrections for select to authenticated
    using (actor_kind = 'ai' and (engine.current_staff()).role = 'inspector');

  -- 🔴 **정책이 서로를 읽으면 재귀한다** (2026-08-06 리허설 실측: `42P17 infinite recursion`).
  --   「큐에 든 제출물」을 정책 안에서 `select ... from engine.corrections` 로 물으면
  --   그 읽기에 corrections 의 정책이 걸리고, 그중 `learner_self_corrections` 가 다시
  --   submissions 를 읽어 **이 정책으로 돌아온다.** 존재 검사 하나를 `security definer` 로
  --   빼서 고리를 끊는다 — 이 함수가 흘리는 것은 「그 제출물에 AI 교정이 있나」 뿐이고,
  --   그건 submission_id 를 이미 아는 쪽에게만 답한다.
  create or replace function engine.in_review_queue(sid uuid) returns boolean
    language sql stable security definer set search_path = engine, public as
  $function$
    select exists (
      select 1 from engine.corrections
       where submission_id = sid and actor_kind = 'ai'
    )
  $function$;

  drop policy if exists inspector_queue_submissions on engine.submissions;
  create policy inspector_queue_submissions on engine.submissions for select to authenticated
    using ((engine.current_staff()).role = 'inspector'
           and engine.in_review_queue(submission_id));

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

-- ============================================================================
-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at'),
  -- 학생 로그인(L0 §4-1·§4-2 · 20260806233000_auth_c7)
  ('learners','recovery_email'), ('learners','recovery_phone'),
  ('learners','temp_password_expires_at'), ('learners','signup_attempts'),
  -- 직원 인증·세션 폐기(L0 §4-5·§4-2 ③ · 20260806234000_staff_c7)
  ('learners','active'), ('learners','revoked_before'),
  ('staff','role'), ('staff','staff_id'), ('staff','active'), ('staff','revoked_before'),
  ('staff_access_log','action'), ('staff_access_log','target_ids')
), 기대제약(n) as (values
  ('learning_events_event_type_c7'), ('learning_events_task_type_c7'),
  ('submissions_task_format_c7'), ('submissions_translation_source_c7'), ('corrections_verdict_c7'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c7'), ('staff_role_c7')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable')
), 대상역할(r) as (values ('anon'), ('authenticated'))
, 대상권한(p) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
, 대상테이블(t) as (
  select tablename from pg_tables where schemaname='engine'
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
), 빠진트리거 as (
  select string_agg(n, ', ' order by n) v from 기대트리거 e
   where not exists (
     select 1 from pg_trigger g
     join pg_class r on r.oid=g.tgrelid
      where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n
   )
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
    where schemaname='engine' and tablename='schema_migrations') as 이력정책
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=8
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260806234000'
              and (select checksum from 현재이력)='f3099646ca81e6636bd574de18092a90e9ced8046b3c45ba44b71a07a5376d1c' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·8·0·0·3·1·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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

-- 확인 (갈래별)
-- ① 테이블과 RLS: staff·staff_access_log를 포함한 11개 전부가 true여야 한다.
-- ② 정책: 학생 5 + staff_self 1 + 검수 큐 2 = 8. schema_migrations 정책은 여전히 0이다.
--    ⚠ staff_access_log에는 정책이 없다 — 감사표는 아무 토큰에게도 열지 않는다(원장 화면도
--      Edge Function을 지난다). 「기본은 아무도 못 본다」가 그대로 남는 자리다.
-- ③ anon·authenticated의 engine 스키마·테이블 권한은 0이어야 한다(새 표 2개 포함).
-- ④ 학생 폐기 2칸(learners.active·revoked_before)과 직원 표 2개가 「빠진열」에 안 나와야 한다.
-- ⑤ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.
-- ⑥ CHECK 제약은 현행 접미사만 남아야 한다. 옛 이름이 하나라도 보이면 조각이 안 돈 것이다.
--    기대: corrections_verdict_c7 · learners_signup_attempts_nonneg_c7
--         · learning_events_event_type_c7 · learning_events_task_type_c7
--         · staff_role_c7 · submissions_task_format_c7 · submissions_translation_source_c7

commit;
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md §4-2-2 (원장 「비밀번호 초기화」)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- 🔴 **왜 칸이 하나 더 필요한가 — 「30분 만료」가 장식이었다.**
--   §4-2-2는 임시번호가 **30분 뒤 만료**된다고 못박았는데, 임시번호를 그냥 GoTrue 비밀번호로
--   넣으면 **만료라는 개념 자체가 없다.** 30분이 지나도 그 번호는 영원히 유효하고,
--   `temp_password_expires_at`은 아무도 보지 않는 **장식**이 된다. 그건 「두 번째 비밀번호를
--   영구히 발급한 것」이고, 학원에서 가장 현실적인 사고(학생이 그 값을 알고 친구 계정에
--   들어가는 것)를 정확히 열어 준다.
--
--   유호님 확정 2026-08-07: **해시로 들고 있는 방식.** 임시번호는 GoTrue에 넣지 않는다 —
--   우리가 **해시 + 만료로** 들고 있다가, 학생이 그 번호로 `/auth/temp-login`을 부르면
--   그때 검증하고 **그 자리에서 학생이 정한 새 비밀번호**를 GoTrue에 넣는다.
--   그래야 만료가 **참**이 된다(우리 코드가 반드시 지나가므로 시각을 볼 수 있다).
--   유호님 화면 흐름(버튼 → 6자리 → 말로 전달)은 **한 글자도 안 바뀐다.**
--
-- 🔑 **평문은 어디에도 저장하지 않는다.** 원장 화면이 1회 보여주고 끝이고, 감사표
--   (`staff_access_log`)에도 **번호는 안 적는다** — 적으면 그 표 하나가 다수 계정이 된다.
--
-- 🔑 **시도 횟수는 새 칸을 만들지 않는다.** `signup_attempts`를 그대로 쓴다 — 둘 다
--   「이 학생 계정을 여는 시도」이고 잠금을 푸는 것도 **같은 원장 버튼 하나**다.
--   초기화가 그 값을 0으로 풀므로, 학생은 초기화 뒤 임시번호를 5번까지 틀릴 수 있다.
--   (6자리는 100만 가지지만 30분·5회가 지키는 것이지 자릿수가 지키는 게 아니다.)
--
-- 해시는 `extensions.crypt` + `gen_salt('bf')`(pgcrypto · 이미 설치돼 있다 — 실측).
--   대조도 DB 안에서 한다(`hash = crypt(입력, hash)`) — **해시가 DB 밖으로 나가지 않는다.**
--
-- 이 조각은 **20260806234000 위에서만** 돈다. 빈 DB에는 합본을 처음부터 붓는다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807024500';
  migration_name constant text := '20260807024500_temp_code_c7.sql';
  expected_checksum constant text := 'a267639129d28b77a8c3e7d360727ae8ba1a9c4ccfc217626bf847feca592cf5'; -- migration-checksum
  base_version constant text := '20260806234000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 기준선 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- 해시 원시함수가 없으면 여기서 멈춘다 — 없는 채로 칸만 만들면 초기화가 **런타임에** 죽고,
  -- 그때는 원장이 학생 앞에서 버튼을 누르는 순간이다.
  if to_regprocedure('extensions.gen_salt(text)') is null then
    raise exception 'pgcrypto(extensions.gen_salt)가 없다 — 임시번호를 해시로 들 수 없다';
  end if;

  alter table engine.learners
    add column temp_password_hash text;

  -- 🔴 **해시만 있고 만료가 없으면 그것이 곧 「영구 두 번째 비밀번호」**다 —
  --   이 판이 없애려던 바로 그 상태라, 문서가 아니라 DB가 막는다.
  alter table engine.learners
    add constraint learners_temp_password_paired_c7
      check (temp_password_hash is null or temp_password_expires_at is not null);

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

-- ============================================================================
-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at'),
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
  ('learning_events_event_type_c7'), ('learning_events_task_type_c7'),
  ('submissions_task_format_c7'), ('submissions_translation_source_c7'), ('corrections_verdict_c7'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c7'), ('staff_role_c7'),
  ('learners_temp_password_paired_c7')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable')
), 대상역할(r) as (values ('anon'), ('authenticated'))
, 대상권한(p) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
, 대상테이블(t) as (
  select tablename from pg_tables where schemaname='engine'
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
), 빠진트리거 as (
  select string_agg(n, ', ' order by n) v from 기대트리거 e
   where not exists (
     select 1 from pg_trigger g
     join pg_class r on r.oid=g.tgrelid
      where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n
   )
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
    where schemaname='engine' and tablename='schema_migrations') as 이력정책
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=8
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807024500'
              and (select checksum from 현재이력)='a267639129d28b77a8c3e7d360727ae8ba1a9c4ccfc217626bf847feca592cf5' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·8·0·0·3·1·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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

-- 확인 (갈래별)
-- ① 테이블과 RLS: 11개 전부 true. 이 조각은 표를 늘리지 않는다(칸 1 + CHECK 1뿐).
-- ② 정책: 8 그대로. 임시번호는 토큰이 아니라 Edge Function 이 다루므로 정책이 늘지 않는다.
-- ③ anon·authenticated 의 engine 권한은 0이어야 한다.
-- ④ `learners.temp_password_hash` 가 「빠진열」에 안 나와야 한다.
-- ⑤ 현재버전과 checksum 은 engine.schema_migrations 의 최신 행에서 읽는다.
-- ⑥ CHECK 제약은 현행 접미사만 남아야 한다. 옛 이름이 하나라도 보이면 조각이 안 돈 것이다.
--    기대: corrections_verdict_c7 · learners_signup_attempts_nonneg_c7
--         · learners_temp_password_paired_c7 · learning_events_event_type_c7
--         · learning_events_task_type_c7 · staff_role_c7
--         · submissions_task_format_c7 · submissions_translation_source_c7

commit;
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- c7 → c8 델타 — 교정을 가리킬 이름을 낸다 (P0 §10-A-11 · S1 착수 차단자).
--   `correction.viewed`·`correction.responded`가 **어느 교정**에 대한 것인지 지목할 필드가
--   없었다. `retry_of_event_id`는 사건→사건(재제출) 고리라 그 자리를 대신하지 못한다.
--   그래서 검증기(lib/이벤트검증.js)가 `correction.viewed: []`로 **비워 둔 채** 서 있었다 —
--   없는 이름을 필수로 걸면 앱은 못 보내는데 검증은 전건 거부하기 때문이다(A-11 원문).
--   S1-8(교정 열람·응답)은 「학습이 일어났다」의 유일한 직접 신호인데, 어느 교정을 봤는지
--   모르면 그 신호가 학생 단위 집계로만 남고 교정 단위 판정이 영영 불가능하다.
--
-- 🔴 새 테이블 0(F124) · **새 정본 0**.
--   「이 교정은 누구 것인가」의 답은 이미 DB 안에 하나 있다 — RLS 정책
--   `learner_self_corrections`가 corrections→submissions→learning_events→learner_id로 걷는
--   그 사슬이다. 그래서 corrections·submissions에 learner_id를 복제하지 않는다. 복제하면
--   「누구 것인가」의 정본이 둘이 되고, 둘이 어긋나는 날 RLS와 FK가 서로 다른 답을 낸다 —
--   L0 §3-3이 `seen_at`·`responded_at`에서 이미 겪은 「정본이 두 군데」와 같은 사고다.
--
--   그래서 교차 학생 연결(c6 §788)은 복합 FK가 아니라 **같은 사슬을 걷는 트리거**로 막는다.
--   복합 FK로 하려면 `unique (learner_id, correction_id)`가 필요하고, 그 unique는 corrections에
--   learner_id를 심어야 성립한다 — 즉 복합 FK 경로는 복제를 **강제한다**. 트리거는 정본을
--   늘리지 않고 같은 불변식을 진다(c6이 reject_mutation·reject_original_overwrite로 이미
--   쓰는 도구다). ⚠트리거는 FK와 달리 `alter table ... disable trigger`로 꺼진다 —
--   그 대가를 알고 고른 것이고, 확인 블록의 기대트리거가 꺼짐·사라짐을 드러낸다.
--
-- 🔑 CHECK 접미는 **살아 있는 것 전부**를 c8로 통일한다 — 값목록이 안 바뀐 것도 포함해서.
--   초안은 반대로 갔다: 「c8은 어떤 값목록도 바꾸지 않으니 이름을 갈 이유가 없고, 갈면
--   `learners`·`staff`의 c7 제약(인증 트랙이 운영에 올린 것)까지 건드리게 된다」. 그럴듯했지만
--   틀렸고, `tests/L0스키마.test.js`의 「CHECK 제약 이름이 계약 버전을 달고 있다」가 그 자리에서
--   빨개졌다. 그 가드가 지키는 것은 값목록의 최신성이 아니라 **판이 조용히 미적용되는 것**이다 —
--   `create table if not exists`는 테이블이 있으면 문장을 통째로 건너뛰므로, 이름이 그대로면
--   「c8 계약 + c7 물리」가 초록으로 보인다. 판 이름은 접미 하나로 읽혀야 한다.
--   그래서 살아 있는 CHECK 8개를 전부 `_c7`→`_c8`로 갈고, 값 자체는 한 글자도 안 바꾼다.
--
-- ⚠ `correction_id`를 두 event_type에 **필수**로 거는 CHECK는 기존 행을 검사한다.
--   위반 행이 있으면 이 조각은 조용히 통과하지 않고 그 자리에서 실패한다 — 의도한 실패다
--   (2026-08-06 기준 운영 learning_events 0행이지만 「0행일 것이다」에 기대지 않는다).
--
-- 이 조각은 **c7이 선 DB 위에서만** 돈다. 빈 DB에는 합본(c6 → c7 → 이 조각) 순으로 붓는다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807040000';
  migration_name constant text := '20260807040000_engine_c8.sql';
  expected_checksum constant text := '158d55f17d54ab173721dc8945935eed93c6451c3a22a3b37059de171c42fdb6'; -- migration-checksum
  -- 체인은 **판 이름이 아니라 바로 앞 조각**에 건다. 초안은 20260806210000(engine_c7)을
  -- 걸었는데 그 뒤로 auth·staff·temp_code 세 조각이 더 붙어 있었다 — 그러면 c8이 그 셋을
  -- 건너뛴 DB 위에서도 선다(이 조각이 staff·learners 제약을 갈므로 그건 실패가 아니라 오염이다).
  base_version constant text := '20260807024500';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      'c8은 c7 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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
      'c8은 기준선 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;

  -- ① 이름 자체. corrections 를 직접 가리킨다 — 사슬을 payload jsonb 로 흉내내지 않는다
  --    (jsonb 키는 FK 를 못 걸어 c6 이 닫은 「가리키는 대상이 실재하는가」가 다시 열린다).
  alter table engine.learning_events
    add column if not exists correction_id uuid;

  alter table engine.learning_events
    add constraint learning_events_correction_id_fkey
      foreign key (correction_id)
      references engine.corrections (correction_id) on delete restrict;

  -- ② 자리를 비워 두지 않는다. 두 사건에는 반드시 있고, 나머지에는 반드시 없다 —
  --    「있어도 되고 없어도 되는」 칸이면 S1 은 여전히 교정 단위로 판정할 수 없고,
  --    엉뚱한 사건에 붙은 값은 나중에 집계에서 조용히 섞인다.
  alter table engine.learning_events
    add constraint learning_events_correction_target_c8 check (
      case when event_type in ('correction.viewed', 'correction.responded')
           then correction_id is not null
           else correction_id is null
      end
    );

  -- ③ 교차 학생 연결 금지. RLS 정책 learner_self_corrections 와 **같은 사슬**을 걷는다.
  --    service_role 은 RLS 를 우회하므로 정책이 이것을 막아주지 않는다 — 서버 코드 버그
  --    하나면 A 학생의 열람 사건이 B 학생의 교정을 가리킨다(c6 이 복합 FK 로 막은 그 형태).
  --    NEW.correction_id null 검사를 함수 안에도 둔다: when 절 없이 다시 등록되는 날
  --    `not exists`가 null 에 대해 참이 되어 **정상 사건을 전부 거부**한다.
  create or replace function engine.reject_cross_learner_correction() returns trigger
    language plpgsql security invoker set search_path = engine, public as $function$
  begin
    if NEW.correction_id is not null and not exists (
      select 1
        from engine.corrections c
        join engine.submissions s on s.submission_id = c.submission_id
        join engine.learning_events e on e.event_id = s.event_id
       where c.correction_id = NEW.correction_id
         and e.learner_id = NEW.learner_id
    ) then
      raise exception
        '다른 학생의 교정을 가리킬 수 없다 — correction_id=%는 learner_id=%의 제출물에 달린 교정이 아니다 (L0 §8 교차 학생 연결 금지)',
        NEW.correction_id, NEW.learner_id;
    end if;
    return NEW;
  end
  $function$;

  drop trigger if exists learning_events_correction_same_learner on engine.learning_events;
  create trigger learning_events_correction_same_learner
    before insert on engine.learning_events
    for each row when (NEW.correction_id is not null)
    execute function engine.reject_cross_learner_correction();

  -- ④ 사슬을 되짚는 조회(교정 1건에 달린 열람·응답)가 전건 훑기가 되지 않게.
  create index if not exists learning_events_correction_idx
    on engine.learning_events (correction_id) where correction_id is not null;

  -- ⑤ 판 접미 통일 — 값은 한 글자도 안 바꾸고 이름만 c7→c8. 위 머리말 🔑의 이유다.
  --    `if exists`는 재실행 관용이 아니다: 위 이력 판정이 「c7까지 섰고 c8은 아직」을 이미
  --    못박았으므로, 여기서 이름이 없다면 그건 이력과 실물이 어긋난 상태이고 그 판정은
  --    확인 블록의 「빠진제약」이 낸다.
  alter table engine.learning_events
    drop constraint if exists learning_events_event_type_c7,
    drop constraint if exists learning_events_task_type_c7,
    add constraint learning_events_event_type_c8 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result'
    )),
    add constraint learning_events_task_type_c8 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    ));

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c7,
    drop constraint if exists submissions_translation_source_c7,
    add constraint submissions_task_format_c8 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    add constraint submissions_translation_source_c8 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c7,
    add constraint corrections_verdict_c8 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c7,
    drop constraint if exists learners_temp_password_paired_c7,
    add constraint learners_signup_attempts_nonneg_c8 check (signup_attempts >= 0),
    add constraint learners_temp_password_paired_c8
      check (temp_password_hash is null or temp_password_expires_at is not null);

  alter table engine.staff
    drop constraint if exists staff_role_c7,
    add constraint staff_role_c8 check (role in ('teacher', 'inspector', 'director'));

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

-- ============================================================================
-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('learning_events','correction_id'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
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
  ('learning_events_event_type_c8'), ('learning_events_task_type_c8'),
  ('submissions_task_format_c8'), ('submissions_translation_source_c8'), ('corrections_verdict_c8'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c8'), ('staff_role_c8'),
  ('learners_temp_password_paired_c8'),
  ('learning_events_correction_target_c8'), ('learning_events_correction_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner')
), 대상역할(r) as (values ('anon'), ('authenticated'))
, 대상권한(p) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
, 대상테이블(t) as (
  select tablename from pg_tables where schemaname='engine'
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
), 빠진트리거 as (
  select string_agg(n, ', ' order by n) v from 기대트리거 e
   where not exists (
     select 1 from pg_trigger g
     join pg_class r on r.oid=g.tgrelid
      where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n
   )
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
    where schemaname='engine' and tablename='schema_migrations') as 이력정책
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=8
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807040000'
              and (select checksum from 현재이력)='158d55f17d54ab173721dc8945935eed93c6451c3a22a3b37059de171c42fdb6' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·8·0·0·3·1·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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

-- 확인 (갈래별)
-- ① 테이블과 RLS: 전부 true여야 한다(c8은 테이블을 늘리지 않는다 — 11 그대로).
-- ② 정책: c8은 정책을 늘리지 않는다 — 8 그대로. 「누구 것인가」는 기존 정책의 사슬을 쓴다.
-- ③ anon·authenticated의 engine 스키마·테이블 권한은 0이어야 한다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다. c7 이름이 하나라도 보이면 이 조각이 안 돈 것이다.
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
--    c8 고유분: learning_events_correction_id_fkey · 트리거 learning_events_correction_same_learner
--    그리고 learning_events.correction_id 열이 「빠진열」에 안 보여야 한다.
-- ⑤ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.

commit;
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8 — 이 조각은 계약을 안 바꾼다)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- 🔴 DDL 0 — 이 조각이 바꾸는 것은 **사후 확인 쿼리**뿐이다.
--
-- ■ 무엇이 새고 있었나 (2026-08-07 리허설 실측)
--   확인 블록의 `빠진트리거`는 pg_trigger에 **행이 있는가**만 물었다. 그런데 트리거를 끄면
--   (`alter table ... disable trigger`) 행은 그대로 남고 `tgenabled`만 'D'가 된다 —
--   즉 **꺼진 트리거는 존재 검사에 걸리지 않는다.** 리허설에서 c8 트리거를 실제로 끄고
--   `supabase/확인_적용후상태.sql`을 돌린 결과가 「✅ 전부 통과」였다(빠진트리거: null).
--   c8 조각의 머리말이 「확인 블록의 기대트리거가 꺼짐·사라짐을 드러낸다」고 적은 것은
--   **사라짐만** 참이었다. 새는 방향은 언제나 「통과」다.
--
--   걸린 것은 c8 하나가 아니다. 기대트리거 5개 중 넷이 불변식을 지는 트리거다 —
--   learning_events_immutable · corrections_immutable · submissions_original_immutable ·
--   staff_access_log_immutable. 그것들이 꺼진 DB는 append-only가 아닌데, 이 확인은
--   그 DB를 초록으로 보고한다. 확인 쿼리가 「안 잰 것」을 통과로 내는 자리다.
--
-- ■ 왜 c8 조각을 고치지 않고 새 조각인가
--   ① 같은 버전을 고쳐 쓰면 checksum이 갈리고, 이미 c8이 선 DB(리허설)가 그 자리에서 멈춘다.
--      기록된 checksum을 손으로 갱신하는 길은 이 저장소가 기계로 막아 온 바로 그 우회다.
--   ② 사후 확인 쿼리의 정본은 **마지막 조각의 꼬리**다(tools/마이그레이션_합본.js가 거기서
--      supabase/확인_적용후상태.sql을 파생시킨다). 확인 쿼리를 바꾸는 유일한 통로가 새 조각이다.
--   그래서 계약 버전은 c8 그대로고(값목록·열·제약 한 글자도 안 바뀐다) 조각만 하나 늘어난다.
--
-- ■ 처방이 갈리므로 상태를 이름 옆에 붙인다
--   「없음」의 처방은 판을 붓는 것이고 「꺼짐」의 처방은 `enable trigger` 한 줄이다.
--   이름만 내면 유호님은 정상 DB에 판을 다시 부으려 하게 된다 — 따를 수 없는 처방은
--   우회를 정상 통로로 만든다(CLAUDE.md 가드 맹점 ③).
--
-- 이 조각은 c8(20260807040000)이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807060000';
  migration_name constant text := '20260807060000_engine_c8.sql';
  expected_checksum constant text := 'a198ff4c8f3e0bb48640366988782806fe16f7423ca5163fcb86c582b29d2dcb'; -- migration-checksum
  base_version constant text := '20260807040000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c8 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- DDL 없음. 이 조각이 바꾸는 것은 아래 꼬리의 확인 쿼리이고, 그 쿼리는 DB 안에 살지 않는다.
  -- 이력 행을 남기는 이유는 **어느 DB가 눈이 밝은 확인을 쓰는 판인가**를 확인 쿼리 자신이
  -- 현재버전으로 판정하기 때문이다(c8까지만 선 DB는 여기서 ❌가 난다 — 의도한 결과다).
  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

-- ============================================================================
-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('learning_events','correction_id'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
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
  ('learning_events_event_type_c8'), ('learning_events_task_type_c8'),
  ('submissions_task_format_c8'), ('submissions_translation_source_c8'), ('corrections_verdict_c8'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c8'), ('staff_role_c8'),
  ('learners_temp_password_paired_c8'),
  ('learning_events_correction_target_c8'), ('learning_events_correction_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner')
), 대상역할(r) as (values ('anon'), ('authenticated'))
, 대상권한(p) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
, 대상테이블(t) as (
  select tablename from pg_tables where schemaname='engine'
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
    where schemaname='engine' and tablename='schema_migrations') as 이력정책
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=8
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807060000'
              and (select checksum from 현재이력)='a198ff4c8f3e0bb48640366988782806fe16f7423ca5163fcb86c582b29d2dcb' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·8·0·0·3·1·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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

-- 확인 (갈래별)
-- ① 테이블과 RLS: 전부 true여야 한다(이 조각은 테이블을 늘리지 않는다 — 11 그대로).
-- ② 정책: 8 그대로. 「누구 것인가」는 기존 정책의 사슬을 쓴다.
-- ③ anon·authenticated의 engine 스키마·테이블 권한은 0이어야 한다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다. c7 이름이 하나라도 보이면 c8 조각이 안 돈 것이다.
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
--    c8 고유분: learning_events_correction_id_fkey · 트리거 learning_events_correction_same_learner
--    그리고 learning_events.correction_id 열이 「빠진열」에 안 보여야 한다.
-- ⑤ 빠진트리거 칸에 `(꺼짐:D)` 가 붙어 나오면 판이 아니라 **트리거가 꺼진 것**이다 —
--    처방은 `alter table engine.<표> enable trigger <이름>` 한 줄이고, 판을 다시 붓지 않는다.
-- ⑥ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.

commit;
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8 — 이 조각은 계약을 안 바꾼다.
--   새 열 consent_id 는 앱 payload 가 아니라 **서버 파생**이다 · capture_meta.server 와 같은 축)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 닫나 — 운영 배포 전 차단 4 중 물리 3 (유호님 확정 2026-08-07 · sol 심문 P0)
--   ② 원문 불변 확대 — L0 §3-3 은 task_snapshot·audio_ref·capture_meta 를 「최대 소급 불가」라
--      선언했는데 자물쇠(reject_original_overwrite)는 body_original·transcript 둘만 잠갔다.
--      선언과 자물쇠의 범위를 일치시킨다. 패턴은 그대로 「값이 이미 있는 칸만」이라
--      철회의 audio_deleted_at·뒤에 채워지는 전사(null→값 첫 채움)는 계속 산다.
--   ③ 동의 귀속 — learning_events 에는 consent_ver 문자열뿐이라 「정확히 어느 동의 행에
--      근거했나」를 증명할 수 없었다. consent_id(FK) 열을 열고, 세 쓰기 통로(events·deliver·
--      §9-3-2 철회 절차)가 스탬프한다. NOT NULL 강제는 다음 조각 몫이다 — 쓰는 자가 다
--      스탬프하는 것을 왕복이 증명한 뒤에 조인다(기존 행은 소급 스탬프 불가·append-only).
--      곁들여 동의 증거 자체를 보호한다(consents_protect): 개서·삭제·철회 되돌림 차단.
--      철회(revoked_at null→값)와 재동의(새 행)만 통과한다.
--   ④ 수집→처리 배선 — pipeline_jobs 는 표·lease_until·attempt_id 만 있고 **행을 만드는
--      코드가 0줄**이었다(제출은 서고 처리 job 은 영영 없는 고아). 제출 insert 와 같은
--      트랜잭션에서 트리거가 job 을 만들고, 이미 선 제출은 backfill 한다.
--   (차단 ① 「철회 후 수집 0건」은 DB 가 아니라 functions/events 의 게이트가 진다 —
--    같은 커밋의 코드 변경과 tools/왕복시험.js ⑫ 가 그 증명이다.)
--
-- ■ 왜 지금인가 — 전부 소급 불가다. S1 스택이 운영에 서기 전이 공짜로 고치는 마지막 창이다.
--
-- 이 조각은 20260807060000(계약 c8)이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807120000';
  migration_name constant text := '20260807120000_engine_c8.sql';
  expected_checksum constant text := '7745dfed827ed302b2bd0ec2448f33252207d59183fedb33b8ae998cfbdea780'; -- migration-checksum
  base_version constant text := '20260807060000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c8 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- ── ② 원문 불변 확대 — 선언(「최대 소급 불가」)과 자물쇠의 범위를 일치시킨다.
  create or replace function engine.reject_original_overwrite() returns trigger
    language plpgsql as $function$
  begin
    if OLD.body_original is not null and NEW.body_original is distinct from OLD.body_original then
      raise exception '학생 원문은 고치지 않는다 — 오류가 곧 데이터다 (L0 §2 원문 불변)';
    end if;
    if OLD.transcript is not null and NEW.transcript is distinct from OLD.transcript then
      raise exception '기계 전사는 덮지 않는다 — 사람이 고친 값은 transcript_verified로 간다 (L0 §9-2)';
    end if;
    if OLD.task_snapshot is not null and NEW.task_snapshot is distinct from OLD.task_snapshot then
      raise exception '과제 스냅숏은 고치지 않는다 — 그날 학생이 본 것이 증거다 (L0 §3-3)';
    end if;
    if OLD.audio_ref is not null and NEW.audio_ref is distinct from OLD.audio_ref then
      raise exception '음성 참조는 바꾸지 않는다 — 삭제는 audio_deleted_at 이 진다 (L0 §9-3)';
    end if;
    if OLD.image_refs is not null and NEW.image_refs is distinct from OLD.image_refs then
      raise exception '이미지 참조는 바꾸지 않는다 (L0 §3-3)';
    end if;
    if OLD.capture_meta is not null and NEW.capture_meta is distinct from OLD.capture_meta then
      raise exception '녹음 관측은 바꾸지 않는다 — 요청과 관측의 어긋남이 곧 데이터다 (C0 §4-2)';
    end if;
    if OLD.transcript_verified is not null and NEW.transcript_verified is distinct from OLD.transcript_verified then
      raise exception '사람 확인 전사는 덮지 않는다 — 재검수는 새 교정 행으로 간다 (L0 §9-2)';
    end if;
    if NEW.occurred_at is distinct from OLD.occurred_at then
      raise exception '발생 시각은 바꾸지 않는다 (L0 §2)';
    end if;
    return NEW;
  end
  $function$;

  -- ── ③ 동의 귀속 — 사건이 정확히 어느 동의 행에 근거했는지 가리키는 고리.
  alter table engine.learning_events
    add column if not exists consent_id uuid references engine.consents(consent_id);

  -- 동의 증거 보호 — 법적 근거 테이블이 append-only 원칙 밖에 있었다(sol P0).
  create or replace function engine.protect_consents() returns trigger
    language plpgsql as $function$
  begin
    if TG_OP = 'DELETE' then
      raise exception '동의 행은 지우지 않는다 — 법적 증거다. 철회는 revoked_at 를 세운다 (L0 §9-3)';
    end if;
    if NEW.learner_id is distinct from OLD.learner_id
       or NEW.consent_ver is distinct from OLD.consent_ver
       or NEW.doc_hash is distinct from OLD.doc_hash
       or NEW.agreed_at is distinct from OLD.agreed_at then
      raise exception '동의 증거는 개서하지 않는다 — 새 동의는 새 행이다 (L0 §9-3)';
    end if;
    if OLD.revoked_at is not null and NEW.revoked_at is distinct from OLD.revoked_at then
      raise exception '철회는 되돌리지 않는다 — 재동의는 새 행이다 (L0 §9-3)';
    end if;
    return NEW;
  end
  $function$;

  drop trigger if exists consents_protect on engine.consents;
  create trigger consents_protect before update or delete on engine.consents
    for each row execute function engine.protect_consents();

  -- ── ④ 수집→처리 배선 — 제출과 같은 트랜잭션에서 처리 대기표에 줄이 선다.
  create or replace function engine.enqueue_pipeline_job() returns trigger
    language plpgsql as $function$
  begin
    insert into engine.pipeline_jobs (submission_id) values (NEW.submission_id)
    on conflict (submission_id) do nothing;
    return NEW;
  end
  $function$;

  drop trigger if exists submissions_enqueue_job on engine.submissions;
  create trigger submissions_enqueue_job after insert on engine.submissions
    for each row execute function engine.enqueue_pipeline_job();

  -- 이미 선 제출의 backfill — 「제출은 있는데 job 이 없는 고아」를 0으로 만든다.
  insert into engine.pipeline_jobs (submission_id)
    select submission_id from engine.submissions
  on conflict (submission_id) do nothing;

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

-- ============================================================================
-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('learning_events','correction_id'),
  ('learning_events','consent_id'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
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
  ('learning_events_event_type_c8'), ('learning_events_task_type_c8'),
  ('submissions_task_format_c8'), ('submissions_translation_source_c8'), ('corrections_verdict_c8'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c8'), ('staff_role_c8'),
  ('learners_temp_password_paired_c8'),
  ('learning_events_correction_target_c8'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey')
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
  select tablename from pg_tables where schemaname='engine'
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
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=8
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807120000'
              and (select checksum from 현재이력)='7745dfed827ed302b2bd0ec2448f33252207d59183fedb33b8ae998cfbdea780' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·8·0·0·3·1·0·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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

-- 확인 (갈래별)
-- ① 테이블과 RLS: 전부 true여야 한다(이 조각은 테이블을 늘리지 않는다 — 11 그대로).
-- ② 정책: 8 그대로. 「누구 것인가」는 기존 정책의 사슬을 쓴다.
-- ③ anon·authenticated의 engine 스키마·테이블 권한은 0이어야 한다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 바꾸지 않는다 — c8 그대로).
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
--    이 조각 고유분: learning_events.consent_id 열 + learning_events_consent_id_fkey
--    · 트리거 submissions_enqueue_job(수집→처리 배선) · consents_protect(동의 증거 보호)
--    · 잡없는제출 = 0 (backfill 이 돌았고 트리거가 이후를 진다 — 0이 아니면 고아가 생긴 것).
-- ⑤ 빠진트리거 칸에 `(꺼짐:D)` 가 붙어 나오면 판이 아니라 **트리거가 꺼진 것**이다 —
--    처방은 `alter table engine.<표> enable trigger <이름>` 한 줄이고, 판을 다시 붓지 않는다.
-- ⑥ 현재버전과 checksum은 engine.schema_migrations의 최신 행에서 읽는다.

commit;
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8 — 이 조각은 계약을 안 바꾼다.
--   recorded_by 는 앱 payload 도 학습 필드도 아니다 · 운영자 기록이라 event_type 이 없다)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 닫나 — 동의 행의 **출처**가 어디에도 안 남던 자리 (유호님 확정 2026-08-07)
--   `tools/동의발급.js`(922703b)와 `tools/로그인코드발급.js` 둘 다 「누가 이걸 했는지」를
--   **화면에만** 찍고 끝냈다. 넣을 칸이 없어서였다. 그런데 동의는 법적 근거고, 근거에
--   출처가 없으면 나중에 「이 동의는 누가 받았나」에 답할 수 있는 사람이 아무도 없다.
--   그건 소급이 안 된다 — 실학생이 들어오기 전이 공짜로 고치는 마지막 창이다.
--
-- ■ 왜 새 표가 아니라 열인가
--   ① 「누가 기록했나」는 그 동의의 **속성**이지 별개 사건이 아니다.
--   ② 표를 나누면 동의 행과 감사 행이 **따로 쓰인다** — 한쪽만 서는 순간 출처 없는 동의가
--      생기고, 그게 생겼다는 것조차 아무도 모른다. 같은 행에 있으면 원리상 못 갈라진다.
--   ③ 표가 하나 늘면 RLS·불변 트리거·보존 정책이 전부 따라 붙는다(F124 — 새 표 금지).
--
-- ■ 이 조각은 **열만 연다. 강제는 다음 조각 몫이다.**
--   c8 의 `learning_events.consent_id` 와 같은 순서다 — 쓰는 자가 **전부** 스탬프하는 것을
--   왕복이 증명한 뒤에 조인다. 지금 강제를 함께 걸면 아직 안 고친 통로(동의발급·왕복시험
--   ·배달왕복시험·검증_마이그레이션)가 그 순간 전부 죽는다.
--   그래서 이 조각은 **아무것도 안 깨뜨린다** — 열이 늘 뿐이고 기존 insert 는 그대로 돈다.
--
-- ■ 🔴 다음 조각을 짤 사람에게 — 강제 수단을 잘못 고르면 **철회가 막힌다**
--   기존 행(리허설 3건 · 운영 0건)은 출처를 소급할 수 없다. consents_protect(20260807120000)
--   가 개서를 막고, 막는 게 맞다 — 없는 사실을 지어내는 것이 백필이다.
--   그래서 「새 행만」 강제해야 하는데:
--     · `not null`             → 기존 행 때문에 애초에 못 건다.
--     · `check ... not valid`  → 초기 전수검사만 건너뛸 뿐 **UPDATE 도 검사한다.** 그러면
--       출처 없는 옛 행은 `update ... set revoked_at = now()` 가 영원히 거절된다 =
--       **철회가 막힌다.** 철회는 법적 의무라 어떤 이유로도 막으면 안 된다(D5 · P0 §192).
--     · ✅ `before insert` 트리거 → 새 동의는 출처 없이 못 서고, 옛 행의 철회는 그대로 산다.
--       (consents_protect 는 `before update or delete` 라 겹치지 않는다.)
--
-- 이 조각은 20260807120000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807140000';
  migration_name constant text := '20260807140000_engine_c8.sql';
  expected_checksum constant text := '8395b3c08c5df18857da15825676f4077fdfd4ea135334404fb5dd0fa573792c'; -- migration-checksum
  base_version constant text := '20260807120000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c8 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- ── 동의 행의 출처. 기존 행은 null 로 남는다(소급 불가라 그게 사실이다).
  alter table engine.consents add column if not exists recorded_by text;

  comment on column engine.consents.recorded_by is
    '이 동의를 시스템에 기록한 사람·통로(학생이 아니라 운영자). 강제는 다음 조각의 before insert 트리거 — null 은 이 열이 생기기 전에 선 행이다.';

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('learning_events','correction_id'),
  ('learning_events','consent_id'),
  -- 동의 출처(20260807140000)
  ('consents','recorded_by'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
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
  ('learning_events_event_type_c8'), ('learning_events_task_type_c8'),
  ('submissions_task_format_c8'), ('submissions_translation_source_c8'), ('corrections_verdict_c8'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c8'), ('staff_role_c8'),
  ('learners_temp_password_paired_c8'),
  ('learning_events_correction_target_c8'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey')
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
  select tablename from pg_tables where schemaname='engine'
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
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=8
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807140000'
              and (select checksum from 현재이력)='8395b3c08c5df18857da15825676f4077fdfd4ea135334404fb5dd0fa573792c' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·8·0·0·3·1·0·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 빠진열이 비어야 한다.
-- ② 무기명 = 이 조각 **전에** 선 동의 행 수다. 0 이 아닌 게 정상이고, 소급 불가라 안 채운다.
-- ③ 기명이 **늘기 시작하면** 쓰는 통로가 스탬프하기 시작한 것이다 — 넷이 다 스탬프하는 것을
--    왕복이 보인 뒤에 다음 조각으로 조인다(그 전에 조이면 안 고친 통로가 그 순간 죽는다).
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 안 바꾼다 — c8 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**(...engine_c8)이 제약 이름으로 읽혀 빨개진다(2026-08-07 실측).
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8 — 이 조각은 계약을 안 바꾼다.
--   `source_kind`·`estimator_confidence`·`estimator_version`·`evidence_refs` 는 계약
--   「추정메타」에 c3부터 있던 이름이고 값목록도 c3이 정했다. 없던 것은 그 이름을 담을
--   **물리 칸**이다.)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 닫나 — 「어떻게 알게 됐나」를 담을 칸이 없다 (절단문서 ①-7)
--   `lib/이벤트검증.js` 의 `서버칸` 은 이 넷을 **앱이 보내면 400** 으로 막는다. 그런데
--   `supabase/` 전량에 DDL 열도 INSERT 도 **0건**이었다 — 앱은 못 보내고 서버는 담을 데가
--   없으니 그 넷은 계약에만 사는 이름이었다. F185 가 계약층에서 잡은 고아 필드의
--   **물리층 판**이다.
--
-- ■ 왜 지금인가 — 그리고 무엇이 아닌가 (정직하게)
--   지금은 추정을 만드는 것이 아무것도 없어서 **잃고 있는 행이 0건**이다. 그래서 이 조각은
--   「지금 새는 것을 막는다」가 아니라 「엔진의 **첫 추정 행** 전에 칸을 연다」이다.
--   열이 없는 채로 첫 추정이 쓰이면 그 행은 관측 행과 **모양이 같아** 사후에 못 가른다.
--   ⚠ 이 커밋이 실제로 **쓰는 것은 `source_kind` 하나**다(functions/events·deliver 양쪽).
--     나머지 셋은 추정기가 서는 날 첫 값을 받는다 — 그때 열이 없으면 그 값이 조용히
--     버려지는 것이 ①-7 이 지목한 상태다. 「열은 냈는데 아무도 안 채운다」를 알고도
--     안 적으면 그것이 다음 사람에게는 다시 고아로 보인다.
--
-- ■ 왜 `actor_kind` 로 대신하지 않나
--   `actor_kind` 는 **누가 했나**(learner·ai·teacher)이고 `source_kind` 는 **어떻게 알게
--   됐나**(explicit·teacher·observed·inferred)다. L0 §중요-3 이 v1에서 두 뜻이 한 칸에서
--   섞인 사고(`inferred` 를 「AI가 교정했다」로 씀)를 기록하고 갈라 놓은 축이라, 다시
--   합치면 그 사고로 되돌아간다.
--
-- ■ 이 조각은 **열만 연다. 강제는 다음 조각 몫이다.**
--   c8 의 `consents.recorded_by`(20260807140000)와 같은 순서다 — 쓰는 자가 **전부**
--   스탬프하는 것을 왕복이 증명한 뒤에 `before insert` 트리거로 조인다. 지금 `not null`
--   은 기존 리허설 행 때문에 애초에 안 걸리고, `check ... not valid` 는 UPDATE 도 검사해
--   옛 행을 건드리는 통로를 막는다(그 판정의 전문 = 20260807140000 머리말).
--
-- ■ 🔴 CHECK 를 일부러 안 걸었다
--   `estimator_confidence` 는 계약상 0~1 인데 범위 CHECK 를 지금 걸지 않는다 — 쓰는 자가
--   없어 **아무 행도 안 재는 제약**이 되고, 제약이 하나 늘면 확인 블록·테스트·다음 조각이
--   전부 그것을 이고 간다. 추정기가 서는 조각에서 그 자리와 함께 건다.
--
-- 이 조각은 20260807140000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807170000';
  migration_name constant text := '20260807170000_engine_c8.sql';
  expected_checksum constant text := 'd49f922e163dd6e0a51012d2c332e49b12f37479c4405144395e185ee900629c'; -- migration-checksum
  base_version constant text := '20260807140000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c8 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- ── 값목록은 계약 `수집_교정_계약.json` 의 `source_kind` 4종 그대로다.
  --    `create type` 에는 `if not exists` 가 없어 존재를 먼저 묻는다(engine.actor_kind 와 같은 꼴).
  if to_regtype('engine.source_kind') is null then
    create type engine.source_kind as enum ('explicit', 'teacher', 'observed', 'inferred');
  end if;

  -- ── 추정메타. 기존 행은 null 로 남는다(소급 불가라 그게 사실이다).
  alter table engine.learning_events
    add column if not exists source_kind engine.source_kind,
    add column if not exists estimator_confidence numeric,
    add column if not exists estimator_version text,
    add column if not exists evidence_refs jsonb;

  comment on column engine.learning_events.source_kind is
    '이 행의 앎이 어디서 왔나(explicit·teacher·observed·inferred). actor_kind(누가 했나)와 다른 축 — L0 §중요-3. 서버가 채운다(앱이 보내면 400 · lib/이벤트검증.js 서버칸). null 은 이 열이 생기기 전에 선 행이다.';
  comment on column engine.learning_events.estimator_confidence is
    '추정 신뢰도 0~1. 학생이 스스로 매긴 확신도(payload.confidence)와 다른 것이라 이름을 갈랐다(계약 c3). 추정기가 서기 전까지 null 이 정상이다.';
  comment on column engine.learning_events.estimator_version is
    '그 추정을 낸 추정기의 판본. 규칙이 바뀌면 같은 입력이 다른 값을 내므로, 없으면 과거 추정을 재현할 수 없다.';
  comment on column engine.learning_events.evidence_refs is
    '그 추정이 근거로 삼은 사건·자료 참조. cited_refs(생성에 들어간 입력)와 다르다 — 이쪽은 추정의 근거다(계약 c3).';

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('learning_events','correction_id'),
  ('learning_events','consent_id'),
  -- 동의 출처(20260807140000)
  ('consents','recorded_by'),
  -- 추정메타 물리 칸(20260807170000 · 절단문서 ①-7)
  ('learning_events','source_kind'), ('learning_events','estimator_confidence'),
  ('learning_events','estimator_version'), ('learning_events','evidence_refs'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
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
  ('learning_events_event_type_c8'), ('learning_events_task_type_c8'),
  ('submissions_task_format_c8'), ('submissions_translation_source_c8'), ('corrections_verdict_c8'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c8'), ('staff_role_c8'),
  ('learners_temp_password_paired_c8'),
  ('learning_events_correction_target_c8'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey')
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
  select tablename from pg_tables where schemaname='engine'
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
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=8
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807170000'
              and (select checksum from 현재이력)='d49f922e163dd6e0a51012d2c332e49b12f37479c4405144395e185ee900629c' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·8·0·0·3·1·0·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 빠진열이 비어야 한다 — 이 조각이 낸 4열이 거기 실려 있다.
-- ② `source_kind` 가 **채워지기 시작하는지**를 본다. 이 조각과 같은 커밋에서 두 통로
--    (functions/events · functions/deliver)가 스탬프하므로, 적용 뒤 새로 선 행은 null 이
--    아니어야 한다. 옛 행의 null 은 정상이다(이 열이 생기기 전에 선 행 · 소급 불가).
--      select source_kind, count(*) from engine.learning_events group by 1 order by 2 desc;
-- ③ 나머지 셋(estimator_confidence·estimator_version·evidence_refs)은 **전부 null 이 정상**이다
--    — 추정기가 아직 없다. 값이 보이기 시작하면 그때 강제(트리거)와 범위 CHECK 를 건다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 안 바꾼다 — c8 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md §4-5 ②
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c8 — 이 조각은 계약을 안 바꾼다.
--   새 열도 새 값목록도 없다. 바꾸는 것은 **검수자가 무엇을 읽는가** 하나다.)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 닫나 — 익명화가 이름만 가리고 있었다 (절단문서 ②-17)
--   `20260806234000_staff_c7` 의 `inspector_queue_submissions` 는 큐에 든 제출물의 **행 전체**를
--   연다. RLS 는 행 단위라 열을 못 좁힌다. 그래서 `learners` 를 안 열어 `display_name` 을
--   가려 놓고도 `body_original`·`task_snapshot`·`redaction_result` 가 같이 나갔다.
--   L0 §3-1 이 스스로 적어 둔 대로 **학생은 작문·음성에서 제 이름·전화를 말한다** — 즉
--   「검수 화면은 제출물 ID 로 돈다」는 익명화 주장은 구조로 뒷받침되지 않았다.
--
-- ■ 🔴 그런데 진짜 통로는 이 정책이 아니다 (②-15 와 같은 자리)
--   `engine` 은 API 에 노출돼 있지 않고 `authenticated` 에게 테이블 권한이 0이라 **오늘
--   이 정책에 닿는 것은 아무것도 없다**(`supabase/검증_직원정책.sql` 머리말이 그래서
--   문을 잠깐 열고 잰다). 검수 대시보드는 `service_role` Edge Function 뒤에 서고, 그 역할은
--   RLS 를 **우회한다.** 그러니 정책만 좁히면 고친 것처럼 보이고 실제로는 아무것도 안 막는다.
--   → 좁히는 자리를 **정책이 아니라 판(projection)** 으로 옮긴다. `service_role` 도 이 뷰를
--     읽으면 그 열만 얻는다. 옛 정책은 **지운다** — 남겨 두면 「검수자가 읽는 것」의 정본이
--     둘이 되고, 둘 중 넓은 쪽이 조용히 이긴다.
--
-- ■ 허용 목록이지 차단 목록이 아니다
--   `submissions` 에 열이 붙는 날 차단 목록은 **못 적은 이름을 그대로 흘리고** 증상은
--   「통과」다. 허용 목록이면 새 열의 기본값이 「안 나감」이고 증상은 **화면이 비는 것**이라
--   그날 사람이 온다 — 그 자리에서 「이걸 검수자가 봐도 되나」를 정하게 되는 것이 이
--   목록의 값이다. 반대방향 장부(빠진 열마다 사유)는 `tests/검수큐.test.js` 가 든다.
--
-- ■ 무엇을 안 담았나 (오늘 화면이 안 쓰는 것 · 발주_수집파이프라인 §3)
--   `body_original`·`task_snapshot` — 오늘 검수 화면은 **음성**이다(오디오 + 「들린 대로」 +
--     「교정문」 세 칸뿐). 쓰기·번역 검수 화면이 서는 날 이 줄에 더한다. 그날이 「사람이
--     원문을 읽는다」를 다시 판정할 자리고, 지금 미리 열어 두면 그 판정이 영영 안 일어난다.
--   `redaction_ver`·`redaction_result` — 후자는 **가려낸 식별자 자체**를 담는 칸이다.
--     비식별의 산출물을 검수자에게 주는 것은 비식별을 안 한 것보다 나쁘다.
--   `event_id` — 학생의 사건 줄 전체로 가는 지렛대. 화면은 `submission_id` 로 돈다.
--   `capture_meta`·`image_refs`·`task_ref`·`task_schema_ver`·`schema_ver` — 화면에 자리가 없다.
--
-- ■ 🔴 남는 것은 줄일 수 없다 — 그건 열 목록으로 못 푼다
--   `audio_ref` 와 `transcript` 는 **검수 대상 그 자체**다. 학생이 거기서 제 이름을 말하면
--   검수자는 그것을 듣는다. 그래서 이 조각은 「검수자는 개인정보를 안 본다」를 만들지 못하고,
--   만들었다고 적지도 않는다 — L0 §4-5 ② 의 그 문장을 이 커밋이 함께 고친다.
--   남은 통제는 동의·수탁 계약·조회 감사(`staff_access_log`)이고 그건 유호님 판정 자리다.
--
-- ■ 철회분은 큐에서 뺀다
--   `audio_deleted_at` 이 찍힌 행은 학생이 철회한 것이다(L0 §9-3 · 발주 §4 수용기준 6).
--   행은 남지만 사람에게 다시 보여줄 이유가 없다. ⚠ 이 필터는 **음성 축만** 덮는다 —
--   음성이 없는 제출(쓰기·번역)의 철회는 이 칸에 안 찍히고, 그 갈래는 ②-16 몫이다.
--
-- ■ 새 물건이 하나 늘었으니 새는지 보는 눈도 넓힌다
--   확인 쿼리의 `대상테이블` 은 `pg_tables` 만 훑었다 — **뷰는 거기 없다.** 이 조각이 engine
--   첫 뷰를 만들므로 같은 조각에서 `pg_views` 를 합친다. 안 넓히면 뷰에 grant 가 붙어도
--   「새는테이블권한=0」 이 그대로 초록이다(가드가 등록층에서 새는 네 형태 중 ③).
--
-- 이 조각은 20260807170000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807190000';
  migration_name constant text := '20260807190000_review_c8.sql';
  expected_checksum constant text := '949655b398b49f55b0629fdb718c5c18e5c10833af3c4905fcebd0d9165860b9'; -- migration-checksum
  base_version constant text := '20260807170000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c8 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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
      '선행 조각 %가 없다 — 순서대로 부어라(합본은 처음부터 붓는다)', base_version;
  end if;

  -- ── 검수자가 읽는 판 (L0 §4-5 ② · 절단문서 ②-17) ────────────────────────
  -- 🔴 역할 판정을 여기 넣지 않는다. 이 뷰의 소비자는 `service_role` Edge Function 이라
  --    `auth.uid()` 가 null 이고, `current_staff()` 를 걸면 **정상 호출이 0행**이 된다.
  --    「이 토큰이 검수자인가」는 §4-5 ② 대로 서버가 `engine.staff` 에서 확정한다 —
  --    이 뷰가 정하는 것은 **무엇을 보여줄 것인가** 하나다.
  create or replace view engine.review_queue as
    select s.submission_id,
           s.task_type,
           s.task_format,
           s.occurred_at,
           s.audio_ref,
           s.audio_duration_sec,
           s.transcript,
           s.transcript_verified,
           s.transcript_state,
           s.stt_segments,
           s.stt_confidence,
           s.code_switch_spans
      from engine.submissions s
     where engine.in_review_queue(s.submission_id)
       and s.audio_deleted_at is null;

  comment on view engine.review_queue is
    '검수자에게 내보내도 되는 제출물 열 — 허용 목록(절단문서 ②-17). 역할 판정은 Edge Function 몫.';

  -- 🔴 grant 하지 않는다. `engine` 은 API 에 노출돼 있지 않고, 조회 감사(`staff_access_log`)는
  --    「읽는 지점이 하나뿐」이라는 전제 위에 선다(§4-5 ④). 통로를 하나 더 내면 그 감사가 샌다.

  -- 옛 통로를 지운다 — 뷰와 정책이 같이 살면 정본이 둘이고 넓은 쪽이 이긴다.
  drop policy if exists inspector_queue_submissions on engine.submissions;

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('learning_events','correction_id'),
  ('learning_events','consent_id'),
  -- 동의 출처(20260807140000)
  ('consents','recorded_by'),
  -- 추정메타 물리 칸(20260807170000 · 절단문서 ①-7)
  ('learning_events','source_kind'), ('learning_events','estimator_confidence'),
  ('learning_events','estimator_version'), ('learning_events','evidence_refs'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
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
  ('learning_events_event_type_c8'), ('learning_events_task_type_c8'),
  ('submissions_task_format_c8'), ('submissions_translation_source_c8'), ('corrections_verdict_c8'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c8'), ('staff_role_c8'),
  ('learners_temp_password_paired_c8'),
  ('learning_events_correction_target_c8'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey')
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
                       where j.submission_id = s.submission_id)) as 잡없는제출
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807190000'
              and (select checksum from 현재이력)='949655b398b49f55b0629fdb718c5c18e5c10833af3c4905fcebd0d9165860b9' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 검수뷰=1 · 옛검수정책=0 — 둘을 같이 본다. 뷰만 서고 정책이 남으면 넓은 쪽이 이긴다.
-- ② 뷰가 실제로 좁은지는 열 목록으로 본다(파일 층 검사는 `tests/검수큐.test.js` 가 든다):
--      select column_name from information_schema.columns
--       where table_schema='engine' and table_name='review_queue' order by ordinal_position;
--    12열이어야 하고 body_original·task_snapshot·redaction_result 는 **없어야** 한다.
-- ③ 새는테이블권한=0 이 이제 뷰까지 센다 — review_queue 에 grant 를 붙이면 여기가 빨개진다.
--    (붙이면 안 된다: 조회 감사는 「읽는 지점이 하나」라는 전제 위에 선다 · L0 §4-5 ④)
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 안 바꾼다 — c8 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c8 · learners_signup_attempts_nonneg_c8
--         · learners_temp_password_paired_c8 · learning_events_correction_target_c8
--         · learning_events_event_type_c8 · learning_events_task_type_c8
--         · staff_role_c8 · submissions_task_format_c8 · submissions_translation_source_c8
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c9)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- c8 → c9 델타 — 「학생이 실제로 보고·들었다」는 **관측** 사건 이름 하나.
--   유호님 확정 2026-08-07. 정본 = appsscript `docs/_ops/심문_P0_소급불가_절단.md` §결정 요청.
--   `event_type` 값목록에 `content.viewed` 하나를 더한다. **그게 전부다** — 새 표 0 · 새 열 0.
--
-- ■ 왜 이름 하나가 소급불가 둘을 닫나
--   ①-2 의 남은 자리(재생 완료·자기 목소리 되듣기)와 ①-12 의 남은 절반(전달의 관측 짝)은
--   서로 다른 화면인데 **같은 사실**을 묻는다: 「그날 학생 앞에 놓인 것에 눈·귀가 닿았는가」.
--   ①-2 는 오디오 **밖**의 화면 행동이라 WAV 에서 파생이 안 되고(파생 가능한 것은 이미
--   `hesitation_ms` 계열로 기각됐다 · 발주_게임모듈 §646), ①-12 는 `intervention.delivered` 가
--   전날 밤 배치의 **추정**이라(lib/사건출처.js 가 `inferred` 로 박아 둔 자리) 관측 짝이 없으면
--   네트워크 실패가 「전달 완료」로 학습된다.
--
-- ■ 왜 지금인가 — 소급 불가
--   「그날 열었는가」는 그날에만 알 수 있다. 나중에 이름을 내도 그 전 기간은 영원히 빈칸이고,
--   개원 첫 주가 이탈이 제일 많은 창이다. 지금은 학생이 0이라 **잃는 행이 0** 이다 —
--   즉 이 조각은 「새는 것을 막는다」가 아니라 「첫 학생 전에 칸을 연다」이다.
--
-- ■ 🚫 `correction.viewed` 의 뜻을 넓히는 안은 기각(자기 기각)
--   그 사건은 `correction_id` 를 **필수**로 물고 있어(c8 · learning_events_correction_target)
--   넓히려면 그 필수를 풀어야 하고, 그 순간 「교정을 봤다」와 「오디오를 들었다」가 한 칸에서
--   섞인다. c6·§6-6 이 두 번 잡은 형태다. 교정 열람은 그대로 `correction.viewed` 다.
--
-- ■ 🔑 CHECK 접미는 **살아 있는 것 전부**를 c9 로 통일한다 — 값이 안 바뀐 여덟도 포함해서.
--   c8 머리말이 같은 판정을 적어 뒀고 `tests/L0스키마.test.js` 의 「CHECK 제약 이름이 계약
--   버전을 달고 있다」가 그 자리에서 빨개진다. 지키는 것은 값의 최신성이 아니라 **판이 조용히
--   미적용되는 것**이다 — 이름이 그대로면 「c9 계약 + c8 물리」가 초록으로 보인다.
--   여덟은 술어를 한 글자도 안 바꾸고 이름만 간다.
--
-- ■ ⚠ 이 조각은 **넓히기만 한다** — 기존 행을 떨어뜨리는 좁힘이 없다.
--   `event_type` 은 값이 늘기만 하고, 다시 거는 여덟은 술어가 c8 과 동일하므로 위반 행이
--   있을 수 없다. 즉 이 조각이 실패하면 그건 데이터가 아니라 이력·권한 문제다.
--
-- ■ ⛔ 생산자는 아직 0 이다 — 알고 남긴다.
--   낼 화면 셋(재생 완료·되듣기·개입 열람)이 `parent_event_id` 로 쓸 대상 사건 id 를 아직
--   손에 안 들고 있다(배달 payload 에 `intervention.delivered` 의 event_id 가 실려야 한다).
--   그 부재는 `lib/이벤트검증.js` 의 생산자 장부에 **사유로** 적혀 있고, 그 장부를
--   `tests/이벤트검증.test.js` 가 강제한다 — 이름만 서고 아무도 안 내는 상태가 조용히
--   초록으로 남지 않는다(전층감사 발견 A).
--
-- 이 조각은 20260807190000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260807210000';
  migration_name constant text := '20260807210000_engine_c9.sql';
  expected_checksum constant text := '6539abce7a626aa59a03c213e331de94cc335fae9db7f4fc70e06b873831e85d'; -- migration-checksum
  base_version constant text := '20260807190000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c8 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- ── learning_events — 값목록 +1(content.viewed) · 나머지 둘은 이름만 c8→c9.
  alter table engine.learning_events
    drop constraint if exists learning_events_event_type_c8,
    drop constraint if exists learning_events_task_type_c8,
    drop constraint if exists learning_events_correction_target_c8,
    add constraint learning_events_event_type_c9 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result', 'content.viewed'
    )),
    add constraint learning_events_task_type_c9 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    )),
    -- 🔑 술어는 c8 과 한 글자도 같다. `content.viewed` 는 교정 사건이 아니므로 else 가지로
    --    떨어져 `correction_id is null` 을 요구한다 — 그게 옳다(그 행의 대상은 correction 이
    --    아니라 `parent_event_id` 다 · lib/이벤트검증.js 이벤트별필수).
    add constraint learning_events_correction_target_c9 check (
      case when event_type in ('correction.viewed', 'correction.responded')
           then correction_id is not null
           else correction_id is null
      end
    );

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c8,
    drop constraint if exists submissions_translation_source_c8,
    add constraint submissions_task_format_c9 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    add constraint submissions_translation_source_c9 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c8,
    add constraint corrections_verdict_c9 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c8,
    drop constraint if exists learners_temp_password_paired_c8,
    add constraint learners_signup_attempts_nonneg_c9 check (signup_attempts >= 0),
    add constraint learners_temp_password_paired_c9
      check (temp_password_hash is null or temp_password_expires_at is not null);

  alter table engine.staff
    drop constraint if exists staff_role_c8,
    add constraint staff_role_c9 check (role in ('teacher', 'inspector', 'director'));

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('learning_events','correction_id'),
  ('learning_events','consent_id'),
  -- 동의 출처(20260807140000)
  ('consents','recorded_by'),
  -- 추정메타 물리 칸(20260807170000 · 절단문서 ①-7)
  ('learning_events','source_kind'), ('learning_events','estimator_confidence'),
  ('learning_events','estimator_version'), ('learning_events','evidence_refs'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
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
  ('learning_events_event_type_c9'), ('learning_events_task_type_c9'),
  ('submissions_task_format_c9'), ('submissions_translation_source_c9'), ('corrections_verdict_c9'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c9'), ('staff_role_c9'),
  ('learners_temp_password_paired_c9'),
  ('learning_events_correction_target_c9'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey')
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
                       where j.submission_id = s.submission_id)) as 잡없는제출
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260807210000'
              and (select checksum from 현재이력)='6539abce7a626aa59a03c213e331de94cc335fae9db7f4fc70e06b873831e85d' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 빠진제약이 비어야 한다 — 아홉 이름이 전부 `_c9` 로 바뀐 뒤라 하나라도 `_c8` 로 남으면
--    여기 이름이 뜬다(재실행으론 안 바뀐다 · drop/add 를 따로 돌린 자리다).
-- ② 값목록이 실제로 넓어졌는지는 넣어 보고 본다 — 리허설에서만:
--      insert 로 `content.viewed` 한 행을 세우고 지운다. c8 물리 위에서는 23514 로 거절된다.
-- ③ 🔴 **넓히기만 했다** — 기존 행을 검사하는 좁힘이 없으므로 이 조각은 위반 행으로 실패하지
--    않는다. `learning_events_correction_target_c9` 는 c8 과 술어가 한 글자도 같다(이름만 갈았다).
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 아홉을 `_c8`→`_c9` 로 갈았다).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c9 · learners_signup_attempts_nonneg_c9
--         · learners_temp_password_paired_c9 · learning_events_correction_target_c9
--         · learning_events_event_type_c9 · learning_events_task_type_c9
--         · staff_role_c9 · submissions_task_format_c9 · submissions_translation_source_c9
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c10)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- c9 → c10 델타 — 배정이 **언제까지였나**, 그리고 그 마감을 **무슨 규칙이 냈나**.
--   유호님 승인 2026-08-08(㉮ 범위 · appsscript memory `collection-engine-automation-mandate` ⑤).
--   정본 = appsscript `docs/엔진도달_설계.md` §3-2 ①.
--   물리 = `submissions` 열 2 + CHECK 1 + 불변 자물쇠 2칸. **새 표 0 · 새 사건 0.**
--
-- ■ 없으면 무엇을 영영 못 하나
--   습관 축(리듬)의 원신호는 「몇 시에 냈나」가 아니라 **「마감까지 몇 분 남기고 냈나」**다.
--   같은 21시 제출이라도 마감이 22시면 벼락치기고 다음날 정오면 여유다 — 두 학생을 같은
--   행동으로 학습하면 이탈 예측이 통째로 어긋난다. 그런데 c9·L0 어디에도 마감이 없었다.
--   `daily_activity.expected` 는 *「그날 낼 게 있었나」* 만 말하고 *「몇 분 남았나」* 를 못 낸다.
--
-- ■ 왜 지금인가 — 소급 불가
--   마감은 **수업표에서 파생된 값**이다. 수업표가 바뀌면 과거 마감을 다시 계산할 근거가
--   사라지고, 그때 그 학생에게 몇 시가 마감이었는지는 **영원히 복원되지 않는다.**
--   지금은 학생이 0이라 잃는 행이 0이다 — 이 조각은 「새는 것을 막는다」가 아니라
--   **「첫 학생 전에 칸을 연다」**이다(c9 머리말과 같은 성질).
--
-- ■ 왜 두 칸인가 — 시각만으로는 못 읽는다
--   `due_at` 만 남기면 2년 뒤에 「이 값이 무슨 규칙으로 나온 건가」를 아무도 못 말한다.
--   `due_ver` 가 그 규칙의 판을 든다. 규칙이 바뀌면 **새 판 이름**을 쓰고 옛 행은 옛 이름을
--   그대로 든다 — `task_schema_ver`(스냅샷 모양의 판)와 정확히 같은 계열의 사고다.
--   🔑 `due.v1` = **배정일의 끝**(배정일 다음날 00:00 · `Asia/Ulaanbaatar`).
--      값은 `(배정일::date + 1)::timestamp at time zone <시간대>` 로 **DB가 낸다** — 오프셋
--      상수를 코드에 적지 않는다(P0 §314 · 절단문서 ①-14 가 같은 자리에서 한 번 물렸다).
--      🚫 반대로 **읽는 쪽이 그때그때 다시 계산하는 안은 기각**이다. 그게 곧 「수업표가 바뀌면
--      과거가 바뀐다」이고, 이 조각이 존재하는 이유 그 자체를 깨뜨린다.
--
-- ■ 왜 `submissions` 인가
--   배정 한 건에 붙는 산출물 칸이 이미 거기 있다(`task_ref`·`task_snapshot`·`task_schema_ver`).
--   `learning_events` 에 열면 전 사건의 99%가 null 인 칸이 되고, payload(jsonb)에 넣으면
--   CHECK·불변 자물쇠·확인 카운터 **셋 다** 못 건다 — 절단문서 ①-7 이 추정메타를 payload 에서
--   물리 칸으로 끌어낸 것과 같은 판정이다.
--   🚫 학생 제출 행(`submission.created`)에 마감을 **복사하지 않는다.** 복사하는 순간
--      「이 배정의 마감」의 정본이 둘이 되고, 어긋나는 날 어느 쪽이 참인지 아무도 못 정한다
--      (L0 §3-3 이 `learner_id` 복제를 거부한 것과 같은 이유). 제출은 그날 배정을 조인해 읽는다.
--
-- ■ 분모의 정본을 **하나로 정한다** (이 조각의 두 번째 몫)
--   「안 낸 날」의 분모 후보가 두 개였다: ①`task.assigned` 사건 ②`daily_activity.expected`.
--   ②는 **열 DDL만 있고 값을 채우는 코드가 0줄**이다(실측 2026-08-08 · `lib/`·`src/`·
--   `functions/` grep 0건). 정본은 ①**`task.assigned` 사건**이다 — append-only 이고, 이미
--   `functions/deliver` 라는 생산자가 있고, 마감까지 그 행이 든다.
--   ②는 **파생 캐시 자리로 남긴다**(집계 속도용). 아래 확인 카운터 `분모칸오염` 이 그 자리에
--   값이 들어오는 순간 빨개진다 — 캐시가 조용히 두 번째 정본이 되는 길을 기계가 막는다.
--   🚫 열을 지우지 않는다: 지우는 것은 좁힘이라 이 조각의 「넓히기만 한다」 성질을 깨고,
--      캐시로 쓸 자리 자체는 나중에 값이 있다.
--
-- ■ 🔑 CHECK 접미는 **살아 있는 것 전부**를 c10 으로 통일한다 — 값이 안 바뀐 것도 포함해서.
--   c8·c9 머리말이 같은 판정을 적어 뒀고 `tests/L0스키마.test.js` 가 그 자리에서 빨개진다.
--   이름이 그대로면 「c10 계약 + c9 물리」가 초록으로 보인다.
--
-- ■ ⚠ 이 조각은 **넓히기만 한다** — 기존 행을 떨어뜨리는 좁힘이 없다.
--   새 열 둘은 null 로 서고(옛 배정에는 마감이 없었던 것이 사실이다 — 지어내 채우지 않는다),
--   짝 CHECK 는 둘 다 null 인 기존 행을 통과시키며, 다시 거는 아홉은 술어가 c9 와 동일하다.
--
-- ■ ⛔ 옛 배정은 **소급 채우지 않는다.**
--   c10 이전 행의 마감은 아무도 모른다. `now()` 나 규칙을 소급 적용해 채우면 그건 복원이
--   아니라 **날조**고, 그 뒤로는 진짜 값과 지어낸 값이 같은 모양이 된다. 확인 카운터도
--   이 조각이 선 시각 이후 행만 센다.
--
-- 이 조각은 20260807210000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260808010000';
  migration_name constant text := '20260808010000_engine_c10.sql';
  expected_checksum constant text := '8422b5082ea79e1df1abe0f506d3876c4e2f2da3ef20f255aa6da5790fa2e856'; -- migration-checksum
  base_version constant text := '20260807210000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c9 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- ── 마감 시각·마감 판본 (소급 불가 · 유호님 승인 2026-08-08)
  alter table engine.submissions
    add column if not exists due_at  timestamptz,   -- 그 배정의 마감 순간
    add column if not exists due_ver text;          -- 그 마감을 낸 규칙의 판 (`due.v1` = 배정일의 끝)

  -- ── CHECK 접미 통일 c9→c10 + 짝 규칙 신설
  alter table engine.learning_events
    drop constraint if exists learning_events_event_type_c9,
    drop constraint if exists learning_events_task_type_c9,
    drop constraint if exists learning_events_correction_target_c9,
    add constraint learning_events_event_type_c10 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result', 'content.viewed'
    )),
    add constraint learning_events_task_type_c10 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    )),
    add constraint learning_events_correction_target_c10 check (
      case when event_type in ('correction.viewed', 'correction.responded')
           then correction_id is not null
           else correction_id is null
      end
    );

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c9,
    drop constraint if exists submissions_translation_source_c9,
    add constraint submissions_task_format_c10 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    add constraint submissions_translation_source_c10 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    ),
    -- 🔑 시각만 있고 판본이 없으면 그 값은 **읽을 수 없는 값**이다(무슨 규칙인지 모른다).
    --    판본만 있고 시각이 없으면 규칙만 있고 결과가 없다. 반쪽은 둘 다 사고라 짝으로 건다.
    add constraint submissions_due_paired_c10 check (
      (due_at is null) = (due_ver is null)
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c9,
    add constraint corrections_verdict_c10 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c9,
    drop constraint if exists learners_temp_password_paired_c9,
    add constraint learners_signup_attempts_nonneg_c10 check (signup_attempts >= 0),
    add constraint learners_temp_password_paired_c10
      check (temp_password_hash is null or temp_password_expires_at is not null);

  alter table engine.staff
    drop constraint if exists staff_role_c9,
    add constraint staff_role_c10 check (role in ('teacher', 'inspector', 'director'));

  /* ── 마감은 **배정 순간에만 참이다** — 자물쇠에 두 칸을 더한다.
   *   나중에 고칠 수 있으면 「마감을 놓쳤다」가 사후에 지워지고, 그 순간 이 열이 지키려던
   *   것을 이 열이 깨뜨린다(§10-4 `definition_ver` 를 기각한 것과 같은 형태).
   *   패턴은 c8(20260807120000)과 같다 — **값이 이미 있는 칸만** 잠근다. null→값 첫 채움은
   *   그대로 살아, c10 이전 행에 나중에 진짜 근거가 생기면 한 번은 채울 수 있다. */
  create or replace function engine.reject_original_overwrite() returns trigger
    language plpgsql as $function$
  begin
    if OLD.body_original is not null and NEW.body_original is distinct from OLD.body_original then
      raise exception '학생 원문은 고치지 않는다 — 오류가 곧 데이터다 (L0 §2 원문 불변)';
    end if;
    if OLD.transcript is not null and NEW.transcript is distinct from OLD.transcript then
      raise exception '기계 전사는 덮지 않는다 — 사람이 고친 값은 transcript_verified로 간다 (L0 §9-2)';
    end if;
    if OLD.task_snapshot is not null and NEW.task_snapshot is distinct from OLD.task_snapshot then
      raise exception '과제 스냅숏은 고치지 않는다 — 그날 학생이 본 것이 증거다 (L0 §3-3)';
    end if;
    if OLD.audio_ref is not null and NEW.audio_ref is distinct from OLD.audio_ref then
      raise exception '음성 참조는 바꾸지 않는다 — 삭제는 audio_deleted_at 이 진다 (L0 §9-3)';
    end if;
    if OLD.image_refs is not null and NEW.image_refs is distinct from OLD.image_refs then
      raise exception '이미지 참조는 바꾸지 않는다 (L0 §3-3)';
    end if;
    if OLD.capture_meta is not null and NEW.capture_meta is distinct from OLD.capture_meta then
      raise exception '녹음 환경 실측은 덮지 않는다 — 그때 잰 값이 증거다 (L0 §3-3)';
    end if;
    if OLD.transcript_verified is not null
       and NEW.transcript_verified is distinct from OLD.transcript_verified then
      raise exception '검수 확정 전사는 덮지 않는다 (L0 §9-2)';
    end if;
    if OLD.due_at is not null and NEW.due_at is distinct from OLD.due_at then
      raise exception '마감 시각은 고치지 않는다 — 사후에 늘리면 「놓쳤다」가 지워진다 (L0 §3-3)';
    end if;
    if OLD.due_ver is not null and NEW.due_ver is distinct from OLD.due_ver then
      raise exception '마감 판본은 고치지 않는다 — 그 값이 무슨 규칙이었는지가 증거다 (L0 §3-3)';
    end if;
    if NEW.occurred_at is distinct from OLD.occurred_at then
      raise exception '발생 시각은 고치지 않는다 (L0 §2)';
    end if;
    return NEW;
  end
  $function$;

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
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
  ('learning_events_consent_id_fkey')
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
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and 마감없는배정=0 and 분모칸오염=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260808010000'
              and (select checksum from 현재이력)='8422b5082ea79e1df1abe0f506d3876c4e2f2da3ef20f255aa6da5790fa2e856' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 빠진제약이 비어야 한다 — 아홉 이름이 `_c10` 으로 갈렸고 짝 CHECK 하나가 새로 섰다.
--    하나라도 `_c9` 로 남으면 여기 이름이 뜬다(재실행으론 안 바뀐다 · drop/add 를 따로 돌린 자리다).
-- ② 새 열 둘은 **null 로 선다** — 옛 배정에 마감이 없었던 것이 사실이고, 채우는 자는
--    `supabase/functions/deliver` 다(오늘 이후 배정부터). `마감없는배정` 이 그 배선을 지킨다.
-- ③ 🔴 **넓히기만 했다** — 기존 행을 검사하는 좁힘이 없다. 짝 CHECK 는 둘 다 null 인 기존
--    행을 통과시키고, 다시 거는 아홉은 c9 와 술어가 한 글자도 같다(이름만 갈았다).
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 아홉을 `_c9`→`_c10` 으로 갈았다).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c10 · learners_signup_attempts_nonneg_c10
--         · learners_temp_password_paired_c10 · learning_events_correction_target_c10
--         · learning_events_event_type_c10 · learning_events_task_type_c10
--         · staff_role_c10 · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/발주_수집파이프라인.md §3 · docs/L0_데이터계약.md §4-5 ②-1
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c10 — 이 조각은 계약을 안 바꾼다.
--   **새 열 0 · 새 표 0 · 새 사건 0 · 새 값목록 0.** 바꾸는 것은 `engine.review_queue`
--   판 하나다.)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 닫나 — **현행 판으로는 검수 화면을 못 그린다** (발주 §3 ⛔ 착수 1순위)
--   `20260807190000_review_c8` 이 「검수자가 무엇을 읽는가」를 정책에서 판으로 옮겼다.
--   그런데 그 12열은 **제출물 쪽만** 담았다 — 검수자가 실제로 판정하는 대상인 **AI 교정**
--   (`corrected_text`·`error_tags`·`explanation`·`model`/`prompt_ver`)이 판에 없다.
--   즉 「읽는 곳은 `engine.review_queue` 하나다」(§3)와 화면 명세가 **동시에 성립하지 않는
--   상태**였다. 이 자리를 원표 직접 읽기로 도망가면 그 순간 ②-17 의 전제가 통째로 깨지고
--   `body_original`·`task_snapshot`·`redaction_result` 가 같이 나간다 — 그래서 **판을 올린다.**
--
-- ■ 더하는 것 넷 (전부 이미 있는 표에서 온다)
--   ① **AI 교정 6열** — `ai_correction_id`·`ai_corrected_text`·`ai_error_tags`·
--      `ai_explanation`·`ai_model`·`ai_prompt_ver`. 접두 `ai_` 는 장식이 아니다: 승인이
--      만드는 teacher 행과 **이름이 겹치면** 화면이 자기가 무엇을 프리필했는지 잃는다.
--   ② **과제 맥락 2열** — 맥락 없는 라벨은 무효다(§3 🔑). 같은 발화도 「이 문장을 따라
--      읽어라」와 「이 질문에 답해라」에서 정답이 갈린다. ⚠ **`task_snapshot` 전문을 열지
--      않는다** — 계약이 그 안에 **정답**을 두기로 했고(L0 §3-3 「질문·보기·정답·지시문」),
--      전문을 열면 검수자에게 정답이 같이 간다. 필요한 **키만 투영**한다.
--   ③ **`is_audit_sample`** — 큐 순서의 첫 축(§3 「감사 표본 우선 혼입」). 화면이 정렬하려면
--      값이 판에 있어야 한다. 🔴 **`order by` 는 뷰에 넣지 않는다** — 순서는 읽는 쪽의
--      판단이고, 뷰에 박으면 페이지네이션이 그 위에 또 정렬을 얹는다.
--   ④ **`event_id`** — c8 이 **빼기로 했던 열**이다. 그 판정을 여기서 뒤집는다(아래).
--
-- ■ 🔴 뒤집는 판정 하나 — `event_id` 를 연다
--   c8 의 사유는 「학생 사건 줄 전체로 가는 지렛대 — 화면은 `submission_id` 로 돈다」였다.
--   화면만 보면 그 말이 맞다. 틀린 것은 **그 판을 읽는 자가 화면만이 아니라는 것**이다:
--   승격 사슬의 멱등키는 **원본 `event_id` 하나**이고(§3 · 「(event_id, 목적)」 기각분),
--   승인 Edge Function 은 그 값을 어딘가에서 얻어야 한다. 판에 없으면 **직원 통로가
--   `engine.submissions` 원표를 직접 연다** — `tests/검수큐.test.js` ⑤ 가 정확히 그것을
--   막으려고 서 있고, 그 통로가 한 번 열리면 옆 칸(`body_original`·`redaction_result`)은
--   같은 쿼리 한 줄 거리다. **지렛대를 판 안에 두는 쪽이 원표를 여는 쪽보다 좁다.**
--   ⚠ 정직하게 남기는 한계: 이 판은 「Edge Function 이 브라우저로 무엇을 내보내는가」를
--     못 막는다. `event_id` 는 화면에 그릴 값이 아니라 **서버가 승격에 쓰는 값**이고,
--     그 경계는 Edge Function 이 서는 날 그 자리에서 검사가 붙는다(오늘 Fn 은 0개다).
--
-- ■ 과제 맥락은 **실제 생산자의 모양**을 읽고 짰다 (지어낸 키가 아니다)
--   오늘 `task_snapshot` 을 만드는 곳은 `lib/오늘과제.js` 의 `스냅샷()` 하나다:
--     `{ver, 날짜, 호흡: [{차례, 무엇, task_format, 문장, 출처}, {차례, 무엇, task_format, 프롬프트}]}`
--   그래서 투영은 **그 제출물의 `task_format` 과 같은 호흡 한 마디**를 집는다 —
--   `task_instruction`(무엇: 「따라 말하기」/「답하기」) · `task_prompt`(낭독이면 `문장`,
--   자유발화면 `프롬프트`). 🚫 L0 §3-3 표의 `addressee_level`·`target_phonemes` 는 **아직
--   생산자가 0**이라 안 싣는다 — 없는 키를 투영하면 늘 null 인 칸이 둘 늘고, 「비어 있다」와
--   「안 만든다」가 같은 모양이 된다(이 저장소가 `daily_activity.expected` 로 한 번 물린 자리).
--   ⚠ 모양이 바뀌면 두 칸이 null 이 된다 — 증상이 **화면이 빈다**라 그날 사람이 온다.
--     그게 c8 이 고른 실패 방향이고, 이 조각도 같은 방향을 고른다.
--
-- ■ 큐 조건이 **두 곳에 있으면 갈라진다** — `in_review_queue` 호출을 뺐다
--   c8 판은 「AI 교정이 있나」를 `engine.in_review_queue(...)` 로 물었다. 이제 그 AI 행의
--   **열들을 실어야** 하므로 join 이 필요하고, join 이 곧 그 조건이다. 둘을 같이 두면
--   같은 판정이 두 곳에 적힌 것이고 언젠가 갈린다(CLAUDE.md 등록층 맹점 ④).
--   함수 자체는 **지우지 않는다** — 이 조각의 몫이 아니고, `engine` 은 API 에 노출돼 있지
--   않아 닿는 것이 없다(확인 쿼리 `새는스키마권한=0`).
--
-- ■ 폐기한 항목이 큐로 **되돌아오던 자리** (수용기준 17 · luna 실측 지적)
--   c8 판은 「AI 교정 존재 + 오디오 삭제 아님」만 봤다. `pipeline_jobs.status` 를 안 보므로
--   폐기(`discarded`)한 항목이 다음 조회에 그대로 다시 뜬다 — 검수자가 같은 것을 또 만난다.
--   🔑 **차단 목록이 아니라 허용 목록으로 잡는다**(c8 이 열에서 고른 것과 같은 판정):
--     `status = 'ai_processed'` 하나만 큐다. `discarded`·`revoked`·`verified`·`failed`·
--     `pending`·`processing` 이 **한꺼번에** 빠지고, 나중에 상태가 하나 더 생겨도 기본값이
--     「안 나감」이라 증상이 「화면이 빈다」다. 차단 목록이면 새 상태가 조용히 큐에 실린다.
--   ⚠ 그래서 **승인 Edge Function 은 확정과 같은 트랜잭션에서 `status='verified'` 를 써야
--     한다** — 안 쓰면 확정한 항목이 큐에 영원히 남는다. 그 자리는 Fn 이 서는 날이다.
--
-- ■ 스냅샷 하나가 **큐 전체를 죽이지 않게** 한다
--   `jsonb_array_elements` 는 배열이 아닌 값에 **런타임 오류**를 낸다. 앱 판이 올라 `호흡`
--   이 배열이 아닌 행이 하나만 섞여도 큐 조회가 통째로 실패한다 — 한 행의 문제가 화면
--   전체를 끄는 폭발 반경이라 `jsonb_typeof` 로 가른다(아니면 그 행만 맥락 2칸이 null).
--
-- ■ `create or replace` 가 아니라 **drop 후 create** 다
--   Postgres 는 replace 로 **기존 열의 순서·이름·타입을 못 바꾼다**(끝에 붙이는 것만 된다).
--   `event_id` 를 `submission_id` 옆에 두므로 replace 는 애초에 실패한다. 이 뷰에 딸린
--   의존 객체는 0이라(정책은 c8 이 지웠다) drop 이 안전하다.
--   ⚠ 그래서 `tests/검수큐.test.js` 는 **합본의 마지막 정의**를 읽어야 한다 — 첫 정의를
--     읽으면 이 조각이 올린 판을 영원히 못 본다(맹점 ①의 같은 계열). 같은 커밋에서 고쳤다.
--
-- 이 조각은 20260808010000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260809050000';
  migration_name constant text := '20260809050000_review_c10.sql';
  expected_checksum constant text := '05e87c5825f04dd7f65d96e827d24ac1681e9674364fe66b7ee5eaf3a1cd401f'; -- migration-checksum
  base_version constant text := '20260808010000';
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

  -- ── 검수자가 읽는 판 — 화면이 성립하는 최소 집합까지 올린다 (발주 §3 · 절단문서 ②-17)
  --    🔴 역할 판정은 여전히 넣지 않는다. 소비자가 `service_role` 이라 `auth.uid()` 가 null 이고,
  --       `current_staff()` 를 걸면 막는 게 아니라 **정상 호출이 0행**이 된다(화면이 통째로 빈다).
  drop view if exists engine.review_queue;

  create view engine.review_queue as
    select s.submission_id,
           s.event_id,                 -- 승격 멱등키 (머리말 🔴 — c8 판정을 뒤집은 자리)
           s.task_type,
           s.task_format,
           s.occurred_at,
           s.audio_ref,
           s.audio_duration_sec,
           s.transcript,
           s.transcript_verified,
           s.transcript_state,
           s.stt_segments,
           s.stt_confidence,
           s.code_switch_spans,
           과제.무엇 as task_instruction,     -- 「따라 말하기」/「답하기」
           과제.제시 as task_prompt,          -- 낭독이면 그 문장, 자유발화면 그 질문
           ai.correction_id  as ai_correction_id,
           ai.corrected_text as ai_corrected_text,
           ai.error_tags     as ai_error_tags,
           ai.explanation    as ai_explanation,
           ai.model          as ai_model,
           ai.prompt_ver     as ai_prompt_ver,
           j.is_audit_sample
      from engine.submissions s
      join engine.pipeline_jobs j
        on j.submission_id = s.submission_id
      -- 🔑 이 join 이 곧 「큐에 들었나」다(옛 `in_review_queue` 호출을 대신한다 — 머리말).
      --    여러 벌이면 **가장 최근 AI 행**이 화면이 프리필할 것이다.
      join lateral (
             select c.correction_id, c.corrected_text, c.error_tags,
                    c.explanation, c.model, c.prompt_ver
               from engine.corrections c
              where c.submission_id = s.submission_id
                and c.actor_kind = 'ai'
              order by c.created_at desc
              limit 1
           ) ai on true
      -- 과제 맥락 — `task_snapshot` **전문을 열지 않고** 그 제출물의 호흡 한 마디만 집는다.
      left join lateral (
             select 호->>'무엇' as 무엇,
                    coalesce(호->>'문장', 호->>'프롬프트') as 제시
               from jsonb_array_elements(
                      case when jsonb_typeof(s.task_snapshot->'호흡') = 'array'
                           then s.task_snapshot->'호흡'
                           else '[]'::jsonb
                      end) 호
              where 호->>'task_format' = s.task_format
              limit 1
           ) 과제 on true
     where j.status = 'ai_processed'      -- 허용 목록 (머리말 🔑 — 폐기·철회·확정분이 함께 빠진다)
       and s.audio_deleted_at is null;    -- 철회분은 사람에게 다시 보이지 않는다 (음성 축만)

  comment on view engine.review_queue is
    '검수자에게 내보내도 되는 열 — 허용 목록(②-17). 큐 조건 = AI 교정 있음 + status=ai_processed. 역할 판정은 Edge Function 몫.';

  -- 🔴 grant 하지 않는다. `engine` 은 API 에 노출돼 있지 않고, 조회 감사(`staff_access_log`)는
  --    「읽는 지점이 하나뿐」이라는 전제 위에 선다(§4-5 ④). 통로를 하나 더 내면 그 감사가 샌다.

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
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
  ('learning_events_consent_id_fkey')
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
  -- 검수 판이 **올라간 판인지**(20260809050000): `검수뷰=1` 은 뷰의 존재만 말한다.
  --   c8 의 12열 판이 그대로 서 있어도 그 칸은 1이라 초록이다 — 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and 마감없는배정=0 and 분모칸오염=0
             and 검수판열=22 and 검수판원문=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260809050000'
              and (select checksum from 현재이력)='05e87c5825f04dd7f65d96e827d24ac1681e9674364fe66b7ee5eaf3a1cd401f' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·22·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 검수판열=22 · 검수판원문=0 — **둘을 같이 본다.** 앞것만 보면 열 수만 맞고 위험한 열이
--    실린 판도 통과하고, 뒷것만 보면 c8 의 12열 판이 그대로 서 있어도 초록이다.
-- ② 검수뷰=1 · 옛검수정책=0 은 c8 이 세운 그대로 유지된다(이 조각은 정책을 안 건드린다).
-- ③ 판이 실제로 무엇을 내보내는지는 이름으로 본다(파일 층 검사는 `tests/검수큐.test.js`):
--      select column_name from information_schema.columns
--       where table_schema='engine' and table_name='review_queue' order by ordinal_position;
--    ai_ 여섯 · task_instruction · task_prompt · is_audit_sample · event_id 가 있어야 하고
--    body_original · task_snapshot · redaction_result 는 **없어야** 한다.
-- ④ 폐기가 큐에서 실제로 빠지는지(수용기준 17)는 판 파일로 못 잰다 — 리허설 왕복 몫이다:
--      update engine.pipeline_jobs set status='discarded' where submission_id=<한 건>;
--      select count(*) from engine.review_queue where submission_id=<그 건>;  -- 0
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 **한 개도 안 바꾼다** — c10 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c10 · learners_signup_attempts_nonneg_c10
--         · learners_temp_password_paired_c10 · learning_events_correction_target_c10
--         · learning_events_event_type_c10 · learning_events_task_type_c10
--         · staff_role_c10 · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md §4-5 ②-1 · docs/발주_수집파이프라인.md §3
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c10 — 이 조각도 계약을 안 바꾼다.
--   바뀌는 것은 `engine.review_queue` 의 **where 한 줄**이다.)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 되돌리나 — **바로 앞 조각(20260809050000)의 내 판단이 틀렸다**
--   그 조각은 폐기 항목이 큐로 되돌아오는 것을 막으려고 큐 조건을 `pipeline_jobs.status`
--   **허용 목록**(`= 'ai_processed'`)으로 잡았다. 근거는 「차단 목록은 새 상태를 조용히
--   싣는다」였고, 그 자체는 맞다. 틀린 것은 **그 칸에 값을 넣는 자가 있는지 안 재고** 썼다는
--   것이다.
--
--   실측(2026-08-09 · 리허설 `baasvefzinrxaryksayl`):
--     · `pipeline_jobs.status` 를 쓰는 코드가 **이 저장소에 0곳**이다(lib·src·functions·tools grep).
--     · 리허설 628건이 **전부 `pending`** 이고, AI 교정은 418행이 이미 있다.
--     · 그래서 판을 부은 직후 `select count(*) from engine.review_queue` = **0**.
--   좁힌 게 아니라 **도달 불가**로 만들었다. 그 칸의 예정 생산자는 n8n(§2 6단계)인데 아직 없다.
--
-- ■ 그런데 더 깊은 자리가 있다 — **캐시에 소속을 걸면 안 된다**
--   L0 §3 이 이미 적어 뒀다: 「`status` 는 **처리 상태이지 학습 사실이 아니다.** 「검수됐다」의
--   진실은 언제나 `corrections` 행이고 `'verified'` 는 그 캐시다. **어긋나면 `corrections` 가
--   맞다.**」 큐 **소속**을 그 캐시가 정하게 하면 이 문장을 판이 정면으로 뒤집는다.
--   실패 모드도 조용하다: n8n 이 교정을 쓰고 상태 갱신 전에 죽으면 그 제출물은 **사람에게
--   영영 안 보이고 증상이 없다**(교정은 있는데 큐에 없다). 데이터가 사라지는 것보다 나쁜
--   자리다 — 사라진 줄도 모른다.
--
-- ■ 그래서 역할을 되돌린다
--   · **소속** = 「AI 교정이 있나」 — 이미 lateral join 이 지고 있다(정본).
--   · **`status`** = 그 캐시가 **유일하게 권위 있는 것**만 진다: **끝난 상태 셋을 뺀다.**
--       `discarded`(폐기 · 수용기준 17) · `revoked`(철회) · `verified`(검수 끝).
--   즉 이 조각은 「차단 목록으로 후퇴」가 아니라 **각 칸을 자기 권위 범위로 되돌리는 것**이다.
--   🔑 새 상태가 생기면 기본값이 **「큐에 남는다」** 인데, 그게 맞는 방향이다 — 새 처리 단계가
--      생겼다고 검수자가 봐야 할 항목이 조용히 사라지면 안 된다. 반대로 **빼야 할 상태는
--      전부 이름이 있고**(끝났다는 뜻이라 새로 생길 일이 드물다), 하나라도 빠뜨리면 증상은
--      「같은 항목을 또 만난다」라 검수자가 그날 안다.
--
-- ■ ⚠ 그래도 `verified` 는 여전히 승인 Edge Function 이 써야 한다
--   안 쓰면 확정한 항목이 큐에 남는다. 바뀐 것은 **안 쓰면 큐가 통째로 비는 것**이
--   **안 쓰면 확정분이 남는 것**으로 내려온 것뿐이다 — 뒤가 훨씬 싼 실패다.
--   정본 = `docs/검수_내부계약.md` §5.
--
-- ■ 열은 한 칸도 안 바뀐다 — 22열 그대로다(확인 쿼리 `검수판열=22` 유지).
--   `create or replace` 를 못 쓰는 이유도 그대로다(앞 조각 머리말 — 여기선 where 만 바뀌지만
--   drop/create 한 짝으로 두는 편이 앞 조각과 같은 모양이라 읽는 사람이 안 헷갈린다).
--
-- 이 조각은 20260809050000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260809055000';
  migration_name constant text := '20260809055000_review_c10.sql';
  expected_checksum constant text := 'e6c9a0ddefb80526283863de9f742831f470a410beb4997fa63db7a3770ba6a2'; -- migration-checksum
  base_version constant text := '20260809050000';
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

  drop view if exists engine.review_queue;

  create view engine.review_queue as
    select s.submission_id,
           s.event_id,
           s.task_type,
           s.task_format,
           s.occurred_at,
           s.audio_ref,
           s.audio_duration_sec,
           s.transcript,
           s.transcript_verified,
           s.transcript_state,
           s.stt_segments,
           s.stt_confidence,
           s.code_switch_spans,
           과제.무엇 as task_instruction,
           과제.제시 as task_prompt,
           ai.correction_id  as ai_correction_id,
           ai.corrected_text as ai_corrected_text,
           ai.error_tags     as ai_error_tags,
           ai.explanation    as ai_explanation,
           ai.model          as ai_model,
           ai.prompt_ver     as ai_prompt_ver,
           j.is_audit_sample
      from engine.submissions s
      join engine.pipeline_jobs j
        on j.submission_id = s.submission_id
      -- 🔑 **소속을 정하는 것은 이 join 하나다** — 「AI 교정이 있나」가 곧 「사람이 볼 차례인가」.
      --    L0 §3: status 는 캐시고 어긋나면 corrections 가 맞다.
      join lateral (
             select c.correction_id, c.corrected_text, c.error_tags,
                    c.explanation, c.model, c.prompt_ver
               from engine.corrections c
              where c.submission_id = s.submission_id
                and c.actor_kind = 'ai'
              order by c.created_at desc
              limit 1
           ) ai on true
      left join lateral (
             select 호->>'무엇' as 무엇,
                    coalesce(호->>'문장', 호->>'프롬프트') as 제시
               from jsonb_array_elements(
                      case when jsonb_typeof(s.task_snapshot->'호흡') = 'array'
                           then s.task_snapshot->'호흡'
                           else '[]'::jsonb
                      end) 호
              where 호->>'task_format' = s.task_format
              limit 1
           ) 과제 on true
      -- `status` 가 유일하게 권위 있는 것 = **끝났다.** 그 셋만 뺀다(머리말).
     where j.status not in ('discarded', 'revoked', 'verified')
       and s.audio_deleted_at is null;

  comment on view engine.review_queue is
    '검수자에게 내보내도 되는 열 — 허용 목록(②-17). 소속=AI 교정 있음 · status 는 끝난 셋만 뺀다. 역할 판정은 Edge Function 몫.';

  -- 🔴 grant 하지 않는다(§4-5 ④ — 읽는 지점이 하나라는 전제).

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
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
  ('learning_events_consent_id_fkey')
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
  -- 검수 판이 **올라간 판인지**(20260809050000): `검수뷰=1` 은 뷰의 존재만 말한다.
  --   c8 의 12열 판이 그대로 서 있어도 그 칸은 1이라 초록이다 — 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and 마감없는배정=0 and 분모칸오염=0
             and 검수판열=22 and 검수판원문=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260809055000'
              and (select checksum from 현재이력)='e6c9a0ddefb80526283863de9f742831f470a410beb4997fa63db7a3770ba6a2' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·22·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 검수판열=22 · 검수판원문=0 — 앞 조각과 같다. **이 조각은 열을 한 칸도 안 바꾼다**(where 만).
-- ② 그래서 이 조각이 실제로 섰는지는 열 수로 못 잰다 — **현재버전**으로 가른다(위 판정에 걸려 있다).
-- ③ 🔴 **큐가 도는지는 판 파일이 못 잰다.** 앞 조각이 정확히 그 자리에서 물렸다(열은 22인데
--    행이 0이었다). 부은 뒤 한 줄로 실측한다:
--      select count(*) from engine.review_queue;
--    AI 교정이 있는 제출물 수와 같아야 한다:
--      select count(distinct submission_id) from engine.corrections where actor_kind='ai';
--    둘이 갈리면 그 차이가 곧 「끝난 셋(discarded·revoked·verified)」이다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 한 개도 안 바꾼다 — c10 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c10 · learners_signup_attempts_nonneg_c10
--         · learners_temp_password_paired_c10 · learning_events_correction_target_c10
--         · learning_events_event_type_c10 · learning_events_task_type_c10
--         · staff_role_c10 · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md §4-5 ②-1 · docs/발주_수집파이프라인.md §3
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c10 — 계약 불변. 새 열·표·사건 0.)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 닫나 — **검수 큐에 「배정 행」이 뜬다** (c8 부터 있던 구멍)
--   `engine.submissions` 은 두 종류를 함께 든다: **배정 행**(`task.assigned` — `task_snapshot`·
--   `due_at` 을 진다)과 **학생 제출 행**(`submission.created` — `audio_ref`·`transcript`·
--   `body_original` 을 진다). 큐의 소속 조건은 c8 이래 「AI 교정이 있나」 하나뿐이라 **둘을
--   안 가른다.**
--
--   실측(2026-08-09 · 리허설 · 판을 부어 큐를 처음 돌려 보고 드러났다):
--     · 큐 19행의 사건 종류가 **전부 `task.assigned`** 였다.
--     · 그 19행은 `audio_ref`·`transcript` 가 없다 — 검수 화면이 **아무것도 못 그리는** 행이다.
--     · 반대로 학생 제출 287행 중 AI 교정이 붙은 것은 **0**이다.
--   c8 판에서도 같았는데 안 보였다: 그 판은 열이 모자라 **아무도 큐를 돌려본 적이 없었다.**
--
-- ■ 왜 열 목록으로는 못 막히나
--   배정 행은 검수 열(`audio_ref`·`transcript`)이 전부 null 이라 「빈 행」으로 조용히 흐른다.
--   허용 목록은 **무엇을 보여줄지**를 정하지 **누구를 보여줄지**를 못 정한다 — 소속은 열이
--   아니라 **행의 정체**이고, 그 정체는 `learning_events.event_type` 하나에만 산다.
--
-- ■ 그래서 소속 조건이 둘이 된다 (**둘 다 필요하다**)
--   ① 이 행이 **학생이 낸 것인가** — `event_type = 'submission.created'`
--   ② 그것에 **AI 교정이 섰는가** — 기존 lateral join
--   ①만이면 AI 처리 전 제출물까지 뜨고, ②만이면 오늘처럼 배정 행이 뜬다.
--
-- ■ ⚠ 이 조각을 부으면 리허설 큐가 **19 → 0** 이 된다. 그게 맞는 값이다.
--   학생 제출 행에 붙은 AI 교정이 실제로 0이기 때문이다 — 즉 **AI 교정 생산자가 배정 행에
--   붙이고 있다**는 별개 결함이 남아 있고, 그건 판이 아니라 그 생산자 자리에서 고친다.
--   🔑 판이 그 결함을 **가려 주던 것**이 문제였다: 19행이 뜨니 「큐가 돈다」로 보였다.
--
-- 이 조각은 20260809055000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260809060000';
  migration_name constant text := '20260809060000_review_c10.sql';
  expected_checksum constant text := '17d6ae84650588c0a9e60c7271fcec5d33a87400bdb6859cdb84b0eca119d625'; -- migration-checksum
  base_version constant text := '20260809055000';
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

  drop view if exists engine.review_queue;

  create view engine.review_queue as
    select s.submission_id,
           s.event_id,
           s.task_type,
           s.task_format,
           s.occurred_at,
           s.audio_ref,
           s.audio_duration_sec,
           s.transcript,
           s.transcript_verified,
           s.transcript_state,
           s.stt_segments,
           s.stt_confidence,
           s.code_switch_spans,
           과제.무엇 as task_instruction,
           과제.제시 as task_prompt,
           ai.correction_id  as ai_correction_id,
           ai.corrected_text as ai_corrected_text,
           ai.error_tags     as ai_error_tags,
           ai.explanation    as ai_explanation,
           ai.model          as ai_model,
           ai.prompt_ver     as ai_prompt_ver,
           j.is_audit_sample
      from engine.submissions s
      -- 소속 ① — **학생이 낸 행인가.** 배정 행(`task.assigned`)은 검수 대상이 아니다:
      --   `audio_ref`·`transcript` 가 없어 화면이 아무것도 못 그린다(머리말 실측).
      join engine.learning_events e
        on e.event_id = s.event_id
       and e.event_type = 'submission.created'
      join engine.pipeline_jobs j
        on j.submission_id = s.submission_id
      -- 소속 ② — **AI 교정이 섰는가.** 여러 벌이면 가장 최근 것이 화면이 프리필할 것이다.
      join lateral (
             select c.correction_id, c.corrected_text, c.error_tags,
                    c.explanation, c.model, c.prompt_ver
               from engine.corrections c
              where c.submission_id = s.submission_id
                and c.actor_kind = 'ai'
              order by c.created_at desc
              limit 1
           ) ai on true
      left join lateral (
             select 호->>'무엇' as 무엇,
                    coalesce(호->>'문장', 호->>'프롬프트') as 제시
               from jsonb_array_elements(
                      case when jsonb_typeof(s.task_snapshot->'호흡') = 'array'
                           then s.task_snapshot->'호흡'
                           else '[]'::jsonb
                      end) 호
              where 호->>'task_format' = s.task_format
              limit 1
           ) 과제 on true
     where j.status not in ('discarded', 'revoked', 'verified')
       and s.audio_deleted_at is null;

  comment on view engine.review_queue is
    '검수자에게 내보내도 되는 열 — 허용 목록(②-17). 소속=학생 제출 행 + AI 교정 있음 · status 는 끝난 셋만 뺀다.';

  -- 🔴 grant 하지 않는다(§4-5 ④ — 읽는 지점이 하나라는 전제).

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
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
  ('learning_events_consent_id_fkey')
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
  -- 검수 판이 **올라간 판인지**(20260809050000): `검수뷰=1` 은 뷰의 존재만 말한다.
  --   c8 의 12열 판이 그대로 서 있어도 그 칸은 1이라 초록이다 — 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and 마감없는배정=0 and 분모칸오염=0
             and 검수판열=22 and 검수판원문=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260809060000'
              and (select checksum from 현재이력)='17d6ae84650588c0a9e60c7271fcec5d33a87400bdb6859cdb84b0eca119d625' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·22·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 검수판열=22 · 검수판원문=0 — 앞 조각과 같다(이 조각도 열을 안 바꾼다 · 소속 조건만).
-- ② 🔴 **큐에 배정 행이 섞였는지는 판 파일이 못 잰다.** 부은 뒤 한 줄로 실측한다 — 0이어야 한다:
--      select count(*) from engine.review_queue q
--        join engine.submissions s on s.submission_id = q.submission_id
--        join engine.learning_events e on e.event_id = s.event_id
--       where e.event_type <> 'submission.created';
-- ③ ⚠ 큐가 0행이어도 판이 틀린 게 아니다 — 2026-08-09 리허설 실측: 학생 제출 행에 붙은
--    AI 교정이 **0**이다(생산자가 배정 행에 붙이고 있다). 그건 판이 아니라 그 생산자 자리다.
--      select count(distinct c.submission_id) from engine.corrections c
--        join engine.submissions s on s.submission_id=c.submission_id
--        join engine.learning_events e on e.event_id=s.event_id
--       where c.actor_kind='ai' and e.event_type='submission.created';
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 한 개도 안 바꾼다 — c10 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c10 · learners_signup_attempts_nonneg_c10
--         · learners_temp_password_paired_c10 · learning_events_correction_target_c10
--         · learning_events_event_type_c10 · learning_events_task_type_c10
--         · staff_role_c10 · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
/* 스케줄러 배선 — P0 §373 「`pg_cron` 등록(배치 시각 + 그 30분 뒤 점검)」 · 2026-08-09 유호 지시
 *
 * 🔴 **파일 이름의 `_c10` 은 장식이 아니다.** Edge Function 넷이 계약판을 `schema_migrations` 의
 *   최신 이름 `_c<숫자>.sql` 에서 읽는다(P0 §374 · 회귀 `tests/마이그레이션이름.test.js`).
 *   `..._cron.sql` 처럼 판 없이 지으면 **API 4개가 동시에 500** 이 된다 — 앱 전체가 죽는데
 *   원인은 파일 이름이다. 판을 올리는 게 아니므로 c10 을 **그대로** 이어 쓴다.
 *
 * 🔑 **시각은 UTC 다**(DB `TimeZone` = UTC · 실측). 몽골(`Asia/Ulaanbaatar`)은 UTC+8 이라 8을 뺀다:
 *     배달  몽골 00:05 → UTC 16:05 (전날)
 *     점검  몽골 00:35 → UTC 16:35 (전날)  ← 배달 +30분(§373)
 *     전사  10분마다 (시간대 무관)
 *   🔴 배달이 **자정 직후**인 이유: `deliver` 는 호출 시점의 `몽골날짜()` 로 「오늘」을 정하고
 *   `due_at` 은 그날 자정이다(c10 `due.v1`). 몽골 자정 **전**에 돌리면 전날 것을 만들고,
 *   학생은 아침에 어제 과제를 받는다. 「전날 밤」이라는 말과 어긋나 보이지만 기준은 몽골 날짜다.
 *
 * 🔑 **자격증명이 이 파일에 없다** — Vault 에서 읽는다. ref 를 파일에 박으면 그 파일이 환경에
 *   묶여 리허설·운영이 갈린다(08-07 과녁 사고와 같은 층).
 *   ⛔ 두 항목은 이 파일이 만들지 않는다. 붓기 **전에** 그 프로젝트에서 넣어야 한다:
 *        vault: `service_role_key` · `functions_base_url`(= https://<ref>.supabase.co/functions/v1)
 *      없으면 잡은 걸리되 URL 이 null 이라 호출이 **에러로** 죽는다(조용한 실패가 아니다 — 의도).
 *
 * ⛔ **리허설엔 일부러 안 건다** — 스케줄러가 돌면 옆 세션 왕복시험의 배정 상태를 흔든다.
 *   리허설에 부을 일이 생기면 그 판단을 먼저 하고 붓는다.
 *
 * 되돌림: select cron.unschedule('deliver-daily'), cron.unschedule('deliver-check'),
 *                cron.unschedule('transcribe-batch'); */

/* ── 합본 프로토콜 수리(2026-08-09 · 세션 af79333d) ─────────────────────────────
 * 첫 판은 잡 3개만 들고 태어나 합본 검사 6건을 깨뜨렸다(트랜잭션·checksum·체인 등재 없음).
 * 이 판은 골격만 두른다 — 잡 이름·시각·본문은 첫 판과 같은 바이트다. 운영엔 첫 판이 이미
 * 돌았으므로(잡 3개 라이브 · 이력 행 없음) 이 판을 그대로 다시 부으면 체인이 아문다. */

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $migration$
declare
  migration_version constant text := '20260809070000';
  migration_name constant text := '20260809070000_cron_c10.sql';
  expected_checksum constant text := 'e520a69de0398278f517aeacd3ae4c1909aaa249bb8379de118e87f1022d4fd5'; -- migration-checksum
  base_version constant text := '20260809060000';
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

  /* 멱등 — 같은 이름이 있으면 떼고 다시 건다(없으면 0행이라 조용하다). */
  perform cron.unschedule(jobname)
    from cron.job
   where jobname in ('deliver-daily', 'deliver-check', 'transcribe-batch');

  /* ① 배달 — 그날 몫 1건을 학생마다 큐에 넣는다. */
  perform cron.schedule('deliver-daily', '5 16 * * *', $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
      body    := '{}'::jsonb);
  $job$);

  /* ② 점검 — 배달 +30분. 「오늘 배정 수 < 재적 수」면 미달을 낸다(§373 · 지금 수신자는 유호님 로그뿐).
   *   `?점검` 은 한글 쿼리라 퍼센트 인코딩해 넣는다 — 함수 쪽 `URLSearchParams` 가 되돌려 읽는다. */
  perform cron.schedule('deliver-check', '35 16 * * *', $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver?%EC%A0%90%EA%B2%80',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
      body    := '{}'::jsonb);
  $job$);

  /* ③ 전사 — 10분마다. 한 번에 집는 수는 함수가 정한다(지금 5). 검수자가 오디오만 받는 시간을 줄인다. */
  perform cron.schedule('transcribe-batch', '*/10 * * * *', $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/transcribe',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
      body    := '{}'::jsonb);
  $job$);

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
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
  ('learning_events_consent_id_fkey')
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
  -- 검수 판이 **올라간 판인지**(20260809050000): `검수뷰=1` 은 뷰의 존재만 말한다.
  --   c8 의 12열 판이 그대로 서 있어도 그 칸은 1이라 초록이다 — 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and 마감없는배정=0 and 분모칸오염=0
             and 검수판열=22 and 검수판원문=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260809070000'
              and (select checksum from 현재이력)='e520a69de0398278f517aeacd3ae4c1909aaa249bb8379de118e87f1022d4fd5' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·22·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 검수판열=22 · 검수판원문=0 — 앞 조각과 같다(이 조각도 열을 안 바꾼다 — pg_cron 스케줄러 등록뿐이다).
-- ② 🔴 **큐에 배정 행이 섞였는지는 판 파일이 못 잰다.** 부은 뒤 한 줄로 실측한다 — 0이어야 한다:
--      select count(*) from engine.review_queue q
--        join engine.submissions s on s.submission_id = q.submission_id
--        join engine.learning_events e on e.event_id = s.event_id
--       where e.event_type <> 'submission.created';
-- ③ ⚠ 큐가 0행이어도 판이 틀린 게 아니다 — 2026-08-09 리허설 실측: 학생 제출 행에 붙은
--    AI 교정이 **0**이다(생산자가 배정 행에 붙이고 있다). 그건 판이 아니라 그 생산자 자리다.
--      select count(distinct c.submission_id) from engine.corrections c
--        join engine.submissions s on s.submission_id=c.submission_id
--        join engine.learning_events e on e.event_id=s.event_id
--       where c.actor_kind='ai' and e.event_type='submission.created';
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 한 개도 안 바꾼다 — c10 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c10 · learners_signup_attempts_nonneg_c10
--         · learners_temp_password_paired_c10 · learning_events_correction_target_c10
--         · learning_events_event_type_c10 · learning_events_task_type_c10
--         · staff_role_c10 · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
-- ⑤ 스케줄러 3잡 실측 — 부은 뒤 한 줄로 (3 이어야 한다):
--      select count(*) from cron.job
--       where jobname in ('deliver-daily','deliver-check','transcribe-batch');
--    ⚠ 리허설은 이 조각 머리말의 ⛔ 정책대로 일부러 안 붓는다 — 확인 쿼리 판정이
--      「현재버전=20260809060000」으로 ❌ 를 내면 고장이 아니라 그 정책이다(✅ 대상은 운영뿐).
--    ⚠ 운영에 처음 부은 판(2026-08-09)은 이력 등재가 없던 옛 내용이었다 — 이 조각을 그대로
--      다시 부으면 잡은 멱등으로 재등록되고 이력 행이 생겨 체인이 이어진다(잡 내용 불변).
/* 멱등 충돌 판정의 근거 열 — `learning_events.request_hash` (C0 심문 B2 ②/③)

 * 🔴 **파일 이름의 `_c10` 은 장식이 아니다.** Edge Function 넷이 계약판을 `schema_migrations` 의
 *   최신 이름 `_c<숫자>.sql` 에서 읽는다(회귀 `tests/마이그레이션이름.test.js`).
 *   판을 올리는 게 아니므로 c10 을 **그대로** 이어 쓴다 — 값목록도 필드 정본도 안 바뀐다.
 *   앱이 보내는 것도 없다(이 열은 **서버가 요청 본문에서 계산해** 적는다).
 *
 * ■ 무엇을 막나
 *   `functions/events` 는 `on conflict (learner_id, idempotency_key) do nothing` 뒤에 내용을
 *   **안 보고** `duplicate` + 기존 event_id 를 돌려줬다. 앱은 그것을 `stored` 와 같은 갈래로 읽고
 *   큐에서 지운다(`src/사건통로.js`). 같은 키가 **다른 내용**에 두 번 쓰이면 뒤엣것이 통째로
 *   사라지고, 사라지는 쪽은 늘 학생 발화다. 증상이 「조용함」뿐이라 개원 뒤엔 못 찾는다.
 *   이 열이 생기면 서버가 「같은 키 + 다른 내용」을 **가를 수 있다**(가르는 코드는 함수 쪽).
 *
 * 🔑 인덱스를 안 만든다 — 이 열은 조건절에 안 쓰인다. `unique (learner_id, idempotency_key)`
 *   로 이미 한 행을 집은 **뒤에** 그 행의 지문을 읽어 비교할 뿐이다.
 *
 * 🔑 null 을 허용한다 — 이 조각 이전에 쌓인 행은 지문이 없다. not null 로 걸면 그 행들 때문에
 *   조각 자체가 안 부어지고, 기본값을 지어 넣으면 **없는 지문이 있는 척**한다(더 나쁘다).
 *
 * 되돌림: alter table engine.learning_events drop column if exists request_hash;
 *        delete from engine.schema_migrations where version = '20260809080000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260809080000';
  migration_name constant text := '20260809080000_engine_c10.sql';
  expected_checksum constant text := '3b41867b0dac52d6c38bc52ced7a0cef2fe864115084f444840c27d62c91f58e'; -- migration-checksum
  base_version constant text := '20260809070000';
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

  /* 요청 지문 — 서버가 `lib/요청해시.js` 로 계산해 적는다. 앱은 이 칸을 못 보낸다. */
  alter table engine.learning_events
    add column if not exists request_hash text;

  comment on column engine.learning_events.request_hash is
    '앱이 보낸 사건 원본의 sha256(lib/요청해시.js). 같은 idempotency_key 에 다른 내용이 왔는지 가른다. 이 조각 이전 행은 null.';

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

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
  ('learning_events_consent_id_fkey')
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
  -- 검수 판이 **올라간 판인지**(20260809050000): `검수뷰=1` 은 뷰의 존재만 말한다.
  --   c8 의 12열 판이 그대로 서 있어도 그 칸은 1이라 초록이다 — 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and 마감없는배정=0 and 분모칸오염=0
             and 검수판열=22 and 검수판원문=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260809080000'
              and (select checksum from 현재이력)='3b41867b0dac52d6c38bc52ced7a0cef2fe864115084f444840c27d62c91f58e' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·22·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 검수판열=22 · 검수판원문=0 — 앞 조각과 같다(이 조각은 review 판을 안 건드린다).
--    🔑 이 조각이 더하는 것은 `learning_events.request_hash` 하나이고, 그 검사는 위
--    확인 쿼리의 `기대열`(=`빠진열`)이 진다 — 판정 숫자를 손으로 늘리지 않았다.
-- ② 🔴 **큐에 배정 행이 섞였는지는 판 파일이 못 잰다.** 부은 뒤 한 줄로 실측한다 — 0이어야 한다:
--      select count(*) from engine.review_queue q
--        join engine.submissions s on s.submission_id = q.submission_id
--        join engine.learning_events e on e.event_id = s.event_id
--       where e.event_type <> 'submission.created';
-- ③ ⚠ 큐가 0행이어도 판이 틀린 게 아니다 — 2026-08-09 리허설 실측: 학생 제출 행에 붙은
--    AI 교정이 **0**이다(생산자가 배정 행에 붙이고 있다). 그건 판이 아니라 그 생산자 자리다.
--      select count(distinct c.submission_id) from engine.corrections c
--        join engine.submissions s on s.submission_id=c.submission_id
--        join engine.learning_events e on e.event_id=s.event_id
--       where c.actor_kind='ai' and e.event_type='submission.created';
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 한 개도 안 바꾼다 — c10 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c10 · learners_signup_attempts_nonneg_c10
--         · learners_temp_password_paired_c10 · learning_events_correction_target_c10
--         · learning_events_event_type_c10 · learning_events_task_type_c10
--         · staff_role_c10 · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
-- ⑤ 스케줄러 3잡 실측 — 부은 뒤 한 줄로 (3 이어야 한다):
--      select count(*) from cron.job
--       where jobname in ('deliver-daily','deliver-check','transcribe-batch');
--    ⚠ 리허설은 이 조각 머리말의 ⛔ 정책대로 일부러 안 붓는다 — 확인 쿼리 판정이
--      「현재버전=20260809060000」으로 ❌ 를 내면 고장이 아니라 그 정책이다(✅ 대상은 운영뿐).
-- ⑥ 지문 열 실측 — 부은 뒤 한 줄로 (1 이어야 한다):
--      select count(*) from information_schema.columns
--       where table_schema='engine' and table_name='learning_events' and column_name='request_hash';
--    ⚠ 열만 서고 값은 **부은 뒤 들어오는 행부터** 찬다. 옛 행의 `request_hash` 는 null 이고,
--      그 행과의 멱등 충돌은 판정 불가라 서버가 옛 동작(`duplicate`)으로 접는다 — 의도다.
/* 검수 확정이 담길 물리 칸 넷 — 재검수 계보·승격 의사·판정 시점 전사·폐기 사유
 *
 * 🔴 **파일 이름의 `_c10` 은 장식이 아니다.** Edge Function 넷이 계약판을 `schema_migrations` 의
 *   최신 이름 `_c<숫자>.sql` 에서 읽는다(회귀 `tests/마이그레이션이름.test.js`).
 *   판을 올리는 게 아니므로 c10 을 **그대로** 이어 쓴다 — 값목록도 필드 정본도 안 바뀐다.
 *   앱이 보내는 것도 없다(네 칸 전부 **검수자 통로**에서만 쓰인다 · C0 표면 0).
 *
 * ■ 무엇을 막나 (발주_수집파이프라인 §3 · 심문 합집합 2026-08-08)
 *   발주서가 승인·폐기 경로의 계약을 **일부러 비워 뒀다**: *"담을 물리 칸(`supersedes`·승격 의사·
 *   판정 시점 검증 전사·`discard_reason`)이 없어 c11 선행이다. 열 없이 적으면 구현 불가능한
 *   계약이 정본이 된다."* 이 조각이 그 넷을 낸다 — **계약은 c11 이 쓰고, 여기는 자리만 판다.**
 *
 *   ① `supersedes` — 재검수(`Z`)가 teacher 행을 **하나 더** 만들기만 하면 두 판정 중 어느 것이
 *      정본인지 아무 데도 안 적힌다. 서로 다른 라벨이 **둘 다** 개인화·훈련 경로로 흘러간다.
 *      🔑 `reviewed_correction_id` 는 **AI 행**을 가리키는 다른 축이라 이 자리를 못 덮는다.
 *   ② `promotion_intent` — `Shift+Enter`(교정 판정 + 훈련 승격 의사)의 ②가 지금 명세로는
 *      **산출물 저장 뒤에야** 사건이 된다. 그 사이 비식별·저장이 실패하면 **사람이 누른 의사가
 *      증발**하고 다시 물을 방법이 없다(그 항목은 이미 큐에서 나갔다). teacher 행과 **같은 쓰기**에
 *      남아야 뒤따르는 사슬이 그것을 **읽어서** 돈다.
 *      🚫 teacher 행의 **존재**를 승격 의사로 읽는 것은 여전히 금지 — 갈리는 것은 **이 열의 값**이다.
 *   ③ `transcript_at_review` — 검수자가 **무엇을 보고** 판정했는지가 행에 없다. 나중에
 *      `submissions.transcript_verified` 가 고쳐지면 과거 라벨이 조용히 다른 원문에 붙는다.
 *   ④ `discard_reason` — 폐기한 파일은 남기는데 **왜 뺐는지**가 없으면 「강건성 재료」와
 *      「오염 데이터」를 나중에 구별할 수 없다. 남긴 이유가 사라지면 남긴 의미도 사라진다.
 *
 * ■ 왜 지금인가 — 넷 다 **그때만 얻을 수 있는 것**이다
 *   계보·의사·판정 시점 원문·폐기 사유는 전부 **검수하는 그 순간**에만 알 수 있고, 나중에
 *   복원하면 그건 복원이 아니라 날조다(c10 `due_at` 머리말과 같은 판정). 검수자가 한 명이라도
 *   이 칸들 없이 돌면 그 기간의 라벨은 계보 없는 라벨로 영구히 남는다.
 *
 * ■ 범위 — 🚫 **데이터셋 멤버십 표(`dataset_item`·`group_id`)는 이 조각에 없다**
 *   발주서 §3 이 넷째 자리로 그것도 적었지만, **새 표를 만드는 것은 ㉮ 가 미뤄 둔 C 계층
 *   그 자체**다(`엔진도달_설계.md` §6 표 3행 — *"객체 종류를 바꾼다고 결정의 이유를 피해 가지
 *   못한다"*). 위 넷은 **이미 있는 표의 열**이라 그 결정을 안 건드린다. 그리고 멤버십은 소급
 *   불가가 아니다 — 조립 시점에 위 넷을 읽어 계산할 수 있다. 승격 **의사**만 지금 필요하다.
 *   ⚠ 훈련셋⟂평가셋 **묶음 단위 상호배타**는 그래서 아직 물리로 못 박히지 않았다. c11 이
 *   `dataset_item` 을 낼 때 `(dataset_ver, group_id) → 목적` 을 **PK 로** 잡아 위반을 표현
 *   불가능하게 만드는 것이 권고다(트리거로 막으면 꺼질 수 있다).
 *
 * 🔑 `promotion_intent` 만 `not null default false` 다 — 나머지 셋과 갈리는 이유가 있다.
 *   `request_hash`(앞 조각)는 **행에 대한 사실**이라 옛 행에 기본값을 넣으면 「없는 지문이 있는
 *   척」이 된다. 승격 의사는 반대다 — 아무도 누른 적 없으면 그것이 곧 `false` 이고, null 로
 *   두면 승격 사슬이 `null` 을 「모름」으로 읽어 **판단을 미루거나 참으로 접을** 여지가 생긴다.
 *   실패해도 승격이 **안 되는** 쪽으로 기우는 값이 기본값이어야 한다.
 *
 * 🔑 CHECK 를 「폐기인데 사유가 없다」로 걸지 **않는다** — 이 조각 이전에 이미 `discarded` 인
 *   행이 있으면 조각 자체가 안 부어진다(따를 수 없는 처방 · F103). 그 자리는 확인 쿼리의
 *   **카운터**(`폐기사유없는폐기`)가 지고, c10 `마감없는배정` 과 **같은 모양**으로 이 조각이
 *   선 뒤의 행만 센다.
 *
 * 🔑 폐기 사유 **값목록의 정본은 이 CHECK 다** — 계약 JSON 에 넣지 않는다. 그 파일은 두
 *   저장소가 공유하는 **앱·수집층 어휘**이고(`계약/수집_교정_계약.json` 머리), 폐기 사유는
 *   검수자 통로 안에서만 쓰여 앱이 보내지도 받지도 않는다.
 *   ⚠ 산문 사본은 **이미 둘 있다**(`발주_수집파이프라인.md` §3 · `검수_내부계약.md` 표).
 *   지우지 않는다 — 검수자가 읽는 자리라 문서가 여섯 개를 보여 주는 것이 제 일이다. 대신
 *   `tests/폐기사유.test.js` 가 그 둘을 이 CHECK 와 **대조**한다(순서까지). 없앨 수 없는
 *   사본은 기계에 물린다 — 산문만 낡는 자리가 이 저장소에서 이미 두 번 났다(F285).
 *
 * 🔴 **이름을 여기서 못박는다 — `functions/review` 머리말과 두 개가 갈려 있었다**(세션 조율
 *   2026-08-09 · ⑥=`8192260e` · 이 조각=`08deceb4`). 그쪽은 approve·discard 경로를 404 로
 *   두면서 막는 칸을 `promote_intent`·`transcript_verified_at_review` 로 적었다. 물리 정본은
 *   이 파일이고 채택한 이름은 **`promotion_intent`·`transcript_at_review`** 다.
 *   ▸ `promotion_intent` — 스키마의 다른 칸과 같은 명사형(`attempt_count`·`reviewer_confidence`).
 *   ▸ `transcript_at_review` — 🔑 **`_verified_` 를 뺀 것이 판정이다.** 검수자가 판정하는 시점에
 *     화면에 있는 것은 보통 **기계 전사**이고 `transcript_verified` 는 그 판정의 **산출물**이다.
 *     이름에 `verified` 를 넣으면 「사람이 확인한 원문을 보고 판정했다」는 거짓을 행마다 적게 된다.
 *   ⚠ approve·discard 경로를 쓰는 세션은 이 넷을 **이 이름으로** 읽는다.
 *
 * 되돌림: alter table engine.corrections
 *           drop constraint if exists corrections_promotion_intent_c10,
 *           drop constraint if exists corrections_supersedes_not_self_c10,
 *           drop column if exists supersedes,
 *           drop column if exists promotion_intent,
 *           drop column if exists transcript_at_review;
 *        alter table engine.pipeline_jobs
 *           drop constraint if exists pipeline_jobs_discard_reason_c10,
 *           drop column if exists discard_reason;
 *        delete from engine.schema_migrations where version = '20260809090000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260809090000';
  migration_name constant text := '20260809090000_engine_c10.sql';
  expected_checksum constant text := '069f79efa1604a7f15e5c570e001b2318fc8699f320c9e7cd65ec49b1d2bf6b3'; -- migration-checksum
  base_version constant text := '20260809080000';
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

  /* ① 재검수 계보 — 새 teacher 행이 자기가 대신하는 이전 행을 가리킨다.
   *    소비자는 원본당 **최신 미폐기 행 하나만** 읽는다(그 쿼리는 c11 몫). */
  alter table engine.corrections
    add column if not exists supersedes uuid references engine.corrections(correction_id);

  /* ② 승격 의사 — 확정과 같은 쓰기에 남는다(corrections 는 append-only 라 INSERT 시점뿐). */
  alter table engine.corrections
    add column if not exists promotion_intent boolean not null default false;

  /* ③ 판정 시점 검증 전사 — 그 행이 무엇을 보고 판정했나. */
  alter table engine.corrections
    add column if not exists transcript_at_review text;

  /* ④ 폐기 사유 — 닫힌 어휘. pipeline_jobs 는 상태가 도는 표라 UPDATE 로 들어온다. */
  alter table engine.pipeline_jobs
    add column if not exists discard_reason text;

  /* 자기 자신을 대신할 수는 없다. 더 긴 순환(A→B→A)은 CHECK 로 못 막고 소비자 쿼리가 진다. */
  alter table engine.corrections
    add constraint corrections_supersedes_not_self_c10
      check (supersedes is null or supersedes <> correction_id);

  /* 승격 의사는 **사람이 누르는 것**이다 — AI·학생 행에 서면 자동 발행이 이름만 바꿔 성립한다. */
  alter table engine.corrections
    add constraint corrections_promotion_intent_c10
      check (promotion_intent = false or actor_kind = 'teacher');

  /* 사유가 있으면 폐기여야 하고, 값은 닫힌 어휘 안이어야 한다.
   * ⚠ 역방향(폐기인데 사유 없음)은 **일부러 안 건다** — 머리말 참조. */
  alter table engine.pipeline_jobs
    add constraint pipeline_jobs_discard_reason_c10
      check (discard_reason is null
             or (status = 'discarded'
                 and discard_reason in
                   ('무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가')));

  comment on column engine.corrections.supersedes is
    '이 행이 대신하는 이전 teacher 교정(재검수 Z). 소비자는 원본당 최신 미폐기 행 하나만 읽는다. reviewed_correction_id(AI 행 지목)와 다른 축.';
  comment on column engine.corrections.promotion_intent is
    '검수 확정에서 사람이 훈련 승격을 함께 눌렀나(Shift+Enter). 확정과 같은 쓰기에 남아 사슬이 읽어 돈다. teacher 행의 존재가 아니라 이 값이 승격 의사다.';
  comment on column engine.corrections.transcript_at_review is
    '이 행이 판정한 시점의 검증 전사. 뒤에 submissions.transcript_verified 가 바뀌어도 그때의 원문이 남는다.';
  comment on column engine.pipeline_jobs.discard_reason is
    '폐기 사유(닫힌 어휘 — 정본은 CHECK pipeline_jobs_discard_reason_c10). 문서 두 곳의 나열은 tests/폐기사유.test.js 가 이 CHECK 와 대조한다.';

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

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
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
             and 검수판열=22 and 검수판원문=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260809090000'
              and (select checksum from 현재이력)='069f79efa1604a7f15e5c570e001b2318fc8699f320c9e7cd65ec49b1d2bf6b3' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·0·0·22·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 검수판열=22 · 검수판원문=0 — 앞 조각과 같다(이 조각은 review 판을 안 건드린다).
--    🔑 이 조각이 더하는 것은 열 넷 + CHECK 셋 + FK 하나이고, 그 검사는 위 확인 쿼리의
--    `기대열`·`기대제약`(=`빠진열`·`빠진제약`)이 진다 — 판정 숫자를 손으로 늘리지 않았다.
-- ② 🔴 **`기대:` 숫자가 앞 조각에서 한 칸 모자랐다** — 조건이 15개인데 숫자가 14개였다
--    (`분모칸오염` 이 빠져 있었다). 내 것까지 더해 **16개로 맞췄다**. 판정 로직은 한 글자도
--    안 바꿨다 — 바뀐 것은 ❌ 문구의 숫자 나열뿐이다.
--    ⚠ 이름을 붙여 읽기 쉽게 하려다 되돌렸다: `tests/L0스키마.test.js:163` 이 그 문구를
--      `기대: (\d+)·(\d+)·` 로 **기계 대조**한다(앞 둘 = 테이블 수). 라벨을 넣으면 그 눈이 먼다.
--      그래서 칸 이름은 문구가 아니라 여기 적는다 — 위 판정 CASE 와 **같은 순서**다:
--      테이블수 · RLS켜짐 · 정책수 · 새는테이블권한 · 새는스키마권한 · 삭제차단 · 실패상태
--      · 이력정책 · 잡없는제출 · 검수뷰 · 옛검수정책 · 마감없는배정 · 분모칸오염
--      · 폐기사유없는폐기 · 검수판열 · 검수판원문
-- ③ 폐기 사유 어휘 실측 — 부은 뒤 한 줄로 (닫힌 어휘 6개가 그대로 보여야 한다):
--      select pg_get_constraintdef(oid) from pg_constraint
--       where conname = 'pipeline_jobs_discard_reason_c10';
--    🔑 값의 정본은 **이 CHECK 정의**다. 산문 사본 둘(발주서 §3 · 검수_내부계약 표)은
--      `tests/폐기사유.test.js` 가 이 정의와 순서까지 대조한다(변이 2/2).
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 c10 접미를 그대로 쓰고 셋을 더한다).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_promotion_intent_c10 · corrections_supersedes_not_self_c10
--         · corrections_verdict_c10 · learners_signup_attempts_nonneg_c10
--         · learners_temp_password_paired_c10 · learning_events_correction_target_c10
--         · learning_events_event_type_c10 · learning_events_task_type_c10
--         · pipeline_jobs_discard_reason_c10 · staff_role_c10
--         · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
-- ⑤ 승격 의사 기본값 실측 — 부은 뒤 (0 이어야 한다 · 옛 행이 조용히 참이 되지 않았나):
--      select count(*) from engine.corrections where promotion_intent;
-- ⑥ 🔴 **이 조각은 자리만 판다 — 채우는 코드는 0줄이다.** 넷 다 검수 Edge Function(c11)이
--    서야 값이 들어온다. `daily_activity.expected`·`model`·`prompt_ver` 가 그렇게 열만 선
--    채로 남아 있고, 이 넷이 같은 길로 가는지는 `폐기사유없는폐기`·⑤ 가 아니라 **c11 착수
--    여부**가 답한다. 열이 섰다는 것을 「배선이 섰다」로 읽지 않는다(엔진도달 §5 의 경계).
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
/* c11 — 라디오24 Lane B 소개정: 승격 어휘 + engine.skills 첫 시드
 *   (계약 수집_교정_계약.json c11 · 정본 = appsscript docs/라디오24_설계.md §2-2·§4-3~4-5
 *    · 유호 확정 §7-5(라디오퀴즈)·§7-2 ㉠㉡㉢ · 집단 되돌림 채택 08-11)
 *
 * ■ 무엇이 바뀌나 — 값 추가 둘 + 시드 하나. 표 0 · 열 0 · 트리거 0.
 *   · event_type +1 affect.reported(§2-2 ⓔ 정서 자기보고 — preference.stated 로 뭉개면 뜻 넓히기)
 *   · task_type +3 라디오퀴즈·목표선언·자습체크인(통로 축 — 앱 퀴즈·앱 출석과 섞이면 영영 못 가른다)
 *   · engine.skills 첫 시드 30행(문항 팩 스킬표 contents/토픽퀴즈문항.js · skills.v1).
 *     수집 문(functions/events)이 skill_ids 실재를 DB 로 대조하므로 시드가 승격보다 선행이다 —
 *     문항 팩 머리말이 「Lane B 승격기 커밋과 한 벌」로 예고한 자리. 회귀가 이 시드와 스킬표를
 *     텍스트로 대조한다(tests/라디오승격.test.js).
 *
 * ■ CHECK 접미 통일 c10→c11 (c7 선례 — 값이 바뀐 것은 위 둘뿐이지만 판 접미는 전체를 통일한다.
 *   같은 이름이 두 값목록을 가리키면 DB 확인 ④가 어느 판인지 못 가른다. radio 쪽 1개 포함 14개.)
 *
 * ■ 검수 트랙의 「c11」 예고와 겹치지 않는다 — 그 물리 4자리는 이미 c10(20260809090000)으로
 *   섰다(검수_내부계약 §5 「c11 선행이 풀렸다」). 이 판은 라디오 단독이고, 검수의 c11 권고
 *   unique(supersedes) 는 일부러 안 실었다(성격이 다른 두 개정을 한 판에 안 묶는다 — 계약
 *   「필드정본_뒤처짐_수리」의 「왜 c11 이 아닌가」와 같은 기준 · 그 권고는 검수 트랙 몫).
 *
 * 되돌림: 각 CHECK 를 _c10 정의로 재교체(추가 값 4개 제거) +
 *        delete from engine.skills where schema_ver='c11'
 *          (⚠ 승격 행이 이미 그 skill_id 를 가리키면 지우지 않는다 — skill_id 는 불변 · L0 §3-5) +
 *        delete from engine.schema_migrations where version='20260812120000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260812120000';
  migration_name constant text := '20260812120000_engine_c11.sql';
  expected_checksum constant text := '1bbc172d6a4ef642abedb9cfdac768a0ffab12eb8ed592fa0cc40e6e63230134'; -- migration-checksum
  base_version constant text := '20260811160000';
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

  -- ── CHECK 접미 통일 c10→c11 + 값 추가(event_type +1 · task_type +3) ──
  alter table engine.learning_events
    drop constraint if exists learning_events_event_type_c10,
    drop constraint if exists learning_events_task_type_c10,
    drop constraint if exists learning_events_correction_target_c10,
    add constraint learning_events_event_type_c11 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected', 'correction.responded', 'correction.viewed', 'preference.stated', 'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked', 
      'task.assigned', 'exam.result', 'content.viewed', 'affect.reported'
    )),
    add constraint learning_events_task_type_c11 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화', '라디오퀴즈', '목표선언', '자습체크인'
    )),
    add constraint learning_events_correction_target_c11 check (
      case when event_type in ('correction.viewed', 'correction.responded')
           then correction_id is not null
           else correction_id is null
      end
    );

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c10,
    drop constraint if exists submissions_translation_source_c10,
    drop constraint if exists submissions_due_paired_c10,
    add constraint submissions_task_format_c11 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    add constraint submissions_translation_source_c11 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    ),
    add constraint submissions_due_paired_c11 check (
      (due_at is null) = (due_ver is null)
    );

  /* ⚠ verdict 는 **혼자 한 문장**이다 — tests/검수확정.test.js 의 값 추출이 「check … ));」 로
   *   끝나는 블록을 비탐욕으로 집는다. 다른 CHECK 와 한 alter 에 묶으면 종결이 「)),」 가 되어
   *   추출이 다음 「));」(직원 role 목록)까지 흘러 들어가 대조가 거짓 적색이 된다(08-12 실측). */
  alter table engine.corrections
    drop constraint if exists corrections_verdict_c10,
    add constraint corrections_verdict_c11 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.corrections
    drop constraint if exists corrections_supersedes_not_self_c10,
    drop constraint if exists corrections_promotion_intent_c10,
    add constraint corrections_supersedes_not_self_c11
      check (supersedes is null or supersedes <> correction_id),
    add constraint corrections_promotion_intent_c11
      check (promotion_intent = false or actor_kind = 'teacher');

  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c10,
    drop constraint if exists learners_temp_password_paired_c10,
    add constraint learners_signup_attempts_nonneg_c11 check (signup_attempts >= 0),
    add constraint learners_temp_password_paired_c11
      check (temp_password_hash is null or temp_password_expires_at is not null);

  alter table engine.staff
    drop constraint if exists staff_role_c10,
    add constraint staff_role_c11 check (role in ('teacher', 'inspector', 'director'));

  alter table engine.pipeline_jobs
    drop constraint if exists pipeline_jobs_discard_reason_c10,
    add constraint pipeline_jobs_discard_reason_c11
      check (discard_reason is null
             or (status = 'discarded'
                 and discard_reason in
                   ('무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가')));

  alter table radio.broadcast_segment
    drop constraint if exists broadcast_segment_kind_c10,
    add constraint broadcast_segment_kind_c11
      check (kind in ('radio_loop', 'live_lecture', 'asmr_mode', 'other'));

  /* ── engine.skills 첫 시드 30행 — 문항 팩 스킬표(skills.v1)가 정본이고 이 시드는 그 사본이다.
   *    label_mn 은 몽골어 검수 전이라 넣지 않는다(값 없으면 키 없음 — 팩 규칙 그대로).
   *    skill_id 는 불변(L0 §3-5) — 의미가 바뀌면 새 id 를 발급하고 superseded_by 로 잇는다.
   *    on conflict do nothing: 재실행 관용이 아니라 「이미 있는 정의를 덮지 않는다」다 —
   *    시드가 현행 행을 덮으면 과거 정의가 사라진다(definition_ver 기각과 같은 자리). */
  insert into engine.skills (skill_id, label_ko, domain, schema_ver) values
    ('skill-ko-grammar-particle-topic', '조사 — 은/는·이/가', 'grammar', 'c11'),
    ('skill-ko-grammar-particle-object', '조사 — 을/를', 'grammar', 'c11'),
    ('skill-ko-grammar-particle-place', '조사 — 에·에서', 'grammar', 'c11'),
    ('skill-ko-grammar-particle-range', '조사 — 부터·까지·마다', 'grammar', 'c11'),
    ('skill-ko-grammar-particle-instrument', '조사 — (으)로', 'grammar', 'c11'),
    ('skill-ko-grammar-particle-companion', '조사 — 하고·와/과', 'grammar', 'c11'),
    ('skill-ko-grammar-particle-dative', '조사 — 에게·한테·께', 'grammar', 'c11'),
    ('skill-ko-grammar-particle-focus', '조사 — 만·도·밖에', 'grammar', 'c11'),
    ('skill-ko-grammar-connective-reason', '연결어미 — -아/어서·-(으)니까', 'grammar', 'c11'),
    ('skill-ko-grammar-connective-contrast', '연결어미 — -지만', 'grammar', 'c11'),
    ('skill-ko-grammar-connective-condition', '연결어미 — -(으)면', 'grammar', 'c11'),
    ('skill-ko-grammar-connective-purpose', '연결어미 — -(으)러·-(으)려고', 'grammar', 'c11'),
    ('skill-ko-grammar-connective-sequence', '연결·순서 — -고 나서·전에·후에', 'grammar', 'c11'),
    ('skill-ko-grammar-tense-past', '시제 — 과거(불규칙 포함)', 'grammar', 'c11'),
    ('skill-ko-grammar-tense-future', '시제 — -(으)ㄹ 거예요', 'grammar', 'c11'),
    ('skill-ko-grammar-tense-progressive', '시제 — -고 있다', 'grammar', 'c11'),
    ('skill-ko-grammar-honorific', '높임 — -(으)시-·어휘 높임', 'grammar', 'c11'),
    ('skill-ko-grammar-negation', '부정 — 안·못·-지 않다·-지 마세요', 'grammar', 'c11'),
    ('skill-ko-expression-ability', '표현 — -(으)ㄹ 수 있다/없다', 'expression', 'c11'),
    ('skill-ko-expression-experience', '표현 — -아/어 보다·-(으)ㄴ 적', 'expression', 'c11'),
    ('skill-ko-expression-desire', '표현 — -고 싶다/싶어 하다', 'expression', 'c11'),
    ('skill-ko-expression-obligation', '표현 — -아/어야 하다', 'expression', 'c11'),
    ('skill-ko-expression-permission', '표현 — -아/어도 되다·-(으)면 안 되다', 'expression', 'c11'),
    ('skill-ko-vocab-verb-collocation', '어휘 — 동사 짝(입다·신다·쓰다·켜다)', 'vocab', 'c11'),
    ('skill-ko-vocab-antonym', '어휘 — 반대말', 'vocab', 'c11'),
    ('skill-ko-vocab-place', '어휘 — 장소', 'vocab', 'c11'),
    ('skill-ko-vocab-time', '어휘 — 시간·날짜', 'vocab', 'c11'),
    ('skill-ko-vocab-family', '어휘 — 가족·호칭', 'vocab', 'c11'),
    ('skill-ko-vocab-counter', '어휘 — 단위 명사', 'vocab', 'c11'),
    ('skill-ko-vocab-adverb', '어휘 — 부사·호응', 'vocab', 'c11')
  on conflict (skill_id) do nothing;

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
  ('learners','temp_password_hash')
), 기대제약(n) as (values
  ('learning_events_event_type_c11'), ('learning_events_task_type_c11'),
  ('submissions_task_format_c11'), ('submissions_translation_source_c11'),
  ('submissions_due_paired_c11'), ('corrections_verdict_c11'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c11'), ('staff_role_c11'),
  ('learners_temp_password_paired_c11'),
  ('learning_events_correction_target_c11'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c11'), ('corrections_promotion_intent_c11'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c11')
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
  -- 🔴 존재만 묻지 않는다. 꺼진 트리거는 pg_trigger 에 행이 그대로 남고 tgenabled 만
  --    'D'(꺼짐)·'R'(복제본에서만)이 된다 — 안 잰 것을 통과로 내면 그건 확인이 아니다.
  select e.n,
         (select g.tgenabled from pg_trigger g
            join pg_class r on r.oid=g.tgrelid
           where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n) as 상태
    from 기대트리거 e
), 빠진트리거 as (
  -- 상태를 이름 옆에 붙인다 — 「없음」은 판을 부어야 하고 「꺼짐」은 enable 한 줄이라 처방이 갈린다.
  -- ⚠ 상태::text 캐스트가 필수다. tgenabled 는 "char"(1바이트) 타입이라 || 후보가 갈려
  --    operator is not unique 로 쿼리 전체가 안 돈다 — 파일 층 검사는 이걸 못 본다(2026-08-07 실측).
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
  -- 검수자 판(20260807190000 · 절단문서 ②-17): 뷰가 있고 옛 정책이 없어야 둘 다 맞다.
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue') as 검수뷰,
  (select count(*) from pg_policies
    where schemaname='engine' and policyname='inspector_queue_submissions') as 옛검수정책,
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출,
  -- 마감(20260808010000): c10 이 선 뒤에 만들어진 배정만 센다 — 옛 행의 마감은 아무도 모른다.
  (select count(*) from engine.submissions s
     join engine.learning_events e on e.event_id = s.event_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and s.occurred_at >= (select applied_at from engine.schema_migrations
                             where version = '20260808010000')) as 마감없는배정,
  -- 분모의 정본은 task.assigned 사건 하나다 — daily_activity.expected 에 값이 들어오면 빨개진다.
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염,
  -- 폐기 사유(20260809090000): 그 조각이 선 뒤에 갱신된 job 만 센다.
  (select count(*) from engine.pipeline_jobs j
    where j.status = 'discarded' and j.discard_reason is null
      and j.updated_at >= (select applied_at from engine.schema_migrations
                            where version = '20260809090000')) as 폐기사유없는폐기,
  -- 검수 판이 올라간 판인지(20260809050000): 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문,
  -- ── 라디오 원장(20260811160000 · radio 스키마) ──
  (select count(*) from pg_tables where schemaname='radio') as 라디오표수,
  (select count(*) from pg_tables where schemaname='radio' and rowsecurity) as 라디오RLS수,
  (select count(*) from pg_policies where schemaname='radio') as 라디오정책수,
  (select count(*) from 대상역할 r cross join 라디오테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','radio',t.t), p.p)) as 라디오새는권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('radio'), 'USAGE')) as 라디오새는스키마,
  -- c11 이 접미를 갈았다 — 옛 이름을 세면 「적용 전」과 「적용 후」가 같은 0 으로 보인다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('radio')
      and conname='broadcast_segment_kind_c11') as 라디오kind제약,
  -- 링크 보호 트리거 — 존재가 아니라 켜짐을 센다(engine 트리거상태와 같은 이유).
  (select count(*) from pg_trigger g
     join pg_class c2 on c2.oid=g.tgrelid
    where c2.relnamespace=to_regnamespace('radio')
      and g.tgname='viewer_link_protect' and g.tgenabled in ('O','A')) as 연동보호트리거,
  -- 활성 링크는 채널당 1개 — 부분 유일 인덱스가 서 있어야 §3 의 유일성이 물리다.
  (select count(*) from pg_indexes
    where schemaname='radio' and indexname='viewer_link_active') as 연동활성유일,
  -- ── c11: engine.skills 첫 시드(문항 팩 스킬표 30 · skills.v1) — 0이면 승격이 전건 거절된다.
  (select count(*) from engine.skills) as 스킬시드수
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
             and 스킬시드수=30
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260812120000'
              and (select checksum from 현재이력)='1bbc172d6a4ef642abedb9cfdac768a0ffab12eb8ed592fa0cc40e6e63230134' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·0·0·22·0·6·6·0·0·0·1·1·1·30 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 이 조각은 표를 안 만든다 — engine 11·radio 6 그대로, 정책·트리거·권한 카운터 전부 불변.
--    새 칸 하나: 스킬시드수 30(문항 팩 스킬표가 engine.skills 에 처음 앉았다 — 0이면 라디오
--    승격이 skill 실재 대조에서 전건 거절된다). 라디오kind제약은 이제 _c11 이름을 센다.
-- ② ❌ 문구 칸 이름 — 위 판정 CASE 와 같은 순서다:
--    테이블수 · RLS켜짐 · 정책수 · 새는테이블권한 · 새는스키마권한 · 삭제차단 · 실패상태
--    · 이력정책 · 잡없는제출 · 검수뷰 · 옛검수정책 · 마감없는배정 · 분모칸오염
--    · 폐기사유없는폐기 · 검수판열 · 검수판원문 · 라디오표수 · 라디오RLS수 · 라디오정책수
--    · 라디오새는권한 · 라디오새는스키마 · 라디오kind제약 · 연동보호트리거 · 연동활성유일 · 스킬시드수
-- ③ 🔴 값을 넣는 코드는 승격기(supabase/functions/radio-promote)다 — 이 조각은 어휘와 시드만
--    깐다. learning_events 에 라디오 행이 0인 동안은 「승격이 한 번도 안 돌았다」가 사실이다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 _c10 열넷을 _c11 로 이름째 교체했다).
--    ⚠ 이 줄은 마지막 조각이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    기대: broadcast_segment_kind_c11 · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11
/* 라디오 승격기 스케줄러 — pg_cron 등록 (설계 §4-3 · 반박 c757278 치명 ⑦ 수리)
 *
 * ■ 왜 이 조각인가 — **승격기를 부르는 것이 없었다.** Fn 머리말은 「pg_cron 이 부른다」인데
 *   cron 조각(20260809070000)에는 잡 셋뿐이라, 다 배포해도 승격은 0행이고 그 0은 「라디오
 *   활동 없음」과 같은 모양이었다(조용한 0). 등록과 그 발동 조건은 같은 커밋에 있어야 한다.
 *
 * 🔴 파일 이름의 _c11 은 장식이 아니다 — Edge Function 들이 계약판을 schema_migrations 의
 *   최신 이름 _c<숫자>.sql 에서 읽는다(회귀 tests/마이그레이션이름.test.js). 판을 올리는 게
 *   아니므로 c11 을 그대로 이어 쓴다.
 *
 * 🔑 시각은 UTC(DB TimeZone = UTC · 실측). 매시 21분 — 라운드는 하루 4~6회(설계 §6-1 J)라
 *   시간 단위 승격이면 재도전 고리·당일 퀴즈가 그날 안에 닿는다. AI 호출 0원이라 비용 축 없음.
 *   deliver(:05·:35)와 분을 가른 것은 습관이지 필요는 아니다(net.http_post 는 비동기 발사).
 *
 * 🔑 자격증명이 이 파일에 없다 — Vault 에서 읽는다(cron_c10 과 같은 두 항목:
 *   service_role_key · functions_base_url). 없으면 잡은 걸리되 호출이 에러로 죽는다(의도).
 *
 * ⛔ 리허설엔 일부러 안 붓는다(cron_c10 정책 그대로) — 스케줄러가 돌면 옆 세션 §9 승격
 *   왕복시험의 원장·엔진 상태를 흔든다. 리허설에 부을 일이 생기면 그 판단을 먼저 한다.
 *
 * 되돌림: select cron.unschedule('radio-promote-hourly'); +
 *        delete from engine.schema_migrations where version='20260812130000'; */

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $migration$
declare
  migration_version constant text := '20260812130000';
  migration_name constant text := '20260812130000_cron_radio_c11.sql';
  expected_checksum constant text := 'ff8a8b3f2874bf6c120dd7911ee22a1ffad8d323131bc74db0a8593aac356f04'; -- migration-checksum
  base_version constant text := '20260812120000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c11 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  /* 멱등 — 같은 이름이 있으면 떼고 다시 건다(없으면 0행이라 조용하다). */
  perform cron.unschedule(jobname)
    from cron.job
   where jobname = 'radio-promote-hourly';

  /* 라디오 승격 — 매시. 원장(radio.*)의 명령 채팅을 engine.learning_events 로 판정 승격한다.
   * 한 번에 걷는 양은 함수가 정한다(키셋 커서 배치 · 못 다 걸으면 응답 「잘림」으로 드러난다). */
  perform cron.schedule('radio-promote-hourly', '21 * * * *', $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/radio-promote',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
      body    := '{}'::jsonb);
  $job$);

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
  ('learners','temp_password_hash')
), 기대제약(n) as (values
  ('learning_events_event_type_c11'), ('learning_events_task_type_c11'),
  ('submissions_task_format_c11'), ('submissions_translation_source_c11'),
  ('submissions_due_paired_c11'), ('corrections_verdict_c11'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c11'), ('staff_role_c11'),
  ('learners_temp_password_paired_c11'),
  ('learning_events_correction_target_c11'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c11'), ('corrections_promotion_intent_c11'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c11')
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
  -- 🔴 존재만 묻지 않는다. 꺼진 트리거는 pg_trigger 에 행이 그대로 남고 tgenabled 만
  --    'D'(꺼짐)·'R'(복제본에서만)이 된다 — 안 잰 것을 통과로 내면 그건 확인이 아니다.
  select e.n,
         (select g.tgenabled from pg_trigger g
            join pg_class r on r.oid=g.tgrelid
           where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n) as 상태
    from 기대트리거 e
), 빠진트리거 as (
  -- 상태를 이름 옆에 붙인다 — 「없음」은 판을 부어야 하고 「꺼짐」은 enable 한 줄이라 처방이 갈린다.
  -- ⚠ 상태::text 캐스트가 필수다. tgenabled 는 "char"(1바이트) 타입이라 || 후보가 갈려
  --    operator is not unique 로 쿼리 전체가 안 돈다 — 파일 층 검사는 이걸 못 본다(2026-08-07 실측).
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
  -- 검수자 판(20260807190000 · 절단문서 ②-17): 뷰가 있고 옛 정책이 없어야 둘 다 맞다.
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue') as 검수뷰,
  (select count(*) from pg_policies
    where schemaname='engine' and policyname='inspector_queue_submissions') as 옛검수정책,
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출,
  -- 마감(20260808010000): c10 이 선 뒤에 만들어진 배정만 센다 — 옛 행의 마감은 아무도 모른다.
  (select count(*) from engine.submissions s
     join engine.learning_events e on e.event_id = s.event_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and s.occurred_at >= (select applied_at from engine.schema_migrations
                             where version = '20260808010000')) as 마감없는배정,
  -- 분모의 정본은 task.assigned 사건 하나다 — daily_activity.expected 에 값이 들어오면 빨개진다.
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염,
  -- 폐기 사유(20260809090000): 그 조각이 선 뒤에 갱신된 job 만 센다.
  (select count(*) from engine.pipeline_jobs j
    where j.status = 'discarded' and j.discard_reason is null
      and j.updated_at >= (select applied_at from engine.schema_migrations
                            where version = '20260809090000')) as 폐기사유없는폐기,
  -- 검수 판이 올라간 판인지(20260809050000): 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문,
  -- ── 라디오 원장(20260811160000 · radio 스키마) ──
  (select count(*) from pg_tables where schemaname='radio') as 라디오표수,
  (select count(*) from pg_tables where schemaname='radio' and rowsecurity) as 라디오RLS수,
  (select count(*) from pg_policies where schemaname='radio') as 라디오정책수,
  (select count(*) from 대상역할 r cross join 라디오테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','radio',t.t), p.p)) as 라디오새는권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('radio'), 'USAGE')) as 라디오새는스키마,
  -- c11 이 접미를 갈았다 — 옛 이름을 세면 「적용 전」과 「적용 후」가 같은 0 으로 보인다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('radio')
      and conname='broadcast_segment_kind_c11') as 라디오kind제약,
  -- 링크 보호 트리거 — 존재가 아니라 켜짐을 센다(engine 트리거상태와 같은 이유).
  (select count(*) from pg_trigger g
     join pg_class c2 on c2.oid=g.tgrelid
    where c2.relnamespace=to_regnamespace('radio')
      and g.tgname='viewer_link_protect' and g.tgenabled in ('O','A')) as 연동보호트리거,
  -- 활성 링크는 채널당 1개 — 부분 유일 인덱스가 서 있어야 §3 의 유일성이 물리다.
  (select count(*) from pg_indexes
    where schemaname='radio' and indexname='viewer_link_active') as 연동활성유일,
  -- ── c11: engine.skills 첫 시드(문항 팩 스킬표 30 · skills.v1) — 0이면 승격이 전건 거절된다.
  (select count(*) from engine.skills) as 스킬시드수
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
             and 스킬시드수=30
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260812130000'
              and (select checksum from 현재이력)='ff8a8b3f2874bf6c120dd7911ee22a1ffad8d323131bc74db0a8593aac356f04' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·0·0·22·0·6·6·0·0·0·1·1·1·30 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 순서 — 이 조각을 붓기 «전에» radio-promote 재배포(수리판 8f0e35f 이후)가 끝나 있어야
--    한다. 잡은 부은 순간부터 매시 발화한다: Fn 미배포면 매시 404 가 쌓이고, 옛 판이 라이브면
--    겹침 링크 오귀속·무검증 스냅샷이 불변 행으로 앉는다(반박 ⑤·③의 그 결함).
--    배포 확인 = node tools/원격배포.js supabase/functions/radio-promote (다름 0 확인 뒤 붓는다).
-- ① 이 조각은 표·열·제약·트리거를 하나도 안 바꾼다 — 위 판정 블록의 카운터는 c11 조각과
--    같은 기대값 그대로다(현재이력의 버전·checksum 만 이 조각을 가리킨다).
-- ② 스케줄러 잡 실측 — 부은 뒤 한 줄로 (1 이어야 한다):
--      select count(*) from cron.job where jobname = 'radio-promote-hourly';
--    ⚠ 리허설은 머리말 ⛔ 정책대로 일부러 안 붓는다 — 확인 쿼리가 「현재버전=20260812120000」
--      으로 ❌ 를 내면 고장이 아니라 그 정책이다(✅ 대상은 운영뿐).
-- ③ 🔴 운영에 부었으면 **같은 확인 절차에서** supabase/DB착지판.json 을 'c11' 로,
--    src/계약판.js 를 'c11' 로 한 커밋에 올린다 — 안 올리면 앱이 c10 을 선언할 뿐이라 서버는
--    받지만(안전 방향), 올리기 전 앱 빌드가 c11 어휘를 못 쓴다. tests/계약.test.js 가 짝을 묶는다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 한 개도 안 바꾼다 — c11 그대로).
--    ⚠ 이 줄은 마지막 조각이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    기대: broadcast_segment_kind_c11 · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11
/* 시즌 그릇 ①② — 나침반 답이 앉을 자리 + 시즌 경계
 *
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §3-1·§8·§9-0 (유호님 확정 6건 · 2026-08-12).
 * 이 조각이 세우는 것은 **구현 순서 ①②뿐**이다 — ③회고 화면·④`record_snapshot` 굳히기는
 * 「첫 시즌 종료 전」이고 **한 커밋**으로 서야 한다(설계 §8 · 나누면 첫 회고 행이 근거 없는
 * 판정이 된다). 그래서 `engine.season_review` 는 **여기서 안 만든다** — 자리를 미리 파 두면
 * 그 표가 빈 채로 「이미 있다」가 되어 ③④를 나누는 문이 열린다.
 *
 * 🔴 **파일 이름의 `_c11` 은 장식이 아니다** — Edge Function 넷이 계약판을 최신 조각 이름에서
 *   읽는다(`tests/마이그레이션이름.test.js`). 이 조각은 **계약을 안 바꾼다**: 새 값목록 0 ·
 *   `learning_events` 0 · 새 `event_type` 0 · 기존 engine 표 변경 0(FK 하나만 읽기로 건다).
 *   그래서 `radio_c10` 선례대로 c11 을 그대로 이어 쓴다(판을 올리면 그 순간 구앱이 426 이 된다).
 *
 * ■ 왜 지금인가 — **소급 불가** (설계 §2)
 *   회고는 「그때 학생이 스스로 뭐라고 말했나」와 「그 뒤 실기록」을 나란히 놓는 일이다.
 *   오른쪽은 사건이 쌓이면 다시 계산되지만 **왼쪽은 그날 안 물으면 영원히 빈칸**이다.
 *   🔴 시한은 개원일이 아니라 **첫 학생의 «입학일»** 이다 — 대외로 이미 「입학할 때, 그리고
 *      시즌마다 나침반 세션을 엽니다」로 약속 중이다(상담AI FAQ Q11 `확정: true`).
 *   📏 실측 2026-08-12: 두 저장소에 `compass`·`season` 구현 **0건**(약속문만 살아 있었다).
 *
 * ■ 왜 표가 «둘»인가 — 합치면 이 설계가 고발한 병이 된다 (설계 §3)
 *   시즌 «시작»에 학생이 선언한 것과 시즌 «끝»에 사람이 판정한 것은 시점·기록자·소급 성질이
 *   전부 다르다. 한 행에 두면 시작에 만든 행을 끝에 **덮어쓰게** 되고, 그게 정확히
 *   `learners.goal_track` 이 죽은 방식이다. 표를 가르는 것은 비용이 아니라 **덮어쓰기를
 *   원리상 못 하게 하는 장치**다.
 *   🔑 급소 낱말은 「갱신」이다 — 대외 문장의 「시즌마다 갱신됩니다」를 구현 규격으로 그대로
 *      옮기면 덮어쓰기가 된다. 규격 = **보이는 것은 최신 한 장, 남는 것은 전부**(시즌마다 새 행).
 *
 * ■ 시즌 경계의 정본은 달력이 아니라 **교재 1권**이다 (유호님 08-12 · 설계 §9-0)
 *   「교재 1권당 2달 걸리니 2달에 한 번씩 돌아보며 점검한다」 — 「2달」은 근사값이고 정본은
 *   교재다. 교재가 한 주 늦게 끝나면 시즌도 늦게 끝나야 한다.
 *   🚫 **코드에 시즌 주기 상수를 박지 않는다.** 확정값 2달은 `season` 행의 데이터이지 코드
 *      상수가 아니다 — 운영이 한 시즌을 늘리는 날 배포가 필요하면 그 설계가 진 것이다.
 *   🚫 달력으로 시즌 자동 생성.
 *
 * ■ 채우는 코드는 이 조각에 0줄이다 — 정직 표기
 *   생산자 = `functions/teach` 의 `compass/*` 두 경로이고 이 조각과 **같은 커밋**에 선다.
 *   「표가 섰다」를 「수집이 돈다」로 읽지 않는다(엔진도달 §5 확인 ③).
 *
 * 되돌림: drop table if exists engine.season_compass;
 *        drop table if exists engine.season;
 *        delete from engine.schema_migrations where version = '20260812140000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260812140000';
  migration_name constant text := '20260812140000_season_c11.sql';
  expected_checksum constant text := '2582bafc74dbe5e1337b4f2e8f6bf0ddf8f41ce0c3abf20e47cd9474143aac52'; -- migration-checksum
  base_version constant text := '20260812130000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c11 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  /* ① 시즌 경계 — **날짜 범위를 가진 행**. 주기는 데이터이지 상수가 아니다(§9-0).
   *
   * `ends_on is null` = 아직 안 끝난 시즌이다. 「교재를 아직 안 뗐다」가 정상 상태라
   *   미리 끝을 박지 않는다 — 박아 두면 교재가 늦어지는 날 운영이 DDL 을 고치게 된다.
   * `textbook` 이 이 표의 심장이다 — 시즌의 정의가 교재이므로, 그 칸이 비면 이 행은
   *   「달력으로 만든 시즌」이라는 뜻이 된다(그래서 not null). */
  create table if not exists engine.season (
    season_id  uuid primary key default gen_random_uuid(),
    code       text unique not null,          -- 사람이 부르는 이름표('2027-S1') — 비밀 아님
    textbook   text not null,                 -- 교재 1권 = 시즌의 정본 단위(§9-0)
    starts_on  date not null,
    ends_on    date,                          -- null = 진행 중(교재를 아직 안 뗐다)
    schema_ver text not null,
    constraint season_dates_c11 check (ends_on is null or ends_on >= starts_on),
    /* 🔑 겹침을 **물리로** 막는다 — 안 막으면 「오늘이 속한 시즌」 조회가 여러 행을 물고,
     *   그때 나침반 행이 어느 시즌에 붙는지가 조회 순서에 달린다(조용히 틀리는 자리다).
     *   범위형 gist 는 확장 없이 돈다(btree_gist 불필요 — 동등 열을 섞지 않았다). */
    constraint season_no_overlap_c11
      exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
  );
  comment on table engine.season is
    '시즌 경계 — 정본은 달력이 아니라 교재 1권(시즌회고_설계 §9-0 · 유호님 확정 2026-08-12). 주기는 이 행의 데이터이지 코드 상수가 아니다.';

  /* ② 나침반 — 시즌 «시작»에 학생이 선언한 것. 학생×시즌 1행.
   *
   * `answers` 는 문항키→서술의 jsonb 다. **키는 코드값**이고 화면 글자는 라벨이라
   *   문구를 다듬어도 쌓인 답이 안 흔들린다(`lib/나침반문항.js` · 가입문항 규약 승계).
   * `self_in_5y_changed` 는 시즌 회차의 [그대로]/[바꿀래]다 — `redirected` 판정의 **직접**
   *   근거. 값이 「그대로」여도 답을 복사해 담으므로(행마다 자족), 「안 바꿨다」를 값 비교로
   *   추측하지 않는다. `null` = 안 물었다(입학 행).
   * `goal_track_at_open` 은 그날의 3값 목적이다. `goal_snapshot` 으로 못 대신한다 —
   *   그 칸은 사건에 붙으므로 나침반 날 그 학생의 사건이 0이면 그날의 목적을 가리키는 행이
   *   아예 없다(신입이 특히 그렇다).
   *   ⚠ CHECK 를 **안 건다**: `learners.goal_track` 에도 없다(c6 실측). 여기만 걸면 계약이
   *     4번째 값을 내는 날 이 표만 거절해 통로가 조용히 죽는다 — 어휘 정본은 계약 JSON 이다.
   * `recorded_by` 는 **누가 적었나**다. 나침반은 강사가 촉진하는 세션이라 대필이 정상
   *   경로다(설계 §3-1). v1 의 유일한 통로는 강사이므로 값은 `staff_id` 문자열이고,
   *   학생 본인 통로가 서는 날 `'self'` 가 같은 칸에 들어온다 — 그래서 uuid 가 아니라 text 다
   *   (그날 열을 새로 파면 옛 행과 새 행이 다른 칸을 쓰게 된다). */
  create table if not exists engine.season_compass (
    compass_id         bigint generated always as identity primary key,
    learner_id         uuid not null references engine.learners(learner_id) on delete restrict,
    season_id          uuid not null references engine.season(season_id),
    answers            jsonb not null,
    self_in_5y_changed boolean,               -- null = 안 물었다(입학 행)
    goal_track_at_open text,
    recorded_by        text not null,         -- staff_id (대필) · 뒤에 'self'
    recorded_at        timestamptz not null default now(),
    schema_ver         text not null,
    constraint season_compass_once_c11 unique (learner_id, season_id),
    /* 🔴 **문항 묶음을 DB 가 지킨다**(c6 §10 「문서에만 있던 불변을 DB 가 지킨다」 축).
     *   두 회차의 키 집합이 정확히 이 둘 중 하나여야 한다 — 안 걸면 오타 키(`why_learn`)가
     *   그대로 앉고, 병치 쿼리는 그 학생만 빈칸으로 그린다. 실패가 「데이터가 없다」의
     *   얼굴로 오는 자리다.
     *   🔑 `?&`(전부 있나) + `-`(남는 키 0)로 **정확히 그 집합**을 못박는다. CHECK 안에는
     *     서브쿼리를 못 쓰므로 `jsonb_object_keys` 로 세는 판은 애초에 못 쓴다.
     *   🔑 `self_in_5y_changed` 의 null 여부가 회차를 가른다 — 회차를 따로 열로 두면 같은
     *     판정이 두 칸에 앉아 갈린다(가드 맹점 ④ · 목록은 하나에서 파생시킨다). */
    constraint season_compass_answers_c11 check (
      (
        self_in_5y_changed is null
        and answers ?& array['why_learning', 'self_in_5y', 'topik_use', 'season_goal']
        and answers - array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] = '{}'::jsonb
      ) or (
        self_in_5y_changed is not null
        and answers ?& array['self_in_5y', 'season_goal']
        and answers - array['self_in_5y', 'season_goal'] = '{}'::jsonb
      )
    )
  );
  comment on table engine.season_compass is
    '나침반 — 시즌 시작에 학생이 스스로 선언한 것(시즌회고_설계 §3-1). 회고가 병치할 왼쪽이자 유일한 소급 불가 재료. 시즌마다 새 행(🚫덮어쓰기).';
  create index if not exists season_compass_learner_recorded
    on engine.season_compass (learner_id, recorded_at desc);

  /* 🔴 삭제만 막는다 — **개서는 막지 않는다.**
   *   막아야 할 것은 「지난 시즌 답이 이번 시즌 저장에 덮여 사라지는 것」인데, 그건
   *   `(learner_id, season_id)` 유일키가 이미 원리상 막는다(다른 시즌 = 다른 행).
   *   남은 위험은 **행이 통째로 사라지는 것**이고 그건 소급이 안 된다 — 그래서 delete 만.
   *   ⚠ update 를 같이 막으면 강사가 촉진 세션 «그 자리»에서 오타를 못 고친다. 그때 남는
   *     통로는 「행을 지우고 다시 넣기」인데 그것이 곧 delete 라, 막는 순간 우회가 정상
   *     통로가 된다(F103 축 — 따를 수 없는 처방은 우회를 정상 통로로 만든다).
   *   ⏭ 확정 시각을 따로 두어 「확정 뒤 개서 금지」로 좁히는 판은 ③회고 조각의 몫이다
   *     (지금 파 두면 ③④를 나누는 문이 열린다 · 위 머리말). */
  create or replace function engine.season_compass_protect() returns trigger
    language plpgsql as $protect$
  begin
    raise exception '나침반 행은 삭제하지 않는다 — 소급이 원리상 불가능하다(시즌회고_설계 §2)';
  end
  $protect$;

  drop trigger if exists season_compass_protect on engine.season_compass;
  create trigger season_compass_protect
    before delete on engine.season_compass
    for each row execute function engine.season_compass_protect();

  /* engine 취급 그대로 — RLS 켜고 정책 0(전면 거부) · service_role 만 쓰기 · PostgREST 비노출.
   * 나중에 노출하는 날 잊어도 **닫힌 채로 실패한다**. */
  alter table engine.season          enable row level security;
  alter table engine.season_compass  enable row level security;

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
  ('season_compass','goal_track_at_open'), ('season_compass','recorded_by')
), 기대제약(n) as (values
  ('learning_events_event_type_c11'), ('learning_events_task_type_c11'),
  ('submissions_task_format_c11'), ('submissions_translation_source_c11'),
  ('submissions_due_paired_c11'), ('corrections_verdict_c11'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c11'), ('staff_role_c11'),
  ('learners_temp_password_paired_c11'),
  ('learning_events_correction_target_c11'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c11'), ('corrections_promotion_intent_c11'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c11'),
  -- 시즌 그릇(20260812140000) — 겹침 배제·날짜 순서·학생×시즌 유일·문항 묶음 + 고리 둘.
  --   유일키가 빠지면 같은 시즌에 두 행이 서고, 회고가 어느 것을 왼쪽으로 쓸지 모른다.
  ('season_no_overlap_c11'), ('season_dates_c11'),
  ('season_compass_once_c11'), ('season_compass_answers_c11'),
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000) — 행이 사라지는 것만 막는다(개서는 촉진 세션의 정상 통로)
  ('season_compass_protect')
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
  -- 🔴 존재만 묻지 않는다. 꺼진 트리거는 pg_trigger 에 행이 그대로 남고 tgenabled 만
  --    'D'(꺼짐)·'R'(복제본에서만)이 된다 — 안 잰 것을 통과로 내면 그건 확인이 아니다.
  select e.n,
         (select g.tgenabled from pg_trigger g
            join pg_class r on r.oid=g.tgrelid
           where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n) as 상태
    from 기대트리거 e
), 빠진트리거 as (
  -- 상태를 이름 옆에 붙인다 — 「없음」은 판을 부어야 하고 「꺼짐」은 enable 한 줄이라 처방이 갈린다.
  -- ⚠ 상태::text 캐스트가 필수다. tgenabled 는 "char"(1바이트) 타입이라 || 후보가 갈려
  --    operator is not unique 로 쿼리 전체가 안 돈다 — 파일 층 검사는 이걸 못 본다(2026-08-07 실측).
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
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 3 → **4**: 시즌 그릇이 `season_compass.learner_id` 에 restrict 를 하나 더 건다.
  --    학생 행이 지워지면 그 학생의 나침반이 함께 사라지는데, 그건 소급이 안 된다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('engine') and contype='f'
      and confrelid=to_regclass('engine.learners') and confdeltype='r') as 삭제차단,
  (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typnamespace=to_regnamespace('engine')
      and t.typname='job_status' and e.enumlabel='failed') as 실패상태,
  (select count(*) from pg_policies
    where schemaname='engine' and tablename='schema_migrations') as 이력정책,
  -- 검수자 판(20260807190000 · 절단문서 ②-17): 뷰가 있고 옛 정책이 없어야 둘 다 맞다.
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue') as 검수뷰,
  (select count(*) from pg_policies
    where schemaname='engine' and policyname='inspector_queue_submissions') as 옛검수정책,
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출,
  -- 마감(20260808010000): c10 이 선 뒤에 만들어진 배정만 센다 — 옛 행의 마감은 아무도 모른다.
  (select count(*) from engine.submissions s
     join engine.learning_events e on e.event_id = s.event_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and s.occurred_at >= (select applied_at from engine.schema_migrations
                             where version = '20260808010000')) as 마감없는배정,
  -- 분모의 정본은 task.assigned 사건 하나다 — daily_activity.expected 에 값이 들어오면 빨개진다.
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염,
  -- 폐기 사유(20260809090000): 그 조각이 선 뒤에 갱신된 job 만 센다.
  (select count(*) from engine.pipeline_jobs j
    where j.status = 'discarded' and j.discard_reason is null
      and j.updated_at >= (select applied_at from engine.schema_migrations
                            where version = '20260809090000')) as 폐기사유없는폐기,
  -- 검수 판이 올라간 판인지(20260809050000): 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문,
  -- ── 라디오 원장(20260811160000 · radio 스키마) ──
  (select count(*) from pg_tables where schemaname='radio') as 라디오표수,
  (select count(*) from pg_tables where schemaname='radio' and rowsecurity) as 라디오RLS수,
  (select count(*) from pg_policies where schemaname='radio') as 라디오정책수,
  (select count(*) from 대상역할 r cross join 라디오테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','radio',t.t), p.p)) as 라디오새는권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('radio'), 'USAGE')) as 라디오새는스키마,
  -- c11 이 접미를 갈았다 — 옛 이름을 세면 「적용 전」과 「적용 후」가 같은 0 으로 보인다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('radio')
      and conname='broadcast_segment_kind_c11') as 라디오kind제약,
  -- 링크 보호 트리거 — 존재가 아니라 켜짐을 센다(engine 트리거상태와 같은 이유).
  (select count(*) from pg_trigger g
     join pg_class c2 on c2.oid=g.tgrelid
    where c2.relnamespace=to_regnamespace('radio')
      and g.tgname='viewer_link_protect' and g.tgenabled in ('O','A')) as 연동보호트리거,
  -- 활성 링크는 채널당 1개 — 부분 유일 인덱스가 서 있어야 §3 의 유일성이 물리다.
  (select count(*) from pg_indexes
    where schemaname='radio' and indexname='viewer_link_active') as 연동활성유일,
  -- ── c11: engine.skills 첫 시드(문항 팩 스킬표 30 · skills.v1) — 0이면 승격이 전건 거절된다.
  (select count(*) from engine.skills) as 스킬시드수
)
select case when 테이블수=13 and RLS켜짐=13 and 정책수=7
              and 새는테이블권한=0 and 새는스키마권한=0 and 삭제차단=4 and 실패상태=1
              and 이력정책=0 and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
              and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
              and 검수판열=22 and 검수판원문=0
              and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
              and 라디오새는권한=0 and 라디오새는스키마=0 and 라디오kind제약=1
              and 연동보호트리거=1 and 연동활성유일=1 and 스킬시드수=30
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260812140000'
              and (select checksum from 현재이력)='2582bafc74dbe5e1337b4f2e8f6bf0ddf8f41ce0c3abf20e47cd9474143aac52' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 13·13·7·0·0·4·1·0·0·1·0·0·0·0·22·0·6·6·0·0·0·1·1·1·30 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 c11 두 조각(20260812120000·20260812130000) «뒤»에만 선다.
--    그 둘은 지금 유호님 승인 대기라, 이 조각도 같은 승인에 얹혀 한 번에 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 2 · RLS 2 · 정책 0 — 위 판정 블록의 `테이블수`·`RLS켜짐` 이 11 → **13** 으로 오른다.
--    정책은 안 늘린다: engine 취급 그대로 전면 거부이고, 쓰기는 `functions/teach` 하나를 지난다.
-- ② `삭제차단` 이 3 → **4** 다 — `season_compass.learner_id` 의 restrict 하나가 늘었다.
--    학생 행이 지워지면 그 학생의 나침반이 함께 사라지는데 **그건 소급이 안 된다.**
-- ③ 첫 시즌 행은 **운영이 손으로 연다**(교재 1권 단위 · 🚫 달력 자동 생성):
--      insert into engine.season(code, textbook, starts_on, schema_ver)
--      values ('2027-S1', '<교재 이름>', '2027-02-25', 'c11');
--    ⚠ `ends_on` 은 교재를 뗀 날 채운다 — 미리 박으면 늦어지는 날 DDL 을 고치게 된다.
--    ⚠ 이 행이 없으면 나침반 통로가 `SEASON_NOT_OPEN`(409) 으로 정직하게 멈춘다.
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 둘을 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    기대: broadcast_segment_kind_c11 · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11
/* 시즌 회고 ③④ — 사람이 판정한 것이 앉을 자리 + **굳힌 근거**
 *
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §3-2·§4·§5·§6 (유호님 확정 6건 · 2026-08-12).
 * ①②(`20260812140000_season_c11.sql`)가 왼쪽(나침반)을 세웠고, 이 조각이 오른쪽과 라벨을 세운다.
 *
 * 🔴 **③④는 한 커밋이다**(설계 §8 인수 조건) — 나누면 첫 회고 행이 **근거 없는 판정**이 된다.
 *   그래서 이 조각·통로·화면·회귀가 같은 커밋에 있다. 표만 먼저 파 두는 것을 ①② 조각이
 *   일부러 안 한 이유도 그것이다(자리가 있으면 「이미 있다」가 되어 나누는 문이 열린다).
 *
 * 🔴 **파일 이름의 `_c11` 은 장식이 아니다** — Edge Function 넷이 계약판을 최신 조각 이름에서
 *   읽는다(`tests/마이그레이션이름.test.js`). 이 조각은 **계약을 안 바꾼다**: 새 값목록 0 ·
 *   `learning_events` 0 · 새 `event_type` 0 · 기존 engine 표 변경 0.
 *   그래서 `radio_c10`·`season_c11` 선례대로 c11 을 이어 쓴다(판을 올리면 구앱이 426 이 된다).
 *
 * ■ 왜 근거를 «굳히나» — 창 30일이 판정을 배신한다 (설계 §4)
 *   `학습자상태.v6` 은 창 30일이고 시즌은 2달이다. 회고 시점에 그냥 조회하면 8축이 덮는 것은
 *   시즌의 **뒤 절반**뿐이고, 한 달 뒤 다시 조회하면 창이 밀려 **다른 숫자**가 나온다.
 *   「가까워졌다」고 적힌 행 옆에 나중에 조회한 숫자를 붙이면 그 숫자는 **그 판정을 낸 사람이
 *   본 적 없는 숫자**다 — 판정과 근거가 갈리면 판정이 근거를 잃는다.
 *   → `record_snapshot` 은 회고를 **연 그 순간**에 한 번 쓰이고 그 뒤로 **절대 안 바뀐다**
 *     (아래 `season_review_freeze` 트리거가 물리로 막는다).
 *
 * ■ 왜 라벨과 근거가 «같은 행»인가 (설계 §7)
 *   성향 8축은 「지금 어떤가」만 알고 **부호(sign)를 모른다** — 「그게 이 학생에게 좋은
 *   방향이었나」를 아는 것은 사람뿐이고, 사람이 그걸 말하는 자리는 회고 하나뿐이다.
 *   특징(`record_snapshot`)과 라벨(`verdict`)이 갈라져 있으면 나중에 짝을 못 맞추고
 *   (창이 밀리므로 **원리상** 못 맞춘다), 그러면 이 그릇은 예쁜 화면으로 끝나고
 *   엔진에는 한 방울도 안 닿는다. 그게 이 설계의 실패 모드다.
 *
 * ■ 판정이 «3갈래»인 이유 (설계 §5)
 *   2갈래면 목적 변경이 「멀어짐」으로 접히고 엔진이 **「학생이 목적을 바꾸는 것 = 나쁜 신호」**
 *   를 배운다 — 철학 Ⅱ-4(목적 변경은 정상 경로)를 정면으로 뒤집는 학습이 조용히 일어난다.
 *
 * ■ 판정칸이 «둘»인 이유 — 학생 먼저, 강사 다음 (설계 §7 도전안 · ✅유호님 채택 08-12)
 *   강사만 판정하면 회고는 성적표가 되고, 학생만 판정하면 근거가 없다. **둘이 갈리는 행이
 *   가장 값진 신호**다(`자기인식축`의 유일한 대조군).
 *   🔴 순서가 규격이다 — 강사 판정을 보고 학생이 고르면 그 칸은 대조군이 아니라 **메아리**가
 *      된다. 화면 순서로만 두면 언젠가 갈리므로 **DB 가 막는다**: `verdict` 가 이미 있는 행에
 *      `verdict_by_self` 를 새로 쓰거나 고치는 것을 트리거가 거절한다.
 *   🔑 `verdict_by_self` 는 **null 허용**이다 — 학생이 안 눌러도 강사 판정은 진행된다
 *      (필수로 걸면 한 명이 안 눌러 그 시즌 라벨이 통째로 안 생기고, **회고는 밀리는 순간
 *      라벨 0**이다). 그리고 null(안 눌렀다)과 「눌렀는데 강사와 같다」는 **다른 값**이다.
 *
 * ■ 개서·삭제 판정 — ①② 조각이 이 조각의 몫으로 남긴 자리
 *   ① `record_snapshot`·`learner_id`·`season_id`·`opened_at` = **불변**(위 §4).
 *   ② `verdict_by_self` = 강사 판정 «전»에만 쓴다(위 메아리).
 *   ③ `verdict`·`note` = **개서 허용**. 강사가 버튼을 잘못 눌렀을 때 남는 통로가 「행을 지우고
 *      다시 넣기」밖에 없으면 그 우회가 정상 통로가 된다(F103). 삭제는 막으므로 그 우회는
 *      애초에 없다 — 그래서 고치는 문을 열어 둔다. 고친 사실은 `decided_at` 이 갱신되고
 *      `staff_access_log` 에 매번 한 줄 남는다.
 *   ④ 삭제 = 전면 금지(나침반과 같다 — 라벨은 사람 손에서만 나오므로 소급이 안 된다).
 *
 * ■ 채우는 코드는 이 조각에 0줄이다 — 정직 표기
 *   생산자 = `functions/teach` 의 `retro/*` 세 경로이고 이 조각과 **같은 커밋**에 선다.
 *   「표가 섰다」를 「라벨이 쌓인다」로 읽지 않는다(엔진도달 §5 확인 ③).
 *   ⑤라벨→엔진 배선은 **시즌 2 이후**다(설계 §8) — 행이 몇 개 쌓인 뒤에 한다.
 *
 * 되돌림: drop table if exists engine.season_review;
 *        delete from engine.schema_migrations where version = '20260812170000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260812170000';
  migration_name constant text := '20260812170000_season_review_c11.sql';
  expected_checksum constant text := '36472be667bfecc8f02b4964b84839509ecc167ac90acede34a4eff5fa72b0ff'; -- migration-checksum
  base_version constant text := '20260812140000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c11 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  /* 시즌 «끝»에 사람이 판정한 것 + 그 판정이 본 근거. 학생×시즌 1행.
   *
   * `record_snapshot` = `axes_전반`·`axes_후반`·`season_totals` 세 층 + `추정판` + 창 경계
   *   (설계 §4-1·§4-2 · 조립은 `lib/회고.js` 하나가 진다).
   *   🔑 not null 이다 — 「근거 없이 먼저 판정만 적어 두기」를 원리상 못 하게 한다.
   * `opened_by`/`decided_by` 는 **text** 다(uuid 아님). 나침반 `recorded_by` 와 같은 사유 —
   *   v1 의 통로는 강사뿐이라 값은 `staff_id` 문자열이고, 학생 본인 통로가 서는 날 'self' 가
   *   같은 칸에 들어온다(그날 열을 새로 파면 옛 행과 새 행이 다른 칸을 쓰게 된다).
   * ⚠ `verdict_by_self` 에 「누가·언제」를 안 둔다 — v1 은 촉진 세션 한 화면에서 학생이
   *   그 자리에 누르는 것이라 주체가 학생 본인 하나뿐이고, 시각은 `opened_at`~`decided_at`
   *   사이로 이미 좁다. 통로가 갈리는 날(학생 앱에서 따로 누르는 날) 열을 더한다. */
  create table if not exists engine.season_review (
    review_id       bigint generated always as identity primary key,
    learner_id      uuid not null references engine.learners(learner_id) on delete restrict,
    season_id       uuid not null references engine.season(season_id),
    record_snapshot jsonb not null,
    verdict         text,                    -- null = 아직 강사가 안 눌렀다
    verdict_by_self text,                    -- null = 학생이 안 눌렀다(건너뛰어도 진행한다)
    note            text,
    opened_by       text not null,
    opened_at       timestamptz not null default now(),
    decided_by      text,
    decided_at      timestamptz,
    schema_ver      text not null,
    constraint season_review_once_c11 unique (learner_id, season_id),
    /* 🔴 세 값의 정본은 `lib/회고.js` 의 `판정목록` 이다. 두 층이 같은 파일을 못 쓰므로
     *   (하나는 JS·하나는 DDL) 사본을 피할 수 없고, 없앨 수 없는 사본은 기계에 물린다 —
     *   `tests/회고.test.js` 가 이 CHECK 의 리터럴과 lib 을 대조한다. */
    constraint season_review_verdict_c11
      check (verdict is null or verdict in ('closer', 'same', 'redirected')),
    constraint season_review_self_c11
      check (verdict_by_self is null or verdict_by_self in ('closer', 'same', 'redirected')),
    /* 판정·사유·주체·시각은 **한 벌로** 선다. 갈라 두면 「판정은 있는데 언제 누가 했는지
     *   모르는 행」이 서고, 그 행은 라벨로 못 쓴다(오염을 가려낼 방법이 없다). */
    constraint season_review_decided_c11 check (
      (verdict is null and note is null and decided_by is null and decided_at is null)
      or (verdict is not null and decided_by is not null and decided_at is not null
          and note is not null and btrim(note) <> '')
    )
  );
  comment on table engine.season_review is
    '시즌 회고 — 사람이 판정한 라벨 + 그 판정이 본 근거를 굳힌 것(시즌회고_설계 §3-2·§4). 엔진의 유일한 「부호」 생산자. record_snapshot 은 연 순간 고정(🚫재계산).';
  create index if not exists season_review_season_decided
    on engine.season_review (season_id, decided_at);

  /* 🔴 **굳힌 것은 안 바뀐다** — 이 트리거가 없으면 위 §4 의 보장이 프로즈로만 남는다.
   *   프로즈보다 기계 강제로 막을 수 있는 규칙은 기계로 옮긴다.
   *   🔑 `verdict_by_self` 를 **강사 판정 뒤에** 못 쓰게 하는 것도 여기다 — 화면 순서로만
   *     두면 통로가 하나 더 서는 날 조용히 갈리고, 갈린 쪽은 「값이 있다」로 보인다. */
  create or replace function engine.season_review_freeze() returns trigger
    language plpgsql as $freeze$
  begin
    if new.record_snapshot is distinct from old.record_snapshot then
      raise exception '굳힌 근거는 바뀌지 않는다 — 판정과 근거가 갈리면 판정이 근거를 잃는다(시즌회고_설계 §4)';
    end if;
    if new.learner_id is distinct from old.learner_id
       or new.season_id is distinct from old.season_id
       or new.opened_at is distinct from old.opened_at
       or new.opened_by is distinct from old.opened_by then
      raise exception '회고 행의 대상·연 시각은 바뀌지 않는다 — 굳힌 근거가 다른 시즌의 것이 된다';
    end if;
    if old.verdict is not null and new.verdict_by_self is distinct from old.verdict_by_self then
      raise exception '학생 판정은 강사 판정 «전»에만 적는다 — 뒤에 적으면 대조군이 아니라 메아리다(시즌회고_설계 §7)';
    end if;
    return new;
  end
  $freeze$;

  drop trigger if exists season_review_freeze on engine.season_review;
  create trigger season_review_freeze
    before update on engine.season_review
    for each row execute function engine.season_review_freeze();

  /* 삭제 금지 — 나침반과 같다. 라벨은 사람 손에서만 나오므로 사라지면 소급이 안 된다.
   * ⚠ 개서를 «같이» 막지 않는 이유는 머리말 ③ 참조(막으면 우회가 정상 통로가 된다 · F103). */
  create or replace function engine.season_review_protect() returns trigger
    language plpgsql as $protect$
  begin
    raise exception '회고 행은 삭제하지 않는다 — 사람이 낸 라벨은 소급이 안 된다(시즌회고_설계 §7)';
  end
  $protect$;

  drop trigger if exists season_review_protect on engine.season_review;
  create trigger season_review_protect
    before delete on engine.season_review
    for each row execute function engine.season_review_protect();

  /* engine 취급 그대로 — RLS 켜고 정책 0(전면 거부) · service_role 만 쓰기 · PostgREST 비노출. */
  alter table engine.season_review enable row level security;

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
  --   갈라 두면 창이 밀려 원리상 짝을 못 맞추고, 그릇은 화면으로 끝나고 엔진엔 안 닿는다.
  ('season_review','record_snapshot'), ('season_review','verdict'),
  ('season_review','verdict_by_self'), ('season_review','note'),
  ('season_review','opened_by'), ('season_review','opened_at'),
  ('season_review','decided_by'), ('season_review','decided_at')
), 기대제약(n) as (values
  ('learning_events_event_type_c11'), ('learning_events_task_type_c11'),
  ('submissions_task_format_c11'), ('submissions_translation_source_c11'),
  ('submissions_due_paired_c11'), ('corrections_verdict_c11'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c11'), ('staff_role_c11'),
  ('learners_temp_password_paired_c11'),
  ('learning_events_correction_target_c11'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c11'), ('corrections_promotion_intent_c11'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c11'),
  -- 시즌 그릇(20260812140000) — 겹침 배제·날짜 순서·학생×시즌 유일·문항 묶음 + 고리 둘.
  --   유일키가 빠지면 같은 시즌에 두 행이 서고, 회고가 어느 것을 왼쪽으로 쓸지 모른다.
  ('season_no_overlap_c11'), ('season_dates_c11'),
  ('season_compass_once_c11'), ('season_compass_answers_c11'),
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey'),
  -- 시즌 회고(20260812170000) — 판정 3갈래 둘 + 「판정·사유·주체·시각 한 벌」 + 고리 둘.
  --   값목록이 빠지면 오타 라벨('closser')이 그대로 앉고 엔진은 그걸 4번째 갈래로 배운다.
  ('season_review_once_c11'), ('season_review_verdict_c11'),
  ('season_review_self_c11'), ('season_review_decided_c11'),
  ('season_review_learner_id_fkey'), ('season_review_season_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000) — 행이 사라지는 것만 막는다(개서는 촉진 세션의 정상 통로)
  ('season_compass_protect'),
  -- 회고(20260812170000) — 굳힌 근거 불변 + 학생 판정은 강사 「전」에만 + 삭제 금지.
  --   freeze 가 꺼지면 재계산한 숫자로 옛 판정을 덮어쓸 수 있고 그건 조용히 통과한다.
  ('season_review_freeze'), ('season_review_protect')
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
  -- 🔴 존재만 묻지 않는다. 꺼진 트리거는 pg_trigger 에 행이 그대로 남고 tgenabled 만
  --    'D'(꺼짐)·'R'(복제본에서만)이 된다 — 안 잰 것을 통과로 내면 그건 확인이 아니다.
  select e.n,
         (select g.tgenabled from pg_trigger g
            join pg_class r on r.oid=g.tgrelid
           where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n) as 상태
    from 기대트리거 e
), 빠진트리거 as (
  -- 상태를 이름 옆에 붙인다 — 「없음」은 판을 부어야 하고 「꺼짐」은 enable 한 줄이라 처방이 갈린다.
  -- ⚠ 상태::text 캐스트가 필수다. tgenabled 는 "char"(1바이트) 타입이라 || 후보가 갈려
  --    operator is not unique 로 쿼리 전체가 안 돈다 — 파일 층 검사는 이걸 못 본다(2026-08-07 실측).
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
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 4 → **5**: 회고가 `season_review.learner_id` 에 restrict 를 하나 더 건다.
  --    학생 행이 지워지면 그 학생의 라벨까지 사라지는데, 사람이 낸 라벨은 소급이 안 된다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('engine') and contype='f'
      and confrelid=to_regclass('engine.learners') and confdeltype='r') as 삭제차단,
  (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typnamespace=to_regnamespace('engine')
      and t.typname='job_status' and e.enumlabel='failed') as 실패상태,
  (select count(*) from pg_policies
    where schemaname='engine' and tablename='schema_migrations') as 이력정책,
  -- 검수자 판(20260807190000 · 절단문서 ②-17): 뷰가 있고 옛 정책이 없어야 둘 다 맞다.
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue') as 검수뷰,
  (select count(*) from pg_policies
    where schemaname='engine' and policyname='inspector_queue_submissions') as 옛검수정책,
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출,
  -- 마감(20260808010000): c10 이 선 뒤에 만들어진 배정만 센다 — 옛 행의 마감은 아무도 모른다.
  (select count(*) from engine.submissions s
     join engine.learning_events e on e.event_id = s.event_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and s.occurred_at >= (select applied_at from engine.schema_migrations
                             where version = '20260808010000')) as 마감없는배정,
  -- 분모의 정본은 task.assigned 사건 하나다 — daily_activity.expected 에 값이 들어오면 빨개진다.
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염,
  -- 폐기 사유(20260809090000): 그 조각이 선 뒤에 갱신된 job 만 센다.
  (select count(*) from engine.pipeline_jobs j
    where j.status = 'discarded' and j.discard_reason is null
      and j.updated_at >= (select applied_at from engine.schema_migrations
                            where version = '20260809090000')) as 폐기사유없는폐기,
  -- 검수 판이 올라간 판인지(20260809050000): 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문,
  -- 🔴 회고(20260812170000): 라벨이 있는데 근거가 「비어 있는」 행 — 0이어야 한다.
  --    not null 은 「칸이 있다」만 보장하고 '{}' 는 통과시킨다. 근거 없는 라벨은 엔진으로
  --    그대로 흘러 들어가고, 그 오염은 나중에 가려낼 방법이 없다.
  (select count(*) from engine.season_review
    where verdict is not null
      and (record_snapshot = '{}'::jsonb
           or record_snapshot -> 'axes_전반' is null
           or record_snapshot -> 'axes_후반' is null)) as 근거없는라벨,
  -- ── 라디오 원장(20260811160000 · radio 스키마) ──
  (select count(*) from pg_tables where schemaname='radio') as 라디오표수,
  (select count(*) from pg_tables where schemaname='radio' and rowsecurity) as 라디오RLS수,
  (select count(*) from pg_policies where schemaname='radio') as 라디오정책수,
  (select count(*) from 대상역할 r cross join 라디오테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','radio',t.t), p.p)) as 라디오새는권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('radio'), 'USAGE')) as 라디오새는스키마,
  -- c11 이 접미를 갈았다 — 옛 이름을 세면 「적용 전」과 「적용 후」가 같은 0 으로 보인다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('radio')
      and conname='broadcast_segment_kind_c11') as 라디오kind제약,
  -- 링크 보호 트리거 — 존재가 아니라 켜짐을 센다(engine 트리거상태와 같은 이유).
  (select count(*) from pg_trigger g
     join pg_class c2 on c2.oid=g.tgrelid
    where c2.relnamespace=to_regnamespace('radio')
      and g.tgname='viewer_link_protect' and g.tgenabled in ('O','A')) as 연동보호트리거,
  -- 활성 링크는 채널당 1개 — 부분 유일 인덱스가 서 있어야 §3 의 유일성이 물리다.
  (select count(*) from pg_indexes
    where schemaname='radio' and indexname='viewer_link_active') as 연동활성유일,
  -- ── c11: engine.skills 첫 시드(문항 팩 스킬표 30 · skills.v1) — 0이면 승격이 전건 거절된다.
  (select count(*) from engine.skills) as 스킬시드수
)
select case when 테이블수=14 and RLS켜짐=14 and 정책수=7
              and 새는테이블권한=0 and 새는스키마권한=0 and 삭제차단=5 and 실패상태=1
              and 이력정책=0 and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
              and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
              and 검수판열=22 and 검수판원문=0 and 근거없는라벨=0
              and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
              and 라디오새는권한=0 and 라디오새는스키마=0 and 라디오kind제약=1
              and 연동보호트리거=1 and 연동활성유일=1 and 스킬시드수=30
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260812170000'
              and (select checksum from 현재이력)='36472be667bfecc8f02b4964b84839509ecc167ac90acede34a4eff5fa72b0ff' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 14·14·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·6·6·0·0·0·1·1·1·30 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260812140000_season_c11.sql` «뒤»에만 선다(base_version).
--    그 조각과 c11 두 조각이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 1 · RLS 1 · 정책 0 — `테이블수`·`RLS켜짐` 이 13 → **14** 로 오른다.
--    정책은 안 늘린다: engine 취급 그대로 전면 거부이고, 쓰기는 `functions/teach` 하나를 지난다.
-- ② `삭제차단` 이 4 → **5** 다 — `season_review.learner_id` 의 restrict 하나가 늘었다.
-- ③ 트리거 둘이 늘었다 — `season_review_freeze`(굳힌 근거 불변 + 학생 판정 순서)와
--    `season_review_protect`(삭제 금지). **켜짐**까지 센다(꺼진 트리거는 행이 그대로 남는다).
-- ④ 첫 회고는 나침반 행이 있어야 열린다 — 통로가 그 학생의 «나침반이 있는데 회고가 아직
--    확정 안 된 가장 오래된 시즌»을 고른다. 없으면 409 `RETRO_NOT_DUE` 로 정직하게 멈춘다.
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 셋을 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    기대: broadcast_segment_kind_c11 · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11
/* 가입 1회 문항 세 칸의 값목록을 **DB 로 내린다** — 코드에만 살아 있던 규칙의 마지막 구멍
 *
 * 정본 = `lib/가입문항.js`(값목록) · L0 §9-2 `learners` 줄 · appsscript 메모리
 *        `collection-axes-recheck-0812`(유호님 지시 2026-08-12 「지역별 출신 칸 … 앞으로도
 *        이런 방향으로 디테일하게 단단하게」).
 *
 * ■ 무엇이 열려 있었나 (2026-08-12 실측)
 *   `learners.home_aimag`·`gender`·`goal_track` 은 c6(`20260806150000`)에서 **`text` 로만** 섰다.
 *   값목록은 `lib/가입문항.js` 한 곳에 있고, 그 파일 머리말이 자유 입력을 이렇게 금지한다:
 *       「같은 아이막이 열 가지 표기로 쌓이면 이 칸의 존재 이유(「지역 억양 편차의 유일한
 *         축」)가 그 자리에서 죽는다」
 *   그런데 그 금지가 **앱 화면에만** 살아 있었다. 앱이 아닌 통로 — SQL 콘솔·리허설 도구·
 *   명부 적재·앞으로 설 다른 클라이언트 — 로 들어오는 값은 아무도 안 막는다. `text` 는
 *   'ulaanbaatar' 도 'Ulaanbaatar' 도 'УБ' 도 'ub' 도 똑같이 받는다.
 *   🔴 **섞이면 소급 복원이 안 된다** — 어느 표기가 어느 아이막이었는지는 나중에 아무도
 *   못 정한다(사람이 손으로 매핑하는 순간 그건 복원이 아니라 추정이다).
 *
 * ■ 왜 CHECK 인가 — 프로즈로 막을 수 있는 규칙은 기계로 옮긴다
 *   화면 검사(`답검사`)는 **그 화면을 지나는 값만** 본다. 이 칸들이 지켜야 할 것은 「학생이
 *   무엇을 눌렀나」가 아니라 「이 열에 무엇이 앉는가」라, 지키는 자리도 열이어야 맞다.
 *   화면 검사를 없애는 것이 아니라 **밑에 한 겹 더** 까는 것이다(앱은 어느 칸이 틀렸는지
 *   말해 줘야 하고, DB 는 그게 뚫려도 안 앉게 해야 한다).
 *
 * ■ 왜 null 을 허용하나 — null 은 값이 아니라 **뜻**이다
 *   ① c6 이전 등록분과 명부 적재분은 세 칸이 영원히 null 이다. not null 로 걸면 이 판이
 *      그 행들 때문에 아예 적용되지 않는다(적용 안 된 판은 아무것도 안 지킨다).
 *   ② null = 「안 물어봤다」다. 「물었는데 안 밝혔다」는 `gender` 의 `undisclosed` 가 따로
 *      든다 — 가입문항 머리말이 그 둘을 일부러 가른 자리라, 여기서 접으면 그 판단이 죽는다.
 *
 * ■ 값목록이 두 곳에 적히는 대가와 그 처방
 *   정본은 `lib/가입문항.js` **하나**다. 이 파일은 그 사본이고, 사본은 갈라진다 — 갈라지는
 *   방향은 언제나 「통과」다(코드는 새 아이막을 알고 DB 는 모르면, 그 학생의 가입만 조용히
 *   거절된다). 그래서 회귀 `tests/가입문항.test.js` 가 **이 파일을 읽어** 세 목록을 글자
 *   단위로 대조한다. 한쪽만 고치면 CI 가 빨개진다(L0스키마 회귀가 계약 JSON ↔ DDL 에 쓰는
 *   것과 같은 형태 — 「목록은 하나에서 파생시키거나, 갈라지면 빨개지게 만든다」).
 *
 * ■ 계약을 안 바꾼다 — 그래서 `_c11` 을 이어 쓴다
 *   새 값목록 0 · 새 열 0 · 새 표 0 · `learning_events` 0. **이미 있는 값목록을 물리로
 *   내리는 것**뿐이라 앱이 보내는 것도 받는 것도 한 글자도 안 바뀐다. 판을 올리면 구앱이
 *   426 이 된다(`radio_c10`·`season_c11` 선례와 같은 판단).
 *
 * 되돌림: alter table engine.learners
 *           drop constraint if exists learners_home_aimag_c11,
 *           drop constraint if exists learners_gender_c11,
 *           drop constraint if exists learners_goal_track_c11;
 *        delete from engine.schema_migrations where version = '20260812180000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260812180000';
  migration_name constant text := '20260812180000_learner_profile_c11.sql';
  expected_checksum constant text := '049957bcecd4d42b63f9301e880e7c7bccad7dc711b6ae368c2b27ac140b0b06'; -- migration-checksum
  base_version constant text := '20260812170000';
  recorded_checksum text;
  어긋난행 text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c11 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  /* 🔴 **먼저 이미 앉아 있는 값을 본다.** CHECK 는 목록 밖 행이 하나라도 있으면 판 전체를
   *   중단시키는데, 그때 postgres 가 주는 말은 「제약 위반」뿐이라 **어느 학생의 어느 칸이
   *   무슨 값인지**를 안 알려준다. 그 상태에서 할 수 있는 일은 손으로 찾는 것뿐이고, 그건
   *   운영에서 유호님 앞이 막히는 자리다. 그래서 우리가 먼저 세어 이름을 대고 멈춘다.
   *   ⚠ 정정 SQL 을 여기서 자동으로 돌리지 않는다 — 목록 밖 표기를 어느 아이막으로 옮길지는
   *     **추정**이고, 추정으로 원본을 덮으면 그 학생의 값은 영원히 복원 불가가 된다. */
  select string_agg(format('%s=%L', 칸, 값), ', ' order by 칸, 값) into 어긋난행
    from (
      select 'home_aimag' as 칸, home_aimag as 값 from engine.learners
       where home_aimag is not null and home_aimag not in (
         'ulaanbaatar', 'arkhangai', 'bayan-olgii', 'bayankhongor', 'bulgan', 'darkhan-uul',
         'dornod', 'dornogovi', 'dundgovi', 'govi-altai', 'govisumber', 'khentii',
         'khovd', 'khovsgol', 'omnogovi', 'orkhon', 'ovorkhangai', 'selenge',
         'sukhbaatar', 'tov', 'uvs', 'zavkhan')
      union all
      select 'gender', gender from engine.learners
       where gender is not null and gender not in ('female', 'male', 'undisclosed')
      union all
      select 'goal_track', goal_track from engine.learners
       where goal_track is not null and goal_track not in ('study', 'work', 'culture')
    ) 밖;

  if 어긋난행 is not null then
    raise exception
      '목록 밖 값이 이미 앉아 있다: % — 무엇으로 옮길지는 추정이라 이 판이 대신 정하지 않는다(사람이 정한 뒤 다시 부어라)',
      어긋난행;
  end if;

  /* 아이막 22 = 21 아이막 + 울란바토르. 정본 = `lib/가입문항.js` `아이막`.
   * 🔑 묻는 것은 **「성장한 곳」**이지 지금 사는 곳이 아니다 — 억양이 굳는 자리라 그렇다.
   *   그래서 이 칸은 이사로 바뀌지 않고, 스냅샷이 아니라 `learners` 열로 서는 것이 맞다
   *   (`goal_track` 이 `goal_snapshot` 을 따로 필요로 한 것과 다른 성질이다). */
  /* ⚠ `drop constraint if exists` 로 열지 않는다 — 두 이유가 겹친다.
   *   ① 살아 있는 표에서 잠깐 제약이 없는 창이 생긴다(그 창에 들어온 값은 아무도 안 막는다).
   *   ② `tests/L0스키마.test.js` 는 「뒤 조각이 drop 한 이름은 최종 상태에 없다」로 세므로,
   *      drop 을 적으면 방금 세운 제약이 **없는 것으로 세어져** 회귀가 빨개진다(실측 08-12).
   *   재실행 안전은 위 checksum 조기 반환 + 아래 존재 검사 두 겹으로 든다. */
  if not exists (select 1 from pg_constraint
                  where connamespace = to_regnamespace('engine')
                    and conname = 'learners_home_aimag_c11') then
    alter table engine.learners add constraint learners_home_aimag_c11
      check (home_aimag is null or home_aimag in (
        'ulaanbaatar', 'arkhangai', 'bayan-olgii', 'bayankhongor', 'bulgan', 'darkhan-uul',
        'dornod', 'dornogovi', 'dundgovi', 'govi-altai', 'govisumber', 'khentii',
        'khovd', 'khovsgol', 'omnogovi', 'orkhon', 'ovorkhangai', 'selenge',
        'sukhbaatar', 'tov', 'uvs', 'zavkhan'));
  end if;

  /* 성별 — **분포 점검 전용**이고 학습 라벨이 아니다(L0 §9-2). 「이 엔진이 남학생 목소리에만
   * 강한가」를 묻는 계기판이라, `undisclosed` 가 한 무리로 세어져도 목적은 달성된다. */
  if not exists (select 1 from pg_constraint
                  where connamespace = to_regnamespace('engine')
                    and conname = 'learners_gender_c11') then
    alter table engine.learners add constraint learners_gender_c11
      check (gender is null or gender in ('female', 'male', 'undisclosed'));
  end if;

  /* 목적 — 같은 오류도 목적에 따라 처방이 다르다(발주_수집파이프라인 [CHK-4]).
   * ⚠ 이 칸은 덮어쓰기 열이라 과거를 못 든다 — 그 자리는 `learning_events.goal_snapshot` 이
   *   진다(c6). 여기서 막는 것은 「오늘의 목적이 목록 안인가」까지다. */
  if not exists (select 1 from pg_constraint
                  where connamespace = to_regnamespace('engine')
                    and conname = 'learners_goal_track_c11') then
    alter table engine.learners add constraint learners_goal_track_c11
      check (goal_track is null or goal_track in ('study', 'work', 'culture'));
  end if;

  insert into engine.schema_migrations (version, name, checksum, applied_at)
  values (migration_version, migration_name, expected_checksum, now());
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
  --   갈라 두면 창이 밀려 원리상 짝을 못 맞추고, 그릇은 화면으로 끝나고 엔진엔 안 닿는다.
  ('season_review','record_snapshot'), ('season_review','verdict'),
  ('season_review','verdict_by_self'), ('season_review','note'),
  ('season_review','opened_by'), ('season_review','opened_at'),
  ('season_review','decided_by'), ('season_review','decided_at'),
  -- 가입 1회 문항(20260806150000 이 낸 열 · 20260812180000 이 값을 조인다).
  --   열이 사라지면 「지역 억양 편차의 유일한 축」이 통째로 없어지는데, 그 손실은 조용하다 —
  --   가입은 그대로 성공하고 세 칸만 안 쌓인다(2026-08-09 에 실제로 그 상태였다).
  ('learners','home_aimag'), ('learners','gender'), ('learners','goal_track')
), 기대제약(n) as (values
  ('learning_events_event_type_c11'), ('learning_events_task_type_c11'),
  ('submissions_task_format_c11'), ('submissions_translation_source_c11'),
  ('submissions_due_paired_c11'), ('corrections_verdict_c11'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c11'), ('staff_role_c11'),
  ('learners_temp_password_paired_c11'),
  ('learning_events_correction_target_c11'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c11'), ('corrections_promotion_intent_c11'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c11'),
  -- 시즌 그릇(20260812140000) — 겹침 배제·날짜 순서·학생×시즌 유일·문항 묶음 + 고리 둘.
  --   유일키가 빠지면 같은 시즌에 두 행이 서고, 회고가 어느 것을 왼쪽으로 쓸지 모른다.
  ('season_no_overlap_c11'), ('season_dates_c11'),
  ('season_compass_once_c11'), ('season_compass_answers_c11'),
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey'),
  -- 시즌 회고(20260812170000) — 판정 3갈래 둘 + 「판정·사유·주체·시각 한 벌」 + 고리 둘.
  --   값목록이 빠지면 오타 라벨('closser')이 그대로 앉고 엔진은 그걸 4번째 갈래로 배운다.
  ('season_review_once_c11'), ('season_review_verdict_c11'),
  ('season_review_self_c11'), ('season_review_decided_c11'),
  ('season_review_learner_id_fkey'), ('season_review_season_id_fkey'),
  -- 가입 1회 문항 값목록(20260812180000) — 세 칸 전부. 하나만 서면 나머지 둘은 여전히
  --   자유 입력이라, 「조였다」가 참인 칸과 거짓인 칸이 한 표에 섞인다.
  ('learners_home_aimag_c11'), ('learners_gender_c11'), ('learners_goal_track_c11')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000) — 행이 사라지는 것만 막는다(개서는 촉진 세션의 정상 통로)
  ('season_compass_protect'),
  -- 회고(20260812170000) — 굳힌 근거 불변 + 학생 판정은 강사 「전」에만 + 삭제 금지.
  --   freeze 가 꺼지면 재계산한 숫자로 옛 판정을 덮어쓸 수 있고 그건 조용히 통과한다.
  ('season_review_freeze'), ('season_review_protect')
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
  -- 🔴 존재만 묻지 않는다. 꺼진 트리거는 pg_trigger 에 행이 그대로 남고 tgenabled 만
  --    'D'(꺼짐)·'R'(복제본에서만)이 된다 — 안 잰 것을 통과로 내면 그건 확인이 아니다.
  select e.n,
         (select g.tgenabled from pg_trigger g
            join pg_class r on r.oid=g.tgrelid
           where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n) as 상태
    from 기대트리거 e
), 빠진트리거 as (
  -- 상태를 이름 옆에 붙인다 — 「없음」은 판을 부어야 하고 「꺼짐」은 enable 한 줄이라 처방이 갈린다.
  -- ⚠ 상태::text 캐스트가 필수다. tgenabled 는 "char"(1바이트) 타입이라 || 후보가 갈려
  --    operator is not unique 로 쿼리 전체가 안 돈다 — 파일 층 검사는 이걸 못 본다(2026-08-07 실측).
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
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 5 (20260812170000 이 4 에서 올렸다): 회고가 `season_review.learner_id` 에 restrict 를
  --    하나 더 건다. 학생 행이 지워지면 그 학생의 라벨까지 사라지는데, 사람이 낸 라벨은
  --    소급이 안 된다. 이 조각은 이 수를 안 건드린다(CHECK 만 더한다).
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('engine') and contype='f'
      and confrelid=to_regclass('engine.learners') and confdeltype='r') as 삭제차단,
  (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typnamespace=to_regnamespace('engine')
      and t.typname='job_status' and e.enumlabel='failed') as 실패상태,
  (select count(*) from pg_policies
    where schemaname='engine' and tablename='schema_migrations') as 이력정책,
  -- 검수자 판(20260807190000 · 절단문서 ②-17): 뷰가 있고 옛 정책이 없어야 둘 다 맞다.
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue') as 검수뷰,
  (select count(*) from pg_policies
    where schemaname='engine' and policyname='inspector_queue_submissions') as 옛검수정책,
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출,
  -- 마감(20260808010000): c10 이 선 뒤에 만들어진 배정만 센다 — 옛 행의 마감은 아무도 모른다.
  (select count(*) from engine.submissions s
     join engine.learning_events e on e.event_id = s.event_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and s.occurred_at >= (select applied_at from engine.schema_migrations
                             where version = '20260808010000')) as 마감없는배정,
  -- 분모의 정본은 task.assigned 사건 하나다 — daily_activity.expected 에 값이 들어오면 빨개진다.
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염,
  -- 폐기 사유(20260809090000): 그 조각이 선 뒤에 갱신된 job 만 센다.
  (select count(*) from engine.pipeline_jobs j
    where j.status = 'discarded' and j.discard_reason is null
      and j.updated_at >= (select applied_at from engine.schema_migrations
                            where version = '20260809090000')) as 폐기사유없는폐기,
  -- 검수 판이 올라간 판인지(20260809050000): 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문,
  -- 🔴 회고(20260812170000): 라벨이 있는데 근거가 「비어 있는」 행 — 0이어야 한다.
  --    not null 은 「칸이 있다」만 보장하고 '{}' 는 통과시킨다. 근거 없는 라벨은 엔진으로
  --    그대로 흘러 들어가고, 그 오염은 나중에 가려낼 방법이 없다.
  (select count(*) from engine.season_review
    where verdict is not null
      and (record_snapshot = '{}'::jsonb
           or record_snapshot -> 'axes_전반' is null
           or record_snapshot -> 'axes_후반' is null)) as 근거없는라벨,
  -- 🔴 가입 1회 문항(20260812180000): 목록 밖 값이 앉은 행 — 0이어야 한다.
  --    CHECK 가 섰으므로 «앞으로»는 0 이 유지된다. 이 칸이 재는 것은 **CHECK 가 실제로
  --    걸려 있는가**다 — 제약이 빠진 DB 에서는 이 수가 조용히 오르고, 그때가 아이막 표기가
  --    섞이기 시작한 날이다(섞인 뒤엔 어느 표기가 어느 아이막이었는지 복원이 안 된다).
  (select count(*) from engine.learners
    where (home_aimag is not null and home_aimag not in (
             'ulaanbaatar','arkhangai','bayan-olgii','bayankhongor','bulgan','darkhan-uul',
             'dornod','dornogovi','dundgovi','govi-altai','govisumber','khentii',
             'khovd','khovsgol','omnogovi','orkhon','ovorkhangai','selenge',
             'sukhbaatar','tov','uvs','zavkhan'))
       or (gender is not null and gender not in ('female','male','undisclosed'))
       or (goal_track is not null and goal_track not in ('study','work','culture')))
    as 목록밖프로필,
  -- ── 라디오 원장(20260811160000 · radio 스키마) ──
  (select count(*) from pg_tables where schemaname='radio') as 라디오표수,
  (select count(*) from pg_tables where schemaname='radio' and rowsecurity) as 라디오RLS수,
  (select count(*) from pg_policies where schemaname='radio') as 라디오정책수,
  (select count(*) from 대상역할 r cross join 라디오테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','radio',t.t), p.p)) as 라디오새는권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('radio'), 'USAGE')) as 라디오새는스키마,
  -- c11 이 접미를 갈았다 — 옛 이름을 세면 「적용 전」과 「적용 후」가 같은 0 으로 보인다.
  (select count(*) from pg_constraint
    where connamespace=to_regnamespace('radio')
      and conname='broadcast_segment_kind_c11') as 라디오kind제약,
  -- 링크 보호 트리거 — 존재가 아니라 켜짐을 센다(engine 트리거상태와 같은 이유).
  (select count(*) from pg_trigger g
     join pg_class c2 on c2.oid=g.tgrelid
    where c2.relnamespace=to_regnamespace('radio')
      and g.tgname='viewer_link_protect' and g.tgenabled in ('O','A')) as 연동보호트리거,
  -- 활성 링크는 채널당 1개 — 부분 유일 인덱스가 서 있어야 §3 의 유일성이 물리다.
  (select count(*) from pg_indexes
    where schemaname='radio' and indexname='viewer_link_active') as 연동활성유일,
  -- ── c11: engine.skills 첫 시드(문항 팩 스킬표 30 · skills.v1) — 0이면 승격이 전건 거절된다.
  (select count(*) from engine.skills) as 스킬시드수
)
select case when 테이블수=14 and RLS켜짐=14 and 정책수=7
              and 새는테이블권한=0 and 새는스키마권한=0 and 삭제차단=5 and 실패상태=1
              and 이력정책=0 and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
              and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
              and 검수판열=22 and 검수판원문=0 and 근거없는라벨=0 and 목록밖프로필=0
              and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
              and 라디오새는권한=0 and 라디오새는스키마=0 and 라디오kind제약=1
              and 연동보호트리거=1 and 연동활성유일=1 and 스킬시드수=30
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260812180000'
              and (select checksum from 현재이력)='049957bcecd4d42b63f9301e880e7c7bccad7dc711b6ae368c2b27ac140b0b06' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 14·14·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·6·6·0·0·0·1·1·1·30 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260812170000_season_review_c11.sql` «뒤»에만 선다(base_version).
--    그 앞의 c11 조각들이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 0 · RLS 0 · 정책 0 · 트리거 0 · 열 0 — **이 조각이 새로 만드는 것은 CHECK 셋뿐**이다.
--    `테이블수`·`RLS켜짐`(14)·`삭제차단`(5)은 앞 조각 그대로다.
-- ② 새 칸 `목록밖프로필` = **0** — 목록 밖 값이 앉은 학생 행 수다. CHECK 가 섰으면 앞으로
--    0 이 유지되고, 이 수가 오르는 날은 제약이 빠진 날이다(그날이 표기가 섞이기 시작한 날).
-- ③ 부을 때 목록 밖 값이 이미 있으면 판이 **이름을 대고 멈춘다**(`어긋난행`). 자동 정정은
--    하지 않는다 — 어느 아이막으로 옮길지는 추정이고, 추정으로 원본을 덮으면 복원이 안 된다.
-- ④ 코드 쪽 정본은 `lib/가입문항.js` 하나다. 이 파일은 사본이라 `tests/가입문항.test.js` 가
--    **이 파일을 읽어** 세 목록을 글자 단위로 대조한다 — 한쪽만 고치면 CI 가 빨개진다.
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 셋을 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    기대: broadcast_segment_kind_c11 · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_gender_c11 · learners_goal_track_c11 · learners_home_aimag_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11
