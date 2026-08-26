#!/usr/bin/env node
/**
 * 오류조회 — Sentry 에 쌓인 앱 오류를 **이 저장소에서** 읽는다.
 *
 * ■ 왜 있나 (2026-08-26)
 *   앱 오류 감시(Ⅲ⑧)는 08-15 에 이미 시공됐고 기기 위에서 실제로 섰다
 *   (`.maestro/README.md` — logcat `RNSentry: Starting with DSN …`). 그런데 그 README 가
 *   같은 자리에서 이렇게 적는다: **「Sentry 웹에 이벤트가 실제로 쌓였는지는 이 저장소에서
 *   못 본다 — 조회에 auth 토큰이 필요하고」**. 즉 **막힌 것은 감시가 아니라 「내가 읽는 길」**
 *   하나였다. 이 도구가 그 한 칸이다.
 *
 * ■ 🔑 왜 「토큰이 없으면 죽는다」가 아니라 「무엇을 하면 되는지 말하고 죽는다」인가
 *   이 도구를 부르는 사람(=AI 세션)은 토큰을 만들 수 없다 — **Sentry 의 토큰 생성 클릭은
 *   유호님 손이어야 한다**(합성 입력으로 상태를 바꾸는 것은 하네스가 막는다 ·
 *   memory `remote-browser-ops`). 그래서 실패 메시지가 곧 인계문이다. 「없다」로 끝나면
 *   다음 세션이 같은 자리를 다시 조사한다.
 *
 * ■ 자격증명 규율
 *   토큰은 `.env` 에만 산다 — 이 파일에도, 출력에도, 커밋에도 실리지 않는다.
 *   출력에 토큰 앞뒤를 찍지 않는다(마스킹조차 안 한다 — 찍을 이유가 없다).
 *
 * ■ 과녁
 *   org `synk-pz` · project `synk-talk` (2026-08-26 실측 · Sentry 웹에서 직접 확인).
 *   `.env` 가 덮어쓸 수 있게 두되, 없으면 이 기본값으로 돈다 — 둘 다 비밀이 아니다.
 *
 * 사용:
 *   node tools/오류조회.js                 최근 미해결 이슈 10건
 *   node tools/오류조회.js --수 25          건수 지정
 *   node tools/오류조회.js --전체           해결된 것까지
 *   node tools/오류조회.js --확인           토큰이 서 있는지만 보고 조회 안 함
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { 인자게이트 } = require('../lib/플래그.js');

const 기본org = 'synk-pz';
const 기본project = 'synk-talk';

/** 🔒 이 도구가 아는 «--» 낱말 전부 — 모르는 것은 §인자판정 에서 죽는다(F400·F435).
 *  🚫 `--운영` 은 안 받는다: Sentry 과녁은 하나뿐이라 갈아탈 자리가 없다. */
const 아는플래그 = ['--수', '--전체', '--확인'];

/**
 * `.env` 한 판 → 키·값 표. **순수 함수**다(파일을 안 읽는다) — 값이 갈리는 자리가 여기라
 * 회귀가 물 수 있어야 한다.
 * 따옴표는 벗기고, `#` 주석줄과 빈 줄은 건너뛴다. 값 안의 `=` 는 지킨다(URL·토큰에 흔하다).
 * @param {string} 텍스트 `.env` 원문
 * @returns {Record<string,string>}
 */
function env파싱(텍스트) {
  const 표 = {};
  for (const 줄 of String(텍스트).split('\n')) {
    const t = 줄.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const 키 = t.slice(0, i).trim();
    let 값 = t.slice(i + 1).trim();
    if ((값.startsWith('"') && 값.endsWith('"')) || (값.startsWith("'") && 값.endsWith("'"))) {
      값 = 값.slice(1, -1);
    }
    표[키] = 값;
  }
  return 표;
}

/** `.env` 를 읽는다 — 없으면 빈 표(그 자체가 오류는 아니다 · 셸이 이미 넣었을 수 있다). */
function env읽기() {
  const p = path.join(__dirname, '..', '.env');
  try {
    return env파싱(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * 인자 → 옵션. 순수 함수(던지기만 한다 · 파일·네트워크 없음).
 * 🔴 **모르는 낱말은 여기서 죽는다**(F400·F435) — 조용히 무시하면 `--미해결` 같은 오타 하나에
 *   「전체를 재놓고 미해결이라 읽는」 초록이 난다. 이 도구는 판정 재료를 내는 자리라 더 그렇다.
 */
function 인자판정(argv) {
  const 플래그오류 = 인자게이트('오류조회', argv, 아는플래그);
  if (플래그오류) throw new Error(플래그오류);
  const o = { 수: 10, 전체: false, 확인만: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--확인') o.확인만 = true;
    else if (a === '--전체') o.전체 = true;
    else if (a === '--수') { o.수 = Math.max(1, Math.min(100, Number(argv[i + 1]) || 10)); i += 1; }
  }
  return o;
}

const 없을때안내 = `
🔑 Sentry 조회 토큰이 아직 없다 — 앱 오류는 «쌓이고 있는데» 읽을 길만 막혀 있다.

유호님 손 (5분 · 한 번만):
  1) 이 주소를 연다 — https://synk-pz.sentry.io/settings/account/api/auth-tokens/new-token/
  2) Name 칸에 아무 이름  (예: synk-오류조회)
  3) PERMISSIONS 에서 셋만 «Read» 로 — 나머지는 No Access 그대로 둔다
       · Issue & Event  → Read      (오류·이벤트 본문)
       · Project        → Read      (프로젝트·태그)
       · Organization   → Read      (조직 조회)
     🔴 Write 는 하나도 주지 않는다 — 읽기만으로 충분하고, 새도 피해가 없다.
  4) [Create Token] → 나온 값을 복사
  5) SYNK-talk/.env 의 SENTRY_AUTH_TOKEN= 뒤에 붙여넣고 저장

그다음 이 도구가 그대로 돈다:  node tools/오류조회.js
`;

async function 본체() {
  const 옵션 = 인자판정(process.argv.slice(2));
  const env = { ...env읽기(), ...process.env };
  const 토큰 = env.SENTRY_AUTH_TOKEN;
  const org = env.SENTRY_ORG || 기본org;
  const project = env.SENTRY_PROJECT || 기본project;

  if (!토큰) {
    console.log(없을때안내);
    process.exit(2);
  }
  if (옵션.확인만) {
    console.log(`✅ 토큰이 서 있다 · 과녁 = ${org}/${project}`);
    return;
  }

  const query = 옵션.전체 ? '' : 'is:unresolved';
  const url = `https://sentry.io/api/0/projects/${org}/${project}/issues/`
    + `?limit=${옵션.수}&query=${encodeURIComponent(query)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${토큰}` } });
  if (!res.ok) {
    // 🔴 본문에 토큰이 실릴 일은 없지만, 그래도 상태와 사유만 낸다.
    console.error(`✘ Sentry 가 ${res.status} 를 냈다 (${res.statusText})`);
    if (res.status === 401) console.error('  → 토큰이 틀렸거나 폐기됐다. 위 안내대로 다시 만든다.');
    if (res.status === 403) console.error('  → 권한이 모자라다. Issue & Event = Read 를 켰는지 본다.');
    if (res.status === 404) console.error(`  → ${org}/${project} 를 못 찾는다. .env 의 SENTRY_ORG·SENTRY_PROJECT 를 본다.`);
    process.exit(1);
  }

  const 이슈들 = await res.json();
  if (!이슈들.length) {
    console.log(`✅ ${org}/${project} — ${옵션.전체 ? '이슈' : '미해결 이슈'}가 0건이다.`);
    console.log('   (0 = 「없다」이지 「안 재봤다」가 아니다 — 조회는 실제로 돌았다)');
    return;
  }

  console.log(`■ ${org}/${project} — ${옵션.전체 ? '전체' : '미해결'} ${이슈들.length}건\n`);
  for (const it of 이슈들) {
    const 횟수 = it.count ?? '?';
    const 사람 = it.userCount ?? 0;
    console.log(`  ${it.shortId}  [${it.level}]  ${it.title}`);
    console.log(`     ${횟수}회 · 사람 ${사람}명 · 처음 ${it.firstSeen} · 마지막 ${it.lastSeen}`);
    if (it.culprit) console.log(`     자리: ${it.culprit}`);
    console.log(`     ${it.permalink}`);
    console.log('');
  }
}

if (require.main === module) {
  본체().catch((e) => { console.error('✘', e.message); process.exit(1); });
}

module.exports = { env파싱, 인자판정 };
