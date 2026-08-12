'use strict';
/**
 * 강사 반 단위 피드백 API — 강사 통로(`teach`)의 `feedback/*` 세 경로를 앱에서 부르는 자리.
 * 정본 = `docs/강사_반단위_피드백_설계.md` v2 §4·§5·§6.
 *
 * ■ 이 파일이 닫는 것 — 서버는 섰는데 **입구가 0줄**이었다
 *   §8-3 이 라우트 셋과 저장 자리(`teacher_notes`)를 세웠는데(talk `5557df7`) 그 경로를 부르는
 *   코드가 저장소에 한 줄도 없었다. `강사API.js` 머리말이 적은 것과 **같은 모양**이다 —
 *   그 상태의 강사 한 마디 생산량은 원리상 0이고, 0인 채로 개원하면 「선생님이 봐 줬다」는
 *   이 기능의 목적 자체가 라이브에서 한 번도 안 일어난다.
 *
 * ■ 검수·골든과 **같은 문**을 지난다 (`src/사건통로.js`)
 *   봉투 해석·계약판 헤더·401 재갱신·네트워크 구분이 여기도 똑같이 필요하다. `fetch` 를 따로
 *   쓰면 그 넷이 두 벌이 되고 갈라진 쪽은 조용하다. 🔑 그래서 이 파일에는 주소도 키도 없다.
 *
 * ■ 🔴 어휘 사본이 **0개**다
 *   갈래(`origin`)·처분(`disposition`)·본문 상한은 `lib/반피드백.js` 가 정본이고 화면이 그것을
 *   **직접** 부른다(`강사화면` 이 `lib/검수확정.js` 를 직접 부르는 선례). DB CHECK 도 그 목록의
 *   사본이라 `tests/반피드백.test.js` 가 둘을 글자로 대조한다 — 여기에 또 적으면 세 번째다.
 *
 * 🚫 재제안 금지
 *   · 앱이 `class_id` 를 지어 보내기 — 서버가 `staff_classes` 조인으로 되묻는다(설계 §4).
 *     화면 규약으로 「내 반만」을 세우면 서버가 안 지킨다.
 *   · 목록을 눌러 넘길 때마다 다시 조회하기 — 조회 1회 = **감사 1행**이고 그 장부는 「나중에
 *     보는 기록」이 아니라 조회 횟수의 분모다(`teach:1173`). 되풀이 조회는 분모를 조용히 바꾼다.
 *   · 한 마디를 낙관적으로 「보냈다」로 그리기 — 같은 산출물에 남이 이미 썼으면 409
 *     `NOTE_BY_OTHER` 로 막힌다(한 반에 강사 둘이 정상 · 설계 §1 ⓐ). 서버가 답한 것만 그린다.
 */
import { 부르기 } from './사건통로.js';

/**
 * `GET /v1/teach/feedback/classes` — 내 반 카드 + 반마다 「기다리는 것 n」 + 이번 주 조용한 학생.
 *
 * 🔴 **빈 목록과 「배정된 반이 없다」는 다른 상태다** — 서버가 `empty_reason` 으로 갈라 준다.
 *   같은 모양으로 그리면 배정을 못 받은 강사가 「내가 다 끝냈구나」로 읽는다(설계 §5).
 * 🔑 `모양`(`waiting`·`clear`·`empty`)은 서버가 `lib/반피드백.카드요약` 으로 낸 것이다 —
 *   화면이 `기다림 > 0` 을 다시 판정하지 않는다(같은 판정을 두 곳에 적으면 갈라진다).
 *
 * @param {string} 토큰
 * @returns {Promise<{주: {시작: string, 끝: string}, 반들: object[], 조용한: object[],
 *   빈사유: string|null}>}
 */
export async function 반목록(토큰) {
  const 본문 = await 부르기('teach/feedback/classes', 토큰);
  return {
    주: { 시작: 본문.week?.starts_at ?? '', 끝: 본문.week?.ends_at ?? '' },
    반들: (Array.isArray(본문.classes) ? 본문.classes : []).map((c) => ({
      id: String(c.class_id),
      열쇠: c.class_key ?? '',
      이름: c.display_name ?? null,
      학생수: Number(c.학생수) || 0,
      기다림: Number(c.기다림) || 0,
      모양: c.모양 ?? 'empty',
    })),
    조용한: (Array.isArray(본문.quiet) ? 본문.quiet : []).map((q) => ({
      반id: String(q.class_id),
      학생id: String(q.learner_id),
      이름: q.display_name ?? null,
    })),
    빈사유: 본문.empty_reason ?? null,
  };
}

/**
 * `GET /v1/teach/feedback/queue?class_id=` — 그 반의 기다리는 산출물.
 *
 * 🔴 정렬은 **「오래 기다린 순」 하나**다(서버의 `order by occurred_at`). 화면이 다시 정렬하지
 *   않는다 — 점수·정답률로 정렬하는 순간 이 화면이 등수표가 되고 철학 ㉢ 을 정면으로 깬다.
 * 🔑 `학생글`·`들린대로` 를 **한 칸으로 접지 않는다** — 쓰기의 원문과 말하기의 전사는 확신의
 *   결이 다르다. 접으면 화면이 기계가 들은 문장을 학생이 쓴 문장이라고 말하게 된다.
 * 🔴 `NOT_FOUND` 는 「그 반이 없다」가 아니라 **「내 담당 반이 아니다」**와 같은 코드다(서버가
 *   일부러 묶었다 — 가르면 응답 자체가 그 반의 존재를 말한다). 화면이 둘을 갈라 말하지 않는다.
 *
 * @param {string} 토큰
 * @param {string} 반id
 * @returns {Promise<{반: {id: string, 열쇠: string, 이름: string|null}, 항목들: object[]}>}
 */
export async function 반큐(토큰, 반id) {
  const 본문 = await 부르기(`teach/feedback/queue?class_id=${encodeURIComponent(String(반id))}`, 토큰);
  return {
    반: {
      id: String(본문.class?.class_id ?? 반id),
      열쇠: 본문.class?.class_key ?? '',
      이름: 본문.class?.display_name ?? null,
    },
    항목들: (Array.isArray(본문.items) ? 본문.items : []).map((i) => ({
      산출물id: String(i.submission_id),
      학생id: String(i.learner_id),
      이름: i.display_name ?? null,
      학생번호: i.student_code ?? null,
      과제종류: i.task_type ?? null,
      과제형식: i.task_format ?? null,
      낸시각: i.occurred_at ?? null,
      학생글: i.body_original ?? null,
      들린대로: i.transcript ?? null,
      AI교정: i.ai_corrected_text ?? null,
      AI해설: i.ai_explanation ?? null,
      AI태그: Array.isArray(i.ai_error_tags) ? i.ai_error_tags : [],
    })),
  };
}

/**
 * `POST /v1/teach/feedback/give` — 한 산출물에 한 마디 + 처분.
 *
 * 🔑 응답이 `updated_at` 을 돌려준다 — **처음 쓴 것인지 고쳐 쓴 것인지**를 그 자리에서 안다.
 *   다시 조회하면 못 가른다(그때는 둘 다 「한 마디가 있다」로만 보인다).
 * 🔴 개서는 **자기 것만** 열린다. 남이 쓴 자리는 409 `NOTE_BY_OTHER` 로 막히고, 그건 고장이
 *   아니라 정상 상태다(한 반에 강사 둘 · 설계 §1 ⓐ) — 화면이 오류색으로 그리지 않는다.
 *
 * @param {string} 토큰
 * @param {{산출물id: string, 글: string, 갈래: string, 처분: string}} 요청
 * @returns {Promise<{note_id: string, 쓴시각: string, 고친시각: string|null,
 *   처분: string, 갈래: string}>}
 */
export async function 한마디주기(토큰, { 산출물id, 글, 갈래, 처분 }) {
  const 본문 = await 부르기('teach/feedback/give', 토큰, {
    submission_id: 산출물id,
    body: 글,
    origin: 갈래,
    disposition: 처분,
  });
  return {
    note_id: String(본문.note_id ?? ''),
    쓴시각: 본문.created_at ?? '',
    고친시각: 본문.updated_at ?? null,
    처분: 본문.disposition ?? '',
    갈래: 본문.origin ?? '',
  };
}
