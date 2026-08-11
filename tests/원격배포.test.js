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

/* 번들 «기전»만 재는 검사는 미커밋검사를 끈다 — 켜 두면 결과가 내 코드가 아니라 **옆 세션의
 * 작업본 상태**에 달린다(2026-08-12 실측: 남의 미커밋 lib 둘에 이 파일이 통째로 죽었다 —
 * repo 밖 상태에 기대는 검사는 그 자리가 플레이크다). 검사 «자체»를 재는 테스트(F273·주입
 * 관통)는 스파이를 따로 주입하므로 이 상수를 안 쓴다. */
const 무검사 = () => {};

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
  const 묶음 = 동봉묶기(path.join(__dirname, '..', 'supabase', 'functions', 'auth'), 무검사);
  const m = await 임시import여럿('학생계정.mjs', 묶음);
  assert.strictEqual(typeof m.default.이메일, 'function', '이메일 함수가 default 로 나와야 한다');
  // 옆 모듈에서 온 값이 실제로 살아 있는지 — 껍데기만 통과하고 값이 undefined 면 여기서 죽는다.
  assert.strictEqual(m.default.이메일('SYNK-042'), 'synk042@synk.invalid');
});

test('동봉 — require 를 이름 있는 import 로 바꾸지 않는다 (껍데기는 default 만 낸다)', () => {
  /* 🔴 실측 2026-08-06: `import { 정규형 } from './로그인코드.mjs'` 로 바꿨더니 껍데기가
   *   `export default` 하나만 내보내는 탓에 **import 시점 SyntaxError** 였다.
   *   배포는 성공하고 첫 호출에서 죽는 모양이라, 파일 텍스트로 못박는다. */
  const 묶음 = 동봉묶기(path.join(__dirname, '..', 'supabase', 'functions', 'auth'), 무검사);
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
    assert.throws(() => 동봉묶기(방, 무검사), /동봉 표에 없다/,
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
    assert.throws(() => 동봉묶기(방, 무검사), /토큰\.mjs/,
      '본체가 import 하는데 표에 없다 — 그러면 라이브가 첫 호출에서 죽는다');
  } finally {
    fs.rmSync(방, { recursive: true, force: true });
  }
});

test('동봉 — CJS 검증기가 ESM 으로 감싸여 실제로 import 된다', async () => {
  const 묶음 = 동봉묶기(함수디렉터리, 무검사);
  const m = await 임시import('이벤트검증.mjs', 묶음['이벤트검증.mjs']);
  assert.strictEqual(typeof m.default.검증, 'function', '검증 함수가 default 로 나와야 한다');
});

test('동봉 — 계약 JSON 이 ESM 으로 감싸여 값목록을 그대로 낸다', async () => {
  const 묶음 = 동봉묶기(함수디렉터리, 무검사);
  const m = await 임시import('계약.mjs', 묶음['계약.mjs']);
  assert.ok(Array.isArray(m.default.learning_events.값목록.event_type), 'event_type 값목록이 있어야 한다');
});

test('동봉 — 감싼 둘을 붙이면 계약 검증이 실제로 돈다(통과·거절 양쪽)', async () => {
  const 묶음 = 동봉묶기(함수디렉터리, 무검사);
  const { default: 검증모듈 } = await 임시import('이벤트검증.mjs', 묶음['이벤트검증.mjs']);
  const { default: 계약 } = await 임시import('계약.mjs', 묶음['계약.mjs']);

  const 온전 = {
    idempotency_key: 'b6f1c0a2-0000-4000-8000-000000000001',
    event_type: 'submission.created',
    occurred_at: '2026-08-05T13:20:11.412Z',
    level_snapshot: 'Lv3',
    // ⚠ **손으로 적은 「온전한 사건」이라 계약이 필수를 늘리면 여기가 빨개진다** — 그게 맞다:
    //   이 검사가 재는 것은 「감싼 검증기가 실제로 돈다」이고, 그러려면 통과하는 사건이 진짜
    //   통과해야 한다. 필수 목록의 정본은 `lib/이벤트검증.js` 다(여기 베낀 것이 아니다).
    correlation_id: 'b6f1c0a2-0000-4000-8000-0000000000c1',
    task_type: '숙제제출',
    submission: {
      task_ref: 'hw-1', task_format: '자유발화', body_original: '어제 밥을 먹었어요',
      task_snapshot: { ver: 1, 문항: '어제 뭐 했어요?' },
    },
  };
  assert.deepStrictEqual(검증모듈.검증(온전, 계약), { ok: true, 오류들: [] });

  // 서버 칸을 앱이 보내면 막혀야 한다 — 이게 뚫리면 위조가 통과처럼 보인다.
  const 위조 = { ...온전, learner_id: '00000000-0000-4000-8000-000000000000' };
  assert.strictEqual(검증모듈.검증(위조, 계약).ok, false);
});

test('동봉 — 배포되는 것은 작업본이 아니라 HEAD 다', () => {
  const 묶음 = 동봉묶기(함수디렉터리, 무검사);
  const head = require('child_process')
    .execFileSync('git', ['show', 'HEAD:계약/수집_교정_계약.json'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.strictEqual(
    묶음['계약.mjs'].replace(/^export default /, '').replace(/;\n$/, '').replace(/\r\n/g, '\n'),
    head.replace(/\r\n/g, '\n'),
    '동봉된 계약이 HEAD 와 한 글자도 달라선 안 된다(옆 세션 미커밋 편집이 라이브로 나가는 자리)',
  );
});

/* ── 미커밋 편집 (2026-08-09 실측 사고 · F273) ───────────────────────────────
 * 🔴 위 검사는 **동봉만** 봤다. 본체(`index.ts`)는 작업본에서 읽고 있어서, 본체와 lib 을 함께
 *   고친 커밋 **전** 배포가 **반쪽으로** 나갔다 — 새 index.ts + 옛 lib → 배포는 ✅, 첫 호출에서
 *   `길이초 is not a function`. 경고문이 lib 이름만 부르며 「미커밋 편집은 안 나간다」고 말해
 *   **안전하다고 읽히기까지 했다**(새는 방향이 언제나 「통과」인 그 모양).
 * 🔑 판정을 순수 함수로 내려 여기서 못박는다 — `판뒤처짐` 과 같은 자리·같은 이유다. */
const { 작업본다름 } = require('../tools/원격배포.js');
const 머리 = (p) => require('child_process')
  .execFileSync('git', ['show', `HEAD:${p}`], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });

test('미커밋 — 작업본이 HEAD 와 한 글자만 달라도 다르다고 판정한다', () => {
  const p = '계약/수집_교정_계약.json';
  assert.strictEqual(작업본다름(p, 머리(p) + 'x'), true,
    '이걸 못 가르면 고친 절반만 라이브에 서고, 깨진 것은 다음 호출자가 본다(F273)');
});

test('미커밋 — 같으면 통과한다 (드물게 울려야 무게가 있다)', () => {
  const p = '계약/수집_교정_계약.json';
  assert.strictEqual(작업본다름(p, 머리(p)), false,
    '깨끗한 작업본에서 울리면 배포가 상시로 막히고, 상시 경보는 곧 우회로가 된다(F103)');
  /* 🔴 줄끝만 다른 것은 「다르다」가 아니다 — Windows 체크아웃(`core.autocrlf`)에서 작업본은
   *   CRLF, `git show` 는 LF 라 정규화를 빼면 **모든 파일이 항상 다르다**고 나온다.
   *   그 거짓양성은 「막혔다」로 보여서 더 나쁘다: 배포가 상시로 막히면 우회가 정상 통로가 된다.
   *   ⚠ 이 자리는 원래 검사가 하나도 없었다(2026-08-09 변이시험이 통과해서 드러났다). */
  assert.strictEqual(작업본다름(p, 머리(p).replace(/\n/g, '\r\n')), false,
    '줄끝 차이를 편집으로 세면 이 저장소는 Windows 에서 영원히 배포가 막힌다');
});

test('미커밋 — 작업본에 없는 경로는 「같다」다 (이 판정의 축이 아니다)', () => {
  assert.strictEqual(작업본다름('있을리없는경로_F273.txt', '아무거나'), false);
});

/* ── 나갈 것 전량 (2026-08-09 · F274) ────────────────────────────────────────
 * `배포묶음` 을 뽑아낸 이유는 `배포대조.js` 가 **본체를 한 번도 안 봤기** 때문이다(그 탐지는
 * `tests/배포대조.test.js` ⑨ 가 진다). 여기서 재는 것은 뽑아내면서 잃기 쉬운 쪽 —
 * **본체가 미커밋검사를 계속 지나는가**(F273 의 보호). 묶음 «내용»만 보는 검사는 그 상실을 못 본다. */
const { 배포묶음 } = require('../tools/원격배포.js');

test('나갈 것 — 본체가 묶음에 들고, 본체도 파일검사를 지난다 (F274 로 뽑아내며 F273 을 잃지 않았나)', () => {
  const 검사한것 = [];
  const 묶음 = 배포묶음(함수디렉터리, (경로) => 검사한것.push(경로));
  assert.ok(묶음['index.ts'], '본체가 나갈 것에 없다 — 대조가 다시 동봉만 보게 된다(F274)');
  assert.ok(검사한것.some((p) => p.endsWith('/index.ts')),
    `본체가 미커밋검사를 안 지났다 — 반쪽 배포가 그대로 돌아온다(F273): ${JSON.stringify(검사한것)}`);

  /* 🔑 기본값만은 **소스로** 못박는다 — 기본이 no-op 으로 바뀌어도 깨끗한 작업본에서는 동작이
   *   똑같아서(검사할 차이가 없어서) 어떤 왕복·단위 검사도 그 상실을 못 본다. 문구 검사의
   *   약점(도달 불가를 못 본다)은 바로 위 두 단언이 실제로 돌려서 메운다. */
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'tools', '원격배포.js'), 'utf8'),
    /function 배포묶음\(디렉터리, 파일검사 = 미커밋검사\)/,
    '배포묶음 의 기본 검사가 미커밋검사가 아니다 — 배포가 무검사로 돈다');
});

/* 🔴 2026-08-12 실측: 위 훅 주입이 **동봉에는 안 닿았다** — `동봉묶기` 가 `미커밋검사` 를 직접
 * 불러 같은 판정이 두 곳에 살았고, 주입을 끈 읽기 대조(`배포대조.왕복전게이트`)가 남의 미커밋
 * `lib/교정엔진.js` **하나**에 왕복시험 발화점 전부가 죽었다(230행 주석이 약속한 그 실패 — F073·F103).
 * 검사 축: 훅이 동봉 경로 **전량**에 실제로 닿는가(실행) + 기본값은 여전히 막는가(소스 핀 —
 * 깨끗한 작업본에선 no-op 과 미커밋검사가 같은 동작이라 실행으로는 그 상실을 못 본다). */
test('나갈 것 — 동봉도 «주입된» 파일검사를 지난다 (남의 미커밋 lib 하나가 읽기 대조를 죽이던 자리)', () => {
  const 동봉경로들 = Object.values(
    JSON.parse(fs.readFileSync(path.join(함수디렉터리, '동봉.json'), 'utf8')));
  assert.ok(동봉경로들.length > 0, '분모가 0이다 — 동봉 있는 함수를 골라야 이 검사가 성립한다(F207)');
  const 검사한것 = [];
  배포묶음(함수디렉터리, (경로) => 검사한것.push(경로));
  for (const p of 동봉경로들) {
    assert.ok(검사한것.includes(p),
      `동봉 ${p} 이 주입 파일검사를 안 지났다 — 직접 미커밋검사로 되돌아가면 읽기 대조가 남의 작업본에 도로 죽는다`);
  }
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'tools', '원격배포.js'), 'utf8'),
    /function 동봉묶기\(디렉터리, 파일검사 = 미커밋검사\)/,
    '동봉묶기 의 기본 검사가 미커밋검사가 아니다 — 배포 경로의 F273 보호를 잃었다');
});

/* ── DB 판 대조 (2026-08-08 실측 사고) ─────────────────────────────────────
 * 🔴 `deliver` 를 HEAD 에서 리허설에 올렸더니 **배포는 ✅**, 그 다음 배치가 전건 실패했다:
 *   `column "due_at" of relation "submissions" does not exist`. c10 커밋이 코드와
 *   마이그레이션을 같이 냈는데 마이그레이션만 안 적용된 DB 였다.
 * 🔑 급소는 「깨진 것을 배포한 사람이 안 본다」는 것이다 — 보는 사람은 **다음 호출자**고,
 *   공유 환경이면 남이다. 그래서 판정을 배포 **전** 순수 함수로 옮기고 여기서 못박는다.
 * ⚠ 여기서 재는 것은 판정이지 네트워크가 아니다(실저장소 대조는 배포 시점이 진다).
 */
const { 저장소판, 판뒤처짐 } = require('../tools/원격배포.js');
const 저장소 = { 파일: '20260808010000_engine_c10.sql', 판: 'c10' };

test('판 대조 — DB 가 뒤처지면 막는다(배포는 성공하고 다음 호출이 죽는 자리)', () => {
  const 말 = 판뒤처짐(저장소, '20260807170000_engine_c8.sql', null);
  assert.ok(말 && /c10/.test(말) && /c8/.test(말), `막지 않았다: ${말}`);
});

test('판 대조 — 같거나 DB 가 앞서면 통과한다(함수는 DB 판을 스스로 낮춰 답한다)', () => {
  assert.strictEqual(판뒤처짐(저장소, '20260808010000_engine_c10.sql', null), null);
  assert.strictEqual(판뒤처짐(저장소, '20260809000000_engine_c11.sql', null), null);
});

/* 🔴 못 읽은 것은 통과가 아니다 — 「애매하면 통과」하는 가드는 가드가 아니고, 새는 방향은 늘 통과다. */
test('판 대조 — 못 읽으면 막는다 (읽기 실패·기록 없음·이름 깨짐 전부)', () => {
  assert.ok(판뒤처짐(저장소, null, 'HTTP 500'), '읽기 실패가 통과했다');
  assert.ok(판뒤처짐(저장소, null, null), 'schema_migrations 기록 없음이 통과했다');
  assert.ok(판뒤처짐(저장소, '이름이_이상하다.sql', null), '판 이름을 못 읽었는데 통과했다');
  assert.ok(판뒤처짐({ 파일: null, 판: null }, '20260807170000_engine_c8.sql', null),
    '저장소에 마이그레이션이 없는데 통과했다');
});

test('판 대조 — 저장소 판은 손 상수가 아니라 마이그레이션 파일 이름에서 나온다', () => {
  const v = 저장소판(path.join(__dirname, '..'));
  assert.match(v.판, /^c\d+$/, '실저장소에서 판을 못 읽었다');
  assert.match(v.파일, /^\d{14}_.+_c\d+\.sql$/u);
});

/* ── 텍스트(.md) 동봉 (2026-08-09 신설) ─────────────────────────────────────
 * `prompts/교정.md` 는 **원문 자체가 정본**이다(교정 엔진의 지시문). 실어 보낼 통로가 없으면
 * 그 원문을 코드에 베끼게 되고, 베낀 프롬프트는 `evals` 가 채점하는 것과 제품이 실제로 보내는
 * 것을 갈라 놓는다 — **갈라진 채로도 양쪽 다 초록**이라 증상이 없다.
 * 🔴 마크다운엔 백틱·역슬래시·따옴표가 흔하다. 템플릿 리터럴로 감싸면 프롬프트 한 줄이
 *   배포 산출물의 **구문 오류**가 되고, 그 실패는 배포가 아니라 첫 호출에서 난다. */
test('동봉 — .md 는 문자열 모듈이 되어 원문 그대로 import 된다', async () => {
  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-동봉md-'));
  try {
    fs.writeFileSync(path.join(방, '동봉.json'),
      JSON.stringify({ '교정프롬프트.mjs': 'prompts/교정.md' }));
    const 묶음 = 동봉묶기(방, 무검사);
    const m = await 임시import('교정프롬프트.mjs', 묶음['교정프롬프트.mjs']);
    const 원문 = fs.readFileSync(path.join(__dirname, '..', 'prompts', '교정.md'), 'utf8');
    assert.equal(m.default, 원문, '동봉된 프롬프트가 원문과 다르다 — 베낀 것과 같아진다');
  } finally {
    fs.rmSync(방, { recursive: true, force: true });
  }
});

test('동봉 — 백틱·역슬래시·따옴표가 든 텍스트도 깨지지 않는다', async () => {
  /* 탐지력은 픽스처가 진다: 실물 프롬프트가 오늘 마침 안전한 글자만 쓰더라도, 내일 한 줄이
   * 더해지면 깨진다. 그 하루를 배포 뒤에 알게 되면 안 된다. */
  const 위험 = '```json\n{ "a": "b\\\\c" }\n```\n`백틱` 과 \'따옴표\' 와 ${템플릿}';
  const m = await 임시import('위험.mjs', `export default ${JSON.stringify(위험)};\n`);
  assert.equal(m.default, 위험);
});
