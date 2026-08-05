-- ============================================================================
-- SYNK · 기준선 적용 「전」 상태 확인
--
-- 성격: **읽기 전용.** 이 파일은 아무것도 만들지 않고, 고치지 않고, 지우지 않는다.
--       조회문(select) 하나뿐이라 몇 번을 돌려도 DB는 그대로다.
--
-- 왜 있나 — 발주 `docs/발주_기준선마이그레이션.md` §0 은 「빈 개발용 프로젝트」를 전제로 서 있는데,
--   그 전제를 **아무도 확인한 적이 없다.** 비어 있지 않은 DB에 기준선을 부으면
--   `create table if not exists` 가 통째로 건너뛰어 **아무 일도 안 일어나는데 초록으로 보인다.**
--   그 상태는 오류를 안 내므로, 「지금 비었나」는 붓기 전에 이 파일로 재는 수밖에 없다.
--   결과는 발주서 §3-3 기록 6종의 「실행 전 상태」 칸이 된다.
--
-- 쓰는 법 (유호님)
--   1. supabase.com → 프로젝트 → 왼쪽 `SQL Editor` → `New query`
--   2. 이 파일 전문을 복사해 붙여넣고 `Run`
--   3. 결과 표의 **`판정` 칸**만 보시면 됩니다. 그 줄을 그대로 알려주세요.
--
-- ⚠ 이 파일을 Run 하는 화면의 **주소창** 도 함께 알려주십시오
--    (`.../project/여기가문자열/sql` — 어느 프로젝트에 부었는지의 유일한 물증입니다.
--     프로젝트가 둘이 되면 SQL 안에서는 구별되지 않습니다 — 전부 `postgres` 로 보입니다).
-- ⚠ DB 비밀번호·`service_role` 키는 **어떤 형태로도** 알려주지 마십시오. 위 절차는 그것 없이 됩니다.
-- ============================================================================

with 상태 as (
  select
    -- 학습 데이터가 살 스키마. 0 이면 아직 아무것도 안 부은 것이다.
    (select count(*) from information_schema.schemata
      where schema_name = 'engine')                                as engine_스키마,
    (select count(*) from information_schema.tables
      where table_schema = 'engine')                               as engine_테이블,
    -- CHECK 제약 이름은 계약 버전을 달고 있다(_c4). 이미 부었다면 여기서 몇 개가 잡힌다.
    (select count(*) from pg_constraint c
       join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'engine' and c.contype = 'c')              as engine_제약,
    -- engine 밖에 누가 만들어 둔 것이 있는지(다른 용도로 쓰던 프로젝트인지 가른다).
    (select count(*) from information_schema.tables
      where table_schema = 'public')                               as public_테이블,
    -- 이미 학생 계정이 있으면 이 프로젝트는 「빈 개발용」이 아니다.
    (select count(*) from auth.users)                              as 계정
)
select
  상태.*,
  case
    when engine_스키마 = 0 and public_테이블 = 0 and 계정 = 0
      then '✅ 완전히 비어 있음 — 개발용으로 그대로 진행'
    when engine_스키마 = 0
      then '🟡 engine 은 없으나 다른 것이 있음 — 이 표를 그대로 알려주세요 (붓기 전에 무엇인지 봅니다)'
    else '⚠ engine 이 이미 있음 — 아무것도 붙여넣지 마시고 이 표를 그대로 알려주세요'
  end                                                              as 판정
from 상태;
