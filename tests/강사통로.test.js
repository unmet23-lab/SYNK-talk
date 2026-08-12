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
  for (const 경로 of Object.values(동봉)) {
    const 파일 = path.join(뿌리, 경로);
    if (!fs.existsSync(파일)) continue;
    for (const m of fs.readFileSync(파일, 'utf8').matchAll(/require\('\.\/([^']+)\.js'\)/g)) {
      쓰임.add(`${m[1]}.mjs`);
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

test('⑧ ⏳ 관찰 경로는 아직 없다 — 유호님 계약 판정 전에 짓지 않는다', () => {
  assert.ok(!소스.includes('observe'), 'observe 경로가 생겼다 — 계약 판정(observation.noted)이 선행이다');
});
