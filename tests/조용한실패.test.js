'use strict';
/**
 * 조용한 실패 회귀 — 「아무도 안 보는 호출의 실패가 응답에 남는가」 (2026-08-15 · 유호 승인)
 *
 * 발단(실측): `pg_cron` 이 부르는 넷은 `net.http_post` 라 **응답을 아무도 안 읽는다**. 그런데
 *   실패 사유는 `console.error` 에만 있었고, 무료 플랜의 Edge 로그 보존은 **1일**이다. 즉 실패는
 *   하루 뒤 흔적이 0이 된다. #Q83(교정 배치가 400 으로 396건 전량 튕김)이 며칠 늦은 자리가
 *   정확히 그 모양이었고, 같은 모양이 `transcribe` 에 그대로 남아 있었다(10분마다 · 하루 144회).
 *
 * 🔑 이 회귀가 지키는 것 셋:
 *   ① 탐지력은 **픽스처**로 못박는다 — 실저장소 소스는 언제든 바뀌고, 바뀌면 탐지 검사가
 *      조용히 0건이 된다(그리고 0건은 통과와 같은 얼굴이다).
 *   ② 실저장소에는 **거짓양성만** 묻는다 + 분모를 드러낸다.
 *   ③ **등록층** — cron 목록을 손으로 안 적는다. 마이그레이션에서 뽑아 내가 아는 넷과 대조하고,
 *      다섯째가 걸리면 **빨개진다**. 장치를 만드는 것과 그 장치가 새 자리를 덮는 것은 다른 일이고,
 *      가드는 로직보다 등록층에서 샌다(CLAUDE.md 신뢰성).
 *
 * ⚠ 이 검사는 소스 문자열을 본다 — 「응답에 실제로 그 값이 담기는가」까지는 못 잰다(그건 왕복시험의
 *   몫이다). 여기서 막는 것은 **칸이 통째로 사라지는 것**이고, 그게 실제로 일어난 사고 모양이다.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/**
 * 마이그레이션에서 `cron.schedule` 이 실제로 **부르는 함수 이름**을 뽑는다.
 * 🔑 잡 이름(`transcribe-batch`)이 아니라 URL 의 함수 slug 를 본다 — 잡 이름은 사람이 짓는 별명이라
 *   함수와 안 맞을 수 있고, 실제로 도는 것은 URL 쪽이다.
 * @param {string} 방 저장소 뿌리
 * @returns {string[]} 정렬된 함수 slug
 */
function cron함수들(방) {
  const 방마이그 = path.join(방, 'supabase', 'migrations');
  if (!fs.existsSync(방마이그)) return [];
  const 찾음 = new Set();
  for (const 이름 of fs.readdirSync(방마이그).filter((n) => n.endsWith('.sql'))) {
    const src = fs.readFileSync(path.join(방마이그, 이름), 'utf8');
    /* `cron.schedule` 이 있는 파일에서만 센다 — 마이그레이션엔 주석·확인 쿼리에도 `/deliver` 같은
     * 글자가 섞이므로, 스케줄을 실제로 거는 파일로 먼저 좁힌다. */
    if (!/cron\.schedule\s*\(/.test(src)) continue;
    for (const m of src.matchAll(/\|\|\s*'\/([a-z][a-z0-9-]*)/g)) 찾음.add(m[1]);
  }
  return [...찾음].sort();
}

/**
 * 앵커가 가리키는 **객체 리터럴 한 덩이**를 통째로 떼어 온다(중괄호 깊이로 센다).
 *
 * 🔴 **왜 구역을 떼나** — 초판은 파일 «전문»에서 낱말을 찾았고, 변이 시험에서 **2/4 를 놓쳤다**:
 *   `사유` 를 봉투에서 빼도 `센다(사유, …)` 가 파일에 남아 검사는 초록이었다. 「그 낱말이 어딘가
 *   있다」와 「응답에 실린다」는 다른 사실인데 한 검사로 접혀 있었던 것이다 — 가드가 안 도는 쪽이
 *   아니라 **맞는 얼굴로 틀린 값을 내는 쪽**으로 샌 자리다(CLAUDE.md 신뢰성 맹점 ④).
 * @param {string} src 전문
 * @param {RegExp} 앵커 응답 몸통이 시작되는 자리(전역 플래그 필요 — **마지막** 매치를 쓴다)
 * @returns {string|null} 그 객체 리터럴 원문
 */
function 객체구역(src, 앵커) {
  let 마지막 = null;
  for (const m of src.matchAll(앵커)) 마지막 = m;
  if (!마지막) return null;
  const 시작 = src.indexOf('{', 마지막.index);
  if (시작 < 0) return null;
  let 깊이 = 0;
  for (let i = 시작; i < src.length; i += 1) {
    if (src[i] === '{') 깊이 += 1;
    else if (src[i] === '}') { 깊이 -= 1; if (깊이 === 0) return src.slice(시작, i + 1); }
  }
  return null;
}

/**
 * 그 함수가 **응답 몸통에** 사유 칸을 싣는가.
 * @param {string} 구역 응답 몸통 원문(`객체구역` 의 산출)
 * @param {string[]} 키들 그 함수가 지기로 한 칸 이름들
 * @returns {string[]} 없는 칸(비어 있으면 통과)
 */
function 빠진사유칸(구역, 키들) {
  if (구역 == null) return [...키들];   // 몸통을 못 찾은 것은 통과가 아니다
  return 키들.filter((k) => !new RegExp(`[{,\\s]${k}\\s*[,:}]`).test(구역));
}

/* 🔴 함수마다 **무엇을 싣기로 했는지**를 이름으로 적는다 — 「사유 비슷한 게 하나라도 있으면 통과」로
 *   두면 그 검사는 어떤 소스든 통과시킨다(허용목록이 넓으면 가드가 아니라 장식이다).
 * ⚠ `앵커` 가 함수마다 다른 이유: `transcribe` 는 봉투 안에서 몸통을 짓고, `deliver` 는 `const 몸`
 *   으로 먼저 지어 `봉투(200, 몸)` 으로 넘긴다. 앵커를 하나로 우기면 후자를 영영 못 본다. */
const 지기로한칸 = {
  transcribe: { 앵커: /return 봉투\(\s*200\s*,\s*\{/g, 키들: ['사유', '벤더사유'] },
  deliver: { 앵커: /const 몸 = \{/g, 키들: ['실패', '건너뜀', '상태없음', '회수실패'] },
  // 실패는 500 으로 나간다(200 에 접히지 않는다) — 그래서 200 몸통엔 제외 계수만 있으면 된다.
  'radio-promote': { 앵커: /return 봉투\(\s*200\s*,\s*\{/g, 키들: ['제외'] },
};

// ── ① 탐지력 (픽스처) ──────────────────────────────────────────────────────

const 봉투앵커 = /return 봉투\(\s*200\s*,\s*\{/g;
const 구역 = (src, 앵커 = 봉투앵커) => 객체구역(src, new RegExp(앵커.source, 'g'));

test('🔴 탐지력 — 잡아서 로그만 찍고 200 으로 가는 소스를 잡는다 (#Q83·transcribe 의 그 모양)', () => {
  const 나쁜소스 = `
    if (!r.ok) {
      const 글 = (await r.text()).slice(0, 300);
      console.error('[가짜] 벤더 실패', r.status, 글);
      미룸 += 1;
      continue;
    }
    return 봉투(200, { 대기: 대기수, 집음: 행들.length, 전사: 성공, 미룸 });
  `;
  assert.deepStrictEqual(빠진사유칸(구역(나쁜소스), ['사유', '벤더사유']), ['사유', '벤더사유']);
});

test('🔴 탐지력 — **파일 어딘가엔 있는데 봉투엔 없는** 것을 잡는다 (변이 1·2 가 뚫은 자리)', () => {
  /* 🔴 이 픽스처가 이 회귀의 존재 이유다. 초판은 파일 전문을 봤고, 그래서 봉투에서 `사유` 를
   *   빼도 `센다(사유, …)` 한 줄이 남아 **초록**이었다(변이 시험 2/4 실패 · 2026-08-15 실측).
   *   지금 형태는 봉투 구역만 본다 — 아래 소스는 `사유` 를 세 번 쓰지만 응답엔 안 싣는다. */
  const 낚는소스 = `
    const 사유 = {};
    센다(사유, '벤더:400');
    console.error('사유는 로그에만 있다', 사유);
    return 봉투(200, { 대기: 대기수, 미룸, 벤더사유: 첫벤더말 });
  `;
  assert.deepStrictEqual(빠진사유칸(구역(낚는소스), ['사유', '벤더사유']), ['사유']);
});

test('🔑 탐지력 — 사유 칸을 실으면 통과한다 (고친 뒤의 모양)', () => {
  const 좋은소스 = `
      센다(사유, \`벤더:\${r.status}\`);
      첫벤더말 ??= 벤더사유(글);
    return 봉투(200, { 대기: 대기수, 미룸, 사유, 벤더사유: 첫벤더말 });
  `;
  assert.deepStrictEqual(빠진사유칸(구역(좋은소스), ['사유', '벤더사유']), []);
});

test('🔴 탐지력 — 이름이 **닿기만** 한 것은 통과시키지 않는다(부분 일치 금지)', () => {
  /* `무사유하게` 같은 낱말이 들어 있다고 `사유` 칸이 있는 것은 아니다. 경계를 안 보면
   * 이 검사는 주석 한 줄로 통과하고, 그러면 가드가 아니라 장식이 된다. */
  const 낚는소스 = 'return 봉투(200, { 대기: 대기수, 무사유하게: true, 사유롭다: 1 });';
  assert.deepStrictEqual(빠진사유칸(구역(낚는소스), ['사유']), ['사유']);
});

test('🔑 탐지력 — 몸통을 못 찾으면 «통과»가 아니라 전건 실패다', () => {
  /* 앵커가 안 맞는 날(리팩터링으로 `봉투` 이름이 바뀌는 등) 이 검사가 조용히 0건이 되면
   * 그게 정확히 「미실행이 통과와 같은 얼굴」이다(F207). 못 찾으면 빨개진다. */
  assert.deepStrictEqual(빠진사유칸(구역('return new Response("{}")'), ['사유']), ['사유']);
});

test('🔑 탐지력 — cron 목록은 URL 의 slug 로 뽑는다(잡 이름이 아니다)', () => {
  const 방 = fs.mkdtempSync(path.join(require('os').tmpdir(), 'synk-조용한실패-'));
  try {
    const 마이그 = path.join(방, 'supabase', 'migrations');
    fs.mkdirSync(마이그, { recursive: true });
    fs.writeFileSync(path.join(마이그, '1_cron.sql'), `
      perform cron.schedule('전사-배치-라는-별명', '*/10 * * * *', $job$
        select net.http_post(url := (select x from y) || '/transcribe', body := '{}'::jsonb);
      $job$);`);
    /* 스케줄을 안 거는 파일의 `/deliver` 는 세지 않는다(주석·확인 쿼리가 그 글자를 들고 있다). */
    fs.writeFileSync(path.join(마이그, '2_보통.sql'), "-- 이 파일은 '/deliver' 를 주석으로만 적는다");
    assert.deepStrictEqual(cron함수들(방), ['transcribe']);
  } finally { fs.rmSync(방, { recursive: true, force: true }); }
});

// ── ② 실저장소 — 거짓양성만 + 분모 ─────────────────────────────────────────

test('🔑 실저장소 — cron 이 부르는 함수 전부가 사유 칸을 싣는다 (분모를 드러낸다)', () => {
  const 목록 = cron함수들(ROOT);
  assert.ok(목록.length > 0, `cron 함수를 하나도 못 뽑았다 — 0건은 통과가 아니다(뽑기 자체가 죽었다).`);

  const 검사됨 = [];
  for (const slug of 목록) {
    const p = path.join(ROOT, 'supabase', 'functions', slug, 'index.ts');
    if (!fs.existsSync(p)) continue;          // 함수가 아직 없으면 이 검사의 대상이 아니다
    const 규격 = 지기로한칸[slug];
    if (!규격) continue;                       // ③ 이 따로 잡는다 — 여기서 두 번 빨개지지 않게
    const 몸통 = 객체구역(fs.readFileSync(p, 'utf8'), new RegExp(규격.앵커.source, 'g'));
    const 빠짐 = 빠진사유칸(몸통, 규격.키들);
    assert.deepStrictEqual(빠짐, [], `${slug}: 응답 몸통에서 사라진 사유 칸 — ${빠짐.join(', ')}`);
    검사됨.push(slug);
  }
  assert.ok(검사됨.length >= 3,
    `cron 함수 ${목록.length}개 중 ${검사됨.length}개만 실제로 검사됐다 — 분모가 줄면 초록이 거짓말을 한다.`);
});

// ── ③ 등록층 — 새 cron 이 걸리면 빨개진다 ──────────────────────────────────

test('🔑 등록층 — cron 이 부르는 함수가 늘면 이 회귀가 그 사실을 알린다', () => {
  /* 🔴 이 검사는 **일부러 깨지라고 있다.** 새 cron 을 거는 사람은 「그 함수의 실패는 어디에 남나」를
   *   한 번 답해야 하고, 답을 `지기로한칸` 에 적으면 그때 초록이 된다. 이 줄이 없으면 새 cron 은
   *   아무 장치도 없이 조용히 하루 수백 번 돌게 된다 — 그게 이 회귀가 태어난 이유 그대로다. */
  const 목록 = cron함수목록();
  const 아는것 = Object.keys(지기로한칸).sort();
  const 모르는것 = 목록.filter((s) => !아는것.includes(s));
  assert.deepStrictEqual(모르는것, [],
    `cron 이 부르는데 사유 칸을 안 정한 함수: ${모르는것.join(', ')} — `
    + `tests/조용한실패.test.js 의 \`지기로한칸\` 에 그 함수가 무엇을 싣는지 적어라.`);
});

/** ③ 이 쓰는 목록 — 함수 파일이 실재하는 것만 센다(아직 안 지은 slug 로 빨개지지 않게). */
function cron함수목록() {
  return cron함수들(ROOT).filter((s) => fs.existsSync(path.join(ROOT, 'supabase', 'functions', s, 'index.ts')));
}
