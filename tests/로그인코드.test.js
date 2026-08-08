'use strict';
/**
 * 로그인 코드 회귀 — L0 §4-1·§4-2
 *
 * 왜 있나 — 이 설계가 실전에서 깨지는 자리는 딱 두 줄이다(§4-2 🔑):
 *   **이메일은 소문자 · 비밀번호는 대문자.** 하나만 틀려도 증상은 「로그인이 안 된다」뿐이고,
 *   그때 의심할 곳이 코드 전체가 된다. 그래서 그 한 쌍을 여기에 못박는다.
 *
 * 🔑 두 번째 축은 **사본 금지**다. 앱과 도구가 각자 정규화를 적으면 갈라지는데,
 *   갈라진 상태도 각자 테스트는 통과한다 — 그래서 「어디에도 사본이 없다」를 따로 검사한다.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  집합, 길이, 도메인, 정규형, 표기형, 형식맞나, 이메일, 비밀번호,
} = require('../lib/로그인코드.js');

const ROOT = path.resolve(__dirname, '..');

test('정규형 — 하이픈·공백을 지우고 대문자로 만든다', () => {
  assert.equal(정규형('K7M4-P2X9'), 'K7M4P2X9');
  assert.equal(정규형(' k7m4 p2x9 '), 'K7M4P2X9');
  assert.equal(정규형('k7m4–p2x9'), 'K7M4P2X9', '학생이 붙여넣는 en dash 도 지운다');
  assert.equal(정규형(null), '', '빈 입력이 예외를 던지면 로그인 화면이 죽는다');
});

test('🔑 이메일은 소문자 · 비밀번호는 대문자 (같은 코드에서 동시에)', () => {
  const 코드 = 'K7M4-P2X9';
  assert.equal(이메일(코드), 'k7m4p2x9@synk.invalid');
  assert.equal(비밀번호(코드), 'K7M4P2X9');
  assert.notEqual(이메일(코드).split('@')[0], 비밀번호(코드),
    '둘이 같아지면 한쪽 규칙이 사라진 것이다 — 이 설계의 핵심 전제가 깨진다');
});

test('표기형 ↔ 정규형 왕복', () => {
  assert.equal(표기형('K7M4P2X9'), 'K7M4-P2X9');
  assert.equal(정규형(표기형('K7M4P2X9')), 'K7M4P2X9');
  assert.equal(표기형('ABC'), 'ABC', '8자가 아니면 손대지 않는다(잘못된 값을 그럴듯하게 만들지 않는다)');
});

test('형식 검사 — 헷갈리는 글자 4개를 막는다', () => {
  assert.ok(형식맞나('K7M4-P2X9'));
  for (const 글자 of ['I', 'O', '0', '1']) {
    assert.equal(형식맞나(`${글자}7M4P2X9`), false, `${글자} 는 손으로 옮겨 적을 때 섞인다 — 집합에서 뺐다`);
  }
  assert.equal(형식맞나('K7M4P2X'), false, '7자');
  assert.equal(형식맞나('K7M4P2X99'), false, '9자');
});

test('집합 자체가 규격이다 — 32자 · 헷갈리는 글자 없음', () => {
  assert.equal(집합.length, 32, '32자라야 8자에서 32⁸ ≈ 1.1조가 된다');
  assert.equal(new Set(집합).size, 32, '중복 글자가 있으면 실제 엔트로피가 준다');
  assert.equal(길이, 8);
  for (const 글자 of ['I', 'O', '0', '1']) assert.ok(!집합.includes(글자), `${글자} 가 되살아났다`);
});

test('도메인은 실제로 배달 불가능한 예약 TLD 다', () => {
  assert.ok(도메인.endsWith('.invalid'),
    '.invalid 가 아니면 메일이 실제로 나갈 수 있다 — 합성 주소의 전제가 깨진다');
});

/* ── 사본 금지 ─────────────────────────────────────────────────────────────
 * §4-2: 「앱과 발급 도구가 같은 함수 하나를 공유한다」. 사본이 생기면 갈라지고,
 * 갈라져도 양쪽 테스트는 초록이라 조용하다. 그래서 사본의 **존재**를 검사한다. */
function 소스파일들() {
  const 대상 = [];
  for (const 폴더 of ['lib', 'src', 'tools']) {
    const d = path.join(ROOT, 폴더);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (f.endsWith('.js')) 대상.push(path.join(폴더, f));
  }
  return 대상;
}

test('합성 도메인을 아는 파일은 lib/로그인코드.js 하나뿐이다 (사본 금지)', () => {
  const 걸린것 = 소스파일들().filter((f) =>
    f !== path.join('lib', '로그인코드.js')
    && fs.readFileSync(path.join(ROOT, f), 'utf8').includes('@synk.invalid'));
  assert.deepEqual(걸린것, [],
    `합성 도메인이 다른 파일에도 적혀 있다: ${걸린것.join(', ')}\n`
    + '  정규화·도메인은 lib/로그인코드.js 한 곳에서만 나온다 — 거기서 import 해라.');
});

/* 🔴 2026-08-09(F269): 코드 **생성기**가 이 저장소에서 사라졌다. 있던 자리는
 *   `tools/로그인코드발급.js` 였는데, 그 도구가 만든 계정은 주소가 코드에서 나와
 *   앱(주소가 `student_code` 에서 나온다)이 영원히 못 찾았다 — 학생 계정은 §4-1 대로
 *   **첫 로그인에서만** 선다. 그래서 「난수가 약한가」를 잴 소스가 이제 없다.
 *   ⚠ 직원 코드(§4-5 ① · 12자)를 지을 때 생성기가 되살아난다 — 그때 이 검사도 같이
 *   되살린다(`crypto.randomInt` 만 · `Math.random` 금지). 지금 빈 파일을 읽게 두면
 *   그건 「돌지 않는 검사가 초록으로 보이는」 형태가 된다. */

test('탐지력 픽스처 — 사본 탐지기가 되살아나면 잡는다', () => {
  assert.ok('const 메일 = 코드 + "@synk.invalid";'.includes('@synk.invalid'),
    '사본 탐지기가 죽으면 위 검사는 무엇이든 통과시킨다');
});
