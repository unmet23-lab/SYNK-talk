/* lib/자격증명.js — 토큰을 **시간으로 가두는** 장치와 그 공용 통로.
 *
 * 이 회귀가 지는 것 둘:
 *   ① 만료 판정이 실제로 갈리는가(경계 포함).
 *   ② **옛 통로가 되살아나지 않는가.** 같은 `env읽기()` 가 도구 6곳에 복사돼 있었고, 그래서
 *      「작업 끝나면 폐기」는 6곳 어디에서도 강제되지 않았다. 통로를 하나로 모았으면
 *      **옛 통로를 금지하는 것까지가 한 벌**이다 — 안 그러면 다음 도구가 다시 복사해 온다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { 만료판정, 과녁판정, 대상알림, 새날짜, 만료칸, 운영REF, 리허설REF } = require('../lib/자격증명.js');

const TOOLS = path.join(__dirname, '..', 'tools');
const LIB = path.join(__dirname, '..', 'lib');

/** console.error 를 잡아 둔 채 돌린다 — 알림은 **찍히는 것**이 전부라 반환값만 봐서는 못 잰다. */
async function 찍힌것(fn) {
  const 원래 = console.error;
  const 줄들 = [];
  console.error = (...a) => 줄들.push(a.join(' '));
  try { await fn(); } finally { console.error = 원래; }
  return 줄들;
}

const 응답 = (이름) => ({ ok: true, text: async () => JSON.stringify({ name: 이름 }) });

test('만료일이 없으면 「없음」 — 조용한 통과와 구분된다', () => {
  assert.equal(만료판정({}).상태, '없음');
  assert.equal(만료판정({ [만료칸]: '  ' }).상태, '없음');
});

test('지난 날짜는 「지남」', () => {
  assert.equal(만료판정({ [만료칸]: '2026-08-01' }, '2026-08-07').상태, '지남');
});

test('경계 — 만료일 당일은 아직 살아 있다(그날 하루를 뺏지 않는다)', () => {
  assert.equal(만료판정({ [만료칸]: '2026-08-07' }, '2026-08-07').상태, 'ok');
  assert.equal(만료판정({ [만료칸]: '2026-08-06' }, '2026-08-07').상태, '지남');
});

test('YYYY-MM-DD 가 아니면 「모양이상」 — 못 재는 것을 통과로 접지 않는다', () => {
  for (const v of ['2026/08/07', '내일', '20260807', '2026-8-7']) {
    assert.equal(만료판정({ [만료칸]: v }).상태, '모양이상', `${v} 를 통과시켰다`);
  }
});

test('자기 처방 — 안내가 주는 날짜를 넣으면 통과한다', () => {
  // 폐기안내가 「예: <새날짜(30)>」 을 보여 준다. 그대로 넣었는데 또 막히면 따를 수 없는 처방이다.
  const 처방 = 새날짜(30);
  assert.match(처방, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(만료판정({ [만료칸]: 처방 }).상태, 'ok', '처방대로 넣었는데 아직 막힌다');
});

/* ── 옛 통로 금지 ───────────────────────────────────────────────────────────── */

const 옛통로 = (글) => /function\s+env읽기\s*\(/.test(글) || /\.\.\.env읽기\(\)/.test(글);

test('탐지력 픽스처 — 옛 통로가 되살아나면 반드시 잡는다', () => {
  assert.ok(옛통로('function env읽기() {\n  return {};\n}'), '함수 선언을 못 잡는다');
  assert.ok(옛통로('const e = { ...env읽기(), ...process.env };'), '호출 형태를 못 잡는다');
  assert.ok(!옛통로("const e = 자격증명.읽기('원격SQL');"), '새 통로를 옛것으로 잘못 잡는다');
});

test('실저장소 — 액세스 토큰을 쓰는 도구에 옛 통로가 없다', () => {
  const 파일들 = fs.readdirSync(TOOLS).filter((f) => f.endsWith('.js'));
  assert.ok(파일들.length > 5, '도구 목록을 못 읽었다(통과와 미실행이 같은 모양이 된다)');

  const 되살아난것 = [];
  for (const f of 파일들) {
    const 글 = fs.readFileSync(path.join(TOOLS, f), 'utf8');
    if (!글.includes('SUPABASE_ACCESS_TOKEN')) continue;   // 토큰을 안 쓰면 이 규칙 밖이다
    if (옛통로(글)) 되살아난것.push(f);
  }
  assert.deepEqual(되살아난것, [], `옛 통로가 남아 있다: ${되살아난것.join(', ')}`);
});

test('실저장소 — 액세스 토큰을 쓰는 도구는 전부 공용 통로를 지난다', () => {
  const 파일들 = fs.readdirSync(TOOLS).filter((f) => f.endsWith('.js'));
  const 안지나는것 = [];
  for (const f of 파일들) {
    const 글 = fs.readFileSync(path.join(TOOLS, f), 'utf8');
    if (!글.includes('SUPABASE_ACCESS_TOKEN')) continue;
    if (!/자격증명\.읽기\(/.test(글)) 안지나는것.push(f);
  }
  // 🔑 「옛 통로가 없다」만으론 부족하다 — 아예 안 읽는 새 방식이 생기면 게이트를 또 비껴간다.
  assert.deepEqual(안지나는것, [], `공용 통로를 안 지난다: ${안지나는것.join(', ')}`);
});

/* ── 과녁 게이트 (2026-08-07 신설) ────────────────────────────────────────────
 * 🔴 실사건: `.env` 의 `SUPABASE_PROJECT_REF` 가 운영을 가리키는 동안 `EXPO_PUBLIC_*` 는
 *   리허설이었다 — 왕복은 리허설에서 초록인데 `--적용` 은 운영에 떨어졌고, Edge Function
 *   4개가 그렇게 운영에 섰다. 도구는 대상을 **이미 소리 내어 읽고 있었다**(알림은 안 멈춘다).
 * 🔑 위 「전부 공용 통로를 지난다」 검사가 이 게이트의 **라우팅**을 이미 지고 있다 —
 *   새 도구가 게이트를 비껴가려면 그 검사를 먼저 빨갛게 만들어야 한다. */

test('과녁 — 대상이 운영이면 막는다', () => {
  assert.equal(과녁판정({ SUPABASE_PROJECT_REF: 운영REF }, []).상태, '막음');
});

test('과녁 — 두 번째 키(--운영)가 있으면 통과한다 (막힌 사람이 따라갈 길이 있다)', () => {
  assert.equal(과녁판정({ SUPABASE_PROJECT_REF: 운영REF }, ['--적용', '--운영']).상태, '통과');
});

test('과녁 — 리허설·미설정·모르는 ref 는 마찰 0', () => {
  for (const ref of [리허설REF, '', undefined, `${리허설REF}X`]) {
    assert.equal(과녁판정({ SUPABASE_PROJECT_REF: ref }, []).상태, '통과', `ref=${ref}`);
  }
  assert.equal(과녁판정({}, []).상태, '통과');
  assert.equal(과녁판정(null, null).상태, '통과');
});

/* ── 대상 알림 (2026-08-09 신설) ──────────────────────────────────────────────
 * 🔴 실사건: 과녁 게이트는 「운영이면 막는다」까지고 리허설로 갈 때는 **아무 말도 안 한다.**
 *   그래서 운영에 올렸어야 할 명부가 리허설로 가도 화면은 「✅ 명부 등록 3명」으로 똑같았다
 *   (리허설 `learners` 156행 / 운영 0행). 막는 것과 말하는 것은 다른 일이다.
 * 🔑 알림은 **게이트가 아니다** — 조회가 실패해도 실행을 막지 않는다. 대신 ref 는 언제나 남긴다.
 *   그 성질이 깨지면 네트워크가 한 번 흔들릴 때마다 원장의 명부 등록이 죽는다. */

test('알림 — 프로젝트 이름을 읽어 대상을 찍는다', async () => {
  const 줄들 = await 찍힌것(() => 대상알림('시험', { SUPABASE_PROJECT_REF: 리허설REF, SUPABASE_ACCESS_TOKEN: 't' },
    { 조회: async () => 응답('synk-core-rehearsal') }));
  assert.equal(줄들.length, 1, `한 줄이어야 한다 — 실제 ${줄들.length}줄`);
  assert.match(줄들[0], /대상 ▸ synk-core-rehearsal/);
  assert.ok(줄들[0].includes(리허설REF), 'ref 가 없으면 이름이 같은 프로젝트를 못 가른다');
});

test('🔴 알림 — 이름 조회가 실패해도 멈추지 않고 ref 는 찍는다', async () => {
  for (const [설명, 조회] of [
    ['HTTP 실패', async () => ({ ok: false, text: async () => 'nope' })],
    ['네트워크 끊김', async () => { throw new Error('ECONNRESET'); }],
    ['응답이 JSON 이 아님', async () => ({ ok: true, text: async () => '<html>' })],
  ]) {
    const 줄들 = await 찍힌것(() => 대상알림('시험', { SUPABASE_PROJECT_REF: 리허설REF }, { 조회 }));
    assert.equal(줄들.length, 1, `${설명} — 알림이 통째로 사라졌다`);
    assert.ok(줄들[0].includes(리허설REF), `${설명} — ref 마저 없으면 어디에 쏘는지 모른 채 진행한다`);
    assert.match(줄들[0], /못 읽었다/, `${설명} — 못 읽은 사실을 숨기면 조용한 성공이 된다`);
  }
});

test('알림 — 운영이면 눈에 띄게 다르다 (--운영 으로 게이트를 열고 온 자리다)', async () => {
  const 줄들 = await 찍힌것(() => 대상알림('시험', { SUPABASE_PROJECT_REF: 운영REF },
    { 조회: async () => 응답('Synk Core') }));
  assert.match(줄들[0], /🔴 운영/, '게이트를 연 뒤에는 이 줄이 마지막 확인 자리다');
});

test('알림 — 쓰기와 미리보기가 같은 줄로 보이지 않는다', async () => {
  const 조회 = async () => 응답('synk-core-rehearsal');
  const env = { SUPABASE_PROJECT_REF: 리허설REF };
  const 쓰기 = await 찍힌것(() => 대상알림('시험', env, { 쓰기: true, 조회 }));
  const 보기 = await 찍힌것(() => 대상알림('시험', env, { 쓰기: false, 조회 }));
  const 무표시 = await 찍힌것(() => 대상알림('시험', env, { 조회 }));
  assert.match(쓰기[0], /⚠ 쓰기\(--적용\)/);
  assert.match(보기[0], /미리보기/);
  assert.notEqual(쓰기[0], 보기[0]);
  assert.ok(!/쓰기|미리보기/.test(무표시[0]), '안 넘겼는데 둘 중 하나를 지어내면 그게 오정보다');
});

/* ── 「대상을 안 찍는 도구」 금지 ──────────────────────────────────────────────
 * 🔑 탐지력은 픽스처가 지고, 실저장소에는 **거짓양성만** 검사한다(버그가 남아 있기를
 *   요구하는 회귀를 만들지 않는다). */

const 주석빼기 = (글) => 글.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * 공용 통로를 지나면서 과녁을 소리 내어 읽지 않는 자리를 고른다. null = 문제 없음.
 *
 * 🔑 **순서는 여기서 안 잰다 — 못 재기 때문이다.** 두 번 시도해 두 번 다 멀쩡한 도구가 빨개졌다:
 *   ①「질의보다 먼저 찍는가」 → 교정확정·동의발급·명부등록이 걸렸다. `database/query` 가 파일
 *     위쪽 `sql()` **정의** 안에 있어서다. ②「자격증명 뒤에 찍는가」 → 원격SQL 이 걸렸다.
 *     `대상알림` **정의**가 `자격증명.읽기` 위에 있어서다.
 *   둘 다 코드가 틀린 게 아니라 **재는 층이 틀렸다** — 글자 위치는 실행 순서가 아니고,
 *   정의와 호출을 글자로는 못 가른다. 호출부 이름은 도구마다 달라 전역에서 잡을 방법도 없다.
 *   그래서 순서는 그 이름을 아는 각 도구의 회귀가 진다
 *   (`tests/명부등록.test.js` — 「대상 알림은 자격증명 뒤·첫 질의 앞이다」).
 *   전역이 지는 건 **「한 번도 안 찍는다」** 하나다. 실제로 샌 자리가 정확히 그 모양이었다.
 */
function 안찍는이유(원문) {
  const 글 = 주석빼기(원문);
  if (!/자격증명\.읽기\s*\(/.test(글)) return null;              // 이 통로 밖 — 여기서 판정하지 않는다
  if (!/자격증명\.대상알림\s*\(|대상 ▸/.test(글)) return '대상을 한 번도 안 찍는다';
  return null;
}

test('탐지력 픽스처 — 대상을 한 번도 안 찍는 도구를 반드시 잡는다', () => {
  const 질의 = "await fetch('https://api.supabase.com/v1/projects/x/database/query');";
  const 읽기 = "const e = 자격증명.읽기('가짜');";
  const 알림 = "await 자격증명.대상알림('가짜', e, { 쓰기: 적용 });";

  assert.equal(안찍는이유(`${읽기}\n${질의}`), '대상을 한 번도 안 찍는다');
  assert.equal(안찍는이유(`${읽기}\n${알림}\n${질의}`), null, '제대로 찍는 것을 잡으면 거짓양성이다');
  assert.equal(안찍는이유(`${읽기}\nconsole.error('[가짜] 대상 ▸ ' + 이름);\n${질의}`), null,
    '형제 여덟이 쓰는 옛 표기(`대상 ▸`)도 알림으로 친다 — 지금 고칠 대상은 침묵하는 자리다');
  assert.equal(안찍는이유(`${질의}`), null, '공용 통로를 안 지나면 이 규칙 밖이다');

  /* 🔑 주석 속 낱말이 알림으로 세어지면 「// 대상알림 하기」 라고 적어 두기만 해도 초록이 된다. */
  assert.equal(안찍는이유(`${읽기}\n/* 자격증명.대상알림 을 붙일 것 */\n${질의}`),
    '대상을 한 번도 안 찍는다', '주석을 코드로 셌다');
  assert.equal(안찍는이유(`${읽기}\n// 대상 ▸ 를 찍어야 한다\n${질의}`),
    '대상을 한 번도 안 찍는다', '한 줄 주석을 코드로 셌다');
});

test('실저장소 — 공용 통로를 지나는 도구는 전부 대상을 찍는다', () => {
  const 파일들 = [
    ...fs.readdirSync(TOOLS).filter((f) => f.endsWith('.js')).map((f) => ['tools/' + f, path.join(TOOLS, f)]),
    ...fs.readdirSync(LIB).filter((f) => f.endsWith('.js')).map((f) => ['lib/' + f, path.join(LIB, f)]),
  ];
  const 잰것 = [];
  const 안찍는것 = [];
  for (const [이름, p] of 파일들) {
    const 글 = fs.readFileSync(p, 'utf8');
    if (!/자격증명\.읽기\s*\(/.test(주석빼기(글))) continue;
    잰것.push(이름);
    const 이유 = 안찍는이유(글);
    if (이유) 안찍는것.push(`${이름}: ${이유}`);
  }
  // 🔴 분모부터 밝힌다 — 0건을 잰 것과 통과는 같은 모양이다(F207).
  assert.ok(잰것.length >= 8, `잰 파일이 ${잰것.length}개뿐이다 — 목록을 못 읽었을 수 있다: ${잰것.join(', ')}`);
  assert.deepEqual(안찍는것, [], `대상을 안 찍는다: ${안찍는것.join(' · ')}`);
});

test('과녁 — ref 상수가 비거나 리허설과 같아지면 게이트가 조용히 꺼진다', () => {
  /* 🔑 이게 이 게이트의 유일한 무증상 고장 방식이다 — 상수가 오타나면 모든 ref 가 「통과」로
   *   보이고, **통과와 게이트-없음이 같은 모양**이 된다. 그래서 상수 자체를 못박는다. */
  assert.match(운영REF, /^[a-z]{20}$/);
  assert.match(리허설REF, /^[a-z]{20}$/);
  assert.notEqual(운영REF, 리허설REF);
});

/* ── 읽기 갈래 (2026-08-12 신설 · 유호 지시) ───────────────────────────────────
 * 🔴 실사건: 읽기 전용인 `확인_판번호.sql` 과, 「GET 만 친다」고 자기 머리에 적은 `배포대조.js` 가
 *   둘 다 운영에서 멈췄다. 그래서 **운영이 지금 어떤 상태인지 재는 눈이 없었고**,
 *   「⛔운영 미배포 잔여」가 실측 한 번 없이 장부에만 적혀 있었다. 게다가 차단문의 처방이
 *   `--운영`(쓰기 승인 키)이라 **읽으려면 쓰기 키를 붙이는 것이 유일한 길**이었다(F103).
 * 🔑 뒤집은 것은 **기본값 하나**다 — 선언 없음 = 쓰기 = 막음. 옛 주석이 걱정한
 *   「빠뜨린 곳이 통과로 보인다」는 기본값이 **반대**일 때의 이야기고, 이 방향에서 빠뜨린
 *   호출부는 「막힘」으로 나온다. 그래서 이 갈래는 넓히는 게 아니라 **한 칸 여는** 것이다. */

test('읽기갈래 — 선언이 없으면 운영은 그대로 막힌다 (기본값이 안전 방향이다)', () => {
  for (const opt of [undefined, null, {}, { 쓰기: false }]) {
    assert.equal(과녁판정({ SUPABASE_PROJECT_REF: 운영REF }, [], opt).상태, '막음', `opt=${JSON.stringify(opt)}`);
  }
});

test('읽기갈래 — 읽기를 선언하면 지나가되 「통과」와 **다른 상태**로 나온다', () => {
  /* 🔑 상태를 나눈 이유는 호출부가 **소리를 내야** 하기 때문이다. 읽기라고 조용히 지나가면
   *   통과와 미실행이 같은 모양이 되고(F207), 리허설 숫자를 운영이라 읽는 사고가 거기서 난다. */
  const r = 과녁판정({ SUPABASE_PROJECT_REF: 운영REF }, [], { 읽기: true });
  assert.equal(r.상태, '읽기통과');
  assert.equal(r.ref, 운영REF);
});

test('읽기갈래 — `=== true` 만 연다 (truthy 로 새면 그게 구멍이다)', () => {
  for (const v of [1, 'true', 'yes', 'false', {}, [], false, 0, null, '']) {
    assert.equal(과녁판정({ SUPABASE_PROJECT_REF: 운영REF }, [], { 읽기: v }).상태, '막음',
      `읽기=${JSON.stringify(v)} 가 열렸다`);
  }
});

test('읽기갈래 — 리허설은 선언과 무관하게 마찰 0 · --운영 은 여전히 쓰기 한 길', () => {
  assert.equal(과녁판정({ SUPABASE_PROJECT_REF: 리허설REF }, [], { 읽기: true }).상태, '통과');
  assert.equal(과녁판정({ SUPABASE_PROJECT_REF: 리허설REF }, [], { 읽기: false }).상태, '통과');
  assert.equal(과녁판정({ SUPABASE_PROJECT_REF: 운영REF }, ['--운영'], { 읽기: true }).상태, '통과');
});

/** 소스에 **쓰기 경로**가 있는가 — 읽기라 선언한 도구가 나중에 쓰기를 얻는 순간을 잡는다.
 *  ⚠ HTTP 메서드만으로는 못 가른다: Management API 는 **읽기 SQL 도** `POST /database/query` 로
 *  보낸다(실측 — `엔진뷰어` 는 화면에 「읽기」를 찍으면서 POST 를 친다). 그래서 둘 다 센다. */
function 쓰기경로(원문) {
  const 글 = 주석빼기(원문);
  const 걸린것 = [];
  if (/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(글)) 걸린것.push('쓰기 메서드');
  if (/database\/query/.test(글)) 걸린것.push('database/query');
  return 걸린것;
}

test('탐지력 픽스처 — 읽기라 선언한 자리에 생긴 쓰기 경로를 반드시 잡는다', () => {
  assert.deepEqual(쓰기경로("await fetch(u, { headers: 헤더 });"), []);
  assert.deepEqual(쓰기경로("await fetch(u, { method: 'POST' });"), ['쓰기 메서드']);
  assert.deepEqual(쓰기경로("await fetch(u, { method: \"DELETE\" });"), ['쓰기 메서드']);
  assert.deepEqual(쓰기경로("await fetch(`${API}/${ref}/database/query`, { headers: 헤더 });"), ['database/query']);
  /* 🔑 주석 속 낱말을 세면 「POST 는 안 친다」고 적어 두기만 해도 빨개진다 — 그건 거짓양성이고,
   *   거짓양성이 잦은 가드는 곧 꺼진다. */
  assert.deepEqual(쓰기경로("// 여기서 method: 'POST' 는 안 친다\nawait fetch(u, { headers: 헤더 });"), []);
});

test('실저장소 — 읽기를 선언한 도구에 쓰기 경로가 생기면 빨개진다', () => {
  /* ⚠ 대상은 **`읽기: true` 리터럴을 적은 도구뿐**이다. `원격SQL.js` 는 SQL 을 보고 실행마다
   *   판정하므로(`읽기: 읽기전용(sql) && !적용`) 정적으로는 쓰기 경로가 있는 게 정상이다 —
   *   그쪽 안전은 그 파일의 SQL 파서와 `--적용` 이 진다. */
  const 파일들 = [
    ...fs.readdirSync(TOOLS).filter((f) => f.endsWith('.js')).map((f) => ['tools/' + f, path.join(TOOLS, f)]),
    ...fs.readdirSync(LIB).filter((f) => f.endsWith('.js')).map((f) => ['lib/' + f, path.join(LIB, f)]),
  ];
  const 선언한것 = [];
  const 위반 = [];
  for (const [이름, p] of 파일들) {
    const 글 = fs.readFileSync(p, 'utf8');
    if (!/자격증명\.읽기\s*\([^)]*읽기\s*:\s*true/.test(주석빼기(글))) continue;
    선언한것.push(이름);
    const 걸린것 = 쓰기경로(글);
    if (걸린것.length) 위반.push(`${이름}: ${걸린것.join('·')}`);
  }
  // 🔴 분모부터 밝힌다 — 0건을 잰 것과 통과는 같은 모양이다(F207).
  assert.ok(선언한것.length >= 1, '읽기를 선언한 도구를 하나도 못 찾았다 — 정규식이나 목록이 깨졌다');
  assert.deepEqual(위반, [], `읽기라 선언했는데 쓰기 경로가 있다: ${위반.join(' · ')}`);
});
