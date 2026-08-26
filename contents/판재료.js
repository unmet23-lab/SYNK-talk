'use strict';
/* 판재료 — **생성물이다. 손으로 안 고친다.** (node tools/판재료굽기.js 가 굽는다)
 * 원본 커밋 ec46ce9 · 재료 = §5-1 파일 해시 7 + 폴백순서. 드리프트는 tests/판재료.test.js 가 잰다. */
const 파일해시 = Object.freeze({
  "요약조립": "47f97241b9cfc5048b824805167bc917d0b41877f4e938d89356fb9626014fc8",
  "검문": "244669f166cdbeccf2ffd6a96504d348ed66bef81e0d63479e1b6bd3cb7f3e35",
  "갈래판정": "291f7a87bce77aad9f0bf4acfc3be9e64e9db99eca49302776493256cd695fb5",
  "기술선택": "10b96a240385c947149daffd2b323913982a602eacf6c0e639b74ae71d74d652",
  "오류분류": "0bf56e5c09fb4ab58fb1421860eb2dd01db8f7beafb923a76b3c132823339530",
  "폴백조립": "3578ae72d37c4c2a36800f18c9cabbd45dff64e610cf72ad83c31363e08ac86f",
  "추정기": "f984717ee00cb86a96a2a8cb76c74c9f59af2677b7749c11a1f661b79705c154"
});
const 폴백순서원소 = "[\"첫날\",\"교정문\",\"전날\",\"예비\",\"도입폴백\"]";
module.exports = { 파일해시, 폴백순서원소 };
