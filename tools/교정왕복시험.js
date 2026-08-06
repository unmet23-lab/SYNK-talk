#!/usr/bin/env node
'use strict';
/**
 * 교정왕복시험 — c8(P0 §10-A-11 · 교정 참조 이름)의 보증을 **실제 DB 왕복으로** 증명한다.
 *
 *   SUPABASE_PROJECT_REF=<리허설ref> node tools/교정왕복시험.js
 *
 * ■ 왜 필요한가
 *   c8이 낸 것은 열 하나가 아니라 **거절 두 개**다 — CHECK(자리를 비워 두지 않는다)와
 *   트리거(다른 학생의 교정을 가리킬 수 없다). 둘 다 **깨져도 증상이 조용하다**:
 *   · CHECK가 안 서면 `correction.viewed`가 correction_id 없이 쌓이고, 그 행은 나중에
 *     어느 교정이었는지 **복원되지 않는다**(S1-8은 「학습이 일어났다」의 유일한 직접 신호다).
 *   · 트리거가 안 서면 A의 열람 사건이 B의 교정을 가리키고, 그건 오답이 아니라 **오귀속**이다.
 *   파일 층의 초록(회귀 251/251)은 「그렇게 적었다」까지만 증명한다 — 서는지는 여기서 잰다.
 *
 * ■ 🔴 리허설 전용
 *   `learning_events`는 append-only(트리거 `learning_events_immutable`)라 여기서 만든 행은
 *   **지워지지 않는다**. 프로젝트 이름에 `rehearsal`이 없으면 거부한다 — 막히는 방향이 안전하다.
 *
 * ■ 🔑 먼저 c8이 **실제로 서 있는지**부터 잰다(⓪).
 *   안 서 있으면 ②③은 「거절이 안 났다」가 아니라 「열이 없어서 SQL이 깨졌다」로 나오고,
 *   그 둘은 로그에서 구분이 안 된다. 조용한 미적용을 통과로 읽지 않기 위한 자리다.
 */
const path = require('path');
const API = 'https://api.supabase.com/v1/projects';
const die = (m) => { console.error('[교정왕복시험] ' + m); process.exit(1); };

const 자격증명 = require(path.join(__dirname, '..', 'lib', '자격증명.js'));

let 통과 = 0, 실패 = 0;
function 확인(이름, 조건, 실제) {
  if (조건) { 통과++; console.log(`  ✅ ${이름}`); }
  else { 실패++; console.log(`  ❌ ${이름}\n     실제: ${JSON.stringify(실제)}`); }
}

async function main() {
  const e = 자격증명.읽기('교정왕복시험');
  const 토큰 = e.SUPABASE_ACCESS_TOKEN, ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const M = { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' };

  const pr = await fetch(`${API}/${ref}`, { headers: M });
  const 이름 = pr.ok ? JSON.parse(await pr.text()).name : '(모름)';
  console.log(`[교정왕복시험] 대상 ▸ ${이름}  (${ref})\n`);
  if (!/rehearsal/i.test(이름)) {
    die(`「${이름}」 은 리허설이 아니다 — 이 시험은 지울 수 없는 행을 남긴다.`);
  }

  /* 실행 — **거절도 결과다.** 던지지 않고 {ok, 메시지}로 돌려준다.
   * 이 시험의 절반은 「안 들어가는 것」을 증명하는 것이라, 실패를 예외로 처리하면 그 절반을 못 쓴다. */
  const 실행 = async (q) => {
    const r = await fetch(`${API}/${ref}/database/query`, {
      method: 'POST', headers: M, body: JSON.stringify({ query: q }),
    });
    const t = await r.text();
    if (!r.ok) return { ok: false, 메시지: t };
    return { ok: true, 행: JSON.parse(t) };
  };
  const sql = async (q) => {
    const r = await 실행(q);
    if (!r.ok) throw new Error(`SQL 실패 — ${r.메시지.slice(0, 400)}\n  질의: ${q.slice(0, 200)}`);
    return r.행;
  };

  /* ── ⓪ 판이 실제로 서 있는가 ─────────────────────────────────── */
  console.log('■ ⓪ c8 물리');
  const [물리] = await sql(`
    select (select count(*) from information_schema.columns
             where table_schema='engine' and table_name='learning_events'
               and column_name='correction_id') as 열,
           (select count(*) from pg_constraint
             where connamespace=to_regnamespace('engine')
               and conname in ('learning_events_correction_target_c8',
                               'learning_events_correction_id_fkey')) as 제약,
           (select count(*) from pg_trigger g join pg_class r on r.oid=g.tgrelid
             where r.relnamespace=to_regnamespace('engine')
               and g.tgname='learning_events_correction_same_learner'
               and g.tgenabled <> 'D') as 트리거`);
  확인('열 1 · 제약 2 · 트리거 1(꺼짐 아님)이 서 있다',
    Number(물리.열) === 1 && Number(물리.제약) === 2 && Number(물리.트리거) === 1, 물리);
  if (실패) die('c8 이 안 선 DB 다 — 아래 갈래는 「거절」과 「깨짐」을 구분 못 하므로 여기서 멈춘다.');

  /* ── 준비: 학생 둘, 각자 자기 교정 1건 ──────────────────────────
   * B가 있어야 ③(교차 학생)이 성립한다 — 없는 uuid 를 지목하는 것과는 다른 사고다. */
  const 표 = `x${Date.now().toString(36)}`;
  const 판 = (await sql(`select name from engine.schema_migrations order by version desc limit 1`))[0]
    .name.match(/_(c\d+)\.sql$/)[1];
  console.log(`\n■ 준비 — 학생 2명 · 표식 ${표} · 판 ${판}`);

  const 학생들 = await sql(`
    insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver)
    values ('${표}-A','시험A','Lv2','study','${판}'), ('${표}-B','시험B','Lv2','study','${판}')
    returning learner_id, student_code`);
  const id = Object.fromEntries(학생들.map((r) => [r.student_code.slice(-1), r.learner_id]));

  const 교정만들기 = async (k) => (await sql(`
    with ev as (
      insert into engine.learning_events
        (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
         level_snapshot, consent_ver, degraded, payload, schema_ver)
      values ('${id[k]}'::uuid,'submission.created','발화녹음','learner', now(),
              'sub:${표}:${k}', 'Lv2','v18.9', false, '{"ver":1}'::jsonb, '${판}')
      returning event_id),
    sb as (
      insert into engine.submissions (event_id, task_type, task_ref, occurred_at, schema_ver)
      select event_id, '발화녹음', 'task-${표}', now(), '${판}' from ev
      returning submission_id)
    insert into engine.corrections (submission_id, actor_kind, corrected_text, schema_ver)
    select submission_id, 'teacher', '어제 친구를 만나서 밥을 먹었어요', '${판}' from sb
    returning correction_id`))[0].correction_id;

  const 교정 = { A: await 교정만들기('A'), B: await 교정만들기('B') };
  console.log(`  준비 완료 — A교정 ${교정.A.slice(0, 8)}… · B교정 ${교정.B.slice(0, 8)}…`);

  /** 열람·응답 사건 한 건. `지목`이 null 이면 correction_id 를 아예 안 넣는다(②의 모양). */
  const 사건 = (학생, 종류, 지목, 키) => `
    insert into engine.learning_events
      (learner_id, event_type, actor_kind, occurred_at, idempotency_key,
       level_snapshot, consent_ver, degraded, payload, schema_ver${지목 ? ', correction_id' : ''})
    values ('${id[학생]}'::uuid,'${종류}','learner', now(), '${키}',
            'Lv2','v18.9', false, '{"ver":1}'::jsonb, '${판}'${지목 ? `, '${지목}'::uuid` : ''})
    returning event_id, correction_id`;

  /* ── ① 정상 ─────────────────────────────────────────────────── */
  console.log('\n■ ① 정상 — 자기 교정을 지목한다');
  const r1 = await 실행(사건('A', 'correction.viewed', 교정.A, `view:${표}`));
  확인('correction.viewed 가 들어간다', r1.ok, r1.메시지 && r1.메시지.slice(0, 200));
  확인('행에 correction_id 가 그대로 남는다 — 나중에 어느 교정이었는지 복원된다',
    r1.ok && r1.행[0].correction_id === 교정.A, r1.ok && r1.행[0]);

  const r1b = await 실행(사건('A', 'correction.responded', 교정.A, `resp:${표}`));
  확인('correction.responded 도 같은 자리를 쓴다 — 두 사건 다 c8 의 대상이다', r1b.ok,
    r1b.메시지 && r1b.메시지.slice(0, 200));

  /* ── ② 누락 ─────────────────────────────────────────────────── */
  console.log('\n■ ② 누락 — 지목 없이 열람했다고 한다');
  const r2 = await 실행(사건('A', 'correction.viewed', null, `view-null:${표}`));
  확인('거절된다 — 「있어도 되고 없어도 되는 칸」이 아니다', !r2.ok, r2.ok && r2.행);
  확인('거절한 것은 CHECK `learning_events_correction_target_c8` 다',
    !r2.ok && /learning_events_correction_target_c8/.test(r2.메시지), r2.메시지 && r2.메시지.slice(0, 300));

  /* ── ③ 타 학생 지목 ──────────────────────────────────────────── */
  console.log('\n■ ③ 교차 — A 가 B 의 교정을 지목한다');
  const r3 = await 실행(사건('A', 'correction.viewed', 교정.B, `view-cross:${표}`));
  확인('거절된다 — service_role 은 RLS 를 우회하므로 정책이 아니라 트리거가 막아야 한다', !r3.ok,
    r3.ok && r3.행);
  확인('거절한 것은 트리거다(사슬을 걷는다 · 복합 FK 아님)',
    !r3.ok && /다른 학생의 교정/.test(r3.메시지), r3.메시지 && r3.메시지.slice(0, 300));

  /* ── ④ 나머지 금지 ──────────────────────────────────────────────
   * CHECK 의 else 갈래. 이쪽이 새면 엉뚱한 사건에 붙은 값이 집계에서 조용히 섞인다. */
  console.log('\n■ ④ 반대 방향 — 교정 사건이 아닌데 지목한다');
  const r4 = await 실행(사건('A', 'submission.created', 교정.A, `sub-x:${표}`));
  확인('거절된다 — 두 사건 밖에서는 반드시 비어 있어야 한다', !r4.ok, r4.ok && r4.행);
  확인('같은 CHECK 가 양쪽을 다 진다',
    !r4.ok && /learning_events_correction_target_c8/.test(r4.메시지), r4.메시지 && r4.메시지.slice(0, 300));

  /* ── ⑤ 없는 교정 ─────────────────────────────────────────────── */
  console.log('\n■ ⑤ 실재 — 없는 교정을 지목한다');
  const r5 = await 실행(사건('A', 'correction.viewed', '00000000-0000-4000-8000-000000000000', `view-ghost:${표}`));
  확인('거절된다 — 가리키는 대상이 실재해야 한다(트리거가 FK 보다 먼저 선다)', !r5.ok, r5.ok && r5.행);

  /* ── ⑥ 사슬 되짚기 ───────────────────────────────────────────── */
  console.log('\n■ ⑥ 교정 단위 판정이 실제로 된다');
  const [{ 열람 }] = await sql(`
    select count(*) as 열람 from engine.learning_events
     where correction_id = '${교정.A}'::uuid and event_type in ('correction.viewed','correction.responded')`);
  확인('교정 1건에 달린 열람·응답이 2건으로 세어진다 — A-11 이 열려던 바로 그 질의',
    Number(열람) === 2, 열람);

  console.log(`\n[교정왕복시험] ${통과}/${통과 + 실패} 통과`);
  process.exit(실패 ? 1 : 0);
}

main().catch((e) => die(String((e && e.message) || e)));
