'use strict';
/* 녹음 복구 판정 회귀 (G2-2 · lib/녹음복구.js).
 *
 * 지키는 것 하나: 「담겼는데 보내기 전에 죽은」 그날의 발화만 되살린다.
 * 새는 방향이 둘 다 나쁘다 — 어제 것을 오늘 과제에 실으면 남의 날 행이 되고(과잉),
 * 그날 것을 못 세우면 학생 목소리가 기기에서 조용히 썩는다(과소). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { 복구후보 } = require('../lib/녹음복구.js');
const { 코드만 } = require('./lib/소스검사.js');

const 오늘 = '2026-08-31';
const 메타 = (덮기 = {}) => ({
  date: 오늘, step: '따라1', uri: 'file:///r/임시-따라1.wav',
  duration_ms: 4200, hesitation_ms: 800, spoke: true, ...덮기,
});
/* 학습출석의 자 = 답하기 submitted (lib/제출로그.js) — 그 모양 그대로 픽스처를 짓는다. */
const 낸로그 = [{ date: 오늘, step: '답하기', status: 'submitted' }];

test('복구후보: 그날 것 + 발화 있음 + 오늘 미제출이면 참', () => {
  assert.equal(복구후보(메타(), 오늘, []), true);
  // 다른 걸음의 어제 제출이 있어도 「오늘 미제출」은 그대로다.
  assert.equal(복구후보(메타(), 오늘, [{ date: '2026-08-30', step: '답하기', status: 'submitted' }]), true);
});

test('복구후보: 어제 메타는 안 세운다 — 어제 발화를 오늘 과제에 실으면 남의 날 행이 된다', () => {
  assert.equal(복구후보(메타({ date: '2026-08-30' }), 오늘, []), false);
});

test('복구후보: 이미 낸 날은 안 세운다 — 이중 제출의 문이다', () => {
  assert.equal(복구후보(메타(), 오늘, 낸로그), false);
});

test('복구후보: 무발화(spoke=false)는 되살릴 값이 없다 — 그 신호는 로그가 이미 안다', () => {
  assert.equal(복구후보(메타({ spoke: false }), 오늘, []), false);
});

test('복구후보: 메타가 없거나 깨졌으면(uri 없음) 조용히 현행이다', () => {
  assert.equal(복구후보(null, 오늘, []), false);
  assert.equal(복구후보({}, 오늘, []), false);
  assert.equal(복구후보(메타({ uri: null }), 오늘, []), false);
  assert.equal(복구후보(메타(), '', []), false, '오늘을 모르면 판정하지 않는다');
  assert.equal(복구후보(메타(), 오늘, undefined), true,
    '로그가 없으면(마운트 초입) 빈 로그로 접는다 — 던지면 화면이 죽는다');
});

/* ── 배선(소스층) — 판정만 재면 화면이 안 부르는 상태가 완전히 초록이다 ────────── */

test('배선: 끝()이 파일을 앉힌 직후 메타를 남기고, 남기기가 로그 기록 뒤 메타를 지운다', () => {
  const 소스 = 코드만(fs.readFileSync(path.join(__dirname, '..', 'src', '말하기화면.js'), 'utf8'));
  assert.match(소스, /임시녹음메타쓰기\(\{ date, step, uri, duration_ms, hesitation_ms: r\.머뭇거림_ms, spoke: r\.발화있음 \}\)/,
    '끝()이 복구 단서를 안 남긴다 — 보내기 전에 죽은 발화가 영영 사라진다');
  assert.match(소스, /임시녹음메타지우기\(\)\.catch\(\(\) => \{\}\)/,
    '남긴 시도의 단서가 안 지워진다 — 이미 적힌 시도를 「보낼까요?」로 되묻는다');
  assert.match(소스, /복구후보\(임시메타, 그날, 기록\)/,
    '마운트가 복구후보 판정을 안 지난다 — 화면 안에 조건을 다시 적으면 이 회귀가 자정을 못 만든다');
});

test('배선: 복구 카드의 두 문 — 들어보고 정하기(바이트 복원→확인 카드) · 새로 말하기(단서 소각)', () => {
  const 소스 = 코드만(fs.readFileSync(path.join(__dirname, '..', 'src', '말하기화면.js'), 'utf8'));
  assert.match(소스, /음성바이트읽기\(메타\.uri\)/, '되살릴 바이트를 파일에서 안 읽는다 — 확인 카드의 보내기가 빈손이 된다');
  assert.match(소스, /초기녹음=\{복구녹음 && 복구녹음\.step === 이번걸음 \? 복구녹음 : null\}/,
    '②따라 카드에 복구 녹음이 안 실린다');
  assert.match(소스, /초기녹음=\{복구녹음 && 복구녹음\.step === '답하기' \? 복구녹음 : null\}/,
    '③답하기 카드에 복구 녹음이 안 실린다');
  assert.match(소스, /useState\(초기녹음 \? '확인' : '대기'\)/,
    '복구된 시도가 확인 카드에서 시작하지 않는다 — 들어보기·다시 말하기·보내기가 안 산다');
});
