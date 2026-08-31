'use strict';
/**
 * 오디오스트림문지기 — expo-audio «내부 경로 직수입»이 판올림에 조용히 깨지는 것을 막는다 (감사 S1-9).
 *
 * ■ 병 — src/말하기화면.js:24 가 `expo-audio/build/AudioStream` 을 **내부 경로로** 직수입한다.
 *   배럴(build/index.js)이 AudioStream 을 «타입으로만» 재수출해서(5행 `export type * ...`)
 *   공식 입구가 없기 때문이다. 내부 경로는 공개 계약이 아니라, expo-audio 가 build 구조를
 *   바꾸는 날 Metro 가 그 자리에서 죽는다 — 그리고 그 죽음은 «판올림 커밋»이 아니라
 *   «다음 번들» 때 나서 원인이 멀어 보인다.
 *
 * ■ 처방 — 고치는 게 아니라 **문을 지킨다**(스키아패치 선례의 판정 절반만):
 *   ㉮ build/AudioStream.js 가 실재하고 본문에 `export function useAudioStream` 이 있는가.
 *      ESM 컴파일본이라 require 로 못 연다 — «본문 검사»다.
 *   ㉯ build/index.js 에 AudioStream 의 «런타임» 재수출이 생겼는가 — 생겼으면 직수입을 걷고
 *      공식 입구로 갈 때다(이 문지기도 같이 걷는다).
 *   둘 다 「병도 처방도 못 찾으면 빨갛게」 — 조용히 넘어가면 판올림이 미확인으로 «성공처럼» 찍힌다.
 *
 * ■ postinstall 에 걸린다 — 새 체크아웃·판올림마다 스스로 다시 잰다(fresh-checkout 함정).
 */
const fs = require('fs');
const path = require('path');

const 뿌리 = path.join(__dirname, '..', 'node_modules', 'expo-audio', 'build');

/** @returns {{값: boolean, 사유: string}} 값 true = 통과(직수입이 오늘도 안전하다) */
function 판정() {
  const 본체경로 = path.join(뿌리, 'AudioStream.js');
  if (!fs.existsSync(본체경로)) {
    return {
      값: false,
      사유: 'expo-audio 가 build 구조를 바꿨다: build/AudioStream.js 가 없다 — '
        + 'src/말하기화면.js:24 직수입이 Metro 에서 죽는다. 새 판의 구조를 보고 재판정하라.',
    };
  }
  const 본문 = fs.readFileSync(본체경로, 'utf8');
  if (!본문.includes('export function useAudioStream')) {
    return {
      값: false,
      사유: 'build/AudioStream.js 는 있는데 useAudioStream 수출이 사라졌다 — '
        + '직수입(src/말하기화면.js:24)이 undefined 를 받는다. 새 판의 수출 지도를 보고 재판정하라.',
    };
  }
  const 배럴 = fs.readFileSync(path.join(뿌리, 'index.js'), 'utf8');
  if (/export\s+(?!type)[^;\n]*from\s+'\.\/AudioStream'/.test(배럴)) {
    return {
      값: false,
      사유: '배럴(build/index.js)이 AudioStream 을 런타임으로 재수출하기 시작했다 — '
        + '직수입을 공식 입구(expo-audio)로 걷고, 이 문지기도 같이 걷어라(병이 나은 날의 빨강).',
    };
  }
  return { 값: true, 사유: '직수입 전제 둘 다 유효 — build/AudioStream.js 실재 · 배럴은 여전히 타입만 재수출' };
}

module.exports = { 판정 };

if (require.main === module) {
  const r = 판정();
  console.log(`[오디오스트림문지기] ${r.값 ? '통과' : '🔴 멈춤'} — ${r.사유}`);
  if (!r.값) process.exit(1);
}
