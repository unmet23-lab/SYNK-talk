'use strict';
/* 감사 회귀 R4B1 — 이 조 시공 앵커.
 *   D6-16 판눈금·눌림층 토큰(값 변경 0 · 리터럴 재발 방지) · G3-1 오류 병기의 화면 무늬.
 * ⚠ G3-1 줄들()은 tests/문구_오류.test.js · S1-6 경과시계는 tests/경과시계.test.js ·
 *   G2-9 압축은 tests/로그압축.test.js 가 진다 — 층이 그쪽 정본이라 여기 겹쳐 적지 않는다. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 코드만, 파일소스, 코드만픽스처 } = require('./lib/소스검사.js');

const ROOT = path.join(__dirname, '..');
const 소스 = (p) => 코드만(파일소스(path.join(ROOT, ...p.split('/'))));

test('주석 제거기가 산다 — 아래 소스 검사들이 설명을 코드로 읽지 않는다', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다 — 이 파일 전체가 거짓 초록이 된다');
});

/* ── D6-16 — 판눈금·눌림층: 같은 값을 상수로 걷었다(값 변경 0) ── */

test('D6-16 「borderRadius: 20, padding: 22」 리터럴이 src 에 0건이다 — 정본은 테마.판눈금 하나', () => {
  const 걸린것 = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((x) => x.endsWith('.js'))) {
    if (소스(`src/${f}`).includes('borderRadius: 20, padding: 22')) 걸린것.push(f);
  }
  assert.deepEqual(걸린것, [],
    `카드 판 값이 리터럴로 되돌아왔다(열한 번째 사본이 곧 갈라진다): ${걸린것.join(' · ')}`);
  /* 탐지력 — 실저장소 0건과 「아무것도 안 읽음」은 같은 모양이라, 소비처가 실제로 토큰을 쓰는지로 분모를 세운다. */
  const 소비처 = fs.readdirSync(path.join(ROOT, 'src')).filter((x) => x.endsWith('.js'))
    .filter((f) => /borderRadius: 판눈금\.반경, padding: 판눈금\.여백/.test(소스(`src/${f}`)));
  assert.equal(소비처.length, 10, `판눈금 소비처가 ${소비처.length}곳이다 — 열 파일에서 걷었으니 열이어야 한다`);
});

test('D6-16 토큰 값이 현행 실측 그대로다 — 걷기는 이동이지 개정이 아니다(시각 리스크 0 약속)', () => {
  const 테마 = 소스('src/테마.js');
  assert.match(테마, /export const 판눈금 = Object\.freeze\(\{ 반경: 20, 여백: 22 \}\);/,
    '판눈금 값이 실측(20/22)에서 움직였다 — 값 개정은 유호님 눈 판정이다');
  assert.match(테마, /export const 눌림층 = Object\.freeze\(\{ 버튼: 0\.82, 잠김: 0\.35 \}\);/,
    '눌림층 값이 실측(0.82/0.35)에서 움직였다 — 값 개정은 유호님 눈 판정이다');
});

test('D6-16 눌림층 소비 — 걷은 다섯 자리(인증·답장 눌림/잠김 · 서류관문 대기)가 토큰을 탄다', () => {
  const 인증 = 소스('src/인증화면.js');
  assert.match(인증, /버튼_잠김: \{ opacity: 눌림층\.잠김 \}/);
  assert.match(인증, /버튼_눌림: \{ opacity: 눌림층\.버튼 \}/);
  const 답장 = 소스('src/답장화면.js');
  assert.match(답장, /버튼_잠김: \{ opacity: 눌림층\.잠김 \}/);
  assert.match(답장, /버튼_눌림: \{ opacity: 눌림층\.버튼 \}/);
  assert.match(소스('src/서류관문화면.js'), /제출_대기: \{ opacity: 눌림층\.잠김 \}/);
});

test('D6-16 눌림층 소비 — 조 소유 밖이라 통합자가 걷은 여섯 자리(검수·문구감수·원장초기화)도 토큰을 탄다', () => {
  const 검수 = 소스('src/검수화면.js');
  assert.match(검수, /잠김: \{ opacity: 눌림층\.잠김 \}/);
  assert.match(검수, /눌림: \{ opacity: 눌림층\.버튼 \}/);
  const 문구감수 = 소스('src/문구감수화면.js');
  assert.match(문구감수, /잠김: \{ opacity: 눌림층\.잠김 \}/);
  assert.match(문구감수, /pressed && \{ opacity: 눌림층\.버튼 \}/);
  const 원장 = 소스('src/원장초기화.js');
  assert.match(원장, /버튼_잠김: \{ opacity: 눌림층\.잠김 \}/);
  assert.match(원장, /버튼_눌림: \{ opacity: 눌림층\.버튼 \}/);
});

/* ── G3-1 — 오류 병기: ko\nmn 을 화면이 `줄들` 로 갈라 i===0 킷폰트 무늬로 그린다 ── */

test('G3-1 세 화면의 오류 렌더가 줄들() 병기 무늬다 — 뒤 줄이 킷 한글 폰트를 타면 키릴이 두부가 된다', () => {
  const 인증 = 소스('src/인증화면.js');
  assert.match(인증, /줄들\(글\)\.map\(\(줄, i\) =>/, '인증 오류줄이 줄별 렌더가 아니다');
  assert.match(인증, /i === 0 \? s\.오류 : s\.오류_병기/, '인증 오류 병기 갈래가 없다');
  assert.match(인증, /오류_병기: \{ fontFamily: 몽골어폰트\.강조[^}]*color: 색\.신호/, '인증 병기 줄의 폰트·신호색이 어긋났다');

  const 말하기 = 소스('src/말하기화면.js');
  assert.match(말하기, /줄들\(오류\)\.map\(\(줄, i\) =>/, '말하기 오류가 줄별 렌더가 아니다');
  assert.match(말하기, /i === 0 \? s\.오류 : s\.오류_병기/, '말하기 오류 병기 갈래가 없다');
  assert.match(말하기, /오류_병기: \{ fontFamily: 몽골어폰트\.강조/, '말하기 병기 줄이 몽골어폰트를 안 탄다');

  const 답장 = 소스('src/답장화면.js');
  assert.match(답장, /줄들\(오류\)\.map\(\(줄, i\) =>/, '답장 오류가 줄별 렌더가 아니다');
  assert.match(답장, /i === 0 \? s\.알림 : s\.알림_병기/, '답장 알림 병기 갈래가 없다');
  assert.match(답장, /알림_병기: \{ fontFamily: 몽골어폰트\.캡션/, '답장 병기 줄이 몽골어폰트를 안 탄다');

  /* 가르는 자는 정본 하나다 — 화면이 제 손으로 split 하면 `줄들` 과 갈라진다. */
  for (const p of ['src/인증화면.js', 'src/말하기화면.js', 'src/답장화면.js']) {
    assert.ok(!/오류[^\n]*\.split\(/.test(소스(p)), `${p} 가 오류 글을 제 손으로 가른다 — 가르는 자는 문구_오류.줄들 하나다`);
  }
});
