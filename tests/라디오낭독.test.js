'use strict';
/**
 * 라디오 「오늘의 표현」 낭독 통로 회귀 (발전 트랙 ④ · 설계 §2-2 ⓖ).
 *
 * 급소 셋을 픽스처로 못박는다:
 *   ① **역오염** — 낭독이 숙제 제출로 세어지면 「안 낸 날」이 「낸 날」로 뒤집힌다.
 *      이 파일의 `역오염` 절이 그 탐지력 자체를 잰다(표식을 지우면 빨개져야 한다).
 *   ② **비대칭** — 제출만 빼고 이탈을 안 빼면 완주율이 조용히 «낮아진다».
 *   ③ **봉투가 안 만들어지는 것** — 걸음 가드가 좁으면 녹음은 되고 서버엔 안 남는다.
 */
const test = require('node:test');
const assert = require('node:assert');

const 팩 = require('../contents/자막카드.js');
const { 스킬표 } = require('../contents/토픽퀴즈문항.js');
const 낭독 = require('../lib/라디오낭독.js');
const { 라디오통로인가 } = require('../lib/라디오태스크.js');
const { 제출사건 } = require('../lib/오늘과제.js');
const 학습자상태 = require('../lib/학습자상태.js');

const 상태 = typeof 학습자상태 === 'function' ? 학습자상태 : 학습자상태.학습자상태;

/* ─────────────── ① 팩 무결성 ─────────────── */

test('카드id 가 유일하다 — 겹치면 색인이 조용히 한 장을 삼킨다', () => {
  const ids = 팩.카드들.map((c) => c.카드id);
  assert.equal(new Set(ids).size, ids.length);
});

test('skill_ids 는 전부 스킬표에 있다 — 팩이 자기 태그를 지어내면 개념별 숙련도가 반으로 쪼개진다', () => {
  const 아는스킬 = new Set(스킬표.map((s) => s.skill_id));
  const 모르는 = 팩.카드들.flatMap((c) => c.skill_ids).filter((s) => !아는스킬.has(s));
  assert.deepEqual(모르는, [], `스킬표에 없는 태그: ${모르는.join(', ')}`);
});

test('모든 카드가 표현·상황·태그를 들고 있다 — 빈 칸은 낭독할 것이 없다는 뜻이다', () => {
  for (const c of 팩.카드들) {
    assert.ok(c.표현 && c.표현.trim().length >= 5, `표현이 비었다: ${c.카드id}`);
    assert.ok(c.상황 && c.상황.trim(), `상황이 비었다: ${c.카드id}`);
    assert.ok(c.skill_ids.length >= 1, `태그가 없다: ${c.카드id}`);
  }
});

test('🔴 몽골어를 지어내지 않았다 — 검수가 서기 전에 채우면 「검수된 것」과 바이트가 같아진다', () => {
  assert.equal(팩.몽골어검수확정, false, '검수가 실제로 섰다면 이 못과 함께 옮긴다');
  /* 키릴 문자가 팩 어디에도 없어야 한다 — 있으면 그것이 곧 지어낸 번역이다. */
  const 키릴 = /[Ѐ-ӿ]/;
  for (const c of 팩.카드들) {
    assert.ok(!키릴.test(JSON.stringify(c)), `몽골어가 섞였다: ${c.카드id}`);
  }
});

test('content_ref 조립은 한 자리다 — 참조로 되찾을 수 있어야 원장 행이 팩과 이어진다', () => {
  for (const c of 팩.카드들) {
    assert.equal(팩.참조로찾기(팩.카드참조(c.카드id)), c);
  }
  assert.equal(팩.참조로찾기('radio:card:없음'), null, '없는 참조는 null — 지어내지 않는다');
});

/* ─────────────── ② 선정 — 방송 우선 · 팩 회전 결정성 ─────────────── */

const 카드행 = (ref, from, to) => ({
  content_ref: ref, content_snapshot: { 표현: `${ref} 문안`, 판: '자막카드.v1' },
  shown_from: from, shown_to: to ?? null,
});

test('방송 카드가 있으면 그것이 이긴다 — 판은 승격기와 같은 이름이다', () => {
  const r = 낭독.오늘의낭독({
    기준시각: '2026-08-14T10:00:00Z',
    원장카드들: [카드행('radio:card:sc002', '2026-08-14T09:00:00Z', '2026-08-14T12:00:00Z')],
  });
  assert.equal(r.출처, '방송');
  assert.equal(r.판, 'radio-card.v1');
  assert.equal(r.task_meta.task_ref, 'radio:card:sc002');
  assert.equal(r.task_meta.task_snapshot.표현, 'radio:card:sc002 문안',
    '원장 스냅샷을 그대로 실어야 「그때 본 것」이 남는다 — 팩에서 다시 조립하면 불변이 깨진다');
});

test('표시 창이 겹치면 가장 최근에 뜬 카드 — 승격기 `카드찾기` 와 같은 규칙이어야 한다(반박 ⑤)', () => {
  const r = 낭독.오늘의낭독({
    기준시각: '2026-08-14T10:00:00Z',
    원장카드들: [
      카드행('radio:card:sc001', '2026-08-14T08:00:00Z', '2026-08-14T12:00:00Z'),
      카드행('radio:card:sc009', '2026-08-14T09:30:00Z', '2026-08-14T12:00:00Z'),
    ],
  });
  assert.equal(r.task_meta.task_ref, 'radio:card:sc009');
});

test('동률 shown_from 은 content_ref 로 끊는다 — 입력 순서에 기대면 답이 날마다 갈린다', () => {
  const 셋 = [
    카드행('radio:card:sc003', '2026-08-14T09:00:00Z', null),
    카드행('radio:card:sc007', '2026-08-14T09:00:00Z', null),
  ];
  const a = 낭독.오늘의낭독({ 기준시각: '2026-08-14T10:00:00Z', 원장카드들: 셋 });
  const b = 낭독.오늘의낭독({ 기준시각: '2026-08-14T10:00:00Z', 원장카드들: [...셋].reverse() });
  assert.equal(a.task_meta.task_ref, b.task_meta.task_ref, '순서를 뒤집어도 같은 카드여야 한다');
});

test('창이 닫힌 카드는 안 고른다 — 지금 화면에 없는 것을 「오늘의 표현」이라 하지 않는다', () => {
  const r = 낭독.오늘의낭독({
    기준시각: '2026-08-14T13:00:00Z',
    원장카드들: [카드행('radio:card:sc002', '2026-08-14T09:00:00Z', '2026-08-14T12:00:00Z')],
  });
  assert.equal(r.출처, '팩', '방송 카드가 유효하지 않으면 팩으로 내려간다');
  assert.equal(r.판, 'radio-pack.v1');
});

test('🔴 팩 회전은 방송 유래와 판이 다르다 — 안 가르면 송출 전에 읽은 것이 「방송에서 봤다」가 된다', () => {
  const r = 낭독.오늘의낭독({ 기준시각: '2026-08-14T10:00:00Z' });
  assert.equal(r.출처, '팩');
  assert.equal(r.판, 'radio-pack.v1');
  assert.notEqual(r.판, 낭독.방송판);
});

test('같은 날은 같은 카드다 — 다시 열 때마다 바뀌면 「오늘의 표현」이 아니다', () => {
  const a = 낭독.오늘의낭독({ 기준시각: '2026-08-14T01:00:00Z' });
  const b = 낭독.오늘의낭독({ 기준시각: '2026-08-14T13:00:00Z' });
  assert.equal(a.content_ref, b.content_ref);
});

test('날짜가 다르면 카드도 돈다 — 한 장에 고정되면 회전이 죽은 것이다', () => {
  const 뽑힌 = new Set();
  for (let d = 1; d <= 20; d += 1) {
    const 날 = `2026-09-${String(d).padStart(2, '0')}T06:00:00Z`;
    뽑힌.add(낭독.오늘의낭독({ 기준시각: 날 }).content_ref);
  }
  assert.ok(뽑힌.size >= 10, `20일에 ${뽑힌.size}종 — 회전이 뭉쳤다`);
});

test('🔴 팩 «파일 순서»가 바뀌어도 그날 카드는 같다 — 정렬 없이 뽑으면 카드를 한 장 끼운 날 그 뒤 전부가 밀린다', () => {
  /* 팩이 이미 id 순이라 이 성질은 **섞은 입력으로만** 잴 수 있다 — 안 그러면 정렬을 지워도
   * 초록인 시험이 된다(「뒤집어도 우연히 같은 것이 걸린다」). */
  const 섞음 = [...팩.카드들].reverse();
  for (const d of ['2026-08-14', '2026-09-01', '2026-12-31']) {
    assert.equal(낭독.팩카드(d, 섞음).카드id, 낭독.팩카드(d).카드id, `${d} 에서 갈렸다`);
  }
});

test('기준시각을 안 주면 던진다 — 안에서 시계를 읽으면 회귀가 돌린 «날»에 따라 답이 갈린다', () => {
  assert.throws(() => 낭독.오늘의낭독({}), /기준시각/);
  assert.throws(() => 낭독.오늘의낭독({ 기준시각: '언제' }), /기준시각/);
});

/* ─────────────── ③ 봉투 왕복 — task_meta 가 실제로 제출사건을 지나는가 ─────────────── */

const 항목 = (재료, 덧 = {}) => ({
  id: 'i1', step: 낭독.낭독걸음, status: 'sent', attempt: 1,
  correlation_id: 'c-1', idempotency_key: 'k-1',
  created_at: '2026-08-14T10:05:00Z', task_meta: 재료, text: null, ...덧,
});

test('🔴 낭독 항목이 봉투가 된다 — 걸음 가드가 좁으면 녹음은 되고 «서버엔 안 남는다»', () => {
  const r = 낭독.오늘의낭독({ 기준시각: '2026-08-14T10:00:00Z' });
  const 사건 = 제출사건(항목(r.task_meta), 'voice/x/y.m4a');
  assert.ok(사건, '봉투가 null 이면 그 발화는 조용히 사라진다');
  assert.equal(사건.event_type, 'submission.created');
  assert.equal(사건.task_type, '발화녹음', '설계 ⓖ — 앱 어휘 그대로(계약 개정 0)');
  assert.equal(사건.submission.task_format, '낭독');
  assert.equal(사건.submission.task_ref, r.content_ref);
  assert.equal(사건.submission.audio_ref, 'voice/x/y.m4a');
});

test('🔴 판이 봉투에 실린다 — 행에 없는 사실은 소급이 안 된다', () => {
  const r = 낭독.오늘의낭독({ 기준시각: '2026-08-14T10:00:00Z' });
  const 사건 = 제출사건(항목(r.task_meta), null);
  assert.equal(사건.submission.task_schema_ver, 'radio-pack.v1');
});

test('🔴 이탈 봉투에도 판이 실린다 — 한쪽만 표식하면 완주율이 «편향»된다', () => {
  const r = 낭독.오늘의낭독({ 기준시각: '2026-08-14T10:00:00Z' });
  const 사건 = 제출사건(항목(r.task_meta, { status: 'abandoned' }), null);
  assert.equal(사건.event_type, 'session.abandoned');
  assert.equal(사건.submission.task_schema_ver, 'radio-pack.v1');
});

test('모르는 걸음은 여전히 막힌다 — 가드를 넓혔지 열어 둔 것이 아니다', () => {
  const r = 낭독.오늘의낭독({ 기준시각: '2026-08-14T10:00:00Z' });
  assert.equal(제출사건(항목(r.task_meta, { step: '없는걸음' }), null), null);
});

test('숙제 배정은 판을 안 싣는다 — 없던 칸을 새로 박지 않는다(빈 문자열도 값이 된다)', () => {
  const 숙제재료 = { task_ref: 'hw-1', task_snapshot: { 호흡: [] }, 형식: { 따라: '낭독' } };
  const 사건 = 제출사건(항목(숙제재료, { step: '따라' }), null);
  assert.ok(사건);
  assert.ok(!('task_schema_ver' in 사건.submission));
});

/* ─────────────── ④ 역오염 — 이 트랙의 진짜 급소 ─────────────── */

const 행 = (t, 때, 덧 = {}) => ({ event_id: `e-${때}`, event_type: t, occurred_at: 때, ...덧 });
const 낭독행 = (t, 때) => 행(t, 때, { task_type: '발화녹음', task_schema_ver: 'radio-pack.v1' });

test('🔴 낭독 제출이 숙제 제출률을 «올리지 않는다» — 안 낸 날이 낸 날로 뒤집히던 자리', () => {
  const 사건들 = [
    행('task.assigned', '2026-08-13T00:00:00Z', { due_at: '2026-08-14T00:00:00Z' }),
    행('task.assigned', '2026-08-14T00:00:00Z', { due_at: '2026-08-15T00:00:00Z' }),
    낭독행('submission.created', '2026-08-13T10:00:00Z'), // 숙제는 안 냈고 낭독만 했다
  ];
  const { 축 } = 상태(사건들, { as_of: '2026-08-14T23:00:00Z' });
  assert.equal(축.리듬.제출률, 0, '낭독은 배정과 짝지을 수 없다 — 세면 그날 숙제를 낸 것이 된다');
});

test('앱 숙제 제출은 그대로 센다 — 필터가 넓어져 앱 행까지 삼키면 축이 통째로 죽는다', () => {
  const 사건들 = [
    행('task.assigned', '2026-08-13T00:00:00Z', { due_at: '2026-08-14T00:00:00Z' }),
    행('submission.created', '2026-08-13T10:00:00Z', { task_type: '발화녹음' }),
  ];
  const { 축 } = 상태(사건들, { as_of: '2026-08-14T23:00:00Z' });
  assert.equal(축.리듬.제출률, 1);
});

test('🔴 이탈도 대칭으로 빠진다 — 제출만 빼면 완주율이 «조용히 낮아진다»', () => {
  const 사건들 = [
    행('submission.created', '2026-08-13T10:00:00Z', { task_type: '발화녹음' }),
    낭독행('session.abandoned', '2026-08-13T11:00:00Z'), // 라디오 낭독을 하다 그만둠
  ];
  const { 축 } = 상태(사건들, { as_of: '2026-08-14T23:00:00Z' });
  assert.equal(축.끈기.완주율, 1, '라디오 이탈이 분모에 남으면 0.5 가 된다 — 그것이 편향이다');
  assert.equal(축.끈기.n, 1);
});

test('판별은 두 축을 다 본다 — 통로 어휘(승격 행)와 판(앱이 낸 라디오 행)', () => {
  assert.equal(라디오통로인가({ task_type: '목표선언' }), true);
  assert.equal(라디오통로인가({ task_type: '발화녹음', task_schema_ver: 'radio-card.v1' }), true);
  assert.equal(라디오통로인가({ task_type: '발화녹음', task_schema_ver: 'radio-pack.v1' }), true);
});

/* ─────────────── ⑤ 화면 배선 — 소스로만 잴 수 있는 자리 ───────────────
 * JSX 는 이 스위트가 실행할 수 없다(번들러 몫). 그래서 «빠지면 조용히 틀리는» 두 줄만 글자로
 * 못박는다 — 값으로 잴 수 있는 것은 위에서 이미 값으로 쟀다. */
const fs = require('node:fs');
const 화면 = fs.readFileSync(require('node:path').join(__dirname, '..', 'src', '말하기화면.js'), 'utf8');
const 낭독블록 = 화면.slice(화면.indexOf('step={낭독걸음}'), 화면.indexOf('step={낭독걸음}') + 900);

test('🔴 낭독 카드가 task_meta 를 «명시로» 넘긴다 — 빠지면 그 발화가 숙제 제출로 저장된다', () => {
  assert.ok(화면.includes('step={낭독걸음}'), '낭독 카드가 화면에서 사라졌다');
  assert.ok(/기록추가=\{\(항목\) => 기록추가\(\{ \.\.\.항목, task_meta: 낭독\.task_meta \}\)\}/.test(낭독블록),
    '기본값(그날 숙제 재료)이 채워지면 오류 없이 형식만 틀린다 — 값으로는 못 잡는 자리다');
});

test('🚫 낭독 층에 마스코트를 안 얹었다 — 유호 지시 08-14(마스코트는 다른 세션이 정하는 중)', () => {
  assert.ok(!/마스코트/.test(낭독블록), '낭독 카드 블록에 마스코트가 들어왔다');
});

test('🔴 칸이 없는 옛 행은 «앱 행»이다 — 빈 칸을 라디오로 읽으면 옛 제출이 통째로 사라진다', () => {
  assert.equal(라디오통로인가({ task_type: '발화녹음' }), false);
  assert.equal(라디오통로인가({}), false);
  assert.equal(라디오통로인가(null), false);
  assert.equal(라디오통로인가({ task_type: '발화녹음', task_schema_ver: '오늘과제.v3' }), false);
});
