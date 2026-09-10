import { Image, StyleSheet, View } from 'react-native';
import { use장면깜빡임 } from './살아있는가이드';

const 연구실 = require('../assets/교수작업실/research.webp');
const 눈감음 = require('../assets/교수작업실/research-blink.webp');

// 원본 1672×941의 안경 안쪽만 표시한다. 전환 밖의 털·몸·방은 원본 그대로다.
// 전체 감은 눈 장면을 교체하면 생성 과정의 작은 변화까지 깜빡거리므로 사용하지 않는다.
export const 교수눈영역 = Object.freeze([
  Object.freeze({ x: 945, y: 400, width: 70, height: 74 }),
  Object.freeze({ x: 1075, y: 434, width: 70, height: 74 }),
]);

export function 살아있는교수연구실({ width, style, 멈춤 = false }) {
  const 감음 = use장면깜빡임({ 멈춤, 지연: 2200 });
  const 배율 = Math.max(0, width) / 1672;
  const height = width * 941 / 1672;
  return <View style={[{ width, height }, style]} testID="살아있는교수연구실">
    <Image source={연구실} resizeMode="contain" style={{ width, height }}
      accessibilityLabel="안경 쓴 펠트 교수님이 연구실에서 편지를 기다리며 가끔 눈을 깜빡여요" />
    {교수눈영역.map((눈, i) => <View key={i} pointerEvents="none" accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" testID={`교수눈-${i}`}
      style={[s.눈영역, { left: 눈.x * 배율, top: 눈.y * 배율,
        width: 눈.width * 배율, height: 눈.height * 배율, opacity: 감음 ? 1 : 0 }]}>
      <Image source={눈감음} resizeMode="stretch" fadeDuration={0} accessible={false}
        style={{ position: 'absolute', width, height, left: -눈.x * 배율, top: -눈.y * 배율 }} />
    </View>)}
  </View>;
}

// 받는 사람 표식도 연구실의 같은 교수와 같은 눈을 쓴다.
export function 살아있는교수얼굴({ size = 52, 멈춤 = false }) {
  const 비율 = size / 520;
  return <View accessible accessibilityRole="image" accessibilityLabel="교수님"
    style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: -790 * 비율, top: -190 * 비율 }}>
      <살아있는교수연구실 width={1672 * 비율} 멈춤={멈춤} />
    </View>
  </View>;
}

const s = StyleSheet.create({ 눈영역: { position: 'absolute', overflow: 'hidden', borderRadius: 999 } });
