/* 학습자 상태 회귀 — 사슬 ⑦칸(엔진이 배운다)의 첫 소비자가 계약대로 도는지 못박는다.
 *
 * 세 맹점(CLAUDE.md):
 *   ① 사람이 실제로 쓰는 표기 — `learner_response` 는 계약 값목록(채택·무시·수정) 그대로 쓴다.
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 아래 픽스처가 지고, 실저장소에는
 *      「계약에 없는 값을 지어내지 않았는가」 하나만 건다.
 *   ③ 자기 처방 — 이 모듈이 낸 `evidence_refs` 를 **되먹여** 같은 값이 나오는지 본다
 *      (근거 밖 사건을 몰래 쓰고 있으면 여기서 갈린다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const { 학습자상태, 추정판, 창일수, 근거상한, 완충, 쓰는사건 } = require('../lib/학습자상태.js');
/* ⑤축의 입력은 **실제 생산자가 내는 모양**이어야 한다 — 손으로 지은 payload 로만 재면
   조립기가 칸 이름을 바꾼 날 이 축은 조용히 0 이 되고 검사는 초록이다. */
const { 차원들, 보기세우기, 선택payload } = require('../lib/선택로그.js');

const 기준 = '2026-08-09T12:00:00Z';
const 일 = 24 * 60 * 60 * 1000;
const 전 = (시각, 밀리) => new Date(Date.parse(시각) - 밀리).toISOString();

let 번호 = 0;
const 사건 = (event_type, occurred_at, 더 = {}) =>
  ({ event_id: `E${(번호 += 1)}`, event_type, occurred_at, ...더 });

/** 배정 1건 + 그 뒤 제출 1건. 마감은 배정 다음날 00:00 을 흉내낸다(c10 `due.v1`). */
function 하루(날_전, { 제출후 = 60 * 60 * 1000, 냈나 = true } = {}) {
  const 배정때 = 전(기준, 날_전 * 일);
  const 행 = [사건('task.assigned', 배정때, { due_at: 전(기준, 날_전 * 일 - 12 * 60 * 60 * 1000) })];
  if (냈나) 행.push(사건('submission.created', 전(기준, 날_전 * 일 - 제출후)));
  return 행;
}

/* ── ① 시점 절단 — 이 모듈의 P0 ────────────────────────────────
 * 🔴 나중에 「그 개입이 효과 있었나」를 평가할 때 상태가 개입 «이후» 성과까지 섞고 있으면
 *   그 평가는 통째로 거짓이 된다. 기본값을 주면 호출부가 빠뜨려도 아무 데서도 안 빨개진다. */
test('as_of 가 없으면 던진다 — 시점 절단은 기본값으로 대신하지 않는다', () => {
  assert.throws(() => 학습자상태([], {}), /as_of/);
  assert.throws(() => 학습자상태([], { as_of: '말도 안 되는 값' }), /as_of/);
});

test('as_of «이후» 사건은 안 센다 — 같은 배열이라도 기준이 다르면 값이 다르다', () => {
  const 행 = [...하루(2), ...하루(1)];
  const 나중 = 학습자상태(행, { as_of: 기준 });
  const 이전 = 학습자상태(행, { as_of: 전(기준, 1.5 * 일) });   // 어제 배정 전으로 되감는다
  assert.equal(나중.축.리듬.n, 2);
  assert.equal(이전.축.리듬.n, 1, '미래 배정이 과거 시점 상태에 섞였다 — 미래정보 누출');
  assert.ok(이전.evidence_refs.사건.length < 나중.evidence_refs.사건.length);
});

test('창 밖(기본 30일)은 안 센다 — 창 길이는 evidence_refs 에 남는다', () => {
  const 행 = [...하루(2), ...하루(창일수 + 5)];
  const r = 학습자상태(행, { as_of: 기준 });
  assert.equal(r.축.리듬.n, 1);
  assert.equal(r.evidence_refs.창일수, 창일수);
  assert.equal(학습자상태(행, { as_of: 기준, 창: 창일수 + 10 }).축.리듬.n, 2);
});

/* ── ② 재료가 없으면 축이 없다 ────────────────────────────────
 * 🔴 없는 축을 0 으로 채우면 「재료가 없다」가 「점수가 낮다」로 읽히고, 그 오독이 학생에게 간다. */
test('재료 0 이면 축은 null 이고 신뢰도는 0 — 0 점이 아니다', () => {
  const r = 학습자상태([], { as_of: 기준 });
  assert.equal(r.축.리듬, null);
  assert.equal(r.축.끈기, null);
  assert.equal(r.축.피드백수용, null);
  assert.equal(r.estimator_confidence, 0);
  assert.deepEqual(r.evidence_refs.사건, []);
});

test('분모가 0 인 비율은 null 이다 — 0/0 을 0 으로 접지 않는다', () => {
  // 열람만 있고 응답이 없다: 응답률은 0(진짜 0 건이다) · 채택률은 **분모가 없어** null 이다.
  const r = 학습자상태([사건('correction.viewed', 전(기준, 일), { correction_id: 'c1' })], { as_of: 기준 });
  assert.equal(r.축.피드백수용.응답률, 0);
  assert.equal(r.축.피드백수용.채택률, null, '답한 적이 없는데 채택률 0% 로 적으면 거짓이다');
});

/* ── ③ 리듬 ─────────────────────────────────────────────────── */
test('리듬 — 제출률과 마감 대비 여유(분)를 낸다', () => {
  const 행 = [...하루(3), ...하루(2, { 냈나: false }), ...하루(1)];
  const { 리듬 } = 학습자상태(행, { as_of: 기준 }).축;
  assert.equal(리듬.n, 3);
  assert.equal(리듬.제출률, 0.67);
  // 배정 +1h 에 냈고 마감은 배정 +12h → 11시간 = 660분 남기고 냈다.
  assert.equal(리듬.마감여유분_중앙, 660);
  assert.equal(리듬.지각, 0);
});

test('리듬 — 마감을 넘긴 제출은 음수로 남는다(버리지 않는다)', () => {
  // 마감(+12h) 뒤인 +20h 에 냈다 → 여유 -480분.
  const 행 = 하루(2, { 제출후: 2 * 일 - 20 * 60 * 60 * 1000 - 0 });
  const { 리듬 } = 학습자상태(행, { as_of: 기준 }).축;
  assert.equal(리듬.지각, 1, '늦게라도 낸 것과 안 낸 것은 다른 신호다');
  assert.ok(리듬.마감여유분_중앙 < 0);
});

test('리듬 — 다음 배정 «뒤»의 제출은 앞 배정의 것으로 안 센다', () => {
  const 행 = [
    사건('task.assigned', 전(기준, 3 * 일), { due_at: 전(기준, 2.5 * 일) }),
    사건('task.assigned', 전(기준, 2 * 일), { due_at: 전(기준, 1.5 * 일) }),
    사건('submission.created', 전(기준, 1.9 * 일)),   // 둘째 배정 뒤 — 첫 배정 것이 아니다
  ];
  const { 리듬 } = 학습자상태(행, { as_of: 기준 }).축;
  assert.equal(리듬.제출률, 0.5, '구간을 안 가르면 한 제출이 두 배정을 채운 것처럼 보인다');
});

test('리듬 — 마감 없는 배정(c10 이전)은 여유에서만 빠지고 제출률에는 센다', () => {
  const 행 = [사건('task.assigned', 전(기준, 2 * 일)), 사건('submission.created', 전(기준, 1.9 * 일))];
  const { 리듬 } = 학습자상태(행, { as_of: 기준 }).축;
  assert.equal(리듬.제출률, 1);
  assert.equal(리듬.여유n, 0);
  assert.equal(리듬.마감여유분_중앙, null);
});

/* ── ④ 끈기 ─────────────────────────────────────────────────── */
test('끈기 — 완주율의 분모는 시도(제출+이탈)고 재시도를 따로 센다', () => {
  const 행 = [
    사건('submission.created', 전(기준, 3 * 일)),
    사건('submission.created', 전(기준, 2 * 일), { retry_of_event_id: 'E-앞' }),
    사건('session.abandoned', 전(기준, 1 * 일)),
  ];
  const { 끈기 } = 학습자상태(행, { as_of: 기준 }).축;
  assert.equal(끈기.n, 3);
  assert.equal(끈기.완주율, 0.67);
  assert.equal(끈기.이탈, 1);
  assert.equal(끈기.재시도, 1, 'retry_of_event_id 가 유일한 「교정 받고 다시 냈다」 신호다');
});

/* ── ⑤ 피드백 수용 ──────────────────────────────────────────── */
test('피드백 수용 — 교정 단위로 잇는다(응답률이 1 을 넘지 않는다)', () => {
  const 행 = [
    사건('correction.viewed', 전(기준, 3 * 일), { correction_id: 'c1' }),
    사건('correction.responded', 전(기준, 3 * 일 - 60000), { correction_id: 'c1', payload: { learner_response: '채택' } }),
    사건('correction.viewed', 전(기준, 2 * 일), { correction_id: 'c2' }),
  ];
  const { 피드백수용 } = 학습자상태(행, { as_of: 기준 }).축;
  assert.equal(피드백수용.n, 2, '사건 수로 세면 같은 교정이 둘로 세어진다');
  assert.equal(피드백수용.응답률, 0.5);
  assert.equal(피드백수용.채택률, 1);
  assert.deepEqual(피드백수용.분포, { 채택: 1 });
});

/* 🔑 위 검사만으로는 「사건 수로 세기」가 안 잡힌다(변이로 실측 — 그 배치에선 두 방식의 값이
 *   우연히 같다). 갈리는 모양은 **열람 없이 답한 교정**이다: 앱은 답하면서 열람을 따로 안 보낼
 *   수 있고, 그때 사건 수 방식은 분모가 작아져 비율이 1 을 넘는다. */
test('피드백 수용 — 열람 사건이 없는 응답도 교정 하나로 센다(응답률 > 1 이 안 나온다)', () => {
  const 행 = [
    사건('correction.viewed', 전(기준, 3 * 일), { correction_id: 'c1' }),
    사건('correction.responded', 전(기준, 3 * 일 - 1000), { correction_id: 'c1', payload: { learner_response: '채택' } }),
    사건('correction.responded', 전(기준, 2 * 일), { correction_id: 'c2', payload: { learner_response: '수정' } }),
  ];
  const { 피드백수용 } = 학습자상태(행, { as_of: 기준 }).축;
  assert.equal(피드백수용.n, 2);
  assert.equal(피드백수용.응답률, 1, '분모가 열람 사건 수면 여기서 2 가 나온다 — 비율이 아니다');
});

/* 🔴 값목록 판정은 **입구**(`lib/이벤트검증.js` c8)의 일이다. 여기서 다시 거르면 같은 판정이
 *   두 곳에 살고, 계약이 값을 늘린 날 갈라진 쪽이 조용히 통과한다(F272 와 같은 축). */
test('모르는 응답값도 분포에 그대로 남는다 — 여기서 값목록을 다시 판정하지 않는다', () => {
  const 행 = [
    사건('correction.viewed', 전(기준, 2 * 일), { correction_id: 'c1' }),
    사건('correction.responded', 전(기준, 2 * 일 - 1000), { correction_id: 'c1', payload: { learner_response: '새값' } }),
  ];
  const { 피드백수용 } = 학습자상태(행, { as_of: 기준 }).축;
  assert.equal(피드백수용.응답률, 1);
  assert.equal(피드백수용.채택률, 0, '수용값이 아니니 채택률엔 안 들어간다');
  assert.deepEqual(피드백수용.분포, { 새값: 1 }, '버리면 축이 왜 0 인지 아무도 못 본다');
});

test('피드백 수용 — 같은 교정에 두 번 답하면 마지막 답이 그 학생의 답이다', () => {
  const 행 = [
    사건('correction.responded', 전(기준, 3 * 일), { correction_id: 'c1', payload: { learner_response: '무시' } }),
    사건('correction.responded', 전(기준, 2 * 일), { correction_id: 'c1', payload: { learner_response: '채택' } }),
  ];
  const { 피드백수용 } = 학습자상태(행, { as_of: 기준 }).축;
  assert.deepEqual(피드백수용.분포, { 채택: 1 });
});

test('피드백 수용 — correction_id 없는 행은 셈에서 뺀다(c8 위반 행)', () => {
  const r = 학습자상태([사건('correction.viewed', 전(기준, 일))], { as_of: 기준 });
  assert.equal(r.축.피드백수용, null);
});

/* ── ⑥ 재현 — 이 모듈의 존재 이유 ──────────────────────────────
 * 상태를 저장하지 «않는» 설계는 「언제든 다시 계산된다」에 전부를 건다. 그 약속이 참이려면
 * ①같은 입력이면 같은 값이고 ②`evidence_refs` 에 적은 근거«만»으로 그 값이 나와야 한다.
 * ②가 깨지면 행에 남은 근거로는 재계산이 안 되고, 그때 옛 값은 검증 불가능한 숫자가 된다. */
test('결정론 — 같은 입력·같은 as_of 면 같은 값이다', () => {
  const 행 = [...하루(3), ...하루(2), 사건('session.abandoned', 전(기준, 일))];
  assert.deepEqual(학습자상태(행, { as_of: 기준 }), 학습자상태([...행].reverse(), { as_of: 기준 }),
    '입력 순서가 값을 바꾸면 두 배치가 같은 학생에게 다른 상태를 준다');
});

test('자기 처방 — evidence_refs 의 사건«만» 되먹여도 같은 값이 나온다', () => {
  const 행 = [
    ...하루(4), ...하루(3), ...하루(2, { 냈나: false }),
    사건('session.abandoned', 전(기준, 1.5 * 일)),
    사건('correction.viewed', 전(기준, 일), { correction_id: 'c1' }),
    사건('correction.responded', 전(기준, 일 - 1000), { correction_id: 'c1', payload: { learner_response: '수정' } }),
    사건('content.viewed', 전(기준, 일), { parent_event_id: 'E-x' }),   // 이 축이 안 쓰는 사건
  ];
  const 처음 = 학습자상태(행, { as_of: 기준 });
  const 근거만 = 행.filter((e) => 처음.evidence_refs.사건.includes(e.event_id));
  assert.deepEqual(학습자상태(근거만, { as_of: 기준 }), 처음,
    '근거 밖 사건이 값에 섞여 있다 — 행에 남은 것만으로는 재계산이 안 된다');
});

/* ── ⑦ 스탬프 규격 ─────────────────────────────────────────── */
test('판 이름은 코드가 명시적으로 적는다 — 뷰 지문이 자동으로 찍히지 않는다', () => {
  const r = 학습자상태(하루(1), { as_of: 기준 });
  assert.equal(r.estimator_version, 추정판);
  assert.match(추정판, /^학습자상태\.v\d+$/);
  assert.equal(r.evidence_refs.as_of, new Date(기준).toISOString());
});

test('신뢰도는 표본 충분도다 — 표본이 늘면 오르고 1 을 안 넘는다', () => {
  const 적게 = 학습자상태(하루(1), { as_of: 기준 }).estimator_confidence;
  const 많이 = 학습자상태([...하루(5), ...하루(4), ...하루(3), ...하루(2), ...하루(1)], { as_of: 기준 })
    .estimator_confidence;
  assert.ok(많이 > 적게 && 많이 < 1, `표본 충분도가 안 오른다: ${적게} → ${많이}`);
  // 식이 바뀌면 판을 올려야 한다 — 상수만 조용히 고치면 옛 행과 새 행이 같은 이름표로 섞인다.
  assert.equal(적게, Math.round((2 / (2 + 완충)) * 100) / 100);
});

test('근거가 상한을 넘으면 «잘랐다»를 같이 적는다', () => {
  const 많은행 = [];
  for (let i = 0; i < 근거상한 + 20; i += 1) 많은행.push(사건('session.abandoned', 전(기준, 일 + i * 1000)));
  const r = 학습자상태(많은행, { as_of: 기준 });
  assert.equal(r.evidence_refs.사건.length, 근거상한);
  assert.equal(r.evidence_refs.잘림, 근거상한 + 20, '조용히 자르면 재계산이 안 맞는 이유를 못 찾는다');
});

/* ── ⑦-b 배선 — 소비자가 «실제로 부르는가» ────────────────────
 * 🔴 설계 §5: **도달의 정의는 「읽힌 것」이지 보이는 것이 아니다.** 이 모듈이 있어도 부르는
 *   곳이 없으면 ⑦칸은 여전히 0 이고, 그 상태는 값이 아니라 «부재»라 아무 값도 안 틀린다 —
 *   즉 위 20 개 검사가 전부 초록인 채로 배선만 빠질 수 있다. 그 자리를 여기서 막는다.
 * ⚠ SQL 자체는 DB 가 있어야 재고 그건 왕복시험 몫이다. 여기서 재는 것은 **배선의 실재**다. */
const 배달본체 = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'deliver', 'index.ts'), 'utf8');

test('배선 — deliver 가 상태를 계산해 개입 행에 스탬프한다', () => {
  assert.match(배달본체, /학습자상태\s*\(/, 'deliver 가 상태를 계산하지 않는다 — ⑦칸은 여전히 소비자 0 이다');
  /* 🔴 파일 어딘가에 이름이 있는지 보면 **안 된다**(변이로 실측): 주석과 타입 선언에도 같은
   *   낱말이 있어서 INSERT 열 목록에서 통째로 빠져도 초록이었다. 첫 INSERT = 개입 행이다. */
  const 열목록 = 배달본체.match(/insert into engine\.learning_events \(([\s\S]*?)\) values/);
  assert.ok(열목록, '개입 INSERT 를 못 찾았다 — 질의 모양이 바뀌었으면 이 검사도 같이 옮긴다');
  for (const 열 of ['estimator_version', 'estimator_confidence', 'evidence_refs']) {
    assert.ok(열목록[1].includes(열), `개입 INSERT 열 목록에 ${열} 이 없다 — 셋이 함께 있어야 재계산 대조가 된다`);
    assert.ok(new RegExp(`상태[?.]*\\.?${열}|상태 \\?`).test(배달본체), `${열} 에 넣을 값이 안 묶였다`);
  }
});

test('배선 — 동봉 표에 있다(없으면 배포는 성공하고 함수가 import 에서 죽는다)', () => {
  const 표 = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'deliver', '동봉.json'), 'utf8'));
  assert.equal(표['학습자상태.mjs'], 'lib/학습자상태.js');
});

test('배선 — 사건 목록·창을 deliver 가 다시 적지 않았다(lib 에서 파생시킨다)', () => {
  const { 쓰는사건 } = require('../lib/학습자상태.js');
  // deliver 가 자기 일로 쓰는 둘(task.assigned·submission.created)을 뺀 나머지는 나올 이유가 없다.
  const 베낀것 = 쓰는사건.filter((t) => !['task.assigned', 'submission.created'].includes(t))
    .filter((t) => 배달본체.includes(`'${t}'`));
  assert.deepEqual(베낀것, [], `질의가 사건 목록을 베꼈다(${베낀것}) — 축을 늘린 날 조용히 갈라진다`);
  assert.ok(배달본체.includes('창일수'), '창을 숫자로 박았다 — lib 과 갈라지면 축이 조용히 죽는다');
});

/* ── ⑧ 실저장소 대조 — 「베끼지 않았는가」 하나만 ────────────────
 * 🔑 탐지력은 위 픽스처가 지고 여기서는 거짓양성만 본다(맹점 ②). 검사 대상은 **값이 맞는가**가
 *   아니라 **목록을 통째로 옮겨 적었는가**다 — 베낀 목록은 계약이 값을 늘린 날 조용히 갈라진다. */
test('계약 값목록을 코드에 베끼지 않았다 — 지목 한 값까지만', () => {
  const 계약값 = 계약.learning_events.값목록.learner_response;
  assert.ok(계약값.length >= 3, '계약 값목록을 못 읽었다 — 경로가 바뀌었으면 이 검사도 같이 옮긴다');
  const 소스 = fs.readFileSync(path.join(ROOT, 'lib', '학습자상태.js'), 'utf8');
  const 코드에있는값 = 계약값.filter((v) => 소스.includes(`'${v}'`));
  assert.ok(코드에있는값.length <= 1,
    `값목록을 옮겨 적었다(${코드에있는값.join(',')}) — 정본은 계약 JSON 하나고, 판정은 입구가 진다`);
});

/* ── ⑤ 관심·목표 (2026-08-10 · S1-5 선택 화면이 서면서 열린 축) ───────────────────
 *
 * 🔑 입력을 **조립기로 만든다**(`선택payload`). 손으로 지은 객체로만 재면 조립기가 칸 이름을
 *   바꾼 날 이 축은 조용히 0 이 되는데 검사는 초록이다 — 그게 이 파일 머리말 맹점 ①이다. */
const 보기둘 = [{ option_id: 'a', label: 'ㄱ' }, { option_id: 'b', label: 'ㄴ' }];
/** 섞기를 항등으로 고정한다 — 무작위를 그대로 쓰면 `position` 기대값이 회차마다 갈린다. */
const 항등 = (n) => Array.from({ length: n }, (_, i) => i);
const 고름사건 = (id, 때, 재료) => ({
  event_id: id,
  event_type: 'choice.selected',
  occurred_at: 때,
  /* 차원은 기본 하나로 고정한다 — 재료가 주면 그쪽이 이긴다(차원별 분리를 재는 시험이 쓴다). */
  payload: 선택payload({ 차원: 차원들.도입평일, 보기: 보기세우기(보기둘, 재료.추천 ?? null, 항등), ...재료 }),
});

test('⑤ 재료가 0이면 축은 null 이다 — 없는 축을 0 으로 채우지 않는다', () => {
  const r = 학습자상태([], { as_of: 기준 });
  assert.equal(r.축.관심, null,
    '고름이 한 건도 없는데 값이 났다 — 「재료가 없다」가 「점수가 낮다」로 읽히고 그 오독은 학생에게 간다');
});

test('⑤ 무엇을 골랐나가 **분포로** 남는다 — 이 축의 본체는 점수가 아니다', () => {
  const r = 학습자상태([
    고름사건('c1', '2026-08-08T01:00:00Z', { 고른것: 'a' }),
    고름사건('c2', '2026-08-08T02:00:00Z', { 고른것: 'a' }),
    고름사건('c3', '2026-08-08T03:00:00Z', { 고른것: 'b' }),
  ], { as_of: 기준 });
  assert.deepEqual(r.축.관심.고른것, { a: 2, b: 1 }, '고른 것의 분포가 안 남았다 — 2년차 추천이 쓸 재료가 이것뿐이다');
  assert.equal(r.축.관심.n, 3);
  /* `position` 은 **1부터** 센다(L0 §140). 0 부터 세면 전 행이 한 칸씩 밀리고 그 오독은
   * 어디서도 안 빨개진다 — 1단계 회귀가 실계약을 먹여 잡은 바로 그 자리다. */
  assert.deepEqual(r.축.관심.자리별, { 1: 2, 2: 1 }, '자리 분포가 어긋났다 — position 을 0부터 셌는지 본다');
});

test('🔴 ⑤ 안 밀었으면 추천따름률은 null 이다 — 분모 0 을 0% 로 접지 않는다', () => {
  const r = 학습자상태([고름사건('c1', '2026-08-08T01:00:00Z', { 고른것: 'a' })], { as_of: 기준 });
  assert.equal(r.축.관심.추천따름률, null,
    '아무것도 안 밀었는데 「추천을 0% 따랐다」가 됐다 — 「밀었는데 안 따랐다」와 정반대 뜻이다');
});

test('🔴 ⑤ 밀어준 것을 따랐나가 갈린다 — 이 축의 급소', () => {
  const r = 학습자상태([
    고름사건('c1', '2026-08-08T01:00:00Z', { 고른것: 'a', 추천: 'a' }),  // 따름
    고름사건('c2', '2026-08-08T02:00:00Z', { 고른것: 'b', 추천: 'a' }),  // 안 따름
    고름사건('c3', '2026-08-08T03:00:00Z', { 고른것: 'b' }),             // 안 밂 — 분모 밖
  ], { as_of: 기준 });
  assert.equal(r.축.관심.추천따름률, 0.5,
    '「좋아서 골랐다」와 「우리가 밀어서 골랐다」가 안 갈린다 — 그러려고 계약이 recommended_option 을 필수로 걸었다');
});

test('⑤ 망설임은 중앙값이고, 못 잰 것은 분모 밖이다', () => {
  const r = 학습자상태([
    고름사건('c1', '2026-08-08T01:00:00Z', { 고른것: 'a', 시작: 0, 끝: 1000 }),
    고름사건('c2', '2026-08-08T02:00:00Z', { 고른것: 'b', 시작: 0, 끝: 3000 }),
    고름사건('c3', '2026-08-08T03:00:00Z', { 고른것: 'a' }),               // latency null = 안 쟀다
  ], { as_of: 기준 });
  assert.equal(r.축.관심.망설임_중앙, 2000, '안 잰 것을 0 으로 세어 분포가 왼쪽으로 쏠렸다');
  assert.equal(r.축.관심.바꿈률, 0, '마음을 바꾼 적이 없는데 값이 났다');
});

test('⑤ 마음을 바꾼 것은 **여부**로 센다 — 횟수를 담을 칸이 계약에 없다', () => {
  const r = 학습자상태([
    고름사건('c1', '2026-08-08T01:00:00Z', { 고른것: 'a', 바꾼횟수: 3 }),
    고름사건('c2', '2026-08-08T02:00:00Z', { 고른것: 'b' }),
  ], { as_of: 기준 });
  assert.equal(r.축.관심.바꿈률, 0.5);
});

/* ⚠ 오늘 이 값은 **원리상 0**이다 — 계약이 `payload.position` 을 무조건 필수로 걸어
 *   `skipped`·`rejected_all` 행은 검증을 못 지나 도착 자체를 못 한다(대기열 P1 의 계약 판정).
 *   그래도 칸을 재는 이유는 분모를 정직하게 두기 위해서다: 계약이 열리는 날 **코드 변경 없이**
 *   값이 차야 하고, 그러지 않으면 「무관심」과 「뚜렷한 거절」은 영영 안 갈린다.
 * 🚫 「지금은 거부된다」를 회귀로 못박지 않는다(버그가 있을 것을 요구하는 회귀 · 고쳐지는 날
 *   애먼 데가 빨개진다) — 여기서 재는 것은 **축이 그 행을 받을 수 있는가** 하나다. */
test('⑤ 안 고른 행이 오면 분모에 선다 — 계약이 열리는 날 코드 변경 없이 값이 찬다', () => {
  const r = 학습자상태([
    { event_id: 'c1', event_type: 'choice.selected', occurred_at: '2026-08-08T01:00:00Z',
      payload: { options_shown: 보기둘, position: null, selected_option: null, skipped: true, rejected_all: false } },
    고름사건('c2', '2026-08-08T02:00:00Z', { 고른것: 'a' }),
  ], { as_of: 기준 });
  assert.equal(r.축.관심.안고름, 1, '안 고른 행을 세지 않았다 — 그 행이 오는 날 조용히 사라진다');
  assert.deepEqual(r.축.관심.고른것, { a: 1 }, '안 고른 것을 무언가 고른 것으로 셌다');
  assert.deepEqual(r.축.관심.자리별, { 1: 1 }, 'position 이 null 인 행을 자리 분포에 넣었다');
});

test('⑤ 질의가 이 축을 따라온다 — `쓰는사건` 에 등재돼 있다', () => {
  /* 🔑 부르는 쪽이 목록을 따로 적으면 축을 늘린 날 코드는 세려는데 질의가 안 실어 주고,
   *   증상은 「값이 낮다」뿐이다(축이 조용히 죽는다). */
  assert.ok(쓰는사건.includes('choice.selected'),
    '⑤축이 읽는 사건이 목록에 없다 — 질의가 그 행을 안 실어 와 축이 영원히 null 이다');
});

test('⑤ 표본 충분도에 이 축이 보탠다 — 근거도 함께 실린다', () => {
  const r = 학습자상태([고름사건('c1', '2026-08-08T01:00:00Z', { 고른것: 'a' })], { as_of: 기준 });
  assert.ok(r.estimator_confidence > 0, '축이 섰는데 표본이 0이다 — 축 합산에서 빠졌다');
  assert.ok(r.evidence_refs.사건.includes('c1'), '무엇을 보고 판단했는지가 근거에 안 남았다');
});

/* ── 차원별 분리 (c9 ③ `choice_dimension`)
 *
 * 🔴 **축이 다른 선택을 한 분포에 세면 그 수는 아무것도 안 가리킨다.** S1-5 만으로도 이미 둘이다
 *   — 「오늘 하루 어땠어요」(매일)와 「6개월 뒤의 나」(평생 1회). 아래가 재는 것은 그 둘이
 *   서로를 덮지 않는가 하나다. */

test('⑤ 차원이 다른 선택은 서로 다른 분포로 남는다 — 섞이면 두 수 다 뜻을 잃는다', () => {
  const r = 학습자상태([
    고름사건('c1', '2026-08-08T01:00:00Z', { 차원: 차원들.도입평일, 고른것: 'a', 시작: 0, 끝: 3000 }),
    고름사건('c2', '2026-08-08T02:00:00Z', { 차원: 차원들.도입평일, 고른것: 'a', 시작: 0, 끝: 3000 }),
    고름사건('c3', '2026-08-08T03:00:00Z', { 차원: 차원들.도입평일, 고른것: 'b', 시작: 0, 끝: 3000 }),
    고름사건('c4', '2026-08-08T04:00:00Z', { 차원: 차원들.도입첫날, 고른것: 'a', 시작: 0, 끝: 22000 }),
  ], { as_of: 기준 });
  const d = r.축.관심.차원별;
  assert.ok(d, '차원별 분포가 없다 — 축이 섞인 채로만 나온다');
  assert.deepEqual(d[차원들.도입평일].고른것, { a: 2, b: 1 });
  assert.deepEqual(d[차원들.도입첫날].고른것, { a: 1 });
  /* 🔑 이 한 줄이 이 트랙의 이유다 — 섞으면 22초가 3초 표본에 묻혀 「목표를 고를 때 오래
   *   망설였다」가 통째로 사라진다(최상위 중앙값은 3000 이다). */
  assert.equal(d[차원들.도입첫날].망설임_중앙, 22000, '평일 표본이 첫날의 망설임을 덮었다');
  assert.equal(d[차원들.도입평일].망설임_중앙, 3000);
});

test('⑤ 차원이 없던 옛 행은 「미상」으로 따로 센다 — 아무 축에도 얹지 않는다', () => {
  /* 옛 배정 행(`오늘과제.v3` 이전)에는 이 칸이 없다. 어느 차원에 얹으면 그 분포가 거짓이 되고,
   * 버리면 표본이 조용히 준다. 「모른다」를 그대로 세는 것이 유일하게 정직한 처리다. */
  const r = 학습자상태([
    고름사건('c1', '2026-08-08T01:00:00Z', { 차원: null, 고른것: 'a' }),
    고름사건('c2', '2026-08-08T02:00:00Z', { 차원: 차원들.도입평일, 고른것: 'a' }),
  ], { as_of: 기준 });
  const d = r.축.관심.차원별;
  assert.deepEqual(Object.keys(d).sort(), ['intro_daily', '미상'].sort());
  assert.equal(d['미상'].n, 1);
  assert.equal(d[차원들.도입평일].n, 1);
  assert.equal(r.축.관심.n, 2, '전체 표본은 그대로여야 한다 — 「모름」을 버리면 분모가 준다');
});
