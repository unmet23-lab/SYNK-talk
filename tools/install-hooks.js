#!/usr/bin/env node
'use strict';
/**
 * git 훅을 이 저장소에 배선한다.
 *
 * 장치를 만드는 것과 그 장치가 도는 것은 다른 작업이다 —
 * `.githooks/`는 스스로 발화하지 않는다. core.hooksPath가 그것을 발동시킨다.
 * clone한 사람은 반드시 한 번 실행: `node tools/install-hooks.js`
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const hook = path.join(root, '.githooks', 'pre-commit');

if (!fs.existsSync(hook)) {
  console.error('[install-hooks] .githooks/pre-commit 이 없다. 저장소가 온전한지 확인하라.');
  process.exit(1);
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'inherit' });
try {
  fs.chmodSync(hook, 0o755); // Windows에서는 무의미하지만 해가 없다
} catch (_) {}

const now = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
  cwd: root,
  encoding: 'utf8',
}).trim();

console.log(`[install-hooks] core.hooksPath = ${now}`);
console.log('[install-hooks] 확인: 아무 커밋이나 시도하면 tools/precommit.js 가 먼저 돈다.');
