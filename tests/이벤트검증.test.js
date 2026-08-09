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
const { 검증, 공통필수, 널허용, 이벤트별필수, 문턱없음, 선택필드, 생산자, 엔진도달, 도달0상한, 생산자섰는데도달0상한, 서버칸, 서버사건 } = require('../lib/이벤트검증.js');

/* C0 §4-1 예시 그대로 — 서버가 채우는 칸은 뺐다(앱이 보내는 모양). */
const 정상제출 = () => ({
  idempotency_key: 'b6f1c0a2-0000-4000-8000-000000000001',
  event_type: 'submission.created',
  task_type: '숙제제출',
  occurred_at: '2026-08-05T13:20:11.412Z',
  level_snapshot: 'Lv3',
  correlation_id: 'b6f1c0a2-0000-4000-8000-0000000000c1',
  submission: {
    task_ref: 'hw-2026-08-05-3',
    task_format: '자유발화',
    task_snapshot: { ko: '어제 뭐 했어요?', 날짜: '2026-08-05' },
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

/* ── ⓑ 급수 없는 학생 (C0 §4-3 ① · 유호님 확정 2026-08-07) ──────────────────────
 * 🔴 이 네 개가 한 벌이다. 하나만 보면 「완화」와 「ⓑ」가 구분되지 않는다 —
 *   ⓑ 는 **「모른다(`null`)」는 받고 「앱이 빠뜨렸다(키 없음)」는 계속 막는다**이고,
 *   그 경계가 무너지는 방향은 언제나 통과 쪽이다. */
test('ⓑ 급수를 모르는 학생의 제출은 통과한다 — null 이 유일하게 정확한 값이다', () => {
  const e = { ...정상제출(), level_snapshot: null };
  const r = 검증(e, 계약);
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

test('ⓑ 그래도 키는 필수다 — 앱 결손이 「모른다」로 위장해 들어오지 못한다', () => {
  const e = 정상제출();
  delete e.level_snapshot;
  assert.ok(검증(e, 계약).오류들.some((m) => m.includes('level_snapshot')));
});

test('ⓑ undefined 는 「모른다」가 아니다 — JSON 왕복에서 키가 사라져 서버만 400 을 낸다', () => {
  const e = { ...정상제출(), level_snapshot: undefined };
  assert.equal(검증(e, 계약).ok, false, '앱은 통과시켰는데 서버는 막는 상태를 만들면 안 된다');
  // 실제로 사라지는지 여기서 재 둔다 — 이 전제가 깨지면 위 판정의 근거가 없어진다.
  assert.equal('level_snapshot' in JSON.parse(JSON.stringify(e)), false);
});

test('ⓑ 빈 문자열도 아니다 — 「모른다」는 null 하나로만 적는다', () => {
  const e = { ...정상제출(), level_snapshot: '' };
  assert.equal(검증(e, 계약).ok, false);
});

test('ⓑ 완화는 level_snapshot 한 칸뿐 — 나머지 공통 필수는 null 도 막는다', () => {
  /* 🔴 걸러낼 이름을 `널허용` 에서 받으면 **그 집합이 넓어지는 변이를 이 검사가 못 본다**
   *   (가드가 자기 전처리에 눈이 먼다 — 변이 시험에서 실제로 통과해 버렸다).
   *   그래서 이름을 여기 박아 두고 집합 자체를 대조한다. */
  assert.deepEqual([...널허용], ['level_snapshot'], '널허용이 번졌다 — 완화가 계약 밖으로 새고 있다');
  for (const k of 공통필수) {
    if (k === 'level_snapshot') continue;
    const e = { ...정상제출(), [k]: null };
    assert.equal(검증(e, 계약).ok, false, `${k} 가 null 인데 통과했다`);
  }
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

/* C0 §156(c6) — 선택지는 `{option_id, label}`. `option_id` 가 안 바뀌는 조인 키고
 * `label` 은 그때 표시된 문구의 스냅샷이다. */
const 정상선택 = () => ({
  idempotency_key: 'b6f1c0a2-0000-4000-8000-000000000002',
  event_type: 'choice.selected',
  occurred_at: '2026-08-05T13:21:00.000Z',
  level_snapshot: 'Lv1',
  correlation_id: 'b6f1c0a2-0000-4000-8000-0000000000c2',
  payload: {
    options_shown: [{ option_id: 'o1', label: '즉시 자세히 설명' }, { option_id: 'o2', label: '힌트만 제공' }],
    position: 1,
    recommended_option: 'o1',
    selected_option: 'o2',
  },
});

test('선택 로그는 표시 순서·추천 여부까지 요구한다 — 없으면 선호와 「밀어준 것」이 안 갈린다', () => {
  const 고름 = 정상선택();
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

/* 절단문서 ①-8 — 소급 불가. 문구를 값으로 저장하면 문구를 개정하는 날 판을 가로지르는
 * 집계가 끊기고, 그 전에 쌓인 행은 어느 선택지였는지 되짚을 길이 없다.
 * 🔴 이 회귀가 없던 동안 위 픽스처가 **문구 문자열 배열**이었다 — 「검사가 있다」와
 *   「옳게 검사한다」가 같은 초록이었다(①-5 와 같은 형태: 회귀가 계약 반대쪽을 잠갔다). */
test('선택지는 문구가 아니라 불변 id 로 잇는다 (①-8)', () => {
  const 문구형 = 정상선택();
  문구형.payload.options_shown = ['즉시 자세히 설명', '힌트만 제공'];
  문구형.payload.recommended_option = '즉시 자세히 설명';
  문구형.payload.selected_option = '힌트만 제공';
  assert.equal(검증(문구형, 계약).ok, false, '문구 문자열 배열이 통과했다');

  // 배열 모양은 맞는데 **가리키는 이름이 문구**인 경우 — 조인은 여기서 끊긴다
  const 라벨선택 = 정상선택();
  라벨선택.payload.selected_option = '힌트만 제공';
  assert.equal(검증(라벨선택, 계약).ok, false, 'label 을 selected_option 에 넣었는데 통과했다');

  /* 조인 키가 겹치면 「무엇을 골랐나」가 두 곳을 가리킨다.
   * 🔑 가리키는 값은 **소속이 맞게** 둔다 — 안 그러면 소속 검사가 대신 빨개져서 중복 규칙을
   *   지워도 이 케이스가 초록으로 남는다(변이 ②가 실제로 그렇게 살아남았다). */
  const 중복 = 정상선택();
  중복.payload.options_shown = [{ option_id: 'o1', label: '가' }, { option_id: 'o1', label: '나' }];
  중복.payload.recommended_option = 'o1';
  중복.payload.selected_option = 'o1';
  assert.equal(검증(중복, 계약).ok, false, 'option_id 중복이 통과했다');

  // id 만 있고 label 이 없으면 그때 화면에 무엇이 떴는지가 사라진다(스냅샷이 아니다)
  const 라벨없음 = 정상선택();
  라벨없음.payload.options_shown = [{ option_id: 'o1' }, { option_id: 'o2' }];
  assert.equal(검증(라벨없음, 계약).ok, false, 'label 없이 통과했다');

  /* 고른 것을 가리키면서 보여준 것을 안 실으면 분모가 없다 — id 를 무엇에도 못 맞춘다.
   * 🔑 `choice.selected` 로 재면 안 된다 — 거기선 `이벤트별필수` 가 먼저 막아 ⑦ 을 안 거치고,
   *   그러면 ⑦ 의 트리거를 지워도 초록이 남는다(변이 ⑤가 그렇게 살아남았다). */
  const 분모없음 = 정상제출();
  분모없음.payload = { position: 2, selected_option: 'w2' };
  assert.equal(검증(분모없음, 계약).ok, false, 'options_shown 없이 selected_option 만으로 통과했다');

  /* 🔴 G2 통로 — 같은 선택로그 필드를 `choice.selected` 가 아니라 **`submission.created`
   *   payload** 로 보낸다(`발주_게임모듈.md` §362 · `recommended_option` 은 안 싣는다).
   *   검사를 이벤트별로 걸었으면 이 통로가 통째로 샜다. */
  const G2 = 정상제출();
  G2.payload = { options_shown: ['보고서를', '교수님한테'], position: 2, selected_option: '교수님한테' };
  assert.equal(검증(G2, 계약).ok, false, 'submission payload 의 문구형 선택지가 통과했다');

  G2.payload = {
    options_shown: [{ option_id: 'w1', label: '보고서를' }, { option_id: 'w2', label: '교수님한테' }],
    position: 2,
    selected_option: 'w2',
  };
  assert.equal(검증(G2, 계약).ok, true, 검증(G2, 계약).오류들.join(' / '));
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

/* 이벤트별 필수는 **목록에서 파생해** 전건을 잰다 — 필드를 늘리고 검사를 안 늘리면
 * 새 칸만 조용히 안 재진다(`task_snapshot` 이 c8 까지 그 상태였다). 「택1」 묶음은 위
 * 내용물 검사가 따로 지므로 여기선 단일 경로만 본다. */
test('submission.created 의 단일 필수는 하나씩 빠뜨리면 전부 잡힌다', () => {
  const 단일 = 이벤트별필수['submission.created'].filter((r) => !Array.isArray(r));
  assert.ok(단일.length >= 4, `필수 목록이 줄었다(${단일.length}) — 검사가 대상을 잃었다`);
  for (const 경로 of 단일) {
    const e = 정상제출();
    const 칸 = 경로.split('.');
    const 마지막 = 칸.pop();
    delete 칸.reduce((o, k) => o[k], e)[마지막];
    const r = 검증(e, 계약);
    assert.equal(r.ok, false, `${경로} 가 빠졌는데 통과했다`);
    assert.ok(r.오류들.some((m) => m.includes(마지막)), `${경로} 를 지목하지 않았다: ${r.오류들}`);
  }
});

test('서버 칸 목록도 계약에 실재하는 이름이다', () => {
  const 실재 = new Set();
  for (const v of Object.values(계약.learning_events.필드 || {})) {
    if (Array.isArray(v)) v.forEach((n) => 실재.add(n));
  }
  const 없는것 = 서버칸.filter((n) => !실재.has(n));
  assert.deepEqual(없는것, [], `서버 칸에 계약에 없는 이름: ${없는것.join(', ')}`);
});

/* ── 반대방향: 「이름은 있는데 아무도 안 요구한다」 ──────────────────────────
 * 위 두 검사는 **정방향**이다(필수로 건 이름이 계약에 있는가). 그 짝이 비어 있어서
 * `task_snapshot`·`correlation_id`·`skill_ids` 가 셋 다 「계약에 이름은 있는데 아무 사건도
 * 요구하지 않는」 상태로 나란히 서 있었고, 아무 검사도 안 빨개졌다
 * (`docs/_ops/심문_P0_소급불가_절단.md` ① 3·10·13 · 새 앱이라 그 칸들은 **영원히 빈다**).
 *
 * 탐지력은 **픽스처**가 진다(실저장소를 픽스처로 쓰지 않는다 — 지금 초록인 것은 오늘 고쳤기
 * 때문이고, 그 상태를 검사의 근거로 삼으면 다음 번 구멍을 못 잡는다). 실저장소에는
 * 거짓양성만 건다. */
const 미분류 = (계약, { 공통필수, 이벤트별필수, 선택필드, 서버칸 }) => {
  const 이름 = (경로) => 경로.split('.').pop();
  const 요구됨 = new Set(공통필수.map(이름));
  for (const 요구들 of Object.values(이벤트별필수)) {
    for (const 요구 of 요구들) (Array.isArray(요구) ? 요구 : [요구]).forEach((p) => 요구됨.add(이름(p)));
  }
  const 서버 = new Set(서버칸);
  const 실재 = [];
  for (const v of Object.values(계약.learning_events.필드 || {})) {
    if (Array.isArray(v)) 실재.push(...v);
  }
  return 실재.filter((n) => !요구됨.has(n) && !서버.has(n) && !(n in 선택필드));
};

test('반대방향 — 계약 필드는 요구·서버칸·선택장부 셋 중 하나에 반드시 속한다', () => {
  const 정본 = { 공통필수, 이벤트별필수, 선택필드, 서버칸 };

  // ① 탐지력 — 계약에 새 이름이 하나 늘고 아무 데도 안 적히면 그 이름을 지목한다.
  const 픽스처 = JSON.parse(JSON.stringify(계약));
  픽스처.learning_events.필드.내용 = [...픽스처.learning_events.필드.내용, '몰래_늘린_칸'];
  assert.deepEqual(미분류(픽스처, 정본), ['몰래_늘린_칸'],
    '계약에 필드를 늘렸는데 아무 검사도 안 빨개졌다 — 이 장부의 존재 이유가 그것이다');

  // ② 같은 픽스처라도 선택장부에 사유를 적으면 통과한다(자기 처방이 실제로 먹히는가 · F103).
  assert.deepEqual(
    미분류(픽스처, { ...정본, 선택필드: { ...선택필드, 몰래_늘린_칸: '사유' } }), [],
    '차단 사유가 시키는 대로 했는데도 막힌다 — 따를 수 없는 처방은 우회를 정상 통로로 만든다');

  // ③ 실저장소 — 거짓양성만. 여기가 빨개지면 계약에 「누가 채우나」가 안 정해진 이름이 있다.
  assert.deepEqual(미분류(계약, 정본), [],
    '계약에 이름은 있는데 아무도 안 요구하고 사유도 없는 필드가 있다');
});

/* 절단문서 ①-6 — 「추가 필수 0」의 두 뜻을 가른다. `session.abandoned` 는 **정해서 안 건 것**
 * 이었고 `preference.stated` 는 **아직 안 정한 것**이었는데, 둘 다 `[]` 라 코드 주석이 「같은
 * 이유」로 묶어 놨었다. 빈 목록에 사유를 강제하면 다음 빈 껍데기도 조용히 못 지나간다. */
test('추가 필수가 0인 사건은 그 이유가 적혀 있다 — 결론과 미정은 같은 모양이면 안 된다', () => {
  const 빈것 = Object.keys(이벤트별필수).filter((k) => !이벤트별필수[k].length);
  assert.ok(빈것.length > 0, '빈 목록이 하나도 없다 — 이 검사가 아무것도 안 재고 있다');

  const 사유없음 = 빈것.filter((k) => !String(문턱없음[k] || '').trim());
  assert.deepEqual(사유없음, [], `추가 필수가 비었는데 이유가 없다: ${사유없음.join(', ')}`);

  // 반대 방향 — 목록이 채워졌는데 사유만 남으면 낡은 줄이다(두 판정이 갈라진다).
  const 낡음 = Object.keys(문턱없음).filter((k) => (이벤트별필수[k] || []).length);
  assert.deepEqual(낡음, [], `필수가 생겼는데 문턱없음에 남아 있다: ${낡음.join(', ')}`);

  // 「나중에」는 사유가 아니다 — 지금 안 거는 이유를 적게 한다(선택필드 장부와 같은 규칙).
  for (const [k, 사유] of Object.entries(문턱없음)) {
    assert.ok(사유.length >= 30, `${k} 의 사유가 너무 짧다 — 지금 안 거는 이유를 적는다`);
  }
});

/* ── 생산자 장부 — 「누가 이 사건을 내는가」 (전층 감사 2026-08-07 · 발견 A) ──────────
 * 요구·물리·서버가 다 서 있어도 내는 코드가 없으면 그 사건은 영원히 0행이고, 그 0은 어떤
 * 검사에서도 안 빨갛다 — 왕복시험 초록까지 전부 **합성 사건**으로 만든 초록이다. 실측:
 * correction.viewed·responded 가 c8(이름)·DDL(열+FK+CHECK+트리거)·검증기·서버 INSERT 까지
 * 서고도 생산자 0줄인 채 아무 데도 안 빨갰다. 이 장부가 그 부재를 **글**로 만들고,
 * 아래 검사가 장부의 거짓(유령 사건·낡은 파일 지목·빈 사유)을 막는다.
 * 탐지력은 픽스처가 지고 실저장소에는 거짓양성만 건다(반대방향 장부와 같은 규칙). */

/** 파일 지목형 중 「그 파일에 그 사건 문자열이 없는」 항목들 — 낡은 지목의 탐지기.
 * ⚠ 천장: **문자열 실재까지만** 잰다 — 그 파일의 어느 줄이 실제로 내는지는 안 잰다.
 *   그래서 유기적 부패(생산자 삭제·이동 → 문자열 소실)는 잡지만, 우연히 같은 문자열을 가진
 *   엉뚱한 파일을 **고의로** 지목하면 통과한다(변이 실측 — task.assigned→오늘과제.js).
 *   그건 기계가 아니라 리뷰 몫이다 — 발화 좌표 파싱까지 가면 TS·JS·SQL 리터럴 세 문법을
 *   다 알아야 해서 가드가 로직보다 등록층에서 샌다. */
const 낡은지목 = (장부) => Object.entries(장부)
  .filter(([, v]) => v && v.파일)
  .filter(([et, v]) => {
    try { return !fs.readFileSync(path.join(ROOT, v.파일), 'utf8').includes(et); }
    catch (_) { return true; } // 파일이 없다 = 지목이 더 크게 낡았다
  })
  .map(([et]) => et);

test('생산자 장부 — 모든 event_type 은 파일 xor 사유를 가진다', () => {
  const 값 = 계약.learning_events.값목록.event_type;
  const 빠짐 = 값.filter((et) => !(et in 생산자));
  assert.deepEqual(빠짐, [], `값목록에 있는데 생산자 장부에 없다 — 누가 내는지 아무도 안 정했다: ${빠짐.join(', ')}`);

  const 유령 = Object.keys(생산자).filter((et) => !값.includes(et));
  assert.deepEqual(유령, [], `장부에 있는데 계약 값목록에 없다 — 낡은 줄이다: ${유령.join(', ')}`);

  for (const [et, v] of Object.entries(생산자)) {
    const 파일 = typeof v.파일 === 'string' && v.파일.trim();
    const 사유 = typeof v.사유 === 'string' && v.사유.trim();
    assert.ok(Boolean(파일) !== Boolean(사유),
      `${et}: 파일 xor 사유여야 한다 — 둘 다면 어느 쪽이 정본인지, 둘 다 아니면 아무것도 안 정한 것`);
    // 「나중에」는 사유가 아니다 — 무엇이 서면 생기는지를 적게 한다(문턱없음과 같은 규칙).
    if (사유) assert.ok(v.사유.length >= 30, `${et} 의 사유가 너무 짧다`);
  }
});

/* ── 엔진도달 장부 — 「이 사건이 엔진 학습에 어떻게 닿는가」 (유호 상시 지시 2026-08-08) ──
 * `생산자` 장부의 반대쪽 끝. 그 장부가 없어 **수집만 서 있고 도달이 0인 상태가 초록**이었다.
 * 정본 = appsscript `docs/엔진도달_설계.md` §4 · 실측 = `docs/_ops/엔진도달_전수감사.md`.
 * 탐지력은 픽스처가 지고 실저장소에는 거짓양성만 건다(위 장부들과 같은 규칙). */

/** 도달 배열 중 「소비자 파일에 그 부품 문자열이 없는」 항목 — 낡은 지목 탐지기.
 * 천장은 `낡은지목` 과 같다: **문자열 실재까지만** 잰다. */
const 낡은도달 = (장부) => Object.entries(장부)
  .filter(([, v]) => Array.isArray(v.도달))
  .filter(([, v]) => v.도달.some((d) => {
    try { return !fs.readFileSync(path.join(ROOT, d.소비자), 'utf8').includes(d.부품); }
    catch (_) { return true; }
  }))
  .map(([et]) => et);

test('엔진도달 장부 — 모든 event_type 은 도달 xor 사유를 가진다', () => {
  const 값 = 계약.learning_events.값목록.event_type;
  const 빠짐 = 값.filter((et) => !(et in 엔진도달));
  assert.deepEqual(빠짐, [], `값목록에 있는데 엔진도달 장부에 없다 — 엔진 어디로 가는지 아무도 안 정했다: ${빠짐.join(', ')}`);

  const 유령 = Object.keys(엔진도달).filter((et) => !값.includes(et));
  assert.deepEqual(유령, [], `장부에 있는데 계약 값목록에 없다 — 낡은 줄이다: ${유령.join(', ')}`);

  for (const [et, v] of Object.entries(엔진도달)) {
    const 도달 = Array.isArray(v.도달) && v.도달.length > 0;
    const 사유 = typeof v.사유 === 'string' && v.사유.trim();
    assert.ok(Boolean(도달) !== Boolean(사유),
      `${et}: 도달 xor 사유여야 한다 — 둘 다면 어느 쪽이 정본인지, 둘 다 아니면 아무것도 안 정한 것`);
    if (사유) assert.ok(v.사유.length >= 30, `${et} 의 사유가 너무 짧다 — 무엇이 서면 닿는지를 적는다`);
    if (도달) for (const d of v.도달) {
      assert.ok(['A', 'B'].includes(d.경로), `${et}: 경로는 'A'(개인화·승격 불요) 또는 'B'(회사 훈련·승격 필수)`);
      for (const k of ['부품', '소비자']) {
        assert.ok(typeof d[k] === 'string' && d[k].trim(), `${et}: 도달 항목에 ${k} 가 없다`);
      }
    }
  }
});

test('엔진도달 장부 — 도달형은 소비자 파일에 그 부품 문자열이 실재한다', () => {
  // ① 탐지력(픽스처) — 그 문자열이 없는 실재 파일을 소비자로 지목하면 잡는다.
  assert.deepEqual(낡은도달({ 'submission.created': { 도달: [{ 경로: 'B', 부품: '없는부품이름XYZ', 소비자: 'lib/오늘과제.js' }] } }),
    ['submission.created'], '문자열 없는 소비자를 지목했는데 조용하다 — 이 검사가 아무것도 안 재고 있다');
  // ② 파일이 아예 없어도 잡는다.
  assert.deepEqual(낡은도달({ 'quiz.answered': { 도달: [{ 경로: 'A', 부품: '학습자 모델', 소비자: 'lib/없는파일.js' }] } }),
    ['quiz.answered'], '없는 소비자 파일 지목이 통과했다');
  // ③ 실저장소 — 거짓양성만.
  assert.deepEqual(낡은도달(엔진도달), [],
    '장부가 지목한 소비자에서 그 부품 문자열이 사라졌다 — 소비자를 옮겼으면 장부도 같이 옮긴다');
});

/* 🔑 유호님 지시의 기계적 실체 — 「앞으로 만들 것들이 전부 충족되어야 한다」 = **이 수가 늘면 안 된다.**
 * 오늘 13종 전부 도달 0 이다(⑥승격·⑦소비 물리 0). 이 검사는 그 0 을 초록으로 덮지 않고
 * **세어서 고정**한다 — 새 사건을 도달 없이 추가하면 여기서 빨개진다. 줄이는 것은 언제나 통과. */
test('엔진도달 래칫 — 도달 0 인 사건이 늘어나면 빨개진다', () => {
  const 도달0 = Object.entries(엔진도달).filter(([, v]) => !Array.isArray(v.도달)).map(([et]) => et);
  assert.ok(도달0.length <= 도달0상한,
    `엔진 도달이 없는 사건이 ${도달0상한} → ${도달0.length} 로 늘었다: ${도달0.join(', ')}\n` +
    '새 수집을 늘리려면 그것이 엔진 학습에 «어떻게» 닿는지를 같이 적어야 한다(유호 상시 지시 08-08).');
  assert.equal(도달0상한, 8, '상한을 올렸다 — 래칫은 내리기만 한다(도달을 적으면 준다)');
});

/** 생산자 장부가 «파일»을 지목했는데 엔진도달 장부는 아직 «사유»인 사건 — 설계 §4 교차 불변식①.
 *  두 장부의 조인은 **여기 한 곳**에서만 한다(양쪽에 적으면 갈라지고, 갈라진 쪽의 증상은 「통과」다). */
const 생산자섰는데도달0 = (생산자장부, 도달장부) => Object.keys(도달장부)
  .filter((et) => typeof (생산자장부[et] || {}).파일 === 'string')
  .filter((et) => !Array.isArray(도달장부[et].도달));

/* 🔑 위 `도달0상한` 이 원리상 못 보는 자리다 — 사건 13종이 전부 도달 0 이라 그 래칫은 **14번째
 * 사건**이 생겨야 발화한다. 실제로 벌어지는 일은 사건이 느는 게 아니라 **이미 있는 사건에
 * 생산자가 서는 것**이고, 그때 수집만 늘고 도달은 그대로인데 장부 둘은 각각 초록이다. */
test('엔진도달 교차 불변식① — 생산자가 선 사건이 도달 없이 늘어나면 빨개진다', () => {
  // ① 탐지력(픽스처) — 생산자는 파일인데 도달이 사유면 잡는다.
  assert.deepEqual(생산자섰는데도달0({ a: { 파일: 'x.js' } }, { a: { 사유: '아직' } }), ['a'],
    '생산자가 섰는데 도달이 사유인 짝을 그냥 지나쳤다 — 이 검사가 아무것도 안 재고 있다');
  // ② 거짓양성 아님 — 생산자도 아직 사유면 빚이 아니다(낼 사건이 0이라 도달할 것도 없다).
  assert.deepEqual(생산자섰는데도달0({ a: { 사유: '아직' } }, { a: { 사유: '아직' } }), [],
    '생산자조차 0인 사건을 빚으로 셌다 — 그러면 상한이 「수집 안 함」에도 반응한다');
  // ③ 거짓양성 아님 — 도달이 적혀 있으면 통과다(그 소비자 실재는 위 낡은도달 검사가 진다).
  assert.deepEqual(생산자섰는데도달0({ a: { 파일: 'x.js' } }, { a: { 도달: [{ 경로: 'A', 부품: 'p', 소비자: 'x.js' }] } }), [],
    '도달을 적었는데도 빚으로 셌다');

  // ④ 실저장소 — 래칫. 오늘의 7건은 소비자가 물리적으로 0이라 «지금은» 못 고친다(F103 회피).
  //    고정하는 것이 목적이다: 8번째 생산자는 도달을 같이 내야 선다.
  const 빚 = 생산자섰는데도달0(생산자, 엔진도달);
  assert.ok(빚.length <= 생산자섰는데도달0상한,
    `생산자는 섰는데 엔진 도달이 없는 사건이 ${생산자섰는데도달0상한} → ${빚.length} 로 늘었다: ${빚.join(', ')}\n`
    + '새 생산자를 세우려면 그 사건이 엔진 학습에 «어떻게» 닿는지를 같은 커밋에 적는다(유호 상시 지시 08-08 · 설계 §4 불변식①).');
  assert.equal(생산자섰는데도달0상한, 2, '상한을 올렸다 — 래칫은 내리기만 한다(도달을 적으면 준다)');
});

test('생산자 장부 — 파일 지목형은 그 파일에 그 사건 문자열이 실재한다', () => {
  // ① 탐지력(픽스처) — 그 문자열이 없는 실재 파일을 지목하면 그 사건을 지목한다.
  assert.deepEqual(낡은지목({ 'correction.viewed': { 파일: 'lib/오늘과제.js' } }), ['correction.viewed'],
    '문자열 없는 파일을 지목했는데 조용하다 — 이 검사가 아무것도 안 재고 있다');
  // ② 파일이 아예 없어도 잡는다(지워진 생산자를 장부가 계속 가리키는 형태).
  assert.deepEqual(낡은지목({ 'quiz.answered': { 파일: 'src/없는파일.js' } }), ['quiz.answered'],
    '없는 파일 지목이 통과했다');
  // ③ 실저장소 — 거짓양성만. 여기가 빨개지면 생산자가 옮겨졌는데 장부가 낡은 것이다.
  assert.deepEqual(낡은지목(생산자), [],
    '장부가 지목한 파일에서 그 사건 문자열이 사라졌다 — 생산자를 옮겼으면 장부도 같이 옮긴다');
});

test('session.abandoned 는 어디서 막혔는지를 요구한다 (①-6 · 양방향)', () => {
  const 무발화 = () => ({
    idempotency_key: 'b6f1c0a2-0000-4000-8000-000000000003',
    event_type: 'session.abandoned',
    occurred_at: '2026-08-05T13:22:00.000Z',
    level_snapshot: 'Lv1',
    correlation_id: 'b6f1c0a2-0000-4000-8000-0000000000c3',
    task_type: '발화녹음',
    submission: { task_ref: 'task-2026-08-05', task_format: '낭독' },
  });
  assert.equal(검증(무발화(), 계약).ok, true, 검증(무발화(), 계약).오류들.join(' / '));

  const 형식없음 = 무발화();
  delete 형식없음.submission.task_format;
  assert.equal(검증(형식없음, 계약).ok, false, '어디서 막혔는지 없이 통과했다');

  const 통로없음 = 무발화();
  delete 통로없음.task_type;
  assert.equal(검증(통로없음, 계약).ok, false, 'task_type 없이 통과했다');

  // 값목록 밖 형식은 여전히 막힌다 — 「무엇이든 넣으면 통과」가 되면 칸만 늘고 뜻은 안 는다.
  const 지어냄 = 무발화();
  지어냄.submission.task_format = '무발화';
  assert.equal(검증(지어냄, 계약).ok, false, '값목록 밖 task_format 이 통과했다');
});

test('선택장부는 계약과 붙어 있다 — 낡은 줄·두 곳 등재 금지', () => {
  const 실재 = new Set();
  for (const v of Object.values(계약.learning_events.필드 || {})) {
    if (Array.isArray(v)) v.forEach((n) => 실재.add(n));
  }
  assert.ok(실재.size > 10, '계약 필드 목록을 못 읽었다(통과와 미실행이 같은 모양이 된다)');

  const 유령 = Object.keys(선택필드).filter((n) => !실재.has(n));
  assert.deepEqual(유령, [], `계약에서 사라진 이름이 선택장부에 남았다: ${유령.join(', ')}`);

  // 필수로 올린 이름이 사유와 함께 남아 있으면 두 판정이 갈라진다(신뢰성 ④).
  const 이름 = (경로) => 경로.split('.').pop();
  const 요구됨 = new Set(공통필수.map(이름));
  for (const 요구들 of Object.values(이벤트별필수)) {
    for (const 요구 of 요구들) (Array.isArray(요구) ? 요구 : [요구]).forEach((p) => 요구됨.add(이름(p)));
  }
  const 겹침 = Object.keys(선택필드).filter((n) => 요구됨.has(n) || 서버칸.includes(n));
  assert.deepEqual(겹침, [], `요구·서버칸인데 선택장부에도 있다: ${겹침.join(', ')}`);

  const 빈사유 = Object.entries(선택필드).filter(([, v]) => typeof v !== 'string' || v.trim().length < 10);
  assert.deepEqual(빈사유.map(([k]) => k), [], '사유가 비었다 — 빈 문자열로 장부를 통과시키지 않는다');
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
  correlation_id: 'b6f1c0a2-0000-4000-8000-0000000000c3',
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
