'use strict';
/**
 * PCM 조각 → WAV 바이트. 소급 불가 배선 ①(C0 §4-2 정본 = PCM WAV 16kHz/16bit/mono).
 *
 * ■ 왜 앱이 직접 조립하나
 *   `expo-audio` 의 **녹음기**(`useAudioRecorder`)는 컨테이너 인코더라 m4a/AAC 만 낸다.
 *   손실 압축이 지운 떨림·미세 발음은 원본이 없어 **되살아나지 않는다** — 나중에 규격을 고쳐도
 *   그 전에 쌓인 것은 영영 압축본이다. 그래서 마이크 **PCM 스트림**(`useAudioStream`)을 받아
 *   앱이 RIFF 를 씌운다. 🔑 새 네이티브 의존성 0 — `expo-audio` 57 에 이미 들어 있다.
 *
 * ■ 헤더에 적는 값은 요청값이 아니라 **스트림이 보고한 값**이다
 *   16kHz 를 요청해도 기기가 못 주면 네이티브가 조용히 48kHz 로 되돌린다
 *   (`AudioStream.kt` FALLBACK_SAMPLE_RATES). 요청값을 헤더에 적으면 그 파일은 **자기가 무엇인지
 *   거짓말하는 원본**이 되고, 서버(`음성헤더.js`)가 재는 값도 같이 거짓이 되어 규격 위반이
 *   영영 안 보인다. 그래서 이 함수는 값을 **추측하지 않는다** — 모르면 던진다.
 *
 * ■ 규격 밖이어도 거부하지 않는다
 *   48kHz·2ch 가 와도 그대로 조립한다. 거부하면 학생의 발화가 사라지고, 그건 규격 위반보다 비싸다.
 *   대신 헤더에 **실제 값**이 박히므로 서버가 `spec_violations` 로 행마다 센다(C0 §4-2).
 */

/** 44바이트 표준형. 읽는 쪽(`음성헤더.js`)은 청크를 걸어가지만, 쓰는 쪽이 LIST·fact 를 끼울 이유가 없다. */
const 헤더바이트 = 44;

const 양의정수 = (v) => (Number.isInteger(v) && v > 0 ? v : null);

const 글자쓰기 = (dv, off, s) => {
  for (let i = 0; i < s.length; i += 1) dv.setUint8(off + i, s.charCodeAt(i));
};

/** 조각 하나를 Uint8Array 로 — 스트림은 `ArrayBuffer` 를 준다. */
const 바이트로 = (c) => {
  if (!c) return new Uint8Array(0);
  if (c instanceof Uint8Array) return c;
  return new Uint8Array(c);
};

/**
 * @param {object} 인자
 * @param {Array<Uint8Array|ArrayBuffer>} 인자.조각들 마이크가 준 PCM 조각들(정수 리틀엔디언, 순서대로)
 * @param {number} 인자.sample_rate  🔴 **스트림이 보고한** 실제 Hz (요청값이 아니다)
 * @param {number} 인자.channels     🔴 **스트림이 보고한** 실제 채널 수
 * @param {number} [인자.bit_depth]  표본 비트 수(스트림 encoding `int16` → 16)
 * @returns {{바이트: Uint8Array, 프레임수: number, duration_ms: number, 버린바이트: number}}
 * @throws 규격을 모르면 — 헤더는 추측으로 쓰면 안 된다(위 ■2)
 */
function wav조립({ 조각들, sample_rate, channels, bit_depth = 16 }) {
  const sr = 양의정수(sample_rate);
  const ch = 양의정수(channels);
  const bd = 양의정수(bit_depth);
  if (!sr || !ch || !bd || bd % 8 !== 0) {
    throw new Error(
      `녹음 규격을 모르는 채로는 파일을 쓸 수 없어요 (sample_rate=${sample_rate} channels=${channels} bit_depth=${bit_depth})`
    );
  }

  const 조각 = (조각들 || []).map(바이트로);
  const 프레임바이트 = ch * (bd / 8);
  const 받은바이트 = 조각.reduce((n, c) => n + c.length, 0);

  /* 프레임 경계에서 자른다. 반쪽 표본을 남기면 그 뒤 바이트가 통째로 한 칸 밀려
   * **소리가 잡음이 되는데 파일은 멀쩡해 보인다.** 버린 양은 숨기지 않고 돌려준다. */
  const 프레임수 = Math.floor(받은바이트 / 프레임바이트);
  const 데이터바이트 = 프레임수 * 프레임바이트;

  const out = new Uint8Array(헤더바이트 + 데이터바이트);
  const dv = new DataView(out.buffer);
  글자쓰기(dv, 0, 'RIFF');
  dv.setUint32(4, 36 + 데이터바이트, true);
  글자쓰기(dv, 8, 'WAVE');
  글자쓰기(dv, 12, 'fmt ');
  dv.setUint32(16, 16, true); // fmt 청크 길이
  dv.setUint16(20, 1, true); // 1 = 정수 PCM · `음성헤더.js` 코덱표의 `pcm_wav`
  dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 프레임바이트, true); // byteRate — 읽는 쪽이 duration 을 여기서 낸다
  dv.setUint16(32, 프레임바이트, true); // blockAlign
  dv.setUint16(34, bd, true);
  글자쓰기(dv, 36, 'data');
  dv.setUint32(40, 데이터바이트, true);

  let off = 헤더바이트;
  let 남은 = 데이터바이트;
  for (const c of 조각) {
    if (남은 <= 0) break;
    const 쓸것 = c.length <= 남은 ? c : c.subarray(0, 남은);
    out.set(쓸것, off);
    off += 쓸것.length;
    남은 -= 쓸것.length;
  }

  return {
    바이트: out,
    프레임수,
    duration_ms: Math.round((프레임수 / sr) * 1000),
    버린바이트: 받은바이트 - 데이터바이트,
  };
}

module.exports = { 헤더바이트, wav조립 };
