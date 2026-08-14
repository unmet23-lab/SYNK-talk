/* 검수 큐의 쪽·순서 — `lib/검수커서.js` 가 정본 (docs/검수_내부계약.md §3).
 *
 * ■ 왜 이 검사가 있나
 *   이 규칙이 틀리면 증상이 **없다.** 쪽 경계에서 한 건이 빠져도 큐는 원래 줄어드는 목록이라
 *   검수자가 「내가 못 본 발화가 있다」를 알 방법이 없다. 그래서 탐지력을 **픽스처**로 못박는다:
 *   ①정렬이 계약의 세 축과 같은 순서를 내는가 ②커서가 왕복하는가 ③범위 밖 입력이 400 이 되는가.
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ② 탐지력은 픽스처가 진다 — 정렬은 **손으로 적은 기대 순서**와 대조한다(구현으로 기대를
 *      만들면 구현이 틀려도 초록이다).
 *   ③ 자기 처방 — 「범위 밖은 400」이라 적었으면 그 400 을 받은 클라이언트가 따를 수 있는
 *      값(1~20)은 실제로 통과해야 한다. 경계 둘을 같이 건다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  쪽크기, 커서읽기, 커서만들기, 커서키, 기본쪽, 최소쪽, 최대쪽,
  반커서읽기, 반커서만들기, 반커서키,
} = require('../lib/검수커서.js');

/* ── ① 쪽 크기 ────────────────────────────────────────────────────── */

test('limit 없으면 기본 10 · 경계 1·20 은 통과한다', () => {
  assert.deepEqual(쪽크기(null), { 값: 기본쪽, 이유: null });
  assert.deepEqual(쪽크기(undefined), { 값: 기본쪽, 이유: null });
  assert.equal(쪽크기(String(최소쪽)).값, 최소쪽);
  assert.equal(쪽크기(String(최대쪽)).값, 최대쪽);
});

test('🔴 범위 밖을 조용히 자르지 않는다 — 잘린 것과 없는 것이 같은 모양이면 안 된다', () => {
  for (const raw of ['0', '21', '1000']) {
    const r = 쪽크기(raw);
    assert.equal(r.값, null, `${raw} 를 값으로 받았다 — 깎아 주면 읽는 쪽은 그게 전부인 줄 안다`);
    assert.match(r.이유, /limit/u);
  }
});

test('모양이 아닌 limit 은 여기서 걸린다 — 안 걸면 500 이 된다', () => {
  for (const raw of ['', 'abc', '1.5', ' 5', '5 ', '-1', '٣']) {
    assert.equal(쪽크기(raw).값, null, `${JSON.stringify(raw)} 가 통과했다 — Postgres 까지 내려가면 5xx 다`);
  }
});

/* ── ② 커서 왕복 ──────────────────────────────────────────────────── */

const 행 = (o) => ({
  submission_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  is_audit_sample: false,
  stt_confidence: '0.812',
  occurred_at: new Date('2026-08-09T05:00:00.000Z'),
  ...o,
});

test('커서는 왕복한다 — 만든 것을 그대로 되읽는다', () => {
  for (const 후보 of [행({}), 행({ is_audit_sample: true }), 행({ stt_confidence: null }),
    행({ stt_confidence: '1.000' }), 행({ occurred_at: '2026-08-01T00:00:00.000Z' })]) {
    const s = 커서만들기(후보);
    const { 값, 이유 } = 커서읽기(s);
    assert.equal(이유, null, `${s} 를 못 읽었다`);
    assert.equal(값.감사, 후보.is_audit_sample);
    assert.equal(값.신뢰, 후보.stt_confidence ?? null);
    assert.equal(값.id, 후보.submission_id);
    assert.equal(Date.parse(값.시각), new Date(후보.occurred_at).getTime());
  }
});

test('🔴 안 잰 신뢰도(null)와 0.000 은 다른 값이다', () => {
  const 안잼 = 커서읽기(커서만들기(행({ stt_confidence: null }))).값;
  const 영 = 커서읽기(커서만들기(행({ stt_confidence: '0.000' }))).값;
  assert.equal(안잼.신뢰, null);
  assert.equal(영.신뢰, '0.000');
  assert.equal(커서키(안잼).널키, true, '안 잰 것을 「신뢰도 0」으로 접으면 맨 앞으로 올라온다');
  assert.equal(커서키(영).널키, false);
});

test('커서가 없으면 첫 쪽이다 (오류가 아니다)', () => {
  assert.deepEqual(커서읽기(null), { 값: null, 이유: null });
  assert.equal(커서키(null), null);
});

test('망가진 커서는 400 이 되게 한다 — Postgres 까지 안 내려보낸다', () => {
  for (const raw of ['어제', '', '1|0.5|2026-08-09T05:00:00.000Z', '2|0.5|2026-08-09T05:00:00.000Z|9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    '1|0.5|아무때나|9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', '1|0.5|2026-08-09T05:00:00.000Z|짧은id',
    '1|0.5|2026-08-09T05:00:00.000Z|9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d|덤']) {
    const r = 커서읽기(raw);
    assert.equal(r.값, null, `${JSON.stringify(raw)} 가 통과했다`);
    assert.match(r.이유, /next_cursor/u);
  }
});

test('행이 없으면 다음 커서도 없다', () => {
  assert.equal(커서만들기(undefined), null);
  assert.equal(커서만들기(행({ occurred_at: '말도 안 되는 시각' })), null);
});

/* ── ③ 정렬 — 계약의 세 축을 그대로 내는가 ────────────────────────── */

/** `커서키` 가 편 튜플의 **사전식** 비교. SQL 의 행 비교(`(a,b,…) > (…)`)와 같은 규칙이다. */
function 비교(a, b) {
  const 키 = (r) => {
    const k = 커서키(커서읽기(커서만들기(r)).값);
    return [k.감사키 ? 1 : 0, k.널키 ? 1 : 0, Number(k.신뢰키), Date.parse(k.시각), k.id];
  };
  const [x, y] = [키(a), 키(b)];
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] < y[i]) return -1;
    if (x[i] > y[i]) return 1;
  }
  return 0;
}

const id = (n) => `9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6${n}`;
const 표본 = {
  A: 행({ 이름: 'A', submission_id: id('a'), is_audit_sample: true, stt_confidence: '0.900', occurred_at: '2026-08-01T00:00:00Z' }),
  B: 행({ 이름: 'B', submission_id: id('b'), is_audit_sample: true, stt_confidence: null, occurred_at: '2026-08-01T00:00:00Z' }),
  C: 행({ 이름: 'C', submission_id: id('c'), is_audit_sample: false, stt_confidence: '0.100', occurred_at: '2026-08-05T00:00:00Z' }),
  D: 행({ 이름: 'D', submission_id: id('d'), is_audit_sample: false, stt_confidence: '0.100', occurred_at: '2026-08-02T00:00:00Z' }),
  E: 행({ 이름: 'E', submission_id: id('e'), is_audit_sample: false, stt_confidence: null, occurred_at: '2026-08-01T00:00:00Z' }),
  F: 행({ 이름: 'F', submission_id: id('f'), is_audit_sample: true, stt_confidence: '0.200', occurred_at: '2026-08-09T00:00:00Z' }),
};

test('정렬 = 감사 표본 먼저 · 저신뢰 낮은 순 · 안 잰 것은 뒤 · 그다음 오래된 순', () => {
  const 섞음 = ['C', 'E', 'A', 'F', 'B', 'D'].map((n) => 표본[n]);
  const 실제 = [...섞음].sort(비교).map((r) => r.이름);
  /* 손으로 적은 기대 순서다(구현으로 만들지 않았다):
   *   감사 표본 F(0.2) → A(0.9) → B(안 잼)  ·  그다음 D(0.1·08-02) → C(0.1·08-05) → E(안 잼) */
  assert.deepEqual(실제, ['F', 'A', 'B', 'D', 'C', 'E'],
    '큐 순서가 계약(§3)과 다르다 — 감사 표본이 뒤로 가거나 안 잰 것이 맨 앞으로 온다');
});

test('탐지력 — 축 하나만 뒤집어도 위 순서가 깨진다', () => {
  // 감사 축을 안 뒤집으면(=`값.감사` 를 그대로 쓰면) 감사 표본이 **맨 뒤**로 간다.
  const 뒤집힘 = (a, b) => {
    const 키 = (r) => [r.is_audit_sample ? 1 : 0, r.stt_confidence === null ? 1 : 0,
      Number(r.stt_confidence ?? 0), Date.parse(r.occurred_at)];
    const [x, y] = [키(a), 키(b)];
    for (let i = 0; i < x.length; i += 1) { if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; }
    return 0;
  };
  const 나쁜순서 = ['C', 'E', 'A', 'F', 'B', 'D'].map((n) => 표본[n]).sort(뒤집힘).map((r) => r.이름);
  assert.notDeepEqual(나쁜순서, ['F', 'A', 'B', 'D', 'C', 'E'],
    '축을 뒤집어도 같은 순서가 나온다 — 위 검사는 아무것도 안 재고 있다');
});

test('동점은 submission_id 가 가른다 — 없으면 쪽 경계에서 한 건이 사라진다', () => {
  const 같음 = { is_audit_sample: false, stt_confidence: '0.500', occurred_at: '2026-08-03T00:00:00Z' };
  const 앞 = 행({ ...같음, submission_id: id('1') });
  const 뒤 = 행({ ...같음, submission_id: id('2') });
  assert.equal(비교(앞, 뒤), -1, '세 축이 같을 때 순서가 안 정해진다 — 그러면 쪽마다 순서가 흔들린다');
  assert.equal(비교(앞, 앞), 0);
});

/* ── ④ 반 모드 커서 (검수_내부계약 §3-2 · 숙제서클 §10-3) ─────────────
 * 축이 다르다: 조 → 좌석 → 시각(교사 동선). 기본 커서와 같은 방식으로 탐지력을 픽스처에 건다. */

const 반행 = (o) => ({
  submission_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  group_no: 2,
  seat_no: 3,
  occurred_at: new Date('2026-08-14T01:00:00.000Z'),
  ...o,
});

test('반 커서는 왕복한다 — 만든 것을 그대로 되읽는다', () => {
  for (const 후보 of [반행({}), 반행({ group_no: null, seat_no: null }),
    반행({ group_no: 1, seat_no: null }), 반행({ occurred_at: '2026-08-01T00:00:00.000Z' })]) {
    const s = 반커서만들기(후보);
    const { 값, 이유 } = 반커서읽기(s);
    assert.equal(이유, null, `${s} 를 못 읽었다`);
    assert.equal(값.조, 후보.group_no ?? null);
    assert.equal(값.좌석, 후보.seat_no ?? null);
    assert.equal(값.id, 후보.submission_id);
    assert.equal(Date.parse(값.시각), new Date(후보.occurred_at).getTime());
  }
});

test('🔴 편성 전(null)과 「0조」는 다른 값이다 — 0 으로 접으면 nulls last 를 커서가 되돌린다', () => {
  const 없음 = 반커서읽기(반커서만들기(반행({ group_no: null, seat_no: null }))).값;
  assert.equal(없음.조, null);
  assert.equal(반커서키(없음).조널키, true, 'null 조가 「0조」로 접혀 맨 앞으로 올라온다');
  const 있음 = 반커서읽기(반커서만들기(반행({}))).값;
  assert.equal(반커서키(있음).조널키, false);
});

test('망가진 반 커서는 400 이 되게 한다 — 기본 커서 꼴도 여기서는 오류다', () => {
  for (const raw of ['어제', '', '2|3|아무때나|9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    '2|3|2026-08-14T01:00:00.000Z|짧은id',
    // 기본 커서 꼴(감사|신뢰|시각|id) — 신뢰도 소수점이 반 커서의 정수 칸에 오면 걸려야 한다.
    '1|0.5|2026-08-14T01:00:00.000Z|9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    '2|3|2026-08-14T01:00:00.000Z|9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d|덤']) {
    const r = 반커서읽기(raw);
    assert.equal(r.값, null, `${JSON.stringify(raw)} 가 통과했다`);
    assert.match(r.이유, /next_cursor/u);
  }
});

/** 반 커서 튜플의 사전식 비교 — SQL 행 비교와 같은 규칙. */
function 반비교(a, b) {
  const 키 = (r) => {
    const k = 반커서키(반커서읽기(반커서만들기(r)).값);
    return [k.조널키 ? 1 : 0, k.조키, k.좌석널키 ? 1 : 0, k.좌석키, Date.parse(k.시각), k.id];
  };
  const [x, y] = [키(a), 키(b)];
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] < y[i]) return -1;
    if (x[i] > y[i]) return 1;
  }
  return 0;
}

test('반 모드 정렬 = 조 → 좌석 → 오래된 순 · 편성 전은 맨 뒤 (교사 동선)', () => {
  const 표 = {
    A: 반행({ 이름: 'A', submission_id: id('a'), group_no: 1, seat_no: 4 }),
    B: 반행({ 이름: 'B', submission_id: id('b'), group_no: 2, seat_no: 1 }),
    C: 반행({ 이름: 'C', submission_id: id('c'), group_no: 1, seat_no: 2, occurred_at: '2026-08-14T02:00:00Z' }),
    D: 반행({ 이름: 'D', submission_id: id('d'), group_no: 1, seat_no: 2, occurred_at: '2026-08-14T01:00:00Z' }),
    E: 반행({ 이름: 'E', submission_id: id('e'), group_no: null, seat_no: null }),
  };
  const 실제 = ['E', 'B', 'A', 'C', 'D'].map((n) => 표[n]).sort(반비교).map((r) => r.이름);
  /* 손으로 적은 기대 순서다: 1조 2번(오래된 D → C) → 1조 4번 A → 2조 B → 편성 전 E */
  assert.deepEqual(실제, ['D', 'C', 'A', 'B', 'E'],
    '반 모드 순서가 계약(§3-2)과 다르다 — 교사가 눈앞의 조와 다른 초안을 보게 된다');
});

test('탐지력 — 편성 전을 앞으로 접으면 위 순서가 깨진다', () => {
  const 나쁜키 = (r) => [r.group_no ?? 0, r.seat_no ?? 0, Date.parse(r.occurred_at)];
  const 나쁜비교 = (a, b) => {
    const [x, y] = [나쁜키(a), 나쁜키(b)];
    for (let i = 0; i < x.length; i += 1) { if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; }
    return 0;
  };
  const 표 = [반행({ 이름: '있음', submission_id: id('1'), group_no: 1, seat_no: 1 }),
    반행({ 이름: '없음', submission_id: id('2'), group_no: null, seat_no: null })];
  assert.equal([...표].sort(나쁜비교)[0].이름, '없음',
    'null 을 0 으로 접었는데도 편성 전이 뒤로 간다 — 이 탐지력 픽스처가 죽었다');
  assert.equal([...표].sort(반비교)[0].이름, '있음',
    '정본 비교에서 편성 전이 앞으로 왔다 — nulls last 가 깨졌다');
});
