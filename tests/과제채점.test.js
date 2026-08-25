/* 과제채점 적용층 회귀 — «틀리면 파일 전체가 무효가 되는» 규칙 넷을 픽스처로 못박는다.
 *
 * ■ 왜 있나 — 채점 통로가 둘(CLI · 화면)이 된 날, 규칙은 lib/과제채점.js 한 벌로 모였다.
 *   여기가 그 한 벌의 회귀다: ① 0점→이유 필수(E2 — 비면 결과검증이 파일째 떨어뜨린다)
 *   ② ⑦ null 은 목표 없는 사례에만 · 화면이 뭘 보내든 접는다 ③ 쌍둥이 이음(같은 글자 다른
 *   점수 = 채점자 흔들림) ④ 0점 고정 행 불가침(그 0점은 규율의 판정이지 채점이 아니다).
 *
 * ■ 픽스처가 탐지력을 진다(맹점 ②) — 실파일(evals/과제생성_결과.json)은 여기서 안 연다.
 *   실파일 계약은 lib/과제생성평가.결과검증 의 몫이고 그 회귀는 따로 있다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const 평가 = require('../lib/과제생성평가.js');
const { 미채점인가, 고정인가, 진행, 쌍둥이, 매김적용 } = require('../lib/과제채점.js');
/* ④ 대가 검사가 «실물 판»으로 서야 한다 — 픽스처를 손으로 지으면 계약이 갈린다. */
const fs = require('fs');
const path = require('path');
const { 뼈대 } = require('./lib/과제생성뼈대.js');
const ROOT = path.resolve(__dirname, '..');
const 시험지경로 = path.join(ROOT, 'evals', '과제생성_시험지.json');
const 프롬프트경로 = path.join(ROOT, 'prompts', '과제생성.md');

const 여덟 = (v) => 평가.축키들.map(() => v);
const 행 = (case_id, 덮을것) => ({
  case_id,
  axis_scores: Object.fromEntries(평가.축키들.map((k) => [k, 0])),
  grader_note: '미채점',
  sentence: `문장 ${case_id.split('#')[0]}`, question: `질문 ${case_id.split('#')[0]}?`,
  raw_response: '', raw_response_hash: 'x'.repeat(64), input_hash: 'x'.repeat(64),
  ...덮을것,
});
const 판 = () => ({
  시험지: {
    사례: [
      { case_base_id: 'P001', goal: '취업 면접', 칸: 'Lv4·표본적음', level: 'Lv4', 기술들: ['—'] },
      { case_base_id: 'P002', goal: null, 칸: 'Lv5·표본풍부', level: 'Lv5', 기술들: ['—'] },
    ],
  },
  결과: {
    동봉: { 채점자: '(미채점)', 시각: '2026-08-23T00:00:00.000Z' },
    행: [
      행('P001#1'), 행('P001#2'),                       // 쌍둥이(글자까지 같다)
      행('P002#1'), 행('P002#2', { question: '질문 P002 다른 회차?' }),  // 쌍둥이 아님
    ],
  },
});
const 지금 = '2026-08-25T00:00:00.000Z';

test('매김이 행에 앉고 동봉(채점자·시각)이 갱신된다', () => {
  const { 결과, 시험지 } = 판();
  const r = 매김적용({ 결과, 시험지, case_id: 'P002#1', 점수들: 여덟(1), note: '', 채점자: '유호', 지금 });
  assert.equal(r.ok, true);
  const 대상 = 결과.행.find((x) => x.case_id === 'P002#1');
  assert.equal(대상.grader_note, '');
  assert.equal(대상.axis_scores.connect, 1);
  assert.equal(결과.동봉.채점자, '유호');
  assert.equal(결과.동봉.시각, 지금);
});

test('🔴 0점 축이 있는데 이유가 비면 거절 — 아무것도 안 바뀐다(전부 아니면 전무)', () => {
  const { 결과, 시험지 } = 판();
  const 점수들 = 여덟(1); 점수들[0] = 0;
  const r = 매김적용({ 결과, 시험지, case_id: 'P002#1', 점수들, note: '  ', 채점자: '유호', 지금 });
  assert.equal(r.ok, false);
  assert.match(r.오류, /이유가 비었다/);
  assert.equal(결과.행.find((x) => x.case_id === 'P002#1').grader_note, '미채점');
  assert.equal(결과.동봉.채점자, '(미채점)');   // 동봉도 안 건드린다
});

test('⑦(goal_use)은 목표 없는 사례면 무엇을 보내든 null — «분모에서 뺌»', () => {
  const { 결과, 시험지 } = 판();
  const r = 매김적용({ 결과, 시험지, case_id: 'P002#1', 점수들: 여덟(1), note: '', 채점자: '유호', 지금 });
  assert.equal(r.ok, true);
  assert.equal(결과.행.find((x) => x.case_id === 'P002#1').axis_scores[평가.null허용축], null);
});

/* 🔴 규칙이 바뀐 자리(유호 확정 2026-08-25) — 옛 판은 「목표 있는 사례의 ⑦은 0/1 필수」였다.
 *   ⑦은 «세는 칸»이라 0 이 「흠」이 아니라 「안 썼다」다. 그래서 «안 물었다»를 0 으로 적으면
 *   「안 썼다」와 구별이 안 된다 — 그 병(초안 O 가 판정으로 읽힘)을 오늘 아침에 잡았고, 이건
 *   그 거울상이다. ⇒ ⑦에 한해 null = 「안 쟀다」를 받는다. 대신 **대가를 집계가 진다**:
 *   분모 0 이면 §8-B 는 통과할 수 없다(안 잰 축을 통과로 접으면 F207 이 무너진다).
 *   이 절이 그 두 짝을 «같이» 잰다 — 하나만 살면 조용한 초록이 된다. */
test('⑦만 null(안 쟀다)을 받는다 · 딴 축의 null 과 딴 값은 여전히 거절 · 안 재면 통과 못 한다', () => {
  const { 결과, 시험지 } = 판();
  const 칠 = 평가.축키들.indexOf(평가.구간축);

  /* ① ⑦ = null → 받는다. 파일에 null 로 남아야 「안 쟀다」가 읽힌다(0 이면 「안 썼다」로 읽힌다). */
  const 점수들 = 여덟(1); 점수들[칠] = null;
  const r = 매김적용({ 결과, 시험지, case_id: 'P001#1', 점수들, note: '', 채점자: '유호', 지금 });
  assert.equal(r.ok, true, r.오류);
  assert.equal(결과.행.find((x) => x.case_id === 'P001#1').axis_scores[평가.구간축], null);

  /* ② 딴 축의 null 은 그대로 거절 — 「안 쟀다」는 ⑦ 하나만 누리는 예외다. */
  const 딴축 = 여덟(1); 딴축[평가.축키들.indexOf('accuracy')] = null;
  const r2 = 매김적용({ 결과, 시험지, case_id: 'P002#1', 점수들: 딴축, note: '', 채점자: '유호', 지금 });
  assert.equal(r2.ok, false); assert.match(r2.오류, /0·1 뿐/);

  /* ③ 0·1·null 아닌 값은 ⑦에서도 거절(관용이 넓어지면 오타가 판정으로 들어온다). */
  const 딴값 = 여덟(1); 딴값[칠] = 2;
  const r3 = 매김적용({ 결과, 시험지, case_id: 'P001#1', 점수들: 딴값, note: '', 채점자: '유호', 지금 });
  assert.equal(r3.ok, false); assert.match(r3.오류, /0·1 뿐/);

  /* ④ 대가 — ⑦을 전 행 안 재면 집계가 «안잼»으로 말하고 통과는 false 다. */
  const 시험 = JSON.parse(fs.readFileSync(시험지경로, 'utf8'));
  const 전문 = fs.readFileSync(프롬프트경로, 'utf8');
  const 뼈 = 뼈대(시험, 전문);
  for (const 행 of 뼈.행) 행.axis_scores[평가.구간축] = null;
  const 집 = 평가.집계(뼈, 시험);
  assert.equal(집.축[평가.구간축].분모, 0);
  assert.equal(집.축[평가.구간축].안잼, true, '분모 0 은 «미달»이 아니라 «안 쟀다»로 말해야 한다');
  assert.equal(집.축[평가.구간축].통과, false, '안 잰 축을 통과로 접으면 F207(미실행 ≠ 통과)이 무너진다');
  assert.equal(집.통과, false);
});

test('쌍둥이 회차(글자까지 같음)에 같은 점수가 이어진다 — 적용 목록이 둘이다', () => {
  const { 결과, 시험지 } = 판();
  const 점수들 = 여덟(1); 점수들[1] = 0;
  const r = 매김적용({ 결과, 시험지, case_id: 'P001#1', 점수들, note: '답이 하나로 정해진다', 채점자: '유호', 지금 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.적용.sort(), ['P001#1', 'P001#2']);
  const 짝 = 결과.행.find((x) => x.case_id === 'P001#2');
  assert.equal(짝.axis_scores.answerable, 0);
  assert.equal(짝.grader_note, '답이 하나로 정해진다');
});

test('글자가 다른 회차에는 안 이어진다', () => {
  const { 결과, 시험지 } = 판();
  const r = 매김적용({ 결과, 시험지, case_id: 'P002#1', 점수들: 여덟(1), note: '', 채점자: '유호', 지금 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.적용, ['P002#1']);
  assert.equal(결과.행.find((x) => x.case_id === 'P002#2').grader_note, '미채점');
});

test('🔴 0점 고정 행은 채점도 쌍둥이 이음도 불가침', () => {
  const { 결과, 시험지 } = 판();
  결과.행[1].grader_note = '0점 고정 — 검문탈락: 길이';   // P001#2 (글자는 #1 과 같다)
  const 직접 = 매김적용({ 결과, 시험지, case_id: 'P001#2', 점수들: 여덟(1), note: '', 채점자: '유호', 지금 });
  assert.equal(직접.ok, false);
  assert.match(직접.오류, /0점 고정/);
  const 곁 = 매김적용({ 결과, 시험지, case_id: 'P001#1', 점수들: 여덟(1), note: '', 채점자: '유호', 지금 });
  assert.equal(곁.ok, true);
  assert.deepEqual(곁.적용, ['P001#1']);                    // 고정 행으로는 안 흐른다
  assert.match(결과.행[1].grader_note, /^0점 고정/);
});

test('모르는 case_id·빈 채점자·점수 아홉 개는 전부 거절', () => {
  const { 결과, 시험지 } = 판();
  assert.equal(매김적용({ 결과, 시험지, case_id: 'P999#1', 점수들: 여덟(1), note: '', 채점자: '유호', 지금 }).ok, false);
  assert.equal(매김적용({ 결과, 시험지, case_id: 'P001#1', 점수들: 여덟(1), note: '', 채점자: '  ', 지금 }).ok, false);
  assert.equal(매김적용({ 결과, 시험지, case_id: 'P001#1', 점수들: [...여덟(1), 1], note: '', 채점자: '유호', 지금 }).ok, false);
});

test('진행 분모 — 전체 = 매김 + 미채점 + 0점 고정', () => {
  const { 결과, 시험지 } = 판();
  결과.행[3].grader_note = '0점 고정 — 응답파손: 봉투';
  매김적용({ 결과, 시험지, case_id: 'P002#1', 점수들: 여덟(1), note: '', 채점자: '유호', 지금 });
  const p = 진행(결과);
  assert.deepEqual(p, { 전체: 4, 미채점: 2, 고정: 1, 매김: 1 });
  assert.equal(p.매김 + p.미채점 + p.고정, p.전체);
});

test('다시 매김(되돌아보기)도 받는다 — 매긴 행을 고칠 수 있고 쌍둥이가 따라온다', () => {
  const { 결과, 시험지 } = 판();
  매김적용({ 결과, 시험지, case_id: 'P001#1', 점수들: 여덟(1), note: '', 채점자: '유호', 지금 });
  const 점수들 = 여덟(1); 점수들[4] = 0;
  const r = 매김적용({ 결과, 시험지, case_id: 'P001#1', 점수들, note: '내일 또 열고 싶지 않다', 채점자: '유호', 지금 });
  assert.equal(r.ok, true);
  assert.equal(결과.행.find((x) => x.case_id === 'P001#2').axis_scores.fun, 0);
});

test('판별 도우미 — 미채점인가·고정인가·쌍둥이', () => {
  const { 결과 } = 판();
  assert.equal(미채점인가(결과.행[0]), true);
  assert.equal(고정인가({ grader_note: '0점 고정 — 검문탈락: x' }), true);
  assert.equal(고정인가(결과.행[0]), false);
  assert.equal(쌍둥이(결과, 결과.행[0]).case_id, 'P001#2');
  assert.equal(쌍둥이(결과, 결과.행[2]), null);
});
