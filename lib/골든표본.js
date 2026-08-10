'use strict';
/**
 * 골든표본 — N11 「이번 주 무작위 5건」의 **유일한 정본**. 순수 함수만(저장 0).
 *
 * ■ 무엇이 어려운 자리인가 (M2 라벨회로 설계 §4)
 *   표본을 뽑는 것은 쉽다. 어려운 것은 **소비자 둘이 같은 5건을 보는 것**이다:
 *     · `functions/teach` 가 강사에게 큐를 내려 준다
 *     · `tools/성적표.js` 가 「그 주에 물어본 것 중 몇 건이 판정됐나」의 분모를 센다
 *   둘이 각자 뽑으면 **다른 5건**이 나오고, 그러면 완료율·승률이 조용히 거짓이 된다.
 *   그래서 표본은 저장하지 않고 **재현**한다 — 같은 주 키와 같은 풀이면 언제 몇 번을 돌려도
 *   같은 5건이다. 표를 새로 만들지 않는 것이 이 파일의 값이다(설계 §11 🚫 표본 저장 표 신설).
 *
 * ■ 🔴 무작위가 이 회로의 심장이다 (AS `goldenSampleWeekly_` 주석 승계)
 *   「틀린 걸 골라 주세요」로 모으면 **「AI가 맞았다」 라벨이 0인 반쪽 채점표**가 된다.
 *   승률의 분자만 모으고 분모를 안 모으는 것이라, 그 표로는 모델을 비교할 수 없다.
 *   **동의도 답이고 수정도 답이다** — 그래서 풀에서 고르는 기준은 「무작위」 하나뿐이다.
 *
 * ■ 🔴 주 키는 UTC 로 못박는다
 *   표본 목적에 필요한 것은 현지 정합이 아니라 **결정성**뿐이고, 시간대 리터럴 재기입은
 *   금지돼 있다(계약 규약). 풀 경계·시드가 전부 이 주 키 **하나**에서 파생된다 —
 *   두 곳에서 각자 계산하면 경계 하루가 어긋나는 날 풀과 시드가 서로 다른 주를 가리킨다.
 *
 * ■ 🔴 「지난 완결 주」만 본다
 *   이번 주를 풀로 쓰면 행이 계속 늘어 **주중에 표본이 바뀐다** — 월요일에 본 5건과
 *   목요일에 본 5건이 달라지고, 강사가 판정한 항목이 큐에서 사라진다(그 항목은 「이미
 *   판정됨」이 아니라 **표본 밖**이 되어 완료율의 분모에서도 빠진다). `corrections` 는
 *   append-only 라 완결된 주의 풀은 두 번 다시 안 변한다 — 재현의 전제가 그것이다.
 *
 * ■ ⚠ AS 의 「결정적 해시 금지」와 다른 것이다
 *   그 금지가 가리킨 병은 **항목(학생) 키 해시**라 매주 같은 학생이 뽑히는 것이다.
 *   여기 시드는 **주 키**라 매주 갈리고 풀도 갈린다 — 같은 병에 안 걸린다.
 */

/** 상수 5 = AS `GOLD_SAMPLE_PER_WEEK` 승계. 「강사 1인 5건이 현실적 상한(유인이 0인 업무다)」. */
const 주당건수 = 5;

/* 풀 **술어 텍스트**도 정본이다 — 소비자가 두 모양이라서 그렇다(`동의게이트.지금유효술어` 선례):
 *   · `functions/teach` = Deno 태그 질의(`sql\`\``)
 *   · `tools/성적표.js` = Management API 로 보내는 **문자열** SQL(태그를 못 쓴다)
 * 둘이 각자 적으면 그게 두 번째 정본이고, 갈리는 날 **분모와 분자가 다른 풀을 센다**.
 * `tests/골든표본.test.js` 가 두 소스가 이 텍스트를 담고 있는지 기계로 대조한다.
 *
 * 🔴 뒷줄이 **「학생 목록에 서는 행」**이다 — `functions/corrections:167` 의 빈 카드 필터와
 *   같은 식이어야 한다(AS 원형 「노출분만 평가」의 talk 번역). 갈라지면 학생이 못 본 교정을
 *   강사가 판정하게 되고, 그 라벨은 「학생에게 먹혔나」와 짝이 안 맞는다.
 * 🚫 `sql.unsafe` 로 이 텍스트를 태그에 끼워 넣지 않는다 — 런타임에서 깨지면 수집이 멈춘다. */
const 풀술어 = "c.actor_kind = 'ai'\n       and (c.corrected_text is not null or array_length(c.error_tags, 1) is not null)";

/* ── 주 키 ──────────────────────────────────────────────────────────── */

/** ISO 8601 요일 — 월=1 … 일=7. JS 의 `getUTCDay()`(일=0)를 그대로 쓰면 주 경계가 하루 밀린다. */
function iso요일(d) {
  return d.getUTCDay() || 7;
}

/**
 * 그 시각이 속한 ISO 주 → `{연, 주}`.
 *
 * 🔑 **목요일로 옮겨 놓고 센다.** ISO 주의 해는 「그 주 목요일이 속한 해」라, 연말연시
 *   며칠은 달력의 해와 주의 해가 다르다(2026-01-01 은 2026-W01 이 아니라 2025-W53 이다).
 *   그 며칠을 틀리면 풀이 통째로 빈 주가 한 해에 한 번 생기고, 증상은 「이번 주 표본 0건」뿐이다.
 */
function iso주(when) {
  const d = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - iso요일(d));
  const 연 = d.getUTCFullYear();
  const 연초 = Date.UTC(연, 0, 1);
  return { 연, 주: Math.ceil(((d.getTime() - 연초) / 86400000 + 1) / 7) };
}

/** `{연, 주}` → 그 주 월요일 00:00:00Z. 1월 4일은 **정의상 언제나 1주에 속한다**(ISO 8601). */
function 주월요일(연, 주) {
  const jan4 = new Date(Date.UTC(연, 0, 4));
  const 첫주월 = Date.UTC(연, 0, 4 - (iso요일(jan4) - 1));
  return new Date(첫주월 + (주 - 1) * 7 * 86400000);
}

/** 키 문자열 — `2026-W32`. 주는 **0 채움 2자리**(정렬하면 시간순이 되는 것이 값이다). */
function 키(연, 주) {
  return `${연}-W${String(주).padStart(2, '0')}`;
}

/** `2026-W32` → `{연, 주}`. 모양이 아니면 null(지어내지 않는다). */
function 키풀기(주키) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(주키 ?? ''));
  if (!m) return null;
  const 연 = Number(m[1]);
  const 주 = Number(m[2]);
  if (주 < 1 || 주 > 53) return null;
  return { 연, 주 };
}

/**
 * **지난 완결 주**의 키. 기준 시각을 주입받는 이유는 시험을 결정적으로 만들기 위해서다
 * (`Date.now()` 직접 호출 금지 — 시험이 매주 다른 답을 내면 회귀가 아니다).
 *
 * @param {Date} [지금]  기본은 실제 현재 시각
 */
function 지난주키(지금 = new Date()) {
  const 이번주 = iso주(지금);
  /* 이번 주 월요일에서 하루 뺀 시각 = 지난 주 일요일. 「주 번호 -1」로 세면 연초에 0·-1 이
   * 나오고 그 해의 마지막 주가 52 인지 53 인지도 따로 알아야 한다 — 날짜로 물러서면 그 둘이
   * 저절로 풀린다(ISO 주가 해를 넘나드는 자리를 손으로 세지 않는다). */
  const 이번주월 = 주월요일(이번주.연, 이번주.주);
  const 지난주 = iso주(new Date(이번주월.getTime() - 86400000));
  return 키(지난주.연, 지난주.주);
}

/**
 * 주 키 → 풀의 시각 경계 `[시작, 끝)`. SQL 이 `created_at >= 시작 and created_at < 끝` 로 쓴다.
 *
 * 🔑 **반열린 구간**이다. 양끝을 닫으면 자정 정각에 만들어진 행이 두 주에 다 들어가고,
 *   그 행은 두 주의 표본 후보가 되어 「지난주에 판정했는데 이번주에 또 나온다」가 된다.
 */
function 주범위(주키) {
  const p = 키풀기(주키);
  if (!p) return null;
  const 시작 = 주월요일(p.연, p.주);
  return { 시작: 시작.toISOString(), 끝: new Date(시작.getTime() + 7 * 86400000).toISOString() };
}

/* ── 시드·셔플 ──────────────────────────────────────────────────────── */

/** FNV-1a 32비트. 문자열 → 시드. 짧고 구현이 한 가지라 어느 언어로 옮겨도 같은 값이 나온다. */
function fnv1a(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    /* 32비트 곱을 부동소수 오차 없이 — `Math.imul` 이 그 자리다(`h * 16777619` 는 정밀도가 샌다). */
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — 시드 하나로 재현되는 PRNG. `Math.random` 을 이 파일에서 절대 부르지 않는다. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── 표본 ───────────────────────────────────────────────────────────── */

/**
 * 풀 → 이번 주 표본.
 *
 * @param {Array<{correction_id:string}>} 풀   그 주의 AI 교정 행(학생 목록에 서는 것만 — 호출부가 건다)
 * @param {string} 주키                        `2026-W32`
 * @param {number} [n]                         기본 5
 * @returns {Array|null} 풀·주키 모양이 아니면 null
 *
 * 🔴 **정렬이 먼저다.** 풀은 SQL 이 준 순서로 오는데 그 순서는 계획이 바뀌면 조용히 달라진다
 *   (같은 `where` 라도 인덱스 스캔이 바뀌면 순서가 바뀐다 — `order by` 없는 SELECT 에 순서는
 *   계약이 아니다). 셔플은 입력 순서에 의존하므로, 정렬을 빼면 **같은 주에 다른 5건**이 나온다.
 *   그 어긋남은 어디서도 안 빨개진다 — 두 소비자가 각자 그럴듯한 5건을 들고 있을 뿐이다.
 */
function 표본(풀, 주키, n = 주당건수) {
  if (!Array.isArray(풀)) return null;
  if (!키풀기(주키)) return null;
  if (!Number.isInteger(n) || n < 1) return null;
  if (!풀.every((r) => r && r.correction_id !== undefined && r.correction_id !== null && r.correction_id !== '')) {
    return null;
  }

  const ids = 풀.map((r) => String(r.correction_id));
  /* id 중복은 모양 위반이다 — 같은 행이 두 번 든 풀은 그 행의 추첨 확률만 두 배가 된다. */
  if (new Set(ids).size !== ids.length) return null;

  const 정렬 = 풀.slice().sort((a, b) => (String(a.correction_id) < String(b.correction_id) ? -1 : 1));
  const rng = mulberry32(fnv1a(주키));

  /* Fisher–Yates. 앞 n 개만 필요하지만 **전체를 섞는다** — 부분 셔플로 줄이면 n 이 바뀌는 날
   * 앞쪽 결과까지 달라져, 상수 하나를 고친 것이 과거 주의 표본을 소급으로 바꾼다. */
  for (let i = 정렬.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [정렬[i], 정렬[j]] = [정렬[j], 정렬[i]];
  }
  return 정렬.slice(0, n);
}

module.exports = {
  주당건수, 풀술어, 표본, 지난주키, 주범위, 키, 키풀기, iso주, 주월요일, fnv1a, mulberry32,
};
