'use strict';
/**
 * 동봉신호 회귀 — 「동봉 파일을 고친 사람에게 신호가 가는가」 (F313)
 *
 * 발단(2026-08-10 실측): `lib/검수확정.js` 의 **주석만** 고쳐 커밋했더니 `배포대조` 가 `review` 를
 *   「다르다」로 잡았고, `왕복전게이트` 가 exit 1 로 talk 의 왕복시험을 **살아있는 세션 전부에게**
 *   막았다. 편집한 쪽 화면은 내내 초록이었다 — 급소는 크기가 아니라 그 **비대칭**이다.
 *
 * 🔑 이 회귀가 지키는 것 셋:
 *   ① 탐지력은 **픽스처**로 못박는다(실저장소 표는 언제든 바뀐다 — 바뀌면 탐지 검사가 조용히 0건이 된다).
 *   ② 실저장소에는 **거짓양성만** 묻는다 + 분모를 드러낸다(0건을 통과로 읽지 않는다).
 *   ③ **등록층** — 장치를 만드는 것과 그 장치가 도는 것은 다른 작업이다. 가드는 로직보다
 *      등록층에서 새고, 새는 방향은 언제나 「통과」다(CLAUDE.md 신뢰성).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { 띄우기 } = require('./lib/띄우기.js');

const ROOT = path.resolve(__dirname, '..');
const { 경로들파싱, 커밋된경로들, 영향받은함수, 안내문 } = require('../tools/동봉신호.js');
const { 동봉목록, REQUIRE문 } = require('../tools/원격배포.js');

/** 픽스처 저장소 — 표의 값은 **한글 경로**로 둔다(실물이 전부 한글이라 그게 사람이 쓰는 표기다). */
function 픽스처저장소() {
  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-동봉신호-'));
  const 함수방 = (slug) => path.join(방, 'supabase', 'functions', slug);
  fs.mkdirSync(함수방('가짜함수'), { recursive: true });
  fs.writeFileSync(
    path.join(함수방('가짜함수'), '동봉.json'),
    JSON.stringify({ '토큰.mjs': 'lib/토큰.js', '계약.mjs': '계약/수집_교정_계약.json' }),
  );
  fs.mkdirSync(함수방('표없는함수'), { recursive: true });   // 동봉.json 이 없는 함수도 있다
  fs.writeFileSync(path.join(함수방('표없는함수'), 'index.ts'), '// 본체만');
  return 방;
}

// ── ① 탐지력 (픽스처) ──────────────────────────────────────────────────────

test('동봉 값에 있는 경로를 커밋하면 그 함수를 짚는다 (F313 의 그 자리)', () => {
  const 방 = 픽스처저장소();
  try {
    const 영향 = 영향받은함수(['lib/토큰.js'], 동봉목록(방));
    assert.strictEqual(영향.length, 1);
    assert.strictEqual(영향[0].slug, '가짜함수');
    assert.deepStrictEqual(영향[0].동봉, ['lib/토큰.js']);
    assert.deepStrictEqual(영향[0].본체, []);
  } finally { fs.rmSync(방, { recursive: true, force: true }); }
});

test('🔑 코드가 아닌 동봉(계약 JSON·프롬프트)도 똑같이 실려 나간다 — 확장자로 봐주지 않는다', () => {
  const 방 = 픽스처저장소();
  try {
    const 영향 = 영향받은함수(['계약/수집_교정_계약.json'], 동봉목록(방));
    assert.deepStrictEqual(영향.map((f) => f.slug), ['가짜함수']);
  } finally { fs.rmSync(방, { recursive: true, force: true }); }
});

test('함수 폴더 안의 파일(본체·동봉.json)도 재배포 대상이다 — 표에 없다고 넘기지 않는다', () => {
  const 방 = 픽스처저장소();
  try {
    const 영향 = 영향받은함수(['supabase/functions/가짜함수/index.ts'], 동봉목록(방));
    assert.strictEqual(영향.length, 1);
    assert.deepStrictEqual(영향[0].본체, ['supabase/functions/가짜함수/index.ts']);
    assert.deepStrictEqual(영향[0].동봉, []);
  } finally { fs.rmSync(방, { recursive: true, force: true }); }
});

test('거짓양성 — 상관없는 파일을 커밋하면 아무 말도 안 한다', () => {
  const 방 = 픽스처저장소();
  try {
    assert.deepStrictEqual(영향받은함수(['docs/배포_경로.md', 'src/말하기화면.js'], 동봉목록(방)), []);
    assert.deepStrictEqual(영향받은함수([], 동봉목록(방)), []);
  } finally { fs.rmSync(방, { recursive: true, force: true }); }
});

test('🔑 이름이 겹치는 다른 경로를 삼키지 않는다 — 표의 값과 **완전히 같아야** 짚는다', () => {
  const 방 = 픽스처저장소();
  try {
    // `lib/토큰.js` 가 표에 있다고 `lib/토큰검사.js`·`tests/lib/토큰.js` 까지 짚으면 안 된다.
    assert.deepStrictEqual(영향받은함수(['lib/토큰검사.js', 'tests/lib/토큰.js'], 동봉목록(방)), []);
  } finally { fs.rmSync(방, { recursive: true, force: true }); }
});

test('안내문은 그 함수의 `원격배포` 명령을 그대로 찍는다 (읽고 바로 칠 수 있어야 한다)', () => {
  const 글 = 안내문([{ slug: 'review', 디렉터리: 'supabase/functions/review', 동봉: ['lib/검수확정.js'], 본체: [] }]);
  assert.match(글, /node tools\/원격배포\.js supabase\/functions\/review --적용/);
  assert.match(글, /lib\/검수확정\.js/);
});

// ── ② 표기 구멍 — 이 장치가 통째로 죽는 유일한 자리 ────────────────────────

test('경로들파싱 — NUL 구분 출력을 그대로 가른다(빈 칸을 경로로 세지 않는다)', () => {
  assert.deepStrictEqual(경로들파싱('lib/토큰.js\0supabase/functions/review/index.ts\0'), [
    'lib/토큰.js', 'supabase/functions/review/index.ts',
  ]);
  assert.deepStrictEqual(경로들파싱(''), []);
});

test('🔴 git 이 한글 경로를 이스케이프해서 주면 이 장치는 통째로 죽는다 — 실제 커밋으로 잰다', (t) => {
  let 방;
  try {
    방 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-동봉git-'));
    const git = (...args) => execFileSync('git', args, { cwd: 방, encoding: 'utf8', stdio: 'pipe' });
    git('init', '-q');
    fs.mkdirSync(path.join(방, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(방, 'lib', '검수확정.js'), '// 한글 이름\n');
    git('add', '--', 'lib/검수확정.js');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false',
      'commit', '-q', '-m', 'fixture');
  } catch (e) {
    // 못 쟀으면 **못 쟀다고 드러낸다** — 통과와 미실행이 같은 모양이면 안 된다.
    fs.rmSync(방, { recursive: true, force: true });
    return t.skip(`git 을 못 돌렸다(미측정): ${e && e.message}`);
  }
  try {
    // 기본 표기였다면 `"lib/\355\206..."` 로 와서 표의 어느 값과도 안 맞는다 — 증상은 「조용함」뿐이다.
    assert.deepStrictEqual(커밋된경로들(방, 'HEAD'), ['lib/검수확정.js']);
  } finally { fs.rmSync(방, { recursive: true, force: true }); }
});

// ── ③ 실저장소 — 거짓양성만, 그리고 분모를 밝힌다 ─────────────────────────

test('실저장소 — 동봉 표가 실제로 읽힌다(분모) · 경로 표기는 `/` 하나뿐이다', () => {
  const 목록 = 동봉목록(ROOT);
  assert.ok(목록.length >= 5, `동봉 표를 ${목록.length}개만 읽었다 — 0에 가까우면 탐지가 아니라 미실행이다`);
  for (const f of 목록) {
    assert.ok(f.경로들.length > 0, `${f.slug}: 표는 있는데 값이 0개다`);
    for (const p of [f.디렉터리, ...f.경로들]) {
      assert.ok(!p.includes('\\'), `역슬래시 표기가 섞였다: ${p} — git 이 주는 경로와 영영 안 맞는다`);
    }
  }
});

test('실저장소 — F313 이 난 그 파일을 커밋하면 `review` 를 짚는다', () => {
  const 영향 = 영향받은함수(['lib/검수확정.js'], 동봉목록(ROOT));
  assert.ok(영향.some((f) => f.slug === 'review'), `짚지 못했다: ${JSON.stringify(영향)}`);
});

test('실저장소 거짓양성 — 문서·테스트만 고친 커밋엔 아무 말도 안 한다', () => {
  assert.deepStrictEqual(
    영향받은함수(['docs/배포_경로.md', 'tests/동봉신호.test.js', 'README.md'], 동봉목록(ROOT)),
    [],
  );
});

// ── ④ 등록층 — 장치는 스스로 발화하지 않는다 ──────────────────────────────

test('🔑 등록 — `.githooks/post-commit` 이 있고, install-hooks 의 목록에도 들어 있다', () => {
  const 훅 = path.join(ROOT, '.githooks', 'post-commit');
  assert.ok(fs.existsSync(훅), '훅 파일이 없다');
  const 본문 = fs.readFileSync(훅, 'utf8');
  // 절대경로를 박으면 다른 기계에서 통째로 죽는다(CLAUDE.md 신뢰성 ①).
  assert.ok(!/[A-Za-z]:[\\/]/.test(본문) && !/^\s*exec\s+\/[^\s]*node/m.test(본문),
    '훅이 절대경로를 박고 있다 — 다른 기계에서 안 돈다');
  const 설치 = fs.readFileSync(path.join(ROOT, 'tools', 'install-hooks.js'), 'utf8');
  assert.ok(설치.includes("'post-commit'"),
    'install-hooks 의 훅 목록에 없다 — 실행 비트도 온전성 검사도 못 받고 조용히 빠진다');
});

test('🔑 커밋 경로에 네트워크가 없다 — `배포대조` 를 끌고 오지 않는다', () => {
  // 문구를 세지 않고 **실제 require 그래프**를 본다(문구 스캐너는 표기 하나 바뀌면 눈이 먼다).
  delete require.cache[require.resolve('../tools/동봉신호.js')];
  require('../tools/동봉신호.js');
  const 끌려온것 = Object.keys(require.cache).map((p) => path.basename(p));
  assert.ok(!끌려온것.includes('배포대조.js'),
    '`배포대조.js` 가 끌려왔다 — 커밋마다 네트워크를 태우면 오프라인 세션에서 멈춰 선다');
});

/* ── 동봉 표의 «닫힘» — 동봉 파일이 require 하는 것도 표에 있어야 한다
 *
 * 발단(2026-08-10 실측): `lib/오늘과제.js` 에 `require('./선택로그.js')` 를 한 줄 추가했더니
 *   `배포대조` 가 `deliver`·`progress`·`tasks` **셋을** 「⚠ 미측정 — 나갈 것을 못 모았다」로
 *   냈다. 표에 `선택로그.mjs` 가 없어 재료를 못 모은 것이다.
 * 🔴 **급소는 그 증상이 「다르다」가 아니라 「미측정」이라는 것**이다 — 다름 개수만 세면 0으로
 *   보이고, 초록을 분모 없이 읽는 사람에게는 통과와 구별되지 않는다(CLAUDE.md F207).
 *   그리고 이 자리는 배포를 **시도할 때**에만 드러난다: 커밋한 세션은 모르고, 미는 세션이 만난다.
 * 🔑 그래서 여기서 잰다 — require 를 한 줄 늘린 사람이 **그 자리에서** 표를 닫게. */

/** 표 하나를 검사한다. `읽기(경로)` 를 주입받아 픽스처와 실저장소에 같은 로직을 쓴다.
 * 🔴 정규식은 배포 해석기의 것(`원격배포.REQUIRE문`)을 그대로 쓴다 — 여기 따로 적었던 판은
 *   `./` 만 봐서 `../contents/알바변명문항.js`(G3 · 2026-08-13 실측)를 통과시켰고, 그 구멍은
 *   커밋한 세션이 아니라 **미는 세션**이 radio-promote 배포 거절로 만났다(라우팅이 훅보다
 *   좁으면 그 자체가 구멍 — CLAUDE.md 신뢰성 ③ · 1번째 선택로그 08-10 · 2번째가 이것).
 *   구멍 판정도 해석기와 같다: 표 값의 **파일명(basename)** 이 키가 된다. */
function 표의구멍(표, 읽기) {
  const 있는mjs = new Set(
    Object.entries(표)
      .filter(([n]) => n.endsWith('.mjs'))
      .map(([, p]) => String(p).replace(/^.*\//, '').replace(/\.js$/, '')),
  );
  const 구멍 = [];
  let 잰것 = 0;
  for (const [, 원본] of Object.entries(표)) {
    if (!String(원본).endsWith('.js')) continue;   // 계약 JSON·프롬프트는 require 를 안 한다
    const src = 읽기(원본);
    if (src == null) continue;
    for (const m of src.matchAll(REQUIRE문)) {
      잰것 += 1;
      const [, , 경로, 파일명] = m;
      if (!있는mjs.has(파일명)) 구멍.push(`${원본} → ${경로}${파일명}.js`);
    }
  }
  return { 구멍, 잰것 };
}

test('🔴 탐지력 — 표에 없는 `require` 를 한 줄 넣으면 잡는다 (픽스처)', () => {
  const 표 = { '갑.mjs': 'lib/갑.js', '을.mjs': 'lib/을.js' };
  const 파일 = {
    'lib/갑.js': "const { 것 } = require('./을.js');\n",          // 표에 있다 — 통과
    'lib/을.js': "const { 딴것 } = require('./병.js');\n",         // 표에 없다 — 구멍
  };
  const r = 표의구멍(표, (p) => 파일[p] ?? null);
  assert.equal(r.잰것, 2, '분모가 안 맞다 — 정규식이 require 를 못 읽었다');
  assert.deepEqual(r.구멍, ['lib/을.js → ./병.js']);

  /* 자기 처방 — 사유가 시키는 대로 표에 넣으면 통과한다(따를 수 없는 처방은 우회를 만든다 · F103). */
  const 고침 = 표의구멍({ ...표, '병.mjs': 'lib/병.js' }, (p) => 파일[p] ?? null);
  assert.deepEqual(고침.구멍, []);
});

test('🔴 탐지력 — `../` 건너 디렉터리 require 도 잡는다 (G3 실측 모양 그대로)', () => {
  /* 사람이 실제로 쓰는 표기로 검사한다 — 2026-08-13 실물은 lib 파일이 contents 를
   * `require('../contents/알바변명문항.js')` 로 부른 것이었고, `./` 만 보던 옛 정규식이
   * 이걸 통과시켰다. 이 픽스처가 그 탐지력을 못박는다(버그가 아직 있을 것을 요구하지 않는다). */
  const 표 = { '갑.mjs': 'lib/갑.js' };
  const 파일 = { 'lib/갑.js': "const 팩 = require('../contents/병문항.js');\n" };
  const r = 표의구멍(표, (p) => 파일[p] ?? null);
  assert.equal(r.잰것, 1, '분모가 안 맞다 — `../` require 를 정규식이 못 읽었다');
  assert.deepEqual(r.구멍, ['lib/갑.js → ../contents/병문항.js']);

  const 고침 = 표의구멍({ ...표, '병문항.mjs': 'contents/병문항.js' }, (p) => 파일[p] ?? null);
  assert.deepEqual(고침.구멍, []);
});

test('🔑 실저장소 — 모든 동봉 표가 닫혀 있다 (분모를 드러낸다)', () => {
  const FN = path.join(ROOT, 'supabase', 'functions');
  const 함수들 = fs.readdirSync(FN, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(FN, d.name, '동봉.json')))
    .map((d) => d.name);
  assert.ok(함수들.length >= 5, `동봉 표를 든 함수가 ${함수들.length}개뿐이다 — 표를 못 찾았다`);

  const 읽기 = (p) => {
    const 절대 = path.join(ROOT, p);
    return fs.existsSync(절대) ? fs.readFileSync(절대, 'utf8') : null;
  };
  const 구멍들 = [];
  let 잰것 = 0;
  for (const 이름 of 함수들) {
    const 표 = JSON.parse(fs.readFileSync(path.join(FN, 이름, '동봉.json'), 'utf8'));
    const r = 표의구멍(표, 읽기);
    잰것 += r.잰것;
    for (const c of r.구멍) 구멍들.push(`${이름}: ${c}`);
  }
  /* 🔑 분모 0 은 통과가 아니다 — lib 간 `require` 가 하나도 안 잡혔다면 이 검사는 안 돈 것이다. */
  assert.ok(잰것 >= 1, `함수 ${함수들.length}개를 훑었는데 동봉 파일의 require 가 0건이다 — 검사가 안 돌았다`);
  assert.deepEqual(구멍들, [],
    `동봉 표가 안 닫혔다 — 배포가 「미측정」이 되고, 그건 커밋한 세션이 아니라 미는 세션이 만난다`);
});

test('실패해도 조용히 끝난다 — 없는 커밋을 줘도 종료코드 0 (알림이지 가드가 아니다)', () => {
  // `띄우기` 는 **못 띄운 것**과 **0 아닌 종료**를 둘 다 던진다 — 미실행이 「조용히 통과」로
  // 번역되는 자리를 막는 공용 통로다(`tests/스폰통로.test.js` 가 옛 통로를 금지한다).
  const r = 띄우기([path.join(ROOT, 'tools', '동봉신호.js'), '없는커밋임'], { cwd: ROOT });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout.trim(), '', '못 읽은 커밋을 두고 뭔가 짚었다면 그건 거짓양성이다');
});
