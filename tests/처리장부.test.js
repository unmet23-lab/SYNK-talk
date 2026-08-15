'use strict';
/**
 * 처리 장부 회귀 — 「건 단위 실패의 «왜» 가 DB 에 남는가」 (2026-08-15 · 조용한 실패 ③)
 *
 * 발단(실측): `engine.pipeline_jobs` 는 08-06 부터 `last_error`·`attempt_count` 를 들고 있었고
 *   저장소 전체에서 **writer 0 · reader 0** 이었다. `correct/index.ts` 는 그 옆 표를 안 보고
 *   「영구 실패도 못박을 칸이 없다」고 주석에 단정한 채, 건별 사유를 `console.error` 로만 보냈다.
 *   무료 플랜 로그 보존은 1일이라 그 사유는 하루 뒤 흔적이 0이다.
 *
 * 🔑 이 회귀가 지키는 것 넷:
 *   ① 탐지력은 **픽스처**로 못박는다 — 실저장소 소스는 바뀌고, 바뀌면 탐지가 조용히 0건이 된다.
 *   ② `status` 를 **안 건드린다**가 이 설계의 판정이다. 그 판정이 코드에서 뒤집히면 빨개진다
 *      (`'failed'` 는 두 차단 목록 어디에도 안 걸려 값이 0이고, 걸리게 만들면 발화가 영구 제외된다).
 *   ③ 장부가 죽어도 **파이프라인은 안 죽는다** — 관측이 관측 대상을 무너뜨리면 안 된다.
 *   ④ **등록층** — 건 단위 실패 자리가 새로 생기면 빨개진다. 자리를 손으로 안 적고 소스에서 뽑아,
 *      「`센다(버림, …)` 하면서 `submission_id` 를 쥔 블록」 전부가 장부에 적는지 본다.
 *      장치를 만드는 것과 그 장치가 새 자리를 덮는 것은 다른 일이다(CLAUDE.md 신뢰성).
 *
 * ⚠ 이 검사는 소스와 **가짜 sql** 을 본다 — 「진짜 DB 에 값이 앉는가」는 왕복시험의 몫이다.
 *   여기서 막는 것은 배선이 통째로 사라지는 것이고, 그게 실제로 일어난 사고 모양이다.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { 사유상한, 사유줄, 실패적기, 성공적기 } = require('../lib/처리장부.js');

/**
 * postgres.js 태그드 템플릿의 **가짜**. 부른 문장과 값을 그대로 쥔다.
 * @param {object} [옵션]
 * @param {unknown[]} [옵션.돌려줄] UPDATE 의 `returning` 결과(빈 배열 = 0행)
 * @param {Error} [옵션.던질] 주면 그 예외를 던진다
 */
function 가짜sql({ 돌려줄 = [{ job_id: 'j1' }], 던질 = null } = {}) {
  const 기록 = [];
  const f = (strings, ...values) => {
    기록.push({ 문: strings.raw.join(' ? '), 값: values });
    return 던질 ? Promise.reject(던질) : Promise.resolve(돌려줄);
  };
  f.기록 = 기록;
  return f;
}

/** 마지막으로 부른 SQL 한 덩이(공백을 접어 검사하기 쉽게). */
const 마지막문 = (sql) => (sql.기록.length ? sql.기록[sql.기록.length - 1].문.replace(/\s+/g, ' ').trim() : '');

// ── ① 사유줄 — 갈래가 먼저다 ───────────────────────────────────────────────

test('🔑 사유줄 — 갈래를 **앞**에 둔다(벤더말이 상한을 먹어도 «무엇이 죽었나»가 남는다)', () => {
  const 긴말 = 'x'.repeat(사유상한 * 2);
  const 줄 = 사유줄('벤더_영구:401', 긴말);
  assert.ok(줄.startsWith('벤더_영구:401'), `갈래가 앞이 아니다 — ${줄.slice(0, 40)}`);
  assert.strictEqual(줄.length, 사유상한, '상한으로 안 잘렸다 — 장부는 로그가 아니다');
});

test('🔑 사유줄 — 벤더말이 없어도 빈손으로 안 돌아온다', () => {
  assert.strictEqual(사유줄('응답형식밖', null), '응답형식밖');
  assert.strictEqual(사유줄('응답형식밖', '  '), '응답형식밖');
});

test('🔴 사유줄 — 갈래가 비면 null 이다(빈 문자열로 «사유가 있다»를 위장하지 않는다)', () => {
  assert.strictEqual(사유줄('', '벤더가 뭐라 했다'), null);
  assert.strictEqual(사유줄(null, null), null);
});

// ── ② 실패적기 — 무엇을 만지고 무엇을 안 만지나 ────────────────────────────

test('🔑 실패적기 — `pipeline_jobs` 의 last_error·attempt_count 를 그 건에만 적는다', async () => {
  const sql = 가짜sql();
  const r = await 실패적기(sql, 'sub-1', '벤더_영구:401', 'invalid_api_key: 키가 틀렸다');
  assert.strictEqual(r, '적힘');

  const 문 = 마지막문(sql);
  assert.match(문, /update engine\.pipeline_jobs/, 'pipeline_jobs 를 안 친다');
  assert.match(문, /last_error\s*=/, 'last_error 를 안 적는다');
  assert.match(문, /attempt_count\s*=\s*attempt_count\s*\+\s*1/, 'attempt_count 를 안 올린다');
  assert.match(문, /where submission_id\s*=/, '그 건으로 안 좁힌다 — 표 전체를 칠 뻔했다');

  const 값 = sql.기록[0].값;
  assert.ok(값.includes('sub-1'), '어느 건인지가 값에 안 실렸다');
  assert.ok(값.some((v) => typeof v === 'string' && v.startsWith('벤더_영구:401')),
    '사유가 값에 안 실렸다 — 문장만 맞고 내용이 빈 자리');
});

test('🔴 실패적기 — **`status` 를 안 건드린다**(이 설계의 판정 · 뒤집히면 여기서 빨개진다)', async () => {
  /* 🔴 왜 회귀로 못박나: `job_status` 에 `'failed'` 가 있어서 「실패니까 failed 로 바꾸자」가
   *   자연스러워 보인다. 그런데 ①그 값은 `correct` 대기조건에도 `review_queue` 에도 차단 목록에
   *   없어 **행이 큐에서 안 빠진다**(값 0 · 거짓 표식만 남는다) ②실제로 빠지게 고치면 한 번 죽은
   *   발화가 **영구 제외**된다 — `correct` 머리말이 명시적으로 금지한 오염이다.
   *   즉 이 두 칸만 만지는 것이 판정이고, 판정은 프로즈가 아니라 여기서 지켜져야 한다. */
  const sql = 가짜sql();
  await 실패적기(sql, 'sub-1', '벤더_영구:401', null);
  const 문 = 마지막문(sql);
  assert.doesNotMatch(문, /\bstatus\b/,
    'status 를 만졌다 — lib/처리장부.js 머리말의 판정을 뒤집는 변경이다(둘 다 읽고 오라)');
  assert.doesNotMatch(문, /\bdiscard_reason\b|\blease_until\b|\battempt_id\b/,
    '이 배선이 지기로 한 칸 밖을 만졌다');
});

test('🔴 실패적기 — 0행은 통과가 아니다(`잡없음` = 생성 트리거가 안 돌았다)', async () => {
  const sql = 가짜sql({ 돌려줄: [] });
  assert.strictEqual(await 실패적기(sql, 'sub-1', '예외', null), '잡없음');
});

test('🔴 실패적기 — 장부가 죽어도 **던지지 않는다**(관측이 파이프라인을 무너뜨리면 안 된다)', async () => {
  const sql = 가짜sql({ 던질: new Error('connection reset') });
  assert.strictEqual(await 실패적기(sql, 'sub-1', '예외', null), '장부실패');
});

test('🔑 실패적기 — 붙일 건이 없으면 sql 을 아예 안 부른다', async () => {
  const sql = 가짜sql();
  assert.strictEqual(await 실패적기(sql, null, '결과형식밖', null), '대상없음');
  assert.strictEqual(await 실패적기(sql, 'sub-1', '', null), '대상없음');
  assert.strictEqual(sql.기록.length, 0, '대상이 없는데 DB 를 쳤다');
});

test('🔑 성공적기 — 이전 실패 사유를 **지운다**(안 지우면 성공한 행이 영원히 실패로 보인다)', async () => {
  const sql = 가짜sql();
  assert.strictEqual(await 성공적기(sql, 'sub-1'), '적힘');
  const 문 = 마지막문(sql);
  assert.match(문, /last_error\s*=\s*null/, '성공인데 사유를 안 지운다');
  assert.doesNotMatch(문, /\bstatus\b/, '성공 정리가 status 를 만졌다');
});

// ── ③ 등록층 — 건 단위 실패 자리가 늘면 빨개진다 ───────────────────────────

/**
 * `src[i]` 를 **감싸는 블록** 하나를 통째로 떼어 온다(중괄호 깊이).
 *
 * 🔴 **왜 구역을 떼나** — 파일 전문에서 낱말을 찾으면 「어딘가 `장부에` 가 있다」와 「이 실패 자리가
 *   적는다」가 한 검사로 접힌다. `tests/조용한실패.test.js` 초판이 정확히 그리로 새서 변이 4 중
 *   2 를 놓쳤다(2026-08-15 실측). 같은 실수를 두 번 하지 않는다.
 * @returns {string|null}
 */
function 감싼블록(src, i) {
  let 깊이 = 0; let 시작 = -1;
  for (let j = i; j >= 0; j -= 1) {
    if (src[j] === '}') 깊이 += 1;
    else if (src[j] === '{') { if (깊이 === 0) { 시작 = j; break; } 깊이 -= 1; }
  }
  if (시작 < 0) return null;
  let d = 0;
  for (let j = 시작; j < src.length; j += 1) {
    if (src[j] === '{') d += 1;
    else if (src[j] === '}') { d -= 1; if (d === 0) return src.slice(시작, j + 1); }
  }
  return null;
}

/**
 * 그 소스에서 **건 단위 실패 자리**를 뽑는다 — `센다(버림, …)` 하면서 그 블록이 `submission_id` 를
 * 쥐고 있는 자리. 배치 단위 실패(회차가 통째로 죽는 자리)는 붙일 건이 없으니 대상이 아니다.
 * @returns {{블록: string, 적나: boolean}[]}
 */
function 건단위실패자리(src) {
  const 자리 = [];
  for (const m of src.matchAll(/센다\(버림,/g)) {
    const 블록 = 감싼블록(src, m.index);
    if (블록 == null) continue;
    if (!/submission_id/.test(블록)) continue;      // 배치 단위 — 붙일 건이 없다
    자리.push({ 블록, 적나: /장부에\s*\(/.test(블록) });
  }
  return 자리;
}

test('🔴 탐지력 — 세기만 하고 장부에 안 적는 자리를 잡는다 (고치기 «전»의 그 모양)', () => {
  const 나쁜소스 = `
    for (const 행 of 행들) {
      if (!r.ok) {
        console.error('[correct] 벤더 실패', 행.submission_id, r.status, 글);
        센다(버림, '벤더_영구:401');
        미룸 += 1;
        continue;
      }
    }`;
  const 자리 = 건단위실패자리(나쁜소스);
  assert.strictEqual(자리.length, 1, '자리를 못 뽑았다 — 0건은 통과가 아니다');
  assert.strictEqual(자리[0].적나, false);
});

test('🔴 탐지력 — **파일 어딘가엔 있는데 그 블록엔 없는** 것을 잡는다 (전문 grep 이 뚫리는 자리)', () => {
  const 낚는소스 = `
    await 장부에(딴자리.submission_id, '예외');
    for (const 행 of 행들) {
      if (!r.ok) {
        console.error('[correct] 벤더 실패', 행.submission_id, r.status);
        센다(버림, '벤더_영구:401');
        미룸 += 1; continue;
      }
    }`;
  const 낚임 = 건단위실패자리(낚는소스);
  assert.strictEqual(낚임.length, 1, '자리를 못 뽑았다 — 0건은 통과가 아니다');
  assert.strictEqual(낚임[0].적나, false,
    '전문에 `장부에` 가 있다는 이유로 통과시켰다 — 이 회귀의 존재 이유가 무너진다');
});

test('🔑 탐지력 — 배치 단위 실패(붙일 건이 없는 자리)는 대상이 아니다', () => {
  const 배치소스 = `
    if (키어긋남.length) {
      console.error('[correct] custom_id 규격 밖');
      센다(버림, '키규격밖');
      return 봉투(200, {});
    }`;
  assert.deepStrictEqual(건단위실패자리(배치소스), [],
    'submission_id 가 없는 자리까지 요구하면 따를 수 없는 처방이 된다(F103)');
});

test('🔑 탐지력 — 적으면 통과한다 (고친 뒤의 모양)', () => {
  const 좋은소스 = `
      if (!r.ok) {
        센다(버림, 갈래);
        await 장부에(행.submission_id, 갈래, 벤더사유(글));
        미룸 += 1; continue;
      }`;
  assert.strictEqual(건단위실패자리(좋은소스)[0].적나, true);
});

// ── ④ 실저장소 — 거짓양성만 + 분모를 드러낸다 ──────────────────────────────

test('🔑 실저장소 — `correct` 의 건 단위 실패 자리가 **전부** 장부에 적는다 (분모를 드러낸다)', () => {
  const p = path.join(ROOT, 'supabase', 'functions', 'correct', 'index.ts');
  const 자리 = 건단위실패자리(fs.readFileSync(p, 'utf8'));

  /* 🔴 0건은 통과가 아니다 — 뽑기가 죽으면 이 검사는 어떤 소스든 초록으로 만든다(F207). */
  assert.ok(자리.length >= 7,
    `건 단위 실패 자리를 ${자리.length}개만 뽑았다 — 실측 7곳이다(배치 단위 3곳은 대상이 아니라 뺐다 · `
    + `2026-08-15). 줄었으면 «자리가 사라졌나»와 «뽑기가 죽었나»를 먼저 가른다 — 0건은 통과와 같은 얼굴이다.`);

  const 안적는것 = 자리.filter((z) => !z.적나);
  assert.deepStrictEqual(안적는것.map((z) => z.블록.slice(0, 80)), [],
    `세기만 하고 장부에 안 적는 자리 ${안적는것.length}건 — 그 실패는 하루 뒤 흔적이 0이 된다.`);
});

test('🔑 실저장소 — 장부를 쓰는 함수는 동봉표에 그 모듈이 있다(없으면 배포는 ✅ 이고 첫 호출에서 죽는다)', () => {
  const 방 = path.join(ROOT, 'supabase', 'functions');
  const 검사됨 = [];
  for (const 이름 of fs.readdirSync(방)) {
    const p = path.join(방, 이름, 'index.ts');
    if (!fs.existsSync(p)) continue;
    if (!/from '\.\/처리장부\.mjs'/.test(fs.readFileSync(p, 'utf8'))) continue;
    const 표 = path.join(방, 이름, '동봉.json');
    assert.ok(fs.existsSync(표), `${이름}: 처리장부.mjs 를 import 하는데 동봉.json 이 없다`);
    assert.strictEqual(JSON.parse(fs.readFileSync(표, 'utf8'))['처리장부.mjs'], 'lib/처리장부.js',
      `${이름}: 동봉표에 처리장부.mjs 가 없다 — 배포는 성공하고 함수가 import 에서 죽는다`);
    검사됨.push(이름);
  }
  assert.ok(검사됨.length >= 1, '처리장부를 쓰는 함수가 0개다 — 배선이 통째로 사라졌다');
});
