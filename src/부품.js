'use strict';
/**
 * 부품 — Loom 이 구운 펠트 UI 조각을 «화면에 세우는» 한 통로 (08-28).
 *
 * ■ 왜 이 파일이 있나
 *   `assets/부품/` 에 28장이 서 있는데, 화면마다 `require` 와 가로세로비를 따로 적으면
 *   그 수가 곧 여러 곳에 산다. 치수는 **자른 이**(`tools/부품변환.py`)가 `치수.json` 에 적고
 *   화면은 이름만 부른다.
 *
 * ■ 🔴 여기 «쓰는 것만» 적는다 — 28장을 다 적지 않는다
 *   Metro 는 `require` 된 자산만 번들에 싣는다. 안 쓰는 24장을 여기 적으면 학생 앱이
 *   그만큼 무거워진다(장당 100~240KB). **자리가 정해진 것만 한 줄씩 는다.**
 *
 * ■ 🔑 왜 28장 중 이것뿐인가 (08-28 조사 · 유호 「어디에 쓸지 정해서 배선해줘」)
 *   구운 28장은 **UI 사전**이지 앱 부품이 아니었다. 셋으로 갈린다 —
 *   ①**값이 그림에 구워진 것 9**(뱃지 1·3·12 · 스테퍼 2·4·7 · 슬라이더 025·058·085):
 *     그림이 «임의의 수»를 못 보여주니 데이터에 못 붙는다.
 *   ②**앱에 그 조작이 없는 것 9**(모달·토스트·탭전환·스와이프·드래그·풀다운·라디오·
 *     단추위계·고르개): 실측 — `Modal` 0벌 · `toast` 0벌 · 그 제스처 0벌.
 *   ③**화면 규율이 막는 것**: 답장화면은 「🚫 면·배지를 안 만든다 — 배지는 점수의 다른
 *     이름이다(철학 Ⅱ-8)」, 어제의나는 「색을 더하지 않고 밀도로만 위계를 준다(R2)」,
 *     여러 화면이 「신호 1점」(테마 R1)을 진다. **앱이 일부러 비어 있다.**
 *   ⇒ 그래서 «화면이 이미 말하려는 것을 그림이 대신 말해 주는» 자리만 골랐다.
 *     나머지는 자리가 서는 날 한 줄씩 는다 — 억지로 넣는 것은 명품화가 아니라 장식이다.
 */
import { Image, StyleSheet, View } from 'react-native';

const 치수 = require('../assets/부품/치수.json');

/* 이름 → 자산. **자리가 정해진 것만** 있다(위 🔴). */
const 그림 = {
  내려놓은바늘: require('../assets/부품/구조2/내려놓은바늘.webp'),
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
