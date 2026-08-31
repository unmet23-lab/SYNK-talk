/* 감사회귀 R1B12 — D5-11: 사장님 TTS 가 나는 동안 NPC 가 정지 그림이 아니라 숨을 쉰다.
 *
 * 재는 것(소스층): ① 숨 루프(Animated.loop)가 `읽는중 && !줄임` 게이트 «안»에만 살고,
 * 그 밖 어디서도 만들어지거나 시동되지 않는다 ② 루프의 정리(stop + 원위치)가 게이트의
 * cleanup 에 있다 ③ 숨이 만지는 것은 NPC 래퍼의 transform(scale) 하나뿐 — 숫자·게이지·
 * 상태 어휘·소리·햅틱 회귀(알바변명화면.test.js ⑦·⑪)와 무접촉인 이유가 이 모양이다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 코드만, 구간, 파일소스, 코드만픽스처 } = require('./lib/소스검사.js');

const 소스 = 파일소스(path.join(__dirname, '..', 'src', '알바변명화면.js'));

test('D5-11 — 숨 루프는 읽는중 게이트 안에만 있고, transform(scale) 만 만진다(소스층)', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다');
  const 코드 = 코드만(소스);

  /* 게이트 앵커 자체가 검사다 — 못 찾으면 구간이 던진다(줄임 게이트가 빠지면 여기서 죽는다). */
  const 효과 = 구간(소스, 'if (읽는중 && !줄임) {', '}, [읽는중, 줄임, 숨]);');
  assert.match(효과, /Animated\.loop\(Animated\.sequence\(/, '숨 루프가 읽는중 게이트 안에 없다');
  assert.match(효과, /loop\.start\(\);/, '루프를 만들고 시동을 안 건다 — 정지 그림 그대로다');
  assert.match(효과, /return \(\) => \{ loop\.stop\(\); 숨\.setValue\(1\); \};/,
    '게이트 cleanup 이 루프를 안 걷는다 — TTS 가 끝나도 숨이 계속 돈다');
  assert.match(효과, /\}\s*숨\.setValue\(1\);/,
    '게이트 밖(안 읽는 중·줄임)에서 원위치를 안 세운다 — 마지막 프레임에 걸려 있다');

  /* 루프의 생성·시동은 파일 전체에서 이 게이트 안 하나뿐이다. */
  assert.equal([...코드.matchAll(/Animated\.loop\(/g)].length, 1,
    '숨 루프가 게이트 밖에도 생겼다 — 읽는중이 아닐 때도 숨이 돈다');
  assert.equal([...코드.matchAll(/loop\.start\(\)/g)].length, 1,
    '루프 시동이 한 자리가 아니다');

  /* 숨의 소비처 = NPC 래퍼의 transform(scale) 하나 — style 객체에 다른 키가 없다. */
  assert.equal([...코드.matchAll(/scale: 숨/g)].length, 1, '숨의 scale 소비처가 하나가 아니다');
  const 래퍼 = 구간(소스, '<Animated.View style={{ transform: [{ scale: 숨 }] }}>', '</Animated.View>');
  assert.match(래퍼, /<NPC/, '숨 래퍼가 NPC 를 안 감싼다 — 다른 것이 숨을 쉰다');
  assert.doesNotMatch(래퍼, /opacity|backgroundColor|width|height/,
    '래퍼가 transform 밖의 스타일을 만진다 — D5-11 은 scale 하나다');
});
