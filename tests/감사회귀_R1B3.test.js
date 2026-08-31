'use strict';
/* 감사 R1B3 회귀 — 인증화면 시공 둘을 잰다.
 *
 * · D1-5  잠긴 「시작하기」 — 버튼이 형식 미달로 «죽어» 있지 않고, 누르면 빠진 칸을 말한다.
 *   ⚠ press 는 소스로 잰다 — 핸들러는 서버 렌더(첫 렌더 층 `tests/lib/화면세우기.js`)에서
 *     원리상 안 돈다(`tests/감사회귀_R1B5.test.js` 와 같은 방식 · 문자열 대조).
 * · D1-13 비밀 칸 «보기» 토글 — 첫 렌더에 실제로 선다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { 코드만, 파일소스 } = require('./lib/소스검사.js');
const { 그리기 } = require('./lib/화면세우기.js');

const 화면 = 코드만(파일소스(path.join(__dirname, '..', 'src', '인증화면.js')));

test('D1-5 제출 버튼은 도는중에만 죽는다 — 빈 폼에서 누르면 첫 빠진 칸의 안내가 선다', () => {
  assert.match(화면, /disabled=\{도는중\}/, '버튼 disabled 가 도는중 하나가 아니다');
  assert.doesNotMatch(화면, /disabled=\{!제출\.쓸수있나/,
    '형식 미달이 다시 버튼을 죽였다 — 학생은 왜 안 눌리는지 영영 못 듣는다');
  assert.match(화면, /if \(!제출\.쓸수있나\) \{/, '미달 갈래가 onPress 에 없다');
  assert.match(화면, /빠진칸안내\(\)/, '빠진 칸 안내를 안 부른다');

  /* 안내는 화면 순서대로 «첫 빠진 칸 하나만» — 문장 넷이 그 순서로 서 있어야 한다. */
  const 차례 = [
    '학생번호를 확인해 주세요',
    '전화번호 뒤 4자리를 넣어 주세요',
    '학원에서 받은 6자리를 넣어 주세요',
    '비밀번호를 넣어 주세요',
  ].map((문장) => 화면.indexOf(문장));
  assert.ok(차례.every((i) => i >= 0), `안내 문장이 빠졌다: ${차례.join(' · ')}`);
  assert.deepEqual([...차례].sort((a, b) => a - b), 차례, '안내가 화면(칸) 순서와 다르게 선다');

  /* 비밀번호 길이는 오류 표의 그 문장 그대로다 — 리터럴 사본을 만들지 않는다. */
  assert.match(화면, /말\('err\.password_too_short', \{ 채움: \{ n: 최소비번 \} \}\)/,
    '길이 미달 안내가 문구_오류 표를 안 탄다');
  /* 가입 문항 미선택은 그 문항의 라벨로 짚는다. */
  assert.match(화면, /을 골라 주세요/, '가입 문항 미선택 안내가 없다');
});

test('D1-13 비밀 칸에 «보기» 토글이 실제로 그려지고, 보이면 secure 가 풀린다', () => {
  const 글 = 그리기('src/인증화면.js', { 로그인성공() {}, 닫기() {} });
  assert.match(글, /(^|\s)보기(\s|$)/, '비밀 칸 첫 렌더에 「보기」 토글이 없다');
  /* 보임 상태와 secure 의 배선 — 토글이 그려져도 이 줄이 빠지면 눌러도 안 보인다. */
  assert.match(화면, /secureTextEntry=\{Boolean\(비밀\) && !보임\}/,
    'secure 가 보임 상태를 안 본다 — 토글이 장식이 된다');
});
