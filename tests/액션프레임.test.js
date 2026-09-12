'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../lib/액션실행부.js');

// 실제 컴포넌트의 상태 선언·효과·프레임 콜백을 실행한다. JSX/Skia 렌더만 제외한다.
// JS/UI 큐는 즉시 실행하는 합성 하네스이며 실제 기기의 스레드/프레임 성능 시험은 아니다.
const source = fs.readFileSync(path.join(__dirname, '../src/액션운동장.native.js'), 'utf8');
const start = source.indexOf('  const world = useSharedValue(');
const end = source.indexOf('  const scale = width / WORLD_WIDTH;');
assert.ok(start >= 0 && end > start, '운동 콜백 경계를 찾는다');
const body = source.slice(start, end);

function mount({ appState = 'active', paused = false } = {}) {
  const effects = [], metrics = [], results = [];
  let frame, appChange, removed = false;
  const ref = {};
  const dependencies = {
    ...core, seed: 123, enabled: true, paused, reducedMotion: false,
    ref, onShot: () => {}, onResult: (r) => results.push(r), onMetrics: (m) => metrics.push(m),
    AppState: { currentState: appState, addEventListener: (name, listener) => {
      assert.equal(name, 'change'); appChange = listener;
      return { remove: () => { removed = true; } };
    } },
    useSharedValue: (value) => ({ value }),
    useEffect: (effect, deps) => effects.push({ effect, deps }),
    useImperativeHandle: (target, factory) => Object.assign(target, factory()),
    useFrameCallback: (callback) => { frame = callback; },
    runOnUI: (fn) => fn, runOnJS: (fn) => fn,
  };
  // paused 파라미터를 바꾸고 현재 소스의 동일한 수동 중지 효과를 다시 실행한다.
  const evaluate = new Function(...Object.keys(dependencies), `${body}
    return { world, stopped, frames, skipFirstFrame,
      setManualPause: (value, runEffect) => { paused = value; runEffect(); } };
  `);
  const state = evaluate(...Object.values(dependencies));
  // 효과는 선언 순서: enabled, paused, seed, reducedMotion, AppState.
  // 의존 객체로 중지 효과를 찾아 소스의 순서 변경을 불필요하게 제한하지 않는다.
  const pauseEffect = effects.find((e) => e.deps.includes(state.stopped));
  assert.ok(pauseEffect, '수동 중지 효과가 등록되어 있다');
  const cleanups = effects.map((e) => e.effect()).filter((cleanup) => typeof cleanup === 'function');
  return { ...state, metrics, results, ref,
    frame: (dt) => frame({ timeSincePreviousFrame: dt }),
    appChange: (value) => appChange(value),
    setManualPause: (value) => state.setManualPause(value, pauseEffect.effect),
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
    isRemoved: () => removed,
  };
}

test('처음부터 비활성인 앱은 프레임·보조 발사를 시작하지 않는다', () => {
  for (const appState of ['background', 'inactive', null]) {
    const h = mount({ appState });
    h.frame(60000); h.ref.fire();
    assert.equal(h.world.value.tick, 0);
    assert.equal(h.world.value.shots, 0);
    assert.deepEqual(h.metrics, []);
    h.appChange('active');
    h.frame(60000);
    assert.equal(h.world.value.tick, 0);
    h.frame(core.STEP_MS);
    assert.equal(h.world.value.tick, 1);
  }
});

test('백그라운드 복귀 첫 60000ms는 운동·측정에서 제외하고 다음 정상 프레임부터 재개한다', () => {
  const h = mount();
  h.frame(null); h.frame(core.STEP_MS);
  const tick = h.world.value.tick;
  assert.equal(h.frames.value.n, 1);
  h.appChange('background');
  assert.deepEqual(h.frames.value, { n: 0, elapsed: 0, slow: 0, max: 0 });
  h.frame(60000);
  h.appChange('active');
  h.frame(60000);
  assert.equal(h.world.value.tick, tick);
  assert.deepEqual(h.metrics, []);
  assert.equal(h.frames.value.n, 0);
  for (let i = 0; i < 61; i += 1) h.frame(1000 / 60);
  assert.equal(h.world.value.tick, tick + 122);
  assert.equal(h.metrics.length, 1);
  assert.deepEqual(h.metrics[0], { fps: 60, slow: 0, maxMs: 17, renderer: 'native-ui-skia' });
});

test('사용자 일시정지는 앱 복귀로 풀리지 않고 구독은 종료 시 제거된다', () => {
  const h = mount({ paused: true });
  h.appChange('background'); h.appChange('active');
  h.frame(60000); h.frame(core.STEP_MS); h.ref.fire();
  assert.equal(h.stopped.value, true);
  assert.equal(h.world.value.tick, 0);
  assert.equal(h.world.value.shots, 0);
  assert.deepEqual(h.metrics, []);
  h.unmount();
  assert.equal(h.isRemoved(), true);
});

test('수동 중지·재개 첫 60000ms는 버리며 비활성 앱은 수동 재개해도 멈춰 있다', () => {
  const h = mount();
  h.frame(null); h.frame(core.STEP_MS);
  const tick = h.world.value.tick;
  h.world.value = core.beginAim(core.advanceWorld(h.world.value, 2), 120, 90);
  h.setManualPause(true);
  assert.equal(h.world.value.aim, null);
  assert.equal(h.world.value.accumulator, 0);
  assert.deepEqual(h.frames.value, { n: 0, elapsed: 0, slow: 0, max: 0 });
  h.frame(60000);
  h.setManualPause(false);
  h.frame(60000);
  assert.equal(h.world.value.tick, tick);
  assert.deepEqual(h.metrics, []);
  assert.equal(h.frames.value.n, 0);
  h.frame(core.STEP_MS);
  assert.equal(h.world.value.tick, tick + 1);
  assert.equal(h.frames.value.n, 1);
  h.appChange('background');
  h.setManualPause(true); h.setManualPause(false);
  h.frame(60000); h.ref.fire();
  assert.equal(h.world.value.paused, true);
  assert.equal(h.world.value.tick, tick + 1);
  assert.equal(h.world.value.shots, 0);
});
