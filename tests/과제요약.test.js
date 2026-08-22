/* 과제요약 회귀 — §6-2 인코딩 규칙과 §6-1 evidence_refs 변환을 못박는다.
 *
 * 🔴 픽스처는 «널이 섞인» 실물 상태다(§6-2 — 전 축이 찬 정상 픽스처만 쓰면 널 규칙이 한 번도
 *   안 밟혀서 구현이 무엇을 하든 초록이다). 실물은 `학습자상태()` 를 실제로 돌려 얻는다 —
 *   손으로 지은 축 객체로만 재면 상류가 모양을 바꾼 날 이 계약이 조용히 깨진다. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { 과제요약, 근거상한, 축줄상한 } = require('../lib/과제요약.js');
const { 학습자상태 } = require('../lib/학습자상태.js');

const 기준 = '2026-08-09T12:00:00Z';
const 일 = 86400000;
const 전 = (밀리) => new Date(Date.parse(기준) - 밀리).toISOString();
let 번호 = 0;
const 사건 = (t, at, 더 = {}) => ({ event_id: `E${(번호 += 1)}`, event_type: t, occurred_at: at, ingested_at: at, ...더 });

/** 리듬·끈기만 차고 나머지 축은 널인 실물 상태 — 널 규칙이 실제로 밟힌다. */
function 실물상태() {
  const 행 = [];
  for (let d = 5; d >= 1; d -= 1) {
    행.push(사건('task.assigned', 전(d * 일), { due_at: 전(d * 일 - 12 * 3600000) }));
    행.push(사건('submission.created', 전(d * 일 - 3600000)));
  }
  return 학습자상태(행, { as_of: 기준, ingested_as_of: 기준, 시간대: 'Asia/Ulaanbaatar' });
}

test('널 축은 안 실리고, 쓸축수 = axes_used 길이다 (§4-3 — 두 곳에서 안 센다)', () => {
  const r = 과제요약(실물상태());
  assert.ok(r.axes_used.includes('리듬') && r.axes_used.includes('끈기'), r.axes_used.join(','));
  assert.ok(!r.axes_used.includes('관심') && !r.axes_used.includes('탐지'), '널 축이 세어졌다');
  assert.equal(r.쓸축수, r.axes_used.length);
  assert.equal(r.evidence_refs.axes_used, r.axes_used, '같은 배열이어야 한다 — 사본이면 갈라진다');
  for (const 금지 of ['null', 'undefined', '관심:', '탐지:']) {
    assert.ok(!r.요약.includes(금지), `요약에 「${금지}」 가 실렸다 — 널은 «싣지 않는다»다`);
  }
});

test('순서는 상태 객체 그대로다 — 재정렬하면 같은 상태가 다른 문자열이 된다', () => {
  const r = 과제요약(실물상태());
  assert.ok(r.요약.indexOf('리듬:') < r.요약.indexOf('끈기:'),
    '축 순서가 상태 객체 순서와 다르다 — generation_input_text 대조가 깨진다');
});

test('결정성 — 같은 상태는 같은 문자열이다 (입력 스냅샷의 전제)', () => {
  번호 = 0; const a = 과제요약(실물상태());
  번호 = 0; const b = 과제요약(실물상태());
  assert.equal(a.요약, b.요약);
});

test('비율은 소수 2자리·정수는 그대로 — 퍼센트 표기 금지 (§6-2 단위·반올림)', () => {
  const r = 과제요약(실물상태());
  assert.ok(/제출률=1\b/.test(r.요약), r.요약);
  assert.ok(!/%/.test(r.요약), '퍼센트 표기가 실렸다');
  const 소수들 = [...r.요약.matchAll(/=(\d+\.\d+)/g)].map((m) => m[1]);
  for (const s of 소수들) assert.ok(s.split('.')[1].length <= 2, `소수 3자리가 실렸다: ${s}`);
});

test('목표 조각 — 값이 있으면 실리고 axes_used 엔 안 센다 · null 이면 안 싣는다 (§4-3 C4 · §12-22)', () => {
  const 상태 = 실물상태();
  const 있음 = 과제요약(상태, { 목표: 'study', 급수: 'Lv4' });
  assert.ok(있음.요약.includes('목표: study') && 있음.요약.includes('급수: Lv4'));
  assert.equal(있음.쓸축수, 과제요약(상태).쓸축수, '목표 조각이 쓸축수에 세어졌다 — 상태없음이 원리상 안 나온다');
  const 없음 = 과제요약(상태, { 목표: null, 급수: null });
  assert.ok(!없음.요약.includes('목표') && !없음.요약.includes('급수'));
});

test('시즌 나침반(㉢) — 말은 시즌줄 그대로 · 쓸축수 밖 · null 은 안 싣고 · 절단은 이 층 규격이다 (§6-2 v5.13-f)', () => {
  const { 시즌줄 } = require('../lib/시즌맥락.js');
  const 상태 = 실물상태();

  const 있음 = 과제요약(상태, { 목표: 'study', 급수: 'Lv4', 시즌목표: '한국 친구랑 전화로 약속 잡기' });
  // 낱말 결속을 실제로 잰다 — correct 첨삭과 다른 말이 되면 여기가 빨개진다(정본 = 시즌줄 하나).
  assert.ok(있음.요약.includes(시즌줄('한국 친구랑 전화로 약속 잡기')), 있음.요약);
  assert.equal(있음.쓸축수, 과제요약(상태).쓸축수, '시즌 조각이 쓸축수에 세어졌다 — 목표 조각과 같은 C4 규칙이다');
  assert.ok(있음.요약.indexOf('목표: study') < 있음.요약.indexOf('이번 시즌 목표:'),
    '조각 순서(급수→목표→시즌)가 흔들렸다 — 같은 상태가 다른 문자열이 된다');

  for (const 빈 of [null, undefined, '', '   ']) {
    const r = 과제요약(상태, { 시즌목표: 빈 });
    assert.ok(!r.요약.includes('시즌'), `빈 시즌목표(${JSON.stringify(빈)})가 실렸다 — 널은 «싣지 않는다»다`);
  }

  const 긴목표 = '가'.repeat(60);
  const 줄 = 과제요약(상태, { 시즌목표: 긴목표 }).요약.split('\n').find((l) => l.startsWith('이번 시즌'));
  assert.ok(줄 && Array.from(줄).length <= 축줄상한 + 1 && 줄.endsWith('…'),
    '시즌 줄이 축줄상한을 안 받았다 — correct 문서 규격이 아니라 §6-2 가 이긴다');
});

test('상태가 전부 널이어도 목표는 산다 — 쓸축수 0 + 목표 조각 (2단 폴백의 재료 · §4-3)', () => {
  const 빈상태 = 학습자상태([], { as_of: 기준 });
  const r = 과제요약(빈상태, { 목표: 'work', 급수: 'Lv3' });
  assert.equal(r.쓸축수, 0, '빈 상태의 쓸축수가 0 이 아니다 — 상태없음 판정이 죽는다');
  assert.ok(r.요약.includes('목표: work'), '목표가 버려졌다 — 규칙이 가르는 것은 「무엇을 세나」지 「무엇을 쓰나」가 아니다');
});

test('축 한 줄 50 코드포인트 절단 — 잘리면 … 이 붙는다 (§6-2)', () => {
  const 긴 = { estimator_version: 'x', estimator_confidence: 0, evidence_refs: { as_of: 기준, 창일수: 30, 사건: [] },
    축: { 리듬: { 제출률: 0.87, 마감여유분_중앙: 123456789, 지각: 12345, n: 99999, 여유n: 88888, 추가지표같은긴이름: 12345678 } } };
  const 줄 = 과제요약(긴).요약.split('\n')[0];
  assert.ok(Array.from(줄).length <= 축줄상한 + 1, `줄이 ${Array.from(줄).length}자다`);
  assert.ok(줄.endsWith('…'), '잘렸는데 … 가 없다 — 「다 실렸다」로 읽힌다');
});

test('evidence_refs 변환 — 영문 키·앞 50·원천 순서·truncated (§6-1 D1·C4)', () => {
  const 사건들 = Array.from({ length: 60 }, (_, i) => `E${i}`);
  const 상태 = { estimator_version: 'x', estimator_confidence: 0.5,
    evidence_refs: { as_of: 기준, ingested_as_of: 기준, 창일수: 30, 사건: 사건들, 잘림: 210 },
    축: { 리듬: { n: 3 } } };
  const r = 과제요약(상태).evidence_refs;
  assert.deepEqual(Object.keys(r).sort(), ['as_of', 'axes_used', 'events', 'truncated', 'window_days'],
    '키가 §6-1 모양이 아니다 — c12 검증기(영문 snake_case)와 갈린다');
  assert.equal(r.events.length, 근거상한);
  assert.deepEqual(r.events.slice(0, 3), ['E0', 'E1', 'E2'], '원천 배열 순서가 아니다(C4 — 시각 정렬은 수행 불가)');
  assert.equal(r.truncated, true);
  assert.equal(r.window_days, 30, '값은 그 산출이 실제로 쓴 창이다(상수 아님)');
  const 안잘림 = 과제요약({ ...상태, evidence_refs: { ...상태.evidence_refs, 사건: ['E1'] } }).evidence_refs;
  assert.equal(안잘림.truncated, false);
});

test('재료 결함은 던진다 — 상태 객체 없이 부르면 조용히 빈 요약이 되지 않는다', () => {
  assert.throws(() => 과제요약(null), /학습자상태/);
  assert.throws(() => 과제요약({}), /학습자상태/);
});
