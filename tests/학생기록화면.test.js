'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 그리기, ROOT } = require('./lib/화면세우기.js');
const { 기록응답확인 } = require(path.join(ROOT, 'src/학생기록API.js'));
const { 기록시각 } = require(path.join(ROOT, 'src/학생기록화면.js'));
const learner = '10000000-0000-4000-8000-000000000001';
function 기록() {
  return { student: { learner_id: learner, display_name: '합성 학생', class_name: '합성 반', level_current: null },
    retrieved_at: '2026-09-11T03:00:00Z', limit: 10, learning_access: 'available',
    observations: { items: [{ occurred_at: '2026-09-11T02:00:00Z', area: '태도', note_text: '짝의 말을 기다렸어요.' }], has_more: true },
    submissions: { items: [], has_more: false }, feedback: { items: [], has_more: false } };
}
test('학생 기록의 출처·현지 시각·급수 없음·최근 범위를 실제로 그린다', () => {
  const 글 = 그리기('src/학생기록화면.js', { 기록: 기록() }, '학생기록보기');
  for (const term of ['합성 학생', '급수 미등록', '울란바토르 시간', '출처: 강사가 남긴 관찰', '짝의 말을 기다렸어요.', '이전 기록 더 있음']) assert.ok(글.includes(term), term);
  assert.match(글, /최근\s*10\s*건만/);
});
test('동의로 숨겨진 기록을 빈 기록이라고 말하지 않는다', () => {
  const data = 기록(); data.learning_access = 'consent_required';
  const 글 = 그리기('src/학생기록화면.js', { 기록: data, 종류: 'submissions' }, '학생기록보기');
  assert.ok(글.includes('기록이 없다는 뜻은 아니에요')); assert.equal(글.includes('아직 학습 제출 기록이 없어요'), false);
});
test('빈 학습 기록과 앱 접수는 성과·교정 완료로 부풀리지 않는다', () => {
  const data = 기록();
  assert.ok(그리기('src/학생기록화면.js', { 기록: data, 종류: 'submissions' }, '학생기록보기').includes('아직 학습 제출 기록이 없어요'));
  data.submissions.items.push({ occurred_at: data.retrieved_at, task_format: '낭독' });
  const 글 = 그리기('src/학생기록화면.js', { 기록: data, 종류: 'submissions' }, '학생기록보기');
  assert.ok(글.includes('낭독 제출')); assert.ok(글.includes('교정 완료나 학습 성과를 뜻하지는 않아요'));
});
test('응답 오류·다른 학생 응답·동의 누출을 빈 상태로 접지 않는다', () => {
  assert.equal(기록응답확인(기록(), learner).student.learner_id, learner);
  assert.throws(() => 기록응답확인({}, learner));
  assert.throws(() => 기록응답확인(기록(), 'other'));
  const data = 기록(); data.learning_access = 'consent_required'; data.feedback.items.push({ body: '숨겨야 함' });
  assert.throws(() => 기록응답확인(data, learner));
});
test('날짜가 없거나 깨졌으면 현재 시각으로 지어내지 않는다', () => {
  assert.equal(기록시각(null), '기록 시각 미확인'); assert.equal(기록시각('bad'), '기록 시각 미확인');
  assert.ok(기록시각('2026-09-11T03:00:00Z').includes('11:00'));
});
