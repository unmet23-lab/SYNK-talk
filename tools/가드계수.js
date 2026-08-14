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

/**
 * 이 부분트리의 «맨 바깥»이 `JSON.parse` 인가 — 소스 «글»이 아니라 **구조**를 내주는 자리.
 *
 * 🔴 [2026-08-13 2차 실측] 이 경계가 없어서 `const 계약 = JSON.parse(readFileSync(…))` 가
 *   원문 변수로 섰고, 그것을 인자로 만든 **생성된 SQL 문자열**(`const q = 삽입SQL({판: 계약.버전})`)
 *   까지 원문 파생으로 번져 위험으로 셌다(`교정확정:82`·`동의발급:116`). 그 자리들은 파일 원문을
 *   재는 것이 «아니»라 처방이 통째로 틀린다 — 감싸 봐야 잴 대상이 안 바뀐다.
 *   🔑 JSON 엔 **주석이 없다.** 이 축(「가드가 자기 주석에 눈먼다」)이 원리상 성립하지 않는다.
 */
function JSON구조인가(노드) {
  let n = 노드;
  while (n && (n.type === 'MemberExpression' || n.type === 'CallExpression')) {
    if (n.type === 'CallExpression') {
      if (이름(n.callee) === 'JSON.parse') return true;
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

/** 이 수신자가 «과녁 안 콜백의 매개변수»인가 — 파일 스코프 근사가 확실히 틀리는 자리.
 *
 * 🔴 [2026-08-14 · #Q70 ㉡ 실측] `r.오류들.some((m) => m.includes(…))` 의 `m` 은 런타임 값인데,
 *   같은 파일 위쪽의 `const m = /…/.exec(원문)` 이 원문변수로 서 있으면 그 이름이 물들어
 *   위험으로 셌다(`사건위조:101` 오탐). 매개변수는 파일 스코프가 아니라 그 함수의 것이고,
 *   콜백으로 무엇이 흐르는지는 이 근사가 원리상 못 가른다 — 그래서 ❔모름으로 «드러낸다»
 *   (위험으로 세면 처방이 「런타임 배열을 감싸라」가 되고, 따를 수 없는 처방은 우회를 낳는다 F103).
 *   ⚠ 대가: 배열 원소가 진짜 파일 원문인 자리(`소스들.some((s) => …)`)도 모름으로 물러난다 —
 *   미탐이 아니라 «모름»이라 분모에 남고, 그 방향이 「조용한 통과」보다 정직하다. */
function 매개변수그늘(과녁, r) {
  if (r.type !== 'Identifier') return false;
  let 그늘 = false;
  훑기(과녁, (fn) => {
    if (!/Function/.test(fn.type) || !Array.isArray(fn.params)) return;
    if (r.start < fn.start || r.end > fn.end) return;   // 그 함수 «안»에 있는 수신자만
    for (const p of fn.params) {
      훑기(p, (m) => { if (m.type === 'Identifier' && m.name === r.name) 그늘 = true; });
    }
  });
  return 그늘;
}

/* ── 모양 어휘 × 축표 — 이 도구가 «같은 병»에 네 번 걸린 자리 (F414 뿌리) ──────────
 * 네 번 다 모양이 같았다: 한 축에서 «함수 모양»을 하나 배우고 **옆 축에 안 옮겼다**.
 *   1차 base64url 3벌 · 2차 「식도 사본이다」 · 3차 「별표는 주석이 아니다」 ·
 *   4차 「함수 «선언»형 원문 생산자」(㉡에서 08-13 에 고쳐 놓고 ㉠엔 08-14 까지 안 옮겼다).
 * 앞의 처방은 매번 «그 축»만 고쳤다. 그래서 뿌리가 한 겹 위에 남았다 — 옮겼는지를
 * **사람이 기억**해야 했다. 여기서 그걸 기계로 내린다:
 *   ① 모양은 `모양` 에서만 열거한다(축이 손으로 `n.type === '…'` 를 쓰지 않는다).
 *   ② 축은 «어느 모양을 받는지»를 `축표` 에 적는다 — ✗ 는 **사유가 필수**다.
 *   ③ 어휘에 새 모양을 더하면 축표의 모든 축에 빈 칸이 생겨 회귀가 적색이 된다.
 *      즉 새 모양을 들이는 사람은 **축마다 「이 축은 어떤가」를 대답해야** 통과한다.
 * 발동 조건은 `tests/가드계수축표.test.js` 가 진다(장치와 발동을 같은 커밋에).
 *
 * ⚠ 대가(틀릴 때의 모습 — 안 도는 쪽보다 이쪽으로 더 자주 샌다):
 *   ㉠ 어휘를 **안 거치고** 손으로 타입을 비교하면 그 자리는 축표에도 안 서고 회귀도 못 본다.
 *      → 그래서 회귀가 이 파일 안의 raw 타입 비교를 **금지**한다(옛 통로 차단).
 *      단 금지는 **이 파일 안에서만**이다 — 다른 도구의 같은 글자까지 막으면 따를 수 없는
 *      처방이 되고, 따를 수 없는 처방은 우회를 정상 통로로 만든다(F103).
 *   ㉡ 타입 이름을 변수에 담아 비교하면(`const T = 'FunctionDeclaration'; n.type === T`)
 *      회귀의 눈이 멀고 «통과»로 샌다. 이건 미탐을 택한 것이다 — 막으려면 파일 전체를
 *      상수 전개해야 하는데 그 비용이 이 장치가 막는 병보다 크다.
 *   ㉢ 축표는 **받는지 여부**만 말한다. 그 축이 그 모양을 «옳게» 판정하는지는 안 본다
 *      (그건 탐지력 픽스처 몫이다 — 표가 초록인데 판정이 틀릴 수 있다).
 *
 * 🔑 `VariableDeclarator` 는 이 어휘에 없다 — 그건 «담는 그릇»이지 함수 모양이 아니고,
 *    모양을 안 가리고 전부 받는 자리(③ 변수 축·모호변수)에도 그대로 쓰인다. 어휘에 넣으면
 *    표가 「모양을 가리는 축」과 「안 가리는 축」을 같은 칸으로 뭉개 뜻을 잃는다. */
const 모양 = {
  함수선언: (n) => (n && n.type === 'FunctionDeclaration' && n.id ? n : null),
  화살표:   (n) => (n && n.type === 'ArrowFunctionExpression' ? n : null),
  함수식:   (n) => (n && n.type === 'FunctionExpression' ? n : null),
  /* 함수가 아니라 «값» — `const 주석뺀소스 = 소스.replace(…)`. 2차에 ㉡이 배운 모양이다. */
  식:       (n) => (n && n.type !== 'ArrowFunctionExpression' && n.type !== 'FunctionExpression' ? n : null),
};
/** 화살표 ∪ 함수식 — 「변수에 담긴 함수」. 파생이라 축표의 칸이 아니다(둘이 이미 칸이다). */
모양.함수값 = (n) => 모양.화살표(n) || 모양.함수식(n);

/** 축 × 모양 — `[받는가, 사유]`. ✗ 는 사유가 **비면 회귀가 적색**이다.
 *  ✓ 의 사유는 비어도 된다(받는 것은 설명이 필요 없다 — 안 받는 것만 설명이 필요하다). */
const 축표 = {
  '㉡사본': {
    함수선언: [true, '`function 주석없이(s){ return s.replace(…) }` — 08-13 2차에 여기서 배웠다'],
    화살표:   [true, ''],
    함수식:   [true, ''],
    식:       [true, '`const 주석뺀소스 = 소스.replace(…)` — 함수가 아니라 값인 사본(2차)'],
  },
  '㉠원문생산자': {
    함수선언: [true, '③-b — 08-14 4차에 ㉡에서 **옮겨 온** 모양이다(이 표가 막으려는 바로 그 누락)'],
    화살표:   [true, ''],
    함수식:   [true, ''],
    식:       [false, '식은 «생산자»가 아니라 값이다 — 모양을 안 가리는 ③ 변수 축이 그대로 받는다(중복 판정 금지)'],
  },
  '내보내는생산자': {
    함수선언: [true, ''],
    화살표:   [true, ''],
    함수식:   [true, ''],
    식:       [false, '내보낸 «값»은 호출부에서 함수로 안 쓰인다 — 미탐을 택했다(값을 생산자로 세면 모듈 객체를 오분류한다 · F414 첫 처방이 낸 오탐 3건이 그 모양이었다)'],
  },
};

/* ── ㉡ 주석 제거기 사본 판별 ─────────────────────────────────────────────────
 * 🔴 첫 판이 급조 계수기와 «같은 병»에 걸렸다 (2026-08-13 실측): 함수 본문을 글자로 훑어
 *   `\/` 가 보이면 셌더니 base64url 인코더(`.replace(/\//g,'_')`)가 3벌 섞여 들어왔다.
 *   그래서 이제 **`.replace()` 의 첫 인자가 정규식 리터럴일 때 그 `source` 를 본다** —
 *   주석의 모양(`\/\*` 또는 `\/\/`)이 그 안에 있어야 사본이다. F401 이 신고한 과대계상을
 *   내가 그대로 되풀이하지 않으려면 이 자리가 AST 여야 한다.
 *
 * 🔴 [2026-08-13 3차] **`\*` 만 보던 것이 세 번째 과대계상이었다** — 같은 병의 세 번째다.
 *   블록 주석은 `\/\*` 다: **슬래시가 있어야 주석이다.** 별표 하나만 보면 이 셋이 통째로
 *   사본으로 세어진다 — ①마크다운 굵게 지우기(별표 둘) ②별표 지우기(별표 하나)
 *   ③glob→정규식(별표를 `.` 붙인 별표로). 셋 다 주석과 아무 상관이 없다.
 *   👉 **talk 에선 영원히 안 보이는 사각이었다**(그 모양이 여기 없다 — 조여도 0벌 그대로).
 *      as 저장소(문서·빌드 도구가 많다)에 처음 대 보니 **사본 44 중 24벌이 이 거짓양성**이었다.
 *      계수기를 «다른 저장소»에 대 보는 것 자체가 탐지였다 — 한 저장소에서만 재면 그 저장소에
 *      없는 모양은 영영 안 드러난다(F207 의 분모 축과 같은 뿌리다).
 *   ⚠ 처방이 틀리는 자리라 급했다: 마크다운 처리기에 「공용 주석 통로로 감싸라」는 말은
 *      따를 수 없는 처방이고, 따를 수 없는 처방은 우회를 정상 통로로 만든다(F103). */
function 주석정규식(re) {
  const s = String(re || '');
  /* ⚠ SQL 을 «먼저» 본다 — SQL 도 블록 주석이 `/* *​/` 라 모양이 겹친다. 가르는 것은 `--` 뿐이고,
   *   순서를 뒤집으면 `tools/원격SQL.js` 가 JS 사본으로 잡혀 「합쳐라」는 잘못된 처방이 나온다. */
  if (/(^|[^\\])--/.test(s)) return 'sql';
  if (/\\\/\\\*/.test(s)) return 'js';    // 블록 주석 — `\/\*[\s\S]*?\*\/`
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
  if (!init || !모양.함수값(init)) return null;
  return 주석지우나(init);
}

/* ── 불투명 import — 원문 생산자가 «다른 파일»에 살 때 ────────────────────────────────
 * 🔴 [2026-08-14 4차 · as 실측] 같은 병의 **네 번째**다. 앞의 셋은 「모양을 하나만 봤다」였고
 *   이번은 「이 파일만 봤다」다. 원문 생산자를 **지역 선언**에서만 찾으니
 *   `const { engineSource } = require('./_engine-source')` 는 영영 안 보인다.
 *   as 실측: `engineSource()` 는 엔진 7파일을 `readFileSync` 해 이어 붙인 **원문 그대로**인데
 *   그것을 받은 `const code = engineSource()` 가 원문변수로 못 서서, 그 파일의 단언이 통째로
 *   ❔모름으로 샜다 — 직접 17자리에 파생(`section`·`code.slice`)까지 ~48자리.
 *   👉 talk 에선 원리상 안 드러난다(그 모양이 여기 없다) — 3차와 **같은 자리**다.
 *
 * ⚠ 대가(틀릴 때의 모습): 상대경로 require 를 **한 겹만** 따라간다.
 *   ① `node_modules`·절대경로·동적 경로는 안 본다 — 따라가면 분모가 저장소 밖으로 번지고,
 *      못 읽는 날 이 도구가 통째로 죽는다(F296).
 *   ② 한 겹이다 — 들여온 파일이 «또» 들여온 것은 안 본다(지금 실측 0건 · 나오면 그때 늘린다).
 *   ③ 못 읽거나 못 파싱하면 **아무것도 안 더한다** — 모름으로 남는 것이 「깨끗하다」보다 정직하다.
 *   ④ 정제가 **이긴다** — 읽고 나서 정제해 주는 함수를 원문으로 세면 처방이 「감싸라」로 나오고,
 *      이미 감싼 것을 또 감싸라는 따를 수 없는 처방이 된다(F103). */
const 들여온것캐시 = new Map();

/** 그 함수 «자신»의 반환식만 — 안에 든 다른 함수의 `return` 은 그 함수 몫이다.
 *  (`세우기` 의 require 셤이 안쪽에서 `return m` 을 하는데, 그것까지 세면 판정이 흔들린다.) */
function 제반환식(fn) {
  if (fn.body && fn.body.type !== 'BlockStatement') return [fn.body];
  const out = [];
  const 타기 = (노드) => {
    if (!노드 || typeof 노드 !== 'object') return;
    if (Array.isArray(노드)) { for (const c of 노드) 타기(c); return; }
    if (typeof 노드.type === 'string' && /Function/.test(노드.type)) return;
    if (노드.type === 'ReturnStatement' && 노드.argument) out.push(노드.argument);
    for (const k of Object.keys(노드)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
      타기(노드[k]);
    }
  };
  타기(fn.body);
  return out;
}

/** 이 반환식이 «파일 원문 글»인가 — **읽었다고 글을 내주는 것은 아니다.**
 *
 * 🔴 [2026-08-14 4차 · 내 첫 판이 여기서 틀렸다] 이 경계 없이 「읽으면 원문 생산자」로 셌더니
 *   `tests/lib/앱모듈세우기.js` 의 `세우기()` 가 원문 생산자로 섰다 — 그 함수는 파일을 읽지만
 *   내주는 것은 `module_.exports`, 즉 **모듈 객체**다. 그러자 그 팩에서 나온 «데이터»가 전부
 *   원문 파생이 되어 talk 에서 `팩.같은스킬다른문항(…)`·`JSON.stringify(학생판)` 까지 위험으로
 *   섰다(실측 오탐 3건). 처방이 「모듈 객체를 주석 제거기로 감싸라」가 되는데, 따를 수 없는
 *   처방은 우회를 정상 통로로 만든다(F103).
 *   지역 판정의 `JSON구조인가` 와 **같은 축**이다 — 파일에서 왔지만 «글»이 아닌 것. */
function 원문글인가(r, 원문변수, 빈함수) {
  if (!r) return false;
  if (r.type === 'ObjectExpression' || r.type === 'ArrayExpression') return false;
  if (JSON구조인가(r)) return false;
  if (읽기가있나(r, 빈함수)) return true;          // 반환식 «안»에 읽기가 있다 — engineSource 모양
  if (r.type === 'Identifier') return 원문변수.has(r.name);
  let 파생 = false;
  훑기(r, (m) => { if (m.type === 'Identifier' && 원문변수.has(m.name)) 파생 = true; });
  return 파생;
}

/** 상대경로 하나를 실제 파일로. 없으면 null(확장자·index 까지만 본다 — 해석기를 짓지 않는다). */
function 붙이기(기준, 상대) {
  for (const c of [상대, `${상대}.js`, path.join(상대, 'index.js')]) {
    const p = path.resolve(기준, c);
    try { if (fs.statSync(p).isFile()) return p; } catch (_) { /* 다음 후보 */ }
  }
  return null;
}

/** 그 파일이 내보내는 이름 중 «원문을 내주는» 것 / «읽고서 정제해 주는» 것. */
function 내보내는생산자(파일) {
  if (들여온것캐시.has(파일)) return 들여온것캐시.get(파일);
  const 결과 = { 원문: new Set(), 정제: new Set() };
  들여온것캐시.set(파일, 결과);   // 순환 require 방어 — 재귀 전에 먼저 넣는다
  let 소스;
  let ast;
  try {
    소스 = fs.readFileSync(파일, 'utf8');
    ast = acorn.parse(소스, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true });
  } catch (_) {
    try { ast = acorn.parse(소스, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true }); }
    catch (_2) { return 결과; }   // ③ 못 읽으면 아무것도 안 더한다
  }
  /* 그 파일 «자신의» 정제 통로 — 여기 없이 판정하면 ④ 가 깨진다.
   * SQL 제거기도 넣는다 — ㉠축 별건 판정(08-14 · 재기 쪽 그 주석) 과 같은 판정 하나다. */
  const 정제함수 = new Set(['코드만', '구간']);
  훑기(ast, (n) => {
    if (모양.함수선언(n) && 주석지우나(n)) 정제함수.add(n.id.name);
    if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier'
        && 주석제거기갈래(n.init)) 정제함수.add(n.id.name);
  });
  /* 🔴 [2026-08-14 · ⑧회차 ㉠ 실측] 공용 통로를 «별칭으로 들여와 다시 내보내는» 파일 —
   *   as `tools/실행층점검.js` 의 `const { 줄맞춰코드만: 주석지우기 } = require('…/소스검사.js')`.
   *   이 인식이 없으면 그 재수출을 받은 소비자가 **통로 그 자체를 위험으로** 센다(같은 병 5차 —
   *   「이 파일만 봤다」의 남은 반쪽: 들여온 파일 «안»의 들여옴). 재귀를 여는 것이 아니라
   *   정본 통로 하나(경로에 «소스검사»)를 알아보는 것뿐이다 — main 루프의 그 판정과 같은 판정.
   *   ⚠ 대가: 별칭이 «또 다른 이름으로» 재수출되면(`{ 지우개: 주석지우기 }`) 못 본다 — 실측 0건,
   *   나오면 그때 수출층을 본다(지금 넓히면 못 재는 것을 재는 척이 된다). */
  훑기(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'ObjectPattern' && n.init
        && n.init.type === 'CallExpression' && /소스검사/.test(소스.slice(n.init.start, n.init.end))) {
      for (const p of n.id.properties) {
        if (p.value && p.value.type === 'Identifier') { 정제함수.add(p.value.name); 결과.정제.add(p.value.name); }
      }
    }
  });
  /* 그 파일 «안»에서 읽기로 생긴 이름 — 반환식이 그것의 파생인지 보려면 필요하다. */
  const 원문변수 = new Set();
  const 빈함수 = new Set();
  훑기(ast, (n) => {
    if (n.type !== 'VariableDeclarator' || !n.id || n.id.type !== 'Identifier' || !n.init) return;
    if (JSON구조인가(n.init)) return;
    if (읽기가있나(n.init, 빈함수)) 원문변수.add(n.id.name);
  });
  const 판정 = (본문, nm) => {
    if (정제함수.has(nm)) { 결과.정제.add(nm); return; }
    if (!읽기가있나(본문, 빈함수)) return;          // 파일을 안 읽으면 이 축이 아니다
    const 돌려주는것 = 제반환식(본문);
    if (!돌려주는것.length) return;
    if (돌려주는것.every((r) => 정제로감쌌나(r, 정제함수))) { 결과.정제.add(nm); return; }
    if (돌려주는것.some((r) => 원문글인가(r, 원문변수, 빈함수))) 결과.원문.add(nm);
  };
  훑기(ast, (n) => {
    if (모양.함수선언(n)) 판정(n, n.id.name);
    else if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier'
             && 모양.함수값(n.init)) 판정(n.init, n.id.name);
  });
  return 결과;
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

  /* ②-c 상대경로 require 로 들여온 «원문 생산자» — 위 ①② 가 «이 파일만» 보던 사각(4차 · 머리말).
   *   두 받는 모양을 다 본다: 구조분해(`const { engineSource } = require(…)`)와
   *   통째(`const E = require(…)` → `E.engineSource()` — `이름()` 이 점 이름을 내므로 그대로 맞는다). */
  훑기(ast, (n) => {
    if (n.type !== 'VariableDeclarator' || !n.id || !n.init) return;
    if (n.init.type !== 'CallExpression' || 이름(n.init.callee) !== 'require') return;
    const 인자 = n.init.arguments[0];
    if (!인자 || 인자.type !== 'Literal' || !/^\.\.?\//.test(String(인자.value))) return;  // ① 상대경로만
    const 대상 = 붙이기(path.dirname(파일), String(인자.value));
    if (!대상) return;
    const 생산자 = 내보내는생산자(대상);
    if (n.id.type === 'ObjectPattern') {
      for (const p of n.id.properties) {
        if (!p.key || !p.value || p.value.type !== 'Identifier') continue;
        const 원이름 = 이름(p.key);
        if (생산자.정제.has(원이름)) 정제함수.add(p.value.name);
        else if (생산자.원문.has(원이름)) 원문함수.add(p.value.name);
      }
    } else if (n.id.type === 'Identifier') {
      for (const nm of 생산자.정제) 정제함수.add(`${n.id.name}.${nm}`);
      for (const nm of 생산자.원문) 원문함수.add(`${n.id.name}.${nm}`);
    }
  });

  /* 함수 «선언» 모양의 사본 — `function 주석없이(s) { return s.replace(…) }`.
   * 08-13 실측: `tests/검수큐.test.js`·`tests/스폰통로.test.js` 가 이 모양이라 통째로 사각이었다.
   *
   * 🔑 [2026-08-14 · #Q70 ㉠ 별건 판정] **SQL 제거기도 ㉠축(정제 경유)에서는 «정제»로 센다.**
   *   ㉡축(사본 합치기)의 「언어가 달라 합치는 대상이 아니다」는 그대로다 — 두 축은 질문이 다르다:
   *   ㉡는 「통로를 하나로 합칠 수 있나」, ㉠는 「이 부정 단언이 주석에 눈머나」. SQL 텍스트를 재는
   *   단언이 SQL 제거기(`--`·`/* *​/`)를 지나면 주석에 안 먼다 — 그것을 위험으로 세면 처방이 없다
   *   (JS 렉서 `코드만` 은 SQL `--` 를 모른다 · F103: 따를 수 없는 처방은 우회를 낳는다). 그리고
   *   옳게 감쌌는데 숫자가 안 움직이면 「틀리게 감싸도 아무도 모른다」의 반대쪽 절반이 죽는다.
   *   ⚠ 대가: 계수기는 주어의 «언어»를 모른다 — JS 원문을 SQL 제거기로 감싸도 안전으로 센다
   *   (반대 방향 — sql`` 몸을 `코드만` 으로 감싼 자리 — 은 원래부터 그랬다). 센다, 판정하지 않는다.
   *   ⚠ «식» 모양(`식사본변수`)은 이미 SQL 도 정제로 이어받고 있었다 — 이 판정은 함수 모양
   *   둘(선언·값)과 들여온 생산자를 그 기존 동작에 «맞추는» 것이기도 하다(갈라진 판정 하나로). */
  훑기(ast, (n) => {
    if (!모양.함수선언(n)) return;
    const 갈래 = 주석지우나(n);
    if (!갈래) return;
    const 자리 = { 파일: 상대, 줄: 줄번호(n.start), 이름: n.id.name, 본문: 소스.slice(n.start, n.end).replace(/\s+/g, ' ').slice(0, 120) };
    정제함수.add(n.id.name);
    if (갈래 === 'js') 결과.사본.push(자리); else 결과.SQL사본.push(자리);
  });

  훑기(ast, (n) => {
    if (n.type !== 'VariableDeclarator' || !n.id || n.id.type !== 'Identifier') return;
    const 갈래 = 주석제거기갈래(n.init);
    if (갈래) {
      const 자리 = { 파일: 상대, 줄: 줄번호(n.start), 이름: n.id.name, 본문: 소스.slice(n.init.start, n.init.end).replace(/\s+/g, ' ').slice(0, 120) };
      정제함수.add(n.id.name);   // SQL 도 ㉠축에선 정제다 — 위 별건 판정(08-14) 그대로
      if (갈래 === 'js') 결과.사본.push(자리); else 결과.SQL사본.push(자리);
      return;
    }
    /* 🔴 «식» 모양의 사본 — `const 주석뺀소스 = 소스.replace(/\/\*…/g, ' ')…`.
     *   함수가 아니라 **값**이라 위 갈래에 안 걸렸다(이 도구의 사각 · 머리말 2차 실측).
     *   여기서 잡아 두면 아래 ③ 이 이 이름을 «정제변수»로 이어받는다 — 그 자리들은
     *   원문을 직접 재는 것이 «아니»므로 위험이 아니고, 그러나 **사본이므로 보고된다.** */
    if (모양.식(n.init)) {
      const 식갈래 = 주석지우나(n.init);
      if (식갈래) {
        const 자리 = { 파일: 상대, 줄: 줄번호(n.start), 이름: n.id.name, 본문: 소스.slice(n.init.start, n.init.end).replace(/\s+/g, ' ').slice(0, 120) };
        if (식갈래 === 'js') 결과.사본.push(자리); else 결과.SQL사본.push(자리);
        식사본변수.add(n.id.name);
        return;
      }
    }
    if (모양.함수값(n.init) && 읽기가있나(n.init, 원문함수)) {
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
  /* 파일에서 왔지만 «글»이 아닌 것 — `JSON.parse(readFileSync(…))`. 주석이 없는 층이라
   * 이 축(가드가 자기 주석에 눈먼다)이 원리상 성립하지 않는다. 셋 중 어디에도 안 넣는다. */
  const 구조변수 = new Set();
  for (let 회차 = 0; 회차 < 6; 회차 += 1) {
    const 이전 = 원문변수.size + 정제변수.size + 원문함수.size + 정제함수.size;
    /* ③-b 함수 «선언» 모양의 원문 생산자 — `function 구간(a, b) { return code.slice(a, b) }`.
     *
     * 🔴 [2026-08-14 · as 실측] 위 ② 는 화살표·함수식만 원문 생산자로 본다. 같은 판정을
     *   **함수 선언**에도 해야 하는데 그 모양은 ㉡(사본) 축에서만 봤다 — 08-13 에 사본 축에서
     *   정확히 이 사각을 고쳐 놓고(「함수 «선언» 모양의 사본」) 원문 축에는 안 옮긴 것이다.
     *   한 축에서 배운 모양을 다른 축에 안 옮기면 그 축은 그대로 눈이 먼다.
     *   as 실측: `수집.test.js` 의 `function section()` 이 `code.slice(…)` 를 내주는데도
     *   원문함수에 못 서서 그 파일 24자리가 통째로 ❔모름이었다.
     *
     * ⚠ 루프 «안»이라야 한다 — `section` 이 원문인지는 `code` 가 원문변수로 선 뒤에야 안다.
     *   밖에 두면 선언 순서에 기대게 되고, 그 기대는 파일마다 다르게 깨진다. */
    훑기(ast, (n) => {
      if (!모양.함수선언(n)) return;
      const nm = n.id.name;
      if (정제함수.has(nm) || 원문함수.has(nm)) return;
      const 돌려주는것 = 제반환식(n);
      if (!돌려주는것.length) return;
      /* 정제가 이긴다 — 이미 감싼 것을 또 감싸라는 처방은 따를 수 없다(F103). */
      if (돌려주는것.every((r) => 정제로감쌌나(r, 정제함수))) { 정제함수.add(nm); return; }
      /* 「읽었다고 «글»은 아니다」 경계를 여기도 그대로 쓴다 — 한 축에서 배운 것을 다른 축에
       *   안 옮기면 그 축이 눈이 먼다는 것이 바로 이 조임(③-b)이 고치는 병이다. */
      if (돌려주는것.some((r) => 원문글인가(r, 원문변수, 원문함수))) 원문함수.add(nm);
    });
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
      /* JSON 구조는 이 축이 아니다 — 어느 쪽에도 안 넣어 «파생이 번지는 것»부터 끊는다.
       * ⚠ ❔모름이 아니라 «구조»로 따로 적는다: 모름은 「못 갈랐다」인데 여기는 갈랐다. */
      if (JSON구조인가(n.init)) { 구조변수.add(n.id.name); return; }
      /* 🔑 «읽기»가 init 에 안 보여도 정제 통로가 감쌌으면 정제다 — 들여온 생산자(②-c)가
       *   읽기를 **자기 안에** 감추기 때문이다(`const 정제된 = 깨끗이(경로)`). 이 갈래가 없으면
       *   정제해 준 것이 ❔모름으로 새고, 모름이 부풀면 이 도구의 숫자를 아무도 안 읽는다. */
      const 정제감쌈 = 정제로감쌌나(n.init, 정제함수);
      if (!읽기가있나(n.init, 원문함수) && !원문파생 && !정제파생 && !식사본변수.has(n.id.name) && !정제감쌈) return;
      if (원문파생 || 읽기가있나(n.init, 원문함수)) {
        /* 🔑 «식 모양 사본»도 정제다 — 통로가 공용이 아닐 뿐, 그 자리는 원문을 직접 재지 않는다.
         *   위험으로 세면 처방이 「감싸라」로 나오는데 실제 처방은 「사본을 공용으로 돌려라」다. */
        if (정제로감쌌나(n.init, 정제함수) || 식사본변수.has(n.id.name)) 정제변수.add(n.id.name);
        else 원문변수.add(n.id.name);
      } else 정제변수.add(n.id.name);
    });
    if (원문변수.size + 정제변수.size + 원문함수.size + 정제함수.size === 이전) break;
  }

  /* ⚠ **한 이름이 두 곳에서 «다르게» 선언되면 이 근사가 깨진다.**
   *   위 ③ 은 파일 전체를 한 스코프로 근사한다(테스트 파일 관례). 그런데 테스트는 같은 이름을
   *   test 본문마다 다시 선언한다 — 윗쪽엔 `const 순서 = 지우는순서(readFileSync(…))` 가 있고
   *   탐지력 픽스처엔 `const 순서 = 지우는순서(빠뜨린판)` 가 있다(파일이 아니라 **상수**다).
   *   근사가 뒤엣것까지 원문으로 물들여 위험으로 셌다(2026-08-13 실측 · `기기비우기` 3건).
   *   🔑 이건 위험이 아니라 **못 가른 것**이라 ❔모름으로 «드러낸다». 조용히 위험으로 세면
   *   그 처방(「공용 통로로 감싸라」)이 상수를 감싸라는 말이 되고, 따를 수 없는 처방은
   *   우회를 정상 통로로 만든다(F103). */
  const 모호변수 = new Set();
  훑기(ast, (n) => {
    if (n.type !== 'VariableDeclarator' || !n.id || n.id.type !== 'Identifier' || !n.init) return;
    if (!원문변수.has(n.id.name)) return;
    let 파생 = false;
    훑기(n.init, (m) => {
      if (m.type === 'Identifier' && (원문변수.has(m.name) || 정제변수.has(m.name))) 파생 = true;
    });
    if (!읽기가있나(n.init, 원문함수) && !파생) 모호변수.add(n.id.name);
  });

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
        /* 콜백 매개변수가 파일 스코프의 같은 이름을 그늘지게 한다 — 런타임 값이라 못 가른다(위 헬퍼). */
        if (매개변수그늘(과녁, r)) { 모름닿음 = true; continue; }
        if (구조변수.has(r.name)) continue;            // JSON 구조 — 이 축이 아니다
        if (모호변수.has(r.name)) { 모름닿음 = true; continue; }  // 같은 이름이 두 뜻 — 못 갈랐다
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

/* `모양`·`축표` 를 내주는 이유는 하나다 — `tests/가드계수축표.test.js` 가 **표와 실물을
 * 대조**해야 하기 때문이다(표만 있고 아무도 안 읽으면 그건 프로즈다 · F414 뿌리). */
module.exports = { 재기, 잴수있나, 모양, 축표 };

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
