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
const REQUIRE문 = /(?:const|let|var)\s+(\{[^}]*\}|[\w$]+)\s*=\s*require\(\s*'\.\/([^']+?)\.js'\s*\)\s*;?/g;

function require풀기(src, 이름, 표내용) {
  const 있는mjs = new Map(
    Object.entries(표내용)
      .filter(([n]) => n.endsWith('.mjs'))
      .map(([n, p]) => [String(p).replace(/^.*\//, '').replace(/\.js$/, ''), n]),
  );
  let 번호 = 0;
  return src.replace(REQUIRE문, (전체, 묶음, 파일명) => {
    const 대상 = 있는mjs.get(파일명);
    /* ⚠ `die`(=process.exit) 가 아니라 **던진다.** exit 하는 가드는 회귀로 탐지력을 잴 수 없고
     *   (테스트 프로세스가 통째로 죽는다), 못 재는 가드는 다음 개정에서 조용히 죽는다.
     *   CLI 동작은 같다 — `main().catch(die)` 가 같은 문구로 받는다. */
    if (!대상) {
      throw new Error(`동봉 ${이름}: \`require('./${파일명}.js')\` 를 풀 수 없다 — 그 파일이 동봉 표에 없다.\n`
        + `       표에 "${파일명}.mjs": "lib/${파일명}.js" 를 더해라. 안 그러면 배포는 성공하고 함수가 import 에서 죽는다.`);
    }
    /* 🔴 **이름 있는 import 로 바꾸면 안 된다.** 껍데기가 내는 것은 `export default` 하나뿐이라
     *   `import { a } from './x.mjs'` 는 **import 시점에 SyntaxError** 로 죽는다 —
     *   배포는 성공하고 첫 호출에서 죽는 그 모양이다(2026-08-06 실측으로 잡았다).
     *   그래서 default 로 받아서 **원래의 구조분해를 그대로 둔다**. */
    const 임시 = `__동봉${번호 += 1}`;
    return `import ${임시} from './${대상}';\nconst ${묶음} = ${임시};`;
  });
}

function 동봉묶기(디렉터리) {
  const 표 = path.join(디렉터리, '동봉.json');
  if (!fs.existsSync(표)) return {};
  const 표내용 = JSON.parse(fs.readFileSync(표, 'utf8'));
  const out = {};
  for (const [이름, 저장소경로] of Object.entries(표내용)) {
    let src;
    try {
      src = require('child_process')
        .execFileSync('git', ['show', `HEAD:${저장소경로}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 << 20 });
    } catch {
      die(`동봉 실패 — HEAD 에 없는 경로: ${저장소경로}`);
    }
    const 작업본 = path.join(ROOT, 저장소경로);
    if (fs.existsSync(작업본) && fs.readFileSync(작업본, 'utf8').replace(/\r\n/g, '\n') !== src.replace(/\r\n/g, '\n')) {
      console.warn(`[원격배포] ⚠ ${저장소경로} — 작업본이 HEAD 와 다르다. **HEAD 를 묶는다**(미커밋 편집은 안 나간다)`);
    }
    if (!이름.endsWith('.mjs')) out[이름] = src;                    // 그대로
    else if (저장소경로.endsWith('.json')) out[이름] = `export default ${src};\n`;  // JSON → ESM
    // ⚠ `import` 는 호이스팅되므로 껍데기 뒤에 와도 된다 — 순서를 바꾸지 않는다(바꾸면 diff 가 커진다).
    else out[이름] = `const module = { exports: {} };\nconst exports = module.exports;\n${require풀기(src, 이름, 표내용)}\nexport default module.exports;\n`;
  }
  return out;
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
  for (const 상대 of 파일들(디렉터리)) {
    if (상대 === '동봉.json') continue;               // 명세지 코드가 아니다
    내용물[상대] = fs.readFileSync(path.join(디렉터리, 상대));
  }
  for (const [이름, src] of Object.entries(동봉묶기(디렉터리))) 내용물[이름] = Buffer.from(src, 'utf8');
  if (!내용물['index.ts']) die(`${slug}/index.ts 가 없다 — 진입점 이름은 index.ts 로 고정한다`);

  const 상대들 = Object.keys(내용물);
  if (!적용) {
    console.log(`[원격배포] 배포하지 않았다(읽기 모드). 나갈 파일 ${상대들.length}개:`);
    for (const r of 상대들) console.log(`   · ${slug}/${r}  ${내용물[r].length}B`);
    console.log(`\n라이브를 바꾸려면 유호님 승인 뒤: node tools/원격배포.js ${대상} --적용`);
    return;
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

module.exports = { 파일들, 동봉묶기 };
if (require.main === module) main().catch((err) => die(String(err && err.message || err)));
