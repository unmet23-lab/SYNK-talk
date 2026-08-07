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

/* 모든 이벤트의 공통 필수(C0 §4-1 「앱이 반드시 채운다」).
 * 🔴 `correlation_id` = 한 앉음을 묶는 키(P0 §3-1 ④). 앱은 이미 채우는데(a9362e4) 계약이
 *   선택으로 둔 탓에 **구 큐나 다음 소비자가 생략하면 한 앉음이 다시 흩어진다** — 낭독과
 *   자유발화가 「같이 낸 쌍」이었다는 사실은 그때만 알 수 있고, 나중에 시각 정렬로 못 되짚는다
 *   (C0 §4-1 「기기 시계는 못 믿는다」). 소급 불가라 운영 첫 제출 전에 건다
 *   (`docs/_ops/심문_P0_소급불가_절단.md` ①-10). */
const 공통필수 = ['idempotency_key', 'event_type', 'occurred_at', 'level_snapshot', 'correlation_id'];

/* 그중 **값이 `null` 이어도 통과**하는 칸 — 키는 여전히 필수다(C0 §4-3 ① ⓑ · 유호님 확정 2026-08-07).
 * 🔴 「모른다」와 「앱이 빠뜨렸다」를 갈라 받는다. 급수 없는 학생(개원 첫 주 = 반 배정 전)의 화면은
 *   급수를 알 길이 없고, §4-1 이 `level_snapshot` 을 요구한 이유가 「그때 화면이 알던 값을 그때
 *   적는 것이 유일하게 정확하다」이므로 **아무것도 몰랐으면 `null` 이 유일하게 정확한 값**이다.
 *   막으면 그 학생은 등록하고도 첫 발화를 못 올리고 §4-5 「첫 발화 기준선」을 소급 불가로 잃는다.
 * 🚫 이 이름을 `공통필수` 에서 빼는 것은 ⓑ 가 아니다 — 그러면 앱 결손(키 누락)이 「모른다」로
 *   위장돼 들어오고, 증상은 몇 주 뒤 급수 없는 행이 설명 없이 쌓이는 것뿐이다. */
const 널허용 = new Set(['level_snapshot']);

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
    /* 🔴 그때 학생이 **본 판**. `task_ref` 는 가리키기만 하고 그 문항은 개정된다 — 스냅샷이
     *   없으면 「무엇을 보고 답했는가」가 영구히 사라진다(c4 가 두 칸을 가른 이유 · L0 §3-3 이
     *   `task_snapshot` 을 최대 소급 불가로 못박고 불변 트리거까지 건 자리).
     * 🚫 서버가 배정 행에서 베껴 채우지 않는다 — 그건 「앱이 배정대로 그렸다」는 **추정**이고,
     *   추정을 관측 칸에 넣는 것이 절단문서 ①-7 이 지적한 바로 그 오염이다. */
    'submission.task_snapshot',
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
  'preference.stated': [],
  /* 「막혔다」는 신호 자체라 **내용물 문턱은 두지 않는다.** 그래도 **어디서** 막혔는지는 있어야
   * 한다(절단문서 ①-6): 낭독 시작 전 이탈과 자유발화 중 포기는 끈기·난이도 모델에서 정반대
   * 신호인데 지금은 같은 행이라 사후에 못 가른다. `task_format` 은 계약이 **바로 그 구분을
   * 위해** 만든 칸이다(c5 — 「한 칸에 담으면 낭독 데이터로 회화 모델을 학습시키는 사고가
   * 조용히 성립한다」). 🚫 새 이름을 짓지 않았다: 지으면 c9 이고, c9 를 기다리는 동안 쌓이는
   * 무발화 행은 영영 안 갈린다.
   * 🔑 `submission` 밑인 이유 = `task_format` 의 물리 자리가 `engine.submissions` 뿐이다
   *   (`learning_events` 엔 그 열이 없다). 그래서 무발화도 **내용물 없는 제출물 행**을 남긴다 —
   *   「이 형식의 과제를 받고 아무것도 안 냈다」가 그 행의 뜻이다. 하류 5곳(progress·tasks·
   *   deliver 둘·corrections)은 전부 `event_type` 으로 거르므로 제출 수는 안 흔들린다(실측). */
  'session.abandoned': ['task_type', 'submission.task_format'],
};

/* 「추가 필수 0」의 두 뜻 — **정해서 안 거는 것**과 **아직 안 정한 것**이 같은 `[]` 로 보인다.
 * 그게 ①-6 이 「빈 껍데기」로 지목한 자리의 진짜 형태다: `session.abandoned` 는 결론이었고
 * `preference.stated` 는 미정이었는데, 코드 주석은 둘을 「같은 이유」로 묶어 놨었다.
 * 그래서 빈 목록은 **여기 사유가 있어야 하고**, 없으면 `tests/이벤트검증.test.js` 가 빨개진다
 * (반대도 검사한다 — 사유만 남고 목록이 채워지면 낡은 줄이다). 선택필드 장부와 같은 규칙. */
const 문턱없음 = {
  'preference.stated': '생산자가 0이고 payload 규격을 낸 정본이 아직 없다 — L0 §116 은 이름만 두고 `발주_게임모듈.md` §593 은 「안 쓴다」로 못박았다. 여기서 이름을 지어 걸면 앱은 못 보내는데 검증만 전건 거부한다(이 파일 머리말의 「지어내기 금지」). 첫 생산자가 서는 판에서 그 화면과 함께 정한다.',
};

/* 반대방향 장부 — 「계약에 이름은 있는데 **아무 사건도 요구하지 않는** 필드」와 그 사유.
 *
 * ■ 왜 필요한가
 *   위 `이벤트별필수` 는 「필수로 건 이름이 계약에 있는가」만 막는다(정방향). 그 짝인 반대쪽 —
 *   계약이 이름을 냈는데 아무도 안 요구하는 상태 — 은 아무 데서도 안 빨개졌고, 그게 절단문서
 *   ①-3(`task_snapshot`)·①-10(`correlation_id`)·①-13(`skill_ids`)이 **셋 다 같은 모양으로**
 *   비어 있던 이유다. 이름이 있으면 채워질 것 같은데, 아무도 안 요구하면 영원히 안 온다.
 *
 * ■ 규칙
 *   계약의 모든 필드는 ① 어느 사건이 요구하거나 ② `서버칸`이거나 ③ 여기 사유와 함께 있어야 한다.
 *   셋 다 아니면 `tests/이벤트검증.test.js` 가 빨개진다 — 계약에 필드를 늘리는 사람이
 *   「누가 이걸 채우나」를 **그 자리에서** 정하게 만드는 것이 이 장부의 전부다.
 *   🔴 사유는 「나중에」가 아니라 **지금 안 요구하는 이유**를 적는다. 미구현이면 미구현이라 쓴다 —
 *      그래야 이 목록이 남은 구멍의 지도가 된다. */
const 선택필드 = {
  goal_snapshot: '배정 행이 낸다. 목표 미설정·급수 미배정이 개원 첫 주의 정상 상태라 필수로 걸면 그 학생이 첫 발화를 못 올린다.',
  skill_ids: '배정·게임이 채우는 채점 축. 축 없는 과업(자유발화 첫 주)은 빈 배열이 정답이다. 값이 있을 때의 실재·판본 대조는 `functions/events` 가 진다(절단문서 ①-13).',
  skill_taxonomy_ver: '`skill_ids` 가 비면 가리킬 판본이 없다. 같이 있어야 한다는 판정은 서버가 진다(위와 같은 자리).',
  retry_of_event_id: '재제출일 때만 있는 고리. 첫 제출에 걸면 전건 거부가 된다.',
  parent_event_id: '대화 턴이 응답한 선행 턴. 단발 사건에는 가리킬 앞이 없다.',
  turn_no: '한 대화 안의 서수. 대화가 아닌 사건에는 뜻이 없다.',
  transcript: '기계(STT) 전사 — `engine.submissions` 의 칸이고 앱이 아니라 후처리가 채운다.',
  transcript_verified: '사람이 들린 대로 되돌린 전사 — 검수 단계 산출물이라 제출 시점에 존재하지 않는다.',
  corrected_text: '`engine.corrections` 의 칸 — 교정 엔진·검수자가 만든다. 학습 사건 봉투가 아니다.',
  error_tags: '위와 같은 `corrections` 칸. 제출 시점에는 아직 라벨이 없다.',
  capture_meta: '음성일 때만. 글 제출·선택 사건에는 잴 것이 없다(`.server` 는 `서버칸` 이 따로 막는다).',
  confidence: '학생이 스스로 매긴 확신도 — 화면이 물었을 때만 있다(질문 총량 상한 · §9).',
  attempt_no: '제출 계열 payload 의 시도 서수. 대화·선택 사건에는 시도 개념이 없다.',
  changed_selection: '고른 뒤 바꿨는가 — 안 바꾼 것이 정상이라 없음이 곧 값이다.',
  latency_ms: '선택까지 걸린 시간. 화면이 못 재는 통로(운영 도구 입력)도 같은 사건을 쓴다.',
  selection_reason: '왜 골랐나 — 물었을 때만 채운다. 안 물었으면 빈칸이지 0이 아니다.',
  cited_refs: '`intervention.delivered` 는 서버사건이라 앱이 못 만든다. 배달하는 쪽이 채운다.',
  output_text: '위와 같음 — AI가 실제로 한 말은 배달 시점에 서버만 안다.',
  valid_from: '추정 프로필의 유효 시작. 🔴 물리 저장이 아직 없다(절단문서 ①-7 — DDL·INSERT 0건).',
  expires_at: '위와 같은 추정 프로필 칸 — 미구현(①-7).',
  user_confirmed: '추정을 학생이 확인했는가 — 위와 같은 미구현 묶음(①-7).',
};

const 경로값 = (obj, 경로) => 경로.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const 있음 = (v) => v !== undefined && v !== null && v !== '';

/* 선택지 보기 배열 → `option_id` 목록. 모양이 계약과 다르면 `null`(절단문서 ①-8).
 * C0 §156(c6): **선택지는 `{option_id, label}` 로 싣는다** — `option_id` 는 안 바뀌는 조인 키고
 * `label` 은 그때 표시된 문구의 **스냅샷**이다. 문구만 문자열로 남기면 문구를 개정하는 날
 * 판을 가로지르는 집계가 끊기고, 그 전에 쌓인 행은 어느 선택지였는지 되짚을 길이 없다.
 * 🔴 id 중복도 모양 위반이다 — 조인 키가 겹치면 「무엇을 골랐나」가 두 곳을 가리킨다. */
function 보기id들(보기) {
  if (!Array.isArray(보기) || !보기.length) return null;
  const ids = 보기.map((o) => (
    o && typeof o === 'object' && 있음(o.option_id) && 있음(o.label) ? String(o.option_id) : null
  ));
  if (ids.some((v) => v === null) || new Set(ids).size !== ids.length) return null;
  return ids;
}

/* `널허용` 칸의 판정 — 키가 실재하고 값이 **`null` 이거나 실값**인가.
 * 🔴 `undefined` 는 통과시키지 않는다: JSON 왕복에서 그 키는 **사라지므로** 앱 자가검증만
 *   통과하고 서버는 400 을 낸다. 같은 정본을 쓰는데 판정이 갈리는 것이 가장 나쁜 결과다.
 * 🔴 빈 문자열도 아니다 — 「모른다」는 `null` **하나**로만 적는다. 두 모양을 다 받으면 나중에
 *   급수 없는 행을 셀 때 어느 쪽이 「모른다」인지 매번 다시 정하게 된다. */
const 널이거나있음 = (obj, k) =>
  Object.prototype.hasOwnProperty.call(obj, k) && (obj[k] === null || 있음(obj[k]));

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

  // ④ 공통 필수 — `널허용` 칸은 **키 존재**로, 나머지는 **값**으로 잰다(위 `널허용` 주석).
  for (const k of 공통필수) {
    const 없다 = 널허용.has(k) ? !널이거나있음(이벤트, k) : !있음(이벤트[k]);
    if (없다) 오류들.push(`필수 누락: ${k}`);
  }

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

  /* ⑦ 선택지는 **문구가 아니라 불변 id** 로 잇는다(C0 §156 · c6 · 절단문서 ①-8).
   * 🔴 **사건이 아니라 필드 이름으로 건다.** `이벤트별필수` 는 `choice.selected` 에만 걸리는데,
   *   G2(`발주_게임모듈.md` §362)는 같은 선택로그 필드를 **`submission.created` payload** 로
   *   보낸다 — 「정답을 밀어주지 않아 `recommended_option` 에 넣을 정직한 값이 없다」가 그
   *   판정의 이유였다. 이벤트별로 걸면 그 통로가 통째로 새고, 새는 방향은 언제나 통과다.
   * 🔑 검사는 **값이 있을 때만** 돈다 — 안 묻는 화면은 이 칸을 아예 안 싣는다(선택필드 장부). */
  const p = 이벤트.payload;
  if (p && typeof p === 'object') {
    const 가리킴 = ['selected_option', 'recommended_option'].filter((k) => 있음(p[k]));
    if (있음(p.options_shown) || 가리킴.length) {
      const ids = 보기id들(p.options_shown);
      if (!ids) {
        오류들.push('options_shown 은 {option_id, label} 의 배열이어야 한다 — 문구 문자열·중복 id·누락 금지(C0 §156)');
      } else {
        for (const k of 가리킴) {
          if (!ids.includes(String(p[k]))) 오류들.push(`${k} 가 options_shown 의 option_id 가 아니다: ${p[k]}`);
        }
      }
    }
  }

  return { ok: 오류들.length === 0, 오류들 };
}

module.exports = { 검증, 공통필수, 널허용, 이벤트별필수, 문턱없음, 선택필드, 서버칸, 서버사건 };
