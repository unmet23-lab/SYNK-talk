import { Pressable, StyleSheet, Text, View } from 'react-native';
import { 색, 폰트 } from './테마';
import 기호 from './기호';

/**
 * 오프라인 복원 카드 (D7-3) — 세션 복원이 «기다리면 낫는» 실패(retryable)로 막힌 날의 화면.
 *
 * 🔴 로그인 폼이 아니다 — 자격(refresh_token)은 키체인에 그대로 있다. 여기서 비밀번호를
 *   다시 받으면 학생은 이유 없이 자기 번호를 의심한다(App.js 복원 catch 머리말).
 * 🔑 재시도 버튼이 없다 — 재시도는 App.js 의 AppState 리스너가 앱이 앞에 오는 순간 자동으로
 *   건다. 학생 손이 할 일은 «인터넷을 켜고 앱을 여는 것»뿐이라 본문이 그대로 말한다.
 * 🔑 「다른 계정으로 들어가기」는 기기 넘김의 출구다 — 오프라인이어도 다른 학생이 이 기기로
 *   들어와야 하는 날이 있다. 손으로가기 는 로그인 폼으로 내려보낼 뿐, 인증 로직은 무변경이다.
 * 🔑 App.js 로딩 화면과 같은 문법 — 빈 Navy 바탕 + 기호(View 로만 그려서 폰트를 안 탄다).
 */
export default function 오프라인카드({ 손으로가기 }) {
  return (
    <View style={s.wrap}>
      <기호 크기={56} />
      <Text style={s.본문}>인터넷이 연결되면 자동으로 들어가요</Text>
      <Pressable
        onPress={손으로가기}
        hitSlop={10}
        style={({ pressed }) => [s.출구, pressed && { opacity: 0.6 }]}
      >
        <Text style={s.출구글}>다른 계정으로 들어가기</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: 색.바탕,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: 24,
  },
  본문: { fontFamily: 폰트.본문, fontSize: 15, color: 색.잉크_서브, textAlign: 'center' },
  출구: { paddingVertical: 12 },
  출구글: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조 },
});
