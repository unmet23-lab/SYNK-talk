/* 게임스냅샷 회귀 — G1 `task_snapshot` 조립기(`lib/게임스냅샷.js` · 발주_게임모듈.md §6-8).
 *
 * ■ 무엇을 지키나
 *   ① **키 집합이 정확히 §6-8 의 6이다** — 표 밖 키(보기·정답·mn·핵심어휘·요구문형) 0.
 *      교수멘탈문항.test.js 의 「스냅샷 픽스처」가 손으로 재현한 그 조립을 실물이 지나는지 본다.
 *   ② **값 사본 0** — 지시문·질문·문항판·상수가 팩 `펴기`·`모듈상수` 산출과 문자열까지 같다.
 *      조립기가 베껴 두면 팩 개정이 스냅샷에 안 닿는데, 그 갈라짐은 저장 시점에 신호가 없다.
 *   ③ **반쪽 스냅샷 금지(규칙 1)** — 탐지력은 «재료를 비운 팩» 픽스처(바꾼소스)가 못박고,
 *      실팩에는 거짓양성 0 만 본다(버그가 아직 있을 것을 요구하는 회귀 금지 · CLAUDE.md).
 *   ④ **결정성** — 같은 시드 = 같은 스냅샷(배정↔제출이 같은 모양이어야 §6-7 ⑥이 선다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { 세우기 } = require('./lib/앱모듈세우기.js');

const 뿌리 = path.resolve(__dirname, '..');
const 팩경로 = path.join(뿌리, 'contents', '교수멘탈문항.js');
const 조립기경로 = path.join(뿌리, 'lib', '게임스냅샷.js');
const fetch금지 = () => { throw new Error('게임스냅샷은 fetch 를 부르지 않는다'); };

const 캐시 = new Map();
const { G1스냅샷, 스냅샷키들 } = 세우기(조립기경로, fetch금지, { 캐시 });
const 팩 = 세우기(팩경로, fetch금지, { 캐시 }); // 같은 캐시 = 조립기가 쓴 그 팩 인스턴스

test('§6-8 6키 정확히 — 표 밖 키 0 · 빈 값 0 · 한글 값 표기', () => {
  const 스냅샷 = G1스냅샷('g1t01.s0d0');
  assert.deepEqual(Object.keys(스냅샷).sort(), [...스냅샷키들].sort());
  assert.deepEqual([...스냅샷키들].sort(),
    ['challenge_id', 'addressee_level', '문항판', '지시문', '질문', 'prompt_seed'].sort(),
    '픽스처(교수멘탈문항.test.js 규칙 5)와 같은 표');
  for (const 키 of 스냅샷키들) {
    assert.ok(typeof 스냅샷[키] === 'string' && 스냅샷[키].trim() !== '', `${키} 비었다`);
  }
  assert.equal(스냅샷.challenge_id, 'g1-교수멘탈');
  assert.equal(스냅샷.addressee_level, '합쇼체', '규칙 2 — hapsyo 아님');
  assert.equal(스냅샷.prompt_seed, 'g1t01.s0d0');
  assert.ok(Object.isFrozen(스냅샷));
});

test('값 사본 0 — 팩 산출과 문자열까지 같다(전 시드 45벌 결정성 동봉)', () => {
  for (const 문항 of 팩.문항들) {
    for (let s = 0; s < 문항.사유.length; s++) {
      for (let d = 0; d < 문항.세부.length; d++) {
        const 시드 = 팩.시드만들기(문항.문항id, s, d);
        const 펴진 = 팩.펴기(시드);
        const 스냅샷 = G1스냅샷(시드);
        assert.equal(스냅샷.지시문, 펴진.지시문, 시드);
        assert.equal(스냅샷.질문, 펴진.질문, 시드);
        assert.equal(스냅샷.문항판, 펴진.문항판, 시드);
        assert.deepEqual(G1스냅샷(시드), 스냅샷, `같은 시드 = 같은 스냅샷: ${시드}`);
      }
    }
  }
});

test('못 펴는 시드는 null — 지어내지 않는다', () => {
  for (const 시드 of ['g1t99.s0d0', 'g1t01.s9d0', 'g1t01', '', null, undefined, 7]) {
    assert.equal(G1스냅샷(시드), null, String(시드));
  }
});

test('탐지력 — 재료가 빈 팩이면 키를 빼는 게 아니라 스냅샷 자체가 null(규칙 1)', () => {
  const 원문 = fs.readFileSync(팩경로, 'utf8');
  const 비운팩 = 원문.replace('지시문: 채우기(문항.지시문틀),', "지시문: '',");
  assert.notEqual(비운팩, 원문, '픽스처 치환이 실제로 일어났다');
  const 바꾼소스 = new Map([[팩경로, 비운팩]]);
  const 조립기 = 세우기(조립기경로, fetch금지, { 캐시: new Map(), 바꾼소스 });
  assert.equal(조립기.G1스냅샷('g1t01.s0d0'), null,
    '지시문이 빈 채 나가면 「그날 안 보였다」로 읽힌다 — 통째로 거부해야 한다');
});
