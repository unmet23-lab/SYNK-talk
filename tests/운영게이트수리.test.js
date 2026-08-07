/**
 * 운영 배포 전 차단 4의 회귀 — 유호님 확정 2026-08-07 (근거 = sol C0·L0 심문 P0).
 *
 * 넷 다 **소급 불가**다: 운영에 실학생 행이 쌓이기 시작하면 고쳐도 과거가 복구되지 않는다.
 *   ① 철회 후 수집 0건 — events 동의 게이트가 now() 기준으로도 본다 + 업로드 서명 수명 축소
 *   ② 원문 불변 확대 — 선언(「최대 소급 불가」)과 자물쇠(reject_original_overwrite)의 범위 일치
 *   ③ 동의 귀속 — consent_id 열 + 세 쓰기 통로(events·deliver·철회 절차) 전부 스탬프
 *   ④ 수집→처리 배선 — submissions insert 가 같은 트랜잭션에서 pipeline_jobs 행을 만든다
 *
 * DB 왕복 증명은 tools/왕복시험.js ⑨~⑫가 진다. 여기는 **원문이 그 장치를 계속 들고 있는지**를
 * CI 층에서 잰다 — 장치가 코드에서 조용히 사라지는 것과 통과가 같은 모양이 되지 않게.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 읽기 = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const 조각 = 읽기('supabase', 'migrations', '20260807120000_engine_c8.sql');
const EVENTS = 읽기('supabase', 'functions', 'events', 'index.ts');
const DELIVER = 읽기('supabase', 'functions', 'deliver', 'index.ts');
const UPLOADS = 읽기('supabase', 'functions', 'uploads', 'index.ts');
const L0 = 읽기('docs', 'L0_데이터계약.md');

test('① 철회 후 수집 0건 — events 동의 게이트가 now() 기준으로도 본다', () => {
  assert.match(EVENTS, /revoked_at > now\(\)/,
    'events 의 동의 질의에서 now() 검사가 사라졌다 — 철회 뒤 과거 시각 주장으로 수집이 된다(sol P0)');
});

test('① 서명 꼬리 — 업로드 서명 수명이 철회 창을 넓히지 않는다(≤15분)', () => {
  const m = UPLOADS.match(/const 서명수명초 = (\d+);/);
  assert.ok(m, 'uploads 에서 서명수명초 상수를 못 찾았다 — 이름을 바꿨으면 이 검사도 옮겨라');
  assert.ok(Number(m[1]) <= 900,
    `서명 수명이 ${m[1]}초다 — 철회 뒤에도 그 시간만큼 업로드가 산다(sol P0 · L0 §9-3-2 「서명 꼬리」 문구도 함께 갱신하라)`);
});

test('② 원문 불변 확대 — 선언된 소급 불가 칸이 전부 자물쇠 안이다', () => {
  const 본문 = 조각.slice(조각.indexOf('reject_original_overwrite'));
  for (const 칸 of ['task_snapshot', 'audio_ref', 'image_refs', 'capture_meta', 'transcript_verified']) {
    assert.match(본문, new RegExp(`if OLD\\.${칸} is not null and NEW\\.${칸} is distinct from OLD\\.${칸}`),
      `${칸} 이 자물쇠 밖이다 — 「불변」 선언이 다시 거짓이 된다(sol P0)`);
  }
  assert.match(본문, /if NEW\.occurred_at is distinct from OLD\.occurred_at/,
    'occurred_at 전면 차단이 사라졌다');
});

test('③ 동의 귀속 — consent_id 열이 서고, 세 쓰기 통로가 전부 스탬프한다', () => {
  assert.match(조각, /add column if not exists consent_id uuid references engine\.consents/,
    '조각에서 consent_id 열이 사라졌다');
  /* 🔴 이웃이 아니라 **소속**을 잰다. 초판은 `consent_id, consent_ver, payload` 라는 인접 문구였는데,
   *   그 사이에 상관없는 열 하나(source_kind · 절단문서 ①-7)가 끼자 consent_id 는 멀쩡한데 빨개졌다.
   *   앵커는 문구가 바뀌면 죽고, 죽은 앵커를 고치는 사람은 「그럼 지우자」로 가기 쉽다. */
  const 열 = EVENTS.match(/insert into engine\.learning_events \(([^)]+)\)/);
  assert.ok(열, 'events 의 learning_events INSERT 열 목록을 못 찾았다 — 앵커가 낡았다(그러면 이 검사는 무엇이든 통과시킨다)');
  assert.ok(열[1].split(',').map((s) => s.trim()).includes('consent_id'),
    'events insert 열 목록에 consent_id 가 없다');
  assert.match(EVENTS, /동의\[0\]\.consent_id/, 'events 가 consent_id 값을 안 싣는다');
  assert.match(DELIVER, /공통\.consent_id/, 'deliver 가 consent_id 값을 안 싣는다');
  const m = L0.match(/insert into engine\.learning_events\s*\n\s*\(([^)]+)\)/);
  assert.ok(m, 'L0 §9-3-2 의 철회 insert 를 못 찾았다');
  assert.ok(m[1].split(',').map((s) => s.trim()).includes('consent_id'),
    '철회 절차가 consent_id 를 안 싣는다 — 어느 동의를 철회했는지 증명할 수 없다(sol P0)');
});

test('③b 동의 증거 보호 — consents_protect 가 개서·삭제·철회 되돌림을 막는다', () => {
  assert.match(조각, /create trigger consents_protect before update or delete on engine\.consents/,
    'consents_protect 트리거가 조각에서 사라졌다');
  assert.match(조각, /철회는 되돌리지 않는다/, '철회 되돌림 차단이 사라졌다');
});

test('④ 수집→처리 배선 — 트리거 + 기존 행 backfill + 사후 확인의 고아 검사', () => {
  assert.match(조각, /create trigger submissions_enqueue_job after insert on engine\.submissions/,
    'submissions_enqueue_job 트리거가 사라졌다 — 제출이 다시 처리 고아가 된다');
  assert.match(조각, /insert into engine\.pipeline_jobs \(submission_id\)\s*\n\s*select submission_id from engine\.submissions/,
    'backfill 이 사라졌다 — 이미 선 제출이 영구 고아로 남는다');
  assert.match(조각, /잡없는제출/, '사후 확인에서 고아 검사(잡없는제출=0)가 사라졌다');
});

/* 탐지력 — 실저장소가 깨끗한 것과 검사가 도는 것은 다르다(CLAUDE.md 가드 맹점 ②).
 * ③ 이 쓰는 바로 그 추출기를, consent_id 가 빠진 구판 문자열로 확인한다. */
test('탐지력 픽스처 — 철회 insert 에서 consent_id 가 빠지면 실제로 잡는다', () => {
  const 구판 = '     insert into engine.learning_events\n       (learner_id, event_type, occurred_at, idempotency_key, consent_ver, schema_ver)';
  const m = 구판.match(/insert into engine\.learning_events\s*\n\s*\(([^)]+)\)/);
  assert.ok(m && !m[1].split(',').map((s) => s.trim()).includes('consent_id'),
    '추출기가 죽었다 — 그러면 위 ③ 검사는 구판도 통과시킨다');
});
