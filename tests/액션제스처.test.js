'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { transformSync } = require('@babel/core');
const { 파일소스, 구간, 코드만, 코드만픽스처 } = require('./lib/소스검사.js');
const core = require('../lib/액션실행부.js');

const native = 파일소스(path.join(__dirname, '../src/액션운동장.native.js'));
const screen = 파일소스(path.join(__dirname, '../src/액션테스트화면.js'));
const body = 구간(native, '  const scale = width / WORLD_WIDTH;', '  return <GestureDetector');

// 실제 제스처/파생 경로 콜백을 실행한다. OS의 터치 중재와 Skia 렌더러는 실기기 검수가 필요하다.
function mount(width = 360) {
  const world = { value: core.createWorld(1) }, ready = { value: true }, stopped = { value: false };
  const scrollGesture = { handlerTag: 17 };
  let shots = 0;
  const dependencies = {
    ...core, width, world, ready, stopped, scrollGesture,
    onShot: () => { shots += 1; }, runOnJS: (fn) => fn,
    usePanGesture: (options) => options,
    useDerivedValue: (callback) => ({ get value() { return callback(); } }),
    Skia: { PathBuilder: { Make() {
      const commands = [];
      return {
        moveTo(...args) { commands.push(['moveTo', ...args]); return this; },
        lineTo(...args) { commands.push(['lineTo', ...args]); return this; },
        addCircle(...args) { commands.push(['addCircle', ...args]); return this; },
        detach() { return { kind: 'SkPath', commands: commands.splice(0) }; },
      };
    } } },
  };
  const result = new Function(...Object.keys(dependencies), `${body}
    return { gesture, arrowPath, particles, aimPath };
  `)(...Object.values(dependencies));
  return { ...result, world, ready, stopped, scrollGesture, shots: () => shots };
}

test('주석 제거 탐지력 픽스처', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대);
});

test('실제 화면 트리에서 RN ScrollView가 Native 제스처의 직접 자식이고 같은 관계가 운동장으로 전달된다', () => {
  const jsx = 구간(screen, '  return <GestureHandlerRootView', '\n}\n');
  const compiled = transformSync(`function render() { ${jsx} }`, {
    configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
  const scrollGesture = { handlerTag: 17 };
  const dependencies = {
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    GestureHandlerRootView: 'root', GestureDetector: 'detector', ScrollView: 'scroll',
    View: 'view', Pressable: 'button', Text: 'text', 운동장: 'canvas',
    s: {}, scrollGesture, seed: 1, 운동: {}, 가로: 360, paused: false, 줄임: false,
    staticTarget: false, automatic: false, active: true, run: '대기',
    count: { inputs: 0, shots: 0, hits: 0, misses: 0 }, metrics: null,
    close() {}, reset() {}, pause() {}, auto() {}, setStaticTarget() {},
    onShot() {}, onResult() {}, onMetrics() {},
  };
  const tree = new Function(...Object.keys(dependencies), `${compiled}; return render();`)(...Object.values(dependencies));
  assert.equal(tree.type, 'root');
  const detector = tree.children[0], scroll = detector.children[0];
  assert.equal(detector.type, 'detector');
  assert.equal(detector.props.gesture, scrollGesture);
  assert.equal(scroll.type, 'scroll');
  assert.equal(scroll.props.scrollEnabled, undefined, '화면 전체 스크롤을 끄지 않는다');
  const children = scroll.children[0].children;
  assert.equal(children.find((node) => node.type === 'canvas').props.scrollGesture, scrollGesture);
  assert.equal(children.filter((node) => node.type === 'detector').length, 0, '밖의 컨트롤에는 pan 차단을 씌우지 않는다');
});

test('pan이 부모 scroll을 block하며 세로·가로 입력 모두 좌표 변환 후 한 번 발사한다', () => {
  for (const [x, y] of [[180, 96], [280, 300]]) {
    const h = mount(400), scale = 400 / 360;
    assert.equal(h.gesture.block, h.scrollGesture);
    assert.equal(h.gesture.minDistance, 1);
    assert.equal(h.gesture.maxPointers, 1);
    h.gesture.onActivate({ x: 180 * scale, y: 370 * scale });
    h.gesture.onUpdate({ x: x * scale, y: y * scale, numberOfPointers: 1 });
    h.gesture.onDeactivate({ canceled: false });
    h.gesture.onDeactivate({ canceled: false });
    assert.equal(h.shots(), 1);
    assert.equal(h.world.value.arrows.length, 1);
    assert.ok(h.world.value.arrows[0].vy < 0);
    assert.equal(Math.sign(h.world.value.arrows[0].vx), Math.sign(x - 180));
  }
});

test('취소·두 손가락·중지 경계는 기존 aim을 버리고 발사하지 않는다', () => {
  for (const reason of ['cancel', 'multi', 'pause', 'background']) {
    const h = mount();
    h.gesture.onActivate({ x: 180, y: 300 });
    if (reason === 'multi') h.gesture.onUpdate({ x: 180, y: 96, numberOfPointers: 2 });
    if (reason === 'pause') h.stopped.value = true;
    if (reason === 'background') h.world.value = core.setPaused(h.world.value, true);
    h.gesture.onDeactivate({ canceled: reason === 'cancel' });
    assert.equal(h.shots(), 0, reason);
    assert.equal(h.world.value.aim, null, reason);
  }
});

test('세 파생 경로가 builder에서 불변 path를 반환하고 기존 선·원 좌표를 보존한다', () => {
  const h = mount();
  assert.deepEqual(h.arrowPath.value, { kind: 'SkPath', commands: [] });
  h.gesture.onActivate({ x: 180, y: 96 });
  assert.deepEqual(h.aimPath.value, { kind: 'SkPath', commands: [
    ['moveTo', 180, 376], ['lineTo', 180, 96], ['addCircle', 180, 96, 7],
  ] });
  h.gesture.onDeactivate({ canceled: false });
  assert.deepEqual(h.arrowPath.value, { kind: 'SkPath', commands: [
    ['moveTo', 180, 398], ['lineTo', 180, 376], ['lineTo', 184, 383],
    ['moveTo', 180, 376], ['lineTo', 176, 383],
  ] });
  h.world.value = { ...h.world.value, particles: [{ x: 10, y: 20, life: 0.4 }] };
  assert.deepEqual(h.particles.value, { kind: 'SkPath', commands: [['addCircle', 10, 20, 2]] });
  h.world.value = core.setReducedMotion(h.world.value, true);
  assert.deepEqual(h.particles.value.commands, []);
  assert.equal(h.arrowPath.value.commands.length, 5, '동작 줄이기로 비행 경로를 지우지 않는다');
});
