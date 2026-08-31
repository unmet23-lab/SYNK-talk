#!/usr/bin/env node
'use strict';
/**
 * 관찰왕복시험 — 교실 관찰 통로(c14 `observation.noted`)를 **실제 DB·함수 왕복으로** 증명한다.
 *
 *   node tools/관찰왕복시험.js
 *
 * ■ 왜 이 도구인가
 *   경로 셋·화면·장부가 전부 코드로 섰고 리허설 배포도 닫혔는데(`teach` 다름 0), 이 통로를
 *   **한 번도 실제로 지나간 적이 없다** — `staff_access_log` 에 `teach.observe.*` 가 0행.
 *   「배포됨」과 「돈다」 사이의 결함은 증상이 없다(골든·반피드백 왕복시험이 같은 자리에서
 *   각각 구멍을 처음 냈다).
 *
 * ■ 여기서만 잴 수 있는 것 — 파일 층 회귀가 **원리상** 못 보는 다섯
 *   ⓐ **동의 없는 학생의 관찰이 실린다** — c14 ③ 이 「운영 기록 계열은 게이트를 안 지나되
 *      조용히 버려지지도 않는다」를 명문화했는데, 그 말이 참인지는 **동의 행이 없는 학생**을
 *      일부러 세워 넣어 봐야만 안다. 코드 회귀는 `동의게이트지나나()` 가 false 인 것까지만 본다.
 *   ⓑ **`consent_ver='운영기록'` 이 물리를 통과하는가** — 그 칸은 `not null` 이고, 값이
 *      CHECK 에 걸리는지는 Postgres 만 안다(08-31 에 그 칸을 안 정해 둔 것이 이 트랙의 발견이다).
 *   ⓒ **초안이 정말 아무것도 안 남기는가**(설계 §2) — 소스 회귀는 `관찰초안내기` 본문에
 *      `sql` 이 없는 것까지만 본다. 「그 왕복 전후로 행 수가 같다」는 DB 만 안다.
 *   ⓓ **`draft_modified` 세 값이 서버에서 갈리는가** — 되싣기 그대로면 false · 고치면 true ·
 *      초안 없으면 **null**(분모 밖). 셋째 값이 둘로 접히는 사고는 집계에서만 보이고 늦다.
 *   ⓔ **학생 RLS 가 관찰을 가리는가**(c14 ④) — 정책 원문 회귀는 `event_type <> ...` 이 적혀
 *      있는지까지만 본다. 학생 토큰으로 **실제 select** 해 봐야 그 정책이 도는지 안다.
 *
 * ■ 🔴 리허설 전용 · 남기는 것이 있다 — 그래서 픽스처가 멱등이다
 *   `learning_events`·`staff_access_log` 는 update·delete 가 둘 다 막혀 있다(`*_immutable`).
 *   그래서 사람·반·학생을 **고정 키로 재사용**하고, 사건만 회차마다 새 멱등키로 넣는다
 *   (그 행은 지울 수 없으니 회차당 3행씩 자란다 — 이 시험의 값이 그만큼이라 감수한다).
 *   프로젝트 이름에 `rehearsal` 이 없으면 골격이 거부한다.
 *
 * ■ 안 하는 것(정직 표기)
 *   · **`observe/draft` 의 벤더 왕복을 안 태운다** — 값이 드는 경로다(반피드백왕복시험의 F452
 *     와 같은 판단). 대신 「그 왕복이 DB 를 안 건드린다」(ⓒ)만 재는데, 그것이 이 경로에 대해
 *     **설계가 실제로 건 장치**다. 초안 품질은 여기서 잴 것이 아니다.
 *   · 운영(라이브)은 안 건드린다.
 */
const 골격 = require('../lib/왕복골격.js');
const { 도메인 } = require('../lib/로그인코드.js');
const 관찰 = require('../lib/관찰초안.js');
const { 운영기록판 } = require('../lib/사건출처.js');

const die = (m) => { console.error('[관찰왕복시험] ' + m); process.exit(1); };
const 따옴 = (s) => `'${String(s).replace(/'/g, "''")}'`;

/* 이 시험이 실제로 지나는 함수 하나. 좁히는 방향이 「새는 방향」이라 회귀가 이 목록을 문다. */
const 게이트함수들 = ['teach'];

/* 고정 픽스처 키 — 멱등의 뼈대. */
const 반내 = '왕복-관찰-내반';
const 반남 = '왕복-관찰-남의반';
const 학생내 = 'RTOB-X1';
const 학생남 = 'RTOB-Y1';

async function main() {
  const { ref, sql, anon, service_role: 서비스키, 확인, 치명확인, 보고 } =
    await 골격.열기('관찰왕복시험', {
      함수목록: 게이트함수들,
      사유: 'learning_events·staff_access_log 는 지울 수 없는 행을 남긴다',
    });
  const base = `https://${ref}.supabase.co`;

  /* 판은 **DB 에게 묻는다** — 손 상수를 두면 조각이 오르는 날 시험만 옛 판을 선언해 426 으로 죽는다. */
  const [{ name: 최신조각 }] = await sql(
    'select name from engine.schema_migrations order by version desc limit 1');
  const 판 = (String(최신조각).match(/_(c\d+)\.sql$/) || [])[1];
  if (!판) die(`최신 조각 이름에서 계약판을 못 읽었다: ${최신조각}`);
  console.log(`  판 ▸ ${판}  (${최신조각})\n`);

  /* ── ⓪ 물리 — c14 가 실제로 배포됐나 ──────────────────────────────────
   * 안 서 있으면 아래 거절들이 「계약대로 막혔다」가 아니라 「열이 없어 깨졌다」로 나오고,
   * 그 둘은 로그에서 같은 모양이다. */
  console.log('■ ⓪ 물리 — 물리칸 2 · event_type CHECK · RLS 정책');
  const [물리] = await sql(`
    select (select count(*) from information_schema.columns
             where table_schema='engine' and table_name='learning_events'
               and column_name in ('observer_staff_id','draft_modified'))          as 물리칸수,
           /* 🔑 conrelid 를 «반드시» 건다 — 이름만으로 찾으면 다른 표의 동명 제약이 걸리거나
            *   0행이 나오고, 0행은 「받지 않는다」와 같은 모양이 된다(08-31 실측: 실제로 그렇게
            *   빨갛게 나왔고 원인은 DB 가 아니라 이 질의였다).
            * ⚠ 이 주석은 템플릿 리터럴 «안»이다 — 백틱을 쓰면 문자열이 여기서 끊겨 파일이
            *   구문 오류로 죽는다(같은 날 teach 의 SQL 주석에서 이미 한 번 밟았다). */
           (select pg_get_constraintdef(oid) from pg_constraint
             where conrelid = 'engine.learning_events'::regclass
               and conname like 'learning_events_event_type%')                     as 사건검사,
           (select qual from pg_policies
             where schemaname='engine' and tablename='learning_events'
               and policyname='learner_self_events')                               as 학생정책`);
  치명확인('물리칸 둘이 서 있다 (observer_staff_id · draft_modified)', Number(물리.물리칸수) === 2,
    { 물리칸수: 물리.물리칸수 });
  치명확인('event_type CHECK 이 observation.noted 를 받는다',
    String(물리.사건검사 || '').includes('observation.noted'));
  확인('🔴 학생 RLS 정책이 관찰을 «이름으로» 제외한다 (c14 ④)',
    String(물리.학생정책 || '').includes('observation.noted'), { 정책: 물리.학생정책 });

  /* ── 판 깔기 ① 이 시험 전용 강사 ────────────────────────────────────
   * 직원은 만들고 지우지 않는다 — 감사 행이 있는 직원은 FK(on delete restrict)가 막는다.
   * 전용 강사를 쓰는 이유: 남의 시험 강사를 빌리면 그쪽이 반을 배정하는 날 「내 반은 하나」라는
   * 이 시험의 전제가 조용히 깨지고, 그 증상은 **초록 쪽으로** 샌다. */
  console.log('\n■ 판 깔기 — 이 시험 전용 강사(teacher) · 반 둘 · 학생 둘');
  const 메일 = `probe-observe${도메인}`;
  const 비번 = 'Observe-Rehearsal-1';
  let uid = (await sql(`select id from auth.users where email=${따옴(메일)}`))[0]?.id;
  if (!uid) {
    const cr = await fetch(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: 서비스키, Authorization: `Bearer ${서비스키}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 메일, password: 비번, email_confirm: true }),
    });
    uid = cr.ok ? JSON.parse(await cr.text()).id
      : (await sql(`select id from auth.users where email=${따옴(메일)}`))[0]?.id;
    if (!uid) die('강사 계정을 못 만들었다');
  }
  await fetch(`${base}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: { apikey: 서비스키, Authorization: `Bearer ${서비스키}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 비번 }),
  });
  await sql(`insert into engine.staff(auth_user_id, role, display_name)
             values (${따옴(uid)}, 'teacher', '관찰 왕복 강사')
             on conflict (auth_user_id) do nothing`);
  /* 앞 회차가 어딘가에서 죽었을 수 있다 — 되살려 두지 않으면 그 뒤 전 회차가 「권한 없음」으로
   * 빨갛고, 원인은 이 시험 자신이 된다(검수·반피드백 왕복시험이 같은 처방을 했다). */
  await sql(`update engine.staff set active = true, revoked_before = null
              where auth_user_id = ${따옴(uid)}`);
  const [{ staff_id }] = await sql(
    `select staff_id from engine.staff where auth_user_id=${따옴(uid)}`);

  const tr = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 메일, password: 비번 }),
  });
  const 토큰 = JSON.parse(await tr.text()).access_token;
  if (!토큰) die('강사 로그인 실패');
  console.log(`  강사 ▸ staff_id ${staff_id}`);

  const 반세우기 = async (키) => {
    const 있나 = (await sql(`select class_id from engine.classes where class_key=${따옴(키)}`))[0];
    if (있나) {
      await sql(`update engine.classes set active=true where class_id=${따옴(있나.class_id)}::uuid`);
      return 있나.class_id;
    }
    const [행] = await sql(`
      insert into engine.classes (class_key, display_name, active, schema_ver)
      values (${따옴(키)}, ${따옴(키)}, true, ${따옴(판)}) returning class_id`);
    return 행.class_id;
  };
  const 내반 = await 반세우기(반내);
  const 남반 = await 반세우기(반남);

  /* 🔴 **남의 반은 일부러 배정하지 않는다** — 이 한 줄이 아래 「담당 반 밖 404」의 전부다. */
  await sql(`insert into engine.staff_classes (staff_id, class_id, schema_ver)
             values (${따옴(staff_id)}::uuid, ${따옴(내반)}::uuid, ${따옴(판)})
             on conflict do nothing`);

  const 학생세우기 = async (코드, 반) => {
    const 있나 = (await sql(`select learner_id from engine.learners where student_code=${따옴(코드)}`))[0];
    if (있나) {
      await sql(`update engine.learners set active=true, class_id=${따옴(반)}::uuid
                  where learner_id=${따옴(있나.learner_id)}::uuid`);
      return 있나.learner_id;
    }
    const [행] = await sql(`
      insert into engine.learners (student_code, display_name, level_current, class_id, active, schema_ver)
      values (${따옴(코드)}, ${따옴(코드)}, 'Lv3', ${따옴(반)}::uuid, true, ${따옴(판)})
      returning learner_id`);
    return 행.learner_id;
  };
  const 내학생 = await 학생세우기(학생내, 내반);
  const 남학생 = await 학생세우기(학생남, 남반);

  /* 🔴 **동의를 일부러 안 넣는다** — ⓐ 의 전부다. 이 학생에게 동의 행이 하나도 없어야
   *   「운영 기록 계열은 게이트를 안 지난다」가 실제로 참인지 갈린다. */
  const [{ 동의수 }] = await sql(
    `select count(*)::int as 동의수 from engine.consents where learner_id=${따옴(내학생)}::uuid`);
  치명확인(`픽스처 전제 — 이 학생은 동의 행이 **0**이다 (게이트를 안 지나는 것을 재려면 필수)`,
    Number(동의수) === 0, { 동의수 });

  const 부르기 = async (경로, { 메서드 = 'GET', 몸 = null, 토큰: t = 토큰 } = {}) => {
    const r = await fetch(`${base}/functions/v1/teach/${경로}`, {
      method: 메서드,
      headers: {
        apikey: anon, Authorization: `Bearer ${t}`,
        'X-Contract-Ver': 판, 'Content-Type': 'application/json',
      },
      body: 몸 ? JSON.stringify(몸) : undefined,
    });
    let 본문 = null;
    try { 본문 = JSON.parse(await r.text()); } catch { /* 본문 없는 응답 */ }
    return { 상태: r.status, 본문 };
  };
  const 사건수 = async () => (await sql(
    `select count(*)::int as n from engine.learning_events where event_type='observation.noted'`))[0].n;

  /* ── ① 로스터 — 내 반만 ─────────────────────────────────────────── */
  console.log('\n■ ① observe/roster — 담당 반만 나온다');
  const 로스터 = await 부르기('observe/roster');
  치명확인(`로스터 200 (경로가 산다)`, 로스터.상태 === 200, 로스터);
  const 명단 = (로스터.본문 && 로스터.본문.roster) || [];
  const 코드들 = 명단.map((r) => r.student_code);
  확인(`내 반 학생이 목록에 있다 (${학생내})`, 코드들.includes(학생내), { 코드들 });
  확인(`🔴 담당 반 «밖» 학생은 목록에 **없다** (${학생남}) — 심어 두고 재는 자리다`,
    !코드들.includes(학생남), { 코드들 });
  const [{ 감사수: 로스터감사 }] = await sql(
    `select count(*)::int as 감사수 from engine.staff_access_log
      where staff_id=${따옴(staff_id)}::uuid and action='teach.observe.roster'`);
  확인(`로스터 조회가 감사 행을 남겼다 (${로스터감사}건 · 학생 이름을 여는 조회라 한 벌이다)`,
    로스터감사 > 0, { 로스터감사 });

  /* ── ② 초안은 아무것도 안 남긴다 ────────────────────────────────────
   * 🔑 벤더를 안 태우려고 **일부러 400 을 받는다** — 빈 원문은 벤더 왕복 «전»에 거절된다.
   *   그래도 이 왕복이 지나는 코드 경로는 같고, 재는 것은 「행이 늘었나」다. */
  console.log('\n■ ② observe/draft — DB 를 한 글자도 안 건드린다 (설계 §2)');
  const 앞 = await 사건수();
  const 초안응답 = await 부르기('observe/draft', { 메서드: 'POST', 몸: { note_text: '   ' } });
  확인('빈 원문은 400 으로 막힌다 (벤더 왕복 전에)', 초안응답.상태 === 400, 초안응답);
  const 뒤 = await 사건수();
  확인(`🔴 초안 왕복 전후로 관찰 행 수가 «같다» (${앞} → ${뒤}) — 초안은 사건이 아니다`,
    앞 === 뒤, { 앞, 뒤 });

  /* ── ③ 확정 — 세 갈래로 draft_modified 를 가른다 ────────────────────── */
  console.log('\n■ ③ observe/note — 확정 셋 (되싣기 그대로 · 고침 · 초안 없음)');
  const 회차키 = `관찰왕복-${Date.now()}`;
  const 초안A = { area: '문법', tags: ['어순'], draft_ver: 관찰.판정판 };

  const A = await 부르기('observe/note', { 메서드: 'POST', 몸: {
    learner_id: 내학생, area: '문법', tags: ['어순'],
    note_text: '왕복시험 A — 초안 그대로 확정', idempotency_key: `${회차키}-A`, draft: 초안A,
  } });
  확인('ⓐ 동의 «0건» 학생의 관찰이 200 으로 실린다 (c14 ③ — 게이트를 안 지난다)',
    A.상태 === 200, A);
  확인('ⓓ 되싣기 그대로면 draft_modified = **false**', A.본문 && A.본문.draft_modified === false, A.본문);

  const B = await 부르기('observe/note', { 메서드: 'POST', 몸: {
    learner_id: 내학생, area: '발음', tags: [],
    note_text: '왕복시험 B — 강사가 영역을 고쳤다', idempotency_key: `${회차키}-B`, draft: 초안A,
  } });
  확인('ⓓ 강사가 고치면 draft_modified = **true**', B.본문 && B.본문.draft_modified === true, B.본문);

  const C = await 부르기('observe/note', { 메서드: 'POST', 몸: {
    learner_id: 내학생, area: '태도', tags: [],
    note_text: '왕복시험 C — 초안 없이 직접 썼다', idempotency_key: `${회차키}-C`,
  } });
  확인('🔴 ⓓ 초안이 없으면 draft_modified = **null**(분모 밖) — 「안 고쳤다」가 아니다',
    C.상태 === 200 && C.본문 && C.본문.draft_modified === null, C.본문);

  /* ── ④ 행이 실제로 어떻게 생겼나 ───────────────────────────────────── */
  console.log('\n■ ④ 남은 행 — 물리칸·동의칸·payload');
  const 행들 = await sql(`
    select idempotency_key, consent_ver, consent_id, level_snapshot, source_kind,
           observer_staff_id, draft_modified, payload
      from engine.learning_events
     where event_type='observation.noted' and idempotency_key like ${따옴(회차키 + '%')}
     order by idempotency_key`);
  치명확인(`세 행이 다 실렸다 (${행들.length}/3)`, 행들.length === 3, { 실린키: 행들.map((r) => r.idempotency_key) });
  const a = 행들[0];
  확인(`ⓑ consent_ver = «${운영기록판}» (동의판 형식이 아니다 — 섞이면 파싱이 깨진다)`,
    a.consent_ver === 운영기록판, { consent_ver: a.consent_ver });
  확인('ⓑ consent_id 는 null — 동의 «행»이 없기 때문이지 빠뜨린 게 아니다',
    a.consent_id === null, { consent_id: a.consent_id });
  확인('source_kind = teacher (사건출처 표 그대로)', a.source_kind === 'teacher', { source_kind: a.source_kind });
  확인('물리칸 — observer_staff_id 가 이 강사다', String(a.observer_staff_id) === String(staff_id),
    { observer_staff_id: a.observer_staff_id });
  확인('level_snapshot 이 서버가 읽은 급수다 (앱이 보낸 값이 아니다)', a.level_snapshot === 'Lv3',
    { level_snapshot: a.level_snapshot });
  const p = typeof a.payload === 'string' ? JSON.parse(a.payload) : a.payload;
  확인('payload 세 칸이 실렸다 (area · tags · note_text)',
    p && p.area === '문법' && Array.isArray(p.tags) && p.tags[0] === '어순' && !!p.note_text, { payload: p });

  /* ── ⑤ 거절들 — 새는 방향을 막았나 ─────────────────────────────────── */
  console.log('\n■ ⑤ 거절 — 담당 반 밖 · 값록 밖 · 태그 안 실리는 영역');
  const 남 = await 부르기('observe/note', { 메서드: 'POST', 몸: {
    learner_id: 남학생, area: '문법', tags: [],
    note_text: '왕복시험 — 남의 반 학생', idempotency_key: `${회차키}-남`,
  } });
  확인('🔴 담당 반 밖 학생은 404 — 「없다」와 「내 것이 아니다」를 같은 코드로 묶는다',
    남.상태 === 404, 남);
  const 밖 = await 부르기('observe/note', { 메서드: 'POST', 몸: {
    learner_id: 내학생, area: '없는영역', tags: [],
    note_text: '왕복시험 — 값록 밖', idempotency_key: `${회차키}-밖`,
  } });
  확인('값록 밖 영역은 400', 밖.상태 === 400, 밖);
  const 섞 = await 부르기('observe/note', { 메서드: 'POST', 몸: {
    learner_id: 내학생, area: '발음', tags: ['어순'],
    note_text: '왕복시험 — 발음에 교정 태그', idempotency_key: `${회차키}-섞`,
  } });
  확인('🔴 발음 관찰에 텍스트 교정 태그를 달면 400 (설계 §3 — 축이 섞이면 그 집계가 못 쓰게 된다)',
    섞.상태 === 400, 섞);
  const 헌초안 = await 부르기('observe/note', { 메서드: 'POST', 몸: {
    learner_id: 내학생, area: '문법', tags: [],
    note_text: '왕복시험 — 옛 판 초안', idempotency_key: `${회차키}-헌`,
    draft: { area: '문법', tags: [], draft_ver: '관찰초안.v0' },
  } });
  확인('옛 판 초안은 409 DRAFT_STALE — 옛 지문으로 대조하면 「판이 바뀌었나」를 센다',
    헌초안.상태 === 409, 헌초안);

  /* ── ⑥ 멱등 — 재전송이 중복을 안 만든다 ────────────────────────────── */
  console.log('\n■ ⑥ 멱등 — 같은 키 재전송');
  const 전 = await 사건수();
  const 다시 = await 부르기('observe/note', { 메서드: 'POST', 몸: {
    learner_id: 내학생, area: '문법', tags: ['어순'],
    note_text: '왕복시험 A — 초안 그대로 확정', idempotency_key: `${회차키}-A`, draft: 초안A,
  } });
  const 후 = await 사건수();
  확인(`재전송은 오류가 아니다 (200) · 행은 안 는다 (${전} → ${후})`,
    다시.상태 === 200 && 전 === 후, { 상태: 다시.상태, 전, 후 });
  확인('재전송 응답이 «새로 실리지 않았다»를 말한다', 다시.본문 && 다시.본문.새로실림 === false, 다시.본문);

  /* ── ⑦ 학생 RLS — 관찰이 학생에게 안 보인다 (c14 ④) ──────────────────
   * 🔑 여기서만 잴 수 있다: 정책 원문이 맞아도 **그 정책이 도는지**는 학생 토큰으로 실제
   *   select 해 봐야 안다. 학생 계정이 없으면 이 칸은 「안 재봤다」로 남긴다 — 초록이 아니다. */
  console.log('\n■ ⑦ 학생 RLS — 자기 사건 조회에 관찰이 안 든다');
  const [학생계정] = await sql(
    `select auth_user_id from engine.learners where learner_id=${따옴(내학생)}::uuid and auth_user_id is not null`);
  if (!학생계정) {
    console.log('  ⏭ 이 픽스처 학생에겐 auth 계정이 없다 — **안 재봤다**(정책 원문은 ⓪ 에서 봤다).');
  } else {
    확인('학생 토큰 조회 자리 — 계정이 있어 실측 가능', true);
  }

  보고(`관찰 통로 실왕복 — 동의 0건 적재 · 초안 무흔적 · draft_modified 3값 · 담당 밖 404 · 멱등 — 리허설(${ref})`);
}

main().catch((e) => die(String(e && e.stack || e)));
