'use strict';
/**
 * 교정 사건 로그 — 순수 함수 회귀.
 *
 * 🔑 여기서 지키는 것은 **한 가지**다: 같은 교정의 같은 사건이 기기 안에서 두 번 만들어지지
 *   않는다. 깨지면 증상은 오류가 아니라 **서버에 열람이 두 벌 쌓이는 것**이고, 그건 조회할
 *   때에야 보이며 그때는 어느 쪽이 진짜인지 아무도 모른다(append-only).
 * ⚠ 화면(`src/답장화면.js`)은 대체로 여기 안 든다 — 화면 검사는 구문뿐이다
 *   (`tests/화면구문.test.js`). **예외가 하나 있다**: 아래 「막힘」 절은 화면 원문을 글자로
 *   본다. 순수 함수만 재면 `보낼것` 이 있는데 화면이 여전히 `밀린것` 을 부르는 상태가
 *   **완전히 초록**이고, 그 상태가 정확히 이 처방 이전이다(`tests/말하기로직.test.js` 가
 *   제출 큐에서 같은 이유로 같은 층을 진다).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const 로그모듈 = require(path.join(__dirname, '..', 'lib', '교정로그.js'));
const { 항목id, 항목추가, 응답값, 전송기록, 밀린것, 보낼것 } = 로그모듈;

/* 🔑 **주석을 걷고 본다.** 주석은 이 규칙을 *설명*하는 자리라 글자가 그대로 나오고, 안 걷으면
 *   「`밀린것` 을 안 부른다」가 설명 한 줄에 빨개진다 — 거짓양성이 쏟아지면 검사를 끄게 된다
 *   (`tests/동의게이트.test.js` 의 막힘 카드 검사와 같은 처리). */
const 화면코드 = () =>
  fs.readFileSync(path.join(__dirname, '..', 'src', '답장화면.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

const C1 = '11111111-2222-4333-8444-555555555555';
const C2 = '99999999-8888-4777-8666-555555555555';

const 열람 = (correction_id, key) => ({
  idempotency_key: key || `k-${correction_id}`,
  event_type: 'correction.viewed',
  correction_id,
  correlation_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  level_snapshot: null,
  payload: { ver: 1 },
});

const 응답 = (correction_id, 값) => ({
  ...열람(correction_id, `r-${correction_id}`),
  event_type: 'correction.responded',
  payload: { ver: 1, learner_response: 값 },
});

test('같은 교정의 열람을 두 번 만들어도 항목은 하나다 (앱을 껐다 켠 자리)', () => {
  const 첫판 = 항목추가([], 열람(C1, 'k-처음'));
  assert.equal(첫판.새것, true);
  assert.equal(첫판.로그.length, 1);

  /* 두 번째 호출은 **새 `idempotency_key` 를 들고 온다** — 화면이 다시 열려 사건을 새로 지은
     모양이다. 이때 항목이 늘면 서버에 열람이 두 벌 쌓인다. */
  const 둘째판 = 항목추가(첫판.로그, 열람(C1, 'k-두번째'));
  assert.equal(둘째판.새것, false);
  assert.equal(둘째판.로그.length, 1);
  assert.equal(둘째판.로그[0].사건.idempotency_key, 'k-처음', '들고 있던 사건이 덮였다 — 멱등키가 갈린다');
});

test('다른 교정은 다른 항목이다 (id 가 correction_id 를 안 쓰면 여기서 접힌다)', () => {
  let 로그 = 항목추가([], 열람(C1)).로그;
  로그 = 항목추가(로그, 열람(C2)).로그;
  assert.equal(로그.length, 2);
  assert.notEqual(항목id(열람(C1)), 항목id(열람(C2)));
});

test('같은 교정의 열람과 응답은 서로 다른 항목이다', () => {
  let 로그 = 항목추가([], 열람(C1)).로그;
  로그 = 항목추가(로그, 응답(C1, '채택')).로그;
  assert.equal(로그.length, 2);
  assert.deepEqual(
    로그.map((e) => e.event_type).sort(),
    ['correction.responded', 'correction.viewed'],
    '두 사건이 한 항목으로 접혔다 — 응답이 열람을 덮으면 「봤다」가 사라진다',
  );
});

test('만들지 못한 사건(null)은 로그를 바꾸지 않는다', () => {
  const r = 항목추가([], null);
  assert.equal(r.로그.length, 0);
  assert.equal(r.항목, null);
  // 재료가 빠진 사건도 같다 — `교정API.봉투` 가 null 을 내는 자리와 짝이다
  assert.equal(항목추가([], { event_type: 'correction.viewed' }).로그.length, 0);
});

test('전송 성공을 적으면 밀린것에서 빠진다 (제출 로그의 세 칸을 그대로 쓴다)', () => {
  const { 로그, 항목 } = 항목추가([], 열람(C1));
  assert.equal(밀린것(로그).length, 1);

  const 닿음 = 전송기록(로그, 항목.id, { event_id: 'ev-1' });
  assert.equal(밀린것(닿음).length, 0);
  assert.equal(닿음[0].사건.idempotency_key, 'k-' + C1, '기록이 사건을 건드렸다');
});

test('영구 실패(끝)는 다시 보내지 않는다 — 계약 위반은 100번 보내도 위반이다', () => {
  const { 로그, 항목 } = 항목추가([], 열람(C1));
  const 접힘 = 전송기록(로그, 항목.id, { 오류: '계약 위반', 끝: true });
  assert.equal(밀린것(접힘).length, 0);
  assert.equal(접힘[0].event_id, null, '실패인데 event_id 가 생겼다 — 화면이 「보냈다」로 읽는다');
});

test('일시 실패는 밀린 채 남는다 (다음에 열 때 같은 객체로 다시 나간다)', () => {
  const { 로그, 항목 } = 항목추가([], 열람(C1));
  const 밀림 = 전송기록(로그, 항목.id, { 오류: '인터넷 연결을 확인해 주세요', 끝: false });
  const 남은 = 밀린것(밀림);
  assert.equal(남은.length, 1);
  assert.equal(남은[0].사건.idempotency_key, 'k-' + C1, '재전송 객체가 새것이면 서버가 접지 못한다');
});

test('응답값은 사건에서 파생된다 — 상태 칸을 따로 두지 않는다', () => {
  let 로그 = 항목추가([], 열람(C1)).로그;
  assert.equal(응답값(로그, C1), null);

  로그 = 항목추가(로그, 응답(C1, '수정')).로그;
  assert.equal(응답값(로그, C1), '수정');
  assert.equal(응답값(로그, C2), null, '남의 교정 답이 새어 나왔다');
});

test('한 교정에 한 답 — 두 번째 답은 첫 답을 덮지 않는다', () => {
  let 로그 = 항목추가([], 응답(C1, '채택')).로그;
  로그 = 항목추가(로그, 응답(C1, '수정')).로그;
  assert.equal(로그.length, 1);
  assert.equal(응답값(로그, C1), '채택');
});

test('탐지력 픽스처 — id 에서 correction_id 를 빼면 두 교정이 한 항목으로 접힌다', () => {
  /* 실저장소를 픽스처로 쓰지 않는다. 여기서 못박는 것은 **이 검사가 그 사고를 실제로 잡는다**는
     사실이다 — 없으면 위 검사들은 id 규칙이 무엇이든 초록일 수 있다. */
  const 나쁜id = (사건) => 사건.event_type;
  const 나쁜추가 = (로그, 사건) =>
    로그.some((e) => e.id === 나쁜id(사건)) ? 로그 : 로그.concat([{ id: 나쁜id(사건), 사건 }]);

  let 나쁜로그 = 나쁜추가([], 열람(C1));
  나쁜로그 = 나쁜추가(나쁜로그, 열람(C2));
  assert.equal(나쁜로그.length, 1, '픽스처가 사고를 재현하지 못한다 — 아래 대조가 뜻을 잃는다');

  let 로그 = 항목추가([], 열람(C1)).로그;
  로그 = 항목추가(로그, 열람(C2)).로그;
  assert.equal(로그.length, 2, '정본이 같은 사고를 낸다');
});

/* ── 막힘 — 동의가 철회된 학생의 답은 **멈춘다**(C0 §7 왕복 5 와 같은 처방) ──────────────
 * 🔴 왜 생겼나 (2026-08-10 · 전층감사 §2-5 ⓑ): 제출 큐는 그 처방을 받았는데 **교정 큐는
 *   안 받았다.** 막힌 학생의 항목을 보내면 서버가 `CONSENT_MISSING`(`retryable:false`)으로
 *   접고 앱이 `send_final` 로 적어 `밀린것` 에서 영영 뺀다 — 동의가 다시 서는 날 나갈 수
 *   있었던 답이 죽는다(append-only · 소급 0). 게다가 화면은 로그에서 파생한 「답했어요」를
 *   그대로 말하므로 **경고조차 안 뜬다.**
 * 🔑 `보낼것` 은 `lib/제출로그.js` 의 것을 그대로 재수출한다 — 여기서 판정을 새로 적으면
 *   두 큐가 갈라지고, 갈라진 쪽은 조용히 「보낸다」로 샌다. */

test('보낼것: 막혔으면 한 건도 안 나간다 — 기기에서 지우지는 않는다', () => {
  let 로그 = 항목추가([], 열람(C1)).로그;
  로그 = 항목추가(로그, 응답(C1, '채택')).로그;
  assert.deepStrictEqual(보낼것(로그, { code: 'CONSENT_MISSING' }), [], '막힌 학생의 답이 나갔다');
  assert.equal(밀린것(로그).length, 2, '멈추는 것이지 기기에서 지우는 것이 아니다');
});

test('보낼것: 안 막혔으면 밀린것 그대로 — 순서까지', () => {
  let 로그 = 항목추가([], 열람(C1)).로그;
  로그 = 항목추가(로그, 응답(C1, '채택')).로그;
  assert.deepStrictEqual(보낼것(로그, null).map((e) => e.id), 밀린것(로그).map((e) => e.id));
  assert.deepStrictEqual(
    보낼것(로그, undefined).map((e) => e.id), 밀린것(로그).map((e) => e.id),
    '막힘을 아직 모르는 상태를 막힘으로 읽었다',
  );
});

test('🔴 답장 화면의 전송 자리가 막힘을 본다 — 순수 함수만 재면 이 자리가 안 보인다', () => {
  const 코드 = 화면코드();
  assert.match(코드, /보낼것\([^)]*막힘[^)]*\)/,
    '전송 경로가 막힘을 안 본다 — 막힌 학생의 답이 그대로 나간다');
  /* 🔑 `밀린것` 을 **안 부르는지**까지 본다. 위 검사는 `보낼것` 이 있기만 하면 통과하고,
   *   전송 루프가 여전히 `밀린것` 이면 새는 방향은 「보낸다」다. */
  assert.ok(!/밀린것\(/.test(코드),
    '화면이 `밀린것` 을 직접 부른다 — 그 자리는 막힘을 모른다');
});

test('🔴 막히면 답장 버튼 대신 막힘 카드가 선다 — 「답했어요」는 서버 도착을 함의한다', () => {
  const 코드 = 화면코드();
  /* 순서까지 본다 — `막힘카드` 를 어딘가에 세워 두고 버튼도 함께 그리면, 학생은 막힘을 읽고도
     누를 수 있다. 삼항의 **첫 갈래**가 막힘이어야 버튼이 그 뒤로 밀린다. */
  assert.match(코드, /막힘 \?[\s\S]{0,40}<막힘카드/,
    '막힘이 버튼보다 앞서지 않는다 — 학생이 눌러도 아무 데도 안 가는데 화면은 답했다고 말한다');
});

test('픽스처 — 판정은 「막힘이 truthy 인가」 하나다 (코드 목록을 두면 새 코드가 샌다)', () => {
  const 로그 = 항목추가([], 열람(C1)).로그;
  assert.equal(보낼것(로그, { code: '아직 모르는 코드' }).length, 0, '아는 코드만 막고 있다');
  assert.equal(보낼것(로그, {}).length, 0, '빈 객체를 「안 막힘」으로 읽었다');
});
