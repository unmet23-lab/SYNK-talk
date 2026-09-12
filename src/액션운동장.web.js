import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createWorld, advanceWorld, beginAim, moveAim, cancelAim, releaseArrow,
  assistShot, setPaused, setReducedMotion, WORLD_WIDTH, WORLD_HEIGHT } from '../lib/액션실행부.js';
import { 색 } from './테마.js';

/** 웹은 같은 물리 코어+Canvas2D. 이 FPS를 네이티브 UI 스레드 성능으로 보고하지 않는다. */
export default forwardRef(function 액션운동장(props, ref) {
  const { width, reducedMotion, seed = 1 } = props;
  const canvas = useRef(null), latest = useRef(props);
  latest.current = props;
  const world = useRef(setPaused(createWorld(seed, { reducedMotion }), document.hidden));
  const pointer = useRef(null);
  const frameClock = useRef({ previous: null, n: 0, elapsed: 0, slow: 0, max: 0 });
  const clearFrameClock = () => { frameClock.current = { previous: null, n: 0, elapsed: 0, slow: 0, max: 0 }; };
  useEffect(() => {
    world.current = setPaused(createWorld(seed, { reducedMotion: latest.current.reducedMotion }), document.hidden);
    pointer.current = null; clearFrameClock();
  }, [seed]);
  useEffect(() => { world.current = setReducedMotion(world.current, reducedMotion); }, [reducedMotion]);
  useEffect(() => {
    world.current = setPaused(world.current, world.current.paused);
    pointer.current = null; clearFrameClock();
  }, [props.paused]);
  const shoot = (assist = false) => {
    if (!latest.current.enabled || latest.current.paused || world.current.paused || world.current.arrows.length) return;
    const next = assist ? assistShot(world.current) : releaseArrow(world.current);
    if (next.shots !== world.current.shots) { world.current = next; latest.current.onShot(); }
  };
  useImperativeHandle(ref, () => ({ fire: () => shoot(true) }));
  useEffect(() => {
    const el = canvas.current, ctx = el.getContext('2d');
    let raf, resultId = 0;
    const visibility = () => {
      world.current = setPaused(world.current, document.hidden); pointer.current = null; clearFrameClock();
    };
    document.addEventListener('visibilitychange', visibility);
    const frame = (time) => {
      const clock = frameClock.current;
      const dt = clock.previous == null ? 0 : time - clock.previous; clock.previous = time;
      if (!latest.current.paused && !document.hidden) world.current = advanceWorld(world.current, dt);
      const w = world.current;
      if (w.lastResult && w.lastResult.shotId !== resultId) {
        resultId = w.lastResult.shotId; latest.current.onResult(w.lastResult);
      }
      if (dt > 0 && !latest.current.paused && !document.hidden) {
        clock.n++; clock.elapsed += dt; clock.slow += dt > 20 ? 1 : 0; clock.max = Math.max(clock.max, dt);
        if (clock.elapsed >= 1000) {
          latest.current.onMetrics?.({ fps: Math.round(clock.n * 1000 / clock.elapsed), slow: clock.slow,
            maxMs: Math.round(clock.max), renderer: 'web-canvas' });
          clock.n = 0; clock.elapsed = 0; clock.slow = 0; clock.max = 0;
        }
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixels = Math.round(latest.current.width * dpr);
      if (el.width !== pixels) { el.width = pixels; el.height = Math.round(pixels * WORLD_HEIGHT / WORLD_WIDTH); }
      ctx.setTransform(el.width / WORLD_WIDTH, 0, 0, el.height / WORLD_HEIGHT, 0, 0);
      ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      const ring = (x, y, r, color, fill = false, lineWidth = 2) => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = color;
        ctx.fillStyle = color; ctx.lineWidth = lineWidth; fill ? ctx.fill() : ctx.stroke();
      };
      ctx.globalAlpha = 0.4; ring(180, 190, 165, 색.바탕띄움, true); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(28, 332); ctx.lineTo(332, 332); ctx.strokeStyle = 색.잉크_희미; ctx.lineWidth = 1; ctx.stroke();
      ring(w.target.x, w.target.y, 32, 색.바탕띄움, true);
      ring(w.target.x, w.target.y, 26, 색.실땀); ring(w.target.x, w.target.y, 17, 색.실땀);
      ring(w.target.x, w.target.y, 8, 색.신호, true);
      if (w.aim) {
        ctx.beginPath(); ctx.moveTo(w.bow.x, w.bow.y); ctx.lineTo(w.aim.x, w.aim.y);
        ctx.strokeStyle = 색.잉크_서브; ctx.lineWidth = 1; ctx.stroke(); ring(w.aim.x, w.aim.y, 7, 색.잉크_서브, false, 1);
      }
      for (const a of w.arrows) {
        const l = Math.hypot(a.vx, a.vy) || 1, dx = a.vx / l, dy = a.vy / l;
        ctx.beginPath(); ctx.moveTo(a.x - dx * 22, a.y - dy * 22); ctx.lineTo(a.x, a.y);
        ctx.lineTo(a.x - dx * 7 - dy * 4, a.y - dy * 7 + dx * 4); ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x - dx * 7 + dy * 4, a.y - dy * 7 - dx * 4);
        ctx.strokeStyle = 색.잉크; ctx.lineWidth = 2.5; ctx.stroke();
      }
      for (const p of w.particles) ring(p.x, p.y, Math.max(0, p.life * 5), 색.실땀, true);
      ring(180, 376, 15, 색.실땀); ring(180, 376, 5, 색.잉크, true);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visibility); };
  }, [seed]);
  const coords = (e) => {
    const box = canvas.current.getBoundingClientRect();
    return [(e.clientX - box.left) / box.width * WORLD_WIDTH, (e.clientY - box.top) / box.height * WORLD_HEIGHT];
  };
  const cancel = () => { pointer.current = null; world.current = cancelAim(world.current); };
  return createElement('canvas', {
    ref: canvas, 'aria-hidden': true,
    style: { width, height: width * WORLD_HEIGHT / WORLD_WIDTH, display: 'block', touchAction: 'none' },
    onPointerDown: (e) => {
      if ((pointer.current != null && pointer.current !== e.pointerId) || !e.isPrimary) {
        cancel(); return; // 두 번째 손가락이 들어오면 첫 손의 release도 발사하지 않는다.
      }
      if (pointer.current != null || !latest.current.enabled || latest.current.paused || world.current.arrows.length || !e.isPrimary) return;
      pointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId);
      world.current = beginAim(world.current, ...coords(e));
    },
    onPointerMove: (e) => { if (pointer.current === e.pointerId) world.current = moveAim(world.current, ...coords(e)); },
    onPointerUp: (e) => { if (pointer.current === e.pointerId) { shoot(); cancel(); } },
    onPointerCancel: cancel, onLostPointerCapture: cancel,
  });
});
