#!/usr/bin/env node
'use strict';
/**
 * 반피드백왕복시험 — 강사 반 단위 피드백(설계 §8-5 「리허설 실왕복」)의 인수 조건 **둘**을
 * 실제 DB·함수 왕복으로 증명한다.
 *
 *   node tools/반피드백왕복시험.js
 *
 * ■ 왜 이 도구가 필요했나
 *   §8-1·2·3·4 가 전부 코드로 섰고 리허설 배포도 닫혔는데(`teach` 다름 0), 이 통로를
 *   **한 번도 실제로 지나간 적이 없었다.** 설계가 스스로 인수 조건 둘을 적어 두고 §8-5 로
 *   미뤄 둔 자리다(`docs/강사_반단위_피드백_설계.md:295`):
 *     ⓐ 담당 반 **밖** 학생이 **0행**으로 막히는 것을 일부러 심어 증명
 *        (「내 반만 보인다」를 화면 규약으로 두면 서버가 안 지킨다)
 *     ⓑ 「맞음」 제출을 심고 **AI 행 0 · 검수 큐 0행**
 *        (술어만 회귀로 보면 조인 ③ 이 정말 빼 주는지는 안 재진다)
 *
 * ■ 여기서만 잴 수 있는 것 — 파일 층 회귀가 원리상 못 보는 자리들
 *   · **`정규화식` 이 DB 에서 실제로 도는가** — `regexp_replace` 두 겹의 의미론은 Postgres 만
 *     안다. 회귀는 그 문자열이 소스에 적혀 있는지까지만 보므로, 공백·마침표만 다른 「맞음」이
 *     정말 빠지는지는 **여기서 처음 재진다**.
 *   · **`0행`이 «막혀서»인가 «비어서»인가** — 담당 반 밖 판정은 0행으로 나오는데, 픽스처를
 *     안 심으면 그 0 은 「원래 없다」와 같은 모양이다. 그래서 **일부러 심어** 가른다.
 *   · **검수 큐 0행의 사유** — 뷰 소속 조건은 둘이다(AI 교정 있음 · `status='ai_processed'`).
 *     그냥 두면 0 은 status 때문일 수 있어 판정이 못 선다 → 「맞음」의 job 을 일부러
 *     **`ai_processed` 로 올려 두고도** 0행인 것을 잰다(조건을 하나씩 바꿔 대조).
 *
 * ■ 🔴 리허설 전용 · 남기는 것이 있다 — 그래서 **픽스처가 멱등이다**
 *   실측(`pg_trigger`): `learning_events`·`corrections`·`consents`·`staff_access_log` 는
 *   update·delete 가 **둘 다 막혀 있고**(`*_immutable`), `teacher_notes` 는 delete 가 막혀 있다.
 *   즉 회차마다 새로 심으면 리허설 DB 가 영원히 자란다. 그래서 사람·반·학생·사건·제출을
 *   **고정 키로 재사용**한다 — 2회차부터 새로 남는 행은 0이다.
 *   ⚠ `submissions_original_immutable` 이 update 를 막으므로 **픽스처의 글을 고치려면 키를
 *     새로 딴다**(옛 키의 행은 그대로 남는다). 프로젝트 이름에 `rehearsal` 이 없으면 골격이 거부한다.
 *
 * ■ 안 하는 것(정직 표기)
 *   · **생산자 Fn 을 안 부른다 — 부르는 것 자체가 벤더 유료 경로다**(F452 · 08-15 실측).
 *     리허설 `correct` 에는 `ANTHROPIC_API_KEY` 가 **살아 있고**(옛 기록의 「키를 기다리는 중」은
 *     낡았다), `POST functions/v1/correct` 한 번이 대기 전량을 배치로 제출한다. 그래서 ⓑ 는
 *     생산자의 **술어 원문을 소스에서 꺼내 DB 에 태워** 잰다 — 값은 한 푼도 안 쓴다.
 *   · 따라서 ⓑ 의 「AI 행 0」은 *벤더가 안 만들더라*가 아니라 **생산자의 분모가 그 행을 애초에
 *     안 고른다**로 증명한다. 그것이 설계가 실제로 건 장치다(설계 §7 · `correct/index.ts:167`).
 *   · **운영(라이브)은 안 건드린다.** 이 시험은 리허설 전용이다.
 */
const 골격 = require('../lib/왕복골격.js');       // 공통 머리(환경→과녁→게이트→키→판정)
const { 도메인 } = require('../lib/로그인코드.js'); // 합성 도메인 정본
const { 갈래, 처분 } = require('../lib/반피드백.js'); // 어휘 정본 — DB CHECK 와 대조할 기준

const die = (m) => { console.error('[반피드백왕복시험] ' + m); process.exit(1); };
const 따옴 = (s) => `'${String(s).replace(/'/g, "''")}'`;
const J = (o) => 따옴(JSON.stringify(o));

/* 배포판 게이트를 이 시험이 «실제로 지나는» 함수로 한정한다(골든왕복시험 선례 · F103).
 * `teach` = 화면이 쓰는 세 라우트 · `correct` = 생산자의 분모를 그 자신에게 묻는 자리.
 * ⚠ 좁히는 방향은 「새는 방향」이라 `tests/왕복골격.test.js` 가 「부르는 함수 ⊆ 이 목록」을 문다. */
const 게이트함수들 = ['teach', 'correct'];

/* 고정 픽스처 키 — 멱등의 뼈대다(머리말 🔴). 회차가 이 키를 다시 만나면 새로 안 심는다. */
const 반X = '왕복-반피드백-내반';
const 반Y = '왕복-반피드백-남의반';
const 학생X = 'RTFB-X1';
const 학생Y = 'RTFB-Y1';
const 심은때 = '2026-08-15T01:00:00Z';   // 고정 — 회차마다 흔들리면 멱등이 깨진다
/* 픽스처 키의 세대. `learning_events`·`submissions` 는 update 가 막혀 있어 **이미 심은 행의
 * 칸을 채울 수 없다** — 심는 코드가 바뀌면 옛 행을 재사용하는 DB 에서는 그 새 코드가 영영
 * 안 돈다(가드는 소스만 보므로 그 침묵이 초록으로 보인다). 그래서 심는 모양을 고칠 때 이
 * 세대를 올린다. 옛 행은 그대로 남지만 아무도 안 읽는다. */
const 세대 = 'v2';   // v2 = `consent_id` 스탬프(동의귀속통로 가드) 반영

async function main() {
  const { ref, sql, anon, service_role: 서비스키, 확인, 치명확인, 보고 } =
    await 골격.열기('반피드백왕복시험', {
      함수목록: 게이트함수들,
      사유: 'teacher_notes·corrections·learning_events 는 지울 수 없는 행을 남긴다',
    });
  const base = `https://${ref}.supabase.co`;

  /* 판은 **DB 에게 묻는다** — 손 상수를 두면 조각이 오르는 날 시험만 옛 판을 선언해 426 으로
   * 죽는다(교정왕복시험이 이미 밟은 함정). */
  const [{ name: 최신조각 }] = await sql(
    'select name from engine.schema_migrations order by version desc limit 1');
  const 판 = (String(최신조각).match(/_(c\d+)\.sql$/) || [])[1];
  if (!판) die(`최신 조각 이름에서 계약판을 못 읽었다: ${최신조각}`);
  console.log(`  판 ▸ ${판}  (${최신조각})\n`);

  /* ── ⓪ 물리 — 표 셋 · 어휘 CHECK 가 lib 과 같은가 ────────────────────
   * 안 서 있으면 아래 거절들이 「계약대로 막혔다」가 아니라 「표가 없어 깨졌다」로 나오고,
   * 그 둘은 로그에서 같은 모양이다. 조용한 미적용을 통과로 읽지 않기 위한 자리. */
  console.log('■ ⓪ 물리 — classes · staff_classes · teacher_notes · 어휘 CHECK');
  const [물리] = await sql(`
    select to_regclass('engine.classes')::text        as 반표,
           to_regclass('engine.staff_classes')::text  as 배정표,
           to_regclass('engine.teacher_notes')::text  as 한마디표,
           /* 🔴 제약 이름의 «판 접미»를 박지 않는다(09-02 수리) — 판올림마다 CHECK 는
            *   drop+add 로 이름이 옮겨진다(c11→c12→…→c16, 여섯 번). 접미를 박아 두면
            *   그 다음 판올림부터 **영영 빈 문자열**을 읽고, 이 검사는 「DB 어휘가 비었다」로
            *   조용히 죽는다 — 실제로 c12 이후 오늘까지 그랬다.
            *   ⚠ 옛 이름은 판올림이 drop 하므로 like 로 잡히는 것은 «현행» 하나다. */
           (select pg_get_constraintdef(oid) from pg_constraint
             where connamespace=to_regnamespace('engine')
               and conname like 'teacher_notes_origin_c%'
             order by conname desc limit 1)                  as 갈래CHECK,
           (select pg_get_constraintdef(oid) from pg_constraint
             where connamespace=to_regnamespace('engine')
               and conname like 'teacher_notes_disposition_c%'
             order by conname desc limit 1)                  as 처분CHECK`);
  치명확인('표 셋이 서 있다 (classes · staff_classes · teacher_notes)',
    물리.반표 && 물리.배정표 && 물리.한마디표);

  /* 어휘를 **DB 에서 뽑아** lib 과 맞댄다 — SQL 에 include 가 없어 CHECK 는 없앨 수 없는
   * 사본이다(`lib/반피드백.js` 머리말). 회귀는 파일 둘을 글자로 대조하지만, 그 둘이 맞아도
   * **배포된 DB 가 옛 판이면** 갈린다. 그 사이는 여기서만 잰다. */
  const 어휘 = (정의) => [...String(정의 || '').matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
  const DB갈래 = 어휘(물리.갈래CHECK || 물리.갈래check);
  const DB처분 = 어휘(물리.처분CHECK || 물리.처분check);
  확인(`갈래 어휘가 lib 과 같다 (DB ${DB갈래.join('·')} = lib ${갈래.join('·')})`,
    DB갈래.join('|') === 갈래.join('|'), { DB갈래, 갈래 });
  확인(`처분 어휘가 lib 과 같다 (DB ${DB처분.join('·')} = lib ${처분.join('·')})`,
    DB처분.join('|') === 처분.join('|'), { DB처분, 처분 });

  /* ── 판 깔기 ① 강사 ────────────────────────────────────────────────
   * 🔑 직원은 **만들고 지우지 않는다 — 재사용한다.** `staff_access_log` 가 append-only 이고
   *   `staff_id` FK 가 `on delete restrict` 라 감사 행이 있는 직원은 지울 수 없다.
   * 🔑 이 시험 **전용** 강사를 쓴다 — 다른 왕복시험의 강사를 빌리면 그쪽이 반을 배정하는 날
   *   「내 반은 X 하나」라는 이 시험의 전제가 조용히 깨진다(그 증상은 초록 쪽으로 샌다). */
  console.log('\n■ 판 깔기 — 이 시험 전용 강사(teacher)');
  const 메일 = `probe-classfb${도메인}`;
  const 비번 = 'ClassFb-Rehearsal-1';
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
  // 재사용이라 비밀번호가 갈렸을 수 있다 — 매번 맞춰 두면 회차가 서로를 안 깨뜨린다.
  await fetch(`${base}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: { apikey: 서비스키, Authorization: `Bearer ${서비스키}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 비번 }),
  });
  await sql(`insert into engine.staff(auth_user_id, role, display_name)
             values (${따옴(uid)}, 'teacher', '반피드백 왕복 강사')
             on conflict (auth_user_id) do nothing`);
  /* 앞 회차가 어딘가에서 죽었을 수 있다 — 되살려 두지 않으면 그 뒤 전 회차가 「권한 없음」으로
   * 빨갛고, 원인은 이 시험 자신이 된다(검수왕복시험이 같은 자리에서 같은 처방을 했다). */
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

  /* ── 판 깔기 ② 반 둘 · 학생 둘 — X 만 배정한다 ────────────────────── */
  const 반세우기 = async (키) => {
    const 있나 = (await sql(`select class_id from engine.classes where class_key=${따옴(키)}`))[0];
    if (있나) {
      // 앞 회차가 비활성으로 끝냈을 수 있다 — 카드 목록은 `c.active` 를 본다.
      await sql(`update engine.classes set active=true where class_id=${따옴(있나.class_id)}::uuid`);
      return 있나.class_id;
    }
    const [행] = await sql(`
      insert into engine.classes (class_key, display_name, active, schema_ver)
      values (${따옴(키)}, ${따옴(키)}, true, ${따옴(판)}) returning class_id`);
    return 행.class_id;
  };
  const X = await 반세우기(반X);
  const Y = await 반세우기(반Y);

  /* 🔴 **Y 는 일부러 배정하지 않는다** — 이 한 줄이 인수 ⓐ 의 전부다. */
  await sql(`insert into engine.staff_classes (staff_id, class_id, schema_ver)
             values (${따옴(staff_id)}::uuid, ${따옴(X)}::uuid, ${따옴(판)})
             on conflict do nothing`);
  await sql(`delete from engine.staff_classes
              where staff_id=${따옴(staff_id)}::uuid and class_id=${따옴(Y)}::uuid`);

  const 학생세우기 = async (코드, class_id) => {
    const 있나 = (await sql(
      `select learner_id from engine.learners where student_code=${따옴(코드)}`))[0];
    if (있나) {
      await sql(`update engine.learners set active=true, class_id=${따옴(class_id)}::uuid
                  where learner_id=${따옴(있나.learner_id)}::uuid`);
      return 있나.learner_id;
    }
    const [행] = await sql(`
      insert into engine.learners (student_code, display_name, class_id, active, schema_ver, is_test)
      values (${따옴(코드)}, ${따옴(`왕복 ${코드}`)}, ${따옴(class_id)}::uuid, true, ${따옴(판)}, true)
      returning learner_id`);
    return 행.learner_id;
  };
  const x1 = await 학생세우기(학생X, X);
  const y1 = await 학생세우기(학생Y, Y);
  console.log(`  반 ▸ 내반 ${X} · 남의반 ${Y}(배정 안 함)\n  학생 ▸ x1 ${x1} · y1 ${y1}`);

  /* 동의 — 생산자 분모(`correct` 대기조건)가 요구하는 칸이다. 이 시험의 과녁이 아니라
   * **픽스처가 분모에 들기 위한 전제**라 값은 기존 판을 그대로 빌린다. */
  const [{ 판본: 동의판 }] = await sql(
    `select coalesce(max(consent_ver), 'fixture.v1') as 판본 from engine.consents`);
  /* `recorded_by` = 이 통로(관례 = 파일 경로 · `tools/동의발급.js:129`). 「출처 없는 동의」를
   * 남기지 않는다 — `tests/동의귀속통로.test.js` 가 전 INSERT 를 훑어 이 열을 문다. */
  const 동의세우기 = async (l) => {
    await sql(`
      insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
      select ${따옴(l)}::uuid, ${따옴(동의판)}, now() - interval '1 day', ${따옴(판)},
             'tools/반피드백왕복시험.js'
       where not exists (select 1 from engine.consents
                          where learner_id=${따옴(l)}::uuid and revoked_at is null)`);
    const [행] = await sql(`select consent_id from engine.consents
                             where learner_id=${따옴(l)}::uuid and revoked_at is null
                             order by agreed_at limit 1`);
    return 행.consent_id;
  };
  const 동의 = { [x1]: await 동의세우기(x1), [y1]: await 동의세우기(y1) };

  /* ── 판 깔기 ③ 사건·제출 다섯 ──────────────────────────────────────
   * ⚠ `submissions_original_immutable` 이 update 를 막으므로 글을 바꾸려면 **키를 새로 딴다**. */
  const 사건제출 = async (learner_id, 키, { body, snapshot, payload, task_type = '숙제제출' }) => {
    let e = (await sql(`select event_id from engine.learning_events
                         where learner_id=${따옴(learner_id)}::uuid
                           and idempotency_key=${따옴(키)}`))[0];
    if (!e) {
      /* `consent_id` 를 실어야 한다 — 사건이 **어느 동의에 기대어** 생겼는지가 행에 남는다
       * (`tests/동의귀속통로.test.js`). 판만 적고 행을 안 가리키면 나중에 그 동의가 철회돼도
       * 어느 사건이 그것에 매달렸는지 되짚을 길이 없다. */
      [e] = await sql(`
        insert into engine.learning_events
               (learner_id, event_type, task_type, occurred_at, idempotency_key,
                consent_ver, consent_id, payload, schema_ver)
        values (${따옴(learner_id)}::uuid, 'submission.created', ${따옴(task_type)},
                ${따옴(심은때)}::timestamptz, ${따옴(키)}, ${따옴(동의판)},
                ${따옴(동의[learner_id])}::uuid,
                ${J(payload || {})}::jsonb, ${따옴(판)})
        returning event_id`);
    }
    let s = (await sql(`select submission_id from engine.submissions
                         where event_id=${따옴(e.event_id)}::uuid`))[0];
    if (!s) {
      // `submissions_enqueue_job` 트리거가 pipeline_jobs 를 자동으로 만든다 — 여기서 안 만든다.
      [s] = await sql(`
        insert into engine.submissions
               (event_id, task_type, task_format, body_original, task_snapshot,
                occurred_at, schema_ver)
        values (${따옴(e.event_id)}::uuid, ${따옴(task_type)}, '쓰기첨삭',
                ${따옴(body)}, ${snapshot ? `${J(snapshot)}::jsonb` : 'null'},
                ${따옴(심은때)}::timestamptz, ${따옴(판)})
        returning submission_id`);
    }
    return s.submission_id;
  };

  /* 정답 하나를 세 픽스처가 공유한다 — 다른 것은 **학생이 낸 글 한 칸**뿐이다.
   * 조건을 하나씩만 바꿔야 원인 판정이 선다(둘을 동시에 바꾸면 모르는 채 알아냈다고 쓴다). */
  const 교정문 = '학교에 갑니다';
  const 정답 = { 정답: { 교정문, 오류자리: '2' } };
  const 짚음 = { selected_option: '2' };

  const K = (이름) => `rtfb-${이름}-${세대}`;
  const x대기   = await 사건제출(x1, K('x-대기'),   { body: '어제 학교에 가습니다' });
  const x한마디 = await 사건제출(x1, K('x-한마디'), { body: '내일 시장에 가습니다' });
  const y대기   = await 사건제출(y1, K('y-대기'),   { body: '남의 반 학생의 글입니다' });
  const 맞음정확 = await 사건제출(x1, K('맞음-정확'),
    { body: 교정문, snapshot: 정답, payload: 짚음, task_type: '다시쓰기' });
  const 맞음정규 = await 사건제출(x1, K('맞음-정규화'),
    { body: '  학교에   갑니다.  ', snapshot: 정답, payload: 짚음, task_type: '다시쓰기' });
  const 안맞음   = await 사건제출(x1, K('안맞음'),
    { body: '학교에 가습니다', snapshot: 정답, payload: 짚음, task_type: '다시쓰기' });

  /* AI 교정 — 큐 소속의 조각 ①(`기다림질의`)이자 검수 뷰의 lateral join 대상.
   * 🔑 「맞음」 셋에는 **안 심는다** — 심으면 ⓑ 가 증명하려는 것을 시험이 먼저 무너뜨린다. */
  for (const sid of [x대기, x한마디, y대기]) {
    await sql(`
      insert into engine.corrections
             (submission_id, actor_kind, corrected_text, error_tags, explanation,
              model, prompt_ver, schema_ver)
      select ${따옴(sid)}::uuid, 'ai'::engine.actor_kind, ${따옴('학교에 갔습니다')},
             array['조사 오류']::text[], ${따옴('픽스처 — 반피드백왕복시험')},
             ${따옴('fixture-classfb')}, ${따옴('fixture.v1')}, ${따옴(판)}
       where not exists (select 1 from engine.corrections c
                          where c.submission_id=${따옴(sid)}::uuid and c.actor_kind='ai')`);
  }

  const 상태 = async (sid, st) => sql(
    `update engine.pipeline_jobs set status=${따옴(st)}::engine.job_status
      where submission_id=${따옴(sid)}::uuid`);

  /* ── 부르기 손잡이 ────────────────────────────────────────────── */
  const 부르기 = async (경로, { 메서드 = 'GET', 본문 } = {}) => {
    const r = await fetch(`${base}/functions/v1/teach/${경로}`, {
      method: 메서드,
      headers: {
        apikey: anon, 'Content-Type': 'application/json',
        'X-Contract-Ver': 판, Authorization: `Bearer ${토큰}`,
      },
      body: 본문 === undefined ? undefined : JSON.stringify(본문),
    });
    const t = await r.text();
    let body = {};
    try { body = JSON.parse(t || '{}'); } catch { body = { 원문: t.slice(0, 200) }; }
    return { status: r.status, body };
  };
  const 코드 = (r) => r.body?.error?.code;
  const 한마디수 = async () => Number((await sql(
    'select count(*)::int c from engine.teacher_notes'))[0].c);

  /* ══ 인수 ⓐ — 담당 반 밖 학생이 0행으로 막힌다 ══════════════════════ */
  console.log('\n■ ⓐ 담당 반 밖 학생이 0행으로 막힌다 (일부러 심어 증명)');

  const 반목록 = await 부르기('feedback/classes');
  치명확인('feedback/classes 200', 반목록.status === 200);
  const 반키들 = (반목록.body.classes || []).map((c) => c.class_key);
  확인(`내 반 「${반X}」 가 카드에 있다 (분모 — 이게 없으면 아래 「Y 없음」은 빈 응답과 같은 모양이다)`,
    반키들.includes(반X), 반키들);
  확인(`🔴 남의 반 「${반Y}」 가 카드에 **없다**`, !반키들.includes(반Y), 반키들);

  const X카드 = (반목록.body.classes || []).find((c) => c.class_key === 반X);
  확인('내 반 카드가 기다림 ≥ 1 · 모양=waiting (심은 것이 실제로 카드의 셈에 닿았다)',
    !!X카드 && X카드.기다림 >= 1 && X카드.모양 === 'waiting', X카드);

  const 남의반큐 = await 부르기(`feedback/queue?class_id=${Y}`);
  확인('🔴 남의 반 큐는 **404 NOT_FOUND** — 빈 200 이 아니다 (빈 목록이면 「그 반이 있다」를 말해 버린다)',
    남의반큐.status === 404 && 코드(남의반큐) === 'NOT_FOUND', 남의반큐);

  const 내반큐 = await 부르기(`feedback/queue?class_id=${X}`);
  치명확인('내 반 큐 200', 내반큐.status === 200);
  /* 칸 이름에 폴백을 두지 않는다 — `items` 가 사라지는 날 폴백이 그것을 「빈 큐」로 접어
   * 아래 「남의 반 없음」이 저절로 초록이 된다(새는 방향은 언제나 통과다). */
  const 큐id = (내반큐.body.items || []).map((i) => i.submission_id);
  확인(`내 반 학생의 대기 건이 큐에 **있다** (분모 · ${큐id.length}건 중)`,
    큐id.includes(x대기), 큐id);
  확인('🔴 남의 반 학생의 대기 건은 같은 응답에 **없다**', !큐id.includes(y대기), 큐id);

  const 한마디전 = await 한마디수();
  const 남의글에한마디 = await 부르기('feedback/give', {
    메서드: 'POST',
    본문: { submission_id: y대기, body: '남의 반 학생에게 쓰려 한다', origin: 'written', disposition: 'confirmed' },
  });
  확인('🔴 남의 반 산출물에 한 마디는 **404 NOT_FOUND** (호출자가 준 id 를 안 믿는다)',
    남의글에한마디.status === 404 && 코드(남의글에한마디) === 'NOT_FOUND', 남의글에한마디);
  확인('거절이 **행을 안 남겼다** (teacher_notes 증분 0 — 거절문만 보고 통과로 읽지 않는다)',
    (await 한마디수()) === 한마디전, { 전: 한마디전, 후: await 한마디수() });

  const 내글에한마디 = await 부르기('feedback/give', {
    메서드: 'POST',
    본문: { submission_id: x한마디, body: '오늘 문장 좋았어요. 어미만 같이 볼까요?', origin: 'written', disposition: 'retry' },
  });
  확인('내 반 산출물에 한 마디는 200 · note_id 가 온다 (첫 회차=신규 · 2회차+=개서 — 둘 다 200)',
    내글에한마디.status === 200 && !!내글에한마디.body.note_id, 내글에한마디);

  const 준뒤큐 = await 부르기(`feedback/queue?class_id=${X}`);
  const 준뒤id = (준뒤큐.body.items || []).map((i) => i.submission_id);
  확인('한 마디를 준 건은 큐에서 **빠진다** (술어 조각 ② — teacher_notes 가 상태의 정본)',
    !준뒤id.includes(x한마디), 준뒤id);
  확인('한 마디를 안 준 건은 **그대로 있다** (분모 — 큐가 통째로 빈 것이 아니다)',
    준뒤id.includes(x대기), 준뒤id);

  /* ── ⓐ 의 되돌리는 변이 — 그 0행이 «비어서»가 아니라 «관문 때문»인가 ──────
   * 🔑 위의 검사들은 전부 「Y 가 안 보인다」를 말한다. 그런데 **안 보이는 데는 두 사유**가
   *   있다: 관문이 막았거나, 애초에 볼 것이 없거나. 픽스처를 심었으니 후자는 아니라고
   *   «믿을» 수는 있지만, 믿음은 실측이 아니다 — 배정 한 줄을 **붙였다 떼서** 같은 응답이
   *   뒤집히는 것을 본다. 뒤집히면 사유는 관문 하나뿐이다.
   * 🔴 배정된 동안 `feedback/give` 는 **안 부른다** — 그건 지울 수 없는 teacher_notes 를
   *   남의 반 학생에게 남기고, 그 행은 다음 회차의 큐 판정을 조용히 바꾼다. */
  console.log('\n■ ⓐ 되돌리는 변이 — 배정 한 줄을 붙였다 뗀다 (0행의 사유를 가른다)');
  await sql(`insert into engine.staff_classes (staff_id, class_id, schema_ver)
             values (${따옴(staff_id)}::uuid, ${따옴(Y)}::uuid, ${따옴(판)})
             on conflict do nothing`);
  const 붙인뒤목록 = await 부르기('feedback/classes');
  const 붙인뒤큐 = await 부르기(`feedback/queue?class_id=${Y}`);
  확인(`배정하자 남의 반이 카드에 **나타난다** — 그 0행은 관문이었다(빈 데이터가 아니다)`,
    (붙인뒤목록.body.classes || []).some((c) => c.class_key === 반Y),
    (붙인뒤목록.body.classes || []).map((c) => c.class_key));
  확인('배정하자 그 반 큐가 **200 + 그 학생**을 준다 (404 는 관문의 말이었다)',
    붙인뒤큐.status === 200
      && (붙인뒤큐.body.items || []).some((i) => i.submission_id === y대기), 붙인뒤큐.status);

  await sql(`delete from engine.staff_classes
              where staff_id=${따옴(staff_id)}::uuid and class_id=${따옴(Y)}::uuid`);
  const 뗀뒤큐 = await 부르기(`feedback/queue?class_id=${Y}`);
  확인('배정을 떼자 **다시 404** — 관문이 상태를 따라간다(캐시된 판정이 아니다)',
    뗀뒤큐.status === 404 && 코드(뗀뒤큐) === 'NOT_FOUND', 뗀뒤큐);

  /* ══ 인수 ⓑ — 「맞음」은 생산자 분모에서 빠지고 검수 큐에 0행 ══════════ */
  console.log('\n■ ⓑ 「맞음」 제출 — AI 행 0(생산자가 안 고른다) · 검수 큐 0행');

  /* 분모는 생산자의 **술어 원문**으로 센다 — 여기 술어를 다시 적으면 그건 넷째 사본이고,
   * 시험은 사본끼리 대조해 놓고 「맞다」고 말하게 된다.
   *
   * 🔴 **생산자 Fn 을 부르지 않는다 — 그 호출이 벤더 유료 경로다**(F452 · 08-15 실측).
   *   `POST functions/v1/correct` 는 분모를 돌려주지만, 키가 있으면 그 한 번에 **대기 전량을
   *   벤더 배치로 제출한다**(`correct/index.ts:365`). 측정하려고 부른 5회가 그대로 제출 시도
   *   5회였다(그날은 벤더가 400 으로 튕겨 배치 0 · 과금 0이었지만, 그건 운이지 설계가 아니다).
   *   **재는 행위가 값을 치르게 하면 그 계기는 못 쓴다.**
   *
   * 그래서 원문을 **소스에서 꺼내 DB 에 그대로 태운다**. 사본이 아닌 이유 둘:
   *   ① 텍스트의 출처가 생산자 파일 자신이라 그쪽이 바뀌면 이 시험도 따라 바뀐다.
   *   ② 그 파일이 지금 배포된 것과 어긋나지 않았는지는 골격의 배포판 게이트가 본다
   *      (그래서 `게이트함수들` 에 `correct` 가 들어 있다 — 부르지 않아도 과녁이다).
   *      ⚠ **층을 정직하게 적는다**: 게이트는 동봉 `.mjs` 를 바이트로 대조하지만 본체
   *      `index.ts` 는 배포 시 변환돼 **시각으로만** 잰다. 즉 이 검사가 서는 층은
   *      「소스 원문 + 시각 게이트」지 「배포본 바이트」가 아니다. */
  const 소스경로 = require('path').join(__dirname, '..', 'supabase', 'functions', 'correct', 'index.ts');
  const 생산자소스 = require('fs').readFileSync(소스경로, 'utf8');
  const 뽑음 = 생산자소스.match(/const 대기조건 = \(\) => sql`([\s\S]*?)`;/);
  치명확인('생산자 소스에서 `대기조건` 원문을 꺼냈다', !!뽑음);
  const 대기조건원문 = 뽑음[1];
  /* 값 끼움(`${…}`)이 생기면 이 추출은 **깨진 SQL** 을 만든다 — 조용히 0을 내는 대신
   * 여기서 죽는다(새는 방향을 「통과」가 아니라 「적색」으로 돌려놓는 자리). */
  치명확인('원문에 값 끼움이 없다 — 그대로 태울 수 있다',
    !대기조건원문.includes('${'));
  const 대기수 = async () => {
    const [행] = await sql(`select count(*)::int as c ${대기조건원문}`);
    return { 수: Number(행.c) };
  };

  // 셋 다 분모 밖으로 내려놓고 시작한다 — 기준선.
  for (const sid of [안맞음, 맞음정확, 맞음정규]) await 상태(sid, 'verified');
  const N0 = await 대기수();
  console.log(`  기준선 ▸ 대기 ${N0.수}건 (생산자 술어 원문 · 벤더 미호출)`);

  await 상태(안맞음, 'ai_processed');
  const N1 = await 대기수();
  치명확인(`🔴 분모 — 「안 맞음」을 올리자 대기가 **정확히 1 늘었다** (${N0.수}→${N1.수}) · 심기가 실제로 먹혔다`,
    N1.수 - N0.수 === 1);

  await 상태(맞음정확, 'ai_processed');
  const N2 = await 대기수();
  확인(`🔴 판정 — 「맞음(정확 일치)」을 올려도 대기가 **안 는다** (${N1.수}→${N2.수}) · 술어가 뺐다`,
    N2.수 - N1.수 === 0, { N1: N1.수, N2: N2.수 });

  await 상태(맞음정규, 'ai_processed');
  const N3 = await 대기수();
  확인(`🔴 판정 — 「맞음(공백·마침표만 다름)」도 **안 는다** (${N2.수}→${N3.수}) · 정규화식이 DB 에서 실제로 돈다`,
    N3.수 - N2.수 === 0, { N2: N2.수, N3: N3.수 });

  /* 검수 큐 — 뷰 소속 조건은 둘(AI 교정 있음 · status='ai_processed')이라, 그냥 두면 0 이
   * status 때문인지 AI 행 때문인지 못 가른다. 「맞음」의 job 은 지금 **ai_processed** 로
   * 올라가 있다(바로 위) → 그러고도 0행이면 사유는 AI 행 하나뿐이다. */
  await 상태(x대기, 'ai_processed');
  const [뷰] = await sql(`
    select (select count(*)::int from engine.review_queue
             where submission_id in (${따옴(맞음정확)}::uuid, ${따옴(맞음정규)}::uuid)) as 맞음,
           (select count(*)::int from engine.review_queue
             where submission_id = ${따옴(x대기)}::uuid)                                as 대기건`);
  확인('🔴 「맞음」 둘은 검수 큐에 **0행** — job 을 ai_processed 로 올려 두고도 그렇다(사유는 AI 행 0 하나뿐)',
    Number(뷰.맞음) === 0, 뷰);
  확인('분모 — AI 행이 있는 건은 같은 조건에서 검수 큐에 **1행** 든다 (뷰가 통째로 비어 있는 게 아니다)',
    Number(뷰.대기건) === 1, 뷰);

  /* ── 뒷정리 — 픽스처를 생산자 분모 밖으로 되돌린다 ──────────────────
   * 안 되돌리면 키가 오는 날 이 픽스처가 진짜 벤더 값을 쓴다(리허설이라도 돈은 돈이다). */
  for (const sid of [x대기, x한마디, y대기, 안맞음, 맞음정확, 맞음정규]) await 상태(sid, 'verified');
  const 끝 = await 대기수();
  확인(`뒷정리 — 픽스처 전부 분모 밖으로 되돌렸다 (대기 ${끝.수}건 = 기준선 ${N0.수}건)`,
    끝.수 === N0.수, { 기준선: N0.수, 끝: 끝.수 });

  보고(`ⓐ 담당 반 밖 0행 · ⓑ 「맞음」 분모 밖 + 검수 큐 0행 — 리허설(${ref})`);
}

main().catch((e) => die(e.stack || String(e)));
