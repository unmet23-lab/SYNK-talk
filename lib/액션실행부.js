'use strict';

/** 활쏘기 운동 실행부. 학습 정오·학생 상태·네트워크와 무관하다.
 * 좌표는 360×420, 입력 deltaMs는 밀리초. 모든 상태 변경은 새 값을 반환한다.
 * UI는 Reanimated shared value에서 실행하고 React 상태에는 샷 결과만 전달한다.
 */
const WORLD_WIDTH = 360;
const WORLD_HEIGHT = 420;
const STEP_MS = 1000 / 120;
const MAX_SUBSTEPS = 8;
const MAX_FRAME_MS = STEP_MS * MAX_SUBSTEPS;
const MAX_ARROWS = 4;
const MAX_PARTICLES = 48;

function clamp(value, min, max) {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

function nextRandom(seed) {
  'worklet';
  let value = seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function createWorld(seed = 1, options = {}) {
  'worklet';
  const normalizedSeed = (Number.isFinite(seed) ? seed >>> 0 : 1) || 1;
  const rng = nextRandom(normalizedSeed);
  const phase = rng / 4294967296 * Math.PI * 2;
  const reducedMotion = !!(options && options.reducedMotion);
  return {
    seed: normalizedSeed, rng, tick: 0, time: 0, accumulator: 0, paused: false,
    reducedMotion,
    bow: { x: 180, y: 376 },
    target: { x: 180 + Math.sin(phase) * 96, y: 96, radius: 23, phase, speed: reducedMotion ? 0 : 1.35 },
    aim: null, arrows: [], particles: [], shots: 0, hits: 0, misses: 0,
    lastResult: null,
  };
}

function resetWorld(state, seed) {
  'worklet';
  return createWorld(seed === undefined ? state.seed : seed, { reducedMotion: state.reducedMotion });
}

function setPaused(state, paused) {
  'worklet';
  // 재개 시 손을 뗀 오래된 제스처나 누적 시간을 재생하지 않는다.
  return { ...state, paused: !!paused, accumulator: 0, aim: null };
}

/** 설정 변경은 진행 중인 샷을 초기화하지 않는다. 위상을 옮겨 과녁 현재 위치를 잇는다. */
function setReducedMotion(state, reducedMotion) {
  'worklet';
  const reduced = !!reducedMotion;
  if (state.reducedMotion === reduced) return state;
  const speed = reduced ? 0 : 1.35;
  const phase = state.target.phase + state.time * (state.target.speed - speed);
  return { ...state, reducedMotion: reduced,
    target: { ...state.target, phase, speed },
    particles: reduced ? [] : state.particles };
}

function beginAim(state, x, y) {
  'worklet';
  if (state.paused || !Number.isFinite(x) || !Number.isFinite(y)) return state;
  const aimX = clamp(x, 0, WORLD_WIDTH);
  const aimY = clamp(y, 0, state.bow.y - 12);
  const dx = aimX - state.bow.x;
  const dy = aimY - state.bow.y;
  return { ...state, aim: { x: aimX, y: aimY, pull: clamp(Math.sqrt(dx * dx + dy * dy) / 280, 0.15, 1) } };
}

function moveAim(state, x, y) {
  'worklet';
  return state.aim ? beginAim(state, x, y) : state;
}

function cancelAim(state) {
  'worklet';
  return state.aim ? { ...state, aim: null } : state;
}

function releaseArrow(state) {
  'worklet';
  if (state.paused || !state.aim) return state;
  if (state.arrows.length >= MAX_ARROWS) return cancelAim(state);
  const dx = state.aim.x - state.bow.x;
  const dy = state.aim.y - state.bow.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const speed = 900 + state.aim.pull * 700;
  const shotId = state.shots + 1;
  const arrow = {
    id: shotId, x: state.bow.x, y: state.bow.y,
    vx: dx / length * speed, vy: dy / length * speed, age: 0,
  };
  return { ...state, aim: null, arrows: [...state.arrows, arrow], shots: shotId };
}

/** 키보드·스크린리더용 보조 발사. 미래 표적 위치와 같은 고정스텝 중력을 역산한다.
 * 한국어 답을 판정하거나 학습 성공을 만들지 않는다. 운동 장벽만 낮춘다.
 */
function assistShot(state) {
  'worklet';
  if (state.paused) return state;
  if (state.arrows.length >= MAX_ARROWS) return cancelAim(state);
  const steps = 24;
  const dt = STEP_MS / 1000;
  const duration = steps * dt;
  const futureTime = (state.tick + steps) * dt;
  const targetX = state.target.speed === 0 ? state.target.x
    : 180 + Math.sin(state.target.phase + futureTime * state.target.speed) * 96;
  const shotId = state.shots + 1;
  const arrow = {
    id: shotId, x: state.bow.x, y: state.bow.y,
    vx: (targetX - state.bow.x) / duration,
    vy: (state.target.y - state.bow.y) / duration - 90 * dt * (steps - 1) / 2,
    age: 0,
  };
  return { ...state, aim: null, arrows: [...state.arrows, arrow], shots: shotId };
}

/** 선분이 원에 처음 닿는 비율 0~1, 안 닿으면 null. 빠른 화살도 표적을 통과하지 않는다. */
function segmentCircleHit(x0, y0, x1, y1, cx, cy, radius) {
  'worklet';
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1)
      || !Number.isFinite(y1) || !Number.isFinite(cx) || !Number.isFinite(cy)
      || !Number.isFinite(radius) || radius < 0) return null;
  const ox = x0 - cx;
  const oy = y0 - cy;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (ox * dx + oy * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

function fixedStep(state) {
  'worklet';
  const dt = STEP_MS / 1000;
  const tick = state.tick + 1;
  const time = tick * dt;
  const target = { ...state.target, x: state.target.speed === 0 ? state.target.x
    : 180 + Math.sin(state.target.phase + time * state.target.speed) * 96 };
  const arrows = [];
  let particles = [];
  let hits = state.hits;
  let misses = state.misses;
  let rng = state.rng;
  let lastResult = state.lastResult;
  for (let i = 0; i < state.particles.length; i += 1) {
    const p = state.particles[i];
    const life = p.life - dt;
    if (life > 0) particles.push({ ...p, life, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 90 * dt });
  }
  for (let i = 0; i < state.arrows.length; i += 1) {
    const a = state.arrows[i];
    const x = a.x + a.vx * dt;
    const y = a.y + a.vy * dt;
    const age = a.age + dt;
    // 표적도 움직이므로 양쪽의 상대 이동 선분을 원점의 원과 교차한다.
    const t = segmentCircleHit(a.x - state.target.x, a.y - state.target.y,
      x - target.x, y - target.y, 0, 0, target.radius + 2);
    if (t !== null) {
      hits += 1;
      const hitX = a.x + (x - a.x) * t;
      const hitY = a.y + (y - a.y) * t;
      lastResult = { kind: 'hit', shotId: a.id, x: hitX, y: hitY };
      for (let j = 0; j < (state.reducedMotion ? 0 : 12); j += 1) {
        rng = nextRandom(rng);
        const angle = rng / 4294967296 * Math.PI * 2;
        rng = nextRandom(rng);
        const speed = 35 + rng / 4294967296 * 90;
        particles.push({ id: a.id * 12 + j, x: hitX, y: hitY,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.45 });
      }
    } else if (x < -32 || x > WORLD_WIDTH + 32 || y < -32 || y > WORLD_HEIGHT + 32 || age >= 2) {
      misses += 1;
      lastResult = { kind: 'miss', shotId: a.id, x, y };
    } else {
      arrows.push({ ...a, x, y, age, vy: a.vy + 90 * dt });
    }
  }
  if (particles.length > MAX_PARTICLES) particles = particles.slice(particles.length - MAX_PARTICLES);
  return { ...state, tick, time, target, arrows, particles, hits, misses, rng, lastResult };
}

function advanceWorld(state, deltaMs) {
  'worklet';
  if (state.paused || !Number.isFinite(deltaMs) || deltaMs <= 0) return state;
  let accumulator = state.accumulator + Math.min(deltaMs, MAX_FRAME_MS);
  let next = state;
  let count = 0;
  // 동일한 총 경과 시간은 30/60/120Hz에서 같은 고정 스텝 수가 된다.
  while (accumulator + 1e-7 >= STEP_MS && count < MAX_SUBSTEPS) {
    next = fixedStep(next);
    accumulator -= STEP_MS;
    count += 1;
  }
  // 장시간 복귀의 밀린 시간을 다음 프레임으로 떠넘기지 않는다.
  accumulator = Math.max(0, accumulator % STEP_MS);
  return { ...next, accumulator };
}

module.exports = {
  WORLD_WIDTH, WORLD_HEIGHT, STEP_MS, MAX_SUBSTEPS, MAX_FRAME_MS, MAX_ARROWS, MAX_PARTICLES,
  createWorld, resetWorld, setPaused, setReducedMotion, beginAim, moveAim, cancelAim, releaseArrow,
  assistShot, segmentCircleHit, advanceWorld,
};
