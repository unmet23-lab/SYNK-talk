#!/usr/bin/env node
'use strict';
/**
 * 생성왕복시험 — 상태기반 과제 생성(§3~§4 · c12 물리)의 인수 조건(§12)을 **실제 DB 왕복으로** 잰다.
 *
 *   SUPABASE_PROJECT_REF=<리허설ref> node tools/생성왕복시험.js
 *
 * ■ 무엇을 재나 (설계 §12 — 구현층 픽스처 대군)
 *   A 적용층(§12-21): 재적용 멱등 · 스키마 동일성(칼럼·제약·값목록 = 마이그 파일과 대조) ·
 *     장부 권한 · RPC 시그니처 재독증 · §16-1 선행 n/4(§12-31). c12 검증기 왕복(G1)은
 *     판정 층이 이벤트 API 라 tests/계약c12왕복.test.js(순수)가 정본이다 — A6 참조.
 *   B 물리층(§12-6·7·12·16·18·23·26·28): §4-1 «행에 남는 15값» 전량이 각자 자기 행으로
 *     착지한다(값↔픽스처는 아래 `사유픽스처` 한 곳에서 파생 — tests/생성사유픽스처.test.js 가
 *     DDL CHECK 와 기계 대조한다) + 멱등·동시·원자·펜싱·좀비·회수·마감 스윕 경계 전량.
 *   C HTTP층(§12-2·8·11·15·17 + tasks 상태 칸): 활성 게이트를 «임시로» 세우고 배치→워커→
 *     구제→조회를 관통한 뒤 걷는다(잔존 0 확인 — 비활성 회귀는 배달왕복시험이 별도로 진다).
 *
 * ■ 날짜 전략 — append-only 라 지우지 못하므로 겹치지 않게 «가른다»:
 *   · B 물리층 = 가상 미래일(2030+ 의 처녀 날짜 — DB max 에서 +1) · 학생은 회차마다 신규라
 *     unique(learner_id, assign_date) 충돌이 없고, 마감(그 다음날 06:00)이 멀어 스윕과 무관.
 *   · 마감 픽스처 = 과거일(어제) — 마감이 «이미 지난» 날만 스윕이 문다.
 *   · C HTTP층 = 실제 오늘(Edge 함수가 날짜를 스스로 계산한다 — 인자 없음).
 *
 * ■ 🔴 리허설 전용 — learning_events 는 append-only 라 여기서 만든 행은 지워지지 않는다.
 * ■ ⚠ C 층이 도는 몇 분 동안 활성 게이트가 임시로 선다 — 같은 리허설에서 배달왕복시험을
 *   «동시에» 돌리면 그쪽 deliver 호출이 400(맥락 필수)을 맞는다. 순차로 돌린다.
 *
 * ■ 아직 여기서 안 재는 것(정직 목록 — 자리와 몫):
 *   · §12-3 생성 «성공» 관통(벤더 실물) = #6(크레딧+모델 픽) 뒤 첫 실행이 잰다.
 *   · 감시 7항 기준·jobs_load 활성일 가드·cron 3잡 등록 SQL 대조·앱 어댑터 «생성중» 분기와
 *     문구 칸(§12-11 뒷단) = «활성 조각»(신앱 스토어 출시와 한 벌)이 서는 커밋에서 같이 선다.
 */
const path = require('path');
const crypto = require('crypto');

const 골격 = require(path.join(__dirname, '..', 'lib', '왕복골격.js'));
const { 스냅샷, 오늘과제, 따라말하기문장, 답하기프롬프트 } = require(path.join(__dirname, '..', 'lib', '오늘과제.js'));
const { 착지봉투, 폴백봉투 } = require(path.join(__dirname, '..', 'lib', '착지봉투.js'));
const { RPC열 } = require(path.join(__dirname, '..', 'lib', '생성상수.js'));
const { 도메인 } = require(path.join(__dirname, '..', 'lib', '로그인코드.js'));
const fs = require('fs');

const { 인자게이트 } = require(path.join(__dirname, '..', 'lib', '플래그.js'));

const 게이트함수들 = ['deliver', 'deliver-one', 'tasks'];
/* 리허설 «전용» 도구다 — `--운영`·`--운영승인` 을 아는 척하면 「받고 아무것도 안 바꾸는」 F592 가
 * 된다(골격의 리허설 강제가 유일한 문이고, 이 도구는 운영 모드 자체가 없다). */
const 아는플래그 = ['--물리', '--오늘'];
const 마이그폴더 = path.join(__dirname, '..', 'supabase', 'migrations');
const 마이그경로 = path.join(마이그폴더, '20260821120000_generation_c12.sql');
/* 재적용 대상 = generation_c12 «부터의 전 마이그»(버전 오름차순 — 파일시스템에서 파생).
 * 하나만 다시 부으면 뒤 판의 create or replace 를 앞 판이 덮는다 — B6 실측(2026-08-22):
 * A1 이 generation_c12 하나를 재적용해 가드 마이그(20260822090000)의 jobs_load 를 옛 몸으로
 * 되돌렸고, B층 전체가 가드 없는 판 위에서 돌았다(중복 def 가 정본을 덮는 자리의 마이그판). */
const 재적용경로들 = fs.readdirSync(마이그폴더)
  .filter((f) => f.endsWith('.sql') && f >= '20260821120000')
  .sort()
  .map((f) => path.join(마이그폴더, f));

/* ── §12-7 값↔픽스처 «한 곳» — §4-1 «행에 남는 15값» 각각의 조달 방법. ─────────────
 * 목록에 있는데 픽스처가 없는 값이 생기면: ①tests/생성사유픽스처.test.js(DDL 대조)가 빨개지고
 * ②이 시험의 B층 루프가 그 값에서 죽는다. 값·수의 정본은 DDL CHECK(§4-1 물리) 하나다. */
const 사유픽스처 = {
  성공: { 층: '시도', 설명: 'open→close(성공)→finalize 승자 — 대조 ⑤⑥⑧ 관통' },
  검문탈락: { 층: '시도', 설명: 'close(검문탈락, 사유[길이])→finalize deciding — 대조 ③' },
  타임아웃: { 층: '시도', 설명: 'close(raw null)→finalize deciding — 요청본문 보존 겸측(§12-18)' },
  벤더오류: { 층: '시도', 설명: '오류 응답 close→finalize deciding' },
  응답파손: { 층: '시도', 설명: '파싱 불가 원문 close→finalize deciding' },
  입력초과: { 층: '시도', 설명: '부르기 전 close(raw null)→finalize deciding · input_text null' },
  응답초과: { 층: '시도', 설명: '상한 초과 원문 close→finalize deciding' },
  키없음: { 층: '직접', 설명: 'claim→즉시 폴백 finalize(시도 0) — 워커 갈래와 같은 모양' },
  상태없음: { 층: '직접', 설명: 'draft.axes_used=[] 학생의 폴백 finalize' },
  판불일치: { 층: '직접', 설명: '배치 중 배포 갈림의 폴백 finalize(시도 0)' },
  내부오류: { 층: '직접', 설명: '우리 코드가 죽은 날의 폴백 finalize' },
  상태오류: { 층: '직접', 설명: '상태 계산 예외의 폴백 finalize(물리 수용 — 런타임 생산자는 적재실패 경로)' },
  구제경로: { 층: '구제', 설명: '대기 job 을 _mode=구제로 원자 착지(시도 0 강제)' },
  대상아님: { 층: '적재', 설명: 'jobs_load 가 사유 4갈래(첫날·교정문·초급·미정)를 같은 트랜잭션에서 ⑥′ 착지' },
  예산소진: { 층: '마감', 설명: '마감 지난 대기·claimed 를 jobs_finalize_due 가 draft 그대로 착지(§12-28)' },
};
const 응답전용 = ['이미배정'];   // §4-1 — 두 번째 행을 못 만들고 불변 행을 못 고친다(응답 픽스처로 잰다)
const 무행갈래 = ['게임날'];     // §4-1 — 닻 행이 없어 적을 자리가 없다(0행을 잰다)

const sha256hex = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
const 명단해시 = (ids) => sha256hex([...ids].sort().join('\n'));
const 다음날 = (iso, n = 1) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const q = (s) => String(s).replace(/'/g, "''");
const 제이슨 = (o) => `'${q(JSON.stringify(o))}'::jsonb`;

async function main() {
  const 플래그오류 = 인자게이트('생성왕복시험', process.argv.slice(2), 아는플래그);
  if (플래그오류) { console.error(플래그오류); process.exit(1); }
  const { ref, sql: sql원, 실행: 실행원, anon, service_role: service, 확인, 치명확인, 보고 } =
    await 골격.열기('생성왕복시험', { 함수목록: 게이트함수들 });

  /* 관리 API 스로틀(429) 백오프 — 이 시험은 질의 200+ 를 연사해 한도를 문다(3차 실측).
   * 429 는 판정이 아니라 «기다리라»다 — 그것만 재시도하고 진짜 오류는 그대로 던진다. */
  const 쉼 = (ms) => new Promise((r) => setTimeout(r, ms));
  const 스로틀인가 = (m) => /429|Too Many Requests/i.test(String(m || ''));
  const sql = async (q) => {
    for (let i = 0; ; i++) {
      try { return await sql원(q); } catch (e) {
        if (스로틀인가(e && e.message) && i < 10) { await 쉼(8000 + i * 4000); continue; }
        throw e;
      }
    }
  };
  const 실행 = async (q) => {
    for (let i = 0; ; i++) {
      const r = await 실행원(q);
      if (!r.ok && r.status === 429 && i < 10) { await 쉼(8000 + i * 4000); continue; }
      return r;
    }
  };

  const 판 = (await sql(`select name from engine.schema_migrations order by version desc limit 1`))[0]
    .name.match(/_(c\d+)\.sql$/)[1];

  /* A0 vault 전제(심문 T3) — 활성조각 cron·B3 재호출·감시가 전부 이 두 이름에 얹혀 있는데
   * 어느 층도 실재를 안 쟀다: 활성조각은 「이미 있어야 한다」 위임 · cron.schedule 은 등록 때 몸을
   * 평가 안 함 · A8 은 command «문자열» 대조뿐. 미설정 채 활성이면 매밤 조용한 실패가
   * net._http_response 에만 남는다. 값은 안 본다 — 이름 존재만 센다(자격증명 규율). */
  {
    const v = (await sql(`select name from vault.decrypted_secrets where name in ('functions_base_url','service_role_key') order by name`)).map((r) => r.name);
    확인('A0 vault 전제 — functions_base_url·service_role_key 실재(값 안 봄 · T3)', v.length === 2, v);
  }
  const 마이그 = fs.readFileSync(마이그경로, 'utf8');
  const 표 = `g${Date.now().toString(36)}`;

  /* 모드 — 한 번에 다 돌면 관리 API 스로틀(429)과 워커 스윕 시간이 겹쳐 10분을 넘는다(4차 실측).
   * 기본 전부 · --물리 = A+B · --오늘 = C(+§12-17 사슬 — 자가 시딩이라 물리층과 독립). */
  const 모드 = process.argv.includes('--오늘') ? '오늘' : (process.argv.includes('--물리') ? '물리' : '전부');
  if (모드 !== '전부') console.log(`▸ 모드 ${모드}`);

  /* 처녀 미래일 — jobs 만 보면 안 된다: 부분 실패의 run 행은 finished_at null 로 남아 그 날짜의
   * 리더 게이트를 15분 잠근다(§3-5-b ⓪). 두 표의 최대 위 +3 이라 회차가 서로를 안 문다. */
  const 처녀날짜 = async () => (await sql(`
    select (greatest(
      coalesce((select max(assign_date) from engine.generation_jobs where assign_date >= date '2030-01-01'), date '2029-12-29'),
      coalesce((select max(assign_date) from engine.generation_batch_runs where assign_date >= date '2030-01-01'), date '2029-12-29'),
      date '2029-12-29') + 3)::text as d`))[0].d;

  /* ── 공용 재료(물리·오늘 두 층이 같이 쓴다) ────────────────────── */
  const 스냅기준 = new Date().toISOString();
  const 실행판 = { model: '시험-모델', prompt_ver: '시험-프롬프트판', policy_ver: '시험-정책판',
    estimator_version: '시험-추정판', schema_ver: 판, skill_taxonomy_ver: 'skills.v1' };
  const 실행판봉투 = () => 제이슨({ snapshot_as_of: 스냅기준, calendar_game_day: false, ...실행판 });
  const 명단봉투 = (ids) => 제이슨({ enrolled_count: ids.length, roster_hash: 명단해시(ids),
    level_distribution: { Lv1: 0, Lv2: 0, Lv3: ids.length, Lv4: 0, Lv5: 0, Lv6: 0, null: 0 } });
  const 스킬들 = (await sql(`select skill_id from engine.skills where domain='grammar' order by skill_id limit 2`))
    .map((r) => r.skill_id);
  치명확인('B0 문법 기술 시드가 있다(§6-0 c6)', 스킬들.length === 2);
  const 질문 = '주말에 보통 뭐 해요?';
  const 초안 = (날짜, { 축들 = ['리듬'], 문장 = '어제 시장에서 과일을 샀어요.' } = {}) => ({
    task_ref: `task-${날짜}`,
    task_snapshot: 스냅샷(날짜, 문장, '전날', 질문),
    estimator_version: 실행판.estimator_version,
    estimator_confidence: 0.5,
    evidence_refs: { events: [], as_of: 스냅기준, window_days: 30, axes_used: 축들, truncated: false },
    요약: '리듬: 제출률=0.5',
  });

  if (모드 !== '오늘') {
  /* ════════ A. 적용층 (§12-21) ════════ */
  console.log('■ A. 적용층 — 재적용 멱등 · 스키마 동일성 · 권한 · 시그니처 · 검증기');

  /* A1 재적용 멱등 — 이미 적용된 리허설 «위에» generation_c12 부터의 전 조각을 «버전 순»으로
   * 통째 재적용한다. 하나만 부으면 뒤 판의 create or replace 를 앞 판이 덮는다(B6 실측 08-22 —
   * 재적용이 남긴 DB 가 «현행»이어야 B·C 층 전체가 옳은 몸을 잰다).
   * 🩹 조각은 합본과 같은 «멱등화»를 지나 붓는다 — c13 조각의 제약 갈아끼우기 사슬(drop c12 ·
   * add c13)이 자기 이름을 안 지워 원문 재적용은 42710 로 죽는다(08-24 CI run 32714974980 와
   * 같은 결함 — 처방도 같은 함수 하나다: 파일·checksum 은 불변, 굽는 자리에서만 고친다). */
  {
    const { 멱등화 } = require(path.join(__dirname, '마이그레이션_합본.js'));
    const 전 = (await sql(`select count(*)::int as n from engine.schema_migrations where version >= '20260821120000'`))[0].n;
    for (const p of 재적용경로들) {
      const r = await 실행(멱등화(fs.readFileSync(p)).toString('utf8'));
      확인(`A1 재적용 멱등 — ${path.basename(p)} 재적용 오류 0(§12-21)`, r.ok, r.메시지 && r.메시지.slice(0, 300));
    }
    const 후 = (await sql(`select count(*)::int as n from engine.schema_migrations where version >= '20260821120000'`))[0].n;
    확인('A1 이력 행이 안 늘어난다(채번 가드) · 파일 수와 같다', 전 === 재적용경로들.length && 후 === 재적용경로들.length, { 전, 후, 파일수: 재적용경로들.length });
    확인('A1 재적용 뒤 jobs_load 가 «마지막 판»의 몸이다(활성일 가드 실재 — 덮임 탐지)', (await sql(`
      select position('skipped_inactive' in pg_get_functiondef('engine.jobs_load(date,uuid,jsonb,uuid[])'::regprocedure)) > 0 as b`))[0].b === true);
  }

  /* A2 스키마 동일성 — 「재적용의 성공은 동일성의 증거가 아니다」(가드가 불일치를 삼킨다). */
  {
    /* 🔴 **열의 «근거»는 c12 한 파일이 아니라 마이그 폴더 전량이다** (2026-09-03 수리).
     *   전에는 표를 «만든» 파일 하나에서만 add column 을 긁었다. 그래서 뒤에 온 판이 열을 더할
     *   때마다 이 검사가 그 열을 「넘침」이라 부르며 빨개졌다 — 실측 09-03: acked_at
     *   (20260901000000_attempt_ack_c14.sql) · deliver_check_reds·deliver_check_at
     *   (20260901010000_check_reds_c14.sql). **셋 다 정식 마이그에 근거가 있는데 시험만 몰랐다.**
     *   재는 것은 「c12 가 아는 열인가」가 아니라 **「파일 어딘가에 근거가 있는 열인가」**다.
     *   ⚠ `alter table` 과 `add column` 사이는 줄바꿈일 수 있어 공백 하나로 못 잡는다(\s+).
     *   ⚠ create table 블록은 그대로 c12 를 본다 — 표를 만든 파일은 하나뿐이다. */
    const 마이그전량 = fs.readdirSync(마이그폴더).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => fs.readFileSync(path.join(마이그폴더, f), 'utf8')).join('\n');
    const 파일칼럼 = (표이름) => {
      const 블록 = 마이그.split(`create table if not exists engine.${표이름} (`)[1].split('\n  );')[0];
      const 이름들 = [...블록.matchAll(/^\s{4}([a-z_][a-z0-9_]*)\s+(uuid|text|int|bigint|date|jsonb|boolean|timestamptz)/gm)]
        .map((m) => m[1]).filter((c) => c !== 'constraint');
      for (const m of 마이그전량.matchAll(
        new RegExp(`alter table engine\\.${표이름}\\s+add column if not exists ([a-z_]+)`, 'g'))) 이름들.push(m[1]);
      return new Set(이름들);
    };
    for (const 표이름 of ['generation_jobs', 'generation_attempts', 'generation_batch_runs']) {
      const 기대 = 파일칼럼(표이름);
      const 실제 = new Set((await sql(
        `select column_name from information_schema.columns where table_schema='engine' and table_name='${표이름}'`))
        .map((r) => r.column_name));
      const 빠짐 = [...기대].filter((c) => !실제.has(c));
      const 넘침 = [...실제].filter((c) => !기대.has(c));
      확인(`A2 ${표이름} 칼럼 집합 = 마이그 파일(빠짐 0·넘침 0)`, !빠짐.length && !넘침.length, { 빠짐, 넘침 });
    }
    /* 제약 이름의 기준은 «전 조각을 지난 최종 이름»이다 — c13 조각(20260822150000)이 살아 있는
     * CHECK 를 «전 표»에 걸쳐 이름째 c12→c13 으로 갈았으므로, 첫 조각(c12) 하나로 대조하면 DB
     * 실물(c13)과 전량 어긋난 헛빨강이 뜬다(08-24 실측 — 34개가 «전부 부재»로 보였다). 이름별
     * «마지막 사건»(드랍이면 죽고 선언이면 산다)을 등장 순서로 접는다 — 집합 둘로 접으면 c12
     * 첫 선언(과거)이 c13 조각의 드랍(미래)을 «재추가»로 덮는 순서 결함이 있었다(2차 실측).
     * 조회도 engine 전 표로 — 개명 조각이 generation 3표 밖 이름을 대량으로 들고 온다.
     * `create constraint trigger` 의 «trigger» 는 제약 이름이 아니다(1차 실측 오탐 — 필터 유지). */
    const 전조각 = 재적용경로들.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
    const 살았다 = new Map();
    for (const m of 전조각.matchAll(/drop constraint if exists ([a-z_0-9]+)|constraint ([a-z_0-9]+)/g)) {
      if (m[1]) 살았다.set(m[1], false);
      else if (m[2] !== 'trigger') 살았다.set(m[2], true);
    }
    const 파일제약 = new Set([...살았다].filter(([, v]) => v).map(([k]) => k));
    const 실제제약 = new Set((await sql(`
      select c.conname from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'`)).map((r) => r.conname));
    const 제약빠짐 = [...파일제약].filter((c) => !실제제약.has(c));
    확인('A2 이름 있는 제약 전량이 DB 에 실재한다(전 조각 최종 이름 · 사용자 스키마 전체 — c13 조각은 radio·ops 까지 간다)', !제약빠짐.length, 제약빠짐);
    /* 정의 «표류» — `if not exists` 가드는 제자리 수정을 조용히 삼킨다(§12-21 「재적용의 성공은
     * 동일성의 증거가 아니다」). 전 정의의 텍스트 동치는 카탈로그 정규화 때문에 못 재고, 그 판이
     * 실제로 고친 자리(v5.13-c counts_order)를 갈래로 잰다 — 옛 판이면 target<=loaded 가 남아 있다.
     * 이름 접미는 판마다 오르므로(c12→c13→…) 현행 접미를 탐색하고, 부재면 죽지 않고 ❌ 로 남긴다. */
    const 순서행 = await sql(`
      select pg_get_constraintdef(oid) as d from pg_constraint
       where conrelid='engine.generation_batch_runs'::regclass and conname ~ '^batch_runs_counts_order_c[0-9]+$'
       order by conname desc limit 1`);
    확인('A2 counts_order 가 v5.13-c 판이다(target≤loaded 부재 — 재실행을 안 죽인다)',
      순서행.length === 1 && !/target_count\s*<=\s*loaded_count/.test(순서행[0].d),
      순서행.length ? 순서행[0].d : '제약 부재');
  }

  /* A3 값목록 기계 대조(B3) — DDL CHECK 리터럴 집합 == DB 제약 원문 == 픽스처 레지스트리. */
  {
    const 값들 = (원문) => new Set([...원문.matchAll(/'([가-힣a-z]+)'/g)].map((m) => m[1]));
    const 파일15 = 값들(마이그.split("outcome            text check (outcome is null or outcome in (")[1].split('))')[0]);
    const db정의 = (await sql(`
      select pg_get_constraintdef(oid) as d from pg_constraint
       where conrelid='engine.generation_jobs'::regclass and conname like '%outcome_check%'
          or (conrelid='engine.generation_jobs'::regclass and pg_get_constraintdef(oid) like '%성공%'
              and pg_get_constraintdef(oid) like '%판불일치%' and conname not like '%pairs%')`))
      .map((r) => r.d).join(' ');
    const db15 = 값들(db정의);
    확인('A3 outcome 값목록 — 파일 15 == DB CHECK == 레지스트리 15(§12-7 파생)', (() => {
      const 레지 = new Set(Object.keys(사유픽스처));
      return 파일15.size === 15 && [...파일15].every((v) => db15.has(v)) && [...파일15].every((v) => 레지.has(v))
        && 레지.size === 15;
    })(), { 파일: [...파일15], 레지: Object.keys(사유픽스처), db: [...db15] });
    const 부분7 = (await sql(`
      select pg_get_constraintdef(oid) as d from pg_constraint
       where conrelid='engine.generation_attempts'::regclass and pg_get_constraintdef(oid) like '%성공%'
         and pg_get_constraintdef(oid) like '%입력초과%'`)).map((r) => r.d).join(' ');
    확인('A3 attempts.result 부분집합 7 이 DB CHECK 로 산다', ['성공', '검문탈락', '타임아웃', '벤더오류', '응답파손', '입력초과', '응답초과']
      .every((v) => 부분7.includes(`'${v}'`)), 부분7.slice(0, 200));
  }

  /* A4 RPC 시그니처 재독증 — 열 이름·인자 이름 집합·반환형이 선언 그대로다(오버로드 0). */
  {
    const 행들 = await sql(`
      select p.proname, pg_get_function_identity_arguments(p.oid) as args,
             pg_get_function_result(p.oid) as ret
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='engine' and p.proname = any(array[${RPC열.map((n) => `'${n}'`).join(',')}])`);
    확인('A4 RPC 열(10)이 전부 실재하고 오버로드가 없다', 행들.length === RPC열.length
      && new Set(행들.map((r) => r.proname)).size === RPC열.length, 행들.map((r) => r.proname));
    const 인자이름 = (s) => new Set([...String(s).matchAll(/_[a-z_]+/g)].map((m) => m[0]));
    let 인자어긋남 = [];
    for (const r of 행들) {
      const 선언 = 마이그.split(`function engine.${r.proname}(`)[1];
      const 선언인자 = 인자이름(선언.slice(0, 선언.indexOf(')')));
      const 실제인자 = 인자이름(r.args);
      if ([...선언인자].sort().join() !== [...실제인자].sort().join()) 인자어긋남.push(r.proname);
    }
    확인('A4 인자 이름 집합이 파일 선언과 같다(전 함수)', !인자어긋남.length, 인자어긋남);
    확인('A4 finalize·load_one·open 은 표 반환이다', 행들.filter((r) =>
      ['jobs_finalize', 'jobs_load_one', 'attempt_open', 'jobs_finalize_due'].includes(r.proname))
      .every((r) => /TABLE/.test(r.ret)), 행들.map((r) => `${r.proname}:${r.ret}`).join(' | ').slice(0, 300));
  }

  /* A5 장부 권한 — RPC 열만이 통로(V6-8). service_role 의 직접 쓰기가 물리로 거절된다. */
  {
    for (const 문 of [
      `insert into engine.generation_attempts (job_id, attempt_no, fence, owner, model, prompt_ver, policy_ver, estimator_version, schema_ver, skill_taxonomy_ver, request_body) values (gen_random_uuid(), 1, 1, 'x', 'm', 'p', 'v', 'e', 's', 'k', 'b')`,
      `update engine.generation_attempts set owner='탈취' where false`,
      `delete from engine.generation_attempts where false`,
    ]) {
      const r = await 실행(`begin; set local role service_role; ${문}; commit;`);
      확인(`A5 attempts 직접 ${문.slice(0, 6)}… 가 거절된다(append-only 를 권한이 진다)`,
        !r.ok && /permission denied|권한/i.test(r.메시지 || ''), (r.메시지 || '').slice(0, 120));
    }
  }

  /* A6 c12 검증기 왕복(G1·D4) — 층을 정직하게 가른다(1차 실측이 잡은 오표적의 정정):
   * · payload 화이트리스트·값목록·짝 규칙의 판정 «층»은 이벤트 API(lib/이벤트검증)다 —
   *   그 왕복은 tests/계약c12왕복.test.js 가 15검사로 이미 전부 진다(ver2+3칸·목록 밖 이름·
   *   ver1 무결·목록 밖 outcome 값·키 부재 비거절·이미배정 거절·gate 7값·짝 규칙).
   * · DB «물리»가 강제하는 값목록 = jobs.outcome CHECK + ㉤ 대조 ① — B4 원자 주입이 그
   *   경로(값 밖 payload → 트랜잭션 중간 사망 → 세 행 전무)를 실측한다.
   * 관리자 직접 INSERT 는 어느 문도 아니므로 여기서 던지지 않는다(안 재는 것을 잰 척하지 않는다). */
  console.log('  ▸ A6 검증기 왕복 — 이벤트 API 층은 tests/계약c12왕복.test.js(15검사) · DB 물리 층은 B4 원자 주입이 잰다');

  /* A7 §16-1 선행 «필수» n/4 (§12-31) — 실물을 한 자리에서 센다.
   * #6 은 «파일 존재»가 아니라 «결과 1벌»(채점 완주·기계 계약·비교축 일치·집계 통과)로 잰다 —
   * 존재만 세면 미채점 80 인 채 4/4 가 되어 「운영 붓기 차단」 문구가 꺼진다(심문 G2 · F207
   * 「미실행」과 「통과」가 같은 얼굴). 판정 함수는 차단기 회귀(tests/과제생성게이트.test.js ③)·
   * 채점 CLI(--판정)와 같은 하나다 — lib/과제생성평가.결과한벌. */
  {
    const n1 = 판 >= 'c12';
    const n3 = /ingested_at <= /.test(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'deliver', 'index.ts'), 'utf8'));
    let n5 = false;
    try { n5 = typeof require('../lib/판독기.js').정책지문 === 'function' && typeof require('../lib/실행판.js').실행판조립 === 'function'; } catch { /* 부재 = false */ }
    let n6 = false;
    let n6말 = '결과 정본 0벌';
    try {
      const 평가lib = require('../lib/과제생성평가.js');
      const { 경로: 평가경로, 현행판: 평가현행판 } = require('../lib/과제생성현행판.js');
      if (fs.existsSync(평가경로.결과)) {
        const 못잼 = String(process.env.GENERATION_MODEL || '').trim() ? [] : ['model'];   // env 없는 자리 — 차단기 회귀와 같은 «못잼» 처리(F296)
        const 한벌 = 평가lib.결과한벌({
          결과: JSON.parse(fs.readFileSync(평가경로.결과, 'utf8')),
          시험지: JSON.parse(fs.readFileSync(평가경로.시험지, 'utf8')),
          전문: fs.readFileSync(평가경로.프롬프트, 'utf8'),
          현행: 평가현행판(), 비교제외: 못잼,
        });
        n6 = 한벌.한벌;
        n6말 = 한벌.사유 || '1벌';
      }
    } catch (e) { n6말 = `판정 불능 — ${String(e && e.message ? e.message : e).slice(0, 80)}`; }
    const n = [n1, n3, n5, n6].filter(Boolean).length;
    console.log(`  ▸ §16-1 선행 필수 ${n}/4 — #1 c12계약 ${n1 ? '✓' : '✗'} · #3 늦적재조회층 ${n3 ? '✓' : '✗'} · #5 판독기 ${n5 ? '✓' : '✗'} · #6 §8-B결과 ${n6 ? '✓' : `✗(${n6말})`}`);
    if (n < 4) console.log('  ▸ 🔒 4/4 아님 — §12 항31: 운영 붓기 차단(리허설까지가 상한)');
    확인('A7 선행 n/4 — 엔진 몫 셋(#1·#3·#5)은 서 있다(#6 은 유호님 몫)', n1 && n3 && n5, { n1, n3, n5, n6 });
  }

  /* A8 활성 조각 — §12-21 cron 등록 대조의 «실물» 반쪽. 파일↔코드 정본 대조는
   * tests/활성조각.test.js 가 상시로 지고, 여기는 활성 «후»(gen_active_from 실재 — A층은
   * 임시를 안 세우므로 실재 = 착지됨) cron.job 실물이 착지 마이그 본문과 같은지를 잰다.
   * 실물 == 파일이고 파일 == 정본(순수 테스트)이면 전이로 실물 == 정본이다. */
  {
    const 활성 = (await sql(`select to_regprocedure('engine.gen_active_from()') is not null as b`))[0].b;
    const 착지들 = fs.readdirSync(마이그폴더).filter((f) => /_gen_activate_c12\.sql$/.test(f));
    if (!활성) {
      console.log('  ▸ A8 활성 전 — cron 실물 대조는 착지 뒤 이 갈래가 진다(파일 층은 tests/활성조각.test.js · 대기 파일 supabase/활성조각_c12.sql)');
    } else {
      치명확인('A8 활성인데 착지 마이그가 마이그 폴더에 있다(절차 2 — 이동)', 착지들.length === 1, 착지들);
      const 조각 = fs.readFileSync(path.join(마이그폴더, 착지들[0]), 'utf8');
      const { 크론표 } = require('../lib/생성상수.js');
      const 잡들 = await sql(`select jobname, schedule, command from cron.job
        where jobname in ('deliver-daily','deliver-check','generate-worker','generate-deadline')`);
      확인('A8 cron 4잡 실재(§12-21 — 표만 있고 마이그가 없는 것이 원 결함)', 잡들.length === 4, 잡들.map((j) => j.jobname));
      for (const j of 잡들) {
        확인(`A8 ${j.jobname} 스케줄 == 크론표(생성상수 정본)`, j.schedule === 크론표[j.jobname], { 실물: j.schedule, 정본: 크론표[j.jobname] });
        const 몸 = 조각.split(`cron.schedule('${j.jobname}'`)[1]?.split('$job$);')[0]?.split('$job$')[1];
        확인(`A8 ${j.jobname} 실물 command == 착지 마이그 본문(오과녁 차단 — 무엇이 도는가)`,
          몸 != null && j.command.trim() === 몸.trim(), { 실물머리: String(j.command).slice(0, 80) });
      }
    }
  }

  /* A9 감시 7항이 «돈다»(§3-2-a v5.6~v5.9 · 활성 조각) — 이 질의들은 활성 날 06:05 에 처음 도는데,
   * 그때 칼럼 하나가 개명돼 있으면 그날부터 감시가 통째로 죽고 그 사실은 아무도 모른다(감시가 자기
   * 부재를 정상으로 읽는 그 형태). 그래서 지금 «그대로» 태운다: 활성 함수를 과거 날짜로 임시 세워
   * 머리 게이트를 통과시키고 DO 블록을 실행한다.
   * 🔑 판정 규약 — 성공이거나 «적색 예외»면 통과다(둘 다 질의가 실제로 돌았다는 증거). 리허설은
   *   시험 잔재로 늘 적색이라(오늘 실측: ①남은큐·⑤과거고아·⑥실행판갈림 > 0) 적색 자체는 결함이
   *   아니고, «다른 예외»(칼럼·함수 없음)만 결함이다. 파일은 대기 자리·착지 자리 어느 쪽이든 읽는다. */
  {
    const 착지들 = fs.readdirSync(마이그폴더).filter((f) => /_gen_activate_c12\.sql$/.test(f));
    const 조각경로 = 착지들.length
      ? path.join(마이그폴더, 착지들[0])
      : path.join(__dirname, '..', 'supabase', '활성조각_c12.sql');
    if (!fs.existsSync(조각경로)) {
      확인('A9 감시 7항 — 활성 조각 파일이 어디에도 없다(대기 자리·착지 자리 둘 다)', false, 조각경로);
    } else {
      const 원문 = fs.readFileSync(조각경로, 'utf8');
      const m = /do \$watch\$[\s\S]*?\$watch\$;/.exec(원문);
      치명확인('A9 감시 블록(do $watch$ … $watch$;)을 활성 조각에서 꺼냈다', !!m, 조각경로);
      const 있었다 = (await sql(`select to_regprocedure('engine.gen_active_from()') is not null as b`))[0].b;
      try {
        if (!있었다) {
          await sql(`create or replace function engine.gen_active_from() returns date language sql immutable as $f$ select date '2020-01-01' $f$`);
        }
        const r = await 실행(m[0]);
        const 적색 = !r.ok && /deliver-check 적색/.test(String(r.메시지 || ''));
        확인('A9 감시 7항이 실제로 돈다 — 성공이거나 «적색 예외»(칼럼·함수 이름이 전부 유효하다는 증거 · 다른 예외면 활성 날 감시가 죽는다)',
          r.ok || 적색, r.ok ? '초록' : String(r.메시지 || '').slice(0, 160));
      } finally {
        if (!있었다) {
          await sql(`drop function if exists engine.gen_active_from()`);
          확인('A9 임시 활성 함수 걷힘(잔존 false)', (await sql(`select to_regprocedure('engine.gen_active_from()') is null as b`))[0].b === true);
        }
      }
    }
  }

  /* ════════ B. 물리층 — 가상 미래일 ════════ */
  console.log('\n■ B. 물리층 — §4-1 값 15 전량 + 멱등·동시·원자·펜싱·좀비·마감(§12-6·7·12·16·18·23·26·28)');

  const D1 = await 처녀날짜();
  const D2 = 다음날(D1, 1), D3 = 다음날(D1, 2);
  console.log(`  ▸ 물리층 날짜: 본 적재 ${D1} · 부분실패 ${D2} · 빈큐 ${D3}`);

  /* 학생 제조 — 물리층 학생 전량(값 15 + 계약 픽스처 + 게임날) + 동의(마감격리만 무동의). */
  const 물리이름 = ['성공', '검문탈락', '타임아웃', '벤더오류', '응답파손', '입력초과', '응답초과',
    '키없음', '상태없음', '판불일치', '내부오류', '상태오류', '구제경로',
    '첫날', '교정문', '초급', '미정', '적재실패', '기술0', '게임날',
    '동시', '원자', '요청보존', '좀비', '펜싱', '회수', '늦적재', '대기유지',
    '마감대기', '마감클레임', '마감성공잔존', '마감격리', '부분실패A', '부분실패B'];
  const 학생행 = await sql(`
    insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver, is_test)
    values ${물리이름.map((n, i) => `('${표}-${i}', '${n}', 'Lv3', null, '${판}', true)`).join(',')}
    returning learner_id, display_name`);
  const 학 = Object.fromEntries(학생행.map((r) => [r.display_name, r.learner_id]));
  await sql(`
    insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
    values ${물리이름.filter((n) => n !== '마감격리').map((n) =>
    `('${학[n]}'::uuid, 'v18.9', now() - interval '30 days', '${판}', 'tools/생성왕복시험.js')`).join(',')}`);

  const 대상 = (이름, 날짜, 초안값) => ({ learner_id: 학[이름], branch_snapshot: { ver: 1, is_first_day: false, is_game_day: false, level: 'Lv3' }, skill_ids: 스킬들, not_target_reason: null, event_draft: 초안값 ?? 초안(날짜) });

  /* B1 부분 큐 0건(§12-18) — 한 원소의 스키마 위반이 그 날짜 적재를 «통째로» 무른다. */
  {
    const ids = [학['부분실패A'], 학['부분실패B']];
    const run = (await sql(`select engine.batch_run_start('${D2}'::date, '배치', ${실행판봉투(D2)}, ${명단봉투(ids)}) as id`))[0].id;
    const r = await 실행(`select engine.jobs_load('${D2}'::date, '${run}'::uuid, ${제이슨([
      대상('부분실패A', D2), { learner_id: 학['부분실패B'], not_target_reason: null, skill_ids: 스킬들, event_draft: 초안(D2) }, // branch_snapshot 자체가 없다(A8)
    ])}, '{}'::uuid[])`);
    확인('B1 스키마 위반 원소가 적재 전체를 무른다(예외)', !r.ok, (r.메시지 || '').slice(0, 160));
    const n = (await sql(`select count(*)::int as n from engine.generation_jobs where assign_date='${D2}'::date`))[0].n;
    확인('B1 그 날짜의 jobs = 0행(전량이거나 0 — 부분 큐 없음)', n === 0, n);
    const 미완 = (await sql(`select finished_at from engine.generation_batch_runs where run_id='${run}'::uuid`))[0];
    확인('B1 실행 행은 finished_at null 로 남는다(「도중에 죽었다」가 표에 보인다)', 미완.finished_at === null, 미완);
  }

  /* B2 본 적재(D1) — 값 픽스처 학생 19 + 게임날 1. */
  let run1;
  {
    const 대상들 = [
      ...['성공', '검문탈락', '타임아웃', '벤더오류', '응답파손', '입력초과', '응답초과', '키없음', '판불일치', '내부오류', '상태오류', '구제경로'].map((n) => 대상(n, D1)),
      대상('상태없음', D1, 초안(D1, { 축들: [] })),
      { learner_id: 학['첫날'], branch_snapshot: { ver: 1, is_first_day: true, is_game_day: false, level: 'Lv3' }, skill_ids: [], not_target_reason: '첫날', event_draft: 초안(D1) },
      { learner_id: 학['교정문'], branch_snapshot: { ver: 1, is_first_day: false, is_game_day: false, level: 'Lv3', correction_ref: crypto.randomUUID() }, skill_ids: [], not_target_reason: '교정문', event_draft: 초안(D1) },
      { learner_id: 학['초급'], branch_snapshot: { ver: 1, is_first_day: false, is_game_day: false, level: 'Lv1' }, skill_ids: [], not_target_reason: '초급', event_draft: 초안(D1) },
      { learner_id: 학['미정'], branch_snapshot: { ver: 1, is_first_day: false, is_game_day: false }, skill_ids: [], not_target_reason: '미정', event_draft: 초안(D1) },
      { learner_id: 학['적재실패'], load_error: '상태오류: 시험 주입(학습자상태 throw 몫)' },
      { ...대상('기술0', D1), skill_ids: [] },
    ];
    const ids = [...대상들.map((t) => t.learner_id), 학['게임날']];
    run1 = (await sql(`select engine.batch_run_start('${D1}'::date, '배치', ${실행판봉투(D1)}, ${명단봉투(ids)}) as id`))[0].id;
    치명확인('B2 배치 시작 행이 선다(리더 게이트 통과)', !!run1);
    const r = (await sql(`select engine.jobs_load('${D1}'::date, '${run1}'::uuid, ${제이슨(대상들)}, array['${학['게임날']}']::uuid[]) as j`))[0].j;
    확인('B2 적재 계수 — created 19(대상 13+비대상 4+적재실패 2) · existing 0 · 게임 1', r.created === 19 && r.existing === 0 && r.skipped_game === 1, r);
    const 등식 = (await sql(`select enrolled_count, target_count, loaded_count, skipped_game_count, skipped_existing_count, partial_count, finished_at
      from engine.generation_batch_runs where run_id='${run1}'::uuid`))[0];
    확인('B2 계정 등식 — loaded+게임+기존 = 재적 · 대상 13 = §3-6 ⓑ(비대상·적재실패 제외)', (() => {
      const e = 등식;
      return e.finished_at !== null && e.loaded_count + e.skipped_game_count + e.skipped_existing_count === e.enrolled_count
        && e.target_count === 13;
    })(), 등식);
    확인('B2 A9 격리 — 적재실패 2행(주입 1 + 기술0 1)이고 나머지는 전량 생성됐다', (await sql(`
      select count(*)::int as n from engine.generation_jobs where assign_date='${D1}'::date and status='적재실패'`))[0].n === 2);
    확인('B2 게임날 — job 0행 · 닻 0행(값을 안 쓴다 · §12-7 «행 0 하나»)', (await sql(`
      select (select count(*) from engine.generation_jobs where learner_id='${학['게임날']}'::uuid)::int
           + (select count(*) from engine.learning_events where learner_id='${학['게임날']}'::uuid)::int as n`))[0].n === 0);
    확인('B2 대상아님 4갈래가 적재 트랜잭션 안에서 이미 착지했다(⑥′)', (await sql(`
      select count(*)::int as n from engine.generation_jobs
       where assign_date='${D1}'::date and status='대상아님' and outcome='대상아님'`))[0].n === 4);
  }

  /* ── 공용 물리 도우미 ───────────────────────────────────────── */
  const 집기 = async (이름, 날짜 = D1) => {
    const r = await sql(`select job_id, fence, status from engine.jobs_claim('${날짜}'::date, 'genfix:${표}', 1, 1800, '${학[이름]}'::uuid)`);
    치명확인(`B 집기 — ${이름} job 을 집는다`, r.length === 1 && r[0].status === 'claimed');
    return r[0];
  };
  const 열기 = async (job, 본문, 덮기 = {}) => {
    const 판셋 = { ...실행판, ...덮기 };
    const r = (await sql(`select attempt_id, reject_reason from engine.attempt_open('${job.job_id}'::uuid, ${job.fence}::bigint,
      '${판셋.model}', '${판셋.prompt_ver}', '${판셋.policy_ver}', '${판셋.estimator_version}', '${판셋.schema_ver}', '${판셋.skill_taxonomy_ver}', '${q(본문)}')`))[0];
    return r;
  };
  const 닫기 = (attempt_id, raw, 결과, 사유들 = null) => sql(`select engine.attempt_close('${attempt_id}'::uuid,
    ${raw === null ? 'null' : `'${q(raw)}'`}, '${결과}', ${사유들 ? `array[${사유들.map((s) => `'${s}'`).join(',')}]::text[]` : 'null'}) as ok`).then((r) => r[0].ok);
  const 종료 = (job, outcome, 봉, { 승자 = null, 결정 = null, 모드 = '정상' } = {}) => sql(`
    select assigned_event_id, landed, reason from engine.jobs_finalize('${job.job_id}'::uuid, ${job.fence}::bigint,
      '${outcome}', ${제이슨(봉)}, ${승자 ? `'${승자}'::uuid` : 'null'}, ${결정 ? `'${결정}'::uuid` : 'null'}, '${모드}')`).then((r) => r[0]);
  const 드래프트 = async (이름) => (await sql(`select event_draft, estimator_version from engine.generation_jobs
    where learner_id='${학[이름]}'::uuid and assign_date='${D1}'::date`))[0];
  const 착지검사 = async (이름, outcome, 날짜 = D1) => {
    const 행 = (await sql(`
      select e.payload ->> 'generation_outcome' as o, e.skill_ids, e.degraded
        from engine.learning_events e
       where e.learner_id='${학[이름]}'::uuid and e.event_type='intervention.delivered'
         and e.idempotency_key='intervention:${학[이름]}:${날짜}'`))[0];
    확인(`B3 «${outcome}» — 자기 값으로 intervention.delivered 에 남는다(§12-7)`, 행 && 행.o === outcome, 행);
    return 행;
  };

  /* B3 값 픽스처 — 레지스트리 루프(시도 7 + 직접 5 + 구제 1 · 대상아님·예산소진은 각자 자리). */
  {
    const 원응답 = (s, qq) => JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ sentence: s, question: qq }) }], usage: { output_tokens: 9 } });
    const 본문 = '시험 프롬프트 본문 — 요약과 기술이 들어간 렌더 산출이라 치자.';
    for (const [값, 픽스처] of Object.entries(사유픽스처)) {
      if (픽스처.층 === '적재' || 픽스처.층 === '마감') continue;   // 대상아님(B2)·예산소진(B5)
      if (픽스처.층 === '구제') {
        const job = (await sql(`select job_id, fence from engine.generation_jobs where learner_id='${학[값]}'::uuid and assign_date='${D1}'::date`))[0];
        const d = await 드래프트(값);
        const r = await 종료(job, '구제경로', 폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '구제경로' }), { 모드: '구제' });
        확인('B3 «구제경로» — 대기 job 을 시도 0 으로 원자 착지(_mode=구제)', r.landed === true, r);
        await 착지검사(값, '구제경로');
        continue;
      }
      const job = await 집기(값);
      const d = await 드래프트(값);
      if (픽스처.층 === '직접') {
        const r = await 종료(job, 값, 폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: 값 }));
        확인(`B3 «${값}» — 시도 없는 폴백 finalize 가 착지한다`, r.landed === true, r);
        await 착지검사(값, 값);
        continue;
      }
      // 시도 계열 — open → close → finalize.
      const 연 = await 열기(job, 본문);
      치명확인(`B3 ${값} — attempt_open 통과(판 대조)`, !!연.attempt_id && 연.reject_reason === null);
      if (값 === '성공') {
        const s = '주말에는 공원에서 산책을 해요.';
        const raw = 원응답(s, 질문);
        확인('B3 성공 — attempt_close(성공) true', await 닫기(연.attempt_id, raw, '성공') === true);
        const snap = 스냅샷(D1, s, '생성', 질문);
        const 봉 = 착지봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '성공', snap, output_text: s, gate_failed: null, input_text: 본문 });
        const r = await 종료(job, '성공', 봉, { 승자: 연.attempt_id });
        확인('B3 «성공» — 승자 대조 ⑤⑥⑧ 을 지나 착지한다', r.landed === true, r);
        const 행 = await 착지검사('성공', '성공');
        확인('B3 성공 — 겨냥 기술이 사건에 실린다(#7 E3 · 비성공은 «{}»)', 행 && Array.isArray(행.skill_ids) && 행.skill_ids.length === 2 && 행.degraded === false, 행);
        continue;
      }
      const 닫기값 = {
        검문탈락: { raw: 원응답('식별자가 든 문장', 질문), 사유들: ['길이'] },
        타임아웃: { raw: null }, 벤더오류: { raw: '{"error":{"type":"api_error","message":"시험"}}' },
        응답파손: { raw: '이건 JSON 이 아니다' }, 입력초과: { raw: null }, 응답초과: { raw: '너무 긴 응답이라 치자' },
      }[값];
      확인(`B3 ${값} — attempt_close true`, await 닫기(연.attempt_id, 닫기값.raw, 값, 닫기값.사유들 ?? null) === true);
      const r = await 종료(job, 값, 폴백봉투({
        estimator_version: d.estimator_version, draft: d.event_draft, outcome: 값,
        gate_failed: 값 === '검문탈락' ? '길이' : null,
        input_text: 값 === '입력초과' ? null : 본문,
      }), { 결정: 연.attempt_id });
      확인(`B3 «${값}» — deciding 자기산출 대조를 지나 폴백 착지한다`, r.landed === true, r);
      await 착지검사(값, 값);
    }
    확인('B3 §12-7 분해 — 응답 전용 1(이미배정) · 무행 1(게임날)이 레지스트리에 명문이다',
      응답전용.length === 1 && 무행갈래.length === 1 && !사유픽스처['이미배정'] && !사유픽스처['게임날']);
  }

  /* B4 물리 계약 잔여(§12-18·23·26 + §12-6·12·16) — 둘째 실행(같은 날짜 재실행 = B10). */
  {
    /* 늦적재(⑨)의 재료는 «draft 에 심겨» 있어야 한다 — 적재 «뒤» 봉투를 바꾸면 대조 ⑩(draft 동일)이
     * 먼저 죽어 ⑨(이중 cutoff)를 못 잰다. 그래서 늦은 사건을 적재 «전»에 만들어 초안에 싣는다. */
    const [{ event_id: 늦은사건 }] = await sql(`
      insert into engine.learning_events (learner_id, event_type, task_type, actor_kind, occurred_at, ingested_at,
        idempotency_key, consent_ver, consent_id, source_kind, payload, schema_ver)
      select '${학['늦적재']}'::uuid, 'intervention.delivered', '발화녹음', 'ai',
        '${스냅기준}'::timestamptz - interval '1 hour', '${스냅기준}'::timestamptz + interval '1 day',
        'genfix:${표}:late', 'v18.9',
        (select consent_id from engine.consents where learner_id='${학['늦적재']}'::uuid limit 1),
        'inferred'::engine.source_kind, '{"ver":1}'::jsonb, '${판}' returning event_id`);
    const 늦은초안 = 초안(D1);
    늦은초안.evidence_refs = { ...늦은초안.evidence_refs, events: [늦은사건] };
    const 추가 = ['동시', '원자', '요청보존', '좀비', '펜싱', '회수', '늦적재', '대기유지'];
    const run2 = (await sql(`select engine.batch_run_start('${D1}'::date, '배치', ${실행판봉투(D1)}, ${명단봉투(추가.map((n) => 학[n]))}) as id`))[0].id;
    const r = (await sql(`select engine.jobs_load('${D1}'::date, '${run2}'::uuid, ${제이슨(
      추가.map((n) => (n === '늦적재' ? 대상(n, D1, 늦은초안) : 대상(n, D1))))}, '{}'::uuid[]) as j`))[0].j;
    확인('B4 같은 날짜 재실행(B10) — 새 학생 8 만 created·기존 착지는 무접촉', r.created === 8, r);

    /* 멱등 — 재적재가 기존 학생을 existing 으로 세고(§12-6), 종료 job 재호출은 reason=멱등.
     * 🔑 재적재는 «자기 명단의 새 실행»으로 온다 — 남의 run 을 재사용하면 명단 등식 가드(갈래 5)가
     *   정당하게 거절한다(2차 실측: 그 가드가 실제로 문다는 증명이기도 하다). */
    const run3 = (await sql(`select engine.batch_run_start('${D1}'::date, '배치', ${실행판봉투(D1)}, ${명단봉투([학['성공']])}) as id`))[0].id;
    const 재 = (await sql(`select engine.jobs_load('${D1}'::date, '${run3}'::uuid, ${제이슨([대상('성공', D1)])}, '{}'::uuid[]) as j`))[0].j;
    확인('B4 §12-6 — 같은 학생·같은 날짜 재적재는 existing(행 1 그대로)', 재.created === 0 && 재.existing === 1, 재);
    확인('B4 갈래 5 — 명단 밖 재적재(남의 run 재사용)는 roster_hash 가드가 거절한다(2차 실측 실증)',
      !(await 실행(`select engine.jobs_load('${D1}'::date, '${run2}'::uuid, ${제이슨([대상('성공', D1)])}, '{}'::uuid[])`)).ok);
    const 성공job = (await sql(`select job_id, fence from engine.generation_jobs where learner_id='${학['성공']}'::uuid and assign_date='${D1}'::date`))[0];
    const 멱등 = await 종료(성공job, '내부오류', 폴백봉투({ estimator_version: 실행판.estimator_version, draft: 초안(D1), outcome: '내부오류' }));
    확인('B4 §12-18 멱등 재호출 — 새 착지 0 · reason=멱등 · 기존 사건 반환(V6-29)', 멱등.landed === false && 멱등.reason === '멱등' && !!멱등.assigned_event_id, 멱등);
    const 이미 = (await sql(`select kind, assigned_event_id from engine.jobs_load_one('${D1}'::date, '${run2}'::uuid, ${제이슨(대상('성공', D1))})`))[0];
    확인('B4 §12-7 «이미배정» 은 응답 픽스처다 — 행이 아니라 반환값(kind)', 이미.kind === '이미배정' && 이미.assigned_event_id === 멱등.assigned_event_id, 이미);

    /* 동시 finalize — 정확히 1건 착지(§12-6 동시 실행). */
    {
      const job = await 집기('동시');
      const d = await 드래프트('동시');
      const 봉 = 폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '키없음' });
      const 질의 = `select landed, reason from engine.jobs_finalize('${job.job_id}'::uuid, ${job.fence}::bigint, '키없음', ${제이슨(봉)}, null, null, '정상')`;
      const [r1, r2] = await Promise.all([실행(질의), 실행(질의)]);
      const 착지수 = [r1, r2].filter((x) => x.ok && x.행[0].landed === true).length;
      const 멱등수 = [r1, r2].filter((x) => x.ok && x.행[0].landed === false && x.행[0].reason === '멱등').length;
      확인('B4 동시 finalize — 정확히 1 착지 + 1 멱등(같은 사건을 돌려받는다)', 착지수 === 1 && 멱등수 === 1, [r1.행, r2.행]);
      확인('B4 동시 — DB 착지도 1건(사건 유일)', (await sql(`
        select count(*)::int as n from engine.learning_events where learner_id='${학['동시']}'::uuid and event_type='task.assigned'`))[0].n === 1);
    }

    /* 원자 착지(§12-12) — 셋째 INSERT(개입 사건)에서 검증기로 죽여 «세 행이 다 없다»를 잰다. */
    {
      const job = await 집기('원자');
      const d = await 드래프트('원자');
      const 깨진봉 = 폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '내부오류' });
      깨진봉.intervention_delivered.payload.generation_outcome = '말도안됨';
      const r = await 실행(`select * from engine.jobs_finalize('${job.job_id}'::uuid, ${job.fence}::bigint, '말도안됨', ${제이슨(깨진봉)}, null, null, '정상')`);
      확인('B4 §12-12 주입 — 개입 payload 검증이 트랜잭션 «중간»에서 죽인다', !r.ok, (r.메시지 || '').slice(0, 140));
      const 잔재 = (await sql(`
        select (select count(*) from engine.learning_events where learner_id='${학['원자']}'::uuid)::int
             + (select count(*) from engine.submissions s join engine.learning_events e on e.event_id=s.event_id
                 where e.learner_id='${학['원자']}'::uuid)::int as n`))[0].n;
      확인('B4 §12-12 — 부분 착지 0(배정·제출보조·개입 세 행이 «다» 없다)', 잔재 === 0, 잔재);
      const 정상 = await 종료(job, '내부오류', 폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '내부오류' }));
      확인('B4 §12-12 — 같은 job 이 정상 경로로는 착지한다', 정상.landed === true, 정상);
      const 묶음 = (await sql(`
        select (iv.intervention_id = ta.intervention_id) as 개입묶음, (s.event_id = ta.event_id) as 제출묶음
          from engine.learning_events ta
          join engine.learning_events iv on iv.intervention_id = ta.intervention_id and iv.event_type='intervention.delivered'
          join engine.submissions s on s.event_id = ta.event_id
         where ta.learner_id='${학['원자']}'::uuid and ta.event_type='task.assigned'`))[0];
      확인('B4 §12-12 — 묶음 조인이 세 행을 «실제로» 되찾는다(intervention_id·event_id)', 묶음 && 묶음.개입묶음 && 묶음.제출묶음, 묶음);
    }

    /* 요청본문 보존 + 중복열림 + 시도 1회 채움(§12-18). */
    {
      const job = await 집기('요청보존');
      const 본문 = '벤더에 나갔어야 할 본문 — 착지 전 실종 시나리오.';
      const 연 = await 열기(job, 본문);
      치명확인('B4 요청보존 — open 통과', !!연.attempt_id);
      const 행 = (await sql(`select request_body, raw_response, result from engine.generation_attempts where attempt_id='${연.attempt_id}'::uuid`))[0];
      확인('B4 §12-18 요청본문 보존 — 호출 «전»에 쓴다(raw null·result null 인 열린 행)', 행.request_body === 본문 && 행.raw_response === null && 행.result === null, 행);
      const 재열기 = await 열기(job, 본문);
      확인('B4 §3-5-b 중복열림 — 열린 시도가 있으면 세대 불문 거절(중복 과금 차단)', 재열기.reject_reason === '중복열림', 재열기);
      확인('B4 §12-18 시도 1회 채움 — close 첫 번은 true', await 닫기(연.attempt_id, null, '타임아웃') === true);
      확인('B4 §12-18 시도 1회 채움 — 둘째 close 는 false(raw null 종결에도 구멍 없음)', await 닫기(연.attempt_id, null, '타임아웃') === false);
      const d = await 드래프트('요청보존');
      const r = await 종료(job, '타임아웃', 폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '타임아웃', input_text: 본문 }), { 결정: 연.attempt_id });
      확인('B4 요청보존 — 타임아웃 폴백으로 닫는다', r.landed === true, r);
    }

    /* 좀비·펜싱·회수(§12-16·18) — 회수는 펜스를 안 올리고, 좀비는 «상태»가 막는다. */
    {
      const job = await 집기('좀비');
      await sql(`update engine.generation_jobs set lease_until = now() - interval '1 second' where job_id='${job.job_id}'::uuid`);
      const 회수수 = (await sql(`select engine.jobs_reclaim('${D1}'::date) as n`))[0].n;
      확인('B4 §12-18 회수가 실제로 돈다 — 임대 만료 claimed 가 대기로(반환 ≥1)', 회수수 >= 1, 회수수);
      const d = await 드래프트('좀비');
      const 좀비착지 = await 종료(job, '키없음', 폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '키없음' }));
      확인('B4 §12-18 회수 직후 좀비 착지 — 펜스는 일치해도 «상태»가 거절한다(A5)', 좀비착지.landed === false && 좀비착지.reason === '거절', 좀비착지);
      const 새job = await 집기('좀비');
      확인('B4 회수된 job 을 다음 집기가 실제로 집는다(펜스 +1)', Number(새job.fence) === Number(job.fence) + 1, [job.fence, 새job.fence]);
      const 낡은착지 = await 종료({ job_id: 새job.job_id, fence: job.fence }, '키없음', 폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '키없음' }));
      확인('B4 §12-16 펜싱 — 낡은 fence 의 착지는 0행 거절', 낡은착지.landed === false, 낡은착지);
      const 새착지 = await 종료(새job, '키없음', 폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '키없음' }));
      확인('B4 §12-16 — 새 세대의 착지는 그대로 산다(이중 착지 0)', 새착지.landed === true, 새착지);
    }

    /* 자발 반납 + A3 판불일치 open + A5·A2 가드 누수(§12-18·23·26). */
    {
      const job = await 집기('회수');
      확인('B4 자발 반납(jobs_release) — claimed→대기 true', (await sql(`select engine.jobs_release('${job.job_id}'::uuid, ${job.fence}::bigint) as ok`))[0].ok === true);
      const job2 = await 집기('회수');
      const 판갈림 = await 열기(job2, '본문', { estimator_version: '다른-추정판' });
      확인('B4 §12-23 A3 — attempt_open 의 estimator_version 불일치는 판불일치 거절', 판갈림.reject_reason === '판불일치', 판갈림);
      const 연 = await 열기(job2, '본문');
      const 성공빈응답 = await 실행(`select engine.attempt_close('${연.attempt_id}'::uuid, null, '성공', null)`);
      확인('B4 §12-26 A5 — 성공인데 raw_response null 인 close 는 물리 거절', !성공빈응답.ok, (성공빈응답.메시지 || '').slice(0, 120));
      const 빈배열1 = await 실행(`update engine.generation_attempts set result='검문탈락', gate_failed_reasons='{}', raw_response='x', responded_at=now() where attempt_id='${연.attempt_id}'::uuid`);
      확인('B4 §12-23 A2① — 검문탈락 + 빈 사유 배열은 거절', !빈배열1.ok, (빈배열1.메시지 || '').slice(0, 120));
      const 빈배열2 = await 실행(`update engine.generation_attempts set result='성공', gate_failed_reasons='{}', raw_response='x', responded_at=now() where attempt_id='${연.attempt_id}'::uuid`);
      확인('B4 §12-23 A2② — 성공 + 빈 사유 배열도 거절(쌍조건 NULL 구멍 없음)', !빈배열2.ok, (빈배열2.메시지 || '').slice(0, 120));
      확인('B4 뒷정리 — 열린 시도를 타임아웃으로 닫는다', await 닫기(연.attempt_id, null, '타임아웃') === true);
      const d = await 드래프트('회수');
      const r = await 종료(job2, '타임아웃', 폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '타임아웃', input_text: '본문' }), { 결정: 연.attempt_id });
      확인('B4 회수 학생 착지', r.landed === true, r);
      const 남의승자 = await 실행(`update engine.generation_jobs set winning_attempt_id='${연.attempt_id}'::uuid, winning_result='성공', winning_fence=fence where learner_id='${학['성공']}'::uuid and assign_date='${D1}'::date`);
      확인('B4 §12-18 남의 시도를 승자로 못 세운다(복합 FK)', !남의승자.ok, (남의승자.메시지 || '').slice(0, 120));
    }

    /* A4(§12-26) — 대기 행에 종료 칸 하나만 얹기 거절 + «기존» 갈래 + 정리(구제 종결). */
    {
      const 얹기 = await 실행(`update engine.generation_jobs set outcome='타임아웃' where learner_id='${학['대기유지']}'::uuid and assign_date='${D1}'::date`);
      확인('B4 §12-26 A4 — 대기 행에 outcome 만 얹으면 거절(칸별 비종료 가드)', !얹기.ok, (얹기.메시지 || '').slice(0, 120));
      const 기존 = (await sql(`select kind, (job).status as s from engine.jobs_load_one('${D1}'::date, '${run2}'::uuid, ${제이슨(대상('대기유지', D1))})`))[0];
      확인('B4 ㉨ «기존» 갈래 — 살아 있는 job 은 그대로 돌려준다(생성중 재료)', 기존.kind === '기존' && 기존.s === '대기', 기존);
      const job = (await sql(`select job_id, fence from engine.generation_jobs where learner_id='${학['대기유지']}'::uuid and assign_date='${D1}'::date`))[0];
      const d = await 드래프트('대기유지');
      확인('B4 뒷정리 — 대기유지 job 을 구제 모드로 종결(미래일 대기 잔존 0)', (await 종료(job, '구제경로', 폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '구제경로' }), { 모드: '구제' })).landed === true);
    }

    /* 늦적재 배제(§12-21 C4 — ⑨ 이중 cutoff): 창 «안» 시각이라도 늦게 적재된 사건은 근거가 못
     * 된다. draft 에 심긴 그대로 봉투에 실으므로 대조 ⑩은 통과하고 ⑨가 잡아야 한다. */
    {
      const job = await 집기('늦적재');
      const d = await 드래프트('늦적재');
      const r = await 실행(`select * from engine.jobs_finalize('${job.job_id}'::uuid, ${job.fence}::bigint, '키없음', ${제이슨(
        폴백봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '키없음' }))}, null, null, '정상')`);
      확인('B4 §12-21 늦적재 — ingested_at > as_of 사건이 근거에 있으면 착지가 거절된다(⑨ 이중 cutoff)',
        !r.ok && /늦적재|창 밖|cutoff/.test(r.메시지 || ''), (r.메시지 || '').slice(0, 200));
      /* 이 job 은 정상 경로로는 영영 못 닫힌다(draft 가 곧 근거라) — 정직하게 반납만 하고,
       * 남은 대기 행은 미래일이라 스윕·감시 분모 밖임을 확인하는 것으로 갈음한다. */
      확인('B4 늦적재 — job 반납(대기로 되돌림 · 미래일이라 마감 스윕 대상 아님)', (await sql(`
        select engine.jobs_release('${job.job_id}'::uuid, ${job.fence}::bigint) as ok`))[0].ok === true);
    }

    /* 빈 큐 집기(§12-26 A11) — job 0건인 날의 claim 은 빈 결과·예외 0. */
    const 빈집기 = await sql(`select * from engine.jobs_claim('${D3}'::date, 'genfix:${표}', 3, 1800, null)`);
    확인('B4 §12-26 A11 — 빈 날짜 claim 은 빈 결과(0 나눗셈 없음)', 빈집기.length === 0);
  }

  /* B5 마감 스윕·경계(§12-28 + V6-9) — 과거일. 🔴 «어제»는 못 쓴다(4차 실측): 몽골 새벽
   * 00~06시엔 어제의 마감(오늘 06:00)이 아직 안 지났다 — «그저께»는 어느 시각에도 지나 있다. */
  {
    const P = (await sql(`select ((now() at time zone 'Asia/Ulaanbaatar')::date - 2)::text as d`))[0].d;
    const ids = ['마감대기', '마감클레임', '마감성공잔존', '마감격리'].map((n) => 학[n]);
    const runP = (await sql(`select engine.batch_run_start('${P}'::date, '배치', ${실행판봉투(P)}, ${명단봉투(ids)}) as id`))[0].id;
    await sql(`select engine.jobs_load('${P}'::date, '${runP}'::uuid, ${제이슨(
      ['마감대기', '마감클레임', '마감성공잔존', '마감격리'].map((n) => 대상(n, P)))}, '{}'::uuid[])`);
    /* 마감 «전» claim 이 이제 불가능한 날짜라, 「집고 나서 마감이 지난 워커」는 시계를 돌려 만든다. */
    await sql(`update engine.generation_jobs set status='claimed', owner='genfix:stall', lease_until=now()+interval '30 minutes', fence=fence+1
      where learner_id in ('${학['마감클레임']}'::uuid, '${학['마감성공잔존']}'::uuid) and assign_date='${P}'::date`);
    확인('B5 마감 뒤 claim 거절 — jobs_claim 은 그 날짜를 아예 안 집는다(B3 계약)', (await sql(`
      select count(*)::int as n from engine.jobs_claim('${P}'::date, 'genfix:${표}', 3, 1800, null)`))[0].n === 0);
    const 잔존시도 = (await sql(`select job_id, fence from engine.generation_jobs where learner_id='${학['마감성공잔존']}'::uuid and assign_date='${P}'::date`))[0];
    const 연 = (await sql(`select attempt_id, reject_reason from engine.attempt_open('${잔존시도.job_id}'::uuid, ${잔존시도.fence}::bigint,
      '${실행판.model}', '${실행판.prompt_ver}', '${실행판.policy_ver}', '${실행판.estimator_version}', '${실행판.schema_ver}', '${실행판.skill_taxonomy_ver}', '늦은 워커의 본문')`))[0];
    치명확인('B5 마감 뒤에도 열린 시도는 남길 수 있다(사실 보존 — 가드는 착지에 있다)', !!연.attempt_id);

    const 스윕 = await sql(`select job_id, landed, reason from engine.jobs_finalize_due('${P}'::date)`);
    const 내스윕 = 스윕.filter((r) => true);   // 반환은 전 날짜 잔존 — 내 학생만 아래에서 행으로 확인
    console.log(`  ▸ 마감 스윕 반환 ${내스윕.length}행(전 날짜 잔존 포함)`);
    /* output_text 는 «개입» 사건의 payload 다 — assigned_event_id(task.assigned 의 payload 는
     * {ver:1})에서 intervention_id 로 한 홉 더 간다(5차 실측 — 조인을 배정 행에 걸어 null 을 읽었다). */
    const 마감행 = async (이름) => (await sql(`
      select g.status, g.outcome, iv.payload ->> 'output_text' as 나간문장
        from engine.generation_jobs g
        left join engine.learning_events ta on ta.event_id = g.assigned_event_id
        left join engine.learning_events iv on iv.intervention_id = ta.intervention_id
         and iv.event_type = 'intervention.delivered'
       where g.learner_id='${학[이름]}'::uuid and g.assign_date='${P}'::date`))[0];
    const 대기행 = await 마감행('마감대기'), 클레임행 = await 마감행('마감클레임');
    확인('B5 §12-28 마감 — 대기·claimed 가 전량 마감폴백/예산소진으로 닫힌다',
      대기행.status === '마감폴백' && 대기행.outcome === '예산소진' && 클레임행.status === '마감폴백', { 대기행, 클레임행 });
    확인('B5 §12-28 — 나간 문장이 «저장된 draft» 의 ② 문장이다(오늘과제 재호출 0 의 물리 증명)',
      대기행.나간문장 === 따라말하기문장(초안(P).task_snapshot), 대기행.나간문장);
    const 격리행 = (await sql(`
      select status from engine.generation_jobs where learner_id='${학['마감격리']}'::uuid and assign_date='${P}'::date`))[0];
    확인('B5 §12-28 한 건 실패 격리 — 동의 없는 학생만 못 닫힌 채 남고 나머지는 닫힌다(스윕은 계속 돈다)',
      격리행.status !== '마감폴백', 격리행);
    /* 스코프 = «이 회차» 학생 — 날짜 전체를 세면 앞 회차의 격리 잔재(동의 없는 학생은 원리상
     * 영영 못 닫힌다)가 섞인다(6차 실측). 날짜 전량의 잔여 감시는 활성 조각의 deliver-check 몫. */
    확인('B5 마감 뒤 잔여 — 이 회차 학생의 대기·claimed = 0(격리 학생 제외)', (await sql(`
      select count(*)::int as n from engine.generation_jobs
       where assign_date='${P}'::date and status in ('대기','claimed')
         and learner_id in ('${학['마감대기']}'::uuid, '${학['마감클레임']}'::uuid, '${학['마감성공잔존']}'::uuid)`))[0].n === 0);
    확인('B5 V6-9 — 마감폴백 «뒤» 성공 close 는 남되(사실) 승자가 아니다', await (async () => {
      const ok = await 닫기(연.attempt_id, JSON.stringify({ content: [{ type: 'text', text: '{"sentence":"늦은 문장","question":"늦은 질문"}' }] }), '성공');
      const g = (await sql(`select status, winning_attempt_id from engine.generation_jobs where job_id='${잔존시도.job_id}'::uuid`))[0];
      return ok === true && g.status === '마감폴백' && g.winning_attempt_id === null;
    })());
  }

  /* B6 활성일 가드(§12-28 «전환» · §3-2-a C5 · 가드 마이그 20260822090000) — 활성 시작일
   * «이전» 날짜로 jobs_load 를 부르면 0건 적재. 활성 함수를 처녀날짜보다 먼 미래로 임시 세워
   * 발동을 실측하고 걷는다(C층 임시 장치 선례 — 잔존 없음 확인까지가 한 벌). 함수가 «없는»
   * 동안의 무동작(행동 불변)은 B1~B5 전체가 그 상태로 초록인 것이 증인이다. */
  {
    const D6 = await 처녀날짜();
    try {
      await sql(`create or replace function engine.gen_active_from() returns date language sql immutable as $f$ select date '9999-01-01' $f$`);
      const runG = (await sql(`select engine.batch_run_start('${D6}'::date, '배치', ${실행판봉투(D6)}, ${명단봉투([학['성공']])}) as id`))[0].id;
      치명확인('B6 가드 실증용 시작 행이 선다(처녀날짜 — 리더 없음)', !!runG);
      const r = (await sql(`select engine.jobs_load('${D6}'::date, '${runG}'::uuid, ${제이슨([대상('성공', D6)])}, '{}'::uuid[]) as j`))[0].j;
      확인('B6 §12-28 전환 — 활성일 «이전» 날짜의 jobs_load 는 0건 적재(skipped_inactive · v5.13-d)', r.created === 0 && r.existing === 0 && r.skipped_inactive === true, r);
      확인('B6 물리 — 그 날짜의 generation_jobs 행 0(가드의 몸은 반환값이 아니라 «행 부재»다)', (await sql(`
        select count(*)::int as n from engine.generation_jobs where assign_date='${D6}'::date`))[0].n === 0);
    } finally {
      await sql(`drop function if exists engine.gen_active_from()`);
      확인('B6 임시 활성 함수 걷힘(잔존 false)', (await sql(`select to_regprocedure('engine.gen_active_from()') is null as b`))[0].b === true);
    }
  }

  }   // ← 모드 물리·전부 (A+B)

  if (모드 === '물리') { 보고('물리층(A+B)만 — 오늘층은 --오늘 회차가 잰다'); return; }

  /* ════════ C. HTTP층 — 실제 오늘 · 활성 게이트 임시 ════════ */
  console.log('\n■ C. HTTP층 — 맥락 400 · 키없음 배치 · 재진입 · 구제 · tasks 상태 칸(§12-2·8·11·15)');
  const 오늘 = (await sql(`select ((now() at time zone 'Asia/Ulaanbaatar')::date)::text as d`))[0].d;
  const 어제 = 다음날(오늘, -1), 그저께 = 다음날(오늘, -2);

  /* 함수 이름 표기는 왕복골격 회귀의 스코프 스캔이 걷는 세 꼴 중 둘(기본값·`함수:` 옵션)을 쓴다.
   * 게이트웨이가 이따금 HTML 오류면(5xx)을 낸다(8차 실측 — 워커 7회차에서 JSON 파싱 사망) —
   * 5xx·비 JSON 만 짧게 재시도하고, 4xx 는 판정 재료라 그대로 돌려준다. */
  const 함수호출 = async (질의 = '', 옵션 = {}) => {
    for (let i = 0; ; i++) {
      const r = await fetch(`https://${ref}.supabase.co/functions/v1/${옵션.함수 ?? 'deliver'}${질의}`, {
        method: 'POST', headers: { Authorization: `Bearer ${service}` },
      });
      const 원문 = await r.text();
      let 몸 = null;
      try { 몸 = JSON.parse(원문 || '{}'); } catch { 몸 = null; }
      if ((r.status >= 500 || 몸 === null) && i < 4) { await 쉼(5000); continue; }
      return { status: r.status, 몸: 몸 ?? { 원문머리: String(원문).slice(0, 120) } };
    }
  };
  const 워커호출 = () => 함수호출('', { 함수: 'deliver-one' });
  /* §8-B 벤더 통로(deliver-one?평가=1 · v5.13-e ⑤) — 갈래 «도달»만 잰다(벤더 0): 사례 0건이면 400 계약(1~상한) ·
   * 모델이 없으면 503 eval_no_model 이 먼저 온다(둘 다 갈래에 닿았다는 증거 · 운영 큐 무접촉). 실제 벤더 왕복은 #6 몫. */
  const 평가통로도달 = async () => {
    const r = await fetch(`https://${ref}.supabase.co/functions/v1/deliver-one?%ED%8F%89%EA%B0%80=1`, {
      method: 'POST', headers: { Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ 사례: [] }),
    });
    let 몸 = null; try { 몸 = JSON.parse(await r.text()); } catch { /* 비 JSON — 아래 판정이 잡는다 */ }
    return { status: r.status, 몸 };
  };

  /* 오늘층 학생 — 대상 3(어제 배정 심기) + 첫날 1. */
  const 오늘이름 = ['대상1', '대상2', '대상3', '첫날생'];
  const 오늘행 = await sql(`
    insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver, is_test)
    values ${오늘이름.map((n, i) => `('${표}-t${i}', '${n}', 'Lv3', null, '${판}', true)`).join(',')}
    returning learner_id, display_name`);
  const 오 = Object.fromEntries(오늘행.map((r) => [r.display_name, r.learner_id]));
  await sql(`insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
    values ${오늘이름.map((n) => `('${오[n]}'::uuid, 'v18.9', now() - interval '30 days', '${판}', 'tools/생성왕복시험.js')`).join(',')}`);
  const 어제심기 = async (learner) => {
    const 어제스냅 = 오늘과제({ 날짜: 어제, 첫날: true }).task_snapshot;
    await sql(`
      with ev as (
        insert into engine.learning_events (learner_id, event_type, task_type, actor_kind, occurred_at,
          idempotency_key, level_snapshot, consent_ver, consent_id, degraded, payload, schema_ver)
        values ('${learner}'::uuid, 'task.assigned', '발화녹음', 'ai', '${어제}T04:00:00Z'::timestamptz,
          'task:${learner}:${어제}', 'Lv3', 'v18.9',
          (select consent_id from engine.consents where learner_id='${learner}'::uuid limit 1),
          false, '{"ver":1}'::jsonb, '${판}') returning event_id)
      insert into engine.submissions (event_id, task_type, task_ref, task_snapshot, occurred_at, schema_ver)
      select event_id, '발화녹음', 'task-${어제}', ${제이슨(어제스냅)}, '${어제}T04:00:00Z'::timestamptz, '${판}' from ev`);
  };
  for (const n of ['대상1', '대상2', '대상3']) await 어제심기(오[n]);

  let 활성섰다 = false;
  try {
    await sql(`create or replace function engine.gen_active_from() returns date language sql immutable as $f$ select date '2020-01-01' $f$`);
    활성섰다 = true;

    /* C1 §8-B 평가 갈래 도달(v5.13-e ⑤ — 운영 큐 무접촉 벤더 통로) — 사례 0건 → 400(1~상한 계약) 또는 모델 미설정 → 503. */
    {
      const e = await 평가통로도달();
      확인('C1 deliver-one?평가=1 갈래가 서 있다 — 빈 사례는 400(사례 1~상한) · 모델 미설정이면 503 eval_no_model(둘 다 도달 증거 · 벤더 0)',
        (e.status === 400 && !!e.몸 && /사례는 1~/.test(String(e.몸.error))) || (e.status === 503 && !!e.몸 && e.몸.error === 'eval_no_model'), e);
    }

    /* C2 맥락 계약(§3-1 v5.8) — 활성 뒤 필수·값목록·조합. */
    확인('C2 활성 + 맥락 누락 = 400(fail-closed — 조용히 옛 길로 안 간다)', (await 함수호출()).status === 400);
    확인('C2 목록 밖 맥락 = 400', (await 함수호출(`?${new URLSearchParams({ 맥락: '엉뚱' })}`)).status === 400);
    확인('C2 배치 + learner_id 조합 = 400', (await 함수호출(`?${new URLSearchParams({ 맥락: '배치', learner_id: 오['대상1'] })}`)).status === 400);
    확인('C2 구제 + 전원 조합 = 400', (await 함수호출(`?${new URLSearchParams({ 맥락: '구제' })}`)).status === 400);

    /* C3 배치(㉠) — 오케스트레이터가 큐를 세운다(벤더 0).
     * 🔴 GENERATION_MODEL(모델은 유호님 몫)이 비면 설계대로 행 무접촉(no_model)으로 물러난다 —
     *   #6 전 리허설은 공갈 secret 임시 장치(세우고 걷기 · 이전 스모크 확립 절차)를 밖에서 두르고
     *   돌린다. secret 전파에 시간이 걸려 no_model 인 동안만 짧게 재시도한다(행 무접촉이라 무해). */
    let 배치 = null;
    for (let i = 0; i < 12; i++) {
      배치 = await 함수호출(`?${new URLSearchParams({ 맥락: '배치' })}`);
      if (!(배치.status === 200 && 배치.몸 && 배치.몸.이유 === 'no_model')) break;
      await 쉼(6000);
    }
    치명확인('C3 활성 배치가 200 으로 돈다', 배치.status === 200);
    치명확인('C3 GENERATION_MODEL 이 보인다(비면 공갈 secret 장치 또는 모델 픽이 선행이다)',
      !(배치.몸 && 배치.몸.이유 === 'no_model'));
    console.log(`  ▸ 배치 응답: ${JSON.stringify(배치.몸).slice(0, 240)}`);
    const 내대기 = (await sql(`select count(*)::int as n from engine.generation_jobs
      where assign_date='${오늘}'::date and status='대기' and learner_id in (${['대상1', '대상2', '대상3'].map((n) => `'${오[n]}'::uuid`).join(',')})`))[0].n;
    확인('C3 내 대상 3 의 job 이 대기로 섰다', 내대기 === 3, 내대기);
    확인('C3 첫날 학생은 대상아님(첫날)으로 이미 착지했다', (await sql(`
      select outcome, not_target_reason from engine.generation_jobs where learner_id='${오['첫날생']}'::uuid and assign_date='${오늘}'::date`))[0]?.not_target_reason === '첫날');

    /* tasks «생성중» — 학생 토큰 조회(§12-11 C3 갈래 · 서버가 판정 주체). */
    const 학생이메일 = `probe-genfix${도메인}`;
    const 학생비번 = 'Genfix-Rehearsal-1';
    const 유저 = async (경로, 방법, 본문) => fetch(`https://${ref}.supabase.co/auth/v1/${경로}`, {
      method: 방법, headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(본문),
    });
    let uid = (await sql(`select id from auth.users where email='${학생이메일}'`))[0]?.id;
    if (!uid) {
      const cr = await 유저('admin/users', 'POST', { email: 학생이메일, password: 학생비번, email_confirm: true });
      uid = cr.ok ? JSON.parse(await cr.text()).id : (await sql(`select id from auth.users where email='${학생이메일}'`))[0]?.id;
    } else await 유저(`admin/users/${uid}`, 'PUT', { password: 학생비번 });
    치명확인('C3 시험용 학생 계정', !!uid);
    const 로그인 = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 학생이메일, password: 학생비번 }),
    });
    const 학생토큰 = JSON.parse(await 로그인.text()).access_token;
    치명확인('C3 학생 토큰', !!학생토큰);
    const 학생조회 = async (learner, 질의 = '') => {
      await sql(`update engine.learners set auth_user_id = null where auth_user_id = '${uid}'`);
      await sql(`update engine.learners set auth_user_id = '${uid}' where learner_id = '${learner}'::uuid`);
      const r = await fetch(`https://${ref}.supabase.co/functions/v1/tasks${질의}`, {
        headers: { apikey: anon, Authorization: `Bearer ${학생토큰}`, 'X-Contract-Ver': 판 },
      });
      return { status: r.status, 몸: JSON.parse((await r.text()) || '{}') };
    };
    {
      /* 🔴 401 수리(lib/토큰.js 서비스역할 — deliver v68 · 08-22)가 리허설에 닿은 뒤 tasks→deliver 구제가 **실제로 돈다**:
       * «대기» job 학생을 조회하면 구제가 그 job 을 집어 폴백(구제경로)으로 착지시키므로 현행 계약은 «있음»이다
       * (401 시절엔 구제가 거절돼 «생성중»이 찍혔다 — 그 기대가 오늘 아침까지 초록이던 것이 잠복 결함의 얼굴이었다).
       * «생성중» 은 「구제가 못 잡는 job」= 남이 집은(claimed · lease 유효) 상태에서만 난다(§3-1 v5.7 B11 판정식) —
       * 그 상태를 시험이 먼저 집어 심고 잰 뒤 반납한다(C4 워커가 이어받는다). */
      const 잡힘 = (await sql(`select job_id, fence from engine.jobs_claim('${오늘}'::date, 'genfix-hold:${표}', 1, 1800, '${오['대상1']}'::uuid)`))[0];
      치명확인('C3 대상1 job 을 시험이 먼저 집는다(claimed · lease 유효 — «생성중» 재료)', !!잡힘 && !!잡힘.job_id);
      const t = await 학생조회(오['대상1']);
      확인('C3 tasks — 남이 집은(claimed·lease 유효) job 학생은 assignment_status=«생성중»(빈 화면과 갈린다 · 구제는 그 job 을 못 잡는다)', t.status === 200 && t.몸.assignment_status === '생성중', t.몸.assignment_status);
      await sql(`select engine.jobs_release('${잡힘.job_id}'::uuid, ${잡힘.fence}::bigint) as ok`);
      const t2 = await 학생조회(오['대상2']);
      확인('C3 tasks — «대기» job 학생은 구제가 집어 착지하므로 «있음»(401 수리 뒤 현행 — 구제 도달의 첫 외부 증거)', t2.status === 200 && t2.몸.assignment_status === '있음', t2.몸.assignment_status);
    }

    /* C4 워커 재진입(§12-15) + §12-2 키없음 전원. */
    let 첫집음 = null, 총회차 = 0, 계수합 = {};
    for (let i = 0; i < 150; i++) {
      const w = await 워커호출();
      /* §12-20 계측 «장치» — 응답에 벽시계 3항+분모가 «각각» 실린다(합치지 않는다) · CPU 는 플랫폼 로그 몫이라 숫자가 아니라
       * 문장(숫자 0 을 안 만든다). 실측 «판정»(워커학생상한 재계산)은 #6 뒤 첫 실행 — 여기선 장치가 섰는지만 잰다. */
      확인('C4 §12-20 계측 장치 — 콜드스타트(호출당·warm 은 null)·claim_ms·학생별 {전처리,벤더,착지} 가 각각 실리고 CPU 는 문장이다',
        !!(w.몸 && w.몸.계측) && 'claim_ms' in w.몸.계측 && Array.isArray(w.몸.계측.학생) && typeof w.몸.계측.cpu === 'string'
          && (w.몸.계측.콜드스타트_ms === null || typeof w.몸.계측.콜드스타트_ms === 'number')
          && w.몸.계측.학생.every((x) => typeof x.전처리_ms === 'number' && ('벤더_ms' in x) && ('착지_ms' in x)),
        w.몸 && w.몸.계측);
      치명확인(`C4 워커 호출 ${i + 1} 이 200`, w.status === 200);
      총회차 += 1;
      if (첫집음 === null) 첫집음 = w.몸.집음;
      for (const [k, v] of Object.entries(w.몸.계수 || {})) 계수합[k] = (계수합[k] ?? 0) + v;
      if (w.몸.집음 === 0) break;
    }
    확인('C4 §12-15 — 한 호출은 워커학생상한(3) 이하만 처리한다(한 번에 전원이면 v3 루프의 부활)', 첫집음 !== null && 첫집음 <= 3, 첫집음);
    console.log(`  ▸ 워커 ${총회차}회 · 계수합 ${JSON.stringify(계수합)}`);
    const 내착지 = await sql(`select learner_id, outcome from engine.generation_jobs
      where assign_date='${오늘}'::date and learner_id in (${['대상1', '대상2', '대상3'].map((n) => `'${오[n]}'::uuid`).join(',')})`);
    /* §12-2 의 문면은 «키없음»(키 없는 환경) — 이 리허설엔 교정 계열의 벤더 키가 살아 있어 워커가
     * 공갈 모델로 벤더에 갔다가 4xx(모델 없음 · 과금 0)를 받아 «벤더오류» 폴백이 된다(7차 실측).
     * 재는 본질(«벤더 산출 없이도 배치가 전원 2단 착지·예외 0»)은 두 갈래가 같으므로 둘 다 초록,
     * 갈래는 로그로 밝힌다. 워커의 키없음 «갈래» 자체는 키를 걷은 환경에서만 실측된다(정직 표기). */
    console.log(`  ▸ §12-2 갈래: ${[...new Set(내착지.map((r) => r.outcome))].join(',') || '없음'} (키 유무는 이 시험 밖 환경이다)`);
    /* «구제경로» 허용 — C3 의 tasks 조회가 대상2 를 구제로 착지시킨다(401 수리 뒤 · 벤더 0).
     * 🔴 «성공» 도 정당하다(08-23 현행화 — 심문 T4·T5 소화): GENERATION_MODEL 이 유호 픽 실모델로
     *   섰다(#6). 공갈 시대의 「성공 = 몰래 과금 신호」 전제가 소멸했고, 성공 경로 실측이 곧 T5
     *   (워커 성공 무시험)를 닫는 유일한 길이다. 본질(전원 예외 0 착지)은 그대로 잰다. */
    확인('C4 §12-2 — ③생성대상 전원이 착지(예외 0 · 키없음|벤더오류|구제경로|성공)',
      내착지.length === 3 && 내착지.every((r) => ['키없음', '벤더오류', '구제경로', '성공'].includes(r.outcome)), 내착지);
    /* 비용 «표시»(옛 「성공 0」 가드의 후신) — 과금을 막는 게 아니라 «아는 과금»으로 만든다:
     * 성공 수를 세어 밝히고, 성공 행마다 model 이 행에 남았는지(어느 모델의 돈인지)를 잰다. */
    {
      const 성공행 = await sql(`select count(*)::int as n, count(*) filter (where coalesce(model,'') = '')::int as 모델빈
        from engine.generation_jobs where assign_date='${오늘}'::date and outcome='성공'`);
      console.log(`  ▸ 비용 표시: 오늘 벤더 성공 ${성공행[0].n}건(실모델 — 대략 건당 $0.004 · #6 크레딧)`);
      확인('C4 비용 표시 — 성공 행 전부에 model 이 남는다(어느 모델의 돈인지 행이 안다)', 성공행[0].모델빈 === 0, 성공행[0]);
    }
    확인('C4 재진입 종착 — 오늘 큐에 대기·claimed 잔존 0(다음 회차가 이어받아 전원 종료)', (await sql(`
      select count(*)::int as n from engine.generation_jobs where assign_date='${오늘}'::date and status in ('대기','claimed')`))[0].n === 0);

    /* §12-8 분포 — 분모 셋 + 판정 불능 수를 «숫자로» 낸다. */
    {
      const run = (await sql(`select enrolled_count, target_count, loaded_count, skipped_game_count, skipped_existing_count, partial_count
        from engine.generation_batch_runs where assign_date='${오늘}'::date and run_kind='배치' and finished_at is not null
        order by started_at desc limit 1`))[0];
      const 분포 = await sql(`select coalesce(outcome, status) as 값, count(*)::int as n from engine.generation_jobs
        where assign_date='${오늘}'::date group by 1 order by 2 desc`);
      const 닻 = (await sql(`select count(*)::int as n from engine.learning_events
        where event_type='intervention.delivered' and idempotency_key like 'intervention:%:${오늘}'`))[0].n;
      const 불능 = (await sql(`select count(*)::int as n from engine.generation_jobs where assign_date='${오늘}'::date and status='적재실패'`))[0].n;
      console.log(`  ▸ §12-8 — ⓐ재적 ${run.enrolled_count} · ⓑ대상 ${run.target_count} · ⓒ닻 ${닻} · 판정불능 ${불능}`);
      console.log(`  ▸ 분포: ${분포.map((r) => `${r.값}=${r.n}`).join(' · ')}`);
      확인('C4 §12-8 계정 등식 — loaded+게임+기존 = 재적(마지막 완주 배치 행)', run.loaded_count + run.skipped_game_count + run.skipped_existing_count === run.enrolled_count, run);
    }

    /* C5 구제(㉨ · §12-11) — 신규(큐 없는 학생)·이미배정·적재실패 소생·남의 일감 보존. */
    const [{ learner_id: 구제생 }] = await sql(`
      insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver, is_test)
      values ('${표}-r', '구제생', 'Lv3', null, '${판}', true) returning learner_id`);
    await sql(`insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
      values ('${구제생}'::uuid, 'v18.9', now() - interval '30 days', '${판}', 'tools/생성왕복시험.js')`);
    await 어제심기(구제생);
    {
      const r = await 함수호출(`?${new URLSearchParams({ 맥락: '구제', learner_id: 구제생 })}`);
      확인('C5 §12-11 job 0건의 구제 — jobs_load_one 이 만들고 폴백이 «구제경로»로 착지한다', r.status === 200, r.몸);
      const g = (await sql(`select status, outcome, fence from engine.generation_jobs where learner_id='${구제생}'::uuid and assign_date='${오늘}'::date`))[0];
      확인('C5 구제 착지 — 착지/구제경로 · 벤더 0(attempts 0행 물리 강제)', g && g.status === '착지' && g.outcome === '구제경로', g);
      확인('C5 구제 attempts 0', (await sql(`select count(*)::int as n from engine.generation_attempts a
        join engine.generation_jobs j on j.job_id=a.job_id where j.learner_id='${구제생}'::uuid`))[0].n === 0);
      const t = await 학생조회(구제생);
      확인('C5 tasks — 구제 학생은 이제 «있음» + 오늘 1건', t.몸.assignment_status === '있음' && (t.몸.data || []).length === 1, t.몸.assignment_status);
      const 재구제 = await 함수호출(`?${new URLSearchParams({ 맥락: '구제', learner_id: 구제생 })}`);
      /* 셈은 «오늘» 배정만 — 준비 단계의 어제 심기가 있어 전체 셈이면 2가 정상이다(7차 오탐). */
      확인('C5 §12-11 재구제 — 이미 배정된 날은 그 행을 돌려주고 새 행 0(멱등)', 재구제.status === 200 && (await sql(`
        select count(*)::int as n from engine.learning_events
         where learner_id='${구제생}'::uuid and event_type='task.assigned'
           and idempotency_key='task:${구제생}:${오늘}'`))[0].n === 1, 재구제.몸);
    }
    {
      /* 적재실패 소생(A9→㉨) — 오늘 날짜에 load_error 를 «구제 실행»으로 심고 HTTP 구제로 되살린다. */
      const [{ learner_id: 소생생 }] = await sql(`
        insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver, is_test)
        values ('${표}-r2', '소생생', 'Lv3', null, '${판}', true) returning learner_id`);
      await sql(`insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
        values ('${소생생}'::uuid, 'v18.9', now() - interval '30 days', '${판}', 'tools/생성왕복시험.js')`);
      await 어제심기(소생생);
      const 심는run = (await sql(`select engine.batch_run_start('${오늘}'::date, '구제', ${실행판봉투(오늘)}) as id`))[0].id;
      await sql(`select engine.jobs_load('${오늘}'::date, '${심는run}'::uuid, ${제이슨([{ learner_id: 소생생, load_error: '상태오류: 시험 주입' }])}, '{}'::uuid[])`);
      const 전 = (await sql(`select status, load_retry_count from engine.generation_jobs where learner_id='${소생생}'::uuid and assign_date='${오늘}'::date`))[0];
      치명확인('C5 소생 준비 — 적재실패 행이 섰다', 전.status === '적재실패');
      const r = await 함수호출(`?${new URLSearchParams({ 맥락: '구제', learner_id: 소생생 })}`);
      const 후 = (await sql(`select status, outcome, load_retry_count from engine.generation_jobs where learner_id='${소생생}'::uuid and assign_date='${오늘}'::date`))[0];
      확인('C5 §12-11 적재실패 학생의 구제 — 행이 대기로 되살아나 폴백이 선다(A9·부활 계수 +1)',
        r.status === 200 && 후.status === '착지' && 후.outcome === '구제경로' && 후.load_retry_count === 전.load_retry_count + 1, { r: r.몸, 후 });
    }
    {
      /* 남의 일감 보존(E1) — 두 학생 큐를 세우고 한 명만 구제 → 남의 job 은 무접촉. */
      const 보존 = await sql(`
        insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver, is_test)
        values ('${표}-p1', '보존A', 'Lv3', null, '${판}', true), ('${표}-p2', '보존B', 'Lv3', null, '${판}', true)
        returning learner_id, display_name`);
      const 보 = Object.fromEntries(보존.map((r) => [r.display_name, r.learner_id]));
      await sql(`insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
        values ('${보['보존A']}'::uuid, 'v18.9', now() - interval '30 days', '${판}', 'tools/생성왕복시험.js'),
               ('${보['보존B']}'::uuid, 'v18.9', now() - interval '30 days', '${판}', 'tools/생성왕복시험.js')`);
      await 어제심기(보['보존A']); await 어제심기(보['보존B']);
      const 재배치 = await 함수호출(`?${new URLSearchParams({ 맥락: '배치' })}`);
      치명확인('C5 둘째 배치(재실행 B10)가 돈다', 재배치.status === 200);
      const A전 = (await sql(`select status, fence from engine.generation_jobs where learner_id='${보['보존A']}'::uuid and assign_date='${오늘}'::date`))[0];
      치명확인('C5 보존A 큐가 대기로 섰다', A전 && A전.status === '대기');
      const rB = await 함수호출(`?${new URLSearchParams({ 맥락: '구제', learner_id: 보['보존B'] })}`);
      const A후 = (await sql(`select status, fence from engine.generation_jobs where learner_id='${보['보존A']}'::uuid and assign_date='${오늘}'::date`))[0];
      확인('C5 §12-11 E1 — 구제는 «그 학생 job 만» 집는다(남의 일감 무접촉)', rB.status === 200
        && A후.status === '대기' && Number(A후.fence) === Number(A전.fence), { A전, A후 });
      for (let i = 0; i < 10; i++) { const w = await 워커호출(); if (w.몸.집음 === 0) break; }
      const 보존잔존 = (await sql(`
        select count(*)::int as n from engine.generation_jobs
         where assign_date='${오늘}'::date and status in ('대기','claimed')
           and learner_id in ('${보['보존A']}'::uuid, '${보['보존B']}'::uuid)`))[0].n;
      확인('C5 뒷정리 — 보존A/B 를 워커가 닫아 이 회차 몫 잔존 0', 보존잔존 === 0, 보존잔존);
    }

    /* C6 tasks «없음»·«오류» — 판정 주체는 서버 하나(gen_deadline). */
    {
      const [{ learner_id: 없음생 }] = await sql(`
        insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver, is_test)
        values ('${표}-n', '없음생', 'Lv3', null, '${판}', true) returning learner_id`);
      await sql(`insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
        values ('${없음생}'::uuid, 'v18.9', now() - interval '30 days', '${판}', 'tools/생성왕복시험.js')`);
      const t = await 학생조회(없음생);
      /* 401 수리 뒤 현행: job 도 배정도 없는 재적 학생은 구제(㉨ jobs_load_one)가 job 을 만들어 폴백 착지시키므로 «있음»이다
       * (401 시절엔 구제가 거절돼 «없음»이 찍혔다). 값 «없음» 은 달력 게임날(job 자체를 안 만든다)에서만 나는 값이라
       * 이 시험은 그 값을 «못 잰다»(정직 표기 — 게임날 회차가 오면 그 자리에서 잰다). */
      확인('C6 tasks — job 도 배정도 없는 재적 학생은 구제가 만들어 착지하므로 «있음»(401 수리 뒤 현행 · «없음» 은 게임날 값 — 이 시험 밖)', t.몸.assignment_status === '있음', t.몸.assignment_status);
      const [{ learner_id: 오류생 }] = await sql(`
        insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver, is_test)
        values ('${표}-e', '오류생', 'Lv3', null, '${판}', true) returning learner_id`);
      await sql(`insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
        values ('${오류생}'::uuid, 'v18.9', now() - interval '30 days', '${판}', 'tools/생성왕복시험.js')`);
      const 오류run = (await sql(`select engine.batch_run_start('${그저께}'::date, '구제', ${실행판봉투(그저께)}) as id`))[0].id;
      await sql(`select engine.jobs_load('${그저께}'::date, '${오류run}'::uuid, ${제이슨([{ learner_id: 오류생, branch_snapshot: { ver: 1, is_first_day: false, is_game_day: false, level: 'Lv3' }, skill_ids: 스킬들, not_target_reason: null, event_draft: 초안(그저께) }])}, '{}'::uuid[])`);
      const t2 = await 학생조회(오류생, `?date=${그저께}`);
      확인('C6 tasks — 마감 «뒤» 잔존은 «오류»(생성중과 다른 값 · 감시 ①과 같은 집합)', t2.몸.assignment_status === '오류', t2.몸.assignment_status);
      const 정리 = await sql(`select count(*)::int as n from engine.jobs_finalize_due('${그저께}'::date)`);
      확인('C6 뒷정리 — 그저께 잔존을 스윕이 닫는다', (await sql(`
        select status from engine.generation_jobs where learner_id='${오류생}'::uuid`))[0].status === '마감폴백', 정리);
    }
  } finally {
    if (활성섰다) {
      await sql(`drop function if exists engine.gen_active_from()`);
      const 잔존 = (await sql(`select to_regprocedure('engine.gen_active_from()') is not null as b`))[0].b;
      확인('C8 활성 임시 장치를 걷었다 — 잔존 false(비활성 회귀는 배달왕복시험이 잰다)', 잔존 === false, 잔존);
    }
  }

  /* C7 §12-17 성과 회수 사슬 — «성공» 착지(겨냥 기술 실림)에 후속 관측을 이어 붙이고, 비활성
   * 단건 배달의 응답 봉투(사슬.기술)로 「겨냥 → 후속 조인이 실제로 값을 낸다」를 밖에서 잰다
   * (닿았나의 증거). 성공 행은 «자가 시딩»한다(--오늘 단독 회차가 물리층에 안 기대게 · RPC 8수). */
  {
    const DS = await 처녀날짜();
    const [{ learner_id: S }] = await sql(`
      insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver, is_test)
      values ('${표}-s', '사슬성공', 'Lv3', null, '${판}', true) returning learner_id`);
    await sql(`insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
      values ('${S}'::uuid, 'v18.9', now() - interval '30 days', '${판}', 'tools/생성왕복시험.js')`);
    {
      const runS = (await sql(`select engine.batch_run_start('${DS}'::date, '배치', ${실행판봉투()}, ${명단봉투([S])}) as id`))[0].id;
      await sql(`select engine.jobs_load('${DS}'::date, '${runS}'::uuid, ${제이슨([{
        learner_id: S, branch_snapshot: { ver: 1, is_first_day: false, is_game_day: false, level: 'Lv3' },
        skill_ids: 스킬들, not_target_reason: null, event_draft: 초안(DS) }])}, '{}'::uuid[])`);
      const job = (await sql(`select job_id, fence, status from engine.jobs_claim('${DS}'::date, 'genfix:${표}', 1, 1800, '${S}'::uuid)`))[0];
      치명확인('C7 사슬 시딩 — claim', !!job && job.status === 'claimed');
      const 본문 = '사슬 시험 본문';
      const s문장 = '주말에는 공원에서 산책을 해요.';
      const raw = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ sentence: s문장, question: 질문 }) }], usage: { output_tokens: 9 } });
      const 연 = (await sql(`select attempt_id, reject_reason from engine.attempt_open('${job.job_id}'::uuid, ${job.fence}::bigint,
        '${실행판.model}', '${실행판.prompt_ver}', '${실행판.policy_ver}', '${실행판.estimator_version}', '${실행판.schema_ver}', '${실행판.skill_taxonomy_ver}', '${q(본문)}')`))[0];
      치명확인('C7 사슬 시딩 — open', !!연.attempt_id);
      await sql(`select engine.attempt_close('${연.attempt_id}'::uuid, '${q(raw)}', '성공', null)`);
      const d = (await sql(`select event_draft, estimator_version from engine.generation_jobs where job_id='${job.job_id}'::uuid`))[0];
      const 봉 = 착지봉투({ estimator_version: d.estimator_version, draft: d.event_draft, outcome: '성공',
        snap: 스냅샷(DS, s문장, '생성', 질문), output_text: s문장, gate_failed: null, input_text: 본문 });
      const r = (await sql(`select landed from engine.jobs_finalize('${job.job_id}'::uuid, ${job.fence}::bigint, '성공', ${제이슨(봉)}, '${연.attempt_id}'::uuid, null, '정상')`))[0];
      치명확인('C7 사슬 시딩 — 성공 착지(겨냥 기술 실림)', r.landed === true);
    }
    const D1 = DS;   // 아래 사슬 재료의 task_ref 가 이 날짜를 가리킨다
    const [{ submission_id }] = await sql(`
      with ev as (
        insert into engine.learning_events (learner_id, event_type, task_type, actor_kind, occurred_at,
          idempotency_key, consent_ver, consent_id, payload, schema_ver)
        values ('${S}'::uuid, 'submission.created', '발화녹음', 'learner', now(),
          'genfix:${표}:sub', 'v18.9',
          (select consent_id from engine.consents where learner_id='${S}'::uuid limit 1),
          '{"ver":1}'::jsonb, '${판}') returning event_id)
      insert into engine.submissions (event_id, task_type, task_ref, task_snapshot, occurred_at, schema_ver)
      select event_id, '발화녹음', 'task-${D1}', ${제이슨(스냅샷(D1, '학생이 다시 말한 문장', '생성', 질문))}, now(), '${판}' from ev
      returning submission_id`);
    const [{ correction_id }] = await sql(`
      insert into engine.corrections (submission_id, actor_kind, corrected_text, schema_ver)
      values ('${submission_id}'::uuid, 'teacher', '주말에는 공원에서 산책을 해요.', '${판}') returning correction_id`);
    await sql(`
      insert into engine.learning_events (learner_id, event_type, task_type, actor_kind, occurred_at,
        idempotency_key, correlation_id, correction_id, consent_ver, consent_id, payload, schema_ver)
      values ('${S}'::uuid, 'correction.viewed', '숙제제출', 'learner', now(),
        'genfix:${표}:view', gen_random_uuid(), '${correction_id}'::uuid, 'v18.9',
        (select consent_id from engine.consents where learner_id='${S}'::uuid limit 1),
        '{"ver":1}'::jsonb, '${판}')`);
    const r = await 함수호출(`?learner_id=${S}`);
    확인('C7 비활성 단건 배달이 200(활성 걷힘의 실측이기도 하다)', r.status === 200, r.몸);
    const 기 = (r.몸 || {}).사슬 && r.몸.사슬.기술;
    확인('C7 §12-17 — 겨냥 개입이 회수 봉투에 «숫자로» 잡힌다(겨냥개입 ≥ 1)', !!기 && 기.겨냥개입 >= 1, r.몸.사슬);
    확인('C7 §12-17 — 후속 관측 조인이 실제로 값을 낸다(관측있음·관측수 ≥ 1 — 0행이면 배선만 선 것)',
      !!기 && 기.관측있음 >= 1 && 기.관측수 >= 1, 기);
  }

  보고(`오늘 ${오늘} · 학생 ${표}-*${모드 === '전부' ? '' : ` · 모드 ${모드}`}`);
}

module.exports = { 사유픽스처, 응답전용, 무행갈래, 게이트함수들 };
if (require.main === module) {
  main().catch((e) => { console.error('[생성왕복시험] 죽음:', e); process.exit(1); });
}
