/* 소리 — 앱 전역 소리·햅틱 채널(어댑터). 판정은 전부 `lib/소리게이트.js` 가 한다(단일 게이트).
 *
 * ■ 쓰는 쪽 계약:
 *   · 게임·화면은 이 모듈만 부른다 — expo-audio/expo-haptics 를 직접 잡지 않는다
 *     (따로 잡으면 「녹음 중 0」 이 프로즈로 돌아간다 · §3-1 ⚠ 전역 게이트 한 곳).
 *   · 녹음을 여는 코드(G3·말하기)는 반드시 녹음시작()/녹음끝() 으로 게이트에 알린다.
 *   · 효과음 볼륨 재조정 금지(밸런스는 파일에) · 햅틱은 상태 전이(도장)에만 · 타이핑 무햅틱.
 *   · 🔴 BGM 재생(bgm재생)은 **유호님 시청 확정 후** 선정 트랙으로만 부른다 — 후보 단계에선
 *     게임 화면이 이 함수를 부르지 않는다(§3-2 ⓑ 순서 밖 금지).
 *
 * ■ expo 모듈은 전부 지연 require — node 테스트가 이 파일을 그대로 읽을 수 있어야 한다.
 */
'use strict';
import { 만들기 } from '../lib/소리게이트.js';

const 게이트 = 만들기();

const 효과음자산 = {
  earn: () => require('../assets/sfx/synk-sound-earn.wav'),
  achieve: () => require('../assets/sfx/synk-sound-achieve.wav'),
  notify: () => require('../assets/sfx/synk-sound-notify.wav'),
};

let bgm플레이어 = null;

function 오디오() { return require('expo-audio'); }

/** 효과음 — 킷 3종만. 게이트 거부는 조용히 무음(오류가 아니라 설계다). */
export function 효과음(이름) {
  const 답 = 게이트.판정('sfx', 이름);
  if (!답.허용) return false;
  const { createAudioPlayer } = 오디오();
  const p = createAudioPlayer(효과음자산[이름]());
  p.play();
  return true;
}

/** 도장 햅틱 — §3-3 5번(판 종료 문장부호) 전용. 다른 자리에서 부르지 않는다. */
export function 도장햅틱() {
  const 답 = 게이트.판정('haptic');
  if (!답.허용) return false;
  const Haptics = require('expo-haptics');
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  return true;
}

/** BGM — 선정 확정 트랙 모듈을 받아 무한 루프 재생. 녹음 중이면 음소거로 시작한다. */
export function bgm재생(트랙모듈) {
  const 답 = 게이트.판정('bgm시작');
  const { createAudioPlayer } = 오디오();
  if (bgm플레이어) { bgm플레이어.remove(); bgm플레이어 = null; }
  bgm플레이어 = createAudioPlayer(트랙모듈);
  bgm플레이어.loop = true;
  if (답.조치 === '음소거로시작') bgm플레이어.muted = true;
  bgm플레이어.play();
  게이트.bgm상태(true);
}

export function bgm정지() {
  if (bgm플레이어) { bgm플레이어.remove(); bgm플레이어 = null; }
  게이트.bgm상태(false);
}

/** 녹음 경계 — G3·말하기 화면이 녹음을 열고 닫을 때 반드시 부른다. */
export function 녹음시작() {
  for (const { 할일 } of 게이트.녹음시작()) {
    if (할일 === 'bgm음소거' && bgm플레이어) bgm플레이어.muted = true;
  }
}
export function 녹음끝() {
  for (const { 할일 } of 게이트.녹음끝()) {
    if (할일 === 'bgm복원' && bgm플레이어) bgm플레이어.muted = false;
  }
}

export function 지금녹음중() { return 게이트.지금녹음중(); }
