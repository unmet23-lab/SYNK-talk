/* 게임로그 회귀 — G1 오프라인 큐(`lib/게임로그.js` · `lib/교정로그.js` 와 같은 무늬).
 *
 * 지키는 것: ① 항목 id 결정론(앉음×사건종류당 하나 — 「앉음당 1번」의 기계적 실체)
 * ② 재전송이 **같은 사건 객체**를 쓴다(멱등키는 한 번 정하고 안 바꾼다 · C0 §4-1)
 * ③ 막힌 학생의 것은 안 나간다(`보낼것` — 새는 방향은 언제나 「보낸다」)
 * ④ attempt 는 같은 배정 안에서만 오른다(사슬 길이를 로컬이 지어내지 않는다)
 * ⑤ 배정 키는 날짜 스코프다 — 같은 키 재배정은 화면 잠김이다(발주 §6-6 ⑩)
 * ⑥ 죽은 배정 수거(H2)는 닻 있는 것만 걷는다 — 오귀속보다 0건(지어내지 않는다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 코드만 } = require('./lib/소스검사.js');

const 뿌리 = path.resolve(__dirname, '..');

const {
  항목id, 항목추가, 다음시도번호, 제출항목, 턴항목, 죽은배정들, 전송기록, 밀린것, 보낼것,
} = require('../lib/게임로그.js');
/* G2 표기는 **팩에서 가져온다** — 여기 challenge_id 를 손으로 적으면 팩이 이름을 바꾼 날
 * 이 회귀가 「없는 모듈」을 재고, 그때 통과는 미실행이다(세 맹점 ①). */
const { 모듈상수: G2모듈상수 } = require('../contents/보고서교정문항.js');

const 고름사건 = (correlation_id = 'sit-1') => ({
  idempotency_key: 'k-choice-1',
  event_type: 'choice.selected',
  correlation_id,
  payload: { ver: 1 },
});
const 메일사건 = (correlation_id = 'sit-1', task_ref = 'task-2026-08-11') => ({
  idempotency_key: 'k-mail-1',
  event_type: 'submission.created',
  correlation_id,
  submission: { task_ref, task_format: '쓰기첨삭' },
  payload: { ver: 1, attempt_no: 1 },
});

test('항목 id — 앉음×사건종류당 하나 · 큐 소속 밖 사건은 못 든다', () => {
  assert.equal(항목id(고름사건('s')), 'choice:s');
  assert.equal(항목id(메일사건('s')), 'mail:s');
  assert.equal(항목id({ event_type: 'session.abandoned', correlation_id: 's' }), 'abandon:s');
  assert.equal(항목id({ event_type: 'correction.viewed', correlation_id: 's' }), null, '남의 큐 사건이 들어왔다');
  assert.equal(항목id({ event_type: 'choice.selected' }), null, '앉음 키 없는 사건');
});

test('같은 앉음의 같은 사건은 두 번 안 선다 — 사건 객체(멱등키)가 첫 것 그대로 남는다', () => {
  const { 로그: 한번 } = 항목추가([], 고름사건());
  const 다시 = 항목추가(한번, { ...고름사건(), idempotency_key: 'k-다른키' });
  assert.equal(다시.새것, false);
  assert.equal(다시.로그.length, 1);
  assert.equal(다시.항목.사건.idempotency_key, 'k-choice-1',
    '재호출이 멱등키를 갈아치웠다 — 회선이 끊길 때마다 서버에 두 벌 쌓인다');
});

test('다음시도번호 — 같은 배정 안에서만 오른다', () => {
  assert.equal(다음시도번호([], 'task-A'), 1);
  const { 로그 } = 항목추가([], 메일사건('sit-1', 'task-A'));
  assert.equal(다음시도번호(로그, 'task-A'), 2, '같은 배정의 재제출은 attempt 증가다');
  assert.equal(다음시도번호(로그, 'task-B'), 1, '날을 건넌 재제출(새 배정)은 1부터 — 사슬은 retry_of_event_id 가 잇는다');
});

test('제출항목 — 「이미 보냈다」 판정의 근거(다시 열면 대기 화면)', () => {
  const { 로그 } = 항목추가([], 메일사건());
  assert.ok(제출항목(로그, 'task-2026-08-11'));
  assert.equal(제출항목(로그, 'task-없음'), null);
  assert.equal(제출항목([], 'task-2026-08-11'), null);
});

test('배정 task_ref 는 날짜 스코프다 — 챌린지 상수면 둘째 게임날부터 영구 잠김(발주 §6-6 ⑩ C4·H3)', () => {
  const { 로그 } = 항목추가([], 메일사건('sit-1', 'task-2026-08-11'));
  /* 날짜 스코프면 다음 게임날·재제출 재배정이 새 키를 들고 와 「이미 보냈다」에 안 걸린다 —
   * 사슬은 배정 행이 낸 retry_of_event_id 가 잇는다(앱이 지어내지 않는다). */
  assert.equal(제출항목(로그, 'task-2026-08-18'), null,
    '새 배정이 첫날 제출에 막혔다 — 재제출 판이 영원히 안 서고 retry_of 행이 0이 된다');
  /* 챌린지 상수를 task_ref 로 쓰면 모든 게임날이 같은 키다 — 아래 매치가 곧
   * `src/교수멘탈화면.js` 마운트의 대기 점프라, 첫 제출 뒤 영구 잠김이다. */
  const 상수 = 항목추가([], 메일사건('sit-1', 'g1-교수멘탈')).로그;
  assert.ok(제출항목(상수, 'g1-교수멘탈'),
    '정확 일치 판정이 바뀌었다 — 두 번 제출 가드가 다른 축으로 샜다');
});

/* ─────────────────── 죽은 배정 수거 — H2 「다음 마운트 발견」 (발주 §6-6 ⑩ C5) ─────────────────── */

const 닻 = (ref = 'task-2026-08-10') => ({ task_ref: ref, level_snapshot: null, goal_snapshot: null });
const 이탈꼴 = (correlation_id, task_ref) => ({
  idempotency_key: 'k-ab-1',
  event_type: 'session.abandoned',
  correlation_id,
  submission: { task_ref, task_format: '쓰기첨삭' },
  payload: { ver: 1 },
});

test('죽은배정들 — 고름만 남고 날이 지난 배정을 걷는다 · 오늘을 모르면 0건', () => {
  const { 로그 } = 항목추가([], 고름사건('sit-어제'), 닻());
  assert.deepEqual(죽은배정들(로그, null), [], '오늘 배정을 모르는데 걷었다 — 오귀속보다 0건이 낫다');
  assert.deepEqual(죽은배정들(로그, 'task-2026-08-10'), [], '오늘 것을 걷었다 — 산 앉음이 이탈로 적힌다');
  const 죽은 = 죽은배정들(로그, 'task-2026-08-11');
  assert.equal(죽은.length, 1, '어제 고르고 사라진 배정이 안 걷혔다 — 이탈 신호가 도로 0이 된다');
  assert.equal(죽은[0].correlation_id, 'sit-어제');
  assert.equal(죽은[0].task_meta.task_ref, 'task-2026-08-10');
});

test('죽은배정들 — 제출·이탈이 이미 적힌 배정, 닻 없는 옛 항목은 안 걷는다', () => {
  /* 다른 앉음의 제출이라도 그 배정은 완결이다 — 같은 날 고아 고름은 이탈이 아니다. */
  let { 로그 } = 항목추가([], 고름사건('sit-1'), 닻());
  ({ 로그 } = 항목추가(로그, 메일사건('sit-2', 'task-2026-08-10')));
  assert.deepEqual(죽은배정들(로그, 'task-2026-08-11'), [], '제출된 배정을 또 걷었다');
  /* cleanup 생산자가 이미 세운 이탈(앉음이 달라도 같은 배정) — 또 걷으면 이중 계상이다. */
  const 이탈된 = 항목추가(항목추가([], 고름사건('sit-3'), 닻()).로그, 이탈꼴('sit-9', 'task-2026-08-10')).로그;
  assert.deepEqual(죽은배정들(이탈된, 'task-2026-08-11'), [], 'cleanup 이 적은 배정을 또 걷었다 — 이중 계상');
  /* 닻 없는 옛 항목 — 어느 배정의 것인지 지어낼 수 없다(분모로만 남는다). */
  const 옛 = 항목추가([], 고름사건('sit-옛')).로그;
  assert.deepEqual(죽은배정들(옛, 'task-2026-08-11'), [], '닻 없는 항목을 걷었다 — 지어낸 귀속이다');
});

test('항목추가 — 닻(task_meta)은 새 항목에만 붙고, 접힌 재호출이 첫 닻을 못 바꾼다', () => {
  const { 로그 } = 항목추가([], 고름사건('s'), 닻('task-A'));
  assert.deepEqual(로그[0].task_meta, 닻('task-A'));
  const 다시 = 항목추가(로그, 고름사건('s'), 닻('task-B'));
  assert.equal(다시.새것, false);
  assert.equal(다시.로그[0].task_meta.task_ref, 'task-A', '재호출이 닻을 갈아치웠다 — 귀속이 흔들린다');
  assert.ok(!('task_meta' in 항목추가([], 고름사건('s2')).로그[0]), '닻 없이 담았는데 빈 닻 키가 생겼다');
});

test('막힌 학생의 것은 안 나간다 — 큐에는 그대로 남는다(지우는 것이 아니다)', () => {
  const { 로그 } = 항목추가([], 메일사건());
  assert.equal(보낼것(로그, { code: 'CONSENT_MISSING' }).length, 0);
  assert.equal(보낼것(로그, null).length, 1);
  assert.equal(밀린것(로그).length, 1, '막힘이 항목을 지웠다 — 동의가 서는 날 나갈 것이 사라진다');
});

test('전송기록 — 도착·거절이 그 항목에만 적힌다(재수출이 제출로그와 같은 판정)', () => {
  let { 로그 } = 항목추가([], 메일사건());
  ({ 로그 } = 항목추가(로그, 고름사건()));
  로그 = 전송기록(로그, 'mail:sit-1', { event_id: 'E-1' });
  assert.equal(로그.find((e) => e.id === 'mail:sit-1').event_id, 'E-1');
  assert.equal(로그.find((e) => e.id === 'choice:sit-1').event_id, null);
  assert.equal(보낼것(로그, null).length, 1, '닿은 것이 다시 나간다');
});

/* ─────────── ⑦ 한 앉음에 턴이 여럿인 모듈(G2 · 3문장) ───────────
 * 🔴 이 절이 없던 동안 실측은 이랬다: 3턴 앉음을 담으면 큐에 **1건**이 섰다.
 *    ①`quiz.answered` 가 접두 표 밖이라 「고칠 곳 없음」이 통째로 사라지고(§9-③ 과잉 교정
 *    성향의 유일한 재료) ②2·3턴 제출이 1턴과 같은 항목 id 를 받아 접혔다. 둘 다 오류가 아니라
 *    **정상 반환값**이라 화면도 큐도 멀쩡했다 — 사건만 없었다. */

const G2턴사건 = (문항id, {
  correlation_id = 'sit-g2', task_ref = 'task-2026-08-12', event_type = 'submission.created',
} = {}) => ({
  idempotency_key: `k-${문항id}-${event_type}`,
  event_type,
  correlation_id,
  submission: {
    task_ref,
    task_format: '쓰기첨삭',
    task_snapshot: { challenge_id: G2모듈상수.challenge_id, prompt_seed: 문항id },
    ...(event_type === 'submission.created' ? { body_original: `${문항id} 고친 문장입니다.` } : {}),
  },
  payload: { ver: 1, attempt_no: 1 },
});

test('⑦ 3턴 앉음이 큐에 **3건**으로 선다 — 같은 앉음이어도 문항이 다르면 다른 항목이다', () => {
  let 로그 = [];
  for (const 사건 of [
    G2턴사건('g2t01'),
    G2턴사건('g2t48', { event_type: 'quiz.answered' }), // 대조 문항 「고칠 곳 없음」
    G2턴사건('g2t06'),
  ]) ({ 로그 } = 항목추가(로그, 사건));
  assert.equal(로그.length, 3, '한 앉음의 턴이 접혔다 — 사건이 오류 없이 사라지는 그 자리다');
  assert.deepEqual(로그.map((e) => e.id), [
    'mail:sit-g2#g2t01', 'quiz:sit-g2#g2t48', 'mail:sit-g2#g2t06',
  ]);
});

test('⑦ 「고칠 곳 없음」(`quiz.answered`)이 이 큐에 든다 — 접두 표 밖이면 담기가 조용히 버린다', () => {
  const 사건 = G2턴사건('g2t48', { event_type: 'quiz.answered' });
  assert.notEqual(항목id(사건), null, 'quiz.answered 가 큐 소속 밖이다');
  const { 항목, 새것 } = 항목추가([], 사건);
  assert.ok(항목 && 새것, '담기가 사건을 버렸다(반환값은 성공의 모양이다)');
});

test('⑫ 확인 답(`estimate.responded`)이 이 큐에 든다 — 접두 표 밖이던 동안 답이 증발했다(08-24 G11)', () => {
  /* Ⅲ⑥이 카드·조립기·계약·서버를 다 세우고 이 표 한 줄을 빠뜨려, 학생의 「맞다/아니다」가
   * 기기 로그에도 서버에도 안 닿았다 — quiz.answered 가 밟은 그 병의 재발. 표가 곧 통로다. */
  const 사건 = {
    idempotency_key: 'k-est-1', event_type: 'estimate.responded', correlation_id: 'sit-1',
    payload: { ver: 1, trait_axis: '리듬', shown_key: '여유제출', response: '맞다' },
  };
  assert.equal(항목id(사건), 'estimate:sit-1', '확인 답이 큐 소속 밖이다 — 담기가 조용히 버린다');
  const { 로그, 새것 } = 항목추가([], 사건);
  assert.equal(새것, true, '담기가 확인 답을 버렸다(반환값은 성공의 모양이다)');
  /* 같은 앉음의 이중 탭은 한 항목으로 접힌다 — 로컬 접기가 동시-중복(G11)의 첫 방벽이다. */
  const 다시 = 항목추가(로그, { ...사건, idempotency_key: 'k-est-2' });
  assert.equal(다시.새것, false, '같은 앉음의 둘째 탭이 새 항목이 됐다 — 같은 답이 두 번 나간다');
  assert.equal(다시.로그.length, 1);
});

test('⑦ 같은 턴을 두 번 담으면 접힌다 — 턴 칸이 접기를 깨지 않는다', () => {
  let { 로그, 새것 } = 항목추가([], G2턴사건('g2t01'));
  assert.equal(새것, true);
  ({ 로그, 새것 } = 항목추가(로그, { ...G2턴사건('g2t01'), idempotency_key: 'k-다시' }));
  assert.equal(새것, false, '같은 턴이 두 벌 섰다 — 같은 제출이 두 번 나간다');
  assert.equal(로그.length, 1);
  assert.equal(로그[0].사건.idempotency_key, G2턴사건('g2t01').idempotency_key,
    '첫 사건 객체가 바뀌었다 — 멱등키는 한 번 정하고 안 바꾼다(재전송이 같은 객체를 쓴다)');
});

test('⑦ 턴 열쇠가 없는 사건은 id 가 **한 글자도** 안 바뀐다(G1·이탈·옛 항목)', () => {
  assert.equal(항목id(메일사건('s')), 'mail:s', '기기에 남은 미전송 항목이 새 id 로 두 벌이 된다');
  assert.equal(항목id(고름사건('s')), 'choice:s');
  assert.equal(항목id({ event_type: 'session.abandoned', correlation_id: 's', submission: { task_ref: 't' } }),
    'abandon:s', '이탈은 앉음 하나에 하나다 — 턴 칸이 붙으면 안 된다');
  /* 등록 안 된 challenge 의 스냅샷은 턴을 안 가른다 — 모르는 모듈에 규칙을 지어내지 않는다. */
  assert.equal(항목id({
    event_type: 'submission.created',
    correlation_id: 's',
    submission: { task_ref: 't', task_snapshot: { challenge_id: 'g9-없는것', prompt_seed: 'x' } },
  }), 'mail:s');
});

test('⑦ 다음시도번호 — 문항을 주면 **그 문항 안의** 재시도만 센다', () => {
  let 로그 = [];
  for (const 사건 of [G2턴사건('g2t01'), G2턴사건('g2t48', { event_type: 'quiz.answered' })]) {
    ({ 로그 } = 항목추가(로그, 사건));
  }
  assert.equal(다음시도번호(로그, 'task-2026-08-12', 'g2t06'), 1,
    '다른 문항의 제출이 이 문항의 재시도로 세어졌다 — 「자기 교정 루프」 축이 통째로 거짓이 된다');
  assert.equal(다음시도번호(로그, 'task-2026-08-12', 'g2t01'), 2, '같은 문항 다시 짚기는 2다');
  assert.equal(다음시도번호(로그, 'task-2026-08-12'), 2, '문항을 안 주면 뜻은 배정 단위 그대로다(G1)');
});

test('⑦ 턴항목 — 짚음·무산출 **둘 다** 「이 턴은 냈다」로 본다', () => {
  let 로그 = [];
  for (const 사건 of [G2턴사건('g2t01'), G2턴사건('g2t48', { event_type: 'quiz.answered' })]) {
    ({ 로그 } = 항목추가(로그, 사건));
  }
  assert.ok(턴항목(로그, 'task-2026-08-12', 'g2t01'), '짚음 턴을 못 찾았다');
  assert.ok(턴항목(로그, 'task-2026-08-12', 'g2t48'),
    '「고칠 곳 없음」으로 끝낸 턴이 안 끝난 것으로 보인다 — 화면이 그 턴을 다시 연다');
  assert.equal(턴항목(로그, 'task-2026-08-12', 'g2t06'), null, '안 낸 턴');
  assert.equal(턴항목(로그, 'task-2026-08-12', null), null, '턴을 모르면 판정하지 않는다');
  assert.equal(턴항목(로그, 'task-다른날', 'g2t01'), null, '배정이 다르면 남의 턴이다');
});

test('⑦ 제출항목(배정 단위)은 G1 뜻 그대로다 — 두 축을 한 이름에 얹지 않았다', () => {
  const { 로그 } = 항목추가([], 메일사건('s', 'task-x'));
  assert.ok(제출항목(로그, 'task-x'), 'G1 판정이 바뀌었다');
});

/* ⑧ 🔴 **같은 뿌리 세 번째라 원인을 쓸 수 없게 만든다**(CLAUDE.md 신뢰성).
 *   뿌리 = 「생산자는 사건을 내는데 그 사건이 통로에 착지하는지 아무도 안 잰다」. 실측 셋:
 *   ①1단계가 전제한 봉투 밖 칸이 통로에 없어 `게임재료` 가 영원히 null(3단계 ①배선)
 *   ②`quiz.answered` 가 이 큐의 접두 표 밖이라 담기가 버림(이 커밋)
 *   ③2·3턴이 같은 항목 id 로 접힘(이 커밋).
 *   셋 다 **정상 반환값**이라 어느 층도 안 빨개진다. 그래서 아래는 「고쳤다」가 아니라
 *   **새 모듈이 같은 방식으로 새면 그 자리에서 운다**를 짓는다 — 목록은 생산자 소스에서
 *   파생시킨다(여기 event_type 을 손으로 적으면 그 손목록이 다음 구멍이다). */
test('⑧ 게임 생산자가 내는 event_type 이 **전부** 이 큐의 접두 표에 있다', () => {
  const 생산자들 = ['lib/게임제출.js', 'lib/보고서교정제출.js'];
  const 낸것 = new Set();
  for (const 파일 of 생산자들) {
    /* 주석은 벗기고 본다 — 설명 속 사건 이름이 코드로 읽히면 없는 요구가 생긴다. */
    const 코드 = 코드만(fs.readFileSync(path.join(뿌리, 파일), 'utf8'));
    for (const m of 코드.matchAll(/event_type:\s*'([^']+)'/g)) 낸것.add(m[1]);
  }
  assert.ok(낸것.size >= 3,
    `생산자 소스에서 event_type 을 ${낸것.size}개만 찾았다 — 수집 규칙이 낡았다(통과가 아니라 미실행이다)`);
  for (const t of 낸것) {
    assert.notEqual(항목id({ event_type: t, correlation_id: 's' }), null,
      `생산자가 내는 «${t}» 가 큐 접두 표 밖이다 — 담기가 정상 반환값(새것:false)으로 그 사건을 버리고, 화면도 큐도 멀쩡하다`);
  }
});
