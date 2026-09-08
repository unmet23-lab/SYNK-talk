'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { 답장갱신기, 재조회간격 } = require('../lib/답장갱신.js');

const 마침 = () => new Promise((resolve) => setImmediate(resolve));
function 판(읽기) {
  const 값들 = [], 오류들 = [], 예약들 = new Map();
  let 순번 = 0, 조회수 = 0;
  const 갱신 = 답장갱신기({
    읽기: () => { 조회수++; return 읽기(); },
    받기: (값) => 값들.push(값), 오류: (e) => 오류들.push(e),
    예약: (fn, ms) => { 예약들.set(++순번, { fn, ms }); return 순번; },
    취소: (id) => 예약들.delete(id),
  });
  return { 갱신, 값들, 오류들, 예약들, 조회수: () => 조회수,
    async 다음() {
      const [id, { fn, ms }] = 예약들.entries().next().value;
      예약들.delete(id); fn(); await 마침(); return ms;
    },
  };
}

test('앱 시작은 한 번만 조회하고 빈 답장에도 반복하지 않는다', async () => {
  const p = 판(async () => ({ 목록: [], 막힘: null }));
  p.갱신.새로읽기(); await 마침();
  assert.equal(p.조회수(), 1);
  assert.deepEqual(p.값들, [{ 목록: [], 막힘: null }]);
  assert.equal(p.예약들.size, 0);
});

test('제출 직후 비어 있던 답장이 늦게 도착하면 같은 앱 세션에서 받는다', async () => {
  let 응답 = { 목록: [], 막힘: null };
  const p = 판(async () => 응답);
  p.갱신.새로읽기({ 제출뒤: true }); await 마침();
  응답 = { 목록: [{ correction_id: 'reply-new', corrected_text: '커피를 마셨어요.' }], 막힘: null };
  assert.equal(await p.다음(), 5000);
  assert.equal(p.값들.at(-1).목록[0].correction_id, 'reply-new');
  p.갱신.종료();
});

test('제출 뒤 조회는 정해진 횟수에서 끝나 무한 요청하지 않는다', async () => {
  const p = 판(async () => ({ 목록: [] }));
  p.갱신.새로읽기({ 제출뒤: true }); await 마침();
  const 간격들 = [];
  while (p.예약들.size) 간격들.push(await p.다음());
  assert.deepEqual(간격들, [...재조회간격]);
  assert.equal(p.조회수(), 1 + 재조회간격.length);
});

test('백그라운드에서는 예약을 멈추고 복귀하면 최신 답장을 읽는다', async () => {
  const p = 판(async () => ({ 목록: [] }));
  p.갱신.새로읽기({ 제출뒤: true }); await 마침();
  p.갱신.활성바꾸기(false);
  assert.equal(p.예약들.size, 0);
  p.갱신.새로읽기({ 제출뒤: true }); await 마침();
  assert.equal(p.조회수(), 1);
  p.갱신.활성바꾸기(true); await 마침();
  assert.equal(p.조회수(), 2);
  p.갱신.종료();
});

test('조회 중 제출 여러 건이 도착해도 요청이 겹치지 않고 마지막에 한 번 더 읽는다', async () => {
  const 완료들 = [];
  const p = 판(() => new Promise((r) => 완료들.push(r)));
  p.갱신.새로읽기();
  p.갱신.새로읽기({ 제출뒤: true });
  p.갱신.새로읽기({ 제출뒤: true });
  assert.equal(p.조회수(), 1);
  완료들.shift()({ 목록: ['제출 전 응답'] }); await 마침();
  assert.equal(p.조회수(), 2);
  assert.deepEqual(p.값들, []);
  완료들.shift()({ 목록: ['제출 후 응답'] }); await 마침();
  assert.deepEqual(p.값들, [{ 목록: ['제출 후 응답'] }]);
  assert.equal(p.예약들.size, 1);
  p.갱신.종료();
});

test('로그아웃 뒤 늦은 응답은 다음 계정 화면에 쓰이지 않는다', async () => {
  let 완료;
  const p = 판(() => new Promise((r) => { 완료 = r; }));
  p.갱신.새로읽기({ 제출뒤: true }); p.갱신.종료();
  완료({ 목록: ['이전 학생의 답장'] }); await 마침();
  p.갱신.활성바꾸기(true); p.갱신.새로읽기();
  assert.equal(p.조회수(), 1);
  assert.deepEqual(p.값들, []);
  assert.equal(p.예약들.size, 0);
});

test('오프라인 오류 뒤에도 다음 확인에서 회복하고 blocked를 같은 응답으로 받는다', async () => {
  let 실패 = true;
  const p = 판(async () => {
    if (실패) throw new Error('offline');
    return { 목록: [{ correction_id: 'r1' }], 막힘: { code: 'CONSENT_MISSING' } };
  });
  p.갱신.새로읽기({ 제출뒤: true }); await 마침();
  assert.equal(p.오류들.length, 1); assert.equal(p.값들.length, 0);
  실패 = false; await p.다음();
  assert.equal(p.값들[0].막힘.code, 'CONSENT_MISSING');
  p.갱신.종료();
});

test('앱을 떠난 사이 완료된 조회는 버리고 복귀 뒤 다시 읽는다', async () => {
  let 완료;
  const p = 판(() => new Promise((r) => { 완료 = r; }));
  p.갱신.새로읽기(); p.갱신.활성바꾸기(false);
  완료({ 목록: ['이전 상태'] }); await 마침();
  assert.deepEqual(p.값들, []);
  p.갱신.활성바꾸기(true);
  assert.equal(p.조회수(), 2);
  완료({ 목록: ['복귀 후'] }); await 마침();
  assert.deepEqual(p.값들, [{ 목록: ['복귀 후'] }]);
  p.갱신.종료();
});
