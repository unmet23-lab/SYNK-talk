'use strict';
/* 감사회귀 R1B7 — D3-2: 답장 화면의 교정문 듣기.
 *
 * 재는 것: 「♪ 이 문장 들어보기」는 corrected_text 가 **있을 때만** 선다.
 * 없는 교정에 버튼이 서면 누르는 순간 아무 일도 안 일어나고(읽을 문장이 없다),
 * 그 침묵은 학생에게 고장으로 읽힌다(F176 「이유 없이 아무 일도 안 일어남」의 축).
 * 🔑 첫 렌더만 본다 — 실재생(expo-speech)은 기기 몫이다(화면세우기 머리말 🚫).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { 그리기 } = require('./lib/화면세우기.js');

test('D3-2 듣기 버튼은 corrected_text 가 있을 때만 선다', () => {
  /* 양성 대조 먼저 — 버튼 자체가 사라져도 아래 미렌더 검사만으로는 초록이라서다
     (0건이 성공 얼굴을 하는 자리 · 탐지력은 짝으로 잰다). */
  const 있음 = 그리기('src/답장화면.js', {
    토큰: 'x', 막힘: null, 학생번호: 'SYNK-042', 돌아가기() {},
    교정: { correction_id: 'c1', actor_kind: 'ai', corrected_text: '어제 학교에 갔어요.', error_tags: ['조사'] },
  });
  assert.match(있음, /이 문장 들어보기/, '교정문이 있는데 듣기 버튼이 없다 — D3-2 시공이 사라졌다');

  const 없음 = 그리기('src/답장화면.js', {
    토큰: 'x', 막힘: null, 학생번호: 'SYNK-042', 돌아가기() {},
    교정: { correction_id: 'c2', actor_kind: 'ai', corrected_text: null, error_tags: ['조사'] },
  });
  assert.doesNotMatch(없음, /이 문장 들어보기|읽는 중/, 'corrected_text 없는 교정에 듣기 버튼이 섰다 — 눌러도 읽을 문장이 없다');
});
