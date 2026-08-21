/* 판독기 회귀 — §5-1 「열셋 각각을 한 글자씩 바꾼 픽스처 13벌이 빨개지는지 본다」(§12-5) 를
 * 그대로 잰다 + 자리수 12(v5.10)·접두(선택판)·quality_ver 부분판(§5-1-a)의 경계.
 *
 * 🔴 직렬화는 node:crypto 독립 구현과 대조한다(tests/기술선택.test.js 와 같은 규칙) — lib 이
 *   틀리게 바뀌면 같은 틀림으로 초록이 되는 자기참조를 막는다. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { 정책지문, 품질지문, 파일원소, 재료이름 } = require('../lib/판독기.js');
const { 선택판 } = require('../lib/오늘과제.js');

const 재료 = () => Object.fromEntries(재료이름.map((k, i) => [k, `원소-${i}-${k}`]));

test('재료는 열셋이고 §5-1 표 순서다 — 수가 갈리면 §12-5 와 두 정본이 된다', () => {
  assert.equal(재료이름.length, 13);
  assert.deepEqual([재료이름[0], 재료이름[6], 재료이름[7], 재료이름[12]],
    ['요약조립', '갈래판정', '기술선택', '추정기']);
});

test('형식 — 접두는 선택판 그대로 + « + » + hex 앞 12자 (v5.10 · 16자·전문 되살리기 금지)', () => {
  const v = 정책지문(재료());
  const m = /^(.+)\+([0-9a-f]{12})$/.exec(v);
  assert.ok(m, `형식이 아니다: ${v}`);
  assert.equal(m[1], 선택판, '접두가 선택판과 갈렸다 — 전환 판독(§5-4)이 죽는다');
});

test('직렬화 — node:crypto 독립 계산과 접미가 같다 (JSON.stringify(원소 13 배열) 의 SHA-256)', () => {
  const r = 재료();
  const 독립 = crypto.createHash('sha256')
    .update(Buffer.from(JSON.stringify(재료이름.map((k) => r[k])), 'utf8'))
    .digest('hex').slice(0, 12);
  assert.equal(정책지문(r).split('+')[1], 독립);
});

test('🔴 §12-5 — 열셋 각각을 한 글자 바꾸면 지문이 «전부» 갈린다 (13벌)', () => {
  const 기준 = 정책지문(재료());
  for (const k of 재료이름) {
    const r = 재료();
    r[k] += 'x';
    assert.notEqual(정책지문(r), 기준,
      `재료 「${k}」 를 바꿨는데 지문이 그대로다 — 그 규칙이 바뀌어도 판이 안 오른다`);
  }
});

test('재료가 비거나 모르는 이름이면 던진다 — 빠뜨림이 조용히 다른 지문이 되지 않게', () => {
  for (const k of 재료이름) {
    const r = 재료();
    delete r[k];
    assert.throws(() => 정책지문(r), new RegExp(k));
  }
  const r = 재료();
  r.몰래재료 = 'x';
  assert.throws(() => 정책지문(r), /몰래재료/);
});

test('파일원소 — 원문의 UTF-8 SHA-256 소문자 hex 전문이다 (v5.9 표)', () => {
  const 원문 = 'const x = 1;\n// 한국어 주석';
  assert.equal(파일원소(원문),
    crypto.createHash('sha256').update(Buffer.from(원문, 'utf8')).digest('hex'));
});

test('quality_ver — 재료 2·11 «둘만» 본다: 다른 재료가 바뀌어도 불변, 둘 중 하나면 갈린다 (§5-1-a)', () => {
  const q = 품질지문({ 검문: 파일원소('검문판'), 오류분류: 파일원소('분류판') });
  assert.match(q, /^[0-9a-f]{12}$/, '부분판은 접두 없는 hex 12자다 — 행에 안 남는 평가 층의 값');
  assert.equal(품질지문({ 검문: 파일원소('검문판'), 오류분류: 파일원소('분류판') }), q, '결정적이어야 한다');
  assert.notEqual(품질지문({ 검문: 파일원소('검문판x'), 오류분류: 파일원소('분류판') }), q);
  assert.notEqual(품질지문({ 검문: 파일원소('검문판'), 오류분류: 파일원소('분류판x') }), q);
  assert.throws(() => 품질지문({ 검문: 파일원소('검문판') }), /오류분류/);
});
