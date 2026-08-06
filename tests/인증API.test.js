'use strict';
/**
 * 인증 API 회귀 (C0 §2 · §4-4~4-6) — **로그인 길목**이다.
 *
 * 왜 있나: 화면 4종은 이미 섰는데(`6818285`) 이 층에는 검사가 **0** 이었다. 여기가 새면
 * 증상이 둘 중 하나인데 둘 다 조용하다 — ①전 학생이 못 들어온다(본문 키가 하나 어긋나면
 * 서버가 400 을 주는데 화면은 그냥 「맞지 않습니다」로 접는다) ②**학생번호의 존재가 샌다**
 * (없는 번호와 틀린 비밀번호의 응답이 갈리면 명단을 훑을 수 있다 · L0 §4-1).
 *
 * 🔴 왜 babel 을 부르나 — `src/*.js` 는 ESM 인데 이 저장소의 테스트는 CJS(`node --test`)다.
 *   그냥 `require` 하면 SyntaxError 라, 이 파일은 **여태 한 번도 실행된 적이 없다**
 *   (`화면구문.test.js` 는 파싱만 한다 — 통과와 미실행이 같은 모양이던 자리).
 *   Expo 가 이미 들고 있는 @babel/core 로 CJS 로 바꿔 **실제로 돌린다**. 새 의존성 0.
 *
 * ⚠ 네트워크는 안 탄다 — `fetch` 를 가짜로 심어 **무엇을 어디로 보냈는지**를 잰다.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/core');

const SRC = path.join(__dirname, '..', 'src', '인증API.js');
const URL_ = 'https://x.supabase.co';
const ANON = 'anon-key';

/**
 * 모듈을 **가짜 fetch·가짜 환경변수와 함께** 세운다.
 * @param 응답들 fetch 가 순서대로 낼 것. `{ok,status,몸}` 또는 `{throw:true}`.
 * @returns {{API:object, 부른것:Array}} 부른것 = 실제로 나간 요청(순서·URL·헤더·본문)
 */
function 세우기({ 응답들 = [], url = URL_, anon = ANON } = {}) {
  const 부른것 = [];
  const fetch = async (u, opt) => {
    const o = opt || {};
    부른것.push({ url: u, method: o.method, headers: o.headers || {}, 본문: o.body ? JSON.parse(o.body) : null });
    const r = 응답들.shift();
    if (!r) throw new Error(`예상 못한 호출: ${u}`);
    if (r.throw) throw new Error('network down');
    return { ok: r.ok !== false, status: r.status || 200, json: async () => r.몸 || {} };
  };
  const { code } = babel.transformFileSync(SRC, {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const module_ = { exports: {} };
  vm.runInNewContext(code, {
    module: module_,
    exports: module_.exports,
    require: (p) => require(path.resolve(path.dirname(SRC), p)),
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: anon } },
    fetch,
    console,
  });
  return { API: module_.exports, 부른것 };
}

/** 던진 오류를 잡아 온다 — `instanceof` 는 vm 경계를 못 넘으니 `code` 로 본다. */
async function 던진것(fn) {
  try { await fn(); } catch (e) { return e; }
  assert.fail('던져야 하는데 안 던졌다');
}

// ── 설정 ────────────────────────────────────────────────────
test('설정됐나 — EXPO_PUBLIC 이 비면 false (화면이 「모르는 상태」로 빠지지 않게)', () => {
  assert.equal(세우기().API.설정됐나(), true);
  assert.equal(세우기({ url: '', anon: '' }).API.설정됐나(), false);
  assert.equal(세우기({ anon: '' }).API.설정됐나(), false, '키만 비어도 false 여야 한다');
});

// ── 로그인 — 응답을 가르지 않는다 (이 파일에서 가장 무거운 검사) ──
test('🔴 로그인 실패는 **한 문장으로 접힌다** — 없는 번호와 틀린 비밀번호가 구별되면 명단이 샌다', async () => {
  const 접힌것 = [];
  for (const r of [
    { ok: false, status: 400, 몸: { error: 'invalid_grant', error_description: 'Invalid login credentials' } },
    { ok: false, status: 400, 몸: { error_description: 'Email not confirmed' } },
    { ok: false, status: 404, 몸: { msg: 'User not found' } },
    { ok: false, status: 429, 몸: { msg: 'Too many requests' } },
  ]) {
    const { API } = 세우기({ 응답들: [r] });
    const e = await 던진것(() => API.로그인('SYNK-042', 'pw123456'));
    접힌것.push(`${e.code}|${e.message}`);
    assert.ok(!/Invalid|not found|confirmed|requests/i.test(e.message),
      `🔴 GoTrue 원문이 그대로 샜다: ${e.message}`);
  }
  assert.equal(new Set(접힌것).size, 1, `🔴 실패 사유마다 답이 갈린다 — 학생번호의 존재가 샌다:\n  ${[...new Set(접힌것)].join('\n  ')}`);
});

test('로그인 — 합성 이메일로 GoTrue 를 직접 부르고, 비밀번호는 손대지 않는다', async () => {
  const { API, 부른것 } = 세우기({ 응답들: [{ 몸: { access_token: 'A', refresh_token: 'R', user: { id: 'u1' } } }] });
  const 세션 = await API.로그인(' synk 042 ', '  비밀 번호  ');
  assert.equal(부른것.length, 1);
  assert.equal(부른것[0].url, `${URL_}/auth/v1/token?grant_type=password`);
  /* 🔑 기대값을 여기 다시 적지 않는다 — 적는 순간 규칙이 두 곳에 살고, 갈라지면
   *   증상은 「어떤 학생만 로그인이 안 된다」뿐이라 원인을 찾는 데 가장 오래 걸린다.
   *   정본(`lib/학생계정.js`)을 그대로 불러 대조한다. Edge Function 도 같은 파일을 싣는다. */
  assert.equal(부른것[0].본문.email, require('../lib/학생계정.js').이메일('SYNK-042'),
    '🔴 합성 이메일을 인증API 가 스스로 만들었다 — lib/학생계정 과 갈라진다');
  assert.equal(부른것[0].본문.password, '  비밀 번호  ', '🔴 비밀번호를 손댔다 — 학생이 정한 값과 달라진다');
  assert.deepEqual(세션, { access_token: 'A', refresh_token: 'R', user: { id: 'u1' } });
});

// ── 첫 등록 ────────────────────────────────────────────────
test('🔴 첫등록 — 본문 키가 계약 그대로고, `learner_id` 를 싣지 않는다 (실으면 서버가 400)', async () => {
  const { API, 부른것 } = 세우기({ 응답들: [{ 몸: { ok: true } }, { 몸: { access_token: 'A' } }] });
  await API.첫등록({ 학생번호: 'SYNK-042', 뒷자리: '1234', 비밀번호: 'pw123456', 복구이메일: '', 복구전화: '' });

  assert.equal(부른것[0].url, `${URL_}/functions/v1/auth/first-login`);
  assert.deepEqual(Object.keys(부른것[0].본문).sort(),
    ['password', 'phone_last4', 'recovery_email', 'recovery_phone', 'student_code'],
    '🔴 본문 키가 C0 §4-4 와 갈라졌다 — 갈라지면 전 학생이 못 들어온다');
  assert.equal(부른것[0].본문.recovery_email, null, '빈 문자열을 그대로 보냈다(계약은 null)');
  // 🔑 성공해도 세션은 안 생긴다 — 곧바로 로그인까지 가야 화면이 다음으로 넘어간다.
  assert.equal(부른것[1].url, `${URL_}/auth/v1/token?grant_type=password`, '🔴 등록만 하고 로그인을 안 했다');
});

test('첫등록 실패는 서버가 준 `code` 를 그대로 넘긴다 (화면은 문구가 아니라 code 로 분기한다)', async () => {
  const { API, 부른것 } = 세우기({
    응답들: [{ ok: false, status: 401, 몸: { ok: false, error: { code: 'FIRST_LOGIN_FAILED', message: '확인할 수 없어요', retryable: false } } }],
  });
  const e = await 던진것(() => API.첫등록({ 학생번호: 'SYNK-042', 뒷자리: '9999', 비밀번호: 'pw123456' }));
  assert.equal(e.code, 'FIRST_LOGIN_FAILED');
  assert.equal(e.retryable, false);
  assert.equal(부른것.length, 1, '🔴 등록이 거절됐는데 로그인까지 갔다');
});

// ── 비밀번호 변경 — 순서가 곧 보안 ────────────────────────────
test('🔴 비밀번호 변경은 **현재 비밀번호 확인이 먼저**다 — 확인이 깨지면 PUT 을 아예 안 부른다', async () => {
  /* 확인 없이 updateUser 만 부르면, 잠깐 자리를 비운 사이 남이 비밀번호를 갈아버린다.
   * 토큰이 살아 있다는 것은 「그때 로그인했다」이지 「지금 이 사람이 본인이다」가 아니다(L0 §4-2-3). */
  const { API, 부른것 } = 세우기({ 응답들: [{ ok: false, status: 400, 몸: {} }] });
  const e = await 던진것(() => API.비밀번호변경({ 학생번호: 'SYNK-042', 현재비밀번호: '틀림', 새비밀번호: 'new123456', 토큰: 'T' }));
  assert.equal(e.code, 'LOGIN_FAILED');
  assert.equal(부른것.length, 1, '🔴 현재 비밀번호가 틀렸는데 비밀번호를 바꾸러 갔다');
  assert.ok(!부른것.some((c) => c.method === 'PUT'), '🔴 PUT 이 나갔다');
});

test('비밀번호 변경 — 확인을 지나면 내 토큰으로 PUT 한다', async () => {
  const { API, 부른것 } = 세우기({ 응답들: [{ 몸: { access_token: 'A' } }, { 몸: {} }] });
  await API.비밀번호변경({ 학생번호: 'SYNK-042', 현재비밀번호: 'old123456', 새비밀번호: 'new123456', 토큰: 'T' });
  assert.equal(부른것[1].method, 'PUT');
  assert.equal(부른것[1].url, `${URL_}/auth/v1/user`);
  assert.equal(부른것[1].headers.Authorization, 'Bearer T', '🔴 남의 토큰·anon 으로 바꾸려 했다');
  assert.equal(부른것[1].본문.password, 'new123456');
});

// ── 임시번호 · 원장 초기화 ────────────────────────────────────
test('임시번호 로그인 — temp-login 을 지나 **새 비밀번호로** 로그인한다', async () => {
  const { API, 부른것 } = 세우기({ 응답들: [{ 몸: { ok: true } }, { 몸: { access_token: 'A' } }] });
  await API.임시번호로그인({ 학생번호: 'SYNK-042', 임시번호: '123456', 새비밀번호: 'new123456' });
  assert.equal(부른것[0].url, `${URL_}/functions/v1/auth/temp-login`);
  assert.deepEqual(Object.keys(부른것[0].본문).sort(), ['new_password', 'student_code', 'temp_password']);
  assert.equal(부른것[1].본문.password, 'new123456', '🔴 임시번호로 로그인했다 — 그 값은 이제 죽었다');
});

test('🔴 원장 초기화 — **원장 토큰**을 싣는다 (anon 으로 부르면 403 이라 아무 일도 안 일어난다)', async () => {
  const { API, 부른것 } = 세우기({
    응답들: [{ 몸: { ok: true, temp_password: '482913', expires_in_minutes: 30, student_code: 'SYNK-042' } }],
  });
  const r = await API.초기화요청({ 학생번호: 'SYNK-042', 토큰: 'DIRECTOR' });
  assert.equal(부른것[0].headers.Authorization, 'Bearer DIRECTOR');
  assert.equal(부른것[0].headers.apikey, ANON, 'apikey 는 anon 이어야 게이트웨이를 지난다');
  assert.deepEqual(r, { 임시번호: '482913', 유효분: 30, 학생번호: 'SYNK-042' });
});

// ── 네트워크 ────────────────────────────────────────────────
test('네트워크가 끊긴 것은 서버 오류와 **다른 사건**이다 (다시 시도할 수 있어야 한다)', async () => {
  for (const 부르기 of [
    (API) => API.로그인('SYNK-042', 'pw123456'),
    (API) => API.첫등록({ 학생번호: 'SYNK-042', 뒷자리: '1234', 비밀번호: 'pw123456' }),
  ]) {
    const { API } = 세우기({ 응답들: [{ throw: true }] });
    const e = await 던진것(() => 부르기(API));
    assert.equal(e.code, 'NETWORK');
    assert.equal(e.retryable, true, '🔴 다시 시도할 수 있는 실패를 영구 실패로 말했다');
  }
});

test('🔴 앱은 `signUp` 을 부르지 않는다 (계정이 서는 통로는 first-login 하나뿐 · C0 §2-3)', () => {
  const 소스 = require('fs').readFileSync(SRC, 'utf8');
  assert.ok(!/\/auth\/v1\/signup|signUp\s*\(/.test(소스), '🔴 앱에서 계정을 만들려 한다');
});
