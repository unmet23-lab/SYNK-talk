#!/usr/bin/env node
/* 배포대조 — 지금 배포된 Edge Function 이 **지금 소스와 같은가**.
 *
 * ■ 왜 있나 (2026-08-07)
 *   `원격배포.js --목록` 은 version·updated_at 만 준다. 그런데 배포는 커밋이 아니라 **작업본**을
 *   올리므로 「커밋 시각 > 배포 시각」이 곧 「안 담겼다」가 아니다 — 시각은 원리적으로 간접 증거고,
 *   같은 이유로 「배포 시각이 더 나중」도 담겼다는 증거가 아니다(그 사이 작업본이 또 바뀐다).
 *   그날 트랙 여럿이 「리허설 초록」이라 적고 닫혔는데, 그 초록이 **무슨 판**을 잰 것인지 확인할
 *   통로가 이 저장소에 하나도 없었다. 루트 Apps Script 에는 `tools/라이브대조` 가 이미 있다.
 *
 * ■ 무엇을 재나
 *   `원격배포.js` 의 `배포묶음` 으로 「지금 소스로 배포하면 나갈 내용」을 만든다 — 배포가 쓰는
 *   **바로 그 함수**다. 여기서 다시 조립하면 그게 또 두 벌이고, 갈라지는 날 이 도구가 거짓말을 한다.
 *   🔴 2026-08-09(**F274**) 까지 이 자리는 `동봉묶기` 였다 — 배포는 본체+동봉을 보내는데 대조는
 *   **동봉만** 봤다. 「같은 함수를 쓴다」는 이 문단이 그대로 적혀 있는 채로 **반쪽 함수**를 썼고,
 *   그래서 몽골어 해설이 빠진 옛 `corrections` 가 「✅ 같다(파일 1)」로 통과했다.
 *   원격은 Management API 의 함수 본문. 둘을 파일 단위로 맞춘다.
 *
 * ■ 못 쟀으면 못 쟀다고 한다
 *   본문 형식이 예상과 다르면 「같다」가 아니라 **미측정**으로 끝내고 종료코드를 가른다.
 *   통과와 미실행이 같은 모양이면 이 도구는 있으나 마나다(CLAUDE.md 신뢰성).
 *
 * ■ 읽기 전용
 *   GET 만 친다. 배포·삭제 경로는 여기 없다 — 그건 `원격배포.js` 몫이다.
 *
 * 사용:
 *   node tools/배포대조.js              배포된 함수 전부 (과녁 = `.env` 의 SUPABASE_PROJECT_REF)
 *   node tools/배포대조.js tasks        하나만
 *   node tools/배포대조.js --진단 tasks 본문이 어떤 형식으로 오는지만 본다
 *   node tools/배포대조.js --운영       과녁을 **운영**(Synk Core)으로 갈아탄다 — 읽기만 (F400)
 *
 * ⚠ 모르는 `--` 플래그는 **거절한다**. 조용히 무시하던 판이 F400 을 냈다(아래 `아는플래그`).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const 자격증명 = require('../lib/자격증명.js');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)
const { 배포묶음, 마지막커밋 } = require('./원격배포.js');   // 🔑 조립은 배포와 같은 함수에서

const API = 'https://api.supabase.com/v1/projects';
const FN뿌리 = path.join(__dirname, '..', 'supabase', 'functions');
const die = (msg) => { console.error('[배포대조] ' + msg); process.exit(1); };

/** 배포 대상이 되는 함수 디렉터리 이름들 — `index.ts` 가 있는 것만. */
const 함수들 = () => fs.readdirSync(FN뿌리)
  .filter((n) => fs.existsSync(path.join(FN뿌리, n, 'index.ts')));

/* 양쪽을 **같은 자로** 편다. 여기가 이 도구에서 제일 잘 틀리는 자리다:
 *   ① 인코딩 — eszip 은 바이너리지만 소스 조각은 UTF-8 이다. `latin1` 로 읽으면 한글이 바이트로
 *      흩어져 로컬 문자열과 영영 안 맞는다. 그런데 증상은 **「다르다」**라, 도구가 자기 버그를
 *      격차로 보고한다(실측 1회 — `.mjs` 셋이 그렇게 거짓 적색이 났다).
 *   ② 공백 — 한쪽만 정규화하면 같은 파일이 안 맞는다. 그래서 두 함수가 아니라 **한 함수**를 쓴다. */
const 평평하게 = (s) => s.replace(/\s+/g, ' ');

/** 본문 응답을 텍스트로 편다 — eszip 이든 평문이든 **소스 문자열이 보이는 형태**까지만. */
function 펴기(buf) {
  const 후보 = [buf];
  // gzip(1f 8b)이면 풀어서 함께 본다. 실패는 조용히 넘긴다(형식이 아닐 뿐이다).
  try { if (buf[0] === 0x1f && buf[1] === 0x8b) 후보.push(zlib.gunzipSync(buf)); } catch { /* 아님 */ }
  return 평평하게(후보.map((b) => b.toString('utf8')).join('\n'));
}

/* 대조의 단위는 **파일 하나**이고, 재는 것은 그 파일 **전체**다.
 *
 * 🔴 첫 판은 「마지막 160자」를 지문으로 썼는데 그게 거짓 초록을 냈다(실측): `deliver/index.ts` 는
 *   `ac3f646`(날짜 경계)이 **파일 중간**을 고친 판인데, 끝 160자가 그대로라 옛 판이 배포돼 있는데도
 *   ✅로 나왔다. 수리 커밋이 파일 끝을 건드릴 이유는 없으므로 이 표본추출은 **가장 흔한 변경을
 *   가장 잘 놓친다.** 전체 비교는 350KB 안에서 20KB 를 찾는 일이라 값도 싸다.
 * 🚫 부분 일치로 「거의 같다」를 만들지 않는다 — 이 도구의 답은 같다/다르다/못 쟀다 셋뿐이다. */
const 정규 = (내용) => 평평하게(내용).trim();

/* 바이트로 잴 수 있는 파일과 없는 파일 — 이 경계가 이 도구의 해상도다.
 *
 * 🔴 2026-08-09 실측: 배포본에 담기는 것은 **`index.ts` 의 소스가 아니라 변환판**이다.
 *   `catch (e) { ... (e as Error) }` 가 배포본에 없고, Node 24 `module.stripTypeScriptTypes`
 *   로 타입만 벗겨 맞춰 봐도 안 맞는다(7종 전부 ❌). 주석·한글 산문은 그대로 살아 있으니
 *   「없다」가 아니라 **다시 찍힌다**. `.mjs` 로 실린 동봉은 이미 JS 라 바이트 그대로 남는다.
 * 🔑 그래서 본체를 바이트로 대조하면 **모든 함수가 영원히 적색**이 된다 — 그 가드는 하루 만에
 *   꺼진다(F103). 잴 수 없는 것을 「같다」로도 「다르다」로도 부르지 않는다. */
const 바이트로잴수있나 = (이름) => !/\.tsx?$/.test(이름);

/** 배포본이 그 커밋을 **담을 수 없는** 시각인가 — 한 방향으로만 참인 증명이다.
 *
 * F273 이후 배포가 보내는 것은 언제나 **HEAD** 다. 그러니 「나갈 파일들의 마지막 커밋이 배포보다
 * 나중」이면 그 배포본에 그 커밋은 **원리상 없다**. 반대(배포가 나중)는 아무것도 증명하지 않는다
 * — 그 사이 또 커밋될 수 있으니까. 그래서 이 축은 「다르다」만 만들고 「같다」는 안 만든다.
 * 🔑 이 도구 머리말이 시각을 「간접 증거」라고 물린 것은 **작업본을 밀던 시절**의 판단이다.
 *   본체를 못 재는 지금, 한 방향만 참인 증명이 그 자리에 남은 유일한 실측이다(F274).
 * ⚠ `여유초` = 시계 어긋남 흡수. 실측한 가장 좁은 간격이 14초(events)라 60초면 넉넉하고,
 *   이 축이 늦게 우는 쪽으로만 틀린다(거짓 적색이 거짓 초록보다 여기선 더 비싸다). */
function 시각뒤처짐(배포ISO, 커밋ISO, 여유초 = 60) {
  if (!배포ISO || !커밋ISO) return false;          // 못 읽은 것은 이 축의 판정이 아니다
  const [a, b] = [new Date(커밋ISO).getTime(), new Date(배포ISO).getTime()];
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a > b + 여유초 * 1000;
}

/** 배포된 함수들의 `updated_at` — 못 읽으면 빈 표(시각 축이 조용히 빠질 뿐 판정을 뒤집지 않는다). */
async function 배포시각들(ref, 토큰, 가져오기) {
  try {
    const res = await 가져오기(`${API}/${ref}/functions`, { headers: { Authorization: `Bearer ${토큰}` } });
    if (!res.ok) return {};
    const fns = JSON.parse(Buffer.from(await res.arrayBuffer()).toString('utf8'));
    if (!Array.isArray(fns)) return {};
    return Object.fromEntries(fns.map((f) => [f.slug, f.updated_at]));
  } catch { return {}; }
}

/** 함수 묶음을 원격 배포본과 대조한다 — 판정만 하고 **말하지 않는다**(문장은 부르는 쪽 몫).
 * `가져오기` 는 회귀가 네트워크 없이 재는 구멍 — 소스 문구 검사는 도달 불가를 못 보므로
 * 판정을 주입형으로 뽑아 실제로 돌려서 잰다(F196 계열 교훈).
 * 네트워크 실패도 「미측정」이다 — 못 쟀으면 못 쟀다고 한다(머리말 그대로).
 * @returns {Promise<Array<{slug:string, 상태:'같다'|'다르다'|'미측정', 상세:string}>>} */
async function 대조(ref, 토큰, 목록 = 함수들(), 가져오기 = fetch) {
  const 헤더 = { Authorization: `Bearer ${토큰}` };
  const 배포시각 = await 배포시각들(ref, 토큰, 가져오기);
  const 결과 = [];
  for (const slug of 목록) {
    const 디렉터리 = path.join(FN뿌리, slug);
    if (!fs.existsSync(디렉터리)) { 결과.push({ slug, 상태: '미측정', 상세: '로컬에 없다' }); continue; }
    let res;
    try {
      res = await 가져오기(`${API}/${ref}/functions/${encodeURIComponent(slug)}/body`, { headers: 헤더 });
    } catch (err) {
      결과.push({ slug, 상태: '미측정', 상세: String((err && err.message) || err) }); continue;
    }
    if (!res.ok) { 결과.push({ slug, 상태: '미측정', 상세: `본문 HTTP ${res.status}` }); continue; }
    const 배포본 = 펴기(Buffer.from(await res.arrayBuffer()));
    /* 배포묶음 = { 파일명: 내용 } — **본체(index.ts)** 와 `.mjs` 로 실린 lib 이 함께 온다.
     * 🔴 2026-08-09 까지 여기가 `동봉묶기` 였다(F274) — 동봉 lib 만 재고 본체는 한 번도 안 봤다.
     *   리허설 `corrections` 가 몽골어 해설 없는 옛 판인데 「✅ 같다(파일 1)」로 통과했다.
     * 🔑 미커밋검사는 끈다 — 여긴 읽기 도구이자 남의 왕복시험의 발화점이라, 남의 작업본 하나로
     *   죽으면 우회가 정상 통로가 된다(F073·F103). 나가는 것은 어차피 HEAD 다. */
    let 나갈것;
    try { 나갈것 = 배포묶음(디렉터리, () => {}); }
    catch (err) { 결과.push({ slug, 상태: '미측정', 상세: `나갈 것을 못 모았다 — ${String((err && err.message) || err).split('\n')[0]}` }); continue; }
    const 이름들 = Object.keys(나갈것);
    const 잰것 = 이름들.filter(바이트로잴수있나);
    const 못잰것 = 이름들.filter((n) => !바이트로잴수있나(n));
    const 빠진것 = 잰것.filter((이름) => !배포본.includes(정규(나갈것[이름])));
    /* 🔑 초록은 **분모와 함께만** 읽는다(F207) — 「파일 n」만 적으면 본체를 안 잰 것이
     *   「n개 다 맞다」로 읽힌다. 그게 F274 가 두 날 동안 조용했던 이유다. */
    const 분모 = `바이트 ${잰것.length - 빠진것.length}/${잰것.length}`
      + (못잰것.length ? ` · 본체(${못잰것.join(', ')})는 배포 시 변환돼 시각으로만 잰다` : '');
    if (빠진것.length) 결과.push({ slug, 상태: '다르다', 상세: `배포본에 없는 판: ${빠진것.join(', ')} · ${분모}` });
    else if (시각뒤처짐(배포시각[slug], 마지막커밋(디렉터리))) {
      // updated_at 은 epoch ms 로 온다 — 그대로 찍으면 사람이 커밋 시각과 대조할 수 없다.
      const 때 = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toISOString(); };
      결과.push({
        slug,
        상태: '다르다',
        상세: `배포(${때(배포시각[slug])})가 마지막 커밋(${때(마지막커밋(디렉터리))})보다 이르다`
          + ` — 그 배포본은 지금 본체를 담을 수 없다 · ${분모}`,
      });
    } else 결과.push({ slug, 상태: '같다', 상세: 분모 });
  }
  return 결과;
}

/** 게이트 판정 — 순수 함수(회귀가 네트워크 없이 선다). 죽이는 것은 「다르다」뿐이다:
 * 미측정으로도 막으면 관리 API 플레이크가 왕복까지 막아 우회가 정상 통로가 된다(F103). */
function 게이트판정(결과) {
  const 다름 = 결과.filter((r) => r.상태 === '다르다');
  const 못잼 = 결과.filter((r) => r.상태 === '미측정');
  return {
    행동: 다름.length ? '차단' : (못잼.length ? '경고' : '통과'),
    다름, 못잼,
    처방: 다름.map((r) => `node tools/원격배포.js supabase/functions/${r.slug} --적용`),
  };
}

/** 왕복시험 계열의 **발화점** — 리허설 게이트 통과 직후, 첫 왕복 전에 부른다.
 * 배포판 ≠ 소스(HEAD)면 그 왕복의 초록은 **다른 판**을 잰 것이다 — 2026-08-07 트랙 여럿이
 * 「리허설 초록」을 적는 동안 그걸 확인할 통로가 0이었다. 도구를 세워도 스스로 안 울면
 * 같은 날이 반복되므로, 여기서 왕복마다 자동으로 운다. 통과도 한 줄을 남긴다 —
 * 보고가 「배포판=소스 확인됨」을 인용할 자리고, 조용한 통과는 미실행과 같은 모양이다. */
async function 왕복전게이트(도구, e, opt = {}) {
  const ref = e && e.SUPABASE_PROJECT_REF, 토큰 = e && e.SUPABASE_ACCESS_TOKEN;
  const 나가기 = opt.나가기 || process.exit;
  if (!ref || !토큰) {   // 기존 5종은 이 앞에서 이미 죽는다 — 새 호출자를 위한 정직한 폴백
    console.error(`[${도구}] ⚠ 배포판 대조를 못 한다(REF·ACCESS_TOKEN 없음) — 배포판=소스 미확인인 채 돈다`);
    return;
  }
  const 결과 = await 대조(ref, 토큰, opt.목록, opt.가져오기);
  const 판정 = 게이트판정(결과);
  if (판정.행동 === '차단') {
    console.error(`[${도구}] ⛔ 배포판 ≠ 소스 — 이대로 돌면 초록이 **옛 판**을 잰 것이 된다`);
    for (const r of 판정.다름) console.error(`   · ${r.slug}  ${r.상세}`);
    console.error(`   재배포 뒤 다시 (지금 ref 그대로 · PowerShell 은 $env:SUPABASE_PROJECT_REF='${ref}'; 로):`);
    for (const 줄 of 판정.처방) console.error(`     SUPABASE_PROJECT_REF=${ref} ${줄}`);
    return 나가기(1);
  }
  for (const r of 판정.못잼) {
    console.error(`[${도구}] ⚠ ${r.slug} 배포판 대조 미측정(${r.상세}) — 그 함수는 배포판=소스 확인 없이 돈다`);
  }
  console.log(`[${도구}] 배포판=소스 ✅ ${결과.length - 판정.못잼.length}/${결과.length}함수` +
    (판정.못잼.length ? ` (미측정 ${판정.못잼.length})` : ''));
}

/* 아는 플래그 — 여기 없는 `--` 인자는 오타이거나 **다른 도구의 낱말**이다.
 *
 * 🔴 F400(2026-08-13 실측): `--운영` 은 이 도구가 한 번도 안 읽던 낱말인데 오류 없이 무시됐고,
 *   `.env` 의 리허설을 **다시 재서** 「다름 0」 초록을 냈다. 같은 14함수 초록을 두 번 받은
 *   사람이 「운영도 최신」으로 읽었다 — 헤더의 `대상 ▸ synk-core-rehearsal` 을 다시 읽어서야
 *   갈렸다. **새는 방향이 통과**다(CLAUDE.md 가드 맹점 ③).
 *   그래서 처방이 둘이다: 모르는 플래그는 die 하고, `--운영` 은 **실제 운영 과녁으로 잇는다**.
 *   잇는 쪽이 안전한 근거 = 이 파일은 GET 만 친다(파일 머리 「읽기 전용」 절). 쓰기 갈래가
 *   생기는 순간 `tests/자격증명.test.js` 가 소스로 잡는다. */
/* ⚠ 2026-08-14: 이 목록과 걸러내는 줄이 **이 파일에만** 있던 동안, 같은 낱말을 받는 형제 열이
 *   모르는 낱말을 조용히 흘렸다(F435 · 실측 11 중 die 하는 것 1). 판정은 `lib/플래그.js` 로
 *   올렸고 여기 남는 것은 **이 도구의 낱말**뿐이다 — 목록은 도구 것, 판정은 공용. */
const 아는플래그 = [...공용플래그, '--진단'];

/** 인자 + `.env` → 과녁. **순수 함수**다 — 자격증명·네트워크 없이 회귀가 여기를 문다(F296:
 *  repo 밖 환경에 기대는 검사는 CI 에서 깨진다. 탐지력은 이 함수가 진다). */
function 인자판정(args, env) {
  const 준것 = args || [];
  const 오류 = 인자게이트('배포대조', 준것, 아는플래그);
  if (오류) return { 오류 };
  const 운영 = 준것.includes('--운영');
  return {
    진단: 준것.includes('--진단'),
    운영,
    /* `--운영` 이 곧 자격증명의 과녁 승인 키다(lib/자격증명.js 과녁판정) — 그 키를 명시적으로
     * 친 것이 「한 손 더」이므로, 여기서 REF 를 갈아타는 것은 게이트 우회가 아니라 그 키의 뜻을
     * 실현하는 것이다. 키가 없으면 `.env` 가 정한 과녁 그대로다. */
    ref: 운영 ? 자격증명.운영REF : (env || {}).SUPABASE_PROJECT_REF,
    고른것: 준것.find((a) => !a.startsWith('--')),
  };
}

async function main() {
  const args = process.argv.slice(2);

  /* **GET 만 친다**(이 파일 머리) — 그래서 운영을 **읽는** 것은 과녁이 막지 않는다.
   * 배포·삭제는 `원격배포.js` 몫이다. 이 선언이 거짓이 되는 순간(여기에 쓰기 경로가 생기는
   * 순간)은 사람 눈에 안 보이므로 `tests/자격증명.test.js` 가 소스로 못박는다. */
  const e = 자격증명.읽기('배포대조', { 읽기: true });
  const 과녁 = 인자판정(args, e);
  if (과녁.오류) die(과녁.오류);
  const { 진단, ref, 고른것 } = 과녁;
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  if (!ref || !토큰) die('.env 에 SUPABASE_PROJECT_REF·SUPABASE_ACCESS_TOKEN 이 필요하다');
  const 헤더 = { Authorization: `Bearer ${토큰}` };
  /* 갈아탄 사실 자체는 **공용 통로가 말한다**(`lib/자격증명.js 읽기()` · F436 으로 조준이 거기로
   * 올라갔다). 여기서 같은 말을 또 하면 판정이 두 곳에 적히고, 한쪽만 고쳐지는 날 갈라진다.
   * 이 줄이 더하는 것은 **이 도구만 아는 것** 하나 — 갈아타도 GET 만 친다는 것이다. */
  if (과녁.운영) console.error('[배포대조] ⚠ 갈아탄 과녁이지만 «읽기»다 — GET 만 친다.');

  // 대상이 리허설인지 운영인지 **이름으로** 알린다(원격배포.js 와 같은 이유 — 환경변수 하나로 조용히 바뀐다).
  try {
    const r = await fetch(`${API}/${ref}`, { headers: 헤더 });
    if (r.ok) console.error(`[배포대조] 대상 ▸ ${JSON.parse(await r.text()).name}  (${ref})`);
  } catch { /* 알림이지 가드가 아니다 */ }

  const 목록 = 고른것 ? [고른것] : 함수들();

  if (진단) {
    for (const slug of 목록) {
      const res = await fetch(`${API}/${ref}/functions/${encodeURIComponent(slug)}/body`, { headers: 헤더 });
      if (!res.ok) { console.log(`· ${slug}  ⚠ 미측정 — 본문 HTTP ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      console.log(`\n▸ ${slug}  ${buf.length}B  ct=${res.headers.get('content-type')}`);
      console.log('  앞 16바이트:', buf.slice(0, 16).toString('hex'));
      console.log('  ' + 펴기(buf).slice(0, 400).replace(/[^\x20-\x7E]/g, '·'));
    }
    return;
  }

  const 결과 = await 대조(ref, 토큰, 목록);
  for (const r of 결과) {
    if (r.상태 === '같다') console.log(`· ${r.slug}  ✅ 같다  (${r.상세})`);
    else if (r.상태 === '다르다') console.log(`· ${r.slug}  🔴 다르다 — ${r.상세}`);
    else console.log(`· ${r.slug}  ⚠ 미측정 — ${r.상세}`);
  }
  const 다름 = 결과.filter((r) => r.상태 === '다르다').length;
  const 못잼 = 결과.filter((r) => r.상태 === '미측정').length;
  console.log(`\n[배포대조] 다름 ${다름} · 미측정 ${못잼} · 전체 ${목록.length}`);
  /* 종료코드를 셋으로 가른다 — 「같다」와 「못 쟀다」가 같은 값이면 CI·훅이 둘을 구별 못 한다. */
  if (다름) process.exitCode = 1;
  else if (못잼) process.exitCode = 2;
}

if (require.main === module) main().catch((err) => die(String((err && err.message) || err)));
module.exports = { 정규, 펴기, 평평하게, 함수들, 대조, 게이트판정, 왕복전게이트, 시각뒤처짐, 바이트로잴수있나, 인자판정, 아는플래그 };
