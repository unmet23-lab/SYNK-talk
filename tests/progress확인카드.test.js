'use strict';
// 실제 progress 핸들러 + 실제 학습자상태/카드 파생을 실행한다. SQL·인증만 합성한다.
// DB 엔진의 실행 증거는 아니지만, 원행 조회 실패를 null로 삼키는 과거 회귀를 응답에서 잡는다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 세우기 } = require('./lib/서버함수세우기.js');
const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'supabase/functions/progress/index.ts'), 'utf8');
const 기준 = '2026-09-11T03:00:00.000Z';
const 오늘 = '2026-09-11';

function 재료() {
  const events = [], submissions = [];
  for (let d = 3; d >= 1; d--) {
    const at = new Date(Date.parse(기준) - d * 86400000).toISOString();
    events.push({ event_id: `a${d}`, event_type: 'task.assigned', occurred_at: at, task_type: '발화녹음', payload: null });
    submissions.push({ event_id: `a${d}`, due_at: new Date(Date.parse(at) + 43200000).toISOString(), task_schema_ver: 'c16' });
    events.push({ event_id: `s${d}`, event_type: 'submission.created', occurred_at: new Date(Date.parse(at) + 3600000).toISOString(), task_type: '발화녹음', payload: null });
    submissions.push({ event_id: `s${d}`, due_at: null, task_schema_ver: 'c16' });
  }
  // submissions가 없는 이탈도 원행 집합에 남아야 한다(left join이 필요한 이유).
  events.push({ event_id: 'leave1', event_type: 'session.abandoned', occurred_at: '2026-09-10T04:00:00.000Z', task_type: '발화녹음', payload: { compose_meta: { ignored_fixture: true } } });
  return { events, submissions };
}

async function 호출(원문 = source) {
  const rows = 재료(), queries = [], errors = [];
  let 전달원행 = null;
  const sql = async (parts) => {
    const q = parts.join('?'); queries.push(q);
    if (q.includes('최신조각')) return [{ learner_id: 'fixture', 최신조각: '20260907200000_sunday_bundles_c16.sql' }];
    if (q.includes('as 첫날인가')) return [{ 첫날인가: true }];
    if (q.includes('select e.event_id')) {
      const fields = [...q.slice(0, q.indexOf('case when')).matchAll(/\b([es])\.([a-z_]+)/g)];
      for (const [, alias, field] of fields) {
        const sample = alias === 'e' ? rows.events[0] : rows.submissions[0];
        if (!(field in sample)) throw new Error(`column ${alias}.${field} does not exist`);
      }
      assert.match(q, /left join engine\.submissions s on s\.event_id = e\.event_id/, '이탈 원행을 잃거나 다른 제출을 붙였다');
      return rows.events.map((e) => {
        const s = rows.submissions.find((r) => r.event_id === e.event_id);
        return { ...e, due_at: s?.due_at ?? null, task_schema_ver: s?.task_schema_ver ?? null };
      });
    }
    if (q.includes('as 부정쌍들')) return [{ 오늘답수: 0, 부정쌍들: [], 오늘쌍들: [] }];
    if (q.includes('group by 1')) return [];
    if (q.includes("'goal.responded'")) return [{ 오늘답수: 0 }];
    throw new Error('미등록 합성 SQL');
  };
  const 실제상태 = require('../lib/학습자상태.js');
  const modules = {
    'npm:postgres@3.4.4': () => sql,
    './토큰.mjs': { 토큰주체: () => 'fixture-auth', 발급시각: () => 1, 살아있는학생: () => 'fixture-student' },
    './오늘과제.mjs': { 몽골날짜: () => 오늘, 시간대: 'Asia/Ulaanbaatar' },
    './계약판.mjs': require('../lib/계약판.js'),
    './성향확인.mjs': require('../lib/성향확인.js'),
    './목표확인.mjs': require('../lib/목표확인.js'),
    './학습자상태.mjs': { 학습자상태: (행들, 옵션) => { 전달원행 = 행들; return 실제상태.학습자상태(행들, 옵션); } },
    './CORS.mjs': { 예비응답: () => null, 머리: () => ({}) },
  };
  class 고정시각 extends Date { constructor(...a) { super(...(a.length ? a : [기준])); } static now() { return Date.parse(기준); } }
  const handler = 세우기(원문, { 파일: 'progress.ts', 모듈: modules,
    환경: { SUPABASE_DB_URL: 'synthetic' }, Date: 고정시각,
    console: { error: (...s) => errors.push(s.join(' ')) } });
  const response = await handler(new Request('http://localhost/functions/v1/progress', { headers: { 'X-Contract-Ver': 'c16' } }));
  return { status: response.status, body: await response.json(), 전달원행, queries, errors };
}

test('progress 실제 핸들러 — 제출표 마감/기준판을 조인하고 이탈을 보존하여 확인·목표를 각각 반환한다', async () => {
  const r = await 호출();
  assert.equal(r.status, 200, JSON.stringify({ body: r.body, errors: r.errors }));
  assert.ok(r.body.오늘의확인, `확인 카드가 조용히 null이 됐다: ${r.errors.join(' | ')}`);
  assert.equal(r.body.오늘의확인.shown_key, '여유제출');
  assert.ok(r.body.오늘의목표);
  assert.equal(r.전달원행.length, 7);
  assert.ok(r.전달원행.find((e) => e.event_type === 'session.abandoned'));
  assert.equal(r.전달원행.find((e) => e.event_id === 'a1').task_schema_ver, 'c16');
  assert.deepEqual(r.errors, []);
});

test('탐지력 — 과거 e.due_at 질의는 본 응답 200이어도 확인 카드 null로 떨어져 독립 검사에 실패한다', async () => {
  const r = await 호출(source.replace('s.due_at, e.task_type, s.task_schema_ver', 'e.due_at, e.task_type, e.task_schema_ver'));
  assert.equal(r.status, 200, JSON.stringify({ body: r.body, errors: r.errors }));
  assert.equal(r.body.오늘의확인, null);
  assert.ok(r.body.오늘의목표, '목표 카드가 있다고 확인 카드 실패를 통과시키면 안 된다');
  assert.match(r.errors.join(' '), /e\.due_at.*does not exist/);
});
