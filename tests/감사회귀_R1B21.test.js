'use strict';
/* 감사 G1-9 회귀 — `src/제출API.js` 의 학생 문구 여섯이 **정본 표로** 옮겨 갔나.
 *
 * 🔴 이 파일이 막는 사고: 문장이 통로 파일에 리터럴로 되돌아가면 몽골어가 붙는 날
 *   그 자리만 한국어로 남는다(증상 없음). 리터럴 «부재»는 `tests/문구_오류.test.js` ⑧ 이
 *   재고, 여기서는 반대 방향 — 여섯 자리가 실제로 `말()` 을 **부르는지**와, 새 자리채움
 *   (`{ext}`·`{원인}`)이 정말 채워지는지를 못박는다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { 코드만, 파일소스 } = require('./lib/소스검사.js');
const { 문구, 말 } = require('../contents/문구_오류.js');
const { 문구_1차 } = require('../contents/문구_1차.js');

const 새키 = [
  'err.upload.bad_format', 'err.upload.file_missing', 'err.upload.no_url',
  'err.upload.failed', 'err.kept.no_task',
];

test('① 신설 다섯 키가 표와 감수 목록 **양쪽에** 있다 — 번역이 착지할 자리가 실재한다', () => {
  const 목록id = new Set(문구_1차.map((e) => e.string_id));
  for (const id of 새키) {
    assert.ok(문구[id], `표에 없다: ${id}`);
    assert.ok(목록id.has(id), `감수 목록에 없다: ${id}`);
    assert.equal(문구[id].mn, '', `${id}: 몽골어는 감수 전이라 비어 있어야 한다`);
  }
});

test('② 제출API.js 의 여섯 자리가 전부 말() 을 부른다 — 리터럴 부재만으로는 못 재는 방향', () => {
  const 소스 = 코드만(파일소스(path.join(__dirname, '..', 'src', '제출API.js')));
  const 불러야할것 = [...새키, 'err.no_token'];
  for (const id of 불러야할것) {
    assert.ok(소스.includes(`말('${id}'`), `제출API.js 가 말('${id}') 을 안 부른다`);
  }
  assert.ok(소스.includes("from '../contents/문구_오류.js'"), '정본 표를 import 하지 않는다');
});

test('③ 자리채움 {ext}·{원인} 이 채워진다 — 학생이 보는 글자가 한 자도 안 변했다', () => {
  /* 옛 리터럴과 글자 대조 — 치환 전 문장이 그대로 나와야 한다. */
  assert.equal(말('err.upload.bad_format', { 채움: { ext: 'ogg' } }), '올릴 수 없는 형식이에요: .ogg');
  assert.equal(말('err.upload.failed', { 채움: { 원인: '네트워크 끊김' } }), '녹음을 올리지 못했어요: 네트워크 끊김');
  /* 🔑 {원인} 은 한글 이름 칸이다 — \w 만 받던 옛 채움이라면 여기가 빨개진다. */
  assert.equal(말('err.upload.failed'), '녹음을 올리지 못했어요: {원인}',
    '못 채운 칸을 지웠다 — 지우면 문장이 조용히 말을 바꾼다');
  /* 숫자 칸(⑤)의 옛 행동이 그대로인지도 같이 못박는다 — 채움을 넓히다 좁히면 여기서 걸린다. */
  assert.equal(말('err.password_too_short', { 채움: { n: 6 } }), '비밀번호는 6자 이상으로 정해 주세요');
});
