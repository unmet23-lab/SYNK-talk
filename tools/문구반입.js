#!/usr/bin/env node
'use strict';
/**
 * 문구 반입 — `contents/문구_1차.js` 의 문장을 `engine.l10n_strings` 로 올린다.
 *
 *   node tools/문구반입.js                      # 미리보기 — 아무것도 안 바꾼다
 *   node tools/문구반입.js --적용
 *   node tools/문구반입.js --적용 --원문갱신     # 원문이 바뀐 줄까지 덮는다(감수가 다시 열린다)
 *   node tools/문구반입.js --찍기                # SQL 만 stdout 으로 (원격SQL 로 넘길 때)
 *
 * ■ 왜 미리보기가 기본인가 — `tools/원격SQL.js`·`tools/명부등록.js` 와 같은 규칙이다.
 *   남의 프로젝트 상태를 바꾼다. **애매하면 안 나간다.**
 *
 * ■ 🔴 이 도구의 진짜 일 = 「무엇을 **안** 건드리나」를 정확히 말하는 것
 *   같은 목록을 두 번 부어도 아무 일이 없어야 한다(멱등). 그리고 **원문이 바뀐 줄**은
 *   승인 없이 안 덮는다 — 덮으면 이미 끝난 감수가 조용히 낡고, 그 문장은 여전히 `verified`
 *   라서 내보내기 파일에 실려 앱까지 간다. 판정은 전부 `lib/문구반입규칙.js`(순수)에 있고
 *   `tests/문구반입.test.js` 가 문다.
 *
 * ■ ⚠ 이 도구는 표를 만들지 않는다 — 마이그레이션(`20260826130000_l10n_c13.sql`)이 먼저 서야 한다.
 *   안 서 있으면 여기서 「표가 없다」로 죽는다(조용히 만들면 스키마 통로가 둘이 된다).
 */
const path = require('path');

const API = 'https://api.supabase.com/v1/projects';
const 자격증명 = require('../lib/자격증명.js');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');
const { ID꼴 } = require('../lib/문구감수.js');
const 규칙 = require('../lib/문구반입규칙.js');
const { 문구_1차, 반입칸 } = require('../contents/문구_1차.js');

const 아는플래그 = [...공용플래그, '--적용', '--원문갱신', '--찍기'];

/* `process.exit()` 를 안 부른다 — fetch 소켓이 닫히는 중에 부르면 종료코드가 127 로 나가
 * 정상적인 거절이 「설치 사고」로 읽힌다(`tools/명부등록.js` 머리말 · 08-07 실측). */
class 중단 extends Error {}
const die = (m) => { console.error('[문구반입] ' + m); process.exitCode = 1; throw new 중단(m); };

/**
 * 사람에게 하는 말은 **전부 여기를 지난다**.
 *
 * 🔴 `--찍기` 는 stdout 을 SQL «만» 쓰라고 비워 둔다 — `node tools/문구반입.js --찍기 > x.sql` 이
 *   그 통로다. 사람글이 한 글자라도 섞이면 그 .sql 은 못 돈다(`tools/원격SQL.js` 가 먹는 파일이다).
 *   같은 규율이 이 저장소의 `--json` 통로에도 서 있다(형제 도구 회귀가 그것을 문다).
 *   ⚠ 숨기는 게 아니라 **통로를 가르는 것**이다 — 화면에는 그대로 보인다(stderr 도 터미널이다).
 */
let 사람통로 = console.log;
const 말하기 = (줄) => 사람통로(줄);

/** 갈래 하나를 사람이 읽게 찍는다. 분모 없이 숫자만 내면 「좋은 0」과 「안 재봤다」가 같아진다. */
function 갈래찍기(제목, 줄들, 상세) {
  말하기(`  ${제목}  ${줄들.length}건`);
  if (!상세 || !줄들.length) return;
  for (const v of 줄들.slice(0, 상세)) {
    const 글 = String(v.source_ko ?? '').replace(/\n/g, ' ⏎ ');
    말하기(`      ${v.string_id.padEnd(30)} ${글.slice(0, 46)}`);
    if (v.옛원문 !== undefined) {
      말하기(`      ${' '.repeat(30)} 🔴 옛 원문: ${String(v.옛원문).replace(/\n/g, ' ⏎ ').slice(0, 46)}`
        + `  (지금 상태: ${v.옛상태 ?? '?'})`);
    }
  }
  if (줄들.length > 상세) 말하기(`      … 외 ${줄들.length - 상세}건`);
}

async function main() {
  const args = process.argv.slice(2);
  const 플래그오류 = 인자게이트('문구반입', args, 아는플래그);
  if (플래그오류) die(플래그오류);

  const 적용 = args.includes('--적용');
  const 원문갱신 = args.includes('--원문갱신');
  const 찍기 = args.includes('--찍기');
  /* stdout 은 SQL 의 자리다 — 사람글을 stderr 로 옮긴다(위 `말하기` 머리말). */
  if (찍기) 사람통로 = console.error;

  /* ── ① 목록을 먼저 검사한다 — 네트워크보다 앞이다 ─────────────────────────
   * 🔑 DB 가 거절할 것을 여기서 먼저 거절한다. 안 그러면 절반이 들어간 뒤 죽고, 그 상태는
   *   다음 실행의 대조를 거짓말로 만든다(트랜잭션이 막아 주지만, 사람이 원인을 못 읽는다). */
  const 나쁜id = 문구_1차.filter((e) => !ID꼴.test(e.string_id)).map((e) => e.string_id);
  if (나쁜id.length) die(`string_id 가 DB CHECK 를 못 지난다: ${나쁜id.join(', ')}`);
  if (반입칸.join() !== 규칙.칸.join()) {
    die(`반입칸이 갈라졌다 — 목록(${반입칸.join()}) ≠ 규칙(${규칙.칸.join()}). 둘 중 하나가 낡았다.`);
  }

  말하기(`[문구반입] 목록 ${문구_1차.length}줄 (contents/문구_1차.js)`);

  /* ── ② 과녁 ────────────────────────────────────────────────────────────
   * 🔴 `--적용` 이 없으면 **읽기**다 — 그 사실을 과녁 게이트에 그대로 넘긴다(사본 금지). */
  const e = 자격증명.읽기('문구반입', { 읽기: !적용 });
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const M = { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' };

  const 질의 = async (q) => {
    const r = await fetch(`${API}/${ref}/database/query`, { method: 'POST', headers: M, body: JSON.stringify({ query: q }) });
    const t = await r.text();
    if (!r.ok) throw new Error(`SQL HTTP ${r.status} — ${t.slice(0, 400)}`);
    return JSON.parse(t);
  };

  /* 🔴 대상부터 소리 내어 읽는다 — 리허설과 운영을 가르는 유일한 값이 .env 한 줄이다. */
  const pr = await fetch(`${API}/${ref}`, { headers: M });
  const 이름 = pr.ok ? (JSON.parse(await pr.text()).name || '(모름)') : '(이름을 못 읽었다)';
  말하기(`[문구반입] 대상 ▸ ${이름}  (${ref})${적용 ? '  ⚠ 쓰기(--적용)' : '  읽기(미리보기)'}\n`);

  /* ── ③ 지금 DB 상태 ────────────────────────────────────────────────── */
  const 표있나 = (await 질의("select to_regclass('engine.l10n_strings') is not null as 있다"))[0];
  if (!표있나 || !표있나.있다) {
    die('engine.l10n_strings 가 없다 — 마이그레이션이 아직 안 올라갔다.\n'
      + `     먼저: node tools/원격SQL.js supabase/migrations/20260826130000_l10n_c13.sql --적용`);
  }
  const 현재 = await 질의('select string_id, source_ko, draft_mn, context, max_len, status from engine.l10n_strings');

  const 판 = 규칙.대조(문구_1차, 현재);
  말하기(`  DB 에 지금 ${현재.length}줄`);
  갈래찍기('① 새것        ', 판.새것, 3);
  갈래찍기('② 그대로      ', 판.그대로, 0);
  갈래찍기('③ 곁가지바뀜  ', 판.곁가지바뀜, 5);
  갈래찍기('④ 🔴 원문바뀜 ', 판.원문바뀜, 20);

  /* 목록에서 사라진 줄 — **지우지 않는다.** 감수 이력이 붙어 있을 수 있고(append-only),
   * 자동 삭제는 되돌릴 수 없다. 세어서 보여 주기만 한다(사람이 정할 자리). */
  const 목록id = new Set(문구_1차.map((x) => x.string_id));
  const 사라진것 = 현재.filter((r) => !목록id.has(r.string_id));
  if (사라진것.length) {
    말하기(`  ⚠ DB 에만 있고 목록엔 없는 줄 ${사라진것.length}건 — **안 지운다**(감수 이력이 붙어 있을 수 있다)`);
    말하기(`      ${사라진것.slice(0, 8).map((r) => r.string_id).join(' · ')}`);
  }

  const sql = 규칙.SQL(판, 원문갱신);
  if (찍기) { if (sql) console.log('\n' + sql); else console.error('[문구반입] 할 일이 없다 — 찍을 SQL 도 없다.'); return; }

  const 막힘 = 규칙.막힘(판, 원문갱신);
  if (막힘) die(막힘);

  const 할일 = 규칙.할일수(판, 원문갱신);
  if (!할일) { 말하기('\n[문구반입] 할 일 0건 — DB 가 목록과 같다.'); return; }

  if (!적용) {
    말하기(`\n[문구반입] 미리보기다 — 아무것도 안 바꿨다. 붓기: node tools/문구반입.js --적용`
      + (원문갱신 ? ' --원문갱신' : ''));
    return;
  }

  await 질의(sql);
  말하기(`\n[문구반입] ✅ ${할일}건 반영했다`
    + (원문갱신 && 판.원문바뀜.length ? ` (그중 ${판.원문바뀜.length}건은 원문이 바뀌어 상태가 pending 으로 돌아갔다)` : ''));
  말하기(`   ↳ 감수 대기 확인: select count(*) from engine.l10n_queue;`);
}

module.exports = { 갈래찍기 };
if (require.main === module) {
  /* `die` 가 던진 것은 이미 화면에 찍혔고 종료코드도 섰다 — 다시 던지면 **처리되지 않은 거절**이
     되어 정상적인 거절이 스택트레이스로 나간다(사람은 그걸 도구 고장으로 읽는다). */
  main().catch((err) => {
    if (err instanceof 중단) return;
    console.error('[문구반입] ' + String((err && err.message) || err));
    process.exitCode = 1;
  });
}
