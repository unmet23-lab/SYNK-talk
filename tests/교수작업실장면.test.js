'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { 그리기 } = require('./lib/화면세우기.js');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { 장면만들기 } = require('../contents/교수멘탈장면.js');
const { 펴기 } = require('../contents/교수멘탈문항.js');
const { 혼잣말캐릭터들 } = require('../lib/마스코트생명.js');

const 파일 = 'src/교수작업실장면.js';
const 재료 = { prompt_seed: 'g1t01.s0d1', 문항: 펴기('g1t01.s0d1') };

test('교수 생각과 내 상황을 별도 장면으로 그려 화자가 섞이지 않는다', () => {
  const 장면 = 장면만들기({ ...재료, 캐릭터: '까몽' });
  const 교수 = 그리기(파일, { 장면, 넓다: true, 사진너비: 500 }, '교수생각장면');
  const 학생 = 그리기(파일, { 장면 }, '내상황장면');
  assert.match(교수, /교수님의 생각/);
  assert.ok(교수.includes(장면.교수.대사[0]));
  assert.ok(!교수.includes(재료.문항.질문));
  assert.ok(!교수.includes(재료.문항.지시문));
  assert.match(학생, /지금 내 상황/);
  assert.match(학생, /내 친구 · 까몽/);
  assert.match(학생, /까몽의 한마디/);
  assert.ok(학생.includes(재료.문항.질문));
  assert.ok(학생.includes(재료.문항.지시문));
  assert.ok(!학생.includes(장면.교수.대사[0]));
});

test('내 상황 장면은 선택한 친구만 부르고 미선택은 친구를 만들지 않는다', () => {
  for (const 캐릭터 of [null, ...혼잣말캐릭터들]) {
    const 장면 = 장면만들기({ ...재료, 캐릭터 });
    const 화면 = 그리기(파일, { 장면, 좁다: true }, '내상황장면');
    assert.ok(화면.includes(재료.문항.질문));
    for (const 이름 of 혼잣말캐릭터들) {
      assert.equal(화면.includes(`내 친구 · ${이름}`), 이름 === 캐릭터);
    }
  }
});

test('선택 전에는 다음 행동을, 선택 뒤에는 학생의 말투 예문과 쓰기 시작을 보여 준다', () => {
  const 장면 = 장면만들기({ ...재료, 캐릭터: '마린' });
  let 확정수 = 0;
  const onConfirm = () => { 확정수++; };
  const 처음 = 그리기(파일, { 선택: null, onConfirm }, '전략미리보기');
  assert.match(처음, /말씀드릴 방법을 하나 골라 보세요/);
  assert.doesNotMatch(처음, /이 방법으로 편지 쓰기/);
  for (const 선택 of 장면.전략) {
    assert.ok(!처음.includes(선택.예문));
    const 화면 = 그리기(파일, { 선택, 제목: 선택.제목, 가이드: '마린', onConfirm }, '전략미리보기');
    assert.ok(화면.includes(선택.제목));
    assert.ok(화면.includes(선택.예문));
    assert.match(화면, /말투 예시/);
    assert.match(화면, /교수님께 쓰는 문장/);
    assert.match(화면, /말투를 참고하고, 상황에 맞게 내 방식대로 직접 써 보세요/);
    assert.ok(화면.indexOf('말투 예시') < 화면.indexOf('말투를 참고하고'));
    assert.ok(화면.indexOf('말투를 참고하고') < 화면.indexOf(선택.예문), '안내를 먼저 읽은 뒤 예문을 본다');
    assert.match(화면, /이 방법으로 편지 쓰기/);
    assert.match(화면, /다 쓴 뒤에 보내요/);
  }
  assert.equal(확정수, 0, '예문을 그리는 것만으로 방법을 확정하면 안 된다');
});

test('마린의 선택을 바꾸면 행동 그림과 말풍선이 같은 전략을 설명한다', () => {
  const { 전략미리보기 } = require('../src/교수작업실장면.js');
  const 장면 = 장면만들기({ ...재료, 캐릭터: '마린' });
  const 기대 = {
    'g1-사과-대안': '할 수 있는 일을 찾고 있어요',
    'g1-사과-솔직': '사정을 하나씩 정리하고 있어요',
    'g1-사과-간결': '중요한 부탁과 마음을 담고 있어요',
  };
  for (const 선택 of 장면.전략) {
    const 화면 = renderToStaticMarkup(React.createElement(전략미리보기, {
      선택, 제목: 선택.제목, 가이드: '마린', onConfirm() {},
    }));
    const 설명 = 기대[선택.option_id];
    assert.ok(화면.includes(설명), '그림에서 하는 행동을 읽을 수 있다');
    assert.ok(화면.includes(선택.미리보기));
    assert.ok(화면.includes(선택.예문));
    for (const 다른설명 of Object.values(기대)) {
      assert.equal(화면.includes(다른설명), 다른설명 === 설명);
    }
  }
});

test('마린의 전략 장면이 다른 친구나 미선택 화면에 섞이지 않는다', () => {
  const { 전략미리보기 } = require('../src/교수작업실장면.js');
  for (const 캐릭터 of [null, '몽글', '까몽']) {
    const 선택 = 장면만들기({ ...재료, 캐릭터 }).전략[0];
    const 화면 = renderToStaticMarkup(React.createElement(전략미리보기, {
      선택, 제목: 선택.제목, 가이드: 캐릭터, onConfirm() {},
    }));
    assert.doesNotMatch(화면, /마린이 여러 방법|마린이 노트에|마린이 편지에/);
    assert.ok(화면.includes(캐릭터 || '편지 길잡이'));
    assert.ok(화면.includes(선택.미리보기));
  }
});

test('지원하지 않는 전략에는 아무 마린 장면도 대신 보여 주지 않는다', () => {
  const { 마린전략장면 } = require('../src/마린전략장면.js');
  for (const optionId of [null, undefined, '', 'g1-없는방법', 'toString']) {
    assert.equal(renderToStaticMarkup(React.createElement(마린전략장면, {
      optionId, 말: '이 말이 잘못된 장면에 실리면 안 된다.',
    })), '');
  }
});
