/* 소리 — 앱 전역 소리·햅틱 채널(어댑터). 판정은 전부 `lib/소리게이트.js` 가 한다(단일 게이트).
 *
 * ■ 쓰는 쪽 계약:
 *   · 게임·화면은 이 모듈만 부른다 — expo-audio/expo-haptics 를 직접 잡지 않는다
 *     (따로 잡으면 「녹음 중 0」 이 프로즈로 돌아간다 · §3-1 ⚠ 전역 게이트 한 곳).
 *   · 녹음을 여는 코드(G3·말하기)는 반드시 녹음시작()/녹음끝() 으로 게이트에 알린다.
 *   · 효과음 볼륨 재조정 금지(밸런스는 파일에) · 햅틱은 상태 전이(도장)에만 · 타이핑 무햅틱.
 *   · BGM = **선정 완료**(유호 08-11 「23번으로」) — 기본 트랙이 `synk-bgm-measure.wav` 다.
 *     게임 화면은 인자 없이 bgm재생() 을 부른다(다른 트랙을 끼우는 날 = 새 시청 확정 선행).
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
  mongle: () => require('../assets/sfx/synk-sound-mongle.wav'), // 마스코트 탭 반응(유호 08-25)
};

let bgm플레이어 = null;

function 오디오() { return require('expo-audio'); }

/* 플레이어 캐시 — 이름당 하나를 만들어 두고 되감아 다시 쓴다.
 * 🔴 매 호출 createAudioPlayer 는 두 가지로 «조용히» 죽을 수 있다: ①참조를 아무도 안 쥐면
 *   짧은 소리가 로드 끝나기 전에 수거될 수 있고 ②하루 수십 번(몽글 탭) 만들면 네이티브
 *   플레이어가 샌다. 증상이 무음이라(08-25 「소리가 안 나」) 원인 후보에서 먼저 지운다. */
const 플레이어들 = {};

/** 효과음 — 킷 4종만. 게이트 거부는 조용히 무음(오류가 아니라 설계다). */
export function 효과음(이름) {
  const 답 = 게이트.판정('sfx', 이름);
  if (!답.허용) return false;
  if (!플레이어들[이름]) {
    const { createAudioPlayer } = 오디오();
    플레이어들[이름] = createAudioPlayer(효과음자산[이름]());
  }
  const p = 플레이어들[이름];
  p.seekTo(0);
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

/** BGM — 무한 루프 재생(기본 = 유호 선정 측정 트랙). 녹음 중이면 음소거로 시작한다. */
export function bgm재생(트랙모듈) {
  const 답 = 게이트.판정('bgm시작');
  const { createAudioPlayer } = 오디오();
  if (bgm플레이어) { bgm플레이어.remove(); bgm플레이어 = null; }
  bgm플레이어 = createAudioPlayer(트랙모듈 ?? require('../assets/bgm/synk-bgm-measure.wav'));
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
