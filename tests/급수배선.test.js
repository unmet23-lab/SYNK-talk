/* 「급수」가 시트에서 `learners.level_current` 까지 오는 사슬 — 심문 0822 S7 의 회귀 (08-24).
 *
 * ■ 배경 — 이 배선이 서기 전의 실측
 *   스윕(A:H 창)은 급수 칸에 구조상 안 닿았고 `level_current` 운영 기입자는 0 — 전원 영구
 *   NULL 이었다. 그 값으로 소비자 8곳이 전부 «기본값 경로»만 탔다: 생성 모드 전원 비대상/미정
 *   (경보 0) · 게임 전원 G2 · 오늘과제 전원 선택지 · 강사 콘솔·첨삭 급수 빈칸 · level_distribution
 *   전량 'null' 버킷(CHECK 는 통과). 「낡음」이 아니라 「한 번도 없었음」이라 회귀도 예외도 없었다.
 *
 * ■ 이 파일이 지키는 것 (반배정.test.js 와 같은 무늬 — 그 셋의 급수판)
 *   ① 시트 「현재급수」 열이 실제로 읽힌다(열별칭) — 없으면 A:H 를 넓혀도 서버가 통째로 버린다.
 *   ② 정규화 값공간이 소비 쪽(`/^Lv[1-6]$/`)과 같다 — 적재가 넣는 값을 소비가 버리면 배선이 헛돈다.
 *   ③ 갱신이 `level_current` 한 칸에 갇히고, 못 읽은 값(null)은 «모름»이라 건너뛴다 —
 *      시트가 한 칸 비는 날 기존 급수가 지워지면 그날 생성·게임이 통째로 후퇴한다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { 코드만, 파일소스 } = require('./lib/소스검사.js');

const ROOT = path.resolve(__dirname, '..');
const 규칙 = require('../lib/명부규칙.js');
const 주석뺀소스 = 코드만(파일소스(path.join(ROOT, 'supabase', 'functions', 'roster-ingest', 'index.ts')));

/* 운영 profiles 머리글 «그대로» — 사람이 실제로 쓰는 표기로 픽스처를 짠다(반배정 무늬 ①). */
const 머리 = ['user_id', '이름', '이름_몽골', 'role', 'class_name', '생일', 'email', '연락처', '현재급수'];
const 학생 = (번호, 급수, 전화 = '9911-2233') => [`S26-${번호}`, '이름', '', 'student', 'A반', '', '', 전화, 급수];

test('① 「현재급수」 헤더가 열별칭으로 읽힌다 — 표읽기 행에 급수가 실린다', () => {
  assert.ok(Array.isArray(규칙.열별칭.급수) && 규칙.열별칭.급수.includes('현재급수'),
    '열별칭에 급수 키가 없다 — A:H 를 넓혀도 서버가 통째로 버린다(반이 겪은 그 병)');
  const { 행들, 오류 } = 규칙.표읽기([머리, 학생('0001', '3'), 학생('0002', '')]);
  assert.deepEqual(오류, []);
  assert.equal(행들[0].급수, '3');
  assert.equal(행들[1].급수, '');
});

test('② 급수정규화 값공간 — 정수 1~6 → Lv{n} · 이미 Lv 꼴 유지 · 그 외 전부 null(모름)', () => {
  assert.equal(규칙.급수정규화('3'), 'Lv3');
  assert.equal(규칙.급수정규화(' 6 '), 'Lv6');
  assert.equal(규칙.급수정규화('Lv1'), 'Lv1');
  for (const v of ['', null, undefined, '0', '7', 'Lv7', '중급', '기초']) {
    assert.equal(규칙.급수정규화(v), null,
      `${JSON.stringify(v)} 가 null 이 아니다 — 「한국어수준」 4값 어휘·이상값은 정본이 아니라 «모름»이다`);
  }
});

test('② 소비 쪽 검증과 같은 값공간이다 — 생성모드의 /^Lv[1-6]$/ 를 전값이 통과한다', () => {
  const 생성모드 = 코드만(파일소스(path.join(ROOT, 'supabase', 'functions', 'deliver', '생성모드.ts')));
  assert.ok(/\^Lv\[1-6\]\$/.test(생성모드), '소비 쪽 급수꼴(/^Lv[1-6]$/)이 옮겨졌다 — 이 대조를 그 자리로 따라 옮겨라');
  for (let n = 1; n <= 6; n += 1) {
    assert.match(String(규칙.급수정규화(String(n))), /^Lv[1-6]$/,
      '적재가 넣는 값이 소비 검증을 통과하지 못한다 — 배선이 헛돈다');
  }
});

test('③ 갱신은 level_current 한 칸 — is distinct from 를 지나고 null 은 짝에서 빠진다', () => {
  assert.ok(/set level_current = v\.level_current/.test(주석뺀소스), '급수 갱신 문장이 없다');
  assert.ok(/level_current is distinct from v\.level_current/.test(주석뺀소스),
    'is distinct from 이 없다 — 매 스윕 전원 갱신으로 떠서 「무엇이 달라졌나」를 못 알린다');
  const 갱신문 = 주석뺀소스.slice(주석뺀소스.indexOf('set level_current'), 주석뺀소스.indexOf('급수갱신 ='));
  assert.equal((갱신문.match(/set\s+\w+/g) || []).length, 1,
    '급수 갱신이 다른 칸까지 덮는다 — 시트 오타 한 번에 원본이 덮인다(반배정 ③과 같은 규율)');
  assert.ok(/p\.lv !== null/.test(주석뺀소스), 'null(모름) 필터가 없다 — 시트가 비는 날 기존 급수가 지워진다');
});

test('③ 신규 insert 에도 level_current 가 실린다 · 응답 봉투가 급수갱신·반비움잔존을 센다', () => {
  assert.ok(/'level_current'/.test(주석뺀소스), 'insert 열 목록에 level_current 가 없다 — 신규 학생만 영구 NULL 로 남는다');
  assert.ok(/급수갱신,/.test(주석뺀소스) && /반비움잔존,/.test(주석뺀소스),
    '봉투 계수가 없다 — 배선이 죽어도 아무도 모른다(0 은 분모와 함께)');
});

test('옛 스윕 호환 — 급수 열이 없는 표는 무동작이다(급수 전행 빈 값 → 정규화 null)', () => {
  const 옛머리 = 머리.slice(0, 8);
  const { 행들, 오류 } = 규칙.표읽기([옛머리, 학생('0001', '이값은잘린다').slice(0, 8)]);
  assert.deepEqual(오류, []);
  assert.equal(행들[0].급수, '');
  assert.equal(규칙.급수정규화(행들[0].급수), null);
});
