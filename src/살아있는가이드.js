// 몸은 현행 1024 본체로 고정한다. 표정은 각 눈·렌즈 안에서만 바뀐다.
// 좌표·출처: assets/브랜드/가이드눈마스크.json · 생명감 설계 §1-a.
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, Platform, View } from 'react-native';
import { use줄임 } from '../lib/모션.js';
import { 지금녹음중 } from './소리.js';
import { 가이드그림 } from './브랜드자산.js';
import 마스크 from '../assets/브랜드/가이드눈마스크.json';

const 감은눈 = Object.freeze({
  몽글: require('../assets/마스코트/몽글_눈감음.webp'),
  까몽: require('../assets/마스코트/까몽_눈감음.webp'),
  마린: require('../assets/마스코트/마린_눈감음.webp'),
});

function 문서보임() {
  const 문서 = globalThis.document;
  return !문서 || 문서.visibilityState !== 'hidden';
}

function use장면정지(멈춤) {
  const 줄임 = use줄임();
  const [앞에있음, set앞에있음] = useState(() => (
    (!AppState.currentState || AppState.currentState === 'active') && 문서보임()
  ));
  useEffect(() => {
    const 문서 = globalThis.document;
    const 확인 = () => set앞에있음(
      (!AppState.currentState || AppState.currentState === 'active') && 문서보임(),
    );
    const 구독 = AppState.addEventListener('change', 확인);
    문서?.addEventListener('visibilitychange', 확인);
    확인();
    return () => {
      구독?.remove();
      문서?.removeEventListener('visibilitychange', 확인);
    };
  }, []);
  return !!멈춤 || 줄임 || !앞에있음;
}

/** 교수·가이드 공용. 멈춤은 녹음 상태의 즉시 반영 경로다. */
export function use장면깜빡임({ 멈춤 = false, 지연 = 2400 } = {}) {
  const 정지 = use장면정지(멈춤);
  const [깜빡중, set깜빡중] = useState(false);
  useEffect(() => {
    set깜빡중(false);
    if (정지) return undefined;
    let 살아있음 = true;
    let 타이머;
    const 기다림 = () => { 타이머 = setTimeout(감기, 6400 + Math.random() * 1600); };
    const 감기 = () => {
      if (!살아있음) return;
      // 예약 뒤 시작한 녹음·배경 전환도 다시 확인한다.
      if (지금녹음중() || !문서보임() || (AppState.currentState && AppState.currentState !== 'active')) {
        기다림();
        return;
      }
      set깜빡중(true);
      타이머 = setTimeout(() => {
        if (!살아있음) return;
        set깜빡중(false);
        기다림();
      }, 140);
    };
    타이머 = setTimeout(감기, Math.max(0, Number.isFinite(지연) ? 지연 : 2400));
    return () => { 살아있음 = false; clearTimeout(타이머); };
  }, [정지, 지연]);
  return !정지 && !지금녹음중() && 깜빡중;
}

function 가이드몸({ 이름, size, style, 멈춤 }) {
  const 정지 = use장면정지(멈춤);
  const 깜빡중 = use장면깜빡임({ 멈춤, 지연: { 몽글: 2600, 까몽: 2800, 마린: 3000 }[이름] });
  const 숨 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    숨.setValue(0);
    if (정지 || 지금녹음중()) return undefined;
    const 들숨 = Animated.loop(Animated.sequence([
      Animated.timing(숨, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
      Animated.timing(숨, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
    ]));
    들숨.start();
    return () => { 들숨.stop(); 숨.setValue(0); };
  }, [정지, 숨]);
  const 비율 = size / 1024;
  return (
    <View style={[{ width: size, height: size, pointerEvents: 'none' }, style]} accessible={false}>
      <Animated.View style={{ width: size, height: size, transform: [{ translateY: 숨.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.008] }) }] }}>
        <Image source={가이드그림[이름]} style={{ width: size, height: size }} resizeMode="contain" fadeDuration={0} accessible={false} />
        {마스크.characters[이름].eyes.map(({ target, offset, scale = 1 }, i) => (
          <View key={i} style={{ position: 'absolute', left: target[0] * 비율, top: target[1] * 비율, width: target[2] * 비율, height: target[3] * 비율, borderRadius: '50%', overflow: 'hidden', opacity: 깜빡중 ? 1 : 0 }}>
            <Image source={감은눈[이름]} style={{ position: 'absolute', left: (-target[0] + offset[0]) * 비율, top: (-target[1] + offset[1]) * 비율, width: size * scale, height: size * scale }} resizeMode="stretch" fadeDuration={0} accessible={false} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

/** 선택하지 않은 가이드는 만들지 않는다. 이름 변경은 이전 깜빡임·호흡을 정리한다. */
export function 살아있는가이드({ 이름, size = 88, style, 멈춤 = false }) {
  if (!Object.prototype.hasOwnProperty.call(가이드그림, 이름)) return null;
  const 크기 = Number.isFinite(size) && size > 0 ? size : 88;
  return <가이드몸 key={이름} 이름={이름} size={크기} style={style} 멈춤={멈춤} />;
}
