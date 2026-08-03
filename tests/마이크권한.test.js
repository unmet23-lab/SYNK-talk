'use strict';
/**
 * 마이크 권한 회귀 — 「언제 묻는가」와 「거절당했을 때 무엇이 보이는가」를 못박는다.
 *
 * 왜 회귀가 필요한가: 이 규칙은 코드를 읽어도 위반이 눈에 띄지 않는다.
 * 화면 어딘가에서 오디오 모드만 미리 켜도 iOS는 그 순간 권한 창을 띄우고,
 * 그러면 「버튼 누를 때 묻는다」는 결정이 조용히 원위치된다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 마이크준비, 마이크끄기, 거절_메시지 } = require('../lib/마이크권한.js');

const 승인 = { granted: true, canAskAgain: true };
const 거절 = { granted: false, canAskAgain: false };

function 스파이(결과) {
  const 호출 = [];
  const fn = async (인자) => {
    호출.push(인자);
    if (결과 instanceof Error) throw 결과;
    return 결과;
  };
  fn.호출 = 호출;
  return fn;
}

// ── 승인 경로 ────────────────────────────────────────────────

test('승인이면 녹음 모드를 켜고 ok', async () => {
  const 모드 = 스파이();
  const r = await 마이크준비({ 권한요청: async () => 승인, 오디오모드: 모드 });
  assert.equal(r.ok, true);
  assert.equal(모드.호출.length, 1);
  assert.equal(모드.호출[0].allowsRecording, true);
  assert.equal(모드.호출[0].playsInSilentMode, true);
});

// ── 거절 경로 (여기가 핵심) ──────────────────────────────────

test('거절이면 오디오 모드를 건드리지 않는다 — 켜봐야 권한 창만 또 뜬다', async () => {
  const 모드 = 스파이();
  const r = await 마이크준비({ 권한요청: async () => 거절, 오디오모드: 모드 });
  assert.equal(r.ok, false);
  assert.equal(모드.호출.length, 0);
});

test('거절 메시지는 어디서 푸는지까지 말한다', async () => {
  const r = await 마이크준비({ 권한요청: async () => 거절, 오디오모드: 스파이() });
  assert.equal(r.메시지, 거절_메시지);
  assert.match(r.메시지, /설정/); // 「안 돼요」로 끝나면 학생은 다음 행동을 모른다
  assert.equal(r.재요청가능, false);
});

test('권한 응답이 없어도(undefined) 승인으로 치지 않는다', async () => {
  const 모드 = 스파이();
  const r = await 마이크준비({ 권한요청: async () => undefined, 오디오모드: 모드 });
  assert.equal(r.ok, false);
  assert.equal(모드.호출.length, 0);
});

// ── 실패는 예외가 아니라 글자로 돌아온다 ─────────────────────

test('권한 요청이 던져도 화면 밖으로 새지 않는다', async () => {
  const r = await 마이크준비({
    권한요청: async () => {
      throw new Error('mic busy');
    },
    오디오모드: 스파이(),
  });
  assert.equal(r.ok, false);
  assert.match(r.메시지, /mic busy/);
});

test('오디오 모드 전환이 던지면 ok=false', async () => {
  const r = await 마이크준비({ 권한요청: async () => 승인, 오디오모드: 스파이(new Error('세션 실패')) });
  assert.equal(r.ok, false);
  assert.match(r.메시지, /세션 실패/);
});

// ── 녹음 후 되돌리기 ─────────────────────────────────────────

test('마이크끄기는 녹음 모드를 내린다', async () => {
  const 모드 = 스파이();
  const r = await 마이크끄기({ 오디오모드: 모드 });
  assert.equal(r.ok, true);
  assert.equal(모드.호출[0].allowsRecording, false);
});

test('마이크끄기가 실패해도 던지지 않는다 — 흐름을 막을 이유가 없다', async () => {
  const r = await 마이크끄기({ 오디오모드: 스파이(new Error('x')) });
  assert.equal(r.ok, false);
});

// ── 통로 검사 ────────────────────────────────────────────────
// 한계를 알고 쓴다: 이건 「녹음 모드를 켜는 자리가 하나뿐인가」만 본다.
// 마운트 시점 호출 여부 자체는 RN 렌더러 없이는 못 재므로 여기서 증명하지 않는다.

test('화면은 녹음 모드를 직접 켜지 않는다 — 통로는 lib/마이크권한.js 하나', () => {
  const 화면 = fs.readFileSync(path.join(__dirname, '..', 'src', '말하기화면.js'), 'utf8');
  assert.equal(
    화면.includes('allowsRecording'),
    false,
    '화면에서 allowsRecording을 직접 켜면 「버튼 누를 때 묻는다」가 깨진다 — 마이크준비()를 쓸 것'
  );
});

// ── 권한 문구(iOS) ───────────────────────────────────────────

test('app.json: 마이크 권한 문구가 expo 기본 영문이 아니고 한/몽 병기다', () => {
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  const 항목 = app.expo.plugins.find((p) => p === 'expo-audio' || (Array.isArray(p) && p[0] === 'expo-audio'));
  assert.ok(항목, 'expo-audio 플러그인이 없다');
  assert.ok(Array.isArray(항목), '문자열 한 줄이면 expo 기본 영문 문구가 그대로 나간다');

  const 문구 = 항목[1] && 항목[1].microphonePermission;
  assert.ok(문구, 'microphonePermission이 비어 있다');
  assert.equal(문구.includes('Allow'), false, 'expo 기본 영문 문구가 남아 있다');
  assert.match(문구, /[가-힣]/, '한국어가 없다');
  assert.match(문구, /[Ѐ-ӿ]/, '몽골어(키릴)가 없다 — 가장 민감한 순간에 학생이 못 읽는다');
});
