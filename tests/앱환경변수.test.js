'use strict';
/**
 * `eas.json` 의 앱 환경변수 회귀.
 *
 * 🔴 **왜 생겼나** — 이 값들이 EAS 대시보드에만 살던 동안 `docs/배포_경로.md` 는 스스로
 *   「⛔ 저장소 테스트로는 못 막는다 — 값이 EAS 쪽에 사니 repo 가 볼 수 없다(통과와 미실행이
 *   같은 모양)」고 적고 있었다. 실제로 값이 **없는 채로** 빌드가 성공했고, 설치도 됐고,
 *   앱은 로그인조차 못 하는 상태였다(설정 검사가 항상 참으로 증명돼 서버층이 죽은 코드로 제거).
 *   값을 저장소로 들여왔으니 이제 **그 자리를 기계가 지킨다.**
 *
 * 🔑 **왜 JWT 가 아니라 `sb_publishable_` 인가** — anon JWT 와 service_role JWT 는 정규식으로
 *   구분되지 않아 `tools/guard.js` 가 JWT 모양을 통째로 막는다(옳은 판단이다: 잘못 붙이면
 *   회수 불가능한 키가 번들로 나간다). Supabase 가 「공개해도 되는 키」로 따로 낸 형식을 쓰면
 *   가드를 약하게 만들지 않고도 값이 저장소에 살 수 있다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const EAS = path.join(__dirname, '..', 'eas.json');

/** 프로필별로 가리켜야 하는 프로젝트 — 여기가 어긋나면 시험 빌드가 운영 데이터에 쓴다.
 * 🔑 ref 리터럴은 여기 안 적는다 — `lib/자격증명.js` 가 정본이다(같은 판정이 두 곳에 있으면
 *   갈라지고, 갈라지는 방향은 「통과」다). 그 파일의 과녁 게이트가 같은 값으로 운영을 막는다. */
const { 운영REF, 리허설REF } = require('../lib/자격증명.js');
const 배치 = { development: 리허설REF, preview: 리허설REF, production: 운영REF };

/**
 * 순수 판정 — 부르는 쪽이 파일을 읽는다(픽스처로 탐지력을 못박기 위해).
 * @returns {string[]} 위반 목록. 빈 배열이면 통과.
 */
function 검사(eas) {
  const 위반 = [];
  const 빌드 = (eas && eas.build) || {};
  for (const [프로필, 기대REF] of Object.entries(배치)) {
    const env = (빌드[프로필] || {}).env;
    if (!env) { 위반.push(`${프로필}: env 없음`); continue; }
    const url = env.EXPO_PUBLIC_SUPABASE_URL || '';
    const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url) 위반.push(`${프로필}: URL 없음`);
    if (!key) 위반.push(`${프로필}: 키 없음`);
    if (url && !url.includes(기대REF)) 위반.push(`${프로필}: ${기대REF} 를 가리켜야 하는데 ${url}`);
    if (key && key.includes(기대REF) === false && key.startsWith('sb_publishable_') === false) {
      위반.push(`${프로필}: 키가 publishable 형식이 아니다`);
    }
  }
  /* 파일 전체에서 **비밀이 될 수 있는 모양**을 막는다 — eas.json 은 git 에 산다.
   * JWT 형태(anon/service_role 구분 불가) · sb_secret_ · service_role 리터럴. */
  const 원문 = JSON.stringify(eas);
  if (/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./.test(원문)) 위반.push('JWT 모양이 들어 있다');
  if (/sb_secret_/.test(원문)) 위반.push('sb_secret_ 키가 들어 있다');
  if (/service_role/.test(원문)) 위반.push('service_role 이 들어 있다');
  return 위반;
}

// ── 실저장소: 거짓양성만 본다(탐지력은 아래 픽스처가 진다) ──
test('eas.json — 세 프로필이 각자 맞는 프로젝트를 가리키고, 비밀 모양이 없다', () => {
  const eas = JSON.parse(fs.readFileSync(EAS, 'utf8'));
  assert.deepEqual(검사(eas), [], '실저장소 eas.json 위반');
});

// ── 픽스처: 깨진 모양을 실제로 잡는가 ──
const 정상 = () => ({
  build: {
    development: { env: { EXPO_PUBLIC_SUPABASE_URL: `https://${리허설REF}.supabase.co`, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_a' } },
    preview: { env: { EXPO_PUBLIC_SUPABASE_URL: `https://${리허설REF}.supabase.co`, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_b' } },
    production: { env: { EXPO_PUBLIC_SUPABASE_URL: `https://${운영REF}.supabase.co`, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_c' } },
  },
});

test('탐지력 — 값이 없거나, 프로필이 엉뚱한 프로젝트를 가리키거나, 비밀 모양이면 잡는다', () => {
  assert.deepEqual(검사(정상()), [], '픽스처 기준선이 이미 빨갛다 — 시험 자체가 틀렸다');

  const 없음 = 정상(); delete 없음.build.preview.env;
  assert.ok(검사(없음).length, 'env 통째 부재를 못 잡았다 — 이게 실제로 일어난 사고다');

  const 빈값 = 정상(); 빈값.build.production.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';
  assert.ok(검사(빈값).length, '빈 문자열을 못 잡았다 — 빈 값은 「설정됨」처럼 보인다');

  // 🔴 가장 비싼 실수: 시험 빌드가 운영을 가리킨다(학생 실데이터에 테스트가 쓴다).
  const 뒤바뀜 = 정상(); 뒤바뀜.build.preview.env.EXPO_PUBLIC_SUPABASE_URL = `https://${운영REF}.supabase.co`;
  assert.ok(검사(뒤바뀜).length, 'preview 가 운영을 가리키는데 통과했다');

  /* 🔑 JWT 픽스처는 **조립한다** — 리터럴로 두면 `tools/guard.js` 가 이 파일 자체를 막는다
   *   (저장소 관례: 「이 목록의 픽스처는 테스트 코드에서 조립한다」). 가드를 끄는 대신 관례를 따른다. */
  const jwt = 정상();
  const 머리 = 'ey' + 'J' + 'hbGciOiJIUzI1NiJ9';
  jwt.build.production.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = [머리, 머리, 'zzzzzzzzzz'].join('.');
  assert.ok(검사(jwt).length, 'JWT 모양을 못 잡았다 — anon 과 service_role 이 같은 모양이다');

  const secret = 정상(); secret.build.production.env.SUPA = 'sb_secret_xxxx';
  assert.ok(검사(secret).length, 'sb_secret_ 을 못 잡았다');
});

/* ══════════════════════════════════════════════════════════════════════════════
 * ② 환경변수 **이름** — 셸을 건너는 자리는 ASCII 여야 한다 (F501 · 2026-08-17)
 *
 * 🔴 왜 회귀가 필요한가 — 이 규칙은 이미 있었다. `lib/자격증명.js` 가 2026-08-06 에
 *   「이름은 ASCII 여야 한다 · `SUPABASE_TOKEN_만료` 로 썼다가 깨졌다」고 못박아 뒀다.
 *   그런데 **산문이라 안 지켜졌다**: 08-15 관측층이 `MAESTRO_학생번호`·`MAESTRO_비밀번호`
 *   ·`EXPO_PUBLIC_합성밟기` 로 같은 자리를 다시 밟았고, 저장소는 전부 초록이었다.
 *   두 번째 = 실수가 아니라 시스템 결함(CLAUDE.md 신뢰성) → 문장을 여기서 기계로 만든다.
 *
 * 🔑 재는 것은 하나뿐이다 — **「셸이 이 이름을 세울 수 있나」**(POSIX 식별자).
 *   실측 2026-08-17: `export MAESTRO_학생번호=900` → bash exit 1 `not a valid identifier`.
 *   대문자 관례를 재지 않는다 — `ComSpec`·`OneDrive` 는 OS 가 그렇게 쓰고, 넓히면 거짓양성이
 *   진짜 위반을 덮는다(첫 측정판이 정확히 그랬다: 537종 중 거의 전부가 거짓양성이었다).
 *
 * 🚫 안 재는 것(정직하게):
 *   · Maestro 흐름 **본문**의 `${학생번호}` — 그건 흐름이 자기 머리에서 치환하는 값이라
 *     OS 를 안 건넌다. 머리(`env:`)만 본다.
 *   · `contents/` — 문서를 통째로 담은 문자열 blob 이라 산문 속 낱말이 이름처럼 보인다.
 *   · 형제 저장소(as) — 같은 병이 24종 있다(2026-08-17 실측). 거기 규칙은 거기가 진다.
 * ══════════════════════════════════════════════════════════════════════════════ */
const { 셸이세울수있나 } = require('../lib/자격증명.js');
const { 코드만 } = require('./lib/소스검사.js');

const ROOT = path.join(__dirname, '..');

/** 순수 판정 — 부르는 쪽이 파일을 읽는다(픽스처로 탐지력을 못박기 위해). */
function 이름위반(자리들) {
  return 자리들.filter(({ 이름 }) => !셸이세울수있나(이름)).map(({ 이름, 어디 }) => `${어디}: ${이름}`);
}

/** ㉠ Maestro 흐름 **머리** — `env:` 는 밖에서 받는 값이라 셸을 건넌다. */
function 흐름머리이름(원문, 어디) {
  const 머리 = 원문.split(/^---\s*$/m)[0] || '';
  return [...머리.matchAll(/\$\{([^}]+)\}/g)].map((m) => ({ 이름: m[1].trim(), 어디 }));
}

/** ㉡ EAS 빌드 env 키 — 값은 **리눅스 빌드 워커**의 환경변수로 들어간다. */
function EAS이름(eas, 어디 = 'eas.json') {
  const out = [];
  for (const [프로필, 설정] of Object.entries((eas && eas.build) || {})) {
    for (const 이름 of Object.keys((설정 && 설정.env) || {})) out.push({ 이름, 어디: `${어디} ▸ ${프로필}` });
  }
  return out;
}

/** ㉢ 소스가 부르는 이름 — `process.env.X` 와, 손잡이를 상수로 뺀 자리(`'MAESTRO_…'`). */
function 소스이름(원문, 어디) {
  const 코드 = 코드만(원문);
  const out = [];
  for (const m of 코드.matchAll(/process\.env\.([A-Za-z0-9_ㄱ-힣]+)/g)) out.push({ 이름: m[1], 어디 });
  for (const m of 코드.matchAll(/process\.env\[\s*['"`]([^'"`]+)['"`]\s*\]/g)) out.push({ 이름: m[1], 어디 });
  for (const m of 코드.matchAll(/['"`]((?:MAESTRO|EXPO_PUBLIC|SUPABASE|SYNK)_[A-Za-z0-9_ㄱ-힣]+)['"`]/g)) {
    out.push({ 이름: m[1], 어디 });
  }
  return out;
}

function js파일들(뿌리) {
  const out = [];
  const 훑기 = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) 훑기(p);
      else if (/\.(js|ts)$/.test(e.name)) out.push(p);
    }
  };
  if (fs.existsSync(뿌리)) 훑기(뿌리);
  return out;
}

// ── 실저장소: 거짓양성만 본다(탐지력은 아래 픽스처가 진다) ──
test('환경변수 이름 — 셸을 건너는 자리가 전부 ASCII 다 (F501)', () => {
  const 자리 = [];

  const 흐름칸 = path.join(ROOT, '.maestro');
  const 흐름들 = fs.existsSync(흐름칸) ? fs.readdirSync(흐름칸).filter((f) => f.endsWith('.yaml')) : [];
  for (const f of 흐름들) {
    자리.push(...흐름머리이름(fs.readFileSync(path.join(흐름칸, f), 'utf8'), `.maestro/${f}`));
  }
  자리.push(...EAS이름(JSON.parse(fs.readFileSync(EAS, 'utf8'))));
  for (const 뿌리 of ['lib', 'src', 'tools', 'tests', 'supabase']) {
    for (const p of js파일들(path.join(ROOT, 뿌리))) {
      자리.push(...소스이름(fs.readFileSync(p, 'utf8'), path.relative(ROOT, p).replace(/\\/g, '/')));
    }
  }

  /* 🔑 분모를 먼저 말한다 — 「0 위반」과 「아무것도 안 훑었다」는 같은 초록이다(F207).
   *   흐름 파일이 통째로 사라져도 이 시험은 조용히 통과할 수 있어서, 그 자리를 막는다. */
  assert.ok(흐름들.length >= 3, `Maestro 흐름을 ${흐름들.length}벌만 봤다 — 흐름이 사라졌거나 경로가 틀렸다`);
  assert.ok(자리.length >= 20, `환경변수 자리를 ${자리.length}곳만 훑었다 — 스캐너가 눈이 멀었다`);

  assert.deepEqual(이름위반(자리), [], '셸이 못 세우는 환경변수 이름이 있다(bash: not a valid identifier)');
});

// ── 픽스처: 깨진 모양을 실제로 잡는가 ──
test('탐지력 — 비ASCII 이름을 자리마다 잡는다 (F501 원문 그대로 되넣어 본다)', () => {
  /* 🔑 픽스처의 «나쁜 이름»은 **조립한다** — 리터럴로 두면 위 실저장소 시험이 이 파일을 읽어
   *   자기 자신을 위반으로 잡는다(이 파일도 `tests/` 안이다). JWT 픽스처가 쓰는 관례 그대로다. */
  const 나쁜학생 = 'MAESTRO_' + '학생번호';
  const 나쁜태그 = 'EXPO_PUBLIC_' + '합성밟기';

  assert.deepEqual(이름위반([{ 이름: 'MAESTRO_STUDENT_CODE', 어디: 'x' }]), [], '기준선이 이미 빨갛다');
  assert.deepEqual(이름위반([{ 이름: 'ComSpec', 어디: 'x' }, { 이름: 'OneDrive', 어디: 'x' }]), [],
    'OS 가 실제로 쓰는 혼합 대소문자 이름을 위반으로 셌다 — 그러면 진짜 위반이 소음에 묻힌다');

  const 흐름 = `appId: lab.synk.talk\nenv:\n  학생번호: \${${나쁜학생}}\n---\n- tapOn:\n    id: "\${학생번호}"\n`;
  assert.deepEqual(이름위반(흐름머리이름(흐름, 'f')), [`f: ${나쁜학생}`], '흐름 머리의 비ASCII 이름을 못 잡았다');
  assert.deepEqual(이름위반(흐름머리이름(흐름.replace(나쁜학생, 'MAESTRO_STUDENT_CODE'), 'f')), [],
    '흐름 **본문**의 `${학생번호}` 를 위반으로 셌다 — 그건 Maestro 가 자기 안에서 치환한다');

  const eas = { build: { preview: { env: { [나쁜태그]: '1' } } } };
  assert.deepEqual(이름위반(EAS이름(eas)), [`eas.json ▸ preview: ${나쁜태그}`], 'EAS env 키를 못 잡았다');

  assert.deepEqual(이름위반(소스이름(`const 합성 = process.env.${나쁜태그} === '1';`, 's.js')),
    [`s.js: ${나쁜태그}`], 'process.env.X 를 못 잡았다');
  assert.deepEqual(이름위반(소스이름(`const 칸 = '${나쁜학생}';`, 's.js')), [`s.js: ${나쁜학생}`],
    '상수로 빼낸 손잡이를 못 잡았다 — 이름을 변수 뒤에 숨기면 이 회귀가 눈이 먼다');
  assert.deepEqual(이름위반(소스이름(`/* 옛날엔 process.env.${나쁜태그} 였다 */\nconst a = 1;`, 's.js')), [],
    '주석 속 이력을 위반으로 셌다 — 그러면 실패를 지우려고 역사를 지우게 된다');
});
