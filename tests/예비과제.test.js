/* 예비과제 회귀 — «빈손 방지» 풀과 그 갈래 (유호 지시 2026-08-26)
 *
 * ■ 무엇을 재나
 *   ① 풀이 생성물과 «같다»(원본이 움직였는데 안 구웠으면 빨강 — 강사지식빌드와 같은 무늬)
 *   ② 고르기가 «결정적»이다(같은 학생·같은 날이면 언제 불러도 같은 값 — 스냅샷 불변 규율)
 *   ③ **연속으로 같은 문장이 안 나온다** — 이것이 이 트랙이 막으려던 그 병이다
 *   ④ 초급은 예비로 «안 샌다»(검증된 초급 문장이 0벌이라 도입 폴백이 그대로 져야 한다)
 *   ⑤ 사다리 우선순위: 첫날 > 교정문 > 전날(어제가 «생것»일 때만) > 예비 > 도입폴백
 *   ⑥ 🔴 `갈래판정` 의 위 두 갈래는 `예비있음`·`전날출처` 와 **무관**하다 —
 *      `deliver/생성모드.ts` 의 사유 게이트가 그 무관함 위에 서 있다(뒤집히면 거기가 조용히 갈린다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 띄우기 } = require('./lib/띄우기.js');

const ROOT = path.resolve(__dirname, '..');
const 예비 = require('../lib/예비과제.js');
const { 갈래판정, 갈래순서, 생것출처 } = require('../lib/갈래판정.js');
const { 오늘과제, 도입 } = require('../lib/오늘과제.js');

const L = '11111111-2222-3333-4444-555555555555';
const M = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('① 생성물이 원본과 같다 — 채점 결과가 움직였는데 안 구웠으면 빨강', () => {
  const r = 띄우기([path.join(ROOT, 'tools', '예비과제굽기.js'), '--확인'], { encoding: 'utf8' });
  assert.match(r.stdout, /같다/, r.stdout + r.stderr);
});

test('② 고르기는 결정적 — 같은 학생·같은 날이면 몇 번을 불러도 같다', () => {
  const a = 예비.고르기({ 급수: 'Lv4', learner_id: L, 날짜: '2026-09-10' });
  const b = 예비.고르기({ 급수: 'Lv4', learner_id: L, 날짜: '2026-09-10' });
  assert.ok(a && a.문장, '예비가 안 나왔다');
  assert.deepEqual(a, b, '같은 입력에 다른 값이 나왔다 — 재시도가 다른 과제를 만든다');
});

/* 🔴 이 트랙이 막으려던 병 — 「장애가 사흘이면 같은 문장이 사흘」.
 * ⚠ 분모를 정직하게 잰다: 유호 확정으로 풀이 3회전 하나뿐이라 급수당 ≈9~15벌이고,
 *   **한 바퀴(=벌수)만큼 지나면 되돌아온다.** 그것을 「없다」로 쓰지 않고 «그 수까지는 안 겹친다»로 쓴다. */
test('🔴 ③ 한 바퀴 도는 동안 같은 문장이 두 번 안 나온다 (연속 반복은 원리상 0)', () => {
  const 시작 = Date.UTC(2026, 8, 1) / 86400000;
  for (const 급수 of ['Lv3', 'Lv4', 'Lv5', 'Lv6']) {
    const 벌 = 예비.벌수(급수);
    assert.ok(벌 >= 8, `${급수} 가 ${벌}벌뿐 — 한 바퀴가 너무 짧다(4회전이 착지하면 는다)`);
    const 문장들 = [];
    for (let i = 0; i < 벌; i++) {
      const d = new Date((시작 + i) * 86400000).toISOString().slice(0, 10);
      문장들.push(예비.고르기({ 급수, learner_id: L, 날짜: d }).문장);
    }
    for (let i = 1; i < 문장들.length; i++) {
      assert.notEqual(문장들[i], 문장들[i - 1], `${급수} · ${i}일째에 어제와 같은 문장이 나왔다`);
    }
    assert.equal(new Set(문장들).size, 벌, `${급수} 한 바퀴(${벌}일) 안에 같은 문장이 두 번 나왔다`);
  }
});

test('③-b 학생마다 출발점이 다르다 — 같은 날 옆자리와 안 겹친다', () => {
  const a = 예비.고르기({ 급수: 'Lv5', learner_id: L, 날짜: '2026-09-10' });
  const b = 예비.고르기({ 급수: 'Lv5', learner_id: M, 날짜: '2026-09-10' });
  assert.notEqual(a.문장, b.문장, '두 학생이 같은 날 같은 문장을 받았다(지문이 안 흩고 있다)');
});

test('④ 초급(Lv1·Lv2)·미정은 예비가 «없다» — 검증된 초급 문장이 0벌이라 지어내지 않는다', () => {
  for (const 급수 of ['Lv1', 'Lv2', null, undefined, '미정']) {
    assert.equal(예비.있나(급수), false, `${급수} 에 예비가 생겼다`);
    assert.equal(예비.고르기({ 급수, learner_id: L, 날짜: '2026-09-10' }), null);
  }
  /* 실물 경로에서도 도입 폴백이 그대로 져야 한다. */
  const r = 오늘과제({ 날짜: '2026-09-10', 급수: 'Lv2', learner_id: L, 전날문장: 'x', 전날출처: '예비' });
  assert.equal(r.출처, '도입');
  assert.equal(r.task_snapshot.호흡[0].문장, 도입.따라말하기);
});

test('⑤ 사다리 — 첫날 > 교정문 > 전날(어제가 «생것»일 때만) > 예비 > 도입폴백', () => {
  assert.deepEqual(갈래순서, ['첫날', '교정문', '전날', '예비', '도입폴백']);
  const 기본 = { 전날문장: '어제 문장', 예비있음: true };
  assert.equal(갈래판정({ ...기본, 첫날: true, 교정문: '교정' }).갈래, '첫날');
  assert.equal(갈래판정({ ...기본, 교정문: '교정' }).갈래, '교정문');
  for (const s of 생것출처) assert.equal(갈래판정({ ...기본, 전날출처: s }).갈래, '전날', s);
  /* 어제도 강등이면 전날이 아니다 — 여기가 「같은 문장 사흘」을 끊는 자리다. */
  for (const s of ['전날', '예비', '도입']) assert.equal(갈래판정({ ...기본, 전날출처: s }).갈래, '예비', s);
  /* 미지 출처는 «안전한 쪽»(예비)으로 — 「전날」로 접으면 구멍이 조용히 남는다. */
  assert.equal(갈래판정({ ...기본, 전날출처: null }).갈래, '예비');
  assert.equal(갈래판정({ ...기본, 전날출처: '처음보는값' }).갈래, '예비');
  /* 예비가 없으면(초급) 예전 그대로 도입 폴백. */
  assert.equal(갈래판정({ 전날문장: 'x', 전날출처: '예비', 예비있음: false }).갈래, '도입폴백');
});

test('🔴 ⑥ 첫날·교정문 판정은 예비있음·전날출처와 «무관»하다 — deliver/생성모드 사유 게이트가 그 위에 선다', () => {
  for (const 예비있음 of [true, false]) {
    for (const 전날출처 of [null, '생성', '교정문', '전날', '예비', '도입', '엉뚱']) {
      assert.equal(갈래판정({ 첫날: true, 교정문: '교정', 전날문장: 'x', 전날출처, 예비있음 }).갈래, '첫날');
      assert.equal(갈래판정({ 교정문: '교정', 전날문장: 'x', 전날출처, 예비있음 }).갈래, '교정문');
    }
  }
});

test('⑦ 예비는 문장·질문이 «한 벌»로 나간다 — 채점된 적 없는 짝을 만들지 않는다', () => {
  const 골라 = 예비.고르기({ 급수: 'Lv6', learner_id: L, 날짜: '2026-09-10' });
  const r = 오늘과제({ 날짜: '2026-09-10', 급수: 'Lv6', learner_id: L, 전날문장: 'x', 전날출처: '예비' });
  assert.equal(r.출처, '예비');
  assert.equal(r.degraded, true, '예비는 강등이다 — 행에서 정상 생성과 구별돼야 한다');
  assert.equal(r.task_snapshot.호흡[0].문장, 골라.문장);
  assert.equal(r.task_snapshot.호흡[1].프롬프트, 골라.질문, '질문만 도입 것으로 갈렸다 — 채점 안 된 짝이 나간다');
});

test('⑧ learner_id 가 없으면 예비를 못 고른다 — 도입 폴백으로 안전하게 넘어진다', () => {
  const r = 오늘과제({ 날짜: '2026-09-10', 급수: 'Lv5', 전날문장: 'x', 전날출처: '예비' });
  assert.equal(r.출처, '도입');
});

test('⑨ 풀 전량이 계약을 지킨다 — 빈 칸 0 · 문장 중복 0', () => {
  const { 예비과제: 풀 } = require('../contents/예비과제풀.js');
  const 본문장 = new Set();
  let 총 = 0;
  for (const [급수, 목록] of Object.entries(풀)) {
    assert.match(급수, /^Lv[3-6]$/, `초급이 풀에 들었다: ${급수}`);
    for (const x of 목록) {
      총 += 1;
      assert.ok(x.문장 && x.질문, `${급수} 에 빈 칸이 있다`);
      assert.ok(x.질문.endsWith('?'), `질문이 ? 로 안 끝난다: ${x.질문}`);
      assert.equal(본문장.has(x.문장), false, `문장 중복: ${x.문장}`);
      본문장.add(x.문장);
    }
  }
  assert.ok(총 >= 40, `풀이 ${총}벌뿐이다`);
});

/* 🔴 풀의 출처가 «3회전 하나»인 것을 못박는다 — 유호 확정 08-26 「3회전 것이 제일 퀄리티가 괜찮았어」.
 * 옛 회전을 슬쩍 다시 섞으면 여기가 빨개진다(벌 수가 늘어 좋아 보이는 방향이라 더 위험하다). */
test('⑩ 풀은 3회전(v5) 산출만이다 — 옛 회전이 섞이면 빨강 (유호 확정 08-26)', () => {
  const { 예비과제: 풀 } = require('../contents/예비과제풀.js');
  const 판들 = new Set();
  for (const 목록 of Object.values(풀)) for (const x of 목록) 판들.add(x.판);
  assert.deepEqual([...판들], ['v5'], `풀에 v5 아닌 판이 섞였다: ${[...판들].join(',')}`);
});
