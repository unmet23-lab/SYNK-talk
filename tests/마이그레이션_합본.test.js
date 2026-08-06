'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  FILE_NAME,
  OUTPUT,
  assertByteIdentical,
  checksumInfo,
  concatenate,
  migrationFiles,
  validateChecksum,
} = require('../tools/마이그레이션_합본');

test('파일명 정렬이 실행 순서이고 모든 조각이 명명 규칙을 따른다', () => {
  const files = migrationFiles();
  const names = files.map((file) => path.basename(file));
  assert.deepEqual(names, [...names].sort(), '파일 시스템 순서가 아니라 파일명 정렬로 실행해야 한다');
  assert.ok(names.length > 0, '마이그레이션 조각이 0개다');
  assert.deepEqual(names.filter((name) => !FILE_NAME.test(name)), []);
});

test('L0_스키마.sql = 정렬한 마이그레이션 조각 이음 (바이트 동일)', () => {
  const expected = concatenate();
  const actual = fs.readFileSync(OUTPUT);
  assertByteIdentical(actual, expected, 'supabase/L0_스키마.sql');
});

test('각 마이그레이션 checksum은 checksum 슬롯만 0으로 치환한 파일 SHA-256이다', () => {
  for (const file of migrationFiles()) {
    const buffer = fs.readFileSync(file);
    const info = validateChecksum(buffer, path.basename(file));
    assert.equal(info.declared, info.calculated);
    assert.ok(info.slots >= 2, 'DB 기록값과 사후 확인 기대값이 같은 checksum 슬롯을 써야 한다');
  }
});

test('탐지력 픽스처 — 합본 1바이트 변이는 바이트 동일성 가드가 거절한다', () => {
  const expected = concatenate();
  const mutated = Buffer.from(expected);
  const index = mutated.indexOf(Buffer.from('SYNK'));
  assert.notEqual(index, -1, '변이 지점을 못 찾았다 — 픽스처가 낡았다');
  mutated[index] ^= 0x01;
  assert.throws(
    () => assertByteIdentical(mutated, expected, '1바이트 변이'),
    /바이트 단위로 다르다.*offset=/,
  );
});

test('탐지력 픽스처 — migration 본문 1바이트 변이는 checksum을 깨뜨린다', () => {
  const original = fs.readFileSync(migrationFiles()[0]);
  const mutated = Buffer.from(original);
  const index = mutated.indexOf(Buffer.from('SYNK'));
  assert.notEqual(index, -1, '변이 지점을 못 찾았다 — 픽스처가 낡았다');
  mutated[index] ^= 0x01;
  const info = checksumInfo(mutated, '1바이트 변이');
  assert.notEqual(info.declared, info.calculated);
  assert.throws(() => validateChecksum(mutated, '1바이트 변이'), /checksum 불일치/);
});

test('합본은 단일 명시 트랜잭션이며 금지 문장을 쓰지 않는다', () => {
  const sql = concatenate().toString('utf8');
  const body = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
  assert.equal((body.match(/\bbegin\s*;/gi) || []).length, 1, 'begin;은 정확히 1개여야 한다');
  assert.equal((body.match(/\bcommit\s*;/gi) || []).length, 1, 'commit;은 정확히 1개여야 한다');
  assert.match(body, /^\s*begin\s*;/i, '첫 실행 문장은 begin;이어야 한다');
  assert.match(body, /commit\s*;\s*$/i, '마지막 실행 문장은 commit;이어야 한다');
  assert.doesNotMatch(body, /create\s+(?:unique\s+)?index\s+concurrently/i);
  assert.doesNotMatch(body, /\b(vacuum|alter\s+system)\b/i);
  assert.doesNotMatch(sql, /\\(?:if|set|echo|quit)\b/i, 'SQL Editor가 모르는 psql 지시자를 쓰면 안 된다');
});
