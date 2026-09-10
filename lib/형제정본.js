'use strict';
// 로컬 검사·반입 도구가 읽을 Apps Script 정본. 앱 실행 코드에서는 쓰지 않는다.
const fs = require('node:fs');
const path = require('node:path');

function 주저장소(root) {
  const 깃 = path.join(root, '.git');
  try {
    if (fs.statSync(깃).isFile()) {
      const m = fs.readFileSync(깃, 'utf8').match(/^gitdir:\s*(.+)\s*$/m);
      if (m) {
        const gitdir = path.resolve(root, m[1].trim());
        const 본체 = gitdir.replace(/[\\/]\.git[\\/]worktrees[\\/][^\\/]+$/, '');
        if (본체 !== gitdir) return 본체;
      }
    }
  } catch { /* 기본 형제가 없으면 소비자가 기존대로 미실행을 알린다. */ }
  return root;
}

function 형제정본(root, env = process.env) {
  const 명시 = env.SYNK_APPSSCRIPT_ROOT;
  if (명시 === undefined) return path.resolve(주저장소(root), '..', 'SYNK-appsscript');
  if (!명시.trim() || !path.isAbsolute(명시)) throw new Error('SYNK_APPSSCRIPT_ROOT는 정본 저장소의 절대경로여야 한다');
  const 대상 = path.resolve(명시);
  let 맞는저장소 = false;
  try {
    맞는저장소 = fs.existsSync(path.join(대상, '.git'))
      && JSON.parse(fs.readFileSync(path.join(대상, 'package.json'), 'utf8')).name === 'synk-appsscript';
  } catch { /* 명시한 경로의 오류는 skip이나 다른 정본 폴백으로 바꾸지 않는다. */ }
  if (!맞는저장소) throw new Error(`SYNK_APPSSCRIPT_ROOT가 Apps Script 체크아웃이 아니다: ${대상}`);
  return 대상;
}

module.exports = { 형제정본 };
