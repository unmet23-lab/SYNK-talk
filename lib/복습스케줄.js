'use strict';
/* 복습 스케줄러(FSRS-6) — 「어떤 카드를 «언제» 다시 만나게 할지」의 순수 계산기
 *   (정본 = appsscript docs/복습스케줄러_설계.md §4 · 판정 다섯 = 유호 확정 08-22 「권고 채택」).
 *
 * ■ 확정값(§7 ⓐ~ⓔ · 결정.md 08-22)
 *   ⓐ 카드 단위 = 오류 태그로 시작 — 단 이 파일은 card_id 를 **문자열로만** 본다(종류를 모른다 ·
 *      태그→skill 표가 서는 날 키만 갈아 끼운다). ⓑ 저장 = 사건 파생(새 표 0 · 상태는 캐시일 뿐
 *      정본은 사건 열) · request_retention 0.9 · maximum_interval 60일(시즌 = 교재 1권 ≈ 두 달 —
 *      개원 첫 해에 「1년 뒤에 봅시다」는 뜻이 없다). ⓒ 등급 매핑은 아래 `복습등급` **한 곳**.
 *   ⓓ 범위 = «배선만» — 이 파일은 시트를 안 읽고 프롬프트를 안 만지고 아무것도 자동으로 안 바꾼다.
 *      재출제 창(엔진_콘텐츠AI 14일 고정)의 실제 교체는 병행 출력 뒤 유호 판정의 한 커밋 몫이다.
 *   ⓔ ts-fsrs 의존(MIT · FSRS-6 21 파라미터 · 옵티마이저 경로 보존) — 안 맞으면 이식으로 갈아탄다.
 *
 * ■ 결정성이 뼈대다(§4) — 같은 리뷰 열 → 같은 due. 난수 0(`enable_fuzz: false`) · 단기 단계 0
 *   (`enable_short_term: false` — 하루 1회 앱이라 10분 뒤 재출제 자리가 없다 · 실측: 끄면 첫
 *   Good 부터 일 단위다) · 시각 축은 «리뷰가 난 시각» 하나(호출 시각·Date.now 를 섞지 않는다).
 *
 * ■ 🔴 상한은 «여기서» 한 번 더 가둔다 — 실측(08-22 · ts-fsrs 5.4.1): `maximum_interval: 60` 을
 *   줘도 Easy 연타에서 scheduled_days 62 가 나왔다(라이브러리의 상한 적용이 우리 계약과 미세하게
 *   다르다). 계약이 60이면 60은 기계가 보장한다 — `가둠` 이 due 를 last_review + 60일로 자른다.
 *
 * ■ 사건 → 리뷰 «파생»은 이 파일 밖이다 — 정직하게 적는다: quiz.answered 에는 정오가 없고
 *   (정오는 스냅샷 정답과의 대조 «파생» — C0 「is_correct 를 만들지 않는다」), 태그 카드와 퀴즈
 *   skill 축은 매핑 0 이다(설계 §3 실측). 그 파생 규칙은 설계문이 아직 명세하지 않았고, 여기서
 *   임의로 정하면 두 정본이 된다(상태기반 v5.9 갈래 4 의 얼굴). 규격이 서면 그 자리에서 —
 *   이 파일은 파생층이 낼 `{card_id, at, 정답, 확신도}` 를 «인자»로 받는 데까지가 계약이다.
 *
 * ■ 하지 않는 것(§5): 런타임 품질 문턱 0(순서만 바꾼다) · 학생끼리 비교 0 · 압박 카운터 0 ·
 *   생성 `skill_ids` 회전 무접촉(확정 충돌 — E2 자리) · 새 사건 종류 0 · 새 계약 칸 0.
 */

const { fsrs, generatorParameters, createEmptyCard, Rating } = require('ts-fsrs');

/** 스케줄 설정 — §7-ⓑ 확정값. 바꾸는 날은 값이 아니라 «판정»이 바뀐 날이다(결정.md 로). */
const 복습설정 = Object.freeze({
  request_retention: 0.9,
  maximum_interval: 60,
  enable_fuzz: false,
  enable_short_term: false,
});

const 최대간격_MS = 복습설정.maximum_interval * 86400000;

/* 스케줄러 인스턴스 — 파라미터는 기본 21(FSRS-6). 학생별 재추정(옵티마이저)은 리뷰 수백 건 뒤의
 * 별건이고, 그날 바뀌는 것은 이 한 곳이다. */
const 판 = generatorParameters(복습설정);
const 계산기 = fsrs(판);

/**
 * 정오+확신도 → FSRS 등급. **매핑은 이 함수 한 곳에만 있다**(설계 §6 인수 2 · 유호 확정 ⓒ).
 *
 * 확신도의 실물은 `'low' | 'guess' | null` 2값+미표기다(`lib/라디오승격.js` — 안 물린 표기는
 * 안 싣는다 · `lib/학습자상태.js` 자기인식축과 같은 원천).
 * 🔑 `null` 은 「확신했다」가 아니라 **「안 물렸다」**다 — 그래서 Easy 가 아니라 Good 이다.
 *   안 물어본 것을 잘한 것으로 세면 그 학생의 곡선이 통째로 낙관이 된다(학습자상태 주석 그대로).
 * 🔑 Easy 는 이 매핑이 **절대 안 낸다** — 「빠르게 두 번 연속 정답」 같은 파생 조건이 필요한데
 *   우리 사건에 «걸린 시간»이 없다. 없는 재료로 등급을 올리지 않는다.
 */
function 복습등급(정답, 확신도) {
  /* ⚠ 여기 닿는 `정답` 은 boolean 뿐이다 — 정오 «미상»(null·undefined)은 `카드접기` 가 리뷰로
   * 치지 않고 버린수로 센다(심문 S2: 미상을 `!정답` 으로 Again 에 접으면 대조 불가가 매번 lapse 라
   * 과재노출 + lapses 오염 — 「모른다」는 벌점이 아니다). */
  if (!정답) return Rating.Again;
  const c = 확신도 == null ? '' : String(확신도).trim();
  if (c === 'guess' || c === 'low') return Rating.Hard;
  return Rating.Good;
}

/** due 를 계약 상한(last_review + 60일)으로 가둔다 — 머리말 🔴(라이브러리 62일 실측).
 *  ⚠ S·D(stability·difficulty)는 «일부러» 안 자른다(심문 S3): ts-fsrs 5.4.1 의 next 는
 *  last_review 기준이라 잘린 due 가 다음 계산에 안 들어간다 — 그래서 due 절단만으로 안전하다.
 *  이 전제는 «판올림에 취약»하다: 라이브러리를 올리면 next 의 기준이 바뀔 수 있고 그때 이 함수는
 *  조용히 어긋난다. 그래서 회귀 ⑧이 설치본 버전을 못박는다 — 올리는 날 그 검사가 이 재검토를 강제한다. */
function 가둠(카드) {
  if (!카드.last_review) return 카드;
  const 상한 = new Date(카드.last_review.getTime() + 최대간격_MS);
  if (카드.due.getTime() <= 상한.getTime()) return 카드;
  return { ...카드, due: 상한, scheduled_days: 복습설정.maximum_interval };
}

/** 리뷰 열 검증·정렬 — 시각 오름차순(같은 시각은 입력 순서 유지 = 안정 정렬)이라 «집합이 같으면
 *  결과가 같다». 원천 배열 순서에 기대면 호출자마다 갈린다.
 *  🔴 정오 «미상»(`정답` 이 boolean 이 아님)도 여기서 거른다(심문 S2) — 미상은 리뷰가 아니다.
 *    파생층이 「대조 불가」를 null 로 넘겨도 Again 으로 안 접히고 버린수로 드러난다. */
function 시각순(리뷰들) {
  return 리뷰들
    .map((r, i) => ({ r, i, t: Date.parse(r.at) }))
    .filter((x) => Number.isFinite(x.t) && typeof x.r.정답 === 'boolean')   // 못 접는 리뷰(시각 없음·정오 미상)는 아래서 센다
    .sort((a, b) => (a.t - b.t) || (a.i - b.i))
    .map((x) => x.r);
}

/**
 * 한 카드의 리뷰 열 → 카드 상태. **순수·결정적** — 같은 열이면 같은 상태다.
 * @param {Array<{at: string|Date, 정답: boolean, 확신도?: string|null}>} 리뷰들  그 카드의 리뷰 전부
 * @returns {{due: Date, stability: number, difficulty: number, reps: number, lapses: number,
 *           last_review: Date|null, 리뷰수: number, 버린수: number}|null}  리뷰 0이면 null(카드가 아직 없다)
 */
function 카드접기(리뷰들) {
  if (!Array.isArray(리뷰들) || 리뷰들.length === 0) return null;
  const 열 = 시각순(리뷰들);
  if (열.length === 0) return null;
  let 카드 = createEmptyCard(new Date(Date.parse(열[0].at)));
  for (const r of 열) {
    const 때 = new Date(Date.parse(r.at));
    카드 = 가둠(계산기.next(카드, 때, 복습등급(r.정답, r.확신도)).card);
  }
  return {
    due: 카드.due,
    stability: 카드.stability,
    difficulty: 카드.difficulty,
    reps: 카드.reps,
    lapses: 카드.lapses,
    last_review: 카드.last_review ?? null,
    리뷰수: 열.length,
    버린수: 리뷰들.length - 열.length,   // 못 접은 리뷰(시각 없음·정오 미상 S2) — 0 이 아니면 파생층 결함이다(조용히 안 삼킨다)
  };
}

/**
 * 학생 하나의 리뷰 전부 → 카드별 상태. card_id 는 **문자열로만** 본다(ⓐ — 종류를 모른다).
 * @param {Array<{card_id: string, at: string|Date, 정답: boolean, 확신도?: string|null}>} 리뷰들
 * @returns {Map<string, ReturnType<typeof 카드접기>>}
 */
function 학생카드접기(리뷰들) {
  const 묶음 = new Map();
  for (const r of Array.isArray(리뷰들) ? 리뷰들 : []) {
    const id = r && r.card_id != null ? String(r.card_id) : '';
    if (!id) continue;                              // 카드 없는 리뷰는 접을 자리가 없다
    if (!묶음.has(id)) 묶음.set(id, []);
    묶음.get(id).push(r);
  }
  const 상태들 = new Map();
  for (const [id, 열] of 묶음) {
    const 상태 = 카드접기(열);
    if (상태) 상태들.set(id, 상태);
  }
  return 상태들;
}

/**
 * due 가 «그날»까지 온 카드들 — 재출제 재료(소비자 대체의 병행 출력이 이걸 낸다).
 * 🔴 순서는 due 오름차순(가장 흐려진 것 먼저) · 동률은 card_id 사전순 — 결정적이어야
 *   「왜 이 카드가 오늘 나왔나」를 사람이 되짚을 수 있다(§4).
 * @param {Map<string, {due: Date}>} 상태들  `학생카드접기` 산출
 * @param {string|Date} 오늘  판정 기준 시각(호출자가 든다 — 여기서 시계를 읽지 않는다)
 * @returns {string[]} card_id 목록
 */
function due카드들(상태들, 오늘) {
  const 기준 = Date.parse(오늘);
  if (!Number.isFinite(기준)) return [];
  return [...상태들.entries()]
    .filter(([, s]) => s && s.due && s.due.getTime() <= 기준)
    .sort((a, b) => (a[1].due.getTime() - b[1].due.getTime()) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id]) => id);
}

module.exports = { 복습설정, 복습등급, 카드접기, 학생카드접기, due카드들, Rating };
