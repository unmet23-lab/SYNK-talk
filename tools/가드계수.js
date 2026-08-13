#!/usr/bin/env node
'use strict';
/**
 * 가드 계수기 — 「소스 원문을 대상으로 삼는 검사」가 저장소에 몇 개이고, 그중 몇이
 * **주석 제거를 안 거치는지**를 «센다». 판정하지 않는다 (F401 · 2026-08-13).
 *
 * ■ 왜 있나 — 급조 계수기가 두 번 틀렸다
 *   F401 신고문이 「숫자를 지어내지 않으려 안 실었다」고 적은 그 자리다: 급히 만든 계수기가
 *   ①긍정 단언까지 세고 ②피연산자가 파일 원문이 아닌 것까지 세어 **과대계상**했다.
 *   그래서 이 도구는 두 조건을 «따로» 확인한다 — 부정 단언인가, 그리고 그 피연산자가
 *   `readFileSync` 에서 온 문자열인가. 둘 다 참일 때만 셈에 넣는다.
 *
 * ■ 왜 정규식이 아니라 파서인가
 *   세려는 대상이 정확히 「주석과 코드를 구별 못 하는 검사」다. 그것을 정규식으로 세면
 *   계수기 자신이 같은 병에 걸린다(주석에 적힌 `assert.ok(!src.includes(...))` 예시를
 *   실물로 센다). 파서는 주석을 원리상 안 본다.
 *
 * ■ 새는 방향을 못박는다 (F207)
 *   못 읽은 파일·못 가른 단언을 **0으로 접지 않는다.** 분모(훑은 파일 수)와 ❔(모름)을
 *   항상 같이 낸다 — 「위험 0건」과 「아무것도 못 쟀다」는 다른 상태다.
 *
 * 쓰기: node tools/가드계수.js [뿌리경로] [--json]
 */

const fs = require('fs');
const path = require('path');

/* 🔑 파서를 못 불러도 **여기서 죽지 않는다** — 부르는 쪽이 갈리기 때문이다. 도구는 종료코드 2 로
 *   죽어야 하고(0건과 구별), 회귀는 fail 이 아니라 **skip** 으로 드러내야 한다(F296 — repo 밖
 *   환경에 기댄 검사가 CI 를 깨뜨린 자리). 그래서 판정은 `잴수있나()` 하나에서만 난다. */
let acorn = null;
try { acorn = require('acorn'); } catch (_) { /* 아래 `잴수있나()` 가 진다 */ }
function 잴수있나() { return acorn !== null; }

/* ── 훑을 자리 ────────────────────────────────────────────────────────────────
 * `tests/` 와 `tools/` 둘 다 본다 — 소스 원문을 검사 대상으로 삼는 코드는 회귀에만
 * 있는 것이 아니다(precommit·배포대조 계열이 같은 모양을 쓴다). */
const 훑을폴더 = ['tests', 'tools'];

function 파일들(뿌리) {
  const 모음 = [];
  for (const 폴더 of 훑을폴더) {
    const 시작 = path.join(뿌리, 폴더);
    if (!fs.existsSync(시작)) continue;
    const 대기 = [시작];
    while (대기.length) {
      const 여기 = 대기.pop();
      for (const e of fs.readdirSync(여기, { withFileTypes: true })) {
        const p = path.join(여기, e.name);
        /* `fixtures` 는 «검사 재료»지 가드가 아니다 — 세면 이 도구의 탐지력 픽스처가 곧
         * 실저장소 위반으로 잡힌다(자기 픽스처에 걸리는 가드 · F103 축). 뿌리를 픽스처
         * 안쪽으로 주면 그 위는 안 훑으므로 픽스처 자체는 그대로 잴 수 있다. */
        if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'fixtures') 대기.push(p); continue; }
        if (/\.(js|mjs|cjs)$/.test(e.name)) 모음.push(p);
      }
    }
  }
  return 모음.sort();
}

/* ── AST 훑기 ─────────────────────────────────────────────────────────────── */
function 훑기(노드, 방문) {
  if (!노드 || typeof 노드.type !== 'string') return;
  방문(노드);
  for (const 키 of Object.keys(노드)) {
    if (키 === 'type' || 키 === 'start' || 키 === 'end' || 키 === 'loc') continue;
    const 값 = 노드[키];
    if (Array.isArray(값)) { for (const v of 값) if (v && typeof v.type === 'string') 훑기(v, 방문); }
    else if (값 && typeof 값.type === 'string') 훑기(값, 방문);
  }
}

function 이름(노드) {
  if (!노드) return '';
  if (노드.type === 'Identifier') return 노드.name;
  if (노드.type === 'MemberExpression') return `${이름(노드.object)}.${이름(노드.property)}`;
  return '';
}

/** 이 부분트리가 «파일을 읽는가». `읽기()` 같은 지역 헬퍼는 따로 이어 받는다. */
function 읽기가있나(노드, 원문함수) {
  let 있다 = false;
  훑기(노드, (n) => {
    if (n.type !== 'CallExpression') return;
    const nm = 이름(n.callee);
    if (/(^|\.)readFileSync$/.test(nm)) 있다 = true;
    if (원문함수.has(nm)) 있다 = true;
  });
  return 있다;
}

/** 이 부분트리의 **맨 바깥**이 정제 함수 호출인가 — 안쪽에만 있으면 정제된 것이 아니다. */
function 정제로감쌌나(노드, 정제함수) {
  let n = 노드;
  /* `코드만(읽기(x)).replace(...)` 처럼 뒤에 체인이 붙는 모양을 벗긴다. */
  while (n && (n.type === 'MemberExpression' || n.type === 'CallExpression')) {
    if (n.type === 'CallExpression') {
      if (정제함수.has(이름(n.callee))) return true;
      n = n.callee;
    } else n = n.object;
  }
  return false;
}

/* 문자열 내용을 재는 술어 — 이게 없으면 「소스를 대상으로 삼은 검사」가 아니다. */
const 술어RE = /\.(includes|indexOf|match|search|test|exec|startsWith|endsWith|split)\s*\(/;

/* 수신자(무엇을 재는가)를 뽑는 두 갈래. `RE.test(X)` 는 인자가, `X.includes(y)` 는 객체가 대상이다. */
const 인자가대상 = new Set(['test', 'exec']);
const 객체가대상 = new Set(['includes', 'indexOf', 'match', 'search', 'startsWith', 'endsWith', 'split']);

/** 이 단언이 «무엇을» 재는지 — 수신자 노드들. 못 뽑으면 빈 배열. */
function 수신자들(노드) {
  const 모음 = [];
  훑기(노드, (n) => {
    if (n.type !== 'CallExpression' || !n.callee || n.callee.type !== 'MemberExpression') return;
    const 술어 = 이름(n.callee.property);
    if (인자가대상.has(술어) && n.arguments[0]) 모음.push(n.arguments[0]);
    else if (객체가대상.has(술어)) 모음.push(n.callee.object);
  });
  return 모음;
}

/* ── ㉡ 주석 제거기 사본 판별 ─────────────────────────────────────────────────
 * 🔴 첫 판이 급조 계수기와 «같은 병»에 걸렸다 (2026-08-13 실측): 함수 본문을 글자로 훑어
 *   `\/` 가 보이면 셌더니 base64url 인코더(`.replace(/\//g,'_')`)가 3벌 섞여 들어왔다.
 *   그래서 이제 **`.replace()` 의 첫 인자가 정규식 리터럴일 때 그 `source` 를 본다** —
 *   주석의 모양(`\*` 또는 `\/\/`)이 그 안에 있어야 사본이다. F401 이 신고한 과대계상을
 *   내가 그대로 되풀이하지 않으려면 이 자리가 AST 여야 한다. */
function 주석정규식(re) {
  const s = String(re || '');
  /* ⚠ SQL 을 «먼저» 본다 — SQL 도 블록 주석이 `/* *​/` 라 모양이 겹친다. 가르는 것은 `--` 뿐이고,
   *   순서를 뒤집으면 `tools/원격SQL.js` 가 JS 사본으로 잡혀 「합쳐라」는 잘못된 처방이 나온다. */
  if (/(^|[^\\])--/.test(s)) return 'sql';
  if (/\\\*/.test(s)) return 'js';        // 블록 주석 — `\/\*[\s\S]*?\*\/`
  if (/\\\/\\\//.test(s)) return 'js';    // 줄 주석 — `\/\/[^\n]*`
  return null;
}

/** 이 부분트리가 «주석을 지우는가» — 판정은 `.replace()` 첫 인자의 정규식 «모양» 하나뿐.
 *  반환 = null | 'js' | 'sql' */
function 주석지우나(노드) {
  let 갈래 = null;
  훑기(노드, (n) => {
    if (n.type !== 'CallExpression' || !n.callee || n.callee.type !== 'MemberExpression') return;
    if (이름(n.callee.property) !== 'replace') return;
    const a = n.arguments[0];
    if (!a || a.type !== 'Literal' || !a.regex) return;
    const g = 주석정규식(a.regex.pattern);
    /* SQL 이 «이긴다» — 한 함수가 블록(`/* *​/`)과 `--` 를 둘 다 지우면 그건 SQL 제거기다.
     * JS 가 이기게 두면 `tools/원격SQL.js` 가 합칠 대상으로 잘못 나온다(08-13 실측). */
    if (g === 'sql') 갈래 = 'sql';
    else if (g === 'js' && 갈래 !== 'sql') 갈래 = 'js';
  });
  return 갈래;
}

/**
 * 주석 제거기처럼 생긴 «함수»인가 — ㉡ 축. 반환 = null | 'js' | 'sql'
 *
 * 🔴 [2026-08-13 2차] **«함수 모양»만 보던 것이 이 도구의 사각이었다** (F401 이 남긴 재료를
 *   처분하다 실측). 첫 판은 `const 주석제거 = (s) => …` 만 셌다. 그런데 저장소의 사본 다수는
 *   함수가 아니라 **식**이다 — `const 주석뺀소스 = 소스.replace(/\/\*…/g,' ')…`. 그래서
 *   계수기가 「지역 사본 0벌」을 냈고, 그것을 값으로 못박은 회귀(`tests/소스검사통로.test.js`)가
 *   **13벌이 살아 있는 채로 초록**이었다. 새는 방향이 언제나 「통과」인 그 모양 그대로다.
 *   👉 이제 세 모양을 다 본다: 화살표·함수식(여기) · 함수선언 · **식**(아래 `식사본`).
 */
function 주석제거기갈래(init) {
  if (!init || (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression')) return null;
  return 주석지우나(init);
}

/** 전수를 «센다». 파서가 없으면 던진다 — 「0건」으로 접지 않는다(F207). */
function 재기(뿌리) {
if (!잴수있나()) throw new Error('acorn 을 못 불렀다 — 셀 수 없다(0건이 아니다)');
const 결과 = {
  뿌리,
  훑은파일: 0,
  못읽은파일: [],
  사본: [],       // ㉡ 주석 제거기 지역 사본(JS)
  SQL사본: [],    // ㉡ 참고 — 같은 «생각»의 다른 언어(합치는 대상이 아니다)
  위험: [],       // ㉠ 부정 단언 × 원문 직접
  안전: [],       // ㉠ 부정 단언 × 정제 경유
  모름: [],       // 부정 단언 × 수신자를 못 가름
};

for (const 파일 of 파일들(뿌리)) {
  const 상대 = path.relative(뿌리, 파일).replace(/\\/g, '/');
  let 소스;
  let ast;
  try {
    소스 = fs.readFileSync(파일, 'utf8');
    ast = acorn.parse(소스, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true });
  } catch (e) {
    /* CJS·JSX·문법 미래형 — 못 읽은 것을 「깨끗하다」로 접지 않는다. */
    try {
      ast = acorn.parse(소스, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
    } catch (e2) {
      결과.못읽은파일.push({ 파일: 상대, 사유: String(e2.message).slice(0, 80) });
      continue;
    }
  }
  결과.훑은파일 += 1;

  const 줄번호 = (pos) => 소스.slice(0, pos).split('\n').length;

  /* ① 이 파일이 아는 «정제 함수» 이름 — 공용 통로 + 지역 사본. */
  const 정제함수 = new Set(['코드만', '구간']);
  /* ② 파일 원문을 «내주는» 함수 이름 — `const 읽기 = (p) => fs.readFileSync(...)`. */
  const 원문함수 = new Set();
  /* ②-b 식 모양 사본이 내놓은 «이미 정제된» 변수 이름 — 아래 ③ 이 정제변수로 이어받는다. */
  const 식사본변수 = new Set();

  /* 공용 통로를 import 로 들여왔으면 그 지역 이름도 정제로 센다.
   * ⚠ 이 수집이 **먼저**다 — 아래 원문 생산자 판정이 이 목록을 읽는다. 뒤에 두면
   *   `() => 코드만(readFileSync(...))` 가 원문 생산자로 잡힌다(08-13 실측 오분류). */
  훑기(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'ObjectPattern' && n.init
        && n.init.type === 'CallExpression' && /소스검사/.test(소스.slice(n.init.start, n.init.end))) {
      for (const p of n.id.properties) if (p.value && p.value.type === 'Identifier') 정제함수.add(p.value.name);
    }
  });

  /* 함수 «선언» 모양의 사본 — `function 주석없이(s) { return s.replace(…) }`.
   * 08-13 실측: `tests/검수큐.test.js`·`tests/스폰통로.test.js` 가 이 모양이라 통째로 사각이었다. */
  훑기(ast, (n) => {
    if (n.type !== 'FunctionDeclaration' || !n.id) return;
    const 갈래 = 주석지우나(n);
    if (!갈래) return;
    const 자리 = { 파일: 상대, 줄: 줄번호(n.start), 이름: n.id.name, 본문: 소스.slice(n.start, n.end).replace(/\s+/g, ' ').slice(0, 120) };
    if (갈래 === 'js') { 정제함수.add(n.id.name); 결과.사본.push(자리); } else 결과.SQL사본.push(자리);
  });

  훑기(ast, (n) => {
    if (n.type !== 'VariableDeclarator' || !n.id || n.id.type !== 'Identifier') return;
    const 갈래 = 주석제거기갈래(n.init);
    if (갈래) {
      const 자리 = { 파일: 상대, 줄: 줄번호(n.start), 이름: n.id.name, 본문: 소스.slice(n.init.start, n.init.end).replace(/\s+/g, ' ').slice(0, 120) };
      if (갈래 === 'js') { 정제함수.add(n.id.name); 결과.사본.push(자리); } else 결과.SQL사본.push(자리);
      return;
    }
    /* 🔴 «식» 모양의 사본 — `const 주석뺀소스 = 소스.replace(/\/\*…/g, ' ')…`.
     *   함수가 아니라 **값**이라 위 갈래에 안 걸렸다(이 도구의 사각 · 머리말 2차 실측).
     *   여기서 잡아 두면 아래 ③ 이 이 이름을 «정제변수»로 이어받는다 — 그 자리들은
     *   원문을 직접 재는 것이 «아니»므로 위험이 아니고, 그러나 **사본이므로 보고된다.** */
    if (n.init && n.init.type !== 'ArrowFunctionExpression' && n.init.type !== 'FunctionExpression') {
      const 식갈래 = 주석지우나(n.init);
      if (식갈래) {
        const 자리 = { 파일: 상대, 줄: 줄번호(n.start), 이름: n.id.name, 본문: 소스.slice(n.init.start, n.init.end).replace(/\s+/g, ' ').slice(0, 120) };
        if (식갈래 === 'js') 결과.사본.push(자리); else 결과.SQL사본.push(자리);
        식사본변수.add(n.id.name);
        return;
      }
    }
    if ((n.init && (n.init.type === 'ArrowFunctionExpression' || n.init.type === 'FunctionExpression')) && 읽기가있나(n.init, 원문함수)) {
      /* ⚠ 읽기만으로 「원문 생산자」라 부르면 `() => 코드만(readFileSync(...))` 를 오분류한다 —
       *   그 함수가 내주는 것은 이미 정제된 글이다(실측 08-13: 사본을 공용으로 돌린 직후
       *   위험이 67→69 로 «올라갔다». 코드가 좋아졌는데 숫자가 나빠지면 계수기가 틀린 것이다). */
      const 돌려주는것 = [];
      if (n.init.body && n.init.body.type !== 'BlockStatement') 돌려주는것.push(n.init.body);
      else 훑기(n.init.body, (m) => { if (m.type === 'ReturnStatement' && m.argument) 돌려주는것.push(m.argument); });
      const 정제해서준다 = 돌려주는것.length > 0 && 돌려주는것.every((r) => 정제로감쌌나(r, 정제함수));
      if (정제해서준다) 정제함수.add(n.id.name);
      else 원문함수.add(n.id.name);
    }
  });
  /* ③ 원문 변수 / 정제된 변수 — 파일 전체를 한 스코프로 근사한다(테스트 파일 관례).
   *
   * 🔑 **파생을 이어 받는다.** `const 조각 = 소스.slice(i, j)` 는 여전히 파일 원문이다 —
   *   첫 판이 `init.type === 'Identifier'` 인 경우만 이어받아 ❔모름이 179 로 부풀었고,
   *   그 179 는 「셀 수 없다」가 아니라 **내 계수기가 못 따라간 것**이었다(08-13 실측).
   *   선언 순서에 안 기대려고 **바뀌지 않을 때까지** 돌린다(파일 하나라 회차는 몇 안 된다). */
  const 원문변수 = new Set();
  const 정제변수 = new Set();
  for (let 회차 = 0; 회차 < 6; 회차 += 1) {
    const 이전 = 원문변수.size + 정제변수.size;
    훑기(ast, (n) => {
      if (n.type !== 'VariableDeclarator' || !n.id || n.id.type !== 'Identifier' || !n.init) return;
      if (정제함수.has(n.id.name) || 원문함수.has(n.id.name)) return;
      if (원문변수.has(n.id.name) || 정제변수.has(n.id.name)) return;
      let 원문파생 = false;
      let 정제파생 = false;
      훑기(n.init, (m) => {
        if (m.type !== 'Identifier') return;
        if (원문변수.has(m.name)) 원문파생 = true;
        if (정제변수.has(m.name)) 정제파생 = true;
      });
      /* ⚠ 정제된 것의 파생(`조각 = 소스.slice(…)`)도 «정제»다 — 안 이어받으면 그 단언이
       *   ❔모름으로 새고, 모름이 부풀면 이 도구의 숫자를 아무도 안 읽는다. */
      if (!읽기가있나(n.init, 원문함수) && !원문파생 && !정제파생 && !식사본변수.has(n.id.name)) return;
      if (원문파생 || 읽기가있나(n.init, 원문함수)) {
        /* 🔑 «식 모양 사본»도 정제다 — 통로가 공용이 아닐 뿐, 그 자리는 원문을 직접 재지 않는다.
         *   위험으로 세면 처방이 「감싸라」로 나오는데 실제 처방은 「사본을 공용으로 돌려라」다. */
        if (정제로감쌌나(n.init, 정제함수) || 식사본변수.has(n.id.name)) 정제변수.add(n.id.name);
        else 원문변수.add(n.id.name);
      } else 정제변수.add(n.id.name);
    });
    if (원문변수.size + 정제변수.size === 이전) break;
  }

  /* ④ 부정 단언 — 「그렇지 않다」를 말하는 단언만 센다. */
  const 단언이름 = (nm) => nm === 'assert' || /^assert\.(ok|equal|strictEqual|deepEqual|deepStrictEqual|match|doesNotMatch)$/.test(nm);
  훑기(ast, (n) => {
    if (n.type !== 'CallExpression') return;
    const nm = 이름(n.callee);
    if (!단언이름(nm)) return;
    const [a0, a1] = n.arguments;
    if (!a0) return;

    let 부정 = false;
    let 과녁 = a0;
    if (a0.type === 'UnaryExpression' && a0.operator === '!') { 부정 = true; 과녁 = a0.argument; }
    else if (/doesNotMatch$/.test(nm)) 부정 = true;
    else if (a1 && a1.type === 'Literal' && a1.value === false) 부정 = true;
    else if (a1 && a1.type === 'ArrayExpression' && a1.elements.length === 0) 부정 = true;
    else if (a1 && a1.type === 'UnaryExpression' && a1.operator === '-' && a1.argument
             && a1.argument.value === 1 && 술어RE.test(소스.slice(a0.start, a0.end))) 부정 = true;
    if (!부정) return;

    const 글 = 소스.slice(과녁.start, 과녁.end);
    if (!술어RE.test(글)) return; // 문자열 내용을 재는 단언이 아니다

    /* 🔴 여기가 급조 계수기의 두 번째 병이었다 — 「부분트리에 원문 변수가 «보이면» 위험」으로
     *   세면 `서버모양.test('문자열 상수')` 처럼 **재는 대상이 소스가 아닌** 단언까지 들어온다
     *   (실측 08-13: 위험 44 중 그 모양이 섞였다). 그래서 이제 **수신자**만 본다 —
     *   무엇을 재는가가 곧 이 축의 질문이기 때문이다. */
    const 받는것 = 수신자들(과녁);
    if (!받는것.length) return;

    let 원문닿음 = false;
    let 정제닿음 = false;
    let 모름닿음 = false;
    for (const r of 받는것) {
      if (r.type === 'Literal' || r.type === 'TemplateLiteral') continue; // 상수를 재는 단언 — 이 축이 아니다
      if (r.type === 'Identifier') {
        if (정제변수.has(r.name)) { 정제닿음 = true; continue; }
        if (원문변수.has(r.name)) { 원문닿음 = true; continue; }
        모름닿음 = true; continue;
      }
      if (r.type === 'CallExpression') {
        const c = 이름(r.callee);
        if (정제함수.has(c)) { 정제닿음 = true; continue; }
        if (/(^|\.)readFileSync$/.test(c) || 원문함수.has(c)) { 원문닿음 = true; continue; }
        /* `코드만(읽기(x))` 처럼 감싼 모양은 바깥이 정제면 정제다. */
        if (정제로감쌌나(r, 정제함수)) { 정제닿음 = true; continue; }
        if (읽기가있나(r, 원문함수)) { 원문닿음 = true; continue; }
        모름닿음 = true; continue;
      }
      모름닿음 = true;
    }

    const 자리 = { 파일: 상대, 줄: 줄번호(n.start), 글: 글.replace(/\s+/g, ' ').slice(0, 110) };
    if (원문닿음) 결과.위험.push(자리);          // 하나라도 원문을 직접 재면 그 단언은 눈이 먼다
    else if (정제닿음) 결과.안전.push(자리);
    else if (모름닿음 && (원문변수.size || 원문함수.size)) 결과.모름.push(자리);
  });
}

return 결과;
}

module.exports = { 재기, 잴수있나 };

if (require.main !== module) return;

const 뿌리 = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('-')) || '.');
const JSON출력 = process.argv.includes('--json');
if (!잴수있나()) { console.error('[가드계수] acorn 을 못 불렀다 — 셀 수 없다(0건이 아니다).'); process.exit(2); }
const 결과 = 재기(뿌리);

if (JSON출력) { console.log(JSON.stringify(결과, null, 2)); process.exit(0); }

console.log(`[가드계수] 뿌리 ${뿌리}`);
console.log(`  훑은 파일 ${결과.훑은파일}개 · 못 읽은 파일 ${결과.못읽은파일.length}개  ← 분모(F207)`);
for (const f of 결과.못읽은파일) console.log(`     ❔ ${f.파일} — ${f.사유}`);
console.log('');
console.log(`㉡ 주석 제거기 «지역 사본» ${결과.사본.length}벌 (공용 tests/lib/소스검사.js 는 제외)`);
for (const s of 결과.사본) console.log(`   · ${s.파일}:${s.줄}  ${s.이름} = ${s.본문}`);
if (결과.SQL사본.length) {
  console.log(`   (참고) SQL 주석 제거기 ${결과.SQL사본.length}벌 — 언어가 달라 «합치는 대상이 아니다»`);
  for (const s of 결과.SQL사본) console.log(`     · ${s.파일}:${s.줄}  ${s.이름}`);
}
console.log('');
console.log(`㉠ 부정 단언 × 파일 원문 — 🔴위험 ${결과.위험.length} · ✅정제경유 ${결과.안전.length} · ❔모름 ${결과.모름.length}`);
for (const v of 결과.위험) console.log(`   🔴 ${v.파일}:${v.줄}  ${v.글}`);
for (const v of 결과.모름) console.log(`   ❔ ${v.파일}:${v.줄}  ${v.글}`);
console.log('');
console.log('※ 이 도구는 «센다» — 위험이 곧 결함이라는 판정이 아니다(그 자리가 주석을 안 볼 이유가 있을 수 있다).');
