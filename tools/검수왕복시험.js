#!/usr/bin/env node
'use strict';
/**
 * 검수왕복시험 — ⑥ 검수 콘솔(`functions/review`)의 계약을 **실제 DB·함수 왕복으로** 증명한다.
 *
 *   SUPABASE_PROJECT_REF=<리허설ref> node tools/검수왕복시험.js
 *
 * ■ 왜 이 도구가 필요했나
 *   ⑥ 은 착수 순서 넷(판 22열 → `review` 함수 → c11 물리 → Expo 화면)이 **전부 코드로 섰고**
 *   배포판 대조도 닫혔는데(다름 0), 이 통로를 **한 번도 실제로 지나간 적이 없었다.**
 *   실측이 그 말을 그대로 했다 — `staff_access_log` 의 `action` 이 `learner.*` 둘뿐이라
 *   `review.queue`·`review.audio`·`review.audio.played`·`review.approve`·`review.discard` 는
 *   **0행**이었다.
 *   즉 「배포됨」과 「돈다」 사이가 통째로 비어 있었고, 그 구간의 결함은 증상이 없다.
 *
 * ■ 여기서만 잴 수 있는 것 — 파일 층 회귀가 원리상 못 보는 자리들
 *   · **감사와 응답이 한 트랜잭션인가**(§2) — 코드에 `tx` 라고 적혀 있는지는 회귀가 보지만,
 *     그 트랜잭션이 실제 커넥션에서 커밋되는지는 DB 만 안다.
 *   · **뷰 소속이 시간에 따라 바뀌는가** — 확정·폐기분이 정말 큐에서 빠지는지.
 *   · **폐기 어휘를 DB CHECK 에서 읽는 사슬**(`pg_get_constraintdef`) — 파싱이 실패하면
 *     증상이 400 이 아니라 **500** 이라 회귀에선 초록이고 여기서만 빨개진다.
 *   · **원자성 넷**(teacher 행 · `transcript_verified` · `status='verified'` · 감사).
 *   · **게이트가 시간을 어떻게 세는가**(§2 개정 · ㉮) — 이 도구가 그 구멍을 **처음 냈다**:
 *     서명 기록이 612초 된 확정분에 새 서명 없이 재검수를 보내니 200 이었다. 회귀는 코드에
 *     `staff_access_log` 가 있는 것만 보지, 그 장부가 **append-only 라 영원히 산다**는 사실이
 *     게이트를 무력화하는 것은 못 본다. 지금은 두 자리를 여기서 잰다:
 *     ①서명만 받고 재생 안 한 승인이 거절되는가(프리로드 누수) ②마지막 판정 이후에 다시
 *     듣지 않은 재검수가 거절되는가(옛 기록 재사용).
 *
 * ■ 🔴 리허설 전용 · 남기는 것이 있다
 *   확정은 `corrections`(트리거 `corrections_immutable`)에 **지울 수 없는 teacher 행**을 남기고
 *   `staff_access_log` 도 append-only 다. 그래서 절대 개수로 재지 않고 **전부 증분으로** 잰다 —
 *   `=1` 로 재는 시험은 2회차부터 영원히 빨갛다. 프로젝트 이름에 `rehearsal` 이 없으면 거부한다.
 *
 * ■ 픽스처를 **새로 만들지 않고 실제 제출물에서 고른다**
 *   큐 소속 조건은 넷이다(제출사건 `submission.created` · 잡이 끝난 상태가 아님 · AI 교정 존재 ·
 *   `audio_deleted_at` 없음). 이 중 앞의 둘은 이미 리허설에 68건 서 있고, **없는 것은 AI 교정
 *   하나**다(생산자 `functions/correct` 는 `ANTHROPIC_API_KEY` 를 기다리는 중 — 그래서 오늘
 *   운영·리허설 큐가 **구조적으로 0행**이다). 그 한 칸만 심어 큐를 세운다.
 *   🔑 오디오는 **스토리지에 실제로 있는 것만** 고른다 — 없는 경로를 고르면 §4 의 500 이
 *   「서명 통로 결함」과 「파일이 애초에 없다」를 같은 모양으로 만든다(실측: 후보 8 중 2가 그렇다).
 */
const 골격 = require('../lib/왕복골격.js');   // 공통 머리(환경→과녁→게이트→키→판정) — 왕복 6종 공용
const { 도메인 } = require('../lib/로그인코드.js');  // 합성 도메인 정본(여기 박으면 바뀌는 날 조용히 죽는다)
const { 하한ms, 판정, VERDICT } = require('../lib/검수확정.js'); // 기대값을 서버와 **같은 함수**에서 낸다

const die = (m) => { console.error('[검수왕복시험] ' + m); process.exit(1); };

/** SQL 리터럴 — 이 도구가 심는 문자열은 전부 여기를 지난다(따옴표 하나로 시험이 깨지지 않게). */
const 따옴 = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function main() {
  const { ref, sql, anon, service_role: 서비스키, 확인, 치명확인, 보고 } =
    await 골격.열기('검수왕복시험', {
      사유: '확정은 지울 수 없는 teacher 라벨과 감사 행을 남긴다',
    });

  const base = `https://${ref}.supabase.co`;

  /* 판은 **DB 에게 묻는다** — 함수가 그렇게 하고(`review/index.ts`), 여기에 손 상수를 두면
   * 조각이 오르는 날 시험만 옛 판을 선언해 426 으로 죽는다(교정왕복시험이 이미 밟은 함정). */
  const [{ name: 최신조각 }] = await sql(
    'select name from engine.schema_migrations order by version desc limit 1');
  const 판 = (String(최신조각).match(/_(c\d+)\.sql$/) || [])[1];
  if (!판) die(`최신 조각 이름에서 계약판을 못 읽었다: ${최신조각}`);
  console.log(`  판 ▸ ${판}  (${최신조각})\n`);

  /* ── ⓪ 물리가 실제로 서 있는가 ────────────────────────────────────
   * 안 서 있으면 아래 거절들이 「계약대로 막혔다」가 아니라 「열이 없어 깨졌다」로 나오고,
   * 그 둘은 로그에서 같은 모양이다. 조용한 미적용을 통과로 읽지 않기 위한 자리. */
  console.log('■ ⓪ 물리 — c11 자리 넷 · 뷰 · 폐기 어휘 CHECK');
  const [물리] = await sql(`
    select (select count(*) from information_schema.columns
             where table_schema='engine' and table_name='corrections'
               and column_name in ('supersedes','promotion_intent','transcript_at_review')) as 교정칸,
           (select count(*) from information_schema.columns
             where table_schema='engine' and table_name='pipeline_jobs'
               and column_name='discard_reason')                                            as 폐기칸,
           (select count(*) from pg_class where relnamespace=to_regnamespace('engine')
             and relname='review_queue' and relkind='v')                                    as 뷰,
           (select pg_get_constraintdef(oid) from pg_constraint
             where connamespace=to_regnamespace('engine')
               and conname like 'pipeline_jobs_discard_reason_c%' limit 1)                   as 폐기CHECK`);
  치명확인('교정 칸 3 · 폐기 칸 1 · 뷰 1 이 서 있다',
    Number(물리.교정칸) === 3 && Number(물리.폐기칸) === 1 && Number(물리.뷰) === 1);
  /* 어휘를 **DB 에서 뽑는다** — 코드에 목록을 박으면 그게 넷째 사본이 되고, 이 시험은 사본끼리
   * 대조해 놓고 「맞다」고 말하게 된다(`lib/검수확정.js` 머리말과 같은 사슬). */
  const 폐기어휘 = [...String(물리.폐기check || 물리.폐기CHECK || '')
    .matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
  치명확인(`폐기 사유 어휘를 CHECK 에서 읽었다 (${폐기어휘.length}종: ${폐기어휘.join(' · ')})`,
    폐기어휘.length >= 3);

  /* ── 판 깔기 ① 사람 셋 ──────────────────────────────────────────
   * 🔑 직원은 **만들고 지우지 않는다 — 재사용한다.** `staff_access_log` 가 append-only 이고
   *   `staff_id` FK 가 `on delete restrict` 라 감사 행이 있는 직원은 지울 수 없다. 그건 결함이
   *   아니라 감사 무결성이 설계대로 도는 것이다(인증왕복시험이 같은 자리에서 같은 판정을 했다). */
  console.log('\n■ 판 깔기 — 검수자(inspector) · 강사(teacher) · 비직원');
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
    // 재사용이라 비밀번호가 갈렸을 수 있다 — 매번 맞춰 두면 회차가 서로를 안 깨뜨린다.
    await fetch(`${base}/auth/v1/admin/users/${uid}`, {
      method: 'PUT',
      headers: { apikey: 서비스키, Authorization: `Bearer ${서비스키}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 비번 }),
    });
    if (역할) {
      await sql(`insert into engine.staff(auth_user_id, role, display_name)
                 values (${따옴(uid)}, ${따옴(역할)}, ${따옴(라벨)})
                 on conflict (auth_user_id) do nothing`);
      /* 🔑 앞 회차가 해임 갈래에서 죽었을 수 있다 — 되살려 두지 않으면 그 뒤 전 회차가
       *   「검수 권한 없음」으로 빨갛고, 원인은 이 시험 자신이 된다. */
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

  const 검수자 = await 사람세우기('리허설 검수자', 'probe-inspector', 'Inspector-Rehearsal-1', 'inspector');
  const 강사 = await 사람세우기('리허설 강사', 'probe-teacher', 'Teacher-Rehearsal-1', 'teacher');
  const 외부인 = await 사람세우기('리허설 비직원', 'probe-outsider', 'Outsider-Rehearsal-1', null);
  const [{ staff_id: 검수자ID }] = await sql(
    `select staff_id from engine.staff where auth_user_id=${따옴(검수자.uid)}`);
  확인('inspector 역할이 허용 목록에 실제로 들어 있다(오늘 리허설의 유일한 inspector)', !!검수자ID, 검수자ID);

  /* ── 판 깔기 ② 큐 두 줄 ────────────────────────────────────────── */
  const 후보들 = await sql(`
    select s.submission_id, s.audio_ref, s.transcript
      from engine.submissions s
      join engine.learning_events e on e.event_id = s.event_id and e.event_type='submission.created'
      join engine.pipeline_jobs j on j.submission_id = s.submission_id
     where j.status <> all (array['discarded','revoked','verified']::engine.job_status[])
       and s.audio_deleted_at is null and s.audio_ref is not null
       and not exists (select 1 from engine.corrections c
                        where c.submission_id = s.submission_id and c.actor_kind='ai')
     order by s.occurred_at desc limit 12`);

  /* 스토리지에 **실제로 있는** 것만 고른다 — 없는 경로를 고르면 §4 가 500 을 내고, 그 500 은
   * 「서명 통로가 깨졌다」와 구분이 안 된다. 서명은 여기서 service_role 로 직접 확인한다
   * (함수를 부르는 것이 아니라 판을 고르는 일이라 이 자리가 맞다). */
  const 있는것 = [];
  for (const c of 후보들) {
    if (있는것.length >= 2) break;
    const r = await fetch(`${base}/storage/v1/object/sign/learner-media/${c.audio_ref}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${서비스키}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 60 }),
    });
    if (r.ok) 있는것.push(c);
  }
  치명확인(`오디오가 실재하는 후보를 둘 골랐다 (후보 ${후보들.length}건 중)`, 있는것.length === 2);
  const [A, B] = 있는것;

  /* AI 교정을 심는다 = 큐 소속의 마지막 조건. 이 한 칸이 없어서 오늘 큐가 0행이다. */
  const AI교정 = async (s, 문장) => {
    const [행] = await sql(`
      insert into engine.corrections
        (submission_id, actor_kind, corrected_text, error_tags, explanation, model, prompt_ver, schema_ver)
      values (${따옴(s.submission_id)}::uuid, 'ai', ${따옴(문장)},
              array['조사 오류']::text[], ${따옴('픽스처 — 검수왕복시험')},
              ${따옴('fixture')}, ${따옴('fixture.v1')}, ${따옴(판)})
      returning correction_id`);
    return 행.correction_id;
  };
  const A전사 = A.transcript || '학생이 말한 문장';
  const A교정문 = `${A전사} (AI 교정)`;
  const A_AI = await AI교정(A, A교정문);
  const B_AI = await AI교정(B, `${B.transcript || '학생이 말한 문장'} (AI 교정)`);
  확인('AI 교정을 심자 큐 소속 조건 넷이 채워졌다', !!A_AI && !!B_AI);

  const 큐에있나 = async (sid) => Number((await sql(
    `select count(*)::int c from engine.review_queue where submission_id=${따옴(sid)}::uuid`))[0].c) === 1;
  치명확인('심은 둘이 실제로 큐에 떴다', (await 큐에있나(A.submission_id)) && (await 큐에있나(B.submission_id)));

  /* ── 부르기 손잡이 ────────────────────────────────────────────── */
  const 부르기 = async (경로, { 메서드 = 'GET', 토큰 = 검수자.토큰, 본문, 판선언 = 판, 질의 = '' } = {}) => {
    const h = { apikey: anon, 'Content-Type': 'application/json' };
    if (판선언 !== null) h['X-Contract-Ver'] = 판선언;
    if (토큰 !== null) h.Authorization = `Bearer ${토큰}`;
    const r = await fetch(`${base}/functions/v1/review/${경로}${질의}`, {
      method: 메서드, headers: h, body: 본문 === undefined ? undefined : JSON.stringify(본문),
    });
    const t = await r.text();
    let body = {};
    try { body = JSON.parse(t || '{}'); } catch { body = { 원문: t.slice(0, 200) }; }
    return { status: r.status, body };
  };
  const 감사수 = async (액션) => Number((await sql(
    `select count(*)::int c from engine.staff_access_log where action=${따옴(액션)}`))[0].c);

  /* ── ① 문 — 계약판·경로·메서드·권한 ─────────────────────────────
   * 🔑 권한 갈래가 이 시험의 절반이다. 새는 방향이 언제나 「통과」라, 여기가 조용히 열려 있으면
   *   학생 발화 전량과 감사 장부가 아무에게나 열린다. */
  console.log('\n■ ① 문 — 계약판 · 경로 · 메서드 · 권한');
  const 코드 = (r) => r.body?.error?.code;
  let r;
  r = await 부르기('queue', { 판선언: null });
  확인('X-Contract-Ver 가 없으면 400 CONTRACT_VER_MISSING', r.status === 400 && 코드(r) === 'CONTRACT_VER_MISSING', r);
  r = await 부르기('queue', { 판선언: 'v9' });
  확인('판 형식이 아니면 426', r.status === 426 && 코드(r) === 'CONTRACT_VER_UNSUPPORTED', r);
  r = await 부르기('queue', { 판선언: 'c99' });
  확인('서버가 모르는 미래 판이면 426 (서버가 앞서지 않는다)', r.status === 426 && 코드(r) === 'CONTRACT_VER_UNSUPPORTED', r);
  r = await 부르기('queeu');
  확인('없는 경로는 404 — `/review/아무거나` 가 큐 조회로 동작하지 않는다', r.status === 404 && 코드(r) === 'CONTRACT_VIOLATION', r);
  r = await 부르기('queue', { 메서드: 'POST', 본문: {} });
  확인('queue 에 POST 는 405', r.status === 405, r);
  r = await 부르기('approve');
  확인('approve 에 GET 은 405', r.status === 405, r);
  r = await 부르기('queue', { 토큰: anon });
  확인('🔴 anon 키는 유효한 JWT 지만 사람이 아니다 — 401 AUTH_REQUIRED', r.status === 401 && 코드(r) === 'AUTH_REQUIRED', r);
  r = await 부르기('queue', { 토큰: 외부인.토큰 });
  확인('로그인한 비직원은 403 NOT_STAFF', r.status === 403 && 코드(r) === 'NOT_STAFF', r);
  r = await 부르기('queue', { 토큰: 강사.토큰 });
  확인('🔴 `teacher` 도 403 — 검수역할은 **허용 목록**이지 차단 목록이 아니다', r.status === 403 && 코드(r) === 'NOT_STAFF', r);

  await sql(`update engine.staff set active=false where auth_user_id=${따옴(검수자.uid)}`);
  r = await 부르기('queue');
  const 해임됨 = 확인('해임(active=false)되면 같은 토큰으로도 403 — 「직원 아님」과 한 코드로 묶는다',
    r.status === 403 && 코드(r) === 'NOT_STAFF', r);
  await sql(`update engine.staff set active=true where auth_user_id=${따옴(검수자.uid)}`);
  if (!해임됨) die('해임 갈래가 예상 밖이라 여기서 멈춘다 — 되살림은 이미 실행했다');

  /* ── ② §3 큐 읽기 ──────────────────────────────────────────────── */
  console.log('\n■ ② §3 큐 읽기 — 감사가 응답의 조건이다');
  for (const [라벨, q] of [['0', '?limit=0'], ['21', '?limit=21'], ['숫자 아님', '?limit=abc']]) {
    r = await 부르기('queue', { 질의: q });
    확인(`limit ${라벨} 은 400 — 잘린 것과 없는 것이 같은 모양이면 안 된다`,
      r.status === 400 && r.body?.error?.field === 'limit', r);
  }
  r = await 부르기('queue', { 질의: '?cursor=엉터리' });
  확인('망가진 cursor 는 400', r.status === 400 && r.body?.error?.field === 'cursor', r);

  const 감사전 = await 감사수('review.queue');
  r = await 부르기('queue', { 질의: '?limit=20' });
  const 큐 = 확인('검수자 토큰으로 200', r.status === 200 && Array.isArray(r.body.data), r);
  const 실린것 = (r.body.data || []).map((x) => x.submission_id);
  확인('내가 심은 둘이 큐에 실렸다', 실린것.includes(A.submission_id) && 실린것.includes(B.submission_id),
    { 실린것: 실린것.length });
  확인('🔴 `event_id` 는 응답에 안 실린다 — 판의 서버 전용 열이 브라우저까지 가지 않는다',
    (r.body.data || []).every((x) => !('event_id' in x)), Object.keys((r.body.data || [])[0] || {}));
  확인('AI 교정 칸이 화면 재료로 함께 온다(그게 검수의 대상이다)',
    (r.body.data || []).some((x) => x.submission_id === A.submission_id && x.ai_correction_id === A_AI));
  확인('큐 조회가 감사에 정확히 1행 남는다', (await 감사수('review.queue')) === 감사전 + 1);
  if (!큐) die('큐를 못 읽어 아래가 전부 메아리가 된다');

  const p1 = await 부르기('queue', { 질의: '?limit=1' });
  확인('limit=1 이면 다음 쪽 커서가 온다', p1.status === 200 && p1.body.data.length === 1 && !!p1.body.next_cursor, p1.body?.next_cursor);
  const p2 = await 부르기('queue', { 질의: `?limit=1&cursor=${encodeURIComponent(p1.body.next_cursor || '')}` });
  확인('커서로 이으면 앞 쪽과 다른 행이 온다(keyset — offset 이 아니다)',
    p2.status === 200 && p2.body.data.length === 1
    && p2.body.data[0].submission_id !== p1.body.data[0].submission_id,
    { 1: p1.body.data[0]?.submission_id, 2: p2.body.data?.[0]?.submission_id });

  /* ── ③ §4 오디오 서명 ─────────────────────────────────────────── */
  console.log('\n■ ③ §4 오디오 — 서명을 받은 뒤에 감사를 적는다');
  r = await 부르기('audio', { 메서드: 'POST', 본문: { submission_id: 'abc' } });
  확인('submission_id 모양이 아니면 400', r.status === 400 && r.body?.error?.field === 'submission_id', r);
  r = await 부르기('audio', { 메서드: 'POST', 본문: { submission_id: '00000000-0000-4000-8000-000000000000' } });
  확인('큐 밖 항목은 404 NOT_FOUND — 존재 여부가 새지 않는다', r.status === 404 && 코드(r) === 'NOT_FOUND', r);

  const 서명전 = await 감사수('review.audio');
  r = await 부르기('audio', { 메서드: 'POST', 본문: { submission_id: A.submission_id } });
  /* 🔑 칸 이름을 **하나만** 받는다 — `url ?? signed_url ?? …` 로 느슨하게 받으면 계약이 갈리는
   *   날 시험이 그것을 흡수해 초록으로 덮는다(계약 대조가 눈이 머는 전형). */
  const 서명났다 = 확인('큐 안 항목은 200 + `url` + `expires_at`',
    r.status === 200 && typeof r.body.url === 'string' && !!r.body.expires_at, r);
  확인('서명 발급이 감사에 1행 남는다(그 행이 승인 게이트 ②의 입력이다)',
    (await 감사수('review.audio')) === 서명전 + 1);
  if (서명났다) {
    const 받기 = await fetch(r.body.url);
    확인('🔑 그 주소로 파일이 실제로 내려온다 — 「서명이 났다」와 「들을 수 있다」는 다르다',
      받기.ok, { status: 받기.status });
  }

  /* ── ④ §5 승인 게이트 — 막히는 방향이 맞는가 ───────────────────── */
  console.log('\n■ ④ §5 승인 게이트 — 새는 방향이 「통과」인 자리들');
  const 승인본문 = (o = {}) => ({
    submission_id: A.submission_id, reviewed_correction_id: A_AI, supersedes: null,
    transcript_verified: A전사, corrected_text: A교정문,
    error_tags: ['조사 오류'], explanation: null, l1_source_phrase: null,
    rubric_scores: null, reviewer_confidence: 0.9,
    review_listened_ms: 하한ms, promote: true, ...o,
  });
  const 승인 = (o) => 부르기('approve', { 메서드: 'POST', 본문: 승인본문(o) });

  /* 🔴 **㉮ 개정의 핵심 실증** — A 는 방금 §4 로 서명을 받았다(③). 옛 계약이면 그 발급 기록이
   *   곧 게이트 ②의 증거라 여기서 **통과**했다. 이제는 거절돼야 한다: 발급은 「열 수 있게 해
   *   준 것」이고 게이트를 여는 것은 「열었다」뿐이다. 이 한 줄이 프리로드 누수가 닫혔음을
   *   서버 층에서 증명한다(화면 순서에 기대지 않는다). */
  r = await 승인();
  확인('🔴 서명만 받고 «재생은 안 했으면» 승인이 안 된다 — 프리로드가 게이트를 못 연다',
    r.status === 409 && 코드(r) === 'GATE_NOT_MET' && r.body?.error?.field === 'audio', r);

  r = await 부르기('approve', {
    메서드: 'POST',
    본문: { submission_id: B.submission_id, reviewed_correction_id: B_AI, supersedes: null,
      transcript_verified: '들은 문장', corrected_text: '고친 문장',
      review_listened_ms: 하한ms, promote: false },
  });
  확인('🔴 오디오를 연 기록이 없으면 승인이 안 된다 — 한 번도 안 들은 발화가 라벨이 되지 않는다',
    r.status === 409 && 코드(r) === 'GATE_NOT_MET', r);
  확인('   그 거절이 `audio` 칸을 지목한다', r.body?.error?.field === 'audio', r.body?.error);

  /* ── ④-2 §4-2 재생 알림 — 게이트 ②의 증거를 만든다 ───────────── */
  console.log('\n■ ④-2 §4-2 재생 알림 — 아무것도 발급하지 않고 「열었다」만 남긴다');
  r = await 부르기('played', { 메서드: 'POST', 본문: { submission_id: 'abc' } });
  확인('submission_id 모양이 아니면 400', r.status === 400 && r.body?.error?.field === 'submission_id', r);
  r = await 부르기('played', { 메서드: 'POST', 본문: { submission_id: '00000000-0000-4000-8000-000000000000' } });
  확인('큐 밖이고 확정분도 아니면 404 — 존재 여부가 새지 않는다', r.status === 404 && 코드(r) === 'NOT_FOUND', r);

  const 청취전 = await 감사수('review.audio.played');
  r = await 부르기('played', { 메서드: 'POST', 본문: { submission_id: A.submission_id } });
  확인('200 이고 응답에 `ok` 말고는 없다 — 발급이 0이라 서명 누수 위험도 0이다',
    r.status === 200 && r.body.ok === true && r.body.url === undefined && r.body.expires_at === undefined, r);
  확인('감사에 review.audio.played 1행 — 게이트 ②가 읽는 입력이 여기서 생긴다',
    (await 감사수('review.audio.played')) === 청취전 + 1);

  r = await 승인({ review_listened_ms: 0 });
  확인(`청취 0ms 는 거절 — 문턱 ${하한ms}ms(오늘은 하한 · 세그먼트 생산자가 아직 안 채웠다)`,
    코드(r) === 'GATE_NOT_MET' && r.body?.error?.field === 'review_listened_ms', r);
  r = await 승인({ reviewed_correction_id: B_AI });
  확인('다른 제출물의 AI 교정을 평가 대상으로 못 가리킨다', 코드(r) === 'GATE_NOT_MET', r);
  r = await 승인({ corrected_text: '   ' });
  확인('빈 교정문은 400 — 아무것도 안 한 확정이 정답 라벨이 되지 않는다',
    r.status === 400 && r.body?.error?.field === 'corrected_text', r);
  r = await 승인({ submission_id: '00000000-0000-4000-8000-000000000000' });
  확인('없는 제출물은 404', r.status === 404 && 코드(r) === 'NOT_FOUND', r);

  /* ── ⑤ §5-1 승인 — 원자성 넷 ──────────────────────────────────── */
  console.log('\n■ ⑤ §5-1 승인 — 한 트랜잭션에 넷이 같이 선다');
  const 승인감사전 = await 감사수('review.approve');
  const 교정전 = Number((await sql(`select count(*)::int c from engine.corrections
                                     where submission_id=${따옴(A.submission_id)}::uuid
                                       and actor_kind='teacher'`))[0].c);
  r = await 승인();
  const 확정됨 = 확인('200 ok', r.status === 200 && r.body.ok === true, r);
  if (!확정됨) die('확정이 안 됐다 — 아래 원자성 검사는 전부 메아리가 된다');
  const A확정 = r.body.correction_id;
  확인(`verdict 를 **서버가 파생**했다 (${r.body.verdict})`,
    r.body.verdict === 판정({ 검증전사: A전사, ai교정문: A교정문, 최종교정문: A교정문 })
    && r.body.verdict === VERDICT.AI, r.body);
  확인('🔑 `listen_gate.measured=false` 로 미측정을 드러낸다 — 미측정을 통과로 두지 않는다',
    r.body.listen_gate && r.body.listen_gate.measured === false
    && r.body.listen_gate.required_ms === 하한ms, r.body.listen_gate);
  확인('승격 의사가 응답에 그대로 실린다', r.body.promotion_intent === true, r.body);

  const [원자] = await sql(`
    select (select count(*)::int from engine.corrections
             where submission_id=${따옴(A.submission_id)}::uuid and actor_kind='teacher') as teacher행,
           (select transcript_verified from engine.submissions
             where submission_id=${따옴(A.submission_id)}::uuid)                            as 검증전사,
           (select status::text from engine.pipeline_jobs
             where submission_id=${따옴(A.submission_id)}::uuid)                            as 잡상태,
           (select promotion_intent from engine.corrections
             where correction_id=${따옴(A확정)}::uuid)                                       as 승격의사,
           (select verdict from engine.corrections
             where correction_id=${따옴(A확정)}::uuid)                                       as 저장된verdict,
           (select transcript_at_review from engine.corrections
             where correction_id=${따옴(A확정)}::uuid)                                       as 판정시전사`);
  확인('① teacher 행이 정확히 하나 늘었다', Number(원자.teacher행) === 교정전 + 1, 원자);
  확인('② `submissions.transcript_verified` 가 최신 판정에서 파생됐다', 원자.검증전사 === A전사, 원자);
  확인('③ `pipeline_jobs.status` 가 verified 다 — 안 쓰면 확정분이 큐에 영원히 남는다',
    원자.잡상태 === 'verified', 원자);
  확인('④ 감사에 review.approve 1행', (await 감사수('review.approve')) === 승인감사전 + 1);
  확인('승격 의사·verdict·판정 시점 전사가 그 행에 같이 저장됐다',
    원자.승격의사 === true && 원자.저장된verdict === VERDICT.AI && 원자.판정시전사 === A전사, 원자);
  확인('🔴 확정분은 큐에서 빠진다 — 같은 발화를 또 만나지 않는다', !(await 큐에있나(A.submission_id)));
  r = await 부르기('audio', { 메서드: 'POST', 본문: { submission_id: A.submission_id } });
  확인('확정분에는 새 서명이 안 나간다(§4 는 큐 소속을 본다)', r.status === 404 && 코드(r) === 'NOT_FOUND', r);

  /* ── ⑥ `Z` 재검수 — 큐 «밖» 갈래 ──────────────────────────────── */
  console.log('\n■ ⑥ `Z` 재검수 — 확정분은 큐 밖이라 갈래가 따로다');
  const 재검수문 = `${A전사} (사람이 다시 고침)`;
  r = await 승인({ supersedes: A_AI, corrected_text: 재검수문, transcript_verified: A전사 });
  확인('supersedes 는 teacher 행이어야 한다 — AI 행을 가리키면 400',
    r.status === 400 && r.body?.error?.field === 'supersedes', r);

  /* 🔴 **612초 구멍의 실증** — 이 자리가 2026-08-09 에 200 이었다. 재생 기록은 살아 있지만
   *   그것은 **확정 «전»**의 것이라 이번 판정의 증거가 못 된다. 옛 계약은 `exists` 만 봐서
   *   append-only 장부의 아무 행이나 통과시켰고, 그래서 「정직한 검수자는 다시 들을 수 없는데
   *   자백을 적어 보내면 통과」였다. 시간 상수는 여기 한 글자도 없다. */
  r = await 승인({ supersedes: A확정, corrected_text: 재검수문, transcript_verified: A전사 });
  확인('🔴 마지막 판정 «이후»에 다시 안 들었으면 재검수가 거절된다 — 옛 재생 기록은 증거가 아니다',
    r.status === 409 && 코드(r) === 'GATE_NOT_MET' && r.body?.error?.field === 'audio', r);

  /* 확정분에도 §4-2 는 열려 있다(소속 = 큐 안 **또는** verified). §4 는 여전히 404 인데
   * 그 둘이 갈리는 것이 ㉮ 다 — 발급은 안 주고 「열었다」는 받는다. 다시 듣는 길은 아직 살아
   * 있는 옛 URL 뿐이라, 그것이 죽으면 재검수가 자연히 닫힌다(창 = 시간 상수 0). */
  r = await 부르기('played', { 메서드: 'POST', 본문: { submission_id: A.submission_id } });
  확인('확정분에도 재생 알림은 받는다 — 서명은 안 나가지만 「다시 들었다」는 적힌다',
    r.status === 200 && r.body.ok === true, r);

  r = await 승인({ supersedes: A확정, corrected_text: 재검수문, transcript_verified: A전사 });
  const 재검수됨 = 확인('확정분(verified)은 큐 밖이지만 재검수는 받는다', r.status === 200 && r.body.ok === true, r);
  const A재확정 = r.body.correction_id;
  if (재검수됨) {
    확인(`재검수의 verdict 도 서버가 다시 판정한다 (${r.body.verdict})`,
      r.body.verdict === VERDICT.수정, r.body.verdict);
    const [계보] = await sql(`select supersedes from engine.corrections
                               where correction_id=${따옴(A재확정)}::uuid`);
    확인('계보가 `supersedes` 로 이어졌다', 계보.supersedes === A확정, 계보);
    r = await 승인({ supersedes: A확정, corrected_text: `${재검수문}2`, transcript_verified: A전사 });
    확인('🔴 같은 판정을 두 번 대체하면 409 SUPERSEDE_CONFLICT — 「최신 1행」이 둘이 되지 않는다',
      r.status === 409 && 코드(r) === 'SUPERSEDE_CONFLICT', r);
  }

  /* ── ⑦ §5-2 폐기 ──────────────────────────────────────────────── */
  console.log('\n■ ⑦ §5-2 폐기 — 어휘 정본은 DB CHECK 다');
  const 폐기 = (본문) => 부르기('discard', { 메서드: 'POST', 본문 });
  r = await 폐기({ submission_id: B.submission_id, reason: '아무 사유' });
  확인('닫힌 어휘 밖은 400', r.status === 400 && r.body?.error?.field === 'reason', r);
  확인('🔑 그 400 이 **DB CHECK 에서 읽은** 어휘를 그대로 안내한다(코드에 박은 사본이 아니다)',
    폐기어휘.every((v) => String(r.body?.error?.message || '').includes(v)),
    { 안내: r.body?.error?.message, 어휘: 폐기어휘 });

  const 폐기감사전 = await 감사수('review.discard');
  r = await 폐기({ submission_id: B.submission_id, reason: 폐기어휘[0] });
  const 폐기됨 = 확인(`200 — 사유 「${폐기어휘[0]}」`, r.status === 200 && r.body.ok === true, r);
  if (폐기됨) {
    const [b] = await sql(`select status::text as status, discard_reason from engine.pipeline_jobs
                            where submission_id=${따옴(B.submission_id)}::uuid`);
    확인('상태·사유가 같이 적혔다(사유 없는 폐기는 나중에 오염과 구별이 안 된다)',
      b.status === 'discarded' && b.discard_reason === 폐기어휘[0], b);
    확인('감사에 review.discard 1행', (await 감사수('review.discard')) === 폐기감사전 + 1);
    확인('폐기분도 큐에서 빠진다 — 되돌아오지 않는다', !(await 큐에있나(B.submission_id)));
    r = await 폐기({ submission_id: B.submission_id, reason: 폐기어휘[0] });
    확인('이미 폐기된 것은 404(큐 밖)', r.status === 404 && 코드(r) === 'NOT_FOUND', r);
    /* §4-2 의 소속은 큐 안 **또는** verified 다 — 폐기분은 어느 쪽도 아니라 막힌다.
     * 안 막으면 폐기된 발화에 「열어 봄」 감사만 쌓이고, 그 장부는 지울 수 없다. */
    r = await 부르기('played', { 메서드: 'POST', 본문: { submission_id: B.submission_id } });
    확인('폐기분에는 재생 알림도 안 받는다 — 다시 들을 대상이 아니다',
      r.status === 404 && 코드(r) === 'NOT_FOUND', r);
  }

  /* ── ⑧ 0건도 장부에 남는가 ────────────────────────────────────── */
  console.log('\n■ ⑧ 0건 조회 — 빈 응답에만 장부가 없으면 분모가 조용히 달라진다');
  const 남은 = Number((await sql('select count(*)::int c from engine.review_queue'))[0].c);
  const 빈감사전 = await 감사수('review.queue');
  r = await 부르기('queue', { 질의: '?limit=20' });
  확인(`조회가 200 (지금 큐 ${남은}행)`, r.status === 200, r.status);
  확인('0건이든 아니든 감사는 1행 늘어난다', (await 감사수('review.queue')) === 빈감사전 + 1);

  const [{ c: 남은후보 }] = await sql(`
    select count(*)::int c from engine.submissions s
      join engine.learning_events e on e.event_id = s.event_id and e.event_type='submission.created'
      join engine.pipeline_jobs j on j.submission_id = s.submission_id
     where j.status <> all (array['discarded','revoked','verified']::engine.job_status[])
       and s.audio_deleted_at is null and s.audio_ref is not null
       and not exists (select 1 from engine.corrections c
                        where c.submission_id = s.submission_id and c.actor_kind='ai')`);
  보고(`픽스처 A=${A.submission_id.slice(0, 8)}(확정·재검수) · B=${B.submission_id.slice(0, 8)}(폐기) · 남은 후보 ${남은후보}건`);
}

main().catch((e) => die(String(e && e.stack ? e.stack : e)));
