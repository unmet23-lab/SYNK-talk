#!/usr/bin/env node
'use strict';
/**
 * 배달왕복시험 — `functions/deliver`(P0 §6 배달 배치)의 보증을 **실제 DB 왕복으로** 증명한다.
 *
 *   SUPABASE_PROJECT_REF=<리허설ref> node tools/배달왕복시험.js
 *
 * ■ 왜 필요한가
 *   배치의 보증은 전부 DB 안에서 성립하고, **깨져도 증상이 조용하다**:
 *   · 멱등이 깨지면 하루 2건이 서고, 「제출 안 함」의 분모가 조용히 두 배가 된다.
 *   · 동의 게이트가 새면 동의 없는 학생에게도 큐가 선다.
 *   · 강등 표시가 안 붙으면 원장 화면의 「강등 발생 건수」가 0으로 보인다 —
 *     AI 가 아직 한 줄도 못 쓰는 상태가 **정상으로 보고된다**(§4-1 이 경계한 그 형태).
 *   함수 코드를 읽어서는 셋 다 증명되지 않는다.
 *
 * ■ 🔴 리허설 전용
 *   `learning_events` 는 append-only 라 여기서 만든 행은 **지워지지 않는다**.
 *   프로젝트 이름에 `rehearsal` 이 없으면 거부한다 — 막히는 방향이 안전한 방향이다.
 */
const path = require('path');
const die = (m) => { console.error('[배달왕복시험] ' + m); process.exit(1); };

const 골격 = require(path.join(__dirname, '..', 'lib', '왕복골격.js'));   // 공통 머리 — 왕복 5종 공용
const { 오늘과제, 몽골날짜, 따라말하기문장 } = require(path.join(__dirname, '..', 'lib', '오늘과제.js'));
// 합성 도메인은 정본에서 가져온다 — 여기 박으면 도메인이 바뀌는 날 조용히 갈린다.
const { 도메인 } = require(path.join(__dirname, '..', 'lib', '로그인코드.js'));

/* 어제 배정을 손으로 심는다 — 「첫날이 아닌 학생」은 그렇게만 만들어진다.
 * 배치를 어제 한 번 돌리는 것으로는 못 만든다(그날 날짜로 돌 뿐이다). */
const 어제 = (오늘) => {
  const d = new Date(`${오늘}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const { ref, sql, anon, service_role: service, 확인, 보고 } = await 골격.열기('배달왕복시험');

  const 호출 = async (질의 = '', 키 = service) => {
    const r = await fetch(`https://${ref}.supabase.co/functions/v1/deliver${질의}`, {
      method: 'POST', headers: { Authorization: `Bearer ${키}` },
    });
    return { status: r.status, 몸: JSON.parse((await r.text()) || '{}') };
  };

  const 오늘 = 몽골날짜();
  const 표 = `t${Date.now().toString(36)}`;   // 이번 실행의 학생들을 가르는 표식
  const 판 = (await sql(`select name from engine.schema_migrations order by version desc limit 1`))[0].name.match(/_(c\d+)\.sql$/)[1];

  /* ── 준비: 네 학생 ──────────────────────────────────────────────
   *  A 동의 O·이력 없음      → 첫날 · degraded=false
   *  B 동의 X                → 건너뜀(배정 0)
   *  C 동의 O·어제 배정 O     → 강등(전날 문장) · degraded=true
   *  D 동의 O·어제 배정 + 그 뒤 확정된 교정 → ②슬롯 = 교정문 · degraded=false */
  console.log('■ 준비 — 시험 학생 4명');
  const 학생들 = await sql(`
    insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver)
    values ('${표}-A','시험A','Lv2','study','${판}'), ('${표}-B','시험B','Lv2','study','${판}'),
           ('${표}-C','시험C','Lv2','study','${판}'), ('${표}-D','시험D','Lv2','study','${판}')
    returning learner_id, student_code`);
  const id = Object.fromEntries(학생들.map((r) => [r.student_code.slice(-1), r.learner_id]));

  await sql(`
    insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver)
    values ('${id.A}'::uuid,'v18.9', now() - interval '30 days','${판}'),
           ('${id.C}'::uuid,'v18.9', now() - interval '30 days','${판}'),
           ('${id.D}'::uuid,'v18.9', now() - interval '30 days','${판}')`);

  // C·D 에게 어제 배정을 심는다 — 배정 행 = learning_events + submissions 쌍이다.
  const 어제날 = 어제(오늘);
  const 어제스냅 = 오늘과제({ 날짜: 어제날, 첫날: true }).task_snapshot;
  for (const k of ['C', 'D']) {
    await sql(`
      with ev as (
        insert into engine.learning_events
          (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
           level_snapshot, consent_ver, degraded, payload, schema_ver)
        values ('${id[k]}'::uuid,'task.assigned','발화녹음','ai',
                '${어제날}T04:00:00Z'::timestamptz, 'task:${id[k]}:${어제날}',
                'Lv2','v18.9', false, '{"ver":1}'::jsonb, '${판}')
        returning event_id)
      insert into engine.submissions (event_id, task_type, task_ref, task_snapshot, occurred_at, schema_ver)
      select event_id, '발화녹음', 'task-${어제날}',
             '${JSON.stringify(어제스냅).replace(/'/g, "''")}'::jsonb,
             '${어제날}T04:00:00Z'::timestamptz, '${판}' from ev`);
  }

  /* 🔴 D 의 **어제 발화** — 교정은 이 행에 붙는다. 배정 행이 아니다.
   *   `engine.submissions` 에는 제출이 아닌 행(배정)도 살아서, 교정을 아무 행에나 붙이면
   *   결과 변수(`retry_of_event_id`)가 「학생이 다시 낸 발화 → 어제의 배정」을 가리키게 된다.
   *   그건 틀린 게 아니라 **뜻이 없는** 값이고, 그 오염은 조회할 때에야 보인다.
   *   그래서 배치가 그 술어로 거르고(`functions/deliver`), 이 픽스처는 **진짜 제출**을 심는다. */
  await sql(`
    with ev as (
      insert into engine.learning_events
        (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
         level_snapshot, consent_ver, degraded, payload, schema_ver)
      values ('${id.D}'::uuid,'submission.created','발화녹음','learner',
              '${어제날}T08:00:00Z'::timestamptz, 'sub:${id.D}:${어제날}',
              'Lv2','v18.9', false, '{"ver":1,"attempt_no":1}'::jsonb, '${판}')
      returning event_id)
    insert into engine.submissions (event_id, task_type, task_ref, task_format, body_original, occurred_at, schema_ver)
    select event_id, '발화녹음', 'task-${어제날}', '낭독', '어제 친구를 만나서 밥 먹었어요',
           '${어제날}T08:00:00Z'::timestamptz, '${판}' from ev`);

  /* D 의 교정 — 어제 배정 **뒤에** 확정됐다. 「지난 배정 뒤에 새로 확정된 것만」이 조건이라
   * 이 시각이 배정보다 앞서면 ②슬롯에 안 와야 한다(그 경계도 아래에서 잰다). */
  await sql(`
    with s as (
      select s.submission_id from engine.submissions s
        join engine.learning_events e on e.event_id = s.event_id
       where e.learner_id = '${id.D}'::uuid
         and e.event_type = 'submission.created' limit 1)
    insert into engine.corrections (submission_id, actor_kind, corrected_text, created_at, schema_ver)
    select submission_id, 'teacher', '어제 친구를 만나서 밥을 먹었어요',
           '${어제날}T09:00:00Z'::timestamptz, '${판}' from s`);

  // 그 발화의 event_id — 아래 ⑤·⑧ 이 「배정이 이걸 가리키는가」로 결과 변수를 잰다.
  const D원제출 = (await sql(`
    select event_id from engine.learning_events
     where learner_id = '${id.D}'::uuid and event_type = 'submission.created' limit 1`))[0].event_id;
  console.log(`  준비 완료 — 표식 ${표} · 오늘 ${오늘} · 판 ${판}\n`);

  /* ── ① 문 ──────────────────────────────────────────────────── */
  console.log('■ ① 호출자');
  const 익명 = await 호출('', anon);
  확인('anon 키로는 못 부른다 — 배치는 서버 사건을 만든다', 익명.status === 401, 익명);

  /* ── ② 첫 배달 ─────────────────────────────────────────────── */
  console.log('\n■ ② 배달');
  const r1 = await 호출();
  확인('200 으로 돈다', r1.status === 200, r1.status);
  const 내것 = (몸, k) => (몸.건너뜀 || []).concat(몸.실패 || []).find((x) => x.learner_id === id[k]);
  확인('B(동의 없음)는 건너뛴다 — 동의 없이 배정하는 우회로가 없다',
    (내것(r1.몸, 'B') || {}).사유 === 'consent_missing', 내것(r1.몸, 'B'));
  확인('실패 0', (r1.몸.실패 || []).length === 0, r1.몸.실패);

  /* 🔑 아래 두 곳(여기·`/progress` 대조)은 `Asia/Ulaanbaatar` 를 **손으로 적는다** — 여기서만
   *   그렇다. 시험이 `lib/오늘과제.js` 의 `시간대` 를 가져다 쓰면 그 상수가 틀린 날 시험도 같이
   *   틀려 초록이 된다. 손으로 적은 쪽은 `오늘`(= `몽골날짜()`)과 어긋나는 순간 빨개진다.
   *   🔴 그래서 회귀(`tests/오늘과제.test.js`)의 리터럴 금지는 **출하 코드에만** 건다. */
  const 행 = async (k) => (await sql(`
    select e.event_id, e.event_type, e.actor_kind, e.degraded, e.intervention_id, e.idempotency_key,
           e.retry_of_event_id, e.payload, s.task_snapshot, s.task_format, s.task_ref
      from engine.learning_events e
      left join engine.submissions s on s.event_id = e.event_id
     where e.learner_id = '${id[k]}'::uuid
       and (e.occurred_at at time zone 'Asia/Ulaanbaatar')::date = '${오늘}'::date
     order by e.event_type`));

  const A = await 행('A');
  확인('A 에게 사건 2건 — 개입 + 배정', A.length === 2, A.map((r) => r.event_type));
  const A개입 = A.find((r) => r.event_type === 'intervention.delivered');
  const A배정 = A.find((r) => r.event_type === 'task.assigned');
  확인('둘 다 actor_kind=ai (§10-A-1 — system 을 새로 만들지 않았다)',
    A개입 && A배정 && A개입.actor_kind === 'ai' && A배정.actor_kind === 'ai', A.map((r) => r.actor_kind));
  확인('개입과 배정이 **같은** intervention_id 를 든다 — 성과 계승의 끈',
    A개입 && A배정 && A개입.intervention_id && A개입.intervention_id === A배정.intervention_id,
    [A개입 && A개입.intervention_id, A배정 && A배정.intervention_id]);
  확인('멱등키가 C0 §4-1 모양이다',
    A배정 && A배정.idempotency_key === `task:${id.A}:${오늘}`, A배정 && A배정.idempotency_key);
  확인('A 는 첫날이라 강등이 아니다', A배정 && A배정.degraded === false, A배정 && A배정.degraded);

  /* ── ③ 스냅샷 ──────────────────────────────────────────────── */
  console.log('\n■ ③ 큐의 실체');
  const snap = A배정 && A배정.task_snapshot;
  확인('배정에 task_snapshot 이 붙어 있다 — 이것이 큐다(새 테이블 0)',
    !!snap && Array.isArray(snap.호흡) && snap.호흡.length === 2, snap);
  /* 🔴 ③의 형식을 값으로 얼리지 않는다 — `lib/오늘과제.js` 가 `고름 ? '응답' : '자유발화'` 로
   *   **선택지 유무에서 파생**시키기 때문이다(급수 1~2·미정은 보기를 받는다 · talk edb92b4).
   *   여기에 `자유발화` 를 박아 두면 초급 갈래가 서는 날 이 시험이 빨개지는데, 빨간 이유는
   *   결함이 아니라 **설계가 바뀐 것**이라 다음 사람이 「고쳐야 할 것」을 잘못 짚는다.
   *   그래서 값이 아니라 **그 파생 규칙 자체**를 잰다 — 「보기가 있는데 자유발화」가 성립하면
   *   그때 빨개진다(그게 이 칸이 지키려던 c5 축 `왜_task_format이_따로인가` 그대로다).
   *   ⚠ 실측 2026-08-09(`local_ddd51fde`): 이 자리가 왕복시험이 막혀 있던 동안 낡아 87/88 이었다. */
  const 셋째 = snap && snap.호흡[1];
  const 보기있음 = !!(셋째 && Array.isArray(셋째.선택지) && 셋째.선택지.length);
  확인('호흡마다 형식이 갈려 있다 — ②는 낭독, ③은 «선택지 유무»에서 파생된다',
    !!snap && snap.호흡[0].task_format === '낭독'
      && 셋째.task_format === (보기있음 ? '응답' : '자유발화')
      && 셋째.task_format !== snap.호흡[0].task_format,
    snap && snap.호흡.map((h) => `${h.task_format}${Array.isArray(h.선택지) ? `(보기 ${h.선택지.length})` : ''}`));
  확인('🔴 행의 task_format 은 비어 있다 — 한 칸에 담으면 나중에 못 가른다',
    A배정 && A배정.task_format === null, A배정 && A배정.task_format);
  확인('개입 payload 에 output_text 가 있다 — 그날 학생에게 나간 말',
    !!A개입 && A개입.payload && A개입.payload.output_text === 따라말하기문장(snap),
    A개입 && A개입.payload);

  /* ── ④ 멱등 ───────────────────────────────────────────────── */
  console.log('\n■ ④ 재실행 — 하루 1건의 실체');
  const r2 = await 호출();
  확인('두 번째 실행은 duplicate 로 접힌다', r2.몸.신규 === 0 && r2.몸.재실행 >= 3, {
    신규: r2.몸.신규, 재실행: r2.몸.재실행,
  });
  const A2 = await 행('A');
  확인('🔴 행이 안 늘었다 — 새 유일 제약 없이 멱등이 하루 1건을 지킨다',
    A2.length === 2, A2.length);

  /* ── ⑤ 강등 · 교정 ─────────────────────────────────────────── */
  console.log('\n■ ⑤ 갈래');
  const C = (await 행('C')).find((r) => r.event_type === 'task.assigned');
  확인('C(어제 배정 O·교정 X)는 **강등**이다 — AI 자리가 비었다는 사실이 행에 남는다',
    C && C.degraded === true, C && C.degraded);
  확인('C 는 전날 문장을 그대로 받는다 (§6-4)',
    C && 따라말하기문장(C.task_snapshot) === 따라말하기문장(어제스냅),
    C && 따라말하기문장(C.task_snapshot));

  const D = (await 행('D')).find((r) => r.event_type === 'task.assigned');
  확인('D(배정 뒤 확정된 교정)의 ②슬롯이 교정문이다 (§6-3)',
    D && 따라말하기문장(D.task_snapshot) === '어제 친구를 만나서 밥을 먹었어요',
    D && 따라말하기문장(D.task_snapshot));
  확인('교정문 경로는 강등이 아니다 — 조회지 AI 호출이 아니다',
    D && D.degraded === false, D && D.degraded);

  /* 🔴 **설계 전체의 유일한 결과 변수**(L0 §9-2). 여기까지는 문장만 나가고 「어느 제출의
   *   교정인가」가 배달에서 끊겼다 — 이름·FK·CHECK·서버 INSERT 가 c5부터 다 서 있었는데도
   *   생산자가 0이던 이유다. 없으면 엔진은 상관만 배우고 처방을 못 배운다. */
  확인('🔴 D 의 배정이 원 제출 사건을 가리킨다 — 결과 변수의 첫 마디',
    D && D.retry_of_event_id === D원제출, [D && D.retry_of_event_id, D원제출]);
  확인('C(교정 없음)의 배정은 그 칸이 비어 있다 — 재시도가 아닌 날을 재시도로 만들지 않는다',
    C && C.retry_of_event_id === null, C && C.retry_of_event_id);

  /* ── ⑥ 집계 오염 ──────────────────────────────────────────────
   * 🔴 `task_snapshot` 을 `submissions` 에 실은 대가다. 「제출 수」를 event_type 없이 세면
   *   배정이 제출로 세어진다 — 이 시험이 그 자리를 지킨다. */
  console.log('\n■ ⑥ 「제출 수」 오염');
  const [{ 전체, 진짜 }] = await sql(`
    select (select count(*) from engine.submissions s
              join engine.learning_events e on e.event_id = s.event_id
             where e.learner_id = '${id.A}'::uuid) as 전체,
           (select count(*) from engine.submissions s
              join engine.learning_events e on e.event_id = s.event_id
             where e.learner_id = '${id.A}'::uuid and e.event_type = 'submission.created') as 진짜`);
  확인('event_type 을 안 걸면 배정이 제출로 세어진다(=1) · 걸면 0 — 집계는 반드시 건다',
    Number(전체) === 1 && Number(진짜) === 0, { 전체, 진짜 });

  /* ── ⑦ 점검 모드 ───────────────────────────────────────────── */
  console.log('\n■ ⑦ §6-5 미달 감지');
  const chk = await 호출('?점검');
  확인('점검이 재적·배정·강등을 센다', chk.status === 200 && chk.몸.mode === '점검' && Number(chk.몸.재적) > 0, chk.몸);
  확인('🔴 B 가 못 받았으므로 미달이 참이다 — 배치가 안 돈 것을 조용히 넘기지 않는다',
    chk.몸.미달 === true && Number(chk.몸.배정) < Number(chk.몸.재적), chk.몸);
  확인('강등이 0 이 아니다 — AI 미배선이 숫자로 보인다', Number(chk.몸.강등) > 0, chk.몸.강등);

  /* ── ⑧ 조회 왕복 ──────────────────────────────────────────────
   * 🔴 여기까지 와야 「배달 → 화면」이 닫힌다. 배치가 쓴 것과 `GET /v1/tasks` 가 읽은 것이
   *   갈리면 증상은 「학생 화면이 비어 있다」 하나뿐이라, **같은 실행 안에서** 대조한다.
   *
   * 학생 토큰은 admin API 로 직접 만든다(`auth` 함수를 지나지 않는다) — 이 시험이 재는 것은
   * 배달·조회의 대조지 등록 게이트가 아니고, 그건 `인증왕복시험.js` 가 따로 진다.
   * 🔑 계정은 **재사용**한다 — 회차마다 새로 만들면 `auth.users` 가 회차 수만큼 쌓인다. */
  console.log('\n■ ⑧ 조회 왕복 — GET /v1/tasks (C0 §4-3 ①)');
  const 학생이메일 = `probe-tasks${도메인}`;
  const 학생비번 = 'Tasks-Rehearsal-1';
  const 유저 = async (경로, 방법, 본문) => fetch(`https://${ref}.supabase.co/auth/v1/${경로}`, {
    method: 방법,
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(본문),
  });
  let uid = (await sql(`select id from auth.users where email='${학생이메일}'`))[0]?.id;
  if (!uid) {
    const cr = await 유저('admin/users', 'POST', { email: 학생이메일, password: 학생비번, email_confirm: true });
    uid = cr.ok ? JSON.parse(await cr.text()).id : (await sql(`select id from auth.users where email='${학생이메일}'`))[0]?.id;
    if (!uid) die('시험용 학생 계정을 못 만들었다');
  } else {
    // 재사용이라 비밀번호가 갈렸을 수 있다 — 매번 맞춰 두면 회차가 서로를 안 깨뜨린다.
    await 유저(`admin/users/${uid}`, 'PUT', { password: 학생비번 });
  }
  // 지난 회차의 학생에게서 떼어 이번 A 에게 붙인다(auth_user_id 는 학생당 하나다).
  await sql(`update engine.learners set auth_user_id = null where auth_user_id = '${uid}'`);
  await sql(`update engine.learners set auth_user_id = '${uid}' where learner_id = '${id.A}'::uuid`);

  const 로그인 = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 학생이메일, password: 학생비번 }),
  });
  const 학생토큰 = JSON.parse(await 로그인.text()).access_token;
  if (!학생토큰) die('학생 토큰을 못 받았다');

  const 조회 = async (질의 = '', 옵션 = {}) => {
    const h = { apikey: anon, Authorization: `Bearer ${옵션.토큰 ?? 학생토큰}` };
    if (옵션.판 !== null) h['X-Contract-Ver'] = 옵션.판 ?? 판;
    const r = await fetch(`https://${ref}.supabase.co/functions/v1/${옵션.함수 ?? 'tasks'}${질의}`, {
      method: 옵션.방법 ?? 'GET', headers: h,
    });
    return { status: r.status, 몸: JSON.parse((await r.text()) || '{}') };
  };

  const t = await 조회();
  확인('학생 토큰으로 오늘 것이 1건 나온다', t.status === 200 && (t.몸.data || []).length === 1, t);
  const 읽은 = (t.몸.data || [])[0] || {};
  확인('🔴 앱이 읽은 task_id 가 배치가 쓴 그 배정이다 — 배달과 조회가 같은 행을 본다',
    읽은.task_id === A배정.event_id, [읽은.task_id, A배정 && A배정.event_id]);
  확인('🔴 앱이 읽은 문장이 배치가 쓴 그 문장이다',
    따라말하기문장(읽은.task_snapshot) === 따라말하기문장(snap), 읽은.task_snapshot);
  확인('①듣기 — intervention 이 같은 intervention_id 로 붙어 output_text 를 실어 온다',
    !!읽은.intervention && 읽은.intervention.intervention_id === A배정.intervention_id
      && 읽은.intervention.output_text === 따라말하기문장(snap), 읽은.intervention);
  /* 🔴 c9 생산자의 **유일한 재료**(절단문서 ①-2·①-12 · C0 §4-3 ①). 이 칸이 없어서
   *   `content.viewed` 는 이름·물리·검증기가 다 선 채로 생산자가 0이었다. 로컬 회귀는 함수를
   *   재고 여기서 재는 것은 **배포된 판이 실제로 그 값을 싣는가**다 — 안 실리면 증상은
   *   「열람이 한 건도 안 쌓인다」뿐이고 그건 소급이 안 된다.
   * 🔑 `intervention_id` 와 **다른 값**인지도 같이 본다. 같으면 업무 키를 사건 id 자리에 넣은
   *   것이라, 같은 개입을 두 번 내보낸 날 두 열람이 한 행으로 접힌다(그 오류는 조용하다). */
  확인('🔴 intervention.event_id = 그 배달 사건의 event_id — 앱이 parent_event_id 로 쓸 값',
    !!읽은.intervention && A개입 && 읽은.intervention.event_id === A개입.event_id
      && 읽은.intervention.event_id !== 읽은.intervention.intervention_id,
    [읽은.intervention && 읽은.intervention.event_id, A개입 && A개입.event_id]);
  확인('행의 task_format 은 비어서 온다 — 형식은 호흡 안에 있다',
    읽은.task_format === null && (읽은.task_snapshot.호흡 || []).length === 2, 읽은.task_format);
  확인('강등 여부가 그대로 전달된다', 읽은.degraded === false, 읽은.degraded);
  // 첫날인 A 는 재시도가 아니다 — 칸은 오되 값은 null(키가 아예 없으면 앱이 「구 배포」와 못 가른다).
  확인('첫날의 재발화 고리는 null 이다 — 지어내면 첫 제출이 재시도로 둔갑한다',
    'retry_of_event_id' in 읽은 && 읽은.retry_of_event_id === null, 읽은.retry_of_event_id);
  확인('하루 1건이라 next_cursor 는 null 이다', t.몸.next_cursor === null, t.몸.next_cursor);

  /* ── ②-20 정답은 학생 응답에 안 실린다 ────────────────────────────
   * 로컬 회귀는 **함수**를 재고, 이 칸이 재는 것은 **배포된 판이 그 함수를 실제로 거치는가**다.
   * 목록만 서고 호출부가 안 갈리면 회귀는 초록인데 라이브만 샌다(F179 가 겪은 거짓 초록).
   * 오늘 S1 스냅샷엔 정답 키가 없으니 **심어 주지 않으면 이 자리는 영원히 「통과」**다.
   * 🔴 기존 배정을 고쳐서는 못 잰다 — `engine.reject_original_overwrite()` 가 스냅샷 수정을
   *   막는다("그날 학생이 본 것이 증거다" · L0 §3-3). 그래서 **정답을 든 배정을 새로 넣는다**
   *   (그 트리거가 살아 있다는 것도 이 자리에서 함께 확인된 셈이다). */
  const 답날 = '2999-01-02';
  const 답스냅 = { ...오늘과제({ 날짜: 답날, 첫날: true }).task_snapshot, 정답: '먹고' };
  답스냅.호흡 = 답스냅.호흡.map((h, i) => (i === 0 ? { ...h, 정답: '가' } : h));
  await sql(`
    with ev as (
      insert into engine.learning_events
        (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
         level_snapshot, consent_ver, degraded, payload, schema_ver)
      values ('${id.A}'::uuid,'task.assigned','발화녹음','ai',
              '${답날}T04:00:00Z'::timestamptz, 'task:${id.A}:${답날}',
              'Lv2','v18.9', false, '{"ver":1}'::jsonb, '${판}')
      returning event_id)
    insert into engine.submissions (event_id, task_type, task_ref, task_snapshot, occurred_at, schema_ver)
    select event_id, '발화녹음', 'task-${답날}',
           '${JSON.stringify(답스냅).replace(/'/g, "''")}'::jsonb,
           '${답날}T04:00:00Z'::timestamptz, '${판}' from ev`);
  /* 0개 방어 — 심은 것이 실제로 DB 에 정답을 들고 앉았는지 먼저 본다. 안 그러면 아래 두 칸이
   *   「정답 없는 행을 읽고 정답이 없다」로 **공허하게 통과**한다(재는 척하는 검사가 가장 나쁘다). */
  const 심은행 = await sql(`select task_snapshot->>'정답' as 정답 from engine.submissions s
                              join engine.learning_events e on e.event_id = s.event_id
                             where e.learner_id = '${id.A}'::uuid and s.task_ref = 'task-${답날}'`);
  확인('②-20 픽스처가 DB 에 정답을 들고 앉았다 — 이게 없으면 아래 두 칸은 공허하다',
    (심은행[0] || {}).정답 === '먹고', 심은행);
  const 답판 = (((await 조회(`?date=${답날}`)).몸.data || [])[0] || {}).task_snapshot || {};
  확인('🔴 ②-20 배정에 정답이 있어도 학생 응답엔 안 실린다 — 응답이 답안지가 되지 않는다',
    Object.keys(답판).length > 0 && !JSON.stringify(답판).includes('정답'), 답판);
  확인('②-20 정답만 빠지고 나머지는 그대로다 — 과잉 차단이면 학생 화면이 빈다',
    따라말하기문장(답판) === 따라말하기문장(답스냅) && (답판.호흡 || []).length === 2, 답판);
  /* 🔑 **`data` 가 있어도 잰다.** 배정 뒤에 철회한 학생은 과제를 보면서 업로드만 막히므로,
   *   「비었을 때만」 재면 `blocked: null` 이 측정이 아니라 **추측**이 된다. */
  확인('동의가 있는 A 는 blocked 가 null 이다 — 막히지 않았음을 값으로 말한다',
    t.몸.blocked === null, t.몸.blocked);

  /* 🔴 빈 상태는 오류가 아니다 — A 는 어제 배정이 없다. 404 를 주면 앱이 오류 화면을 띄우고,
   *   그건 첫날 학생 전원에게 「고장」으로 보인다. */
  const 빈 = await 조회(`?date=${어제(오늘)}`);
  확인('🔴 어제 것이 없어도 200 + 빈 배열이다 — 404 가 아니다',
    빈.status === 200 && Array.isArray(빈.몸.data) && 빈.몸.data.length === 0, 빈);

  /* 🔴 자기 것만 — 같은 날 C·D 에게도 배정이 섰는데 A 토큰에는 안 보여야 한다.
   *   `service_role` 은 RLS 를 우회하므로 함수의 where 절이 유일한 방어선이다. */
  const C배정 = (await 행('C')).find((r) => r.event_type === 'task.assigned');
  확인('🔴 남의 배정은 안 보인다 — 학생은 토큰에서 확정되고 쿼리로 못 지정한다',
    !(t.몸.data || []).some((x) => x.task_id === C배정.event_id) && C배정.event_id !== A배정.event_id,
    (t.몸.data || []).map((x) => x.task_id));

  확인('anon 키로는 못 읽는다 — 사람이 아니다', (await 조회('', { 토큰: anon })).status === 401);
  확인('헤더가 없으면 400 이다', (await 조회('', { 판: null })).status === 400);
  확인('DB 보다 새 판을 말하면 426 이다', (await 조회('', { 판: 'c999' })).status === 426);
  확인('🔴 date 가 날짜꼴이 아니면 400 이다 — 500 이면 앱이 영구 오류를 무한 재시도한다',
    (await 조회('?date=어제')).status === 400, (await 조회('?date=어제')).몸);
  확인('POST 는 405 다 — 조회가 쓰기를 겸하지 않는다', (await 조회('', { 방법: 'POST' })).status === 405);

  /* 🔴 **동의 없는 학생의 빈 화면에 이유가 붙는가** (F176 ①).
   *   `data: []` 의 원인은 셋(첫날·배치 실패·동의 없음)인데 응답이 하나면 앱은 전부에 대해
   *   「오늘 받은 과제가 아직 없어요」만 말하고, 막힌 학생은 며칠이든 기다린다.
   *   같은 토큰을 B 에게 옮겨 붙여 잰다 — 학생은 토큰에서 확정되므로 이게 곧 「B 로 로그인」이다. */
  await sql(`update engine.learners set auth_user_id = null where auth_user_id = '${uid}'`);
  await sql(`update engine.learners set auth_user_id = '${uid}' where learner_id = '${id.B}'::uuid`);
  const 막힌 = await 조회();
  확인('🔴 동의 없는 B 는 빈 배열 + 이유(blocked)가 함께 온다 — 「배치가 안 돈 날」과 구별된다',
    막힌.status === 200 && (막힌.몸.data || []).length === 0
      && 막힌.몸.blocked && 막힌.몸.blocked.code === 'CONSENT_MISSING', 막힌.몸);
  확인('🔴 막혀도 200 이다 — 4xx 를 주면 앱이 「고장」 화면을 띄우고 학생은 이유를 못 듣는다',
    막힌.status === 200, 막힌.status);
  /* 🔴 **결과 변수가 화면까지 닿는가** — 같은 토큰을 D 에게 옮겨 붙여 잰다(위 B 와 같은 수).
   *   D 는 교정문 날이라 배정 행이 원 제출 사건을 들고 있다. 앱은 이 값을 제출 사건의
   *   `retry_of_event_id` 로 되돌려 싣는다 — 응답에서 빠지면 앱은 채울 재료가 없고, 증상은
   *   「결과축이 늘 비어 있다」뿐이라 「아직 재제출한 학생이 없다」와 구분되지 않는다. */
  await sql(`update engine.learners set auth_user_id = null where auth_user_id = '${uid}'`);
  await sql(`update engine.learners set auth_user_id = '${uid}' where learner_id = '${id.D}'::uuid`);
  const D읽은 = ((await 조회()).몸.data || [])[0];
  확인('🔴 /tasks 가 재발화 고리를 실어 보낸다 — 앱이 결과 변수를 채울 유일한 재료',
    !!D읽은 && D읽은.retry_of_event_id === D원제출, [D읽은 && D읽은.retry_of_event_id, D원제출]);
  확인('교정문 날의 ②슬롯이 그 교정문이다 — 고리와 문장이 같은 행에서 나온다',
    !!D읽은 && 따라말하기문장(D읽은.task_snapshot) === '어제 친구를 만나서 밥을 먹었어요',
    D읽은 && D읽은.task_snapshot);

  /* A 로 되돌린다 — 아래 ⑨ 가 같은 토큰으로 A 의 교정을 읽는다. 안 되돌리면 그쪽이 빈 채로 돈다. */
  await sql(`update engine.learners set auth_user_id = null where auth_user_id = '${uid}'`);
  await sql(`update engine.learners set auth_user_id = '${uid}' where learner_id = '${id.A}'::uuid`);
  확인('되돌림 확인 — 토큰이 다시 A 를 가리킨다', ((await 조회()).몸.data || []).length === 1);

  /* ── ⑨ 교정 조회 (C0 §4-3 ②) ─────────────────────────────────────
   * c8 이 `correction_id` 를 깔았지만 **교정을 꺼내 보여주는 통로**가 없어 앱은 자기가 받은
   * 교정의 id 를 알 길이 없었다 — 모르면 `correction.viewed` 를 못 보내고, 그건 S1-8
   * 「학습이 일어났다」의 **유일한 직접 신호**다. 그 통로가 서는지를 여기서 잰다. */
  console.log('\n■ ⑨ 교정 조회 — GET /v1/corrections');

  const A제출 = (await sql(`
    select s.submission_id from engine.submissions s
      join engine.learning_events e on e.event_id = s.event_id
     where e.learner_id = '${id.A}'::uuid order by s.occurred_at limit 1`))[0].submission_id;

  /* 22 건을 심는다 — 쪽크기(20)를 **넘겨야** 커서가 실제로 선다. 안 넘기면 `next_cursor` 는
   * 언제나 null 이라 「커서가 있다」는 초록이 **미실행과 같은 모양**이 된다. */
  /* 🔴 **2·3 번을 같은 시각에 겹쳐 둔다 — 그 둘이 정확히 쪽 경계에 선다.**
   *   전부 다른 시각이면 커서가 `created_at` 하나뿐이어도 두 쪽이 멀쩡히 이어져서,
   *   아래 「겹치지도 빠뜨리지도 않는다」가 **자기가 말하는 것을 못 재는 초록**이 된다.
   *   겹쳐 두면 시각만 쓰는 커서는 경계의 한 건을 건너뛰고 총계가 22 에서 어긋난다. */
  await sql(`
    insert into engine.corrections (submission_id, actor_kind, corrected_text, error_tags, created_at, schema_ver)
    select '${A제출}'::uuid, 'ai', '고친 문장 ' || g, '{"조사:주격(이/가·은/는)"}'::text[],
           '${어제날}T10:00:00Z'::timestamptz
             + ((case when g = 2 then 3 else g end) || ' minutes')::interval, '${판}'
      from generate_series(1, 21) g`);
  /* 뒤엣것은 **보여줄 것이 없는 행**이다(강사가 판정만 남긴 골든셋 행의 모양). 일부러 **가장
   * 최근**으로 심는다 — 필터가 죽으면 맨 앞에 빈 카드로 튀어나와 아래 정렬 검사까지 함께 빨개진다. */
  await sql(`
    insert into engine.corrections (submission_id, actor_kind, corrected_text, error_tags, created_at, schema_ver)
    values ('${A제출}'::uuid, 'teacher', '강사가 고친 문장', '{}'::text[],
            '${어제날}T12:00:00Z'::timestamptz, '${판}'),
           ('${A제출}'::uuid, 'ai', null, '{}'::text[],
            '${어제날}T13:00:00Z'::timestamptz, '${판}')`);

  const c1 = await 조회('', { 함수: 'corrections' });
  확인('학생 토큰으로 내 교정이 한 쪽(20건) 나온다',
    c1.status === 200 && (c1.몸.data || []).length === 20, c1.status);
  const 첫 = (c1.몸.data || [])[0] || {};
  확인('🔴 정렬은 확정 시각 내림차순 — 가장 최근 교정이 맨 앞이다',
    첫.actor_kind === 'teacher' && 첫.corrected_text === '강사가 고친 문장', 첫);
  확인('🔑 confirmed_at 은 새 열이 아니라 created_at 그대로다 — corrections 는 생성 후 불변',
    new Date(첫.confirmed_at).toISOString() === new Date(`${어제날}T12:00:00Z`).toISOString(), 첫.confirmed_at);
  확인('원 제출을 가리키는 submission_id 가 실려 온다 — 어느 발화의 교정인지',
    첫.submission_id === A제출, 첫.submission_id);
  확인('error_tags 는 배열 그대로 온다',
    Array.isArray(첫.error_tags) && ((c1.몸.data || [])[1] || {}).error_tags?.[0] === '조사:주격(이/가·은/는)',
    (c1.몸.data || [])[1]);
  확인('🔴 빈 카드가 될 행은 목록에 없다 — 계약이 빈 상태에 대해 금지한 그 모양이다',
    !(c1.몸.data || []).some((x) => !x.corrected_text && (x.error_tags || []).length === 0), c1.몸.data);

  확인('한 쪽을 넘기면 next_cursor 가 선다', typeof c1.몸.next_cursor === 'string', c1.몸.next_cursor);
  const c2 = await 조회(`?since=${encodeURIComponent(c1.몸.next_cursor)}`, { 함수: 'corrections' });
  확인('커서를 실으면 다음 쪽이 이어진다 — 남은 2건',
    c2.status === 200 && (c2.몸.data || []).length === 2, c2.status);
  const ids1 = new Set((c1.몸.data || []).map((x) => x.correction_id));
  확인('🔴 두 쪽이 겹치지도 빠뜨리지도 않는다 — 커서가 시각뿐이면 같은 밀리초에서 한 건이 샌다',
    !(c2.몸.data || []).some((x) => ids1.has(x.correction_id))
      && ids1.size + (c2.몸.data || []).length === 22, [ids1.size, (c2.몸.data || []).length]);
  확인('마지막 쪽의 next_cursor 는 null 이다', c2.몸.next_cursor === null, c2.몸.next_cursor);

  /* 🔴 빈 상태는 오류가 아니다(C0 §4-3 공통) — 더 오래된 것이 없는 커서는 200 + 빈 배열이다. */
  const 끝쪽 = (c2.몸.data || [])[(c2.몸.data || []).length - 1] || {};
  const 빈교정 = await 조회(
    `?since=${encodeURIComponent(`${new Date(끝쪽.confirmed_at).toISOString()}|${끝쪽.correction_id}`)}`,
    { 함수: 'corrections' });
  확인('🔴 더 볼 것이 없어도 200 + 빈 배열이다 — 404 가 아니다',
    빈교정.status === 200 && Array.isArray(빈교정.몸.data) && 빈교정.몸.data.length === 0, 빈교정);

  /* 🔴 자기 것만 — D 에게도 교정이 있는데(위 준비) A 토큰에는 안 보여야 한다.
   *   `service_role` 은 RLS 를 우회하므로 함수가 걷는 사슬이 유일한 방어선이다. */
  const D교정 = (await sql(`
    select c.correction_id from engine.corrections c
      join engine.submissions s on s.submission_id = c.submission_id
      join engine.learning_events e on e.event_id = s.event_id
     where e.learner_id = '${id.D}'::uuid limit 1`))[0];
  확인('🔴 남의 교정은 안 보인다 — 학생은 토큰에서 확정되고 쿼리로 못 지정한다',
    !!D교정 && !ids1.has(D교정.correction_id)
      && !(c2.몸.data || []).some((x) => x.correction_id === D교정.correction_id), D교정);

  확인('anon 키로는 못 읽는다 — 사람이 아니다',
    (await 조회('', { 함수: 'corrections', 토큰: anon })).status === 401);
  확인('헤더가 없으면 400 이다', (await 조회('', { 함수: 'corrections', 판: null })).status === 400);
  확인('DB 보다 새 판을 말하면 426 이다', (await 조회('', { 함수: 'corrections', 판: 'c999' })).status === 426);
  확인('🔴 since 가 커서꼴이 아니면 400 이다 — 500 이면 앱이 영구 오류를 무한 재시도한다',
    (await 조회('?since=어제', { 함수: 'corrections' })).status === 400,
    (await 조회('?since=어제', { 함수: 'corrections' })).몸);
  확인('POST 는 405 다 — 조회가 쓰기를 겸하지 않는다',
    (await 조회('', { 함수: 'corrections', 방법: 'POST' })).status === 405);
  확인('없는 뒷마디는 404 다 — 오타 경로가 「이미 돌던 것」이 되지 않는다',
    (await 조회('/아무거나', { 함수: 'corrections' })).status === 404);

  /* ── ⑩ 어제의 나 (C0 §4-3 ③) ────────────────────────────────────
   * S1 조회 3종의 **마지막 칸**. 여기서 재는 것은 「숫자가 나온다」가 아니라 **어느 행을 세는가**다 —
   * `submissions` 에는 배정 행이 살아서(P0 §6-1), 그걸 세면 배정 1건이 제출 1건이 되고
   * **첫날부터 「어제의 나」가 거짓말**을 한다. 증상은 「숫자가 좀 크다」뿐이라 아무도 못 본다. */
  console.log('\n■ ⑩ 어제의 나 — GET /v1/progress');

  /* 🔴 **빈 상태를 먼저** 잰다 — 지금 A 의 사건은 오늘 배정뿐이라 「어제」라는 시점이 없다.
   *   아래에서 어제 사건을 심고 나면 이 상태는 다시 못 만든다(append-only). */
  const g0 = await 조회('', { 함수: 'progress' });
  확인('🔴 어제가 없는 학생은 200 + 빈 배열이다 — 없는 과거를 0 으로 지어내지 않는다',
    g0.status === 200 && Array.isArray(g0.몸.data) && g0.몸.data.length === 0, g0);

  /* A 에게 어제 1건·오늘 3건. 오늘 배정(+개입)은 이미 서 있고, 그것이 제출로 안 세어지는 것이
   * 이 갈래의 본론이다. 어제 것의 `attempt_no` 는 **일부러 숫자가 아니다** — payload 는 자유
   * JSON 이라 바로 `::int` 로 캐스팅하면 행 하나가 조회 전체를 500 으로 만든다. */
  const 어제제출 = (await sql(`
    insert into engine.learning_events
      (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
       level_snapshot, consent_ver, degraded, payload, schema_ver)
    values ('${id.A}'::uuid,'submission.created','발화녹음','learner',
            '${어제날}T05:00:00Z'::timestamptz,'sub:${표}:A:1','Lv2','v18.9', false,
            '{"ver":1,"attempt_no":"많이"}'::jsonb,'${판}')
    returning event_id`))[0].event_id;

  await sql(`
    insert into engine.learning_events
      (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
       level_snapshot, consent_ver, degraded, payload, retry_of_event_id, schema_ver)
    values ('${id.A}'::uuid,'submission.created','발화녹음','learner','${오늘}T05:00:00Z'::timestamptz,
            'sub:${표}:A:2','Lv2','v18.9', false,'{"ver":1,"attempt_no":1}'::jsonb, null,'${판}'),
           ('${id.A}'::uuid,'submission.created','발화녹음','learner','${오늘}T05:10:00Z'::timestamptz,
            'sub:${표}:A:3','Lv2','v18.9', false,'{"ver":1,"attempt_no":3}'::jsonb, null,'${판}'),
           ('${id.A}'::uuid,'submission.created','발화녹음','learner','${오늘}T05:20:00Z'::timestamptz,
            'sub:${표}:A:4','Lv2','v18.9', false,'{"ver":1,"attempt_no":1}'::jsonb,
            '${어제제출}'::uuid,'${판}')`);

  const g1 = await 조회('', { 함수: 'progress' });
  확인('어제가 생기면 비교값이 1건 온다',
    g1.status === 200 && (g1.몸.data || []).length === 1, g1.status);
  const 오늘값 = ((g1.몸.data || [])[0] || {}).today || {};
  const 어제값 = ((g1.몸.data || [])[0] || {}).yesterday || {};

  const [{ 오늘사건 }] = await sql(`
    select count(*) as 오늘사건 from engine.learning_events
     where learner_id = '${id.A}'::uuid
       and (occurred_at at time zone 'Asia/Ulaanbaatar')::date = '${오늘}'::date`);
  확인(`🔴 배정·개입이 제출로 안 세어진다 — 오늘 사건 ${오늘사건}건 중 제출은 3건이다`,
    Number(오늘사건) > 3 && 오늘값.submission_count === 3, [오늘사건, 오늘값]);
  확인('재시도는 attempt_no >= 2 인 것만 — 한 과제 안의 반복이다',
    오늘값.retry_count === 1, 오늘값);
  확인('🔴 교정 재발화는 retry_of_event_id 가 달린 제출 — 지금 설계의 결과 변수는 이것 하나뿐이다',
    오늘값.correction_retry === true, 오늘값);
  확인('🔴 attempt_no 가 숫자꼴이 아니면 첫 시도로 본다 — 캐스팅하면 그 행이 조회 전체를 500 으로 만든다',
    어제값.submission_count === 1 && 어제값.retry_count === 0, 어제값);
  확인('교정 재발화는 날마다 따로 판정한다 — 어제는 없었다',
    어제값.correction_retry === false, 어제값);

  /* 🔴 자기 것만 — D 가 오늘 낸 것이 A 의 숫자를 밀어 올리면 안 된다. */
  await sql(`
    insert into engine.learning_events
      (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
       level_snapshot, consent_ver, degraded, payload, schema_ver)
    values ('${id.D}'::uuid,'submission.created','발화녹음','learner','${오늘}T06:00:00Z'::timestamptz,
            'sub:${표}:D:1','Lv2','v18.9', false,'{"ver":1,"attempt_no":1}'::jsonb,'${판}')`);
  const g2 = await 조회('', { 함수: 'progress' });
  확인('🔴 남의 제출은 안 세어진다 — 학생은 토큰에서 확정되고 쿼리로 못 지정한다',
    (((g2.몸.data || [])[0] || {}).today || {}).submission_count === 3, g2.몸.data);

  확인('anon 키로는 못 읽는다 — 사람이 아니다',
    (await 조회('', { 함수: 'progress', 토큰: anon })).status === 401);
  확인('헤더가 없으면 400 이다', (await 조회('', { 함수: 'progress', 판: null })).status === 400);
  확인('DB 보다 새 판을 말하면 426 이다', (await 조회('', { 함수: 'progress', 판: 'c999' })).status === 426);
  확인('POST 는 405 다 — 조회가 쓰기를 겸하지 않는다',
    (await 조회('', { 함수: 'progress', 방법: 'POST' })).status === 405);
  확인('없는 뒷마디는 404 다 — 오타 경로가 「이미 돌던 것」이 되지 않는다',
    (await 조회('/아무거나', { 함수: 'progress' })).status === 404);

  /* ── ⑪ 배치 미달을 **누가 보나** (P0 §6-5) ──────────────────────────────
   * ⑦ 이 「미달을 센다」를 쟀다면 여기는 **그 값이 사람에게 닿는가**다. 계약이 정한 수신자는
   * 유호님 한 명이고 통로는 원장 화면 하나인데, 앱 토큰은 절대 `service_role` 이 아니라
   * 열지 않으면 미달은 영원히 함수 로그에만 뜬다(= 보는 눈 0).
   * 🔴 여는 것과 **같은 실행에서 배달(쓰기)이 안 열렸는지**를 잰다. 둘을 가르는 것은 조건
   *   한 칸이고 새는 방향은 언제나 「통과」다 — 코드 독해로는 그 칸이 **있는지**만 보이고,
   *   배포된 판이 실제로 그렇게 답하는지는 이 자리에서만 나온다. */
  console.log('\n■ ⑪ 미달을 누가 보나 — POST /deliver?점검 (P0 §6-5)');
  const 점검질의 = `?${encodeURIComponent('점검')}`;
  const 학생점검 = await 조회(점검질의, { 함수: 'deliver', 방법: 'POST', 판: null });
  확인('🔴 학생 토큰은 점검을 못 본다 — 재적·배정 수는 학생에게 줄 값이 아니다',
    학생점검.status === 401, 학생점검);
  확인('🔴 배달(쓰기)은 앱 토큰에 안 열린다 — 「점검일 때만」 이라는 조건이 실제로 걸려 있다',
    (await 조회('', { 함수: 'deliver', 방법: 'POST', 판: null })).status === 401);

  /* 원장 계정 — 이 통로의 전부는 `engine.staff` 의 `role='director'` 한 칸이다(판정 정본 =
   * `engine.current_staff()` · 폐기까지 그 함수가 본다). 계정은 **재사용**한다 — 회차마다
   * 새로 만들면 `auth.users` 가 회차 수만큼 쌓인다(학생 계정과 같은 규칙). */
  const 원장이메일 = `probe-director${도메인}`;
  const 원장비번 = 'Director-Rehearsal-1';
  let duid = (await sql(`select id from auth.users where email='${원장이메일}'`))[0]?.id;
  if (!duid) {
    const cr = await 유저('admin/users', 'POST', { email: 원장이메일, password: 원장비번, email_confirm: true });
    duid = cr.ok ? JSON.parse(await cr.text()).id : (await sql(`select id from auth.users where email='${원장이메일}'`))[0]?.id;
  } else {
    await 유저(`admin/users/${duid}`, 'PUT', { password: 원장비번 });
  }
  if (!duid) die('시험용 원장 계정을 못 만들었다');
  await sql(`
    insert into engine.staff (auth_user_id, role, display_name)
    values ('${duid}'::uuid, 'director', '리허설 원장')
    on conflict (auth_user_id) do update
      set role = 'director', active = true, revoked_before = null`);

  const 원장로그인 = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 원장이메일, password: 원장비번 }),
  });
  const 원장토큰 = JSON.parse(await 원장로그인.text()).access_token;
  if (!원장토큰) die('원장 토큰을 못 받았다');

  const 원장점검 = await 조회(점검질의, { 함수: 'deliver', 방법: 'POST', 판: null, 토큰: 원장토큰 });
  확인('🔴 원장은 미달을 본다 — 이 칸이 없으면 배치가 죽은 날과 안 죽은 날이 같은 모양이다',
    원장점검.status === 200 && 원장점검.몸.mode === '점검' && Number(원장점검.몸.재적) > 0, 원장점검.몸);
  확인('그 답이 앱이 그릴 세 값을 다 싣는다 — 날짜·배정·재적',
    !!원장점검.몸.date && Number.isFinite(Number(원장점검.몸.배정))
      && Number.isFinite(Number(원장점검.몸.재적)), 원장점검.몸);
  확인('🔴 B·D 가 못 받았으므로 미달이 참이고, 그 값이 그대로 원장 화면에 선다',
    원장점검.몸.미달 === true && Number(원장점검.몸.배정) < Number(원장점검.몸.재적), 원장점검.몸);
  확인('🔴 원장도 배달은 못 돌린다 — 열린 것은 읽기 한 칸뿐이다',
    (await 조회('', { 함수: 'deliver', 방법: 'POST', 판: null, 토큰: 원장토큰 })).status === 401);

  /* 🔑 해임·폐기가 이 통로에도 걸리는가 — `current_staff()` 안에 있으니 걸려야 한다.
   *   안 걸리면 나간 직원의 폰이 학원 재적 수를 계속 읽는다(그 상태는 아무 증상이 없다). */
  await sql(`update engine.staff set active = false where auth_user_id = '${duid}'::uuid`);
  확인('🔴 해임되면 그 순간 못 본다 — 폐기 판정은 이 통로가 따로 안 적고 정본을 지난다',
    (await 조회(점검질의, { 함수: 'deliver', 방법: 'POST', 판: null, 토큰: 원장토큰 })).status === 401);
  await sql(`update engine.staff set active = true where auth_user_id = '${duid}'::uuid`);

  보고();
}

main().catch((e) => die(String((e && e.message) || e)));
