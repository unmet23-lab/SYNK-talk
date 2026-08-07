/* lib/wav조립.js — 앱이 마이크 PCM 에 RIFF 를 씌운다(소급 불가 배선 ① · C0 §4-2).
 *
 * 이 회귀가 지는 것: **쓰는 쪽과 읽는 쪽이 같은 파일을 같은 것으로 본다.** 헤더는 사람이 눈으로
 * 검사할 수 없고, 틀려도 파일은 열리며 소리도 (엉뚱하게) 난다 — 틀린 헤더는 조용하다.
 * 그래서 픽스처로 바이트를 박제하는 대신 **서버가 실제로 쓰는 파서**(`lib/음성헤더.js`)에
 * 되먹여 잰다. 한쪽이 갈라지면 그 순간 빨개진다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { wav조립, 헤더바이트 } = require('../lib/wav조립.js');
const { 정본, 헤더읽기 } = require('../lib/음성헤더.js');

/** 정본 규격 1초치 무음 PCM(16kHz·mono·16bit = 32,000바이트). */
const 무음 = (프레임) => new Uint8Array(프레임 * 2);

const 읽기 = (r) => 헤더읽기(r.바이트, r.바이트.length);

test('정본 규격으로 조립하면 서버 파서가 위반 0 으로 읽는다', () => {
  const r = wav조립({ 조각들: [무음(16000)], sample_rate: 16000, channels: 1, bit_depth: 16 });
  const 잰것 = 읽기(r);

  assert.strictEqual(잰것.codec, 정본.codec);
  assert.strictEqual(잰것.sample_rate, 정본.sample_rate);
  assert.strictEqual(잰것.bit_depth, 정본.bit_depth);
  assert.strictEqual(잰것.channels, 정본.channels);
  assert.deepStrictEqual(잰것.spec_violations, []);
  assert.strictEqual(잰것.duration_ms, 1000);
  assert.strictEqual(r.duration_ms, 1000);
});

/* 🔴 기기가 16kHz 를 못 주면 네이티브가 조용히 48kHz 로 되돌린다(AudioStream.kt 폴백).
 * 그때 헤더에 요청값 16000 을 적으면 규격 위반이 **영영 안 보인다** — 실제 값이 박혀야
 * 서버가 행마다 센다. 이 검사가 그 방향을 지킨다. */
test('스트림이 폴백한 값 그대로 박히고, 서버가 그것을 위반으로 센다', () => {
  const r = wav조립({ 조각들: [무음(9600)], sample_rate: 48000, channels: 2, bit_depth: 16 });
  const 잰것 = 읽기(r);

  assert.strictEqual(잰것.sample_rate, 48000);
  assert.strictEqual(잰것.channels, 2);
  assert.ok(잰것.spec_violations.includes('sample_rate:48000'));
  assert.ok(잰것.spec_violations.includes('channels:2'));
  assert.ok(!잰것.spec_violations.includes('truncated')); // 길이는 멀쩡하다 — 규격만 밖이다
});

test('PCM 이 헤더 뒤에 한 바이트도 안 바뀌고 순서대로 들어간다', () => {
  const a = Uint8Array.from([1, 2, 3, 4]);
  const b = Uint8Array.from([5, 6, 7, 8]);
  const r = wav조립({ 조각들: [a, b], sample_rate: 16000, channels: 1, bit_depth: 16 });

  assert.strictEqual(r.바이트.length, 헤더바이트 + 8);
  assert.deepStrictEqual(Array.from(r.바이트.subarray(헤더바이트)), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.strictEqual(r.버린바이트, 0);
});

/* 반쪽 표본을 남기면 그 뒤 바이트가 한 칸 밀려 소리가 잡음이 되는데 **파일은 멀쩡해 보인다.** */
test('프레임을 못 채운 꼬리는 버리고, 버린 양을 숨기지 않는다', () => {
  const r = wav조립({ 조각들: [Uint8Array.from([1, 2, 3])], sample_rate: 16000, channels: 1, bit_depth: 16 });

  assert.strictEqual(r.버린바이트, 1);
  assert.strictEqual(r.프레임수, 1);
  assert.strictEqual(r.바이트.length, 헤더바이트 + 2);
  assert.deepStrictEqual(읽기(r).spec_violations, []); // 잘림이 규격 위반으로 새지 않는다
});

test('스트림이 주는 ArrayBuffer 를 그대로 받는다', () => {
  const ab = new ArrayBuffer(4);
  new Uint8Array(ab).set([9, 9, 9, 9]);
  const r = wav조립({ 조각들: [ab], sample_rate: 16000, channels: 1, bit_depth: 16 });

  assert.deepStrictEqual(Array.from(r.바이트.subarray(헤더바이트)), [9, 9, 9, 9]);
});

/* 값을 모를 때 기본값으로 때우면 그 파일은 **자기가 무엇인지 거짓말하는 원본**이 된다.
 * 던지면 화면에 사유가 서고(말하기화면 `막힘`), 조용히 오염되는 것보다 싸다. */
test('규격을 모르면 던진다 — 추측한 헤더를 쓰지 않는다', () => {
  const 조각들 = [무음(100)];
  assert.throws(() => wav조립({ 조각들, sample_rate: null, channels: 1 }), /규격을 모르는/);
  assert.throws(() => wav조립({ 조각들, sample_rate: 16000, channels: 0 }), /규격을 모르는/);
  assert.throws(() => wav조립({ 조각들, sample_rate: 16000, channels: 1, bit_depth: 12 }), /규격을 모르는/);
});

test('조각이 하나도 없어도 읽히는 빈 WAV 가 나온다 — 규격은 그대로다', () => {
  const r = wav조립({ 조각들: [], sample_rate: 16000, channels: 1, bit_depth: 16 });

  assert.strictEqual(r.바이트.length, 헤더바이트);
  assert.strictEqual(r.duration_ms, 0);
  assert.deepStrictEqual(읽기(r).spec_violations, []);
});
