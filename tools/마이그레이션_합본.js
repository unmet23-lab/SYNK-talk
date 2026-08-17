'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)

/* 🎯 조준 축은 **없다** — 파일을 합쳐 굽기만 한다(자격증명·네트워크 0). `--운영` 을 안 받는다. */
const 아는플래그 = ['--check'];

const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const OUTPUT = path.join(ROOT, 'supabase', 'L0_스키마.sql');
const CHECK_FILE = path.join(ROOT, 'supabase', '확인_적용후상태.sql');
const FILE_NAME = /^\d{14}_.+_c\d+\.sql$/u;
const CHECKSUM_SLOT = /'([0-9a-f]{64})'([;]?\s*--\s*migration-checksum\b)/g;
const ZERO_CHECKSUM = '0'.repeat(64);

function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`마이그레이션 디렉터리가 없다: ${path.relative(ROOT, MIGRATIONS_DIR)}`);
  }

  const names = fs.readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (names.length === 0) throw new Error('합칠 마이그레이션 SQL이 0개다');

  const 잘못된이름 = names.filter((name) => !FILE_NAME.test(name));
  if (잘못된이름.length > 0) {
    throw new Error(
      `마이그레이션 파일명은 YYYYMMDDHHMMSS_<영역>_<계약버전>.sql 이어야 한다: ${잘못된이름.join(', ')}`,
    );
  }

  return names.map((name) => path.join(MIGRATIONS_DIR, name));
}

function checksumInfo(buffer, label = 'migration') {
  const source = buffer.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(buffer)) {
    throw new Error(`${label}: UTF-8 SQL만 허용한다`);
  }

  const declared = [];
  const normalized = source.replace(CHECKSUM_SLOT, (_all, checksum, suffix) => {
    declared.push(checksum);
    return `'${ZERO_CHECKSUM}'${suffix}`;
  });

  if (declared.length < 2) {
    throw new Error(`${label}: migration-checksum 슬롯이 2개보다 적다`);
  }
  if (new Set(declared).size !== 1) {
    throw new Error(`${label}: migration-checksum 슬롯끼리 값이 갈렸다`);
  }

  const calculated = crypto.createHash('sha256').update(Buffer.from(normalized, 'utf8')).digest('hex');
  return { declared: declared[0], calculated, slots: declared.length };
}

function validateChecksum(buffer, label = 'migration') {
  const info = checksumInfo(buffer, label);
  if (info.declared !== info.calculated) {
    throw new Error(
      `${label}: checksum 불일치 (적힘 ${info.declared}, 계산 ${info.calculated}). `
      + '같은 버전을 고쳐 쓰지 말고 새 migration을 만들라.',
    );
  }
  return info;
}

function concatenate(files = migrationFiles()) {
  const buffers = files.map((file) => {
    const buffer = fs.readFileSync(file);
    validateChecksum(buffer, path.relative(ROOT, file));
    return buffer;
  });
  return Buffer.concat(buffers);
}

function firstDifference(left, right) {
  const limit = Math.min(left.length, right.length);
  for (let i = 0; i < limit; i += 1) {
    if (left[i] !== right[i]) return i;
  }
  return left.length === right.length ? -1 : limit;
}

function assertByteIdentical(actual, expected, label = '합본') {
  if (actual.equals(expected)) return;
  const offset = firstDifference(actual, expected);
  throw new Error(
    `${label}이 마이그레이션 조각 이음과 바이트 단위로 다르다 `
    + `(첫 차이 offset=${offset}, 실제=${actual.length}B, 기대=${expected.length}B)`,
  );
}

/* 확인 쿼리는 **마지막 조각의 꼬리**가 정본이고 `supabase/확인_적용후상태.sql` 은 그 사본이다.
 * 조각을 하나 올릴 때마다 사람이 손으로 옮겨 왔는데, 2026-08-06~07 에만 **네 번** 반복했고
 * 한 번은 옮기는 걸 잊어 **정상 DB 가 ❌ 로 보고**됐다(기대 checksum 이 낡아서). 손으로 옮기는
 * 자리는 다음번에 빠뜨리는 자리라, 합본을 만드는 그 자리에서 함께 파생시킨다.
 * `tests/L0스키마.test.js` 의 대조는 그대로 둔다 — 파생이 죽어도 검사가 남아야 한다. */
function syncCheckFile(bundle) {
  const 꼬리 = bundle.toString('utf8');
  const 시작 = 꼬리.lastIndexOf('with 기대열');
  const 끝 = 꼬리.indexOf('*/', 시작);
  if (시작 === -1 || 끝 === -1) throw new Error('마지막 조각에서 확인 쿼리 블록을 못 찾았다');
  const 머리 = fs.readFileSync(CHECK_FILE, 'utf8').split('with 기대열')[0];
  const 새것 = 머리 + 꼬리.slice(시작, 끝);
  fs.writeFileSync(CHECK_FILE, 새것);
  return 새것;
}

function generate({ check = false } = {}) {
  const bundle = concatenate();
  if (check) {
    if (!fs.existsSync(OUTPUT)) throw new Error('생성된 supabase/L0_스키마.sql이 없다');
    assertByteIdentical(fs.readFileSync(OUTPUT), bundle, 'supabase/L0_스키마.sql');
    return bundle;
  }

  fs.writeFileSync(OUTPUT, bundle);
  syncCheckFile(bundle);
  return bundle;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  /* 🔴 옛 판정은 «손 사본»이었다: `args.some((arg) => arg !== '--check')`. 공용 통로로 옮기되
   *   그 엄격함을 안 잃는다 — 그 한 줄은 위치 인자까지 거절했고, 이 도구는 위치 인자를 하나도
   *   안 읽는다(경로는 전부 상수다). 그래서 두 칸으로 나눈다: ①모르는 `--` 낱말은 공용 판정이
   *   ②위치 인자는 이 도구만의 엄격함이 진다. 합치면 사유가 뭉개져 어느 쪽인지 모른다. */
  const 플래그오류 = 인자게이트('마이그레이션_합본', args, 아는플래그);
  const 위치인자 = args.filter((a) => !a.startsWith('--'));
  if (플래그오류 || 위치인자.length) {
    console.error(플래그오류 || `위치 인자를 안 받는다: ${위치인자.join(' ')}`);
    console.error('사용법: node tools/마이그레이션_합본.js [--check]');
    process.exitCode = 2;
  } else {
    try {
      const bundle = generate({ check: args.includes('--check') });
      const action = args.includes('--check') ? '확인' : '생성';
      console.log(`L0 합본 ${action}: ${bundle.length} bytes`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

module.exports = {
  CHECK_FILE,
  FILE_NAME,
  MIGRATIONS_DIR,
  OUTPUT,
  syncCheckFile,
  assertByteIdentical,
  checksumInfo,
  concatenate,
  firstDifference,
  generate,
  migrationFiles,
  validateChecksum,
};
