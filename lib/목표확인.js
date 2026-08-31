'use strict';
/* 목표 왕복 — 「오늘 아침 서클에서 말한 목표, 해냈어요?」 카드 판정과 답 사건 조립. **순수 함수만**
 * (교실 수집 ② · 계약 c14 · 유호 확정 08-31 「웅 그대로 가」 ·
 *  정본 = appsscript docs/교실수집_목표왕복_설계_v1.md · 본 = lib/성향확인.js 동형).
 *
 * ■ 세 소비자가 이 한 파일을 쓴다 — 판정이 두 벌이 되면 서버가 보여준 것과 행에 남는 것이 갈린다.
 *   · 서버(functions/progress) — `목표카드`: 오늘 밤 카드를 낼지(하루 1회 · 평일만).
 *   · 앱(src/목표카드.js) — `목표사건`: 학생 답을 `goal.responded` 로 조립(검증기 필수 전부).
 *   · 학습자상태 — 목표축이 이 사건을 읽는다(생산자·소비자 한 벌 — 이벤트검증 도달 래칫).
 *
 * ■ 🔴 v1 은 목표 «내용»을 모른다 — 인쇄물의 학생별 과녁은 조립 순간 파생되고 저장되지 않는다
 *   (엔진 서클 조립기 「쓰기 0」 실측 · 설계 §2). 그래서 이 사건은 「지켰다」가 아니라
 *   **「지켰다고 말했다」**(source_kind=explicit)이고, 관측 짝은 mastery 파이프라인이 이미 쥔
 *   그 문형의 실제 변화다 — 섞으면 거짓 축이 선다(§4-E 처방 ①).
 * ■ 🔴 게이트 근사 하나를 정직하게 적는다 — talk 은 수업일·출석을 모른다(08-31 전량 실측 0건 ·
 *   물리 출석은 appsscript 몫 — docs/이_저장소_규약.md). v1 게이트 = 「몽골 날짜 월~금」 근사.
 *   주말반 학생에게는 평일 카드가 빗나갈 수 있다 — 반 유형이 talk 에 오는 날 정밀화한다(설계 §7).
 * ■ 「아직」은 벌이 아니다 — 재촉·잠금·배지 0(함께한날 「셋 다 안 떨어진다」 동형). 안 누르면 무사건.
 */

const { 목표안내 } = require('../contents/문구_목표확인.js');

/** 이 판정의 판 — 규칙이 바뀌면 올린다(성향확인.판정판 동형 · 사건 payload `card_version` 에 실린다). */
const 판정판 = '목표확인.v1';

/** 달력 날짜 문자열(YYYY-MM-DD)의 요일 — 시간대 무관(달력 날짜 자체의 요일이다). 월1~일7. */
function 요일번호(달력날짜) {
  const d = new Date(`${String(달력날짜)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const g = d.getUTCDay();               // 일0 ~ 토6
  return g === 0 ? 7 : g;                // 월1 ~ 일7 (엔진 F열 규약과 같은 눈금)
}

/** v1 수업일 근사 — 몽골 달력 날짜의 월~금. (출석·반 시간표는 talk 에 없다 — 머리말 🔴) */
const 평일인가 = (달력날짜) => {
  const n = 요일번호(달력날짜);
  return n != null && n >= 1 && n <= 5;
};

/**
 * 오늘 밤 보여줄 목표 카드 — 하루 1회 · 평일만 · 문구 없으면 안 낸다.
 * @param {{오늘답함: boolean}} 이력  `goal.responded` 행에서 파생(서버가 걷는다)
 * @param {string} 오늘  몽골 달력 날짜(YYYY-MM-DD · progress 의 `오늘` 그대로)
 * @returns {{class_date: string, 키: string, 문장: string[],
 *           답라벨: Record<string,string>, card_version: string}|null}
 */
function 목표카드(이력, 오늘) {
  if (!이력 || 이력.오늘답함) return null;               // 하루 1회 — 답한 날은 더 안 묻는다
  if (!평일인가(오늘)) return null;                      // v1 근사 — 주말(서클 없는 날)은 안 묻는다
  const 안 = 목표안내();
  if (!안 || !안.문장.length) return null;               // 문구 없으면 빈 카드를 내지 않는다
  return {
    class_date: String(오늘),                            // 어느 날의 목표였나 — 앱이 그대로 되싣는다
    키: 안.키,
    문장: 안.문장,
    답라벨: 안.답라벨,
    card_version: 판정판,
  };
}

/**
 * 학생 답 → `goal.responded` 사건 (계약 c14 · 검증기 필수 전부).
 * 🔴 카드 값을 **그대로 되싣는다** — 앱이 class_date 를 지어내면 「어느 날의 목표였나」가 갈린다
 *   (성향확인 「카드 다섯 값 되싣기」와 같은 무늬). 모르는 답 값은 null(조립기가 값록을 진다).
 * @param {ReturnType<typeof 목표카드>} 카드  서버가 내려준 그대로
 * @param {'해냈다'|'아직'} 응답  계약 「목표응답」 값록
 * @param {{correlation_id: string, idempotency_key: string, occurred_at?: string}} 키들
 */
function 목표사건(카드, 응답, 키들) {
  if (!카드 || !카드.class_date || !카드.card_version) return null;
  if (응답 !== '해냈다' && 응답 !== '아직') return null;  // 값록 밖은 거부 — 지어내지 않는다
  if (!키들 || !키들.correlation_id || !키들.idempotency_key) return null;
  return {
    event_type: 'goal.responded',
    correlation_id: String(키들.correlation_id),
    idempotency_key: String(키들.idempotency_key),
    /* 공통 필수 — occurred_at 은 답한 그 순간. level_snapshot 은 ⓑ 완화(키 존재 + null) 그대로:
     * 이 카드에 급수가 안 흐르니 null 이 유일하게 정확한 값이다(성향확인 확인사건과 같은 줄). */
    occurred_at: String(키들.occurred_at || new Date().toISOString()),
    level_snapshot: null,
    payload: {
      ver: 1,
      response: 응답,
      class_date: String(카드.class_date),
      card_version: String(카드.card_version),
    },
  };
}

module.exports = { 판정판, 요일번호, 평일인가, 목표카드, 목표사건 };
