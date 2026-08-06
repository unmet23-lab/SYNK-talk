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
eval "$(supabase status -o env)"
DATABASE_URL="${DB_URL:?supabase status가 DB_URL을 내지 않았다}"
SUPABASE_LOCAL_URL="${API_URL:?supabase status가 API_URL을 내지 않았다}"

case "$DATABASE_URL" in
  postgresql://*@127.0.0.1:*/*|postgresql://*@localhost:*/*) ;;
  *) echo "원격 DB에는 이 검증기를 실행하지 않는다: $DATABASE_URL" >&2; exit 2 ;;
esac

PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)

fail() { echo "검증 실패: $*" >&2; exit 1; }
scalar() { "${PSQL[@]}" -Atc "$1"; }
run_file() { "${PSQL[@]}" -f "$1" >/dev/null; }
drop_engine() { "${PSQL[@]}" -c 'drop schema if exists engine cascade' >/dev/null; }

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
  [[ "$verdict" == '✅ 전부 통과' ]] || fail "$label: 사후 판정=$verdict"
  [[ "$version" == "$LATEST_VERSION" ]] || fail "$label: 현재버전=$version (기대 $LATEST_VERSION)"
  [[ "$checksum" =~ ^[0-9a-f]{64}$ ]] || fail "$label: checksum 형식 오류"
}

fingerprint() { "${PSQL[@]}" -At -f "$1"; }

seed_current() {
  "${PSQL[@]}" <<'SQL' >/dev/null
insert into engine.learners(learner_id, student_code, schema_ver)
values ('00000000-0000-4000-8000-000000000001', 'CI-CURRENT', 'c6');
insert into engine.learning_events(
  event_id, learner_id, event_type, task_type, occurred_at,
  idempotency_key, consent_ver, schema_ver
) values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'submission.created', '숙제제출', now(), 'ci-current-event', 'v1', 'c6'
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
insert into engine.consents(
  consent_id, learner_id, consent_ver, agreed_at, schema_ver
) values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000001', 'v1', now(), 'c6'
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
insert into engine.consents(
  consent_id, learner_id, consent_ver, agreed_at, schema_ver
) values (
  '10000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000001', 'v1', now(), '${label}'
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
drop_engine
awk '{print} /SYNK_MIGRATION_FAILURE_INJECTION_POINT/ {print "  raise exception '\''CI injected failure'\'';"}' \
  "$BUNDLE" >"$TMP/fail-before-commit.sql"
expect_file_failure "$TMP/fail-before-commit.sql" '중간 실패'
[[ "$(scalar "select to_regnamespace('engine') is null")" == 't' ]] || fail '중간 실패 뒤 engine 반쪽 상태가 남았다'
run_file "$BUNDLE"
assert_postcheck '중간 실패 복구'

echo '④ 롤백 경로 실측 + 다시 세우기'
drop_engine
[[ "$(scalar "select to_regnamespace('engine') is null")" == 't' ]] || fail 'drop schema 롤백 경로가 작동하지 않았다'
run_file "$BUNDLE"
assert_postcheck '롤백 뒤 재적용'

echo '⑥ 정확한 c3 → c6 ALTER + 기존 데이터 보존'
drop_engine
run_file "$C3"
seed_lower c3
run_file "$BUNDLE"
assert_postcheck 'c3 부트스트랩'
assert_lower_survived c3

echo '⑥ 정확한 c4 → c6 ALTER + 기존 데이터 보존'
drop_engine
run_file "$C3"
run_file "$C4_DELTA"
seed_lower c4
run_file "$BUNDLE"
assert_postcheck 'c4 부트스트랩'
assert_lower_survived c4

echo '부트스트랩 중단 — 부분 상태'
drop_engine
"${PSQL[@]}" -c 'create schema engine; create table engine.learners(id integer primary key)' >/dev/null
expect_file_failure "$BUNDLE" '부분 상태'
[[ "$(scalar "select to_regclass('engine.learners') is not null")" == 't' ]] || fail '부분 상태 원본을 건드렸다'
[[ "$(scalar "select to_regclass('engine.schema_migrations') is null")" == 't' ]] || fail '부분 상태에 이력을 남겼다'

echo '부트스트랩 중단 — c3/c4 혼합 상태'
drop_engine
run_file "$C3"
"${PSQL[@]}" -c \
  'alter table engine.learning_events rename constraint learning_events_event_type_c3 to learning_events_event_type_c4' >/dev/null
expect_file_failure "$BUNDLE" '혼합 상태'
[[ "$(scalar "select to_regclass('engine.schema_migrations') is null")" == 't' ]] || fail '혼합 상태에 이력을 남겼다'

echo '부트스트랩 중단 — 이력 없는 현행 c6 전용 갈래 없음'
drop_engine
run_file "$BUNDLE"
"${PSQL[@]}" -c "delete from engine.schema_migrations where version='$BASE_VERSION'" >/dev/null
expect_file_failure "$BUNDLE" '이력 없는 현행판'
# 기준선 조각이 중단됐으니 **그 이력이 다시 생기면 안 된다**.
# 전체 개수로 세면 안 된다 — 체인이 둘 이상이면 뒤 조각의 행은 그대로 남는다(c7에서 실측).
[[ "$(scalar "select count(*) from engine.schema_migrations where version='$BASE_VERSION'")" == '0' ]] \
  || fail '금지 갈래가 이력을 만들었다'

echo '④ Supabase reset이 빈 DB를 복원'
supabase db reset --local >/dev/null
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
insert into engine.learning_events(
  event_id, learner_id, event_type, occurred_at, idempotency_key, consent_ver, schema_ver
) values
  ('20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000001',
   'preference.stated', now(), 'ci-auth-1', 'v1', 'c6'),
  ('20000000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-000000000002',
   'preference.stated', now(), 'ci-auth-2', 'v1', 'c6');
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

if "${PSQL[@]}" -v uid1="$uid1" >"$TMP/write-denied.log" 2>&1 <<'SQL'
begin;
grant usage on schema engine to authenticated;
grant insert on engine.learning_events to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'uid1', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into engine.learning_events(
  learner_id, event_type, occurred_at, idempotency_key, consent_ver, schema_ver
) values (
  '20000000-0000-4000-8000-000000000001', 'preference.stated', now(),
  'ci-write-must-fail', 'v1', 'c6'
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
