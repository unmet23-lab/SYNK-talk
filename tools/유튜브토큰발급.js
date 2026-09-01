#!/usr/bin/env node
/* 유튜브 토큰 발급 — 수집봇이 쓸 OAuth 리프레시 토큰을 «그 채널의 계정으로» 받아 `.env` 에 앉힌다.
 *                                                                         (2026-09-02 신설)
 * ■ 왜 도구인가 — 이 자리가 라디오의 마지막 «사람 손» 셋 중 하나인데 통로가 0줄이었다.
 *   저장소 전체에 토큰 발급 코드가 없었다(09-02 실측). 그래서 매번 손으로 URL 을 만들고
 *   코드를 붙여넣게 되는데, 그 길에는 **조용히 틀리는 자리가 셋** 있다(아래 🔴).
 *
 * ■ 🔴 조용히 틀리는 셋 — 이 도구가 막는 것
 *   ① **동의 화면에서 «개인 채널»을 고르면 끝난다.** SYNK LAB 은 브랜드 계정이라
 *      같은 로그인에 채널이 여럿이다. 잘못 고르면 토큰은 **정상 발급되고**, 봇도 정상으로 뜨고,
 *      그런데 `search.list` 가 남의 채널을 뒤져 **수집이 영원히 0** 이다(오류 0줄).
 *      ⇒ 받은 토큰으로 `channels?mine=true` 를 쳐서 `RADIO_CHANNEL_ID` 와 **대조하고,
 *        다르면 .env 에 안 쓴다.** 이 대조가 이 파일의 존재 이유다.
 *   ② **`prompt=consent` 를 빼면 refresh_token 이 «안 온다».** 두 번째 발급부터 구글은
 *      access_token 만 주고, 그 사실은 응답에 칸이 없는 것으로만 드러난다.
 *   ③ **앱이 「테스트」 상태면 refresh_token 이 7일마다 죽는다**(봇 머리말 실측 · §6-3).
 *      갱신도 같이 실패하고, 남는 증상은 `ingest_heartbeat` 의 «구멍»뿐이다.
 *      ⇒ 발급 직후 그 사실을 크게 알린다. 프로덕션 게시는 사람 손이라 도구가 못 한다.
 *
 * ■ 🚫 OOB(`urn:ietf:wg:oauth:2.0:oob`)는 2022 에 죽었다 — 루프백만 쓴다.
 *   그래서 이 도구가 잠깐 로컬 서버를 띄우고 브라우저가 거기로 코드를 되던진다.
 *   OAuth 클라이언트는 **「데스크톱 앱」**으로 만든다 — 그 종류만 `http://localhost:<아무 포트>` 를
 *   자동으로 허용한다(웹 애플리케이션으로 만들면 포트를 미리 등록해야 한다).
 *
 * ■ 값은 화면에 안 나온다 — 앞 6자만. 저장은 `.env` 뿐이고 .gitignore 가 지킨다.
 *
 * 먼저 할 것(유호님 손 · 한 번):
 *   Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → 「+ 사용자 인증 정보 만들기」
 *   → OAuth 클라이언트 ID → 애플리케이션 유형 **「데스크톱 앱」** → 만들기
 *   → 나온 클라이언트 ID·보안 비밀번호를 `.env` 에 두 줄:
 *       RADIO_YT_CLIENT_ID=...
 *       RADIO_YT_CLIENT_SECRET=...
 *   그리고 「OAuth 동의 화면」에서 **게시 상태 = 프로덕션**(위 ③).
 *
 * 쓰기:
 *   node tools/유튜브토큰발급.js            무엇이 준비됐나만 본다(네트워크 0 · 값 안 찍음)
 *   node tools/유튜브토큰발급.js --발급     브라우저를 열고 토큰을 받아 .env 에 앉힌다
 *   node tools/유튜브토큰발급.js --점검     그 토큰으로 **실제로 유튜브가 열리나** 왕복해 본다
 *                                          (⚠ search.list 한 번 = 100유닛 · 반복해 돌리지 않는다)
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const 자격증명 = require('../lib/자격증명.js');
const { 인자게이트 } = require('../lib/플래그.js');

/* 🔴 `공용플래그`(=`--운영`)를 **안 편다** — 이 도구엔 조준 축이 없다.
 *   토큰은 프로젝트가 아니라 «유튜브 채널»에 매이고, 그 채널은 `.env RADIO_CHANNEL_ID` 하나다.
 *   받아 주고 아무것도 안 갈아타면 「받은 척」이 초록으로 나간다(F592 · 회귀가 09-02 에 잡았다). */
const 아는플래그 = ['--발급', '--점검'];

/* 봇이 실제로 부르는 것 = search.list · liveChatMessages.list · liveChatMessages.insert.
 * 셋을 다 덮는 최소 스코프는 force-ssl 하나다(readonly 로는 insert 가 401). */
const 스코프 = 'https://www.googleapis.com/auth/youtube.force-ssl';
const 인증끝점 = 'https://accounts.google.com/o/oauth2/v2/auth';
const 토큰끝점 = 'https://oauth2.googleapis.com/token';
const YT = 'https://www.googleapis.com/youtube/v3';

const die = (m) => { console.error(`[토큰발급] ${m}`); process.exit(1); };
const 앞6 = (s) => (s ? `${String(s).slice(0, 6)}…` : '(빈값)');

/** `.env` 한 칸 읽기 — 없으면 빈 문자열. */
function env(칸) {
  const p = 자격증명.ENV파일;
  if (!fs.existsSync(p)) return '';
  const m = new RegExp(`^${칸}=(.*)$`, 'm').exec(fs.readFileSync(p, 'utf8'));
  return m ? m[1].trim() : '';
}

/** `.env` 한 칸 쓰기 — 착지 도구와 같은 문법(있으면 갈아 끼우고 없으면 붙인다). */
function env쓰기(칸, 값) {
  const p = 자격증명.ENV파일;
  const 원문 = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const 줄 = `${칸}=${값}`;
  const 다음 = new RegExp(`^${칸}=.*$`, 'm').test(원문)
    ? 원문.replace(new RegExp(`^${칸}=.*$`, 'm'), 줄)
    : 원문 + (원문.endsWith('\n') || 원문 === '' ? '' : '\n') + 줄 + '\n';
  fs.writeFileSync(p, 다음);
}

function 브라우저열기(url) {
  /* 윈도우에서 `start` 는 셸 내장이라 cmd 를 거쳐야 한다. 못 열려도 죽지 않는다 —
   * URL 을 찍어 두니 사람이 붙여넣으면 된다(도구가 브라우저 때문에 멈추면 안 된다).
   *
   * 🔴 2026-09-02 실측 — **cmd 는 URL 의 `&` 를 명령 구분자로 자른다.**
   *   따옴표 없이 넘겼더니 `client_id=…` 까지만 열리고 뒤가 통째로 날아가
   *   구글이 「Required parameter is missing: response_type · 400 invalid_request」를 냈다.
   *   증상이 «우리 코드 오류»가 아니라 «구글이 거절»로 보여서 한참 엉뚱한 데를 본다.
   *   ⇒ 큰따옴표로 감싼다(따옴표 «안»의 `&` 는 cmd 가 안 자른다). `start` 의 첫 `""` 는 창 제목 자리라
   *     그것까지 있어야 URL 이 제목으로 먹히지 않는다. */
  try {
    if (process.platform === 'win32') {
      spawn(`start "" "${url}"`, { shell: true, detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* 못 열면 사람이 붙여넣는다 */ }
}

/**
 * 잠깐 서는 루프백 서버 — 코드 한 번 받고 스스로 닫는다.
 * 포트를 «먼저» 알아야 리디렉션 URI 를 만들 수 있어서, listen 을 기다린 뒤
 * `{ 포트, 코드 }` 를 돌려준다(코드는 브라우저가 되던질 때 풀리는 약속).
 * @param {string} 기대state CSRF 대조값
 */
function 루프백(기대state) {
  let 코드풀기; let 코드깨기;
  const 코드 = new Promise((res, rej) => { 코드풀기 = res; 코드깨기 = rej; });

  const 답하기 = (res, 글) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<meta charset=utf-8><body style="font:16px/1.7 system-ui;padding:48px;background:#FBF7F0;color:#2B2320">${글}</body>`);
  };

  const 서버 = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname !== '/') { res.writeHead(404).end(); return; }   // 파비콘 등은 무시
    const err = u.searchParams.get('error');
    if (err) { 답하기(res, `❌ 거절됐습니다 — ${err}<br>터미널로 돌아가세요.`); 서버.close(); return 코드깨기(new Error(`동의 거절: ${err}`)); }
    const code = u.searchParams.get('code');
    /* state 대조 — 없으면 남이 던진 코드를 우리 것으로 착각할 수 있다(CSRF). */
    if (!code || u.searchParams.get('state') !== 기대state) {
      답하기(res, '❌ 값이 어긋났습니다. 터미널로 돌아가세요.'); 서버.close(); return 코드깨기(new Error('code/state 어긋남'));
    }
    답하기(res, '✅ 받았습니다. 창을 닫고 터미널로 돌아가세요.');
    서버.close();
    return 코드풀기(code);
  });

  return new Promise((resolve, reject) => {
    서버.on('error', reject);
    서버.listen(0, '127.0.0.1', () => resolve({ 포트: 서버.address().port, 코드 }));
  });
}

async function 발급() {
  const id = env('RADIO_YT_CLIENT_ID');
  const secret = env('RADIO_YT_CLIENT_SECRET');
  const 채널 = env('RADIO_CHANNEL_ID');
  if (!id || !secret) die('.env 에 RADIO_YT_CLIENT_ID·RADIO_YT_CLIENT_SECRET 이 필요하다 — 머리말의 «먼저 할 것» 참고.');
  if (!채널) die('.env 에 RADIO_CHANNEL_ID 가 필요하다 — 이게 없으면 «어느 채널로 발급됐나»를 대조할 수 없다(이 도구의 존재 이유).');

  /* 서버를 먼저 띄워 포트를 알아낸다 — 리디렉션 URI 에 그 포트가 들어가야 한다. */
  const state = crypto.randomBytes(16).toString('hex');
  const { 포트, 코드: 코드약속 } = await 루프백(state);
  const 리디렉션 = `http://localhost:${포트}`;

  const 인증URL = `${인증끝점}?${new URLSearchParams({
    client_id: id,
    redirect_uri: 리디렉션,
    response_type: 'code',
    scope: 스코프,
    access_type: 'offline',        // ← 없으면 refresh_token 이 아예 안 온다
    prompt: 'consent',             // ← 🔴 없으면 «두 번째부터» 조용히 안 온다(위 ②)
    state,
  })}`;

  console.log('\n브라우저가 열립니다. 안 열리면 아래 주소를 붙여넣으세요:\n');
  console.log(`  ${인증URL}\n`);
  console.log('🔴 동의 화면에서 **채널을 고르는 칸**이 나오면 반드시 «SYNK LAB» 을 고르세요.');
  console.log('   개인 채널을 고르면 토큰은 정상 발급되는데 수집이 영원히 0 이 됩니다(오류 0줄).');
  console.log('   ⇒ 그래서 이 도구가 받은 뒤 채널을 대조하고, 다르면 .env 에 안 씁니다.\n');
  브라우저열기(인증URL);

  const code = await 코드약속;

  const tr = await fetch(토큰끝점, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: 리디렉션, grant_type: 'authorization_code' }),
  });
  if (!tr.ok) die(`토큰 교환 HTTP ${tr.status} — ${(await tr.text()).slice(0, 300)}`);
  const 토큰 = await tr.json();
  if (!토큰.refresh_token) {
    die('refresh_token 이 안 왔다 — access_type=offline·prompt=consent 가 빠졌거나, '
      + '이미 승인된 앱이라 구글이 생략했다. 계정의 「타사 앱 액세스」에서 이 앱을 지우고 다시 돌린다.');
  }

  /* 🔴 대조 — 이 도구의 심장. 받은 토큰이 «그 채널»의 것인지 본다. */
  const cr = await fetch(`${YT}/channels?part=id,snippet&mine=true`, {
    headers: { authorization: `Bearer ${토큰.access_token}` },
  });
  if (!cr.ok) die(`채널 대조 실패 HTTP ${cr.status} — ${(await cr.text()).slice(0, 300)}`);
  const 목록 = (await cr.json()).items || [];
  if (!목록.length) die('이 토큰으로 보이는 채널이 0개다 — 동의 화면에서 채널을 안 골랐을 수 있다.');
  const 받은채널 = 목록[0].id;
  const 받은이름 = (목록[0].snippet && 목록[0].snippet.title) || '(이름 없음)';

  if (받은채널 !== 채널) {
    console.error(`\n❌ **다른 채널로 발급됐다 — .env 에 안 쓴다.**`);
    console.error(`   받은 것 : ${받은채널}  「${받은이름}」`);
    console.error(`   기대한 것: ${채널}  (.env RADIO_CHANNEL_ID)`);
    console.error(`\n   다시 하는 법: 구글 계정 → 보안 → 「타사 앱 액세스」에서 이 앱을 지운 뒤`);
    console.error(`   다시 돌리고, 동의 화면의 **채널 고르는 칸에서 SYNK LAB** 을 고른다.`);
    process.exit(1);
  }

  env쓰기('RADIO_YT_REFRESH_TOKEN', 토큰.refresh_token);
  console.log(`\n✅ 채널 대조 통과 — ${받은채널} 「${받은이름}」`);
  console.log(`✅ .env RADIO_YT_REFRESH_TOKEN 앉혔다 (앞 6자 ${앞6(토큰.refresh_token)})`);
  console.log(`   스코프 = ${토큰.scope || 스코프}`);
  console.log('\n🔴 남은 사람 손 하나 — **OAuth 동의 화면의 게시 상태가 「프로덕션」인지** 보세요.');
  console.log('   「테스트」로 남으면 이 refresh_token 이 **7일 뒤 죽습니다**. 그때 증상은 오류가 아니라');
  console.log('   ingest_heartbeat 의 «구멍»뿐이라 며칠 지나서야 압니다(§6-3).');
}

/**
 * 🔴 «있다»와 «돈다»는 다른 사실이다 — `.env` 에 값이 있는 것과 그 값으로 유튜브가 열리는 것은 다르다.
 * 이 갈래가 실제로 왕복한다: 갱신토큰 → 액세스토큰 → `channels?mine=true` → 채널 대조 → `search.list`.
 * 쓰는 자리 = VPS 를 세우는 날 「봇을 켜기 전에」 · 오래 안 쓴 토큰이 아직 사나 볼 때.
 */
async function 점검() {
  const 칸 = { id: env('RADIO_YT_CLIENT_ID'), secret: env('RADIO_YT_CLIENT_SECRET'), 갱신: env('RADIO_YT_REFRESH_TOKEN'), 채널: env('RADIO_CHANNEL_ID') };
  for (const [k, v] of Object.entries(칸)) if (!v) die(`.env 에 ${k} 가 없다 — 먼저 --발급`);

  const tr = await fetch(토큰끝점, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: 칸.id, client_secret: 칸.secret, refresh_token: 칸.갱신, grant_type: 'refresh_token' }),
  });
  if (!tr.ok) {
    const 몸 = (await tr.text()).slice(0, 300);
    console.error(`❌ 갱신 실패 HTTP ${tr.status} — ${몸}`);
    if (/invalid_grant/.test(몸)) {
      console.error('   `invalid_grant` = 갱신토큰이 죽었다. 흔한 까닭 둘:');
      console.error('     ㉠ OAuth 동의 화면이 「테스트」 상태다 → 7일마다 죽는다. 프로덕션으로 게시한다.');
      console.error('     ㉡ 계정에서 이 앱의 액세스를 해제했다 → --발급 으로 다시 받는다.');
    }
    process.exit(1);
  }
  const t = await tr.json();
  console.log(`✅ 액세스 토큰 갱신됨 (만료 ${t.expires_in}초)`);

  const cr = await fetch(`${YT}/channels?part=id,snippet&mine=true`, { headers: { authorization: `Bearer ${t.access_token}` } });
  if (!cr.ok) die(`channels 조회 HTTP ${cr.status} — ${(await cr.text()).slice(0, 200)}`);
  const it = ((await cr.json()).items || [])[0];
  const 이름 = (it && it.snippet && it.snippet.title) || '?';
  console.log(`✅ 이 토큰이 보는 채널 = ${it ? it.id : '(없음)'} 「${이름}」`);
  if (!it || it.id !== 칸.채널) {
    console.error(`❌ .env RADIO_CHANNEL_ID(${칸.채널})와 **다르다** — 봇이 남의 채널을 뒤진다(오류 0줄로).`);
    process.exit(1);
  }
  console.log('   ✅ .env RADIO_CHANNEL_ID 와 같다');

  /* 봇이 실제로 첫 번째로 치는 호출을 그대로 한 번 — 권한·스코프가 진짜 열렸는지 본다.
   * ⚠ 이 한 번이 **100유닛**이다(하루 10,000 중). 점검을 반복해서 돌리지 않는다. */
  const s = await fetch(`${YT}/search?part=id&channelId=${칸.채널}&eventType=live&type=video&maxResults=5`, { headers: { authorization: `Bearer ${t.access_token}` } });
  if (!s.ok) die(`search.list HTTP ${s.status} — ${(await s.text()).slice(0, 200)}`);
  const n = ((await s.json()).items || []).length;
  console.log(`✅ search.list(활성 방송) HTTP 200 — 지금 방송 ${n}건${n === 0 ? ' (송출 전이면 0이 맞다)' : ''}`);
  console.log('   ⚠ 이 호출 하나가 100유닛이다 — 점검을 반복해 돌리지 않는다.');
}

function 상태() {
  const 칸 = ['RADIO_CHANNEL_ID', 'RADIO_YT_CLIENT_ID', 'RADIO_YT_CLIENT_SECRET', 'RADIO_YT_REFRESH_TOKEN'];
  console.log('[토큰발급] 지금 .env 상태 (값은 안 찍는다 · 네트워크 안 씀)');
  let 빈칸 = 0;
  for (const c of 칸) {
    const v = env(c);
    if (v) console.log(`  ✅ ${c.padEnd(24)} ${앞6(v)}`);
    else { 빈칸 += 1; console.log(`  ❌ ${c.padEnd(24)} 비었다`); }
  }
  console.log(`\n  합계 ${칸.length} = 찬 것 ${칸.length - 빈칸} + 빈 것 ${빈칸}`);
  if (!env('RADIO_YT_CLIENT_ID') || !env('RADIO_YT_CLIENT_SECRET')) {
    console.log('\n  먼저 «데스크톱 앱» OAuth 클라이언트를 만들어 두 줄을 .env 에 넣으세요 — 머리말 참고.');
  } else if (!env('RADIO_YT_REFRESH_TOKEN')) {
    console.log('\n  준비됐습니다 → node tools/유튜브토큰발급.js --발급');
  } else {
    console.log('\n  다 찼습니다. 다시 받으려면 --발급 (덮어씁니다).');
  }
}

function main() {
  const argv = process.argv.slice(2);
  const 오류 = 인자게이트('유튜브토큰발급', argv, 아는플래그);
  if (오류) { console.error(`[유튜브토큰발급] ${오류}`); process.exit(1); }
  if (argv.indexOf('--발급') >= 0) return 발급();
  if (argv.indexOf('--점검') >= 0) return 점검();
  상태();
  return undefined;
}

if (require.main === module) {
  Promise.resolve(main()).catch((e) => die(String((e && e.message) || e)));
}
module.exports = { 스코프 };
