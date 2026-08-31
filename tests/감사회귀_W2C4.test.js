'use strict';
/* 감사 회귀 W2C4 — App.js·테마 군단 시공 앵커.
 *   D5-13 눌림 불투명 두 단(눌림감.면/글 — 여섯 벌을 둘로 걷었다) · G3-6 글자 확대 상한 배선.
 *
 * ■ D5-13 — 재는 법: pressed 곁의 opacity «숫자 리터럴»이 src·App.js 에 0건인가(grep형 소스 시험).
 *   토큰 참조(눌림감·눌림층)만 남는다. 값·모양의 정본은 src/테마.js 한 곳이고, 눌림감.면은
 *   눌림층.버튼에서 «빌린다» — 한 값을 두 곳이 알면 갈린다(0.82 를 두 번 적지 않는다).
 *   ⚠ 눌림층 자체(0.82/0.35)와 그 소비 자리는 tests/감사회귀_R4B1.test.js 가 문다 — 여기 안 겹친다.
 * ■ G3-6 — 재는 법: App.js 겉테 글자(고정 치수 상자)가 자리별 maxFontSizeMultiplier prop 을
 *   지나는가. 전역 Text.defaultProps 는 RN 0.86+React 19 가 소비하지 않는다(08-31 실측 ·
 *   src/테마.js 글자배율상한 머리말) — 그래서 검사도 «자리별 prop»을 센다. 상한 «값»(1.2)은
 *   tests/테마면.test.js 가 문다 — 같은 판정을 두 자로 재지 않는다. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 코드만, 파일소스, 코드만픽스처 } = require('./lib/소스검사.js');

const ROOT = path.join(__dirname, '..');
const 소스 = (상대) => 파일소스(path.join(ROOT, ...상대.split('/')));

test('주석 제거기가 산다 — 아래 소스 검사들이 설명을 코드로 읽지 않는다', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다 — 이 파일 전체가 거짓 초록이 된다');
});

/* ── D5-13 — 눌림 불투명 두 단: 값의 자리는 테마 하나 ── */

test('D5-13 눌림감 — 면은 눌림층.버튼에서 빌리고 글은 0.7, 모양 그대로다', () => {
  const 테마 = 코드만(소스('src/테마.js'));
  assert.match(테마, /export const 눌림감 = Object\.freeze\(\{ 면: 눌림층\.버튼, 글: 0\.7 \}\);/,
    '눌림감이 지시서 모양이 아니다 — 면에 0.82 를 직접 적으면 한 값을 두 곳이 알게 된다');
});

/* 소유 밖 두 파일(W2C1·W2C3 영토)만 임시 예외다 — 통합자가 걷으면 이 줄을 지운다.
 * 예외가 «낡으면»(그 파일이 이미 깨끗하면) 아래 검사가 빨개져서 지울 때를 알려 준다. */
const 눌림예외 = ['src/몽글문화면.js', 'src/오프라인카드.js'];

test('D5-13 회귀 — src·App.js 전체에서 pressed 곁 opacity 숫자 리터럴 0건(토큰 참조만)', () => {
  const 파일들 = fs.readdirSync(path.join(ROOT, 'src'))
    .filter((f) => f.endsWith('.js')).map((f) => 'src/' + f).concat(['App.js']);
  const 인라인 = /pressed && \{ opacity: [0-9]/;
  const 정의 = /눌림\w*: \{ opacity: [0-9]/;
  const 위반 = [];
  for (const f of 파일들) {
    if (눌림예외.includes(f)) continue;
    const 몸 = 코드만(소스(f));
    if (인라인.test(몸) || 정의.test(몸)) 위반.push(f);
  }
  assert.deepEqual(위반, [],
    `pressed 곁에 opacity 숫자 리터럴이 남았다: ${위반.join(' · ')} — 눌림감.면/글(테마)로 걷는다`);
  for (const f of 눌림예외) {
    const 몸 = 코드만(소스(f));
    assert.ok(인라인.test(몸) || 정의.test(몸),
      `예외가 낡았다 — ${f} 가 이미 깨끗하다. 위 눌림예외 목록에서 이 파일을 지워라`);
  }
});

test('D5-13 색.눌림(Coral 3)은 유물이다 — 소비 0 을 유지하고, 봉인 주석이 서 있다', () => {
  const 파일들 = fs.readdirSync(path.join(ROOT, 'src'))
    .filter((f) => f.endsWith('.js') && f !== '테마.js').map((f) => 'src/' + f).concat(['App.js']);
  const 소비 = 파일들.filter((f) => /색\.눌림/.test(코드만(소스(f))));
  assert.deepEqual(소비, [], `색.눌림(코랄 면)을 새로 소비했다: ${소비.join(' · ')} — 눌린 상태는 눌림감이 정본이다`);
  assert.ok(소스('src/테마.js').includes('새 소비 금지'),
    '색.눌림의 봉인 주석이 사라졌다 — 유물임을 모르는 다음 사람이 다시 소비한다');
});

/* ── G3-6 — 글자 확대(fontScale) 상한: App.js 겉테 배선 + 실기기 검수 두 줄 ── */

test('G3-6 App.js — 겉테 고정 치수 글자 여섯이 전부 자리별 상한 prop 을 지난다', () => {
  const 앱 = 코드만(소스('App.js'));
  assert.match(앱, /import \{[^}]*글자배율상한[^}]*\} from '\.\/src\/테마';/,
    'App.js 가 글자배율상한을 테마에서 안 빌린다 — 값을 따로 적으면 두 곳이 갈린다');
  for (const [자리, 셈] of [['시스템글', 1], ['미달글', 1], ['겉테글', 2], ['검수문글', 2]]) {
    const 무늬 = new RegExp(`style=\\{s\\.${자리}\\} maxFontSizeMultiplier=\\{글자배율상한\\}`, 'g');
    assert.equal((앱.match(무늬) || []).length, 셈,
      `${자리} 의 상한 자리가 ${셈}곳이 아니다 — 겉테줄(top:34 절대좌표)은 OS 글자 확대에 마스코트(top:64)와 겹친다`);
  }
  assert.equal((앱.match(/maxFontSizeMultiplier=\{글자배율상한\}/g) || []).length, 6,
    '겉테 상한 자리 합이 6이 아니다 — 늘었으면 이 셈을, 줄었으면 빠진 자리를 본다');
});

test('G3-6 실기기 검수목록 — 「글꼴 크게 ×1.3 / ×2.0」 두 줄과 확인 좌표가 있다', () => {
  const 문서 = 소스('docs/실기기_검수목록.md');
  assert.ok(문서.includes('글꼴 크게 ×1.3'), '×1.3 검수 줄이 없다 — 검수일에 글꼴 확대가 통째로 빠진다');
  assert.ok(문서.includes('글꼴 크게 ×2.0'), '×2.0 검수 줄이 없다 — 상한이 «걸리는지»는 최대 배율에서만 갈린다');
  for (const 좌표 of ['top: 34', 'top: 64', 'minHeight: 20']) {
    assert.ok(문서.includes(좌표), `확인 좌표 ${좌표} 가 문서에서 사라졌다 — 무엇이 겹치는지 모르는 검수는 못 잰다`);
  }
});
