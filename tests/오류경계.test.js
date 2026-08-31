'use strict';
/* 오류경계 회귀 (감사 G2-3) — 화면 하나의 렌더 예외가 앱 전체 크래시가 되지 않는다.
 *
 * 🔴 **renderToString 은 오류 경계를 안 태운다**(React SSR 규격 — 던진 예외가 그대로 위로
 *   올라온다). 그래서 「자식이 던진다 → fallback 이 선다」 한 방을 이 층은 원리상 못 그린다.
 *   갈라 잰다 — 화면렌더.test.js ⑩ 이 핸들러 갈래를 소스로 재는 것과 같은 규율이다:
 *   ① fallback 조각(넘어짐판)은 실렌더로(화면세우기 통로 · S1-5 이름 내보냄 무늬)
 *   ② 전환 판정(getDerivedStateFromError)·관측보고 배선(componentDidCatch)·버튼 배선은
 *      인스턴스 직접 호출로 — 셋 다 렌더 밖의 순수 동작이라 이 방식이 지어낸 값이 아니다. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 그리기, ROOT } = require('./lib/화면세우기.js');

test('① 넘어짐판 — fallback 문구와 「말하기로 돌아가기」 버튼이 실제로 그려진다', () => {
  /* 문구는 여기서 짓지 않는다 — 정본은 contents/문구_오류.js 의 경계문구다(화면은 배치만). */
  const { 경계문구 } = require(path.join(ROOT, 'contents', '문구_오류.js'));
  assert.ok(경계문구 && 경계문구.ko, '정본에 경계문구가 없다 — fallback 이 그릴 재료가 없다');
  const 글 = 그리기('src/오류경계.js', { 되세우기() {} }, '넘어짐판');
  assert.ok(글.includes(경계문구.ko), 'fallback 문구가 화면에 없다 — 학생은 빈 화면을 고장으로 읽는다');
  assert.match(글, /말하기로 돌아가기/, '되세우는 버튼이 없다 — 학생이 깨진 화면에 갇힌다');
});

test('② 멀쩡할 때는 자식을 그대로 낸다 — 경계가 화면에 아무 흔적도 안 남긴다', () => {
  const 글 = 그리기('src/오류경계.js', { 화면이름: '말하기', 되세우기() {}, children: '멀쩡한 화면 글' });
  assert.match(글, /멀쩡한 화면 글/, '자식이 안 그려졌다 — 경계가 정상 렌더를 막는다');
  assert.doesNotMatch(글, /말하기로 돌아가기/, '멀쩡한데 fallback 이 섞여 나왔다');
});

test('③ 렌더 예외 → 깨짐 — getDerivedStateFromError 가 fallback 상태를 세운다', () => {
  const 오류경계 = require(path.join(ROOT, 'src', '오류경계.js')).default;
  assert.deepEqual(오류경계.getDerivedStateFromError(new Error('렌더 사망')), { 깨짐: true });
});

test('④ componentDidCatch 가 관측보고를 부른다 — 키는 ASCII(spot·screen · 밖으로 나가는 키 규약)', () => {
  /* 관측이 꺼진 판에서 관측보고는 false 만 내고 조용하다 — 「불렀는가」는 그 자리를 갈아 끼워 잰다.
   * 화면세우기 통로의 babel CJS 변환은 호출 시점에 exports 프로퍼티를 읽으므로 이 스파이가 실배선을 잰다. */
  const 관측 = require(path.join(ROOT, 'src', '관측.js'));
  const 원래 = 관측.관측보고;
  const 부른것 = [];
  관측.관측보고 = (오류, 맥락) => { 부른것.push({ 오류, 맥락 }); return true; };
  try {
    const 오류경계 = require(path.join(ROOT, 'src', '오류경계.js')).default;
    const inst = new 오류경계({ 화면이름: '답장', 되세우기() {} });
    inst.componentDidCatch(new Error('렌더 사망'));
  } finally {
    관측.관측보고 = 원래;
  }
  assert.equal(부른것.length, 1, '관측보고가 안 불렸다 — 화면이 죽어도 아무 데도 안 남는다');
  assert.equal(부른것[0].오류.message, '렌더 사망');
  assert.deepEqual(부른것[0].맥락, { spot: 'error_boundary', screen: '답장' },
    '맥락 키가 규약(ASCII 키 · 값은 화면 이름)과 다르다 — 한글 키는 도착지에서 조용히 사라진다');
});

test('⑤ 버튼이 되세우기를 부르고 깨짐을 해제한다 — 말하기로 «실제로» 돌아간다', () => {
  const 모듈 = require(path.join(ROOT, 'src', '오류경계.js'));
  let 되세움 = 0;
  const inst = new 모듈.default({ 화면이름: '검수', 되세우기: () => { 되세움 += 1; } });
  inst.state = { 깨짐: true };
  let 새상태 = null;
  inst.setState = (s) => { 새상태 = s; };
  const 요소 = inst.render();
  assert.equal(요소.type, 모듈.넘어짐판, '깨졌는데 fallback 조각(넘어짐판)이 아니다');
  요소.props.되세우기();
  assert.equal(되세움, 1, '되세우기(말하기로 가기)가 안 불렸다');
  assert.deepEqual(새상태, { 깨짐: false }, '깨짐이 안 풀렸다 — 말하기로 갔는데 fallback 이 계속 선다');
});
