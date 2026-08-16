'use strict';
/* sha256 순수 구현 — **node:crypto 와 값이 같은가**만 잰다.
 *
 * 🔴 이 대조가 `lib/sha256.js` 의 유일한 존재 근거다. 해시는 틀려도 그럴듯한 값이 나오고
 *   결정적이기까지 해서, 「같은 입력 = 같은 출력」류 검사는 **틀린 구현도 통과시킨다.**
 *   그래서 성질이 아니라 **값**을 표준 구현과 맞댄다.
 *
 * ⚠ 이 검사는 Node 에서만 돈다(앱에는 node:crypto 가 없다). 그건 한계가 아니라 설계다 —
 *   여기서 값이 같음을 못박으면, 앱에서 도는 순수 구현도 같은 값을 낸다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { 바이트, hex, 앞정수BE } = require('../lib/sha256.js');
const { 코드만 } = require('./lib/소스검사.js');   // 주석 벗기기 공용 통로(지역 사본 금지)

const 표준 = (s) => crypto.createHash('sha256').update(s).digest();

/* 경계를 노린 입력들 — 블록 길이(64)·패딩 경계(55·56)·빈 문자열·비ASCII·긴 것.
 * 55/56 이 급소다: 56바이트부터 패딩이 «한 블록 더»를 요구하는데, 그 자리를 틀리면
 * 짧은 입력은 전부 맞고 긴 입력만 갈라진다. */
const 입력들 = [
  '',
  'a',
  'abc',
  'r-1',
  'radio-round.v1',
  '자막카드:2026-08-16',
  '채널1:2026-08-16T09:00',
  'x'.repeat(55),
  'x'.repeat(56),
  'x'.repeat(63),
  'x'.repeat(64),
  'x'.repeat(65),
  'x'.repeat(1000),
  '한글'.repeat(100),
  JSON.stringify({ 문항id: 'q-1', skill_ids: ['s1', 's2'], 씨앗: '채널:라운드' }),
];

test('hex 가 node:crypto 와 한 글자도 다르지 않다', () => {
  for (const s of 입력들) {
    assert.equal(hex(s), 표준(s).toString('hex'), `갈라졌다: ${JSON.stringify(s.slice(0, 30))}`);
  }
});

test('바이트가 node:crypto 와 바이트 단위로 같다', () => {
  for (const s of 입력들) {
    assert.deepEqual(Buffer.from(바이트(s)), 표준(s), `갈라졌다: ${JSON.stringify(s.slice(0, 30))}`);
  }
});

test('앞정수BE 가 Buffer.readUIntBE 와 같다 (눈금이 쓰는 그 자리)', () => {
  for (const s of 입력들) {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      assert.equal(앞정수BE(s, n), 표준(s).readUIntBE(0, n), `n=${n} 에서 갈라졌다: ${s.slice(0, 20)}`);
    }
  }
});

test('7바이트 이상은 거절한다 — 2^53 을 넘으면 조용히 정밀도가 깨진다', () => {
  assert.throws(() => 앞정수BE('a', 7), RangeError);
  assert.throws(() => 앞정수BE('a', 0), RangeError);
});

test('lib 어디에도 node:crypto 가 남아 있지 않다 — 앱 번들이 다시 깨지는 자리다', () => {
  /* 🔑 이것이 「release 번들이 안 구워진다」를 재는 층이다. 저장소에 그 층이 없어서
   *   08-15 에 들어온 `require('node:crypto')` 가 회귀 145벌 초록 아래 살아 있었다.
   *   앱이 무는 lib 만 본다 — 서버 전용 파일(supabase/·tools/)은 node:crypto 를 써도 된다. */
  const fs = require('node:fs');
  const path = require('node:path');
  const libDir = path.join(__dirname, '..', 'lib');
  const 샌것 = [];
  for (const f of fs.readdirSync(libDir)) {
    if (!f.endsWith('.js')) continue;
    const 원문 = fs.readFileSync(path.join(libDir, f), 'utf8');
    /* 주석을 «먼저 벗긴다» — 안 벗기면 이 결함을 설명하는 주석 자신이 걸려서, 고친 파일도
     * 영원히 빨갛다(첫 판이 실제로 그랬다). 검사는 실행되는 줄만 봐야 한다.
     * 🔑 벗기기는 **공용 통로 하나**를 쓴다 — 지역 사본을 두면 문자열 속 `//` 같은 자리에서
     *   갈라지고, `tests/주석제거통로.test.js` 가 그 사본을 기계로 막는다. */
    if (/(?:require\(\s*['"]node:crypto['"]|from\s+['"]node:crypto['"])/.test(코드만(원문))) 샌것.push(f);
  }
  assert.deepEqual(샌것, [],
    `lib/ 가 node:crypto 를 물면 Metro 가 release 번들을 못 만든다: ${샌것.join(', ')}`);
});
