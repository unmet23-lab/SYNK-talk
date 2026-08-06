/* 이벤트 검증 — C0 §4-1 이 「payload 검증 스키마가 이벤트별로 정한다」고 위임한 그 자리.
 *
 * ■ 왜 여기가 정본인가
 *   C0 문서에 이벤트별 필수 표를 적으면 검증 로직과 **두 벌**이 되고, 갈라지는 방향은
 *   언제나 「통과」다. 그래서 C0 는 이름·값목록만 지고 **조합은 이 파일이 진다**.
 *
 * ■ 무엇을 여기 안 적는가
 *   필드 **이름**과 **값목록**(event_type·task_type·task_format)은 `계약/수집_교정_계약.json`
 *   이 정본이다. 여기 베껴 적으면 c7 개정 때 조용히 낡는다 — 읽어서 쓴다.
 *   `tests/이벤트검증.test.js` 가 「이 파일이 필수라 부른 이름이 계약에 실재하는가」를 검사한다.
 *
 * ■ 의존성 0
 *   zod 를 깔지 않았다. 검증이 요구하는 것은 「이벤트별 필수 집합의 정본과 그 강제」이고,
 *   그건 순수 함수로 선다. 앱 번들에도 얹을 수 있어 **보내기 전 자가검증**이 공짜다.
 */
'use strict';

/* 서버가 채우는 칸 — 앱이 보내면 거부한다.
 * 조용히 덮어쓰면 위조가 통과처럼 보인다(C0 §4-1). */
const 서버칸 = [
  'event_id', 'ingested_at', 'learner_id', 'consent_ver', 'schema_ver',
  'model', 'prompt_ver', 'intervention_id', 'degraded',
  'source_kind', 'estimator_confidence', 'estimator_version', 'evidence_refs',
];

/* 앱이 만들 수 없는 사건 — 서버·배치·운영 도구만 만든다.
 * 앱이 보내면 400: 학생 기기가 「AI가 무엇을 했다」거나 「훈련에 써도 된다」를 선언할 수 없다. */
const 서버사건 = [
  'intervention.delivered',   // 서버가 AI를 호출한다
  'task.assigned',            // 전날 밤 배치
  'data_use.granted',         // 훈련 승격 = 승인자·consent_id 를 요구하는 별개 절차
  'data_use.revoked',         // 철회 = 운영 도구
  'exam.result',              // TOPIK 실성적 = 강사 입력(앱 밖)
];

/* 모든 이벤트의 공통 필수(C0 §4-1 「앱이 반드시 채운다」). */
const 공통필수 = ['idempotency_key', 'event_type', 'occurred_at', 'level_snapshot'];

/* 이벤트별 추가 필수 — **이 파일이 정본이다.**
 * 값은 「점 표기 경로」이고, 배열은 「그중 최소 하나」를 뜻한다.
 * 🔴 **마지막 마디(필드 이름)는 계약에 실재하는 것만 쓴다.** 없는 이름을 필수로 걸면
 *   앱은 못 보내고 검증은 전건 거부해서, 「엄격해 보이는데 아무것도 안 통과하는」 상태가 된다.
 *   `tests/이벤트검증.test.js` 가 이 규칙을 기계로 강제한다(내가 이름을 지어내면 빨개진다). */
const 이벤트별필수 = {
  'submission.created': [
    'task_type',
    'submission.task_ref',
    'submission.task_format',
    ['submission.body_original', 'submission.audio_ref'], // 글이든 소리든 내용물은 있어야 한다
  ],
  'quiz.answered': ['task_type'],
  'choice.selected': [
    'payload.options_shown',      // 무엇을 보여줬나
    'payload.position',           // 어느 자리에 있었나 — 없으면 선호와 「밀어준 것」이 안 갈린다
    'payload.recommended_option', // 우리가 민 것
    ['payload.selected_option', 'payload.skipped', 'payload.rejected_all'], // 고름/무반응/전량거절
  ],
  // c8 이 대상을 가리킬 이름을 냈다(P0 §10-A-11 해소) — 어느 교정인지 없으면 「학습이
  // 일어났다」의 유일한 직접 신호가 학생 단위 집계로만 남고 교정 단위 판정이 불가능하다.
  'correction.responded': ['correction_id', 'payload.learner_response'],
  'correction.viewed': ['correction_id'],
  'preference.stated': [],   // 같은 이유
  'session.abandoned': [],   // 공통 필수만 — 「막혔다」는 신호 자체라 문턱을 두지 않는다
};

const 경로값 = (obj, 경로) => 경로.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const 있음 = (v) => v !== undefined && v !== null && v !== '';

/* 점 표기 경로가 **객체에 실재하는가.** 위조 판정은 값이 아니라 **존재**로 한다 —
 * `server: null` 도 「앱이 그 칸을 건드렸다」이고, 값으로 재면 그게 통과한다. */
const 경로있음 = (obj, 경로) => {
  const 칸 = 경로.split('.');
  const 마지막 = 칸.pop();
  const 부모 = 칸.reduce((o, k) => (o == null ? o : o[k]), obj);
  return !!부모 && typeof 부모 === 'object' && Object.prototype.hasOwnProperty.call(부모, 마지막);
};

/**
 * @param {object} 이벤트  C0 §4-1 요청의 events[] 원소 하나
 * @param {object} 계약    `계약/수집_교정_계약.json` 을 파싱한 객체
 * @param {object} [opt]   { 주체: 'app' | 'server' } — 기본 'app'
 * @returns {{ok: boolean, 오류들: string[]}}
 */
function 검증(이벤트, 계약, opt) {
  const 주체 = (opt && opt.주체) || 'app';
  const 오류들 = [];
  if (!이벤트 || typeof 이벤트 !== 'object') return { ok: false, 오류들: ['이벤트가 객체가 아니다'] };

  const 값목록 = (계약 && 계약.learning_events && 계약.learning_events.값목록) || {};
  const et = 이벤트.event_type;

  // ① event_type 이 계약 값목록 안인가 — 오타를 기본값으로 접지 않는다
  if (!있음(et)) 오류들.push('event_type 없음');
  else if (Array.isArray(값목록.event_type) && !값목록.event_type.includes(et)) {
    오류들.push(`event_type 값목록 밖: ${et}`);
  }

  // ② 앱이 서버 사건을 만들 수 없다
  if (주체 === 'app' && 서버사건.includes(et)) {
    오류들.push(`앱이 만들 수 없는 사건: ${et}`);
  }

  // ③ 앱이 서버 칸을 보낼 수 없다 — 위조 방지
  if (주체 === 'app') {
    for (const k of 서버칸) {
      if (Object.prototype.hasOwnProperty.call(이벤트, k)) 오류들.push(`서버가 채우는 칸을 앱이 보냈다: ${k}`);
    }
  }

  /* ③-b `capture_meta` 는 두 갈래다 — `app`(앱이 **요청한** 설정) / `server`(서버가 파일 헤더에서
   * **실제로 잰** 값). 🔴 `server` 는 앱이 보낼 수 없다. 보낼 수 있으면 「AGC 가 off 였다」를
   * 기기가 자기 입으로 선언하게 되고, 그 행은 **관측이 아니라 주장**이 된다 — 떨림·미세 발음이
   * 학생 특성인지 기기 처리 결과인지 가르려고 만든 칸이 정확히 그 능력을 잃는다.
   * 봉투 조립은 서버 몫이다(`functions/events`). 여기서는 **조용히 버리지 않고 알린다** —
   * 말없이 덮으면 앱은 보냈다고 믿고 우리는 안 받았고, 그 어긋남은 아무 데도 안 남는다. */
  if (주체 === 'app' && 경로있음(이벤트, 'submission.capture_meta.server')) {
    오류들.push('서버가 재는 칸을 앱이 보냈다: submission.capture_meta.server');
  }

  // ④ 공통 필수
  for (const k of 공통필수) if (!있음(이벤트[k])) 오류들.push(`필수 누락: ${k}`);

  // ⑤ 이벤트별 필수 — 배열은 「그중 최소 하나」
  for (const 요구 of 이벤트별필수[et] || []) {
    if (Array.isArray(요구)) {
      if (!요구.some((p) => 있음(경로값(이벤트, p)))) 오류들.push(`필수 누락(택1): ${요구.join(' | ')}`);
    } else if (!있음(경로값(이벤트, 요구))) {
      오류들.push(`필수 누락: ${요구}`);
    }
  }

  // ⑥ 값목록이 있는 칸은 그 안이어야 한다
  const 값검사 = [['task_type', 이벤트.task_type], ['task_format', 경로값(이벤트, 'submission.task_format')]];
  for (const [이름, v] of 값검사) {
    if (있음(v) && Array.isArray(값목록[이름]) && !값목록[이름].includes(v)) {
      오류들.push(`${이름} 값목록 밖: ${v}`);
    }
  }

  return { ok: 오류들.length === 0, 오류들 };
}

module.exports = { 검증, 공통필수, 이벤트별필수, 서버칸, 서버사건 };
