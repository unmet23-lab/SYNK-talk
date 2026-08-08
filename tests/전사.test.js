/* lib/전사.js — `submissions.transcript` 를 채우는 배치의 판정.
 *
 * 이 회귀가 지는 것: **발화가 자동 통로에서 영구히 사라지지 않는 것.**
 * 여기서 가장 비싼 실수는 파서 버그가 아니라 **너무 많이 못박는 것**이다 —
 * 키가 하루 늦게 오거나 레이트 리밋이 한 번 걸린 날의 행을 `failed` 로 적으면,
 * 그 행은 두 번 다시 안 집어진다(원본 음성은 남지만 자동 전사는 그날로 끝난다).
 * 그래서 아래 절반은 「못박는가」가 아니라 **「안 못박는가」**를 잰다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { 상태, 전사대상, 전사값, 전사실패, 최대글자 } = require('../lib/전사.js');

const 읽기 = (...p) => fs.readFileSync(path.resolve(__dirname, '..', ...p), 'utf8');
const EVENTS = 읽기('supabase', 'functions', 'events', 'index.ts');
const 배치 = 읽기('supabase', 'functions', 'transcribe', 'index.ts');
const 동봉 = (fn) => JSON.parse(읽기('supabase', 'functions', fn, '동봉.json'));

/* ── 전사대상 — 분모를 만드는 자리 ─────────────────────────────────── */

test('음성이 있으면 대기로 선다 — 그래야 「몇 건이 기다리나」를 셀 수 있다', () => {
  assert.strictEqual(전사대상('voice/abc/1.wav', { state: 'measured' }), 상태.대기);
});

test('음성이 없는 행은 대상이 아니다 — 배정 행이 매일 집어진다', () => {
  assert.strictEqual(전사대상(null, { state: 'measured' }), null);
  assert.strictEqual(전사대상('', { state: 'measured' }), null);
});

test('파일 없음(missing)만 제외한다 — 전사가 원리상 불가능한 행이다', () => {
  assert.strictEqual(전사대상('voice/abc/1.wav', { state: 'missing' }), null);
});

test('못 잰 것(unmeasured)은 대기로 둔다 — 「없다」가 아니라 「모른다」다', () => {
  // 측정 키가 빠진 날의 발화를 통째로 영구 미전사로 만드는 쪽이 훨씬 비싸다.
  for (const 봉 of [{ state: 'unmeasured', reason: 'storage_key' }, { state: 'unmeasured', reason: 'fetch' }, null, {}]) {
    assert.strictEqual(전사대상('voice/abc/1.wav', 봉), 상태.대기, `봉투 ${JSON.stringify(봉)}`);
  }
});

/* ── 전사값 — 무발화는 실패가 아니다 ───────────────────────────────── */

test('정상 응답에서 text 를 집는다', () => {
  assert.deepStrictEqual(전사값({ text: ' 저는 학생입니다. ', language: 'korean' }), {
    transcript: '저는 학생입니다.', 언어: 'korean',
  });
});

test('🔴 빈 전사는 값이다 — 「해 봤더니 아무 말도 없었다」는 관측이다', () => {
  // 이것을 null(=형식 밖)로 접으면 그 행은 매일 재시도되고, 무발화 관측은 영영 안 남는다.
  const r = 전사값({ text: '   ' });
  assert.deepStrictEqual(r, { transcript: '', 언어: null });
});

test('응답 형식 밖은 null — 벤더가 딴것을 준 것을 전사로 적지 않는다', () => {
  for (const 본문 of [null, undefined, 'text', 42, {}, { text: 42 }, { segments: [] }]) {
    assert.strictEqual(전사값(본문), null, `본문 ${JSON.stringify(본문)}`);
  }
});

test('상한 넘는 응답은 안 받는다 — 25MB 발화가 낼 수 있는 글이 아니다', () => {
  assert.strictEqual(전사값({ text: 'ㄱ'.repeat(최대글자 + 1) }), null);
  assert.ok(전사값({ text: 'ㄱ'.repeat(최대글자) }));
});

/* ── 전사실패 — 여기가 이 파일의 급소다 ────────────────────────────── */

test('🔴 우리 쪽 문제는 행을 안 건드린다 — 키·레이트·일시 장애로 발화를 죽이지 않는다', () => {
  for (const s of [401, 403, 429, 500, 502, 503, 504, 408]) {
    const r = 전사실패(s);
    assert.strictEqual(r.state, null, `${s} 를 못박으면 그 구간 발화가 자동 통로에서 영구 소멸한다`);
    assert.strictEqual(r.재시도, true);
  }
});

test('파일 자체가 벤더를 못 지나는 것만 못박는다 — 내일도 같은 결과다', () => {
  for (const s of [400, 422]) {
    assert.strictEqual(전사실패(s).state, 상태.실패, `${s}`);
    assert.strictEqual(전사실패(s).재시도, false);
  }
});

/* ── 배선 — 판정이 실제로 불리는 자리에 닿았나 (F273 무늬) ────────── */

test('events 가 transcript_state 를 INSERT 하고 판정을 정본에서 가져온다', () => {
  assert.match(EVENTS, /insert into engine\.submissions[\s\S]{0,600}transcript_state/,
    'INSERT 열 목록에 transcript_state 가 없으면 분모가 영원히 null 이다');
  assert.match(EVENTS, /전사대상\(/, 'events 가 판정을 안 부르면 값은 늘 null 이다');
  assert.match(EVENTS, /from '\.\/전사\.mjs'/, '동봉 이름으로 import 해야 배포본이 정본을 쓴다');
});

test('동봉 표가 정본을 가리킨다 — 없으면 배포는 ✅ 로 끝나고 첫 호출에서 죽는다', () => {
  // F273: 배포는 성공하고 함수가 import 에서 죽는 자리. 표에 없으면 원격배포가 멈춰야 한다.
  assert.strictEqual(동봉('events')['전사.mjs'], 'lib/전사.js');
  assert.strictEqual(동봉('transcribe')['전사.mjs'], 'lib/전사.js');
  for (const m of 배치.matchAll(/from '\.\/([^']+\.mjs)'/g)) {
    assert.ok(동봉('transcribe')[m[1]], `transcribe 가 import 하는 ${m[1]} 이 동봉 표에 없다`);
  }
});

test('🔴 배치가 기존 전사를 덮지 않는다 — DB 자물쇠와 같은 방향이어야 예외로 안 죽는다', () => {
  assert.match(배치, /update engine\.submissions[\s\S]{0,300}transcript is null/,
    'UPDATE 에 `transcript is null` 이 없으면 겹친 배치가 트리거 예외로 배치를 통째로 세운다');
});

test('키가 없으면 행을 안 건드린다 — 키 오는 날 그대로 돌아야 한다', () => {
  assert.match(배치, /no_api_key/);
  // 「키 없음」 분기가 UPDATE 보다 **앞에서** 끝나는지: 그 분기의 return 이 존재해야 한다.
  const 자리 = 배치.indexOf('no_api_key');
  assert.ok(자리 > 0 && 자리 < 배치.indexOf('update engine.submissions'),
    '키 검사가 UPDATE 뒤에 있으면 키 없는 날 행이 변형된다');
});

test('대기 건수를 응답에 싣는다 — 0건 처리가 「대기 0」인지 「집다 죽었다」인지 갈린다', () => {
  assert.match(배치, /count\(\*\)::int/, 'F207: 미실행은 통과와 같은 모양으로 온다');
});
