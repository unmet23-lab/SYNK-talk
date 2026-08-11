/* 사건 하나가 「어떻게 알게 된 것인가」 — 계약 `추정메타` 의 `source_kind`.
 *
 * ■ 왜 이 파일이 따로 있나
 *   `source_kind` 는 **서버가 채우는 칸**이다(`lib/이벤트검증.js` 의 `서버칸` — 앱이 보내면
 *   400). 앱이 자기 사건을 「이건 관측입니다」라고 선언하면 그건 자기 증명이라 아무것도
 *   막지 못한다. 그래서 값을 정하는 곳은 서버 통로 둘(`functions/events`·`functions/deliver`)
 *   인데, 둘이 각자 적으면 **갈라진다** — 같은 사건이 한쪽에선 관측, 다른 쪽에선 추정이 되고
 *   증상은 몇 달 뒤 집계가 안 맞는 것뿐이다. 그래서 표는 하나고 둘이 여기서 읽는다.
 *
 * ■ `actor_kind` 와 다른 축이다
 *   `actor_kind` = **누가 했나**(learner·ai·teacher) / `source_kind` = **어떻게 알게 됐나**.
 *   L0 §중요-3 이 v1 에서 두 뜻이 한 칸에 섞인 사고(`inferred` 를 「AI가 교정했다」로 씀)를
 *   기록하고 갈라 놓은 축이라, 다시 합치면 그 사고로 되돌아간다.
 *
 * ■ 🔴 새 `event_type` 을 계약에 늘리면 여기도 늘려야 한다
 *   안 늘리면 그 사건의 행은 `source_kind` 가 null 로 쌓이고, 나중에 무엇이 관측이고 무엇이
 *   추정이었는지 판별할 길이 없다(소급 불가 · 절단문서 ①-7). `tests/사건출처.test.js` 가
 *   계약 값목록과 **전건 대조**해서, 이름만 늘리고 여기를 비우면 빨개진다.
 */
'use strict';

/* 계약 `수집_교정_계약.json` 값목록 `source_kind` 4종.
 *   explicit  = 학생이 스스로 말했다        teacher  = 사람(강사·운영자)이 입력했다
 *   observed  = 학생 행동을 그대로 관측했다  inferred = 우리가 추정했다 */
const 출처종류 = {
  // ── observed: 학생이 한 것을 그대로 받아 적었다.
  'submission.created': 'observed',
  'quiz.answered': 'observed',
  'choice.selected': 'observed',
  'correction.viewed': 'observed',
  'correction.responded': 'observed',
  'session.abandoned': 'observed',
  /* c9 — 「그날 앞에 놓인 것에 학생의 눈·귀가 닿았다」. 🔑 이 사건의 존재 이유가
   *   `intervention.delivered`(바로 아래 `inferred`)의 **관측 짝**이라, 여기서 observed 가
   *   아니면 추정과 관측이 같은 값으로 쌓여 c9 를 낸 이유가 사라진다(절단문서 ①-12). */
  'content.viewed': 'observed',

  /* ── explicit: 학생이 **말로 선언**한 것. 관측(행동에서 읽어낸 것)과 갈라 둔다 —
   *   같은 「선호」라도 학생이 고른 것과 우리가 행동에서 추론한 것은 신뢰도가 다르고,
   *   섞으면 개인화가 자기 추측을 학생의 말로 착각한다. */
  'preference.stated': 'explicit',
  /* c11 — 정서 자기보고(라디오 !슬럼프 · 나중에 앱 정의적 여과막이 같은 이름으로 합류).
   *   행동에서 읽어낸 것이 아니라 학생이 스스로 말한 상태라 explicit 이다 — inferred 로 두면
   *   「막혔다고 말했다」와 「막힌 것 같다」가 같은 값으로 쌓여 자기보고의 값어치가 사라진다. */
  'affect.reported': 'explicit',
  'data_use.granted': 'explicit',
  'data_use.revoked': 'explicit',

  // ── teacher: 앱 밖에서 사람이 넣는다(TOPIK 실성적 = 강사 입력 · L0 §3-2).
  'exam.result': 'teacher',

  /* ── inferred: **무엇을 줄지는 추정이다.** 배치가 고른 오늘의 문장은 관측이 아니라
   *   「이 학생에게 이게 맞겠다」는 판단이고, 그 판단이 틀렸을 때 성과가 안 오른 것을
   *   학생 탓으로 읽지 않으려면 이 두 행이 추정으로 남아 있어야 한다. */
  'intervention.delivered': 'inferred',
  'task.assigned': 'inferred',
};

/* 🔴 없는 사건에 기본값을 주지 않는다. `?? 'observed'` 로 접으면 계약에 사건을 늘린 사람이
 *   아무것도 안 해도 통과하고, 그 행들은 **틀린 값**을 들고 쌓인다 — 빈 칸(null)은 나중에
 *   「안 정했다」로 읽히지만 틀린 값은 영원히 사실로 읽힌다. */
const 사건출처 = (event_type) => 출처종류[event_type] ?? null;

module.exports = { 사건출처, 출처종류 };
