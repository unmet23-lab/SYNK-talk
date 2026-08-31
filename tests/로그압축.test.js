'use strict';
/* 로그 압축 회귀(G2-9) — 파일이 영영 자라는 것을 막되, **소비자의 답이 한 글자도 안 바뀌는가**.
 *
 * 🔴 이 검사의 실값은 「동일성」이다: 압축은 무게를 걷는 것이지 사실을 고치는 것이 아니다.
 *   · talk 로그 — 학습출석·다음시도번호·배달상태(창 안 날짜)·밀린것·되듣기보낼것·선택보낼것.
 *   · 게임 로그 — 밀린것·죽은배정들(행을 지우면 끝난 배정이 「죽은 배정」으로 되살아나
 *     없던 이탈이 지어져 나간다 — 그래서 게임 쪽은 행 수도 그대로여야 한다).
 *   · 미final(아직 못 보낸) 행은 **그 객체 그대로** — 사건·본문이 걷히면 재전송이 빈손이 된다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const 제출로그 = require('../lib/제출로그.js');
const 게임로그 = require('../lib/게임로그.js');

const 오늘 = '2026-08-31'; // 보존일수 14 → 경계 2026-08-18 (경계 자체는 보존경계 가 정본이다)

/* ── talk 로그 픽스처 — 옛 날(창 밖)·못 보낸 것·창 안이 한 벌에 다 있다 ── */
const 행 = (덧) => ({
  date: '2026-07-01', step: '답하기', attempt: 1, status: 'submitted',
  duration_ms: 1000, hesitation_ms: 10, spoke: true, threshold_db: -30,
  text: '무거운 본문', audio: 'a.wav', prompt_id: 'p', created_at: 't',
  task_meta: { 급수: 'L1' }, compose_meta: { ver: 1 }, 선택: null, 선택때: null,
  idempotency_key: 'k', event_id: 'E', send_error: null, send_final: false,
  ...덧,
});
const talk전 = [
  /* 창 밖·끝남 — ①따라 attempt 1·2 둘 다 submitted·도착: 최대(2)만 남고 1은 걷힌다 */
  행({ id: 'A따1', step: '따라', attempt: 1, event_id: 'E0' }),
  행({ id: 'A따2', step: '따라', attempt: 2, event_id: 'E5' }),
  /* ②답하기 — 최대 attempt(2)가 abandoned 라, 출석을 지키러 submitted 최대(1)도 남는다 */
  행({ id: 'A답1', attempt: 1, event_id: 'E1', replayed_at: 'r', replay_event_id: 'R1', 선택: { 고름: 1 }, 선택때: 's', choice_event_id: 'C1' }),
  행({ id: 'A답2', attempt: 2, status: 'abandoned', event_id: 'E2' }),
  /* 창 밖인데 **못 보낸** 셋 — 제출·되듣기·고름. 걷으면 사흘 밀린 것이 빈손이 된다 */
  행({ id: 'B미전송', date: '2026-07-02', event_id: null }),
  행({ id: 'C되듣기만', date: '2026-07-03', event_id: 'E3', replayed_at: 'r' }),
  행({ id: 'D고름만', date: '2026-07-04', event_id: 'E4', 선택: { 고름: 2 }, 선택때: 's', choice_event_id: null }),
  /* 창 안 — 손끝 하나 안 댄다 */
  행({ id: 'E오늘', date: '2026-08-30' }),
];

test('talk ① 소비자 동일성 — 학습출석·다음시도번호·배달상태(창 안)·큐 셋의 답이 압축 전후 같다', () => {
  const 후 = 제출로그.압축(talk전, 오늘);
  const 날들 = [...new Set(talk전.map((e) => e.date))];
  for (const d of 날들) {
    assert.equal(제출로그.학습출석(후, d), 제출로그.학습출석(talk전, d), `학습출석(${d}) 이 갈렸다`);
    for (const s of ['따라', '답하기']) {
      assert.equal(제출로그.다음시도번호(후, d, s), 제출로그.다음시도번호(talk전, d, s),
        `다음시도번호(${d}, ${s}) 가 갈렸다`);
    }
  }
  /* 배달상태는 창 «안» 날짜로 잰다 — 호출부 전수가 오늘만 묻는다(감사 정찰 실측). */
  assert.deepEqual(제출로그.배달상태(후, '2026-08-30'), 제출로그.배달상태(talk전, '2026-08-30'));
  for (const 자 of ['밀린것', '되듣기보낼것', '선택보낼것']) {
    const 재기 = (로그) => (자 === '밀린것' ? 제출로그[자](로그) : 제출로그[자](로그, null)).map((e) => e.id);
    assert.deepEqual(재기(후), 재기(talk전), `${자} 의 답이 갈렸다`);
  }
});

test('talk ② 🔴 미final 행은 그 객체 그대로다 — 본문·재료가 걷히면 재전송이 빈손이 된다', () => {
  const 후 = 제출로그.압축(talk전, 오늘);
  for (const id of ['B미전송', 'C되듣기만', 'D고름만', 'E오늘']) {
    assert.equal(후.find((e) => e.id === id), talk전.find((e) => e.id === id),
      `${id} 가 원본 참조가 아니다 — 못 보낸 것(또는 창 안)은 손대지 않는다`);
  }
});

test('talk ③ 창 밖 끝난 것 — 최대 attempt 골격만 남고(출석 지킴 포함) 무거운 칸이 걷힌다', () => {
  const 후 = 제출로그.압축(talk전, 오늘);
  assert.equal(후.find((e) => e.id === 'A따1'), undefined, '최대 attempt 아닌 끝난 행이 남았다');
  const 골격 = 후.find((e) => e.id === 'A답2');
  assert.ok(골격, '최대 attempt 행이 사라졌다');
  for (const k of ['text', 'task_meta', 'compose_meta', '선택', '선택때']) {
    assert.equal(골격[k], null, `골격에 무거운 칸이 남았다: ${k}`);
  }
  assert.equal(골격.event_id, 'E2', '배달 사실(event_id)이 걷혔다');
  assert.equal(골격.status, 'abandoned', 'status 를 지어내 바꿨다');
  assert.ok(후.find((e) => e.id === 'A답1'), 'submitted 최대 행이 안 남았다 — 그 날의 학습출석이 뒤집힌다');
  /* 멱등 — 두 번째 압축은 「걷을 것 없음」= 원본 참조다(다르면 마운트마다 쓰기가 돈다). */
  assert.equal(제출로그.압축(후, 오늘), 후, '압축이 멱등이 아니다');
  /* 창 안뿐인 로그는 원본 참조 그대로다 — 「다르면 쓰기」의 «다르면» 이 이 참조 대조다. */
  const 창안만 = [행({ id: 'x', date: '2026-08-30' })];
  assert.equal(제출로그.압축(창안만, 오늘), 창안만);
});

/* ── 게임 로그 픽스처 ── */
const 게임행 = ({ id, event_type, occurred_at, correlation_id, task_ref, event_id = null, task_meta, 골격사건 = false }) => ({
  id,
  event_type,
  사건: {
    idempotency_key: `k-${id}`, event_type, occurred_at, correlation_id,
    ...(골격사건 ? {} : { level_snapshot: { level: 'L1' }, payload: { ver: 1, 무게: 'x'.repeat(10) } }),
    ...(task_ref ? { submission: { task_ref, task_format: 'f', task_snapshot: { 문항id: 'q1' }, ...(골격사건 ? {} : { body_original: '무거운 본문' }) } } : {}),
  },
  event_id, send_error: null, send_final: false,
  ...(task_meta ? { task_meta } : {}),
});
const 게임전 = [
  /* 창 밖·도착한 제출 — 골격이 되되 submission.task_ref·task_snapshot 은 남는다(끝난-배정 판정 재료) */
  게임행({ id: 'mail:c1', event_type: 'submission.created', occurred_at: '2026-07-01T05:00:00.000Z', correlation_id: 'c1', task_ref: 'g1:2026-07-01', event_id: 'E1' }),
  /* 그 배정의 닻 있는 고름(도착함) — task_meta 는 골격 뒤에도 남아야 한다 */
  게임행({ id: 'choice:c1', event_type: 'choice.selected', occurred_at: '2026-07-01T05:00:00.000Z', correlation_id: 'c1', event_id: 'E2', task_meta: { task_ref: 'g1:2026-07-01' } }),
  /* 제출 없는 옛 배정의 닻 있는 고름(도착함) — 죽은 배정 재료 */
  게임행({ id: 'choice:c2', event_type: 'choice.selected', occurred_at: '2026-07-02T05:00:00.000Z', correlation_id: 'c2', event_id: 'E3', task_meta: { task_ref: 'g2:2026-07-02' } }),
  /* 창 밖인데 **미final** — 통째로 그대로(사건 그대로 다시 나가야 멱등키가 같다) */
  게임행({ id: 'mail:c3', event_type: 'submission.created', occurred_at: '2026-07-03T05:00:00.000Z', correlation_id: 'c3', task_ref: 'g3:2026-07-03' }),
  /* 창 안 — 손끝 하나 안 댄다 */
  게임행({ id: 'mail:c4', event_type: 'submission.created', occurred_at: '2026-08-30T05:00:00.000Z', correlation_id: 'c4', task_ref: 'g4:2026-08-30', event_id: 'E4' }),
];

test('게임 ① 🔴 행 수 그대로 + 밀린것·죽은배정들의 답이 압축 전후 같다', () => {
  const 후 = 게임로그.압축(게임전, 오늘);
  assert.equal(후.length, 게임전.length, '게임 로그의 행을 지웠다 — 끝난 배정이 죽은 배정으로 되살아난다');
  assert.deepEqual(게임로그.밀린것(후).map((e) => e.id), 게임로그.밀린것(게임전).map((e) => e.id));
  const 죽은 = (로그) => 게임로그.죽은배정들(로그, '오늘ref').map((d) => d.task_meta.task_ref).sort();
  assert.deepEqual(죽은(후), 죽은(게임전), '죽은배정들의 답이 갈렸다');
  assert.deepEqual(죽은(게임전), ['g2:2026-07-02'], '픽스처 분모가 죽었다 — 죽은 배정 하나를 심었는데 안 잡혔다');
});

test('게임 ② 창 밖 끝난 사건은 골격이 된다 — 무게(payload·body_original)만 걷고 판정 재료는 남는다', () => {
  const 후 = 게임로그.압축(게임전, 오늘);
  const 골격 = 후.find((e) => e.id === 'mail:c1');
  assert.equal('payload' in 골격.사건, false, 'payload 가 안 걷혔다');
  assert.equal('body_original' in 골격.사건.submission, false, 'body_original 이 안 걷혔다');
  assert.equal(골격.사건.submission.task_ref, 'g1:2026-07-01', '끝난-배정 판정 재료(task_ref)가 걷혔다');
  assert.deepEqual(골격.사건.submission.task_snapshot, { 문항id: 'q1' }, '턴 판정 재료(task_snapshot)가 걷혔다');
  const 닻골격 = 후.find((e) => e.id === 'choice:c1');
  assert.deepEqual(닻골격.task_meta, { task_ref: 'g1:2026-07-01' }, '닻(task_meta)이 걷혔다 — 수거 재료가 죽는다');
  /* 미final·창 안은 원본 참조 그대로 */
  assert.equal(후.find((e) => e.id === 'mail:c3'), 게임전.find((e) => e.id === 'mail:c3'));
  assert.equal(후.find((e) => e.id === 'mail:c4'), 게임전.find((e) => e.id === 'mail:c4'));
  /* 멱등 — 두 번째는 원본 참조(「다르면 쓰기」가 참조 대조라서 이게 곧 쓰기 0회다). */
  assert.equal(게임로그.압축(후, 오늘), 후, '압축이 멱등이 아니다');
});

test('경계 — 오늘을 모르면(날짜 모양이 아니면) 걷지 않는다 · 경계 셈이 달을 건넌다', () => {
  assert.equal(제출로그.압축(talk전, null), talk전, '오늘 없이 걷었다 — 지어내지 않는다');
  assert.equal(제출로그.압축(talk전, '어제쯤'), talk전);
  assert.equal(제출로그.보존경계('2026-08-31', 14), '2026-08-18');
  assert.equal(제출로그.보존경계('2026-03-05', 14), '2026-02-20', '달 경계를 못 건넌다');
  assert.equal(제출로그.보존경계('없음', 14), null);
});
