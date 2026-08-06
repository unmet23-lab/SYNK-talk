/* 오늘 낼 것을 고른다 — P0 §6「하루 한 문장」 배달 경로의 **의미 부분**.
 *
 * ■ 왜 함수로 떼어 놨나
 *   배치 본체(`functions/deliver`)는 DB 왕복이라 실행에 원격 프로젝트가 필요하다.
 *   「무엇을 낼 것인가」는 순수 판정이므로 여기서 서고, 회귀가 **DB 없이** 탐지력을 잰다.
 *   앱에도 얹을 수 있다(강등으로 큐가 비었을 때 화면이 같은 고정 과제를 띄운다 · C0 §4-3 ①).
 *
 * ■ 하루 1건인데 호흡은 셋 (P0 §2-1)
 *   ①듣기는 `intervention.delivered` 의 `output_text`(AI 가 한 말)이고,
 *   ②따라 말하기·③답하기가 이 스냅샷에 든다.
 *   🔴 **행의 `task_format` 을 채우지 않는다** — ②는 `낭독`, ③은 `자유발화` 로 형식이 둘이다.
 *   한 칸에 담으면 P0 §2-1 이 경계한 「낭독 데이터로 회화 모델을 학습시키는 사고」가
 *   배정 단계에서부터 성립한다. 형식은 **호흡마다** 적고, 제출 행은 각자 자기 형식을 갖는다.
 *
 * ■ AI 문장 생성이 아직 없다는 사실을 숨기지 않는다
 *   §6-1 의 셋째 갈래(급수·목적으로 다음 문장 생성)는 모델·프롬프트 계약이 아직 없다.
 *   그 자리는 §6-4 **강등 경로**가 이미 정의해 뒀다 — 큐의 전날 문장 → 없으면 고정 도입 과제.
 *   그래서 그 갈래로 나가는 배정은 `degraded: true` 로 **행에 남는다**. 안 그러면 원장 화면의
 *   「강등 발생 건수」가 0으로 보이고, **막힌 것이 통과한 것처럼 보이는 상태**가 된다(§4-1).
 */
'use strict';

/* 날짜는 **몽골 달력**으로 끊는다(C0 §4-3 ① · §10-A-4).
 * UTC 로 끊으면 몽골 오전 8시(=00:00Z)까지가 「어제」라, 아침에 앱을 연 학생이
 * 어제 것을 오늘 것으로 받는다. 오프셋을 상수로 적지 않는 이유는 그게 규칙의 사본이기
 * 때문이다 — 규칙은 tzdata 가 지고, 여기는 이름만 든다. */
const 시간대 = 'Asia/Ulaanbaatar';
const 날짜형식 = new Intl.DateTimeFormat('en-CA', {
  timeZone: 시간대, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** @param {Date|string|number} [때] @returns {string} `YYYY-MM-DD` (몽골 기준) */
function 몽골날짜(때) {
  const d = 때 == null ? new Date() : 때 instanceof Date ? 때 : new Date(때);
  if (Number.isNaN(d.getTime())) throw new TypeError('몽골날짜: 날짜가 아니다');
  return 날짜형식.format(d);
}

/* 배치의 멱등키는 **결정론적**이다(C0 §4-1 · §10-A-4).
 * 두 번 돌면 두 번째는 기존 멱등이 `duplicate` 로 접으므로 「하루 1건」에 새 유일 제약이 없다. */
const 멱등키 = (종류, learner_id, 날짜) => `${종류}:${learner_id}:${날짜}`;

/* 고정 도입 과제 — §4-5 유호님 확정(1일차 = 자기 소개 낭독 + 자유 한 마디).
 * §6-4 의 마지막 강등 단계도 **같은 것**을 쓴다(둘째 세트를 만들면 그게 계약 밖 콘텐츠다). */
const 도입 = Object.freeze({
  따라말하기: '안녕하세요. 저는 (이름)입니다. 몽골에서 왔습니다.',
  답하기: '오늘 하루 어땠어요? 한 마디로 말해 주세요.',
});

/** 호흡 2개짜리 스냅샷 — 「그날 학생이 본 것 그대로」(C0 §4-3 ①). */
function 스냅샷(날짜, 문장, 출처, 프롬프트) {
  return {
    ver: 1,
    날짜,
    호흡: [
      { 차례: 2, 무엇: '따라 말하기', task_format: '낭독', 문장, 출처 },
      { 차례: 3, 무엇: '답하기', task_format: '자유발화', 프롬프트 },
    ],
  };
}

/**
 * 오늘 이 학생에게 낼 것을 고른다.
 *
 * @param {object} 재료
 * @param {string} 재료.날짜          몽골 기준 `YYYY-MM-DD`
 * @param {boolean} [재료.첫날]       이 학생에게 배정 이력이 없다
 * @param {string|null} [재료.교정문]  지난 배정 뒤에 새로 확정된 교정문(있으면 ②슬롯 · §6-3)
 * @param {string|null} [재료.전날문장] 마지막 배정의 ②문장(강등 1단계 · §6-4)
 * @returns {{task_snapshot: object, task_ref: string, degraded: boolean, 출처: string}}
 */
function 오늘과제(재료) {
  const { 날짜, 첫날 = false, 교정문 = null, 전날문장 = null } = 재료 || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(날짜))) throw new TypeError('오늘과제: 날짜는 YYYY-MM-DD 여야 한다');

  /* 순서가 곧 우선순위다(§6-1 의 세 갈래 + §6-4 의 두 단계).
   * `첫날` 이 교정문보다 앞이다 — 배정 이력이 없는데 교정이 있는 상태는 데이터가 어긋난
   * 것이고, 그때 「어제 교정문」을 내면 그 학생의 **첫 발화 기준선**(§4-5 · 소급 불가)을 잃는다. */
  const [문장, 출처, degraded] =
    첫날 ? [도입.따라말하기, '도입', false]
    : 교정문 ? [String(교정문), '교정문', false]
    : 전날문장 ? [String(전날문장), '전날', true]
    : [도입.따라말하기, '도입', true];

  return {
    task_snapshot: 스냅샷(날짜, 문장, 출처, 도입.답하기),
    task_ref: `task-${날짜}`,
    degraded,
    출처,
  };
}

/** 스냅샷에서 ②문장만 되꺼낸다 — 다음 날 강등의 「전날 문장」이 여기서 나온다. */
const 따라말하기문장 = (snap) => {
  const h = snap && Array.isArray(snap.호흡) ? snap.호흡.find((x) => x && x.차례 === 2) : null;
  return h && h.문장 ? String(h.문장) : null;
};

module.exports = { 몽골날짜, 멱등키, 오늘과제, 따라말하기문장, 도입, 시간대 };
