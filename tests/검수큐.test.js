/* 검수자가 무엇을 읽는가 — `engine.review_queue` 가 정본이다 (절단문서 ②-17).
 *
 * ■ 무엇이 열려 있었나
 *   `inspector_queue_submissions` 정책이 큐에 든 제출물의 **행 전체**를 열었다. RLS 는 행
 *   단위라 열을 못 좁힌다 — `learners` 를 안 열어 `display_name` 을 가려 놓고도
 *   `body_original`·`task_snapshot`·`redaction_result` 가 같이 나갔다. 그런데 검수 대시보드는
 *   `service_role` Edge Function 뒤에 서고 그 역할은 **RLS 를 우회한다.** 즉 정책을 아무리
 *   좁혀도 진짜 통로는 안 좁혀진다(②-15 와 같은 자리). 좁히는 자리를 판(뷰)으로 옮겼다.
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

/** 뷰가 실제로 내보내는 열 — 정본은 이 select 문 하나다. */
function 뷰열() {
  const m = /create or replace view engine\.review_queue as([\s\S]*?);\n/.exec(스키마);
  assert.ok(m, 'engine.review_queue 뷰를 합본에서 못 찾았다 — 조각이 안 실렸다');
  const 몸 = m[1];
  const 셀렉트 = 몸.slice(0, 몸.indexOf('from engine.submissions'));
  return [...셀렉트.matchAll(/\bs\.(\w+)/g)].map((x) => x[1]);
}

/* ── 반대방향 장부 — 안 내보내는 열마다 **사유**를 적는다 ─────────────
 * 여기 없는 열이 생기면 아래 ②가 빨개진다. 「몰라서 빠진 것」과 「정해서 뺀 것」을
 * 같은 모양으로 두지 않는다. */
const 제외사유 = {
  event_id: '학생 사건 줄 전체로 가는 지렛대 — 화면은 submission_id 로 돈다',
  task_ref: '콘텐츠 참조 — 검수 화면에 자리가 없다',
  task_snapshot: '문항 판 전문 — 오늘 화면은 음성이다. 쓰기·번역 검수가 서는 날 판정한다',
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
  'submission_id', 'task_type', 'task_format', 'occurred_at',
  'audio_ref', 'audio_duration_sec',
  'transcript', 'transcript_verified', 'transcript_state',
  'stt_segments', 'stt_confidence', 'code_switch_spans',
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

test('확인 쿼리가 뷰 유무와 옛 정책 유무를 **둘 다** 센다', () => {
  assert.match(확인, /as 검수뷰/, '확인 쿼리가 뷰를 안 센다 — 안 선 것과 선 것이 같은 모양이다');
  assert.match(확인, /as 옛검수정책/, '확인 쿼리가 옛 정책을 안 센다 — 남아도 초록이다');
  assert.match(확인, /검수뷰=1 and 옛검수정책=0/, '판정 조건에 두 칸이 안 걸려 있다');
  assert.match(확인, /select viewname from pg_views where schemaname='engine'/,
    '새는 권한 검사가 뷰를 안 본다 — pg_tables 에 뷰는 없다(등록층 구멍)');
});

/* ── ④ 뷰가 자기 소비자를 죽이지 않는가 ────────────────────────────── */

test('뷰에 역할 판정을 넣지 않았다 (service_role 은 auth.uid() 가 null 이다)', () => {
  const m = /create or replace view engine\.review_queue as([\s\S]*?);\n/.exec(스키마);
  assert.ok(!/current_staff|auth\.uid/.test(m[1]),
    '뷰가 역할을 판정한다 — `service_role` 호출에서 0행이 되어 화면이 통째로 빈다.\n' +
    '  역할 확정은 L0 §4-5 ② 대로 Edge Function 이 `engine.staff` 에서 한다.');
  assert.match(m[1], /engine\.in_review_queue\(s\.submission_id\)/,
    '큐 조건이 없다 — 큐 밖 제출물까지 전부 실린다');
  assert.match(m[1], /s\.audio_deleted_at is null/,
    '철회분 필터가 없다 — 학생이 지운 음성의 전사가 사람에게 다시 간다');
});

/* ── ⑤ 직원 통로가 base table 을 직접 읽지 않는가 ──────────────────── */

const 위험한열 = Object.keys(제외사유).filter((c) => c !== 'audio_deleted_at');

/** 한 파일이 「직원 통로인데 submissions 를 직접 읽는다」인지 — 사유는 문자열로 돌려준다. */
function 직접읽기(본문) {
  const 직원통로 = /engine\.staff\b|current_staff\s*\(|staff_access_log/.test(본문);
  if (!직원통로) return null;
  if (!/(from|join)\s+engine\.submissions\b/.test(본문)) return null;
  const 실린것 = 위험한열.filter((c) => new RegExp(`\\bs?\\.?${c}\\b`).test(본문));
  return 실린것.length ? `직원 통로가 submissions 에서 직접 읽는다: ${실린것.join(', ')}` : null;
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
