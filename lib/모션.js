/* 모션 — 화면 요소의 «등장 한 박자» 공용 어휘.
 *
 * 왜 있나(08-24): 몽글(스프링 도착)·맥박 링은 살아 있는데 정작 보상의 실체인 완료카드와
 *   「어제 넘음」 줄은 등장 박자가 0이었다 — 순간 팝. 08-24 정찰(transitions.dev 카탈로그)이
 *   이 «빈 순간»을 드러냈다. ⚠ 그쪽 코드는 라이선스 미표기라 반입하지 않는다 — 여기 값은
 *   전부 집 어휘의 자작이다(마스코트.js 의 도착 스프링·퇴장 timing 과 같은 계보).
 *
 * 규율 둘 — 마스코트 생명감 §1-3 과 같은 결:
 *   · reduce-motion 이면 «정지 화면»이다 — 애니메이션 0, 최종값으로 바로 선다.
 *     화면은 글만으로 완결이고 모션은 증폭층이다(몽글 연기 게이트와 같은 원칙).
 *   · 등장은 축하가 아니라 «자리 잡음»이다 — 재접속으로 다시 만나도 어색하지 않은 세기만.
 *     축하(기쁨 표정·효과음)는 몽글과 소리킷의 몫이고, 여기는 넘보지 않는다.
 *
 * 🔑 마스코트.js 는 이 파일을 안 쓴다 — 그쪽 줄임 게이트는 «녹음 중 정지»와 한 몸이라
 *   (멈춤 = 줄임 || 지금녹음중) 떼어내면 판정이 두 곳으로 갈라진다. 화면 요소용은 여기.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

/** reduce-motion 구독 — 마스코트.js 와 같은 패턴(최초 1회 읽기 + 변경 구독). */
export function use줄임() {
  const [줄임, set줄임] = useState(false);
  useEffect(() => {
    let 살아있음 = true;
    if (AccessibilityInfo && AccessibilityInfo.isReduceMotionEnabled) {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((v) => { if (살아있음) set줄임(!!v); })
        .catch(() => {});
    }
    const 구독 = AccessibilityInfo && AccessibilityInfo.addEventListener
      ? AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => set줄임(!!v))
      : null;
    return () => { 살아있음 = false; if (구독 && 구독.remove) 구독.remove(); };
  }, []);
  return 줄임;
}

/** 등장 한 박자 — 마운트 때 1회: 스르륵(불투명 0→1) + 살짝 아래에서 자리로.
 *  반환값을 Animated.View / Animated.Text 의 style 배열에 얹는다.
 *  줄임이면 애니메이션 없이 최종값으로 시작한다(정지 화면 원칙).
 *  @param {{올라옴?: number, 시간?: number, 지연?: number}} [옵션]
 */
export function use등장(옵션 = {}) {
  const { 올라옴 = 10, 시간 = 260, 지연 = 0 } = 옵션;
  const 줄임 = use줄임();
  const 불투명 = useRef(new Animated.Value(0)).current;
  const 자리 = useRef(new Animated.Value(올라옴)).current;
  const 시작함 = useRef(false);
  useEffect(() => {
    if (시작함.current) return; // 등장은 마운트당 1회 — 리렌더에 다시 안 돈다
    /* 줄임 값은 비동기로 늦게 참이 될 수 있다 — 그 사이 애니메이션이 이미 출발했으면 그대로
     * 두고(중간에 끊으면 반쯤 투명한 채 멈춘다), 아직이면 즉시 최종값으로 세운다. */
    if (줄임) {
      시작함.current = true;
      불투명.setValue(1);
      자리.setValue(0);
      return;
    }
    시작함.current = true;
    const 네이티브 = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(불투명, { toValue: 1, duration: 시간, delay: 지연, easing: Easing.out(Easing.quad), useNativeDriver: 네이티브 }),
      Animated.timing(자리, { toValue: 0, duration: 시간, delay: 지연, easing: Easing.out(Easing.quad), useNativeDriver: 네이티브 }),
    ]).start();
  }, [줄임]);
  return { opacity: 불투명, transform: [{ translateY: 자리 }] };
}

/** 셀 것인가, 센다면 몇 칸을 얼마 간격으로 — `use세는수` 의 **판정 전부**를 진 순수 함수.
 *
 * 🔑 훅에서 빼 둔 이유: 화면 회귀(`tests/lib/화면세우기.js`)는 **첫 렌더만** 본다 — 효과도
 *   타이머도 안 돈다. 판정이 훅 안에 있으면 「줄어든 날엔 안 센다」 같은 규율을 기계가
 *   영영 못 잰다. 이 저장소가 견줌·채점에서 쓰는 그 방식 그대로다(판정은 lib · 화면은 씀).
 *
 * @returns {null|{칸수: number, 간격: number}} `null` 이면 세지 않고 최종값 그대로 선다.
 */
export function 세기계획({ 부터, 까지, 켬 = true, 줄임 = false }) {
  /* 🚫 내려 세지 않는다 — 줄어든 날에 수가 내려가는 것은 동기가 아니라 평가다
   *   (`lib/견줌.js` 「늘었나는 엄격히 클 때만」과 같은 축). 같은 날(부터 === 까지)도 안 센다. */
  if (줄임 || !켬 || !Number.isFinite(부터) || !Number.isFinite(까지) || !(부터 < 까지)) return null;
  const 칸수 = 까지 - 부터;
  /* 총 570ms 를 칸수로 나누되 40~190ms 로 묶는다. 칸이 많으면 지루해지지 않게 40ms 바닥.
   *
   * 🔑 **190ms 는 등장 모션(260ms)과 다른 눈금이다**(유호님 판정 08-24 · 첫 판은 140ms).
   *   등장은 «장식»이라 알아챌 만큼만 짧으면 되지만, 세어 오르는 수는 **읽어야 하는 정보**다.
   *   140ms 이면 1→3 이 280ms 만에 끝나 눈이 「3이 됐네」로만 읽고 «세는 것»을 못 본다 —
   *   그러면 이 기능을 넣은 뜻의 절반이 사라진다. 대조판에서 셋(260·433·867ms)을 나란히
   *   돌려 보고 정한 값이라, 고칠 때도 그 지면으로 다시 대본다. */
  return { 칸수, 간격: Math.min(190, Math.max(40, Math.round(570 / 칸수))) };
}

/** 세어 올리는 수 — `부터`에서 `까지`로 **정수 한 칸씩**. 유호님 지시 08-24.
 *
 * 🔑 보간하지 않고 정수로 세는 이유: 이 앱의 수는 작다(하루 발화 3~10). 60fps 로 보간하면
 *   같은 숫자가 여러 프레임 반복되거나 소수가 튄다 — 「세어 올린다」의 정직한 모양은 칸이다.
 *
 * 🔴 **첫 렌더는 언제나 `까지`(최종값)다.** 정지 화면이 곧 진실이라는 이 저장소의 규율이
 *   여기서도 그대로다 — reduce-motion·서버 렌더·애니메이션 실패 어느 쪽이어도 화면에 서는 수는
 *   참이다. 세는 것은 첫 페인트 «전»에 `useLayoutEffect` 가 시작값으로 내려서 시작하므로,
 *   학생이 최종값을 먼저 보고 값이 튀는 일은 없다.
 *
 * 🔑 줄임(reduce-motion)은 비동기로 늦게 참이 된다 — 그때는 세던 것을 그 자리에서 멈추고
 *   최종값으로 세운다(아래 둘째 효과). 세기 시작한 것을 반쯤에 두지 않는다.
 *
 * @param {{부터: number, 까지: number, 켬?: boolean, 지연?: number}} 옵션
 *   `켬=false` 면 세지 않고 최종값 그대로 선다(줄어든 축에 쓰지 않기 위한 손잡이 —
 *   내려 세는 것은 「평가하지 않는다」 규율에 걸린다).
 */
export function use세는수({ 부터, 까지, 켬 = true, 지연 = 0 }) {
  const 줄임 = use줄임();
  const [보임, set보임] = useState(까지);
  const 타이머 = useRef({ 늦춤: null, 반복: null });
  const 정리 = () => {
    if (타이머.current.늦춤) clearTimeout(타이머.current.늦춤);
    if (타이머.current.반복) clearInterval(타이머.current.반복);
    타이머.current = { 늦춤: null, 반복: null };
  };
  /* 마운트 1회 — deps 를 비워 둔다. 줄임이 늦게 도착해 재실행되면 cleanup 이 돌아 세던 것이
   * 중간에 멈춘다(그 처리는 아래 둘째 효과가 «최종값으로» 진다). */
  useLayoutEffect(() => {
    const 계획 = 세기계획({ 부터, 까지, 켬, 줄임 });
    if (!계획) return undefined; // 최종값 그대로 — 판정 근거는 `세기계획` 하나다
    set보임(부터);
    const { 간격 } = 계획;
    let 지금 = 부터;
    타이머.current.늦춤 = setTimeout(() => {
      타이머.current.반복 = setInterval(() => {
        지금 += 1;
        set보임(지금);
        if (지금 >= 까지) 정리();
      }, 간격);
    }, 지연);
    return 정리;
  }, []);
  /* 줄임이 뒤늦게 참이 되면 — 세던 것을 멈추고 최종값으로. */
  useEffect(() => {
    if (!줄임) return;
    정리();
    set보임(까지);
  }, [줄임, 까지]);
  return 보임;
}
