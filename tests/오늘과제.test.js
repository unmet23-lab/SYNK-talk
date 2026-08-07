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
const { 몽골날짜, 멱등키, 오늘과제, 따라말하기문장, 화면과제, 제출사건, 도입 } = require('../lib/오늘과제.js');
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
    intervention: { intervention_id: '22222222-2222-4222-8222-222222222222', output_text: '오늘 온 말' },
    ...덧,
  };
};
const 폴백 = { id: 'seed-beginner-v1', 본문: '고정 본문', 핵심문장: '고정 문장', 질문: '고정 질문', 선택지: ['가', '나'] };

test('서버 과제를 받으면 화면이 그것을 쓴다 — ②③이 스냅샷에서 그대로 온다', () => {
  const v = 화면과제(서버항목(), 폴백);
  assert.equal(v.출처, '서버');
  assert.equal(v.사유, null);
  assert.equal(v.편지.핵심문장, 도입.따라말하기, '②는 스냅샷의 문장이다');
  assert.equal(v.편지.질문, 도입.답하기, '③은 스냅샷의 프롬프트다');
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
  assert.equal(e.submission.audio_ref, undefined, '내용물은 여전히 없다');
  assert.ok(검증(e, 계약).ok, 검증(e, 계약).오류들.join(' · '));
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
