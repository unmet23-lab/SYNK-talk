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
const { 상태, 전사대상, 전사값, 세그먼트값, 전사실패, 최대글자 } = require('../lib/전사.js');
/* 🔑 소비자를 **함께 건다.** 생산자만 재면 「내가 낸 모양을 내가 읽는다」를 증명할 뿐이고,
 *   이 트랙이 실제로 걸린 함정이 정확히 그 자리였다(설계 §228 모양엔 `confidence` 가 없다). */
const { 세그먼트펴기, 청취문턱 } = require('../lib/검수확정.js');

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

/* ── 세그먼트값 — 소비자 셋이 선 채로 재료가 0이던 자리 ─────────────── */

/** Whisper `verbose_json` 세그먼트 한 조각. 신뢰도는 확률로 주고 로그로 바꿔 넣는다. */
const 조각 = (start, end, 확률, 나머지 = {}) => ({
  start, end, text: '말했다', avg_logprob: Math.log(확률), no_speech_prob: 0.01, ...나머지,
});

test('🔴 생산자가 낸 모양을 소비자가 그대로 읽는다 — 저신뢰 구간이 실제로 문턱을 올린다', () => {
  /* 이 트랙의 급소. 설계 §228 이 적은 네 칸(start·end·text·avg_logprob·no_speech_prob)만
   * 저장하면 `세그먼트펴기` 가 보는 `confidence` 가 없어 저신뢰가 **원리상 0**이 되고,
   * 게이트는 생산자가 서 있는데도 하한 3초로 되돌아간다 — 증상 없는 초록이다. */
  const { stt_segments } = 세그먼트값({ segments: [조각(0, 5, 0.5), 조각(5, 8, 0.95)] });
  const 펴진 = 세그먼트펴기(stt_segments);
  assert.deepStrictEqual(펴진.map((s) => s.저신뢰), [true, false], '소비자가 저신뢰를 못 가른다');
  const 문턱 = 청취문턱(stt_segments);
  assert.strictEqual(문턱.재료, true, '재료=false 면 게이트는 여전히 안 선 것이다');
  assert.strictEqual(문턱.ms, 5000, '저신뢰 5초 구간이 문턱이 돼야 한다(하한 3초가 아니라)');
});

test('벤더 원값을 지우지 않는다 — 파생 해석을 고치는 날 옛 행을 다시 계산한다', () => {
  const { stt_segments } = 세그먼트값({ segments: [조각(0, 2, 0.8, { no_speech_prob: 0.42 })] });
  assert.strictEqual(stt_segments.length, 1);
  const s = stt_segments[0];
  assert.ok(Math.abs(s.avg_logprob - Math.log(0.8)) < 1e-12, 'avg_logprob 원값이 사라졌다');
  assert.strictEqual(s.no_speech_prob, 0.42, 'no_speech_prob 원값이 사라졌다');
  assert.strictEqual(s.text, '말했다');
  assert.deepStrictEqual([s.start, s.end], [0, 2]);
});

test('confidence = exp(avg_logprob) — 지어낸 눈금이 아니라 벤더 값의 정의다', () => {
  const { stt_segments } = 세그먼트값({ segments: [조각(0, 1, 0.37)] });
  assert.ok(Math.abs(stt_segments[0].confidence - 0.37) < 1e-12);
  // 양수 로그확률(형식 밖 값)이 와도 1을 안 넘는다 — 확률이 1보다 큰 척하지 않는다.
  const 넘침 = 세그먼트값({ segments: [{ start: 0, end: 1, avg_logprob: 3 }] });
  assert.strictEqual(넘침.stt_segments[0].confidence, 1);
});

test('🔴 무발화는 값이다 — `[]` 와 「형식 밖」이 갈려야 한다', () => {
  const r = 세그먼트값({ text: '', segments: [] });
  assert.deepStrictEqual(r, { stt_segments: [], stt_confidence: null });
  // 신뢰도는 0 이 아니라 null 이다 — 「안 쟀다」를 「나빴다」로 적으면 검수 우선순위가 뒤집힌다.
  assert.strictEqual(r.stt_confidence, null);
});

test('형식 밖은 null — 부르는 쪽이 그 칸을 안 건드린다', () => {
  for (const 본문 of [null, undefined, 'x', 42, {}, { segments: null }, { segments: '[]' }]) {
    assert.strictEqual(세그먼트값(본문), null, `본문 ${JSON.stringify(본문)}`);
  }
});

test('시간에 못 놓는 조각은 버린다 — 남기면 길이 가중이 정의되지 않는다', () => {
  const { stt_segments } = 세그먼트값({
    segments: [조각(0, 2, 0.9), { start: 5, end: 5 }, { start: 'a', end: 2 }, null, 조각(2, 3, 0.9)],
  });
  assert.deepStrictEqual(stt_segments.map((s) => [s.start, s.end]), [[0, 2], [2, 3]]);
});

test('🔴 신뢰도를 못 읽은 조각은 분모에서 뺀다 — 0 으로 접으면 「안 쟀다」가 「나빴다」가 된다', () => {
  const r = 세그먼트값({ segments: [조각(0, 1, 0.8), { start: 1, end: 99, text: '긴데 신뢰도 없음' }] });
  assert.strictEqual(r.stt_segments[1].confidence, null);
  assert.strictEqual(r.stt_confidence, 0.8, '신뢰도 없는 98초가 값을 0 쪽으로 끌었다');
});

test('발화 신뢰도는 **길이 가중** 평균이다 — 짧은 추임새가 긴 문장과 같은 무게면 안 된다', () => {
  const r = 세그먼트값({ segments: [조각(0, 1, 0.9), 조각(1, 11, 0.5)] });
  // 단순 평균이면 0.7. 길이 가중이면 (0.9·1 + 0.5·10)/11 = 0.536.
  assert.strictEqual(r.stt_confidence, 0.536);
});

test('신뢰도는 세 자리로 맞춘다 — 열이 numeric(6,3) 이라 안 맞추면 대조가 매번 거짓 불일치를 낸다', () => {
  const r = 세그먼트값({ segments: [조각(0, 3, 1 / 3)] });
  assert.strictEqual(r.stt_confidence, 0.333);
});

/* ── 세그먼트 배선 — 판정이 실제로 행에 닿는가 ─────────────────────── */

test('🔴 구간이 전사와 **같은 UPDATE** 로 나간다 — 나누면 반쪽 행이 영구히 안 집어진다', () => {
  const m = /update engine\.submissions[\s\S]*?returning event_id/.exec(배치);
  assert.ok(m, 'UPDATE 문을 못 찾았다');
  assert.match(m[0], /transcript =/);
  assert.match(m[0], /stt_segments =/, '전사만 실리면 구간은 다음 배치가 두 번 다시 안 집는다');
  assert.match(m[0], /stt_confidence =/);
  assert.match(m[0], /transcript is null/, '자물쇠와 같은 방향이어야 트리거 예외로 안 죽는다');
});

test('세그먼트 형식 밖이면 그 칸을 안 건드린다 — `[]` 로 적으면 무발화와 같은 모양이 된다', () => {
  assert.match(배치, /세그먼트값\(/, '배치가 판정을 안 부르면 이 칸은 영원히 null 이다');
  assert.match(배치, /구간\s*\n?\s*\?\s*sql`, stt_segments/,
    '조건부가 아니면 형식 밖인 날 빈 배열이 「쟀는데 없었다」로 적힌다');
});

test('구간 건수를 전사 건수와 **따로** 싣는다 (F207)', () => {
  // 세그먼트 형식이 바뀐 날엔 전사만 들어오고 게이트는 조용히 하한으로 되돌아간다.
  assert.match(배치, /전사: 성공, 구간:/, '두 수가 한 수로 접히면 그 차이가 응답에서 안 보인다');
});

test('jsonb 는 드라이버의 sql.json 으로 싣는다 — 문자열로 보내면 텍스트로 박힌다', () => {
  assert.match(배치, /stt_segments = \$\{sql\.json\(/);
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
