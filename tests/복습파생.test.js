/* 복습 파생층 회귀 — 설계 §8-8 인수 일곱을 상시 기계로
 *   (정본 = appsscript docs/복습스케줄러_설계.md §8 v0.3 · 08-24 명세).
 *
 * ■ 무엇을 재나
 *   ① R1 교정 실패 — 확정판 태그 n → 실패 리뷰 n · '오류없음' 은 카드가 아니다.
 *   ② 확정판 선별 — teacher 승(뒤에 온 ai 도 못 뒤집는다) · supersedes 제거 · 골든 verdict 해석.
 *   ③ R2 재제출 성공 — 사라진 태그만 · 교정 미착은 «재제출대기» · 새 태그는 R1 몫.
 *   ④ R3 문항축(G4) — 맞음/축오답/모름 3갈래 · skipped 는 회피 · 카드는 언제나 `재는축`.
 *   ⑤ S2 — 파생 산출을 계산기에 넣으면 `버린수` 0(미상을 계산기까지 흘리지 않는다).
 *   ⑥ 결정성 — 입력 순서를 섞어도 같은 리뷰 열.
 *   ⑦ 셈 정합 — 리뷰 총량 = 갈래 합 · 버림도 갈래로 드러난다(합계 = 갈래+갈래). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { 확정판, 리뷰파생 } = require('../lib/복습파생.js');
const { 카드키 } = require('../lib/태그기술표.js');   // S6 확정(08-24) — 카드 키는 표를 지난다
const { 학생카드접기, due카드들 } = require('../lib/복습스케줄.js');
const { VERDICT } = require('../lib/검수확정.js');
const { G4스냅샷모양판 } = require('../lib/게임스냅샷.js');

/* ── 픽스처 재료 — 태그는 계약 실명 그대로(지어낸 축 금지) ─────────────────────── */
const 주격 = '조사:주격(이/가·은/는)';
const 시제 = '어미:시제';
const 받침 = '맞춤법:받침';

const 제출행 = (event_id, sid, { at = '2026-08-20T10:00:00Z', learner = 'L1', retry } = {}) => ({
  event_id, learner_id: learner, event_type: 'submission.created', occurred_at: at,
  ...(retry ? { retry_of_event_id: retry } : {}),
  submission: { submission_id: sid },
});
const 교정 = (correction_id, sid, { actor = 'ai', tags, verdict, reviewed, supersedes, at = '2026-08-20T22:00:00Z' } = {}) => ({
  correction_id, submission_id: sid, actor_kind: actor,
  error_tags: tags ?? [], ...(verdict ? { verdict } : {}),
  ...(reviewed ? { reviewed_correction_id: reviewed } : {}),
  ...(supersedes ? { supersedes } : {}), created_at: at,
});
const 빈칸 = Object.freeze({
  빈칸id: 'b1', 문장틀: '학교___ 가요.', 재는축: '조사:처소(에·에서)', 해설: '방향의 「에」',
  정답집합: ['에'], 오답집합: ['에서'],
});
const G4행 = (event_id, { 답, at = '2026-08-21T09:00:00Z', learner = 'L1', confidence, skipped } = {}) => ({
  event_id, learner_id: learner, event_type: 'quiz.answered', occurred_at: at,
  payload: { ver: 1, ...(confidence ? { confidence } : {}), ...(skipped ? { skipped: true } : {}) },
  submission: {
    submission_id: 'sub-' + event_id, task_schema_ver: G4스냅샷모양판,
    task_snapshot: { 빈칸 }, ...(답 != null ? { body_original: 답 } : {}),
  },
});

test('① R1 — 확정판 태그가 그 제출 시각의 실패 리뷰다 · 오류없음은 카드가 아니다', () => {
  const { 리뷰들, 셈 } = 리뷰파생({
    행들: [제출행('e1', 's1')],
    교정들: [교정('c1', 's1', { tags: [주격, 시제, '오류없음'] })],
  });
  assert.equal(리뷰들.length, 2);
  /* S6 뒤 카드 키는 표를 지난다 — 주격은 skill 로, 시제(대응없음)는 태그 그대로.
   * 아래 첫 줄은 «키 교체가 실제로 일어났나»의 하드 닻이다(표 import 로만 재면 교체를 안 해도 초록). */
  assert.ok(리뷰들.some((r) => r.card_id === 'skill-ko-grammar-particle-topic'), '주격 카드가 skill 키로 안 갔다 — ⓐ 키 교체가 죽었다');
  assert.deepEqual(리뷰들.map((r) => r.card_id).sort(), [카드키(시제), 카드키(주격)].sort());
  for (const r of 리뷰들) {
    assert.equal(r.정답, false); assert.equal(r.확신도, null);
    assert.equal(r.at, '2026-08-20T10:00:00Z', 'at 은 교정 시각이 아니라 제출 occurred_at 이다(§8-2)');
  }
  assert.equal(셈.리뷰.교정실패, 2);
  const 무오류만 = 리뷰파생({ 행들: [제출행('e1', 's1')], 교정들: [교정('c1', 's1', { tags: ['오류없음'] })] });
  assert.equal(무오류만.리뷰들.length, 0, '오류없음이 카드로 샜다');
  assert.equal(무오류만.셈.버림.무오류, 1, '오류 0 판정이 조용히 사라졌다 — 세어 드러나야 한다');
  /* 계약 밖 문자열은 카드가 아니다 — 리허설 실측(08-24)에서 왕복 픽스처의 「조사 오류」류가
   * due 재료로 새는 것을 봤다. 새면 교체일에 그 문자열이 재출제 지시로 올라간다. */
  const 헐거움 = 리뷰파생({ 행들: [제출행('e1', 's1')], 교정들: [교정('c1', 's1', { tags: ['조사 오류', 주격] })] });
  assert.deepEqual(헐거움.리뷰들.map((r) => r.card_id), [카드키(주격)], '계약 밖 태그가 카드로 샜다');
  assert.equal(헐거움.셈.버림.계약밖태그, 1, '계약 밖 태그는 세어 드러나야 한다 — 조용한 삼킴 금지');
});

test('② 선별 — 사람 우선(뒤에 온 ai 불복 불가) · supersedes 제거 · 골든 verdict 해석', () => {
  // 사람 행 «뒤에» ai 행이 와도 사람이 이긴다 — correct 의 중복 가드는 ai 존재만 본다.
  assert.deepEqual(확정판([
    교정('c사람', 's1', { actor: 'teacher', tags: [받침], at: '2026-08-20T20:00:00Z' }),
    교정('c기계', 's1', { tags: [주격, 시제], at: '2026-08-21T03:00:00Z' }),
  ]), [받침], '뒤에 온 AI 재채점이 사람 판정을 뒤집었다');
  // 재검수 Z — supersedes 로 대체된 행은 죽었다.
  assert.deepEqual(확정판([
    교정('cA', 's1', { actor: 'teacher', tags: [주격], at: '2026-08-20T20:00:00Z' }),
    교정('cB', 's1', { actor: 'teacher', tags: [시제], supersedes: 'cA', at: '2026-08-21T08:00:00Z' }),
  ]), [시제]);
  // 골든 「원문이 이미 맞다」(태그 일부러 빈 갈래) → 오류 0 파생 → 그 제출의 실패 리뷰가 재계산에서 사라진다.
  const 전 = 리뷰파생({ 행들: [제출행('e1', 's1')], 교정들: [교정('c1', 's1', { tags: [주격] })] });
  assert.equal(전.리뷰들.length, 1);
  const 후 = 리뷰파생({
    행들: [제출행('e1', 's1')],
    교정들: [
      교정('c1', 's1', { tags: [주격] }),
      교정('c2', 's1', { actor: 'teacher', tags: [], verdict: VERDICT.원문, reviewed: 'c1', at: '2026-08-21T08:00:00Z' }),
    ],
  });
  assert.equal(후.리뷰들.length, 0, '골든 「원문이 이미 맞다」가 서면 잘못 붙은 실패 리뷰는 재계산에서 사라져야 한다(§8-2 소급)');
  assert.equal(후.셈.버림.무오류, 1);
  // 골든 「AI 교정이 맞다」 → AI 행 태그 승계.
  assert.deepEqual(확정판([
    교정('c1', 's1', { tags: [시제] }),
    교정('c2', 's1', { actor: 'teacher', tags: [], verdict: VERDICT.AI, reviewed: 'c1', at: '2026-08-21T08:00:00Z' }),
  ]), [시제]);
  // 빈 태그 + 「고칠 곳이 있다」 = 태그 축 판정 안 함 → ai 행으로 내려간다.
  assert.deepEqual(확정판([
    교정('c1', 's1', { tags: [받침] }),
    교정('c2', 's1', { actor: 'teacher', tags: [], verdict: VERDICT.수정, at: '2026-08-21T08:00:00Z' }),
  ]), [받침]);
});

test('③ R2 — 사라진 태그만 성공이다 · 교정 미착은 «재제출대기» · 남은 태그는 R1 몫', () => {
  const 행들 = [제출행('e1', 's1'), 제출행('e2', 's2', { at: '2026-08-22T10:00:00Z', retry: 'e1' })];
  const { 리뷰들, 셈 } = 리뷰파생({
    행들,
    교정들: [교정('c1', 's1', { tags: [주격, 시제] }), 교정('c2', 's2', { tags: [시제], at: '2026-08-22T22:00:00Z' })],
  });
  const 성공 = 리뷰들.filter((r) => r.정답 === true);
  assert.equal(성공.length, 1);
  assert.equal(성공[0].card_id, 카드키(주격), '사라진 태그(주격)만 성공이다 — 남은 시제는 성공이 아니다(키는 표를 지난다)');
  assert.equal(성공[0].at, '2026-08-22T10:00:00Z', '성공의 시각은 재제출의 occurred_at 이다');
  assert.equal(셈.리뷰.재제출성공, 1);
  assert.equal(리뷰들.filter((r) => r.정답 === false).length, 3, 's1 두 태그 + s2 시제 = R1 실패 셋');
  // 재제출 교정 미착 — 리뷰를 지어내지 않고 센다(교정이 서는 날 재계산이 접는다).
  const 대기 = 리뷰파생({ 행들, 교정들: [교정('c1', 's1', { tags: [주격] })] });
  assert.equal(대기.리뷰들.filter((r) => r.정답 === true).length, 0);
  assert.equal(대기.셈.버림.재제출대기, 1);
  // 원본 행이 입력에 없다 — 원본미상으로 드러난다.
  const 미상 = 리뷰파생({
    행들: [제출행('e2', 's2', { retry: 'e없음' })],
    교정들: [교정('c2', 's2', { tags: ['오류없음'] })],
  });
  assert.equal(미상.셈.버림.재제출원본미상, 1);
});

test('④ R3(G4) — 맞음/축오답/모름 · skipped 는 회피 · 카드는 언제나 재는축', () => {
  const { 리뷰들, 셈 } = 리뷰파생({
    행들: [
      G4행('q1', { 답: '에', confidence: 'low' }),          // 맞음 — 성공 리뷰 + 확신도
      G4행('q2', { 답: '에서' }),                            // 축오답 — 실패 리뷰
      G4행('q3', { 답: '으로' }),                            // 모름 — 살아있는 이형태 가능 · 버림
      G4행('q4', { skipped: true }),                         // 모르겠어요 — 회피(리뷰 아님)
      { event_id: 'q5', learner_id: 'L1', event_type: 'quiz.answered', occurred_at: '2026-08-21T09:00:00Z', payload: { ver: 1 } }, // 라디오꼴 — 축없음
    ],
    교정들: [],
  });
  assert.equal(셈.리뷰.문항축, 2);
  const 성공 = 리뷰들.find((r) => r.원천.event_id === 'q1');
  assert.equal(성공.정답, true);
  assert.equal(성공.확신도, 'low', 'G4 확신도가 등급 재료로 실려야 한다(§8-5)');
  assert.equal(성공.card_id, 카드키(빈칸.재는축), '맞음의 카드는 「오류없음」이 아니라 재는축(표를 지나 skill)이다 — S1 다리의 요체');
  assert.equal(리뷰들.find((r) => r.원천.event_id === 'q2').정답, false);
  assert.equal(셈.버림.미상, 1);
  assert.equal(셈.버림.회피, 1);
  assert.equal(셈.버림.축없음, 1, 'skill 축 행이 태그 카드로 새면 안 된다(E2 전 매핑 0)');
  assert.ok(리뷰들.every((r) => r.card_id !== '오류없음'));
});

test('④-b R3(퀴즈) — skill 축 정오가 카드에 합류한다(S6 확정) · 선택·정답 없으면 미상', () => {
  const 퀴즈행 = (event_id, { 정답, 고른, confidence, skills = ['skill-ko-grammar-particle-topic'] } = {}) => ({
    event_id, learner_id: 'L1', event_type: 'quiz.answered', occurred_at: '2026-08-21T09:00:00Z',
    skill_ids: skills,
    payload: { ver: 1, ...(고른 ? { selected_option: 고른 } : {}), ...(confidence ? { confidence } : {}) },
    submission: { submission_id: 'sub-' + event_id, task_snapshot: { ...(정답 ? { 정답 } : {}) } },
  });
  const { 리뷰들, 셈 } = 리뷰파생({
    행들: [
      퀴즈행('r1', { 정답: 'o2', 고른: 'o2', confidence: 'guess' }),   // 맞음 — 찍맞이 Hard 재료로 실린다
      퀴즈행('r2', { 정답: 'o1', 고른: 'o3' }),                        // 틀림
      퀴즈행('r3', { 고른: 'o1' }),                                    // 정답없음 — 미상
      퀴즈행('r4', { 정답: 'o1' }),                                    // 선택없음 — 미상
    ],
    교정들: [],
  });
  assert.equal(셈.리뷰.퀴즈축, 2);
  const 맞음 = 리뷰들.find((r) => r.원천.event_id === 'r1');
  assert.equal(맞음.정답, true);
  assert.equal(맞음.확신도, 'guess', '찍어서 맞힘이 등급 재료로 안 실렸다');
  assert.equal(맞음.card_id, 'skill-ko-grammar-particle-topic', '퀴즈 카드는 skill 키 그대로다');
  assert.equal(리뷰들.find((r) => r.원천.event_id === 'r2').정답, false);
  assert.equal(셈.버림.미상, 2, '선택없음·정답없음이 미상으로 안 세어졌다 — 지어내면 안 된다(S2)');
});

test('⑤ S2 — 파생 산출을 계산기에 넣으면 버린수 0 (미상은 여기까지 오지 않는다)', () => {
  const { 리뷰들 } = 리뷰파생({
    행들: [
      제출행('e1', 's1'), 제출행('e2', 's2', { at: '2026-08-22T10:00:00Z', retry: 'e1' }),
      G4행('q1', { 답: '에' }), G4행('q2', { 답: '으로' }),
    ],
    교정들: [교정('c1', 's1', { tags: [주격, 시제] }), 교정('c2', 's2', { tags: ['오류없음'], at: '2026-08-22T22:00:00Z' })],
  });
  const 상태들 = 학생카드접기(리뷰들);
  let 버린수합 = 0;
  for (const [, s] of 상태들) 버린수합 += s.버린수;
  assert.equal(버린수합, 0, '파생층이 미상·깨진 시각을 계산기까지 흘렸다(§8-8 인수 5)');
  assert.ok(due카드들(상태들, '2026-12-31T00:00:00Z').length >= 1, '리뷰가 접혔는데 due 목록이 영원히 비면 배선이 죽은 것이다');
});

test('⑥ 결정성 — 입력 순서를 섞어도 같은 리뷰 열이다', () => {
  const 행들 = [제출행('e1', 's1'), 제출행('e2', 's2', { at: '2026-08-22T10:00:00Z', retry: 'e1' }), G4행('q1', { 답: '에서' })];
  const 교정들 = [교정('c1', 's1', { tags: [주격, 시제] }), 교정('c2', 's2', { tags: [시제], at: '2026-08-22T22:00:00Z' })];
  const a = 리뷰파생({ 행들, 교정들 });
  const b = 리뷰파생({ 행들: [행들[2], 행들[0], 행들[1]], 교정들: [교정들[1], 교정들[0]] });
  assert.deepEqual(a.리뷰들, b.리뷰들, '입력 순서가 리뷰 열을 갈랐다 — 정렬 키가 죽었다');
  assert.deepEqual(a.셈, b.셈);
});

test('⑦ 셈 정합 — 리뷰 총량 = 갈래 합 · 버림도 갈래로 드러난다', () => {
  const { 리뷰들, 셈 } = 리뷰파생({
    행들: [
      제출행('e1', 's1'), 제출행('e2', 's2', { at: '2026-08-22T10:00:00Z', retry: 'e1' }),
      제출행('e3', 's3', { at: '깨진 시각' }),               // 시각없음
      G4행('q1', { 답: '에' }), G4행('q4', { skipped: true }),
    ],
    교정들: [
      교정('c1', 's1', { tags: [주격] }), 교정('c2', 's2', { tags: ['오류없음'], at: '2026-08-22T22:00:00Z' }),
      교정('c3', 's3', { tags: [받침] }),
      교정('c4', 's없음', { tags: [] }),                     // 판정 안 함 → 교정판정없음
      교정('c5', 's고아', { tags: [시제] }),                 // 행 없는 제출 → 원천행없음
    ],
  });
  const 리뷰합 = Object.values(셈.리뷰).reduce((a, b) => a + b, 0);
  assert.equal(리뷰들.length, 리뷰합, '리뷰 총량이 갈래 합과 다르다 — 합계는 갈래로 쪼개 낸다');
  assert.equal(셈.버림.시각없음, 1);
  assert.equal(셈.버림.교정판정없음, 1);
  assert.equal(셈.버림.원천행없음, 1);
  assert.equal(셈.버림.회피, 1);
});
