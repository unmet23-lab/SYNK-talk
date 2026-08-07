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
const { 화면과제, 제출사건 } = require('../lib/오늘과제.js');
const { 항목추가, 흐름id } = require('../lib/제출로그.js');
const 계약정본 = require('../계약/수집_교정_계약.json');

const API = 'https://api.supabase.com/v1/projects';
const die = (m) => { console.error(`[업로드왕복] ${m}`); process.exit(1); };

const 자격증명 = require('../lib/자격증명.js');   // .env 읽기 + 토큰 만료 게이트(공용 통로)

/** 16kHz·16bit·mono PCM WAV 한 조각 — 기본값이 규격 정본(C0 §4-2)과 같은 모양이다. */
function wav(샘플수 = 1600, { 레이트 = 16000, 채널 = 1 } = {}) {
  const 데이터 = 샘플수 * 2 * 채널;
  const b = Buffer.alloc(44 + 데이터);
  b.write('RIFF', 0); b.writeUInt32LE(36 + 데이터, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(채널, 22); b.writeUInt32LE(레이트, 24); b.writeUInt32LE(레이트 * 채널 * 2, 28);
  b.writeUInt16LE(채널 * 2, 32); b.writeUInt16LE(16, 34);
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

  const e = 자격증명.읽기('업로드왕복');
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

  /* ⑦ capture_meta.server — 서버가 **그 파일을 실제로 열어 재는가**(C0 §4-2 · P0 §10-A-5).
   *   여기까지 와야 증명이 끝난다: 회귀는 헤더 파서만 재고, 「함수가 Storage 를 정말 읽는가」는
   *   08-06 에 하루를 태운 자리다(서비스키가 Storage 에서 안 먹었고 증상은 「측정만 안 됨」뿐이었다).
   *   그리고 읽어서 **행에 적히는 것**까지 봐야 한다 — jsonb 는 오류 없이 조용히 죽는 자리다. */
  const 질의 = async (q) => {
    const r = await fetch(`${API}/${ref}/database/query`, {
      method: 'POST', headers: { ...헤더, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
    });
    if (!r.ok) die(`질의 HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };

  const 제출 = async (audio_ref) => {
    const r = await fetch(`${base}/functions/v1/events`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'X-Contract-Ver': 'c7' },
      body: JSON.stringify({
        events: [{
          idempotency_key: crypto.randomUUID(),
          event_type: 'submission.created',
          occurred_at: new Date().toISOString(),
          level_snapshot: 'Lv1',
          correlation_id: crypto.randomUUID(),   // c9 공통 필수 — 한 앉음을 묶는 키(절단문서 ①-10)
          task_type: '발화녹음',
          // 그때 학생이 본 판. c9 부터 `submission.created` 의 필수다(절단문서 ①-3).
          submission: {
            task_ref: 'rehearsal-capture', task_format: '낭독', audio_ref,
            task_snapshot: { ver: 1, 문장: '리허설 캡처 문장' },
          },
        }],
      }),
    });
    const b = await r.json();
    const 한건 = b.results && b.results[0];
    if (!한건 || 한건.status !== 'stored') {
      return { 저장: false, 곁: `HTTP ${r.status} · ${JSON.stringify(한건 ?? b).slice(0, 200)}` };
    }
    const [행] = await 질의(`select capture_meta from engine.submissions where event_id = '${한건.event_id}'::uuid`);
    return { 저장: true, server: (행 && 행.capture_meta && 행.capture_meta.server) || null };
  };

  const 정본잰것 = await 제출(b1.audio_ref);
  잰다('정본 WAV 를 올리면 서버가 헤더를 실제로 잰다', 정본잰것.server?.state === 'measured',
    정본잰것.저장 ? JSON.stringify(정본잰것.server ?? null).slice(0, 200) : 정본잰것.곁);
  잰다('잰 값이 정본 규격 그대로다 — 멀쩡한 녹음을 위반으로 세지 않는다',
    정본잰것.server?.sample_rate === 16000 && Array.isArray(정본잰것.server?.spec_violations)
      && 정본잰것.server.spec_violations.length === 0,
    `${정본잰것.server?.sample_rate}Hz · ${JSON.stringify(정본잰것.server?.spec_violations)}`);
  잰다('AGC 는 모른다고 적는다 — 헤더에 흔적이 없다', 정본잰것.server?.agc_verified === 'unknown',
    String(정본잰것.server?.agc_verified));

  // ⑧ 규격 밖 — 「앱 프리셋이 조용히 바뀌었다」가 행에서 보여야 한다. 이게 이 열의 존재 이유다.
  const s2 = await (await 부르기({ kind: 'audio', content_type: 'audio/wav', byte_size: 6444 })).json();
  await fetch(s2.upload_url, { method: 'PUT', headers: { 'Content-Type': 'audio/wav' }, body: wav(1600, { 레이트: 44100, 채널: 2 }) });
  const 밖잰것 = await 제출(s2.audio_ref);
  잰다('규격 밖 녹음이 행에 규격 밖으로 적힌다', (밖잰것.server?.spec_violations || []).includes('sample_rate:44100')
    && (밖잰것.server?.spec_violations || []).includes('channels:2'),
    JSON.stringify(밖잰것.server?.spec_violations ?? null));

  /* ⑨ 파일 없는 참조 — 서명만 받고 **올리지 않은** 자리. 두 가지를 동시에 잰다:
   *   ①행은 저장된다(수집이 채점보다 우선 — Storage 사정으로 학생 발화를 버리지 않는다)
   *   ②그런데 「파일이 없다」가 행에 남는다(안 남기면 나중에 「전사 실패」와 구분되지 않는다). */
  const s3 = await (await 부르기({ kind: 'audio', content_type: 'audio/wav', byte_size: 3244 })).json();
  const 없는것 = await 제출(s3.audio_ref);
  잰다('파일이 없어도 행은 저장된다 — 수집이 채점보다 우선', 없는것.저장 === true, 없는것.곁 || '');
  잰다('그리고 「파일 없음」이 행에 남는다', 없는것.server?.state === 'missing',
    JSON.stringify(없는것.server ?? null).slice(0, 200));

  /* ⑩ 앱 체인 — **배치가 쓴 것 → 앱이 읽은 것 → 앱이 되돌린 것**을 같은 실행에서 대조한다.
   *   회귀(`tests/오늘과제.test.js`)는 조립 함수가 계약을 지키는지까지만 잰다. 그 봉투가
   *   **진짜 서버를 통과하고 그 행이 배정과 같은 과제를 가리키는지**는 여기서만 드러난다 —
   *   갈리면 증상은 「학생이 제출했는데 원장 화면에 안 보인다」 하나뿐이라 코드 독해로는 안 잡힌다.
   *   🔑 앱이 실제로 선언하는 판(`계약.버전`)으로 부른다. 위 갈래들의 `c7` 은 「옛 앱도 돈다」를
   *     재는 것이고, 이 갈래는 **지금 앱**이다. */
  const 판 = 계약정본.버전;
  const 큐r = await fetch(`${base}/functions/v1/tasks`, {
    headers: { apikey: anon, Authorization: `Bearer ${jwt}`, 'X-Contract-Ver': 판 },
  });
  const 큐b = await 큐r.json().catch(() => ({}));
  const 배정 = Array.isArray(큐b.data) && 큐b.data.length ? 큐b.data[0] : null;

  if (!배정) {
    /* 🔴 배정이 없으면 **건너뛴 것을 드러낸다** — 통과와 미실행이 같은 모양이면 안 된다.
     *   실패로 세지 않는 이유: 그건 이 학생에게 오늘 배달이 안 돈 것이지 앱 체인의 결함이 아니다. */
    console.log(`  ⏭ 앱 체인 — 오늘 배정이 없어 건너뛴다 (HTTP ${큐r.status} · 먼저 배달왕복시험을 돌린다)`);
  } else {
    // 폴백은 이 갈래에서 **쓰이면 안 되는** 값이다 — 쓰였는지는 바로 아래 `출처` 로 잰다.
    const 폴백 = { id: null, 본문: '·', 핵심문장: '·', 질문: '·', 선택지: null };
    const 본 = 화면과제(배정, 폴백);
    잰다('앱이 배정을 서버 과제로 읽는다(폴백으로 안 내려간다)', 본.출처 === '서버', 본.사유 || '');
    /* 🔑 급수·목적은 **값이 아니라 키**로 잰다(C0 §4-3 ① ⓑ · 유호님 확정 2026-08-07).
     *   값으로 재면 급수 없는 학생 — 개원 첫 주가 정확히 그 상태 — 에서 이 왕복이 빨개진다.
     *   ⓑ 가 지키는 경계는 「모른다(`null`)는 받고 키 누락은 막는다」이고, 앱이 지는 몫도
     *   값이 아니라 **키를 빠뜨리지 않는 것**이다. `task_ref` 는 그대로 값으로 잰다 —
     *   그건 배정 자체의 이름이라 없으면 사건을 어디에도 못 잇는다. */
    const 재료 = 본.제출재료;
    잰다('배정이 봉투 재료를 함께 준다 — 앱이 지어내는 값이 0 이다',
      !!재료 && !!재료.task_ref && 'level_snapshot' in 재료 && 'goal_snapshot' in 재료,
      JSON.stringify(재료));

    if (본.제출재료) {
      const 지금 = new Date().toISOString();
      const { 항목 } = 항목추가([], {
        date: 본.제출재료.task_ref.replace(/^task-/, ''),
        step: '답하기',
        status: 'submitted',
        duration_ms: 4200, hesitation_ms: 800, spoke: true, threshold_db: -40,
        text: null, audio: 'file:///rec.m4a', prompt_id: 본.task_id, created_at: 지금,
        task_meta: 본.제출재료,
        capture_app: { platform: 'node-rehearsal', extension: '.wav', agc_requested: null },
        /* 🔴 **앱이 넘기는 값이라 여기서도 넘겨야 한다**(`src/말하기화면.js:205` `흐름잡기`).
         *   `항목추가` 는 이 칸을 **짓지 않고 받기만** 한다(제출로그.js:93) — 한 앉음을 화면이
         *   정하기 때문이다. 안 넘기면 `제출사건` 이 `null` 을 내고(①-10 이 공통 필수로 올린 뒤로),
         *   이 시험은 그걸 그대로 보내 **평문 500** 을 받았다. 즉 봉투 조립 실패가 「서버 장애」로
         *   보였다(2026-08-07 실측 · 그동안 이 갈래는 아무것도 증명하지 못하고 있었다). */
        correlation_id: 흐름id(),
      });

      // 앱이 하는 그대로: 먼저 올리고(서명→PUT), 그 참조로 사건을 보낸다(C0 §4-2 순서).
      const s앱 = await (await 부르기({ kind: 'audio', content_type: 'audio/wav', byte_size: 3244 })).json();
      await fetch(s앱.upload_url, { method: 'PUT', headers: { 'Content-Type': 'audio/wav' }, body: wav() });

      const 사건 = 제출사건(항목, s앱.audio_ref);
      /* 🔑 **앱이 두는 가드를 시험도 둔다**(`src/제출API.js:114` `if (!사건) return`). 없으면
       *   `{events:[null]}` 이 나가고, 서버는 JSON 거절이 아니라 **평문 500** 으로 죽는다 —
       *   이 갈래가 재는 것은 「앱이 조립한 봉투」인데 앱이라면 애초에 보내지 않을 것을 보내고
       *   있었다. 조립이 깨진 것을 서버 탓으로 읽지 않으려면 여기서 멈춰야 한다. */
      if (!사건) die('제출사건이 null 이다 — 앱이라면 여기서 멈춘다(src/제출API.js:114). '
        + '항목이 correlation_id·idempotency_key 를 들고 있는지 봐라.');
      const er = await fetch(`${base}/functions/v1/events`, {
        method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'X-Contract-Ver': 판 },
        body: JSON.stringify({ events: [사건] }),
      });
      /* 🔴 본문을 **먼저 글자로** 받는다. `.json().catch(()=>({}))` 는 비JSON 응답을 `{}` 로
       *   접어서, 게이트웨이 500·부팅 실패처럼 **원문에만 이유가 있는 실패**가 정확히
       *   진단이 필요한 순간에 `{}` 로 찍혔다(2026-08-07 실측). 파싱 실패는 그 자체가 사실이다. */
      const e원문 = await er.text();
      let eb = {};
      try { eb = JSON.parse(e원문); } catch { /* 비JSON — 아래 곁말에 원문이 그대로 나간다 */ }
      const 한건 = eb.results && eb.results[0];
      /* 🔑 `duplicate` 도 통과로 둔다. 지금은 `항목추가` 가 실행마다 새 멱등키를 내므로 매번
       *   `stored` 여야 맞지만(절단문서 ①-5 로 결정론 조립을 걷어냈다), 이 자리는 **어느 쪽인지가
       *   판정이 아니다** — 여기서 재는 것은 「앱이 조립한 봉투가 서버를 통과하는가」이고, 접힘
       *   자체는 아래 「재전송이 같은 행으로 접힌다」가 event_id 대조로 따로 진다.
       *   ⚠ 옛 이유는 반대였다: 키가 결정론이라 같은 날 두 번째 실행이 반드시 `duplicate` 였고
       *   `stored` 만 통과로 보면 이 도구가 하루 한 번짜리 계기가 됐다(2026-08-07 실측).
       *   400·426 은 두 경우 모두 여기서 그대로 걸린다. */
      잰다('앱이 조립한 봉투가 서버를 실제로 통과한다',
        er.status === 200 && (한건?.status === 'stored' || 한건?.status === 'duplicate'),
        `HTTP ${er.status} · ${한건 ? JSON.stringify(한건).slice(0, 200) : e원문.slice(0, 400)}`);

      if (한건?.event_id) {
        const [행] = await 질의(
          `select s.task_ref, s.task_format, e.level_snapshot, e.goal_snapshot,
                  e.payload->>'attempt_no' as attempt_no, s.capture_meta
             from engine.learning_events e join engine.submissions s on s.event_id = e.event_id
            where e.event_id = '${한건.event_id}'::uuid`);
        // 🔑 이 한 줄이 이 갈래의 존재 이유다 — 제출 행이 **배정과 같은 과제**를 가리키는가.
        잰다('제출 행이 배정과 같은 task_ref 를 가리킨다', 행?.task_ref === 본.제출재료.task_ref,
          `제출 ${행?.task_ref} vs 배정 ${본.제출재료.task_ref}`);
        잰다('③답하기 행의 형식이 자유발화다 — 낭독과 안 섞인다(P0 §2-1)',
          행?.task_format === '자유발화', String(행?.task_format));
        잰다('그때 급수·목적이 그대로 행에 남는다', 행?.level_snapshot === 본.제출재료.level_snapshot
          && 행?.goal_snapshot === 본.제출재료.goal_snapshot,
          `${행?.level_snapshot} · ${행?.goal_snapshot}`);
        잰다('재시도 축(attempt_no)이 payload 에 산다 — 「어제의 나」가 이걸로 갈린다',
          행?.attempt_no === '1', String(행?.attempt_no));
        // 앱이 보낸 `app` 칸은 그대로 두고 서버가 `server` 만 얹는다(C0 §4-2).
        잰다('앱이 요청한 설정과 서버가 잰 값이 한 행에 나란히 선다',
          행?.capture_meta?.app?.platform === 'node-rehearsal' && !!행?.capture_meta?.server,
          JSON.stringify(행?.capture_meta ?? null).slice(0, 200));

        // 같은 **항목**을 다시 보낸다 — 항목이 멱등키를 들고 있어 **새 행이 생기면 안 된다**.
        // 🔑 항목을 새로 만들지 않는 것이 이 검사의 전부다: 키가 항목에 있으므로 재조립은
        //    같은 값을 싣고, 항목이 새로 나면 새 키라 이 검사는 의미가 없어진다(그건 새 발화다).
        const er2 = await fetch(`${base}/functions/v1/events`, {
          method: 'POST',
          headers: { apikey: anon, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'X-Contract-Ver': 판 },
          body: JSON.stringify({ events: [제출사건(항목, s앱.audio_ref)] }),
        });
        const 둘째 = (await er2.json().catch(() => ({}))).results?.[0];
        잰다('재전송이 같은 행으로 접힌다 — 회선이 끊겨도 중복이 안 쌓인다',
          둘째?.status === 'duplicate' && 둘째?.event_id === 한건.event_id,
          JSON.stringify(둘째 ?? null).slice(0, 200));
      }
    }
  }

  const 실패 = 결과.filter((r) => !r.통과);
  console.log(`\n[업로드왕복] ${결과.length - 실패.length}/${결과.length}`);
  if (실패.length) process.exit(1);
}

main().catch((err) => die(String((err && err.message) || err)));
