/* roster-ingest 의 불변식 — 아침 스윕 문이 CLI 와 **같은 규칙·같은 금지** 아래 있는지 잰다.
 *
 * 🔑 재는 것 셋:
 *   ① 파생 동치 — `검증`(CLI 얼굴)과 `행별가르기`(스윕 얼굴)가 **같은 판정**에서 나오는가.
 *     둘이 갈라지는 순간이 F269 의 시작이고, 갈라진 뒤 흘러든 데이터는 되돌릴 수 없다.
 *   ② 함수 소스 불변식 — CLI 의 소스 검사(`tests/명부등록.test.js`)와 같은 금지를 서버 문에도.
 *   ③ 동봉 완결성 — 규칙 lib 과 그 의존, `schema_ver` 정본(계약 JSON)이 표에 다 실렸는가.
 *     (배포 시점에도 `원격배포.require풀기` 가 막지만, 여기서 잡으면 배포 전에 잡는다.)
 *
 * 행동(멱등·막힘·분모 응답)은 실제 DB 왕복이 증명한다 — `tools/명부왕복시험.js`.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { 코드만 } = require('./lib/소스검사.js');

const ROOT = path.resolve(__dirname, '..');
const 규칙 = require('../lib/명부규칙.js');
const FN디렉터리 = path.join(ROOT, 'supabase', 'functions', 'roster-ingest');
const 소스 = fs.readFileSync(path.join(FN디렉터리, 'index.ts'), 'utf8');
/* 통로는 공용 하나다 — 여기 있던 지역 사본은 문자열 속 `//` 를 먹었다(F401). */
const 주석뺀소스 = 코드만(소스);

/* ── ① 파생 동치 ── */

const 줄로 = (rows) => rows.map((r, i) => ({ 번호: r[0], 전화: r[1], 이름: r[2] || '', 역할: r[3] || '', 줄: i + 2 }));

test('🔴 검증(전량 얼굴)과 행별가르기(행별 얼굴)는 같은 판정이다 — 문구까지 같아야 한 벌이다', () => {
  const 행들 = 줄로([
    ['SYNK-001', '9911-2233', '밧자'],        // 정상
    ['SYNK-42', '9911-2233'],                  // 자릿수 규격 밖
    ['SYNK-002', ''],                          // 전화 없음
    ['SYNK001', '9911-2233'],                  // 1행과 같은 학생(접기 중복)
    ['SYNK-003', '8800-1122'],                 // 정상
  ]);
  const 전량 = 규칙.검증(행들);
  const { 정상, 문제들 } = 규칙.행별가르기(행들);
  assert.deepEqual(문제들.map((x) => x.사유), 전량,
    '두 얼굴의 오류가 다르다 — 한 판정에서 파생되지 않았다(규칙 두 벌)');
  assert.deepEqual(정상.map((r) => r.번호), ['SYNK-001', 'SYNK-003']);
  assert.deepEqual(문제들.map((x) => x.줄), [3, 4, 5], '문제 행의 줄 번호가 알림에 실릴 수 없다');
});

test('행별가르기: 중복은 **뒤 행**이 문제로 서고 첫 행은 정상으로 남는다', () => {
  const 행들 = 줄로([['SYNK-010', '1111-2222'], ['synk010', '1111-2222']]);
  const { 정상, 문제들 } = 규칙.행별가르기(행들);
  assert.deepEqual(정상.map((r) => r.번호), ['SYNK-010']);
  assert.equal(문제들.length, 1);
  assert.match(문제들[0].사유, /같은 학생/);
});

test('머리글자리: 번호·전화 열이 없으면 표 전체가 읽기 불가다(위치로 짐작하지 않는다)', () => {
  assert.deepEqual(규칙.머리글자리([['이름', '반'], ['밧자', 'A']]).오류.length > 0, true);
  assert.deepEqual(규칙.머리글자리([['user_id', '이름', 'role', '연락처']]).오류, []);
  assert.deepEqual(규칙.머리글자리([]).오류, ['파일이 비어 있다']);
});

test('표읽기: profiles 머리글 그대로 — 강사·학부모는 건너뛰고 학생만 남는다', () => {
  const 표 = [
    ['user_id', '이름', '이름_몽골', 'role', 'class_name', '생일', 'email', '연락처'],
    ['SYNK-001', '밧자', 'Батжаргал', 'student', 'A반', '', '', '9911-2233'],
    ['SYNK-777', '강사님', '', 'teacher', '', '', '', '9999-0000'],
    ['SYNK-002', '터그스', '', 'student', 'B반', '', '', '8800-1122'],
  ];
  const { 행들, 대상아닌행, 오류 } = 규칙.표읽기(표);
  assert.deepEqual(오류, []);
  assert.deepEqual(행들.map((r) => r.번호), ['SYNK-001', 'SYNK-002']);
  assert.deepEqual(대상아닌행.map((r) => r.역할), ['teacher']);
});

test('표읽기와 명부읽기(CSV)는 같은 답을 낸다 — 스윕과 내려받기가 갈라지면 안 된다', () => {
  const 표 = [['user_id', '연락처', 'role'], ['SYNK-005', '9944-5566', 'student']];
  const csv = 표.map((r) => r.join(',')).join('\n');
  assert.deepEqual(규칙.표읽기(표), 규칙.명부읽기(csv));
});

/* ── ② 함수 소스 불변식 (CLI 소스 검사와 같은 금지) ── */

test('🔴 서버 문도 계정·동의를 만들지 않는다 (F269 · 위조 금지)', () => {
  assert.ok(!/admin\/users/.test(주석뺀소스), 'GoTrue 관리자 API 를 부르고 있다');
  assert.ok(!/auth_user_id\s*=\s*[^=]/.test(주석뺀소스), 'auth_user_id 를 쓰고 있다 — 그 칸은 첫 등록만 채운다');
  assert.ok(!/insert\s+into\s+engine\.consents/i.test(주석뺀소스), 'consents 행을 만들고 있다 — 통로는 tools/동의발급.js 하나다');
});

test('🔴 붓는 값은 표기형이고, 기존 조회는 앱과 같은 접기다', () => {
  assert.match(주석뺀소스, /학생번호표기\(/, '표기형을 안 지나면 synk042 가 그대로 명부에 선다');
  assert.match(주석뺀소스, /upper\(replace\(student_code, '-', ''\)\)/,
    'auth/index.ts 조회와 같은 접기여야 한다 — 갈라지면 중복 행을 못 본다');
  assert.match(주석뺀소스, /on conflict \(student_code\) do nothing/,
    'CLI 와 같은 아침에 돌면 경쟁 삽입이 난다 — unique(c6) 에 흡수를 맡겨야 한다');
});

test('🔴 시크릿 문 — 미설정은 503 으로 드러난다(없는 자물쇠를 통과로 읽지 않는다)', () => {
  assert.match(주석뺀소스, /ROSTER_INGEST_SECRET/, '좁은 시크릿이 없다 — anon 키는 공개물이라 자물쇠가 아니다');
  assert.match(주석뺀소스, /503/, '시크릿 미설정을 401·200 으로 접으면 설정을 빠뜨린 날이 조용해진다');
});

test('schema_ver 는 CLI 와 같은 정본(계약 JSON)에서 온다 — DB 이름으로 대신 세지 않는다', () => {
  assert.match(소스, /수집_교정_계약\.json' with \{ type: 'json' \}/, '계약 JSON 동봉 import 가 없다');
  assert.ok(!/schema_migrations/.test(주석뺀소스), 'DB 마이그레이션 이름으로 세면 CLI 도장과 갈라진다');
});

/* ── ③ 동봉 완결성 ── */

test('동봉 표 — 규칙 lib·의존·계약 JSON 이 전부 실린다', () => {
  const 표 = JSON.parse(fs.readFileSync(path.join(FN디렉터리, '동봉.json'), 'utf8'));
  assert.deepEqual(표, {
    '명부규칙.mjs': 'lib/명부규칙.js',
    '학생계정.mjs': 'lib/학생계정.js',
    '로그인코드.mjs': 'lib/로그인코드.js',
    '수집_교정_계약.json': '계약/수집_교정_계약.json',
  }, '표가 다르다 — 빠지면 배포는 성공하고 함수가 import 에서 죽는다(F313 축)');
  for (const 경로 of Object.values(표)) {
    assert.ok(fs.existsSync(path.join(ROOT, 경로)), `동봉 원본이 없다: ${경로}`);
  }
});
