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

test('새 문항은 초급(1~2·미정)에게 G1 을 안 낸다 — 판정은 오늘과제.초급인가 하나', () => {
  /* ⚠ 이 픽스처는 **G1 팩만** 확정이다. 그래서 초급의 산출은 여기서 여전히 null 인데, 그
   *   null 의 뜻이 08-12 에 바뀌었다: 「게임에서 제외」가 아니라 「G1 이 아니다 · G2 팩이
   *   확정되면 G2 가 나간다」다. 그 갈래는 아래 ⑦ 절이 두 팩 확정 픽스처로 따로 잰다 —
   *   여기서만 재면 이 통과가 **공허하다**(초급이 G2 로도 안 가는 날에도 초록이다). */
  for (const 급수 of ['Lv1', 'Lv2', null, '중급']) {
    assert.equal(게임배정(기본({ 급수 })), null, `급수 ${String(급수)} 에 격식 메일 쓰기(G1)가 나갔다`);
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
  /* ⚠ [2026-08-13] 픽스처가 G4 → 합성 id 로 옮겨 갔다(G4 등재 커밋 — 4모듈이 전부 섰다).
   *   축은 한 글자도 안 바뀐다 — 「등재 «전»에는 안 나간다」. 실물 미등재 모듈이 다 떨어져
   *   합성 id 를 쓴다(`tests/게임스냅샷.test.js` ⑥ 미등록 픽스처와 같은 id — 실재 id 충돌 0).
   *   🔑 등재 «후» 판정(공개 키만 산다)은 `tests/게임스냅샷.test.js` 몫. */
  const 미래판 = { challenge_id: 'g9-미등록모듈', 지시문: 'x', 질문: 'x', 정답: '기준 교정문' };
  assert.deepEqual(학생판스냅샷(미래판), {},
    '등재 전 모듈은 안 나간다 — 화면이 비어 사람이 오는 것이 허용목록의 설계다');
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

/* ═══════════ ⑦ 초급 갈래 = G2 「보고서 교정」 (3단계 · 08-12) ═══════════
 *
 * 위 ③ 절의 「초급에 G1 을 안 낸다」는 **G1 팩만 확정인 픽스처**에서 잰 것이라, 초급이 G2
 * 로도 안 가는 날에도 초록이다. 그 공허를 닫으려면 **두 팩이 다 확정된 판**이 필요하다.
 * 여기가 그 자리다 — 재는 것은 셋: ⓐ 초급이 G2 를 받는다 ⓑ 그 위는 여전히 G1 이다
 * ⓒ G2 게이트는 **자기 팩**을 본다(G1 확정이 G2 를 열지 못한다 — 새는 방향은 「통과」다).
 */
const G2팩경로 = path.join(ROOT, 'contents', '보고서교정문항.js');
const G2팩원문 = fs.readFileSync(G2팩경로, 'utf8');
const G2확정소스 = G2팩원문.replace('const 검수확정 = false;', 'const 검수확정 = true;');
assert.notEqual(G2확정소스, G2팩원문, 'G2 팩의 검수확정 선언 표기가 바뀌었다 — 이 치환부터 고쳐라');
const 두팩소스 = new Map([[팩경로, 확정팩소스], [G2팩경로, G2확정소스]]);
const 두팩캐시 = new Map();
const {
  게임배정: 두팩배정, G2앵커전부, 초급급수대, G2챌린지, G2재제출앵커들,
} = 세우기(배정경로, fetch금지, { 캐시: 두팩캐시, 바꾼소스: 두팩소스 });
const {
  앉음편성: 두팩앉음편성, 대조문항인가: 두팩대조인가, 급수대풀: 두팩급수대풀, 문항들: 두팩문항들,
} = 세우기(G2팩경로, fetch금지, { 캐시: 두팩캐시, 바꾼소스: 두팩소스 });

test('ⓐ 초급(1~2·미정)은 **G2** 를 받는다 — 「제외」가 아니라 「다른 모듈로 보낸다」', () => {
  for (const 급수 of ['Lv1', 'Lv2', null, '중급']) {
    const r = 두팩배정(기본({ 급수 }));
    assert.ok(r, `급수 ${String(급수)} 가 빈손이다 — 초급의 ㉡ 재료가 0 으로 돌아갔다`);
    assert.equal(r.task_snapshot.challenge_id, 'g2-보고서교정');
    assert.equal(r.출처, '게임G2');
    assert.equal(r.task_ref, `task-${화요일}`, 'task_ref 는 날짜에서만 판다(⑩ 확정 1)');
    assert.equal(r.retry_of_event_id, null, '새 문항 배정이 결과 변수 고리를 지어냈다 — 재제출 갈래는 ⑧이 잰다');
  }
});

test('ⓑ 초급이 아니면 여전히 G1 이다 — 갈림이 급수 하나에서만 난다', () => {
  const r = 두팩배정(기본({ 급수: 'Lv3' }));
  assert.equal(r.task_snapshot.challenge_id, 'g1-교수멘탈');
  assert.equal(r.출처, '게임');
});

test('ⓒ G2 게이트는 **자기 팩**을 본다 — G1 확정이 G2 를 열지 못한다(fail-closed)', () => {
  /* `게임배정` 은 G1 팩만 확정인 인스턴스다(위 ⓪ 절). 거기서 초급은 null 이어야 한다 —
   *  참이 아니면 미검수 G2 문항이 학생에게 열린다(팩 §3 이 막으려던 바로 그것). */
  assert.equal(게임배정(기본({ 급수: 'Lv1' })), null, '🔴 미검수 G2 판이 배정으로 나갔다');
});

test('ⓓ 앵커는 결정적이고, 그 앵커가 여는 앉음은 «오류 2 + 대조 1» 이다 (§9-③ 분모)', () => {
  const a = 두팩배정(기본({ 급수: 'Lv1' }));
  const b = 두팩배정(기본({ 급수: 'Lv1' }));
  assert.equal(a.task_snapshot.prompt_seed, b.task_snapshot.prompt_seed, '같은 (학생,날짜)가 다른 앵커를 냈다');
  assert.ok(G2앵커전부.includes(a.task_snapshot.prompt_seed), '고른 앵커가 앵커 공간 밖이다');
  assert.notEqual(두팩배정(기본({ 급수: 'Lv1', 날짜: 금요일 })).task_snapshot.prompt_seed,
    a.task_snapshot.prompt_seed, '날이 달라도 같은 앵커다 — 배분 축에 날짜가 안 들어갔다');

  const 앉음 = 두팩앉음편성(a.task_snapshot.prompt_seed);
  assert.equal(앉음.length, 3, '앉음은 3문항이다(발주 §4 「보고서 교정 · 3문장」)');
  assert.equal(new Set(앉음).size, 3, '같은 문항이 두 번 떴다 — 한 앉음 안의 중복은 분모를 깬다');
  assert.equal(앉음.filter(두팩대조인가).length, 1,
    '🔴 대조 문항이 정확히 하나가 아니다 — 과잉 교정률의 분모가 날마다 흔들린다(§9-③)');
  assert.ok(앉음.includes(a.task_snapshot.prompt_seed), '배정 행이 실은 앵커가 화면에 안 뜬다');
});

test('ⓔ 앵커 전수 — 편성이 언제나 서고, 대조 자리는 세 자리에 **다** 난다(자리 암기 차단)', () => {
  const 자리수 = [0, 0, 0];
  for (const 앵커 of G2앵커전부) {
    const 앉음 = 두팩앉음편성(앵커);
    assert.ok(앉음, `앵커 ${앵커} 가 앉음을 못 연다 — 앵커 목록이 편성 가능성을 안 걸렀다`);
    assert.equal(앉음.filter(두팩대조인가).length, 1, `앵커 ${앵커} 의 대조가 하나가 아니다`);
    자리수[앉음.findIndex(두팩대조인가)] += 1;
  }
  assert.ok(G2앵커전부.length > 0, '앵커가 0개다 — 초급 급수대 풀이 비었다');
  /* 🔴 「셔플했다」가 아니라 «세 자리가 실제로 난다»를 잰다 — 상수 자리를 내는 셔플도
   *   코드로는 셔플처럼 생겼고, 그 차이는 학생이 자리를 외울 수 있느냐다(채택된 「한 수 더」). */
  for (let i = 0; i < 3; i += 1) {
    assert.ok(자리수[i] > 0, `대조가 ${i}번 자리에 한 번도 안 선다 — 자리를 외울 수 있다`);
  }
});

test('ⓕ 앉음은 앵커의 급수대를 안 벗어난다 — 한 앉음이 두 급수대에 걸치면 집계가 섞인다', () => {
  /* 🔴 기대값을 `급수대풀()` 로 만들지 않는다 — 그건 **검사 대상이 쓰는 바로 그 함수**라,
   *   필터가 죽는 변이에서 둘이 같이 고장 나 이 시험이 초록이 된다(실측: 그 변이가 안 잡혔다).
   *   그래서 팩의 **원자료**(`문항들[].급수대`)에서 뽑는다 — 「기대값은 대상과 다른 데서 온다」. */
  const 급수대of = new Map(두팩문항들.map((문항) => [문항.문항id, 문항.급수대]));
  for (const 앵커 of G2앵커전부) {
    for (const id of 두팩앉음편성(앵커)) {
      assert.equal(급수대of.get(id), 초급급수대, `앵커 ${앵커} 의 앉음에 ${id}(급수대 ${급수대of.get(id)})가 섞였다`);
    }
  }
  /* 풀 자체도 원자료와 대조한다 — 위 문장이 통과하려면 풀이 초급대만 담아야 하고,
   * 그 사실을 여기서 «따로» 못박아야 `급수대풀` 이 넓어지는 변이가 어느 쪽에서든 걸린다. */
  const 풀 = 두팩급수대풀(초급급수대);
  for (const id of 풀.오류.concat(풀.대조)) {
    assert.equal(급수대of.get(id), 초급급수대, `급수대풀이 ${id}(다른 급수대)를 담았다`);
  }
});

test('ⓖ 대조 문항은 앵커가 될 수 없다 — 되면 「오류 2」를 못 채운다', () => {
  for (const 대조 of 두팩급수대풀(초급급수대).대조) {
    assert.equal(두팩앉음편성(대조), null, `대조 문항 ${대조} 가 앵커로 섰다`);
  }
  assert.equal(두팩앉음편성('없는문항'), null, '모르는 문항 — 지어내지 않는다');
  assert.equal(두팩앉음편성(''), null);
});

/* ═══════════ ⑧ G2 재제출 — H3 조인 넓히기 (08-13 소트랙) ═══════════
 *
 * deliver 의 H3 조인이 G1 한정을 벗고 챌린지를 함께 걷는다. 여기는 그 값이 닿는 판정을
 * 잰다 — 재는 것은 넷: ⓐ G2 재제출이 원 문항 그대로 선다 ⓑ 모듈은 급수가 아니라 원
 * 챌린지가 가른다 ⓒ 세울 수 없는 원 제출(대조 문항)은 접는다 ⓓ SQL 필터 목록(`G2재제출
 * 앵커들`)이 팩 원자료와 갈라지지 않는다(기대값은 대상과 다른 데서 — ⓕ 교훈 그대로). */

test('⑧ⓐ G2 재제출 재배정 — 원 문항 그대로 · retry_of 동봉 · 짚음 행 규격', () => {
  const 원사건 = 'abababab-0000-4000-8000-000000000007';
  const 앵커 = G2재제출앵커들[0];
  assert.ok(앵커, 'G2 재제출 앵커 목록이 비었다 — 팩이 앉음을 하나도 못 세운다');
  const r = 두팩배정(기본({ 재제출: { 원사건, 원시드: 앵커, 원챌린지: G2챌린지 } }));
  assert.ok(r, 'G2 재제출 재료가 있는데 배정이 안 섰다');
  assert.equal(r.retry_of_event_id, 원사건, '결과 변수 고리가 안 실렸다(⑩ ⓑ)');
  assert.equal(r.task_snapshot.prompt_seed, 앵커, '재제출은 «같은 문항»을 다시 쓴다 — 새 문항을 지어내지 않는다');
  assert.equal(r.task_snapshot.challenge_id, G2챌린지);
  assert.equal(r.task_type, '숙제제출', 'G2 배정 행의 통로는 짚음(숙제제출)이다');
  assert.equal(r.task_ref, `task-${화요일}`, 'task_ref 는 날짜에서만 판다(⑩ 확정 1)');
  assert.equal(r.출처, '게임G2재제출');
});

test('⑧ⓑ 모듈은 급수가 아니라 원 챌린지가 가른다 — 승급한 학생의 G2 재제출도 G2 로 돌아간다', () => {
  const r = 두팩배정(기본({
    급수: 'Lv5',
    재제출: { 원사건: 'abababab-0000-4000-8000-000000000008', 원시드: G2재제출앵커들[0], 원챌린지: G2챌린지 },
  }));
  assert.ok(r, '상급 급수라고 G2 재제출이 접혔다 — 원 제출 실재가 급수 추정보다 강하다(머리말 ⑤)');
  assert.equal(r.task_snapshot.challenge_id, G2챌린지);
  /* 맞짝 — 원챌린지 없는 재제출은 넓히기 전의 조인(G1 만 걷음)과 같은 뜻이다. */
  const g1 = 두팩배정(기본({ 재제출: { 원사건: 'abababab-0000-4000-8000-000000000009', 원시드: 시드전부[0] } }));
  assert.equal(g1.task_snapshot.challenge_id, 게임챌린지, '원챌린지 없는 재제출이 G1 로 안 돌아갔다');
});

test('⑧ⓒ 대조 문항 원 제출은 접는다 — 앉음이 원리상 못 서는 재배정을 지어내지 않는다', () => {
  const 대조 = 두팩문항들.find((문항) => !('교정문' in 문항));
  assert.ok(대조, '팩에 대조 문항이 없다 — 픽스처 전제부터 무너졌다');
  const r = 두팩배정(기본({
    재제출: { 원사건: 'abababab-0000-4000-8000-00000000000a', 원시드: 대조.문항id, 원챌린지: G2챌린지 },
  }));
  assert.equal(r, null, '대조 문항 앵커로 재배정이 섰다 — 화면은 앉음을 못 열고 그날이 깨진다');
});

test('⑧ⓓ G2 게이트는 자기 팩을 본다 — G1 만 확정인 판에서 G2 재제출은 null (fail-closed)', () => {
  const r = 게임배정(기본({
    재제출: { 원사건: 'abababab-0000-4000-8000-00000000000b', 원시드: G2재제출앵커들[0], 원챌린지: G2챌린지 },
  }));
  assert.equal(r, null, '🔴 미검수 G2 판이 재제출 배정으로 나갔다');
});

test('⑧ⓔ SQL 필터 목록이 팩 원자료와 갈라지지 않는다 — 기대값은 대상과 다른 데서 온다', () => {
  /* 앵커 성립 = 오류 문항 + 그 급수대 풀이 「오류 2·대조 1」을 채운다 — `앉음편성` 을 다시
   * 부르지 않고 팩 원자료(`문항들`)에서 같은 규칙을 따로 센다(ⓕ 와 같은 축: 필터가 죽는
   * 변이에서 기대값까지 같이 죽는 것을 막는다). */
  const 셈 = new Map();
  for (const 문항 of 두팩문항들) {
    const 칸 = 셈.get(문항.급수대) || { 오류: 0, 대조: 0 };
    칸['교정문' in 문항 ? '오류' : '대조'] += 1;
    셈.set(문항.급수대, 칸);
  }
  /* ⚠ `두팩문항들` 은 vm 다른 realm 의 배열이다 — 거기에 filter/map 을 바로 부르면 산출의
   * 프로토타입이 저쪽 Array.prototype 이라 deepEqual 이 값이 같아도 진다(실측). 스프레드로
   * 이쪽 realm 배열을 만들고 나서 조립한다. */
  const 기대 = [...두팩문항들]
    .filter((문항) => '교정문' in 문항)
    .filter((문항) => 셈.get(문항.급수대).오류 >= 2 && 셈.get(문항.급수대).대조 >= 1)
    .map((문항) => 문항.문항id);
  assert.deepEqual([...G2재제출앵커들], 기대,
    'G2재제출앵커들이 팩 원자료와 갈라졌다 — 갈라진 쪽의 재제출은 조용히 0건이 된다');
  assert.ok(기대.length > 0, '앵커가 0개다 — H3 의 G2 축이 통째로 죽는다');
});
