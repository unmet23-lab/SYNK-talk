'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { 형제정본 } = require('../lib/형제정본.js');

test('명시하지 않으면 기존 형제 경로, 작업 사본이면 .git 원문이 가리키는 본체 옆을 읽는다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-canon-'));
  const main = path.join(tmp, 'main', 'SYNK-talk');
  const worktree = path.join(tmp, 'review');
  fs.mkdirSync(worktree, { recursive: true });
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.join(main, '.git', 'worktrees', 'review')}\n`);
  assert.equal(형제정본(main, {}), path.join(tmp, 'main', 'SYNK-appsscript'));
  assert.equal(형제정본(worktree, {}), path.join(tmp, 'main', 'SYNK-appsscript'));
});

test('명시한 올바른 체크아웃을 쓰고 빈 값·상대경로·없는 경로·다른 저장소를 거절한다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-canon-'));
  fs.mkdirSync(path.join(tmp, '.git'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'synk-appsscript' }));
  assert.equal(형제정본(__dirname, { SYNK_APPSSCRIPT_ROOT: tmp }), tmp);
  for (const invalid of ['', '상대경로', path.join(tmp, 'missing')]) {
    assert.throws(() => 형제정본(__dirname, { SYNK_APPSSCRIPT_ROOT: invalid }), /SYNK_APPSSCRIPT_ROOT/);
  }
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'synk-talk' }));
  assert.throws(() => 형제정본(__dirname, { SYNK_APPSSCRIPT_ROOT: tmp }), /체크아웃이 아니다/);
});
