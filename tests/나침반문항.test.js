/* 나침반 문항 — 「왼쪽」이 그날 안 담기면 그 학생의 회고는 영원히 반쪽이다.
 *
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §3-1·§9-2 (유호님 확정 6건 · 2026-08-12).
 *
 * ■ 이 검사가 지키는 다섯
 *   ① **문항 묶음이 회차별로 정확한가** — 입학 4 · 시즌 2. 개수가 갈리면 시즌 1과 시즌 2의
 *      답 개수가 달라 **병치표가 통째로 갈린다**(설계 §9-2 ㉢ — 개수는 비싼 축).
 *   ② 🔴 **lib 판정과 DB CHECK 가 같은 키 집합인가** — 같은 판정이 두 층에 산다(하나는 JS,
 *      하나는 DDL). 없앨 수 없는 사본은 기계에 물린다(`골든표본.test.js` 선례). 갈리면
 *      **JS 는 통과시키고 DB 가 거절**하고, 그 거절은 강사 화면에서 「저장이 안 된다」로만 보인다.
 *   ③ **빈 답·모르는 키를 거절하는가** — 통과시키면 오타 키가 그대로 앉고 병치 쿼리는 그
 *      학생만 빈칸으로 그린다. 실패가 「데이터가 없다」의 얼굴로 오는 자리다.
 *   ④ **`self_in_5y_changed` 가 회차를 가르는가** — 입학 행에 `false` 를 적으면 「물었고 안
 *      바꿨다」가 되어 있지도 않은 지난 답을 가리킨다.
 *   ⑤ **몽골어 라벨을 지어 넣지 않았는가** — 검수자 1인이 아직 안 봤다(설계 §9-2 ㉦-2).
 *      미검수 번역이 화면에 오르면 그것이 사실상 정본이 된다.
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 쓰는 표기 — 실제 마이그레이션 원문을 읽는다(픽스처 문자열만 재지 않는다).
 *   ② 미실행이 통과와 같은 모양이면 안 된다 — 제약을 못 찾으면 **거기서 실패**한다.
 *   ③ 탐지력은 픽스처로 못박는다 — 실저장소가 지금 깨끗하다는 것만으로는 검사가 도는지 모른다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { 코드만, 코드만픽스처 } = require('./lib/소스검사.js');
const 나침반 = require('../lib/나침반문항.js');
const { 종류, 문항, 입학키, 시즌키, 물을것, 답검사, 서술상한, 한줄상한 } = 나침반;

const 뿌리 = path.resolve(__dirname, '..');
const 조각경로 = path.join(뿌리, 'supabase', 'migrations', '20260812140000_season_c11.sql');
assert.ok(fs.existsSync(조각경로), `${조각경로} 가 없다 — ② 가 통째로 미실행이다`);

/** SQL 주석을 뗀다 — 안 떼면 머리말의 설명 문자열이 검사에 걸려 영원히 초록이 된다.
 *  ⚠ 줄 주석 `--` 도 뗀다: 블록만 떼던 옛 판은 `-- ends_on 은 …` 같은 한 줄 설명을
 *  코드로 읽었다. JS 공용 통로(`tests/lib/소스검사.js`)는 **언어가 달라** 여기 못 쓴다. */
const SQL = fs.readFileSync(조각경로, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

/* ── ① 문항 묶음 ─────────────────────────────────────────────────────── */

test('입학 4문항 · 시즌 2문항 — 개수와 순서가 설계 그대로다', () => {
  assert.deepEqual(입학키, ['why_learning', 'self_in_5y', 'topik_use', 'season_goal']);
  assert.deepEqual(시즌키, ['self_in_5y', 'season_goal']);
  assert.equal(물을것(종류.입학, 'study').length, 4);
  assert.equal(물을것(종류.시즌, 'study').length, 2);
});

test('시즌 문항은 입학 문항의 부분집합이다 — 아니면 병치표가 시즌마다 다른 축을 센다', () => {
  for (const 키 of 시즌키) assert.ok(입학키.includes(키), `${키} 가 입학 묶음에 없다`);
});

test('`topik_use` 는 목적별로 «문구만» 갈린다 — 키는 하나다(설계 §9-2 ㉦-1)', () => {
  const 유학 = 물을것(종류.입학, 'study').find((q) => q.키 === 'topik_use');
  const 컬처 = 물을것(종류.입학, 'culture').find((q) => q.키 === 'topik_use');
  assert.equal(유학.키, 컬처.키, '키가 갈리면 병치표가 목적별로 갈린다');
  assert.notEqual(유학.라벨, 컬처.라벨, 'culture 문구가 안 갈렸다 — TOPIK 문항이 그 학생에겐 빈칸이 된다');
  assert.ok(!컬처.라벨.includes('TOPIK'), 'culture 문구에 TOPIK 이 남아 있다');
  // 목적을 모를 때(신규·미기입)는 기본 문구로 떨어진다 — 빈 화면이 되면 안 된다.
  assert.equal(물을것(종류.입학, null).find((q) => q.키 === 'topik_use').라벨, 유학.라벨);
});

/* ── ⑤ 몽골어 ────────────────────────────────────────────────────────── */

test('🔴 몽골어 라벨을 지어 넣지 않았다 — 검수 선행(설계 §9-2 ㉦-2)', () => {
  for (const q of 문항) {
    assert.equal(q.라벨_mn, null, `${q.키} 에 미검수 몽골어가 들어갔다`);
  }
});

/* ── ③④ 답검사 ──────────────────────────────────────────────────────── */

const 입학답 = () => ({
  why_learning: '한국 대학에 가고 싶어서',
  self_in_5y: '서울에서 공부하는 나',
  topik_use: '내년 유학 지원에 쓴다',
  season_goal: '이번 교재 대화편을 끝까지 소리 내어 읽기',
});
const 시즌답 = () => ({
  self_in_5y: '서울에서 공부하는 나',
  season_goal: '이번 교재의 받아쓰기를 매주 한 번씩',
});

test('정상 답은 통과한다 — 통과가 없으면 아래 실패 검사들이 무엇을 재는지 모른다', () => {
  assert.equal(답검사(종류.입학, 입학답(), null), null);
  assert.equal(답검사(종류.입학, 입학답(), undefined), null);
  assert.equal(답검사(종류.시즌, 시즌답(), true), null);
  assert.equal(답검사(종류.시즌, 시즌답(), false), null);
});

test('빈 답은 실패다 — 「안 물어본 것」과 구별이 안 된다', () => {
  for (const 빈 of ['', '   ', null, undefined, 3]) {
    const 답 = { ...입학답(), why_learning: 빈 };
    const 흠 = 답검사(종류.입학, 답, null);
    assert.ok(흠 && 흠.필드 === 'why_learning', `${JSON.stringify(빈)} 이 통과했다`);
  }
  assert.ok(답검사(종류.입학, {}, null), '빈 객체가 통과했다');
  assert.ok(답검사(종류.입학, null, null), 'null 이 통과했다');
});

test('모르는 키는 실패다 — 오타 키가 앉으면 그 학생만 조용히 빈칸이 된다', () => {
  const 흠 = 답검사(종류.입학, { ...입학답(), why_learn: '오타' }, null);
  assert.ok(흠 && 흠.필드 === 'why_learn', '오타 키가 통과했다');
  // 시즌 회차에 입학 문항을 섞는 것도 같은 실패다(회차를 위장하는 자리).
  const 섞임 = 답검사(종류.시즌, { ...시즌답(), why_learning: '섞음' }, true);
  assert.ok(섞임 && 섞임.필드 === 'why_learning', '시즌 회차가 입학 문항을 받았다');
});

test('서술 상한 — 한 칸이 문서가 되는 것을 막는다(`season_goal` 은 한 줄)', () => {
  assert.ok(한줄상한 < 서술상한, '한 줄 상한이 서술 상한보다 작아야 한다');
  assert.equal(답검사(종류.입학, { ...입학답(), why_learning: '가'.repeat(서술상한) }, null), null);
  assert.ok(답검사(종류.입학, { ...입학답(), why_learning: '가'.repeat(서술상한 + 1) }, null));
  assert.ok(답검사(종류.입학, { ...입학답(), season_goal: '가'.repeat(한줄상한 + 1) }, null));
});

test('🔑 `self_in_5y_changed` 가 회차를 가른다 — 접으면 대조군의 분모가 거짓이 된다', () => {
  // 시즌 회차: boolean 필수(null 이면 「안 눌렀다」와 「안 물었다」가 같은 값이 된다)
  for (const 나쁨 of [null, undefined, 'true', 1]) {
    const 흠 = 답검사(종류.시즌, 시즌답(), 나쁨);
    assert.ok(흠 && 흠.필드 === 'self_in_5y_changed', `${JSON.stringify(나쁨)} 이 통과했다`);
  }
  // 입학 회차: null 이어야 한다(false 면 있지도 않은 지난 답을 가리킨다)
  for (const 나쁨 of [true, false]) {
    const 흠 = 답검사(종류.입학, 입학답(), 나쁨);
    assert.ok(흠 && 흠.필드 === 'self_in_5y_changed', `입학 행이 ${나쁨} 을 받았다`);
  }
});

test('모르는 회차는 실패다 — 통과시키면 시즌키 묶음으로 조용히 떨어진다', () => {
  const 흠 = 답검사('입학', 입학답(), null);
  assert.ok(흠 && 흠.필드 === '회차', '한글 회차 문자열이 통과했다');
});

/* ── ② 🔴 lib ↔ DB CHECK 대조 ────────────────────────────────────────── */

/** 마이그레이션 CHECK 안의 키 배열을 뽑는다. 두 갈래 × 두 연산자(`?&`·`-`) = 넷이다. */
function SQL키집합(연산자) {
  const 정규식 = new RegExp(`answers\\s*\\${연산자}(?:&)?\\s*array\\[([^\\]]*)\\]`, 'g');
  const 뽑힘 = [];
  for (const m of SQL.matchAll(정규식)) {
    뽑힘.push(m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')));
  }
  return 뽑힘;
}

test('🔴 DB CHECK 가 실제로 서 있다 — 없으면 이 절 전체가 미실행이다', () => {
  assert.ok(SQL.includes('season_compass_answers_c11'),
    'season_compass_answers_c11 제약이 조각에 없다');
  assert.ok(SQL.includes('season_compass_once_c11'),
    '학생×시즌 유일키가 없다 — 같은 시즌에 두 행이 서면 회고가 어느 것을 왼쪽으로 쓸지 모른다');
});

test('🔴 lib 의 두 키 묶음 = DB CHECK 의 두 키 묶음 (갈리면 JS 통과 → DB 거절)', () => {
  const 있나 = SQL키집합('?');   // answers ?& array[...]
  const 남나 = SQL키집합('-');   // answers - array[...] = '{}'
  assert.equal(있나.length, 2, `?& 갈래가 2개가 아니다(${있나.length}) — 회차가 둘이라 둘이어야 한다`);
  assert.equal(남나.length, 2, `- 갈래가 2개가 아니다(${남나.length})`);

  /* 한 갈래 «안»에서 두 배열이 다르면 그 차이만큼 여분 키가 통과한다 —
   * `?&` 는 「전부 있나」만 보고 여분을 못 잡기 때문이다. 그래서 짝부터 맞춘다. */
  assert.deepEqual(있나[0], 남나[0], '입학 갈래의 두 배열이 갈렸다 — 여분 키가 샌다');
  assert.deepEqual(있나[1], 남나[1], '시즌 갈래의 두 배열이 갈렸다 — 여분 키가 샌다');

  assert.deepEqual([...있나[0]].sort(), [...입학키].sort(), '입학 묶음이 lib 와 갈렸다');
  assert.deepEqual([...있나[1]].sort(), [...시즌키].sort(), '시즌 묶음이 lib 와 갈렸다');
});

test('탐지력 픽스처 — 키 하나만 갈려도 위 대조가 실제로 잡는다', () => {
  const 가짜 = ['why_learning', 'self_in_5y', 'topik_use'];   // season_goal 이 빠진 판
  assert.notDeepEqual([...가짜].sort(), [...입학키].sort(),
    '이 픽스처가 같다고 나오면 위 대조가 죽은 것이다');
  // `?&` 가 여분 키를 못 잡는다는 성질 자체도 못박는다(그래서 `-` 갈래가 필요하다).
  const 여분 = [...입학키, 'why_learn'];
  assert.ok(입학키.every((k) => 여분.includes(k)),
    '「전부 있나」만으로는 여분 키를 못 잡는다 — 이 사실이 거짓이면 `-` 갈래를 뺄 수 있다');
  assert.notDeepEqual([...여분].sort(), [...입학키].sort());
});

/* ── DDL 이 지켜야 할 나머지 ─────────────────────────────────────────── */

test('🔴 화면의 회차 사본이 lib 와 같다 — 없앨 수 없는 사본은 기계에 물린다', () => {
  /* 화면은 「시즌 회차면 ②를 버튼으로 그린다」를 판단해야 하는데, 서버가 회차 어휘를
   * 값목록으로 내주는 경로가 없다(응답의 `round` 문자열 하나뿐). 그래서 사본이 생겼고,
   * 갈리면 **입학 화면이 시즌 화면으로 그려진다** — 지난 답이 없는데 [그대로] 버튼이 뜨고,
   * 학생은 빈 문장을 확정하게 된다. 증상이 조용한 자리라 여기서 못박는다. */
  /* ⚠ `require` 로 못 읽는다 — JSX 라 순수 node 에서 파싱이 죽는다(다른 화면 검사가 babel
   *   하네스를 쓰는 이유). 그래서 **원문에서** 리터럴을 뽑아 대조한다. */
  const 화면원문 = fs.readFileSync(path.join(뿌리, 'src', '나침반화면.js'), 'utf8');
  const m = /export const 회차 = Object\.freeze\(\{([^}]*)\}\)/.exec(화면원문);
  assert.ok(m, 'src/나침반화면.js 에서 회차 선언을 못 찾았다 — 이 검사가 통째로 미실행이다');
  const 사본 = Object.fromEntries([...m[1].matchAll(/(\S+):\s*'([^']+)'/g)].map((x) => [x[1], x[2]]));
  assert.deepEqual(사본, { 입학: 종류.입학, 시즌: 종류.시즌 },
    'src/나침반화면.js 의 회차 사본이 lib/나침반문항.js 와 갈렸다');
});

test('시즌 경계가 겹치지 않는다 — 겹치면 「오늘의 시즌」이 조회 순서에 달린다', () => {
  assert.ok(SQL.includes('season_no_overlap_c11'), '겹침 배제 제약이 없다');
  assert.ok(/exclude\s+using\s+gist/.test(SQL), '배제 제약이 gist 가 아니다');
});

test('🔴 시즌 주기 상수를 코드에 박지 않았다 — 주기는 `season` 행의 데이터다(유호 확정)', () => {
  // 「2달」이 DDL 에 기본값·CHECK 로 굳으면 교재가 늦게 끝나는 날 운영이 DDL 을 고치게 된다.
  assert.ok(!/interval\s*'2\s*month/i.test(SQL), 'DDL 에 2개월 간격이 박혔다');
  assert.ok(!/ends_on[^,]*default/i.test(SQL), 'ends_on 에 기본값이 박혔다 — 끝을 미리 정하는 자리다');
  /* 🔴 주석을 지우고 잰다 — 금지어가 「2개월」·「60*24」라, lib 이 자기 머리말에서 «주기를 여기
   *   두지 않는 이유»를 설명하는 순간(설명하려면 그 낱말을 써야 한다) 거짓 적색이 났다.
   *   ⚠ 위 `SQL` 은 안 감싼다 — 언어가 달라 이 통로가 못 읽는다(SQL 은 이 파일의 SQL 제거기 몫). */
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다');
  const 코드 = 코드만(fs.readFileSync(path.join(뿌리, 'lib', '나침반문항.js'), 'utf8'));
  assert.ok(!/60\s*\*\s*24|2\s*개월|two\s*month/i.test(코드), 'lib 에 주기 상수가 들어갔다');
});

test('나침반 행은 삭제를 막는다 — 소급이 원리상 불가능하다', () => {
  assert.ok(SQL.includes('season_compass_protect'), '보호 트리거가 없다');
  assert.ok(/before\s+delete\s+on\s+engine\.season_compass/i.test(SQL),
    '삭제 트리거가 season_compass 에 안 걸렸다');
  /* ⚠ update 는 **일부러 안 막는다**(조각 머리말) — 막으면 강사가 촉진 세션 그 자리에서
   *   오타를 못 고치고, 남는 통로가 「지우고 다시 넣기」=delete 라 우회가 정상 통로가 된다. */
  assert.ok(!/before\s+(insert\s+or\s+)?update[\s\S]{0,80}season_compass_protect/i.test(SQL),
    'update 까지 막았다 — 고치려다 막히면 우회가 정상 통로가 된다(F103)');
});
