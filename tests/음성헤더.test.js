/* lib/음성헤더.js — C0 §4-2 「서버가 파일 헤더에서 실제 값을 파생해 저장한다」.
 *
 * 이 회귀가 지는 것: **규격이 관측값으로 남는 것.** 앱 프리셋이 조용히 바뀌면 그 뒤 녹음이
 * 전량 오염되는데 증상이 없다 — 유일한 방어선이 행마다 붙는 이 측정이다. 그래서 여기서 재는 것은
 * 「파서가 안 죽는가」가 아니라 **「규격 밖을 실제로 규격 밖이라고 적는가」**(그리고 그 반대편,
 * 멀쩡한 녹음을 위반으로 세지 않는가 — 오탐은 진짜 오염을 소음에 묻는다)다.
 *
 * 픽스처는 전부 **여기서 조립한다.** 실파일에 기대면 탐지력이 그 파일의 존재에 걸리고,
 * CI 에는 녹음이 없다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { 정본, 헤더읽기, 길이초, 파일없음 } = require('../lib/음성헤더.js');

const EVENTS = fs.readFileSync(path.resolve(__dirname, '..', 'supabase', 'functions', 'events', 'index.ts'), 'utf8');

/* 2026-08-07 리허설에서 **실제로 받은** 본문 그대로. 지어낸 문자열로 재면 다음에 형식이 바뀌어도
 * 회귀는 계속 초록이다 — 픽스처는 실측을 박제하는 자리다. */
const 없음본문 = '{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}';

const 청크 = (id, 본문) => {
  const h = Buffer.alloc(8);
  h.write(id, 0, 'ascii');
  h.writeUInt32LE(본문.length, 4);
  return Buffer.concat([h, 본문, 본문.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};
const 데이터머리 = (선언크기) => {
  const h = Buffer.alloc(8);
  h.write('data', 0, 'ascii');
  h.writeUInt32LE(선언크기, 4);
  return h;
};

/** 진짜 WAV 를 조립한다 — `data` 본문은 붙이지 않는다(앞머리만 읽는 것이 구현의 전제다). */
function wav(opt = {}) {
  const {
    포맷 = 1, 채널 = 1, 레이트 = 16000, 비트 = 16,
    실제데이터 = 32000, 선언데이터 = null, 앞청크 = null, 서브포맷 = null, fmt생략 = false,
  } = opt;

  const fmt = Buffer.alloc(서브포맷 == null ? 16 : 40);
  fmt.writeUInt16LE(포맷, 0);
  fmt.writeUInt16LE(채널, 2);
  fmt.writeUInt32LE(레이트, 4);
  fmt.writeUInt32LE(레이트 * 채널 * (비트 / 8), 8);   // byteRate
  fmt.writeUInt16LE(채널 * (비트 / 8), 12);           // blockAlign
  fmt.writeUInt16LE(비트, 14);
  if (서브포맷 != null) {
    fmt.writeUInt16LE(22, 16);        // cbSize
    fmt.writeUInt16LE(비트, 18);      // validBitsPerSample
    fmt.writeUInt32LE(3, 20);         // channelMask
    fmt.writeUInt16LE(서브포맷, 24);  // SubFormat GUID 의 앞 2바이트 = 진짜 포맷
  }

  const 머리 = Buffer.alloc(12);
  머리.write('RIFF', 0, 'ascii');
  머리.write('WAVE', 8, 'ascii');

  const 조각 = [머리];
  if (앞청크) 조각.push(청크(앞청크[0], Buffer.from(앞청크[1])));
  if (!fmt생략) 조각.push(청크('fmt ', fmt));
  조각.push(데이터머리(선언데이터 == null ? 실제데이터 : 선언데이터));

  const 앞 = Buffer.concat(조각);
  return { 앞머리: new Uint8Array(앞), 전체: 앞.length + 실제데이터 };
}

test('정본 규격 그대로면 위반이 하나도 없다', () => {
  const { 앞머리, 전체 } = wav();
  const r = 헤더읽기(앞머리, 전체);
  assert.deepStrictEqual(r.spec_violations, [], '멀쩡한 녹음을 위반으로 세면 진짜 오염이 소음에 묻힌다');
  assert.strictEqual(r.codec, 정본.codec);
  assert.strictEqual(r.sample_rate, 16000);
  assert.strictEqual(r.bit_depth, 16);
  assert.strictEqual(r.channels, 1);
});

test('duration 은 데이터 크기로 잰다 — 16k·16bit·mono 32000B = 1초', () => {
  const { 앞머리, 전체 } = wav({ 실제데이터: 32000 });
  assert.strictEqual(헤더읽기(앞머리, 전체).duration_ms, 1000);
});

test('🔴 규격 밖은 값 그대로 적힌다 — 44.1k·스테레오·8bit', () => {
  const { 앞머리, 전체 } = wav({ 레이트: 44100, 채널: 2, 비트: 8 });
  const r = 헤더읽기(앞머리, 전체);
  assert.strictEqual(r.sample_rate, 44100);
  assert.strictEqual(r.channels, 2);
  assert.strictEqual(r.bit_depth, 8);
  for (const 기대 of ['sample_rate:44100', 'channels:2', 'bit_depth:8']) {
    assert.ok(r.spec_violations.includes(기대), `${기대} 가 안 적혔다 — ${JSON.stringify(r.spec_violations)}`);
  }
});

test('🔴 m4a(Expo 기본 프리셋)를 무엇인지 적는다 — 그리고 모르는 칸은 지어내지 않는다', () => {
  const b = Buffer.alloc(32);
  b.write('ftyp', 4, 'ascii');
  b.write('M4A ', 8, 'ascii');
  const r = 헤더읽기(new Uint8Array(b), 32);
  assert.strictEqual(r.codec, 'm4a');
  assert.ok(r.spec_violations.includes('codec:m4a'));
  // 🔑 MP4 박스를 파지 않는다 — 대신 **0 이나 추정값을 적지 않는다**(틀린 관측이 영구히 쌓인다).
  assert.strictEqual(r.sample_rate, null);
  assert.strictEqual(r.bit_depth, null);
  assert.strictEqual(r.channels, null);
});

test('탐지력 — 앞에 LIST 청크가 끼어도 fmt 를 찾는다(고정 44바이트 파서면 여기서 죽는다)', () => {
  const { 앞머리, 전체 } = wav({ 앞청크: ['LIST', 'INFOISFT-recorder'] });
  const r = 헤더읽기(앞머리, 전체);
  assert.deepStrictEqual(r.spec_violations, [], '엉뚱한 바이트를 fmt 로 읽었다');
  assert.strictEqual(r.sample_rate, 16000);
});

test('🔴 EXTENSIBLE(0xFFFE) PCM 을 규격 위반으로 세지 않는다 — 오탐이 가짜 신호를 만든다', () => {
  const { 앞머리, 전체 } = wav({ 포맷: 0xfffe, 서브포맷: 1 });
  const r = 헤더읽기(앞머리, 전체);
  assert.strictEqual(r.codec, 'pcm_wav');
  assert.deepStrictEqual(r.spec_violations, []);
});

test('🔴 길이 불일치 — 선언보다 파일이 짧으면 잘림으로 적고 실제 길이를 쓴다', () => {
  const { 앞머리, 전체 } = wav({ 실제데이터: 16000, 선언데이터: 32000 });
  const r = 헤더읽기(앞머리, 전체);
  assert.ok(r.spec_violations.includes('truncated'), '녹음이 끊긴 것을 못 잡았다');
  assert.strictEqual(r.duration_ms, 500, '없는 초를 가진 행이 남으면 「전사 실패」와 구분되지 않는다');
  assert.strictEqual(r.declared_duration_ms, 1000, '헤더가 뭐라 했는지도 남긴다');
});

test('전체 크기를 모르면 잘림 검사를 건너뛴다 — 모른다고 위반으로 적지 않는다', () => {
  const { 앞머리 } = wav({ 실제데이터: 16000, 선언데이터: 32000 });
  const r = 헤더읽기(앞머리, null);
  assert.ok(!r.spec_violations.includes('truncated'));
  assert.strictEqual(r.duration_ms, 1000);
});

test('읽을 수 없으면 unparsable — 조용히 「정상」이 되지 않는다', () => {
  assert.deepStrictEqual(헤더읽기(new Uint8Array([1, 2, 3]), 3).spec_violations, ['unparsable']);

  const { 앞머리, 전체 } = wav({ fmt생략: true });
  const r = 헤더읽기(앞머리, 전체);
  assert.strictEqual(r.codec, 'wav');
  assert.deepStrictEqual(r.spec_violations, ['unparsable']);
  assert.strictEqual(r.sample_rate, null, '못 읽었는데 값이 들어갔다');
});

test('망가진 청크 크기(0)에서 멈춘다 — 무한루프도 엉뚱한 값도 아니다', () => {
  const 머리 = Buffer.alloc(12);
  머리.write('RIFF', 0, 'ascii');
  머리.write('WAVE', 8, 'ascii');
  const 빈청크 = Buffer.alloc(8);
  빈청크.write('junk', 0, 'ascii');            // size = 0
  const r = 헤더읽기(new Uint8Array(Buffer.concat([머리, 빈청크])), 20);
  assert.deepStrictEqual(r.spec_violations, ['unparsable']);
});

/* ── 파일 없음 판정 ────────────────────────────────────────────────────────
 * 🔴 이 검사가 있는 이유가 실사고다: 초판은 `r.status === 404` 만 봤고, 리허설 왕복이
 *   **「파일 없음」을 「일시 실패」로 적고 있는 것**을 잡았다. 상태 코드만으로는 안 갈린다. */
test('🔴 없는 객체는 400 으로 온다 — 404 는 본문 안에만 있다(실측 픽스처)', () => {
  assert.strictEqual(파일없음(400, 없음본문), true,
    '상태 코드만 보면 「파일 없음」이 「일시 실패」에 섞이고, ingest 시점에 못 박는 능력이 사라진다');
  assert.strictEqual(파일없음(404, ''), true, '진짜 404 도 없는 것이다');
});

test('🔴 400 밖은 「없다」로 접지 않는다 — 살아 있는 파일을 사라졌다고 적지 않는다', () => {
  assert.strictEqual(파일없음(403, 없음본문), false, '권한 실패를 「없음」으로 적으면 반대 방향의 거짓말이다');
  assert.strictEqual(파일없음(500, 없음본문), false);
  assert.strictEqual(파일없음(400, '{"error":"invalid_jwt","message":"Invalid Compact JWS"}'), false,
    '키가 틀린 것은 파일이 없는 것이 아니다 — 08-06 에 하루를 태운 그 실패다');
  assert.strictEqual(파일없음(400, ''), false);
});

test('🔴 AGC 는 여기서 적지 않는다 — 헤더에 흔적이 없다(모르는 것을 안다고 쓰지 않는다)', () => {
  const { 앞머리, 전체 } = wav();
  assert.ok(!('agc_verified' in 헤더읽기(앞머리, 전체)),
    'agc 를 헤더에서 「쟀다」고 적으면 그 행이 거짓 증거가 된다 — 봉투(functions/events) 몫이다');
});

/* ── 길이초 — 잰 값이 봉투 밖(읽는 열)으로 나가는가 ──────────────────────────
 * 이 회귀가 지는 것: **`submissions.audio_duration_sec` 가 다시 빈 칸으로 돌아가지 않는 것.**
 * 그 열이 비면 검수 큐도 게임의 「발화 길이」도 전량 0 을 읽고, 0 은 「말을 안 했다」와
 * 같은 모양이라 아무도 못 알아챈다(2026-08-09 실측: 실기기 관통 2건 다 빈 칸이었다). */

test('🔴 잰 길이가 초로 나온다 — 파서가 낸 값과 같은 값이어야 한다(사슬이 끊기면 여기서 빨개진다)', () => {
  const { 앞머리, 전체 } = wav({ 실제데이터: 32000 });          // 16k·mono·16bit → 1.00초
  const 잰것 = 헤더읽기(앞머리, 전체);
  assert.strictEqual(잰것.duration_ms, 1000);
  assert.strictEqual(길이초({ state: 'measured', ...잰것 }), 1,
    '봉투 안 duration_ms 와 열 값이 갈리면 두 숫자가 서로를 반박한다');
});

test('🔴 못 잰 것은 null 이다 — 0 으로 적으면 측정 실패가 0.0초 발화라는 거짓 관측이 된다', () => {
  for (const v of [
    { state: 'unmeasured', reason: 'storage_key' },            // 키가 틀렸다
    { state: 'missing' },                                      // 파일이 없다
    { state: 'measured', duration_ms: null },                  // 잘린 헤더 · byteRate 0
    null, undefined, 'measured', 42,
  ]) {
    assert.strictEqual(길이초(v), null, `모르는 것을 숫자로 적었다: ${JSON.stringify(v)}`);
  }
  assert.strictEqual(길이초({ duration_ms: -1 }), null, '음수는 관측이 아니다');
});

test('numeric(6,2) — 소수 둘째 자리까지, 넘는 값은 비운다(insert 가 던지면 그 발화가 영구 소멸한다)', () => {
  assert.strictEqual(길이초({ duration_ms: 5346 }), 5.35, '반올림이 없으면 DB 가 자른다');
  assert.strictEqual(길이초({ duration_ms: 0 }), 0, '0ms 는 「못 쟀다」가 아니라 「길이가 0 이라고 쟀다」다');
  assert.strictEqual(길이초({ duration_ms: 9_999_990 }), 9999.99, '상한 안은 그대로 통과한다');
  assert.strictEqual(길이초({ duration_ms: 10_000_000 }), null,
    '열 하나 때문에 발화를 잃지 않는다 — 원본 밀리초는 capture_meta 에 남아 있다');
});

/* 이 파일 머리말의 「**파생해 저장한다**」 중 저장 절반. 파생만 검사하면 순수 함수는 영원히
 * 초록인데 열은 계속 빈 칸이다 — F179 가 그 모양이었다(검증기·DB·서버가 서로 다른 계약을 믿고,
 * 서버만 값을 조용히 버렸다). insert 문 **한 문장만** 떼어 본다: 파일 전체에서 이름을 찾으면
 * 위 주석에 적힌 글자가 배선으로 읽힌다(F207 계열). 앵커 방식 = tests/마감시각.test.js 와 같다. */
const 제출insert = (소스) => {
  const 시작 = 소스.indexOf('insert into engine.submissions');
  assert.notEqual(시작, -1, 'events 에서 submissions insert 를 못 찾았다 — 앵커가 낡았다');
  const 끝 = 소스.indexOf('`', 시작);
  return 소스.slice(시작, 끝 === -1 ? undefined : 끝);
};

const 길이배선검사 = (소스) => {
  const 문장 = 제출insert(소스);
  assert.ok(문장.includes('audio_duration_sec'),
    '열이 비면 검수 큐도 게임의 「발화 길이」도 전량 0 을 읽는다 — 0 은 「말을 안 했다」와 같은 모양이다');
  assert.ok(/길이초\(/.test(문장),
    '값을 봉투 밖에서 따로 계산하면 판정이 두 곳으로 갈린다 — 판정은 lib/음성헤더.js 한 곳이다');
};

test('🔴 제출 insert 가 audio_duration_sec 를 싣는다 (열만 서고 아무도 안 채우는 상태를 막는다)', () => {
  길이배선검사(EVENTS);
});

test('탐지력 — 열이 빠져도·값이 딴 데서 와도 위 검사가 잡는다(같은 함수를 그대로 돌린다)', () => {
  assert.throws(() => 길이배선검사(EVENTS.replace(/audio_duration_sec/g, '')),
    '이름을 지웠는데 초록이면 이 검사는 아무것도 안 지키고 있다');
  assert.throws(() => 길이배선검사(EVENTS.replace(/길이초\(/g, '따로계산(')),
    '판정을 딴 함수로 바꿔도 초록이면 두 곳으로 갈린 뒤에야 알게 된다');
});
