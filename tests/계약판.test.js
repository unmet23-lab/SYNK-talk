/* 계약판 공용 통로 회귀 — 대기열 P3 #Q68 (2026-08-14)
 *
 * 무엇을 지키나 — 「`engine.schema_migrations` 의 최신 조각 이름에서 판을 읽는다」는 **한 판정**이
 *   Edge Fn 12자리에서 **한 통로**를 지난다. 착수 전 실측은 세 모양 + 손사본 8벌 + 조각꼴 12벌이었고,
 *   같은 판정이 여러 벌이면 고칠 때 못 찾은 쪽이 남고 그 증상은 언제나 「통과」다.
 *   👉 CLAUDE.md 신뢰성: **3번째부터는 원인을 쓸 수 없게 만든다** — 공용 통로 + **옛 통로를 테스트로 금지**.
 *
 * 🔑 탐지력은 **픽스처가 진다**(가드 맹점 ②) — 실저장소에는 「손사본 0·통로 연결됨」만 묻는다.
 *   버그가 아직 있을 것을 요구하는 검사는 두지 않는다.
 * 🔑 실저장소 검사는 **주석을 지우고** 본다(`tests/lib/소스검사.js`) — 이 파일의 머리말처럼
 *   금지된 표기를 «설명하는» 주석이 그대로 위반으로 잡히면 거짓양성이고, 반대로 설명을 코드로
 *   읽으면 영원히 초록이다. 둘 다 같은 구멍의 두 얼굴이다.
 * 🔑 **분모를 함께 낸다**(F207) — 0건 검사는 통과와 같은 모양이다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 판꼴, 조각꼴, 판번호, 조각에서판, 행들에서판, 앞선판인가 } = require('../lib/계약판.js');
const { 코드만, 코드만픽스처 } = require('./lib/소스검사.js');

const ROOT = path.join(__dirname, '..');
const FN = path.join(ROOT, 'supabase', 'functions');

/* 옛 통로의 **실표기** — 사람이 실제로 쓰던 그 문자열로 검사한다(가드 맹점 ①).
 * 정규식으로 다시 적으면 이스케이프가 한 겹 더 끼어 조용히 안 맞는 날이 온다. */
const 손사본표기 = Object.freeze({
  '판꼴 손사본': '/^c(\\d+)$/',
  '조각꼴 손사본': '_(c\\d+)\\.sql$',
});

// ── 탐지력 픽스처 — 통로가 실제로 무엇을 가르나 ────────────────────────────

test('조각에서판 — 실조각 이름에서 판을 읽고, 규격 밖은 null 이다', () => {
  assert.equal(조각에서판('20260812120000_engine_c11.sql'), 'c11');
  assert.equal(조각에서판('20260806150000_engine_c6.sql'), 'c6');
  assert.equal(조각에서판('20260812170000_season_review_c11.sql'), 'c11', '이름에 밑줄이 여럿이어도 꼬리를 문다');
  assert.equal(조각에서판('20260812120000_engine_c11.sql.bak'), null, '꼬리가 .sql 이 아니면 조각이 아니다');
  assert.equal(조각에서판('engine_cX.sql'), null);
  assert.equal(조각에서판(''), null);
  assert.equal(조각에서판(null), null);
  assert.equal(조각에서판(undefined), null, "🔴 `''` 를 돌려주면 「못 읽었다」가 봉투에 판처럼 실린다");
});

test('행들에서판 — 세 모양(배열·행 하나·0행)과 두 별칭(최신조각·name)을 한 자리에서 받는다', () => {
  // ㉡ 판행 배열 (deliver·radio-ingest·radio-promote 표기)
  assert.equal(행들에서판([{ 최신조각: '20260812120000_engine_c11.sql' }]), 'c11');
  // ㉠ 이미 구조분해한 행 하나 (events·tasks·… 표기 — 학생 확정과 번들해 왕복 1회)
  assert.equal(행들에서판({ 최신조각: '20260812120000_engine_c11.sql', learner_id: 'x' }), 'c11');
  // ㉢ `name` 별칭 (auth·correct 표기)
  assert.equal(행들에서판([{ name: '20260812120000_engine_c11.sql' }]), 'c11');
  assert.equal(행들에서판({ name: '20260812120000_engine_c11.sql' }), 'c11');
  // 🔴 0행에서 던지지 않는다 — 빈 이력에서 죽으면 500 의 이유가 로그에 안 남는다(반박 ⑮)
  assert.equal(행들에서판([]), null, '0행');
  assert.equal(행들에서판(null), null);
  assert.equal(행들에서판(undefined), null);
  assert.equal(행들에서판([{ 최신조각: null }]), null, '칸은 있는데 값이 null');
  assert.equal(행들에서판([{}]), null, '칸 자체가 없다');
  // 행이 아닌 것을 넘긴 실수가 내장 `name` 을 집어 「판을 읽었다」가 되면 안 된다
  assert.equal(행들에서판(function 어떤_c11_sql() {}), null, '함수의 내장 name 은 행의 칸이 아니다');
  assert.equal(행들에서판('20260812120000_engine_c11.sql'), null, '문자열은 행이 아니다');
});

test('판번호 — 판 표기 검사를 겸한다(앱이 보내는 X-Contract-Ver 도 이 자다)', () => {
  assert.equal(판번호('c11'), 11);
  assert.equal(판번호('c6'), 6);
  assert.equal(판번호('c011'), 11, '앞자리 0 은 숫자로 접는다 — 표기 차이로 판이 갈리면 안 된다');
  assert.equal(판번호('C11'), null, '대문자는 규격 밖');
  assert.equal(판번호('c11 '), null, '공백 포함은 규격 밖');
  assert.equal(판번호('11'), null);
  assert.equal(판번호(''), null);
  assert.equal(판번호(null), null);
});

test('앞선판인가 — 읽을 수 없는 값은 «거절»로 접는다 (새는 방향을 통과에 두지 않는다)', () => {
  assert.equal(앞선판인가('c12', 'c11'), true, '앱이 DB 보다 새 판 → 426');
  assert.equal(앞선판인가('c11', 'c11'), false, '같은 판은 통과');
  assert.equal(앞선판인가('c10', 'c11'), false, '옛 앱은 계속 돈다(값목록이 부분집합이라 안전)');
  assert.equal(앞선판인가('c9', 'c11'), false, '🔴 문자열 비교였다면 c9 > c11 로 옛 앱이 막혔다');
  assert.equal(앞선판인가('c11', 'c9'), true, '반대 방향도 숫자로 잰다');
  // 🔴 여기가 이 함수의 급소다 — false 로 접으면 DB 가 모르는 값을 보내는 앱이 조용히 들어온다
  assert.equal(앞선판인가('쓰레기', 'c11'), true, '앱 선언이 규격 밖');
  assert.equal(앞선판인가('c11', '쓰레기'), true, 'DB 판이 규격 밖');
  assert.equal(앞선판인가(null, null), true);
});

test('통로는 아무것도 읽지 않는다 — 순수 함수만 (규격이 깨지면 왕복이 7번 는다)', () => {
  const 소스 = 코드만(fs.readFileSync(path.join(ROOT, 'lib', '계약판.js'), 'utf8'));
  for (const 금지 of ['postgres', 'fetch(', 'await ', 'sql`', 'Deno.']) {
    assert.ok(!소스.includes(금지),
      `lib/계약판.js 에 \`${금지}\` 가 들어왔다 — ㉠ 7자리는 판을 학생 확정 쿼리에 번들해 왕복 1회를 번다. `
      + '통로가 스스로 읽으면 그 7자리의 왕복이 되살아난다(성능을 깎아 통로를 사는 셈).');
  }
  assert.ok(/module\.exports/.test(소스), '동봉 껍데기가 CJS 전제다');
});

test('정규식 두 벌은 이 파일에만 산다 — 상수로 내보내 사본이 생길 이유를 없앤다', () => {
  assert.equal(판꼴.source, '^c(\\d+)$');
  assert.equal(조각꼴.source, '_(c\\d+)\\.sql$');
  assert.ok(!판꼴.global && !조각꼴.global,
    'g 플래그가 붙으면 lastIndex 가 남아 같은 입력이 회차마다 다른 답을 낸다');
});

test('탐지력 — 주석 제거기가 실제로 돈다 (설명을 코드로 읽으면 이 파일이 영원히 초록이다)', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대);
});

// ── 실저장소 — 거짓양성만 묻는다(분모 함께) ────────────────────────────────

test('실저장소 — schema_migrations 를 읽는 Fn 전량이 통로를 통과한다 (분모 함께)', () => {
  const 함수들 = fs.readdirSync(FN, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(FN, e.name, 'index.ts')))
    .map((e) => e.name);

  const 판읽는 = [];
  for (const slug of 함수들) {
    const 코드 = 코드만(fs.readFileSync(path.join(FN, slug, 'index.ts'), 'utf8'));
    if (!코드.includes('engine.schema_migrations')) continue;
    판읽는.push(slug);

    assert.ok(코드.includes("import 계약판모듈 from './계약판.mjs'"),
      `${slug}: schema_migrations 를 읽는데 통로를 안 들인다 — 손 변환이 되살아난 자리다`);

    const 표 = JSON.parse(fs.readFileSync(path.join(FN, slug, '동봉.json'), 'utf8'));
    assert.equal(표['계약판.mjs'], 'lib/계약판.js',
      `${slug}: 동봉 표에 계약판.mjs 가 없다 — 배포는 초록이고 함수가 첫 호출의 import 에서 죽는다`);

    for (const [무엇, 표기] of Object.entries(손사본표기)) {
      assert.ok(!코드.includes(표기),
        `${slug}: ${무엇} \`${표기}\` 가 코드에 남았다 — 통로를 세운 뜻이 사라진다(같은 판정 2벌)`);
    }
  }

  assert.ok(판읽는.length >= 12,
    `분모가 낮다 — 판을 읽는 Fn ${판읽는.length}건(착수 시점 실측 12). 미실행은 통과와 같은 모양이다.`);
});

test('실저장소 — 통로 밖에는 손사본이 없다 (lib·tools 까지 · 분모 함께)', () => {
  const 훑을곳 = [path.join(ROOT, 'lib'), path.join(ROOT, 'tools')];
  const 예외 = new Set([path.join(ROOT, 'lib', '계약판.js')]);   // 정본 한 벌
  let 검사한 = 0;
  for (const 뿌리 of 훑을곳) {
    for (const 이름 of fs.readdirSync(뿌리)) {
      const p = path.join(뿌리, 이름);
      if (!이름.endsWith('.js') || !fs.statSync(p).isFile() || 예외.has(p)) continue;
      검사한 += 1;
      const 코드 = 코드만(fs.readFileSync(p, 'utf8'));
      assert.ok(!코드.includes(손사본표기['판꼴 손사본']),
        `${path.relative(ROOT, p)}: 판꼴 손사본이 생겼다 — \`require('../lib/계약판.js').판꼴\` 을 써라`);
    }
  }
  assert.ok(검사한 >= 40, `분모가 비었다 — lib·tools 검사 ${검사한}건`);
});
