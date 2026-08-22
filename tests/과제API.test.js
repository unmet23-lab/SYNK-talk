'use strict';
/**
 * 과제 API 회귀 (C0 §4-3 ①) — **「왜 비었나」가 앱까지 닿는가**.
 *
 * 왜 있나 (F176 ①): `GET /v1/tasks` 는 막힌 학생에게 `data: []` + `blocked` 를 준다.
 * 서버가 이유를 실어도 **이 파일이 버리면 화면은 여전히 이유를 모른다** — 그 상태의 증상은
 * 「오늘 받은 과제가 아직 없어요」 하나뿐이라, 배치가 안 돈 날과 구별이 안 되고 학생은 기다린다.
 * 실왕복(`tools/배달왕복시험.js` ⑧)은 서버 응답까지만 재고 이 모듈은 지나가지 않는다.
 *
 * 🔴 `src/*.js` 는 ESM 인데 이 저장소의 테스트는 CJS 다 — `인증API.test.js` 와 같은 이유로
 *   @babel/core(Expo 가 이미 들고 있다)로 바꿔 **실제로 돌린다**. 새 의존성 0.
 * ⚠ 네트워크는 안 탄다 — `fetch` 를 가짜로 심는다.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { 세우기: 앱모듈 } = require('./lib/앱모듈세우기.js');

const SRC = path.join(__dirname, '..', 'src', '과제API.js');

/** 응답 하나를 주는 가짜 fetch 와 함께 모듈을 세운다. `던짐` 이면 fetch 자체가 실패한다(회선 없음).
 *
 * 🔴 상대 import 를 **재귀로 같이 세운다**(`tests/lib/앱모듈세우기.js`). 여기 있던 사본은 상대
 *   경로를 그냥 `require` 해서, 이 파일이 통로(`src/사건통로.js`)를 쓰기 시작한 날 **진짜 모듈**이
 *   섞여 들어왔다 — 그 모듈은 실제 `process.env` 를 읽어 `CONFIG` 로 죽었다. */
function 세우기(몸, status = 200, 던짐 = false) {
  return 앱모듈(SRC, async () => {
    if (던짐) throw new TypeError('Network request failed');
    return { ok: status < 400, status, json: async () => 몸 };
  });
}

test('🔴 막힘이 앱까지 그대로 온다 — 서버가 실은 이유를 이 층에서 버리지 않는다', async () => {
  const API = 세우기({ ok: true, data: [], blocked: { code: 'CONSENT_MISSING' }, contract_ver: 'c8' });
  const r = await API.오늘과제받기('토큰');
  assert.equal(r.항목, null, '빈 배열은 그대로 빈 것이다 — 여기서 던지면 화면이 「고장」이 된다');
  assert.deepEqual(r.막힘, { code: 'CONSENT_MISSING' });
});

test('🔴 assignment_status 가 앱까지 그대로 온다 — 빈 배정의 «없다»와 «곧 온다»를 이 층에서 뭉개지 않는다(§3-1 · §12-11)', async () => {
  for (const v of ['있음', '없음', '생성중', '오류', '대기중']) {
    const API = 세우기({ ok: true, data: [], blocked: null, assignment_status: v, contract_ver: 'c12' });
    const r = await API.오늘과제받기('토큰');
    assert.equal(r.assignment_status, v, `값 ${v} 를 그대로 싣는다(모르는 값도 — 화면이 「괜찮다」로 접지 않게)`);
  }
  const 구앱 = 세우기({ ok: true, data: [], blocked: null, contract_ver: 'c11' });
  assert.equal((await 구앱.오늘과제받기('토큰')).assignment_status, null, '칸이 없으면 null — 구앱 규칙(data 만으로 그린다)과 같은 동작');
  const 이상 = 세우기({ ok: true, data: [], assignment_status: 7 });
  assert.equal((await 이상.오늘과제받기('토큰')).assignment_status, null, '문자열이 아니면 null — 모양이 다른 값을 화면에 흘리지 않는다');
});

test('🔴 과제가 있어도 막힘을 잰다 — 배정 뒤 철회한 학생은 과제를 보면서 업로드만 막힌다', async () => {
  const API = 세우기({ ok: true, data: [{ task_id: 't1' }], blocked: { code: 'CONSENT_MISSING' } });
  const r = await API.오늘과제받기('토큰');
  assert.equal(r.항목.task_id, 't1');
  assert.deepEqual(r.막힘, { code: 'CONSENT_MISSING' },
    '🔴 「비었을 때만」 읽으면 막힘이 측정이 아니라 추측이 된다');
});

test('막히지 않은 날은 null 이다 — 없는 것을 있는 척하지 않는다', async () => {
  const API = 세우기({ ok: true, data: [{ task_id: 't1' }], blocked: null });
  assert.equal((await API.오늘과제받기('토큰')).막힘, null);
});

/* ── 배치 미달 (P0 §6-5 · 원장 화면의 「보는 눈」) ────────────────────────────
 * 급소는 값이 오는 갈래가 아니라 **안 오는 갈래**다: 이 조회는 학생 전원이 지나가고 그들은
 * 전부 401 을 받는다(권한은 서버가 정한다). 여기서 던지면 호출부가 학생의 401 을 오류로
 * 다루고, 최악은 그걸 세션 만료로 읽어 **멀쩡한 학생을 로그아웃**시키는 것이다. */

test('🔴 미달이면 서버가 센 수가 그대로 온다 — 원장이 「몇 명이 못 받았나」를 본다', async () => {
  const API = 세우기({ ok: true, mode: '점검', date: '2026-08-09', 재적: 12, 배정: 3, 강등: 3, 미달: true });
  assert.deepEqual(await API.배치미달받기('토큰'), { 날짜: '2026-08-09', 재적: 12, 배정: 3, 강등: 3 });
});

test('🔴 미달이 아니면 null — 판정은 서버 값 하나다(부등호를 여기서 다시 세지 않는다)', async () => {
  // 서버가 `미달:false` 라고 답한 응답에 배정<재적 을 일부러 실었다. 앱이 스스로 세면
  // 이 줄에서 값이 나오고, 그 순간 판정이 두 곳에 살아 갈라지는 날 화면이 조용히 눕는다.
  const API = 세우기({ ok: true, mode: '점검', date: '2026-08-09', 재적: 12, 배정: 3, 강등: 0, 미달: false });
  assert.equal(await API.배치미달받기('토큰'), null);
});

test('🔴 원장이 아니면(401) 던지지 않고 null — 학생 전원이 매일 지나가는 갈래다', async () => {
  const API = 세우기({ ok: false, error: { code: 'AUTH_REQUIRED' } }, 401);
  assert.equal(await API.배치미달받기('토큰'), null,
    '던지면 호출부가 이 401 을 세션 만료로 읽어 멀쩡한 학생을 로그아웃시킬 수 있다');
});

test('🔴 회선이 없어도 던지지 않는다 — 안 보이는 것과 「정상」을 화면이 구별할 재료가 없다', async () => {
  const API = 세우기(null, 200, true);
  assert.equal(await API.배치미달받기('토큰'), null);
});

test('토큰이 없으면 부르지도 않는다', async () => {
  const API = 세우기({ 미달: true, 재적: 1, 배정: 0 });
  assert.equal(await API.배치미달받기(''), null);
});
