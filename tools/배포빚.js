#!/usr/bin/env node
'use strict';
/* 배포빚 — 「지금 배포본이 소스보다 낡은 함수가 몇 개인가」를 **네트워크 0** 으로 답한다.
 *
 * ■ 왜 있나 (F455 · 2026-08-15 실측)
 *   운영 배포본 6개가 소스보다 낡은 채로 며칠 서 있었고, `deliver` 는 그 상태로 **매일 두 번**
 *   (`deliver-daily`·`deliver-check`), `radio-promote` 는 **매시간** cron 에 불렸다.
 *
 *   🔑 그런데 착수 실측이 F455 의 진단을 뒤집었다 — 「낡음을 세는 눈이 손호출뿐이다」는 틀렸다.
 *   눈은 있었고 **정확히 물었다**: `동봉신호`(post-commit)를 그 커밋(`49d4feb`)에 다시 돌리면
 *   `deliver·progress·radio-promote·tasks·teach` 다섯을 이름까지 대며 알린다 — 이틀 뒤 내가
 *   네트워크로 잰 집합과 **완전히 같다**.
 *
 *   빠진 것은 탐지가 아니라 **보존**이다. 그 신호는 «그 순간의 stdout» 에만 살았다. 배포는
 *   라이브를 바꾸는 승인 자리라 그 자리에서 못 갚는 일이 흔한데(실측: `368603a` 는 리허설만
 *   갚았고, `49d4feb` 는 메모리에 「▶잔여=배포 둘」만 적고 세션이 끝났다), **못 갚은 빚이
 *   어느 장부에도 안 남는다.** 다음 세션은 그것을 물어볼 자리가 없다.
 *
 * ■ 왜 이 계산이 근사가 아니라 등식인가
 *   `원격배포.js` 는 **작업본이 아니라 HEAD 에서 읽어** 올린다(그 파일 머리 · 남의 미커밋이
 *   라이브로 나가는 것을 막으려고 그렇게 못박혔다). 그러니 「배포한 HEAD」 한 칸만 남기면
 *   「그 뒤 그 함수의 나갈 파일이 바뀌었나」가 곧 「배포본이 낡았나」다 — 휴리스틱이 아니다.
 *
 * ■ 새 장치의 대가 (CLAUDE.md 「새 장치엔 대가를 함께 적는다」)
 *   · **틀릴 때의 모습** = 장부에 줄이 없는 함수를 「최신」으로 세는 것. 그러면 이 도구는
 *     초록인 얼굴로 거짓을 말하고, 새는 방향은 언제나 「통과」다. 그래서 «모름» 을 별도 칸으로
 *     내고 **절대 최신에 합치지 않는다** — 합계를 «낡음+최신+모름» 으로 쪼개 늘 같이 낸다.
 *   · **닫을 것** = 없다. 이 장치는 아무것도 막지 않는 «알림»이고, 안전 가드를 대체하지 않는다
 *     (`왕복전게이트`·`동봉신호`는 그대로 둔다 — 억지로 닫지 않는다).
 *
 * 사용:
 *   node tools/배포빚.js              두 판 전부
 *   node tools/배포빚.js --판 운영     한 판만
 *   node tools/배포빚.js --json       기계 판독 한 줄(형제 저장소가 읽는 자리 · 아래 참조)
 *
 * ■ 왜 `--json` 이 있나 (대기열 #Q87 · 2026-08-15)
 *   이 빚은 **as 저장소(SYNK-appsscript) 세션 눈에 원리적으로 안 보인다** — 그쪽 `배포판점검`
 *   은 `claspProjects()`(Apps Script 판)만 돌아 Supabase 함수를 애초에 안 센다. 그런데 두
 *   저장소를 함께 만지는 트랙이 절반이라, talk 을 안 건드리는 세션은 빚이 며칠째 서 있는 줄을
 *   모른다(실측 08-15: 리허설 낡음 5 · 운영 낡음 4).
 *   ⚠ **그쪽이 `배포장부.jsonl` 을 직접 파싱하게 두지 않는다** — 같은 판정이 두 곳에 살면
 *   갈라지고, 갈라진 쪽의 증상은 언제나 「통과」다. 그래서 판정은 여기 한 벌로 두고 **읽는
 *   통로만** 연다. 비용 실측(2026-08-15): 이 도구 전체 호출 **390ms**(3회) — 부르는 쪽인
 *   `작업본소유자 --hook` 이 이미 10~14초라 +3% 다.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const 장부경로 = path.join(ROOT, 'docs', '_ops', '배포장부.jsonl');
const 판들 = ['리허설', '운영'];

/* ── 장부 (append-only) ───────────────────────────────────────────────────
 * 한 줄 = 「이 판의 이 함수는 이 HEAD 기준으로 최신이었다」. 두 통로가 적는다:
 *   · `원격배포 --적용` 성공 — 방금 그 HEAD 를 올렸으니 참이다
 *   · `배포대조 --도장`      — 바이트로 「같다」를 확인했으니 참이다
 * 행 삭제 금지(CLAUDE.md · `tests/장부유실.test.js` 계열과 같은 규약). */

/** 장부 한 줄 → 객체. 못 읽는 줄은 `null` — **조용히 버리지 않고** 위에서 센다. */
function 줄파싱(줄) {
  const s = String(줄 || '').trim();
  if (!s) return null;
  let o;
  try { o = JSON.parse(s); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  if (!o.함수 || !o.판 || !o.head) return null;       // 세 칸이 없으면 기준이 못 된다
  return o;
}

/** 장부 텍스트 → `{ 줄들, 깨진 }`. 깨진 줄 수를 함께 내는 것이 이 함수의 절반이다. */
function 장부파싱(text) {
  const 줄들 = [];
  let 깨진 = 0;
  for (const 줄 of String(text || '').split('\n')) {
    if (!줄.trim()) continue;
    const o = 줄파싱(줄);
    if (o) 줄들.push(o); else 깨진 += 1;
  }
  return { 줄들, 깨진 };
}

/** 판별 최신 기준 — 같은 `(판, 함수)` 가 여러 줄이면 **뒤 줄이 이긴다**(append-only 라 시간순).
 *  🔑 판을 안 가르면 운영 도장이 리허설 빚을 지운다(그 실수의 증상은 「초록」이다). */
function 최신기준(줄들, 판) {
  const m = new Map();
  for (const o of 줄들) if (o.판 === 판) m.set(o.함수, o);
  return m;
}

/** **순수 판정.** 파일도 git 도 안 본다 — 회귀가 닿는 층은 여기 하나다.
 *
 *  @param 함수들 저장소의 배포 대상 함수 이름 전량. 이것이 **분모**다.
 *  @param 기준   Map(함수 → 장부줄). 없으면 그 함수는 «모름».
 *  @param 바뀐   Map(함수 → string[]) — 기준 HEAD..HEAD 에서 바뀐 «나갈 파일». 기준이 없거나
 *                기준 HEAD 가 지금 HEAD 의 조상이 아니면 이 표에 **넣지 않는다**(→ 모름).
 */
function 빚판정({ 함수들, 기준, 바뀐 }) {
  const 낡음 = [];
  const 최신 = [];
  const 모름 = [];
  for (const 함수 of 함수들) {
    const 줄 = 기준.get(함수);
    if (!줄 || !바뀐.has(함수)) { 모름.push(함수); continue; }
    const 목록 = 바뀐.get(함수) || [];
    if (목록.length) 낡음.push({ 함수, head: 줄.head, 때: 줄.때 || null, 바뀐: 목록 });
    else 최신.push(함수);
  }
  return { 낡음, 최신, 모름 };
}

/** 「0은 분모와 함께 쓴다」 — 합계를 갈래 합으로 쪼개 한 줄에 낸다(유호 확정 08-14).
 *  좋은 0(진짜 최신)과 「안 재봤다」(모름)가 한 눈에 갈린다. */
function 요약문(판, 판정) {
  const { 낡음, 최신, 모름 } = 판정;
  const 합 = 낡음.length + 최신.length + 모름.length;
  return `${판} — 전체 ${합} = 낡음 ${낡음.length} + 최신 ${최신.length} + 모름 ${모름.length}`;
}

/** 과녁 ref → 판 이름. **순수**하고 여기 한 곳에만 산다 — 부르는 쪽마다 적으면 갈라지고,
 *  갈라진 쪽은 운영 도장을 리허설 칸에 찍는다(그 실수의 증상은 「초록」이다).
 *  모르는 ref 는 `null` — 「리허설이겠지」로 접으면 운영 빚이 통째로 사라진다. */
function 판이름(ref, 운영REF) {
  if (!ref) return null;
  if (운영REF && ref === 운영REF) return '운영';
  return 운영REF ? '리허설' : null;
}

/** 사람이 읽을 안내문. 순수 함수라 회귀가 문구까지 잰다. */
function 안내문(판, 판정, 디렉터리찾기 = (f) => `supabase/functions/${f}`) {
  const 줄 = [`[배포빚] ${요약문(판, 판정)}`];
  for (const d of 판정.낡음) {
    줄.push(`  🔴 ${d.함수}  ←  ${d.바뀐.join(' · ')}`);
    줄.push(`      node tools/원격배포.js ${디렉터리찾기(d.함수)} --적용${판 === '운영' ? ' --운영' : ''}`);
  }
  if (판정.모름.length) {
    줄.push(`  ❔ 모름 ${판정.모름.length} — 장부에 이 판의 도장이 없다(안 잰 것이지 최신이 아니다): ${판정.모름.join(' · ')}`);
    줄.push('      재려면: node tools/배포대조.js --도장' + (판 === '운영' ? ' --운영' : ''));
  }
  return 줄.join('\n');
}

/** 기계 판독 한 벌 — **사람글과 같은 `판정하기` 에서 나온다.** 부르는 쪽이 장부를 직접 파싱하면
 *  같은 판정이 두 곳에 살고, 갈라진 쪽의 증상은 언제나 「통과」다(CLAUDE.md · 목록은 하나에서 파생).
 *
 *  🔑 낡음·모름은 **이름**으로, 최신은 **수**로 낸다 — 부르는 쪽이 할 말은 「무엇이 낡았나」이고
 *     최신 목록은 아무도 안 읽는데 출력만 키운다. 분모는 그대로 산다(전체 = 낡음+최신+모름).
 *  ⚠ **`모름` 을 빼거나 최신에 합치지 않는다** — 이 도구가 거짓말할 수 있는 유일한 자리고, 새는
 *     방향은 언제나 「통과」다(머리말 「새 장치의 대가」와 같은 규약). 부르는 쪽이 이 칸을 안 쓰는
 *     것은 그쪽 죄지만, 여기서 안 내면 그쪽엔 **쓸 방법 자체가 없다.** */
function 기계요약(장부 = 장부읽기(), 판목록 = 판들) {
  const 판별 = {};
  for (const 판 of 판목록) 판별[판] = 요약칸(판정하기(판, 장부));
  return { 도구: '배포빚', 판: 판별, head: 지금HEAD(), 장부깨진: 장부.깨진 };
}

/** 판정 하나 → 기계 칸 하나. **순수** — `기계요약` 은 git 을 타서 회귀가 못 닿으니, 이 장치가
 *  샐 수 있는 규칙(분모 등식 · 모름 분리)은 전부 여기 모아 픽스처가 재게 한다. */
function 요약칸(판정) {
  return {
    전체: 판정.낡음.length + 판정.최신.length + 판정.모름.length,
    낡음: 판정.낡음.map((d) => d.함수),
    최신: 판정.최신.length,
    모름: 판정.모름,
  };
}

/* ── 장부 쓰기 ────────────────────────────────────────────────────────── */

/** 도장 한 줄 append. **어떤 실패도 부르는 쪽(배포·대조)을 흔들지 않는다** — 알림이지 가드가 아니다. */
function 도장({ 판, 함수, head, 출처, 판번호 = null }) {
  try {
    if (!판 || !함수 || !head) return false;
    const 줄 = JSON.stringify({
      때: new Date().toISOString(), 판, 함수, head, 출처, 판번호,
    });
    fs.mkdirSync(path.dirname(장부경로), { recursive: true });
    fs.appendFileSync(장부경로, 줄 + '\n', 'utf8');
    return true;
  } catch { return false; }
}

/** 장부를 읽어 판별 기준을 낸다. 파일이 없으면 «전부 모름» 이다(빈 장부 ≠ 최신). */
function 장부읽기() {
  let text = '';
  try { text = fs.readFileSync(장부경로, 'utf8'); } catch { text = ''; }
  return 장부파싱(text);
}

/* ── git (비순수) ────────────────────────────────────────────────────── */

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

/** 지금 HEAD 의 전체 sha. */
function 지금HEAD() {
  try { return git(['rev-parse', 'HEAD']).trim(); } catch { return null; }
}

/** `기준` 이 지금 HEAD 의 조상인가 — 아니면(rebase·다른 가지·없는 sha) 대조가 뜻을 잃는다. */
function 조상인가(기준head) {
  try {
    git(['merge-base', '--is-ancestor', 기준head, 'HEAD']);
    return true;
  } catch { return false; }
}

/** 그 함수가 **배포로 내보내는 경로 전량**(저장소 상대). `마지막커밋` 과 같은 규칙이다. */
function 나갈경로들(slug) {
  const { 동봉읽기 } = require('./원격배포.js');       // 지연 require — 순환 참조를 만들지 않는다
  const 디렉터리 = path.join(ROOT, 'supabase', 'functions', slug);
  return [`supabase/functions/${slug}`, ...Object.values(동봉읽기(디렉터리) || {})];
}

/** 배포 대상 함수 전량 — `index.ts` 가 있는 디렉터리(배포대조와 같은 규칙). */
function 함수들() {
  const 방 = path.join(ROOT, 'supabase', 'functions');
  if (!fs.existsSync(방)) return [];
  return fs.readdirSync(방).filter((n) => fs.existsSync(path.join(방, n, 'index.ts'))).sort();
}

/** 두 트리 사이에 바뀐 경로 전량(pathspec 없이 한 번에). 조상이 아니면 `null`(→ 모름). */
function 바뀐경로들(기준head) {
  if (!조상인가(기준head)) return null;
  try {
    return String(git(['diff', '--name-only', '-z', 기준head, 'HEAD'])).split('\0').filter(Boolean);
  } catch { return null; }
}

/** 바뀐 경로 하나가 그 함수의 «나갈 것»에 걸리나. **순수** — 디렉터리는 접두, 파일은 정확히.
 *  🔑 `supabase/functions/deliver` 는 파일이 아니라 **디렉터리**라 `startsWith` 가 필요하고,
 *     그냥 `startsWith` 만 쓰면 `.../deliver2` 가 걸린다. 경계(`/`)를 같이 본다. */
function 걸리나(경로, 나갈것) {
  return 나갈것.some((p) => 경로 === p || 경로.startsWith(`${p}/`));
}

/** 한 판의 판정을 실제로 계산한다(git 을 태운다).
 *  🔑 **기준 HEAD 로 묶어 판당 git 호출을 1~2회로 줄인다** — 이 계산은 `동봉신호`(post-commit)가
 *     커밋마다 부르는 자리다. 함수마다 부르면 커밋이 눈에 띄게 느려지고, 느린 알림은 꺼진다. */
function 판정하기(판, 장부 = 장부읽기()) {
  const 기준 = 최신기준(장부.줄들, 판);
  const 목록 = 함수들();

  const head별 = new Map();                       // head → [함수…]
  for (const f of 목록) {
    const 줄 = 기준.get(f);
    if (!줄) continue;
    if (!head별.has(줄.head)) head별.set(줄.head, []);
    head별.get(줄.head).push(f);
  }

  const 바뀐 = new Map();
  for (const [head, 함수목록] of head별) {
    const 전체 = 바뀐경로들(head);
    if (!전체) continue;                          // 조상이 아니다 → 그 함수들은 «모름»
    for (const f of 함수목록) {
      const 나갈것 = 나갈경로들(f);
      바뀐.set(f, 전체.filter((p) => 걸리나(p, 나갈것)));
    }
  }
  return 빚판정({ 함수들: 목록, 기준, 바뀐 });
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--판');
  const 고른판 = i >= 0 ? args[i + 1] : null;
  if (고른판 && !판들.includes(고른판)) {
    console.error(`[배포빚] 모르는 판: ${고른판} — ${판들.join(' · ')} 중 하나다.`);
    process.exit(1);
  }
  const 장부 = 장부읽기();
  /* ⚠ 깨진 줄 경고는 **stderr** 다 — `--json` 의 stdout 에 섞이면 부르는 쪽 `JSON.parse` 가
   *   통째로 터지고, 터진 쪽은 「모름」으로 접혀 **조용해진다**(새는 방향이 「통과」인 그 모양).
   *   수는 JSON 에도 실어 보낸다(`장부깨진`) — 사람글에만 있으면 기계는 영영 못 본다. */
  if (장부.깨진) console.error(`[배포빚] ⚠ 장부에서 못 읽은 줄 ${장부.깨진}개 — 그만큼은 «모름» 으로 샌다.`);
  const 판목록 = 고른판 ? [고른판] : 판들;
  if (args.includes('--json')) { console.log(JSON.stringify(기계요약(장부, 판목록))); return; }
  for (const 판 of 판목록) console.log(안내문(판, 판정하기(판, 장부)));
}

module.exports = {
  줄파싱, 장부파싱, 최신기준, 빚판정, 요약문, 안내문, 판이름, 걸리나, 기계요약, 요약칸,
  도장, 장부읽기, 판정하기, 함수들, 나갈경로들, 지금HEAD, 장부경로, 판들,
};

if (require.main === module) main();
