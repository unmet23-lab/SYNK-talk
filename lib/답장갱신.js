'use strict';

// 제출 직후 교정이 아직 없어도 잠깐 더 확인한다. AI 호출 없이 기존 조회만 한다.
// 앱을 떠나면 타이머를 멈추고, 돌아오면 다시 읽는다. 겹친 요청은 직렬로 합친다.
const 재조회간격 = Object.freeze([5000, 15000, 30000, 60000, 120000]);

function 답장갱신기({ 읽기, 받기, 오류, 예약 = setTimeout, 취소 = clearTimeout }) {
  let 종료됨 = false;
  let 활성 = true;
  let 진행중 = false;
  let 다시 = false;
  let 타이머 = null;
  let 남은간격 = [];
  let 세대 = 0;

  function 타이머걷기() {
    if (타이머 !== null) 취소(타이머);
    타이머 = null;
  }

  async function 읽기시작() {
    if (종료됨 || !활성) return;
    if (진행중) { 다시 = true; return; }
    진행중 = true;
    다시 = false;
    const 시작세대 = 세대;
    try {
      const 값 = await 읽기();
      if (!종료됨 && 활성 && 시작세대 === 세대) 받기(값);
    } catch (e) {
      if (!종료됨 && 활성 && 시작세대 === 세대) 오류(e);
    } finally {
      진행중 = false;
      if (!종료됨 && 활성) {
        if (다시) void 읽기시작();
        else if (남은간격.length) {
          const 간격 = 남은간격.shift();
          타이머 = 예약(() => { 타이머 = null; void 읽기시작(); }, 간격);
        }
      }
    }
  }

  function 새로읽기({ 제출뒤 = false } = {}) {
    if (종료됨) return;
    타이머걷기();
    세대 += 1;
    if (제출뒤) 남은간격 = [...재조회간격];
    void 읽기시작();
  }

  function 활성바꾸기(값) {
    if (종료됨 || 활성 === 값) return;
    활성 = 값;
    타이머걷기();
    세대 += 1;
    if (활성) void 읽기시작();
  }

  function 종료() {
    종료됨 = true;
    타이머걷기();
    남은간격 = [];
  }

  return { 새로읽기, 활성바꾸기, 종료 };
}

module.exports = { 답장갱신기, 재조회간격 };
