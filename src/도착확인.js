import { Platform, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import * as Updates from 'expo-updates';
import { 색, 폰트, 모노트래킹 } from './테마';

/**
 * 배포 도착 확인 화면 — 기능이 아니라 「내가 민 것이 여기 왔는가」를 보는 창.
 * 회화 기능이 생기면서 첫 화면 자리를 내주고 여기(설정 안쪽)로 옮겨졌다. 지우지 않는다.
 */

function show(v) {
  if (v === null || v === undefined || v === '') return '(없음)';
  return String(v);
}

export default function 도착확인({ 돌아가기, 가기 }) {
  const 줄 = [
    ['앱 버전', require('../app.json').expo.version],
    ['런타임 버전', show(Updates.runtimeVersion)],
    ['빌드 커밋', process.env.EXPO_PUBLIC_COMMIT || '(로컬)'],
    ['업데이트 채널', show(Updates.channel)],
    ['업데이트 ID', show(Updates.updateId)],
    ['내장 번들로 실행', Updates.isEmbeddedLaunch ? '예' : '아니오'],
    ['플랫폼', `${Platform.OS} ${show(Platform.Version)}`],
  ];

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner}>
      <Text style={s.label}>SYSTEM</Text>
      <Text style={s.title}>배포 도착 확인</Text>

      <View style={s.card}>
        {줄.map(([k, v]) => (
          <View key={k} style={s.row}>
            <Text style={s.key}>{k}</Text>
            <Text style={s.value}>{v}</Text>
          </View>
        ))}
      </View>

      <Text style={s.note}>
        「업데이트 ID」가 바뀌면 새 코드가 도착한 것이다.{'\n'}개발 중에는 (없음)이 정상이다.
      </Text>

      {/* 계정 — 이 화면이 앱의 유일한 「설정 안쪽」이라 여기 붙는다.
          🔑 초기화는 숨기지 않는다: 권한은 화면이 아니라 서버가 정하고, 원장이 아닌 토큰은 403 을 받는다. */}
      {가기 && (
        <View style={s.card}>
          <Pressable onPress={() => 가기('비번변경')} hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 0.65 }]}>
            <Text style={s.줄버튼글}>비밀번호 바꾸기</Text>
          </Pressable>
          <Pressable onPress={() => 가기('초기화')} hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 0.65 }]}>
            <Text style={s.줄버튼글}>학생 비밀번호 초기화 (원장)</Text>
          </Pressable>
        </View>
      )}

      <Pressable onPress={돌아가기} style={({ pressed }) => [s.back, pressed && { opacity: 0.7 }]}>
        <Text style={s.backText}>← 말하기로 돌아가기</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 24, paddingTop: 76, gap: 16 },
  label: {
    fontFamily: 폰트.모노,
    fontSize: 11,
    letterSpacing: 모노트래킹.라벨,
    color: 색.잉크_태그,
  },
  title: { fontFamily: 폰트.헤드, fontSize: 24, color: 색.잉크 },
  card: {
    backgroundColor: 색.바탕띄움,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  줄버튼: { paddingVertical: 8 },   // 손가락이 닿는 세로 여유
  줄버튼글: { fontFamily: 폰트.본문, fontSize: 14, color: 색.잉크 },
  key: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_서브 },
  value: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크, flexShrink: 1, textAlign: 'right' },
  note: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_메타, lineHeight: 19 },
  back: { paddingVertical: 12 },
  backText: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크_서브 },
});
