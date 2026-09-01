'use strict';
/* 라디오 곡차례 회귀 — 「블록으로 나가나」와 「조용히 빠지는 것이 없나」 둘을 못박는다.
 *
 * 이 파일이 지키는 사고: 09-02 이전 재생목록은 이름순 `.sort()` 였다. 그래서 곡을 더하면
 * 새 곡이 제 블록 뒤가 아니라 «목록 맨 끝»에 붙어 시티팝 블록이 둘로 쪼개졌다 —
 * 방송에서는 마스코트가 한 곡만 잠깐 바뀌었다 되돌아오는 모양이 된다.
 *
 * ⚠ `tests/라디오편성.test.js` 와 다른 파일이다(그쪽은 퀴즈 문항 추첨 가중).
 */
const test = require('node:test');
const assert = require('node:assert');
const 곡차례 = require('../lib/라디오곡차례.js');

const ts = (n, 결) => `synk-radio-${String(n).padStart(2, '0')}-${결}-air.ts`;

test('블록 차례로 세운다 — 이름순이 아니다', () => {
  // 만든 차례는 섞였는데(01 시티팝 · 02 차분 · 03 시티팝) 나가는 차례는 블록이어야 한다.
  const { 차례 } = 곡차례.차례세우기([ts(2, 'calm'), ts(1, 'citypop'), ts(3, 'citypop')]);
  assert.deepStrictEqual(차례, [ts(1, 'citypop'), ts(3, 'citypop'), ts(2, 'calm')]);
});

test('나중에 더한 곡이 제 블록 «뒤»에 붙는다 — 목록 끝이 아니다', () => {
  const 있던것 = [ts(1, 'citypop'), ts(2, 'citypop'), ts(3, 'calm')];
  const { 차례 } = 곡차례.차례세우기([...있던것, ts(9, 'citypop')]);
  assert.deepStrictEqual(차례, [ts(1, 'citypop'), ts(2, 'citypop'), ts(9, 'citypop'), ts(3, 'calm')]);
});

test('블록 안에서는 번호 순 — 10 이 2 보다 뒤다(문자열 정렬이면 앞선다)', () => {
  const { 차례 } = 곡차례.차례세우기([ts(10, 'calm'), ts(2, 'calm')]);
  assert.deepStrictEqual(차례, [ts(2, 'calm'), ts(10, 'calm')]);
});

test('블록차례가 결의 순서를 정한다 — citypop → calm → house', () => {
  const { 블록 } = 곡차례.차례세우기([ts(1, 'house'), ts(2, 'calm'), ts(3, 'citypop')]);
  assert.deepStrictEqual(블록.map((b) => b.결), ['citypop', 'calm', 'house']);
});

test('이름을 못 읽는 트랙을 «버리지 않는다» — 맨 뒤에 두고 알린다', () => {
  const { 차례, 모름 } = 곡차례.차례세우기([ts(1, 'citypop'), '남의곡.ts', ts(2, 'calm')]);
  assert.deepStrictEqual(모름, ['남의곡.ts']);
  assert.strictEqual(차례.length, 3, '트랙 수가 줄면 조용한 누락이다');
  assert.strictEqual(차례[차례.length - 1], '남의곡.ts');
});

test('모르는 결도 버리지 않는다 — 블록차례에 없는 결', () => {
  const { 차례, 블록, 모름 } = 곡차례.차례세우기([ts(1, 'citypop'), ts(2, 'jazz')]);
  assert.deepStrictEqual(블록.map((b) => b.결), ['citypop']);
  assert.deepStrictEqual(모름, [ts(2, 'jazz')]);
  assert.strictEqual(차례.length, 2);
});

test('트랙읽기 — 번호·결·한글 이름', () => {
  assert.deepStrictEqual(곡차례.트랙읽기('synk-radio-07-house-air.ts'), { 번호: 7, 결: 'house', 이름: '전자' });
  assert.deepStrictEqual(곡차례.트랙읽기('synk-radio-04-calm-air.mp3'), { 번호: 4, 결: 'calm', 이름: '차분' });
  assert.strictEqual(곡차례.트랙읽기('playlist.txt'), null);
});

test('결ascii 와 블록차례가 같은 결 집합을 안다 — 한쪽만 늘면 조용히 어긋난다', () => {
  assert.deepStrictEqual(Object.values(곡차례.결ascii).slice().sort(), 곡차례.블록차례.slice().sort());
});

test('결차례에 쓰인 결은 전부 결ascii 가 안다', () => {
  for (const 결 of 곡차례.결차례) assert.ok(곡차례.결ascii[결], `결ascii 가 모르는 결: ${결}`);
});

/* 🔴 09-02 사고 재발 방지 — 이름이 닮은 두 파일을 «섞지» 않았는지 값으로 잰다.
 *   그날 `lib/라디오편성.js`(퀴즈 추첨 가중)를 이 모듈로 통째로 덮었고,
 *   `추첨가중 is not a function` 으로 회귀가 잡았다. */
test('라디오편성(퀴즈 가중)과 라디오곡차례(곡 순서)는 서로 다른 모듈이다', () => {
  const 편성 = require('../lib/라디오편성.js');
  assert.strictEqual(typeof 편성.추첨가중, 'function', '라디오편성이 덮였다 — 퀴즈 추첨 가중이 사라졌다');
  assert.strictEqual(편성.차례세우기, undefined, '두 모듈이 섞였다');
  assert.strictEqual(곡차례.추첨가중, undefined, '두 모듈이 섞였다');
});
