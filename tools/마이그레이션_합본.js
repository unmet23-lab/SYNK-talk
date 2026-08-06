'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const OUTPUT = path.join(ROOT, 'supabase', 'L0_스키마.sql');
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

function generate({ check = false } = {}) {
  const bundle = concatenate();
  if (check) {
    if (!fs.existsSync(OUTPUT)) throw new Error('생성된 supabase/L0_스키마.sql이 없다');
    assertByteIdentical(fs.readFileSync(OUTPUT), bundle, 'supabase/L0_스키마.sql');
    return bundle;
  }

  fs.writeFileSync(OUTPUT, bundle);
  return bundle;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check')) {
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
  FILE_NAME,
  MIGRATIONS_DIR,
  OUTPUT,
  assertByteIdentical,
  checksumInfo,
  concatenate,
  firstDifference,
  generate,
  migrationFiles,
  validateChecksum,
};
