'use strict';
/* 판재료 — **생성물이다. 손으로 안 고친다.** (node tools/판재료굽기.js 가 굽는다)
 * 원본 커밋 5edaa38 · 재료 = §5-1 파일 해시 7 + 폴백순서. 드리프트는 tests/판재료.test.js 가 잰다. */
const 파일해시 = Object.freeze({
  "요약조립": "47f97241b9cfc5048b824805167bc917d0b41877f4e938d89356fb9626014fc8",
  "검문": "e25272fdd8e1dd9546380b28054c2db633b81a12d8300c289a42712adf33f665",
  "갈래판정": "4ed4033453d1bc80ab8a7ef019ff4743ee27882c8bed79926695179750fba4b0",
  "기술선택": "10b96a240385c947149daffd2b323913982a602eacf6c0e639b74ae71d74d652",
  "오류분류": "d48161e5ac39926390d02abe24c0cc11f86cc1d272e841474e1d76a12114c560",
  "폴백조립": "405816f2ed2f2508ade7aca59a5c5a92d2beb9d63c26afbf288840f8aa06a39e",
  "추정기": "d8d94bf4cbf2cb3cac5252a0ef2448a25cf363306162ec43b8f8cbffc0925c49"
});
const 폴백순서원소 = "[\"첫날\",\"교정문\",\"전날\",\"도입폴백\"]";
module.exports = { 파일해시, 폴백순서원소 };
