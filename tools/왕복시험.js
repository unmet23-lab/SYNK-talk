#!/usr/bin/env node
'use strict';
/**
 * 왕복시험 — `POST /v1/events` 의 보증을 **실제 DB 왕복으로** 증명한다.
 *
 *   node tools/왕복시험.js SYNK-T01 TK4Y-YGAK        # 리허설 대상
 *
 * ■ 왜 이게 필요한가
 *   쓰기 통로의 보증(멱등·동의 게이트·위조 거부·제출물 연결)은 **전부 DB 안에서** 성립한다.
 *   함수 코드를 읽어서는 아무것도 증명되지 않고, 깨져도 증상이 「조용함」이다 —
 *   멱등이 깨지면 같은 발화가 여러 벌 쌓이고, 동의 게이트가 새면 훈련에 쓰면 안 되는 행이
 *   섞인다. **둘 다 소급 불가**라 개원 뒤에 알면 늦는다.
 *
 * ■ 🔴 운영 프로젝트에는 기본으로 안 돈다
 *   이 시험은 `learning_events` 에 **지울 수 없는 행**을 남긴다(append-only 트리거).
 *   그래서 이름에 `rehearsal` 이 없는 프로젝트면 거부한다 — 뚫으려면 `--운영승인` 이 필요하고,
 *   그건 유호님 명시 승인 자리다. 막히는 방향이 안전한 방향이다.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { 정규형, 이메일, 비밀번호 } = require('../lib/로그인코드.js');

const ROOT = path.resolve(__dirname, '..');
const API = 'https://api.supabase.com/v1/projects';
const die = (m) => { console.error('[왕복시험] ' + m); process.exit(1); };

function env읽기() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const 줄 of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = 줄.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

let 통과 = 0, 실패 = 0;
function 확인(이름, 조건, 실제) {
  if (조건) { 통과++; console.log(`  ✅ ${이름}`); }
  else { 실패++; console.log(`  ❌ ${이름}\n     실제: ${JSON.stringify(실제)}`); }
}

async function main() {
  const args = process.argv.slice(2);
  const [code용학생, 평문코드] = args.filter((a) => !a.startsWith('--'));
  if (!code용학생 || !평문코드) die('사용: node tools/왕복시험.js <student_code> <로그인코드>');

  const e = { ...env읽기(), ...process.env };
  const 토큰 = e.SUPABASE_ACCESS_TOKEN, ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const M = { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' };

  const pr = await fetch(`${API}/${ref}`, { headers: M });
  const 이름 = pr.ok ? JSON.parse(await pr.text()).name : '(모름)';
  console.log(`[왕복시험] 대상 ▸ ${이름}  (${ref})\n`);
  if (!/rehearsal/i.test(이름) && !args.includes('--운영승인')) {
    die(`「${이름}」 은 리허설이 아니다. 이 시험은 **지울 수 없는 행**을 남긴다 —\n` +
        '     유호님 승인 뒤에만: --운영승인');
  }

  /** Management API 로 SQL — 준비·검증용(함수를 안 거치고 DB 를 직접 본다). */
  const sql = async (q) => {
    const r = await fetch(`${API}/${ref}/database/query`, { method: 'POST', headers: M, body: JSON.stringify({ query: q }) });
    const t = await r.text();
    if (!r.ok) throw new Error(`SQL HTTP ${r.status} ${t.slice(0, 300)}`);
    return JSON.parse(t);
  };

  const kr = await fetch(`${API}/${ref}/api-keys`, { headers: M });
  const anon = JSON.parse(await kr.text()).find((k) => k.name === 'anon').api_key;

  // 학생 로그인 — 앱이 하는 것과 **같은 경로**(C0 §2). 여기서 갈리면 앱에서도 갈린다.
  const lr = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 이메일(평문코드), password: 비밀번호(정규형(평문코드)) }),
  });
  if (!lr.ok) die(`로그인 실패 ${lr.status} — ${(await lr.text()).slice(0, 300)}`);
  const 학생토큰 = JSON.parse(await lr.text()).access_token;

  const 부르기 = async (본문, 판 = null) => {
    const h = { apikey: anon, Authorization: `Bearer ${학생토큰}`, 'Content-Type': 'application/json' };
    if (판 !== '') h['X-Contract-Ver'] = 판 ?? (await 현재판());
    const r = await fetch(`https://${ref}.supabase.co/functions/v1/events`, { method: 'POST', headers: h, body: JSON.stringify(본문) });
    return { status: r.status, body: JSON.parse(await r.text()) };
  };
  let _판;
  const 현재판 = async () => (_판 ??= (await sql(
    "select name from engine.schema_migrations order by version desc limit 1"))[0].name.match(/_(c\d+)\.sql$/)[1]);

  const 기본 = (덮기 = {}) => ({
    idempotency_key: crypto.randomUUID(),
    event_type: 'submission.created',
    task_type: '숙제제출',
    occurred_at: new Date().toISOString(),
    level_snapshot: 'Lv3',
    payload: { ver: 1, attempt_no: 1 },
    submission: {
      task_ref: 'hw-리허설-1', task_format: '자유발화', body_original: '어제 친구를 만나서 밥을 먹었어요',
      task_snapshot: { 지시문: '어제 한 일을 말해보세요', 문항: '어제 뭐 했어요?' },
    },
    ...덮기,
  });

  const [{ learner_id }] = await sql(`select learner_id from engine.learners where student_code = '${code용학생}'`);
  console.log(`학생 ${code용학생} = ${learner_id}\n`);

  // ── ① 동의 게이트 — 동의를 넣기 **전**이라 저장되면 안 된다
  console.log('① 동의 게이트');
  await sql(`delete from engine.consents where learner_id = '${learner_id}'`);
  const 무동의 = 기본();
  let r = await 부르기({ events: [무동의] });
  확인('동의 없으면 CONSENT_MISSING', r.body.results?.[0]?.error?.code === 'CONSENT_MISSING', r.body.results?.[0]);
  // ⚠ 학생 전체 행 수로 재면 **두 번째 실행부터 영원히 빨간다**(append-only 라 앞선 회차가 남는다).
  //    재실행 가능한 시험이 아니면 한 번 쓰고 버리는 시험이다 — 그 키만 본다.
  확인('그 행은 저장되지 않았다',
    (await sql(`select count(*)::int n from engine.learning_events where idempotency_key='${무동의.idempotency_key}'`))[0].n === 0);

  // 동의를 **과거로** 넣는다 — occurred_at 보다 앞서야 유효하다
  await sql(`insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver)
             values ('${learner_id}', 'v18.9', now() - interval '1 day', 'test')`);

  // ── ② 정상 저장 + 제출물 연결
  console.log('\n② 정상 저장');
  const 사건1 = 기본();
  r = await 부르기({ events: [사건1] });
  const 첫 = r.body.results?.[0];
  확인('stored 로 돌아온다', 첫?.status === 'stored', 첫);
  확인('event_id 를 준다', !!첫?.event_id, 첫);
  const 행 = (await sql(`select event_type, actor_kind, consent_ver, schema_ver, jsonb_typeof(payload) pt, payload->>'attempt_no' a
                           from engine.learning_events where event_id = '${첫?.event_id}'`))[0];
  확인('동의판을 서버가 채웠다(v18.9)', 행?.consent_ver === 'v18.9', 행);
  확인('actor_kind = learner', 행?.actor_kind === 'learner', 행);
  확인('schema_ver = DB 계약판', 행?.schema_ver === await 현재판(), 행);
  확인('payload 가 진짜 jsonb 다(text 아님)', 행?.pt === 'object' && 행?.a === '1', 행);
  const 제출 = (await sql(`select task_format, body_original, jsonb_typeof(task_snapshot) st,
                                  task_snapshot->>'문항' 문항
                             from engine.submissions where event_id = '${첫?.event_id}'`))[0];
  확인('제출물이 같은 event_id 로 연결됐다', 제출?.task_format === '자유발화', 제출);
  확인('학생 원문이 그대로다', 제출?.body_original === '어제 친구를 만나서 밥을 먹었어요', 제출);
  확인('task_snapshot 도 진짜 jsonb 다', 제출?.st === 'object' && 제출?.문항 === '어제 뭐 했어요?', 제출);

  // ── ③ 멱등 — 같은 키 재전송은 **새 행을 만들지 않는다**
  console.log('\n③ 멱등(오프라인 재전송)');
  r = await 부르기({ events: [사건1] });
  확인('duplicate 로 접힌다', r.body.results?.[0]?.status === 'duplicate', r.body.results?.[0]);
  확인('원래 event_id 를 그대로 준다', r.body.results?.[0]?.event_id === 첫?.event_id, r.body.results?.[0]);
  확인('행이 늘지 않았다', (await sql(`select count(*)::int n from engine.learning_events where idempotency_key='${사건1.idempotency_key}'`))[0].n === 1);

  // ── ④ 앱을 안 믿는 자리
  console.log('\n④ 위조·값목록');
  const 케이스 = [
    ['본문의 learner_id 는 거부', 기본({ learner_id: crypto.randomUUID() }), 'CONTRACT_VIOLATION'],
    ['서버 사건은 앱이 못 만든다', 기본({ event_type: 'intervention.delivered' }), 'CONTRACT_VIOLATION'],
    ['값목록 밖 task_type', 기본({ task_type: '없는통로' }), 'CONTRACT_VIOLATION'],
    ['값목록 밖 task_format', 기본({ submission: { task_ref: 'x', task_format: '없는형식', body_original: 'a' } }), 'CONTRACT_VIOLATION'],
    ['payload 에 ver 없음', 기본({ payload: { attempt_no: 1 } }), 'PAYLOAD_INVALID'],
    ['uuid 아닌 content_id', 기본({ content_id: 'c-hw-0031' }), 'CONTRACT_VIOLATION'],
    ['남의(없는) 사건 재시도', 기본({ retry_of_event_id: crypto.randomUUID() }), 'CONTRACT_VIOLATION'],
    ['필수 누락(level_snapshot)', 기본({ level_snapshot: undefined }), 'CONTRACT_VIOLATION'],
  ];
  for (const [이름, ev, 기대] of 케이스) {
    const rr = await 부르기({ events: [ev] });
    확인(이름, rr.body.results?.[0]?.error?.code === 기대, rr.body.results?.[0]);
  }

  // ── ⑤ 봉투·판
  console.log('\n⑤ 봉투와 계약판');
  확인('헤더 없으면 400', (await 부르기({ events: [] }, '')).body.error?.code === 'CONTRACT_VER_MISSING');
  const 미래 = await 부르기({ events: [] }, 'c99');
  확인('DB 보다 새 판은 426', 미래.status === 426 && 미래.body.error?.code === 'CONTRACT_VER_UNSUPPORTED', 미래.body);
  확인('옛 판은 계속 받는다(앱 롤아웃)', (await 부르기({ events: [기본()] }, 'c6')).body.results?.[0]?.status === 'stored');

  // ── ⑥ 배치 부분 실패 — 한 건이 나머지를 막지 않는다
  console.log('\n⑥ 배치 부분 실패');
  const 배치 = await 부르기({ events: [기본(), 기본({ task_type: '없는통로' }), 기본()] });
  확인('HTTP 는 200 이다(head-of-line 방지)', 배치.status === 200, 배치.status);
  확인('성공 2 · 거절 1', 배치.body.results?.filter((x) => x.status === 'stored').length === 2
    && 배치.body.results?.filter((x) => x.status === 'rejected').length === 1, 배치.body.results);

  // ── ⑦ append-only — 저장된 학습 사건은 고칠 수도 지울 수도 없다
  console.log('\n⑦ append-only');
  for (const [이름, q] of [
    ['update 거부', `update engine.learning_events set level_snapshot='Lv9' where event_id='${첫?.event_id}'`],
    ['delete 거부', `delete from engine.learning_events where event_id='${첫?.event_id}'`],
    ['학생 원문 덮어쓰기 거부', `update engine.submissions set body_original='조작' where event_id='${첫?.event_id}'`],
  ]) {
    let 막힘 = false;
    try { await sql(q); } catch { 막힘 = true; }
    확인(이름, 막힘);
  }

  console.log(`\n── 통과 ${통과} · 실패 ${실패} ──`);
  process.exit(실패 ? 1 : 0);
}

main().catch((err) => die(String(err && err.stack || err)));
