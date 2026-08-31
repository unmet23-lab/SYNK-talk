import { Component } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { 관측보고 } from './관측';
import { 색, 폰트, 몽골어폰트, 눌림층, 글자배율상한 } from './테마';
import { 문구 } from '../contents/문구_오류.js';

/**
 * 화면 렌더 예외의 울타리 (감사 G2-3) — 한 화면이 그리다 죽어도 앱 전체가 내려가지 않는다.
 * App.js 가 라우팅 묶음을 이것으로 감싼다(key={화면} — 화면이 바뀌면 경계 상태가 자연 리셋).
 * 🔑 관측보고의 키는 ASCII 다(밖으로 나가는 키 규약 — src/관측.js beforeSend 실측), 값은 한글 OK.
 */

/** fallback 조각 — 순수 prop 조각으로 내보내 화면 회귀(tests/lib/화면세우기)가 직접 그린다. */
export function 넘어짐판({ 되세우기 }) {
  return (
    <View style={s.판}>
      {/* ko/mn 병기 — mn 이 빈 동안 한 줄만 선다(contents/문구_오류.js 규율). */}
      {[문구['err.boundary_fell'].ko, 문구['err.boundary_fell'].mn].filter(Boolean).map((줄, i) => (
        <Text key={줄} style={i === 0 ? s.글 : s.글_병기}>{줄}</Text>
      ))}
      <Pressable onPress={되세우기} style={({ pressed }) => [s.버튼, pressed && s.버튼_눌림]} hitSlop={8}>
        <Text style={s.버튼글} maxFontSizeMultiplier={글자배율상한}>말하기로 돌아가기</Text>
      </Pressable>
    </View>
  );
}

export default class 오류경계 extends Component {
  // 클래스 필드가 아니라 생성자다 — 미정의심볼 회귀의 걷기가 클래스 필드 키를 참조로 읽는다.
  constructor(props) {
    super(props);
    this.state = { 깨짐: false };
  }

  static getDerivedStateFromError() {
    return { 깨짐: true };
  }

  componentDidCatch(오류) {
    관측보고(오류, { spot: 'error_boundary', screen: this.props.화면이름 });
  }

  render() {
    if (!this.state.깨짐) return this.props.children;
    return (
      <넘어짐판 되세우기={() => { this.props.되세우기(); this.setState({ 깨짐: false }); }} />
    );
  }
}

const s = StyleSheet.create({
  판: { flex: 1, backgroundColor: 색.바탕, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 },
  글: { fontFamily: 폰트.강조, fontSize: 16, color: 색.잉크, textAlign: 'center' },
  // 병기 줄 — 키릴은 킷 한글 폰트에 글리프가 없다(두부). 규격은 그대로, 폰트만 가른다.
  글_병기: { fontFamily: 몽골어폰트.강조, fontSize: 16, color: 색.잉크, textAlign: 'center' },
  버튼: {
    backgroundColor: 색.잉크, borderRadius: 14, height: 52,
    paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center',
  },
  버튼_눌림: { opacity: 눌림층.버튼 },
  버튼글: { fontFamily: 폰트.강조, fontSize: 16, color: 색.바탕 },
});
