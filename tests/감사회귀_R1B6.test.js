'use strict';
/* 감사 R1B6 회귀 — 이번 시공이 남긴 「틀려도 조용한」 자리만 문다.
 *
 * · D8-7 재열기남은분 경계 — 만료 직전 1분 · 지난 뒤 0 · 못 읽는 만료 null
 * · D8-3 확정/저장 뒤 스크롤 복귀 — effect 안이라 첫 렌더로 못 재서 소스로 잰다
 * · D8-5 쓰기 카드에도 상황문(문항.질문)이 상주한다 — 실렌더로 잰다
 * · D5-9 게이지 칸 스밈 — 덮개 opacity 만 만지고 바닥(잉크_희미)은 불변
 * · G1-6 서명 수명 — 캐시 적중·프리로드 둘 다 서명살았나 를 지난다
 *
 * ⚠ `src/검수화면.js` 는 react-native 를 끌고 온다 — `tests/lib/화면세우기.js` 를 먼저
 *   불러 치환을 켠 뒤에 require 한다(`검수화면.test.js` 와 같은 순서).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 코드만, 코드만픽스처 } = require('./lib/소스검사.js');
const { 그리기, ROOT } = require('./lib/화면세우기.js'); // ← 먼저 불러 react-native 치환을 켠다
const { 재열기남은분 } = require(path.join(ROOT, 'src', '검수화면.js'));

const 검수소스 = 코드만(fs.readFileSync(path.join(ROOT, 'src', '검수화면.js'), 'utf8'));
const 강사소스 = 코드만(fs.readFileSync(path.join(ROOT, 'src', '강사화면.js'), 'utf8'));
const 교수소스 = 코드만(fs.readFileSync(path.join(ROOT, 'src', '교수멘탈화면.js'), 'utf8'));

test('탐지력 픽스처 — 주석 제거기가 「설명 속의 코드」를 실제로 지운다', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석을 안 지운다 — 아래 소스 검사가 눈이 먼다');
});

test('D8-7 재열기남은분 경계 — 만료 직전 1분 · 지난 뒤 0 · 못 읽는 만료 null', () => {
  const 지금 = Date.parse('2026-08-31T10:00:00.000Z');
  assert.equal(재열기남은분(new Date(지금 + 10 * 60 * 1000).toISOString(), 지금), 10, '§5-1 수명 10분 그대로');
  assert.equal(재열기남은분(new Date(지금 + 30 * 1000).toISOString(), 지금), 1,
    '만료 30초 전은 아직 1분이다 — 0으로 접으면 산 창을 잠근다');
  assert.equal(재열기남은분(new Date(지금).toISOString(), 지금), 0);
  assert.equal(재열기남은분(new Date(지금 - 1000).toISOString(), 지금), 0,
    '지난 만료가 0이 아니면 죽은 창이 열려 보인다 — 눌러야 실패를 안다');
  assert.equal(재열기남은분('못 읽는 글자', 지금), null, '못 읽는 만료를 숫자로 지어내면 안 된다');
  assert.equal(재열기남은분(null, 지금), null);
});

test('D8-3 확정/저장 뒤 다음 항목이 화면 꼭대기에서 시작한다 — 두 화면 다 scrollTo 가 산다', () => {
  assert.match(검수소스, /말림참조\.current\.scrollTo\(\{ y: 0, animated: true \}\)/u,
    '검수화면에 스크롤 복귀가 없다 — 다음 항목이 앞 카드의 스크롤 위치에서 열린다');
  assert.match(강사소스, /말림참조\.current\.scrollTo\(\{ y: 0, animated: true \}\)/u,
    '강사화면에 스크롤 복귀가 없다 — 위와 같은 병이다');
});

test('D8-5 쓰기 단계에도 상황문이 산다 — 「무슨 상황이었더라」로 되돌아가지 않는다', () => {
  /* 픽스처는 손으로 짓지 않고 정본(팩)에 접게 한다 — `교수멘탈화면.test.js` 와 같은 규칙. */
  const { 시드만들기, 펴기 } = require(path.join(ROOT, 'contents', '교수멘탈문항.js'));
  const 시드 = 시드만들기('g1t01', 0, 0);
  const 문항 = 펴기(시드);
  const 글 = 그리기('src/교수멘탈화면.js', {
    재료: {
      prompt_seed: 시드, 문항, task_ref: 'task-2026-08-11',
      level_snapshot: 'Lv2', goal_snapshot: null, retry_of_event_id: null,
    },
    토큰: 'x', 학생번호: 'SYNK-042', 시작단계: '쓰기',
  });
  assert.ok(글.includes(문항.질문), '쓰기 카드에 상황문(문항.질문)이 없다 — 전략 단계에만 살고 쓰기에서 사라진다');
});

test('D5-9 게이지 칸은 덮개 opacity 로만 스며든다 — 바닥(잉크_희미)은 불변이다', () => {
  assert.match(교수소스, /<Animated\.View style=\{\[s\.게이지면_덮개, \{ opacity: 덮개 \}\]\} \/>/u,
    '덮개가 opacity 밖을 만진다 — useNativeDriver 가 못 미는 속성은 채점처럼 뚝 끊긴다');
  assert.match(교수소스, /useNativeDriver: true/u, '네이티브 드라이버가 꺼졌다 — 타이핑 리렌더에 스밈이 끊긴다');
  assert.match(교수소스, /게이지면: \{ alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: 색\.잉크_희미 \}/u,
    '게이지 바닥이 잉크_희미가 아니다 — 스밈은 덮개의 몫이고 바닥은 불변이어야 한다');
  assert.ok(!/게이지면_참/u.test(교수소스), '옛 즉시 교체 스타일(게이지면_참)이 남았다 — 두 통로가 갈린다');
});

test('G1-6 서명 수명을 화면이 잰다 — 캐시 적중·프리로드 둘 다 서명살았나 를 지난다', () => {
  assert.match(검수소스, /const 받은 = 서명살았나\(이미\) \? 이미 : await 오디오서명받기\(토큰, sid\);/u,
    '캐시 적중이 만료를 안 본다 — 죽은 서명으로 재생이 조용히 실패한다');
  assert.match(검수소스, /if \(!다음 \|\| 서명살았나\(서명맵\.get\(다음\.submission_id\)\)\) return;/u,
    '프리로드 가드가 has() 만 본다 — 만료된 프리로드분이 갱신되지 않는다');
});
