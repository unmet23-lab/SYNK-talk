'use strict';
/**
 * 시즌 회고 API — 강사 통로(`teach`)의 `retro/*` 세 경로를 앱에서 부르는 자리.
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §3-2·§4·§6·§7.
 *
 * ■ 이 파일이 닫는 것 — 철학이 사람에게 넘긴 판정을 **받을 그릇**
 *   철학 정본이 「목표에 가까워졌는지는 시즌 회고에서 **사람이** 판정」으로 자동 판정을 닫으며
 *   그 자리를 사람에게 넘겼다. 성향 8축은 「지금 어떤가」만 알고 **부호(sign)를 모른다** —
 *   그걸 아는 것은 사람뿐이고, 사람이 그걸 말하는 자리는 회고 하나뿐이다.
 *   🔴 그래서 이 통로가 없으면 엔진은 「그 방향이 좋았나」를 **영원히 못 배운다.**
 *
 * ■ 왜 통로가 «셋»인가 — 순서가 규격이기 때문이다 (설계 §7 · ✅유호님 채택 08-12)
 *   `열기`(굳힌다) → `자기판정`(학생) → `판정하기`(강사). 하나로 합치면 「학생이 먼저」가
 *   화면 규약으로만 남고, 강사 판정을 본 뒤 누른 학생 칸은 대조군이 아니라 **메아리**다.
 *   서버도 DB 도 같은 판정을 한 번 더 진다(409 `SELF_AFTER_JUDGE`).
 *
 * ■ 🔴 어휘 사본이 **0개**다 — 이 파일은 판정 코드값도 문구도 모른다
 *   3갈래와 그 라벨·사유 글자수 상한은 **서버가 준다**(`verdict_options`·`note_max`).
 *   화면이 손으로 적으면 몽골어 검수가 서는 날 화면만 낡는다(나침반과 같은 규칙).
 *
 * 🚫 재제안 금지
 *   · **앱이 시즌을 고르기** — 서버가 「나침반이 있는데 회고가 아직 확정 안 된 가장 오래된
 *     시즌」을 정한다. 고르게 하면 강사가 지난 시즌을 골라 소급 판정할 수 있다.
 *   · 굳힌 근거(`record_snapshot`)를 앱이 조립해 보내기 — 앱이 보낸 근거는 근거가 아니다.
 *   · 회고 화면에서 8축을 실시간 조회하기 — 창이 밀려 판정이 근거를 잃는다(설계 §4).
 */
import { 부르기 } from './사건통로.js';

/**
 * `GET /v1/teach/retro/open` — 회고 한 벌을 연다(그리고 **그 순간 근거를 굳힌다**).
 *
 * 🔑 이미 열려 있던 회고면 **굳힌 것을 그대로** 돌려준다(재계산 0) — 다시 계산하면 창이 밀려
 *   어제 본 숫자와 오늘 본 숫자가 갈리고, 학생이 이미 누른 뒤라면 그 판정은 다른 근거를 보고
 *   누른 것이 된다.
 * 🔴 `RETRO_NOT_DUE`(409) 는 고장이 아니라 **회고할 시즌이 없다**는 뜻이다(나침반이 아직
 *   없거나 밀린 회고가 없다). 화면은 그 둘을 오류와 갈라 말한다.
 *
 * @param {string} 토큰
 * @param {string} 학생번호 `student_code`(SYNK-001) — 36자 uuid 를 주면 그대로 쓴다
 * @returns {Promise<{학생id: string, 학생번호: string|null, 이름: string|null, 시즌: object,
 *   나침반: object, 굳힌것: object, 자기판정: string|null, 판정: string|null, 사유: string|null,
 *   판정갈래: {코드: string, 라벨: string, 라벨_학생: string, 라벨_mn: string|null}[],
 *   사유상한: number}>}
 */
export async function 열기(토큰, 학생번호) {
  const 칸 = /^[0-9a-f-]{36}$/i.test(String(학생번호).trim()) ? 'learner_id' : 'student_code';
  const 본문 = await 부르기(`teach/retro/open?${칸}=${encodeURIComponent(String(학생번호).trim())}`, 토큰);
  return {
    학생id: 본문.learner_id ?? '',
    학생번호: 본문.student_code ?? null,
    이름: 본문.display_name ?? null,
    시즌: 본문.season ?? null,
    나침반: 본문.compass ?? null,
    굳힌것: 본문.record_snapshot ?? null,
    자기판정: 본문.verdict_by_self ?? null,
    판정: 본문.verdict ?? null,
    사유: 본문.note ?? null,
    판정갈래: Array.isArray(본문.verdict_options) ? 본문.verdict_options : [],
    사유상한: Number(본문.note_max) || 200,
  };
}

/**
 * `POST /v1/teach/retro/self` — **학생**이 먼저 누른다(클릭 1 · 사유 없음).
 *
 * 🔑 이 왕복이 끝나야 강사 칸이 열린다. 낙관적으로 먼저 열지 않는다 — 저장이 실패했는데
 *   강사가 판정해 버리면 그 행의 대조군은 영영 `null` 이고, `null`(안 눌렀다)과
 *   「눌렀는데 강사와 같다」는 **다른 값**이다(접으면 분모가 거짓이 된다).
 *
 * @param {string} 토큰
 * @param {{학생id: string, 시즌id: string, 판정: string}} 요청
 * @returns {Promise<{review_id: string, 자기판정: string}>}
 */
export async function 자기판정하기(토큰, { 학생id, 시즌id, 판정 }) {
  const 본문 = await 부르기('teach/retro/self', 토큰, {
    learner_id: 학생id,
    season_id: 시즌id,
    verdict_by_self: 판정,
  });
  return { review_id: 본문.review_id, 자기판정: 본문.verdict_by_self ?? null };
}

/**
 * `POST /v1/teach/retro/judge` — **강사**가 판정한다(클릭 1 + 한 줄).
 *
 * 🔑 응답이 학생 판정을 함께 돌려준다 — 「둘이 갈렸나」가 이 그릇의 가장 값진 신호라
 *   (설계 §7 도전안) 그 자리에서 보여 준다.
 *
 * @param {string} 토큰
 * @param {{학생id: string, 시즌id: string, 판정: string, 사유: string}} 요청
 * @returns {Promise<{review_id: string, 판정: string, 자기판정: string|null, 확정시각: string}>}
 */
export async function 판정하기(토큰, { 학생id, 시즌id, 판정, 사유 }) {
  const 본문 = await 부르기('teach/retro/judge', 토큰, {
    learner_id: 학생id,
    season_id: 시즌id,
    verdict: 판정,
    note: 사유,
  });
  return {
    review_id: 본문.review_id,
    판정: 본문.verdict ?? '',
    자기판정: 본문.verdict_by_self ?? null,
    확정시각: 본문.decided_at ?? '',
  };
}
