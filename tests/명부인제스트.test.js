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

/* ── ②-2 조·좌석 스냅샷 (숙제서클 §10-3 · 20260814100000) ── */

test('조편성은 키가 있을 때만 움직인다 — 호환의 방향은 「무동작」이지 「전부 비움」이 아니다', () => {
  assert.match(주석뺀소스, /if \(Array\.isArray\(몸\.조편성\)\)/u,
    '조편성 처리가 키 유무로 안 갈린다 — 옛 스윕(키 없음)이 전 학생의 조를 비우게 된다');
  /* 해제(스냅샷 미언급 비움)가 그 가드 **안**에 있는가 — 밖이면 위 가드가 무의미하다. */
  const 가드시작 = 주석뺀소스.indexOf('if (Array.isArray(몸.조편성))');
  const 해제자리 = 주석뺀소스.indexOf('set group_no = null, seat_no = null');
  const 다음절 = 주석뺀소스.indexOf('무동의', 가드시작);
  assert.ok(해제자리 !== -1, '스냅샷 미언급 학생을 안 비운다 — 재편성에서 빠진 학생의 옛 조가 영원히 남는다');
  assert.ok(가드시작 !== -1 && 가드시작 < 해제자리 && 해제자리 < 다음절,
    '해제 update 가 조편성 가드 밖이다 — 키 없는 옛 스윕이 전 학생의 조를 비운다');
});

test('조 갱신은 바뀐 행만 센다 · 연락처 막힘은 조도 안 적는다', () => {
  assert.match(주석뺀소스, /l\.group_no is distinct from v\.g or l\.seat_no is distinct from v\.s/u,
    '갱신이 전원에게 매 스윕 도장을 찍는다 — 「무엇이 달라졌나」를 셈이 못 알려준다');
  assert.match(주석뺀소스, /막힌번호\.has\(정규형\(sid\)\)/u,
    '연락처 대조가 막힌 행에 조를 적는다 — 같은 사람인지 모르는 행이 남의 조에 앉는다(반과 같은 축)');
});

test('결속 — Fn 의 조·좌석 범위 못이 DB CHECK 와 같은 수다', () => {
  /* 한쪽만 조이면 다른 쪽에서 500 이 난다(Fn 이 넓으면 DB 가 죽이고, DB 가 넓으면 쓰레기가 앉는다). */
  const 스키마 = fs.readFileSync(path.join(ROOT, 'supabase', 'L0_스키마.sql'), 'utf8');
  assert.match(스키마, /check \(group_no between 1 and 20\)/u, 'DB 쪽 조 CHECK 앵커가 낡았다');
  assert.match(스키마, /check \(seat_no {2}between 1 and 20\)/u, 'DB 쪽 좌석 CHECK 앵커가 낡았다');
  assert.match(주석뺀소스, /조 < 1 \|\| 조 > 20 \|\| !Number\.isInteger\(좌석\) \|\| 좌석 < 1 \|\| 좌석 > 20/u,
    'Fn 쪽 범위 못이 1~20 이 아니다 — DB CHECK 와 갈라지면 한 행의 쓰레기가 500 으로 판 전체를 막는다');
});

/* 🔴 반박 P2-③ — **명부에 없는 학생 번호가 아무 데도 안 적히고 아무 말도 안 했다.**
 *   `update … where student_code = v.student_code` 는 0행 매치를 오류로 안 내고, 바로 아래
 *   해제가 그 학생을 「스냅샷 미언급」으로 보고 **실물 학생의 조를 지운다.** groups 시트의
 *   번호 한 글자 오타가 매일 아침 되풀이되는데 알림은 0이고, 증상은 그 학생만 「조 미편성」 —
 *   **편성 전과 같은 모양**이라 아무도 못 가른다. 그래서 짝 수와 매치 수를 대조해야 한다. */
test('🔴 명부에 없는 번호는 조편성문제로 되돌아온다 — 갱신 0행은 「값이 같았다」이지 「없다」가 아니다', () => {
  assert.match(주석뺀소스, /not exists \(select 1 from engine\.learners l where l\.student_code = v\.student_code\)/u,
    '짝 수와 매치 수를 안 대조한다 — 오타 난 번호가 조용히 사라지고 그 학생의 조는 매일 지워진다');
  /* 그 미매치가 **되돌아가는 곳**이 조편성문제여야 한다 — 로그로만 남기면 시트를 고칠 사람에게
     안 간다(스윕 알림은 조편성문제만 사람 말로 편다). */
  const 대조자리 = 주석뺀소스.indexOf('not exists (select 1 from engine.learners');
  const 되돌림 = 주석뺀소스.indexOf('조편성문제.push', 대조자리);
  assert.ok(대조자리 !== -1 && 되돌림 !== -1 && 되돌림 - 대조자리 < 500,
    '미매치를 조편성문제로 안 되돌린다 — 서버만 알고 시트를 고칠 사람은 모른다');
  /* 갱신 수로 대신 세는 길을 막는다(탐지 픽스처): `is distinct from` 이 걸러 낸 「값이 같았다」와
     「그런 학생이 없다」가 그 수 안에서 같은 모양이라, 그걸로 세면 영원히 0건이 안 잡힌다. */
  assert.ok(!/조갱신\.length !== 코드들\.length/u.test(주석뺀소스),
    '갱신 수로 미매치를 센다 — 값이 안 바뀐 학생까지 「없는 학생」이 된다');
});

test('응답이 조 갱신·해제·문제를 센다 — 0건과 안 잰 것이 같은 모양이면 안 된다(F207)', () => {
  for (const 칸 of ['조갱신', '조해제', '조편성문제']) {
    assert.ok(주석뺀소스.includes(칸), `응답에 ${칸} 이 없다 — 스윕 알림이 그 갈래를 영영 모른다`);
  }
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
