/* 「반」이 시트에서 원본까지 오는 사슬 — 강사 반 단위 피드백 §8-1 의 회귀.
 *
 * ■ 이 파일이 지키는 것은 셋이다
 *   ① 시트 5열(`class_name`)이 **실제로 읽힌다** — 그동안 열별칭에 없어 통째로 버려졌다.
 *   ② 반이 빈 칸인 학생이 **거절되지 않는다** — 거절하면 반 배정이 앱 접속의 선행 조건이
 *      되어, 등록은 했는데 아직 반이 안 정해진 학생이 통째로 잠긴다. 대신 셈으로 뜬다.
 *   ③ 갱신이 **`class_id` 한 칸**에 갇힌다 — 넓히면 시트 오타 한 번에 이름·연락처가 원본에서
 *      덮인다(설계 §3 ⚠). 연락처는 어느 문도 안 덮는다.
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 실제로 쓰는 표기 — 운영 `profiles` 머리글 그대로 픽스처를 짠다.
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 **픽스처 문자열**로 걸고,
 *      실저장소에는 「지금 규칙 안인가」만 건다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 규칙 = require('../lib/명부규칙.js');
const 소스 = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'roster-ingest', 'index.ts'), 'utf8');
const 주석뺀소스 = 소스.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const 조각 = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260812200000_class_c11.sql'), 'utf8');

/* 운영 시트 머리글 그대로 — `Code.js:955-957` 의 열 지도다. */
const 머리 = ['user_id', '이름', '이름_몽골', 'role', 'class_name', '생일', 'email', '연락처'];
const 학생 = (번호, 반, 전화) => ['SYNK-' + 번호, '학생' + 번호, '', 'student', 반, '', '', 전화];

/* ── ① 시트 5열이 읽힌다 ──────────────────────────────────────────────────── */

test('🔴 시트 5열 `class_name` 이 실제로 읽힌다 — 여기가 그동안 버려지던 자리다', () => {
  const { 행들, 오류 } = 규칙.표읽기([머리, 학생('001', 'A반', '9911-2233'), 학생('002', 'B반', '8800-1122')]);
  assert.deepEqual(오류, []);
  assert.deepEqual(행들.map((r) => r.반), ['A반', 'B반'],
    '열별칭에 `반` 이 없으면 이 값이 통째로 사라진다 — 증상은 「강사 큐가 비어 있다」뿐이다');
});

test('별칭이 표기 흔들림을 흡수한다 — 사람이 시트 머리글을 어떻게 적든 같은 자리로 접힌다', () => {
  for (const 이름 of ['class_name', 'Class Name', '반', '클래스', 'class', '반 이름']) {
    const { 행들 } = 규칙.표읽기([
      ['학생번호', '전화', 이름],
      ['SYNK-010', '9911-2233', '3급A'],
    ]);
    assert.equal(행들[0].반, '3급A', `머리글 「${이름}」 을 못 읽었다`);
  }
});

test('반만 적힌 줄이 «빈 줄»로 접히지 않는다 — 접히면 그 학생은 어느 화면에도 안 뜬다', () => {
  const { 행들, 오류 } = 규칙.표읽기([
    ['학생번호', '전화', 'class_name'],
    ['', '', 'A반'],
  ]);
  /* 번호·전화가 없으니 행검사들이 잡아야 한다 — 잡히려면 우선 «읽혀야» 한다. */
  assert.deepEqual(오류, []);
  assert.equal(행들.length, 1, '빈 줄 판정에 새 열을 안 더하면 이 줄이 통째로 사라진다');
  assert.equal(규칙.행별가르기(행들).정상.length, 0);
});

/* ── ② 빈 반은 거절이 아니라 셈이다 ─────────────────────────────────────── */

test('🔴 반 열을 쓰는데 그 줄만 비어도 **거절하지 않는다** — 거절하면 그 학생이 앱에서 잠긴다', () => {
  const 표 = [머리, 학생('001', 'A반', '9911-2233'), 학생('002', '', '8800-1122')];
  const { 행들, 오류 } = 규칙.표읽기(표);
  assert.deepEqual(오류, [], '반이 비었다고 표 오류를 내면 `역할` 처방을 잘못 베낀 것이다');
  assert.deepEqual(규칙.행별가르기(행들).문제들, [],
    '행별 거절로 옮겨도 같다 — 스윕은 그 행을 흘리고 그 학생은 engine.learners 에 아예 안 선다');
  assert.deepEqual(규칙.반미배정(행들), [{ 줄: 3, 번호: 'SYNK-002' }],
    '거절하지 않는 대신 **이름을 부른다** — 조용히 넘기는 것은 처방이 아니다');
});

test('반 열이 전량 비면 무시한다 — 아직 반을 안 쓰는 시트에서 전원이 미배정으로 뜨면 소음이 된다', () => {
  const { 행들 } = 규칙.표읽기([머리, 학생('001', '', '9911-2233'), 학생('002', '', '8800-1122')]);
  assert.deepEqual(규칙.반미배정(행들), [],
    '「열 전량 비면 무시」는 `역할` 과 같다 — 소음이 된 알림은 아무도 안 본다');
});

test('탐지력 픽스처 — `반미배정` 이 늘 빈 배열이면 위 검사가 죽는다', () => {
  const 행들 = [{ 번호: 'SYNK-001', 반: 'A반', 줄: 2 }, { 번호: 'SYNK-002', 반: '', 줄: 3 }];
  assert.equal(규칙.반미배정(행들).length, 1, '판정기가 죽었다 — 그러면 「미배정 0명」이 영원히 참이 된다');
  assert.equal(규칙.반미배정([{ 번호: 'SYNK-001', 반: '', 줄: 2 }]).length, 0);
});

/* ── ③ 갱신은 한 칸에 갇힌다 (함수 소스 불변식) ─────────────────────────── */

test('🔴 기존 학생의 반을 «별도 문장»으로 갱신한다 — insert 만으로는 첫 배정 뒤 영영 안 바뀐다', () => {
  assert.match(주석뺀소스, /update engine\.learners l set class_id = v\.class_id/,
    '`계획()` 이 기존 행을 넣을것에서 빼므로 on conflict do update 는 경쟁 삽입에서만 발화한다');
  assert.match(주석뺀소스, /l\.class_id is distinct from v\.class_id/,
    '바뀐 행만 세지 않으면 매 스윕이 전원 갱신으로 뜨고 그 수는 아무것도 못 알려준다');
});

test('🔴 갱신 대상은 `class_id` 하나뿐 — 넓히면 시트 오타가 이름·연락처를 원본에서 덮는다', () => {
  const 넓힘 = /set\s+(?:contact|display_name)\s*=|do update set[\s\S]{0,160}?(?:contact|display_name)/;
  assert.ok(!넓힘.test(주석뺀소스), '전체 upsert 로 넓혔다 — 연락처는 첫 등록 게이트의 유일한 대조값이다');
  // 탐지력: 넓힌 판을 실제로 잡는지 픽스처로 못박는다(실저장소가 깨끗한 것과 검사가 도는 것은 다르다).
  assert.ok(넓힘.test('on conflict (student_code) do update set contact = excluded.contact'),
    '추출기가 죽었다 — 그러면 위 검사는 무엇이든 통과시킨다');
  assert.ok(!넓힘.test('update engine.learners l set class_id = v.class_id'), '정상 판을 잡으면 거짓 경보다');
});

test('🔴 연락처가 어긋난 행(`막힌것`)은 반 갱신에서 빠진다 — 남의 반에 넣는 것이 된다', () => {
  assert.match(주석뺀소스, /막힌번호[\s\S]{0,200}?막힌번호\.has/,
    '막힌 행을 거르지 않으면 같은 사람인지 모르는 행에 반을 적게 된다');
});

test('반 좌표 upsert 는 `on conflict` 에 **대상을 안 적는다** — 유일성이 부분 인덱스 «둘»이다', () => {
  assert.match(주석뺀소스, /insert into engine\.classes[\s\S]{0,400}?on conflict do nothing/,
    '대상을 지목하면 다른 쪽(시즌 안/밖) 충돌이 그대로 터진다');
  assert.ok(!/on conflict \(class_key/.test(주석뺀소스), '부분 인덱스는 conflict target 으로 못 지목한다');
});

test('🔴 시즌은 **서버가** 고른다 — 본문이 보낸 시즌으로 반을 매달지 않는다', () => {
  assert.match(주석뺀소스, /from engine\.season\s+where ends_on is null/,
    '열린 시즌은 DB 가 안다 — 호출자가 주면 그 값이 곧 위조 통로다');
  assert.ok(!/몸\.(?:시즌|season)/.test(주석뺀소스), '본문에서 시즌을 받고 있다');
});

/* ── ④ 물리 (마이그레이션 조각) ──────────────────────────────────────────── */

test('🔴 부분 유일 인덱스가 **둘 다** 있다 — 하나만 있으면 유일성이 물리가 아니다', () => {
  assert.match(조각, /create unique index if not exists classes_key_in_season[\s\S]{0,160}?where season_id is not null/,
    '시즌 안 유일성이 없으면 같은 시즌에 같은 반이 두 벌 선다');
  assert.match(조각, /create unique index if not exists classes_key_no_season[\s\S]{0,160}?where season_id is null/,
    '🔴 시즌 밖(= 미개원 지금)이 빠지면 이 표는 태어나는 날부터 안 지켜진다 — NULL 은 서로 다르다');
});

test('🔴 `learners.class_id` 는 not null 이 아니다 — 배정 전 학생이 통째로 잠긴다', () => {
  assert.match(조각, /add column class_id uuid references engine\.classes\(class_id\)/);
  assert.ok(!/add column class_id uuid[^;]*not null/.test(조각),
    'not null 로 조이면 반이 없는 학생은 행 자체가 못 서고, 그건 앱을 못 쓴다는 뜻이다');
});

test('지난 시즌 반은 지우는 게 아니라 닫는다 — `active` 칸이 있어야 그 말이 물리다', () => {
  assert.match(조각, /active\s+boolean not null default true/);
  assert.ok(!/on delete cascade/.test(조각),
    'cascade 면 반 한 줄 삭제가 학생 행까지 끌고 간다 — 과거 행의 FK 가 살아야 한다');
});
