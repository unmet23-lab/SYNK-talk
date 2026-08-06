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

/*
 * 카탈로그(pg_tables·pg_indexes·pg_policies·pg_constraint)와 대조하는 기대 배열은
 * **손으로 정렬한 순서에 기대면 안 된다.** 같은 이름을 다 갖고 있어도 순서가 다르면
 * 정확한 c3/c4가 거절되고, 중단 메시지는 「부분·혼합·불명」 한 줄뿐이라 어느 축인지 안 보인다.
 *
 * 실측 2번(08-06): ① reviewed…가 reviewer…보다 먼저인데 기대 배열만 역순 → 제약 축
 *                  ② corrections를 consents 앞에 적음 → 표·인덱스·정책 세 축이 동시에
 * 세 번째다. 그래서 「순서를 맞춰라」를 검사하는 대신 **순서에 의존하는 통로 자체를 금지**하고
 * 양쪽을 pg_temp.synk_sorted()로 같은 자리에서 정렬한다.
 */
const 비교대상 = 'actual_(?:tables|indexes|policies|constraints)\\s*(?:<>|=)\\s*';
const 순서의존비교 = new RegExp(`${비교대상}array\\[`, 'g');
const 정렬통로 = new RegExp(`${비교대상}pg_temp\\.synk_sorted\\(array\\[([\\s\\S]*?)\\]\\)`, 'g');

test('카탈로그 기대 배열은 순서에 의존하는 옛 통로를 쓰지 않는다', () => {
  const sql = concatenate().toString('utf8');

  assert.deepEqual([...sql.matchAll(순서의존비교)].map((m) => m[0]), [],
    '기대 배열을 카탈로그 정렬 순서에 맞춰 손으로 적는 통로다 — pg_temp.synk_sorted()로 감싼다');

  const arrays = [...sql.matchAll(정렬통로)]
    .map((match) => [...match[1].matchAll(/'([^']+)'/g)].map((name) => name[1]));
  assert.equal(arrays.length, 5, '표·인덱스·정책·제약(c3·c4) 다섯 지문을 다 찾아야 한다');
  arrays.forEach((names, index) => {
    assert.ok(names.length > 0, `${index}번째: 빈 배열이면 검사가 무엇이든 통과한다`);
  });
});

test('탐지력 픽스처 — 옛 통로가 한 줄이라도 살아 있으면 잡는다', () => {
  const 옛통로 = "    if common_exact and actual_constraints = array[\n      'consents_pkey'\n    ]::text[] then";
  assert.notDeepEqual([...옛통로.matchAll(순서의존비교)].map((m) => m[0]), [],
    '금지 패턴이 실제 옛 통로 문장을 못 잡는다');
  assert.deepEqual([...옛통로.matchAll(정렬통로)], [],
    '옛 통로가 정렬 통로로 잘못 세어진다');
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

test('조각마다 단일 명시 트랜잭션이며 금지 문장을 쓰지 않는다', () => {
  /* 합본은 조각의 이음이라 트랜잭션도 조각 수만큼 열린다 — 그게 체인의 정상이다.
   * 앞 조각이 커밋된 뒤 뒤 조각이 실패하면 이력이 「거기까지」로 남아 **정합한 상태**가 되고,
   * 뒤 조각만 고쳐 다시 부으면 된다. 단일 트랜잭션이면 뒤의 실패가 앞까지 되돌린다.
   * 대신 조각 단위로 보면 검사가 더 강해진다: **감싸지지 않은 조각 하나**는 자동커밋으로 돌아
   * 진짜 부분 적용을 만드는데, 합본을 통째로 세던 옛 판은 그것을 못 봤다(총합만 맞으면 통과). */
  const 조각들 = migrationFiles();
  assert.ok(조각들.length >= 1, '마이그레이션 조각이 0개다');
  for (const file of 조각들) {
    const 이름 = file.split(/[\\/]/).pop();
    const sql = fs.readFileSync(file, 'utf8');
    const body = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
    assert.equal((body.match(/\bbegin\s*;/gi) || []).length, 1, `${이름}: begin;은 정확히 1개여야 한다`);
    assert.equal((body.match(/\bcommit\s*;/gi) || []).length, 1, `${이름}: commit;은 정확히 1개여야 한다`);
    assert.match(body, /^\s*begin\s*;/i, `${이름}: 첫 실행 문장은 begin;이어야 한다`);
    assert.match(body, /commit\s*;\s*$/i, `${이름}: 마지막 실행 문장은 commit;이어야 한다`);
    assert.doesNotMatch(body, /create\s+(?:unique\s+)?index\s+concurrently/i, `${이름}: 트랜잭션 안에서 못 돈다`);
    assert.doesNotMatch(body, /\b(vacuum|alter\s+system)\b/i, `${이름}: 트랜잭션 안에서 못 돈다`);
    assert.doesNotMatch(sql, /\\(?:if|set|echo|quit)\b/i, `${이름}: SQL Editor가 모르는 psql 지시자를 쓰면 안 된다`);
  }
});
