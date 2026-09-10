'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const file = path.join(root, 'supabase/migrations/20260911070000_correct_automation_c16.sql');
const source = fs.readFileSync(file, 'utf8');
const head = source.slice(0, source.indexOf('commit;') + 7);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const code = strip(head);

test('이행은 c16 기반·체크섬·원자적 트랜잭션으로 묶는다', () => {
  require('../tools/마이그레이션_합본.js').validateChecksum(Buffer.from(source));
  assert.match(code, /begin;[\s\S]*do \$migration\$[\s\S]*commit;/);
  assert.match(code, /base_version constant text := '20260907200000'/);
  assert.match(code, /recorded_checksum is distinct from expected_checksum/);
});
test('기존 잡 0개 리허설은 무예약, 5개 전부 활성인 환경만 신규 등록 준비한다', () => {
  assert.match(code, /previous_jobs not in \(0, 5\) or active_jobs <> previous_jobs/);
  assert.match(code, /if previous_jobs = 5 then[\s\S]*cron.schedule/);
  assert.match(code, /같은 이름의 미등록 이력 예약 존재/);
});
test('야간 제출과 10분 회수-only만 만들고 배포 대조 전에는 비활성이다', () => {
  assert.equal([...code.matchAll(/cron.schedule\(/g)].length, 2);
  assert.match(code, /cron.schedule\('correct-nightly', '13 16 \* \* \*'/);
  assert.match(code, /cron.schedule\('correct-collect', '7-57\/10 \* \* \* \*'/);
  assert.match(code, /\/correct\?%ED%9A%8C%EC%88%98=1/);
  assert.match(code, /cron.alter_job\(job_id := jobid, active := false\)[\s\S]*'correct-nightly', 'correct-collect'/);
  assert.doesNotMatch(code, /cron.unschedule|cron\.job set|\?즉시/);
});
test('Vault·ops를 재사용하고 교정만 130초, 기존 잡은 5초다', () => {
  assert.match(code, /create or replace function ops.발사\(p_job text, p_url text\)/);
  assert.match(code, /timeout_milliseconds := case when p_job in \('correct-nightly', 'correct-collect'\) then 130000 else 5000 end/);
  assert.match(code, /vault.decrypted_secrets where name = 'service_role_key'/);
  assert.match(code, /'dispatch_failed:' \|\| sqlstate/);
  assert.doesNotMatch(code, /sqlerrm|create_secret|update_secret|sk-ant-/i);
});
test('기존 처리 잡에 내부 영수증 1칸만 더하고 원문·교정 이력을 보존한다', () => {
  assert.match(code, /alter table engine.pipeline_jobs add column correction_batch_id text;/);
  assert.equal([...code.matchAll(/add column/g)].length, 1);
  assert.doesNotMatch(code, /create table|\bunique\b|\bdrop\b|\bdelete\b|\btruncate\b|engine.corrections/i);
  assert.ok(source.includes("('pipeline_jobs','correction_batch_id')"));
});
