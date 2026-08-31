/* Temper 개입 로그 규격 v1 의 기계 층 (08-24) — 「개입을 적는 모든 자리는 그 순간의 학생 상태를
 * 함께 적는다」. 정본 = appsscript `docs/Temper_개입로그_규격_v1.md` — §③ 이 「오늘 이 규격은
 * 약속이지 장치가 아니다」라고 자인했고, 이 파일이 그 장치다.
 *
 * ■ 실측 2026-08-24 (이 파일이 굳히는 현재)
 *   운영 층에서 `engine.learning_events` 에 insert 하는 통로 = **3파일 5벌이 전부**다:
 *   · `deliver/index.ts` 3벌 — 게임 배정(task.assigned · 개입 행 없음이 설계 — 발주 §8 「v1
 *     답장은 대본이라 학습 신호 0 · 성과회수 닻 오염 방지」) · 말하기 개입(intervention.delivered
 *     · 다섯 칸 전부) · 말하기 배정(task.assigned · intervention_id 고리 + retry_of)
 *   · `events/index.ts` 1벌 — 앱 문(동적 event_type). 개입 위조는 `서버사건` 거절이 막는다 —
 *     그 목록·거절은 `tests/사건위조.test.js` 가 지키므로 여기 다시 적지 않는다.
 *   · `radio-promote/index.ts` 1벌 — 승격 문(동적 event_type). 원천 = `lib/라디오승격.승격표`.
 *   생성 통로(deliver-one·생성모드)는 `event_draft` 를 굳힐 뿐 착지는 deliver 의 그 insert 다.
 *   corrections·correct·teach·companion 은 learning_events 에 insert 0 (전수 grep 08-24).
 *
 * ■ 왜 「radio-promote 에 다섯 칸 추가」(규격 §③ⓐ 원문)가 아닌가 — 재판정 08-24
 *   승격표 여섯 명령의 사건은 전부 학생 사건이고 insert 의 actor_kind 도 'learner' 고정이라
 *   이 문엔 개입 사건이 0이다. 항상 null 인 다섯 칸은 죽은 배선이고, 진짜 위험은 «승격표에
 *   개입 사건이 들어오는 날 스탬프 없이 쌓이는 것»이다 — 그래서 ④가 그 진입 자체를 잠근다.
 *
 * ■ task.assigned 에 estimator 넷을 «복제하지 않는» 이유 (③이 고리만 요구하는 근거)
 *   배정 행은 같은 intervention_id 를 들고, 다섯 칸의 정본은 그 고리 너머 개입 행이다. 같은
 *   값을 두 행에 적으면 정본이 둘이 된다 — corrections 가 learner_id 복제를 기각한 그 축.
 *
 * ■ 래칫 어휘 (lib/이벤트검증.js 의 «내리기만 통과» 무늬 승계)
 *   ② 스탬프 미탑재 개입 insert = **상한 0** · ③ intervention_id 없는 배정 insert = **상한 1**
 *   (게임 배정 — 개입 행 없음이 설계다). 늘어난다는 것은 새 생산자가 스탬프·고리 없이 개입을
 *   적기 시작했다는 뜻이고, 그 행들은 소급 불가라 «지나간 날은 되살릴 수 없다».
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const { 코드만, 파일소스, 코드만픽스처 } = require('./lib/소스검사.js');

const ROOT = path.resolve(__dirname, '..');

test('탐지력 — 주석 제거기가 살아 있다(설명을 코드로 읽으면 이 파일 전체가 눈먼다)', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대);
});

/* 운영 소스 전수를 걷는다 — tools·tests 는 시험 재료라 대상 밖이다(왕복시험들이 직접 SQL 로
 * 넣는 것은 DB 를 증명하는 몫이지 생산자가 아니다 — F179 의 그 구분). */
function* 소스걷기(디렉토리) {
  for (const e of fs.readdirSync(디렉토리, { withFileTypes: true })) {
    const p = path.join(디렉토리, e.name);
    if (e.isDirectory()) yield* 소스걷기(p);
    else if (/\.(ts|js|mjs)$/.test(e.name)) yield p;
  }
}

/* sql 템플릿은 백틱 문자열이라 `코드만` 이 안까지 못 들어간다 — SQL 주석은 여기서 마저 걷는다.
 * 안 걷으면 값절 주석의 설명이 열·값으로 읽혀 «설명이 자세할수록 더 잘 먼다»(소스검사 머리말).
 * postgres 주석은 두 꼴이라 둘 다 걷는다(`/* *​/` · `--`) — `--` 가 있어야 가드계수도 이것을
 * JS 사본이 아니라 SQL 제거기로 가른다(주석정규식 의 갈림이 정확히 그 글자다). */
const SQL주석뺌 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

const 붓는무늬 = /insert into engine\.learning_events\s*\(/g;

function insert블록들(src) {
  const 시작들 = [];
  let m;
  붓는무늬.lastIndex = 0;
  while ((m = 붓는무늬.exec(src)) !== null) 시작들.push(m.index);
  return 시작들.map((i, k) => SQL주석뺌(src.slice(i, 시작들[k + 1] ?? src.length)));
}

/* 열 목록 = insert 머리 괄호 안 — 실물 다섯 벌 전부 이름 나열뿐이라(중첩 괄호 0) 첫 `)` 까지다. */
const 열목록 = (블록) => 블록.slice(0, 블록.indexOf(')'));

const 통로장부 = [
  'supabase/functions/deliver/index.ts',
  'supabase/functions/events/index.ts',
  'supabase/functions/radio-promote/index.ts',
  /* c14 교실 관찰(08-31) — 넷째 생산자. **개입 사건을 안 나른다**(`observation.noted` 하나)라
   * ②③ 의 스탬프·고리는 이 통로에 안 걸린다: 그 다섯 칸은 「엔진이 무엇을 왜 골라 줬나」의
   * 재료인데, 관찰은 엔진이 고른 것이 아니라 사람이 교실에서 본 것이다(설계 §2 ㉮).
   * ⚠ 그래도 장부에는 든다 — 「learning_events 에 붓는 자리가 여기 전부인가」는 개입과 무관하게
   *   서야 하는 물음이고, 새 생산자가 조용히 늘어나는 것을 막는 것이 ① 의 일이다. */
  'supabase/functions/teach/index.ts',
];

function 통로실측() {
  const 결과 = new Map(); // 상대경로 → 블록[]
  for (const 뿌리 of ['supabase/functions', 'lib', 'src']) {
    for (const p of 소스걷기(path.join(ROOT, 뿌리))) {
      const 블록 = insert블록들(코드만(파일소스(p)));
      if (블록.length) 결과.set(path.relative(ROOT, p).split(path.sep).join('/'), 블록);
    }
  }
  return 결과;
}

test('① 운영 층에서 learning_events 에 붓는 통로는 장부 3파일이 전부다', () => {
  const 실측 = 통로실측();
  assert.deepEqual([...실측.keys()].sort(), [...통로장부].sort(),
    '통로가 장부와 다르다 — 새 생산자를 냈으면 이 파일 머리의 장부에 등재하고, 그 통로가 개입'
    + ' 사건(intervention.delivered · task.assigned)을 나른다면 ②③의 스탬프·고리부터 배선하라.'
    + ' 지나간 행은 소급 불가다(규격 ⓪).');
  assert.equal(실측.get('supabase/functions/deliver/index.ts').length, 3, 'deliver 의 insert 벌수가 갈렸다 — ②③의 분모가 낡는다');
});

test('② intervention.delivered 를 넣는 insert 는 다섯 칸 전부 싣는다 — 미탑재 상한 0 (래칫)', () => {
  const 실측 = 통로실측();
  const 개입블록 = [...실측.entries()]
    .flatMap(([f, 블록들]) => 블록들.map((b) => ({ f, b })))
    .filter(({ b }) => b.includes("'intervention.delivered'"));
  assert.equal(개입블록.length, 1,
    '개입 사건을 리터럴로 넣는 insert 가 deliver 하나가 아니다 — 새 개입 생산자는 이 검사 대상에 자동 편입된다(그게 이 검사의 존재 이유다)');
  const 미탑재 = [];
  for (const { f, b } of 개입블록) {
    const 열 = 열목록(b);
    for (const 칸 of ['estimator_version', 'estimator_confidence', 'evidence_refs', 'policy_ver', 'intervention_id']) {
      if (!열.includes(칸)) 미탑재.push(`${f}: ${칸}`);
    }
  }
  assert.deepEqual(미탑재, [],
    '개입 insert 에 스탬프 칸이 빠졌다 — 「그때 그 학생이 어떤 상태였고 왜 이 개입을 골랐나」가'
    + ' 그 행부터 영영 빈다(규격 ① 다섯 칸 · deliver :883 이 선례다)');
});

test('③ task.assigned insert — retry_of 는 전부 · intervention_id 없는 벌은 게임 배정 1뿐 (래칫)', () => {
  const 실측 = 통로실측();
  const 배정블록 = [...실측.entries()]
    .flatMap(([f, 블록들]) => 블록들.map((b) => ({ f, b })))
    .filter(({ b }) => b.includes("'task.assigned'"));
  assert.equal(배정블록.length, 2, '배정을 리터럴로 넣는 insert 는 deliver 의 게임·말하기 두 벌이다 — 늘었으면 아래 상한을 재판정하라');
  for (const { f, b } of 배정블록) {
    assert.ok(열목록(b).includes('retry_of_event_id'),
      `${f}: 배정 insert 에 retry_of_event_id 가 없다 — 설계의 유일한 결과 변수(L0 §9-2)가 이 통로에서 끊긴다`);
  }
  const 고리없음 = 배정블록.filter(({ b }) => !열목록(b).includes('intervention_id'));
  assert.ok(고리없음.length <= 1,
    'intervention_id 없는 배정 insert 가 늘었다(상한 1 = 게임 배정 · 발주 §8 「개입 행 없음」이 설계) — '
    + '새 배정 통로는 개입 고리를 싣거나, 개입 없음이 설계라면 이 상한과 사유를 함께 올려라');
});

test('④ 승격표(radio-promote 의 원천)는 앱사건뿐이다 — 개입 사건 진입 잠금', () => {
  const { 승격표 } = require('../lib/라디오승격.js');
  const { 앱사건, 서버사건 } = require('../lib/이벤트검증.js');
  for (const [명령, 사건] of Object.entries(승격표)) {
    assert.ok(!서버사건.includes(사건),
      `승격표 「${명령}」 이 서버사건 ${사건} 을 나른다 — 개입 성격 사건이 이 길을 타면 스탬프 없이`
      + ' 쌓인다(이행표 🔴 그 자리). 넣으려면 radio-promote insert 에 다섯 칸 배선이 먼저다(규격 §③ⓐ)');
    assert.ok(앱사건.includes(사건),
      `승격표 「${명령}」 의 ${사건} 이 앱사건 목록에 없다 — 분류가 갈렸다(tests/사건위조 의 «정확히 하나»가 곧 빨개진다)`);
  }
});
