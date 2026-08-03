#!/usr/bin/env node
'use strict';
/**
 * pre-commit 게이트 — git 호출부.
 *
 * 왜 hook(Claude Code)이 아니라 git 층인가:
 * 이 저장소에는 Claude Code 말고도 Codex·Kimi·OpenCode가 들어온다. 하네스 가드는
 * 도구마다 다르지만 **pre-commit은 어느 도구가 커밋하든 걸린다.** 여러 벤더가 도는
 * 저장소의 유일한 공통 안전망이다.
 *
 * 검사 2종:
 *   1) .gitignore가 무시하는 파일이 강제 추가(`git add -f`)됐는가
 *      — 「git 밖에 두기로 한 것」은 「추가하지 않기」로는 안 지켜진다. .gitignore로 지킨다.
 *   2) 자격증명 파일명 / 내용에 박힌 비밀 / 대용량  (tools/guard.js)
 *
 * 끄는 법: SYNK_SKIP_GUARD=1 git commit ...   ← 끈 이유를 커밋 메시지에 남길 것.
 */

const { execFileSync } = require('node:child_process');
const { inspect } = require('./guard.js');

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}

function stagedPaths() {
  const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
  return out.split('\0').filter(Boolean);
}

/** 스테이징된 내용(작업 트리가 아니라 인덱스)을 읽는다 — 커밋될 실물이 이쪽이다. */
function stagedBlob(p) {
  try {
    return git(['show', `:${p}`], { maxBuffer: 64 * 1024 * 1024 });
  } catch (_) {
    return null;
  }
}

function stagedSize(p) {
  try {
    const line = git(['ls-files', '--stage', '--', p]).trim();
    const sha = line.split(/\s+/)[1];
    if (!sha) return null;
    return Number(git(['cat-file', '-s', sha]).trim());
  } catch (_) {
    return null;
  }
}

function ignoredButStaged(paths) {
  if (!paths.length) return [];
  try {
    const out = execFileSync('git', ['check-ignore', '--stdin'], {
      input: paths.join('\n'),
      encoding: 'utf8',
    });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    // check-ignore는 일치가 없으면 exit 1이다 — 실패가 아니라 「0건」이다.
    if (e.status === 1) return [];
    throw e;
  }
}

function main() {
  if (process.env.SYNK_SKIP_GUARD === '1') {
    console.error('[guard] SYNK_SKIP_GUARD=1 — 검사를 건너뛴다. 끈 이유를 커밋 메시지에 남겨라.');
    return 0;
  }

  const paths = stagedPaths();
  if (!paths.length) return 0;

  const problems = [];

  for (const p of ignoredButStaged(paths)) {
    problems.push({
      path: p,
      rule: '.gitignore 무시 대상이 강제 추가됨',
      why: 'git 밖에 두기로 한 파일이다 (`git add -f`로 들어왔다)',
    });
  }

  const files = paths.map((p) => {
    const bytes = stagedSize(p);
    const raw = stagedBlob(p);
    // 이진 파일은 내용 검사를 하지 않는다(오탐만 는다). NUL이 있으면 이진으로 본다.
    const text = raw != null && !raw.includes('\0') ? raw : undefined;
    return { path: p, text, bytes: bytes == null ? undefined : bytes };
  });

  problems.push(...inspect(files));

  if (!problems.length) return 0;

  console.error('\n[guard] 커밋을 막았다 — 아래가 커밋에 들어 있다:\n');
  for (const v of problems) {
    console.error(`  ✗ ${v.path}\n      ${v.rule} — ${v.why}`);
  }
  console.error(
    '\n→ 고치는 법' +
      '\n   ① 이 파일이 git에 들어가면 안 되는 것이면: `git restore --staged <파일>` 하고 .gitignore에 넣는다' +
      '\n   ② 키가 코드에 박혔으면: 값을 .env로 옮기고 코드는 process.env로 읽는다' +
      '\n   ③ 진짜 예시·픽스처면: 파일명을 `*.example`로 두거나 테스트 코드에서 문자열을 조립한다' +
      '\n   (정말 예외면 SYNK_SKIP_GUARD=1 — 대신 왜 껐는지 커밋 메시지에 쓴다)\n'
  );
  return 1;
}

if (require.main === module) process.exit(main());
module.exports = { main };
