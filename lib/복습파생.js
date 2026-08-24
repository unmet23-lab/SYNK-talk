'use strict';
/* 복습 파생층 — 사건·교정 «행»에서 리뷰 `{card_id, at, 정답, 확신도}` 를 조립한다
 *   (정본 = appsscript `docs/복습스케줄러_설계.md` §8 v0.3 · 08-24 명세 — 명세가 코드보다 먼저 섰다.
 *    계산기 쪽 계약 = `lib/복습스케줄.js` 머리말 「파생층이 낼 {card_id, at, 정답, 확신도} 를
 *    «인자»로 받는 데까지」 — 이 파일이 그 인자를 처음 만든다).
 *
 * ■ 순수 함수만 — DB 를 안 읽고 시계를 안 본다. 입력은 호출자가 든 «행»이고(§8 「행의 모양으로
 *   가른다」), 같은 행 집합이면 같은 리뷰 열이다(§8-8 인수 6).
 *
 * ■ 규칙 셋(§8-4) — R1 교정 실패 · R2 재제출 성공(retry_of_event_id — 🔴 `task_type='다시쓰기'`
 *   는 생산자 0 인 예약어라 식별자로 쓰면 영원히 0건이다) · R3 문항축(첫 실물 = G4 빈칸 `재는축`,
 *   심문 S1 「맞았다 신호 부재」의 첫 다리 — 계약 개정 0). 그 밖은 전부 «리뷰 아님»이고,
 *   버림은 갈래별로 세어 돌려준다(합계 = 갈래+갈래 · 유호 확정 08-14).
 *
 * ■ 미상은 리뷰가 아니다(§8-1 · 심문 S2) — 정답 boolean 을 «행만으로» 못 파생하면 안 보낸다.
 *   그래서 이 산출을 계산기에 넣으면 `버린수` 0 이 정상값이고, 0 이 아니면 이 파일의 결함이다.
 *
 * ■ 확정판 선별(§8-3)은 이 저장소의 «첫» 선별기다 — 실측(08-24) 지금까지 소비자 전부가
 *   `created_at desc limit 1` 이라 actor·supersedes 를 안 봤다(꼬리·deliver 의 사각 · 설계 §9
 *   곁 관찰). 같은 것이 필요해지는 소비자는 여기 `확정판` 을 빌린다 — 두 번 적으면 갈라진다.
 *
 * ■ 사본 0 — 판정 어휘는 전부 정본에서 빌린다: `채점`(서류관문 — «저장 판정 = 서버 재채점»
 *   선언의 첫 오프라인 소비자가 이 파일이다) · `G4스냅샷모양판`(게임스냅샷) · `VERDICT`(검수확정) ·
 *   `무오류표식`(꼬리). 여기 리터럴로 다시 적으면 그쪽이 오르는 날 조용히 갈라진다.
 */

const { 채점 } = require('./서류관문.js');
const { G4스냅샷모양판 } = require('./게임스냅샷.js');
const { VERDICT } = require('./검수확정.js');
const { 무오류표식 } = require('./꼬리.js');
/* S6 확정(유호 08-24 · §8 v0.4) — 카드 키는 표를 지난다: 대응 있는 태그는 skill_id, 나머지는
 * 태그 그대로(판정 ⓐ 「표가 서면 키만 갈아 끼운다」의 그 교체). 퀴즈·라디오의 skill 축은
 * 이제 «축없음»이 아니라 제 키 그대로 카드가 된다(아래 R3-퀴즈). */
const { 카드키 } = require('./태그기술표.js');

/* 카드 어휘의 정본 = 계약 파일 하나(§8-1 ① — 카드는 계약 오류태그 24종 − '오류없음').
 * 🔴 계약 밖 문자열은 카드가 아니다 — 리허설 실측(08-24 병행 첫 실행)에서 왕복 픽스처의
 *   헐거운 태그(「조사 오류」류)가 due 재료로 새는 것을 봤다. 여기서 걸러 세지 않으면
 *   그 문자열이 교체일에 재출제 지시로 그대로 올라간다. */
const 계약태그셋 = new Set(require('../계약/수집_교정_계약.json').오류태그);

/** 태그 배열이 «판정»인가 — 빈 배열·비문자열은 「판정 안 함」이다(꼬리 규율 그대로). */
function 유효태그들(값) {
  if (!Array.isArray(값) || 값.length === 0) return null;
  const 목록 = [...new Set(값.map((t) => String(t).trim()).filter(Boolean))];
  return 목록.length ? 목록 : null;
}

/**
 * 한 제출의 교정 행들 → 태그 축 «확정판» (§8-3). 고를 것이 없으면 null.
 *
 * 1) `supersedes` 로 대체된 행은 죽었다(재검수 Z 사슬).
 * 2) 태그판정 유효행만 — 빈 태그는 「판정 안 함」. 단 teacher 행은 태그가 비면 verdict 로
 *    해석한다: 「원문이 이미 맞다」→ `['오류없음']` 파생 · 「AI 교정이 맞다」→
 *    `reviewed_correction_id` 행의 태그 승계(골든 ①② 갈래가 태그를 «일부러» 비우는 자리다).
 * 3) 사람 우선, 그중 `created_at` 최신(동률은 correction_id 사전순 뒤쪽) — 🔴 «최신»만으로
 *    접지 않는다: ai 행이 사람 행 «뒤에» 설 수 있고(correct 의 중복 가드는 ai 행 존재만 본다)
 *    사람 판정은 AI 재채점으로 안 뒤집힌다.
 *
 * @param {Array<{correction_id, actor_kind, error_tags, verdict, reviewed_correction_id,
 *                supersedes, created_at}>} 교정행들  같은 submission 의 행 전부
 * @returns {string[]|null} 확정판 태그들(중복 제거) — `['오류없음']` 은 «오류 0» 판정이다
 */
function 확정판(교정행들) {
  if (!Array.isArray(교정행들) || 교정행들.length === 0) return null;
  const 대체됨 = new Set();
  const 별id = new Map();
  for (const 행 of 교정행들) {
    if (!행) continue;
    if (행.supersedes != null) 대체됨.add(String(행.supersedes));
    if (행.correction_id != null) 별id.set(String(행.correction_id), 행);
  }

  const 태그축 = (행) => {
    const 자기 = 유효태그들(행.error_tags);
    if (자기) return 자기;
    if (행.actor_kind !== 'teacher') return null;
    if (행.verdict === VERDICT.원문) return [무오류표식];
    if (행.verdict === VERDICT.AI) {
      const 원 = 행.reviewed_correction_id != null ? 별id.get(String(행.reviewed_correction_id)) : null;
      return 원 ? 유효태그들(원.error_tags) : null;
    }
    return null;   // 「고칠 곳이 있다」인데 태그가 비면 태그 축에선 판정 안 함이다
  };

  const 고르기 = (actor) => {
    const 산것 = [];
    for (const 행 of 교정행들) {
      if (!행 || 행.actor_kind !== actor) continue;
      if (행.correction_id != null && 대체됨.has(String(행.correction_id))) continue;
      const 태그들 = 태그축(행);
      const t = Date.parse(행.created_at);
      if (!태그들 || !Number.isFinite(t)) continue;
      산것.push({ 태그들, t, id: String(행.correction_id ?? '') });
    }
    // 오름차순 정렬 뒤 끝 원소 = 최신(동률은 correction_id 사전순 뒤쪽) — 입력 순서에 안 기댄다.
    산것.sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return 산것.length ? 산것[산것.length - 1].태그들 : null;
  };

  return 고르기('teacher') || 고르기('ai');
}

/* 시각이 «있나» — 없으면 그 후보는 리뷰가 못 된다(§8-1 ②). 계산기까지 가면 버린수가 오염되니
 * 여기서 끊는다(인수 5: 파생 산출은 계산기 버린수 0). */
const 시각있나 = (at) => Number.isFinite(Date.parse(at));

/** 확신도 정규화(§8-5) — 등급에 닿는 값은 'low'·'guess' 둘뿐, 그 밖은 null. */
function 확신도값(payload) {
  const c = payload && payload.confidence;
  return c === 'low' || c === 'guess' ? c : null;
}

/**
 * 사건×제출 조인 행 + 교정 행 → 리뷰 열 (§8-4 규칙 셋).
 *
 * @param {{행들?: Array<object>, 교정들?: Array<object>}} 입력
 *   행들  = { event_id, learner_id, event_type, occurred_at, retry_of_event_id?, payload?, skill_ids?,
 *            submission?: { submission_id, task_schema_ver, task_snapshot, body_original } }
 *   교정들 = corrections 행(§8-3 인자와 같음 + submission_id)
 * @returns {{리뷰들: Array<{learner_id, card_id, at, 정답, 확신도, 원천: {event_id, 규칙}}>,
 *           셈: {리뷰: object, 버림: object}}}
 *   리뷰들은 (learner, card, at, event) 사전순 — 입력 순서와 무관하게 같은 열이다.
 */
function 리뷰파생({ 행들, 교정들 } = {}) {
  const 행목록 = (Array.isArray(행들) ? 행들 : []).filter(Boolean);
  const 교정목록 = (Array.isArray(교정들) ? 교정들 : []).filter(Boolean);

  const 셈 = {
    리뷰: { 교정실패: 0, 재제출성공: 0, 문항축: 0, 퀴즈축: 0 },
    버림: { 축없음: 0, 미상: 0, 시각없음: 0, 회피: 0, 무오류: 0, 계약밖태그: 0, 교정판정없음: 0, 원천행없음: 0, 재제출대기: 0, 재제출원본미상: 0 },
  };
  const 리뷰들 = [];
  const 담기 = (행, card_id, at, 정답, 확신도, 규칙, 세는곳) => {
    리뷰들.push({ learner_id: 행.learner_id ?? null, card_id, at, 정답, 확신도, 원천: { event_id: 행.event_id ?? null, 규칙 } });
    셈.리뷰[세는곳] += 1;
  };

  // 색인 — 순회는 전부 정렬 키로 돈다(결정성 · 인수 6).
  const 제출별교정 = new Map();
  for (const c of 교정목록) {
    const sid = c.submission_id != null ? String(c.submission_id) : '';
    if (!sid) continue;
    if (!제출별교정.has(sid)) 제출별교정.set(sid, []);
    제출별교정.get(sid).push(c);
  }
  const 사건별행 = new Map();
  const 제출별행 = new Map();
  for (const r of 행목록) {
    if (r.event_id != null) 사건별행.set(String(r.event_id), r);
    const sid = r.submission && r.submission.submission_id != null ? String(r.submission.submission_id) : '';
    if (sid) 제출별행.set(sid, r);
  }
  const 확정판들 = new Map();
  for (const sid of [...제출별교정.keys()].sort()) 확정판들.set(sid, 확정판(제출별교정.get(sid)));
  const 사건정렬 = (모음) => [...모음].sort((a, b) => {
    const x = String(a.event_id ?? ''); const y = String(b.event_id ?? '');
    return x < y ? -1 : x > y ? 1 : 0;
  });

  /* R1 — 교정 실패: 확정판 태그 T(≠오류없음) 각각이 그 제출 시각의 실패 리뷰다. */
  for (const [sid, 태그들] of 확정판들) {
    if (!태그들) { 셈.버림.교정판정없음 += 1; continue; }
    const 행 = 제출별행.get(sid);
    if (!행) { 셈.버림.원천행없음 += 1; continue; }
    if (!시각있나(행.occurred_at)) { 셈.버림.시각없음 += 1; continue; }
    const 카드들 = [];
    for (const t of 태그들) {
      if (t === 무오류표식) continue;
      if (!계약태그셋.has(t)) { 셈.버림.계약밖태그 += 1; continue; }   // 계약 밖 문자열은 카드가 아니다(머리말)
      카드들.push(t);
    }
    if (!카드들.length) {
      if (태그들.every((t) => t === 무오류표식)) 셈.버림.무오류 += 1;   // «오류 0» 판정 — 리뷰 0 이 정상이다
      continue;   // 전부 계약 밖이면 위에서 이미 낱개로 세었다
    }
    for (const t of 카드들) 담기(행, 카드키(t), 행.occurred_at, false, null, 'R1', '교정실패');
  }

  /* R2 — 재제출 성공: retry 고리 양끝에 확정판이 서면, 사라진 태그가 성공이다.
   * 남아 있는 태그는 세지 않는다 — 그 실패는 R1 이 이미 접었다. */
  for (const s2 of 사건정렬(행목록.filter((x) => x.event_type === 'submission.created' && x.retry_of_event_id != null))) {
    const sid2 = s2.submission && s2.submission.submission_id != null ? String(s2.submission.submission_id) : '';
    const s2태그들 = sid2 ? 확정판들.get(sid2) : null;
    if (!s2태그들) { 셈.버림.재제출대기 += 1; continue; }    // 교정이 서는 날 재계산이 접는다(§8-2)
    const s1 = 사건별행.get(String(s2.retry_of_event_id));
    const sid1 = s1 && s1.submission && s1.submission.submission_id != null ? String(s1.submission.submission_id) : '';
    const s1태그들 = sid1 ? 확정판들.get(sid1) : null;
    if (!s1 || s1.event_type !== 'submission.created' || !s1태그들
      || (s1.learner_id != null && s2.learner_id != null && String(s1.learner_id) !== String(s2.learner_id))) {
      셈.버림.재제출원본미상 += 1; continue;
    }
    if (!시각있나(s2.occurred_at)) { 셈.버림.시각없음 += 1; continue; }
    const s2셋 = new Set(s2태그들);
    /* 계약 밖 태그는 조용히 건너뛴다(세지 않는다) — s₁ 의 확정판은 R1 순회가 이미 낱개로 세었다.
     * 비교는 태그 공간에서(교정끼리 같은 어휘), 카드는 표를 지나 낸다. */
    for (const t of s1태그들.filter((x) => x !== 무오류표식 && 계약태그셋.has(x) && !s2셋.has(x))) {
      담기(s2, 카드키(t), s2.occurred_at, true, null, 'R2', '재제출성공');
    }
  }

  /* R3 — 문항축: 첫 실물 = G4 빈칸(스냅샷의 `재는축` 이 곧 카드다 — 심문 S1 의 다리).
   * 라디오·앱 퀴즈는 skill 축이라 «축없음» — E2 표가 서는 날 ⓐ(키 교체)와 함께 합류한다. */
  for (const r of 사건정렬(행목록.filter((x) => x.event_type === 'quiz.answered'))) {
    if (r.payload && r.payload.skipped === true) { 셈.버림.회피 += 1; continue; }   // 회피는 기억 축의 벌점이 아니다(§8-4)
    const s = r.submission;
    const 빈칸 = s && s.task_schema_ver === G4스냅샷모양판 && s.task_snapshot ? s.task_snapshot.빈칸 : null;
    if (빈칸) {
      if (!시각있나(r.occurred_at)) { 셈.버림.시각없음 += 1; continue; }
      if (!계약태그셋.has(빈칸.재는축)) { 셈.버림.계약밖태그 += 1; continue; }   // 팩 규율 위반 방어 — 축이 계약 실명이어야 카드다
      const 판 = 채점(빈칸, s.body_original);
      if (!판 || 판.판정 === '모름') { 셈.버림.미상 += 1; continue; }   // 살아있는 이형태를 오답으로 굳히지 않는다(S2 갈래)
      // 카드는 언제나 `재는축`(표를 지나) — 맞음의 `오류태그`('오류없음')는 라벨이지 카드가 아니다.
      담기(r, 카드키(빈칸.재는축), r.occurred_at, 판.판정 === '맞음', 확신도값(r.payload), 'R3', '문항축');
      continue;
    }
    /* R3-퀴즈(S6 확정 뒤 합류 · §8 v0.4) — skill 축 문항(라디오·앱 퀴즈)의 정오가 카드가 된다.
     * 정오 파생은 승격요약과 같은 대조다: payload.selected_option ↔ 스냅샷 `정답`(option_id).
     * 어느 쪽이든 없으면 미상 — 지어내지 않는다(S2). 카드 키 = skill_id 그대로(제 어휘가 축이다). */
    const 기술들 = Array.isArray(r.skill_ids) ? r.skill_ids.map(String).filter(Boolean) : [];
    if (기술들.length) {
      if (!시각있나(r.occurred_at)) { 셈.버림.시각없음 += 1; continue; }
      const 정답 = s && s.task_snapshot && typeof s.task_snapshot.정답 === 'string' && s.task_snapshot.정답 ? s.task_snapshot.정답 : null;
      const 고른 = r.payload && typeof r.payload.selected_option === 'string' && r.payload.selected_option ? r.payload.selected_option : null;
      if (정답 == null || 고른 == null) { 셈.버림.미상 += 1; continue; }   // 선택없음·정답없음 — 승격요약의 그 갈래
      for (const k of 기술들) 담기(r, k, r.occurred_at, 고른 === 정답, 확신도값(r.payload), 'R3', '퀴즈축');
      continue;
    }
    셈.버림.축없음 += 1;   // 태그도 skill 도 없는 답 행(G2 무산출 등) — 카드가 설 자리가 없다
  }

  리뷰들.sort((a, b) => {
    const k = (x) => [String(x.learner_id ?? ''), String(x.card_id), String(x.at), String(x.원천.event_id ?? ''), x.원천.규칙].join(' ');
    const x = k(a); const y = k(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return { 리뷰들, 셈 };
}

module.exports = { 확정판, 리뷰파생 };
