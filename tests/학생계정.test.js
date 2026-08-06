'use strict';
/**
 * 학생 계정 회귀 (L0 §4-1·§4-1-1).
 *
 * 이 파일이 지키는 것은 **첫 로그인 게이트**다 — 여기가 새면 남의 계정을 선점당한다.
 * 그래서 「통과해야 하는 것」보다 **「절대 통과하면 안 되는 것」**을 먼저·두껍게 검사한다.
 */

const test = require('node:test');
const assert = require('node:assert');
const { 학생번호맞나, 이메일, 뒤4자리, 뒷자리맞나, 시도상한 } = require('../lib/학생계정.js');

// ── 학생번호 형식 ────────────────────────────────────────────
test('학생번호: 발급기가 내는 형태를 받는다(표기형·정규형·소문자 모두)', () => {
  for (const v of ['SYNK-042', 'SYNK042', 'synk-042', ' synk 042 ', 'SYNK-001', 'SYNK-1000']) {
    assert.ok(학생번호맞나(v), `${JSON.stringify(v)} 를 막았다`);
  }
});

test('학생번호: 자릿수를 접지 않는다 — SYNK-42 는 발급된 적이 없다', () => {
  /* 접으면 SYNK-42 와 SYNK-042 가 한 계정을 가리켜 두 학생이 겹친다. */
  assert.equal(학생번호맞나('SYNK-42'), false);
  assert.equal(학생번호맞나('SYNK-4'), false);
});

test('학생번호: 규격 밖은 전부 막는다', () => {
  for (const v of ['', '   ', '042', 'SYNK-', 'SYNK-abc', 'SL-0042', 'SYNK-042-1', null, undefined, 42]) {
    assert.equal(학생번호맞나(v), false, `${JSON.stringify(v)} 를 통과시켰다`);
  }
});

// ── 합성 이메일 ──────────────────────────────────────────────
test('이메일: 소문자 합성 주소 — Supabase 가 이메일을 소문자로 저장한다', () => {
  assert.equal(이메일('SYNK-042'), 'synk042@synk.invalid');
  assert.equal(이메일('synk-042'), 'synk042@synk.invalid', '표기 차이가 다른 계정이 되면 안 된다');
  assert.equal(이메일('SYNK042'), 'synk042@synk.invalid');
});

test('이메일: 서로 다른 학생번호는 서로 다른 주소다', () => {
  assert.notEqual(이메일('SYNK-042'), 이메일('SYNK-043'));
  assert.notEqual(이메일('SYNK-042'), 이메일('SYNK-0042'));
});

test('이메일: 규격 밖은 조용히 넘기지 않고 던진다', () => {
  /* 조용히 통과하면 엉뚱한 계정을 가리킨 채 「로그인이 안 된다」로만 보인다. */
  for (const v of ['SYNK-42', '', 'abc', null]) {
    assert.throws(() => 이메일(v), /학생번호 형식/, `${JSON.stringify(v)} 를 던지지 않았다`);
  }
});

// ── 전화 뒷자리 ──────────────────────────────────────────────
test('뒤4자리: 국가번호·공백·하이픈이 섞여도 같은 값이 나온다', () => {
  for (const v of ['+976 9911-2233', '976-9911-2233', '99112233', '9911 2233']) {
    assert.equal(뒤4자리(v), '2233', `${v} 에서 뒷자리를 못 뽑았다`);
  }
});

test('뒤4자리: 숫자가 4개 미만이면 null — 「대조 불가」지 「빈 값 통과」가 아니다', () => {
  for (const v of ['', '   ', '123', '+', '-()', null, undefined]) {
    assert.equal(뒤4자리(v), null, `${JSON.stringify(v)} 에서 값이 나왔다`);
  }
});

// ── 게이트 (여기가 새면 계정을 뺏긴다) ────────────────────────
test('게이트: 뒷자리가 맞으면 통과', () => {
  assert.equal(뒷자리맞나('+976 9911-2233', '2233'), true);
  assert.equal(뒷자리맞나('+976 9911-2233', '99112233'), true, '전체 번호를 넣어도 뒤 4자리로 본다');
});

test('🔴 게이트: 명단 연락처가 비었으면 무엇을 넣어도 막힌다', () => {
  /* 이게 뚫리면 contact 가 빈 학생은 아무나 가져간다 — 이 파일에서 가장 중요한 줄. */
  for (const 입력 of ['', '0000', '2233', null]) {
    assert.equal(뒷자리맞나('', 입력), false, `빈 연락처인데 ${JSON.stringify(입력)} 가 통과했다`);
    assert.equal(뒷자리맞나(null, 입력), false);
    assert.equal(뒷자리맞나('123', 입력), false, '숫자 4개 미만인 연락처가 통과했다');
  }
});

test('🔴 게이트: 빈 입력은 통과하지 않는다', () => {
  for (const v of ['', '   ', null, undefined, '233']) {
    assert.equal(뒷자리맞나('+976 9911-2233', v), false, `${JSON.stringify(v)} 가 통과했다`);
  }
});

test('게이트: 다른 뒷자리는 막는다', () => {
  assert.equal(뒷자리맞나('+976 9911-2233', '2234'), false);
  assert.equal(뒷자리맞나('+976 9911-2233', '9911'), false, '앞자리를 뒷자리로 인정하면 안 된다');
});

test('시도상한이 계약값과 같다 — 없으면 1만 번 대입으로 뚫린다', () => {
  assert.equal(시도상한, 5);
});
