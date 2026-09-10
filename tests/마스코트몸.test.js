'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { ROOT } = require('./lib/화면세우기.js');

function 판정(platform) {
  const file = path.join(ROOT, 'src', '마스코트몸.js');
  const saved = require.cache[file];
  const load = Module._load;
  let skiaLoads = 0;
  delete require.cache[file];
  Module._load = function (name, ...args) {
    if (name === 'react-native') return { Platform: { OS: platform } };
    if (name === '@shopify/react-native-skia') {
      skiaLoads++;
      return { Canvas() {}, Vertices() {}, ImageShader() {}, useImage() { throw new Error('CanvasKit is not initialized'); } };
    }
    return load.call(this, name, ...args);
  };
  try {
    return { result: require(file).쓸수있나(), skiaLoads };
  } finally {
    Module._load = load;
    delete require.cache[file];
    if (saved) require.cache[file] = saved;
  }
}

test('마스코트 몸 — 웹에 Skia 모듈이 있어도 초기화되지 않은 CanvasKit을 사용하지 않는다', () => {
  const { result, skiaLoads } = 판정('web');
  assert.equal(result.된다, false);
  assert.match(result.까닭, /웹/);
  assert.equal(skiaLoads, 0);
});

test('마스코트 몸 — 네이티브에서는 사용 가능한 Skia 경로를 유지한다', () => {
  const { result, skiaLoads } = 판정('ios');
  assert.equal(result.된다, true);
  assert.equal(skiaLoads, 1);
});
