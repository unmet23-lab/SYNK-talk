/* 과제생성 출시 게이트(차단기) — §8-B I2 실행층 · §12-14 «기계 형태» 편입 · §12-19 · §12-24 ④ (2026-08-22)
 *
 * ■ 무엇을 재나
 *   ① 「활성」의 값 = prompts/과제생성.md 실재(V6-23 · 새 플래그 0) + 동봉 원천 리터럴 == 그 파일(§12-24 ④ ① —
 *      deliver-one/동봉.json 의 과제생성프롬프트.mjs 가 다른 경로를 읽으면 이 게이트는 «안 도는 프롬프트»에 초록이다).
 *   ② 현행 비교축 7칸(lib/과제생성현행판 — 도구와 같은 함수 하나)이 형식을 갖춘다. model 은 env(유호님 몫)라
 *      비어 있을 수 있고, 그 빈 값은 어떤 결과의 model 과도 «다르게» 읽혀 차단이 선다(리터럴 0 유지).
 *   ③ 결과 정본 evals/과제생성_결과.json —
 *      · 부재(지금): 활성인데 결과 0벌 = «미실행». 🔴 v5.13-e 정직화: 빨강이 아니라 **todo** 로 낸다 — F207(미실행 ≠
 *        통과)은 지키되 「주인 없는 적색은 남의 배포를 막는다」(CLAUDE.md)도 지킨다. 실행 게이트 공백기의 차단은
 *        §16-1 #6 사람 도장이 진다(ⓔ-19 그대로 · 왕복시험 A7 이 n/4 로 센다).
 *      · 존재: 기계 계약(E2·E9) 0사유 · 비교축 7 전부 현행과 같음(V6-23 — 하나라도 다르면 옛 초록) · 존재축 2 비어 있지
 *        않음 · 사례 단위 AND 집계 통과(⑥ 셀 포함). 하나라도 어긋나면 **빨강** — 그게 진짜 게이트다.
 *   ④ 차단기 10칸 목록(비교 7 + 존재 2 + 기록 1)은 lib 상수 하나가 정본이고 §8-B 실행층 표와 사람 눈 1회 수검
 *      (08-22 — 일치). 문서층 상시 기계는 자기검증 철거 방향대로 안 짓는다.
 * ■ 초안(evals/과제생성_결과_초안.json · 드라이런)은 정본이 아니라 이 게이트가 읽지 않는다. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 평가 = require('../lib/과제생성평가.js');
const { 경로, 활성인가, 현행판 } = require('../lib/과제생성현행판.js');
/* 읽기 경로는 리터럴로(소스검사통로 래칫) · 한 원천은 첫 검사가 `경로` 와 대조한다. */
const 프롬프트경로 = path.join(ROOT, 'prompts', '과제생성.md');
const 시험지경로 = path.join(ROOT, 'evals', '과제생성_시험지.json');
const 결과경로 = path.join(ROOT, 'evals', '과제생성_결과.json');

test('① 활성 판정 — prompts/과제생성.md 실재 · 동봉 원천 리터럴 == 그 파일(§12-24 ④ ①) · 경로 한 원천', () => {
  assert.equal(경로.프롬프트, 프롬프트경로); assert.equal(경로.시험지, 시험지경로); assert.equal(경로.결과, 결과경로);
  assert.equal(활성인가(), fs.existsSync(프롬프트경로));
  const 동봉 = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'deliver-one', '동봉.json'), 'utf8'));
  assert.equal(동봉['과제생성프롬프트.mjs'], 'prompts/과제생성.md',
    '워커가 읽는 프롬프트 원천이 prompts/과제생성.md 가 아니다 — 게이트가 안 도는 프롬프트에 초록이 된다');
  const 전문 = fs.readFileSync(프롬프트경로, 'utf8');
  assert.match(전문, /^> \*\*현재 v\d+\*\*/m, '프롬프트 머리말 「현재 vN」이 없으면 prompt_ver 가 null 로 접힌다');
});

test('② 현행 비교축 7칸 형식 — 도구와 같은 함수 하나(lib/과제생성현행판)', () => {
  if (!활성인가()) return;
  const 현 = 현행판();
  assert.deepEqual(Object.keys(현).sort(), [...평가.비교축].sort(), '현행판 키 == 비교축 7(§8-B 차단기 칸)');
  assert.match(현.prompt_ver, /^과제생성\.v\d+\+[0-9a-f]{12}$/, 'v5.13-b ① 형식');
  assert.match(현.quality_ver, /^[0-9a-f]{12}$/, '판독기.품질지문 — 검문·오류분류 파일 해시(D5 차단기 자체 계산)');
  assert.match(현.skill_taxonomy_ver, /^skills\.v\d+$/);
  assert.match(현.estimator_version, /^학습자상태\.v\d+$/);
  assert.equal(현.채점표_판, 평가.채점표판);
  assert.match(String(현.시험지_해시), /^[0-9a-f]{64}$/, '시험지 파일이 있어야 한다(evals/과제생성_시험지.json)');
  assert.equal(typeof 현.model, 'string', 'model 은 env GENERATION_MODEL — 리터럴 0(비어 있을 수 있다)');
});

test('④ 차단기 10칸 = 비교 7 + 존재 2 + 기록 1(§8-B 실행층 표 — 사람 눈 1회 수검 08-22 일치)', () => {
  assert.equal(평가.비교축.length, 7); assert.equal(평가.존재축.length, 2); assert.equal(평가.기록축.length, 1);
  assert.deepEqual([...평가.비교축].sort(), ['estimator_version', 'model', 'prompt_ver', 'quality_ver', 'skill_taxonomy_ver', '시험지_해시', '채점표_판'].sort());
  assert.deepEqual([...평가.존재축], ['채점자', '시각']);
  assert.deepEqual([...평가.기록축], ['policy_ver'], 'policy_ver 는 기록만(배관 재료라 비교에서 뺐다 · E2)');
  assert.equal(평가.축키들.length, 8);
});

/* ③ 결과 정본 — 존재하면 진짜 게이트(빨강 가능) · 부재면 미실행 todo(정직화).
 * 미채점 행이 남은 판도 todo 다(08-23 신설) — 유호님이 2회전 채점을 연기해(결정.md 08-23)
 * «생성만 끝난 판»이 결과 파일로 서는 국면이 생겼다. 그 판의 8축 전멸은 「게이트가 깨졌다」가
 * 아니라 「아직 안 쟀다」라, 빨강으로 두면 채점 전까지 모든 커밋이 소음 빨강을 안고 간다(F296:
 * 못 재면 fail 이 아니라 드러나는 todo). 채점이 완주하는 순간 이 갈래는 저절로 진짜 게이트다. */
const 정본있음 = fs.existsSync(결과경로);
const 결과정본 = 정본있음 ? JSON.parse(fs.readFileSync(결과경로, 'utf8')) : null;
const 미채점수 = 결과정본 ? (결과정본.행 || []).filter((r) => r.grader_note === '미채점').length : 0;
if (!활성인가()) {
  test('③ 비활성 — prompts/과제생성.md 가 없어 적용 안 함', () => {});
} else if (!정본있음) {
  test.todo('③ §8-B 미실행 — 활성인데 evals/과제생성_결과.json 0벌: 첫 생성 행 «전» 필수 #6(크레딧·GENERATION_MODEL·사람 채점 80회 = 유호님 몫)이 차기 전엔 학생 접점을 «지났다»고 말할 수 없다(ⓔ-19 사람 도장 · 왕복시험 A7 n/4 가 센다)');
} else if (미채점수 > 0) {
  test.todo(`③ §8-B 채점 대기 — 결과 ${(결과정본.행 || []).length}행 중 ${미채점수}행 미채점(유호님 채점 연기 08-23) · 완주하면 이 갈래가 진짜 게이트(사례 AND·⑥ 셀)로 돌아온다`);
} else {
  test('③ 결과 정본 — 기계 계약 0사유 · 비교축 7 일치 · 존재축 · 사례 단위 AND 통과(⑥ 셀 포함)', () => {
    const 결과 = 결과정본;
    const 시험지 = JSON.parse(fs.readFileSync(시험지경로, 'utf8'));
    const 전문 = fs.readFileSync(프롬프트경로, 'utf8');
    /* 판정 산술은 «결과한벌» 하나 — --판정·왕복시험 A7 과 같은 함수(각자 조립하다 A7 이
     * existsSync 로 얕아진 것이 심문 G2). model 의 원천은 env GENERATION_MODEL 뿐이라(② ·
     * 리터럴 0) env 없는 로컬·CI 에선 그 칸을 «못 잰다» — 조용히 통과로 접지 않고 비교에서
     * 뺐음을 여기 적는다(F296 · 0건이 아니다). --판정 도구는 env 필수라 거기서는 늘 잰다. */
    const 못잼 = String(process.env.GENERATION_MODEL || '').trim() ? [] : ['model'];
    const 판 = 평가.결과한벌({ 결과, 시험지, 전문, 현행: 현행판(), 비교제외: 못잼 });
    assert.deepEqual(판.무효사유, [], `결과 파일 무효(E2 — 한 행만 버리지 않는다): ${판.무효사유.slice(0, 5).join(' / ')}`);
    assert.deepEqual(판.다름, [], `옛 실행판의 결과다 — 다른 칸 ${판.다름.join(',')}(V6-23 · 옛 초록 재사용 차단)`);
    for (const k of 평가.존재축) assert.ok(String(결과.동봉[k] ?? '').trim(), `존재축 ${k} 가 비었다`);
    assert.ok(판.집.통과, `§8-B 미통과 — 축: ${평가.축키들.filter((k) => !판.집.축[k].통과).join(',') || '(전부 통과)'} · ⑥ 셀 미달: ${판.집.셀미달.join(',') || '없음'}`);
    assert.ok(판.한벌, `결과한벌 미성립 — ${판.사유}`);
  });
}

/* 결과한벌 변이 회귀 — 실물 정본(위 ③)이 어느 국면이든, «존재 ≠ 1벌»의 두 급소는 픽스처로 상시 잰다.
 * (심문 G2: A7 이 파일 존재만 재서 미채점 80 인 채 4/4 — 「운영 붓기 차단」 문구가 꺼져 있었다) */
test('결과한벌 — 미채점 ≥1행이면 한벌 false · 사유가 「깨짐」이 아니라 「미채점」을 앞세운다(비교축 어긋남보다도 먼저)', () => {
  if (!활성인가() || !정본있음) return;   // 실물 정본을 변이 재료로 쓴다(합성 시험지 조립 비용 0)
  const 시험지 = JSON.parse(fs.readFileSync(시험지경로, 'utf8'));
  const 전문 = fs.readFileSync(프롬프트경로, 'utf8');
  const 변이 = JSON.parse(JSON.stringify(결과정본));
  const 첫 = 변이.행.find((r) => r.grader_note === '미채점') || 변이.행[0];
  첫.grader_note = '미채점';
  변이.동봉.prompt_ver = '과제생성.v0+000000000000';   // 비교축도 함께 어긋내 순서를 잰다
  const 판 = 평가.결과한벌({ 결과: 변이, 시험지, 전문, 현행: 현행판() });
  assert.equal(판.한벌, false);
  assert.match(String(판.사유), /^미채점 \d+행/, '미채점의 집계 전멸을 「축 미달」·「옛 실행판」으로 말하면 안 쟀다가 깨졌다로 읽힌다');
});
test('결과한벌 — 비교축 하나만 달라도 한벌 false(옛 실행판 차단 · V6-23)', () => {
  if (!활성인가() || !정본있음) return;
  const 시험지 = JSON.parse(fs.readFileSync(시험지경로, 'utf8'));
  const 전문 = fs.readFileSync(프롬프트경로, 'utf8');
  const 변이 = JSON.parse(JSON.stringify(결과정본));
  for (const r of 변이.행) if (r.grader_note === '미채점') { r.grader_note = '픽스처 매김'; r.axis_scores = Object.fromEntries(평가.축키들.map((k) => [k, r.axis_scores[k] === null ? null : 1])); }
  변이.동봉.estimator_version = '학습자상태.v0';
  const 판 = 평가.결과한벌({ 결과: 변이, 시험지, 전문, 현행: { ...현행판(), estimator_version: '학습자상태.v999' }, 비교제외: 평가.비교축.filter((k) => k !== 'estimator_version') });
  assert.equal(판.한벌, false);
  assert.deepEqual(판.다름, ['estimator_version']);
  assert.match(String(판.사유), /옛 실행판/);
});
