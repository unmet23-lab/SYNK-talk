'use strict';
/**
 * 08-31 감사 R1B18 조 회귀 — D7-5 · G1-11 · G1-3 · G1-8 · G1-7.
 *
 * ■ 무엇을 재나
 *   ① 통로 왕복에 시한이 실린다(요청의 `signal`) — 연결은 됐는데 바이트가 안 오는 회선에서
 *     OS 기본 시한까지 매달리던 자리(D7-5·G1-7). 시한 초과(abort)는 NETWORK·retryable:true 로
 *     접힌다 — 재시도 규약 무변경.
 *   ② `ok:true` 인데 `results` 가 없는 응답 — 형태 표류를 배달 지연과 **다른 글자**로 남긴다(G1-11).
 *   ③ `auth/reset`(함수부르기의 유일한 토큰 경로)도 만료 갱신을 탄다 — 401 → 갱신 → 1회 재시도(G1-3).
 *   ④ 원장 초기화가 두 탭이다 — 서버 preview 갈래가 GoTrue 쓰기 «앞»이고, 화면에 확인 걸음이 있다(G1-8).
 *
 * ⚠ 네트워크는 안 탄다 — `fetch` 를 가짜로 심어 무엇이 어디로 갔는지를 그대로 받아 본다
 *   (`tests/사건통로.test.js` 와 같은 통로 · 모듈은 실제로 세워 돌린다).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { 세우기 } = require('./lib/앱모듈세우기.js');
const { 코드만 } = require('./lib/소스검사.js');

const ROOT = path.join(__dirname, '..');

/* ─── ① D7-5 · G1-7 — 통로 왕복의 시한 ───────────────────────────────────── */

test('🔴 통로 왕복에 시한이 실린다 — 요청의 opt.signal 이 AbortSignal 이다 (감사 D7-5·G1-7)', async () => {
  const 요청들 = [];
  const 가짜 = async (url, opt) => {
    요청들.push({ url, opt });
    return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
  };
  const 통로 = 세우기(path.join(ROOT, 'src', '사건통로.js'), 가짜, { 캐시: new Map() });

  await 통로.부르기('progress', 'A1');

  assert.equal(요청들.length, 1);
  assert.ok(요청들[0].opt && 요청들[0].opt.signal instanceof AbortSignal,
    '요청에 signal 이 없다 — 죽은 회선에서 OS 기본 시한까지 매달린다(감사 D7-5)');
});

test('상한의 정본은 src/시한fetch.js 하나다 — 조회 15초 · 제출 30초', () => {
  const 시한 = 세우기(path.join(ROOT, 'src', '시한fetch.js'), async () => ({}), { 캐시: new Map() });
  assert.equal(시한.조회상한, 15000);
  assert.equal(시한.제출상한, 30000);
});

test('🔴 시한 초과(abort)는 NETWORK·retryable:true 로 접힌다 — 재시도 규약 무변경 (감사 D7-5)', async () => {
  const 가짜 = async (url, opt) => {
    assert.ok(opt && opt.signal, '시한 signal 이 안 실렸다 — 이 픽스처는 abort 를 흉내낼 자리가 없다');
    const e = new Error('Aborted');
    e.name = 'AbortError';
    throw e; // abort 된 fetch 의 reject — 실기기에서 시한이 끊는 그 모양이다
  };
  const 통로 = 세우기(path.join(ROOT, 'src', '사건통로.js'), 가짜, { 캐시: new Map() });

  const e = await 통로.부르기('progress', 'A1').then(() => null, (x) => x);

  assert.ok(e, '던져야 한다');
  assert.equal(e.code, 'NETWORK');
  assert.equal(e.retryable, true,
    'retryable:false 면 lib/제출로그.js 가 send_final 로 적는다 — 시한 초과는 기다리면 낫는 실패다');
});

/* ─── ② G1-11 — 한벌쏘기의 형태 위반 갈래 ────────────────────────────────── */

const 사건 = () => ({
  idempotency_key: '11111111-2222-4333-8444-555555555555',
  event_type: 'content.viewed',
  occurred_at: '2026-08-31T01:00:00.000Z',
  level_snapshot: 'Lv2',
  correlation_id: '99999999-8888-4777-8666-555555555555',
  parent_event_id: '22222222-3333-4444-8555-666666666666',
});

test('🔴 ok:true 인데 results 가 없다 — 끝:false 로 남기되 «형태»를 글자로 가른다 (감사 G1-11)', async () => {
  const 함수왕복 = [];
  const 가짜 = async (url) => {
    if (url.includes('/functions/v1/')) 함수왕복.push(url);
    return { ok: true, status: 200, json: async () => ({ ok: true }) }; // 봉투는 성공, results 없음
  };
  const 통로 = 세우기(path.join(ROOT, 'src', '사건통로.js'), 가짜, { 캐시: new Map() });

  const r = await 통로.사건보내기('A1', 사건());

  assert.equal(함수왕복.length, 1, '형태 위반은 멱등 충돌이 아니다 — 새 키 재전송이 나가면 안 된다');
  assert.equal(r.끝, false,
    '끝:true 로 접으면 서버가 이미 저장했을 발화를 버린다 — 재시도는 남기고 멱등키가 이중을 막는다');
  assert.ok(!r.event_id, '저장 확인도 없이 event_id 를 주면 로그가 저장됐다고 믿는다');
  assert.match(String(r.오류), /형태/,
    '괄호가 없으면 형태 표류와 진짜 배달 지연이 로그에서 같은 얼굴이 된다');
});

/* ─── ③ G1-3 — auth/reset 의 만료 갱신 ───────────────────────────────────── */

test('🔴 초기화요청도 만료 갱신을 탄다 — 401 → 갱신 → 새 토큰으로 1회 재시도 (감사 G1-3)', async () => {
  const 요청들 = [];
  const 함수응답 = [
    { status: 401, 몸: { code: 401, message: 'Invalid JWT' } }, // 게이트웨이 — 우리 봉투가 아니다
    { status: 200, 몸: { ok: true, temp_password: '482913', expires_in_minutes: 30, student_code: 'SYNK-042' } },
  ];
  const 가짜 = async (url, opt) => {
    const 헤더 = (opt && opt.headers) || {};
    요청들.push({ url, 토큰: String(헤더.Authorization || '').replace(/^Bearer\s+/, '') });
    const 만들기 = (r) => ({ ok: (r.status || 200) < 400, status: r.status || 200, json: async () => r.몸 || {} });
    if (url.includes('grant_type=refresh_token')) return 만들기({ 몸: { access_token: 'A2', refresh_token: 'R2' } });
    if (url.includes('grant_type=password')) return 만들기({ 몸: { access_token: 'A1', refresh_token: 'R1' } });
    return 만들기(함수응답.length > 1 ? 함수응답.shift() : 함수응답[0]);
  };
  const 인증 = 세우기(path.join(ROOT, 'src', '인증API.js'), 가짜, { 캐시: new Map() });
  await 인증.로그인('SYNK-001', 'pw'); // 기억이 선다(A1·R1) — 앱에서 세션이 서는 그 통로다
  요청들.length = 0;

  const r = await 인증.초기화요청({ 학생번호: 'SYNK-042', 토큰: 'PROP-OLD' });

  const 함수 = 요청들.filter((q) => q.url.includes('/functions/v1/auth/reset'));
  assert.equal(함수.length, 2, '함수 왕복은 정확히 둘(원본 + 재시도 1회 · §7-6 무한 루프 없음)');
  assert.deepEqual(함수.map((q) => q.토큰), ['A1', 'A2'],
    '첫 발사는 기억 토큰(낡은 prop 이 아니라) · 재시도는 갱신이 준 새 토큰이어야 한다');
  assert.equal(요청들.filter((q) => q.url.includes('grant_type=refresh_token')).length, 1, '갱신은 한 번뿐이다');
  assert.equal(r.임시번호, '482913', '재시도의 성공 응답이 화면까지 닿아야 한다');
});

/* ─── ④ G1-8 — 원장 초기화 두 탭 ─────────────────────────────────────────── */

test('원장 초기화 미리보기 — preview 를 싣고, 이름·미리보기가 반환에 실린다 (감사 G1-8)', async () => {
  const 인증판 = (응답들) => {
    const 부른것 = [];
    const 가짜 = async (u, opt) => {
      const o = opt || {};
      부른것.push({ url: u, 본문: o.body ? JSON.parse(o.body) : null });
      const r = 응답들.shift();
      return { ok: r.ok !== false, status: r.status || 200, json: async () => r.몸 || {} };
    };
    return { API: 세우기(path.join(ROOT, 'src', '인증API.js'), 가짜, { 캐시: new Map() }), 부른것 };
  };

  const 미리 = 인증판([{ 몸: { ok: true, student_code: 'SYNK-042', display_name: '바트', preview: true } }]);
  const r = await 미리.API.초기화요청({ 학생번호: 'SYNK-042', 토큰: 'DIRECTOR', 미리보기: true });
  assert.equal(미리.부른것[0].본문.preview, true, '첫 탭이 preview 를 안 실으면 그 탭이 곧 실행이다');
  assert.equal(r.이름, '바트');
  assert.equal(r.미리보기, true);
  assert.strictEqual(r.임시번호, null, '미리보기가 번호를 주면 확인 카드가 이미 실행이다');

  const 실행 = 인증판([{ 몸: { ok: true, student_code: 'SYNK-042', display_name: '바트', temp_password: '482913', expires_in_minutes: 30 } }]);
  const r2 = await 실행.API.초기화요청({ 학생번호: 'SYNK-042', 토큰: 'DIRECTOR' });
  assert.ok(!('preview' in 실행.부른것[0].본문),
    '실행 요청에 preview 가 실리면 안 된다 — 플래그 부재가 곧 «현행 실행 그대로»다(후방호환)');
  assert.equal(r2.이름, '바트', '결과 카드가 이름을 병기할 재료다');
  assert.equal(r2.미리보기, false);
});

test('🔴 서버 preview 갈래는 비밀번호갈기 «앞»이고, 화면에는 두 탭 갈래가 있다 (감사 G1-8)', () => {
  const 서버 = 코드만(fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'auth', 'index.ts'), 'utf8'));
  const 미리 = 서버.indexOf('본문.preview === true');
  const 갈기 = 서버.indexOf('비밀번호갈기(대상.auth_user_id');
  assert.ok(미리 > 0 && 갈기 > 0, '앵커가 낡았다 — 모양이 바뀌었으면 이 검사도 따라가야 한다');
  assert.ok(미리 < 갈기,
    '🔴 preview 갈래가 GoTrue 쓰기 뒤면 미리보기가 옛 비밀번호를 죽인다 — 확인 카드가 곧 실행이 된다');
  assert.match(서버, /select learner_id, auth_user_id, student_code, display_name/,
    '대상 조회에 display_name 이 없다 — 확인·결과 카드가 이름 없이 뜬다');

  const 화면 = 코드만(fs.readFileSync(path.join(ROOT, 'src', '원장초기화.js'), 'utf8'));
  assert.match(화면, /미리보기:\s*true/, '첫 탭이 미리보기를 안 부른다 — 원탭 실행 그대로다');
  assert.ok(화면.includes('초기화하기'), '둘째 탭(실행 버튼)이 화면에 없다');
});
