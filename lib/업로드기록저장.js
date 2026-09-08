'use strict';
const { 업로드기록 } = require('./제출로그.js');

/**
 * 한 화면의 업로드 참조 쓰기를 순서대로 처리한다.
 * 쓰는 사이 새 제출이나 전송 결과가 들어오면 최신 로그에 참조를 다시 합쳐 저장한다.
 * 호출자가 받는 Promise는 디스크와 화면에 모두 반영된 뒤에만 성공한다.
 */
function 업로드기록저장기({ 읽기, 쓰기, 반영 }) {
  let 마지막 = Promise.resolve();
  return (id, audio_ref) => {
    const 작업 = 마지막.then(async () => {
      for (;;) {
        const 이전 = 읽기();
        const 다음 = 업로드기록(이전, id, audio_ref);
        await 쓰기(다음);
        // 로그는 불변 배열이다. 대기 중 다른 갱신이 있었다면 그 항목·결과를 보존한다.
        if (읽기() !== 이전) continue;
        반영(다음);
        return 다음;
      }
    });
    // 실패는 해당 제출에 전달하되 다음 업로드까지 막지는 않는다.
    마지막 = 작업.catch(() => {});
    return 작업;
  };
}

module.exports = { 업로드기록저장기 };
