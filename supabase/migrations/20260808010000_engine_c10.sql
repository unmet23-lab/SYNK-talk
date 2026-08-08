-- ============================================================================
-- 이 파일은 tools/마이그레이션_합본.js가 만드는 SYNK L0 기준선의 조각이다.
-- 정본 문서: docs/L0_데이터계약.md
-- 필드·값목록 정본: 계약/수집_교정_계약.json (c10)
-- 직접 고치지 않는다. 변경은 새 migration 조각으로 만들고 합본 생성기를 실행한다.
--
-- c9 → c10 델타 — 배정이 **언제까지였나**, 그리고 그 마감을 **무슨 규칙이 냈나**.
--   유호님 승인 2026-08-08(㉮ 범위 · appsscript memory `collection-engine-automation-mandate` ⑤).
--   정본 = appsscript `docs/엔진도달_설계.md` §3-2 ①.
--   물리 = `submissions` 열 2 + CHECK 1 + 불변 자물쇠 2칸. **새 표 0 · 새 사건 0.**
--
-- ■ 없으면 무엇을 영영 못 하나
--   습관 축(리듬)의 원신호는 「몇 시에 냈나」가 아니라 **「마감까지 몇 분 남기고 냈나」**다.
--   같은 21시 제출이라도 마감이 22시면 벼락치기고 다음날 정오면 여유다 — 두 학생을 같은
--   행동으로 학습하면 이탈 예측이 통째로 어긋난다. 그런데 c9·L0 어디에도 마감이 없었다.
--   `daily_activity.expected` 는 *「그날 낼 게 있었나」* 만 말하고 *「몇 분 남았나」* 를 못 낸다.
--
-- ■ 왜 지금인가 — 소급 불가
--   마감은 **수업표에서 파생된 값**이다. 수업표가 바뀌면 과거 마감을 다시 계산할 근거가
--   사라지고, 그때 그 학생에게 몇 시가 마감이었는지는 **영원히 복원되지 않는다.**
--   지금은 학생이 0이라 잃는 행이 0이다 — 이 조각은 「새는 것을 막는다」가 아니라
--   **「첫 학생 전에 칸을 연다」**이다(c9 머리말과 같은 성질).
--
-- ■ 왜 두 칸인가 — 시각만으로는 못 읽는다
--   `due_at` 만 남기면 2년 뒤에 「이 값이 무슨 규칙으로 나온 건가」를 아무도 못 말한다.
--   `due_ver` 가 그 규칙의 판을 든다. 규칙이 바뀌면 **새 판 이름**을 쓰고 옛 행은 옛 이름을
--   그대로 든다 — `task_schema_ver`(스냅샷 모양의 판)와 정확히 같은 계열의 사고다.
--   🔑 `due.v1` = **배정일의 끝**(배정일 다음날 00:00 · `Asia/Ulaanbaatar`).
--      값은 `(배정일::date + 1)::timestamp at time zone <시간대>` 로 **DB가 낸다** — 오프셋
--      상수를 코드에 적지 않는다(P0 §314 · 절단문서 ①-14 가 같은 자리에서 한 번 물렸다).
--      🚫 반대로 **읽는 쪽이 그때그때 다시 계산하는 안은 기각**이다. 그게 곧 「수업표가 바뀌면
--      과거가 바뀐다」이고, 이 조각이 존재하는 이유 그 자체를 깨뜨린다.
--
-- ■ 왜 `submissions` 인가
--   배정 한 건에 붙는 산출물 칸이 이미 거기 있다(`task_ref`·`task_snapshot`·`task_schema_ver`).
--   `learning_events` 에 열면 전 사건의 99%가 null 인 칸이 되고, payload(jsonb)에 넣으면
--   CHECK·불변 자물쇠·확인 카운터 **셋 다** 못 건다 — 절단문서 ①-7 이 추정메타를 payload 에서
--   물리 칸으로 끌어낸 것과 같은 판정이다.
--   🚫 학생 제출 행(`submission.created`)에 마감을 **복사하지 않는다.** 복사하는 순간
--      「이 배정의 마감」의 정본이 둘이 되고, 어긋나는 날 어느 쪽이 참인지 아무도 못 정한다
--      (L0 §3-3 이 `learner_id` 복제를 거부한 것과 같은 이유). 제출은 그날 배정을 조인해 읽는다.
--
-- ■ 분모의 정본을 **하나로 정한다** (이 조각의 두 번째 몫)
--   「안 낸 날」의 분모 후보가 두 개였다: ①`task.assigned` 사건 ②`daily_activity.expected`.
--   ②는 **열 DDL만 있고 값을 채우는 코드가 0줄**이다(실측 2026-08-08 · `lib/`·`src/`·
--   `functions/` grep 0건). 정본은 ①**`task.assigned` 사건**이다 — append-only 이고, 이미
--   `functions/deliver` 라는 생산자가 있고, 마감까지 그 행이 든다.
--   ②는 **파생 캐시 자리로 남긴다**(집계 속도용). 아래 확인 카운터 `분모칸오염` 이 그 자리에
--   값이 들어오는 순간 빨개진다 — 캐시가 조용히 두 번째 정본이 되는 길을 기계가 막는다.
--   🚫 열을 지우지 않는다: 지우는 것은 좁힘이라 이 조각의 「넓히기만 한다」 성질을 깨고,
--      캐시로 쓸 자리 자체는 나중에 값이 있다.
--
-- ■ 🔑 CHECK 접미는 **살아 있는 것 전부**를 c10 으로 통일한다 — 값이 안 바뀐 것도 포함해서.
--   c8·c9 머리말이 같은 판정을 적어 뒀고 `tests/L0스키마.test.js` 가 그 자리에서 빨개진다.
--   이름이 그대로면 「c10 계약 + c9 물리」가 초록으로 보인다.
--
-- ■ ⚠ 이 조각은 **넓히기만 한다** — 기존 행을 떨어뜨리는 좁힘이 없다.
--   새 열 둘은 null 로 서고(옛 배정에는 마감이 없었던 것이 사실이다 — 지어내 채우지 않는다),
--   짝 CHECK 는 둘 다 null 인 기존 행을 통과시키며, 다시 거는 아홉은 술어가 c9 와 동일하다.
--
-- ■ ⛔ 옛 배정은 **소급 채우지 않는다.**
--   c10 이전 행의 마감은 아무도 모른다. `now()` 나 규칙을 소급 적용해 채우면 그건 복원이
--   아니라 **날조**고, 그 뒤로는 진짜 값과 지어낸 값이 같은 모양이 된다. 확인 카운터도
--   이 조각이 선 시각 이후 행만 센다.
--
-- 이 조각은 20260807210000 이 선 DB 위에서만 돈다.
-- ============================================================================

begin;

do $migration$
declare
  migration_version constant text := '20260808010000';
  migration_name constant text := '20260808010000_engine_c10.sql';
  expected_checksum constant text := '8422b5082ea79e1df1abe0f506d3876c4e2f2da3ef20f255aa6da5790fa2e856'; -- migration-checksum
  base_version constant text := '20260807210000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c9 위에서만 돈다 — engine.schema_migrations가 없다(빈 DB면 합본을 처음부터 부어라)';
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

  -- ── 마감 시각·마감 판본 (소급 불가 · 유호님 승인 2026-08-08)
  alter table engine.submissions
    add column if not exists due_at  timestamptz,   -- 그 배정의 마감 순간
    add column if not exists due_ver text;          -- 그 마감을 낸 규칙의 판 (`due.v1` = 배정일의 끝)

  -- ── CHECK 접미 통일 c9→c10 + 짝 규칙 신설
  alter table engine.learning_events
    drop constraint if exists learning_events_event_type_c9,
    drop constraint if exists learning_events_task_type_c9,
    drop constraint if exists learning_events_correction_target_c9,
    add constraint learning_events_event_type_c10 check (event_type in (
      'submission.created', 'quiz.answered', 'choice.selected',
      'correction.responded', 'correction.viewed', 'preference.stated',
      'session.abandoned', 'intervention.delivered', 'data_use.granted', 'data_use.revoked',
      'task.assigned', 'exam.result', 'content.viewed'
    )),
    add constraint learning_events_task_type_c10 check (task_type is null or task_type in (
      '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
    )),
    add constraint learning_events_correction_target_c10 check (
      case when event_type in ('correction.viewed', 'correction.responded')
           then correction_id is not null
           else correction_id is null
      end
    );

  alter table engine.submissions
    drop constraint if exists submissions_task_format_c9,
    drop constraint if exists submissions_translation_source_c9,
    add constraint submissions_task_format_c10 check (task_format is null or task_format in (
      '낭독', '응답', '자유발화', '모의면접', '높임전환', '쓰기첨삭', '번역'
    )),
    add constraint submissions_translation_source_c10 check (
      task_format is distinct from '번역'
      or nullif(btrim(task_snapshot->>'mn'), '') is not null
    ),
    -- 🔑 시각만 있고 판본이 없으면 그 값은 **읽을 수 없는 값**이다(무슨 규칙인지 모른다).
    --    판본만 있고 시각이 없으면 규칙만 있고 결과가 없다. 반쪽은 둘 다 사고라 짝으로 건다.
    add constraint submissions_due_paired_c10 check (
      (due_at is null) = (due_ver is null)
    );

  alter table engine.corrections
    drop constraint if exists corrections_verdict_c9,
    add constraint corrections_verdict_c10 check (verdict is null or verdict in (
      'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
    ));

  alter table engine.learners
    drop constraint if exists learners_signup_attempts_nonneg_c9,
    drop constraint if exists learners_temp_password_paired_c9,
    add constraint learners_signup_attempts_nonneg_c10 check (signup_attempts >= 0),
    add constraint learners_temp_password_paired_c10
      check (temp_password_hash is null or temp_password_expires_at is not null);

  alter table engine.staff
    drop constraint if exists staff_role_c9,
    add constraint staff_role_c10 check (role in ('teacher', 'inspector', 'director'));

  /* ── 마감은 **배정 순간에만 참이다** — 자물쇠에 두 칸을 더한다.
   *   나중에 고칠 수 있으면 「마감을 놓쳤다」가 사후에 지워지고, 그 순간 이 열이 지키려던
   *   것을 이 열이 깨뜨린다(§10-4 `definition_ver` 를 기각한 것과 같은 형태).
   *   패턴은 c8(20260807120000)과 같다 — **값이 이미 있는 칸만** 잠근다. null→값 첫 채움은
   *   그대로 살아, c10 이전 행에 나중에 진짜 근거가 생기면 한 번은 채울 수 있다. */
  create or replace function engine.reject_original_overwrite() returns trigger
    language plpgsql as $function$
  begin
    if OLD.body_original is not null and NEW.body_original is distinct from OLD.body_original then
      raise exception '학생 원문은 고치지 않는다 — 오류가 곧 데이터다 (L0 §2 원문 불변)';
    end if;
    if OLD.transcript is not null and NEW.transcript is distinct from OLD.transcript then
      raise exception '기계 전사는 덮지 않는다 — 사람이 고친 값은 transcript_verified로 간다 (L0 §9-2)';
    end if;
    if OLD.task_snapshot is not null and NEW.task_snapshot is distinct from OLD.task_snapshot then
      raise exception '과제 스냅숏은 고치지 않는다 — 그날 학생이 본 것이 증거다 (L0 §3-3)';
    end if;
    if OLD.audio_ref is not null and NEW.audio_ref is distinct from OLD.audio_ref then
      raise exception '음성 참조는 바꾸지 않는다 — 삭제는 audio_deleted_at 이 진다 (L0 §9-3)';
    end if;
    if OLD.image_refs is not null and NEW.image_refs is distinct from OLD.image_refs then
      raise exception '이미지 참조는 바꾸지 않는다 (L0 §3-3)';
    end if;
    if OLD.capture_meta is not null and NEW.capture_meta is distinct from OLD.capture_meta then
      raise exception '녹음 환경 실측은 덮지 않는다 — 그때 잰 값이 증거다 (L0 §3-3)';
    end if;
    if OLD.transcript_verified is not null
       and NEW.transcript_verified is distinct from OLD.transcript_verified then
      raise exception '검수 확정 전사는 덮지 않는다 (L0 §9-2)';
    end if;
    if OLD.due_at is not null and NEW.due_at is distinct from OLD.due_at then
      raise exception '마감 시각은 고치지 않는다 — 사후에 늘리면 「놓쳤다」가 지워진다 (L0 §3-3)';
    end if;
    if OLD.due_ver is not null and NEW.due_ver is distinct from OLD.due_ver then
      raise exception '마감 판본은 고치지 않는다 — 그 값이 무슨 규칙이었는지가 증거다 (L0 §3-3)';
    end if;
    if NEW.occurred_at is distinct from OLD.occurred_at then
      raise exception '발생 시각은 고치지 않는다 (L0 §2)';
    end if;
    return NEW;
  end
  $function$;

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
  (select count(*) from engine.daily_activity where expected is not null) as 분모칸오염
)
select case when 테이블수=11 and RLS켜짐=11 and 정책수=7
             and 새는테이블권한=0 and 새는스키마권한=0
             and 삭제차단=3 and 실패상태=1 and 이력정책=0
             and 잡없는제출=0 and 검수뷰=1 and 옛검수정책=0
             and 마감없는배정=0 and 분모칸오염=0
             and (select v from 빠진열) is null
             and (select v from 빠진제약) is null
             and (select v from 빠진트리거) is null
             and (select version from 현재이력)='20260808010000'
              and (select checksum from 현재이력)='8422b5082ea79e1df1abe0f506d3876c4e2f2da3ef20f255aa6da5790fa2e856' -- migration-checksum
            then '✅ 전부 통과'
            else '❌ 아래 칸을 그대로 알려주세요 (기대: 11·11·7·0·0·3·1·0·0·1·0·0 · 빠진 칸은 전부 비어 있어야 합니다)'
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
-- ① 빠진제약이 비어야 한다 — 아홉 이름이 `_c10` 으로 갈렸고 짝 CHECK 하나가 새로 섰다.
--    하나라도 `_c9` 로 남으면 여기 이름이 뜬다(재실행으론 안 바뀐다 · drop/add 를 따로 돌린 자리다).
-- ② 새 열 둘은 **null 로 선다** — 옛 배정에 마감이 없었던 것이 사실이고, 채우는 자는
--    `supabase/functions/deliver` 다(오늘 이후 배정부터). `마감없는배정` 이 그 배선을 지킨다.
-- ③ 🔴 **넓히기만 했다** — 기존 행을 검사하는 좁힘이 없다. 짝 CHECK 는 둘 다 null 인 기존
--    행을 통과시키고, 다시 거는 아홉은 c9 와 술어가 한 글자도 같다(이름만 갈았다).
-- ④ CHECK 제약은 현행 접미사만 남아야 한다(이 조각이 아홉을 `_c9`→`_c10` 으로 갈았다).
--    ⚠ 이 줄은 **마지막 조각이 들고 있어야 한다.** 합본은 조각을 이어붙인 것이라
--      `tests/L0스키마.test.js` 가 「마지막 기대: 줄」 뒤를 훑는데, 새 조각이 자기 줄 없이
--      붙으면 그 조각의 **파일명**이 제약 이름으로 읽혀 빨개진다.
--    기대: corrections_verdict_c10 · learners_signup_attempts_nonneg_c10
--         · learners_temp_password_paired_c10 · learning_events_correction_target_c10
--         · learning_events_event_type_c10 · learning_events_task_type_c10
--         · staff_role_c10 · submissions_due_paired_c10 · submissions_task_format_c10
--         · submissions_translation_source_c10
