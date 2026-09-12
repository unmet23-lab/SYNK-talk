'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../lib/액션실행부.js');
const { createWorld, advanceWorld, setPaused, setReducedMotion, resetWorld, beginAim, moveAim,
  cancelAim, releaseArrow, assistShot, segmentCircleHit, STEP_MS, MAX_SUBSTEPS, MAX_ARROWS, MAX_PARTICLES } = engine;

function play(hz, seconds, state = createWorld(21)) {
  let next = state;
  for (let i = 0; i < hz * seconds; i += 1) next = advanceWorld(next, 1000 / hz);
  return next;
}

function assertWorldInvariant(state) {
  assert.ok(state.arrows.length <= MAX_ARROWS);
  assert.ok(state.particles.length <= MAX_PARTICLES);
  assert.equal(state.shots, state.hits + state.misses + state.arrows.length);
  assert.ok(state.accumulator >= 0 && state.accumulator < STEP_MS);
  assert.ok(state.target.x >= 84 - 1e-9 && state.target.x <= 276 + 1e-9);
  assert.equal(new Set(state.arrows.map((arrow) => arrow.id)).size, state.arrows.length);
  function finiteNumbers(value) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    else if (value && typeof value === 'object') Object.values(value).forEach(finiteNumbers);
  }
  finiteNumbers(state);
}

test('30/60/120Hz 동일 시간의 표적·화살·충돌·난수 결과가 같다', () => {
  let start = createWorld(21);
  start = releaseArrow(beginAim(start, start.target.x, start.target.y));
  const a = play(30, 2, start);
  const b = play(60, 2, start);
  const c = play(120, 2, start);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  assert.equal(a.tick, 240);
  assert.equal(a.hits + a.misses, 1);
});

test('누적 시간은 작은 프레임을 버리지 않고 고정 스텝으로 묶는다', () => {
  let state = createWorld();
  state = advanceWorld(state, STEP_MS / 4);
  assert.equal(state.tick, 0);
  for (let i = 0; i < 3; i += 1) state = advanceWorld(state, STEP_MS / 4);
  assert.equal(state.tick, 1);
  assert.equal(state.accumulator, 0);
});

test('음수·0·NaN·Infinity·비숫자 delta는 시간과 상태를 바꾸지 않는다', () => {
  const state = createWorld();
  for (const dt of [-1, 0, NaN, Infinity, -Infinity, null, undefined, '16']) {
    assert.equal(advanceWorld(state, dt), state);
  }
});

test('긴 복귀는 최대 서브스텝만 실행하며 밀린 시간을 남기지 않는다', () => {
  let state = advanceWorld(createWorld(), 60000);
  assert.equal(state.tick, MAX_SUBSTEPS);
  assert.ok(state.accumulator < STEP_MS);
  state = advanceWorld(state, STEP_MS);
  assert.equal(state.tick, MAX_SUBSTEPS + 1);
});

test('pause는 조준·누적시간을 비우고 멈추며 reset은 같은 seed를 재현한다', () => {
  let state = beginAim(advanceWorld(createWorld(99), 4), 160, 80);
  state = setPaused(state, true);
  assert.equal(state.aim, null);
  assert.equal(state.accumulator, 0);
  assert.equal(advanceWorld(state, 10000), state);
  assert.equal(beginAim(state, 180, 80), state);
  assert.equal(releaseArrow(state), state);
  const resumed = setPaused(state, false);
  assert.equal(advanceWorld(resumed, STEP_MS).tick, resumed.tick + 1);
  assert.deepEqual(resetWorld(resumed), createWorld(99));
  assert.deepEqual(resetWorld(resumed, 45), createWorld(45));
});

test('연속 교차는 한 스텝에서 원 양쪽을 넘는 화살과 접선을 잡는다', () => {
  assert.equal(segmentCircleHit(-100, 0, 100, 0, 0, 0, 5), 0.475);
  assert.equal(segmentCircleHit(-10, 5, 10, 5, 0, 0, 5), 0.5);
  assert.equal(segmentCircleHit(-10, 6, 10, 6, 0, 0, 5), null);
  assert.equal(segmentCircleHit(0, 0, 0, 0, 0, 0, 5), 0);
  assert.equal(segmentCircleHit(8, 0, 8, 0, 0, 0, 5), null);
  assert.equal(segmentCircleHit(NaN, 0, 8, 0, 0, 0, 5), null);
  assert.equal(segmentCircleHit(0, 0, 8, 0, 0, 0, -1), null);
});

test('운동 프레임에서 실제 고속 충돌은 한 번만 결과를 내고 화살을 제거한다', () => {
  let state = createWorld(11);
  state = { ...state, shots: 1, arrows: [{ id: 1, x: state.target.x,
    y: 180, vx: 0, vy: -24000, age: 0 }] };
  state = advanceWorld(state, STEP_MS);
  assert.equal(state.hits, 1);
  assert.equal(state.arrows.length, 0);
  assert.equal(state.lastResult.kind, 'hit');
  assert.equal(state.lastResult.shotId, 1);
  assert.equal(state.particles.length, 12);
  assert.equal(advanceWorld(state, STEP_MS).hits, 1);
});

test('조준 좌표와 당김은 범위를 지키고 발사는 조준한 방향이며 원본은 불변', () => {
  const initial = createWorld();
  const before = JSON.stringify(initial);
  assert.equal(moveAim(initial, 1, 1), initial);
  assert.equal(beginAim(initial, NaN, 1), initial);
  let state = beginAim(initial, -100, 900);
  assert.equal(state.aim.x, 0);
  assert.equal(state.aim.y, initial.bow.y - 12);
  state = moveAim(state, 180, 60);
  assert.equal(state.aim.pull, 1);
  const released = releaseArrow(state);
  assert.equal(released.arrows[0].vx, 0);
  assert.ok(released.arrows[0].vy < 0);
  assert.equal(released.aim, null);
  assert.equal(cancelAim(state).aim, null);
  assert.equal(JSON.stringify(initial), before);
});

test('같은 seed 입력열 재현과 다른 seed 표적 차이', () => {
  const a = play(60, 1, createWorld(44));
  assert.deepEqual(a, play(60, 1, createWorld(44)));
  assert.notEqual(a.target.phase, createWorld(45).target.phase);
  assert.deepEqual(createWorld(NaN), createWorld(1));
  assert.deepEqual(createWorld(0), createWorld(1));
});

test('보조 발사는 이동 표적에도 실제 궤적을 거쳐 맞으며 시간대·프레임률에 무관하다', () => {
  for (const seed of [1, 55, 5000, 999999, 0xffffffff]) {
    for (const hz of [30, 60, 120]) {
      let state = play(hz, 1, createWorld(seed));
      state = assistShot(state);
      assert.equal(state.hits, 0, '발사 즉시 가짜 성공을 만들지 않는다');
      assert.equal(state.arrows.length, 1);
      state = play(hz, 1, state);
      assert.equal(state.hits, 1);
      assert.equal(state.misses, 0);
    }
  }
  const paused = setPaused(createWorld(), true);
  assert.equal(assistShot(paused), paused);
});

test('동작 줄이기는 표적을 멈추고 입자를 생략하며 재설정에도 보존된다', () => {
  const initial = createWorld(88, { reducedMotion: true });
  let state = play(60, 1, initial);
  assert.equal(state.target.x, initial.target.x);
  state = play(60, 1, assistShot(state));
  assert.equal(state.hits, 1);
  assert.equal(state.particles.length, 0);
  assert.deepEqual(resetWorld(state), initial);
});

test('동작 줄이기 설정 변경은 화살·조준·시간·점수·최종 결과를 보존한다', () => {
  let state = createWorld(999);
  state = play(60, 1, assistShot(state));
  state = beginAim(assistShot(state), 150, 90);
  state = { ...state, particles: [{ id: 900, x: 150, y: 96, vx: 2, vy: 3, life: 0.2 }] };
  const before = JSON.stringify(state);
  const next = setReducedMotion(state, true);
  for (const key of ['arrows', 'aim', 'shots', 'hits', 'misses', 'lastResult', 'tick', 'time', 'accumulator', 'paused', 'seed', 'rng']) {
    assert.equal(next[key], state[key], key);
  }
  assert.equal(next.target.x, state.target.x);
  assert.equal(next.target.speed, 0);
  assert.deepEqual(next.particles, []);
  assert.equal(setReducedMotion(next, true), next);
  assert.equal(JSON.stringify(state), before);
});

test('과녁은 설정 토글 순간 점프하지 않고 정지 후 같은 위치·방향에서 다시 움직인다', () => {
  const moving = play(60, 2, createWorld(56789));
  const stopped = setReducedMotion(moving, true);
  const held = play(60, 2, stopped);
  assert.equal(held.target.x, moving.target.x);
  const resumed = setReducedMotion(held, false);
  assert.equal(resumed.target.x, held.target.x);
  assert.equal(resumed.target.speed, 1.35);
  const originalNext = advanceWorld(moving, STEP_MS);
  const resumedNext = advanceWorld(resumed, STEP_MS);
  assert.ok(Math.abs(originalNext.target.x - resumedNext.target.x) < 1e-9);
  const completed = play(60, 1, assistShot(resumed));
  assert.equal(completed.hits, 1, '위상 변경 후 보조발사도 실제 표적에 도달');
});

test('샷 비행 중 설정을 바꿔도 유실 없이 한 번만 정산하며 프레임률 결과가 같다', () => {
  const results = [30, 60, 120].map((hz) => {
    let state = play(hz, 1, createWorld(54321));
    state = assistShot(state);
    state = advanceWorld(state, STEP_MS * 2);
    state = setReducedMotion(state, true);
    state = play(hz, 1, state);
    assert.equal(state.shots, 1);
    assert.equal(state.hits + state.misses, 1);
    assert.equal(state.arrows.length, 0);
    assert.equal(state.lastResult.shotId, 1);
    return state;
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});

test('연속 발사에도 화살·파티클 수는 고정 상한 안에 남는다', () => {
  let state = createWorld(12);
  for (let i = 0; i < 50; i += 1) state = releaseArrow(beginAim(state, state.target.x, 96));
  assert.equal(state.arrows.length, MAX_ARROWS);
  assert.equal(state.shots, MAX_ARROWS);
  for (let i = 0; i < 600; i += 1) {
    state = releaseArrow(beginAim(state, state.target.x, 96));
    state = advanceWorld(state, STEP_MS);
    assert.ok(state.arrows.length <= MAX_ARROWS);
    assert.ok(state.particles.length <= MAX_PARTICLES);
  }
  state = play(60, 3, state);
  assert.equal(state.arrows.length, 0);
  assert.equal(state.particles.length, 0);
  assert.equal(state.hits + state.misses, state.shots);
});

test('10분 60Hz 입력 36000회 동안 72000 고정 스텝과 개체 불변식을 유지한다', () => {
  let state = createWorld(20260912);
  for (let frame = 0; frame < 36000; frame += 1) {
    if (frame % 60 === 0) state = assistShot(state);
    state = advanceWorld(state, 1000 / 60);
    assertWorldInvariant(state);
  }
  assert.equal(state.tick, 72000);
  assert.equal(state.time, 600);
  assert.equal(state.shots, 600);
  assert.equal(state.hits + state.misses, 600);
  assert.equal(state.arrows.length, 0);
  assert.equal(state.particles.length, 0);
});

test('1000회 실제 발사와 중간 과잉 입력은 개체 상한·단일 정산·결정성을 지킨다', () => {
  function run() {
    let state = createWorld(1000);
    let frames = 0;
    while (state.shots < 1000) {
      // 한 프레임에 상한보다 많은 요청을 주되 실제 수락된 발사만 1000회 센다.
      for (let attempt = 0; attempt < 12 && state.shots < 1000; attempt += 1) {
        state = state.shots % 2 === 0
          ? assistShot(state)
          : releaseArrow(beginAim(state, state.shots % 3 === 0 ? 0 : 360, 40));
        assertWorldInvariant(state);
      }
      state = advanceWorld(state, 1000 / 60);
      assertWorldInvariant(state);
      frames += 1;
      assert.ok(frames < 100000, '발사가 영구 정체되지 않는다');
    }
    for (let frame = 0; frame < 180; frame += 1) {
      state = advanceWorld(state, 1000 / 60);
      assertWorldInvariant(state);
    }
    assert.equal(state.shots, 1000);
    assert.equal(state.hits + state.misses, 1000);
    assert.ok(state.hits > 0 && state.misses > 0);
    assert.equal(state.arrows.length, 0);
    assert.equal(state.particles.length, 0);
    return { state, frames };
  }
  assert.deepEqual(run(), run());
});

test('폭주 delta 10000회에도 호출당 최대 8스텝·유한 상태·개체 상한을 유지한다', () => {
  const deltas = [Number.MAX_VALUE, 60000, 1e9, NaN, Infinity, -Infinity, -1, 0, STEP_MS / 4, 1000 / 60];
  let state = createWorld(10000);
  for (let i = 0; i < 10000; i += 1) {
    state = assistShot(state);
    const previous = state;
    const dt = deltas[i % deltas.length];
    state = advanceWorld(state, dt);
    assert.ok(state.tick - previous.tick >= 0 && state.tick - previous.tick <= MAX_SUBSTEPS);
    if (!Number.isFinite(dt) || dt <= 0) assert.equal(state, previous);
    assertWorldInvariant(state);
  }
  state = play(60, 3, state);
  assertWorldInvariant(state);
  assert.equal(state.shots, state.hits + state.misses);
});

test('동작 줄이기·pause·resume·reset 100회 순환은 비행 보존과 seed 재현을 유지한다', () => {
  let state = createWorld(909);
  for (let cycle = 0; cycle < 100; cycle += 1) {
    state = advanceWorld(assistShot(state), STEP_MS * 2);
    state = beginAim(state, 120, 90);
    const inFlight = state;
    state = setReducedMotion(state, !state.reducedMotion);
    assert.equal(state.arrows, inFlight.arrows);
    assert.equal(state.aim, inFlight.aim);
    assert.equal(state.target.x, inFlight.target.x);
    assert.equal(state.shots, inFlight.shots);
    state = setPaused(state, true);
    assert.equal(state.aim, null);
    assert.equal(state.arrows, inFlight.arrows);
    assert.equal(state.accumulator, 0);
    assert.equal(advanceWorld(state, Number.MAX_VALUE), state);
    assert.equal(assistShot(state), state);
    state = play(60, 3, setPaused(state, false));
    assertWorldInvariant(state);
    assert.equal(state.shots, state.hits + state.misses);
    const reducedMotion = state.reducedMotion;
    state = resetWorld(state);
    assert.deepEqual(state, createWorld(909, { reducedMotion }));
    assert.deepEqual(play(60, 1, state), play(120, 1, createWorld(909, { reducedMotion })));
    assertWorldInvariant(state);
  }
});
