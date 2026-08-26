'use strict';
/* 문구 반입 판정 회귀 — `lib/문구반입규칙.js`(순수)를 문다.
 *
 * 🔴 이 파일이 지키는 가장 큰 것 = **이미 끝난 감수가 조용히 낡지 않는 것**
 *   원문이 바뀐 줄을 `on conflict do update` 로 덮으면 그 줄은 여전히 `verified` 인 채
 *   **옛 번역**을 들고 내보내기 파일에 실리고 앱까지 간다. 증상이 없다 — 그래서 여기서 잰다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { 코드만, 파일소스 } = require('./lib/소스검사.js');
const 규칙 = require('../lib/문구반입규칙.js');
const 자격증명 = require('../lib/자격증명.js');
const { 질의들 } = require('../tools/문구내보내기.js');
const { 반입칸, 문구_1차 } = require('../contents/문구_1차.js');
const { 내보내기질의 } = require('../lib/문구감수.js');

const 줄 = (o) => ({ string_id: 'a.b', source_ko: '가', draft_mn: null, context: '맥락', max_len: null, ...o });
const DB = (o) => ({ ...줄(o), status: 'verified', ...o });

test('① 반입칸이 목록·규칙에서 한 벌이다 — 갈라지면 insert 가 없는 열을 부른다', () => {
  assert.deepEqual([...반입칸], [...규칙.칸]);
  assert.equal(반입칸.includes('source_file'), false);
});

test('② 같은 목록을 두 번 부어도 할 일이 0 이다 (멱등)', () => {
  const 목록 = [줄({ string_id: 'a.b' }), 줄({ string_id: 'c.d', source_ko: '나', max_len: 12 })];
  const 판 = 규칙.대조(목록, 목록.map((x) => DB(x)));
  assert.equal(판.그대로.length, 2);
  assert.equal(규칙.할일수(판, false), 0);
  assert.equal(규칙.SQL(판, false), null, '할 일이 없는데 SQL 이 나왔다 — 빈 트랜잭션이 나간다');
});

test('③ 새것은 insert 하나로 묶인다', () => {
  const 판 = 규칙.대조([줄({ string_id: 'a.b' }), 줄({ string_id: 'c.d' })], []);
  assert.equal(판.새것.length, 2);
  const sql = 규칙.SQL(판, false);
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;$/);
  assert.equal((sql.match(/insert into engine\.l10n_strings/g) || []).length, 1,
    '줄마다 insert 를 냈다 — 한 덩이로 묶어야 한 왕복이다');
});

test('④ 곁가지(context·max_len·draft_mn)만 바뀌면 갱신하되 status 를 안 건드린다', () => {
  const 판 = 규칙.대조(
    [줄({ string_id: 'a.b', context: '새 맥락', max_len: 20, draft_mn: 'Сайн' })],
    [DB({ string_id: 'a.b', context: '옛 맥락', status: 'verified' })]);
  assert.equal(판.곁가지바뀜.length, 1);
  assert.equal(판.원문바뀜.length, 0);
  const sql = 규칙.SQL(판, false);
  assert.match(sql, /update engine\.l10n_strings set draft_mn/);
  assert.equal(/status\s*=/.test(sql), false,
    '안내만 바뀌었는데 상태를 건드렸다 — 멀쩡한 판정이 죽는다');
});

test('⑤ 🔴 원문이 바뀌면 승인 없이는 못 지나간다', () => {
  const 판 = 규칙.대조(
    [줄({ string_id: 'a.b', source_ko: '바뀐 원문' })],
    [DB({ string_id: 'a.b', source_ko: '옛 원문', status: 'verified' })]);
  assert.equal(판.원문바뀜.length, 1);
  assert.equal(판.원문바뀜[0].옛원문, '옛 원문', '옛 원문을 안 실었다 — 사람이 무엇이 바뀌었는지 못 본다');
  assert.equal(판.원문바뀜[0].옛상태, 'verified');

  const 막 = 규칙.막힘(판, false);
  assert.ok(막 && /원문갱신/.test(막), '막지 않았거나 처방이 없다');
  assert.equal(규칙.할일수(판, false), 0, '승인 없이 할 일에 셌다');
  assert.equal(규칙.SQL(판, false), null, '승인 없이 SQL 을 냈다');

  assert.equal(규칙.막힘(판, true), null);
});

test('⑥ 🔴 원문갱신은 상태를 pending 으로 되돌린다 — 그게 이 승인의 뜻이다', () => {
  const 판 = 규칙.대조(
    [줄({ string_id: 'a.b', source_ko: '바뀐 원문' })],
    [DB({ string_id: 'a.b', source_ko: '옛 원문', status: 'verified' })]);
  const sql = 규칙.SQL(판, true);
  assert.match(sql, /source_ko = '바뀐 원문'/);
  assert.match(sql, /status = 'pending'/,
    '원문을 덮으면서 상태를 verified 로 뒀다 — 옛 번역이 새 원문의 번역인 척한다');
});

test('⑦ 원문과 곁가지가 같이 바뀌면 «더 무거운 쪽»으로 센다', () => {
  /* 가벼운 쪽으로 접으면 판정이 죽은 줄이 승인 없이 갱신 대상에 섞인다 — 새는 방향이 통과다. */
  const 판 = 규칙.대조(
    [줄({ string_id: 'a.b', source_ko: '바뀐 원문', context: '새 맥락' })],
    [DB({ string_id: 'a.b', source_ko: '옛 원문', context: '옛 맥락' })]);
  assert.equal(판.원문바뀜.length, 1);
  assert.equal(판.곁가지바뀜.length, 0);
});

test('⑧ null 과 undefined 를 같은 것으로 본다 — 아니면 매번 「바뀌었다」가 된다', () => {
  const 판 = 규칙.대조(
    [{ string_id: 'a.b', source_ko: '가', context: '맥락' }],            // draft_mn·max_len 없음
    [DB({ string_id: 'a.b', source_ko: '가', context: '맥락', draft_mn: null, max_len: null })]);
  assert.equal(판.그대로.length, 1, `빈 칸 비교가 틀렸다: ${JSON.stringify(판)}`);
});

test('⑨ 홑따옴표가 든 문장이 SQL 을 깨지 않는다', () => {
  const sql = 규칙.SQL(규칙.대조([줄({ string_id: 'a.b', source_ko: "it's '여기'" })], []), false);
  assert.match(sql, /'it''s ''여기'''/);
  /* 한국어·키릴은 그대로 산다 — 막히는 것은 언제나 키지 값이 아니다. */
  const sql2 = 규칙.SQL(규칙.대조([줄({ string_id: 'a.b', draft_mn: 'Баян-Өлгий' })], []), false);
  assert.match(sql2, /'Баян-Өлгий'/);
});

test('⑩ 실제 1차 목록 77줄이 빈 DB 에 통째로 들어간다 — 손으로 만든 픽스처가 아니라 정본으로', () => {
  const 판 = 규칙.대조(문구_1차, []);
  assert.equal(판.새것.length, 문구_1차.length);
  assert.equal(규칙.할일수(판, false), 문구_1차.length);
  const sql = 규칙.SQL(판, false);
  assert.ok(sql.includes('signup.aimag.bayan-olgii'));
  /* 목록 → DB → 다시 대조 = 아무 일 없음. 「한 번 부으면 끝」을 정본으로 확인한다. */
  const 다시 = 규칙.대조(문구_1차, 판.새것.map((v) => ({ ...v, status: 'pending' })));
  assert.equal(규칙.할일수(다시, false), 0, `두 번째 반입에 할 일이 남았다: ${JSON.stringify({
    새것: 다시.새것.map((x) => x.string_id), 곁가지: 다시.곁가지바뀜.map((x) => x.string_id),
  })}`);
});

test('⑪ 🔴 내보내기 질의가 «한 곳»에만 산다 — Edge Fn 과 도구가 같은 문자열을 돈다', () => {
  /* 갈라지면 「화면에는 있는데 파일엔 없다」가 생기고, 그건 조용하다.
     🔑 **주석을 걷고 본다** — 안 그러면 코드에서 낱말이 사라져도 바로 위 주석이 그것을 갖고
        있는 한 이 검사가 초록이다(`tests/소스검사통로.test.js` 래칫이 그 자리를 센다). */
  const 읽기 = (p) => 코드만(파일소스(path.join(__dirname, '..', ...p.split('/'))));
  const fn = 읽기('supabase/functions/l10n/index.ts');
  const 도구 = 읽기('tools/문구내보내기.js');

  assert.match(fn, /sql\.unsafe\(내보내기질의\)/, 'Edge Fn 이 공용 질의를 안 쓴다');
  assert.match(도구, /내보내기질의/, '도구가 공용 질의를 안 쓴다');
  for (const [이름, 본문] of [['Edge Fn', fn], ['도구', 도구]]) {
    assert.equal(/from\s+engine\.l10n_strings\s+s\b/.test(본문), false,
      `${이름} 안에 내보내기 질의 사본이 다시 생겼다 — 둘이 갈라진다`);
  }
  /* 질의가 무엇을 싣기로 했는지도 못박는다: pending 은 빼고, 마지막 판정 하나만. */
  assert.match(내보내기질의, /where s\.status <> 'pending'/);
  assert.match(내보내기질의, /limit 1/);
});

test('⑫ 🔴 내보내기 도구가 보내는 SQL 전량이 «읽기»다 — 질의읽기 약속의 소스 쪽 반쪽', () => {
  /* 이 도구는 `{질의읽기:true}` 로 과녁 게이트를 지난다. 그 선언은 「select 만 보낸다」는 약속이고,
     약속을 지키는지는 두 층이 나눠 진다: 런타임 = 도구 안의 `질의전용()` · 소스 = 여기.
     질의가 함수 안에 숨으면 이 층이 원리상 못 본다 — 그래서 상수표로 두고 전량을 먹인다. */
  const 이름들 = Object.keys(질의들);
  assert.ok(이름들.length >= 3, `질의 상수가 ${이름들.length}개다 — 표가 비었거나 숨었다`);
  for (const 이름 of 이름들) {
    assert.doesNotThrow(() => 자격증명.질의전용(질의들[이름], '문구내보내기'),
      `질의들.${이름} 가 읽기 게이트를 못 지난다`);
  }
  /* 탐지력 — 게이트가 살아 있나. 죽으면 위 반복은 영원히 초록이다. */
  assert.throws(() => 자격증명.질의전용('update engine.l10n_strings set status = %s', '문구내보내기'));
});

test('⑬ 🔴 `--찍기` 의 stdout 에는 SQL 밖에 없다 — 사람글이 한 글자만 섞여도 그 .sql 은 못 돈다', () => {
  /* `node tools/문구반입.js --찍기 > x.sql` 이 그 통로다(`tools/원격SQL.js` 가 먹는 파일).
     08-27 검토 실측: 그전엔 목록 요약·대상 줄이 그대로 stdout 에 섞여 파일이 통째로 깨졌다.
     같은 규율이 이 저장소의 `--json` 통로에도 서 있다 — 그쪽은 회귀가 이미 물고 있었고
     이 도구만 빠져 있었다. */
  const src = 코드만(파일소스(path.join(__dirname, '..', 'tools', '문구반입.js')));
  const stdout자리 = [...src.matchAll(/console\.log\(/g)];
  assert.equal(stdout자리.length, 1,
    `stdout 에 쓰는 자리가 ${stdout자리.length}곳이다 — SQL 한 줄만 남아야 한다`);
  /* 그 한 곳이 «찍기 갈래»인지까지 본다: 개수만 세면 엉뚱한 줄이 살아남아도 통과한다. */
  assert.match(src, /if \(찍기\) \{ if \(sql\) console\.log/,
    '남은 stdout 한 곳이 SQL 출력 자리가 아니다');
  assert.match(src, /if \(찍기\) 사람통로 = console\.error/,
    '찍기 모드에서 사람글을 stderr 로 돌리는 줄이 사라졌다');
});

test('⑭ 사람글은 통로 하나(`말하기`)를 지난다 — 새 줄이 stdout 으로 새는 것을 막는다', () => {
  const src = 코드만(파일소스(path.join(__dirname, '..', 'tools', '문구반입.js')));
  assert.ok((src.match(/말하기\(/g) || []).length >= 8,
    '사람글이 통로를 안 지나는 자리가 생겼다 — 그 줄은 찍기 모드에서 SQL 에 섞인다');
});
