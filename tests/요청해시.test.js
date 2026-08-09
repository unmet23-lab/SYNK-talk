'use strict';
/**
 * 요청 지문(`lib/요청해시.js`) — 멱등 충돌 판정의 **유일한 근거**라 여기가 틀리면 두 방향으로 샌다.
 *
 * ■ 두 실패 모드가 정반대다 — 둘 다 잰다
 *   ① 같은 요청이 다른 지문 → **정상 재전송이 충돌로 거절**된다(막으려던 것보다 나쁜 고장).
 *   ② 다른 요청이 같은 지문 → 지금과 똑같이 **발화가 조용히 사라진다**(B2 가 열려 있는 것).
 *   ①의 방아쇠는 키 순서다. JSON 은 키 순서를 보장하지 않고, 앱이 필드를 채우는 순서는
 *   화면 갈래마다 다르다 — 그래서 「순서만 다른 같은 객체」가 이 파일의 첫 검사다.
 *
 * ⚠ 탐지력을 픽스처로 건다(CLAUDE.md 가드 맹점 ②) — 실저장소 상태에 기대지 않는다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { 요청해시, 정규화 } = require('../lib/요청해시.js');

/** 앱이 실제로 보내는 모양에 가까운 사건 하나. */
const 사건 = () => ({
  event_type: 'submission.created',
  task_type: '발화녹음',
  occurred_at: '2026-08-09T01:02:03.000Z',
  idempotency_key: '11111111-2222-4333-8444-555555555555',
  correlation_id: '99999999-8888-4777-8666-555555555555',
  skill_ids: ['s.pron.batchim', 's.gram.honorific'],
  payload: { ver: 1, attempt_no: 2, choice: { selected: '가' } },
  submission: { task_ref: 'task-2026-08-09', body_original: '안녕하세요', audio_ref: null },
});

test('키 순서만 다른 같은 객체는 같은 지문이다 — 여기가 갈리면 정상 재전송이 거절된다', async () => {
  const a = 사건();
  // 같은 값들을 **역순으로** 다시 담는다(앱 화면마다 채우는 순서가 다르다).
  const b = {};
  for (const k of Object.keys(a).reverse()) b[k] = a[k];
  b.payload = { choice: { selected: '가' }, attempt_no: 2, ver: 1 };
  b.submission = { audio_ref: null, body_original: '안녕하세요', task_ref: 'task-2026-08-09' };

  assert.equal(await 요청해시(a), await 요청해시(b));
});

test('배열 순서는 의미다 — 뒤집으면 다른 지문', async () => {
  const a = 사건();
  const b = 사건();
  b.skill_ids = [...a.skill_ids].reverse();
  assert.notEqual(await 요청해시(a), await 요청해시(b));
});

test('값이 하나만 달라도 지문이 갈린다 — 이게 B2 를 막는 탐지력이다', async () => {
  const 기준 = await 요청해시(사건());
  const 변이 = [
    (e) => { e.submission.body_original = '안녕하세요.'; },   // 마침표 하나
    (e) => { e.payload.attempt_no = 3; },
    (e) => { e.occurred_at = '2026-08-09T01:02:03.001Z'; },   // 1밀리초
    (e) => { e.task_type = '숙제제출'; },
    (e) => { e.submission.audio_ref = 'voice/x/y.m4a'; },     // null → 값
    (e) => { e.payload.choice.selected = '나'; },             // 중첩 두 겹 아래
  ];
  for (const 바꾸기 of 변이) {
    const e = 사건();
    바꾸기(e);
    assert.notEqual(await 요청해시(e), 기준, `이 변이를 못 잡는다: ${정규화(e)}`);
  }
});

test('undefined 는 키까지 사라진다 — 「안 보냄」과 「보냈는데 비었음」이 갈리면 안 된다', async () => {
  const a = 사건();
  const b = 사건();
  b.turn_no = undefined;
  assert.equal(await 요청해시(a), await 요청해시(b));

  // 🔴 그러나 null 은 **보낸 값**이다 — undefined 와 같은 것으로 접으면 안 된다.
  const c = 사건();
  c.turn_no = null;
  assert.notEqual(await 요청해시(c), await 요청해시(a));
});

test('정규화 문자열이 실제로 정렬돼 있다 — 지문이 맞아도 눈으로 볼 수 있어야 한다', () => {
  const s = 정규화({ b: 1, a: { d: 2, c: 3 } });
  assert.equal(s, '{"a":{"c":3,"d":2},"b":1}');
});

test('지문은 hex 64자다 — DB text 칸과 길이 계약이 여기서 선다', async () => {
  assert.match(await 요청해시(사건()), /^[0-9a-f]{64}$/);
});

test('원본을 안 건드린다 — 지문 계산이 보내는 사건을 바꾸면 그 자체가 사고다', async () => {
  const a = 사건();
  const 전 = JSON.stringify(a);
  await 요청해시(a);
  assert.equal(JSON.stringify(a), 전);
});
