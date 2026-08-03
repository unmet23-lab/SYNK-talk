import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import 말하기화면 from './src/말하기화면';
import 도착확인 from './src/도착확인';
import { 색, 폰트, 모노트래킹 } from './src/테마';

/**
 * 앱 루트 — 화면은 둘뿐이다: 말하기(기본) / 도착확인(시스템).
 * 내비게이션 라이브러리를 넣지 않은 것은 의도다 — 학생 앱의 동사는 하나다(설계 §1).
 */
export default function App() {
  const [화면, set화면] = useState('말하기');
  const [fontsLoaded] = useFonts({
    'SUIT-Regular': require('./assets/fonts/SUIT-Regular.ttf'),
    'SUIT-Medium': require('./assets/fonts/SUIT-Medium.ttf'),
    'SUIT-SemiBold': require('./assets/fonts/SUIT-SemiBold.ttf'),
    'SUIT-ExtraBold': require('./assets/fonts/SUIT-ExtraBold.ttf'),
    'DMMono-Medium': require('./assets/fonts/DMMono-Medium.ttf'),
  });

  if (!fontsLoaded) {
    // 폰트 전에 글자를 그리면 시스템 폰트로 한 번 번쩍인다 — 빈 Navy 화면이 낫다
    return <View style={s.로딩} />;
  }

  return (
    <View style={s.wrap}>
      <StatusBar style="light" />
      {화면 === '말하기' ? <말하기화면 /> : <도착확인 돌아가기={() => set화면('말하기')} />}
      {화면 === '말하기' && (
        <Pressable onPress={() => set화면('시스템')} style={s.시스템링크} hitSlop={8}>
          <Text style={s.시스템글}>SYSTEM</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  로딩: { flex: 1, backgroundColor: 색.바탕 },
  시스템링크: { position: 'absolute', top: 34, right: 24, opacity: 0.8 },
  시스템글: {
    fontFamily: 폰트.모노,
    fontSize: 10,
    letterSpacing: 모노트래킹.라벨,
    color: 색.잉크_메타,
  },
});
