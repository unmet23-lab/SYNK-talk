'use strict';
// 실제 화면 핸들러를 열어 실제 게임큐와 연결한다. UI의 즉시 반응과 서버 수신 순서를 따로 잰다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { 게임큐만들기 } = require('../lib/게임큐.js');
const { 보낼것 } = require('../lib/게임로그.js');
const { 확인사건 } = require('../lib/성향확인.js');
const { 확인카드파생 } = require('../lib/관통검증.js');
const source = fs.readFileSync(path.join(__dirname, '../src/교수멘탈화면.js'), 'utf8');
const handler = source.match(/const 확인답하기 = async \(값\) => \{[\s\S]*?\n  \};/)?.[0];
assert.ok(handler, '실제 확인 핸들러를 찾지 못했다');
const 기준 = '2026-09-11T03:00:00.000Z';
const 행들 = [3, 2, 1].flatMap((d) => {
  const t = Date.parse(기준) - d * 86400000;
  return [{ event_id: `a${d}`, event_type: 'task.assigned', occurred_at: new Date(t).toISOString(), due_at: new Date(t + 43200000).toISOString() },
    { event_id: `s${d}`, event_type: 'submission.created', occurred_at: new Date(t + 3600000).toISOString() }];
});
const 확인 = 확인카드파생(행들, { 기준, 시간대: 'Asia/Ulaanbaatar' }).카드;

function 세우기(보내기) {
  let 로그 = [], 반응 = null, 서버읽기 = 0;
  const 큐 = 게임큐만들기({ 읽기: async () => ({ 로그 }), 쓰기: async (v) => { 로그 = v; }, 보내기 });
  const 답 = vm.runInNewContext(`${handler}\n확인답하기`, {
    확인, 확인사건, 앉음: '11111111-2222-4333-8444-555555555555',
    흐름id: () => 'fixture-confirmation', 토큰: 'synthetic',
    set확인답: (v) => { 반응 = v; }, set로그: () => {}, 관측보고: () => {},
    게임사건담기: 큐.담기, 게임큐밀기: 큐.밀기, 확인뒤: () => { 서버읽기++; },
  });
  return { 답, 상태: () => ({ 로그, 반응, 서버읽기 }) };
}

test('성공 전송 — 반응은 즉시 보이고 서버 수신 뒤에만 progress를 다시 읽는다', async () => {
  let 수락, 전송시작;
  const 시작 = new Promise((r) => { 전송시작 = r; });
  const 지연 = new Promise((r) => { 수락 = r; });
  const 화면 = 세우기(async () => { 전송시작(); await 지연; return { event_id: 'received' }; });
  const 작업 = 화면.답('아니다');
  assert.equal(화면.상태().반응, '아니다', '전송이 UI 반응을 늦추면 안 된다');
  await 시작;
  assert.equal(화면.상태().서버읽기, 0, '수신 전 progress가 낡은 카드를 캐시했다');
  수락(); await 작업;
  assert.equal(화면.상태().서버읽기, 1);
  assert.equal(화면.상태().로그[0].event_id, 'received');
});

test('오프라인 — 큐 정상 종료는 수락 증거가 아니다; 재전송 항목과 즉시 반응을 보존한다', async () => {
  const 화면 = 세우기(async () => { throw new Error('offline'); });
  await 화면.답('아니다');
  assert.equal(화면.상태().반응, '아니다');
  assert.equal(화면.상태().서버읽기, 1, '현재 계약: 실패 후 조회도 가능하므로 서버 제외 완료로 세지 않는다');
  assert.ok(!화면.상태().로그[0].event_id);
  assert.equal(보낼것(화면.상태().로그, null).length, 1, '전송 실패한 확인 사건을 다시 보낼 수 있어야 한다');
});

test('합성 서버 — 실제 확인사건을 받고 같은 키를 제외한 progress를 내며 목표 필드도 독립해서 선다', () => {
  const { 확인합성서버 } = require('../tools/첫흐름미리보기.js');
  const 서버 = 확인합성서버(() => 기준);
  const 앞 = 서버.진행();
  assert.ok(앞.오늘의확인 && 앞.오늘의목표);
  const 답 = 확인사건(앞.오늘의확인, '아니다', { correlation_id: '11111111-2222-4333-8444-555555555555', idempotency_key: 'fixture1' });
  서버.받아([답]); 서버.받아([답]);
  const 뒤 = 서버.진행();
  assert.ok(뒤.오늘의확인);
  assert.notEqual(뒤.오늘의확인.shown_key, 앞.오늘의확인.shown_key);
  assert.ok(뒤.오늘의목표);
  assert.equal(서버.상태().응답수, 1);
  assert.deepEqual(서버.상태().순서.slice(0, 2), ['progress:여유제출', 'estimate.received']);
});
