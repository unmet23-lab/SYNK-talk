// 앱 ESM 모듈을 테스트에서 **실제로 돌리는** 공용 통로 — `fetch` 만 가짜다.
//
// 왜 공용인가 (2026-08-09 실측 · 3번째라 통로를 만들었다)
//   `src/*.js` 는 ESM 인데 이 저장소의 테스트는 CJS 라, @babel/core(Expo 가 이미 들고 있다)로
//   바꿔 vm 에서 돌린다. 그 조립이 `과제API`·`교정API`·`사건통로` 세 곳에 각자 복사돼 있었고
//   **한 벌만 상대 import 를 재귀하지 않았다**: `과제API.test.js` 는 상대 경로를 그냥
//   `require()` 해서, 그 파일이 통로(`src/사건통로.js`)를 import 하기 시작한 날 **진짜 모듈**이
//   섞여 들어왔다. 그 모듈은 stub 이 아니라 실제 `process.env` 를 읽어 `CONFIG` 로 죽었고,
//   증상은 「테스트가 갑자기 서버 설정이 없다고 한다」였다. 사본이 갈라지는 전형이다.
//
// 쓰는 법:
//   const { 세우기 } = require('./lib/앱모듈세우기.js');
//   const 캐시 = new Map();
//   const 모듈 = 세우기(경로, 가짜fetch, { 캐시 });      // 같은 캐시 = 모듈 상태를 공유한다
//   const 인증 = 캐시.get(path.join(ROOT, 'src', '인증API.js'));
//
// ⚠ react-native 를 끌고 오는 모듈(`src/저장.js`)은 이 사슬에 못 들어온다 — node 가 그것을
//   못 연다. 통로를 파일로 가른 이유가 그것이고, 그 경계는 `src/사건통로.js` 머리말이 진다.
// 옛 통로(테스트가 직접 babel 을 부르는 것)는 `tests/스폰통로.test.js` 가 저장소를 훑어 금지한다.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const 기본환경 = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
};

/**
 * ESM 한 파일을 세운다 — 상대 경로 import 는 **같은 방식으로 재귀**한다(CJS 는 그냥 require).
 *
 * @param {string} 파일                    세울 모듈 경로
 * @param {Function} fetch가짜             그 사슬 전체가 쓸 fetch
 * @param {object} [옵션]
 * @param {Map<string,object>} [옵션.캐시]  모듈 상태를 공유할 캐시(안 주면 이 호출만의 것)
 * @param {object} [옵션.환경]              `process.env` 로 보일 값
 * @param {Map<string,string>} [옵션.바꾼소스] 그 경로만 이 소스로 세운다 — **탐지력 픽스처**용
 * @returns {object} 그 모듈의 exports
 */
function 세우기(파일, fetch가짜, 옵션 = {}) {
  const { 캐시 = new Map(), 환경 = 기본환경, 바꾼소스 } = 옵션;
  const abs = path.resolve(파일);
  if (캐시.has(abs)) return 캐시.get(abs);

  const 원문 = (바꾼소스 && 바꾼소스.get(abs)) || fs.readFileSync(abs, 'utf8');
  /* 🔴 지름길(그냥 require)은 **바꾼소스가 없는 호출에서만** 탄다 — 2026-08-11 실측.
   *   require 로 세운 CJS 모듈의 내부 require 는 Node 가 직접 해석해 이 함수의 재귀를
   *   안 지나므로, 사슬 어딘가의 바꾼소스(탐지력 픽스처)가 **조용히 무시된다** — 픽스처가
   *   실파일을 재면서 초록/적색이 뒤집히는데 증상이 없다(게임 lib CJS 전환이 드러냈다).
   *   바꾼소스가 있으면 CJS 도 vm 경로로 세워 require 가로채기를 유지한다(babel 은 CJS 를
   *   그대로 통과시킨다). */
  if (!바꾼소스 && !/^\s*(import|export)\s/m.test(원문)) {
    const m = require(abs); // CJS(`lib/*.js`)는 그대로 — 바꿀 것이 없다
    캐시.set(abs, m);
    return m;
  }

  const { code } = babel.transformSync(원문, {
    filename: abs,
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const module_ = { exports: {} };
  캐시.set(abs, module_.exports); // 순환 import 대비 — 먼저 자리를 잡아 둔다
  vm.runInNewContext(code, {
    module: module_,
    exports: module_.exports,
    require: (p) => (p.startsWith('.')
      ? 세우기(path.resolve(path.dirname(abs), p), fetch가짜, { 캐시, 환경, 바꾼소스 })
      : require(p)),
    process: { env: 환경 },
    fetch: fetch가짜,
    console,
    Promise,
    Error,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
  });
  // 🔑 자리를 잡아 둔 빈 객체가 아니라 **채워진 exports** 로 덮는다 — `export default` 처럼
  //   객체를 통째로 바꾸는 모듈이 있으면 앞의 자리와 갈라진다.
  캐시.set(abs, module_.exports);
  return module_.exports;
}

module.exports = { 세우기, 기본환경 };
