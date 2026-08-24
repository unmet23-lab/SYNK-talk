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
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 부르기 } from './사건통로.js';
import { 견줌, 늘어난말 } from '../lib/견줌.js';
import { use등장, use세는수 } from '../lib/모션.js';

/**
 * 오늘·어제를 읽어 **화면이 그릴 모양**으로 준다. `null` 이면 비교할 어제가 없다(첫날).
 *
 * 🔑 부르는 자리는 `App.js` 하나다 — 링크를 그릴 근거와 화면이 그리는 것이 **같은 한 번의
 *   조회**여야 한다(답장 링크와 같은 규칙). 두 번 읽으면 링크는 떴는데 화면은 비는 날이 온다.
 */
export async function 진행받기(토큰) {
  const 몸 = await 부르기('progress', 토큰);
  /* Ⅲ⑥ — 성향 확인 카드는 견줌과 «독립»이다: 견줌은 첫날 null 인데(비교할 어제가 없다) 확인은
   * 첫날에도 설 수 있다(리듬 표본이 서면). 한 조회 규율은 그대로 — 봉투 하나를 갈라 담을 뿐이다. */
  return { 견줌: 견줌(몸), 오늘의확인: (몸 && 몸.오늘의확인) || null };
}

function 견줌줄({ 이름, 축 }) {
  /* 오늘 칸이 **어제 값에서 오늘 값으로 세어 오른다**(유호님 지시 08-24 · `lib/모션.use세는수`).
   * 🔑 0 이 아니라 **어제**에서 출발한다 — 이 화면이 묻는 것은 「얼마나 했나」가 아니라
   *   「어제를 넘었나」라, 넘는 그 칸수만큼만 오르는 것이 화면의 뜻과 같다.
   * 🚫 늘어난 축만 센다(`켬={축.늘었나}`) — 줄어든 날 내려 세면 그건 동기가 아니라 평가다
   *   (`lib/견줌.js` 의 「늘었나는 엄격히 클 때만」·②회귀와 같은 축).
   * 🚫 어제 칸은 세지 않는다 — 지난 사실은 확정값으로 서 있어야 오늘이 그것을 넘는 게 보인다.
   * 지연 280ms = 카드 등장(260ms)이 «끝난 뒤». 이 화면의 박자 순서는 이야기 순서와 같다 —
   *   카드가 자리 잡고 → 수가 오르고 → 그 수에 대한 말(아래 고리·늘어남)이 붙는다. */
  const 오늘수 = use세는수({ 부터: 축.어제, 까지: 축.오늘, 켬: 축.늘었나, 지연: 280 });
  return (
    <View style={s.줄}>
      <Text style={s.이름}>{이름}</Text>
      <Text style={s.수}>{축.어제}</Text>
      {/* 늘어난 칸만 잉크 100% — 색을 더하지 않고 밀도로만 위계를 준다(R2). */}
      <Text style={[s.수, 축.늘었나 ? s.수_오늘 : null]}>{오늘수}</Text>
    </View>
  );
}

/* 표 «다음»에 오는 결론 줄 — 수가 오른 뒤에 그 수에 대한 말이 붙는다(위 견줌줄 지연 주석).
 * 두 줄은 서로 다른 지연을 받아 차례로 선다(고리 → 늘어남): 둘이 동시에 뜨면 어느 쪽이
 * 결론인지 흐려진다. reduce-motion 이면 지연도 애니메이션도 0이다(`lib/모션.js`).
 * ⚠ 지연은 «수가 다 오른 뒤»를 겨눈 값이라 칸수가 아주 많은 날(어제 1 → 오늘 20 같은)에는
 *   말이 먼저 붙는다. 그 경우까지 맞추려면 세기 종료를 기다려야 하는데, 그러면 이 줄이
 *   수에 «묶여» 수가 없는 날에도 지연을 받는다 — 흔한 쪽을 맞추고 드문 쪽을 버렸다. */
function 뒤따르는줄({ style, 지연, children }) {
  const 등장 = use등장({ 올라옴: 4, 시간: 220, 지연 });
  return <Animated.Text style={[style, 등장]}>{children}</Animated.Text>;
}

/**
 * @param {object} props
 * @param {object|null} props.값 `진행받기` 결과. 없으면 **화면 자체가 안 뜬다**(App.js 가 링크를 안 그린다).
 * @param {() => void} props.돌아가기
 */
export default function 어제의나({ 값, 돌아가기 }) {
  const 늘었다 = 값 ? 늘어난말(값) : null;
  /* 등장 한 박자(08-24 · `lib/모션.js` 머리말) — 이 화면은 포인트·리그가 없는 앱에서 **동기 축을
   * 혼자 지는 자리**인데(위 머리말) 박자가 0이라 표가 순간 팝으로 섰다.
   * 수 세어 오르기는 **유호님 지시로 들어왔다**(08-24 · 위 `견줌줄`) — 처음엔 「성적표가 점수판이
   * 된다」는 우려로 안 넣었으나, 유호님이 넣으라 하셨다. 규율과 부딪히는 자리(줄어든 날)는
   * 세지 않는 것으로 갈랐다. */
  const 카드등장 = use등장();
  return (
    <View style={s.wrap}>
      <Text style={s.머리}>어제의 나</Text>

      {값 ? (
        <Animated.View style={[s.카드, 카드등장]}>
          <View style={s.줄}>
            <Text style={s.이름} />
            <Text style={s.칸이름}>어제</Text>
            <Text style={s.칸이름}>오늘</Text>
          </View>

          <견줌줄 이름="보낸 것" 축={값.낸것} />
          <견줌줄 이름="다시 말한 것" 축={값.다시말한것} />

          {/* 🔑 이 한 줄이 지금 설계의 **유일한 결과 변수**다(L0 §9-2) — 「연습을 많이 했다」와
              다른 축이라 위 표에 숫자로 섞지 않는다. 오늘 이어졌을 때만 말한다. */}
          {값.교정재발화.오늘 ? (
            <뒤따르는줄 style={s.고리} 지연={460}>어제 받은 교정을 오늘 다시 말했어요.</뒤따르는줄>
          ) : null}

          {늘었다 ? <뒤따르는줄 style={s.늘어남} 지연={540}>{늘었다}</뒤따르는줄> : null}
        </Animated.View>
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
