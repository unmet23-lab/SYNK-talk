#!/usr/bin/env node
/* 업로드왕복시험 — `uploads/sign` 이 낸 서명으로 **실제로 파일이 올라가는지**까지 재는 실측.
 *
 * 왜 있나: 게이트(401·404·400)는 학생 없이도 재지지만, 이 통로의 진짜 값은 **경로 규칙**이다
 *   (L0 §9-3-1 · 🔴소급 불가). 서명이 나오는 것과 **그 서명이 규칙대로 된 자리에 파일을 놓는 것**은
 *   다른 사실이라, 올려 보고 `storage.objects` 에서 그 경로를 눈으로 확인해야 증명이 끝난다.
 *
 * 🔴 **리허설 전용.** 프로젝트 이름에 `rehearsal` 이 없으면 거부한다 — 이 시험은 Storage 에
 *   파일을 남기고, 운영은 「실학생 데이터가 들어오기 전 0행」이 검증 기준선이다.
 *   비밀번호를 갈아끼우므로 실계정에 절대 돌리면 안 된다.
 *
 * 사용: SUPABASE_PROJECT_REF=<리허설ref> node tools/업로드왕복시험.js <auth_user_id> <learner_id>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { 경로검사 } = require('../lib/업로드경로.js');

const API = 'https://api.supabase.com/v1/projects';
const die = (m) => { console.error(`[업로드왕복] ${m}`); process.exit(1); };

function env읽기() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const 줄 of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = 줄.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/** 16kHz·16bit·mono PCM WAV 한 조각 — 규격 정본(C0 §4-2)과 같은 모양으로 만든다. */
function wav(샘플수 = 1600) {
  const 데이터 = 샘플수 * 2;
  const b = Buffer.alloc(44 + 데이터);
  b.write('RIFF', 0); b.writeUInt32LE(36 + 데이터, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(데이터, 40);
  return b;
}

const 결과 = [];
const 잰다 = (이름, 통과, 곁 = '') => {
  결과.push({ 이름, 통과 });
  console.log(`${통과 ? '  ✅' : '  ❌'} ${이름}${곁 ? ` — ${곁}` : ''}`);
};

async function main() {
  const [auth_user_id, learner_id] = process.argv.slice(2);
  if (!auth_user_id || !learner_id) die('사용: node tools/업로드왕복시험.js <auth_user_id> <learner_id>');

  const e = { ...env읽기(), ...process.env };
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const 헤더 = { Authorization: `Bearer ${토큰}` };

  const pr = await fetch(`${API}/${ref}`, { headers: 헤더 });
  const 이름 = pr.ok ? (JSON.parse(await pr.text()).name ?? '') : '';
  console.log(`[업로드왕복] 대상 ▸ ${이름}  (${ref})`);
  if (!/rehearsal/i.test(이름)) {
    die(`리허설이 아니다(${이름}) — 이 시험은 파일을 남기고 비밀번호를 갈아끼운다. 운영에는 안 돌린다.`);
  }

  const kr = await fetch(`${API}/${ref}/api-keys`, { headers: 헤더 });
  if (!kr.ok) die(`api-keys HTTP ${kr.status}`);
  const 키들 = JSON.parse(await kr.text());
  const anon = 키들.find((k) => k.name === 'anon')?.api_key;
  const svc = 키들.find((k) => k.name === 'service_role')?.api_key;
  if (!anon || !svc) die('anon·service_role 키를 못 찾았다');

  const base = `https://${ref}.supabase.co`;
  const 관리 = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' };

  // ① 시험용 비밀번호를 심는다(리허설 계정이라 안전). 이메일은 계정에서 읽는다 — 규칙을 지어내지 않는다.
  const ur = await fetch(`${base}/auth/v1/admin/users/${auth_user_id}`, { headers: 관리 });
  if (!ur.ok) die(`사용자 조회 HTTP ${ur.status} — ${(await ur.text()).slice(0, 200)}`);
  const email = JSON.parse(await ur.text()).email;
  const 비번 = `rehearsal-${auth_user_id.slice(0, 8)}-Aa1!`;
  const pw = await fetch(`${base}/auth/v1/admin/users/${auth_user_id}`, {
    method: 'PUT', headers: 관리, body: JSON.stringify({ password: 비번 }),
  });
  if (!pw.ok) die(`비밀번호 설정 HTTP ${pw.status} — ${(await pw.text()).slice(0, 200)}`);

  // ② 학생으로 로그인 — 여기부터는 anon 키만 쓴다(앱이 가진 것과 같은 권한).
  const tr = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 비번 }),
  });
  if (!tr.ok) die(`로그인 HTTP ${tr.status} — ${(await tr.text()).slice(0, 200)}`);
  const jwt = JSON.parse(await tr.text()).access_token;

  const 부르기 = (몸, cv = 'c7') => fetch(`${base}/functions/v1/uploads/sign`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'X-Contract-Ver': cv },
    body: JSON.stringify(몸),
  });

  // ③ 정상 발급
  const r1 = await 부르기({ kind: 'audio', content_type: 'audio/wav', byte_size: 3244 });
  const b1 = await r1.json();
  // 실패했으면 **이유까지** 낸다 — 「❌ HTTP 502」만 내는 시험은 원인을 사람에게 떠넘긴다.
  잰다('학생 토큰으로 서명이 나온다', r1.status === 200 && !!b1.upload_url,
    r1.status === 200 ? 'HTTP 200' : `HTTP ${r1.status} · ${JSON.stringify(b1.error ?? b1).slice(0, 200)}`);
  if (r1.status !== 200) die('서명이 안 나와서 뒤 단계를 잴 수 없다 — 위 이유부터 푼다');
  잰다('참조가 경로 규칙 안이다', !!b1.audio_ref && 경로검사(b1.audio_ref, learner_id).ok, b1.audio_ref || '(없음)');
  잰다('첫 칸이 voice 다', String(b1.audio_ref || '').startsWith('voice/'));
  잰다('둘째 칸이 이 학생의 learner_id 다', String(b1.audio_ref || '').split('/')[1] === learner_id);
  잰다('만료 시각이 미래다', Date.parse(b1.expires_at || '') > Date.now());

  // ④ 🔑 서명이 **실제로 먹는가** — 여기까지 와야 「올라간다」가 증명된다.
  const 몸 = wav();
  const up = await fetch(b1.upload_url, {
    method: 'PUT', headers: { 'Content-Type': 'audio/wav' }, body: 몸,
  });
  잰다('그 서명으로 파일이 실제로 올라간다', up.ok, `HTTP ${up.status}`);

  // ⑤ 올라간 자리를 Storage 목록에서 확인한다 — 「200 이 떴다」와 「그 경로에 있다」는 다른 사실이다.
  const ls = await fetch(`${base}/storage/v1/object/list/learner-media`, {
    method: 'POST', headers: 관리,
    body: JSON.stringify({ prefix: `voice/${learner_id}`, limit: 100 }),
  });
  const 목록 = ls.ok ? await ls.json() : [];
  const 파일명 = String(b1.audio_ref || '').split('/').pop();
  잰다('그 경로에 파일이 실재한다', Array.isArray(목록) && 목록.some((o) => o.name === 파일명),
    `voice/${learner_id}/ 아래 ${Array.isArray(목록) ? 목록.length : 0}개`);

  // ⑥ 상한·kind 불일치·규격 밖
  const r2 = await 부르기({ kind: 'audio', content_type: 'audio/wav', byte_size: 26 * 1024 * 1024 });
  잰다('25MB 를 넘으면 거부한다', r2.status === 413, `HTTP ${r2.status}`);
  const r3 = await 부르기({ kind: 'audio', content_type: 'image/png', byte_size: 100 });
  잰다('kind 와 content_type 이 어긋나면 거부한다', r3.status === 400, `HTTP ${r3.status}`);
  const r4 = await 부르기({ kind: 'audio', content_type: 'audio/m4a', byte_size: 100 });
  const b4 = await r4.json();
  잰다('규격 밖(m4a)도 받아준다 — 거부하면 발화가 영영 사라진다', r4.status === 200);
  잰다('확장자는 실제 그것으로 적는다(.wav 로 위장하지 않는다)', String(b4.audio_ref || '').endsWith('.m4a'), b4.audio_ref || '');
  const r5 = await 부르기({ kind: 'audio', content_type: 'audio/wav', byte_size: 100 }, 'c99');
  잰다('DB 보다 새 계약판은 거절한다', r5.status === 426, `HTTP ${r5.status}`);

  const 실패 = 결과.filter((r) => !r.통과);
  console.log(`\n[업로드왕복] ${결과.length - 실패.length}/${결과.length}`);
  if (실패.length) process.exit(1);
}

main().catch((err) => die(String((err && err.message) || err)));
