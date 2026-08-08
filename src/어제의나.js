'use strict';
/**
 * 「어제의 나」 — 학생이 **자기 어제와 견주는** 화면 (P0 §5 **S1-11** · C0 §4-3 ③).
 *
 * ■ 이 화면이 닫는 것 — 조회 3종의 마지막 칸에 소비자가 없었다
 *   `GET /v1/progress` 는 2026-08-07 에 서서 리허설 왕복까지 초록인데(`267d2d7`), **그것을
 *   부르는 화면이 없었다.** ①`tasks`→말하기 ②`corrections`→답장 은 화면이 있고 ③만 비어 있었다.
 *   🔴 그리고 이 앱에는 포인트·스토어·리그가 **없다**(유호님 확정). 그 자리를 대신하는 것이
 *   이 화면 하나라, 비어 있는 동안은 동기 축이 통째로 없는 상태였다.
 *
 * ■ 🔑 S1-3 과 **한 데이터의 양면**이다
 *   교정문 재발화는 수집으로는 3점 종단 라벨이고, 학생에게는 이 화면의 재료다.
 *   지표를 위해 따로 만든 화면이 아니라 **수집이 그대로 동기 부여가 된다**(P0 §5 🔑).
 *
 * ■ 🔴 읽기는 사건을 만들지 않는다
 *   S1-11 은 **조회 전용 · 사건 없음**이다(P0 §10-⑧). 열람 기록이 필요해지면 그때 c7 개정이고,
 *   여기서 미리 보내면 계약에 없는 행이 `learning_events` 에 남는다 — append-only 라 못 지운다.
 *
 * ■ 디자인 (`테마.js` R1·R2)
 *   🚫 **신호(코랄)가 없다.** 이 화면엔 녹음도 오류도 없어서 쓸 자리가 없고, 「좋은 숫자」를
 *   코랄로 칠하면 그 색이 이 앱에서 뜻하는 것(지금 녹음 중)이 흐려진다.
 *   위계는 밀도로 준다(R2) — **늘어난 칸만 잉크 100%**, 나머지는 서브 층이다.
 *   숫자는 DM Mono(숫자 전용) · 한글 라벨은 SUIT(모노에 한글 글리프가 없다).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 부르기 } from './사건통로.js';
import { 견줌, 늘어난말 } from '../lib/견줌.js';

/**
 * 오늘·어제를 읽어 **화면이 그릴 모양**으로 준다. `null` 이면 비교할 어제가 없다(첫날).
 *
 * 🔑 부르는 자리는 `App.js` 하나다 — 링크를 그릴 근거와 화면이 그리는 것이 **같은 한 번의
 *   조회**여야 한다(답장 링크와 같은 규칙). 두 번 읽으면 링크는 떴는데 화면은 비는 날이 온다.
 */
export async function 진행받기(토큰) {
  return 견줌(await 부르기('progress', 토큰));
}

function 견줌줄({ 이름, 축 }) {
  return (
    <View style={s.줄}>
      <Text style={s.이름}>{이름}</Text>
      <Text style={s.수}>{축.어제}</Text>
      {/* 늘어난 칸만 잉크 100% — 색을 더하지 않고 밀도로만 위계를 준다(R2). */}
      <Text style={[s.수, 축.늘었나 ? s.수_오늘 : null]}>{축.오늘}</Text>
    </View>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.값 `진행받기` 결과. 없으면 **화면 자체가 안 뜬다**(App.js 가 링크를 안 그린다).
 * @param {() => void} props.돌아가기
 */
export default function 어제의나({ 값, 돌아가기 }) {
  const 늘었다 = 값 ? 늘어난말(값) : null;
  return (
    <View style={s.wrap}>
      <Text style={s.머리}>어제의 나</Text>

      {값 ? (
        <View style={s.카드}>
          <View style={s.줄}>
            <Text style={s.이름} />
            <Text style={s.칸이름}>어제</Text>
            <Text style={s.칸이름}>오늘</Text>
          </View>

          <견줌줄 이름="낸 것" 축={값.낸것} />
          <견줌줄 이름="다시 말한 것" 축={값.다시말한것} />

          {/* 🔑 이 한 줄이 지금 설계의 **유일한 결과 변수**다(L0 §9-2) — 「연습을 많이 했다」와
              다른 축이라 위 표에 숫자로 섞지 않는다. 오늘 이어졌을 때만 말한다. */}
          {값.교정재발화.오늘 ? (
            <Text style={s.고리}>어제 받은 교정을 오늘 다시 말했어요.</Text>
          ) : null}

          {늘었다 ? <Text style={s.늘어남}>{늘었다}</Text> : null}
        </View>
      ) : null}

      <Pressable onPress={돌아가기} style={({ pressed }) => [s.back, pressed && { opacity: 0.7 }]}>
        <Text style={s.backText}>← 말하기로 돌아가기</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕, padding: 24, paddingTop: 84, gap: 18 },

  머리: { fontFamily: 폰트.헤드, fontSize: 26, lineHeight: 36, color: 색.잉크 },

  카드: { backgroundColor: 색.바탕띄움, borderRadius: 20, padding: 22, gap: 14 },

  줄: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  이름: { flex: 1, fontFamily: 폰트.본문, fontSize: 16, lineHeight: 26, color: 색.잉크_서브 },
  칸이름: {
    width: 52, textAlign: 'right',
    fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 26, color: 색.잉크_메타,
  },
  수: {
    width: 52, textAlign: 'right',
    fontFamily: 폰트.모노, fontSize: 20, lineHeight: 26,
    letterSpacing: 모노트래킹.타이머, color: 색.잉크_서브,
  },
  수_오늘: { color: 색.잉크 },

  고리: { fontFamily: 폰트.강조, fontSize: 15, lineHeight: 24, color: 색.잉크 },
  늘어남: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 21, color: 색.잉크_보조 },

  back: { paddingTop: 8 },
  backText: {
    fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_메타,
  },
});
