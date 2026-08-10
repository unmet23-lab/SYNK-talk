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
  /* 🔑 목록을 늘리려면 **사람이 여기 와서 이름을 적어야 한다** — 그게 이 검사의 설계다.
   *   `payload.recommended_option` = 「아무것도 안 밀었다」(S1-5 고정 보기 2개 · 2026-08-10).
   *   키는 여전히 필수라 앱 결손과는 갈린다(아래 「키를 빠뜨리면 거부한다」가 그 축을 잰다).
   *   `payload.position` = 「안 골랐다」(2026-08-10) — 계약이 `skipped`·`rejected_all` 을 택1로
   *   허용해 놓고 같은 계약이 이 칸을 값으로 요구해 그 두 갈래를 **전건 거부**하고 있었다.
   *   🔑 완화가 아니라 **이사**다: 「골랐다고 적었으면 자리도 맞아야 한다」는 ⑦ 이 더 세게 진다
   *   (아래 「골랐으면 자리를 대조한다」 묶음). ⑦ 에 둔 이유는 그 검사가 사건이 아니라 **필드
   *   이름**으로 걸려서 G2 의 `submission.created` 통로까지 덮기 때문이다. */
  assert.deepEqual([...널허용], ['level_snapshot', 'payload.recommended_option', 'payload.position'],
    '널허용이 번졌다 — 완화가 계약 밖으로 새고 있다');
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
    /* 🔴 자리는 **`o2` 가 실제로 선 자리**여야 한다(=2). 2026-08-10 까지 이 픽스처는 `position: 1`
     *   이었다 — 「둘째를 골랐는데 첫째 자리라고 적은」 행이고, 그 거짓말을 아무도 안 봤다.
     *   ⑦ 의 자리 대조를 세우자 이 픽스처가 그 자리에서 빨개졌다. */
    options_shown: [{ option_id: 'o1', label: '즉시 자세히 설명' }, { option_id: 'o2', label: '힌트만 제공' }],
    position: 2,
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
    /* 🔴 **안 골랐으면 자리는 `null` 이다**(2026-08-10). 2026-08-10 까지 이 두 갈래는 여기서만
     *   통과했다 — 픽스처가 `position` 에 값을 들고 있었기 때문이고, 실제 조립기(`lib/선택로그`)가
     *   내는 모양(`position: null`)으로 태우면 **전건 거부**였다. 「시험은 초록인데 통로는 0」이
     *   정확히 그 자리다. 이제 조립기 모양 그대로 잰다. */
    e.payload.position = null;
    assert.equal(검증(e, 계약).ok, true, `${대체} 가 막혔다`);
  }
});

/* ── 「안 골랐다」와 「골랐다」의 자리 (2026-08-10 · S1-5 가 남긴 구멍 둘을 한 벌로 닫는다)
 *
 * 계약은 `selected_option`/`skipped`/`rejected_all` 을 **택1** 로 두고도 `payload.position` 을
 * 값으로 요구해, 뒤의 두 갈래를 원리상 거부했다 — 「무관심」과 「뚜렷한 거절」은 성향 축에서
 * **정반대 신호**인데 둘 다 통로가 0이었다. 그 필수를 널허용으로 옮기면 가드가 사라지므로,
 * 가드를 ⑦(필드 이름 축)으로 옮겨 **더 세게** 다시 세운다. */

test('🔑 「안 골랐다」 두 갈래가 조립기 모양 그대로 계약을 지난다 — 그전엔 원리상 0행이었다', () => {
  for (const 대체 of ['skipped', 'rejected_all']) {
    const e = 정상선택();
    e.payload.selected_option = null;
    e.payload.position = null;
    e.payload[대체] = true;
    const r = 검증(e, 계약);
    assert.equal(r.ok, true, `${대체}: ${r.오류들.join(' / ')}`);
  }
});

test('🔴 택1은 «실려 있나»가 아니라 «그렇다고 말했나»로 잰다 — `false` 는 주장이 아니다', () => {
  /* `있음(false)` 이 참이라 아무것도 주장하지 않는 행이 택1을 그대로 지나갔다. 오늘까지
   * 새는 양이 0이었던 것은 `position` 필수가 그 조합을 우연히 막아서고, 위 널허용이 그
   * 우연을 없앤다 — 그래서 한 벌로 고친다. */
  const e = 정상선택();
  e.payload.selected_option = null;
  e.payload.position = null;
  e.payload.skipped = false;
  e.payload.rejected_all = false;
  const r = 검증(e, 계약);
  assert.equal(r.ok, false, '아무것도 주장하지 않는 행이 택1을 지났다');
  assert.ok(r.오류들.some((m) => m.includes('택1')), r.오류들.join(' / '));
});

test('🔴 골랐으면 자리를 대조한다 — 없거나·0이거나·딴 자리면 거부', () => {
  for (const [무엇, 자리] of [['null', null], ['0', 0], ['-1', -1], ['딴 자리', 1], ['정수 아님', '2']]) {
    const e = 정상선택();          // selected_option 'o2' = 둘째 자리
    e.payload.position = 자리;
    assert.equal(검증(e, 계약).ok, false, `골랐는데 position ${무엇} 이 통과했다`);
  }
  /* 키를 통째로 빼는 것도 그대로 막힌다 — 널허용은 **값**만 푸는 것이지 칸을 없애지 않는다. */
  const 빠짐 = 정상선택();
  delete 빠짐.payload.position;
  assert.equal(검증(빠짐, 계약).ok, false, 'position 키가 없는데 통과했다');
});

test('🔴 반대 방향도 거짓이다 — 안 골랐는데 자리가 적힌 행', () => {
  /* 소비자는 `selected_option` 이 없으면 자리 분포에 안 세므로 **증상이 0**이고, 그 값은
   * 조용히 저장돼 나중에 없던 뜻으로 읽힌다. 「안 골랐다」의 정직한 자리는 `null` 하나다. */
  const e = 정상선택();
  e.payload.selected_option = null;
  e.payload.skipped = true;
  e.payload.position = 2;
  assert.equal(검증(e, 계약).ok, false, '안 골랐는데 자리가 적힌 행이 통과했다');
});

test('🔴 이 가드는 `submission.created` 통로에도 걸린다 — G2 가 같은 필드를 거기로 보낸다', () => {
  /* `이벤트별필수` 에 두면 `choice.selected` 에만 걸려 그 통로가 통째로 샌다(⑦ 머리말과 같은
   * 근거 · `발주_게임모듈.md` §6-3). 새는 방향은 언제나 「통과」다. */
  const e = 정상제출();
  e.payload = {
    options_shown: [{ option_id: 'o1', label: 'ㄱ' }, { option_id: 'o2', label: 'ㄴ' }],
    selected_option: 'o2',
    position: 1,               // 진짜 자리는 2
  };
  const r = 검증(e, 계약);
  assert.equal(r.ok, false, 'G2 통로에서 자리 대조가 통째로 안 돈다');
  assert.ok(r.오류들.some((m) => m.includes('자리와 다르다')), r.오류들.join(' / '));
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
  assert.equal(도달0상한, 5, '상한을 올렸다 — 래칫은 내리기만 한다(도달을 적으면 준다)');
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

  // ④ 실저장소 — 래칫. 08-08 의 7건이 08-09 에 **0** 이 됐다(⑦소비 다섯 + 성과 회수 둘).
  //    이제 이 수는 늘 수 없다: 새 생산자를 세우는 판은 소비자를 같은 커밋에 낸다.
  const 빚 = 생산자섰는데도달0(생산자, 엔진도달);
  assert.ok(빚.length <= 생산자섰는데도달0상한,
    `생산자는 섰는데 엔진 도달이 없는 사건이 ${생산자섰는데도달0상한} → ${빚.length} 로 늘었다: ${빚.join(', ')}\n`
    + '새 생산자를 세우려면 그 사건이 엔진 학습에 «어떻게» 닿는지를 같은 커밋에 적는다(유호 상시 지시 08-08 · 설계 §4 불변식①).');
  assert.equal(생산자섰는데도달0상한, 0, '상한을 올렸다 — 래칫은 내리기만 한다(도달을 적으면 준다)');
});

/* ── 교차 불변식③ — 「지목된 소비자」와 「실제로 도는 소비자」는 다르다 ──────────────
 *
 * 위 두 불변식은 **장부와 파일**만 본다. 그래서 순수 모듈 하나를 세우고 장부에 소비자로 적으면
 * 래칫이 내려가는데, 그 파일을 **부르는 코드는 0줄**일 수 있다 — 2026-08-09 에 `lib/성과회수.js`
 * 가 정확히 그 상태였다(장부 초록 · 런타임 도달 0). 설계 §5 가 v1 에서 판정한 병의 코드판이다:
 * *"뷰에 행이 보이는 것을 「엔진이 배웠다」로 바꿔 불렀다 … 도달의 정의는 **읽힌 것**"*.
 * 이 검사가 없으면 다음 판도 같은 모양으로 래칫만 내리고 통과한다. */

const 원문캐시 = new Map();
const 원문 = (f) => {
  if (!원문캐시.has(f)) { try { 원문캐시.set(f, fs.readFileSync(f, 'utf8')); } catch (_) { 원문캐시.set(f, ''); } }
  return 원문캐시.get(f);
};

/** 저장소의 «런타임 코드» — 테스트·의존성·문서는 뺀다(그것들이 부르는 것은 도달이 아니다). */
function 런타임파일들(dir, 모음 = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || ['node_modules', 'tests', 'evals', 'docs', 'assets', 'contents'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) 런타임파일들(p, 모음);
    else if (/\.(js|mjs|cjs|ts|tsx)$/.test(e.name) && !/\.test\.js$/.test(e.name)) 모음.push(p);
  }
  return 모음;
}

/** 엔진도달 장부가 지목했는데 **아무도 안 부르는** 소비자.
 *
 * 🔑 파일명(확장자 뺀 것)으로 찾는다 — Edge Function 은 같은 파일을 `./학습자상태.mjs` 로 동봉해
 *   import 하므로 경로가 저장소 경로와 다르다. 사람이 실제로 쓰는 두 표기를 다 잡아야 한다.
 * ⚠ 두 가지를 «안» 센다: ①**소비자끼리의 참조**(A가 B를, B가 A를 부르면 둘 다 초록인데 런타임은
 *   0이다 — `성과회수`가 `학습자상태`를 require 하는 것이 실제로 그 모양이다) ②**테스트**(검사가
 *   자기 자신을 도달 근거로 삼으면 아무것도 안 재는 것과 같다 · 위 `런타임파일들` 이 뺀다). */
const 안불리는소비자 = (장부, 파일들) => {
  const 이름 = (p) => path.basename(String(p)).replace(/\.[^.]+$/, '');
  const 소비자들 = [...new Set(Object.values(장부)
    .flatMap((v) => (Array.isArray(v.도달) ? v.도달.map((d) => d.소비자) : [])))];
  const 소비자이름 = new Set(소비자들.map(이름));
  return 소비자들.filter((c) => {
    const n = 이름(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const 부름 = new RegExp(`(?:require\\(|import\\(|from)\\s*['"\`][^'"\`]*${n}[^'"\`]*['"\`]`);
    return !파일들.some((f) => !소비자이름.has(이름(f)) && 부름.test(원문(f)));
  }).sort();
};

test('엔진도달 교차 불변식③ — 지목된 소비자는 «부르는 코드»가 실재한다', () => {
  const 파일들 = 런타임파일들(ROOT);
  const 지목 = (소비자) => ({ x: { 도달: [{ 경로: 'A', 부품: 'p', 소비자 }] } });

  // ① 탐지력(픽스처) — 아무도 안 부르는 파일을 소비자로 지목하면 잡는다.
  assert.deepEqual(안불리는소비자(지목('lib/아무도안부르는파일.js'), 파일들), ['lib/아무도안부르는파일.js'],
    '부르는 코드가 0줄인 소비자를 그냥 지나쳤다 — 이 검사가 아무것도 안 재고 있다');

  // ② 거짓양성 아님 — 실제로 불리는 소비자는 통과한다(`functions/deliver` 가 동봉본을 import 한다).
  assert.deepEqual(안불리는소비자(지목('lib/학습자상태.js'), 파일들), [],
    '`.mjs` 동봉 표기를 못 읽었다 — 사람이 실제로 쓰는 표기로 검사해야 한다');

  // ③ 소비자끼리의 참조는 근거가 못 된다 — 둘만 있는 세상에서는 둘 다 「안 불림」이어야 한다.
  const 순환 = 안불리는소비자(
    { a: { 도달: [{ 경로: 'A', 부품: 'p', 소비자: 'lib/학습자상태.js' }] },
      b: { 도달: [{ 경로: 'A', 부품: 'p', 소비자: 'lib/성과회수.js' }] } },
    [path.join(ROOT, 'lib', '성과회수.js'), path.join(ROOT, 'lib', '학습자상태.js')]);
  assert.deepEqual(순환, ['lib/성과회수.js', 'lib/학습자상태.js'],
    '소비자끼리 서로 부르는 것을 도달의 근거로 셌다 — 그러면 순환 두 개로 장부가 통째로 초록이 된다');

  // ④ 실저장소 — 거짓양성만. 여기가 빨개지면 소비자를 «세워만 두고» 부르는 자리를 안 낸 것이다.
  assert.deepEqual(안불리는소비자(엔진도달, 파일들), [],
    '장부가 지목한 소비자를 부르는 코드가 저장소에 없다 — 「읽는 자리」가 서기 전까지 그 줄은 약속이지 도달이 아니다');
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

/* ── 널허용이 **경로**에도 걸린다 (2026-08-10 · S1-5 가 잡은 자리) ─────────────────
 * 🔴 「안 밀었다」와 「앱이 그 칸을 빠뜨렸다」를 가르는 것이 이 목록의 뜻 전부다. 값으로만 재면
 *   S1-5 의 사건은 한 건도 계약을 못 지나 성향 축 ⑤의 입구가 통째로 막히고, 키 존재를 안 재면
 *   앱 결손이 「안 밀었다」로 위장해 들어온다. 두 방향을 다 잰다. */
const 고름사건 = (덧) => ({
  idempotency_key: '11111111-2222-4333-8444-555555555555',
  event_type: 'choice.selected',
  occurred_at: '2026-08-07T10:00:00Z',
  correlation_id: '99999999-8888-4777-8666-555555555555',
  level_snapshot: 1,
  payload: {
    ver: 1,
    options_shown: [{ option_id: 'a', label: 'ㄱ' }, { option_id: 'b', label: 'ㄴ' }],
    position: 1,
    selected_option: 'a',
    recommended_option: null,
    skipped: false,
    rejected_all: false,
    ...덧,
  },
});

test('🔴 밀지 않은 날이 계약을 지난다 — 안 그러면 S1-5 는 행이 0이다', () => {
  const r = 검증(고름사건(), 계약);
  assert.equal(r.ok, true, `「아무것도 안 밀었다」가 거부됐다: ${r.오류들.join(' / ')}`);
});

test('🔴 그래도 **키를 빠뜨리면** 거부한다 — 널허용은 값만 푸는 것이지 칸을 없애지 않는다', () => {
  const e = 고름사건();
  delete e.payload.recommended_option;
  const r = 검증(e, 계약);
  assert.equal(r.ok, false, '앱 결손이 「안 밀었다」로 위장해 들어왔다 — 그 어긋남은 아무 데도 안 남는다');
  assert.ok(r.오류들.some((m) => m.includes('recommended_option')), `사유가 그 칸을 안 지목한다: ${r.오류들.join(' / ')}`);
});

test('밀어준 날도 그대로 지난다 — 널허용이 실값을 막지 않는다', () => {
  assert.equal(검증(고름사건({ recommended_option: 'b' }), 계약).ok, true);
});

test('널허용은 빈 문자열을 「모른다」로 받지 않는다 — 두 모양을 다 받으면 셈이 갈린다', () => {
  const r = 검증(고름사건({ recommended_option: '' }), 계약);
  assert.equal(r.ok, false, '빈 문자열이 통과했다 — 「모른다」는 null 하나로만 적는다');
});

test('🔴 이웃 칸까지 같이 열리지 않았다 — 완화는 목록에 적힌 경로뿐', () => {
  /* `options_shown` 은 널허용이 아니다 — 「무엇을 보여줬나」가 없으면 나머지 여덟 칸이 전부
   * 무엇에 대한 값인지 모르는 수가 된다. 여기서 재는 것은 **완화가 목록 밖으로 번지지 않았다**
   * 하나다(위 집합 대조와 한 벌). */
  assert.equal(검증(고름사건({ options_shown: null }), 계약).ok, false,
    'options_shown 이 null 인데 통과했다 — 완화가 이웃 칸으로 번졌다');

  /* 🔑 `position` 은 2026-08-10 에 목록에 들어갔다 — 그런데 **골랐다고 적은 이 픽스처에서는
   *   여전히 거부된다.** 가드가 사라진 게 아니라 ⑦(필드 이름 축)으로 옮겨 갔다는 뜻이고,
   *   그 자리는 「안 골랐다」 행만 통과시킨다(위 「안 골랐다 두 갈래」 묶음이 그 축을 잰다). */
  const r = 검증(고름사건({ position: null }), 계약);
  assert.equal(r.ok, false, '골랐다고 적은 행이 자리 없이 통과했다 — 손버릇과 선호가 영영 한 모양이 된다');
  assert.ok(r.오류들.some((m) => m.includes('position')), r.오류들.join(' / '));
});
