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
 *   ③ **빈칸은 0이 아니라 사유다**(Ⅲ-2) — 안 읽었으면 원천 null + empty_reason.
 *
 * ■ 🔴 판 2 — 심문 판정(2026-09-02 · `docs/_ops/심문결과/세층합류_설계_v1-전건판정.md`)이 고친 셋:
 *   ㉠ **`skill.source` 하나 → `filter`·`picker` 둘**(판정 ③). E2 는 «갈래가 둘»이다 —
 *      본체 = 급수 매핑(후보를 **거른다**) · 둘째 = FSRS due(그 안에서 **고른다**). 둘은 동시에
 *      성립하는데 문자열 한 칸이 하나를 버리고 있었다. 발음 규격의 다축 표기와 같은 병의 처방.
 *   ㉡ **`life` 에 목표 «문장»을 굳힌다**(판정 ②). 원천 이름만 남기면 학생이 시즌 목표를 고친
 *      순간 그날 무엇을 읽었는지 영영 못 본다 — ㉢ 층에는 조인해 복원할 다리가 없다
 *      (㉡ 층은 `intervention.delivered` 의 `evidence_refs` 가 다리를 준다).
 *   ㉢ **`person.axes` 를 개수 → 목록으로**(판정 ②). 호출자가 목록을 손에 쥐고도 길이만
 *      적고 있었다. 같은 사실을 두 곳이 다르게 아는 모양을 없앤다.
 *  ⚠ 판이 바뀌었으므로 소비자는 «행마다» 판을 보고 읽는다(아래 `읽음원천`).
 *
 * ■ 원천 어휘 — 미리 넣어 둔 값(판정이 나는 날 값 하나만 바뀐다 · 설계 §3):
 *   skill.picker: 'rotation'(현행 회전) | 'fsrs_due'(E2 둘째 갈래 뒤) | 'curriculum_intro'
 *   skill.filter: null(현행 — 거르지 않는다) | 'level_map'(E2 본체 뒤)
 *   life:   'season_goal'(나침반) | 'stage'(무대 — §4 뒤)
 *   person: 'behavioral_axes'(행동축) | 'confirmed_preference'(확인 성향 — 성향추출 뒤)
 */

/** reads 규격의 판 — 모양이 바뀌면 올린다(소비자가 「어느 규격의 기록인가」를 행에서 가른다). */
const 읽기판 = 2;

/**
 * 🔴 빈칸 사유의 값록 — **여기가 정본 하나다**(심문 판정 ⑧).
 * 열린 문자열이면 다음 생산자가 새 낱말을 지어내고 집계가 조용히 갈린다. 늘릴 일이 있으면
 * 여기 한 곳에 더하고, 계약 c15 절은 이 파일을 지목만 한다(값을 옮겨 적지 않는다).
 */
const 빈사유들 = Object.freeze([
  'not_target',    // 그날 겨냥이 없는 갈래(게임날·첫날 등)
  'no_goal_yet',   // 나침반 시즌 목표가 아직 없다
  'no_axes',       // 행동축 표본이 아직 없다
  'state_error',   // 🔴 «실패»다 — 없는 것과 가른다(학습자상태 강등 갈래)
]);

/** 시즌 목표 스냅숏 길이 상한 — 넘으면 자르고 표시한다(`evidence_refs.truncated` 와 같은 관행). */
const 목표길이상한 = 200;

/**
 * 적재 시점 재료 → reads 객체.
 * @param {object} 재료
 * @param {string[]} 재료.skill_ids   기술선택 산출(비대상 = 빈 배열)
 * @param {string|null} 재료.시즌목표  나침반 season_goal(없으면 null — 요약에 안 실린 것과 동일 판정)
 * @param {string[]} 재료.axes_used   과제요약 산출(목표 조각은 여기 안 센다 — §6-2 그대로)
 * @param {boolean} [재료.상태오류]    학습자상태 강등 갈래(생성모드 §4-3 — person 을 사유로 가른다)
 * @param {string|null} [재료.겨냥필터] 겨냥 후보를 거른 규칙(현행 없음 = null · E2 본체 뒤 'level_map')
 * @returns {{ver:number, skill:object, life:object, person:object}}
 */
function 읽기기록({ skill_ids, 시즌목표, axes_used, 상태오류 = false, 겨냥필터 = null }) {
  const 겨냥 = Array.isArray(skill_ids) ? skill_ids.filter((s) => typeof s === 'string' && s) : [];
  const 축들 = Array.isArray(axes_used) ? axes_used.filter((a) => typeof a === 'string' && a) : [];
  const 목표 = typeof 시즌목표 === 'string' ? 시즌목표.trim() : '';
  return {
    ver: 읽기판,
    /* 🔴 filter 와 picker 는 «동시에» 참일 수 있다 — 한 칸에 눌러 담지 않는다. */
    skill: 겨냥.length
      ? { picker: 'rotation', filter: 겨냥필터, value: 겨냥 }
      : { picker: null, filter: 겨냥필터, value: null, empty_reason: 'not_target' },
    /* 🔴 원천 «이름»만으로는 못 돌아온다 — 그날 읽은 문장을 굳힌다(목표는 바뀐다). */
    life: 목표
      ? {
        source: 'season_goal',
        value: 목표.slice(0, 목표길이상한),
        truncated: 목표.length > 목표길이상한,
      }
      : { source: null, empty_reason: 'no_goal_yet' },
    person: 상태오류
      ? { source: null, empty_reason: 'state_error' }
      : (축들.length
        ? { source: 'behavioral_axes', axes: 축들 }   // 🔴 개수가 아니라 목록이다
        : { source: null, empty_reason: 'no_axes' }),
  };
}

/** 층 이름 셋 — 커버리지가 세는 축(㉠skill·㉢life·㉡person). */
const 층들 = Object.freeze(['skill', 'life', 'person']);

/**
 * 한 층 칸에서 「읽었나」의 원천을 낸다 — **판 1·2 를 둘 다 읽는다.**
 * 판 1 의 skill 은 `source`, 판 2 는 `picker` 다. 새 판만 읽으면 옛 행이 통째로
 * 「안 읽음」으로 접혀 곡선의 왼끝이 거짓이 된다(자를 갈면서 과거를 다시 쓰는 자리).
 */
function 읽음원천(칸) {
  if (!칸 || typeof 칸 !== 'object') return null;
  return 칸.picker || 칸.source || null;
}

/**
 * task.assigned 행들 → 읽기 커버리지(설계 §3 곡선 «둘» 중 첫째 — 기준선).
 * 「확인 재료 커버리지」(둘째 곡선)는 confirmed 재료가 생기는 §4·§5 뒤에 값이 나기 시작한다 —
 * 지금도 세는 이유는 자를 먼저 세워야 곡선의 왼끝이 진짜이기 때문이다(설계 §10 순서 원리).
 *
 * 🔴 **분모는 「착지한 행」이 아니라 「시도」다**(심문 판정 ⑫). 생성이 실패해 행이 아예 안 생기면
 *   착지 수만 세는 자는 그 실패를 분모에서 조용히 빼고 커버리지를 **부풀린다**. 시도 수를 아는
 *   호출자(밤 배치·계기판)가 주면 갈래를 셋으로 낸다 — 합계 = 갈래 + 갈래.
 * @param {Array<object>} 행들 engine.learning_events 행(task.assigned 외 섞여 있어도 된다).
 * @param {{시도수?: number|null}} [옵션] 그 창의 «생성 시도» 수(모르면 안 준다 — 지어내지 않는다).
 * @returns {{총행수:number, 기록있음:number, 기록없음:number, 시도수:number|null, 미착지:number|null,
 *           깊이분포:Record<string,number>, 층별:Record<string,{읽음:number, 사유별:Record<string,number>}>}}
 */
function 읽기커버리지(행들, 옵션) {
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
      if (읽음원천(칸)) {
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
  /* 🔴 시도수를 «모르면» null 로 낸다 — 총행수로 접으면 「실패 0」이 사실의 얼굴을 쓴다. */
  const 시도 = 옵션 && Number.isFinite(옵션.시도수) ? Number(옵션.시도수) : null;
  return {
    총행수,
    기록있음,
    기록없음: 총행수 - 기록있음,
    시도수: 시도,
    미착지: 시도 === null ? null : 시도 - 총행수,
    깊이분포,
    층별,
  };
}

module.exports = { 읽기판, 빈사유들, 목표길이상한, 읽기기록, 읽기커버리지, 읽음원천, 층들 };
