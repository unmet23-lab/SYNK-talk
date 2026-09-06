'use strict';
/* 나침반 뿌리 문항 «덧붙임» — 시즌 회차가 why_learning·topik_use 를 «실을 수» 있다 (2026-09-06)
 *
 * 정본 = 철학 v1.21 Ⅱ-4 · 유호 확정 09-06 「나침반 뿌리 문항은 자동으로 다시 묻지 않되 시즌 회고에서 학생이 「바꿀래」를
 *   누르면 새 답을 덧붙인다 · 옛 답은 남긴다」 · 조각 20260906000000.
 *
 * ■ 이 검사가 지키는 셋
 *   ① lib 답검사 — 시즌 회차에 덧붙임 둘은 통과 · 빈 덧붙임은 실패 · 입학 회차엔 «없는 키»가 아니라 필수 키다(그대로)
 *   ② 🔴 lib 의 «허용 집합»과 DB CHECK(20260906000000)의 시즌 갈래 «남는 키 0» 배열이 같은 넷인가 —
 *      같은 판정이 두 층(JS·DDL)에 산다. 갈리면 JS 는 통과시키고 DB 가 거절하고, 그 거절은 강사 화면에서
 *      「저장이 안 된다」로만 보인다(나침반문항.test ② 의 그 축).
 *   ③ 필수 둘은 그대로 둘이다 — 덧붙임이 필수로 «승격»되면 「바꿀래」를 안 누른 학생의 시즌 저장이 통째로 막힌다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const 나침반 = require('../lib/나침반문항.js');
const { 종류, 시즌키, 뿌리덧붙임키, 허용키, 답검사 } = 나침반;

const 조각경로 = path.join(__dirname, '..', 'supabase', 'migrations', '20260906000000_compass_append_card_once_stt_raw_c16.sql');
assert.ok(fs.existsSync(조각경로), `${조각경로} 가 없다 — ② 가 통째로 미실행이다`);
const SQL = fs.readFileSync(조각경로, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

const 시즌답 = () => ({ self_in_5y: '서울에서 공부하는 나', season_goal: '받아쓰기를 매주 한 번씩' });

test('① 시즌 회차 — 덧붙임 둘은 통과, 하나만도 통과, 빈 덧붙임은 실패', () => {
  assert.equal(답검사(종류.시즌, { ...시즌답(), why_learning: '한국 회사에 취업하려고', topik_use: '취업비자에 쓴다' }, true), null);
  assert.equal(답검사(종류.시즌, { ...시즌답(), topik_use: '취업비자에 쓴다' }, false), null);
  const 흠 = 답검사(종류.시즌, { ...시즌답(), why_learning: '   ' }, true);
  assert.ok(흠 && 흠.필드 === 'why_learning', '빈 덧붙임이 통과했다 — 「안 바꿨다」와 구별이 안 된다');
  const 모름 = 답검사(종류.시즌, { ...시즌답(), why_learn: '오타 키' }, true);
  assert.ok(모름 && 모름.필드 === 'why_learn', '모르는 키가 통과했다');
});

test('③ 필수 둘은 그대로 — 덧붙임이 없어도 시즌 저장은 통과한다', () => {
  assert.deepEqual([...시즌키], ['self_in_5y', 'season_goal']);
  assert.deepEqual([...뿌리덧붙임키], ['why_learning', 'topik_use']);
  assert.equal(답검사(종류.시즌, 시즌답(), true), null);
  assert.deepEqual([...허용키(종류.시즌)].sort(), [...시즌키, ...뿌리덧붙임키].sort());
  assert.deepEqual([...허용키(종류.입학)].sort(), ['why_learning', 'self_in_5y', 'topik_use', 'season_goal'].sort());
});

test('🔴 ② DB CHECK 의 시즌 갈래 «남는 키 0» 배열 = lib 허용키(시즌) — 두 층이 같은 넷이다', () => {
  const 갈래들 = [...SQL.matchAll(/answers - array\[([^\]]+)\] = '\{\}'::jsonb/g)].map((m) =>
    m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')));
  assert.equal(갈래들.length, 2, `조각에서 «남는 키 0» 배열을 ${갈래들.length}개 찾았다 — 입학·시즌 둘이어야 한다`);
  const 시즌갈래 = 갈래들.find((a) => a.includes('self_in_5y') && a.includes('season_goal') && a.length === 4);
  assert.ok(시즌갈래, '시즌 갈래(넷)를 못 찾았다 — CHECK 몸이 바뀌었나');
  assert.deepEqual([...시즌갈래].sort(), [...허용키(종류.시즌)].sort());
  /* 시즌 갈래의 «전부 있나»(?&) 는 여전히 둘이어야 한다 — 덧붙임이 필수로 승격되면 안 된다 */
  const 필수들 = [...SQL.matchAll(/answers \?& array\[([^\]]+)\]/g)].map((m) =>
    m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')));
  assert.ok(필수들.some((a) => a.length === 2 && a.includes('self_in_5y') && a.includes('season_goal')),
    '시즌 갈래의 필수 둘이 바뀌었다');
});
