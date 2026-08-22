/* 과제생성 시험지 회귀 — §8-B E4 절차·E8 배분·층화·goal 균형·앵커·해시 규격을 «파일 위에서» 잰다.
 *
 * ■ 무엇을 재나
 *   ① 디스크 시험지 == 같은 풀·분포·절차로 재조립한 바이트(E4 ⑤ — 절차를 지켰는지 따로 검사할 필요가
 *      없다: 절차가 달랐으면 바이트가 갈린다) · 풀은 불변(판·칸당·사례 수).
 *   ② 산술 — 총 40 · 칸당 ≥3 · goal 20/20 · 18기술 각 ≥2회 · 회전 시작점 열거(사례별) · 커버리지 분모 72.
 *   ③ E8 배분 함수 — 균등·편중·합 보정·결정성(같은 분포 = 같은 벡터).
 *   ④ 풀 순서 그대로(무작위 0) · 실학생 id 아님(가상 uuid 형식) · 앵커 id 고정.
 *   ⑤ 결과 파일 기계 계약(E2·E9)의 탐지력 — 키 누락·잘못된 null·grader_note 조건·결속 위반·일대일 위반을
 *      «드라이런 뼈대»를 변형해 실제로 잡는지(검사가 살아 있는지). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { 띄우기 } = require('./lib/띄우기.js');

const ROOT = path.resolve(__dirname, '..');
const 평가 = require('../lib/과제생성평가.js');
const { 경로, 파일해시 } = require('../lib/과제생성현행판.js');
/* 읽기 경로는 리터럴로(소스검사통로 래칫 — 변수 경로는 언어를 못 가른다) · 한 원천은 아래 첫 검사가 `경로` 와 대조한다. */
const 풀경로 = path.join(ROOT, 'evals', '과제생성_스냅샷풀.json');
const 시험지경로 = path.join(ROOT, 'evals', '과제생성_시험지.json');
const 프롬프트경로 = path.join(ROOT, 'prompts', '과제생성.md');
const 풀 = JSON.parse(fs.readFileSync(풀경로, 'utf8'));
const 시험지 = JSON.parse(fs.readFileSync(시험지경로, 'utf8'));
const 전문 = fs.readFileSync(프롬프트경로, 'utf8');

test('E4 ⑤ — 디스크 시험지 == 재조립 바이트(절차 재현) · 풀 불변 · 경로 한 원천', () => {
  assert.equal(경로.풀, 풀경로); assert.equal(경로.시험지, 시험지경로); assert.equal(경로.프롬프트, 프롬프트경로);
  const r = 띄우기([path.join(ROOT, 'tools', '과제생성시험지.js'), '--확인'], { encoding: 'utf8' });
  assert.match(r.stdout, /재현 일치/, r.stdout + r.stderr);
  assert.equal(풀.판, '스냅샷풀.v1');
  assert.equal(풀.사례.length, 160, '풀은 불변·추가만 — 줄었다면 옛 시험지 해시가 소급으로 거짓이 된다');
});

test('산술 — 총 40 · 칸당 ≥3 · goal 20/20 · 18기술 ≥2회 · 시작점 열거 · 커버리지 72', () => {
  assert.equal(시험지.사례.length, 평가.총사례);
  for (const [칸, n] of Object.entries(시험지.배분재료.칸당)) assert.ok(n >= 평가.칸당최소, `${칸} 칸당 ${n} < 3`);
  assert.equal(Object.values(시험지.배분재료.칸당).reduce((a, b) => a + b, 0), 40);
  assert.equal(시험지.goal유무.있음, 20); assert.equal(시험지.goal유무.없음, 20);
  assert.equal(시험지.사례.filter((c) => c.goal != null).length, 20);
  assert.deepEqual(시험지.층화.미달, [], '18기술 각각 최소 2회(E2 층화 불변)');
  assert.equal(시험지.층화.기술.length, 18);
  for (const c of 시험지.사례) {
    assert.ok(Number.isInteger(c.회전시작위치) && c.회전시작위치 >= 0 && c.회전시작위치 < 18, '회전 시작점이 사례별로 열거돼야 한다(E4-3)');
    assert.ok(c.skill_ids.length >= 1 && c.skill_ids.length <= 2);
    assert.match(c.assign_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(c.learner_id, /^[0-9a-f-]{36}$/, '가상 uuid 형식 — 실학생 식별자가 아니다(§10)');
  }
  assert.equal(시험지.커버리지.전체, 72);
  assert.equal(시험지.커버리지.선조합 + 시험지.커버리지.안선목록.length, 72);
  assert.ok(시험지.커버리지.선조합 <= 40 * 2, '채점 앞에 서는 조합은 최대 80 슬롯 이하');
});

test('E8 배분 — 균등·편중·합 보정·결정성', () => {
  const 균 = 평가.배분(null);
  assert.ok(균.균등); assert.deepEqual(균.급수당, { Lv3: 10, Lv4: 10, Lv5: 10, Lv6: 10 });
  const 편 = 평가.배분({ Lv3: 30, Lv4: 6, Lv5: 2, Lv6: 0, Lv1: 5, null: 3 });
  assert.equal(Object.values(편.급수당).reduce((a, b) => a + b, 0), 40);
  assert.deepEqual(편.급수당, { Lv3: 28, Lv4: 6, Lv5: 3, Lv6: 3 }, '큰 칸부터 깎는다 · 칸당 최소 3 유지');
  assert.equal(편.칸당['Lv5·표본적음'], 2, '홀수는 표본적음 +1');
  assert.deepEqual(평가.배분({ Lv3: 30, Lv4: 6, Lv5: 2, Lv6: 0 }), 편, '같은 분포는 항상 같은 벡터(E8 결정적)');
  assert.ok(평가.배분({ Lv1: 9 }).균등, '대상 급수 합 0 → 균등(v5.13-e)');
});

test('풀 순서 그대로 · 앵커 id 고정 · 채점표 판·통과선 동봉', () => {
  const 칸별 = new Map();
  for (const c of 시험지.사례) { if (!칸별.has(c.칸)) 칸별.set(c.칸, []); 칸별.get(c.칸).push(c.case_base_id); }
  for (const [칸, ids] of 칸별) {
    const [level, 상태] = 칸.split('·');
    const 풀순서 = 풀.사례.filter((p) => p.level === level && p.상태갈래 === 상태).map((p) => p.pool_id).slice(0, ids.length);
    assert.deepEqual(ids, 풀순서, `${칸}: 풀 배열 순서 그대로 채워야 한다(무작위 0)`);
  }
  assert.deepEqual(시험지.앵커['0점조건'].map((a) => a.anchor_id), ['Z1', 'Z2', 'Z3']);
  assert.deepEqual(시험지.앵커['1점앵커'].map((a) => a.anchor_id), ['A1', 'A2', 'A3']);
  assert.equal(시험지.채점표_판, 평가.채점표판);
  assert.deepEqual(시험지.통과선, 평가.통과선);
  const hex64값 = Object.values(시험지).some((v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v));
  assert.equal(hex64값, false, '시험지 해시 «값»은 파일 안에 안 적는다(순환) — 결과 파일 동봉 칸이 든다');
  assert.match(파일해시(시험지경로), /^[0-9a-f]{64}$/);
});

/* ── 결과 파일 기계 계약의 «탐지력» — 드라이런 뼈대를 변형해 검사가 실제로 잡는지 ───────── */
function 뼈대() {
  const 행 = [];
  for (const c of 시험지.사례) {
    const { 본문 } = 평가.사례본문(전문, c);
    for (const r of [1, 2]) {
      const raw = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ sentence: `문장 ${c.case_base_id}`, question: `질문 ${r}?` }) }] });
      행.push({
        case_id: 평가.case_id(c.case_base_id, r),
        axis_scores: Object.fromEntries(평가.축키들.map((k) => [k, (k === 'goal_use' && c.goal == null) ? null : 1])),
        grader_note: '', sentence: `문장 ${c.case_base_id}`, question: `질문 ${r}?`,
        raw_response: raw, raw_response_hash: 평가.응답해시(raw), input_hash: 평가.input_hash(본문),
      });
    }
  }
  const 동봉 = Object.fromEntries([...평가.비교축, ...평가.존재축, ...평가.기록축].map((k) => [k, `v-${k}`]));
  return { 동봉, 행 };
}

test('E2·E9 계약 — 유효 뼈대는 통과하고, 변형 7가지는 각각 «파일 전체 무효»', () => {
  const 기준 = 뼈대();
  assert.deepEqual(평가.결과검증(기준, 시험지, 전문), []);
  const 변형 = [
    ['행 키 누락', (r) => { delete r.행[0].grader_note; }, /키 집합/],
    ['⑦ 아닌 축의 null', (r) => { r.행[0].axis_scores.fresh = null; }, /null 은 ⑦/],
    ['0점인데 note 빔', (r) => { r.행[0].axis_scores.fun = 0; }, /grader_note 가 비었다/],
    ['raw 해시 어긋남', (r) => { r.행[0].raw_response_hash = 'a'.repeat(64); }, /raw_response_hash/],
    ['파서 산출과 다른 문장', (r) => { r.행[0].sentence = '손으로 고친 문장'; }, /같은 파서 산출/],
    ['input_hash 어긋남', (r) => { r.행[0].input_hash = 'b'.repeat(64); }, /input_hash/],
    ['사례 누락+중복(비율은 누락에 눈이 멀다)', (r) => { r.행[1] = { ...r.행[0] }; }, /누락|중복/],
    ['동봉 칸 빔', (r) => { r.동봉.quality_ver = ''; }, /동봉 칸 비었다: quality_ver/],
  ];
  for (const [이름, 손, 패턴] of 변형) {
    const r = JSON.parse(JSON.stringify(기준));
    손(r);
    const 사유 = 평가.결과검증(r, 시험지, 전문);
    assert.ok(사유.some((s) => 패턴.test(s)), `${이름}: 무효를 못 잡았다 — ${사유.join(' / ') || '(사유 0)'}`);
  }
});

test('E4 실측 — 집계 단위는 «사례»(두 회차 AND) · ⑦ 분모 20 · ⑧ 분모 40 · ⑥ 셀 미달 = 전체 미통과', () => {
  const r = 뼈대();
  let 집 = 평가.집계(r, 시험지);
  assert.equal(집.축.goal_use.분모, 20); assert.equal(집.축.state_use.분모, 40);
  assert.ok(집.통과);
  /* 36사례 2회 통과 + 4사례 1회만 → 명세 36/40 = 0.90(행 집계면 76/80 = 0.95 거짓 초록). */
  const 네사례 = 시험지.사례.slice(0, 4).map((c) => 평가.case_id(c.case_base_id, 2));
  for (const 행 of r.행) if (네사례.includes(행.case_id)) { 행.axis_scores.fresh = 0; 행.grader_note = '변형'; }
  집 = 평가.집계(r, 시험지);
  assert.equal(집.축.fresh.합, 36); assert.equal(집.축.fresh.비율, 0.9);
  /* ⑥ 셀 — Lv3 한 급수만 accuracy 1건 0 → 그 셀 비율 < 0.95 → 전체 미통과(V6-26). */
  const lv3 = 시험지.사례.find((c) => c.level === 'Lv3');
  for (const 행 of r.행) if (행.case_id === 평가.case_id(lv3.case_base_id, 1)) { 행.axis_scores.accuracy = 0; 행.grader_note = '변형'; }
  집 = 평가.집계(r, 시험지);
  assert.deepEqual(집.셀미달, ['Lv3']); assert.equal(집.통과, false);
  /* 누락 회차 = 0점(재시도 없음 · 분모에서 안 뺀다). */
  const r2 = 뼈대(); r2.행 = r2.행.slice(1);
  assert.equal(평가.집계(r2, 시험지).축.connect.합, 39);
});
