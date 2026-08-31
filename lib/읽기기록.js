'use strict';
/* 읽기 기록(reads) — 「이 과제 한 장이 세 층에서 각각 무엇을 읽었나」의 조립기. **순수 함수만**
 * (세층합류_설계_v1 §3 · 유호 채택 09-01 · 계약 c15).
 *
 * ■ 왜 있나 — 층별 읽기의 «증거»가 없었다. `evidence_refs` 는 ㉡ 행동축을 «무엇으로» 읽었는지
 *   들지만, ㉢(시즌 목표가 실렸나)·㉠(어느 겨냥을 어떤 «원천»으로 골랐나)은 사후에 행만 보고
 *   못 가른다. 읽기는 기록 없이는 없다(설계 네 기둥 — 배포≠반영과 같은 원리).
 *
 * ■ 어디 실리나 — `event_draft.reads`(적재 때 굳힘 · ⓒ-13 허용 키) → `task.assigned` 의
 *   payload(착지봉투·마감 스윕이 싣는다). 새 테이블 0 · 새 사건 0(불변식 6 그대로).
 *
 * ■ 🔴 규율 셋 (설계 §3)
 *   ① **키는 ASCII**(값은 한글 허용) — 바깥으로 «키»로 나가는 낱말 규율.
 *   ② **읽은 것 전부를 적는다** — 현행 생성은 이미 ㉡ 행동축·㉢ 시즌 목표를 읽으므로 개원
 *      주에도 2~3층이 정상이다. 「확정 재료만 읽음」으로 세면 기록이 첫날부터 거짓이 된다.
 *   ③ **빈칸은 0이 아니라 사유다**(Ⅲ-2) — 안 읽었으면 source:null + empty_reason.
 *
 * ■ source 어휘 — 미리 넣어 둔 값(판정이 나는 날 값 하나만 바뀐다 · 설계 §3):
 *   skill: 'rotation'(현행 회전) | 'fsrs_due'(E2 둘째 갈래 뒤) | 'curriculum_intro'
 *   life:  'season_goal'(나침반) | 'stage'(무대 — §4 뒤)
 *   person:'behavioral_axes'(행동축) | 'confirmed_preference'(확인 성향 — 성향추출 뒤)
 */

/** reads 규격의 판 — 모양이 바뀌면 올린다(소비자가 「어느 규격의 기록인가」를 행에서 가른다). */
const 읽기판 = 1;

/**
 * 적재 시점 재료 → reads 객체.
 * @param {object} 재료
 * @param {string[]} 재료.skill_ids   기술선택 산출(비대상 = 빈 배열)
 * @param {string|null} 재료.시즌목표  나침반 season_goal(없으면 null — 요약에 안 실린 것과 동일 판정)
 * @param {string[]} 재료.axes_used   과제요약 산출(목표 조각은 여기 안 센다 — §6-2 그대로)
 * @param {boolean} [재료.상태오류]    학습자상태 강등 갈래(생성모드 §4-3 — person 을 사유로 가른다)
 * @returns {{ver:number, skill:object, life:object, person:object}}
 */
function 읽기기록({ skill_ids, 시즌목표, axes_used, 상태오류 = false }) {
  const 겨냥 = Array.isArray(skill_ids) ? skill_ids.filter((s) => typeof s === 'string' && s) : [];
  const 축들 = Array.isArray(axes_used) ? axes_used : [];
  return {
    ver: 읽기판,
    skill: 겨냥.length
      ? { source: 'rotation', value: 겨냥 }
      : { source: null, value: null, empty_reason: 'not_target' },
    life: (typeof 시즌목표 === 'string' && 시즌목표.trim())
      ? { source: 'season_goal' }
      : { source: null, empty_reason: 'no_goal_yet' },
    person: 상태오류
      ? { source: null, empty_reason: 'state_error' }
      : (축들.length
        ? { source: 'behavioral_axes', axes: 축들.length }
        : { source: null, empty_reason: 'no_axes' }),
  };
}

/** 층 이름 셋 — 커버리지가 세는 축(㉠skill·㉢life·㉡person). */
const 층들 = Object.freeze(['skill', 'life', 'person']);

/**
 * task.assigned 행들 → 읽기 커버리지(설계 §3 곡선 «둘» 중 첫째 — 기준선).
 * 「확인 재료 커버리지」(둘째 곡선)는 confirmed 재료가 생기는 §4·§5 뒤에 값이 나기 시작한다 —
 * 지금도 세는 이유는 자를 먼저 세워야 곡선의 왼끝이 진짜이기 때문이다(설계 §10 순서 원리).
 * @param {Array<object>} 행들 engine.learning_events 행(task.assigned 외 섞여 있어도 된다).
 * @returns {{총행수:number, 기록있음:number, 기록없음:number, 깊이분포:Record<string,number>,
 *           층별:Record<string,{읽음:number, 사유별:Record<string,number>}>}}
 */
function 읽기커버리지(행들) {
  const 깊이분포 = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const 층별 = Object.fromEntries(층들.map((l) => [l, { 읽음: 0, 사유별: {} }]));
  let 총행수 = 0;
  let 기록있음 = 0;
  for (const e of Array.isArray(행들) ? 행들 : []) {
    if (!e || e.event_type !== 'task.assigned') continue;
    총행수 += 1;
    const r = e.payload && typeof e.payload === 'object' ? e.payload.reads : null;
    /* 기록 없는 행은 깊이를 «모른다» — 0 으로 접지 않는다(Ⅲ-2). 옛 행·폴백 {ver:1} 행이 여기다. */
    if (!r || typeof r !== 'object') continue;
    기록있음 += 1;
    let 깊이 = 0;
    for (const l of 층들) {
      const 칸 = r[l];
      if (칸 && typeof 칸 === 'object' && 칸.source) {
        깊이 += 1;
        층별[l].읽음 += 1;
      } else {
        const 사유 = (칸 && typeof 칸 === 'object' && typeof 칸.empty_reason === 'string')
          ? 칸.empty_reason : '(사유없음)';
        층별[l].사유별[사유] = (층별[l].사유별[사유] || 0) + 1;
      }
    }
    깊이분포[깊이] += 1;
  }
  return { 총행수, 기록있음, 기록없음: 총행수 - 기록있음, 깊이분포, 층별 };
}

module.exports = { 읽기판, 읽기기록, 읽기커버리지, 층들 };
