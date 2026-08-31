'use strict';
/**
 * 감사 회귀 R1B23 · S1-8 — 킷 색 «사본»이 되돌아오지 않는다.
 *
 * 감사가 잡은 것: 킷 색 상수가 네 곳에 살았다(src/테마.js · tools/make-icons.js ·
 * tests/아이콘.test.js · 형제 저장소 디자인_토큰.json). 시공 뒤 talk 쪽 소비자 둘은
 * tools/테마색.js 의 킷색() 하나만 문다 — 이 회귀는 그 두 파일에 킷 hex 가 «따옴표 친
 * 리터럴»로 다시 박히는 것을 잡는다(주석의 설명용 hex 는 코드가 아니라 안 잡는다).
 * 형제 정본과의 «값» 대조는 tests/킷대조.test.js 가 맡는다 — 한 판정에 자 하나씩.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 코드만, 파일소스 } = require('./lib/소스검사.js');
const { 킷색, 코랄소프트 } = require('../tools/테마색.js');

test('킷색() 이 아이콘 통로가 쓰는 칸을 전부 hex 로 준다', () => {
  const 색 = 킷색();
  for (const k of ['바탕', '바탕띄움', '잉크', '신호', '신호_보조', '눌림']) {
    assert.match(String(색[k] || ''), /^#[0-9A-F]{6}$/i, `킷색() 에 「${k}」 이 없거나 hex 가 아니다`);
  }
  assert.match(코랄소프트, /^#[0-9A-F]{6}$/i);
});

test('아이콘 통로 둘에 킷 hex 리터럴 사본이 없다 — 색은 킷색() 으로만 온다', () => {
  const 색 = 킷색();
  const 킷값 = [색.바탕, 색.잉크, 색.신호, 코랄소프트];
  /* 경로는 리터럴로 — 변수로 접으면 소스검사통로 래칫이 「언어를 못 가른 자리」로 센다.
   * 코드만()을 지나므로 주석의 설명용 hex 는 안 잡는다(머리말의 약속이 실제 동작과 맞는 자리). */
  const 소스들 = [
    ['tools/make-icons.js', 코드만(파일소스(path.join(__dirname, '..', 'tools', 'make-icons.js')))],
    ['tests/아이콘.test.js', 코드만(파일소스(path.join(__dirname, '..', 'tests', '아이콘.test.js')))],
  ];
  for (const [f, 소스] of 소스들) {
    for (const hex of 킷값) {
      assert.ok(
        !소스.includes(`'${hex}'`) && !소스.includes(`"${hex}"`),
        `${f} 에 킷 hex ${hex} 가 리터럴로 박혔다 — tools/테마색.js 의 킷색() 을 물어라`
      );
    }
  }
});
