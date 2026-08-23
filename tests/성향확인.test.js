/* 성향 확인 회귀(Ⅲ⑥ · c13) — 판정·카드·사건 조립을 행동으로 못박는다.
 *   설계 다섯 요소(유호 확정 08-22): 새 사건 · 근거 든 문장 · 즉시 반응 · 부정 재노출 금지 · 하루 1회. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 판정판, 리듬후보, 확인카드, 확인사건 } = require('../lib/성향확인.js');
const { 확인문구, 반응안내, 카피확정 } = require('../contents/문구_성향확인.js');

test('카피 확정 표식 — 유호 확정 08-22 · 임시로 되돌아오면 카피가 낡은 것이다', () => {
  assert.equal(카피확정, true);
});
const { 검증 } = require('../lib/이벤트검증.js');

const 계약 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '계약', '수집_교정_계약.json'), 'utf8'));
const 리듬 = (덧 = {}) => ({ 제출률: 1, 마감여유분_중앙: 180, 지각: 0, n: 5, 여유n: 5, ...덧 });
const 이력 = (덧 = {}) => ({ 오늘답함: false, 부정키들: [], ...덧 });
const 키들 = { correlation_id: 'c0ffee00-0000-4000-8000-0000000000e6', idempotency_key: 'k-확인-1' };

test('리듬후보 — 방향(마감 전)·등식(빠짐없이)·복수 어의뿐, 품질 문턱이 없다', () => {
  assert.equal(리듬후보(리듬()), '여유제출', '중앙값이 마감 전(양수)이면 여유제출');
  assert.equal(리듬후보(리듬({ 마감여유분_중앙: -30, 여유n: 3 })), '반복제출', '마감 뒤라도 빠짐없이 냈으면 반복제출');
  assert.equal(리듬후보(리듬({ 마감여유분_중앙: null, 여유n: 0, 제출률: 0.8 })), null, '방향도 등식도 안 서면 지어내지 않는다');
  assert.equal(리듬후보(리듬({ 여유n: 1, 제출률: 0.5 })), null, '표본 하나로 「요즘 ~들」은 거짓이다(복수 어의)');
  assert.equal(리듬후보(null), null);
});

test('확인카드 — 하루 1회·부정 재노출 금지·문구 결속·판 합성(추정판+판정판)', () => {
  const 카드 = 확인카드(리듬(), 이력(), '2026-08-22T10:00:00Z', '학습자상태.v13');
  assert.ok(카드, '정상 재료에서 카드가 안 섰다');
  assert.equal(카드.trait_axis, '리듬');
  assert.equal(카드.shown_text, 확인문구[카드.shown_key].ko, '학생이 볼 문장이 카피 정본과 다르다');
  assert.equal(카드.estimator_version, `학습자상태.v13+${판정판}`,
    '판이 합성이 아니다 — 한쪽 판올림이 행에서 안 갈린다');
  assert.equal(카드.estimate_as_of, '2026-08-22T10:00:00Z');

  assert.equal(확인카드(리듬(), 이력({ 오늘답함: true }), 't', 'v'), null, '오늘 답했는데 또 물었다 — 하루 1회가 깨졌다');
  assert.equal(확인카드(리듬(), 이력({ 부정키들: ['리듬:여유제출'] }), 't', 'v')?.shown_key, '반복제출',
    '부정된 키는 건너뛰고 다음 후보로 — 「내 말을 안 듣네」를 만들지 않는다');
  assert.equal(확인카드(리듬({ 제출률: 0.9 }), 이력({ 부정키들: ['리듬:여유제출', '리듬:반복제출'] }), 't', 'v'), null,
    '남은 후보가 없으면 카드도 없다');
});

test('확인사건 — 카드 다섯 값 되싣기 · 값록(맞다|아니다) · 검증기 필수 6 실계약 통과', () => {
  const 카드 = 확인카드(리듬(), 이력(), '2026-08-22T10:00:00Z', '학습자상태.v13');
  for (const 답 of ['맞다', '아니다']) {
    const e = 확인사건(카드, 답, 키들);
    assert.ok(e, `${답} 사건이 안 섰다`);
    assert.equal(e.event_type, 'estimate.responded');
    assert.equal(e.payload.response, 답);
    assert.equal(e.payload.shown_text, 카드.shown_text, '되싣기가 아니라 지어내기다');
    const r = 검증(e, 계약);
    assert.equal(r.ok, true, `실계약 검증기가 거절했다: ${JSON.stringify(r.오류들 || r)}`);
    assert.ok(반응안내(답), '즉시 반응 문구가 없다 — 반영이 안 보이면 설문이 된다');
  }
  for (const 나쁨 of ['yes', '몰라요', null, '']) {
    assert.equal(확인사건(카드, 나쁨, 키들), null, `모르는 답 ${JSON.stringify(나쁨)} 이 사건이 됐다`);
  }
  assert.equal(확인사건(null, '맞다', 키들), null, '카드 없이 답만 있는 사건은 무엇의 긍정인지 모른다');
  assert.equal(확인사건({ ...카드, shown_text: '' }, '맞다', 키들), null, '반쪽 카드는 학습 재료가 못 된다');
});

/* G13 봉인(엔진심문 0822) — 부정 키 «형식»의 원천은 lib `부정키` 하나다. 서버 SQL 이 구분자를
 * 다시 적으면(옛 `|| ':' ||`) 새 축이 서는 날 두 형식이 갈리고, 갈린 쪽 증상은 «부정했는데
 * 재노출»이라 학생이 먼저 겪는다. 그래서 소스 층에서 못박는다: SQL 은 쌍만 내고 조립은 lib. */
test('부정 키 형식 — 한 원천(lib 부정키) · 서버 SQL 은 구분자를 다시 적지 않는다', () => {
  const { 부정키 } = require('../lib/성향확인.js');
  assert.equal(부정키('리듬', '여유제출'), '리듬:여유제출');
  /* «코드만»으로 읽는다(소스검사통로 래칫 · F401) — 원문이면 부정키() 호출이 코드에서 사라져도
   * 주석의 「부정키(」 언급 하나로 영원히 초록이고, 반대로 주석에 옛 `|| ':' ||` 를 인용만 해도
   * 멀쩡한 코드가 빨개진다. */
  const { 코드만 } = require('./lib/소스검사.js');
  const 소스 = 코드만(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'progress', 'index.ts'), 'utf8'));
  assert.ok(!/\|\|\s*':'\s*\|\|/.test(소스),
    'progress SQL 이 부정 키 구분자를 문자열로 다시 적었다 — 형식의 원천은 lib 부정키 하나다(G13)');
  assert.ok(/부정키\(/.test(소스), 'progress 가 lib 부정키() 로 조립하지 않는다 — 형식이 두 벌로 갈 위험');
});
