'use strict';
/**
 * 가입 1회 문항 3개 — `home_aimag` · `gender` · `goal_track` (L0 §9-2 · 발주_수집파이프라인 [CHK-4]).
 *
 * ■ 왜 「1회」인가 — 안 물으면 **되물을 자리가 없다**
 *   L0 §704: 「가입 **1회** 문항. 뒤에 붙이면 재적 전원에게 다시 물어야 한다.」
 *   그리고 §850 은 `goal_snapshot` 을 **「유일한 완전 소급 불가」**로 못박았다 — 목적은
 *   `learners.goal_track` 에 덮어써지고 그 테이블은 append-only 밖이라, 나중에 다시 물어도
 *   나오는 것은 **오늘의 목적**이지 그때의 목적이 아니다. 즉 지금 안 적으면 그 값은 없다.
 *   🔴 2026-08-09 실측: 세 이름이 나오는 코드가 `functions/deliver`(읽기만)와 시험 도구
 *      둘뿐이었다 — **묻는 화면도 적는 코드도 0** 이라 등록하는 학생 전원이 영구 null 이었다.
 *
 * ■ 값은 ASCII 코드, 화면 글자는 라벨 — 갈라도 되는 것만 갈린다
 *   라벨은 몽골어 병기·문구 다듬기로 계속 바뀐다. 그때마다 쌓인 데이터가 흔들리지 않도록
 *   행에 들어가는 것은 코드다. 🔴 자유 입력으로 두지 않는 이유도 같다 — 같은 아이막이 열
 *   가지 표기로 쌓이면 이 칸의 존재 이유(「지역 억양 편차의 유일한 축」)가 그 자리에서 죽는다.
 *
 * ■ `gender` 에 「밝히지 않음」이 있는 이유
 *   이 칸은 **분포 점검 전용**이고 학습 라벨이 아니다(L0 §704) — 「이 엔진이 남학생 목소리에만
 *   강한가」를 묻기 위한 계기판이라, 밝히지 않은 학생이 한 무리로 세어지면 그 목적은 그대로
 *   달성된다. 🔑 그리고 **기록된 비공개는 null 과 다르다**: null 은 「안 물어봤다」와 구별이
 *   안 되지만 `undisclosed` 는 「물었고 학생이 안 밝혔다」다. 둘을 같은 값으로 접으면 나중에
 *   분포를 읽는 쪽이 응답률과 성비를 못 가른다.
 *
 * 🚫 새 문항을 여기 늘리지 않는다 — 늘리는 순간 그것도 「1회 문항」이라 이미 등록한 전원에게
 *   다시 물어야 한다. 문항 추가는 계약(cN) 개정 자리다.
 */

/** 목적 — 값은 발주_수집파이프라인 [CHK-4] 확정분. 같은 오류도 목적에 따라 처방이 다르다. */
const 목표 = Object.freeze([
  Object.freeze({ 값: 'study', 라벨: '유학' }),
  Object.freeze({ 값: 'work', 라벨: '취업 (EPS)' }),
  Object.freeze({ 값: 'culture', 라벨: 'K컬처' }),
]);

/** 성별 — 분포 점검 전용(위 머리말). */
const 성별 = Object.freeze([
  Object.freeze({ 값: 'female', 라벨: '여' }),
  Object.freeze({ 값: 'male', 라벨: '남' }),
  Object.freeze({ 값: 'undisclosed', 라벨: '밝히지 않음' }),
]);

/* 아이막 — 21 아이막 + 울란바토르.
 * 🔑 묻는 것은 **「성장한 곳」**이지 지금 사는 곳이 아니다(억양이 굳는 자리라 그렇다).
 * 라벨을 라틴 표기로 두는 것은 임시가 아니라 **지금 읽히는 표기**를 고른 것이다 — 이 화면은
 * 급수 1 학생도 지나고 앱에 키릴 폰트가 아직 없다(`src/테마.js` 몽골어 층). 한국어 음차로
 * 적으면 한글을 갓 배우는 학생이 자기 고향을 못 찾는다. */
const 아이막 = Object.freeze([
  'ulaanbaatar', 'arkhangai', 'bayan-olgii', 'bayankhongor', 'bulgan', 'darkhan-uul',
  'dornod', 'dornogovi', 'dundgovi', 'govi-altai', 'govisumber', 'khentii',
  'khovd', 'khovsgol', 'omnogovi', 'orkhon', 'ovorkhangai', 'selenge',
  'sukhbaatar', 'tov', 'uvs', 'zavkhan',
].map((값) => Object.freeze({
  값,
  // 'bayan-olgii' → 'Bayan-Olgii' · 'govi-altai' → 'Govi-Altai'
  라벨: 값.split('-').map((조각) => 조각[0].toUpperCase() + 조각.slice(1)).join('-'),
})));

const 문항 = Object.freeze([
  Object.freeze({ 필드: 'home_aimag', 라벨: '자란 곳', 보기: 아이막 }),
  Object.freeze({ 필드: 'gender', 라벨: '성별', 보기: 성별 }),
  Object.freeze({ 필드: 'goal_track', 라벨: '한국어를 배우는 목적', 보기: 목표 }),
]);

/**
 * 세 답이 전부 값목록 안에 있나.
 *
 * 🔴 **비어 있는 것도 실패다.** 「빈 값은 통과」로 두면 그 학생의 세 칸이 조용히 null 로 남고,
 *   그건 위 머리말이 말한 그 손실이라 나중에 못 고친다. 화면이 세 개를 다 고르기 전엔 버튼을
 *   잠그므로, 여기까지 빈 값이 오는 것은 학생이 아니라 **호출부의 결함**이다.
 * 🔑 값 하나만 틀려도 **어느 칸인지 말한다** — 첫 로그인 게이트의 「전부 같은 응답」 규칙은
 *   학생번호의 존재를 감추려는 것이라(§4-1-1 ③) 이 칸들과는 목적이 다르다. 여기서 감추면
 *   앱 버그가 「로그인이 안 된다」로만 보인다.
 *
 * @param {object} 답 `{ home_aimag, gender, goal_track }`
 * @returns {{필드: string, 사유: string}|null} 통과면 `null`
 */
function 답검사(답) {
  const a = 답 && typeof 답 === 'object' ? 답 : {};
  for (const { 필드, 보기 } of 문항) {
    const v = a[필드];
    if (typeof v !== 'string' || !보기.some((b) => b.값 === v)) {
      return { 필드, 사유: `${필드} 는 ${보기.map((b) => b.값).join('·')} 중 하나여야 합니다` };
    }
  }
  return null;
}

module.exports = { 문항, 아이막, 성별, 목표, 답검사 };
