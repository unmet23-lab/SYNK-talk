'use strict';
/* 판재료 — **생성물이다. 손으로 안 고친다.** (node tools/판재료굽기.js 가 굽는다)
 * 원본 커밋 9c4b6b3 · 재료 = §5-1 파일 해시 7 + 폴백순서. 드리프트는 tests/판재료.test.js 가 잰다. */
const 파일해시 = Object.freeze({
  "요약조립": "22bd615304165e10c334fb57ec9797e5cf155f55b8733ced13f6b990932d1ab5",
  "검문": "ad6045f655f54ca3f3db3a243264e1347582323e274d3bdd155db6405c5d8c27",
  "갈래판정": "4ed4033453d1bc80ab8a7ef019ff4743ee27882c8bed79926695179750fba4b0",
  "기술선택": "ea5ff69fd213243faaeafc4391b90534b6a05a8db5687b9bf4374dc027a3fafd",
  "오류분류": "103cad9181f7a123afed476a9bd49bc1267f0fedb02c1b51fb9abe6c9fa69cc7",
  "폴백조립": "37c9aa9e4b15df49e42e5879a42cce62afb876f1b48fda1f15c33daf5fe05753",
  "추정기": "5d9a8f363f6ef179ff8331f836a2efe0d1ea5e54bd3919d20fcc697484497d15"
});
const 폴백순서원소 = "[\"첫날\",\"교정문\",\"전날\",\"도입폴백\"]";
module.exports = { 파일해시, 폴백순서원소 };
