/* 보고서교정제출 회귀 — G2 사건 조립기(`lib/보고서교정제출.js` · 발주_게임모듈.md G2 §6-1·§6-3·§9-②).
 *
 * ■ 급소 — **조립한 사건을 실계약 검증기에 실제로 태운다**
 *   이 발주의 초판은 「검증기 정본과 대조했다」고 4벌 적고 한 번도 태우지 않아 5건이 반증됐다
 *   (§6-6 머리말). 그래서 여기의 통과 판정은 전부 `lib/이벤트검증.검증` + 실계약 JSON(값목록
 *   포함)을 **실행한 결과**다 — 서술 대조 0.
 *
 * ■ 세 맹점(CLAUDE.md 신뢰성)
 *   ① 사람이 쓰는 표기 — 보기·문항은 손픽스처가 아니라 **실팩 + 실조립기**(`G2스냅샷`)를 굴려
 *      만든다. 팩이 문장을 고치면 여기가 같이 빨개진다(사본이 갈라지는 자리를 회귀가 쥔다).
 *   ② 버그 존재를 요구하지 않는다 — 탐지력은 **위반 픽스처**(지목 뺀 payload·목록 밖 id·
 *      두 갈래 동시)가 지고, 실조립 산출에는 **거짓양성 0** 만 본다.
 *   ③ 자기 처방 — 조립기가 null 로 거부한 재료를 그 사유대로 고치면 통과한다(⑤).
 *
 * ■ 🔴 이 파일이 지키는 단 하나 — §9-② 「지목이 빠져도 증상이 없다」
 *   `selected_option`·`position`·`options_shown` 이 빠진 제출은 **정상 저장되고 화면도 멀쩡하다.**
 *   남는 건 「고친 문장」뿐이고 이 모듈의 존재 이유가 통째로 사라지는데 아무 데서도 안 빨개진다.
 *   검증기 자가검증으로도 안 잡힌다(선택 필드라 `이벤트별필수` 에 없다). 그 층은 조립기 하나고,
 *   그게 실제로 막는지 재는 곳은 여기 하나다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { 세우기 } = require('./lib/앱모듈세우기.js');

const ROOT = path.resolve(__dirname, '..');
const { 검증, 서버칸 } = require('../lib/이벤트검증.js');

const fetch금지 = () => { throw new Error('보고서교정제출은 fetch 를 부르지 않는다'); };
const 조립기경로 = path.join(ROOT, 'lib', '보고서교정제출.js');
const 팩경로 = path.join(ROOT, 'contents', '보고서교정문항.js');

/* 실팩(검수확정=false) 인스턴스 — fail-closed 게이트를 **현재 상태 그대로** 잰다. */
const 실판 = 세우기(조립기경로, fetch금지, { 캐시: new Map() });

/* 확정팩 픽스처 — 몽골어 검수가 확정된 날의 팩. 조립 경로는 이 인스턴스로 잰다
 * (실팩으로는 게이트가 전부 null 을 내서 조립 경로가 한 줄도 안 돈다). */
const 팩원문 = fs.readFileSync(팩경로, 'utf8');
const 확정팩소스 = 팩원문.replace('const 검수확정 = false;', 'const 검수확정 = true;');
assert.notEqual(확정팩소스, 팩원문,
  '픽스처 치환이 실제로 일어났다 — 팩의 검수확정 선언 표기가 바뀌었으면 이 치환부터 고쳐라');

const 캐시 = new Map();
const 바꾼소스 = new Map([[팩경로, 확정팩소스]]);
const {
  게임과제인가, 게임재료, 짚음제출사건, 무산출사건, 이탈사건, 스냅샷모양판,
} = 세우기(조립기경로, fetch금지, { 캐시, 바꾼소스 });

/* 실팩에서 오류 문항·대조 문항 id 를 «골라 온다» — 여기 리터럴을 박으면 팩이 문항을 갈아치운
 * 날 회귀가 없는 문항을 재게 되고, 증상은 「전부 null」이라 조립기 결함처럼 보인다. */
const 팩 = require(팩경로);
const 오류문항 = 팩.문항목록().filter((id) => !팩.대조문항인가(id));
const 대조문항 = 팩.문항목록().filter((id) => 팩.대조문항인가(id));
assert.ok(오류문항.length > 0 && 대조문항.length > 0, '팩에 두 갈래가 다 있어야 이 회귀가 선다');
const 오류id = 오류문항[0];
const 대조id = 대조문항[0];

/* ── 공용 픽스처 — 서버 배정 항목의 모양(`GET /v1/tasks` data[0] 상당) ── */
const G2항목 = (문항id, 덧 = {}) => ({
  task_ref: `task-2026-08-12-${문항id}`,
  prompt_seed: 문항id,
  task_snapshot: {
    challenge_id: 'g2-보고서교정',
    /* 화면·조립은 이 값을 «안 믿고» 팩을 다시 편다(§6-8 규칙 4) — 그래서 여기는 껍데기다. */
    지시문: 'x', 질문: 'x', 문항판: 'x', 보기: [],
  },
  level_snapshot: 'Lv2',
  goal_snapshot: '대학 진학',
  ...덧,
});

const 키들 = {
  correlation_id: 'c0ffee00-0000-4000-8000-000000000011',
  idempotency_key: 'c0ffee00-0000-4000-8000-000000000012',
};

const 재료of = (문항id, 항목덧) => 게임재료(G2항목(문항id, 항목덧));

/** 그 문항의 실제 정답 자리 — 팩·조립기가 낸 값이지 손으로 적은 값이 아니다. */
const 정답자리 = (재료) => 재료.스냅샷.정답.오류자리;

const 짚음 = (덧입력 = {}, 문항id = 오류id) => {
  const 재료 = 재료of(문항id);
  return 짚음제출사건(재료, {
    교정문: '회의 시간이 오후 세 시로 정해졌습니다.',
    고른것: 재료.스냅샷.보기[0].option_id,
    attempt_no: 1,
    ...키들,
    ...덧입력,
  });
};

/** 검증기에 실제로 태운다 — 통과 판정의 유일한 근거. */
function 태우기(사건, 무엇) {
  const r = 검증(사건);
  assert.equal(r.ok, true, `${무엇} 가 실계약 검증기에 거절됐다: ${JSON.stringify(r.오류들 || r)}`);
  return r;
}

/* ─────────────────── ⓪ 검수확정 게이트 — fail-closed ─────────────────── */

test('🔴 검수확정=false(실팩)면 게임재료가 null — 미검수 판은 학생에게 안 열린다', () => {
  const 항목 = G2항목(오류id);
  assert.equal(실판.게임과제인가(항목), true, '모듈 판정 자체는 참이어야 한다 — 게이트는 재료 층이다');
  assert.equal(실판.게임재료(항목), null,
    '미검수 판이 재료로 나왔다 — 배정 통로 게이트가 0줄인 지금, 이것을 막는 층은 여기 하나다');
});

test('확정팩이면 재료가 서고, 문항을 되짚는 열쇠는 봉투 «밖»에서 온다', () => {
  const 재료 = 재료of(오류id);
  assert.ok(재료, '확정 팩인데도 재료가 null 이다 — 게이트가 팩 export 를 안 읽고 값을 박았다');
  assert.deepEqual(Object.keys(재료).sort(),
    ['문항id', '스냅샷', '보기', 'task_ref', 'level_snapshot', 'goal_snapshot', 'retry_of_event_id'].sort());
  /* 🔴 열쇠는 `항목.prompt_seed` 다 — G2 스냅샷 표(§6-8)에는 문항 id 키가 없다(G1 과 갈리는
   *   자리). 스냅샷 «안»에서 찾으려 들면 영원히 null 이고 증상은 「화면이 안 열린다」뿐이다. */
  assert.equal(재료of(오류id, { prompt_seed: '' }), null, '열쇠가 없으면 재료를 만들지 않는다');
  assert.equal(재료of(오류id, { prompt_seed: '없는문항' }), null, '못 펴는 문항 — 지어내지 않는다');
});

test('라우팅은 G2 만 연다 — 넓은 쪽(등록된 게임 전부)을 쓰면 G1 배정이 G2 화면에 열린다', () => {
  assert.equal(게임과제인가(G2항목(오류id)), true);
  assert.equal(게임과제인가({ task_snapshot: { challenge_id: 'g1-교수멘탈' } }), false,
    'G1 배정이 G2 라우팅을 통과했다 — 문항 팩이 달라 화면이 빈 채로 뜬다');
  assert.equal(게임과제인가({ task_snapshot: null }), false);
  assert.equal(게임과제인가(null), false);
});

/* ─────────────────── ① 짚음 갈래 — submission.created ─────────────────── */

test('짚음 제출이 실계약 검증기를 지난다 (거짓양성 0)', () => {
  const e = 짚음();
  assert.ok(e, '조립기가 정상 재료를 거부했다');
  assert.equal(e.event_type, 'submission.created');
  assert.equal(e.task_type, '숙제제출');
  assert.equal(e.submission.task_format, '쓰기첨삭');
  assert.equal(e.submission.task_schema_ver, 스냅샷모양판);
  태우기(e, '짚음 제출');
});

test('🔴 body_original 은 «문장 전문»이고, 스냅샷은 팩 조립기가 낸 그 판이다', () => {
  const 재료 = 재료of(오류id);
  const e = 짚음제출사건(재료, {
    교정문: '회의 시간이 오후 세 시로 정해졌습니다.',
    고른것: 정답자리(재료), attempt_no: 1, ...키들,
  });
  assert.equal(e.submission.body_original, '회의 시간이 오후 세 시로 정해졌습니다.');
  /* 배정↔제출이 **같은 조립**을 지나야 challenge_id·문항 식별이 한 모양이 된다(§6-8 규칙 4). */
  assert.deepEqual(e.submission.task_snapshot, 재료.스냅샷);
  assert.ok(e.submission.task_snapshot.정답, '오류 문항 행에는 정답이 남는다(§5 B — 재계산 재료)');
  태우기(e, '정답 자리를 짚은 제출');
});

test('내용물 없는 제출은 제출이 아니다 — 빈 교정문은 null', () => {
  assert.equal(짚음({ 교정문: '   ' }), null);
  assert.equal(짚음({ 교정문: null }), null);
});

/* ─────────────────── ② 무산출 갈래 — quiz.answered ─────────────────── */

test('🔴 「고칠 곳 없음」은 quiz.answered 다 — submission.created 로 보내면 전건 400 이다', () => {
  const 재료 = 재료of(대조id);
  const e = 무산출사건(재료, { 전량거절: true, 건너뜀: false, attempt_no: 1, ...키들 });
  assert.ok(e);
  assert.equal(e.event_type, 'quiz.answered');
  assert.equal(e.task_type, '퀴즈응답');
  assert.equal(e.payload.rejected_all, true);
  assert.equal(e.payload.skipped, false);
  /* 🚫 산출물 칸을 만들지 않는다 — 낸 것이 없다는 것이 이 사건의 뜻이다. 우회로 원문장을
   *   넣으면 우리가 심은 문장이 학습자 코퍼스에 학생 산출물로 섞인다(§9-①). */
  assert.equal('body_original' in e.submission, false);
  assert.equal('audio_ref' in e.submission, false);
  태우기(e, '고칠 곳 없음');
});

test('🔴 건너뜀은 전량거절과 «다른 사건»이다 (c4 판정 — 합치면 엔진이 같은 신호로 배운다)', () => {
  const 재료 = 재료of(오류id);
  const e = 무산출사건(재료, { 전량거절: false, 건너뜀: true, attempt_no: 1, ...키들 });
  assert.ok(e);
  assert.equal(e.payload.rejected_all, false);
  assert.equal(e.payload.skipped, true);
  태우기(e, '건너뜀');
});

test('대조 문항 스냅샷에는 정답 키가 «없다» — 반쪽 객체 하나가 과잉 교정률의 분모를 오염시킨다', () => {
  const 재료 = 재료of(대조id);
  assert.equal('정답' in 재료.스냅샷, false, '§6-8 규칙 1 — 없는 값의 키는 아예 만들지 않는다');
});

/* ─────────── ③ §9-② 자체 가드 — 탐지력은 «위반 픽스처»가 진다 ─────────── */

test('🔴 목록 밖 자리를 짚었다고 적으면 사건을 «안 낸다» — 큐는 거절을 조용히 격리한다', () => {
  assert.equal(짚음({ 고른것: 'w9999' }), null,
    '보기에 없는 id 가 통과했다 — 검증기 ⑦이 잡기 전에 여기서 접어야 신호가 안 사라진다');
});

test('🔴 보기(분모)가 비면 지목이 아니다 — options_shown 없는 제출은 안 낸다', () => {
  const 재료 = 재료of(오류id);
  const 빈보기재료 = { ...재료, 보기: [] };
  assert.equal(짚음제출사건(빈보기재료, {
    교정문: 'x 입니다.', 고른것: 'w1', attempt_no: 1, ...키들,
  }), null, '분모 없는 지목이 통과했다 — 「이 자리를 짚었다」의 분모가 사라진다(§6-2)');
});

test('🔴 세 뜻(짚음·고칠곳없음·무반응) 중 «정확히 하나»가 아니면 안 낸다', () => {
  const 재료 = 재료of(오류id);
  const 무 = (덧) => 무산출사건(재료, { attempt_no: 1, ...키들, ...덧 });
  assert.equal(무({ 전량거절: true, 건너뜀: true }), null, '둘 다 참 — 뜻이 섞였다');
  assert.equal(무({ 전량거절: false, 건너뜀: false }), null, '둘 다 거짓 — 아무 사실도 안 말한다');
  assert.ok(무({ 전량거절: true, 건너뜀: false }), '자기 처방(맹점 ③) — 하나만 켜면 통과한다');
});

test('🔴 position 은 호출자에게서 받지 않고 options_shown 에서 «파생»한다 (검증기 ⑦)', () => {
  const 재료 = 재료of(오류id);
  const 셋째 = 재료.스냅샷.보기[2];
  assert.ok(셋째, '이 회귀는 어절 3개 이상인 문항을 요구한다');
  const e = 짚음제출사건(재료, {
    교정문: '고친 문장입니다.', 고른것: 셋째.option_id, attempt_no: 1,
    /* 호출자가 «틀린» 자리를 밀어 넣어도 조립기는 자기 파생을 쓴다 — 두 벌이 갈리면 그 행은
     * 오류가 아니라 «다른 자리에서 골랐다»로 읽히고, 소비자는 범위 안의 거짓말을 못 가려낸다. */
    position: 99,
    ...키들,
  });
  assert.equal(e.payload.position, 3, '1부터 세고(L0 §140) 목록의 그 자리와 일치해야 한다');
  assert.equal(e.payload.options_shown[e.payload.position - 1].option_id, e.payload.selected_option);
  태우기(e, '셋째 어절을 짚은 제출');
});

test('🔴 안 짚었으면 position 키를 «만들지 않는다» — 0·-1 은 「첫째를 골랐다」로 읽힌다', () => {
  const e = 무산출사건(재료of(대조id), { 전량거절: true, 건너뜀: false, attempt_no: 1, ...키들 });
  assert.equal('position' in e.payload, false);
  assert.equal('selected_option' in e.payload, false);
  태우기(e, '자리 없는 무산출');
});

test('못 잰 값은 안 싣는다 — latency_ms·selection_reason 은 «있을 때만» 키가 선다', () => {
  const 없는것 = 짚음();
  assert.equal('latency_ms' in 없는것.payload, false, '못 잰 지연을 0 으로 적으면 「즉시 알아챘다」가 된다');
  assert.equal('selection_reason' in 없는것.payload, false, '안 물었으면 빈칸이지 0 이 아니다');
  const 있는것 = 짚음({ latency_ms: 3100.4, 사유: '조사:주격(이/가·은/는)' });
  assert.equal(있는것.payload.latency_ms, 3100);
  assert.equal(있는것.payload.selection_reason, '조사:주격(이/가·은/는)');
  태우기(있는것, '지연·사유를 실은 제출');
});

/* ─────────────────── ④ 안 싣는 것 — 금지 필드·서버칸 ─────────────────── */

test('🚫 recommended_option·confidence·is_correct·changed_selection 은 어느 갈래에도 없다', () => {
  const 금지 = ['recommended_option', 'confidence', 'is_correct', 'changed_selection'];
  for (const [이름, e] of [
    ['짚음', 짚음({ latency_ms: 100, 사유: '조사:주격(이/가·은/는)' })],
    ['무산출', 무산출사건(재료of(대조id), { 전량거절: true, 건너뜀: false, attempt_no: 1, ...키들 })],
  ]) {
    for (const k of 금지) {
      assert.equal(k in e.payload, false,
        `${이름} payload 에 ${k} 가 실렸다 — 밀어주지 않은 것을 밀었다고 적으면 그 축이 «거짓»이 된다`);
    }
  }
});

test('🚫 서버칸은 앱이 채우지 않는다 — 전 갈래 전수', () => {
  const 사건들 = [
    짚음(),
    무산출사건(재료of(대조id), { 전량거절: true, 건너뜀: false, attempt_no: 1, ...키들 }),
    이탈사건(재료of(오류id), 키들),
  ];
  for (const e of 사건들) {
    for (const 칸 of 서버칸) {
      assert.equal(칸 in e, false, `앱이 서버칸 ${칸} 을 채웠다 (${e.event_type})`);
    }
  }
});

/* ─────────────────── ⑤ 이탈 ─────────────────── */

test('이탈은 문턱 없이 서고, 낸 답을 싣지 않는다', () => {
  const e = 이탈사건(재료of(오류id), 키들);
  assert.ok(e);
  assert.equal(e.event_type, 'session.abandoned');
  assert.equal('body_original' in e.submission, false, '낸 답이 없다는 것이 이 사건의 뜻이다');
  태우기(e, '이탈');
});

/* ─────────────────── ⑥ 앉음 키 — 호출자가 진다 ─────────────────── */

test('correlation_id·idempotency_key 가 없으면 어느 갈래도 안 선다', () => {
  const 재료 = 재료of(오류id);
  assert.equal(짚음제출사건(재료, { 교정문: 'x 입니다.', 고른것: 재료.스냅샷.보기[0].option_id, attempt_no: 1 }), null);
  assert.equal(무산출사건(재료, { 전량거절: true, 건너뜀: false, attempt_no: 1 }), null);
  assert.equal(이탈사건(재료, {}), null);
});

test('한 앉음(3문항)이 같은 correlation_id 를 지고 나간다 — 그 사실은 그 순간에만 안다', () => {
  const 사건들 = [오류문항[0], 오류문항[1], 대조id].map((id, i) => {
    const 재료 = 재료of(id);
    const 입력 = { attempt_no: 1, correlation_id: 키들.correlation_id, idempotency_key: `key-${i}` };
    return 팩.대조문항인가(id)
      ? 무산출사건(재료, { 전량거절: true, 건너뜀: false, ...입력 })
      : 짚음제출사건(재료, { 교정문: '고친 문장입니다.', 고른것: 정답자리(재료), ...입력 });
  });
  assert.equal(사건들.length, 3);
  for (const e of 사건들) {
    assert.ok(e, '한 앉음의 사건 하나가 조립되지 않았다');
    assert.equal(e.correlation_id, 키들.correlation_id);
    태우기(e, `앉음 사건 ${e.event_type}`);
  }
  assert.equal(new Set(사건들.map((e) => e.idempotency_key)).size, 3, '멱등키는 사건마다 달라야 한다');
});
