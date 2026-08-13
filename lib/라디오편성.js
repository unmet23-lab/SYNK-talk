/* 라디오 편성 가중 — 엔진→라디오 «집단 되돌림»의 계산기 (설계 §4-5 · 유호 채택 2026-08-11)
 *
 * ■ 무엇을 해소하나
 *   철학정합 점검 실측 「되돌림 경로 0」 — 문항 회전이 재고(미노출 우선)뿐이라, 엔진이 쌓는
 *   이해가 방송 편성에 한 번도 돌아오지 않았다. 이 파일이 그 첫 경로다: 링크 학생 «집단»의
 *   skill 오답 분포가 라운드 문항 추첨을 기울인다.
 *
 * ■ 경계 (설계 §4-5 — 여기서 재론하지 않는다)
 *   · 입력부터 집단 합산만 받는다 — 개인 단위 입력 칸이 아예 없다(1:다 방송 · §3 철칙·§8).
 *   · 입력은 `learning_events` 승격 행의 요약이다 — 원장(radio.*) 직독이 아니라 엔진 산출의
 *     소비라 원칙 12(엔진 입력 통로 유일)와 방향이 다르다.
 *   · 추첨 자체(난수)는 여기 없다 — 라운드 생성기(`lib/라디오라운드.js`)가 이 가중으로 뽑는다.
 *     난수를 넣으면 회귀가 분포로만 잴 수 있고, 분포 검사는 플레이크다(그래서 그 파일도
 *     난수 대신 «씨앗 해시»로 뽑는다 — 결정적이라 회귀가 값으로 잰다).
 *
 * ■ 규칙 (v1 — 상수·창 길이는 P6 첫 2주 실측 뒤 재조정)
 *   ① 미노출 우선(재고 축)이 1차다 — 후보군 = 노출수가 최솟값인 문항들(같은 문항 반복 방지).
 *   ② 후보군 안에서 skill 가중 추첨 — w(skill) = 1 + 오답률(skill). 창 안 응답 5건 미만인
 *      skill 은 w=1(소표본 과보정 방지). 여러 skill 문항은 평균(한 skill 의 극단값이 문항
 *      하나를 독점하지 않게 — 최댓값으로 접으면 복합 문항이 항상 이긴다).
 *   ③ 28일 굴림창은 **호출부의 몫**이다 — 여기는 받은 요약을 그대로 믿는다(창을 여기서도
 *      자르면 같은 판정이 두 곳에 살고, 갈라진 날 증상이 없다).
 */
'use strict';

const 편성판 = 'radio-schedule.v1';

/** 소표본 하한 — 이 미만이면 오답률을 안 믿는다(w=1). P6 실측 뒤 재조정 자리. */
const 표본하한 = 5;

/** 굴림창 기본값(일) — 설계 §4-5. 상수는 P6 첫 2주 실측 뒤 재조정한다. */
const 창기본 = 28;
const 하루 = 86400000;

/** 이 되돌림이 먹는 통로는 하나뿐이다(§4-5 「입력 = `learning_events` 만」). */
const 퀴즈통로 = '라디오퀴즈';

/* ── 승격 행 → `가중표` 가 먹는 요약. 「오답」의 **생산자 판정**이 이 함수다. ────────────
 *
 * 🔑 **정오는 저장값이 아니라 파생값이다.** 승격 행에는 정오 칸이 아예 없다 — 계약이
 *   `is_correct` 를 막았고(C0), `radio-promote` 가 싣는 것은 «학생이 고른 것»뿐이다
 *   (`payload.selected_option`·`position`). 정답은 그 행의 제출 스냅샷에 있다
 *   (`submissions.task_snapshot.정답`). 그래서 오답률을 낼 수 있는 자리는 **두 칸을 맞대는
 *   여기 하나**고, 이 판정이 없으면 `가중표` 는 영원히 먹을 것이 없다.
 *   ⚠ 원장(radio.*) 직독이 아니다 — 둘 다 엔진 산출층이라 원칙 12 와 방향이 다르다(§4-5).
 *
 * 🔑 **못 가르는 행은 «응답»에도 안 넣는다.** 정답이 없거나 고른 값이 없는 행을 정답 쪽으로
 *   접으면 오답률이 조용히 낮아지고, 오답 쪽으로 접으면 높아진다 — 둘 다 편성을 기울이는
 *   방향이라 「모름」을 통과로 세지 않는다. 대신 **뺀 사유별 셈**을 같이 낸다(F207 — 초록은
 *   분모와 함께만 읽는다 · 승격기가 제외를 사유별로 세는 것과 같은 규약).
 *
 * 🔑 **창 자르기 기준시각은 부르는 쪽이 준다.** 여기서 현재 시각을 읽으면 회귀가 「돌린 날」에
 *   따라 갈리고, 갈리는 회귀는 다음 사람이 끈다.
 *
 * 재료 = 승격 행에 그 행의 제출 스냅샷을 붙인 것:
 *   { occurred_at, task_type, skill_ids: [], payload: { selected_option }, task_snapshot: { 정답 } }
 * 반환 = { 요약: { skill_id: {응답, 오답} }, 분모: { 받은, 센행, 뺀: {사유: n} } }
 *   — `요약` 을 그대로 `추첨가중({ 승격요약 })` 에 넣는다. */
function 승격요약(행들, 재료) {
  const { 기준시각, 창일수 = 창기본 } = 재료 || {};
  const 끝 = Date.parse(기준시각);
  if (!Number.isFinite(끝)) throw new TypeError('승격요약: 기준시각은 파싱 가능한 시각이어야 한다');
  const 시작 = 끝 - Number(창일수) * 하루;
  if (!Number.isFinite(시작)) throw new TypeError('승격요약: 창일수는 숫자여야 한다');

  const 받은 = Array.isArray(행들) ? 행들 : [];
  const 요약 = {};
  const 뺀 = {};
  const 빼기 = (사유) => { 뺀[사유] = (뺀[사유] || 0) + 1; };
  let 센행 = 0;

  for (const 행 of 받은) {
    if (!행 || typeof 행 !== 'object') { 빼기('행불량'); continue; }
    if (행.task_type !== 퀴즈통로) { 빼기('딴통로'); continue; }

    const 때 = Date.parse(행.occurred_at);
    if (!Number.isFinite(때)) { 빼기('시각불량'); continue; }
    /* 창은 (시작, 끝] — 미래 행은 시계 어긋남이라 세지 않는다(세면 창이 조용히 넓어진다). */
    if (때 > 끝 || 때 <= 시작) { 빼기('창밖'); continue; }

    const 고른 = 행.payload && 행.payload.selected_option;
    if (typeof 고른 !== 'string' || !고른) { 빼기('선택없음'); continue; }
    const 정답 = 행.task_snapshot && 행.task_snapshot.정답;
    if (typeof 정답 !== 'string' || !정답) { 빼기('정답없음'); continue; }

    const ids = Array.isArray(행.skill_ids) ? 행.skill_ids.filter((s) => typeof s === 'string' && s) : [];
    if (!ids.length) { 빼기('축없음'); continue; } // 축 없는 행은 어느 skill 도 못 기울인다

    센행 += 1;
    const 틀렸다 = 고른 !== 정답;
    /* 같은 축이 두 번 적힌 행이 분모를 두 배로 만들지 않게 — `문항가중` 이 평균으로 접는 것과
     * 같은 이유다(한 행이 한 축을 두 번 미는 자리를 안 만든다). */
    for (const id of new Set(ids)) {
      const 칸 = 요약[id] || (요약[id] = { 응답: 0, 오답: 0 });
      칸.응답 += 1;
      if (틀렸다) 칸.오답 += 1;
    }
  }

  return { 요약, 분모: { 받은: 받은.length, 센행, 뺀 } };
}

/* 승격요약 { skill_id: { 응답, 오답 } } → { skill_id: w }.
 * 응답이 하한 미만이거나 모양이 이상하면 w=1 — 지어내지 않고 중립으로 둔다. */
function 가중표(승격요약) {
  const 표 = {};
  for (const [skill, 셈] of Object.entries(승격요약 || {})) {
    const 응답 = Number(셈 && 셈.응답);
    const 오답 = Number(셈 && 셈.오답);
    if (!Number.isFinite(응답) || !Number.isFinite(오답) || 응답 < 표본하한 || 오답 < 0 || 오답 > 응답) {
      표[skill] = 1;
      continue;
    }
    표[skill] = 1 + 오답 / 응답;
  }
  return 표;
}

/* 문항 하나의 가중 — skill_ids 의 w 평균. 태그 없는 문항·모르는 skill 은 1(중립). */
function 문항가중(문항, 표) {
  const ids = Array.isArray(문항 && 문항.skill_ids) ? 문항.skill_ids : [];
  if (!ids.length) return 1;
  const 합 = ids.reduce((s, id) => s + (표[id] ?? 1), 0);
  return 합 / ids.length;
}

/* 문항 목록 → 추첨 가중 목록.
 * 재료 = { 문항들: [{문항id, skill_ids}], 노출수: {문항id: n}, 승격요약: {skill: {응답,오답}} }
 * 반환 = [{ 문항id, 노출수, 후보, 가중 }] — 후보(미노출 우선 최솟값 계층)만 가중 > 0. */
function 추첨가중(재료) {
  const { 문항들 = [], 노출수 = {}, 승격요약 = {} } = 재료 || {};
  if (!문항들.length) return [];
  const 표 = 가중표(승격요약);
  const 노출 = (q) => Number(노출수[q.문항id]) || 0;
  const 최소 = Math.min(...문항들.map(노출));
  return 문항들.map((q) => {
    const n = 노출(q);
    const 후보 = n === 최소;
    return { 문항id: q.문항id, 노출수: n, 후보, 가중: 후보 ? 문항가중(q, 표) : 0 };
  });
}

module.exports = { 편성판, 표본하한, 창기본, 퀴즈통로, 승격요약, 가중표, 문항가중, 추첨가중 };
