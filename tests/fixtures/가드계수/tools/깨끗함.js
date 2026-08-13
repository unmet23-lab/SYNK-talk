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

/* ── 2026-08-13 2차 · JSON 구조는 «이 축이 아니다» ────────────────────────────
 * 파일에서 왔지만 «글»이 아니다 — JSON 엔 주석이 없어서 「가드가 자기 주석에 눈먼다」가
 * 원리상 성립하지 않는다. 그런데 첫 판은 이것을 원문으로 세고, 그 파생인 **생성된 SQL**
 * 까지 위험으로 번졌다(실측 `교정확정:82`·`동의발급:116` — 처방이 통째로 틀렸다).
 * 위험도 안전도 ❔모름도 아니어야 한다. */
const 계약 = JSON.parse(fs.readFileSync('없는계약.json', 'utf8'));
const 만든SQL = `insert into t values ('${계약.버전}')`;
assert.ok(!만든SQL.includes('reviewed_correction_id'));
