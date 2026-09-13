'use strict';
/**
 * Loom 정적 부품을 이름과 변환 치수로 화면에 연결한다.
 * 원천: SYNK-appsscript docs/Loom_엔진_설계.md §6 앱 반입 계약과 현재 DESIGN.
 * 자산은 tools/부품변환.py → assets/부품/치수.json·이미지 → 아래 그림 표를 거친다.
 * 실제 화면의 사용처·테마·대비·무게·동적 상태를 함께 확인하고 필요한 자산을 연결한다.
 * 공방 이름과 화면 라우팅은 다를 수 있으므로 현재 import·소비 코드를 읽는다.
 * 과거 미사용 자산 수·화면 부재·색 면적 실측을 새 부품이나 화면의 영구 금지로 삼지 않는다.
 * 게임 인물의 숨은 수치 비노출은 해당 게임 계약이며 모든 진행 안내 금지가 아니다.
 */
import { Image, StyleSheet, View } from 'react-native';

const 치수 = require('../assets/부품/치수.json');

/* 실제 화면에서 사용하는 이름 → 자산. 치수는 변환기 장부를 읽는다. */
const 그림 = {
  내려놓은바늘: require('../assets/부품/구조2/내려놓은바늘.webp'),
  /* 구분선은 동적 값을 포함하지 않는 공용 자산이다. */
  구분선: require('../assets/부품/구분선/구분선.webp'),
};

/**
 * @param {keyof 그림} 이름
 * @param {number} 폭   가로 px. 세로는 «자른 이»가 적은 치수가 정한다.
 */
export default function 부품({ 이름, 폭 = 220, 스타일, 설명 = null }) {
  const 그것 = 그림[이름];
  if (!그것) throw new Error(`🔴 부품 «${이름}» 이 없다 — src/부품.js 에 한 줄 늘려야 한다`);
  const 잰것 = 치수[`구조2/${이름}`] || 치수[Object.keys(치수).find((k) => k.endsWith(`/${이름}`))];
  if (!잰것) throw new Error(`🔴 치수장부에 «${이름}» 이 없다 — python tools/부품변환.py 를 돌려라`);
  return (
    <View
      style={[{ width: 폭, height: Math.round((폭 * 잰것[1]) / 잰것[0]) }, 스타일]}
      accessible={!!설명}
      accessibilityRole={설명 ? 'image' : 'none'}
      accessibilityLabel={설명 || undefined}
    >
      <Image source={그것} style={s.그림} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

const s = StyleSheet.create({
  그림: { width: '100%', height: '100%' },
});
