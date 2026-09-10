'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { 교정값 } = require('../lib/교정엔진.js');
const { scoreOne } = require('../tools/eval-score.js');
const 태그목록 = require('../계약/수집_교정_계약.json').오류태그;

// 실제 학생 자료가 아닌 합성 입력. 태그의 배타성만 검증하며 문법·언어 품질은 판정하지 않는다.
const 문항 = {
  id: 'synthetic-exclusive-tag', 종류: '오류',
  입력: '할머니가 어제부터 아파요.',
  기대태그: ['높임:주체'], 포함: ['할머니께서'], 불포함: ['할머니가'],
};
const 응답 = {
  고친문장: '할머니께서 어제부터 편찮으세요.', 오류태그: ['높임:주체'],
  오늘의포인트: '합성 해설', 칭찬: '', 다음미션: '',
};

test('교정값은 오류없음과 실제 오류 태그의 혼합을 부분 저장하지 않는다', () => {
  for (const 오류태그 of [
    ['높임:주체', '오류없음'],
    ['오류없음', '높임:주체'],
    [' 오류없음 ', '높임:주체', '오류없음'],
  ]) {
    assert.deepEqual(교정값(JSON.stringify({ ...응답, 오류태그 }), 태그목록), {
      사유: '상충태그:오류없음',
    });
  }
});

test('교정값은 단독 오류없음과 실제 오류 태그만 있는 응답을 그대로 보존한다', () => {
  for (const 오류태그 of [['오류없음'], ['높임:주체'], ['높임:주체', '어미:시제']]) {
    const r = 교정값(JSON.stringify({ ...응답, 오류태그 }), 태그목록);
    assert.equal(r.사유, null);
    assert.deepEqual(r.error_tags, 오류태그);
    assert.equal(r.explanation, 응답.오늘의포인트, '별도 언어 판정은 추가하지 않는다');
  }
});

test('기대 태그를 모두 냈어도 오류없음이 섞이면 미검출과 통과가 동시에 참일 수 없다', () => {
  for (const 오류태그 of [['높임:주체', '오류없음'], ['오류없음', '높임:주체']]) {
    const r = scoreOne(문항, { ...응답, 오류태그 });
    assert.equal(r.판정.교정, true);
    assert.equal(r.미검출, true);
    assert.equal(r.판정.태그, false);
    assert.equal(r.통과, false);
    assert.ok(r.메모.some((s) => s.includes('미검출')));
  }
});

test('오류없음은 기대 태그가 빈 오류 문항이나 승인 대안으로도 통과하지 않는다', () => {
  for (const fx of [
    { ...문항, 기대태그: [] },
    { ...문항, 기대태그: ['어미:시제'], 대안태그: [['높임:주체']] },
  ]) {
    const r = scoreOne(fx, { ...응답, 오류태그: ['높임:주체', '오류없음'] });
    assert.equal(r.미검출, true);
    assert.equal(r.대안통과, false);
    assert.equal(r.판정.태그, false);
    assert.equal(r.통과, false);
  }
});

test('정상문 단독 오류없음과 유효 오류·대안 태그의 기존 채점은 유지한다', () => {
  const 정상 = { id: 'synthetic-correct', 종류: '정상', 입력: 응답.고친문장 };
  assert.equal(scoreOne(정상, { ...응답, 오류태그: ['오류없음'] }).통과, true);
  assert.equal(scoreOne(정상, { ...응답, 오류태그: ['오류없음', '높임:주체'] }).통과, false);
  assert.equal(scoreOne(문항, 응답).통과, true);
  const 대안 = scoreOne(
    { ...문항, 기대태그: ['어미:시제'], 대안태그: [['높임:주체']] }, 응답,
  );
  assert.equal(대안.통과, true);
  assert.equal(대안.대안통과, true);
});
