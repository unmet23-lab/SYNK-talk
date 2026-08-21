/* 판재료 회귀 — 구운 재료(contents/판재료.js)·상수 원소(lib/생성상수.js)가 실물과 붙어 있는지,
 * 그리고 그 전량으로 판독기(정책지문)가 실제로 조립되는지를 잰다.
 * 🔴 사본 대조 둘(회전식·SQL 상수)은 마이그 원문과 «부분일치»로 붙는다 — 갈라지면 같은 규칙이
 *   두 판으로 갈리고, 새는 방향은 언제나 「통과」다. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { 띄우기 } = require('./lib/띄우기.js');

const ROOT = path.resolve(__dirname, '..');
const 판재료 = require('../contents/판재료.js');
const 상수 = require('../lib/생성상수.js');
const { 정책지문, 품질지문, 재료이름 } = require('../lib/판독기.js');
const { 갈래순서 } = require('../lib/갈래판정.js');
const 마이그 = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations',
  '20260821120000_generation_c12.sql'), 'utf8');

test('생성물이 원본과 같다 — 드리프트는 「다시 굽는다」로만 풀린다', () => {
  const r = 띄우기([path.join(ROOT, 'tools', '판재료굽기.js'), '--확인'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.match(String(r.stdout), /같다/);
});

test('파일 해시 7 이 실물 재계산과 같다 (원문 UTF-8 바이트 · v5.9 표)', () => {
  const 원천 = {
    요약조립: 'lib/과제요약.js', 검문: 'lib/과제검문.js', 갈래판정: 'lib/갈래판정.js',
    기술선택: 'lib/기술선택.js', 오류분류: 'lib/과제생성.js', 폴백조립: 'lib/오늘과제.js',
    추정기: 'lib/학습자상태.js',
  };
  for (const [이름, 상대] of Object.entries(원천)) {
    const 실물 = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(ROOT, 상대))).digest('hex');
    assert.equal(판재료.파일해시[이름], 실물, `${이름}(${상대}) 해시가 낡았다`);
  }
});

test('폴백순서 원소 = 갈래순서 JSON — 정본은 lib/갈래판정.js 하나다', () => {
  assert.equal(판재료.폴백순서원소, JSON.stringify(갈래순서));
});

test('회전식 사본이 마이그 원문에 그대로 실재한다 (jobs_claim — 재료 6)', () => {
  assert.ok(마이그.includes(상수.회전식),
    '회전식 리터럴이 마이그와 갈렸다 — 같은 규칙이 두 판이 된다(공백까지 같아야 한다)');
});

test('SQL 상수 사본 — 마감 06:00·리더 여유 900000ms 가 마이그 함수와 같다', () => {
  assert.ok(/time '06:00'/.test(마이그) && 상수.배달마감_시각.startsWith('06:00'),
    '배달마감 시각이 갈렸다(gen_deadline ↔ 생성상수)');
  assert.ok(마이그.includes(`interval '${상수.실행리더여유_MS} milliseconds'`),
    '리더 여유가 갈렸다(gen_leader_grace ↔ 생성상수)');
});

test('워커학생상한 — 손 숫자가 아니라 파생이고, 타임아웃 예산 안이다(§3-2)', () => {
  assert.ok(상수.워커학생상한 * 상수.생성타임아웃_MS + 상수.폴백여유_MS <= 150000,
    '상한×타임아웃+여유가 150초를 넘는다 — 마지막 학생의 폴백 시간이 없다(K군)');
  assert.equal(상수.워커학생상한, 3, 'P0-L 보수 초기값 — §12-20 실측 전에는 3 이다');
});

test('cron 원소 — 4잡·이름 오름차순·§3-2-a 크론식 그대로', () => {
  const 줄들 = 상수.cron원소().split('\n');
  assert.equal(줄들.length, 4);
  assert.deepEqual(줄들.map((l) => l.split('=')[0]),
    [...줄들.map((l) => l.split('=')[0])].sort(), '이름 오름차순이 아니다(v5.9 표)');
  assert.ok(상수.크론표['generate-worker'] === '*/10 16-21 * * *',
    '워커 크론이 표와 다르다 — 시 경계 공백(B3)이 되살아난다');
});

test('RPC열(재료 10 대상) = 마이그의 engine 함수 중 열 RPC 전량 — 하나 늘고 목록이 안 늘면 판이 안 오른다', () => {
  const 전부 = [...마이그.matchAll(/^create or replace function engine\.([a-z_]+)\(/gm)]
    .map((m) => m[1]);
  /* 열 RPC 밖 = 트리거 함수·도우미(gen_*·level_dist_ok·*_freeze·*_settled) — §3-5-b 전이표의
   * 「전이는 이 열 밖에서 일어나지 않는다」가 가르는 그 경계다. */
  const 열 = 전부.filter((n) => !/^gen_|_freeze$|_settled$|^level_dist_ok$/.test(n)).sort();
  assert.deepEqual([...상수.RPC열].sort(), 열,
    '생성상수.RPC열이 마이그의 RPC 실물과 갈렸다 — 판독기 재료 10 이 다른 함수 집합을 걷는다');
});

test('통합 — 실물 재료 전량으로 정책지문·품질지문이 조립된다(재료 13 · 12자)', () => {
  const 재료 = {
    요약조립: 판재료.파일해시.요약조립,
    검문: 판재료.파일해시.검문,
    폴백순서: 판재료.폴백순서원소,
    타임아웃상수: 상수.타임아웃상수원소(),
    예산상수: 상수.예산상수원소(),
    회전식: 상수.회전식,
    갈래판정: 판재료.파일해시.갈래판정,
    기술선택: 판재료.파일해시.기술선택,
    cron: 상수.cron원소(),
    rpc: 'create function …(pg_get_functiondef 모의 — 실물은 오케스트레이터가 DB 에서 걷는다)',
    오류분류: 판재료.파일해시.오류분류,
    폴백조립: 판재료.파일해시.폴백조립,
    추정기: 판재료.파일해시.추정기,
  };
  assert.deepEqual(Object.keys(재료).length, 재료이름.length);
  const v = 정책지문(재료);
  assert.match(v, /^오늘과제\.v\d+\+[0-9a-f]{12}$/, v);
  const q = 품질지문({ 검문: 판재료.파일해시.검문, 오류분류: 판재료.파일해시.오류분류 });
  assert.match(q, /^[0-9a-f]{12}$/);
});
