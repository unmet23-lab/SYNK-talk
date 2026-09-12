'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 파일소스, 구간, 코드만, 코드만픽스처 } = require('./lib/소스검사.js');

const source = 파일소스(path.join(__dirname, '../src/액션테스트화면.js'));
const body = 구간(source, '  const { width } = useWindowDimensions();', '  return <GestureHandlerRootView');

// 화면의 실제 hook/입력/콜백 코드를 실행한다. JSX와 네이티브 스레드를 구현한 시험은 아니다.
// refs/state는 렌더 사이 유지하고 effect는 의존 변경·unmount에서 cleanup한다.
function mount({ appState = 'active', accepted = true } = {}) {
  const slots = [], timers = new Map(), listeners = new Set(), queue = [];
  let cursor = 0, nextTimer = 0, output, requests = 0, closed = 0;
  let effectJobs = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const AppState = { currentState: appState,
    addEventListener(name, callback) {
      assert.equal(name, 'change'); listeners.add(callback);
      return { remove() { listeners.delete(callback); } };
    } };
  const dependencies = {
    useNativeGesture: () => ({}),
    AppState, 돌아가기: () => { closed += 1; }, useWindowDimensions: () => ({ width: 400 }), use줄임: () => false,
    useState(initial) {
      const index = cursor++;
      slots[index] ||= { kind: 'state', value: initial };
      return [slots[index].value, (value) => {
        slots[index].value = typeof value === 'function' ? value(slots[index].value) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ||= { kind: 'ref', value: { current: initial } };
      return slots[index].value;
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { kind: 'callback', value: callback, deps };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const slot = slots[index] ||= { kind: 'effect' };
      if (!same(slot.deps, deps)) {
        slot.deps = deps;
        effectJobs.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
      }
    },
    setInterval(callback, ms) { assert.equal(ms, 350); timers.set(++nextTimer, callback); return nextTimer; },
    clearInterval(id) { timers.delete(id); },
  };
  const evaluate = new Function(...Object.keys(dependencies), `${body}
    return { onShot, onResult, onMetrics, auto, pause, reset, close, 운동,
      seed, count, metrics, run, automatic, paused, active };
  `);
  function render() {
    cursor = 0; effectJobs = [];
    output = evaluate(...Object.values(dependencies));
    output.운동.current = { fire() {
      requests += 1;
      if (accepted) {
        const { onShot, onResult } = output;
        queue.push(() => onShot(), () => onResult({ kind: 'hit' }));
      }
    } };
    effectJobs.forEach((job) => job());
    return output;
  }
  render();
  return {
    render, current: () => output, timers, queue,
    requests: () => requests, closed: () => closed,
    tick() { [...timers.values()].forEach((callback) => callback()); },
    drain() { while (queue.length) queue.shift()(); },
    change(state) { AppState.currentState = state; listeners.forEach((callback) => callback(state)); },
    unmount() { slots.filter((slot) => slot.kind === 'effect').forEach((slot) => slot.cleanup?.()); },
    listenerCount: () => listeners.size,
  };
}

test('주석 제거 공용 통로가 실제 코드를 보존한다', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대);
});

test('수락 콜백이 전부 늦어도 자동 입력 발송은 20회이고 초과 타이머는 무시된다', () => {
  const h = mount();
  h.current().auto(); h.render();
  const queuedTimer = [...h.timers.values()][0];
  for (let i = 0; i < 30; i += 1) queuedTimer();
  assert.equal(h.requests(), 20, 'onShot 도착 전에 21번째 입력을 보내지 않는다');
  let state = h.render();
  assert.equal(state.count.inputs, 20);
  assert.equal(state.count.shots, 0);
  assert.equal(state.automatic, false);
  assert.equal(h.timers.size, 0);
  h.drain(); state = h.render();
  assert.deepEqual(state.count, { inputs: 20, shots: 20, hits: 20, misses: 0 });
  assert.equal(state.run, '20회 입력 완료');
});

test('실행부가 입력을 거절하면 입력 20회와 수락 0회가 구분된다', () => {
  const h = mount({ accepted: false });
  h.current().auto(); h.render();
  for (let i = 0; i < 20; i += 1) h.tick();
  assert.deepEqual(h.render().count, { inputs: 20, shots: 0, hits: 0, misses: 0 });
});

test('초기화 이전의 지연 발사·결과·측정·타이머는 새 실행에 들어가지 않는다', () => {
  const h = mount();
  h.current().auto(); h.render(); h.tick();
  const old = h.current(), oldTimer = [...h.timers.values()][0];
  h.queue.push(() => old.onMetrics({ fps: 12, renderer: 'old' }));
  old.reset();
  oldTimer(); h.drain(); // React 재렌더보다 먼저 도착하는 경우도 막는다.
  let state = h.render();
  assert.equal(h.requests(), 1);
  assert.equal(state.seed, 2);
  assert.deepEqual(state.count, { inputs: 0, shots: 0, hits: 0, misses: 0 });
  assert.equal(state.metrics, null);
  old.onShot(); old.onResult({ kind: 'hit' }); old.onMetrics({ fps: 1 });
  state.onShot(); state.onResult({ kind: 'miss' }); state.onMetrics({ fps: 60 });
  state = h.render();
  assert.deepEqual(state.count, { inputs: 0, shots: 1, hits: 0, misses: 1 });
  assert.deepEqual(state.metrics, { fps: 60 });
});

test('닫기 직후와 unmount 뒤 지연 콜백·타이머가 무효이고 구독도 정리된다', () => {
  for (const closeFirst of [true, false]) {
    const h = mount();
    h.current().auto(); h.render(); h.tick();
    const old = h.current(), oldTimer = [...h.timers.values()][0];
    if (closeFirst) old.close(); else h.unmount();
    oldTimer(); h.drain(); old.onMetrics({ fps: 99 });
    const state = h.render();
    assert.equal(h.requests(), 1);
    assert.deepEqual(state.count, { inputs: 1, shots: 0, hits: 0, misses: 0 });
    assert.equal(state.metrics, null);
    assert.equal(h.closed(), closeFirst ? 1 : 0);
    h.unmount();
    assert.equal(h.listenerCount(), 0);
    assert.equal(h.timers.size, 0);
  }
});

test('백그라운드에서는 자동 입력을 소비하지 않고 복귀 후 남은 횟수만 이어 간다', () => {
  const h = mount();
  h.current().auto(); h.render();
  for (let i = 0; i < 5; i += 1) h.tick();
  const oldTimer = [...h.timers.values()][0];
  h.change('background');
  for (let i = 0; i < 30; i += 1) oldTimer();
  assert.equal(h.requests(), 5, 'effect cleanup 이전에도 비활성 상태를 막는다');
  let state = h.render();
  assert.equal(state.count.inputs, 5); assert.equal(state.automatic, true);
  assert.equal(h.timers.size, 0);
  h.change('active'); h.render();
  for (let i = 0; i < 20; i += 1) h.tick();
  h.drain(); state = h.render();
  assert.equal(h.requests(), 20);
  assert.deepEqual(state.count, { inputs: 20, shots: 20, hits: 20, misses: 0 });
});

test('초기 비활성·수동 중지에서는 자동 입력 0회이며 앱 복귀가 수동 중지를 풀지 않는다', () => {
  const h = mount({ appState: 'inactive' });
  h.current().auto(); h.render(); h.tick();
  assert.equal(h.requests(), 0);
  h.current().pause(); h.render(); h.change('active'); h.render(); h.tick();
  assert.equal(h.requests(), 0);
  assert.equal(h.current().paused, true);
  h.current().pause(); h.render(); h.tick();
  assert.equal(h.requests(), 1);
  const queuedTimer = [...h.timers.values()][0];
  h.current().pause(); queuedTimer();
  assert.equal(h.requests(), 1, '수동 중지의 재렌더 전 경계도 막는다');
});

test('자동 중단 뒤 새 실행에서 이전 회차 타이머는 재사용되지 않는다', () => {
  const h = mount();
  h.current().auto(); h.render();
  const oldTimer = [...h.timers.values()][0];
  h.current().auto(); oldTimer();
  assert.equal(h.requests(), 0);
  h.render(); h.current().auto(); h.render();
  oldTimer(); assert.equal(h.requests(), 0);
  h.tick(); assert.equal(h.requests(), 1);
});
