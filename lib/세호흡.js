'use strict';
/**
 * 「말하기」 순수 로직 — UI·저장소를 모른다.
 *
 * 왜 분리하는가: RN 화면은 node:test 로 못 돌리지만 **판정 로직은 돌릴 수 있다.**
 * 머뭇거림·무발화·재시도 번호는 데이터의 뼈대라서(설계 §3·§5) 화면보다 먼저 회귀로 못박는다.
 * 정본 = docs/말하기_설계.md
 */

/** 발화로 치는 마이크 레벨(dBFS). 실기기 실측 전의 초기값 — 바꾸면 머뭇거림 축의 과거와 갈라지므로
 *  바꿀 때는 로그의 threshold 필드로 함께 남긴다(아래 항목 참조). */
const 발화문턱_DB = -35;

/** 완전 무음의 dBFS. 수학으로는 -∞ 라 비교·직렬화가 둘 다 깨진다 — 바닥을 숫자로 내려놓는다. */
const 무음_DB = -160;

/**
 * PCM 조각의 세기(dBFS · 0 = 최대진폭). 표본은 **정수 리틀엔디언**이다(`useAudioStream` `int16`).
 *
 * 🔑 왜 우리가 재나: 옛 통로는 녹음기의 `metering` 을 받아 썼는데, PCM 스트림에는 그런 칸이 없다.
 * 눈금은 그대로 dBFS 라 `발화문턱_DB` 와 과거 로그가 안 갈라진다 — **문턱을 바꾸지 않으려고
 * 같은 단위로 잰다.** 반쪽 표본(홀수 바이트)은 세지 않는다(`wav조립` 이 버리는 것과 같은 꼬리).
 *
 * @param {Uint8Array} 바이트
 * @returns {number|null} 표본이 하나도 없으면 null — 0 으로 적으면 「최대 음량」이 된다
 */
function 데시벨(바이트) {
  const b = 바이트 instanceof Uint8Array ? 바이트 : Uint8Array.from(바이트 || []);
  const 표본수 = Math.floor(b.length / 2);
  if (표본수 === 0) return null;

  const dv = new DataView(b.buffer, b.byteOffset, 표본수 * 2);
  let 제곱합 = 0;
  for (let i = 0; i < 표본수; i += 1) {
    const v = dv.getInt16(i * 2, true) / 32768;
    제곱합 += v * v;
  }
  const rms = Math.sqrt(제곱합 / 표본수);
  return rms > 0 ? 20 * Math.log10(rms) : 무음_DB;
}

/**
 * 머뭇거림 추적기 — 녹음 시작(t=0)부터 마이크 레벨 표본을 받아
 * **첫 발화 시각**을 잡는다. 설계 §5: 퀴즈 확신도의 대체물. 자기보고보다 정직하다.
 */
function 머뭇거림추적() {
  let 첫발화_ms = null;
  return {
    /** @param {number} t_ms 녹음 시작 기준 경과 ms @param {number|null|undefined} dB 미터링 값 */
    표본(t_ms, dB) {
      if (첫발화_ms === null && typeof dB === 'number' && dB > 발화문턱_DB) 첫발화_ms = t_ms;
    },
    /**
     * @param {number} 총길이_ms 녹음 총 길이
     * @returns {{발화있음:boolean, 머뭇거림_ms:number}}
     *   무발화면 머뭇거림 = 총길이(「끝까지 말을 못 꺼냈다」를 연속값으로 남긴다 — 설계 §3-4)
     */
    결과(총길이_ms) {
      const 발화있음 = 첫발화_ms !== null;
      return { 발화있음, 머뭇거림_ms: 발화있음 ? 첫발화_ms : 총길이_ms };
    },
  };
}

/** 세 호흡의 순서. 화면은 이 배열을 따라 흐른다 — 순서를 바꾸려면 설계 문서부터. */
const 호흡순서 = ['듣기', '따라', '답하기'];

/**
 * 다음 호흡. 마지막이면 '완료'.
 * @param {string} 현재
 */
function 다음호흡(현재) {
  const i = 호흡순서.indexOf(현재);
  if (i === -1) throw new Error(`알 수 없는 호흡: ${현재}`);
  return i + 1 < 호흡순서.length ? 호흡순서[i + 1] : '완료';
}

module.exports = { 발화문턱_DB, 무음_DB, 데시벨, 머뭇거림추적, 호흡순서, 다음호흡 };
