/* §8-B 결과 «유효 뼈대» 한 원천 — 시험지·프롬프트 현행판으로 계약을 통과하는 결과 파일을 짓는다.
 *
 * ■ 왜 있나 (2026-08-25)
 *   차단기 회귀 「비교축 하나만 달라도 한벌 false」가 **실물 결과 파일을 픽스처로** 쓰고 있었다.
 *   그 파일의 `input_hash` 는 «그때의 프롬프트»로 계산된 값이라, 프롬프트를 고치는 순간 계약이
 *   깨지고 그 회귀가 **자기 주제(비교축)와 상관없는 사유로** 빨개진다 — 실제로 v5 판올림 날
 *   그렇게 됐다. 무관한 적색은 곧 「원래 빨간 것」이 되고, 그러면 진짜 적색이 그 안에 숨는다.
 *   ⇒ 픽스처는 «지금 판»으로 그 자리에서 짓는다. 그러면 프롬프트가 몇 번 올라도 안 흔들린다.
 * ■ ⑦(구간축)은 절제가 규격이라 전부 1 이면 오히려 미달이다(채점표 v2) — 목표 있는 사례
 *   앞 여섯만 「썼다」로 둔다(구간 3~10 안). 나머지 축은 전부 1 = 「유효 뼈대」의 뜻.
 */
'use strict';
const 평가 = require('../../lib/과제생성평가.js');

/**
 * @param {object} 시험지  evals/과제생성_시험지.json 파싱본
 * @param {string} 전문    prompts/과제생성.md 원문
 * @param {{쓴목표수?: number}} [옵션]
 * @returns {{동봉: object, 행: object[]}} 계약 0사유를 통과하는 결과(동봉 값은 자리표시자)
 */
function 뼈대(시험지, 전문, { 쓴목표수 = 6 } = {}) {
  const 쓴 = new Set(시험지.사례.filter((c) => c.goal != null).slice(0, 쓴목표수).map((c) => c.case_base_id));
  const 행 = [];
  for (const c of 시험지.사례) {
    const { 본문 } = 평가.사례본문(전문, c);
    for (const r of [1, 2]) {
      const raw = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ sentence: `문장 ${c.case_base_id}`, question: `질문 ${r}?` }) }] });
      행.push({
        case_id: 평가.case_id(c.case_base_id, r),
        axis_scores: Object.fromEntries(평가.축키들.map((k) => [k,
          (k === 평가.구간축) ? (c.goal == null ? null : (쓴.has(c.case_base_id) ? 1 : 0)) : 1])),
        grader_note: '', sentence: `문장 ${c.case_base_id}`, question: `질문 ${r}?`,
        raw_response: raw, raw_response_hash: 평가.응답해시(raw), input_hash: 평가.input_hash(본문),
      });
    }
  }
  const 동봉 = Object.fromEntries([...평가.비교축, ...평가.존재축, ...평가.기록축].map((k) => [k, `v-${k}`]));
  return { 동봉, 행 };
}

module.exports = { 뼈대 };
