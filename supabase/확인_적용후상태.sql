-- ============================================================================
-- 적용 후 확인 — 기준선(L0_스키마.sql)이 제대로 섰는지 한 줄로 판정한다.
-- 발주_기준선마이그레이션.md §5 표: 사후 확인은 **합본 밖**이다(⑤ 철회 조항).
--
-- 정본 = supabase/L0_스키마.sql 꼬리의 「확인 (한 번에)」 주석 블록.
--   저 블록은 /* */ 안에 있어 본체를 Run 해도 안 돈다 — 그래서 이 파일이 따로 있다.
--   🔴 아래 본문은 그 블록의 **글자 그대로의 사본**이다. 손으로 고치지 않는다 —
--      스키마 꼬리를 고치고 이 파일에 복사한다. 두 곳이 갈라지면
--      `tests/L0스키마.test.js` 의 「사후 확인 쿼리 = 스키마 꼬리 사본」이 깨진다.
--
-- 기대: `판정` 칸이 `✅ 전부 통과` 면 끝. **숫자는 여기 적지 않는다** — 요약본에 복사된
--       기대값은 다음 계약 개정 때 정상 적용을 ❌ 로 보이게 한다(정본은 스키마 꼬리 하나).
-- 읽기 전용 — 상태를 바꾸지 않는다.
-- ============================================================================

with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected')
), 기대제약(n) as (values
  ('learning_events_event_type_c6'), ('learning_events_task_type_c6'),
  ('submissions_task_format_c6'), ('corrections_verdict_c6'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable')
), 빠진열 as (
  select string_agg(t||'.'||c, ', ') v from 기대열 e
   where not exists (select 1 from information_schema.columns
                      where table_schema='engine' and table_name=e.t and column_name=e.c)
), 빠진제약 as (
  select string_agg(n, ', ') v from 기대제약 e
   where not exists (select 1 from pg_constraint
                      where connamespace='engine'::regnamespace and conname=e.n)
), 빠진트리거 as (
  select string_agg(n, ', ') v from 기대트리거 e
   where not exists (select 1 from pg_trigger g join pg_class r on r.oid=g.tgrelid
                      where r.relnamespace='engine'::regnamespace and g.tgname=e.n)
), 셈 as (select
  (select count(*) from pg_tables  where schemaname='engine')                    as 테이블수,
  (select count(*) from pg_tables  where schemaname='engine' and rowsecurity)    as RLS켜짐,
  (select count(*) from pg_policies where schemaname='engine')                   as 정책수,
  (select count(*) from information_schema.role_table_grants
     where table_schema='engine' and grantee in ('anon','authenticated'))        as 새는권한,
  -- learners 를 참조하는 FK가 전부 restrict 여야 한다(c6). cascade 가 남아 있으면 이 수가 준다.
  (select count(*) from pg_constraint
     where connamespace='engine'::regnamespace and contype='f'
       and confrelid='engine.learners'::regclass and confdeltype='r')            as 삭제차단,
  (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
     where t.typname='job_status' and e.enumlabel='failed')                      as 실패상태
)
select case when 테이블수=8 and RLS켜짐=8 and 정책수=5 and 새는권한=0
             and 삭제차단=3 and 실패상태=1
             and (select v from 빠진열)   is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 8·8·5·0·3·1 · 빠진 칸은 전부 비어 있어야 합니다)'
       end as 판정,
       (select v from 빠진열)     as 빠진열,
       (select v from 빠진제약)   as 빠진제약,
       (select v from 빠진트리거) as 빠진트리거,
       *
from 셈;
