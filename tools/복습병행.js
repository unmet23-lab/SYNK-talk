#!/usr/bin/env node
/* 복습 병행 출력 — FSRS due 목록을 «보여만 준다» (설계 §6 인수 3 「병행 후 교체」의 병행 쪽)
 *
 * ■ 자리 — 유호 확정 ⓓ 「개원 전 «배선만»」의 마지막 배선이다: 사건·교정 → 파생층(`lib/복습파생`)
 *   → 계산기(`lib/복습스케줄`) → 학생별 due 목록. **아무것도 안 바꾼다** — 재출제 창(appsscript
 *   14일 고정)의 실제 교체는 유호 판정 뒤 한 커밋 몫이고, 그날 이 도구의 산출 모양(≤70자 재료)이
 *   그대로 §8-7 왕복의 「받기」 형식이 된다(정본 = appsscript docs/복습스케줄러_설계.md §8).
 *
 * 🔑 0은 분모와 함께 쓴다 — 리뷰·버림을 갈래로 쪼개 찍는다(유호 확정 08-14). 지금은 게임·퀴즈
 *   팩이 전부 검수확정=false 로 잠겨 있어 «행 0 = 정상»이다 — 좋은 0과 「안 재봤다」를 가르는
 *   것이 이 분모다.
 *
 * 종료 코드 — 0 = 재봤다(행 0 포함) · 2 = 못 쟀다(자격증명·질의 실패).
 *
 * 안전: 읽기 전용(select 만). 운영을 읽을 땐 `SUPABASE_PROJECT_REF=<운영ref>` 덮어쓰기다 —
 *   `--운영` 은 쓰기 승인이라 읽기에 안 붙인다(F462 · 회차장부와 같은 규율).
 *
 * 사용:
 *   node tools/복습병행.js                       # 리허설(.env 과녁)에서 학생별 due
 *   node tools/복습병행.js --기준 2026-09-01     # 판정 기준 시각을 못박는다(재현용 — 없으면 지금)
 *   node tools/복습병행.js --json                # 기계가 읽는 한 줄 (사람글 0)
 */
'use strict';

const 자격증명 = require('../lib/자격증명.js');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');
const { 리뷰파생 } = require('../lib/복습파생.js');
const { 학생카드접기, due카드들 } = require('../lib/복습스케줄.js');

const API = 'https://api.supabase.com/v1/projects';
const 아는플래그 = [...공용플래그, '--기준', '--json'];

let 조용 = false;
const 말 = (...a) => { if (!조용) console.log(...a); };
const json내기 = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

class 멈춤 extends Error {
  constructor(코드, 말) { super(말); this.코드 = 코드; }
}
const die = (m) => { throw new 멈춤(2, m); };

/* 한 문장으로 접는다 — Supabase query API 는 마지막 문장 결과만 준다(회차장부 실측 08-15 그대로).
 * 규모 걱정은 안 한다 — 학원 상한이 108명(㉱)이고 지금 행은 0이다. 무거워지는 날 스냅샷 캐시를
 * 여는 것이 설계가 예약해 둔 자리다(§4 「상태 캐시가 필요하면 그때」). */
const 질의 = `
with 행 as (
  select coalesce(jsonb_agg(to_jsonb(t) order by t.event_id), '[]'::jsonb) as v from (
    select e.event_id, e.learner_id, e.event_type, e.occurred_at, e.retry_of_event_id, e.payload,
           l.student_code,
           case when s.submission_id is null then null else jsonb_build_object(
             'submission_id', s.submission_id, 'task_schema_ver', s.task_schema_ver,
             'task_snapshot', s.task_snapshot, 'body_original', s.body_original) end as submission
      from engine.learning_events e
      left join engine.submissions s on s.event_id = e.event_id
      left join engine.learners l on l.learner_id = e.learner_id
     where e.event_type in ('submission.created', 'quiz.answered')
  ) t
), 교정 as (
  select coalesce(jsonb_agg(to_jsonb(u) order by u.correction_id), '[]'::jsonb) as v from (
    select c.correction_id, c.submission_id, c.actor_kind, c.error_tags, c.verdict,
           c.reviewed_correction_id, c.supersedes, c.created_at
      from engine.corrections c
  ) u
)
select jsonb_build_object('행들', (select v from 행), '교정들', (select v from 교정)) as 값;
`;

async function 쏘기(sql, ref, 토큰) {
  자격증명.질의전용(sql, '복습병행');   // 질의읽기 약속의 런타임 반쪽 — 어기면 여기서 던진다
  const res = await fetch(`${API}/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const 본문 = await res.text();
  if (!res.ok) die(`HTTP ${res.status} — ${본문.slice(0, 400)}`);
  return JSON.parse(본문);
}

/** `--이름 값` 한 쌍 — 값이 없거나 다음 깃발이면 없는 것으로 본다(교정확정과 같은 꼴). */
function 값꺼내기(args, 깃발) {
  const i = args.indexOf(깃발);
  if (i === -1) return null;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : null;
}

/** 갈래 셈을 「전체 = 갈래 + 갈래」 한 줄로 — 0 도 이름과 함께 나온다. */
const 갈래줄 = (셈) => Object.entries(셈).map(([k, v]) => `${k} ${v}`).join(' + ');

async function main() {
  const args = process.argv.slice(2);
  const 플래그오류 = 인자게이트('복습병행', args, 아는플래그);
  if (플래그오류) die(플래그오류);
  const json = args.includes('--json');
  조용 = json;
  const 기준입력 = 값꺼내기(args, '--기준');
  if (기준입력 && !Number.isFinite(Date.parse(기준입력))) die(`--기준 이 시각이 아니다: ${기준입력}`);
  /* 시계는 이 층(도구)만 본다 — lib 둘은 순수라 기준 시각을 «인자»로 받는다(§4 결정성). */
  const 기준 = 기준입력 || new Date().toISOString();

  const e = 자격증명.읽기('복습병행', { 질의읽기: true });
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다 (설정 절차 = tools/원격SQL.js)');
  console.error(`[복습병행] 대상 ▸ ${ref}  읽기 · 기준 ${기준.slice(0, 19)}`);

  const rows = await 쏘기(질의, ref, 토큰);
  const 재료 = (rows && rows[0] && rows[0].값) || {};
  const 행들 = Array.isArray(재료.행들) ? 재료.행들 : [];
  const 교정들 = Array.isArray(재료.교정들) ? 재료.교정들 : [];

  const { 리뷰들, 셈 } = 리뷰파생({ 행들, 교정들 });

  /* 학생별로 접는다 — 표시는 student_code(있으면), 접기는 learner_id 가 축이다. */
  const 코드표 = new Map();
  for (const r of 행들) if (r.learner_id != null && r.student_code) 코드표.set(String(r.learner_id), r.student_code);
  const 학생별 = new Map();
  for (const r of 리뷰들) {
    const k = String(r.learner_id ?? '');
    if (!학생별.has(k)) 학생별.set(k, []);
    학생별.get(k).push(r);
  }
  const 학생들 = [];
  for (const k of [...학생별.keys()].sort()) {
    const 상태들 = 학생카드접기(학생별.get(k));
    const due = due카드들(상태들, 기준);
    학생들.push({
      학생: 코드표.get(k) || k, 리뷰수: 학생별.get(k).length, 카드수: 상태들.size, due,
      /* §8-7 「받기」 형식 미리보기 — 교체일에 appsscript 로 건너갈 그 한 줄(≤70자·기존 로더 동형). */
      재료: due.join(' · ').slice(0, 70),
    });
  }

  const 리뷰합 = Object.values(셈.리뷰).reduce((a, b) => a + b, 0);
  const 버림합 = Object.values(셈.버림).reduce((a, b) => a + b, 0);

  if (json) {
    json내기({ 도구: '복습병행', 과녁: ref, 기준, 행: 행들.length, 교정: 교정들.length, 리뷰: 리뷰합, 버림: 버림합, 셈, 학생들 });
    return 0;
  }

  말(`\n■ 재료 — 행 ${행들.length} · 교정 ${교정들.length}`);
  말(`■ 리뷰 ${리뷰합} = ${갈래줄(셈.리뷰)}`);
  말(`■ 버림 ${버림합} = ${갈래줄(셈.버림)}`);
  if (!행들.length) {
    말('  (행 0 — 지금은 정상이다: 게임·퀴즈 팩이 전부 검수확정=false 로 잠겨 있고 실학생도 0이다.');
    말('   이 0 은 「좋은 0」이 아니라 「재료가 아직 없다」다 — 첫 행이 쌓이는 날 이 도구가 값을 낸다.)');
  }
  if (학생들.length) {
    말(`\n■ 학생별 due (기준 ${기준.slice(0, 10)}) — 보여줄 뿐, 아무것도 안 바꾼다(ⓓ)`);
    for (const s of 학생들) {
      말(`  ${s.학생} — 리뷰 ${s.리뷰수} · 카드 ${s.카드수} · due ${s.due.length}`);
      if (s.due.length) 말(`     오늘 볼 것: ${s.재료}`);
    }
  } else if (행들.length) {
    말('\n  리뷰로 접힌 행이 0이다 — 버림 갈래를 보라(어느 자격이 비었는지 위 한 줄이 말한다).');
  }
  return 0;
}

main().then((c) => { process.exitCode = c; }).catch((err) => {
  if (err instanceof 멈춤) { console.error(`[복습병행] ${err.message}`); process.exitCode = err.코드; return; }
  console.error('[복습병행] 죽음 —', err && err.message ? err.message : err);
  process.exitCode = 2;
});
