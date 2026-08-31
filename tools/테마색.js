'use strict';
/**
 * 킷 색 — talk 쪽 «단일 통로».
 *
 * 색의 원천은 src/테마.js 하나다(그 원천의 정본 = SYNK-appsscript docs/디자인_토큰.json).
 * 도구·시험이 hex 를 제 몸에 베끼면 정본이 바뀌는 날 사본은 스스로 낡음을 모른다 —
 * 그래서 여기가 테마.js 를 «읽어서» 주고, 파서도 이 한 벌뿐이다(두 벌이면 반드시 갈린다).
 *
 * CJS 다 — tools/guard.js 처럼 test 가 require 한다. 테마.js 는 ESM(export const)이라
 * require 로 못 물고, 색 블록만 정규식으로 읽는다(tests/테마면.test.js 가 쓰던 그 파서를 옮겨 왔다).
 */

const fs = require('node:fs');
const path = require('node:path');

const 테마경로 = path.join(__dirname, '..', 'src', '테마.js');

/**
 * src/테마.js 의 `색` 블록을 읽어 「토큰이름 → 값」 지도를 준다.
 * 🔴 못 읽으면 «던진다» — 테마.js 가 색 정의 문법을 바꿔 블록을 못 찾았는데 조용히
 *   빈 지도를 주면, 소비자(아이콘 생성기·시험)가 undefined 색으로 초록 얼굴을 한다.
 */
function 킷색() {
  const 블록 = fs.readFileSync(테마경로, 'utf8').match(/export const 색 = \{([\s\S]*?)\n\};/);
  if (!블록) throw new Error(`테마.js 에서 \`export const 색\` 블록을 못 찾았다 — ${테마경로}`);
  const 값 = {};
  for (const m of 블록[1].matchAll(/^\s*([가-힣_]+):\s*'([^']+)'/gm)) 값[m[1]] = m[2];
  return 값;
}

/**
 * Coral Soft — 알록판 색실의 코랄 계열(펠트 램프 색).
 * ⚠ 이 값은 테마.js 에 토큰이 «없다»(앱 화면이 안 쓰는 아이콘 전용) — 여기가 talk 쪽
 *   유일 사본이다. 정본 = SYNK-appsscript docs/디자인_토큰.json 킷 「Coral Soft」
 *   (tests/킷대조.test.js 가 형제 저장소가 있을 때 그 정본과 대조한다).
 */
const 코랄소프트 = '#FBB7A3';

module.exports = { 킷색, 코랄소프트 };
