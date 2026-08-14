/* 컴패니언 통로 `functions/companion` — 계약(`docs/컴패니언_내부계약.md`)과 배선이 갈라졌나.
 *
 * ■ 이 검사가 지키는 다섯 (계약 §5)
 *   ① **허용 역할 리터럴** — 차단 목록이면 못 적은 역할이 통과한다(새는 방향=통과).
 *      급소: `inspector` 가 들어오면 검수자(전사 축)가 학원 운영 문서를 통째로 읽는다.
 *   ② **qa 행 + 감사가 한 트랜잭션인가** — 나누면 답은 나갔는데 빈칸 로그엔 없는 질문이 생기고,
 *      그 손실은 증상이 없다(「안 왔다」와 「로그가 실패했다」가 같은 모양이다).
 *   ③ **cited_refs 를 화이트리스트로 «거르는가»** — 안 거르면 모델이 지어낸 문서명이
 *      «출처 있는 답»의 얼굴을 쓴다. 사람은 출처가 붙은 답을 더 믿으므로 가짜 출처는 더 멀리 간다.
 *   ④ **옛글자 게이트가 «코드층»에 있는가** — 프롬프트 조항으로 갈음하면 모델 판단 안이라
 *      안 걸린 날을 알 방법이 없다. 그리고 «정제»가 아니라 «폐기»여야 한다(상담AI:240).
 *   ⑤ **동봉이 실제 파일을 가리키는가** — 손 사본이 생기면 정본이 둘이 된다.
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 쓰는 표기 — 실제 `index.ts` 원문을 읽는다.
 *   ② 미실행이 통과와 같은 모양이면 안 된다 — 파일·앵커를 못 찾으면 **거기서 실패**한다.
 *   ③ 검사가 자기 주석에 눈멀지 않게 `코드만` 으로 주석을 지우고 센다 — 이 파일 머리말에도
 *      `inspector`·`cited_refs` 가 잔뜩 나오고, index.ts 주석에는 더 많다. 안 지우면 ①③④가
 *      영원히 초록이다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { 코드만 } = require('./lib/소스검사.js');

const 뿌리 = path.resolve(__dirname, '..');
const 함수방 = path.join(뿌리, 'supabase', 'functions', 'companion');
const 본체경로 = path.join(함수방, 'index.ts');
const 동봉경로 = path.join(함수방, '동봉.json');
const teach경로 = path.join(뿌리, 'supabase', 'functions', 'teach', 'index.ts');

assert.ok(fs.existsSync(본체경로), 'functions/companion/index.ts 가 없다 — 이 검사가 통째로 미실행이다');
assert.ok(fs.existsSync(동봉경로), 'functions/companion/동봉.json 이 없다 — ⑤ 가 미실행이다');
const 원문 = fs.readFileSync(본체경로, 'utf8');
const 소스 = 코드만(원문);

/* ── ① 허용 목록 (급소) ──────────────────────────────────────────── */

test('① 강사역할은 허용 목록이고 teacher·director 둘뿐이다', () => {
  const m = /const\s+강사역할\s*=\s*\[([^\]]*)\]/.exec(소스);
  assert.ok(m, '강사역할 선언을 못 찾았다 — 이름이 바뀌었으면 이 검사부터 고친다');
  const 역할 = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(역할.slice().sort(), ['director', 'teacher']);
});

test('① `inspector` 가 코드 어디에도 없다 — 검수자는 이 문을 못 연다', () => {
  assert.ok(!/inspector/.test(소스),
    'companion 코드에 inspector 가 있다 — 전사 축이 학원 운영 문서를 읽게 된다');
});

test('① 역할을 «본문»에서 안 읽는다 — 호출자 주장은 안 믿는다(events 선례)', () => {
  /* 본문 파서(`몸읽기`)가 읽는 칸은 question·screen 둘뿐이어야 한다. */
  const 몸 = /function\s+몸읽기\([\s\S]*?\n}/.exec(소스);
  assert.ok(몸, '몸읽기 를 못 찾았다 — 앵커가 낡았다');
  const 읽는칸 = [...몸[0].matchAll(/b\.(\w+)/g)].map((x) => x[1]);
  assert.deepEqual([...new Set(읽는칸)].sort(), ['question', 'screen'],
    '본문에서 question·screen 아닌 칸을 읽는다 — 역할·staff_id 를 본문이 정하면 방어선이 없다');
});

/* ── ② 한 트랜잭션 ───────────────────────────────────────────────── */

test('② qa 행과 감사 행이 «한» sql.begin 안에 있다', () => {
  const m = /sql\.begin\(async \(tx\)[\s\S]*?\n  \}\);/.exec(소스);
  assert.ok(m, 'sql.begin 블록을 못 찾았다 — 앵커가 낡았다(이 검사는 무엇이든 통과시킨다)');
  const 덩이 = m[0];
  assert.ok(/insert into engine\.companion_qa/.test(덩이), 'qa insert 가 트랜잭션 밖이다');
  assert.ok(/insert into engine\.staff_access_log/.test(덩이), '감사 insert 가 트랜잭션 밖이다');
  /* 트랜잭션 밖에 같은 insert 가 또 있으면 「한 트랜잭션」이 무의미해진다. */
  assert.equal((소스.match(/insert into engine\.companion_qa/g) || []).length, 1);
  assert.equal((소스.match(/insert into engine\.staff_access_log/g) || []).length, 1);
  /* 🔴 **블록 «안»에 있는 것으로는 부족하다** — 변이 실측 2026-08-14: `await tx\`` 를
   *   `await sql\`` 로 한 글자 바꾸면 그 질의는 트랜잭션 밖에서 돌면서도 텍스트로는
   *   블록 안에 그대로 남는다. 위 세 줄만으로는 그 변이가 **초록으로 지나갔다**(맹점 ④ —
   *   장치는 안 도는 쪽보다 「맞는 얼굴로 틀린 값」 쪽으로 더 자주 샌다).
   *   그래서 블록 안의 태그드 템플릿이 전부 `tx` 인지를 센다. */
  const 태그들 = [...덩이.matchAll(/await\s+(\w+)`/g)].map((x) => x[1]);
  assert.ok(태그들.length >= 2, `트랜잭션 안 질의를 ${태그들.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  const 밖도구 = [...new Set(태그들)].filter((t) => t !== 'tx');
  assert.deepEqual(밖도구, [],
    `트랜잭션 블록 안에서 ${밖도구.join('·')} 로 질의한다 — 텍스트는 안에 있지만 실행은 밖이다`);
});

test('② 감사 action 은 `companion.ask` 하나다 — 문 이름이 로그에서 갈리면 못 센다', () => {
  const 액션 = [...소스.matchAll(/'(companion\.[a-z.]+)'/g)].map((x) => x[1]);
  assert.deepEqual([...new Set(액션)], ['companion.ask']);
});

/* ── ③ cited_refs 화이트리스트 ───────────────────────────────────── */

test('③ cited_refs 를 동봉 문서이름으로 «거른다»(주장을 그대로 안 쓴다)', () => {
  assert.ok(/new Set\(문서이름\)/.test(소스),
    '문서이름 화이트리스트를 안 만든다 — 모델이 댄 출처가 그대로 나간다');
  assert.ok(/허용\.has\(/.test(소스), '허용 집합으로 거르는 자리가 없다');
  /* 🔴 응답에 실리는 것이 «거른 것»이어야 한다 — 원본을 실으면 필터가 장식이 된다. */
  const 봉투줄 = /return 봉투\(200, \{[\s\S]*?\}, ver\);/.exec(소스);
  assert.ok(봉투줄, '200 봉투를 못 찾았다 — 앵커가 낡았다');
  assert.ok(/cited_refs: 출처/.test(봉투줄[0]),
    '응답이 걸러진 `출처` 가 아닌 값을 싣는다 — 화이트리스트가 도는데 안 쓰이는 형태');
  assert.ok(!/cited_refs: 원답\.cited_refs/.test(소스), '원본 cited_refs 를 그대로 싣는 자리가 있다');
});

test('③ DB 에 저장하는 것도 «거른 것»이다 — 로그가 가짜 출처를 정본으로 만들면 안 된다', () => {
  const m = /insert into engine\.companion_qa[\s\S]*?returning qa_id/.exec(소스);
  assert.ok(m, 'qa insert 를 못 찾았다 — 앵커가 낡았다');
  assert.ok(/\$\{출처\}::text\[\]/.test(m[0]),
    'qa 행에 걸러진 `출처` 가 아닌 값을 넣는다 — 빈칸 로그의 「출처 0」 판정이 오염된다');
});

/* ── ④ 옛글자 게이트 ─────────────────────────────────────────────── */

test('④ 옛글자 게이트가 코드층에 있고 «폐기»한다(정제 아님)', () => {
  assert.ok(/옛글자걸림\(/.test(소스), '옛글자 검사를 코드에서 안 부른다 — 프롬프트로 갈음했다');
  /* 폐기의 모양: 걸리면 reply 를 안 싣고 인계로 접는다. */
  assert.ok(/옛글자탈락/.test(소스), '걸린 결과를 쓰는 변수가 없다 — 부르고 버리는 형태');
  const 접기 = /const 인계 = [^;]+;/.exec(소스);
  assert.ok(접기, '인계 판정 줄을 못 찾았다 — 앵커가 낡았다');
  assert.ok(/옛글자탈락/.test(접기[0]), '옛글자 탈락이 인계 판정에 안 들어간다');
  /* 🚫 정제(치환)로 살려내는 자리가 없어야 한다. */
  assert.ok(!/reply\.replace\(/.test(소스), 'reply 를 치환해 살려내는 자리가 있다 — 폐기가 정제로 바뀌었다');
});

test('④ 옛글자에 걸린 답은 reply 가 빈 문자열로 나간다', () => {
  assert.ok(/const reply = 인계 \? '' :/.test(소스),
    '인계인데 reply 가 비지 않는 경로가 있다 — 폐기한 답이 화면에 남는다');
});

/* ── ⑤ 동봉 ─────────────────────────────────────────────────────── */

test('⑤ 동봉 표의 값이 실제로 있는 파일을 가리킨다', () => {
  const 표 = JSON.parse(fs.readFileSync(동봉경로, 'utf8'));
  const 항목 = Object.entries(표);
  assert.ok(항목.length > 0, '동봉 표가 비었다');
  for (const [이름, 경로] of 항목) {
    assert.ok(이름.endsWith('.mjs'), `동봉 키는 .mjs 여야 한다: ${이름}`);
    assert.ok(fs.existsSync(path.join(뿌리, 경로)), `동봉이 없는 파일을 가리킨다: ${이름} → ${경로}`);
  }
});

test('⑤ index.ts 가 import 하는 .mjs 가 전부 동봉 표에 있다 (배포는 성공하고 import 에서 죽는 자리)', () => {
  const 표 = JSON.parse(fs.readFileSync(동봉경로, 'utf8'));
  const 필요 = [...원문.matchAll(/^\s*import\s+[^'"]*from\s+'\.\/([^']+\.mjs)'/gm)].map((m) => m[1]);
  assert.ok(필요.length >= 3, `import 를 ${필요.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  const 빠진 = 필요.filter((n) => !(n in 표));
  assert.deepEqual(빠진, [], `동봉 표에 없는 import: ${빠진.join(', ')}`);
});

test('⑤ 동봉이 lib 정본을 가리킨다 — functions 안에 손 사본을 두지 않았다', () => {
  const 표 = JSON.parse(fs.readFileSync(동봉경로, 'utf8'));
  for (const [이름, 경로] of Object.entries(표)) {
    assert.ok(/^(lib|contents)\//.test(경로),
      `동봉 ${이름} 이 lib·contents 밖을 가리킨다(${경로}) — 정본이 둘이 된다`);
  }
});

/* ── 두 문이 안 섞였다 ───────────────────────────────────────────── */

test('teach 는 companion 의 경로를 모른다 — 문이 섞이지 않았다', () => {
  assert.ok(fs.existsSync(teach경로), 'functions/teach/index.ts 가 없다 — 이 검사가 미실행이다');
  const teach소스 = 코드만(fs.readFileSync(teach경로, 'utf8'));
  assert.ok(!/companion/.test(teach소스), 'teach 가 companion 을 안다 — 읽는 문과 쓰는 문이 섞였다');
});

test('companion 은 «쓰기 권위» 표를 안 건드린다 (읽고 답하는 문이다 · 계약 §1)', () => {
  /* 🔴 이 문이 corrections·submissions·learning_events 에 쓰면 라벨 권위의 경계가 무너진다.
   *   companion_qa·staff_access_log 둘 외의 engine 표가 소스에 나오면 그 자리에서 실패한다. */
  const 표들 = [...소스.matchAll(/engine\.(\w+)/g)].map((m) => m[1]);
  const 허용 = ['companion_qa', 'staff_access_log', 'staff', 'schema_migrations'];
  const 밖 = [...new Set(표들)].filter((t) => !허용.includes(t));
  assert.deepEqual(밖, [], `companion 이 만지면 안 되는 표를 안다: ${밖.join(', ')}`);
});

/* ── 벤더 계약 ───────────────────────────────────────────────────── */

test('모델·주소를 손 상수로 안 들고 교정엔진 정본을 재사용한다 (계약 §2)', () => {
  assert.ok(/from '\.\/교정엔진\.mjs'/.test(원문), '교정엔진 정본을 안 쓴다');
  assert.ok(!/claude-[a-z0-9-]+/.test(소스),
    '모델 이름을 코드에 박았다 — 유호님이 모델을 갈 때 여기가 낡는다(정본은 lib/교정엔진.js)');
  assert.ok(!/api\.anthropic\.com/.test(소스), '벤더 주소를 코드에 박았다 — 정본은 lib/교정엔진.js');
});

test('thinking 을 명시적으로 끈다 — sonnet-5 는 생략하면 adaptive 가 조용히 켜진다', () => {
  assert.ok(/thinking:\s*\{\s*type:\s*'disabled'\s*\}/.test(소스),
    'thinking 을 안 껐다 — max_tokens 는 thinking+본문 합산이라 text 블록 0개가 오고, '
    + '이 문에서 그 모습은 「거짓 인계」다');
});

test('스키마를 API 층에서 강제한다 — 프롬프트 부탁으로 갈음하지 않았다 (계약 §2 handoff 필수)', () => {
  assert.ok(/output_config:\s*\{\s*format:/.test(소스), 'output_config.format 이 없다');
  const m = /const 답스키마 = \{[\s\S]*?\} as const;/.exec(소스);
  assert.ok(m, '답스키마 를 못 찾았다 — 앵커가 낡았다');
  for (const 칸 of ['reply', 'cited_refs', 'handoff', 'handoff_reason']) {
    assert.ok(m[0].includes(`'${칸}'`) || m[0].includes(`${칸}:`), `답스키마에 ${칸} 이 없다`);
  }
  assert.ok(/additionalProperties:\s*false/.test(m[0]), 'additionalProperties:false 가 없으면 강제가 안 선다');
  const 필수 = /required:\s*\[([^\]]*)\]/.exec(m[0]);
  assert.ok(필수 && /handoff'/.test(필수[1]), 'handoff 가 required 가 아니다 — 계약 §2 위반');
});

test('키가 없으면 «인계»로 접는다 — 설정 문제를 발화 실패로 못박지 않는다 (correct:251 승계)', () => {
  const m = /const 키 = Deno\.env\.get\('ANTHROPIC_API_KEY'\)[\s\S]*?\n  \}/.exec(소스);
  assert.ok(m, '키 부재 갈래를 못 찾았다 — 앵커가 낡았다');
  assert.ok(/handoff: true/.test(m[0]), '키가 없을 때 인계로 안 접는다');
  assert.ok(!/throw|실패\(/.test(m[0]), '키 부재를 오류로 던진다 — 화면이 「고장」을 그린다');
});
