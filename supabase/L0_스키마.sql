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
