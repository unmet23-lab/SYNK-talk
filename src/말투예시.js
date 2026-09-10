import { Platform, StyleSheet, Text, View } from 'react-native';
import { 색, 폰트 } from './테마';

// 예문보다 먼저 참고하는 방법을 설명한다. 고르기와 쓰기 화면이 같은 순서로 읽힌다.
export function 말투예시({ 예문 }) {
  if (!예문) return null;
  return <View style={s.전체}>
    <View style={s.제목표}>
      <View style={s.실땀}>
        <Text accessibilityRole="header" style={s.제목}>말투 예시</Text>
      </View>
    </View>
    <Text style={s.안내}>말투를 참고하고, 상황에 맞게 내 방식대로 직접 써 보세요.</Text>
    <View style={s.문장영역}>
      <Text style={s.화자}>교수님께 쓰는 문장</Text>
      <Text selectable style={s.문장}>{예문}</Text>
    </View>
  </View>;
}

const 어절 = Platform.select({ web: { wordBreak: 'keep-all', overflowWrap: 'anywhere' }, default: {} });
const s = StyleSheet.create({
  전체: { gap: 14, padding: 20, borderRadius: 18, backgroundColor: 색.바탕 },
  제목표: { alignSelf: 'flex-start', padding: 4, borderRadius: 12, backgroundColor: 색.실땀 },
  실땀: { borderWidth: 1, borderStyle: 'dashed', borderColor: 색.바탕띄움, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  제목: { fontFamily: 폰트.강조, fontSize: 20, lineHeight: 28, color: 색.바탕띄움, ...어절 },
  안내: { fontFamily: 폰트.캡션, fontSize: 14, lineHeight: 24, color: 색.잉크_보조, ...어절 },
  문장영역: { borderTopWidth: 1, borderColor: 색.잉크_희미, paddingTop: 16, gap: 8 },
  화자: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 20, color: 색.잉크_태그, ...어절 },
  문장: { fontFamily: 폰트.본문, fontSize: 19, lineHeight: 30, color: 색.잉크, ...어절 },
});
