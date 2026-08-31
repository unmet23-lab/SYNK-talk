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
    drop constraint if exists learning_events_event_type_c7,
    add constraint learning_events_event_type_c7 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result'
    )),
    drop constraint if exists learning_events_task_type_c7,
    add constraint learning_events_task_type_c7 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    ));

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c6,
    drop constraint if exists submissions_task_format_c7,
    add constraint submissions_task_format_c7 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    -- 병렬 쌍의 왼쪽이 실제로 저장되게 만든다. 값만 늘리면 「번역인데 몽골어 원문이 없는 행」이
    -- 통과하고, 그건 코퍼스가 아니라 그냥 한국어 문장이다 — 그리고 제시문은 **그때만** 남길 수 있다
    -- (문항이 수정되면 학생이 무엇을 보고 답했는지 사라진다 = c4가 task_ref/task_snapshot 을 가른 이유).
    drop constraint if exists submissions_translation_source_c7,
    add constraint submissions_translation_source_c7 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c6,
    drop constraint if exists corrections_verdict_c7,
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
    drop constraint if exists learning_events_event_type_c8,
    add constraint learning_events_event_type_c8 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result'
    )),
    drop constraint if exists learning_events_task_type_c8,
    add constraint learning_events_task_type_c8 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    ));

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c7,
    drop constraint if exists submissions_translation_source_c7,
    drop constraint if exists submissions_task_format_c8,
    add constraint submissions_task_format_c8 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    drop constraint if exists submissions_translation_source_c8,
    add constraint submissions_translation_source_c8 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c7,
    drop constraint if exists corrections_verdict_c8,
    add constraint corrections_verdict_c8 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c7,
    drop constraint if exists learners_temp_password_paired_c7,
    drop constraint if exists learners_signup_attempts_nonneg_c8,
    add constraint learners_signup_attempts_nonneg_c8 check (signup_attempts >= 0),
    drop constraint if exists learners_temp_password_paired_c8,
    add constraint learners_temp_password_paired_c8
      check (temp_password_hash is null or temp_password_expires_at is not null);

  alter table engine.staff
    drop constraint if exists staff_role_c7,
    drop constraint if exists staff_role_c8,
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
    drop constraint if exists learning_events_event_type_c9,
    add constraint learning_events_event_type_c9 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result', 'content.viewed'
    )),
    drop constraint if exists learning_events_task_type_c9,
    add constraint learning_events_task_type_c9 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    )),
    -- 🔑 술어는 c8 과 한 글자도 같다. `content.viewed` 는 교정 사건이 아니므로 else 가지로
    --    떨어져 `correction_id is null` 을 요구한다 — 그게 옳다(그 행의 대상은 correction 이
    --    아니라 `parent_event_id` 다 · lib/이벤트검증.js 이벤트별필수).
    drop constraint if exists learning_events_correction_target_c9,
    add constraint learning_events_correction_target_c9 check (
      case when event_type in ('correction.viewed', 'correction.responded')
           then correction_id is not null
           else correction_id is null
      end
    );

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c8,
    drop constraint if exists submissions_translation_source_c8,
    drop constraint if exists submissions_task_format_c9,
    add constraint submissions_task_format_c9 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    drop constraint if exists submissions_translation_source_c9,
    add constraint submissions_translation_source_c9 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c8,
    drop constraint if exists corrections_verdict_c9,
    add constraint corrections_verdict_c9 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c8,
    drop constraint if exists learners_temp_password_paired_c8,
    drop constraint if exists learners_signup_attempts_nonneg_c9,
    add constraint learners_signup_attempts_nonneg_c9 check (signup_attempts >= 0),
    drop constraint if exists learners_temp_password_paired_c9,
    add constraint learners_temp_password_paired_c9
      check (temp_password_hash is null or temp_password_expires_at is not null);

  alter table engine.staff
    drop constraint if exists staff_role_c8,
    drop constraint if exists staff_role_c9,
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
    drop constraint if exists learning_events_event_type_c10,
    add constraint learning_events_event_type_c10 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result', 'content.viewed'
    )),
    drop constraint if exists learning_events_task_type_c10,
    add constraint learning_events_task_type_c10 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    )),
    drop constraint if exists learning_events_correction_target_c10,
    add constraint learning_events_correction_target_c10 check (
      case when event_type in ('correction.viewed', 'correction.responded')
           then correction_id is not null
           else correction_id is null
      end
    );

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c9,
    drop constraint if exists submissions_translation_source_c9,
    drop constraint if exists submissions_task_format_c10,
    add constraint submissions_task_format_c10 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    drop constraint if exists submissions_translation_source_c10,
    add constraint submissions_translation_source_c10 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    ),
    -- 🔑 시각만 있고 판본이 없으면 그 값은 **읽을 수 없는 값**이다(무슨 규칙인지 모른다).
    --    판본만 있고 시각이 없으면 규칙만 있고 결과가 없다. 반쪽은 둘 다 사고라 짝으로 건다.
    drop constraint if exists submissions_due_paired_c10,
    add constraint submissions_due_paired_c10 check (
      (due_at is null) = (due_ver is null)
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c9,
    drop constraint if exists corrections_verdict_c10,
    add constraint corrections_verdict_c10 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c9,
    drop constraint if exists learners_temp_password_paired_c9,
    drop constraint if exists learners_signup_attempts_nonneg_c10,
    add constraint learners_signup_attempts_nonneg_c10 check (signup_attempts >= 0),
    drop constraint if exists learners_temp_password_paired_c10,
    add constraint learners_temp_password_paired_c10
      check (temp_password_hash is null or temp_password_expires_at is not null);

  alter table engine.staff
    drop constraint if exists staff_role_c9,
    drop constraint if exists staff_role_c10,
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
    drop constraint if exists learning_events_event_type_c11,
    add constraint learning_events_event_type_c11 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected', 'correction.responded', 'correction.viewed', 'preference.stated', 'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked', 
      'task.assigned', 'exam.result', 'content.viewed', 'affect.reported'
    )),
    drop constraint if exists learning_events_task_type_c11,
    add constraint learning_events_task_type_c11 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화', '라디오퀴즈', '목표선언', '자습체크인'
    )),
    drop constraint if exists learning_events_correction_target_c11,
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
    drop constraint if exists submissions_task_format_c11,
    add constraint submissions_task_format_c11 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    drop constraint if exists submissions_translation_source_c11,
    add constraint submissions_translation_source_c11 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    ),
    drop constraint if exists submissions_due_paired_c11,
    add constraint submissions_due_paired_c11 check (
      (due_at is null) = (due_ver is null)
    );

  /* ⚠ verdict 는 **혼자 한 문장**이다 — tests/검수확정.test.js 의 값 추출이 「check … ));」 로
   *   끝나는 블록을 비탐욕으로 집는다. 다른 CHECK 와 한 alter 에 묶으면 종결이 「)),」 가 되어
   *   추출이 다음 「));」(직원 role 목록)까지 흘러 들어가 대조가 거짓 적색이 된다(08-12 실측). */
  alter table engine.corrections
    drop constraint if exists corrections_verdict_c10,
    drop constraint if exists corrections_verdict_c11,
    add constraint corrections_verdict_c11 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.corrections
    drop constraint if exists corrections_supersedes_not_self_c10,
    drop constraint if exists corrections_promotion_intent_c10,
    drop constraint if exists corrections_supersedes_not_self_c11,
    add constraint corrections_supersedes_not_self_c11
      check (supersedes is null or supersedes <> correction_id),
    drop constraint if exists corrections_promotion_intent_c11,
    add constraint corrections_promotion_intent_c11
      check (promotion_intent = false or actor_kind = 'teacher');

  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c10,
    drop constraint if exists learners_temp_password_paired_c10,
    drop constraint if exists learners_signup_attempts_nonneg_c11,
    add constraint learners_signup_attempts_nonneg_c11 check (signup_attempts >= 0),
    drop constraint if exists learners_temp_password_paired_c11,
    add constraint learners_temp_password_paired_c11
      check (temp_password_hash is null or temp_password_expires_at is not null);

  alter table engine.staff
    drop constraint if exists staff_role_c10,
    drop constraint if exists staff_role_c11,
    add constraint staff_role_c11 check (role in ('teacher', 'inspector', 'director'));

  alter table engine.pipeline_jobs
    drop constraint if exists pipeline_jobs_discard_reason_c10,
    drop constraint if exists pipeline_jobs_discard_reason_c11,
    add constraint pipeline_jobs_discard_reason_c11
      check (discard_reason is null
             or (status = 'discarded'
                 and discard_reason in
                   ('무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가')));

  alter table radio.broadcast_segment
    drop constraint if exists broadcast_segment_kind_c10,
    drop constraint if exists broadcast_segment_kind_c11,
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
 *   생산자 = `functions/teach` 의 `compass/…` 두 경로이고 이 조각과 **같은 커밋**에 선다.
 *   (⚠ 그 꼬리를 **슬래시+별표**로 적으면 이 파일은 **DB 에서 파싱조차 안 된다** — Postgres
 *    블록 주석은 중첩되므로 주석 «안»의 그 두 글자가 새 주석을 열고 파일 끝까지 안 닫힌다.
 *    실측 2026-08-12: 이 조각과 `season_review_c11` 이 그 두 글자 때문에 42601 로 죽어
 *    **한 번도 적용된 적이 없었다**(장부에는 ✅종결로 적혀 있었다).
 *    회귀 = `tests/마이그레이션주석.test.js`.)
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
  expected_checksum constant text := 'efd9dcf78298c0fa4b5112c3fd51e8ac0394d7f6cfd5f194623956cdb3dc2b5f'; -- migration-checksum
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
              and (select checksum from 현재이력)='efd9dcf78298c0fa4b5112c3fd51e8ac0394d7f6cfd5f194623956cdb3dc2b5f' -- migration-checksum
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
 *   생산자 = `functions/teach` 의 `retro/…` 세 경로이고 이 조각과 **같은 커밋**에 선다.
 *   (⚠ 그 꼬리를 **슬래시+별표**로 적으면 이 파일은 DB 에서 파싱조차 안 된다 —
 *    위 `season_c11` 과 같은 자리에서 같은 두 글자로 죽었다.
 *    회귀 = `tests/마이그레이션주석.test.js`.)
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
  expected_checksum constant text := '45f4077f4d125937364f1bf71ceae72ab826e2851a065e51af9925f8f6b16a26'; -- migration-checksum
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
              and (select checksum from 현재이력)='45f4077f4d125937364f1bf71ceae72ab826e2851a065e51af9925f8f6b16a26' -- migration-checksum
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
-- 「반」을 물리로 세운다 — 강사 반 단위 피드백의 §8-1 조각
--
-- 정본 = SYNK-talk `docs/강사_반단위_피드백_설계.md` v2 §3 (유호님 신규 지시 2026-08-12
--   「반을 보기 쉽게 정해서 해당 반에 들어가서 피드백하기 쉽도록」).
-- 이 조각이 세우는 것은 **착수 순서 ①뿐**이다 — 표 2 + 칸 1. §8-3 `teach` 라우트·§8-4 화면은
--   여기 없다(자리를 미리 파 두면 「이미 있다」가 되어 배선 없는 표가 남는다).
--
-- 🔴 파일 이름이 **c12 가 아니라 c11 인 이유** — 설계 문서는 「c12 조각」이라 적었지만 그건
--   이름 오류다. 네 Edge Function(auth·events·uploads·deliver)이 계약판을 **최신 조각 이름**에서
--   읽고(`tests/마이그레이션이름.test.js`), 제약 이름의 접미는 `계약/수집_교정_계약.json` 의
--   `버전`에서 파생된다(`tests/L0스키마.test.js` 의 `제약()`). 이 조각은 계약을 **안 바꾼다**:
--   새 `event_type` 0 · 새 값목록 0 · `learning_events` 0. 그래서 계약판은 c11 그대로이고,
--   파일 이름을 c12 로 올리면 이름과 계약 파일이 갈려 제약 접미가 어느 쪽을 따르는지 알 수 없게
--   된다. `season_c11`·`season_review_c11`·`learner_profile_c11` 셋이 `engine_c11` 뒤에 c11 을
--   그대로 이어 쓴 것과 같은 판단이다.
--
-- ■ 왜 `class_name` 한 칸이 아니라 표 둘인가 (설계 §3)
--   시즌(교재 1권, 약 2달)마다 반이 재편된다. `learners.class_name text` 한 칸이면 재편되는 날
--   과거 행과 계보가 끊긴다 — `corrections` 에 이름 문자열 대신 `staff_id` 를 적기로 한 것과
--   같은 이유다. 그리고 `staff_classes` 가 없으면 「자기 반」이라는 말이 정의되지 않아 **모든
--   강사가 전교생 큐를 본다** — 유호님 지시의 정반대다.
--
-- ■ 왜 PK 가 `class_key` 가 아닌가 — 그 키는 **시즌을 넘어 재사용된다**
--   `평일11A` 는 「평일 11시 A실」이라는 **좌표**이지 학생 무리의 정체성이 아니다. 다음 시즌 같은
--   슬롯에 다른 무리가 앉으면 같은 키에 다른 반이 온다. 그래서 `class_id`(정체성) ·
--   `class_key`(좌표) · `season_id`(언제) 셋을 나눈다. ⚠ 그래도 `class_key` 를 **버리지 않는다** —
--   시트와 원본을 대조하는 유일한 자연키이고, 없으면 다리가 어긋난 날 증상이 「조용함」뿐이다.
--
-- ■ 유일성을 제약이 아니라 **부분 인덱스 둘**로 거는 이유
--   `unique (class_key, season_id)` 하나로는 못 막는다 — Postgres 유일 제약은 NULL 을 서로 다른
--   값으로 보므로 `season_id is null`(아직 시즌이 없는 미개원 상태)에서 같은 키가 **몇 벌이든**
--   들어온다. 그 상태가 정확히 지금이라, 제약 하나로 두면 이 표는 태어나는 날부터 안 지켜진다.
--   그래서 시즌 안(`season_id is not null`)과 시즌 밖(`is null`)을 갈라 각각 건다.
--
-- ■ `active` 없이 만들지 않는다
--   지난 시즌 반은 지우는 게 아니라 닫는다 — 과거 행의 FK 가 살아야 한다. 그래서 삭제 경로를
--   기본(NO ACTION)으로 두어, 학생이 매달린 반은 **지우려 하면 DB 가 막는다**.
--
-- ■ 채우는 코드는 이 조각에 0줄이다 — 정직 표기
--   생산자 = `functions/roster-ingest`(시트 5열 `class_name` → `engine.classes` upsert →
--   `learners.class_id`)이고 이 조각과 **같은 커밋**에 선다. 「표가 섰다」를 「반이 돈다」로
--   읽지 않는다(엔진도달 §5 확인 ③).
--   ⚠ 아직 **없는 것**을 여기 적어 둔다: 시즌이 넘어갈 때 지난 시즌 반을 `active=false` 로
--     닫는 일감(시즌 롤오버)은 이 조각에도, 어디에도 없다. 첫 시즌이 끝나기 전에 서야 한다.
--
-- ■ 강사↔반 배정은 시트에 없다
--   「이 반을 누가 가르치나」가 운영 시트 어디에도 없다. 그건 원장 화면의 입력 칸 하나가 맞다 —
--   반 수가 한 자릿수~24라 사람이 눌러도 철학 ㉡ 위반이 아니다(**판단이 필요한 자리**다).
--   그래서 이 표는 물리만 세우고 채우는 통로는 §8-3 에서 선다.
--
-- 되돌림: alter table engine.learners drop column if exists class_id;
--        drop table if exists engine.staff_classes;
--        drop table if exists engine.classes;
--        delete from engine.schema_migrations where version = '20260812200000';

begin;

do $migration$
declare
  migration_version constant text := '20260812200000';
  migration_name constant text := '20260812200000_class_c11.sql';
  expected_checksum constant text := '01e6ba27c02fbcc305cb90642f3e1f9c06c1d5e87bc815d4e000ae590b65e2e4'; -- migration-checksum
  base_version constant text := '20260812180000';
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

  if to_regclass('engine.season') is null then
    raise exception
      'engine.season 이 없다 — 반은 시즌에 매달린다(20260812140000_season_c11 이 먼저 서야 한다)';
  end if;

  -- ① 반 — 정체성(class_id) · 좌표(class_key) · 언제(season_id)를 나눠 든다.
  --    `season_id` 가 null 인 행 = 「시즌 밖」이다. 미개원 지금이 그 상태이고, 첫 시즌이
  --    열리면 그 시즌의 반은 **새 행**으로 선다(같은 좌표라도 다른 무리다 · 위 머리말).
  create table if not exists engine.classes (
    class_id     uuid primary key default gen_random_uuid(),
    class_key    text not null constraint classes_key_nonblank_c11 check (btrim(class_key) <> ''),
    season_id    uuid references engine.season(season_id),
    display_name text,
    active       boolean not null default true,
    created_at   timestamptz not null default now(),
    schema_ver   text not null
  );

  -- 🔴 유일성 — 제약 하나로 못 건다(머리말 참고). 시즌 안과 밖을 갈라 각각 건다.
  --    이게 없으면 명부 스윕이 같은 반을 매 판 새로 만들고, 학생마다 다른 class_id 가 붙어
  --    「내 반」이 갈라진다 — 증상은 「강사 큐에 학생이 몇 명 없다」뿐이라 조용하다.
  create unique index if not exists classes_key_in_season
    on engine.classes (class_key, season_id) where season_id is not null;
  create unique index if not exists classes_key_no_season
    on engine.classes (class_key) where season_id is null;

  -- ② 학생이 어느 반인가 — **null 이 정상 상태**다.
  --    아직 반이 안 정해진 학생은 있고(등록은 했는데 배정 전), 그 학생도 앱은 써야 한다.
  --    `if not exists` 를 쓰지 않는 것은 위 이력 판정이 「이 판은 아직」을 이미 못박았기
  --    때문이다 — 칸이 이미 있다면 이력과 실물이 어긋난 상태이고 조용히 넘기지 않는다.
  --    삭제 경로는 기본(NO ACTION)이다: 학생이 매달린 반은 지우려 하면 DB 가 막는다.
  alter table engine.learners
    add column class_id uuid references engine.classes(class_id);

  -- ③ 강사↔반 — 「자기 반」의 정의. 이 표가 없으면 권한이 화면 규약이 되고, 화면 규약은
  --    서버가 안 지킨다. `staff_id` 는 감사가 사람을 가리키는 안정 키다(계정이 다시 서도 잇는다).
  create table if not exists engine.staff_classes (
    staff_id    uuid not null references engine.staff(staff_id),
    class_id    uuid not null references engine.classes(class_id),
    assigned_at timestamptz not null default now(),
    schema_ver  text not null,
    primary key (staff_id, class_id)
  );

  -- engine 취급 그대로 — RLS 켜고 정책 0(전면 거부) · service_role 만 쓰기 · PostgREST 비노출.
  -- 나중에 노출하는 날 잊어도 **닫힌 채로 실패한다**.
  alter table engine.classes       enable row level security;
  alter table engine.staff_classes enable row level security;

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
  ('season_review','decided_by'), ('season_review','decided_at'),
  -- 가입 1회 문항(20260806150000 이 낸 열 · 20260812180000 이 값을 조인다).
  --   열이 사라지면 「지역 억양 편차의 유일한 축」이 통째로 없어지는데, 그 손실은 조용하다 —
  --   가입은 그대로 성공하고 세 칸만 안 쌓인다(2026-08-09 에 실제로 그 상태였다).
  ('learners','home_aimag'), ('learners','gender'), ('learners','goal_track'),
  -- 반(20260812200000) — 좌표·시즌·활성이 전부 있어야 「지난 시즌 반」을 닫을 수 있다.
  --   `class_key` 가 빠지면 시트와 대조할 자연키가 사라지고, 어긋난 날 증상은 조용함뿐이다.
  ('classes','class_key'), ('classes','season_id'), ('classes','display_name'),
  ('classes','active'), ('classes','schema_ver'),
  ('learners','class_id'),
  ('staff_classes','staff_id'), ('staff_classes','class_id'), ('staff_classes','schema_ver')
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
  ('learners_home_aimag_c11'), ('learners_gender_c11'), ('learners_goal_track_c11'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  --   고리가 빠지면 없는 반·없는 강사를 가리키는 행이 앉고, 그건 화면에서 「빈 반」으로만 보인다.
  ('classes_pkey'), ('classes_key_nonblank_c11'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey')
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
  -- 🔑 14 → 16 (20260812200000): engine.classes · engine.staff_classes 둘이 섰다.
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 5 (20260812170000 이 4 에서 올렸다): 회고가 `season_review.learner_id` 에 restrict 를
  --    하나 더 건다. 이 조각은 이 수를 안 건드린다 — `learners.class_id` 는 learners 를
  --    «가리키는» 고리가 아니라 learners «에서 나가는» 고리라 confrelid 가 classes 다.
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
  -- 🔴 반(20260812200000): 같은 좌표가 두 벌 앉은 반 — 0이어야 한다.
  --    이 칸이 재는 것은 **부분 유일 인덱스 둘이 실제로 걸려 있는가**다. 빠지면 명부 스윕이
  --    매 판 같은 반을 새로 만들고 학생마다 다른 class_id 가 붙는데, 증상은 「강사 큐에
  --    학생이 몇 명 없다」뿐이라 조용하다.
  (select count(*) from (
     select class_key, season_id from engine.classes
      group by class_key, season_id having count(*) > 1) d) as 겹친반좌표,
  (select count(*) from pg_indexes
    where schemaname='engine'
      and indexname in ('classes_key_in_season','classes_key_no_season')) as 반좌표유일,
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
select case when 테이블수=16 and RLS켜짐=16 and 정책수=7
              and 새는테이블권한=0 and 새는스키마권한=0 and 삭제차단=5 and 실패상태=1
              and 이력정책=0 and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
              and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
              and 검수판열=22 and 검수판원문=0 and 근거없는라벨=0 and 목록밖프로필=0
              and 겹친반좌표=0 and 반좌표유일=2
              and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
              and 라디오새는권한=0 and 라디오새는스키마=0 and 라디오kind제약=1
              and 연동보호트리거=1 and 연동활성유일=1 and 스킬시드수=30
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260812200000'
              and (select checksum from 현재이력)='01e6ba27c02fbcc305cb90642f3e1f9c06c1d5e87bc815d4e000ae590b65e2e4' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 16·16·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260812180000_learner_profile_c11.sql` «뒤»에만 선다(base_version).
--    그 앞의 c11 조각들이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 **+2**(`classes`·`staff_classes`) · RLS **+2** · 정책 0 · 트리거 0 · 열 +1(`learners.class_id`).
--    `삭제차단`(5)은 앞 조각 그대로다 — 이 조각의 고리는 learners 를 «가리키지» 않는다.
-- ② 새 칸 `겹친반좌표` = **0** · `반좌표유일` = **2**. 뒤엣것이 2 가 아니면 유일성이 물리가
--    아니고, 그러면 앞엣것의 0 은 「지켜졌다」가 아니라 「아직 안 겹쳤다」일 뿐이다.
--    두 칸을 함께 읽는다 — 하나만 보면 미설치와 준수가 같은 모양이다.
-- ③ 이 조각은 **행을 하나도 안 만든다**. `engine.classes` 는 명부 스윕(`roster-ingest`)이
--    시트 5열에서 채우고, `engine.staff_classes` 는 §8-3 원장 화면이 채운다 — 지금 둘 다 0행이
--    정상이다. 「표가 섰다」를 「반이 돈다」로 읽지 않는다.
-- ④ 🔴 아직 **없는 것** — 시즌 롤오버(지난 시즌 반을 `active=false` 로 닫기)는 어디에도 없다.
--    첫 시즌이 끝나기 전에 서야 하고, 안 서면 반 목록이 시즌마다 누적된다.
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 하나를 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--      📏 실측 2026-08-12: 이 조각을 짓다 정확히 그걸 밟았다(위 ⓪의 파일명이 잡혔다).
--    기대: broadcast_segment_kind_c11 · classes_key_nonblank_c11
--         · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_gender_c11 · learners_goal_track_c11 · learners_home_aimag_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11
-- 강사 한 마디를 담을 자리 — 강사 반 단위 피드백의 §6 ㉠ 조각
--
-- 정본 = SYNK-talk `docs/강사_반단위_피드백_설계.md` v2 §6 (유호님 신규 지시 2026-08-12
--   「반을 보기 쉽게 정해서 해당 반에 들어가서 피드백하기 쉽도록」).
-- 앞 조각(`20260812200000_class_c11`)이 「반」을 세웠고, 이 조각은 그 반 안에서 강사가 낸
--   한 마디가 **어디에 앉는가**를 세운다. 통로(§8-3 `teach` 라우트 셋)는 같은 커밋에 선다.
--
-- ■ 🔴 왜 `corrections` 가 아닌가 (설계 §2 — 이 설계의 급소)
--   `actor_kind='teacher'` 는 「강사」가 아니라 **「사람 직원」**이고 검수 확정이 그 값으로 앉는다
--   (`review/index.ts:572`). 강사 한 마디를 그 표에 쓰면 세 자리가 한꺼번에 오염된다:
--     ① `supersedes` 대상 판정이 `actor_kind='teacher'` **하나로만** 가른다(`review:490`) →
--        강사 행이 정당한 재검수 대상이 되고, 거절 문구조차 사람 눈엔 정상으로 보인다.
--     ② `promotion_intent` CHECK(`= false or actor_kind='teacher'`) → 검수 안 거친 한 마디가
--        **훈련 승격 후보** 자리에 선다.
--     ③ `verdict` 계보가 검수 확정과 섞인다.
--   🚫 `actor_kind` 에 값을 더하는 길도 막혀 있다 — c6 이 `actor_values` 를 못박아 검사하므로
--      계약·CHECK·검사 셋이 동시에 흔들린다. 그래서 **표를 따로 둔다**.
--
-- ■ 왜 ㉡(기존 `learning_events`)이 아닌가 — 지금은 «소비자»가 그쪽에 없다
--   설계 §6 ▶권고 그대로다. 사건으로 쓰면 새 표는 0인데 그 사건을 읽어 학생 화면에 배달하는
--   배선이 아직 판정도 안 섰다 — 소비자 없는 생산자가 되어 도달 래칫에 걸린다.
--   이 표는 **태어나는 순간 소비자가 있다**: 강사 큐가 「한 마디가 이미 있는 것」을 빼는 데 쓴다.
--   ⚠ 배달 배선이 서는 날 ㉡ 을 «더한다»(이 표를 지우는 것이 아니라 — 여기는 강사가 쓴 원문이고
--     거기는 학생에게 간 사건이다. 뜻이 다르므로 합치지 않는다).
--
-- ■ 🔴 파일 이름이 c12 가 아니라 c11 인 이유 — 앞 조각의 판단을 **그대로** 잇는다
--   설계 문서는 §6 을 「계약 변경」이라 적었지만, 그 판정은 `20260812200000` 이 이미 한 번
--   바로잡은 것과 같은 이름 오류다. 계약판은 `계약/수집_교정_계약.json` 의 `버전`에서 파생되고
--   (`tests/L0스키마.test.js` 의 `제약()`), 네 Edge Function 이 계약판을 **최신 조각 이름**에서
--   읽는다(`tests/마이그레이션이름.test.js`). 이 조각이 계약을 바꾸는가를 셋으로 잰다:
--     새 `event_type` **0** · 새 값목록(`계약`의 열거) **0** · `learning_events` 손댐 **0**.
--   셋 다 0이라 계약판은 c11 그대로다. `season_c11`·`season_review_c11`·`learner_profile_c11`·
--   `class_c11` 이 `engine_c11` 뒤에 c11 을 이어 쓴 것과 같은 판단이다.
--   ⚠ 이 표의 값목록 둘(`origin`·`disposition`)은 **계약 파일에 없다** — 앱↔서버 계약이 아니라
--     강사 화면 안에서만 도는 어휘라 `lib/반피드백.js` 가 정본이고 아래 CHECK 가 그 사본이다.
--     사본을 없앨 수 없으니 기계에 물린다 — `tests/반피드백.test.js` 가 두 소스를 대조한다.
--
-- ■ 한 산출물에 한 마디 — 유일 제약으로 못박는다
--   두 벌을 허용하면 「기다리는 것 n」의 뜻이 즉시 갈린다(마디 수인가 산출물 수인가).
--   대신 **개서는 연다**(`on conflict do update`) — 삭제가 막힌 자리에서 개서까지 막으면
--   남는 통로가 0이 되고, 그때 우회가 정상 통로가 된다(F103 · 회고 조각과 같은 판단).
--   `updated_at` 을 둬서 고쳐 쓴 사실이 **행에 남게** 한다(개서를 열되 조용하지는 않게).
--
-- ■ 삭제는 막는다
--   강사가 낸 말은 사람 손에서만 나오므로 사라지면 소급이 안 된다 — 나침반·회고와 같다.
--
-- ■ 채우는 코드는 이 조각에 0줄이다 — 정직 표기
--   생산자 = `functions/teach` 의 `POST feedback/give` 이고 **같은 커밋**에 선다.
--   「표가 섰다」를 「강사 피드백이 돈다」로 읽지 않는다 — 라이브 붓기는 ⏳유호님 승인이고,
--   그 전까지 이 표의 행 수는 0이다.
--   ⚠ 아직 **없는 것**: 학생에게 배달하는 배선(§6 ㉡)과 시즌 롤오버는 여기에도, 어디에도 없다.
--
-- 되돌림: drop table if exists engine.teacher_notes;
--        drop function if exists engine.teacher_notes_protect();
--        delete from engine.schema_migrations where version = '20260812210000';

begin;

do $migration$
declare
  migration_version constant text := '20260812210000';
  migration_name constant text := '20260812210000_teacher_notes_c11.sql';
  expected_checksum constant text := '0b8347b2d9a9541c9601f7f4f2b69e5db675217bf4f2e2caa3bcbe2babbd818d'; -- migration-checksum
  base_version constant text := '20260812200000';
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

  if to_regclass('engine.classes') is null then
    raise exception
      'engine.classes 가 없다 — 한 마디는 반 안에서 나온다(20260812200000_class_c11 이 먼저 서야 한다)';
  end if;

  -- 강사 한 마디 — 산출물 하나에 하나. `body` 는 강사가 실제로 «보낸» 글이고,
  --   `origin` 은 그 글이 **어디서 왔나**(AI 문장 그대로냐 · 고쳤냐 · 직접 썼냐)다.
  --   ⚠ `origin` 을 안 두면 설계 §6 도전안(기본 동작을 「고르기」로)이 답 나는 날 마이그가
  --     한 벌 더 필요해지고, 그때는 이미 쌓인 행의 갈래를 **영원히 복원 못 한다**.
  --     지금 칸을 두면 어느 답이 나와도 화면 버튼만 갈리고 물리는 안 흔들린다.
  create table if not exists engine.teacher_notes (
    note_id       uuid primary key default gen_random_uuid(),
    submission_id uuid not null references engine.submissions(submission_id) on delete restrict,
    staff_id      uuid not null references engine.staff(staff_id),
    body          text not null constraint teacher_notes_body_nonblank_c11 check (btrim(body) <> ''),
    origin        text not null constraint teacher_notes_origin_c11
                    check (origin in ('as_is', 'edited', 'written')),
    disposition   text not null constraint teacher_notes_disposition_c11
                    check (disposition in ('confirmed', 'retry')),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz,
    schema_ver    text not null,
    constraint teacher_notes_once_c11 unique (submission_id)
  );

  comment on table engine.teacher_notes is
    '강사가 한 산출물에 낸 한 마디(강사_반단위_피드백_설계 §6 ㉠). 🚫corrections 아님 — actor_kind=teacher 는 「사람 직원」이라 검수 계보를 오염시킨다(§2).';

  -- 「이번 주 이 강사가 누구에게 한 마디를 냈나」가 이 인덱스를 탄다(설계 §5 한 수 더).
  create index if not exists teacher_notes_staff_created
    on engine.teacher_notes (staff_id, created_at);

  /* 삭제 금지 — 회고·나침반과 같다. 사람 손에서만 나오는 말은 사라지면 소급이 안 된다.
   * ⚠ 개서를 «같이» 막지 않는 이유는 머리말 참조(막으면 우회가 정상 통로가 된다 · F103). */
  create or replace function engine.teacher_notes_protect() returns trigger
    language plpgsql as $protect$
  begin
    raise exception '강사 한 마디는 삭제하지 않는다 — 사람이 낸 말은 소급이 안 된다(강사_반단위_피드백_설계 §6)';
  end
  $protect$;

  drop trigger if exists teacher_notes_protect on engine.teacher_notes;
  create trigger teacher_notes_protect
    before delete on engine.teacher_notes
    for each row execute function engine.teacher_notes_protect();

  -- engine 취급 그대로 — RLS 켜고 정책 0(전면 거부) · service_role 만 쓰기 · PostgREST 비노출.
  -- 나중에 노출하는 날 잊어도 **닫힌 채로 실패한다**.
  alter table engine.teacher_notes enable row level security;

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
  ('season_review','decided_by'), ('season_review','decided_at'),
  -- 가입 1회 문항(20260806150000 이 낸 열 · 20260812180000 이 값을 조인다).
  --   열이 사라지면 「지역 억양 편차의 유일한 축」이 통째로 없어지는데, 그 손실은 조용하다 —
  --   가입은 그대로 성공하고 세 칸만 안 쌓인다(2026-08-09 에 실제로 그 상태였다).
  ('learners','home_aimag'), ('learners','gender'), ('learners','goal_track'),
  -- 반(20260812200000) — 좌표·시즌·활성이 전부 있어야 「지난 시즌 반」을 닫을 수 있다.
  --   `class_key` 가 빠지면 시트와 대조할 자연키가 사라지고, 어긋난 날 증상은 조용함뿐이다.
  ('classes','class_key'), ('classes','season_id'), ('classes','display_name'),
  ('classes','active'), ('classes','schema_ver'),
  ('learners','class_id'),
  ('staff_classes','staff_id'), ('staff_classes','class_id'), ('staff_classes','schema_ver'),
  -- 강사 한 마디(20260812210000) — `origin` 이 빠지면 설계 §6 도전안이 답 나는 날 이미 쌓인
  --   행의 갈래를 영원히 복원 못 한다. `updated_at` 이 빠지면 개서가 조용해진다.
  ('teacher_notes','submission_id'), ('teacher_notes','staff_id'), ('teacher_notes','body'),
  ('teacher_notes','origin'), ('teacher_notes','disposition'),
  ('teacher_notes','updated_at'), ('teacher_notes','schema_ver')
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
  ('learners_home_aimag_c11'), ('learners_gender_c11'), ('learners_goal_track_c11'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  --   고리가 빠지면 없는 반·없는 강사를 가리키는 행이 앉고, 그건 화면에서 「빈 반」으로만 보인다.
  ('classes_pkey'), ('classes_key_nonblank_c11'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  -- 강사 한 마디(20260812210000) — 유일(한 산출물에 하나) + 값목록 둘 + 빈 말 금지 + 고리 둘.
  --   유일이 빠지면 「기다리는 것 n」의 뜻이 즉시 갈린다(마디 수인가 산출물 수인가).
  --   값목록이 빠지면 오타 갈래('writen')가 그대로 앉고, 그 행은 어느 갈래도 아니게 된다.
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c11'),
  ('teacher_notes_origin_c11'), ('teacher_notes_disposition_c11'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000) — 행이 사라지는 것만 막는다(개서는 촉진 세션의 정상 통로)
  ('season_compass_protect'),
  -- 회고(20260812170000) — 굳힌 근거 불변 + 학생 판정은 강사 「전」에만 + 삭제 금지.
  --   freeze 가 꺼지면 재계산한 숫자로 옛 판정을 덮어쓸 수 있고 그건 조용히 통과한다.
  ('season_review_freeze'), ('season_review_protect'),
  -- 강사 한 마디 삭제 금지(20260812210000)
  ('teacher_notes_protect')
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
  --    ⚠ `상태` 는 "char" 다 — text 와 직접 비교하면 Postgres 가 연산자를 못 고르고
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
  -- 🔑 16 → 17 (20260812210000): engine.teacher_notes 가 섰다.
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 5 (20260812170000 이 4 에서 올렸다). 이 조각도 이 수를 안 건드린다 — `teacher_notes` 의
  --    restrict 고리는 `submissions` 를 가리키지 learners 를 가리키지 않는다.
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
  -- 🔴 반(20260812200000): 같은 좌표가 두 벌 앉은 반 — 0이어야 한다.
  --    이 칸이 재는 것은 **부분 유일 인덱스 둘이 실제로 걸려 있는가**다. 빠지면 명부 스윕이
  --    매 판 같은 반을 새로 만들고 학생마다 다른 class_id 가 붙는데, 증상은 「강사 큐에
  --    학생이 몇 명 없다」뿐이라 조용하다.
  (select count(*) from (
     select class_key, season_id from engine.classes
      group by class_key, season_id having count(*) > 1) d) as 겹친반좌표,
  (select count(*) from pg_indexes
    where schemaname='engine'
      and indexname in ('classes_key_in_season','classes_key_no_season')) as 반좌표유일,
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
  (select count(*) from engine.skills) as 스킬시드수,
  -- 🔴 강사 한 마디(20260812210000): 한 산출물에 두 마디가 앉은 것 — 0이어야 한다.
  --    유일 «제약»의 존재는 위 빠진제약이 이미 본다. 이 칸이 재는 것은 **데이터**다 —
  --    제약을 떼고 부은 DB 에서는 이 수가 조용히 오르고, 그때부터 「기다리는 것 n」이
  --    산출물 수가 아니라 마디 수를 세게 된다(강사가 보는 숫자가 뜻을 잃는다).
  (select count(*) from (
     select submission_id from engine.teacher_notes
      group by submission_id having count(*) > 1) d2) as 겹친한마디
)
select case when 테이블수=17 and RLS켜짐=17 and 정책수=7
              and 새는테이블권한=0 and 새는스키마권한=0 and 삭제차단=5 and 실패상태=1
              and 이력정책=0 and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
              and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
              and 검수판열=22 and 검수판원문=0 and 근거없는라벨=0 and 목록밖프로필=0
              and 겹친반좌표=0 and 반좌표유일=2
              and 라디오표수=6 and 라디오RLS수=6 and 라디오정책수=0
              and 라디오새는권한=0 and 라디오새는스키마=0 and 라디오kind제약=1
              and 연동보호트리거=1 and 연동활성유일=1 and 스킬시드수=30
              and 겹친한마디=0
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260812210000'
              and (select checksum from 현재이력)='0b8347b2d9a9541c9601f7f4f2b69e5db675217bf4f2e2caa3bcbe2babbd818d' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 17·17·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260812200000_class_c11.sql` «뒤»에만 선다(base_version).
--    앞의 c11 조각들이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 **+1**(`teacher_notes`) · RLS **+1** · 정책 0 · 트리거 **+1**(삭제 금지) · 열 신설 9.
--    `삭제차단`(5)은 앞 조각 그대로다 — 이 조각의 restrict 고리는 `submissions` 를 가리킨다.
-- ② 새 칸 `겹친한마디` = **0**. 유일 «제약»의 존재는 `빠진제약` 이 이미 보므로 이 칸은
--    **데이터**만 잰다(앞 조각의 `겹친반좌표`+`반좌표유일` 두 칸이 필요했던 이유는 부분 인덱스가
--    pg_constraint 에 안 잡히기 때문이다 — 여기는 제약이라 한 칸으로 족하다).
-- ③ 이 조각은 **행을 하나도 안 만든다**. `engine.teacher_notes` 는 `POST feedback/give` 가
--    채운다 — 지금 0행이 정상이다. 「표가 섰다」를 「강사 피드백이 돈다」로 읽지 않는다.
-- ④ 🔴 아직 **없는 것** — ㉠에 앉은 한 마디를 학생 화면으로 배달하는 배선(§6 ㉡)이 없다.
--    지금 소비자는 강사 큐 하나뿐이고(「한 마디가 이미 있는 것」을 뺀다), 학생은 아직 못 본다.
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 셋을 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--      📏 앞 조각이 이 자리를 밟고 경고를 남겼는데 **이 조각도 그대로 밟았다**(위 ⓪의 파일명이
--        잡혔다) — 경고문은 다음 사람을 못 막는다. 막는 것은 이 회귀 하나다.
--    ⚠ `teacher_notes_once_c11` 은 여기 없다 — UNIQUE 라 CHECK 목록의 대상이 아니다.
--    기대: broadcast_segment_kind_c11 · classes_key_nonblank_c11
--         · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_gender_c11 · learners_goal_track_c11 · learners_home_aimag_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11 · teacher_notes_body_nonblank_c11
--         · teacher_notes_disposition_c11 · teacher_notes_origin_c11
-- 검수 콘솔 「오늘 수업 반」 뷰의 물리 — 숙제 서클 §10-3 조각
--
-- 정본 = SYNK-appsscript `docs/숙제서클_설계.md` §10-3 (유호님 확정 2026-08-13 「수업 첫 20분 =
--   서클(4인조 발화) ∥ 몽골쌤 순회 검수」 · 집행 지시 08-14) + `docs/검수_내부계약.md` §3-2(같은
--   커밋에서 개정). 교사는 조 옆에 앉아 손으로는 **그 조 4명의 AI 초안**을 넘기고 귀로는 브리핑을
--   듣는다(설계 §4) — 그 화면이 서려면 서버가 「이 제출물이 어느 반·어느 조·누구 것인가」를
--   낼 수 있어야 한다. 이 조각은 그 두 가지를 세운다: 조·좌석 거울 2칸 + 반 모드 전용 판.
--
-- ■ 🔴 왜 `review_queue` 를 넓히지 않고 **판을 따로** 세우나
--   기본 큐는 검수자에게 학생 정체를 **일부러 안 준다**(`20260807190000` — 검수자 = 전사 축).
--   그 판을 넓히면 모든 소비자가 이름을 받고, 「검수자가 봐도 되나」의 판정 지점(§3)이 소리 없이
--   지나간다. 반 모드는 다르다 — 순회 검수는 교사가 학생 **눈앞에** 앉아 있는 자리라, 이름 없이는
--   어느 초안이 그 학생 것인지 원리상 못 가른다(종이 서클 시트에도 같은 이름이 이미 인쇄돼 있다).
--   그래서 정체 열은 이 판에만 열고, 기본 큐는 바이트 그대로 둔다 — 어느 통로가 정체를 내는지가
--   판 이름으로 갈린다.
--
-- ■ 왜 `learners` 에 거울 2칸이고 새 표가 아닌가
--   조·좌석의 정본은 시트 `groups`(시즌×반 1벌 · `assignGroupsAll` 이 채운다)다. 여기는 그
--   **표시용 거울**이고, 아침 명부 스윕(`명부스윕_` → `roster-ingest`)이 매일 전체 스냅샷을 다시
--   부어 스스로 낫는다(명부가 이미 그 방식이다). 계보 표(`classes` 방식)로 안 세우는 이유:
--   `corrections`·사건 어느 것도 조를 참조하지 않는다 — 조는 화면 묶음 전용이라 «지금 값» 하나면
--   족하고, 시즌이 바뀌면 스윕이 그날 아침 덮는다. ⚠ null 이 정상 상태다(편성 전 · 배정 전).
--
-- ■ 채우는 코드는 이 조각에 0줄이다 — 정직 표기
--   생산자 = `명부스윕_`(appsscript)의 `조편성` 동봉 + `roster-ingest` 신판이고 **같은 트랙**에
--   선다. 🔴 `roster-ingest` 신판은 반피드백 §10-4 와 같은 ⏳유호님 승인 자리라, 이 조각도 그
--   승인에 얹혀 부어진다 — 그 전까지 운영·리허설 어디에도 미적용이고 두 칸은 어디에도 없다.
--   「판이 섰다」를 「반 모드가 돈다」로 읽지 않는다.
--
-- 되돌림: drop view if exists engine.review_queue_class;
--        alter table engine.learners drop column if exists group_no;
--        alter table engine.learners drop column if exists seat_no;
--        delete from engine.schema_migrations where version = '20260814100000';

begin;

do $migration$
declare
  migration_version constant text := '20260814100000';
  migration_name constant text := '20260814100000_review_class_c11.sql';
  expected_checksum constant text := '875ab1717d864025ef1e24c0445b3c72a975101f5950ade10f6d55798ccea340'; -- migration-checksum
  base_version constant text := '20260812210000';
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

  if to_regclass('engine.classes') is null then
    raise exception
      'engine.classes 가 없다 — 반 모드는 반 위에서만 선다(20260812200000_class_c11 이 먼저 서야 한다)';
  end if;

  if to_regclass('engine.review_queue') is null then
    raise exception
      'engine.review_queue 가 없다 — 반 판은 기본 판에서 파생한다(20260809050000_review_c10 이 먼저 서야 한다)';
  end if;

  -- ① 조·좌석 거울 — null 이 정상(편성 전). 상한 20 은 규모 못이 아니라 쓰레기 못이다:
  --    시트에서 좌표가 밀려 학번·전화가 이 칸으로 흘러든 날, 조용히 앉는 대신 여기서 죽는다
  --    (지금 조는 4개·좌석은 4이지만 편성 규모는 시트가 정하므로 느슨하게 둔다).
  alter table engine.learners
    add column group_no smallint constraint learners_group_no_c11 check (group_no between 1 and 20),
    add column seat_no  smallint constraint learners_seat_no_c11  check (seat_no  between 1 and 20);

  -- ② 반 모드 전용 판 — 기본 판 22열 + 정체 4열. `learning_events` 를 지나는 이유는
  --    `submissions` 가 learner_id 복제를 거부해서다(c10 머리말) — 제출의 주인은 사건이 안다.
  --    반이 없는 학생(class_id null)도 행은 나온다 — 자르는 것은 읽는 쪽의 where 다
  --    (판은 무엇을 보여줄지만 정한다 · `20260809050000` 머리말과 같은 축).
  create view engine.review_queue_class as
    select v.*,
           l.class_id,
           l.display_name,
           l.group_no,
           l.seat_no
      from engine.review_queue v
      join engine.learning_events e on e.event_id = v.event_id
      join engine.learners l on l.learner_id = e.learner_id;

  comment on view engine.review_queue_class is
    '검수 큐의 반 모드 판(숙제서클 §10-3 · 검수_내부계약 §3-2). 기본 판과 달리 학생 정체(이름·조·좌석)를 연다 — 순회 검수는 교사가 학생 눈앞에 앉는 자리라 정체 없이는 초안을 못 가른다. 소비자는 review Fn 의 ?class= 갈래 하나다.';

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
  ('season_review','decided_by'), ('season_review','decided_at'),
  -- 가입 1회 문항(20260806150000 이 낸 열 · 20260812180000 이 값을 조인다).
  --   열이 사라지면 「지역 억양 편차의 유일한 축」이 통째로 없어지는데, 그 손실은 조용하다 —
  --   가입은 그대로 성공하고 세 칸만 안 쌓인다(2026-08-09 에 실제로 그 상태였다).
  ('learners','home_aimag'), ('learners','gender'), ('learners','goal_track'),
  -- 반(20260812200000) — 좌표·시즌·활성이 전부 있어야 「지난 시즌 반」을 닫을 수 있다.
  --   `class_key` 가 빠지면 시트와 대조할 자연키가 사라지고, 어긋난 날 증상은 조용함뿐이다.
  ('classes','class_key'), ('classes','season_id'), ('classes','display_name'),
  ('classes','active'), ('classes','schema_ver'),
  ('learners','class_id'),
  ('staff_classes','staff_id'), ('staff_classes','class_id'), ('staff_classes','schema_ver'),
  -- 강사 한 마디(20260812210000) — `origin` 이 빠지면 설계 §6 도전안이 답 나는 날 이미 쌓인
  --   행의 갈래를 영원히 복원 못 한다. `updated_at` 이 빠지면 개서가 조용해진다.
  ('teacher_notes','submission_id'), ('teacher_notes','staff_id'), ('teacher_notes','body'),
  ('teacher_notes','origin'), ('teacher_notes','disposition'),
  ('teacher_notes','updated_at'), ('teacher_notes','schema_ver'),
  -- 조·좌석 거울(20260814100000 · 숙제서클 §10-3) — 빠지면 반 모드 판이 정의부터 죽는데,
  --   그 죽음은 합본을 부을 때만 보인다. 여기서 세면 「덜 부은 DB」가 이름으로 말한다.
  ('learners','group_no'), ('learners','seat_no')
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
  ('learners_home_aimag_c11'), ('learners_gender_c11'), ('learners_goal_track_c11'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  --   고리가 빠지면 없는 반·없는 강사를 가리키는 행이 앉고, 그건 화면에서 「빈 반」으로만 보인다.
  ('classes_pkey'), ('classes_key_nonblank_c11'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  -- 강사 한 마디(20260812210000) — 유일(한 산출물에 하나) + 값목록 둘 + 빈 말 금지 + 고리 둘.
  --   유일이 빠지면 「기다리는 것 n」의 뜻이 즉시 갈린다(마디 수인가 산출물 수인가).
  --   값목록이 빠지면 오타 갈래('writen')가 그대로 앉고, 그 행은 어느 갈래도 아니게 된다.
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c11'),
  ('teacher_notes_origin_c11'), ('teacher_notes_disposition_c11'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey'),
  -- 조·좌석 쓰레기 못(20260814100000) — 빠지면 시트 좌표 밀림이 조용히 앉는다.
  ('learners_group_no_c11'), ('learners_seat_no_c11')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000) — 행이 사라지는 것만 막는다(개서는 촉진 세션의 정상 통로)
  ('season_compass_protect'),
  -- 회고(20260812170000) — 굳힌 근거 불변 + 학생 판정은 강사 「전」에만 + 삭제 금지.
  --   freeze 가 꺼지면 재계산한 숫자로 옛 판정을 덮어쓸 수 있고 그건 조용히 통과한다.
  ('season_review_freeze'), ('season_review_protect'),
  -- 강사 한 마디 삭제 금지(20260812210000)
  ('teacher_notes_protect')
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
  --    ⚠ `상태` 는 "char" 다 — text 와 직접 비교하면 Postgres 가 연산자를 못 고르고
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
  -- 🔑 17 그대로(20260814100000): 이 조각은 표를 안 만든다 — 뷰 하나와 열 둘뿐이다.
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 5 (20260812170000 이 4 에서 올렸다). 이 조각도 이 수를 안 건드린다 — 새 FK 가 없다.
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
  -- 🔴 반(20260812200000): 같은 좌표가 두 벌 앉은 반 — 0이어야 한다.
  --    이 칸이 재는 것은 **부분 유일 인덱스 둘이 실제로 걸려 있는가**다. 빠지면 명부 스윕이
  --    매 판 같은 반을 새로 만들고 학생마다 다른 class_id 가 붙는데, 증상은 「강사 큐에
  --    학생이 몇 명 없다」뿐이라 조용하다.
  (select count(*) from (
     select class_key, season_id from engine.classes
      group by class_key, season_id having count(*) > 1) d) as 겹친반좌표,
  (select count(*) from pg_indexes
    where schemaname='engine'
      and indexname in ('classes_key_in_season','classes_key_no_season')) as 반좌표유일,
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
  (select count(*) from engine.skills) as 스킬시드수,
  -- 🔴 강사 한 마디(20260812210000): 한 산출물에 두 마디가 앉은 것 — 0이어야 한다.
  --    유일 «제약»의 존재는 위 빠진제약이 이미 본다. 이 칸이 재는 것은 **데이터**다 —
  --    제약을 떼고 부은 DB 에서는 이 수가 조용히 오르고, 그때부터 「기다리는 것 n」이
  --    산출물 수가 아니라 마디 수를 세게 된다(강사가 보는 숫자가 뜻을 잃는다).
  (select count(*) from (
     select submission_id from engine.teacher_notes
      group by submission_id having count(*) > 1) d2) as 겹친한마디,
  -- ── 반 모드 판(20260814100000 · 숙제서클 §10-3) ──
  -- 판이 서 있는가 — 기본 판(검수뷰)과 별개로 센다(둘 중 하나만 선 DB 가 실재할 수 있다).
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue_class') as 반검수뷰,
  -- 기본 22열 + 정체 4열(class_id·display_name·group_no·seat_no). 수로 재야 「덜 넓힌 판」이 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class') as 반검수판열,
  -- 정체는 열되 원문 셋은 반 모드에서도 안 연다 — 기본 판의 「검수판원문=0」과 같은 못이다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 반검수판원문
)
select case when 테이블수=17 and RLS켜짐=17 and 정책수=7
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
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260814100000'
              and (select checksum from 현재이력)='875ab1717d864025ef1e24c0445b3c72a975101f5950ade10f6d55798ccea340' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 17·17·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260812210000` «뒤»에만 선다(base_version). 앞의 c11 조각들과
--    `roster-ingest` 신판이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 **0** · 뷰 **+1**(`review_queue_class`) · 열 **+2**(`learners.group_no`·`seat_no`) ·
--    트리거 0 · RLS 변화 0(뷰는 RLS 대상이 아니고 정책 0·grant 0 이라 닫힌 채로 태어난다 —
--    `새는테이블권한` 이 뷰까지 세므로 열리는 날 빨개진다).
-- ② 새 칸 셋 = `반검수뷰`(1) · `반검수판열`(26) · `반검수판원문`(0). 수로 재는 이유는
--    「덜 넓힌 판」과 「안 선 판」이 존재 검사에서 같은 모양이기 때문이다.
-- ③ 이 조각은 **행을 하나도 안 바꾼다**. 두 칸은 `명부스윕_` 의 `조편성` 동봉 +
--    `roster-ingest` 신판이 채운다 — 지금 전원 null 이 정상이다(편성 전).
--    「판이 섰다」를 「반 모드가 돈다」로 읽지 않는다.
-- ④ 🔴 아직 **없는 것** — 이 판을 읽는 통로(`review` Fn 의 `?class=` 갈래·`classes` 경로)는
--    같은 트랙의 코드 커밋에 선다. 운영 재배포는 ⏳유호님 승인 자리다(반피드백 §10-4 와 같다).
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 둘을 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `teacher_notes_once_c11` 은 여기 없다 — UNIQUE 라 CHECK 목록의 대상이 아니다.
--    기대: broadcast_segment_kind_c11 · classes_key_nonblank_c11
--         · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_gender_c11 · learners_goal_track_c11 · learners_group_no_c11
--         · learners_home_aimag_c11 · learners_seat_no_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11 · teacher_notes_body_nonblank_c11
--         · teacher_notes_disposition_c11 · teacher_notes_origin_c11
-- companion 빈칸 로그의 물리 — 마스코트 배선 §7 1단계 서버층 조각
--
-- 정본 = talk `docs/컴패니언_내부계약.md` §4 (사슬: appsscript `마스코트_말할순간_설계.md` v1.1 →
--   `마스코트_배선_설계.md` v1 → 그 계약). 강사가 마스코트에게 묻고, 마스코트가 동봉된 학원
--   문서로 답하거나 원장에게 넘긴다 — 이 조각은 그 **묻고 답한 것이 남는 자리**를 세운다.
--
-- ■ 🔴 왜 새 표인가 — `staff_access_log` 를 안 넓힌다
--   실측: `engine.staff_access_log` 는 `(action, target_ids)` 뿐이라 질문·답·출처를 못 싣는다.
--   배선 §1 의 「새 테이블 0」은 **발화 기록·수집**에 대한 계약이었고(학생 사건은 기존 표로 간다),
--   B층 빈칸 로그는 그 표가 애초에 자리를 안 팠다. 억지로 넓히면 감사표가 두 일을 하게 되고,
--   그 표는 지금 다섯 문이 공유한다 — 한 문의 사정으로 넓힌 열은 나머지 넷에게 영원히 null 이다.
--
-- ■ 🔴 이 표가 **산출물**이다 (배선 §4 「Fn 이 자기 감사로 남긴다」의 실물)
--   「출처 0 으로 답한 질문」과 「인계한 질문」이 곧 «문서에 아직 없는 것»의 목록이다.
--   그래서 companion Fn 은 qa 행과 감사 행을 **한 트랜잭션**에 쓰고, 못 쓰면 답도 안 낸다 —
--   나누면 답은 나갔는데 목록엔 없는 질문이 생기고, 그 손실은 증상이 없다
--   (「그 질문은 안 왔다」와 「로그가 실패했다」가 같은 모양으로 보인다).
--
-- ■ append-only 인 이유 — 개서까지 막는다(`teacher_notes` 와 갈린다)
--   한 마디는 사람이 쓴 글이라 고치는 것이 정상 통로였다(그래서 삭제만 막았다). 여기는 반대다:
--   이 표는 **그때 모델이 뭐라고 답했나**의 기록이고, 고칠 수 있으면 「그날 뭐라고 답했길래
--   강사가 그렇게 말했나」를 영원히 못 묻는다. 고칠 것이 있으면 새로 물어 새 행을 쌓는다.
--
-- ■ 정책 0 — 아무 토큰에게도 안 연다 (감사표 선례)
--   여기엔 강사가 **자기 말로 쓴 질문**이 그대로 앉는다. 강사가 학생 이름을 적어 물어도 우리는
--   막을 수 없다(강사의 입력이다) — 우리가 «더하는» 식별자가 0인 것까지가 ㉣의 이 층 몫이고,
--   그 위에 「아무도 못 읽는다」를 하나 더 얹는다. 원장이 읽는 통로는 2단계가 낸다.
--
-- ■ 채우는 코드는 이 조각에 0줄이다 — 정직 표기
--   생산자 = talk `supabase/functions/companion`(같은 커밋). 🔴 운영 붓기는 기존 c11 조각들과
--   **같은 ⏳유호님 승인 자리**에 얹힌다 — 그 전까지 운영·리허설 어디에도 미적용이고 이 표는
--   어디에도 없다. 「판이 섰다」를 「마스코트가 답한다」로 읽지 않는다.
--
-- 되돌림:
--   drop trigger if exists companion_qa_immutable on engine.companion_qa;
--   drop table if exists engine.companion_qa;
--   delete from engine.schema_migrations where version = '20260814110000';

begin;

do $migration$
declare
  migration_version constant text := '20260814110000';
  migration_name constant text := '20260814110000_companion_c11.sql';
  expected_checksum constant text := '0502ada7ba7490044cea9874dcf8a58b395bd7e3e9d02a729269da805dee10fd'; -- migration-checksum
  base_version constant text := '20260814100000';
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

  if to_regclass('engine.staff') is null then
    raise exception
      'engine.staff 가 없다 — 이 로그의 주체는 직원이다(20260806234000_staff_c7 이 먼저 서야 한다)';
  end if;

  -- 강사가 마스코트에게 물은 것과 받은 답. 한 질문 = 한 행.
  --   `answer` 가 빈 문자열이면 **인계**다(계약 §2: reply 빈 문자열 = 인계).
  --   `cited_refs` 는 Fn 이 동봉 문서명 화이트리스트로 거른 뒤의 값이다 — 목록 밖 이름은
  --   여기 도착하기 전에 버려진다. 그래서 이 열은 「모델이 주장한 출처」가 아니라 「실재하는 출처」다.
  create table if not exists engine.companion_qa (
    qa_id          uuid primary key default gen_random_uuid(),
    staff_id       uuid not null references engine.staff(staff_id),
    at             timestamptz not null default now(),
    -- 강사가 보고 있던 앱 화면 이름. 맥락일 뿐이라 없어도 된다(자유 문자열 · 계약 §2).
    screen         text,
    question       text not null constraint companion_qa_question_nonblank_c11
                     check (btrim(question) <> ''),
    -- 빈 문자열 = 인계. null 이 아니라 빈 문자열인 이유: 「답이 없다」와 「칸을 안 썼다」를
    --   가르지 않으려는 것이다 — 이 표에서 그 둘은 같은 사건이고, 갈래를 늘리면 소비자가 둘 다 본다.
    answer         text not null default '',
    cited_refs     text[] not null default '{}',
    handoff        boolean not null,
    handoff_reason text,
    -- 어느 모델·어느 프롬프트판이 낸 답인가. 없으면 「그때 왜 그렇게 답했나」를 소급 못 한다.
    model          text not null,
    prompt_ver     text not null,
    -- 🔴 답도 인계도 없는 행을 막는다 — 그건 「답한 척」이 로그로 남는 자리다.
    --   빈칸 발견기가 이 표를 세는데, 그 행이 섞이면 분모가 조용히 오염된다.
    constraint companion_qa_answer_paired_c11 check (handoff or btrim(answer) <> '')
  );

  comment on table engine.companion_qa is
    '강사가 마스코트에게 물은 것과 받은 답(컴패니언_내부계약 §4). 「출처 0으로 답한 질문」·「인계한 질문」이 문서 일감 큐의 재료다. 🚫학생 사건 아님 — learning_events 로 안 간다.';

  -- 「이번 주 넘어간 질문」·「출처 0인 질문」이 이 인덱스를 탄다(빈칸 발견기의 조회 모양).
  create index if not exists companion_qa_handoff_at
    on engine.companion_qa (handoff, at);

  -- append-only. 고칠 수 있으면 「그날 뭐라고 답했나」를 영원히 못 묻는다(머리말 참조).
  drop trigger if exists companion_qa_immutable on engine.companion_qa;
  create trigger companion_qa_immutable
    before update or delete on engine.companion_qa
    for each row execute function engine.reject_mutation();

  -- engine 취급 그대로 — RLS 켜고 정책 0(전면 거부) · service_role 만 쓰기 · PostgREST 비노출.
  -- 나중에 노출하는 날 잊어도 **닫힌 채로 실패한다**.
  alter table engine.companion_qa enable row level security;

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
  ('season_review','decided_by'), ('season_review','decided_at'),
  -- 가입 1회 문항(20260806150000 이 낸 열 · 20260812180000 이 값을 조인다).
  --   열이 사라지면 「지역 억양 편차의 유일한 축」이 통째로 없어지는데, 그 손실은 조용하다 —
  --   가입은 그대로 성공하고 세 칸만 안 쌓인다(2026-08-09 에 실제로 그 상태였다).
  ('learners','home_aimag'), ('learners','gender'), ('learners','goal_track'),
  -- 반(20260812200000) — 좌표·시즌·활성이 전부 있어야 「지난 시즌 반」을 닫을 수 있다.
  --   `class_key` 가 빠지면 시트와 대조할 자연키가 사라지고, 어긋난 날 증상은 조용함뿐이다.
  ('classes','class_key'), ('classes','season_id'), ('classes','display_name'),
  ('classes','active'), ('classes','schema_ver'),
  ('learners','class_id'),
  ('staff_classes','staff_id'), ('staff_classes','class_id'), ('staff_classes','schema_ver'),
  -- 강사 한 마디(20260812210000) — `origin` 이 빠지면 설계 §6 도전안이 답 나는 날 이미 쌓인
  --   행의 갈래를 영원히 복원 못 한다. `updated_at` 이 빠지면 개서가 조용해진다.
  ('teacher_notes','submission_id'), ('teacher_notes','staff_id'), ('teacher_notes','body'),
  ('teacher_notes','origin'), ('teacher_notes','disposition'),
  ('teacher_notes','updated_at'), ('teacher_notes','schema_ver'),
  -- 조·좌석 거울(20260814100000 · 숙제서클 §10-3) — 빠지면 반 모드 판이 정의부터 죽는데,
  --   그 죽음은 합본을 부을 때만 보인다. 여기서 세면 「덜 부은 DB」가 이름으로 말한다.
  ('learners','group_no'), ('learners','seat_no')
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
  ('learners_home_aimag_c11'), ('learners_gender_c11'), ('learners_goal_track_c11'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  --   고리가 빠지면 없는 반·없는 강사를 가리키는 행이 앉고, 그건 화면에서 「빈 반」으로만 보인다.
  ('classes_pkey'), ('classes_key_nonblank_c11'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  -- 강사 한 마디(20260812210000) — 유일(한 산출물에 하나) + 값목록 둘 + 빈 말 금지 + 고리 둘.
  --   유일이 빠지면 「기다리는 것 n」의 뜻이 즉시 갈린다(마디 수인가 산출물 수인가).
  --   값목록이 빠지면 오타 갈래('writen')가 그대로 앉고, 그 행은 어느 갈래도 아니게 된다.
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c11'),
  ('teacher_notes_origin_c11'), ('teacher_notes_disposition_c11'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey'),
  -- 조·좌석 쓰레기 못(20260814100000) — 빠지면 시트 좌표 밀림이 조용히 앉는다.
  ('learners_group_no_c11'), ('learners_seat_no_c11'),
  -- companion 빈칸 로그(20260814110000) — 질문이 비면 로그가 아니고,
  --   답도 인계도 없으면 「답한 척」이 행으로 남는다.
  ('companion_qa_question_nonblank_c11'), ('companion_qa_answer_paired_c11'),
  ('companion_qa_staff_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000) — 행이 사라지는 것만 막는다(개서는 촉진 세션의 정상 통로)
  ('season_compass_protect'),
  -- 회고(20260812170000) — 굳힌 근거 불변 + 학생 판정은 강사 「전」에만 + 삭제 금지.
  --   freeze 가 꺼지면 재계산한 숫자로 옛 판정을 덮어쓸 수 있고 그건 조용히 통과한다.
  ('season_review_freeze'), ('season_review_protect'),
  -- 강사 한 마디 삭제 금지(20260812210000)
  ('teacher_notes_protect'),
  -- companion 빈칸 로그 개서·삭제 금지(20260814110000)
  ('companion_qa_immutable')
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
  --    ⚠ `상태` 는 "char" 다 — text 와 직접 비교하면 Postgres 가 연산자를 못 고르고
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
  -- 🔑 17 그대로(20260814100000): 이 조각은 표를 안 만든다 — 뷰 하나와 열 둘뿐이다.
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 5 (20260812170000 이 4 에서 올렸다). 이 조각도 이 수를 안 건드린다 — 새 FK 가 없다.
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
  -- 🔴 반(20260812200000): 같은 좌표가 두 벌 앉은 반 — 0이어야 한다.
  --    이 칸이 재는 것은 **부분 유일 인덱스 둘이 실제로 걸려 있는가**다. 빠지면 명부 스윕이
  --    매 판 같은 반을 새로 만들고 학생마다 다른 class_id 가 붙는데, 증상은 「강사 큐에
  --    학생이 몇 명 없다」뿐이라 조용하다.
  (select count(*) from (
     select class_key, season_id from engine.classes
      group by class_key, season_id having count(*) > 1) d) as 겹친반좌표,
  (select count(*) from pg_indexes
    where schemaname='engine'
      and indexname in ('classes_key_in_season','classes_key_no_season')) as 반좌표유일,
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
  (select count(*) from engine.skills) as 스킬시드수,
  -- 🔴 강사 한 마디(20260812210000): 한 산출물에 두 마디가 앉은 것 — 0이어야 한다.
  --    유일 «제약»의 존재는 위 빠진제약이 이미 본다. 이 칸이 재는 것은 **데이터**다 —
  --    제약을 떼고 부은 DB 에서는 이 수가 조용히 오르고, 그때부터 「기다리는 것 n」이
  --    산출물 수가 아니라 마디 수를 세게 된다(강사가 보는 숫자가 뜻을 잃는다).
  (select count(*) from (
     select submission_id from engine.teacher_notes
      group by submission_id having count(*) > 1) d2) as 겹친한마디,
  -- ── 반 모드 판(20260814100000 · 숙제서클 §10-3) ──
  -- 판이 서 있는가 — 기본 판(검수뷰)과 별개로 센다(둘 중 하나만 선 DB 가 실재할 수 있다).
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue_class') as 반검수뷰,
  -- 기본 22열 + 정체 4열(class_id·display_name·group_no·seat_no). 수로 재야 「덜 넓힌 판」이 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class') as 반검수판열,
  -- 정체는 열되 원문 셋은 반 모드에서도 안 연다 — 기본 판의 「검수판원문=0」과 같은 못이다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 반검수판원문,
  -- ── companion 빈칸 로그(20260814110000 · 컴패니언_내부계약 §4) ──
  -- 11열 = qa_id·staff_id·at·screen·question·answer·cited_refs·handoff·handoff_reason·model·prompt_ver
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='companion_qa') as 컴패니언열,
  -- 이 표에는 어떤 토큰에게도 열지 않는다(감사표 선례) — 정책이 하나라도 붙으면 여기서 빨개진다.
  (select count(*) from pg_policies
    where schemaname='engine' and tablename='companion_qa') as 컴패니언정책
)
select case when 테이블수=18 and RLS켜짐=18 and 정책수=7
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
              and 컴패니언열=11 and 컴패니언정책=0
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260814110000'
              and (select checksum from 현재이력)='0502ada7ba7490044cea9874dcf8a58b395bd7e3e9d02a729269da805dee10fd' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 18·18·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260814100000` «뒤»에만 선다(base_version). 앞의 c11 조각들과
--    `roster-ingest` 신판이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
-- ① 표 **+1**(`companion_qa`) · 뷰 0 · 열 0(기존 표는 안 건드린다) · 트리거 **+1**
--    (`companion_qa_immutable`) · RLS **+1**(새 표 · 정책 0·grant 0 이라 닫힌 채로 태어난다 —
--    `새는테이블권한` 이 열리는 날 빨개진다).
-- ② 새 칸 둘 = `컴패니언열`(11) · `컴패니언정책`(0). 열을 **수로** 재는 이유는 「덜 넓힌 판」과
--    「안 선 판」이 존재 검사에서 같은 모양이기 때문이다(반 모드 판의 그 사유 그대로).
--    정책을 따로 세는 이유는 다르다 — 이 표는 감사표 선례로 **아무 토큰에게도 안 여는 것**이
--    설계인데, `정책수=7` 은 전체 합이라 여기에 하나 붙고 다른 데서 하나 빠지면 상쇄된다.
-- ③ 이 조각은 **행을 하나도 안 만든다**. 채우는 것은 `functions/companion`(같은 커밋)이고,
--    그 Fn 은 운영 재배포 ⏳유호님 승인 자리다 — 지금 0행이 정상이다.
--    「판이 섰다」를 「마스코트가 답한다」로 읽지 않는다.
-- ④ 🔴 아직 **없는 것** — 원장이 이 목록을 읽는 통로(빈칸 목록 화면·주간 수확)는 2단계다.
--    그래서 계약 §6 의 ④ 게이트는 이 커밋 시점에 **✓✗✗** 가 정직한 표기다
--    (모였나 ✓ = 적재 배선이 섰다 / 닿았나 ✗ / 늘었나 ✗).
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 둘을 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `teacher_notes_once_c11`·`companion_qa_*_fkey` 는 여기 없다 — UNIQUE·FK 라 CHECK 목록의
--      대상이 아니다(기대제약 목록에는 FK 도 들어가지만 이 줄은 CHECK 만 센다).
--    기대: broadcast_segment_kind_c11 · classes_key_nonblank_c11
--         · companion_qa_answer_paired_c11 · companion_qa_question_nonblank_c11
--         · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · learners_gender_c11 · learners_goal_track_c11 · learners_group_no_c11
--         · learners_home_aimag_c11 · learners_seat_no_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11 · teacher_notes_body_nonblank_c11
--         · teacher_notes_disposition_c11 · teacher_notes_origin_c11
/* 회차 단위 장부 — cron 이 «무엇을 냈는지»를 오래 사는 표에 남긴다 (조용한 실패 장부 ④)
 *
 * ■ 왜 이 조각인가 — 계기는 추측이 아니라 실측이다(2026-08-15 07:30Z · 운영 qiwxeddwwnzkwalpsuty):
 *   · `cron.job_run_details` : **972건 · 6일치**(08-09~)가 살아 있고 **전부 `succeeded`**.
 *     `net.http_post` 는 **비동기 발사**라 SQL 은 함수가 죽어도 성공한다 — 이 표는
 *     「회차가 돌았나」까지만 말하고 「무엇을 냈나」는 **원리상 못 본다**.
 *   · `net._http_response` : **42건 · 5시간 50분치**뿐(`pg_net.ttl = 6 hours` 실측). 그리고 열이
 *     `id·status_code·content_type·headers·content·timed_out·error_msg·created` 라 **url 이 없다**.
 *     응답만 걷어서는 「어느 cron 이었나」를 **가릴 재료가 없다**.
 *   · 겹치는 구간 = 972 중 42 = **4.3%**. 회차의 95.7% 는 「돌았다」만 남고 결과는 영영 모른다.
 *
 * 🔴 그래서 장부에 적혀 있던 처방(「응답 표를 걷어 표에 옮기면 된다 — cron 4개 한꺼번에」)은
 *   **그것만으로 안 선다.** 부르는 쪽이 발사 번호를 스스로 적어야 귀속이 산다. 그 자리가 여기다.
 *
 * 🔑 **SQL 층에서 죽는 갈래가 따로 있다** — 리허설 실측: radio 잡이 `url` NULL(vault 시크릿 빈칸)로
 *   **16회 전부** 죽어 HTTP 호출이 0회였고, 15시간 동안 아무도 몰랐다. 그 실패는 응답 표에
 *   **도달조차 못 한다**. `ops.발사()` 가 그 예외를 잡아 «발사실패» 로 적는다.
 *
 * ⛔ 엣지 함수는 한 줄도 안 바꾼다. 잡 이름·주기·URL·헤더·본문 전부 그대로다 —
 *   바뀌는 것은 「누가 http_post 를 부르는가」 하나뿐(직접 → `ops.발사` 경유).
 *   URL 조립을 **잡 몸통에 그대로 둔 것은 일부러다**: `tests/조용한실패.test.js` 가 마이그레이션에서
 *   「이어붙인 함수 경로」를 훑어 cron 함수 목록을 뽑는다. 함수 안으로 감추면 그 분모가 조용히 낡는다.
 *   ⚠ 그래서 이 파일의 **주석에도** 그 꼴을 예시로 적지 않는다 — 주석 한 줄이 그 목록에 유령을
 *     하나 더한다(초판이 그랬고 `tests/회차장부.test.js` 가 잡았다).
 *
 * ⚠ **대가 — 장부가 본업을 막으면 안 된다.** `ops.발사()` 는 http_post 를 **먼저** 하고, 장부 기입은
 *   따로 감싸 실패해도 삼킨다(부르는 일은 이미 끝났으므로). 장부가 통째로 깨져도 cron 은 계속 부른다.
 *   틀릴 때의 모습: 장부는 비었는데 함수는 정상 동작 — 그래서 `ops.회차_대조` 가
 *   `cron.job_run_details` 와 건수를 맞대 「돈 횟수 > 적힌 횟수」를 드러낸다(자기 침묵을 자기가 못 봄 방지).
 *
 * 🔑 제약 이름은 `_c11` 을 **붙인다**. 처음엔 「ops 는 계약 밖이니 접미사도 빼자」고 지었는데,
 *   `tests/L0스키마.test.js` 가 **저장소의 모든 CHECK** 에 계약 접미사를 요구한다(실측으로 빨개졌다).
 *   그 규칙이 옳다 — 접미사 없는 제약은 계약이 올라갈 때 「고쳐야 하나」를 아무도 안 묻게 된다.
 *   대신 이 조각은 engine·radio 를 한 칸도 안 건드리므로 판정 블록의 기대값은 앞 조각 것 그대로다.
 *
 * 되돌림:
 *   select cron.unschedule('ops-harvest');
 *   -- 잡 넷을 옛 몸통으로: 20260809070000 / 20260812130000 조각의 cron.schedule 블록 재실행
 *   drop schema ops cascade;
 *   delete from engine.schema_migrations where version='20260815080000'; */

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $migration$
declare
  migration_version constant text := '20260815080000';
  migration_name constant text := '20260815080000_cron_ledger_c11.sql';
  expected_checksum constant text := 'f469945ef1f94713ef9636fdb66181aa4e0e50cb61ba3dcdaae8c3d3f2261166'; -- migration-checksum
  base_version constant text := '20260814110000';
  recorded_checksum text;
  걸린잡수 int;
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

  /* ── ① 관측층 스키마 ─────────────────────────────────────────────────────
   * engine·radio 와 나란히 두지 않는다 — 학습 계약(c11)의 표가 아니라 운영 관측 표다.
   * 계약 표에 섞으면 c11 판정·왕복시험·권한 검사가 전부 이 표까지 재게 된다. */
  create schema if not exists ops;

  /* ── ② 회차 장부 본체 ────────────────────────────────────────────────────
   * 한 행 = 「cron 이 함수를 한 번 불렀다」. `pipeline_jobs` 로는 못 앉는 단위다
   * (거긴 `submission_id unique` 라 제출 단위이고, 회차·재시도가 구조적으로 안 들어간다). */
  create table if not exists ops.cron_runs (
    id           bigserial primary key,
    jobname      text        not null,
    /* net.http_post 가 준 발사 번호. null = 발사 자체가 못 나갔다(리허설 16건의 모양). */
    request_id   bigint,
    queued_at    timestamptz not null default now(),
    outcome      text        not null,
    status_code  integer,
    timed_out    boolean,
    error_msg    text,
    /* 봉투 본문 — ②가 talk 에 붙인 «왜»(사유 칸)가 여기로 흘러 들어와 오래 산다. */
    body         text,
    harvested_at timestamptz,
    /* 🔑 닫힌 어휘로 못박는다 — 오타 하나가 조용히 새 갈래를 만들면 분모가 갈라진다.
     *   그건 이 장부가 없애려던 실패 모양 그 자체다. */
    constraint cron_runs_outcome_c11 check (outcome in
      ('대기', '성공', '실패', '타임아웃', '전송오류', '상태없음', '유실', '발사실패'))
  );

  /* 수확이 매번 훑는 자리는 «대기» 뿐이다 — 부분 인덱스라 표가 커져도 비용이 안 는다. */
  create index if not exists cron_runs_대기_idx on ops.cron_runs (request_id) where outcome = '대기';
  create index if not exists cron_runs_시각_idx on ops.cron_runs (queued_at desc);

  /* 🔒 학생 토큰에게는 존재하지 않는 표다(철학 ㉣ 계열 — 운영 관측치는 밖으로 안 나간다).
   *   RLS 를 켜고 정책은 **하나도 안 만든다** = service_role 만 본다(그건 RLS 를 우회한다). */
  alter table ops.cron_runs enable row level security;
  revoke all on schema ops from anon, authenticated;
  revoke all on ops.cron_runs from anon, authenticated;

  /* ── ③ 발사 — 부르고, 번호를 적는다 ──────────────────────────────────────
   * 순서가 곧 안전 설계다: http_post 가 **먼저**, 장부는 그 뒤. 장부가 터져도 호출은 이미 나갔다. */
  create or replace function ops.발사(p_job text, p_url text) returns bigint
  language plpgsql
  as $fn$
  declare
    rid bigint;
  begin
    select net.http_post(
             url     := p_url,
             headers := jsonb_build_object(
                          'Content-Type',  'application/json',
                          'Authorization', 'Bearer ' ||
                            (select decrypted_secret from vault.decrypted_secrets
                              where name = 'service_role_key')),
             body    := '{}'::jsonb)
      into rid;

    begin
      insert into ops.cron_runs(jobname, request_id, outcome) values (p_job, rid, '대기');
    exception when others then
      /* 장부가 본업을 못 막는다 — 부르는 일은 위에서 이미 끝났다. */
      null;
    end;
    return rid;
  exception when others then
    /* 여기까지 왔다 = http_post 가 **못 나갔다**(URL NULL · 시크릿 빈칸 · 확장 없음 · 권한).
     * 리허설에서 16회 전부 이 모양이었고, 응답 표에는 흔적이 하나도 안 남았다. */
    insert into ops.cron_runs(jobname, request_id, outcome, error_msg)
         values (p_job, null, '발사실패', left(sqlerrm, 500));
    return null;
  end
  $fn$;

  /* ── ④ 수확 — 6시간 안에 응답을 옮겨 적는다 ──────────────────────────────
   * `pg_net.ttl = 6 hours`(실측)라, 이 함수가 도는 주기가 곧 「무엇을 냈는지」의 보존 기간이다. */
  create or replace function ops.수확() returns jsonb
  language plpgsql
  as $fn$
  declare
    v수확 int := 0;
    v유실 int := 0;
  begin
    update ops.cron_runs r
       set status_code  = resp.status_code,
           timed_out    = resp.timed_out,
           error_msg    = resp.error_msg,
           body         = left(resp.content, 2000),
           harvested_at = now(),
           outcome      = case
                            when coalesce(resp.timed_out, false)      then '타임아웃'
                            when resp.error_msg is not null           then '전송오류'
                            when resp.status_code is null             then '상태없음'
                            when resp.status_code between 200 and 299 then '성공'
                            else '실패'
                          end
      from net._http_response resp
     where resp.id = r.request_id
       and r.outcome = '대기';
    get diagnostics v수확 = row_count;

    /* 끝내 응답이 안 온 것 = 유실. 요청 타임아웃이 5초라 30분이면 넉넉하다 —
     * 이 칸이 0이 아닌 날은 pg_net 자체가 밀렸다는 뜻이고, 그것도 알아야 할 사실이다. */
    update ops.cron_runs
       set outcome = '유실', harvested_at = now()
     where outcome = '대기'
       and queued_at < now() - interval '30 minutes';
    get diagnostics v유실 = row_count;

    return jsonb_build_object('수확', v수확, '유실', v유실);
  end
  $fn$;

  /* ── ⑤ 읽는 자리 ─────────────────────────────────────────────────────────
   * 🔑 ③(건 단위 사유)이 «writer 만 세우고 reader 0» 으로 끝난 자리를 여기서 반복하지 않는다.
   *   두 뷰가 각각 다른 질문에 답한다 — 하나로 합치면 어느 쪽이 침묵인지 안 보인다. */

  /* 「무엇을 냈나」 — 분모를 갈래로 쪼갠다(합계만 보면 좋은 0과 안 재본 0이 같은 모양이다). */
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
         max(queued_at) filter (where outcome <> '성공')     as 마지막이상
    from ops.cron_runs
   where queued_at > now() - interval '7 days'
   group by jobname;

  /* 「장부 자신이 침묵하고 있나」 — cron 은 돌았는데 행이 없으면 여기서 드러난다.
   * 가드는 자기 전처리에 눈이 먼다: `ops.발사` 가 통째로 안 불리면 위 요약은 **조용히 비어 있다**. */
  create or replace view ops.회차_대조 as
  with 돈것 as (
    select j.jobname, count(*) as 돈횟수, max(d.start_time) as 마지막회차,
           count(*) filter (where d.status <> 'succeeded') as SQL층실패
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where d.start_time > now() - interval '24 hours'
     group by j.jobname
  ), 적힌것 as (
    select jobname, count(*) as 적힌횟수
      from ops.cron_runs
     where queued_at > now() - interval '24 hours'
     group by jobname
  )
  select coalesce(돈것.jobname, 적힌것.jobname)                  as jobname,
         coalesce(돈횟수, 0)                                    as 돈횟수,
         coalesce(적힌횟수, 0)                                   as 적힌횟수,
         coalesce(돈횟수, 0) - coalesce(적힌횟수, 0)              as 안적힌횟수,
         coalesce(SQL층실패, 0)                                 as SQL층실패,
         마지막회차
    from 돈것 full join 적힌것 on 돈것.jobname = 적힌것.jobname;

  /* ── ⑥ 잡 넷을 장부 경유로 다시 건다(이름·주기·URL 불변) ────────────────
   * ⛔ **잡을 «새로» 만들지 않는다 — 이미 걸린 것만 다시 건다.**
   *   20260809070000·20260812130000 두 조각은 「리허설엔 일부러 안 붓는다」를 정책으로 적어 뒀다
   *   (스케줄러가 돌면 옆 세션 왕복시험의 원장·엔진 상태를 흔든다). 그 정책을 이 조각이 조용히
   *   깨면 안 된다 — 리허설은 `cron.job` 0행이라(실측 08-15) 아래 분기가 통째로 안 돈다.
   * 🔑 판정을 «환경 이름»이 아니라 «지금 상태»로 한다. 이름으로 가르면 프로젝트가 늘어나는 날
   *   조용히 틀리고, 그 틀림은 「잡이 안 걸렸다」가 아니라 「잡이 더 걸렸다」로 나온다. */
  select count(*) into 걸린잡수
    from cron.job
   where jobname in ('deliver-daily', 'deliver-check', 'transcribe-batch', 'radio-promote-hourly');

  if 걸린잡수 = 0 then
    raise notice '[cron_ledger] 잡이 하나도 안 걸린 DB 다 — 표·함수·뷰만 세우고 스케줄은 건드리지 않는다(리허설 정책).';
  else

  perform cron.unschedule(jobname)
    from cron.job
   where jobname in ('deliver-daily', 'deliver-check', 'transcribe-batch',
                     'radio-promote-hourly', 'ops-harvest');

  perform cron.schedule('deliver-daily', '5 16 * * *', $job$
    select ops.발사('deliver-daily',
      (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver');
  $job$);

  perform cron.schedule('deliver-check', '35 16 * * *', $job$
    select ops.발사('deliver-check',
      (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver?%EC%A0%90%EA%B2%80');
  $job$);

  perform cron.schedule('transcribe-batch', '*/10 * * * *', $job$
    select ops.발사('transcribe-batch',
      (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/transcribe');
  $job$);

  perform cron.schedule('radio-promote-hourly', '21 * * * *', $job$
    select ops.발사('radio-promote-hourly',
      (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/radio-promote');
  $job$);

  /* 수확은 5분마다 — TTL 6시간의 1/72 이라 pg_net 이 크게 밀려도 놓칠 창이 없다.
   * ⚠ 이 잡은 URL 이 없다(순수 SQL) — `tests/조용한실패.test.js` 의 slug 추출에 안 잡힌다.
   *   그래서 그 회귀에 「URL 없는 cron 도 센다」를 같은 커밋에서 함께 넣는다(등록층 사각). */
  perform cron.schedule('ops-harvest', '*/5 * * * *', $job$
    select ops.수확();
  $job$);

  end if;

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
  ('season_review','decided_by'), ('season_review','decided_at'),
  -- 가입 1회 문항(20260806150000 이 낸 열 · 20260812180000 이 값을 조인다).
  --   열이 사라지면 「지역 억양 편차의 유일한 축」이 통째로 없어지는데, 그 손실은 조용하다 —
  --   가입은 그대로 성공하고 세 칸만 안 쌓인다(2026-08-09 에 실제로 그 상태였다).
  ('learners','home_aimag'), ('learners','gender'), ('learners','goal_track'),
  -- 반(20260812200000) — 좌표·시즌·활성이 전부 있어야 「지난 시즌 반」을 닫을 수 있다.
  --   `class_key` 가 빠지면 시트와 대조할 자연키가 사라지고, 어긋난 날 증상은 조용함뿐이다.
  ('classes','class_key'), ('classes','season_id'), ('classes','display_name'),
  ('classes','active'), ('classes','schema_ver'),
  ('learners','class_id'),
  ('staff_classes','staff_id'), ('staff_classes','class_id'), ('staff_classes','schema_ver'),
  -- 강사 한 마디(20260812210000) — `origin` 이 빠지면 설계 §6 도전안이 답 나는 날 이미 쌓인
  --   행의 갈래를 영원히 복원 못 한다. `updated_at` 이 빠지면 개서가 조용해진다.
  ('teacher_notes','submission_id'), ('teacher_notes','staff_id'), ('teacher_notes','body'),
  ('teacher_notes','origin'), ('teacher_notes','disposition'),
  ('teacher_notes','updated_at'), ('teacher_notes','schema_ver'),
  -- 조·좌석 거울(20260814100000 · 숙제서클 §10-3) — 빠지면 반 모드 판이 정의부터 죽는데,
  --   그 죽음은 합본을 부을 때만 보인다. 여기서 세면 「덜 부은 DB」가 이름으로 말한다.
  ('learners','group_no'), ('learners','seat_no')
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
  ('learners_home_aimag_c11'), ('learners_gender_c11'), ('learners_goal_track_c11'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  --   고리가 빠지면 없는 반·없는 강사를 가리키는 행이 앉고, 그건 화면에서 「빈 반」으로만 보인다.
  ('classes_pkey'), ('classes_key_nonblank_c11'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  -- 강사 한 마디(20260812210000) — 유일(한 산출물에 하나) + 값목록 둘 + 빈 말 금지 + 고리 둘.
  --   유일이 빠지면 「기다리는 것 n」의 뜻이 즉시 갈린다(마디 수인가 산출물 수인가).
  --   값목록이 빠지면 오타 갈래('writen')가 그대로 앉고, 그 행은 어느 갈래도 아니게 된다.
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c11'),
  ('teacher_notes_origin_c11'), ('teacher_notes_disposition_c11'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey'),
  -- 조·좌석 쓰레기 못(20260814100000) — 빠지면 시트 좌표 밀림이 조용히 앉는다.
  ('learners_group_no_c11'), ('learners_seat_no_c11'),
  -- companion 빈칸 로그(20260814110000) — 질문이 비면 로그가 아니고,
  --   답도 인계도 없으면 「답한 척」이 행으로 남는다.
  ('companion_qa_question_nonblank_c11'), ('companion_qa_answer_paired_c11'),
  ('companion_qa_staff_id_fkey')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect'),
  -- 나침반 삭제 금지(20260812140000) — 행이 사라지는 것만 막는다(개서는 촉진 세션의 정상 통로)
  ('season_compass_protect'),
  -- 회고(20260812170000) — 굳힌 근거 불변 + 학생 판정은 강사 「전」에만 + 삭제 금지.
  --   freeze 가 꺼지면 재계산한 숫자로 옛 판정을 덮어쓸 수 있고 그건 조용히 통과한다.
  ('season_review_freeze'), ('season_review_protect'),
  -- 강사 한 마디 삭제 금지(20260812210000)
  ('teacher_notes_protect'),
  -- companion 빈칸 로그 개서·삭제 금지(20260814110000)
  ('companion_qa_immutable')
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
  --    ⚠ `상태` 는 "char" 다 — text 와 직접 비교하면 Postgres 가 연산자를 못 고르고
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
  -- 🔑 17 그대로(20260814100000): 이 조각은 표를 안 만든다 — 뷰 하나와 열 둘뿐이다.
  (select count(*) from pg_tables where schemaname='engine') as 테이블수,
  (select count(*) from pg_tables where schemaname='engine' and rowsecurity) as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine') as 정책수,
  (select count(*) from 대상역할 r cross join 대상테이블 t cross join 대상권한 p
    where has_table_privilege(r.r, format('%I.%I','engine',t.t), p.p)) as 새는테이블권한,
  (select count(*) from 대상역할 r
    where has_schema_privilege(r.r, to_regnamespace('engine'), 'USAGE')) as 새는스키마권한,
  -- 🔑 5 (20260812170000 이 4 에서 올렸다). 이 조각도 이 수를 안 건드린다 — 새 FK 가 없다.
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
  -- 🔴 반(20260812200000): 같은 좌표가 두 벌 앉은 반 — 0이어야 한다.
  --    이 칸이 재는 것은 **부분 유일 인덱스 둘이 실제로 걸려 있는가**다. 빠지면 명부 스윕이
  --    매 판 같은 반을 새로 만들고 학생마다 다른 class_id 가 붙는데, 증상은 「강사 큐에
  --    학생이 몇 명 없다」뿐이라 조용하다.
  (select count(*) from (
     select class_key, season_id from engine.classes
      group by class_key, season_id having count(*) > 1) d) as 겹친반좌표,
  (select count(*) from pg_indexes
    where schemaname='engine'
      and indexname in ('classes_key_in_season','classes_key_no_season')) as 반좌표유일,
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
  (select count(*) from engine.skills) as 스킬시드수,
  -- 🔴 강사 한 마디(20260812210000): 한 산출물에 두 마디가 앉은 것 — 0이어야 한다.
  --    유일 «제약»의 존재는 위 빠진제약이 이미 본다. 이 칸이 재는 것은 **데이터**다 —
  --    제약을 떼고 부은 DB 에서는 이 수가 조용히 오르고, 그때부터 「기다리는 것 n」이
  --    산출물 수가 아니라 마디 수를 세게 된다(강사가 보는 숫자가 뜻을 잃는다).
  (select count(*) from (
     select submission_id from engine.teacher_notes
      group by submission_id having count(*) > 1) d2) as 겹친한마디,
  -- ── 반 모드 판(20260814100000 · 숙제서클 §10-3) ──
  -- 판이 서 있는가 — 기본 판(검수뷰)과 별개로 센다(둘 중 하나만 선 DB 가 실재할 수 있다).
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue_class') as 반검수뷰,
  -- 기본 22열 + 정체 4열(class_id·display_name·group_no·seat_no). 수로 재야 「덜 넓힌 판」이 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class') as 반검수판열,
  -- 정체는 열되 원문 셋은 반 모드에서도 안 연다 — 기본 판의 「검수판원문=0」과 같은 못이다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue_class'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 반검수판원문,
  -- ── companion 빈칸 로그(20260814110000 · 컴패니언_내부계약 §4) ──
  -- 11열 = qa_id·staff_id·at·screen·question·answer·cited_refs·handoff·handoff_reason·model·prompt_ver
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='companion_qa') as 컴패니언열,
  -- 이 표에는 어떤 토큰에게도 열지 않는다(감사표 선례) — 정책이 하나라도 붙으면 여기서 빨개진다.
  (select count(*) from pg_policies
    where schemaname='engine' and tablename='companion_qa') as 컴패니언정책
)
select case when 테이블수=18 and RLS켜짐=18 and 정책수=7
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
              and 컴패니언열=11 and 컴패니언정책=0
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260815080000'
              and (select checksum from 현재이력)='f469945ef1f94713ef9636fdb66181aa4e0e50cb61ba3dcdaae8c3d3f2261166' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 18·18·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ⓪ 🔴 **순서** — 이 조각은 `20260814110000`(companion) «뒤»에만 선다(base_version).
--    앞 조각이 아직 유호님 승인 대기라, 이 조각도 **같은 승인에 얹혀** 부어진다.
--    먼저 부으면 base_version 검사가 「이력에 그 판이 없다」로 중단시킨다(안전 방향).
--
-- ① 이 조각은 engine·radio 의 표·열·제약·트리거·정책을 **하나도 안 바꾼다**.
--    그래서 위 판정 블록의 기대값은 앞 조각의 것이 그대로 현행이다.
--    새로 생기는 것은 전부 `ops` 스키마 안이다 — 표 1 · 함수 2 · 뷰 2 · 인덱스 2 · RLS 1(정책 0).
--
-- ② 잡 다섯 실측 (부은 뒤 한 줄로 · **잡이 이미 걸려 있던 DB 에서만** 5 가 된다):
--      select jobname, schedule, active from cron.job order by jobname;
--    기대(운영): deliver-check · deliver-daily · ops-harvest · radio-promote-hourly · transcribe-batch
--    ⚠ 리허설은 잡이 0개인 것이 정책이다(옛 cron 조각 둘의 ⛔ 그대로) — 이 조각은 «이미 걸린 것만»
--      다시 걸므로 리허설에선 스케줄을 한 칸도 안 건드린다. 0 이 나오면 고장이 아니라 그 정책이다.
--
-- ③ 🔴 **첫 수확까지 최대 5분** — 부은 직후 `ops.cron_runs` 가 0행인 것은 정상이다.
--    「판이 섰다」를 「장부가 찼다」로 읽지 않는다. 처음 채워지는 것은 transcribe(10분마다)다:
--      node tools/회차장부.js            (운영은 SUPABASE_PROJECT_REF 덮어쓰기 · F462)
--
-- ④ 🔴 **대조를 먼저 본다.** `안적힌 > 0` 이면 cron 은 돌았는데 장부가 침묵한 것이고,
--    그건 이 조각 «자신»의 결함이다. 요약만 보면 그 침묵이 「조용하다 = 문제없다」로 읽힌다.
--    도구는 그 자리에서 종료 1 을 내고, 판이 아예 없으면 **종료 2(못 쟀다)** 로 갈라 낸다.
--
-- ⑤ 이 조각이 실제로 그 판으로 들어갔는지는 **위 판정 블록이 이미 본다**(`현재이력` 의 checksum 대조).
--    여기에 같은 검사를 또 적지 않는다 — 같은 판정을 두 곳에 적으면 갈라지고, 갈리는 쪽은
--    언제나 「덜 쓰이는 쪽」이라 낡은 채로 초록을 낸다.
--
-- ⑥ 계약 §6 ④ 게이트 — 이 커밋 시점의 정직한 표기는 **✓✓✗** 다:
--    모였나 ✓(발사마다 행이 남는다 · 리허설 실탄으로 두 갈래 실증) ·
--    닿았나 ✓(뷰 둘 + `tools/회차장부.js` 가 사람 손 없이 읽는다) ·
--    늘었나 ✗(이해 대장의 칸이 아니라 운영 관측층이다).
--    ⚠ 「스스로 «알리는»」 층은 아직 0이다 — 뷰는 부르면 답할 뿐 먼저 말하지 않는다.
--
-- ⑦ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 c11 CHECK 하나를 더한다).
--    ⚠ 이 줄은 **마지막 조각**이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `teacher_notes_once_c11`·`companion_qa_*_fkey` 는 여기 없다 — UNIQUE·FK 라 CHECK 목록의
--      대상이 아니다(기대제약 목록에는 FK 도 들어가지만 이 줄은 CHECK 만 센다).
--    기대: broadcast_segment_kind_c11 · classes_key_nonblank_c11
--         · companion_qa_answer_paired_c11 · companion_qa_question_nonblank_c11
--         · corrections_promotion_intent_c11
--         · corrections_supersedes_not_self_c11 · corrections_verdict_c11
--         · cron_runs_outcome_c11
--         · learners_gender_c11 · learners_goal_track_c11 · learners_group_no_c11
--         · learners_home_aimag_c11 · learners_seat_no_c11
--         · learners_signup_attempts_nonneg_c11 · learners_temp_password_paired_c11
--         · learning_events_correction_target_c11 · learning_events_event_type_c11
--         · learning_events_task_type_c11 · pipeline_jobs_discard_reason_c11
--         · season_compass_answers_c11 · season_dates_c11
--         · season_review_decided_c11 · season_review_self_c11 · season_review_verdict_c11
--         · staff_role_c11 · submissions_due_paired_c11 · submissions_task_format_c11
--         · submissions_translation_source_c11 · teacher_notes_body_nonblank_c11
--         · teacher_notes_disposition_c11 · teacher_notes_origin_c11
/* c12 — 상태기반 과제선택의 착지 계약: CHECK 접미 통일 c11→c12 (물리 값 변화 0)
 *   (계약 수집_교정_계약.json c12 · 정본 = appsscript docs/상태기반_과제선택_설계.md §11-2·§4-1·§3-1
 *    · 유호 승인 08-20 Ⅰ-① · 착수 순서 = ①c12 계약 → ②검증기·마이그(이 조각) → ③첫 생성 행)
 *
 * ■ 무엇이 바뀌나 — 표 0 · 열 0 · 트리거 0 · «값도 0». c12 가 여는 세 가지는 전부 물리 밖이다:
 *   · payload 3칸(generation_outcome·generation_gate_failed·generation_input_text)은 jsonb 안이라
 *     DDL 이 원리상 못 닿는다 — 지키는 층은 검증기(lib/이벤트검증.js ⑧⑨) 하나다.
 *   · payload 화이트리스트의 원천은 계약 JSON(payload_허용필드)이다 — 여기 사본을 두지 않는다.
 *   · assignment_status 는 /tasks «응답» 칸이다(C0 §4-3) — 행에 안 남으니 CHECK 가 없다.
 *
 * ■ CHECK 접미 통일 c11→c12 (c7·c8·c11 선례 — 값이 바뀐 것이 0이어도 판 접미는 전체를 통일한다.
 *   같은 이름이 두 계약판을 가리키면 DB 확인 ④가 어느 판인지 못 가른다. 살아 있는 CHECK 31개:
 *   engine 29 + radio 1 + ops 1. ⚠ UNIQUE(…once…)·EXCLUDE(season_no_overlap)·FK·PK 는 값목록이
 *   없어 판 판별과 무관하다 — 이름을 안 간다(tests/L0스키마.test.js 의 접미 검사도 CHECK 만 본다).
 *
 * ■ Edge Function 은 계약판을 schema_migrations 최신 조각 이름(_c12.sql)에서 읽는다(lib/계약판.js).
 *   저장소 계약이 c12 로 오른 뒤 이 조각이 DB 에 앉기 «전»까지 원격배포 판 대조가 「저장소 c12 ·
 *   DB c11」로 빨갛다 — 그 빨강이 이 조각을 배포보다 먼저 부으라는 순서 강제다.
 *
 * 되돌림: 각 CHECK 를 _c11 정의로 재교체(값이 같으니 이름만 되돌리면 된다) +
 *        delete from engine.schema_migrations where version='20260821060000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260821060000';
  migration_name constant text := '20260821060000_engine_c12.sql';
  expected_checksum constant text := '072c72e26709deda7893908ce44e7286298fea7df3c795c7ed684e9571980b3d'; -- migration-checksum
  base_version constant text := '20260815080000';
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

  -- ── learning_events 3 ──
  alter table engine.learning_events
    drop constraint if exists learning_events_event_type_c11,
    drop constraint if exists learning_events_task_type_c11,
    drop constraint if exists learning_events_correction_target_c11,
    drop constraint if exists learning_events_event_type_c12,
    add constraint learning_events_event_type_c12 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected', 'correction.responded', 'correction.viewed', 'preference.stated', 'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result', 'content.viewed', 'affect.reported'
    )),
    drop constraint if exists learning_events_task_type_c12,
    add constraint learning_events_task_type_c12 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화', '라디오퀴즈', '목표선언', '자습체크인'
    )),
    drop constraint if exists learning_events_correction_target_c12,
    add constraint learning_events_correction_target_c12 check (
      case when event_type in ('correction.viewed', 'correction.responded')
           then correction_id is not null
           else correction_id is null
      end
    );

  -- ── submissions 3 ──
  alter table engine.submissions
    drop constraint if exists submissions_task_format_c11,
    drop constraint if exists submissions_translation_source_c11,
    drop constraint if exists submissions_due_paired_c11,
    drop constraint if exists submissions_task_format_c12,
    add constraint submissions_task_format_c12 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    drop constraint if exists submissions_translation_source_c12,
    add constraint submissions_translation_source_c12 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    ),
    drop constraint if exists submissions_due_paired_c12,
    add constraint submissions_due_paired_c12 check (
      (due_at is null) = (due_ver is null)
    );

  /* ⚠ verdict 는 **혼자 한 문장**이다 — tests/검수확정.test.js 의 값 추출이 「check … ));」 로
   *   끝나는 블록을 비탐욕으로 집는다. 다른 CHECK 와 한 alter 에 묶으면 종결이 「)),」 가 되어
   *   추출이 다음 「));」 까지 흘러 들어가 대조가 거짓 적색이 된다(c11 조각 실측 그대로). */
  alter table engine.corrections
    drop constraint if exists corrections_verdict_c11,
    drop constraint if exists corrections_verdict_c12,
    add constraint corrections_verdict_c12 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.corrections
    drop constraint if exists corrections_supersedes_not_self_c11,
    drop constraint if exists corrections_promotion_intent_c11,
    drop constraint if exists corrections_supersedes_not_self_c12,
    add constraint corrections_supersedes_not_self_c12
      check (supersedes is null or supersedes <> correction_id),
    drop constraint if exists corrections_promotion_intent_c12,
    add constraint corrections_promotion_intent_c12
      check (promotion_intent = false or actor_kind = 'teacher');

  -- ── learners 7 ──
  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c11,
    drop constraint if exists learners_temp_password_paired_c11,
    drop constraint if exists learners_gender_c11,
    drop constraint if exists learners_goal_track_c11,
    drop constraint if exists learners_home_aimag_c11,
    drop constraint if exists learners_group_no_c11,
    drop constraint if exists learners_seat_no_c11,
    drop constraint if exists learners_signup_attempts_nonneg_c12,
    add constraint learners_signup_attempts_nonneg_c12 check (signup_attempts >= 0),
    drop constraint if exists learners_temp_password_paired_c12,
    add constraint learners_temp_password_paired_c12
      check (temp_password_hash is null or temp_password_expires_at is not null),
    drop constraint if exists learners_gender_c12,
    add constraint learners_gender_c12
      check (gender is null or gender in ('female', 'male', 'undisclosed')),
    drop constraint if exists learners_goal_track_c12,
    add constraint learners_goal_track_c12
      check (goal_track is null or goal_track in ('study', 'work', 'culture')),
    drop constraint if exists learners_home_aimag_c12,
    add constraint learners_home_aimag_c12
      check (home_aimag is null or home_aimag in (
        'ulaanbaatar', 'arkhangai', 'bayan-olgii', 'bayankhongor', 'bulgan', 'darkhan-uul',
        'dornod', 'dornogovi', 'dundgovi', 'govi-altai', 'govisumber', 'khentii',
        'khovd', 'khovsgol', 'omnogovi', 'orkhon', 'ovorkhangai', 'selenge',
        'sukhbaatar', 'tov', 'uvs', 'zavkhan')),
    drop constraint if exists learners_group_no_c12,
    add constraint learners_group_no_c12 check (group_no between 1 and 20),
    drop constraint if exists learners_seat_no_c12,
    add constraint learners_seat_no_c12 check (seat_no between 1 and 20);

  -- ── staff 1 · pipeline_jobs 1 · radio 1 · classes 1 · ops 1 ──
  alter table engine.staff
    drop constraint if exists staff_role_c11,
    drop constraint if exists staff_role_c12,
    add constraint staff_role_c12 check (role in ('teacher', 'inspector', 'director'));

  alter table engine.pipeline_jobs
    drop constraint if exists pipeline_jobs_discard_reason_c11,
    drop constraint if exists pipeline_jobs_discard_reason_c12,
    add constraint pipeline_jobs_discard_reason_c12
      check (discard_reason is null
             or (status = 'discarded'
                 and discard_reason in
                   ('무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가')));

  alter table radio.broadcast_segment
    drop constraint if exists broadcast_segment_kind_c11,
    drop constraint if exists broadcast_segment_kind_c12,
    add constraint broadcast_segment_kind_c12
      check (kind in ('radio_loop', 'live_lecture', 'asmr_mode', 'other'));

  alter table engine.classes
    drop constraint if exists classes_key_nonblank_c11,
    drop constraint if exists classes_key_nonblank_c12,
    add constraint classes_key_nonblank_c12 check (btrim(class_key) <> '');

  alter table ops.cron_runs
    drop constraint if exists cron_runs_outcome_c11,
    drop constraint if exists cron_runs_outcome_c12,
    add constraint cron_runs_outcome_c12 check (outcome in
      ('대기', '성공', '실패', '타임아웃', '전송오류', '상태없음', '유실', '발사실패'));

  -- ── season 1 · season_compass 1 · season_review 3 ──
  alter table engine.season
    drop constraint if exists season_dates_c11,
    drop constraint if exists season_dates_c12,
    add constraint season_dates_c12 check (ends_on is null or ends_on >= starts_on);

  alter table engine.season_compass
    drop constraint if exists season_compass_answers_c11,
    drop constraint if exists season_compass_answers_c12,
    add constraint season_compass_answers_c12 check (
      (
        self_in_5y_changed is null
        and answers ?& array['why_learning', 'self_in_5y', 'topik_use', 'season_goal']
        and answers - array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] = '{}'::jsonb
      ) or (
        self_in_5y_changed is not null
        and answers ?& array['self_in_5y', 'season_goal']
        and answers - array['self_in_5y', 'season_goal'] = '{}'::jsonb
      )
    );

  alter table engine.season_review
    drop constraint if exists season_review_verdict_c11,
    drop constraint if exists season_review_self_c11,
    drop constraint if exists season_review_decided_c11,
    drop constraint if exists season_review_verdict_c12,
    add constraint season_review_verdict_c12
      check (verdict is null or verdict in ('closer', 'same', 'redirected')),
    drop constraint if exists season_review_self_c12,
    add constraint season_review_self_c12
      check (verdict_by_self is null or verdict_by_self in ('closer', 'same', 'redirected')),
    drop constraint if exists season_review_decided_c12,
    add constraint season_review_decided_c12 check (
      (verdict is null and note is null and decided_by is null and decided_at is null)
      or (verdict is not null and decided_by is not null and decided_at is not null
          and note is not null and btrim(note) <> '')
    );

  -- ── teacher_notes 3 · companion_qa 2 ──
  alter table engine.teacher_notes
    drop constraint if exists teacher_notes_origin_c11,
    drop constraint if exists teacher_notes_disposition_c11,
    drop constraint if exists teacher_notes_body_nonblank_c11,
    drop constraint if exists teacher_notes_origin_c12,
    add constraint teacher_notes_origin_c12
      check (origin in ('as_is', 'edited', 'written')),
    drop constraint if exists teacher_notes_disposition_c12,
    add constraint teacher_notes_disposition_c12
      check (disposition in ('confirmed', 'retry')),
    drop constraint if exists teacher_notes_body_nonblank_c12,
    add constraint teacher_notes_body_nonblank_c12 check (btrim(body) <> '');

  alter table engine.companion_qa
    drop constraint if exists companion_qa_question_nonblank_c11,
    drop constraint if exists companion_qa_answer_paired_c11,
    drop constraint if exists companion_qa_question_nonblank_c12,
    add constraint companion_qa_question_nonblank_c12 check (btrim(question) <> ''),
    drop constraint if exists companion_qa_answer_paired_c12,
    add constraint companion_qa_answer_paired_c12 check (handoff or btrim(answer) <> '');

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
  ('learners','group_no'), ('learners','seat_no')
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
  ('companion_qa_staff_id_fkey')
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
  ('companion_qa_immutable')
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
select case when 테이블수=18 and RLS켜짐=18 and 정책수=7
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
              and (select version from 현재이력)='20260821060000'
              and (select checksum from 현재이력)='072c72e26709deda7893908ce44e7286298fea7df3c795c7ed684e9571980b3d' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 18·18·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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
--    기대: broadcast_segment_kind_c12 · classes_key_nonblank_c12
--         · companion_qa_answer_paired_c12 · companion_qa_question_nonblank_c12
--         · corrections_promotion_intent_c12
--         · corrections_supersedes_not_self_c12 · corrections_verdict_c12
--         · cron_runs_outcome_c12
--         · learners_gender_c12 · learners_goal_track_c12 · learners_group_no_c12
--         · learners_home_aimag_c12 · learners_seat_no_c12
--         · learners_signup_attempts_nonneg_c12 · learners_temp_password_paired_c12
--         · learning_events_correction_target_c12 · learning_events_event_type_c12
--         · learning_events_task_type_c12 · pipeline_jobs_discard_reason_c12
--         · season_compass_answers_c12 · season_dates_c12
--         · season_review_decided_c12 · season_review_self_c12 · season_review_verdict_c12
--         · staff_role_c12 · submissions_due_paired_c12 · submissions_task_format_c12
--         · submissions_translation_source_c12 · teacher_notes_body_nonblank_c12
--         · teacher_notes_disposition_c12 · teacher_notes_origin_c12
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
/* 상태기반 과제선택 — jobs_load 활성일 가드 (§3-2-a C5 · §12-28 «전환» · v5.13-d · 활성 조각의 물리 반쪽)
 *
 * ■ 무엇 — ㉠ jobs_load 재정의 «하나»: 함수 머리에 활성일 가드를 더한다. 활성 시작일
 *   (engine.gen_active_from() · 활성 조각 대기 파일 supabase/활성조각_c12.sql 이 세운다)
 *   «이전» 날짜로 부르면 job 을 하나도 안 만들고 0건 적재 봉투를 돌려준다.
 * ■ 왜 지금 — 가드는 to_regprocedure 존재 판별로 감싸 있어 활성 함수가 없는 동안(지금 리허설
 *   ·운영 전부) **행동이 한 글자도 안 바뀐다**. 대기 파일에 jobs_load 사본을 두면 본 마이그와
 *   두 정본이 되어 표류하므로(duplicate-def-shadows-canon), 가드는 정규 마이그로 지금 넣고
 *   대기 파일은 gen_active_from·cron 등록만 진다.
 * ■ 원문 — 20260821120000_generation_c12.sql 의 jobs_load 전문(§12 픽스처 대군이 실측한 그
 *   판 · B4 재적재·갈래 5 roster_hash·A8/A11/ⓒ-13 검증 전량 그대로)에 가드만 더했다.
 *   기계 추출·삽입으로 조립해 손 복사 변형이 없다(조립기는 스크래치패드 1회용).
 * ■ 파일 이름의 _c12 — Edge Function 이 계약판을 최신 _c<숫자> 이름에서 읽는다(판 유지).
 *
 * 되돌림: 20260821120000 의 jobs_load 정의를 다시 부으면 가드 전의 몸으로 돌아간다. */

begin;

do $migration$
declare
  migration_version constant text := '20260822090000';
  migration_name constant text := '20260822090000_gen_active_guard_c12.sql';
  expected_checksum constant text := '28c12ec2b0c6acdeab41f5fa4a0ca990e84f277607596d7bd3981009a55e72fd'; -- migration-checksum
  base_version constant text := '20260821120000';
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
      '이 조각은 기준선 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;
end
$migration$;

-- ㉠ jobs_load 재정의 — create or replace 라 재적용 멱등(A층 §12-21 이 재는 그 성질).
create or replace function engine.jobs_load(
  _assign_date date, _run_id uuid, _targets jsonb, _skipped_game uuid[] default '{}')
  returns jsonb
  language plpgsql security definer set search_path = engine, public as $function$
declare
  활성일 date;                                    -- 활성일 가드(아래) 전용
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
  migration_version constant text := '20260822090000';
  migration_name constant text := '20260822090000_gen_active_guard_c12.sql';
  expected_checksum constant text := '28c12ec2b0c6acdeab41f5fa4a0ca990e84f277607596d7bd3981009a55e72fd'; -- migration-checksum
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
              and (select version from 현재이력)='20260822090000'
              and (select checksum from 현재이력)='28c12ec2b0c6acdeab41f5fa4a0ca990e84f277607596d7bd3981009a55e72fd' -- migration-checksum
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
-- ② 아래 기대 목록은 generation_c12 가 세운 현행 그대로다(변경 0 — 마지막 조각이 이 줄을 든다).
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

/* 성향 확인 답 사건 — event_type +1 `estimate.responded` (계약 c13 · 엔진검토 Ⅲ⑥)
 *
 * ■ 무엇 — **살아 있는 CHECK 64개를 `_c12`→`_c13` 이름째 교체**(c8·c12 방식 — 접미를 안 갈면
 *   「c13 계약 + c12 물리」가 초록으로 보인다 · tests/L0스키마 「이름이 계약 버전」 자물쇠).
 *   값이 바뀌는 것은 `learning_events_event_type` 하나(+`estimate.responded` · 기존 행 검사
 *   없음 = 넓히기만) — 나머지 63개는 합본에서 **기계 추출한 본문 그대로**다(조립기는 스크래치
 *   1회용 · 손 복사 변형 0 — 20260822090000 의 그 방식).
 *   payload 5칸(trait_axis·shown_key·shown_text·response·estimate_as_of)은 jsonb 안이라
 *   물리 0 — 지키는 층은 검증기(`lib/이벤트검증.js` 이벤트별필수)와 계약 `payload_허용필드` 다.
 * ■ 왜 — 봇이 관찰로 추정한 성향을 학생에게 확인받는 답(「맞아요/아니에요」)의 자리(유호 확정
 *   08-22 「리듬부터 · 새 사건 · 이 설계로 진행」 · 정본 = appsscript docs/코어엔진_설계.md §10).
 *   `preference.stated`(스스로 말함)와 다른 사실이라 다른 이름 — 섞이면 개인화가 자기 추측을
 *   학생의 말로 착각한다. 이 행이 「추정기 정확도의 실측 라벨」이다.
 * ■ 파일 이름의 _c13 — Edge Function 이 계약판을 최신 `_c<숫자>` 이름에서 읽는다(판 올림).
 *   c13 을 모르는 앱(c12 선언)은 그대로 동작한다 — 서버가 더 새 판인 것은 막지 않는다.
 *
 * 되돌림: drop constraint learning_events_event_type_c13; 뒤 c12 본문(값 14)으로 다시 add.
 *         delete from engine.schema_migrations where version='20260822150000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260822150000';
  migration_name constant text := '20260822150000_estimate_responded_c13.sql';
  expected_checksum constant text := '3f3b49afc63cdcf71d3ec2078e0df3fbc47b492dfd59be1272263ff6234317a5'; -- migration-checksum
  base_version constant text := '20260822090000';
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
      '이 조각은 기준선 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;
end
$migration$;

-- 살아 있는 CHECK 65개 — c12 본문 그대로 이름만 c13(값이 는 것은 event_type 하나 · +estimate.responded).
alter table engine.learning_events
  drop constraint if exists learning_events_event_type_c12,
  drop constraint if exists learning_events_event_type_c13,
  add constraint learning_events_event_type_c13 check (event_type in (
    'submission.created', 'quiz.answered', 'choice.selected', 'correction.responded', 'correction.viewed', 'preference.stated', 'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
    'task.assigned', 'exam.result', 'content.viewed', 'affect.reported',
    'estimate.responded'
  ));
alter table engine.generation_attempts
  drop constraint if exists attempts_gate_values_c12,
  drop constraint if exists attempts_gate_values_c13,
  add constraint attempts_gate_values_c13 check ( gate_failed_reasons is null or gate_failed_reasons <@ array[ '길이','한국어비율','빈출력','금칙서식','질문형태','식별자역유입','중복']::text[] );

alter table engine.generation_attempts
  drop constraint if exists attempts_response_present_c12,
  drop constraint if exists attempts_response_present_c13,
  add constraint attempts_response_present_c13 check ( result is null or result not in ('성공','검문탈락','응답파손','응답초과') or (raw_response is not null and responded_at is not null) );

alter table engine.generation_attempts
  drop constraint if exists attempts_result_gate_c12,
  drop constraint if exists attempts_result_gate_c13,
  add constraint attempts_result_gate_c13 check ( case when result = '검문탈락' then gate_failed_reasons is not null and cardinality(gate_failed_reasons) >= 1 else gate_failed_reasons is null end );

alter table engine.generation_attempts
  drop constraint if exists attempts_ver_nonempty_c12,
  drop constraint if exists attempts_ver_nonempty_c13,
  add constraint attempts_ver_nonempty_c13 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_counts_order_c12,
  drop constraint if exists batch_runs_counts_order_c13,
  add constraint batch_runs_counts_order_c13 check ( target_count is null or (target_count >= 0 and loaded_count <= enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_counts_pair_c12,
  drop constraint if exists batch_runs_counts_pair_c13,
  add constraint batch_runs_counts_pair_c13 check ((target_count is null) = (loaded_count is null));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_enrolled_nonneg_c12,
  drop constraint if exists batch_runs_enrolled_nonneg_c13,
  add constraint batch_runs_enrolled_nonneg_c13 check (enrolled_count >= 0);

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_finished_cols_c12,
  drop constraint if exists batch_runs_finished_cols_c13,
  add constraint batch_runs_finished_cols_c13 check ( finished_at is null or (target_count is not null and loaded_count is not null and partial_count is not null and skipped_game_count is not null and skipped_existing_count is not null) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_level_dist_ok_c12,
  drop constraint if exists batch_runs_level_dist_ok_c13,
  add constraint batch_runs_level_dist_ok_c13 check (engine.level_dist_ok(level_distribution, enrolled_count));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_partial_pair_c12,
  drop constraint if exists batch_runs_partial_pair_c13,
  add constraint batch_runs_partial_pair_c13 check ((partial_count is null) = (loaded_count is null));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_partial_range_c12,
  drop constraint if exists batch_runs_partial_range_c13,
  add constraint batch_runs_partial_range_c13 check ( partial_count is null or (partial_count >= 0 and partial_count <= enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_roster_equation_c12,
  drop constraint if exists batch_runs_roster_equation_c13,
  add constraint batch_runs_roster_equation_c13 check ( finished_at is null or run_kind <> '배치' or (loaded_count + skipped_game_count + skipped_existing_count = enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_skipped_range_c12,
  drop constraint if exists batch_runs_skipped_range_c13,
  add constraint batch_runs_skipped_range_c13 check ( (skipped_game_count is null or (skipped_game_count >= 0 and skipped_game_count <= enrolled_count)) and (skipped_existing_count is null or (skipped_existing_count >= 0 and skipped_existing_count <= enrolled_count)) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_ver_nonempty_c12,
  drop constraint if exists batch_runs_ver_nonempty_c13,
  add constraint batch_runs_ver_nonempty_c13 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table radio.broadcast_segment
  drop constraint if exists broadcast_segment_kind_c12,
  drop constraint if exists broadcast_segment_kind_c13,
  add constraint broadcast_segment_kind_c13 check (kind in ('radio_loop', 'live_lecture', 'asmr_mode', 'other'));

alter table engine.classes
  drop constraint if exists classes_key_nonblank_c12,
  drop constraint if exists classes_key_nonblank_c13,
  add constraint classes_key_nonblank_c13 check (btrim(class_key) <> '');

alter table engine.companion_qa
  drop constraint if exists companion_qa_answer_paired_c12,
  drop constraint if exists companion_qa_answer_paired_c13,
  add constraint companion_qa_answer_paired_c13 check (handoff or btrim(answer) <> '');

alter table engine.companion_qa
  drop constraint if exists companion_qa_question_nonblank_c12,
  drop constraint if exists companion_qa_question_nonblank_c13,
  add constraint companion_qa_question_nonblank_c13 check (btrim(question) <> '');

alter table engine.corrections
  drop constraint if exists corrections_promotion_intent_c12,
  drop constraint if exists corrections_promotion_intent_c13,
  add constraint corrections_promotion_intent_c13 check (promotion_intent = false or actor_kind = 'teacher');

alter table engine.corrections
  drop constraint if exists corrections_supersedes_not_self_c12,
  drop constraint if exists corrections_supersedes_not_self_c13,
  add constraint corrections_supersedes_not_self_c13 check (supersedes is null or supersedes <> correction_id);

alter table engine.corrections
  drop constraint if exists corrections_verdict_c12,
  drop constraint if exists corrections_verdict_c13,
  add constraint corrections_verdict_c13 check (verdict is null or verdict in ( 'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다' ));

alter table ops.cron_runs
  drop constraint if exists cron_runs_outcome_c12,
  drop constraint if exists cron_runs_outcome_c13,
  add constraint cron_runs_outcome_c13 check (outcome in ('대기', '성공', '실패', '타임아웃', '전송오류', '상태없음', '유실', '발사실패'));

alter table engine.generation_jobs
  drop constraint if exists jobs_anchor_present_c12,
  drop constraint if exists jobs_anchor_present_c13,
  add constraint jobs_anchor_present_c13 check ( status not in ('착지','마감폴백','대상아님') or assigned_event_id is not null );

alter table engine.generation_jobs
  drop constraint if exists jobs_claim_cols_c12,
  drop constraint if exists jobs_claim_cols_c13,
  add constraint jobs_claim_cols_c13 check (status <> 'claimed' or (owner is not null and lease_until is not null));

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_pair_c12,
  drop constraint if exists jobs_deciding_pair_c13,
  add constraint jobs_deciding_pair_c13 check ((deciding_attempt_id is null) = (deciding_result is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_result_matches_c12,
  drop constraint if exists jobs_deciding_result_matches_c13,
  add constraint jobs_deciding_result_matches_c13 check (deciding_result is null or deciding_result = outcome);

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_scope_c12,
  drop constraint if exists jobs_deciding_scope_c13,
  add constraint jobs_deciding_scope_c13 check ( case when outcome is null then deciding_attempt_id is null when outcome in ('검문탈락','타임아웃','벤더오류','응답파손','입력초과','응답초과') then deciding_attempt_id is not null else deciding_attempt_id is null end );

alter table engine.generation_jobs
  drop constraint if exists jobs_draft_present_c12,
  drop constraint if exists jobs_draft_present_c13,
  add constraint jobs_draft_present_c13 check (status = '적재실패' or event_draft is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_idle_cols_c12,
  drop constraint if exists jobs_idle_cols_c13,
  add constraint jobs_idle_cols_c13 check (status <> '대기' or (owner is null and lease_until is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_load_failed_cols_c12,
  drop constraint if exists jobs_load_failed_cols_c13,
  add constraint jobs_load_failed_cols_c13 check ( status <> '적재실패' or (outcome = '내부오류' and assigned_event_id is null and event_draft is null and load_error is not null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_nontarget_cols_c12,
  drop constraint if exists jobs_nontarget_cols_c13,
  add constraint jobs_nontarget_cols_c13 check (status <> '대상아님' or not_target_reason is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_nonterminal_cols_c12,
  drop constraint if exists jobs_nonterminal_cols_c13,
  add constraint jobs_nonterminal_cols_c13 check ( status in ('착지','마감폴백','대상아님','적재실패') or (outcome is null and closed_at is null and assigned_event_id is null and winning_attempt_id is null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_skill_ids_present_c12,
  drop constraint if exists jobs_skill_ids_present_c13,
  add constraint jobs_skill_ids_present_c13 check ( status = '적재실패' or not_target_reason is not null or cardinality(skill_ids) between 1 and 2 );

alter table engine.generation_jobs
  drop constraint if exists jobs_status_outcome_pairs_c12,
  drop constraint if exists jobs_status_outcome_pairs_c13,
  add constraint jobs_status_outcome_pairs_c13 check ( case status when '대상아님' then outcome = '대상아님' when '마감폴백' then outcome = '예산소진' when '적재실패' then outcome = '내부오류' when '착지' then outcome is null or outcome not in ('대상아님','예산소진') else true end );

alter table engine.generation_jobs
  drop constraint if exists jobs_terminal_cols_c12,
  drop constraint if exists jobs_terminal_cols_c13,
  add constraint jobs_terminal_cols_c13 check ( status not in ('착지','마감폴백','대상아님','적재실패') or (outcome is not null and closed_at is not null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_ver_nonempty_c12,
  drop constraint if exists jobs_ver_nonempty_c13,
  add constraint jobs_ver_nonempty_c13 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_fence_current_c12,
  drop constraint if exists jobs_winner_fence_current_c13,
  add constraint jobs_winner_fence_current_c13 check (winning_fence is null or winning_fence = fence);

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_fence_pair_c12,
  drop constraint if exists jobs_winner_fence_pair_c13,
  add constraint jobs_winner_fence_pair_c13 check ((winning_attempt_id is null) = (winning_fence is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_only_success_c12,
  drop constraint if exists jobs_winner_only_success_c13,
  add constraint jobs_winner_only_success_c13 check (winning_attempt_id is null or outcome = '성공');

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_present_c12,
  drop constraint if exists jobs_winner_present_c13,
  add constraint jobs_winner_present_c13 check (outcome <> '성공' or winning_attempt_id is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_result_only_success_c12,
  drop constraint if exists jobs_winner_result_only_success_c13,
  add constraint jobs_winner_result_only_success_c13 check (winning_result is null or winning_result = '성공');

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_result_pair_c12,
  drop constraint if exists jobs_winner_result_pair_c13,
  add constraint jobs_winner_result_pair_c13 check ((winning_attempt_id is null) = (winning_result is null));

alter table engine.learners
  drop constraint if exists learners_gender_c12,
  drop constraint if exists learners_gender_c13,
  add constraint learners_gender_c13 check (gender is null or gender in ('female', 'male', 'undisclosed'));

alter table engine.learners
  drop constraint if exists learners_goal_track_c12,
  drop constraint if exists learners_goal_track_c13,
  add constraint learners_goal_track_c13 check (goal_track is null or goal_track in ('study', 'work', 'culture'));

alter table engine.learners
  drop constraint if exists learners_group_no_c12,
  drop constraint if exists learners_group_no_c13,
  add constraint learners_group_no_c13 check (group_no between 1 and 20);

alter table engine.learners
  drop constraint if exists learners_home_aimag_c12,
  drop constraint if exists learners_home_aimag_c13,
  add constraint learners_home_aimag_c13 check (home_aimag is null or home_aimag in ( 'ulaanbaatar', 'arkhangai', 'bayan-olgii', 'bayankhongor', 'bulgan', 'darkhan-uul', 'dornod', 'dornogovi', 'dundgovi', 'govi-altai', 'govisumber', 'khentii', 'khovd', 'khovsgol', 'omnogovi', 'orkhon', 'ovorkhangai', 'selenge', 'sukhbaatar', 'tov', 'uvs', 'zavkhan'));

alter table engine.learners
  drop constraint if exists learners_seat_no_c12,
  drop constraint if exists learners_seat_no_c13,
  add constraint learners_seat_no_c13 check (seat_no between 1 and 20);

alter table engine.learners
  drop constraint if exists learners_signup_attempts_nonneg_c12,
  drop constraint if exists learners_signup_attempts_nonneg_c13,
  add constraint learners_signup_attempts_nonneg_c13 check (signup_attempts >= 0);

alter table engine.learners
  drop constraint if exists learners_temp_password_paired_c12,
  drop constraint if exists learners_temp_password_paired_c13,
  add constraint learners_temp_password_paired_c13 check (temp_password_hash is null or temp_password_expires_at is not null);

alter table engine.learning_events
  drop constraint if exists learning_events_correction_target_c12,
  drop constraint if exists learning_events_correction_target_c13,
  add constraint learning_events_correction_target_c13 check ( case when event_type in ('correction.viewed', 'correction.responded') then correction_id is not null else correction_id is null end );

alter table engine.learning_events
  drop constraint if exists learning_events_task_type_c12,
  drop constraint if exists learning_events_task_type_c13,
  add constraint learning_events_task_type_c13 check (task_type is null or task_type in ( '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화', '라디오퀴즈', '목표선언', '자습체크인' ));

alter table engine.pipeline_jobs
  drop constraint if exists pipeline_jobs_discard_reason_c12,
  drop constraint if exists pipeline_jobs_discard_reason_c13,
  add constraint pipeline_jobs_discard_reason_c13 check (discard_reason is null or (status = 'discarded' and discard_reason in ('무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가')));

alter table engine.season_compass
  drop constraint if exists season_compass_answers_c12,
  drop constraint if exists season_compass_answers_c13,
  add constraint season_compass_answers_c13 check ( ( self_in_5y_changed is null and answers ?& array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] and answers - array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] = '{}'::jsonb ) or ( self_in_5y_changed is not null and answers ?& array['self_in_5y', 'season_goal'] and answers - array['self_in_5y', 'season_goal'] = '{}'::jsonb ) );

alter table engine.season
  drop constraint if exists season_dates_c12,
  drop constraint if exists season_dates_c13,
  add constraint season_dates_c13 check (ends_on is null or ends_on >= starts_on);

alter table engine.season_review
  drop constraint if exists season_review_decided_c12,
  drop constraint if exists season_review_decided_c13,
  add constraint season_review_decided_c13 check ( (verdict is null and note is null and decided_by is null and decided_at is null) or (verdict is not null and decided_by is not null and decided_at is not null and note is not null and btrim(note) <> '') );

alter table engine.season_review
  drop constraint if exists season_review_self_c12,
  drop constraint if exists season_review_self_c13,
  add constraint season_review_self_c13 check (verdict_by_self is null or verdict_by_self in ('closer', 'same', 'redirected'));

alter table engine.season_review
  drop constraint if exists season_review_verdict_c12,
  drop constraint if exists season_review_verdict_c13,
  add constraint season_review_verdict_c13 check (verdict is null or verdict in ('closer', 'same', 'redirected'));

alter table engine.staff
  drop constraint if exists staff_role_c12,
  drop constraint if exists staff_role_c13,
  add constraint staff_role_c13 check (role in ('teacher', 'inspector', 'director'));

alter table engine.submissions
  drop constraint if exists submissions_due_paired_c12,
  drop constraint if exists submissions_due_paired_c13,
  add constraint submissions_due_paired_c13 check ( (due_at is null) = (due_ver is null) );

alter table engine.submissions
  drop constraint if exists submissions_task_format_c12,
  drop constraint if exists submissions_task_format_c13,
  add constraint submissions_task_format_c13 check (task_format is null or task_format in ( '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역' ));

alter table engine.submissions
  drop constraint if exists submissions_translation_source_c12,
  drop constraint if exists submissions_translation_source_c13,
  add constraint submissions_translation_source_c13 check ( task_format is distinct from '번역' or nullif(btrim(task_snapshot->>'mn'), '') is not null );

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_body_nonblank_c12,
  drop constraint if exists teacher_notes_body_nonblank_c13,
  add constraint teacher_notes_body_nonblank_c13 check (btrim(body) <> '');

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_disposition_c12,
  drop constraint if exists teacher_notes_disposition_c13,
  add constraint teacher_notes_disposition_c13 check (disposition in ('confirmed', 'retry'));

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_origin_c12,
  drop constraint if exists teacher_notes_origin_c13,
  add constraint teacher_notes_origin_c13 check (origin in ('as_is', 'edited', 'written'));

do $migration2$
declare
  expected_checksum constant text := '3f3b49afc63cdcf71d3ec2078e0df3fbc47b492dfd59be1272263ff6234317a5'; -- migration-checksum
begin
  if not exists (select 1 from engine.schema_migrations where version = '20260822150000') then
    insert into engine.schema_migrations(version, name, checksum)
    values ('20260822150000', '20260822150000_estimate_responded_c13.sql', expected_checksum);
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
              and (select version from 현재이력)='20260822090000'
              and (select checksum from 현재이력)='3f3b49afc63cdcf71d3ec2078e0df3fbc47b492dfd59be1272263ff6234317a5' -- migration-checksum
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

/* 회차 장부 — 대조 뷰 수리 2판: «우회»를 다시 보이게 (20260824010000 의 탐지 구멍 봉합)
 *
 * 🔴 1판(20260824010000)이 오탐을 걷다가 **진탐까지 걷었다**: 「발사 안 지나는 잡 = 안적힘 0」
 *   으로 뭉뚱그려서, 9일 침묵을 낳았던 바로 그 병(http_post «직접» cron — 장부를 지나야 하는
 *   HTTP 잡이 우회)이 재발해도 이제 안 잡히는 구멍이 났다. 유호 물음 08-24 「재발하지 않게
 *   제대로 시스템화 한 거지?」를 검증하다 그 자리에서 잡았다.
 * ⇒ 갈래가 둘이 아니라 셋이다: 발사 경유(돈−적힌) · **http_post 직접(전량이 침묵 — 우회)** ·
 *   순수 SQL(0 — 설계). 판별은 계속 «명령 본문»이다(이름 목록이면 새 잡마다 재발).
 *
 * (아래 원 머리말은 1판의 것 — 오탐 축의 근거로 그대로 산다)
 * ── 1판 머리말 ─────────────────────────────────────────────────────────────
 * 회차 장부 — 대조 뷰 수리: SQL 직접 잡의 «가짜 안적힘» (20260815080000 후속 · ops 층 · v5.14 시점)
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
  migration_version constant text := '20260824020000';
  migration_name constant text := '20260824020000_cron_ledger_recon2_c13.sql';
  expected_checksum constant text := 'e1986661acdcbf5fb239512b668323367e8327d4d7733b0218bea0bf9cb26fc4'; -- migration-checksum
  base_version constant text := '20260824010000';   -- 체인 규약: 직전 조각(recon 1판)
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
           (j.command like '%ops.발사(%') as 장부경유,
           (j.command like '%http_post%') as 우회
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
         /* 갈래 셋 — ①발사 경유: 돈−적힌 ②http_post 직접: **전량이 침묵**(장부를 지나야 하는
          * HTTP 잡의 우회 — 9일 침묵을 낳은 그 병) ③순수 SQL: 0(설계상 안 적힌다).
          * 장부에만 남은 잡(돈것 없음 · 장부경유 null)은 원문 셈 그대로(음수 = 잡이 걷힌 흔적). */
         case when 장부경유 is null or 장부경유 then coalesce(돈횟수, 0) - coalesce(적힌횟수, 0)
              when 우회 then coalesce(돈횟수, 0)
              else 0 end as 안적힌횟수,
         coalesce(SQL층실패, 0)                                 as SQL층실패,
         마지막회차,
         coalesce(장부경유, true)                                as 장부경유,
         coalesce(우회, false)                                   as 우회
    from 돈것 full join 적힌것 on 돈것.jobname = 적힌것.jobname;

end
$migration$;

do $migration2$
declare
  expected_checksum constant text := 'e1986661acdcbf5fb239512b668323367e8327d4d7733b0218bea0bf9cb26fc4'; -- migration-checksum
begin
  if not exists (select 1 from engine.schema_migrations where version = '20260824020000') then
    insert into engine.schema_migrations(version, name, checksum)
    values ('20260824020000', '20260824020000_cron_ledger_recon2_c13.sql', expected_checksum);
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
              and (select version from 현재이력)='20260824020000'
              and (select checksum from 현재이력)='e1986661acdcbf5fb239512b668323367e8327d4d7733b0218bea0bf9cb26fc4' -- migration-checksum
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

/* 확인 답 하루 1회 — 동시 경쟁 중복의 물리 방벽 (심문 G11 잔여 · 유호 해제 08-24 「G11 잔여도 이어서 진행해」 · 결정.md 그 줄)
 *
 * ■ 무엇 — 둘: ①`engine.ub_date(timestamptz)` immutable 래퍼 ②`estimate.responded` 의 부분 유일
 *   색인 `estimate_daily_once_c13` (learner × 몽골 날짜 · 그날 1행).
 *
 * ■ 왜 — 하루 1회 질문 예산(유호 확정 08-22 「하루 1회 · 둘 다 착수」)의 서버 게이트(progress
 *   오늘답수)는 «순차» 중복만 막는다: 두 기기가 답하기 «전에» 각자 카드를 받으면(경쟁) 둘 다
 *   제출되고, 멱등키가 순수 난수 UUID 라(lib/제출로그.흐름id) 기존 유일 둘로는 원리상 못 접는다
 *   (심문 G11 ⓐ — 08-23 연기를 유호가 08-24 다시 열었다). 축은 게이트와 «같은 자»다:
 *   (learner_id, ub_date(ingested_at)) — occurred_at(기기 시계)로 걸면 게이트와 인덱스가 서로
 *   다른 날을 가리킨다(심문 G12 그대로). 축·키 무관 «그날 1행» — 게이트의 count(*) 도 축·키를 안 본다.
 *
 * ■ ub_date 를 immutable 로 «약속»하는 근거 — `at time zone` 은 엄밀히 STABLE(tzdata 갱신에 답이
 *   바뀔 수 있다)이라 식 인덱스에 직접 못 앉는다. 몽골은 2017년 DST 폐지 뒤 고정 +08 이고, 혹시
 *   그 규칙이 바뀌는 날은 이 인덱스를 다시 굽는 날이다(gen_deadline 이 시간대 리터럴을 함수 몸에
 *   가둔 그 선례 · JS 쌍둥이 = lib/몽골날짜.js — 이름만 들고 규칙은 tzdata 가 진다).
 *
 * ■ 지는 쪽의 응답 — supabase/functions/events 가 이 인덱스 이름을 잡아 `duplicate`(그날 행의
 *   event_id)로 접는다. 일반 catch 로 흘리면 SERVER_ERROR/retryable:true 라 앱이 영원히 재시도한다.
 *
 * ■ 기존 행 충돌 — 있으면 create unique index 가 여기서 시끄럽게 죽는다(그게 옳다). 실측
 *   08-24: 리허설·운영 모두 estimate.responded 0행(왕복 픽스처도 0 — 이 사건의 앱 통로가
 *   게임로그 접두 표에 빠져 있어 지금까지 생산 자체가 0이었다 · 같은 커밋의 lib 수리).
 *
 * ■ 이름 — 태어난 판(_c13)을 달고 그대로 산다. UNIQUE 는 CHECK 접미 통일 대상이 아니다
 *   (recon2 꼬리 규율 · 「기대:」 줄에도 안 들어간다 — pg_indexes 칸(확인하루유일)이 센다).
 *
 * 되돌림: drop index if exists engine.estimate_daily_once_c13; drop function if exists engine.ub_date(timestamptz);
 *   (되돌리면 동시-중복 방벽이 없던 08-24 이전으로 돌아간다 — 소비층 접기(학습자상태 v14)는 남는다.) */

begin;

do $migration$
declare
  migration_version constant text := '20260824090000';
  migration_name constant text := '20260824090000_estimate_once_c13.sql';
  expected_checksum constant text := 'f094fb26e2e1b9dd5c82524b4784ed6939babb5f2be42a8e762dd43c2a8bbdd9'; -- migration-checksum
  base_version constant text := '20260824020000';   -- 체인 규약: 직전 조각(recon 2판)
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

  /* ── 본문 ① — 몽골 날짜 immutable 래퍼(머리말 근거) ── */
  create or replace function engine.ub_date(t timestamptz)
  returns date
  language sql immutable
  as $ub$ select (t at time zone 'Asia/Ulaanbaatar')::date $ub$;

  /* ── 본문 ② — 확인 답 하루 1회 부분 유일 색인 ── */
  create unique index if not exists estimate_daily_once_c13
    on engine.learning_events (learner_id, engine.ub_date(ingested_at))
    where event_type = 'estimate.responded';

end
$migration$;

do $migration2$
declare
  expected_checksum constant text := 'f094fb26e2e1b9dd5c82524b4784ed6939babb5f2be42a8e762dd43c2a8bbdd9'; -- migration-checksum
begin
  if not exists (select 1 from engine.schema_migrations where version = '20260824090000') then
    insert into engine.schema_migrations(version, name, checksum)
    values ('20260824090000', '20260824090000_estimate_once_c13.sql', expected_checksum);
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
      and conname='cron_runs_outcome_c13') as 회차제약,
  -- G11(08-24) — 확인 답 하루 1회의 물리 방벽(부분 유일 · engine.ub_date 식). CHECK 가 아니라
  -- 「기대:」 줄 대상이 아니고, pg_constraint 에도 안 잡혀 pg_indexes 로 센다(연동활성유일 선례).
  (select count(*) from pg_indexes
    where schemaname='engine' and indexname='estimate_daily_once_c13') as 확인하루유일
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
              and 컴패니언열=11 and 컴패니언정책=0 and 회차제약=1 and 확인하루유일=1
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260824090000'
              and (select checksum from 현재이력)='f094fb26e2e1b9dd5c82524b4784ed6939babb5f2be42a8e762dd43c2a8bbdd9' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 21·21·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0·1·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 이 조각의 몫은 확인 답 하루 1회 방벽 «둘»(engine.ub_date 함수 · estimate_daily_once_c13 부분 유일)이다 — CHECK 를 만들지도 지우지도 않는다.
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
/* 확인 꼬리 이관 — 마지막 조각이 «확인 쿼리 블록»을 들게 한다 (20260825000000 후속 · 검사 층)
 *
 * ■ 무엇 — 스키마 변경 0. 이 조각의 몫은 꼬리에 확인 쿼리 블록을 다는 것 하나다.
 *   블록 내용은 20260824090000(estimate_once)의 것을 기계로 떼어 온 그대로이고,
 *   갈아끼운 것은 체인 끝 두 줄(현재이력 version·checksum)뿐이다.
 *
 * ■ 왜 — 조각 38개 중 37개가 이 블록을 들었는데 20260825000000 하나만 안 들었다.
 *   그러면 tools/마이그레이션_합본.js 의 syncCheckFile() 이 합본 «전체»에서
 *   lastIndexOf('with 기대열') 로 찾다가 «앞 조각» 것을 조용히 집는다 — 에러도 안 난다.
 *   그래서 supabase/확인_적용후상태.sql 이 한 세대 뒤(20260824090000)에 머물렀고,
 *   CI 의 「빈 DB 적용: 사후 판정=❌」이 08-25 이후 43커밋 내내 빨갰다.
 *   실측: 칸 37개는 «전부 통과»했다 — 깨진 것은 현재이력 두 줄뿐이었다.
 *
 * ■ 왜 20260825000000 을 안 고치고 새 조각을 붙이나 — supabase/DB착지판.json 이
 *   「리허설·운영 양쪽 최신 조각이 20260825000000」이라 기록한다. 이미 부어진 조각의
 *   파일을 고치면 checksum 이 갈려 «운영 이력 소급»이 된다. 그 길은 막혀 있다.
 *
 * 되돌림: 이 조각을 지우고 합본을 다시 구우면 전 판으로 돌아간다(스키마 무변경이라 DB 는 그대로다). */

begin;

do $migration$
declare
  migration_version constant text := '20260826000000';
  migration_name constant text := '20260826000000_check_tail_c13.sql';
  expected_checksum constant text := '301e4d5a1c9a47784a07de8d98b5348366c463c0f5518a6e3e5fed963cbc8318'; -- migration-checksum
  base_version constant text := '20260825000000';   -- 체인 규약: 직전 조각(cron_ledger_wait)
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

  /* 스키마 변경 0 — 이 조각의 몫은 아래 꼬리(확인 쿼리 블록)를 드는 것뿐이다. */
end
$migration$;

do $migration2$
declare
  expected_checksum constant text := '301e4d5a1c9a47784a07de8d98b5348366c463c0f5518a6e3e5fed963cbc8318'; -- migration-checksum
begin
  if not exists (select 1 from engine.schema_migrations where version = '20260826000000') then
    insert into engine.schema_migrations(version, name, checksum)
    values ('20260826000000', '20260826000000_check_tail_c13.sql', expected_checksum);
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
      and conname='cron_runs_outcome_c13') as 회차제약,
  -- G11(08-24) — 확인 답 하루 1회의 물리 방벽(부분 유일 · engine.ub_date 식). CHECK 가 아니라
  -- 「기대:」 줄 대상이 아니고, pg_constraint 에도 안 잡혀 pg_indexes 로 센다(연동활성유일 선례).
  (select count(*) from pg_indexes
    where schemaname='engine' and indexname='estimate_daily_once_c13') as 확인하루유일
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
              and 컴패니언열=11 and 컴패니언정책=0 and 회차제약=1 and 확인하루유일=1
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260826000000'
              and (select checksum from 현재이력)='301e4d5a1c9a47784a07de8d98b5348366c463c0f5518a6e3e5fed963cbc8318' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 21·21·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0·1·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 이 조각의 몫은 «꼬리를 드는 것» 하나다 — 스키마 변경 0, CHECK 를 만들지도 지우지도 않는다.
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
/* 몽골어 문구 감수 — 외부 감수자가 «우리 카피»를 고치는 자리 (검수_내부계약 §1 의 ⏳ 를 닫는 조각)
 *
 * ■ 무엇 — 표 둘(`l10n_strings`·`l10n_reviews`) · 뷰 하나(`l10n_queue`) · staff 역할 하나(`l10n_reviewer`).
 *
 * ■ 🔴 왜 검수 큐에 얹지 않고 «따로» 서나 — 문을 나누는 것이 이 조각의 절반이다
 *   `review` Fn 은 `['inspector','director']` 로 문 하나를 지킨다(functions/review/index.ts:120).
 *   몽골어 감수자에게 `inspector` 를 주면 **학생 발화 큐에도 그대로 통과한다** — 그 사람은
 *   외부 계약자다. 경로별로 역할을 갈라 막을 수도 있지만, 그것은 계약 §0 이 「새는 방향이 언제나
 *   통과」라며 기각한 바로 그 구조다(새 경로가 하나 늘 때마다 사람이 기억해야 하는 자리가 는다).
 *   👉 그래서 **자원부터 가른다**: 이 표들엔 학생 식별자가 한 칸도 없다(learner_id·event_id·
 *      submission_id 무참조). 감수자는 학생 데이터에 **원리상** 못 닿는다 — 권한 설정이 아니라
 *      스키마가 그것을 보장한다.
 *
 * ■ 🔑 `string_id` 는 ASCII 로 못 박는다 (2026-08-26 실측이 낳은 제약)
 *   같은 날 Sentry 태그 키가 한글이라 **이벤트는 200 으로 통과하고 태그만 조용히 사라지는**
 *   버그를 열하루 만에 찾았다(talk `7d6c9db`). 이 id 는 앱·문서·내보내기 파일을 오가는
 *   «바깥으로 나가는 키»라 같은 병에 걸릴 자리다. 값(한국어·몽골어)은 그대로 한글이어도 된다 —
 *   막히는 것은 언제나 키다(memory `workflow-schema-ascii-keys`).
 *
 * ■ verdict 세 값 — 「원문을 고쳐야 한다」가 있는 까닭
 *   ①`초벌이 맞다` ②`고쳤다` ③`원문을 고쳐야 한다`. ③이 없으면 감수자는 «번역이 안 되는
 *   한국어»를 만났을 때 억지로 옮기거나 건너뛴다. 그 신호는 몽골어가 아니라 **우리 카피의 결함**
 *   이고, 받을 자리가 없으면 영영 안 온다. ③일 때 `final_mn` 은 null 이어야 한다(제약이 강제) —
 *   「고칠 수 없다」고 말하면서 번역을 내는 것은 두 말을 한 번에 하는 것이다.
 *
 * ■ append-only — 고치면 새 행(`supersedes`)
 *   `corrections` 와 같은 수다. 감수는 되돌아오는 일이라(문구가 바뀌면 다시 본다) 마지막 판정만
 *   남기면 «왜 그렇게 정했나»가 사라진다.
 *
 * ■ RLS 는 켜되 정책은 0
 *   engine 의 규약 그대로 — 표 수 == RLS 켜진 수. 접근은 service_role(Edge Fn)만이고 그 문은
 *   `l10n` Fn 이 진다. 정책을 만들면 문이 둘이 된다.
 *
 * 되돌림: `drop view engine.l10n_queue; drop table engine.l10n_reviews, engine.l10n_strings;`
 *   + staff 역할 제약을 셋으로 되돌린다. 학생 데이터에 안 닿으므로 되돌림이 다른 표를 안 건드린다. */

begin;

do $migration$
declare
  migration_version constant text := '20260826130000';
  migration_name constant text := '20260826130000_l10n_c13.sql';
  expected_checksum constant text := 'c80631b25ad14e4c998ed5b4cb74ee9c11e5197aa282a485555bde87ed3d78ba'; -- migration-checksum
  base_version constant text := '20260826000000';   -- 체인 규약: 직전 조각(check_tail)
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
      'migration % 는 % 위에서만 돈다 — 체인이 끊겼다', migration_version, base_version;
  end if;

  if to_regclass('engine.staff') is null then
    raise exception
      'engine.staff 가 없다 — 감수자는 직원 위에 선다(20260806234000_staff_c7 이 먼저 서야 한다)';
  end if;

  -- ① 감수 대상 문장 — «우리 카피» 하나에 한 행. 학생 발화가 아니다.
  --    `max_len` 은 규모 못이 아니라 판단 재료다: 버튼 안에 들어가야 하는 문구인지 감수자가
  --    알아야 «짧게 고칠지»를 정한다. null 이 정상(길이 제약이 없는 자리).
  create table if not exists engine.l10n_strings (
    string_id  text primary key
               constraint l10n_strings_id_ascii_c13
               check (string_id ~ '^[a-z0-9]+([._-][a-z0-9]+)+$'),
    source_ko  text not null
               constraint l10n_strings_ko_nonblank_c13 check (btrim(source_ko) <> ''),
    draft_mn   text,
    context    text,
    max_len    smallint
               constraint l10n_strings_max_len_c13
               check (max_len is null or max_len between 1 and 4000),
    status     text not null default 'pending'
               constraint l10n_strings_status_c13
               check (status in ('pending', 'verified', 'discarded')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  comment on table engine.l10n_strings is
    '몽골어 감수 대상 문장(우리 카피). 학생 식별자를 한 칸도 안 든다 — 외부 감수자가 보는 자리라 스키마가 격리를 진다. 소비자 = l10n Fn.';

  -- ② 감수 결과 — append-only. 고치면 새 행이 `supersedes` 로 앞 행을 가리킨다.
  create table if not exists engine.l10n_reviews (
    review_id  uuid primary key default gen_random_uuid(),
    string_id  text not null references engine.l10n_strings(string_id) on delete restrict,
    reviewer   uuid not null references engine.staff(staff_id) on delete restrict,
    verdict    text not null
               constraint l10n_reviews_verdict_c13
               check (verdict in ('초벌이 맞다', '고쳤다', '원문을 고쳐야 한다')),
    final_mn   text,
    note       text,
    supersedes uuid references engine.l10n_reviews(review_id) on delete restrict,
    created_at timestamptz not null default now(),
    -- 🔴 「원문을 고쳐야 한다」면 번역을 내지 않는다 — 두 말을 한 번에 하는 것을 막는다.
    constraint l10n_reviews_final_paired_c13 check (
      (verdict = '원문을 고쳐야 한다' and final_mn is null)
      or (verdict <> '원문을 고쳐야 한다' and btrim(coalesce(final_mn, '')) <> '')
    ),
    constraint l10n_reviews_supersedes_not_self_c13 check (supersedes is distinct from review_id)
  );

  comment on table engine.l10n_reviews is
    '몽골어 감수 판정(append-only · 고치면 supersedes 로 새 행). verdict 셋 = 초벌이 맞다 / 고쳤다 / 원문을 고쳐야 한다 — 셋째가 우리 카피의 결함을 받는 유일한 통로다.';

  create index l10n_reviews_string_idx on engine.l10n_reviews (string_id, created_at desc);

  -- ③ 큐 판 — 판은 «무엇을 보여줄지»만 정한다(정렬은 읽는 쪽 몫 · 20260809050000 과 같은 축).
  create view engine.l10n_queue as
    select s.string_id, s.source_ko, s.draft_mn, s.context, s.max_len, s.created_at
      from engine.l10n_strings s
     where s.status = 'pending';

  comment on view engine.l10n_queue is
    '몽골어 감수 큐(검수_내부계약 §1 외부 검수자 갈래). 학생 정체·발화·오디오가 원리상 없다 — 기본 검수 큐와 자원 자체가 다르다.';

  -- ④ RLS — 정책 0. 접근은 service_role(l10n Fn) 하나이고 그 문이 역할을 본다.
  alter table engine.l10n_strings enable row level security;
  alter table engine.l10n_reviews enable row level security;

  -- ⑤ 역할 하나를 연다. 🔴 이름은 그대로 두고 값목록만 넓힌다 — 확인 꼬리의 기대제약이 이름으로 센다.
  alter table engine.staff drop constraint staff_role_c13;
  alter table engine.staff
    add constraint staff_role_c13
    check (role in ('teacher', 'inspector', 'director', 'l10n_reviewer'));

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
  -- 몽골어 문구 감수(20260826130000) — 학생 식별자 0 인 표 둘.
  ('l10n_strings','string_id'), ('l10n_strings','source_ko'), ('l10n_strings','draft_mn'),
  ('l10n_strings','context'), ('l10n_strings','max_len'), ('l10n_strings','status'),
  ('l10n_strings','created_at'), ('l10n_strings','updated_at'),
  ('l10n_reviews','review_id'), ('l10n_reviews','string_id'), ('l10n_reviews','reviewer'),
  ('l10n_reviews','verdict'), ('l10n_reviews','final_mn'), ('l10n_reviews','note'),
  ('l10n_reviews','supersedes'), ('l10n_reviews','created_at')
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
  -- 몽골어 문구 감수(20260826130000)
  ('l10n_strings_id_ascii_c13'), ('l10n_strings_ko_nonblank_c13'),
  ('l10n_strings_max_len_c13'), ('l10n_strings_status_c13'),
  ('l10n_reviews_verdict_c13'), ('l10n_reviews_final_paired_c13'),
  ('l10n_reviews_supersedes_not_self_c13'),
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
      and conname='cron_runs_outcome_c13') as 회차제약,
  -- G11(08-24) — 확인 답 하루 1회의 물리 방벽(부분 유일 · engine.ub_date 식). CHECK 가 아니라
  -- 「기대:」 줄 대상이 아니고, pg_constraint 에도 안 잡혀 pg_indexes 로 센다(연동활성유일 선례).
  (select count(*) from pg_indexes
    where schemaname='engine' and indexname='estimate_daily_once_c13') as 확인하루유일
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
              and 컴패니언열=11 and 컴패니언정책=0 and 회차제약=1 and 확인하루유일=1
              and (select v from 빠진열) is null
              and (select v from 빠진제약) is null
              and (select v from 빠진트리거) is null
              and (select version from 현재이력)='20260826130000'
              and (select checksum from 현재이력)='c80631b25ad14e4c998ed5b4cb74ee9c11e5197aa282a485555bde87ed3d78ba' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 23·23·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0·1·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 이 조각의 몫은 «꼬리를 드는 것» 하나다 — 스키마 변경 0, CHECK 를 만들지도 지우지도 않는다.
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
--         · jobs_winner_result_only_success_c13 · jobs_winner_result_pair_c13
--         · l10n_reviews_final_paired_c13 · l10n_reviews_supersedes_not_self_c13
--         · l10n_reviews_verdict_c13 · l10n_strings_id_ascii_c13
--         · l10n_strings_ko_nonblank_c13 · l10n_strings_max_len_c13
--         · l10n_strings_status_c13 · learners_gender_c13
--         · learners_goal_track_c13 · learners_group_no_c13 · learners_home_aimag_c13
--         · learners_seat_no_c13 · learners_signup_attempts_nonneg_c13
--         · learners_temp_password_paired_c13 · learning_events_correction_target_c13
--         · learning_events_event_type_c13 · learning_events_task_type_c13
--         · pipeline_jobs_discard_reason_c13 · season_compass_answers_c13 · season_dates_c13
--         · season_review_decided_c13 · season_review_self_c13 · season_review_verdict_c13
--         · staff_role_c13 · submissions_due_paired_c13 · submissions_task_format_c13
--         · submissions_translation_source_c13 · teacher_notes_body_nonblank_c13
--         · teacher_notes_disposition_c13 · teacher_notes_origin_c13
/* 교실 수집 첫 벌 — event_type +2 `goal.responded`·`observation.noted` (계약 c14 · 유호 확정 08-31 「웅 그대로 가」)
 *
 * ■ 무엇 — **살아 있는 CHECK 72개를 `_c13`→`_c14` 이름째 교체**(c12·c13 방식 — 접미를 안 갈면
 *   「c14 계약 + c13 물리」가 초록으로 보인다 · tests/L0스키마 「이름이 계약 버전」 자물쇠).
 *   값이 바뀌는 것은 `learning_events_event_type` 하나(+2 · 기존 행 검사 없음 = 넓히기만) —
 *   나머지 71개는 합본에서 **기계 추출한 본문 그대로**다(산출기는 스크래치 1회용 · 손 복사 0).
 *   그리고 c14 의 새 물리 넷:
 *   ① `learning_events.observer_staff_id` uuid FK — 관찰자 식별(corrections.reviewer 물리칸
 *      선례 · 이것 없이는 강사별 무수정 통과율·퇴사 강사 관찰 격리·「누구의 정답지였나」가 원리상 불가).
 *   ② `learning_events.draft_modified` boolean — AI 초안을 고쳤는가(자백 도장 감사의 분자 ·
 *      서버가 정한다 — 앱 자기신고 아님 · 관찰태그 설계 §2).
 *   ③ RLS `learner_self_events` 재정의 — 관찰 원문(강사의 솔직한 서술·태도 포함)을 학생
 *      열람에서 제외한다. `goal.responded` 는 자기 신고라 그대로 연다(계약 c14 ④).
 *   ④ `goal_daily_once_c14` 부분 유일 색인 — 목표 답 하루 1회의 물리 방벽
 *      (estimate_daily_once_c13 동형 · learner × 몽골 날짜 `engine.ub_date` · 경쟁 중복의
 *      늦은 쪽은 functions/events 가 duplicate 로 접는다).
 * ■ 왜 — 서클 20분의 「오늘 목표 → 그날 지켰나」 왕복과 강사 교실 관찰을 데이터로
 *   (교실 수집 ②·① · 정본 = appsscript docs/교실수집_목표왕복_설계_v1.md ·
 *    docs/관찰태그_자동화_설계.md v1.1 · 결정.md 08-31).
 * ■ 파일 이름의 _c14 — Edge Function 이 계약판을 최신 `_c<숫자>` 이름에서 읽는다(판 올림).
 *   c14 를 모르는 앱(c13 선언)은 그대로 동작한다 — 서버가 더 새 판인 것은 막지 않는다.
 *
 * 되돌림: 72개를 _c13 본문(값 15)으로 다시 add · alter table engine.learning_events
 *         drop column observer_staff_id, drop column draft_modified;
 *         drop index if exists engine.goal_daily_once_c14; RLS 를 c6 본문으로 재생성;
 *         delete from engine.schema_migrations where version='20260831130000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260831130000';
  migration_name constant text := '20260831130000_classroom_loop_c14.sql';
  expected_checksum constant text := '8e117a108346266594a1a1386b4a099f98c7c0e51b6fe94e91c95647c3ef5d3f'; -- migration-checksum
  base_version constant text := '20260826130000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c13 위에서만 돈다 — engine.schema_migrations 가 없다(빈 DB 면 합본을 처음부터 부어라)';
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
end
$migration$;

-- 살아 있는 CHECK 72개 — c13 본문 그대로 이름만 c14(값이 는 것은 event_type 하나 · +2).
alter table engine.generation_attempts
  drop constraint if exists attempts_gate_values_c13,
  drop constraint if exists attempts_gate_values_c14,
  add constraint attempts_gate_values_c14 check ( gate_failed_reasons is null or gate_failed_reasons <@ array[ '길이','한국어비율','빈출력','금칙서식','질문형태','식별자역유입','중복']::text[] );

alter table engine.generation_attempts
  drop constraint if exists attempts_response_present_c13,
  drop constraint if exists attempts_response_present_c14,
  add constraint attempts_response_present_c14 check ( result is null or result not in ('성공','검문탈락','응답파손','응답초과') or (raw_response is not null and responded_at is not null) );

alter table engine.generation_attempts
  drop constraint if exists attempts_result_gate_c13,
  drop constraint if exists attempts_result_gate_c14,
  add constraint attempts_result_gate_c14 check ( case when result = '검문탈락' then gate_failed_reasons is not null and cardinality(gate_failed_reasons) >= 1 else gate_failed_reasons is null end );

alter table engine.generation_attempts
  drop constraint if exists attempts_ver_nonempty_c13,
  drop constraint if exists attempts_ver_nonempty_c14,
  add constraint attempts_ver_nonempty_c14 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_counts_order_c13,
  drop constraint if exists batch_runs_counts_order_c14,
  add constraint batch_runs_counts_order_c14 check ( target_count is null or (target_count >= 0 and loaded_count <= enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_counts_pair_c13,
  drop constraint if exists batch_runs_counts_pair_c14,
  add constraint batch_runs_counts_pair_c14 check ((target_count is null) = (loaded_count is null));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_enrolled_nonneg_c13,
  drop constraint if exists batch_runs_enrolled_nonneg_c14,
  add constraint batch_runs_enrolled_nonneg_c14 check (enrolled_count >= 0);

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_finished_cols_c13,
  drop constraint if exists batch_runs_finished_cols_c14,
  add constraint batch_runs_finished_cols_c14 check ( finished_at is null or (target_count is not null and loaded_count is not null and partial_count is not null and skipped_game_count is not null and skipped_existing_count is not null) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_level_dist_ok_c13,
  drop constraint if exists batch_runs_level_dist_ok_c14,
  add constraint batch_runs_level_dist_ok_c14 check (engine.level_dist_ok(level_distribution, enrolled_count));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_partial_pair_c13,
  drop constraint if exists batch_runs_partial_pair_c14,
  add constraint batch_runs_partial_pair_c14 check ((partial_count is null) = (loaded_count is null));

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_partial_range_c13,
  drop constraint if exists batch_runs_partial_range_c14,
  add constraint batch_runs_partial_range_c14 check ( partial_count is null or (partial_count >= 0 and partial_count <= enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_roster_equation_c13,
  drop constraint if exists batch_runs_roster_equation_c14,
  add constraint batch_runs_roster_equation_c14 check ( finished_at is null or run_kind <> '배치' or (loaded_count + skipped_game_count + skipped_existing_count = enrolled_count) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_skipped_range_c13,
  drop constraint if exists batch_runs_skipped_range_c14,
  add constraint batch_runs_skipped_range_c14 check ( (skipped_game_count is null or (skipped_game_count >= 0 and skipped_game_count <= enrolled_count)) and (skipped_existing_count is null or (skipped_existing_count >= 0 and skipped_existing_count <= enrolled_count)) );

alter table engine.generation_batch_runs
  drop constraint if exists batch_runs_ver_nonempty_c13,
  drop constraint if exists batch_runs_ver_nonempty_c14,
  add constraint batch_runs_ver_nonempty_c14 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table radio.broadcast_segment
  drop constraint if exists broadcast_segment_kind_c13,
  drop constraint if exists broadcast_segment_kind_c14,
  add constraint broadcast_segment_kind_c14 check (kind in ('radio_loop', 'live_lecture', 'asmr_mode', 'other'));

alter table engine.classes
  drop constraint if exists classes_key_nonblank_c13,
  drop constraint if exists classes_key_nonblank_c14,
  add constraint classes_key_nonblank_c14 check (btrim(class_key) <> '');

alter table engine.companion_qa
  drop constraint if exists companion_qa_answer_paired_c13,
  drop constraint if exists companion_qa_answer_paired_c14,
  add constraint companion_qa_answer_paired_c14 check (handoff or btrim(answer) <> '');

alter table engine.companion_qa
  drop constraint if exists companion_qa_question_nonblank_c13,
  drop constraint if exists companion_qa_question_nonblank_c14,
  add constraint companion_qa_question_nonblank_c14 check (btrim(question) <> '');

alter table engine.corrections
  drop constraint if exists corrections_promotion_intent_c13,
  drop constraint if exists corrections_promotion_intent_c14,
  add constraint corrections_promotion_intent_c14 check (promotion_intent = false or actor_kind = 'teacher');

alter table engine.corrections
  drop constraint if exists corrections_supersedes_not_self_c13,
  drop constraint if exists corrections_supersedes_not_self_c14,
  add constraint corrections_supersedes_not_self_c14 check (supersedes is null or supersedes <> correction_id);

alter table engine.corrections
  drop constraint if exists corrections_verdict_c13,
  drop constraint if exists corrections_verdict_c14,
  add constraint corrections_verdict_c14 check (verdict is null or verdict in ( 'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다' ));

alter table ops.cron_runs
  drop constraint if exists cron_runs_outcome_c13,
  drop constraint if exists cron_runs_outcome_c14,
  add constraint cron_runs_outcome_c14 check (outcome in ('대기', '성공', '실패', '타임아웃', '전송오류', '상태없음', '유실', '발사실패'));

alter table engine.generation_jobs
  drop constraint if exists jobs_anchor_present_c13,
  drop constraint if exists jobs_anchor_present_c14,
  add constraint jobs_anchor_present_c14 check ( status not in ('착지','마감폴백','대상아님') or assigned_event_id is not null );

alter table engine.generation_jobs
  drop constraint if exists jobs_claim_cols_c13,
  drop constraint if exists jobs_claim_cols_c14,
  add constraint jobs_claim_cols_c14 check (status <> 'claimed' or (owner is not null and lease_until is not null));

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_pair_c13,
  drop constraint if exists jobs_deciding_pair_c14,
  add constraint jobs_deciding_pair_c14 check ((deciding_attempt_id is null) = (deciding_result is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_result_matches_c13,
  drop constraint if exists jobs_deciding_result_matches_c14,
  add constraint jobs_deciding_result_matches_c14 check (deciding_result is null or deciding_result = outcome);

alter table engine.generation_jobs
  drop constraint if exists jobs_deciding_scope_c13,
  drop constraint if exists jobs_deciding_scope_c14,
  add constraint jobs_deciding_scope_c14 check ( case when outcome is null then deciding_attempt_id is null when outcome in ('검문탈락','타임아웃','벤더오류','응답파손','입력초과','응답초과') then deciding_attempt_id is not null else deciding_attempt_id is null end );

alter table engine.generation_jobs
  drop constraint if exists jobs_draft_present_c13,
  drop constraint if exists jobs_draft_present_c14,
  add constraint jobs_draft_present_c14 check (status = '적재실패' or event_draft is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_idle_cols_c13,
  drop constraint if exists jobs_idle_cols_c14,
  add constraint jobs_idle_cols_c14 check (status <> '대기' or (owner is null and lease_until is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_load_failed_cols_c13,
  drop constraint if exists jobs_load_failed_cols_c14,
  add constraint jobs_load_failed_cols_c14 check ( status <> '적재실패' or (outcome = '내부오류' and assigned_event_id is null and event_draft is null and load_error is not null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_nontarget_cols_c13,
  drop constraint if exists jobs_nontarget_cols_c14,
  add constraint jobs_nontarget_cols_c14 check (status <> '대상아님' or not_target_reason is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_nonterminal_cols_c13,
  drop constraint if exists jobs_nonterminal_cols_c14,
  add constraint jobs_nonterminal_cols_c14 check ( status in ('착지','마감폴백','대상아님','적재실패') or (outcome is null and closed_at is null and assigned_event_id is null and winning_attempt_id is null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_skill_ids_present_c13,
  drop constraint if exists jobs_skill_ids_present_c14,
  add constraint jobs_skill_ids_present_c14 check ( status = '적재실패' or not_target_reason is not null or cardinality(skill_ids) between 1 and 2 );

alter table engine.generation_jobs
  drop constraint if exists jobs_status_outcome_pairs_c13,
  drop constraint if exists jobs_status_outcome_pairs_c14,
  add constraint jobs_status_outcome_pairs_c14 check ( case status when '대상아님' then outcome = '대상아님' when '마감폴백' then outcome = '예산소진' when '적재실패' then outcome = '내부오류' when '착지' then outcome is null or outcome not in ('대상아님','예산소진') else true end );

alter table engine.generation_jobs
  drop constraint if exists jobs_terminal_cols_c13,
  drop constraint if exists jobs_terminal_cols_c14,
  add constraint jobs_terminal_cols_c14 check ( status not in ('착지','마감폴백','대상아님','적재실패') or (outcome is not null and closed_at is not null) );

alter table engine.generation_jobs
  drop constraint if exists jobs_ver_nonempty_c13,
  drop constraint if exists jobs_ver_nonempty_c14,
  add constraint jobs_ver_nonempty_c14 check ( btrim(model) <> '' and btrim(prompt_ver) <> '' and btrim(policy_ver) <> '' and btrim(estimator_version) <> '' and btrim(schema_ver) <> '' and btrim(skill_taxonomy_ver) <> '' );

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_fence_current_c13,
  drop constraint if exists jobs_winner_fence_current_c14,
  add constraint jobs_winner_fence_current_c14 check (winning_fence is null or winning_fence = fence);

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_fence_pair_c13,
  drop constraint if exists jobs_winner_fence_pair_c14,
  add constraint jobs_winner_fence_pair_c14 check ((winning_attempt_id is null) = (winning_fence is null));

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_only_success_c13,
  drop constraint if exists jobs_winner_only_success_c14,
  add constraint jobs_winner_only_success_c14 check (winning_attempt_id is null or outcome = '성공');

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_present_c13,
  drop constraint if exists jobs_winner_present_c14,
  add constraint jobs_winner_present_c14 check (outcome <> '성공' or winning_attempt_id is not null);

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_result_only_success_c13,
  drop constraint if exists jobs_winner_result_only_success_c14,
  add constraint jobs_winner_result_only_success_c14 check (winning_result is null or winning_result = '성공');

alter table engine.generation_jobs
  drop constraint if exists jobs_winner_result_pair_c13,
  drop constraint if exists jobs_winner_result_pair_c14,
  add constraint jobs_winner_result_pair_c14 check ((winning_attempt_id is null) = (winning_result is null));

alter table engine.l10n_reviews
  drop constraint if exists l10n_reviews_final_paired_c13,
  drop constraint if exists l10n_reviews_final_paired_c14,
  add constraint l10n_reviews_final_paired_c14 check (
      (verdict = '원문을 고쳐야 한다' and final_mn is null)
      or (verdict <> '원문을 고쳐야 한다' and btrim(coalesce(final_mn, '')) <> '')
    );

alter table engine.l10n_reviews
  drop constraint if exists l10n_reviews_supersedes_not_self_c13,
  drop constraint if exists l10n_reviews_supersedes_not_self_c14,
  add constraint l10n_reviews_supersedes_not_self_c14 check (supersedes is distinct from review_id);

alter table engine.l10n_reviews
  drop constraint if exists l10n_reviews_verdict_c13,
  drop constraint if exists l10n_reviews_verdict_c14,
  add constraint l10n_reviews_verdict_c14 check (verdict in ('초벌이 맞다', '고쳤다', '원문을 고쳐야 한다'));

alter table engine.l10n_strings
  drop constraint if exists l10n_strings_id_ascii_c13,
  drop constraint if exists l10n_strings_id_ascii_c14,
  add constraint l10n_strings_id_ascii_c14 check (string_id ~ '^[a-z0-9]+([._-][a-z0-9]+)+$');

alter table engine.l10n_strings
  drop constraint if exists l10n_strings_ko_nonblank_c13,
  drop constraint if exists l10n_strings_ko_nonblank_c14,
  add constraint l10n_strings_ko_nonblank_c14 check (btrim(source_ko) <> '');

alter table engine.l10n_strings
  drop constraint if exists l10n_strings_max_len_c13,
  drop constraint if exists l10n_strings_max_len_c14,
  add constraint l10n_strings_max_len_c14 check (max_len is null or max_len between 1 and 4000);

alter table engine.l10n_strings
  drop constraint if exists l10n_strings_status_c13,
  drop constraint if exists l10n_strings_status_c14,
  add constraint l10n_strings_status_c14 check (status in ('pending', 'verified', 'discarded'));

alter table engine.learners
  drop constraint if exists learners_gender_c13,
  drop constraint if exists learners_gender_c14,
  add constraint learners_gender_c14 check (gender is null or gender in ('female', 'male', 'undisclosed'));

alter table engine.learners
  drop constraint if exists learners_goal_track_c13,
  drop constraint if exists learners_goal_track_c14,
  add constraint learners_goal_track_c14 check (goal_track is null or goal_track in ('study', 'work', 'culture'));

alter table engine.learners
  drop constraint if exists learners_group_no_c13,
  drop constraint if exists learners_group_no_c14,
  add constraint learners_group_no_c14 check (group_no between 1 and 20);

alter table engine.learners
  drop constraint if exists learners_home_aimag_c13,
  drop constraint if exists learners_home_aimag_c14,
  add constraint learners_home_aimag_c14 check (home_aimag is null or home_aimag in ( 'ulaanbaatar', 'arkhangai', 'bayan-olgii', 'bayankhongor', 'bulgan', 'darkhan-uul', 'dornod', 'dornogovi', 'dundgovi', 'govi-altai', 'govisumber', 'khentii', 'khovd', 'khovsgol', 'omnogovi', 'orkhon', 'ovorkhangai', 'selenge', 'sukhbaatar', 'tov', 'uvs', 'zavkhan'));

alter table engine.learners
  drop constraint if exists learners_seat_no_c13,
  drop constraint if exists learners_seat_no_c14,
  add constraint learners_seat_no_c14 check (seat_no between 1 and 20);

alter table engine.learners
  drop constraint if exists learners_signup_attempts_nonneg_c13,
  drop constraint if exists learners_signup_attempts_nonneg_c14,
  add constraint learners_signup_attempts_nonneg_c14 check (signup_attempts >= 0);

alter table engine.learners
  drop constraint if exists learners_temp_password_paired_c13,
  drop constraint if exists learners_temp_password_paired_c14,
  add constraint learners_temp_password_paired_c14 check (temp_password_hash is null or temp_password_expires_at is not null);

alter table engine.learning_events
  drop constraint if exists learning_events_correction_target_c13,
  drop constraint if exists learning_events_correction_target_c14,
  add constraint learning_events_correction_target_c14 check ( case when event_type in ('correction.viewed', 'correction.responded') then correction_id is not null else correction_id is null end );

alter table engine.learning_events
  drop constraint if exists learning_events_event_type_c13,
  drop constraint if exists learning_events_event_type_c14,
  add constraint learning_events_event_type_c14 check (event_type in (
    'submission.created', 'quiz.answered', 'choice.selected', 'correction.responded', 'correction.viewed', 'preference.stated', 'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
    'task.assigned', 'exam.result', 'content.viewed', 'affect.reported',
    'estimate.responded', 'goal.responded', 'observation.noted'
  ));

alter table engine.learning_events
  drop constraint if exists learning_events_task_type_c13,
  drop constraint if exists learning_events_task_type_c14,
  add constraint learning_events_task_type_c14 check (task_type is null or task_type in ( '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화', '라디오퀴즈', '목표선언', '자습체크인' ));

alter table engine.pipeline_jobs
  drop constraint if exists pipeline_jobs_discard_reason_c13,
  drop constraint if exists pipeline_jobs_discard_reason_c14,
  add constraint pipeline_jobs_discard_reason_c14 check (discard_reason is null or (status = 'discarded' and discard_reason in ('무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가')));

alter table engine.season_compass
  drop constraint if exists season_compass_answers_c13,
  drop constraint if exists season_compass_answers_c14,
  add constraint season_compass_answers_c14 check ( ( self_in_5y_changed is null and answers ?& array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] and answers - array['why_learning', 'self_in_5y', 'topik_use', 'season_goal'] = '{}'::jsonb ) or ( self_in_5y_changed is not null and answers ?& array['self_in_5y', 'season_goal'] and answers - array['self_in_5y', 'season_goal'] = '{}'::jsonb ) );

alter table engine.season
  drop constraint if exists season_dates_c13,
  drop constraint if exists season_dates_c14,
  add constraint season_dates_c14 check (ends_on is null or ends_on >= starts_on);

alter table engine.season_review
  drop constraint if exists season_review_decided_c13,
  drop constraint if exists season_review_decided_c14,
  add constraint season_review_decided_c14 check ( (verdict is null and note is null and decided_by is null and decided_at is null) or (verdict is not null and decided_by is not null and decided_at is not null and note is not null and btrim(note) <> '') );

alter table engine.season_review
  drop constraint if exists season_review_self_c13,
  drop constraint if exists season_review_self_c14,
  add constraint season_review_self_c14 check (verdict_by_self is null or verdict_by_self in ('closer', 'same', 'redirected'));

alter table engine.season_review
  drop constraint if exists season_review_verdict_c13,
  drop constraint if exists season_review_verdict_c14,
  add constraint season_review_verdict_c14 check (verdict is null or verdict in ('closer', 'same', 'redirected'));

alter table engine.staff
  drop constraint if exists staff_role_c13,
  drop constraint if exists staff_role_c14,
  add constraint staff_role_c14 check (role in ('teacher', 'inspector', 'director', 'l10n_reviewer'));

alter table engine.submissions
  drop constraint if exists submissions_due_paired_c13,
  drop constraint if exists submissions_due_paired_c14,
  add constraint submissions_due_paired_c14 check ( (due_at is null) = (due_ver is null) );

alter table engine.submissions
  drop constraint if exists submissions_task_format_c13,
  drop constraint if exists submissions_task_format_c14,
  add constraint submissions_task_format_c14 check (task_format is null or task_format in ( '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역' ));

alter table engine.submissions
  drop constraint if exists submissions_translation_source_c13,
  drop constraint if exists submissions_translation_source_c14,
  add constraint submissions_translation_source_c14 check ( task_format is distinct from '번역' or nullif(btrim(task_snapshot->>'mn'), '') is not null );

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_body_nonblank_c13,
  drop constraint if exists teacher_notes_body_nonblank_c14,
  add constraint teacher_notes_body_nonblank_c14 check (btrim(body) <> '');

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_disposition_c13,
  drop constraint if exists teacher_notes_disposition_c14,
  add constraint teacher_notes_disposition_c14 check (disposition in ('confirmed', 'retry'));

alter table engine.teacher_notes
  drop constraint if exists teacher_notes_origin_c13,
  drop constraint if exists teacher_notes_origin_c14,
  add constraint teacher_notes_origin_c14 check (origin in ('as_is', 'edited', 'written'));

-- ── c14 새 물리 ──────────────────────────────────────────────────────────────

-- ① 관찰자 식별(누가 봤나) — corrections.reviewer 물리칸 선례. observation.noted 행만 채운다
--    (다른 사건은 null 이 정상). FK on delete 기본(NO ACTION) — 강사 행은 지우지 않고
--    revoked_before 로 끝낸다(staff_c7 규약)라 실제로 막힐 일이 없어야 정상이다.
alter table engine.learning_events
  add column if not exists observer_staff_id uuid references engine.staff(staff_id);

-- ② AI 초안을 고쳤는가 — 자백 도장 감사의 분자. 🔴 서버(teach 관찰 경로)가 초안 대조로 정한다 —
--    앱이 보낸 불리언을 받으면 「서버칸」 규약이 막으려는 자기신고가 이름만 바꿔 돌아온다(설계 §2).
alter table engine.learning_events
  add column if not exists draft_modified boolean;

-- ③ RLS 재정의 — 관찰 원문은 학생 self-select 에서 제외한다(계약 c14 ④ · M2 설계 §5 예약분).
--    goal.responded 는 자기 신고라 그대로 연다. 학생에게 되돌려줄 문장은 개인 코치 카드
--    계열의 몫이지 원문 노출이 아니다.
drop policy if exists learner_self_events on engine.learning_events;
create policy learner_self_events on engine.learning_events for select to authenticated
  using (learner_id = engine.current_learner_id() and event_type <> 'observation.noted');

-- ④ 목표 답 하루 1회 — 동시 경쟁 중복의 물리 방벽(estimate_daily_once_c13 동형 · 그 조각의
--    ub_date immutable 래퍼를 그대로 쓴다). 이름은 태어난 판(_c14)을 달고 그대로 산다
--    (UNIQUE 는 CHECK 접미 통일 대상이 아니다 — recon2 꼬리 규율).
create unique index if not exists goal_daily_once_c14
  on engine.learning_events (learner_id, engine.ub_date(ingested_at))
  where event_type = 'goal.responded';

do $migration2$
declare
  expected_checksum constant text := '8e117a108346266594a1a1386b4a099f98c7c0e51b6fe94e91c95647c3ef5d3f'; -- migration-checksum
begin
  if not exists (select 1 from engine.schema_migrations where version = '20260831130000') then
    insert into engine.schema_migrations(version, name, checksum)
    values ('20260831130000', '20260831130000_classroom_loop_c14.sql', expected_checksum);
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
  -- 몽골어 문구 감수(20260826130000) — 학생 식별자 0 인 표 둘.
  ('l10n_strings','string_id'), ('l10n_strings','source_ko'), ('l10n_strings','draft_mn'),
  ('l10n_strings','context'), ('l10n_strings','max_len'), ('l10n_strings','status'),
  ('l10n_strings','created_at'), ('l10n_strings','updated_at'),
  ('l10n_reviews','review_id'), ('l10n_reviews','string_id'), ('l10n_reviews','reviewer'),
  ('l10n_reviews','verdict'), ('l10n_reviews','final_mn'), ('l10n_reviews','note'),
  ('l10n_reviews','supersedes'), ('l10n_reviews','created_at')
), 기대제약(n) as (values
  -- ── c12: CHECK 는 전부 _c13 접미 — 이 조각이 _c11 서른하나를 이름째 교체했다.
  --    UNIQUE·EXCLUDE·FK·PK 는 값목록이 없어 판 판별과 무관하니 c11 이름 그대로다.
  ('learning_events_event_type_c14'), ('learning_events_task_type_c14'),
  ('submissions_task_format_c14'), ('submissions_translation_source_c14'),
  ('submissions_due_paired_c14'), ('corrections_verdict_c14'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c14'), ('staff_role_c14'),
  ('learners_temp_password_paired_c14'),
  ('learning_events_correction_target_c14'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c14'), ('corrections_promotion_intent_c14'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c14'),
  -- 시즌 그릇(20260812140000) — 겹침 배제·날짜 순서·학생×시즌 유일·문항 묶음 + 고리 둘.
  ('season_no_overlap_c11'), ('season_dates_c14'),
  ('season_compass_once_c11'), ('season_compass_answers_c14'),
  ('season_compass_learner_id_fkey'), ('season_compass_season_id_fkey'),
  -- 시즌 회고(20260812170000) — 판정 3갈래 둘 + 「판정·사유·주체·시각 한 벌」 + 고리 둘.
  ('season_review_once_c11'), ('season_review_verdict_c14'),
  ('season_review_self_c14'), ('season_review_decided_c14'),
  ('season_review_learner_id_fkey'), ('season_review_season_id_fkey'),
  -- 가입 1회 문항 값목록(20260812180000) — 세 칸 전부.
  ('learners_home_aimag_c14'), ('learners_gender_c14'), ('learners_goal_track_c14'),
  -- 반(20260812200000) — 고리 넷 + 빈 좌표 금지.
  ('classes_pkey'), ('classes_key_nonblank_c14'), ('classes_season_id_fkey'),
  ('learners_class_id_fkey'),
  ('staff_classes_pkey'), ('staff_classes_staff_id_fkey'), ('staff_classes_class_id_fkey'),
  -- 강사 한 마디(20260812210000) — 유일(한 산출물에 하나) + 값목록 둘 + 빈 말 금지 + 고리 둘.
  ('teacher_notes_pkey'), ('teacher_notes_once_c11'), ('teacher_notes_body_nonblank_c14'),
  ('teacher_notes_origin_c14'), ('teacher_notes_disposition_c14'),
  ('teacher_notes_submission_id_fkey'), ('teacher_notes_staff_id_fkey'),
  -- 조·좌석 쓰레기 못(20260814100000)
  ('learners_group_no_c14'), ('learners_seat_no_c14'),
  -- companion 빈칸 로그(20260814110000)
  ('companion_qa_question_nonblank_c14'), ('companion_qa_answer_paired_c14'),
  ('companion_qa_staff_id_fkey'),
  -- 생성 실행 장부(20260821120000) — CHECK 34 + FK 3 + UNIQUE 3(전이·계보의 물리).
  ('attempts_gate_values_c14'),
  ('attempts_response_present_c14'),
  ('attempts_result_gate_c14'),
  ('attempts_ver_nonempty_c14'),
  ('batch_runs_counts_order_c14'),
  ('batch_runs_counts_pair_c14'),
  ('batch_runs_enrolled_nonneg_c14'),
  ('batch_runs_finished_cols_c14'),
  ('batch_runs_level_dist_ok_c14'),
  ('batch_runs_partial_pair_c14'),
  ('batch_runs_partial_range_c14'),
  ('batch_runs_roster_equation_c14'),
  ('batch_runs_skipped_range_c14'),
  ('batch_runs_ver_nonempty_c14'),
  ('jobs_anchor_present_c14'),
  ('jobs_claim_cols_c14'),
  ('jobs_deciding_pair_c14'),
  ('jobs_deciding_result_matches_c14'),
  ('jobs_deciding_scope_c14'),
  ('jobs_draft_present_c14'),
  ('jobs_idle_cols_c14'),
  ('jobs_load_failed_cols_c14'),
  ('jobs_nontarget_cols_c14'),
  ('jobs_nonterminal_cols_c14'),
  ('jobs_skill_ids_present_c14'),
  ('jobs_status_outcome_pairs_c14'),
  ('jobs_terminal_cols_c14'),
  ('jobs_ver_nonempty_c14'),
  ('jobs_winner_fence_current_c14'),
  ('jobs_winner_fence_pair_c14'),
  ('jobs_winner_only_success_c14'),
  ('jobs_winner_present_c14'),
  ('jobs_winner_result_only_success_c14'),
  ('jobs_winner_result_pair_c14'),
  -- 몽골어 문구 감수(20260826130000)
  ('l10n_strings_id_ascii_c14'), ('l10n_strings_ko_nonblank_c14'),
  ('l10n_strings_max_len_c14'), ('l10n_strings_status_c14'),
  ('l10n_reviews_verdict_c14'), ('l10n_reviews_final_paired_c14'),
  ('l10n_reviews_supersedes_not_self_c14'),
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
      and conname='broadcast_segment_kind_c14') as 라디오kind제약,
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
      and conname='cron_runs_outcome_c14') as 회차제약,
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
              and (select version from 현재이력)='20260831130000'
              and (select checksum from 현재이력)='8e117a108346266594a1a1386b4a099f98c7c0e51b6fe94e91c95647c3ef5d3f' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 23·23·7·0·0·5·1·0·0·1·0·0·0·0·22·0·0·0·0·2·6·6·0·0·0·1·1·1·30·0·1·26·0·11·0·1·1·1 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 이 조각 = CHECK 72개 판올림(_c13→_c14 · 값 증분은 event_type +2 하나) + 물리칸 2 + RLS 재정의 + 색인 1.
-- ② 아래 기대 목록은 위 판올림을 반영한 현행이다 — 마지막 조각이 이 줄을 든다(l10n_c13 의 그 규율 그대로).
--    ⚠ 이 줄은 마지막 조각이 들고 있어야 한다. 합본은 조각을 이어붙인 것이라
--      tests/L0스키마.test.js 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 파일명이 제약 이름으로 읽혀 빨개진다.
--    ⚠ `season_no_overlap_c11`(EXCLUDE) · `…_once_c11`(UNIQUE) · `companion_qa_*_fkey` 는 여기
--      없다 — CHECK 가 아니라 이 줄의 대상이 아니고, 이름도 c11 그대로 산다(값목록이 없어
--      판 판별과 무관하다 · 위 기대제약 목록에는 그 이름 그대로 들어 있다).
--    기대: attempts_gate_values_c14 · attempts_response_present_c14 · attempts_result_gate_c14
--         · attempts_ver_nonempty_c14 · batch_runs_counts_order_c14 · batch_runs_counts_pair_c14
--         · batch_runs_enrolled_nonneg_c14 · batch_runs_finished_cols_c14
--         · batch_runs_level_dist_ok_c14 · batch_runs_partial_pair_c14
--         · batch_runs_partial_range_c14 · batch_runs_roster_equation_c14
--         · batch_runs_skipped_range_c14 · batch_runs_ver_nonempty_c14 · broadcast_segment_kind_c14
--         · classes_key_nonblank_c14 · companion_qa_answer_paired_c14
--         · companion_qa_question_nonblank_c14 · corrections_promotion_intent_c14
--         · corrections_supersedes_not_self_c14 · corrections_verdict_c14 · cron_runs_outcome_c14
--         · jobs_anchor_present_c14 · jobs_claim_cols_c14 · jobs_deciding_pair_c14
--         · jobs_deciding_result_matches_c14 · jobs_deciding_scope_c14 · jobs_draft_present_c14
--         · jobs_idle_cols_c14 · jobs_load_failed_cols_c14 · jobs_nontarget_cols_c14
--         · jobs_nonterminal_cols_c14 · jobs_skill_ids_present_c14 · jobs_status_outcome_pairs_c14
--         · jobs_terminal_cols_c14 · jobs_ver_nonempty_c14 · jobs_winner_fence_current_c14
--         · jobs_winner_fence_pair_c14 · jobs_winner_only_success_c14 · jobs_winner_present_c14
--         · jobs_winner_result_only_success_c14 · jobs_winner_result_pair_c14
--         · l10n_reviews_final_paired_c14 · l10n_reviews_supersedes_not_self_c14
--         · l10n_reviews_verdict_c14 · l10n_strings_id_ascii_c14
--         · l10n_strings_ko_nonblank_c14 · l10n_strings_max_len_c14
--         · l10n_strings_status_c14 · learners_gender_c14
--         · learners_goal_track_c14 · learners_group_no_c14 · learners_home_aimag_c14
--         · learners_seat_no_c14 · learners_signup_attempts_nonneg_c14
--         · learners_temp_password_paired_c14 · learning_events_correction_target_c14
--         · learning_events_event_type_c14 · learning_events_task_type_c14
--         · pipeline_jobs_discard_reason_c14 · season_compass_answers_c14 · season_dates_c14
--         · season_review_decided_c14 · season_review_self_c14 · season_review_verdict_c14
--         · staff_role_c14 · submissions_due_paired_c14 · submissions_task_format_c14
--         · submissions_translation_source_c14 · teacher_notes_body_nonblank_c14
--         · teacher_notes_disposition_c14 · teacher_notes_origin_c14
