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
