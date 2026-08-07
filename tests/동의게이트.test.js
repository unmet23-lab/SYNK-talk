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
  /* 셋 다 **수집이 지금 벌어지는** 자리다: 서명 발급 · 배정 · 진단.
   * 갈라지면 학생 집합이 서로 달라지고, 그 차이는 「이유 없이 막힘」으로만 보인다. */
  const 위반 = 검사({
    'functions/uploads (서명 발급)': 함수('uploads'),
    'functions/deliver (배정)': 함수('deliver'),
    'lib/동의게이트.js 지금유효() (진단·정본 함수)': 지금유효.toString(),
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

test('🔴 진단 통로(tasks)는 정본 함수를 부른다 — 술어를 자기 파일에 다시 적지 않았다', () => {
  const 글 = 함수('tasks');
  assert.match(글, /지금유효\(/, 'tasks 가 정본 함수를 안 부른다');
  assert.ok(!/engine\.consents/.test(글),
    'tasks 가 술어를 자기 파일에 적었다 — 다섯 번째 사본이다');
  const 동봉 = JSON.parse(함수('tasks', '동봉.json'));
  assert.equal(동봉['동의게이트.mjs'], 'lib/동의게이트.js',
    '동봉 표에 정본이 없다 — 배포는 성공하고 함수는 첫 호출의 import 에서 죽는다');
});

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
 * 선행 조건이 셋이다: 몽골어 검수 · Inter Tight cyrillic-ext 탑재 · 동의문 6항목 사본(A-10).
 *
 * 🔑 프로즈로만 적어 두면 다음 사람이 「학생이 답답해 하니 버튼 하나쯤」으로 연다 —
 *   그래서 소스에서 기계로 본다. 레이아웃은 검사하지 않는다(그건 기기에서 볼 층이다). */
test('🚫 막힘 카드에 「동의하기」 버튼이 없다 — S1 은 앱이 확인만 한다', () => {
  const 소스 = fs.readFileSync(path.join(__dirname, '..', 'src', '막힘카드.js'), 'utf8');
  const 코드 = 소스.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // 주석은 이 규칙을 **설명**한다
  const 누른다 = 코드.match(/Pressable|TouchableOpacity|Button|onPress/);
  assert.equal(누른다, null,
    `🔴 막힘 카드에 누를 것이 생겼다(${누른다 && 누른다[0]}) — 동의를 앱에서 받으면 근거 없는 동의가 쌓인다.\n` +
    '   S1 은 확인만(P0 §239). 파일럿에 열 때는 몽골어 검수·Inter Tight cyrillic-ext·동의문 사본이 먼저다.');
});

test('픽스처 — 버튼이 되살아나면 잡는다 (통과와 미실행이 같은 모양이 되지 않게)', () => {
  const 가짜 = '<Pressable onPress={동의하기}><Text>동의합니다</Text></Pressable>';
  assert.ok(/Pressable|TouchableOpacity|Button|onPress/.test(가짜), '탐지 규칙 자체가 죽었다');
});
