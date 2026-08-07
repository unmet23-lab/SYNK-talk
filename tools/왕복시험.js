#!/usr/bin/env node
'use strict';
/**
 * 왕복시험 — `POST /v1/events` 의 보증을 **실제 DB 왕복으로** 증명한다.
 *
 *   SUPABASE_PROJECT_REF=<리허설ref> node tools/왕복시험.js <student_code> <로그인코드>
 *
 * ⚠ **`.env` 의 `SUPABASE_PROJECT_REF` 는 운영(`Synk Core`)을 가리킨다** — 안 덮으면 아래 게이트가
 *   거부한다(옳게 막힌다). 리허설 ref 의 정본은 `tests/앱환경변수.test.js`·`docs/배포_경로.md`.
 * ⚠ 여기 **살아 있는 계정을 예시로 적지 않는다** — 로그인 코드는 화면에 1회뿐이고 첫 등록 판이
 *   바뀌면 조용히 죽는다(2026-08-07 에 옛 예시가 그렇게 죽어 한 세션이 헛돌았다).
 *   새로 뽑는다: `node tools/로그인코드발급.js SYNK-T0N --적용`
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

const 자격증명 = require('../lib/자격증명.js');   // .env 읽기 + 토큰 만료 게이트(공용 통로)

let 통과 = 0, 실패 = 0;
function 확인(이름, 조건, 실제) {
  if (조건) { 통과++; console.log(`  ✅ ${이름}`); }
  else { 실패++; console.log(`  ❌ ${이름}\n     실제: ${JSON.stringify(실제)}`); }
}

async function main() {
  const args = process.argv.slice(2);
  const [code용학생, 평문코드] = args.filter((a) => !a.startsWith('--'));
  if (!code용학생 || !평문코드) die('사용: node tools/왕복시험.js <student_code> <로그인코드>');

  const e = 자격증명.읽기('왕복시험');
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
  // 동의 행은 지우지 않는다 — 법적 증거라 delete 를 consents_protect 가 막는다(20260807120000).
  // 「무동의 상태」는 삭제가 아니라 **전부 철회**로 만든다(실제 세계에서도 무동의는 그 모양이다).
  await sql(`update engine.consents set revoked_at = now() where learner_id = '${learner_id}' and revoked_at is null`);
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

  /* ── ⑦ 한 앉음이 쌍으로 저장된다 (P0 §3-1 ④) ─────────────────────
   *   앱이 조립까지는 맞게 해도, 그 값이 **행에 남았는가**는 DB 에서만 증명된다.
   *   깨지면 증상이 조용하다: 두 행은 멀쩡히 저장되고 조회도 200 이라, ②낭독과 ③자유발화가
   *   같은 90초에서 나온 쌍이라는 사실만 사라진다 — 그리고 그건 **소급 복구가 안 된다**
   *   (`task_ref` 는 그날 배정이라 아침·저녁으로 나눠 낸 날과 구분이 안 되고, `occurred_at`
   *   정렬은 C0 §4-1 이 「기기 시계는 못 믿는다」로 이미 근거에서 뺐다). */
  console.log('\n⑦ 한 앉음(correlation_id)');
  const 흐름 = crypto.randomUUID();
  const 쌍 = await 부르기({ events: [
    기본({ correlation_id: 흐름, submission: { task_ref: 'hw-리허설-1', task_format: '낭독', body_original: '어제 친구를 만났어요' } }),
    기본({ correlation_id: 흐름, submission: { task_ref: 'hw-리허설-1', task_format: '자유발화', body_original: '저는 밥을 먹었어요' } }),
  ] });
  확인('둘 다 저장됐다', 쌍.body.results?.every((x) => x.status === 'stored'), 쌍.body.results);
  const 묶임 = await sql(`select e.correlation_id::text c, s.task_format
                            from engine.learning_events e join engine.submissions s on s.event_id = e.event_id
                           where e.correlation_id = '${흐름}' order by s.task_format`);
  확인('두 행이 같은 correlation_id 로 묶였다', 묶임.length === 2 && 묶임[0].c === 흐름 && 묶임[1].c === 흐름, 묶임);
  확인('형식은 서로 다르다(낭독 ≠ 자유발화)', 묶임[0]?.task_format === '낭독' && 묶임[1]?.task_format === '자유발화', 묶임);
  // uuid 가 아니면 400 이어야 한다 — 500 이면 `retryable` 이라 앱이 영구 오류를 무한 재시도한다.
  const 나쁜흐름 = await 부르기({ events: [기본({ correlation_id: `submission:${new Date().toISOString().slice(0, 10)}:따라:1` })] });
  확인('uuid 가 아니면 CONTRACT_VIOLATION(400 계열)', 나쁜흐름.body.results?.[0]?.error?.code === 'CONTRACT_VIOLATION', 나쁜흐름.body.results?.[0]);

  // ── ⑧ append-only — 저장된 학습 사건은 고칠 수도 지울 수도 없다
  console.log('\n⑧ append-only');
  for (const [이름, q] of [
    ['update 거부', `update engine.learning_events set level_snapshot='Lv9' where event_id='${첫?.event_id}'`],
    ['delete 거부', `delete from engine.learning_events where event_id='${첫?.event_id}'`],
    ['학생 원문 덮어쓰기 거부', `update engine.submissions set body_original='조작' where event_id='${첫?.event_id}'`],
  ]) {
    let 막힘 = false;
    try { await sql(q); } catch { 막힘 = true; }
    확인(이름, 막힘);
  }

  // ── ⑨ 수집→처리 배선 — 제출이 서면 처리 대기표(pipeline_jobs)에 줄이 **같은 트랜잭션**으로 선다
  console.log('\n⑨ 수집→처리 배선');
  const 잡 = await sql(`select j.status from engine.pipeline_jobs j
                          join engine.submissions s on s.submission_id = j.submission_id
                         where s.event_id = '${첫?.event_id}'`);
  확인('제출에 처리 job 이 함께 섰다(pending)', 잡.length === 1 && 잡[0].status === 'pending', 잡);
  확인('동의 귀속(consent_id)이 행에 박혔다',
    (await sql(`select consent_id from engine.learning_events where event_id = '${첫?.event_id}'`))[0]?.consent_id != null);

  // ── ⑩ 원문 불변 확대 — 「최대 소급 불가」 선언과 자물쇠의 범위가 같다
  console.log('\n⑩ 원문 불변 확대');
  for (const [이름, q] of [
    ['task_snapshot 덮어쓰기 거부', `update engine.submissions set task_snapshot='{}'::jsonb where event_id='${첫?.event_id}'`],
    ['occurred_at 바꾸기 거부', `update engine.submissions set occurred_at=now() where event_id='${첫?.event_id}'`],
  ]) {
    let 막힘 = false;
    try { await sql(q); } catch { 막힘 = true; }
    확인(이름, 막힘);
  }

  // ── ⑪ 동의 증거 보호 — 개서·삭제가 물리로 막힌다(철회 세우기·새 행만 통과)
  console.log('\n⑪ 동의 증거 보호');
  for (const [이름, q] of [
    ['동의 행 삭제 거부', `delete from engine.consents where learner_id='${learner_id}'`],
    ['agreed_at 개서 거부', `update engine.consents set agreed_at = now() where learner_id='${learner_id}' and revoked_at is null`],
  ]) {
    let 막힘 = false;
    try { await sql(q); } catch { 막힘 = true; }
    확인(이름, 막힘);
  }

  // ── ⑫ 철회 후 수집 0건 — 과거 시각을 주장해도 새 수집이 없다(동의문 「철회 시 중단」)
  console.log('\n⑫ 철회 후 수집 0건');
  await sql(`update engine.consents set revoked_at = now() where learner_id='${learner_id}' and revoked_at is null`);
  const 철회후 = 기본({ occurred_at: new Date(Date.now() - 3600_000).toISOString() });
  r = await 부르기({ events: [철회후] });
  확인('철회 뒤엔 철회 전 시각을 적어도 CONSENT_MISSING', r.body.results?.[0]?.error?.code === 'CONSENT_MISSING', r.body.results?.[0]);
  확인('그 행은 저장되지 않았다',
    (await sql(`select count(*)::int n from engine.learning_events where idempotency_key='${철회후.idempotency_key}'`))[0].n === 0);
  let 되돌림막힘 = false;
  try { await sql(`update engine.consents set revoked_at = null where learner_id='${learner_id}'`); } catch { 되돌림막힘 = true; }
  확인('철회 되돌리기 거부(재동의는 새 행)', 되돌림막힘);
  // 재동의 = 새 행 — 회로가 다시 산다(다음 실행도 이 상태에서 시작한다)
  await sql(`insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver)
             values ('${learner_id}', 'v18.9', now(), 'test')`);
  r = await 부르기({ events: [기본()] });
  확인('재동의(새 행) 뒤에는 다시 저장된다', r.body.results?.[0]?.status === 'stored', r.body.results?.[0]);

  console.log(`\n── 통과 ${통과} · 실패 ${실패} ──`);
  process.exit(실패 ? 1 : 0);
}

main().catch((err) => die(String(err && err.stack || err)));
