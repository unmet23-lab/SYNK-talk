/* 감사 회귀 R1B17 — D7-1: 나가기 게이트 × 교정 큐.
 *
 * ■ 무엇이 새고 있었나
 *   `저장.못보낸수` 가 제출·게임 두 큐만 세서, 교정 큐(correction_log.jsonl)의 미전송
 *   열람 사건이 「보낸 것은 서버에 그대로 있어요」로 읽히고 `기기비우기` 가 지웠다 —
 *   서버엔 없고 기기에선 지워지니 **어디에도 남지 않는다**(소급 0 · B1 과 같은 모양).
 *
 * ■ 어떻게 재나
 *   `나가기게이트.test.js` :31-47 과 같은 무늬 — 웹 메모리 모드 실행(화면세우기 로더로
 *   react-native 사슬을 연다). 탐지력: 옛 셈(제출+게임)이 0 을 내는 픽스처에서
 *   새 통로가 1 을 낸다 — 결함 모양이 실제로 갈린다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { ROOT } = require('./lib/화면세우기.js'); // require 훅 설치 — react-native 사슬이 열린다
const { 밀린것 } = require('../lib/제출로그.js');

const 저장 = require(path.join(ROOT, 'src', '저장.js'));

/* 미전송 항목 — id·event_id·send_final 칸 규약이 세 큐에 같다(`lib/교정로그.js` :32 재수출). */
const 미전송 = (id) => ({ id, event_id: null, send_error: null, send_final: false });

test('🔴 교정 큐에만 밀린 것이 있어도 게이트 수에 잡힌다 — 옛 셈(제출+게임)은 0 을 냈다(D7-1)', async () => {
  await 저장.로그쓰기([]);
  await 저장.게임로그쓰기([]);
  await 저장.교정로그쓰기([미전송('correction.viewed:C-1')]);
  try {
    /* 탐지력 짝 — 옛 셈이 이 픽스처에서 실제로 0 을 낸다(그래서 이 픽스처가 결함을 가른다). */
    assert.equal(
      밀린것((await 저장.로그읽기()).로그).length + 밀린것((await 저장.게임로그읽기()).로그).length,
      0,
      '픽스처가 낡았다 — 제출·게임 큐가 비어 있어야 옛 셈과 갈린다',
    );
    assert.equal(await 저장.못보낸수(), 1,
      '교정 큐의 미전송 사건이 게이트 수에 없다 — 「보낸 것은 서버에 있어요」가 거짓이 되고 지워진다');
  } finally {
    await 저장.교정로그쓰기([]);
  }
});
