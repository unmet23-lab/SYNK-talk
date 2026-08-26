/* 반짝임 — «기쁨 한 박자»를 한 번 재생하는 층 (유호 확정 08-27 ③ · 재질 08-27 오후 정정).
 *
 * ■ 🔴 왜 Lottie 를 떠났나 (유호 지시 08-27 「전부 우리 loom 엔진 재질이어야 하는데
 *   너무 2d 싸구려 느낌의 별인데? loom 엔진 사용해서 명품화를 진행해야할것같은데」)
 *   1판은 Lottie 벡터 도형(별 셋)이었다. 값은 「JSON 이라 AI 가 열어 고친다」였는데,
 *   **재질이 브랜드 밖**이었다 — 앱의 모든 요소는 펠트 실물인데 축하의 순간에만 평면
 *   벡터가 떴다. 재질은 파일 포맷보다 위다.
 *   ⇒ 별을 요소 라이브러리에서 **다시 구웠다**(`요소굽기.py` 기호=별 · 킷 「기쁨」 두 색 ·
 *     투명=1 · 1800px). 굽기·변환 통로는 `tools/반짝별변환.py` 머리말이 쥔다.
 *   🔑 털 후광이 그대로 «빛번짐» 노릇을 한다 — 벡터로는 흉내 내려면 글로우를 따로 그려야
 *     했고, 그건 이 세계에 없는 빛이다. 실물을 구우니 그 빛이 «재료에서» 나왔다.
 *
 * ■ 왜 Animated 인가 (Skia·Reanimated 를 두고)
 *   움직이는 것이 스케일·회전·불투명도뿐이라 **네이티브 드라이버가 전부 지원한다**
 *   (모션 스택 실측 08-27: 이 앱의 `useNativeDriver:false` 는 0곳이다).
 *   Skia 는 애니메이션을 걸려면 Reanimated 가 필요한데 그건 **보류로 판정이 끝났다**(②).
 *   ⇒ 여기서 Animated 는 «못 해서 쓰는 것»이 아니라 이 일에 정확히 맞는 자다.
 *
 * ■ 박자는 1판 그대로다 — 별 셋이 0 · 167 · 333ms 에 차례로 뜬다(60fps 의 0/10/20프레임).
 *   한 별의 상대 곡선도 1판과 같다: 튀어오름 233ms → 가라앉음 433ms → 사그라짐 867ms.
 *   ⇒ 마지막 별이 333+867 = 1200ms 에 끝나고, 총길이는 1.30초 그대로.
 *   🔑 1판은 셋이 **같은 자리에 겹쳐** 있어 큰 별이 잔별 둘을 통째로 덮었다(08-27 실렌더
 *      실측 — 「셋」이라 적어 두고 하나만 보였다). 자리를 갈라 둔 것이 그 수리다.
 *
 * ■ 색은 킷에서만 온다
 *   큰 별 Butter #F5C445 · 잔별 Butter Soft #FFEBB0 — 킷이 「기쁨(별·보상)」에 준 자리다.
 *   🚫 코랄을 쓰지 않는다: 이 앱에서 코랄은 «지금 녹음 중»을 뜻하고, 기쁨에 그 색을 쓰면
 *   신호가 흐려진다(어제의나 머리말과 같은 규율).
 *
 * ■ 이 층은 «스스로 켜지지» 않는다
 *   부르는 화면이 `보임`을 참으로 줄 때만 한 번 돈다. 반복이 없다 — 화면에 계속 도는
 *   축하는 축하가 아니라 소음이고, 그건 유호님이 포인트·리그를 빼신 결과 그대로다.
 *   `줄임`(reduce-motion)이면 아예 아무것도 그리지 않는다 — 마스코트와 같은 게이트다.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';

const 그림 = {
  큰: require('../assets/모션/반짝별_큰.webp'),
  잔: require('../assets/모션/반짝별_잔.webp'),
};

/* 한 별의 상대 박자(ms) — 1판(반짝.json)의 키프레임을 그대로 옮겼다. */
const 튐 = 233;      // 0 → 가장 큰 순간(살짝 넘겼다 온다)
const 앉음 = 433;    // 가라앉아 제 크기
const 끝 = 867;      // 사그라져 사라진다

/* 별 셋 — 늦음·크기·자리·회전. 자리는 상자 변 대비 비율(0~1)이고 중심 기준이다.
   🔑 크기비는 «털 후광까지» 포함한 변이다 — 펠트 별의 몸은 그 안쪽 약 72%다. */
const 별들 = [
  { 그림: '큰', 늦음: 0,   크기비: 0.66, x: 0.50, y: 0.50, 회전: [-22, 22] },
  { 그림: '잔', 늦음: 167, 크기비: 0.34, x: 0.78, y: 0.27, 회전: [40, -40] },
  { 그림: '잔', 늦음: 333, 크기비: 0.25, x: 0.24, y: 0.74, 회전: [-55, 55] },
];

/** 폴백이 없다 — 그림 두 장과 Animated 뿐이라 어느 환경에서도 선다(웹 포함).
 *  창구는 남긴다: 부르는 쪽이 «되나»를 묻는 문법을 마스코트몸과 맞춘다. */
export function 쓸수있나() {
  return { 된다: true, 까닭: null };
}

function 한별({ 몫, 변, 돌까 }) {
  /* 0 → 1 을 «끝(867ms)»에 대응시킨다. 구간마다 이징이 달라 sequence 로 나눈다:
     튀어오름은 out(cubic)으로 «탁» 서고, 가라앉음은 inOut(quad)로 부드럽게,
     사그라짐은 linear 로 고르게 — 마지막에 이징을 걸면 «멈칫»이 보인다. */
  const 값 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!돌까) return undefined;
    값.setValue(0);
    const 네이티브 = Platform.OS !== 'web';
    const 연출 = Animated.sequence([
      Animated.delay(몫.늦음),
      Animated.timing(값, { toValue: 튐 / 끝, duration: 튐, easing: Easing.out(Easing.cubic), useNativeDriver: 네이티브 }),
      Animated.timing(값, { toValue: 앉음 / 끝, duration: 앉음 - 튐, easing: Easing.inOut(Easing.quad), useNativeDriver: 네이티브 }),
      Animated.timing(값, { toValue: 1, duration: 끝 - 앉음, easing: Easing.linear, useNativeDriver: 네이티브 }),
    ]);
    연출.start();
    return () => 연출.stop();
  }, [값, 몫, 돌까]);

  const 크기 = 변 * 몫.크기비;
  /* 스케일 마디는 1판의 비(1.00 : 0.82 : 0.70)를 그대로 쓴다 — 「가장 큰 순간」을 1로 잡고
     제 크기가 그 82%다. 그래서 튐이 «넘쳤다 돌아오는» 것으로 읽힌다. */
  const 스케일 = 값.interpolate({
    inputRange: [0, 튐 / 끝, 앉음 / 끝, 1],
    outputRange: [0, 1, 0.82, 0.70],
  });
  const 투명도 = 값.interpolate({
    inputRange: [0, 133 / 끝, 567 / 끝, 1],
    outputRange: [0, 1, 1, 0],
  });
  const 각 = 값.interpolate({
    inputRange: [0, 1],
    outputRange: [`${몫.회전[0]}deg`, `${몫.회전[1]}deg`],
  });

  return (
    <Animated.Image
      source={그림[몫.그림]}
      resizeMode="contain"
      style={{
        position: 'absolute',
        width: 크기,
        height: 크기,
        left: 변 * 몫.x - 크기 / 2,
        top: 변 * 몫.y - 크기 / 2,
        opacity: 투명도,
        transform: [{ scale: 스케일 }, { rotate: 각 }],
      }}
    />
  );
}

/**
 * @param {object} props
 * @param {boolean} props.보임 참이 되는 «그 순간» 한 번 돈다. 화면이 켠다.
 * @param {number} [props.크기] 정사각 변(px). 기본 120.
 * @param {boolean} [props.줄임] reduce-motion — 참이면 아무것도 그리지 않는다.
 * @param {Function} [props.끝나면] 재생이 끝나면 한 번 불린다(화면이 내릴 때 쓴다).
 */
export default function 반짝임({ 보임, 크기 = 120, 줄임 = false, 끝나면 = null }) {
  const 마침 = useRef(끝나면);
  마침.current = 끝나면;

  useEffect(() => {
    if (!보임 || 줄임 || !마침.current) return undefined;
    /* 마지막 별이 끝나는 순간 + 잔여 한 박자(1판 합성 길이 1.30초와 같게 맞춘다). */
    const t = setTimeout(() => { if (마침.current) 마침.current(); }, 별들[별들.length - 1].늦음 + 끝 + 100);
    return () => clearTimeout(t);
  }, [보임, 줄임]);

  if (!보임 || 줄임) return null;

  return (
    <View style={{ width: 크기, height: 크기 }} pointerEvents="none">
      {별들.map((몫, i) => (
        <한별 key={i} 몫={몫} 변={크기} 돌까={보임} />
      ))}
    </View>
  );
}
