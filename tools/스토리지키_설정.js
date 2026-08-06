#!/usr/bin/env node
/* 스토리지키_설정 — 함수 시크릿 `STORAGE_SIGN_KEY` 를 그 프로젝트의 **레거시 service_role
 * (JWT) 키**로 맞춘다.
 *
 * ■ 왜 필요한가 (2026-08-06 리허설 실측)
 *   플랫폼이 함수에 넣어주는 `SUPABASE_SERVICE_ROLE_KEY` 의 값이 **새 형식(`sb_secret_…`)** 인데,
 *   Storage 는 그걸 거절한다 — `{"statusCode":"403","message":"Invalid Compact JWS"}`.
 *   헤더 조합 5가지를 전부 쏴 본 결과 **통과한 것은 레거시 JWT 키뿐**이었다:
 *       legacy · Authorization 단독   → 200
 *       legacy · apikey+Authorization → 200
 *       secret · Authorization 단독   → 400   secret · apikey 단독 → 400   secret · 둘 다 → 400
 *   증상은 「업로드만 안 됨」이고 함수는 502 만 냈다. **이름이 뜻하는 바가 플랫폼 사정으로
 *   조용히 바뀐 것**이라, 그 이름에 계속 기대는 대신 우리가 이름을 정해 명시로 받는다.
 *
 * ■ 키는 저장소에 안 들어온다 — Management API 로 그때 받아 그 프로젝트 시크릿에만 넣는다.
 *   stdout 에도 안 찍는다(앞 6글자와 JWT 여부만 보여 준다).
 *
 * 사용: SUPABASE_PROJECT_REF=<ref> node tools/스토리지키_설정.js [--적용]
 *   `--적용` 없이는 **무엇을 할지만** 보여 준다(시크릿 쓰기는 되돌리기가 번거롭다).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const API = 'https://api.supabase.com/v1/projects';
const die = (m) => { console.error(`[스토리지키] ${m}`); process.exit(1); };

const 자격증명 = require('../lib/자격증명.js');   // .env 읽기 + 토큰 만료 게이트(공용 통로)

async function main() {
  const 적용 = process.argv.includes('--적용');
  const e = 자격증명.읽기('스토리지키');
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const 헤더 = { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' };

  // 🔴 쏘기 직전에 과녁을 소리 내어 읽는다 — 프로젝트가 둘이면 ref 문자열로는 사람이 못 가른다.
  const pr = await fetch(`${API}/${ref}`, { headers: 헤더 });
  const 이름 = pr.ok ? (JSON.parse(await pr.text()).name ?? '(이름 조회 실패)') : '(이름 조회 실패)';
  console.error(`[스토리지키] 대상 ▸ ${이름}  (${ref})${적용 ? '  ⚠ 쓰기(--적용)' : '  미리보기'}`);

  const kr = await fetch(`${API}/${ref}/api-keys`, { headers: 헤더 });
  if (!kr.ok) die(`api-keys HTTP ${kr.status}`);
  const 키들 = JSON.parse(await kr.text());
  const legacy = 키들.find((k) => k.name === 'service_role' && String(k.api_key).split('.').length === 3);
  if (!legacy) {
    die('레거시 service_role(JWT) 키를 못 찾았다 — 이 프로젝트는 새 키만 있다.\n' +
        '     그러면 Storage 서명이 안 된다(Invalid Compact JWS). 대시보드에서 레거시 키를 켜야 한다.');
  }
  const 값 = legacy.api_key;
  console.log(`  넣을 값: ${값.slice(0, 6)}…  (JWT 형태 ✅ · 길이 ${값.length})`);

  if (!적용) {
    console.log('  미리보기다 — 실제로 넣으려면 --적용');
    return;
  }
  const r = await fetch(`${API}/${ref}/secrets`, {
    method: 'POST', headers: 헤더,
    body: JSON.stringify([{ name: 'STORAGE_SIGN_KEY', value: 값 }]),
  });
  if (!r.ok) die(`시크릿 설정 HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);

  // 넣었다고 믿지 말고 목록에서 확인한다(값은 안 돌려준다 — 이름만 본다).
  const lr = await fetch(`${API}/${ref}/secrets`, { headers: 헤더 });
  const 있음 = lr.ok && JSON.parse(await lr.text()).some((s) => s.name === 'STORAGE_SIGN_KEY');
  console.log(있음 ? '  ✅ STORAGE_SIGN_KEY 등록됨' : '  ❌ 목록에 안 보인다');
  if (!있음) process.exit(1);
}

main().catch((err) => die(String((err && err.message) || err)));
