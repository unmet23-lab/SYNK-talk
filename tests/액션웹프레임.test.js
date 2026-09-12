'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../lib/액션실행부.js');
const { 파일소스, 구간, 코드만, 코드만픽스처 } = require('./lib/소스검사.js');

const source = 파일소스(path.join(__dirname, '../src/액션운동장.web.js'));
const body = 구간(source, '  const { width, reducedMotion, seed = 1 } = props;', '  const coords = (e) => {');

// 실제 웹 어댑터의 frame/effect/imperative fire를 실행한다. Canvas 그리기 명령은 기록만 한다.
// RAF 시간·visibility·React 효과는 합성 입력이며 브라우저 FPS/픽셀 검증을 대신하지 않는다.
function mount({ hidden = false, paused = false } = {}) {
  const slots = [], rafs = new Map(), listeners = new Set(), metrics = [], results = [];
  let cursor = 0, nextRaf = 0, jobs = [], values, shots = 0, draws = 0;
  const ref = { current: null };
  const ctx = new Proxy({}, { get: (target, name) => target[name] ?? (() => {
    if (name === 'clearRect') draws += 1;
  }) });
  const canvasNode = { width: 0, height: 0, getContext: () => ctx };
  const document = { hidden,
    addEventListener(name, callback) { assert.equal(name, 'visibilitychange'); listeners.add(callback); },
    removeEventListener(name, callback) { assert.equal(name, 'visibilitychange'); listeners.delete(callback); } };
  let props = { width: 360, seed: 11, reducedMotion: false, enabled: true, paused,
    onShot: () => { shots += 1; }, onResult: (result) => results.push(result), onMetrics: (value) => metrics.push(value) };
  const dependencies = {
    ...core, ref, document, window: { devicePixelRatio: 1 }, 색: {},
    useRef(initial) {
      const index = cursor++;
      slots[index] ||= { kind: 'ref', value: { current: initial } };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const slot = slots[index] ||= { kind: 'effect' };
      if (!slot.deps || deps.some((value, i) => !Object.is(value, slot.deps[i]))) {
        slot.deps = deps;
        jobs.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
      }
    },
    useImperativeHandle(target, factory) { target.current = factory(); },
    requestAnimationFrame(callback) { rafs.set(++nextRaf, callback); return nextRaf; },
    cancelAnimationFrame(id) { rafs.delete(id); },
  };
  const evaluate = new Function('props', ...Object.keys(dependencies), `${body}
    return { world, pointer, frameClock, canvas };
  `);
  function render(patch = {}) {
    props = { ...props, ...patch }; cursor = 0; jobs = [];
    values = evaluate(props, ...Object.values(dependencies));
    values.canvas.current = canvasNode;
    jobs.forEach((job) => job());
    return values;
  }
  render();
  return {
    render, metrics, results, ref, values: () => values,
    shots: () => shots, draws: () => draws,
    frame(time) {
      const pending = [...rafs.entries()];
      pending.forEach(([id]) => rafs.delete(id));
      pending.forEach(([, callback]) => callback(time));
    },
    visibility(value) { document.hidden = value; [...listeners].forEach((callback) => callback()); },
    unmount() {
      slots.filter((slot) => slot.kind === 'effect').forEach((slot) => slot.cleanup?.());
      ref.current = null;
    },
    pendingRaf: () => rafs.size, listenerCount: () => listeners.size,
  };
}

test('주석 제거 공용 통로가 실행할 소스를 보존한다', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대);
});

test('숨김 이전 지연 누계를 버리고 복귀 첫 긴 간격도 운동·측정에서 제외한다', () => {
  const h = mount();
  h.frame(0); h.frame(100);
  assert.equal(h.values().frameClock.current.max, 100);
  const tick = h.values().world.current.tick;
  h.visibility(true); h.frame(50000);
  assert.equal(h.values().world.current.tick, tick);
  h.visibility(false); h.frame(60000);
  assert.equal(h.values().world.current.tick, tick);
  assert.equal(h.values().frameClock.current.n, 0);
  assert.deepEqual(h.metrics, []);
  for (let i = 1; i <= 61; i += 1) h.frame(60000 + i * 1000 / 60);
  assert.deepEqual(h.metrics, [{ fps: 60, slow: 0, maxMs: 17, renderer: 'web-canvas' }]);
});

test('수동 중지 중 RAF 그리기는 유지하되 재개 기준·누계·조준·잔여시간은 초기화한다', () => {
  const h = mount(); h.frame(0); h.frame(100);
  h.values().world.current = core.beginAim(core.advanceWorld(h.values().world.current, 2), 120, 90);
  h.values().pointer.current = 42;
  const tick = h.values().world.current.tick;
  h.render({ paused: true });
  assert.equal(h.values().world.current.accumulator, 0);
  assert.equal(h.values().world.current.aim, null);
  assert.equal(h.values().pointer.current, null);
  const draws = h.draws(); h.frame(50000); h.frame(60000);
  assert.equal(h.draws(), draws + 2, '이번 수리는 정지 중 그리기를 끄지 않는다');
  h.ref.current.fire(); assert.equal(h.shots(), 0);
  h.render({ paused: false }); h.frame(120000);
  assert.equal(h.values().world.current.tick, tick);
  assert.equal(h.values().frameClock.current.n, 0);
  for (let i = 1; i <= 61; i += 1) h.frame(120000 + i * 1000 / 60);
  assert.deepEqual(h.metrics, [{ fps: 60, slow: 0, maxMs: 17, renderer: 'web-canvas' }]);
});

test('처음부터 숨겨진 문서는 비행·보조 발사를 시작하지 않고 수동 중지도 따로 유지한다', () => {
  const h = mount({ hidden: true });
  h.frame(0); h.frame(60000); h.ref.current.fire();
  assert.equal(h.values().world.current.paused, true);
  assert.equal(h.values().world.current.tick, 0);
  assert.equal(h.shots(), 0);
  h.render({ paused: true }); h.visibility(false); h.frame(120000); h.ref.current.fire();
  assert.equal(h.values().world.current.tick, 0);
  assert.equal(h.shots(), 0);
  h.render({ paused: false }); h.frame(180000); h.frame(180000 + core.STEP_MS);
  assert.equal(h.values().world.current.tick, 1);
  assert.deepEqual(h.metrics, []);
});

test('seed 초기화는 RAF·listener 한 벌만 유지하고 숨김·측정·결과 상태를 재설정한다', () => {
  const h = mount(); h.frame(0); h.ref.current.fire();
  for (let i = 1; i <= 30; i += 1) h.frame(i * 1000 / 60);
  assert.equal(h.results.length, 1);
  h.visibility(true); h.render({ seed: 22 });
  assert.equal(h.values().world.current.seed, 22);
  assert.equal(h.values().world.current.paused, true);
  assert.equal(h.values().world.current.tick, 0);
  assert.equal(h.values().world.current.lastResult, null);
  assert.equal(h.pendingRaf(), 1);
  assert.equal(h.listenerCount(), 1);
  h.visibility(false); h.frame(60000);
  assert.equal(h.values().world.current.tick, 0);
  h.ref.current.fire();
  for (let i = 1; i <= 30; i += 1) h.frame(60000 + i * 1000 / 60);
  assert.equal(h.results.length, 2, 'reset 뒤 shotId 1의 결과도 한 번 전달한다');
});

test('unmount는 RAF와 visibility 구독을 제거하여 종료 후 재생·콜백을 남기지 않는다', () => {
  const h = mount(); h.frame(0); h.ref.current.fire();
  const before = { tick: h.values().world.current.tick, draws: h.draws(), results: h.results.length };
  h.unmount();
  assert.equal(h.pendingRaf(), 0); assert.equal(h.listenerCount(), 0);
  assert.equal(h.ref.current, null);
  h.visibility(true); h.visibility(false); h.frame(60000);
  assert.equal(h.values().world.current.tick, before.tick);
  assert.equal(h.draws(), before.draws);
  assert.equal(h.results.length, before.results);
  assert.deepEqual(h.metrics, []);
});

test('동작 줄이기와 부모 콜백 변경은 진행·누계를 지우지 않고 최신 콜백을 사용한다', () => {
  const h = mount(); h.frame(0); h.frame(100);
  const tick = h.values().world.current.tick, max = h.values().frameClock.current.max;
  const nextMetrics = [], nextResults = [];
  h.render({ reducedMotion: true, onMetrics: (value) => nextMetrics.push(value), onResult: (value) => nextResults.push(value) });
  assert.equal(h.values().world.current.tick, tick);
  assert.equal(h.values().frameClock.current.max, max);
  const x = h.values().world.current.target.x;
  h.ref.current.fire();
  for (let i = 1; i <= 61; i += 1) h.frame(100 + i * 1000 / 60);
  assert.equal(h.values().world.current.target.x, x);
  assert.equal(h.values().world.current.particles.length, 0);
  assert.equal(nextResults.length, 1); assert.equal(h.results.length, 0);
  assert.equal(nextMetrics.length, 1); assert.equal(h.metrics.length, 0);
});
