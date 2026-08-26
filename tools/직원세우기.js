#!/usr/bin/env node
'use strict';
/**
 * 직원 계정 세우기 — 강사·검수자·문구 감수자를 앱에 들여보낸다.
 *
 *   node tools/직원세우기.js --목록                                   # 지금 누가 있나
 *   node tools/직원세우기.js SYNK-L01 --역할 l10n_reviewer --이름 "밧자"        # 미리보기
 *   node tools/직원세우기.js SYNK-L01 --역할 l10n_reviewer --이름 "밧자" --적용
 *   node tools/직원세우기.js SYNK-L01 --해임 --적용                     # 문을 닫는다(계정은 남는다)
 *
 * ■ 🔴 왜 도구가 필요한가 — 없으면 매번 «임시 스크립트»다
 *   08-27 에 감수자 계정을 실제로 세워 보려니 손으로 짠 일회용 스크립트를 썼다. 그건 다음 사람이
 *   못 쓰고, 쓸 때마다 조금씩 다르게 짜여 **역할 어휘·번호 규칙이 그 자리에서 갈린다.**
 *   학생은 `tools/명부등록.js` 가 있는데 직원만 없었다.
 *
 * ■ 🔑 직원 번호는 **글자가 든 꼴**이다 (`SYNK-L01` · 유호 확정 08-27)
 *   학생 번호는 상담시트에서 「최대값 +1」로 붙고 직원은 그 시트에 없다 — 즉 채번기가 직원
 *   번호를 못 본다. 대역 약속(「900번대는 직원」)은 학생이 900명을 넘는 날 조용히 깨진다.
 *   글자가 든 번호는 채번기가 **만들 수 없어서** 그 날이 오지 않는다(`lib/학생계정.js` 머리말).
 *   ⇒ 그래서 이 도구는 **학생 번호를 거절한다.** 실수로 학생 번호를 주면 그 학생 계정을 덮는다.
 *
 * ■ 🔴 직원은 만들고 **지우지 않는다 — 해임한다**
 *   `staff_access_log` 가 append-only 이고 `staff_id` FK 가 `on delete restrict` 라, 감사 행이
 *   있는 직원은 원리상 못 지운다. 그건 결함이 아니라 감사 무결성이 설계대로 도는 것이다.
 *   `--해임` 은 `active=false` + `revoked_before` 를 세워 **문만 닫는다**(이력은 그대로 산다).
 *
 * ■ ⚠ 비밀번호는 화면에 **한 번만** 찍고 저장하지 않는다 — 그 자리에서 사람에게 전달한다.
 *   🚫 이 도구는 비밀번호를 파일·로그·git 어디에도 남기지 않는다.
 */
const path = require('path');

const API = 'https://api.supabase.com/v1/projects';
const 자격증명 = require('../lib/자격증명.js');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');
const { 직원번호맞나, 학생번호맞나, 계정번호맞나, 이메일, 학생번호표기 } = require('../lib/학생계정.js');

const 아는플래그 = [...공용플래그, '--목록', '--역할', '--이름', '--적용', '--해임'];

/* 🔑 역할 어휘를 여기 **박지 않는다** — 정본은 DB CHECK(`staff_role_c13`)다. 박으면 조각이
 *   역할을 넓히는 날 이 도구만 옛 목록을 들고 「없는 역할」이라며 막는다(따를 수 없는 처방). */
const 역할질의 = "select pg_get_constraintdef(oid) as def from pg_constraint where conname like 'staff_role_c%' order by conname desc limit 1";

class 중단 extends Error {}
const die = (m) => { console.error('[직원세우기] ' + m); process.exitCode = 1; throw new 중단(m); };
const 따옴 = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

/** 사람이 받아 적을 첫 비밀번호. 🔑 사람이 «칠 수 있어야» 한다 — 헷갈리는 글자를 뺀다. */
function 첫비밀번호() {
  const 자모 = 'abcdefghjkmnpqrstuvwxyz';           // i·l·o 뺌
  const 숫자 = '23456789';                          // 0·1 뺌
  const crypto = require('crypto');
  const 뽑기 = (풀, n) => Array.from({ length: n }, () => 풀[crypto.randomInt(풀.length)]).join('');
  return `${뽑기(자모, 4)}-${뽑기(숫자, 4)}-${뽑기(자모, 4)}`;
}

async function main() {
  const args = process.argv.slice(2);
  const 플래그오류 = 인자게이트('직원세우기', args, 아는플래그);
  if (플래그오류) die(플래그오류);

  const 값 = (이름) => { const i = args.indexOf(이름); return i === -1 ? null : args[i + 1]; };
  const 목록만 = args.includes('--목록');
  const 적용 = args.includes('--적용');
  const 해임 = args.includes('--해임');
  const 번호 = args.find((a) => !a.startsWith('--') && a !== 값('--역할') && a !== 값('--이름')) || null;

  const e = 자격증명.읽기('직원세우기', { 읽기: !적용 });
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const M = { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' };

  const sql = async (q) => {
    const r = await fetch(`${API}/${ref}/database/query`, { method: 'POST', headers: M, body: JSON.stringify({ query: q }) });
    const t = await r.text();
    if (!r.ok) throw new Error(`SQL HTTP ${r.status} — ${t.slice(0, 400)}`);
    return JSON.parse(t);
  };

  /* 🔴 대상부터 소리 내어 읽는다 — 리허설과 운영을 가르는 유일한 값이 .env 한 줄이다. */
  const pr = await fetch(`${API}/${ref}`, { headers: M });
  const 이름표 = pr.ok ? (JSON.parse(await pr.text()).name || '(모름)') : '(이름을 못 읽었다)';
  console.log(`[직원세우기] 대상 ▸ ${이름표}  (${ref})${적용 ? '  ⚠ 쓰기(--적용)' : '  읽기(미리보기)'}\n`);

  /* ── 목록 ─────────────────────────────────────────────────── */
  const 있는사람 = await sql(`
    select u.email, s.role, s.display_name, s.active
      from engine.staff s join auth.users u on u.id = s.auth_user_id
     order by s.active desc, s.role, u.email`);
  if (목록만 || !번호) {
    console.log(`  직원 ${있는사람.length}명`);
    for (const r of 있는사람) {
      const 번 = 학생번호표기(String(r.email).split('@')[0]);
      console.log(`    ${r.active ? '  ' : '🚫'} ${번.padEnd(10)} ${String(r.role).padEnd(14)} ${r.display_name ?? ''}`);
    }
    if (!번호 && !목록만) console.log('\n  번호를 달라. 예: node tools/직원세우기.js SYNK-L01 --역할 l10n_reviewer --이름 "밧자"');
    return;
  }

  /* ── 번호 검사 — 여기가 이 도구의 안전선이다 ───────────────────
   * 🔴 **문을 «여는» 자리에만 건다.** 08-27 실측: 처음엔 해임에도 걸어 뒀는데, 그러면 이 도구가
   *   **자기가 만든 것을 못 치운다** — 규약을 바꾸기 전에 학생 꼴로 세워 둔 직원(`SYNK-901`)을
   *   그 가드가 막아 세웠다. 문을 «닫는» 일은 어느 꼴이든 안전하다(권한만 회수한다).
   *   막아야 하는 것은 여는 쪽 하나다 — 학생 번호로 직원을 세우면 그 학생 계정을 덮어쓴다. */
  if (!계정번호맞나(번호)) {
    die(`번호 꼴이 아니다: ${번호}\n     직원은 SYNK + 글자 하나 + 숫자 2자리 이상 (예: SYNK-L01)`);
  }
  if (!해임) {
    if (학생번호맞나(번호)) {
      die(`${학생번호표기(번호)} 는 **학생 번호**다 — 직원에게 주면 그 학생 계정을 덮어쓴다.\n`
        + '     직원 번호는 글자가 든 꼴이다: SYNK-L01(문구 감수) · SYNK-T01(강사) · SYNK-I01(검수) · SYNK-D01(원장)');
    }
    if (!직원번호맞나(번호)) {
      die(`직원 번호 꼴이 아니다: ${번호}\n     SYNK + 글자 하나 + 숫자 2자리 이상 (예: SYNK-L01)`);
    }
  }
  const 주소 = 이메일(번호);
  const 표기 = 학생번호표기(번호);

  const [이미] = await sql(`select u.id, s.role, s.display_name, s.active
      from auth.users u left join engine.staff s on s.auth_user_id = u.id
     where u.email = ${따옴(주소)}`);

  /* ── 해임 ─────────────────────────────────────────────────── */
  if (해임) {
    if (!이미 || !이미.role) die(`${표기} 는 직원이 아니다 — 해임할 것이 없다`);
    console.log(`  🚫 해임: ${표기} (${이미.role} · ${이미.display_name ?? ''})`);
    console.log('     계정과 판정 이력은 **그대로 남는다** — 문만 닫는다(감사 무결성).');
    if (!적용) { console.log('\n[직원세우기] 미리보기다 — 아무것도 안 바꿨다. 붙이려면 --적용'); return; }
    await sql(`update engine.staff set active = false, revoked_before = now()
                where auth_user_id = ${따옴(이미.id)}`);
    console.log(`\n[직원세우기] ✅ ${표기} 해임했다 — 이 순간부터 그 사람의 토큰은 안 통한다`);
    return;
  }

  /* ── 세우기 ───────────────────────────────────────────────── */
  const 역할 = 값('--역할');
  if (!역할) die('--역할 이 필요하다. 예: --역할 l10n_reviewer');
  const [제약] = await sql(역할질의);
  const 아는역할 = [...String(제약?.def || '').matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
  if (!아는역할.length) die('DB 에서 역할 어휘를 못 읽었다 — 조각이 안 부어졌을 수 있다');
  if (!아는역할.includes(역할)) die(`모르는 역할: ${역할}\n     DB 가 아는 것: ${아는역할.join(' · ')}`);
  const 표시이름 = 값('--이름') || null;

  console.log(`  ${이미 ? '이어 쓴다' : '새로 만든다'}: ${표기}  (${주소})`);
  console.log(`    역할 ${역할}${표시이름 ? ` · 이름 ${표시이름}` : ''}`);
  if (이미 && 이미.role) console.log(`    ⚠ 이미 직원이다 — 역할이 ${이미.role} → ${역할} 로 바뀐다`);
  if (!적용) {
    console.log('\n[직원세우기] 미리보기다 — 아무것도 안 바꿨다. 세우려면 --적용');
    return;
  }

  const kr = await fetch(`${API}/${ref}/api-keys`, { headers: M });
  if (!kr.ok) die(`api-keys HTTP ${kr.status}`);
  const svc = (JSON.parse(await kr.text()).find((k) => k.name === 'service_role') || {}).api_key;
  if (!svc) die('service_role 키를 못 찾았다');
  const base = `https://${ref}.supabase.co`;
  const 비번 = 첫비밀번호();

  let uid = 이미?.id ?? null;
  if (!uid) {
    const cr = await fetch(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 주소, password: 비번, email_confirm: true }),
    });
    if (!cr.ok) die(`계정 생성 실패 HTTP ${cr.status} — ${(await cr.text()).slice(0, 200)}`);
    uid = JSON.parse(await cr.text()).id;
  } else {
    const ur = await fetch(`${base}/auth/v1/admin/users/${uid}`, {
      method: 'PUT',
      headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 비번 }),
    });
    if (!ur.ok) die(`비밀번호 설정 실패 HTTP ${ur.status}`);
  }

  /* 🔑 재사용이라 앞 회차가 해임 상태로 남았을 수 있다 — 살려 둔다. */
  await sql(`insert into engine.staff(auth_user_id, role, display_name)
             values (${따옴(uid)}, ${따옴(역할)}, ${따옴(표시이름)})
             on conflict (auth_user_id) do update
               set role = excluded.role,
                   display_name = coalesce(excluded.display_name, engine.staff.display_name),
                   active = true, revoked_before = null`);

  console.log(`\n[직원세우기] ✅ ${표기} 섰다 — 앱에서 «${역할}» 통로가 열렸다`);
  console.log('\n  ── 이 사람에게 전할 것 (여기 말고 어디에도 안 적혀 있다) ──');
  console.log(`     번호      ${표기}`);
  console.log(`     비밀번호  ${비번}`);
  console.log('\n  ⚠ 이 화면을 닫으면 비밀번호는 다시 못 본다 — 잃으면 이 명령을 다시 돌려 새로 준다.');
  console.log('     본인이 앱에서 SYSTEM ▸ 「비밀번호 바꾸기」로 바꾸게 안내한다.');
}

module.exports = { 첫비밀번호 };
if (require.main === module) {
  main().catch((err) => {
    if (err instanceof 중단) return;
    console.error('[직원세우기] ' + String((err && err.message) || err));
    process.exitCode = 1;
  });
}
