/* 강사 통로 `functions/teach` — 설계(`docs/M2_라벨회로_설계.md`)와 배선이 갈라졌나.
 *
 * ■ 이 검사가 지키는 여덟
 *   ① **`review` 의 핀이 그대로인가** — 이 트랙의 급소. `검수역할` 에 teacher 가 들어가면
 *      강사가 골든셋 승인·폐기 권한과 **전사 덮어쓰기**까지 얻는다(approve 가
 *      `transcript_verified` 를 갱신한다). 실왕복 `검수왕복시험:230` 의 teacher→403 핀과
 *      **같은 사실을 코드층에서** 잡는다 — 실왕복은 배포된 판을 재고, 이 검사는 소스를 잰다.
 *   ② **역할이 허용 목록인가** — 차단 목록이면 못 적은 역할이 통과한다(새는 방향=통과).
 *   ③ **골든 소속이 «감사» 인가** — 역할 조인으로 가르면 director 겹침으로 검수 확정 행이
 *      골든으로 세어진다(반박 C1). 「이미 판정됨」·N12 조인이 전부 이 한 곳에서 나와야 한다.
 *   ④ **판정과 감사가 한 트랜잭션인가** — 나누면 골든 행은 남는데 소속이 증발하고, 그 행은
 *      성적표에서 조용히 빠지거나 잘못 세어진다(어느 쪽이든 증상이 없다).
 *   ⑤ **표본을 자체 구현하지 않는가** — 소비자 둘이 각자 뽑으면 다른 5건이 나온다.
 *   ⑥ **동의 두 뜻을 «판정에서도» 재는가** — 화면만 막으면 직접 호출로 그대로 통과한다.
 *   ⑦ **막힌 카드에 내용을 안 싣는가 · 모델명을 안 싣는가** — 전자는 설계 §4, 후자는
 *      판정 전 모델 노출이 강사 편향을 만들어 N12 승률에 그대로 들어가기 때문이다.
 *   ⑧ **동봉이 실제 lib 를 가리키는가** — 손 사본이 생기면 정본이 둘이 된다.
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 쓰는 표기 — 실제 `index.ts` 원문을 읽는다.
 *   ② 미실행이 통과와 같은 모양이면 안 된다 — 파일·앵커를 못 찾으면 **거기서 실패**한다.
 *   ③ 검사가 자기 주석에 눈멀지 않게 `코드만` 으로 주석을 지우고 센다(이 파일의 머리말에도
 *      `teacher`·`검수역할` 이 잔뜩 나온다 — 주석을 안 지우면 ① 이 영원히 초록이다).
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
const 동봉경로 = path.join(함수방, '동봉.json');
const 리뷰경로 = path.join(뿌리, 'supabase', 'functions', 'review', 'index.ts');

assert.ok(fs.existsSync(본체경로), 'functions/teach/index.ts 가 없다 — 이 검사가 통째로 미실행이다');
assert.ok(fs.existsSync(리뷰경로), 'functions/review/index.ts 가 없다 — ① 이 미실행이다');
const 원문 = fs.readFileSync(본체경로, 'utf8');
const 소스 = 코드만(원문);
const 리뷰소스 = 코드만(fs.readFileSync(리뷰경로, 'utf8'));

/* ── ① review 의 핀 (급소) ────────────────────────────────────────── */

test('① `review` 의 검수역할에 teacher 가 없다 — 넣으면 전사 덮어쓰기까지 열린다', () => {
  const m = /const\s+검수역할\s*=\s*\[([^\]]*)\]/.exec(리뷰소스);
  assert.ok(m, 'review 의 검수역할 선언을 못 찾았다 — 이름이 바뀌었으면 이 검사부터 고친다');
  const 역할 = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(역할.slice().sort(), ['director', 'inspector']);
  assert.ok(!역할.includes('teacher'), 'review 에 teacher 가 들어갔다 — 권한 오염');
});

test('① `review` 는 teach 의 경로를 모른다 — 두 문이 섞이지 않았다', () => {
  assert.ok(!/gold\/(queue|judge)/.test(리뷰소스), 'review 가 골든 경로를 안다 — 문이 섞였다');
});

/* ── ② 허용 목록 ──────────────────────────────────────────────────── */

test('② 강사역할은 허용 목록이고 teacher·director 둘뿐이다', () => {
  const m = /const\s+강사역할\s*=\s*\[([^\]]*)\]/.exec(소스);
  assert.ok(m, '강사역할 선언을 못 찾았다');
  const 역할 = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(역할.slice().sort(), ['director', 'teacher']);
  assert.ok(!역할.includes('inspector'), 'inspector 가 강사 문에 들어갔다');
});

test('② 역할 검사가 `role = any(강사역할)` 로 DB 에서 걸린다(JS 뒤 검사가 아니다)', () => {
  assert.match(소스, /role\s*=\s*any\(\$\{강사역할\}::text\[\]\)/);
});

test('② 「직원이 아니다」와 「폐기됐다」가 같은 코드다 — 가르면 계정 존재를 말한다', () => {
  assert.match(소스, /code:\s*'NOT_STAFF'/);
  /* 살아있는직원 사슬을 쓰는가 — 자기 조건을 새로 적으면 그것이 다섯 번째 사본이다. */
  assert.match(소스, /살아있는직원\(sql,\s*주체,\s*발급시각\(req\)\)/);
});

/* ── ③ 골든 소속 = 감사 (역할 조인이 아니다) ───────────────────────── */

test('③ 「이미 판정됨」을 `teach.gold.judge` 감사에서 읽는다', () => {
  const 감사판별 = 소스.match(/action\s*=\s*'teach\.gold\.judge'/g) ?? [];
  /* 두 자리 = 큐의 상태 표시 · 판정의 중복 검사. 둘 다 같은 조인이어야 한다. */
  assert.ok(감사판별.length >= 2, `감사 조인이 ${감사판별.length}자리뿐이다 — 큐·판정 둘 다 써야 한다`);
});

test('③ 골든/검수 판별에 «역할 조인»을 쓰지 않는다 — director 겹침(반박 C1)', () => {
  /* corrections 를 actor_kind 로 걸러 골든을 찾는 자리가 있으면 그것이 그 병이다.
   * (AI 행을 고르는 `c.actor_kind = 'ai'` 는 평가 «대상» 이지 소속 판별이 아니다.) */
  assert.ok(!/actor_kind\s*=\s*'teacher'\s*(?![^\n]*insert)/.test(소스.replace(/insert[\s\S]*?returning/g, '')),
    "actor_kind='teacher' 로 골든을 찾는 자리가 있다 — 검수 확정 행과 안 갈린다");
});

test('③ 감사 `target_ids` 에 둘을 담는다 — [평가 대상, 골든 행]', () => {
  assert.match(소스, /'teach\.gold\.judge',\s*\n?\s*array\[\$\{ai\.correction_id\}::uuid,\s*\$\{골든\.correction_id\}::uuid\]/);
});

/* ── ④ 한 트랜잭션 ────────────────────────────────────────────────── */

test('④ 판정 insert 와 감사 insert 가 같은 `sql.begin` 안이다', () => {
  const i = 소스.indexOf('async function 판정하기');
  assert.ok(i > 0, '판정하기 함수를 못 찾았다');
  /* [2026-08-12] 끝을 **다음 함수**로 못박는다 — 옛 판은 파일 «끝»까지 잘랐다. 그래서 이
   * 파일에 새 핸들러(나침반 두 경로)가 붙는 순간 그 함수들의 `sql.begin` 이 「판정하기가
   * 트랜잭션을 둘로 갈랐다」로 잡혔다. 코드가 아니라 **재는 층**이 틀렸던 자리다(멀쩡한
   * 것이 빨개진다 · F287 계열). 아래 새 검사가 나침반 쪽 같은 성질을 따로 진다. */
  const 다음 = 소스.indexOf('\nasync function ', i + 1);
  const 본문 = 소스.slice(i, 다음 > i ? 다음 : undefined);
  const b = 본문.indexOf('sql.begin');
  assert.ok(b > 0, '판정하기가 트랜잭션을 안 연다');
  const 골든삽입 = 본문.indexOf('insert into engine.corrections');
  const 감사삽입 = 본문.indexOf('insert into engine.staff_access_log');
  assert.ok(골든삽입 > b && 감사삽입 > b, '두 쓰기 중 하나가 트랜잭션 밖이다');
  /* 두 쓰기 사이에 트랜잭션이 닫히면 안 된다 — 콜백 밖으로 나가는 자리가 없는지 본다. */
  assert.ok(본문.slice(b).indexOf('sql.begin', 1) === -1, '트랜잭션이 둘로 갈렸다');
});

test('④ 큐도 읽기와 감사가 한 트랜잭션이고, 0건도 1행 남긴다', () => {
  const i = 소스.indexOf('async function 큐읽기');
  const j = 소스.indexOf('async function 판정하기');
  const 본문 = 소스.slice(i, j > i ? j : undefined);
  assert.match(본문, /sql\.begin/);
  assert.match(본문, /'teach\.gold\.queue'/);
  /* 감사가 `if (!ids.length) return` «앞»에 있어야 0건도 남는다. */
  const 감사 = 본문.indexOf("'teach.gold.queue'");
  const 조기반환 = 본문.indexOf('if (!ids.length)');
  assert.ok(감사 > 0 && 조기반환 > 감사, '0건이면 감사를 건너뛴다 — 조회 분모가 조용히 달라진다');
});

test('④ 동시 판정을 `for update` 로 직렬화한다', () => {
  assert.match(소스, /for update of c/);
});

/* ── ⑤ 표본은 lib 하나에서 ────────────────────────────────────────── */

test('⑤ 표본·주 키를 lib 에서 가져온다(자체 구현 0)', () => {
  assert.match(원문, /from '\.\/골든표본\.mjs'/);
  for (const 이름 of ['표본', '지난주키', '주범위']) {
    assert.ok(소스.includes(이름), `${이름} 을 안 쓴다`);
  }
});

test('⑤ 문 안에서 셔플·해시를 다시 짜지 않는다', () => {
  for (const 금지 of ['Math.random', 'mulberry32(', 'fnv1a(']) {
    assert.ok(!소스.includes(금지), `${금지} 가 문 안에 있다 — 표본 정본이 둘이 된다`);
  }
});

test('⑤ 주를 «서버가» 정한다 — 파라미터로 받으면 표본을 골라 볼 수 있다', () => {
  const i = 소스.indexOf('async function 큐읽기');
  const j = 소스.indexOf('async function 판정하기');
  const 본문 = 소스.slice(i, j);
  assert.match(본문, /지난주키\(\)/);
  assert.ok(!/searchParams\.get\(['"]week/.test(본문), 'week 를 요청에서 받는다 — 무작위가 깨진다');
});

test('⑤ 판정은 «그 행이 속한 주»로 역산한다 — 주가 바뀌어도 판정하던 5건이 안 사라진다', () => {
  const 본문 = 소스.slice(소스.indexOf('async function 판정하기'));
  assert.match(본문, /iso주\(new Date\(ai\.created_at/);
  assert.match(본문, /NOT_IN_SAMPLE/);
  assert.ok(!본문.includes('지난주키('), '판정이 「이번 주」를 쓴다 — 주말에 시작하면 표본이 사라진다');
});

/* ── ⑥ 동의 두 뜻 ─────────────────────────────────────────────────── */

test('⑥ 큐와 판정 «둘 다» 그때유효∧지금유효 를 건다', () => {
  for (const 이름 of ['큐읽기', '판정하기']) {
    const i = 소스.indexOf(`async function ${이름}`);
    const 끝 = 이름 === '큐읽기' ? 소스.indexOf('async function 판정하기') : undefined;
    const 본문 = 소스.slice(i, 끝);
    assert.match(본문, /그때유효\(/, `${이름} 에 그때유효가 없다`);
    assert.match(본문, /지금유효\(/, `${이름} 에 지금유효가 없다`);
  }
});

test('⑥ 세 번째 뜻을 만들지 않는다 — 동의 술어를 문 안에 다시 적지 않았다', () => {
  assert.ok(!/agreed_at\s*<=/.test(소스), '동의 술어를 손으로 적었다 — 다섯 번째 사본이다');
  assert.ok(!/revoked_at\s+is\s+null/.test(소스), '철회 조건을 손으로 적었다');
});

test('⑥ 동의는 표본 «추첨» 에 안 건다 — 철회가 남의 표본을 재배열하면 안 된다(반박 C3)', () => {
  const i = 소스.indexOf('function 풀질의');
  const 본문 = 소스.slice(i, 소스.indexOf('async function 큐읽기'));
  assert.ok(!본문.includes('유효'), '풀 질의에 동의 게이트가 들어갔다 — 철회가 표본을 재배열한다');
  assert.ok(!본문.includes('consent'), '풀 질의가 동의를 본다');
});

/* ── ⑦ 응답에 안 싣는 것 ──────────────────────────────────────────── */

test('⑦ 막힌 카드에는 전사·AI 교정을 안 싣는다(숨기지도 않는다)', () => {
  const m = /status:\s*상태\.막힘\s*\}/.exec(소스);
  assert.ok(m, '막힘 카드 모양을 못 찾았다');
  /* 막힘 갈래 객체 안에 내용 칸이 있으면 안 된다 — 그 객체는 한 줄로 닫힌다. */
  const 시작 = 소스.lastIndexOf('{', m.index);
  const 막힘객체 = 소스.slice(시작, m.index + m[0].length);
  for (const 칸 of ['transcript', 'ai_corrected_text', 'ai_explanation', 'ai_error_tags']) {
    assert.ok(!막힘객체.includes(칸), `막힘 카드에 ${칸} 이 실린다`);
  }
  /* 그래도 카드 «자리»는 있어야 한다 — 숨기면 「이번 주 끝」이 거짓이 된다. */
  assert.ok(막힘객체.includes('correction_id'), '막힘 카드가 자리조차 없다 — 숨기면 안 된다');
});

test('⑦ 큐 응답에 model·prompt_ver 를 안 싣는다 — 판정 전 노출은 강사 편향이 된다', () => {
  const i = 소스.indexOf('async function 큐읽기');
  const 본문 = 소스.slice(i, 소스.indexOf('async function 판정하기'));
  for (const 칸 of ['c.model', 'c.prompt_ver', 'ai_model', 'ai_prompt_ver']) {
    assert.ok(!본문.includes(칸), `큐가 ${칸} 을 싣는다`);
  }
});

test('⑦ `event_id` 가 응답으로 안 나간다(review ③ 와 같은 축)', () => {
  /* 🔑 **조인 조건(`on e.event_id = s.event_id`)은 대상이 아니다** — 그건 서버 안의 배선이고,
   *   막을 것은 그 값이 «브라우저로 나가는 것»이다. 소스 전체를 글자로 훑으면 조인까지 걸려
   *   거짓양성이 나고, 거짓 경보를 내는 가드는 곧 꺼진다. 그래서 두 자리만 좁혀 본다:
   *     ⓐ select 목록이 그 열을 «뽑는가»(`as` 별칭 포함) ⓑ 응답 객체가 그 칸을 «싣는가». */
  /* ⚠ [2026-08-12] ⓐ 를 **응답을 만드는 질의에만** 건다. 회고 통로는 원신호를 «읽어» 축을
   *   굳히는 것이 일이라 그 질의는 원리상 `event_id` 를 뽑는다(근거 없는 근거는 근거가 아니다).
   *   옛 판은 소스 전체를 훑어 그 자리를 빨갛게 냈는데, 그 처방은 「근거를 빼라」가 되어
   *   설계 §4 를 거스른다 — 거짓 경보를 내는 가드는 곧 꺼진다(맹점 ③).
   *   대신 **나가는 자리**를 아래에서 둘 다 못박는다: ⓑ 골든 카드 · ⓒ 회고 응답. */
  const 회고시작 = 소스.indexOf('async function 회고열기');
  const 회고끝 = 회고시작 < 0 ? -1 : 소스.indexOf('\nasync function ', 회고시작 + 1);
  const 응답질의 = 회고시작 < 0 ? 소스
    : 소스.slice(0, 회고시작) + 소스.slice(회고끝 > 회고시작 ? 회고끝 : 소스.length);
  for (const m of 응답질의.matchAll(/select\s([\s\S]*?)\sfrom\s/g)) {
    const 목록 = m[1];
    assert.ok(!/\bevent_id\b/.test(목록), `select 목록이 event_id 를 뽑는다:\n${목록.trim().slice(0, 200)}`);
  }
  /* ⓒ 회고 응답 — 굳힌 것에는 근거 ID 가 남지만(재현 대조의 재료 · 설계 §4), **나갈 땐 벗긴다.** */
  assert.ok(회고시작 > 0, '회고열기를 못 찾았다 — ⓒ 가 미실행이다');
  assert.ok(소스.slice(회고시작, 회고끝 > 회고시작 ? 회고끝 : undefined).includes('근거벗기기('),
    '회고 응답이 evidence_refs 를 그대로 내보낸다 — event_id 가 브라우저로 나간다');
  /* ⚠ 끝 앵커는 **시작 뒤에서** 찾는다 — 0건 조기 반환(`return { 항목들: [], … }`)이 앞에 있어
   *   앞에서부터 찾으면 구간이 음수 길이가 되고, 그러면 이 검사는 «빈 문자열을 훑어» 영원히
   *   초록이 된다(미실행이 통과와 같은 모양이 되는 자리다). */
  const 시작 = 소스.indexOf('항목들.push');
  assert.ok(시작 > 0, '응답 조립부(항목들.push)를 못 찾았다 — 이 검사가 미실행이다');
  const 끝 = 소스.indexOf('return { 항목들', 시작);
  assert.ok(끝 > 시작, '응답 조립부의 끝 앵커를 못 찾았다 — 이 검사가 미실행이다');
  const 응답조립 = 소스.slice(시작, 끝);
  assert.ok(!/event_id/.test(응답조립), '응답 카드에 event_id 가 실린다');
});

test('⑦ 승격 의사를 강사 문이 건드리지 않는다 — 승격은 검수 축의 판단이다', () => {
  assert.ok(!소스.includes('promotion_intent'), 'teach 가 promotion_intent 를 쓴다');
});

/* ── ⑧ 동봉 ───────────────────────────────────────────────────────── */

test('⑧ 동봉이 실제 lib 파일을 가리킨다(손 사본 0)', () => {
  assert.ok(fs.existsSync(동봉경로), '동봉.json 이 없다 — 배포되면 import 가 죽는다');
  const 동봉 = JSON.parse(fs.readFileSync(동봉경로, 'utf8'));
  /* ⚠ [2026-08-12] 「동봉했는데 안 쓴다」를 **본체 import 만으로 재지 않는다.** 표에는 본체가
   *   안 부르는 것도 정당하게 든다 — 동봉 lib 이 또 `require` 하는 사슬이 그것이고(회고 →
   *   학습자상태 → 작성과정·라디오태스크), 빠지면 `동봉묶기` 가 배포 «전»에 멈춘다.
   *   옛 판은 그 사슬을 「목록이 낡았다」로 읽어 거짓 적색을 냈고, 그 처방은 사슬을 끊는
   *   것이라 더 나쁘다. 그래서 **본체 import ∪ 동봉끼리의 require** 로 잰다. */
  const 쓰임 = new Set([...원문.matchAll(/from '\.\/([^']+\.mjs)'/g)].map((m) => m[1]));
  /* 🔴 require 정규식은 배포 해석기의 것(`원격배포.REQUIRE문`)을 그대로 쓴다 — 여기 따로
   *   적었던 판은 `./` 만 봐서 건너 디렉터리 require(`../contents/서류관문문항.js` — 학습자상태
   *   v9 실측)를 못 보고 「목록이 낡았다」 거짓 적색을 냈다(`tests/동봉신호.test.js` 가 같은
   *   구멍을 같은 처방으로 닫은 자리 — 라우팅이 해석기보다 좁으면 그 자체가 구멍이다). */
  const { REQUIRE문 } = require('../tools/원격배포.js');
  for (const 경로 of Object.values(동봉)) {
    const 파일 = path.join(뿌리, 경로);
    if (!fs.existsSync(파일)) continue;
    for (const m of fs.readFileSync(파일, 'utf8').matchAll(REQUIRE문)) {
      쓰임.add(`${m[3]}.mjs`);
    }
  }
  for (const [별칭, 경로] of Object.entries(동봉)) {
    assert.ok(fs.existsSync(path.join(뿌리, 경로)), `${경로} 가 없다(${별칭})`);
    assert.ok(쓰임.has(별칭), `${별칭} 을 동봉했는데 본체도 다른 동봉도 안 쓴다 — 목록이 낡았다`);
  }
  /* 반대 방향 — import 하는데 동봉에 없으면 배포본에서 죽는다(로컬은 초록이다). */
  for (const m of 원문.matchAll(/from '\.\/([^']+\.mjs)'/g)) {
    assert.ok(동봉[m[1]], `${m[1]} 을 import 하는데 동봉.json 에 없다`);
  }
});

test('⑧ 경로를 «두 마디»로 가른다 — /v1/teach/아무거나/queue 가 안 통한다', () => {
  assert.match(소스, /마디\.slice\(-2\)\.join\('\/'\)/);
  /* [2026-08-12] 목록·메서드·안내문이 **한 곳(`경로표`)에서 파생**되도록 바뀌었다.
   * 옛 판은 `아는경로` 목록만 봤고 메서드는 삼항(`=== 'gold/queue' ? 'GET' : 'POST'`)에
   * 따로 살았다 — 경로가 넷이 되는 순간 그 `else` 가 **새 GET 경로를 POST 로** 요구한다.
   * 그래서 여기서 **메서드까지** 못박는다(같은 판정을 두 곳에 적으면 갈라진다). */
  const m = /const\s+경로표\s*=\s*\{([\s\S]*?)\}\s*as\s+const/.exec(소스);
  assert.ok(m, '경로표 선언을 못 찾았다');
  const 표 = Object.fromEntries([...m[1].matchAll(/'([^']+)'\s*:\s*'([A-Z]+)'/g)].map((x) => [x[1], x[2]]));
  assert.deepEqual(표, {
    'gold/queue': 'GET',
    'gold/judge': 'POST',
    'compass/open': 'GET',
    'compass/save': 'POST',
    'retro/open': 'GET',
    'retro/self': 'POST',
    'retro/judge': 'POST',
    /* [2026-08-12] 강사 반 단위 피드백 셋(설계 §4). 여기 못박는 것이 값을 하는 자리다 —
     * 앞 두 개가 GET 인데 옛 삼항 판이었다면 **둘 다 POST 로** 요구했을 것이고, 그 실패는
     * 405 라 「막혔다」로 보이지 조준 실패로 안 보인다. */
    'feedback/classes': 'GET',
    'feedback/queue': 'GET',
    'feedback/give': 'POST',
    /* c14 교실 관찰 셋(08-31). 🔑 `draft` 가 POST 인 것은 몸통(강사 원문)이 있어서지 쓰기라서가
     * 아니다 — 그 경로는 DB 를 안 건드린다(위 ⑧ 검사가 그것을 잰다). */
    'observe/roster': 'GET',
    'observe/draft': 'POST',
    'observe/note': 'POST',
  });
  // 안내문을 손으로 적으면 경로가 늘 때 낡는다 — 표에서 파생하는지 본다.
  assert.match(소스, /Object\.entries\(경로표\)/);
});

/* ── 나침반(시즌회고_설계 §8 ①②) — 같은 성질을 새 경로에도 건다 ─────────── */

test('④ 나침반 저장도 쓰기와 감사가 한 트랜잭션이다', () => {
  const i = 소스.indexOf('async function 나침반저장');
  assert.ok(i > 0, '나침반저장 함수를 못 찾았다 — 이 검사가 통째로 미실행이다');
  const 다음 = 소스.indexOf('\nasync function ', i + 1);
  const 본문 = 소스.slice(i, 다음 > i ? 다음 : undefined);
  const b = 본문.indexOf('sql.begin');
  assert.ok(b > 0, '나침반저장이 트랜잭션을 안 연다');
  assert.ok(본문.indexOf('insert into engine.season_compass') > b, '나침반 쓰기가 트랜잭션 밖이다');
  assert.ok(본문.indexOf("'teach.compass.save'") > b, '감사가 트랜잭션 밖이다');
  assert.ok(본문.slice(b).indexOf('sql.begin', 1) === -1, '트랜잭션이 둘로 갈렸다');
});

test('🔴 시즌·회차·목적을 **서버가 정한다** — 앱이 보낸 값으로 행을 쓰지 않는다', () => {
  const i = 소스.indexOf('async function 나침반저장');
  const 본문 = 소스.slice(i);
  /* 앱이 고르면 강사가 지난 시즌에 소급 기입할 수 있고, 그 순간 이 설계의 전제
   * (그때 그 시점의 선언)가 무너진다. `b.season_id` 는 **조준 확인용**으로만 읽힌다. */
  assert.ok(본문.includes('시즌.season_id'), '오늘의 시즌 행을 안 쓴다');
  assert.ok(!/values\s*\([^)]*화면시즌/.test(본문), '앱이 보낸 season_id 로 행을 쓴다');
  assert.ok(본문.includes('회차판정('), '회차를 서버가 안 정한다');
  assert.ok(!/b\.round|b\.회차/.test(본문), '앱이 보낸 회차를 읽는다');
  assert.ok(!/b\.goal_track/.test(본문), '앱이 보낸 목적을 그날의 목적으로 굳힌다');
});

test('🔴 나침반 어휘 사본이 0개다 — 문항키는 `lib/나침반문항.js` 하나가 정본이다', () => {
  for (const 키 of ['why_learning', 'topik_use', 'season_goal']) {
    assert.ok(!소스.includes(키), `${키} 사본이 통로에 들어갔다 — 정본이 둘이 된다`);
  }
});

test('🚫 나침반 답을 사건으로 흘리지 않는다 — 새 event_type 0(설계 §10)', () => {
  /* ⚠ [2026-08-12] 끝을 **다음 함수로 못박는다.** 옛 판은 파일 끝까지 잘라, 뒤에 붙은 회고
   *   통로(그 통로는 `learning_events` 를 «읽는» 것이 일이다)를 「나침반이 쓴다」로 읽고
   *   거짓 적색을 냈다 — ①② 커밋이 같은 자리에서 이미 두 번 겪은 실패다(F287 계열). */
  const i = 소스.indexOf('async function 나침반저장');
  assert.ok(i > 0, '나침반저장 함수를 못 찾았다 — 이 검사가 통째로 미실행이다');
  const 다음 = 소스.indexOf('\nasync function ', i + 1);
  const 본문 = 소스.slice(i, 다음 > i ? 다음 : undefined);
  assert.ok(!본문.includes('learning_events'), '나침반이 learning_events 에 쓴다');
  assert.ok(!본문.includes('preference.stated'), 'c11 ⑦ 가드를 깎는 자리다');
});

/* ── ⑧ 관찰 경로 셋 (c14 · 08-31) ────────────────────────────────────────────────
 * ⚠ 이 자리엔 08-10~08-30 사이 **반대 방향의 잠금**이 서 있었다(`!소스.includes('observe')`) —
 *   유호님 계약 판정 전에 짓지 못하게 막던 검사다. 판정이 08-31 「웅 그대로 가」로 서서 c14 가
 *   났고, 그래서 잠금을 **지운 것이 아니라 뒤집었다**: 같은 자리가 이제 「규격대로 섰나」를 잰다.
 *   지우기만 하면 그 자리는 아무도 안 보는 자리가 된다. */

test('⑧ 관찰 경로 셋이 섰다 — 그리고 셋인 것이 규격이다', () => {
  for (const 경로 of ['observe/roster', 'observe/draft', 'observe/note']) {
    assert.ok(소스.includes(`'${경로}'`), `${경로} 가 없다 — 관찰 통로가 반쪽이면 생산량은 0이다`);
  }
});

test('⑧ 🔴 초안은 사건이 아니다 — `관찰초안내기` 가 DB 를 한 글자도 안 건드린다', () => {
  /* 설계 §2 의 **물리**다. 초안이 행을 남기면 「확정만 적재」가 코드가 아니라 화면 규약으로만
   * 남고, 확정 전에 이탈한 초안이 확정 행세를 한다.
   * 끝을 다음 함수로 못박는다(나침반 검사와 같은 사유 — 파일 끝까지 자르면 뒤 함수가 한 일을
   * 이 함수가 한 것으로 읽고 거짓 적색을 낸다 · F287 계열). */
  const i = 소스.indexOf('async function 관찰초안내기');
  assert.ok(i > 0, '관찰초안내기 를 못 찾았다 — 이 검사가 통째로 미실행이다');
  const 다음 = 소스.indexOf('\nasync function ', i + 1);
  assert.ok(다음 > i, '관찰초안내기 의 끝 앵커를 못 찾았다 — 이 검사가 미실행이다');
  const 본문 = 소스.slice(i, 다음);
  for (const 금지 of ['sql', 'tx`', 'learning_events', 'staff_access_log']) {
    assert.ok(!본문.includes(금지), `초안 경로가 DB 를 건드린다(${금지}) — 초안은 사건이 아니다`);
  }
});

test('⑧ 확정은 물리칸 둘과 운영기록판을 싣는다 — 하나라도 빠지면 소급이 안 된다', () => {
  const i = 소스.indexOf('async function 관찰확정');
  assert.ok(i > 0, '관찰확정 을 못 찾았다 — 이 검사가 통째로 미실행이다');
  const 본문 = 소스.slice(i);
  /* 물리칸 2 — 없으면 강사별 무수정 통과율·퇴사 강사 관찰 격리·「누구의 정답지였나」가 원리상
   * 불가하고(설계 §5), 그 셋은 **소급이 안 된다**. */
  assert.ok(본문.includes('observer_staff_id'), '관찰자 식별을 안 싣는다');
  assert.ok(본문.includes('draft_modified'), '자백 도장 칸을 안 싣는다');
  /* 🔴 동의판이 아니라 운영기록판이다(c14 ③ · 표는 lib/사건출처.js 하나). 여기에 동의 조회가
   *   끼면 관찰이 학생 기기 동의에 걸려 교실 기록 자체가 성립 불가가 된다. */
  assert.ok(본문.includes('운영기록판'), 'consent_ver 에 운영기록판을 안 쓴다');
  assert.ok(!본문.includes('지금유효') && !본문.includes('그때유효'),
    '관찰이 동의 게이트를 지난다 — c14 ③ 이 「지나지 않되 조용히 버려짐도 없다」로 명문화한 자리다');
  /* 학생 이름을 여는 통로라 감사 1행이 한 벌이다(설계 §5 ⚠). */
  assert.ok(본문.includes('teach.observe.note'), '확정이 감사 행을 안 남긴다');
});

test('⑧ `draft_modified` 를 **서버가** 정한다 — 앱이 보낸 값을 그대로 싣지 않는다', () => {
  const i = 소스.indexOf('async function 관찰확정');
  const 본문 = 소스.slice(i);
  /* 설계 §2 ㉡ — 앱이 불리언을 보내면 `서버칸` 규약이 막으려던 자기신고가 이름만 바꿔 돌아온다.
   * 서버는 되실은 «초안»을 받아 `고쳤나()` 로 «정한다». 본문에서 직접 읽으면 그게 자기신고다. */
  assert.ok(본문.includes('고쳤나('), '서버가 대조하지 않는다 — draft_modified 가 자기신고가 된다');
  assert.ok(!/b\.draft_modified/.test(본문), '앱이 보낸 draft_modified 를 읽는다 — 자기신고다');
});

test('⑧ 관찰 화면에 앱 축 데이터가 없다 — ㉯ 기각의 화면 적용(설계 §2)', () => {
  /* 앱의 의심을 관찰 «전»에 보여주면 그 뒤 관찰은 앱 사전확률의 확증 표본이 되고
   * `source_kind='teacher'` 가 거짓이 된다. 로스터가 급수를 실어 오지만 그리지 않는 것이 규격. */
  const 화면 = fs.readFileSync(path.join(__dirname, '..', 'src', '관찰화면.js'), 'utf8');
  const 그리는곳 = 화면.slice(화면.indexOf('return ('));
  for (const 금지 of ['level_current', '급수', 'error_tags', '오답', '진도']) {
    assert.ok(!그리는곳.includes(금지), `관찰 화면이 앱 축 데이터를 그린다: ${금지}`);
  }
});

/* ── ⑨ 반 큐가 «판정의 재료»를 싣는다 (§8-4 화면이 요구한 것) ──────────── */

/** `반큐읽기` 한 함수만 잘라 본다 — 끝을 다음 함수로 못박는다(🚫 나침반 답 검사와 같은 사유:
 *  파일 끝까지 자르면 뒤 함수를 이 함수가 한 일로 읽고 거짓 적색을 낸다 · F287 계열). */
function 반큐구간() {
  const i = 소스.indexOf('async function 반큐읽기');
  assert.ok(i > 0, '반큐읽기 함수를 못 찾았다 — 아래 검사가 통째로 미실행이다');
  const 다음 = 소스.indexOf('\nasync function ', i + 1);
  assert.ok(다음 > i, '반큐읽기의 끝 앵커를 못 찾았다 — 이 검사가 미실행이다');
  return 소스.slice(i, 다음);
}

/** 재료 조회(술어가 고른 id 로만 훑는 질의) 한 벌 — 공백을 접어 돌려준다.
 *  🔑 앵커를 못 찾으면 **던진다**(조용히 빈 문자열을 주면 이 검사가 통과 모양으로 미실행된다). */
function 재료질의() {
  const m = /select s\.submission_id[\s\S]*?any\(\$\{ids\}::uuid\[\]\)/.exec(반큐구간());
  assert.ok(m, '재료 조회를 못 찾았다 — 아래 검사가 통째로 미실행이다');
  return m[0].replace(/\s+/gu, ' ');
}

test('⑨ 재료 «질의»가 학생 글과 AI 교정을 실제로 뽑는다', () => {
  /* 🔴 설계 §5 ③ 은 「학생이 쓴 문장」을 화면에 놓는데 §4 의 통로는 그것을 안 줬다(§8-4 착수
     전 실측에서 드러난 자리다). 재료 없는 판정 칸은 안 쓰이고, 안 쓰이는 칸의 생산량은 0이다.
     🔑 **질의와 응답을 갈라 잰다**(2026-08-12 변이 실측): 이름만 훑으면 select 목록에서 열을
     지워도 응답 조립부의 같은 이름이 검사를 초록으로 만든다 — 그때 증상은 오류가 아니라
     **모든 항목이 null**, 즉 「AI 교정 카드가 통째로 안 뜬다」라 아무 데도 안 빨개진다. */
  const 질의 = 재료질의();
  for (const 칸 of ['s.body_original', 's.transcript',
    'ai.corrected_text as ai_corrected_text',
    'ai.explanation as ai_explanation',
    'ai.error_tags as ai_error_tags']) {
    assert.ok(질의.includes(칸), `재료 질의가 ${칸} 을 안 뽑는다 — 그 칸이 통째로 null 이 된다`);
  }
});

test('⑨ 재료 «응답»이 그 다섯 칸을 싣는다 — 뽑고 안 실으면 화면엔 없는 것과 같다', () => {
  /* 🔑 사슬이 둘이라 둘 다 본다: ⓐ `재료칸` 이 다섯을 «만드나» ⓑ 항목 조립이 그것을 «펴나».
     ⓑ 만 보면 헬퍼가 비어도 초록이고, ⓐ 만 보면 헬퍼가 아무 데도 안 불려도 초록이다. */
  const i = 소스.indexOf('function 재료칸');
  assert.ok(i > 0, '재료칸을 못 찾았다 — 이 검사가 미실행이다');
  const 끝 = 소스.indexOf('\n}\n', i);
  assert.ok(끝 > i, '재료칸의 끝을 못 찾았다 — 이 검사가 미실행이다');
  const 헬퍼 = 소스.slice(i, 끝);
  for (const 칸 of ['body_original', 'transcript', 'ai_corrected_text', 'ai_explanation', 'ai_error_tags']) {
    assert.match(헬퍼, new RegExp(`${칸}:`), `재료칸이 ${칸} 을 안 만든다 — 화면이 그 칸을 못 그린다`);
    /* 🔴 기본값을 **한 자리**에 둔다 — 재료 행이 없을 때 `undefined` 가 나가면 그 칸은 응답에서
       통째로 사라지고, 「AI 교정이 아직 없다」와 「서버가 안 실었다」가 같은 모양이 된다. */
    assert.match(헬퍼, new RegExp(`${칸}: v\\.${칸} \\?\\? null`), `${칸} 의 기본값이 null 이 아니다`);
  }
  const 조립 = 반큐구간().slice(반큐구간().indexOf('items: 항목들.map'));
  assert.ok(조립.length > 0, '응답 조립부를 못 찾았다 — 이 검사가 미실행이다');
  assert.match(조립, /\.\.\.재료칸\(/, '항목이 재료칸을 안 편다 — 헬퍼가 서 있어도 응답엔 없다');
});

test('⑨ 학생글과 전사를 «한 칸으로 접지 않는다» — coalesce 0', () => {
  /* 🔴 쓰기의 원문과 말하기의 전사는 확신의 결이 다르다. 접으면 화면이 기계가 «들은» 문장을
     학생이 «쓴» 문장이라고 말하게 되고, 강사는 그 오차를 학생의 실수로 읽는다. */
  const 본문 = 반큐구간();
  assert.ok(!/coalesce\s*\(\s*s?\.?body_original/i.test(본문), '학생글과 전사를 coalesce 로 접었다');
});

test('⑨ 술어(`기다림질의`)에 본문 열을 안 매단다 — 카드 셈이 대기 글을 통째로 끌어온다', () => {
  /* 🔑 `기다림질의` 는 카드의 셈(`feedback/classes`)과 목록이 **같이 쓰는 하나뿐인 정의**다.
     거기에 본문을 매달면 카드 한 장 그리려고 내 반 전체의 대기 글을 끌어오고, 그건 화면
     어디에도 안 쓰인다. 재료는 술어가 «고른 뒤» 그 id 로만 훑는다. */
  const i = 소스.indexOf('function 기다림질의');
  assert.ok(i > 0, '기다림질의를 못 찾았다 — 이 검사가 미실행이다');
  const 다음 = 소스.indexOf('\nasync function ', i + 1);
  const 술어 = 소스.slice(i, 다음 > i ? 다음 : undefined);
  for (const 칸 of ['body_original', 'transcript', 'corrected_text', 'explanation']) {
    assert.ok(!술어.includes(칸), `술어가 ${칸} 을 뽑는다 — 카드 셈이 그 글을 통째로 끌어온다`);
  }
});

test('⑨ AI 행 고르기 규칙이 `review_queue` 와 «같다» — 여기서 새로 정하지 않는다', () => {
  /* 두 곳이 각자 「어느 AI 행인가」를 정하면 검수 화면과 강사 화면이 **다른 문장**을 보고,
     갈린 증상은 「선생님이 본 교정이랑 다른데요」라 아무 데도 안 남는다. */
  const 본문 = 반큐구간();
  assert.match(본문, /order by c\.created_at desc\s*\n?\s*limit 1/, 'AI 행 선택이 「가장 최근」이 아니다');
  assert.match(본문, /c\.actor_kind = 'ai'/, 'AI 행을 actor_kind 로 안 가른다');
  const 마이그 = fs.readFileSync(
    path.join(뿌리, 'supabase', 'migrations', '20260809050000_review_c10.sql'), 'utf8');
  assert.match(마이그, /order by c\.created_at desc/, '대조 대상(review_queue)의 규칙이 바뀌었다 — 둘을 다시 맞춘다');
});

test('⑨ 반 큐도 model·prompt_ver 를 안 싣는다 — 골든 큐와 «같은 축»이다', () => {
  /* 🔴 같은 사람이 이 화면을 보고 그 주 골든을 판정한다. 여기서 모델명이 새면 골든 큐가
     안 싣는 것(:202)이 무의미해진다 — 새는 방향이 「통과」인 자리는 두 문을 같이 잠근다. */
  const 본문 = 반큐구간();
  for (const 칸 of ['c.model', 'c.prompt_ver', 'ai_model', 'ai_prompt_ver']) {
    assert.ok(!본문.includes(칸), `반 큐가 ${칸} 을 싣는다`);
  }
});

test('⑨ 재료 조회가 큐 읽기와 «같은 트랜잭션»이다 — 감사 1행과 함께 선다', () => {
  const 본문 = 반큐구간();
  const b = 본문.indexOf('sql.begin');
  assert.ok(b > 0, '반큐읽기가 트랜잭션을 안 연다');
  assert.ok(본문.indexOf('ai_corrected_text') > b, '재료 조회가 트랜잭션 밖이다');
  assert.ok(본문.indexOf("'teach.feedback.queue'") > b, '감사가 트랜잭션 밖이다');
  assert.ok(본문.slice(b).indexOf('sql.begin', 1) === -1, '트랜잭션이 둘로 갈렸다');
});
