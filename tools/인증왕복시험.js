#!/usr/bin/env node
/* 인증왕복시험 — 첫 등록 Edge Function 이 **실제로** 게이트를 지키는지 라이브에서 잰다 (L0 §4-1-1).
 *
 * 왜 회귀만으로 부족한가 — 이 함수의 보증은 전부 **런타임 경계**에 있다:
 *   동봉이 풀렸는가 · GoTrue 관리자 API 가 계정을 만드는가 · 실패가 `signup_attempts` 를
 *   실제로 올리는가 · 만든 계정으로 **정말 로그인이 되는가**. 어느 것도 Node 회귀가 못 본다.
 *
 * 🔴 이 시험은 **리허설에서만** 돈다 — 계정과 `learners` 행을 만든다.
 *   판정은 자기가 만든 학생 하나에 대해서만 하고, 끝나면 그 학생과 계정을 지운다.
 *
 * 사용: SUPABASE_PROJECT_REF=<리허설 ref> node tools/인증왕복시험.js
 */
'use strict';
const 자격증명 = require('../lib/자격증명.js');
const { 이메일 } = require('../lib/학생계정.js');
// 🔑 합성 도메인은 **정본에서 가져온다** — 여기 문자열로 박으면 도메인이 바뀌는 날 조용히
//   갈라진다(`tests/로그인코드.test.js` 가 그 사본을 기계로 막는다).
const { 도메인 } = require('../lib/로그인코드.js');

const API = 'https://api.supabase.com/v1/projects';
const die = (m) => { console.error('[인증왕복시험] ' + m); process.exit(1); };

/* 이 시험이 쓰는 학생. 🔑 실제 발급기가 내는 형식(`SYNK-NNN`)이어야 한다 —
 * 형식을 벗어난 값으로 재면 게이트의 형식 검사가 먼저 걸려 **아무것도 못 잰다.** */
const 학생번호 = 'SYNK-901';
const 연락처 = '+976 9911-2233';
const 뒷자리 = '2233';
const 새비번 = 'Synk-Rehearsal-1';

let 통과 = 0;
const 확인 = (조건, 무엇) => {
  if (조건) { 통과 += 1; console.log(`  ✅ ${무엇}`); } else { die(`❌ ${무엇}`); }
};

async function main() {
  const e = 자격증명.읽기('인증왕복시험');
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const M = { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' };

  const pr = await fetch(`${API}/${ref}`, { headers: M });
  const 이름 = pr.ok ? JSON.parse(await pr.text()).name : '(모름)';
  console.log(`[인증왕복시험] 대상 ▸ ${이름}  (${ref})\n`);
  if (!/rehearsal/i.test(이름)) {
    die(`「${이름}」 은 리허설이 아니다. 이 시험은 계정을 만든다 — 운영에서는 돌리지 않는다.`);
  }

  const sql = async (q) => {
    const r = await fetch(`${API}/${ref}/database/query`, { method: 'POST', headers: M, body: JSON.stringify({ query: q }) });
    const t = await r.text();
    if (!r.ok) throw new Error(`SQL HTTP ${r.status} ${t.slice(0, 400)}`);
    return JSON.parse(t);
  };

  const kr = await fetch(`${API}/${ref}/api-keys`, { headers: M });
  const 키들 = JSON.parse(await kr.text());
  const anon = 키들.find((k) => k.name === 'anon').api_key;
  // 원장 계정을 세우는 데만 쓴다(시험 판 깔기) — 함수를 부를 때는 절대 안 싣는다.
  const 서비스키 = 키들.find((k) => k.name === 'service_role').api_key;

  const 부르기 = async (본문) => {
    const r = await fetch(`https://${ref}.supabase.co/functions/v1/auth/first-login`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(본문),
    });
    return { status: r.status, body: JSON.parse((await r.text()) || '{}') };
  };
  const 시도수 = async () => Number(
    (await sql(`select signup_attempts from engine.learners where student_code='${학생번호}'`))[0]?.signup_attempts);

  const 치우기 = async () => {
    await sql(`delete from engine.learners where student_code='${학생번호}'`);
    await sql(`delete from auth.users where email='${이메일(학생번호)}'`);
  };

  await 치우기();
  await sql(`insert into engine.learners(student_code, contact, display_name, schema_ver)
             values ('${학생번호}', '${연락처}', '리허설 학생', 'probe')`);

  try {
    console.log('① 게이트 — 실패는 어느 칸이 틀렸는지 알려주지 않는다');
    const 없는번호 = await 부르기({ student_code: 'SYNK-999', phone_last4: 뒷자리, password: 새비번 });
    const 틀린뒷자리 = await 부르기({ student_code: 학생번호, phone_last4: '0000', password: 새비번 });
    확인(없는번호.status === 401 && 틀린뒷자리.status === 401, '둘 다 401');
    확인(JSON.stringify(없는번호.body.error) === JSON.stringify(틀린뒷자리.body.error),
      '없는 학생번호와 뒷자리 불일치가 **한 글자도 다르지 않다**(존재 여부가 안 샌다)');
    확인(await 시도수() === 1, '뒷자리 실패만 시도 횟수를 올린다(없는 번호는 올릴 행이 없다)');

    console.log('\n② 비밀번호 규격은 게이트와 별개로 알려준다');
    const 짧은비번 = await 부르기({ student_code: 학생번호, phone_last4: 뒷자리, password: '123' });
    확인(짧은비번.status === 400 && 짧은비번.body.error.code === 'PASSWORD_TOO_SHORT',
      '6자 미만은 400 + 이유를 알려준다(본인이 방금 정한 값이라 새는 정보가 없다)');
    확인(await 시도수() === 1, '규격 오류는 시도 횟수를 안 올린다(게이트를 밟기 전이다)');

    console.log('\n③ 본문으로 학생을 주장할 수 없다');
    const 위조 = await 부르기({ student_code: 학생번호, phone_last4: 뒷자리, password: 새비번,
                                learner_id: '00000000-0000-4000-8000-000000000000' });
    확인(위조.status === 400 && 위조.body.error.code === 'CONTRACT_VIOLATION',
      'learner_id 를 실으면 400 — service_role 은 RLS 를 우회하므로 본문을 믿으면 안 된다');

    console.log('\n④ 통과 — 계정이 서고, 그 계정으로 **실제로 로그인된다**');
    const 성공 = await 부르기({ student_code: 학생번호, phone_last4: 뒷자리, password: 새비번,
                                recovery_email: 'parent@example.com', recovery_phone: '99001122' });
    확인(성공.status === 200 && 성공.body.ok === true, '200 ok');
    const [행] = await sql(`select auth_user_id, recovery_email, recovery_phone, signup_attempts
                              from engine.learners where student_code='${학생번호}'`);
    확인(!!행.auth_user_id, 'auth_user_id 가 이어졌다');
    확인(행.recovery_email === 'parent@example.com' && 행.recovery_phone === '99001122',
      '복구 정보가 저장됐다(발송은 안 한다 — 대조용)');
    확인(Number(행.signup_attempts) === 0, '성공하면 시도 횟수가 0으로 풀린다');

    const lr = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 이메일(학생번호), password: 새비번 }),
    });
    확인(lr.ok, '학생이 정한 비밀번호로 로그인된다 — 앱이 밟을 경로 그대로');

    console.log('\n⑤ 한 번만 열린다');
    const 두번째 = await 부르기({ student_code: 학생번호, phone_last4: 뒷자리, password: '다른비밀번호' });
    확인(두번째.status === 401, '등록된 뒤에는 같은 게이트 응답으로 닫힌다');
    const lr2 = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 이메일(학생번호), password: '다른비밀번호' }),
    });
    확인(!lr2.ok, '🔴 두 번째 요청이 비밀번호를 덮어쓰지 못했다(덮였다면 계정 탈취다)');

    console.log('\n⑥ 잠금 — 5회에 이르면 그 학생의 첫 등록이 닫힌다');
    await sql(`update engine.learners set auth_user_id = null, signup_attempts = 0
                where student_code='${학생번호}'`);
    await sql(`delete from auth.users where email='${이메일(학생번호)}'`);
    for (let i = 0; i < 5; i += 1) await 부르기({ student_code: 학생번호, phone_last4: '0000', password: 새비번 });
    확인(await 시도수() === 5, '5회까지 센다');
    const 잠긴뒤 = await 부르기({ student_code: 학생번호, phone_last4: 뒷자리, password: 새비번 });
    확인(잠긴뒤.status === 401, '🔴 뒷자리가 **맞아도** 잠긴 뒤에는 안 열린다');
    확인(!(await sql(`select auth_user_id from engine.learners where student_code='${학생번호}'`))[0].auth_user_id,
      '잠긴 채로는 계정이 안 생긴다');
    console.log('\n⑦ 원장 초기화 — 임시번호는 GoTrue 가 아니라 해시로 산다 (L0 §4-2-2)');
    // 판 다시 깔기: 등록된 학생 + 원장 직원 하나.
    await sql(`update engine.learners set signup_attempts = 0 where student_code='${학생번호}'`);
    const 재등록 = await 부르기({ student_code: 학생번호, phone_last4: 뒷자리, password: 새비번 });
    확인(재등록.status === 200, '시험용 학생을 다시 등록했다');

    /* 🔑 **원장은 만들고 지우지 않는다 — 재사용한다.**
     *   `staff_access_log` 가 append-only(트리거)이고 `staff_id` FK 가 `on delete restrict` 라
     *   **감사 행이 있는 직원은 지울 수 없다.** 그건 결함이 아니라 감사 무결성이 설계대로 도는
     *   것이다(누가 무엇을 했는지가 사람 행보다 오래 살아야 한다). 지우려 들면 시험이
     *   2회차부터 영원히 빨개진다 — 재실행 안 되는 시험은 한 번 쓰고 버리는 시험이다. */
    const 원장이메일 = `probe-director${도메인}`;
    const 원장비번 = 'Director-Rehearsal-1';
    let 원장uid = (await sql(`select auth_user_id from engine.staff where display_name='리허설 원장'`))[0]?.auth_user_id;
    if (!원장uid) {
      const cr = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: 서비스키, Authorization: `Bearer ${서비스키}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 원장이메일, password: 원장비번, email_confirm: true }),
      });
      원장uid = cr.ok
        ? JSON.parse(await cr.text()).id
        : (await sql(`select id from auth.users where email='${원장이메일}'`))[0]?.id;
      if (!원장uid) die('리허설 원장 계정을 못 만들었다');
      await sql(`insert into engine.staff(auth_user_id, role, display_name)
                 values ('${원장uid}', 'director', '리허설 원장')
                 on conflict (auth_user_id) do nothing`);
    }
    // 재사용이라 비밀번호가 갈렸을 수 있다 — 매번 맞춰 두면 회차가 서로를 안 깨뜨린다.
    await fetch(`https://${ref}.supabase.co/auth/v1/admin/users/${원장uid}`, {
      method: 'PUT',
      headers: { apikey: 서비스키, Authorization: `Bearer ${서비스키}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 원장비번 }),
    });
    const dr = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 원장이메일, password: 원장비번 }),
    });
    const 원장토큰 = JSON.parse(await dr.text()).access_token;

    const 초기화하기 = async (토큰, 본문) => {
      const r = await fetch(`https://${ref}.supabase.co/functions/v1/auth/reset`, {
        method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(본문),
      });
      return { status: r.status, body: JSON.parse((await r.text()) || '{}') };
    };

    확인((await 초기화하기(anon, { student_code: 학생번호 })).status === 401,
      'anon 키로는 초기화가 안 된다(사람이 아니다)');
    const 학생토큰 = JSON.parse(await (await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 이메일(학생번호), password: 새비번 }),
    })).text()).access_token;
    확인((await 초기화하기(학생토큰, { student_code: 학생번호 })).status === 403,
      '🔴 학생 토큰으로는 초기화가 안 된다 — 역할은 서버가 표에서 확정한다');

    // 🔑 **절대 개수로 재지 않는다** — 감사표는 append-only 라 앞 회차가 남아 있고,
    //   `=1` 로 재면 2회차부터 영원히 빨개진다(왕복시험이 이미 밟은 함정이다). 증분으로 잰다.
    const 감사전 = (await sql(`select count(*)::int c from engine.staff_access_log
                                 where action='learner.password_reset'`))[0].c;
    const 초기화 = await 초기화하기(원장토큰, { student_code: 학생번호 });
    확인(초기화.status === 200 && /^\d{6}$/.test(String(초기화.body.temp_password || '')),
      '원장 토큰으로 6자리 임시번호가 1회 나온다');
    const 임시 = 초기화.body.temp_password;

    const [보관] = await sql(`select temp_password_hash, temp_password_expires_at > now() as 살아있나
                                from engine.learners where student_code='${학생번호}'`);
    확인(!!보관.temp_password_hash && !String(보관.temp_password_hash).includes(임시),
      '🔴 평문이 DB 에 없다 — 해시로만 있다');
    확인(보관.살아있나 === true, '만료 시각이 미래로 찍혔다');
    확인((await sql(`select count(*)::int c from engine.staff_access_log
                      where action='learner.password_reset'`))[0].c === 감사전 + 1,
      '감사가 정확히 1행 늘었다');
    확인(!(await sql(`select count(*)::int c from engine.staff_access_log
                       where target_ids::text like '%${임시}%' or action like '%${임시}%'`))[0].c,
      '🔴 감사표에 평문 임시번호가 안 적혔다');

    const 옛비번로그인 = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 이메일(학생번호), password: 새비번 }),
    });
    확인(!옛비번로그인.ok, '🔴 초기화가 **옛 비밀번호도 죽였다**(아는 사람이 있어도 못 들어온다)');

    const 임시로그인하기 = async (본문) => {
      const r = await fetch(`https://${ref}.supabase.co/functions/v1/auth/temp-login`, {
        method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(본문),
      });
      return { status: r.status, body: JSON.parse((await r.text()) || '{}') };
    };

    확인((await 임시로그인하기({ student_code: 학생번호, temp_password: '000000', new_password: '아무거나12' })).status === 401
      || 임시 === '000000', '틀린 임시번호는 막힌다');
    const 최종비번 = 'Synk-After-Reset-1';
    const 통과함 = await 임시로그인하기({ student_code: 학생번호, temp_password: 임시, new_password: 최종비번 });
    확인(통과함.status === 200, '맞는 임시번호로 새 비밀번호가 선다');

    const 새로그인 = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 이메일(학생번호), password: 최종비번 }),
    });
    확인(새로그인.ok, '학생이 정한 새 비밀번호로 실제 로그인된다');

    const 재사용 = await 임시로그인하기({ student_code: 학생번호, temp_password: 임시, new_password: '또다른비번1' });
    확인(재사용.status === 401, '🔴 임시번호는 **1회용** — 같은 번호가 두 번 안 통한다');
    const [뒤] = await sql(`select temp_password_hash, temp_password_expires_at
                              from engine.learners where student_code='${학생번호}'`);
    확인(!뒤.temp_password_hash && !뒤.temp_password_expires_at, '쓰고 나면 해시·만료가 지워진다');

    console.log('\n⑧ 만료가 **참**인가 — 이 판이 존재하는 이유');
    const 초기화2 = await 초기화하기(원장토큰, { student_code: 학생번호 });
    await sql(`update engine.learners set temp_password_expires_at = now() - interval '1 minute'
                where student_code='${학생번호}'`);
    const 만료뒤 = await 임시로그인하기({
      student_code: 학생번호, temp_password: 초기화2.body.temp_password, new_password: '만료테스트1',
    });
    확인(만료뒤.status === 401, '🔴 만료된 임시번호는 **맞아도** 안 통한다 — 30분이 장식이 아니다');

    // 감사 행이 실제로 안 지워지는지도 재 둔다 — 이게 append-only 의 값이다.
    let 감사삭제됨 = true;
    try { await sql(`delete from engine.staff_access_log where staff_id is not null`); }
    catch { 감사삭제됨 = false; }
    확인(!감사삭제됨, '🔴 감사 행은 지워지지 않는다(append-only) — 그래서 원장도 못 지운다');
  } finally {
    await 치우기();   // 학생과 그 계정만 치운다. 원장은 감사가 물고 있어 남긴다(설계대로다).
  }

  console.log(`\n[인증왕복시험] ✅ ${통과}/${통과} 통과 · 시험 학생·계정 정리 · 원장은 감사 때문에 존치`);
}

main().catch((err) => die(String((err && err.message) || err)));
