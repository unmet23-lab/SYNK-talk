'use strict';
/** 「말하기」 순수 로직 회귀 — 화면보다 먼저 데이터의 뼈대를 못박는다. 정본 = docs/말하기_설계.md */

const test = require('node:test');
const assert = require('node:assert/strict');
const { 발화문턱_DB, 머뭇거림추적, 호흡순서, 다음호흡 } = require('../lib/세호흡.js');
const { 다음시도번호, 항목추가, 직렬화, 역직렬화, 학습출석 } = require('../lib/제출로그.js');

// ── 머뭇거림 (설계 §5 — 퀴즈 확신도의 대체물) ──────────────────

test('머뭇거림: 첫 발화 시각을 잡는다', () => {
  const t = 머뭇거림추적();
  t.표본(100, -60);
  t.표본(700, -50);
  t.표본(1300, -20); // 첫 발화
  t.표본(1400, -10);
  assert.deepEqual(t.결과(5000), { 발화있음: true, 머뭇거림_ms: 1300 });
});

test('머뭇거림: 무발화면 머뭇거림 = 총길이 (연속값 — 이진 아님)', () => {
  const t = 머뭇거림추적();
  t.표본(500, -60);
  t.표본(2500, -55);
  assert.deepEqual(t.결과(3000), { 발화있음: false, 머뭇거림_ms: 3000 });
});

test('머뭇거림: 문턱 정확히 그 값은 발화가 아니다(초과만)', () => {
  const t = 머뭇거림추적();
  t.표본(200, 발화문턱_DB);
  assert.equal(t.결과(1000).발화있음, false);
});

test('머뭇거림: null·undefined 미터링 표본은 무시한다(웹은 미터링이 없을 수 있다)', () => {
  const t = 머뭇거림추적();
  t.표본(100, null);
  t.표본(200, undefined);
  t.표본(300, -10);
  assert.equal(t.결과(1000).머뭇거림_ms, 300);
});

// ── 호흡 순서 (설계 §6) ────────────────────────────────────────

test('호흡: 듣기→따라→답하기→완료', () => {
  assert.deepEqual(호흡순서, ['듣기', '따라', '답하기']);
  assert.equal(다음호흡('듣기'), '따라');
  assert.equal(다음호흡('따라'), '답하기');
  assert.equal(다음호흡('답하기'), '완료');
  assert.throws(() => 다음호흡('퀴즈')); // 흡수됐다 — 되살아나면 여기가 빨간불
});

// ── 제출 로그 (설계 §3 — 지우지 않는다) ───────────────────────

const 기본 = {
  date: '2026-08-03',
  step: '따라',
  status: 'submitted',
  duration_ms: 4200,
  hesitation_ms: 800,
  spoke: true,
  threshold_db: 발화문턱_DB,
  created_at: '2026-08-03T12:00:00Z',
};

test('재시도는 attempt 를 올린 새 항목 — 이전 항목이 그대로 남는다', () => {
  let r = 항목추가([], 기본);
  r = 항목추가(r.로그, { ...기본, duration_ms: 3100 });
  assert.equal(r.로그.length, 2);
  assert.equal(r.로그[0].attempt, 1);
  assert.equal(r.로그[1].attempt, 2);
  assert.equal(r.로그[0].duration_ms, 4200, '이전 시도가 변형됐다 — 데이터 파괴');
});

test('무발화(abandoned)도 시도로 센다', () => {
  let r = 항목추가([], { ...기본, status: 'abandoned', spoke: false });
  r = 항목추가(r.로그, 기본);
  assert.equal(r.로그[1].attempt, 2, 'abandoned 를 안 세면 「한 번에 말했다」로 둔갑한다');
});

test('attempt 번호는 날짜·호흡별로 독립', () => {
  let r = 항목추가([], 기본);
  r = 항목추가(r.로그, { ...기본, step: '답하기' });
  r = 항목추가(r.로그, { ...기본, date: '2026-08-04' });
  assert.equal(r.로그[1].attempt, 1);
  assert.equal(r.로그[2].attempt, 1);
});

test('원본 배열을 변형하지 않는다', () => {
  const 원본 = [];
  항목추가(원본, 기본);
  assert.equal(원본.length, 0);
});

test('녹음이 없는 호흡(듣기)·모르는 status 는 거부한다', () => {
  assert.throws(() => 항목추가([], { ...기본, step: '듣기' }));
  assert.throws(() => 항목추가([], { ...기본, status: 'deleted' }));
});

test('retried — 대체된 시도가 음성과 함께 남고, 최종 제출과 나란히 선다', () => {
  let r = 항목추가([], { ...기본, status: 'retried', audio: 'a1.m4a' });
  r = 항목추가(r.로그, { ...기본, status: 'submitted', audio: 'a2.m4a' });
  assert.equal(r.로그[0].status, 'retried');
  assert.equal(r.로그[0].audio, 'a1.m4a', '대체된 녹음의 음성이 사라졌다 — 자기수정 데이터 파괴');
  assert.equal(r.로그[1].attempt, 2);
});

test('JSONL 왕복 — 항목이 그대로 돌아온다', () => {
  let r = 항목추가([], 기본);
  r = 항목추가(r.로그, { ...기본, step: '답하기', text: '저는 몽골에서 왔어요' });
  const { 로그, 깨진줄 } = 역직렬화(직렬화(r.로그));
  assert.deepEqual(로그, r.로그);
  assert.equal(깨진줄, 0);
});

test('JSONL 중간 줄이 깨져도 나머지는 살고, 깨진 수를 보고한다', () => {
  const r = 항목추가([], 기본);
  const text = 직렬화(r.로그) + '{깨진 json\n' + 직렬화(항목추가(r.로그, 기본).로그.slice(-1));
  const { 로그, 깨진줄 } = 역직렬화(text);
  assert.equal(로그.length, 2);
  assert.equal(깨진줄, 1, '깨진 줄을 조용히 삼키면 「모름」이 「정상」이 된다');
});

test('학습 출석 = 답하기 submitted (설계 §2)', () => {
  let r = 항목추가([], 기본); // 따라만 제출
  assert.equal(학습출석(r.로그, '2026-08-03'), false, '따라 말하기만으로는 출석이 아니다');
  r = 항목추가(r.로그, { ...기본, step: '답하기', status: 'abandoned', spoke: false });
  assert.equal(학습출석(r.로그, '2026-08-03'), false, '무발화는 출석이 아니다');
  r = 항목추가(r.로그, { ...기본, step: '답하기' });
  assert.equal(학습출석(r.로그, '2026-08-03'), true);
  assert.equal(학습출석(r.로그, '2026-08-04'), false);
});
