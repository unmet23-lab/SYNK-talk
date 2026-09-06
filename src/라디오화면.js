'use strict';
/**
 * 「밤 라디오」 — 앱에는 유튜브 채널로 가는 링크와 짧은 안내만 (철학 Ⅱ-1 셋째 줄 · v1.22 · 유호 확정 09-06).
 *
 * ■ 이 화면이 «하지 않는» 것이 곧 설계다
 *   앱 안 재생기 없음 · 켜 둔 시간 수집 없음 · 사건 0. 「분산시킬 이유가 없어 · 유튜브에 몰아주자 · 이 수집은 포기하고
 *   링크·가이드만」(유호 09-06). 누가 얼마나 들었는지는 유튜브만 알고 우리는 알려 하지 않는다.
 *   그래서 이 파일은 `사건통로`·`부르기` 를 들여오지 않는다 — 회귀(`tests/라디오화면.test.js`)가 그 부재를 잰다.
 *
 * ■ 링크는 «영구 링크»다 — `youtube.com/@synkkorean/live`(라디오24 설계 §5 · 방송이 끊기면 videoId 가 새것이 되므로
 *   고정 videoId URL 을 앱에 박지 않는다). 채널 정본 = 이름 `SYNK LAB` · 핸들 `@synkkorean`(유호 확정 09-01).
 *
 * ■ ⏳ 「지금 몇 명이 함께」 한 줄(동시 시청자 수)은 유튜브 데이터 API 열쇠가 서야 붙는다 — 그 열쇠는 돈·계정 자리라
 *   유호님 몫이고, 그 전엔 이 화면이 «지어낸 수»를 보이지 않는다(없는 재료로 말하지 않는다).
 */
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { 색, 폰트, 판눈금, 눌림감, 글자배율상한 } from './테마';

/** 학생 노출 링크 — 영구 링크 하나(라디오24 설계 §5 · 유호 확정 09-01 `@synkkorean`). */
export const 라디오링크 = 'https://youtube.com/@synkkorean/live';

/**
 * @param {object} props
 * @param {() => void} props.돌아가기
 * @param {(url: string) => Promise<unknown>} [props.열기]  기본은 OS 브라우저·유튜브 앱(Linking.openURL) — 시험이 갈아 끼운다
 */
export default function 라디오화면({ 돌아가기, 열기 = (url) => Linking.openURL(url) }) {
  return (
    <View style={s.wrap}>
      <Text style={s.머리} maxFontSizeMultiplier={글자배율상한}>밤 라디오</Text>
      <Text style={s.부제} maxFontSizeMultiplier={글자배율상한}>혼자 공부하는 밤, 곁을 채우는 소리.</Text>

      <View style={s.카드}>
        <Text style={s.본문} maxFontSizeMultiplier={글자배율상한}>
          유튜브 채널 SYNK LAB 에서 스물네 시간 돌아요. 켜 두고 공부하면 돼요.
        </Text>
        <Text style={s.본문} maxFontSizeMultiplier={글자배율상한}>
          가르치지 않아요. 그냥 같이 있는 자리예요.
        </Text>
        <Text style={s.메타} maxFontSizeMultiplier={글자배율상한}>
          여기서는 아무것도 모으지 않아요. 얼마나 들었는지는 유튜브만 알아요.
        </Text>
      </View>

      <Pressable
        testID="라디오-열기"
        onPress={() => 열기(라디오링크)}
        accessibilityRole="link"
        accessibilityLabel="유튜브에서 밤 라디오 열기"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={({ pressed }) => [s.주버튼, pressed && { opacity: 눌림감.면 }]}
      >
        <Text style={s.주버튼글} maxFontSizeMultiplier={글자배율상한}>유튜브에서 열기 →</Text>
      </Pressable>

      <Pressable
        onPress={돌아가기}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={({ pressed }) => [s.back, pressed && { opacity: 눌림감.글 }]}
      >
        <Text style={s.backText} maxFontSizeMultiplier={글자배율상한}>← 말하기로 돌아가기</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕, padding: 24, paddingTop: 84, gap: 18 },
  머리: { fontFamily: 폰트.헤드, fontSize: 26, lineHeight: 36, color: 색.잉크 },
  부제: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 26, color: 색.잉크_서브 },
  카드: { backgroundColor: 색.바탕띄움, borderRadius: 판눈금.반경, padding: 판눈금.여백, gap: 10 },
  본문: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 26, color: 색.잉크 },
  메타: { fontFamily: 폰트.본문, fontSize: 13, lineHeight: 20, color: 색.잉크_메타 },
  주버튼: { alignSelf: 'flex-start', borderWidth: 1, borderColor: 색.실땀, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18 },
  주버튼글: { fontFamily: 폰트.본문, fontSize: 16, color: 색.잉크 },
  back: { marginTop: 'auto', paddingVertical: 12 },
  backText: { fontFamily: 폰트.본문, fontSize: 14, color: 색.잉크_메타 },
});
