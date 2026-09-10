#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE="$ROOT/supabase/L0_스키마.sql"
POSTCHECK="$ROOT/supabase/확인_적용후상태.sql"
C3="$ROOT/tests/supabase/fixtures/기준선_c3.sql"
C4_DELTA="$ROOT/tests/supabase/fixtures/기준선_c4_from_c3.sql"
SCHEMA_FP="$ROOT/tests/supabase/스키마_지문.sql"
DATA_FP="$ROOT/tests/supabase/데이터_지문.sql"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 버전을 손으로 적지 않는다 — 조각 파일명이 정본이다.
# 「낡은 기대값」이 이 저장소에서 세 번 났고 증상은 셋 다 **정상 적용이 ❌로 보인다**였다.
# BASE = 기준선(부트스트랩 갈래를 지는 조각) · LATEST = 체인 끝(사후 확인이 보는 현재버전).
mapfile -t MIGRATIONS < <(ls "$ROOT"/supabase/migrations/*.sql | sort)
(( ${#MIGRATIONS[@]} >= 1 )) || { echo "마이그레이션 조각이 0개다" >&2; exit 2; }
BASE_VERSION="$(basename "${MIGRATIONS[0]}" | cut -c1-14)"
LATEST_VERSION="$(basename "${MIGRATIONS[-1]}" | cut -c1-14)"

# status의 값은 로컬 스택 자격증명뿐이며 출력하지 않는다.
[[ "${SYNK_MIGRATION_CI:-}" == '1' && "${GITHUB_ACTIONS:-}" == 'true' ]] \
  || { echo '이 파괴적 실행층 검증은 GitHub CI 로컬 스택 전용이다' >&2; exit 2; }
eval "$(supabase status -o env)"
DATABASE_URL="${DB_URL:?supabase status가 DB_URL을 내지 않았다}"
SUPABASE_LOCAL_URL="${API_URL:?supabase status가 API_URL을 내지 않았다}"

# 비밀번호·전체 주소는 실패 로그에도 싣지 않는다. query/fragment로 host를 덮는 URI도 거절한다.
[[ "$DATABASE_URL" =~ ^postgresql://[^/@]+(:[^/@]+)?@(127\.0\.0\.1|localhost):54322/postgres$ ]] \
  || { echo 'CI 기본 포트의 로컬 postgres만 허용한다' >&2; exit 2; }
[[ "$SUPABASE_LOCAL_URL" =~ ^http://(127\.0\.0\.1|localhost):54321$ ]] \
  || { echo 'CI 기본 포트의 로컬 Auth만 허용한다' >&2; exit 2; }

PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)

fail() { echo "검증 실패: $*" >&2; exit 1; }
scalar() { "${PSQL[@]}" -Atc "$1"; }
run_file() { "${PSQL[@]}" -f "$1" >/dev/null; }

# CI에서만 합성 Vault 선행조건을 세운다. 운영 migration/checksum은 바꾸지 않는다.
# pg_cron 공식: launch_active_jobs는 SIGHUP 설정이며 pg_reload_conf 뒤 활성 예약도 실행하지 않는다.
# https://github.com/citusdata/pg_cron#extension-settings
bootstrap_local_ci() {
  [[ "$(scalar "select to_regnamespace('engine') is null")" == 't' ]] \
    || fail 'CI bootstrap 전에 engine이 이미 있다 — startup migration이 꺼졌는지 확인'
  "${PSQL[@]}" -c 'create extension if not exists pg_cron' >/dev/null
  [[ "$(scalar 'select count(*) from cron.job')" == '0' ]] || fail '빈 CI DB에 기존 예약이 남았다'
  "${PSQL[@]}" -c "alter system set cron.launch_active_jobs = 'off'" >/dev/null
  [[ "$(scalar 'select pg_reload_conf()')" == 't' ]] || fail 'cron 설정 reload 실패'
  local loaded=''
  for _ in {1..20}; do
    loaded="$(scalar "select current_setting('cron.launch_active_jobs')")"
    [[ "$loaded" == 'off' ]] && break
    sleep 0.1
  done
  [[ "$loaded" == 'off' ]] || fail 'cron launcher가 꺼지지 않았다'
  "${PSQL[@]}" <<'SQL' >/dev/null
create extension if not exists supabase_vault with schema vault;
do $fixture$
begin
  if exists (select 1 from vault.secrets where name in ('functions_base_url','service_role_key')) then
    raise exception 'CI Vault fixture 이름이 이미 있다';
  end if;
  -- URL은 실제 migration의 형식 검사에 맞춘 합성값이다. launcher off이므로 요청하지 않는다.
  perform vault.create_secret('https://cifixture000000000000.supabase.co/functions/v1', 'functions_base_url');
  perform vault.create_secret('ci-only-not-a-service-token', 'service_role_key');
end
$fixture$;
SQL
}

assert_cron_quiet() {
  [[ "$(scalar "select current_setting('cron.launch_active_jobs')")" == 'off' ]] || fail 'cron launcher 켜짐'
  [[ "$(scalar 'select count(*) from cron.job_run_details')" == '0' ]] || fail 'CI 예약이 실제 실행됐다'
  [[ "$(scalar 'select count(*) from net.http_request_queue')" == '0' ]] || fail 'CI HTTP 요청이 대기 중이다'
  [[ "$(scalar 'select count(*) from net._http_response')" == '0' ]] || fail 'CI HTTP 요청 결과가 생겼다'
}

assert_cron_contract() {
  [[ "$(scalar "select count(*) from cron.job where active and jobname in
    ('deliver-daily','deliver-check','transcribe-batch','radio-promote-hourly','ops-harvest')")" == '5' ]] \
    || fail '기존 예약 5개 활성 계약이 달라졌다'
  [[ "$(scalar "select count(*) from cron.job where not active and jobname in
    ('correct-nightly','correct-collect')")" == '2' ]] || fail '신규 교정 예약 2개가 비활성이 아니다'
  [[ "$(scalar 'select count(*) from cron.job')" == '7' ]] || fail 'CI 예약 개수가 7개가 아니다'
  assert_cron_quiet
}

previous_cron_fingerprint() {
  scalar "select md5(string_agg(row_to_json(j)::text, E'\\n' order by jobname)) from cron.job j
    where jobname in ('deliver-daily','deliver-check','transcribe-batch','radio-promote-hourly','ops-harvest')"
}
# «처음부터 다시»는 합본이 만드는 스키마 **전부**를 지워야 한다 — 이름이 engine 만 말하던
# 옛 판(drop_engine)은 08-24 실측에서 혼합 상태를 스스로 만들었다: 이력(engine.schema_migrations)은
# 지워지는데 ops 실물(뷰)은 살아남아, 재건이 옛 판 뷰로 「내려가기」 replace 를 치다
# `cannot drop columns from view` 로 죽는다(v2 뷰 위에 v1 을 다시 얹는 자리 · run 32717172049).
# 합본 소유 스키마는 셋이다: engine · ops(20260815080000) · radio. 새 스키마를 만드는 조각이
# 생기면 여기에도 한 줄 — 안 넣으면 ③④⑥ 이 그 스키마의 잔존을 «전 판 실물»로 들고 돈다.
drop_synk() {
  assert_cron_quiet
  # 검증 격리 초기화에만 CI 소유 7개를 제거한다. 실제 migration의 5개 보존 검사는 별도다.
  "${PSQL[@]}" -c "select cron.unschedule(jobid) from cron.job where jobname in
    ('deliver-daily','deliver-check','transcribe-batch','radio-promote-hourly','ops-harvest','correct-nightly','correct-collect')" >/dev/null
  "${PSQL[@]}" -c 'drop schema if exists engine cascade; drop schema if exists ops cascade; drop schema if exists radio cascade' >/dev/null
}

expect_file_failure() {
  local file="$1" label="$2"
  if "${PSQL[@]}" -f "$file" >"$TMP/expected-failure.log" 2>&1; then
    fail "$label: 실패해야 하는 SQL이 성공했다"
  fi
}

assert_postcheck() {
  local label="$1" row verdict version checksum
  row="$("${PSQL[@]}" -AtF '|' -f "$POSTCHECK")"
  IFS='|' read -r verdict version checksum _rest <<<"$row"
  # ❌ 는 「기대」만 말하고 실측을 숨기고 있었다(08-24 ⑥ 진단에서 실측) — 어느 칸이 갈렸는지
  # 없이는 CI 로그가 진단 재료가 못 된다. 실패할 때 행 전체(실측 포함)를 그대로 찍는다.
  [[ "$verdict" == '✅ 전부 통과' ]] || fail "$label: 사후 판정=$verdict
  실측 행 전체: $row"
  [[ "$version" == "$LATEST_VERSION" ]] || fail "$label: 현재버전=$version (기대 $LATEST_VERSION)"
  [[ "$checksum" =~ ^[0-9a-f]{64}$ ]] || fail "$label: checksum 형식 오류"
  assert_cron_contract
}

fingerprint() { "${PSQL[@]}" -At -f "$1"; }

seed_current() {
  "${PSQL[@]}" <<'SQL' >/dev/null
insert into engine.learners(learner_id, student_code, schema_ver)
values ('00000000-0000-4000-8000-000000000001', 'CI-CURRENT', 'c6');
/* 🔴 동의가 사건보다 **먼저** 선다. 예전엔 맨 뒤였는데, 사건이 `consent_id` 로 동의를 가리키는
 *   순간 그 순서는 FK 위반이다. 시드는 「무엇이든 들어가기만 하면 되는」 것이 아니라 실제
 *   수집 순서(동의 → 수집)를 닮아야 한다 — 닮지 않으면 조이는 날 CI 가 먼저 죽는다. */
insert into engine.consents(
  consent_id, learner_id, consent_ver, agreed_at, schema_ver, recorded_by
) values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000001', 'v1', now(), 'c6', 'tools/검증_마이그레이션.sh'
);
insert into engine.learning_events(
  event_id, learner_id, event_type, task_type, occurred_at,
  idempotency_key, consent_ver, consent_id, schema_ver
) values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'submission.created', '숙제제출', now(), 'ci-current-event', 'v1',
  '00000000-0000-4000-8000-000000000401', 'c6'
);
insert into engine.submissions(
  submission_id, event_id, task_type, body_original, occurred_at, schema_ver
) values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  '숙제제출', '합성 현재판 문장', now(), 'c6'
);
insert into engine.corrections(
  correction_id, submission_id, actor_kind, corrected_text, schema_ver
) values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  'ai', '합성 현재판 문장', 'c6'
);
insert into engine.skills(skill_id, label_ko, domain, schema_ver)
values ('ci-skill', '합성 기술', 'grammar', 'c6');
SQL
}

seed_lower() {
  local label="$1"
  "${PSQL[@]}" <<SQL >/dev/null
insert into engine.learners(learner_id, student_code, schema_ver)
values ('10000000-0000-4000-8000-000000000001', 'CI-${label}', '${label}');
-- ⚠ 이 씨앗은 «recorded_by·consent_id 가 생기기 전» 시대(c3/c4)를 흉내낸다 — 그 열들로
-- 심으면 column does not exist 로 죽는다(08-10 에 넣은 시대착오 · CI 가 꺼져 있어 08-24 발견).
-- 합본 스스로 「null 은 이 열이 생기기 전에 선 행이다」라 못박은 유산 경로를 ⑥ 이 실측한다.
-- 동의귀속:시대이전 — c3/c4 스키마에는 recorded_by 가 없다
insert into engine.consents(
  consent_id, learner_id, consent_ver, agreed_at, schema_ver
) values (
  '10000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000001', 'v1', now(), '${label}'
);
-- 동의귀속:시대이전 — c3/c4 스키마에는 consent_id 열이 없다(consent_ver 는 그때도 not null)
insert into engine.learning_events(
  event_id, learner_id, event_type, task_type, occurred_at,
  idempotency_key, consent_ver, schema_ver
) values (
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000001',
  'submission.created', '숙제제출', now(), 'ci-${label}-event', 'v1', '${label}'
);
insert into engine.submissions(
  submission_id, event_id, task_type, body_original, occurred_at, schema_ver
) values (
  '10000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000101',
  '숙제제출', '합성 낮은판 문장', now(), '${label}'
);
insert into engine.corrections(
  correction_id, submission_id, actor_kind, corrected_text, schema_ver
) values (
  '10000000-0000-4000-8000-000000000301',
  '10000000-0000-4000-8000-000000000201',
  'ai', '합성 낮은판 문장', '${label}'
);
insert into engine.skills(skill_id, label_ko, domain, schema_ver)
values ('ci-lower-skill', '합성 낮은판 기술', 'grammar', '${label}');
SQL
}

assert_lower_survived() {
  local label="$1" count
  count="$(scalar "select
    (select count(*) from engine.learners where student_code='CI-${label}') +
    (select count(*) from engine.learning_events where idempotency_key='ci-${label}-event') +
    (select count(*) from engine.submissions where body_original='합성 낮은판 문장') +
    (select count(*) from engine.corrections where corrected_text='합성 낮은판 문장') +
    (select count(*) from engine.consents where learner_id='10000000-0000-4000-8000-000000000001') +
    (select count(*) from engine.skills where skill_id='ci-lower-skill')")"
  [[ "$count" == '6' ]] || fail "$label: 기존 데이터 보존 수=$count"
  [[ "$(scalar "select count(*) from pg_constraint where connamespace='engine'::regnamespace and conname ~ '_c(3|4)$'")" == '0' ]] \
    || fail "$label: 옛 CHECK 접미사가 남았다"
}

echo '① 빈 DB 적용 + 사후 확인'
bootstrap_local_ci
# startup 대신 **실제 파일 전부**를 적용한다. 새 조각 직전/직후 기존 5개는 jobid·명령까지 불변이다.
previous_cron=''
for migration in "${MIGRATIONS[@]}"; do
  if [[ "$(basename "$migration")" == '20260911070000_correct_automation_c16.sql' ]]; then
    previous_cron="$(previous_cron_fingerprint)"
    [[ "$previous_cron" =~ ^[0-9a-f]{32}$ ]] || fail '교정 이행 전 기존 예약 지문 없음'
  fi
  run_file "$migration"
  if [[ "$(basename "$migration")" == '20260911070000_correct_automation_c16.sql' ]]; then
    [[ "$(previous_cron_fingerprint)" == "$previous_cron" ]] || fail '교정 이행이 기존 5개 예약을 바꿨다'
    assert_cron_contract
  fi
done
assert_postcheck '빈 DB 적용'

echo '② 같은 DB 연속 재실행 — 이력·구조·데이터 불변'
seed_current
before_schema="$(fingerprint "$SCHEMA_FP")"
before_data="$(fingerprint "$DATA_FP")"
before_applied_at="$(scalar "select applied_at::text from engine.schema_migrations where version='$BASE_VERSION'")"
run_file "$BUNDLE"
[[ "$(fingerprint "$SCHEMA_FP")" == "$before_schema" ]] || fail '재실행 뒤 구조가 바뀌었다'
[[ "$(fingerprint "$DATA_FP")" == "$before_data" ]] || fail '재실행 뒤 데이터가 바뀌었다'
[[ "$(scalar "select applied_at::text from engine.schema_migrations where version='$BASE_VERSION'")" == "$before_applied_at" ]] \
  || fail '재실행이 applied_at을 다시 썼다'

echo '②-b 같은 version checksum 불일치 중단'
good_checksum="$(scalar "select checksum from engine.schema_migrations where version='$BASE_VERSION'")"
"${PSQL[@]}" -c "update engine.schema_migrations set checksum=repeat('0',64) where version='$BASE_VERSION'" >/dev/null
expect_file_failure "$BUNDLE" 'checksum 불일치'
[[ "$(scalar "select checksum from engine.schema_migrations where version='$BASE_VERSION'")" == "$(printf '0%.0s' {1..64})" ]] \
  || fail '실패한 재실행이 이력 행을 바꿨다'
[[ "$good_checksum" =~ ^[0-9a-f]{64}$ ]] || fail '원래 checksum 형식 오류'
"${PSQL[@]}" -c \
  "update engine.schema_migrations set checksum='$good_checksum' where version='$BASE_VERSION'" >/dev/null

echo '③ commit 전 실패 주입 — 전부 롤백'
drop_synk
awk '{print} /SYNK_MIGRATION_FAILURE_INJECTION_POINT/ {print "  raise exception '\''CI injected failure'\'';"}' \
  "$BUNDLE" >"$TMP/fail-before-commit.sql"
expect_file_failure "$TMP/fail-before-commit.sql" '중간 실패'
[[ "$(scalar "select to_regnamespace('engine') is null")" == 't' ]] || fail '중간 실패 뒤 engine 반쪽 상태가 남았다'
run_file "$BUNDLE"
assert_postcheck '중간 실패 복구'

echo '④ 롤백 경로 실측 + 다시 세우기'
drop_synk
[[ "$(scalar "select to_regnamespace('engine') is null")" == 't' ]] || fail 'drop schema 롤백 경로가 작동하지 않았다'
run_file "$BUNDLE"
assert_postcheck '롤백 뒤 재적용'

echo '⑥ 정확한 c3 → c6 ALTER + 기존 데이터 보존'
drop_synk
run_file "$C3"
seed_lower c3
run_file "$BUNDLE"
# 보존 실측이 먼저다 — 그 다음 씨앗 자국(합성 스킬)을 걷어야 사후 대조가 선다.
# 스킬시드수 셀은 「정확히 30」(08-12 진입 · CI 는 08-11 부터 죽어 있어 ⑥ 과 처음 만난 게
# 08-24 다)이고, 씨앗의 ci-lower-skill 이 +1 을 만든다. 대조를 씨앗에 맞춰 늘리지 않는다 —
# 그 파일은 유호님이 운영 DB 를 재는 창이라, 늘리면 운영의 「진짜 31」을 못 잡는다.
assert_lower_survived c3
"${PSQL[@]}" -c "delete from engine.skills where skill_id='ci-lower-skill'" >/dev/null
assert_postcheck 'c3 부트스트랩'

echo '⑥ 정확한 c4 → c6 ALTER + 기존 데이터 보존'
drop_synk
run_file "$C3"
run_file "$C4_DELTA"
seed_lower c4
run_file "$BUNDLE"
assert_lower_survived c4
"${PSQL[@]}" -c "delete from engine.skills where skill_id='ci-lower-skill'" >/dev/null   # c3 갈래와 같은 사유
assert_postcheck 'c4 부트스트랩'

echo '부트스트랩 중단 — 부분 상태'
drop_synk
"${PSQL[@]}" -c 'create schema engine; create table engine.learners(id integer primary key)' >/dev/null
expect_file_failure "$BUNDLE" '부분 상태'
[[ "$(scalar "select to_regclass('engine.learners') is not null")" == 't' ]] || fail '부분 상태 원본을 건드렸다'
[[ "$(scalar "select to_regclass('engine.schema_migrations') is null")" == 't' ]] || fail '부분 상태에 이력을 남겼다'

echo '부트스트랩 중단 — c3/c4 혼합 상태'
drop_synk
run_file "$C3"
"${PSQL[@]}" -c \
  'alter table engine.learning_events rename constraint learning_events_event_type_c3 to learning_events_event_type_c4' >/dev/null
expect_file_failure "$BUNDLE" '혼합 상태'
[[ "$(scalar "select to_regclass('engine.schema_migrations') is null")" == 't' ]] || fail '혼합 상태에 이력을 남겼다'

echo '부트스트랩 중단 — 이력 없는 현행 c6 전용 갈래 없음'
drop_synk
run_file "$BUNDLE"
"${PSQL[@]}" -c "delete from engine.schema_migrations where version='$BASE_VERSION'" >/dev/null
expect_file_failure "$BUNDLE" '이력 없는 현행판'
# 기준선 조각이 중단됐으니 **그 이력이 다시 생기면 안 된다**.
# 전체 개수로 세면 안 된다 — 체인이 둘 이상이면 뒤 조각의 행은 그대로 남는다(c7에서 실측).
[[ "$(scalar "select count(*) from engine.schema_migrations where version='$BASE_VERSION'")" == '0' ]] \
  || fail '금지 갈래가 이력을 만들었다'

echo '④ Supabase reset이 빈 DB를 복원'
supabase db reset --local >/dev/null
bootstrap_local_ci
run_file "$BUNDLE"
assert_postcheck 'db reset'

echo '⑤ 실제 Auth 사용자 2명 + JWT sub로 RLS·쓰기 차단·권한 0'
user1_json="$(curl -fsS -X POST "$SUPABASE_LOCAL_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ci-one@synk.invalid","password":"CI-Test-Password-1!","email_confirm":true}')"
user2_json="$(curl -fsS -X POST "$SUPABASE_LOCAL_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ci-two@synk.invalid","password":"CI-Test-Password-2!","email_confirm":true}')"
uid1="$(jq -er '.id' <<<"$user1_json")"
uid2="$(jq -er '.id' <<<"$user2_json")"
token1="$(curl -fsS -X POST "$SUPABASE_LOCAL_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"ci-one@synk.invalid","password":"CI-Test-Password-1!"}' | jq -er '.access_token')"
token2="$(curl -fsS -X POST "$SUPABASE_LOCAL_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"ci-two@synk.invalid","password":"CI-Test-Password-2!"}' | jq -er '.access_token')"
jwt_sub() {
  node -e 'const p=process.argv[1].split(".")[1]; console.log(JSON.parse(Buffer.from(p,"base64url")).sub)' "$1"
}
[[ "$(jwt_sub "$token1")" == "$uid1" ]] || fail '사용자1 JWT sub 불일치'
[[ "$(jwt_sub "$token2")" == "$uid2" ]] || fail '사용자2 JWT sub 불일치'

"${PSQL[@]}" -v uid1="$uid1" -v uid2="$uid2" <<'SQL' >/dev/null
insert into engine.learners(learner_id, auth_user_id, student_code, schema_ver)
values
  ('20000000-0000-4000-8000-000000000001', :'uid1', 'CI-AUTH-1', 'c6'),
  ('20000000-0000-4000-8000-000000000002', :'uid2', 'CI-AUTH-2', 'c6');
insert into engine.consents(
  consent_id, learner_id, consent_ver, agreed_at, schema_ver, recorded_by
) values
  ('20000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000001',
   'v1', now(), 'c6', 'tools/검증_마이그레이션.sh'),
  ('20000000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-000000000002',
   'v1', now(), 'c6', 'tools/검증_마이그레이션.sh');
insert into engine.learning_events(
  event_id, learner_id, event_type, occurred_at, idempotency_key, consent_ver, consent_id, schema_ver
) values
  ('20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000001',
   'preference.stated', now(), 'ci-auth-1', 'v1', '20000000-0000-4000-8000-000000000401', 'c6'),
  ('20000000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-000000000002',
   'preference.stated', now(), 'ci-auth-2', 'v1', '20000000-0000-4000-8000-000000000402', 'c6');
SQL

"${PSQL[@]}" -v uid1="$uid1" <<'SQL' >/dev/null
begin;
grant usage on schema engine to authenticated;
grant select on engine.learners, engine.learning_events to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'uid1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $rls$
begin
  if (select count(*) from engine.learners) <> 1 then
    raise exception '자기 learner 1행이 아니다';
  end if;
  if (select count(*) from engine.learners where student_code='CI-AUTH-2') <> 0 then
    raise exception '타 learner가 보인다';
  end if;
  if (select count(*) from engine.learning_events) <> 1 then
    raise exception '자기 event 1행이 아니다';
  end if;
  if (select count(*) from engine.learning_events where idempotency_key='ci-auth-2') <> 0 then
    raise exception '타 event가 보인다';
  end if;
end
$rls$;
reset role;
rollback;
SQL

# ── 세션 폐기(L0 §4-2 ③ · §4-5 ③) — `revoked_before` 가 옛 토큰을 실제로 죽이는가 ──────
# 🔴 여기가 없으면 CI 는 폐기에 눈이 하나도 없다. `session_alive()` 를 통째로 `select true` 로
#    바꿔도 위 검사들은 전부 초록이다 — 「보인다」만 재고 「안 보여야 할 때」를 안 재기 때문이다.
# ⚠ 위 검사들과 달리 `iat` 를 **주장에 넣는다**. 실제 Supabase 토큰엔 항상 있고, 폐기 판정은
#    그때만 그 값을 본다(없으면 폐기된 계정이 fail-closed 로 막힌다 — 그것도 아래에서 잰다).
"${PSQL[@]}" -v uid1="$uid1" <<'SQL' >/dev/null
begin;
grant usage on schema engine to authenticated;
grant select on engine.learners to authenticated;
update engine.learners set revoked_before = now() + interval '1 hour'
 where auth_user_id = :'uid1';
select set_config('request.jwt.claims',
  json_build_object('sub', :'uid1', 'role', 'authenticated',
                    'iat', extract(epoch from now())::bigint)::text, true);
set local role authenticated;
do $rls$
begin
  if (select count(*) from engine.learners) <> 0 then
    raise exception '폐기 뒤에도 옛 토큰이 자기 행을 본다 — revoked_before 가 안 먹는다';
  end if;
end
$rls$;
reset role;

-- 폐기된 계정 + `iat` 를 못 읽는 주장 = **막히는 쪽**이어야 한다(fail-closed).
select set_config('request.jwt.claims',
  json_build_object('sub', :'uid1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $rls$
begin
  if (select count(*) from engine.learners) <> 0 then
    raise exception '폐기된 계정이 iat 없는 주장으로 통과했다 — 모르면 막아야 한다';
  end if;
end
$rls$;
reset role;

-- 되돌리면 다시 보여야 한다 — 「전부 잠갔다」로 초록이 나는 것을 막는 반대편 눈이다.
update engine.learners set revoked_before = null where auth_user_id = :'uid1';
select set_config('request.jwt.claims',
  json_build_object('sub', :'uid1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $rls$
begin
  if (select count(*) from engine.learners) <> 1 then
    raise exception '폐기를 풀었는데 자기 행이 안 보인다 — 폐기 판정이 너무 넓다';
  end if;
end
$rls$;
reset role;
rollback;
SQL

if "${PSQL[@]}" -v uid1="$uid1" >"$TMP/write-denied.log" 2>&1 <<'SQL'
begin;
grant usage on schema engine to authenticated;
grant insert on engine.learning_events to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'uid1', 'role', 'authenticated')::text, true);
set local role authenticated;
/* 🔴 `consent_id` 를 **채워서** 넣는다. 이 블록이 재는 것은 「RLS 가 막는가」 하나뿐인데,
 *   열을 비워 두면 NOT NULL 이 조여지는 날 INSERT 가 **다른 이유로** 실패하고 이 검사는
 *   그대로 초록이 된다 — RLS 가 통째로 열려 있어도 못 잡는 거짓 초록이다(08-10 발견 ·
 *   전층감사 묶음 ①-3 목록에 없던 자리). 실패 사유가 하나만 남아야 검사가 뜻을 갖는다. */
insert into engine.learning_events(
  learner_id, event_type, occurred_at, idempotency_key, consent_ver, consent_id, schema_ver
) values (
  '20000000-0000-4000-8000-000000000001', 'preference.stated', now(),
  'ci-write-must-fail', 'v1', '20000000-0000-4000-8000-000000000401', 'c6'
);
rollback;
SQL
then
  fail 'authenticated 쓰기가 RLS를 통과했다'
fi

[[ "$(scalar "with roles(r) as (values ('anon'),('authenticated')),
  tabs(t) as (select tablename from pg_tables where schemaname='engine'),
  privileges(p) as (
    values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
  )
  select count(*) from roles cross join tabs cross join privileges
   where has_table_privilege(r, format('%I.%I','engine',t), p)")" == '0' ]] \
  || fail 'anon/authenticated에 engine 테이블 권한이 남았다'
[[ "$(scalar "select count(*) from (values ('anon'),('authenticated')) r(name)
  where has_schema_privilege(name,'engine','USAGE')")" == '0' ]] \
  || fail 'anon/authenticated에 engine schema USAGE가 남았다'
assert_postcheck 'RLS 실측 뒤'

echo 'Supabase 실행층 ①~⑥ 전부 통과'
