'use strict';
/**
 * 동의 게이트 정본 회귀 — 「이 학생의 동의가 유효한가」가 **한 뜻으로만** 적혀 있는지 본다.
 *
 * 🔴 왜 생겼나 (2026-08-07 실측) — 같은 판정이 **네 곳에 네 가지**로 적혀 있었다.
 *   그중 `deliver` 가 **양쪽으로** 어긋나 있었고 증상은 둘 다 「이유 없음」이다:
 *     · 미래 날짜 동의 → 배정은 되는데 `uploads` 는 403 (과제를 보고도 못 올린다)
 *     · 철회를 미래로 예약 → 배정이 안 되는데 업로드는 통과 (화면이 비는데 이유가 없다)
 *   앞엣것은 `동의발급.js` 가 **도구 안에서** 막으려던 그 함정이 배치 쪽으로 열려 있던 것이다.
 *
 * 🔑 이 검사는 **탐지** 층이다(예방이 아니다). 정본 함수를 호출부에 끼우는 것이 더 강하지만,
 *   `uploads`·`events`·`tools/동의발급.js` 는 지금 옆 세션 차선이라 모양을 바꾸면 남의 검사가
 *   빨개진다(F073). 그래서 **텍스트 대조**로 갈라짐을 잡고, 갈아 끼우기는 그 트랙 몫으로 남긴다.
 *   ⚠ 층을 밝혀 둔다 — 「예방됐다」로 읽히면 다음 사람이 안심하고 다섯 번째 사본을 만든다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { 지금유효, 그때유효, 지금유효술어, 거절몸통 } = require('../lib/동의게이트.js');

const { 코드만 } = require('./lib/소스검사.js');

const ROOT = path.resolve(__dirname, '..');
const 읽기 = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const 함수 = (이름, 파일 = 'index.ts') => 읽기('supabase', 'functions', 이름, 파일);
const 납작 = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * 순수 판정 — 어느 소스가 정본 술어를 담고 있는가. 픽스처로 탐지력을 못박기 위해 분리한다.
 * @returns {string[]} 위반 목록. 빈 배열이면 통과.
 */
function 검사(소스들, 술어) {
  const 정본 = 납작(술어);
  const 위반 = [];
  if (!/agreed_at <= now\(\)/.test(정본)) 위반.push('정본에 시점 조건이 없다');
  if (!/revoked_at is null or revoked_at > now\(\)/.test(정본)) 위반.push('정본에 철회 조건이 없다');
  for (const [이름, 글] of Object.entries(소스들)) {
    if (!납작(글).includes(정본)) 위반.push(`${이름} 술어가 정본과 갈라졌다`);
  }
  return 위반;
}

// ── 실저장소: 거짓양성만 본다(탐지력은 아래 픽스처가 진다) ──

test('🔴 「지금 유효」를 보는 자리 전부가 정본과 같은 술어다', () => {
  /* 넷 다 **수집이 지금 벌어지는** 자리다: 서명 발급 · 배정 · 교정 · 진단.
   * 갈라지면 학생 집합이 서로 달라지고, 그 차이는 「이유 없이 막힘」으로만 보인다.
   * 🔴 `correct`(교정 배치)가 특히 무겁다 — 여기서 갈라지면 **철회한 학생의 발화가 벤더로
   *   나간다.** 그 함수는 `pipeline_jobs.status='revoked'` 를 안 믿는다(값목록에만 있고
   *   쓰는 코드가 0이라, 그것에 기대면 가드는 언제나 통과한다). */
  const 위반 = 검사({
    'functions/uploads (서명 발급)': 함수('uploads'),
    'functions/deliver (배정)': 함수('deliver'),
    'functions/correct (AI 교정 배치 — 벤더 전송)': 함수('correct'),
    'lib/동의게이트.js 지금유효() (진단·정본 함수)': 지금유효.toString(),
    /* 🔴 **운영 도구도 목록 안이다**(2026-08-10). `현황SQL`·`대조SQL`·발급 직후 확인 질의가
     *   술어를 **글자로** 적어 두었는데(태그 질의를 못 쓰는 자리라 그 자체는 설계다) 이 검사가
     *   묶는 대상이 아니었다. 지금은 일치해서 더 위험했다 — 갈라지는 날 도구 화면은 초록인데
     *   학생은 403 이고, 그 둘을 대조할 방법이 없다. 위 머리말 🔑 가 「텍스트 대조로 잡는다」고
     *   약속한 그 대상에 정작 이 파일이 빠져 있었다(대기열 P3 · `local_eba139e7` 가 발견).
     *   ⚠ **층을 밝힌다 — 이 파일은 술어를 세 자리에 적었는데 `검사` 는 「한 번이라도 담고
     *   있는가」만 본다.** 즉 셋 중 하나가 갈라져도 통과한다. 없는 것보다 강하지만 「전부
     *   묶였다」로 읽으면 안 된다(자리 수를 세는 검사는 자리가 늘 때마다 빨개져 더 나쁘다 ·
     *   근본 해법인 `지금유효id식` 갈아 끼우기는 감사 반박 ④가 이미 죽였다). */
    'tools/동의발급.js (운영 도구 — 문자열 조립 통로)': 읽기('tools', '동의발급.js'),
  }, 지금유효술어);
  assert.deepEqual(위반, [], 위반.join(' · '));
});

test('🔴 events 는 「그때유효」다 — 두 뜻을 한 술어로 합치지 않는다', () => {
  /* 사후 동의가 과거를 유효하게 만들지 못하므로 **발화 시점** 기준이 맞다. 뜻이 다르니
   * `지금유효` 로 갈아치우면 안 되고, 그렇다고 조건 하나를 잃어도 안 된다. */
  const 글 = 납작(함수('events'));
  assert.ok(글.includes('agreed_at <= ${occurred_at}::timestamptz'),
    'events 가 발화 시점 기준을 잃었다 — 사후 동의가 과거를 유효하게 만든다');
  assert.ok(글.includes('revoked_at > now()'),
    'events 에 「지금도 살아 있어야」가 없다 — 철회 뒤 과거 시각을 주장하면 수집이 통과한다');
  // 정본 함수 쪽도 같은 두 조건을 들고 있어야 한다(모양이 갈리면 위 검사가 무의미해진다).
  const 정본 = 납작(그때유효.toString());
  assert.ok(정본.includes('agreed_at <= ${occurred_at}::timestamptz'));
  assert.ok(정본.includes('revoked_at > now()'));
});

/* 🔴 **조회 통로 둘 다** 정본 함수를 부른다(2026-08-10 에 `corrections` 가 합류).
 *   그 함수는 이 규약 **밖에 있던 유일한 조회 함수**였다 — 파일 전체 `consent` 매치가 0이라
 *   철회한 학생에게도 교정 카드가 그대로 떴고, 앱은 거기서 `correction.viewed` 를 만들어
 *   `functions/events` 에 보낸다. 그 거절(`CONSENT_MISSING`·`retryable:false`)을 앱이
 *   `send_final` 로 적으면 **동의가 다시 서는 날 나갈 수 있었던 답이 죽는다**(C0 §7 왕복 5 가
 *   제출 큐에서 잡은 그 병 · append-only · 소급 0). */
for (const 이름 of ['tasks', 'corrections']) {
  test(`🔴 조회 통로(${이름})는 정본 함수를 부른다 — 술어를 자기 파일에 다시 적지 않았다`, () => {
    const 글 = 함수(이름);
    const 코드 = 코드만(글);   // 부정 단언은 주석 걷은 판으로(가드계수 ㉠ · 아래 「주석은 걷는다」 그 이유)
    assert.match(글, /지금유효\(/, `${이름} 가 정본 함수를 안 부른다`);
    assert.ok(!/engine\.consents/.test(코드),
      `${이름} 가 술어를 자기 파일에 적었다 — 다섯 번째 사본이다`);
    const 동봉 = JSON.parse(함수(이름, '동봉.json'));
    assert.equal(동봉['동의게이트.mjs'], 'lib/동의게이트.js',
      '동봉 표에 정본이 없다 — 배포는 성공하고 함수는 첫 호출의 import 에서 죽는다');
    /* 🔑 **막힘을 응답에 싣는가**까지 본다. 게이트를 불러 놓고 값을 안 실으면 앱은 그대로
     *   사건을 보내고, 이 검사만 초록이 된다 — 새는 방향은 언제나 「통과」다.
     *   주석은 걷는다 — 이 규칙을 설명하는 자리라 글자가 그대로 나온다(설명이 구현을 위장한다).
     *   (`코드` 는 위에서 이미 걷어 뒀다 — engine.consents 부정 단언과 같은 판을 쓴다.) */
    assert.match(코드, /blocked/, `${이름} 가 blocked 를 응답에 안 싣는다 — 앱이 큐를 못 멈춘다`);
  });
}

test('막힘 코드가 서버·화면 양쪽에서 같은 글자다', () => {
  /* 앱이 이 글자로 분기한다(`contents/문구_동의.js`). 한쪽만 바뀌면 학생은 다시 이유 없이 막힌다. */
  const { 막힘문구 } = require('../contents/문구_동의.js');
  assert.equal(거절몸통.code, 'CONSENT_MISSING');
  assert.ok(막힘문구[거절몸통.code], `화면에 ${거절몸통.code} 문구가 없다`);
  assert.match(함수('tasks'), /거절몸통\.code/, 'tasks 가 코드를 손으로 적었다');
});

// ── 픽스처: 탐지력을 여기서 못박는다(양방향) ──

test('픽스처 — 술어가 갈라진 소스를 잡는다', () => {
  const 어긋남 = [
    ['agreed_at 조건 없음', 'where learner_id = x and (revoked_at is null or revoked_at > now())'],
    ['revoked_at is null 만', 'where learner_id = x and agreed_at <= now() and revoked_at is null'],
    ['기기 시계로 비교', 'where agreed_at <= $occurred and (revoked_at is null or revoked_at > now())'],
    ['게이트 자체가 사라짐', 'select consent_ver from engine.consents where learner_id = x'],
  ];
  for (const [이름, 글] of 어긋남) {
    assert.equal(검사({ 대상: 글 }, 지금유효술어).length, 1, `못 잡았다: ${이름}`);
  }
});

test('픽스처 — 정본 상수가 비면 잡는다 (통과와 「검사할 게 없음」이 같은 모양이 되는 자리)', () => {
  assert.ok(검사({}, '').length >= 2, '빈 정본이 통과했다 — 이 검사 전체가 조용히 꺼진다');
  assert.ok(검사({}, 'agreed_at <= now()').length >= 1, '철회 조건이 빠진 정본이 통과했다');
});

test('픽스처 — 들여쓰기·줄바꿈만 다른 소스는 통과 (거짓양성 없음)', () => {
  const 다른모양 = `where learner_id = l.learner_id\n\t and    agreed_at <= now()\n and (revoked_at is null or revoked_at > now())`;
  assert.deepEqual(검사({ 대상: 다른모양 }, 지금유효술어), []);
});

/* ── 막힘 화면이 **받기만 하고 받아주지는 않는가** (P0 §239 · S1) ──────────────
 * S1 에서 앱은 동의를 **확인만** 한다 — 동의는 상담 자리에서 대면으로 받고 운영자가
 * `tools/동의발급.js` 로 옮겨 적는다. 여기에 「동의하기」 버튼이 서면 **근거 없는 동의**가
 * 쌓이고, 동의는 소급해서 무를 수 없다. 그 버튼이 서는 것은 파일럿(2027-02 · P0 §240)이고
 * 선행 조건이 **둘** 남았다: 몽골어 검수 · Inter Tight cyrillic-ext 탑재
 * (문안 A-10 은 ✅ 종결 — 유호님 D6 `docs/동의_문구_v1.md`).
 *
 * 🔑 프로즈로만 적어 두면 다음 사람이 「학생이 답답해 하니 버튼 하나쯤」으로 연다 —
 *   그래서 소스에서 기계로 본다. 레이아웃은 검사하지 않는다(그건 기기에서 볼 층이다). */
test('🚫 막힘 카드에 「동의하기」 버튼이 없다 — S1 은 앱이 확인만 한다', () => {
  const 소스 = fs.readFileSync(path.join(__dirname, '..', 'src', '막힘카드.js'), 'utf8');
  /* 주석은 이 규칙을 **설명**한다 — 공용 통로가 JSX `{/* … *​/}` 까지 진다(지역 사본은 못 졌다). */
  const 코드 = 코드만(소스);
  const 누른다 = 코드.match(/Pressable|TouchableOpacity|Button|onPress/);
  assert.equal(누른다, null,
    `🔴 막힘 카드에 누를 것이 생겼다(${누른다 && 누른다[0]}) — 동의를 앱에서 받으면 근거 없는 동의가 쌓인다.\n` +
    '   S1 은 확인만(P0 §239). 파일럿에 열 때는 몽골어 검수·Inter Tight cyrillic-ext 가 먼저다.');
});

test('픽스처 — 버튼이 되살아나면 잡는다 (통과와 미실행이 같은 모양이 되지 않게)', () => {
  const 가짜 = '<Pressable onPress={동의하기}><Text>동의합니다</Text></Pressable>';
  assert.ok(/Pressable|TouchableOpacity|Button|onPress/.test(가짜), '탐지 규칙 자체가 죽었다');
});

/* ── 그때유효 «평가형» — 묶음 처리 자리(라디오 승격기)의 술어가 정본과 같은 뜻인지 ──────
 * 반박 c757278 경미 ⑧ — 승격기의 메모리 필터가 다섯 번째 사본이 되던 자리를, 정본 파일의
 * 평가형 함수 하나로 접었다. 아래 사례들이 머리말의 seam 을 그대로 잰다. */
test('그때유효평가 — 사후 동의·기철회·미래 예약 철회의 세 seam 이 SQL 정본과 같은 뜻이다', () => {
  const { 그때유효평가 } = require('../lib/동의게이트.js');
  const t = Date.parse('2026-08-10T12:00:00Z');
  const 지금 = Date.parse('2026-08-12T00:00:00Z');
  const 판 = (동의) => 그때유효평가(동의, t, 지금);
  // 정상 — 사건 전에 동의, 철회 없음
  assert.equal(판({ agreed_at: '2026-08-01T00:00:00Z', revoked_at: null }), true);
  // 사후 동의는 과거를 유효하게 만들지 못한다
  assert.equal(판({ agreed_at: '2026-08-11T00:00:00Z', revoked_at: null }), false,
    '사후 동의가 과거 발화를 살렸다');
  // 철회 뒤에는 과거 시각을 주장해도 새 저장이 없다(revoked > now 조건)
  assert.equal(판({ agreed_at: '2026-08-01T00:00:00Z', revoked_at: '2026-08-11T00:00:00Z' }), false,
    '이미 철회된 동의로 새 승격이 만들어진다');
  // 철회가 미래로 예약돼 있으면 그때까지는 산다(양쪽 조건 모두 통과)
  assert.equal(판({ agreed_at: '2026-08-01T00:00:00Z', revoked_at: '2026-09-01T00:00:00Z' }), true,
    '미래 예약 철회가 현재를 죽였다');
  // 사건 시점에 이미 철회된 동의
  assert.equal(판({ agreed_at: '2026-08-01T00:00:00Z', revoked_at: '2026-08-05T00:00:00Z' }), false);
});

/* ── 시계 여유 (2026-08-12 신설 · 유호 「철학 정본따라 자율주행」) ─────────────────
 * 🔴 실사건: `왕복시험 --새학생` 이 `CONSENT_MISSING` 으로 죽었다. 동의 행은 멀쩡히 앉아
 *   있었고(v18.9 · 철회 없음) 거절은 **그 술어대로는 정당했다** — `그때유효` 가 두 시계를
 *   비교하기 때문이다. `occurred_at` 은 **기기** 시계, `agreed_at` 은 운영 도구가 넣는
 *   **서버** 시계인데 실측 서버가 이 PC 보다 **약 5초** 앞섰다. 개원 첫 주에 원장이 동의를
 *   발급하고 학생이 곧바로 올리는 자리가 정확히 이 모양이고, 그때 학생이 받는 처방은
 *   「동의 화면을 먼저 띄워야 합니다」 — 방금 동의했으므로 **따를 수 없다**(F103).
 * 🔑 여유는 **두 시계를 비교하는 자리에만** 준다. `지금유효` 는 `now()` 끼리라 스큐가 없고,
 *   거기 여유를 주면 아무 문제도 안 풀면서 게이트만 느슨해진다. */

test('시계여유 — 값이 한 곳에 살고 소급 동의를 열 만큼 크지 않다', () => {
  const { 시계여유_분 } = require('../lib/동의게이트.js');
  assert.equal(typeof 시계여유_분, 'number');
  assert.ok(시계여유_분 > 0, '0 이면 이 장치가 꺼진 것이다 — 실사건이 그대로 재발한다');
  assert.ok(시계여유_분 <= 15,
    '시계 오차 흡수를 넘어 «소급 동의»가 열린다 — 늘리려면 C0 §5 를 다시 판정해야 한다');
});

test('시계여유 — SQL 정본과 events 글자 사본의 숫자가 같다', () => {
  /* 🔑 `events` 는 이 통로를 동봉하지 않고 술어를 글자로 적는다(설계상 그런 자리가 넷 있다).
   *   그래서 «갈라짐»은 사람 눈에 안 보인다 — 여기서 기계로 묶는다. */
  const { 그때유효, 시계여유_분 } = require('../lib/동의게이트.js');
  assert.ok(납작(그때유효.toString()).includes('make_interval(mins => ${시계여유_분})'),
    'SQL 정본이 여유를 잃었다');

  const 글 = 납작(함수('events'));
  assert.ok(글.includes(`agreed_at <= \${occurred_at}::timestamptz + make_interval(mins => ${시계여유_분})`),
    `events 의 시계 여유가 정본(${시계여유_분}분)과 갈렸다`);

  /* 🔴 여유는 **앞 조건에만** — 철회 쪽에 붙으면 철회 뒤 그만큼 수집이 계속된다.
   *   부정 단언은 주석 걷은 판으로 — 걷기가 «먼저»다(납작이 줄바꿈을 접으면 `//` 를 못 걷는다). */
  const 걷은글 = 코드만(함수('events'));
  const 걷은납작 = 납작(걷은글);
  assert.ok(!/revoked_at > \$\{occurred_at\}::timestamptz \+ make_interval/.test(걷은납작),
    '철회 조건에 여유가 붙었다 — 철회한 학생의 수집이 그만큼 더 통과한다');
});

test('시계여유 — 평가형: 방금 동의한 학생이 살고, 소급 동의는 여전히 죽는다', () => {
  const { 그때유효평가, 시계여유_분 } = require('../lib/동의게이트.js');
  const 사건 = Date.parse('2026-08-12T09:00:00Z');
  const 지금 = Date.parse('2026-08-12T09:30:00Z');
  const 판 = (동의) => 그때유효평가(동의, 사건, 지금);

  /* 실사건 그 모양 — 동의가 사건보다 **5초 늦게** 찍혔다(서버 시계가 앞섰다). */
  assert.equal(판({ agreed_at: '2026-08-12T09:00:05Z', revoked_at: null }), true,
    '방금 동의한 학생이 거절된다 — 실사건이 재발했다');

  /* 여유 안쪽은 살고 바깥은 죽는다 — 「무한히 봐준다」가 아님을 못박는다. */
  const 안쪽 = new Date(사건 + (시계여유_분 * 60_000) - 1000).toISOString();
  const 바깥 = new Date(사건 + (시계여유_분 * 60_000) + 60_000).toISOString();
  assert.equal(판({ agreed_at: 안쪽, revoked_at: null }), true);
  assert.equal(판({ agreed_at: 바깥, revoked_at: null }), false,
    '여유를 넘은 사후 동의가 과거를 살렸다 — 소급 동의가 열렸다(C0 §5)');

  /* 하루 뒤 동의는 여전히 과거를 못 살린다(기존 seam 이 그대로인지). */
  assert.equal(판({ agreed_at: '2026-08-13T00:00:00Z', revoked_at: null }), false);
});

test('시계여유 — 「지금유효」 쪽에는 여유가 없다 (now() 끼리는 스큐가 없다)', () => {
  const { 지금유효, 지금유효술어, 지금유효id식 } = require('../lib/동의게이트.js');
  for (const [이름, 글] of [
    ['지금유효', 지금유효.toString()], ['지금유효술어', 지금유효술어], ['지금유효id식', 지금유효id식],
  ]) {
    /* `toString()` 은 정본 함수의 주석까지 담는다 — 부정 단언은 걷은 판으로(가드계수 ㉠). */
    assert.ok(!/make_interval/.test(코드만(글)),
      `${이름} 에 시계 여유가 붙었다 — 두 시계가 없는 자리라 게이트만 느슨해진다`);
  }
});
