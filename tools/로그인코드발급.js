#!/usr/bin/env node
'use strict';
/**
 * 로그인 코드 **첫 발급** 도구 — L0 §4-1·§4-2 (§8 「그다음」 ②)
 *
 *   node tools/로그인코드발급.js SYNK-001                 # 미리보기 — 아무것도 안 만든다
 *   node tools/로그인코드발급.js SYNK-001 --적용          # 실제 발급
 *   node tools/로그인코드발급.js SYNK-001 --적용 --이름 "밧자"
 *
 * 왜 미리보기가 기본인가 — `tools/원격SQL.js` 와 같은 규칙이다. 계정 생성은 남의 프로젝트
 * 상태를 바꾼다. **애매하면 안 나간다.**
 *
 * ⛔ 재발급은 여기 없다. §4-2 ③(전 세션 폐기)이 **E1 인증 물리 설계에서 확정**이고 문서가
 *    「실측 테스트를 통과하기 전에는 완료로 보지 않는다」고 못박았다. 미정 위에 지으면
 *    「재발급했는데 옛 토큰이 산다」가 조용히 성립한다 — 그건 유출 대응이 안 되는 것이다.
 *
 * 🔴 평문 코드는 **화면에 1회**만 나오고 어디에도 안 남는다(§4-1·§4-2). 분실 = 재발급.
 * 🔴 감사 기록(누가·언제·어느 learner)을 **넣을 표가 아직 없다** — 기준선 8표에 인증 감사
 *    자리가 없고, learning_events 는 학습 사건이라 거기 섞으면 학습 데이터가 오염된다.
 *    지금은 화면에 내는 것으로 끝낸다. 표가 생기면 이 자리에서 함께 적는다.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { 집합, 길이, 정규형, 표기형, 형식맞나, 이메일, 비밀번호 } = require('../lib/로그인코드.js');

const ROOT = path.resolve(__dirname, '..');
const die = (msg) => { console.error('[발급] ' + msg); process.exit(1); };

function env읽기() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const 줄 of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = 줄.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/** 계약 버전은 정본에서 읽는다 — 여기 박으면 계약이 올라갈 때 조용히 낡는다. */
function 계약버전() {
  const p = path.join(ROOT, '계약', '수집_교정_계약.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).버전;
}

/**
 * 코드 생성 — `crypto.randomInt` 는 균등하다(32 가 256 을 나눠떨어져 편향도 없다).
 * ⚠ `Math.random()` 을 쓰면 안 된다. 이건 비밀번호다.
 */
function 코드생성() {
  let s = '';
  for (let i = 0; i < 길이; i += 1) s += 집합[crypto.randomInt(0, 집합.length)];
  return s;
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

/** service_role 키는 이 프로세스 안에서만 산다 — 디스크에 안 쓰고 화면에도 안 찍는다. */
async function 관리자키(e) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${e.SUPABASE_PROJECT_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${e.SUPABASE_ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`키 조회 HTTP ${r.status}`);
  const k = (await r.json()).find((x) => x.name === 'service_role');
  if (!k) throw new Error('service_role 키를 못 찾았다');
  return k.api_key;
}

async function auth(e, 키, 경로, opt = {}) {
  const r = await fetch(`https://${e.SUPABASE_PROJECT_REF}.supabase.co/auth/v1${경로}`, {
    ...opt,
    headers: { apikey: 키, Authorization: `Bearer ${키}`, 'Content-Type': 'application/json', ...(opt.headers || {}) },
  });
  const t = await r.text();
  return { ok: r.ok, status: r.status, body: t ? JSON.parse(t) : null };
}

async function main() {
  const args = process.argv.slice(2);
  const 적용 = args.includes('--적용');
  const 이름 = (args[args.indexOf('--이름') + 1] && args.indexOf('--이름') !== -1) ? args[args.indexOf('--이름') + 1] : null;
  const student = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--이름');
  if (!student) die('학생 코드를 달라. 예: node tools/로그인코드발급.js SYNK-001 [--적용]');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(student)) {
    die(`학생 코드 형식이 아니다: ${student} (영숫자·하이픈·밑줄 1~32자)`);
  }

  const e = { ...env읽기(), ...process.env };
  if (!e.SUPABASE_ACCESS_TOKEN || !e.SUPABASE_PROJECT_REF) {
    die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다 (tools/원격SQL.js 안내 참조)');
  }

  /* ① 이미 발급됐는지 먼저 본다 — 덮어쓰면 학생이 쓰던 코드가 조용히 죽는다. */
  const 있나 = await sql(e, `select learner_id, auth_user_id from engine.learners where student_code = ${따옴표(student)}`);
  const 기존 = 있나[0];
  if (기존 && 기존.auth_user_id) {
    die(`${student} 는 이미 로그인 코드가 있다(auth_user_id 존재).\n`
      + '     분실·유출이면 **재발급**이고, 재발급은 아직 없다 — §4-2 ③(전 세션 폐기)이 E1 확정 대기다.');
  }

  const 코드 = 코드생성();
  const 메일 = 이메일(코드);

  if (!적용) {
    console.log(`[미리보기] 아무것도 만들지 않았다. 실제로 발급하려면 --적용 을 붙인다.\n`
      + `  학생 코드   : ${student}${기존 ? ' (learners 행 있음 — 연결만 한다)' : ' (learners 행 없음 — 새로 만든다)'}\n`
      + `  발급될 형태 : ${표기형(코드)}  → 이메일 ${메일}\n`
      + '  ⚠ 위 코드는 미리보기용이라 --적용 때 **다시 뽑는다**(같은 값이 아니다).');
    return;
  }

  const 키 = await 관리자키(e);
  const 만들기 = await auth(e, 키, '/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: 메일, password: 비밀번호(코드), email_confirm: true }),
  });
  if (!만들기.ok) die(`계정 생성 실패 HTTP ${만들기.status} — ${JSON.stringify(만들기.body).slice(0, 300)}`);
  const uid = 만들기.body.id;

  /* ② 연결 실패 시 계정을 지운다 — 안 지우면 learner 없는 유령 계정이 남는다. */
  try {
    const ver = 계약버전();
    if (기존) {
      await sql(e, `update engine.learners set auth_user_id = ${따옴표(uid)}::uuid where student_code = ${따옴표(student)}`);
    } else {
      await sql(e, `insert into engine.learners (auth_user_id, student_code, display_name, schema_ver)`
        + ` values (${따옴표(uid)}::uuid, ${따옴표(student)}, ${이름 ? 따옴표(이름) : 'null'}, ${따옴표(ver)})`);
    }
  } catch (err) {
    const 되돌림 = await auth(e, 키, `/admin/users/${uid}`, { method: 'DELETE' });
    die(`learners 연결 실패 → 만든 계정을 되돌렸다(HTTP ${되돌림.status}).\n     원인: ${err.message}`);
  }

  console.log(`✅ 발급 완료 — ${student}\n`
    + `\n   로그인 코드 : ${표기형(코드)}\n`
    + `\n   🔴 이 화면이 이 코드를 보는 **유일한 순간**이다 — 어디에도 저장되지 않는다.`
    + `\n      학생에게 전달한 뒤 이 창을 닫는다. 분실하면 재발급뿐이다.`
    + `\n   📌 감사 기록(누가·언제): ${new Date().toISOString()} · learner=${student} · 첫 발급`
    + `\n      ⚠ 넣을 표가 아직 없어 화면에만 남는다 — 필요하면 지금 옮겨 적는다.`);
}

main().catch((err) => die(err.message));
