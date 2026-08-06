/* 이벤트 검증 회귀 — C0 §4-1 이 F0 로 위임한 「이벤트별 필수 집합」의 탐지력을 못박는다.
 *
 * 세 맹점을 의식하고 짰다(CLAUDE.md):
 *   ① 사람이 실제로 쓰는 표기 — 픽스처는 C0 §4-1 예시 구조 그대로다.
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 **픽스처**로 걸고,
 *      실저장소(계약 파일)에는 「지어낸 이름이 없는가」 하나만 건다.
 *   ③ 자기 처방 — 검증이 거부한 이벤트를 그 메시지대로 고치면 통과해야 한다(아래 마지막 케이스).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const { 검증, 공통필수, 이벤트별필수, 서버칸, 서버사건 } = require('../lib/이벤트검증.js');

/* C0 §4-1 예시 그대로 — 서버가 채우는 칸은 뺐다(앱이 보내는 모양). */
const 정상제출 = () => ({
  idempotency_key: 'b6f1c0a2-0000-4000-8000-000000000001',
  event_type: 'submission.created',
  task_type: '숙제제출',
  occurred_at: '2026-08-05T13:20:11.412Z',
  level_snapshot: 'Lv3',
  submission: {
    task_ref: 'hw-2026-08-05-3',
    task_format: '자유발화',
    body_original: '어제 친구를 만나서 밥을 먹었어요',
  },
});

test('정상 제출은 통과한다', () => {
  const r = 검증(정상제출(), 계약);
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

test('공통 필수가 빠지면 각각 잡는다', () => {
  for (const k of 공통필수) {
    const e = 정상제출();
    delete e[k];
    const r = 검증(e, 계약);
    assert.equal(r.ok, false, `${k} 가 빠졌는데 통과했다`);
    assert.ok(r.오류들.some((m) => m.includes(k)), `${k} 를 지목하지 않았다: ${r.오류들}`);
  }
});

test('level_snapshot 은 앱이 보낸다 — 빠지면 거부(오프라인 제출의 급수가 오늘 급수로 덮인다)', () => {
  const e = 정상제출();
  delete e.level_snapshot;
  assert.equal(검증(e, 계약).ok, false);
});

test('서버가 채우는 칸을 앱이 보내면 거부한다 — 위조 방지', () => {
  for (const k of 서버칸) {
    const e = 정상제출();
    e[k] = '위조';
    const r = 검증(e, 계약);
    assert.equal(r.ok, false, `${k} 를 앱이 보냈는데 통과했다`);
  }
});

/* capture_meta 의 두 갈래 — 이 넷이 함께 서야 「관측」이 관측으로 남는다.
 * 이 칸이 생긴 이유가 「AGC off 였다는 증거가 행에 없다」였는데, 앱이 그 증거를 스스로 적을 수
 * 있으면 c6 이 이 열을 만든 이유가 통째로 사라진다. */
test('앱이 capture_meta.server 를 보내면 거부한다 — 관측이 주장으로 바뀌는 자리', () => {
  const e = 정상제출();
  e.submission.capture_meta = { app: { agc: 'off' }, server: { sample_rate: 16000, agc_verified: false } };
  const r = 검증(e, 계약);
  assert.equal(r.ok, false, '앱이 잰 척한 값이 통과했다');
  assert.ok(r.오류들.join(' ').includes('capture_meta.server'), `어느 칸인지 안 알려준다: ${r.오류들.join(' / ')}`);
});

test('탐지력 픽스처 — capture_meta.server 가 null 이어도 잡는다 (존재로 재야 한다)', () => {
  const e = 정상제출();
  e.submission.capture_meta = { app: { agc: 'off' }, server: null };
  assert.equal(검증(e, 계약).ok, false, '값으로 재고 있다 — null 로 보내면 뚫린다');
});

test('거짓양성 — app 갈래만 보내는 정상 앱은 그대로 통과한다', () => {
  const e = 정상제출();
  e.submission.capture_meta = { app: { device: 'Pixel 7', agc_requested: 'off', mic: 'bottom' } };
  const r = 검증(e, 계약);
  assert.equal(r.ok, true, `정상 앱을 막았다: ${r.오류들.join(' / ')}`);
});

test('자기 처방 — capture_meta.server 를 빼라는 거부대로 고치면 통과한다', () => {
  const e = 정상제출();
  e.submission.capture_meta = { app: { agc_requested: 'off' }, server: { sample_rate: 16000 } };
  assert.equal(검증(e, 계약).ok, false);
  delete e.submission.capture_meta.server;   // 메시지가 지목한 칸만 뺀다
  const r = 검증(e, 계약);
  assert.equal(r.ok, true, `처방대로 고쳤는데 아직 거부한다: ${r.오류들.join(' / ')}`);
});

test('서버만 만드는 사건을 앱이 보내면 거부한다', () => {
  for (const et of 서버사건) {
    const e = { ...정상제출(), event_type: et };
    const r = 검증(e, 계약).오류들.join(' ');
    assert.ok(r.includes('앱이 만들 수 없는 사건'), `${et} 가 앱에서 통과했다`);
  }
  // 같은 이벤트도 서버 주체로는 통과해야 한다 — 규칙이 주체를 실제로 본다는 증거
  const 서버가 = 검증({ ...정상제출(), event_type: 'task.assigned' }, 계약, { 주체: 'server' });
  assert.ok(!서버가.오류들.some((m) => m.includes('앱이 만들 수 없는')), '주체 구분이 안 먹는다');
});

test('값목록 밖 값은 거부한다 — 오타를 기본값으로 접지 않는다', () => {
  assert.equal(검증({ ...정상제출(), event_type: 'submission.creted' }, 계약).ok, false);
  assert.equal(검증({ ...정상제출(), task_type: '없는통로' }, 계약).ok, false);
  const e = 정상제출();
  e.submission.task_format = '없는형식';
  assert.equal(검증(e, 계약).ok, false);
});

test('task_format 이 빠지면 거부한다 — 나중에 붙이면 낭독과 자유발화를 영영 못 가른다', () => {
  const e = 정상제출();
  delete e.submission.task_format;
  assert.equal(검증(e, 계약).ok, false);
});

test('제출에 내용물이 하나도 없으면 거부, 소리만 있어도 통과', () => {
  const 빈 = 정상제출();
  delete 빈.submission.body_original;
  assert.equal(검증(빈, 계약).ok, false, '글도 소리도 없는데 통과했다');

  const 소리만 = 정상제출();
  delete 소리만.submission.body_original;
  소리만.submission.audio_ref = 'voice/l-1/abc.wav';
  assert.equal(검증(소리만, 계약).ok, true, '소리만 있는 제출이 막혔다');
});

test('선택 로그는 표시 순서·추천 여부까지 요구한다 — 없으면 선호와 「밀어준 것」이 안 갈린다', () => {
  const 고름 = {
    idempotency_key: 'b6f1c0a2-0000-4000-8000-000000000002',
    event_type: 'choice.selected',
    occurred_at: '2026-08-05T13:21:00.000Z',
    level_snapshot: 'Lv1',
    payload: { options_shown: ['가', '나'], position: 1, recommended_option: '가', selected_option: '가' },
  };
  assert.equal(검증(고름, 계약).ok, true, 검증(고름, 계약).오류들.join(' / '));

  for (const k of ['options_shown', 'position', 'recommended_option']) {
    const e = JSON.parse(JSON.stringify(고름));
    delete e.payload[k];
    assert.equal(검증(e, 계약).ok, false, `${k} 없이 통과했다`);
  }

  // 무반응·전량거절도 「고른 것」 자리를 대신한다 — 셋 다 다른 사건이다
  for (const 대체 of ['skipped', 'rejected_all']) {
    const e = JSON.parse(JSON.stringify(고름));
    delete e.payload.selected_option;
    e.payload[대체] = true;
    assert.equal(검증(e, 계약).ok, true, `${대체} 가 막혔다`);
  }
});

/* ── 실저장소 검사: 지어낸 이름을 못 쓰게 한다 ───────────────────────────
 * 이 하나만 실물(계약 파일)에 건다. 여기가 빨개지면 검증기가 계약에 없는 이름을
 * 필수로 걸었다는 뜻이고, 그러면 앱은 못 보내는데 검증은 전건 거부한다. */
test('필수로 건 이름은 전부 계약에 실재한다 — 지어내기 금지', () => {
  const 실재 = new Set();
  for (const v of Object.values(계약.learning_events.필드 || {})) {
    if (Array.isArray(v)) v.forEach((n) => 실재.add(n));
  }
  assert.ok(실재.size > 10, '계약 필드 목록을 못 읽었다(통과와 미실행이 같은 모양이 된다)');

  const 이름 = (경로) => 경로.split('.').pop();
  const 검사대상 = [];
  for (const 요구들 of Object.values(이벤트별필수)) {
    for (const 요구 of 요구들) (Array.isArray(요구) ? 요구 : [요구]).forEach((p) => 검사대상.push(p));
  }
  검사대상.push(...공통필수);

  const 없는것 = [...new Set(검사대상.map(이름))].filter((n) => !실재.has(n));
  assert.deepEqual(없는것, [], `계약에 없는 이름을 필수로 걸었다: ${없는것.join(', ')}`);
});

test('서버 칸 목록도 계약에 실재하는 이름이다', () => {
  const 실재 = new Set();
  for (const v of Object.values(계약.learning_events.필드 || {})) {
    if (Array.isArray(v)) v.forEach((n) => 실재.add(n));
  }
  const 없는것 = 서버칸.filter((n) => !실재.has(n));
  assert.deepEqual(없는것, [], `서버 칸에 계약에 없는 이름: ${없는것.join(', ')}`);
});

/* c8 — 교정 사건은 「어느 교정인가」 없이는 통과하지 못한다 (P0 §10-A-11 해소).
 * c7 까지 `correction.viewed` 의 필수는 **빈 배열**이었다: 가리킬 이름이 계약에 없어서
 * 지어내지 않고 비워 둔 자리다. 그 상태에서는 열람 사건이 「누가 무언가를 봤다」까지만
 * 남고 무엇을 봤는지가 없어, 「학습이 일어났다」의 유일한 직접 신호(S1-8)가 학생 단위
 * 집계로만 존재한다 — 그리고 그 고리는 **그때만** 얻을 수 있어 소급 복원이 안 된다. */
const 교정사건 = (type) => ({
  idempotency_key: 'b6f1c0a2-0000-4000-8000-00000000000c',
  event_type: type,
  occurred_at: '2026-08-07T04:00:00.000Z',
  level_snapshot: 'Lv3',
  correction_id: '9a7d3f10-0000-4000-8000-0000000000c1',
  ...(type === 'correction.responded' ? { payload: { learner_response: '채택' } } : {}),
});

test('c8 — 교정 열람·응답은 correction_id 없이 거부된다 (양방향)', () => {
  for (const type of ['correction.viewed', 'correction.responded']) {
    const 있음 = 교정사건(type);
    assert.equal(검증(있음, 계약).ok, true,
      `${type} 이 correction_id 를 실었는데 거부됐다: ${검증(있음, 계약).오류들?.join(' / ')}`);

    const 없음 = 교정사건(type);
    delete 없음.correction_id;
    assert.equal(검증(없음, 계약).ok, false,
      `${type} 이 어느 교정인지 없이 통과했다 — 그 고리는 나중에 못 만든다`);
  }
});

test('c8 — 필수로 건 correction_id 는 계약에 실재하는 이름이다 (지어낸 이름 금지)', () => {
  // 이 규칙은 파일 위쪽 주석이 프로즈로 적어 둔 것이고, 없는 이름을 필수로 걸면
  // 「엄격해 보이는데 아무것도 안 통과하는」 상태가 된다 — c7 이 비워 뒀던 이유 그 자체다.
  const 실재 = new Set();
  for (const v of Object.values(계약.learning_events.필드 || {})) {
    if (Array.isArray(v)) v.forEach((n) => 실재.add(n));
  }
  assert.ok(실재.has('correction_id'),
    'correction_id 가 계약 필드 목록에 없다 — 검증기만 올리고 계약을 안 올렸다');
});

test('자기 처방 — 거부 메시지대로 고치면 통과한다', () => {
  const e = 정상제출();
  delete e.submission.task_format;
  delete e.task_type;
  const r1 = 검증(e, 계약);
  assert.equal(r1.ok, false);
  // 메시지가 지목한 칸을 채운다
  e.task_type = 계약.learning_events.값목록.task_type[0];
  e.submission.task_format = 계약.learning_events.값목록.task_format[0];
  const r2 = 검증(e, 계약);
  assert.equal(r2.ok, true, `처방대로 고쳤는데 아직 거부한다: ${r2.오류들.join(' / ')}`);
});
