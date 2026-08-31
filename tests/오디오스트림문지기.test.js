'use strict';
/* 감사 S1-9 — expo-audio 내부 경로 직수입의 문지기가 «지금 판»에서 서고, postinstall 에 걸려 있다.
 * 문지기 자체가 판올림 날의 자라서, 이 시험은 ①오늘의 node_modules 에서 통과 ②배선 두 가지만 잰다.
 * (문지기가 빨간 날은 npm install 이 그 자리에서 멈춘다 — 여기가 아니라 그 문이 정본이다.) */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 판정 } = require('../tools/오디오스트림문지기.js');

test('오디오스트림문지기 — 현재 설치판에서 직수입 전제 둘이 유효하다', () => {
  const r = 판정();
  assert.equal(r.값, true, `문지기가 빨갛다: ${r.사유}`);
});

test('오디오스트림문지기 — postinstall 사슬에 걸려 있다(판올림마다 스스로 다시 잰다)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.ok(String(pkg.scripts.postinstall).includes('오디오스트림문지기'),
    'postinstall 이 문지기를 안 부른다 — 판올림이 미확인으로 성공처럼 찍힌다');
});
