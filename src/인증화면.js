import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 학생번호맞나 } from '../lib/학생계정.js';
import * as API from './인증API';

/**
 * 인증 화면 — 한 파일 안의 네 걸음(로그인 · 첫 등록 · 임시번호 · 비밀번호 변경).
 *
 * 🔑 내비게이션 라이브러리를 안 넣은 것은 App.js 와 같은 이유다 — 이 화면들은 **한 흐름**이고,
 *   학생은 그중 하나만 지난 뒤 다시는 안 본다. 파일을 넷으로 가르면 공통 입력·오류·버튼이
 *   네 벌이 되고, 네 벌이 되는 순간 갈라진다.
 *
 * 🔑 **신호 1점 = 오류 메시지**다(테마 `신호자리`). 이 화면엔 녹음 버튼이 없어서 성립한다.
 *   버튼은 코랄이 아니라 Cream 면 + Navy 2 글자다 — 코랄 면 위에 흰 글자를 얹는 세상의
 *   기본값이 킷에서는 대비 미달이라, 그 조합을 아예 만들지 않는다.
 *
 * 말투: 앱 UI = **이미 온 사람이 읽는 안내물**이라 설득 분량이 0이다(Y1).
 *   결론(무엇을 넣으면 되는지)을 먼저 두고 이유는 안 적는다.
 */

const 단계 = { 로그인: '로그인', 첫등록: '첫등록', 임시: '임시', 변경: '변경' };

export default function 인증화면({ 로그인성공, 시작단계 = 단계.로그인, 닫기, 토큰 = '' }) {
  const [지금, set지금] = useState(시작단계);
  const [학생번호, set학생번호] = useState('');
  const [비번, set비번] = useState('');
  const [뒷자리, set뒷자리] = useState('');
  const [임시번호, set임시번호] = useState('');
  const [새비번, set새비번] = useState('');
  const [복구메일, set복구메일] = useState('');
  const [복구전화, set복구전화] = useState('');
  const [오류, set오류] = useState('');
  const [도는중, set도는중] = useState(false);

  const 초기화입력 = () => { set비번(''); set뒷자리(''); set임시번호(''); set새비번(''); set오류(''); };
  const 옮기기 = (다음) => { 초기화입력(); set지금(다음); };

  async function 눌렀다(하는일) {
    if (도는중) return;                    // 두 번 눌러 두 번 보내는 것을 막는다
    set오류('');
    if (!API.설정됐나()) {
      // 값이 비었는데 「맞지 않습니다」라고 하면 학생이 자기 번호를 의심한다.
      set오류('앱 설정이 아직 연결되지 않았어요. 학원에 알려 주세요.');
      return;
    }
    set도는중(true);
    try {
      await 하는일();
    } catch (e) {
      set오류(e.message || '잠시 뒤 다시 해주세요');
    } finally {
      set도는중(false);
    }
  }

  const 번호형식 = 학생번호맞나(학생번호);

  const 제출 = {
    [단계.로그인]: {
      제목: '들어가기',
      쓸수있나: 번호형식 && 비번.length > 0,
      버튼: '들어가기',
      실행: async () => 로그인성공(await API.로그인(학생번호, 비번)),
    },
    [단계.첫등록]: {
      제목: '처음 오셨네요',
      쓸수있나: 번호형식 && 뒷자리.length === 4 && 새비번.length >= 6,
      버튼: '시작하기',
      실행: async () => 로그인성공(await API.첫등록({
        학생번호, 뒷자리, 비밀번호: 새비번, 복구이메일: 복구메일, 복구전화: 복구전화,
      })),
    },
    [단계.임시]: {
      제목: '임시번호로 들어가기',
      쓸수있나: 번호형식 && 임시번호.length === 6 && 새비번.length >= 6,
      버튼: '새 비밀번호로 시작하기',
      실행: async () => 로그인성공(await API.임시번호로그인({ 학생번호, 임시번호, 새비밀번호: 새비번 })),
    },
    [단계.변경]: {
      제목: '비밀번호 바꾸기',
      쓸수있나: 번호형식 && 비번.length > 0 && 새비번.length >= 6,
      버튼: '바꾸기',
      실행: async () => {
        await API.비밀번호변경({ 학생번호, 현재비밀번호: 비번, 새비밀번호: 새비번, 토큰 });
        if (닫기) 닫기();
      },
    },
  }[지금];

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>SYNK LAB</Text>
        <Text style={s.title}>{제출.제목}</Text>

        <칸
          라벨="학생번호"
          값={학생번호}
          바꾸기={set학생번호}
          자리표시="SYNK-042"
          모노
          자동대문자="characters"
        />

        {지금 === 단계.첫등록 && (
          <칸 라벨="전화번호 뒤 4자리" 값={뒷자리} 바꾸기={set뒷자리} 자리표시="1234" 숫자 최대={4} 모노 />
        )}
        {지금 === 단계.임시 && (
          <칸 라벨="학원에서 받은 6자리" 값={임시번호} 바꾸기={set임시번호} 자리표시="000000" 숫자 최대={6} 모노 />
        )}
        {(지금 === 단계.로그인 || 지금 === 단계.변경) && (
          <칸
            라벨={지금 === 단계.변경 ? '지금 비밀번호' : '비밀번호'}
            값={비번} 바꾸기={set비번} 비밀
          />
        )}
        {지금 !== 단계.로그인 && (
          <칸
            라벨={지금 === 단계.변경 ? '새 비밀번호' : '쓸 비밀번호'}
            값={새비번} 바꾸기={set새비번} 비밀 도움말="6자 이상"
          />
        )}

        {지금 === 단계.첫등록 && (
          <View style={s.선택묶음}>
            <Text style={s.선택머리}>연락처 (넣지 않아도 시작할 수 있어요)</Text>
            <칸 라벨="이메일" 값={복구메일} 바꾸기={set복구메일} 자리표시="" 이메일 />
            <칸 라벨="다른 전화번호" 값={복구전화} 바꾸기={set복구전화} 자리표시="" 숫자 />
            <Text style={s.선택꼬리}>
              비밀번호를 잊었을 때 학원이 본인인지 확인하는 데만 써요. 여기로 연락은 가지 않아요.
            </Text>
          </View>
        )}

        {/* 🔑 이 화면의 신호 1점 — 자리를 늘 비워 두면 글자가 떴다 사라져도 아래가 안 밀린다. */}
        <View style={s.오류칸}>{오류 ? <Text style={s.오류}>{오류}</Text> : null}</View>

        <Pressable
          onPress={() => 눌렀다(제출.실행)}
          disabled={!제출.쓸수있나 || 도는중}
          style={({ pressed }) => [
            s.버튼,
            (!제출.쓸수있나 || 도는중) && s.버튼_잠김,
            pressed && s.버튼_눌림,
          ]}
        >
          {도는중
            ? <ActivityIndicator color={색.바탕} />
            : <Text style={s.버튼글}>{제출.버튼}</Text>}
        </Pressable>

        <View style={s.갈래}>
          {지금 === 단계.로그인 && (
            <>
              <곁길 글="처음 오셨나요" 누르기={() => 옮기기(단계.첫등록)} />
              <곁길 글="비밀번호를 잊었어요" 누르기={() => 옮기기(단계.임시)} />
            </>
          )}
          {지금 !== 단계.로그인 && (
            <곁길 글="← 돌아가기" 누르기={() => (지금 === 단계.변경 && 닫기 ? 닫기() : 옮기기(단계.로그인))} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export { 단계 };

function 칸({ 라벨, 값, 바꾸기, 자리표시, 비밀, 숫자, 이메일, 모노, 최대, 자동대문자, 도움말 }) {
  return (
    <View style={s.칸}>
      <View style={s.칸머리}>
        <Text style={s.칸라벨}>{라벨}</Text>
        {도움말 ? <Text style={s.칸도움말}>{도움말}</Text> : null}
      </View>
      <TextInput
        value={값}
        onChangeText={(t) => 바꾸기(숫자 ? t.replace(/\D/g, '') : t)}
        placeholder={자리표시}
        placeholderTextColor={색.잉크_희미}
        secureTextEntry={Boolean(비밀)}
        keyboardType={숫자 ? 'number-pad' : 이메일 ? 'email-address' : 'default'}
        maxLength={최대}
        autoCapitalize={자동대문자 || 'none'}
        autoCorrect={false}
        style={[s.입력, 모노 && s.입력_모노]}
      />
    </View>
  );
}

function 곁길({ 글, 누르기 }) {
  return (
    <Pressable onPress={누르기} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      <Text style={s.곁길글}>{글}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 24, paddingTop: 84, paddingBottom: 48, gap: 18 },
  label: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_태그 },
  title: { fontFamily: 폰트.헤드, fontSize: 26, color: 색.잉크, marginBottom: 6 },

  칸: { gap: 7 },
  칸머리: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  칸라벨: { fontFamily: 폰트.본문, fontSize: 13, color: 색.잉크_서브 },
  // 3번째 글자 층 — 밀도로는 더 못 내려가는 자리라 Slate 를 쓴다(바닥이 Navy 2 라 허용).
  칸도움말: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조 },
  입력: {
    backgroundColor: 색.바탕띄움,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 색.잉크_희미,
    paddingHorizontal: 14,
    height: 52,                     // 손가락이 닿는 최소치보다 넉넉히
    fontFamily: 폰트.본문,
    fontSize: 16,                   // 16 미만이면 iOS 가 화면을 확대한다
    color: 색.잉크,
  },
  입력_모노: { fontFamily: 폰트.모노, letterSpacing: 1 },

  선택묶음: {
    backgroundColor: 색.바탕띄움, borderRadius: 14, padding: 16, gap: 14,
  },
  선택머리: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_서브 },
  선택꼬리: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 18, color: 색.잉크_보조 },

  오류칸: { minHeight: 20, justifyContent: 'center' },
  오류: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 19, color: 색.신호 },

  버튼: {
    backgroundColor: 색.잉크, borderRadius: 14, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  버튼_잠김: { opacity: 0.35 },
  버튼_눌림: { opacity: 0.82 },
  버튼글: { fontFamily: 폰트.강조, fontSize: 16, color: 색.바탕 },

  갈래: { gap: 14, alignItems: 'center', paddingTop: 6 },
  곁길글: { fontFamily: 폰트.본문, fontSize: 14, color: 색.잉크_보조 },
});
