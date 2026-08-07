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
 *   `원격배포.js` 의 `동봉묶기` 로 「지금 소스로 배포하면 나갈 내용」을 만든다 — 배포가 쓰는
 *   **바로 그 함수**다. 여기서 다시 조립하면 그게 또 두 벌이고, 갈라지는 날 이 도구가 거짓말을 한다.
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
 *   node tools/배포대조.js              배포된 함수 전부
 *   node tools/배포대조.js tasks        하나만
 *   node tools/배포대조.js --진단 tasks 본문이 어떤 형식으로 오는지만 본다
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const 자격증명 = require('../lib/자격증명.js');
const { 동봉묶기 } = require('./원격배포.js');   // 🔑 조립은 배포와 같은 함수에서

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

/** 함수 묶음을 원격 배포본과 대조한다 — 판정만 하고 **말하지 않는다**(문장은 부르는 쪽 몫).
 * `가져오기` 는 회귀가 네트워크 없이 재는 구멍 — 소스 문구 검사는 도달 불가를 못 보므로
 * 판정을 주입형으로 뽑아 실제로 돌려서 잰다(F196 계열 교훈).
 * 네트워크 실패도 「미측정」이다 — 못 쟀으면 못 쟀다고 한다(머리말 그대로).
 * @returns {Promise<Array<{slug:string, 상태:'같다'|'다르다'|'미측정', 상세:string}>>} */
async function 대조(ref, 토큰, 목록 = 함수들(), 가져오기 = fetch) {
  const 헤더 = { Authorization: `Bearer ${토큰}` };
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
    /* 동봉묶기 = { 파일명: 내용 } — index.ts 와 `.mjs` 로 실린 lib 들이 함께 온다.
     * 그래서 이 대조는 **lib 이 옛 판인 채 배포된 자리**도 잡는다(그게 실제로 새던 층이다). */
    const 나갈것 = 동봉묶기(디렉터리);
    const 빠진것 = Object.entries(나갈것)
      .filter(([, 내용]) => !배포본.includes(정규(내용)))
      .map(([이름]) => 이름);
    if (빠진것.length) 결과.push({ slug, 상태: '다르다', 상세: `배포본에 없는 판: ${빠진것.join(', ')}` });
    else 결과.push({ slug, 상태: '같다', 상세: `파일 ${Object.keys(나갈것).length}` });
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

async function main() {
  const args = process.argv.slice(2);
  const 진단 = args.includes('--진단');
  const 고른것 = args.find((a) => !a.startsWith('--'));

  const e = 자격증명.읽기('배포대조');
  const ref = e.SUPABASE_PROJECT_REF;
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  if (!ref || !토큰) die('.env 에 SUPABASE_PROJECT_REF·SUPABASE_ACCESS_TOKEN 이 필요하다');
  const 헤더 = { Authorization: `Bearer ${토큰}` };

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
module.exports = { 정규, 펴기, 평평하게, 함수들, 대조, 게이트판정, 왕복전게이트 };
