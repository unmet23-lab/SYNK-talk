'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { 혼잣말캐릭터들 } = require('../lib/마스코트생명.js');
const { 코드만, 파일소스, 코드만픽스처 } = require('./lib/소스검사.js');

const root = path.resolve(__dirname, '..');
const source = 코드만(파일소스(path.join(root, 'tools/첫흐름확인화면.js')));
function 실제함수(name) {
  const body = source.match(new RegExp(`^export function ${name}\\([\\s\\S]*?^}`, 'm'))?.[0];
  assert.ok(body, `실제 미리보기 함수가 없다: ${name}`);
  return vm.runInNewContext(`(${body.replace(/^export /, '')})`, { 혼잣말캐릭터들 });
}
const 초기 = 실제함수('미리보기초기');
const 전환 = 실제함수('미리보기전환');
const keyTemplate = source.match(/<교수멘탈화면 key=\{(`[^`]+`)\}/)?.[1];
const taskTemplate = source.match(/task_ref: (`[^`]+`)/)?.[1];
assert.ok(keyTemplate && taskTemplate, '실제 마운트 키와 과제 참조를 찾지 못했다');
const 경계 = (state) => ({
  key: vm.runInNewContext(keyTemplate, state),
  task: vm.runInNewContext(taskTemplate, state),
});

test('미선택 — 가이드가 비어 있고 전략에서 시작하며 조작만으로 몽글을 고르지 않는다', () => {
  const state = 초기(1800000000000);
  assert.equal(state.가이드, null);
  assert.equal(state.단계, '전략');
  for (const 종류 of ['처음', '보낸뒤', '다시열기']) assert.equal(전환(state, { 종류 }), state);
  assert.equal(전환(state, { 종류: '가이드', 가이드: '없는친구' }), state);
});

test('세 가이드 — 정본 키를 그대로 전달하고 각각 새 전략 과제로 마운트한다', () => {
  for (const 가이드 of 혼잣말캐릭터들) {
    const before = 초기(1800000000000);
    const after = 전환(before, { 종류: '가이드', 가이드 });
    assert.equal(after.가이드, 가이드);
    assert.equal(after.단계, '전략');
    assert.notEqual(경계(before).task, 경계(after).task);
    assert.notEqual(경계(before).key, 경계(after).key);
    assert.equal(before.가이드, null, '이전 세션을 덮으면 안 된다');
  }
});

test('가이드 변경 — 이전 편지를 복원하지 않는 새 과제, 같은 가이드 재선택은 현재 세션 유지', () => {
  const first = 전환(초기(1800000000000), { 종류: '가이드', 가이드: '까몽' });
  const sent = 전환(first, { 종류: '보낸뒤' });
  assert.equal(전환(sent, { 종류: '가이드', 가이드: '까몽' }), sent);
  const changed = 전환(sent, { 종류: '가이드', 가이드: '마린' });
  assert.equal(changed.단계, '전략');
  assert.notEqual(경계(changed).task, 경계(sent).task);
  assert.notEqual(경계(changed).key, 경계(sent).key);
});

test('제출 후 같은 화면 다시 열기 — 마운트만 새로 하고 편지의 과제 참조와 선택은 보존한다', () => {
  const chosen = 전환(초기(1800000000000), { 종류: '가이드', 가이드: '마린' });
  const sent = 전환(chosen, { 종류: '보낸뒤' });
  const reopened = 전환(sent, { 종류: '다시열기' });
  assert.equal(경계(reopened).task, 경계(sent).task);
  assert.notEqual(경계(reopened).key, 경계(sent).key);
  assert.equal(reopened.가이드, '마린');
  assert.equal(reopened.단계, '대기');
  assert.equal(전환(reopened, { 종류: '처음' }).단계, '전략');
});

test('제품과 미리보기 — 현재 선택값이 G1 prop까지 이어지고 미선택은 G1 앞에서 멈춘다', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석을 실제 코드로 검사하면 안 된다');
  const app = 코드만(파일소스(path.join(root, 'App.js')));
  const speaking = 코드만(파일소스(path.join(root, 'src/말하기화면.js')));
  assert.match(app, /<말하기화면[\s\S]*?캐릭터=\{캐릭터\}/);
  assert.match(speaking, /<교수멘탈화면[\s\S]*?가이드=\{캐릭터\}/);
  assert.match(source, /서체준비 && 진행 \? 가이드 \? <교수멘탈화면/);
  assert.match(source, /<교수멘탈화면[\s\S]*?가이드=\{가이드\}/);
  assert.match(source, /useReducer\(미리보기전환, null, \(\) => 미리보기초기\(Date.now\(\)\)\)/);
});

test('PC 가이드 선택 — 실제 radio DOM에 미선택과 현재 선택을 전달한다', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { Image, Pressable, Text, View } = require('react-native-web');
  const body = source.match(/^function 가이드선택\([\s\S]*?^}/m)?.[0];
  assert.ok(body, '실제 가이드 선택기를 찾지 못했다');
  const { code } = require('@babel/core').transformSync(`${body}\nmodule.exports = 가이드선택;`, {
    babelrc: false, configFile: false,
    plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'],
  });
  const scope = {
    module: { exports: {} }, require,
    useRef: React.useRef, useEffect: React.useEffect,
    Image, Pressable, Text, View, 혼잣말캐릭터들,
    표시배: require('../lib/마스코트생명.js').표시배,
    가이드그림: Object.fromEntries(혼잣말캐릭터들.map((이름) => [이름, `/${이름}.webp`])), s: {},
  };
  vm.runInNewContext(code, scope);
  for (const 값 of [null, ...혼잣말캐릭터들]) {
    const html = renderToStaticMarkup(React.createElement(scope.module.exports, { 값, 고르기() {} }));
    const radios = html.match(/<[^>]+role="radio"[^>]*>/g) || [];
    assert.equal(radios.length, 3);
    for (const 이름 of 혼잣말캐릭터들) {
      const radio = radios.find((tag) => tag.includes(`aria-label="${이름}"`));
      assert.ok(radio, `${이름} 선택지가 없다`);
      assert.ok(radio.includes(`aria-checked="${값 === 이름}"`), `${이름}의 실제 선택 상태가 DOM에서 빠졌다`);
    }
  }
});
