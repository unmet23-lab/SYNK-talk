import { StatusBar } from 'expo-status-bar';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * 배포 도착 확인 화면.
 *
 * 기능은 없다. 이 화면의 목적은 하나다 — **내가 민 것이 여기 도착했는가**를 눈으로 확인하는 것.
 * 「배포했다」는 밀었다는 뜻이지 도착했다는 뜻이 아니다. 앱스토어 심사 뒤에도, OTA 업데이트
 * 뒤에도 이 화면 하나로 도착을 확인한다.
 *
 * 회화 기능이 붙은 뒤에도 이 화면은 지우지 않고 설정 안쪽으로 옮긴다.
 */

/** 값이 없을 때 「모름」을 「정상」으로 바꾸지 않는다 — 빈 값은 빈 값이라고 적는다. */
function show(v) {
  if (v === null || v === undefined || v === '') return '(없음)';
  return String(v);
}

export default function App() {
  const 빌드커밋 = process.env.EXPO_PUBLIC_COMMIT || '(로컬)';
  const 채널 = Updates.channel;
  const 업데이트ID = Updates.updateId;

  const 줄 = [
    ['앱 버전', require('./app.json').expo.version],
    ['런타임 버전', show(Updates.runtimeVersion)],
    ['빌드 커밋', 빌드커밋],
    ['업데이트 채널', show(채널)],
    ['업데이트 ID', show(업데이트ID)],
    ['내장 번들로 실행', Updates.isEmbeddedLaunch ? '예' : '아니오'],
    ['플랫폼', `${Platform.OS} ${show(Platform.Version)}`],
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.title}>SYNK Talk</Text>
        <Text style={styles.subtitle}>배포 도착 확인 화면 · 기능 없음</Text>

        <View style={styles.card}>
          {줄.map(([k, v]) => (
            <View key={k} style={styles.row}>
              <Text style={styles.key}>{k}</Text>
              <Text style={styles.value}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          「업데이트 ID」가 바뀌면 새 코드가 도착한 것이다.{'\n'}
          개발 중에는 (없음)으로 나오는 것이 정상이다.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { padding: 24, paddingTop: 72, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#666' },
  card: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  key: { fontSize: 13, color: '#666' },
  value: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  note: { fontSize: 12, color: '#888', lineHeight: 18 },
});
