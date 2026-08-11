#!/usr/bin/env node
'use strict';
/**
 * 골든왕복시험 — M2 라벨 회로(`functions/teach`)의 계약을 **실제 DB·함수 왕복으로** 증명한다.
 *
 *   SUPABASE_PROJECT_REF=<리허설ref> node tools/골든왕복시험.js
 *
 * ■ 왜 이 도구인가 (대기열 P1 M2 · 설계 §7 인수 둘)
 *   teach·성적표·강사 화면이 전부 코드로 섰고 리허설 배포도 닫혔는데(배포판 대조 다름 0 · 08-11
 *   실측), 이 통로를 **실제로 지나간 적이 0회**다 — `staff_access_log` 에 `teach.*` 가 0행.
 *   「배포됨」과 「돈다」 사이의 결함은 증상이 없다(검수왕복시험이 그 자리에서 구멍을 처음 냈다).
 *
 * ■ 여기서만 잴 수 있는 것
 *   · **두 소비자가 같은 5건을 보는가** — 서버(teach)의 표본과 lib(`골든표본`) 재현이 실제로
 *     같은 id 집합인지. 갈리면 완료율의 분모와 분자가 다른 풀을 세는데, 코드 회귀는 텍스트
 *     사본까지만 본다(실행 결과의 일치는 DB 만 안다).
 *   · **감사와 골든 행이 한 트랜잭션인가** — target_ids 순서([평가 대상, 골든 행])가 계약대로인가.
 *   · **인수 ⓑ: 검수 확정 모양의 행을 일부러 심어도 성적표가 0으로 계수하는가** — 골든 소속의
 *     정본이 정말 감사 원장인지(역할 조인이면 여기서 오염이 잡힌다).
 *
 * ■ 🔴 리허설 전용 · 남기는 것이 있다
 *   판정은 지울 수 없는 teacher 골든 행과 감사 행을 남긴다(`corrections_immutable` ·
 *   append-only). 그래서 **전부 증분으로** 잰다 — 절대 개수 시험은 2회차부터 영원히 빨갛다.
 *
 * ■ 표본 재료는 **지난 완결 주에 심는다**
 *   풀 경계가 「지난 완결 UTC 주」라, 지금 만든 AI 교정은 이번 주 풀이지 표본이 아니다.
 *   `created_at` 을 명시해 지난주 안에 심고, **명시가 실제로 먹혔는지**를 치명확인으로 잰다
 *   (조용히 default now() 로 떨어지면 큐가 0건인데 원인이 안 보인다).
 */
const 골격 = require('../lib/왕복골격.js');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { 주당건수, 풀술어, 표본, 지난주키, 주범위 } = require('../lib/골든표본.js');
const { VERDICT } = require('../lib/검수확정.js');

const die = (m) => { console.error('[골든왕복시험] ' + m); process.exit(1); };
const 따옴 = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function main() {
  const { ref, sql, anon, service_role: 서비스키, 확인, 치명확인, 보고 } =
    await 골격.열기('골든왕복시험', {
      사유: '판정은 지울 수 없는 teacher 골든 행과 감사 행을 남긴다',
    });
  const base = `https://${ref}.supabase.co`;

  /* 판은 DB 에게 묻는다(검수왕복시험과 같은 사유 — 손 상수는 조각이 오르는 날 426 으로 죽는다). */
  const [{ name: 최신조각 }] = await sql(
    'select name from engine.schema_migrations order by version desc limit 1');
  const 판 = (String(최신조각).match(/_(c\d+)\.sql$/) || [])[1];
  if (!판) die(`최신 조각 이름에서 계약판을 못 읽었다: ${최신조각}`);
  console.log(`  판 ▸ ${판}  (${최신조각})\n`);

  /* ── 판 깔기 ① 사람 셋 — 검수왕복시험의 계정을 **재사용**한다(직원은 만들고 지우지 않는다) ── */
  console.log('■ 판 깔기 — 강사(teacher) · 검수자(inspector · 403 핀) · 비직원');
  const { 도메인 } = require('../lib/로그인코드.js');
  const 사람세우기 = async (라벨, 로컬, 비번, 역할) => {
    const 메일 = `${로컬}${도메인}`;
    let uid = (await sql(`select id from auth.users where email=${따옴(메일)}`))[0]?.id;
    if (!uid) {
      const cr = await fetch(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: 서비스키, Authorization: `Bearer ${서비스키}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 메일, password: 비번, email_confirm: true }),
      });
      uid = cr.ok ? JSON.parse(await cr.text()).id
        : (await sql(`select id from auth.users where email=${따옴(메일)}`))[0]?.id;
      if (!uid) die(`${라벨} 계정을 못 만들었다`);
    }
    await fetch(`${base}/auth/v1/admin/users/${uid}`, {
      method: 'PUT',
      headers: { apikey: 서비스키, Authorization: `Bearer ${서비스키}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 비번 }),
    });
    if (역할) {
      await sql(`insert into engine.staff(auth_user_id, role, display_name)
                 values (${따옴(uid)}, ${따옴(역할)}, ${따옴(라벨)})
                 on conflict (auth_user_id) do nothing`);
      await sql(`update engine.staff set active = true, revoked_before = null
                  where auth_user_id = ${따옴(uid)}`);
    }
    const tr = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 메일, password: 비번 }),
    });
    const 토큰 = JSON.parse(await tr.text()).access_token;
    if (!토큰) die(`${라벨} 로그인 실패`);
    return { uid, 토큰 };
  };
  const 강사 = await 사람세우기('리허설 강사', 'probe-teacher', 'Teacher-Rehearsal-1', 'teacher');
  const 검수자 = await 사람세우기('리허설 검수자', 'probe-inspector', 'Inspector-Rehearsal-1', 'inspector');
  const 외부인 = await 사람세우기('리허설 비직원', 'probe-outsider', 'Outsider-Rehearsal-1', null);

  /* ── 판 깔기 ② 지난주 풀에 AI 교정을 심는다 ─────────────────────── */
  const 주키 = 지난주키();
  const 범위 = 주범위(주키);
  console.log(`\n■ 판 깔기 — 지난 완결 주 ${주키} (${범위.시작} ~ ${범위.끝}) 에 표본 재료 심기`);

  const 제출후보 = await sql(`
    select s.submission_id, coalesce(s.transcript_verified, s.transcript) as 전사
      from engine.submissions s
      join engine.learning_events e on e.event_id = s.event_id
     where coalesce(s.transcript_verified, s.transcript) is not null
     order by s.occurred_at desc limit 8`);
  치명확인(`전사가 있는 제출물 후보를 확보했다 (${제출후보.length}건)`, 제출후보.length >= 5);

  const 심은 = [];
  const 시작ms = new Date(범위.시작).getTime();
  for (let i = 0; i < 제출후보.length; i += 1) {
    const s = 제출후보[i];
    const at = new Date(시작ms + 86400000 + i * 420000).toISOString(); // 화요일께 · 7분 간격
    const [행] = await sql(`
      insert into engine.corrections
        (submission_id, actor_kind, corrected_text, error_tags, explanation,
         model, prompt_ver, schema_ver, created_at)
      values (${따옴(s.submission_id)}::uuid, 'ai', ${따옴(`${s.전사} (AI 교정)`)},
              array['조사 오류']::text[], ${따옴('픽스처 — 골든왕복시험')},
              ${따옴('fixture-goldrt')}, ${따옴('fixture.v1')}, ${따옴(판)}, ${따옴(at)}::timestamptz)
      returning correction_id, created_at`);
    심은.push({ correction_id: 행.correction_id, submission_id: s.submission_id, 전사: s.전사 });
    if (i === 0) {
      치명확인('명시한 created_at 이 실제로 먹혔다(조용히 now() 로 떨어지지 않는다)',
        new Date(행.created_at) < new Date(범위.끝) && new Date(행.created_at) >= new Date(범위.시작), 행.created_at);
    }
  }
  console.log(`  심음 ▸ ${심은.length}건 (지난주 풀 소속)`);

  /* 지역 재현 — 서버와 **같은 lib** 로 표본을 계산한다(두 소비자 정합의 기준값). */
  const 풀 = await sql(`
    select c.correction_id, c.submission_id
      from engine.corrections c
     where ${풀술어}
       and c.created_at >= ${따옴(범위.시작)}::timestamptz
       and c.created_at <  ${따옴(범위.끝)}::timestamptz
     order by c.correction_id`);
  const 지역표본 = (표본(풀, 주키) ?? []).map((r) => String(r.correction_id));
  치명확인(`지역 재현 표본이 섰다 (풀 ${풀.length}건 → 표본 ${지역표본.length}건)`, 지역표본.length === Math.min(주당건수, 풀.length));

  /* ── 부르기 손잡이 ────────────────────────────────────────────── */
  const 부르기 = async (경로, { 메서드 = 'GET', 토큰 = 강사.토큰, 본문, 판선언 = 판 } = {}) => {
    const h = { apikey: anon, 'Content-Type': 'application/json' };
    if (판선언 !== null) h['X-Contract-Ver'] = 판선언;
    if (토큰 !== null) h.Authorization = `Bearer ${토큰}`;
    const r = await fetch(`${base}/functions/v1/teach/${경로}`, {
      method: 메서드, headers: h, body: 본문 === undefined ? undefined : JSON.stringify(본문),
    });
    const t = await r.text();
    let body = {};
    try { body = JSON.parse(t || '{}'); } catch { body = { 원문: t.slice(0, 200) }; }
    return { status: r.status, body };
  };
  const 코드 = (r) => r.body?.error?.code;
  const 감사수 = async (액션) => Number((await sql(
    `select count(*)::int c from engine.staff_access_log where action=${따옴(액션)}`))[0].c);

  /* ── ① 문 — 계약판 · 경로 · 메서드 · 권한 ───────────────────────── */
  console.log('\n■ ① 문 — 계약판 · 경로 · 메서드 · 권한(허용 목록의 경계)');
  let r;
  r = await 부르기('gold/queue', { 판선언: null });
  확인('X-Contract-Ver 없으면 400 CONTRACT_VER_MISSING', r.status === 400 && 코드(r) === 'CONTRACT_VER_MISSING', r);
  r = await 부르기('gold/queue', { 판선언: 'v9' });
  확인('판 형식이 아니면 426', r.status === 426 && 코드(r) === 'CONTRACT_VER_UNSUPPORTED', r);
  r = await 부르기('gold/queue', { 판선언: 'c99' });
  확인('서버가 모르는 미래 판이면 426', r.status === 426 && 코드(r) === 'CONTRACT_VER_UNSUPPORTED', r);
  r = await 부르기('gold/aueue');
  확인('없는 경로는 404 — `/teach/아무거나` 가 큐로 동작하지 않는다(뒷 두 마디 라우팅)', r.status === 404 && 코드(r) === 'CONTRACT_VIOLATION', r);
  r = await 부르기('gold/queue', { 메서드: 'POST', 본문: {} });
  확인('queue 에 POST 는 405', r.status === 405, r);
  r = await 부르기('gold/judge');
  확인('judge 에 GET 은 405', r.status === 405, r);
  r = await 부르기('gold/queue', { 토큰: anon });
  확인('anon 키는 유효한 JWT 지만 사람이 아니다 — 401', r.status === 401 && 코드(r) === 'AUTH_REQUIRED', r);
  r = await 부르기('gold/queue', { 토큰: 외부인.토큰 });
  확인('로그인한 비직원은 403 NOT_STAFF', r.status === 403 && 코드(r) === 'NOT_STAFF', r);
  r = await 부르기('gold/queue', { 토큰: 검수자.토큰 });
  확인('🔴 inspector 는 강사 문을 못 지난다 — 403 (역할 경계 = 축의 경계 · review 의 teacher→403 거울)',
    r.status === 403 && 코드(r) === 'NOT_STAFF', r);

  /* ── ② 큐 — 두 소비자 정합 · 감사 ───────────────────────────────── */
  console.log('\n■ ② 큐 — 서버 표본 == lib 재현 표본 · 0건도 감사 1행');
  const 큐감사전 = await 감사수('teach.gold.queue');
  r = await 부르기('gold/queue');
  치명확인('큐 조회 200', r.status === 200 && r.body.ok === true, r);
  확인(`week 가 lib 지난주키와 같다 (${r.body.week})`, r.body.week === 주키, r.body.week);
  확인(`sample_size == 주당건수(${주당건수})`, r.body.sample_size === 주당건수);
  확인(`pool_size(${r.body.pool_size}) == 지역 풀(${풀.length})`, r.body.pool_size === 풀.length);
  const 서버표본 = (r.body.data ?? []).map((it) => String(it.correction_id)).sort();
  확인('🔴 서버 표본 == lib 재현 표본 — 두 소비자가 같은 5건을 본다(분모=분자 전제)',
    JSON.stringify(서버표본) === JSON.stringify(지역표본.slice().sort()), { 서버표본, 지역표본 });
  확인('감사 teach.gold.queue 가 1행 늘었다', (await 감사수('teach.gold.queue')) === 큐감사전 + 1);
  const 막힌카드 = (r.body.data ?? []).filter((it) => it.status === 'blocked');
  확인(`막힌 카드(${막힌카드.length}건)에 전사·교정 내용이 없다`,
    막힌카드.every((it) => !('transcript' in it) && !('ai_corrected_text' in it)));
  const 열린 = (r.body.data ?? []).filter((it) => it.status === 'open');
  확인(`remaining(${r.body.remaining}) == 열린 카드 수(${열린.length})`, r.body.remaining === 열린.length);
  치명확인(`판정할 열린 카드가 있다 (${열린.length}건)`, 열린.length >= 1,
    '동의 유효한 표본이 0이면 재료 학생의 동의 상태부터 본다');

  /* ── ③ judge 거절 갈래 ──────────────────────────────────────────── */
  console.log('\n■ ③ judge — 거절 갈래(모양·표본·정합)');
  const 대상 = 열린[0];
  r = await 부르기('gold/judge', { 메서드: 'POST', 본문: { reviewed_correction_id: '00000000-0000-4000-8000-000000000000', verdict: VERDICT.AI } });
  확인('없는 행은 404 NOT_FOUND', r.status === 404 && 코드(r) === 'NOT_FOUND', r);
  /* 행째로 잡는다 — ⑤ 오염 픽스처가 이 행의 **자기 submission_id** 를 써야 하기 때문이다.
   * id 만 들고 다니면 남의 제출에 붙이게 되고 FK `corrections_reviewed_same_submission` 이
   * 거절한다(실측 08-11: ⑤가 여기서 죽어 인수 ⓑ 가 한 번도 안 돌았다). */
  const 표본밖행 = 풀.find((x) => !지역표본.includes(String(x.correction_id)));
  const 표본밖 = 표본밖행 && String(표본밖행.correction_id);
  치명확인('표본 밖 풀 행이 있다(풀 > 표본)', !!표본밖);
  r = await 부르기('gold/judge', { 메서드: 'POST', 본문: { reviewed_correction_id: 표본밖, verdict: VERDICT.AI } });
  확인('풀엔 있지만 표본 밖이면 409 NOT_IN_SAMPLE — 강사가 골라 판정 못 한다(무작위의 심장)',
    r.status === 409 && 코드(r) === 'NOT_IN_SAMPLE', r);
  r = await 부르기('gold/judge', { 메서드: 'POST', 본문: { reviewed_correction_id: 대상.correction_id, verdict: '대충 맞다' } });
  확인('어휘 밖 verdict 는 400', r.status === 400 && 코드(r) === 'CONTRACT_VIOLATION', r);
  r = await 부르기('gold/judge', { 메서드: 'POST', 본문: { reviewed_correction_id: 대상.correction_id, verdict: VERDICT.수정 } });
  확인('③에 고친 문장이 없으면 400 (corrected_text 필수)', r.status === 400 && r.body?.error?.field === 'corrected_text', r);
  r = await 부르기('gold/judge', { 메서드: 'POST', 본문: { reviewed_correction_id: 대상.correction_id, verdict: VERDICT.AI, corrected_text: '몰래 실은 고침' } });
  확인('②에 고친 문장을 실으면 400 — 조용히 버리지 않고 거절한다', r.status === 400 && r.body?.error?.field === 'corrected_text', r);
  r = await 부르기('gold/judge', {
    메서드: 'POST',
    본문: { reviewed_correction_id: 대상.correction_id, verdict: VERDICT.수정, corrected_text: 대상.ai_corrected_text, verdict_reason: '사유' },
  });
  확인('③인데 AI 교정과 같은 문장이면 409 VERDICT_TEXT_MISMATCH — 승률 부호가 안 뒤집힌다',
    r.status === 409 && 코드(r) === 'VERDICT_TEXT_MISMATCH', r);

  /* ── ④ judge 성공 — 원자성·감사 순서 ────────────────────────────── */
  console.log('\n■ ④ judge 성공 — 골든 행 + 감사가 한 벌 · target_ids 순서');
  /* 계측기(성적표)는 죽어도 제품 단언은 계속 돈다 — 실패를 die 로 받으면 성적표 쪽 사고
   * (API 429·stdout 오염) 하나가 ④⑤ 의 제품 단언 전부를 가리고 분모 없이 죽는다(F207).
   * 실패 = 확인 1건(적색)으로 남기고 null 을 돌려, 분모 단언만 건너뛴다.
   * `--지금` 앵커 = 세 측정이 같은 창을 본다(창이 미끄러지면 옳은데 off-by-one 적색). */
  const 창앵커 = new Date().toISOString();
  const 성적표돌리기 = (라벨) => {
    const p = spawnSync(process.execPath,
      [path.join(__dirname, '성적표.js'), '--json', '--지금', 창앵커],
      { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
    try {
      if (p.error || p.status !== 0) throw new Error(String(p.error || p.stderr).slice(0, 300));
      return JSON.parse(p.stdout);
    } catch (e) {
      확인(`성적표를 잴 수 있었다(계측기 · ${라벨})`, false, String(e.message || e));
      return null;
    }
  };
  /* 🔴 기준선은 판정 **앞**에서 잰다 — 「내 판정이 세어지는가」(④)와 「오염이 안 세어지는가」(⑤)는
   * 다른 축이라 따로 문다. 초판은 판정 뒤에 잰 값에 `+ 성공수` 를 기대해 두 축을 한 단언에 뭉쳤고,
   * 그 단언은 이미 세어진 것을 두 번 세라는 뜻이라 **제품이 옳아도 영원히 빨갛다**(08-11 실측). */
  const 기준선 = 성적표돌리기('기준선');
  const 판정감사전 = await 감사수('teach.gold.judge');
  const 고친문장 = `${대상.transcript} — 강사 손질`;
  r = await 부르기('gold/judge', {
    메서드: 'POST',
    본문: {
      reviewed_correction_id: 대상.correction_id, verdict: VERDICT.수정,
      corrected_text: 고친문장, verdict_reason: '픽스처 판정 — 골든왕복시험',
      error_tags: ['조사 오류'], rubric_scores: { 사과: 3, 이유: 2, 대안: 3 },
    },
  });
  치명확인('③ 판정 200', r.status === 200 && r.body.ok === true, r);
  확인(`week 가 그 행이 속한 주다 (${r.body.week})`, r.body.week === 주키, r.body.week);
  const 골든id = r.body.correction_id;
  const [골든행] = await sql(`
    select actor_kind::text, reviewed_correction_id::text, verdict, verdict_reason,
           corrected_text, transcript_at_review
      from engine.corrections where correction_id=${따옴(골든id)}::uuid`);
  확인('골든 행이 teacher · reviewed_correction_id=평가 대상', 골든행
    && 골든행.actor_kind === 'teacher' && 골든행.reviewed_correction_id === String(대상.correction_id), 골든행);
  확인('🔑 transcript_at_review 를 서버가 채웠다(강사가 본 전사가 행에 남는다)',
    골든행 && String(골든행.transcript_at_review) === String(대상.transcript));
  확인('감사 teach.gold.judge 가 1행 늘었다', (await 감사수('teach.gold.judge')) === 판정감사전 + 1);
  const [감사행] = await sql(`
    select target_ids::text[] as ids from engine.staff_access_log
     where action='teach.gold.judge' order by at desc limit 1`);
  확인('🔴 target_ids 순서 = [평가 대상, 골든 행] (0=AI · 1=골든 — 성적표 조인의 계약)',
    감사행 && 감사행.ids[0] === String(대상.correction_id) && 감사행.ids[1] === String(골든id), 감사행);

  r = await 부르기('gold/judge', { 메서드: 'POST', 본문: { reviewed_correction_id: 대상.correction_id, verdict: VERDICT.AI } });
  확인('같은 행 재판정은 409 ALREADY_JUDGED (중복 골든 행이 원리상 안 생긴다)',
    r.status === 409 && 코드(r) === 'ALREADY_JUDGED', r);

  r = await 부르기('gold/queue');
  const 다시 = (r.body.data ?? []).find((it) => String(it.correction_id) === String(대상.correction_id));
  확인('재조회 큐에서 그 카드가 judged 로 선다(사라지지 않는다 — 완료율의 분모 유지)',
    다시 && 다시.status === 'judged', 다시);

  let 성공수 = 1;
  const 둘째 = (r.body.data ?? []).find((it) => it.status === 'open');
  if (둘째) {
    const r2 = await 부르기('gold/judge', { 메서드: 'POST', 본문: { reviewed_correction_id: 둘째.correction_id, verdict: VERDICT.AI } });
    확인('② 「AI 교정이 맞다」 판정도 200 (빈 corrected_text 가 정상)', r2.status === 200, r2);
    if (r2.status === 200) 성공수 += 1;
  }

  /* ④ 축 마감 — 오염을 심기 전에 잰다(⑤ 헤더 아래 찍히면 오염 축 결함으로 오독된다). */
  const 전 = 성적표돌리기('판정 후');
  if (기준선 && 전) {
    확인(`④ 내 판정이 분모에 세어졌다 (${기준선.분모}→${전.분모} · 판정 ${성공수}건)`,
      전.분모 === 기준선.분모 + 성공수,
      { 기준선: 기준선.분모, 전: 전.분모, 성공수, 층델타: { 기준선: 기준선.층, 전: 전.층 }, 참고: '어긋나면 같은 리허설 DB 의 병행 판정 의심' });
  }

  /* ── ⑤ 인수 ⓑ — 검수 확정 모양을 심어도 성적표는 0으로 센다 ───────── */
  console.log('\n■ ⑤ 인수 ⓑ — 오염 시험(골든 소속의 정본이 감사 원장인가)');
  const [오염] = await sql(`
    insert into engine.corrections
      (submission_id, reviewed_correction_id, actor_kind, verdict, verdict_reason,
       reviewer, transcript_at_review, schema_ver)
    values (${따옴(표본밖행.submission_id)}::uuid, ${따옴(표본밖)}::uuid, 'teacher'::engine.actor_kind,
            ${따옴(VERDICT.AI)}, ${따옴('오염 픽스처 — 검수 확정 모양(teach 감사 없음)')},
            ${따옴(강사.uid)}, ${따옴('전사')}, ${따옴(판)})
    returning correction_id`);
  const 후 = 성적표돌리기('오염 후');
  if (전 && 후) {
    확인(`🔴 인수 ⓑ — 오염 행은 0으로 계수, 분모 불변 (${전.분모}→${후.분모})`,
      후.분모 === 전.분모, { 전: 전.분모, 후: 후.분모 });
  }
  /* 후 가 null 이면 계측기 확인이 이미 적색이다 — null 위에서 돌리면 「미실행=통과」가 된다. */
  if (후) {
    확인('오염 행 id 가 성적표 산출물 어디에도 없다',
      !JSON.stringify(후).includes(String(오염.correction_id)));
  }

  보고(`주 ${주키} · 풀 ${풀.length} · 표본 ${지역표본.length} · 판정 ${성공수}건 · 오염 픽스처 ${String(오염.correction_id).slice(0, 8)}`);
}

main().catch((e) => die(String(e && e.stack ? e.stack : e)));
