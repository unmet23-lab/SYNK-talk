-- 운영 전용 준비본. 실행자는 correct 새 배포·소스 대조를 먼저 완료해야 한다.
-- 이 SQL은 함수 배포본을 증명하지 않는다. 함수 호출·수확·키 변경은 하지 않는다.
-- 기준: Talk 78c8c9c / 20260911070000_correct_automation_c16.sql.
-- correct-nightly: 16:13 UTC = 다음날 01:13 KST / 00:13 몽골.
-- correct-collect: 매시 07/17/27/37/47/57분. 활성화 뒤 예약 시각부터 자동 실행된다.
-- 재실행은 멱등: 두 예약이 이미 active여도 다른 필드나 기존 예약은 바꾸지 않는다.
-- 전체 테이블/행 잠금·역할 전환·권한 변경은 하지 않는다.
-- advisory 잠금은 같은 두 키를 쓰는 이 스크립트끼리만 협력한다. 다른 도구의 동시 변경은 막지 못한다.
-- 전후 읽기에서 보이는 예약/대상 변경은 취소한다. 그 사이 변경·복원이나 마지막 검사 후 변경까지 보장하지 않는다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $activate$
declare
  expected_version constant text := '20260911070000';
  expected_checksum constant text := 'cb9d8c7d3b254ac4cf2702ffadcf03dc5952e59ab5fc3485e0a38d4807794da8';
  preserved_names constant text[] := array[
    'deliver-check', 'deliver-daily', 'ops-harvest', 'radio-promote-hourly', 'transcribe-batch'];
  preserved_before text;
  preserved_after text;
  nightly_id bigint;
  collect_id bigint;
  nightly_job record;
  collect_job record;
  new_jobs_before text;
  new_jobs_after text;
  nightly_command constant text := $nightly$
      select ops.발사('correct-nightly',
        (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/correct');
    $nightly$;
  collect_command constant text := $collect$
      select ops.발사('correct-collect',
        (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/correct?%ED%9A%8C%EC%88%98=1');
    $collect$;
begin
  if not pg_try_advisory_xact_lock(20260911, 70000) then
    raise exception 'correct cron: another cooperative activation is running';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'correct cron: fresh pre/post observations require read committed';
  end if;
  if current_setting('cron.timezone', true) is null
     or current_setting('cron.timezone', true) not in ('GMT', 'UTC') then
    raise exception 'correct cron: UTC cron timezone not verified';
  end if;
  if not exists (
    select 1 from engine.schema_migrations
    where version = expected_version
      and name = '20260911070000_correct_automation_c16.sql'
      and checksum = expected_checksum
  ) or (select max(version) from engine.schema_migrations) is distinct from expected_version then
    raise exception 'correct cron: current migration version or checksum mismatch';
  end if;
  if (select count(*) from vault.decrypted_secrets where name = 'functions_base_url') <> 1
     or (select count(*) from vault.decrypted_secrets
      where name = 'functions_base_url'
        and decrypted_secret = 'https://qiwxeddwwnzkwalpsuty.supabase.co/functions/v1') <> 1 then
    raise exception 'correct cron: production target not verified';
  end if;
  if to_regprocedure('ops.발사(text,text)') is null
     or to_regprocedure('ops.수확()') is null then
    raise exception 'correct cron: existing dispatch or harvest function missing';
  end if;

  -- 허용된 cron.alter_job만 쓴다. 직접 cron.job 잠금/수정 권한은 요구하지 않는다.
  if (select count(*) from cron.job) <> 7
     or (select count(*) from cron.job where jobname = any(preserved_names) and active) <> 5
     or (select count(distinct jobname) from cron.job where jobname = any(preserved_names)) <> 5
     or (select count(*) from cron.job where jobname in ('correct-nightly', 'correct-collect')) <> 2
     or (select count(distinct jobname) from cron.job where jobname in ('correct-nightly', 'correct-collect')) <> 2 then
    raise exception 'correct cron: expected five active plus two new jobs not intact';
  end if;
  select md5(jsonb_agg(to_jsonb(j) order by jobid)::text) into preserved_before
    from cron.job j where jobname = any(preserved_names);

  select j.* into strict nightly_job from cron.job j where jobname = 'correct-nightly';
  select j.* into strict collect_job from cron.job j where jobname = 'correct-collect';
  nightly_id := nightly_job.jobid;
  collect_id := collect_job.jobid;
  -- migration literal 그대로 비교한다. 줄바꿈/맨 바깥 공백만 정리하고 문자열 내부 공백은 보존한다.
  if nightly_id is null or collect_id is null or nightly_id = collect_id
     or nightly_job.schedule is distinct from '13 16 * * *'
     or collect_job.schedule is distinct from '7-57/10 * * * *'
     or nightly_job.database is distinct from current_database()
     or collect_job.database is distinct from current_database()
     or btrim(replace(nightly_job.command, E'\r\n', E'\n'), E' \t\r\n') is distinct from btrim(replace(nightly_command, E'\r\n', E'\n'), E' \t\r\n')
     or btrim(replace(collect_job.command, E'\r\n', E'\n'), E' \t\r\n') is distinct from btrim(replace(collect_command, E'\r\n', E'\n'), E' \t\r\n') then
    raise exception 'correct cron: new job schedule, database or dispatch text mismatch';
  end if;
  new_jobs_before := md5(jsonb_build_array(to_jsonb(nightly_job) - 'active', to_jsonb(collect_job) - 'active')::text);

  perform cron.alter_job(job_id := nightly_id, active := true);
  perform cron.alter_job(job_id := collect_id, active := true);

  select j.* into strict nightly_job from cron.job j where jobid = nightly_id;
  select j.* into strict collect_job from cron.job j where jobid = collect_id;
  new_jobs_after := md5(jsonb_build_array(to_jsonb(nightly_job) - 'active', to_jsonb(collect_job) - 'active')::text);
  select md5(jsonb_agg(to_jsonb(j) order by jobid)::text) into preserved_after
    from cron.job j where jobname = any(preserved_names);
  if preserved_before is null or preserved_before is distinct from preserved_after
     or new_jobs_before is null or new_jobs_before is distinct from new_jobs_after
     or (select count(*) from cron.job) <> 7
     or (select count(*) from cron.job where jobname = any(preserved_names) and active) <> 5
     or nightly_job.jobname is distinct from 'correct-nightly'
     or collect_job.jobname is distinct from 'correct-collect'
     or nightly_job.active is not true or collect_job.active is not true
     or (select count(*) from cron.job where jobid in (nightly_id, collect_id) and active) <> 2 then
    raise exception 'correct cron: preservation or activation postcondition failed';
  end if;
  if (select count(*) from vault.decrypted_secrets where name = 'functions_base_url') <> 1
     or not exists (select 1 from vault.decrypted_secrets where name = 'functions_base_url'
        and decrypted_secret = 'https://qiwxeddwwnzkwalpsuty.supabase.co/functions/v1')
     or not exists (select 1 from engine.schema_migrations where version = expected_version
        and name = '20260911070000_correct_automation_c16.sql' and checksum = expected_checksum)
     or (select max(version) from engine.schema_migrations) is distinct from expected_version then
    raise exception 'correct cron: target or migration changed during activation';
  end if;
end
$activate$;
commit;

select jobname, active from cron.job
where jobname in ('correct-nightly', 'correct-collect', 'deliver-check', 'deliver-daily',
                 'ops-harvest', 'radio-promote-hourly', 'transcribe-batch')
order by jobname;
