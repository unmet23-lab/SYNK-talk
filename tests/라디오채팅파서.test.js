/* 라디오24 채팅 파서 회귀 — 설계 §9 왕복시험의 **파서 층** 픽스처.
 *
 * 여기서 재는 것: 명령 분리(화이트리스트)·인자 정책(㉠㉡ 판정)·`!답` 해석(전각·「번」·확신도).
 * 여기서 안 재는 것(다른 층 몫): 중복 message_id(원장 PK 멱등)·마감 후 응답·비링크
 * 학생(승격기 게이트)·textMessageEvent 화이트리스트(수집봇) — §9 왕복시험이 그 층을 진다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const { 파서판, 명령표, 파싱, 답해석, 인자정책 } = require('../lib/라디오채팅파서.js');

test('명령 분리 — 정상 픽스처(키릴 혼입 포함 · 인자는 원문 그대로)', () => {
  assert.deepEqual(파싱('!출석 오늘도 화이팅'), { command_kind: '출석', command_arg: '오늘도 화이팅' });
  assert.deepEqual(파싱('!목표 단어 20개 외우기'), { command_kind: '목표', command_arg: '단어 20개 외우기' });
  // 키릴 혼입 — 몽골 학생의 실제 표기. 인자를 깎거나 정규화하지 않는다(원문 보존 원칙 5).
  assert.deepEqual(파싱('!질문 Багшаа "은/는" хэзээ хэрэглэх вэ?'),
    { command_kind: '질문', command_arg: 'Багшаа "은/는" хэзээ хэрэглэх вэ?' });
  assert.deepEqual(파싱('!빗소리'), { command_kind: '빗소리', command_arg: null });
  assert.deepEqual(파싱('!빗소리 집중이 잘돼서'), { command_kind: '빗소리', command_arg: '집중이 잘돼서' });
  assert.deepEqual(파싱('!답 2'), { command_kind: '답', command_arg: '2' });
});

test('명령이 아닌 것 — 자발 발화·화이트리스트 밖·빈 입력은 (null, null)', () => {
  assert.deepEqual(파싱('선생님 안녕하세요'), { command_kind: null, command_arg: null });
  assert.deepEqual(파싱('!랭킹'), { command_kind: null, command_arg: null });  // 없는 명령
  assert.deepEqual(파싱(''), { command_kind: null, command_arg: null });
  assert.deepEqual(파싱(null), { command_kind: null, command_arg: null });
  // 문장 중간의 ! 는 명령이 아니다 — 앞머리만 명령이다.
  assert.deepEqual(파싱('오늘 !출석 했어요'), { command_kind: null, command_arg: null });
});

test('연동은 인자를 파생에 싣지 않는다 — 식별자가 새는 자리(§10 기각 2)', () => {
  // 학생이 실수로 코드를 쳐도 command_arg 는 null — 원문은 body·raw 가 든다(소실 아님).
  assert.deepEqual(파싱('!연동 SYNK-001'), { command_kind: '연동', command_arg: null });
  assert.deepEqual(파싱('!연동'), { command_kind: '연동', command_arg: null });
});

test('인자 정책 — ㉠㉡ 판정이 표 하나에 산다', () => {
  assert.equal(인자정책('출석'), '필수');   // ①축 = ㉡ 강제
  assert.equal(인자정책('목표'), '필수');
  assert.equal(인자정책('답'), '필수');
  assert.equal(인자정책('빗소리'), '선택'); // ②축 = ㉠ 선택 인자
  assert.equal(인자정책('asmr'), '선택');
  assert.equal(인자정책('연동'), '무시');
  assert.equal(인자정책('없는명령'), null);
  // 어휘를 늘리면 인자 정책도 같이 정해야 한다 — 값이 넷 밖이면 봇 접수 판정이 눈을 잃는다.
  for (const [이름, { 인자 }] of Object.entries(명령표)) {
    assert.ok(['필수', '선택', '없음', '무시'].includes(인자),
      `명령 ${이름} 의 인자 정책 「${인자}」 는 정의 밖이다`);
  }
});

test('답해석 — 전각·「번」·확신도 변형(§9 픽스처)', () => {
  assert.deepEqual(답해석('2'), { 선택: '2', 확신도: null });
  assert.deepEqual(답해석('２'), { 선택: '2', 확신도: null });          // 전각 숫자
  assert.deepEqual(답해석('2번'), { 선택: '2', 확신도: null });         // 「2번」 변형
  assert.deepEqual(답해석('2?'), { 선택: '2', 확신도: 'low' });         // 애매
  assert.deepEqual(답해석('2 ?'), { 선택: '2', 확신도: 'low' });
  assert.deepEqual(답해석('2??'), { 선택: '2', 확신도: 'guess' });      // 찍음
  assert.deepEqual(답해석('２번？？'), { 선택: '2', 확신도: 'guess' }); // 전부 겹친 변형
  assert.deepEqual(답해석('10'), { 선택: '10', 확신도: null });
});

test('답해석 — 해석 불가는 null(지어내서 고르지 않는다 · 승격하지 않는다)', () => {
  assert.equal(답해석('2 아니면 3'), null);
  assert.equal(답해석('몰라요'), null);
  assert.equal(답해석(''), null);
  assert.equal(답해석(null), null);
  assert.equal(답해석('2???'), null);   // 확신도 표기는 ?·?? 둘뿐 — 셋은 다른 판의 몫이다
  assert.equal(답해석('123'), null);    // 보기 번호는 두 자리까지 — 세 자리는 오타로 본다
});

test('파서판이 박혀 있다 — 원장 행의 parser_ver 원천', () => {
  assert.match(파서판, /^radio-parse\.v\d+$/,
    '파서판 형식이 갈렸다 — 원장 재파싱 근거가 판 이름 하나에 매달린다');
});

test('탐지력 — 대소문자·공백 변형이 같은 명령으로 든다(거짓양성 아님을 못박는다)', () => {
  assert.deepEqual(파싱('!ASMR'), { command_kind: 'asmr', command_arg: null });
  assert.deepEqual(파싱('  !답  ２번  '), { command_kind: '답', command_arg: '２번' });
  assert.deepEqual(답해석(파싱('  !답  ２번  ').command_arg), { 선택: '2', 확신도: null });
});
