#!/usr/bin/env node
'use strict';
/**
 * 왕복시험 — `POST /v1/events` 의 보증을 **실제 DB 왕복으로** 증명한다.
 *
 *   SUPABASE_PROJECT_REF=<리허설ref> node tools/왕복시험.js <student_code> <로그인코드>
 *   SUPABASE_PROJECT_REF=<리허설ref> node tools/왕복시험.js --새학생
 *
 * ■ `--새학생` — 갓 명부에 오른 학생을 **여기서 세워** 전 검사를 그 학생으로 돌린다
 *   인자로 학생을 받는 판은 **이미 통과한 상태에서 시작**한다. 그러면 그 앞 관문(명부 등록 →
 *   첫 등록 → 운영자 동의 발급)은 영원히 안 재지고, 관문 **사이의 이음매**는 아무도 안 본다.
 *   F176 이 그렇게 드러났다 — 리허설 학생 64명 중 동의가 있는 40명 안에서만 돌던 시험을
 *   갓 등록한 학생으로 태우자 두 칸이 연달아 막혔다. **개원 첫 주는 전원이 이 경로다.**
 *   그래서 이 모드는 동의도 SQL 로 심지 않고 `tools/동의발급.js`(운영자 통로)를 실제로 부른다.
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
// --새학생 이 쓰는 통로. 로그인 코드 계정과 **다른 이메일 규칙**이라 정본에서 따로 가져온다.
const { 이메일: 학생이메일 } = require('../lib/학생계정.js');
const { execFileSync } = require('child_process');

/* --새학생 픽스처. 인증왕복시험과 같은 모양을 쓰되 번호만 매 회차 새로 딴다 —
 * 이 시험은 `learning_events` 에 지울 수 없는 행을 남겨 학생을 재사용하면 「갓 등록」이 아니다. */
const 새연락처 = '+976 9911-2233';
const 새뒷자리 = '2233';
const 새비번 = 'Synk-Rehearsal-1';

/* 시험 학생 대역 — 901 은 인증왕복시험이 쓰고 지운다(겹치면 그쪽 시험이 「이미 등록됨」을 만난다).
 *
 * 🔴 **가장 낮은 빈 번호**를 딴다 — 옛 판은 `max(...)+1` 이었다. 2026-08-09 실측: 손으로 만든
 *   `SYNK-999`("유호 관통시험") **한 줄**이 max 를 끝으로 밀어, 실제로는 13/98 만 쓴 대역이
 *   「찼다」로 죽었다. 빈 자리를 못 보는 채번은 고갈을 실제보다 먼저, 그리고 **틀린 사유로**
 *   알린다 — 차단문이 시키는 처방("대역을 넓혀라·DB 를 새로 깔아라")이 둘 다 헛일이 된다. */
const 대역시작 = 902, 대역끝 = 999;
function 빈번호(쓰인 = []) {
  const 찬 = new Set(쓰인);
  for (let n = 대역시작; n <= 대역끝; n += 1) if (!찬.has(`SYNK-${n}`)) return `SYNK-${n}`;
  return null;
}

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
  const 새학생 = args.includes('--새학생');
  if (!새학생 && (!code용학생 || !평문코드)) {
    die('사용: node tools/왕복시험.js <student_code> <로그인코드>   또는   --새학생');
  }

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
  // 발화점 — 배포판 ≠ 소스(HEAD)면 이 왕복의 초록은 옛 판을 잰 것이다(다르면 여기서 죽는다).
  await require('./배포대조.js').왕복전게이트('왕복시험', e);
  /* --새학생 은 `--운영승인` 으로도 안 뚫린다 — 운영 명부에 시험 학생을 만드는 것은
   * 사건 몇 행과 달리 **사람 한 명이 생기는 것**이고, FK restrict 라 지울 수도 없다. */
  if (새학생 && !/rehearsal/i.test(이름)) {
    die('--새학생 은 리허설 전용이다 — 운영 명부에 시험 학생을 만들지 않는다(지워지지도 않는다)');
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

  let 학생번호 = code용학생;
  let 자격 = 새학생 ? null : { email: 이메일(평문코드), password: 비밀번호(정규형(평문코드)) };

  if (새학생) {
    /* ⓪ 개원 첫 관문 — 명부 등록 → 학생이 앱에서 첫 등록.
     *   번호는 매 회차 새로 딴다: 이 시험이 남기는 `learning_events` 가 append-only 라
     *   같은 학생을 다시 쓰면 두 번째부터는 「갓 등록」이 아니다(그게 F176 이 밟은 함정이다).
     *   ponytail: 대역 98칸을 다 쓰면 die 한다 — 대역을 넓히는 건 그때 몫이다. */
    console.log('⓪ 갓 명부에 오른 학생을 여기서 세운다');
    const 쓰인 = (await sql(
      `select student_code from engine.learners where student_code ~ '^SYNK-9[0-9][0-9]$'`))
      .map((r) => r.student_code);
    학생번호 = 빈번호(쓰인);
    if (!학생번호) die(`SYNK-${대역시작}~${대역끝} 대역 ${대역끝 - 대역시작 + 1}칸이 **전부** 찼다`
      + ` (지금 ${쓰인.length}명) — 시험 학생을 정리하거나 대역을 넓혀라`);
    await sql(`insert into engine.learners(student_code, contact, display_name, schema_ver)
               values ('${학생번호}', '${새연락처}', '왕복시험 새학생', 'probe')`);
    확인(`명부에 ${학생번호} 가 올랐다`,
      (await sql(`select count(*)::int n from engine.learners where student_code='${학생번호}'`))[0].n === 1);

    // 학생이 앱에서 하는 첫 등록(C0 §2) — 여기가 실제 개원 첫날의 첫 화면이다.
    const fr = await fetch(`https://${ref}.supabase.co/functions/v1/auth/first-login`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_code: 학생번호, phone_last4: 새뒷자리, password: 새비번 }),
    });
    const f본문 = JSON.parse((await fr.text()) || '{}');
    확인('갓 명부에 오른 학생이 첫 등록으로 계정을 만든다', fr.status === 200 && f본문.ok === true,
      { status: fr.status, body: f본문 });
    if (fr.status !== 200) die('첫 등록이 막혀 뒤 관문을 잴 수 없다 — 여기서 멈추는 게 개원 첫날의 모습이다');
    자격 = { email: 학생이메일(학생번호), password: 새비번 };
  }

  // 학생 로그인 — 앱이 하는 것과 **같은 경로**(C0 §2). 여기서 갈리면 앱에서도 갈린다.
  const lr = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify(자격),
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
    correlation_id: crypto.randomUUID(),   // 한 앉음을 묶는 키(P0 §3-1 ④)
    payload: { ver: 1, attempt_no: 1 },
    submission: {
      task_ref: 'hw-리허설-1', task_format: '자유발화', body_original: '어제 친구를 만나서 밥을 먹었어요',
      task_snapshot: { 지시문: '어제 한 일을 말해보세요', 문항: '어제 뭐 했어요?' },
    },
    ...덮기,
  });

  const [{ learner_id }] = await sql(`select learner_id from engine.learners where student_code = '${학생번호}'`);
  console.log(`학생 ${학생번호} = ${learner_id}\n`);

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

  if (새학생) {
    /* 운영자 통로를 **실제로 태운다**. 시험이 SQL 로 심으면 그 도구는 영원히 안 재지고,
     * 개원 첫 주에 운영자가 밟는 자리가 바로 여기다(P0 §403 운영 도구 트리오).
     * ⚠ 이 도구는 `agreed_at` 을 **서버 now()** 로 넣는다 — 아래 ②의 `occurred_at` 은 이 기기
     *   시계라, 두 시계가 어긋나면 방금 동의한 학생이 거절된다. 그 이음매를 여기서 잰다. */
    console.log('  ▸ 운영자 동의 발급(tools/동의발급.js)');
    execFileSync(process.execPath,
      [path.join(ROOT, 'tools', '동의발급.js'), 학생번호, '--판', 'v18.9', '--확정자', '왕복시험', '--적용'],
      { stdio: 'inherit' });
    확인('운영자 도구가 동의 행을 넣었다',
      (await sql(`select count(*)::int n from engine.consents
                   where learner_id='${learner_id}' and revoked_at is null`))[0].n === 1);
  } else {
    // 동의를 **과거로** 넣는다 — occurred_at 보다 앞서야 유효하다
    await sql(`insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver)
               values ('${learner_id}', 'v18.9', now() - interval '1 day', 'test')`);
  }

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
    // 🔴 `submission` 을 통째로 덮으므로 나머지 필수도 함께 실어야 한다 — 안 그러면 이 줄은
    //   「값목록 밖이라 막혔다」가 아니라 「필수가 빠져 막혔다」를 재고, 둘은 같은 초록으로 보인다.
    ['값목록 밖 task_format', 기본({ submission: { task_ref: 'x', task_format: '없는형식', body_original: 'a', task_snapshot: { 문항: 'x' } } }), 'CONTRACT_VIOLATION'],
    ['payload 에 ver 없음', 기본({ payload: { attempt_no: 1 } }), 'PAYLOAD_INVALID'],
    ['uuid 아닌 content_id', 기본({ content_id: 'c-hw-0031' }), 'CONTRACT_VIOLATION'],
    ['남의(없는) 사건 재시도', 기본({ retry_of_event_id: crypto.randomUUID() }), 'CONTRACT_VIOLATION'],
    ['필수 누락(level_snapshot)', 기본({ level_snapshot: undefined }), 'CONTRACT_VIOLATION'],
    /* c9 로 올린 두 칸 — 「사실상 필수」·「이름만 있음」이던 자리다(절단문서 ①-10·①-3).
     * 🔴 API 로 재는 이유: 검증기는 Edge Function 이 **배포 시점에 묶은 사본**을 들고 돈다.
     *   저장소가 초록이어도 그 사본이 낡았으면 서버는 계속 옛 판정을 낸다(F179 가 그 형태였다). */
    ['한 앉음 키가 없으면 거부', 기본({ correlation_id: undefined }), 'CONTRACT_VIOLATION'],
    ['그때 본 판(task_snapshot)이 없으면 거부',
      기본({ submission: { task_ref: 'hw-리허설-1', task_format: '자유발화', body_original: 'a' } }), 'CONTRACT_VIOLATION'],
    /* `skill_ids` — L0 §3-2 가 「배열이라 외래키가 안 걸린다 → 서버 검증으로 막는다」고 적어 둔
     * 자리가 08-07 까지 비어 있었다(절단문서 ①-13). 오타 하나가 어휘 지도의 축을 영구 오염시킨다. */
    ['없는 skill_id 는 거부', 기본({ skill_ids: ['skill-없는것'], skill_taxonomy_ver: 'kt.test' }), 'CONTRACT_VIOLATION'],
    ['skill_ids 만 있고 판본이 없으면 거부', 기본({ skill_ids: ['ci-왕복-skill'] }), 'CONTRACT_VIOLATION'],
    ['skill_ids 가 배열이 아니면 거부', 기본({ skill_ids: 'ci-왕복-skill', skill_taxonomy_ver: 'kt.test' }), 'CONTRACT_VIOLATION'],
  ];
  for (const [이름, ev, 기대] of 케이스) {
    const rr = await 부르기({ events: [ev] });
    확인(이름, rr.body.results?.[0]?.error?.code === 기대, rr.body.results?.[0]);
  }

  /* 반대 방향 — **실재하는** id 는 통과하고 그대로 저장된다. 거부만 재면 「전부 막는 검사」와
   * 「옳게 막는 검사」가 같은 모양이 된다(그 상태로 배포하면 G4 게임이 통째로 400 을 맞는다). */
  await sql(`insert into engine.skills (skill_id, label_ko, domain, schema_ver)
             values ('ci-왕복-skill', '왕복시험용', 'grammar', 'test')
             on conflict (skill_id) do nothing`);
  const 태그된 = 기본({ skill_ids: ['ci-왕복-skill'], skill_taxonomy_ver: 'kt.test' });
  const r태그 = await 부르기({ events: [태그된] });
  확인('실재하는 skill_id 는 저장된다', r태그.body.results?.[0]?.status === 'stored', r태그.body.results?.[0]);
  확인('저장된 skill_ids 가 보낸 그대로다',
    (await sql(`select array_to_string(skill_ids, ',') s, skill_taxonomy_ver v from engine.learning_events
                 where event_id = '${r태그.body.results?.[0]?.event_id}'`))[0]?.s === 'ci-왕복-skill');

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
    // `submission` 을 통째로 덮으므로 `task_snapshot`(c9 필수)도 함께 싣는다 — 그날 본 판이다.
    기본({ correlation_id: 흐름, submission: { task_ref: 'hw-리허설-1', task_format: '낭독', body_original: '어제 친구를 만났어요', task_snapshot: { ver: 1, 문장: '어제 친구를 만났어요' } } }),
    기본({ correlation_id: 흐름, submission: { task_ref: 'hw-리허설-1', task_format: '자유발화', body_original: '저는 밥을 먹었어요', task_snapshot: { ver: 1, 프롬프트: '어제 뭐 했어요?' } } }),
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
  /* 재동의 = 새 행 — 회로가 다시 산다(다음 실행도 이 상태에서 시작한다).
   * 🔴 `now()` 가 아니라 2초 앞선 시각을 쓴다. 게이트는 `agreed_at <= occurred_at` 인데
   *   agreed_at 은 **DB 시계**, occurred_at 은 **기기 시계**라 둘을 직접 비교한다. now() 로
   *   심으면 여백이 왕복 지연분(실측 ~12ms)뿐이라 지터에 뒤집힌다 — 2026-08-07 에 같은
   *   조건에서 적색 2회·초록 2회로 실제로 흔들렸다. 여기서 재려는 것은 「재동의하면 다시
   *   저장된다」지 두 시계의 오차가 아니다. ⚠ 이 여백은 **시험의 편의**이고, 두 시계를
   *   직접 비교하는 설계 자체는 남아 있다(기기 시계가 뒤처진 학생은 방금 동의하고도
   *   거절될 수 있다 — sol 심문 C0 P0 「신뢰하지 않는 occurred_at 이 동의 효력을 결정한다」). */
  await sql(`insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver)
             values ('${learner_id}', 'v18.9', now() - interval '2 seconds', 'test')`);
  r = await 부르기({ events: [기본()] });
  확인('재동의(새 행) 뒤에는 다시 저장된다', r.body.results?.[0]?.status === 'stored', r.body.results?.[0]);

  // ── ⑬ 교정 고리가 **API 로** 선다 — c8 correction_id (F179 가 지목한 사각지대)
  /* 🔴 왜 여기냐: `교정왕복시험.js` 는 이 보증을 SQL 로만 잰다. 그래서 실제 통로인
   *   Edge Function 의 INSERT 열 목록에서 correction_id 가 통째로 빠져 있는데도
   *   12/12 가 초록이었다(F179). DB 를 증명한 것이지 **API 를 증명한 게 아니었다.**
   *   그 층은 여기밖에 없다 — 이 파일만 학생 로그인 토큰으로 함수를 부른다. */
  console.log('\n⑬ 교정 고리(API)');
  const [{ submission_id: 교정대상 }] = await sql(
    `select submission_id from engine.submissions where event_id = '${첫?.event_id}'`);
  const [{ correction_id }] = await sql(
    `insert into engine.corrections (submission_id, actor_kind, corrected_text, schema_ver)
     values ('${교정대상}'::uuid, 'teacher', '어제 친구를 만나서 밥을 먹었어요', '${await 현재판()}')
     returning correction_id`);
  const 열람 = {
    idempotency_key: crypto.randomUUID(), event_type: 'correction.viewed', task_type: '숙제제출',
    occurred_at: new Date().toISOString(), level_snapshot: 'Lv3',
    correlation_id: crypto.randomUUID(),   // c9 공통 필수 — 교정 열람도 한 앉음 안에서 일어난다
    correction_id, payload: { ver: 1 },
  };
  r = await 부르기({ events: [열람] });
  확인('API 가 correction.viewed 를 받는다', r.body.results?.[0]?.status === 'stored', r.body.results?.[0]);
  확인('저장된 행에 correction_id 가 살아 있다 — 서버가 값을 버리지 않는다',
    (await sql(`select correction_id from engine.learning_events
                 where idempotency_key='${열람.idempotency_key}'`))[0]?.correction_id === correction_id);
  /* 사유까지 본다 — 「거절됐다」만 보면 봉투·급수 같은 **다른 이유**의 거절이 초록이 된다
   * (이 검사를 지을 때 실제로 두 번 그렇게 거짓 초록이 났다). */
  r = await 부르기({ events: [{ ...열람, idempotency_key: crypto.randomUUID(), correction_id: undefined }] });
  확인('지목 없는 correction.viewed 는 correction_id 때문에 거절된다',
    /correction_id/.test(r.body.results?.[0]?.error?.message ?? ''), r.body.results?.[0]);

  /* ── ⑭ 최초 제출도 개입을 가리킨다 — 절단문서 ①-11
   *   여기까지 `intervention_id` 는 `retry_of_event_id` 가 있을 때만 이어졌다. 그래서 **개입이
   *   먹혀 한 번에 해낸 학생만** 고리가 없었다 — 「어느 개입이 먹혔나」가 영영 재시도 쪽으로 기운다.
   *   🔴 검사를 두 갈래로 나눈다: 배정이 **있을 때 잇는가**(양성) + **없을 때 거절하지 않는가**(음성).
   *   음성이 없으면 「전부 거절하는 서버」와 「옳게 잇는 서버」가 같은 초록이 된다. */
  console.log('\n⑭ 최초 제출 ↔ 개입 (①-11)');
  const 배정표 = `task-①11-${Date.now().toString(36)}`;
  const 개입값 = crypto.randomUUID();
  const [{ event_id: 배정사건 }] = await sql(`
    insert into engine.learning_events
      (learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
       intervention_id, consent_ver, schema_ver)
    values ('${learner_id}', 'task.assigned', '숙제제출', 'ai', now() - interval '1 hour',
            '${배정표}', '${개입값}', 'v18.9', '${await 현재판()}')
    returning event_id`);
  await sql(`insert into engine.submissions (event_id, task_type, task_ref, occurred_at, schema_ver)
             values ('${배정사건}', '숙제제출', '${배정표}', now() - interval '1 hour', '${await 현재판()}')`);

  const 최초 = 기본({ submission: { task_ref: 배정표, task_format: '자유발화', body_original: '한 번에 해냈어요',
    task_snapshot: { ver: 1, 프롬프트: '어제 뭐 했어요?' } } });
  r = await 부르기({ events: [최초] });
  확인('재시도가 아닌 첫 제출도 저장된다', r.body.results?.[0]?.status === 'stored', r.body.results?.[0]);
  확인('그 행이 그날 배정의 intervention_id 를 물려받았다',
    (await sql(`select intervention_id::text i from engine.learning_events
                 where event_id = '${r.body.results?.[0]?.event_id}'`))[0]?.i === 개입값,
    (await sql(`select intervention_id::text i from engine.learning_events
                 where event_id = '${r.body.results?.[0]?.event_id}'`))[0]);

  // 음성 — 배정 없는 task_ref(고정 도입 과제 갈래)는 **거절이 아니라 null** 이다.
  const 배정없음 = 기본({ submission: { task_ref: `task-없는것-${Date.now().toString(36)}`, task_format: '자유발화',
    body_original: '배정 없이 냈어요', task_snapshot: { ver: 1, 프롬프트: 'x' } } });
  r = await 부르기({ events: [배정없음] });
  확인('배정을 못 찾아도 거절하지 않는다 — 그 발화가 큐에서 영영 재시도하면 안 된다',
    r.body.results?.[0]?.status === 'stored', r.body.results?.[0]);
  확인('못 찾은 경우는 null 로 남는다(지어내지 않는다)',
    (await sql(`select intervention_id from engine.learning_events
                 where event_id = '${r.body.results?.[0]?.event_id}'`))[0]?.intervention_id === null);

  /* ── ⑮ 인과 고리를 **앞 항목의 멱등키**로 가리킨다 — 절단문서 ①-4
   *   여기까지 `retry_of_event_id`·`parent_event_id` 는 서버 발급 `event_id` 만 받았다. 그런데 앱의
   *   제출 로그는 오프라인 큐라, 한 배치 안의 앞 항목은 **아직 event_id 가 없다** — 그 고리는 틀리게
   *   저장되는 게 아니라 **보낼 수단이 없어 사라진다.**
   *   🔴 반드시 **한 번의 호출로 두 건**을 보낸다. 앞 것을 미리 넣어 두고 재면 그건 이미 event_id 가
   *     있는 경우라, 정작 이 항목이 지목한 상황(아직 없는 앞)을 **안 재고 초록이 된다.**
   *   🔑 저장된 값이 「가리킨 키」가 아니라 **진짜 event_id** 인지까지 본다 — 열에 멱등키가 남으면
   *     FK 도 하류 조회(`/progress` correction_retry)도 조용히 무너진다. */
  console.log('\n⑮ 아직 안 올라간 앞을 가리킨다 (①-4)');
  const 앞 = 기본();
  const 뒤 = 기본({ retry_of_event_id: 앞.idempotency_key, payload: { ver: 1, attempt_no: 2 } });
  r = await 부르기({ events: [앞, 뒤] });
  const [앞결, 뒤결] = r.body.results ?? [];
  확인('한 배치 안에서 앞 항목의 멱등키로 가리켜도 저장된다 (그 앞은 보낼 때 event_id 가 없었다)',
    앞결?.status === 'stored' && 뒤결?.status === 'stored', r.body.results);
  확인('🔑 열에 남는 것은 가리킨 키가 아니라 앞 항목의 진짜 event_id 다',
    (await sql(`select retry_of_event_id::text v from engine.learning_events
                 where event_id = '${뒤결?.event_id}'`))[0]?.v === 앞결?.event_id,
    { 기대: 앞결?.event_id, 가리킨키: 앞.idempotency_key });

  // 호환 — 서버 event_id 로 가리키던 옛 방식이 그대로여야 한다(넓힌 것이지 바꾼 게 아니다).
  const 옛방식 = 기본({ retry_of_event_id: 앞결?.event_id, payload: { ver: 1, attempt_no: 3 } });
  r = await 부르기({ events: [옛방식] });
  확인('서버 event_id 로 가리키는 옛 방식도 그대로 된다', r.body.results?.[0]?.status === 'stored', r.body.results?.[0]);

  // 선행 턴도 같은 통로다 — 한쪽만 고쳐지면 증상은 「그 칸만 조용히 안 풀린다」뿐이다.
  const 턴1 = 기본();
  const 턴2 = 기본({ parent_event_id: 턴1.idempotency_key, turn_no: 2 });
  r = await 부르기({ events: [턴1, 턴2] });
  const [턴1결, 턴2결] = r.body.results ?? [];
  확인('선행 턴도 앞 항목의 멱등키로 가리킬 수 있다', 턴2결?.status === 'stored', r.body.results);
  확인('그 열에도 진짜 event_id 가 들어간다',
    (await sql(`select parent_event_id::text v from engine.learning_events
                 where event_id = '${턴2결?.event_id}'`))[0]?.v === 턴1결?.event_id, 턴2결);

  /* 음성 — 아무 데도 없는 uuid 는 **400** 이어야 한다. 여기까지 `parent_event_id` 는 검사가 없어
   * FK 가 대신 터졌고, 그건 5xx=`retryable` 이라 그 발화가 큐에서 영원히 재시도했다.
   * 🔴 「거절됐다」만 재면 안 된다 — 500 도 거절처럼 보인다. 상태 코드와 retryable 을 같이 본다. */
  r = await 부르기({ events: [기본({ parent_event_id: crypto.randomUUID() })] });
  확인('없는 선행 턴은 400 CONTRACT_VIOLATION 이다 (500 이면 큐가 영원히 재시도한다)',
    r.status === 200 && r.body.results?.[0]?.error?.code === 'CONTRACT_VIOLATION'
      && r.body.results?.[0]?.error?.retryable === false, { status: r.status, r: r.body.results?.[0] });

  console.log(`\n── 통과 ${통과} · 실패 ${실패} ──`);
  process.exit(실패 ? 1 : 0);
}

module.exports = { 빈번호, 대역시작, 대역끝 };

if (require.main === module) main().catch((err) => die(String(err && err.stack || err)));
