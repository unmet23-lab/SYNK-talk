/* 게임큐 회귀 — 게임 로그의 단일 직렬 통로(`lib/게임큐.js` · 적대 리뷰 B2·B3).
 *
 * ■ 탐지력이 먼저다(CLAUDE.md 맹점 ②)
 *   「동시 read-modify-write 가 사건을 지운다」(B3)는 재현 픽스처로 **실제로 일어나는지**부터
 *   보인다 — 그 소실이 재현 안 되면 직렬 통로는 장식이고 이 파일의 초록은 아무것도 안 잰다.
 *
 * ■ 배선(B2)은 소스로 잰다 — 밀기 자리는 핸들러·effect 안이라 첫 렌더가 못 돈다
 *   (`화면렌더.test.js` ⑩ 과 같은 판정 · 새는 방향은 언제나 「통과」다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { 게임큐만들기 } = require('../lib/게임큐.js');
const { 코드만, 코드만픽스처 } = require('./lib/소스검사.js');

const 쉼 = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** 가짜 저장 — 읽기·쓰기 사이에 일부러 시간을 벌려 경쟁 창을 만든다. */
function 가짜저장(지연 = 5) {
  const 판 = { 로그: [] };
  return {
    판,
    읽기: async () => { await 쉼(지연); return { 로그: 판.로그, 깨진줄: 0 }; },
    쓰기: async (로그) => { await 쉼(지연); 판.로그 = 로그; },
  };
}

const 고름사건 = { idempotency_key: 'k1', event_type: 'choice.selected', correlation_id: 's1', payload: { ver: 1 } };
const 이탈사건 = { idempotency_key: 'k2', event_type: 'session.abandoned', correlation_id: 's1', payload: { ver: 1 } };
const 메일사건 = {
  idempotency_key: 'k3', event_type: 'submission.created', correlation_id: 's1',
  submission: { task_ref: 'task-A', task_format: '쓰기첨삭' }, payload: { ver: 1, attempt_no: 1 },
};

/* ── 탐지력 — B3 의 소실이 픽스처에서 실제로 난다 ────────────────────────────── */

test('재현 — 직렬 통로 없이 동시 read-modify-write 를 하면 사건 하나가 파일에서 사라진다(B3 그 모양)', async () => {
  const { 판, 읽기, 쓰기 } = 가짜저장();
  const { 항목추가 } = require('../lib/게임로그.js');
  const 구식담기 = async (사건) => {           // 옛 화면이 하던 그대로 — 캡처한 배열로 덮는다
    const { 로그 } = await 읽기();
    const r = 항목추가(로그, 사건);
    if (r.새것) await 쓰기(r.로그);
  };
  await Promise.all([구식담기(고름사건), 구식담기(이탈사건)]);
  assert.equal(판.로그.length, 1,
    '소실이 재현되지 않았다 — 이 픽스처가 결함을 못 만들면 아래 통과 검사는 아무것도 안 잰다');
});

/* ── 직렬 통로 — 같은 경쟁이 원리상 없다 ────────────────────────────────────── */

test('담기 둘을 동시에 걸어도 둘 다 남는다 — 사슬 하나 + 매 작업 read-modify-write', async () => {
  const { 판, 읽기, 쓰기 } = 가짜저장();
  const 큐 = 게임큐만들기({ 읽기, 쓰기, 보내기: async () => ({ event_id: 'E' }) });
  await Promise.all([큐.담기(고름사건), 큐.담기(이탈사건)]);
  assert.deepEqual(판.로그.map((e) => e.id).sort(), ['abandon:s1', 'choice:s1'].sort());
});

test('밀기와 담기가 겹쳐도 안 덮는다 — 민 결과와 새 사건이 다 남는다', async () => {
  const { 판, 읽기, 쓰기 } = 가짜저장();
  const 큐 = 게임큐만들기({
    읽기, 쓰기,
    보내기: async () => { await 쉼(15); return { event_id: 'E-1' }; }, // 느린 회선
  });
  await 큐.담기(메일사건);
  await Promise.all([큐.밀기('토큰', null), 큐.담기(이탈사건)]);
  const ids = 판.로그.map((e) => e.id).sort();
  assert.deepEqual(ids, ['abandon:s1', 'mail:s1'].sort(), '늦게 끝난 쪽이 파일을 덮어 한쪽이 사라졌다');
  assert.equal(판.로그.find((e) => e.id === 'mail:s1').event_id, 'E-1', '민 결과가 덮여 사라졌다 — 같은 사건이 다시 나간다');
});

test('앉음당 1번 — 같은 사건을 두 번 담아도 항목·멱등키가 첫 것 그대로다', async () => {
  const { 판, 읽기, 쓰기 } = 가짜저장(0);
  const 큐 = 게임큐만들기({ 읽기, 쓰기, 보내기: async () => ({ event_id: 'E' }) });
  await 큐.담기(고름사건);
  const 다시 = await 큐.담기({ ...고름사건, idempotency_key: 'k-다른키' });
  assert.equal(다시.새것, false);
  assert.equal(판.로그.length, 1);
  assert.equal(판.로그[0].사건.idempotency_key, 'k1');
});

test('막힌 학생의 것은 밀기가 안 보낸다 — 큐에는 그대로 남는다', async () => {
  const { 판, 읽기, 쓰기 } = 가짜저장(0);
  let 보낸수 = 0;
  const 큐 = 게임큐만들기({ 읽기, 쓰기, 보내기: async () => { 보낸수 += 1; return { event_id: 'E' }; } });
  await 큐.담기(메일사건);
  await 큐.밀기('토큰', { code: 'CONSENT_MISSING' });
  assert.equal(보낸수, 0, '막혔는데 나갔다 — retryable:false 로 접혀 동의가 서는 날 나갈 것이 죽는다');
  assert.equal(판.로그[0].event_id, null);
  await 큐.밀기('토큰', null);
  assert.equal(보낸수, 1, '막힘이 풀렸는데 안 나간다');
});

test('앞 작업의 실패가 사슬을 안 끊는다 — 다음 작업은 그대로 돈다', async () => {
  const { 판, 읽기, 쓰기 } = 가짜저장(0);
  let 첫번째 = true;
  const 큐 = 게임큐만들기({
    읽기: async () => {
      if (첫번째) { 첫번째 = false; throw new Error('디스크가 잠깐 죽었다'); }
      return 읽기();
    },
    쓰기,
    보내기: async () => ({ event_id: 'E' }),
  });
  await assert.rejects(() => 큐.담기(고름사건), /디스크/);
  await 큐.담기(이탈사건); // 사슬이 살아 있어야 한다
  assert.equal(판.로그.length, 1);
  assert.equal(판.로그[0].id, 'abandon:s1');
});

test('밀기는 항목마다 결과를 즉시 적는다 — 도중에 실패해도 닿은 것은 남는다', async () => {
  const { 판, 읽기, 쓰기 } = 가짜저장(0);
  let 회차 = 0;
  const 큐 = 게임큐만들기({
    읽기, 쓰기,
    보내기: async () => {
      회차 += 1;
      if (회차 === 2) throw new Error('회선 끊김');
      return { event_id: `E-${회차}` };
    },
  });
  await 큐.담기(메일사건);
  await 큐.담기(고름사건);
  await 큐.밀기('토큰', null);
  const 첫 = 판.로그.find((e) => e.id === 'mail:s1');
  const 둘 = 판.로그.find((e) => e.id === 'choice:s1');
  assert.equal(첫.event_id, 'E-1', '닿은 결과가 파일에 없다 — 다음 열림에 같은 것이 또 나간다');
  assert.equal(둘.event_id, null);
  assert.match(String(둘.send_error), /회선/);
});

/* ── 배선(B2) + 통로 유일성(B3 등록층) — 소스로 잰다 ─────────────────────────── */

test('말하기화면의 공용 배출구(밀린것보내기)가 게임 큐를 실값 막힘으로 민다 (B2)', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다');
  const 소스 = 코드만(fs.readFileSync(path.join(ROOT, 'src', '말하기화면.js'), 'utf8'));
  const 자리 = 소스.indexOf('밀린것보내기 = async');
  const 몸 = 소스.slice(자리, 소스.indexOf('};', 자리));
  assert.ok(자리 > -1, '밀린것보내기가 없다 — 이름이 바뀌었으면 이 검사도 따라가야 한다');
  assert.match(몸, /게임큐밀기\(토큰,\s*막힘참조\.current\)/,
    '게임 큐 배출구가 빠졌다(또는 막힘을 실값으로 안 넘긴다) — 비-G1 날의 밀린 게임 사건이 영영 안 나간다');
});

test('게임 로그 저장을 직접 잡는 곳은 게임큐·저장뿐이다 — 통로 밖 쓰기는 파일을 덮는다 (B3 등록층)', () => {
  const 허용 = new Set(['게임큐.js', '저장.js']);
  for (const 파일 of fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js'))) {
    if (허용.has(파일)) continue;
    const 코드 = 코드만(fs.readFileSync(path.join(ROOT, 'src', 파일), 'utf8'));
    assert.ok(!/게임로그쓰기|게임로그읽기/.test(코드),
      `src/${파일} 이 게임 로그 저장을 직접 잡는다 — 직렬 통로(src/게임큐.js) 밖의 쓰기는 남의 사건을 지운다`);
  }
});
