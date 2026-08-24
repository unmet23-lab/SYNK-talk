'use strict';
/**
 * 검수문 — **개발 빌드에서만 열리는** 눈검수 자리 (2026-08-24).
 *
 * ■ 왜 있나 — 「유호님 눈검수」가 트랙에 쌓이는데 볼 길이 없었다
 *   화면들은 전부 «서버 데이터가 있어야» 닿는다: 「어제의 나」는 어제·오늘 발화가 둘 다
 *   서버에 있어야 링크가 그려지고, 완료 카드는 실제로 녹음·제출해야 서고, 답장은 교정이
 *   와 있어야 한다. 그래서 에뮬레이터를 띄워도 **로그인 화면 말고는 볼 것이 없었다**(08-24 실측).
 *   박자·연기처럼 «움직임»을 판정하려면 그 자리에 닿는 문이 하나 필요하다.
 *
 * ■ 🔴 이 문은 학생 앱에 남지 않는다
 *   `App.js` 의 진입이 `__DEV__` 안에 있다 — 프로덕션 번들에서 `__DEV__` 는 false 로 치환되고
 *   그 가지는 통째로 제거된다. 이 파일이 import 되는 것도 그 가지 안이다.
 *
 * ■ 🔑 값은 **정본을 지나서** 만든다
 *   견줌 픽스처를 손으로 적지 않고 `lib/견줌.js` 에 서버 응답 모양을 넣어 접게 한다 —
 *   손으로 적으면 그게 두 벌이고, 정본이 바뀐 날 이 문이 «옛 모양»을 보여주며 초록이 된다
 *   (`tests/화면렌더.test.js` ① 이 같은 이유로 정본에 접는다).
 *
 * ■ ⚠ 이 문이 재는 것과 못 재는 것
 *   ✅ 박자·연기·배치처럼 «화면이 어떻게 움직이나»
 *   🚫 조회·전송·저장 — 여기 값은 가짜다. 그 층은 왕복시험과 회귀가 진다.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 견줌 } from '../lib/견줌.js';
import { 연출대본 } from '../lib/마스코트생명.js';
import 어제의나 from './어제의나';
import 마스코트 from './마스코트';

/* 서버 응답 모양 그대로 — 정본(`견줌`)이 화면이 읽는 꼴로 접는다.
   어제 1 → 오늘 3 (두 칸 오름) · 다시 말한 것 0 → 1 · 교정 재발화 있음 = 결론 두 줄이 다 선다. */
const 견줌픽스처 = 견줌({
  date: '2026-08-24',
  data: [{
    today: { submission_count: 3, retry_count: 1, correction_retry: true },
    yesterday: { submission_count: 1, retry_count: 0, correction_retry: false },
  }],
});

export default function 검수문({ 돌아가기 }) {
  /* 다시 재생 = **키를 갈아 재마운트**한다. 박자는 마운트당 1회라(lib/모션) 이 방법이 유일하다. */
  const [회차, set회차] = useState(0);
  const [연기, set연기] = useState(null);   // 지금 도는 몽글 대본 이름

  const 다시 = () => { set회차((n) => n + 1); set연기(null); };

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={s.inner}>
        <Text style={s.브랜드}>SYNK TALK · 검수문</Text>
        <Text style={s.머리}>눈으로 볼 자리</Text>
        <Text style={s.단서}>
          개발 빌드에서만 열립니다. 여기 숫자·글은 «가짜»예요 — 박자와 연기만 보시면 됩니다.
        </Text>

        {/* ── ① 어제의 나 — 수 세어 오르기(유호 판정 08-24 · 칸당 190ms) ── */}
        <View style={s.칸}>
          <View style={s.칸머리}>
            <Text style={s.칸이름}>① 어제의 나 — 수가 «어제»에서 오른다</Text>
            <Pressable onPress={다시} style={({ pressed }) => [s.버튼, pressed && s.눌림]}>
              <Text style={s.버튼글}>다시 재생</Text>
            </Pressable>
          </View>
          {/* 🚫 결론 두 줄의 «문장»을 여기 적지 않는다 — 늘어난 말의 정본은 `lib/견줌.js`
              하나이고, 사본이 생기면 정본이 바뀐 날 이 눈금이 옛 문장을 보여준다
              (`tests/` 의 사본 금지 회귀가 그 자리를 지킨다). 자리만 가리킨다. */}
          <Text style={s.눈금}>
            카드 0~260ms → 수 280~660ms(1→2→3 · 칸당 190) → 결론 첫 줄 700 → 둘째 줄 780
          </Text>
          <View style={s.무대}>
            <어제의나 key={`어제-${회차}`} 값={견줌픽스처} 돌아가기={() => {}} />
          </View>
        </View>

        {/* ── ② 몽글 «그 자리 연기» — 트랙에 유호님 눈검수로 대기 중이던 자리 ── */}
        <View style={s.칸}>
          <View style={s.칸머리}>
            <Text style={s.칸이름}>② 몽글 «그 자리 연기» — 세 대본</Text>
          </View>
          <Text style={s.눈금}>
            대본 하나를 골라 누르면 그 자리에서 한 번 연기하고 몸이 내려갑니다(총 ~9초).
            🚫 상주는 안 합니다 — 등장·퇴장이 정답이라는 확정 그대로예요.
          </Text>
          <View style={s.고름줄}>
            {['말하기인트로', '답하기질문', '완료축하'].map((이름) => (
              <Pressable
                key={이름}
                onPress={() => { set연기(null); setTimeout(() => set연기(이름), 60); }}
                style={({ pressed }) => [s.고름, 연기 === 이름 && s.고름_지금, pressed && s.눌림]}
              >
                <Text style={s.고름글}>{이름}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[s.무대, s.무대_연기]}>
            {연기 && (
              <마스코트
                key={`${연기}-${회차}`}
                잡담={false}
                자리={{ top: 12, right: 16 }}
                연출={{
                  대본: 연출대본[연기],
                  채움: { 질문: '어제 친구랑 뭐 했어요?' },   // 답하기질문 대본의 슬롯
                  끝나면: () => set연기(null),
                }}
              />
            )}
            {!연기 && <Text style={s.빈무대}>위에서 대본을 고르면 여기서 연기합니다</Text>}
          </View>
        </View>

        <Pressable onPress={돌아가기} style={({ pressed }) => [s.back, pressed && s.눌림]}>
          <Text style={s.backText}>← 돌아가기</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 20, paddingTop: 72, paddingBottom: 56, gap: 18 },

  브랜드: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_태그 },
  머리: { fontFamily: 폰트.헤드, fontSize: 26, color: 색.잉크 },
  단서: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 20, color: 색.잉크_메타 },

  칸: { gap: 10, marginTop: 12 },
  칸머리: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  칸이름: { flex: 1, fontFamily: 폰트.강조, fontSize: 15, color: 색.잉크 },
  눈금: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 19, color: 색.잉크_메타 },

  무대: {
    backgroundColor: 색.바탕띄움, borderRadius: 18, overflow: 'hidden',
  },
  무대_연기: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  빈무대: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_메타 },

  고름줄: { flexDirection: 'row', gap: 8 },
  고름: {
    flex: 1, borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 11,
    paddingVertical: 9, alignItems: 'center',
  },
  고름_지금: { borderColor: 색.잉크 },
  고름글: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크 },

  버튼: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 11,
    paddingVertical: 7, paddingHorizontal: 13,
  },
  버튼글: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크 },
  눌림: { opacity: 0.7 },

  back: { paddingTop: 14 },
  backText: {
    fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_메타,
  },
});
