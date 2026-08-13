/* 사슬 점검(`tools/사슬점검.js`) — **탐지력**을 못박는다.
 *
 * 🔴 이 파일이 없으면 그 도구의 초록은 「사슬이 돈다」가 아니라 「아무것도 안 쟀다」와
 *   **같은 모양**이다(초록은 분모와 함께만 읽는다). 그래서 여기서 재는 것은 값이 아니라
 *   **재료를 빼면 그 자리가 빨개지는가** 하나뿐이다.
 * 🔑 실저장소(합성 이력 전량)에는 거짓양성만 검사한다 — 「버그가 아직 있을 것을 요구하는
 *   회귀」를 만들지 않기 위해서다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { 판정, 합성이력, 끝시각 } = require('../tools/사슬점검.js');

const 빼고 = (종) => 합성이력().행들.filter((e) => e.event_type !== 종);
const 끊김글 = (행들) => 판정(행들, 끝시각).끊김.join(' / ');

test('실저장소 — 재료를 다 주면 사슬이 끝까지 돈다(거짓양성 없음)', () => {
  const { 끊김 } = 판정(합성이력().행들, 끝시각);
  assert.deepEqual(끊김, [], '재료를 다 줬는데 끊긴 자리가 있다 — 라이브를 켜도 안 될 자리다');
});

test('탐지력 ① — 관측(content.viewed)이 없으면 «개입이 관측으로 안 이어졌다»를 잡는다', () => {
  /* 이 자리가 실제 위험이다: 관측 생산자가 화면 하나뿐이라, 그 화면을 안 거친 배달은
   * 원리상 관측 0건이다. 도구가 그것을 못 잡으면 「배달은 나가는데 아무도 안 본다」가
   * 초록으로 지나간다. */
  const 글 = 끊김글(빼고('content.viewed'));
  assert.match(글, /관측으로 하나도 안 이어졌다/, '관측을 통째로 뺐는데 조용하다');
});

test('탐지력 ② — 개입(intervention.delivered)이 없으면 «닻을 못 찾는다»를 잡는다', () => {
  const 글 = 끊김글(빼고('intervention.delivered'));
  assert.match(글, /닻을 못 찾는다/, '개입을 통째로 뺐는데 회수가 초록이다');
});

test('탐지력 ③ — 축의 재료를 빼면 그 축이 null 로 잡힌다(축이 조용히 죽는 것을 막는다)', () => {
  /* 축이 죽는 증상은 「값이 낮다」가 아니라 「값이 없다」인데, 그 둘은 화면에서 같아 보인다.
   * 재료별로 어느 축이 죽는지를 여기서 못박아 둔다. */
  for (const [종, 축] of [
    ['preference.stated', '선호'],
    ['affect.reported', '정서'],
    ['quiz.answered', '자기인식'],
    ['choice.selected', '관심'],
  ]) {
    const 글 = 끊김글(빼고(종));
    assert.match(글, new RegExp(`${축}[^]*축이 null`), `${종} 를 뺐는데 ${축} 축이 null 로 안 잡혔다`);
  }
});

test('탐지력 ④ — 사건이 하나도 없으면 여러 자리가 동시에 빨개진다(조용한 0 이 없다)', () => {
  const { 끊김 } = 판정([], 끝시각);
  assert.ok(끊김.length >= 3, `빈 이력인데 끊김이 ${끊김.length}건뿐이다 — 0 이 조용히 통과한다`);
});

test('탐지력 ⑤ — G4 지목 행을 빼면 강제산출 축이 null 로 잡힌다(표식이 사건 종이 아니라 스냅샷이다)', () => {
  /* 이 축은 사건 «종»을 빼서는 못 죽는다(quiz.answered 를 빼면 자기인식이 먼저 죽는다) —
   * 표식(팩 challenge_id)으로만 갈리므로, 탐지력도 그 표식으로 걷어낸 이력으로 잰다. */
  const { 모듈상수 } = require('../contents/서류관문문항.js');
  const 남김 = 합성이력().행들.filter((e) => {
    const snap = e.submission && e.submission.task_snapshot;
    return !(snap && snap.challenge_id === 모듈상수.challenge_id);
  });
  const 글 = 끊김글(남김);
  assert.match(글, /강제산출[^]*축이 null/, 'G4 행을 뺐는데 강제산출 축이 null 로 안 잡혔다');
});
