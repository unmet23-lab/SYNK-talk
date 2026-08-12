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

const { execFileSync, spawnSync } = require('node:child_process');
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
    // --no-index 가 없으면 이 검사는 **아무것도 잡지 못한다**: check-ignore는 기본적으로
    // 인덱스를 참조해 「이미 추적 중인 파일」을 무시 대상에서 뺀다. 그런데 우리가 잡으려는
    // 상황(`git add -f`)은 정확히 그 「이미 추적 중」 상태다. 0일차 실측으로 발견.
    const out = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
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

  /* ── 쓰는 문자는 한글·몽골어·영어 셋뿐 (유호님 확정 2026-08-07) ──────────────
   * 왜 여기인가 (F351 · F379): 이 규칙을 지키던 장치는 형제(SYNK-appsscript)의
   *   `tests/문서문자.test.js` 하나였다. 그런데 **이 저장소 세션은 그 스위트를 안 돌린다** —
   *   즉 그 층에서는 원리상 안 잡힌다. 실측 2026-08-12: `prompts/교정.md` 에 「한자·가나 금지」
   *   규칙을 넣으면서 그 **보기로 금지 문자를 썼고**, 이 파일은 전문이 그대로 모델 `system` 에
   *   실리므로(lib/교정엔진.js) 문서 흠이 아니라 **모델 입력에 금지 문자를 넣은 것**이었다.
   *   커밋은 조용히 지나갔고, 한참 뒤 형제 저장소에서 남이 발견했다.
   * 🔑 판정은 여기서 안 한다 — 형제의 `tools/lib/옛글자.js` 하나가 진다(계약 게이트와 같은 축).
   * 🔑 처방문을 여기서 다시 쓰지 않고 **그 도구의 말을 그대로 흘린다** — 아래 ①②③ 안내는
   *   자격증명용이라 이 위반에는 따를 수 없는 처방이 된다(F103).
   * ⚠ 형제가 없는 기계(폰·클라우드)에서는 **막지 않고 말한다** — 확인 불가를 차단으로 바꾸면
   *   그 세션은 아무것도 커밋 못 한다. 대신 통과와 미실행이 같은 모양이 되지 않게 찍는다. */
  const 옛글자도구 = process.env.SYNK_옛글자도구
    || require('node:path').join(__dirname, '..', '..', 'SYNK-appsscript', 'tools', '옛글자검사.js');
  if (!require('node:fs').existsSync(옛글자도구)) {
    console.error('[guard] 형제 저장소가 없어 옛 글자(한자·가나) 대조를 **못 했다**.');
  } else {
    /* ⚠ `spawnSync` 인 이유: 이 도구는 **성공했을 때도 stderr 로 분모를 말한다**(몇 개를 열었나 ·
     *   F207). `execFileSync` 는 성공 시 stdout 만 돌려주므로 그 말을 통째로 버리고, 그러면
     *   이 저장소에서 「돌았는데 깨끗」과 「안 돌았다」가 같은 모양이 된다 — F379 의 병이
     *   정확히 그거였다(이 층은 원리상 안 잡히는데 아무도 그걸 몰랐다). */
    const r = spawnSync(process.execPath, [옛글자도구, '--cached'], { encoding: 'utf8' });
    process.stderr.write(String(r.stderr || ''));
    if (r.status !== 0) {
      if (!r.stderr) process.stderr.write('[guard] 옛 글자 검사를 못 돌렸다 — 커밋을 막는다.\n');
      return 1;
    }
  }

  const problems = [];

  /* 계약이 두 저장소에서 갈라진 채 커밋되는 것을 막는다 (유호님 확정 ㉮ · 2026-08-07).
   * 여기 copy 는 **사본**이고 정본은 형제(SYNK-appsscript)에 있다. 갈라짐을 잡던 유일한 장치인
   * `tests/계약.test.js` 는 형제가 없으면 skip 이고 Actions 는 자기 저장소만 checkout 하므로,
   * 갈라져도 양쪽 CI 가 다 초록이었다(설계 심문 지목 · 워크플로 실측).
   * 🔑 판정은 여기서 안 한다 — 형제의 `계약동기화.js` 하나가 진다(같은 판정을 두 곳에 적으면
   *   갈라지고, 갈라지는 방향은 언제나 「통과」다). 이 자리는 발동 조건만 맡는다.
   * ⚠ 형제가 없는 기계(폰·클라우드)에서는 **막지 않고 말한다** — 확인 불가를 차단으로 바꾸면
   *   그 세션은 아무것도 커밋 못 한다. 대신 통과와 미실행이 같은 모양이 되지 않게 찍는다. */
  if (paths.includes('계약/수집_교정_계약.json')) {
    // 경로를 주입 가능하게 두는 이유는 **회귀가 이 자리를 실제로 밟게** 하려는 것뿐이다.
    // 실데이터(계약 파일)를 흔들어 재면 그게 더 위험하다. 운영에서는 기본값으로만 쓴다.
    const 도구 = process.env.SYNK_계약도구
      || require('node:path').join(__dirname, '..', '..', 'SYNK-appsscript', 'tools', '계약동기화.js');
    if (!require('node:fs').existsSync(도구)) {
      console.error('[guard] 형제 저장소가 없어 계약 대조를 **못 했다** — 정본과 갈라졌는지 알 수 없다.');
    } else {
      try {
        execFileSync(process.execPath, [도구, '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        problems.push({
          path: '계약/수집_교정_계약.json',
          rule: '정본과 갈라진 계약',
          why: `형제 저장소의 정본과 다르다 — ${String(e.stderr || '').trim().split('\n')[0] || '대조 실패'}`,
        });
      }
    }
  }

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
