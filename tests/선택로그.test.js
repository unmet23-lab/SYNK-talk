/* 선택로그 회귀 — S1-5 「골라서 답하기」가 낼 `choice.selected` 조립기.
 *
 * 세 맹점을 의식하고 짰다(CLAUDE.md):
 *   ① 사람이 실제로 쓰는 표기 — 보기는 계약 C0 §156 의 `{option_id,label}` 그대로다.
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 픽스처가 지고, 실계약에는
 *      **「내가 낸 payload 가 계약 검증을 실제로 통과하는가」** 하나만 건다.
 *   ③ 자기 처방 — 조립기가 `null` 로 거부한 재료를 그 사유대로 고치면 통과해야 한다.
 *
 * 🔑 **소비자를 함께 건다.** 조립기만 시험하면 「내가 낸 모양을 내가 읽는다」만 증명된다 —
 *   그래서 진짜 검증기(`lib/이벤트검증.js`)에 실계약을 물려 먹인다. 계약이 갈리는 날
 *   여기가 빨개져야 한다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const { 검증 } = require('../lib/이벤트검증.js');
const { 차원들, 보기세우기, 선택payload, 걸린시간 } = require('../lib/선택로그.js');

/* 아래 시험들이 재는 것은 차원이 아니라 다른 칸이라, 한 차원으로 고정해 잡음을 없앤다.
 * 차원 자체의 규약은 이 파일 끝의 전용 시험들이 진다. */
const 차원 = 차원들.도입평일;

const 항등 = (n) => Array.from({ length: n }, (_, i) => i);
const 역순 = (n) => Array.from({ length: n }, (_, i) => n - 1 - i);

const 선택지 = () => ([
  { option_id: 'opt_kimchi', label: '김치찌개를 좋아해요' },
  { option_id: 'opt_bulgogi', label: '불고기를 좋아해요' },
]);

test('보기세우기 — 섞기가 표시 순서를 정하고 그 순서가 그대로 남는다', () => {
  const 그대로 = 보기세우기(선택지(), 'opt_kimchi', 항등);
  assert.deepEqual(그대로.options_shown.map((o) => o.option_id), ['opt_kimchi', 'opt_bulgogi']);
  const 뒤집힘 = 보기세우기(선택지(), 'opt_kimchi', 역순);
  assert.deepEqual(뒤집힘.options_shown.map((o) => o.option_id), ['opt_bulgogi', 'opt_kimchi']);
  /* 🔑 추천은 자리를 안 탄다 — 섞여도 「우리가 민 것」은 같은 id 다.
   *    이게 갈리면 「밀어준 것」 축이 자리에 오염된다. */
  assert.equal(뒤집힘.recommended_option, 'opt_kimchi');
});

test('보기세우기 — 계약 모양이 아니면 조립을 거부한다(400 을 왕복하지 않는다)', () => {
  assert.equal(보기세우기([{ option_id: 'a', label: 'ㄱ' }], null, 항등), null, '보기 1개는 선택이 아니다');
  assert.equal(보기세우기([{ option_id: 'a', label: 'ㄱ' }, { option_id: 'a', label: 'ㄴ' }], null, 항등), null,
    'id 중복 — 조인 키가 두 곳을 가리킨다');
  assert.equal(보기세우기([{ option_id: 'a' }, { option_id: 'b', label: 'ㄴ' }], null, 항등), null,
    'label 은 그때 표시된 문구의 스냅샷이라 빠질 수 없다');
  assert.equal(보기세우기(선택지(), 'opt_없는것', 항등), null,
    '🔴 안 보여준 것을 밀었다고 적으면 「밀어준 것」 축이 통째로 거짓이 된다');
});

test('position 은 **고른 것의 자리**다 — 손버릇과 선호를 가르는 유일한 칸', () => {
  const 보기 = 보기세우기(선택지(), 'opt_kimchi', 역순);   // 화면 순서: [불고기, 김치]
  const p = 선택payload({ 차원, 보기, 고른것: 'opt_kimchi' });
  /* 🔴 **1부터 센다** — L0 §140 정본 예시(보기 3개 중 `cs2` 선택 → `position: 2`)가 자다.
   *    0 부터 세면 모든 행이 한 칸씩 밀리고, 그 오독은 어디서도 안 빨개진다. */
  assert.equal(p.position, 2, '김치는 둘째 자리에 표시됐다');
  assert.equal(p.selected_option, 'opt_kimchi');
  /* 추천과 선택이 같아도 자리가 다르면 다른 관측이다 — 그래서 둘을 따로 적는다. */
  assert.equal(p.recommended_option, 'opt_kimchi');
});

test('택1 — 고름 / 그냥 넘김 / 전량 거절이 서로 다른 모양으로 남는다', () => {
  const 보기 = 보기세우기(선택지(), null, 항등);
  const 골랐다 = 선택payload({ 차원, 보기, 고른것: 'opt_bulgogi' });
  assert.deepEqual([골랐다.skipped, 골랐다.rejected_all], [false, false]);

  const 넘겼다 = 선택payload({ 차원, 보기 });
  assert.deepEqual([넘겼다.skipped, 넘겼다.rejected_all, 넘겼다.selected_option, 넘겼다.position],
    [true, false, null, null], '안 골랐으면 가리킬 자리가 없다');

  const 거절 = 선택payload({ 차원, 보기, 전량거절: true });
  assert.deepEqual([거절.skipped, 거절.rejected_all], [false, true],
    '🔴 「무관심」과 「뚜렷한 거절」은 성향 축에서 정반대 신호다');

  assert.equal(선택payload({ 차원, 보기, 고른것: 'opt_kimchi', 전량거절: true }), null, '둘 다 참인 상태는 뜻이 없다');
  assert.equal(선택payload({ 차원, 보기, 고른것: 'opt_없는것' }), null, '안 보여준 것을 골랐다고 적지 않는다');
});

test('latency_ms — 시계가 뒤로 가면 「즉답」이 아니라 「안 쟀다」다', () => {
  assert.equal(걸린시간(100, 2350), 2250);
  assert.equal(걸린시간(2350, 100), null, '🔴 음수를 0 으로 접으면 그 행이 즉답으로 읽힌다');
  assert.equal(걸린시간(null, 100), null);
  assert.equal(걸린시간(NaN, 100), null);
  const 보기 = 보기세우기(선택지(), null, 항등);
  assert.equal(선택payload({ 차원, 보기, 고른것: 'opt_kimchi', 시작: 0, 끝: 1500 }).latency_ms, 1500);
  assert.equal(선택payload({ 차원, 보기, 고른것: 'opt_kimchi' }).latency_ms, null, '안 쟀으면 null(0 이 아니다)');
});

test('안 물어본 칸은 null 로 싣는다 — 빈 문자열은 「모름」이 아니다', () => {
  const 보기 = 보기세우기(선택지(), null, 항등);
  assert.equal(선택payload({ 차원, 보기, 고른것: 'opt_kimchi' }).selection_reason, null);
  assert.equal(선택payload({ 차원, 보기, 고른것: 'opt_kimchi', 사유: '' }).selection_reason, null);
  assert.equal(선택payload({ 차원, 보기, 고른것: 'opt_kimchi', 사유: '맛있어서' }).selection_reason, '맛있어서');
  assert.equal(선택payload({ 차원, 보기, 고른것: 'opt_kimchi', 바꾼횟수: 0 }).changed_selection, false);
  assert.equal(선택payload({ 차원, 보기, 고른것: 'opt_kimchi', 바꾼횟수: 2 }).changed_selection, true);
});

/* 🔑 여기가 이 파일의 값이다 — 진짜 검증기 + 실계약. */
const 사건 = (payload) => ({
  idempotency_key: 'b6f1c0a2-0000-4000-8000-0000000000c5',
  event_type: 'choice.selected',
  task_type: '숙제제출',
  occurred_at: '2026-08-10T05:20:11.412Z',
  level_snapshot: 'Lv1',
  goal_snapshot: null,
  correlation_id: 'c0000000-0000-4000-8000-000000000001',
  payload,
});

test('🔑 조립한 payload 가 **실계약 검증을 실제로 통과한다**(고름 갈래)', () => {
  const 보기 = 보기세우기(선택지(), 'opt_kimchi', 역순);
  const r = 검증(사건(선택payload({ 차원, 보기, 고른것: 'opt_bulgogi', 시작: 0, 끝: 900 })), 계약);
  assert.deepEqual(r.오류들 ?? r.errors ?? [], [], JSON.stringify(r));
});

/* 🔴 **나머지 두 갈래도 이제 실계약을 지난다**(2026-08-10 · `local_671a0bce`).
 *   그전까지 `skipped`·`rejected_all` 은 계약이 택1로 허용해 놓고 같은 계약이 `payload.position`
 *   을 값으로 요구해(널허용에도 없었다) **원리상 거부**했다 — 즉 「학생이 안 골랐다」는 관측이
 *   통로 자체가 0이었고, 그건 성향 축에서 「무관심 vs 뚜렷한 거절」을 가르는 신호다.
 *   처방은 `널허용` 에 `payload.position` 을 넣고 「골랐으면 자리도 맞아야 한다」를 검증기 ⑦ 로
 *   옮긴 것이다(더 세다 — 자리가 `options_shown` 의 그 자리와 **일치**해야 한다). */

test('🔑 안 고른 두 갈래가 **실계약 검증을 실제로 통과한다** — 조립기 출력 그대로', () => {
  for (const [이름, 재료] of [['무관심(skipped)', {}], ['뚜렷한 거절(rejected_all)', { 전량거절: true }]]) {
    const p = 선택payload({ 차원, 보기: 보기세우기(선택지(), null, 항등), 고른것: null, 시작: 0, 끝: 8000, ...재료 });
    assert.ok(p, `${이름}: 조립기가 null 을 냈다`);
    assert.equal(p.position, null, `${이름}: 안 골랐는데 자리를 지어냈다`);
    const r = 검증(사건(p), 계약);
    assert.deepEqual(r.오류들 ?? r.errors ?? [], [], `${이름}: ${JSON.stringify(r)}`);
  }
});

test('🔴 그래도 지어낸 자리는 죽는다 — 0 으로 채우면 「첫째를 골랐다」가 된다', () => {
  /* 이 파일의 주석이 「0 이나 -1 로 지어내지 않는다」로 못박은 것을 **기계가 잡는지** 잰다.
   * 조립기는 안 지어내지만, 계약을 여는 판에서 지어낸 값이 통과하면 그 손실은 소급이 없다. */
  const p = 선택payload({ 차원, 보기: 보기세우기(선택지(), null, 항등), 고른것: null, 시작: 0, 끝: 8000 });
  for (const 지어냄 of [0, -1, 1]) {
    assert.equal(검증(사건({ ...p, position: 지어냄 }), 계약).ok, false,
      `안 골랐는데 position ${지어냄} 이 통과했다`);
  }
});

test('③ 자기 처방 — 검증이 거부한 것을 사유대로 고치면 통과한다', () => {
  const 보기 = 보기세우기(선택지(), 'opt_kimchi', 항등);
  const 온전 = 선택payload({ 차원, 보기, 고른것: 'opt_kimchi' });

  /* `position` 을 지우면 계약이 막아야 한다 — 이 칸이 없으면 선호와 「밀어준 것」이 안 갈린다. */
  const 뺀것 = { ...온전 };
  delete 뺀것.position;
  const 나쁨 = 검증(사건(뺀것), 계약);
  assert.notDeepEqual(나쁨.오류들 ?? 나쁨.errors ?? [], [], '🔴 position 이 빠졌는데 통과하면 그 축은 영원히 못 산다');

  const 좋음 = 검증(사건(온전), 계약);
  assert.deepEqual(좋음.오류들 ?? 좋음.errors ?? [], []);
});

/* ── `choice_dimension` — 무슨 축의 선택이었나 (c9 ③ · L0 §141)
 *
 * 🔑 이 칸이 왜 시험을 갖는가: 빠뜨려도 **화면에 아무 증상이 없다.** 학생은 똑같이 고르고
 *   행도 똑같이 생긴다 — 뜻을 잃는 것은 나중에 그 행을 세는 쪽이고, 그때는 소급이 없다.
 *   그래서 「안 실림」이 시험에서 죽어야 한다. */

test('🔴 차원 키를 빠뜨리면 조립이 거부된다 — 새 화면이 이 칸을 잊는 것을 시험에서 죽인다', () => {
  const 보기 = 보기세우기(선택지(), null, 항등);
  assert.equal(선택payload({ 보기, 고른것: 'opt_kimchi' }), null,
    '차원 없이 통과하면 그 행은 어느 축이었는지 영영 모른다');
});

test('🔴 모르는 차원은 「모름」으로 접지 않고 거부한다 — 오타가 조용히 새 차원을 만든다', () => {
  const 보기 = 보기세우기(선택지(), null, 항등);
  assert.equal(선택payload({ 차원: 'intro-daily', 보기, 고른것: 'opt_kimchi' }), null,
    '하이픈 오타를 받아 주면 분포가 둘로 갈리고 아무 데서도 안 빨개진다');
  assert.equal(선택payload({ 차원: '', 보기, 고른것: 'opt_kimchi' }), null);
  assert.equal(선택payload({ 차원: 7, 보기, 고른것: 'opt_kimchi' }), null);
});

test('🔑 `null` 은 「모른다」의 명시라 통과한다 — 옛 배정 행의 사건을 잃지 않는다', () => {
  /* 옛 판(`오늘과제.v3` 이전)이 만든 배정 행에는 이 칸이 없고 `task_snapshot` 은 불변이라
   * 소급해 넣을 수도 없다(L0 §3-3). 여기서 거부하면 그 학생의 선택이 통째로 안 나간다 —
   * 차원 하나를 얻으려고 사건을 잃는 거래다. */
  const 보기 = 보기세우기(선택지(), null, 항등);
  const p = 선택payload({ 차원: null, 보기, 고른것: 'opt_kimchi' });
  assert.ok(p, '옛 행의 사건이 통째로 사라졌다');
  assert.equal(p.choice_dimension, null, '「모른다」가 빈 문자열이나 기본 차원으로 접혔다');
});

test('🔑 아는 차원은 그대로 실리고, 그 값이 실계약 검증을 지난다', () => {
  const 보기 = 보기세우기(선택지(), 'opt_kimchi', 항등);
  for (const v of Object.values(차원들)) {
    const p = 선택payload({ 차원: v, 보기, 고른것: 'opt_kimchi' });
    assert.equal(p.choice_dimension, v);
    const r = 검증(사건(p), 계약);
    assert.deepEqual(r.오류들 ?? r.errors ?? [], [], `${v} 를 실은 사건이 계약을 못 지났다`);
  }
});

test('🔴 아는 차원은 계약 필드 목록에 등재돼 있다 — 코드만 알고 계약이 모르면 소비자가 그 칸을 못 믿는다', () => {
  const 목록 = 계약.learning_events.필드.선택로그;
  assert.ok(목록.includes('choice_dimension'),
    '계약이 이 칸을 모른다 — 계약만 읽는 소비자에게는 없는 값이다(c9 ③ 이 만들어진 이유)');
  /* 🔑 값목록은 계약이 아니라 `lib/선택로그.차원들` 이 든다(새 게임 = 콘텐츠 팩 1벌 · 발주 §6-0-3).
   *   그래서 여기서 재는 것은 「이름이 계약에 있는가」 하나다. */
  assert.ok(Object.values(차원들).length >= 2, '아는 차원이 둘 미만이면 S1-5 의 두 쌍이 안 갈린다');
  assert.equal(new Set(Object.values(차원들)).size, Object.values(차원들).length, '차원 값이 겹친다');
});
