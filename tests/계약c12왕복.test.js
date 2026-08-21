/* c12 검증기 왕복 — 설계 §12-21 「c12 검증기 왕복」(G1) 의 네 갈래를 그대로 잰다:
 *   ① ver=2 + 3칸 **통과** ② 목록 밖 이름 **거절** ③ ver=1 **무결** ④ **값 검증**(D4 —
 *   목록 밖 «값»은 거절 · **키 부재는 거절 아님**).
 *
 * 다섯째 갈래는 이 저장소가 더했다 — **실물 조립기 산출이 화이트리스트를 지난다.**
 *   ⑧(payload 화이트리스트)은 c12 의 «신규» 동작이라, 켜는 날 기존 통로가 깨지는 방향이
 *   유일한 위험이다(08-21 전수 실측으로 `compose_meta`·`round_id` 가 목록 밖 실물로 잡혀
 *   계약에 올라갔다). 조립기 산출을 직접 태우면 그 실측이 회귀가 된다 — 앞으로 조립기가
 *   새 키를 내면 여기가 빨개져 「계약 개정이 먼저다」를 기계가 말한다.
 *
 * ⚠ 탐지력은 픽스처로 건다(이벤트검증.test.js 머리말 ②와 같은 규칙) — 실저장소 검사는
 *   「계약에 목록이 실재하고 검증기가 그것을 읽는다」까지다. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const { 검증 } = require('../lib/이벤트검증.js');
const { 선택payload, 보기세우기 } = require('../lib/선택로그.js');
const { 시험payload } = require('../lib/시험결과.js');

/* 서버가 배달 트랜잭션 안에서 만드는 모양 — 서버사건이라 주체 'server' 로 태운다.
 * (앱 주체로 태우면 ② 「앱이 만들 수 없는 사건」이 먼저 울려 payload 층을 못 잰다.) */
const 배달행 = (payload) => ({
  idempotency_key: 'b6f1c0a2-0000-4000-8000-00000000c120',
  event_type: 'intervention.delivered',
  occurred_at: '2026-08-21T20:10:00.000Z',
  level_snapshot: 'Lv3',
  correlation_id: 'b6f1c0a2-0000-4000-8000-00000000c121',
  payload,
});

// ── ① ver=2 + 3칸 통과 ─────────────────────────────────────────────────────
test('① ver=2 + 생성 3칸이 통과한다 (성공 행 — output_text 동승 · G5 «추가»)', () => {
  const r = 검증(배달행({
    ver: 2,
    generation_outcome: '성공',
    generation_input_text: '[학생 맥락] …요약… [지시] 한 문장을 지어라',
    output_text: '어제 배운 조사를 써서 주말 계획을 말해 보세요.',
  }), 계약, { 주체: 'server' });
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

test('① 검문탈락 행은 gate_failed 와 짝으로 통과한다', () => {
  const r = 검증(배달행({
    ver: 2,
    generation_outcome: '검문탈락',
    generation_gate_failed: '한국어비율',
    generation_input_text: '…',
  }), 계약, { 주체: 'server' });
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

// ── ② 목록 밖 이름 거절 ────────────────────────────────────────────────────
test('② payload 목록 밖 이름은 거절된다 — 자유 추가가 아니라 다음 판 개정이다', () => {
  const r = 검증(배달행({ ver: 2, generation_outcome: '성공', 몰래새칸: 1 }), 계약, { 주체: 'server' });
  assert.equal(r.ok, false);
  assert.ok(r.오류들.some((m) => m.includes('몰래새칸')), r.오류들.join(' / '));
});

test('② 앱 통로도 같은 층이다 — submission.created payload 의 목록 밖 이름도 거절', () => {
  const e = {
    idempotency_key: 'b6f1c0a2-0000-4000-8000-00000000c122',
    event_type: 'submission.created',
    task_type: '숙제제출',
    occurred_at: '2026-08-21T13:20:11.412Z',
    level_snapshot: 'Lv3',
    correlation_id: 'b6f1c0a2-0000-4000-8000-00000000c123',
    submission: {
      task_ref: 'hw-2026-08-21-3',
      task_format: '자유발화',
      task_snapshot: { ko: '주말에 뭐 했어요?', 날짜: '2026-08-21' },
      body_original: '주말에 집에서 쉬었어요',
    },
    payload: { ver: 1, attempt_no: 1, 오타키: true },
  };
  const r = 검증(e, 계약);
  assert.equal(r.ok, false);
  assert.ok(r.오류들.some((m) => m.includes('오타키')), r.오류들.join(' / '));
});

// ── ③ ver=1 무결 ───────────────────────────────────────────────────────────
test('③ ver=1 행은 무결이다 — 기존 앱 payload 가 그대로 통과한다', () => {
  const e = {
    idempotency_key: 'b6f1c0a2-0000-4000-8000-00000000c124',
    event_type: 'submission.created',
    task_type: '숙제제출',
    occurred_at: '2026-08-21T13:20:11.412Z',
    level_snapshot: 'Lv3',
    correlation_id: 'b6f1c0a2-0000-4000-8000-00000000c125',
    submission: {
      task_ref: 'hw-2026-08-21-3',
      task_format: '자유발화',
      task_snapshot: { ko: '주말에 뭐 했어요?', 날짜: '2026-08-21' },
      body_original: '주말에 집에서 쉬었어요',
    },
    payload: { ver: 1, attempt_no: 1 },
  };
  const r = 검증(e, 계약);
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

test('③ payload 없는 사건도 그대로다 — 화이트리스트는 있는 payload 만 잰다', () => {
  const e = 배달행(undefined);
  delete e.payload;
  const r = 검증(e, 계약, { 주체: 'server' });
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

// ── ④ 값 검증 (D4) ─────────────────────────────────────────────────────────
test('④ 「이미배정」 은 행에 못 남는다 — 응답 전용 값이 payload 로 오면 거절 (§4-1 산술)', () => {
  const r = 검증(배달행({ ver: 2, generation_outcome: '이미배정' }), 계약, { 주체: 'server' });
  assert.equal(r.ok, false);
  assert.ok(r.오류들.some((m) => m.includes('generation_outcome')), r.오류들.join(' / '));
});

test('④ 목록 밖 outcome 값은 거절 — 새 자유 문자열을 만들지 않는다 (§4-2)', () => {
  const r = 검증(배달행({ ver: 2, generation_outcome: 'PAYLOAD_TOO_LARGE' }), 계약, { 주체: 'server' });
  assert.equal(r.ok, false);
});

test('④ 키 부재는 거절이 아니다 — ver=2 라디오·교정 생산자가 3칸 없이 통과한다 (D4 의 몸통)', () => {
  const r = 검증(배달행({ ver: 2, output_text: '오늘의 라디오 미션입니다' }), 계약, { 주체: 'server' });
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

test('④ 짝 규칙의 거짓 방향 — 탈락이 아닌데 gate_failed 가 적히면 거절', () => {
  const r = 검증(배달행({
    ver: 2, generation_outcome: '성공', generation_gate_failed: '길이',
  }), 계약, { 주체: 'server' });
  assert.equal(r.ok, false);
  assert.ok(r.오류들.some((m) => m.includes('검문탈락')), r.오류들.join(' / '));
});

test('④ gate_failed 도 값목록을 진다 — 7값 밖은 거절', () => {
  const r = 검증(배달행({
    ver: 2, generation_outcome: '검문탈락', generation_gate_failed: '너무이상함',
  }), 계약, { 주체: 'server' });
  assert.equal(r.ok, false);
});

// ── ⑤ 실물 조립기 산출 통과 — 화이트리스트가 기존 통로를 안 깬다는 기계 증명 ──
test('⑤ 선택 조립기 산출(choice_dimension 포함)이 화이트리스트를 지난다', () => {
  const 보기 = 보기세우기([
    { option_id: 'intro-daily-1', label: '카페에서 주문하기' },
    { option_id: 'intro-daily-2', label: '길 물어보기' },
  ]);
  assert.ok(보기, '보기세우기가 null 을 냈다');
  const p = 선택payload({ 차원: 'intro_daily', 보기, 고른것: 보기.options_shown[0].option_id, 시작: 100, 끝: 1400 });
  assert.ok(p, '조립기가 null 을 냈다 — 픽스처 재료가 계약을 못 지킨다');
  const e = {
    idempotency_key: 'b6f1c0a2-0000-4000-8000-00000000c126',
    event_type: 'choice.selected',
    occurred_at: '2026-08-21T13:20:11.412Z',
    level_snapshot: 'Lv3',
    correlation_id: 'b6f1c0a2-0000-4000-8000-00000000c127',
    payload: { ver: 1, ...p },
  };
  const r = 검증(e, 계약);
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

test('⑤ 쓰기 계측(compose_meta)·시도 서수가 지난다 — c9 되돌림 키의 실물 무결', () => {
  const e = {
    idempotency_key: 'b6f1c0a2-0000-4000-8000-00000000c128',
    event_type: 'submission.created',
    task_type: '숙제제출',
    occurred_at: '2026-08-21T13:20:11.412Z',
    level_snapshot: 'Lv3',
    correlation_id: 'b6f1c0a2-0000-4000-8000-00000000c129',
    submission: {
      task_ref: 'hw-2026-08-21-3',
      task_format: '쓰기첨삭',
      task_snapshot: { ko: '주말 계획을 써 보세요', 날짜: '2026-08-21' },
      body_original: '주말에 등산을 갈 거예요',
    },
    payload: {
      ver: 1,
      attempt_no: 1,
      compose_meta: { edit_run_count: 3, backspace_chars: 12, compose_ms: 48000, input_burst_max: 9 },
    },
  };
  const r = 검증(e, 계약);
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

test('⑤ 시험 조립기 산출이 지난다 — exam.result 는 서버사건(강사 통로)', () => {
  const 산 = 시험payload({ exam_kind: 'topik_mock', exam_date: '2026-08-15', exam_level: 4 }, { 지금: new Date('2026-08-21T00:00:00Z') });
  assert.ok(산.payload, JSON.stringify(산));
  const e = {
    idempotency_key: 'b6f1c0a2-0000-4000-8000-00000000c12a',
    event_type: 'exam.result',
    occurred_at: '2026-08-21T13:20:11.412Z',
    level_snapshot: 'Lv4',
    correlation_id: 'b6f1c0a2-0000-4000-8000-00000000c12b',
    payload: { ver: 1, ...산.payload },
  };
  const r = 검증(e, 계약, { 주체: 'server' });
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

test('⑤ 라디오 승격기의 round_id 가 지난다 — 원장 참조의 실물 무결', () => {
  const e = {
    idempotency_key: 'b6f1c0a2-0000-4000-8000-00000000c12c',
    event_type: 'quiz.answered',
    task_type: '라디오퀴즈',
    occurred_at: '2026-08-21T13:20:11.412Z',
    level_snapshot: 'Lv3',
    correlation_id: 'b6f1c0a2-0000-4000-8000-00000000c12d',
    payload: { ver: 1, round_id: 'q-084#m2xk1a#-#3f9a2c', selected_option: null, skipped: true },
  };
  const r = 검증(e, 계약, { 주체: 'server' });
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

// ── 실저장소 검사 — 목록이 실재하고 검증기가 그것을 «읽는다» ────────────────
test('계약 payload_허용필드가 실재하고, 목록을 비우면 검증기의 거절이 함께 꺼진다 (원천이 하나라는 증명)', () => {
  assert.ok(Array.isArray(계약.learning_events.payload_허용필드), '계약에 payload_허용필드가 없다');
  assert.ok(계약.learning_events.payload_허용필드.includes('ver'), 'ver 가 목록에 없다 — 모든 payload 가 거절된다');
  /* 목록을 뺀 사본으로 태우면 ⑧ 이 조용히 꺼져야 한다(옛 계약 하위호환) — 이 갈래가 있어야
   * 「검증기가 자기 하드코딩 목록을 읽는다」로 퇴화하는 것을 막는다. */
  const 옛계약 = JSON.parse(JSON.stringify(계약));
  delete 옛계약.learning_events.payload_허용필드;
  const r = 검증(배달행({ ver: 2, 아무키나: 1 }), 옛계약, { 주체: 'server' });
  assert.equal(r.ok, true, '목록 없는 계약에서 화이트리스트가 돌았다 — 원천이 둘이다');
});
