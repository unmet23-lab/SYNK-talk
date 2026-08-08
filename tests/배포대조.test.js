/* 배포대조 회귀 — 「배포된 것과 소스가 같은가」를 재는 자가 **자기 눈이 성한지** 못박는다.
 *
 * 이 도구는 첫 판에서 두 번 거짓말을 했고(2026-08-07 실측), 둘 다 증상이 반대 방향이었다:
 *   ① 인코딩 — eszip 본문을 `latin1` 로 읽어 한글이 바이트로 흩어졌다. 로컬 문자열과 영영 안 맞아
 *      멀쩡한 함수 셋이 **거짓 적색**으로 나왔다(도구가 자기 버그를 격차로 보고했다).
 *   ② 표본 — 지문을 「파일 끝 160자」로 잡았다. 수리 커밋은 파일 **중간**을 고치므로 끝은 그대로다.
 *      옛 판이 배포돼 있는데 ✅ 로 나오는 **거짓 초록**이고, 이쪽이 훨씬 나쁘다.
 *
 * 세 맹점(CLAUDE.md):
 *   ① 사람이 실제로 쓰는 표기 — 픽스처 소스에 한글 주석·식별자를 넣는다(이 저장소가 실제로 그렇다).
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 전부 픽스처가 지고, 원격은 안 친다
 *      (자격증명·네트워크에 기대면 CI 에서 깨진다).
 *   ③ 자기 처방 — 「전체를 비교하라」는 처방을 그대로 따른 판이 통과하는지 함께 본다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 정규, 펴기, 평평하게, 대조, 게이트판정, 왕복전게이트, 시각뒤처짐, 바이트로잴수있나 } = require('../tools/배포대조.js');
const { 배포묶음 } = require('../tools/원격배포.js');

/** 대조가 재야 하는 것 = **배포가 보내는 것 전량**. 미커밋검사는 끈다(읽기 도구 · F274 주석 참조). */
const 나갈것 = (디렉터리) => 배포묶음(디렉터리, () => {});

/* 배포본을 흉내낸다 — eszip 은 바이너리 껍데기 안에 소스를 **UTF-8 평문**으로 담는다.
 * 앞뒤 쓰레기 바이트는 실제 포맷이 그렇기 때문에 넣는다(0x00 이 소스 조각을 감싼다). */
const 배포본흉내 = (...소스들) =>
  펴기(Buffer.concat([
    Buffer.from('ESZIP2.3'), Buffer.from([0, 0, 0, 4]),
    ...소스들.map((s) => Buffer.concat([Buffer.from([0, 0]), Buffer.from(s, 'utf8'), Buffer.from([0])])),
  ]));

/* 픽스처 소스는 **일부러 길다.** 변경 지점(위쪽 상수) 뒤에 160자 넘는 꼬리가 있어야
 * 「끝 160자만 보면 못 잡는다」를 잴 수 있다 — 짧은 픽스처는 끝 표본이 변경 지점까지 닿아
 * 옛 방식으로도 적색이 나고, 그러면 이 회귀가 아무것도 안 막는다(첫 판이 그래서 죽었다). */
const 원본 = [
  '/* 오늘 낼 것을 고른다 — 한글 주석이 실제로 이 저장소의 기본이다. */',
  "const 시간대 = 'Asia/Ulaanbaatar';",
  'function 몽골날짜(때) {',
  '  const d = 때 == null ? new Date() : new Date(때);',
  "  if (Number.isNaN(d.getTime())) throw new TypeError('몽골날짜: 날짜가 아니다');",
  '  return d.toISOString().slice(0, 10);',
  '}',
  'function 오늘과제(재료) {',
  '  const { 날짜, 첫날 = false } = 재료 || {};',
  '  return { task_ref: `task-${날짜}`, degraded: !첫날 };',
  '}',
  'module.exports = { 오늘과제, 시간대 };',
].join('\n');

test('① 한글이 든 소스가 UTF-8 배포본에서 찾아진다 (latin1 회귀 — 멀쩡한 판을 격차로 보고하던 자리)', () => {
  assert.ok(배포본흉내(원본).includes(정규(원본)),
    '같은 판인데 못 찾았다 — 본문을 UTF-8 로 안 읽으면 한글이 바이트로 흩어진다');

  /* 변이: 도구가 latin1 로 되돌아가면 이 단언이 죽는다. 같은 버퍼를 latin1 로 읽어
   * **못 찾는다**는 것을 여기서 못박아 둔다(그게 그날의 거짓 적색이었다). */
  const latin1판 = 평평하게(Buffer.from(원본, 'utf8').toString('latin1'));
  assert.equal(latin1판.includes(정규(원본)), false,
    '이 픽스처가 latin1 로도 통과하면 ①을 재는 힘이 없다 — 한글이 없는 픽스처를 쓴 것이다');
});

test('② 파일 **앞쪽**만 바뀐 옛 판은 「다르다」로 잡힌다 (끝 160자 표본이 내던 거짓 초록)', () => {
  /* 수리 커밋의 전형 — 끝(`module.exports`)은 손도 안 대고 위쪽 상수 한 줄을 고친다.
   * 실측이 그랬다: `ac3f646`(날짜 경계)이 `deliver/index.ts` 중간을 고쳤는데 끝은 그대로였다. */
  const 새판 = 원본.replace("'Asia/Ulaanbaatar'", "'Asia/Seoul'");
  assert.notEqual(새판, 원본);

  const 끝지문 = (s) => 정규(s).slice(-160);
  assert.equal(끝지문(새판), 끝지문(원본),
    '픽스처가 약하다 — 변경이 끝 160자 안에 들어가면 옛 방식으로도 잡혀서 ②를 재는 힘이 없다');

  const 옛판배포 = 배포본흉내(원본);
  // 🔴 옛 방식(끝 160자 지문)이면 **이 옛 판 배포본이 새 판을 「같다」로 통과시킨다.** 그게 거짓 초록이었다.
  assert.ok(옛판배포.includes(끝지문(새판)),
    '이 픽스처가 옛 방식으로도 적색이면 회귀가 아무것도 안 막는다');
  assert.equal(옛판배포.includes(정규(새판)), false,
    '옛 판이 배포돼 있는데 새 판을 찾았다 — 표본추출로 돌아가면 이 자리가 통째로 샌다');
  assert.ok(배포본흉내(새판).includes(정규(새판)), '새 판을 배포하면 같다고 나와야 한다');
});

test('③ 줄바꿈·들여쓰기가 달라도 같은 판은 같다고 본다 (양쪽을 한 함수로 편다)', () => {
  const 들여쓴판 = 원본.replace(/\n/g, '\r\n  ');
  assert.ok(배포본흉내(들여쓴판).includes(정규(원본)),
    '공백만 다른데 다르다고 했다 — 한쪽만 정규화하면 모든 파일이 영원히 적색이다');
});

test('④ 동봉된 파일이 여럿이어도 각각 따로 잡힌다 (lib 하나만 옛 판인 실제 모양)', () => {
  const lib새판 = 원본.replace('const 시간대', 'const 시간대_v2 = null; const 시간대');
  // index 는 새 판, lib 은 옛 판인 배포본 — 실측에서 deliver·tasks·progress 가 정확히 이 꼴이었다.
  const 섞인배포 = 배포본흉내('export default 1; // index.ts 새 판', 원본);
  assert.equal(섞인배포.includes(정규(lib새판)), false, 'lib 이 옛 판인데 못 잡았다');
  assert.ok(섞인배포.includes(정규(원본)), '옛 판 자체는 배포본에 있으므로 찾아져야 한다');
});

/* ── 발화점(왕복전게이트) — 도구가 스스로 우는 자리의 회귀 ─────────────────────────
 * 대조·게이트판정은 주입형으로 **실제로 돌려서** 잰다 — 소스 문구 검사는 도달 불가여도
 * 통과한다(F196 계열 실측). 원격은 안 친다: 배포본은 `배포묶음`(HEAD)로 그 자리에서 만든다. */

const FN뿌리 = path.join(__dirname, '..', 'supabase', 'functions');
/* 픽스처 함수는 **동봉이 있는** 것을 고른다 — 본체(.ts)는 바이트로 못 재므로(F274), 동봉이
 * 없는 함수를 고르면 「바이트 대조」 검사들이 잴 것이 0개인 채 초록이 된다(미실행=통과 · F207). */
const 실제slug = fs.readdirSync(FN뿌리).find((n) =>
  fs.existsSync(path.join(FN뿌리, n, 'index.ts')) && fs.existsSync(path.join(FN뿌리, n, '동봉.json')));

/** 진짜 함수 묶음으로 「배포본」을 흉내낸다 — 묶음에서 뺀 파일이 곧 「옛 판」이다. */
const 배포응답 = (묶음) => {
  const buf = Buffer.concat([
    Buffer.from('ESZIP2.3'), Buffer.from([0, 0, 0, 4]),
    ...Object.values(묶음).map((s) => Buffer.concat([Buffer.from([0, 0]), Buffer.from(s, 'utf8'), Buffer.from([0])])),
  ]);
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};

test('⑤ 대조 — 같다/다르다/미측정(HTTP·네트워크) 세 답이 실제 함수 묶음으로 갈린다', async () => {
  assert.ok(실제slug, 'supabase/functions 에 함수가 하나도 없다 — 픽스처가 설 자리가 없다(0건=미실행)');
  const 묶음 = 나갈것(path.join(FN뿌리, 실제slug));

  const 같다 = await 대조('ref0', 't', [실제slug], async () => 배포응답(묶음));
  assert.deepEqual(같다.map((r) => r.상태), ['같다'], JSON.stringify(같다));

  // 바이트로 재는 것은 `.mjs` 뿐이다 — 본체를 빼도 그 축은 안 움직인다(그 자리는 ⑨ 가 진다).
  const 뺄것 = Object.keys(묶음).find(바이트로잴수있나);
  assert.ok(뺄것, '바이트로 잴 파일이 0개다 — 이 검사가 아무것도 안 재고 초록이 된다');
  const { [뺄것]: 뺀것, ...옛묶음 } = 묶음;
  const 다르다 = await 대조('ref0', 't', [실제slug], async () => 배포응답(옛묶음));
  assert.deepEqual(다르다.map((r) => r.상태), ['다르다'], '파일 하나가 옛 판인데 같다고 했다');
  assert.ok(다르다[0].상세.includes(뺄것), '어느 파일이 빠졌는지 짚지 않았다');

  const 오류 = await 대조('ref0', 't', [실제slug], async () => ({ ok: false, status: 503 }));
  assert.deepEqual(오류.map((r) => r.상태), ['미측정'], 'HTTP 실패를 판정으로 번역했다');
  const 끊김 = await 대조('ref0', 't', [실제slug], async () => { throw new Error('ENOTFOUND'); });
  assert.deepEqual(끊김.map((r) => r.상태), ['미측정'], '네트워크 예외가 미측정이 아니라 죽음이 됐다');
});

test('⑥ 게이트판정 — 다르다=차단+따라갈 수 있는 처방 · 미측정만=경고 · 전부 같다=통과', () => {
  const 차단 = 게이트판정([
    { slug: 'events', 상태: '다르다', 상세: 'x' },
    { slug: 'tasks', 상태: '미측정', 상세: 'y' },
  ]);
  assert.equal(차단.행동, '차단');
  // F103 자기처방 — 처방은 원격배포.js 의 실제 사용법 그대로여야 한다(따를 수 없는 처방은 우회를 낳는다).
  assert.ok(차단.처방[0].includes('원격배포.js') && 차단.처방[0].includes('supabase/functions/events')
    && 차단.처방[0].includes('--적용'), 차단.처방[0]);
  assert.equal(게이트판정([{ slug: 'a', 상태: '미측정', 상세: '' }]).행동, '경고');
  assert.equal(게이트판정([{ slug: 'a', 상태: '같다', 상세: '' }]).행동, '통과');
});

test('⑦ 왕복전게이트 — 다르다에서 실제로 죽고(1) 처방을 소리 낸다 · 미측정은 소리 내고 진행한다', async () => {
  const 잡음 = [];
  const 원래오류 = console.error, 원래출력 = console.log;
  console.error = (...a) => 잡음.push(a.join(' '));
  console.log = (...a) => 잡음.push(a.join(' '));
  try {
    let 코드 = null;
    await 왕복전게이트('시험', { SUPABASE_PROJECT_REF: 'ref0', SUPABASE_ACCESS_TOKEN: 't' }, {
      목록: [실제slug],
      가져오기: async () => 배포응답({}),          // 빈 배포본 → 전 파일이 빠짐 → 다르다
      나가기: (c) => { 코드 = c; },
    });
    assert.equal(코드, 1, '다르다인데 안 죽었다 — 게이트가 알림으로 격하되면 F179(세 층이 다른 계약)가 돌아온다');
    assert.ok(잡음.some((줄) => 줄.includes('원격배포.js')), '차단이 처방 없이 죽었다');

    잡음.length = 0; 코드 = null;
    await 왕복전게이트('시험', { SUPABASE_PROJECT_REF: 'ref0', SUPABASE_ACCESS_TOKEN: 't' }, {
      목록: [실제slug],
      가져오기: async () => ({ ok: false, status: 503 }),
      나가기: (c) => { 코드 = c; },
    });
    assert.equal(코드, null, '미측정으로 죽였다 — 관리 API 플레이크가 왕복을 막으면 우회가 정상 통로가 된다');
    // 요약의 「(미측정 n)」만으로는 부족하다 — **어느 함수**를 왜 못 쟀는지가 줄로 남아야 한다(변이 실측: 요약 줄이 이 검사를 통과시켰다).
    assert.ok(잡음.some((줄) => 줄.includes('미측정') && 줄.includes(실제slug)),
      '미측정이 조용하다 — 통과와 미실행이 같은 모양이 된다');

    잡음.length = 0; 코드 = null;
    const 묶음 = 나갈것(path.join(FN뿌리, 실제slug));
    await 왕복전게이트('시험', { SUPABASE_PROJECT_REF: 'ref0', SUPABASE_ACCESS_TOKEN: 't' }, {
      목록: [실제slug], 가져오기: async () => 배포응답(묶음), 나가기: (c) => { 코드 = c; },
    });
    assert.equal(코드, null, '같은데 죽였다');
    assert.ok(잡음.some((줄) => 줄.includes('배포판=소스 ✅')), '통과가 조용하다 — 보고가 인용할 한 줄이 없다');
  } finally { console.error = 원래오류; console.log = 원래출력; }
});

/* ── 본체(F274) ──────────────────────────────────────────────────────────────
 * 리허설 `corrections` 는 몽골어 해설이 빠진 옛 판인데 이 도구가 「✅ 같다(파일 1)」로 통과시켰다.
 * 원인은 두 겹이었다: ⓐ 조립이 `동봉묶기` 라 본체가 **목록에 아예 없었다**(목록에 없는 파일은
 * 영원히 통과다) ⓑ 본체는 배포 시 변환돼 **바이트로는 못 잰다**(실측: `as Error` 가 배포본에 없고
 * 타입만 벗겨 맞춰도 안 맞는다). ⓐ 는 조립을 하나로 모아 고쳤고, ⓑ 는 시각 축이 대신 진다. */

test('⑨-a 본체가 나갈 것에 들어 있고, 초록이 **분모**를 말한다 (「파일 n」이 감추던 자리 · F274)', async () => {
  const 묶음 = 나갈것(path.join(FN뿌리, 실제slug));
  assert.ok(묶음['index.ts'], '나갈 것에 본체가 없다 — 대조가 동봉만 보고 있다(그 게이트는 왕복 5종이 쓴다)');
  assert.equal(바이트로잴수있나('index.ts'), false, '본체를 바이트로 재면 7종이 영원히 적색이다(F103)');
  assert.equal(바이트로잴수있나('토큰.mjs'), true, '동봉까지 못 잰다고 하면 이 도구가 잴 것이 0이 된다');

  const r = await 대조('ref0', 't', [실제slug], async () => 배포응답(묶음));
  assert.equal(r[0].상태, '같다');
  // 「n개 다 맞다」로 읽히면 안 된다 — 무엇을 안 쟀는지가 초록 안에 있어야 한다(F207).
  assert.match(r[0].상세, /바이트 \d+\/\d+/, `분모가 없다: ${r[0].상세}`);
  assert.match(r[0].상세, /index\.ts.*변환/, `본체를 안 쟀다는 말이 없다: ${r[0].상세}`);
});

test('⑨-b 시각 축 — 배포가 마지막 커밋보다 이르면 「다르다」(본체를 담을 수 없다) · 반대는 아무 말도 안 한다', () => {
  const 배포 = '2026-08-07T03:48:13.897Z';
  // 리허설 corrections 의 실제 값 — 이 조합이 이틀 동안 「✅ 같다」였다.
  assert.equal(시각뒤처짐(배포, '2026-08-09T06:13:04+09:00'), true, '옛 배포를 못 잡으면 F274 가 그대로다');
  // 반대 방향은 증명이 아니다 — 배포가 나중이어도 그 뒤에 또 커밋될 수 있다.
  assert.equal(시각뒤처짐('2026-08-09T06:20:00+09:00', '2026-08-09T06:13:04+09:00'), false);
  // 실측한 가장 좁은 간격이 14초(events) — 시계 어긋남을 적색으로 번역하면 가드가 꺼진다(F103).
  assert.equal(시각뒤처짐('2026-08-08T21:12:17.726Z', '2026-08-08T21:12:31.000Z'), false, '14초 차이를 적색으로 냈다');
  // 못 읽은 것은 이 축의 판정이 아니다 — 미측정을 「다르다」로 번역하지 않는다.
  assert.equal(시각뒤처짐(null, '2026-08-09T06:13:04+09:00'), false);
  assert.equal(시각뒤처짐(배포, null), false);
  assert.equal(시각뒤처짐(배포, '날짜가 아니다'), false);
});

test('⑧ 등록층 — 왕복시험 계열 전부가 왕복전게이트를 부른다(가드는 로직보다 등록층에서 샌다)', () => {
  const 도구뿌리 = path.join(__dirname, '..', 'tools');
  const 도구들 = fs.readdirSync(도구뿌리).filter((n) => /왕복시험\.js$/.test(n));
  // 0건=미실행 — 이름이 바뀌어 glob 이 비면 「전부 통과」가 아니라 여기서 빨개져야 한다.
  assert.ok(도구들.length >= 5, `왕복시험 도구가 ${도구들.length}개뿐이다 — 이름 규칙이 바뀌었으면 이 회귀부터 고친다`);
  for (const n of 도구들) {
    const 소스 = fs.readFileSync(path.join(도구뿌리, n), 'utf8');
    const 산줄 = 소스.split('\n').some((줄) => /왕복전게이트\(/.test(줄) && !/^\s*(\/\/|\*|\/\*)/.test(줄));
    assert.ok(산줄, `${n} 이 배포판 대조 없이 돈다 — 그 초록은 무엇을 쟀는지 말할 수 없다`);
  }
});
