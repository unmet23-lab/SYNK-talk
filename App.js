import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import 말하기화면 from './src/말하기화면';
import 도착확인 from './src/도착확인';
import 인증화면, { 단계 } from './src/인증화면';
import 원장초기화 from './src/원장초기화';
import { 색, 폰트, 모노트래킹 } from './src/테마';

/**
 * 앱 루트 — 말하기(기본) / 도착확인(시스템) / 인증.
 * 내비게이션 라이브러리를 넣지 않은 것은 의도다 — 학생 앱의 동사는 하나다(설계 §1).
 *
 * ⚠ **세션은 아직 메모리에만 산다** — 앱을 껐다 켜면 다시 로그인해야 한다.
 *   기기에 남기는 것은 저장 층(`src/저장.js`)의 일이고 별도 판단이 필요해서 여기 안 넣었다.
 *   숨기지 않고 적어 둔다 — 「왜 매번 로그인하지」가 결함으로 보고되기 전에.
 */
export default function App() {
  const [화면, set화면] = useState('말하기');
  const [세션, set세션] = useState(null);
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

  // 🔴 로그인 전에는 다른 화면을 그리지 않는다 — 쓰기 통로가 전부 토큰을 요구하므로,
  //    안 그러면 학생이 말하기를 하고 나서야 「저장이 안 됐다」를 만난다.
  if (!세션) {
    return (
      <View style={s.wrap}>
        <StatusBar style="light" />
        <인증화면 로그인성공={set세션} />
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <StatusBar style="light" />
      {화면 === '말하기' && <말하기화면 />}
      {화면 === '시스템' && <도착확인 돌아가기={() => set화면('말하기')} 가기={set화면} />}
      {화면 === '비번변경' && (
        <인증화면
          시작단계={단계.변경}
          토큰={세션.access_token}
          닫기={() => set화면('말하기')}
          로그인성공={set세션}
        />
      )}
      {화면 === '초기화' && (
        <원장초기화 토큰={세션.access_token} 닫기={() => set화면('말하기')} />
      )}
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
