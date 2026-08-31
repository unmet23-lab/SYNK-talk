import { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { 색, 폰트, 모노트래킹, 글자배율상한, 눌림층 } from './테마';
import { 질문판정 } from '../lib/몽글물음.js';
/* ⚠ 별칭이 필수다 — `src/도착확인.js` 에 동명 로컬 함수 `물어보기` 가 실재해(48행), 맨이름으로
   들면 다음 사람이 두 파일을 오가다 그 둘을 하나로 읽는다(G1-5 충돌 예약). */
import { 물어보기 as 몽글묻기 } from './몽글API.js';

/**
 * 몽글에게 묻기 — 강사·원장이 «지금 정본이 뭐라고 하나»를 묻는 문 (`companion/ask` · G1-5).
 *
 * 🚫 자동 재시도·답 캐시 금지(`src/몽글API.js` 머리말 그대로) — 질문 하나가 `companion_qa`
 *   장부 1행이고 그 장부가 «문서에 없는 것» 목록의 분모다. 다시 묻는 것은 사람 손뿐이다.
 * 🔑 «넘김»은 실패가 아니라 **설계된 정상 결과**다(`lib/몽글물음.js` 급소) — 오류색을 안 쓴다.
 * 🔑 권한은 서버가 정한다 — 학생 토큰이면 403(화면은 숨기지 않는다 · `도착확인` 링크 규칙).
 * 🔑 이 화면의 신호 1점 = 오류 메시지(인증·원장초기화와 같은 문법 — 녹음 버튼이 없어 성립한다).
 */
/* 상한 «근접»의 문턱 — 서버 상한의 10%(질문판정.남은수 기준)라 상한이 바뀌어도 같이 따라간다. */
const 남은수보임문턱 = Math.ceil(질문판정('').남은수 / 10);

export default function 몽글문화면({ 토큰, 돌아가기 }) {
  const [질문, set질문] = useState('');
  const [답, set답] = useState(null);
  const [오류, set오류] = useState('');
  const [도는중, set도는중] = useState(false);

  /* 판정은 lib 하나다 — 상한 숫자를 화면이 적으면 서버 상한이 바뀌는 날 화면만 옛 숫자를 말한다. */
  const 판정 = 질문판정(질문);
  const 쓸수있나 = 판정.보낼수있나 && !도는중;

  async function 보내기() {
    if (!쓸수있나) return;
    set오류(''); set답(null); set도는중(true);
    try {
      set답(await 몽글묻기(토큰, { 질문, 화면: '몽글문' }));
    } catch (e) {
      set오류((e && e.message) || '잠시 뒤 다시 물어봐 주세요');
    } finally {
      set도는중(false);
    }
  }

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <Text style={s.label}>COMPANION</Text>
      <Text style={s.title}>몽글에게 묻기</Text>

      <View style={s.칸}>
        <View style={s.칸머리}>
          <Text style={s.칸라벨}>질문</Text>
          {/* 남은 수는 상한 «근접» 때만 — 평소에 세워 두면 숫자가 질문보다 먼저 읽힌다. */}
          {판정.글자수 > 0 && 판정.남은수 <= 남은수보임문턱 ? (
            <Text style={s.칸도움말}>
              {판정.남은수 >= 0 ? `${판정.남은수}자 남았어요` : 판정.사유}
            </Text>
          ) : null}
        </View>
        <TextInput
          value={질문}
          onChangeText={set질문}
          placeholder="수업 문서에 있는 것부터 답해요"
          placeholderTextColor={색.잉크_희미}
          multiline
          autoCorrect={false}
          maxFontSizeMultiplier={글자배율상한}
          style={s.입력}
        />
      </View>

      <View style={s.오류칸}>{오류 ? <Text style={s.오류}>{오류}</Text> : null}</View>

      <Pressable
        onPress={보내기}
        disabled={도는중}
        style={({ pressed }) => [s.버튼, (!쓸수있나 || 도는중) && s.버튼_잠김, pressed && s.버튼_눌림]}
      >
        {도는중
          ? <ActivityIndicator color={색.바탕} />
          : <Text style={s.버튼글} maxFontSizeMultiplier={글자배율상한}>물어보기</Text>}
      </Pressable>

      {답 && 답.갈래 === '답함' && (
        <View style={s.카드}>
          <Text style={s.답글}>{답.글}</Text>
          {답.출처.length > 0 && (
            <View style={s.출처묶음}>
              <Text style={s.출처머리}>참고한 문서</Text>
              {답.출처.map((이름) => (
                <Text key={이름} style={s.출처}>· {이름}</Text>
              ))}
            </View>
          )}
          {/* 출처 0 으로 답함 = «빈칸 신호»(lib 머리말) — 조용히 삼키면 원장이 「무엇을 문서에
              더해야 하는지」를 영영 못 본다. 오류가 아니라 배지다. */}
          {답.근거없음 && (
            <Text style={s.배지}>참고한 문서 없이 답했어요 — 문서에 더할 후보예요</Text>
          )}
        </View>
      )}
      {답 && 답.갈래 === '넘김' && (
        <View style={s.카드}>
          <Text style={s.넘김글}>{답.사유 || '원장님께 넘겼어요'}</Text>
        </View>
      )}
      {답 && 답.갈래 === '못받음' && (
        <View style={s.카드}>
          <Text style={s.오류}>{답.사유 || '답을 못 받았어요'}</Text>
        </View>
      )}

      <Pressable onPress={돌아가기} hitSlop={10} style={({ pressed }) => [s.돌아가기, pressed && { opacity: 0.6 }]}>
        <Text style={s.돌아가기글}>← 돌아가기</Text>
      </Pressable>
    </ScrollView>
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
  칸도움말: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조 },
  입력: {
    backgroundColor: 색.바탕띄움, borderRadius: 12, borderWidth: 1, borderColor: 색.잉크_희미,
    paddingHorizontal: 14, paddingVertical: 12, minHeight: 120, textAlignVertical: 'top',
    fontFamily: 폰트.본문, fontSize: 16, color: 색.잉크,
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

  카드: { backgroundColor: 색.바탕띄움, borderRadius: 16, padding: 20, gap: 12 },
  답글: { fontFamily: 폰트.본문, fontSize: 15, lineHeight: 24, color: 색.잉크 },
  출처묶음: { gap: 4 },
  출처머리: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_서브 },
  출처: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 18, color: 색.잉크_보조 },
  배지: { fontFamily: 폰트.강조, fontSize: 12, lineHeight: 18, color: 색.잉크_서브 },
  // 인계는 설계된 정상 결과다 — 오류색이 아니라 3번째 글자 층(Stone)으로 말한다.
  넘김글: { fontFamily: 폰트.본문, fontSize: 14, lineHeight: 21, color: 색.잉크_보조 },

  돌아가기: { paddingTop: 6, alignItems: 'center' },
  돌아가기글: { fontFamily: 폰트.본문, fontSize: 14, color: 색.잉크_보조 },
});
