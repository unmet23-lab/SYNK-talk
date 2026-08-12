/* 왕복골격 회귀 — **옛 통로 금지**: 골격이 지는 머리(관리 API·토큰 읽기·리허설 게이트·키 fetch·
 * 배포판 게이트)를 왕복도구가 다시 자기 안에 복사하면 적색이 된다.
 *
 * 왜 — 같은 머리가 5벌 복사돼 이미 3갈래로 갈라져 있었다(`--운영승인` 1곳뿐·즉사 1곳·시그니처
 * 3종). 3번째 규칙: 호출부마다 고치는 대신 잘못 쓸 수 없는 공용 통로를 만들고 **옛 통로를
 * 테스트로 금지한다**(CLAUDE.md 신뢰성 · `lib/자격증명.js` 머리말과 같은 사슬).
 *
 * 세 맹점:
 *   ① 사람이 실제로 쓰는 표기 — 금지 조각은 옮겨 내기 전 5벌 복제에서 그대로 딴 리터럴이다.
 *   ② 탐지력은 픽스처가 진다 — 실저장소에는 거짓양성 0건만 검사한다(버그 존재를 요구하지 않는다).
 *   ③ 목록이 낡으면 스스로 운다 — 같은 조각이 골격 안에는 **있어야** 통과한다(개명·오타 감지).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/* 왕복도구 안에서 다시 나타나면 골격 복제가 시작된 조각들 — 전부 골격(과 그 아래 공용 통로)의 몫이다.
 * ⚠ `rehearsal` 낱말이 아니라 정규식 리터럴을 잡는다 — 픽스처 비밀번호(`rehearsal-…`)는 무죄다. */
const 금지 = [
  'api.supabase.com',        // 관리 API 리터럴(API 상수 복제)
  'SUPABASE_ACCESS_TOKEN',   // 토큰 직접 읽기
  '/rehearsal/i',            // 리허설 게이트 재구현
  'database/query',          // sql 헬퍼 재구현
  'api-keys',                // 키 fetch 재구현
  '배포대조',                 // 배포판 게이트 직접 호출(발화점은 골격이 쥔다)
  '자격증명',                 // env 통로 직접 사용(골격이 감싼다)
];
const 위반 = (소스) => 금지.filter((p) => 소스.includes(p));

test('탐지력 — 옛 골격 조각이 하나라도 돌아오면 잡힌다 (픽스처)', () => {
  for (const p of 금지) {
    assert.deepEqual(위반(`const x = 1; // ${p} 를 다시 들여온 줄`), [p], p);
  }
  // 새 통로는 무죄다 — 이 줄이 걸리면 가드가 자기 처방을 막는 것이다(F103).
  assert.deepEqual(위반("const { sql, 확인, 보고 } = await 골격.열기('왕복시험');"), []);
});

test('실저장소 — 왕복도구 5종이 실재하고(분모) 옛 골격 조각이 0건이다', () => {
  const 도구뿌리 = path.join(ROOT, 'tools');
  const 도구들 = fs.readdirSync(도구뿌리).filter((n) => /왕복시험\.js$/.test(n));
  // 0건=미실행 — glob 이 비면 「전부 통과」가 아니라 여기서 빨개져야 한다(F207).
  assert.ok(도구들.length >= 5, `왕복시험 도구가 ${도구들.length}개뿐이다 — 이름 규칙이 바뀌었으면 이 회귀부터 고친다`);
  for (const n of 도구들) {
    const 소스 = fs.readFileSync(path.join(도구뿌리, n), 'utf8');
    assert.deepEqual(위반(소스), [], `${n} 안에 옛 골격 조각이 있다 — lib/왕복골격.js 의 손잡이를 쓴다`);
  }
});

test('목록이 낡지 않았다 — 같은 조각이 골격 안에는 실제로 산다', () => {
  const 골격소스 = fs.readFileSync(path.join(ROOT, 'lib', '왕복골격.js'), 'utf8');
  for (const p of 금지) {
    assert.ok(골격소스.includes(p), `골격에 「${p}」 가 없다 — 개명됐으면 금지 목록도 같이 고친다`);
  }
});

/* 게이트 스코프(`열기` 의 `함수목록`) — 시험이 부르는 함수보다 좁은 스코프는 옛 판을 초록으로
 * 재므로(새는 방향은 통과), 스코프를 선언한 도구는 「소스가 부르는 함수 ⊆ 선언 목록」을 여기서
 * 잰다. 함수 사용은 사람이 실제로 쓰는 표기 셋에서 걷는다: URL 리터럴 · 조회 기본값 · `함수:` 옵션. */
/* 스코프를 선언한 도구가 둘 이상이라 **판정을 한 곳에서 파생**시킨다 — 도구마다 이 검사를
 * 베껴 적으면 갈라지고, 갈라진 쪽의 증상은 「그 도구만 조용히 안 재짐」이다(=통과 모양). */
const 스코프도구 = [
  { 파일: '배달왕복시험.js', 최소: 4 },   // deliver·tasks·corrections·progress
  { 파일: '골든왕복시험.js', 최소: 1 },   // teach 하나(픽스처는 SQL · 성적표는 DB 직독)
  { 파일: 'eval-run.js', 최소: 1 },        // correct 하나(평가 통로는 DB 무접촉이라 다른 함수를 안 부른다)
];

for (const { 파일, 최소 } of 스코프도구) {
  test(`${파일} 게이트 스코프 — 시험이 부르는 함수를 전부 덮는다`, () => {
    const 소스 = fs.readFileSync(path.join(ROOT, 'tools', 파일), 'utf8');
    const 선언문 = 소스.match(/const 게이트함수들 = \[([^\]]*)\]/);
    assert.ok(선언문, `${파일} 에 게이트함수들 선언이 없다 — 스코프를 접었으면 이 회귀도 같이 접는다`);
    assert.ok(소스.includes('함수목록: 게이트함수들'),
      `${파일}: 게이트함수들이 열기에 안 실린다 — 선언만 있고 발동이 없으면 스코프는 장식이다`);
    const 선언 = new Set([...선언문[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
    const 사용 = new Set();
    for (const m of 소스.matchAll(/functions\/v1\/([a-z_-]+)/g)) 사용.add(m[1]);   // URL 리터럴(호출 = deliver·teach)
    for (const m of 소스.matchAll(/옵션\.함수 \?\? '([^']+)'/g)) 사용.add(m[1]);   // 조회 기본값(tasks)
    for (const m of 소스.matchAll(/함수: '([^']+)'/g)) 사용.add(m[1]);             // 조회 옵션
    assert.ok(사용.size >= 최소,
      `${파일}: 함수 사용을 ${사용.size}종밖에 못 걷었다(최소 ${최소}) — 표기가 바뀌었으면 걷는 정규식부터 고친다`);
    for (const f of 사용) {
      assert.ok(선언.has(f), `${파일}: 게이트 스코프에 「${f}」 가 없다 — 시험이 부르는데 그 함수의 낡음을 안 잰다`);
    }
  });
}
