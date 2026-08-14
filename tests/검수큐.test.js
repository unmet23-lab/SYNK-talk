/* 검수자가 무엇을 읽는가 — `engine.review_queue` 가 정본이다 (절단문서 ②-17).
 *
 * ■ 무엇이 열려 있었나
 *   `inspector_queue_submissions` 정책이 큐에 든 제출물의 **행 전체**를 열었다. RLS 는 행
 *   단위라 열을 못 좁힌다 — `learners` 를 안 열어 `display_name` 을 가려 놓고도
 *   `body_original`·`task_snapshot`·`redaction_result` 가 같이 나갔다. 그런데 검수 대시보드는
 *   `service_role` Edge Function 뒤에 서고 그 역할은 **RLS 를 우회한다.** 즉 정책을 아무리
 *   좁혀도 진짜 통로는 안 좁혀진다(②-15 와 같은 자리). 좁히는 자리를 판(뷰)으로 옮겼다.
 *
 * ■ 2026-08-09 — 판을 화면이 성립하는 집합까지 올렸다(`20260809050000_review_c10`)
 *   12열로는 검수 화면을 못 그렸다: 검수자가 **판정하는 대상**인 AI 교정이 판에 없어서
 *   「읽는 곳은 `review_queue` 하나다」와 화면 명세가 동시에 성립하지 않았다. 22열로 올리며
 *   `event_id` 제외 판정을 뒤집었고(승격 멱등키 — 안 열면 직원 통로가 원표를 연다),
 *   큐 조건에 `pipeline_jobs.status` **허용 목록**을 더했다(폐기 항목이 되돌아오던 자리).
 *
 * ■ 이 검사가 지키는 넷
 *   ① 뷰가 **허용 목록 그대로**인가 — 넓히면 아무 증상 없이 개인정보가 한 칸 더 나간다.
 *   ② 새 열이 붙었을 때 **아무도 판정하지 않는 갈래가 없는가** — 허용도 아니고 사유 붙은
 *      제외도 아닌 열이 있으면 빨개진다(반대방향 장부 · talk `182d5e1` 와 같은 꼴).
 *   ③ 옛 정책이 **정말 지워졌는가** — 뷰와 정책이 같이 살면 정본이 둘이고 넓은 쪽이 이긴다.
 *   ④ 뷰에 역할 판정을 넣지 않았는가 — 넣으면 `service_role` 호출에서 `auth.uid()` 가 null
 *      이라 **정상 호출이 0행**이 된다(막는 것처럼 보이지만 화면이 통째로 빈다).
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 실제로 쓰는 표기 — 합본 정본(`supabase/L0_스키마.sql`)을 읽는다. 조각만 읽으면
 *      뒤 조각이 되돌린 것을 못 본다.
 *   ② 탐지력은 **픽스처**가 지고, 실저장소에는 「지금 깨끗한가」만 건다. 검수 Edge Function 은
 *      아직 0개라 실저장소 검사는 **skip 으로 드러낸다** — 통과와 미실행이 같은 모양이면 안 된다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { 코드만 } = require('./lib/소스검사.js');

const 뿌리 = path.resolve(__dirname, '..');
const 스키마 = fs.readFileSync(path.join(뿌리, 'supabase', 'L0_스키마.sql'), 'utf8');
const 확인 = fs.readFileSync(path.join(뿌리, 'supabase', '확인_적용후상태.sql'), 'utf8');
const 함수들 = path.join(뿌리, 'supabase', 'functions');

/* ── 정본에서 뽑는다 ───────────────────────────────────────────────── */

/** `engine.submissions` 의 열 전량 — create table 본문 + 뒤 조각의 add column. */
function 제출물열() {
  const 본문 = /create table if not exists engine\.submissions \(([\s\S]*?)\n {4}\);/.exec(스키마);
  assert.ok(본문, 'create table engine.submissions 를 못 찾았다 — 앵커가 낡았다');
  const 열 = 본문[1]
    .split('\n')
    .map((l) => /^\s{6}(\w+)\s+\S/.exec(l))
    .filter(Boolean)
    .map((m) => m[1]);
  for (const m of 스키마.matchAll(/alter table engine\.submissions([\s\S]*?);/g)) {
    for (const a of m[1].matchAll(/add column if not exists (\w+)/g)) 열.push(a[1]);
  }
  return [...new Set(열)];
}

/** 살아 있는 뷰 정의 — 🔑 **마지막** 것이다.
 *  합본은 조각을 이어붙인 것이라 뒤 조각이 판을 올려도 **첫 정의를 읽으면 영영 못 본다**
 *  (20260809050000 이 drop 후 create 로 판을 올린 자리 · 맹점 ①의 같은 계열). */
function 뷰정의() {
  const 전부 = [...스키마.matchAll(/create (?:or replace )?view engine\.review_queue as([\s\S]*?);\n/g)];
  assert.ok(전부.length, 'engine.review_queue 뷰를 합본에서 못 찾았다 — 조각이 안 실렸다');
  return 전부[전부.length - 1][1];
}

/** 뷰가 실제로 **내보내는 이름** — 별칭이 있으면 별칭이 그 열의 이름이다. */
function 뷰열() {
  const 몸 = 뷰정의();
  const 셀렉트 = 몸.slice(0, 몸.indexOf('from engine.submissions'));
  const 줄들 = 셀렉트.split('\n')
    .map((l) => l.replace(/--.*$/u, '').trim())
    .map((l) => l.replace(/^select\s+/u, ''))
    .filter(Boolean);
  const 이름 = 줄들.map((l) => {
    const 별칭 = /\bas\s+([\w가-힣]+),?$/u.exec(l);
    if (별칭) return 별칭[1];
    const 그대로 = /^[\w가-힣]+\.([\w가-힣]+),?$/u.exec(l);
    return 그대로 ? 그대로[1] : null;
  });
  // 🔴 못 읽은 줄을 조용히 버리면 **검사가 줄어든 것이 통과와 같은 모양**이 된다(분모를 밝힌다).
  const 못읽음 = 줄들.filter((_, i) => 이름[i] === null);
  assert.deepEqual(못읽음, [], `select 목록에서 못 읽은 줄이 있다 — 파서가 낡았다:\n  ${못읽음.join('\n  ')}`);
  return 이름;
}

/* ── 반대방향 장부 — 안 내보내는 열마다 **사유**를 적는다 ─────────────
 * 여기 없는 열이 생기면 아래 ②가 빨개진다. 「몰라서 빠진 것」과 「정해서 뺀 것」을
 * 같은 모양으로 두지 않는다. */
const 제외사유 = {
  task_ref: '콘텐츠 참조 — 검수 화면에 자리가 없다',
  task_snapshot: '문항 판 **전문**은 안 연다 — 계약이 그 안에 **정답**을 두기로 했다(L0 §3-3). '
    + '과제 맥락은 필요한 키만 투영한다(`task_instruction`·`task_prompt` · 20260809050000)',
  task_schema_ver: '스냅샷 모양 판 — 화면에 자리가 없다',
  body_original: '작문 원문 — 오늘 화면은 음성이다. 쓰기 검수가 서는 날 판정한다(②-17 이 지목한 열)',
  image_refs: '이미지 업로드는 막다른 통로(절단문서 ③) — 화면에 자리가 없다',
  capture_meta: '기기·마이크 메타 — 검수 판단에 안 쓴다',
  redaction_ver: '비식별 검사 판 — 검수 판단에 안 쓴다',
  redaction_result: '🔴 **가려낸 식별자 자체**를 담는 칸 — 검수자에게 주면 비식별을 안 한 것보다 나쁘다',
  audio_deleted_at: '철회 표식 — 값 대신 **행 자체를 뺀다**(뷰의 where 절)',
  schema_ver: '행 판 — 화면에 자리가 없다',
  due_at: '마감 시각(c10) — 배정 행에만 있고 검수 대상은 학생 제출 행이라 늘 null 이다. 게다가 「늦게 냈다」가 보이면 교정 판정에 그 사정이 스며든다 — 검수자는 문장만 본다',
  due_ver: '마감 판본(c10) — 위와 같은 자리(집계용 판 이름이라 화면에 뜻이 없다)',
};

/* ── ① 허용 목록 그대로인가 ────────────────────────────────────────── */

const 기대뷰열 = [
  // 제출물 (c8)
  'submission_id',
  // 🔴 c8 이 뺐던 열 — 승격 멱등키가 원본 event_id 하나라, 판에 없으면 **직원 통로가
  //    원표를 직접 연다**(아래 ⑤ 가 막으려던 바로 그것). 20260809050000 이 판정을 뒤집었다.
  'event_id',
  'task_type', 'task_format', 'occurred_at',
  'audio_ref', 'audio_duration_sec',
  'transcript', 'transcript_verified', 'transcript_state',
  'stt_segments', 'stt_confidence', 'code_switch_spans',
  // 과제 맥락 (20260809050000) — 맥락 없는 라벨은 무효다. `task_snapshot` 전문은 안 연다.
  'task_instruction', 'task_prompt',
  // 검수자가 판정할 대상 = AI 교정. 접두 `ai_` 는 승인이 만드는 teacher 행과 안 겹치려는 것이다.
  'ai_correction_id', 'ai_corrected_text', 'ai_error_tags',
  'ai_explanation', 'ai_model', 'ai_prompt_ver',
  // 큐 순서의 첫 축 — `order by` 는 뷰가 아니라 읽는 쪽이 정한다.
  'is_audit_sample',
];

test('뷰가 내보내는 열이 허용 목록과 정확히 같다', () => {
  assert.deepEqual(뷰열(), 기대뷰열,
    '검수 판이 넓어졌거나 좁아졌다 — 넓어졌으면 개인정보가 한 칸 더 나가고, 좁아졌으면 화면이 빈다');
});

test('②-17 이 지목한 세 열은 뷰에 없다', () => {
  const 뷰 = new Set(뷰열());
  for (const 열 of ['body_original', 'task_snapshot', 'redaction_result']) {
    assert.ok(!뷰.has(열), `${열} 이 검수 판에 다시 실렸다 — ②-17 이 지목한 바로 그 열이다`);
  }
});

/* ── ② 판정 안 된 열이 없는가 (반대방향 장부) ──────────────────────── */

test('submissions 의 모든 열은 허용이거나 사유 붙은 제외다', () => {
  const 전부 = 제출물열();
  assert.ok(전부.length >= 20, `열을 ${전부.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  const 뷰 = new Set(뷰열());
  const 판정안됨 = 전부.filter((c) => !뷰.has(c) && !(c in 제외사유));
  assert.deepEqual(판정안됨, [],
    `검수자에게 줄지 말지 아무도 안 정한 열: ${판정안됨.join(', ')}\n` +
    '  → 뷰에 넣든지 `제외사유` 에 이유를 적든지 한다. 안 정하면 다음 사람이 통째로 열어 준다.');
  const 죽은사유 = Object.keys(제외사유).filter((c) => !전부.includes(c));
  assert.deepEqual(죽은사유, [],
    `없는 열의 제외 사유가 남아 있다: ${죽은사유.join(', ')} — 장부가 스키마보다 낡았다`);
});

/* ── ③ 옛 통로가 남아 있지 않은가 ──────────────────────────────────── */

test('넓은 옛 정책은 합본 끝에서 살아 있지 않다', () => {
  const 만듦 = 스키마.lastIndexOf('create policy inspector_queue_submissions');
  const 지움 = 스키마.lastIndexOf('drop policy if exists inspector_queue_submissions');
  assert.ok(만듦 !== -1, '옛 정책 흔적이 아예 없다 — 앵커가 낡았거나 조각이 사라졌다');
  assert.ok(지움 > 만듦,
    '`inspector_queue_submissions` 가 마지막에 살아 있다 — 뷰와 정책이 같이 서면 넓은 쪽이 이긴다');
});

/* 🔑 계수 이름은 **끝까지** 맞춰 본다 — `as 검수뷰` 로만 찾으면 `as 검수뷰_지움` 같은 개명이
 *   그대로 통과한다(변이 ⑦ 실측: 이 앵커가 없어 계수를 지운 판이 초록이었다). */
const 계수 = (이름) => new RegExp(`as ${이름}(?![\\w가-힣])`, 'u');

test('확인 쿼리가 뷰 유무와 옛 정책 유무를 **둘 다** 센다', () => {
  assert.match(확인, 계수('검수뷰'), '확인 쿼리가 뷰를 안 센다 — 안 선 것과 선 것이 같은 모양이다');
  assert.match(확인, 계수('옛검수정책'), '확인 쿼리가 옛 정책을 안 센다 — 남아도 초록이다');
  assert.match(확인, /검수뷰=1 and 옛검수정책=0/, '판정 조건에 두 칸이 안 걸려 있다');
  assert.match(확인, /select viewname from pg_views where schemaname='engine'/,
    '새는 권한 검사가 뷰를 안 본다 — pg_tables 에 뷰는 없다(등록층 구멍)');
});

/* ── ④ 뷰가 자기 소비자를 죽이지 않는가 ────────────────────────────── */

test('뷰에 역할 판정을 넣지 않았다 (service_role 은 auth.uid() 가 null 이다)', () => {
  const 몸 = 뷰정의();
  assert.ok(!/current_staff|auth\.uid/.test(몸),
    '뷰가 역할을 판정한다 — `service_role` 호출에서 0행이 되어 화면이 통째로 빈다.\n' +
    '  역할 확정은 L0 §4-5 ② 대로 Edge Function 이 `engine.staff` 에서 한다.');
  // 큐 조건 = 「AI 교정이 있나」. 20260809050000 부터 그 판정은 **join 하나**가 진다
  // (열들을 실어야 해서 join 이 필요해졌고, 옛 `in_review_queue` 호출을 같이 두면 같은
  //  판정이 두 곳에 적힌 것이라 언젠가 갈린다).
  assert.match(몸, /\n\s+join lateral \(/u,
    '큐 조건이 inner join 이 아니다 — left 면 AI 교정이 없는 제출물까지 큐에 실린다');
  assert.match(몸, /actor_kind = 'ai'/u, '큐 조건(AI 교정 있음)이 없다 — 큐 밖 제출물까지 전부 실린다');
  /* 🔴 소속 조건은 **둘**이다. `submissions` 는 배정 행(`task.assigned`)과 학생 제출 행을 함께
   *   들고, 배정 행은 `audio_ref`·`transcript` 가 없어 화면이 아무것도 못 그린다.
   *   2026-08-09 리허설 실측: 큐 19행이 **전부 배정 행**이었다(c8 부터 있던 구멍 · 20260809060000). */
  assert.match(몸, /e\.event_type = 'submission\.created'/u,
    '큐가 배정 행과 학생 제출 행을 안 가른다 — 배정 행은 음성도 전사도 없어 검수 화면이 빈다');
  /* 🔴 `status` 로 **소속을 정하지 않는다** — 그건 캐시고, 어긋나면 `corrections` 가 맞다(L0 §3).
   *   20260809050000 이 `= 'ai_processed'` 로 잡았다가 실측에서 물렸다: 그 칸을 쓰는 코드가
   *   저장소에 0곳이라 리허설 628건이 전부 `pending` 이었고 큐가 **0행**이 됐다(20260809055000).
   *   status 가 유일하게 권위 있는 것 = 「끝났다」 셋뿐이라, 그 셋만 뺀다. */
  assert.match(몸, /j\.status not in \('discarded', 'revoked', 'verified'\)/u,
    '큐가 끝난 상태 셋을 안 뺀다 — 폐기한 항목이 다음 조회에 되돌아온다(수용기준 17).\n' +
    '  🚫 `= <한 상태>` 로 좁히지 않는다: 그 칸의 생산자가 죽으면 큐가 통째로 빈다');
  assert.ok(!/j\.status\s*=\s*'/u.test(몸),
    '큐 소속을 `status` 한 값으로 정한다 — 생산자(n8n)가 상태 갱신 전에 죽으면 그 제출물은\n' +
    '  교정이 있는데도 **사람에게 영영 안 보이고 증상이 없다**(2026-08-09 실측으로 되돌린 자리)');
  assert.match(몸, /s\.audio_deleted_at is null/u,
    '철회분 필터가 없다 — 학생이 지운 음성의 전사가 사람에게 다시 간다');
  // 과제 맥락은 **키만** 투영한다 — 전문을 열면 계약이 거기 두기로 한 **정답**이 같이 나간다.
  assert.ok(!/s\.task_snapshot(?!->)/u.test(몸),
    '`task_snapshot` 을 통째로 싣는다 — 그 안에 정답이 있다(L0 §3-3). 키만 투영한다');
  // 배열이 아닌 스냅샷 하나가 **큐 전체**를 죽이지 않게 한다(jsonb_array_elements 는 런타임 오류).
  assert.match(몸, /jsonb_typeof\(s\.task_snapshot->'호흡'\) = 'array'/u,
    '스냅샷 모양 가드가 없다 — `호흡` 이 배열이 아닌 행 하나에 큐 조회가 통째로 실패한다');
});

test('확인 쿼리가 판이 **올라간 판인지**까지 센다', () => {
  assert.match(확인, 계수('검수판열'), '확인 쿼리가 판의 열 수를 안 센다 — 낡은 12열 판도 `검수뷰=1` 이라 초록이다');
  assert.match(확인, 계수('검수판원문'), '확인 쿼리가 ②-17 세 열을 안 센다 — 실려도 초록이다');
  const m = /검수판열=(\d+) and 검수판원문=0/u.exec(확인);
  assert.ok(m, '판정 조건에 두 칸이 안 걸려 있다 — 세기만 하고 안 보는 것은 확인이 아니다');
  // 🔑 기대 수를 두 곳에 적으면 갈라진다 — 뷰 정의에서 파생시켜 대조한다.
  assert.equal(Number(m[1]), 뷰열().length,
    '확인 쿼리의 기대 열 수가 뷰 정의와 갈렸다 — 정상 DB 가 ❌ 로 보고된다(같은 사고 실측 1회)');
});

/* ── ⑤ 직원 통로가 base table 을 직접 읽지 않는가 ──────────────────── */

const 위험한열 = Object.keys(제외사유).filter((c) => c !== 'audio_deleted_at');

const 직원표식 = /engine\.staff\b|current_staff\s*\(|staff_access_log/;

/* 🔴 이 검사는 **파일 하나를 한 덩어리 문자열**로 봤다. 그래서 세 가지를 뭉갰다
 *   (F277 · 2026-08-09 실측 — `deliver` 를 직원 통로로 잡아 talk 배포 게이트가 이틀 막혔다):
 *     ① 주석·타입 선언의 열 이름을 **읽는 코드**로 셌다 — 지목된 6열 중 `due_at`·`due_ver` 는
 *        c10 을 설명하는 주석에만, `task_ref` 는 TS 인터페이스 선언에도 있었다.
 *     ② `insert` 의 열 목록을 **읽는다**로 셌다 — 배정 행을 **적는** 자리다.
 *     ③ 권한 게이트가 있다고 파일 전체를 직원 통로로 봤다 — `deliver` 에서 원장이 닿는
 *        경로(`점검하기`)는 submissions 를 한 번도 안 읽는다(집계 3개뿐).
 *   셋 다 새는 방향이 **거짓양성**이라 조용하지 않았지만, 위반 아닌 것을 막는 가드는
 *   낱말 회피를 정상 통로로 만든다(F272 가 같은 병을 C0 계약 검사에서 신고했다). */

/** 주석을 지운다 — 주석에 적힌 열 이름은 읽는 코드가 아니다(위 ①).
 *  통로는 공용 하나다(F401): 문자열 속 `//`(URL 포함)는 공용 통로가 렉서로 지킨다 —
 *  옛 지역 사본의 `[^:]` 어림법은 `a://` 만 막고 `'// 참고'` 는 못 지켰다. */
const 주석없이 = 코드만;

/** 🔑 **SQL 주석은 층이 다르다 — 공용 통로가 못 지고, 져서도 안 된다.**
 *  공용 `코드만` 은 템플릿 리터럴 «안»을 안 건드린다. JS 에서 그건 주석이 아니라 **값**이기
 *  때문이고, 그게 옳다. 그런데 이 파일이 재는 것은 그 값 «안의 SQL» 이고 거기선 `/* *​/`·`--`
 *  가 진짜 주석이다. 그래서 여기서 한 겹 더 벗긴다 — 언어가 달라 «합치는 대상이 아니다»
 *  (`tools/가드계수.js` 가 SQL 사본을 따로 세는 이유가 이것이다).
 *  ⚠ 옛 판은 이 두 층을 정규식 한 방으로 뭉갰다: 그래서 문자열 속 `//` 까지 먹었다(F401). */
const SQL주석없이 = (q) => q.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

/** sql 템플릿 리터럴 **안쪽만** — TS 타입 선언은 쿼리가 아니다(위 ①).
 *  이 저장소는 sql 리터럴 안에 백틱을 쓰지 않는다(`deliver/index.ts:173` 이 그 규약을 못박는다). */
function 쿼리들(조각) {
  return [...주석없이(조각).matchAll(/sql`([^`]*)`/g)].map((m) => SQL주석없이(m[1]));
}

/* ②(쓰기를 읽기로 세는 것)에는 **따로 붙일 코드가 없다.** `from|join engine.submissions` 조건이
 * 이미 가른다 — `insert … values` 에는 그 절이 없고, `insert … select` 에는 있어 그대로 잡힌다.
 * 실측(2026-08-09): 그 자리에 `읽기부분()` 이라는 함수를 한 벌 두었는데 변이 시험이
 * 「아무도 안 잡는다」로 드러냈다. 하는 일이 없는 코드는 **잘못 고칠 여지만** 만들어서 지웠다
 * (그 함수를 망가뜨리는 변이는 `insert … select` 탐지를 통째로 껐다). 아래 두 픽스처가 그 자리를 진다. */

/** 톱레벨 함수 단위로 자른다 (위 ③) — 함수 앞의 JSDoc 은 앞 조각에 붙지만 `주석없이` 가 지운다.
 *  ⚠ **좁히는 방향이라 미탐이 생긴다** — 직원 확인을 A 함수에서 하고 원표를 B 함수에서 읽으면
 *    이 검사는 못 본다. 그 자리는 1차 방어선이 진다: 검수 판은 뷰 하나뿐이고(①②),
 *    원표를 여는 `inspector_queue_submissions` 정책이 살아 있으면 ③ 이 잡는다.
 *    여기(⑤)는 코드 층의 2차 방어선이지 유일한 방어선이 아니다. */
function 스코프들(본문) {
  const 자리 = [...본문.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+/gm)].map((m) => m.index);
  if (!자리.length) return [본문];
  const 조각 = [본문.slice(0, 자리[0])];
  자리.forEach((v, i) => 조각.push(본문.slice(v, 자리[i + 1] ?? 본문.length)));
  return 조각.filter((s) => s.trim());
}

/** 한 파일이 「직원 통로인데 submissions 를 직접 읽는다」인지 — 사유는 문자열로 돌려준다. */
function 직접읽기(본문) {
  const 실린것 = new Set();
  for (const 조각 of 스코프들(본문)) {
    if (!직원표식.test(주석없이(조각))) continue;
    for (const q of 쿼리들(조각)) {
      if (!/(from|join)\s+engine\.submissions\b/.test(q)) continue;
      for (const c of 위험한열) if (new RegExp(`\\bs?\\.?${c}\\b`).test(q)) 실린것.add(c);
    }
  }
  return 실린것.size ? `직원 통로가 submissions 에서 직접 읽는다: ${[...실린것].join(', ')}` : null;
}

test('탐지력 픽스처 — 직원 통로가 원문을 직접 퍼가면 잡는다', () => {
  const 나쁜것 = `
    const 직원 = await sql\`select role from engine.staff where auth_user_id = \${주체}\`;
    const 큐 = await sql\`select s.submission_id, s.body_original, s.task_snapshot
                            from engine.submissions s\`;`;
  assert.match(String(직접읽기(나쁜것)), /body_original/, '픽스처를 못 잡는다 — 이 검사는 아무것도 안 막는다');

  const 좋은것 = `
    const 직원 = await sql\`select role from engine.staff where auth_user_id = \${주체}\`;
    const 큐 = await sql\`select submission_id, audio_ref, transcript from engine.review_queue\`;`;
  assert.equal(직접읽기(좋은것), null, '뷰를 쓰는 정상 통로를 거짓양성으로 잡는다');

  const 학생것 = 'const r = await sql`select s.body_original from engine.submissions s`;';
  assert.equal(직접읽기(학생것), null, '직원 통로가 아닌 곳까지 잡는다 — 학생 통로는 이 검사 밖이다');
});

/* F277 이 실제로 밟은 세 모양. 실물(`deliver/index.ts`)에서 그대로 뽑았다 — 픽스처가 실사용과
 * 갈라지면 이 검사는 다시 자기 눈이 먼 자리를 못 본다. */
test('거짓양성 픽스처 — 주석·insert 열 목록·딴 함수는 「읽는다」가 아니다 (F277)', () => {
  /* ⚠ 함수 선언을 **줄머리**에 둔다 — 실물 Edge Function 이 그 모양이고, 스코프 앵커도 줄머리다.
   *   들여써서 쓰면 조각이 안 갈리고, 그러면 이 픽스처들은 「스코프 자르기」를 한 번도 안 시험한
   *   채 초록이 된다(첫 판이 실제로 그렇게 빨갛게 났다). */
  /* 🔑 세 축을 **한 모양에 섞지 않는다.** 섞으면 앞 축(스코프)이 먼저 걸러 뒤 축(주석·insert)은
   *   한 번도 실행되지 않고, 그 픽스처는 자기가 아무것도 안 시험한다는 사실을 못 말한다
   *   (첫 판이 실제로 그랬다 — 변이 ①②가 「아무도 안 잡는다」로 드러냈다).
   *   그래서 아래 셋은 각각 **자기 축만 남기고** 나머지 축은 통과하도록 짰다. */
  const 주석만 = `
async function 검수큐() {
  const [직원] = await sql\`select role from engine.staff\`;
  return await sql\`select s.submission_id
    /* body_original 은 뷰에서 뺐다(②-17) — 여기선 안 읽는다 */
    from engine.submissions s\`; }`;
  assert.equal(직접읽기(주석만), null,
    '쿼리 **안의 주석**에 적힌 열 이름을 읽는 코드로 센다 — 산문을 값으로 세면 낱말 회피가 정상 통로가 된다');

  const 쓰기만 = `
async function 승격() {
  const [직원] = await sql\`select role from engine.staff\`;
  await sql\`insert into engine.submissions (event_id, task_ref, task_snapshot, due_at, due_ver)
             values (\${e}::uuid, \${r}, \${s}, \${d}, 1)\`; }`;
  assert.equal(직접읽기(쓰기만), null,
    'insert 의 열 목록을 「읽는다」로 센다 — 적는 자리와 읽는 자리는 반대 사건이다');

  const 딴함수 = `
async function 원장인가(req) { return await sql\`select role from engine.current_staff()\`; }
async function 배달하기() {
  return await sql\`select e.occurred_at, s.task_snapshot from engine.learning_events e
                     join engine.submissions s on s.event_id = e.event_id\`; }`;
  assert.equal(직접읽기(딴함수), null,
    '권한 게이트가 있다고 파일 전체를 직원 통로로 센다 — 원장이 닿는 경로와 service_role 경로가 뭉개진다');
});

/* 위 셋은 전부 **좁히는** 수리다. 좁힘마다 그것을 우회하는 모양을 여기서 못박는다 —
 * 안 그러면 「거짓양성이 사라졌다」와 「아무것도 안 막는다」가 같은 초록이 된다. */
test('탐지력 — 좁힌 세 축을 우회하는 모양은 그대로 잡는다', () => {
  const insert_select = `
async function 검수큐() {
  const [직원] = await sql\`select role from engine.staff where auth_user_id = \${주체}\`;
  await sql\`insert into engine.review_export (t) select s.body_original from engine.submissions s\`; }`;
  assert.match(String(직접읽기(insert_select)), /body_original/,
    'insert 를 통째로 건너뛴다 — `insert … select` 는 읽기가 섞인 자리다');

  const 같은함수 = `
async function 검수큐() {
  const [직원] = await sql\`select role from engine.current_staff()\`;
  return await sql\`select s.body_original, s.redaction_result from engine.submissions s\`; }`;
  assert.match(String(직접읽기(같은함수)), /body_original/,
    '직원 게이트와 원표 읽기가 **같은 함수**에 있는데도 못 본다 — 스코프 자르기가 너무 넓다');

  const 함수없음 = `
    const [직원] = await sql\`select role from engine.staff\`;
    const 큐 = await sql\`select s.capture_meta from engine.submissions s\`;`;
  assert.match(String(직접읽기(함수없음)), /capture_meta/,
    '톱레벨 코드(함수 경계 0)를 통째로 놓친다 — 조각이 하나뿐인 자리다');

  /* 🔑 스코프 앵커가 **줄머리**인 이유를 못박는다. `^\\s*` 로 넓히면 중첩 함수가 바깥에서
   *   잘려 나가고, 그러면 바깥의 직원 게이트와 안쪽의 원표 읽기가 서로를 못 본다 —
   *   중첩 함수는 바깥 스코프를 그대로 쓰므로 **같은 통로**다. */
  const 중첩함수 = `
async function 검수큐() {
  const [직원] = await sql\`select role from engine.staff\`;
  async function 안쪽() { return await sql\`select s.body_original from engine.submissions s\`; }
  return 안쪽(); }`;
  assert.match(String(직접읽기(중첩함수)), /body_original/,
    '중첩 함수를 딴 스코프로 센다 — 앵커가 줄머리가 아니면 바깥 게이트와 안쪽 읽기가 갈린다');
});

test('실저장소 — 오늘 직원 통로는 원문을 직접 안 읽는다', (t) => {
  const 파일들 = fs.existsSync(함수들)
    ? fs.readdirSync(함수들).map((d) => path.join(함수들, d, 'index.ts')).filter((p) => fs.existsSync(p))
    : [];
  assert.ok(파일들.length >= 5, `Edge Function 을 ${파일들.length}개밖에 못 찾았다 — 경로가 낡았다`);
  const 직원파일 = 파일들.filter((p) => /engine\.staff\b|current_staff\s*\(|staff_access_log/
    .test(fs.readFileSync(p, 'utf8')));
  if (직원파일.length === 0) {
    // 통과와 미실행이 같은 모양이면 안 된다 — 검수 Fn 이 서는 날 이 skip 이 사라진다.
    t.skip('검수(직원) Edge Function 이 아직 0개 — 탐지력은 위 픽스처가 진다');
    return;
  }
  const 걸린것 = 직원파일
    .map((p) => ({ p, 왜: 직접읽기(fs.readFileSync(p, 'utf8')) }))
    .filter((x) => x.왜);
  assert.deepEqual(걸린것, [],
    걸린것.map((x) => `${path.basename(path.dirname(x.p))}: ${x.왜}`).join('\n') +
    '\n  → `engine.review_queue` 를 읽어라. 그 판에 없는 열이 정말 필요하면 뷰와 이 검사를 같이 고친다.');
});

/* ── ⑥ 반 모드 판 `review_queue_class` (20260814100000 · 검수_내부계약 §3-2) ──
 * 기본 판이 좁혀 둔 것을 파생 판이 도로 여는 방향이 이 판의 새는 길이다. 그래서
 * ①기본 판「에서」 파생하는가(원표에서 다시 시작하면 22열 밖이 딸려 온다)
 * ②더하는 열이 정체 4열 **정확히 그것뿐**인가 를 판 정의 텍스트로 못박는다. */

/** 살아 있는 반 판 정의 — 기본 판과 같은 이유로 **마지막** 것이다. */
function 반뷰정의() {
  const 전부 = [...스키마.matchAll(/create (?:or replace )?view engine\.review_queue_class as([\s\S]*?);\n/g)];
  assert.ok(전부.length, 'engine.review_queue_class 뷰를 합본에서 못 찾았다 — 조각이 안 실렸다');
  return 전부[전부.length - 1][1];
}

test('반 판은 기본 판에서 파생한다 — 원표에서 다시 시작하면 좁힘이 무효다', () => {
  const 몸 = 반뷰정의();
  assert.match(몸, /from engine\.review_queue\s+v/u,
    '반 판이 review_queue 를 안 지난다 — 원표에서 시작하면 22열 밖(원문 셋 포함)이 딸려 온다');
  assert.ok(!/from engine\.submissions|join engine\.submissions/u.test(몸),
    '반 판이 submissions 원표를 직접 읽는다 — 기본 판의 허용 목록이 우회된다');
});

test('반 판이 더 여는 것은 정체 4열뿐이다 — 이름·조·좌석·반, 그 이상은 판정 없이 못 나간다', () => {
  const 몸 = 반뷰정의();
  /* 🔑 세는 것은 **select 목록**이다 — 조인 조건(`on l.learner_id = e.learner_id`)의 참조까지
   *   세면 다리 자체가 위반으로 잡혀 거짓 적색이 된다(내보내는 것과 지나가는 것은 다르다). */
  const 셀렉트 = 몸.slice(0, 몸.indexOf('from engine.review_queue'));
  const 더한열 = [...셀렉트.matchAll(/l\.([\w가-힣]+)/gu)].map((m) => m[1]);
  assert.deepEqual([...new Set(더한열)].sort(), ['class_id', 'display_name', 'group_no', 'seat_no'],
    '반 판이 learners 에서 정체 4열 밖을 실었다 — student_code·contact 가 이 길로 새면 조용하다');
  assert.ok(!/e\.[\w가-힣]+/u.test(셀렉트),
    '반 판이 learning_events 의 열을 실었다 — 그 표는 조인 다리로만 쓴다');
  for (const 열 of ['body_original', 'task_snapshot', 'redaction_result']) {
    assert.ok(!몸.includes(열), `${열} 이 반 판에 실렸다 — 기본 판이 뺀 바로 그 열이다`);
  }
  assert.ok(!/current_staff|auth\.uid/.test(몸),
    '반 판이 역할을 판정한다 — service_role 호출에서 0행이 되어 화면이 통째로 빈다');
});

test('확인 쿼리가 반 판을 **수로** 센다 — 「덜 넓힌 판」과 「안 선 판」은 존재 검사에서 같은 모양이다', () => {
  assert.match(확인, 계수('반검수뷰'), '확인 쿼리가 반 판 유무를 안 센다');
  assert.match(확인, 계수('반검수판열'), '확인 쿼리가 반 판 열 수를 안 센다');
  assert.match(확인, 계수('반검수판원문'), '확인 쿼리가 반 판의 원문 열을 안 센다');
  assert.match(확인, /반검수뷰=1 and 반검수판열=26 and 반검수판원문=0/,
    '판정 조건에 반 판 세 칸이 안 걸려 있다');
});
