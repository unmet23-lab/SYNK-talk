/* 나가기 게이트 회귀 — 「지우기 전에 **모든 큐**를 센다」(적대 리뷰 B1).
 *
 * ■ 무엇이 새고 있었나
 *   `도착확인.물어보기` 가 talk_log 만 세서, 게임 큐(game_log.jsonl)의 미전송 메일이
 *   「보낸 것은 서버에 그대로 있어요」로 읽히고 `기기비우기` 가 지웠다 — 서버엔 없고
 *   기기에선 지워지니 **어디에도 남지 않는다**(소급 0).
 *
 * ■ 층 둘로 잰다
 *   ① 행동 — `저장.못보낸수` 가 두 큐를 실제로 합산한다(웹 메모리 모드 실행 · 화면세우기
 *      로더로 react-native 사슬을 연다). 탐지력: 옛 셈(talk 만)이 0 을 내는 픽스처에서
 *      새 통로가 1 을 낸다 — 결함 모양이 실제로 갈린다.
 *   ② 등록층 — 게이트(도착확인)가 그 통로를 실제로 부른다(`물어보기` 는 핸들러라 첫 렌더가
 *      못 돈다 — 화면렌더 ⑩ 과 같은 판정).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./lib/화면세우기.js'); // require 훅 설치 — react-native 사슬이 열린다
const { 코드만, 코드만픽스처 } = require('./lib/소스검사.js');
const { 밀린것 } = require('../lib/제출로그.js');

const 저장 = require(path.join(ROOT, 'src', '저장.js'));

/* 미전송 항목 — event_id 없음 · send_final 아님(두 큐가 같은 칸 규약을 쓴다). */
const 미전송 = (id) => ({ id, event_id: null, send_error: null, send_final: false });
const 닿은것 = (id) => ({ id, event_id: 'E-1', send_error: null, send_final: false });

test('🔴 게임 큐에만 밀린 것이 있어도 게이트 수에 잡힌다 — 옛 셈(talk만)은 0 을 냈다(B1 그 자리)', async () => {
  await 저장.로그쓰기([]);
  await 저장.게임로그쓰기([미전송('mail:s1')]);
  /* 탐지력 짝 — 옛 게이트의 셈이 이 픽스처에서 실제로 0 을 낸다(그래서 이 픽스처가 결함을 가른다). */
  assert.equal(밀린것((await 저장.로그읽기()).로그).length, 0, '픽스처가 낡았다 — talk 큐가 비어 있어야 옛 셈과 갈린다');
  assert.equal(await 저장.못보낸수(), 1,
    '게임 큐의 미전송 메일이 게이트 수에 없다 — 「보낸 것은 서버에 있어요」가 거짓이 되고 지워진다');
});

test('두 큐를 합산하고, 닿은 것·영구 실패는 안 센다', async () => {
  await 저장.로그쓰기([미전송('2026-08-11-답하기-1'), 닿은것('2026-08-11-따라-1')]);
  await 저장.게임로그쓰기([미전송('mail:s1'), { id: 'choice:s1', event_id: null, send_final: true }]);
  assert.equal(await 저장.못보낸수(), 2, '합산이 틀렸다 — 미전송(재시도 가치 있음)만 세야 한다');
  await 저장.로그쓰기([]);
  await 저장.게임로그쓰기([]);
  assert.equal(await 저장.못보낸수(), 0);
});

test('등록층 — 도착확인 게이트가 못보낸수 통로를 부르고, 큐를 낱낱이 다시 세지 않는다', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다');
  const 소스 = 코드만(fs.readFileSync(path.join(ROOT, 'src', '도착확인.js'), 'utf8'));
  assert.match(소스, /set확인\(await 못보낸수\(\)\)/,
    '게이트가 합산 통로를 안 쓴다 — 낱낱이 세면 새 큐가 생길 때 게이트만 모른다');
  assert.ok(!/밀린것\(/.test(소스), '게이트가 큐를 직접 센다 — 그 셈이 새 큐를 모르는 것이 B1 이었다');
  assert.ok(!/로그읽기/.test(소스), '게이트가 로그를 직접 읽는다 — 세는 통로는 못보낸수 하나다');
});

test('문구 — 합산 수를 「발화」라고 부르지 않는다(게임 메일·고름도 세는 수다)', () => {
  /* 문구 검사도 **코드만** 본다 — 위 :51 과 같은 통로다. 원문으로 재면 옛 문구를 설명하는
     주석 한 줄에 거짓 적색이 나고(「예전엔 「보내지 못한 발화가」였다」), 반대로 카드 머리가
     주석에만 남아도 초록이 된다. 둘 다 이 검사가 겨눈 것이 아니다. */
  const 코드 = 코드만(fs.readFileSync(path.join(ROOT, 'src', '도착확인.js'), 'utf8'));
  assert.match(코드, /아직 보내지 못한 것이/, '카드 머리가 없다 — 문구를 바꿨으면 이 검사도 같이');
  assert.ok(!/보내지 못한 발화가/.test(코드), '「발화」 문구가 남았다 — 이제 이 수는 발화만이 아니다');
});
