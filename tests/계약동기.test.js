/* 계약 동기 — 이 저장소의 계약 사본이 정본(형제 SYNK-appsscript)과 같은 바이트인지 «탐지»한다
 *   (심문 S5·G4 부활 · 08-24 유호 지시 「S5·G4 도 이어서 진행해」 — appsscript tests/계약동기.test.js 와 쌍).
 *
 * ■ 왜 여기도 사나 — 정본 쪽 훅·시험은 **talk 커밋을 안 지난다**(S5 의 급소 그대로). 이쪽 스위트에
 *   같은 탐지가 있어야 «어느 저장소가 먼저 움직여도» 다음 스위트 실행에서 갈라짐이 잡힌다.
 *   갈라진 채 각자 초록이면 「Lv3 에 1급 문항」이 무증상 재현된다 — 학생이 받는 검사지의 급수를
 *   지키는 제품 검사다. 수정은 정본 쪽 도구가 진다(node tools/계약동기화.js · 정본 = appsscript).
 *
 * ■ 형제가 이 기계에 없으면(CI) — **skip 으로 말한다**(부재를 적색으로도 조용한 초록으로도 위장하지
 *   않는다). 교차 대조를 CI 로 올리려면 두 repo 를 한 러너에 내리는 토큰(PAT)이 필요하다 — 유호님 칸.
 *
 * ■ 형제 자리 풀이 — 워크트리에서도 맞게, appsscript `.claude/hooks/lib/형제저장소.js` 의 방식
 *   그대로다: `.git` 이 «파일»이면 gitdir 로 주저장소를 풀고, 그 옆이 형제다(경로 모양 짐작 금지). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { 표기접기 } = require('./lib/소스검사.js');

/** 워크트리면 주저장소로 푼다 — `.git` 파일의 `gitdir: <주>/.git/worktrees/<이름>` 한 줄이 정본이다. */
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
  } catch { /* git 체크아웃이 아니면 그대로 — 모름을 새 동작으로 번역하지 않는다 */ }
  return root;
}

const 형제 = path.resolve(주저장소(ROOT), '..', 'SYNK-appsscript');
const 이쪽계약 = path.join(ROOT, '계약');
const 정본계약 = path.join(형제, '계약');

test('계약 사본이 정본(SYNK-appsscript)과 같은 바이트다 — 이 사본이 낡으면 문항 급수 검증이 낡은 자로 초록이 된다', (t) => {
  if (!fs.existsSync(path.join(형제, '.git'))) {
    t.skip(`정본 저장소가 이 기계에 없다(${형제}) — CI 자리. 교차 대조는 이 기계의 스위트·배포 게이트가 진다`);
    return;
  }
  const 파일들 = fs.readdirSync(이쪽계약).filter((f) => f.endsWith('.json'));
  assert.ok(파일들.length >= 2, `계약 파일이 ${파일들.length}건 — 분모 소실은 통과가 아니다`);
  const 어긋남 = [];
  for (const f of 파일들) {
    const 정본길 = path.join(정본계약, f);
    if (!fs.existsSync(정본길)) { 어긋남.push(`${f}: 정본에 없다(정본 없는 사본 = 유령)`); continue; }
    if (표기접기(fs.readFileSync(path.join(이쪽계약, f), 'utf8')) !== 표기접기(fs.readFileSync(정본길, 'utf8'))) {
      어긋남.push(`${f}: 바이트가 다르다`);
    }
  }
  for (const f of fs.readdirSync(정본계약).filter((x) => x.endsWith('.json'))) {
    if (!fs.existsSync(path.join(이쪽계약, f))) 어긋남.push(`${f}: 정본엔 있는데 사본이 없다(새 계약이 동기화 밖)`);
  }
  assert.deepEqual(어긋남, [],
    `계약이 갈라졌다 — 정본 쪽에서 node tools/계약동기화.js 로 맞춘다:\n  ${어긋남.join('\n  ')}`);
});
