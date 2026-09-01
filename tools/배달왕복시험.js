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
const { 오늘과제, 몽골날짜, 따라말하기문장, 시간대 } = require(path.join(__dirname, '..', 'lib', '오늘과제.js'));
// 합성 도메인은 정본에서 가져온다 — 여기 박으면 도메인이 바뀌는 날 조용히 갈린다.
const { 도메인 } = require(path.join(__dirname, '..', 'lib', '로그인코드.js'));
// 동의 귀속 — 술어를 여기 다시 적지 않는다(`lib/동의게이트.js` 가 유일 정본)
const { 지금유효id식 } = require(path.join(__dirname, '..', 'lib', '동의게이트.js'));
/* 게임(G1·G2) — ⑫·⑬·⑫-G2 가 deliver 게임 갈래의 술어·행 규격을 거울로 잰다. 값은 전부 정본
 * import — 리터럴 사본은 팩·계약이 개정되는 날 시험만 초록으로 남긴다(§6-8 규칙 3 과 같은 축). */
const {
  재제출의사, 게임챌린지, 시드전부, 게임날인가, G2챌린지, G2재제출앵커들,
} = require(path.join(__dirname, '..', 'lib', '게임배정.js'));
const {
  G1스냅샷, 스냅샷모양판, 과제유형: 게임과제유형, 학생공개키,
  G2스냅샷, G2스냅샷모양판, G2과제유형, G2학생공개키,
} = require(path.join(__dirname, '..', 'lib', '게임스냅샷.js'));
/* ⑫-G2 의 «세울 수 없는 원 제출» 픽스처 재료 — 대조 문항은 팩 원자료에서 고른다(정본 한 곳). */
const { 문항들: G2문항들 } = require(path.join(__dirname, '..', 'contents', '보고서교정문항.js'));
const { 사건출처 } = require(path.join(__dirname, '..', 'lib', '사건출처.js'));

/* 왕복 게이트 스코프 — 이 시험이 부르는 함수만 잰다(ⓑ 차단 ②: 전 함수 목록이면 events·correct
 * 낡음이 이 시험과 무관하게 발화점을 막는다). ⚠ 시험이 부르는 것보다 좁으면 게이트가 옛 판을
 * 초록으로 재므로, `tests/왕복골격.test.js` 가 소스의 함수 사용과 이 목록을 대조한다. */
const 게이트함수들 = ['deliver', 'tasks', 'corrections', 'progress'];

/* 어제 배정을 손으로 심는다 — 「첫날이 아닌 학생」은 그렇게만 만들어진다.
 * 배치를 어제 한 번 돌리는 것으로는 못 만든다(그날 날짜로 돌 뿐이다). */
const 어제 = (오늘) => {
  const d = new Date(`${오늘}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const { ref, sql, anon, service_role: service, 확인, 보고 } = await 골격.열기('배달왕복시험', { 함수목록: 게이트함수들 });

  /* 🔴 5xx·비 JSON 만 짧게 재시도한다 — 4xx 는 판정 재료라 그대로 돌려준다(①의 401 이 그 자리).
   *   `생성왕복시험` 이 먼저 같은 판을 세웠고(talk 182a668) 그것과 같은 모양을 쓴다.
   *
   *   ■ 무엇을 덮고 있나 — 숨기지 않고 적는다
   *   재적 823 의 전원 배달은 Edge 자원 예산의 «가장자리»에 앉아 있어, 같은 요청이 들쭉날쭉
   *   `546 WORKER_RESOURCE_LIMIT` 을 낸다(2026-08-22 실측: 판마다 2/5 ~ 4/5 성공). 인구가
   *   648 이던 어제는 41초에 늘 200 이었다. 이 재시도는 **그 가장자리를 없애지 않는다** —
   *   시험이 그 흔들림 위에서도 회귀를 재게 할 뿐이다.
   *
   *   ■ 그런데도 정당한 이유
   *   배달은 설계상 멱등이고(그 사실을 재는 것이 바로 아래 ④다), 진짜 호출자인 cron 도 5xx 를
   *   만나면 다시 불러야 한다 — 안 그러면 그날 학급 전체가 배달을 못 받는다. 즉 이 재시도는
   *   시험만의 편의가 아니라 **운영 호출자가 해야 할 일과 같은 행동**이다.
   *   ⚠ 뒤집어 말하면, cron 이 재시도를 안 하고 있다면 그건 별건의 결함이다.
   *
   *   🔑 그래도 «몇 번 만에 됐나»는 남긴다 — 조용히 초록이 되면 가장자리가 사라진 줄 안다. */
  let 재시도누적 = 0;
  const 쉼 = (ms) => new Promise((r) => setTimeout(r, ms));
  const 호출 = async (질의 = '', 키 = service) => {
    for (let i = 0; ; i++) {
      const r = await fetch(`https://${ref}.supabase.co/functions/v1/deliver${질의}`, {
        method: 'POST', headers: { Authorization: `Bearer ${키}` },
      });
      const 원문 = await r.text();
      let 몸 = null;
      try { 몸 = JSON.parse(원문 || '{}'); } catch { 몸 = null; }
      if ((r.status >= 500 || 몸 === null) && i < 4) {
        재시도누적 += 1;
        console.log(`     ↻ deliver${질의 || ''} ${r.status}${r.headers.get('sb-error-code') ? ` ${r.headers.get('sb-error-code')}` : ''} — 다시 부른다(${i + 1}/4)`);
        await 쉼(5000);
        continue;
      }
      return { status: r.status, 몸: 몸 ?? { 원문머리: String(원문).slice(0, 120) } };
    }
  };

  const 오늘 = 몽골날짜();
  const 표 = `t${Date.now().toString(36)}`;   // 이번 실행의 학생들을 가르는 표식
  const 판 = (await sql(`select name from engine.schema_migrations order by version desc limit 1`))[0].name.match(/_(c\d+)\.sql$/)[1];

  /* ── 준비: 다섯 학생 ─────────────────────────────────────────────
   *  A 동의 O·이력 없음      → 첫날 · degraded=false
   *  B 동의 X                → 건너뜀(배정 0)
   *  C 동의 O·어제 배정 O     → 강등(전날 문장) · degraded=true
   *  D 동의 O·어제 배정 + 그 뒤 확정된 교정 → ②슬롯 = 교정문 · degraded=false
   *  E 동의 O·어제 배정 + G1 메일 원제출·그 뒤 확정된 «메일» 교정 + 「수정」
   *    → ⑫ C3 격리(메일 교정문이 낭독으로 안 샘 — 강등) · H3 재제출 재료
   *  F 동의 O·G2 원제출 2(앵커 문항 + «더 최신» 대조 문항)·각각 교정 + 「수정」
   *    → ⑫-G2 넓힌 H3(챌린지 동봉 · 대조 그늘 차단 · 닻 소등) */
  console.log('■ 준비 — 시험 학생 6명');
  const 학생들 = await sql(`
    insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver, is_test)
    values ('${표}-A','시험A','Lv2','study','${판}', true), ('${표}-B','시험B','Lv2','study','${판}', true),
           ('${표}-C','시험C','Lv2','study','${판}', true), ('${표}-D','시험D','Lv2','study','${판}', true),
           ('${표}-E','시험E','Lv2','study','${판}', true), ('${표}-F','시험F','Lv1','study','${판}', true)
    returning learner_id, student_code`);
  const id = Object.fromEntries(학생들.map((r) => [r.student_code.slice(-1), r.learner_id]));

  await sql(`
    insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
    values ('${id.A}'::uuid,'v18.9', now() - interval '30 days','${판}','tools/배달왕복시험.js'),
           ('${id.C}'::uuid,'v18.9', now() - interval '30 days','${판}','tools/배달왕복시험.js'),
           ('${id.D}'::uuid,'v18.9', now() - interval '30 days','${판}','tools/배달왕복시험.js'),
           ('${id.E}'::uuid,'v18.9', now() - interval '30 days','${판}','tools/배달왕복시험.js'),
           ('${id.F}'::uuid,'v18.9', now() - interval '30 days','${판}','tools/배달왕복시험.js')`);

  // C·D·E 에게 어제 배정을 심는다 — 배정 행 = learning_events + submissions 쌍이다.
  const 어제날 = 어제(오늘);
  const 어제스냅 = 오늘과제({ 날짜: 어제날, 첫날: true }).task_snapshot;
  for (const k of ['C', 'D', 'E']) {
    await sql(`
      with ev as (
        insert into engine.learning_events
          (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
           level_snapshot, consent_ver, consent_id, degraded, payload, schema_ver)
        values ('${id[k]}'::uuid,'task.assigned','발화녹음','ai',
                '${어제날}T04:00:00Z'::timestamptz, 'task:${id[k]}:${어제날}',
                'Lv2','v18.9', ${지금유효id식(`'${id[k]}'::uuid`)}, false, '{"ver":1}'::jsonb, '${판}')
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
         level_snapshot, consent_ver, consent_id, degraded, payload, schema_ver)
      values ('${id.D}'::uuid,'submission.created','발화녹음','learner',
              '${어제날}T08:00:00Z'::timestamptz, 'sub:${id.D}:${어제날}',
              'Lv2','v18.9', ${지금유효id식(`'${id.D}'::uuid`)}, false, '{"ver":1,"attempt_no":1}'::jsonb, '${판}')
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

  /* 🔴 E — **G1 메일 원제출 + 그 «뒤» 확정된 «메일» 교정 + 「수정」**. ⑫·⑬ 의 재료 전부다.
   *   교정 시각이 어제 배정 «뒤»라 C3 창 안인데, 붙은 제출이 발화가 아니라 게임(숙제제출)이다 —
   *   deliver 의 ②슬롯 조인이 task_type='발화녹음' 으로 한정하지 않으면 이 메일 교정문이 오늘
   *   E 의 낭독 문장으로 나간다(적대 반박 C3). 낡은 배포판이면 ⑫ 가 그 자리에서 빨개진다.
   *   시드·스냅샷은 정본 조립(`G1스냅샷`)을 지난다 — 배정·제출이 같은 조립(§6-8 규칙 4). */
  const E시드 = 시드전부[0];
  const E스냅 = G1스냅샷(E시드);
  if (!E스냅) die('팩에서 E 시드를 못 폈다 — 팩 개정으로 시드 공간이 비었는지 본다');
  const E원제출 = (await sql(`
    with ev as (
      insert into engine.learning_events
        (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
         level_snapshot, consent_ver, consent_id, degraded, payload, schema_ver)
      values ('${id.E}'::uuid,'submission.created','${게임과제유형}','learner',
              '${어제날}T07:00:00Z'::timestamptz, 'sub:${id.E}:g1:${어제날}',
              'Lv2','v18.9', ${지금유효id식(`'${id.E}'::uuid`)}, false,
              '{"ver":1,"attempt_no":1}'::jsonb, '${판}')
      returning event_id)
    insert into engine.submissions
      (event_id, task_type, task_ref, task_snapshot, task_schema_ver, body_original, occurred_at, schema_ver)
    select event_id, '${게임과제유형}', 'task-${어제날}',
           '${JSON.stringify(E스냅).replace(/'/g, "''")}'::jsonb, '${스냅샷모양판}',
           '교수님께. 금일 회의에 관하여 문의드립니다.',
           '${어제날}T07:00:00Z'::timestamptz, '${판}' from ev
    returning event_id`))[0].event_id;
  const E교정 = (await sql(`
    insert into engine.corrections (submission_id, actor_kind, corrected_text, created_at, schema_ver)
    select submission_id, 'teacher', '교수님께. 오늘 회의에 관하여 문의드립니다.',
           '${어제날}T09:30:00Z'::timestamptz, '${판}'
      from engine.submissions where event_id = '${E원제출}'::uuid
    returning correction_id`))[0].correction_id;
  await sql(`
    insert into engine.learning_events
      (learner_id, event_type, actor_kind, occurred_at, idempotency_key,
       level_snapshot, consent_ver, consent_id, degraded, payload, schema_ver, correction_id)
    values ('${id.E}'::uuid,'correction.responded','learner','${어제날}T10:00:00Z'::timestamptz,
            'resp:${id.E}:${어제날}','Lv2','v18.9', ${지금유효id식(`'${id.E}'::uuid`)}, false,
            '${JSON.stringify({ ver: 1, learner_response: 재제출의사 }).replace(/'/g, "''")}'::jsonb,
            '${판}', '${E교정}'::uuid)`);

  /* 🔴 F — **G2 원제출 «둘» + 각각 확정 교정 + 「수정」**. ⑫-G2 의 재료 전부다.
   *   ① 앵커 문항(오류문 — 앉음이 선다) T07:10 → 걷혀야 한다.
   *   ② 대조 문항(멀쩡한 문장을 짚은 과잉 교정) T07:20 · 「수정」도 **더 최신**(T10:20) —
   *      재배정이 원리상 못 서는 원 제출이라 안 걷혀야 하고, limit 1 이 최신부터 보므로
   *      필터가 없으면 ①을 그늘로 가린다(넓힌 H3 의 `= any(목록)` 이 재는 자리).
   *   스냅샷은 정본 조립(`G2스냅샷`)을 지난다 — 배정·제출이 같은 조립(§6-8 규칙 4). */
  const F앵커 = G2재제출앵커들[0];
  const F대조문항 = (G2문항들.find((q) => !('교정문' in q)) || {}).문항id;
  if (!F앵커 || !F대조문항) die('G2 팩에서 앵커·대조 재료를 못 골랐다 — 팩 개정으로 풀이 비었는지 본다');
  const F제출심기 = async (문항id, 몇시, 표식) => {
    const 스냅 = G2스냅샷(문항id);
    if (!스냅) die(`G2 스냅샷을 못 폈다 — ${문항id}`);
    return (await sql(`
      with ev as (
        insert into engine.learning_events
          (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
           level_snapshot, consent_ver, consent_id, degraded, payload, schema_ver)
        values ('${id.F}'::uuid,'submission.created','${G2과제유형.짚음}','learner',
                '${어제날}T${몇시}:00Z'::timestamptz, 'sub:${id.F}:${표식}:${어제날}',
                'Lv1','v18.9', ${지금유효id식(`'${id.F}'::uuid`)}, false,
                '{"ver":1,"attempt_no":1}'::jsonb, '${판}')
        returning event_id)
      insert into engine.submissions
        (event_id, task_type, task_ref, task_format, task_snapshot, task_schema_ver,
         body_original, occurred_at, schema_ver)
      select event_id, '${G2과제유형.짚음}', 'task-${어제날}', '쓰기첨삭',
             '${JSON.stringify(스냅).replace(/'/g, "''")}'::jsonb, '${G2스냅샷모양판}',
             '학생이 그 어절만 고쳐 낸 문장', '${어제날}T${몇시}:00Z'::timestamptz, '${판}' from ev
      returning event_id`))[0].event_id;
  };
  const F수정심기 = async (원제출, 몇시, 표식) => {
    const 교정 = (await sql(`
      insert into engine.corrections (submission_id, actor_kind, corrected_text, created_at, schema_ver)
      select submission_id, 'teacher', '기준 교정문', '${어제날}T09:${표식 === 'g2' ? '40' : '45'}:00Z'::timestamptz, '${판}'
        from engine.submissions where event_id = '${원제출}'::uuid
      returning correction_id`))[0].correction_id;
    await sql(`
      insert into engine.learning_events
        (learner_id, event_type, actor_kind, occurred_at, idempotency_key,
         level_snapshot, consent_ver, consent_id, degraded, payload, schema_ver, correction_id)
      values ('${id.F}'::uuid,'correction.responded','learner','${어제날}T${몇시}:00Z'::timestamptz,
              'resp:${id.F}:${표식}:${어제날}','Lv1','v18.9', ${지금유효id식(`'${id.F}'::uuid`)}, false,
              '${JSON.stringify({ ver: 1, learner_response: 재제출의사 }).replace(/'/g, "''")}'::jsonb,
              '${판}', '${교정}'::uuid)`);
  };
  const F원제출 = await F제출심기(F앵커, '07:10', 'g2');
  const F대조제출 = await F제출심기(F대조문항, '07:20', 'g2c');
  await F수정심기(F원제출, '10:10', 'g2');
  await F수정심기(F대조제출, '10:20', 'g2c');
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
  /* 🔴 **칸이 «있는지»부터 본다** — `(몸.실패 || []).length === 0` 만 쓰면 칸이 아예 없는 봉투도
   *   「실패 0건」으로 읽힌다(없는 것과 0건이 한 모양 · 새는 방향은 여기서도 「통과」).
   *   실제로 그 자리가 열려 있었다: 활성 뒤 전원 배달의 봉투는 `mode:'생성'` 이라 `실패`·`건너뜀`
   *   ·`배정` 이 통째로 없는데, 이 줄만은 그날도 «초록»이었을 것이다(2026-08-22 · 배달 트랙 지적).
   *   활성일 대응은 시험 경계 재정의라 여기 밖이지만, 「없는 칸을 0으로 읽는 것」은 지금 막는다. */
  확인('실패 0', Array.isArray(r1.몸.실패) && r1.몸.실패.length === 0, r1.몸.실패);

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
         level_snapshot, consent_ver, consent_id, degraded, payload, schema_ver)
      values ('${id.A}'::uuid,'task.assigned','발화녹음','ai',
              '${답날}T04:00:00Z'::timestamptz, 'task:${id.A}:${답날}',
              'Lv2','v18.9', ${지금유효id식(`'${id.A}'::uuid`)}, false, '{"ver":1}'::jsonb, '${판}')
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

  /* ── ⑧-b 빈 날 구제 (C0 심문 B3 · 소급 불가) ────────────────────
   * 🔴 **이 갈래가 여기 없어서 결함이 초록 밑에서 살았다** (2026-08-22 실측).
   *   `/tasks` 는 배정 0 + 동의 O + 오늘이면 그 자리에서 `deliver` 를 불러 세운다. 그 호출은
   *   함수 런타임의 `SUPABASE_SERVICE_ROLE_KEY` 로 나가는데, 플랫폼이 그 칸을 신형 시크릿
   *   키(`sb_secret_…`)로 갈아 끼운 뒤로 `deliver` 가 401 을 냈다. 그런데 계약이 「빈 상태는
   *   오류가 아니다」라 응답은 **200 + 빈 배열**이고, 왕복시험 전량은 초록이었다 —
   *   즉 **통과와 미실행이 같은 모양**이었다.
   * 🔑 그래서 재는 것은 「봉투가 200 인가」가 아니라 **`구제` 칸의 결과와 배정 행이 실제로 섰는가**다.
   * 🔑 학생을 **여기서** 만든다 — 위 ① 배치가 이미 돈 뒤여야 「배정 0인 날」이 성립한다.
   *   준비 절에서 만들면 배치가 그 학생 것도 세워 버려 이 갈래는 영영 안 탄다. */
  console.log('\n■ ⑧-b 빈 날 구제 — 배정 0 인 날 /tasks 가 그 자리에서 세우는가');
  const [신선] = await sql(`
    insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver, is_test)
    values ('${표}-G','시험G','Lv2','study','${판}', true) returning learner_id`);
  await sql(`
    insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
    values ('${신선.learner_id}'::uuid,'v18.9', now() - interval '1 day','${판}','tools/배달왕복시험.js')`);
  const 오늘배정수 = async () => Number((await sql(`
    select count(*)::int as n from engine.learning_events
     where learner_id = '${신선.learner_id}'::uuid and event_type = 'task.assigned'
       and (occurred_at at time zone '${시간대}')::date = '${오늘}'::date`))[0].n);
  const 구제전 = await 오늘배정수();
  확인('🔑 분모 — 부르기 전 이 학생의 오늘 배정은 0이다(0이 아니면 아래가 구제를 안 잰다)',
    구제전 === 0, 구제전);

  await sql(`update engine.learners set auth_user_id = null where auth_user_id = '${uid}'`);
  await sql(`update engine.learners set auth_user_id = '${uid}' where learner_id = '${신선.learner_id}'::uuid`);
  const 구제응답 = await 조회();
  확인('🔴 구제가 «세움» 으로 끝난다 — 사유가 붙으면 그날 발화가 사건이 안 된다(소급 불가)',
    구제응답.status === 200 && !!구제응답.몸.구제
      && 구제응답.몸.구제.결과 === '세움' && 구제응답.몸.구제.사유 === null, 구제응답.몸.구제);
  확인('🔴 같은 응답에 오늘 것이 실려 온다 — 세우고도 안 실으면 학생 화면은 그대로 비어 있다',
    (구제응답.몸.data || []).length === 1, (구제응답.몸.data || []).length);
  확인('🔴 배정 행이 DB 에 실제로 섰다 — 봉투만 보고 재면 「세웠다」는 말만 초록이 된다',
    (await 오늘배정수()) === 1);
  /* ⚠ **한 번만 부른다**(`functions/tasks` 머리말) — 두 번째 조회에서 또 구제가 돌면 그건
   *   재시도가 아니라 매 요청마다 배치를 때리는 것이다.
   * 🔑 칸은 **언제나 실린다**(index.ts:330) — 「안 불렀다」는 칸의 부재가 아니라 **값 null** 이다.
   *   부재로 재면 옛 배포(칸이 없던 판)와 「안 불렀다」가 한 모양이 된다. */
  const 두번째 = await 조회();
  확인('🔴 두 번째 조회는 구제를 다시 안 부른다 — 부르면 매 요청이 배치를 때린다',
    (두번째.몸.data || []).length === 1
      && '구제' in 두번째.몸 && 두번째.몸.구제 === null, 두번째.몸.구제);

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

  /* 🔴 **동의 게이트가 이 통로에도 서 있는가** (2026-08-10 · 전층감사 §2-5 ⓐ).
   *   이 함수는 동의 규약 **밖에 있던 유일한 조회 함수**였다 — 철회한 학생에게도 카드가 그대로
   *   떠서 앱이 `correction.viewed` 를 만들고, 그 거절(`CONSENT_MISSING`·`retryable:false`)을
   *   앱이 `send_final` 로 적으면 **동의가 다시 서는 날 나갈 수 있었던 답이 죽는다**(소급 0).
   *   ⚠ 회귀(`tests/동의게이트.test.js`)는 **소스에 게이트가 적혀 있는지**까지만 본다 —
   *     배포본이 옛 판이면 그 초록은 라이브에 대해 아무 말도 안 한다. 그 칸이 여기다.
   *   A 는 위에서 이미 `blocked: null` 축을 못 박았으니(`data` 가 있는 채로) 여기선 B 만 잰다. */
  확인('🔴 동의가 있는 A 는 blocked 가 null 이다 — 목록이 있어도 값으로 말한다',
    c1.몸.blocked === null, c1.몸.blocked);
  await sql(`update engine.learners set auth_user_id = null where auth_user_id = '${uid}'`);
  await sql(`update engine.learners set auth_user_id = '${uid}' where learner_id = '${id.B}'::uuid`);
  const 막힌교정 = await 조회('', { 함수: 'corrections' });
  확인('🔴 동의 없는 B 는 200 + 이유(blocked)를 받는다 — 앱은 이 값으로 사건 큐를 멈춘다',
    막힌교정.status === 200 && 막힌교정.몸.blocked
      && 막힌교정.몸.blocked.code === 'CONSENT_MISSING', 막힌교정.몸);
  /* ⚠ 남은 축 하나 — **막혔는데도 목록이 오는가** — 는 **A 를 철회해야** 잴 수 있는데(B 는
   *   교정이 0건이라 「비었다」와 구별이 안 된다), **철회는 되돌릴 수 없다**: DB 트리거
   *   `protect_consents` 가 「철회는 되돌리지 않는다 — 재동의는 새 행이다」(L0 §9-3)로 막는다.
   *   A 는 아래 ⑩ 이 `지금유효id식(A)` 로 `consent_id` 를 채우며 계속 쓰므로 여기서 막으면
   *   그쪽이 무너진다. → 그 칸은 **A 를 다 쓴 뒤인 ⑭** 로 옮겼다(이 파일 맨 끝).
   *   A 로 되돌린다 — 아래 ⑩ 이 같은 토큰으로 A 를 읽는다. */
  await sql(`update engine.learners set auth_user_id = null where auth_user_id = '${uid}'`);
  await sql(`update engine.learners set auth_user_id = '${uid}' where learner_id = '${id.A}'::uuid`);

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
       level_snapshot, consent_ver, consent_id, degraded, payload, schema_ver)
    values ('${id.A}'::uuid,'submission.created','발화녹음','learner',
            '${어제날}T05:00:00Z'::timestamptz,'sub:${표}:A:1','Lv2','v18.9',
            ${지금유효id식(`'${id.A}'::uuid`)}, false,
            '{"ver":1,"attempt_no":"많이"}'::jsonb,'${판}')
    returning event_id`))[0].event_id;

  const A동의 = 지금유효id식(`'${id.A}'::uuid`);   // 세 행이 같은 학생이라 한 번 만들어 돌려 쓴다
  await sql(`
    insert into engine.learning_events
      (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
       level_snapshot, consent_ver, consent_id, degraded, payload, retry_of_event_id, schema_ver)
    values ('${id.A}'::uuid,'submission.created','발화녹음','learner','${오늘}T05:00:00Z'::timestamptz,
            'sub:${표}:A:2','Lv2','v18.9', ${A동의}, false,'{"ver":1,"attempt_no":1}'::jsonb, null,'${판}'),
           ('${id.A}'::uuid,'submission.created','발화녹음','learner','${오늘}T05:10:00Z'::timestamptz,
            'sub:${표}:A:3','Lv2','v18.9', ${A동의}, false,'{"ver":1,"attempt_no":3}'::jsonb, null,'${판}'),
           ('${id.A}'::uuid,'submission.created','발화녹음','learner','${오늘}T05:20:00Z'::timestamptz,
            'sub:${표}:A:4','Lv2','v18.9', ${A동의}, false,'{"ver":1,"attempt_no":1}'::jsonb,
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
       level_snapshot, consent_ver, consent_id, degraded, payload, schema_ver)
    values ('${id.D}'::uuid,'submission.created','발화녹음','learner','${오늘}T06:00:00Z'::timestamptz,
            'sub:${표}:D:1','Lv2','v18.9', ${지금유효id식(`'${id.D}'::uuid`)}, false,
            '{"ver":1,"attempt_no":1}'::jsonb,'${판}')`);
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

  /* ── ⑫ 게임(G1) — C3 격리 · H3 거울 조인 (발주 §6-6 ⑩·⑪ · 배정 배선 ⓑ) ──────────
   * 게임 갈래 본체는 오늘 못 돈다 — `검수확정` 게이트(fail-closed)가 몽골어 검수 전 판을
   * 학생에게 안 열고, 그건 결함이 아니라 설계다. 그래서 여기서 재는 것은 둘이다:
   *   ⓐ C3 격리 — E 의 «메일» 교정문이 말하기 ②슬롯로 새지 않는다(준비의 E · 배포판 실측).
   *   ⓑ H3 조인 — deliver 의 재제출 술어를 DB 에 직접 태운다. 술어 «값» 을 리터럴로 베끼면
   *      deliver·팩이 바뀌는 날 거울만 초록으로 남으므로, 값(`재제출의사`·`게임챌린지`)은
   *      정본 import 고 모양은 deliver 의 lateral 그대로다. */
  console.log('\n■ ⑫ 게임(G1) — C3 격리 · H3 거울 조인');
  const E배정 = (await 행('E')).find((r) => r.event_type === 'task.assigned');
  확인('🔴 E(메일 교정만 있음)의 ②슬롯은 전날 문장이다 — 메일 교정문이 낭독으로 안 샌다(C3)',
    !!E배정 && 따라말하기문장(E배정.task_snapshot) === 따라말하기문장(어제스냅),
    E배정 && 따라말하기문장(E배정.task_snapshot));
  확인('E 는 강등이다 — 말하기 교정문은 실제로 없었다',
    !!E배정 && E배정.degraded === true, E배정 && E배정.degraded);
  확인('E 의 재발화 고리는 비어 있다 — 메일 교정은 말하기 재시도가 아니다',
    !!E배정 && E배정.retry_of_event_id === null, E배정 && E배정.retry_of_event_id);

  const 따옴 = (목록) => 목록.map((x) => `'${x}'`).join(',');
  const 거울조인 = (학생) => sql(`
    select e2.event_id as 원제출사건, s2.task_snapshot->>'prompt_seed' as 원시드,
           s2.task_snapshot->>'challenge_id' as 원챌린지
      from engine.learning_events r
      join engine.corrections c2 on c2.correction_id = r.correction_id
      join engine.submissions s2 on s2.submission_id = c2.submission_id
      join engine.learning_events e2 on e2.event_id = s2.event_id
     where r.learner_id = '${학생}'::uuid
       and r.event_type = 'correction.responded'
       and r.payload->>'learner_response' = '${재제출의사}'
       and e2.event_type = 'submission.created'
       and ((s2.task_snapshot->>'challenge_id' = '${게임챌린지}'
             and s2.task_snapshot->>'prompt_seed' in (${따옴(시드전부)}))
         or (s2.task_snapshot->>'challenge_id' = '${G2챌린지}'
             and s2.task_snapshot->>'prompt_seed' in (${따옴(G2재제출앵커들)})))
       and not exists (
         select 1 from engine.learning_events t
          where t.learner_id = '${학생}'::uuid
            and t.event_type = 'task.assigned'
            and t.retry_of_event_id = e2.event_id)
     order by r.occurred_at desc limit 1`);
  const 재제출재료 = await 거울조인(id.E);
  확인('🔴 H3 거울 조인이 E 원제출 1행을 낸다 — 「수정」이 눌렸고 재배정이 아직 없다',
    재제출재료.length === 1 && 재제출재료[0].원제출사건 === E원제출, 재제출재료);
  확인('원 시드가 함께 걷힌다 — 재제출은 «같은 메일»이라 새 문항을 지어내지 않는다',
    재제출재료.length === 1 && 재제출재료[0].원시드 === E시드,
    재제출재료[0] && 재제출재료[0].원시드);

  /* ── ⑬ 게임 배정 행 규격 — deliver 게임 갈래의 INSERT 를 그대로 태운다 ──────────────
   * 본체가 게이트에 막혀 있는 동안에도 행 규격·멱등·집계 비오염은 DB 제약의 몫이라, 같은
   * 열·같은 conflict 로 **직접 INSERT** 해 제약이 실제로 어떻게 답하는지 잰다(코드 독해가
   * 아니라 상태를 바꿔 본다 — 리허설 전용이라 남는 행이 사고가 아니다). */
  console.log('\n■ ⑬ 게임 배정 행 규격 — 직접 INSERT (멱등·집계·/tasks 관통)');
  const 게임행넣기 = (날) => sql(`
    insert into engine.learning_events
      (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
       level_snapshot, consent_ver, consent_id, degraded, retry_of_event_id, source_kind,
       payload, schema_ver)
    values ('${id.E}'::uuid, 'task.assigned', '${게임과제유형}', 'ai',
            '${날}T04:00:00Z'::timestamptz, 'task:${id.E}:${날}',
            'Lv2', 'v18.9', ${지금유효id식(`'${id.E}'::uuid`)}, false,
            '${E원제출}'::uuid, '${사건출처('task.assigned')}'::engine.source_kind,
            '{"ver":1}'::jsonb, '${판}')
    on conflict (learner_id, idempotency_key) do nothing
    returning event_id`);

  const 접힘 = await 게임행넣기(오늘);
  확인('🔴 같은날 게임 INSERT 는 말하기 멱등키에 접힌다(0행) — 「그날 배정 1건」은 유일 제약이다',
    접힘.length === 0, 접힘);

  /* 미래 게임날 — 요일 판정도 정본(`게임날인가`)으로 고른다(2999-01-01 부터 앞으로).
   * 리터럴 날짜를 박으면 게임 요일이 바뀌는 날 이 시험이 「게임날 아님」을 게임날로 잰다. */
  const 미래게임날 = (() => {
    const d = new Date('2999-01-01T00:00:00Z');
    while (!게임날인가(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const 선행 = await 게임행넣기(미래게임날);
  확인(`미래 게임날(${미래게임날})엔 게임 배정이 선다 — task_type·enum·retry FK 를 실제 DB 가 받았다`,
    선행.length === 1, 선행);
  const 게임행 = 선행[0] && 선행[0].event_id;
  await sql(`
    insert into engine.submissions
      (event_id, task_type, task_ref, task_snapshot, task_schema_ver, occurred_at, schema_ver, due_at, due_ver)
    values ('${게임행}'::uuid, '${게임과제유형}', 'task-${미래게임날}',
            '${JSON.stringify(E스냅).replace(/'/g, "''")}'::jsonb, '${스냅샷모양판}',
            '${미래게임날}T04:00:00Z'::timestamptz, '${판}',
            ('${미래게임날}'::date + 1)::timestamp at time zone 'Asia/Ulaanbaatar', 'due.v1')`);
  const 재접힘 = await 게임행넣기(미래게임날);
  확인('같은 게임 배정의 재INSERT 는 접힌다(0행) — 재실행이 두 행을 못 만든다',
    재접힘.length === 0, 재접힘);

  /* 집계 비오염 — 게임 배정도 submissions 에 행을 실으므로(⑥ 과 같은 대가), event_type 을
   * 안 걸면 E 의 「제출 수」가 배정 수만큼 부푼다. E 의 행: 어제 배정·오늘 배정·게임 배정·원제출. */
  const [{ e전체, e진짜 }] = await sql(`
    select (select count(*) from engine.submissions s
              join engine.learning_events e on e.event_id = s.event_id
             where e.learner_id = '${id.E}'::uuid) as e전체,
           (select count(*) from engine.submissions s
              join engine.learning_events e on e.event_id = s.event_id
             where e.learner_id = '${id.E}'::uuid and e.event_type = 'submission.created') as e진짜`);
  확인('게임 배정이 제출로 안 세어진다 — E 의 submissions 행 4 중 진짜 제출은 1이다',
    Number(e전체) === 4 && Number(e진짜) === 1, { e전체, e진짜 });

  /* 🔴 /tasks 관통(C1) — 거름망(`학생판스냅샷`)이 게임 스냅샷을 `학생판게임스냅샷` 에 위임해
   *   6키를 **전부** 내보내는가를 배포판에서 잰다(F179 계열 — 로컬 회귀는 함수를 재고, 여기가
   *   재는 것은 배포된 판이 실제로 그 함수를 거치는가다). 키 목록은 정본(`학생공개키`)이다. */
  await sql(`update engine.learners set auth_user_id = null where auth_user_id = '${uid}'`);
  await sql(`update engine.learners set auth_user_id = '${uid}' where learner_id = '${id.E}'::uuid`);
  const 게임읽기 = await 조회(`?date=${미래게임날}`);
  const 게임읽은 = (게임읽기.몸.data || [])[0] || {};
  확인('E 토큰으로 미래 게임날 배정이 1건 나온다',
    게임읽기.status === 200 && (게임읽기.몸.data || []).length === 1, 게임읽기);
  확인('🔴 앱이 읽은 task_id 가 그 게임 배정이다', 게임읽은.task_id === 게임행,
    [게임읽은.task_id, 게임행]);
  const 읽은키 = Object.keys(게임읽은.task_snapshot || {}).sort();
  확인('🔴 G1 6키가 전부 나온다 — 거름망이 게임 판을 몰라 벗기면 앱은 게임을 원리상 못 본다',
    읽은키.length === 학생공개키.length && [...학생공개키].sort().every((k, i) => 읽은키[i] === k),
    읽은키);
  확인('스냅샷 값이 심은 그대로다 — 지시문·질문이 그날 학생이 볼 그것이다',
    학생공개키.every((k) => (게임읽은.task_snapshot || {})[k] === E스냅[k]), 게임읽은.task_snapshot);
  확인('🔴 재발화 고리가 관통한다 — 게임 재제출의 결과 변수가 화면 재료까지 닿는다',
    게임읽은.retry_of_event_id === E원제출, [게임읽은.retry_of_event_id, E원제출]);

  /* H3 닻 소등 — 재배정이 서고 나면 거울 조인은 0행이어야 한다(닻은 「retry 배정의 부재」).
   * 안 꺼지면 다음 게임날마다 같은 원제출로 또 배정이 선다(무한 재제출). */
  const 소등 = await 거울조인(id.E);
  확인('🔴 재배정 뒤 거울 조인은 0행이다 — not exists 닻이 실제로 꺼진다', 소등.length === 0, 소등);

  /* ── ⑫-G2 재제출 — 넓힌 H3: 챌린지 동봉 · 대조 그늘 차단 · 닻 소등 (08-13 소트랙) ──────
   * deliver 의 H3 조인이 G1 한정을 벗었다(`lib/게임배정.G2재제출앵커들` 이 술어 목록의 정본).
   * 여기서 재는 것은 넷: ⓐ G2 원제출이 챌린지와 함께 걷힌다 ⓑ 세울 수 없는 원 제출(대조
   * 문항)은 **더 최신이어도** 안 걷힌다 — limit 1 의 그늘을 목록 필터가 막는다 ⓒ G2 재배정
   * 행(짚음 통로·G2 모양판·retry_of)을 DB·/tasks 가 그대로 받는다 ⓓ 재배정 뒤 닻이 꺼진다. */
  console.log('\n■ ⑫-G2 재제출 — 넓힌 H3: 챌린지 동봉 · 대조 그늘 차단 · 닻 소등');
  const F재료 = await 거울조인(id.F);
  확인('🔴 넓힌 H3 가 F 의 G2 원제출을 낸다 — 조인이 G1 한정을 벗었다',
    F재료.length === 1 && F재료[0].원제출사건 === F원제출, F재료);
  확인('원챌린지·원시드가 함께 걷힌다 — 모듈을 가르는 것은 지금 급수가 아니라 이 값이다',
    F재료.length === 1 && F재료[0].원챌린지 === G2챌린지 && F재료[0].원시드 === F앵커, F재료[0]);
  확인('🔴 «더 최신»인 대조 문항 「수정」은 안 걷힌다 — 세울 수 없는 원 제출이 limit 1 을 그늘로 못 가린다',
    F재료.length === 1 && F재료[0].원제출사건 !== F대조제출, F재료);

  /* G2 재배정 행 — deliver 게임 갈래의 INSERT 를 같은 열·같은 conflict 로 직접 태운다(⑬ 과
   * 같은 이유 — 본체는 `검수확정` 게이트에 막혀 있고 그건 설계다). */
  const F스냅 = G2스냅샷(F앵커);
  const F재배정 = (await sql(`
    insert into engine.learning_events
      (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
       level_snapshot, consent_ver, consent_id, degraded, retry_of_event_id, source_kind,
       payload, schema_ver)
    values ('${id.F}'::uuid, 'task.assigned', '${G2과제유형.짚음}', 'ai',
            '${미래게임날}T04:00:00Z'::timestamptz, 'task:${id.F}:${미래게임날}',
            'Lv1', 'v18.9', ${지금유효id식(`'${id.F}'::uuid`)}, false,
            '${F원제출}'::uuid, '${사건출처('task.assigned')}'::engine.source_kind,
            '{"ver":1}'::jsonb, '${판}')
    on conflict (learner_id, idempotency_key) do nothing
    returning event_id`))[0];
  확인('G2 재배정 행이 선다 — 짚음 통로·retry FK 를 실제 DB 가 받았다', !!F재배정, F재배정);
  if (!F재배정) die('G2 재배정 행이 안 섰다 — 아래 칸들이 전부 공허해진다');
  await sql(`
    insert into engine.submissions
      (event_id, task_type, task_ref, task_snapshot, task_schema_ver, occurred_at, schema_ver, due_at, due_ver)
    values ('${F재배정.event_id}'::uuid, '${G2과제유형.짚음}', 'task-${미래게임날}',
            '${JSON.stringify(F스냅).replace(/'/g, "''")}'::jsonb, '${G2스냅샷모양판}',
            '${미래게임날}T04:00:00Z'::timestamptz, '${판}',
            ('${미래게임날}'::date + 1)::timestamp at time zone 'Asia/Ulaanbaatar', 'due.v1')`);

  /* /tasks 관통 — G2 판이 거름망(`학생판게임스냅샷` 위임)을 지나 공개키 그대로 나오는가.
   * 🔴 「정답」이 그 목록에 없어야 한다 — 새면 학생이 기준 교정문을 미리 보고, 이 게임이 재는
   *   것(무엇을 오류로 보나)이 통째로 죽는다(측정 타당성 축 · §6-8). */
  await sql(`update engine.learners set auth_user_id = null where auth_user_id = '${uid}'`);
  await sql(`update engine.learners set auth_user_id = '${uid}' where learner_id = '${id.F}'::uuid`);
  const g2읽기 = await 조회(`?date=${미래게임날}`);
  const g2읽은 = (g2읽기.몸.data || [])[0] || {};
  확인('F 토큰으로 미래 게임날 G2 재배정이 1건 나온다',
    g2읽기.status === 200 && (g2읽기.몸.data || []).length === 1 && g2읽은.task_id === F재배정.event_id, g2읽기);
  const g2키 = Object.keys(g2읽은.task_snapshot || {}).sort();
  확인('🔴 G2 공개키 그대로다 — 벗기지도(빈 화면) 새지도(정답 유출) 않는다',
    g2키.length === G2학생공개키.length && [...G2학생공개키].sort().every((k, i) => g2키[i] === k)
      && !g2키.includes('정답'), g2키);
  확인('🔴 재발화 고리·원 문항이 화면 재료까지 닿는다 — 앵커 턴이 retry 를 지는 재료(§4-11)',
    g2읽은.retry_of_event_id === F원제출
      && (g2읽은.task_snapshot || {}).prompt_seed === F앵커, [g2읽은.retry_of_event_id, F원제출]);

  /* G2 닻 소등 — F 의 거울에는 대조 「수정」이 남아 있지만(세울 수 없는 원 제출) 그건 목록
   * 필터가 이미 걸렀으므로, 재배정이 서면 걷힐 것이 0 이어야 한다. */
  const F소등 = await 거울조인(id.F);
  확인('🔴 G2 재배정 뒤 F 거울 조인은 0행이다 — 닻이 꺼지고 대조 「수정」도 그늘을 못 만든다',
    F소등.length === 0, F소등);

  /* ── ⑭ 철회한 학생의 교정 (C0 §4-3 ② `blocked` · 전층감사 §2-5 ⓐ) ──────────────
   * 🔴 **맨 끝인 것이 설계다.** 이 칸은 A 의 동의를 **실제로 철회**해야 서는데, 철회는
   *   되돌릴 수 없다(DB 트리거 `protect_consents` — 「재동의는 새 행이다」 L0 §9-3). 앞에 두면
   *   ⑩·⑪ 이 A 의 유효 동의를 전제로 하다가 무너진다. 픽스처 학생은 실행마다 새로 서므로
   *   (`표 = t{시각}`) 여기서 막고 그대로 두는 것이 정확하다 — 되돌리는 시늉이 오히려 거짓이다.
   *
   * 왜 재나: `corrections` 는 동의 규약 **밖에 있던 유일한 조회 함수**였다. 게이트가 없으면
   *   철회한 학생에게도 카드가 떠서 앱이 `correction.viewed` 를 만들고, 그 거절
   *   (`CONSENT_MISSING`·`retryable:false`)을 앱이 `send_final` 로 적으면 **동의가 다시 서는 날
   *   나갈 수 있었던 답이 죽는다**(append-only · 소급 0).
   * ⚠ 회귀(`tests/동의게이트.test.js`)는 **소스에 게이트가 적혀 있는지**까지만 본다 — 배포본이
   *   옛 판이면 그 초록은 라이브에 대해 아무 말도 안 한다. 그 사이가 이 칸이다. */
  console.log('\n■ ⑭ 철회한 학생의 교정 — GET /v1/corrections 의 blocked');

  await sql(`update engine.learners set auth_user_id = null where auth_user_id = '${uid}'`);
  await sql(`update engine.learners set auth_user_id = '${uid}' where learner_id = '${id.A}'::uuid`);
  const 철회수 = (await sql(
    `update engine.consents set revoked_at = now() - interval '1 minute'
      where learner_id = '${id.A}'::uuid and revoked_at is null returning consent_id`)).length;
  확인('준비 — A 의 동의를 실제로 철회했다(이게 0이면 아래 칸은 공허하다)', 철회수 > 0, 철회수);

  const 막힌A = await 조회('', { 함수: 'corrections' });
  확인('🔴 철회한 학생도 200 + 이유(blocked)를 받는다 — 앱은 이 값으로 사건 큐를 멈춘다',
    막힌A.status === 200 && 막힌A.몸.blocked
      && 막힌A.몸.blocked.code === 'CONSENT_MISSING', 막힌A.몸);
  /* 🔴 **막혔다고 목록을 비우지 않는다.** 비우면 「교정이 아직 없다」와 「막혔다」가 같은 모양이
   *   되고, 계약 §4-3 ② 의 빈 카드 금지 때문에 **화면 자체가 안 떠** 학생은 이유를 못 듣는다. */
  확인('🔴 막혀도 교정 목록은 그대로 온다 — 비우면 「없다」와 「막혔다」가 한 모양이 된다',
    (막힌A.몸.data || []).length === 20, (막힌A.몸.data || []).length);
  /* 🔑 **`tasks` 와 같은 답을 내는가** — 두 조회가 같은 상태에 다른 말을 하면 앱은 한 화면에서
   *   막히고 다른 화면에서 안 막힌다(이 게이트가 2026-08-07 에 고치려던 「네 곳에 네 가지」 그 병). */
  const 막힌과제 = await 조회();
  확인('🔴 같은 학생에게 tasks 도 같은 코드를 낸다 — 두 통로가 갈리면 화면마다 다르게 막힌다',
    막힌과제.몸.blocked && 막힌과제.몸.blocked.code === (막힌A.몸.blocked || {}).code, 막힌과제.몸.blocked);

  /* 🔑 초록은 **분모와 함께만** 읽는다(F207) — 재시도가 0 이 아니면 그날 전원 배달은 한 번에
   *   안 돈 것이다. 조용히 초록이면 다음 사람은 가장자리가 사라진 줄 안다. */
  보고(재시도누적 ? `⚠ deliver 5xx 재시도 ${재시도누적}회 — 전원 배달이 한 번에 안 돌았다(자원 가장자리)` : 'deliver 재시도 0');
}

main().catch((e) => die(String((e && e.message) || e)));
