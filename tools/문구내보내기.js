#!/usr/bin/env node
'use strict';
/**
 * 문구 내보내기 — 감수가 끝난 문장을 **파일까지** 낸다. 이 통로의 마지막 한 칸이다.
 *
 *   node tools/문구내보내기.js                          # 화면으로 요약 + 파일로 저장
 *   node tools/문구내보내기.js --어디 docs/감수결과.json
 *   node tools/문구내보내기.js --찍기                    # 파일 안 만들고 JSON 만 stdout 으로
 *
 * ■ 🔴 이것이 없으면 통로가 안 닫힌다
 *   결과가 DB 에만 남으면 마지막 한 칸이 사람 손이 된다 — 그것이 **슬랙 감수를 기각한 바로 그
 *   이유**다(결정.md 08-26 「수집은 엔진 도달까지 한 벌」). 여기까지 와야 한 벌이다.
 *
 * ■ 왜 Edge Fn(`GET /l10n/export`)을 안 부르고 DB 를 직접 읽나
 *   그 문은 **직원 로그인 세션**을 요구한다. CLI 에는 그 세션이 없다(합성 계정은 왕복시험만
 *   만든다). 그래서 **문은 둘**이다 — 세션이 있는 화면은 Edge Fn 으로, 세션이 없는 이 도구는
 *   Management API 로. 대신 **질의는 하나**다: `lib/문구감수.js 내보내기질의` 를 둘이 같이 쓴다.
 *   갈라 두면 「화면에는 있는데 파일엔 없다」가 생기고, 그건 조용하다.
 *
 * ■ 🔑 판정이 **셋 다** 실린다 — 「원문을 고쳐야 한다」까지
 *   그것을 빼면 파일만 보는 사람에게 그 문장이 «아직 감수 전»으로 보인다. 대신 `verdict` 를
 *   실어 갈래를 알리고, 그 줄의 산출물은 `final_mn` 이 아니라 `note`(우리 카피를 고칠 까닭)다.
 *
 * ■ ⚠ 학생 데이터가 한 칸도 안 실린다 — 이 표들엔 애초에 학생 식별자가 없다(스키마가 보장).
 *   그래서 이 파일은 밖으로 내보내도 되는 몇 안 되는 산출물이다.
 */
const fs = require('fs');
const path = require('path');

const API = 'https://api.supabase.com/v1/projects';
const ROOT = path.resolve(__dirname, '..');
const 자격증명 = require('../lib/자격증명.js');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');
const { 내보내기질의, VERDICT } = require('../lib/문구감수.js');

const 아는플래그 = [...공용플래그, '--어디', '--찍기'];
const 기본경로 = 'docs/문구감수_결과.json';

/* 🔑 이 도구가 보내는 SQL **전량**을 상수로 둔다 — `{질의읽기:true}` 약속의 소스 쪽 반쪽이다.
 *   `tests/문구반입.test.js` 가 이 표의 값을 하나씩 `자격증명.질의전용()` 에 넣어 본다
 *   (`tools/회차장부.js` 와 같은 규약). 질의를 함수 안에 숨기면 그 회귀가 원리상 못 본다. */
const 질의들 = Object.freeze({
  표있나: "select to_regclass('engine.l10n_strings') is not null as 있다",
  내보내기: 내보내기질의,
  분모: "select count(*)::int c, count(*) filter (where status = 'pending')::int p from engine.l10n_strings",
});

class 중단 extends Error {}
const die = (m) => { console.error('[문구내보내기] ' + m); process.exitCode = 1; throw new 중단(m); };

/** 판정별로 센다 — 합계만 내면 「무엇이 끝났나」를 못 읽는다(합계 = 갈래 + 갈래). */
function 갈래셈(행들) {
  const 셈 = Object.fromEntries(VERDICT.map((v) => [v, 0]));
  for (const r of 행들) if (r.verdict in 셈) 셈[r.verdict] += 1;
  return 셈;
}

async function main() {
  const args = process.argv.slice(2);
  const 플래그오류 = 인자게이트('문구내보내기', args, 아는플래그);
  if (플래그오류) die(플래그오류);

  const 찍기 = args.includes('--찍기');
  const i = args.indexOf('--어디');
  if (i !== -1 && !args[i + 1]) die('--어디 다음에 경로를 달라. 예: --어디 docs/감수결과.json');
  const 어디 = i !== -1 ? args[i + 1] : 기본경로;

  /* 🔴 이 실행은 **읽기다** — 과녁 게이트에 그대로 선언한다. 운영을 읽는 것은 사고가 아니지만
   *   **자기가 어디를 보는지 모르는 것**은 사고다(리허설 숫자를 운영이라 읽는 게 그것이다).
   *   `{질의읽기:true}` — Management API 의 질의 통로는 **읽기도 POST** 라 평범한 `읽기:true` 로는
   *   「읽기라면서 쓰기 경로가 있다」로 잡힌다(tests/자격증명.test.js). 이 선언이 그 자리의 정본이고,
   *   약속의 런타임 반쪽은 아래 `질의()` 첫 줄의 `질의전용()` 이다. */
  const e = 자격증명.읽기('문구내보내기', { 질의읽기: true });
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const M = { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' };

  const 질의 = async (q) => {
    자격증명.질의전용(q, '문구내보내기');   // 질의읽기 약속의 런타임 반쪽 — 어기면 여기서 던진다
    const r = await fetch(`${API}/${ref}/database/query`, { method: 'POST', headers: M, body: JSON.stringify({ query: q }) });
    const t = await r.text();
    if (!r.ok) throw new Error(`SQL HTTP ${r.status} — ${t.slice(0, 400)}`);
    return JSON.parse(t);
  };

  const pr = await fetch(`${API}/${ref}`, { headers: M });
  const 이름 = pr.ok ? (JSON.parse(await pr.text()).name || '(모름)') : '(이름을 못 읽었다)';
  if (!찍기) console.error(`[문구내보내기] 대상 ▸ ${이름}  (${ref})  읽기`);

  const 표있나 = (await 질의(질의들.표있나))[0];
  if (!표있나 || !표있나.있다) die('engine.l10n_strings 가 없다 — 마이그레이션이 아직 안 올라갔다.');

  const 행들 = await 질의(질의들.내보내기);
  /* 분모를 같이 낸다 — 「끝난 것 0」과 「아직 아무도 안 봤다」는 다른 사건이다(F207). */
  const 전체 = (await 질의(질의들.분모))[0];

  if (찍기) { console.log(JSON.stringify(행들, null, 2)); return; }

  const 셈 = 갈래셈(행들);
  console.log(`[문구내보내기] 끝난 것 ${행들.length} / 전체 ${전체.c}  (아직 감수 전 ${전체.p})`);
  for (const v of VERDICT) console.log(`   ${v.padEnd(18)} ${셈[v]}`);

  if (!행들.length) {
    console.log('\n[문구내보내기] 실을 것이 없다 — 파일을 만들지 않았다.');
    console.log('   ↳ 「아무도 안 봤다」인지 「다 봤는데 0」인지는 위 분모가 답한다.');
    return;
  }

  const 절대 = path.resolve(ROOT, 어디);
  fs.mkdirSync(path.dirname(절대), { recursive: true });
  /* 🔑 **덮어쓴다.** 사본을 늘리지 않는다(CLAUDE.md 「보존은 git 이 한다」) — 이 파일이 낡으면
   *   다음 사람이 어느 것이 현행인지 못 고른다. 이력이 필요하면 git 이 쥔다. */
  fs.writeFileSync(절대, JSON.stringify(행들, null, 2) + '\n', 'utf8');
  console.log(`\n[문구내보내기] ✅ ${path.relative(ROOT, 절대).replace(/\\/g, '/')} 에 ${행들.length}줄`);

  const 고칠것 = 행들.filter((r) => r.final_mn === null);
  if (고칠것.length) {
    console.log(`\n   🔴 «원문을 고쳐야 한다» ${고칠것.length}건 — 번역이 아니라 **우리 카피**를 고칠 자리다:`);
    for (const r of 고칠것.slice(0, 10)) console.log(`      ${r.string_id.padEnd(30)} ${String(r.note ?? '').slice(0, 60)}`);
    if (고칠것.length > 10) console.log(`      … 외 ${고칠것.length - 10}건`);
  }
}

module.exports = { 갈래셈, 기본경로, 질의들 };
if (require.main === module) {
  main().catch((err) => {
    if (err instanceof 중단) return;
    console.error('[문구내보내기] ' + String((err && err.message) || err));
    process.exitCode = 1;
  });
}
