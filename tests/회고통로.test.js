/* 시즌 회고 통로 — `functions/teach` 의 `retro/*` 셋.
 *
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §4·§6·§7 (유호님 확정 6건 · 2026-08-12).
 *
 * ■ 이 검사가 지키는 여섯
 *   ① 🔴 **여는 순간 굳히고, 다시 열 땐 «재계산 0»** — 판정할 때 다시 계산하면 창이 밀려
 *      「가까워졌다」 옆의 숫자가 그 판정을 낸 사람이 본 적 없는 숫자가 된다(설계 §4).
 *   ② 🔴 **학생이 «먼저»** — 통로가 갈라져 있고, 강사 판정 뒤 학생 칸은 409 로 거절된다.
 *      하나로 합치면 순서가 화면 규약으로만 남고 화면은 언젠가 갈린다(설계 §7).
 *   ③ 🔴 **굳힌 근거를 앱에서 안 받는다** — 앱이 보낸 근거는 근거가 아니다.
 *   ④ 🔑 **시즌을 서버가 고른다** — 앱이 고르면 강사가 지난 시즌을 골라 소급 판정할 수 있다.
 *   ⑤ 어휘·구간·판정 규칙은 **lib 하나에서** 온다(문 안에 사본 0).
 *   ⑥ 쓰기와 감사가 **한 트랜잭션**이고, 동봉 표가 실제 lib 을 가리킨다.
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 쓰는 표기 — 실제 `index.ts` 원문을 읽는다.
 *   ② 미실행이 통과와 같은 모양이면 안 된다 — 핸들러를 못 찾으면 **거기서 실패**한다.
 *   ③ 주석은 떼고 잰다 — 안 떼면 머리말의 설명 문장이 검사에 걸려 영원히 초록이다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { 코드만 } = require('./lib/소스검사.js');

const 뿌리 = path.resolve(__dirname, '..');
const 함수방 = path.join(뿌리, 'supabase', 'functions', 'teach');
const 본체경로 = path.join(함수방, 'index.ts');
assert.ok(fs.existsSync(본체경로), `${본체경로} 가 없다 — 이 파일 전체가 미실행이다`);

const 소스 = 코드만(fs.readFileSync(본체경로, 'utf8'));

/** 함수 하나만 잘라 본다 — 파일 끝까지 훑으면 다른 함수의 문장이 섞여 「있다」가 거짓이 된다
 *  (①② 커밋이 실측으로 잡은 자리 · F287 계열). 끝을 «다음 함수 선언»으로 못박는다. */
function 함수(이름) {
  const 시작 = 소스.indexOf(`function ${이름}(`);
  assert.notEqual(시작, -1, `${이름} 을 못 찾았다 — 이 검사가 통째로 미실행이다`);
  const 다음 = 소스.slice(시작 + 1).search(/\nasync function |\nfunction /);
  return 다음 === -1 ? 소스.slice(시작) : 소스.slice(시작, 시작 + 1 + 다음);
}

/* ── ④ 경로·조준 ─────────────────────────────────────────────────────── */

test('경로 셋이 경로표에 있고 메서드가 거기서 파생된다 — 손 삼항 0', () => {
  for (const [길, 법] of [['retro/open', 'GET'], ['retro/self', 'POST'], ['retro/judge', 'POST']]) {
    assert.ok(소스.includes(`'${길}': '${법}'`), `${길} 이 경로표에 ${법} 으로 없다`);
  }
  /* 안내문·메서드 검사는 경로표 하나에서 나온다(넷이 되는 순간 옛 삼항의 else 가 샌다). */
  assert.ok(소스.includes('Object.entries(경로표)'), '안내문이 경로표에서 파생되지 않는다');
});

test('🔴 회고할 시즌을 **서버가** 고른다 — 앱이 보낸 시즌으로 대상 행을 안 고른다', () => {
  const f = 함수('회고대상');
  assert.ok(f.includes('order by s.starts_on') && f.includes('limit 1'),
    '가장 오래된 시즌부터 여는 규칙이 없다 — 건너뛴 시즌은 영영 라벨 0이다');
  assert.ok(f.includes('r.review_id is null or r.verdict is null'),
    '확정된 회고를 다시 열거나, 열다 만 회고를 못 이어 연다');
  assert.ok(f.includes('s.starts_on <= current_date'), '아직 시작도 안 한 시즌이 열린다');
  /* 조준을 앱에서 받지 않는다 — 받는 순간 소급 판정이 열린다. */
  assert.ok(!함수('회고열기').includes("searchParams.get('season_id')"),
    '앱이 시즌을 골라 넘길 수 있다 — 지난 시즌 소급 판정이 열린다');
});

/* ── ① 굳히기 ────────────────────────────────────────────────────────── */

test('🔴 이미 굳힌 회고는 «다시 계산하지 않는다» — 재계산하면 판정이 근거를 잃는다', () => {
  const f = 함수('회고열기');
  const 조건 = f.indexOf('if (!굳힌것) {');
  assert.notEqual(조건, -1, '굳힌 것이 있어도 다시 계산한다 — 어제 본 숫자와 오늘 본 숫자가 갈린다');
  const 계산 = f.indexOf('굳히기(');
  assert.ok(계산 > 조건, '굳히기 호출이 「없을 때만」 블록 밖이다');
  assert.ok(f.indexOf('record_snapshot as Record') < 조건, '굳힌 것을 먼저 읽지 않는다');
});

test('굳히기·집계·구간을 lib 이 진다 — 문 안에 구간 산술 사본이 0이다', () => {
  const f = 함수('회고열기');
  assert.ok(f.includes('굳히기(') && f.includes('집계정리('), 'lib 을 안 쓴다');
  /* 「반으로 가르기」를 여기서 다시 짜면 lib 과 갈리고, 갈린 쪽은 조용히 틀린다. */
  assert.ok(!/\/ 2\b/.test(f), '문 안에서 구간을 직접 반으로 가른다 — 같은 판정이 두 곳에 산다');
  assert.ok(!f.includes('학습자상태('), '문이 축을 직접 부른다 — 두 번 부르는 규칙이 갈린다');
});

test('원신호·라디오 제외 목록을 lib 에서 가져온다 — 여기 다시 안 적는다', () => {
  assert.ok(소스.includes('const { 쓰는사건 } = 상태모듈'), '쓰는사건을 손으로 적었다');
  assert.ok(소스.includes('const { 라디오태스크종 } = 라디오태스크모듈'), '라디오 목록을 손으로 적었다');
  const f = 함수('회고열기');
  assert.ok(f.includes('e.event_type = any(${쓰는사건}::text[])'), '사건 목록을 안 건다');
  assert.ok(f.includes('회고종별상한'), '종별 상한이 없다 — 한 종의 폭주가 다른 종을 밀어낸다');
});

test('원신호·집계가 시즌 «구간»으로 잘린다 — 창 30일이 아니다', () => {
  const f = 함수('회고열기');
  const 자름 = (f.match(/대상\.starts_on\}::date/g) || []).length;
  assert.ok(자름 >= 2, `구간 절단이 ${자름}곳뿐이다 — 원신호·집계 둘 다 시즌으로 잘려야 한다`);
  assert.ok(!f.includes("now() - make_interval"), '창 30일 관용구가 남아 있다');
});

test('근거 ID 는 «굳히되 안 내보낸다» — 행에는 남고 화면엔 안 간다', () => {
  const f = 함수('회고열기');
  assert.ok(f.includes('record_snapshot: 근거벗기기(굳힌것)'), '응답이 evidence_refs 를 그대로 낸다');
  /* 저장하는 쪽은 «벗기지 않은» 것이어야 한다 — 벗겨 저장하면 재현 대조가 통째로 죽는다. */
  assert.ok(f.includes('${tx.json(굳힌것)}'), '벗긴 것을 저장한다 — 같은 근거로 다시 못 잰다');
  const g = 함수('근거벗기기');
  assert.ok(g.includes('evidence_refs: _버림'), '벗기는 칸이 evidence_refs 가 아니다');
  for (const 남길 of ['axes_전반', 'axes_후반']) assert.ok(g.includes(남길), `${남길} 을 안 벗긴다`);
});

/* ── ③ 앱이 근거를 못 보낸다 ─────────────────────────────────────────── */

test('🔴 `record_snapshot` 을 본문에서 안 읽는다 — 앱이 보낸 근거는 근거가 아니다', () => {
  for (const 이름 of ['자기판정', '회고판정', '대상읽기']) {
    assert.ok(!함수(이름).includes('record_snapshot'),
      `${이름} 이 굳힌 근거를 본문에서 다룬다 — 앱이 근거를 갈아 끼울 수 있다`);
  }
});

/* ── ② 학생이 먼저 ───────────────────────────────────────────────────── */

test('🔴 강사 판정 «뒤»의 학생 칸을 409 로 거절한다(메아리 차단)', () => {
  const f = 함수('자기판정');
  assert.ok(f.includes('행.verdict != null') && f.includes('SELF_AFTER_JUDGE'),
    '강사 판정 뒤에도 학생 칸이 써진다 — 대조군이 메아리가 된다');
  assert.ok(소스.includes('SELF_AFTER_JUDGE: 409'), '거절 코드가 상태표에 없다');
});

test('🔴 강사 통로가 학생 칸을 «안 건드린다» — 대신 눌러 주면 대조군이 죽는다', () => {
  const f = 함수('회고판정');
  assert.ok(!/set[\s\S]{0,80}verdict_by_self\s*=/.test(f),
    '강사 판정이 verdict_by_self 를 쓴다 — 강사가 학생 칸을 대신 누를 수 있다');
  /* 읽어서 돌려주는 것은 된다(갈렸나를 그 자리에서 보여 준다) — 쓰지만 않으면 된다. */
  assert.ok(f.includes('returning review_id, verdict, verdict_by_self, decided_at'),
    '갈렸는지를 응답으로 안 돌려준다 — 가장 값진 신호를 그 자리에서 못 본다');
});

test('열지 않고 판정하면 409 다 — 굳힌 근거 없는 라벨은 라벨이 아니다', () => {
  for (const 이름 of ['자기판정', '회고판정']) {
    assert.ok(함수(이름).includes('RETRO_NOT_OPENED'), `${이름} 이 열림 여부를 안 본다`);
  }
  assert.ok(소스.includes('RETRO_NOT_OPENED: 409') && 소스.includes('RETRO_NOT_DUE: 409'));
});

/* ── ⑤⑥ 검사·트랜잭션·동봉 ──────────────────────────────────────────── */

test('판정·사유 검사를 lib 이 진다 — 문 안에 3갈래 값 사본이 0이다', () => {
  assert.ok(함수('회고판정').includes('판정검사(b.verdict, b.note)'), '강사 판정 검사가 없다');
  assert.ok(함수('자기판정').includes('자기판정검사(b.verdict_by_self)'), '학생 판정 검사가 없다');
  for (const 값 of ['closer', 'same', 'redirected']) {
    assert.ok(!소스.includes(`'${값}'`), `문이 판정 코드값 '${값}' 을 손으로 들었다`);
  }
});

test('세 통로 모두 쓰기와 감사가 «한 트랜잭션»이다 — 0건도 1행 남긴다', () => {
  for (const [이름, 표식] of [
    ['회고열기', 'teach.retro.open'],
    ['자기판정', 'teach.retro.self'],
    ['회고판정', 'teach.retro.judge'],
  ]) {
    const f = 함수(이름);
    assert.ok(f.includes('sql.begin'), `${이름} 이 트랜잭션 밖이다`);
    assert.ok(f.includes(표식), `${이름} 이 감사 ${표식} 를 안 남긴다`);
    assert.ok(f.indexOf('staff_access_log') > f.indexOf('sql.begin'),
      `${이름} 의 감사가 트랜잭션 밖이다 — 실패한 요청이 감사만 남긴다`);
  }
});

test('같은 학생의 두 세션이 «직렬화»된다 — 안 하면 두 굳힘이 경합한다', () => {
  assert.ok(함수('회고대상').includes('for update of c'), '대상 조회가 잠그지 않는다');
  assert.ok(함수('회고행').includes('for update'), '판정 대상 행을 잠그지 않는다');
  assert.ok(함수('회고열기').includes('on conflict (learner_id, season_id) do nothing'),
    '경합 때 나중 굳힘이 먼저 것을 덮는다 — 판정과 근거가 갈린다');
});

test('동봉 표가 실제 lib 파일을 가리킨다(손 사본 0) — 회고 사슬 전량', () => {
  const 동봉 = JSON.parse(fs.readFileSync(path.join(함수방, '동봉.json'), 'utf8'));
  for (const 짝 of ['회고.mjs', '학습자상태.mjs', '작성과정.mjs', '라디오태스크.mjs']) {
    assert.ok(동봉[짝], `${짝} 이 동봉 표에 없다 — 함수가 번들조차 안 된다`);
    assert.ok(fs.existsSync(path.join(뿌리, 동봉[짝])), `${동봉[짝]} 이 없다`);
  }
  /* 🔑 한쪽 방향만 검사한다 — **본체가 import 한 것은 전부 표에 있어야** 하지만, 표에는
   *   본체가 안 부르는 것도 든다(`작성과정`·`라디오태스크` 는 `학습자상태` 가 부르는 사슬이다).
   *   반대로 걸면 정상인 사슬을 빨갛게 만들고, 그 처방은 사슬을 끊는 것이 된다. */
  for (const 짝 of 소스.match(/from '\.\/([^']+\.mjs)'/g) || []) {
    const 이름 = 짝.slice("from './".length, -1);
    assert.ok(동봉[이름], `${이름} 을 import 하는데 동봉 표에 없다 — 함수가 번들조차 안 된다`);
  }
});

test('나침반 문구도 «서버가» 준다 — 화면이 문항키→라벨 표를 손으로 들지 않는다', () => {
  const f = 함수('회고열기');
  assert.ok(f.includes('questions: 물을것('), '왼쪽 문구를 안 내려보낸다');
  /* 🔑 그날의 목적으로 고른다 — 오늘의 목적으로 고르면 목적을 바꾼 학생의 회고에
   *   그 시즌에 없던 질문이 뜬다. */
  assert.ok(f.includes('대상.goal_track_at_open'), '오늘의 목적으로 문구를 고른다');
  assert.ok(f.includes('verdict_options: 판정보기') && f.includes('note_max: 사유상한'),
    '판정 어휘·사유 상한을 안 내려보낸다 — 화면이 사본을 들게 된다');
});
