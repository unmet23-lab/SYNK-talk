with rows(v) as (
  select 'schema_migrations|' || coalesce(jsonb_agg(to_jsonb(t) order by version)::text, '[]')
    from engine.schema_migrations t
  union all
  select 'learners|' || coalesce(jsonb_agg(to_jsonb(t) order by learner_id)::text, '[]')
    from engine.learners t
  union all
  select 'learning_events|' || coalesce(jsonb_agg(to_jsonb(t) order by event_id)::text, '[]')
    from engine.learning_events t
  union all
  select 'submissions|' || coalesce(jsonb_agg(to_jsonb(t) order by submission_id)::text, '[]')
    from engine.submissions t
  union all
  select 'corrections|' || coalesce(jsonb_agg(to_jsonb(t) order by correction_id)::text, '[]')
    from engine.corrections t
  union all
  select 'skills|' || coalesce(jsonb_agg(to_jsonb(t) order by skill_id)::text, '[]')
    from engine.skills t
  union all
  select 'consents|' || coalesce(jsonb_agg(to_jsonb(t) order by consent_id)::text, '[]')
    from engine.consents t
  union all
  select 'pipeline_jobs|' || coalesce(jsonb_agg(to_jsonb(t) order by job_id)::text, '[]')
    from engine.pipeline_jobs t
  union all
  select 'daily_activity|' || coalesce(jsonb_agg(to_jsonb(t) order by learner_id, activity_date)::text, '[]')
    from engine.daily_activity t
)
select md5(string_agg(v, E'\n' order by v)) from rows;
