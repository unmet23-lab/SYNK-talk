/* 반짝임 — «기쁨 한 박자»를 한 번 재생하는 층 (유호 확정 08-27 ③).
 *
 * ■ 왜 Lottie 인가 (Rive 를 두고 이것을 고른 까닭)
 *   `.riv` 는 바이너리이고 만드는 통로가 에디터 GUI 다 — 리깅이 블랙박스가 되어
 *   「AI 원격 짓고·고치고·검증」에 걸린다(유호 판정 08-26 · 08-27 재확인 때도 그대로였다).
 *   Lottie 파일은 **글자(JSON)** 다. `assets/모션/반짝.json` 은 npm 에서 받아온 남의 그림이 아니라
 *   **여기서 지은 것**이고, 색도 박자도 그 파일을 열어 고칠 수 있다. 그게 이 갈래의 값이다.
 *
 * ■ 색은 킷에서만 온다
 *   반짝.json 의 두 색은 Butter #F5C445 · Butter Soft #FFEBB0 — 킷이 「기쁨(별·보상)」에
 *   배정한 자리다. 🚫 코랄을 쓰지 않는다: 이 앱에서 코랄은 «지금 녹음 중»을 뜻하고,
 *   기쁨에 그 색을 쓰면 신호가 흐려진다(어제의나 머리말과 같은 규율).
 *
 * ■ 이 층은 «스스로 켜지지» 않는다
 *   부르는 화면이 `보임`을 참으로 줄 때만 한 번 돈다. 반복(loop)이 없다 —
 *   화면에 계속 도는 축하는 축하가 아니라 소음이고, 그건 유호님이 포인트·리그를 빼신 결과 그대로다.
 *   `줄임`(reduce-motion)이면 아예 아무것도 그리지 않는다 — 마스코트와 같은 게이트다.
 *
 * ■ 폴백
 *   lottie-react-native 는 네이티브 모듈이라 Expo Go·웹에 없다. 없으면 `null` 을 돌려준다 —
 *   화면은 «반짝이 없는» 상태로 멀쩡히 선다(이 층은 증폭이지 본문이 아니다).
 */
import React, { useEffect, useRef } from 'react';

let LOTTIE = null;
let 못쓴까닭 = null;
function 로티() {
  if (LOTTIE || 못쓴까닭) return LOTTIE;
  try {
    // eslint-disable-next-line global-require
    const m = require('lottie-react-native');
    LOTTIE = (m && m.default) || m;
    if (!LOTTIE) 못쓴까닭 = 'lottie-react-native 는 있는데 컴포넌트가 없다';
  } catch {
    못쓴까닭 = '이 환경에 Lottie 네이티브 모듈이 없다(Expo Go·웹이면 정상)';
  }
  return LOTTIE;
}

/** 왜 폴백으로 갔는지 — 조용한 실패를 만들지 않기 위한 창구(마스코트몸과 같은 규약). */
export function 쓸수있나() {
  로티();
  return { 된다: !!LOTTIE, 까닭: 못쓴까닭 };
}

/**
 * @param {object} props
 * @param {boolean} props.보임 참이 되는 «그 순간» 한 번 돈다. 화면이 켠다.
 * @param {number} [props.크기] 정사각 변(px). 기본 120 = 자산 원본 크기.
 * @param {boolean} [props.줄임] reduce-motion — 참이면 아무것도 그리지 않는다.
 * @param {Function} [props.끝나면] 재생이 끝나면 한 번 불린다(화면이 내릴 때 쓴다).
 */
export default function 반짝임({ 보임, 크기 = 120, 줄임 = false, 끝나면 = null }) {
  const L = 로티();
  const 참조 = useRef(null);

  useEffect(() => {
    if (!L || !보임 || 줄임) return;
    // 켜지는 «순간»에 처음부터 한 번. play() 가 없는 판(웹 폴백 등)은 조용히 넘긴다.
    try { if (참조.current && 참조.current.play) 참조.current.play(); } catch { /* 재생 실패는 화면을 안 깬다 */ }
  }, [L, 보임, 줄임]);

  if (!L || !보임 || 줄임) return null;

  return (
    <L
      ref={참조}
      source={require('../assets/모션/반짝.json')}
      style={{ width: 크기, height: 크기 }}
      autoPlay
      loop={false}
      onAnimationFinish={끝나면 || undefined}
      pointerEvents="none"
    />
  );
}
