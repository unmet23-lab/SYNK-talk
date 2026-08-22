#!/usr/bin/env node
/* 스토리지키_설정 — 함수 시크릿 `STORAGE_SIGN_KEY` 를 그 프로젝트의 **신형 시크릿 키**로 맞춘다.
 *   (없으면 레거시 service_role JWT 로 물러선다 — 둘 다 통한다. 아래 표가 근거.)
 *
 * ■ 왜 이 이름이 따로 있나 (2026-08-06)
 *   플랫폼이 함수에 넣어주는 `SUPABASE_SERVICE_ROLE_KEY` 의 «뜻»이 플랫폼 사정으로 조용히
 *   바뀌었고, 그날 Storage 는 그 새 값을 세 조합 모두 거절했다. 그래서 이름을 우리가 정해
 *   명시로 받기로 했다 — 그 판단은 지금도 산다(모양까지 우리가 검사한다).
 *
 * ■ 🔴 그런데 «어느 키냐»는 뒤집혔다 (2026-08-22 재실측 · 리허설)
 *                        Auth 단독      apikey 단독     **둘 다**
 *     레거시 JWT             ✅            ❌            ✅
 *     신형 sb_secret_        ❌ JWS오류     ✅            ✅
 *   플랫폼이 그 사이 신형 키를 받기 시작했다. 통과 조합이 「둘 다」 하나이므로 헤더 만드는 자리를
 *   `lib/업로드경로.js` 의 `저장소헤더` 하나로 모았고, 그 뒤로 **이 도구는 키 형식을 안 가린다.**
 *   ⏳ 그리고 레거시 anon·service_role JWT 는 **2026년 말 폐기 예고**다 — 개원(2027-02)보다
 *   앞이라, 이제 기본값은 신형 시크릿이다. 레거시로 두면 폐기일에 업로드가 통째로 죽는다.
 *
 * ■ 키는 저장소에 안 들어온다 — Management API 로 그때 받아 그 프로젝트 시크릿에만 넣는다.
 *   stdout 에도 안 찍는다(모양과 길이만 보여 준다).
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
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)

/* 이 도구가 아는 낱말 — `공용플래그`(=`--운영`)는 어느 도구에서든 뜻을 가지므로 펴 넣는다.
 * 빠뜨리면 되던 명령이 죽는다(F103) — `tests/플래그게이트.test.js` 가 소스 전량과 대조한다. */
const 아는플래그 = [...공용플래그, '--적용'];

async function main() {
  const args = process.argv.slice(2);
  const 플래그오류 = 인자게이트('스토리지키', args, 아는플래그);   // 모르는 낱말은 여기서 죽는다(F435)
  if (플래그오류) die(플래그오류);
  const 적용 = args.includes('--적용');
  const e = 자격증명.읽기('스토리지키');
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const 헤더 = { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' };

  // 🔴 쏘기 직전에 과녁을 소리 내어 읽는다 — 프로젝트가 둘이면 ref 문자열로는 사람이 못 가른다.
  const pr = await fetch(`${API}/${ref}`, { headers: 헤더 });
  const 이름 = pr.ok ? (JSON.parse(await pr.text()).name ?? '(이름 조회 실패)') : '(이름 조회 실패)';
  console.error(`[스토리지키] 대상 ▸ ${이름}  (${ref})${적용 ? '  ⚠ 쓰기(--적용)' : '  미리보기'}`);

  /* 🔴 `?reveal=true` 가 **없으면 신형 시크릿 키는 «가려진» 값으로 온다** — 길이도 접두사도
   *   진짜와 같아서 눈으로도 `length` 로도 안 갈린다(2026-08-22 실측: 가려진 값을 넣었더니
   *   업로드가 통째로 죽었고, 증상은 함수 500 하나였다). 레거시 JWT 는 가림 없이 와서 이
   *   도구가 그동안 안 걸렸던 자리다 — 키 시대가 바뀌며 열린 함정이다.
   * 🔑 갈랐다는 것은 다이제스트로만 확인된다(Management API `/secrets` 가 sha256 을 준다). */
  const kr = await fetch(`${API}/${ref}/api-keys?reveal=true`, { headers: 헤더 });
  if (!kr.ok) die(`api-keys HTTP ${kr.status}`);
  const 키들 = JSON.parse(await kr.text());
  /* 🔑 **신형 시크릿이 1순위다** — 레거시는 연말 폐기 예고라 그걸 넣으면 폐기일에 죽는다.
   *   둘 다 통하므로(머리말 표) 물러섬은 안전하다. */
  const 신형 = 키들.find((k) => String(k.api_key).startsWith('sb_secret_'));
  const legacy = 키들.find((k) => k.name === 'service_role' && String(k.api_key).split('.').length === 3);
  const 고른 = 신형 || legacy;
  if (!고른) {
    die('쓸 수 있는 키가 없다 — 신형 시크릿(sb_secret_)도 레거시 service_role(JWT)도 못 찾았다.');
  }
  const 값 = 고른.api_key;
  const 모양 = 신형 ? '신형 시크릿 ✅' : '레거시 JWT ⏳(연말 폐기 — 신형이 생기면 다시 돌려라)';
  console.log(`  넣을 값: ${모양} · 길이 ${값.length}`);

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
