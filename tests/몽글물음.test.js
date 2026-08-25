'use strict';
/* 몽글물음 — Vellum 앱 입구의 순수 판정 회귀.
 *
 * 🔴 이 스위트의 급소 둘:
 *   ① **상한 사본이 서버와 갈라지는 것** — 앱이 옛 숫자를 말해도 아무 데서도 안 빨개진다.
 *      그래서 서버 소스를 직접 읽어 대조한다(사본은 두되 갈라짐은 기계가 막는다).
 *   ② **인계를 실패로 읽는 것** — companion 의 기본값이 인계라, 이걸 오류로 그리면
 *      강사가 다시 묻고 빈칸 로그의 분모가 조용히 부푼다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const 몽 = require('../lib/몽글물음.js');
const 서버 = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'companion', 'index.ts'), 'utf8');

test('🔴 상한 사본이 서버와 같다 — 갈라지면 앱만 옛 숫자를 말하고 아무 데서도 안 빨개진다', () => {
  const 질 = /const 질문상한 = (\d+)/.exec(서버);
  const 화 = /const 화면상한 = (\d+)/.exec(서버);
  assert.ok(질 && 화, '서버에서 상한 상수를 못 찾았다 — 이름이 바뀌었으면 이 검사도 같이 고친다');
  assert.equal(몽.질문상한, Number(질[1]));
  assert.equal(몽.화면상한, Number(화[1]));
});

test('빈 질문은 못 보낸다 — 사유는 «비었다»가 아니라 침묵이다(입력 전 빨간 글씨 금지)', () => {
  const r = 몽.질문판정('   ');
  assert.equal(r.보낼수있나, false);
  assert.equal(r.사유, '');
  assert.equal(r.글자수, 0);
});

test('🔴 상한을 넘으면 «자르지 않고» 거절한다 — 자르면 물은 것과 다른 답이 온다', () => {
  const 긴글 = '가'.repeat(몽.질문상한 + 1);
  const r = 몽.질문판정(긴글);
  assert.equal(r.보낼수있나, false);
  assert.match(r.사유, /자까지/);
  assert.equal(r.남은수, -1);
  // 정확히 상한이면 통과한다(경계가 «이하»인지 «미만»인지가 서버와 같아야 한다)
  assert.equal(몽.질문판정('가'.repeat(몽.질문상한)).보낼수있나, true);
});

test('글자수는 코드포인트로 센다 — 이모지가 두 자로 세어지면 서버와 경계가 갈린다', () => {
  assert.equal(몽.질문판정('🙂').글자수, 1);
});

test('화면 맥락 — 없거나 너무 길면 안 보낸다(있는데 이상한 것만 막는다)', () => {
  assert.equal(몽.화면정리('  '), null);
  assert.equal(몽.화면정리('강사화면'), '강사화면');
  assert.equal(몽.화면정리('가'.repeat(몽.화면상한 + 1)), null);
});

test('보낼 몸의 칸 이름은 서버 계약 그대로 — screen 은 있을 때만 실린다', () => {
  assert.deepEqual(몽.보낼것({ 질문: ' 숙제 서클이 뭐죠? ' }), { question: '숙제 서클이 뭐죠?' });
  assert.deepEqual(몽.보낼것({ 질문: 'x', 화면: '강사화면' }), { question: 'x', screen: '강사화면' });
});

test('🔴 인계는 «실패»가 아니라 정상 갈래다 — 빨갛게 그리면 강사가 다시 묻는다', () => {
  const r = 몽.답읽기({ qa_id: 'q1', reply: '', cited_refs: [], handoff: true, handoff_reason: '문서에서 근거를 찾지 못했습니다' });
  assert.equal(r.갈래, '넘김');
  assert.equal(r.사유, '문서에서 근거를 찾지 못했습니다');
  assert.equal(r.qa_id, 'q1');
});

test('인계인데 사유가 비면 화면이 말할 문장을 준다 — 빈 말풍선을 그리지 않는다', () => {
  assert.equal(몽.답읽기({ handoff: true, handoff_reason: '' }).사유, '원장님께 넘겼어요');
});

test('🔴 «출처 0 으로 답함» 은 근거없음으로 드러낸다 — 삼키면 빈칸이 영영 안 보인다', () => {
  const r = 몽.답읽기({ reply: '주 2회입니다', cited_refs: [], handoff: false });
  assert.equal(r.갈래, '답함');
  assert.equal(r.근거없음, true);
  const b = 몽.답읽기({ reply: '주 2회입니다', cited_refs: ['커리큘럼 정본'], handoff: false });
  assert.equal(b.근거없음, false);
  assert.deepEqual(b.출처, ['커리큘럼 정본']);
});

test('답도 인계도 아니면 «못받음» — «답함»으로 새지 않는다(빈 답이 답으로 보이면 안 된다)', () => {
  assert.equal(몽.답읽기({ reply: '   ', handoff: false }).갈래, '못받음');
  assert.equal(몽.답읽기(null).갈래, '못받음');
  assert.equal(몽.답읽기(undefined).갈래, '못받음');
});

test('탐지력 — 인계 판정을 뒤집으면 위 검사가 잡는다', () => {
  const 가짜 = { handoff: true, reply: '지어낸 답' };
  assert.notEqual(몽.답읽기(가짜).갈래, '답함',
    'handoff=true 인데 reply 가 있다고 답으로 읽으면, 서버가 버리기로 한 답이 화면에 뜬다');
});
