import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { 색, 폰트 } from './테마';
import { 목표사건 } from '../lib/목표확인.js';
import { 목표반응 } from '../contents/문구_목표확인.js';
import { 흐름id } from '../lib/제출로그.js';
import { 게임사건담기, 게임큐밀기 } from './게임큐.js';

/* 목표 왕복 카드 — 「오늘 아침에 말한 목표, 해냈어요?」 (교실 수집 ② · 계약 c14 ·
 * 유호 확정 08-31 「웅 그대로 가」 · 정본 = appsscript docs/교실수집_목표왕복_설계_v1.md).
 *
 * ■ 자리 = 말하기 화면 «머리»(학생이 밤에 어차피 여는 그 화면 · 새 화면 0 · 결정문 「그날 지켰나」).
 * ■ 서버(progress)가 카드를 낼지 정하고(하루 1회 · 평일 근사 — lib/목표확인.js 정본),
 *   이 컴포넌트는 배치만 한다. 카드가 null 이면 아무것도 안 그린다 — «없어도 되는» 꼬리.
 * ■ 「아직」은 벌이 아니다 — 두 단추 같은 무게(교수멘탈 확인 카드의 그 규율 · 신호색 0) ·
 *   안 누르면 무사건 · 재촉 0. 답하면 즉시 반응 한 줄이 서고 카드는 접힌다(반영이 «보이는» 자리).
 * ■ 전송 = 게임큐(직렬·멱등·오프라인 안전 — 교수멘탈 확인답하기와 같은 통로). 담기가 죽어도
 *   반응은 선다 — 다음 노출은 서버 행 기준이라 거짓 하루 1회가 안 생긴다.
 */
export default function 목표카드({ 카드 = null, 토큰 = null, 답뒤 = null }) {
  const [답, set답] = useState(null);
  /* 한 카드 = 한 앉음 — correlation_id 는 마운트당 하나(제출 흐름의 앉음과 섞지 않는다:
   * 이 카드는 오늘 과제와 별개의 왕복이라 같은 키로 묶으면 「같이 낸 쌍」이 거짓이 된다). */
  const 앉음 = useRef(흐름id());

  if (!카드 && !답) return null;

  const 답하기 = async (값) => {
    const 사건 = 목표사건(카드, 값, { correlation_id: 앉음.current, idempotency_key: 흐름id() });
    if (!사건) return;
    set답(값);
    try {
      const { 새것 } = await 게임사건담기(사건, null);
      if (새것) 게임큐밀기(토큰, null).catch(() => {});
    } catch { /* 담기 실패 — 반응은 이미 섰고, 다음 노출은 서버 행 기준이다 */ }
    if (답뒤) 답뒤();
  };

  if (답) {
    return (
      <View style={s.카드}>
        <Text style={s.반응글}>{(목표반응(답) || []).join(' ')}</Text>
      </View>
    );
  }

  return (
    <View style={s.카드}>
      <Text style={s.라벨}>오늘의 목표</Text>
      {(카드.문장 || []).map((줄, i) => (
        <Text key={i} style={s.본문}>{String(줄)}</Text>
      ))}
      <View style={s.단추줄}>
        {Object.entries(카드.답라벨 || {}).map(([값, 라벨]) => (
          <Pressable
            key={값}
            onPress={() => 답하기(값)}
            accessibilityRole="button"
            style={({ pressed }) => [s.단추, pressed && s.눌림]}
          >
            <Text style={s.단추글}>{String(라벨)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* 스타일은 교수멘탈 확인 카드의 그 눈금 그대로다(카드/카드라벨/본문글/확인단추 —
 * 두 카드가 다른 무게로 서면 학생 눈에 「더 중요한 질문」이 생긴다 · 신호색 0). */
const s = StyleSheet.create({
  카드: { backgroundColor: 색.바탕띄움, borderRadius: 20, padding: 22, gap: 10, marginBottom: 12 },
  라벨: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_태그 },
  본문: { fontFamily: 폰트.본문, fontSize: 15, lineHeight: 24, color: 색.잉크_서브 },
  단추줄: { flexDirection: 'row', gap: 8, marginTop: 4 },
  단추: { flex: 1, borderWidth: 1, borderColor: 색.선, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  눌림: { opacity: 0.7 },
  단추글: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크 },
  반응글: { fontFamily: 폰트.본문, fontSize: 14, lineHeight: 21, color: 색.잉크_서브 },
});
