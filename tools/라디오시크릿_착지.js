#!/usr/bin/env node
/* 라디오시크릿_착지 — 라디오 Fn 의 **좁은 시크릿**을 그 프로젝트의 함수 시크릿에 넣고,
 * 같은 값을 `.env` 에 남긴다. 지금 아는 것 둘 — `radio-ingest` · `radio-round`.
 *
 * ■ 왜 도구인가 (설계 §4-3 · 대기열 P1 라디오24 ①)
 *   봇은 service_role 을 들지 않는다 — Fn 하나만 여는 좁은 시크릿이 문이다.
 *   이 값은 **두 곳이 같아야만 산다**(Fn 시크릿 = 봇/왕복시험의 .env). 손으로 두 번 적으면
 *   갈라진 날의 증상이 「전건 401」이고, Management API 는 시크릿 값을 되돌려 주지 않아서
 *   (이름만 온다 — 스토리지키_설정.js 실측) 갈라지면 회전 말고는 길이 없다.
 *   그래서 생성·착지·기록을 한 통로에 묶는다.
 *
 * ■ 값은 화면에 안 나온다 — 앞 6자만. `.env` 는 .gitignore 가 지킨다(자격증명 예외 규칙).
 * ■ 프로젝트별 칸이 다르다 — 리허설 = `<이름>` · 운영 = `<이름>_PROD`.
 *   한 칸에 겹쳐 쓰면 과녁을 바꾼 날 반대쪽 값으로 401 이 난다(과녁판정과 같은 축).
 * ■ 이미 있으면 안 덮는다 — 남의 착지를 덮은 증상은 「조용함」뿐이다(F031 계열).
 *   정말 돌리려면 `--회전`(새 난수로 교체 · .env 도 같이 간다).
 * ■ 🔴 **이름을 자유 문자열로 안 받는다**(2026-08-16 · 이 상수를 푼 판). 아는 이름만 고르게 한다 —
 *   오타로 없는 이름을 착지시키면 증상이 **조용함**이다: Fn 은 제 이름만 읽으니 그대로 401 이고,
 *   프로젝트 시크릿 목록엔 아무도 안 읽는 쓰레기가 남는다. 새 Fn 이 생기면 `시크릿들` 에 한 줄 는다.
 *
 * 사용:
 *   node tools/라디오시크릿_착지.js                # 미리보기(인제스트 · 기본값)
 *   node tools/라디오시크릿_착지.js --적용         # 착지(없을 때만)
 *   node tools/라디오시크릿_착지.js --라운드 --적용 # radio-round 쪽 시크릿
 *   node tools/라디오시크릿_착지.js --적용 --회전  # 새 난수로 교체
 *   (운영에 쓰려면 SUPABASE_PROJECT_REF=<운영ref> + --운영 — 자격증명 게이트 그대로)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API = 'https://api.supabase.com/v1/projects';
const die = (m) => { console.error(`[라디오시크릿] ${m}`); process.exit(1); };

const 자격증명 = require('../lib/자격증명.js');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)

/* 이 도구가 아는 낱말 — `공용플래그`(=`--운영`)는 어느 도구에서든 뜻을 가지므로 펴 넣는다.
 * 빠뜨리면 되던 명령이 죽는다(F103) — `tests/플래그게이트.test.js` 가 소스 전량과 대조한다. */
const 아는플래그 = [...공용플래그, '--적용', '--회전', '--인제스트', '--라운드'];

/* 아는 시크릿만 — 값이 아니라 **이름**의 허용 목록이다(위 머리말 🔴).
 * 새 라디오 Fn 이 생기면 여기 한 줄 늘리고 `아는플래그` 에 같은 낱말을 넣는다
 * (안 넣으면 `인자게이트` 가 그 낱말을 모르는 것으로 죽인다 — F435·F103). */
const 시크릿들 = { '--인제스트': 'RADIO_INGEST_SECRET', '--라운드': 'RADIO_ROUND_SECRET' };
const 기본갈래 = '--인제스트';   // 안 고르면 예전 그대로 — 이 도구의 첫 소비자가 인제스트다

/* 순수 판정 — 네트워크·`.env` 를 안 본다(픽스처가 탐지를 진다 · F296).
 * 🔑 **둘을 같이 고르면 죽는다.** 조용히 하나를 이기게 두면 「내가 고른 것과 다른 시크릿이
 *   돌아갔다」가 되고, 그 증상도 401 이라 갈라낸 자리가 없다. */
function 이름판정(args) {
  const 고른것 = Object.keys(시크릿들).filter((f) => (args || []).includes(f));
  if (고른것.length > 1) {
    return { 오류: `시크릿 갈래를 둘 이상 골랐다(${고른것.join(' ')}) — 하나만 고른다.` };
  }
  return { 이름: 시크릿들[고른것[0] || 기본갈래] };
}

async function main() {
  const args = process.argv.slice(2);
  const 플래그오류 = 인자게이트('라디오시크릿', args, 아는플래그);   // 모르는 낱말은 여기서 죽는다(F435)
  if (플래그오류) die(플래그오류);
  const 적용 = args.includes('--적용');
  const 회전 = args.includes('--회전');
  const 갈래 = 이름판정(args);
  if (갈래.오류) die(갈래.오류);
  const 시크릿이름 = 갈래.이름;
  const e = 자격증명.읽기('라디오시크릿');
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const 헤더 = { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' };

  await 자격증명.대상알림('라디오시크릿', e, { 쓰기: 적용 });

  /* 프로젝트별 .env 칸 — 리허설과 운영의 값이 한 칸에 겹치지 않게 가른다. */
  const 칸 = ref === 자격증명.운영REF ? `${시크릿이름}_PROD` : 시크릿이름;

  // 덮기 전 목록부터 — 값은 안 오지만 「이미 있다」는 온다.
  const lr = await fetch(`${API}/${ref}/secrets`, { headers: 헤더 });
  if (!lr.ok) die(`시크릿 목록 HTTP ${lr.status}`);
  const 이미 = JSON.parse(await lr.text()).some((s) => s.name === 시크릿이름);

  if (이미 && !회전) {
    console.log(`  ${시크릿이름} 이미 등록돼 있다 — 덮지 않는다(교체는 --회전).`);
    if (!String(e[칸] || '')) {
      console.log(`  ⚠ 그런데 .env 의 ${칸} 은 비어 있다 — 값은 API 로 못 읽으니(이름만 온다) 맞추려면 --회전뿐이다.`);
      process.exit(1);
    }
    return;
  }

  const 값 = crypto.randomBytes(32).toString('hex');
  console.log(`  넣을 값: ${값.slice(0, 6)}…  (64자 난수${이미 ? ' · 기존 것을 돌린다' : ''})`);
  if (!적용) { console.log('  미리보기다 — 실제로 넣으려면 --적용'); return; }

  const r = await fetch(`${API}/${ref}/secrets`, {
    method: 'POST', headers: 헤더,
    body: JSON.stringify([{ name: 시크릿이름, value: 값 }]),
  });
  if (!r.ok) die(`시크릿 설정 HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);

  // 넣었다고 믿지 말고 목록에서 확인한다(값은 안 돌려준다 — 이름만 본다).
  const vr = await fetch(`${API}/${ref}/secrets`, { headers: 헤더 });
  const 있음 = vr.ok && JSON.parse(await vr.text()).some((s) => s.name === 시크릿이름);
  if (!있음) { console.log('  ❌ 목록에 안 보인다'); process.exit(1); }

  /* .env 기록 — 같은 값의 두 번째 사본이 아니라 **유일한 회수 통로**다(API 가 값을 안 준다). */
  const env경로 = 자격증명.ENV파일;   // 이미 절대경로다(자격증명 정본)
  const 원문 = fs.existsSync(env경로) ? fs.readFileSync(env경로, 'utf8') : '';
  const 줄 = `${칸}=${값}`;
  const 다음 = new RegExp(`^${칸}=.*$`, 'm').test(원문)
    ? 원문.replace(new RegExp(`^${칸}=.*$`, 'm'), 줄)
    : 원문 + (원문.endsWith('\n') || 원문 === '' ? '' : '\n') + 줄 + '\n';
  fs.writeFileSync(env경로, 다음);
  console.log(`  ✅ ${시크릿이름} 등록됨 · .env ${칸} 갱신됨 (값 앞 6자 ${값.slice(0, 6)}…)`);
}

if (require.main === module) main().catch((err) => die(String((err && err.message) || err)));
module.exports = { 이름판정, 시크릿들, 기본갈래, 아는플래그 };
