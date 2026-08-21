/* `lib/토큰.js` — 「누가 부르는가」의 정본.
 *
 * ■ 이 검사가 지키는 것
 *   판정이 **새는 방향은 언제나 「통과」다.** `sub` 검사가 빠지면 anon 키가 사람이 되고,
 *   `role` 검사가 헐거우면 아무나 배치를 돌린다 — 둘 다 증상이 없다(200 이 나온다).
 *   그래서 ①행동을 픽스처로 못박고 ②**사본을 금지**한다. 사본이 생기는 순간 이 파일의
 *   탐지력은 그 사본에 닿지 않고, 닿지 않는 검사는 통과와 미실행이 같은 모양이다.
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 실제로 쓰는 표기 — 실제 `supabase/functions` 아래 `index.ts` 를 전부 읽는다.
 *   ② 탐지력은 **픽스처 문자열**로 걸고, 실저장소에는 「지금 깨끗한가」만 건다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { 토큰주체, 서비스역할 } = require('../lib/토큰.js');

const 함수들 = path.resolve(__dirname, '..', 'supabase', 'functions');

/** base64url 로 JWT 흉내 — 서명 자리는 아무 값이나 된다(검증은 플랫폼 몫). */
const jwt = (클레임) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(클레임)}.sig`;
};
const 요청 = (권한) => ({ headers: { get: (k) => (k === 'Authorization' && 권한 != null ? 권한 : null) } });

test('사람은 sub 로 확정된다', () => {
  const uid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
  assert.equal(토큰주체(요청(`Bearer ${jwt({ sub: uid, role: 'authenticated' })}`)), uid);
  assert.equal(토큰주체(요청(`bearer ${jwt({ sub: uid })}`)), uid, '스킴 대소문자는 안 가린다');
});

test('🔴 anon 키는 사람이 아니다 — verify_jwt 는 그것도 통과시킨다', () => {
  assert.equal(토큰주체(요청(`Bearer ${jwt({ role: 'anon', iss: 'supabase' })}`)), null);
  assert.equal(토큰주체(요청(`Bearer ${jwt({ sub: '' })}`)), null, '빈 sub 도 사람이 아니다');
  assert.equal(토큰주체(요청(`Bearer ${jwt({ sub: 42 })}`)), null, 'sub 는 문자열이어야 한다');
});

test('망가진 입력에 던지지 않는다 — 던지면 400 이어야 할 것이 500 이 된다', () => {
  for (const 권한 of [null, '', 'Bearer', 'Bearer 어쩌고', 'Bearer a.b', 'Bearer a.b.c.d',
    'Basic xyz', `Bearer ${'x'.repeat(20)}.y.z`]) {
    assert.equal(토큰주체(요청(권한)), null, `${JSON.stringify(권한)} 에서 null 이어야 한다`);
    assert.equal(서비스역할(요청(권한)), false, `${JSON.stringify(권한)} 에서 false 여야 한다`);
  }
  assert.equal(토큰주체({}), null, '헤더 자체가 없어도 던지지 않는다');
});

test('base64url 의 -·_ 를 되돌린다 — 안 되돌리면 특정 학생만 401 이 된다', () => {
  /* `??~` 는 base64 에서 `+`·`/` 가 섞인 조각을 낳는다. 되돌림이 빠지면 atob 가 던지고,
   * 그 학생 uid 를 가진 토큰에서만 로그인이 조용히 깨진다. */
  const uid = 'a?~?b??~c';
  const 결과 = 토큰주체(요청(`Bearer ${jwt({ sub: uid })}`));
  assert.equal(결과, uid);
  assert.ok(jwt({ sub: uid }).split('.')[1].match(/[-_]/), '픽스처가 base64url 문자를 담아야 이 검사가 의미 있다');
});

/* 신형 시크릿 키 통로의 픽스처 — 값은 **이 파일이 만든다**(실키를 회귀에 끌어오지 않는다).
 * 🔑 `서비스역할` 은 런타임 env 를 읽는다. Node 회귀에서는 `process.env` 가 그 자리다. */
const 시크릿 = 'sb_secret_' + 'A'.repeat(31);
const 공개키 = 'sb_publishable_' + 'B'.repeat(31);
const env세우기 = (칸) => {
  const 이름들 = ['SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS'];
  const 옛 = {};
  for (const n of 이름들) { 옛[n] = process.env[n]; delete process.env[n]; }
  Object.assign(process.env, 칸);
  return () => { for (const n of 이름들) { if (옛[n] === undefined) delete process.env[n]; else process.env[n] = 옛[n]; } };
};

test('배치 호출자 ① — 레거시 JWT 는 role 로 가른다', () => {
  assert.equal(서비스역할(요청(`Bearer ${jwt({ role: 'service_role' })}`)), true);
  assert.equal(서비스역할(요청(`Bearer ${jwt({ role: 'anon' })}`)), false);
  assert.equal(서비스역할(요청(`Bearer ${jwt({ role: 'authenticated', sub: 'x' })}`)), false);
});

test('배치 호출자 ② — 신형 시크릿 키는 원문 일치로 가른다(클레임이 없다)', () => {
  const 되돌리기 = env세우기({ SUPABASE_SERVICE_ROLE_KEY: 시크릿 });
  try {
    assert.equal(서비스역할(요청(`Bearer ${시크릿}`)), true,
      '함수끼리 부르는 통로가 이것이다 — 막히면 배정 0인 날 구제가 조용히 안 돈다');
    assert.equal(서비스역할(요청(`Bearer sb_secret_${'A'.repeat(30)}`)), false, '길이가 다르면 통과 못 한다');
    assert.equal(서비스역할(요청(`Bearer sb_secret_${'A'.repeat(30)}Z`)), false, '한 글자만 달라도 통과 못 한다');
    assert.equal(서비스역할(요청('Bearer sb_secret_짧은새형식키')), false, '접두사만 맞는 아무 문자열은 못 지나간다');
  } finally { 되돌리기(); }
});

test('배치 호출자 ② — `SUPABASE_SECRET_KEYS` 사전에서도 읽는다(키 회전 대비)', () => {
  const 되돌리기 = env세우기({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: 시크릿 }) });
  try {
    assert.equal(서비스역할(요청(`Bearer ${시크릿}`)), true);
  } finally { 되돌리기(); }
});

test('🔴 배치 호출자 ② — **공개 키는 절대 통과 못 한다**(학생 앱 번들에 들어 있는 값이다)', () => {
  /* 게이트웨이는 등급을 안 가른다(2026-08-22 실측: 진짜 sb_publishable_ 도 함수까지 온다).
   * 여기서 안 가르면 배치 통로가 전교생에게 열리고, **새는 방향은 언제나 「통과」**다. */
  const 되돌리기 = env세우기({
    SUPABASE_ANON_KEY: 공개키,
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 공개키 }),
    SUPABASE_SERVICE_ROLE_KEY: 시크릿,
  });
  try {
    assert.equal(서비스역할(요청(`Bearer ${공개키}`)), false, '공개 키가 배치를 부르면 안 된다');
    assert.equal(서비스역할(요청(`Bearer ${시크릿}`)), true, '같은 판정에서 시크릿 키는 살아 있어야 한다');
  } finally { 되돌리기(); }
});

test('🔴 배치 호출자 ② — env 에 시크릿이 **하나도 없으면** 아무도 못 지나간다', () => {
  const 되돌리기 = env세우기({});
  try {
    assert.equal(서비스역할(요청(`Bearer ${시크릿}`)), false,
      '비교 대상이 없을 때 통과시키면 「미설정」이 「전원 통과」가 된다');
  } finally { 되돌리기(); }
});

test('🔴 공개 키가 SERVICE_ROLE 칸에 잘못 들어와도 통과시키지 않는다', () => {
  const 되돌리기 = env세우기({ SUPABASE_ANON_KEY: 공개키, SUPABASE_SERVICE_ROLE_KEY: 공개키 });
  try {
    assert.equal(서비스역할(요청(`Bearer ${공개키}`)), false);
  } finally { 되돌리기(); }
});

/* ── 사본 금지 ─────────────────────────────────────────────────────
 * 옛 통로를 테스트로 막는다(CLAUDE.md 신뢰성 「3번째 = 원인을 쓸 수 없게」). */

const 본체들 = () => fs.readdirSync(함수들)
  .map((d) => [d, path.join(함수들, d, 'index.ts')])
  .filter(([, p]) => fs.existsSync(p));

test('🔴 함수 안에 토큰 판정 사본이 없다 — 정본은 lib/토큰.js 하나다', () => {
  const 사본 = 본체들()
    .filter(([, p]) => /function\s+(토큰주체|서비스역할|호출자확인)\s*\(/.test(fs.readFileSync(p, 'utf8')))
    .map(([d]) => d);
  assert.deepEqual(사본, [], `사본이 생겼다: ${사본.join(', ')} — lib/토큰.js 를 동봉해 쓴다`);
});

test('탐지력 — 사본을 심으면 위 검사가 잡는다', () => {
  const 가짜 = 'function 토큰주체(req: Request): string | null { return null; }';
  assert.ok(/function\s+(토큰주체|서비스역할|호출자확인)\s*\(/.test(가짜),
    '판정 정규식이 사본을 못 잡는다 — 잡지 못하면 위 검사는 통과와 미실행이 같은 모양이다');
});

test('토큰을 쓰는 함수는 전부 동봉 표에 그것을 적었다', () => {
  for (const [이름, p] of 본체들()) {
    const src = fs.readFileSync(p, 'utf8');
    if (!/from\s+'\.\/토큰\.mjs'/.test(src)) continue;
    const 표 = JSON.parse(fs.readFileSync(path.join(함수들, 이름, '동봉.json'), 'utf8'));
    assert.equal(표['토큰.mjs'], 'lib/토큰.js',
      `${이름}: import 는 하는데 동봉 표에 없다 — 배포는 성공하고 첫 호출에서 죽는다`);
  }
});
