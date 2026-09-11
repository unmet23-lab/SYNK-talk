import { Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { 색, 폰트 } from './테마';

// 선택 카드와 선택 뒤 말풍선은 같은 행동 그림을 읽는다. 친구·전략을 임의로 대신 고르지 않는다.
const 그림들 = Object.freeze({
  몽글: Object.freeze({
    'g1-사과-대안': require('../assets/교수작업실/mongle-plan.webp'),
    'g1-사과-솔직': require('../assets/교수작업실/mongle-notes.webp'),
    'g1-사과-간결': require('../assets/교수작업실/mongle-letter.webp'),
  }),
  까몽: Object.freeze({
    'g1-사과-대안': require('../assets/교수작업실/kkamong-plan.webp'),
    'g1-사과-솔직': require('../assets/교수작업실/kkamong-notes.webp'),
    'g1-사과-간결': require('../assets/교수작업실/kkamong-letter.webp'),
  }),
  마린: Object.freeze({
    'g1-사과-대안': require('../assets/교수작업실/marin-plan.webp'),
    'g1-사과-솔직': require('../assets/교수작업실/marin-notes.webp'),
    'g1-사과-간결': require('../assets/교수작업실/marin-letter.webp'),
  }),
});
const 행동설명 = Object.freeze({
  'g1-사과-대안': '여러 방법을 살펴보며 할 수 있는 일을 찾고 있어요.',
  'g1-사과-솔직': '노트에 사정을 하나씩 정리하고 있어요.',
  'g1-사과-간결': '편지에 중요한 부탁과 마음을 담고 있어요.',
});
const 아픈그림들 = Object.freeze({
  몽글: require('../assets/교수작업실/mongle-sick.webp'),
  까몽: require('../assets/교수작업실/kkamong-sick.webp'),
});

export function 전략그림찾기(이름, optionId) {
  if (!Object.hasOwn(그림들, 이름) || !Object.hasOwn(그림들[이름], optionId)) return null;
  return { 그림: 그림들[이름][optionId], 설명: `${이름}이 ${행동설명[optionId]}` };
}

export function 상황그림찾기(이름, 상황장면) {
  if (상황장면 !== '아픔' || !Object.hasOwn(아픈그림들, 이름)) return null;
  return { 그림: 아픈그림들[이름], 설명: `${이름}이 아파서 쉬며 아직 제출하지 못한 과제를 걱정하고 있어요.` };
}

/** 작은 프로필 대신 선택한 방법을 행동으로 보여 주는 장면. 글은 이미지 밖에서 읽고 바꾼다. */
export function 가이드전략장면({ 이름, optionId, 말 }) {
  const { width } = useWindowDimensions();
  const 넓다 = width >= 820;
  const 장면 = 전략그림찾기(이름, optionId);
  if (!장면) return null;
  return <View style={[s.전체, 넓다 && s.전체_넓음]}>
    <View style={[s.그림틀, 넓다 && s.그림틀_넓음]}>
      <Image key={`${이름}:${optionId}`} source={장면.그림} accessibilityLabel={장면.설명}
        resizeMode="contain" fadeDuration={0} style={s.그림} />
    </View>
    <View style={[s.말풍선, 넓다 && s.말풍선_넓음]}>
      <View accessible={false} aria-hidden style={[s.꼬리, 넓다 ? s.꼬리_옆 : s.꼬리_위]} />
      <Text style={s.이름}>{이름}</Text>
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
