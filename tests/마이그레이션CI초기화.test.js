'use strict';
// 실제 SQL 실행은 GitHub의 로컬 Supabase 작업이 잰다. 여기서는 그 준비 순서/범위를 합성한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'tools/검증_마이그레이션.sh'), 'utf8');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const source = workflow.match(/node <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE\r?\n\s+supabase start/)?.[1];

function config(input) {
  let output;
  vm.runInNewContext(source, { require: (name) => {
    assert.equal(name, 'node:fs');
    return { readFileSync: () => input, writeFileSync: (file, text) => {
      assert.equal(file, 'supabase/config.toml'); output = text;
    } };
  } });
  return output;
}

test('CI startup은 migration 자동실행만 끄며 실제 검증 명령은 유지한다', () => {
  assert.ok(source);
  const input = '[api]\nenabled = true\n[db.migrations]\nenabled = true\nschema_paths = []\n[db.seed]\nenabled = true\n';
  assert.equal(config(input), input.replace('[db.migrations]\nenabled = true', '[db.migrations]\nenabled = false'));
  assert.equal(config(input.replace(/\n/g, '\r\n')), config(input));
  assert.match(workflow, /SYNK_MIGRATION_CI: '1'/);
  assert.match(workflow, /run: bash tools\/검증_마이그레이션.sh/);
  assert.doesNotMatch(workflow, /continue-on-error|supabase start.*\|\|/);
});
test('CLI 설정 형식이 바뀌거나 migration 설정이 없으면 조용히 진행하지 않는다', () => {
  for (const input of ['[api]\nenabled = true', '[db.migrations]\nenabled = false',
    '[db.migrations]\nenabled = true\n[db.migrations]\nenabled = true']) {
    assert.throws(() => config(input), /bootstrap config not found/);
  }
});
test('검증 shell 구문은 Bash가 직접 확인한다(실행/네트워크 0)', () => {
  const r = spawnSync(bash, ['-n', 'tools/검증_마이그레이션.sh'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || String(r.error || ''));
});

test('실제 shell 과녁 게이트는 CI 및 기본 로컬 DB/Auth만 통과시킨다', () => {
  const gate = shell.slice(shell.indexOf('[[ "${SYNK_MIGRATION_CI:-}"'), shell.indexOf('PSQL='));
  assert.ok(gate.length > 100);
  const base = { ...process.env, SYNK_MIGRATION_CI: '1', GITHUB_ACTIONS: 'true',
    TEST_DB_URL: 'postgresql://postgres:synthetic-local@127.0.0.1:54322/postgres',
    TEST_API_URL: 'http://127.0.0.1:54321' };
  const script = `set -e\nsupabase() { printf 'DB_URL=%q\\nAPI_URL=%q\\n' "$TEST_DB_URL" "$TEST_API_URL"; }\n${gate}\nprintf 'accepted'`;
  const cases = [
    [true, {}],
    [false, { SYNK_MIGRATION_CI: '' }], [false, { GITHUB_ACTIONS: '' }],
    [false, { TEST_DB_URL: 'postgresql://postgres:private-value@remote.invalid:54322/postgres' }],
    [false, { TEST_DB_URL: base.TEST_DB_URL + '?host=remote.invalid' }],
    [false, { TEST_DB_URL: base.TEST_DB_URL + '#private-value' }],
    [false, { TEST_API_URL: 'https://remote.invalid' }],
    [false, { TEST_API_URL: base.TEST_API_URL + '@remote.invalid' }],
  ];
  for (const [accepted, env] of cases) {
    const r = spawnSync(bash, ['-c', script], { encoding: 'utf8', env: { ...base, ...env } });
    assert.equal(r.status === 0, accepted, '허용/거절 방향');
    assert.equal(r.stdout.includes('accepted'), accepted);
    for (const hidden of ['private-value', 'synthetic-local', 'remote.invalid']) {
      assert.equal((r.stdout + r.stderr).includes(hidden), false, '주소/비밀 로그 없음');
    }
  }
});
test('cron launcher off를 재조회한 뒤에만 고정 합성 Vault 값을 만든다', () => {
  const bootstrap = shell.slice(shell.indexOf('bootstrap_local_ci()'), shell.indexOf('assert_cron_quiet()'));
  assert.match(bootstrap, /to_regnamespace\('engine'\) is null/);
  assert.match(bootstrap, /select count\(\*\) from cron.job/);
  assert.match(bootstrap, /alter system set cron.launch_active_jobs = 'off'[\s\S]*select pg_reload_conf\(\)/);
  assert.ok(bootstrap.indexOf('[[ "$loaded" == \'off\' ]] || fail') < bootstrap.indexOf('vault.create_secret('));
  assert.match(bootstrap, /ci-only-not-a-service-token/);
  assert.doesNotMatch(bootstrap, /\$SERVICE_ROLE_KEY|\$ANON_KEY|net.http_post|curl/);
  assert.match(shell, /cron.job_run_details/);
  assert.match(shell, /net.http_request_queue/);
  assert.match(shell, /net._http_response/);
});
test('실제 bootstrap은 관리자에서 설정 두 명령만 실행하며 권한/리로드 실패면 fixture 전에 멈춘다', () => {
  const bootstrap = shell.slice(shell.indexOf('bootstrap_local_ci()'), shell.indexOf('assert_cron_quiet()'));
  const script = `set -e
DATABASE_URL='postgresql://postgres:synthetic-local@127.0.0.1:54322/postgres'
PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)
fail() { echo 'blocked' >&2; exit 1; }
scalar() { "\u0024{PSQL[@]}" -Atc "$1"; }
sleep() { :; }
psql() {
  local connection="$1" query="\u0024{!#}"
  local role='postgres'
  [[ "$connection" == postgresql://supabase_admin:* ]] && role='admin'
  case "$query" in
    *"to_regnamespace('engine')"*) printf t ;;
    'create extension if not exists pg_cron') [[ "$role" == postgres ]] ;;
    'select count(*) from cron.job') printf 0 ;;
    *"select current_user = 'supabase_admin'"*)
      [[ "$role" == admin ]] || return 20
      printf '%s' "$TEST_ROLE_CHECK" ;;
    "alter system set cron.launch_active_jobs = 'off'")
      [[ "$role" == admin ]] || return 21
      printf 'admin-setting\\n' >&2 ;;
    'select pg_reload_conf()')
      [[ "$role" == admin ]] || return 22
      printf 'admin-reload\\n' >&2
      printf '%s' "$TEST_RELOAD" ;;
    *"current_setting('cron.launch_active_jobs')"*)
      [[ "$role" == postgres ]] || return 23
      printf '%s' "$TEST_LOADED" ;;
    ON_ERROR_STOP=1)
      [[ "$role" == postgres ]] || return 24
      local body
      body="$(</dev/stdin)"
      [[ "$body" == *vault.create_secret* ]] || return 25
      printf 'fixture\\n' >&2 ;;
    *) return 26 ;;
  esac
}
${bootstrap}
bootstrap_local_ci
printf completed`;
  for (const [ok, env] of [[true, {}], [false, { TEST_ROLE_CHECK: 'f' }],
    [false, { TEST_RELOAD: 'f' }], [false, { TEST_LOADED: 'on' }]]) {
    const r = spawnSync(bash, ['-c', script], { encoding: 'utf8', env: {
      ...process.env, TEST_ROLE_CHECK: 't', TEST_RELOAD: 't', TEST_LOADED: 'off', ...env,
    } });
    assert.equal(r.status === 0, ok, r.stderr);
    assert.equal(r.stderr.includes('fixture'), ok, '실패하면 합성 설정조차 만들지 않는다');
    if (ok) assert.match(r.stderr, /admin-setting\r?\nadmin-reload\r?\nfixture/);
    assert.equal((r.stdout + r.stderr).includes('synthetic-local'), false);
  }
  assert.doesNotMatch(bootstrap, /grant\s+|alter\s+role\s+/i);
});
test('빈 DB와 reset 모두 원문 마이그레이션을 실제 적용하고 5개 보존/2개 비활성을 잰다', () => {
  assert.match(shell, /for migration in "\$\{MIGRATIONS\[@\]\}"; do[\s\S]*run_file "\$migration"/);
  assert.match(shell, /previous_cron="\$\(previous_cron_fingerprint\)"/);
  assert.match(shell, /\[\[ "\$\(previous_cron_fingerprint\)" == "\$previous_cron" \]\]/);
  assert.match(shell, /supabase db reset --local >\/dev\/null\s+bootstrap_local_ci\s+run_file "\$BUNDLE"\s+assert_postcheck 'db reset'/);
  assert.match(shell, /where not active and jobname in\s*\('correct-nightly','correct-collect'\)/);
  assert.match(shell, /assert_postcheck\(\)[\s\S]*assert_cron_contract/);
  // 재실행/체크섬 충돌/rollback/하위판 ALTER/혼합 중단/실제 RLS 검증을 지우지 않는다.
  for (const marker of ['before_schema=', 'good_checksum=', 'SYNK_MIGRATION_FAILURE_INJECTION_POINT',
    'assert_lower_survived c3', 'assert_lower_survived c4', 'c3/c4 혼합 상태', "'사용자1 JWT sub 불일치'"]) {
    assert.ok(shell.includes(marker), marker);
  }
});
