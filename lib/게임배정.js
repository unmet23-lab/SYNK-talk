/**
 * 게임배정 — 「오늘 이 학생에게 게임(G1)을 낼 것인가」의 순수 판정 (배정 배선 ④ · 발주 §6-6 ⑩·⑪).
 *
 * ■ 자리 — `functions/deliver` 의 게임 갈래는 이 함수 하나를 부른다
 *   말하기의 `lib/오늘과제.오늘과제` 와 같은 이유로 떼어 놨다: 배치 본체는 DB 왕복이라 원격이
 *   필요하고, 「낼 것인가·무엇을」은 순수 판정이라 회귀가 DB 없이 행동으로 잰다(F287 — 함수
 *   본체에 인라인으로 적으면 글자로만 검사되고, 글자 검사는 조건을 통째로 죽여도 초록이다).
 *
 * ■ 판정 순서가 곧 우선순위다 — 갈래마다 어긋나면 잃는 것이 다르다
 *   ① `검수확정` 게이트(발주_게임콘텐츠팩 §3 · fail-closed): 몽골어 검수 전 판은 학생에게 안 연다.
 *      팩 export 를 직접 본다 — 호출자가 값을 넘기게 하면 참을 넘기는 실수가 게이트를 우회한다.
 *   ② 게임날이 아니면 게임이 없다(주 2회 상한 — G1 §3 ③ 검수 용량).
 *   ③ 첫날은 말하기 도입이 이긴다 — 첫 발화 기준선(§4-5)은 소급 불가다.
 *   ④ 🔴 미배달 말하기 교정문이 이긴다(적대 반박 C3): 게임 배정도 `task.assigned` 라 교정
 *      워터마크(「마지막 배정 뒤 확정분만」)를 밀고, 밀린 교정문은 **영구 증발**한다. 게임은
 *      다음 게임날로 미루면 그만이지만 교정문은 그날을 놓치면 되돌릴 수 없다.
 *   ⑤ 재제출(H3)이 새 문항보다 먼저다 — 설계 전체의 유일한 결과 변수(`retry_of_event_id`)를
 *      잇는 자리라, 새 문항이 끼어들면 그 고리가 밀린다.
 *      🔑 재제출은 초급 게이트를 **안 지난다**: 원 제출이 실재한다는 것이 「이 학생이 이 게임을
 *      해냈다」의 실측이고, 급수 추정(`초급인가` 의 「모르면 초급」)보다 강한 근거다.
 *   ⑥ 새 문항은 초급(1~2·미정)을 제외한다 — **판정안이다**(발주는 침묵 · 유호님 이의 자리).
 *      G1 은 격식 메일 «쓰기»라 말하기 자유발화와 같은 비대칭이 선다: 상급자가 게임을 안 받으면
 *      손해 0(말하기가 나간다), 초급자가 게임을 받으면 그날 산출이 통째로 사라진다.
 *
 * ■ 게임날 = 화·금 (판정안 — 발주는 「주 2회 상한」까지만 · 유호님 이의 자리)
 *   근거: 월요일은 한 주의 말하기 기준선을 지키고, 화 제출 → 수·목 검수 → 답장 열람 → 금
 *   재제출이 한 주 안에 닫히는 최단 리듬이다(검수가 밀리면 다음 화로 자연히 넘어간다 — H3 의
 *   닻은 요일이 아니라 「재배정 없음」이라 날을 놓쳐도 안 사라진다).
 *   요일은 `getUTCDay` 로 판다 — `YYYY-MM-DD` 는 몽골 달력 문자열이고 UTC 자정으로 파싱해야
 *   그 문자열의 요일이 나온다(`lib/골든표본.js` 선례 · 로컬 tz 로 읽으면 하루 밀린다).
 *
 * ■ 새 문항 시드는 **결정적**이다 — 같은 학생·같은 날 = 같은 시드
 *   배치 재실행이 같은 결정을 내야 멱등키의 `duplicate` 접힘과 아귀가 맞는다(다른 시드를 내면
 *   「접혔다」가 「다른 것을 내려다 접혔다」가 된다). 해시는 배분이지 비밀이 아니다(`게임제출.
 *   오늘추천` 과 같은 축). ⚠ 연속 게임날에 같은 상황틀이 다시 올 수 있다(45벌 중 무작위 배분) —
 *   팩 §2 가 「상황 재방문은 변주만 다름 · 집계가 안다」로 이미 안고 있는 성질이다.
 *
 * ■ 이 판정이 **안** 하는 것
 *   · `task.assigned`·`submissions` INSERT — 배치 몫(행 규격은 반환값이 전부 든다).
 *   · `intervention.delivered` — G1 은 개입 행이 없다(발주 §8 · 답장이 대본이라 학습 신호 0).
 *   · 같은 `task_ref` 재배정 방지의 물리층 — 멱등키(`task:{learner}:{날짜}`)와 날짜 스코프
 *     `task_ref` 가 진다(⑩ 확정 1 · 이 함수는 `task_ref` 를 **날짜에서만** 판다).
 *
 * ■ 🔴 이 파일은 CJS 다 — 동봉 기전이 CJS 전용이다(`tests/동봉CJS.test.js` · 적대 반박 C2).
 */
'use strict';

const { 검수확정, 문항들, 시드만들기, 모듈상수 } = require('../contents/교수멘탈문항.js');
const { G1스냅샷, 스냅샷모양판, 과제유형 } = require('./게임스냅샷.js');
const { 초급인가 } = require('./오늘과제.js');

/* 게임 요일 — ISO 아닌 JS `getUTCDay` 눈금(일=0)이다. 화=2 · 금=5. 바꾸는 날은 이 줄 하나와
 * 발주 §6-6 ⑪ 을 같이 고친다(문서에만 있으면 어긋나도 저장 시점에 신호가 없다 — §6-8 규칙 5). */
const 게임요일들 = Object.freeze([2, 5]);

const 날짜꼴 = /^\d{4}-\d{2}-\d{2}$/;

/** 그 날짜(몽골 달력 `YYYY-MM-DD`)가 게임날인가. */
function 게임날인가(날짜) {
  if (!날짜꼴.test(String(날짜))) throw new TypeError('게임날인가: 날짜는 YYYY-MM-DD 여야 한다');
  return 게임요일들.includes(new Date(`${날짜}T00:00:00Z`).getUTCDay());
}

/* 시드 공간 전체 — 팩 목록 하나에서 판다(여기 수를 다시 적으면 팩 개정과 갈라진다).
 * `시드만들기` 가 범위를 스스로 검증하므로 여기서 나온 시드는 전부 펴진다. */
const 시드전부 = Object.freeze((() => {
  const out = [];
  for (const 문항 of 문항들) {
    for (let s = 0; s < 문항.사유.length; s += 1) {
      for (let d = 0; d < 문항.세부.length; d += 1) {
        const 시드 = 시드만들기(문항.문항id, s, d);
        if (시드) out.push(시드);
      }
    }
  }
  return out;
})());

/** 새 문항 시드를 결정적으로 고른다 — 같은 (학생, 날짜) = 같은 시드. */
function 시드고르기(learner_id, 날짜) {
  const 글 = `${learner_id}:${날짜}`;
  let 합 = 0;
  for (const ch of 글) 합 = (합 * 31 + ch.codePointAt(0)) % 9973;
  return 시드전부[합 % 시드전부.length];
}

/* 「고쳐서 다시 보낼래요」의 계약 값 — H3 재제출 조인(`functions/deliver`)의 술어가 이 값을
 * 지목한다. 값목록 정본은 계약 JSON `learner_response` 이고 회귀가 소속을 기계로 묶는다
 * (`src/교정API.학생응답값` 과 같은 규약 — 갈라지면 재제출 조인이 조용히 0건이 된다). */
const 재제출의사 = '수정';

/* deliver 의 H3 조인이 원 제출을 G1 로 한정하는 축 — 값 사본이 아니라 팩 정본의 지목이다. */
const 게임챌린지 = 모듈상수.challenge_id;

/**
 * 오늘 이 학생에게 게임을 낼 것인가 — 낸다면 배정 행의 규격 전부를 돌려준다.
 *
 * @param {object} 재료
 * @param {string} 재료.learner_id   새 문항 배분 축(재제출만 있으면 없어도 된다)
 * @param {string} 재료.날짜          몽골 기준 `YYYY-MM-DD`(배정 대상일)
 * @param {boolean} [재료.첫날]       배정 이력이 없다
 * @param {string|null} [재료.교정문]  미배달 말하기 교정문(있으면 게임을 미룬다 — C3)
 * @param {string|null} [재료.급수]    `level_current` 그대로(판정은 `초급인가`)
 * @param {{원사건:string, 원시드:string|null}|null} [재료.재제출]
 *        H3 — 「수정」이 눌렸는데 재배정이 아직 없는 G1 원 제출(deliver 조인이 걷는다)
 * @returns {Readonly<{task_ref:string, task_type:string, task_snapshot:object,
 *   task_schema_ver:string, retry_of_event_id:string|null, degraded:boolean, 출처:string}>|null}
 *   `null` = 게임 없음 — 배치는 말하기 경로로 내려간다(그날 학생이 빈손이 되는 갈래는 없다).
 */
function 게임배정(재료) {
  const { learner_id = null, 날짜, 첫날 = false, 교정문 = null, 급수 = null, 재제출 = null } = 재료 || {};
  if (검수확정 !== true) return null;
  if (!게임날인가(날짜)) return null;
  if (첫날) return null;
  if (교정문 != null) return null;

  let 시드 = null;
  let retry = null;
  let 출처 = '게임';
  if (재제출 && 재제출.원사건) {
    시드 = String(재제출.원시드 || '');
    retry = String(재제출.원사건);
    출처 = '게임재제출';
  } else {
    if (초급인가(급수)) return null;
    if (!learner_id) return null; // 배분 축이 없으면 지어내지 않는다 — 말하기가 나간다
    시드 = 시드고르기(String(learner_id), 날짜);
  }

  /* 재제출인데 원시드를 못 편다 = 팩 개정으로 그 문항이 사라졌다. 지어내면 「같은 메일을
   * 다시 쓴다」는 재제출의 뜻이 죽으므로 게임을 접는다 — 고리는 재배정 없음으로 남아 있고,
   * 그 문항이 판에 돌아오는 날 다시 선다. */
  const task_snapshot = G1스냅샷(시드);
  if (!task_snapshot) return null;

  return Object.freeze({
    task_ref: `task-${날짜}`,   // ⑩ 확정 1 — 날짜에서만 판다(챌린지 식별은 스냅샷 challenge_id)
    task_type: 과제유형,
    task_snapshot,
    task_schema_ver: 스냅샷모양판,
    retry_of_event_id: retry,
    degraded: false,
    출처,
  });
}

module.exports = { 게임요일들, 게임날인가, 시드전부, 시드고르기, 재제출의사, 게임챌린지, 게임배정 };
