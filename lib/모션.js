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
import { useEffect, useRef, useState } from 'react';
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
