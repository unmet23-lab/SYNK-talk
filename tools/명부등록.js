#!/usr/bin/env node
'use strict';
/**
 * 명부 등록 — 상담에서 받은 학생을 `engine.learners` 에 올린다 (L0 §4-1·§4-1-1)
 *
 *   node tools/명부등록.js SYNK-001 --전화 "9911-2233"                    # 미리보기 — 아무것도 안 만든다
 *   node tools/명부등록.js SYNK-001 --전화 "9911-2233" --적용
 *   node tools/명부등록.js SYNK-001 --전화 "9911-2233" --이름 "밧자" --적용
 *
 * ⛔ **계정을 만들지 않는다.** §4-1(v1.2 · 유호 확정 2026-08-06)이 계정이 서는 자리를
 *   `supabase/functions/auth` 의 첫 등록 **한 곳**으로 못박았다 — 미리 만들면 그 순간
 *   전달해야 할 초기 비밀번호가 생겨 **전달물 0** 이 깨진다. 이 도구가 하는 일은 학생이
 *   첫 등록에서 대조할 **재료를 놓는 것**까지고, 그 뒤는 학생이 앱에서 한다.
 *
 * 🔴 **이 파일의 옛 판(`로그인코드발급.js`)이 그 규칙을 어겨 F269 가 됐다** — 폐기된 8자 코드
 *   설계로 GoTrue 계정을 직접 만들었는데, 그 계정의 주소는 코드에서 나오고(`r3pcytgb@…`)
 *   앱·서버가 쓰는 주소는 학생번호에서 나온다(`synk999@…`). 그래서 그 도구로 만든 계정은
 *   **영원히 로그인이 안 됐고** 증상은 「비밀번호가 틀렸다」뿐이라 원인이 안 보였다.
 *   갈라진 규칙을 맞추는 것으로는 안 낫는다 — **두 번째 생성 통로 자체가 원인**이라 지웠다.
 *   회귀 = `tests/학생계정.test.js` 「계정 생성은 auth 함수 밖에 없다」.
 *
 * 🔴 `--전화` 는 **필수**다 — 뒤 4자리가 첫 등록 게이트의 유일한 대조값이고(§4-1-1),
 *   비어 있으면 그 학생은 「대조 불가로 잠금」이라 스스로 등록을 못 한다. 증상이 위와 같다.
 *
 * 왜 미리보기가 기본인가 — `tools/원격SQL.js` 와 같은 규칙이다. 명부는 남의 프로젝트 상태를
 * 바꾼다. **애매하면 안 나간다.**
 */
const fs = require('fs');
const path = require('path');
const { 학생번호맞나, 학생번호표기, 뒤4자리 } = require('../lib/학생계정.js');
const { 정규형 } = require('../lib/로그인코드.js');

const ROOT = path.resolve(__dirname, '..');
/* 🔴 `process.exit()` 를 부르지 않는다 — fetch 소켓이 닫히는 중에 부르면 Node 가 abort 하고
 *   종료코드가 **127**(셸에서 「그런 명령이 없다」)로 나가, 정상적인 거절이 **설치 사고**로
 *   읽힌다. `교정확정.js` 에서 2026-08-07 실측된 그 자리고 이 도구도 같은 모양이었다. */
class 중단 extends Error {}
const die = (msg) => { console.error('[명부] ' + msg); process.exitCode = 1; throw new 중단(msg); };

/**
 * 등록 직후 화면이 들고 있는 **다음 한 걸음**. 순수 함수라 검사할 수 있다.
 * 유호님 확정(2026-08-07): 동의는 **등록 직후** 옮겨 적는다.
 */
function 다음걸음(student, 동의수) {
  return 동의수 > 0
    ? `\n   동의 이력 ${동의수}건 — 지금 유효한지: node tools/동의발급.js --현황 --학생 ${student}`
    : `\n   🔴 이 학생은 **아직 아무것도 못 한다** — 동의 행이 0건이라 업로드는 403 이고`
      + `\n      오늘의 과제 배정에서도 빠진다. 상담에서 받은 동의를 지금 옮겨 적는다:`
      + `\n      node tools/동의발급.js ${student} --판 v18.9 --확정자 "이름" --적용`;
}

/**
 * 학생이 화면에서 볼 **첫 등록 안내**. 전달물은 여전히 0이다 — 학생번호는 이미 학생 것이고
 * 뒤 4자리는 자기 전화다. 비밀번호는 우리가 만들지 않는다(§4-1).
 */
function 첫등록안내(번호, 뒷자리) {
  return `\n   학생에게 줄 것은 **학생번호 하나**다 — 비밀번호는 학생이 직접 정한다(전달물 0).`
    + `\n     ① 앱 첫 화면에 학생번호 ${번호}`
    + `\n     ② 본인 전화 **뒤 4자리 ${뒷자리}** — 상담 때 받은 그 번호다(다른 번호로 5번 틀리면 잠긴다)`
    + `\n     ③ 쓸 비밀번호를 학생이 직접 정한다(6자 이상)`;
}

const 자격증명 = require('../lib/자격증명.js');   // .env 읽기 + 토큰 만료 게이트(공용 통로)

/** 계약 버전은 정본에서 읽는다 — 여기 박으면 계약이 올라갈 때 조용히 낡는다. */
function 계약버전() {
  const p = path.join(ROOT, '계약', '수집_교정_계약.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).버전;
}

/** SQL 문자열 리터럴 — 작은따옴표를 겹쳐 막는다. 신뢰 경계라 검증과 이스케이프를 **둘 다** 한다. */
const 따옴표 = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function sql(e, query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${e.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${e.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL HTTP ${r.status} — ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

async function main() {
  const args = process.argv.slice(2);
  const 적용 = args.includes('--적용');
  const 값 = (이름) => {
    const i = args.indexOf(이름);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
  };
  const 이름 = 값('--이름');
  const 전화 = 값('--전화');
  const student = args.find((a, i) => !a.startsWith('--') && !['--이름', '--전화'].includes(args[i - 1]));

  if (!student) die('학생번호를 달라. 예: node tools/명부등록.js SYNK-001 --전화 "9911-2233" [--적용]');
  /* 🔴 형식 검사를 발급기 규격으로 한다 — 자릿수를 접지 않는 것까지 `lib/학생계정.js` 가 본다.
   *   느슨하게 받으면 앱이 못 찾는 행(`SYNK-42`·`학생1`)이 명부에 서고, 증상은 첫 등록이
   *   「없는 학생번호」로 막히는 것뿐이라 원인이 명부에 있는 줄 모른다. */
  if (!학생번호맞나(student)) {
    die(`학생번호 형식이 아니다: ${student}\n`
      + '     발급기가 내는 형태여야 한다(SYNK-001 · SYNK-1000). 자릿수는 접지 않는다 — SYNK-42 ≠ SYNK-042.');
  }
  const 번호 = 학생번호표기(student);          // 저장 형태는 발급기 표기형 하나뿐이다
  const 뒷자리 = 뒤4자리(전화);
  if (뒷자리 === null) {
    die('--전화 가 필요하다(숫자 4개 이상). 예: --전화 "9911-2233"\n'
      + '     이 값의 뒤 4자리가 첫 등록 게이트의 **유일한 대조값**이다(§4-1-1). 비면 그 학생은\n'
      + '     「대조 불가로 잠금」이라 스스로 등록을 못 하고, 증상은 「앱에서 안 된다」뿐이다.');
  }

  const e = 자격증명.읽기('명부등록');
  if (!e.SUPABASE_ACCESS_TOKEN || !e.SUPABASE_PROJECT_REF) {
    die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다 (tools/원격SQL.js 안내 참조)');
  }

  /* ① 이미 있는지 먼저 본다 — **앱과 같은 방식으로 접어서** 본다(`upper(replace(...))`).
   *   exact 로 보면 `SYNK042` 가 있는데 `SYNK-042` 를 또 넣어 두 행이 서고, 첫 등록은 둘 다
   *   집어 어느 쪽이 그 학생인지 알 수 없게 된다(auth/index.ts 의 조회와 같은 규칙이다). */
  const 접기 = `upper(replace(student_code, '-', '')) = ${따옴표(정규형(번호))}`;
  const 있나 = await sql(e, `select student_code, contact, auth_user_id from engine.learners where ${접기}`);
  const 기존 = 있나[0];
  if (기존) {
    die(`${기존.student_code} 는 이미 명부에 있다`
      + `${기존.auth_user_id ? ' — 계정도 이미 섰다(첫 등록 완료).' : ' — 계정은 아직(학생이 앱에서 첫 등록을 하면 선다).'}\n`
      + `     연락처: ${기존.contact || '(비어 있다 — 이 상태면 첫 등록이 잠긴다)'}\n`
      + '     연락처를 고치는 것은 이 도구가 아니다(덮으면 그 학생의 게이트 값이 조용히 바뀐다).\n'
      + '     node tools/원격SQL.js 로 그 한 행만 고친다.');
  }

  if (!적용) {
    console.log('[미리보기] 아무것도 만들지 않았다. 실제로 올리려면 --적용 을 붙인다.\n'
      + `  학생번호   : ${번호}${이름 ? ` (${이름})` : ' (--이름 없음 — 명부에서 사람이 못 알아본다)'}\n`
      + `  연락처     : ${전화}  → 첫 등록에서 대조할 뒤 4자리 **${뒷자리}**\n`
      + '  계정       : 만들지 않는다 — 학생이 앱에서 첫 등록을 할 때 선다(§4-1).');
    return;
  }

  await sql(e, `insert into engine.learners (student_code, contact, display_name, schema_ver)`
    + ` values (${따옴표(번호)}, ${따옴표(전화)}, ${이름 ? 따옴표(이름) : 'null'}, ${따옴표(계약버전())})`);

  console.log(`✅ 명부 등록 — ${번호}${이름 ? ` (${이름})` : ''}`
    + 첫등록안내(번호, 뒷자리)
    + `\n   📌 감사 기록(누가·언제): ${new Date().toISOString()} · learner=${번호} · 명부 등록`
    + '\n      ⚠ 넣을 표가 아직 없어 화면에만 남는다 — 필요하면 지금 옮겨 적는다.');

  /* 🔴 다음 한 걸음 = 동의 (유호님 확정 2026-08-07: **등록 직후**).
   * 명부에 올라도 학생은 아무것도 못 한다 — `uploads` 는 403 CONSENT_MISSING 이고
   * `deliver` 는 「동의 없는 학생은 배정하지 않는다」(P0 §345)라 과제도 안 간다. 두 증상 다
   * 「앱이 비어 있다」로만 보여서, 올리고 잊으면 그 학생은 **조용히** 멈춘 채로 남는다.
   * ⛔ 여기서 대신 넣지 않는다 — 동의는 별개의 법적 행위다. 받은 사실이 없는데 도구가
   *    만들면 그건 편의가 아니라 위조다. 이 자리가 하는 일은 **안 잊게 하는 것**까지다.
   * 유효성 판정은 여기서 안 한다(그 정본은 동의 게이트 하나여야 한다) — 있나 없나만 센다. */
  const [{ n: 동의수 }] = await sql(e,
    `select count(*)::int n from engine.consents where learner_id = (
       select learner_id from engine.learners where ${접기})`);
  console.log(다음걸음(번호, 동의수));
}

if (require.main === module) {
  main().catch((err) => {
    if (err instanceof 중단) return;                       // die() 가 이미 찍고 코드를 세웠다
    console.error('[명부] ' + err.message);
    process.exitCode = 1;
  });
}

module.exports = { 다음걸음, 첫등록안내, 따옴표 };
