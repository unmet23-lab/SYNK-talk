/**
 * `source_kind` — 「어떻게 알게 됐나」의 회귀 (절단문서 ①-7).
 *
 * 계약 「추정메타」에 c3부터 있던 이름인데 `supabase/` 전량에 DDL 열도 INSERT 도 0건이었다.
 * 검증기는 그 넷을 `서버칸` 으로 두어 앱을 400 으로 막고, 서버는 담을 자리가 없었다 —
 * 즉 계약에만 사는 이름이었다(F185 가 계약층에서 잡은 고아 필드의 **물리층 판**).
 *
 * 여기가 재는 것은 하나다: **계약에 사건을 늘린 사람이 그 사건의 출처를 정하게 만든다.**
 * 안 정하면 그 행은 `source_kind` 가 null 로 쌓이고, 나중에 무엇이 관측이고 무엇이 추정이었는지
 * 판별할 길이 없다(소급 불가). DB 왕복 증명은 tools/배달왕복시험.js 가 진다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 읽기 = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const { 사건출처, 출처종류 } = require('../lib/사건출처.js');
const 계약 = require('../계약/수집_교정_계약.json');
const 값목록 = 계약.learning_events.값목록;

const EVENTS = 읽기('supabase', 'functions', 'events', 'index.ts');
const DELIVER = 읽기('supabase', 'functions', 'deliver', 'index.ts');
const 조각 = 읽기('supabase', 'migrations', '20260807170000_engine_c8.sql');

test('계약의 모든 event_type 이 출처를 갖는다 (이름만 늘리고 여기를 비우면 그 행은 null 로 쌓인다)', () => {
  assert.ok(값목록.event_type.length >= 10,
    `계약 event_type 을 ${값목록.event_type.length}개밖에 못 읽었다 — 이 검사는 그러면 무엇이든 통과시킨다`);
  const 빠진것 = 값목록.event_type.filter((et) => !Object.prototype.hasOwnProperty.call(출처종류, et));
  assert.deepEqual(빠진것, [],
    `출처를 안 정한 사건: ${빠진것.join(', ')}\n`
    + '  계약에 사건을 늘렸으면 lib/사건출처.js 에도 「이건 관측인가 추정인가」를 적어라.\n'
    + '  안 적으면 그 사건의 행은 source_kind 가 null 로 쌓이고 소급이 안 된다(절단문서 ①-7).');
});

test('출처표에 계약 밖 이름이 없다 (반대방향 — 지어낸 사건에 값을 매기면 계약이 둘이 된다)', () => {
  const 유령 = Object.keys(출처종류).filter((et) => !값목록.event_type.includes(et));
  assert.deepEqual(유령, [], `계약 값목록에 없는 사건: ${유령.join(', ')}`);
});

test('모든 출처 값이 계약 값목록 source_kind 안이다', () => {
  assert.deepEqual([...값목록.source_kind].sort(), ['explicit', 'inferred', 'observed', 'teacher']);
  const 밖 = [...new Set(Object.values(출처종류))].filter((v) => !값목록.source_kind.includes(v));
  assert.deepEqual(밖, [], `값목록 밖 출처: ${밖.join(', ')}`);
});

test('모르는 사건은 null 이다 — 기본값으로 접지 않는다', () => {
  assert.equal(사건출처('없는.사건'), null,
    '기본값(?? observed)으로 접으면 계약에 사건을 늘린 사람이 아무것도 안 해도 통과하고,\n'
    + '  그 행들은 **틀린 값**을 들고 쌓인다. 빈 칸은 나중에 「안 정했다」로 읽히지만 틀린 값은 사실로 읽힌다.');
  assert.equal(사건출처(undefined), null);
});

test('배달 두 행은 추정이다 (관측으로 두면 판단 실패가 학생 특성으로 읽힌다)', () => {
  assert.equal(출처종류['intervention.delivered'], 'inferred');
  assert.equal(출처종류['task.assigned'], 'inferred');
});

test('학생이 말한 것과 학생을 관측한 것을 안 섞는다', () => {
  assert.equal(출처종류['preference.stated'], 'explicit', '학생이 스스로 말한 것은 관측이 아니다');
  assert.equal(출처종류['submission.created'], 'observed');
  assert.equal(출처종류['exam.result'], 'teacher', 'TOPIK 실성적은 앱 밖에서 사람이 넣는다');
});

/* ── 통로가 실제로 스탬프하는가 ────────────────────────────────────────────────
 * 🔴 「낱말이 있나」로 재지 않는다 — F176 실측: 소스에 이름만 있으면 호출을 SQL 로 되돌려도
 *   통과했다. 열 목록에 이름이 있고 **그 값을 사건출처에서 얻는지**를 같이 본다. */
test('events·deliver 가 source_kind 를 싣고, 그 값을 사건출처에서 얻는다', () => {
  /* 실패해도 파일 전문을 안 뱉게 assert.ok 로 잰다 — assert.match 는 소스 전체를 화면에 붓는다. */
  for (const [이름, SRC] of [['events', EVENTS], ['deliver', DELIVER]]) {
    assert.ok(/insert into engine\.learning_events \([^)]*\bsource_kind\b/s.test(SRC),
      `${이름} 의 learning_events INSERT 열 목록에 source_kind 가 없다 — 열은 있는데 아무도 안 채우는 상태로 되돌아갔다`);
    assert.ok(/\$\{사건출처\([^}]*\)\}::engine\.source_kind/.test(SRC),
      `${이름} 이 source_kind 값을 사건출처()에서 얻지 않는다 — 리터럴로 박으면 두 통로가 갈라진다`);
    assert.ok(/from '\.\/사건출처\.mjs'/.test(SRC),
      `${이름} 이 사건출처 모듈을 import 하지 않는다`);
  }
});

test('두 함수의 동봉 표에 사건출처가 있다 (없으면 배포는 성공하고 import 에서 죽는다)', () => {
  for (const 이름 of ['events', 'deliver']) {
    const 동봉 = JSON.parse(읽기('supabase', 'functions', 이름, '동봉.json'));
    assert.equal(동봉['사건출처.mjs'], 'lib/사건출처.js',
      `${이름}/동봉.json 에 사건출처.mjs 가 없다 — 원격배포는 통과하고 함수가 import 에서 죽는다`);
  }
});

test('마이그레이션 조각이 네 칸을 다 연다 (하나만 열면 나머지는 계속 계약에만 산다)', () => {
  assert.match(조각, /create type engine\.source_kind as enum \('explicit', 'teacher', 'observed', 'inferred'\)/);
  for (const 열 of ['source_kind', 'estimator_confidence', 'estimator_version', 'evidence_refs']) {
    assert.match(조각, new RegExp(`add column if not exists ${열}\\b`), `조각이 ${열} 을 안 연다`);
  }
});
