'use strict';
/* 경과시계 회귀 — 단조 시계의 정본이 `lib/경과시계.js` 하나인가(S1-6).
 *
 * 🔴 이 파일의 실값은 ㉯다: 사본 넷(말하기·교수멘탈·보고서교정·서류관문)을 걷은 자리에
 *   다섯 번째 사본이 조용히 부활하는 것을 막는다 — 사본은 갈라지는 날까지 증상이 없다
 *   (벽시계로 되돌아간 한 벌이 «오래 망설인 학생»을 지어낸다 · lib 머리말).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { 코드만, 파일소스 } = require('./lib/소스검사.js');
const { 경과시계 } = require('../lib/경과시계.js');

test('㉮ node 런타임에서 수를 낸다 — performance 가 있는 곳의 값은 단조 시계다', () => {
  /* node 는 performance 전역을 가진다 — 없으면 null(「안 쟀다」)이 계약이고, 그 갈래는
     lib 본문의 typeof 게이트가 진다(여기서 performance 를 지울 방법은 없어 값 갈래만 잰다). */
  const 값 = 경과시계();
  assert.equal(typeof 값, 'number');
  assert.ok(값 >= 0 && Number.isFinite(값), `단조 시계 값이 아니다: ${값}`);
});

test('㉯ 🔴 네 화면에 `const 경과시계 =` 재정의 0건 — 사본이 부활하면 여기서 빨개진다', () => {
  const 화면들 = ['말하기화면.js', '교수멘탈화면.js', '보고서교정화면.js', '서류관문화면.js'];
  const 부활 = [];
  for (const 파일 of 화면들) {
    const 코드 = 코드만(파일소스(path.join(__dirname, '..', 'src', 파일)));
    if (/const 경과시계 =/.test(코드)) 부활.push(파일);
    /* 분모 — 그 화면이 경과시계를 아예 안 쓰면(호출부 소멸) 이 검사는 잴 것이 없어진 것이다. */
    assert.ok(코드.includes('경과시계'), `${파일} 에 경과시계 호출이 0건 — 검사 분모가 죽었다`);
    assert.ok(코드.includes("from '../lib/경과시계.js'"), `${파일} 이 lib 정본을 import 하지 않는다`);
  }
  assert.deepEqual(부활, [], `경과시계 사본이 화면에 부활했다: ${부활.join(' · ')} — 정본은 lib/경과시계.js 하나다`);

  /* 탐지력 — 정본에는 그 정의가 «있어야» 한다(자가 거꾸로 서면 0건이 초록 얼굴을 한다). */
  const 정본 = 코드만(파일소스(path.join(__dirname, '..', 'lib', '경과시계.js')));
  assert.match(정본, /const 경과시계 =/, 'lib/경과시계.js 에 정의가 없다 — 이 검사의 자가 뒤집혔다');
});
