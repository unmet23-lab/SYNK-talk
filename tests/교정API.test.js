'use strict';
/**
 * 교정 API 회귀 (C0 §4-3 ② · P0 S1-8) — **결과축이 실제로 발화되는가**.
 *
 * 왜 있나 (appsscript `docs/_ops/학습데이터_전층감사.md` 발견 A):
 *   `correction.viewed`·`correction.responded` 는 아래층이 전부 초록인데 **내는 코드가 0줄**이었다.
 *   그 초록은 왕복시험까지 전부 **합성 사건**의 초록이라, 앱이 사건을 안 내도 아무것도 안 깨진다.
 *   그래서 이 파일이 재는 것은 「서버가 받아 주나」가 아니라 **「앱이 계약대로 만들어 내보내나」**다.
 *
 * 🔴 `src/*.js` 는 ESM 이라 `과제API.test.js` 와 같은 방식(@babel/core → vm)으로 **실제로 돌린다.**
 *   그런데 `교정API.js` 는 통로(`src/사건통로.js`)를 함께 세워야 뜻이 있다 — 통로를 가짜로
 *   바꿔치면 정작 검사하려는 게이트(계약 위반을 보내기 전에 접는가)가 한 번도 안 재진다.
 *   그래서 상대 경로 import 를 **재귀로 같이 세운다**(react-native 를 끌고 오는 `저장.js` 는
 *   이 사슬에 없다 — 통로를 파일로 가른 이유가 그것이다).
 * ⚠ 네트워크는 안 탄다 — `fetch` 를 가짜로 심고 **보낸 몸통을 그대로 받아 본다**.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { 세우기: 앱모듈 } = require('./lib/앱모듈세우기.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', '교정API.js');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));

/** 상대 import 를 재귀로 같이 세우는 공용 통로 — 사본이 갈라진 사연은 그 파일 머리말에. */
const 세우기 = (파일, fetch가짜) => 앱모듈(파일, fetch가짜);

/** 응답 하나를 주는 가짜 fetch + 보낸 요청 기록 */
function 세운판(몸, status = 200) {
  const 요청들 = [];
  const 가짜 = async (url, opt) => {
    요청들.push({ url, opt, 몸통: opt && opt.body ? JSON.parse(opt.body) : null });
    return { ok: status < 400, status, json: async () => 몸 };
  };
  return { 모듈: 세우기(SRC, 가짜), 요청들 };
}

const 재료 = () => ({
  correction_id: '11111111-2222-4333-8444-555555555555',
  correlation_id: '99999999-8888-4777-8666-555555555555',
  level_snapshot: 3,
  occurred_at: '2026-08-07T09:00:00.000Z',
});

/* ─── 값목록: 손 상수가 정본과 갈라지면 학생이 누른 답이 400 으로 사라진다 ─── */

test('학생응답값이 계약 §값목록 learner_response 와 정확히 같다', () => {
  const { 모듈 } = 세운판({ ok: true, results: [] });
  assert.deepEqual([...모듈.학생응답값], 계약.learning_events.값목록.learner_response);
});

/* ─── 사건 만들기 ─── */

test('열람사건이 공통필수 5칸 + correction_id 를 실어 검증을 지난다', () => {
  const { 모듈 } = 세운판({ ok: true, results: [] });
  const { 검증 } = require(path.join(ROOT, 'lib', '이벤트검증.js'));
  const e = 모듈.열람사건(재료());
  assert.equal(e.event_type, 'correction.viewed');
  assert.equal(e.correction_id, 재료().correction_id);
  assert.deepEqual(검증(e, {}), { ok: true, 오류들: [] });
});

test('응답사건이 payload.learner_response 를 실어 검증을 지난다', () => {
  const { 모듈 } = 세운판({ ok: true, results: [] });
  const { 검증 } = require(path.join(ROOT, 'lib', '이벤트검증.js'));
  const e = 모듈.응답사건({ ...재료(), 학생응답: '수정' });
  assert.equal(e.event_type, 'correction.responded');
  assert.equal(e.payload.learner_response, '수정');
  assert.deepEqual(검증(e, {}), { ok: true, 오류들: [] });
});

test('값목록 밖 학생응답은 사건을 아예 안 만든다 — 400 은 재시도가 안 된다', () => {
  const { 모듈 } = 세운판({ ok: true, results: [] });
  assert.equal(모듈.응답사건({ ...재료(), 학생응답: '좋아요' }), null);
  assert.equal(모듈.응답사건({ ...재료(), 학생응답: '' }), null);
});

test('correlation_id·correction_id 가 없으면 지어내지 않고 만들지 않는다', () => {
  const { 모듈 } = 세운판({ ok: true, results: [] });
  assert.equal(모듈.열람사건({ ...재료(), correlation_id: undefined }), null);
  assert.equal(모듈.열람사건({ ...재료(), correction_id: undefined }), null);
  assert.equal(모듈.열람사건(), null);
});

test('level_snapshot 은 몰라도 **키가 있어야** 한다 — null 로 실린다', () => {
  const { 모듈 } = 세운판({ ok: true, results: [] });
  const e = 모듈.열람사건({ ...재료(), level_snapshot: undefined });
  assert.equal(Object.prototype.hasOwnProperty.call(e, 'level_snapshot'), true);
  assert.equal(e.level_snapshot, null);
});

test('한 앉음은 사건마다 새로 나지 않는다 — 같은 correlation_id 를 나눠 쓴다', () => {
  const { 모듈 } = 세운판({ ok: true, results: [] });
  const 앉음 = 모듈.교정앉음();
  assert.match(앉음, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const a = 모듈.열람사건({ ...재료(), correlation_id: 앉음 });
  const b = 모듈.응답사건({ ...재료(), correlation_id: 앉음, 학생응답: '채택' });
  assert.equal(a.correlation_id, b.correlation_id);
  assert.notEqual(a.idempotency_key, b.idempotency_key);   // 항목은 다르다
  assert.notEqual(모듈.교정앉음(), 앉음);
});

/* ─── 보내기: 통로가 실제로 그 통로인가 ─── */

test('🔴 같은 사건 객체를 두 번 보내면 멱등키가 같다 — 보낼 때 짓지 않는다(①-5)', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, results: [{ status: 'stored', event_id: 'ev-1' }] });
  const e = 모듈.열람사건(재료());
  await 모듈.교정사건보내기('t', e);
  await 모듈.교정사건보내기('t', e);
  assert.equal(요청들.length, 2);
  assert.equal(요청들[0].몸통.events[0].idempotency_key, 요청들[1].몸통.events[0].idempotency_key);
  // 반대 방향 — 사건을 다시 만들면 새 키다(그래서 화면은 객체를 쥐고 있어야 한다)
  assert.notEqual(모듈.열람사건(재료()).idempotency_key, e.idempotency_key);
});

test('🔴 계약 위반은 네트워크를 아예 안 탄다(끝: true) — 게이트가 통로 안에 있다', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, results: [{ status: 'stored', event_id: 'ev-1' }] });
  const 깨진것 = { ...모듈.열람사건(재료()), correction_id: undefined };
  const r = await 모듈.교정사건보내기('t', 깨진것);
  assert.equal(r.끝, true);
  assert.match(r.오류, /계약 위반/);
  assert.equal(요청들.length, 0, '계약 위반이 회선을 탔다 — 100번 보내도 계약 위반이다');
});

test('duplicate 는 실패가 아니다 — 재전송이 접힌 것이다', async () => {
  const { 모듈 } = 세운판({ ok: true, results: [{ status: 'duplicate', event_id: 'ev-9' }] });
  const r = await 모듈.교정사건보내기('t', 모듈.열람사건(재료()));
  // 🔑 `deepStrictEqual` 을 쓰지 않는다 — 모듈이 vm realm 에서 살아 프로토타입이 다르다(값은 같다).
  assert.deepEqual(r, { event_id: 'ev-9' });
  assert.equal(r.오류, undefined);
});

test('사건은 events 로 간다 — 계약판 헤더를 달고', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, results: [{ status: 'stored', event_id: 'ev-1' }] });
  await 모듈.교정사건보내기('토큰값', 모듈.열람사건(재료()));
  assert.match(요청들[0].url, /\/functions\/v1\/events$/);
  assert.equal(요청들[0].opt.headers.Authorization, 'Bearer 토큰값');
  assert.match(요청들[0].opt.headers['X-Contract-Ver'], /^c\d+$/);
});

/* ─── 목록 읽기 ─── */

test('교정 목록을 그대로 싣는다 — 빈 목록도 정상이다', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, data: [{ correction_id: 'c1' }], next_cursor: 'x|y', contract_ver: 'c8' });
  const r = await 모듈.교정목록받기('t');
  assert.deepEqual(r.목록, [{ correction_id: 'c1' }]);
  assert.equal(r.다음커서, 'x|y');
  assert.match(요청들[0].url, /\/functions\/v1\/corrections$/);
  assert.equal(요청들[0].opt.method, 'GET');

  const 빈판 = 세운판({ ok: true, data: [], next_cursor: null, contract_ver: 'c8' });
  const 빈 = await 빈판.모듈.교정목록받기('t');
  assert.deepEqual(빈.목록, []);
  assert.equal(빈.다음커서, null);
});

test('🔴 목록 조회는 사건을 만들지 않는다 — 읽기가 쓰기를 겸하면 오염이다(C0 §4-3 ②)', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, data: [{ correction_id: 'c1' }], next_cursor: null });
  await 모듈.교정목록받기('t');
  assert.equal(요청들.length, 1);
  assert.equal(요청들.filter((q) => /\/events$/.test(q.url)).length, 0);
});

test('커서는 앞선 응답의 next_cursor 를 그대로 싣는다', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, data: [], next_cursor: null });
  await 모듈.교정목록받기('t', '2026-08-07T00:00:00.000Z|11111111-2222-4333-8444-555555555555');
  assert.match(요청들[0].url, /\?since=2026-08-07T00%3A00%3A00\.000Z%7C11111111-2222-4333-8444-555555555555$/);
});

test('서버 오류는 코드·재시도 가능 여부를 그대로 들고 올라온다', async () => {
  const { 모듈 } = 세운판({ ok: false, error: { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false } }, 401);
  await assert.rejects(() => 모듈.교정목록받기('t'), (e) => {
    assert.equal(e.code, 'AUTH_REQUIRED');
    assert.equal(e.retryable, false);
    return true;
  });
});
