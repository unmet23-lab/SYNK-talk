'use strict';

// Deno TypeScript 엔트리의 합성 실행. 앱 ESM 로더와 달리 실제 모듈·환경·네트워크를 열지 않는다.
// Babel은 Expo에 이미 포함되어 있어 package.json의 Node >=20에서도 같은 시험을 실행한다.
const babel = require('@babel/core');
const vm = require('node:vm');

function 세우기(소스, { 파일, 모듈, 환경 = {}, fetch, console }) {
  const { code } = babel.transformSync(소스, {
    filename: 파일,
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-typescript', '@babel/plugin-transform-modules-commonjs'],
  });
  let 핸들러;
  vm.runInNewContext(code, {
    exports: {},
    require: (이름) => {
      if (!Object.hasOwn(모듈, 이름)) throw new Error('합성 대역에 등록되지 않은 모듈');
      return 모듈[이름];
    },
    Deno: {
      env: { get: (key) => 환경[key] },
      serve: (handler) => {
        if (핸들러 || typeof handler !== 'function') throw new Error('합성 핸들러 등록 오류');
        핸들러 = handler;
      },
    },
    console, fetch, Request, Response, URL, Blob, FormData, Uint8Array, AbortSignal,
  }, { filename: 파일 });
  if (!핸들러) throw new Error('Deno.serve 핸들러가 없다');
  return 핸들러;
}

module.exports = { 세우기 };
