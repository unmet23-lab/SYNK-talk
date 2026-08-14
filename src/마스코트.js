/* 마스코트 — 살아있는 반응 층 (행동 정본 = 캐릭터_생명감_설계.md v1.1 · 그림 = 마스코트_렌더 6컷).
 *
 * ■ 살아있음은 그림이 아니라 «반응의 사실»에서 온다 (생명감 §0)
 *   ① 반응성 — 화면이 준 사건(`사건` prop)에 즉시 표정·몸짓으로 응답한다(전부 로컬 · 서버 왕복 0).
 *   ② 자발성 — 아무도 안 건드려도 부유·깜빡임·두리번·드문 혼잣말(idle)이 돈다.
 *   ③ 기억감 — 이 층은 아직 0이다(궤적 반응은 서버 꼬리 «종류» 칸이 응답에 없어 재료가 없다 ·
 *      생명감 §5 「미리 안 연다」). 재료가 서는 날 사건 이름 하나로 열린다.
 *
 * ■ 원칙 넷의 기계 자리 (생명감 §1)
 *   · 무언이 기본 — 첫 언어는 표정·몸짓이고 말풍선은 «가끔»(사건당 최대 1회 · 확률 절반).
 *   · 평가하지 않는다 — 문구는 전부 `lib/마스코트생명.혼잣말` 상수에서만 온다(여기서 짓지 않는다).
 *   · 학습을 방해하지 않는다 — `지금녹음중()`(소리 게이트와 **같은 경계**)이면 표정·몸짓·말 전부
 *     정지 · reduce-motion 이면 정지 화면(타이머 0) · 오류 순간에 부정 반응 금지(슬픔 컷 자체가 없다).
 *   · 감정은 지나간다 — 사건 표정은 «기본복귀» 뒤 기본으로 돌아온다(눌러앉은 표정 = 밤·방치의 졸림뿐).
 *
 * ■ 별눈은 여기 없다 — 의도다. 생애급 게이트(`lib/마스코트생명.별눈판정`)를 지나지 않고는
 *   화면이 그 컷을 세울 수 없어야 하고, 지금은 다섯 사건 모두 앱에 신호가 없다(§5).
 *   tests/마스코트배선.test.js 가 「이 파일에 별눈 0」을 기계로 지킨다.
 *
 * ■ 타이밍 — v5 시연(캐릭터_시안_v5.html) 값을 승계했다(유호님이 눈으로 정한 판).
 *   idle 두 주기만 시연보다 성기게 둔다(시연 머리말 「시연이라 실물보다 잦다」).
 *   ⚠ idle·방치·밤 눈금은 **초기값**이다 — 학생 0명이라 못 재고, 부트캠프에서 실학생으로 다시
 *   잰다(§3 「문턱 만들지 않기」와 같은 태도 — 지어낸 확신이 아니라 조정 대상임을 적어 둔다).
 */
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text,
} from 'react-native';
import { 색, 폰트 } from './테마.js';
import { 지금녹음중 } from './소리.js';
import { 표정컷, 혼잣말 } from '../lib/마스코트생명.js';

/* Metro 는 require 를 정적으로 읽는다 — 목록을 코드로 파생할 수 없어 손 지도가 필요하고,
   그 지도가 `표정컷`과 갈라지는 것은 tests/마스코트배선.test.js 가 잡는다. */
const 컷그림 = {
  본체: require('../assets/마스코트/본체.webp'),
  본채깜찍: require('../assets/마스코트/본채깜찍.webp'),
  본체놀람: require('../assets/마스코트/본체놀람.webp'),
  본체눈감음: require('../assets/마스코트/본체눈감음.webp'),
  본체눈감음2: require('../assets/마스코트/본체눈감음2.webp'),
};

const 때 = Object.freeze({
  부유주기: 3600, 부유진폭: 3, // v5 ghostfloat 3.6s · -3px
  졸림주기: 5200, 졸림진폭: 1.2, // v5 floatcalm 5.2s · -1.2px (방치·밤 — 진폭이 줄어든다)
  깜빡주기: 6400, 깜빡지속: 140, // v5 blink 6.4s
  몸짓지속: 1200, 말지속: 2600, 기본복귀: 3200, // v5 예약() 기본값들
  idle주기: 13000, idle혼잣말주기: 78000, // v5(6.5s·26s)의 2·3배 — ⚠초기값(부트캠프 재측정)
  방치문턱: 120000, // ⚠초기값 — 「한동안 입력 없음」의 임시 눈금
});

const 밤인가 = (시각) => { const h = 시각.getHours(); return h >= 22 || h < 6; };

/**
 * @param {object} props
 * @param {{이름: string, 때: number}|null} [props.사건] 화면이 준 최신 사건 1건 —
 *   '무오류첫열람'(놀람→기쁨·큰 점프 · achieve 소리와 동기) · '오류남은답장'(카드 쪽 기울임 ·
 *   말 금지 — 기죽는 반응 절대 금지) · '재도전'(앞으로 기울임 · 「다시! 같이!」).
 * @param {object} [props.자리] 위치 덮어쓰기(absolute top/right 등) — 배치는 화면 몫이다.
 * @param {{글: string, 때: number}|null} [props.말건네기] 화면이 시키는 정형 발화 한 마디 —
 *   ㉮ 로컬 정형(배선 §2)의 표시 자리. 문구는 lib 상수에서만 온다(여기·화면 어디서도 짓지
 *   않는다 — 강사판 = lib/마스코트강사말). 확률 없이 그대로 말하되 멈춤·줄임 게이트는 지난다.
 * @param {boolean} [props.잡담] false 면 idle 혼잣말·방치말·탭 수다를 잠근다(표정·몸짓은
 *   그대로) — 강사판은 말할순간 표에 idle 줄이 없다(표 밖 발화 금지 · 말할순간 §1-1).
 */
export default function 마스코트({ 사건 = null, 자리 = null, 말건네기 = null, 잡담 = true }) {
  const [표정, set표정] = useState('기본');
  const [깜빡중, set깜빡중] = useState(false);
  const [졸림, set졸림] = useState(false);
  const [말, set말] = useState(null);
  const [줄임, set줄임] = useState(false);

  const 부유 = useRef(new Animated.Value(0)).current; // 0→1 사인 반주기
  const 튐 = useRef(new Animated.Value(0)).current; // px (음수 = 위)
  const 기울기 = useRef(new Animated.Value(0)).current; // -10..10 (deg)
  const 타이머들 = useRef([]).current;
  const 마지막입력 = useRef(Date.now());

  const 예약 = (fn, ms) => { const t = setTimeout(fn, ms); 타이머들.push(t); return t; };
  const 멈춤 = () => 줄임 || 지금녹음중(); // 정지 조건은 이 한 곳 — 늘리면 여기서 늘린다

  /* reduce-motion — 켜져 있으면 «정지 화면»이다: 타이머·애니메이션 전부 0 (생명감 §1-3). */
  useEffect(() => {
    let 살아있음 = true;
    try {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((v) => { if (살아있음) set줄임(!!v); })
        .catch(() => {});
    } catch { /* 웹 판 등 이 API 가 없는 곳 — 기본값(false)으로 둔다 */ }
    const 구독 = AccessibilityInfo.addEventListener
      ? AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => set줄임(!!v))
      : null;
    return () => { 살아있음 = false; if (구독 && 구독.remove) 구독.remove(); };
  }, []);

  /* 부유 — 존재의 숨. 졸림이면 주기·진폭이 함께 줄어든다(v5 floatcalm). */
  useEffect(() => {
    if (줄임) { 부유.setValue(0); return undefined; }
    const 주기 = 졸림 ? 때.졸림주기 : 때.부유주기;
    const 루프 = Animated.loop(Animated.sequence([
      Animated.timing(부유, { toValue: 1, duration: 주기 / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(부유, { toValue: 0, duration: 주기 / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    루프.start();
    return () => 루프.stop();
  }, [줄임, 졸림, 부유]);

  /* 깜빡임 — 기본 표정에서만 눈감음2 프레임을 잠깐 끼운다(표정 중엔 그 컷이 말하고 있다). */
  useEffect(() => {
    if (줄임) return undefined;
    let 살아있음 = true;
    const 한번 = () => {
      if (!살아있음) return;
      if (!멈춤() && 표정 === '기본' && !졸림) {
        set깜빡중(true);
        예약(() => 살아있음 && set깜빡중(false), 때.깜빡지속);
      }
      예약(한번, 때.깜빡주기 + Math.random() * 1200);
    };
    예약(한번, 때.깜빡주기);
    return () => { 살아있음 = false; };
    // eslint 없음 — 표정·졸림은 한번() 이 매 회 새로 읽는다(클로저의 낡은 값이면 깜빡임이 표정을 덮는다)
  }, [줄임, 표정, 졸림]); // eslint-disable-line react-hooks/exhaustive-deps

  const 말하기 = (풀) => {
    if (!풀 || !풀.length || 멈춤()) return;
    set말(풀[Math.floor(Math.random() * 풀.length)]);
    예약(() => set말(null), 때.말지속);
  };
  /* «가끔» — 사건 혼잣말은 그 사건에 최대 1회, 그마저 절반만 말한다(무언이 기본 · §1-1).
     ⚠확률 절반도 초기값이다 — 빈도 눈금은 v5 시연·부트캠프에서 유호님이 정한다(§3). */
  const 가끔말하기 = (풀) => { if (잡담 && Math.random() < 0.5) 말하기(풀); };

  /* 말건네기 — 정형 발화는 확률이 없다(숫자·상태 문장은 「가끔」이 아니라 「그 순간」이 값이다).
     상한은 화면이 말한기록으로 이미 걸렀고, 여기는 게이트(멈춤·줄임)와 표시만 진다.
     문장이라 혼잣말(1~4어절)보다 오래 띄운다. */
  useEffect(() => {
    if (!말건네기 || !말건네기.글 || 멈춤()) return;
    깨우기();
    set말(말건네기.글);
    예약(() => set말(null), 때.말지속 + 1800);
  }, [말건네기 && 말건네기.때]); // eslint-disable-line react-hooks/exhaustive-deps

  const 점프 = (높이) => {
    Animated.sequence([
      Animated.timing(튐, { toValue: -높이, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(튐, { toValue: 0, friction: 4, tension: 90, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  };
  const 기울이기 = (각도, 지속) => {
    Animated.timing(기울기, { toValue: 각도, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start();
    예약(() => Animated.timing(기울기, { toValue: 0, duration: 320, useNativeDriver: Platform.OS !== 'web' }).start(), 지속 || 때.몸짓지속);
  };
  const 깨우기 = () => { 마지막입력.current = Date.now(); if (졸림 && !밤인가(new Date())) set졸림(false); };
  const 기본복귀 = (ms) => 예약(() => set표정('기본'), ms || 때.기본복귀);

  /* 사건 반응 — 화면이 넘긴 최신 1건에만 반응한다(반응 지도 §2 의 이 화면 몫 세 줄).
     🔴 오류 순간에는 말·기쁨이 없다 — 몸을 카드 쪽으로 기울여 «같이 들여다본다»가 전부다(§1-3). */
  useEffect(() => {
    if (!사건 || 줄임 || 지금녹음중()) return;
    깨우기();
    if (사건.이름 === '무오류첫열람') {
      set표정('놀람');
      예약(() => { set표정('기쁨'); 점프(14); 가끔말하기(혼잣말.무오류첫열람); }, 400);
      기본복귀(때.기본복귀 + 400);
    } else if (사건.이름 === '오류남은답장') {
      기울이기(7, 때.기본복귀); // 카드는 아래(왼쪽 흐름)에 있다 — 몸을 그쪽으로
    } else if (사건.이름 === '재도전') {
      기울이기(-6, 때.몸짓지속);
      가끔말하기(혼잣말.재도전);
    }
  }, [사건 && 사건.때]); // eslint-disable-line react-hooks/exhaustive-deps

  /* idle — 존재가 «가끔 스스로 움직인다»가 살아있음의 반이다(§2 끝줄).
     두리번은 컷에 눈 층이 없어 몸의 아주 작은 기울임으로 낸다(그림 정본은 부위를 안 가른다). */
  useEffect(() => {
    if (줄임) return undefined;
    const 두리번 = setInterval(() => {
      if (멈춤() || 말) return;
      const 지금 = new Date();
      const 자야함 = 밤인가(지금) || Date.now() - 마지막입력.current > 때.방치문턱;
      if (자야함 !== 졸림) { set졸림(자야함); if (자야함) 가끔말하기(혼잣말.방치); return; }
      if (졸림 || 표정 !== '기본') return;
      const r = Math.random();
      if (r < 0.45) 기울이기(Math.random() < 0.5 ? 2 : -2, 900);
      else if (r < 0.6) 기울이기(3, 1100); // 끄덕임꼴
    }, 때.idle주기);
    const 중얼 = setInterval(() => {
      if (!잡담 || 멈춤() || 말 || 졸림 || 표정 !== '기본') return;
      말하기(혼잣말.idle);
    }, 때.idle혼잣말주기);
    return () => { clearInterval(두리번); clearInterval(중얼); };
  }, [줄임, 졸림, 말, 표정]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 타이머 청소 — 화면을 떠날 때 전부 걷는다(떠난 화면의 표정을 바꾸는 유령 타이머 방지). */
  useEffect(() => () => { for (const t of 타이머들) clearTimeout(t); }, [타이머들]);

  const 탭 = () => {
    if (줄임 || 지금녹음중()) return;
    깨우기();
    set표정('놀람');
    예약(() => set표정(Math.random() < 0.5 ? '기쁨' : '눈웃음'), 300);
    가끔말하기(혼잣말.탭);
    기본복귀();
  };

  const 그릴컷 = 깜빡중 && 표정 === '기본' && !졸림 ? 표정컷.잔잔감음
    : 졸림 && 표정 === '기본' ? 표정컷.잔잔감음
      : 표정컷[표정] || 표정컷.기본;
  const 진폭 = 졸림 ? 때.졸림진폭 : 때.부유진폭;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[s.자리, 자리, {
        transform: [
          { translateY: Animated.add(부유.interpolate({ inputRange: [0, 1], outputRange: [0, -진폭] }), 튐) },
          { rotate: 기울기.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) },
        ],
      }]}
    >
      <Pressable onPress={탭} hitSlop={10} accessibilityLabel="마스코트">
        <Animated.Image source={컷그림[그릴컷]} style={s.몸} resizeMode="contain" />
      </Pressable>
      {말 ? (
        <Animated.View style={s.말풍선} pointerEvents="none">
          <Text style={s.말글}>{말}</Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  /* 기본 자리 = 오른쪽 위(답장 화면 겉테) — 화면이 `자리` 로 덮어쓴다. 신호색 0 · 면 0. */
  자리: { position: 'absolute', top: 52, right: 20, alignItems: 'flex-end' },
  몸: { width: 84, height: 84 },
  말풍선: {
    marginTop: 6, backgroundColor: 색.바탕띄움, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  말글: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 19, color: 색.잉크_서브 },
});
