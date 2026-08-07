/* 배달 선택 회귀 — P0 §6 의 「무엇을 낼 것인가」가 계약대로 갈리는지 못박는다.
 *
 * 세 맹점(CLAUDE.md):
 *   ① 사람이 실제로 쓰는 표기 — 멱등키는 C0 §4-1 이 적은 문자열 그대로 비교한다.
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 픽스처로 걸고,
 *      실저장소(계약 json)에는 「지어낸 값목록이 없는가」 하나만 건다.
 *   ③ 자기 처방 — 강등으로 나온 배정을 다음 날 재료로 되먹여도 경로가 성립해야 한다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const { 몽골날짜, 멱등키, 오늘과제, 따라말하기문장, 화면과제, 제출사건, 열람사건, 도입,
  학생판스냅샷, 학생공개키 } = require('../lib/오늘과제.js');
const { 검증 } = require('../lib/이벤트검증.js');

const 날짜 = '2026-08-07';
const 호흡 = (r, 차례) => r.task_snapshot.호흡.find((h) => h.차례 === 차례);

/* ── 날짜 ─────────────────────────────────────────────────────────
 * 🔴 UTC 로 끊으면 몽골 오전 8시까지가 「어제」다. 그 오독은 증상이 조용하다 —
 *   아침에 앱을 연 학생이 어제 과제를 오늘 것으로 받고, 배치는 「1건 냈다」고 보고한다. */
test('날짜는 몽골 달력으로 끊는다 — 16:00Z 가 경계다', () => {
  assert.equal(몽골날짜(new Date('2026-08-07T15:59:59Z')), '2026-08-07');
  assert.equal(몽골날짜(new Date('2026-08-07T16:00:00Z')), '2026-08-08');
  // 자정 UTC 는 몽골에서 이미 같은 날 오전 8시다 — UTC 로 끊으면 여기서 하루가 밀린다.
  assert.equal(몽골날짜(new Date('2026-08-07T00:00:00Z')), '2026-08-07');
});

test('몽골날짜는 날짜가 아닌 것을 조용히 삼키지 않는다', () => {
  assert.throws(() => 몽골날짜('어제'), TypeError);
});

/* ── 멱등키 ───────────────────────────────────────────────────────
 * C0 §4-1: 배치는 결정론적 키를 쓴다 — 두 번 돌면 두 번째가 `duplicate` 로 접힌다.
 * 모양이 바뀌면 그 접힘이 풀려 **하루 2건**이 조용히 선다(새 유일 제약이 없으므로). */
test('멱등키는 C0 §4-1 이 적은 모양 그대로다', () => {
  assert.equal(
    멱등키('task', '11111111-2222-4333-8444-555555555555', 날짜),
    'task:11111111-2222-4333-8444-555555555555:2026-08-07',
  );
});

test('같은 날 두 사건은 키가 갈린다 — 하나가 다른 하나를 접으면 안 된다', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  assert.notEqual(멱등키('task', id, 날짜), 멱등키('intervention', id, 날짜));
});

/* ── 네 갈래 ─────────────────────────────────────────────────────── */
test('첫날 = 도입 과제 · 강등 아님 (§4-5 유호님 확정)', () => {
  const r = 오늘과제({ 날짜, 첫날: true });
  assert.equal(호흡(r, 2).문장, 도입.따라말하기);
  assert.equal(r.출처, '도입');
  assert.equal(r.degraded, false, '첫날은 정상 경로다 — 강등으로 세면 원장 화면이 거짓말한다');
});

test('교정이 새로 확정됐으면 ②슬롯이 그 교정문이다 (§6-3)', () => {
  const r = 오늘과제({ 날짜, 교정문: '어제 친구를 만나서 밥을 먹었어요' });
  assert.equal(호흡(r, 2).문장, '어제 친구를 만나서 밥을 먹었어요');
  assert.equal(r.출처, '교정문');
  assert.equal(r.degraded, false, '교정문은 조회지 AI 호출이 아니다');
});

test('AI 자리가 비면 전날 문장으로 내려가고 **강등으로 남는다** (§6-4)', () => {
  const r = 오늘과제({ 날짜, 전날문장: '저는 학교에 갑니다' });
  assert.equal(호흡(r, 2).문장, '저는 학교에 갑니다');
  assert.equal(r.degraded, true, '강등을 안 적으면 「막힌 것이 통과한 것처럼」 보인다');
});

test('전날 문장도 없으면 고정 도입 과제 — 그래도 강등이다', () => {
  const r = 오늘과제({ 날짜 });
  assert.equal(호흡(r, 2).문장, 도입.따라말하기);
  assert.equal(r.degraded, true);
});

test('첫날이 교정문보다 앞선다 — 첫 발화 기준선은 소급이 안 된다', () => {
  const r = 오늘과제({ 날짜, 첫날: true, 교정문: '고쳐진 문장' });
  assert.equal(r.출처, '도입');
});

/* ── 오디오 타임캡슐 (N23 · 유호님 확정 2026-08-08) ───────────────── */
test('첫날 ③은 「6개월 뒤의 나에게」다 — 해봉 때 되돌려줄 다짐이 여기서 생긴다', () => {
  const r = 오늘과제({ 날짜, 첫날: true });
  assert.equal(호흡(r, 3).프롬프트, 도입.첫날답하기);
});

test('🔴 강등 날에는 그 질문이 새면 안 된다 — 6개월차가 「6개월 뒤의 나」를 다시 받는다', () => {
  for (const 재료 of [
    { 날짜, 전날문장: '저는 학교에 갑니다' },   // 강등 1단계
    { 날짜 },                                    // 강등 2단계(고정 도입으로 내려감)
    { 날짜, 교정문: '고쳐진 문장' },             // 정상 경로(교정문)
  ]) {
    const r = 오늘과제(재료);
    assert.equal(호흡(r, 3).프롬프트, 도입.답하기, `첫날이 아닌데 첫날 질문이 나갔다: ${JSON.stringify(재료)}`);
  }
});

test('②낭독 문장은 첫날도 강등도 같다 — 갈리면 종단 대조가 그날로 죽는다', () => {
  assert.equal(호흡(오늘과제({ 날짜, 첫날: true }), 2).문장, 호흡(오늘과제({ 날짜 }), 2).문장);
});

test('첫날 기준선은 출처+degraded 로 갈린다 — task_ref 는 날짜라 짝이 안 된다', () => {
  const 첫 = 오늘과제({ 날짜, 첫날: true });
  const 강등 = 오늘과제({ 날짜 });                       // 같은 도입 문장을 쓰는 유일한 다른 경로
  assert.equal(첫.출처, 강등.출처, '전제: 둘 다 출처가 도입이라 출처만으로는 못 가른다');
  assert.notEqual(첫.degraded, 강등.degraded, 'degraded 가 유일한 구분축이다');
  assert.equal(첫.task_ref, 강등.task_ref, 'task_ref 는 날짜라 같은 날이면 같다 — 짝의 키가 될 수 없다');
});

/* ── 형식 ────────────────────────────────────────────────────────── */
test('두 호흡의 형식이 갈려 있다 — 한 칸에 담으면 나중에 못 가른다 (§2-1)', () => {
  const r = 오늘과제({ 날짜, 첫날: true });
  assert.equal(호흡(r, 2).task_format, '낭독');
  assert.equal(호흡(r, 3).task_format, '자유발화');
  assert.equal(r.task_snapshot.task_format, undefined, '배정 1건에 형식이 둘이라 행에는 안 적는다');
});

/* 🔴 실저장소 검사는 이것 하나 — 내가 값을 지어냈으면 빨개진다.
 *   `이벤트검증.test.js` 가 이름에 대해 하는 일을 값목록에 대해 한다. */
test('호흡이 쓰는 task_format 은 계약 값목록 안이다', () => {
  const 허용 = 계약.learning_events.값목록.task_format;
  for (const h of 오늘과제({ 날짜, 첫날: true }).task_snapshot.호흡) {
    assert.ok(허용.includes(h.task_format), `계약에 없는 task_format: ${h.task_format}`);
  }
});

/* ── 이어짐 ──────────────────────────────────────────────────────── */
test('오늘 스냅샷이 내일의 「전날 문장」이 된다 — 강등 경로가 자기 출력으로 돈다', () => {
  const 어제 = 오늘과제({ 날짜: '2026-08-06', 교정문: '제가 만든 문장이에요' });
  const 오늘 = 오늘과제({ 날짜, 전날문장: 따라말하기문장(어제.task_snapshot) });
  assert.equal(호흡(오늘, 2).문장, '제가 만든 문장이에요');
  assert.equal(오늘.degraded, true, '같은 문장을 다시 내는 것은 강등이다');
});

test('따라말하기문장은 모양이 어긋난 스냅샷에 null 을 준다', () => {
  assert.equal(따라말하기문장(null), null);
  assert.equal(따라말하기문장({ 호흡: [] }), null);
  assert.equal(따라말하기문장({ 호흡: [{ 차례: 3, 프롬프트: 'x' }] }), null, '③을 ②로 착각하면 안 된다');
});

test('task_ref 는 날짜를 물고 있다 — 제출이 어느 배정에 대한 것인지 잇는 유일한 끈', () => {
  assert.equal(오늘과제({ 날짜, 첫날: true }).task_ref, 'task-2026-08-07');
});

/* ── 화면이 읽는 자리 (S1-b) ─────────────────────────────────────────
 * 🔑 재료를 **`오늘과제()` 가 직접 만든 것**으로 쓴다 — 손으로 적은 픽스처를 쓰면 배치가
 *   호흡 키를 바꾸는 날 이 검사만 초록으로 남고, 그 조합이 정확히 「빈 화면」의 원인이다. */
const 서버항목 = (덧 = {}) => {
  const r = 오늘과제({ 날짜, 첫날: true });
  return {
    task_id: '11111111-1111-4111-8111-111111111111',
    task_snapshot: r.task_snapshot,
    task_format: null,
    degraded: r.degraded,
    /* 🔑 `event_id` ≠ `intervention_id`. 둘을 같은 값으로 적으면 아래 검사가 **둘을 바꿔 써도**
     *   초록이 되고, 그 오류의 증상은 「같은 개입을 두 번 낸 날 두 열람이 한 행으로 접히는 것」
     *   뿐이라 조용하다(C0 §4-3 ①). */
    intervention: {
      intervention_id: '22222222-2222-4222-8222-222222222222',
      event_id: '33333333-3333-4333-8333-333333333333',
      output_text: '오늘 온 말',
    },
    ...덧,
  };
};
const 폴백 = { id: 'seed-beginner-v1', 본문: '고정 본문', 핵심문장: '고정 문장', 질문: '고정 질문', 선택지: ['가', '나'] };

test('서버 과제를 받으면 화면이 그것을 쓴다 — ②③이 스냅샷에서 그대로 온다', () => {
  const v = 화면과제(서버항목(), 폴백);
  assert.equal(v.출처, '서버');
  assert.equal(v.사유, null);
  assert.equal(v.편지.핵심문장, 도입.따라말하기, '②는 스냅샷의 문장이다');
  // 이 항목은 `오늘과제({첫날:true})` 로 만든다 → ③은 타임캡슐 질문이다(N23). 요지는 그대로다:
  // 화면이 **스냅샷에서** 가져오는가(폴백 값이 새지 않는가)를 잰다.
  assert.equal(v.편지.질문, 도입.첫날답하기, '③은 스냅샷의 프롬프트다');
  assert.equal(v.편지.본문, '오늘 온 말', '①듣기는 AI 가 실제로 한 말이다');
  assert.equal(v.task_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(v.intervention_id, '22222222-2222-4222-8222-222222222222');
});

test('🔴 선택지를 지어내지 않는다 — 서버가 안 내면 없다', () => {
  assert.equal(화면과제(서버항목(), 폴백).편지.선택지, null,
    '폴백의 선택지가 서버 과제에 새어들면 급수 1~2 골라서 답하기가 거짓으로 뜬다');
});

test('①듣기가 비면 ②문장이 그날 나간 말이다 — 강등 경로(§6-4)', () => {
  const v = 화면과제(서버항목({ intervention: null }), 폴백);
  assert.equal(v.편지.본문, 도입.따라말하기);
  assert.equal(v.intervention_id, null);
});

/* ── c9 `content.viewed` — 「귀에 실제로 닿았다」 ──────────────────────
 * 🔴 이 사건은 이름·물리·검증기가 다 선 채로 **생산자가 0**이었다. 막고 있던 것은 화면이 아니라
 *   `parent_event_id` 로 가리킬 값이었고(C0 §4-3 ① `intervention.event_id`), 그게 없는 동안
 *   `intervention.delivered` 는 배치의 **추정**인 채로 남았다 — 관측 짝이 없으면 네트워크 실패가
 *   「전달 완료」로 학습된다(절단문서 ①-12 · ①-2). 소급 불가라 개원 전에 서야 한다. */
test('🔑 배달 사건의 event_id 가 화면까지 온다 — 열람이 가리킬 유일한 값', () => {
  const v = 화면과제(서버항목(), 폴백);
  assert.equal(v.intervention_event_id, '33333333-3333-4333-8333-333333333333');
  assert.notEqual(v.intervention_event_id, v.intervention_id,
    '업무 키를 사건 id 자리에 넣으면 같은 개입을 두 번 낸 날 두 열람이 한 행으로 접힌다');
});

test('가리킬 배달이 없으면 화면도 빈손이다 — 폴백 날·개입 없는 배정', () => {
  assert.equal(화면과제(null, 폴백).intervention_event_id, null, '폴백 날엔 배달 사건이 없다');
  assert.equal(화면과제(서버항목({ intervention: null }), 폴백).intervention_event_id, null);
  // 개입은 붙었는데 배달 사건 행을 못 찾은 경우 — 서버가 `event_id: null` 로 보낸다.
  const 반쪽 = 서버항목({ intervention: { intervention_id: 'x', event_id: null, output_text: '말' } });
  assert.equal(화면과제(반쪽, 폴백).intervention_event_id, null);
});

test('🔑 열람사건이 계약을 지나는 `content.viewed` 를 만든다', () => {
  const e = 열람사건({
    parent_event_id: '33333333-3333-4333-8333-333333333333',
    idempotency_key: '44444444-4444-4444-8444-444444444444',
    correlation_id: '55555555-5555-4555-8555-555555555555',
    level_snapshot: 'Lv2',
    occurred_at: '2026-08-07T02:00:00.000Z',
  });
  assert.equal(e.event_type, 'content.viewed');
  assert.equal(e.parent_event_id, '33333333-3333-4333-8333-333333333333');
  const v = 검증(e, 계약);
  assert.ok(v.ok, v.오류들.join(' · '));
});

/* 🔴 급수 없는 학생(개원 첫 주 = 반 배정 전)도 열람은 보낼 수 있어야 한다 — 막으면 그 주의
 *   관측이 통째로 빈다. 「모른다(null)」와 「앱이 빠뜨렸다(키 없음)」는 갈라진 채다(§4-3 ① ⓑ). */
test('급수를 모르면 null 로 간다 — 키는 남는다', () => {
  const e = 열람사건({
    parent_event_id: 'p', idempotency_key: 'k', correlation_id: 'c',   // 형식 검사는 서버가 진다
  });
  assert.equal(e.level_snapshot, null);
  assert.ok('level_snapshot' in e, '키까지 빠지면 앱 결손이 「모른다」로 위장돼 들어온다');
});

/* 🔑 지어내지 않는다 — 없는 재료를 채우면 ①-10(가짜 앉음)·①-5(좌표 멱등키)로 되돌아간다.
 *   ⚠ 셋을 **따로** 잰다: 하나로 뭉뚱그리면 한 갈래만 살아 있어도 초록이 된다. */
test('재료가 없으면 사건을 안 만든다 — 셋 각각', () => {
  const 온전 = { parent_event_id: 'p', idempotency_key: 'k', correlation_id: 'c' };
  assert.ok(열람사건(온전), '온전한 재료가 null 이 되면 아래 검사가 전부 무의미하다');
  for (const 뺀것 of Object.keys(온전)) {
    assert.equal(열람사건({ ...온전, [뺀것]: null }), null, `${뺀것} 없이 사건이 만들어졌다`);
  }
  assert.equal(열람사건(), null, '인자 자체가 없어도 던지지 않고 null 이다');
});

/* 🔴 빈 상태·깨진 스냅샷은 **내려가되 말한다.** 조용히 폴백을 쓰면 배치가 며칠 안 돌아도
 *   화면은 늘 멀쩡해 보인다 — P0 §4-1 이 경계한 「막힌 것이 통과한 것처럼 보이는 상태」. */
test('배정이 없으면 고정 과제로 내려가고 그 사실을 낸다', () => {
  const v = 화면과제(null, 폴백);
  assert.equal(v.출처, '고정');
  assert.equal(v.편지, 폴백);
  assert.ok(v.사유 && v.사유.length > 0, '사유가 없으면 화면이 조용히 내려간다');
  assert.equal(v.degraded, true);
});

test('스냅샷이 반쪽이면 내려간다 — ②③은 쌍이라서 값이 있다(P0 §2-1)', () => {
  for (const 깨진 of [
    { ver: 1, 호흡: [] },
    { ver: 1, 호흡: [{ 차례: 2, 문장: '있다' }] },                 // ③이 없다
    { ver: 1, 호흡: [{ 차례: 3, 프롬프트: '있다' }] },              // ②가 없다
    { ver: 1, 호흡: [{ 차례: 2, 문장: '', 프롬프트: '' }] },
    null,
  ]) {
    const v = 화면과제(서버항목({ task_snapshot: 깨진 }), 폴백);
    assert.equal(v.출처, '고정', `깨진 스냅샷이 통과했다: ${JSON.stringify(깨진)}`);
    assert.ok(v.사유, '사유 없이 내려가면 원인이 화면에 안 남는다');
  }
});

test('폴백 없이는 부른 쪽이 즉시 안다 — 빈 화면을 내지 않는다', () => {
  assert.throws(() => 화면과제(null, null), /폴백/);
});

/* ── 제출 봉투 (S1-b 쓰기 절반 · C0 §4-1) ──────────────────────────────
 * 이 구역이 재는 것 하나: **앱이 조립한 사건이 계약 정본으로 검증을 통과하는가.**
 * 🔴 갈라져도 앱은 조용하다 — 증상은 「제출했는데 저장이 안 됐다」 하나뿐이고 이유는 서버에만 남는다.
 *   그래서 여기서는 계약 json 을 **실제로 넘겨** 값목록까지 대조한다(지어낸 이름은 여기서 죽는다).
 */
const 배정 = (덧 = {}) =>
  서버항목({ task_ref: `task-${날짜}`, level_snapshot: 'Lv3', goal_snapshot: '유학', ...덧 });

const 재료 = (덧) => 화면과제(배정(덧), 폴백).제출재료;

/* 한 앉음을 묶는 고리(P0 §3-1 ④) — c9 부터 **공통 필수**라 기본 항목이 들고 있어야
 * 「평범한 제출」이 된다(`lib/이벤트검증.js` 공통필수 · 절단문서 ①-10). */
const 흐름값 = '1f0c9c1e-6a2d-4c3b-8f11-2b7a5d9e0c44';

/* 멱등키도 **항목이 들고 온다**(C0 §4-1 · 절단문서 ①-5) — `lib/제출로그.js` 가 항목을 만들 때
 * 한 번 짓는다. 이 픽스처는 그 값을 손으로 박지만, 「진짜 통로가 실제로 박는가」는 손 픽스처로는
 * 못 재므로 아래 `항목추가` 를 태우는 검사를 따로 둔다. */
const 멱등값 = 'b6f1c0a2-0000-4000-8000-0000000000a5';

const 항목 = (덧 = {}) => ({
  id: `${날짜}-답하기-1`,
  date: 날짜,
  step: '답하기',
  attempt: 1,
  status: 'submitted',
  text: null,
  audio: 'file:///rec.m4a',
  created_at: '2026-08-07T02:00:00.000Z',
  correlation_id: 흐름값,
  idempotency_key: 멱등값,
  task_meta: 재료(),
  capture_app: { platform: 'android', extension: '.m4a', agc_requested: null },
  ...덧,
});

test('제출재료는 배정 행의 값 그대로다 — 앱이 지어내는 값이 하나도 없다', () => {
  const m = 재료();
  assert.equal(m.task_ref, `task-${날짜}`);
  assert.equal(m.level_snapshot, 'Lv3');
  assert.equal(m.goal_snapshot, '유학');
  // 형식은 스냅샷의 호흡마다 다르다 — 한 칸으로 합치면 P0 §2-1 이 경계한 사고가 성립한다.
  assert.deepEqual(m.형식, { 따라: '낭독', 답하기: '자유발화' });
});

/* 🔴 `task_ref` 를 안 주는 서버(구 배포)에 앱이 `task-{날짜}` 를 지어내면, 배치가 작명 규칙을
 *   바꾸는 날 제출이 큐와 안 이어진다 — 그 어긋남은 어디에도 오류로 안 남는다. */
test('배정에 task_ref 가 없으면 제출재료는 null — 규칙을 사본으로 만들지 않는다', () => {
  assert.equal(화면과제(서버항목(), 폴백).제출재료, null);
  assert.equal(제출사건(항목({ task_meta: null })), null, '재료가 없으면 사건도 없다');
});

test('앱이 조립한 제출 사건이 계약 검증을 통과한다 — ②낭독·③자유발화 둘 다', () => {
  for (const [step, 형식] of [['따라', '낭독'], ['답하기', '자유발화']]) {
    const e = 제출사건(항목({ step, id: `${날짜}-${step}-1` }), 'voice/x/y.m4a');
    const v = 검증(e, 계약);
    assert.ok(v.ok, `${step}: ${v.오류들.join(' · ')}`);
    assert.equal(e.event_type, 'submission.created');
    assert.equal(e.task_type, '발화녹음');
    assert.equal(e.submission.task_format, 형식, '호흡이 자기 형식을 갖는다(P0 §2-1)');
    assert.equal(e.submission.audio_ref, 'voice/x/y.m4a');
    assert.equal(e.payload.attempt_no, 1, '재시도는 attempt 로 남는다(C0 §4-3 ③ retry_count)');
  }
});

/* 재시도가 새 행을 만들지 않는 근거는 「키가 좌표에서 나온다」가 아니라 **「항목이 키를 들고
 * 있다」**이다 — 같은 항목을 몇 번 조립해도 같은 값이 실린다. 좌표 조립으로 되돌아가면
 * `attempt` 가 로컬 로그에서 세는 값이라 재설치·다른 기기에서 1 로 되돌아가고, 그때 새 녹음이
 * 옛 행에 `duplicate` 로 접힌다(절단문서 ①-5). */
test('멱등키는 항목이 들고 온다 — 같은 항목을 두 번 조립하면 같은 키', () => {
  const 그항목 = 항목();
  const a = 제출사건(그항목, 'voice/x/1.m4a');
  const b = 제출사건(그항목, 'voice/x/2.m4a');
  assert.equal(a.idempotency_key, b.idempotency_key, '재전송이 접히는 것이 이 한 줄에 달렸다');
  assert.equal(a.idempotency_key, 멱등값, '여기서 짓지 않는다 — 항목의 값을 그대로 싣는다');
});

/* 🔴 이 검사가 ①-5 를 막는 자물쇠다. **좌표가 같고 발화가 다른** 두 항목 — 로그를 지우고
 * 다시 녹음한 그날이 정확히 이 모양이다. 좌표에서 키를 조립하면 둘이 같은 키가 되고,
 * 서버는 뒤엣것을 `duplicate` + 원래 event_id 로 **성공처럼** 돌려준다. */
test('🔴 좌표(날짜·호흡·시도)가 같아도 다른 항목이면 다른 키 — 로그 초기화가 발화를 안 지운다', () => {
  const 첫판 = 제출사건(항목({ idempotency_key: '00000000-0000-4000-8000-000000000001' }), 'voice/x/1.m4a');
  const 재설치후 = 제출사건(항목({ idempotency_key: '00000000-0000-4000-8000-000000000002' }), 'voice/x/2.m4a');
  assert.equal(첫판.payload.attempt_no, 재설치후.payload.attempt_no, '좌표는 같다(= 사고 조건)');
  assert.notEqual(첫판.idempotency_key, 재설치후.idempotency_key);
});

/* 없는 값을 지어내면 갈래가 하나 더 생기고, 그 갈래가 곧 옛 버그다(`correlation_id` 와 같은 규칙). */
test('멱등키가 없는 옛 큐 항목은 사건을 만들지 않는다 — 여기서 짓지 않는다', () => {
  assert.equal(제출사건(항목({ idempotency_key: null }), 'voice/x/1.m4a'), null);
  assert.equal(제출사건(항목({ idempotency_key: undefined, status: 'abandoned', audio: null })), null);
});

/* 무발화를 `submission.created` 로 보내면 검증을 못 지나거나(내용물 택1), 지나더라도
 * `submission_count` 가 「말 안 한 날」에 올라 「어제의 나」가 거짓말한다(C0 §4-3 ③). */
/* 🔴 2026-08-07 뒤집힘(절단문서 ①-6). 예전 이 검사는 「제출물 행을 만들지 않는다」로 위 뜻을
 *   지켰는데, 그 대가로 **어디서 막혔는지가 통째로 사라졌다** — 낭독 시작 전 이탈과 자유발화 중
 *   포기가 같은 행이 되고, 끈기·난이도 모델의 원신호는 그 둘의 차이다. 제출 수를 지키는 진짜
 *   지렛대는 행의 부재가 아니라 `event_type` 필터다: 하류 5곳(progress·tasks·deliver 둘·
 *   corrections)이 전부 그렇게 세고, `tools/배달왕복시험.js` ⑥ 이 그 자리를 지킨다. */
test('무발화는 session.abandoned — 어디서 막혔는지를 들고 가되 제출로 세어지지 않는다', () => {
  const e = 제출사건(항목({ status: 'abandoned', audio: null }));
  assert.equal(e.event_type, 'session.abandoned');
  assert.equal(e.submission.task_format, '자유발화', '어느 호흡에서 막혔는지가 없다');
  assert.equal(e.submission.task_ref, `task-${날짜}`, '어느 날 배정인지가 없으면 분모가 없다');
  assert.equal(e.submission.body_original, undefined, '내용물은 여전히 없다');
  // ⓐ 입을 안 뗀 무발화 — 올릴 파일이 없으니 참조도 없다. ⓑ(문턱 미달)는 아래 별도 회귀.
  assert.equal(e.submission.audio_ref, undefined, '올린 파일이 없는데 참조가 생겼다');
  assert.ok(검증(e, 계약).ok, 검증(e, 계약).오류들.join(' · '));
});

/* 🔴 무발화 두 갈래가 접히던 자리 — ①-6 의 한 층 아래.
 *   ⓐ 입을 안 뗐다(조각 0 · WAV 없음) / ⓑ 소리는 났는데 문턱 미달(WAV 있음 · **이미 업로드된다**).
 *   `제출사건` 이 `audio_ref` 를 버리면 두 행이 바이트 단위로 같아지고 올라간 파일은 고아가 된다.
 *   겁먹은 학생과 포기한 학생이 같은 행이 되는 것이라 이탈 예측(P0 S1-6)의 원신호가 죽는다.
 *   ⚠ 이 회귀는 **직전 테스트와 짝**이다 — 한쪽만 있으면 「늘 싣는다」·「늘 버린다」 둘 다 통과한다. */
test('문턱 미달 무발화는 자기 WAV 를 들고 간다 — ⓐ입 안 뗌과 ⓑ작게 말함이 갈린다 (①-2)', () => {
  const 작게말함 = 제출사건(항목({ status: 'abandoned' }), 'voice/x/작게말함.wav');
  assert.equal(작게말함.event_type, 'session.abandoned', '제출로 승격되면 안 된다');
  assert.equal(작게말함.submission.audio_ref, 'voice/x/작게말함.wav', '올린 파일을 가리키지 않으면 고아다');
  assert.equal(작게말함.submission.body_original, undefined, '낸 답은 여전히 없다');
  assert.ok(검증(작게말함, 계약).ok, 검증(작게말함, 계약).오류들.join(' · '));

  const 입안뗌 = 제출사건(항목({ status: 'abandoned', audio: null }));
  assert.notDeepEqual(입안뗌.submission, 작게말함.submission, '두 무발화가 같은 행이면 사후에 못 가른다');
});

test('무발화 두 호흡이 서로 다른 행이 된다 — 낭독 이탈 ≠ 자유발화 포기 (①-6)', () => {
  const 낭독 = 제출사건(항목({ step: '따라', status: 'abandoned', audio: null }));
  const 자유 = 제출사건(항목({ step: '답하기', status: 'abandoned', audio: null }));
  assert.equal(낭독.submission.task_format, '낭독');
  assert.equal(자유.submission.task_format, '자유발화');
  assert.notEqual(낭독.submission.task_format, 자유.submission.task_format);
  for (const e of [낭독, 자유]) assert.ok(검증(e, 계약).ok, 검증(e, 계약).오류들.join(' · '));
});

test('형식을 모르면 무발화도 안 보낸다 — 지어내면 그 자리가 영원히 거짓이다', () => {
  const 형식없음 = 재료();
  형식없음.형식 = { 따라: null, 답하기: null };
  assert.equal(제출사건(항목({ status: 'abandoned', audio: null, task_meta: 형식없음 })), null);
});

test('재시도(retried)도 제출 사건이다 — 자기수정이 서버에 남는다', () => {
  const e = 제출사건(항목({ status: 'retried', attempt: 2 }), 'voice/x/1.m4a');
  assert.equal(e.event_type, 'submission.created');
  assert.equal(e.payload.attempt_no, 2);
  assert.ok(검증(e, 계약).ok);
});

/* ✅ **유호님 확정 2026-08-07 = ⓑ**(C0 §4-3 ①) — 이 검사는 뒤집혔다. 08-07 실왕복에서 갓
 *   등록한 학생이 `필수 누락: level_snapshot` 으로 막혔고, 개원 첫 주(반 배정 전)가 정확히 그
 *   상태다. §4-1 이 급수를 요구한 이유가 「그때 화면이 알던 값을 그때 적는 것이 유일하게
 *   정확하다」이므로, 화면이 아무것도 몰랐으면 `null` 이 그 값이다.
 *   🔑 앱이 여기서 지는 몫은 **키를 빠뜨리지 않는 것**이다(`화면과제` 가 `|| null` 로 못박는다) —
 *   키 누락은 계속 400 이고, 그 경계의 회귀는 `tests/이벤트검증.test.js` 의 ⓑ 네 벌이 진다. */
test('ⓑ 배정에 급수가 없어도 제출은 나간다 — 첫 발화 기준선을 소급 불가로 잃지 않는다', () => {
  const e = 제출사건(항목({ task_meta: 재료({ level_snapshot: null }) }), 'voice/x/1.m4a');
  assert.equal(e.level_snapshot, null, '키가 사라지면 서버가 400 을 낸다');
  const v = 검증(e, 계약);
  assert.equal(v.ok, true, v.오류들.join(' · '));
});

test('capture_meta 는 app 만 — 잰 값은 서버 몫이다(C0 §4-2)', () => {
  const e = 제출사건(항목(), 'voice/x/1.m4a');
  assert.deepEqual(Object.keys(e.submission.capture_meta), ['app']);
  assert.ok(검증(e, 계약).ok);
  // 탐지력: `server` 를 얹으면 앱 주체 검증이 막는다(위조 방지가 실제로 도는지 여기서 잰다).
  e.submission.capture_meta.server = { sample_rate: 16000 };
  assert.equal(검증(e, 계약).ok, false, '앱이 잰 값을 선언하면 그 행은 관측이 아니라 주장이 된다');
});

test('내용물이 하나도 없으면 검증이 막는다 — 빈 제출 행을 만들지 않는다', () => {
  const e = 제출사건(항목({ audio: null, text: null }));
  assert.equal(검증(e, 계약).ok, false);
});

/* ── 한 앉음을 묶는 고리 (P0 §3-1 ④) ────────────────────────────────
 * 「②와 ③이 같은 세션에서 쌍으로 저장된다」는 **그 순간에만** 알 수 있다. 안 실어 보내면
 * 나중에 남는 근거가 `task_ref`(그날 배정)뿐인데, 그건 아침에 ②·저녁에 ③ 을 낸 날과
 * 한 흐름으로 낸 날을 같은 모양으로 만든다 — 소급 복구가 안 된다.
 * (`흐름값` 은 위 `항목` 기본값과 같은 상수다 — c9 부터 공통 필수라 기본이 들고 있다.) */

test('②③이 한 흐름이면 correlation_id 가 같고 task_format 은 다르다', () => {
  const 쌍 = ['따라', '답하기'].map((step) =>
    제출사건(항목({ step, id: `${날짜}-${step}-1`, correlation_id: 흐름값 }), `voice/x/${step}.m4a`));
  assert.equal(쌍[0].correlation_id, 흐름값);
  assert.equal(쌍[1].correlation_id, 흐름값);
  assert.notEqual(쌍[0].submission.task_format, 쌍[1].submission.task_format);
  for (const e of 쌍) assert.ok(검증(e, 계약).ok, 검증(e, 계약).오류들.join(' · '));
});

/* 무발화도 그 앉음의 일부다 — 빼면 「두 번 막히고 세 번째에 말했다」가 흐름 밖으로 흩어지고,
 * 이탈 예측(S1-6)이 보는 것이 「막힌 앉음」이 아니라 「막힌 학생」이 된다. */
test('무발화(session.abandoned)도 같은 흐름을 든다', () => {
  const e = 제출사건(항목({ status: 'abandoned', audio: null, correlation_id: 흐름값 }));
  assert.equal(e.correlation_id, 흐름값);
  assert.ok(검증(e, 계약).ok);
});

/* c9 판정 뒤집힘 — 예전엔 「없으면 `null` 로 나간다」였다(계약이 선택이었으므로).
 * 이제 공통 필수라 `null` 은 서버가 400 으로 돌려주고, 그 항목은 큐에서 영영 재시도한다.
 * 그래서 **아예 안 만든다** — 지어낸 키로 채우지도 않는다(흩어진 것을 한 앉음이라 거짓말한다). */
test('흐름이 없으면 사건을 안 만든다 — 400 루프도, 지어낸 앉음도 만들지 않는다', () => {
  assert.equal(제출사건(항목({ correlation_id: null }), 'voice/x/1.m4a'), null);
  assert.equal(제출사건(항목({ correlation_id: undefined, status: 'abandoned', audio: null })), null);
});

/* 그때 학생이 본 판을 되싣는다 (절단문서 ①-3) — `task_ref` 는 가리키기만 하고 문항은 개정된다. */
test('제출 사건은 화면이 그린 스냅샷을 그대로 되싣는다', () => {
  const e = 제출사건(항목(), 'voice/x/1.m4a');
  assert.deepEqual(e.submission.task_snapshot, 재료().task_snapshot);
  assert.equal(따라말하기문장(e.submission.task_snapshot), 도입.따라말하기);

  // 판을 못 들고 온 옛 큐 항목은 안 나간다 — 서버가 400 을 낼 사건을 만들지 않는다.
  const 판없음 = { ...재료() };
  delete 판없음.task_snapshot;
  assert.equal(제출사건(항목({ task_meta: 판없음 }), 'voice/x/1.m4a'), null);
});

/* ── 날짜 경계의 정본은 한 곳이다 (절단문서 ①-14) ───────────────────
 * 「몽골 시간대」가 네 곳에 각자 적혀 있었다: `lib/오늘과제.js` 의 `시간대`,
 * `deliver`·`tasks` 의 SQL 리터럴, 그리고 `말하기화면` 의 **기기 시계**.
 * 갈라진 날 증상은 조용하다 — 배치는 오늘에 쓰고 조회는 어제를 세며, 앱은
 * `다음시도번호` 를 남의 날 바구니에서 세어 첫 시도를 `attempt_no: 2` 로 내보낸다.
 * 그 값은 서버 행에 박혀 사후에 못 고친다(소급 불가).
 *
 * 세 맹점:
 *   ① 사람이 실제로 쓰는 표기 = IANA 이름 문자열 그대로.
 *   ② 탐지력은 **픽스처**가 진다 — 실저장소에는 「사본이 0인가」만 건다.
 *   ③ 자기 처방 — 차단 사유가 시키는 수리(`시간대` 를 가져다 쓴다)는 리터럴을
 *      안 적으므로 이 검사를 그대로 통과한다.
 * 🔑 `tools/` 는 일부러 뺀다: `배달왕복시험` 은 **대조자**라 자기 리터럴을 들어야
 *   `시간대` 가 틀린 날 같이 틀려서 초록이 되는 일이 없다(그 파일 주석에 근거를 적어 뒀다). */
const 시간대사본 = /Asia\/Ulaanbaatar/;
const 기기시계 = /getFullYear\(\)|getMonth\(\)|getDate\(\)|toLocaleDateString/;
const 출하뿌리 = ['src', 'lib', path.join('supabase', 'functions')];

function 소스들(뿌리) {
  const 나온것 = [];
  const 훑기 = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) 훑기(p);
      else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(e.name)) 나온것.push(p);
    }
  };
  훑기(path.join(ROOT, 뿌리));
  return 나온것;
}

test('픽스처 — 이 검사가 리터럴 사본과 기기 시계를 실제로 잡는다', () => {
  assert.ok(시간대사본.test("at time zone 'Asia/Ulaanbaatar'"));
  assert.ok(기기시계.test('`${d.getFullYear()}-${p(d.getMonth() + 1)}`'));
  // 처방(= 시간대를 가져다 쓴다)은 통과해야 한다 — 못 따를 처방은 우회를 정상 통로로 만든다.
  assert.equal(시간대사본.test('const { 몽골날짜, 시간대 } = 과제모듈;'), false);
  assert.equal(기기시계.test('let 그날 = 몽골날짜();'), false);
});

test('출하 코드에서 시간대를 손으로 적는 곳은 lib/오늘과제.js 하나다', () => {
  const 정본 = path.join(ROOT, 'lib', '오늘과제.js');
  const 사본 = 출하뿌리.flatMap(소스들)
    .filter((p) => p !== 정본 && 시간대사본.test(fs.readFileSync(p, 'utf8')))
    .map((p) => path.relative(ROOT, p));
  assert.deepEqual(사본, [],
    '시간대를 손으로 적었다 — `lib/오늘과제.js` 의 `시간대` 를 가져다 써라(SQL 에도 ${시간대} 로 넣는다).');
});

test('앱은 날짜를 기기 시계로 끊지 않는다 — 정본은 몽골 달력이다', () => {
  const 화면 = fs.readFileSync(path.join(ROOT, 'src', '말하기화면.js'), 'utf8');
  assert.equal(기기시계.test(화면), false,
    '기기 시계로 날짜를 조립했다 — `몽골날짜()` 를 써라(attempt_no 가 남의 날 바구니에서 세어진다).');
  /* 🔴 `/몽골날짜/` 로는 부족하다 — **import 줄이 그대로 매치된다.** 호출을 지우고 날짜를
   *   손으로 박아도 초록이었다(변이 ④로 실측). 부르는 것까지 봐야 검사가 성립한다. */
  assert.ok(/몽골날짜\(/.test(화면), '`몽골날짜()` 를 안 부른다 — 서버를 못 받은 갈래의 날짜가 없다.');
});

/* ── c9 생산자 배선 — 「사건을 만드는 함수」와 「그것을 부르는 자리」는 다르다 ──────
 * 🔴 `열람사건()` 이 아무리 초록이어도 **아무도 안 부르면 수집은 0**이고, 그 상태의 증상은
 *   「열람이 한 건도 안 쌓인다」뿐이라 아무 데서도 안 빨개진다 — 새는 방향은 언제나 통과다.
 *   이 사건이 태어난 이유가 정확히 그 모양이었다(생산자 0 · `lib/이벤트검증.js` 생산자 장부).
 * ⚠ 천장을 알고 쓴다: RN 렌더러 없이는 **호출 여부 자체**를 못 재므로 소스 층에서 「어느
 *   콜백에 붙었나」까지만 본다(`tests/마이크권한.test.js` 통로 검사와 같은 자리).
 * 🔑 재는 것이 두 개다 — ⓐ카드에 넘겼는가 ⓑ **`onDone` 에만** 붙었는가. ⓑ 가 핵심이다:
 *   `onError` 에도 붙으면 「들었다」가 「띄웠다」로 조용히 뜻을 갈아탄다(재생이 안 된 기기도
 *   흐름은 진행되므로 그 갈래는 늘 돈다). */
const 열람배선 = (소스) => {
  const 시작 = /\bonDone:\s*\(\)\s*=>\s*\{/.exec(소스);
  const 끝 = /\bonError:\s*\(\)\s*=>\s*\{/.exec(소스);
  if (!시작 || !끝 || 끝.index < 시작.index) return { 넘김: false, 완료: false, 오류: true };
  return {
    넘김: /들었음알리기=\{열람알리기\}/.test(소스),
    완료: 소스.slice(시작.index, 끝.index).includes('들었음알리기'),
    // 🔴 `onError` 갈래는 **끝을 모른다** — 뒤 전부를 본다(닫는 괄호를 세는 순간 파서가 된다).
    오류: 소스.slice(끝.index).includes('들었음알리기'),
  };
};

test('탐지력 픽스처 — 배선이 빠지거나 엉뚱한 콜백에 붙으면 실제로 잡는다', () => {
  const 판 = (본문) => `<듣기카드 ${본문.넘김 ? '들었음알리기={열람알리기}' : ''} />
    onDone: () => { set들었다(true); ${본문.완료 ? '들었음알리기();' : ''} },
    onError: () => { set들었다(true); ${본문.오류 ? '들었음알리기();' : ''} },`;
  assert.deepEqual(열람배선(판({ 넘김: true, 완료: true, 오류: false })),
    { 넘김: true, 완료: true, 오류: false }, '온전한 배선을 통과로 못 읽으면 아래가 무의미하다');
  assert.equal(열람배선(판({ 넘김: false, 완료: true })).넘김, false, '프롭이 빠진 것을 못 잡는다');
  assert.equal(열람배선(판({ 넘김: true, 완료: false })).완료, false, '호출이 빠진 것을 못 잡는다');
  assert.equal(열람배선(판({ 넘김: true, 완료: true, 오류: true })).오류, true, 'onError 갈래를 못 잡는다');
  assert.deepEqual(열람배선('콜백이 아예 없다'), { 넘김: false, 완료: false, 오류: true },
    '모양을 못 읽었으면 통과가 아니라 미측정이다 — 그때는 빨개져야 한다');
});

test('🔴 실 화면 — 열람은 재생이 끝난 자리에만 붙어 있다 (c9 생산자)', () => {
  const r = 열람배선(fs.readFileSync(path.join(ROOT, 'src', '말하기화면.js'), 'utf8'));
  assert.equal(r.넘김, true, '듣기카드에 `들었음알리기` 를 안 넘긴다 — 카드가 알릴 길이 없다');
  assert.equal(r.완료, true, '재생 완료(onDone)에서 안 알린다 — 열람이 한 건도 안 쌓인다');
  assert.equal(r.오류, false, '재생 **실패**에서도 알린다 — 귀에 닿은 것이 없는데 열람으로 적힌다');
});

/* ── ②-20 `/tasks` 응답이 답안지가 되지 않는다 ────────────────────────
 * 계약이 `task_snapshot` 안에 정답을 두었는데(C0 §4-1 예시 · L0 §3-3 필수 4) 서버는 그 객체를
 * 통째로 학생에게 준다. 오늘 새는 양은 0 이다 — 생산자가 따라말하기뿐이라서지 통로가 막혀서가
 * 아니다. 그래서 **탐지력은 픽스처가 진다**(맹점 ②: 버그가 아직 있을 것을 요구하지 않는다). */
const 퀴즈판 = () => ({
  ver: 1,
  날짜,
  지시문: '알맞은 것을 고르세요',
  문항: '밥을 ( ) 먹었어요',
  보기: ['먹다', '먹고'],
  정답: '먹고',
  호흡: [{ 차례: 2, 무엇: '따라 말하기', task_format: '낭독', 문장: '가', 출처: '도입', 정답: '가' }],
});

test('②-20 픽스처 — 정답은 최상위에서도 호흡 안에서도 안 나간다', () => {
  const 판 = 학생판스냅샷(퀴즈판());
  assert.equal('정답' in 판, false, '최상위 정답이 그대로 나갔다 — 응답이 답안지다.');
  assert.equal('정답' in 판.호흡[0], false, '호흡 안 정답이 그대로 나갔다.');
  // 허용된 것은 손대지 않는다(과잉 차단이면 화면이 빈다).
  assert.equal(판.ver, 1);
  assert.equal(판.날짜, 날짜);
  assert.deepEqual(판.호흡[0], { 차례: 2, 무엇: '따라 말하기', task_format: '낭독', 문장: '가', 출처: '도입' });
});

test('②-20 허용 목록이다 — 모르는 키는 적어 두지 않아도 기본 차단', () => {
  /* 🔑 이 검사가 차단 목록과 허용 목록을 가른다. 차단 목록이면 `힌트` 는 이름이 없어 그대로
   *   새고 증상은 「통과」다. 허용 목록이면 기본값이 「안 나감」이고 증상은 화면이 비는 것이다. */
  const 판 = 학생판스냅샷({ ...퀴즈판(), 힌트: '받침을 보세요', 채점기준: { 만점: 1 } });
  assert.equal('힌트' in 판, false);
  assert.equal('채점기준' in 판, false);
});

test('②-20 원본은 안 건드린다 — 거른 판을 만들 뿐이다', () => {
  const 원본 = 퀴즈판();
  학생판스냅샷(원본);
  assert.equal(원본.정답, '먹고', '입력을 파괴했다 — 배정 행에 쓸 원본이 함께 지워진다.');
  assert.equal(원본.호흡[0].정답, '가');
});

test('②-20 살아있는 생산자는 한 글자도 안 줄어든다 — 목록이 좁으면 화면이 빈다', () => {
  /* 반대 방향이다. 위 검사들은 「새면 빨갛다」를 재고, 이건 「너무 막아도 빨갛다」를 잰다.
   *   실제 배정이 통과 못 하면 학생 화면이 비는데 그 증상은 서버 로그에 안 남는다. */
  for (const 재료 of [{ 날짜, 첫날: true }, { 날짜, 교정문: '고친 문장' }, { 날짜, 전날문장: '어제 문장' }]) {
    const snap = 오늘과제(재료).task_snapshot;
    assert.deepEqual(학생판스냅샷(snap), snap, `배정이 필터에서 깎였다(${JSON.stringify(재료)}).`);
  }
});

test('②-20 걸러지지 않은 객체가 응답에 실려 나가지 않는다', () => {
  /* 필터는 최상위와 호흡 두 층만 본다. 허용 키 **안쪽**에 객체가 생기면 그 속은 아무도 안 보므로,
   *   그날 정답이 거기 숨으면 다시 샌다. 그래서 「거른 층 밖의 객체」 자체를 금지한다 —
   *   생기는 날 이 검사가 빨개지고, 목록에 층을 하나 더 낼지 그 자리에서 정하게 된다. */
  const 객체인가 = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const 평평한가 = (o, 자리) => Object.entries(o).forEach(([k, v]) => {
    const 값들 = Array.isArray(v) ? v : [v];
    값들.forEach((x) => assert.equal(객체인가(x), false,
      `${자리}.${k} 안에 거르지 않은 객체가 있다 — 학생공개키에 그 층을 내라(②-20).`));
  });
  const 판 = 학생판스냅샷(오늘과제({ 날짜, 첫날: true }).task_snapshot);
  평평한가({ ...판, 호흡: undefined }, '최상위');
  판.호흡.forEach((h, i) => 평평한가(h, `호흡[${i}]`));
});

test('②-20 목록이 비어 있지 않다 — 빈 목록은 무엇이든 통과처럼 보인다', () => {
  assert.ok(학생공개키.최상위.length > 0 && 학생공개키.호흡.length > 0);
});

test('②-20 `/tasks` 가 실제로 그 필터를 거쳐 응답한다', () => {
  /* 목록만 서고 호출부가 안 갈리면 증상이 0 이다(계약·회귀 다 초록인데 라이브만 샌다).
   *   그래서 출하 통로를 직접 읽는다 — 이 저장소가 F073·변이 ④ 로 이미 겪은 자리다. */
  const 통로 = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'tasks', 'index.ts'), 'utf8');
  assert.ok(/task_snapshot:\s*학생판스냅샷\(/.test(통로),
    '`/tasks` 가 필터를 안 거친다 — `task_snapshot: 학생판스냅샷(r.task_snapshot)` 로 내보내라.');
  assert.equal(/task_snapshot:\s*r\.task_snapshot\b/.test(통로), false,
    '스냅샷을 통째로 돌려주는 줄이 남아 있다(②-20).');
});

/* 🔴 **c9 재료가 응답에서 빠지는 것을 파일 층에서 잡는 유일한 자리**(2026-08-07 변이 ⑥ 이
 *   실측한 구멍). 위 `열람배선` 은 앱만 보고, `열람사건` 회귀는 인자를 받아 도므로 **서버가
 *   그 칸을 안 실어도 둘 다 초록**이다 — 증상은 「열람이 한 건도 안 쌓인다」뿐이고 그건
 *   소급이 안 된다(개원 첫 주가 손실 창).
 * ⚠ 천장: 값이 **맞는지**는 못 잰다(배포된 판이 진짜 그 사건 id 를 싣는가는 `tools/배달왕복
 *   시험.js` ⑧ 이 진다). 여기가 잡는 것은 「칸이 통째로 사라진 것」 하나다.
 * 🔑 SQL 별칭만 봐서는 안 된다 — 변이 ⑥ 은 응답 줄만 지웠고 별칭은 남겼다. 둘을 **잇는 줄**을 본다. */
test('🔴 `/tasks` 가 배달 사건의 event_id 를 실제로 실어 보낸다 (c9 생산자의 유일한 재료)', () => {
  const 통로 = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'tasks', 'index.ts'), 'utf8');
  assert.ok(/event_id:\s*r\.intervention_event_id\b/.test(통로),
    '`intervention.event_id` 가 응답에서 빠졌다 — 앱이 `parent_event_id` 로 쓸 값이 사라져 `content.viewed` 생산자가 다시 0이 된다(C0 §4-3 ①).');
  assert.ok(/개입\.event_id\s+as\s+intervention_event_id/.test(통로),
    '별칭이 사라졌다 — 위 줄이 남아 있어도 값이 늘 `undefined` 라, 증상은 「가리킬 대상이 없다」로 위장된다.');
});
