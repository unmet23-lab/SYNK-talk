/**
 * L0 물리 스키마(supabase/L0_스키마.sql) 회귀
 *
 * 왜 있나 — DDL이 값목록을 CHECK로 박는 순간 **정본이 두 곳**이 된다(계약 JSON + SQL).
 *   c4에서 event_type이 늘었는데 SQL만 안 고치면 **서버는 보내고 DB는 조용히 거절한다** —
 *   증상은 「저장이 안 된다」뿐이라 원인이 안 보인다.
 *   목록은 하나에서 파생시키거나, 갈라지면 빨개지게 만든다 — 여기선 후자다.
 *
 * 🔑 RLS 검사가 여기 있는 이유: `engine`은 지금 API에 노출되지 않아 정책 실수가 무해하다.
 *   그래서 **잊기 좋고**, 노출하는 날 한꺼번에 드러난다. 무해할 때 못박아 둔다.
 *
 * 탐지력 실측(2026-08-05) — 변이 5/5 전량 빨개짐: 값 오타 · 값 삭제 · 순서 뒤집기 ·
 *   골든판정 문구 변조 · RLS 한 줄 삭제. 원본은 초록(거짓양성 0).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
/* 주석을 벗기고 센다 — 헤더의 c4 마이그레이션 **예시**가 실제 제약으로 세어져서
 * 버전 검사가 빨개졌다(2026-08-05 실측). 검사가 자기 문서를 위반으로 잡으면 곧 꺼진다.
 * ⚠ 천장: 문자열 리터럴 안의 `--` 는 구분하지 못한다(지금 이 파일엔 없다). */
const 원문 = fs.readFileSync(path.join(ROOT, 'supabase', 'L0_스키마.sql'), 'utf8');
const SQL = 원문.replace(/--.*$/gm, '');

function CHECK값목록_(제약이름) {
  const i = SQL.indexOf(`constraint ${제약이름} check`);
  assert.notEqual(i, -1, `SQL에서 제약 ${제약이름}을 못 찾았다 — 이름이 바뀌었다면 이 테스트도 함께 옮겨라`);
  const 끝 = SQL.indexOf('))', i);
  assert.notEqual(끝, -1, `${제약이름}의 괄호가 안 닫힌다`);
  return [...SQL.slice(i, 끝).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('event_type CHECK가 계약 값목록과 같다', () => {
  assert.deepEqual(CHECK값목록_('learning_events_event_type_c3'),
    계약.learning_events.값목록.event_type,
    'DDL과 계약이 갈라졌다 — 서버는 보내는데 DB가 조용히 거절하는 상태가 된다.\n' +
    '  고치는 법: 계약 파일을 먼저 고치고(c4 개정) SQL의 CHECK를 그것에 맞춘다');
});

test('task_type CHECK가 계약 값목록과 같다', () => {
  assert.deepEqual(CHECK값목록_('learning_events_task_type_c3'),
    계약.learning_events.값목록.task_type, 'DDL과 계약이 갈라졌다');
});

test('verdict CHECK가 계약 골든판정 3값과 같다', () => {
  assert.deepEqual(CHECK값목록_('corrections_verdict_c3'), 계약.골든판정, 'DDL과 계약이 갈라졌다');
});

test('오류태그 23종은 DB CHECK로 복제하지 않는다 (배열 CHECK = 이중 정본)', () => {
  // 태그 어휘는 아직 다듬어지는 중이라 DB 제약으로 굳히면 마이그레이션만 잦아진다.
  // 검증은 서버(계약 파일이 정본) — 문서 §3-4 v1.2 정정.
  const 태그가_SQL에 = 계약.오류태그.filter((t) => SQL.includes(`'${t}'`));
  assert.deepEqual(태그가_SQL에, [],
    `오류태그가 DDL에 박혔다: ${태그가_SQL에.join(', ')} — 계약 파일과 이중 정본이 된다`);
});

test('CHECK 제약 이름이 계약 버전을 달고 있다 (c4 개정이 조용히 미적용되는 것을 막는다)', () => {
  /* `create table if not exists` 는 테이블이 이미 있으면 문장 전체를 건너뛴다 —
   * CHECK 를 고치고 재실행해도 **아무 일도 안 일어나는데 초록으로 보인다.**
   * 이름에 버전을 박아두면 ①계약이 c4로 오를 때 이 테스트가 빨개져 rename 을 강제하고
   * ②DB 쪽은 확인 ④ 가 옛 이름을 드러낸다. 파일과 DB 양쪽에 눈을 하나씩 둔다. */
  const 이름들 = [...SQL.matchAll(/constraint (\w+) check/g)].map((m) => m[1]);
  assert.ok(이름들.length >= 3, `CHECK 제약을 ${이름들.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  const 안맞는 = 이름들.filter((n) => !n.endsWith(`_${계약.버전}`));
  assert.deepEqual(안맞는, [],
    `제약 이름이 계약 버전(${계약.버전})과 안 맞는다: ${안맞는.join(', ')}\n` +
    '  계약이 올랐다면 SQL 의 CHECK 를 새 값목록으로 고치고 **이름도 새 버전으로 바꾼 뒤**,\n' +
    '  이미 선 DB 에는 alter table drop constraint / add constraint 를 따로 돌린다(재실행으론 안 바뀐다)');
});

test('모든 engine 테이블에 RLS가 켜져 있다 (잊은 테이블 = 노출하는 날의 구멍)', () => {
  const 테이블 = [...SQL.matchAll(/create table if not exists engine\.(\w+)/g)].map((m) => m[1]);
  assert.ok(테이블.length >= 6, `engine 테이블을 ${테이블.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  const RLS = new Set([...SQL.matchAll(/alter table engine\.(\w+)\s+enable row level security/g)]
    .map((m) => m[1]));
  const 빠진 = 테이블.filter((t) => !RLS.has(t));
  assert.deepEqual(빠진, [],
    `RLS 없는 테이블: ${빠진.join(', ')} — engine을 API에 노출하는 날 통째로 읽힌다`);
});

test('학생에게 쓰기 정책을 열지 않았다 (쓰기는 전부 Edge Function을 지난다 · §4-3)', () => {
  const 정책 = [...SQL.matchAll(/create policy \w+ on engine\.\w+ for (\w+)/g)].map((m) => m[1]);
  assert.ok(정책.length >= 5, `정책을 ${정책.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  assert.deepEqual([...new Set(정책)], ['select'],
    `select 아닌 정책이 있다: ${[...new Set(정책)].join(', ')} — 학생 토큰이 DB에 직접 쓰면 payload 검증을 건너뛴다`);
});
