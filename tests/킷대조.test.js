'use strict';
/**
 * 킷 대조 회귀 — talk 의 킷 색이 형제 저장소 정본과 «한 값»인가.
 *
 * 킷 색의 정본은 SYNK-appsscript docs/디자인_토큰.json 이고, talk 의 src/테마.js 는
 * 그 기계 번역이다. 두 저장소라 공유 통로가 없어 값이 조용히 갈릴 수 있다 — 이 회귀가
 * 형제가 «있을 때만» 정본을 열어 대조한다.
 *
 * ⚠ 형제가 없으면(CI · 단독 체크아웃) **조용히 통과** — tools/기억데려오기 의
 *   「형제 없으면 침묵」 무늬. sharp 없음(아이콘.test.js)과 달리 skip 도 안 남긴다:
 *   CI 에는 형제가 원리상 없어서, 매 런 skip 은 신호가 아니라 소음이 된다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 킷색, 코랄소프트 } = require('../tools/테마색.js');

const ROOT = path.resolve(__dirname, '..');
const 정본경로 = path.join(ROOT, '..', 'SYNK-appsscript', 'docs', '디자인_토큰.json');

if (fs.existsSync(정본경로)) {
  test('talk 킷 색 일곱이 형제 정본(디자인_토큰.json)과 같다', () => {
    const 정본 = JSON.parse(fs.readFileSync(정본경로, 'utf8'));
    const 지도 = {};
    for (const { 이름, hex } of 정본.색.킷) 지도[이름] = hex;

    const 색 = 킷색();
    const 대조 = [
      ['Ink Deep', 색.바탕],
      ['Ink', 색.바탕띄움],
      ['Paper', 색.잉크],
      ['Coral', 색.신호],
      ['Coral 2', 색.신호_보조],
      ['Coral 3', 색.눌림],
      ['Coral Soft', 코랄소프트],
    ];
    for (const [이름, 값] of 대조) {
      assert.ok(지도[이름], `정본 킷 배열에 「${이름}」 이 없다 — ${정본경로}`);
      assert.equal(값, 지도[이름], `「${이름}」 이 갈렸다 — talk ${값} · 정본 ${지도[이름]}`);
    }
  });
}
