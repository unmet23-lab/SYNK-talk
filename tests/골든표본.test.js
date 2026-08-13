/* 골든 표본 조립기 — `lib/골든표본.js` (M2 라벨회로 설계 §4).
 *
 * ■ 무엇을 지키나
 *   ① **재현성** — 소비자 둘(`teach` 문 · `tools/성적표.js`)이 **같은 5건**을 본다. 이것이
 *      깨지면 완료율·승률의 분모와 분자가 다른 표본을 세고, 그 어긋남은 어디서도 안 빨개진다.
 *   ② **입력 순서 독립** — 풀이 어떤 순서로 와도 같은 5건. `order by` 없는 SELECT 의 순서는
 *      계약이 아니라서, 정렬을 빼면 실행 계획이 바뀌는 날 표본이 조용히 갈린다.
 *   ③ **ISO 주 경계** — 연말연시 며칠은 달력의 해와 주의 해가 다르다. 틀리면 한 해에 한 번
 *      풀이 통째로 빈 주가 생기고 증상은 「이번 주 표본 0건」뿐이다.
 *   ④ **주 시드는 매주 갈린다** — AS 가 금지한 「결정적 해시」의 병(매주 같은 것이 뽑힌다)에
 *      안 걸리는지 실제로 센다.
 *   ⑤ **모양 위반은 null** — 지어내지 않는다.
 *
 * ⚠ 이 파일은 **탐지력을 픽스처로 진다**(실저장소 상태에 안 기댄다). ②는 변이(정렬 제거)로
 *   빨개지는 것을 실측해 두었다 — 「지킨다」는 얼굴만 남는 검사를 만들지 않기 위해서다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 코드만, 코드만픽스처 } = require('./lib/소스검사.js');

const 뿌리 = path.resolve(__dirname, '..');
const {
  주당건수, 표본, 지난주키, 주범위, 키, 키풀기, iso주, 주월요일, fnv1a, mulberry32,
} = require(path.join(뿌리, 'lib', '골든표본.js'));

/** id 만 있는 풀 n 개 — 실제 행은 열이 더 많지만 조립기가 보는 것은 `correction_id` 뿐이다. */
const 풀만들기 = (n, 접두 = 'c') => Array.from({ length: n }, (_, i) => ({
  correction_id: `${접두}${String(i).padStart(3, '0')}`,
}));

const ids = (rows) => rows.map((r) => r.correction_id);

/* ── ① 재현성 ─────────────────────────────────────────────────────── */

test('① 같은 주키·같은 풀이면 몇 번을 돌려도 같은 5건', () => {
  const 풀 = 풀만들기(40);
  const a = 표본(풀, '2026-W32');
  const b = 표본(풀, '2026-W32');
  assert.deepEqual(ids(a), ids(b));
  assert.equal(a.length, 5);
});

test('① 상수 5 = 주당건수 — 화면·성적표가 각자 숫자를 들지 않는다', () => {
  assert.equal(주당건수, 5);
  assert.equal(표본(풀만들기(40), '2026-W32').length, 주당건수);
});

test('① 풀이 5건 미만이면 있는 만큼만 (0건도 정상 — 그 주에 AI 교정이 없었을 뿐이다)', () => {
  assert.equal(표본(풀만들기(3), '2026-W32').length, 3);
  assert.deepEqual(표본([], '2026-W32'), []);
});

/* ── ② 입력 순서 독립 (정렬이 먼저인 것의 값) ───────────────────────── */

test('② 풀을 뒤집어 넣어도 같은 5건 — 정렬을 빼면 여기가 빨개진다', () => {
  const 풀 = 풀만들기(40);
  const 정 = ids(표본(풀, '2026-W32'));
  const 역 = ids(표본(풀.slice().reverse(), '2026-W32'));
  assert.deepEqual(역, 정);
});

test('② 풀을 임의로 섞어 넣어도 같은 5건 (10가지 순서 전부)', () => {
  const 풀 = 풀만들기(40);
  const 기준 = ids(표본(풀, '2026-W33'));
  const rng = mulberry32(12345);
  for (let 회 = 0; 회 < 10; 회 += 1) {
    const 섞은 = 풀.slice();
    for (let i = 섞은.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [섞은[i], 섞은[j]] = [섞은[j], 섞은[i]];
    }
    assert.deepEqual(ids(표본(섞은, '2026-W33')), 기준, `${회}번째 순서에서 갈렸다`);
  }
});

test('② n 을 줄여도 앞쪽이 안 바뀐다 — 상수를 고쳐도 과거 주의 표본이 소급으로 안 바뀐다', () => {
  const 풀 = 풀만들기(40);
  const 다섯 = ids(표본(풀, '2026-W32', 5));
  const 셋 = ids(표본(풀, '2026-W32', 3));
  assert.deepEqual(셋, 다섯.slice(0, 3));
});

/* ── ③ ISO 주 경계 ────────────────────────────────────────────────── */

test('③ 2026-01-01(목)은 2026-W01 이다 — 그 주 목요일이 2026년', () => {
  const w = iso주(new Date('2026-01-01T00:00:00Z'));
  assert.deepEqual(w, { 연: 2026, 주: 1 });
});

test('③ 2025-12-29(월)도 2026-W01 이다 — 달력 해와 주의 해가 갈리는 자리', () => {
  const w = iso주(new Date('2025-12-29T00:00:00Z'));
  assert.deepEqual(w, { 연: 2026, 주: 1 });
});

test('③ 2021-01-01(금)은 2020-W53 이다 — 해를 거꾸로 넘는 갈래', () => {
  const w = iso주(new Date('2021-01-01T00:00:00Z'));
  assert.deepEqual(w, { 연: 2020, 주: 53 });
});

test('③ 주월요일은 언제나 월요일 00:00Z 이고, 그 주의 iso주로 되돌아온다(왕복)', () => {
  for (const [연, 주] of [[2026, 1], [2026, 32], [2026, 53], [2020, 53], [2024, 9]]) {
    const 월 = 주월요일(연, 주);
    if (연 === 2026 && 주 === 53) continue; // 2026 은 52주까지 — 아래 별건 검사
    assert.equal(월.getUTCDay(), 1, `${연}-W${주} 이 월요일이 아니다`);
    assert.equal(월.toISOString().slice(11), '00:00:00.000Z');
    assert.deepEqual(iso주(월), { 연, 주 }, `${연}-W${주} 왕복 실패`);
  }
});

test('③ 지난주키 — 화요일에 물으면 지난 주다(이번 주가 아니다)', () => {
  // 2026-08-11 은 화요일 · 2026-W33 → 지난 완결 주는 W32
  assert.equal(지난주키(new Date('2026-08-11T09:00:00Z')), '2026-W32');
});

test('③ 지난주키 — 월요일 00:00Z 정각에도 지난 주다(경계에서 이번 주로 미끄러지지 않는다)', () => {
  assert.equal(지난주키(new Date('2026-08-10T00:00:00Z')), '2026-W32');
});

test('③ 지난주키 — 연초 월요일에 물으면 지난 해의 마지막 주다', () => {
  // 2026-01-05(월) = 2026-W02 → 지난 주는 2026-W01(2025-12-29 시작)
  assert.equal(지난주키(new Date('2026-01-05T00:00:00Z')), '2026-W01');
  // 2025-12-29(월) = 2026-W01 → 지난 주는 2025-W52
  assert.equal(지난주키(new Date('2025-12-29T12:00:00Z')), '2025-W52');
});

/* ── ③-b 주범위 = 반열린 구간 ─────────────────────────────────────── */

test('③-b 주범위는 월요일 00:00Z 부터 7일 — 끝은 다음 주 시작과 «같다»(반열린)', () => {
  const r = 주범위('2026-W32');
  assert.equal(r.시작, '2026-08-03T00:00:00.000Z');
  assert.equal(r.끝, '2026-08-10T00:00:00.000Z');
  assert.equal(주범위('2026-W33').시작, r.끝);
});

test('③-b 주범위·키풀기는 모양이 아니면 null', () => {
  for (const 나쁨 of ['2026-32', '26-W32', '2026-W0', '2026-W54', '2026-W00', '', null, undefined]) {
    assert.equal(주범위(나쁨), null, `${나쁨} 이 통과했다`);
    assert.equal(키풀기(나쁨), null, `${나쁨} 이 통과했다`);
  }
});

test('③-b 키는 0 채움 2자리 — 문자열 정렬이 곧 시간순이다', () => {
  assert.equal(키(2026, 7), '2026-W07');
  const 정렬 = [키(2026, 10), 키(2026, 2), 키(2026, 1)].sort();
  assert.deepEqual(정렬, ['2026-W01', '2026-W02', '2026-W10']);
});

/* ── ④ 매주 갈린다 (「결정적 해시」의 병에 안 걸린다) ─────────────────── */

test('④ 같은 풀이어도 주가 다르면 다른 표본 — 20주를 세서 「매주 같은 5건」이 아님을 실측', () => {
  const 풀 = 풀만들기(40);
  const 본것 = new Set();
  for (let w = 1; w <= 20; w += 1) 본것.add(ids(표본(풀, 키(2026, w))).join(','));
  /* 20주가 전부 같으면 1 이다 — 그것이 AS 가 금지한 병의 모양이다.
   * 우연한 재현이 몇 번 있어도 좋다(무작위니까). 「거의 매주 갈린다」만 본다. */
  assert.ok(본것.size >= 18, `20주 중 서로 다른 표본이 ${본것.size}가지뿐이다`);
});

test('④ 20주에 걸쳐 특정 항목이 독식하지 않는다 — 40건 풀에서 20개 넘는 항목이 등장', () => {
  const 풀 = 풀만들기(40);
  const 등장 = new Set();
  for (let w = 1; w <= 20; w += 1) ids(표본(풀, 키(2026, w))).forEach((id) => 등장.add(id));
  assert.ok(등장.size >= 20, `100번 뽑았는데 ${등장.size}종만 나왔다`);
});

test('④ fnv1a·mulberry32 는 결정적이고 서로 다른 입력에 다른 값을 낸다', () => {
  assert.equal(fnv1a('2026-W32'), fnv1a('2026-W32'));
  assert.notEqual(fnv1a('2026-W32'), fnv1a('2026-W33'));
  assert.equal(typeof fnv1a('x'), 'number');
  assert.ok(fnv1a('x') >= 0 && fnv1a('x') <= 0xffffffff);
  const r1 = mulberry32(7);
  const r2 = mulberry32(7);
  for (let i = 0; i < 5; i += 1) {
    const v = r1();
    assert.equal(v, r2());
    assert.ok(v >= 0 && v < 1, `${v} 가 [0,1) 밖이다`);
  }
});

/* ── ⑤ 모양 위반은 null ───────────────────────────────────────────── */

test('⑤ 풀에 id 중복이 있으면 null — 그 행만 추첨 확률이 두 배가 된다', () => {
  const 풀 = [...풀만들기(5), { correction_id: 'c002' }];
  assert.equal(표본(풀, '2026-W32'), null);
});

test('⑤ correction_id 가 없거나 비면 null (지어내지 않는다)', () => {
  assert.equal(표본([{ correction_id: '' }], '2026-W32'), null);
  assert.equal(표본([{ correction_id: null }], '2026-W32'), null);
  assert.equal(표본([{}], '2026-W32'), null);
  assert.equal(표본([null], '2026-W32'), null);
});

test('⑤ 풀이 배열이 아니거나 주키·n 이 모양이 아니면 null', () => {
  assert.equal(표본(null, '2026-W32'), null);
  assert.equal(표본('c1,c2', '2026-W32'), null);
  assert.equal(표본(풀만들기(5), '지난주'), null);
  assert.equal(표본(풀만들기(5), '2026-W32', 0), null);
  assert.equal(표본(풀만들기(5), '2026-W32', 1.5), null);
});

/* ── ⑥ 이 파일이 무작위를 직접 부르지 않는다 ───────────────────────── */

test('⑥ 조립기 소스에 `Math.random` 이 없다 — 있으면 재현이 원리상 불가능하다', () => {
  /* 🔴 옛 판은 원문을 재면서 **주석 쪽 표기 관례**로 버텼다 — 「`Math.random` 은 부르지 않는다」를
   *   백틱으로 감싸 괄호를 안 붙이는 규칙. 규칙이 사람 기억에 얹혀 있으면 언젠가 깨지고, 그날의
   *   증상은 「멀쩡한 파일이 적색」이다. 통로로 지우면 그 관례 자체가 필요 없어진다. */
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다');
  const 코드 = 코드만(require('node:fs').readFileSync(path.join(뿌리, 'lib', '골든표본.js'), 'utf8'));
  assert.equal(/Math\.random\s*\(/.test(코드), false, 'Math.random 호출이 있다');
});
