import { useState } from 'react';
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { 색, 폰트, 모노트래킹, 몽골어폰트, 눌림층, 눌림감, 글자배율상한 } from './테마';
import { use등장 } from '../lib/모션.js';
import { 학생번호맞나, 계정번호맞나, 학생번호접두 } from '../lib/학생계정.js';
import { 문항, 답검사 } from '../lib/가입문항.js';
import { 가이드쓰기 } from './저장.js';
import * as API from './인증API';
/* 학생이 읽는 글의 정본은 `contents/문구_오류.js` 다 — 화면은 «어느 말을 언제 쓰나»만 정한다.
   🔑 `코드로말` 은 **모르는 코드에서 서버 말을 버리지 않는다**: 우리 표로 덮으면 서버가 새
   코드를 내는 날 학생도 우리도 무엇이 막았는지 모른 채 일반 문구만 본다(F176). */
import { 말, 줄들, 코드로말 } from '../contents/문구_오류.js';
/* 인증 카피(제목·버튼·칸 라벨·곁길·연락처)의 정본은 `contents/문구_인증.js` 다 — 감수 목록
   (`contents/문구_1차.js` `auth.*`)의 `source_file` 이 그 표를 가리키므로 문장을 고치는 자리도
   그 표 하나다. `줄들` 은 문구_오류 의 것과 이름이 겹쳐 별칭으로 든다. */
import { 문구 as 인증문구, 줄들 as 인증줄들 } from '../contents/문구_인증.js';

/**
 * 인증 화면 — 한 파일 안의 네 걸음(로그인 · 첫 등록 · 임시번호 · 비밀번호 변경).
 *
 * 🔑 내비게이션 라이브러리를 안 넣은 것은 App.js 와 같은 이유다 — 이 화면들은 **한 흐름**이고,
 *   학생은 그중 하나만 지난 뒤 다시는 안 본다. 파일을 넷으로 가르면 공통 입력·오류·버튼이
 *   네 벌이 되고, 네 벌이 되는 순간 갈라진다.
 *
 * 🔑 **신호 1점 = 오류 메시지**다(테마 `신호자리`). 이 화면엔 녹음 버튼이 없어서 성립한다.
 *   버튼은 코랄이 아니라 Paper 면 + Ink Deep 글자다 — 코랄 면 위에 흰 글자를 얹는 세상의
 *   기본값이 킷에서는 대비 미달이라, 그 조합을 아예 만들지 않는다.
 *
 * 말투: 앱 UI = **이미 온 사람이 읽는 안내물**이라 설득 분량이 0이다(Y1).
 *   결론(무엇을 넣으면 되는지)을 먼저 두고 이유는 안 적는다.
 */

const 단계 = { 로그인: '로그인', 첫등록: '첫등록', 임시: '임시', 변경: '변경' };

/* 서버의 `최소비번`(supabase/functions/auth) 과 같은 값이다. 화면이 이 수를 이미 두 곳에서
 * 쓰고 있었다(길이 검사 셋 · 도움말) — 상수로 세워 **그 넷과 오류 문장의 `{n}` 이 한 자리에서
 * 나온다.** 하나라도 리터럴로 남기면 기준이 바뀌는 날 화면이 거짓말을 한다: 버튼은 안 열리는데
 * 도움말에는 「6자 이상」이라고 적혀 있는 모양이다.
 * ⚠ 서버가 진짜 게이트다 — 여기 값은 화면을 미리 잠그는 편의일 뿐이다. */
const 최소비번 = 6;

/* 칸·곁길에 신는 라벨 짝 — `mn` 이 빈 동안 `라벨_mn` 은 null 이라 킷 폰트·한국어 그대로다.
   감수가 차는 날 표(`문구_인증.js`)만 바뀐다(`고르기` 무늬 — 폰트는 글자를 따라간다). */
const 라벨짝 = (id) => ({ 라벨: 인증문구[id].ko, 라벨_mn: 인증문구[id].mn || null });

/* 가이드 셋(D4-1) — 값은 캐릭터 정본 낱말 그대로(`src/저장.가이드쓰기` 가 같은 어휘로 거른다).
 * 마린은 그림 외주 대기(`lib/마스코트생명.표정컷` 머리말)라 비활성 「곧 와요」 — 숨기면
 * 「셋 중 하나」라는 약속 자체가 안 보인다. */
const 가이드보기 = Object.freeze([
  Object.freeze({ 값: '몽글', 라벨: '몽글', 라벨_mn: null }),
  Object.freeze({ 값: '까몽', 라벨: '까몽', 라벨_mn: null }),
  Object.freeze({ 값: '마린', 라벨: '마린 · 곧 와요', 라벨_mn: null, 비활성: true }),
]);

/* 🔴 `토큰` prop 은 **일부러 없다.** 비밀번호 변경이 그것으로 PUT 을 치던 것이 세션 삼분의
 * 원인이었다(전층감사 §2-6) — 받아 두면 다음 사람이 다시 그 자리에 쓴다. 이 화면이 쓰는
 * 세션은 `API.비밀번호변경` 이 돌려주는 「살아남은」 것 하나뿐이다.
 * ⚠ `초기학생번호` 는 그 규율과 무관한 **표시값**이다(D7-12) — 만료가 남긴 학생번호로
 *   로그인 단계의 첫 칸을 채울 뿐, 자격이 아니다. */
export default function 인증화면({ 로그인성공, 시작단계 = 단계.로그인, 닫기, 초기학생번호 = null }) {
  const [지금, set지금] = useState(시작단계);
  const [학생번호, set학생번호] = useState(초기학생번호 || '');
  const [비번, set비번] = useState('');
  const [뒷자리, set뒷자리] = useState('');
  const [임시번호, set임시번호] = useState('');
  const [새비번, set새비번] = useState('');
  const [복구메일, set복구메일] = useState('');
  const [복구전화, set복구전화] = useState('');
  /* 가입 1회 문항 셋(`lib/가입문항.js`). 🔴 **첫 등록에만 있고 다시는 안 묻는다** — 나중에
     설정 화면으로 미루면 그때는 이미 그 값이 아니다(L0 §850 · 유일한 완전 소급 불가). */
  const [가입답, set가입답] = useState({});
  /* 가이드 고름(D4-1) — 몽글이 기본으로 골라져 시작한다: 안 고르고 지나도 기본 가이드가
     서고, 가입답과 달리 «영구 소급 불가» 축이 아니라 버튼 게이트에는 안 넣는다. */
  const [가이드고름, set가이드고름] = useState('몽글');
  const [오류, set오류] = useState('');
  const [도는중, set도는중] = useState(false);

  const 초기화입력 = () => {
    set비번(''); set뒷자리(''); set임시번호(''); set새비번(''); set오류(''); set가입답({});
    set가이드고름('몽글');
  };
  const 옮기기 = (다음) => { 초기화입력(); set지금(다음); };

  async function 눌렀다(하는일) {
    if (도는중) return;                    // 두 번 눌러 두 번 보내는 것을 막는다
    set오류('');
    if (!API.설정됐나()) {
      // 값이 비었는데 「맞지 않습니다」라고 하면 학생이 자기 번호를 의심한다.
      set오류(말('err.not_configured'));
      return;
    }
    set도는중(true);
    try {
      await 하는일();
    } catch (e) {
      /* 🔑 서버가 준 **코드**로 우리 문장을 고른다 — 그것이 몽골어가 붙는 자리다(C0 §5).
         `{n}` 은 비밀번호 최소 길이라 화면이 아는 값으로 메운다(`쓸수있나` 와 같은 6). */
      set오류(코드로말(e.code, e.message, { 채움: { n: 최소비번 }, 기본: 말('err.try_again') }));
    } finally {
      set도는중(false);
    }
  }

  /* 🔑 검사가 **둘**인 까닭 — 자리마다 받는 것이 다르다.
   *   · 로그인·비밀번호 변경: 직원도 지나야 하므로 `계정번호맞나`(학생 또는 직원).
   *   · 첫 등록·임시번호: **학생 전용 통로**다. 직원 계정은 원장이 세우지 학생처럼 스스로
   *     등록하지 않는다. 여기까지 넓히면 「직원 번호로 첫 등록을 시도할 수 있는」 막다른 길이
   *     생기고, 서버는 그것을 게이트 실패로 접으므로 사람은 «번호가 틀렸나» 하고 헤맨다.
   * ⚠ 서버가 진짜 게이트다(auth 의 셋은 그대로 `학생번호맞나`) — 여기 둘은 화면을 미리 잠글 뿐이다. */
  const 번호형식 = 계정번호맞나(학생번호);
  const 학생번호형식 = 학생번호맞나(학생번호);

  const 제출 = {
    [단계.로그인]: {
      제목: 인증문구['auth.title.login'].ko,
      쓸수있나: 번호형식 && 비번.length > 0,
      버튼: 인증문구['auth.button.login'].ko,
      실행: async () => 로그인성공(await API.로그인(학생번호, 비번)),
    },
    [단계.첫등록]: {
      제목: 인증문구['auth.title.first'].ko,
      /* 🔴 세 문항을 **다 고르기 전엔 버튼이 안 열린다.** 선택으로 두면 건너뛴 학생의 세 칸이
         영구 null 이고 그건 되물어도 못 채운다 — 그래서 「밝히지 않음」은 성별 **보기 안에**
         있고(기록된 비공개 ≠ 빈 칸), 건너뛰기는 없다. 검사는 서버와 **같은 함수**를 쓴다. */
      쓸수있나: 학생번호형식 && 뒷자리.length === 4 && 새비번.length >= 최소비번 && !답검사(가입답),
      버튼: 인증문구['auth.button.first'].ko,
      실행: async () => {
        const 새세션 = await API.첫등록({
          학생번호, 뒷자리, 비밀번호: 새비번, 복구이메일: 복구메일, 복구전화: 복구전화, 가입답,
        });
        /* 가이드 선택은 서버 페이로드에 **안 싣는다**(`lib/가입문항.js` 🚫 새 문항 금지 ·
           auth 동봉) — 기기 파일 하나에만 남기고(로그인성공 직전 · D4-1), 실패는 조용하다
           (가이드쓰기 가 스스로 삼킨다 — 마스코트 실패 모드는 조용함). */
        await 가이드쓰기(가이드고름);
        로그인성공(새세션);
      },
    },
    [단계.임시]: {
      제목: 인증문구['auth.title.temp'].ko,
      쓸수있나: 학생번호형식 && 임시번호.length === 6 && 새비번.length >= 최소비번,
      버튼: 인증문구['auth.button.temp'].ko,
      실행: async () => 로그인성공(await API.임시번호로그인({ 학생번호, 임시번호, 새비밀번호: 새비번 })),
    },
    [단계.변경]: {
      제목: 인증문구['auth.title.change'].ko,
      쓸수있나: 번호형식 && 비번.length > 0 && 새비번.length >= 최소비번,
      버튼: 인증문구['auth.button.change'].ko,
      실행: async () => {
        /* 🔴 **새 세션을 세우고 나서 닫는다.** 비밀번호가 바뀌는 순간 GoTrue 가 그 요청을 친
         * 세션만 남기고 나머지를 죽이므로(`인증API.비밀번호변경` 머리말 · 리허설 실측),
         * 이 줄이 빠지면 앱 state·키체인이 **방금 죽은 토큰**을 든 채로 남는다.
         * 나머지 세 갈래와 **같은 이유**다 — 넷 다 세션이 갈리는 자리다.
         * ⚠ 이어지는 줄을 `*` 로 시작하는 것이 규약이다: `tests/lib/소스검사.js` 가 `*` 줄만
         *   지우므로, 안 그러면 이 설명이 코드로 읽혀 아래 회귀가 영원히 초록이 된다. */
        await 로그인성공(await API.비밀번호변경({ 학생번호, 현재비밀번호: 비번, 새비밀번호: 새비번 }));
        if (닫기) 닫기();
      },
    },
  }[지금];

  /* 잠긴 버튼이 눌렸을 때 「왜 안 열리나」 — 화면 순서대로 **첫 빠진 칸 하나만** 짚는다.
     `쓸수있나` 의 갈래별 조건과 같은 자를 쓴다(둘이 갈리면 안내가 열린 버튼을 설명하게 된다). */
  function 빠진칸안내() {
    const 학생전용 = 지금 === 단계.첫등록 || 지금 === 단계.임시;
    if (!(학생전용 ? 학생번호형식 : 번호형식)) return '학생번호를 확인해 주세요';
    if (지금 === 단계.첫등록 && 뒷자리.length !== 4) return '전화번호 뒤 4자리를 넣어 주세요';
    if (지금 === 단계.임시 && 임시번호.length !== 6) return '학원에서 받은 6자리를 넣어 주세요';
    if ((지금 === 단계.로그인 || 지금 === 단계.변경) && !비번.length) return '비밀번호를 넣어 주세요';
    if (지금 !== 단계.로그인 && 새비번.length < 최소비번) return 말('err.password_too_short', { 채움: { n: 최소비번 } });
    const 검사 = 지금 === 단계.첫등록 ? 답검사(가입답) : null;
    if (검사) return `${문항.find((q) => q.필드 === 검사.필드).라벨}을 골라 주세요`;
    return '';
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>SYNK LAB</Text>
        <Text style={s.title}>{제출.제목}</Text>

        <칸
          id="학생번호"
          {...라벨짝('auth.field.student_id')}
          값={학생번호}
          바꾸기={(t) => set학생번호(학생번호접두(t))}
          자리표시="SYNK-042"
          모노
          자동대문자="characters"
        />

        {지금 === 단계.첫등록 && (
          <칸 id="뒷자리" {...라벨짝('auth.field.phone_last4')} 값={뒷자리} 바꾸기={set뒷자리} 자리표시="1234" 숫자 최대={4} 모노 도움말="상담 때 알려주신 번호예요" />
        )}
        {지금 === 단계.임시 && (
          <칸 id="임시번호" {...라벨짝('auth.field.temp_code')} 값={임시번호} 바꾸기={set임시번호} 자리표시="000000" 숫자 최대={6} 모노 />
        )}
        {(지금 === 단계.로그인 || 지금 === 단계.변경) && (
          <칸
            id="비밀번호"
            {...라벨짝(지금 === 단계.변경 ? 'auth.field.password_now' : 'auth.field.password')}
            값={비번} 바꾸기={set비번} 비밀
          />
        )}
        {지금 !== 단계.로그인 && (
          <칸
            {...라벨짝(지금 === 단계.변경 ? 'auth.field.password_new' : 'auth.field.password_set')}
            값={새비번} 바꾸기={set새비번} 비밀
            도움말={인증줄들('auth.hint.password_min', { 채움: { n: 최소비번 } })[0].글}
          />
        )}

        {/* 가입 1회 문항 — 이 화면에만 있다. 🔑 왜 여기냐: 다시 물을 자리가 없기 때문이다
            (L0 §704 「뒤에 붙이면 재적 전원에게 다시 물어야 한다」). 값은 학생에게 다시
            보여주지 않는다 — 수집 축이지 프로필이 아니다(발주_수집파이프라인 [CHK-4]). */}
        {지금 === 단계.첫등록 && 문항.map((q) => (
          <고르기 key={q.필드} 라벨={q.라벨} 라벨_mn={q.라벨_mn} 보기={q.보기} 값={가입답[q.필드]}
            고르기={(v) => set가입답((앞) => ({ ...앞, [q.필드]: v }))} />
        ))}

        {/* 가이드 고르기(D4-1) — 위 가입답과 **다른 축**이다: 서버로 안 나가고(🚫 새 문항 금지)
            기기 파일 하나(guide_choice.json)에만 남는다. 언제든 다시 고를 수 있는 취향이라
            소급 불가 축이 아니고, 그래서 버튼 게이트에도 안 들어간다. */}
        {지금 === 단계.첫등록 && (
          <고르기 라벨="누구랑 같이 공부할래요?" 라벨_mn={null} 보기={가이드보기} 값={가이드고름}
            고르기={(v) => set가이드고름(v)} />
        )}

        {지금 === 단계.첫등록 && (
          <View style={s.선택묶음}>
            {인증줄들('auth.contact.head').map((줄, i) => (
              <Text key={`머리${i}`} style={줄.mn ? s.선택머리_병기 : s.선택머리}>{줄.글}</Text>
            ))}
            <칸 {...라벨짝('auth.field.email')} 값={복구메일} 바꾸기={set복구메일} 자리표시="" 이메일 />
            <칸 {...라벨짝('auth.field.phone_alt')} 값={복구전화} 바꾸기={set복구전화} 자리표시="" 숫자 />
            {인증줄들('auth.contact.tail').map((줄, i) => (
              <Text key={`꼬리${i}`} style={줄.mn ? s.선택꼬리_병기 : s.선택꼬리}>{줄.글}</Text>
            ))}
          </View>
        )}

        {/* 🔑 이 화면의 신호 1점 — 자리를 늘 비워 두면 글자가 떴다 사라져도 아래가 안 밀린다.
            등장 박자(08-24): 자리가 늘 비어 있어 글자만 툭 바뀌던 자리다 — 같은 오류를 두 번
            만나면 «바뀐 줄도 모른다». 위 `눌렀다` 가 매번 `set오류('')` 로 비우고 다시 채우므로
            같은 문구가 반복돼도 재마운트가 확실히 일어나 박자가 매번 돈다.
            🚫 흔들지 않는다 — 실패에 하강 버저를 안 쓰는 것과 같은 규율(저장소 규약 §5)이다.
               학생을 탓하는 몸짓 대신, 읽으라고 «세우는» 박자만 준다. */}
        <View style={s.오류칸}>{오류 ? <오류줄 글={오류} /> : null}</View>

        <Pressable
          testID="인증-제출"
          onPress={() => {
            if (!제출.쓸수있나) {
              /* 같은 안내가 두 번 떠도 등장 박자가 다시 돌게 — 비운 «다음 틱»에 채운다(눌렀다 무늬). */
              const 안내 = 빠진칸안내();
              set오류('');
              Promise.resolve().then(() => set오류(안내));
              return;
            }
            눌렀다(제출.실행);
          }}
          disabled={도는중}
          style={({ pressed }) => [
            s.버튼,
            (!제출.쓸수있나 || 도는중) && s.버튼_잠김,
            pressed && s.버튼_눌림,
          ]}
        >
          {도는중
            ? <ActivityIndicator color={색.바탕} />
            : <Text style={s.버튼글} maxFontSizeMultiplier={글자배율상한}>{제출.버튼}</Text>}
        </Pressable>

        <View style={s.갈래}>
          {지금 === 단계.로그인 && (
            <>
              <곁길 id="첫등록" 글={인증문구['auth.link.first'].ko} 라벨_mn={인증문구['auth.link.first'].mn || null} 버튼꼴 누르기={() => 옮기기(단계.첫등록)} />
              <곁길 id="임시" 글={인증문구['auth.link.forgot'].ko} 라벨_mn={인증문구['auth.link.forgot'].mn || null} 누르기={() => 옮기기(단계.임시)} />
            </>
          )}
          {지금 !== 단계.로그인 && (
            <곁길 id="뒤로" 글={인증문구['auth.link.back'].ko} 라벨_mn={인증문구['auth.link.back'].mn || null} 누르기={() => (지금 === 단계.변경 && 닫기 ? 닫기() : 옮기기(단계.로그인))} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export { 단계 };

/* `id` 는 **자동 밟기(Maestro)가 잡는 손잡이**다 — 라벨(카피)과 갈라 둔 이유가 이것이다.
   라벨로 잡으면 카피 한 줄만 다듬어도 흐름이 통째로 깨진다(카피 감사가 52곳을 한 번에
   바꾼 이력이 있다). 규약·전량 목록은 `tests/자동밟기손잡이.test.js` 가 정본으로 든다. */
/* 오류 한 줄 — 위 오류칸 주석의 박자를 지는 자리. 세기는 다른 화면의 «응답» 줄과 같다.
   ko/mn 줄배열 병기 — i===0 이 한국어(킷폰트), 뒤 줄은 몽골어폰트(막힘카드 눈금 · 가르는 자 = `줄들`). */
function 오류줄({ 글 }) {
  const 등장 = use등장({ 올라옴: 6, 시간: 200 });
  /* accessibilityLiveRegion — Android 전용 속성(iOS 는 무시되어 무해) · 동적 등장 알림. */
  return (
    <Animated.View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={등장}>
      {줄들(글).map((줄, i) => (
        <Text key={i} style={i === 0 ? s.오류 : s.오류_병기}>{줄}</Text>
      ))}
    </Animated.View>
  );
}

function 칸({ id, 라벨, 라벨_mn, 값, 바꾸기, 자리표시, 비밀, 숫자, 이메일, 모노, 최대, 자동대문자, 도움말 }) {
  const [보임, set보임] = useState(false);
  const 입력 = (
    <TextInput
      testID={id ? `입력-${id}` : undefined}
      accessibilityLabel={라벨}
      maxFontSizeMultiplier={글자배율상한}
      value={값}
      onChangeText={(t) => 바꾸기(숫자 ? t.replace(/\D/g, '') : t)}
      placeholder={자리표시}
      placeholderTextColor={색.잉크_희미}
      secureTextEntry={Boolean(비밀) && !보임}
      keyboardType={숫자 ? 'number-pad' : 이메일 ? 'email-address' : 'default'}
      maxLength={최대}
      autoCapitalize={자동대문자 || 'none'}
      autoCorrect={false}
      style={[s.입력, 모노 && s.입력_모노, 비밀 && s.입력_비밀]}
    />
  );
  return (
    <View style={s.칸}>
      <View style={s.칸머리}>
        <Text style={[s.칸라벨, 라벨_mn && { fontFamily: 몽골어폰트.본문 }]}>{라벨_mn || 라벨}</Text>
        {도움말 ? <Text style={s.칸도움말}>{도움말}</Text> : null}
      </View>
      {비밀 ? (
        <View style={s.비밀줄}>
          {입력}
          {/* 토글은 입력 행 «안» 오른쪽 패딩 자리 — 신호 1점(오류)이 있는 화면이라 코랄이 아니라
              3번째 글자 층(칸도움말)과 같은 규격이다(머리말 규율). */}
          <Pressable onPress={() => set보임((앞) => !앞)} hitSlop={10}>
            <Text style={s.칸도움말}>{보임 ? '가리기' : '보기'}</Text>
          </Pressable>
        </View>
      ) : 입력}
    </View>
  );
}

/* 보기에서 하나를 고른다 — 자유 입력이 아닌 이유는 `lib/가입문항.js` 머리말에 있다(표기가
   갈리면 그 칸의 존재 이유가 죽는다). 세 문항이 한 컴포넌트를 쓴다: 갈라 두면 고른 표시가
   문항마다 달라 보이고, 그 차이는 학생에게 「뭔가 다른 질문」으로 읽힌다. */
/* 🔴 **폰트는 글자를 따라간다** — 몽골어(키릴)를 킷 한글 폰트로 그리면 글리프가 없어
 *   두부(□□□)가 되고, 그 화면은 「글자가 안 온 것」과 구별이 안 된다(`테마.몽골어` 머리말).
 *   그래서 `라벨_mn` 이 있는 줄에만 `몽골어폰트` 를 얹는다. 지금은 전부 `null` 이라 킷 폰트가
 *   그대로 서고, 감수가 끝나 그 칸이 차는 순간 **화면 코드 없이** 폰트까지 함께 바뀐다. */
function 고르기({ 라벨, 라벨_mn, 보기, 값, 고르기: 눌렀다 }) {
  return (
    <View style={s.칸}>
      <View style={s.칸머리}>
        <Text style={[s.칸라벨, 라벨_mn && { fontFamily: 몽골어폰트.본문 }]}>{라벨_mn || 라벨}</Text>
      </View>
      <View style={s.보기줄}>
        {보기.map((b) => {
          const 골랐나 = 값 === b.값;
          const 몽골어줄 = Boolean(b.라벨_mn);
          return (
            <Pressable
              key={b.값}
              onPress={() => 눌렀다(b.값)}
              disabled={Boolean(b.비활성)}
              accessibilityRole="button"
              accessibilityState={{ selected: 골랐나, disabled: Boolean(b.비활성) }}
              style={({ pressed }) => [
                s.보기, 골랐나 && s.보기_고름, b.비활성 && s.보기_잠김, pressed && { opacity: 눌림감.면 },
              ]}
            >
              <Text style={[
                s.보기글,
                골랐나 && s.보기글_고름,
                몽골어줄 && { fontFamily: 골랐나 ? 몽골어폰트.강조 : 몽골어폰트.본문 },
              ]}>{b.라벨_mn || b.라벨}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function 곁길({ id, 글, 라벨_mn, 누르기, 버튼꼴 }) {
  return (
    <Pressable testID={id ? `곁길-${id}` : undefined} onPress={누르기} hitSlop={10} style={({ pressed }) => [버튼꼴 && s.곁길버튼, pressed && { opacity: 눌림감.글 }]}>
      <Text style={[버튼꼴 ? s.곁길버튼글 : s.곁길글, 라벨_mn && { fontFamily: 버튼꼴 ? 몽골어폰트.강조 : 몽골어폰트.본문 }]}>{라벨_mn || 글}</Text>
    </Pressable>
  );
}

/* 입력 상자 «면» 한 벌 — 비밀 칸은 토글을 안에 앉히려 상자를 줄(View)로 옮겨 지므로 값은 여기 한 곳. */
const 입력틀 = {
  backgroundColor: 색.바탕띄움,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 색.잉크_희미,
  height: 52,                       // 손가락이 닿는 최소치보다 넉넉히
};

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 24, paddingTop: 84, paddingBottom: 48, gap: 18 },
  label: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_태그 },
  title: { fontFamily: 폰트.헤드, fontSize: 26, color: 색.잉크, marginBottom: 6 },

  칸: { gap: 7 },
  칸머리: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  칸라벨: { fontFamily: 폰트.본문, fontSize: 13, color: 색.잉크_서브 },
  // 3번째 글자 층 — 밀도로는 더 못 내려가는 자리라 Stone 을 쓴다(바닥이 Ink Deep 이라 허용).
  칸도움말: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조 },
  입력: {
    ...입력틀,
    paddingHorizontal: 14,
    fontFamily: 폰트.본문,
    fontSize: 16,                   // 16 미만이면 iOS 가 화면을 확대한다
    color: 색.잉크,
  },
  입력_모노: { fontFamily: 폰트.모노, letterSpacing: 1 },
  /* 비밀 칸 — 상자(입력틀)를 줄(View)이 지고 입력은 그 안에서 흐른다. 토글이 상자 «안»
     오른쪽 패딩 자리에 앉아 행 높이 52 그대로다(레이아웃 밀림 0). */
  비밀줄: { ...입력틀, flexDirection: 'row', alignItems: 'center', paddingRight: 14 },
  입력_비밀: { flex: 1, height: '100%', borderWidth: 0, backgroundColor: 'transparent' },

  /* 고른 칩은 **면을 채워** 표시한다 — 테두리만 굵게 하면 22개가 깔린 아이막 줄에서 고른 것을
     눈으로 못 찾는다. 🚫 코랄은 안 쓴다: 이 화면의 신호 1점은 오류 메시지다(위 머리말). */
  보기줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  보기: {
    backgroundColor: 색.바탕띄움,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 색.잉크_희미,
    paddingHorizontal: 13,
    paddingVertical: 10,      // 칩 높이 ≈ 40 — 손가락이 닿는 최소치
  },
  보기_고름: { backgroundColor: 색.잉크, borderColor: 색.잉크 },
  // 비활성 칩(가이드 「곧 와요」) — 잠긴 버튼과 같은 층(눌림층.잠김)이라 새 눈금이 아니다.
  보기_잠김: { opacity: 눌림층.잠김 },
  보기글: { fontFamily: 폰트.본문, fontSize: 14, color: 색.잉크_서브 },
  보기글_고름: { fontFamily: 폰트.강조, color: 색.바탕 },

  선택묶음: {
    backgroundColor: 색.바탕띄움, borderRadius: 14, padding: 16, gap: 14,
  },
  선택머리: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_서브 },
  /* 몽골어 병기 줄 — 키릴은 킷 한글 폰트에 글리프가 없다(두부가 된다). 규격은 그대로,
     폰트만 가른다(`오류_병기` 와 같은 규율). `mn` 이 빈 동안 이 줄은 안 그려진다. */
  선택머리_병기: { fontFamily: 몽골어폰트.강조, fontSize: 13, color: 색.잉크_서브 },
  선택꼬리: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 18, color: 색.잉크_보조 },
  선택꼬리_병기: { fontFamily: 몽골어폰트.캡션, fontSize: 12, lineHeight: 18, color: 색.잉크_보조 },

  오류칸: { minHeight: 20, justifyContent: 'center' },
  오류: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 19, color: 색.신호 },
  /* 신호 1점 규율 유지 — 색은 그대로, 폰트만 가른다(키릴은 킷 한글 폰트에 없다 · 테마 `몽골어` 머리말). */
  오류_병기: { fontFamily: 몽골어폰트.강조, fontSize: 13, lineHeight: 19, color: 색.신호 },

  버튼: {
    backgroundColor: 색.잉크, borderRadius: 14, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  버튼_잠김: { opacity: 눌림층.잠김 },
  버튼_눌림: { opacity: 눌림층.버튼 },
  버튼글: { fontFamily: 폰트.강조, fontSize: 16, color: 색.바탕 },

  갈래: { gap: 14, alignItems: 'center', paddingTop: 6 },
  곁길글: { fontFamily: 폰트.본문, fontSize: 14, color: 색.잉크_보조 },
  /* 첫등록 곁길만 테두리 보조버튼으로 — 처음 온 학생이 제 갈 길을 흐린 글자에서 못 찾는다. */
  곁길버튼: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', alignSelf: 'stretch',
  },
  곁길버튼글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.잉크 },
});
