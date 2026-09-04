'use strict';
/* 판재료 — **생성물이다. 손으로 안 고친다.** (node tools/판재료굽기.js 가 굽는다)
 * 원본 커밋 6f0da96 · 재료 = §5-1 파일 해시 7 + 폴백순서. 드리프트는 tests/판재료.test.js 가 잰다. */
const 파일해시 = Object.freeze({
  "요약조립": "cfa21a65fe2e367eafce23ce992dd9c1385ac994ac957c2553413879ee61c0c5",
  "검문": "244669f166cdbeccf2ffd6a96504d348ed66bef81e0d63479e1b6bd3cb7f3e35",
  "갈래판정": "291f7a87bce77aad9f0bf4acfc3be9e64e9db99eca49302776493256cd695fb5",
  "기술선택": "10b96a240385c947149daffd2b323913982a602eacf6c0e639b74ae71d74d652",
  "오류분류": "da02c642c4e04354b836194c083b14e20e9c2c36c96a15cf72fa3d6c2c032e18",
  "폴백조립": "fa52a03883357cd59795d398bcbd8d101c74485222d051874290a5b917f30606",
  "추정기": "7eb07c083a6f30bf7e88172705f4202e08542f4ae8ca58148c2936e1f78342f3"
});
const 폴백순서원소 = "[\"첫날\",\"교정문\",\"전날\",\"예비\",\"도입폴백\"]";
module.exports = { 파일해시, 폴백순서원소 };
