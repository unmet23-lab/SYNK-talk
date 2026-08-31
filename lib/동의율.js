'use strict';
/* 본인 동의율 — ㉡ 추정기의 첫 성적표(세층합류_설계_v1 §6 · 유호 위임 09-01). **순수 함수만.**
 *
 * ■ 무엇을 재나 — `lib/학습자상태.js` 머리가 스스로 적어 둔 빈 칸:
 *   「estimator_confidence 는 정확도가 아니라 표본 충분도 — 맞을 확률을 추정할 방법이 지금
 *   없다(**정답 라벨이 없다**)」. 되묻기 응답(`estimate.responded`)이 그 라벨이다.
 *   이 파일은 그 라벨을 **(estimator_version · trait_axis · shown_key)별**로 센다.
 *
 * ■ 🔴 이름이 «동의율»인 이유 — 적중률이 아니다. 학생의 '맞다'는 정답 라벨이되 참값 보장이
 *   아니라서(자기보고 한계 · 셋째 눈 = 시즌 회고의 강사), 이 수를 「추정기가 맞을 확률」로
 *   읽는 순간 자가 거짓말을 시작한다. 소비자(성과계기판)는 각주로 이 구분을 든다(⑤ 자기설명).
 *
 * ■ 🔴 셈의 규율 셋 (세층합류 §6 — 전부 기존 확정의 상속이다)
 *   ① **판을 가로질러 합산 금지** — 다른 판(추정판+판정판)의 답은 다른 질문에 대한 답이다
 *      (「판이 다르면 대조하지 않는다」 — 엔진점수 관행 그대로).
 *   ② **학생별·(판·축·키)별 «마지막 답» 접기** — 확인축 v14 무늬 상속: 긍정 키는 재노출이
 *      허용돼 같은 (축·키)에 답이 여럿 쌓이고, 원행으로 세면 v14 가 걷어낸 모순 쌍이 자에
 *      잡음으로 되들어온다. 접힘·뒤집힘은 세어 드러낸다(감춘 모순의 계기판).
 *   ③ **무응답은 분모에 없다** — c13 에서 무응답은 행 부재다(값 '대기'가 없다). 「n = 맞다 a +
 *      아니다 b」 꼴로만 보고한다(합계 = 갈래+갈래 — 좋은 0 과 「안 물었다」를 가른다).
 *
 * ■ 표본 문턱 없음 — 표본이 적으면 값을 감추는 게 아니라 분모를 «같이» 낸다(F207 — 초록은
 *   분모와 함께). 「표본 n 이면 판단 보류」는 읽는 사람(유호님·강사)의 몫이지 자의 몫이 아니다.
 */

/** ISO → 밀리초. 못 읽으면 0 — 정렬 안정용(확인축과 같은 처리 · 값 자체는 집계에 안 쓴다). */
const 때 = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : 0; };

/**
 * `estimate.responded` 행들 → 판별 동의율 표.
 * @param {Array<object>} 행들 engine.learning_events 행(learner_id·event_id·occurred_at·payload).
 *   다른 event_type 이 섞여 있어도 된다 — 여기서 거른다(성과계기판의 한 질의를 그대로 받는 자리).
 * @returns {{판들: Record<string, object>, 총행수: number, 총학생수: number}}
 *   판들[판] = { 맞다, 아니다, n, 학생수, 접힘수, 뒤집힘수,
 *               축별: { [축]: { 맞다, 아니다, 키별: { [키]: {맞다, 아니다} } } } }
 *   n = 접힌 (학생·축·키) 쌍 수 = 맞다 + 아니다. 동의율 계산(맞다/n)은 렌더층 몫 — 분모 0 을
 *   여기서 비율로 접으면 「안 물었다」가 값의 얼굴을 쓴다.
 */
function 동의율표(행들) {
  const 유효 = [];
  const 학생들 = new Set();
  for (const e of Array.isArray(행들) ? 행들 : []) {
    if (!e || e.event_type !== 'estimate.responded') continue;
    const p = e.payload || {};
    if (p.response !== '맞다' && p.response !== '아니다') continue;   // 모르는 값은 안 센다 — 지어내지 않는다
    const 학생 = e.learner_id != null ? String(e.learner_id) : '(학생없음)';
    학생들.add(학생);
    유효.push({
      학생,
      판: typeof p.estimator_version === 'string' && p.estimator_version ? p.estimator_version : '(판없음)',
      축: typeof p.trait_axis === 'string' && p.trait_axis ? p.trait_axis : '(축없음)',
      키: typeof p.shown_key === 'string' && p.shown_key ? p.shown_key : '(키없음)',
      답: p.response,
      t: 때(e.occurred_at),
      id: String(e.event_id ?? ''),
    });
  }
  /* 결정적 정렬 — (시각, event_id). 확인축 v14 와 같은 자: 같은 밀리초의 동시 답도 늘 같은
   * 순서로 접혀야 「다시 계산했더니 값이 다르다」가 안 생긴다. */
  유효.sort((a, b) => (a.t !== b.t ? a.t - b.t : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));

  const 판들 = {};
  const 판칸 = (판) => (판들[판] ??= {
    맞다: 0, 아니다: 0, n: 0, 학생수: 0, 접힘수: 0, 뒤집힘수: 0,
    축별: {}, _마지막별: new Map(), _학생들: new Set(),
  });

  for (const r of 유효) {
    const 칸 = 판칸(r.판);
    const k = `${r.학생}|${r.축}|${r.키}`;
    const 앞 = 칸._마지막별.get(k);
    if (앞) {
      칸.접힘수 += 1;
      if (앞.답 !== r.답) 칸.뒤집힘수 += 1;
    }
    칸._마지막별.set(k, r);
    칸._학생들.add(r.학생);
  }

  for (const 칸 of Object.values(판들)) {
    for (const r of 칸._마지막별.values()) {
      칸[r.답] += 1;
      const 축 = (칸.축별[r.축] ??= { 맞다: 0, 아니다: 0, 키별: {} });
      축[r.답] += 1;
      (축.키별[r.키] ??= { 맞다: 0, 아니다: 0 })[r.답] += 1;
    }
    칸.n = 칸.맞다 + 칸.아니다;
    칸.학생수 = 칸._학생들.size;
    delete 칸._마지막별;
    delete 칸._학생들;
  }

  return { 판들, 총행수: 유효.length, 총학생수: 학생들.size };
}

module.exports = { 동의율표 };
