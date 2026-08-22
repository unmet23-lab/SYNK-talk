/* 서류관문제출 회귀 — G4 사건 조립기(`lib/서류관문제출.js` · 발주_게임모듈.md G4 §6-1·§6-2·§6-6).
 *
 * ■ 급소 — **조립한 사건을 실계약 검증기에 실제로 태운다**
 *   이 발주의 초판은 「검증기 정본과 대조했다」고 적고 한 번도 태우지 않아 5건이 반증됐다
 *   (§6-6 머리말). 통과 판정은 전부 `lib/이벤트검증.검증` + 실계약 JSON(값목록 포함)을
 *   **실행한 결과**다 — 서술 대조 0.
 *
 * ■ 세 맹점(CLAUDE.md 신뢰성)
 *   ① 사람이 쓰는 표기 — 턴·스냅샷은 손픽스처가 아니라 **실팩 + 실조립기**(`G4스냅샷`)를 굴려
 *      만든다. 팩이 문항을 고치면 여기가 같이 빨개진다.
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 **위반 픽스처**(빈 본문·교차 호출·
 *      키 없는 입력)가 지고, 실조립 산출에는 **거짓양성 0** 만 본다.
 *   ③ 자기 처방 — 조립기가 null 로 거부한 재료를 그 사유대로 고치면 통과한다.
 *
 * ■ 🔴 이 파일이 지키는 단 하나 — §6-6 ⑥ 「quiz.answered 는 산출물을 안 요구한다」
 *   빈칸에 친 문자열이 빠진 제출은 검증기를 **원리상 통과**하고 화면도 멀쩡하다. 남는 건
 *   「빈칸을 지났다」뿐이고 이 모듈의 존재 이유(강제 산출)가 통째로 사라지는데 아무 데서도
 *   안 빨개진다. 그 층은 조립기 하나고, 그게 실제로 막는지 재는 곳은 여기 하나다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { 세우기 } = require('./lib/앱모듈세우기.js');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const { 검증, 서버칸 } = require('../lib/이벤트검증.js');
const { 학습자상태 } = require('../lib/학습자상태.js');

const fetch금지 = () => { throw new Error('서류관문제출은 fetch 를 부르지 않는다'); };
const 조립기경로 = path.join(ROOT, 'lib', '서류관문제출.js');
const 팩경로 = path.join(ROOT, 'contents', '서류관문문항.js');

/* 실팩(검수확정=false) 인스턴스 — fail-closed 게이트를 **현재 상태 그대로** 잰다. */
const 실판 = 세우기(조립기경로, fetch금지, { 캐시: new Map() });

/* 확정팩 픽스처 — 몽골어 검수가 확정된 날의 팩. 조립 경로는 이 인스턴스로 잰다. */
const 팩원문 = fs.readFileSync(팩경로, 'utf8');
const 확정팩소스 = 팩원문.replace('const 검수확정 = false;', 'const 검수확정 = true;');
assert.notEqual(확정팩소스, 팩원문,
  '픽스처 치환이 실제로 일어났다 — 팩의 검수확정 선언 표기가 바뀌었으면 이 치환부터 고쳐라');

const 캐시 = new Map();
const 바꾼소스 = new Map([[팩경로, 확정팩소스]]);
const {
  게임과제인가, 게임재료, 관문재료, 빈칸제출사건, 모름제출사건, 변환제출사건,
  이탈사건, 이탈닻, 스냅샷모양판,
} = 세우기(조립기경로, fetch금지, { 캐시, 바꾼소스 });

/* 실팩에서 관문·턴을 «골라 온다» — 여기 리터럴을 박으면 팩이 관문을 갈아치운 날 회귀가 없는
 * 턴을 재게 되고, 증상은 「전부 null」이라 조립기 결함처럼 보인다. */
const 팩 = require(팩경로);
const 관문id = 팩.문항들[0].관문id;
const 편성 = 팩.관문편성(관문id);
assert.ok(편성 && 편성.length >= 2, '이 회귀는 빈칸+변환이 다 있는 관문을 요구한다');
const 앵커시드 = 편성[0]; // 첫 턴 = b1(빈칸)
const 변환시드 = 편성[편성.length - 1]; // 마지막 = t1(변환)

/* ── 공용 픽스처 — 서버 배정 항목의 모양(`GET /v1/tasks` data[0] 상당) ── */
const G4항목 = (시드, 덧 = {}, 스냅샷덧 = {}) => ({
  task_ref: 'task-2026-08-14',
  task_snapshot: {
    challenge_id: 'g4-서류관문',
    /* 🔑 턴을 되짚는 열쇠는 **스냅샷 안**이다(G1·G2 와 같은 칸) — 봉투 «밖» 칸은 통로 어디에도
     *   없어 `게임재료()` 가 영원히 null 이 된다(G2 3단계 실측 승계). */
    prompt_seed: 시드,
    /* 나머지는 화면·조립이 «안 믿고» 팩을 다시 펴는 값이다(§6-8 규칙 4) — 여기는 껍데기다. */
    지시문: 'x', 질문: 'x', 문항판: 'x',
    ...스냅샷덧,
  },
  level_snapshot: 'Lv3',
  goal_snapshot: '대학 진학',
  ...덧,
});

const 키들 = {
  correlation_id: 'c0ffee00-0000-4000-8000-000000000041',
  idempotency_key: 'c0ffee00-0000-4000-8000-000000000042',
};

const 재료of = (시드, 덧, 스냅샷덧) => 게임재료(G4항목(시드, 덧, 스냅샷덧));
const 턴들of = (덧) => 관문재료(재료of(앵커시드, 덧));
const 빈칸턴 = () => 턴들of()[0];
const 변환턴 = () => { const 벌 = 턴들of(); return 벌[벌.length - 1]; };

/** 검증기에 실제로 태운다 — 통과 판정의 유일한 근거(실계약 값목록 포함). */
function 태우기(사건, 무엇) {
  const r = 검증(사건, 계약);
  assert.equal(r.ok, true, `${무엇} 가 실계약 검증기에 거절됐다: ${JSON.stringify(r.오류들 || r)}`);
  return r;
}

/* ─────────────────── ⓪ 검수확정 게이트 — fail-closed (ⓕ) ─────────────────── */

test('🔴 검수확정=false(실팩)면 게임재료가 null — 미검수 판은 학생에게 안 열린다', () => {
  const 항목 = G4항목(앵커시드);
  assert.equal(실판.게임과제인가(항목), true, '모듈 판정 자체는 참이어야 한다 — 게이트는 재료 층이다');
  assert.equal(실판.게임재료(항목), null,
    '미검수 판이 재료로 나왔다 — 몽골어 검수가 이 게임의 게이트다(발주_게임콘텐츠팩 §3)');
});

test('🔴 관문재료도 실팩에서는 언제나 null — 게이트는 통로마다 다시 본다(fail-closed)', () => {
  assert.equal(실판.관문재료({ 앵커시드, task_ref: 'task-x' }), null,
    '미검수 판이 화면에 열렸다 — 재료를 우회해 관문재료만 부르는 화면이 그 구멍이다');
});

test('확정팩이면 재료가 서고, 키 규약은 G2 게임재료와 같다(앵커시드가 문항id 자리)', () => {
  const 재료 = 재료of(앵커시드);
  assert.ok(재료, '확정 팩인데도 재료가 null 이다 — 게이트가 팩 export 를 안 읽고 값을 박았다');
  assert.deepEqual(Object.keys(재료).sort(),
    ['앵커시드', '스냅샷', 'task_ref', 'level_snapshot', 'goal_snapshot', 'retry_of_event_id'].sort());
  assert.equal(재료.앵커시드, 앵커시드);
  assert.ok('빈칸' in 재료.스냅샷, '앵커(첫 턴)는 빈칸 턴이다 — 배정 행이 싣는 그 스냅샷');
  assert.equal(재료of(앵커시드, {}, { prompt_seed: '' }), null, '열쇠가 없으면 재료를 만들지 않는다');
  assert.equal(재료of('g4t99.b1'), null, '못 펴는 시드 — 지어내지 않는다');
  assert.equal(게임재료({ ...G4항목(앵커시드), task_ref: null }), null, '큐와 못 잇는 제출은 만들지 않는다');
});

test('라우팅은 G4 만 연다 — 넓은 쪽(등록된 게임 전부)을 쓰면 남의 배정이 이 화면에 열린다', () => {
  assert.equal(게임과제인가(G4항목(앵커시드)), true);
  assert.equal(게임과제인가({ task_snapshot: { challenge_id: 'g1-교수멘탈' } }), false);
  assert.equal(게임과제인가({ task_snapshot: { challenge_id: 'g2-보고서교정' } }), false);
  assert.equal(게임과제인가({ task_snapshot: null }), false);
  assert.equal(게임과제인가(null), false);
});

/* ─────────────────── ⓖ 관문재료 — 편성 순서 그대로 ─────────────────── */

test('ⓖ 관문재료 — 앵커 하나에서 전 턴이 «편성 순서 그대로» 펴진다', () => {
  const 벌 = 턴들of();
  assert.ok(Array.isArray(벌), '관문재료가 안 섰다');
  /* ⚠ 문자열로 견준다 — 조립기는 vm 격리(`앱모듈세우기`) 안이라 배열 prototype 이 다른 realm
   * 것이고 `deepStrictEqual` 이 값이 같아도 운다(G2 회귀 실측 그대로). */
  assert.equal(벌.map((b) => b.스냅샷.prompt_seed).join(','), [...편성].join(','),
    '화면이 볼 순서가 편성과 갈렸다 — 행에 적힌 턴과 학생이 본 턴이 달라진다');
  for (const 하나 of 벌) {
    assert.equal(하나.앵커시드, 앵커시드, '앵커시드는 턴마다 안 바뀐다 — 그 이름의 뜻이 「관문의 앵커」다');
    assert.equal(하나.task_ref, 재료of(앵커시드).task_ref, '배정은 하나다 — 전 턴이 같은 행을 가리킨다');
    assert.equal(하나.level_snapshot, 'Lv3');
  }
  const 마지막 = 벌[벌.length - 1];
  assert.equal('빈칸' in 마지막.스냅샷, false, '변환 턴 행에는 빈칸 키가 없다(§6-8 규칙 1)');
  assert.equal('채점기판본' in 마지막.스냅샷, false, '변환 턴 행에는 채점기판본 키가 없다');
  assert.ok('빈칸' in 벌[0].스냅샷 && typeof 벌[0].스냅샷.채점기판본 === 'string',
    '빈칸 턴 행에는 그 턴의 채점 근거(빈칸·채점기판본)가 있다(§6-2 ⓑ 재계산 담보)');
});

test('ⓔ 관문재료 — `retry_of_event_id` 는 **앵커 턴만** 진다', () => {
  const 벌 = 턴들of({ retry_of_event_id: 'E-원본' });
  assert.ok(벌, '재제출 앵커에서 관문이 안 섰다');
  for (const 하나 of 벌) {
    const 기대 = 하나.스냅샷.prompt_seed === 앵커시드 ? 'E-원본' : null;
    assert.equal(하나.retry_of_event_id, 기대,
      '남의 사건의 재제출로 적히면 설계 전체에서 유일한 결과 변수가 거짓이 된다');
  }
});

test('관문재료 — 못 펴는 앵커·재료 아님은 null(반쪽 관문을 내지 않는다)', () => {
  assert.equal(관문재료(null), null);
  assert.equal(관문재료({ 앵커시드: 'g4t99.b1', task_ref: 'task-x' }), null, '모르는 관문');
  assert.equal(관문재료({ 앵커시드: '', task_ref: 'task-x' }), null);
});

/* ─────────────────── ① 빈칸 갈래 — quiz.answered (ⓐ·ⓑ·ⓓ) ─────────────────── */

const 빈칸입력 = (덧 = {}) => ({ 본문: '에서', attempt_no: 1, ...키들, ...덧 });

test('ⓐ 빈칸 제출이 실계약 검증기를 지난다 (거짓양성 0)', () => {
  const 턴 = 빈칸턴();
  const e = 빈칸제출사건(턴, 빈칸입력());
  assert.ok(e, '조립기가 정상 재료를 거부했다');
  assert.equal(e.event_type, 'quiz.answered');
  assert.equal(e.task_type, '퀴즈응답');
  assert.equal(e.submission.task_format, '응답');
  assert.equal(e.submission.task_schema_ver, 스냅샷모양판);
  assert.equal(e.submission.body_original, '에서', '그 빈칸에 친 문자열 «원문»이다(§6-2 ⓑ)');
  assert.equal(e.submission.task_snapshot, 턴.스냅샷,
    '행에 남는 스냅샷은 화면이 그린 그 턴의 것 하나다(§6-8 규칙 4 — 사본 금지)');
  태우기(e, '빈칸 제출');
});

test('ⓐ-2 확신도(Ⅲ⑦ · 유호 확정 08-22) — 표기했을 때만 싣고, 모르는 값·무표기는 키 자체가 없다', () => {
  const 턴 = 빈칸턴();
  for (const 값 of ['low', 'guess']) {
    const e = 빈칸제출사건(턴, 빈칸입력({ 확신도: 값 }));
    assert.equal(e.payload.confidence, 값, `${값} 표기가 payload 에 안 실렸다`);
    태우기(e, `확신도 ${값} 제출`);   // 실계약 검증기 통과가 유일한 근거
  }
  for (const 빈 of [null, undefined, '', 'high', '확실']) {
    const e = 빈칸제출사건(턴, 빈칸입력({ 확신도: 빈 }));
    assert.ok(!('confidence' in e.payload),
      `확신도 ${JSON.stringify(빈)} 인데 키가 실렸다 — 안 물린 표기는 안 싣는다(라디오 규율)`);
  }
});

test('🔴 ⓑ 본문이 비면 사건 자체가 null — §6-6 ⑥ 구멍은 이 조립기가 진다', () => {
  /* 검증기는 quiz.answered 에 산출물을 안 요구한다(`이벤트별필수` = task_type 하나) — 그 구멍의
   * 실재부터 못박는다: 본문 없는 봉투를 손으로 지으면 검증기는 «통과»시킨다. 그래서 막는
   * 층은 조립기 하나고, 이 두 단정이 그 비대칭을 함께 잰다. */
  const 턴 = 빈칸턴();
  const 구멍증명 = { ...빈칸제출사건(턴, 빈칸입력()) };
  delete 구멍증명.submission;
  구멍증명.submission = { task_ref: 턴.task_ref, task_format: '응답', task_snapshot: 턴.스냅샷, task_schema_ver: 스냅샷모양판 };
  assert.equal(검증(구멍증명, 계약).ok, true,
    '⑥ 구멍이 닫혔다면(검증기가 산출물을 요구하게 됐다면) 이 회귀와 조립기 주석을 함께 고쳐라');
  assert.equal(빈칸제출사건(턴, 빈칸입력({ 본문: '' })), null, '빈 본문이 사건으로 나갔다');
  assert.equal(빈칸제출사건(턴, 빈칸입력({ 본문: '   ' })), null, '공백 본문이 사건으로 나갔다');
  assert.equal(빈칸제출사건(턴, 빈칸입력({ 본문: null })), null);
});

test('🔴 ⓓ 변환 턴에 빈칸제출사건을 부르면 null — 교차 호출 차단(열린 산출이 퀴즈 통로로 새면 검수 큐가 영영 못 본다)', () => {
  assert.equal(빈칸제출사건(변환턴(), 빈칸입력()), null);
  assert.equal(모름제출사건(변환턴(), { attempt_no: 1, ...키들 }), null,
    '변환 턴에는 「모르겠어요」 버튼이 없다 — 있으면 강제 산출이 아니다');
});

/* ─────────────────── ② 모름 갈래 — quiz.answered + skipped (ⓒ) ─────────────────── */

test('ⓒ 「모르겠어요」는 body_original 키 자체가 없다 — 산출물이 없다는 것이 뜻이다', () => {
  const 턴 = 빈칸턴();
  const e = 모름제출사건(턴, { attempt_no: 1, ...키들 });
  assert.ok(e, '조립기가 정상 모름을 거부했다');
  assert.equal(e.event_type, 'quiz.answered');
  assert.equal(e.task_type, '퀴즈응답');
  assert.equal(e.payload.skipped, true);
  assert.equal('body_original' in e.submission, false,
    '빈 문자열로 채우면 「비웠다」와 「빈 답을 냈다」가 같은 모양이 된다');
  assert.equal('audio_ref' in e.submission, false);
  /* 분모 재료 — 어느 턴에 대한 모름인지 없으면 모름넘김률의 분모를 못 만든다. */
  assert.equal(e.submission.task_snapshot, 턴.스냅샷);
  태우기(e, '모름');
});

test('빈칸 제출에는 skipped 키가 없다 — 「냈다」와 「비우고 넘겼다」는 다른 사실이다', () => {
  const e = 빈칸제출사건(빈칸턴(), 빈칸입력());
  assert.equal('skipped' in e.payload, false);
});

/* ─────────────────── ③ 변환 갈래 — submission.created ─────────────────── */

const { 계측시작, 타건, 계측payload } = require('../lib/작성과정.js');
function 실compose_meta() {
  let s = 계측시작(0);
  s = 타건(s, '직원분께 드릴 말', 4000);
  s = 타건(s, '직원분께', 5000);
  s = 타건(s, '직원분께 서류를 드리러 왔습니다', 7000);
  return 계측payload(s, 30000);
}

test('변환 제출이 실계약 검증기를 지난다 — task_format 은 팩이 정본이다', () => {
  const 턴 = 변환턴();
  const e = 변환제출사건(턴, { 본문: '다음 주에 비자 연장을 하러 가려고 합니다.', attempt_no: 1, ...키들 });
  assert.ok(e, '조립기가 정상 재료를 거부했다');
  assert.equal(e.event_type, 'submission.created');
  assert.equal(e.task_type, '숙제제출');
  assert.equal(e.submission.task_format, 팩.펴기(변환시드).형식,
    'task_format 이 팩 문항의 형식과 갈렸다 — 값 사본이 리터럴로 남았다');
  assert.equal(e.submission.body_original, '다음 주에 비자 연장을 하러 가려고 합니다.');
  assert.equal(e.submission.task_schema_ver, 스냅샷모양판);
  태우기(e, '변환 제출');
});

test('🔴 빈칸 턴에 변환제출사건을 부르면 null — 닫힌 채점 근거가 검수 큐로 새면 검수 용량 사고다', () => {
  assert.equal(변환제출사건(빈칸턴(), { 본문: 'x 입니다.', attempt_no: 1, ...키들 }), null);
});

test('compose_meta 는 한 벌 아니면 키가 없다 — `작성과정.칸들` 규약 그대로(§6-6 ⑨)', () => {
  const 턴 = 변환턴();
  const 온전 = 실compose_meta();
  assert.ok(온전, '작성과정 픽스처가 한 벌을 못 냈다');
  const 실은것 = 변환제출사건(턴, { 본문: 'x 입니다.', attempt_no: 1, compose_meta: 온전, ...키들 });
  assert.deepEqual({ ...실은것.payload.compose_meta }, { ...온전 });
  태우기(실은것, 'compose_meta 실은 변환 제출');
  const 반쪽 = 변환제출사건(턴, { 본문: 'x 입니다.', attempt_no: 1, compose_meta: { total_compose_ms: 9 }, ...키들 });
  assert.equal('compose_meta' in 반쪽.payload, false,
    '반쪽 객체가 실렸다 — 「측정 안 함」과 「0회」가 행에서 안 갈린다');
  assert.equal(변환제출사건(턴, { 본문: '  ', attempt_no: 1, ...키들 }), null, '내용물 없는 제출은 제출이 아니다');
});

/* ─────────────────── ④ 공통 규율 — 지연·키·서버칸·이탈 ─────────────────── */

test('못 잰 값은 안 싣는다 — latency_ms 는 «있을 때만» 키가 선다(반올림 포함)', () => {
  const 없는것 = 빈칸제출사건(빈칸턴(), 빈칸입력());
  assert.equal('latency_ms' in 없는것.payload, false, '못 잰 체류를 0 으로 적으면 「즉시 답했다」가 된다');
  const 있는것 = 빈칸제출사건(빈칸턴(), 빈칸입력({ latency_ms: 4100.6 }));
  assert.equal(있는것.payload.latency_ms, 4101);
  태우기(있는것, '체류를 실은 빈칸 제출');
  assert.equal('latency_ms' in 모름제출사건(빈칸턴(), { attempt_no: 1, ...키들 }).payload, false);
});

test('retry_of_event_id 는 «있을 때만» 봉투에 실린다 — 앵커 턴의 재제출만 진다', () => {
  const 벌 = 턴들of({ retry_of_event_id: 'E-원본' });
  const 앵커사건 = 빈칸제출사건(벌[0], 빈칸입력());
  assert.equal(앵커사건.retry_of_event_id, 'E-원본');
  태우기(앵커사건, '재제출 앵커 턴');
  const 둘째사건 = 빈칸제출사건(벌[1], 빈칸입력());
  assert.equal('retry_of_event_id' in 둘째사건, false,
    'null 을 박으면 「재제출 아님」과 「모른다」가 섞인다 — 키 자체가 없어야 한다');
});

test('correlation_id·idempotency_key 가 없으면 어느 갈래도 안 선다', () => {
  const 턴 = 빈칸턴();
  assert.equal(빈칸제출사건(턴, { 본문: '에서', attempt_no: 1 }), null);
  assert.equal(모름제출사건(턴, { attempt_no: 1 }), null);
  assert.equal(변환제출사건(변환턴(), { 본문: 'x 입니다.', attempt_no: 1 }), null);
  assert.equal(이탈사건(재료of(앵커시드), {}), null);
});

test('🚫 서버칸·confidence·is_correct 는 어느 갈래에도 없다', () => {
  const 사건들 = [
    빈칸제출사건(빈칸턴(), 빈칸입력()),
    모름제출사건(빈칸턴(), { attempt_no: 1, ...키들 }),
    변환제출사건(변환턴(), { 본문: 'x 입니다.', attempt_no: 1, ...키들 }),
    이탈사건(재료of(앵커시드), 키들),
  ];
  for (const e of 사건들) {
    for (const 칸 of 서버칸) assert.equal(칸 in e, false, `앱이 서버칸 ${칸} 을 채웠다 (${e.event_type})`);
    for (const k of ['confidence', 'is_correct']) {
      assert.equal(k in e.payload, false,
        `payload 에 ${k} 가 실렸다 — 묻지 않은 것·파생을 적으면 그 축이 거짓이 된다(${e.event_type})`);
    }
  }
});

test('이탈은 문턱 없이 서고, 낸 답을 싣지 않는다 — 어디서 막혔나는 열린 산출 통로 이름이다', () => {
  const e = 이탈사건(재료of(앵커시드), 키들);
  assert.ok(e);
  assert.equal(e.event_type, 'session.abandoned');
  assert.equal(e.task_type, '숙제제출', 'G2 이탈 선례 — 판정 없이 나간 것이라 산출 갈래 쪽이다');
  assert.equal(e.submission.task_format, '높임전환');
  assert.equal('body_original' in e.submission, false, '낸 답이 없다는 것이 이 사건의 뜻이다');
  태우기(e, '이탈');
});

test('이탈닻 — 죽은 앉음 수거(H2)가 요구하는 세 칸 그대로다(G1 과 같은 모양)', () => {
  const 재료 = 재료of(앵커시드);
  /* ⚠ 스프레드로 이쪽 realm 객체를 만들어 견준다 — vm 격리 산출은 prototype 이 달라
   * deepStrictEqual 이 값이 같아도 운다(앉음재료 회귀 실측 그대로). */
  assert.deepEqual({ ...이탈닻(재료) },
    { task_ref: 재료.task_ref, level_snapshot: 'Lv3', goal_snapshot: '대학 진학' });
  assert.equal(이탈닻(null), null);
  assert.equal(이탈닻({ task_ref: '' }), null);
});

test('한 관문의 사건들이 같은 correlation_id 를 지고 나간다 — 멱등키는 사건마다 다르다', () => {
  const 벌 = 턴들of();
  const 사건들 = 벌.map((턴, i) => {
    const 입력 = { attempt_no: 1, correlation_id: 키들.correlation_id, idempotency_key: `k-${i}` };
    return '빈칸' in 턴.스냅샷
      ? 빈칸제출사건(턴, { 본문: '에서', ...입력 })
      : 변환제출사건(턴, { 본문: '서류를 드리러 왔습니다.', ...입력 });
  });
  assert.equal(사건들.length, 편성.length);
  for (const e of 사건들) {
    assert.ok(e, '한 관문의 사건 하나가 조립되지 않았다');
    assert.equal(e.correlation_id, 키들.correlation_id);
    태우기(e, `관문 사건 ${e.event_type}`);
  }
  assert.equal(new Set(사건들.map((e) => e.idempotency_key)).size, 편성.length);
});

/* ─────────── ⑤ 사슬 — 실생산자 산출이 강제산출축(학습자상태 v9)에 닿는다 ─────────── */

test('🔴 실생산자 산출이 강제산출축에 닿는다 — 모였는데 안 닿았다를 여기서 죽인다', () => {
  const 벌 = 턴들of();
  let 일련 = 0;
  const 저장행 = (e) => ({ ...e, event_id: `ev-${(일련 += 1)}` }); // 서버가 id 를 박은 «뒤»의 모양
  const 사건들 = [
    저장행(빈칸제출사건(벌[0], 빈칸입력({ latency_ms: 3000, occurred_at: '2026-08-13T01:00:00Z' }))),
    저장행(모름제출사건(벌[1], { attempt_no: 1, occurred_at: '2026-08-13T01:01:00Z', ...키들 })),
    저장행(빈칸제출사건(벌[0], 빈칸입력({ attempt_no: 2, latency_ms: 5000, occurred_at: '2026-08-13T01:02:00Z' }))),
    저장행(변환제출사건(벌[벌.length - 1], { 본문: '서류를 드리러 왔습니다.', attempt_no: 1, occurred_at: '2026-08-13T01:03:00Z', ...키들 })),
  ];
  for (const e of 사건들) assert.ok(e, '픽스처 사건 하나가 조립되지 않았다');
  const { 축 } = 학습자상태(사건들, { as_of: '2026-08-13T12:00:00Z' });
  assert.ok(축.강제산출, '🔴 강제산출축이 null 이다 — 행은 쌓이는데 엔진이 못 본다');
  assert.equal(축.강제산출.n, 4, '분모는 「그날 지난 턴 수」다 — 갈래별로 나누면 비율이 1 에 붙는다');
  assert.equal(축.강제산출.모름넘김률, 0.25);
  assert.equal(축.강제산출.재도전률, 0.25);
  assert.equal(축.강제산출.빈칸체류_중앙, 4000, '잰 두 행(3000·5000)의 중앙값 — 못 잰 행은 분모 밖이다');
});
