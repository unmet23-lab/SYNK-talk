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

const 뿌리 = path.resolve(__dirname, '..');
const 함수방 = path.join(뿌리, 'supabase', 'functions', 'review');
const 본체경로 = path.join(함수방, 'index.ts');

assert.ok(fs.existsSync(본체경로), 'functions/review/index.ts 가 없다 — 이 검사가 통째로 미실행이다');
const 소스 = fs.readFileSync(본체경로, 'utf8');
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

/** 소스의 `실패(<status>, { … code: 'X' … })` 전량 → `{코드: Set<상태>}`. */
function 코드사용() {
  const 쓰임 = {};
  for (const m of 소스.matchAll(/실패\(\s*(\d{3})\s*,\s*\{([\s\S]*?)\}\s*,/gu)) {
    const c = /code:\s*'([A-Z_]+)'/u.exec(m[2]);
    assert.ok(c, `실패(${m[1]}, …) 에 code 가 없다 — 봉투가 코드 없이 나간다`);
    (쓰임[c[1]] ??= new Set()).add(Number(m[1]));
  }
  assert.ok(Object.keys(쓰임).length >= 5, `실패() 호출을 ${Object.keys(쓰임).length}종밖에 못 찾았다 — 정규식이 낡았다`);
  return 쓰임;
}

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

test('계약에 있는데 안 쓰는 코드는 §5(c11 선행) 몫 하나뿐이다', () => {
  const 안씀 = Object.keys(계약오류표()).filter((c) => !코드사용()[c]);
  assert.deepEqual(안씀, ['GATE_NOT_MET'],
    '계약이 적은 코드를 통로가 안 쓴다 — 승인 게이트(§5)가 서면 이 줄이 그때 빨개져야 한다.\n'
    + '  🔴 여기서 초록으로 덮지 마라: 안 쓰는 코드를 늘리면 계약과 통로가 갈라진 것이 안 보인다');
});

/* ── ② 감사가 응답의 조건인가 (§2) ────────────────────────────────── */

test('큐 읽기와 조회 감사가 **한 트랜잭션**이다', () => {
  const 트랜잭션 = /sql\.begin\(async \(tx\) => \{([\s\S]*?)\n  \}\);/u.exec(소스);
  assert.ok(트랜잭션, 'sql.begin(...) 블록을 못 찾았다 — 읽기와 감사가 갈라졌거나 앵커가 낡았다');
  assert.match(트랜잭션[1], /from engine\.review_queue/u, '트랜잭션 안에서 판을 안 읽는다');
  assert.match(트랜잭션[1], /insert into engine\.staff_access_log/u,
    '감사 insert 가 트랜잭션 밖이다 — 감사가 실패해도 응답이 이미 나간 뒤가 된다(§2)');
});

test('감사 행위 이름 둘이 계약대로다 — 큐와 서명은 다른 사건이다', () => {
  assert.match(소스, /'review\.queue'/u, '큐 조회 감사 이름이 없다');
  assert.match(소스, /'review\.audio'/u, '서명 발급 감사 이름이 없다');
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
  assert.ok(!/role\s*(!=|<>)|not in \(/u.test(소스),
    '역할을 차단 목록으로 가른다 — 못 적은 역할이 새는 방향은 언제나 「통과」다');
});

test('직원 폐기 판정은 lib 정본을 부른다 (사본을 두지 않는다)', () => {
  assert.match(소스, /살아있는직원\(sql, 주체, 발급시각\(req\)\)/u,
    '폐기 판정을 안 부른다 — 폐기된 검수자의 옛 토큰이 큐를 계속 읽는다');
  assert.ok(!/revoked_before/u.test(소스),
    '폐기 술어를 이 파일이 직접 적는다 — 정본은 `lib/토큰.js` 하나다(절단문서 ②-15)');
});

/* ── ⑤ 판 하나만 읽는다 ───────────────────────────────────────────── */

test('직원 통로가 원표를 직접 안 읽는다 — 읽는 곳은 판 하나다', () => {
  for (const 표 of ['engine.submissions', 'engine.corrections', 'engine.pipeline_jobs', 'engine.learning_events']) {
    assert.ok(!소스.includes(`from ${표}`) && !소스.includes(`join ${표}`),
      `${표} 를 직접 읽는다 — 판(②-17)이 막아 둔 열이 이 문으로 도로 나간다`);
  }
  assert.match(소스, /from engine\.review_queue/u, '판을 안 읽는다 — 앵커가 낡았다');
});

/* ── ⑥ 경로·동봉 ──────────────────────────────────────────────────── */

test('경로는 둘이고 메서드가 갈린다 — 그 밖은 404 다', () => {
  assert.match(소스, /경로 !== 'queue' && 경로 !== 'audio'/u,
    '뒷마디를 안 본다 — `/review/아무거나` 가 전부 큐 조회로 동작한다');
  assert.match(소스, /경로 === 'queue' \? 'GET' : 'POST'/u, '경로별 메서드가 안 갈린다');
});

test('아직 없는 §5 경로를 빈 껍데기로 두지 않았다', () => {
  for (const 이름 of ['approve', 'discard']) {
    assert.ok(!new RegExp(`'${이름}'`, 'u').test(소스),
      `\`${이름}\` 경로가 섰다 — 담을 물리 칸 넷이 아직 없다(c11 선행 · §5). 화면이 그것을 부르게 된다`);
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
