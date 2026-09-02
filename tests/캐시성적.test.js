/* 캐시성적 회귀 — 캐싱 눈금의 한 원천(lib/캐시성적.js · 트랙 §1 캐싱 · 09-02).
 *
 * ■ 재는 것 셋: ① 값 눈금(캐시성적·성적합)이 교정 통로가 쓰던 그대로다 ② 교정엔진 의 재수출이 «같은
 *   함수»다(두 벌이면 갈린다) ③ 🔴 «0» 의 세 얼굴 — 호출 0 / usage 없음(무계측) / 읽음이 정말 0 — 이
 *   장부에서도 로그 줄에서도 서로 다른 모양이다. 캐시는 안 걸려도 오류가 없는 자리라, 셋이 같은
 *   모양이면 「걸렸다」의 반대말이 없다(v5 판 80회가 전부 캐시 0 인 채 며칠 지나간 원인). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const 캐시 = require('../lib/캐시성적.js');
const 교정엔진 = require('../lib/교정엔진.js');

test('값 눈금 — 캐시성적·성적합 (usage 없음은 여기서 0 으로 «접힌다» — 세는 자리는 캐시기록이다)', () => {
  const a = 캐시.캐시성적({ input_tokens: 5, cache_creation_input_tokens: 1200 });
  assert.deepEqual(a, { 입력: 5, 캐시생성: 1200, 캐시읽음: 0 });
  assert.deepEqual(캐시.캐시성적(undefined), { 입력: 0, 캐시생성: 0, 캐시읽음: 0 });
  assert.deepEqual(
    캐시.성적합([a, 캐시.캐시성적({ input_tokens: 5, cache_read_input_tokens: 1200 })]),
    { 입력: 10, 캐시생성: 1200, 캐시읽음: 1200 },
  );
  assert.deepEqual(캐시.성적합([]), { 입력: 0, 캐시생성: 0, 캐시읽음: 0 });
});

test('🔴 재수출 — 교정엔진 의 캐시성적·성적합 은 lib/캐시성적 의 «같은 함수»다(호출부 무수정의 근거)', () => {
  assert.equal(교정엔진.캐시성적, 캐시.캐시성적);
  assert.equal(교정엔진.성적합, 캐시.성적합);
});

test('🔴 세 얼굴 — 호출 0 · usage 없음(무계측) · 읽음이 정말 0 이 장부에서 서로 다르다', () => {
  /* ① 안 불렀다 */
  const 안부름 = 캐시.캐시장부();
  assert.deepEqual(안부름, { 호출: 0, 무계측: 0, 입력: 0, 캐시생성: 0, 캐시읽음: 0 });

  /* ② 200 인데 usage 가 없다 — 성적 칸은 안 건드린다(0 을 더하면 ③ 과 같은 얼굴이 된다) */
  const 눈먼것 = 캐시.캐시장부();
  assert.equal(캐시.캐시기록(눈먼것, undefined), '무계측');
  assert.equal(캐시.캐시기록(눈먼것, null), '무계측');
  assert.equal(캐시.캐시기록(눈먼것, 'usage 가 문자열'), '무계측');
  assert.deepEqual(눈먼것, { 호출: 3, 무계측: 3, 입력: 0, 캐시생성: 0, 캐시읽음: 0 });
  assert.equal(캐시.캐시얼굴(undefined), '무계측');

  /* ③ 정말로 안 걸렸다 — v5 판 실측 봉투 그대로(usage 는 있는데 캐시 칸이 0) */
  const 안걸림 = 캐시.캐시장부();
  const 얼굴 = 캐시.캐시기록(안걸림, { input_tokens: 4328, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 159 });
  assert.deepEqual(얼굴, { 입력: 4328, 캐시생성: 0, 캐시읽음: 0 });
  assert.deepEqual(안걸림, { 호출: 1, 무계측: 0, 입력: 4328, 캐시생성: 0, 캐시읽음: 0 });

  /* 걸렸다 — 첫 호출이 쓰고 둘째가 읽는다(회차 안 무늬) */
  const 걸림 = 캐시.캐시장부();
  캐시.캐시기록(걸림, { input_tokens: 120, cache_creation_input_tokens: 4200 });
  캐시.캐시기록(걸림, { input_tokens: 130, cache_read_input_tokens: 4200 });
  assert.deepEqual(걸림, { 호출: 2, 무계측: 0, 입력: 250, 캐시생성: 4200, 캐시읽음: 4200 });

  /* 로그 줄도 넷이 전부 다른 글자다 — 「0」 하나로 접히지 않는다 */
  const 줄들 = [안부름, 눈먼것, 안걸림, 걸림].map(캐시.캐시줄);
  assert.equal(new Set(줄들).size, 4, `얼굴이 겹쳤다: ${줄들.join(' | ')}`);
  assert.match(줄들[0], /호출 0/);
  assert.match(줄들[1], /무계측 3/);
  assert.match(줄들[2], /무계측 0 · 읽음 0/);
  assert.match(줄들[3], /읽음 4200 · 생성 4200/);

  /* 장부 없이 부르면 던진다 — 조용히 새 장부를 만들면 합계가 갈린다 */
  assert.throws(() => 캐시.캐시기록(null, {}), /장부/);
});
