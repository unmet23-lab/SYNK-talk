'use strict';
/**
 * 소스가 git 눈에 있는가 — 저장소 위생 회귀
 *
 * 발단(2026-08-06): `.gitignore` 의 「모든 폴더의 `로그인*`」 패턴이 **자격증명 목록**을 막으려던 것인데
 *   (패턴 원문을 여기 그대로 못 적는다 — 그 글자열이 블록 주석을 끝내버린다)
 *   `lib/로그인코드.js`·`tools/로그인코드발급.js`·`tests/로그인코드.test.js` 까지 삼켰다.
 *   무서운 건 범위가 아니라 **증상이 「없음」**이라는 것이다:
 *     · `git status` 에 안 뜬다 → 「깨끗하다」로 보인다
 *     · `git commit` 이 조용히 통과한다 → 「커밋했다」고 보고하게 된다
 *     · 다른 계정·폰에서는 **파일이 통째로 없다** → 원인이 안 보인다
 *   저장소 **안**에 있는데 무시되는 파일이 가장 위험하다는 게 이것이다.
 *
 * 🔑 이 검사는 「로그인」에 한정하지 않는다 — **다음번의 넓은 패턴**을 잡는 게 목적이다.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const 소스폴더 = ['lib', 'src', 'tools', 'tests'];

/** git 이 없으면 **건너뛴 것을 드러낸다** — 통과와 미실행이 같은 모양이면 안 된다. */
function git있나() {
  try { execFileSync('git', ['--version'], { cwd: ROOT, stdio: 'ignore' }); return true; }
  catch { return false; }
}

/** 무시되나 — `git check-ignore` 는 무시되면 종료코드 0, 아니면 1. */
function 무시되나(상대경로) {
  try { execFileSync('git', ['check-ignore', '-q', '--', 상대경로], { cwd: ROOT, stdio: 'ignore' }); return true; }
  catch { return false; }
}

function 소스파일들() {
  const out = [];
  for (const 폴더 of 소스폴더) {
    const d = path.join(ROOT, 폴더);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (f.endsWith('.js')) out.push(`${폴더}/${f}`);
  }
  return out;
}

test('소스 .js 중 git 이 못 보는 파일이 없다', (t) => {
  if (!git있나()) return t.skip('git 이 없다 — 검사를 안 돌렸다(통과가 아니다)');
  const 숨은것 = 소스파일들().filter(무시되나);
  assert.deepEqual(숨은것, [],
    `.gitignore 가 소스를 삼키고 있다: ${숨은것.join(', ')}\n`
    + '  이 파일들은 커밋되지 않고, 그런데도 git 은 오류를 안 낸다 — 다른 기계에서 통째로 사라진다.\n'
    + '  자격증명을 막는 패턴이라면 **확장자로 좁혀라**(목록 파일은 .csv·.txt·.json 이지 .js 가 아니다).');
});

test('탐지력 픽스처 — 자격증명은 여전히 막히고, 검사기는 살아 있다', (t) => {
  if (!git있나()) return t.skip('git 이 없다 — 검사를 안 돌렸다(통과가 아니다)');
  /* 검사기가 죽어 항상 false 를 내면 위 검사는 무엇이든 통과시킨다. 막히는 쪽을 하나 확인한다. */
  assert.equal(무시되나('.env'), true, '.env 가 안 막힌다면 check-ignore 호출이 깨진 것이다');
  assert.equal(무시되나('docs/로그인코드목록.csv'), true,
    '발급 코드 목록이 git 에 들어갈 수 있다 — 그 파일 하나가 전 학생 계정이다(L0 §4-1)');
  assert.equal(무시되나('lib/로그인코드.js'), false, '소스는 보여야 한다');
});
