import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { AppState, View } from 'react-native';
import { Canvas, Circle, Group, Line, Path, Skia } from '@shopify/react-native-skia';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { runOnJS, runOnUI, useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { createWorld, advanceWorld, beginAim, moveAim, cancelAim, releaseArrow,
  assistShot, setPaused, setReducedMotion, WORLD_WIDTH, WORLD_HEIGHT } from '../lib/액션실행부.js';
import { 색 } from './테마.js';

/** 운동 루프는 UI 스레드에서만 돈다. React/저장/네트워크는 발사·결과 경계에서만 호출한다. */
export default forwardRef(function 액션운동장({ width, enabled, paused, reducedMotion, seed = 1,
  onShot, onResult, onMetrics, scrollGesture }, ref) {
  const world = useSharedValue(setPaused(createWorld(seed, { reducedMotion }), AppState.currentState !== 'active'));
  const ready = useSharedValue(enabled);
  const stopped = useSharedValue(paused);
  const lastResult = useSharedValue(0);
  const frames = useSharedValue({ n: 0, elapsed: 0, slow: 0, max: 0 });
  const skipFirstFrame = useSharedValue(true);
  useEffect(() => { ready.value = enabled; }, [enabled, ready]);
  useEffect(() => {
    runOnUI((value) => {
      'worklet';
      stopped.value = value;
      world.value = setPaused(world.value, world.value.paused);
      skipFirstFrame.value = true;
      frames.value = { n: 0, elapsed: 0, slow: 0, max: 0 };
    })(paused);
  }, [paused, stopped, world, skipFirstFrame, frames]);
  useEffect(() => {
    runOnUI((value) => {
      'worklet';
      world.value = setPaused(createWorld(value, { reducedMotion: world.value.reducedMotion }), world.value.paused);
      lastResult.value = 0;
      skipFirstFrame.value = true;
      frames.value = { n: 0, elapsed: 0, slow: 0, max: 0 };
    })(seed);
  }, [seed, world, lastResult, skipFirstFrame, frames]);
  useEffect(() => {
    runOnUI((value) => { 'worklet'; world.value = setReducedMotion(world.value, value); })(reducedMotion);
  }, [reducedMotion, world]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      runOnUI((active) => {
        'worklet';
        world.value = setPaused(world.value, !active);
        skipFirstFrame.value = true;
        frames.value = { n: 0, elapsed: 0, slow: 0, max: 0 };
      })(state === 'active');
    });
    return () => sub.remove();
  }, [world, skipFirstFrame, frames]);
  useImperativeHandle(ref, () => ({ fire() {
    runOnUI(() => {
      'worklet';
      if (!ready.value || stopped.value || world.value.paused || world.value.arrows.length) return;
      const next = assistShot(world.value);
      if (next.shots !== world.value.shots) { world.value = next; runOnJS(onShot)(); }
    })();
  } }), [onShot, world, ready, stopped]);

  useFrameCallback(({ timeSincePreviousFrame }) => {
    if (stopped.value || world.value.paused) return;
    // 복귀 간격은 운동 시간도 렌더 성능도 아니다. 첫 프레임은 기준점만 새로 잡는다.
    if (skipFirstFrame.value || timeSincePreviousFrame == null) {
      skipFirstFrame.value = false;
      return;
    }
    const next = advanceWorld(world.value, timeSincePreviousFrame);
    world.value = next;
    if (next.lastResult && next.lastResult.shotId !== lastResult.value) {
      lastResult.value = next.lastResult.shotId;
      runOnJS(onResult)(next.lastResult);
    }
    const f = frames.value;
    const n = f.n + 1, elapsed = f.elapsed + timeSincePreviousFrame;
    const slow = f.slow + (timeSincePreviousFrame > 20 ? 1 : 0);
    const max = Math.max(f.max, timeSincePreviousFrame);
    if (elapsed >= 1000) {
      if (onMetrics) runOnJS(onMetrics)({ fps: Math.round(n * 1000 / elapsed), slow, maxMs: Math.round(max), renderer: 'native-ui-skia' });
      frames.value = { n: 0, elapsed: 0, slow: 0, max: 0 };
    } else frames.value = { n, elapsed, slow, max };
  });
  const scale = width / WORLD_WIDTH;
  const gesture = usePanGesture({
    minDistance: 1, maxPointers: 1,
    block: scrollGesture,
    onActivate: (e) => {
      'worklet';
      if (ready.value && !stopped.value && !world.value.arrows.length) world.value = beginAim(world.value, e.x / scale, e.y / scale);
    },
    onUpdate: (e) => {
      'worklet';
      if (e.numberOfPointers !== 1 || !ready.value || stopped.value) {
        world.value = cancelAim(world.value); return;
      }
      world.value = moveAim(world.value, e.x / scale, e.y / scale);
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.canceled || !ready.value || stopped.value) { world.value = cancelAim(world.value); return; }
      const next = releaseArrow(world.value);
      if (next.shots !== world.value.shots) { world.value = next; runOnJS(onShot)(); }
    },
  });
  const targetX = useDerivedValue(() => world.value.target.x);
  const targetY = useDerivedValue(() => world.value.target.y);
  const arrowPath = useDerivedValue(() => {
    const path = Skia.PathBuilder.Make();
    for (const a of world.value.arrows) {
      const l = Math.sqrt(a.vx * a.vx + a.vy * a.vy) || 1;
      const dx = a.vx / l, dy = a.vy / l;
      path.moveTo(a.x - dx * 22, a.y - dy * 22); path.lineTo(a.x, a.y);
      path.lineTo(a.x - dx * 7 - dy * 4, a.y - dy * 7 + dx * 4);
      path.moveTo(a.x, a.y); path.lineTo(a.x - dx * 7 + dy * 4, a.y - dy * 7 - dx * 4);
    }
    return path.detach();
  });
  const particles = useDerivedValue(() => {
    const path = Skia.PathBuilder.Make();
    for (const p of world.value.particles) path.addCircle(p.x, p.y, Math.max(0, p.life * 5));
    return path.detach();
  });
  const aimPath = useDerivedValue(() => {
    const path = Skia.PathBuilder.Make();
    const w = world.value;
    if (w.aim) { path.moveTo(w.bow.x, w.bow.y); path.lineTo(w.aim.x, w.aim.y); path.addCircle(w.aim.x, w.aim.y, 7); }
    return path.detach();
  });
  return <GestureDetector gesture={gesture}>
      <View collapsable={false} accessible={false} style={{ width, height: WORLD_HEIGHT * scale }}>
        <Canvas style={{ flex: 1 }} pointerEvents="none">
          <Group transform={[{ scale }]}>
            <Circle cx={180} cy={190} r={165} color={색.바탕띄움} opacity={0.4} />
            <Line p1={{ x: 28, y: 332 }} p2={{ x: 332, y: 332 }} color={색.잉크_희미} strokeWidth={1} />
            <Circle cx={targetX} cy={targetY} r={32} color={색.바탕띄움} />
            <Circle cx={targetX} cy={targetY} r={26} color={색.실땀} style="stroke" strokeWidth={2} />
            <Circle cx={targetX} cy={targetY} r={17} color={색.실땀} style="stroke" strokeWidth={2} />
            <Circle cx={targetX} cy={targetY} r={8} color={색.신호} />
            <Path path={aimPath} color={색.잉크_서브} strokeWidth={1} style="stroke" />
            <Path path={arrowPath} color={색.잉크} strokeWidth={2.5} style="stroke" />
            <Path path={particles} color={색.실땀} />
            <Circle cx={180} cy={376} r={15} color={색.실땀} strokeWidth={2} style="stroke" />
            <Circle cx={180} cy={376} r={5} color={색.잉크} />
          </Group>
        </Canvas>
      </View>
    </GestureDetector>;
});
