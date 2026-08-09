/* 교정 배치(`supabase/functions/correct`) — **등록층** 검사.
 *
 * 왜 소스를 보나: 이 함수의 실패는 대부분 로직이 아니라 등록에서 난다(동봉 누락 → 배포는
 * 성공하고 첫 호출의 import 에서 죽음 · 게이트 누락 → 학생 토큰이 남의 행을 돌림).
 * 그 셋은 실행해 보지 않고도 소스에서 갈린다.
 *
 * ⚠ **글자 위치로 실행 순서를 재지 않는다**(F287 — 그 조건이 멀쩡한 코드를 세 번 빨갛게
 *   만들었다). 순서가 중요한 자리는 순서 대신 **결과의 모양**을 묻는다(아래 「분모」 검사).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const 방 = path.join(__dirname, '..', 'supabase', 'functions', 'correct');
const 본체 = fs.readFileSync(path.join(방, 'index.ts'), 'utf8');
const 동봉 = JSON.parse(fs.readFileSync(path.join(방, '동봉.json'), 'utf8'));
const 납작 = (s) => s.replace(/\s+/g, ' ').trim();

test('🔴 index.ts 가 import 하는 .mjs 는 전부 동봉 표에 있다', () => {
  /* 없으면 **배포는 ✅ 로 끝나고 첫 호출의 import 에서 죽는다** — 이 저장소가 이미 두 번 겪은
   * 실패 모양이다. `tools/원격배포.js 본체import검사` 와 같은 판정을 테스트로도 잡는다. */
  const 쓰는것 = [...본체.matchAll(/^\s*import\s+[^'"]*from\s+'\.\/([^']+\.mjs)'/gm)].map((m) => m[1]);
  assert.ok(쓰는것.length >= 4, `import 가 너무 적다(${쓰는것.length}) — 검사가 헛돌고 있다`);
  const 빠진 = 쓰는것.filter((n) => !Object.prototype.hasOwnProperty.call(동봉, n));
  assert.deepEqual(빠진, [], `동봉 표에 없다: ${빠진.join(', ')}`);
});

test('🔴 프롬프트·값목록의 정본을 베끼지 않고 동봉으로 받는다', () => {
  assert.equal(동봉['교정프롬프트.mjs'], 'prompts/교정.md',
    '프롬프트를 동봉하지 않으면 코드 안에 베끼게 되고, 베낀 프롬프트는 evals 가 재는 것과 갈린다');
  assert.equal(동봉['계약.mjs'], '계약/수집_교정_계약.json');
  assert.equal(동봉['교정엔진.mjs'], 'lib/교정엔진.js');

  // 값목록을 이 파일에 다시 적었으면 그게 세 번째 사본이다(계약 · 프롬프트 · 여기).
  assert.ok(!/조사:주격|오류없음'/.test(본체),
    '오류태그 리터럴이 함수 본체에 있다 — 정본은 계약 JSON 하나다');
  // 프롬프트 문장을 코드에 옮겨 적지 않았는가(규칙 머리글이 새어 나온 전형).
  assert.ok(!/맞는 문장은 고치지 않는다/.test(본체),
    '프롬프트 원문이 코드에 베껴져 있다');
});

test('🔴 service_role 만 부를 수 있다 — 학생 토큰은 남의 행을 못 돌린다', () => {
  assert.match(본체, /서비스역할\(req\)/, '서비스 역할 게이트가 없다');
  assert.match(본체, /method\s*!==\s*'POST'/, '조회처럼 GET 으로 열려 있으면 안 된다');
});

test('🔴 철회를 `pipeline_jobs.status` 에만 기대지 않는다 — 그 값은 아무도 안 쓴다', () => {
  /* 실측: `'revoked'` 는 값목록(c6)에만 있고 그 값을 **쓰는 코드가 0**이다. 그것에만 기대면
   * 가드는 언제나 통과하고, 새는 방향은 철회한 학생의 발화가 **벤더로 나가는** 쪽이다. */
  assert.match(본체, /engine\.consents/,
    '동의 정본(engine.consents)을 안 본다 — 철회가 벤더 전송을 못 막는다');
  const 납작본 = 납작(본체);
  assert.ok(납작본.includes('revoked_at is null or revoked_at > now()'),
    '철회 조건이 없다');
  assert.ok(납작본.includes('agreed_at <= now()'),
    '동의 시점 조건이 없다');
});

test('🔴 분모를 응답에 싣는다 — 「0건」이 「대기 0」인지 「못 돌았다」인지 갈려야 한다', () => {
  /* F207: 미실행은 통과와 같은 모양으로 온다. 그래서 **일찍 끝나는 갈래마다** 대기 수를 싣는다.
   * ⚠ 글자 순서로 재지 않는다 — 「이유를 내는 응답에 대기가 함께 실리는가」만 본다. */
  const 이른갈래 = [...본체.matchAll(/봉투\(\d+,\s*\{([^}]*)\}\s*\)/g)].map((m) => m[1]);
  const 사유있는것 = 이른갈래.filter((칸) => /이유:/.test(칸));
  assert.ok(사유있는것.length >= 3, `이유를 내는 갈래가 너무 적다(${사유있는것.length})`);
  for (const 칸 of 사유있는것) {
    assert.match(칸, /대기:/, `이유만 내고 분모를 안 실은 갈래가 있다: ${납작(칸).slice(0, 80)}`);
  }
});

test('🔴 설정 문제로는 행을 못박지 않는다 — 키가 오는 날 다시 집어야 한다', () => {
  /* 키 없음·판 못 읽음·값목록 어긋남은 그 발화의 문제가 아니다. 그때 행을 실패로 적으면
   * 설정이 고쳐져도 그 발화들은 두 번 다시 안 집어진다(=자동 통로에서 영구 소멸). */
  for (const 이유 of ['no_api_key', 'no_prompt_ver', 'tag_drift']) {
    assert.ok(본체.includes(`'${이유}'`), `${이유} 갈래가 없다`);
  }
  // 그 갈래들이 UPDATE·INSERT 앞에서 끝나는지는 「쓰기가 단 한 곳」이라는 사실로 보증한다.
  const 쓰기 = [...본체.matchAll(/\b(insert\s+into|update)\s+engine\./gi)];
  assert.equal(쓰기.length, 1, `이 함수의 쓰기는 한 곳이어야 한다(지금 ${쓰기.length}곳)`);
});

test('🔴 겹친 배치가 두 벌을 적지 않는다 — 쓰기에 자물쇠 방향이 걸려 있다', () => {
  const 납작본 = 납작(본체);
  assert.match(납작본, /insert into engine\.corrections/i);
  assert.ok(/where not exists \( select 1 from engine\.corrections/i.test(납작본),
    'INSERT 에 「이미 AI 교정이 있으면 넣지 않는다」가 없다 — 두 배치가 겹치면 두 벌이 선다');
});

test('🔴 빈 교정 행을 만들지 않는다 — 검수 화면에 빈 카드가 뜨는 모양', () => {
  /* `교정값()` 이 사유를 내면 그 행은 `continue` 로 넘어가야 한다. 사유를 무시하고 적으면
   * `engine.review_queue` 가 그 행 때문에 큐에 뜨고 검수자는 아무것도 못 본다. */
  assert.match(본체, /if\s*\(값\.사유\)/, '버림 사유를 안 보고 적는다');
  const 사유뒤 = 본체.slice(본체.indexOf('if (값.사유)'));
  assert.ok(사유뒤.indexOf('continue;') < 사유뒤.indexOf('insert into engine.corrections'),
    '사유가 있는데도 INSERT 로 내려간다');
});

test('🔴 어느 프롬프트·모델이 만들었는지 행에 남는다', () => {
  /* 안 남기면 「v1 이 v2 보다 나았나」·「모델을 바꿔서 좋아졌나」를 영원히 못 가른다.
   * 그 오염은 소급이 안 된다 — 섞인 행을 나중에 갈라낼 근거가 어디에도 없다. */
  const 납작본 = 납작(본체);
  assert.match(납작본, /model,\s*prompt_ver,\s*schema_ver/,
    'INSERT 열 목록에 model·prompt_ver·schema_ver 가 없다');
  assert.match(본체, /프롬프트판\(/, '판본을 프롬프트 파일에서 읽지 않는다');
});
