'use strict';
/**
 * 로그아웃이 **기기에 남는 학생 귀속 상태를 하나도 안 남기고** 지우는지 잡는다.
 *
 * 🔴 왜 있나 — 새는 방향이 「정상 로그아웃」이다
 *   `src/저장.js` 의 `기기비우기()` 는 세 곳을 지운다(세션·제출 로그·교정 로그). 하나가
 *   빠져도 화면은 똑같이 로그인 화면으로 돌아가고, 다음 학생이 들어와 말하기 화면을 여는
 *   순간에야 갈라진다:
 *     · 제출 로그가 남으면 → `밀린것` 재전송이 **앞 학생의 발화를 다음 학생 토큰으로** 올린다.
 *       서버는 본문이 아니라 토큰에서 learner_id 를 정하므로(`functions/events` ①) 그 행은
 *       남의 것이 되고, `learning_events` 는 append-only 라 **소급 복구가 없다.**
 *     · 교정 로그가 남으면 → 「이미 본 교정」으로 읽혀 다음 학생의 `correction.viewed` 가
 *       안 나간다(열람은 그날에만 존재하는 관측이라 이것도 소급 불가).
 *   즉 손실이 성공과 **똑같은 모양**이고, 둘 다 되돌릴 수 없다.
 *
 * 🔑 왜 정적 검사인가 — `src/저장.js` 는 `expo-secure-store`·`expo-file-system` 을 끌고 와서
 *   node 가 못 연다. 그래서 **호출 목록을 AST 로** 본다(`@babel/parser` 는 metro 가 이미
 *   깔아 둔 것 · 새 의존성 0 · `tests/미정의심볼.test.js` 와 같은 통로).
 * 🔑 탐지력은 **픽스처가 진다** — 실저장소 쪽 검사는 거짓양성만 본다(버그가 아직 있을 것을
 *   요구하는 회귀를 만들지 않는다).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const 저장소 = path.resolve(__dirname, '..', 'src', '저장.js');

/** `기기비우기` 본문이 부르는 이름들을 **선언 순서대로** 돌려준다. 없으면 null. */
function 지우는순서(소스) {
  const ast = parser.parse(소스, { sourceType: 'module', plugins: ['jsx'] });
  const 부름 = [];
  let 찾음 = false;

  const 훑기 = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(훑기); return; }
    if (n.type === 'CallExpression' && n.callee && n.callee.type === 'Identifier') {
      부름.push(n.callee.name);
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
      훑기(n[k]);
    }
  };

  const 뿌리 = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(뿌리); return; }
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === '기기비우기') {
      찾음 = true;
      훑기(n.body);
      return;
    }
    for (const k of Object.keys(n)) 뿌리(n[k]);
  };

  뿌리(ast.program);
  return 찾음 ? 부름 : null;
}

const 지워야할것 = ['로그쓰기', '교정로그쓰기', '세션지우기'];

test('로그아웃이 학생 귀속 상태 세 곳을 모두 지운다', () => {
  const 순서 = 지우는순서(fs.readFileSync(저장소, 'utf8'));
  assert.ok(순서, 'src/저장.js 에 기기비우기() 가 없다 — 이름이 바뀌었으면 이 검사도 따라가야 한다');
  for (const 이름 of 지워야할것) {
    assert.ok(순서.includes(이름), `기기비우기() 가 ${이름}() 를 안 부른다 — 그 자리는 다음 학생에게 그대로 넘어간다`);
  }
});

/* 🔴 순서도 규약이다 — 세션을 먼저 지우면, 뒤가 실패했을 때 **로그가 남은 채로 로그아웃이
 *   끝난다.** 그게 위 주석이 막으려는 바로 그 상태이고, 실패는 조용하다. */
test('세션은 마지막에 지운다 — 앞이 실패하면 로그인이 남아 다시 시도할 수 있다', () => {
  const 순서 = 지우는순서(fs.readFileSync(저장소, 'utf8'));
  assert.equal(순서[순서.length - 1], '세션지우기', `실제 순서: ${순서.join(' → ')}`);
});

/* ── 탐지력 픽스처 — 이 검사가 실제로 잡는지 ───────────────────────────────── */

const 빠뜨린판 = `
export async function 기기비우기() {
  await 로그쓰기([]);
  await 세션지우기();
}`;

const 뒤집힌판 = `
export async function 기기비우기() {
  await 세션지우기();
  await 로그쓰기([]);
  await 교정로그쓰기([]);
}`;

test('탐지력 — 한 곳을 빠뜨리면 실제로 잡힌다', () => {
  const 순서 = 지우는순서(빠뜨린판);
  assert.ok(!순서.includes('교정로그쓰기'), '빠진 것을 못 보면 이 회귀는 아무것도 안 지킨다');
});

test('탐지력 — 순서가 뒤집히면 실제로 잡힌다', () => {
  const 순서 = 지우는순서(뒤집힌판);
  assert.notEqual(순서[순서.length - 1], '세션지우기');
});

test('탐지력 — 함수가 없으면 null 이다 (없는 것을 통과로 읽지 않는다)', () => {
  assert.equal(지우는순서('export async function 다른것() { await 로그쓰기([]); }'), null);
});
