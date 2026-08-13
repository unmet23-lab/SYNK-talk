#!/usr/bin/env node
/* 라디오시크릿_착지 — `radio-ingest` 의 좁은 시크릿 `RADIO_INGEST_SECRET` 을
 * 그 프로젝트의 함수 시크릿에 넣고, 같은 값을 `.env` 에 남긴다.
 *
 * ■ 왜 도구인가 (설계 §4-3 · 대기열 P1 라디오24 ①)
 *   봇은 service_role 을 들지 않는다 — 인제스트 Fn 하나만 여는 좁은 시크릿이 문이다.
 *   이 값은 **두 곳이 같아야만 산다**(Fn 시크릿 = 봇/왕복시험의 .env). 손으로 두 번 적으면
 *   갈라진 날의 증상이 「전건 401」이고, Management API 는 시크릿 값을 되돌려 주지 않아서
 *   (이름만 온다 — 스토리지키_설정.js 실측) 갈라지면 회전 말고는 길이 없다.
 *   그래서 생성·착지·기록을 한 통로에 묶는다.
 *
 * ■ 값은 화면에 안 나온다 — 앞 6자만. `.env` 는 .gitignore 가 지킨다(자격증명 예외 규칙).
 * ■ 프로젝트별 칸이 다르다 — 리허설 = `RADIO_INGEST_SECRET` · 운영 = `RADIO_INGEST_SECRET_PROD`.
 *   한 칸에 겹쳐 쓰면 과녁을 바꾼 날 반대쪽 값으로 401 이 난다(과녁판정과 같은 축).
 * ■ 이미 있으면 안 덮는다 — 남의 착지를 덮은 증상은 「조용함」뿐이다(F031 계열).
 *   정말 돌리려면 `--회전`(새 난수로 교체 · .env 도 같이 간다).
 *
 * 사용:
 *   node tools/라디오시크릿_착지.js                # 미리보기(무엇을 할지만)
 *   node tools/라디오시크릿_착지.js --적용         # 착지(없을 때만)
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

const 시크릿이름 = 'RADIO_INGEST_SECRET';

async function main() {
  const 적용 = process.argv.includes('--적용');
  const 회전 = process.argv.includes('--회전');
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

main().catch((err) => die(String((err && err.message) || err)));
