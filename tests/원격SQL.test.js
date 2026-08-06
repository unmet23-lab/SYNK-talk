/**
 * 원격SQL 회귀 — 원격 실행 통로가 **읽기와 쓰기를 가르는 층**을 진다.
 *
 * 왜 있나: 이 도구는 자격증명 하나로 실 DB 에 SQL 을 보낸다. 판정이 한 번 느슨해지면
 *   「확인만 하려던 명령」이 스키마를 바꾼다. 되돌림 비용이 큰 쪽이 조용한 쪽이라
 *   판정을 산문이 아니라 이 테스트가 진다.
 *
 * ⚠ 이 테스트는 **네트워크를 절대 타지 않는다.** 쓰기 거부는 자격증명을 읽기 **전에**
 *   일어나므로(도구 코드 순서) `.env` 유무와 무관하게 죽는다 — 그 경로만 실행으로 재고,
 *   `--적용` 이 붙은 경로는 실행하지 않고 문자열로 잰다(실행하면 진짜 요청이 나간다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const 도구 = path.join(ROOT, 'tools', '원격SQL.js');
const { 읽기전용 } = require('../tools/원격SQL.js');

/* ── 탐지력은 픽스처가 진다 (실저장소 파일이 바뀌어도 안 흔들린다) ── */

test('쓰기 SQL 을 쓰기로 잡는다', () => {
  for (const sql of [
    'create table engine.x (id int);',
    'ALTER TABLE engine.x ADD COLUMN y text;',
    'drop schema engine cascade;',
    'insert into engine.x values (1);',
    'truncate engine.x;',
    'grant select on engine.x to anon;',
    'do $$ begin end $$;',
    'comment on table engine.x is $$x$$;',
  ]) {
    assert.strictEqual(읽기전용(sql), false, `쓰기로 잡혔어야 한다: ${sql}`);
  }
});

test('순수 조회는 읽기로 통과한다', () => {
  assert.strictEqual(읽기전용('select count(*) from auth.users;'), true);
  assert.strictEqual(읽기전용('with s as (select 1 as a) select * from s;'), true);
});

test('주석 안의 단어가 판정을 흔들지 않는다', () => {
  // 실제 스키마 파일들이 `-- 학생=자기 행 insert` 같은 설명을 달고 있다.
  // 주석을 안 지우면 모든 조회가 영원히 쓰기로 잡혀 도구가 무용지물이 된다.
  assert.strictEqual(읽기전용('-- 정책: 학생은 insert 만 한다\nselect 1;'), true);
  assert.strictEqual(읽기전용('/* create table 은 여기서 안 한다 */ select 1;'), true);
  // 반대 방향 — 주석 뒤에 진짜 쓰기가 오면 여전히 잡는다.
  assert.strictEqual(읽기전용('-- 확인만 한다\ncreate table t (a int);'), false);
});

/* ── 실저장소 파일은 거짓양성만 본다 (버그가 남아 있기를 요구하지 않는다) ── */

test('유호님이 Run 하던 확인 SQL 은 읽기로 통과한다', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', '확인_적용전상태.sql'), 'utf8');
  assert.strictEqual(읽기전용(sql), true, '확인 쿼리가 쓰기로 잡히면 원격화의 목적 자체가 죽는다');
});

test('마이그레이션 본체는 쓰기로 잡힌다', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'L0_스키마.sql'), 'utf8');
  assert.strictEqual(읽기전용(sql), false);
});

/* ── 거부는 실제로 발동하고, 그 처방은 실제로 통하는 통로여야 한다 (F103) ── */

test('쓰기 SQL 을 --적용 없이 주면 자격증명을 보기도 전에 거부한다', () => {
  const r = spawnSync(process.execPath, [도구, 'supabase/L0_스키마.sql'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /상태를 바꾼다/);
  assert.match(r.stderr, /--적용/);
});

test('거부가 시키는 플래그가 도구가 실제로 읽는 플래그와 같다', () => {
  // 차단 사유가 시키는 명령이 그 가드를 통과하지 못하면, 우회가 정상 통로가 된다.
  const src = fs.readFileSync(도구, 'utf8');
  const 처방 = src.match(/승인을 받은 뒤: node tools\/원격SQL\.js \S+ (--[^\s`'"]+)/);
  assert.ok(처방, '거부 메시지가 다음 명령을 제시해야 한다');
  assert.ok(
    src.includes(`args.includes('${처방[1]}')`),
    `처방이 시키는 ${처방[1]} 를 도구가 실제로 파싱하지 않는다`,
  );
});
