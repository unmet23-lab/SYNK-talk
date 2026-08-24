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
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 견줌 } from '../lib/견줌.js';
import { 연출대본 } from '../lib/마스코트생명.js';
import { 표정속도, 목소리판정 } from '../lib/몽글목소리.js';
import { 효과음 } from './소리.js';
import 어제의나 from './어제의나';
import 마스코트 from './마스코트';

/* 서버 응답 모양 그대로 — 정본(`견줌`)이 화면이 읽는 꼴로 접는다.
   어제 1 → 오늘 3 (두 칸 오름) · 다시 말한 것 0 → 1 · 교정 재발화 있음 = 결론 두 줄이 다 선다. */
/* 표정별 «쓰이는 자리» — 화면이 이 말을 짓지 않는다. 배치의 정본은 `src/마스코트.js` 의
   사건 갈래이고, 여기 적는 것은 그 자리를 사람 말로 옮긴 안내다(값이 아니라 설명). */
const 표정줄 = [
  { 이름: '기쁨', 쓰임: '틀린 데 없는 답장을 처음 열 때 · 완료 축하 · 다시 도전할 때' },
  { 이름: '물음', 쓰임: '몽글이 질문할 때 · 화면이 한마디 건넬 때' },
  { 이름: '기본', 쓰임: '몸을 톡 누를 때 · 평상시 혼잣말' },
  { 이름: '안심', 쓰임: '고칠 데가 남은 답장 — 낮고 느리게(밝은 소리를 안 쓰는 자리)' },
  { 이름: '잠결', 쓰임: '한참 안 만졌거나 밤일 때 · 몽글이 졸릴 때' },
];

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

  /* 🔑 앱과 «같은 통로»로 낸다 — 판정(겹침·미세변주)을 지나고 어댑터가 재생한다.
     여기서 효과음을 직접 부르면 이 지면만 다른 소리가 나고, 그때 검수는 거짓말이 된다.
     겹침막기 때문에 빠르게 두 번 누르면 두 번째가 조용한 것이 «정상»이다. */
  const 마지막 = useRef(0);
  const 표정듣기 = (표정) => {
    const 답 = 목소리판정({ 표정, 지금: Date.now(), 마지막: 마지막.current, 흔들: Math.random() });
    if (!답.낼까) return;
    마지막.current = Date.now();
    효과음('mongle', 답.속도);
  };

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

        {/* ── ② 몽글 만지기 — 탭 반응(쫀득 + 옹알이) ──────────────────────────
            🔴 이 칸이 08-25 에 생긴 이유: ④ 의 몽글은 늘 «연기 중»이라 탭 = 건너뛰기다 —
            탭 반응(쫀득·소리)에 원리상 못 닿는다. 유호님이 「소리가 안 난다」고 보신 실물이
            그 구멍이었다. 상주 몽글(답장 화면과 같은 모드)이 서야 탭 반응이 보인다. */}
        <View style={s.칸}>
          <View style={s.칸머리}>
            <Text style={s.칸이름}>② 몽글 만지기 — 탭 반응</Text>
          </View>
          <Text style={s.눈금}>
            몸을 톡 누르면: 쫀득(눌렸다 스프링 복원) + 목소리 + 표정. 가끔 살짝 튀고,
            가끔 한마디 합니다. 말할 때도 목소리가 함께 납니다.
          </Text>
          <View style={[s.무대, s.무대_연기]}>
            <마스코트 자리={{ top: 40, right: 24 }} />
          </View>
        </View>

        {/* ── ③ 목소리 표정 다섯 — 앱에서 «어느 순간에» 나는지와 함께 ──────────────
            파일은 「무?」 하나이고 표정은 재생 속도가 만든다(유호 확정 08-25). 여기서 다섯을
            나란히 눌러 보면 사다리(기쁨 → 잠결)가 귀에 잡힌다. 누를 때마다 ±3% 흔들리므로
            같은 버튼을 두 번 눌러도 똑같이 들리지 않는 것이 정상이다. */}
        <View style={s.칸}>
          <View style={s.칸머리}>
            <Text style={s.칸이름}>③ 목소리 표정 다섯</Text>
          </View>
          <Text style={s.눈금}>
            같은 소리를 속도로 갈랐습니다. 앱에서는 아래 «쓰이는 자리»에서 저절로 납니다 —
            여기서는 확인하려고 손으로 눌러 봅니다.
          </Text>
          {표정줄.map(({ 이름, 쓰임 }) => (
            <Pressable
              key={이름}
              onPress={() => 표정듣기(이름)}
              style={({ pressed }) => [s.표정칸, pressed && s.눌림]}
            >
              <Text style={s.표정이름}>{이름}</Text>
              <Text style={s.표정속도}>×{표정속도[이름].toFixed(2)}</Text>
              <Text style={s.표정쓰임}>{쓰임}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── ④ 몽글 «그 자리 연기» — 트랙에 유호님 눈검수로 대기 중이던 자리 ── */}
        <View style={s.칸}>
          <View style={s.칸머리}>
            <Text style={s.칸이름}>④ 몽글 «그 자리 연기» — 세 대본 (연기 중 탭 = 건너뛰기)</Text>
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

  표정칸: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 색.바탕띄움, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14,
  },
  표정이름: { fontFamily: 폰트.강조, fontSize: 15, color: 색.잉크, width: 42 },
  표정속도: { fontFamily: 폰트.모노, fontSize: 12, color: 색.실땀, width: 44 },
  표정쓰임: { flex: 1, fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 17, color: 색.잉크_메타 },

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
