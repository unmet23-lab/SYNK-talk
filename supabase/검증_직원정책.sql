-- ============================================================================
-- 직원 정책 실측 — L0 §4-5 「이 설계가 섰다고 말할 조건」 ①~④
--
-- 왜 파일로 두나 — RLS 의 실패 모드는 **조용한 통과**다. DDL 이 적용됐다는 것은
--   「정책이 존재한다」이지 「정책이 막는다」가 아니다. 존재만 보면 `using (true)` 도 통과한다.
--
-- 🔴 **이 SQL 은 통째로 rollback 한다.** 안에서 하는 일(가짜 계정·grant·해임)이 전부
--   되돌려지므로 실행 뒤 상태는 실행 전과 같다. 되돌리는 절차를 먼저 정하고 바꿔본다.
--   확인: 실행 직후 `확인_적용후상태.sql` 이 여전히 11·11·7·**0**·0·3·1·0·0·1 이어야 한다
--   (특히 「새는테이블권한=0」 — 아래에서 잠깐 grant 했다가 되돌린 자리다).
--
-- ⚠ **오늘 정책은 도달 자체가 불가능하다.** `engine` 은 API 에 노출돼 있지 않고
--   `authenticated` 에게 테이블 권한이 0이라, 지금 막고 있는 것은 정책이 아니라 **권한 부재**다.
--   그래서 이 시험은 그 문을 트랜잭션 안에서 잠깐 열고 **정책만** 잰다 — 노출하는 날
--   드러날 결함을 그날이 아니라 오늘 본다(그날엔 아무도 이 검사를 기억하지 못한다).
--
-- ⚠ **리허설에서 돌린다.** 운영에서 돌아도 rollback 이지만, 되돌림에 기대는 실행은 리허설 몫이다.
-- 실행: SUPABASE_PROJECT_REF=<리허설 ref> node tools/원격SQL.js supabase/검증_직원정책.sql --적용
-- ============================================================================

begin;

-- 🔴 **통과와 미실행이 같은 모양이면 안 된다.** DO 블록의 `raise notice` 는 Management API 응답에
--   안 실린다 — 성공도 `[]`, 아무것도 안 돈 것도 `[]` 다. 판정을 **행으로** 낸다.
create temp table 판정결과(판정 text, 전체제출 int, 큐제출 int, 큐교정 int, 학생축 text) on commit drop;

do $probe$
declare
  검사자 constant uuid := '00000000-0000-4000-8000-0000000000e1';
  발급시각 constant bigint := extract(epoch from now())::bigint;
  주장 constant text := format('{"sub":"%s","role":"authenticated","iat":%s}', 검사자, 발급시각);
  큐제출 int; 큐교정 int; 학생행 int; 쓰기거부 boolean := false;
  해임후 int; 폐기후 int; 감사쓰기거부 boolean := false;
  기대큐교정 int; 기대큐제출 int; 전체제출 int; 큐제출id uuid;
  뷰제출 int; 샌열 text;  -- 검수 판(20260807190000 · 절단문서 ②-17)
  학생 uuid; 학생주장 text; 학생전 int; 학생후 int; 학생축 text;
begin
  -- ── 판 깔기 (전부 rollback 된다) ──────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values (검사자, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'probe-inspector@synk.invalid', 'x', now(), now(), now());

  insert into engine.staff(auth_user_id, role, display_name)
  values (검사자, 'inspector', '정책 실측용');

  -- ── 큐를 **직접 만든다** (2026-08-06 실측으로 배운 자리) ───────────────────
  -- 🔴 처음엔 리허설에 이미 있는 행으로 재려 했는데 `actor_kind='ai'` 교정이 **0행**이었다.
  --   그러면 「큐가 보이나」는 0=0 으로 통과하고, ②의 `insert ... select` 는 원본이 0행이라
  --   **아무것도 안 넣고 성공한다** — 즉 시험 전체가 무엇이든 통과시킨다.
  --   자기가 쓸 픽스처는 자기가 만든다(rollback 이 지운다).
  select submission_id into 큐제출id from engine.submissions order by occurred_at limit 1;
  if 큐제출id is null then
    raise exception '리허설에 제출물이 0행이다 — 큐를 만들 수 없어 이 시험은 아무것도 못 잰다';
  end if;
  insert into engine.corrections(submission_id, actor_kind, corrected_text, schema_ver)
  values (큐제출id, 'ai', '정책 실측용 AI 교정', 'probe');

  -- 기대값은 **DB 에게 묻는다** — 손으로 적으면 리허설 데이터가 늘 때마다 낡는다.
  select count(*) into 기대큐교정 from engine.corrections where actor_kind = 'ai';
  select count(distinct submission_id) into 기대큐제출
    from engine.corrections where actor_kind = 'ai';
  select count(*) into 전체제출 from engine.submissions;

  -- 큐가 비었거나 큐 = 전체면 「좁힌다」를 잰 적이 없는 것이다. 통과와 미측정을 가른다.
  if 기대큐교정 < 1 or 기대큐제출 < 1 then
    raise exception '큐가 비었다 — 0행에서는 이 시험이 무엇이든 통과시킨다';
  end if;
  if 기대큐제출 >= 전체제출 then
    raise exception '큐(%)가 전체 제출(%)과 같다 — 「큐만 보인다」를 구분할 수 없다',
      기대큐제출, 전체제출;
  end if;

  -- 오늘 닫혀 있는 문(권한)을 잠깐 연다. grant 는 트랜잭션이라 rollback 으로 함께 사라진다.
  grant usage on schema engine to authenticated;
  -- ⚠ `learning_events` 도 연다 — 안 열면 `learner_self_corrections` 정책이 그 표를 읽다
  --   permission denied 로 죽어, **정책 판정 이전에** 시험이 끝난다(막힌 것처럼 보이는 통과).
  grant select, insert on engine.learners, engine.learning_events, engine.submissions,
                          engine.corrections, engine.staff, engine.staff_access_log
                       to authenticated;
  -- 🔴 검수 판은 **운영에서 아무에게도 grant 하지 않는다**(조회 감사가 「읽는 지점 하나」를
  --   전제로 선다 · §4-5 ④). 여기서만 열어 **판이 실제로 좁은지**를 잰다 — rollback 이 지운다.
  grant select on engine.review_queue to authenticated;

  perform set_config('request.jwt.claims', 주장, true);
  set local role authenticated;

  -- ── ① 학생 신원은 안 보인다 (검수 화면은 제출물 ID 로 돈다) ────────────────
  select count(*) into 학생행 from engine.learners;

  -- ── 큐는 보인다 (막기만 하고 열지 않으면 그것도 결함이다) ──────────────────
  select count(*) into 큐교정 from engine.corrections;
  -- 🔴 제출물 **원표**는 이제 0행이어야 한다(20260807190000 이 넓은 정책을 지웠다).
  --   RLS 는 행 단위라 열을 못 좁혀, 큐에 든 행을 열면 `body_original`·`task_snapshot`·
  --   `redaction_result` 가 함께 나갔다(절단문서 ②-17).
  select count(*) into 큐제출 from engine.submissions;
  -- 대신 **판**이 보인다. 여기서 재는 것은 권한이 아니라 **넓이**다 — 역할 판정은
  --   Edge Function 몫이라(§4-5 ②) 이 뷰에는 일부러 안 들어 있다.
  select count(*) into 뷰제출 from engine.review_queue;
  select string_agg(column_name, ', ' order by column_name) into 샌열
    from information_schema.columns
   where table_schema = 'engine' and table_name = 'review_queue'
     and column_name in ('body_original', 'task_snapshot', 'redaction_result',
                         'redaction_ver', 'capture_meta', 'event_id', 'image_refs');

  -- ── ② 직접 쓰기는 거부된다 (쓰기는 Edge Function 만) ──────────────────────
  -- ⚠ 대상은 **위에서 확정한 id** 다. `select ... from` 로 원본을 고르면 그 select 가 0행일 때
  --   insert 가 조용히 성공해 「거부됐다」와 같은 모양이 된다(그 함정을 여기서 밟았다).
  begin
    insert into engine.corrections(submission_id, actor_kind, schema_ver)
    values (큐제출id, 'teacher', 'probe');
  exception when insufficient_privilege or check_violation or not_null_violation then
    쓰기거부 := true;
  end;

  -- 감사표는 아무 토큰에게도 열지 않는다(정책 0 = 닫힘). 읽기가 0행이어야 한다.
  begin
    insert into engine.staff_access_log(staff_id, action)
    select staff_id, 'probe' from engine.staff limit 1;
  exception when insufficient_privilege or not_null_violation then
    감사쓰기거부 := true;
  end;

  -- ── ③ 해임 즉시 — 만료 전 같은 토큰이 죽는다 ──────────────────────────────
  reset role;
  update engine.staff set active = false where auth_user_id = 검사자;
  set local role authenticated;
  select count(*) into 해임후 from engine.corrections;

  -- ── ④ 재발급 즉시 — 옛 토큰만 죽는다 ──────────────────────────────────────
  reset role;
  update engine.staff set active = true, revoked_before = now() + interval '1 hour'
   where auth_user_id = 검사자;
  set local role authenticated;
  select count(*) into 폐기후 from engine.corrections;
  reset role;

  -- ── ⑤ 학생 축도 같은 규칙인가 (§4-2 🔴 · §4-5 ③ 🔑) ──────────────────────
  -- 🔴 「두 축이 같은 판정 함수를 부른다」는 **주장**이고, 학생 쪽은 정책이 다른 모양이라
  --   (재귀 때문에 `current_learner_id()` 를 못 부른다) 직접 재지 않으면 갈라져도 모른다.
  select auth_user_id into 학생 from engine.learners where auth_user_id is not null limit 1;
  if 학생 is null then
    -- 미실행을 통과처럼 적지 않는다 — 판정 행에 그대로 남긴다.
    학생축 := '⏭ 미측정 — 리허설에 auth_user_id 가 붙은 학생이 0명';
  else
    학생주장 := format('{"sub":"%s","role":"authenticated","iat":%s}', 학생, 발급시각);
    perform set_config('request.jwt.claims', 학생주장, true);
    set local role authenticated;
    select count(*) into 학생전 from engine.learners;

    reset role;
    update engine.learners set revoked_before = now() + interval '1 hour' where auth_user_id = 학생;
    perform set_config('request.jwt.claims', 학생주장, true);
    set local role authenticated;
    select count(*) into 학생후 from engine.learners;
    reset role;

    if 학생전 <> 1 then
      raise exception '⑤ 실패: 학생이 자기 행을 %행 본다 — 1행이어야 한다', 학생전;
    end if;
    if 학생후 <> 0 then
      raise exception '⑤ 실패: revoked_before 뒤에도 학생 옛 토큰이 %행 본다', 학생후;
    end if;
    학생축 := '✅ 폐기 전 1행 · 폐기 후 0행';
  end if;

  -- ── 판정 ─────────────────────────────────────────────────────────────────
  if 학생행 <> 0 then
    raise exception '① 실패: 검수자에게 learners 가 %행 보인다 — 학생 신원은 열지 않는다', 학생행;
  end if;
  if 큐교정 <> 기대큐교정 then
    raise exception '큐 실패: 교정 %/% — 막기만 하고 열지 않으면 검수가 안 돈다',
      큐교정, 기대큐교정;
  end if;
  if 큐제출 <> 0 then
    raise exception '②-17 실패: 검수자에게 submissions 원표가 %행 보인다 — 넓은 옛 정책이 살아 있다',
      큐제출;
  end if;
  if 뷰제출 <> 기대큐제출 then
    raise exception '②-17 실패: 검수 판이 %행 (기대 %행) — 좁히다가 화면을 통째로 비웠다',
      뷰제출, 기대큐제출;
  end if;
  if 샌열 is not null then
    raise exception '②-17 실패: 검수 판에 %가 실려 있다 — 이름만 가리고 원문을 연 그 상태다', 샌열;
  end if;
  if not 쓰기거부 then raise exception '② 실패: 검수자 토큰이 corrections 에 직접 썼다'; end if;
  if not 감사쓰기거부 then raise exception '② 실패: 검수자 토큰이 감사표에 직접 썼다'; end if;
  if 해임후 <> 0 then raise exception '③ 실패: active=false 인데 큐가 %행 보인다', 해임후; end if;
  if 폐기후 <> 0 then raise exception '④ 실패: revoked_before 뒤에도 옛 토큰이 %행 본다', 폐기후; end if;

  insert into 판정결과 values (
    '✅ ①~④ 전부 통과 — 학생 신원 0행 · 원표 0행/판만 보임 · 직접 쓰기 거부 · 해임/재발급 즉시 차단',
    전체제출, 기대큐제출, 기대큐교정, 학생축);
end
$probe$;

select * from 판정결과;

rollback;
