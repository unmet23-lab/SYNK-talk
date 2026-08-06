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
  expected_checksum constant text := 'ff27f02b65b2685bd8b1cfc2e5f9637219cc4605fb9dda5d0ffa0ab9e93b419e'; -- migration-checksum
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
  -- 🔴 `iat`(토큰 발급 시각)가 없거나 읽히지 않으면 결과는 null이고 정책은 **거부**한다 —
  --   모르는 토큰이 통과하는 쪽으로 기울지 않는다.
  -- ⚠ 이것은 RLS의 방어선이다. **`service_role`은 RLS를 우회하므로** Edge Function은
  --   같은 판정을 자기 손으로 한 번 더 해야 한다(§4-3 ⚠).
  create or replace function engine.session_alive(active boolean, revoked_before timestamptz)
    returns boolean language sql stable security invoker set search_path = engine, public as
  $function$
    select active
       and to_timestamp((auth.jwt()->>'iat')::bigint) >= coalesce(revoked_before, '-infinity')
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
              and (select checksum from 현재이력)='ff27f02b65b2685bd8b1cfc2e5f9637219cc4605fb9dda5d0ffa0ab9e93b419e' -- migration-checksum
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
