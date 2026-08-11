/* 게임배정 회귀 — 배정 배선 ④ 의 순수 판정(`lib/게임배정.js` · 발주_게임모듈.md §6-6 ⑩·⑪).
 *
 * ■ ⑩ 이 못박은 ④ 인수 조건 세 갈래가 여기 산다
 *   ⓐ 배정 `task_ref` 날짜 축 · ⓑ 재제출 재배정에 `retry_of_event_id` 동봉 ·
 *   ⓒ 같은 `task_ref` 재배정 0(키가 날짜에서만 파생됨을 행동으로 — 물리층은 멱등키가 진다).
 *
 * ■ 검수확정 게이트는 두 인스턴스로 잰다 (`tests/게임제출.test.js` ⓪ 와 같은 축)
 *   실팩(false)은 fail-closed 를 현재 상태 그대로, 확정팩(소스 치환 픽스처)은 게이트 뒤의
 *   판정 전부를 — 실팩으로는 모든 갈래가 null 이라 판정이 한 줄도 안 돈다.
 *
 * ■ 세 맹점(CLAUDE.md): 탐지력은 위반 픽스처(교정문·초급·못 펴는 시드)가 지고, 계약 결속은
 *   서술이 아니라 계약 JSON 을 실제로 읽어 잰다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { 세우기 } = require('./lib/앱모듈세우기.js');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const fetch금지 = () => { throw new Error('게임배정은 fetch 를 부르지 않는다'); };
const 배정경로 = path.join(ROOT, 'lib', '게임배정.js');
const 팩경로 = path.join(ROOT, 'contents', '교수멘탈문항.js');

/* 실팩(검수확정=false) — fail-closed 게이트를 현재 상태 그대로 잰다. */
const 실판 = require('../lib/게임배정.js');

/* 확정팩 픽스처 — 몽골어 검수가 확정된 날의 팩. */
const 팩원문 = fs.readFileSync(팩경로, 'utf8');
const 확정팩소스 = 팩원문.replace('const 검수확정 = false;', 'const 검수확정 = true;');
assert.notEqual(확정팩소스, 팩원문, '픽스처 치환이 실제로 일어났다 — 팩의 검수확정 선언 표기가 바뀌었으면 이 치환부터 고쳐라');
const 캐시 = new Map();
const 바꾼소스 = new Map([[팩경로, 확정팩소스]]);
const { 게임배정, 게임날인가, 시드전부, 재제출의사, 게임챌린지 } = 세우기(배정경로, fetch금지, { 캐시, 바꾼소스 });
const { G1스냅샷, 스냅샷키들 } = 세우기(path.join(ROOT, 'lib', '게임스냅샷.js'), fetch금지, { 캐시, 바꾼소스 });
const { 학생판스냅샷 } = 세우기(path.join(ROOT, 'lib', '오늘과제.js'), fetch금지, { 캐시, 바꾼소스 });
const { 모듈상수 } = 세우기(팩경로, fetch금지, { 캐시, 바꾼소스 });

/* 요일 닻 — 2026-08-17 이 월요일이라는 것은 이 저장소의 실운영 값이다(주간 리포트 배치). */
const 화요일 = '2026-08-11', 수요일 = '2026-08-12', 금요일 = '2026-08-14', 월요일 = '2026-08-10';
const 기본 = (덧 = {}) => ({
  learner_id: 'aaaaaaaa-0000-4000-8000-000000000001',
  날짜: 화요일, 첫날: false, 교정문: null, 급수: 'Lv3', 재제출: null, ...덧,
});

/* ─────────────────── ⓪ 검수확정 게이트 — fail-closed ─────────────────── */

test('🔴 검수확정=false(실팩)면 게임배정이 null — 미검수 판은 배정 통로에 안 선다(④ 인수: 게이트)', () => {
  assert.equal(실판.게임배정(기본()), null,
    '미검수 판이 배정으로 나왔다 — 팩 §3 「배정 통로는 검수확정 true 인 판만 받는다」가 여기다');
});

test('같은 재료가 확정팩에서는 선다 — 위 null 이 게이트의 몫임을 맞짝으로 못박는다', () => {
  assert.ok(게임배정(기본()), '확정 팩인데도 null — 게이트가 팩 export 를 안 읽고 값을 박았다');
});

/* ─────────────────── ① 게임날 — 화·금 (판정안 · ⑪) ─────────────────── */

test('게임날 판정 — 화·금만 참, 그 밖은 거짓, 날짜꼴이 아니면 던진다', () => {
  assert.equal(게임날인가(화요일), true);
  assert.equal(게임날인가(금요일), true);
  assert.equal(게임날인가(수요일), false);
  assert.equal(게임날인가(월요일), false);
  /* 생성자 대조가 아니라 메시지 대조다 — vm 인스턴스의 TypeError 는 호스트 렐름과 다른 종이라
   * `assert.throws(fn, TypeError)` 가 던져도 진다(앱모듈세우기 경유의 성질). */
  assert.throws(() => 게임날인가('2026-8-11'), /YYYY-MM-DD/);
  assert.equal(게임배정(기본({ 날짜: 수요일 })), null, '게임날이 아니면 게임이 없다 — 말하기가 나간다');
});

/* ─────────────────── ② ⑩ 인수 세 갈래 ─────────────────── */

test('ⓐ 배정 task_ref 는 날짜에서만 판다 — task-${날짜} · 날이 다르면 키가 다르다', () => {
  const 화 = 게임배정(기본());
  const 금 = 게임배정(기본({ 날짜: 금요일 }));
  assert.equal(화.task_ref, `task-${화요일}`);
  assert.equal(금.task_ref, `task-${금요일}`);
  assert.notEqual(화.task_ref, 금.task_ref, '챌린지 상수 키는 둘째 게임날부터 영구 잠김이다(⑩ 기전)');
});

test('ⓑ 재제출 재배정은 retry_of_event_id 를 동봉하고 원 문항(시드)을 그대로 다시 편다', () => {
  const 원사건 = 'bbbbbbbb-0000-4000-8000-000000000002';
  const r = 게임배정(기본({ 재제출: { 원사건, 원시드: 'g1t02.s1d2' } }));
  assert.ok(r, '재제출 재료가 있는데 배정이 안 섰다');
  assert.equal(r.retry_of_event_id, 원사건, '유일한 결과 변수의 고리가 비었다(L0 §9-2)');
  assert.equal(r.task_snapshot.prompt_seed, 'g1t02.s1d2', '재제출은 «같은 메일»을 다시 쓴다 — 새 문항을 지어내지 않는다');
  assert.equal(r.출처, '게임재제출');
  assert.equal(게임배정(기본()).retry_of_event_id, null, '새 문항 배정에 고리를 지어내지 않는다 — 첫 제출이 재시도로 둔갑한다');
});

test('ⓒ 재제출도 «오늘» 키를 받는다 — 원 배정의 task_ref 로 되돌아갈 입력 자리 자체가 없다', () => {
  const r = 게임배정(기본({ 날짜: 금요일, 재제출: { 원사건: 'cccccccc-0000-4000-8000-000000000003', 원시드: 'g1t01.s0d1' } }));
  assert.equal(r.task_ref, `task-${금요일}`,
    '재제출 배정의 키는 원 제출 날이 아니라 배정일이다 — 같은 키 재배정은 대기 화면 영구 잠김이다(⑩)');
  /* 같은 키 «재삽입» 의 물리층은 멱등키(task:{learner}:{날짜})가 진다 — deliver 게임 갈래 주석. */
});

/* ─────────────────── ③ 우선순위 갈래 ─────────────────── */

test('🔴 C3 — 미배달 교정문이 있으면 게임을 미룬다(재제출 대기 중에도)', () => {
  assert.equal(게임배정(기본({ 교정문: '어제 문장 교정' })), null,
    '게임 배정이 교정 워터마크를 밀면 미배달 교정문이 영구 증발한다');
  assert.equal(게임배정(기본({
    교정문: '어제 문장 교정',
    재제출: { 원사건: 'dddddddd-0000-4000-8000-000000000004', 원시드: 'g1t01.s0d1' },
  })), null, '재제출 닻은 재배정 부재라 날을 놓쳐도 안 사라진다 — 교정문은 그날뿐이다');
});

test('첫날은 게임이 없다 — 첫 발화 기준선(§4-5)은 소급 불가다', () => {
  assert.equal(게임배정(기본({ 첫날: true })), null);
});

test('새 문항은 초급(1~2·미정)을 제외한다 — 판정안(⑪ · 유호님 이의 자리) · 판정은 오늘과제.초급인가 하나', () => {
  for (const 급수 of ['Lv1', 'Lv2', null, '중급']) {
    assert.equal(게임배정(기본({ 급수 })), null, `급수 ${String(급수)} 에 쓰기 게임이 나갔다`);
  }
  assert.ok(게임배정(기본({ 급수: 'Lv3' })), '3급이 초급으로 접혔다 — 표기 숫자 추출이 죽었다');
});

test('재제출은 초급 게이트를 안 지난다 — 원 제출 실재가 급수 추정보다 강하다', () => {
  const r = 게임배정(기본({ 급수: null, 재제출: { 원사건: 'eeeeeeee-0000-4000-8000-000000000005', 원시드: 'g1t03.s2d0' } }));
  assert.ok(r, '급수 미정이라고 결과 변수의 고리를 끊었다');
  assert.equal(r.retry_of_event_id, 'eeeeeeee-0000-4000-8000-000000000005');
});

/* ─────────────────── ④ 시드 — 결정성·공간 전체 ─────────────────── */

test('새 문항 시드는 결정적이다 — 같은 (학생, 날짜) = 같은 시드 (재실행이 duplicate 접힘과 아귀가 맞는 전제)', () => {
  const a = 게임배정(기본());
  const b = 게임배정(기본());
  assert.equal(a.task_snapshot.prompt_seed, b.task_snapshot.prompt_seed);
  assert.ok(시드전부.includes(a.task_snapshot.prompt_seed), '고른 시드가 시드 공간 밖이다');
});

test('시드 공간 45벌 전체가 펴진다 — 팩 목록에서 파생하므로 팩 개정이 여기 닿는다', () => {
  assert.equal(시드전부.length, 45, '팩 5문항×사유3×세부3 — 수가 바뀌었으면 팩 개정이다(판·집계 함께 본다)');
  for (const 시드 of 시드전부) assert.ok(G1스냅샷(시드), `못 펴는 시드가 공간에 있다: ${시드}`);
});

test('배분이 실제로 갈린다 — 다른 학생이 다른 시드를 받는 사례가 존재한다', () => {
  const 첫 = 게임배정(기본()).task_snapshot.prompt_seed;
  let 갈림 = false;
  for (let i = 2; i < 40 && !갈림; i += 1) {
    const id = `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`;
    갈림 = 게임배정(기본({ learner_id: id })).task_snapshot.prompt_seed !== 첫;
  }
  assert.ok(갈림, '40명이 전부 같은 시드다 — 해시가 배분을 안 한다');
});

test('재제출인데 원시드를 못 펴면 게임을 접는다 — 지어내지 않는다(말하기 폴백)', () => {
  const 재제출 = { 원사건: 'ffffffff-0000-4000-8000-000000000006', 원시드: 'g1t99.s0d0' };
  assert.equal(게임배정(기본({ 재제출 })), null, '팩에서 사라진 문항을 지어 폈다');
  assert.equal(게임배정(기본({ 재제출: { ...재제출, 원시드: null } })), null, '시드 없는 재제출이 섰다');
});

/* ─────────────────── ⑤ 계약·정본 결속 ─────────────────── */

test('재제출의사·task_type 이 계약 값목록의 구성원이다 — 갈라지면 H3 조인이 조용히 0건이 된다', () => {
  assert.ok(계약.learning_events.값목록.learner_response.includes(재제출의사),
    `재제출의사 «${재제출의사}» 가 계약 learner_response 값목록에 없다`);
  const r = 게임배정(기본());
  assert.ok(계약.learning_events.값목록.task_type.includes(r.task_type),
    `배정 통로 «${r.task_type}» 가 계약 task_type 값목록에 없다`);
});

test('게임챌린지는 팩 정본의 지목이다 — H3 조인 술어가 값 사본이 아니다', () => {
  assert.equal(게임챌린지, 모듈상수.challenge_id);
});

test('배정 행 규격 — 키 목록·판·통로 (deliver 가 이 모양을 그대로 싣는다)', () => {
  const r = 게임배정(기본());
  assert.deepEqual(Object.keys(r).sort(),
    ['task_ref', 'task_type', 'task_snapshot', 'task_schema_ver', 'retry_of_event_id', 'degraded', '출처'].sort());
  assert.equal(r.task_type, '숙제제출');
  assert.equal(r.task_schema_ver, 'g1스냅샷.v1', '스냅샷 «모양»의 판 — 말하기 task.v1 과 다른 축이다');
  assert.equal(r.degraded, false);
  assert.deepEqual(Object.keys(r.task_snapshot).sort(), [...스냅샷키들].sort(),
    '배정 스냅샷이 §6-8 6키 조립(G1스냅샷)을 안 지났다');
});

/* ─────────────────── ⑥ C1 — 학생 거름망이 게임 판을 안다 ─────────────────── */

test('🔴 C1 — G1 스냅샷이 학생판스냅샷을 6키 그대로 지난다(허용목록이 게임을 벗기던 자리)', () => {
  const snap = G1스냅샷('g1t01.s0d1');
  assert.ok(snap, '픽스처 시드가 안 펴진다');
  assert.deepEqual(학생판스냅샷(snap), { ...snap },
    '거름망이 G1 키를 벗겼다 — 앱은 게임을 원리상 못 보고 증상은 「오늘 과제를 읽지 못했어요」뿐이다');
});

test('C1 허용목록 — 표 밖 키는 벗겨지고, 모르는 챌린지는 전부 벗겨진다(새 키·새 모듈 기본값 = 안 나감)', () => {
  const 심은판 = { ...G1스냅샷('g1t01.s0d1'), 요구문형: '모범 문형 — 화면 비노출 재료' };
  assert.equal('요구문형' in 학생판스냅샷(심은판), false, '비공개 재료가 학생 응답으로 샜다');
  const 미래판 = { challenge_id: 'g2-보고서교정', 지시문: 'x', 질문: 'x', 정답: '기준 교정문' };
  assert.deepEqual(학생판스냅샷(미래판), {},
    'G2 판은 등재 전까지 안 나간다 — 화면이 비어 사람이 오는 것이 허용목록의 설계다');
});

test('말하기 판은 종전 그대로다 — 게임 갈래가 말하기 거름망을 건드리지 않았다', () => {
  const snap = {
    ver: 1, 날짜: 화요일, 몰래: 'x',
    호흡: [{ 차례: 2, 무엇: '따라 말하기', task_format: '낭독', 문장: 'ㅁ', 출처: '도입' }],
  };
  const 판 = 학생판스냅샷(snap);
  assert.equal('몰래' in 판, false);
  assert.equal(판.ver, 1);
  assert.equal(판.호흡[0].문장, 'ㅁ');
});
