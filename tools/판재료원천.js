'use strict';
/* 빌드 전용. 요약조립의 지문은 실제 로컬 require 의 전이 의존성까지 포함한다.
 * 원천 목록의 누락은 tests/판재료.test.js가 의존 경로를 따라가며 검사한다.
 * 파일 순서는 경로 오름차순, 각 원소는 [경로, 원본 바이트 SHA-256]이며 JSON 틀의 판은 1이다.
 * 다른 정책 재료의 기존 단일 파일 해시 규격은 바꾸지 않는다. */
const crypto = require('node:crypto');
const 요약원천 = Object.freeze([
  'contents/문구_동의.js',
  'contents/문구_성향확인.js',
  'lib/과제요약.js',
  'lib/성향확인.js',
  'lib/시즌맥락.js',
]);
const hex = (바이트) => crypto.createHash('sha256').update(바이트).digest('hex');
function 요약지문(읽기) {
  return hex(JSON.stringify({ ver: 1, files: [...요약원천].sort().map((p) => [p, hex(읽기(p))]) }));
}
module.exports = { 요약원천, 요약지문 };
