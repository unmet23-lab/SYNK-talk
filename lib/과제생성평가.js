/* 과제생성평가 — §8-B 생성 전용 평가셋의 «순수» 산술·계약 (설계 §8-B E1~E9 · §12-14·19 · 2026-08-22)
 *
 * ■ 무엇이 여기 사나 (벤더 0 · 파일 I/O 0 · 전부 결정적 — 같은 입력은 항상 같은 출력)
 *   · 배분 함수(E8)        — 그날 급수 분포 → 8칸(급수 3~6 × 상태 2)의 칸당 수. nᵢ = max(3, round(40·pᵢ)).
 *   · 시험지 조립(E4 절차) — 고정 가상 스냅샷 풀 → 40사례(풀 순서 그대로 · goal 유/무 20/20 ·
 *                            기술 층화 18×≥2 · 회전 시작점 열거 · 앵커 id) + 커버리지(급수×기술 72).
 *   · 결과 파일 기계 계약(E2·E9) — 행 키 여덟 · 축 키 여덟 · 0/1/null(⑦만 null) · grader_note 조건 ·
 *                            결속 3검사 · 일대일 3검사. 하나라도 어긋나면 «파일 전체 무효».
 *   · 집계(E4 실측 · 사례 단위 AND) — 두 회차를 사례로 묶어 축별 AND 를 먼저 파생 → «사례» 합 ÷ «사례»
 *                            유효 분모(⑦ = goal 있는 사례 · ⑧ = 40) · 축×급수 셀 · ⑥정확성 셀 미달 = 전체 미통과.
 *   · 차단기 비교축(E1·V6-23) — 비교 7 + 존재 2 + 기록 1 = 10칸 · 「활성」= prompts/과제생성.md 실재.
 *
 * ■ 두 정본을 만들지 않는다 — 회전은 lib/기술선택.js(정본 함수 그대로 호출 · 시작점은 결과값을
 *   파일에 박는다), 렌더·파서·지문은 lib/과제생성.js, 요약은 lib/과제요약.js, 해시는 lib/sha256.js.
 *   이 파일이 «새로» 정하는 것은 §8-B 가 명시한 산술·계약뿐이다(값·형식·원천이 설계에 없는 자리는
 *   v5.13-e 증보가 먼저 못박았다: 분포 재료 0 → 균등 · 해시는 시험지 파일 «밖» · 차단기 미실행 = todo).
 *
 * ■ 왜 순수로 떼나 — 시험지 생성기·실행기·채점기·차단기 회귀 «넷»이 같은 산술을 읽는다. 각자 적으면
 *   「두 회차 모두 통과해야 1점」이 어느 한 곳에서 평균으로 새고(E4 실측의 거짓 초록), 그 갈림은 초록 밑으로
 *   다닌다. 한 함수가 내고 넷이 부른다. */
'use strict';

const { hex } = require('./sha256.js');
const { 기술선택 } = require('./기술선택.js');
const { 과제요약 } = require('./과제요약.js');
const { 렌더, 생성응답읽기 } = require('./과제생성.js');

/* ── 상수(§8-B 명문 · 값을 바꾸면 채점표 판이 오른다) ─────────────────────── */
const 총사례 = 40;                       // 표본 N(안전선 — 검정력 계산이 아니다)
const 칸당최소 = 3;                      // E5-ⓐ 「칸당 최소 3」
const 회차수 = 2;                        // 갈래당 생성 2회 — 1회는 표본이 아니다
const 급수들 = Object.freeze(['Lv3', 'Lv4', 'Lv5', 'Lv6']);      // 초급(Lv1·2)은 §7-1 로 대상 밖
const 상태갈래들 = Object.freeze(['표본적음', '표본풍부']);       // 쓸축수 1~2 · 3+
const 축키들 = Object.freeze([               // E9 기계 이름 ①~⑧ 순
  'connect', 'answerable', 'level_fit', 'fresh', 'fun', 'accuracy', 'goal_use', 'state_use',
]);
const 통과선 = Object.freeze({              // §8-B 「통과선」 — 축별 각각(합산 금지 · ⑦은 여기 없다 ↓)
  connect: 0.9, answerable: 0.9, level_fit: 0.9, fresh: 0.8, fun: 0.7, accuracy: 0.95, state_use: 0.7,
});
/* 🔴 채점표 v2(2026-08-25 · 유호 확정) — ⑦은 «비율 축»이 아니다.
 *   v1 은 ⑦을 「목표를 활용했나」로 묻고 통과선 0.7 을 걸었다. 그런데 프롬프트는 정반대를 명령한다 —
 *   「학생의 목표는 **서너 번에 한 번만** 소재로 쓴다(매번 쓰면 뻔해진다)」. 즉 v1 의 ⑦은
 *   **프롬프트를 지킨 산출을 떨어뜨리는 축**이었다(1/4 를 지키면 0.25 → 0.7 미달).
 *   유호님 2회전 전수 채점이 그 자리를 실물로 드러냈다 — 0.55 · 「목표 채점은 제대로 못 했다」.
 *   ⇒ 둘을 바꾼다: ①질문을 «주관»에서 «사실»로 — 「잘 활용했나」가 아니라 **「목표를 소재로 썼나」**
 *   (예/아니오라 채점자가 흔들리지 않는다) ②판정을 «사례별 비율»에서 **«표본 전체의 절제 구간»**으로.
 *   구간 = 목표 있는 사례 20 중 **3~10**(15%~50%). 아래로 새면 「목표를 통째로 무시」(v5.4 F2 가
 *   막으려던 그 구멍 — 철학 ① 게이트가 이 축 하나에 걸려 있다), 위로 새면 「매번 남발」.
 *   ⚠ 그래서 ⑦만 **사례 단위 AND 가 아니라 OR**다 — 「이 사례가 목표를 썼나」는 두 산출 중
 *   하나만 써도 참이다. AND 로 세면 절제 자체가 미사용으로 읽힌다(E4 규율의 유일한 예외 · 명문). */
const 절제구간 = Object.freeze({ 최소: 3, 최대: 10 });
const 구간축 = 'goal_use';
/** 화면·CLI 가 「통과선」 칸에 찍을 문자열 — ⑦만 구간이라 수 하나로 못 찍는다. */
const 통과선표기 = (k) => (k === 구간축 ? `${절제구간.최소}~${절제구간.최대}건` : String(통과선[k]));
const null허용축 = 'goal_use';               // null 은 «분모에서 뺀다» 하나뿐 · ⑦에만
const 셀판정축 = 'accuracy';                 // V6-26 — 한 급수라도 ⑥ 미달이면 전체 미통과
const 사람축 = Object.freeze(['fun', 'goal_use', 'state_use']);   // ⑤⑦⑧ 사람 · 나머지 AI 초벌+사람 확정
const 행키들 = Object.freeze([               // E2 행 키 집합 정확히 여덟
  'case_id', 'axis_scores', 'grader_note', 'sentence', 'question', 'raw_response', 'raw_response_hash', 'input_hash',
]);
/* 차단기 10칸(E1·V6-23·E2·E1) — 비교 7 + 존재 2 + 기록 1. 이 목록이 §12-21 기계 대조의 구현 쪽 정본. */
const 비교축 = Object.freeze(['model', 'prompt_ver', 'skill_taxonomy_ver', 'estimator_version', '시험지_해시', '채점표_판', 'quality_ver']);
const 존재축 = Object.freeze(['채점자', '시각']);
const 기록축 = Object.freeze(['policy_ver']);
const 채점표판 = '채점표.v2';   // v2 = ⑦ 재정의(사실 판정 + 절제 구간 · 유호 확정 08-25)
const 시험지판 = '시험지.v1';

/* ⑤ 재미 축 앵커(§8-B v5.6 H1 · v5.7 E6 — 채점표 판의 일부 · anchor_id 로 고정 · 바뀌면 판이 오른다).
 * 채점자 질문(v5.13 ⓔ-21): 「이 문장을 받고 내일 또 열고 싶은가」. 사례는 «대조용»이지 정답 문장이 아니다. */
const 앵커 = Object.freeze({
  채점자질문: '이 문장을 받고 내일 또 열고 싶은가 — 답하고 싶어지는 질문인가',
  '0점조건': Object.freeze([
    { anchor_id: 'Z1', 조건: 'ⓐ 답이 하나로 정해지는 질문(예/아니오·사실 확인)', sentence: '오늘은 금요일이에요.', question: '오늘이 금요일이에요?' },
    { anchor_id: 'Z2', 조건: 'ⓑ 교과서 예문투 — 사람에게 안 묻는 말', sentence: '저는 취미가 독서입니다.', question: '당신의 취미는 무엇입니까?' },
    { anchor_id: 'Z3', 조건: 'ⓒ 문장과 무관한 질문 — 그래서 답할 마음이 안 든다', sentence: '주말에 친구하고 영화를 봤어요.', question: '한국어 공부는 언제 시작했어요?' },
  ]),
  '1점앵커': Object.freeze([
    { anchor_id: 'A1', 기준: 'ⓐ 자기 경험을 부르는 질문', sentence: '어제 저녁에 엄마하고 만두를 빚었어요.', question: '요즘 집에서 같이 만든 음식이 있어요?' },
    { anchor_id: 'A2', 기준: 'ⓑ 선택·비교를 요구해 답이 갈리는 질문', sentence: '겨울에는 따뜻한 차를 마시는 게 제일 좋아요.', question: '추운 날에는 차하고 커피 중에 뭐가 더 좋아요?' },
    { anchor_id: 'A3', 기준: 'ⓒ 그 학생의 맥락(목표·상태)이 들어가 «나한테 하는 말»로 읽히는 질문', sentence: '시험 전날에는 일찍 자려고 해요.', question: '시험 공부할 때 밤에 하는 편이에요, 아침에 하는 편이에요?' },
  ]),
  중간사례기준: 'ⓐ 앵커·0점 조건과 대조해 가까운 쪽으로 ⓑ 판단이 안 서면 0(게이트는 의심스러우면 막는다) ⓒ 그 사실을 grader_note 에 적는다(다음 판 앵커 후보)',
});

const 칸키 = (급수, 상태) => `${급수}·${상태}`;

/* ── E8 배분 함수(결정적) ──────────────────────────────────────────────────── */
/**
 * 급수 분포 → 8칸 칸당 수. 재료 = 그날 정본 실행 행의 level_distribution(키 Lv1~Lv6·null).
 * pᵢ 분모는 대상 급수(Lv3~6)의 합 — 초급·null 은 대상 밖이라 비율에서 뺀다.
 * 🔴 v5.13-e: 재료가 없거나 대상 합이 0(학생 0명 · 첫 시험지)이면 pᵢ = 1/4 균등.
 * @returns {{칸당: Record<string, number>, 급수당: Record<string, number>, 비율: Record<string, number>, 균등: boolean}}
 */
function 배분(분포) {
  const 합 = 급수들.reduce((s, l) => s + (Number(분포 && 분포[l]) || 0), 0);
  const 균등 = !(합 > 0);
  const 비율 = {};
  for (const l of 급수들) 비율[l] = 균등 ? 0.25 : (Number(분포[l]) || 0) / 합;
  const 급수당 = {};
  for (const l of 급수들) 급수당[l] = Math.max(칸당최소, Math.round(총사례 * 비율[l]));
  /* 합 보정 — 가장 큰 칸부터(동률이면 낮은 급수부터) 1씩 깎거나 더한다. */
  let 차 = 총사례 - 급수들.reduce((s, l) => s + 급수당[l], 0);
  while (차 !== 0) {
    const 큰 = [...급수들].sort((a, b) => 급수당[b] - 급수당[a] || 급수들.indexOf(a) - 급수들.indexOf(b))[0];
    급수당[큰] += 차 > 0 ? 1 : -1;
    차 += 차 > 0 ? -1 : 1;
  }
  const 칸당 = {};
  for (const l of 급수들) {
    칸당[칸키(l, '표본적음')] = Math.ceil(급수당[l] / 2);    // 홀수는 표본적음 쪽 +1
    칸당[칸키(l, '표본풍부')] = Math.floor(급수당[l] / 2);
  }
  return { 칸당, 급수당, 비율, 균등 };
}

/* ── 스냅샷 → 상태 객체(과제요약 입력) ─────────────────────────────────────── */
const 상태객체 = (스냅) => ({
  estimator_version: 스냅.estimator_version ?? 'pool',
  estimator_confidence: 스냅.estimator_confidence ?? 0,
  evidence_refs: 스냅.evidence_refs ?? { as_of: null, 사건: [], 창일수: null },
  축: 스냅.축,
});

/* ── E4 시험지 조립 ────────────────────────────────────────────────────────── */
/**
 * @param {{사례: object[]}} 풀  evals/과제생성_스냅샷풀.json — 각 사례 {pool_id, level, 상태갈래, learner_id,
 *   goal_candidate, estimator_confidence, evidence_refs, 축}. 풀 순서가 곧 채우는 순서(무작위 0).
 * @param {Record<string, number>|null} 분포  level_distribution(없으면 균등)
 * @param {{기술후보: Array<{skill_id:string,label_ko:string}>, 앵커: object, 기준일: string}} 재료
 *   기술후보 = engine.skills domain='grammar' 18행(skill_id 오름차순은 기술선택이 다시 건다)
 * @returns {object} 시험지(파일에 그대로 쓴다 — 해시는 파일 밖)
 */
function 시험지조립(풀, 분포, 재료) {
  const { 기술후보, 앵커, 기준일 } = 재료;
  if (!Array.isArray(풀 && 풀.사례) || !풀.사례.length) throw new TypeError('시험지조립: 풀이 비었다');
  if (!Array.isArray(기술후보) || 기술후보.length !== 18) {
    throw new TypeError(`시험지조립: 기술 후보는 grammar 18행이어야 한다(§6-0 v5.3-a) — ${기술후보 && 기술후보.length}`);
  }
  const 배 = 배분(분포);
  const 라벨 = new Map(기술후보.map((s) => [s.skill_id, s.label_ko]));

  /* ① 칸 배정 — 풀 배열 순서 그대로, 칸당 수만큼. 모자라면 예외(조용히 작은 시험지를 안 만든다). */
  const 사례 = [];
  const 칸순서 = [];
  for (const l of 급수들) for (const s of 상태갈래들) 칸순서.push([l, s]);
  for (const [l, s] of 칸순서) {
    const 필요 = 배.칸당[칸키(l, s)];
    const 후보 = 풀.사례.filter((p) => p.level === l && p.상태갈래 === s);
    if (후보.length < 필요) throw new Error(`시험지조립: 풀의 ${칸키(l, s)} 칸이 ${후보.length}벌뿐 — ${필요} 필요(풀은 추가만 한다)`);
    후보.slice(0, 필요).forEach((p) => 사례.push({ ...p, 칸: 칸키(l, s) }));
  }
  if (사례.length !== 총사례) throw new Error(`시험지조립: 사례 수 ${사례.length} ≠ ${총사례}`);

  /* ② goal 유/무 — 칸 안에서 ⌈n/2⌉·⌊n/2⌋ 를 칸끼리 번갈아(홀수 칸 = 있음이 많은 쪽) · 전체 20/20 보정은 마지막 칸에서. */
  let 있음총 = 0;
  const 칸별있음 = {};
  칸순서.forEach(([l, s], i) => {
    const n = 배.칸당[칸키(l, s)];
    칸별있음[칸키(l, s)] = i % 2 === 0 ? Math.ceil(n / 2) : Math.floor(n / 2);
    있음총 += 칸별있음[칸키(l, s)];
  });
  const 마지막 = 칸키(...칸순서[칸순서.length - 1]);
  const 보정 = 총사례 / 2 - 있음총;
  칸별있음[마지막] += 보정;
  if (칸별있음[마지막] < 0 || 칸별있음[마지막] > 배.칸당[마지막]) throw new Error('시험지조립: goal 20/20 보정이 마지막 칸 범위를 넘었다');
  const 칸안순번 = {};
  for (const c of 사례) {
    칸안순번[c.칸] = (칸안순번[c.칸] ?? 0) + 1;
    c.goal = 칸안순번[c.칸] <= 칸별있음[c.칸] ? (c.goal_candidate ?? null) : null;
    if (칸안순번[c.칸] <= 칸별있음[c.칸] && !c.goal) throw new Error(`시험지조립: goal 있음 자리인데 풀 사례 ${c.pool_id} 에 goal_candidate 가 없다`);
  }

  /* ③ 기술 층화 — 정본 회전(기술선택) 그대로 · 시작점은 «assign_date 를 골라» 맞추고 결과를 파일에 적는다.
   *    목표: 18기술 각각 ≥2회 + 같은 기술은 서로 다른 급수 칸(못 서면 같은 칸 허용 + 보고).
   *    탐욕(결정적): 사례 순서대로 기준일+k(k=0..59) 중 «덜 채워진 기술·새 급수»를 가장 잘 채우는 날짜 — 동률은 작은 k. */
  const 횟수 = new Map(기술후보.map((s) => [s.skill_id, 0]));
  const 급수집합 = new Map(기술후보.map((s) => [s.skill_id, new Set()]));
  const 날짜 = (k) => {
    const d = new Date(`${기준일}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + k);
    return d.toISOString().slice(0, 10);
  };
  for (const c of 사례) {
    let 최선 = null;
    for (let k = 0; k < 60; k += 1) {
      const r = 기술선택({ learner_id: c.learner_id, assign_date: 날짜(k), 후보: 기술후보, 최근겨냥: [] });
      const 점수 = r.skill_ids.reduce((s, id) => s
        + (횟수.get(id) < 2 ? 2 : 0)
        + (급수집합.get(id).has(c.level) ? 0 : 1), 0);
      if (!최선 || 점수 > 최선.점수) 최선 = { 점수, k, ...r };
    }
    c.assign_date = 날짜(최선.k);
    c.skill_ids = 최선.skill_ids;
    c.회전시작위치 = 최선.시작위치;
    c.기술들 = 최선.skill_ids.map((id) => 라벨.get(id));
    for (const id of 최선.skill_ids) { 횟수.set(id, 횟수.get(id) + 1); 급수집합.get(id).add(c.level); }
  }

  /* ④ 층화·커버리지 보고 — 급수 4 × 기술 18 = 72 조합 중 채점 앞에 선 것 · 안 선 목록. */
  const 선조합 = new Set();
  for (const c of 사례) for (const id of c.skill_ids) 선조합.add(`${c.level}|${id}`);
  const 안선 = [];
  for (const l of 급수들) for (const s of 기술후보) if (!선조합.has(`${l}|${s.skill_id}`)) 안선.push(`${l}|${s.skill_id}`);
  const 층화 = 기술후보.map((s) => ({ skill_id: s.skill_id, 횟수: 횟수.get(s.skill_id), 급수칸: [...급수집합.get(s.skill_id)].sort() }));
  const 층화미달 = 층화.filter((x) => x.횟수 < 2).map((x) => x.skill_id);
  const 같은칸만 = 층화.filter((x) => x.급수칸.length < 2).map((x) => x.skill_id);

  /* ⑤ 사례 정규화 — 파일에 박히는 칸만(풀의 도우미 칸 제거) · case_base_id = pool_id. */
  const 사례들 = 사례.map((c) => ({
    case_base_id: c.pool_id, 칸: c.칸, level: c.level, 상태갈래: c.상태갈래,
    learner_id: c.learner_id, assign_date: c.assign_date,
    goal: c.goal, skill_ids: c.skill_ids, 기술들: c.기술들, 회전시작위치: c.회전시작위치,
    snapshot: { estimator_confidence: c.estimator_confidence, evidence_refs: c.evidence_refs, 축: c.축 },
  }));
  const goal있음 = 사례들.filter((c) => c.goal != null).length;
  if (goal있음 !== 총사례 / 2) throw new Error(`시험지조립: goal 유/무 ${goal있음}/${총사례 - goal있음} ≠ 20/20`);

  return {
    판: 시험지판, 절차: '§8-B E4(풀 순서·칸 배정·회전 시작점 열거·goal 번갈아) · E8 배분 · v5.13-e(분포 0 → 균등)',
    해시: '이 파일 «전체»의 SHA-256(UTF-8 · 소문자 hex) — 순환을 피해 파일 안에는 적지 않는다. 결과 파일 동봉 칸 시험지_해시 가 든다.',
    배분재료: { 분포: 분포 ?? null, 균등: 배.균등, 비율: 배.비율, 급수당: 배.급수당, 칸당: 배.칸당 },
    goal유무: { 있음: goal있음, 없음: 총사례 - goal있음, 칸별있음 },
    층화: { 기술: 층화, 미달: 층화미달, 같은칸만 },
    커버리지: { 선조합: 선조합.size, 전체: 급수들.length * 기술후보.length, 안선목록: 안선 },
    채점표_판: 채점표판, 통과선, 절제구간, 앵커,
    사례: 사례들,
  };
}

/* ── 렌더·해시(결속 ③ 재료 — 실행기와 차단기가 같은 함수) ─────────────────── */
/** 한 사례의 렌더된 요청 본문(= generation_input_text · §11-2) — 요약은 과제요약 산출 그대로. */
function 사례본문(전문, 사례) {
  const 요 = 과제요약(상태객체(사례.snapshot), { 목표: 사례.goal, 급수: 사례.level });
  const 본문 = 렌더(전문, { 요약: 요.요약, 기술들: 사례.기술들 });
  if (본문 == null) throw new Error('사례본문: 프롬프트 템플릿 펜스를 못 찾았다');
  return { 본문, 쓸축수: 요.쓸축수, axes_used: 요.axes_used };
}
const input_hash = (본문) => hex(String(본문));
const 응답해시 = (원문) => hex(String(원문));
const case_id = (base, 회차) => `${base}#${회차}`;

/* ── E2·E9 결과 파일 기계 계약 ─────────────────────────────────────────────── */
const hex64 = /^[0-9a-f]{64}$/;
/**
 * 결과 파일 «전체» 유효성 — 하나라도 어긋나면 무효(사유 목록 전부 반환 · 한 행만 버리지 않는다).
 * @param {object} 결과  {동봉:{…10칸}, 행:[…]}  @param {object} 시험지  @param {string} 전문  prompts/과제생성.md 원문
 * @returns {string[]} 무효 사유(빈 배열 = 유효)
 */
function 결과검증(결과, 시험지, 전문) {
  const 사유 = [];
  if (!결과 || typeof 결과 !== 'object') return ['결과가 객체가 아니다'];
  const 동봉 = 결과.동봉 || {};
  for (const k of [...비교축, ...존재축, ...기록축]) {
    if (동봉[k] === undefined || 동봉[k] === null || 동봉[k] === '') 사유.push(`동봉 칸 비었다: ${k}`);
  }
  const 행들 = Array.isArray(결과.행) ? 결과.행 : null;
  if (!행들) return [...사유, '행 배열이 없다'];
  const 기대 = new Set(시험지.사례.flatMap((c) => [1, 2].map((r) => case_id(c.case_base_id, r))));
  const 본 = new Map();
  행들.forEach((행, i) => {
    if (!행 || typeof 행 !== 'object') { 사유.push(`행 ${i}: 객체가 아니다`); return; }
    const 키 = Object.keys(행).sort();
    if (키.join(',') !== [...행키들].sort().join(',')) 사유.push(`행 ${i}: 키 집합이 여덟과 다르다(${키.join(',')})`);
    if (typeof 행.case_id !== 'string' || !/^.+#[12]$/.test(행.case_id)) 사유.push(`행 ${i}: case_id 형식(<스냅샷 id>#<1|2>) 위반`);
    for (const k of ['grader_note', 'sentence', 'question', 'raw_response']) if (typeof 행[k] !== 'string') 사유.push(`행 ${i}: ${k} 문자열 아님`);
    for (const k of ['raw_response_hash', 'input_hash']) if (!hex64.test(String(행[k]))) 사유.push(`행 ${i}: ${k} 소문자 hex 64 아님`);
    const s = 행.axis_scores;
    if (!s || typeof s !== 'object' || Array.isArray(s)) 사유.push(`행 ${i}: axis_scores 객체 아님`);
    else {
      const 축 = Object.keys(s).sort();
      if (축.join(',') !== [...축키들].sort().join(',')) 사유.push(`행 ${i}: axis_scores 키가 여덟 기계 이름과 다르다(${축.join(',')})`);
      for (const k of 축키들) {
        const v = s[k];
        if (v === null) { if (k !== null허용축) 사유.push(`행 ${i}: ${k} 에 null — null 은 ⑦(goal_use)에만`); }
        else if (v !== 0 && v !== 1) 사유.push(`행 ${i}: ${k} 값 ${JSON.stringify(v)} — 0·1·null 뿐`);
      }
      /* ⑦(구간축)의 0 은 «흠»이 아니라 «절제»라 이유를 안 묻는다 — 채점표 v2.
        * v1 에서는 ⑦=0 이 미달이라 이유가 필수였는데, v2 의 ⑦=0 은 「이 사례는 목표를 안 썼다」는
        * 사실 기록이고 그게 정상이다(서너 번에 한 번 규율). 여기서 안 빼면 정상 산출 열몇 건마다
        * 사람이 「안 썼음」을 손으로 적어야 한다 — 손을 늘리는 계약은 곧 안 지켜진다. */
      if (축키들.some((k) => k !== 구간축 && s[k] === 0) && !(typeof 행.grader_note === 'string' && 행.grader_note.trim())) sayNote(i);
    }
    if (typeof 행.case_id === 'string') {
      if (본.has(행.case_id)) 사유.push(`중복 case_id: ${행.case_id}`);
      본.set(행.case_id, 행);
    }
  });
  function sayNote(i) { 사유.push(`행 ${i}: 0점 축이 있는데 grader_note 가 비었다`); }
  /* 일대일 3검사(F1 뒷단) — 집합 동일 · 중복 0(위) · 사례마다 정확히 2회차. */
  for (const id of 기대) if (!본.has(id)) 사유.push(`기대 case_id 누락: ${id}`);
  for (const id of 본.keys()) if (!기대.has(id)) 사유.push(`시험지에 없는 case_id: ${id}`);
  /* 결속 3검사(E2) — 파일 안에서 재계산·대조. */
  const 사례맵 = new Map(시험지.사례.map((c) => [c.case_base_id, c]));
  for (const [id, 행] of 본) {
    const base = id.replace(/#[12]$/, '');
    if (typeof 행.raw_response === 'string' && 응답해시(행.raw_response) !== 행.raw_response_hash) 사유.push(`${id}: raw_response_hash ≠ sha256(raw_response)`);
    if (typeof 행.raw_response === 'string') {
      let 봉투 = null;
      try { 봉투 = JSON.parse(행.raw_response); } catch { /* 파싱 불가 — 아래 읽기가 응답파손을 낸다 */ }
      const 읽 = 생성응답읽기(봉투);
      const 기대문장 = 읽.값 ? 읽.값.sentence : '';
      const 기대질문 = 읽.값 ? 읽.값.question : '';
      if (행.sentence !== 기대문장 || 행.question !== 기대질문) 사유.push(`${id}: sentence·question 이 같은 파서 산출과 다르다`);
    }
    const c = 사례맵.get(base);
    if (c && 전문) {
      const { 본문 } = 사례본문(전문, c);
      if (input_hash(본문) !== 행.input_hash) 사유.push(`${id}: input_hash ≠ 렌더된 요청 본문 해시`);
    }
  }
  return 사유;
}

/* ── E4 실측 — 사례 단위 AND 집계 ─────────────────────────────────────────── */
/**
 * @returns {{축: Record<string,{합:number,분모:number,비율:number|null,통과:boolean}>, 셀: object, 셀미달:string[], 통과:boolean}}
 * 축 비율 = (두 회차 모두 1인 사례 수) ÷ (유효 분모 — null 인 회차가 하나라도 있으면 분모 밖 · ⑦만 가능).
 * 호출 실패·누락 출력은 0점(재시도 0) — 결과 파일이 그 행을 0 으로 들고 온다(분모에서 안 뺀다).
 */
function 집계(결과, 시험지) {
  const 행맵 = new Map((결과.행 || []).map((r) => [r.case_id, r]));
  const 축 = {};
  const 셀 = {};
  for (const k of 축키들) { 축[k] = { 합: 0, 분모: 0, 비율: null, 통과: false }; 셀[k] = {}; for (const l of 급수들) 셀[k][l] = { 합: 0, 분모: 0 }; }
  for (const c of 시험지.사례) {
    const r1 = 행맵.get(case_id(c.case_base_id, 1)), r2 = 행맵.get(case_id(c.case_base_id, 2));
    for (const k of 축키들) {
      const v1 = r1 ? r1.axis_scores[k] : 0, v2 = r2 ? r2.axis_scores[k] : 0;   // 누락 회차 = 0점
      if (v1 === null || v2 === null) continue;                                   // ⑦ 분모에서 뺀다
      const 점 = (k === 구간축)
        ? ((v1 === 1 || v2 === 1) ? 1 : 0)      // ⑦ = 「이 사례가 목표를 썼나」 — 하나만 써도 쓴 것(OR)
        : ((v1 === 1 && v2 === 1) ? 1 : 0);     // 나머지 = 둘 다 통과해야 1(평균 아님)
      축[k].합 += 점; 축[k].분모 += 1;
      셀[k][c.level].합 += 점; 셀[k][c.level].분모 += 1;
    }
  }
  for (const k of 축키들) {
    축[k].비율 = 축[k].분모 ? 축[k].합 / 축[k].분모 : null;
    /* ⑦ 분모 0 = «안 쟀다»(미달이 아니다). 그래도 통과는 false 다 — 안 잰 축을 통과로 접으면
     * F207(미실행 ≠ 통과)이 무너진다. 대신 «안잼» 표식을 달아 화면·CLI 가 그렇게 말하게 한다. */
    축[k].안잼 = (k === 구간축) && 축[k].분모 === 0;
    축[k].통과 = (k === 구간축)
      ? (축[k].분모 > 0 && 축[k].합 >= 절제구간.최소 && 축[k].합 <= 절제구간.최대)
      : (축[k].비율 !== null && 축[k].비율 >= 통과선[k]);
  }
  const 셀미달 = 급수들.filter((l) => {
    const s = 셀[셀판정축][l];
    return s.분모 > 0 && s.합 / s.분모 < 통과선[셀판정축];
  });
  const 통과 = 축키들.every((k) => 축[k].통과) && 셀미달.length === 0;
  return { 축, 셀, 셀미달, 통과 };
}

/* ── 차단기 — 현행 판과 결과 동봉의 비교(E1 · V6-23) ─────────────────────── */
/** @returns {string[]} 다른 비교축 목록(빈 배열 = 같은 실행판의 결과) */
function 비교축차이(동봉, 현행) {
  return 비교축.filter((k) => String(동봉 && 동봉[k]) !== String(현행 && 현행[k]));
}

/* ── §16-1 #6 「§8-B 결과 1벌」 판정 — 소비자 셋이 «이 함수 하나»를 읽는다 ──
 * (차단기 tests/과제생성게이트.test.js ③ · 채점 CLI --판정 · 생성왕복시험 A7 n/4)
 * «1벌»의 정의(§16-1 #6 + v5.13-e 「정본 경로엔 채점 끝난 파일만」): 채점 완주(미채점 0) ·
 * 기계 계약 0사유 · 비교축 현행 일치 · 사례 단위 AND 집계 통과 — 전부여야 선다.
 * 파일 «존재»만으로 세면 미채점 80 인 채 4/4 가 되어 「운영 붓기 차단」 문구가 꺼진다
 * (심문 0822 G2 실측 — F207 「미실행」과 「통과」가 같은 얼굴). */
/**
 * @param {{결과: object, 시험지: object, 전문: string, 현행: object, 비교제외?: string[]}} p
 *   비교제외 = 그 자리에서 «못 재는» 칸(예: env GENERATION_MODEL 없는 로컬·CI 의 model) —
 *   조용히 통과로 접는 게 아니라 호출자가 뺐음을 스스로 말한다(F296).
 * @returns {{한벌: boolean, 사유: string|null, 미채점: number, 무효사유: string[], 다름: string[], 집: object}}
 *   사유 = 첫 어긋남 한 줄. 순서는 미채점 → 계약 → 비교축 → 집계 — 미채점을 앞세우는 이유는
 *   그때의 집계 전멸이 「깨졌다」가 아니라 「아직 안 쟀다」이기 때문이다(차단기 todo 와 같은 가름).
 */
function 결과한벌({ 결과, 시험지, 전문, 현행, 비교제외 = [] }) {
  const 미채점 = (결과 && Array.isArray(결과.행) ? 결과.행 : [])
    .filter((r) => r && r.grader_note === '미채점').length;
  const 무효사유 = 결과검증(결과, 시험지, 전문);
  const 다름 = 비교축차이(결과 && 결과.동봉, 현행).filter((k) => !비교제외.includes(k));
  const 집 = 집계(결과 && 결과.행 ? 결과 : { 행: [] }, 시험지);
  const 사유 = 미채점 ? `미채점 ${미채점}행 — 채점 완주가 남았다(#6 유호님 몫)`
    : 무효사유.length ? `기계 계약 무효 ${무효사유.length}건(첫: ${무효사유[0]})`
      : 다름.length ? `옛 실행판의 결과 — 다른 칸 ${다름.join(',')}`
        : !집.통과 ? `축 미달 ${축키들.filter((k) => !집.축[k].통과).join(',') || '(축은 통과)'}${집.셀미달.length ? ` · ⑥셀 ${집.셀미달.join(',')}` : ''}`
          : null;
  return { 한벌: !사유, 사유, 미채점, 무효사유, 다름, 집 };
}

module.exports = {
  총사례, 칸당최소, 회차수, 급수들, 상태갈래들, 축키들, 통과선, 절제구간, 구간축, 통과선표기, null허용축, 셀판정축, 사람축,
  행키들, 비교축, 존재축, 기록축, 채점표판, 시험지판, 앵커, 칸키,
  배분, 시험지조립, 사례본문, input_hash, 응답해시, case_id, 결과검증, 집계, 비교축차이, 결과한벌,
};
