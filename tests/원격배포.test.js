/* 동봉이 **진짜 import 되는지**를 잰다.
 *
 * 왜 이 검사인가: 동봉의 목적은 「정본 한 벌」이다. 그런데 감싸기가 조금만 틀려도 배포는 성공하고
 * 함수는 **런타임에** 죽는다 — 그때는 라이브다. 껍데기가 맞는지는 여기서, 네트워크 없이 가른다.
 * 껍데기만 흉내내지 않고 **실제로 import 해서 계약 검증이 도는 것까지** 확인한다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { 동봉묶기 } = require('../tools/원격배포.js');

const 함수디렉터리 = path.join(__dirname, '..', 'supabase', 'functions', 'events');

/** 문자열을 .mjs 로 떨궈 실제 import 한다(Deno 가 할 일을 Node 로 미리 해 본다). */
async function 임시import(이름, 내용) {
  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-동봉-'));
  const p = path.join(방, 이름);
  fs.writeFileSync(p, 내용);
  try {
    return await import(require('url').pathToFileURL(p).href);
  } finally {
    fs.rmSync(방, { recursive: true, force: true });
  }
}

/** 여러 .mjs 를 **같은 방**에 떨군 뒤 하나를 import 한다 — 서로를 import 하는 묶음용. */
async function 임시import여럿(주인공, 묶음) {
  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-동봉-'));
  try {
    for (const [이름, 내용] of Object.entries(묶음)) fs.writeFileSync(path.join(방, 이름), 내용);
    return await import(require('url').pathToFileURL(path.join(방, 주인공)).href);
  } finally {
    fs.rmSync(방, { recursive: true, force: true });
  }
}

/* ── lib 끼리의 require (2026-08-06 신설) ───────────────────────────────────
 * `lib/학생계정.js` 는 `lib/로그인코드.js` 를 require 한다 — 정규화·합성 도메인의 정본이
 * 거기 하나여야 하기 때문이다(`tests/로그인코드.test.js` 가 기계로 지킨다). Deno 에는
 * `require` 가 없으므로 껍데기가 풀어 주지 않으면 **배포는 성공하고 첫 호출에서 죽는다.**
 * 그 실패는 여기서 잡지 않으면 라이브에서만 보인다. */
test('동봉 — lib 끼리의 require 가 풀려 실제로 import 된다', async () => {
  const 묶음 = 동봉묶기(path.join(__dirname, '..', 'supabase', 'functions', 'auth'));
  const m = await 임시import여럿('학생계정.mjs', 묶음);
  assert.strictEqual(typeof m.default.이메일, 'function', '이메일 함수가 default 로 나와야 한다');
  // 옆 모듈에서 온 값이 실제로 살아 있는지 — 껍데기만 통과하고 값이 undefined 면 여기서 죽는다.
  assert.strictEqual(m.default.이메일('SYNK-042'), 'synk042@synk.invalid');
});

test('동봉 — require 를 이름 있는 import 로 바꾸지 않는다 (껍데기는 default 만 낸다)', () => {
  /* 🔴 실측 2026-08-06: `import { 정규형 } from './로그인코드.mjs'` 로 바꿨더니 껍데기가
   *   `export default` 하나만 내보내는 탓에 **import 시점 SyntaxError** 였다.
   *   배포는 성공하고 첫 호출에서 죽는 모양이라, 파일 텍스트로 못박는다. */
  const 묶음 = 동봉묶기(path.join(__dirname, '..', 'supabase', 'functions', 'auth'));
  for (const [이름, src] of Object.entries(묶음)) {
    assert.ok(!/^\s*import\s*\{/m.test(src),
      `${이름}: 이름 있는 import 가 생겼다 — 껍데기는 default 만 내보내므로 import 에서 죽는다`);
    assert.ok(!/\brequire\s*\(/.test(src),
      `${이름}: require 가 남아 있다 — Deno 에는 require 가 없다`);
  }
});

test('동봉 — 표에 없는 파일을 require 하면 배포 전에 멈춘다', () => {
  /* 탐지력 픽스처: 실저장소가 아니라 **가짜 표**로 잰다(버그가 아직 있을 것을 요구하지 않는다). */
  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-동봉표-'));
  try {
    fs.writeFileSync(path.join(방, '동봉.json'),
      JSON.stringify({ '학생계정.mjs': 'lib/학생계정.js' }));   // 로그인코드를 일부러 뺐다
    assert.throws(() => 동봉묶기(방), /동봉 표에 없다/,
      '옆 파일이 표에 없는데 통과했다 — 그러면 함수가 라이브에서 import 에 실패한다');
  } finally {
    fs.rmSync(방, { recursive: true, force: true });
  }
});

test('동봉 — index.ts 가 import 하는데 표에 없으면 배포 전에 멈춘다', () => {
  /* `require풀기` 는 lib 끼리만 봤다 — 함수 본체가 부르는 것은 아무도 안 봤고, 빠뜨리면
   * 배포는 **성공하고** 첫 호출의 import 에서 죽는다(배포 로그는 초록이다). */
  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-본체import-'));
  try {
    fs.writeFileSync(path.join(방, '동봉.json'), JSON.stringify({ '오늘과제.mjs': 'lib/오늘과제.js' }));
    fs.writeFileSync(path.join(방, 'index.ts'),
      "import 과제 from './오늘과제.mjs';\nimport 토큰 from './토큰.mjs';\n");   // 토큰을 일부러 뺐다
    assert.throws(() => 동봉묶기(방), /토큰\.mjs/,
      '본체가 import 하는데 표에 없다 — 그러면 라이브가 첫 호출에서 죽는다');
  } finally {
    fs.rmSync(방, { recursive: true, force: true });
  }
});

test('동봉 — CJS 검증기가 ESM 으로 감싸여 실제로 import 된다', async () => {
  const 묶음 = 동봉묶기(함수디렉터리);
  const m = await 임시import('이벤트검증.mjs', 묶음['이벤트검증.mjs']);
  assert.strictEqual(typeof m.default.검증, 'function', '검증 함수가 default 로 나와야 한다');
});

test('동봉 — 계약 JSON 이 ESM 으로 감싸여 값목록을 그대로 낸다', async () => {
  const 묶음 = 동봉묶기(함수디렉터리);
  const m = await 임시import('계약.mjs', 묶음['계약.mjs']);
  assert.ok(Array.isArray(m.default.learning_events.값목록.event_type), 'event_type 값목록이 있어야 한다');
});

test('동봉 — 감싼 둘을 붙이면 계약 검증이 실제로 돈다(통과·거절 양쪽)', async () => {
  const 묶음 = 동봉묶기(함수디렉터리);
  const { default: 검증모듈 } = await 임시import('이벤트검증.mjs', 묶음['이벤트검증.mjs']);
  const { default: 계약 } = await 임시import('계약.mjs', 묶음['계약.mjs']);

  const 온전 = {
    idempotency_key: 'b6f1c0a2-0000-4000-8000-000000000001',
    event_type: 'submission.created',
    occurred_at: '2026-08-05T13:20:11.412Z',
    level_snapshot: 'Lv3',
    task_type: '숙제제출',
    submission: { task_ref: 'hw-1', task_format: '자유발화', body_original: '어제 밥을 먹었어요' },
  };
  assert.deepStrictEqual(검증모듈.검증(온전, 계약), { ok: true, 오류들: [] });

  // 서버 칸을 앱이 보내면 막혀야 한다 — 이게 뚫리면 위조가 통과처럼 보인다.
  const 위조 = { ...온전, learner_id: '00000000-0000-4000-8000-000000000000' };
  assert.strictEqual(검증모듈.검증(위조, 계약).ok, false);
});

test('동봉 — 배포되는 것은 작업본이 아니라 HEAD 다', () => {
  const 묶음 = 동봉묶기(함수디렉터리);
  const head = require('child_process')
    .execFileSync('git', ['show', 'HEAD:계약/수집_교정_계약.json'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.strictEqual(
    묶음['계약.mjs'].replace(/^export default /, '').replace(/;\n$/, '').replace(/\r\n/g, '\n'),
    head.replace(/\r\n/g, '\n'),
    '동봉된 계약이 HEAD 와 한 글자도 달라선 안 된다(옆 세션 미커밋 편집이 라이브로 나가는 자리)',
  );
});
