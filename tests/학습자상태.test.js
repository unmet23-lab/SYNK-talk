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
const { 학습자상태, 추정판, 창일수, 근거상한, 완충, 쓰는사건, 띠이름, 표본제외 } = require('../lib/학습자상태.js');
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

/* ── ①-b 늦적재 경계 (v11 · 설계 §11-4 ㉤·C4·D1 / §12-21 「늦적재 배제」) ──────────
 * 🔴 정상 경로에서는 배선 유무가 **둘 다 통과**라, 이 픽스처가 없으면 「배선했다」와
 *   「안 했다」가 같은 초록이다. 그리고 함수 단위로만 재면 조회층이 비어도 초록이라(C4 가
 *   실측한 그 모양) — 조회층(deliver SQL)까지 같은 절에서 잰다. */
test('늦적재 — occurred_at 은 창 안인데 ingested_at > 기준이면 상태에 안 들어온다', () => {
  const 행 = [...하루(2), ...하루(1)].map((e) => ({ ...e, ingested_at: e.occurred_at }));
  // 어제 배정·제출이 «기준 뒤에» 적재된 상황 — 발생 시각만 보면 창 안이다.
  const 늦은 = 행.map((e, i) => (i >= 2 ? { ...e, ingested_at: 전(기준, -1 * 일) } : e));
  const 다걸림 = 학습자상태(늦은, { as_of: 기준, ingested_as_of: 기준 });
  assert.equal(다걸림.축.리듬.n, 1, '늦적재 행이 상태에 섞였다 — 같은 as_of 가 다른 표본을 낸다');
  const 안걸림 = 학습자상태(늦은, { as_of: 기준 });
  assert.equal(안걸림.축.리듬.n, 2, '미전달인데 행동이 바뀌었다 — 기존 호출자 무영향 계약 위반');
});

test('늦적재 모드에서 ingested_at 없는 사건은 버린다 — 배선 누락은 조용히 통과하지 않는다', () => {
  const 행 = [...하루(1)];   // ingested_at 을 일부러 안 싣는다(조회층이 칸을 빠뜨린 모양)
  const r = 학습자상태(행, { as_of: 기준, ingested_as_of: 기준 });
  assert.equal(r.축.리듬?.n ?? 0, 0, '값 없는 사건이 통과했다 — 「모르면 포함」은 늦적재가 새는 방향이다');
  assert.equal(r.estimator_confidence, 0);
});

test('경계를 «썼다»는 사실이 evidence_refs 에 남는다 — 두 모드가 한 이름이 되지 않게', () => {
  const 행 = [...하루(1)].map((e) => ({ ...e, ingested_at: e.occurred_at }));
  const 쓴 = 학습자상태(행, { as_of: 기준, ingested_as_of: 기준 });
  assert.equal(쓴.evidence_refs.ingested_as_of, new Date(Date.parse(기준)).toISOString());
  const 안쓴 = 학습자상태(행, { as_of: 기준 });
  assert.ok(!('ingested_as_of' in 안쓴.evidence_refs));
});

test('조회층 — deliver 원신호 질의가 ingested_at 을 싣고, 창은 now() 가 아니라 스냅 기준을 쓴다', () => {
  const { 코드만 } = require('./lib/소스검사.js');
  const 원문 = 코드만(fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'deliver', 'index.ts'), 'utf8'));
  assert.ok(/'ingested_at',\s*x\.ingested_at/.test(원문),
    '원신호 행들에 ingested_at 이 안 실린다 — 하류 필터는 검사할 값이 없어 항상 통과한다(C4)');
  assert.ok(/e\.ingested_at\s*<=\s*\$\{스냅기준\}/.test(원문),
    'SQL 층의 늦적재 cutoff 가 없다 — 이중 cutoff(㉤)가 문서에만 있다');
  assert.ok(!/occurred_at\s*>=\s*now\(\)/.test(원문),
    '창이 아직 now() 를 쓴다 — 몇 시간 뒤 깨어난 워커가 같은 as_of 로 다른 창을 받는다(D1)');
  assert.ok(/ingested_as_of:\s*스냅기준/.test(원문),
    '호출부가 ingested_as_of 를 안 넘긴다 — lib 갈래가 영원히 죽은 코드다');
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
   *   낱말이 있어서 INSERT 열 목록에서 통째로 빠져도 초록이었다.
   * 🔑 「첫 INSERT = 개입 행」 앵커도 죽었다 — ④가 게임 배정 INSERT 를 앞에 뒀다. 위치가
   *   아니라 내용('intervention.delivered')으로 그 INSERT 를 집는다. */
  const 개입조각 = 배달본체.split(/insert into engine\.learning_events/)
    .find((s) => s.includes("'intervention.delivered'")) || '';
  const 열목록 = 개입조각.match(/^\s*\(([\s\S]*?)\)\s*values/);
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
  /* deliver 가 **자기 일로** 쓰는 셋을 뺀 나머지는 나올 이유가 없다 — 배정·제출 조인 둘에
   * ④가 H3 재제출 조인(`correction.responded` · 발주 §6-6 ⑪)을 더했다. 원신호 목록의 사본이
   * 아니라 자기 술어다 — 여기 더 늘어나면 정말 베낀 것인지부터 의심하라. */
  const 베낀것 = 쓰는사건.filter((t) => !['task.assigned', 'submission.created', 'correction.responded'].includes(t))
    .filter((t) => 배달본체.includes(`'${t}'`));
  assert.deepEqual(베낀것, [], `질의가 사건 목록을 베꼈다(${베낀것}) — 축을 늘린 날 조용히 갈라진다`);
  assert.ok(배달본체.includes('창일수'), '창을 숫자로 박았다 — lib 과 갈라지면 축이 조용히 죽는다');
});

test('🔴 배선 — 원신호가 task_snapshot 을 «submission 으로 중첩해» 싣는다(평평하면 G4 축이 서버에서 조용히 null)', () => {
  /* ⑩ G4행인가 는 e.submission.task_snapshot 을 읽는다(아래 G4행 픽스처와 같은 모양). 질의가
   * 이 칸을 안 싣던 동안 강제산출축은 서버 계산에서 구조적으로 null 이었다(08-20 수리). 이 검사는
   * 「읽는 코드가 있다」가 아니라 **싣는 모양**을 잰다 — 키가 있어도 중첩이 아니면 빨갛다.
   * 🔑 원문(배달본체)이 아니라 코드만 통로로 읽는다 — 과녁이 SQL 템플릿 «안»(문자열)이라 렉서가
   *   안 건드리고, 원문 단언 래칫(소스검사통로 잔여명단)을 늘리지 않는 것이 통로의 뜻이다. */
  const { 코드만, 파일소스 } = require('./lib/소스검사.js');
  const 배달코드 = 코드만(파일소스(path.join(ROOT, 'supabase', 'functions', 'deliver', 'index.ts')));
  assert.match(배달코드, /'submission', case when x\.task_snapshot is null then null/,
    '원신호 jsonb 에 submission 중첩이 없다 — G4 강제산출축이 서버에서 다시 굶는다');
  assert.match(배달코드, /jsonb_build_object\('task_snapshot', x\.task_snapshot\)/,
    'task_snapshot 이 submission «안»에 안 실렸다 — 소비자는 e.submission.task_snapshot 을 읽는다');
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

/* 🔴 이 행은 2026-08-10 까지 **원리상 도착을 못 했다** — 계약이 `payload.position` 을 값으로
 *   요구해 `skipped`·`rejected_all` 이 전건 거부됐다. 계약이 열린 지금 재는 것이 둘로 늘었다:
 *   ①축이 그 행을 분모에 세우는가 ②**「무관심」과 「뚜렷한 거절」을 가르는가.** 둘은 성향
 *   축에서 정반대 신호라, 한 칸에 담으면 행이 와도 그 사실은 영영 안 재진다. */
const 안고른행 = (id, at, 덧) => ({
  event_id: id, event_type: 'choice.selected', occurred_at: at,
  payload: { options_shown: 보기둘, position: null, selected_option: null, skipped: true, rejected_all: false, ...덧 },
});

test('⑤ 안 고른 행이 분모에 서고, 무관심과 거절이 갈린다', () => {
  const r = 학습자상태([
    안고른행('c1', '2026-08-08T01:00:00Z'),
    안고른행('c3', '2026-08-08T03:00:00Z', { skipped: false, rejected_all: true }),
    고름사건('c2', '2026-08-08T02:00:00Z', { 고른것: 'a' }),
  ], { as_of: 기준 });
  assert.equal(r.축.관심.안고름, 2, '안 고른 행을 세지 않았다 — 그 행이 오는 날 조용히 사라진다');
  assert.equal(r.축.관심.무관심, 1, '그냥 지나간 것과 거절한 것이 한 수로 뭉갰다');
  assert.equal(r.축.관심.거절, 1, '「둘 다 아니에요」가 무관심으로 접혔다');
  assert.deepEqual(r.축.관심.고른것, { a: 1 }, '안 고른 것을 무언가 고른 것으로 셌다');
  assert.deepEqual(r.축.관심.자리별, { 1: 1 }, 'position 이 null 인 행을 자리 분포에 넣었다');
});

test('🔴 ⑤ 거절은 `true` 로만 센다 — `있음(false)` 로 재면 평범한 무관심이 전부 거절이 된다', () => {
  /* 검증기 택1이 같은 함정(`있음(false)` === 참)에 빠져 있던 자리다. 여기서 같은 실수를 하면
   * 「뚜렷한 거절」이 실제보다 부풀고, 그 수는 아무 데서도 안 빨개진다. */
  const r = 학습자상태([안고른행('c1', '2026-08-08T01:00:00Z')], { as_of: 기준 });
  assert.equal(r.축.관심.거절, 0, 'rejected_all:false 를 거절로 셌다');
  assert.equal(r.축.관심.무관심, 1);
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

/* ── ⑥ 작성과정 — 쓰기 3종의 «어떻게 썼나» (v4 · G1 생산자와 한 벌 · 발주 §6-6 ⑨) ── */

/* 입력은 실제 조립기(`작성과정`)가 낸 모양이다(맹점 ① — 칸 이름을 손으로 적으면
 * 조립기가 이름을 바꾼 날 이 축이 조용히 0 이 되고 검사는 초록이다). */
const { 계측시작, 타건, 계측payload } = require('../lib/작성과정.js');
function 실compose_meta() {
  let s = 계측시작(0);
  s = 타건(s, '교수님께', 4000);
  s = 타건(s, '교수님', 5000); // 지움 — 되돌림 1
  s = 타건(s, '교수님, 안녕하십니까', 7000);
  return 계측payload(s, 30000);
}

test('⑥ compose_meta 가 온전한 제출만 분모다 — 음성 제출은 미측정이 아니라 잴 것이 없던 행이다', () => {
  const m = 실compose_meta();
  assert.ok(m, '조립기 픽스처가 한 벌을 못 냈다');
  const r = 학습자상태([
    사건('submission.created', '2026-08-08T01:00:00Z', { payload: { ver: 1, attempt_no: 1, compose_meta: m } }),
    사건('submission.created', '2026-08-08T02:00:00Z', { payload: { ver: 1, attempt_no: 1 } }), // 음성 — 키 없음
  ], { as_of: 기준 });
  const 축 = r.축.작성과정;
  assert.ok(축, '작성과정 축이 안 섰다 — 생산자만 있고 소비자가 없다(수집은 엔진 도달까지 한 벌)');
  assert.equal(축.n, 1);
  assert.equal(축.불완전, 0);
  assert.equal(축.미룸_중앙, m.first_keystroke_ms);
  assert.equal(축.붙듦_중앙, m.total_compose_ms);
  assert.equal(축.되돌림_중앙, m.revision_count);
  assert.equal(축.최대덩어리_최대, m.input_burst_max);
});

test('⑥ 쓰기 제출이 없으면 축은 null — 0 으로 채우지 않는다', () => {
  const r = 학습자상태([
    사건('submission.created', '2026-08-08T01:00:00Z', { payload: { ver: 1, attempt_no: 1 } }),
  ], { as_of: 기준 });
  assert.equal(r.축.작성과정, null);
});

test('⑥ 반쪽 compose_meta 는 값에 안 섞이고 「불완전」으로 드러난다 — 조립기 규율이 새면 여기가 유일한 눈이다', () => {
  const r = 학습자상태([
    사건('submission.created', '2026-08-08T01:00:00Z', { payload: { ver: 1, compose_meta: { total_compose_ms: 9 } } }),
  ], { as_of: 기준 });
  const 축 = r.축.작성과정;
  assert.ok(축, '반쪽만 온 날 축이 null 이면 결함이 조용히 사라진다');
  assert.equal(축.n, 0);
  assert.equal(축.불완전, 1);
  assert.equal(축.미룸_중앙, null, '반쪽 값이 중앙값에 섞였다');
});

test('⑥ M2 — 불완전 행의 주소가 축과 evidence_refs 양쪽에 남는다(되짚을 수 있어야 눈이다)', () => {
  const 반쪽행 = 사건('submission.created', '2026-08-08T01:00:00Z',
    { payload: { ver: 1, compose_meta: { total_compose_ms: 9 } } });
  const r = 학습자상태([반쪽행], { as_of: 기준 });
  assert.equal(r.축.작성과정.불완전, 1);
  /* 🔑 축이 직접 주소를 든다 — evidence_refs 는 축 구분 없는 한 자루라(끈기축도 같은 제출을
   * 담는다) 그것만으로는 「이 축이 이 행을 반쪽으로 봤다」를 못 되짚는다(변이 실측: 담아를
   * 지워도 저 자루는 초록이었다 — 우연의 겹침이 탐지력을 먹은 자리). */
  assert.deepEqual(r.축.작성과정.불완전사건, [반쪽행.event_id],
    '반쪽 행의 주소가 축에 없다 — 결함 행을 찾으러 전 행을 다시 뒤지게 된다');
  assert.ok(r.evidence_refs.사건.includes(반쪽행.event_id));
});

test('⑥ M1 — 같은 제출이 신뢰도 표본에 두 번 안 센다(작성과정 n 은 표본 밖)', () => {
  const m = 실compose_meta();
  const r = 학습자상태([
    사건('submission.created', '2026-08-08T01:00:00Z', { payload: { ver: 1, attempt_no: 1, compose_meta: m } }),
  ], { as_of: 기준 });
  /* 축은 둘이 잡지만(끈기 1 · 작성과정 1) **사건은 하나다** — 표본이 2가 되면 「몇 건 위에
   * 세웠나」가 거짓이 되어 신뢰도가 공짜로 오른다. */
  assert.equal(r.축.끈기.n, 1);
  assert.equal(r.축.작성과정.n, 1);
  const 한건 = Math.round((1 / (1 + 완충)) * 100) / 100;
  assert.equal(r.estimator_confidence, 한건,
    `표본이 이중 계상됐다 — 한 사건의 신뢰도는 ${한건} 이어야 한다(실제 ${r.estimator_confidence})`);
});

/* ── v6 — 라디오 승격 제출은 앱 리듬·끈기가 아니다 (반박 c757278 치명 ①) ─────────
 * 재현이 실측된 자리: 배정 1건 + 라디오 자습체크인 승격 행 → 옛 판은
 * 리듬 {제출률: 1, 마감여유분_중앙: 720} — **앱을 한 번도 안 연 학생이 「숙제를 12시간
 * 여유 두고 냈다」**가 됐고, deliver 가 개입 행에 스탬프하므로 되돌릴 수 없었다. */
test('v6 — 라디오 승격 제출(자습체크인·목표선언)은 리듬·끈기에 안 센다', () => {
  const 행 = [
    사건('task.assigned', 전(기준, 1 * 일), { due_at: 전(기준, 1 * 일 - 12 * 60 * 60 * 1000) }),
    사건('submission.created', 전(기준, 1 * 일 - 8 * 60 * 60 * 1000), { task_type: '자습체크인' }),
    사건('submission.created', 전(기준, 1 * 일 - 9 * 60 * 60 * 1000), { task_type: '목표선언' }),
  ];
  const { 축 } = 학습자상태(행, { as_of: 기준 });
  assert.equal(축.리듬.제출률, 0,
    '라디오 체크인이 숙제 제출로 세어졌다 — 앱을 안 연 학생이 「여유 두고 냈다」가 된다');
  assert.equal(축.리듬.n, 1);
  assert.equal(축.끈기, null, '라디오 제출이 끈기 «시도» 로 세어졌다');
});

test('v6 — 앱 통로 제출(발화녹음·task_type 없는 옛 행)은 그대로 센다 (필터가 앱 신호를 먹지 않는다)', () => {
  const 행 = [
    사건('task.assigned', 전(기준, 2 * 일), { due_at: 전(기준, 2 * 일 - 12 * 60 * 60 * 1000) }),
    사건('submission.created', 전(기준, 2 * 일 - 8 * 60 * 60 * 1000), { task_type: '발화녹음' }),
    사건('task.assigned', 전(기준, 1 * 일), { due_at: 전(기준, 1 * 일 - 12 * 60 * 60 * 1000) }),
    사건('submission.created', 전(기준, 1 * 일 - 8 * 60 * 60 * 1000)), // task_type 없는 옛 행
  ];
  const { 축 } = 학습자상태(행, { as_of: 기준 });
  assert.equal(축.리듬.제출률, 1, '필터가 앱 제출까지 먹었다 — 반대 방향으로 틀렸다');
  assert.equal(축.끈기.n, 2);
});

/* ── ⑨ 집중띠 — 「언제 집중이 오르는가」(v7 · 철학 ㉡) ───────────────
 * 🔑 이 축의 급소는 **시간대**다. 안 주면 못 재는 것이 맞고, UTC 로 접으면 몽골 저녁이 오전으로
 *   들어가 값이 «조용히» 거짓이 된다 — 그 두 자리를 아래 둘이 각각 못박는다.
 * ⚠ 띠 이름은 여기 베끼지 않고 `띠이름` 에서 파생시킨다(칸을 늘린 날 검사만 옛 이름을 들면
 *   초록인 채로 축이 바뀐다 · 맹점 ①). */
const UB = 'Asia/Ulaanbaatar'; // UTC+8 · 검사 «입력»이라 리터럴이 맞다(코드 쪽은 아래에서 금지한다)
const 띠 = (시) => 띠이름[Math.floor(시 / (24 / 띠이름.length))];

test('🔴 ⑨ 시간대를 안 주면 축은 null 이다 — UTC 로 접지 않는다', () => {
  const 행 = [
    사건('submission.created', '2026-08-09T01:00:00Z'),
    사건('session.abandoned', '2026-08-09T02:00:00Z'),
  ];
  const { 축 } = 학습자상태(행, { as_of: 기준 });
  assert.equal(축.집중띠, null, '시간대 없이 띠를 냈다 — 그 값은 몽골 시각이 아니다');
  assert.ok(축.끈기, '같은 재료를 쓰는 끈기축까지 죽었다 — 집중띠의 실패가 남의 축을 끌고 갔다');
});

test('⑨ 띠마다 완주율이 따로 난다 — 같은 두 사건을 띠로 갈라 다시 읽는다', () => {
  const 행 = [
    사건('submission.created', '2026-08-08T13:00:00Z'), // UB 21시 → 저녁 · 완주
    사건('submission.created', '2026-08-09T01:00:00Z'), // UB 09시 → 오전 · 완주
    사건('session.abandoned', '2026-08-09T02:00:00Z'), // UB 10시 → 오전 · 이탈
  ];
  const { 집중띠 } = 학습자상태(행, { as_of: 기준, 시간대: UB }).축;
  assert.equal(집중띠.n, 3);
  assert.equal(집중띠.띠수, 2);
  assert.deepEqual(집중띠.띠[띠(9)], { 완주율: 0.5, n: 2 });
  assert.deepEqual(집중띠.띠[띠(21)], { 완주율: 1, n: 1 });
});

test('🔴 ⑨ 자정을 넘는 사건이 «현지» 띠로 간다 — UTC 로 읽었으면 저녁이 됐을 자리', () => {
  /* UB = UTC+8. 23시(UTC)는 이튿날 07시(현지) = 오전이다. 형식기를 UTC 로 바꾸거나
   * `hourCycle` 을 떼면 이 검사가 바로 빨개진다 — 이 축의 유일한 조용한 실패 자리다. */
  const 행 = [사건('submission.created', '2026-08-08T23:00:00Z')];
  const { 집중띠 } = 학습자상태(행, { as_of: 기준, 시간대: UB }).축;
  assert.deepEqual(Object.keys(집중띠.띠), [띠(7)], `UTC 로 읽어 ${띠(23)} 으로 갔다`);
  assert.notEqual(띠(7), 띠(23), '이 검사가 뜻을 가지려면 두 띠가 달라야 한다');
});

test('🔴 ⑨ 띠수 1 이 값에 드러난다 — 수업표가 몰아넣은 것을 성향으로 안 읽는다', () => {
  const 행 = [
    사건('submission.created', '2026-08-08T13:00:00Z'), // UB 21시
    사건('submission.created', '2026-08-09T12:00:00Z'), // UB 20시
  ];
  const { 집중띠 } = 학습자상태(행, { as_of: 기준, 시간대: UB }).축;
  assert.equal(집중띠.띠수, 1, '띠수를 안 내면 소비자가 「저녁형 학생」이라고 읽는다');
  assert.equal(집중띠.띠[띠(21)].완주율, 1);
});

test('🔴 ⑨ 신뢰도가 공짜로 안 오른다 — 끈기축이 이미 센 사건이라 표본에서 뺀다', () => {
  const 행 = [
    사건('submission.created', '2026-08-09T01:00:00Z'),
    사건('submission.created', '2026-08-09T02:00:00Z'),
    사건('session.abandoned', '2026-08-09T03:00:00Z'),
  ];
  const 상태 = 학습자상태(행, { as_of: 기준, 시간대: UB });
  assert.ok(표본제외.includes('집중띠'), '표본제외 목록에서 빠졌다 — 같은 제출이 두 번 세어진다');
  assert.equal(상태.축.집중띠.n, 3, '축은 세 건을 봤다');
  /* 분자를 3 으로 못박는 것이 이 검사의 전부다 — 반올림 규칙은 위 「신뢰도」 검사가 이미 진다. */
  assert.equal(상태.estimator_confidence, Math.round((3 / (3 + 완충)) * 100) / 100,
    '표본이 3 이 아니라 6 으로 세어졌다 — 같은 사건을 두 축이 세면 신뢰도가 공짜로 오른다');
});

test('⑨ 띠는 «하루 순서»로 낸다 — 사건이 도착한 순서가 값에 새지 않는다', () => {
  const 행 = [
    사건('submission.created', '2026-08-08T13:00:00Z'), // 저녁(먼저 일어난 일)
    사건('submission.created', '2026-08-09T01:00:00Z'), // 오전(나중)
  ];
  const { 집중띠 } = 학습자상태(행, { as_of: 기준, 시간대: UB }).축;
  assert.deepEqual(Object.keys(집중띠.띠), [띠(9), 띠(21)],
    '시간순 삽입 순서를 그대로 냈다 — 같은 창을 다시 계산해도 키 순서가 갈린다');
});

test('⑨ 라디오 승격 제출은 안 센다 — 학생이 앉은 시각이 아니라 승격기가 돈 시각이다', () => {
  const { 라디오태스크종 } = require('../lib/라디오태스크.js');
  const 행 = [
    사건('submission.created', '2026-08-09T01:00:00Z', { task_type: 라디오태스크종[0] }),
    사건('session.abandoned', '2026-08-09T02:00:00Z'),
  ];
  const { 집중띠 } = 학습자상태(행, { as_of: 기준, 시간대: UB }).축;
  assert.equal(집중띠.n, 1, '라디오 행이 띠에 실렸다 — 끈기축과 같은 필터를 안 탔다');
  assert.equal(집중띠.띠[띠(10)].완주율, 0);
});

test('🔴 ⑨ 자정 사건이 «새벽» 으로 들어가고 버린 행은 세어진다 — n + 못읽음 = 시도', () => {
  /* ⚠ 이 검사가 «못 재는» 축이 있다: `hourCycle:'h23'` 을 `hour12:false` 로 바꾸는 변이는
   *   Node 의 ICU 에선 값이 같아 초록으로 통과한다(변이 M6 실측). 그 차이는 Deno(Edge)에서만
   *   드러나므로, 거기서 자정이 「24」로 오면 `못읽음` 이 0 이 아니게 되어 **라이브 값이 알려 준다**.
   *   즉 이 줄은 「막았다」가 아니라 「보이게 해 뒀다」다. */
  const 행 = [사건('submission.created', '2026-08-08T16:30:00Z')]; // UB 00:30 → 새벽
  const { 집중띠 } = 학습자상태(행, { as_of: 기준, 시간대: UB }).축;
  assert.deepEqual(Object.keys(집중띠.띠), [띠(0)], '자정 사건이 새벽 띠 밖으로 떨어졌다');
  assert.equal(집중띠.못읽음, 0);
  assert.equal(집중띠.n + 집중띠.못읽음, 1, '버린 행이 어디에도 안 세어졌다 — 손실이 조용하다');
});

test('🔴 ⑨ 배선 — deliver 가 시간대를 넘긴다(안 넘기면 라이브에서 이 축만 조용히 null)', () => {
  const 옵션 = 배달본체.match(/학습자상태\s*\([\s\S]*?as_of[^}]*\}/);
  assert.ok(옵션, '학습자상태 호출을 못 찾았다 — 모양이 바뀌었으면 이 검사도 같이 옮긴다');
  assert.ok(/시간대/.test(옵션[0]),
    'deliver 가 시간대를 안 넘긴다 — 배포는 성공하고 집중띠만 영원히 null 이다(증상 0)');
});

test('🔴 ⑨ IANA 이름을 lib 에 베끼지 않았다 — 사본이 되는 순간 날짜 경계가 두 곳에 산다', () => {
  const 모듈본체 = fs.readFileSync(path.join(ROOT, 'lib', '학습자상태.js'), 'utf8');
  const 베낌 = 모듈본체.match(/['"][A-Za-z]+\/[A-Za-z_]+['"]/g) || [];
  assert.deepEqual(베낌, [], `시간대 이름을 코드에 박았다(${베낌}) — 부르는 쪽이 넘기는 값이다`);
});

/* ── ⑩ 강제산출 — G4 「서류 관문」(v9 · 발주_게임모듈.md G4 §2 ㉡·§5) ───────────────
 * 🔑 표식은 **submission.task_snapshot.challenge_id** = 서류관문 팩 정본이다 — 여기 리터럴을
 *   박지 않고 팩에서 가져온다(사람이 실제로 쓰는 표기 · 팩이 id 를 갈면 여기가 같이 빨개진다).
 * 🔑 실생산자 산출 → 이 축의 사슬은 `tests/서류관문제출.test.js` ⑤ 가 진다 — 여기는 소비자의
 *   판정(표식 필터·계산·null·잰 행만)을 위반 픽스처로 못박는다. */
const { 모듈상수: 서류관문상수 } = require('../contents/서류관문문항.js');
const G4스냅 = { challenge_id: 서류관문상수.challenge_id, prompt_seed: 'g4t01.b1' };
const g4행 = (event_type, task_type, payload, 더 = {}) => 사건(event_type, 전(기준, 일), {
  task_type,
  submission: { task_ref: 't', task_format: '응답', task_snapshot: G4스냅, task_schema_ver: 'g4스냅샷.v1' },
  payload: { ver: 1, ...payload },
  ...더,
});
const g4빈칸 = (payload = {}, 더) => g4행('quiz.answered', '퀴즈응답', { attempt_no: 1, ...payload }, 더);
const g4변환 = (payload = {}) => g4행('submission.created', '숙제제출', { attempt_no: 1, ...payload });

test('⑩ 강제산출 — 모름넘김률·재도전률·빈칸체류를 «한 분모» 위에서 낸다', () => {
  const r = 학습자상태([
    g4빈칸({ latency_ms: 3000 }),
    g4빈칸({ skipped: true }),
    g4빈칸({ attempt_no: 2, latency_ms: 5000 }),
    g4변환(),
  ], { as_of: 기준 });
  const 축 = r.축.강제산출;
  assert.ok(축, '강제산출축이 안 섰다 — 생산자만 있고 소비자가 없다(수집은 엔진 도달까지 한 벌)');
  assert.equal(축.n, 4, '분모는 「그날 지난 턴 수」다 — 갈래별로 나누면 비율이 항상 1 에 붙는다');
  assert.equal(축.모름넘김률, 0.25);
  assert.equal(축.재도전률, 0.25);
  assert.equal(축.빈칸체류_중앙, 4000, '잰 두 행의 중앙값 — 변환·모름 행은 latency 가 없어 분모 밖이다');
});

test('🔴 ⑩ 표식 필터 — G4 스냅샷 없는 행·남의 챌린지·라디오 승격 행은 안 든다', () => {
  const r = 학습자상태([
    g4빈칸(),
    /* 남의 챌린지 — G2 지목 행은 탐지축 몫이다(모양이 아니라 표식으로 가른다). */
    사건('quiz.answered', 전(기준, 일), {
      task_type: '퀴즈응답',
      submission: { task_ref: 't', task_format: '응답', task_snapshot: { challenge_id: 'g2-보고서교정' } },
      payload: { ver: 1, attempt_no: 1 },
    }),
    /* 스냅샷 없는 행 — 라디오 승격 퀴즈·옛 행의 모양이다. */
    사건('quiz.answered', 전(기준, 일), { payload: { ver: 1, confidence: 'low' } }),
    /* 라디오 승격 «제출» 이 언젠가 G4 스냅샷을 싣는 날의 위조 — 표식 하나에만 기대면 통과한다.
     * `앱제출만`(task_type) 이 두 번째 문이라 여기서 걸려야 한다(v6·탐지축과 같은 결함 계열). */
    g4행('submission.created', '목표선언', { attempt_no: 1 }),
  ], { as_of: 기준 });
  assert.equal(r.축.강제산출.n, 1, 'G4 표식(스냅샷 challenge_id) 밖의 행이 들어왔다');
});

test('⑩ 재료 0 이면 null — 0 으로 채우면 「재료 없음」이 「못한다」로 읽힌다', () => {
  const r = 학습자상태([사건('quiz.answered', 전(기준, 일), { payload: { ver: 1 } })], { as_of: 기준 });
  assert.equal(r.축.강제산출, null);
});

test('⑩ 못 잰 값은 축에도 안 든다 — latency 없는 행만이면 체류는 null, skipped 는 true 로만 센다', () => {
  const r = 학습자상태([g4빈칸(), g4빈칸({ skipped: false })], { as_of: 기준 });
  assert.equal(r.축.강제산출.빈칸체류_중앙, null, '0 으로 접으면 「즉시 답했다」가 되어 분포가 왼쪽으로 쏠린다');
  assert.equal(r.축.강제산출.모름넘김률, 0, 'skipped:false 가 모름으로 세어졌다 — 「실려 있나」로 재면 오염이다');
});

test('🔴 ⑩ 신뢰도가 공짜로 안 오른다 — 자기인식축이 이미 센 사건이라 표본에서 뺀다', () => {
  assert.ok(표본제외.includes('강제산출'), '표본제외 목록에서 빠졌다 — 같은 퀴즈응답이 두 번 세어진다');
  const r = 학습자상태([g4빈칸(), g4빈칸({ skipped: true })], { as_of: 기준 });
  assert.equal(r.축.강제산출.n, 2, '축은 두 건을 봤다');
  /* 두 행은 자기인식축(quiz.answered)이 표본으로 이미 센다 — 강제산출이 더해지면 4 가 된다. */
  assert.equal(r.estimator_confidence, Math.round((2 / (2 + 완충)) * 100) / 100,
    '표본이 2 가 아니다 — 같은 사건을 두 축이 세면 신뢰도가 공짜로 오른다');
});

/* ── ⑫확인축 v14 — «키별 마지막 답» 접기 (심문 G11 잔여 · 유호 해제 08-24) ──────────
 * v13 까지 이 축의 산출 모양 회귀는 0건이었다(08-24 정찰 실측) — 접기를 넣는 판에 모양을
 * 같이 못박는다. 무늬 선례 = 피드백수용 「같은 교정에 두 번 답하면 마지막 답」. */
const 확인답 = (밀리전, 키, 답, 더 = {}) =>
  사건('estimate.responded', 전(기준, 밀리전), {
    payload: { ver: 1, trait_axis: '리듬', shown_key: 키, shown_text: '…', response: 답,
      estimator_version: '학습자상태.v14+성향확인.v1', estimate_as_of: 전(기준, 밀리전 + 1000) },
    ...더,
  });

test('⑫ 접기 — 같은 (축·키)의 답 여럿은 마지막 하나가 그 키의 입장이다 · 접힘·뒤집힘이 드러난다', () => {
  const r = 학습자상태([
    확인답(3 * 일, '여유제출', '맞다'),
    확인답(2 * 일, '여유제출', '아니다'),
    확인답(1 * 일, '여유제출', '맞다'),
  ], { as_of: 기준 });
  assert.equal(r.축.확인.n, 1, '키 하나인데 n 이 행 수다 — 접기가 안 돌았다');
  assert.equal(r.축.확인.맞다수, 1, '마지막 답(맞다)이 아니라 다른 것이 남았다');
  assert.equal(r.축.확인.아니다수, 0);
  assert.deepEqual(r.축.확인.축별, { 리듬: { 맞다: 1, 아니다: 0 } });
  assert.equal(r.축.확인.접힘수, 2, '접힌 수가 조용히 사라졌다 — 세어 드러나야 한다');
  assert.equal(r.축.확인.뒤집힘수, 2, '맞다→아니다→맞다 = 뒤집힘 둘(접기가 감춘 모순의 계기판)');
  assert.equal(r.축.확인.표본n, 3, '표본n 은 원행 수다 — 신뢰도 분모가 판올림에 움직이면 안 된다');
});

test('⑫ 다른 키는 안 접힌다 — 키가 곧 입장의 단위다', () => {
  const r = 학습자상태([확인답(2 * 일, '여유제출', '맞다'), 확인답(1 * 일, '반복제출', '아니다')], { as_of: 기준 });
  assert.equal(r.축.확인.n, 2);
  assert.equal(r.축.확인.맞다수, 1);
  assert.equal(r.축.확인.아니다수, 1);
  assert.equal(r.축.확인.접힘수, 0);
});

test('⑫ 동시각 경쟁 쌍 — event_id 사전순 뒤가 이기고, 입력 순서를 섞어도 같다(결정성)', () => {
  /* 두 기기가 같은 순간 서로 다른 답을 낸 모양 — «참» 순서는 없고 결정성만 있으면 된다.
   * (새 쌍 자체는 DB 유일 제약이 막는다 — 이 픽스처는 그 전에 쌓인 행의 소비 규칙이다.) */
  const a = { ...확인답(1 * 일, '여유제출', '맞다'), event_id: 'EVT-a' };
  const b = { ...확인답(1 * 일, '여유제출', '아니다'), event_id: 'EVT-b' };
  const 정 = 학습자상태([a, b], { as_of: 기준 });
  const 역 = 학습자상태([b, a], { as_of: 기준 });
  assert.equal(정.축.확인.아니다수, 1, 'event_id 사전순 뒤(EVT-b)가 마지막이어야 한다');
  assert.equal(정.축.확인.맞다수, 0);
  assert.deepEqual(역.축.확인, 정.축.확인, '입력 순서가 값을 갈랐다 — 소비자마다 다른 상태가 된다');
});

test('⑫ 모르는 response 값은 입장이 못 되고 표본n 에만 남는다 — 지어내지 않는다', () => {
  const r = 학습자상태([
    확인답(2 * 일, '여유제출', '글쎄요'),
    확인답(1 * 일, '여유제출', '맞다'),
  ], { as_of: 기준 });
  assert.equal(r.축.확인.n, 1);
  assert.equal(r.축.확인.맞다수, 1);
  assert.equal(r.축.확인.접힘수, 0, '무효 답이 접힘으로 세어졌다 — 유효한 것끼리만 접는다');
  assert.equal(r.축.확인.표본n, 2, '무효 답도 원행 수에는 남는다(v13 의 n 과 같은 값)');
  assert.equal(r.estimator_confidence, Math.round((2 / (2 + 완충)) * 100) / 100,
    '신뢰도 분모가 접기로 움직였다 — 표본n 이 그 몫을 져야 한다');
});
