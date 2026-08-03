'use strict';
/**
 * 마이크 권한 — 「언제 묻는가」를 한 곳에 가둔다. (유호 결정 2026-08-03)
 *
 * 규칙: 화면 진입이 아니라 **녹음 버튼을 처음 누를 때** 묻는다.
 * 학생이 무슨 화면인지 보기도 전에 뜨는 팝업은 거절률이 높고, 한 번 거절당하면
 * iOS는 앱 안에서 다시 물을 수 없다(설정으로 보내야 한다) — 되돌림 비용이 큰 한 방이다.
 *
 * 🔴 오디오 모드 전환(allowsRecording)도 반드시 이 함수 안에서만 한다.
 *    iOS는 녹음 모드(playAndRecord)를 켜는 것만으로도 권한 창이 뜨기 때문에,
 *    화면 어딘가에서 모드만 미리 켜두면 「버튼 누를 때 묻는다」는 규칙이 조용히 샌다.
 *    통로를 하나로 두는 이유가 그것이다 — 밖에서 켤 수 있으면 언젠가 켠다.
 *
 * expo-audio 는 RN 전용이라 node:test 가 못 부른다. 그래서 호출자를 주입받는다
 * (`lib/세호흡.js`와 같은 이유 — 판정 로직만 떼어내 회귀로 못박는다).
 */

/** 거절 문구는 「무엇이 막혔는지 + 어디서 푸는지」를 함께 말한다. */
const 거절_메시지 = '마이크를 쓸 수 없어요 — 설정에서 마이크를 켜 주세요';

function 사유(e) {
  return String((e && e.message) || e);
}

/**
 * 녹음 직전 1회. 권한을 묻고, 승인됐을 때만 녹음 모드를 켠다.
 * @param {object} 주입
 * @param {() => Promise<{granted:boolean, canAskAgain?:boolean}>} 주입.권한요청
 * @param {(모드:object) => Promise<void>} 주입.오디오모드
 * @returns {Promise<{ok:boolean, 메시지?:string, 재요청가능?:boolean}>}
 *   ok=false 여도 던지지 않는다 — 실패는 예외가 아니라 **화면에 뜨는 글자**로 돌아간다.
 */
async function 마이크준비({ 권한요청, 오디오모드 }) {
  let 결과;
  try {
    결과 = await 권한요청();
  } catch (e) {
    return { ok: false, 메시지: '마이크 확인 실패: ' + 사유(e) };
  }

  if (!결과 || !결과.granted) {
    // 거절이면 오디오 모드는 건드리지 않는다. 켜봐야 권한 창만 한 번 더 뜬다.
    return { ok: false, 메시지: 거절_메시지, 재요청가능: !!(결과 && 결과.canAskAgain) };
  }

  try {
    await 오디오모드({ allowsRecording: true, playsInSilentMode: true });
  } catch (e) {
    return { ok: false, 메시지: '오디오 준비 실패: ' + 사유(e) };
  }
  return { ok: true };
}

/**
 * 녹음이 끝나면 녹음 모드를 내린다.
 * iOS는 playAndRecord 세션이 살아 있는 동안 재생이 작게 나와서, 바로 뒤에 오는
 * 「내 목소리 듣기」가 안 들린다고 오해받는다. 실패해도 흐름은 막지 않는다.
 */
async function 마이크끄기({ 오디오모드 }) {
  try {
    await 오디오모드({ allowsRecording: false, playsInSilentMode: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, 메시지: 사유(e) };
  }
}

module.exports = { 마이크준비, 마이크끄기, 거절_메시지 };
