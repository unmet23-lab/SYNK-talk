/**
 * 철회 경로 회귀 — 동의문의 「보관 중인 녹음을 모두 삭제」를 **실행 가능한 상태로** 유지한다.
 *
 * 왜 있나 (2026-08-06 실측) — C0 §4-2 초안의 업로드 예시가 `voice/2026/08/3c9e….wav`,
 *   즉 **날짜 분할**이었다. 그대로 구현됐으면 한 학생의 녹음이 모든 달 폴더에 흩어져
 *   유호님이 손으로 지울 수 없고, 그 사실은 **첫 철회 요청이 오는 날에야** 드러난다.
 *   그때는 이미 쌓인 파일이 규칙을 고쳐도 안 옮겨진다 — 소급 불가라 문서 합의로는 안 지켜진다.
 *
 * 두 가지를 진다:
 *   ① 구현자가 복사하는 **예시 경로**가 learner 프리픽스다 (C0 §4-2 ↔ L0 §9-3-1 합치)
 *   ② 유호님이 붙여넣는 **철회 SQL**이 스키마의 NOT NULL 열을 하나도 안 빠뜨린다
 *      — 열이 늘면 붙여넣기가 오류로 죽는데, 그건 철회를 요청받은 날 처음 안다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const 읽기 = (...조각) => fs.readFileSync(path.join(ROOT, ...조각), 'utf8');

const C0 = 읽기('docs', 'C0_API계약.md');
const L0 = 읽기('docs', 'L0_데이터계약.md');
const SQL = 읽기('supabase', 'L0_스키마.sql');

/* 구현자가 실제로 복사하는 자리 = 응답 예시의 `audio_ref` 값. 산문 규칙이 아니라 이것을 본다
 * (산문은 맞는데 예시가 틀린 것이 실제로 일어난 형태다). */
function 예시경로_(문서) {
  const m = 문서.match(/"audio_ref"\s*:\s*"([^"]+)"/);
  assert.ok(m, 'C0 에서 audio_ref 예시를 못 찾았다 — 예시가 사라졌다면 이 검사는 아무것도 안 지킨다');
  return m[1];
}

test('업로드 예시 경로가 learner 프리픽스다 (날짜 분할이면 손 삭제가 불가능하다)', () => {
  const 칸 = 예시경로_(C0).split('/');
  assert.ok(칸.length >= 3, `경로가 너무 얕다: ${칸.join('/')} — 학생 폴더가 없다`);
  assert.match(칸[0], /^(voice|image)$/, `첫 칸이 voice·image 가 아니다: ${칸[0]}`);
  assert.ok(칸[1].includes('learner_id'),
    `둘째 칸이 learner_id 가 아니다: "${칸[1]}"\n` +
    '  학생 단위로 안 모이면 철회 요청 날 폴더 하나를 지우는 것으로 안 끝난다(동의문 §57).');
  assert.ok(!/^\d{4}$/.test(칸[1]), '둘째 칸이 연도다 — 날짜 분할이 되살아났다');
});

test('L0 §9-3-1 이 같은 규칙을 정본으로 적는다 (두 문서가 갈라지면 구현자가 고른다)', () => {
  assert.ok(L0.includes('{voice|image}/{learner_id}/{uuid}'),
    'L0 §9-3-1 의 경로 규칙 문장이 사라지거나 바뀌었다 — C0 예시만 남으면 정본이 예시가 된다');
});

test('탐지력 픽스처 — 날짜 분할 예시가 되살아나면 잡는다', () => {
  /* 실저장소가 깨끗한 것과 검사가 도는 것은 다르다. 위 검사가 쓰는 바로 그 추출을 픽스처로 확인한다. */
  const 되살아난판 = '응답 { "audio_ref": "voice/2026/08/3c9e….wav" }';
  const 칸 = 예시경로_(되살아난판).split('/');
  assert.ok(!칸[1].includes('learner_id') && /^\d{4}$/.test(칸[1]),
    '추출기가 죽었다 — 그러면 위 검사는 날짜 분할도 통과시킨다');
});

/* ── ② 철회 SQL ↔ 스키마 ──────────────────────────────────────────────────
 * 유호님이 붙여넣는 한 문장이라, 열이 하나 늘면 **그날 오류로 죽는다.**
 * 실제로 초안이 idempotency_key·consent_ver 를 빠뜨렸다(2026-08-06 · 이 검사가 그것을 못박는다). */
function NOT_NULL_기본값없는열_(테이블) {
  const i = SQL.indexOf(`create table if not exists engine.${테이블} (`);
  assert.notEqual(i, -1, `스키마에서 ${테이블} 을 못 찾았다 — 이름이 바뀌었다면 이 테스트도 함께 옮겨라`);
  const 본문 = SQL.slice(i, SQL.indexOf('\n);', i));
  return 본문.split('\n')
    .map((줄) => 줄.replace(/--.*$/, '').trim())
    .filter((줄) => /^\w+\s+/.test(줄) && !/^(constraint|unique|primary|foreign|check)\b/i.test(줄))
    .filter((줄) => /\bnot null\b/i.test(줄) && !/\bdefault\b/i.test(줄))
    .map((줄) => 줄.split(/\s+/)[0]);
}

test('철회 절차의 insert 가 learning_events 의 NOT NULL 열을 전부 채운다', () => {
  const 필수 = NOT_NULL_기본값없는열_('learning_events');
  assert.ok(필수.includes('idempotency_key') && 필수.includes('consent_ver'),
    `추출기가 낡았다 — 필수 열을 ${필수.length}개밖에 못 찾았다: ${필수.join(', ')}`);

  const m = L0.match(/insert into engine\.learning_events\s*\n\s*\(([^)]+)\)/);
  assert.ok(m, 'L0 §9-3-2 의 철회 insert 를 못 찾았다 — 절차가 사라졌거나 모양이 바뀌었다');
  const 적힌열 = m[1].split(',').map((s) => s.trim());

  const 빠진것 = 필수.filter((열) => !적힌열.includes(열));
  assert.deepEqual(빠진것, [],
    `철회 SQL 이 NOT NULL 열을 빠뜨렸다: ${빠진것.join(', ')}\n` +
    '  유호님이 붙여넣는 순간 오류로 죽는다 — 그것을 철회 요청받은 날 처음 알게 된다.\n' +
    `  L0 §9-3-2 의 insert 열 목록에 추가하고, values 쪽도 같은 개수로 맞춰라(현재 ${적힌열.length}개).`);
});

/* 치환을 잊었을 때 **아무 일도 안 일어나야** 한다.
 * 초판은 예시로 `'SYNK-001'` 을 적었는데 그건 1번 학생의 진짜 코드다 — 그대로 돌리면
 * 엉뚱한 학생의 동의가 철회된다. 실패는 안전한 쪽(0행)으로 떨어져야 한다. */
test('철회 절차의 학생 코드가 실재할 수 없는 자리표시자다', () => {
  const 절 = L0.slice(L0.indexOf('#### 9-3-2.'), L0.indexOf('### 9-4.'));
  const 값들 = [...절.matchAll(/student_code\s*=\s*'([^']*)'/g)].map((m) => m[1]);
  assert.ok(값들.length >= 2, `철회 절차에서 student_code 리터럴을 ${값들.length}개밖에 못 찾았다 — 절차가 바뀌었다`);
  const 실재가능 = 값들.filter((v) => !v.includes('@@'));
  assert.deepEqual(실재가능, [],
    `치환을 잊으면 진짜 학생에게 맞는 값이 적혀 있다: ${실재가능.join(', ')}\n` +
    '  자리표시자는 실재할 수 없는 형태여야 한다(@@…@@) — 그래야 잊었을 때 0행으로 끝난다.');
});

test('탐지력 픽스처 — 진짜 학생 코드가 절차에 되살아나면 잡는다', () => {
  const 되살아난판 = "where student_code = 'SYNK-001'";
  const 값 = [...되살아난판.matchAll(/student_code\s*=\s*'([^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(값.filter((v) => !v.includes('@@')), ['SYNK-001'],
    '추출기가 죽었다 — 그러면 위 검사는 진짜 코드도 통과시킨다');
});

test('철회 절차가 두 번 Run 해도 안전하다고 적힌 형태를 유지한다', () => {
  const 블록 = L0.slice(L0.indexOf('insert into engine.learning_events'));
  assert.match(블록.slice(0, 900), /on conflict[\s\S]*do nothing/,
    '철회 insert 에서 on conflict do nothing 이 사라졌다 — 두 번 Run 하면 철회 사건이 두 줄 쌓인다');
});
