#!/usr/bin/env node
/* 원격배포 — Supabase Edge Function 을 Management API 로 **원격** 배포한다.
 *
 * 왜 있나 (유호님 지시 2026-08-06 「전부 원격으로 해줘」):
 *   공식 경로는 `supabase functions deploy` 인데 그건 **CLI + Docker** 를 요구한다.
 *   발주 §3-1 ③ 이 금지한 것은 「유호님께」 설치를 요구하는 것이고, 이 도구는 그 요구 자체를
 *   없앤다 — `원격SQL.js` 가 SQL 에 대해 한 일을 함수 배포에 대해 한다. 자격증명도 같은 `.env`.
 *
 * 안전 — `원격SQL.js` 와 같은 규칙:
 *   · 기본은 **읽기**(`--목록`). 배포는 라이브를 바꾸므로 `--적용` 없이는 안 나간다.
 *   · 토큰은 헤더에만 싣고 stdout·에러에 찍지 않는다.
 *   · ⚠ 토큰 범위는 계정 전체다(Supabase 쪽에 좁힐 수단이 없다) — 작업이 끝나면 폐기한다.
 *
 * 사용:
 *   node tools/원격배포.js --목록
 *   node tools/원격배포.js supabase/functions/events --적용
 *   node tools/원격배포.js --호출 events < 본문.json     # 왕복 실측(키는 여기서 못 샌다)
 *   node tools/원격배포.js --삭제 diag --적용
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API = 'https://api.supabase.com/v1/projects';

const 자격증명 = require('../lib/자격증명.js');   // .env 읽기 + 토큰 만료 게이트(공용 통로)

const die = (msg) => { console.error('[원격배포] ' + msg); process.exit(1); };

/* 저장소가 요구하는 계약판 — 마이그레이션 **파일 이름**에서 읽는다(`20260808010000_engine_c10.sql`).
 * 🔑 이름 규칙의 정본은 `tools/마이그레이션_합본.js` 고 여기선 같은 꼴만 본다 — 판을 손 상수로
 *   두면 마이그레이션을 늘리는 사람이 두 곳을 고쳐야 하고, 잊은 쪽은 조용히 낡는다. */
function 저장소판(root) {
  const 방 = path.join(root, 'supabase', 'migrations');
  const 이름들 = fs.existsSync(방)
    ? fs.readdirSync(방).filter((n) => /^\d{14}_.+_c\d+\.sql$/u.test(n)).sort() : [];
  const 최신 = 이름들[이름들.length - 1] || null;
  return { 파일: 최신, 판: 최신 ? 최신.match(/_(c\d+)\.sql$/)[1] : null };
}

/* 「대상 DB 가 저장소보다 뒤처졌나」 — 뒤처졌으면 막을 말을, 아니면 null 을 낸다.
 * 🔑 순수 함수다. 네트워크를 태우는 자리에 판정을 적으면 회귀가 못 닿고, 못 닿는 판정은
 *   조용히 갈린다(이 저장소가 `동봉묶기` 에서 이미 겪은 자리). */
function 판뒤처짐(저장소, db최신, 읽기실패) {
  const n = (v) => (String(v || '').match(/c(\d+)/) || [])[1];
  if (읽기실패) return `대상 DB 의 계약판을 못 읽었다(${읽기실패}) — 못 읽은 것은 통과가 아니다.`;
  if (!저장소.판) return '저장소에서 마이그레이션 파일을 못 찾았다 — 대조할 기준이 없다.';
  if (!db최신) return '대상 DB 에 engine.schema_migrations 기록이 없다 — 스키마가 안 선 프로젝트다.';
  const [a, b] = [Number(n(저장소.판)), Number(n(db최신))];
  if (!a || !b) return `판 이름을 못 읽었다(저장소 ${저장소.판} · DB ${db최신}).`;
  if (a > b) {
    return `저장소가 DB 보다 앞선다 — 저장소 ${저장소.판}(${저장소.파일}) · DB ${db최신}. `
      + '이대로 나가면 배포는 ✅ 로 끝나고 **다음 호출**에서 없는 열로 죽는다.';
  }
  return null;
}

/* 동봉 — 함수가 저장소의 **정본 파일**을 그대로 쓰게 한다(베껴 두면 갈라진다).
 *
 * 🔴 **작업본이 아니라 `HEAD` 에서 읽는다.** 이 저장소는 세션이 동시에 돈다 —
 *   2026-08-06 실측: 계약 json 이 옆 세션 작업본에서 c6→c7 로 열려 있었고, 작업본을 그대로
 *   묶었으면 **남의 미커밋 편집이 라이브 함수로 나갔을 것**이다(DB 는 아직 c6). 배포되는 것은
 *   언제나 커밋된 것이어야 한다. 작업본이 다르면 조용히 넘어가지 않고 알린다.
 *
 * CJS(`module.exports`)를 Deno(ESM)에서 쓰려면 껍데기가 필요하다 — `.mjs` 로 동봉하면 감싼다.
 * 이름 목록을 여기 적지 않는다(적으면 그게 또 두 벌이다) — `export default module.exports`.
 *
 * 🔴 **lib 파일끼리의 `require('./옆.js')` 도 푼다.** 안 풀면 Deno 에 `require` 가 없어
 *   **배포는 성공하고 import 시점에 죽는다** — 그 실패 모양이 이 파일이 이미 한 번 겪은 것이다.
 *   피하려고 정본을 베끼면 갈라지고, 갈라지는 방향은 언제나 「통과」다(L0 §4-2 가 앱·서버에
 *   같은 함수 하나를 쓰라고 못박은 이유). 그래서 **정적 import 로 바꿔 준다** — 그러려면
 *   그 옆 파일도 동봉 표에 있어야 하고, 없으면 **여기서 멈춘다**(런타임까지 미루지 않는다).
 */
/* 상대 경로 전부를 받는다 — `./옆.js` 만 보던 초판은 `../contents/팩.js` 를 **조용히 통과**시켰고,
 * 안 풀린 require 는 배포 초록 뒤 부팅 import 에서 죽는다(적대 반박 C2 · 2026-08-11).
 * 묶음은 평평해서(같은 디렉터리에 <이름>.mjs) 경로는 버리고 **파일명(basename)**으로 잇는다 —
 * 표의 .mjs 이름이 JSON 키라 같은 파일명 두 벌은 표 층에서 원리상 못 선다.
 * ⚠ 식별자는 `[\w$]` 가 아니라 유니코드 문자 클래스다 — 이 저장소는 한글 이름이 표준이라
 *   `const 팩 = require(…)` 꼴을 `\w` 가 조용히 통과시켰다(같은 날 실측 · 새는 방향은 통과). */
const REQUIRE문 = /(?:const|let|var)\s+(\{[^}]*\}|[\p{L}\p{N}_$]+)\s*=\s*require\(\s*'(\.\.?\/(?:[^']*\/)?)([^'/]+?)\.js'\s*\)\s*;?/gu;

function require풀기(src, 이름, 표내용) {
  const 있는mjs = new Map(
    Object.entries(표내용)
      .filter(([n]) => n.endsWith('.mjs'))
      .map(([n, p]) => [String(p).replace(/^.*\//, '').replace(/\.js$/, ''), n]),
  );
  let 번호 = 0;
  return src.replace(REQUIRE문, (전체, 묶음, 경로, 파일명) => {
    const 대상 = 있는mjs.get(파일명);
    /* ⚠ `die`(=process.exit) 가 아니라 **던진다.** exit 하는 가드는 회귀로 탐지력을 잴 수 없고
     *   (테스트 프로세스가 통째로 죽는다), 못 재는 가드는 다음 개정에서 조용히 죽는다.
     *   CLI 동작은 같다 — `main().catch(die)` 가 같은 문구로 받는다. */
    if (!대상) {
      throw new Error(`동봉 ${이름}: \`require('${경로}${파일명}.js')\` 를 풀 수 없다 — 그 파일이 동봉 표에 없다.\n`
        + `       표에 "${파일명}.mjs": "<저장소 상대 경로>/${파일명}.js" 를 더해라. 안 그러면 배포는 성공하고 함수가 import 에서 죽는다.`);
    }
    /* 🔴 **이름 있는 import 로 바꾸면 안 된다.** 껍데기가 내는 것은 `export default` 하나뿐이라
     *   `import { a } from './x.mjs'` 는 **import 시점에 SyntaxError** 로 죽는다 —
     *   배포는 성공하고 첫 호출에서 죽는 그 모양이다(2026-08-06 실측으로 잡았다).
     *   그래서 default 로 받아서 **원래의 구조분해를 그대로 둔다**. */
    const 임시 = `__동봉${번호 += 1}`;
    return `import ${임시} from './${대상}';\nconst ${묶음} = ${임시};`;
  });
}

/* 🔴 `index.ts` 의 `import './x.mjs'` 도 표에 있어야 한다.
 *
 *   `require풀기` 는 **lib 끼리의** require 만 지고, 함수 본체가 부르는 것은 아무도 안 봤다.
 *   빠뜨리면 Management API 는 그 파일이 없는 채로 **배포에 성공하고**, 함수는 첫 호출의
 *   import 에서 죽는다 — 라이브가 조용히 500 이 되는데 배포 로그는 초록이다. 2026-08-07 에
 *   함수 넷이 동시에 `토큰.mjs` 를 물면서 이 구멍이 넷으로 늘어 여기서 막는다.
 *   던지는 이유는 `require풀기` 와 같다 — `process.exit` 하는 가드는 회귀가 탐지력을 못 잰다. */
function 본체import검사(디렉터리, 표내용) {
  const 본체 = path.join(디렉터리, 'index.ts');
  if (!fs.existsSync(본체)) return;                       // 픽스처 등 본체가 없는 디렉터리
  const src = fs.readFileSync(본체, 'utf8');
  const 빠진 = [];
  for (const m of src.matchAll(/^\s*import\s+[^'"]*from\s+'\.\/([^']+\.mjs)'/gm)) {
    if (!Object.prototype.hasOwnProperty.call(표내용, m[1])) 빠진.push(m[1]);
  }
  if (빠진.length) {
    throw new Error(`동봉 ${path.basename(디렉터리)}: index.ts 가 import 하는데 동봉 표에 없다 — ${빠진.join(', ')}\n`
      + '       표에 그 항목을 더해라. 안 그러면 배포는 성공하고 함수가 첫 호출의 import 에서 죽는다.');
  }
}

/* 나가는 **모든** 파일이 지나는 한 통로 — 본체(index.ts)든 동봉 lib 이든 같은 규칙이다.
 *
 * 🔴 2026-08-09 실측(**F273**): 이 규칙이 동봉에만 걸려 있었고 본체는 작업본에서 읽고 있었다.
 *   본체와 lib 을 함께 고친 커밋 **전**에 배포하니 **반쪽이 나갔다** — 새 `index.ts` + 옛
 *   `음성헤더.mjs` → 배포는 ✅ 로 끝나고 첫 호출에서 `길이초 is not a function`.
 *   경고는 lib 이름만 부르며 「미커밋 편집은 안 나간다」고 말하는데 **정작 호출부는 나갔다** —
 *   새는 방향이 「통과」인 그 모양이고, 여기선 「안전하다」고 읽히기까지 한다.
 * 🔑 위 머리말이 이미 이유를 다 적어 뒀다(「배포되는 것은 언제나 커밋된 것이어야 한다」).
 *   본체가 그 예외일 이유가 없다 — 오히려 본체가 **남의 미커밋 편집이 실릴 가장 큰 파일**이다.
 * 🔑 알림이 아니라 **막는다**: 반쪽 배포는 배포 시점에 증상이 없고, 깨진 것은 다음에 그 함수를
 *   부르는 사람이 본다(공유 환경이면 남이 본다 — 위 판 대조가 막기로 한 것과 같은 실패 모양).
 */
function 머리에서(저장소경로) {
  try {
    return require('child_process')
      .execFileSync('git', ['show', `HEAD:${저장소경로}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 << 20 });
  } catch {
    /* ⚠ `die`(=process.exit) 가 아니라 **던진다** — `require풀기`·`본체import검사` 와 같은 이유고,
     *   여기엔 하나가 더 있다: 이 함수는 이제 읽기 전용인 `배포대조.js` 도 지난다(F274).
     *   거기서 exit 하면 남의 미커밋 새 파일 하나가 **남의 왕복시험 5종을 통째로 죽인다**.
     *   던지면 대조는 그것을 「미측정」으로 접고(경고), CLI 는 `main().catch(die)` 가 같은 문구로 받는다. */
    throw new Error(`HEAD 에 없는 경로: ${저장소경로}\n   배포되는 것은 언제나 커밋된 것이다 — 먼저 커밋한다:\n   git commit -m "..." -- ${저장소경로}`);
  }
}

/** 작업본이 HEAD 와 다른가 — **판정만** 한다(막는 것은 부르는 쪽 · `판뒤처짐` 과 같은 자리다).
 *  작업본에 없는 경로는 「같다」로 본다: 지운 파일을 배포로 되살리는 축은 여기 몫이 아니다. */
function 작업본다름(저장소경로, src) {
  const 작업본 = path.join(ROOT, 저장소경로);
  if (!fs.existsSync(작업본)) return false;
  return fs.readFileSync(작업본, 'utf8').replace(/\r\n/g, '\n') !== String(src).replace(/\r\n/g, '\n');
}

function 미커밋검사(저장소경로, src) {
  if (!작업본다름(저장소경로, src)) return;
  /* ⚠ `die`(=process.exit)가 아니라 **던진다** — `머리에서` 와 같은 이유: exit 는 테스트 러너·
   *   상위 도구까지 통째로 죽여 「어느 검사가 왜」를 지운다(2026-08-12 실측: 남의 미커밋 lib 에
   *   이 검사 하나가 테스트 파일 전체를 죽였다). 막는 힘은 같다 — 배포 CLI 는
   *   `main().catch(die)` 가 같은 문구로 받아 같은 자리에서 멈춘다. */
  throw new Error(`작업본이 HEAD 와 다르다: ${저장소경로}\n`
    + `   나가는 것은 HEAD 다 — 지금 밀면 **고친 절반만** 라이브에 선다(F273).\n`
    + `   커밋하고 다시 민다:  git commit -m "..." -- ${저장소경로}\n`
    + `   남의 편집이면 그대로 두고 그 세션이 커밋할 때까지 기다린다(F073).`);
}

/* 동봉 표를 읽는 **유일한 자리**.
 *
 * 🔴 같은 세 줄(`path.join`+`existsSync`+`JSON.parse`)이 `동봉묶기` 와 `마지막커밋` 에 따로
 *   적혀 있었고, 2026-08-10 `post-commit` 신호(F313)가 **세 번째**가 될 참이었다. 표의 모양이
 *   바뀌는 날 갈라지는데, 갈라지는 방향은 언제나 「빈 표 = 해당 없음 = 통과」다.
 *   호출부마다 고치는 대신 잘못 쓸 수 없는 통로를 하나 둔다(CLAUDE.md 신뢰성). */
function 동봉읽기(디렉터리) {
  const 표 = path.join(디렉터리, '동봉.json');
  if (!fs.existsSync(표)) return null;
  return JSON.parse(fs.readFileSync(표, 'utf8'));
}

/** 저장소의 동봉 표 **전량** — `[{ slug, 디렉터리, 경로들 }]`(경로는 전부 저장소 상대·`/` 표기).
 *  `동봉신호`(post-commit)가 「방금 커밋된 경로가 어느 함수에 실려 나가나」를 묻는 자리. */
function 동봉목록(root = ROOT) {
  const 방 = path.join(root, 'supabase', 'functions');
  if (!fs.existsSync(방)) return [];
  const out = [];
  for (const slug of fs.readdirSync(방).sort()) {
    const 디렉터리 = path.join(방, slug);
    if (!fs.statSync(디렉터리).isDirectory()) continue;
    const 표 = 동봉읽기(디렉터리);
    if (!표) continue;
    out.push({ slug, 디렉터리: `supabase/functions/${slug}`, 경로들: Object.values(표) });
  }
  return out;
}

/* ⚠ `파일검사` 는 `배포묶음` 과 **같은 훅**이다 — 여기서 `미커밋검사` 를 직접 부르면 같은 판정이
 * 두 곳에 살고, 주입을 끈 읽기 대조(`배포대조.js`)가 동봉 lib 에서만 도로 죽는다(실측 2026-08-12:
 * 남의 미커밋 `lib/교정엔진.js` 하나가 왕복시험 발화점 전부를 죽였다 — 위 230행 주석이 약속한
 * 바로 그 실패). 기본값은 그대로 「막는다」 — 배포 경로의 F273 보호는 잃지 않는다. */
function 동봉묶기(디렉터리, 파일검사 = 미커밋검사) {
  const 표내용 = 동봉읽기(디렉터리);
  if (!표내용) return {};
  본체import검사(디렉터리, 표내용);
  const out = {};
  for (const [이름, 저장소경로] of Object.entries(표내용)) {
    const src = 머리에서(저장소경로);
    파일검사(저장소경로, src);
    if (!이름.endsWith('.mjs')) out[이름] = src;                    // 그대로
    else if (저장소경로.endsWith('.json')) out[이름] = `export default ${src};\n`;  // JSON → ESM
    /* 텍스트(.md) → ESM 문자열. **원문 자체가 정본**인 파일(프롬프트)을 함수가 그대로 쓰게 한다.
     * 🔑 없으면 그 원문을 코드 안에 베껴야 하고, 베낀 프롬프트는 `evals` 가 재는 것과 제품이
     *   실제로 보내는 것을 갈라 놓는다 — 갈라진 채로도 둘 다 초록이라 증상이 없다.
     * 🔴 `JSON.stringify` 로 싣는다: 마크다운엔 백틱·역슬래시·따옴표가 흔해서 템플릿 리터럴로
     *   감싸면 프롬프트 한 줄이 **배포 산출물의 구문 오류**가 된다(그 실패는 첫 호출에서 난다). */
    else if (저장소경로.endsWith('.md')) out[이름] = `export default ${JSON.stringify(src)};\n`;
    // ⚠ `import` 는 호이스팅되므로 껍데기 뒤에 와도 된다 — 순서를 바꾸지 않는다(바꾸면 diff 가 커진다).
    else out[이름] = `const module = { exports: {} };\nconst exports = module.exports;\n${require풀기(src, 이름, 표내용)}\nexport default module.exports;\n`;
  }
  return out;
}

/* 배포로 **나갈 것 전량** — 본체(`index.ts` 등 디렉터리 파일)와 동봉 lib 을 한 자리에서 조립한다.
 *
 * 🔴 2026-08-09 실측(**F274**): 이 조립이 `main()` 안에 인라인으로만 있어서 `배포대조.js` 는
 *   `동봉묶기` 밖에 부를 수 없었고 — 그래서 **함수 본체를 한 번도 대조하지 않았다.** 리허설
 *   `corrections` 는 몽골어 해설(`1420b93`)이 빠진 옛 판인데 대조는 「✅ 같다(**파일 1**)」였다.
 *   배포가 보내는 것은 2개다. 가장 크고 가장 자주 바뀌는 파일이 비교 대상 밖이면, 그 대조를
 *   발화점으로 쓰는 **왕복시험 5종**은 「지금 초록이 옛 판을 잰 것」을 영영 못 듣는다.
 * 🔑 F273 의 대조판이다 — 그때는 **조립**이 반쪽이었고(본체만 작업본), 여기서는 **대조**가
 *   반쪽이었다. 원인이 같으니 처방도 같다: 나갈 것을 정하는 자리를 하나로 둔다.
 *
 * @param 파일검사 파일마다 부르는 훅. 배포는 미커밋을 **막고**(기본), 대조는 읽기라 안 막는다 —
 *   남의 미커밋 편집 때문에 남의 왕복시험이 죽으면 우회가 정상 통로가 된다(F073·F103). */
function 배포묶음(디렉터리, 파일검사 = 미커밋검사) {
  const out = {};
  for (const 상대 of 파일들(디렉터리)) {
    if (상대 === '동봉.json') continue;               // 명세지 코드가 아니다
    // 본체도 동봉과 **같은 통로**를 지난다(F273 — 여기만 작업본이라 반쪽이 나갔다).
    const 저장소경로 = path.relative(ROOT, path.join(디렉터리, 상대)).split(path.sep).join('/');
    const src = 머리에서(저장소경로);
    파일검사(저장소경로, src);
    out[상대] = src;
  }
  return Object.assign(out, 동봉묶기(디렉터리, 파일검사));
}

/** 이 함수의 **나갈 파일 전량**을 마지막으로 바꾼 커밋 시각(ISO) — 없으면 null.
 *  본체는 바이트로 대조할 수 없어서(배포 시 TS 가 벗겨진다) 시각 축이 대신 진다 · `배포대조.시각뒤처짐`. */
function 마지막커밋(디렉터리) {
  const 상대 = path.relative(ROOT, 디렉터리).split(path.sep).join('/');
  const 경로들 = [상대, ...Object.values(동봉읽기(디렉터리) || {})];
  try {
    const out = require('child_process')
      .execFileSync('git', ['log', '-1', '--format=%cI', '--', ...경로들], { cwd: ROOT, encoding: 'utf8' });
    return out.trim() || null;
  } catch { return null; }
}

function 안내() {
  console.error(`[원격배포] 아직 원격으로 못 돕니다 — .env 에 값 2개가 필요합니다.
같은 값을 \`원격SQL.js\` 가 이미 씁니다: SUPABASE_ACCESS_TOKEN · SUPABASE_PROJECT_REF
발급 절차는 \`node tools/원격SQL.js\` 를 자격증명 없이 한 번 돌리면 그대로 나옵니다.`);
  process.exit(2);
}

/** 디렉터리를 재귀로 훑어 상대경로 목록을 낸다(숨김·node_modules 제외). */
function 파일들(디렉터리, 기준 = 디렉터리) {
  const out = [];
  for (const 이름 of fs.readdirSync(디렉터리)) {
    if (이름.startsWith('.') || 이름 === 'node_modules') continue;
    const 절대 = path.join(디렉터리, 이름);
    if (fs.statSync(절대).isDirectory()) out.push(...파일들(절대, 기준));
    else out.push(path.relative(기준, 절대).split(path.sep).join('/'));
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const 목록 = args.includes('--목록');
  const 판무시 = args.includes('--판무시');
  const 적용 = args.includes('--적용');
  const 대상 = args.find((a) => !a.startsWith('--'));

  const e = 자격증명.읽기('원격배포');
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) 안내();
  const 헤더 = { Authorization: `Bearer ${토큰}` };

  // 🔴 프로젝트가 둘 이상이면(리허설·운영) 환경변수 하나로 대상이 조용히 바뀐다 — 이름으로 확인시킨다.
  try {
    const r = await fetch(`${API}/${ref}`, { headers: 헤더 });
    if (r.ok) console.error(`[원격배포] 대상 ▸ ${JSON.parse(await r.text()).name}  (${ref})`);
  } catch { /* 알림이지 가드가 아니다 */ }

  if (목록) {
    const res = await fetch(`${API}/${ref}/functions`, { headers: 헤더 });
    const 본문 = await res.text();
    if (!res.ok) die(`HTTP ${res.status} — ${본문.slice(0, 500)}`);
    const fns = JSON.parse(본문);
    if (!fns.length) return console.log('[원격배포] 배포된 함수 0개');
    for (const f of fns) {
      console.log(`· ${f.slug}  v${f.version}  ${f.status}  verify_jwt=${f.verify_jwt}  ${new Date(f.updated_at).toISOString()}`);
    }
    return;
  }

  /* 왕복 실측 — anon 키를 Management API 로 그때그때 받아 쓴다.
   * 🔑 키를 .env 에도 셸 이력에도 남기지 않는다(받아서 헤더에만 싣고 버린다). */
  if (args.includes('--호출')) {
    if (!대상) die('호출할 함수 이름을 달라. 예: node tools/원격배포.js --호출 events');
    const kr = await fetch(`${API}/${ref}/api-keys`, { headers: 헤더 });
    if (!kr.ok) die(`api-keys HTTP ${kr.status} — ${(await kr.text()).slice(0, 300)}`);
    const anon = JSON.parse(await kr.text()).find((k) => k.name === 'anon');
    if (!anon) die('anon 키를 못 찾았다');

    // 파이프로 들어온 것만 읽는다 — 터미널이면 readFileSync(0) 이 멈춰 선다.
    const 본문 = process.stdin.isTTY ? '' : fs.readFileSync(0, 'utf8');
    // CONTRACT_VER 를 **빈 값으로 주면 헤더를 아예 뺀다** — 「헤더 누락」도 계약이 정한 응답이라
    // 재 볼 수 있어야 한다. 빈 문자열을 기본값으로 접으면 그 경로는 영영 안 밟힌다.
    const cv = 'CONTRACT_VER' in e ? e.CONTRACT_VER : 'c6';
    const res = await fetch(`https://${ref}.supabase.co/functions/v1/${대상}`, {
      method: 'POST',
      headers: {
        apikey: anon.api_key,
        Authorization: `Bearer ${anon.api_key}`,
        'Content-Type': 'application/json',
        ...(cv ? { 'X-Contract-Ver': cv } : {}),
      },
      body: 본문 || '{}',
    });
    console.log(`HTTP ${res.status}`);
    console.log((await res.text()).slice(0, 4000));
    return;
  }

  if (args.includes('--삭제')) {
    if (!대상) die('삭제할 함수 이름을 달라');
    if (!적용) die(`함수를 지우는 것은 비가역이다. 확인했으면: node tools/원격배포.js --삭제 ${대상} --적용`);
    const res = await fetch(`${API}/${ref}/functions/${encodeURIComponent(대상)}`, { method: 'DELETE', headers: 헤더 });
    if (!res.ok) die(`HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
    return console.log(`[원격배포] 🗑 ${대상} 삭제됨`);
  }

  if (!대상) die('배포할 함수 디렉터리를 달라. 예: node tools/원격배포.js supabase/functions/events --적용\n   목록만: node tools/원격배포.js --목록');

  const 디렉터리 = path.resolve(ROOT, 대상);
  if (!fs.existsSync(디렉터리)) die(`디렉터리가 없다: ${디렉터리}`);
  const slug = path.basename(디렉터리);
  const 내용물 = {};
  for (const [이름, src] of Object.entries(배포묶음(디렉터리))) 내용물[이름] = Buffer.from(src, 'utf8');
  if (!내용물['index.ts']) die(`${slug}/index.ts 가 없다 — 진입점 이름은 index.ts 로 고정한다`);

  const 상대들 = Object.keys(내용물);
  if (!적용) {
    console.log(`[원격배포] 배포하지 않았다(읽기 모드). 나갈 파일 ${상대들.length}개:`);
    for (const r of 상대들) console.log(`   · ${slug}/${r}  ${내용물[r].length}B`);
    /* 🔑 여기서 **승인 조건을 다시 적지 않는다.** 08-12 까지 이 줄은 「유호님 승인 뒤」였는데,
     *   같은 날 유호님이 그 승인을 세션 자율로 위임하며 고친 자리는 `lib/자격증명.js` 차단문
     *   하나뿐이었다(cc70e13). 같은 판정을 두 곳에 적었으니 갈라진 것이고 — 갈라진 쪽이
     *   **리허설에까지** 없던 승인을 요구해, 읽기 모드가 다음 세션을 세운다(실측 08-12 `1961779b`).
     *   조건의 정본은 과녁차단문 하나다. 이 줄은 **칠 명령만** 말한다. */
    console.log(`\n라이브를 바꾸려면: node tools/원격배포.js ${대상} --적용`);
    console.log('   (운영 과녁이면 조건은 `lib/자격증명.js` 차단문이 정본이다 — 여기서 안 적는다)');
    return;
  }

  /* 🔴 **코드만 밀고 DB 판을 안 보면 배포는 성공하고 첫 호출에서 죽는다** (2026-08-08 실측).
   *   `deliver` 를 HEAD 에서 리허설에 올렸더니 배치가 전건 실패했다 —
   *   `column "due_at" of relation "submissions" does not exist`. c10 커밋이 코드와
   *   마이그레이션을 같이 냈는데 **마이그레이션만 안 적용된 DB** 였기 때문이다.
   *   증상이 배포 시점에 안 나온다는 것이 급소다: 배포는 ✅ 로 끝나고, 깨진 것은 **다음에
   *   그 함수를 부르는 사람**이 본다(공유 환경이면 남이 본다).
   * 🔑 그래서 판정을 배포 **전**으로 옮긴다 — 저장소 마이그레이션이 대상 DB 보다 앞서면 안 나간다.
   * 🔑 못 읽으면 **막는다.** 「애매하면 통과」하는 가드는 가드가 아니고, 새는 방향은 늘 통과다.
   *   진짜로 알고 넘길 때만 `--판무시`(그 사실이 출력에 남는다). */
  if (!판무시) {
    const 저장소 = 저장소판(ROOT);
    let db = null, 읽기실패 = null;
    try {
      const r = await fetch(`${API}/${ref}/database/query`, {
        method: 'POST',
        headers: { ...헤더, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'select name from engine.schema_migrations order by version desc limit 1' }),
      });
      if (!r.ok) 읽기실패 = `HTTP ${r.status}`;
      else db = (JSON.parse(await r.text())[0] || {}).name || null;
    } catch (err) { 읽기실패 = String(err.message || err); }

    const 말 = 판뒤처짐(저장소, db, 읽기실패);
    if (말) {
      console.error(`[원격배포] ⛔ ${말}`);
      console.error('   → 적용 SQL 은 유호님 승인 뒤: node tools/원격SQL.js supabase/migrations/<파일> --적용');
      console.error('   → 알고 넘기려면: 같은 명령에 --판무시');
      process.exit(1);
    }
    console.error(`[원격배포] 판 대조 ✅ 저장소 ${저장소.판} · DB ${db}`);
  } else {
    console.error('[원격배포] ⚠ --판무시 — DB 판을 안 보고 나간다(깨지면 다음 호출자가 본다)');
  }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({
    name: slug,
    entrypoint_path: 'index.ts',
    // 🔴 JWT 검증은 플랫폼이 진다 — 함수 안에서 「토큰이 있나」를 다시 안 세게(C0 §2).
    verify_jwt: true,
  })], { type: 'application/json' }), 'metadata.json');

  for (const 상대 of 상대들) {
    form.append('file', new Blob([내용물[상대]], { type: 'application/typescript' }), 상대);
  }

  const res = await fetch(`${API}/${ref}/functions/deploy?slug=${encodeURIComponent(slug)}`, {
    method: 'POST', headers: 헤더, body: form,
  });
  const 본문 = await res.text();
  if (!res.ok) {
    console.error(`[원격배포] HTTP ${res.status} — 배포되지 않았다`);
    console.error(본문.slice(0, 2000));
    process.exit(1);
  }
  const f = JSON.parse(본문);
  console.log(`[원격배포] ✅ ${f.slug} v${f.version} ${f.status} — 파일 ${상대들.length}개`);
  console.log(`   URL https://${ref}.supabase.co/functions/v1/${f.slug}`);
}

/* `require풀기` 는 회귀 이음매다 — `동봉묶기` 는 HEAD 에서 읽어(git show) 픽스처 소스를 못
 * 먹이므로, 재작성 규칙(상위 경로 포함)의 탐지력은 이 함수를 직접 태워 잰다. */
module.exports = { 파일들, 동봉읽기, 동봉목록, 동봉묶기, 배포묶음, 마지막커밋, 작업본다름, 저장소판, 판뒤처짐, require풀기, REQUIRE문 };
if (require.main === module) main().catch((err) => die(String(err && err.message || err)));
