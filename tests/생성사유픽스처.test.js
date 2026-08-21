/* 생성 사유 값목록 ↔ 픽스처 파생 — §12-7 「값과 픽스처를 §4-1 한 곳에서 파생시킨다」의 기계.
 *
 * ■ 무엇을 재나
 *   ① DDL CHECK 의 «행에 남는 15값» == 생성왕복시험의 픽스처 레지스트리 — 목록에 있는데
 *      픽스처가 없는 값이 하나라도 있으면 여기서 빨강(§12-7 이 두 판 연속 틀린 그 자리).
 *   ② 15/1/0 분해가 명문이다 — 응답 전용 1(이미배정) · 행 0 하나(게임날). 「16값 전부 행」으로
 *      되돌리면 통과 불가능한 눈금이 되어 검사를 느슨하게 만든다(§12-7 ⚠).
 *   ③ attempts.result 부분집합 7 ⊆ 15 · gate_failed 7값·캐논 «순서» = 검문 소스의 push 순서
 *      (attempt_close 가 캐논 순서를 물리로 강제하므로, 두 원천이 갈리면 정상 검문탈락 착지가 죽는다).
 *
 * ■ 원천: DDL = supabase/migrations/20260821120000_generation_c12.sql (§4-1 의 물리 정본) ·
 *   픽스처 = tools/생성왕복시험.js 의 `사유픽스처`(그 시험의 B층 루프가 실제로 소비한다). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 마이그 = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20260821120000_generation_c12.sql'), 'utf8');
const { 사유픽스처, 응답전용, 무행갈래 } = require('../tools/생성왕복시험.js');

const 값들 = (원문) => [...원문.matchAll(/'([가-힣]+)'/g)].map((m) => m[1]);

test('§12-7 ① — DDL outcome 15값 == 픽스처 레지스트리(값마다 조달 방법이 명문)', () => {
  const 블록 = 마이그.split(/outcome\s+text check \(outcome is null or outcome in \(/)[1].split('))')[0];
  const ddl = 값들(블록);
  assert.equal(ddl.length, 15, 'DDL «행에 남는» 값이 15가 아니다 — §4-1 산술이 갈렸다');
  const 레지 = Object.keys(사유픽스처);
  assert.deepEqual([...ddl].sort(), [...레지].sort(),
    '값목록과 픽스처 레지스트리가 갈렸다 — 목록에 있는데 픽스처가 없는 값은 착지 검증 없이 운영에 간다');
  for (const [값, f] of Object.entries(사유픽스처)) {
    assert.ok(f && typeof f.층 === 'string' && typeof f.설명 === 'string' && f.설명.length > 0,
      `«${값}» 픽스처에 조달 층·설명이 없다`);
  }
});

test('§12-7 ② — 15/1/0 분해 명문: 응답 전용 = 이미배정 하나 · 행 0 = 게임날 하나', () => {
  assert.deepEqual(응답전용, ['이미배정']);
  assert.deepEqual(무행갈래, ['게임날']);
  assert.ok(!('이미배정' in 사유픽스처) && !('게임날' in 사유픽스처),
    '이미배정·게임날이 행 픽스처에 들어왔다 — 원리상 통과 불가능한 눈금이 된다(§12-7 ⚠)');
  /* 이미배정은 마이그에 «응답 kind 리터럴»(jobs_load_one)로만 산다 — outcome CHECK 블록엔 없다. */
  const 아웃컴블록 = 마이그.split(/outcome\s+text check \(outcome is null or outcome in \(/)[1].split('))')[0];
  assert.ok(!아웃컴블록.includes('이미배정'), '이미배정이 outcome CHECK 에 실렸다 — 응답 전용 분해가 물리에서 깨졌다');
});

test('§12-7 ③ — attempts.result 7 ⊆ 15 · gate 캐논 7값·순서 = 검문 push 순서(한 원천)', () => {
  const 부분 = 값들(마이그.split(/result\s+text check \(result in/)[1].split('))')[0]);
  assert.deepEqual(부분, ['성공', '검문탈락', '타임아웃', '벤더오류', '응답파손', '입력초과', '응답초과']);
  for (const v of 부분) assert.ok(v in 사유픽스처, `attempts 부분집합 «${v}» 가 15 밖이다`);

  const 캐논줄 = 마이그.match(/캐논 constant text\[\] := array\[([^\]]+)\]/);
  assert.ok(캐논줄, 'attempt_close 의 캐논 배열이 사라졌다');
  const 캐논 = 값들(캐논줄[1]);
  const 허용줄 = 마이그.match(/gate_failed_reasons <@ array\[([\s\S]*?)\]::text\[\]/);
  assert.ok(허용줄, 'attempts_gate_values 허용목록이 사라졌다');
  assert.deepEqual(값들(허용줄[1]).sort(), [...캐논].sort(), '캐논과 허용목록(CHECK)이 갈렸다');

  const 검문소스 = fs.readFileSync(path.join(ROOT, 'lib', '과제검문.js'), 'utf8');
  const 검문순서 = [...검문소스.matchAll(/사유들\.push\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(검문순서, 캐논,
    '검문(JS)의 사유 push 순서와 SQL 캐논이 갈렸다 — attempt_close 의 순서 검사가 정상 검문탈락을 거절하게 된다');
});
