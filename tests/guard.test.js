'use strict';
/**
 * 커밋 가드 회귀.
 *
 * 원칙 2개 (SYNK 공용 지침 「신뢰성」):
 *  - 탐지 능력은 **픽스처**로 못박는다. 실저장소의 결함 개수를 세지 않는다.
 *  - **통과 목록을 차단 목록과 같은 무게로** 검사한다. 과잉 차단은 BYPASS 습관을 만든다.
 *
 * 픽스처의 가짜 토큰은 **조립**한다 — 소스에 실토큰처럼 생긴 리터럴을 두지 않는다.
 */

const test = require('node:test');
const assert = require('node:assert');
const { inspect } = require('../tools/guard.js');

const A = (n) => 'A1b2C3d4E5f6G7h8'.repeat(Math.ceil(n / 16)).slice(0, n);
const fakeJwt = () => 'eyJ' + A(20) + '.eyJ' + A(20) + '.' + A(20);

// ── 차단해야 하는 것 ──────────────────────────────────────────
const MUST_BLOCK = [
  { label: '.env', files: [{ path: '.env', text: 'X=1' }] },
  { label: 'apple 서명키', files: [{ path: 'certs/AuthKey.p8', text: 'x' }] },
  { label: 'android keystore', files: [{ path: 'android/release.keystore', text: 'x' }] },
  { label: '서비스 계정 json', files: [{ path: 'secrets/service-account-prod.json', text: '{}' }] },
  { label: '비밀번호 파일명', files: [{ path: 'docs/비밀번호모음.md', text: 'x' }] },
  /* 2026-08-06 규칙을 좁힌 뒤 **막는 쪽이 그대로인지**를 함께 못박는다 —
   * 좁힐 때 실제로 위험한 것까지 같이 풀리면 그게 이 변경의 사고다.
   * 발급된 코드 목록 파일 하나 = 전 학생 계정(L0 §4-1). */
  { label: '로그인 코드 목록(csv)', files: [{ path: 'docs/로그인코드목록.csv', text: 'a' }] },
  { label: '로그인 정보(txt)', files: [{ path: '로그인정보.txt', text: 'a' }] },
  { label: '로그인 백업(json)', files: [{ path: 'backup/로그인코드.json', text: '{}' }] },
  { label: 'Anthropic 키', files: [{ path: 'src/a.ts', text: 'const k = "sk-ant-' + A(24) + '"' }] },
  { label: 'OpenAI 키', files: [{ path: 'src/b.ts', text: 'key: "sk-' + A(40) + '"' }] },
  { label: 'GitHub 토큰', files: [{ path: 'ci.yml', text: 'token: gh' + 'p_' + A(36) }] },
  { label: 'Google API 키', files: [{ path: 'app.json', text: '"key":"AIza' + A(35) + '"' }] },
  { label: 'JWT', files: [{ path: 'src/c.ts', text: 'const t = "' + fakeJwt() + '"' }] },
  {
    label: 'supabase service_role',
    files: [{ path: 'src/d.ts', text: 'service_role: "' + fakeJwt() + '"' }],
  },
  {
    label: '개인키 블록',
    // 조립한다 — 리터럴로 두면 이 테스트 파일 자신이 가드에 걸린다(0일차 실측 1건).
    files: [{ path: 'k.txt', text: '-----BEGIN RSA ' + 'PRIVATE' + ' KEY-----\nabc\n' }],
  },
  { label: 'Expo 토큰', files: [{ path: '.ci', text: 'EXPO_TOKEN=' + A(24) }] },
  /* L0 §4-5 수용기준 ⑤. 값이 리터럴로 없어도 **이름 하나로** 샌다 — `EXPO_PUBLIC_` 은
   * 빌드가 번들에 인라인하므로 위의 「service_role + JWT」 규칙이 이것을 못 잡는다.
   * 이름은 조립한다(리터럴로 두면 이 테스트 파일 자신이 가드에 걸린다 — 위 개인키와 같은 이유). */
  {
    label: 'EXPO_PUBLIC service_role (app.json extra)',
    files: [{ path: 'app.json', text: '{"extra":{"EXPO_' + 'PUBLIC_SUPABASE_SERVICE_ROLE_KEY":"x"}}' }],
  },
  {
    label: 'EXPO_PUBLIC service_role (소스)',
    files: [{ path: 'src/db.ts', text: 'const k = process.env.EXPO_' + 'PUBLIC_SERVICE_ROLE_KEY' }],
  },
  {
    label: 'EXPO_PUBLIC 임의 비밀 (소스)',
    files: [{ path: 'lib/x.js', text: 'process.env.EXPO_' + 'PUBLIC_API_SECRET' }],
  },
  { label: '1MB 초과', files: [{ path: 'assets/big.mp3', bytes: 3 * 1024 * 1024 }] },
];

for (const c of MUST_BLOCK) {
  test(`차단: ${c.label}`, () => {
    const v = inspect(c.files);
    assert.ok(v.length > 0, `${c.label} 을 놓쳤다`);
  });
}

// ── 통과해야 하는 것 (거짓양성 검사) ──────────────────────────
const MUST_PASS = [
  { label: '.env.example', files: [{ path: '.env.example', text: 'SUPABASE_URL=\nSUPABASE_ANON_KEY=' }] },
  { label: '평범한 소스', files: [{ path: 'src/App.tsx', text: 'export default function App(){}' }] },
  /* 이름에 「로그인」이 든 **소스**는 통과해야 한다 — 2026-08-06 이 규칙이 소스 3건을 막아
   * 커밋이 안 됐다. 도메인 단어를 파일명에서 빼는 것은 발견가능성을 잃는 잘못된 처방이다. */
  { label: '로그인 소스(lib)', files: [{ path: 'lib/로그인코드.js', text: 'module.exports={}' }] },
  { label: '로그인 소스(tools)', files: [{ path: 'tools/로그인코드발급.js', text: 'x' }] },
  { label: '로그인 소스(test)', files: [{ path: 'tests/로그인코드.test.js', text: 'x' }] },
  { label: 'password 든 소스', files: [{ path: 'src/passwordField.tsx', text: 'export const F=()=>null' }] },
  {
    label: '키 이름만 있고 값이 없는 문서',
    files: [{ path: 'docs/설정.md', text: '`SUPABASE_SERVICE_ROLE_KEY` 는 .env 에 둔다' }],
  },
  /* EXPO_PUBLIC 규칙의 거짓양성 셋 — 이 셋을 막으면 규칙이 우회 습관을 만든다. */
  {
    /* 문서가 위험한 이름을 **설명**하는 것은 막지 않는다. 막으면 위험이 문서에서만 사라진다. */
    label: '위험을 설명하는 문서',
    files: [{ path: 'docs/보안.md', text: 'EXPO_' + 'PUBLIC_SERVICE_ROLE_KEY 는 절대 쓰지 않는다' }],
  },
  {
    /* anon 키는 **공개가 설계**다 — 이 접두사를 다는 것이 정상이다. */
    label: 'EXPO_PUBLIC anon 키',
    files: [{ path: 'lib/supabase.js', text: 'process.env.EXPO_' + 'PUBLIC_SUPABASE_ANON_KEY' }],
  },
  {
    /* 자기 처방 — 거부 메시지가 시키는 대로(접두사 떼고 서버로) 고치면 통과해야 한다. */
    label: '처방대로 고친 서버 코드',
    files: [{
      path: 'supabase/functions/ingest/index.ts',
      text: "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')",
    }],
  },
  {
    label: 'env를 코드에서 읽는 정상 패턴',
    files: [{ path: 'src/db.ts', text: 'const url = process.env.SUPABASE_URL' }],
  },
  { label: '작은 이미지', files: [{ path: 'assets/icon.png', bytes: 40 * 1024 }] },
  { label: 'sk- 로 시작하는 평범한 단어', files: [{ path: 'a.md', text: 'sk-경로는 skeleton 의 약자' }] },
  { label: '이진 파일(내용 미검사)', files: [{ path: 'assets/a.png', bytes: 1000 }] },
];

for (const c of MUST_PASS) {
  test(`통과: ${c.label}`, () => {
    const v = inspect(c.files);
    assert.deepStrictEqual(v, [], `${c.label} 에 거짓양성: ${JSON.stringify(v)}`);
  });
}

test('빈 입력은 통과', () => {
  assert.deepStrictEqual(inspect([]), []);
});

test('한 파일에 위반 2개면 2건 보고', () => {
  const v = inspect([{ path: '.env', text: 'K=sk-ant-' + A(24), bytes: 10 }]);
  assert.ok(v.length >= 2, `합산 보고 실패: ${JSON.stringify(v)}`);
});
