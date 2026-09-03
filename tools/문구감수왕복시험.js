#!/usr/bin/env node
'use strict';
/* 문구 감수 왕복시험 — **배포된 `l10n` 함수**를 실제로 눌러 본다 (리허설 전용).
 *
 *   node tools/문구감수왕복시험.js
 *
 * ■ 왜 이게 따로 필요한가 — 회귀 셋이 **원리상 못 보는 층**이 있다
 *   `tests/문구감수.test.js`·`문구감수화면.test.js` 는 **소스**를 본다. 그 검사들이 전부 초록인
 *   채로 함수가 배포가 안 됐거나, 배포는 됐는데 조각이 안 부어졌거나, 역할 게이트가 열려 있을
 *   수 있다 — 셋 다 증상이 「잘 돌아가는 것처럼 보임」이다. 실물을 눌러야만 갈린다.
 *
 * ■ 🔴 이 시험이 지키는 첫째 = **자원 격리가 실물에서도 서 있나**
 *   설계의 심장은 「감수자는 학생 데이터에 원리상 못 닿는다」다. 소스 검사는 «우리가 안 썼다»만
 *   말할 수 있고, 실제로 그 사람이 학생 큐에 못 들어가는지는 **토큰으로 문을 두드려야** 안다.
 *   그래서 `l10n_reviewer` 토큰으로 `review/queue`(학생 발화 큐)를 눌러 **403** 을 확인한다.
 *
 * ■ 🔑 판정은 **되돌릴 수 없다** — 그래서 리허설에서만 돈다(`왕복골격` 이 그 문을 지킨다)
 *   `l10n_reviews` 는 append-only 고, 확정하면 그 문장은 큐에서 빠진다. 시험이 심은 판정은
 *   시험이 되돌린다(아래 §되돌리기) — 그 자리가 없으면 다음 회차의 분모가 매번 줄어든다.
 */
const 골격 = require('../lib/왕복골격.js');
const { 도메인 } = require('../lib/로그인코드.js');
const { VERDICT, 원문결함, 상태전이, 쪽상한 } = require('../lib/문구감수.js');

const die = (m) => { console.error('[문구감수왕복시험] ' + m); process.exit(1); };
const 따옴 = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function main() {
  const { ref, sql, anon, service_role: 서비스키, 확인, 치명확인, 보고 } =
    await 골격.열기('문구감수왕복시험', {
      사유: '확정은 지울 수 없는 감수 판정 행을 남긴다',
      함수목록: ['l10n'],
    });

  const base = `https://${ref}.supabase.co`;

  /* 판은 **DB 에게 묻는다** — 손 상수를 두면 조각이 오르는 날 시험만 옛 판을 선언해 426 으로 죽는다. */
  const [{ name: 최신조각 }] = await sql(
    'select name from engine.schema_migrations order by version desc limit 1');
  const 판 = (String(최신조각).match(/_(c\d+)\.sql$/) || [])[1];
  if (!판) die(`최신 조각 이름에서 계약판을 못 읽었다: ${최신조각}`);
  console.log(`  판 ▸ ${판}  (${최신조각})\n`);

  /* ── ⓪ 물리 ────────────────────────────────────────────────────────
   * 안 서 있으면 아래 거절들이 「계약대로 막혔다」가 아니라 「표가 없어 깨졌다」로 나오고,
   * 그 둘은 로그에서 같은 모양이다. */
  console.log('■ ⓪ 물리 — 표 둘 · 판 하나 · 역할 어휘');
  /* 🔴 역할 CHECK 를 **이름으로 찾지 않는다** (2026-09-03 수리).
   *   전에는 conname='staff_role_c13' 으로 박혀 있었다. 09-02 에 c16 이 그 제약을
   *   staff_role_c16 으로 옮기자 **빈손이 돌아왔고**, 이 시험은 「어휘에 l10n_reviewer 가
   *   없다」고 «거짓 빨강»을 냈다 — DB 는 그 내내 멀쩡했다(실측: teacher·inspector·
   *   director·l10n_reviewer 넷 다 있었다). 판 접미가 붙은 이름은 **판이 오를 때마다 바뀐다.**
   *   그래서 「무엇이라 불리나」가 아니라 **「무엇을 지키나」**로 찾는다 — engine.staff 의
   *   CHECK 중 role 을 재는 것. → 기억 contract-version-bump-drag 「제약 이름에 판 접미 금지」.
   *   ⚠ 이 설명을 아래 SQL «안»에 두면 안 된다 — 템플릿 문자열이라 백틱 한 글자에 끊긴다
   *     (그 자리를 09-03 에 한 번 밟았다). */
  const [물리] = await sql(`
    select (select count(*) from pg_tables where schemaname='engine' and tablename like 'l10n%')            as 표수,
           (select count(*) from pg_tables where schemaname='engine' and tablename like 'l10n%'
             and rowsecurity)                                                                              as rls,
           (select count(*) from pg_views where schemaname='engine' and viewname='l10n_queue')             as 판,
           (select pg_get_constraintdef(con.oid) from pg_constraint con
              join pg_class cl on cl.oid = con.conrelid
              join pg_namespace ns on ns.oid = cl.relnamespace
             where ns.nspname='engine' and cl.relname='staff' and con.contype='c'
               and pg_get_constraintdef(con.oid) like '%role%'
             limit 1)                                                                                      as 역할check,
           (select count(*) from engine.l10n_strings)                                                      as 문장수`);
  치명확인('표 2 · RLS 2 · 판 1 이 서 있다',
    Number(물리.표수) === 2 && Number(물리.rls) === 2 && Number(물리.판) === 1);
  /* 🔑 역할 어휘를 **DB 에서 뽑는다** — 코드에 목록을 박으면 사본끼리 대조해 놓고 「맞다」고 한다. */
  const 역할어휘 = [...String(물리.역할check || '').matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
  /* 🔑 «못 찾음»과 «찾았는데 없음»을 가른다 — 둘을 한 줄로 내면 위와 같은 사고가 또 조용해진다. */
  치명확인('staff.role 을 지키는 CHECK 를 찾았다(이름이 아니라 몸으로)', 역할어휘.length > 0);
  치명확인(`역할 어휘에 l10n_reviewer 가 있다 (${역할어휘.join(' · ')})`,
    역할어휘.includes('l10n_reviewer'));
  확인(`감수 대상 문장이 실제로 있다 (${물리.문장수}줄)`, Number(물리.문장수) > 0, 물리.문장수);
  if (!Number(물리.문장수)) die('문장이 0줄이다 — 먼저: node tools/문구반입.js --적용');

  /* ── 판 깔기 — 사람 셋 ─────────────────────────────────────────────
   * 🔑 직원은 만들고 지우지 않는다 — 재사용한다(FK 가 on delete restrict 다). */
  console.log('\n■ 판 깔기 — 감수자(l10n_reviewer) · 검수자(inspector) · 강사(teacher) · 비직원');
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
                 on conflict (auth_user_id) do update set role = excluded.role`);
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

  const 감수자 = await 사람세우기('리허설 문구감수자', 'probe-l10n', 'L10n-Rehearsal-1', 'l10n_reviewer');
  const 검수자 = await 사람세우기('리허설 검수자', 'probe-inspector', 'Inspector-Rehearsal-1', 'inspector');
  const 외부인 = await 사람세우기('리허설 비직원', 'probe-outsider', 'Outsider-Rehearsal-1', null);

  const 부르기 = async (길, 토큰, 몸) => {
    const h = { apikey: anon, 'X-Contract-Ver': 판 };
    if (토큰) h.Authorization = `Bearer ${토큰}`;
    if (몸 !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(`${base}/functions/v1/${길}`, {
      method: 몸 === undefined ? 'GET' : 'POST',
      headers: h,
      ...(몸 === undefined ? {} : { body: JSON.stringify(몸) }),
    });
    let 본문 = {};
    try { 본문 = JSON.parse(await r.text()); } catch { /* 본문 없는 응답도 결과다 */ }
    return { status: r.status, 본문, 코드: 본문?.error?.code ?? null };
  };

  /* ── ① 문 ──────────────────────────────────────────────────────── */
  console.log('\n■ ① 문 — 누가 들어오고 누가 막히나');
  const 큐 = await 부르기('l10n/queue?limit=5', 감수자.토큰);
  치명확인('감수자가 큐를 연다 (200)', 큐.status === 200, 큐);
  확인(`큐가 문장을 준다 (${큐.본문?.data?.length ?? 0}줄)`, (큐.본문?.data?.length ?? 0) > 0, 큐.본문?.data?.length);

  const 비직원 = await 부르기('l10n/queue?limit=1', 외부인.토큰);
  확인('로그인한 비직원은 막힌다 (403 NOT_STAFF)', 비직원.status === 403 && 비직원.코드 === 'NOT_STAFF', 비직원);

  const 무토큰 = await 부르기('l10n/queue?limit=1', null);
  확인('토큰 없이는 못 들어온다 (401)', 무토큰.status === 401, 무토큰);

  /* 🔴 이 저장소가 이 통로를 «따로» 낸 이유가 여기서 실물로 갈린다.
   *   inspector 는 학생 발화 검수자다 — 문구 감수 문에는 **일부러 안 넣었다**. */
  const 검수자가 = await 부르기('l10n/queue?limit=1', 검수자.토큰);
  확인('🔴 검수자(inspector)는 문구 감수 문에 못 들어온다 — 안 안전해서가 아니라 그렇게 정한 적이 없어서다',
    검수자가.status === 403, 검수자가);

  /* 🔑 강사는 **들어온다**(유호 확정 08-27) — 몽골 강사가 몽골어 원어민이다.
   *   안전이 넓어진 게 아니다: 강사는 이미 `teach` 문으로 학생 발화를 본다. 여기 더한다고
   *   새로 열리는 자원이 없고, **반대 방향**(감수자→학생)은 바로 아래 검사가 그대로 지킨다. */
  const 강사 = await 사람세우기('리허설 강사', 'probe-teacher', 'Teacher-Rehearsal-1', 'teacher');
  const 강사가 = await 부르기('l10n/queue?limit=1', 강사.토큰);
  확인('🔑 강사(teacher)는 문구 감수 문에 들어온다 — 몽골어 원어민이 곧 감수자다',
    강사가.status === 200, 강사가);

  /* 🔴 그리고 그 반대 방향 — 이쪽이 «자원 격리»의 실물 증거다.
   *   소스 검사는 「우리가 학생 표를 안 썼다」까지만 말한다. 그 사람이 실제로 학생 큐에
   *   못 들어가는지는 토큰으로 두드려야 안다. */
  const 감수자가학생큐 = await 부르기('review/queue?limit=1', 감수자.토큰);
  확인('🔴 감수자는 «학생 발화 큐»에 못 닿는다 (403) — 자원 격리의 실물 증거',
    감수자가학생큐.status === 403, 감수자가학생큐);

  /* ── ② 계약 ────────────────────────────────────────────────────── */
  console.log('\n■ ② 계약 — 판·메서드·경로·커서');
  const 판없음 = await fetch(`${base}/functions/v1/l10n/queue`, {
    headers: { apikey: anon, Authorization: `Bearer ${감수자.토큰}` },
  });
  확인('계약판 헤더가 없으면 400 이다', 판없음.status === 400, 판없음.status);

  const 잘못된메서드 = await 부르기('l10n/queue', 감수자.토큰, { x: 1 });
  확인('queue 에 POST 하면 405 다', 잘못된메서드.status === 405, 잘못된메서드);

  const 없는경로 = await 부르기('l10n/없는것', 감수자.토큰);
  확인('없는 경로는 404 다', 없는경로.status === 404, 없는경로);

  /* 🔑 남의 커서 꼴(검수 큐의 복합 커서)을 먹여 본다 — 통과하면 목록이 조용히 빠진다. */
  const 남의커서 = await 부르기(`l10n/queue?after=${encodeURIComponent('1||2026-08-26T00:00:00Z|abc')}`, 감수자.토큰);
  확인('남의 커서 꼴은 400 으로 거절된다', 남의커서.status === 400, 남의커서);

  const 나쁜limit = await 부르기('l10n/queue?limit=0', 감수자.토큰);
  확인('limit=0 은 400 이다', 나쁜limit.status === 400, 나쁜limit);

  /* ── ③ 판정 ────────────────────────────────────────────────────── */
  console.log('\n■ ③ 판정 — 배타성과 상태 전이');
  const 대상 = 큐.본문.data[0];
  치명확인(`시험 대상 = ${대상?.string_id}`, !!대상?.string_id);

  const 두말 = await 부르기('l10n/verify', 감수자.토큰,
    { string_id: 대상.string_id, verdict: 원문결함, final_mn: 'Тест', note: '까닭' });
  확인('🔴 「원문을 고쳐야 한다」에 번역을 실으면 거절된다 (두 말을 한 번에 못 한다)',
    두말.status === 400, 두말);

  const 까닭없음 = await 부르기('l10n/verify', 감수자.토큰,
    { string_id: 대상.string_id, verdict: 원문결함 });
  확인('그 판정에 까닭이 없으면 거절된다 (까닭이 유일한 산출물이다)',
    까닭없음.status === 400, 까닭없음);

  const 빈번역 = await 부르기('l10n/verify', 감수자.토큰,
    { string_id: 대상.string_id, verdict: VERDICT[1], final_mn: '   ' });
  확인('공백만 든 번역은 거절된다', 빈번역.status === 400, 빈번역);

  const 없는어휘 = await 부르기('l10n/verify', 감수자.토큰,
    { string_id: 대상.string_id, verdict: '없는판정', final_mn: 'Тест' });
  확인('닫힌 어휘 밖의 판정은 거절된다 (500 이 아니라 400 이어야 한다)',
    없는어휘.status === 400, 없는어휘);

  const 확정 = await 부르기('l10n/verify', 감수자.토큰,
    { string_id: 대상.string_id, verdict: VERDICT[1], final_mn: 'Тестийн орчуулга' });
  치명확인('확정이 200 으로 선다', 확정.status === 200 && !!확정.본문?.data?.review_id);
  확인(`상태가 ${상태전이(VERDICT[1])} 로 갔다`, 확정.본문.data.status === 상태전이(VERDICT[1]), 확정.본문.data);

  /* 🔑 끝난 문장은 큐에서 **빠진다** — 안 빠지면 감수자가 같은 것을 영원히 다시 본다. */
  const 다시큐 = await 부르기('l10n/queue?limit=50', 감수자.토큰);
  확인('끝낸 문장이 큐에서 빠졌다',
    !(다시큐.본문?.data ?? []).some((r) => r.string_id === 대상.string_id), 대상.string_id);

  const 또확정 = await 부르기('l10n/verify', 감수자.토큰,
    { string_id: 대상.string_id, verdict: VERDICT[1], final_mn: 'Дахин' });
  확인('큐에 없는 문장은 다시 확정 못 한다 (404 NOT_FOUND)',
    또확정.status === 404 && 또확정.코드 === 'NOT_FOUND', 또확정);

  /* ── ④ 내보내기 ────────────────────────────────────────────────── */
  console.log('\n■ ④ 내보내기 — 화면과 도구가 같은 것을 본다');
  const 내보냄 = await 부르기('l10n/export', 감수자.토큰);
  치명확인('export 가 200 이다', 내보냄.status === 200);
  const 실린것 = (내보냄.본문?.data ?? []).find((r) => r.string_id === 대상.string_id);
  확인('방금 확정한 것이 내보내기에 실렸다', !!실린것, 내보냄.본문?.count);
  확인('마지막 판정 하나만 실린다(문장당 1행)',
    (내보냄.본문?.data ?? []).length === new Set((내보냄.본문?.data ?? []).map((r) => r.string_id)).size);

  /* ── 되돌리기 ──────────────────────────────────────────────────────
   * 🔑 이 자리가 없으면 회차마다 큐가 하나씩 줄어 다음 세션의 분모가 조용히 낡는다.
   *   판정 «이력»은 append-only 라 지우는 것이 원칙에 어긋나지만, 이건 **시험이 심은 행**이다 —
   *   사람이 낸 판정과 섞이면 그게 더 나쁘다(리허설이라 학생 데이터가 아니다). */
  console.log('\n■ 되돌리기 — 시험이 심은 것은 시험이 걷는다');
  const [{ count: 지운수 }] = await sql(
    `with 지움 as (delete from engine.l10n_reviews where string_id = ${따옴(대상.string_id)} returning 1)
     select count(*)::int as count from 지움`);
  await sql(`update engine.l10n_strings set status = 'pending', updated_at = now()
              where string_id = ${따옴(대상.string_id)}`);
  /* 🔑 쪽 크기를 **lib 에서 읽는다** — 손 상수 200 을 썼다가 서버 상한(100)을 넘겨 400 을 받았고,
   *   그 400 은 `data` 가 비어 오므로 화면에서 「큐가 비었다」와 똑같이 보였다(08-27 실측).
   *   상한이 바뀌는 날 시험만 옛 수를 들고 있는 것이 이 계열 사고의 모양이다. */
  const 되돌아옴 = await 부르기(`l10n/queue?limit=${쪽상한}`, 감수자.토큰);
  치명확인(`큐를 다시 읽었다 (200 · limit=${쪽상한})`, 되돌아옴.status === 200);
  확인(`판정 ${지운수}행을 걷고 문장이 큐로 돌아왔다`,
    (되돌아옴.본문?.data ?? []).some((r) => r.string_id === 대상.string_id), 대상.string_id);

  보고(`대상 ${대상.string_id} · 큐 ${되돌아옴.본문?.data?.length ?? 0}줄`);
}

main().catch((e) => die(String((e && e.stack) || e)));
