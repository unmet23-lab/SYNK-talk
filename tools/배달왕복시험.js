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
const API = 'https://api.supabase.com/v1/projects';
const die = (m) => { console.error('[배달왕복시험] ' + m); process.exit(1); };

const 자격증명 = require(path.join(__dirname, '..', 'lib', '자격증명.js'));
const { 오늘과제, 몽골날짜, 따라말하기문장 } = require(path.join(__dirname, '..', 'lib', '오늘과제.js'));

let 통과 = 0, 실패 = 0;
function 확인(이름, 조건, 실제) {
  if (조건) { 통과++; console.log(`  ✅ ${이름}`); }
  else { 실패++; console.log(`  ❌ ${이름}\n     실제: ${JSON.stringify(실제)}`); }
}

/* 어제 배정을 손으로 심는다 — 「첫날이 아닌 학생」은 그렇게만 만들어진다.
 * 배치를 어제 한 번 돌리는 것으로는 못 만든다(그날 날짜로 돌 뿐이다). */
const 어제 = (오늘) => {
  const d = new Date(`${오늘}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const e = 자격증명.읽기('배달왕복시험');
  const 토큰 = e.SUPABASE_ACCESS_TOKEN, ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const M = { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' };

  const pr = await fetch(`${API}/${ref}`, { headers: M });
  const 이름 = pr.ok ? JSON.parse(await pr.text()).name : '(모름)';
  console.log(`[배달왕복시험] 대상 ▸ ${이름}  (${ref})\n`);
  if (!/rehearsal/i.test(이름)) {
    die(`「${이름}」 은 리허설이 아니다 — 이 시험은 지울 수 없는 행을 남긴다.`);
  }

  const sql = async (q) => {
    const r = await fetch(`${API}/${ref}/database/query`, { method: 'POST', headers: M, body: JSON.stringify({ query: q }) });
    const t = await r.text();
    if (!r.ok) throw new Error(`SQL HTTP ${r.status} ${t.slice(0, 400)}`);
    return JSON.parse(t);
  };

  const kr = await fetch(`${API}/${ref}/api-keys`, { headers: M });
  const 키들 = JSON.parse(await kr.text());
  const service = (키들.find((k) => k.name === 'service_role') || {}).api_key;
  if (!service) die('service_role 키를 못 읽었다');

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

  /* D 의 교정 — 어제 배정 **뒤에** 확정됐다. 「지난 배정 뒤에 새로 확정된 것만」이 조건이라
   * 이 시각이 배정보다 앞서면 ②슬롯에 안 와야 한다(그 경계도 아래에서 잰다). */
  await sql(`
    with s as (
      select s.submission_id from engine.submissions s
        join engine.learning_events e on e.event_id = s.event_id
       where e.learner_id = '${id.D}'::uuid limit 1)
    insert into engine.corrections (submission_id, actor_kind, corrected_text, created_at, schema_ver)
    select submission_id, 'teacher', '어제 친구를 만나서 밥을 먹었어요',
           '${어제날}T09:00:00Z'::timestamptz, '${판}' from s`);
  console.log(`  준비 완료 — 표식 ${표} · 오늘 ${오늘} · 판 ${판}\n`);

  /* ── ① 문 ──────────────────────────────────────────────────── */
  console.log('■ ① 호출자');
  const anon = (키들.find((k) => k.name === 'anon') || {}).api_key;
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

  const 행 = async (k) => (await sql(`
    select e.event_type, e.actor_kind, e.degraded, e.intervention_id, e.idempotency_key,
           e.payload, s.task_snapshot, s.task_format, s.task_ref
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
  확인('호흡마다 형식이 갈려 있다(낭독·자유발화)',
    !!snap && snap.호흡[0].task_format === '낭독' && snap.호흡[1].task_format === '자유발화',
    snap && snap.호흡.map((h) => h.task_format));
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

  console.log(`\n[배달왕복시험] ${통과}/${통과 + 실패} 통과`);
  process.exit(실패 ? 1 : 0);
}

main().catch((e) => die(String((e && e.message) || e)));
