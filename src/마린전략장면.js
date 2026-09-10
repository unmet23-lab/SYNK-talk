import { Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { 색, 폰트 } from './테마';

// 세 전략은 서로 다른 행동을 보여 준다. 지원하지 않는 선택에는 다른 장면을 대신 얹지 않는다.
const 장면들 = Object.freeze({
  'g1-사과-대안': {
    그림: require('../assets/교수작업실/marin-plan.webp'),
    설명: '마린이 여러 방법을 살펴보며 할 수 있는 일을 찾고 있어요.',
  },
  'g1-사과-솔직': {
    그림: require('../assets/교수작업실/marin-notes.webp'),
    설명: '마린이 노트에 사정을 하나씩 정리하고 있어요.',
  },
  'g1-사과-간결': {
    그림: require('../assets/교수작업실/marin-letter.webp'),
    설명: '마린이 편지에 중요한 부탁과 마음을 담고 있어요.',
  },
});

/** 작은 프로필 대신 선택한 방법을 행동으로 보여 주는 장면. 글은 이미지 밖에서 읽고 바꾼다. */
export function 마린전략장면({ optionId, 말 }) {
  const { width } = useWindowDimensions();
  const 넓다 = width >= 820;
  const 장면 = Object.hasOwn(장면들, optionId) ? 장면들[optionId] : null;
  if (!장면) return null;
  return <View style={[s.전체, 넓다 && s.전체_넓음]}>
    <View style={[s.그림틀, 넓다 && s.그림틀_넓음]}>
      <Image key={optionId} source={장면.그림} accessibilityLabel={장면.설명}
        resizeMode="contain" fadeDuration={0} style={s.그림} />
    </View>
    <View style={[s.말풍선, 넓다 && s.말풍선_넓음]}>
      <View accessible={false} aria-hidden style={[s.꼬리, 넓다 ? s.꼬리_옆 : s.꼬리_위]} />
      <Text style={s.이름}>마린</Text>
      <Text style={s.말}>{말}</Text>
    </View>
  </View>;
}

const 어절 = Platform.select({ web: { wordBreak: 'keep-all', overflowWrap: 'anywhere' }, default: {} });
const s = StyleSheet.create({
  전체: { gap: 16, paddingVertical: 4, alignItems: 'center' },
  전체_넓음: { flexDirection: 'row', gap: 24 },
  그림틀: { width: '100%', maxWidth: 360, aspectRatio: 1.5, borderRadius: 18, overflow: 'hidden' },
  그림틀_넓음: { width: 340, flexShrink: 0 },
  그림: { width: '100%', height: '100%' },
  말풍선: { width: '100%', padding: 22, borderRadius: 20, gap: 8, backgroundColor: 색.바탕 },
  말풍선_넓음: { flex: 1, width: 'auto', minWidth: 0 },
  꼬리: { position: 'absolute', width: 16, height: 16, backgroundColor: 색.바탕, transform: [{ rotate: '45deg' }] },
  꼬리_옆: { left: -7, top: '46%' },
  꼬리_위: { top: -7, left: '48%' },
  이름: { fontFamily: 폰트.강조, fontSize: 12, lineHeight: 19, color: 색.실땀 },
  말: { fontFamily: 폰트.본문, fontSize: 17, lineHeight: 28, color: 색.잉크, ...어절 },
});
