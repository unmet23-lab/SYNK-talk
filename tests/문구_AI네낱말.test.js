/* AI 네 낱말 숙제 한 줄 회귀 — 문구_생성.test.js 와 같은 결(문구의 질은 카피 정본 몫 · 여기는 바닥).
 *
 * ■ 무엇을 재나
 *   ① 분기 — 아는 종류 4는 한 줄을 내고, 모르는 종류·빈 값은 null(안 그린다 · 문구를 지어내지 않는다).
 *   ② {이름} 치환은 파일 하나가 진다 — 이름 있으면 치환, 없으면 이름없음 판, 자리 없는 문구는 그대로.
 *   ③ synk-brand 바닥 — 금칙어 0 · 금칙 형태 0 · 이모지 0 · 몽골어는 비어 있다(사람 검수 전 ·
 *      검수표 = appsscript docs/AI활용문안_몽골어_검수표.md §5) · 카피 확정 표식이 기계에 남는다.
 *   ④ 낱말 배정 — 가이드 §B 확정 그대로(말하기·문장만들기=맡기기 · 단어찾기=부탁하기 · 고쳐쓰기=가려보기). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { 카피확정, AI네낱말문구, AI한줄 } = require('../contents/문구_AI네낱말.js');

const 금칙어 = ['패배', '졌다', '실패', '불운', '하락', '부족', '안 됨', '늦었다'];
const 금칙형태 = ['이떠', '가치 ', '시퍼', '화이팅', '짱', '대박', '주인님'];
const 이모지 = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

test('① 분기 — 아는 종류 4는 한 줄, 모르는 종류·빈 값은 null(안 그린다)', () => {
  for (const 종류 of ['말하기', '문장만들기', '단어찾기', '고쳐쓰기']) {
    const r = AI한줄(종류);
    assert.ok(r && r.낱말 && r.글.length === 1, `${종류} 한 줄이 없다`);
  }
  for (const v of ['쓰기', null, undefined, '']) assert.equal(AI한줄(v), null, `${String(v)} 를 지어내 그렸다`);
});

test('② {이름} 치환 — 이름 있으면 치환, 없으면 이름없음 판, 자리 없는 문구는 그대로', () => {
  const 있음 = AI한줄('말하기', '벌드');
  assert.ok(있음.글[0].includes('벌드님') && !있음.글[0].includes('{이름}'), '이름이 치환 안 됐다');
  const 없음 = AI한줄('말하기');
  assert.equal(없음.글[0], AI네낱말문구.말하기.글_이름없음.ko, '이름 모르면 이름없음 판이어야 한다');
  assert.ok(!없음.글[0].includes('{이름}'), '자리표시자가 학생에게 노출됐다');
  const 자리없음 = AI한줄('단어찾기', '벌드');
  assert.equal(자리없음.글[0], AI네낱말문구.단어찾기.글.ko, '이름 자리가 없는 문구가 변형됐다');
});

test('③ synk-brand 바닥 — 금칙어·금칙 형태·이모지 0 · mn 은 비어 있다 · 카피 확정 표식', () => {
  assert.equal(카피확정, true, '카피 확정 표식이 없다(유호 08-24 밤)');
  for (const [종류, 안] of Object.entries(AI네낱말문구)) {
    for (const 판 of [안.글, 안.글_이름없음].filter(Boolean)) {
      for (const 나쁨 of [...금칙어, ...금칙형태]) {
        assert.ok(!판.ko.includes(나쁨), `${종류} 에 금칙 「${나쁨}」`);
      }
      assert.ok(!이모지.test(판.ko), `${종류} 에 이모지 — 숙제는 0 기본(synk-brand)`);
      assert.equal(판.mn, '', `${종류} mn 이 차 있다 — 사람 검수 전 지어낸 번역 금지`);
    }
  }
});

test('④ 낱말 배정 — 가이드 §B 확정 그대로', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(AI네낱말문구).map(([k, v]) => [k, v.낱말])),
    { 말하기: '맡기기', 문장만들기: '맡기기', 단어찾기: '부탁하기', 고쳐쓰기: '가려보기' },
  );
});
