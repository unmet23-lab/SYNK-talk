'use strict';
/* 픽스처 — 거짓양성 쪽. 공용 통로를 지나므로 사본 0·위험 0 이어야 한다.
 * 이 파일이 빨개지면 계수기가 «고쳐 놓은 자리»를 계속 결함이라 부르는 것이다. */

const fs = require('fs');
const assert = require('assert');
const { 코드만 } = require('../../../lib/소스검사.js');

const 소스 = 코드만(fs.readFileSync('없는파일.js', 'utf8'));
const 조각 = 소스.slice(0, 100); // 파생도 정제를 이어받아야 한다

assert.ok(!소스.includes('평균'));
assert.ok(!조각.includes('등수'));
