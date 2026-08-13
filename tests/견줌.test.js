'use strict';
/**
 * 「어제의 나」 순수 로직 회귀 (P0 §5 S1-11 · C0 §4-3 ③).
 *
 * 화면(`src/어제의나.js`)은 react-native 를 끌고 와 node 가 못 연다 — 그래서 판정은 `lib/견줌.js`
 * 에 있고 여기서 잰다. 화면이 실제로 그려지는지는 다른 층이다(`tests/화면구문.test.js`).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { 견줌, 늘어난말 } = require('../lib/견줌.js');

const ROOT = path.join(__dirname, '..');

/** 서버 응답 봉투 그대로의 모양(`GET /v1/progress`). */
const 봉투 = (today, yesterday) => ({
  contract_ver: 'c10', ok: true, date: '2026-08-09', next_cursor: null,
  data: [{ today, yesterday }],
});
const 하루 = (제출, 재시도, 고리) => ({
  submission_count: 제출, retry_count: 재시도, correction_retry: 고리,
});

test('첫날은 빈 배열로 온다 — 화면을 아예 안 띄운다', () => {
  assert.equal(견줌({ ok: true, date: '2026-08-09', data: [] }), null);
  assert.equal(견줌({}), null, '응답이 망가져도 화면이 죽지 않는다');
  assert.equal(견줌(null), null);
});

test('🔴 「어제 0」은 첫날이 아니다 — 참이고 보여줄 값이다', () => {
  const v = 견줌(봉투(하루(1, 0, false), 하루(0, 0, false)));
  assert.notEqual(v, null, '어제 아무것도 안 낸 학생을 첫날로 접으면 동기가 통째로 사라진다');
  assert.deepEqual(v.낸것, { 오늘: 1, 어제: 0, 늘었나: true });
  assert.equal(늘어난말(v), '어제보다 1개 더 보냈어요.');
});

test('같으면 늘어난 것이 아니다 (엄격히 클 때만)', () => {
  const v = 견줌(봉투(하루(2, 1, false), 하루(2, 1, false)));
  assert.equal(v.낸것.늘었나, false);
  assert.equal(v.다시말한것.늘었나, false);
  assert.equal(늘어난말(v), null);
});

test('🚫 줄어도 숫자는 그대로 내고, 말은 안 붙인다', () => {
  const v = 견줌(봉투(하루(1, 0, false), 하루(3, 2, false)));
  assert.deepEqual(v.낸것, { 오늘: 1, 어제: 3, 늘었나: false }, '감추면 그 화면을 못 믿는다');
  assert.equal(늘어난말(v), null, '「어제보다 적어요」는 동기가 아니라 평가다');
});

test('🔴 교정 재발화는 bool 그대로 — 숫자로 접지 않는다 (유일한 결과 변수)', () => {
  const v = 견줌(봉투(하루(2, 1, true), 하루(2, 1, false)));
  assert.deepEqual(v.교정재발화, { 오늘: true, 어제: false });
  assert.equal(v.낸것.오늘, 2, '고리가 제출 수에 섞이면 두 축이 한 칸이 된다');
});

test('숫자가 아닌 값은 0 — 화면에 NaN 을 그리지 않는다', () => {
  const v = 견줌(봉투(하루('둘', null, 1), 하루(undefined, -3, 0)));
  assert.deepEqual(v.낸것, { 오늘: 0, 어제: 0, 늘었나: false });
  assert.deepEqual(v.다시말한것, { 오늘: 0, 어제: 0, 늘었나: false }, '음수도 모르는 값이다');
  assert.deepEqual(v.교정재발화, { 오늘: false, 어제: false }, '1·0 은 bool 이 아니다 — 접지 않는다');
});

test('탐지력 픽스처 — 판정기가 죽으면 위 검사들이 무엇이든 통과한다', () => {
  assert.equal(견줌(봉투(하루(1, 0, false), null)), null, 'yesterday 가 없으면 견줄 수 없다');
  assert.equal(견줌({ data: [{ today: 하루(1, 0, false) }] }), null);
});

/* ── 문구 사본 금지 ────────────────────────────────────────────────────────────
 * 같은 말을 **두 화면**이 한다(「어제의 나」·말하기 완료 카드 · 유호님 확정 2026-08-09).
 * 한쪽에 손으로 적으면 그날부터 갈라지고, 갈라져도 양쪽 화면은 멀쩡히 뜬다 — 학생만
 * 같은 사실을 두 문장으로 듣는다. 그래서 **문장이 사는 곳이 하나뿐인지**를 따로 잰다.
 *
 * 주석을 먼저 지운다 — 주석에 적힌 설명을 위반으로 읽으면 바른 코드가 막히고, 막힌 사람은
 * 우회를 정상 통로로 만든다(`tests/로그인코드.test.js` 가 같은 이유로 같은 전처리를 한다). */
const 주석제거 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

test('「어제보다」 문장을 아는 파일은 lib/견줌.js 하나뿐이다 (사본 금지)', () => {
  const 걸린것 = fs.readdirSync(path.join(ROOT, 'src'))
    .filter((f) => f.endsWith('.js'))
    .filter((f) => 주석제거(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).includes('어제보다'));
  assert.deepEqual(걸린것, [],
    `문구가 화면에 직접 적혀 있다: ${걸린것.join(', ')}\n`
    + '  「어제보다 N개 더 보냈어요」는 lib/견줌.js 의 `늘어난말` 하나에서만 나온다 — 거기서 import 해라.');
});

/* 🔴 **이름이 보이는 것과 부르는 것은 다르다.** 첫 판은 `/늘어난말/` 이었고, 호출을 지워도
 *   `import { 견줌, 늘어난말 }` 이 남아 그대로 초록이었다(2026-08-09 변이로 실측 — 살아남았다).
 *   그 상태가 정확히 사고의 모양이다: 문장이 화면에서 사라졌는데 검사는 「쓰고 있다」고 말한다. */
test('두 화면 모두 그 함수를 **실제로 부른다** (import 만 남아도 못 통과한다)', () => {
  for (const f of ['어제의나.js', '말하기화면.js']) {
    const src = 주석제거(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'));
    assert.ok(/늘어난말\s*\(/.test(src),
      `${f} 가 늘어난말 을 안 부른다 — 이름만 import 에 남아 있으면 사본 금지도 같이 눈이 먼다`);
  }
});

test('탐지력 픽스처 — 사본·미호출이 되살아나면 잡는다', () => {
  assert.ok('const 말 = `어제보다 ${차}개 더 보냈어요.`;'.includes('어제보다'),
    '사본 탐지기가 죽으면 위 검사는 무엇이든 통과시킨다');
  assert.equal(주석제거('/* 「어제보다 적어요」는 안 쓴다 */ 늘어난말(값)').includes('어제보다'), false,
    '주석 속 설명을 위반으로 읽으면 바른 코드가 막힌다');
  assert.equal(/늘어난말\s*\(/.test('import { 견줌, 늘어난말 } from "../lib/견줌.js";'), false,
    'import 줄을 호출로 읽으면 「지웠는데 통과」가 되살아난다 — 실측으로 살아남았던 변이다');
});
