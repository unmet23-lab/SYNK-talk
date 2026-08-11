/* 교수멘탈화면 회귀 — G1 화면을 **실제로 그려 본다**(`tests/lib/화면세우기.js` · F268 계열).
 *
 * 재는 것: ① 세 단계가 그리다 죽지 않고 정본 값을 글자로 낸다 ② 숨은 시계(시간 표시 0 ·
 * 숫자/퍼센트 0) ③ 요구문형(모범 문형) 비노출 — 힌트는 빠진 칸 **이름**까지 ④ 즉답 금지
 * ⑤ controlled TextInput 금지(소스층 — 핸들러는 첫 렌더가 못 돈다 · ⑩ 선례) ⑥ 학생 접점
 * 금칙어 0 ⑦ 말하기화면 라우팅 갈래의 실재(소스층 — 갈래는 effect 뒤라 첫 렌더 밖이다).
 * 탐지력(깨진 화면을 정말 잡는가)은 `화면렌더.test.js` ⑤ 픽스처가 이미 못박았다 — 같은 통로다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 그리기, ROOT } = require('./lib/화면세우기.js');
const { 코드만, 코드만픽스처 } = require('./lib/소스검사.js');

const 소스 = fs.readFileSync(path.join(ROOT, 'src', '교수멘탈화면.js'), 'utf8');

/* 픽스처는 손으로 짓지 않고 정본(팩)에 접게 한다 — 화면이 읽는 모양을 여기 또 적으면 두 벌이다. */
const { 시드만들기, 펴기 } = require(path.join(ROOT, 'contents', '교수멘탈문항.js'));
const 시드 = 시드만들기('g1t01', 0, 0);
const 문항 = 펴기(시드);
const G1항목 = {
  task_ref: 'task-2026-08-11',
  task_snapshot: { challenge_id: 'g1-교수멘탈', prompt_seed: 시드, addressee_level: '합쇼체', 지시문: 'x', 질문: 'x', 문항판: 'x' },
  level_snapshot: 'Lv2',
  goal_snapshot: null,
};
const 그때 = (시작단계) => 그리기('src/교수멘탈화면.js', { 항목: G1항목, 토큰: 'x', 학생번호: 'SYNK-042', 시작단계 });

/* synk-brand 바닥 검사 — 활용형까지 어간으로(교수멘탈문항.test.js 와 같은 자) */
const 금칙꼴 = [/패배/, /졌다/, /실패/, /불운/, /하락/, /부족/, /안\s?됨/, /늦/];

test('① 전략 단계 — 상황·지시문·전략 3장·오늘의 추천이 화면에 선다', () => {
  const 글 = 그때('전략');
  assert.ok(글.includes(문항.질문), '상황문이 화면에 없다 — 팩 정본이 그리는 재료다');
  assert.ok(글.includes(문항.지시문), '지시문이 없다 — 핵심 어휘 3개가 이 안에 있다(§6-8 규칙 3)');
  for (const 문구 of ['사정을 솔직히 말한다', '짧게 사과하고 바로 부탁한다', '대신 할 수 있는 것을 제안한다']) {
    assert.ok(글.includes(문구), `전략 카드가 빠졌다: ${문구}(발주 G1 §4-4 문구 그대로)`);
  }
  assert.match(글, /오늘의 추천/, '추천 표시가 없다 — 「밀어준 것」과 「선호」를 가르는 재료다');
});

test('② 쓰기 단계 — 게이지 5칸 이름·「문법 점수가 아니라」·받는 사람 고정', () => {
  const 글 = 그때('쓰기');
  assert.match(글, /받는 사람 · 교수님/);
  assert.match(글, /문법 점수가 아니라 빠진 부분 안내/, '정본 문구(발주 G1 §4-5)가 화면에 없다');
  for (const 이름 of Object.keys(문항.요구문형)) {
    assert.ok(글.includes(이름), `게이지 칸 이름이 없다: ${이름} — 힌트는 빠진 칸 이름까지다`);
  }
  assert.match(글, /아직 비어 있는 칸/, '빠진 칸 안내가 없다');
  assert.match(글, /보내기/, '주행동(신호 1점)이 없다');
});

test('③ 숨은 시계 — 시간·숫자·퍼센트가 화면에 0 이다(유호 확정 · 발주 G1 §6)', () => {
  for (const 단계 of ['전략', '쓰기', '대기']) {
    const 글 = 그때(단계);
    assert.doesNotMatch(글, /\d+\s*초|\d+:\d\d|타이머/, `${단계}: 시계가 걸렸다 — 재려던 구조가 안 재진다`);
    assert.doesNotMatch(글, /%|퍼센트/, `${단계}: 게이지에 숫자·퍼센트 병기 금지(게임층 §4 규격 3)`);
  }
});

test('④ 요구문형(모범 문형)은 화면 비노출이다 — 베껴 채우면 재려던 산출이 안 재진다(팩 §2)', () => {
  const 쓰기 = 그때('쓰기');
  for (const 문형 of Object.values(문항.요구문형)) {
    assert.ok(!쓰기.includes(문형), `모범 문형이 노출됐다: ${문형}`);
  }
  // placeholder·힌트에 문형 조각이 스미는 흔한 자리까지 — 대표 조각 둘로 못박는다
  assert.doesNotMatch(쓰기, /주시면 감사하겠습니다|안녕하십니까 \//);
});

test('⑤ 대기 단계 — 「교수님이 읽고 있어요」뿐, 즉답처럼 보이지 않는다(발주 G1 §4-8·§8)', () => {
  const 글 = 그때('대기');
  assert.match(글, /교수님이 읽고 있어요/);
  assert.match(글, /며칠/, '「며칠 걸린다」는 기대 관리가 없다 — 즉답 기대가 첫 주에 깨진다');
  assert.doesNotMatch(글, /답장이 왔|도착했어요/, '보내자마자 답장·도착을 말하면 즉답 연출이다');
});

test('⑥ controlled TextInput 금지 — defaultValue 만 쓴다(발주 G1 §4-5 ⚙ · 한글 조합 보호)', () => {
  assert.ok(/defaultValue/.test(소스), 'TextInput 이 defaultValue 를 안 쓴다');
  assert.ok(!/value=\{/.test(소스),
    'TextInput 에 value= 가 있다 — 매 글자 되돌려 넣으면 「안녕」이 「ㅇㅏㄴㄴㅕㅇ」으로 흩어진다');
  /* 게이지 갱신 조건 — 같은판정이 false 일 때만 setState(그 줄이 사라지면 매 글자 리렌더다).
   * 소스층인 이유: 핸들러는 첫 렌더가 못 돈다(⑩ 선례 — 못 재는 층을 비워 두지 않는다). */
  assert.match(소스, /같은판정\(/, '게이지 갱신이 같은판정을 안 지난다 — 매 글자 리렌더 = controlled 와 같은 파괴다');
});

test('⑦ 학생 접점 금칙어 0 — 세 단계 렌더 전량(synk-brand 바닥 검사)', () => {
  for (const 단계 of ['전략', '쓰기', '대기']) {
    const 글 = 그때(단계);
    for (const 꼴 of 금칙꼴) {
      assert.ok(!꼴.test(글), `${단계}: 금칙 「${꼴}」 — 벌이 없는 세계가 이 게임의 축이다`);
    }
  }
});

test('⑧ 재료를 못 읽으면 정직하게 말한다 — 고정 과제로 둔갑하지 않는다', () => {
  const 글 = 그리기('src/교수멘탈화면.js', {
    항목: { task_ref: 't', task_snapshot: { challenge_id: 'g1-교수멘탈', prompt_seed: 'g1t99.s0d0' } },
    토큰: 'x', 학생번호: 'SYNK-042',
  });
  assert.match(글, /읽지 못했어요/, '못 읽은 것이 조용하면 배치 고장이 며칠 안 보인다');
});

test('⑩ 소리는 게이트 한 문으로만 — 발송 achieve 1회 · 실패음 0 · expo-audio 직접 금지', () => {
  /* 게임층 §3-1 ⚠ — 화면이 따로 오디오 세션을 잡으면 「녹음 중 소리 0」이 프로즈로 남는다.
   * 소스층인 이유: 재생은 핸들러 안이라 첫 렌더가 못 돈다(⑥과 같은 판정).
   * 주석은 벗기고 본다 — 설명 속 낱말이 코드로 읽히면 이 검사는 영원히 빨갛거나 영원히 초록이다. */
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다');
  const 코드 = 코드만(소스);
  assert.ok(!/expo-audio|expo-haptics/.test(코드), '화면이 오디오·햅틱을 직접 잡았다 — 문은 src/소리.js 하나다');
  const 부름 = [...코드.matchAll(/효과음\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(부름, ['achieve'], `소리 자리는 발송 achieve 하나뿐이다(실패음 없음) — 실제: ${부름}`);
});

test('⑨ 말하기화면 라우팅 — G1 갈래가 배선돼 있다(소스층 — 갈래는 effect 뒤라 첫 렌더 밖)', () => {
  const 말하기 = fs.readFileSync(path.join(ROOT, 'src', '말하기화면.js'), 'utf8');
  assert.match(말하기, /게임과제인가\(/, '라우팅 판정이 조립기를 안 지난다 — challenge_id 를 베끼면 팩 개정이 안 닿는다');
  assert.match(말하기, /<교수멘탈화면/, 'G1 갈래가 화면을 안 그린다 — 판정만 있고 배선이 없다');
  /* 막힘 검사 «뒤»에 선다 — 순서가 바뀌면 막힌 학생에게 게임이 열려 업로드만 죽는다. */
  const 막힘자리 = 말하기.indexOf('if (서버막힘)');
  const 게임자리 = 말하기.indexOf('if (게임항목)');
  assert.ok(막힘자리 > -1 && 게임자리 > 막힘자리, 'G1 갈래가 막힘 검사보다 앞이다');
});
