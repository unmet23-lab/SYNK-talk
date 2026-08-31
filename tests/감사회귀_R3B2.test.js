'use strict';
/* 감사 회귀 R3B2 — 동명이값·사본 자 정리(G1-12).
 *
 * 지키는 셋
 *   ① uuid 라우팅 자가 **한 곳**(lib/학생계정.js `uuid꼴인가`)이다 — 나침반·회고 API 가
 *      각자 정규식을 들면 한쪽만 고쳐지는 날 두 화면의 라우팅이 갈린다.
 *   ② `기본쪽크기` 라는 **동명이값 export 가 없다** — 검수(10)·감수(20)가 같은 이름을 쓰면
 *      import 자동완성 한 번에 남의 값이 들어오고, 증상은 「쪽이 이상하게 크다/작다」뿐이다.
 *   ③ 회고 화면·API 에 사유 상한 **손 폴백(200)이 없다** — 정본은 서버(lib/회고.js) 하나다.
 *      값 판정(null 폴백의 실행)은 tests/회고.test.js 가 진다 — 여기서는 소스 무늬만 못박는다.
 *
 * 전부 소스로 못박는다(코드만 — 주석 속 이름은 안 센다). 문자열 대조식은 이웃
 * `tests/감사회귀_R2B2.test.js` 의 규율 그대로다. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 코드만, 파일소스 } = require('./lib/소스검사.js');

const ROOT = path.join(__dirname, '..');
const 소스 = (이름) => 코드만(파일소스(path.join(ROOT, ...이름.split('/'))));

// ── ① uuid 라우팅 자 하나 ────────────────────────────────────────────────────

for (const 이름 of ['src/나침반API.js', 'src/회고API.js']) {
  test(`G1-12 ${이름} — uuid 정규식 사본이 0개고 라우팅은 uuid꼴인가 하나를 부른다`, () => {
    const 코드 = 소스(이름);
    assert.ok(!코드.includes('[0-9a-f-]{36}'),
      'uuid 정규식이 되살아났다 — 자는 lib/학생계정.js uuid꼴인가 하나다(여긴 가름, 검수확정은 검증)');
    assert.match(코드, /import \{ uuid꼴인가 \} from '\.\.\/lib\/학생계정\.js';/,
      '라우팅 자를 lib 에서 안 들여온다');
    assert.match(코드, /const 칸 = uuid꼴인가\(학생번호\) \? 'learner_id' : 'student_code';/,
      '학생번호 칸의 가름이 공용 자를 안 쓴다');
  });
}

// ── ② 동명이값 export 소멸 ───────────────────────────────────────────────────

test('G1-12 검수API·문구감수API — 「기본쪽크기」 동명이값이 없고 제 이름을 export 한다', () => {
  const 검수 = 소스('src/검수API.js');
  const 감수 = 소스('src/문구감수API.js');
  assert.ok(!검수.includes('기본쪽크기') && !감수.includes('기본쪽크기'),
    '동명이값 export 가 되살아났다 — 같은 이름 10·20 은 import 한 줄로 섞인다');
  assert.match(검수, /export const 검수쪽크기 = 10;/, '검수 쪽 크기의 이름·값이 갈렸다');
  assert.match(감수, /export const 감수쪽크기 = 20;/, '감수 쪽 크기의 이름·값이 갈렸다');
});

test('G1-12 검수화면 — 개명된 이름으로 가져다 쓴다', () => {
  const 화면 = 소스('src/검수화면.js');
  assert.ok(!화면.includes('기본쪽크기'), '검수화면이 옛 이름을 부른다');
  assert.match(화면, /개수: 반 \? 반쪽크기 : 검수쪽크기,/, '쪽 크기 소비가 개명을 안 따라왔다');
});

// ── ③ 사유 상한 손 폴백 0개 ──────────────────────────────────────────────────

test('G1-12 회고API·회고화면 — 사유 상한 손 폴백(200)이 0개다', () => {
  const api = 소스('src/회고API.js');
  const 화면 = 소스('src/회고화면.js');
  assert.ok(api.includes('Number(본문.note_max) > 0 ? Number(본문.note_max) : null'),
    'API 가 note_max 부재를 null 로 안 넘긴다 — 지어낸 200 은 서버 상한과 갈려도 증상이 없다');
  for (const [이름, 코드] of [['src/회고API.js', api], ['src/회고화면.js', 화면]]) {
    assert.ok(!/(\?\?|\|\|)\s*200/.test(코드),
      `${이름} 에 손 폴백 200 이 되살아났다 — 강사API:39~40 자기 규칙(화면이 서버 상수를 손으로 안 적는다) 위반`);
  }
  assert.match(화면, /onChangeText=\{\(t\) => set사유\(세션\?\.사유상한 \? t\.slice\(0, 세션\.사유상한\) : t\)\}/,
    '사유 입력이 상한 없이도 상한을 지어내 자른다');
});

test('G1-12 회고화면 — 상한이 안 온 세션은 확정이 잠기고 안내가 선다', () => {
  const 화면 = 소스('src/회고화면.js');
  assert.match(화면, /disabled=\{!강사고름 \|\| !사유\.trim\(\) \|\| 도는중 \|\| 세션\?\.사유상한 == null\}/,
    '확정 버튼이 상한 부재를 안 잠근다 — 상한 없이 확정하면 서버 400 이 강사의 첫 안내가 된다');
  assert.ok(화면.includes('사유 글자수 규칙을 서버가 안 보냈어요 — 잠시 뒤 다시 열어 주세요'),
    '잠긴 까닭을 말하는 안내 한 줄이 없다 — 버튼만 죽으면 앱 고장으로 보인다');
});
