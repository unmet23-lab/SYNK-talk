'use strict';
/**
 * 앱 소스에서 **선언된 적 없는 이름을 참조하는 자리**를 잡는다.
 *
 * 🔴 왜 있나 (2026-08-09 유호님 폰 실측 · 관통 첫 관문)
 *   `src/말하기화면.js` 가 `useState(오늘)` 을 부르는데 `오늘` 은 어디에도 없었다
 *   (`몽골날짜()` 로 갈아끼우던 작업에서 이 한 줄만 남았다). 증상은 실기기에서
 *   **"Property '오늘' doesn't exist"** — 로그인까지 간 학생이 첫 화면에서 튕긴다.
 *   저장소의 550 테스트가 전부 초록이었다: 구문 검사(`node --check`)는 문법만 보고,
 *   나머지는 순수 함수만 부르지 **화면을 그리지 않는다.** 번들링도 못 잡는다 —
 *   Metro 는 모듈 해석만 하고 미정의 참조는 런타임까지 살아 있다.
 *
 * 🔑 스코프를 정밀하게 따지지 않는다 — **파일 전체의 선언 집합**과 대조한다.
 *   다른 함수에 선언된 같은 이름을 인정해 주므로 놓치는 쪽으로 기운다(거짓양성 0 우선).
 *   그래도 「어디에도 없는 이름」은 정확히 잡히고, 그게 실제로 난 사고다.
 *
 * 🚫 린터를 새로 들이지 않는다 — `@babel/parser` 는 metro 가 이미 깔아 둔 것이라
 *   의존성이 0 이고, JSX 를 그대로 읽는다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const ROOT = path.resolve(__dirname, '..');

/** 검사 대상 — 앱이 **화면을 그릴 때 지나는** 파일들. */
function 대상들() {
  const 목록 = [];
  for (const 자리 of ['App.js', 'index.js']) {
    const p = path.join(ROOT, 자리);
    if (fs.existsSync(p)) 목록.push(p);
  }
  for (const dir of ['src', 'lib', 'contents']) {
    const p = path.join(ROOT, dir);
    if (!fs.existsSync(p)) continue;
    for (const f of fs.readdirSync(p)) {
      if (f.endsWith('.js') && !f.endsWith('.test.js')) 목록.push(path.join(p, f));
    }
  }
  return 목록;
}

/* 런타임이 늘 쥐고 있는 이름들. 여기 없는 전역을 새로 쓰면 이 목록에 적어야 하는데,
 * 그 마찰이 곧 「진짜 전역인가」를 한 번 묻게 하는 자리라 일부러 좁게 둔다. */
const 전역 = new Set([
  ...Object.getOwnPropertyNames(globalThis),
  'globalThis', 'console', 'process', 'require', 'module', 'exports', '__dirname', '__filename',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'fetch', 'Promise',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Date', 'Error', 'TypeError',
  'RangeError', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Uint8Array', 'Int16Array',
  'Float32Array', 'ArrayBuffer', 'DataView', 'TextEncoder', 'TextDecoder', 'Intl', 'Buffer',
  'URL', 'URLSearchParams', 'AbortController', 'structuredClone', 'queueMicrotask',
  // React Native / Hermes 가 얹는 것들
  '__DEV__', 'FormData', 'Blob', 'File', 'FileReader', 'Headers', 'Request', 'Response',
  'XMLHttpRequest', 'WebSocket', 'navigator', 'performance', 'crypto', 'alert',
  'requestAnimationFrame', 'cancelAnimationFrame', 'HermesInternal',
]);

/** 이 노드가 **이름을 만드는** 자리인가(선언·묶기). 그렇다면 그 이름들을 모은다. */
function 이름모으기(노드, 담기) {
  if (!노드 || typeof 노드 !== 'object') return;
  switch (노드.type) {
    case 'Identifier':
      담기(노드.name);
      return;
    case 'ObjectPattern':
      for (const p of 노드.properties) {
        if (p.type === 'RestElement') 이름모으기(p.argument, 담기);
        else 이름모으기(p.value, 담기);
      }
      return;
    case 'ArrayPattern':
      for (const el of 노드.elements) if (el) 이름모으기(el, 담기);
      return;
    case 'AssignmentPattern':
      이름모으기(노드.left, 담기);
      return;
    case 'RestElement':
      이름모으기(노드.argument, 담기);
      return;
    default:
      return;
  }
}

/** 파일 하나를 읽어 { 선언, 참조 } 를 낸다. */
function 훑기(코드) {
  const ast = parser.parse(코드, {
    sourceType: 'module',
    plugins: ['jsx'],
    errorRecovery: false,
  });

  const 선언 = new Set();
  const 참조 = [];

  const 걷기 = (노드, 부모) => {
    if (!노드 || typeof 노드 !== 'object') return;
    if (Array.isArray(노드)) {
      for (const n of 노드) 걷기(n, 부모);
      return;
    }
    if (typeof 노드.type !== 'string') return;

    switch (노드.type) {
      case 'ImportDeclaration':
        for (const s of 노드.specifiers) 선언.add(s.local.name);
        return; // 안쪽에 참조가 없다
      case 'ExportNamedDeclaration':
        /* [2026-08-13] F378 — `export { A as B }` 의 B(exported)는 참조가 아니라 **새로 짓는
         * 수출 이름**이라 선언될 자리가 원리상 없다. 갈래 없이 default 순회에 맡기면 B 가
         * Identifier 로 참조에 실려 미정의로 잡힌다(실측: lib/보고서교정제출.js '스냅샷모양판' —
         * 그 자리는 지역 상수 우회로 피해 있다). `from` 재수출은 local 쪽도 남의 모듈 이름공간이다. */
        if (노드.source) return; // export { X as Y } from './m' — X·Y 둘 다 이 파일의 이름이 아니다
        걷기(노드.declaration, 노드);
        for (const s of 노드.specifiers || []) 걷기(s, 노드);
        return;
      case 'ExportSpecifier':
        /* local 은 이 파일 안의 이름이다 — 미정의면 babel 이 파스 층에서 이미 거절하므로
         * (ModuleExportUndefined) 여기 걷기는 무해한 명시다. exported 는 일부러 안 걷는다. */
        걷기(노드.local, 노드);
        return;
      case 'VariableDeclarator':
        이름모으기(노드.id, (n) => 선언.add(n));
        걷기(노드.init, 노드);
        return;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        if (노드.id) 선언.add(노드.id.name);
        for (const p of 노드.params) 이름모으기(p, (n) => 선언.add(n));
        for (const p of 노드.params) 걷기(p, 노드); // 기본값 안의 참조
        걷기(노드.body, 노드);
        return;
      case 'ClassDeclaration':
      case 'ClassExpression':
        if (노드.id) 선언.add(노드.id.name);
        걷기(노드.body, 노드);
        return;
      case 'CatchClause':
        if (노드.param) 이름모으기(노드.param, (n) => 선언.add(n));
        걷기(노드.body, 노드);
        return;
      case 'MemberExpression':
        걷기(노드.object, 노드);
        if (노드.computed) 걷기(노드.property, 노드); // a[b] 의 b 만 참조다
        return;
      case 'OptionalMemberExpression':
        걷기(노드.object, 노드);
        if (노드.computed) 걷기(노드.property, 노드);
        return;
      case 'ObjectProperty':
        if (노드.computed) 걷기(노드.key, 노드);
        걷기(노드.value, 노드);
        return;
      case 'ObjectMethod':
      case 'ClassMethod':
        if (노드.computed) 걷기(노드.key, 노드);
        for (const p of 노드.params) 이름모으기(p, (n) => 선언.add(n));
        걷기(노드.body, 노드);
        return;
      case 'JSXAttribute':
        걷기(노드.value, 노드); // 속성 **이름**은 참조가 아니다
        return;
      case 'JSXIdentifier':
        // <View> 의 View 는 참조다. 소문자로 시작하면 호스트 요소(<div>)라 아니다.
        if (부모 && (부모.type === 'JSXOpeningElement' || 부모.type === 'JSXClosingElement')) {
          if (/^[A-Z가-힣_$]/.test(노드.name)) 참조.push(노드);
        }
        return;
      case 'LabeledStatement':
        걷기(노드.body, 노드);
        return;
      case 'BreakStatement':
      case 'ContinueStatement':
        return;
      case 'Identifier':
        참조.push(노드);
        return;
      default:
        break;
    }

    for (const 키 of Object.keys(노드)) {
      if (키 === 'loc' || 키 === 'range' || 키 === 'leadingComments' || 키 === 'trailingComments') continue;
      걷기(노드[키], 노드);
    }
  };

  걷기(ast.program, null);
  return { 선언, 참조 };
}

test('앱 소스에 선언되지 않은 이름을 참조하는 자리가 없다', () => {
  const 파일들 = 대상들();
  assert.ok(파일들.length > 0, '검사 대상이 0개다 — 경로 규칙이 깨졌다');

  const 사고 = [];
  for (const 파일 of 파일들) {
    const { 선언, 참조 } = 훑기(fs.readFileSync(파일, 'utf8'));
    for (const 노드 of 참조) {
      if (선언.has(노드.name) || 전역.has(노드.name)) continue;
      사고.push(`${path.relative(ROOT, 파일)}:${노드.loc.start.line} — '${노드.name}'`);
    }
  }

  assert.deepStrictEqual(
    사고,
    [],
    `선언 없는 이름을 참조한다(실기기에서 "Property 'x' doesn't exist" 로 터진다):\n  ${사고.join('\n  ')}`
  );
  // 분모를 밝힌다 — 0건이 「검사가 안 돌았다」와 같은 모양이 되지 않게(F207).
  console.log(`  ℹ 검사한 파일 ${파일들.length}개`);
});

test('탐지력 픽스처 — 없는 이름을 쓰면 실제로 잡힌다', () => {
  const { 선언, 참조 } = 훑기(`
    import { useState } from 'react';
    export default function 화면() {
      const [a] = useState(없는이름);
      return a;
    }
  `);
  const 샌것 = 참조.filter((n) => !선언.has(n.name) && !전역.has(n.name)).map((n) => n.name);
  assert.deepStrictEqual(샌것, ['없는이름']);
});

test('탐지력 픽스처 — 정상 코드에 거짓양성이 없다', () => {
  const { 선언, 참조 } = 훑기(`
    import { View } from 'react-native';
    import { 몽골날짜 } from '../lib/오늘과제.js';
    export function 화면({ 토큰, 목록 = [] }) {
      const [날짜, set날짜] = useState(몽골날짜);
      const { 항목, 막힘: 사유 } = 목록;
      목록.forEach((x) => set날짜(x.date));
      try { JSON.parse(토큰); } catch (e) { console.log(e, 항목, 사유); }
      return <View style={{ flex: 1 }} onLayout={() => 날짜} />;
    }
  `);
  const 샌것 = 참조.filter((n) => !선언.has(n.name) && !전역.has(n.name)).map((n) => n.name);
  assert.deepStrictEqual(샌것, ['useState'], 'useState 만 미import 로 잡혀야 한다');
});

/* F378 — 별칭 재수출 3픽스처. 탐지력은 여기 픽스처가 못박고, 실저장소(위 본검사)에는
 * 거짓양성만 검사한다(가드 맹점 ②). */
test('픽스처 — 별칭 재수출의 exported 이름은 참조가 아니다 (F378)', () => {
  const { 선언, 참조 } = 훑기(`
    const 원본 = 1;
    export { 원본 as 별칭 };
  `);
  const 샌것 = 참조.filter((n) => !선언.has(n.name) && !전역.has(n.name)).map((n) => n.name);
  assert.deepStrictEqual(샌것, [], 'exported(별칭)는 새 수출 이름 — 선언될 자리가 원리상 없다');
});

test('픽스처 — export 선언 안의 참조는 여전히 잡힌다 (F378 탐지력)', () => {
  /* 미정의 local(`export { 유령 }`)은 babel 이 파스 층에서 이미 거절하므로(ModuleExportUndefined)
   * 탐지력이 걸릴 자리는 declaration 쪽이다 — 새 갈래가 참조를 삼키지 않는 것을 여기서 못박는다. */
  const { 선언, 참조 } = 훑기(`export const 값 = 없는이름;`);
  const 샌것 = 참조.filter((n) => !선언.has(n.name) && !전역.has(n.name)).map((n) => n.name);
  assert.deepStrictEqual(샌것, ['없는이름'], 'export 갈래가 declaration 안의 미정의 참조를 삼키면 안 된다');
});

test('픽스처 — from 재수출은 local·exported 둘 다 이 파일 이름이 아니다 (F378)', () => {
  const { 선언, 참조 } = 훑기(`export { 밖이름 as 새이름 } from './다른모듈.js';`);
  const 샌것 = 참조.filter((n) => !선언.has(n.name) && !전역.has(n.name)).map((n) => n.name);
  assert.deepStrictEqual(샌것, [], 'from 재수출의 두 이름은 남의 모듈 이름공간이다');
});
