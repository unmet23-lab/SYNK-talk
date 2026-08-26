/* 마스코트 — 살아있는 반응 층 (행동 정본 = 캐릭터_생명감_설계.md v1.1 · 그림 = 펠트코랄_0815 누끼 4컷).
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
 *   컷 어휘에서도 뺐다(08-23 — 펠트 별눈판 미존재). tests/마스코트배선.test.js 가
 *   「이 파일에 별눈 0」을 기계로 지킨다.
 *
 * ■ 타이밍 — v5 시연에서 유호님이 눈으로 정한 값을 승계했다(그 시연 파일 캐릭터_시안_v5.html 은
 *   08-19 퇴역·삭제 — git 이력에만 있다. 값의 현행 정본은 아래 `때` 상수 자신이다).
 *   idle 두 주기만 시연보다 성기게 둔다(시연 머리말 「시연이라 실물보다 잦다」).
 *   ⚠ idle·방치·밤 눈금은 **초기값**이다 — 학생 0명이라 못 재고, 부트캠프에서 실학생으로 다시
 *   잰다(§3 「문턱 만들지 않기」와 같은 태도 — 지어낸 확신이 아니라 조정 대상임을 적어 둔다).
 */
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text,
} from 'react-native';
import { 색, 폰트 } from './테마.js';
/* 효과음은 src/소리.js 어댑터를 지나서만 낸다(단일 게이트 — 녹음 중 무음·킷 화이트리스트가
   그 한 곳에 산다). 옛 규칙 「마스코트는 소리를 안 낸다」는 유호 지시 08-25(탭 반응음)로
   바뀌었다 — 지금 금지는 「expo-audio 를 직접 잡는 것」이다(배선 회귀가 그걸 지킨다). */
import { 지금녹음중, 효과음 } from './소리.js';
import 마스코트몸, { 쓸수있나 as 몸쓸수있나 } from './마스코트몸.js';
import { 표정컷, 혼잣말 } from '../lib/마스코트생명.js';
import { 목소리판정 } from '../lib/몽글목소리.js';

/* Metro 는 require 를 정적으로 읽는다 — 목록을 코드로 파생할 수 없어 손 지도가 필요하고,
   그 지도가 `표정컷`과 갈라지는 것은 tests/마스코트배선.test.js 가 잡는다. */
const 컷그림 = {
  재염색_본체: require('../assets/마스코트/재염색_본체.webp'),
  재염색_놀람: require('../assets/마스코트/재염색_놀람.webp'),
  재염색_눈웃음: require('../assets/마스코트/재염색_눈웃음.webp'),
  재염색_눈감음: require('../assets/마스코트/재염색_눈감음.webp'),
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
 * @param {{대본: Array, 채움?: object, 끝나면?: Function}|null} [props.연출] 화면이 시키는
 *   «대본 연기» 한 벌(유호 확정 08-23 — 숙제 인트로는 동영상이 아니라 그 자리 연기다).
 *   대본은 lib/마스코트생명.연출대본 에서만 온다(문구를 여기·화면에서 짓지 않는다 — 혼잣말과
 *   같은 규칙). `@질문` 걸음은 채움.질문(실제 숙제 콘텐츠)으로 치환한다. 확률 0 · 순차 재생 ·
 *   탭 = 건너뛰기(매일 보는 학생에게 강제 관람은 소음이다) · 끝나면() 은 스킵·게이트 포함
 *   **반드시 한 번** 불린다 — 화면은 그걸 받고 마스코트를 내린다(한시 등장 · 상주 금지).
 */
export default function 마스코트({ 사건 = null, 자리 = null, 말건네기 = null, 잡담 = true, 연출 = null }) {
  const [표정, set표정] = useState('기본');
  const [깜빡중, set깜빡중] = useState(false);
  const [졸림, set졸림] = useState(false);
  const [말, set말] = useState(null);
  const [줄임, set줄임] = useState(false);
  const [연출중, set연출중] = useState(false);
  /* 탭 순간 하나 — Skia 몸이 눌림 곡선을 세는 재료다(그 값은 네이티브 드라이버라 못 읽는다). */
  const [탭시각, set탭시각] = useState(0);
  /* Skia 가 이 기기에 있나 — 없으면(Expo Go·웹) 아래 <Animated.Image> 가 그대로 선다.
     판정은 한 번만 하면 되는 상수다(모듈 로드 시점에 정해진다). */
  const 몸된다 = 몸쓸수있나().된다;

  const 부유 = useRef(new Animated.Value(0)).current; // 0→1 사인 반주기
  const 튐 = useRef(new Animated.Value(0)).current; // px (음수 = 위)
  const 기울기 = useRef(new Animated.Value(0)).current; // -10..10 (deg)
  const 크기 = useRef(new Animated.Value(1)).current; // 다가옴 1.14 · 사라짐 0 (연출 어휘)
  const 쫀득 = useRef(new Animated.Value(0)).current; // 0→1 눌림(가로↑세로↓) — 펠트 젤리의 눌린 몸
  const 타이머들 = useRef([]).current;
  const 연출타이머들 = useRef([]).current; // 스킵이 이것만 걷는다 — 깜빡임·idle 타이머는 산다
  const 마지막입력 = useRef(Date.now());

  const 예약 = (fn, ms) => { const t = setTimeout(fn, ms); 타이머들.push(t); return t; };
  const 멈춤 = () => 줄임 || 지금녹음중(); // 정지 조건은 이 한 곳 — 늘리면 여기서 늘린다

  /* 목소리 — **상황마다 다른 소리**가 난다(유호 확정 08-25 · 배치 정본 = `lib/몽글목소리.js`).
   * 여기서는 «어느 자리가 어느 상황인가»만 말하고, 소리 고르기·겹침·미세 변주는 그 lib 이 진다.
   * 🚫 소리 이름을 여기서 적지 않는다 — 적는 순간 배치 정본이 두 벌이 된다. */
  const 마지막목소리 = useRef(0);
  const 직전소리 = useRef(null);   // 같은 소리를 연달아 내지 않기 위한 기억 하나
  const 목소리 = (상황 = '기본') => {
    const 답 = 목소리판정({
      상황, 지금: Date.now(), 마지막: 마지막목소리.current,
      직전소리: 직전소리.current, 고르기: Math.random(), 흔들: Math.random(),
    });
    if (!답.낼까) return;
    마지막목소리.current = Date.now();
    직전소리.current = 답.소리;
    효과음(답.자산, 답.속도);
  };

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

  /* 말풍선 = 목소리 — 몽글이 말할 때는 늘 소리가 함께 난다(유호 08-25).
     표정은 «그 말이 어떤 말인가»가 정한다 — 부르는 쪽이 넘긴다(기본값은 평상 혼잣말). */
  const 말하기 = (풀, 말표정 = '기본') => {
    if (!풀 || !풀.length || 멈춤()) return;
    set말(풀[Math.floor(Math.random() * 풀.length)]);
    목소리(말표정);
    예약(() => set말(null), 때.말지속);
  };
  /* «가끔» — 사건 혼잣말은 그 사건에 최대 1회, 그마저 절반만 말한다(무언이 기본 · §1-1).
     ⚠확률 절반도 초기값이다 — 빈도 눈금은 v5 시연·부트캠프에서 유호님이 정한다(§3). */
  const 가끔말하기 = (풀, 말표정) => { if (잡담 && Math.random() < 0.5) 말하기(풀, 말표정); };

  /* 말건네기 — 정형 발화는 확률이 없다(숫자·상태 문장은 「가끔」이 아니라 「그 순간」이 값이다).
     상한은 화면이 말한기록으로 이미 걸렀고, 여기는 게이트(멈춤·줄임)와 표시만 진다.
     문장이라 혼잣말(1~4어절)보다 오래 띄운다. */
  useEffect(() => {
    if (!말건네기 || !말건네기.글 || 멈춤()) return;
    깨우기();
    set말(말건네기.글);
    목소리('물음');
    예약(() => set말(null), 때.말지속 + 1800);
  }, [말건네기 && 말건네기.때]); // eslint-disable-line react-hooks/exhaustive-deps

  const 점프 = (높이) => {
    Animated.sequence([
      Animated.timing(튐, { toValue: -높이, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(튐, { toValue: 0, friction: 4, tension: 90, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  };
  /* 쫀득 — 눌린 펠트가 «뽁» 하고 돌아온다(유호 08-25 「귀여운 모션」). 눌림 90ms 는 손가락이
   * 닿은 순간의 반동처럼 짧게, 복원은 스프링이 살짝 넘치며(overshoot = 젤리) 돌아온다.
   * 가로가 늘고 세로가 줄어드는 squash — 몸이 뜨는 점프와 달리 «눌렸다»가 읽히는 몸짓이다. */
  const 쫀득하기 = () => {
    set탭시각(Date.now());   // 몸(Skia)이 있으면 이 숫자로 «발치부터» 눌린다
    Animated.sequence([
      Animated.timing(쫀득, { toValue: 1, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(쫀득, { toValue: 0, friction: 3.6, tension: 160, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  };
  /* 다가옴·물러남·사라짐 — 유호 확정 몸짓 어휘(08-14 「다가옴/물러남」) 안의 크기 축.
     다가옴은 스프링(젤리 몸의 탄성) · 사라짐은 timing(예측 가능한 퇴장 — unmount 직전 걸음). */
  const 크기로 = (v, 퇴장) => {
    if (퇴장) Animated.timing(크기, { toValue: v, duration: 500, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start();
    else Animated.spring(크기, { toValue: v, friction: 6, tension: 60, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  const 기울이기 = (각도, 지속) => {
    Animated.timing(기울기, { toValue: 각도, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start();
    예약(() => Animated.timing(기울기, { toValue: 0, duration: 320, useNativeDriver: Platform.OS !== 'web' }).start(), 지속 || 때.몸짓지속);
  };
  const 깨우기 = () => { 마지막입력.current = Date.now(); if (졸림 && !밤인가(new Date())) set졸림(false); };
  const 기본복귀 = (ms) => 예약(() => set표정('기본'), ms || 때.기본복귀);

  /* 연출 시퀀서 — 대본 걸음을 순차 재생한다(말건네기의 타임라인판 · 확률 0).
   * · 시작 400ms 지연: reduce-motion 판정(비동기)이 첫 프레임엔 아직 없다 — 숨 하나 쉬고
   *   시작하면 판정이 도착해 있고, 등장으로도 그게 자연스럽다.
   * · 걸음마다 멈춤()을 다시 본다 — 연기 도중 녹음이 시작되면 남은 걸음은 조용히 접힌다
   *   (08-12 실측 「코랄 몸 × 녹음 버튼 신호 충돌」의 정신 — 녹음 국면에 몸이 없다).
   * · 끝나면() 은 어느 길로든 한 번 — 화면이 이걸 받아 마스코트를 내린다(한시 등장). */
  useEffect(() => {
    if (!연출 || !연출.대본 || !연출.대본.length) return undefined;
    const 연출예약 = (fn, ms) => { const t = setTimeout(fn, ms); 연출타이머들.push(t); return t; };
    const 끝 = () => { set연출중(false); set표정('기본'); set말(null); if (연출.끝나면) 연출.끝나면(); };
    연출예약(() => {
      if (멈춤() || 지금녹음중()) { 끝(); return; }
      set연출중(true);
      let 시각 = 0;
      for (const 걸음 of 연출.대본) {
        연출예약(() => {
          if (멈춤()) return; // 남은 걸음은 접는다 — 종료 예약이 끝을 맡는다
          if (걸음.표정) set표정(걸음.표정);
          if (걸음.몸짓 === '점프') 점프(10);
          else if (걸음.몸짓 === '기울임') 기울이기(7, 걸음.지속);
          else if (걸음.몸짓 === '끄덕') 기울이기(3, Math.min(걸음.지속, 1100));
          else if (걸음.몸짓 === '다가옴') 크기로(1.14);
          else if (걸음.몸짓 === '물러남') 크기로(1);
          else if (걸음.몸짓 === '사라짐') 크기로(0.001, true);
          if (걸음.말) {
            const 글 = 걸음.말 === '@질문' ? (연출.채움 && 연출.채움.질문) || null : 걸음.말;
            if (글) {
              set말(글);
              /* 대본 걸음의 표정 — 걸음이 스스로 말한다: 질문 슬롯(@질문)은 «물음», 기쁨 컷을
                 세운 걸음은 «기쁨», 나머지는 «기본». 대본에 표정 필드를 새로 넣지 않는다 —
                 이미 있는 두 값(말·표정)에서 읽으면 정본이 안 늘어난다. */
              const 말표정 = 걸음.말 === '@질문' ? '물음' : (걸음.표정 === '기쁨' ? '기쁨' : '기본');
              목소리(말표정);
              연출예약(() => set말(null), Math.max(걸음.지속 - 200, 400));
            }
          }
        }, 시각);
        시각 += 걸음.지속 || 0;
      }
      연출예약(끝, 시각);
    }, 400);
    return () => { for (const t of 연출타이머들) clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — 연출은 조건부 렌더로 살았다 사라지는 한시 존재다(마운트 1회)

  /* 사건 반응 — 화면이 넘긴 최신 1건에만 반응한다(반응 지도 §2 의 이 화면 몫 세 줄).
     🔴 오류 순간에는 말·기쁨이 없다 — 몸을 카드 쪽으로 기울여 «같이 들여다본다»가 전부다(§1-3). */
  useEffect(() => {
    if (!사건 || 줄임 || 연출중 || 지금녹음중()) return;
    깨우기();
    if (사건.이름 === '무오류첫열람') {
      set표정('놀람');
      예약(() => { set표정('기쁨'); 점프(14); 목소리('기쁨'); 가끔말하기(혼잣말.무오류첫열람, '기쁨'); }, 400);
      기본복귀(때.기본복귀 + 400);
    } else if (사건.이름 === '오류남은답장') {
      기울이기(7, 때.기본복귀); // 카드는 아래(왼쪽 흐름)에 있다 — 몸을 그쪽으로
      /* 🔴 이 자리의 소리는 «안심»(느리고 낮은)뿐이다 — 밝은 소리를 오답 옆에 두지 않는다.
         말은 여전히 0이다(기죽는 반응 금지 확정 · §1-3): 몸을 기울여 같이 들여다보고,
         소리로 «옆에 있다»만 말한다. */
      목소리('안심');
    } else if (사건.이름 === '재도전') {
      기울이기(-6, 때.몸짓지속);
      목소리('기쁨');
      가끔말하기(혼잣말.재도전, '기쁨');
    }
  }, [사건 && 사건.때]); // eslint-disable-line react-hooks/exhaustive-deps

  /* idle — 존재가 «가끔 스스로 움직인다»가 살아있음의 반이다(§2 끝줄).
     두리번은 컷에 눈 층이 없어 몸의 아주 작은 기울임으로 낸다(그림 정본은 부위를 안 가른다). */
  useEffect(() => {
    if (줄임) return undefined;
    const 두리번 = setInterval(() => {
      if (멈춤() || 말 || 연출중) return;
      const 지금 = new Date();
      const 자야함 = 밤인가(지금) || Date.now() - 마지막입력.current > 때.방치문턱;
      if (자야함 !== 졸림) { set졸림(자야함); if (자야함) { 목소리('잠결'); 가끔말하기(혼잣말.방치, '잠결'); } return; }
      if (졸림 || 표정 !== '기본') return;
      const r = Math.random();
      if (r < 0.45) 기울이기(Math.random() < 0.5 ? 2 : -2, 900);
      else if (r < 0.6) 기울이기(3, 1100); // 끄덕임꼴
    }, 때.idle주기);
    const 중얼 = setInterval(() => {
      if (!잡담 || 멈춤() || 말 || 졸림 || 연출중 || 표정 !== '기본') return;
      말하기(혼잣말.idle);
    }, 때.idle혼잣말주기);
    return () => { clearInterval(두리번); clearInterval(중얼); };
  }, [줄임, 졸림, 말, 표정, 연출중]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 타이머 청소 — 화면을 떠날 때 전부 걷는다(떠난 화면의 표정을 바꾸는 유령 타이머 방지). */
  useEffect(() => () => { for (const t of 타이머들) clearTimeout(t); }, [타이머들]);

  const 탭 = () => {
    if (줄임 || 지금녹음중()) return;
    /* 연출 중 탭 = 건너뛰기 — 남은 걸음을 걷고 바로 끝낸다(놀람 반응이 아니라 스킵이다). */
    if (연출중) {
      for (const t of 연출타이머들) clearTimeout(t);
      set연출중(false); set표정('기본'); set말(null);
      if (연출 && 연출.끝나면) 연출.끝나면();
      return;
    }
    깨우기();
    /* 탭 반응 = 쫀득 + 반응음 + 표정 (유호 08-25 「반응음 + 귀여운 모션」).
     * 소리는 어댑터 게이트를 지난다 — 녹음 중이면 위에서 이미 걸러졌지만, 게이트가 최종 판정자다.
     * 가끔(1/3)은 쫀득에 살짝 튐도 얹는다 — 매번 같은 반응은 기계 티가 난다(자발성 §2). */
    쫀득하기();
    목소리('기본');
    if (Math.random() < 0.34) 점프(8);
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
          { scale: 크기 }, // 연출 어휘(다가옴·사라짐) — 평시엔 1 그대로
        ],
      }]}
    >
      <Pressable onPress={탭} hitSlop={10} accessibilityLabel="마스코트">
        {몸된다 ? (
          /* Skia 가 있는 기기 — 같은 그림 한 장이 «격자»로 산다(숨은 발치부터 · 눌림도 발치부터).
             바깥 어휘(부유·기울기·크기)는 위 Animated.View 에 그대로 얹혀 있다 —
             이 층은 «몸의 결»만 맡고 위치·회전은 안 넘본다. */
          <마스코트몸
            그림={컷그림[그릴컷]}
            너비={s.몸.width}
            높이={s.몸.height}
            멈춤={멈춤()}
            졸림={졸림}
            탭시각={탭시각}
          />
        ) : (
          <Animated.Image
            source={컷그림[그릴컷]}
            style={[s.몸, {
              /* 쫀득은 몸에만 건다 — 말풍선까지 눌리면 라벨이 종이가 아니라 고무가 된다. */
              transform: [
                { scaleX: 쫀득.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) },
                { scaleY: 쫀득.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }) },
              ],
            }]}
            resizeMode="contain"
          />
        )}
      </Pressable>
      {/* 🔑 key={말} — 문구가 바뀌면 라벨을 새로 세워 등장 박자가 매번 돈다(재사용하면 첫 말만 박자). */}
      {말 ? <말풍선 key={말} 글={말} 줄임={줄임} /> : null}
    </Animated.View>
  );
}

/* 말풍선 — 펠트 인형에 실로 단 «천 라벨»(08-25 유호 지적 「붕 떠 있고 AI 스럽다」의 처방).
 *
 * ■ 왜 이 모양인가 — 몽글의 세계는 펠트다. 유리같은 말풍선 대신, 봉제인형 옆에 실땀(Stitch
 *   #F0E3C8)으로 밑단을 두른 태그가 몸에 «달려» 있다: 점선 테두리 = 자수 한 땀,
 *   꼬리 = 라벨이 몸에 닿는 자리. 색·서체 전부 킷이다(실땀·Ink 면·SUIT Medium).
 * ■ 자리 — 몸 «아래»가 아니라 **얼굴 옆(왼쪽)** 이다. 말은 입에서 나온다 — 아래 붙은 상자가
 *   「붕 떠 있다」로 읽힌 이유다. 화면 배치(오른쪽 위)상 왼쪽이 열린 방향이다.
 * ■ 등장 — 입에서 «뽁» 나오듯: 살짝 작게+아래에서 스프링으로 선다(즉시 팝이면 또 붕 뜬다).
 *   reduce-motion 이면 박자 없이 바로 선다(정지 화면이 곧 진실 — lib/모션.js 와 같은 규율). */
function 말풍선({ 글, 줄임 }) {
  const 등장 = useRef(new Animated.Value(줄임 ? 1 : 0)).current;
  useEffect(() => {
    if (줄임) { 등장.setValue(1); return; }
    Animated.spring(등장, { toValue: 1, friction: 6, tension: 140, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [줄임, 등장]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[s.말풍선, {
        opacity: 등장,
        transform: [
          { translateY: 등장.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) },
          { scale: 등장.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
        ],
      }]}
    >
      <Text style={s.말글}>{글}</Text>
      <Animated.View style={s.말꼬리} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  /* 기본 자리 = 오른쪽 위(답장 화면 겉테) — 화면이 `자리` 로 덮어쓴다. 신호색 0 · 면 0. */
  자리: { position: 'absolute', top: 52, right: 20, alignItems: 'flex-end' },
  몸: { width: 84, height: 84 },
  /* 천 라벨 — 얼굴 옆(왼쪽)에 단다. right = 몸 84 + 틈 10. 점선 = 실땀 자수 한 땀. */
  말풍선: {
    position: 'absolute', right: 94, top: 16,
    backgroundColor: 색.바탕띄움, borderRadius: 13,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(240,227,200,0.55)', // 실땀 55%
    paddingHorizontal: 12, paddingVertical: 8,
    maxWidth: 230, // 연출 `@질문`(최대 90자)이 화면 밖으로 밀리지 않게 — 혼잣말(1~4어절)은 영향 없다
  },
  /* 꼬리 — 라벨이 몸에 닿는 자리(45° 돌린 같은 색 면). 점선 테두리는 안 두른다 — 몸에
     묻히는 쪽이라 실땀까지 돌리면 «붙어 있음»이 아니라 «떠 있는 다이아»가 된다. */
  말꼬리: {
    position: 'absolute', right: -4, top: 14, width: 9, height: 9,
    backgroundColor: 색.바탕띄움, transform: [{ rotate: '45deg' }],
  },
  말글: { fontFamily: 폰트.본문, fontSize: 13, lineHeight: 20, color: 색.잉크 },
});
