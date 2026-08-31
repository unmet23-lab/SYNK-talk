'use strict';
/* 인증 문구 표 회귀 — `contents/문구_인증.js` 가 감수 1차 목록(auth.*)과 정말 1:1 인가.
 * `tests/문구_오류.test.js` 와 같은 규율로 셋을 막는다(전부 증상이 없다):
 *   ① 한쪽에만 있는 줄 — 감수자가 옮긴 문장이 갈 곳 없이 남는다.
 *   ② 원문이 갈라진다 — 감수자는 A 를 옮기고 학생은 B 를 읽는다.
 *   ③ 지어낸 몽골어 — 감수를 안 지난 번역이 조용히 정본이 된다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { 문구, 줄들 } = require('../contents/문구_인증.js');
const { 문구_1차 } = require('../contents/문구_1차.js');

const 목록auth = 문구_1차.filter((e) => e.string_id.startsWith('auth.'));

test('① 🔴 감수 목록의 auth.* 와 표가 **1:1** 이다 — 한쪽에만 있으면 번역이 길을 잃는다', () => {
  const 목록id = 목록auth.map((e) => e.string_id).sort();
  const 표id = Object.keys(문구).sort();
  assert.deepEqual(표id, 목록id,
    `표에만 있음: ${표id.filter((x) => !목록id.includes(x)).join(' · ') || '없음'}\n`
    + `  목록에만 있음: ${목록id.filter((x) => !표id.includes(x)).join(' · ') || '없음'}`);
  assert.ok(목록id.length >= 20, `auth.* 가 ${목록id.length}줄이다 — 분모가 깨졌다`);
});

test('② 표의 한국어가 감수 목록의 원문과 **한 글자도 안 다르다**', () => {
  for (const e of 목록auth) {
    assert.equal(문구[e.string_id].ko, e.source_ko, `${e.string_id} 의 원문이 갈라졌다`);
  }
});

test('③ 몽골어는 아직 전부 비어 있다 — 지어낸 번역이 섞이면 여기서 걸린다', () => {
  /* 🔑 감수가 끝나면 이 검사를 **지우는 게 아니라** 「감수 통과분만 차 있다」로 바꾼다. */
  const 찬것 = Object.entries(문구).filter(([, v]) => String(v.mn || '').trim());
  assert.deepEqual(찬것.map(([k]) => k), [],
    '출처 없는 몽골어가 표에 들어왔다 — 감수를 지난 것만 여기 온다(틀린 몽골어는 없는 것보다 나쁘다)');
});

test('④ 줄들 — mn 이 빈 동안 킷폰트 한 줄뿐이고, `{n}` 은 채워지며, 모르는 id 는 빈 배열이다', () => {
  assert.deepEqual(줄들('auth.title.login'), [{ 글: '들어가기', mn: false }],
    '빈 mn 이 줄로 새어 나왔다 — 빈 줄은 화면에서 버그처럼 보인다');
  assert.deepEqual(줄들('auth.hint.password_min', { 채움: { n: 6 } }), [{ 글: '6자 이상', mn: false }]);
  assert.deepEqual(줄들('auth.hint.password_min'), [{ 글: '{n}자 이상', mn: false }],
    '못 채운 칸을 지웠다 — 지우면 문장이 조용히 말을 바꾼다');
  assert.deepEqual(줄들('auth.없는키'), [], '모르는 id 가 빈 줄을 그리게 한다');

  /* 표가 차는 날의 모양 — 표만 채우면 화면 코드가 안 바뀐다는 약속을 여기서 확인한다. */
  const 짝 = { ko: '들어가기', mn: 'Нэвтрэх' };
  const 두줄 = [{ 글: 짝.ko, mn: false }, { 글: 짝.mn, mn: true }].filter((줄) => 줄.글);
  assert.equal(두줄.length, 2);
  assert.equal(두줄[1].mn, true, 'mn 줄 표식이 없으면 몽골어폰트가 안 얹힌다(두부가 된다)');
});
