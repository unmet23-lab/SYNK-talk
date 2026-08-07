/* 테스트가 node 자식을 직접 띄우는 옛 통로 금지 — 미실행이 판정으로 번역되는 자리 (2026-08-07)
 *
 * 실측: `계약가드.test.js` 의 옛 판정 `r.status !== 0` 은 스폰 실패(status=null)를 「막혔다」로
 *   읽었다. 형제(SYNK-appsscript)의 실사고와 반대 방향이다 — 그쪽은 미실행→「통과」(조용한 초록),
 *   여기는 미실행→「차단」(차단 신뢰가 오염). 어느 쪽이든 뿌리는 같다: **r.error 를 보는 자리가
 *   이 저장소 테스트에 0곳**이라, 「안 떴다」가 반드시 어느 한쪽 판정으로 둔갑한다.
 *
 * 그래서 판정을 `tests/lib/띄우기.js` 한 곳으로 모으고, 여기서 옛 통로를 금지한다(형제
 *   `tests/훅통로.test.js` 의 이식 · 규칙은 파일 단위 — 자리 단위로 좁히면 경로를 인자로 받는
 *   도우미가 사각이 된다).
 *
 * 대상 = node 자식 판정: `spawnSync(process.execPath|'node' …)` + `execFileSync('node' …)`.
 *   execFileSync 는 스스로 던지지만 **catch 에서 e.status 를 코드로 번역하는 관행**이 크래시
 *   (uncaught throw 도 exit 1)를 「차단」 모양으로 만든다 — 실측: precommit.integration 의
 *   자격증명 검사가 앵커 없이 그 코드만 봐서 **가드가 통째로 죽어도 초록**이었다(08-07).
 * 대상 밖(일부러): `spawnSync('sh'…)`=`.error` 프로브+skip 관행(커밋트레일러:43) ·
 *   `execFileSync('git'…)`=판정이 아니라 픽스처 조립이라 미실행이 이미 시끄럽다.
 *
 * 검사 구조 — 탐지력은 픽스처로 못박고, 실저장소에는 거짓양성만 묻는다(형제 CLAUDE.md 맹점②).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { 띄우기 } = require('./lib/띄우기');

const TESTS = __dirname;

const 임시들 = [];
function 임시() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'talk-spawnpath-'));
  임시들.push(d);
  return d;
}
test.after(() => { for (const d of 임시들) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* 청소 실패는 결과가 아니다 */ } } });

/* 실행되지 않는 텍스트를 지운다 — **줄 수는 보존**한다(행 번호로 짚어야 사람이 찾아간다).
 * 지우는 건 주석·템플릿 리터럴까지만(형제와 같은 규칙). 따옴표 문자열까지 지우는 판도 시도했다
 * 가 물렸다: 줄주석 스트리퍼가 문자열 안 `//` 를 먹으며 닫는 따옴표까지 지워 **짝이 통째로
 * 밀린다**(실측 — 밀린 짝은 위반을 숨기는 방향으로도 틀린다). 렉서 없인 원리 해법이 없어서,
 * 패턴을 문자열로 들 수밖에 없는 유일한 파일(이 스캐너 자신)을 스캔에서 명시 제외한다. */
const 줄보존 = (m) => m.replace(/[^\n]/g, ' ');
function 코드만(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, 줄보존)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, 앞) => 앞 + 줄보존(m.slice(앞.length)))
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, 줄보존);
}

/** 한 파일의 위반 행 번호들 — node 자식을 직접 띄워 판정하는 자리. */
function 위반들(원문) {
  const src = 코드만(원문);
  return [...src.matchAll(/(?:spawnSync|execFileSync)\s*\(\s*(?:process\.execPath|['"]node['"])/g)]
    .map((m) => src.slice(0, m.index).split('\n').length);
}

function 스캔(dir) {
  const 결과 = [];
  for (const f of fs.readdirSync(dir)) {
    if (!/\.test\.js$/.test(f)) continue; // lib/ 하위(통로 자신)는 대상이 아니다 — 통로는 spawnSync 를 써야 한다
    if (f === path.basename(__filename)) continue; // 자기 제외 — 픽스처가 패턴을 문자열로 들어야 하는 유일한 파일
    const 줄 = 위반들(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (줄.length) 결과.push(`${f}:${줄.join(',')}`);
  }
  return 결과;
}

// ── ① 탐지력 (픽스처) ───────────────────────────────────────────────────────

test('🔴 옛 통로를 잡는다 — node 자식을 직접 spawn 해 코드로 판정하는 회귀', () => {
  const d = 임시();
  fs.writeFileSync(path.join(d, '나쁜.test.js'),
    "const 도구 = path.join(ROOT, 'tools', 'x.js');\n"
    + 'const r = spawnSync(process.execPath, [도구], { encoding: "utf8" });\n');
  assert.deepStrictEqual(스캔(d), ['나쁜.test.js:2'], '옛 형태를 못 잡았다 — 이 회귀가 무력하다');
});

test('🔴 execFileSync(node …) 의 catch 번역형도 잡는다 — 크래시가 「차단」 모양이 되는 자리', () => {
  const d = 임시();
  fs.writeFileSync(path.join(d, '나쁜2.test.js'),
    'try { out = execFileSync("node", [도구], { encoding: "utf8" }); } catch (e) { r = { code: e.status }; }\n');
  assert.deepStrictEqual(스캔(d), ['나쁜2.test.js:1'],
    '정확히 이번에 고친 형태(precommit.integration 옛 판)를 못 잡는다 — 재발해도 안 문다');
});

test('🔑 주석·문자열 속 옛 형태는 위반이 아니다 — 검사가 자기 픽스처를 신고하면 안 된다', () => {
  const d = 임시();
  fs.writeFileSync(path.join(d, '설명.test.js'),
    '// 옛 통로: spawnSync(process.execPath, [도구]) 는 미실행을 판정으로 읽는다\n'
    + '/* spawnSync(process.execPath, [도구]) */\n'
    + 'const 픽스처 = `const r = spawnSync(process.execPath, [도구], {});`;\n');
  assert.deepStrictEqual(스캔(d), [], '문서화·픽스처를 벌했다 — 그런 가드는 우회를 가르친다');
});

test('새 통로는 통과한다 — 거짓양성이 곧 우회 손버릇이 된다', () => {
  const d = 임시();
  fs.writeFileSync(path.join(d, '좋은.test.js'),
    "const { 띄우기 } = require('./lib/띄우기');\n"
    + 'const r = 띄우기([도구, "인자"], { encoding: "utf8", 통과코드: [1] });\n');
  assert.deepStrictEqual(스캔(d), [], '고친 형태를 위반이라 했다');
});

// ── ② 통로가 실제로 미실행을 드러내는가 (통로가 조용하면 위 규칙이 장식이 된다) ──

test('🔴 스크립트가 못 뜨거나 죽으면 던진다 — 이게 이 통로의 전부다', () => {
  const 없는것 = path.join(임시(), '없다.js');
  assert.throws(() => 띄우기(없는것, { encoding: 'utf8' }),
    /못 띄웠다|로 끝났다/, '없는 스크립트를 조용히 결과로 돌려줬다 — 미실행이 판정이 됐다');
});

test('0 아닌 종료도 결과가 아니다 — 단 통과코드로 넓히면 결과다(거부 코드 검사 자리)', () => {
  const d = 임시();
  const 스크립트 = path.join(d, '거부.js');
  fs.writeFileSync(스크립트, 'process.exit(1);\n');

  assert.throws(() => 띄우기(스크립트, { encoding: 'utf8' }), /1 로 끝났다/, '비정상 종료를 결과로 돌려줬다');
  assert.strictEqual(띄우기(스크립트, { encoding: 'utf8', 통과코드: [0, 1] }).status, 1);
});

test('조용한 성공은 그대로 돌려준다 — 빈 stdout 은 여전히 정상 결과다', () => {
  const d = 임시();
  const 스크립트 = path.join(d, '조용.js');
  fs.writeFileSync(스크립트, 'process.exit(0);\n');
  assert.strictEqual(String(띄우기(스크립트, { encoding: 'utf8' }).stdout || '').trim(), '');
});

// ── ③ 실저장소 (거짓양성만 — 위반이 아직 있을 것을 요구하지 않는다) ───────────

test('🔴 이 저장소의 테스트는 전부 새 통로를 쓴다', () => {
  assert.deepStrictEqual(스캔(TESTS), [],
    '테스트가 node 자식을 직접 띄워 코드로 판정한다 — 그 자리에서 미실행이 판정으로 번역된다(tests/lib/띄우기.js 를 쓴다)');
});
