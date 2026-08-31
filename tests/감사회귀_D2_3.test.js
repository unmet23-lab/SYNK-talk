'use strict';
/* 감사 회귀 D2-3 — 녹음 버튼이 학생 음량에 살아 숨쉬는 게이지 배선.
 * 층은 소스다 — onBuffer 콜백과 Animated 합성은 스트림·effect «뒤»의 갈래라 첫 렌더 통로
 * (화면렌더)가 원리상 못 잰다. 접기 구간(-45~-15dB)·감쇠(0.7/0.3)의 실물 손맛은 실기기 검수
 * 몫이라 여기서는 «배선이 살아 있는가»만 못박는다. */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 코드만, 구간, 파일소스, 코드만픽스처 } = require('./lib/소스검사.js');

const ROOT = path.join(__dirname, '..');
const 말하기원문 = 파일소스(path.join(ROOT, 'src', '말하기화면.js'));
const 말하기 = 코드만(말하기원문);

test('주석 제거기가 산다 — 아래 소스 검사들이 설명을 코드로 읽지 않는다', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다 — 이 파일 전체가 거짓 초록이 된다');
});

test('D2-3 게이지 상태 — 음량 Animated.Value(안정 객체)와 감쇠 기억이 녹음카드에 선다', () => {
  assert.match(말하기, /const 음량 = useRef\(new Animated\.Value\(0\)\)\.current;\s*const 음량직전 = useRef\(0\);/,
    '음량 게이지 한 쌍이 없다 — onBuffer 는 마운트 때 잡힌 클로저라 state 는 낡고, 안정 객체(Animated.Value·ref)만 안전하다');
});

test('D2-3 onBuffer — 데시벨은 한 번만 재서 추적 표본과 나눠 쓰고, 접기·감쇠 두 줄이 게이지에 싣는다', () => {
  const 몸 = 구간(말하기원문, 'onBuffer: (buf) => {', '});');
  assert.match(몸, /const db = 데시벨\(조각\);/,
    '데시벨 측정이 const 로 안 잡혔다 — 게이지와 추적이 따로 재면 같은 조각을 두 번 계산한다');
  assert.match(몸, /if \(추적\.current\) 추적\.current\.표본\(t_ms, db\);/,
    '추적 표본이 잰 값을 안 나눠 쓴다 — 인라인 호출이 되살아났다');
  assert.equal([...말하기.matchAll(/데시벨\(/g)].length, 1,
    '데시벨 호출이 화면 전체에서 1회가 아니다 — 같은 조각을 두 자로 재면 갈라진다');
  assert.match(몸, /const 목표 = typeof db === 'number' \? Math\.max\(0, Math\.min\(1, \(db \+ 45\) \/ 30\)\) : 0;/,
    '접기(-45~-15dB→0~1 · 발화문턱 -35 가 중간)가 없거나 null 가드가 빠졌다 — 데시벨은 빈 조각에 null 을 주고 null+45 는 45 라 게이지가 만개한다');
  assert.match(몸, /음량직전\.current = 음량직전\.current \* 0\.7 \+ 목표 \* 0\.3;\s*음량\.setValue\(음량직전\.current\);/,
    '감쇠 두 줄이 없다 — 감쇠 없이 setValue 만 하면 조각마다 게이지가 튀어 숨이 아니라 경련이 된다');
});

test('D2-3 녹음버튼 — 음량 프롭(기본 null = 현행 불변)과 use줄임 게이트 안의 scale 합성', () => {
  const 몸 = 구간(말하기원문, 'function 녹음버튼({', 'function 맺음띠');
  assert.match(몸, /function 녹음버튼\(\{ 녹음중, onPress, 음량 = null \}\)/,
    '음량 기본값이 null 이 아니다 — 프롭 없는 대기 사용처(G3 포함)의 행동이 바뀐다');
  assert.match(몸, /const 줄임 = use줄임\(\);/,
    '녹음버튼이 use줄임을 구독하지 않는다 — reduce-motion 학생에게도 게이지가 요동친다');
  assert.match(몸, /scale: 녹음중 && 음량 && !줄임 \? Animated\.add\(맥박, Animated\.multiply\(음량, 0\.02\)\) : 맥박/,
    'scale 합성식이 use줄임 게이트 안에 없다 — 줄임이면 기존 고정 맥박(1→1.03)만 남아야 하고, 눈금은 맥박+0~0.02 = 1~1.05 다(transform 만 · 네이티브 드라이버 규율)');
});

test('D2-3 배선 — 녹음중 렌더가 게이지를 버튼에 나른다', () => {
  assert.match(말하기, /<녹음버튼 녹음중 onPress=\{끝\} 음량=\{음량\} \/>/,
    '녹음중 카드가 음량을 안 넘긴다 — 게이지가 차오르는데 버튼은 고정 맥박만 쉰다');
});
