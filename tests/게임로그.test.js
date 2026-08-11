/* 게임로그 회귀 — G1 오프라인 큐(`lib/게임로그.js` · `lib/교정로그.js` 와 같은 무늬).
 *
 * 지키는 것: ① 항목 id 결정론(앉음×사건종류당 하나 — 「앉음당 1번」의 기계적 실체)
 * ② 재전송이 **같은 사건 객체**를 쓴다(멱등키는 한 번 정하고 안 바꾼다 · C0 §4-1)
 * ③ 막힌 학생의 것은 안 나간다(`보낼것` — 새는 방향은 언제나 「보낸다」)
 * ④ attempt 는 같은 배정 안에서만 오른다(사슬 길이를 로컬이 지어내지 않는다)
 * ⑤ 배정 키는 날짜 스코프다 — 같은 키 재배정은 화면 잠김이다(발주 §6-6 ⑩)
 * ⑥ 죽은 배정 수거(H2)는 닻 있는 것만 걷는다 — 오귀속보다 0건(지어내지 않는다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  항목id, 항목추가, 다음시도번호, 제출항목, 죽은배정들, 전송기록, 밀린것, 보낼것,
} = require('../lib/게임로그.js');

const 고름사건 = (correlation_id = 'sit-1') => ({
  idempotency_key: 'k-choice-1',
  event_type: 'choice.selected',
  correlation_id,
  payload: { ver: 1 },
});
const 메일사건 = (correlation_id = 'sit-1', task_ref = 'task-2026-08-11') => ({
  idempotency_key: 'k-mail-1',
  event_type: 'submission.created',
  correlation_id,
  submission: { task_ref, task_format: '쓰기첨삭' },
  payload: { ver: 1, attempt_no: 1 },
});

test('항목 id — 앉음×사건종류당 하나 · 큐 소속 밖 사건은 못 든다', () => {
  assert.equal(항목id(고름사건('s')), 'choice:s');
  assert.equal(항목id(메일사건('s')), 'mail:s');
  assert.equal(항목id({ event_type: 'session.abandoned', correlation_id: 's' }), 'abandon:s');
  assert.equal(항목id({ event_type: 'correction.viewed', correlation_id: 's' }), null, '남의 큐 사건이 들어왔다');
  assert.equal(항목id({ event_type: 'choice.selected' }), null, '앉음 키 없는 사건');
});

test('같은 앉음의 같은 사건은 두 번 안 선다 — 사건 객체(멱등키)가 첫 것 그대로 남는다', () => {
  const { 로그: 한번 } = 항목추가([], 고름사건());
  const 다시 = 항목추가(한번, { ...고름사건(), idempotency_key: 'k-다른키' });
  assert.equal(다시.새것, false);
  assert.equal(다시.로그.length, 1);
  assert.equal(다시.항목.사건.idempotency_key, 'k-choice-1',
    '재호출이 멱등키를 갈아치웠다 — 회선이 끊길 때마다 서버에 두 벌 쌓인다');
});

test('다음시도번호 — 같은 배정 안에서만 오른다', () => {
  assert.equal(다음시도번호([], 'task-A'), 1);
  const { 로그 } = 항목추가([], 메일사건('sit-1', 'task-A'));
  assert.equal(다음시도번호(로그, 'task-A'), 2, '같은 배정의 재제출은 attempt 증가다');
  assert.equal(다음시도번호(로그, 'task-B'), 1, '날을 건넌 재제출(새 배정)은 1부터 — 사슬은 retry_of_event_id 가 잇는다');
});

test('제출항목 — 「이미 보냈다」 판정의 근거(다시 열면 대기 화면)', () => {
  const { 로그 } = 항목추가([], 메일사건());
  assert.ok(제출항목(로그, 'task-2026-08-11'));
  assert.equal(제출항목(로그, 'task-없음'), null);
  assert.equal(제출항목([], 'task-2026-08-11'), null);
});

test('배정 task_ref 는 날짜 스코프다 — 챌린지 상수면 둘째 게임날부터 영구 잠김(발주 §6-6 ⑩ C4·H3)', () => {
  const { 로그 } = 항목추가([], 메일사건('sit-1', 'task-2026-08-11'));
  /* 날짜 스코프면 다음 게임날·재제출 재배정이 새 키를 들고 와 「이미 보냈다」에 안 걸린다 —
   * 사슬은 배정 행이 낸 retry_of_event_id 가 잇는다(앱이 지어내지 않는다). */
  assert.equal(제출항목(로그, 'task-2026-08-18'), null,
    '새 배정이 첫날 제출에 막혔다 — 재제출 판이 영원히 안 서고 retry_of 행이 0이 된다');
  /* 챌린지 상수를 task_ref 로 쓰면 모든 게임날이 같은 키다 — 아래 매치가 곧
   * `src/교수멘탈화면.js` 마운트의 대기 점프라, 첫 제출 뒤 영구 잠김이다. */
  const 상수 = 항목추가([], 메일사건('sit-1', 'g1-교수멘탈')).로그;
  assert.ok(제출항목(상수, 'g1-교수멘탈'),
    '정확 일치 판정이 바뀌었다 — 두 번 제출 가드가 다른 축으로 샜다');
});

/* ─────────────────── 죽은 배정 수거 — H2 「다음 마운트 발견」 (발주 §6-6 ⑩ C5) ─────────────────── */

const 닻 = (ref = 'task-2026-08-10') => ({ task_ref: ref, level_snapshot: null, goal_snapshot: null });
const 이탈꼴 = (correlation_id, task_ref) => ({
  idempotency_key: 'k-ab-1',
  event_type: 'session.abandoned',
  correlation_id,
  submission: { task_ref, task_format: '쓰기첨삭' },
  payload: { ver: 1 },
});

test('죽은배정들 — 고름만 남고 날이 지난 배정을 걷는다 · 오늘을 모르면 0건', () => {
  const { 로그 } = 항목추가([], 고름사건('sit-어제'), 닻());
  assert.deepEqual(죽은배정들(로그, null), [], '오늘 배정을 모르는데 걷었다 — 오귀속보다 0건이 낫다');
  assert.deepEqual(죽은배정들(로그, 'task-2026-08-10'), [], '오늘 것을 걷었다 — 산 앉음이 이탈로 적힌다');
  const 죽은 = 죽은배정들(로그, 'task-2026-08-11');
  assert.equal(죽은.length, 1, '어제 고르고 사라진 배정이 안 걷혔다 — 이탈 신호가 도로 0이 된다');
  assert.equal(죽은[0].correlation_id, 'sit-어제');
  assert.equal(죽은[0].task_meta.task_ref, 'task-2026-08-10');
});

test('죽은배정들 — 제출·이탈이 이미 적힌 배정, 닻 없는 옛 항목은 안 걷는다', () => {
  /* 다른 앉음의 제출이라도 그 배정은 완결이다 — 같은 날 고아 고름은 이탈이 아니다. */
  let { 로그 } = 항목추가([], 고름사건('sit-1'), 닻());
  ({ 로그 } = 항목추가(로그, 메일사건('sit-2', 'task-2026-08-10')));
  assert.deepEqual(죽은배정들(로그, 'task-2026-08-11'), [], '제출된 배정을 또 걷었다');
  /* cleanup 생산자가 이미 세운 이탈(앉음이 달라도 같은 배정) — 또 걷으면 이중 계상이다. */
  const 이탈된 = 항목추가(항목추가([], 고름사건('sit-3'), 닻()).로그, 이탈꼴('sit-9', 'task-2026-08-10')).로그;
  assert.deepEqual(죽은배정들(이탈된, 'task-2026-08-11'), [], 'cleanup 이 적은 배정을 또 걷었다 — 이중 계상');
  /* 닻 없는 옛 항목 — 어느 배정의 것인지 지어낼 수 없다(분모로만 남는다). */
  const 옛 = 항목추가([], 고름사건('sit-옛')).로그;
  assert.deepEqual(죽은배정들(옛, 'task-2026-08-11'), [], '닻 없는 항목을 걷었다 — 지어낸 귀속이다');
});

test('항목추가 — 닻(task_meta)은 새 항목에만 붙고, 접힌 재호출이 첫 닻을 못 바꾼다', () => {
  const { 로그 } = 항목추가([], 고름사건('s'), 닻('task-A'));
  assert.deepEqual(로그[0].task_meta, 닻('task-A'));
  const 다시 = 항목추가(로그, 고름사건('s'), 닻('task-B'));
  assert.equal(다시.새것, false);
  assert.equal(다시.로그[0].task_meta.task_ref, 'task-A', '재호출이 닻을 갈아치웠다 — 귀속이 흔들린다');
  assert.ok(!('task_meta' in 항목추가([], 고름사건('s2')).로그[0]), '닻 없이 담았는데 빈 닻 키가 생겼다');
});

test('막힌 학생의 것은 안 나간다 — 큐에는 그대로 남는다(지우는 것이 아니다)', () => {
  const { 로그 } = 항목추가([], 메일사건());
  assert.equal(보낼것(로그, { code: 'CONSENT_MISSING' }).length, 0);
  assert.equal(보낼것(로그, null).length, 1);
  assert.equal(밀린것(로그).length, 1, '막힘이 항목을 지웠다 — 동의가 서는 날 나갈 것이 사라진다');
});

test('전송기록 — 도착·거절이 그 항목에만 적힌다(재수출이 제출로그와 같은 판정)', () => {
  let { 로그 } = 항목추가([], 메일사건());
  ({ 로그 } = 항목추가(로그, 고름사건()));
  로그 = 전송기록(로그, 'mail:sit-1', { event_id: 'E-1' });
  assert.equal(로그.find((e) => e.id === 'mail:sit-1').event_id, 'E-1');
  assert.equal(로그.find((e) => e.id === 'choice:sit-1').event_id, null);
  assert.equal(보낼것(로그, null).length, 1, '닿은 것이 다시 나간다');
});
