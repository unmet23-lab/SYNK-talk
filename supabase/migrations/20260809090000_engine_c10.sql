/* 검수 확정이 담길 물리 칸 넷 — 재검수 계보·승격 의사·판정 시점 전사·폐기 사유
 *
 * 🔴 **파일 이름의 `_c10` 은 장식이 아니다.** Edge Function 넷이 계약판을 `schema_migrations` 의
 *   최신 이름 `_c<숫자>.sql` 에서 읽는다(회귀 `tests/마이그레이션이름.test.js`).
 *   판을 올리는 게 아니므로 c10 을 **그대로** 이어 쓴다 — 값목록도 필드 정본도 안 바뀐다.
 *   앱이 보내는 것도 없다(네 칸 전부 **검수자 통로**에서만 쓰인다 · C0 표면 0).
 *
 * ■ 무엇을 막나 (발주_수집파이프라인 §3 · 심문 합집합 2026-08-08)
 *   발주서가 승인·폐기 경로의 계약을 **일부러 비워 뒀다**: *"담을 물리 칸(`supersedes`·승격 의사·
 *   판정 시점 검증 전사·`discard_reason`)이 없어 c11 선행이다. 열 없이 적으면 구현 불가능한
 *   계약이 정본이 된다."* 이 조각이 그 넷을 낸다 — **계약은 c11 이 쓰고, 여기는 자리만 판다.**
 *
 *   ① `supersedes` — 재검수(`Z`)가 teacher 행을 **하나 더** 만들기만 하면 두 판정 중 어느 것이
 *      정본인지 아무 데도 안 적힌다. 서로 다른 라벨이 **둘 다** 개인화·훈련 경로로 흘러간다.
 *      🔑 `reviewed_correction_id` 는 **AI 행**을 가리키는 다른 축이라 이 자리를 못 덮는다.
 *   ② `promotion_intent` — `Shift+Enter`(교정 판정 + 훈련 승격 의사)의 ②가 지금 명세로는
 *      **산출물 저장 뒤에야** 사건이 된다. 그 사이 비식별·저장이 실패하면 **사람이 누른 의사가
 *      증발**하고 다시 물을 방법이 없다(그 항목은 이미 큐에서 나갔다). teacher 행과 **같은 쓰기**에
 *      남아야 뒤따르는 사슬이 그것을 **읽어서** 돈다.
 *      🚫 teacher 행의 **존재**를 승격 의사로 읽는 것은 여전히 금지 — 갈리는 것은 **이 열의 값**이다.
 *   ③ `transcript_at_review` — 검수자가 **무엇을 보고** 판정했는지가 행에 없다. 나중에
 *      `submissions.transcript_verified` 가 고쳐지면 과거 라벨이 조용히 다른 원문에 붙는다.
 *   ④ `discard_reason` — 폐기한 파일은 남기는데 **왜 뺐는지**가 없으면 「강건성 재료」와
 *      「오염 데이터」를 나중에 구별할 수 없다. 남긴 이유가 사라지면 남긴 의미도 사라진다.
 *
 * ■ 왜 지금인가 — 넷 다 **그때만 얻을 수 있는 것**이다
 *   계보·의사·판정 시점 원문·폐기 사유는 전부 **검수하는 그 순간**에만 알 수 있고, 나중에
 *   복원하면 그건 복원이 아니라 날조다(c10 `due_at` 머리말과 같은 판정). 검수자가 한 명이라도
 *   이 칸들 없이 돌면 그 기간의 라벨은 계보 없는 라벨로 영구히 남는다.
 *
 * ■ 범위 — 🚫 **데이터셋 멤버십 표(`dataset_item`·`group_id`)는 이 조각에 없다**
 *   발주서 §3 이 넷째 자리로 그것도 적었지만, **새 표를 만드는 것은 ㉮ 가 미뤄 둔 C 계층
 *   그 자체**다(`엔진도달_설계.md` §6 표 3행 — *"객체 종류를 바꾼다고 결정의 이유를 피해 가지
 *   못한다"*). 위 넷은 **이미 있는 표의 열**이라 그 결정을 안 건드린다. 그리고 멤버십은 소급
 *   불가가 아니다 — 조립 시점에 위 넷을 읽어 계산할 수 있다. 승격 **의사**만 지금 필요하다.
 *   ⚠ 훈련셋⟂평가셋 **묶음 단위 상호배타**는 그래서 아직 물리로 못 박히지 않았다. c11 이
 *   `dataset_item` 을 낼 때 `(dataset_ver, group_id) → 목적` 을 **PK 로** 잡아 위반을 표현
 *   불가능하게 만드는 것이 권고다(트리거로 막으면 꺼질 수 있다).
 *
 * 🔑 `promotion_intent` 만 `not null default false` 다 — 나머지 셋과 갈리는 이유가 있다.
 *   `request_hash`(앞 조각)는 **행에 대한 사실**이라 옛 행에 기본값을 넣으면 「없는 지문이 있는
 *   척」이 된다. 승격 의사는 반대다 — 아무도 누른 적 없으면 그것이 곧 `false` 이고, null 로
 *   두면 승격 사슬이 `null` 을 「모름」으로 읽어 **판단을 미루거나 참으로 접을** 여지가 생긴다.
 *   실패해도 승격이 **안 되는** 쪽으로 기우는 값이 기본값이어야 한다.
 *
 * 🔑 CHECK 를 「폐기인데 사유가 없다」로 걸지 **않는다** — 이 조각 이전에 이미 `discarded` 인
 *   행이 있으면 조각 자체가 안 부어진다(따를 수 없는 처방 · F103). 그 자리는 확인 쿼리의
 *   **카운터**(`폐기사유없는폐기`)가 지고, c10 `마감없는배정` 과 **같은 모양**으로 이 조각이
 *   선 뒤의 행만 센다.
 *
 * 🔑 폐기 사유 **값목록의 정본은 이 CHECK 다** — 계약 JSON 에 넣지 않는다. 그 파일은 두
 *   저장소가 공유하는 **앱·수집층 어휘**이고(`계약/수집_교정_계약.json` 머리), 폐기 사유는
 *   검수자 통로 안에서만 쓰여 앱이 보내지도 받지도 않는다.
 *   ⚠ 산문 사본은 **이미 둘 있다**(`발주_수집파이프라인.md` §3 · `검수_내부계약.md` 표).
 *   지우지 않는다 — 검수자가 읽는 자리라 문서가 여섯 개를 보여 주는 것이 제 일이다. 대신
 *   `tests/폐기사유.test.js` 가 그 둘을 이 CHECK 와 **대조**한다(순서까지). 없앨 수 없는
 *   사본은 기계에 물린다 — 산문만 낡는 자리가 이 저장소에서 이미 두 번 났다(F285).
 *
 * 🔴 **이름을 여기서 못박는다 — `functions/review` 머리말과 두 개가 갈려 있었다**(세션 조율
 *   2026-08-09 · ⑥=`8192260e` · 이 조각=`08deceb4`). 그쪽은 approve·discard 경로를 404 로
 *   두면서 막는 칸을 `promote_intent`·`transcript_verified_at_review` 로 적었다. 물리 정본은
 *   이 파일이고 채택한 이름은 **`promotion_intent`·`transcript_at_review`** 다.
 *   ▸ `promotion_intent` — 스키마의 다른 칸과 같은 명사형(`attempt_count`·`reviewer_confidence`).
 *   ▸ `transcript_at_review` — 🔑 **`_verified_` 를 뺀 것이 판정이다.** 검수자가 판정하는 시점에
 *     화면에 있는 것은 보통 **기계 전사**이고 `transcript_verified` 는 그 판정의 **산출물**이다.
 *     이름에 `verified` 를 넣으면 「사람이 확인한 원문을 보고 판정했다」는 거짓을 행마다 적게 된다.
 *   ⚠ approve·discard 경로를 쓰는 세션은 이 넷을 **이 이름으로** 읽는다.
 *
 * 되돌림: alter table engine.corrections
 *           drop constraint if exists corrections_promotion_intent_c10,
 *           drop constraint if exists corrections_supersedes_not_self_c10,
 *           drop column if exists supersedes,
 *           drop column if exists promotion_intent,
 *           drop column if exists transcript_at_review;
 *        alter table engine.pipeline_jobs
 *           drop constraint if exists pipeline_jobs_discard_reason_c10,
 *           drop column if exists discard_reason;
 *        delete from engine.schema_migrations where version = '20260809090000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260809090000';
  migration_name constant text := '20260809090000_engine_c10.sql';
  expected_checksum constant text := '069f79efa1604a7f15e5c570e001b2318fc8699f320c9e7cd65ec49b1d2bf6b3'; -- migration-checksum
  base_version constant text := '20260809080000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c10 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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
      '이 조각은 기준선 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;

  /* ① 재검수 계보 — 새 teacher 행이 자기가 대신하는 이전 행을 가리킨다.
   *    소비자는 원본당 **최신 미폐기 행 하나만** 읽는다(그 쿼리는 c11 몫). */
  alter table engine.corrections
    add column if not exists supersedes uuid references engine.corrections(correction_id);

  /* ② 승격 의사 — 확정과 같은 쓰기에 남는다(corrections 는 append-only 라 INSERT 시점뿐). */
  alter table engine.corrections
    add column if not exists promotion_intent boolean not null default false;

  /* ③ 판정 시점 검증 전사 — 그 행이 무엇을 보고 판정했나. */
  alter table engine.corrections
    add column if not exists transcript_at_review text;

  /* ④ 폐기 사유 — 닫힌 어휘. pipeline_jobs 는 상태가 도는 표라 UPDATE 로 들어온다. */
  alter table engine.pipeline_jobs
    add column if not exists discard_reason text;

  /* 자기 자신을 대신할 수는 없다. 더 긴 순환(A→B→A)은 CHECK 로 못 막고 소비자 쿼리가 진다. */
  alter table engine.corrections
    add constraint corrections_supersedes_not_self_c10
      check (supersedes is null or supersedes <> correction_id);

  /* 승격 의사는 **사람이 누르는 것**이다 — AI·학생 행에 서면 자동 발행이 이름만 바꿔 성립한다. */
  alter table engine.corrections
    add constraint corrections_promotion_intent_c10
      check (promotion_intent = false or actor_kind = 'teacher');

  /* 사유가 있으면 폐기여야 하고, 값은 닫힌 어휘 안이어야 한다.
   * ⚠ 역방향(폐기인데 사유 없음)은 **일부러 안 건다** — 머리말 참조. */
  alter table engine.pipeline_jobs
    add constraint pipeline_jobs_discard_reason_c10
      check (discard_reason is null
             or (status = 'discarded'
                 and discard_reason in
                   ('무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가')));

  comment on column engine.corrections.supersedes is
    '이 행이 대신하는 이전 teacher 교정(재검수 Z). 소비자는 원본당 최신 미폐기 행 하나만 읽는다. reviewed_correction_id(AI 행 지목)와 다른 축.';
  comment on column engine.corrections.promotion_intent is
    '검수 확정에서 사람이 훈련 승격을 함께 눌렀나(Shift+Enter). 확정과 같은 쓰기에 남아 사슬이 읽어 돈다. teacher 행의 존재가 아니라 이 값이 승격 의사다.';
  comment on column engine.corrections.transcript_at_review is
    '이 행이 판정한 시점의 검증 전사. 뒤에 submissions.transcript_verified 가 바뀌어도 그때의 원문이 남는다.';
  comment on column engine.pipeline_jobs.discard_reason is
    '폐기 사유(닫힌 어휘 — 정본은 CHECK pipeline_jobs_discard_reason_c10). 문서 두 곳의 나열은 tests/폐기사유.test.js 가 이 CHECK 와 대조한다.';

  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration$;

commit;

-- 확인 (한 번에) — 아래 블록은 실행되지 않는 사후 확인 쿼리의 정본 사본이다.
-- 실제 확인은 합본 밖 supabase/확인_적용후상태.sql을 별도 실행한다.
-- ============================================================================
/*
with 기대열(t, c) as (values
  ('learning_events','goal_snapshot'),
  ('learning_events', 'request_hash'), ('learning_events','skill_taxonomy_ver'),
  ('learning_events','parent_event_id'), ('learning_events','turn_no'),
  ('learning_events','correction_id'),
  ('learning_events','consent_id'),
  -- 동의 출처(20260807140000)
  ('consents','recorded_by'),
  -- 추정메타 물리 칸(20260807170000 · 절단문서 ①-7)
  ('learning_events','source_kind'), ('learning_events','estimator_confidence'),
  ('learning_events','estimator_version'), ('learning_events','evidence_refs'),
  ('submissions','capture_meta'), ('skills','superseded_by'), ('daily_activity','expected'),
  -- 마감 시각·마감 판본(20260808010000 · 소급 불가 · 유호님 승인 2026-08-08)
  ('submissions','due_at'), ('submissions','due_ver'),
  -- 검수 확정이 담길 칸 넷(20260809090000 · 소급 불가 · 발주 §3 「c11 선행」)
  ('corrections','supersedes'), ('corrections','promotion_intent'),
  ('corrections','transcript_at_review'), ('pipeline_jobs','discard_reason'),
  ('schema_migrations','version'), ('schema_migrations','name'),
  ('schema_migrations','checksum'), ('schema_migrations','applied_at'),
  -- ⚠ 아래 세 묶음은 c7 **뒤에 붙은 조각들**이 낸 열이다. 이 확인 블록은 앞 조각에서
  --   베끼는 것이 아니라 **바로 앞 조각**에서 이어야 한다 — c8 초안이 20260806210000 의
  --   블록을 베껴 이 13열을 통째로 떨어뜨렸고, 그 상태의 확인은 「빠진열 없음」으로 초록이
  --   나온다(검사가 사라진 것이 통과와 같은 모양이 되는 자리 · 생성기 diff 가 잡았다).
  -- 학생 로그인(L0 §4-1·§4-2 · 20260806233000_auth_c7)
  ('learners','recovery_email'), ('learners','recovery_phone'),
  ('learners','temp_password_expires_at'), ('learners','signup_attempts'),
  -- 직원 인증·세션 폐기(L0 §4-5·§4-2 ③ · 20260806234000_staff_c7)
  ('learners','active'), ('learners','revoked_before'),
  ('staff','role'), ('staff','staff_id'), ('staff','active'), ('staff','revoked_before'),
  ('staff_access_log','action'), ('staff_access_log','target_ids'),
  -- 임시번호를 해시로 든다(L0 §4-2-2 · 20260807024500_temp_password_c7)
  ('learners','temp_password_hash')
), 기대제약(n) as (values
  ('learning_events_event_type_c10'), ('learning_events_task_type_c10'),
  ('submissions_task_format_c10'), ('submissions_translation_source_c10'),
  ('submissions_due_paired_c10'), ('corrections_verdict_c10'),
  ('learning_events_retry_same_learner'), ('learning_events_parent_same_learner'),
  ('corrections_reviewed_same_submission'), ('schema_migrations_pkey'),
  ('learners_signup_attempts_nonneg_c10'), ('staff_role_c10'),
  ('learners_temp_password_paired_c10'),
  ('learning_events_correction_target_c10'), ('learning_events_correction_id_fkey'),
  -- 동의 귀속(20260807120000)
  ('learning_events_consent_id_fkey'),
  -- 검수 확정 칸 넷(20260809090000) — FK 도 함께 센다(열만 서고 고리가 없으면 계보가 거짓이다)
  ('corrections_supersedes_not_self_c10'), ('corrections_promotion_intent_c10'),
  ('corrections_supersedes_fkey'), ('pipeline_jobs_discard_reason_c10')
), 기대트리거(n) as (values
  ('learning_events_immutable'), ('corrections_immutable'), ('submissions_original_immutable'),
  ('staff_access_log_immutable'), ('learning_events_correction_same_learner'),
  -- 수집→처리 배선 + 동의 증거 보호(20260807120000)
  ('submissions_enqueue_job'), ('consents_protect')
), 대상역할(r) as (values ('anon'), ('authenticated'))
, 대상권한(p) as (values
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
, 대상테이블(t) as (
  -- ⚠ 뷰는 pg_tables 에 없다. engine 첫 뷰(review_queue · 20260807190000)가 서면서 합쳤다 —
  --    안 합치면 뷰에 grant 가 붙어도 「새는테이블권한=0」이 그대로 초록이다.
  select tablename from pg_tables where schemaname='engine'
  union all
  select viewname from pg_views where schemaname='engine'
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
), 트리거상태 as (
  -- 🔴 존재만 묻지 않는다. 꺼진 트리거는 pg_trigger 에 **행이 그대로 남고** tgenabled 만
  --    'D'(꺼짐)·'R'(복제본에서만)이 된다 — 2026-08-07 리허설 실측: 트리거를 끈 채로 이
  --    쿼리가 「✅ 전부 통과」를 냈다. 안 잰 것을 통과로 내면 그건 확인이 아니다.
  select e.n,
         (select g.tgenabled from pg_trigger g
            join pg_class r on r.oid=g.tgrelid
           where r.relnamespace=to_regnamespace('engine') and g.tgname=e.n) as 상태
    from 기대트리거 e
), 빠진트리거 as (
  -- 상태를 이름 옆에 붙인다 — 「없음」은 판을 부어야 하고 「꺼짐」은 enable 한 줄이라 처방이 갈린다.
  -- ⚠ `상태::text` 캐스트가 필수다. tgenabled 는 `"char"`(1바이트) 타입이라 `||` 후보가 갈려
  --    `operator is not unique` 로 **쿼리 전체가 안 돈다** — 파일 층 검사는 이걸 못 본다(2026-08-07 실측).
  select string_agg(n || case when 상태 is null then '' else ' (꺼짐:' || 상태::text || ')' end,
                    ', ' order by n) v
    from 트리거상태 where 상태 is null or 상태 not in ('O', 'A')
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
    where schemaname='engine' and tablename='schema_migrations') as 이력정책,
  -- 검수자 판(20260807190000 · 절단문서 ②-17): 뷰가 있고 옛 정책이 없어야 **둘 다** 맞다.
  --   뷰만 세고 정책을 안 세면 「옛 통로가 남았다」가 통과로 보인다.
  (select count(*) from pg_views
    where schemaname='engine' and viewname='review_queue') as 검수뷰,
  (select count(*) from pg_policies
    where schemaname='engine' and policyname='inspector_queue_submissions') as 옛검수정책,
  -- 수집→처리 배선(20260807120000): 제출이 있는데 job 이 없으면 고아다 — 0이어야 한다.
  (select count(*) from engine.submissions s
    where not exists (select 1 from engine.pipeline_jobs j
                       where j.submission_id = s.submission_id)) as 잡없는제출,
  -- 마감(20260808010000): 열만 서고 **아무도 안 채우는** 상태가 이 저장소에서 네 번째다
  --   (`daily_activity.expected`·`model`·`prompt_ver` 가 그렇게 서 있다). 배정에 마감이
  --   없으면 「마감 대비 여유」가 그 학생에게 영영 없다 — 조용히 빈칸으로 남지 않게 센다.
  --   ⚠ **c10 이 선 뒤에 만들어진 배정만** 센다. 옛 행의 마감은 아무도 모르고, 지어내
  --      채우는 것은 복원이 아니라 날조다(머리말 ⛔).
  (select count(*) from engine.submissions s
     join engine.learning_events e on e.event_id = s.event_id
    where e.event_type = 'task.assigned' and s.due_at is null
      and s.occurred_at >= (select applied_at from engine.schema_migrations
                             where version = '20260808010000')) as 마감없는배정,
  -- 분모의 정본은 `task.assigned` 사건 하나다(머리말). `daily_activity.expected` 는 파생
  --   캐시 자리로 남겨 뒀고, 여기 값이 들어오면 분모가 둘이 된 것이다 — 그 순간 빨개진다.
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염,
  -- 폐기 사유(20260809090000): CHECK 는 「사유가 있으면 폐기」만 걸고 역방향은 일부러 안 건다
  --   (조각 이전 행이 있으면 부어지지 않는다 · F103). 그 자리를 이 카운터가 진다 —
  --   **이 조각이 선 뒤에 갱신된 job 만** 센다. 옛 폐기의 사유는 아무도 모른다.
  (select count(*) from engine.pipeline_jobs j
    where j.status = 'discarded' and j.discard_reason is null
      and j.updated_at >= (select applied_at from engine.schema_migrations
                            where version = '20260809090000')) as 폐기사유없는폐기,
  -- 검수 판이 **올라간 판인지**(20260809050000): `검수뷰=1` 은 뷰의 존재만 말한다.
  --   c8 의 12열 판이 그대로 서 있어도 그 칸은 1이라 초록이다 — 열 수로 재야 갈린다.
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue') as 검수판열,
  -- ②-17 이 지목한 세 열이 판에 실렸나 — 0이어야 한다(L0 §4-5 ②-1 「안 연다」의 실측).
  (select count(*) from information_schema.columns
    where table_schema='engine' and table_name='review_queue'
      and column_name in ('body_original','task_snapshot','redaction_result')) as 검수판원문
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and 마감없는배정=0 and 분모칸오염=0 and 폐기사유없는폐기=0
             and 검수판열=22 and 검수판원문=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260809090000'
              and (select checksum from 현재이력)='069f79efa1604a7f15e5c570e001b2318fc8699f320c9e7cd65ec49b1d2bf6b3' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·0·0·22·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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

-- 확인
-- ① 검수판열=22 · 검수판원문=0 — 앞 조각과 같다(이 조각은 review 판을 안 건드린다).
--    🔑 이 조각이 더하는 것은 열 넷 + CHECK 셋 + FK 하나이고, 그 검사는 위 확인 쿼리의
--    `기대열`·`기대제약`(=`빠진열`·`빠진제약`)이 진다 — 판정 숫자를 손으로 늘리지 않았다.
-- ② 🔴 **`기대:` 숫자가 앞 조각에서 한 칸 모자랐다** — 조건이 15개인데 숫자가 14개였다
--    (`분모칸오염` 이 빠져 있었다). 내 것까지 더해 **16개로 맞췄다**. 판정 로직은 한 글자도
--    안 바꿨다 — 바뀐 것은 ❌ 문구의 숫자 나열뿐이다.
--    ⚠ 이름을 붙여 읽기 쉽게 하려다 되돌렸다: `tests/L0스키마.test.js:163` 이 그 문구를
--      `기대: (\d+)·(\d+)·` 로 **기계 대조**한다(앞 둘 = 테이블 수). 라벨을 넣으면 그 눈이 먼다.
--      그래서 칸 이름은 문구가 아니라 여기 적는다 — 위 판정 CASE 와 **같은 순서**다:
--      테이블수 · RLS켜짐 · 정책수 · 새는테이블권한 · 새는스키마권한 · 삭제차단 · 실패상태
--      · 이력정책 · 잡없는제출 · 검수뷰 · 옛검수정책 · 마감없는배정 · 분모칸오염
--      · 폐기사유없는폐기 · 검수판열 · 검수판원문
-- ③ 폐기 사유 어휘 실측 — 부은 뒤 한 줄로 (닫힌 어휘 6개가 그대로 보여야 한다):
--      select pg_get_constraintdef(oid) from pg_constraint
--       where conname = 'pipeline_jobs_discard_reason_c10';
--    🔑 값의 정본은 **이 CHECK 정의**다. 산문 사본 둘(발주서 §3 · 검수_내부계약 표)은
--      `tests/폐기사유.test.js` 가 이 정의와 순서까지 대조한다(변이 2/2).
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 c10 접미를 그대로 쓰고 셋을 더한다).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_promotion_intent_c10 · corrections_supersedes_not_self_c10
--         · corrections_verdict_c10 · learners_signup_attempts_nonneg_c10
--         · learners_temp_password_paired_c10 · learning_events_correction_target_c10
--         · learning_events_event_type_c10 · learning_events_task_type_c10
--         · pipeline_jobs_discard_reason_c10 · staff_role_c10
--         · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
-- ⑤ 승격 의사 기본값 실측 — 부은 뒤 (0 이어야 한다 · 옛 행이 조용히 참이 되지 않았나):
--      select count(*) from engine.corrections where promotion_intent;
-- ⑥ 🔴 **이 조각은 자리만 판다 — 채우는 코드는 0줄이다.** 넷 다 검수 Edge Function(c11)이
--    서야 값이 들어온다. `daily_activity.expected`·`model`·`prompt_ver` 가 그렇게 열만 선
--    채로 남아 있고, 이 넷이 같은 길로 가는지는 `폐기사유없는폐기`·⑤ 가 아니라 **c11 착수
--    여부**가 답한다. 열이 섰다는 것을 「배선이 섰다」로 읽지 않는다(엔진도달 §5 의 경계).
