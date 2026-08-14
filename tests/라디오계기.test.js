/* 첫 2주 실측 계기 회귀 — 「안 쟀다」와 「0이다」가 갈리는지가 이 층의 급소다(발전 트랙 ⑬ · 08-14). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { 계기판, 표본하한, 시간대집계, 편성권고, 새벽대조, 맥박공백, 팩소진 } = require('../lib/라디오계기.js');

/* 픽스처 — UTC 기준으로 만들고 오프셋 8(울란바토르)로 읽는다. UTC 13시 = 현지 21시. */
const 맥박 = (utc, viewers) => ({ polled_at: utc, concurrent_viewers: viewers, messages_seen: 0 });
const 채팅 = (utc, kind) => ({ sent_at: utc, command_kind: kind });

test('시간대집계 — 오프셋으로 «현지 시»에 담긴다(UTC 13시 = 울란바토르 21시)', () => {
  const r = 시간대집계({ 맥박행들: [맥박('2026-08-14T13:00:00Z', 12)], 채팅행들: [] });
  assert.equal(r.계기판, 계기판);
  assert.equal(r.시간대[21].표본, 1);
  assert.equal(r.시간대[21].시청자평균, 12);
  assert.equal(r.시간대[13].표본, 0, 'UTC 시로 담겼다 — 현지 시간대 판정이 8시간 밀린다');
});

test('🔑 시청자 결손(null)은 0 으로 접지 않는다 — 접으면 「새벽엔 아무도 없다」가 결손에서 나온다', () => {
  const r = 시간대집계({
    맥박행들: [맥박('2026-08-14T13:00:00Z', null), 맥박('2026-08-14T13:30:00Z', 10)],
    채팅행들: [],
  });
  const c = r.시간대[21];
  assert.equal(c.표본, 2);
  assert.equal(c.시청자표본, 1, '결손을 표본에 넣었다');
  assert.equal(c.시청자평균, 10, '결손을 0 으로 접어 평균이 내려갔다');
});

test('시간대집계 — 표본 0 인 시간대의 평균은 null(0 이 아니다)', () => {
  const r = 시간대집계({ 맥박행들: [], 채팅행들: [] });
  assert.equal(r.시간대[3].시청자평균, null);
  assert.equal(r.분모.표본있는시간대, 0);
});

test('시간대집계 — 못 읽는 시각은 버리지 않고 사유별로 센다(F207)', () => {
  const r = 시간대집계({
    맥박행들: [맥박('언제', 3)],
    채팅행들: [채팅('2026-08-14T13:00:00Z', '답'), 채팅(null, '답')],
  });
  assert.equal(r.분모.뺀.맥박_시각불량, 1);
  assert.equal(r.분모.뺀.채팅_시각불량, 1);
  assert.equal(r.시간대[21].명령수, 1);
});

test('시간대집계 — 명령이 아닌 채팅은 채팅수에만 든다(명령 건수 = 표본 수라 섞으면 안 된다)', () => {
  const r = 시간대집계({ 맥박행들: [], 채팅행들: [채팅('2026-08-14T13:00:00Z', null), 채팅('2026-08-14T13:00:00Z', '답')] });
  assert.equal(r.시간대[21].채팅수, 2);
  assert.equal(r.시간대[21].명령수, 1);
});

/* ── 편성권고 ─────────────────────────────────────────────── */
function 집계만들기(설정) {
  const 맥박행들 = [];
  const 채팅행들 = [];
  for (const [현지시, 표본, 시청자, 명령] of 설정) {
    const utc = (현지시 - 8 + 24) % 24;
    for (let i = 0; i < 표본; i += 1) {
      맥박행들.push(맥박(`2026-08-${String(10 + (i % 4)).padStart(2, '0')}T${String(utc).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`, 시청자));
    }
    for (let i = 0; i < 명령; i += 1) {
      채팅행들.push(채팅(`2026-08-10T${String(utc).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`, '답'));
    }
  }
  return 시간대집계({ 맥박행들, 채팅행들 });
}

test('편성권고 — 참여(명령)가 1차 · 시청자 평균이 2차 · 시 순서로 돌려준다', () => {
  const 집계 = 집계만들기([[20, 30, 15, 40], [21, 30, 30, 5], [9, 30, 8, 20], [3, 30, 2, 1]]);
  const r = 편성권고({ 집계, 회수: 2 });
  assert.deepEqual(r.권고, [9, 20], '명령 수 상위 둘이 아니다');
  assert.equal(r.보류사유, null);
  assert.equal(r.근거.length, 2);
});

test('🔑 표본이 하한 미만이면 권고를 «지어내지 않는다» — 보류사유가 남는다', () => {
  const 집계 = 집계만들기([[20, 표본하한 - 1, 40, 99]]);
  const r = 편성권고({ 집계 });
  assert.deepEqual(r.권고, []);
  assert.match(r.보류사유, /표본 하한/);
});

test('편성권고 — 맥박이 아예 0 이면 「안 쟀다」라고 말한다(「참여 0」이 아니다)', () => {
  const r = 편성권고({ 집계: 시간대집계({}) });
  assert.match(r.보류사유, /안 쟀다/);
  assert.throws(() => 편성권고({ 집계: 시간대집계({}), 회수: 0 }), TypeError);
  assert.throws(() => 편성권고({}), TypeError);
});

test('새벽대조 — 숫자만 낸다(결론 문자열을 만들지 않는다 · 가정 판정은 사람 몫)', () => {
  const 집계 = 집계만들기([[3, 25, 4, 10], [20, 25, 30, 50]]);
  const r = 새벽대조({ 집계 });
  assert.equal(r.새벽.명령수, 10);
  assert.equal(r.새벽.시청자평균, 4);
  assert.equal(r.그밖.명령수, 50);
  assert.equal(Object.keys(r).length, 2, '판정 문장이 끼어들었다');
});

/* ── 맥박공백 ─────────────────────────────────────────────── */
test('맥박공백 — 기대 간격의 배수를 넘긴 구간만 잡는다', () => {
  const r = 맥박공백({
    맥박행들: [맥박('2026-08-14T00:00:00Z'), 맥박('2026-08-14T00:01:00Z'), 맥박('2026-08-14T00:20:00Z')],
  });
  assert.equal(r.공백.length, 1);
  assert.equal(r.공백[0].길이초, 1140);
  assert.equal(r.분모.샘플, 3);
  assert.equal(r.분모.최대공백초, 1140);
});

test('🔑 창 양 끝의 공백도 잡는다 — 첫 폴링 «전»에 죽어 있던 구간이 안 보이면 그게 제일 위험하다', () => {
  const r = 맥박공백({
    맥박행들: [맥박('2026-08-14T06:00:00Z')],
    창시작: '2026-08-14T00:00:00Z',
    창끝: '2026-08-14T12:00:00Z',
  });
  assert.equal(r.공백.length, 2, '양 끝 공백을 놓쳤다');
  assert.equal(r.공백[0].길이초, 21600);
});

test('맥박공백 — 행 순서가 뒤섞여 있어도 같은 답(DB 행 순서에 안 기댄다)', () => {
  const 행들 = [맥박('2026-08-14T00:20:00Z'), 맥박('2026-08-14T00:00:00Z'), 맥박('2026-08-14T00:01:00Z')];
  assert.deepEqual(맥박공백({ 맥박행들: 행들 }), 맥박공백({ 맥박행들: [...행들].reverse() }));
  assert.throws(() => 맥박공백({ 맥박행들: [], 배수: 0 }), TypeError);
});

/* ── 팩소진 ───────────────────────────────────────────────── */
test('팩소진 — 미노출이 남으면 none · 10% 이하면 임박 · 0 이면 소진', () => {
  const ids = Array.from({ length: 20 }, (_, i) => `q${i}`);
  const 노출 = (k) => Object.fromEntries(ids.slice(0, k).map((id) => [id, 1]));
  assert.equal(팩소진({ 문항ids: ids, 노출수: 노출(10) }).경보, 'none');
  assert.equal(팩소진({ 문항ids: ids, 노출수: 노출(18) }).경보, '임박');
  assert.equal(팩소진({ 문항ids: ids, 노출수: 노출(20) }).경보, '소진');
  assert.equal(팩소진({ 문항ids: ids, 노출수: 노출(20) }).한바퀴, true);
});

test('팩소진 — 분모 없는 경보를 만들지 않는다(빈 팩은 던진다)', () => {
  assert.throws(() => 팩소진({ 문항ids: [], 노출수: {} }), TypeError);
  const r = 팩소진({ 문항ids: ['a', 'b'], 노출수: { a: 3 } });
  assert.deepEqual(r.미노출, ['b']);
  assert.equal(r.최소노출, 0);
  assert.deepEqual(r.분모, { 팩: 2, 미노출: 1, 노출된: 1 });
});
