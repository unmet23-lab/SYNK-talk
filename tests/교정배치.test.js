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
   * `engine.review_queue` 가 그 행 때문에 큐에 뜨고 검수자는 아무것도 못 본다.
   *
   * ⚠ 옛 판은 **파일 전체의 글자 순서**로 이걸 쟀다(`사유 분기` 뒤에 INSERT 가 오는가).
   *   쓰기를 공용 함수로 빼고 통로가 둘이 되자 그 조건이 멀쩡한 코드를 빨갛게 만들었다 —
   *   INSERT 문이 분기보다 **위**에 있고(함수 정의), 분기가 두 곳이 됐기 때문이다(F287 축).
   *   그래서 재는 자리를 **분기 하나 안**으로 좁힌다: 사유를 본 지점부터 그 분기 다음의 첫
   *   쓰기 호출까지 사이에 `continue` 가 있는가. 통로가 몇 개든, 함수가 어디 있든 성립한다. */
  const 자리들 = [...본체.matchAll(/if\s*\(값\.사유\)/g)].map((m) => m.index);
  assert.ok(자리들.length >= 1, '버림 사유를 안 보고 적는다');
  for (const i of 자리들) {
    const 뒤 = 본체.slice(i);
    const 쓰기 = 뒤.indexOf('적기(');
    assert.ok(쓰기 > 0, '사유 분기 뒤에 쓰기 호출이 없다 — 이 검사가 헛돌고 있다');
    assert.ok(뒤.slice(0, 쓰기).includes('continue;'),
      `사유가 있는데도 쓰기로 내려가는 분기가 있다(글자 ${i} 근처)`);
  }
});

test('🔴 쓰기 문은 하나인데 통로는 둘이다 — 배치 회수와 즉시 왕복이 같은 문을 쓴다', () => {
  /* 열 목록·자물쇠 조건을 두 곳에 적으면 갈라지고, 갈린 뒤엔 한쪽만 고쳐도 스위트가 초록이
   * 된다(신뢰성 조항의 「3번째 = 원인을 쓸 수 없게 만든다」 자리). */
  assert.equal([...본체.matchAll(/insert\s+into\s+engine\./gi)].length, 1);
  assert.ok([...본체.matchAll(/await 적기\(/g)].length >= 2,
    '쓰기 호출이 한 곳뿐이다 — 두 통로 중 하나가 자기 INSERT 를 들고 있는 것은 아닌지 본다');
});

test('🔴 요청 몸통·벤더 주소를 함수에 베끼지 않는다 — 정본은 lib 하나다', () => {
  /* 캐시 표시(`cache_control`)나 주소를 여기서도 지으면 사본이 둘이 되고, 둘이 갈리면
   * 「배치로 만든 것」과 「즉시 만든 것」의 품질·요금이 달라진다. 그 차이는 행에 안 남는다. */
  assert.ok(!/cache_control/.test(본체), '캐시 설정이 함수 본체에 있다 — 정본은 lib/교정엔진.js');
  assert.ok(!/api\.anthropic\.com/.test(본체), '벤더 주소가 함수 본체에 있다 — 정본은 lib/교정엔진.js');
});

test('🔴 회수는 설정 검사보다 앞이다 — 이미 값을 치른 결과를 설정 실수로 버리지 않는다', () => {
  /* 프롬프트 판·값목록 검사는 「내보내도 되는가」를 묻는 것이지 「걷어도 되는가」가 아니다.
   * 순서가 반대면 설정 실수 하나가 이미 지불한 배치를 통째로 버린다.
   * 재는 법은 **응답의 모양**이다 — 그 갈래들이 회수 결과를 함께 싣고 있으면 회수가 이미
   * 돈 것이다(안 돌았으면 실을 게 없다). */
  for (const 이유 of ['no_prompt_ver', 'tag_drift']) {
    const m = new RegExp(`봉투\\(\\d+,\\s*\\{([^}]*이유: '${이유}'[^}]*)\\}`).exec(본체);
    assert.ok(m, `${이유} 갈래를 못 찾았다`);
    assert.match(m[1], /회수/, `${이유} 로 끝나면서 회수분을 안 싣는다 — 걷은 것이 버려진다`);
    assert.match(m[1], /적음/, `${이유} 갈래가 적은 수를 안 싣는다`);
  }
});

test('🔴 도는 배치가 있으면 새로 안 내보낸다 — 두 번 나가면 두 번 청구된다', () => {
  /* 행은 자물쇠(`where not exists`)가 막아 주지만 **돈은 이미 나간 뒤**다. 그래서 제출 앞에
   * 「지금 도는 게 있나」를 묻고, 있으면 그 회차를 쉰다(늦어질 뿐 두 번 청구되지 않는다). */
  assert.match(본체, /processing_status !== 'ended'/, '도는 배치를 가리는 조건이 없다');
  assert.ok(본체.includes("'batch_in_flight'"), '도는 중일 때 멈추는 갈래가 없다');
  const 제출 = 본체.indexOf('배치몸통(');
  const 막이 = 본체.indexOf("'batch_in_flight'");
  assert.ok(막이 > 0 && 막이 < 제출, '제출이 「도는 배치」 검사보다 먼저 온다');
});

test('🔴 절단한 것을 응답에 센다 — 조용한 절단은 「전부 걷었다」와 같은 모양이다', () => {
  /* 한 호출이 걷는 배치 수에 상한이 있다(F207: 미실행은 통과와 같은 모양으로 온다). */
  assert.match(본체, /건너뛴배치/, '상한에 걸려 못 걷은 배치 수를 안 센다');
  assert.match(본체, /회수상한/, '상한이 이름을 안 갖고 있다 — 숫자를 코드에 박으면 근거가 사라진다');
});

test('🔴 어느 프롬프트·모델이 만들었는지 행에 남는다', () => {
  /* 안 남기면 「v1 이 v2 보다 나았나」·「모델을 바꿔서 좋아졌나」를 영원히 못 가른다.
   * 그 오염은 소급이 안 된다 — 섞인 행을 나중에 갈라낼 근거가 어디에도 없다. */
  const 납작본 = 납작(본체);
  assert.match(납작본, /model,\s*prompt_ver,\s*schema_ver/,
    'INSERT 열 목록에 model·prompt_ver·schema_ver 가 없다');
  assert.match(본체, /프롬프트판\(/, '판본을 프롬프트 파일에서 읽지 않는다');
});

test('🔴 평가 통로(?평가=1) — DB 무접촉·상한·원자재 반환 (eval 실행기의 유일한 문)', () => {
  /* `evals/결과.md` 가 「실제 엔진 경로가 아니다」로 남긴 구멍을 닫는 갈래다. 로컬에 벤더 키가
   * 없으므로(Management API 는 다이제스트만 준다 · 08-12 실측 401) eval 은 이 문으로만 돈다.
   * 갈래가 조용히 사라지면 증상은 「재평가를 로컬 키로 하려다 401」— 원인과 안 닮은 모양이다. */
  const m = /if \(url\.searchParams\.get\('평가'\) === '1'\) \{[\s\S]*?const 즉시 =/.exec(본체);
  assert.ok(m, '평가 갈래가 없다 — eval 실행기가 실제 엔진 경로를 못 잰다');
  const 블록 = m[0];
  assert.ok(!/\bsql`/.test(블록),
    '평가 갈래가 DB 에 닿는다 — 픽스처가 리허설 append-only 에 지울 수 없는 행으로 남는다');
  assert.match(블록, /최대배치/, '상한이 없다 — 벽시계를 넘겨 잘린 반쪽이 「전부」로 보인다');
  assert.match(블록, /맥락: 항\.맥락/,
    '맥락이 요청몸통에 안 실린다 — v2 재평가(맥락 오염 검사)가 못 돈다');
  assert.match(블록, /error: 'eval_no_api_key'/,
    '설정 실패가 배치의 200+이유 관행과 섞였다 — 도구 왕복은 5xx·error 칸으로 실패를 실패로 준다');
  assert.match(블록, /prompt_ver: 판/,
    '응답에 판이 없다 — 부르는 쪽이 「어느 프롬프트를 쟀나」를 대조할 근거가 사라진다');
});
