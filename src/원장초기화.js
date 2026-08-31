import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { 색, 폰트, 모노트래킹, 글자배율상한, 눌림층, 눌림감 } from './테마';
import { 학생번호맞나 } from '../lib/학생계정.js';
import * as API from './인증API';

/**
 * 원장 「비밀번호 초기화」 — 버튼 하나 (L0 §4-2-2).
 *
 * 🔴 **임시번호는 이 화면이 한 번 보여주고 끝이다.** 서버도 평문을 안 갖는다(해시로만 든다).
 *   그래서 화면을 나가면 다시 볼 방법이 없고, 그건 결함이 아니라 이 설계의 전부다 —
 *   어딘가에 남으면 그 목록 하나가 다수 계정이 된다.
 *
 * 🔑 **역할은 이 화면이 정하지 않는다.** 원장이 아닌 토큰으로 부르면 서버가 403 을 준다.
 *   화면에서 숨기는 것은 편의이지 권한이 아니다.
 *
 * 🔑 **결과가 두 갈래다.** 아직 앱 계정이 없는 학생이면 임시번호 대신 「첫 등록 잠금 해제」가
 *   돌아온다(절단문서 ②-19). 전화 뒤 4자리를 5번 틀리면 그 학생의 첫 등록이 잠기는데,
 *   그 잠금을 푸는 통로는 이 버튼 하나뿐이다 — 학생번호는 순번이라 아무나 그 상태를 만들 수 있다.
 */
export default function 원장초기화({ 토큰, 닫기 }) {
  const [학생번호, set학생번호] = useState('');
  const [확인, set확인] = useState(null);
  const [결과, set결과] = useState(null);
  const [오류, set오류] = useState('');
  const [도는중, set도는중] = useState(false);

  const 쓸수있나 = 학생번호맞나(학생번호) && !도는중;

  function 오류접기(e) {
    set오류(e.code === 'FORBIDDEN'
      ? '이 계정에는 초기화 권한이 없어요.'
      : (e.message || '잠시 뒤 다시 해주세요'));
  }

  /* 첫 탭 = 미리보기 — 서버는 아무것도 안 바꾸고 대상(번호·이름)만 준다(08-31 감사 G1-8). */
  async function 만들기() {
    if (!쓸수있나) return;
    set오류(''); set결과(null); set확인(null); set도는중(true);
    try {
      set확인(await API.초기화요청({ 학생번호, 토큰, 미리보기: true }));
    } catch (e) {
      오류접기(e);
    } finally {
      set도는중(false);
    }
  }

  /* 둘째 탭이 실행이다 — 비가역 실행은 확인 카드 뒤에(강사API 머리말의 두 탭 원칙과 같은 결). */
  async function 실행() {
    if (!확인 || 도는중) return;
    set오류(''); set도는중(true);
    try {
      set결과(await API.초기화요청({ 학생번호: 확인.학생번호, 토큰 }));
      set확인(null);
    } catch (e) {
      오류접기(e);
    } finally {
      set도는중(false);
    }
  }

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <Text style={s.label}>DIRECTOR</Text>
      <Text style={s.title}>비밀번호 초기화</Text>

      <View style={s.칸}>
        <Text style={s.칸라벨}>학생번호</Text>
        <TextInput
          value={학생번호}
          onChangeText={(t) => { set학생번호(t); set결과(null); set확인(null); }}
          placeholder="SYNK-042"
          placeholderTextColor={색.잉크_희미}
          autoCapitalize="characters"
          autoCorrect={false}
          style={s.입력}
        />
      </View>

      <View style={s.오류칸}>{오류 ? <Text style={s.오류}>{오류}</Text> : null}</View>

      <Pressable
        onPress={만들기}
        disabled={!쓸수있나}
        style={({ pressed }) => [s.버튼, !쓸수있나 && s.버튼_잠김, pressed && s.버튼_눌림]}
      >
        <Text style={s.버튼글} maxFontSizeMultiplier={글자배율상한}>{도는중 ? '만드는 중' : '임시번호 만들기'}</Text>
      </Pressable>

      {확인 && !결과 && (
        <View style={s.결과}>
          <Text style={s.확인머리}>
            {확인.이름 ? `${확인.학생번호} · ${확인.이름}` : 확인.학생번호} 학생의 비밀번호를 초기화할까요?
          </Text>
          <Text style={s.결과주의}>
            지난 비밀번호가 즉시 무효가 되고 로그인된 기기가 모두 끊겨요.
          </Text>
          <Pressable
            onPress={실행}
            disabled={도는중}
            style={({ pressed }) => [s.버튼, 도는중 && s.버튼_잠김, pressed && s.버튼_눌림]}
          >
            <Text style={s.버튼글} maxFontSizeMultiplier={글자배율상한}>{도는중 ? '초기화하는 중' : '초기화하기'}</Text>
          </Pressable>
        </View>
      )}

      {결과 && (결과.잠금해제 ? (
        /* 아직 앱 계정이 없는 학생 — 줄 임시번호가 없다(비밀번호가 아직 없어서다).
         * 번호 자리를 비워 두지 않고 **다른 안내**를 낸다: 여기서 빈칸을 보여주면
         * 원장이 없는 번호를 학생에게 불러 주게 된다. */
        <View style={s.결과}>
          <Text style={s.결과머리}>{결과.이름 ? `${결과.학생번호} · ${결과.이름}` : 결과.학생번호} 학생의 잠금을 풀었어요</Text>
          <Text style={s.결과꼬리}>
            이 학생은 아직 앱 계정을 만들지 않았어요 — 그래서 임시번호는 없어요.
            {'\n'}학생이 「처음 시작하기」에서 학생번호와 전화번호 뒤 4자리로 다시 등록하면 돼요.
          </Text>
        </View>
      ) : (
        <View style={s.결과}>
          <Text style={s.결과머리}>{결과.이름 ? `${결과.학생번호} · ${결과.이름}` : 결과.학생번호} 학생에게 알려 주세요</Text>
          <Text style={s.번호} selectable>{결과.임시번호}</Text>
          <Text style={s.결과꼬리}>
            {결과.유효분 != null ? `${결과.유효분}분 동안 쓸 수 있어요. ` : ''}학생이 이 번호로 들어와 자기 비밀번호를 직접 정해요.
            {'\n'}이 번호는 지금 한 번만 보여요 — 화면을 나가면 다시 볼 수 없어요.
          </Text>
          <Text style={s.결과주의}>
            지난 비밀번호는 이 순간부터 쓸 수 없어요. 로그인해 둔 기기도 함께 끊겨요.
          </Text>
        </View>
      ))}

      {닫기 && (
        <Pressable onPress={닫기} hitSlop={10} style={({ pressed }) => [s.돌아가기, pressed && { opacity: 눌림감.글 }]}>
          <Text style={s.돌아가기글}>← 돌아가기</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 24, paddingTop: 84, paddingBottom: 48, gap: 18 },
  label: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_태그 },
  title: { fontFamily: 폰트.헤드, fontSize: 26, color: 색.잉크, marginBottom: 6 },

  칸: { gap: 7 },
  칸라벨: { fontFamily: 폰트.본문, fontSize: 13, color: 색.잉크_서브 },
  입력: {
    backgroundColor: 색.바탕띄움, borderRadius: 12, borderWidth: 1, borderColor: 색.잉크_희미,
    paddingHorizontal: 14, height: 52,
    fontFamily: 폰트.모노, fontSize: 16, letterSpacing: 1, color: 색.잉크,
  },

  오류칸: { minHeight: 20, justifyContent: 'center' },
  오류: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 19, color: 색.신호 },

  버튼: {
    backgroundColor: 색.잉크, borderRadius: 14, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  버튼_잠김: { opacity: 눌림층.잠김 },
  버튼_눌림: { opacity: 눌림층.버튼 },
  버튼글: { fontFamily: 폰트.강조, fontSize: 16, color: 색.바탕 },

  결과: { backgroundColor: 색.바탕띄움, borderRadius: 16, padding: 20, gap: 10, marginTop: 4 },
  결과머리: { fontFamily: 폰트.본문, fontSize: 13, color: 색.잉크_서브 },
  확인머리: { fontFamily: 폰트.강조, fontSize: 15, lineHeight: 22, color: 색.잉크 },
  // 말로 읽어 주는 값이라 자간을 벌린다 — 6자리를 한 덩어리로 보면 읽다가 자리를 놓친다.
  번호: { fontFamily: 폰트.모노, fontSize: 40, letterSpacing: 8, color: 색.잉크 },
  결과꼬리: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 19, color: 색.잉크_보조 },
  결과주의: { fontFamily: 폰트.본문, fontSize: 12, lineHeight: 19, color: 색.잉크_서브 },

  돌아가기: { paddingTop: 6, alignItems: 'center' },
  돌아가기글: { fontFamily: 폰트.본문, fontSize: 14, color: 색.잉크_보조 },
});
