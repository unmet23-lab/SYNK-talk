/* 동봉 CJS 계약 — 동봉으로 나가는 .js 전량은 CJS 여야 한다 (배정 배선 ①단계 · 2026-08-11).
 *
 * ■ 왜 — 동봉 껍데기(`tools/원격배포.js` 동봉묶기)는 CJS 전제다: `const module={exports:{}}
 *   … export default module.exports`. ESM 파일을 실으면 exports 가 비거나 export 선언이
 *   충돌해 **배포는 초록이고 함수는 부팅 import 에서 죽는다**(적대 반박 C2 · 대기열 P0 G1).
 *   그 실패는 배포 시점 증상이 0 이라 여기서 기계로 막는다.
 * ■ 판별은 `tests/lib/앱모듈세우기.js`(줄머리 import/export)와 같은 자다 — 두 곳이 갈리면
 *   「로더는 ESM 로 보고 동봉은 CJS 로 싣는」 창이 생긴다. 저쪽을 고치면 여기부터 맞춰라.
 * ■ 세 맹점(CLAUDE.md): 탐지력은 픽스처가 진다(ESM 두 꼴 + module.exports 부재) —
 *   실저장소 검사는 거짓양성 0 만 보고, 분모(몇 건을 검사했나)를 함께 낸다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 동봉목록, 동봉읽기, require풀기 } = require('../tools/원격배포.js');

const ROOT = path.join(__dirname, '..');
const ESM표식 = /^\s*(import|export)\s/m;
const CJS인가 = (소스) => !ESM표식.test(소스) && /\bmodule\.exports\b/.test(소스);

test('동봉 표 전량 — .mjs 로 나가는 .js 파일은 전부 CJS 다 (분모 함께)', () => {
  const 검사한 = [];
  for (const { slug, 디렉터리 } of 동봉목록()) {
    const 표 = 동봉읽기(path.join(ROOT, 디렉터리));
    for (const [이름, 경로] of Object.entries(표 || {})) {
      if (!이름.endsWith('.mjs') || !String(경로).endsWith('.js')) continue;
      const 소스 = fs.readFileSync(path.join(ROOT, String(경로)), 'utf8');
      assert.ok(CJS인가(소스),
        `${slug}/${이름} ← ${경로} 가 CJS 가 아니다 — 껍데기가 CJS 전제라 배포 초록 뒤 부팅 import 에서 죽는다`);
      검사한.push(`${slug}/${이름}`);
    }
  }
  assert.ok(검사한.length >= 6,
    `분모가 비었다 — 동봉 .js 검사 ${검사한.length}건(미실행은 통과와 같은 모양이다)`);
});

/* 「배정 배선 동봉 후보」 시험은 ④단계가 세 파일(게임배정·게임스냅샷·교수멘탈문항)을 deliver
 * 표에 올리며 은퇴했다 — 전량 검사가 이어받는다(그 시험의 자체 주석이 정한 은퇴 조건). */

test('탐지력 — ESM 두 꼴·module.exports 부재가 실제로 걸리고, CJS 는 통과한다', () => {
  assert.equal(CJS인가("import x from './y.js';\nmodule.exports = {};\n"), false, 'import 꼴');
  assert.equal(CJS인가('export const a = 1;\n'), false, 'export 꼴');
  assert.equal(CJS인가('const a = 1;\n'), false, 'module.exports 부재 — 동봉 값이 빈 객체가 된다');
  assert.equal(CJS인가("'use strict';\nconst a = 1;\nmodule.exports = { a };\n"), true, '정상 CJS');
});

test('require풀기 — 상위 경로(../contents) require 도 정적 import 로 풀린다', () => {
  const 표 = { '교수멘탈문항.mjs': 'contents/교수멘탈문항.js', '게임스냅샷.mjs': 'lib/게임스냅샷.js' };
  const 산출 = require풀기(
    "const { 모듈상수, 펴기 } = require('../contents/교수멘탈문항.js');\n", '게임스냅샷.mjs', 표);
  assert.ok(!/\brequire\s*\(/.test(산출), 'require 가 남았다 — Deno 에는 require 가 없어 부팅에서 죽는다');
  assert.match(산출, /import __동봉1 from '\.\/교수멘탈문항\.mjs';/);
  assert.match(산출, /const \{ 모듈상수, 펴기 \} = __동봉1;/, '구조분해가 원형대로 남아야 한다(껍데기는 default 하나뿐)');
});

test('require풀기 — 상위 경로가 표에 없으면 던지고, 종전 꼴(./옆.js)은 그대로 산다', () => {
  assert.throws(
    () => require풀기("const { 펴기 } = require('../contents/교수멘탈문항.js');\n", 'x.mjs', {}),
    /동봉 표에 없다/, '못 푸는 require 를 런타임까지 미루면 배포 초록 뒤에 죽는다');
  const 산출 = require풀기("const 토큰 = require('./토큰.js');\n", 'x.mjs', { '토큰.mjs': 'lib/토큰.js' });
  assert.match(산출, /import __동봉1 from '\.\/토큰\.mjs';/, '확장이 기존 축을 깨면 여기가 빨개진다');
});
