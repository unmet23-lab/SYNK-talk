/* 착지봉투 회귀 — ㉤ `_event` 봉투의 «호출자 몫» 규칙을 못박는다(§3-5-b 봉투 표 · A12).
 * 워커(deliver-one)와 구제(deliver ㉨)가 이 조립 하나를 쓴다 — 갈리면 착지 예외로만 드러난다. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { 착지봉투, 폴백봉투 } = require('../lib/착지봉투.js');

/* ㉤ 함수몫 19칸(마이그 20260821120000 의 `함수몫` 배열과 같은 목록) — 실려 오면 함수가 예외다. */
const 함수몫 = [
  'learner_id', 'event_type', 'task_type', 'actor_kind', 'occurred_at', 'idempotency_key',
  'consent_ver', 'consent_id', 'source_kind', 'level_snapshot', 'goal_snapshot', 'intervention_id',
  'skill_ids', 'skill_taxonomy_ver', 'model', 'prompt_ver', 'policy_ver', 'schema_ver', 'degraded',
];

const draft = {
  task_ref: 'task-2026-10-01',
  task_snapshot: {
    ver: 1, 날짜: '2026-10-01',
    호흡: [
      { 차례: 2, 무엇: '따라 말하기', task_format: '낭독', 문장: '폴백 문장이에요.', 출처: '도입' },
      { 차례: 3, 무엇: '답하기', task_format: '자유발화', 프롬프트: '질문이에요?' },
    ],
  },
  estimator_version: '학습자상태.v11',
  estimator_confidence: 0.5,
  evidence_refs: { events: [], as_of: '2026-10-01T00:00:00Z', window_days: 30, axes_used: [], truncated: false },
};

test('세 블록 + 함수몫 19칸 0 — A12 를 조립 층이 스스로 지킨다', () => {
  const 봉 = 착지봉투({
    estimator_version: '학습자상태.v11', draft, outcome: '성공',
    snap: draft.task_snapshot, output_text: '문장', gate_failed: null, input_text: '본문',
  });
  assert.deepEqual(Object.keys(봉), ['task_assigned', 'intervention_delivered', 'submission_row']);
  for (const 블록 of Object.values(봉)) {
    for (const k of 함수몫) {
      assert.ok(!(k in 블록), `함수몫 «${k}» 이 블록에 실렸다 — ㉤ 가 예외를 낸다(A12)`);
    }
  }
  assert.equal(봉.intervention_delivered.estimator_version, '학습자상태.v11', '대조 ⑦ 의 호출자 몫');
  assert.equal(봉.intervention_delivered.evidence_refs, draft.evidence_refs, '대조 ⑩ — draft 그대로(같은 참조)');
  assert.deepEqual(봉.task_assigned.payload, { ver: 1 });
  assert.equal(봉.submission_row.task_snapshot, 봉.task_assigned.task_snapshot, '대조 ② — 동일 바이트(같은 참조)');
});

test('gate_failed 는 검문탈락에만 «키째» 실린다 — 그 밖 갈래는 키 생략(대조 ③ else)', () => {
  const 성공 = 착지봉투({ estimator_version: 'v', draft, outcome: '성공', snap: {}, output_text: 'x', gate_failed: null, input_text: 'b' });
  assert.ok(!('generation_gate_failed' in 성공.intervention_delivered.payload));
  const 탈락 = 착지봉투({ estimator_version: 'v', draft, outcome: '검문탈락', snap: {}, output_text: 'x', gate_failed: '길이', input_text: 'b' });
  assert.equal(탈락.intervention_delivered.payload.generation_gate_failed, '길이');
});

test('폴백봉투 — snap=draft 그대로(§7-2 재호출 0) · output_text=② 문장 · draft 없으면 던진다', () => {
  const 봉 = 폴백봉투({ estimator_version: 'v', draft, outcome: '구제경로', gate_failed: null, input_text: null });
  assert.equal(봉.task_assigned.task_snapshot, draft.task_snapshot, '새로 조립하면 안 된다(§12-28 스파이 축)');
  assert.equal(봉.intervention_delivered.payload.output_text, '폴백 문장이에요.', '학생 ①듣기 실물(§7 G5)');
  assert.equal(봉.intervention_delivered.payload.generation_outcome, '구제경로');
  assert.equal(봉.intervention_delivered.payload.generation_input_text, null, '벤더 0 — §11-2');
  assert.throws(() => 폴백봉투({ estimator_version: 'v', draft: {}, outcome: '키없음', gate_failed: null, input_text: null }),
    /task_snapshot/);
});
