'use strict';
/**
 * 강사 API — **골든 판정 통로**(`teach`)를 앱에서 부르는 자리 (docs/M2_라벨회로_설계.md §3·§7).
 *
 * ■ 이 파일이 닫는 것 — 서버는 다 섰는데 **입구가 0줄**이었다
 *   `functions/teach`(큐·판정) · `lib/골든표본.js`(주간 시드) · `tools/성적표.js`(N12)가
 *   한 커밋으로 서 있는데(talk `805db04`), 그 경로를 부르는 코드가 저장소에 **한 줄도 없었다**.
 *   그 상태의 골든 라벨 생산량은 원리상 0이고, 라벨 0은 **N12 성적표가 영원히 빈 표**라는 뜻이다.
 *   ⚠ 라벨은 소급이 비싸다 — 지난 주 표본은 다음 주에 다시 안 뜬다(주 시드가 갈린다).
 *
 * ■ 검수 API 와 **같은 문**을 지난다 (`src/사건통로.js`)
 *   봉투 해석·계약판 헤더·401 재갱신·네트워크 구분이 여기도 똑같이 필요하다. `fetch` 를
 *   따로 쓰면 그 넷이 두 벌이 되고 갈라진 쪽은 조용하다(`검수API` 머리말의 실측 그대로).
 *   🔑 그래서 **이 파일에는 주소도 키도 없다.**
 *
 * ■ 🔴 어휘 사본이 **0개**다 — 이 파일은 verdict 세 값을 모른다
 *   화면이 `lib/검수확정.js` 의 `VERDICT`·`골든판정요청` 을 **직접** 부른다(`src/검수화면.js`
 *   가 같은 lib 에서 `청취문턱` 을 끌어 쓰는 선례). 검수 쪽이 폐기사유·오류태그를 손 상수로
 *   둔 것은 서버가 그 어휘를 **안 내주기** 때문인데(§5-2), 골든 어휘는 그 lib 이 곧 정본이라
 *   사본을 만들 이유가 없다. 사본이 없으면 갈릴 일도 없다.
 *
 * ■ 🚫 재제안 금지
 *   · 주(week)를 파라미터로 보내기 — **서버가 정한다**(`teach:229`). 강사가 임의의 주를 열면
 *     표본을 「골라」 볼 수 있고 그 순간 무작위가 깨진다(설계 §4 의 심장).
 *   · `model`·`prompt_ver` 를 화면에 주기 — 서버가 일부러 안 싣는다(`teach:292`). 판정 전에
 *     어느 모델인지 보이면 그 편향이 N12 승률에 그대로 들어간다.
 *   · 판정 결과를 낙관적으로 화면에 반영하고 넘어가기 — 골든 행은 append-only 라
 *     `ALREADY_JUDGED` 로 되돌릴 수 없다. 서버가 준 것만 「판정됐다」로 그린다.
 */
import { 부르기 } from './사건통로.js';

/**
 * §3 `GET /v1/teach/gold/queue` — 이번(=지난 완결) 주의 표본.
 *
 * 🔴 **빈 목록은 오류가 아니다** — 풀이 비는 주가 정상이고, 오늘은 `ANTHROPIC_API_KEY` 가
 *   없어 AI 교정 자체가 안 생긴다(설계 §8 「이 회로의 결함이 아니라 상류의 상태」).
 *   그래서 화면은 `pool_size` 를 같이 받아 **「표본이 0」과 「풀이 0」을 갈라 말한다** —
 *   안 가르면 강사는 시스템이 고장난 줄 안다.
 * 🔑 `sample_size` 는 서버 상수(주 5건)다. 화면이 5를 손으로 적지 않는다 — 상수가 바뀌는
 *   날 화면만 옛 숫자를 말하고, 그 거짓말은 아무 데서도 안 빨개진다.
 * 🔑 **한 번 읽으면 감사 1행**이 남는다(`teach:241` · 0건도 남긴다). 그 장부는 「나중에 보는
 *   기록」이 아니라 조회 횟수의 분모라, 화면이 함부로 되풀이 조회하면 분모가 조용히 달라진다.
 *
 * @param {string} 토큰
 * @returns {Promise<{주: string, 남음: number, 표본크기: number, 풀크기: number, 목록: object[]}>}
 */
export async function 큐받기(토큰) {
  const 본문 = await 부르기('teach/gold/queue', 토큰);
  return {
    주: 본문.week ?? '',
    남음: Number(본문.remaining) || 0,
    표본크기: Number(본문.sample_size) || 0,
    풀크기: Number(본문.pool_size) || 0,
    목록: Array.isArray(본문.data) ? 본문.data : [],
  };
}

/**
 * §3 `POST /v1/teach/gold/judge` — 판정 1건.
 *
 * 🔴 **비가역이다** — 골든 행 + 감사 1행이 한 트랜잭션으로 서고, 같은 AI 행을 다시 판정하면
 *   `ALREADY_JUDGED` 로 거절된다(`teach:387`). 화면이 「고름 → 저장」 두 탭을 요구하는 근거가
 *   이것이다(설계 §7 은 ①②를 원클릭으로 적었다 — 그 한 탭이 오탭 하나로 골든 라벨을
 *   영구히 오염시킨다. 갈린 자리라 보고에 올렸다).
 * 🔑 `transcript_at_review` 를 **안 보낸다** — 서버가 판정 시점 전사를 직접 박는다
 *   (`teach:426`). 앱이 보내면 화면에 없던 문자열을 라벨의 근거로 굳힐 수 있다.
 * 🔑 `rubric_scores` 도 **안 보낸다** — 축 어휘의 정본이 아직 없다(계약 JSON 은 이름만 싣고
 *   축 목록이 0이고, 서버 검증기는 「객체면 통과」다). 화면이 축을 지어 넣으면 그 순간 그것이
 *   사실상 정본이 되고, 진짜 루브릭이 서는 날 옛 행들이 **다른 축 체계로 굳은 채** 섞인다 —
 *   소급 불가라 v1 은 비운다(판정 자리로 올렸다). 🚫 「일단 넣고 나중에 정리」.
 *
 * @param {string} 토큰
 * @param {{reviewed_correction_id: string, verdict: string, corrected_text: string|null,
 *   error_tags: string[], verdict_reason: string|null, l1_source_phrase: string|null}} 요청
 * @returns {Promise<{correction_id: string, reviewed_correction_id: string,
 *   verdict: string, week: string}>}
 */
export async function 판정하기(토큰, 요청) {
  const 본문 = await 부르기('teach/gold/judge', 토큰, 요청);
  return {
    correction_id: 본문.correction_id,
    reviewed_correction_id: 본문.reviewed_correction_id,
    verdict: 본문.verdict,
    주: 본문.week ?? '',
  };
}
