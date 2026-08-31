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
const { 세우기: 앱모듈 } = require('./lib/앱모듈세우기.js');

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
  // 조립은 공용 통로가 진다(`tests/lib/앱모듈세우기.js`) — 사본이 넷이었고 그 중 하나가
  // 상대 import 재귀를 빠뜨려 진짜 모듈을 끌어들였다(그 사연은 통로 파일 머리말).
  const API = 앱모듈(SRC, fetch, {
    환경: { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: anon },
  });
  return { API, 부른것 };
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
  ]) {
    const { API } = 세우기({ 응답들: [r] });
    const e = await 던진것(() => API.로그인('SYNK-042', 'pw123456'));
    접힌것.push(`${e.code}|${e.message}`);
    assert.ok(!/Invalid|not found|confirmed/i.test(e.message),
      `🔴 GoTrue 원문이 그대로 샜다: ${e.message}`);
  }
  assert.equal(new Set(접힌것).size, 1, `🔴 실패 사유마다 답이 갈린다 — 학생번호의 존재가 샌다:\n  ${[...new Set(접힌것)].join('\n  ')}`);

  /* 08-31 감사 G1-2 — 429·5xx 는 위 집합에서 뺐다: 전역 장애·전역 과부하는 «특정 계정»의 존재를
     안 흘린다(누구에게나 같은 응답). 반대로 「맞지 않습니다」로 접으면 서버 사정이 학생 비난이 된다.
     원문 누설 금지는 이 갈래에도 그대로 잰다. */
  for (const r of [
    { ok: false, status: 429, 몸: { msg: 'Too many requests' } },
    { ok: false, status: 503, 몸: { msg: 'Service unavailable' } },
  ]) {
    const { API } = 세우기({ 응답들: [r] });
    const e = await 던진것(() => API.로그인('SYNK-042', 'pw123456'));
    assert.equal(e.code, 'SERVER_ERROR');
    assert.ok(!/requests|unavailable/i.test(e.message), `🔴 GoTrue 원문이 그대로 샜다: ${e.message}`);
  }
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
  /* 🔑 학생번호가 세션에 실린다 — 막힘 안내(F176 ①)가 「선생님께 이 번호를 보여 주세요」로
   *   끝나는데 토큰에는 합성 이메일뿐이라, 여기서 안 실으면 화면이 그 번호를 모른다.
   *   🔴 학생이 친 그대로가 아니라 **발급기 표기형**이어야 한다 — 선생님이 명단에서 찾을 값이다. */
  assert.deepEqual(세션, {
    access_token: 'A', refresh_token: 'R', user: { id: 'u1' }, 학생번호: 'SYNK-042',
  });
});

// ── 첫 등록 ────────────────────────────────────────────────
test('🔴 첫등록 — 본문 키가 계약 그대로고, `learner_id` 를 싣지 않는다 (실으면 서버가 400)', async () => {
  const { API, 부른것 } = 세우기({ 응답들: [{ 몸: { ok: true } }, { 몸: { access_token: 'A' } }] });
  await API.첫등록({
    학생번호: 'SYNK-042', 뒷자리: '1234', 비밀번호: 'pw123456', 복구이메일: '', 복구전화: '',
    가입답: { home_aimag: 'khovd', gender: 'female', goal_track: 'work' },
  });

  assert.equal(부른것[0].url, `${URL_}/functions/v1/auth/first-login`);
  assert.deepEqual(Object.keys(부른것[0].본문).sort(),
    ['gender', 'goal_track', 'home_aimag', 'password', 'phone_last4',
      'recovery_email', 'recovery_phone', 'student_code'],
    '🔴 본문 키가 C0 §4-4 와 갈라졌다 — 갈라지면 전 학생이 못 들어온다');
  assert.equal(부른것[0].본문.recovery_email, null, '빈 문자열을 그대로 보냈다(계약은 null)');
  /* 🔴 가입 1회 문항은 **이 요청에만** 실린다 — 여기서 새면 그 학생의 세 칸이 영구 null 이고
   *   되물어도 못 채운다(L0 §704·§850). 키만 세는 위 검사는 값이 `undefined` 여도 통과한다. */
  assert.equal(부른것[0].본문.home_aimag, 'khovd');
  assert.equal(부른것[0].본문.gender, 'female');
  assert.equal(부른것[0].본문.goal_track, 'work');
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
  const e = await 던진것(() => API.비밀번호변경({ 학생번호: 'SYNK-042', 현재비밀번호: '틀림', 새비밀번호: 'new123456' }));
  assert.equal(e.code, 'LOGIN_FAILED');
  assert.equal(부른것.length, 1, '🔴 현재 비밀번호가 틀렸는데 비밀번호를 바꾸러 갔다');
  assert.ok(!부른것.some((c) => c.method === 'PUT'), '🔴 PUT 이 나갔다');
});

test('🔴 비밀번호 변경 — PUT 을 **방금 확인한 세션**으로 친다 (옛 토큰으로 치면 그 세션이 시체로 남는다)', async () => {
  /* 리허설 실측 2026-08-10(전층감사 §2-6): GoTrue 는 비밀번호가 바뀌면 **그 PUT 을 친 세션
   * 하나만** 남기고 나머지를 전부 죽인다(죽은 쪽 = `refresh_token_not_found` · 403).
   * 그래서 화면이 쥔 옛 토큰으로 치면, 현재 비밀번호를 확인하려고 **방금 만든** 세션이 죽는데
   * 하필 그것이 모듈 기억(`최근세션`)에 들어앉는다 — 다음 401 에서 `토큰되살리기` 가 「기억이
   * 더 새것」이라며 그 시체를 꺼내 주고 갱신도 그 시체로 시도한다. 세 층 어디도 안 빨개지고
   * 증상은 「바꾸고 조금 있다 풀리는데 앱을 껐다 켜면 된다」뿐이다. */
  const { API, 부른것 } = 세우기({
    응답들: [{ 몸: { access_token: '확인해서받은것', refresh_token: 'R확인해서받은것' } }, { 몸: {} }],
  });
  const 세션 = await API.비밀번호변경({ 학생번호: 'SYNK-042', 현재비밀번호: 'old123456', 새비밀번호: 'new123456' });

  assert.equal(부른것[1].method, 'PUT');
  assert.equal(부른것[1].url, `${URL_}/auth/v1/user`);
  assert.equal(부른것[1].headers.Authorization, 'Bearer 확인해서받은것',
    '🔴 확인 로그인이 준 토큰이 아닌 것으로 PUT 했다 — 살아남는 세션과 모듈 기억이 갈린다');
  assert.equal(부른것[1].본문.password, 'new123456');

  /* 🔴 살아남은 세션을 **돌려줘야** 화면이 앱 state·키체인을 그것으로 세운다. 안 돌려주면
   *   세 층이 방금 죽은 토큰을 든 채로 남는다(그게 「세션 삼분」의 나머지 절반이다). */
  assert.equal(세션 && 세션.access_token, '확인해서받은것', '🔴 살아남은 세션을 안 돌려줬다');
  assert.equal(세션.refresh_token, 'R확인해서받은것',
    '🔴 refresh_token 이 빠지면 키체인이 죽은 옛 것을 그대로 든다');
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
  assert.deepEqual(r, { 임시번호: '482913', 유효분: 30, 학생번호: 'SYNK-042', 잠금해제: false });
});

test('🔴 초기화 — 아직 계정이 없는 학생은 **잠금 해제**로 돌아온다 (임시번호 자리가 비어야 한다 · ②-19)', async () => {
  const { API } = 세우기({
    응답들: [{ 몸: { ok: true, student_code: 'SYNK-042', unlocked: true } }],
  });
  const r = await API.초기화요청({ 학생번호: 'SYNK-042', 토큰: 'DIRECTOR' });
  assert.equal(r.잠금해제, true);
  /* 🔴 `undefined` 가 아니라 `null` 이다 — 화면이 `결과.임시번호` 를 그대로 그리면
   *   `undefined` 는 빈칸으로 보이고 원장이 **없는 번호를 학생에게 불러 준다**.
   * 🔴 `strictEqual` 이어야 한다: `assert.equal` 은 `==` 라 `undefined == null` 이 참이고,
   *   그래서 「`?? null` 을 지운다」는 변이를 **초록으로 통과시켰다**(변이 시험이 잡았다). */
  assert.strictEqual(r.임시번호, null, '🔴 없는 임시번호를 값처럼 넘겼다');
  assert.strictEqual(r.유효분, null);
});

test('🔴 초기화 화면 — 두 결과를 **갈라 그린다** (한 갈래로 그리면 잠금 해제에 빈 번호가 뜬다)', () => {
  const 화면 = require('fs').readFileSync(path.join(__dirname, '..', 'src', '원장초기화.js'), 'utf8');
  assert.ok(/결과\.잠금해제\s*\?/.test(화면), '🔴 화면이 잠금 해제 갈래를 안 본다');
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

// ── 서버 쪽 초기화(`functions/auth`) — 여기 보증은 **순서**와 **범위**라 Deno 를 안 띄우고
//    소스에서 잰다. 진짜 판정은 `tools/인증왕복시험.js`(라이브)가 하고, 이 둘은 CI 가 볼 수 있는
//    최소한의 눈이다 — 리허설 자격증명이 없는 CI 에서 그 왕복시험은 아예 안 돈다.
const { 코드만 } = require('./lib/소스검사.js');
const 초기화본문 = () => {
  const 전체 = require('fs').readFileSync(
    path.join(__dirname, '..', 'supabase', 'functions', 'auth', 'index.ts'), 'utf8');
  const 시작 = 전체.indexOf('async function 초기화(');
  const 끝 = 전체.indexOf('async function 임시로그인(');
  assert.ok(시작 > 0 && 끝 > 시작, '초기화 함수를 못 찾았다 — 이 검사가 빈 문자열을 통과시키면 안 된다');
  /* 🔴 주석을 **먼저 지운다.** 안 지우면 「이 조건을 쓰지 않는다」고 적은 주석이 그 조건으로 읽혀
   *   검사가 자기 설명에 걸린다(첫 판이 실제로 그렇게 빨개졌다). 길이는 안 맞춰도 된다 —
   *   아래 둘은 순서와 존재만 본다.
   *   [2026-08-13 · F401] 사본을 걷고 공용 통로로 — 여기 것만 `^[ \t]*//` 라 줄머리만 지웠다. */
  return 코드만(전체.slice(시작, 끝));
};

test('🔴 초기화 — GoTrue 를 **먼저** 갈고 DB 를 나중에 쓴다 (②-18 · 순서가 곧 반쯤 실패한 상태다)', () => {
  const 본문 = 초기화본문();
  const 갈기 = 본문.indexOf('비밀번호갈기(대상.auth_user_id');
  const 디비 = 본문.indexOf('temp_password_hash = extensions.crypt');
  assert.ok(갈기 > 0 && 디비 > 0, '두 지점을 못 찾았다');
  assert.ok(갈기 < 디비,
    '🔴 DB 를 먼저 쓰면 GoTrue 가 실패한 날 **감사표엔 「초기화했다」가 남고 옛 비밀번호는 산다**');
});

test('🔴 초기화 — 잠긴 학생(`auth_user_id is null`)을 조회에서 거르지 않는다 (②-19 · 출구)', () => {
  assert.ok(!/auth_user_id is not null/.test(초기화본문()),
    '🔴 이 조건이 돌아오면 첫 등록에 잠긴 학생만 정확히 빠져나가 해제 통로가 다시 없어진다');
});

test('🔴 앱은 `signUp` 을 부르지 않는다 (계정이 서는 통로는 first-login 하나뿐 · C0 §2-3)', () => {
  /* 🔴 주석을 지우고 잰다(이 파일은 :223 에서 이미 통로를 든다) — `signUp` 금지를 설명하는
   *   주석 한 줄이 그대로 위반으로 잡힌다. 계정 통로가 하나뿐이라는 규칙은 자주 설명된다. */
  const 소스 = 코드만(require('fs').readFileSync(SRC, 'utf8'));
  assert.ok(!/\/auth\/v1\/signup|signUp\s*\(/.test(소스), '🔴 앱에서 계정을 만들려 한다');
});

// ── 세션 갱신 (앱을 껐다 켜도 로그인이 유지되는 자리) ──────────────
test('갱신 — refresh_token 으로 부르고, 토큰에 없는 학생번호는 저장해 둔 값을 그대로 싣는다', async () => {
  const { API, 부른것 } = 세우기({
    응답들: [{ 몸: { access_token: 'new-a', refresh_token: 'new-r', user: { id: 'u1' } } }],
  });
  const s = await API.갱신('old-r', 'S-0007');
  assert.match(부른것[0].url, /grant_type=refresh_token/);
  assert.deepEqual(부른것[0].본문, { refresh_token: 'old-r' });
  assert.equal(s.access_token, 'new-a');
  // 🔑 회전한 새 refresh_token 을 돌려줘야 호출부가 덮어쓴다 — 옛것을 남기면 다음 실행이 실패한다
  assert.equal(s.refresh_token, 'new-r');
  assert.equal(s.학생번호, 'S-0007', '🔴 토큰에는 합성 이메일뿐이라 이 자리가 유일한 출처다');
});

test('🔴 갱신 실패는 **네트워크와 만료를 가른다** — 비행기 모드에서 세션을 지우면 자격을 잃는다', async () => {
  const 끊김 = await 던진것(() => 세우기({ 응답들: [{ throw: true }] }).API.갱신('r', 'S-1'));
  assert.equal(끊김.code, 'NETWORK', '🔴 네트워크 실패가 만료로 읽히면 호출부가 저장된 세션을 지운다');
  assert.equal(끊김.retryable, true);

  const 만료 = await 던진것(() => 세우기({ 응답들: [{ ok: false, status: 401, 몸: {} }] }).API.갱신('r', 'S-1'));
  assert.equal(만료.code, 'REFRESH_FAILED');
  assert.equal(만료.retryable, false, '🔴 되풀이해도 안 되는 것을 재시도로 두면 무한 대기가 된다');
});

test('🔴 200 인데 access_token 이 없으면 성공으로 치지 않는다 (빈 세션이 서면 뒤의 쓰기가 전부 401)', async () => {
  const e = await 던진것(() => 세우기({ 응답들: [{ 몸: {} }] }).API.갱신('r', 'S-1'));
  assert.equal(e.code, 'REFRESH_FAILED');
});

/* ─── 08-31 감사 G1-1·G1-2 — 서버 사정과 학생 탓을 가른다 ─────────────────── */

test('🔴 갱신의 429·5xx 는 만료가 아니다 — SERVER_ERROR·retryable:true (감사 G1-1: 개원날 아침 GoTrue 가 429 를 뱉으면, 만료로 접는 순간 걸린 학생들의 저장 세션이 영구 삭제된다)', async () => {
  const 과부하 = await 던진것(() => 세우기({ 응답들: [{ ok: false, status: 429, 몸: {} }] }).API.갱신('r', 'S-1'));
  assert.equal(과부하.code, 'SERVER_ERROR');
  assert.equal(과부하.retryable, true, 'retryable:false 면 App 복원이 키체인을 지운다 — 서버는 3초 뒤 멀쩡했다');

  const 장애 = await 던진것(() => 세우기({ 응답들: [{ ok: false, status: 503, 몸: {} }] }).API.갱신('r', 'S-1'));
  assert.equal(장애.code, 'SERVER_ERROR');
  assert.equal(장애.retryable, true);

  const 만료 = await 던진것(() => 세우기({ 응답들: [{ ok: false, status: 400, 몸: {} }] }).API.갱신('r', 'S-1'));
  assert.equal(만료.code, 'REFRESH_FAILED', '진짜 만료(400/401/403/404)는 그대로 접는다 — 죽은 토큰을 남기면 호출마다 갱신을 한 번씩 더 산다');
});

test('🔴 로그인의 429·5xx 는 「비밀번호가 맞지 않습니다」가 아니다 — 앱이 학생에게 하는 거짓 비난 금지 (감사 G1-2)', async () => {
  const e = await 던진것(() => 세우기({ 응답들: [{ ok: false, status: 503, 몸: {} }] }).API.로그인('SYNK-001', 'pw'));
  assert.equal(e.code, 'SERVER_ERROR');
  assert.equal(e.retryable, true, '「잠시 뒤 다시」를 내야 학생이 멀쩡한 비밀번호를 의심하다 초기화 줄에 서지 않는다');

  const 진짜 = await 던진것(() => 세우기({ 응답들: [{ ok: false, status: 400, 몸: {} }] }).API.로그인('SYNK-001', 'pw'));
  assert.equal(진짜.code, 'LOGIN_FAILED', '400/401 은 그대로 한 문장으로 접는다 — 존재 누설 방지는 이 갈래에서만 유효한 논리다');
  assert.equal(진짜.retryable, false);
});
