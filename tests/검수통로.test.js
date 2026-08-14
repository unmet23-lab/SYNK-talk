/* 직원 통로 `functions/review` — 계약(`docs/검수_내부계약.md`)과 배선이 갈라졌나.
 *
 * ■ 이 검사가 지키는 다섯
 *   ① **오류표가 정본과 같은가** — 계약 §1 표를 파싱해 대조한다. 손으로 베끼면 그 사본이 곧
 *      두 번째 정본이고, 갈라지면 화면의 오류 분기가 조용히 틀린다.
 *   ② **감사가 응답의 조건인가**(§2) — 읽기와 감사가 한 트랜잭션이 아니면 「감사 없는 읽기」가
 *      성립하고, 그 순간 §4-5 ④ 의 「읽는 지점이 하나」는 세는 것이 없는 문장이 된다.
 *   ③ **`event_id` 가 브라우저로 안 나가는가** — 판이 그 열을 연 것은 서버가 승격에 쓰려는
 *      것이지 화면에 그리려는 게 아니다(`20260809050000` 이 「Fn 이 서는 날 검사가 붙는다」고
 *      미뤄 둔 자리 — 그 날이 오늘이다).
 *   ④ **역할이 허용 목록인가** — 차단 목록이면 못 적은 역할이 통과한다(새는 방향=통과).
 *   ⑤ **원표를 안 읽는가** — 판 하나만 읽는다(`tests/검수큐.test.js` ⑤ 의 코드층 짝).
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 쓰는 표기 — 실제 `supabase/functions/review/index.ts` 원문을 읽는다.
 *   ② 미실행이 통과와 같은 모양이면 안 된다 — 파일·표·앵커를 못 찾으면 **거기서 실패**한다.
 *   ③ 반대방향 장부 — 계약 표에 있는데 코드에 없는 오류 코드는 **이유가 적힌 것 하나**(§5 의
 *      `GATE_NOT_MET`)뿐이어야 한다. §5 가 서는 날 이 줄이 빨개져 사람을 부른다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { 코드만, 구간, 코드만픽스처 } = require('./lib/소스검사.js');

const 뿌리 = path.resolve(__dirname, '..');
const 함수방 = path.join(뿌리, 'supabase', 'functions', 'review');
const 본체경로 = path.join(함수방, 'index.ts');

assert.ok(fs.existsSync(본체경로), 'functions/review/index.ts 가 없다 — 이 검사가 통째로 미실행이다');
const 소스 = fs.readFileSync(본체경로, 'utf8');
/* 🔴 `소스` 는 **원문으로 남긴다** — 통째로 정제하면 이 파일이 깨진다(실측 2026-08-13):
 *   `함수본문()` 이 쓰는 구간 앵커가 `/* ── §5 승인·폐기` 처럼 **주석 배너**라, 주석을 지우면
 *   앵커가 함께 사라져 「이 검사가 통째로 미실행」으로 떨어진다. 즉 여기서 주석은 설명이
 *   아니라 **구조**다. 대신 «금지» 단언만 아래 `코드` 를 쓴다 — 금지는 주석 한 줄에 거짓
 *   적색으로 뒤집히는 방향이고(F401), 앵커와 달리 코드만 보면 되는 자리다. */
const 코드 = 코드만(소스);
const 계약 = fs.readFileSync(path.join(뿌리, 'docs', '검수_내부계약.md'), 'utf8');
const 스키마 = fs.readFileSync(path.join(뿌리, 'supabase', 'L0_스키마.sql'), 'utf8');

/* ── ① 오류표가 정본과 같은가 ─────────────────────────────────────── */

/** 계약 §1 의 오류 표 → `{코드: [상태…]}`. 표를 못 읽으면 거기서 실패한다. */
function 계약오류표() {
  const 표 = {};
  for (const m of 계약.matchAll(/^\|\s*`([A-Z_]+)`\s*\|\s*([\d·\s]+)\s*\|/gmu)) {
    표[m[1]] = m[2].split('·').map((s) => Number(s.trim())).filter(Boolean);
  }
  assert.ok(Object.keys(표).length >= 8,
    `계약 §1 오류표를 ${Object.keys(표).length}줄밖에 못 읽었다 — 앵커가 낡았다(대조가 통째로 헐거워진다)`);
  return 표;
}

/** 소스의 `거절상태` 표 → `{코드: 상태}`. §5 는 거절을 트랜잭션 «안»에서 정하고 밖에서
 *  봉투로 바꾸므로 호출부에 리터럴이 없다 — 그 자리를 이 표가 대신 진다.
 *  🔴 표를 못 읽으면 **거기서 실패한다**: 코드가 변수로만 흐르면 아래 계약 대조가 통째로
 *  눈이 멀고, 그 상태는 「초록」과 같은 모양이다. */
function 거절표() {
  const m = /const 거절상태 = \{([\s\S]*?)\} as const;/u.exec(소스);
  assert.ok(m, '`거절상태` 표를 못 찾았다 — §5 의 코드→상태 매핑이 어디 있는지 불명이다');
  const 표 = {};
  for (const 줄 of m[1].matchAll(/([A-Z_]+):\s*(\d{3})/gu)) 표[줄[1]] = Number(줄[2]);
  assert.ok(Object.keys(표).length >= 4, `거절 표를 ${Object.keys(표).length}줄밖에 못 읽었다 — 파서가 낡았다`);
  return 표;
}

/** 소스의 `실패(<status>, { … code: 'X' … })` 리터럴 + `거절상태` 표 → `{코드: Set<상태>}`. */
function 코드사용() {
  const 쓰임 = {};
  for (const m of 소스.matchAll(/실패\(\s*(\d{3})\s*,\s*\{([\s\S]*?)\}\s*,/gu)) {
    const c = /code:\s*'([A-Z_]+)'/u.exec(m[2]);
    if (!c) continue; /* `거절응답` 처럼 표에서 받아 넘기는 자리 — 아래에서 표로 센다. */
    (쓰임[c[1]] ??= new Set()).add(Number(m[1]));
  }
  for (const [코드, 상태] of Object.entries(거절표())) (쓰임[코드] ??= new Set()).add(상태);
  assert.ok(Object.keys(쓰임).length >= 5, `오류 코드를 ${Object.keys(쓰임).length}종밖에 못 찾았다 — 정규식이 낡았다`);
  return 쓰임;
}

test('거절 코드→상태 매핑이 **한 자리**에만 있다', () => {
  /* 초판은 승인·폐기가 각자 삼항으로 정했고 그 둘이 이미 갈려 있었다(같은 `else` 가
   * 한쪽은 409, 한쪽은 400). 같은 판정을 두 곳에 적으면 갈라진다 — 목록은 하나에서 파생시킨다. */
  const 삼항 = [...소스.matchAll(/코드 === '[A-Z_]+' \? \d{3}/gu)];
  assert.deepEqual(삼항.map((m) => m[0]), [],
    '거절 상태를 삼항으로 다시 적는 자리가 있다 — `거절상태` 표 하나에서만 나와야 한다');
  assert.ok(Object.keys(거절표()).includes('SUPERSEDE_CONFLICT'),
    '재검수 계보 충돌 코드가 표에 없다(§5-1)');
});

test('오류 코드·HTTP 상태가 계약 §1 표와 정확히 같다', () => {
  const 표 = 계약오류표();
  const 쓰임 = 코드사용();
  const 어긋남 = [];
  for (const [코드, 상태들] of Object.entries(쓰임)) {
    if (!표[코드]) { 어긋남.push(`${코드}: 계약 표에 없는 코드다`); continue; }
    for (const s of 상태들) {
      if (!표[코드].includes(s)) 어긋남.push(`${코드}: ${s} 는 계약이 안 적은 상태다(표=${표[코드].join('·')})`);
    }
  }
  assert.deepEqual(어긋남, [], 어긋남.join('\n'));
});

test('계약이 적은 코드를 통로가 **전부** 쓴다 (§5 가 서면서 마지막 하나가 닫혔다)', () => {
  const 안씀 = Object.keys(계약오류표()).filter((c) => !코드사용()[c]);
  assert.deepEqual(안씀, [],
    '계약이 적은 코드를 통로가 안 쓴다 — 표에만 사는 코드는 화면이 대비할 수 없다.\n'
    + '  🔴 여기서 초록으로 덮지 마라: 안 쓰는 코드를 늘리면 계약과 통로가 갈라진 것이 안 보인다.\n'
    + '  (§5 착수 전에는 `GATE_NOT_MET` 하나가 예외로 적혀 있었고, 그 줄이 「그 날」 빨개져 이 자리를 불렀다)');
});

/* ── ② 감사가 응답의 조건인가 (§2) ────────────────────────────────── */

test('큐 읽기와 조회 감사가 **한 트랜잭션**이다', () => {
  const 트랜잭션 = /sql\.begin\(async \(tx\) => \{([\s\S]*?)\n  \}\);/u.exec(소스);
  assert.ok(트랜잭션, 'sql.begin(...) 블록을 못 찾았다 — 읽기와 감사가 갈라졌거나 앵커가 낡았다');
  assert.match(트랜잭션[1], /from engine\.review_queue/u, '트랜잭션 안에서 판을 안 읽는다');
  assert.match(트랜잭션[1], /insert into engine\.staff_access_log/u,
    '감사 insert 가 트랜잭션 밖이다 — 감사가 실패해도 응답이 이미 나간 뒤가 된다(§2)');
  /* 🔴 **블록 «안»에 있다고 트랜잭션 안이 아니다.** `tx` 대신 `sql` 을 쓰면 그 문장은 **다른
   *   커넥션**에서 돌아 트랜잭션 밖이다 — 코드 모양은 그대로고 증상도 없다(읽기는 성공,
   *   감사만 따로 커밋된다). 변이 시험이 이 자리를 드러냈다: 첫 판은 위 두 줄뿐이라
   *   `tx` → `sql` 변이를 **아무도 안 잡았다**. 태그까지 봐야 이 검사가 무엇을 재는 것이 된다. */
  assert.ok(!/\bsql`/u.test(트랜잭션[1]),
    '트랜잭션 블록 안에서 `sql` 태그를 쓴다 — 그 문장만 다른 커넥션으로 새고 §2 가 조용히 깨진다.\n'
    + '  블록 안의 질의는 전부 `tx` 로 건다');
  assert.match(트랜잭션[1], /await tx`\s*\n\s*insert into engine\.staff_access_log/u,
    '감사 insert 가 `tx` 로 안 걸려 있다 — 같은 트랜잭션이 아니다(§2)');
});

test('🔴 감사에 적는 것은 **실제로 실어 보낸** 항목이다', () => {
  /* `행들` 은 한 건 더 받은 것이다(다음 쪽 유무 판정용). 그걸 그대로 적으면 화면에 안 나간
   * 항목이 「봤다」로 남고, 그 행이 §5 승인 게이트 ②를 그대로 통과시킨다. */
  assert.match(소스, /const data = 행들\.slice\(0, 크기\)/u, '쪽 자르기 앵커가 낡았다');
  assert.match(소스, /const 실린것 = data\.map\(/u,
    '감사 대상을 `행들`(한 건 더 받은 것)에서 뽑는다 — 안 보낸 항목이 「봤다」로 남는다');
  assert.match(소스, /'review\.queue', \$\{실린것\}/u, 'target_ids 가 실린 것이 아니다(§2)');
});

test('서명은 **받은 뒤에** 감사한다 — 순서가 뒤집히면 못 들은 발화가 청취 게이트를 지난다', () => {
  const 서명 = 소스.indexOf('/storage/v1/object/sign/');
  const 감사 = 소스.indexOf("'review.audio'");
  assert.ok(서명 !== -1 && 감사 !== -1, '서명·감사 앵커가 낡았다');
  assert.ok(서명 < 감사,
    '감사를 먼저 적는다 — 서명이 실패한 항목에도 「발급됨」이 남고, §5 게이트 ②가 그것을 증거로 읽는다');
});

/* ── ③ `event_id` 는 응답에 안 싣는다 ─────────────────────────────── */

/** 살아 있는 뷰 정의(**마지막** 것)가 내보내는 열 이름들. */
function 뷰열() {
  const 전부 = [...스키마.matchAll(/create (?:or replace )?view engine\.review_queue as([\s\S]*?);\n/gu)];
  assert.ok(전부.length, 'engine.review_queue 뷰를 합본에서 못 찾았다 — 조각이 안 실렸다');
  const 몸 = 전부[전부.length - 1][1];
  const 셀렉트 = 몸.slice(0, 몸.indexOf('from engine.submissions'));
  const 이름 = [];
  for (const 줄 of 셀렉트.split('\n').map((l) => l.replace(/--.*$/u, '').trim()).filter(Boolean)) {
    const 별칭 = /\bas\s+([\w가-힣]+),?$/u.exec(줄);
    const 그대로 = /^(?:select\s+)?[\w가-힣]+\.([\w가-힣]+),?$/u.exec(줄);
    if (별칭) 이름.push(별칭[1]);
    else if (그대로) 이름.push(그대로[1]);
  }
  assert.ok(이름.length >= 20, `뷰 열을 ${이름.length}개밖에 못 읽었다 — 파서가 낡았다`);
  return 이름;
}

/** 소스의 `큐열` 배열 — 응답에 싣는 이름 전량. */
function 큐열() {
  const m = /const 큐열 = \[([\s\S]*?)\];/u.exec(소스);
  assert.ok(m, '`큐열` 목록을 못 찾았다 — 앵커가 낡았다(대조가 통째로 미실행이다)');
  return [...m[1].matchAll(/'([\w]+)'/gu)].map((x) => x[1]);
}

test('🔴 판에는 있는 `event_id` 를 응답에는 안 싣는다', () => {
  assert.ok(뷰열().includes('event_id'),
    '판에 `event_id` 가 없다 — 그러면 이 검사는 아무것도 안 막고 있다(판이 좁아졌다)');
  assert.ok(!큐열().includes('event_id'),
    '`event_id` 를 검수자 브라우저로 내보낸다 — 학생 사건 줄 전체로 가는 지렛대다(20260809050000 머리말)');
});

test('싣는 열은 전부 판에 있는 열이다 — 원표 이름을 슬쩍 끼우지 않는다', () => {
  const 판 = new Set(뷰열());
  const 밖 = 큐열().filter((c) => !판.has(c));
  assert.deepEqual(밖, [], `판에 없는 열을 읽는다: ${밖.join(', ')} — 그 쿼리는 런타임에 죽는다`);
});

test('판의 열 중 안 싣는 것은 `event_id` 하나뿐이다 — 나머지는 화면이 다 쓴다', () => {
  const 실음 = new Set(큐열());
  const 뺀것 = 뷰열().filter((c) => !실음.has(c));
  assert.deepEqual(뺀것, ['event_id'],
    `판이 넓어졌는데 통로가 안 따라갔다: ${뺀것.join(', ')}\n`
    + '  → 화면에 필요하면 `큐열` 에 더하고, 서버 전용이면 여기 사유와 함께 적는다');
});

/* ── ④ 역할은 허용 목록 ───────────────────────────────────────────── */

test('검수 역할은 허용 목록이다 (차단 목록이면 못 적은 역할이 통과한다)', () => {
  const m = /const 검수역할 = \[([^\]]*)\]/u.exec(소스);
  assert.ok(m, '`검수역할` 목록을 못 찾았다 — 앵커가 낡았다');
  const 역할 = [...m[1].matchAll(/'([a-z_]+)'/gu)].map((x) => x[1]);
  assert.deepEqual(역할.sort(), ['director', 'inspector'],
    '검수 역할이 계약 §1 과 다르다 — `director` 를 빼면 2027-02 까지 이 통로를 쓸 사람이 0명이다');
  assert.match(소스, /role = any\(/u, '역할을 허용 목록으로 안 묻는다');
  assert.ok(!/role\s*(!=|<>)|not in \(/u.test(코드),
    '역할을 차단 목록으로 가른다 — 못 적은 역할이 새는 방향은 언제나 「통과」다');
});

test('직원 폐기 판정은 lib 정본을 부른다 (사본을 두지 않는다)', () => {
  assert.match(소스, /살아있는직원\(sql, 주체, 발급시각\(req\)\)/u,
    '폐기 판정을 안 부른다 — 폐기된 검수자의 옛 토큰이 큐를 계속 읽는다');
  assert.ok(!/revoked_before/u.test(코드),
    '폐기 술어를 이 파일이 직접 적는다 — 정본은 `lib/토큰.js` 하나다(절단문서 ②-15)');
});

/* ── ⑤ **읽기** 경로는 판 하나만 읽는다 ───────────────────────────── */

/** 함수 하나의 본문을 잘라낸다 — 앵커를 못 찾으면 거기서 실패한다.
 *  🔑 §5 가 서면서 이 검사의 **범위를 좁혔다**: 승인·폐기는 원표에 **쓰는** 경로라
 *  `pipeline_jobs`·`corrections`·`submissions` 를 직접 건드릴 수밖에 없다(판은 뷰라 못 쓴다).
 *  진짜 축은 「원표를 안 읽는다」가 아니라 **「검수자에게 내보내는 열은 판에서만 온다」**였고,
 *  §5 쪽은 아래 ⑦ 이 그 축을 응답 키 허용 목록으로 잰다. 범위를 안 좁히고 규칙만 지우면
 *  읽기 경로의 보호까지 같이 사라진다. */
function 함수본문(시작앵커, 끝앵커) {
  return 구간(소스, 시작앵커, 끝앵커);
}

test('탐지력 픽스처 — 주석 제거기가 「설명 속의 코드」를 실제로 지운다', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대,
    '주석을 안 지운다 — 검사가 설명을 코드로 읽고, 그 상태는 「초록」과 같은 모양이다');
});

test('읽기 경로(큐·서명)가 원표를 직접 안 읽는다 — 읽는 곳은 판 하나다', () => {
  const 읽기 = 함수본문('async function 큐읽기', '/* ── §4-2 POST');
  for (const 표 of ['engine.submissions', 'engine.corrections', 'engine.pipeline_jobs', 'engine.learning_events']) {
    assert.ok(!읽기.includes(`from ${표}`) && !읽기.includes(`join ${표}`),
      `${표} 를 직접 읽는다 — 판(②-17)이 막아 둔 열이 이 문으로 도로 나간다`);
  }
  assert.match(읽기, /from engine\.review_queue/u, '판을 안 읽는다 — 앵커가 낡았다');
});

/* §4-2 는 위 규칙의 **유일한 예외**다 — 그래서 예외인 이유를 기계가 지킨다.
 * 소속을 가르려면 원표(`pipeline_jobs.status`)를 봐야 한다: 재검수 창은 **큐 밖**(확정분)이라
 * 판만 보면 `Z` 가 원리상 못 지난다. 대신 그 값이 **응답에 한 글자도 안 실려야** 예외가 성립한다.
 * 실리기 시작하면 판을 좁혀 둔 것이 이 문으로 새고, 증상은 「통과」다. */
test('§4-2 는 원표를 읽지만 **아무것도 응답에 싣지 않는다**', () => {
  const 열어봄 = 함수본문('async function 열어봄', '/* ── §5 승인·폐기');
  assert.match(열어봄, /engine\.pipeline_jobs/u,
    '소속을 원표에서 안 본다 — 그러면 확정분(재검수 창)이 이 경로를 못 지난다');
  const 성공봉투 = [...열어봄.matchAll(/봉투\(200, \{([^}]*)\}/gu)].map((m) => m[1].trim());
  assert.deepEqual(성공봉투, ['ok: true'],
    '성공 응답에 `ok` 말고 다른 것이 실린다 — 이 경로가 원표를 읽는 예외였던 근거가 사라진다');
  assert.ok(!/signedURL|storage|expires_at/u.test(열어봄),
    '§4-2 가 무언가를 발급한다 — 「아무것도 발급하지 않는다」가 이 경로의 존재 이유다(§4-2)');
});

/* ── ⑥ 경로·동봉 ──────────────────────────────────────────────────── */

test('경로는 여섯이고 메서드가 갈린다 — 그 밖은 404 다', () => {
  const m = /const 아는경로 = \[([^\]]*)\]/u.exec(소스);
  assert.ok(m, '`아는경로` 목록을 못 찾았다 — 뒷마디를 안 보면 `/review/아무거나` 가 큐 조회로 동작한다');
  assert.deepEqual([...m[1].matchAll(/'([a-z]+)'/gu)].map((x) => x[1]).sort(),
    ['approve', 'audio', 'classes', 'discard', 'played', 'queue'],
    '경로 목록이 계약(§3·§3-2·§4·§4-2·§5)과 다르다');
  assert.match(소스, /경로 === 'queue' \|\| 경로 === 'classes' \? 'GET' : 'POST'/u,
    '경로별 메서드가 안 갈린다 — 읽기 둘(queue·classes)만 GET 이다');
  /* 🔑 목록에 있는 것과 **실제로 라우팅되는 것**은 다르다 — 목록에만 넣고 분기를 빠뜨리면
   *   그 경로는 405 도 404 도 아닌 「승인·폐기 갈래」로 흘러 들어간다(마지막 삼항이 받는다). */
  assert.match(소스, /경로 === 'played'\) return await 열어봄\(/u,
    '`played` 가 목록에만 있고 분기가 없다 — 그 요청이 폐기 갈래로 떨어진다');
  assert.match(소스, /경로 === 'classes'\) return await 반목록읽기\(/u,
    '`classes` 가 목록에만 있고 분기가 없다 — 그 요청이 폐기 갈래로 떨어진다');
});

/* ── ⑧ §3-2 반 모드 (숙제서클 §10-3) ──────────────────────────────── */

test('반 큐가 싣는 것 = 기본 큐열 + 정체 3열 — event_id 는 여기서도 안 나간다', () => {
  const m = /const 반큐열 = \[\.\.\.큐열, ([^\]]*)\]/u.exec(소스);
  assert.ok(m, '`반큐열` 이 큐열에서 파생하지 않는다 — 두 목록이 각자 살면 언젠가 갈린다');
  assert.deepEqual([...m[1].matchAll(/'([\w]+)'/gu)].map((x) => x[1]).sort(),
    ['display_name', 'group_no', 'seat_no'],
    '반 모드가 더 싣는 열이 정체 3열이 아니다 — class_id·event_id 가 이 길로 새면 조용하다');
});

test('반 큐 갈래는 uuid 검증을 지나 반 판을 읽는다 — 기본 큐 SQL 은 바이트 그대로다', () => {
  assert.match(소스, /uuid꼴\.test\(반\)/u,
    '`class` 값을 검증 없이 SQL 로 내려보낸다 — 400 이어야 할 것이 500 이 된다');
  assert.match(소스, /from engine\.review_queue_class/u, '반 판을 안 읽는다 — 앵커가 낡았다');
  assert.match(소스, /where class_id = \$\{반\}::uuid/u,
    '반 필터가 없다 — 전교생 큐가 반 모드 얼굴로 나간다');
});

test('반 큐·반 목록도 감사가 응답의 조건이다 — 트랜잭션 안 tx 로 건다', () => {
  const 반큐 = 구간(소스, 'async function 반큐읽기', 'async function 반목록읽기');
  assert.match(반큐, /await tx`\s*\n\s*insert into engine\.staff_access_log/u,
    '반 큐의 감사가 tx 로 안 걸려 있다 — 같은 트랜잭션이 아니다(§2)');
  assert.match(반큐, /'review\.queue', \$\{실린것\}/u,
    '반 큐 감사의 action 이 review.queue 가 아니다 — 조회 분모가 모드로 갈라진다(§3-2)');
  const 반목록 = 구간(소스, 'async function 반목록읽기', '/* ── §4 POST');
  assert.match(반목록, /await tx`\s*\n\s*insert into engine\.staff_access_log/u,
    '반 목록의 감사가 tx 로 안 걸려 있다(§2 — 모든 경로가 진다)');
  assert.match(반목록, /'review\.classes'/u,
    '반 목록 감사의 action 이 review.classes 가 아니다 — 큐 분모에 섞이면 뜻이 흐려진다(§3-2)');
  assert.ok(!/\bsql`/u.test(구간(소스, 'async function 반큐읽기', '/* ── §4 POST')
    .replace(/await sql\.begin/gu, '')),
    '반 모드 트랜잭션 블록 안에서 `sql` 태그를 쓴다 — 그 문장만 다른 커넥션으로 샌다(§2)');
});

/* ── ⑦ §5 승인·폐기 ──────────────────────────────────────────────── */

test('승인은 **한 트랜잭션**에 넷을 쓴다 — 하나라도 새면 확정이 반쪽이 된다', () => {
  const 승인 = 함수본문('async function 승인(', 'async function 폐기(');
  const 블록 = /sql\.begin\(async \(tx\) => \{([\s\S]*)\n  \}\);/u.exec(승인);
  assert.ok(블록, '승인이 트랜잭션 안에서 안 돈다 — 확정이 부분만 남을 수 있다');
  const 몸 = 블록[1];
  for (const [무엇, 정규식] of [
    ['teacher 교정 행', /insert into engine\.corrections/u],
    ['검증 전사 갱신', /update engine\.submissions/u],
    ["큐에서 빼기(status='verified')", /update engine\.pipeline_jobs/u],
    ['승인 감사', /insert into engine\.staff_access_log/u],
  ]) {
    assert.match(몸, 정규식, `${무엇} 이 승인 트랜잭션 안에 없다(§5-1 「한 트랜잭션에 넷」)`);
  }
  /* 블록 «안»이라고 트랜잭션 안이 아니다 — `sql` 태그는 다른 커넥션이다(§2 검사와 같은 급소). */
  assert.ok(!/\bsql`/u.test(몸),
    '승인 트랜잭션 안에서 `sql` 태그를 쓴다 — 그 문장만 다른 커넥션으로 새고 원자성이 조용히 깨진다');
  assert.match(몸, /for update/u,
    '`pipeline_jobs` 를 안 잠근다 — 같은 항목의 동시 승인이 teacher 행을 둘 만든다(§5-1 동시성)');
});

test('🔴 `verdict` 를 요청에서 받지 않는다 — 서버가 세 텍스트에서 낸다', () => {
  const 승인 = 함수본문('async function 승인(', 'async function 폐기(');
  assert.match(승인, /const verdict = 판정\(\{/u, '판정을 안 부른다 — verdict 가 어디서 오는지 불명이다');
  assert.ok(!/b\.verdict|q\.verdict|본문\.verdict/u.test(코드),
    '요청 본문에서 verdict 를 읽는다 — 사람이 고르면 그 순서 판정이 화면마다 갈린다(§5-1)');
});

test('🔴 폐기 사유 어휘를 **코드가 안 든다** — DB CHECK 에서 읽는다', () => {
  /* 값목록 사본이 이 저장소에서 낡은 것이 이미 두 번이다(F285). `tests/폐기사유.test.js` 는
   * 산문 둘만 CHECK 와 대조하므로, 코드에 넷째 사본이 생기면 그 검사의 **눈 밖**이다. */
  const lib = fs.readFileSync(path.join(뿌리, 'lib', '검수확정.js'), 'utf8');
  for (const 값 of ['무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가']) {
    for (const [이름, 본문] of [['functions/review/index.ts', 소스], ['lib/검수확정.js', lib]]) {
      assert.ok(!new RegExp(`'${값}'|"${값}"`, 'u').test(본문),
        `${이름} 이 폐기 사유 '${값}' 를 문자열로 든다 — 정본은 DB CHECK 하나다(§5-2)`);
    }
  }
  assert.match(소스, /pg_get_constraintdef/u, 'CHECK 정의를 안 읽는다 — 어휘 대조가 통째로 없다');
  assert.match(소스, /conname like 'pipeline_jobs_discard_reason_c%'/u,
    '제약 이름을 판 접미까지 박아 찾는다 — 판이 `_c11` 로 갈리는 날 전 폐기가 조용히 500 이 된다');
});

test('폐기는 파일을 안 지운다 — 소프트만이다(철회는 다른 사건)', () => {
  const 폐기 = 함수본문('async function 폐기(', null);
  assert.ok(!/storage|audio_deleted_at|delete from/u.test(폐기),
    '폐기 경로가 파일·행을 지운다 — 노이즈도 강건성 재료라 소프트만이다(§5-2 · L0 §9-3)');
});

/** 승인·폐기 응답 봉투가 싣는 키 — 원표 열을 퍼가지 않는다는 것의 실측. */
test('🔴 §5 응답은 서버가 만든 값만 싣는다 — 원표 열이 안 새어 나간다', () => {
  const 허용 = new Set([
    'ok', '...결과', 'correction_id', 'verdict', 'promotion_intent', 'listen_gate',
    'discarded', 'reason',
  ]);
  const 구간 = 함수본문('/* ── §5 승인·폐기', null);
  const 봉투들 = [...구간.matchAll(/봉투\(200, \{([^}]*)\}/gu)];
  assert.equal(봉투들.length, 2, `§5 의 200 응답이 ${봉투들.length}개다 — 승인·폐기 둘이어야 한다`);
  const 밖 = [];
  for (const b of 봉투들) {
    for (const 키 of b[1].split(',').map((s) => s.trim().replace(/:.*$/u, '')).filter(Boolean)) {
      if (!허용.has(키)) 밖.push(키);
    }
  }
  assert.deepEqual(밖, [], `허용 목록 밖의 키를 응답에 싣는다: ${밖.join(', ')}\n`
    + '  → 원표에서 읽은 값을 그대로 내보내면 판(②-17)이 막아 둔 것이 이 문으로 나간다');
});

test('게이트 ②는 **요청자 본인이 재생한 기록**을 본다 — 발급이 아니다', () => {
  const 승인 = 함수본문('async function 승인(', 'async function 폐기(');
  assert.match(승인, /staff_access_log l[\s\S]{0,200}l\.staff_id = \$\{staff_id\}/u,
    '남이 연 기록으로도 승인이 선다 — 그러면 이 게이트는 「누군가 들었다」만 보증한다(§5-1 ②)');
  assert.match(승인, /l\.action = 'review\.audio\.played'/u,
    '재생 기록을 증거로 안 쓴다(§2 개정)');
  /* 🔴 되돌림 금지 — 발급을 증거로 되돌리면 프리로드가 게이트를 미리 열고, 재검수는 612초 된
   *   옛 기록으로 통과한다(2026-08-09 실측). 그 회귀는 **증상이 「통과」**라 아무도 못 본다. */
  assert.ok(!/l\.action = 'review\.audio'/u.test(승인),
    '발급(`review.audio`)을 다시 게이트 증거로 쓴다 — ㉮ 개정 이전으로 되돌아갔다');
});

test('재검수는 **마지막 판정 이후의** 재생을 요구한다 — 그 비교가 SQL 에 있다', () => {
  const 승인 = 함수본문('async function 승인(', 'async function 폐기(');
  assert.match(승인, /판정후재청취/u, '재검수 갈래의 청취 판정이 없다 — 옛 기록으로 통과한다');
  /* 비교 대상이 `supersedes` 행의 생성 시각이어야 한다. 다른 시각(예: 제출 시각)을 들면
   * 「이번 판정 이후」가 아니라 「언젠가 이후」가 되어 게이트가 다시 헐거워진다. */
  assert.match(승인, /max\(l\.at\)[\s\S]{0,400}>[\s\S]{0,200}c\.created_at[\s\S]{0,200}correction_id = \$\{q\.supersedes\}/u,
    '재청취 비교가 `supersedes` 행의 `created_at` 을 안 든다');
  assert.match(승인, /재검수 && !판정후재청취/u,
    '그 값을 실제로 거절에 안 쓴다 — 계산만 하고 통과시키면 검사가 초록인 채 게이트가 없다');
});

test('게이트에 **시간 리터럴을 안 박는다** — 창은 서명 수명이 물리로 만든다', () => {
  const 승인 = 함수본문('async function 승인(', 'async function 폐기(');
  /* 🔑 「10분 안에 들었어야 한다」로 조이면 **첫 확정까지 같이 조인다** — 한 항목을 오래
   *   붙들고 보는 검수는 정상 행동이고, 그 처방은 성실한 검수자만 막는다(§5 게이트 ② 🚫).
   *   재검수 창은 확정분에 새 서명이 안 나가는 것으로 이미 닫힌다. */
  assert.ok(!/interval\s|서명수명초|now\(\)\s*-/u.test(승인),
    '승인 게이트가 시간 상수를 든다 — 첫 확정까지 같이 조인다(§5 🚫)');
});

test('감사 행위 이름 여섯이 계약대로다', () => {
  for (const 이름 of ['review.queue', 'review.audio', 'review.audio.played', 'review.approve',
    'review.discard', 'review.classes']) {
    assert.ok(소스.includes(`'${이름}'`), `감사 이름 '${이름}' 이 없다 — 그 경로는 장부를 안 남긴다(§2)`);
  }
});

test('import 하는 동봉 파일이 전부 표에 있다 — 없으면 배포는 성공하고 첫 호출에서 죽는다', () => {
  const 표 = JSON.parse(fs.readFileSync(path.join(함수방, '동봉.json'), 'utf8'));
  const 쓴것 = [...소스.matchAll(/from '\.\/([^']+\.mjs)'/gu)].map((m) => m[1]);
  assert.ok(쓴것.length >= 3, `동봉 import 를 ${쓴것.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  const 빠짐 = 쓴것.filter((n) => !표[n]);
  assert.deepEqual(빠짐, [], `동봉 표에 없다: ${빠짐.join(', ')}`);
  const 죽은것 = Object.keys(표).filter((n) => !쓴것.includes(n));
  assert.deepEqual(죽은것, [], `안 쓰는데 동봉한다: ${죽은것.join(', ')} — 표가 소스보다 낡았다`);
});

test('서명 수명은 계약대로 10분이다', () => {
  assert.match(소스, /const 서명수명초 = 600;/u,
    '서명 수명이 계약(§4 · uploads 와 같은 사유)과 다르다 — 철회 뒤 「꼬리」가 그만큼 길어진다');
});

test('서명 전에 그 항목이 **지금** 큐에 있는지 본다', () => {
  const 소속 = 소스.indexOf('from engine.review_queue where submission_id');
  const 서명 = 소스.indexOf('/storage/v1/object/sign/');
  assert.ok(소속 !== -1, '큐 소속 재확인이 없다 — 폐기·철회·확정분에 서명이 나간다(§4)');
  assert.ok(소속 < 서명, '소속 확인이 서명보다 뒤다 — 그 사이에 이미 주소가 만들어진다');
});
