-- 읽기 전용 한 문장. 운영·리허설을 혼동하지 않도록 실행자가 대상 REF를 명시한다.
-- PostgreSQL 17.6 운영에서 pg_input_is_valid 지원 확인. 원문·토큰·실행문·본문 전체는 출력하지 않는다.
-- ops.수확()를 호출하지 않는다. 기존 ops-harvest의 실행 메타데이터만 읽는다.
-- 24시간 실행 횟수와 최근 한 회차의 업무 건수를 분리한다. 누적 backlog를 더하지 않는다.
-- 빈/잘린/잘못된 JSON 및 없는 needs_attention은 null이다. HTTP 성공은 업무 완료와 다르다.
with expected_jobs(jobname) as (values
  ('correct-nightly'), ('correct-collect'), ('deliver-check'), ('deliver-daily'),
  ('ops-harvest'), ('radio-promote-hourly'), ('transcribe-batch')
), cron_metadata as (
  select e.jobname, count(j.jobid) as registered_count,
         count(j.jobid) filter (where j.active) as active_count
    from expected_jobs e left join cron.job j using (jobname)
   group by e.jobname
), cron_executions as (
  select j.jobname, count(*) as runs_24h,
         count(*) filter (where d.status = 'succeeded') as sql_succeeded_24h,
         count(*) filter (where d.status = 'failed') as sql_failed_24h,
         max(d.start_time) as last_started_at, max(d.end_time) as last_ended_at
    from cron.job_run_details d join cron.job j using (jobid)
   where j.jobname in (select jobname from expected_jobs)
     and d.start_time >= now() - interval '24 hours'
   group by j.jobname
), runs as (
  select jobname, queued_at, harvested_at, outcome, status_code, timed_out,
         case when body is not null and pg_input_is_valid(body, 'jsonb')
              then body::jsonb end as payload,
         row_number() over (partition by jobname order by queued_at desc, id desc) as recency
    from ops.cron_runs
   where jobname in ('correct-nightly', 'correct-collect')
     and queued_at >= now() - interval '24 hours'
), run_totals as (
  select jobname, count(*) as runs_24h,
         count(*) filter (where outcome = '성공') as http_success_24h,
         count(*) filter (where outcome = '대기') as pending_24h,
         count(*) filter (where outcome not in ('성공', '대기')) as failure_24h,
         count(*) filter (where payload -> 'needs_attention' = 'true'::jsonb) as attention_true_24h,
         count(*) filter (where jsonb_typeof(payload -> 'needs_attention') is distinct from 'boolean') as attention_unknown_24h
    from runs group by jobname
), latest_results as (
  select jobname, queued_at, harvested_at, outcome, status_code, timed_out,
         coalesce(jsonb_typeof(payload) = 'object', false) as body_parse_ok,
         case when jsonb_typeof(payload -> 'needs_attention') = 'boolean'
              then (payload ->> 'needs_attention')::boolean end as needs_attention,
         (select jsonb_object_agg(k, case
            when jsonb_typeof(payload -> k) = 'number' and payload ->> k ~ '^[0-9]{1,15}$'
            then (payload ->> k)::bigint end)
          from unnest(array['대기', '적음', '미룸', '제출', '접수미확정', '결과실패']) as keys(k)) as result_counts
    from runs where recency = 1
), record_counts as (
  select (select count(*) from engine.corrections) as corrections_total,
         count(*) as pipeline_jobs_total,
         count(*) filter (where correction_batch_id = 'submitting') as unconfirmed_receipts,
         count(*) filter (where correction_batch_id is not null and correction_batch_id <> 'submitting') as accepted_receipts
    from engine.pipeline_jobs
)
select now() as observed_at,
       (select max(version) from engine.schema_migrations) as migration_version,
       exists (select 1 from engine.schema_migrations
               where version = '20260911070000'
                 and checksum = 'cb9d8c7d3b254ac4cf2702ffadcf03dc5952e59ab5fc3485e0a38d4807794da8') as correction_migration_checksum_matches,
       (select jsonb_agg(to_jsonb(m) order by jobname) from cron_metadata m) as cron_registration,
       (select coalesce(jsonb_agg(to_jsonb(e) order by jobname), '[]'::jsonb) from cron_executions e) as cron_execution_metadata,
       (select coalesce(jsonb_agg(to_jsonb(t) order by jobname), '[]'::jsonb) from run_totals t) as correct_http_runs_24h,
       (select coalesce(jsonb_agg(to_jsonb(r) order by jobname), '[]'::jsonb) from latest_results r) as latest_correct_results,
       (select to_jsonb(c) from record_counts c) as correction_record_counts;
