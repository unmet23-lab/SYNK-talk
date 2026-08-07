'use strict';
/**
 * 학생 계정 회귀 (L0 §4-1·§4-1-1).
 *
 * 이 파일이 지키는 것은 **첫 로그인 게이트**다 — 여기가 새면 남의 계정을 선점당한다.
 * 그래서 「통과해야 하는 것」보다 **「절대 통과하면 안 되는 것」**을 먼저·두껍게 검사한다.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { 학생번호맞나, 이메일, 학생번호표기, 뒤4자리, 뒷자리맞나, 시도상한 } = require('../lib/학생계정.js');

const ROOT = path.join(__dirname, '..');

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

/* ☠️ 2026-08-07 설계 심문(L0 · sol·luna 둘 다 P0)이 낸 **계정 선점** 경로.
 *   공개 가입이 열려 있으면(`disable_signup=false`) 남이 먼저 `synk042@synk.invalid` 로 가입할 수
 *   있고 — 학생번호가 순번이라 주소가 예측된다 — 첫 등록의 「이미 있으면 그 계정을 잇는다」
 *   분기가 **공격자 계정을 그 학생 행에 이어 준다.** 비밀번호가 공격자 것이라 그 사람이 그 학생이 되고
 *   진짜 학생은 자기 계정에 못 들어간다. L0 §8-2 는 두 사실을 각각 맞게 적고 **곱을 안 봤다**.
 * 🔑 검사 자리: 기존 계정을 **찾은 뒤 ~ learners 에 잇기 전** 사이에 비밀번호 덮기가 있는가.
 *   주석은 지우고 본다 — 이 파일 옆 주석에도 그 이름이 여러 번 나오므로 `includes` 로 재면
 *   실제 호출이 사라져도 초록이다(가드가 자기 전처리에 눈머는 자리). */
test('🔴 첫 등록: 남이 선점한 계정을 이을 때 비밀번호를 덮는다 — 안 덮으면 그 학생 계정이 남의 것이 된다', () => {
  const 소스 = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'auth', 'index.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const 찾기 = 소스.indexOf('select id from auth.users');
  const 잇기 = 소스.indexOf('const 이음');
  assert.ok(찾기 > 0 && 잇기 > 찾기, '첫 등록의 기존계정 분기를 못 찾았다 — 검사가 죽었다(코드 모양이 바뀌었으면 이 앵커부터 고쳐라)');

  assert.ok(소스.slice(찾기, 잇기).includes('비밀번호갈기('),
    '기존 계정을 찾아 잇는데 비밀번호를 안 덮는다 — 공개 가입으로 선점한 계정이 그대로 학생 계정이 된다.\n' +
    '  고치는 법: 잇기 전에 `비밀번호갈기(uid, 비밀번호)` 를 부르고, 실패하면 잇지 말고 500 을 낸다.');
});

test('시도상한이 계약값과 같다 — 없으면 1만 번 대입으로 뚫린다', () => {
  assert.equal(시도상한, 5);
});

/* 🔴 화면에 내는 값은 **선생님이 명단에서 찾을 값**이다(F176 ① 막힘 안내 `보여줄값`).
 *   학생이 친 그대로 보여주면 `synk 42` 가 그대로 서고 명단 검색이 빗나간다. */
test('학생번호표기: 어떻게 쳤든 발급기 표기형으로 접힌다', () => {
  for (const v of ['SYNK-042', 'SYNK042', 'synk-042', ' synk 042 ']) {
    assert.equal(학생번호표기(v), 'SYNK-042', `${JSON.stringify(v)} 가 표기형으로 안 접혔다`);
  }
  assert.equal(학생번호표기('SYNK-1000'), 'SYNK-1000', '네 자리(1000번대)에서 자리를 밀지 않는다');
});
