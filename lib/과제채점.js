/* 과제채점 — §8-B 사람 채점의 «순수» 적용층 (2026-08-25)
 *
 * ■ 왜 떼나 — 채점을 받는 통로가 둘이 됐다: CLI(tools/과제생성평가.js --채점)와
 *   화면(tools/과제채점.js + 과제채점화면.html · 유호님 79회를 클릭으로 바꾼 것).
 *   규칙(0점→이유 필수 · ⑦ null · 쌍둥이 이음)을 두 곳에 적으면 어느 한쪽이 새고,
 *   그 갈림은 «파일 전체 무효»(E2 — 한 행만 버리는 처분이 없다)로 터진다.
 *   그래서 규칙은 여기 한 벌이고, 통로들은 입출력만 진다(문항검수.js 와 같은 구도).
 *
 * ■ 여기 없는 것 — 산술·계약(축키·통과선·집계·결과검증)은 전부 lib/과제생성평가.js 가
 *   정본이다. 이 파일은 그 계약 «위에서» 사람 입력 하나를 행에 얹는 절차만 안다.
 *
 * ■ 순수 — 파일 I/O 0 · 시계 0(지금은 호출자가 준다). 회귀 = tests/과제채점.test.js.
 */
'use strict';

const 평가 = require('./과제생성평가.js');

const 미채점인가 = (행) => !!행 && 행.grader_note === '미채점';
const 고정인가 = (행) => !!행 && String(행.grader_note).startsWith('0점 고정');

/** 진행 분모 — 좋은 0과 「안 재봤다」를 가른다(전체 = 매김 + 미채점 + 0점 고정). */
function 진행(결과) {
  const 행들 = 결과 && Array.isArray(결과.행) ? 결과.행 : [];
  const 미채점 = 행들.filter(미채점인가).length;
  const 고정 = 행들.filter(고정인가).length;
  return { 전체: 행들.length, 미채점, 고정, 매김: 행들.length - 미채점 - 고정 };
}

/** 모델이 «실제로 본» 학생 상태 블록 — ⑧상태활용은 이걸 안 보면 원리상 못 매긴다(요약에 실린
 *  값이 산출에 쓰였나를 재는 축). 렌더된 요청 본문에서 그 절만 자른다 — 시험지 칸을 다시
 *  조립하지 않는다(두 벌이 되면 갈라진다). CLI 에 살던 것을 이관했다(통로가 둘이 된 날). */
function 상태블록(전문, 사례) {
  try {
    const { 본문 } = 평가.사례본문(전문, 사례);
    const m = /\[학생 상태\]\r?\n([\s\S]*?)(?=\r?\n\[|$)/.exec(본문);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

/** 같은 사례의 다른 회차가 «글자까지 같은» 행 — 없으면 null. 0점 고정 행은 제외한다
 *  (그 0점은 규율의 판정이지 채점이 아니라서, 사람 점수를 이어 붙이면 규율이 지워진다). */
function 쌍둥이(결과, 행) {
  const base = String(행.case_id).split('#')[0];
  return (결과.행 || []).find((x) => x !== 행
    && String(x.case_id).split('#')[0] === base
    && x.sentence === 행.sentence && x.question === 행.question
    && !고정인가(x)) || null;
}

/**
 * 매김적용 — 한 행에 8축 점수를 얹는다. 실패하면 아무것도 안 바꾼다(전부 아니면 전무).
 * 성공하면 결과 객체를 «제자리에서» 고친다 — 원자적 쓰기는 호출자 몫이다.
 *
 * 규칙(전부 CLI 채점과 같은 눈금):
 *   · 대상은 0점 고정이 아닌 행 — 미채점 첫 매김과 «다시 매김»(화면의 되돌아보기) 둘 다 받는다.
 *   · 점수 여덟은 0/1 뿐. ⑦(goal_use)은 목표 없는 사례면 무엇을 보내든 null 로 접는다(«분모에서 뺌»).
 *   · 0점 축이 하나라도 있으면 이유(note)가 필수 — 비면 파일 전체가 무효가 되는 계약(E2)이라
 *     쓰기 전에 여기서 막는다.
 *   · 쌍둥이 회차(글자까지 같은 다른 회차)에는 같은 점수를 잇는다 — 같은 문장에 다른 점수가
 *     나오면 그게 채점자 흔들림이다(CLI 08-23 실측: 40쌍 중 1쌍 완전 동일).
 *
 * @param {{결과: object, 시험지: object, case_id: string, 점수들: Array<0|1>,
 *          note?: string, 채점자: string, 지금: string}} p  지금 = ISO 시각(호출자 시계)
 * @returns {{ok: true, 적용: string[]}|{ok: false, 오류: string}}
 */
function 매김적용({ 결과, 시험지, case_id, 점수들, note, 채점자, 지금 }) {
  const 이름 = String(채점자 == null ? '' : 채점자).trim();
  if (!이름) return { ok: false, 오류: '채점자가 비었다(존재축 — 비면 파일 전체가 무효다)' };
  const 행 = (결과 && Array.isArray(결과.행) ? 결과.행 : []).find((r) => r && r.case_id === case_id);
  if (!행) return { ok: false, 오류: `모르는 case_id: ${case_id}` };
  if (고정인가(행)) return { ok: false, 오류: `${case_id} 는 0점 고정(검문탈락·응답파손) — 채점 대상이 아니다` };
  const base = String(case_id).replace(/#[12]$/, '');
  const 사례 = (시험지 && Array.isArray(시험지.사례) ? 시험지.사례 : []).find((c) => c.case_base_id === base);
  if (!사례) return { ok: false, 오류: `시험지에 없는 사례: ${base}` };
  const 목표없음 = 사례.goal == null;
  if (!Array.isArray(점수들) || 점수들.length !== 평가.축키들.length) {
    return { ok: false, 오류: `점수는 ${평가.축키들.length}개여야 한다 — ${Array.isArray(점수들) ? 점수들.length : typeof 점수들}` };
  }
  const 매김 = {};
  for (let i = 0; i < 평가.축키들.length; i += 1) {
    const k = 평가.축키들[i];
    if (k === 평가.null허용축 && 목표없음) { 매김[k] = null; continue; }
    const v = 점수들[i];
    if (v !== 0 && v !== 1) return { ok: false, 오류: `${k} 값 ${JSON.stringify(v)} — 0·1 뿐(null 은 목표 없는 사례의 ⑦에만, 그건 여기서 접는다)` };
    매김[k] = v;
  }
  const 영점 = 평가.축키들.filter((k) => 매김[k] === 0);
  const 글 = String(note == null ? '' : note).trim();
  if (영점.length && !글) return { ok: false, 오류: `0점 축(${영점.join(',')})이 있는데 이유가 비었다 — 이유 없는 0점은 파일 전체를 무효로 만든다(E2)` };
  행.axis_scores = 매김;
  행.grader_note = 글;
  const 적용 = [case_id];
  const 짝 = 쌍둥이(결과, 행);
  if (짝) {
    짝.axis_scores = { ...매김 };
    짝.grader_note = 글;
    적용.push(짝.case_id);
  }
  결과.동봉 = { ...(결과.동봉 || {}), 채점자: 이름, 시각: 지금 };
  return { ok: true, 적용 };
}

module.exports = { 미채점인가, 고정인가, 진행, 상태블록, 쌍둥이, 매김적용 };
