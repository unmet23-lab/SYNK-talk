'use strict';
/**
 * 구문 사각 — **`node --check` 가 눈머는 파일이 하나도 안 새는가**.
 *
 * 🔴 왜 있나 (F448 · 2026-08-15 실측):
 *   `node --check` 는 파일에 `import`·`export` 가 한 줄이라도 있으면 **그 파일의 모든 구문
 *   오류를 조용히 통과시킨다**(출력 0줄 · exit 0). JSX 만의 문제가 아니다 — 스크래치패드
 *   대조에서 `import x from 'y'; const a = (((;` 도, `export const a = 1; function f( {` 도
 *   전부 exit 0 이었다(node v24.18.0). 새는 방향은 언제나 「통과」다.
 *
 * 🔑 **그런데 이 저장소는 이미 안 샌다** — 그게 이 파일이 «새 검사»가 아닌 이유다.
 *   2026-08-15 실측(316/316 · 분모 전량): 눈먼 파일 **56**, 그 56 을 파서로 여는 회귀 **56**,
 *   새는 것 **0**. `화면구문`(src + Edge Function) · `미정의심볼`(App·index·src·lib·contents) ·
 *   `화면렌더`(fixtures) 셋이 겹쳐서 덮고 있었다.
 *
 * 🔴 그래서 이 파일이 지는 것은 «탐지»가 아니라 **«목록»**이다.
 *   위 셋은 대상을 **손으로 적은 층 목록**으로 고른다. 그 목록은 이미 한 번 샜다 —
 *   `화면구문` 이 `src/` 만 보던 사이 `supabase/functions/<이름>/index.ts` 가 통째로 밖에 있었고,
 *   회귀 370/370 이 초록인 채로 함수가 번들조차 안 됐다(그 파일 머리말의 「범위가 구멍이었다」).
 *   층이 하나 늘 때마다 사람이 세 곳을 맞춰야 하고, 안 맞추면 **초록인 채로** 샌다.
 *   여기서는 대상을 손으로 안 적는다 — `git ls-files` 가 낸 **추적 소스 전량**이다.
 *   새 파일·새 폴더·새 진입점이 생겨도 다음 실행에 저절로 들어온다.
 *
 * ⚠ 이 장치가 틀릴 때의 모습 = **거짓양성**이다(CLAUDE.md 맹점 ④ · 맞는 얼굴로 틀린 값).
 *   파서 옵션이 좁으면 멀쩡한 파일이 빨개지고, 그건 따를 수 없는 처방이 된다(F103).
 *   실제로 첫 판이 그랬다: 옵션에 `allowReturnOutsideFunction` 이 없어 **최상위 `return`** 을 쓰는
 *   CJS 6벌(talk `tools/가드계수.js` · as 훅 5)이 「구문 오류」로 잡혔다. 그건 Node 가 모듈을
 *   함수로 감싸므로 합법이고 `node --check` 도 통과시킨다 — 즉 **내 자가 좁았던 것**이다.
 *   옵션을 고친 뒤 두 저장소 전량에서 거짓양성 0(talk 316 · as 324).
 *
 * ⚠ **`node --check` 가 눈멀었다는 것을 단언하지 않는다** — 그건 「버그가 아직 있을 것을 요구하는
 *   회귀」다(CLAUDE.md 맹점 ②). Node 가 언젠가 고치면 이 파일은 그대로 초록이면 된다.
 *   여기서 못박는 것은 **우리 파서가 실제로 판다**는 사실뿐이고, 그건 아래 픽스처가 진다.
 *
 * ⚠ 이건 **구문**만 본다. 선언 없는 이름은 `미정의심볼`, 그리는지는 `화면렌더`, 도는지는 배포다.
 *
 * 💰 대가(새 장치엔 함께 적는다):
 *   · 시간 — 전량 파싱 0.30s(실측). 회귀 한 벌 값으로 싸다.
 *   · 닫을 것 — **지금은 없다.** `화면구문` 은 층별 옵션과 **분모 래칫**(화면 ≥4 · 함수 ≥3)을
 *     따로 지고 있어 여기에 안 녹는다. 그 래칫까지 파생으로 옮기면 그때 닫는다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const parser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');

/* 후보를 순서대로 대 본다 — 하나라도 통과하면 그 파일은 파싱된다.
 * `allowReturnOutsideFunction` 은 CJS 최상위 `return` 때문에 반드시 켠다(위 ⚠). */
const 공통 = { sourceType: 'unambiguous', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
const 후보들 = [
  { 이름: 'jsx', o: { ...공통, plugins: ['jsx'] } },
  { 이름: 'ts', o: { ...공통, plugins: ['typescript'] } },
  { 이름: 'tsx', o: { ...공통, plugins: ['typescript', 'jsx'] } },
];

/** 파싱되나 — 되면 null, 안 되면 첫 후보의 오류 메시지. */
function 판다(src) {
  let 첫오류 = null;
  for (const 후보 of 후보들) {
    try { parser.parse(src, 후보.o); return null; } catch (e) { 첫오류 = 첫오류 || e.message; }
  }
  return 첫오류;
}

/**
 * 검사 대상 — **손 목록이 아니다.** git 이 추적하는 소스 전량.
 * 🔑 `-z` 가 필수다: 기본 출력은 비ASCII 경로를 `"docs/\354..."` 로 이스케이프해서 내놓고,
 *   그걸 그대로 읽으면 **전부 조용히 건너뛴다**. 실측 2026-08-15 에 이 통로가 316 중 25만 재고
 *   「샌 것 없음」을 낼 뻔했다 — 미실행이 통과와 같은 모양이다(F207).
 * @returns {string[]|null} 목록 · git 을 못 부르면 null(=이 층은 못 잰다)
 */
function 대상들() {
  try {
    return execFileSync('git', ['ls-files', '-z', '*.js', '*.ts', '*.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 20000 })
      .split('\0').map((s) => s.trim()).filter(Boolean)
      .filter((f) => !f.includes('node_modules'));
  } catch (_) {
    return null;   // repo 밖 환경(git 없음·타임아웃)은 fail 이 아니라 skip 이다 — F296
  }
}

test('탐지력 픽스처 — `node --check` 가 삼키는 모양을 파서는 실제로 잡는다', () => {
  /* 실저장소를 픽스처로 쓰지 않는다(CLAUDE.md 맹점 ②). 여기서 못박는 것은
   * **파서가 무엇이든 삼키지는 않는다**는 사실이다 — 이 단언이 없으면 아래 전량 검사는
   * 파서가 고장 나도 영원히 초록이다. 셋 다 `node --check` 는 exit 0 로 통과시킨 모양이다. */
  assert.ok(판다("import x from 'y';\nconst a = (((;\n"), 'ESM 인데 깨진 구문을 통과시켰다');
  assert.ok(판다('export const a = 1;\nfunction f( {\n'), 'export 가 있는 깨진 구문을 통과시켰다');
  assert.ok(판다('export default () => (<View><Text>안녕</View>);'), 'JSX 닫는 태그가 어긋났는데 통과했다');

  /* 반대쪽 — 멀쩡한 것을 빨갛게 만들지 않는다(거짓양성이 이 장치의 실패 모양이다). */
  assert.strictEqual(판다('export default () => (<View><Text>안녕</Text></View>);'), null, '멀쩡한 JSX 가 빨갛다');
  assert.strictEqual(판다("if (!x) return;\nmodule.exports = {};\n"), null, 'CJS 최상위 return 이 빨갛다 — Node 는 통과시킨다');
  assert.strictEqual(판다('const a: number = 1;\nexport { a };\n'), null, '멀쩡한 TS 가 빨갛다');
});

test('추적 소스 전량이 파싱된다 — 어느 층도 검사 밖에 없다', () => {
  const 목록 = 대상들();
  if (목록 === null) { test.skip('git 을 못 불러 이 층은 안 쟀다 — 초록이 아니라 미실행이다(F296)'); return; }

  assert.ok(목록.length > 100, `추적 소스가 ${목록.length}개다 — 목록 통로가 깨졌다(분모부터 의심한다)`);

  const 사고 = [];
  let 쟀다 = 0;
  for (const f of 목록) {
    let src;
    try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); }
    catch (e) { 사고.push(`${f} — 읽지 못했다: ${e.code || e.message}`); continue; }
    쟀다++;
    const 오류 = 판다(src);
    if (오류) 사고.push(`${f} — ${String(오류).split('\n')[0]}`);
  }

  // 분모를 밝힌다 — 0건이 「검사가 안 돌았다」와 같은 모양이 되지 않게(F207).
  console.log(`  ℹ 판 파일 ${쟀다}/${목록.length}개`);
  assert.strictEqual(쟀다, 목록.length, `${목록.length - 쟀다}개를 못 읽었다 — 분모가 샌다`);

  assert.deepStrictEqual(사고, [], `구문이 깨진 파일이 있다(\`node --check\` 는 이 중 ESM 을 통과시킨다):\n  ${사고.join('\n  ')}`);
});
