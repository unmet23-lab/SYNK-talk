#!/usr/bin/env node
'use strict';
/**
 * 합성 밟기 계정 세우기 — Maestro 가 로그인할 학생 하나를 **리허설에** 만든다.
 *
 *   node tools/합성계정세우기.js                 # 미리보기 — 아무것도 안 만든다
 *   node tools/합성계정세우기.js --적용
 *
 * 🔑 **계정을 여기서 만들지 않는다.** §4-1 이 계정이 서는 자리를 `functions/auth` 의 첫 등록
 *   한 곳으로 못박았고, 두 번째 통로를 낸 것이 정확히 F269 였다. 이 도구는 그 함수를
 *   **학생이 앱에서 하는 것과 똑같이** HTTP 로 부른다 — 통로는 그대로 하나다.
 *
 * 🔴 리허설 전용. 운영 ref 면 아무것도 안 하고 죽는다 — 합성 학생이 운영 명부에 서면
 *   이해 대장이 오염되고, 그건 소급으로 못 가른다(`.maestro/README.md` 격리 규칙).
 *
 * 왜 도구인가 — 이 자격은 **다시 만들 일이 생긴다**(리허설 DB 를 갈아엎을 때마다). 그때
 *   손으로 curl 을 짜면 가입 문항·뒷자리·판 번호 중 하나가 빠지고, 증상은 늘 「로그인이
 *   안 된다」 하나라 원인이 안 보인다(F269 와 같은 모양).
 */
const fs = require('node:fs');
const path = require('node:path');
const 자격증명 = require('../lib/자격증명.js');
const { 이메일 } = require('../lib/학생계정.js');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(F435)

const ROOT = path.join(__dirname, '..');
/* 이 도구가 아는 낱말. `공용플래그`(=`--운영`)를 펴는 것은 규약이다 — `자격증명.읽기()` 가
 * 도구를 안 가리고 그 값을 조준에 쓰기 때문이다(F436). 다만 이 도구에서 `--운영` 은
 * **통과해도 아래 리허설 게이트에서 죽는다** — 합성 학생은 운영 명부에 서면 안 된다. */
const 아는플래그 = [...공용플래그, '--적용'];
const 적용 = process.argv.includes('--적용');

/* 합성 학생의 고정값 — 명부(`tools/명부등록.js`)에 이미 선 행과 **같아야** 한다. */
const 학생번호 = 'SYNK-900';
const 뒷자리 = '2200';
const 가입답 = { home_aimag: 'ulaanbaatar', gender: 'undisclosed', goal_track: 'study' };

/* 비밀번호는 여기서 «만들지» 않고 환경에서 받는다 — 소스에 박으면 그 순간 git 에 실린다.
 * 없으면 기계적으로 하나 짓되 **.env 로만 흘린다**(아래). */
const 비번 = process.env.MAESTRO_PASSWORD || 'Maestro-합성-900';

const die = (m) => { console.error('[합성계정] ' + m); process.exit(1); };

async function main() {
  /* 🔑 게이트는 던지지 않고 «문장을 돌려준다» — 답을 안 받으면 모르는 낱말이 조용히 무시된다
   *   (F400 계열 · `tests/플래그게이트.test.js` ③-2 가 이 자리를 기계로 본다). */
  const 플래그오류 = 인자게이트('합성계정세우기', process.argv.slice(2), 아는플래그);
  if (플래그오류) die(플래그오류);

  const env = 자격증명.읽기();
  const ref = env.SUPABASE_PROJECT_REF;
  const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!ref || !anon) die('SUPABASE_PROJECT_REF · EXPO_PUBLIC_SUPABASE_ANON_KEY 가 .env 에 있어야 한다.');

  /* 리허설 게이트 — 이름으로 가른다. 운영 ref 를 외워 박으면 프로젝트가 바뀌는 날 조용히 샌다. */
  const 이름 = await 프로젝트이름(ref, env.SUPABASE_ACCESS_TOKEN);
  console.log(`[합성계정] 대상 ▸ ${이름}  (${ref})  ${적용 ? '⚠ 쓰기(--적용)' : '미리보기'}`);
  if (!/rehearsal|리허설/i.test(이름 || '')) {
    die(`리허설이 아니다 — 「${이름}」. 합성 학생은 리허설에만 선다(.maestro/README.md 격리 규칙).`);
  }

  console.log(`  학생 ▸ ${학생번호}  (${이메일(학생번호)})   뒷자리 대조 ▸ ${뒷자리}`);
  if (!적용) {
    console.log('\n[미리보기] 아무것도 부르지 않았다. 맞으면 --적용 을 붙인다.');
    console.log('  ⚠ --적용 은 첫 등록을 «소모»한다 — 그 학생은 두 번 등록할 수 없다.');
    return;
  }

  const r = await fetch(`https://${ref}.supabase.co/functions/v1/auth/first-login`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...가입답, student_code: 학생번호, phone_last4: 뒷자리, password: 비번 }),
  });
  const 본문 = JSON.parse((await r.text()) || '{}');

  if (r.status !== 200) {
    /* 이미 등록된 학생이면 그것도 «세워진» 상태다 — 다만 비밀번호는 이 도구가 모른다. */
    const 코드 = 본문?.error?.code || r.status;
    if (String(코드).includes('ALREADY')) {
      die(`이미 첫 등록을 마친 학생이다(${코드}) — 비밀번호는 이 도구가 모른다.\n`
        + '  다시 세우려면 리허설에서 그 학생의 계정을 지우고 다시 부른다.');
    }
    die(`첫 등록 실패 — HTTP ${r.status} · ${JSON.stringify(본문)}`);
  }

  console.log('✅ 계정이 섰다 (auth 함수가 만들었다 — 통로는 하나 그대로).');
  자격흘리기();
}

/* 자격은 **.env 로만** 나간다 — stdout 에 찍으면 셸 이력·로그·스크린샷에 남는다. */
function 자격흘리기() {
  const p = path.join(ROOT, '.env');
  let 원문 = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const 넣기 = (k, v) => {
    if (new RegExp(`^${k}=`, 'm').test(원문)) 원문 = 원문.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`);
    else 원문 += (원문.endsWith('\n') || !원문 ? '' : '\n') + `${k}=${v}\n`;
  };
  /* 🔑 이름은 ASCII 다 — 이 두 줄은 `.maestro/` 흐름으로 **셸을 건너간다**(F501 · 2026-08-17).
   *   옛 이름(`MAESTRO_학생번호`)은 bash 가 `not a valid identifier` 로 거절해서, 적어 놓고도
   *   세울 수 없었다. 규칙 정본 = `lib/자격증명.js` 의 `셸이세울수있나`. */
  넣기('MAESTRO_STUDENT_CODE', 학생번호);
  넣기('MAESTRO_PASSWORD', 비번);
  fs.writeFileSync(p, 원문);
  console.log('   자격을 .env 에 적었다 (MAESTRO_STUDENT_CODE · MAESTRO_PASSWORD) — git 밖이다.');
}

async function 프로젝트이름(ref, 토큰) {
  if (!토큰) return null;
  const r = await fetch('https://api.supabase.com/v1/projects', {
    headers: { Authorization: `Bearer ${토큰}` },
  });
  if (!r.ok) return null;
  return (await r.json()).find((p) => p.id === ref || p.ref === ref)?.name || null;
}

main().catch((e) => die(e.message));
