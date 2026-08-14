/* 문항별 검수 장부 회귀 — 「낡음」과 「분모」가 이 층의 급소라 값으로 잰다(발전 트랙 ① · 08-14). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const 팩 = require('../contents/토픽퀴즈문항.js');
const {
  검수판, 범주표, 범주이름들, 지문, 범주초안, 칸사유, 검수판정, 확정얹기, 반려얹기, 범주문구,
} = require('../lib/토픽퀴즈검수.js');

const 지금 = '2026-08-14T12:00:00.000Z';
const 첫문항 = 팩.문항들[0];

test('범주는 팩 머리말의 저작 원칙 넷 그대로 — 새 축을 발명하지 않는다', () => {
  assert.deepEqual(범주이름들, ['음운', '형태', '호응', '의미']);
  /* 화면에 나가는 문구는 «범주당 한 벌» — 이게 몽골어 검수 발주를 100줄에서 4줄로 만든 근거다. */
  assert.equal(범주표.length, 4);
  for (const c of 범주표) assert.ok(c.문구_ko && typeof c.문구_ko === 'string');
});

test('몽골어 문구는 비어 있다 — 지어낸 번역을 화면에 내보내지 않는다(검수 발주 대상 4줄)', () => {
  for (const c of 범주표) assert.equal(c.문구_mn, '', '번역이 검수 없이 들어왔다');
  assert.equal(범주문구('없는범주'), null);
  assert.equal(범주문구('음운').문구_ko, 범주표[0].문구_ko);
});

test('범주 초안 — 조사=음운 · 부사=호응 · 어휘=의미 · 어미/표현=형태 · 모르면 null', () => {
  assert.equal(범주초안(['skill-ko-grammar-particle-topic']), '음운');
  assert.equal(범주초안(['skill-ko-vocab-adverb']), '호응');
  assert.equal(범주초안(['skill-ko-vocab-antonym']), '의미');
  assert.equal(범주초안(['skill-ko-grammar-tense-past']), '형태');
  assert.equal(범주초안(['skill-ko-expression-ability']), '형태');
  assert.equal(범주초안([]), null);
  assert.equal(범주초안(['skill-딴것']), null, '모르는 축을 지어냈다');
});

test('팩 전 문항에 초안이 선다 — 안 서면 그 문항에서 사람 손이 한 칸 늘어난다', () => {
  const 빈것 = 팩.문항들.filter((q) => 범주초안(q.skill_ids) === null).map((q) => q.문항id);
  assert.deepEqual(빈것, [], `초안 없는 문항: ${빈것.join(',')}`);
});

test('확정얹기 — 장부를 제자리에서 고치지 않는다(저장 실패 시 옛 장부가 살아 있어야 한다)', () => {
  const 옛 = {};
  const 새 = 확정얹기({ 장부: 옛, 문항: 첫문항, 범주: '음운', 지금 });
  assert.deepEqual(옛, {}, '원본이 오염됐다');
  assert.equal(새[첫문항.문항id].확정, true);
  assert.equal(새[첫문항.문항id].지문, 지문(첫문항));
});

test('확정얹기 — 범주·시각 불량은 던진다(모양 이상한 칸이 통과로 새면 안 된다)', () => {
  assert.throws(() => 확정얹기({ 문항: 첫문항, 범주: '아무거나', 지금 }), TypeError);
  assert.throws(() => 확정얹기({ 문항: 첫문항, 범주: '음운' }), TypeError, '시각 없이 통과했다');
  assert.throws(() => 확정얹기({ 범주: '음운', 지금 }), TypeError);
});

test('칸사유 — 미확정·범주불량·지문없음을 각각 가른다', () => {
  assert.equal(칸사유(undefined, 첫문항), '칸없음');
  assert.equal(칸사유({ 확정: false }, 첫문항), '미확정');
  assert.equal(칸사유({ 확정: true, 범주: '엉뚱', 지문: 'x' }, 첫문항), '범주불량');
  assert.equal(칸사유({ 확정: true, 범주: '음운' }, 첫문항), '지문없음');
  assert.equal(칸사유({ 확정: true, 범주: '음운', 지문: 지문(첫문항) }, 첫문항), null);
});

test('🔑 문항이 바뀌면 그 검수는 «낡음» — 검수 표식이 고쳐진 문항 위에 앉지 않는다', () => {
  const 장부 = 확정얹기({ 문항: 첫문항, 범주: '음운', 지금 });
  const 고친문항 = { ...첫문항, 질문: 첫문항.질문 + ' (문구 수정)' };
  assert.equal(칸사유(장부[첫문항.문항id], 첫문항), null);
  assert.equal(칸사유(장부[첫문항.문항id], 고친문항), '낡음');
  /* 보기 라벨만 바뀌어도 낡는다 — 정답 유일성 검수는 보기 전체에 걸린 판정이다. */
  const 보기고침 = { ...첫문항, 보기: [{ ...첫문항.보기[0], label: '딴말' }, ...첫문항.보기.slice(1)] };
  assert.equal(칸사유(장부[첫문항.문항id], 보기고침), '낡음');
});

test('반려는 확정을 지우지 않고 사유를 남긴다 — 장부는 무슨 일이 있었는지도 든다', () => {
  const 장부 = 반려얹기({ 문항: 첫문항, 사유: '정답이 둘로 읽힌다', 검수자: '강사', 지금 });
  assert.equal(장부[첫문항.문항id].확정, false);
  assert.equal(장부[첫문항.문항id].반려사유, '정답이 둘로 읽힌다');
  assert.equal(칸사유(장부[첫문항.문항id], 첫문항), '미확정');
});

test('검수판정 — 빈 장부의 0 과 「전부 통과」가 분모로 갈린다(F207)', () => {
  const 빈판정 = 검수판정({ 문항들: 팩.문항들, 장부: {} });
  assert.equal(빈판정.검수판, 검수판);
  assert.deepEqual(빈판정.송출가능, []);
  assert.equal(빈판정.분모.팩, 팩.문항들.length);
  assert.equal(빈판정.분모.사유별.칸없음, 팩.문항들.length, '0 인데 분모가 안 남았다');
});

test('검수판정 — 통과한 문항부터 선다(팩 전체 상수 하나가 막던 자리)', () => {
  let 장부 = {};
  for (const q of 팩.문항들.slice(0, 3)) 장부 = 확정얹기({ 장부, 문항: q, 범주: 범주초안(q.skill_ids), 지금 });
  장부 = 반려얹기({ 장부, 문항: 팩.문항들[3], 사유: '보기 둘이 자연스럽다', 지금 });
  const r = 검수판정({ 문항들: 팩.문항들, 장부 });
  assert.deepEqual(r.송출가능, 팩.문항들.slice(0, 3).map((q) => q.문항id));
  assert.equal(r.막힘[팩.문항들[3].문항id], '미확정');
  assert.equal(r.분모.송출가능, 3);
  assert.equal(r.분모.사유별.칸없음, 팩.문항들.length - 4);
});

test('팩 상수 검수확정은 그대로 false — 이 장부가 그 축을 대체하지 않는다', () => {
  assert.equal(팩.검수확정, false, '팩 상수가 바뀌었다 — 라운드 통로가 어느 축을 보는지 재확인');
});
