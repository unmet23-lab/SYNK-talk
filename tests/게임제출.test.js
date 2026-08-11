/* 게임제출 회귀 — G1 사건 조립기(`lib/게임제출.js` · 발주_게임모듈.md G1 §6 · §6-6 ⑨).
 *
 * ■ 급소 — **조립한 사건을 실계약 검증기에 실제로 태운다**
 *   이 발주의 초판은 「검증기 정본과 대조했다」고 4벌 적고 한 번도 태우지 않아 5건이
 *   반증됐다(§6-6 머리말). 그래서 여기의 통과 판정은 전부 `lib/이벤트검증.검증` +
 *   실계약 JSON(값목록 포함)을 **실행한 결과**다 — 서술 대조 0.
 *
 * ■ 세 맹점(CLAUDE.md)
 *   ① 사람이 쓰는 표기 — compose_meta 는 손픽스처가 아니라 `작성과정` 조립기를 실제로
 *      굴려 만든다(조립기가 칸 이름을 바꾸면 여기가 같이 빨개진다).
 *   ② 버그 존재를 요구하지 않는다 — 탐지력은 위반 픽스처(서버칸·목록 밖 값·반쪽 메타)가
 *      지고, 실조립 산출에는 거짓양성 0 만 본다.
 *   ③ 자기 처방 — 조립기가 null 로 거부한 재료를 사유대로 고치면 통과한다(⑤·⑥).
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
const { 계측시작, 타건, 계측payload, 칸들 } = require('../lib/작성과정.js');
const { 차원들 } = require('../lib/선택로그.js');

const fetch금지 = () => { throw new Error('게임제출은 fetch 를 부르지 않는다'); };
const 조립기경로 = path.join(ROOT, 'lib', '게임제출.js');
const 팩경로 = path.join(ROOT, 'contents', '교수멘탈문항.js');

/* 실팩(검수확정=false) 인스턴스 — fail-closed 게이트(H4)를 **현재 상태 그대로** 잰다. */
const 실판 = 세우기(조립기경로, fetch금지, { 캐시: new Map() });

/* 확정팩 픽스처 — 몽골어 검수가 확정된 날의 팩. 조립·전송 경로는 이 인스턴스로 잰다
 * (실팩으로는 게이트가 전부 null 을 내서 조립 경로가 한 줄도 안 돈다). */
const 팩원문 = fs.readFileSync(팩경로, 'utf8');
const 확정팩소스 = 팩원문.replace('export const 검수확정 = false;', 'export const 검수확정 = true;');
const 캐시 = new Map();
const 바꾼소스 = new Map([[팩경로, 확정팩소스]]);
const {
  게임과제인가, 게임재료, 사과전략, 오늘추천, 보기세우기,
  메일제출사건, 전략선택사건, 이탈사건, 스냅샷모양판,
} = 세우기(조립기경로, fetch금지, { 캐시, 바꾼소스 });
const { 스냅샷키들 } = 세우기(path.join(ROOT, 'lib', '게임스냅샷.js'), fetch금지, { 캐시, 바꾼소스 });

/* ── 공용 픽스처 — 서버 배정 항목의 모양(`GET /v1/tasks` data[0] 상당) ── */
const 항등 = (n) => Array.from({ length: n }, (_, i) => i);
const G1항목 = (덧 = {}) => ({
  task_ref: 'task-2026-08-11',
  task_snapshot: {
    challenge_id: 'g1-교수멘탈',
    prompt_seed: 'g1t01.s0d1',
    addressee_level: '합쇼체',
    지시문: 'x', 질문: 'x', 문항판: 'x', // 화면·조립은 이걸 안 믿고 팩을 다시 편다(§6-8 규칙 4)
  },
  level_snapshot: 'Lv2',
  goal_snapshot: '대학 진학',
  ...덧,
});

/** 실제 타이핑으로 만든 온전한 compose_meta — 손픽스처 금지(머리말 ①). */
function 실메타() {
  let s = 계측시작(0);
  s = 타건(s, '교수님께', 5000);
  s = 타건(s, '교수님', 6000);        // 지움 — 되돌림 1
  s = 타건(s, '교수님, 안녕하십니까', 8000);
  const m = 계측payload(s, 20000);
  assert.ok(m && 칸들.every((k) => Number.isInteger(m[k])), '픽스처가 한 벌이 아니다 — 조립기가 바뀌었다');
  return m;
}

const 메일사건 = (덧입력 = {}, 항목덧 = {}) => 메일제출사건(게임재료(G1항목(항목덧)), {
  본문: '교수님, 안녕하십니까. 갑자기 몸이 아파서 과제를 내지 못했습니다. 3일만 더 주시면 감사하겠습니다. 감사합니다.',
  correlation_id: 'c0ffee00-0000-4000-8000-000000000001',
  idempotency_key: 'c0ffee00-0000-4000-8000-000000000002',
  attempt_no: 1,
  ...덧입력,
});

/* ─────────────────── ⓪ 검수확정 게이트 — fail-closed (H4·H5) ─────────────────── */

test('🔴 검수확정=false(실팩)면 게임재료가 null — 미검수 판은 학생에게 안 열린다', () => {
  assert.notEqual(확정팩소스, 팩원문, '픽스처 치환이 실제로 일어났다 — 팩의 검수확정 줄이 바뀌었으면 이 치환도 따라가야 한다');
  const 항목 = G1항목();
  assert.equal(실판.게임과제인가(항목), true, '모듈 판정 자체는 참이어야 한다 — 게이트는 재료 층이다');
  assert.equal(실판.게임재료(항목), null,
    '미검수 판이 재료로 나왔다 — 배정 통로 게이트가 0줄인 지금, 이것을 막는 층은 여기 하나다');
  // 라우팅(H5)은 게임재료 !== null 로 가르므로, null = 조용한 말하기 폴백이다(화면 쪽 검사는 교수멘탈화면.test.js ⑨).
});

test('검수확정=true(확정팩)면 재료가 서고, 모양이 화면 픽스처와 한 벌이다', () => {
  const 재료 = 게임재료(G1항목());
  assert.ok(재료, '확정 팩인데도 재료가 null 이다 — 게이트가 팩 export 를 안 읽고 값을 박았다');
  /* 🔑 이 키 목록이 화면 테스트(교수멘탈화면.test.js)의 재료 픽스처 모양을 못박는다 —
   * 여기서 키가 바뀌면 그 픽스처도 같이 고쳐야 한다(사본이 갈라지는 자리를 회귀가 쥔다). */
  assert.deepEqual(Object.keys(재료).sort(),
    ['prompt_seed', '문항', 'task_ref', 'level_snapshot', 'goal_snapshot', 'retry_of_event_id'].sort());
});

/* ─────────────────── ① submission.created — 실계약 통과 ─────────────────── */

test('메일 제출 사건이 실계약 검증을 지난다 (compose_meta 동봉 판)', () => {
  const 사건 = 메일사건({ compose_meta: 실메타() });
  assert.ok(사건, '조립이 null 이다 — 재료 픽스처가 낡았다');
  const v = 검증(사건, 계약);
  assert.deepEqual(v.오류들, []);
  assert.equal(v.ok, true);
});

test('§6 표 모양 그대로 — 고정값·스냅샷 6키·서버칸 0·금지 키 0', () => {
  const 사건 = 메일사건({ compose_meta: 실메타() });
  assert.equal(사건.task_type, '숙제제출');
  assert.equal(사건.submission.task_format, '쓰기첨삭');
  assert.equal(사건.submission.task_schema_ver, 스냅샷모양판);
  assert.deepEqual(Object.keys(사건.submission).sort(),
    ['body_original', 'task_format', 'task_ref', 'task_schema_ver', 'task_snapshot'].sort(),
    'audio_ref·capture_meta·correction_id 는 키 자체가 없어야 한다(발주 G1 §6)');
  assert.deepEqual(Object.keys(사건.submission.task_snapshot).sort(), [...스냅샷키들].sort(),
    '스냅샷이 §6-8 6키 표 밖으로 나갔다(보기·정답 생성 금지)');
  for (const k of 서버칸) {
    assert.ok(!Object.prototype.hasOwnProperty.call(사건, k), `서버칸을 앱이 실었다: ${k}`);
  }
  assert.ok(!Object.prototype.hasOwnProperty.call(사건, 'correction_id'), 'correction_id 는 제출에 금지다(c8)');
  assert.deepEqual(Object.keys(사건.payload).sort(), ['attempt_no', 'compose_meta', 'ver'].sort());
  // 그때 화면이 알던 값 — 배정 행이 낸 것을 그대로 되싣는다
  assert.equal(사건.level_snapshot, 'Lv2');
  assert.equal(사건.goal_snapshot, '대학 진학');
});

test('compose_meta 를 못 쟀으면(null) 키가 아예 없다 — 0 으로 채우지 않는다', () => {
  const 사건 = 메일사건({ compose_meta: null });
  const v = 검증(사건, 계약);
  assert.equal(v.ok, true, v.오류들.join(' · '));
  assert.ok(!Object.prototype.hasOwnProperty.call(사건.payload, 'compose_meta'),
    '「안 쟀다」가 키로 실리면 「0회였다」와 같은 모양이 된다(§6-6 ⑨ 규칙 1)');
});

test('반쪽 compose_meta 는 조립기가 통째로 버린다 — 검증기는 원리상 못 막는 자리다(⑨ 실측)', () => {
  const { input_burst_max: _버림, ...세칸 } = 실메타();
  const 사건 = 메일사건({ compose_meta: 세칸 });
  assert.ok(!Object.prototype.hasOwnProperty.call(사건.payload, 'compose_meta'),
    '반쪽 객체가 실렸다 — 「측정 안 함」과 「0회」가 행에서 안 갈린다');
  /* 탐지력의 짝: 검증기가 반쪽을 통과시킨다는 ⑨ 실측이 지금도 참인지 — 참이어야 위
   * 조립기 규율이 유일한 막이라는 전제가 선다(거짓이 되면 이 회귀를 다시 판정한다). */
  const 위반 = 메일사건({ compose_meta: 실메타() });
  위반.payload.compose_meta = { total_compose_ms: 1 };
  assert.equal(검증(위반, 계약).ok, true, '검증기가 반쪽을 막기 시작했다 — ⑨ 전제가 뒤집혔다');
});

test('재제출 고리 — 배정이 retry_of_event_id 를 내면 싣고, 없으면 키가 없다', () => {
  const 첫 = 메일사건();
  assert.ok(!Object.prototype.hasOwnProperty.call(첫, 'retry_of_event_id'),
    '첫 제출에 null 을 박으면 「재시도 아님」과 「모른다」가 같은 모양이 된다');
  const 재 = 메일사건({}, { retry_of_event_id: 'E-원제출' });
  assert.equal(재.retry_of_event_id, 'E-원제출');
  assert.equal(검증(재, 계약).ok, true);
});

/* ─────────────────── ② 위반 픽스처 — 실제로 빨개지는가 ─────────────────── */

test('위반 픽스처가 실제로 거부된다 — 서버칸·목록 밖 값·내용물 없음', () => {
  const 온전 = 메일사건({ compose_meta: 실메타() });

  const 위조 = { ...온전, consent_ver: 'v1' };
  assert.equal(검증(위조, 계약).ok, false, '서버칸(consent_ver)을 실었는데 통과했다');

  const 목록밖 = { ...온전, submission: { ...온전.submission, task_format: '메일쓰기' } };
  const v2 = 검증(목록밖, 계약);
  assert.equal(v2.ok, false);
  assert.ok(v2.오류들.some((m) => m.includes('값목록 밖')), v2.오류들.join(' · '));

  const { body_original: _뺌, ...몸없음 } = 온전.submission;
  const v3 = 검증({ ...온전, submission: 몸없음 }, 계약);
  assert.equal(v3.ok, false, '내용물 없는 제출이 통과했다(택1 필수)');
});

test('조립기 자신도 지어내지 않는다 — 빈 본문·키 없음·못 펴는 시드는 null', () => {
  assert.equal(메일사건({ 본문: '   ' }), null, '빈 본문');
  assert.equal(메일사건({ correlation_id: null }), null, '앉음 키 없음 — 지어내면 가짜 앉음이다');
  assert.equal(메일사건({ idempotency_key: null }), null, '멱등키 없음');
  assert.equal(메일사건({ attempt_no: 0 }), null, 'attempt 는 1부터');
  const 깨진 = G1항목();
  깨진.task_snapshot = { ...깨진.task_snapshot, prompt_seed: 'g1t99.s0d0' };
  assert.equal(게임재료(깨진), null, '못 펴는 시드를 재료로 냈다');
});

/* ─────────────────── ③ choice.selected — 전략 3장 ─────────────────── */

test('사과 전략 3장 — 발주 G1 §4-4 문구 그대로 · id 유일 · 차원은 조립기 어휘', () => {
  /* vm 격리(앱모듈세우기)가 만든 배열은 다른 realm 이라 스프레드로 이쪽 realm 에 편다. */
  assert.deepEqual([...사과전략.보기들].map((o) => String(o.label)), [
    '사정을 솔직히 말한다',
    '짧게 사과하고 바로 부탁한다',
    '대신 할 수 있는 것을 제안한다',
  ]);
  const ids = 사과전략.보기들.map((o) => o.option_id);
  assert.equal(new Set(ids).size, 3);
  assert.equal(사과전략.차원, 차원들.사과전략, '차원이 `선택로그.차원들` 밖에서 났다');
});

test('오늘의 추천 — 시드에서 결정적이고, 3장 중 하나다', () => {
  const a = 오늘추천('g1t01.s0d1');
  assert.equal(a, 오늘추천('g1t01.s0d1'), '같은 시드가 다른 추천을 냈다 — 재현 불가');
  assert.ok(사과전략.보기들.some((o) => o.option_id === a));
  assert.equal(오늘추천(''), null, '시드 없이 추천을 지어냈다');
  // 배분이 한 장에 고정되지 않았는지 — 시드 45벌 중 최소 두 값이 나온다
  const 값들 = new Set(['g1t01.s0d0', 'g1t02.s1d2', 'g1t03.s2d0', 'g1t04.s0d2', 'g1t05.s1d1'].map(오늘추천));
  assert.ok(값들.size >= 2, '추천이 한 장에 고정됐다 — 자리 축과 마찬가지로 아무것도 못 가른다');
});

test('전략 선택 사건이 실계약 검증을 지난다 — 자리·추천·차원이 행에 남는다', () => {
  const 재료 = 게임재료(G1항목());
  const 보기 = 보기세우기(사과전략.보기들, 오늘추천(재료.prompt_seed), 항등);
  const 고른것 = 보기.options_shown[1].option_id;
  const 사건 = 전략선택사건(재료, {
    보기, 고른것, 시작: 100, 끝: 5400,
    correlation_id: 'c0ffee00-0000-4000-8000-000000000001',
    idempotency_key: 'c0ffee00-0000-4000-8000-000000000003',
  });
  assert.ok(사건, '조립이 null 이다');
  const v = 검증(사건, 계약);
  assert.deepEqual(v.오류들, []);
  assert.equal(사건.event_type, 'choice.selected');
  assert.equal(사건.payload.choice_dimension, 차원들.사과전략);
  assert.equal(사건.payload.position, 2, '자리는 1부터 — 섞인 표시 순서의 그 자리다');
  assert.equal(사건.payload.recommended_option, 오늘추천(재료.prompt_seed));
  assert.equal(사건.payload.latency_ms, 5300);
  assert.equal(사건.level_snapshot, 'Lv2');
});

test('전략 선택 — 계약을 못 지키는 재료는 안 나간다(보기 밖 고름·키 없음)', () => {
  const 재료 = 게임재료(G1항목());
  const 보기 = 보기세우기(사과전략.보기들, null, 항등);
  assert.equal(전략선택사건(재료, {
    보기, 고른것: '없는장', 시작: 0, 끝: 1,
    correlation_id: 'c', idempotency_key: 'k',
  }), null, '안 보여준 것을 골랐다고 적었다');
  assert.equal(전략선택사건(재료, { 보기, 고른것: 보기.options_shown[0].option_id, correlation_id: null, idempotency_key: 'k' }), null);
});

/* ─────────────────── ④ session.abandoned — 쓰다 나감 ─────────────────── */

test('이탈 사건이 실계약 검증을 지난다 — 어디서 막혔는지(형식)와 분모(task_ref)를 든다', () => {
  const 사건 = 이탈사건(게임재료(G1항목()), {
    correlation_id: 'c0ffee00-0000-4000-8000-000000000001',
    idempotency_key: 'c0ffee00-0000-4000-8000-000000000004',
  });
  assert.ok(사건);
  const v = 검증(사건, 계약);
  assert.deepEqual(v.오류들, []);
  assert.equal(사건.event_type, 'session.abandoned');
  assert.equal(사건.task_type, '숙제제출');
  assert.deepEqual(Object.keys(사건.submission).sort(), ['task_format', 'task_ref'].sort(),
    '이탈에 body_original 을 실으면 「낸 답이 없다」는 뜻이 깨진다');
  assert.equal(사건.submission.task_format, '쓰기첨삭');
});

/* ─────────────────── ⑤ 라우팅 판정 ─────────────────── */

test('게임과제인가 — challenge_id 로 가른다(모듈을 가르는 유일한 키 · §6-7 ⑥)', () => {
  assert.equal(게임과제인가(G1항목()), true);
  // 말하기 배정(호흡 스냅샷)은 게임이 아니다
  const { 오늘과제 } = require('../lib/오늘과제.js');
  const 말하기 = 오늘과제({ 날짜: '2026-08-11', 첫날: true });
  assert.equal(게임과제인가({ task_ref: 말하기.task_ref, task_snapshot: 말하기.task_snapshot }), false);
  assert.equal(게임과제인가(null), false);
  assert.equal(게임과제인가({ task_snapshot: { challenge_id: 'g2-보고서교정' } }), false, '남의 모듈을 G1 로 열었다');
});

test('결정성 — 같은 시드·같은 입력이면 스냅샷이 바이트까지 같다(배정↔제출 정합의 전제)', () => {
  const a = 메일사건({ compose_meta: null });
  const b = 메일사건({ compose_meta: null });
  assert.deepEqual(a.submission.task_snapshot, b.submission.task_snapshot);
});

/* 스냅샷 모양 판 결속 — 키 집합이 바뀌는 날 이 목록과 판이 **같이** 움직여야 한다.
 * (jsonb 라 DB·검증기가 안 본다 — §6-8 규칙 5 「표가 문서에만 있으면 신호가 없다」.) */
test('스냅샷 6키 ↔ 스냅샷모양판 v1 결속', () => {
  assert.deepEqual([...스냅샷키들].sort(),
    ['challenge_id', 'addressee_level', '문항판', '지시문', '질문', 'prompt_seed'].sort(),
    '키 집합이 바뀌었다 — 스냅샷모양판을 올리고 이 목록을 갱신하라');
  assert.equal(스냅샷모양판, 'g1스냅샷.v1');
});
