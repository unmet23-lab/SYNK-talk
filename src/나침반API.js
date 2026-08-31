'use strict';
/**
 * 나침반 API — 강사 통로(`teach`)의 `compass/*` 두 경로를 앱에서 부르는 자리.
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §8 ①②(유호님 확정 6건 · 2026-08-12).
 *
 * ■ 이 파일이 닫는 것 — 대외로 **이미 약속 중인데** 받을 자리가 0줄이었다
 *   상담AI FAQ Q11(`확정: true`)이 「**입학할 때**, 그리고 시즌마다 나침반 세션을 엽니다」로
 *   나가 있는데, 08-12 두 저장소 전수 검색 결과 `compass`·`season` 구현이 **0건**이었다.
 *   🔴 왼쪽(학생이 스스로 선언한 것)은 **소급이 원리상 불가능**하다 — 나중에 다시 물어도
 *      나오는 것은 오늘의 답이지 그때의 답이 아니다. 그날 안 담기면 그 학생의 회고는 반쪽이다.
 *
 * ■ 강사 API 와 **같은 문**을 지난다 (`src/사건통로.js`)
 *   봉투 해석·계약판 헤더·401 재갱신·네트워크 구분이 여기도 똑같이 필요하다.
 *   🔑 그래서 **이 파일에는 주소도 키도 없다**(`강사API` 머리말과 같은 규칙).
 *
 * ■ 🔴 어휘 사본이 **0개**다 — 이 파일은 문항키도 라벨도 모른다
 *   문항·문구는 **서버가 준다**(`questions`). 화면이 문항을 손으로 적으면 그 순간 정본이
 *   둘이 되고, 목적별 문구 갈래(`culture`)와 몽골어 검수가 서는 날 화면만 낡는다.
 *
 * 🚫 재제안 금지
 *   · **시즌·회차를 앱이 고르기** — 서버가 정한다(`teach` 머리말 🔴). 앱이 고르면 강사가 지난
 *     시즌에 소급 기입할 수 있고, 그 순간 「그때 그 시점의 선언」이라는 이 설계의 전제가 죽는다.
 *     `저장하기` 가 `season_id` 를 보내는 것은 **조준 확인용**이다(불일치 = 409 `SEASON_ROLLED`).
 *   · 저장 성공을 낙관적으로 그리기 — 서버가 준 `recorded_at` 만 「적혔다」로 그린다.
 */
import { 부르기 } from './사건통로.js';
import { uuid꼴인가 } from '../lib/학생계정.js';

/**
 * `GET /v1/teach/compass/open` — 이 학생에게 지금 무엇을 물어야 하나.
 *
 * 🔑 `회차`·`문항`·`지난5년답` 이 **한 번의 조회**에서 온다 — 두 번 읽으면 화면이 그리는 문항과
 *   서버가 검사하는 회차가 갈리고, 그 갈림은 저장 순간에야 400 으로 보인다.
 * 🔴 `시즌` 이 없으면 서버가 409 `SEASON_NOT_OPEN` 을 준다 — 고장이 아니라 **운영이 아직 그
 *   시즌 행을 안 열었다**는 뜻이다. 화면은 그 둘을 갈라 말한다(안 가르면 앱이 고장난 줄 안다).
 *
 * 🔑 **학생번호로 연다.** 강사가 손에 든 것은 uuid 가 아니라 `SYNK-001` 이다 — uuid 만 받으면
 *   이 화면은 원리상 못 쓰이고, 나침반이 「나중에 옮겨 적기」가 되는 순간 자동화 축이 죽는다.
 *   서버가 `learner_id` 를 돌려주므로 저장은 **그 값을 그대로** 쓴다(두 번 조회하지 않는다).
 *
 * @param {string} 토큰
 * @param {string} 학생번호 `student_code`(SYNK-001) — 36자 uuid 를 주면 그대로 쓴다
 * @returns {Promise<{학생id: string, 학생번호: string|null, 이름: string|null, 시즌: object,
 *   회차: string, 목적: string|null,
 *   문항: {키: string, 라벨: string, 라벨_mn: string|null, 상한: number}[],
 *   지난5년답: string|null, 이미적힘: string|null}>}
 */
export async function 열기(토큰, 학생번호) {
  const 칸 = uuid꼴인가(학생번호) ? 'learner_id' : 'student_code';
  const 본문 = await 부르기(`teach/compass/open?${칸}=${encodeURIComponent(String(학생번호).trim())}`, 토큰);
  return {
    학생id: 본문.learner_id ?? '',
    학생번호: 본문.student_code ?? null,
    이름: 본문.display_name ?? null,
    시즌: 본문.season ?? null,
    회차: 본문.round ?? '',
    목적: 본문.goal_track ?? null,
    문항: Array.isArray(본문.questions) ? 본문.questions : [],
    지난5년답: 본문.previous_self_in_5y ?? null,
    이미적힘: 본문.already_recorded_at ?? null,
  };
}

/**
 * `POST /v1/teach/compass/save` — 답 한 벌.
 *
 * 🔑 `그대로인가` 는 시즌 회차에서만 뜻이 있다(입학 회차엔 지난 답이 없다). 값이 「그대로」여도
 *   답 자체는 **복사해 보낸다** — 행마다 자족해야 회고의 병치 쿼리가 단순해지고, 「안 바꿨다」를
 *   값 비교로 추측하지 않게 된다(설계 §3-1).
 *
 * @param {string} 토큰
 * @param {{학생id: string, 시즌id: string, 답: object, 바꿨나: boolean|null}} 요청
 * @returns {Promise<{compass_id: string, 회차: string, 적힌시각: string}>}
 */
export async function 저장하기(토큰, { 학생id, 시즌id, 답, 바꿨나 }) {
  const 본문 = await 부르기('teach/compass/save', 토큰, {
    learner_id: 학생id,
    season_id: 시즌id,
    answers: 답,
    /* `null` 을 **그대로 보낸다** — 빼면 서버가 「안 물었다」와 「보내는 걸 잊었다」를 못 가른다. */
    self_in_5y_changed: 바꿨나 === undefined ? null : 바꿨나,
  });
  return {
    compass_id: 본문.compass_id,
    회차: 본문.round ?? '',
    적힌시각: 본문.recorded_at ?? '',
  };
}
