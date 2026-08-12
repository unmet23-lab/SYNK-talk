/* eval 채점기의 `--대조` — 두 판의 «항목 이동»을 기계가 가른다.
 *
 * 왜 생겼나(08-12 실물): 이 시험은 잡음 바닥이 13%라 **총점으로는 판을 대조할 수 없고**,
 * 읽을 수 있는 것은 「어느 항목이 뒤집혔나」뿐이다. 그런데 그걸 사람이 두 결과를 눈으로 훑어
 * 찾고 있었고, 실제로 틀렸다 — `evals/결과.md` 의 v3↔v4 절이 회귀를 「1건(M03)」이라 적었는데
 * 기계로 재니 **회귀는 E34·M10 두 건이고 M03 은 두 판 다 실패**(회귀가 아니다)였다.
 * 🔑 눈으로 찾을 때 놓치는 쪽은 늘 **회귀**다 — 기대한 개선은 찾아보지만, 기대하지 않은
 *   회귀는 찾을 이유가 없어서 안 본다. 그래서 이 자리는 사람이 아니라 기계가 진다.
 *
 * 탐지력은 **픽스처가 진다**(아래 첫 시험) — 실저장소 출력에 기대면 그 파일이 바뀌는 날
 * 탐지력이 조용히 사라진다. 실저장소는 「거짓양성이 안 난다」만 본다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { 판대조, main } = require('../tools/eval-score.js');

test('판 대조 — 개선·회귀·그대로실패·판정축을 가른다 (탐지력 픽스처)', () => {
  const 이전 = [
    { id: 'A', 통과: false }, { id: 'B', 통과: true }, { id: 'C', 통과: false },
    { id: 'D', 통과: true }, { id: 'E', 통과: null }, { id: 'F', 통과: null },
  ];
  const 지금 = [
    { id: 'A', 통과: true },   // 개선
    { id: 'B', 통과: false },  // 회귀
    { id: 'C', 통과: false },  // 그대로 실패
    { id: 'D', 통과: true },   // 그대로 통과 — 어느 칸에도 안 든다
    { id: 'E', 통과: true },   // 판정불가 → 통과: «개선»이 아니다
    { id: 'F', 통과: null },   // 둘 다 판정불가 — 안 움직였다
  ];
  const m = 판대조(이전, 지금);
  assert.deepStrictEqual(m.개선.map((r) => r.id), ['A']);
  assert.deepStrictEqual(m.회귀.map((r) => r.id), ['B']);
  assert.deepStrictEqual(m.그대로실패.map((r) => r.id), ['C']);
  assert.deepStrictEqual(m.판정축.map((r) => r.id), ['E']);
});

test('🔴 판정불가(null)를 «개선»으로 세지 않는다 — 안 돌린 판과 견주면 전부 개선으로 보인다', () => {
  /* 이 시험이 무너지는 날의 증상: 「모델을 안 돌린 판」을 앞 판으로 놓고 대조하면
   * 102건 전부가 «개선»으로 찍혀, 아무것도 안 고친 판이 최고 성적표를 받는다.
   * 새는 방향은 여기서도 「통과」다. */
  const 안돌린판 = Array.from({ length: 5 }, (_, i) => ({ id: `X${i}`, 통과: null }));
  const 돌린판 = Array.from({ length: 5 }, (_, i) => ({ id: `X${i}`, 통과: true }));
  const m = 판대조(안돌린판, 돌린판);
  assert.strictEqual(m.개선.length, 0, '판정불가가 개선으로 샜다 — 안 돌린 판이 만점으로 보인다');
  assert.strictEqual(m.판정축.length, 5, '시험지가 다르다는 신호가 안 섰다');
});

test('🔴 `--대조` 의 값이 «채점 대상»으로 밀리지 않는다 — 손잡이가 늘 때마다 열리던 함정', () => {
  /* 원래 함정: `--fixture` 하나만 있을 때 `fi === -1` 이면 `fi + 1 === 0` 이라 조건을 그냥
   * `i !== fi + 1` 로 쓰면 **출력 경로 자신이 걸러진다**. 소스 주석이 그 함정을 적어 두고
   * 있었는데, 손잡이가 하나 더 늘면 같은 함정이 «값 자리»마다 다시 열린다.
   * 그래서 값 자리를 한 목록에서 파생시켰고, 이 회귀가 그 파생이 풀리는 것을 막는다. */
  const 있어야할것 = ['evals/출력_v4.json', 'evals/출력_v3.json'].map((p) => path.join(ROOT, p));
  if (!있어야할것.every((p) => fs.existsSync(p))) {
    test.skip('실저장소 출력 2벌이 없다 — 이 시험은 거짓양성만 보므로 skip 으로 드러낸다');
    return;
  }
  const 원래 = console.log;
  const 줄 = [];
  console.log = (...a) => 줄.push(a.map(String).join(' '));
  try {
    main(['evals/출력_v4.json', '--대조', 'evals/출력_v3.json']);
  } finally {
    console.log = 원래;
  }
  const 머리 = 줄.find((l) => l.includes('교정 엔진 채점'));
  assert.ok(머리, '채점 머리줄이 없다');
  assert.match(머리, /출력_v4\.json/, '채점 대상이 `--대조` 의 값으로 밀렸다');
  assert.ok(줄.some((l) => l.includes('판 대조')), '대조 절이 안 섰다');
});

test('대조가 채점 조립을 베끼지 않는다 — 판정이 두 벌이 되면 «대조표만» 조용히 틀린다', () => {
  /* 가드 맹점 ④: 같은 판정을 두 곳에 적으면 갈라지고, 갈라진 쪽 증상은 통과와 같은 모양이다.
   * 여기서 갈라지면 채점표는 맞는데 대조표만 틀리고, 대조표는 아무도 손으로 검산하지 않는다
   * (검산할 수 있었으면 애초에 이 도구가 필요 없었다). */
  const 본체 = fs.readFileSync(path.join(ROOT, 'tools', 'eval-score.js'), 'utf8');
  /* ⚠ 정의와 «호출»을 갈라 센다 — 첫 판에서 `scoreOne\(fx,` 로 뭉뚱그려 세니 함수 정의
   * (`function scoreOne(fx, out)`)까지 호출로 잡혀 **거짓양성**이 났다(가드 맹점 ①:
   * 사람이 실제로 쓰는 표기로 검사한다). 거짓양성은 이런 검사의 유일한 사망 원인이다. */
  const 정의 = 본체.match(/function scoreOne\(/g) || [];
  const 호출 = 본체.match(/(?<!function )scoreOne\(/g) || [];
  assert.strictEqual(정의.length, 1, `scoreOne 정의가 ${정의.length}곳이다`);
  assert.strictEqual(호출.length, 1, `scoreOne 호출이 ${호출.length}곳이다 — 채점기와 대조가 갈렸다`);
  assert.match(본체, /판대조\(채점하기\(/, '대조가 공용 채점 통로를 안 지난다');
});
