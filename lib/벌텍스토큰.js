#!/usr/bin/env node
/* 벌텍스토큰 — Vertex AI(구글 클라우드 창구) 를 부를 때 쓰는 access token.
 *   (2026-09-05 · 유호 지시 「응 옮겨줘」 — 곡 값이 무료 크레딧 $300 밖으로 새던 것을 막는다)
 *
 * ■ 왜 생겼나 — **곡 값만 크레딧이 안 덮고 있었다.**
 *   구글 공식: `The $300 credit can't pay for Gemini API in AI Studio costs.`
 *   같은 모델이라도 «개인용 창구»(generativelanguage)로 부르면 크레딧이 못 내고,
 *   «클라우드 창구»(aiplatform)로 부르면 낸다. 09-04 에 appsscript 쪽 다섯 자리는 옮겼는데
 *   곡 굽는 이 저장소가 남아서, 09-05 실측으로 사흘에 ₩4,980 이 카드 쪽으로 샜다.
 *
 * ■ 🔴 왜 API 키가 아니라 토큰인가 — **Vertex 는 이 프로젝트에서 키를 «원리상» 못 받는다.**
 *   `gen-lang-client-0106203750` 은 조직 밖 프로젝트라 아래 정책을 끌 «자리»가 없다:
 *     `Operation denied by org policy: constraints/iam.managed.disableServiceAccountApiKeyCreation`
 *   ⇒ 키를 넓히는 길·서비스 계정 열쇠를 뽑는 길 둘 다 닫혔다. **다시 시도하지 않는다.**
 *
 * ■ 뿌리 = 이 기계의 구글 로그인 `~/.clasprc.json`
 *   배포 통로(clasp)가 늘 살려 두는 자격이고 권한에 `cloud-platform` 이 들어 있다.
 *   🔑 **사본을 만들지 않는다** — 만들면 clasp 가 갱신할 때 둘이 갈리고 갈린 쪽은 조용히 죽는다.
 *   되살리는 법은 하나: `npx clasp login`(유호님 손 · 브라우저 동의 한 번).
 *
 * ■ 🔑 이 파일은 appsscript `tools/모델정책.js` 의 같은 이름 함수와 **일부러 같은 캐시를 쓴다.**
 *   코드는 두 벌이지만 토큰 «값»은 한 파일(`%TEMP%/synk_vertex_token.json`)이 쥐므로
 *   [[constant-known-in-two-places]] 무늬에 안 걸린다 — 두 저장소가 같은 토큰을 나눠 쓴다.
 *   저장소를 가로질러 require 하지 않는 까닭: talk 이 appsscript 옆에 있다는 가정이 깨지면 죽는다.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** 크레딧이 닳는 프로젝트. 「글」(공짜)은 여기가 아니라 synk-radio24 다 — 섞으면 공짜가 죽는다. */
const 벌텍스프로젝트 = () => process.env.SYNK_VERTEX_PROJECT || 'gen-lang-client-0106203750';

/** Vertex 용 access token. 1시간짜리라 임시 파일에 캐시해 프로세스들이 나눠 쓴다(값은 어디에도 안 적는다). */
async function 벌텍스토큰() {
  const 캐시경로 = path.join(os.tmpdir(), 'synk_vertex_token.json');
  try {
    const c = JSON.parse(fs.readFileSync(캐시경로, 'utf8'));
    if (c && c.token && c.expiry > Date.now() + 120_000) return c.token;
  } catch { /* 없거나 깨졌으면 새로 만든다 */ }

  const 자격경로 = process.env.SYNK_VERTEX_OAUTH || path.join(os.homedir(), '.clasprc.json');
  if (!fs.existsSync(자격경로)) {
    throw new Error(`Vertex 토큰의 뿌리(구글 로그인)를 못 찾았다: ${자격경로}\n`
      + `   되살리는 법: npx clasp login — 브라우저가 한 번 열리고 그 뒤로는 자동이다.`);
  }
  const j = JSON.parse(fs.readFileSync(자격경로, 'utf8'));
  const t = (j.tokens && j.tokens.default) || j;
  if (!t.refresh_token) throw new Error(`${자격경로} 에 refresh_token 이 없다 — npx clasp login 을 다시 한다.`);

  const 몸 = new URLSearchParams({
    client_id: t.client_id, client_secret: t.client_secret, refresh_token: t.refresh_token, grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 몸,
  });
  const 답 = await res.json().catch(() => ({}));
  if (!res.ok || !답.access_token) {
    throw new Error(`구글 토큰 갱신 실패 ${res.status}: ${답.error_description || 답.error || ''}\n`
      + `   되살리는 법: npx clasp login`);
  }
  try {
    fs.writeFileSync(캐시경로, JSON.stringify({ token: 답.access_token, expiry: Date.now() + (Number(답.expires_in) || 3600) * 1000 }));
  } catch { /* 캐시는 편의일 뿐 — 못 써도 매번 새로 받으면 된다 */ }
  return 답.access_token;
}

/** 그대로 fetch 에 넣는 머리. 청구지(`x-goog-user-project`)를 «줘야» 한다 —
 *  안 주면 clasp 이 쓰던 프로젝트로 청구되어 403 이 난다(09-04 실측). */
async function 벌텍스머리() {
  return {
    authorization: `Bearer ${await 벌텍스토큰()}`,
    'content-type': 'application/json',
    'x-goog-user-project': 벌텍스프로젝트(),
  };
}

module.exports = { 벌텍스토큰, 벌텍스머리, 벌텍스프로젝트 };
