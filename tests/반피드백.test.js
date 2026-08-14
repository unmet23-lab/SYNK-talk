/* 강사 반 단위 피드백 통로 — 설계 §4·§5·§6 의 회귀 (§8-3).
 *
 * ■ 이 파일이 지키는 것은 다섯이다
 *   ① 어휘가 **한 벌**이다 — `lib/반피드백.js` 의 값목록과 DB CHECK 가 갈리면 JS 는 통과시키고
 *      DB 가 거절한다. 그 거절은 강사 화면에 「저장이 안 된다」로만 보인다.
 *   ② 「기다리는 것」의 술어가 **한 곳**이다 — 카드의 셈과 목록이 갈리면 「● 4 인데 들어가면 3건」.
 *   ③ 권한이 **서버**에 있다 — `staff_classes` 조인이 빠지면 모든 강사가 전교생을 본다.
 *   ④ 정렬 축이 **기다린 시간 하나**다 — 점수·정답률로 정렬하는 순간 등수표가 된다(철학 ㉢).
 *   ⑤ 강사 한 마디가 `corrections` 에 **안 간다** — 가면 검수 계보가 오염된다(설계 §2).
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 실제로 쓰는 표기 — 화면이 보낼 본문 모양 그대로 픽스처를 짠다.
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 **픽스처 문자열**로 걸고,
 *      실저장소에는 「지금 규칙 안인가」만 건다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { 코드만 } = require('./lib/소스검사.js');

const ROOT = path.resolve(__dirname, '..');
const 반피드백 = require('../lib/반피드백.js');
const 조각 = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260812210000_teacher_notes_c11.sql'), 'utf8');
const 소스 = fs.readFileSync(
  path.join(ROOT, 'supabase', 'functions', 'teach', 'index.ts'), 'utf8');
const 동봉 = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'supabase', 'functions', 'teach', '동봉.json'), 'utf8'));

/* 주석을 벗긴 소스 — 「금지된 것이 코드에 없다」를 볼 땐 주석의 그 낱말이 거짓 적색을 낸다.
 * (이 파일의 주석에도 `corrections` 가 여러 번 나온다 — 벗기지 않으면 검사가 자기 설명에 걸린다.) */
const 주석뺀소스 = 코드만(소스);
/* 마이그 조각의 부정 단언도 같은 병 — 단 언어가 SQL 이라 `코드만`(JS 렉서)이 못 진다.
 * SQL 제거기는 공용에 «안 합치는» 규약(가드계수 SQL사본)이라 여기서 한 벌 든다(가드계수 ㉠). */
const SQL주석없이 = (q) => q.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const 조각정제 = SQL주석없이(조각);

/** SQL CHECK 의 값목록을 뽑는다 — `check (열 in ('a', 'b'))`. */
function SQL값목록(열) {
  const m = new RegExp(`check \\(${열} in \\(([^)]*)\\)\\)`).exec(조각);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/* ── ① 어휘가 한 벌이다 (lib ↔ DB CHECK) ─────────────────────────────────── */

test('🔴 `origin` 값목록이 lib 과 DB CHECK 에서 같다 — 갈리면 JS 통과·DB 거절이다', () => {
  assert.deepEqual(SQL값목록('origin'), 반피드백.갈래,
    'SQL 에는 include 가 없어 사본을 못 없앤다 — 못 없애는 사본은 이 검사에 문다');
});

test('🔴 `disposition` 값목록이 lib 과 DB CHECK 에서 같다', () => {
  assert.deepEqual(SQL값목록('disposition'), 반피드백.처분);
});

test('탐지력 픽스처 — 값목록 추출기가 죽으면 위 두 검사가 무엇이든 통과시킨다', () => {
  assert.equal(SQL값목록('없는열'), null, '없는 열에서 값이 나오면 추출기가 아무거나 잡는 것이다');
  assert.ok(반피드백.갈래.length >= 3 && 반피드백.처분.length >= 2,
    '값목록이 비면 deepEqual 이 빈 배열끼리 맞아떨어져 영원히 통과한다');
});

/* ── ② 본문 검사 — 거절이 400 자리에서 난다 ──────────────────────────────── */

const 바른본문 = () => ({
  submission_id: '11111111-2222-4333-8444-555555555555',
  body: '어제보다 조사 쓰는 게 좋아졌어요.',
  origin: 'written',
  disposition: 'confirmed',
});

test('바른 본문은 통과하고, 값이 다듬어져 나온다', () => {
  const r = 반피드백.한마디검사({ ...바른본문(), body: '  잘했어요.  ' });
  assert.equal(r.거절, undefined);
  assert.equal(r.값.body, '잘했어요.', 'trim 을 안 하면 공백만 든 글이 DB CHECK 까지 가서 500 이 된다');
  assert.equal(r.값.origin, 'written');
});

test('🔴 공백만 든 한 마디는 **여기서** 막힌다 — 안 막으면 DB CHECK 가 500 으로 낸다', () => {
  const r = 반피드백.한마디검사({ ...바른본문(), body: '   ' });
  assert.equal(r.거절, 'CONTRACT_VIOLATION');
  assert.equal(r.칸, 'body', '어느 칸이 틀렸는지 안 주면 강사는 무엇을 고칠지 모른다');
});

test('🔴 값목록 밖 갈래·처분은 거절한다 — 통과시키면 DB CHECK 가 500 으로 낸다', () => {
  assert.equal(반피드백.한마디검사({ ...바른본문(), origin: 'writen' }).칸, 'origin');
  assert.equal(반피드백.한마디검사({ ...바른본문(), disposition: 'ok' }).칸, 'disposition');
  for (const v of 반피드백.갈래) {
    assert.equal(반피드백.한마디검사({ ...바른본문(), origin: v }).거절, undefined,
      `정상 갈래 ${v} 를 막으면 화면 버튼 하나가 통째로 죽는다`);
  }
});

test('submission_id 가 uuid 가 아니면 거절한다 — 지어내지 않는다', () => {
  assert.equal(반피드백.한마디검사({ ...바른본문(), submission_id: 'SYNK-001' }).칸, 'submission_id');
  assert.equal(반피드백.한마디검사(null).칸, 'submission_id', '본문이 통째로 없어도 500 이 아니다');
  assert.equal(반피드백.uuid읽기('11111111-2222-4333-8444-555555555555'),
    '11111111-2222-4333-8444-555555555555');
  assert.equal(반피드백.uuid읽기(' 11111111-2222-4333-8444-555555555555 '),
    '11111111-2222-4333-8444-555555555555', '앞뒤 공백은 사람 손의 정상 흔적이다');
});

test('본문 상한을 넘으면 **몇 자인지 말해 준다** — 「저장이 안 된다」로 끝내지 않는다', () => {
  const r = 반피드백.한마디검사({ ...바른본문(), body: '가'.repeat(반피드백.본문상한 + 1) });
  assert.equal(r.칸, 'body');
  assert.match(r.문구, new RegExp(String(반피드백.본문상한)),
    '상한을 안 알려주면 강사는 어디까지 줄여야 하는지 알 길이 없다');
  assert.equal(반피드백.한마디검사({ ...바른본문(), body: '가'.repeat(반피드백.본문상한) }).거절, undefined,
    '경계값은 통과여야 한다 — 상한이 「미만」이면 문구가 거짓말이 된다');
});

/* ── ③ 카드 — 「다 봤다」와 「빈 반」이 갈린다 ────────────────────────────── */

test('🔴 「다 봤다」와 「반이 비었다」가 같은 모양이 아니다', () => {
  assert.equal(반피드백.카드요약({ 학생수: 16, 기다림: 4 }).모양, 'waiting');
  assert.equal(반피드백.카드요약({ 학생수: 16, 기다림: 0 }).모양, 'clear');
  assert.equal(반피드백.카드요약({ 학생수: 0, 기다림: 0 }).모양, 'empty',
    '빈 반을 `clear` 로 접으면 강사가 「내가 다 봤구나」로 읽는다 — 빈 반은 정상 상태다(§8-1)');
});

test('카드가 내는 것에 점수·등수·평균이 없다 — 정렬 축이 곧 비교다(철학 ㉢)', () => {
  const 칸들 = Object.keys(반피드백.카드요약({ 학생수: 16, 기다림: 4 }));
  assert.deepEqual(칸들, ['학생수', '기다림', '모양'],
    '카드에 새 수를 더할 때 이 검사가 걸린다 — 그 수가 비교 축인지 먼저 답해야 한다');
});

/* ── ④ 통로 (함수 소스 불변식) ────────────────────────────────────────────── */

test('🔴 라우트 셋이 **경로표**에 등재됐다 — 메서드·안내문은 거기서 파생된다', () => {
  for (const [경로, 메서드] of [
    ['feedback/classes', 'GET'], ['feedback/queue', 'GET'], ['feedback/give', 'POST'],
  ]) {
    assert.match(주석뺀소스, new RegExp(`'${경로}':\\s*'${메서드}'`),
      `경로표에 없으면 404 다 — 손으로 세 곳에 적는 옛 판으로 돌아가지 않는다`);
  }
});

test('🔴 「기다리는 것」 술어가 **한 곳**이다 — 두 벌이면 카드 수와 목록 수가 갈린다', () => {
  const 술어 = /not exists \(select 1 from engine\.teacher_notes/g;
  const 셈 = (주석뺀소스.match(술어) || []).length;
  assert.equal(셈, 1,
    `「한 마디가 아직 없다」가 ${셈}곳에 적혀 있다 — 카드의 셈과 목록이 각자 적으면 갈리고,` +
    ' 갈린 증상은 「● 4 인데 들어가면 3건」이라 강사가 자기가 뭘 놓쳤는지 찾다 시간을 쓴다');
  assert.match(주석뺀소스, /function 기다림질의\(/, '공용 통로의 이름이 바뀌면 위 셈이 의미를 잃는다');
});

test('🔴 큐가 **AI 교정이 난 것만** 집는다 — 아니면 강사가 반응할 대상 없는 행을 본다', () => {
  assert.match(주석뺀소스, /exists \(select 1 from engine\.corrections c[\s\S]{0,160}?actor_kind = 'ai'/);
});

test('🔴 권한을 `staff_classes` 가 진다 — 라우트 셋 모두 그 조인을 지난다', () => {
  const 조인 = (주석뺀소스.match(/engine\.staff_classes/g) || []).length;
  assert.ok(조인 >= 4,
    `staff_classes 조인이 ${조인}번뿐이다 — service_role 은 RLS 를 우회하므로 이 조인이 유일한 방어선이다`);
  assert.match(주석뺀소스, /select s\.submission_id[\s\S]{0,400}?join engine\.staff_classes sc[\s\S]{0,200}?sc\.staff_id = /,
    '`give` 가 호출자가 준 submission_id 를 믿고 있다 — 담당 반 밖 학생에게 한 마디가 간다');
});

test('🔴 반 큐가 「담당 반인가」를 **먼저** 판정한다 — 0행으로 접으면 남의 반과 내 빈 반이 같아진다', () => {
  assert.match(주석뺀소스, /담당 반이 아닙니다/,
    '거절 자리가 없으면 남의 반 조회가 「빈 반」으로 성공한다(반 존재 여부를 알려주는 통로가 된다)');
});

test('🔴 정렬 축은 기다린 시간 하나다 — 점수·정답률·진도 정렬이 0이다', () => {
  const 큐구역 = 주석뺀소스.slice(주석뺀소스.indexOf('function 기다림질의'));
  assert.match(큐구역, /order by s\.occurred_at/);
  assert.ok(!/order by[^\n]*(score|정답률|accuracy|level|진도)/i.test(큐구역),
    '정렬 축이 성적이 되는 순간 이 화면이 등수표가 된다 — 철학 ㉢ 을 정면으로 깬다');
  // 탐지력: 등수 정렬이 실제로 들어오면 잡는지 픽스처로 못박는다.
  assert.ok(/order by[^\n]*(score|정답률|accuracy|level|진도)/i.test('order by c.score desc'),
    '추출기가 죽었다 — 그러면 위 검사는 무엇이든 통과시킨다');
});

test('🔴 강사 한 마디가 `corrections` 에 안 들어간다 — 가면 검수 계보가 오염된다(설계 §2)', () => {
  const 피드백구역 = 주석뺀소스.slice(주석뺀소스.indexOf('function 기다림질의'));
  assert.ok(!/insert into engine\.corrections/.test(피드백구역),
    'promotion_intent·supersedes·verdict 세 자리가 한꺼번에 흔들린다');
  assert.match(피드백구역, /insert into engine\.teacher_notes/, '저장 자리는 §6 ㉠ 이다');
});

test('0건도 감사 1행 — 빈 응답에만 장부가 없으면 조회 횟수의 분모가 조용히 달라진다', () => {
  for (const action of ['teach.feedback.classes', 'teach.feedback.queue', 'teach.feedback.give']) {
    assert.match(주석뺀소스, new RegExp(`'${action}'`), `${action} 감사 행이 없다`);
  }
  /* 반 목록: 감사 insert 가 **early return 앞**에 있어야 0건도 남는다. */
  const 목록 = 주석뺀소스.slice(주석뺀소스.indexOf('async function 내반목록'));
  const 감사자리 = 목록.indexOf("'teach.feedback.classes'");
  const 조기반환 = 목록.indexOf('if (!ids.length)');
  assert.ok(감사자리 !== -1 && 조기반환 !== -1 && 감사자리 < 조기반환,
    '감사가 early return 뒤에 있으면 「반 0개인 강사가 열었다」가 통째로 안 남는다');
});

test('🔴 동봉 사슬이 이어져 있다 — 안 이으면 배포는 초록이고 함수는 첫 import 에서 죽는다', () => {
  assert.equal(동봉['반피드백.mjs'], 'lib/반피드백.js', '동봉.json 에 없으면 그 파일이 안 실린다');
  assert.match(소스, /import 반피드백모듈 from '\.\/반피드백\.mjs'/);
  assert.ok(fs.existsSync(path.join(ROOT, 'lib', '반피드백.js')), '동봉이 가리키는 원본이 없다');
});

/* ── ⑤ 물리 (마이그레이션 조각) ──────────────────────────────────────────── */

test('🔴 한 산출물에 한 마디 — 유일 제약이 물리다', () => {
  assert.match(조각, /constraint teacher_notes_once_c11 unique \(submission_id\)/,
    '두 벌이 앉으면 「기다리는 것 n」이 마디 수인지 산출물 수인지 갈린다');
  assert.match(주석뺀소스, /on conflict on constraint teacher_notes_once_c11 do update/,
    '개서 통로가 없으면 오타 한 번이 영영 못 고치는 말이 된다(F103)');
});

test('🔴 남의 한 마디는 못 덮는다 — 한 반에 강사 둘이 정상이다(설계 §1 ⓐ)', () => {
  assert.match(주석뺀소스, /do update[\s\S]{0,300}?where engine\.teacher_notes\.staff_id = /,
    '조건 없이 덮으면 학생에게 간 말이 누구 말인지 아무도 모르게 된다');
  assert.match(주석뺀소스, /NOTE_BY_OTHER/,
    '`where` 가 안 맞으면 0행이 온다 — 그 침묵을 「성공」으로 읽으면 안 저장되고도 초록이다');
});

test('삭제는 막고 개서는 연다 — 트리거가 있어야 그 말이 프로즈가 아니다', () => {
  assert.match(조각, /create trigger teacher_notes_protect\s+before delete on engine\.teacher_notes/);
  assert.ok(!/before (update|insert or update) on engine\.teacher_notes/.test(조각정제),
    '개서까지 막으면 남는 통로가 0이 되고 그때 우회가 정상 통로가 된다(F103)');
  assert.match(조각, /updated_at\s+timestamptz/, '개서를 열되 조용하지는 않게 — 고친 사실이 행에 남는다');
});

test('engine 취급 그대로 — RLS 켜고 정책 0(나중에 노출하는 날 잊어도 닫힌 채로 실패한다)', () => {
  assert.match(조각, /alter table engine\.teacher_notes enable row level security/);
  assert.ok(!/create policy[^\n]*teacher_notes/.test(조각정제), '정책이 붙으면 전면 거부가 아니다');
});

test('산출물·강사가 사라져도 한 마디가 고아로 남지 않는다 — 고리 둘 + 삭제 차단', () => {
  assert.match(조각, /submission_id uuid not null references engine\.submissions\(submission_id\) on delete restrict/);
  assert.match(조각, /staff_id\s+uuid not null references engine\.staff\(staff_id\)/);
  assert.ok(!/on delete cascade/.test(조각정제), 'cascade 면 산출물 한 줄 삭제가 강사의 말까지 끌고 간다');
});
