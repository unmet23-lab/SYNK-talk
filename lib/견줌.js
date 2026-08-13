'use strict';
/**
 * 어제의 나와 견주기 — `GET /v1/progress` 응답을 **화면이 그릴 모양**으로 접는다 (P0 §5 S1-11).
 *
 * ■ 왜 lib 인가
 *   화면 파일(`src/어제의나.js`)은 react-native 를 끌고 와서 node 회귀가 열지 못한다. 판정을
 *   거기 두면 검사할 수 없고, 검사기가 화면을 가짜로 바꿔치우면 **정작 판정은 한 번도 안 재진다**
 *   (`src/사건통로.js` 가 같은 이유로 갈라져 나온 파일이다).
 *
 * ■ 🔴 「첫날」은 「어제 0」과 다르다
 *   어제 있었는데 아무것도 안 낸 학생에게 **어제 0 은 참이고 보여줄 값**이다 — 오늘 1 > 어제 0
 *   이 곧 동기다. 비우는 것은 **어제라는 시점이 그 학생에게 아직 없을 때**뿐이고, 그 판정은
 *   서버가 이미 했다(`data: []`). 여기서 다시 세지 않는다 — 두 곳에서 세면 갈라진다.
 *
 * ■ 🚫 줄었다고는 말하지 않는다
 *   숫자는 있는 그대로 낸다(감추면 그 화면을 못 믿는다). 다만 **말**은 늘었을 때만 붙인다 —
 *   이 화면의 용도는 평가가 아니라 동기다(P0 §2-1 · 등수·타 학생 값은 애초에 응답에 없다).
 *
 * ■ 🚫 세 숫자를 한 칸으로 합치지 않는다 (계약 c8 · L0 §9-2)
 *   `retry_count` 는 **한 과제 안**의 반복이고 `correction_retry` 는 **날을 건넌** 학습 고리다.
 *   합치면 「연습을 많이 했다」와 「교정이 먹혔다」가 섞인다. 뒤엣것은 지금 설계의 **유일한
 *   결과 변수**라, 섞이면 엔진은 상관만 배우고 처방을 못 배운다.
 */

/**
 * payload 는 서버가 만들지만 숫자가 아닐 수 있는 자리를 지난다 — 화면에 `NaN` 을 그리느니
 * 0 을 그린다. 🔴 「모르는 값」을 늘어난 것으로도 줄어든 것으로도 세지 않는다.
 */
function 수(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

/** 한 축의 오늘·어제. `늘었나` 는 **엄격히 클 때만** true — 같으면 말이 붙지 않는다. */
function 축(오늘, 어제) {
  const t = 수(오늘);
  const y = 수(어제);
  return { 오늘: t, 어제: y, 늘었나: t > y };
}

/**
 * @param {object} 몸 `GET /v1/progress` 응답 봉투 그대로
 * @returns {null|{날: string|null, 낸것: object, 다시말한것: object, 교정재발화: {오늘: boolean, 어제: boolean}}}
 *   `null` = **비교할 어제가 없다**(첫날). 화면은 이때 칸 자체를 안 띄운다(빈 카드 금지 · C0 §4-3).
 */
function 견줌(몸) {
  const 행 = 몸 && Array.isArray(몸.data) ? 몸.data[0] : null;
  if (!행 || !행.today || !행.yesterday) return null;
  return {
    날: (몸 && 몸.date) || null,
    낸것: 축(행.today.submission_count, 행.yesterday.submission_count),
    다시말한것: 축(행.today.retry_count, 행.yesterday.retry_count),
    /* 🔴 bool 을 숫자로 접지 않는다 — 계약이 이 칸만 bool 인 것은 「몇 번」이 아니라
       「고리가 이어졌나」를 묻기 때문이다(c8). 세는 순간 다른 질문이 된다. */
    교정재발화: { 오늘: 행.today.correction_retry === true, 어제: 행.yesterday.correction_retry === true },
  };
}

/**
 * 늘었으면 그 말을 붙이고, 아니면 `null`.
 * 🚫 줄었을 때 「어제보다 적어요」를 만들지 않는다 — 숫자는 이미 보이고, 그 위에 말을 얹는 것은
 *   동기가 아니라 평가다. 같을 때도 말이 없다(「그대로예요」는 칭찬도 지적도 아니다).
 */
function 늘어난말(값) {
  const 차 = 값 && 값.낸것 ? 값.낸것.오늘 - 값.낸것.어제 : 0;
  return 차 > 0 ? `어제보다 ${차}개 더 보냈어요.` : null;
}

module.exports = { 수, 축, 견줌, 늘어난말 };
