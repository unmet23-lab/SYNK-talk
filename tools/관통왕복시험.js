#!/usr/bin/env node
'use strict';
/**
 * 관통왕복시험 — 세 층(㉠실력·㉡사람·㉢삶)이 «동시에» 찬 학생에서 배달·첨삭이 셋을 **모두 읽는가**.
 *
 *   SUPABASE_PROJECT_REF=<리허설ref> node tools/관통왕복시험.js
 *
 * ■ 왜 필요한가 — 정본 명세 = SYNK-appsscript `docs/관통왕복_명세.md` v0.2
 *   왕복시험 13벌은 전부 통로 하나씩(가로줄)이다. 각 배선은 «그 배선만 찬 학생»으로 증명됐고,
 *   세 층이 «동시에» 찬 학생에서 길이 상한·프롬프트 예산·널 규칙이 서로를 밀어내는지는 아무도
 *   안 재봤다(세로줄). 검증점 다섯:
 *     V1 배달 사건에 스탬프 다섯 칸(estimator 3열 + policy_ver + intervention_id) — ㉡
 *     V2 과제요약이 상태를 반영(상태를 다르게 심은 A·B 의 요약이 다르고, 축 실값이 실림) — ㉡
 *     V3 시즌 목표가 과제요약에 «50 코드포인트 절단 후» 동승(lib/과제요약.js:30-31·67-70) — ㉢
 *     V4 correct 조립층: 걷기(correct/index.ts:443-462) + [학생 맥락] «무절단» 선두 동승 — ㉢
 *     V5 ㉠ 조각(급수·목표)이 과제요약에 실림(lib/과제요약.js:98-99) — ㉠
 *   같은 날 재실행 함정은 «재실행»이 아니라 «두 학생 비교»(A·B 를 회차마다 새로)로 우회한다.
 *
 * ■ 🔴 리허설 전용 — learning_events 는 append-only 라 여기서 만든 행은 지워지지 않는다.
 *
 * ■ ⚠ 함정 넷 (명세 ② + 선행 왕복 실측)
 *   ① 골격 `sql` 은 **문자열 하나만** 받는다 — 태그드 템플릿(sql`…`)으로 부르면 즉사
 *      (lib/왕복골격.js:56 · 라디오왕복 첫 실측).
 *   ② 생성 활성 게이트(`engine.gen_active_from()`)는 **임시로 세우고 반드시 걷는다** —
 *      시작 전 잔존 검사 → try/finally 걷기 → 잔존 false 확인(생성왕복시험.js:853-855 선례).
 *      🔴 게이트가 선 몇 분간 같은 리허설의 **배달왕복시험과 동시 실행 금지** — 그쪽 deliver 가
 *      400(맥락 필수)을 맞는다(생성왕복시험.js:25-26 실측). 순차로 돌린다.
 *   ③ 학습자상태의 `as_of` 는 **now 로만**(deliver 가 스냅기준=now 를 쓴다) — 과거 as_of 를
 *      넘기는 개조를 하면 여기서 심은 행이 `ingested_at` 이중 cutoff 로 **전건 배제**된다
 *      (lib/학습자상태.js v11 · 심은 행의 ingested_at 은 «지금»이다).
 *   ④ 학생은 회차마다 새로 만든다(`t{base36}-관통A/B`) — SYNK-9xx 대역은 안 쓴다.
 *
 * ■ 💰 과금 0 의 근거 (셋 다 물리·구조)
 *   · deliver-one(워커)을 **0회** 부른다 — 벤더·과금은 전부 그쪽 몫(deliver/생성모드.ts:3-9).
 *   · 배달은 `?맥락=구제` 단건 — job/draft 를 세우고 **구제경로 폴백으로 착지**하는 통로라
 *     벤더 0 이 물리로 강제된다(attempts 0행 · 생성왕복시험 C5 실측 「구제 attempts 0」).
 *   · 심는 제출에 body_original·transcript 를 **안 싣는다** — submissions insert 트리거
 *     (`submissions_enqueue_job`)가 전 행을 correct 대기표에 올리므로, body 를 실으면 correct
 *     회차가 도는 날 벤더로 나간다(correct/index.ts 대기조건 :179-180 이 body 없는 행을 거른다).
 *
 * ■ ⚠ V1 의 「응답 `상태없음` 표식」(deliver/index.ts:992-995)은 **현행(비활성) 경로 응답 전용**이다.
 *   같은 날 같은 학생은 두 경로를 못 탄다(멱등키 `task:{id}:{날짜}` 공유 — 현행이 먼저 서면 구제가
 *   「이미배정」으로 접혀 draft 가 안 서고, 구제가 먼저 서면 현행이 duplicate 로 접힌다). 그래서
 *   그 칸 자체는 이 시험에서 **원리상 못 재고**, 같은 함정(「null 스탬프 성공」)을 생성 경로의
 *   표식 셋으로 잰다: 응답 결과=구제착지 · job.outcome=구제경로(≠상태없음) · draft 에 상태가
 *   실제로 실림(estimator_version 비공백 + axes_used ≥ 1 + estimator_confidence 비null).
 *
 * ■ 판정 — V1~V5 각각 ✓/✗, 측정 불능은 「못쟀다」로 따로(✗ 와 다르다 · 0 과 미측정 구분).
 *   전부 ✓ 일 때만 exit 0. 하나라도 ✗ 또는 못쟀다면 exit 1.
 */
const path = require('path');
const die = (m) => { console.error('[관통왕복시험] ' + m); process.exit(1); };

const 골격 = require(path.join(__dirname, '..', 'lib', '왕복골격.js'));   // 공통 머리 — 왕복 공용
const { 오늘과제, 몽골날짜, 시간대 } = require(path.join(__dirname, '..', 'lib', '오늘과제.js'));
// 동의 귀속 — 술어를 여기 다시 적지 않는다(`lib/동의게이트.js` 가 유일 정본)
const { 지금유효id식 } = require(path.join(__dirname, '..', 'lib', '동의게이트.js'));
// source_kind 는 표 하나에서만 나온다 — 값을 여기 박으면 사건을 늘린 날 조용히 갈라진다.
const { 사건출처 } = require(path.join(__dirname, '..', 'lib', '사건출처.js'));
/* ㉢ 줄의 «말»과 절단 상한 — V3·V4 의 기대값을 **정본 조립기에서 파생**시키는 재료다.
 * 기대 문자열을 손으로 다시 적으면 접두·상한이 바뀌는 날 시험만 초록으로 남는다. */
const { 시즌줄 } = require(path.join(__dirname, '..', 'lib', '시즌맥락.js'));
const { 과제요약, 축줄상한 } = require(path.join(__dirname, '..', 'lib', '과제요약.js'));
// V4 ⓑ — correct 의 요청 조립을 **순수층으로** 부른다(벤더 0 · fetch 0).
const { 요청몸통 } = require(path.join(__dirname, '..', 'lib', '교정엔진.js'));

/* 왕복 게이트 스코프 — 이 시험이 부르는 함수는 deliver 하나뿐이다(correct 는 순수층만 · 워커 0회).
 * ⚠ 부르는 함수보다 좁으면 게이트가 옛 판을 초록으로 잰다(lib/왕복골격.js:22-25). */
const 게이트함수들 = ['deliver'];

const 날전 = (오늘, n) => {
  const d = new Date(`${오늘}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const q = (s) => String(s).replace(/'/g, "''");

async function main() {
  const { ref, sql, 실행, service_role: service, 확인, 치명확인, 보고 } =
    await 골격.열기('관통왕복시험', { 함수목록: 게이트함수들 });

  /* deliver 호출부 — 배달왕복시험.js:76-92 승계: 5xx·비 JSON 만 짧게 재시도하고 4xx 는 판정
   * 재료라 그대로 돌려준다. «몇 번 만에 됐나»는 보고 꼬리에 남긴다(조용한 초록 금지). */
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
  const 표 = `t${Date.now().toString(36)}`;   // 이번 회차의 학생을 가르는 표식 — 회차마다 새 학생
  const 판 = (await sql(`select name from engine.schema_migrations order by version desc limit 1`))[0].name.match(/_(c\d+)\.sql$/)[1];
  /* [08-27 · «장부 ↔ 실물» 한 칸] 착지판(DB착지판.json)이 방금 읽은 DB 실물과 같은가 —
   * 저장소 안 검사(tests/계약.test.js)는 DB 실물을 **원리상 못 본다**(부어진 조각도 「대기 중」으로 읽어
   * 초록 — 그 틈으로 장부가 c11 에 멈춘 채 여드레를 산 것이 08-25 실사고다). 이 시험은 어차피
   * 원격 DB 에 접속해 있으니(추가 왕복 0) 여기서 그 대조를 «항상» 낸다. 갈리면 이 회차는 빨갛다 —
   * 장부가 거짓인 채의 초록 왕복은 왕복이 아니라 분장이다.
   * [사각] 이 칸이 «안» 보는 것: 조준 판(리허설/운영) 반대쪽 DB · 이미 행에 박힌 옛 판 값(소급 불가). */
  {
    const 착지 = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'supabase', 'DB착지판.json'), 'utf8'));
    const 장부판 = String(착지.판 ?? 착지.version ?? 착지.contract_ver ?? '').trim();
    if (!장부판) throw new Error('착지판 장부에서 판을 못 읽었다(DB착지판.json 키 확인) — 「못 쟀다」는 「같다」가 아니라 이 회차를 세운다');
    if (장부판 !== 판) {
      throw new Error(`착지판 장부(${장부판})와 DB 실물(${판})이 갈렸다 — 부었으면 장부도 같은 커밋에서 올린다(supabase/DB착지판.json · 08-25 여드레 실사고의 그 자리)`);
    }
    console.log(`  ✅ 착지판 장부 = DB 실물 = ${판}`);
  }
  const D1 = 날전(오늘, 1), D2 = 날전(오늘, 2), D3 = 날전(오늘, 3);

  /* ── V1~V5 장부 — 확인(초록/빨강)과 별개로 «어느 검증점의 것인가»를 든다.
   * 측정 불능(전제 미충족)은 ✗ 가 아니라 «못쟀다»로 가른다(명세 ④ — 0 과 미측정 구분). */
  const 칸들 = ['V1', 'V2', 'V3', 'V4', 'V5'];
  const V결과 = Object.fromEntries(칸들.map((k) => [k, []]));
  const 못쟀다표 = {};
  const 잰다 = (칸, 이름, 조건, 실제) => { const r = 확인(`${칸} ${이름}`, 조건, 실제); V결과[칸].push(r); return r; };
  const 못쟀다 = (칸, 이유) => {
    못쟀다표[칸] = 못쟀다표[칸] ? `${못쟀다표[칸]} · ${이유}` : 이유;
    console.log(`  ⚠ ${칸} 못쟀다 — ${이유}`);
  };
  const 상태 = (칸) => (못쟀다표[칸] ? '못쟀다'
    : V결과[칸].length === 0 ? '못쟀다'            // 검사 0건 = 미실행이지 통과가 아니다(F207)
      : V결과[칸].every(Boolean) ? '✓' : '✗');

  /* ══ 준비 ① — 학생 둘 + ㉠ (급수·goal_track 을 서로 다르게 · 둘 다 Lv3+ = 생성 «대상») ══
   * Lv1·Lv2 로 심으면 비대상(초급)이라도 draft 는 서지만, 대상 두 명이어야 「요약 필수」
   * (마이그 v5.13-a)까지 같은 길을 지난다. */
  console.log('■ 준비 ① — 관통 학생 2명 · ㉠ 급수·목표를 가른다 (A Lv3/study · B Lv5/work)');
  const 학생들 = await sql(`
    insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver, is_test)
    values ('${표}-관통A','관통A','Lv3','study','${판}', true),
           ('${표}-관통B','관통B','Lv5','work','${판}', true)
    returning learner_id, student_code`);
  const id = Object.fromEntries(학생들.map((r) => [r.student_code.endsWith('관통A') ? 'A' : 'B', r.learner_id]));
  const 급수 = { A: 'Lv3', B: 'Lv5' };
  await sql(`
    insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
    values ('${id.A}'::uuid,'v18.9', now() - interval '30 days','${판}','tools/관통왕복시험.js'),
           ('${id.B}'::uuid,'v18.9', now() - interval '30 days','${판}','tools/관통왕복시험.js')`);

  /* ══ 준비 ② — ㉡ 원신호 (배정 ≥1 + 제출 + 확신도 퀴즈 · A/B 리듬·확신도를 다르게) ══
   * · 배정 행 = learning_events + submissions 쌍(due_at 필수 — 마감여유축은 due_at 있는 배정만
   *   잰다 · lib/학습자상태.js:359). due_at 식은 deliver 와 같은 형태(다음날 자정 현지).
   * · 제출은 각 배정 «뒤» 시각 — 리듬축이 배정↔제출을 구간으로 잇는다(:354-356).
   * · occurred_at 은 전부 동의 뒤 · 30일 창 안 · **오늘이 아니다** — 오늘 키(task:{id}:{오늘})를
   *   먼저 쓰면 구제가 「이미배정」으로 접혀 draft 가 영영 안 선다(jobs_load_one:1352-1361).
   * · 🔴 제출에 body_original 을 안 싣는다 — 과금 0 근거(머리말 💰 셋째). */
  console.log('\n■ 준비 ② — ㉡ 원신호 (A 제출 3·마감 전 / B 제출 1·지각 · 확신도 low/guess)');
  const 배정심기 = async (학생, 날) => {
    const 스냅 = 오늘과제({ 날짜: 날, 첫날: true }).task_snapshot;
    await sql(`
      with ev as (
        insert into engine.learning_events
          (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
           level_snapshot, consent_ver, consent_id, degraded, source_kind, payload, schema_ver)
        values ('${id[학생]}'::uuid,'task.assigned','발화녹음','ai',
                '${날}T04:00:00Z'::timestamptz, 'task:${id[학생]}:${날}',
                '${급수[학생]}','v18.9', ${지금유효id식(`'${id[학생]}'::uuid`)}, false,
                '${사건출처('task.assigned')}'::engine.source_kind, '{"ver":1}'::jsonb, '${판}')
        returning event_id)
      insert into engine.submissions
        (event_id, task_type, task_ref, task_snapshot, occurred_at, schema_ver, due_at, due_ver)
      select event_id, '발화녹음', 'task-${날}',
             '${q(JSON.stringify(스냅))}'::jsonb, '${날}T04:00:00Z'::timestamptz, '${판}',
             ('${날}'::date + 1)::timestamp at time zone '${시간대}', 'due.v1' from ev`);
  };
  const 제출심기 = async (학생, 날, 시분) => (await sql(`
    with ev as (
      insert into engine.learning_events
        (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
         level_snapshot, consent_ver, consent_id, degraded, source_kind, payload, schema_ver)
      values ('${id[학생]}'::uuid,'submission.created','발화녹음','learner',
              '${날}T${시분}:00Z'::timestamptz, 'sub:${id[학생]}:${날}',
              '${급수[학생]}','v18.9', ${지금유효id식(`'${id[학생]}'::uuid`)}, false,
              '${사건출처('submission.created')}'::engine.source_kind,
              '{"ver":1,"attempt_no":1}'::jsonb, '${판}')
      returning event_id)
    insert into engine.submissions (event_id, task_type, task_ref, task_format, occurred_at, schema_ver)
    select event_id, '발화녹음', 'task-${날}', '낭독', '${날}T${시분}:00Z'::timestamptz, '${판}' from ev
    returning submission_id`))[0].submission_id;
  const 퀴즈심기 = (학생, 날, 확신) => sql(`
    insert into engine.learning_events
      (learner_id, event_type, actor_kind, occurred_at, idempotency_key,
       level_snapshot, consent_ver, consent_id, degraded, source_kind, payload, schema_ver)
    values ('${id[학생]}'::uuid,'quiz.answered','learner','${날}T11:00:00Z'::timestamptz,
            'quiz:${id[학생]}:${날}','${급수[학생]}','v18.9', ${지금유효id식(`'${id[학생]}'::uuid`)},
            false, '${사건출처('quiz.answered')}'::engine.source_kind,
            '${q(JSON.stringify({ ver: 1, confidence: 확신 }))}'::jsonb, '${판}')`);

  for (const 날 of [D3, D2, D1]) { await 배정심기('A', 날); await 배정심기('B', 날); }
  /* A — 세 배정 전부 마감 전에 냈다(10:00Z < 그날 due 16:00Z=다음날 00:00 현지). V4 ⓐ 의 기준
   * 제출은 D3 것 하나로 못 박는다 — 시즌이 그 날짜를 덮는지를 아래 준비 ③ 이 같은 날짜로 챙긴다. */
  const A기준제출 = await 제출심기('A', D3, '10:00');
  await 제출심기('A', D2, '10:00');
  await 제출심기('A', D1, '10:00');
  await 퀴즈심기('A', D2, 'low');
  /* B — 제출 1건뿐이고 그마저 지각(20:00Z > D2 배정의 due 16:00Z · D1 배정 구간 시작 04:00Z 전).
   * → 리듬축이 A(제출률=1·지각=0)와 B(제출률=0.33·지각=1)로 갈린다. 확신도도 low↔guess 로 갈린다. */
  await 제출심기('B', D2, '20:00');
  await 퀴즈심기('B', D2, 'guess');
  await 퀴즈심기('B', D1, 'guess');
  {
    const [{ 배정수, 제출수, 퀴즈수 }] = await sql(`
      select count(*) filter (where event_type = 'task.assigned') as 배정수,
             count(*) filter (where event_type = 'submission.created') as 제출수,
             count(*) filter (where event_type = 'quiz.answered') as 퀴즈수
        from engine.learning_events
       where learner_id in ('${id.A}'::uuid, '${id.B}'::uuid)`);
    확인('준비 ② 분모 — 배정 6 · 제출 4 · 퀴즈 3 이 앉았다(증분 — 이 회차 학생만 센다)',
      Number(배정수) === 6 && Number(제출수) === 4 && Number(퀴즈수) === 3, { 배정수, 제출수, 퀴즈수 });
  }

  /* ══ 준비 ③ — ㉢ 시즌 + 나침반 (season_goal 을 가른다 · A 는 절단 문턱 50cp 를 넘긴다) ══
   * · engine.season 은 겹침을 물리로 막는다(season_no_overlap_c11) — **오늘을 덮는 행이 이미
   *   있으면 재사용**하고, 없을 때만 세운다. 넓은 행이 겹쳐 거절되면 하루짜리로 물러선다.
   * · season_compass 는 키 CHECK «정확 일치»다(마이그 20260812140000:141-151): 입학 행
   *   (self_in_5y_changed null) = why_learning·self_in_5y·topik_use·season_goal 정확 4키.
   *   recorded_by 명시 · unique(learner_id, season_id)는 새 학생이라 충돌 없음. */
  console.log('\n■ 준비 ③ — ㉢ 시즌·나침반 (A 50cp 초과 · B 짧게 · 서로 다르게)');
  const A시즌목표 = '토픽 4급에 합격해서 한국 대학교 기숙사에 들어가고 장학금 신청까지 혼자 해내는 것';
  const B시즌목표 = '한국 드라마를 자막 없이 보는 것';
  // V3 의 분모 — 절단 문턱을 못 넘는 픽스처면 아래 「절단 후 포함」 검사가 공허해진다.
  치명확인('준비 ③ 분모 — A 시즌 목표 줄이 절단 문턱(50cp)을 넘는다',
    Array.from(시즌줄(A시즌목표)).length > 축줄상한);

  const 시즌찾기 = async (날) => (await sql(`
    select season_id from engine.season
     where starts_on <= '${날}'::date and (ends_on is null or ends_on >= '${날}'::date)
     limit 1`))[0]?.season_id ?? null;
  const 시즌세우기 = async (code, 시작, 끝) => {
    const r = await 실행(`
      insert into engine.season (code, textbook, starts_on, ends_on, schema_ver)
      values ('${code}', '관통왕복 리허설 교재', '${시작}'::date, '${끝}'::date, '${판}')
      returning season_id`);
    return r.ok ? r.행[0].season_id : null;   // 겹침(exclude) 거절도 결과다 — 아래가 물러선다
  };
  // 한 행이 D3~오늘을 다 덮으면 그 하나로 간다(오늘 = 배달 걷기 기준 · D3 = correct 걷기 기준).
  let 시즌한벌 = (await sql(`
    select season_id from engine.season
     where starts_on <= '${D3}'::date and (ends_on is null or ends_on >= '${오늘}'::date)
     limit 1`))[0]?.season_id ?? null;
  if (!시즌한벌) 시즌한벌 = await 시즌세우기(`관통-${표}`, 날전(오늘, 32), 오늘);
  const 시즌D3 = 시즌한벌 ?? (await 시즌찾기(D3)) ?? await 시즌세우기(`관통-${표}-${D3}`, D3, D3);
  const 시즌오늘 = 시즌한벌 ?? (await 시즌찾기(오늘)) ?? await 시즌세우기(`관통-${표}-${오늘}`, 오늘, 오늘);
  if (!시즌오늘) 못쟀다('V3', '오늘을 덮는 시즌 행을 못 세웠다(겹침 거절) — 리허설 시즌 잔재를 본다');
  if (!시즌D3) 못쟀다('V4', `제출 날짜(${D3})를 덮는 시즌 행을 못 세웠다(겹침 거절) — ⓐ 걷기만 불능`);

  const 나침반심기 = (학생, season_id, goal) => sql(`
    insert into engine.season_compass
      (learner_id, season_id, answers, goal_track_at_open, recorded_by, schema_ver)
    values ('${id[학생]}'::uuid, '${season_id}'::uuid,
            '${q(JSON.stringify({
    why_learning: '한국 대학 진학', self_in_5y: '한국에서 일하는 나',
    topik_use: '4급 응시 예정', season_goal: goal,
  }))}'::jsonb,
            '${학생 === 'A' ? 'study' : 'work'}', 'tools/관통왕복시험.js', '${판}')
    on conflict (learner_id, season_id) do nothing`);
  for (const s of new Set([시즌D3, 시즌오늘].filter(Boolean))) await 나침반심기('A', s, A시즌목표);
  if (시즌오늘) await 나침반심기('B', 시즌오늘, B시즌목표);
  console.log(`  준비 완료 — 표식 ${표} · 오늘 ${오늘} · 판 ${판} · 시즌 ${시즌한벌 ? '한벌' : '날짜별'}`);

  /* ══ 배달 — 활성 게이트(임시) 안에서 구제 단건 ×2 ══
   * 왜 구제인가: 과제요약(§6-2)은 생성 모드 전용이라 게이트 없이는 V2·V3·V5 를 원리상 못 잰다
   * (명세 ② · deliver/index.ts:279 「현행 경로는 그 칸을 안 읽는다」). `?맥락=구제&learner_id=`
   * 단건은 그 학생 것만 만들고(E1 남의 일감 무접촉) draft 를 세운 뒤 벤더 0 으로 착지까지 간다. */
  console.log('\n■ 배달 — 활성 게이트(임시) 안에서 deliver ?맥락=구제 단건 ×2 (벤더 0 · 워커 0회)');
  {
    const 잔존전 = (await sql(`select to_regprocedure('engine.gen_active_from()') is not null as b`))[0].b;
    if (잔존전) {
      // 규율 ① — 이전 죽은 실행의 게이트가 남아 있으면 먼저 걷고 시작한다(명세 ②).
      console.log('  ⚠ 활성 게이트 잔존 발견 — 이전 실행이 못 걷은 것. 걷고 시작한다');
      await sql(`drop function if exists engine.gen_active_from()`);
    }
  }
  let 응답A = null, 응답B = null;
  try {
    // 생성왕복시험.js:853-855 방식 — 과거 시작일로 세워 오늘을 활성으로 만든다.
    await sql(`create or replace function engine.gen_active_from() returns date language sql immutable as $f$ select date '2020-01-01' $f$`);
    응답A = await 호출(`?${new URLSearchParams({ 맥락: '구제', learner_id: id.A })}`);
    응답B = await 호출(`?${new URLSearchParams({ 맥락: '구제', learner_id: id.B })}`);
  } finally {
    // 규율 ② — 걷기를 try/finally 로 보장한다. 잔존하면 다른 왕복·라이브 호출자가 400 을 맞는다.
    await sql(`drop function if exists engine.gen_active_from()`);
    확인('게이트 걷힘 — gen_active_from 잔존 false',
      (await sql(`select to_regprocedure('engine.gen_active_from()') is null as b`))[0].b === true);
  }

  /* 응답 갈래 — 착지 아닌 갈래 중 «전제 미충족»(모델 미설정·게임날)은 ✗ 가 아니라 못쟀다다. */
  const 배달판정 = (응답) => {
    if (!응답 || 응답.status !== 200) return { 착지: false, 왜: `HTTP ${응답 && 응답.status} ${JSON.stringify(응답 && 응답.몸).slice(0, 160)}` };
    const 결과 = (응답.몸 || {}).결과;
    if (결과 === '구제착지') return { 착지: true };
    if (결과 === '실행판없음') return { 착지: false, 전제: 'GENERATION_MODEL 미설정(전멸일 ㉯ 실행판 조립 불가) — 모델 픽은 유호님 몫' };
    if (결과 === '게임' || 결과 === '게임실패') return { 착지: false, 전제: `오늘이 게임 갈래로 빠졌다(결과=${결과})` };
    return { 착지: false, 왜: `결과=${결과} ${JSON.stringify(응답.몸).slice(0, 160)}` };
  };
  const A판 = 배달판정(응답A), B판 = 배달판정(응답B);
  const 배달섰다 = A판.착지 && B판.착지;
  if (A판.전제 || B판.전제) {
    for (const k of ['V1', 'V2', 'V3', 'V5']) 못쟀다(k, A판.전제 || B판.전제);
  } else {
    잰다('V1', 'A 배달이 «구제착지»로 닫혔다 — job/draft 가 서고 벤더 0 으로 착지', A판.착지, A판.왜 || 응답A.몸);
    잰다('V2', 'B 배달도 «구제착지» — 비교할 두 draft 가 같은 회차에 섰다', B판.착지, B판.왜 || 응답B.몸);
  }

  /* draft·job 읽기 — 생성왕복시험 `드래프트()` 참조(learner_id + assign_date 로 그 행만 · 증분). */
  const 잡읽기 = async (학생) => (await sql(`
    select status, outcome,
           event_draft ->> '요약' as 요약,
           event_draft ->> 'estimator_version' as 드래프트판,
           (event_draft -> 'estimator_confidence') is not null
             and jsonb_typeof(event_draft -> 'estimator_confidence') <> 'null' as 확신실림,
           jsonb_array_length(coalesce(event_draft -> 'evidence_refs' -> 'axes_used', '[]'::jsonb)) as 축수
      from engine.generation_jobs
     where learner_id = '${id[학생]}'::uuid and assign_date = '${오늘}'::date`))[0] || null;
  const A잡 = 배달섰다 ? await 잡읽기('A') : null;
  const B잡 = 배달섰다 ? await 잡읽기('B') : null;

  /* ══ V1 — 배달 사건의 스탬프 다섯 칸 (㉡) ══
   * learning_events 는 append-only — **그 키만** 읽는다(멱등키 = intervention:{id}:{날짜} ·
   * 절대 개수 금지 — 명세 ②). 다섯 칸의 착지 SQL = 마이그 20260821120000 jobs_finalize
   * :976-997(intervention_id·estimator_version·estimator_confidence·evidence_refs·policy_ver). */
  console.log('\n■ V1 — 배달 사건의 스탬프 다섯 칸 (㉡)');
  if (배달섰다) {
    const [개입행] = await sql(`
      select intervention_id, estimator_version, estimator_confidence, policy_ver,
             (evidence_refs is not null) as 근거있음,
             jsonb_array_length(coalesce(evidence_refs -> 'axes_used', '[]'::jsonb)) as 축수,
             payload ->> 'generation_outcome' as 낙인
        from engine.learning_events
       where learner_id = '${id.A}'::uuid and event_type = 'intervention.delivered'
         and idempotency_key = 'intervention:${id.A}:${오늘}'`);
    const [배정행] = await sql(`
      select intervention_id from engine.learning_events
       where learner_id = '${id.A}'::uuid and event_type = 'task.assigned'
         and idempotency_key = 'task:${id.A}:${오늘}'`);
    잰다('V1', '스탬프 다섯 칸 전부 비null — estimator 3열 + policy_ver + intervention_id',
      !!개입행 && 개입행.intervention_id != null && 개입행.estimator_version != null
        && 개입행.estimator_confidence != null && 개입행.근거있음 === true && 개입행.policy_ver != null,
      개입행);
    잰다('V1', '스탬프가 빈 껍데기가 아니다 — evidence_refs.axes_used ≥ 1(상태 계산이 죽었으면 0)',
      !!개입행 && Number(개입행.축수) >= 1, 개입행 && 개입행.축수);
    잰다('V1', '개입·배정이 같은 intervention_id 를 든다 — 성과 계승의 끈(배달왕복 ② 와 같은 축)',
      !!개입행 && !!배정행 && 개입행.intervention_id === 배정행.intervention_id,
      [개입행 && 개입행.intervention_id, 배정행 && 배정행.intervention_id]);
    /* ⚠ 「응답 `상태없음` 표식 부재」의 이 경로 등가물 — 머리말 ⚠ 절 그대로:
     *   현행 경로의 응답 칸(:992-995)은 여기 원리상 없으므로, 같은 함정(null 스탬프 성공)을
     *   생성 경로의 표식 셋(outcome·낙인·draft 상태 실림)으로 잰다. */
    잰다('V1', '상태없음 계열 표식 부재 — outcome=구제경로(≠상태없음) · draft 에 상태가 실렸다',
      !!A잡 && A잡.outcome === '구제경로' && A잡.outcome !== '상태없음'
        && !!개입행 && 개입행.낙인 === '구제경로'
        && String(A잡.드래프트판 || '').trim() !== '' && A잡.확신실림 === true && Number(A잡.축수) >= 1,
      { job: A잡, 낙인: 개입행 && 개입행.낙인 });
  }

  /* ══ V2 — 과제요약이 상태를 반영했다 (㉡ · A/B 비교) ══
   * 요약의 정본 조립 = lib/과제요약.js(축 순서 그대로 · 널 축은 안 싣는다). 기대 실값:
   *   A 리듬 = 제출 3/3 → 「제출률=1」 · 자기인식 low 1 → 「저확신=1」
   *   B 리듬 = 제출 1/3 → 「제출률=0.33」 · 자기인식 guess 2 → 「찍음=2」 */
  console.log('\n■ V2 — 과제요약이 상태를 반영했다 (㉡ · 두 학생 비교)');
  if (배달섰다) {
    잰다('V2', '두 draft 의 요약이 비어 있지 않다(분모 — 생성 대상은 요약 필수 · v5.13-a)',
      !!A잡 && !!B잡 && String(A잡.요약 || '').trim() !== '' && String(B잡.요약 || '').trim() !== '',
      { A: A잡 && A잡.요약, B: B잡 && B잡.요약 });
    잰다('V2', '상태를 다르게 심은 A·B 의 요약이 서로 다르다',
      !!A잡 && !!B잡 && A잡.요약 !== B잡.요약, { A: A잡 && A잡.요약, B: B잡 && B잡.요약 });
    잰다('V2', 'A 요약에 상태 유래 실값 — 「제출률=1 」·「저확신=1」(마감 전 3건 · low 1건)',
      !!A잡 && String(A잡.요약 || '').includes('제출률=1 ') && String(A잡.요약 || '').includes('저확신=1'),
      A잡 && A잡.요약);
    잰다('V2', 'B 요약에 상태 유래 실값 — 「제출률=0.33」·「찍음=2」(지각 1건 · guess 2건)',
      !!B잡 && String(B잡.요약 || '').includes('제출률=0.33') && String(B잡.요약 || '').includes('찍음=2'),
      B잡 && B잡.요약);
  }

  /* ══ V3 — 시즌 목표가 과제요약에 «50cp 절단 후» 동승했다 (㉢) ══
   * 기대줄은 손으로 다시 절단하지 않는다 — **정본 조립기(과제요약)를 빈 상태로 불러** 시즌 줄
   * 하나만 렌더시킨 것이 기대값이다(절단 규칙이 바뀌면 기대도 같이 바뀐다 · 사본 0). */
  console.log('\n■ V3 — 시즌 목표의 요약 동승 «50cp 절단 후» (㉢)');
  if (배달섰다 && !못쟀다표.V3) {
    const 기대절단줄 = 과제요약(
      { estimator_version: 'x', estimator_confidence: 0, evidence_refs: {}, 축: {} },
      { 시즌목표: A시즌목표 },
    ).요약;
    잰다('V3', 'A 요약에 절단된 시즌 줄이 실렸다 — 「이번 시즌 목표: …」(정본 렌더러 파생 기대값)',
      !!A잡 && String(A잡.요약 || '').includes(기대절단줄), { 기대: 기대절단줄, 실제: A잡 && A잡.요약 });
    잰다('V3', '원문 그대로는 안 실렸다 — 절단(50cp)이 실제로 일어났다(V4 무절단과 규격이 다르다)',
      !!A잡 && !String(A잡.요약 || '').includes(A시즌목표), A잡 && A잡.요약);
  }

  /* ══ V4 — correct 조립층: 걷기 + [학생 맥락] 조립 (㉢ · 벤더 호출 0) ══
   * ⓐ correct/index.ts:443-462 와 **동일 조건**의 걷기 SQL 을 A 의 실제 제출 행에 직접 태운다 —
   *    기준은 「그 제출의 날」(occurred_at 현지 날짜 · 첨삭은 비동기라 달력 기준이 아니다).
   *    ⚠ 문장 칸은 null 이 정상이다 — body 를 일부러 안 실었다(머리말 💰 셋째). 걷기의 과녁은
   *    시즌목표·급수 두 칸이고 그 둘은 body 와 독립이다.
   * ⓑ lib/교정엔진.js 요청몸통을 순수층으로 불러 [학생 맥락]\n{시즌줄} 이 학생 문장 **앞**에
   *    «무절단»으로 실리는지 잰다(:147-149 — correct 즉시·배치 두 통로가 같은 조립을 쓴다). */
  console.log('\n■ V4 — correct 조립층: 시즌 걷기(ⓐ) + [학생 맥락] 선두 동승(ⓑ) (㉢)');
  let 걷은 = null;
  if (!못쟀다표.V4) {
    걷은 = (await sql(`
      select btrim(coalesce(s.body_original, s.transcript)) as 문장,
             e.level_snapshot as 급수,
             (select c.answers->>'season_goal'
                from engine.season sn
                join engine.season_compass c
                  on c.season_id = sn.season_id and c.learner_id = e.learner_id
               where sn.starts_on <= (e.occurred_at at time zone '${시간대}')::date
                 and (sn.ends_on is null or sn.ends_on >= (e.occurred_at at time zone '${시간대}')::date)
               limit 1) as 시즌목표
        from engine.submissions s
        join engine.learning_events e on e.event_id = s.event_id
       where s.submission_id = '${A기준제출}'::uuid`))[0] || null;
    잰다('V4', `ⓐ 제출 날짜(${D3}) 기준 걷기 — A 시즌 목표가 «무절단 원문»으로 걸린다`,
      !!걷은 && 걷은.시즌목표 === A시즌목표, 걷은);
    잰다('V4', 'ⓐ 급수도 같은 걷기에 실린다(level_snapshot → 요청 조립의 급수 재료)',
      !!걷은 && 걷은.급수 === 급수.A, 걷은 && 걷은.급수);
  }
  {
    /* ⓑ — 걷기가 준비 실패(시즌 겹침)여도 순수 조립층 자체는 잰다: 그때는 A 목표 원문을 그대로
     * 넣는다(맥락 조립부 correct/index.ts:466 「맥락 = 시즌줄(행.시즌목표)」와 같은 함수). */
    const 조립목표 = (걷은 && 걷은.시즌목표) ? 걷은.시즌목표 : A시즌목표;
    const 맥락 = 시즌줄(조립목표);
    const 학생문장 = '어제 도서관에 공부했어요';
    const 몸통 = 요청몸통({ 지시문: '관통시험 지시문', 문장: 학생문장, 급수: 급수.A, 맥락 });
    const 내용 = String(몸통.messages[0].content);
    잰다('V4', 'ⓑ [학생 맥락]\\n{시즌줄} 이 학생 문장 «앞»에 실린다(교정엔진.js:147-149)',
      내용.startsWith(`[학생 맥락]\n${맥락}\n\n`)
        && 내용.indexOf(조립목표) !== -1 && 내용.indexOf(조립목표) < 내용.indexOf('학생 문장:')
        && 내용.endsWith(`학생 급수: ${급수.A}\n학생 문장: ${학생문장}`),
      내용.slice(0, 160));
    잰다('V4', 'ⓑ 무절단 — 50cp 초과 원문이 통째로 실리고 절단 표(…)가 없다(V3 과 규격이 다르다)',
      내용.includes(A시즌목표) === (조립목표 === A시즌목표) && !내용.includes('…'), 내용.slice(0, 160));
    const 민몸통 = 요청몸통({ 지시문: '관통시험 지시문', 문장: 학생문장, 급수: 급수.A, 맥락: null });
    잰다('V4', 'ⓑ 맥락이 없으면 블록 자체가 없다 — v1 바이트 동일 폴백(시즌맥락.js 불변식)',
      !String(민몸통.messages[0].content).includes('[학생 맥락]'), 민몸통.messages[0].content);
  }

  /* ══ V5 — ㉠ 조각(급수·목표)이 요약에 실렸다 ══
   * 조각 형식의 정본 = lib/과제요약.js:98-99 — 「급수: {값}」 · 「목표: {값}」(값 있으면 필수 ·
   * axes_used 엔 안 센다). ㉠ 의 유일한 세로줄 착지다(명세 ③㉠ — 오류태그 심기는 talk 에 없다). */
  console.log('\n■ V5 — ㉠ 조각(급수·목표)의 요약 동승');
  if (배달섰다) {
    잰다('V5', 'A 요약에 급수 조각 — 「급수: Lv3」(learners.level_current 유래)',
      !!A잡 && String(A잡.요약 || '').includes(`급수: ${급수.A}`), A잡 && A잡.요약);
    잰다('V5', 'A 요약에 목표 조각 — 「목표: study」(learners.goal_track 유래)',
      !!A잡 && String(A잡.요약 || '').includes('목표: study'), A잡 && A잡.요약);
  }

  /* ══ 관통 판정 ══ — V1~V5 각 ✓/✗/못쟀다. 못쟀다는 ✗ 와 다른 사실이지만 관통의 증명은 아니다
   * (명세 ④) — 전부 ✓ 일 때만 초록이고, 아래 마지막 확인이 exit code 까지 그 판정에 묶는다. */
  console.log('\n■ 관통 판정');
  const 줄 = 칸들.map((k) => ({ '✓': '✓', '✗': '✗', 못쟀다: '?' })[상태(k)]).join('');
  console.log(`  ${칸들.map((k) => `${k} ${상태(k)}`).join(' · ')}`);
  for (const [칸, 이유] of Object.entries(못쟀다표)) console.log(`  ⚠ ${칸} 못쟀다 — ${이유}`);
  console.log(`  ${줄}`);
  확인('관통 — V1~V5 전부 ✓ (✗ 0 · 못쟀다 0)',
    칸들.every((k) => 상태(k) === '✓'), 칸들.map((k) => `${k}:${상태(k)}`).join(' '));

  보고(`관통 ${줄} · 오늘 ${오늘} · 표식 ${표}`
    + (재시도누적 ? ` · ⚠ deliver 5xx 재시도 ${재시도누적}회` : ' · deliver 재시도 0'));
}

main().catch((e) => die(String((e && e.message) || e)));
