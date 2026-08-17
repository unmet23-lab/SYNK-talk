'use strict';
/**
 * 배포빚 회귀 — 「배포 빚이 시간을 넘어 살아남는가」 (F455)
 *
 * 발단(2026-08-15 실측): 운영 배포본 6개가 소스보다 낡은 채로 며칠 서 있었고, `deliver` 는 그
 *   상태로 매일 두 번, `radio-promote` 는 매시간 cron 에 불렸다.
 *
 * 🔑 착수 실측이 진단을 뒤집었다 — **탐지는 멀쩡했다.** `동봉신호` 를 그 커밋(`49d4feb`)에
 *   다시 돌리면 `deliver·progress·radio-promote·tasks·teach` 다섯을 이름까지 대며 알린다.
 *   빠진 것은 탐지가 아니라 **보존**이었다: 그 말이 그 순간의 stdout 에만 살았고, 배포는 승인
 *   자리라 그 자리에서 못 갚는 일이 흔한데 못 갚은 빚이 어느 장부에도 안 남았다.
 *
 * 🔑 이 회귀가 지키는 것 넷:
 *   ① **모름을 최신으로 접지 않는다** — 이 장치가 샐 유일한 방향이고, 새면 초록의 얼굴로 샌다.
 *   ② 탐지력은 **픽스처**로 못박는다(실저장소 장부는 세션마다 바뀐다 — 바뀌면 검사가 조용히 0건).
 *   ③ 실저장소에는 **거짓양성만** 묻고 분모를 드러낸다. 재료가 없으면 fail 이 아니라 **skip**(F296).
 *   ④ **등록층** — 도장을 부르는 배선이 끊기면 장부는 영영 안 자라고, 그 증상은 「모름 n」뿐이라
 *      조용하다. 장치를 만드는 것과 그 장치가 도는 것은 다른 작업이다.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { 띄우기 } = require('./lib/띄우기.js');

const ROOT = path.resolve(__dirname, '..');
const 빚 = require('../tools/배포빚.js');

const 줄 = (o) => JSON.stringify(o);
const 기준맵 = (판, ...줄들) => 빚.최신기준(빚.장부파싱(줄들.join('\n')).줄들, 판);

// ── ① 순수 판정 (픽스처) ──────────────────────────────────────────────────

test('장부에 없는 함수는 «모름» 이다 — 절대 «최신» 이 아니다', () => {
  /* 🔴 이 장치가 거짓말할 수 있는 유일한 자리다. 안 잰 것을 최신으로 접으면 「낡음 0」이
   *   나오는데 그건 F455 가 난 상태와 **똑같은 출력**이다. */
  const 판정 = 빚.빚판정({ 함수들: ['deliver', 'tasks'], 기준: new Map(), 바뀐: new Map() });
  assert.deepEqual(판정.모름, ['deliver', 'tasks']);
  assert.equal(판정.최신.length, 0);
  assert.equal(판정.낡음.length, 0);
});

test('기준은 있는데 git 이 못 답한 함수도 «모름» 이다 (조상 아님·rebase)', () => {
  const 기준 = 기준맵('운영', 줄({ 판: '운영', 함수: 'deliver', head: 'deadbee' }));
  const 판정 = 빚.빚판정({ 함수들: ['deliver'], 기준, 바뀐: new Map() });   // 바뀐 표에 없다
  assert.deepEqual(판정.모름, ['deliver']);
  assert.equal(판정.최신.length, 0);
});

test('나갈 파일이 바뀌었으면 «낡음», 안 바뀌었으면 «최신»', () => {
  const 기준 = 기준맵(
    '운영',
    줄({ 판: '운영', 함수: 'deliver', head: 'aaaaaaa' }),
    줄({ 판: '운영', 함수: 'tasks', head: 'aaaaaaa' }),
  );
  const 바뀐 = new Map([['deliver', ['lib/오늘과제.js']], ['tasks', []]]);
  const 판정 = 빚.빚판정({ 함수들: ['deliver', 'tasks'], 기준, 바뀐 });
  assert.deepEqual(판정.낡음.map((d) => d.함수), ['deliver']);
  assert.deepEqual(판정.낡음[0].바뀐, ['lib/오늘과제.js']);
  assert.deepEqual(판정.최신, ['tasks']);
  assert.equal(판정.모름.length, 0);
});

test('같은 (판,함수) 가 여러 줄이면 **뒤 줄이 이긴다** (append-only 라 시간순)', () => {
  const 기준 = 기준맵(
    '운영',
    줄({ 판: '운영', 함수: 'deliver', head: '옛것' }),
    줄({ 판: '운영', 함수: 'deliver', head: '새것' }),
  );
  assert.equal(기준.get('deliver').head, '새것');
});

test('판이 다르면 안 섞인다 — 운영 도장이 리허설 빚을 지우지 않는다', () => {
  /* 🔑 이 실수의 증상은 「초록」이다: 리허설에 안 부었는데 운영 도장 하나로 최신이 된다. */
  const 줄들 = [줄({ 판: '운영', 함수: 'deliver', head: 'aaa' })].join('\n');
  const 기준 = 빚.최신기준(빚.장부파싱(줄들).줄들, '리허설');
  assert.equal(기준.size, 0);
  const 판정 = 빚.빚판정({ 함수들: ['deliver'], 기준, 바뀐: new Map([['deliver', []]]) });
  assert.deepEqual(판정.모름, ['deliver']);      // 최신이 아니다
});

test('깨진 줄·칸 빠진 줄은 세되 기준이 되지 못한다', () => {
  const text = [
    '{이건 JSON 이 아니다',
    줄({ 판: '운영', 함수: 'deliver' }),                 // head 없음
    줄({ 판: '운영', head: 'aaa' }),                     // 함수 없음
    줄({ 함수: 'deliver', head: 'aaa' }),                // 판 없음
    줄({ 판: '운영', 함수: 'tasks', head: 'aaa' }),      // 유일하게 성한 줄
  ].join('\n');
  const { 줄들, 깨진 } = 빚.장부파싱(text);
  assert.equal(깨진, 4);
  assert.deepEqual(줄들.map((o) => o.함수), ['tasks']);
});

test('요약문은 «합계 = 낡음 + 최신 + 모름» 으로 쪼갠다 (0을 분모와 함께 · 유호 확정 08-14)', () => {
  const s = 빚.요약문('운영', { 낡음: [{ 함수: 'a' }], 최신: ['b', 'c'], 모름: ['d'] });
  assert.equal(s, '운영 — 전체 4 = 낡음 1 + 최신 2 + 모름 1');
});

test('안내문은 낡은 함수마다 «칠 명령»을 주고, 운영이면 --운영 을 붙인다', () => {
  const 판정 = { 낡음: [{ 함수: 'deliver', head: 'aaa', 바뀐: ['lib/오늘과제.js'] }], 최신: [], 모름: [] };
  assert.match(빚.안내문('운영', 판정), /원격배포\.js supabase\/functions\/deliver --적용 --운영/);
  assert.doesNotMatch(빚.안내문('리허설', 판정), /--운영/);
});

// ── ② 판 이름 — 한 곳에만 사는 판정 ───────────────────────────────────────

test('판이름 — 운영REF 와 같으면 운영, 다르면 리허설, 모르면 null', () => {
  assert.equal(빚.판이름('qqq', 'qqq'), '운영');
  assert.equal(빚.판이름('bbb', 'qqq'), '리허설');
  /* 🔴 모르는 ref 를 「리허설이겠지」로 접으면 운영 빚이 통째로 리허설 칸에 들어가 사라진다. */
  assert.equal(빚.판이름('bbb', null), null);
  assert.equal(빚.판이름(null, 'qqq'), null);
});

// ── ③ 경로 걸림 — 디렉터리 경계 ───────────────────────────────────────────

test('걸리나 — 디렉터리는 «경계까지» 본다 (deliver 가 deliver2 를 물면 안 된다)', () => {
  const 나갈것 = ['supabase/functions/deliver', 'lib/오늘과제.js'];
  assert.equal(빚.걸리나('supabase/functions/deliver/index.ts', 나갈것), true);
  assert.equal(빚.걸리나('supabase/functions/deliver', 나갈것), true);
  assert.equal(빚.걸리나('lib/오늘과제.js', 나갈것), true);
  assert.equal(빚.걸리나('supabase/functions/deliver2/index.ts', 나갈것), false);
  assert.equal(빚.걸리나('lib/오늘과제.js.bak', 나갈것), false);
});

// ── ④ 등록층 — 도장을 «부르는» 배선이 살아 있나 ───────────────────────────

test('원격배포 — 배포 성공이 남길 «도장 거리»를 순수 함수로 낸다', () => {
  const { 도장거리 } = require('../tools/원격배포.js');
  assert.deepEqual(도장거리({ slug: 'deliver', version: 9 }, 'qqq', 'qqq', 'abc123'),
    { 판: '운영', 함수: 'deliver', head: 'abc123', 출처: '배포', 판번호: 9 });
  assert.equal(도장거리({ slug: 'deliver' }, 'bbb', 'qqq', 'abc').판, '리허설');
  // 못 가르면 «찍지 않는다» — 모르는 ref 를 리허설로 접으면 운영 빚이 사라진다.
  assert.equal(도장거리({ slug: 'deliver' }, 'bbb', null, 'abc'), null);
  assert.equal(도장거리({ slug: 'deliver' }, 'qqq', 'qqq', null), null);   // head 를 못 읽었다
});

test('등록층 — 원격배포의 배포 성공 자리가 그 거리를 실제로 «찍는» 모양이다', () => {
  /* 🔴 이 검사의 앞판은 `배포빚.도장(` 이 **있기만** 하면 통과했다 — 변이 시험이 잡았다:
   *   `if (판)` 을 `if (false)` 로 바꿔 닿지 않게 만들어도 초록이었다. 소스 검사는 존재가
   *   아니라 **닿는 모양**을 물어야 한다. 실행으로 못 재는 자리라(진짜 배포가 필요) 여기까지가
   *   이 층의 한계이고, 그 한계를 적어 둔다. */
  const src = fs.readFileSync(path.join(ROOT, 'tools', '원격배포.js'), 'utf8');
  assert.match(src, /const 거리 = 도장거리\(f, ref, 자격증명\.운영REF, 배포빚\.지금HEAD\(\)\);/);
  assert.match(src, /\n\s*if \(거리\) 배포빚\.도장\(거리\);/, '도장이 닿지 않는 자리에 있다');
});

test('등록층 — 배포대조 --도장 은 «같다» 에만 찍는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tools', '배포대조.js'), 'utf8');
  assert.match(src, /--도장/);
  assert.match(src, /상태 === '같다'\)\s*\n?\s*\.filter\(\(r\) => 배포빚\.도장/,
    '「같다」로 거르지 않고 도장을 찍으면 미측정이 최신으로 굳는다');
});

test('등록층 — 동봉신호가 커밋마다 «남은 빚»을 함께 낸다', () => {
  const 신호 = require('../tools/동봉신호.js');
  const 본문 = 신호.안내문(
    [{ slug: 'deliver', 디렉터리: 'supabase/functions/deliver', 동봉: ['lib/오늘과제.js'], 본체: [] }],
    ['운영 — 전체 16 = 낡음 3 + 최신 11 + 모름 2'],
  );
  assert.match(본문, /아직 안 갚은 배포 빚/);
  assert.match(본문, /낡음 3 \+ 최신 11 \+ 모름 2/);
  // 빚이 없으면 그 절은 아예 안 뜬다(조용한 커밋을 시끄럽게 만들지 않는다).
  assert.doesNotMatch(신호.안내문([{ slug: 'x', 디렉터리: 'd', 동봉: ['a'], 본체: [] }]), /안 갚은 배포 빚/);
});

// ── ⑤ 실저장소 — 거짓양성만 + 분모를 드러낸다 (F296: 재료 없으면 skip) ────

test('실저장소 — 판정이 예외 없이 서고, 분모(함수 수)가 0이 아니다', (t) => {
  const 목록 = 빚.함수들();
  if (!목록.length) return t.skip('배포 대상 함수가 0개 — 잴 것이 없다');
  const 장부 = 빚.장부읽기();
  if (!장부.줄들.length) return t.skip('배포장부가 비었다 — 도장 전이라 전부 «모름» 이 정상이다');
  for (const 판 of 빚.판들) {
    const 판정 = 빚.판정하기(판, 장부);
    const 합 = 판정.낡음.length + 판정.최신.length + 판정.모름.length;
    assert.equal(합, 목록.length, `${판}: 합계가 분모와 안 맞는다 — 어느 함수가 어느 칸에도 없다`);
  }
});

/* 🔴 **재현 픽스처 = F455 그 사건 자체.** 「49d4feb 직전」을 기준으로 두면 그 커밋이 낡게 만든
 *   다섯 함수가 나와야 한다. 이건 «버그가 아직 있을 것»을 요구하지 않는다(맹점 ②) — 지나간
 *   커밋을 기준으로 삼아 **탐지력만** 잰다. 이력이 없는 사본(얕은 클론·CI)에서는 skip 한다. */
test('재현 — 49d4feb 직전을 기준으로 두면 그 커밋이 낡힌 다섯 함수가 나온다', (t) => {
  let 기준head;
  try {
    기준head = execFileSync('git', ['rev-parse', '49d4feb^'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { return t.skip('49d4feb 이 이 사본의 이력에 없다 — 재료 없음(F296)'); }

  const 장부 = { 줄들: 빚.함수들().map((f) => ({ 판: '운영', 함수: f, head: 기준head })), 깨진: 0 };
  const 판정 = 빚.판정하기('운영', 장부);
  const 낡은 = 판정.낡음.map((d) => d.함수);
  for (const f of ['deliver', 'progress', 'radio-promote', 'tasks', 'teach']) {
    assert.ok(낡은.includes(f), `${f} 가 낡음에 없다 — 그 커밋이 실제로 낡힌 함수다`);
  }
  assert.equal(판정.모름.length, 0, '기준을 전부 준 판인데 «모름» 이 남았다');
});

// ── ⑥ 기계 판독 (`--json`) — 형제 저장소가 읽는 자리 (대기열 #Q87) ──────────
/* 왜 층을 나눴나: `기계요약` 은 git 을 타서 회귀가 값을 못 고정한다(실저장소 장부는 세션마다
 * 바뀐다 · 맹점 ②). 그래서 이 장치가 **샐 수 있는 규칙**만 순수 함수 `요약칸` 에 모았고,
 * 탐지력은 전부 아래 픽스처가 진다. CLI 는 모양(=파싱되나)만 묻는다. */

test('요약칸 — «모름» 은 제 칸에 남는다 (최신에 합치면 F455 와 같은 출력이 된다)', () => {
  const 칸 = 빚.요약칸({ 낡음: [], 최신: ['a', 'b'], 모름: ['radio-round'] });
  assert.deepEqual(칸.모름, ['radio-round']);
  assert.equal(칸.최신, 2, '모름이 최신에 흘러들었다 — 이 장치가 거짓말할 수 있는 유일한 자리다');
  assert.deepEqual(칸.낡음, []);
});

test('요약칸 — 분모 등식: 전체 = 낡음 + 최신 + 모름', () => {
  /* 「0은 분모와 함께 쓴다」(유호 확정 08-14). 전체를 따로 세면 갈래 합과 어긋나도 안 보인다. */
  const 칸 = 빚.요약칸({
    낡음: [{ 함수: 'deliver', 바뀐: ['lib/x.js'] }, { 함수: 'tasks', 바뀐: [] }],
    최신: ['a', 'b', 'c'],
    모름: ['z'],
  });
  assert.equal(칸.전체, 6);
  assert.equal(칸.전체, 칸.낡음.length + 칸.최신 + 칸.모름.length);
  assert.deepEqual(칸.낡음, ['deliver', 'tasks'], '낡음은 «이름»으로 나가야 부르는 쪽이 부를 수 있다');
});

test('--json — stdout 이 통째로 파싱되고 판마다 칸이 선다', () => {
  /* 🔑 stdout 에 사람글 한 줄만 섞여도 부르는 쪽 `JSON.parse` 가 터지고, 터진 쪽은 「모름」으로
   *   접혀 **조용해진다** — 그래서 「경고가 stderr 인가」를 여기서 함께 못박는다. */
  const out = 띄우기([path.join(ROOT, 'tools', '배포빚.js'), '--json'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).stdout;
  const o = JSON.parse(out);
  assert.equal(o.도구, '배포빚');
  assert.deepEqual(Object.keys(o.판).sort(), [...빚.판들].sort());
  for (const 판 of 빚.판들) {
    const v = o.판[판];
    assert.ok(Array.isArray(v.낡음) && Array.isArray(v.모름), `${판}: 낡음·모름은 이름 배열이다`);
    assert.equal(typeof v.최신, 'number');
    assert.equal(v.전체, v.낡음.length + v.최신 + v.모름.length, `${판}: 분모가 갈래 합과 다르다`);
  }
});

test('--json --판 운영 — 고른 판만 낸다 (사람글 갈래와 같은 규칙)', () => {
  const out = 띄우기(
    [path.join(ROOT, 'tools', '배포빚.js'), '--json', '--판', '운영'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).stdout;
  assert.deepEqual(Object.keys(JSON.parse(out).판), ['운영']);
});

test('--json 없이는 사람글이다 — 기계 통로가 사람 통로를 덮지 않았다', () => {
  const out = 띄우기([path.join(ROOT, 'tools', '배포빚.js')],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).stdout;
  assert.match(out, /^\[배포빚\] /m);
  assert.throws(() => JSON.parse(out), '사람글 자리에서 JSON 이 나왔다 — 갈래가 뒤집혔다');
});

// ── ⑤ 부재 — 「모름」이 뭉치던 두 상태를 가른다 (F579 · 2026-08-17) ─────────
/* 발단: 운영 `companion`·`radio-round` 가 HTTP 404(배포된 적 없음)인데 장부는 「안 잰 것」이라
 *   부르며 「재려면 --도장」을 처방했다. 재면 또 404 → 또 모름이라 **그 처방을 그대로 따라도
 *   영영 안 꺼진다**(F103 = 따를 수 없는 처방은 우회를 정상 통로로 만든다). 같은 실측이 커밋문
 *   에만 적힌 채 두 번 반복됐다(talk `002076a` · 이 트랙) — 2번째는 실수가 아니라 시스템 결함이다. */

test('부재 도장은 «최신» 이 아니다 — head 가 지금 HEAD 라 순서를 놓치면 그대로 샌다', () => {
  /* 🔴 **이 회귀가 지키는 급소.** 부재 줄의 head 는 «지금 HEAD» 다(그래야 「이 판 시점에 없었다」가
   *   된다). 그래서 `빚판정` 이 부재를 먼저 안 가르고 `바뀐` 계산에 태우면 **변경 0 ⇒ 최신**이
   *   되고, 새는 방향은 언제나 「통과」다. 아래 `바뀐` 이 «빈 배열» 인 것이 바로 그 함정이다. */
  const 기준 = 기준맵('운영', 줄({ 판: '운영', 함수: 'companion', head: 'aaaaaaa', 출처: '부재' }));
  const 바뀐 = new Map([['companion', []]]);      // ← 변경 0 = 순진하게 재면 「최신」
  const 판정 = 빚.빚판정({ 함수들: ['companion'], 기준, 바뀐 });
  assert.equal(판정.최신.length, 0, '부재가 «최신» 으로 샜다 — 라이브에 없는 함수를 최신이라 말한다');
  assert.deepEqual(판정.모름, ['companion']);
  assert.deepEqual(판정.미배포, ['companion']);
});

test('미배포는 모름의 «부분집합» 이다 — 분모 등식(전체 = 낡음+최신+모름)이 안 깨진다', () => {
  /* 모름에서 빼면 `전체 = 낡음+최신+모름` 을 직접 조립하는 소비자(as `작업본소유자.js:1290`)의
   *   산술이 어긋난다. 그래서 «빼는» 게 아니라 «그 안을 밝힌다». */
  const 기준 = 기준맵(
    '운영',
    줄({ 판: '운영', 함수: 'companion', head: 'aaaaaaa', 출처: '부재' }),
    줄({ 판: '운영', 함수: 'deliver', head: 'aaaaaaa', 출처: '대조' }),
  );
  const 판정 = 빚.빚판정({
    함수들: ['companion', 'deliver', 'tasks'], 기준, 바뀐: new Map([['deliver', []]]),
  });
  const 칸 = 빚.요약칸(판정);
  assert.equal(칸.전체, 칸.낡음.length + 칸.최신 + 칸.모름.length, '분모 등식이 깨졌다');
  assert.equal(칸.전체, 3);
  for (const f of 칸.미배포) assert.ok(칸.모름.includes(f), `${f} 가 모름 밖에 있다 — 부분집합이 깨졌다`);
});

test('부재에는 «재려면 --도장» 을 처방하지 않는다 — 따를 수 없는 처방 금지 (F103)', () => {
  const 기준 = 기준맵('운영', 줄({ 판: '운영', 함수: 'companion', head: 'aaaaaaa', 출처: '부재' }));
  const 판정 = 빚.빚판정({ 함수들: ['companion'], 기준, 바뀐: new Map() });
  const 글 = 빚.안내문('운영', 판정);
  assert.doesNotMatch(글, /재려면: node tools\/배포대조\.js/,
    '부재에 「다시 재라」가 나갔다 — 재도 또 404 라 이 처방은 영원히 안 꺼진다');
  assert.match(글, /원격배포\.js supabase\/functions\/companion --적용 --운영/,
    '부재의 처방은 대조가 아니라 배포여야 한다');
  assert.match(글, /라이브에 없다/);
});

test('부재가 아닌 순수 «못 쟀다» 에는 --도장 처방이 그대로 남는다 — 갈래를 갈랐지 지우지 않았다', () => {
  const 판정 = 빚.빚판정({ 함수들: ['tasks'], 기준: new Map(), 바뀐: new Map() });
  const 글 = 빚.안내문('리허설', 판정);
  assert.match(글, /재려면: node tools\/배포대조\.js --도장/);
  assert.doesNotMatch(글, /라이브에 없다/, '안 잰 것을 「없다」고 단정했다');
});

test('부재 뒤에 배포 도장이 오면 부재는 «스스로» 풀린다 — append-only 의 뒤 줄이 이긴다', () => {
  /* 부재 기록이 낡지 않는 근거. 배포하면 `출처:'배포'` 행이 뒤에 붙고 `최신기준` 이 그것을 택한다 —
   *   손으로 지우러 갈 자리가 없어야 장부가 append-only 로 남는다. */
  const 기준 = 기준맵(
    '운영',
    줄({ 판: '운영', 함수: 'companion', head: 'aaaaaaa', 출처: '부재' }),
    줄({ 판: '운영', 함수: 'companion', head: 'bbbbbbb', 출처: '배포' }),   // ← 나중에 실제로 배포했다
  );
  const 판정 = 빚.빚판정({ 함수들: ['companion'], 기준, 바뀐: new Map([['companion', []]]) });
  assert.deepEqual(판정.미배포, [], '배포한 뒤에도 「라이브에 없다」고 말한다');
  assert.deepEqual(판정.최신, ['companion']);
});
