/* 읽기 기록 회귀(세층합류 §3 · c15 · 09-01) — 조립·나르기·커버리지를 행동으로 못박는다. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { 읽기판, 빈사유들, 목표길이상한, 읽기기록, 읽기커버리지, 읽음원천 } = require('../lib/읽기기록.js');
const { 착지봉투, 폴백봉투 } = require('../lib/착지봉투.js');

test('읽기기록 — 읽은 것 전부 · 빈칸은 사유(Ⅲ-2) · ASCII 키', () => {
  const r = 읽기기록({ skill_ids: ['G-001', 'G-002'], 시즌목표: '한국 병원에서 일하기', axes_used: ['rhythm', 'grit'] });
  assert.equal(r.ver, 읽기판);
  assert.deepEqual(r.skill, { picker: 'rotation', filter: null, value: ['G-001', 'G-002'] });
  assert.deepEqual(r.life, { source: 'season_goal', value: '한국 병원에서 일하기', truncated: false });
  assert.deepEqual(r.person, { source: 'behavioral_axes', axes: ['rhythm', 'grit'] });
  for (const k of Object.keys(r)) assert.match(k, /^[a-z_]+$/i, `키 ${k} 가 ASCII 가 아니다`);

  const 빈 = 읽기기록({ skill_ids: [], 시즌목표: null, axes_used: [] });
  assert.equal(빈.skill.picker, null);
  assert.equal(빈.skill.empty_reason, 'not_target');
  assert.equal(빈.life.empty_reason, 'no_goal_yet', '목표 없음이 사유 없이 넘어갔다');
  assert.equal(빈.person.empty_reason, 'no_axes');

  const 강등 = 읽기기록({ skill_ids: ['G-1'], 시즌목표: '  ', axes_used: ['a'], 상태오류: true });
  assert.equal(강등.person.empty_reason, 'state_error', '상태오류 강등이 no_axes 로 뭉개졌다');
  assert.equal(강등.life.empty_reason, 'no_goal_yet', '공백 목표가 읽음으로 세어졌다');
});

/* ── 판 2 — 심문 전건판정(2026-09-02)이 고친 셋 ─────────────────────────────── */

test('🔴 ③ 겨냥은 «거른 규칙»과 «고른 규칙»을 갈라 싣는다 — E2 는 갈래가 둘이다', () => {
  const 현행 = 읽기기록({ skill_ids: ['G-1'], 시즌목표: null, axes_used: [] });
  assert.equal(현행.skill.filter, null, '현행은 거르지 않는다');
  assert.equal(현행.skill.picker, 'rotation');
  /* E2 본체(급수 매핑)가 열려도 회전은 그대로 돈다 — 한 칸이면 이 조합을 못 적는다. */
  const E2 = 읽기기록({ skill_ids: ['G-1'], 시즌목표: null, axes_used: [], 겨냥필터: 'level_map' });
  assert.equal(E2.skill.filter, 'level_map');
  assert.equal(E2.skill.picker, 'rotation', '거름 규칙이 고름 규칙을 덮어썼다 — 갈래 하나를 잃었다');
  assert.equal(읽기기록({ skill_ids: [], 시즌목표: null, axes_used: [], 겨냥필터: 'level_map' }).skill.filter,
    'level_map', '비대상이어도 «무엇으로 걸렀나»는 사실이다');
});

test('🔴 ② 삶 층은 그날 읽은 «문장»을 굳힌다 — 목표가 바뀌면 조인해 돌아올 다리가 없다', () => {
  const r = 읽기기록({ skill_ids: [], 시즌목표: '  한국 병원에서 간호사로 일하고 싶어요  ', axes_used: [] });
  assert.equal(r.life.value, '한국 병원에서 간호사로 일하고 싶어요', '앞뒤 공백째로 굳혔다');
  const 김 = 읽기기록({ skill_ids: [], 시즌목표: '가'.repeat(목표길이상한 + 50), axes_used: [] });
  assert.equal(김.life.value.length, 목표길이상한);
  assert.equal(김.life.truncated, true, '잘라 놓고 안 잘랐다고 적으면 다음 사람이 원문으로 읽는다');
});

test('🔴 ② 사람 층은 축 «목록»을 싣는다 — 호출자가 쥔 것을 길이로 접지 않는다', () => {
  const r = 읽기기록({ skill_ids: [], 시즌목표: null, axes_used: ['rhythm', '', null, '작성과정'] });
  assert.deepEqual(r.person.axes, ['rhythm', '작성과정'], '빈 값을 세거나 목록을 개수로 접었다');
});

test('⑧ 빈칸 사유는 값록이 정본 하나다 — 생산자가 새 낱말을 지어내면 집계가 갈린다', () => {
  assert.ok(Object.isFrozen(빈사유들));
  assert.deepEqual([...빈사유들].sort(), ['no_axes', 'no_goal_yet', 'not_target', 'state_error']);
  for (const 재료 of [
    { skill_ids: [], 시즌목표: null, axes_used: [] },
    { skill_ids: ['G'], 시즌목표: null, axes_used: [], 상태오류: true },
  ]) {
    const r = 읽기기록(재료);
    for (const 층 of ['skill', 'life', 'person']) {
      const 사유 = r[층].empty_reason;
      if (사유 !== undefined) assert.ok(빈사유들.includes(사유), `값록에 없는 사유 ${사유}`);
    }
  }
});

test('🔴 판 1 행도 그대로 읽힌다 — 새 판만 읽으면 옛 행이 통째로 「안 읽음」이 된다', () => {
  assert.equal(읽음원천({ source: 'rotation', value: ['G'] }), 'rotation', '판 1 skill 이 안 읽혔다');
  assert.equal(읽음원천({ picker: 'rotation', filter: null }), 'rotation');
  assert.equal(읽음원천({ source: null, empty_reason: 'no_axes' }), null);
  assert.equal(읽음원천(null), null);
});

test('착지봉투 — draft.reads 를 task.assigned payload 로 나른다 · 없으면 {ver:1} 그대로', () => {
  const reads = 읽기기록({ skill_ids: ['G-1'], 시즌목표: '유학', axes_used: ['r'] });
  const snap = { 호흡: [{ 차례: 2, 문장: '테스트 문장입니다.' }] };
  const 있는 = 착지봉투({
    estimator_version: 'v', draft: { estimator_confidence: 1, evidence_refs: {}, reads },
    outcome: '성공', snap, output_text: '테스트 문장입니다.', gate_failed: null, input_text: null,
  });
  assert.deepEqual(있는.task_assigned.payload, { ver: 1, reads }, 'reads 가 payload 로 안 실렸다');
  const 없는 = 착지봉투({
    estimator_version: 'v', draft: { estimator_confidence: 1, evidence_refs: {} },
    outcome: '성공', snap, output_text: 'x', gate_failed: null, input_text: null,
  });
  assert.deepEqual(없는.task_assigned.payload, { ver: 1 }, '옛 draft 에 없는 키를 지어냈다');
  /* 폴백 경로도 같은 한 원천을 지난다 — draft 에 있으면 실린다. */
  const 폴 = 폴백봉투({
    estimator_version: 'v', draft: { task_snapshot: snap, estimator_confidence: null, evidence_refs: {}, reads },
    outcome: '상태오류', gate_failed: null, input_text: null,
  });
  assert.deepEqual(폴.task_assigned.payload.reads, reads, '폴백 착지가 reads 를 떨어뜨렸다');
});

test('읽기커버리지 — 기록 없는 행은 깊이를 모른다(0 으로 안 접는다) · 분모 셋이 맞물린다', () => {
  const 행 = (payload) => ({ event_type: 'task.assigned', payload });
  const r = 읽기커버리지([
    행({ ver: 1, reads: 읽기기록({ skill_ids: ['G'], 시즌목표: '유학', axes_used: ['a'] }) }),   // 3층
    행({ ver: 1, reads: 읽기기록({ skill_ids: ['G'], 시즌목표: null, axes_used: [] }) }),        // 1층
    행({ ver: 1 }),                                                                              // 기록 없음(옛 행)
    { event_type: 'submission.created', payload: {} },                                           // 다른 사건 — 안 센다
  ]);
  assert.equal(r.총행수, 3);
  assert.equal(r.기록있음, 2);
  assert.equal(r.기록없음, 1, '옛 행이 0층으로 둔갑했다 — 모름은 모름이다');
  assert.equal(r.깊이분포[3], 1);
  assert.equal(r.깊이분포[1], 1);
  assert.equal(r.깊이분포[0], 0);
  assert.equal(r.층별.life.읽음, 1);
  assert.equal(r.층별.life.사유별.no_goal_yet, 1);
  assert.equal(r.층별.person.사유별.no_axes, 1);
  assert.equal(r.시도수, null, '안 준 것을 지어냈다');
  assert.equal(r.미착지, null, '시도수를 모르는데 미착지를 셌다');
  assert.deepEqual(읽기커버리지([]), {
    총행수: 0, 기록있음: 0, 기록없음: 0, 시도수: null, 미착지: null,
    깊이분포: { 0: 0, 1: 0, 2: 0, 3: 0 },
    층별: { skill: { 읽음: 0, 사유별: {} }, life: { 읽음: 0, 사유별: {} }, person: { 읽음: 0, 사유별: {} } },
  });
});

test('🔴 ⑫ 분모는 «시도»다 — 생성이 실패해 행이 없으면 커버리지가 스스로 부푼다', () => {
  const 행 = (payload) => ({ event_type: 'task.assigned', payload });
  const r = 읽기커버리지([
    행({ ver: 1, reads: 읽기기록({ skill_ids: ['G'], 시즌목표: '유학', axes_used: ['a'] }) }),
    행({ ver: 1, reads: 읽기기록({ skill_ids: ['G'], 시즌목표: null, axes_used: [] }) }),
  ], { 시도수: 5 });
  assert.equal(r.총행수, 2);
  assert.equal(r.시도수, 5);
  assert.equal(r.미착지, 3, '착지 못 한 셋이 분모에서 조용히 빠졌다 — 「좋은 0」의 얼굴이다');
});

test('계약 c16 — payload_허용필드에 reads·preference 확장 셋이 등재됐다(검증⑧ 원천)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const 계약 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '계약', '수집_교정_계약.json'), 'utf8'));
  assert.equal(계약.버전, 'c16');
  for (const k of ['reads', 'evidence_text', 'confirm_status', 'hw_ref']) {
    assert.ok(계약.learning_events.payload_허용필드.includes(k), `payload_허용필드에 ${k} 가 없다`);
  }
  assert.deepEqual(계약.learning_events.값목록.확인상태, ['대기', '맞다', '아니다']);
});
