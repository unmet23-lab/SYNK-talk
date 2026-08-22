/* 생성 상태 문구 회귀 — §12-11 어댑터 인수 조건의 «문구 칸» 반쪽 (상태기반 설계 §3-1 v5.6 · v5.9 갈래 23).
 *
 * ■ 무엇을 재나
 *   ① 네 값의 분기 — `생성중`·`오류` 는 안내를 내고(빈 과제 폴백과 «다르게 그린다»의 재료), `있음`·`없음`·
 *      칸 없음(구앱 규칙)은 null(기존 화면 그대로). 모르는 값은 「괜찮다」로 안 접는다(아는값 false).
 *   ② 문구 칸이 비어 있지 않다(§12-11 이 재는 전부 — 문구의 질은 카피 정본·synk-brand 게이트 몫).
 *   ③ synk-brand 바닥 — 금칙어 0 · 금칙 형태(혀 짧은 소리·내용 없는 응원) 0 · 이모지 0 · 몽골어는 비어 있다
 *      (지어낸 번역 금지) · 카피 확정 표식이 기계에 남는다(임시 문구임을 숨기지 않는다).
 *   ④ 과제API 가 `assignment_status` 를 그대로 싣는다(tests/과제API.test.js 가 진다 — 여기선 값 계약만). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { 카피확정, 생성문구, 안그림, 생성안내 } = require('../contents/문구_생성.js');

const 금칙어 = ['패배', '졌다', '실패', '불운', '하락', '부족', '안 됨', '늦었다'];
const 금칙형태 = ['이떠', '가치 ', '시퍼', '화이팅', '짱', '대박', '주인님'];
const 이모지 = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

test('① 분기 — 생성중·오류는 안내, 있음·없음·칸 없음은 null(구앱 규칙), 모르는 값은 아는값 false', () => {
  const 중 = 생성안내('생성중');
  const 오 = 생성안내('오류');
  assert.ok(중 && 중.아는값 && 중.제목.length && 중.본문.length, '생성중 안내가 없다 — 빈 배정과 같은 화면이 된다(§3-1 C3)');
  assert.ok(오 && 오.아는값 && 오.제목.length && 오.본문.length, '오류 안내가 없다');
  assert.notDeepEqual(중.제목, 오.제목, '생성중과 오류가 같은 글이면 「곧 온다」와 「못 왔다」를 못 가른다');
  assert.equal(오.보여줄값, '학생번호', '오류는 다음 한 걸음(선생님께 보여 주기)을 준다');
  for (const v of ['있음', '없음', null, undefined, '']) assert.equal(생성안내(v), null, `${String(v)} 는 안 그린다(기존 화면 그대로)`);
  assert.deepEqual([...안그림], ['있음', '없음']);
  const 모름 = 생성안내('대기중');
  assert.ok(모름 && 모름.아는값 === false && 모름.값 === '대기중' && 모름.제목.length, '모르는 값을 「괜찮다」로 접었다');
});

test('② 문구 칸이 비어 있지 않다 — §12-11 이 재는 전부(질은 카피 정본·synk-brand 몫)', () => {
  for (const [값, 안] of Object.entries(생성문구)) {
    assert.ok(안.제목.ko.trim().length, `${값} 제목 ko 빔`);
    assert.ok(안.본문.ko.trim().length, `${값} 본문 ko 빔`);
    assert.equal(안.제목.mn, ''); assert.equal(안.본문.mn, '');   // 지어낸 번역 0(문구_동의 규율)
  }
});

test('③ synk-brand 바닥 — 금칙어·금칙 형태·이모지 0 · 존댓말 · 카피 확정 표식', () => {
  const 전문 = Object.values(생성문구).flatMap((안) => [안.제목.ko, 안.본문.ko]).join('\n');
  for (const w of 금칙어) assert.ok(!전문.includes(w), `금칙어 «${w}»`);
  for (const w of 금칙형태) assert.ok(!전문.includes(w), `금칙 형태 «${w}»`);
  assert.ok(!이모지.test(전문), '이모지 0(DESIGN §1 — 위계는 킷이 진다)');
  for (const 줄 of 전문.split('\n').filter(Boolean)) assert.match(줄, /요\.?$|요$|게요\.?$/, `존댓말 «~요» 로 끝나야 한다: ${줄}`);
  assert.equal(typeof 카피확정, 'boolean', '카피 확정 표식은 boolean — 임시 문구임을 기계에 남긴다');
});
