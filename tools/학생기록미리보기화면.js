// 로컬 합성 미리보기 전용 진입. 제품 App.js·로그인·권한을 우회하는 배포 경로가 아니다.
import React from 'react';
import { registerRootComponent } from 'expo';
import { useFonts } from 'expo-font';
import { View, Text } from 'react-native';
import 학생기록화면 from '../src/학생기록화면';
import { 색, 폰트 } from '../src/테마';

function 미리보기() {
  const [loaded] = useFonts({
    'SUIT-Regular': require('../assets/fonts/SUIT-Regular.ttf'),
    'SUIT-Medium': require('../assets/fonts/SUIT-Medium.ttf'),
    'SUIT-SemiBold': require('../assets/fonts/SUIT-SemiBold.ttf'),
    'SUIT-ExtraBold': require('../assets/fonts/SUIT-ExtraBold.ttf'),
    'DMMono-Medium': require('../assets/fonts/DMMono-Medium.ttf'),
  });
  if (!loaded) return null;
  return <View style={{ flex: 1, backgroundColor: 색.바탕 }}>
    <Text style={{ color: 색.잉크_서브, fontFamily: 폰트.캡션, fontSize: 12, padding: 12 }}>
      합성 자료 미리보기 · 실제 학생·계정·서버 연결 없음
    </Text>
    <학생기록화면 토큰="synthetic-preview" 돌아가기={() => window.location.reload()} />
  </View>;
}
registerRootComponent(미리보기);
