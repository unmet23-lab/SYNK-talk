-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/발주_수집파이프라인.md §3 · docs/L0_데이터계약.md §4-5 ②-1
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c10 — 이 조각은 계약을 안 바꾼다.
--   **새 열 0 · 새 표 0 · 새 사건 0 · 새 값목록 0.** 바꾸는 것은 `engine.review_queue`
--   판 하나다.)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- ■ 무엇을 닫나 — **현행 판으로는 검수 화면을 못 그린다** (발주 §3 ⛔ 착수 1순위)
--   `20260807190000_review_c8` 이 「검수자가 무엇을 읽는가」를 정책에서 판으로 옮겼다.
--   그런데 그 12열은 **제출물 쪽만** 담았다 — 검수자가 실제로 판정하는 대상인 **AI 교정**
--   (`corrected_text`·`error_tags`·`explanation`·`model`/`prompt_ver`)이 판에 없다.
--   즉 「읽는 곳은 `engine.review_queue` 하나다」(§3)와 화면 명세가 **동시에 성립하지 않는
--   상태**였다. 이 자리를 원표 직접 읽기로 도망가면 그 순간 ②-17 의 전제가 통째로 깨지고
--   `body_original`·`task_snapshot`·`redaction_result` 가 같이 나간다 — 그래서 **판을 올린다.**
--
-- ■ 더하는 것 넷 (전부 이미 있는 표에서 온다)
--   ① **AI 교정 6열** — `ai_correction_id`·`ai_corrected_text`·`ai_error_tags`·
--      `ai_explanation`·`ai_model`·`ai_prompt_ver`. 접두 `ai_` 는 장식이 아니다: 승인이
--      만드는 teacher 행과 **이름이 겹치면** 화면이 자기가 무엇을 프리필했는지 잃는다.
--   ② **과제 맥락 2열** — 맥락 없는 라벨은 무효다(§3 🔑). 같은 발화도 「이 문장을 따라
--      읽어라」와 「이 질문에 답해라」에서 정답이 갈린다. ⚠ **`task_snapshot` 전문을 열지
--      않는다** — 계약이 그 안에 **정답**을 두기로 했고(L0 §3-3 「질문·보기·정답·지시문」),
--      전문을 열면 검수자에게 정답이 같이 간다. 필요한 **키만 투영**한다.
--   ③ **`is_audit_sample`** — 큐 순서의 첫 축(§3 「감사 표본 우선 혼입」). 화면이 정렬하려면
--      값이 판에 있어야 한다. 🔴 **`order by` 는 뷰에 넣지 않는다** — 순서는 읽는 쪽의
--      판단이고, 뷰에 박으면 페이지네이션이 그 위에 또 정렬을 얹는다.
--   ④ **`event_id`** — c8 이 **빼기로 했던 열**이다. 그 판정을 여기서 뒤집는다(아래).
--
-- ■ 🔴 뒤집는 판정 하나 — `event_id` 를 연다
--   c8 의 사유는 「학생 사건 줄 전체로 가는 지렛대 — 화면은 `submission_id` 로 돈다」였다.
--   화면만 보면 그 말이 맞다. 틀린 것은 **그 판을 읽는 자가 화면만이 아니라는 것**이다:
--   승격 사슬의 멱등키는 **원본 `event_id` 하나**이고(§3 · 「(event_id, 목적)」 기각분),
--   승인 Edge Function 은 그 값을 어딘가에서 얻어야 한다. 판에 없으면 **직원 통로가
--   `engine.submissions` 원표를 직접 연다** — `tests/검수큐.test.js` ⑤ 가 정확히 그것을
--   막으려고 서 있고, 그 통로가 한 번 열리면 옆 칸(`body_original`·`redaction_result`)은
--   같은 쿼리 한 줄 거리다. **지렛대를 판 안에 두는 쪽이 원표를 여는 쪽보다 좁다.**
--   ⚠ 정직하게 남기는 한계: 이 판은 「Edge Function 이 브라우저로 무엇을 내보내는가」를
--     못 막는다. `event_id` 는 화면에 그릴 값이 아니라 **서버가 승격에 쓰는 값**이고,
--     그 경계는 Edge Function 이 서는 날 그 자리에서 검사가 붙는다(오늘 Fn 은 0개다).
--
-- ■ 과제 맥락은 **실제 생산자의 모양**을 읽고 짰다 (지어낸 키가 아니다)
--   오늘 `task_snapshot` 을 만드는 곳은 `lib/오늘과제.js` 의 `스냅샷()` 하나다:
--     `{ver, 날짜, 호흡: [{차례, 무엇, task_format, 문장, 출처}, {차례, 무엇, task_format, 프롬프트}]}`
--   그래서 투영은 **그 제출물의 `task_format` 과 같은 호흡 한 마디**를 집는다 —
--   `task_instruction`(무엇: 「따라 말하기」/「답하기」) · `task_prompt`(낭독이면 `문장`,
--   자유발화면 `프롬프트`). 🚫 L0 §3-3 표의 `addressee_level`·`target_phonemes` 는 **아직
--   생산자가 0**이라 안 싣는다 — 없는 키를 투영하면 늘 null 인 칸이 둘 늘고, 「비어 있다」와
--   「안 만든다」가 같은 모양이 된다(이 저장소가 `daily_activity.expected` 로 한 번 물린 자리).
--   ⚠ 모양이 바뀌면 두 칸이 null 이 된다 — 증상이 **화면이 빈다**라 그날 사람이 온다.
--     그게 c8 이 고른 실패 방향이고, 이 조각도 같은 방향을 고른다.
--
-- ■ 큐 조건이 **두 곳에 있으면 갈라진다** — `in_review_queue` 호출을 뺐다
--   c8 판은 「AI 교정이 있나」를 `engine.in_review_queue(...)` 로 물었다. 이제 그 AI 행의
--   **열들을 실어야** 하므로 join 이 필요하고, join 이 곧 그 조건이다. 둘을 같이 두면
--   같은 판정이 두 곳에 적힌 것이고 언젠가 갈린다(CLAUDE.md 등록층 맹점 ④).
--   함수 자체는 **지우지 않는다** — 이 조각의 몫이 아니고, `engine` 은 API 에 노출돼 있지
--   않아 닿는 것이 없다(확인 쿼리 `새는스키마권한=0`).
--
-- ■ 폐기한 항목이 큐로 **되돌아오던 자리** (수용기준 17 · luna 실측 지적)
--   c8 판은 「AI 교정 존재 + 오디오 삭제 아님」만 봤다. `pipeline_jobs.status` 를 안 보므로
--   폐기(`discarded`)한 항목이 다음 조회에 그대로 다시 뜬다 — 검수자가 같은 것을 또 만난다.
--   🔑 **차단 목록이 아니라 허용 목록으로 잡는다**(c8 이 열에서 고른 것과 같은 판정):
--     `status = 'ai_processed'` 하나만 큐다. `discarded`·`revoked`·`verified`·`failed`·
--     `pending`·`processing` 이 **한꺼번에** 빠지고, 나중에 상태가 하나 더 생겨도 기본값이
--     「안 나감」이라 증상이 「화면이 빈다」다. 차단 목록이면 새 상태가 조용히 큐에 실린다.
--   ⚠ 그래서 **승인 Edge Function 은 확정과 같은 트랜잭션에서 `status='verified'` 를 써야
--     한다** — 안 쓰면 확정한 항목이 큐에 영원히 남는다. 그 자리는 Fn 이 서는 날이다.
--
-- ■ 스냅샷 하나가 **큐 전체를 죽이지 않게** 한다
--   `jsonb_array_elements` 는 배열이 아닌 값에 **런타임 오류**를 낸다. 앱 판이 올라 `호흡`
--   이 배열이 아닌 행이 하나만 섞여도 큐 조회가 통째로 실패한다 — 한 행의 문제가 화면
--   전체를 끄는 폭발 반경이라 `jsonb_typeof` 로 가른다(아니면 그 행만 맥락 2칸이 null).
--
-- ■ `create or replace` 가 아니라 **drop 후 create** 다
--   Postgres 는 replace 로 **기존 열의 순서·이름·타입을 못 바꾼다**(끝에 붙이는 것만 된다).
--   `event_id` 를 `submission_id` 옆에 두므로 replace 는 애초에 실패한다. 이 뷰에 딸린
--   의존 객체는 0이라(정책은 c8 이 지웠다) drop 이 안전하다.
--   ⚠ 그래서 `tests/검수큐.test.js` 는 **합본의 마지막 정의**를 읽어야 한다 — 첫 정의를
--     읽으면 이 조각이 올린 판을 영원히 못 본다(맹점 ①의 같은 계열). 같은 커밋에서 고쳤다.
--
-- 이 조각은 20260808010000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260809050000';
  migration_name constant text := '20260809050000_review_c10.sql';
  expected_checksum constant text := '05e87c5825f04dd7f65d96e827d24ac1681e9674364fe66b7ee5eaf3a1cd401f'; -- migration-checksum
  base_version constant text := '20260808010000';
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

  -- ── 검수자가 읽는 판 — 화면이 성립하는 최소 집합까지 올린다 (발주 §3 · 절단문서 ②-17)
  --    🔴 역할 판정은 여전히 넣지 않는다. 소비자가 `service_role` 이라 `auth.uid()` 가 null 이고,
  --       `current_staff()` 를 걸면 막는 게 아니라 **정상 호출이 0행**이 된다(화면이 통째로 빈다).
  drop view if exists engine.review_queue;

  create view engine.review_queue as
    select s.submission_id,
           s.event_id,                 -- 승격 멱등키 (머리말 🔴 — c8 판정을 뒤집은 자리)
           s.task_type,
           s.task_format,
           s.occurred_at,
           s.audio_ref,
           s.audio_duration_sec,
           s.transcript,
           s.transcript_verified,
           s.transcript_state,
           s.stt_segments,
           s.stt_confidence,
           s.code_switch_spans,
           과제.무엇 as task_instruction,     -- 「따라 말하기」/「답하기」
           과제.제시 as task_prompt,          -- 낭독이면 그 문장, 자유발화면 그 질문
           ai.correction_id  as ai_correction_id,
           ai.corrected_text as ai_corrected_text,
           ai.error_tags     as ai_error_tags,
           ai.explanation    as ai_explanation,
           ai.model          as ai_model,
           ai.prompt_ver     as ai_prompt_ver,
           j.is_audit_sample
      from engine.submissions s
      join engine.pipeline_jobs j
        on j.submission_id = s.submission_id
      -- 🔑 이 join 이 곧 「큐에 들었나」다(옛 `in_review_queue` 호출을 대신한다 — 머리말).
      --    여러 벌이면 **가장 최근 AI 행**이 화면이 프리필할 것이다.
      join lateral (
             select c.correction_id, c.corrected_text, c.error_tags,
                    c.explanation, c.model, c.prompt_ver
               from engine.corrections c
              where c.submission_id = s.submission_id
                and c.actor_kind = 'ai'
              order by c.created_at desc
              limit 1
           ) ai on true
      -- 과제 맥락 — `task_snapshot` **전문을 열지 않고** 그 제출물의 호흡 한 마디만 집는다.
      left join lateral (
             select 호->>'무엇' as 무엇,
                    coalesce(호->>'문장', 호->>'프롬프트') as 제시
               from jsonb_array_elements(
                      case when jsonb_typeof(s.task_snapshot->'호흡') = 'array'
                           then s.task_snapshot->'호흡'
                           else '[]'::jsonb
                      end) 호
              where 호->>'task_format' = s.task_format
              limit 1
           ) 과제 on true
     where j.status = 'ai_processed'      -- 허용 목록 (머리말 🔑 — 폐기·철회·확정분이 함께 빠진다)
       and s.audio_deleted_at is null;    -- 철회분은 사람에게 다시 보이지 않는다 (음성 축만)

  comment on view engine.review_queue is
    '검수자에게 내보내도 되는 열 — 허용 목록(②-17). 큐 조건 = AI 교정 있음 + status=ai_processed. 역할 판정은 Edge Function 몫.';

  -- 🔴 grant 하지 않는다. `engine` 은 API 에 노출돼 있지 않고, 조회 감사(`staff_access_log`)는
  --    「읽는 지점이 하나뿐」이라는 전제 위에 선다(§4-5 ④). 통로를 하나 더 내면 그 감사가 샌다.

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
  ('learning_events','goal_snapshot'), ('learning_events','skill_taxonomy_ver'),
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
  ('learning_events_consent_id_fkey')
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
             and 마감없는배정=0 and 분모칸오염=0
             and 검수판열=22 and 검수판원문=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260809050000'
              and (select checksum from 현재이력)='05e87c5825f04dd7f65d96e827d24ac1681e9674364fe66b7ee5eaf3a1cd401f' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0·22·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 검수판열=22 · 검수판원문=0 — **둘을 같이 본다.** 앞것만 보면 열 수만 맞고 위험한 열이
--    실린 판도 통과하고, 뒷것만 보면 c8 의 12열 판이 그대로 서 있어도 초록이다.
-- ② 검수뷰=1 · 옛검수정책=0 은 c8 이 세운 그대로 유지된다(이 조각은 정책을 안 건드린다).
-- ③ 판이 실제로 무엇을 내보내는지는 이름으로 본다(파일 층 검사는 `tests/검수큐.test.js`):
--      select column_name from information_schema.columns
--       where table_schema='engine' and table_name='review_queue' order by ordinal_position;
--    ai_ 여섯 · task_instruction · task_prompt · is_audit_sample · event_id 가 있어야 하고
--    body_original · task_snapshot · redaction_result 는 **없어야** 한다.
-- ④ 폐기가 큐에서 실제로 빠지는지(수용기준 17)는 판 파일로 못 잰다 — 리허설 왕복 몫이다:
--      update engine.pipeline_jobs set status='discarded' where submission_id=<한 건>;
--      select count(*) from engine.review_queue where submission_id=<그 건>;  -- 0
-- ⑤ CHECK 제약은 현행 접미사만 남아야 한다(이 조각은 CHECK 를 **한 개도 안 바꾼다** — c10 그대로).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c10 · learners_signup_attempts_nonneg_c10
--         · learners_temp_password_paired_c10 · learning_events_correction_target_c10
--         · learning_events_event_type_c10 · learning_events_task_type_c10
--         · staff_role_c10 · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
