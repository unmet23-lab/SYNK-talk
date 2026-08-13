/**
 * 알바변명제출 — G3 「알바 변명」의 **재료 조립기**. 순수 함수만(네트워크·저장 0).
 *
 * ■ 자리 (발주_게임모듈.md G3 §4-3 · 마무리 사슬 판정 ①)
 *   G3 는 유일한 음성 모듈이라 **제출 통로를 새로 만들지 않는다** — 기존 발화 사슬
 *   (`src/말하기화면.기록추가` → `lib/제출로그` → `lib/오늘과제.제출사건` → `src/제출API`)이
 *   소급 불가 배선(PCM WAV·capture_meta·무발화 ⓐ/ⓑ·업로드)까지 전부 진다. 여기가 내는 것은
 *   그 사슬이 먹을 재료 둘뿐이다:
 *     `게임재료`  — 화면이 그릴 것(상황문·사장님대사·지시문)과 봉투 값(G1·G2 조립기와 같은 꼴)
 *     `제출재료`  — 큐 항목의 `task_meta` — `오늘과제.제출사건` 이 읽는 모양 **그대로**
 *   사건 조립기가 없는 것이 이 파일의 설계다(새 통로 0) — G4(`lib/서류관문제출.js`)와 갈리는
 *   자리가 정확히 여기다(그쪽은 게임 큐, 이쪽은 발화 큐).
 *
 * ■ 🔴 이 파일은 ESM 이다 — 앱 번들 쪽이라 동봉 대상이 아니다(G1·G2 조립기와 같은 자리).
 */

import { 검수확정, 펴기 } from '../contents/알바변명문항.js';
import { G3스냅샷, G3스냅샷인가 } from './게임스냅샷.js';

/* G3 §6-1 고정값 — `task_format`. 배정 행에 안 실리는 값이라 조립기가 박는다(G2 `빈칸형식`
 * 규약). 🔴 `낭독` 과 절대 안 섞인다(§6-1 — 섞이면 섀도잉 데이터가 회화 데이터의 얼굴을 쓴다).
 * step 이 `답하기` 하나뿐인 것도 설계다 — `따라` 형식이 없으므로 그 step 으로 조립된 항목은
 * `제출사건` 이 형식을 몰라 **안 보낸다**(지어내는 것보다 안 보내는 쪽이 옳다). */
const 자유발화형식 = '자유발화';

/**
 * 이 배정이 G3 인가 — 라우팅 판정. 정본은 `게임스냅샷.G3스냅샷인가` 하나다(값을 여기 다시
 * 적으면 갈라진 쪽이 조용히 통과한다). 넓은 쪽(`게임스냅샷인가`)을 쓰면 이 화면이 남의 배정을
 * 연다 — G2·G4 조립기와 같은 규율.
 */
export function 게임과제인가(항목) {
  return G3스냅샷인가(항목 && 항목.task_snapshot);
}

/**
 * 배정 항목 → 화면·조립이 쓸 재료. **못 읽으면 null** — 지어내지 않는다.
 *
 * 🔑 `상황문`·`사장님대사` 는 팩 `펴기` 가 화면 연출(카드·TTS)용으로 따로 낸 값이다 — 정본은
 *   스냅샷의 `질문`(둘의 결정적 합 · 행에 남는 것)이고, 화면이 팩을 직접 부르면 「그날 학생이
 *   본 것」의 조립이 두 곳이 된다(G2 규율 그대로 — 그래서 여기서 한 번만 편다).
 * 🔑 `level_snapshot`·`goal_snapshot`·`retry_of_event_id` 는 전부 서버 배정 행이 낸 값 —
 *   앱이 만드는 것은 하나도 없다(`오늘과제.화면과제` 제출재료와 같은 규약).
 */
export function 게임재료(항목) {
  /* 🔴 fail-closed — 몽골어 검수 전 판은 학생에게 열지 않는다(발주_게임콘텐츠팩 §3).
   * 팩이 `검수확정 = false` 인 동안 이 함수는 **언제나 null** 이고, 라우팅이 이 null 을 받으면
   * 말하기 폴백으로 조용히 내려간다(G1·G2·G4 와 같은 규율). */
  if (검수확정 !== true) return null;
  if (!게임과제인가(항목)) return null;
  if (!항목.task_ref) return null; // 큐와 못 잇는 제출은 만들지 않는다
  const 시드 = String((항목.task_snapshot && 항목.task_snapshot.prompt_seed) || '');
  if (시드 === '') return null;
  const 스냅샷 = G3스냅샷(시드);
  if (!스냅샷) return null; // 못 펴는 시드 — 화면은 이 null 로 「읽지 못했다」를 정직하게 낸다
  const 문항 = 펴기(시드);
  if (!문항) return null;
  return Object.freeze({
    prompt_seed: 시드,
    스냅샷,
    상황문: 문항.상황문,
    사장님대사: 문항.사장님대사,
    지시문: 문항.지시문,
    task_ref: String(항목.task_ref),
    level_snapshot: 항목.level_snapshot === undefined ? null : 항목.level_snapshot,
    goal_snapshot: 항목.goal_snapshot === undefined ? null : 항목.goal_snapshot,
    retry_of_event_id: 항목.retry_of_event_id || null,
  });
}

/**
 * `게임재료()` → 큐 항목의 `task_meta` — **`오늘과제.제출사건` 이 읽는 모양 그대로**다
 * (`화면과제` 의 제출재료와 같은 키 · 다른 값). 이 객체가 항목에 실리는 순간부터 발화 사슬은
 * G3 를 말하기와 구분하지 않는다 — 그것이 판정 ①의 뜻이다.
 *
 * 🔴 `task_snapshot` 은 **앱이 그날 그린 판**(`G3스냅샷(시드)` 재조립)이다 — 배정 행에서 베껴
 *   오면 「앱이 배정대로 그렸다」는 추정이 관측 칸에 들어간다(화면과제 주석 그대로 · G1 패턴).
 * 🔴 `형식` 에 `따라` 를 두지 않는다 — G3 에 그 호흡이 없다는 사실이 그대로 적히는 것이고,
 *   실수로 `따라` step 항목이 서면 사슬이 형식을 몰라 안 보낸다(위 상수 주석).
 */
export function 제출재료(재료) {
  if (!재료 || !재료.task_ref || !재료.스냅샷) return null;
  return Object.freeze({
    task_ref: 재료.task_ref,
    task_snapshot: 재료.스냅샷,
    level_snapshot: 재료.level_snapshot === undefined ? null : 재료.level_snapshot,
    goal_snapshot: 재료.goal_snapshot === undefined ? null : 재료.goal_snapshot,
    retry_of_event_id: 재료.retry_of_event_id || null,
    형식: Object.freeze({ 답하기: 자유발화형식 }),
  });
}
