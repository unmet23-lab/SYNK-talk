/* 폐기한 세션이 죽는지 — `lib/토큰.js` 의 `살아있는학생` 조각이 정본이다.
 *
 * ■ 무엇이 뚫려 있었나 (절단문서 ②-15 · 2026-08-07 실측)
 *   폐기 판정은 DB 에 이미 있었다 — `engine.session_alive()`. 다만 그건 **RLS 정책 안에서만**
 *   불린다. `events`·`tasks`·`uploads`·`corrections`·`progress` 다섯은 `service_role` 로 돌아
 *   RLS 를 지나지 않으므로, 다섯 곳 모두 `auth_user_id` 하나만 보고 학생을 찾았다.
 *   결과: 비밀번호를 초기화해도 옛 토큰이 읽기·쓰기·**업로드 서명**을 그대로 이어갔다.
 *
 * ■ 이 검사가 지키는 세 가지
 *   ① 조각이 세 조건을 다 담는가 — 하나만 빠져도 **증상이 없다**(200 이 나온다).
 *   ② `iat` 유무로 **JS 가 분기하지 않는가** — 분기하면 「iat 없음 = 검사 생략」이 되어
 *      폐기 판정이 정확히 반대로 뒤집힌다. fail-closed 는 SQL 이 정한다.
 *   ③ SQL 정본(`session_alive`)과 **어긋나지 않는가** — 같은 판정을 두 곳에 적었으므로,
 *      갈라지면 기계가 잡아야 한다(CLAUDE.md 「목록은 하나에서 파생시킨다」의 대체물).
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 실제로 쓰는 표기 — 실저장소 `supabase/functions` 아래 `index.ts` 를 전부 읽는다.
 *      (여기에 별표-슬래시 글로브를 적으면 이 주석이 그 자리에서 닫힌다 — 실제로 한 번 겪었다.)
 *   ② 탐지력은 **픽스처 문자열**로 걸고, 실저장소에는 「지금 깨끗한가」만 건다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { 살아있는학생, 발급시각 } = require('../lib/토큰.js');

const 뿌리 = path.resolve(__dirname, '..');
const 함수들 = path.join(뿌리, 'supabase', 'functions');
const 스키마 = path.join(뿌리, 'supabase', 'L0_스키마.sql');

/** postgres.js 의 태그를 흉내낸다 — 조각과 값을 그대로 받아 적는다.
 *  값 자리는 `?` 로 남겨 **SQL 모양만** 비교할 수 있게 한다. */
const 가짜sql = (조각들, ...값들) => ({ 문: 조각들.join('?'), 값들 });

const 정규화 = (s) => s
  .replace(/\s+/g, ' ')
  .replace(/\(\s+/g, '(')
  .replace(/\s+\)/g, ')')
  .trim();

const uid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const 문 = (iat) => 정규화(살아있는학생(가짜sql, uid, iat).문);

/* ── ① 세 조건 ───────────────────────────────────────────────────── */

test('조각은 주체·활성·폐기시각 셋을 다 건다', () => {
  const s = 문(1_700_000_000);
  assert.match(s, /auth_user_id = \?::uuid/, '주체 조건이 없다 — 남의 행을 읽는다');
  assert.match(s, /\band active\b/, '활성 조건이 없다 — 정지된 계정이 계속 쓴다');
  assert.match(s, /revoked_before is null/, '폐기된 적 없는 계정을 통과시키는 갈래가 없다');
  assert.match(s, /to_timestamp\(\?::bigint\) >= revoked_before/,
    '발급 시각 비교가 없다 — 폐기해도 옛 토큰이 산다');
});

test('값은 주체와 iat 둘뿐이고 순서가 고정이다', () => {
  assert.deepEqual(살아있는학생(가짜sql, uid, 1_700_000_000).값들, [uid, 1_700_000_000]);
});

/* ── ② JS 가 분기하지 않는다 ──────────────────────────────────────── */

test('🔴 iat 가 없어도 SQL 모양이 같다 — 「iat 없음 = 검사 생략」이면 폐기가 뒤집힌다', () => {
  assert.equal(문(null), 문(1_700_000_000),
    'iat 유무로 SQL 이 달라졌다 — 판정을 JS 가 하고 있다. fail-closed 는 SQL 이 정한다');
  assert.deepEqual(살아있는학생(가짜sql, uid, null).값들, [uid, null],
    'iat 가 null 이면 값도 null 로 내려가야 한다(비교가 null 이 되어 거부된다)');
});

/** base64url 로 JWT 흉내 — 서명 자리는 아무 값이나 된다(검증은 플랫폼 몫). */
function jwt(클레임) {
  const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(클레임)}.sig`;
}
const 요청 = (클레임) => ({
  headers: { get: (k) => (k === 'Authorization' ? `Bearer ${jwt(클레임)}` : null) },
});

test('iat 는 클레임에서만 온다 — 서버 시각으로 대신하면 폐기가 되살아난다', () => {
  assert.equal(발급시각(요청({ sub: uid, iat: 1_700_000_000 })), 1_700_000_000);
  assert.equal(발급시각(요청({ sub: uid })), null, 'iat 가 없으면 지어내지 않는다');
  assert.equal(발급시각(요청({ sub: uid, iat: '1700000000' })), null, '문자열 iat 는 숫자가 아니다');
  assert.equal(발급시각({}), null, '헤더가 없어도 던지지 않는다');
});

/* ── ③ SQL 정본과 대조 ───────────────────────────────────────────── */

test('🔴 조각이 engine.session_alive() 와 같은 판정이다 — 갈라지면 여기서 빨개진다', () => {
  const sql원문 = fs.readFileSync(스키마, 'utf8');
  const 매치 = sql원문.match(
    /create or replace function engine\.session_alive[\s\S]*?\$function\$([\s\S]*?)\$function\$/,
  );
  assert.ok(매치, 'L0_스키마.sql 에서 session_alive 본문을 못 찾았다 — 이 검사가 미실행이 된다');

  // 정본은 `iat` 를 클레임에서 직접 꺼내고 Edge 는 인자로 받는다 — 그 자리만 `?` 로 맞춘다.
  const 정본 = 정규화(매치[1].replace(/\(auth\.jwt\(\)->>'iat'\)/g, '?'))
    .replace(/^select /, '');
  const 내것 = 문(1_700_000_000).replace(/^auth_user_id = \?::uuid and /, '');

  assert.equal(내것, 정본,
    'Edge 조각과 RLS 정본이 갈라졌다 — 한쪽만 고치면 통로에 따라 판정이 달라진다');
});

/* ── ④ 옛 통로 금지 ──────────────────────────────────────────────── */

const 본체들 = () => fs.readdirSync(함수들)
  .map((d) => [d, path.join(함수들, d, 'index.ts')])
  .filter(([, p]) => fs.existsSync(p));

const 옛통로 = /from\s+engine\.learners\s+where\s+auth_user_id\s*=/;

test('🔴 학생을 auth_user_id 만으로 찾는 함수가 없다', () => {
  const 샌곳 = 본체들()
    .filter(([, p]) => 옛통로.test(fs.readFileSync(p, 'utf8')))
    .map(([d]) => d);
  assert.deepEqual(샌곳, [], `옛 통로가 남았다: ${샌곳.join(', ')} — 살아있는학생() 을 쓴다`);
});

test('탐지력 — 옛 통로를 심으면 위 검사가 잡는다', () => {
  const 가짜 = 'select (select learner_id from engine.learners where auth_user_id = ${주체}::uuid) as learner_id';
  assert.ok(옛통로.test(가짜),
    '정규식이 옛 통로를 못 잡는다 — 잡지 못하면 위 검사는 통과와 미실행이 같은 모양이다');
});

test('학생 토큰으로 도는 함수는 전부 살아있는학생() 을 부른다', () => {
  const 대상 = ['events', 'tasks', 'uploads', 'corrections', 'progress'];
  for (const 이름 of 대상) {
    const src = fs.readFileSync(path.join(함수들, 이름, 'index.ts'), 'utf8');
    // `assert.match` 를 쓰면 실패할 때 파일 전문(2만 자)이 쏟아져 진짜 메시지가 묻힌다.
    assert.ok(/살아있는학생\(sql, 주체, 발급시각\(req\)\)/.test(src),
      `${이름}: 폐기 판정을 안 부른다 — 옛 토큰이 이 통로로 계속 산다`);
  }
});
