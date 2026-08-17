#!/usr/bin/env node
/* 세그먼트재료 — `submissions.stt_segments` 의 **첫 행을 만든다**, 그리고 그 모양을 잰다.
 *
 * ■ 왜 있나 (2026-08-10 실측)
 *   생산자(`lib/전사.js 세그먼트값`)도 소비자(`lib/검수확정.js 세그먼트펴기`·`청취문턱`)도 다 서
 *   있는데 리허설 **907건 중 `stt_segments` 가 있는 행이 0**이었다. 원인은 배선이 아니라 **재료**다:
 *   오디오가 붙은 행은 전부 `업로드왕복시험` 이 만든 **0.1초 무음 WAV** 라, Whisper 가 세그먼트를
 *   낼 것이 없다(그 행들의 전사가 죄다 「고맙습니다.」인 것이 무음 환각의 자국이다).
 *   재료가 없으면 청취 게이트는 영원히 하한 3초고, 그 사실은 **어디서도 안 빨갛다**.
 *
 * ■ 무엇을 재나 — 미측정 상수 둘(`lib/검수확정.js:29` 이 「그 날 첫 실측 대상」으로 지목한 자리)
 *   ① **시간 단위** — 생산자는 `start`/`end` 를 초로 내고 소비자는 `start_ms` 가 없으면 초로 읽는다.
 *      둘이 맞는지는 실물 한 행이 있어야 증명된다(1000배 틀린 문턱은 증상이 없다).
 *   ② **`저신뢰문턱 0.7` 의 위치** — `confidence = exp(avg_logprob)` 가 실제 발화에서 어느 범위로
 *      오는지 모르면 0.7 은 전부 저신뢰이거나 전부 고신뢰인 값일 수 있다.
 *
 * ■ 🔴 합성 음성으로 재는 것의 한계를 먼저 적는다
 *   TTS 발화는 또렷해서 `confidence` 가 높게 나온다. 그래서 이 도구가 답할 수 있는 것은
 *   **①단위**와 **②의 상한쪽 분포**뿐이고, 저신뢰 경계 자체는 **더듬는 실학생 발화**라야 잰다.
 *   못 잰 것을 잰 것처럼 적지 않는다 — 판정문에 그대로 낸다.
 *
 * ■ 🔴 리허설 전용. 파일과 행을 남기고 비밀번호를 갈아끼운다(골격이 게이트를 진다).
 *
 * 사용: node tools/세그먼트재료.js <auth_user_id> <learner_id> <wav파일경로>
 */
'use strict';
const fs = require('fs');
const 골격 = require('../lib/왕복골격.js');
const { 세그먼트펴기, 청취문턱 } = require('../lib/검수확정.js');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)

/* 🎯 조준 축이 **있다** — `골격.열기()` 가 `자격증명.읽기()` 를 지난다(한 겹 건너). 그래서
 *   선언은 **빈 목록이 아니다**: `--운영` 은 여기서 뜻을 갖는다(과녁을 갈아탄다). 안 넣으면
 *   시스템이 시키는 낱말을 이 가드가 거절한다 — 따를 수 없는 처방이다(F103 · #Q112 가 첫 판
 *   명단에서 이 도구에 「선언 = 빈 목록」을 적었다가 잡아낸 그 자리다).
 *   그 밖의 `--낱말` 은 전부 거절한다 — 이 도구가 읽는 것은 위치 인자 셋뿐이다. */
const 아는플래그 = [...공용플래그];

const die = (m) => { console.error(`[세그먼트재료] ${m}`); process.exit(1); };

async function main() {
  const args = process.argv.slice(2);
  const 플래그오류 = 인자게이트('세그먼트재료', args, 아는플래그);   // 모르는 낱말은 여기서 죽는다(F435)
  if (플래그오류) die(플래그오류);
  /* 🔴 `--` 낱말을 **위치 칸에서 걷어낸다.** 안 걷으면 `--운영` 이 auth_user_id 자리로 들어가고,
   *   그건 무시보다 나쁘다 — 조준은 먹었는데 사용자 조회를 「--운영」이라는 id 로 친다.
   *   조준 자체는 골격이 argv 를 따로 읽어 하므로 여기서 빼도 안 죽는다. */
  const [auth_user_id, learner_id, wav경로] = args.filter((a) => !a.startsWith('--'));
  if (!auth_user_id || !learner_id || !wav경로) {
    die('사용: node tools/세그먼트재료.js <auth_user_id> <learner_id> <wav파일경로>');
  }
  if (!fs.existsSync(wav경로)) die(`WAV 가 없다: ${wav경로}`);
  const 몸 = fs.readFileSync(wav경로);

  const { ref, sql, anon, service_role: svc } = await 골격.열기('세그먼트재료', {
    사유: '이 도구는 지울 수 없는 행과 파일을 남기고 비밀번호를 갈아끼운다',
  });

  const base = `https://${ref}.supabase.co`;
  const 관리 = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' };

  /* ① 학생으로 들어간다 — 업로드도 제출도 **앱이 가진 권한**으로 해야 경로 규칙·게이트가 함께 증명된다. */
  const ur = await fetch(`${base}/auth/v1/admin/users/${auth_user_id}`, { headers: 관리 });
  if (!ur.ok) die(`사용자 조회 HTTP ${ur.status} — ${(await ur.text()).slice(0, 200)}`);
  const email = JSON.parse(await ur.text()).email;
  const 비번 = `rehearsal-${auth_user_id.slice(0, 8)}-Aa1!`;
  const pw = await fetch(`${base}/auth/v1/admin/users/${auth_user_id}`, {
    method: 'PUT', headers: 관리, body: JSON.stringify({ password: 비번 }),
  });
  if (!pw.ok) die(`비밀번호 설정 HTTP ${pw.status} — ${(await pw.text()).slice(0, 200)}`);

  const tr = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 비번 }),
  });
  if (!tr.ok) die(`로그인 HTTP ${tr.status} — ${(await tr.text()).slice(0, 200)}`);
  const jwt = JSON.parse(await tr.text()).access_token;
  const 학생 = { apikey: anon, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'X-Contract-Ver': 'c7' };

  /* ② 서명 → 업로드. 규격 정본은 C0 §4-2(16kHz·16bit·mono WAV). */
  const sr = await fetch(`${base}/functions/v1/uploads/sign`, {
    method: 'POST', headers: 학생,
    body: JSON.stringify({ kind: 'audio', content_type: 'audio/wav', byte_size: 몸.length }),
  });
  const sb = await sr.json();
  if (sr.status !== 200 || !sb.upload_url) die(`서명 HTTP ${sr.status} — ${JSON.stringify(sb).slice(0, 200)}`);
  const up = await fetch(sb.upload_url, { method: 'PUT', headers: { 'Content-Type': 'audio/wav' }, body: 몸 });
  if (!up.ok) die(`업로드 HTTP ${up.status}`);
  console.log(`  ↑ 올렸다 — ${sb.audio_ref} (${몸.length} bytes)`);

  /* ③ 제출 사건 — `events` 가 INSERT 시점에 `transcript_state='pending'` 을 박는다(`lib/전사.js 전사대상`). */
  const er = await fetch(`${base}/functions/v1/events`, {
    method: 'POST', headers: 학생,
    body: JSON.stringify({
      events: [{
        idempotency_key: crypto.randomUUID(),
        event_type: 'submission.created',
        occurred_at: new Date().toISOString(),
        level_snapshot: 'Lv1',
        correlation_id: crypto.randomUUID(),
        task_type: '발화녹음',
        submission: {
          task_ref: 'segment-material', task_format: '낭독', audio_ref: sb.audio_ref,
          task_snapshot: { ver: 1, 문장: '세그먼트 재료 — 합성 발화(실학생 아님)' },
        },
      }],
    }),
  });
  const eb = await er.json();
  const 한건 = eb.results && eb.results[0];
  if (!한건 || 한건.status !== 'stored') die(`제출 HTTP ${er.status} — ${JSON.stringify(한건 ?? eb).slice(0, 300)}`);
  const event_id = 한건.event_id;
  console.log(`  ✓ 제출됐다 — event_id ${event_id}`);

  /* ④ 전사 배치를 태운다. **분모를 먼저 센다** — 무음 대기 행이 앞에 있으면 내 행이 안 집힌다
   *   (F207: 미실행은 통과와 같은 모양으로 온다). 그래서 대기 수만큼 상한을 올려 부른다. */
  const [{ 대기 }] = await sql("select count(*)::int as 대기 from engine.submissions where transcript_state = 'pending'");
  console.log(`  · 전사 대기 ${대기}건 — 그만큼 상한을 올려 부른다`);
  const 상한 = Math.min(25, Math.max(1, Number(대기)));
  const trs = await fetch(`${base}/functions/v1/transcribe?limit=${상한}`, {
    method: 'POST', headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
  });
  const trb = await trs.json().catch(() => ({}));
  console.log(`  · transcribe HTTP ${trs.status} — ${JSON.stringify(trb).slice(0, 300)}`);
  if (trs.status !== 200) die('전사 배치가 안 돌았다 — 위 응답이 이유다');

  /* ⑤ 🔑 「돌았다」와 「행에 값이 있다」는 다른 사실이다 — 행을 직접 연다. */
  const [행] = await sql(`select transcript_state, transcript, stt_segments, stt_confidence, audio_duration_sec
                            from engine.submissions where event_id = '${event_id}'::uuid`);
  if (!행) die('그 event_id 의 행이 없다');

  console.log(`\n[행] state=${행.transcript_state} · 길이=${행.audio_duration_sec} · 발화신뢰도=${행.stt_confidence}`);
  console.log(`[전사] ${String(행.transcript ?? '').slice(0, 160)}`);

  const 조각들 = Array.isArray(행.stt_segments) ? 행.stt_segments : [];
  if (조각들.length === 0) {
    console.log('\n🔴 세그먼트가 0이다 — 재료를 만들었는데도 안 생겼다면 그것이 이 실측의 결과다.');
    process.exit(1);
  }

  /* ⑥ 모양 실측 — 소비자에 **실제로 먹여** 본다. 눈으로 JSON 을 보는 것과 다르다. */
  const 첫 = 조각들[0];
  const 펴진 = 세그먼트펴기(조각들);
  const 문턱 = 청취문턱(조각들);
  const 신뢰들 = 펴진.map((s) => s.신뢰).filter((c) => c !== null);
  const 총길이ms = 펴진.length ? 펴진[펴진.length - 1].끝ms - 펴진[0].시작ms : 0;

  console.log(`\n===== 모양 실측 =====`);
  console.log(`조각 ${조각들.length}개 · 키 = ${Object.keys(첫).join(', ')}`);
  console.log(`첫 조각 원값: start=${첫.start} end=${첫.end} avg_logprob=${첫.avg_logprob} no_speech_prob=${첫.no_speech_prob} confidence=${첫.confidence}`);
  console.log(`① 단위 — 소비자가 편 총길이 ${총길이ms}ms vs 실제 오디오 ${행.audio_duration_sec}초`);
  console.log(`   → ${Math.abs(총길이ms / 1000 - Number(행.audio_duration_sec)) < 2 ? '✅ 초 단위로 맞다(소비자 해석 = 생산자 출력)' : '🔴 어긋난다 — 단위 가정이 틀렸다'}`);
  console.log(`② confidence 분포 — 최소 ${Math.min(...신뢰들).toFixed(4)} · 최대 ${Math.max(...신뢰들).toFixed(4)} · 중앙 ${신뢰들.slice().sort((a, b) => a - b)[Math.floor(신뢰들.length / 2)].toFixed(4)}`);
  console.log(`   문턱 0.7 아래 조각 = ${펴진.filter((s) => s.저신뢰).length}/${펴진.length}`);
  console.log(`③ 청취문턱 = ${문턱.ms}ms (재료=${문턱.재료})  ← 재료 false 면 아직 하한 3초다`);
  console.log(`\n⚠ 합성 발화라 ②의 저신뢰 경계는 이것으로 못 정한다 — 더듬는 실학생 발화가 와야 한다.`);
}

main().catch((e) => die(e && e.stack ? e.stack : String(e)));
