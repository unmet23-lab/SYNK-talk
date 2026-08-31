'use strict';
/**
 * 검수 API — **직원 통로**(`review`)를 앱에서 부르는 자리 (docs/검수_내부계약.md).
 *
 * ■ 이 파일이 닫는 것 — 함수는 다 섰는데 **부르는 코드가 0**이었다
 *   판 22열(`20260809050000`) · `review` 함수 셋(§3 큐 · §4 서명 · §5 승인·폐기) ·
 *   c11 물리 넷까지 서 있는데, 저장소 전체에서 그 경로를 부르는 코드가 **한 줄도 없었다**.
 *   그 상태의 검수 처리량은 원리상 0이고, 처리량 0은 **파이프라인 전체가 0**이라는 뜻이다
 *   (발주 §3 「검수 처리량이 곧 파이프라인 처리량」).
 *
 * ■ 학생 통로와 **같은 문**을 지난다 (`src/사건통로.js`)
 *   봉투 해석(`ok:false`·`error`)·계약판 헤더·401 재갱신·네트워크 구분이 직원 경로에도
 *   똑같이 필요하다. 여기서 `fetch` 를 따로 쓰면 그 넷이 두 벌이 되고, 갈라진 쪽은 조용하다
 *   (`과제API`·`교정API` 가 각자 적었다가 만료 갱신이 서면서 갈라진 자리가 그 실측이다).
 *   🔑 그래서 **이 파일에는 주소도 키도 없다.**
 *
 * ■ 🔴 읽기는 사건을 만들지 않는다 — 단 **조회 감사는 예외**다 (§1·§2)
 *   큐를 한 번 읽으면 `staff_access_log` 에 한 행이 남고, 오디오 서명 한 번도 한 행이다.
 *   그 행은 「나중에 보는 장부」가 아니라 **승인 게이트 ②가 읽는 입력**이다. 그래서
 *   여기서 조회를 함부로 되풀이하면 게이트의 뜻이 옅어진다 — 화면이 언제 부르는지가
 *   보안 판정이 되는 드문 자리다(`src/검수화면.js` 프리로드 머리말).
 *
 * ■ 🚫 재제안 금지
 *   · 함수 4개로 쪼개기·`action` 파라미터 — 경로가 이미 그 일을 한다(§0).
 *   · `verdict` 를 앱이 골라 보내기 — 서버가 세 텍스트에서 파생한다(§5-1). 미리 그려서도
 *     안 된다: 화면이 낸 짐작과 서버 판정이 갈리면 검수자는 **저장된 라벨을 안 본 채** 넘어간다.
 *   · `event_id` 를 화면에 주기 — 판이 그 열을 연 것은 서버가 승격에 쓰려는 것이다.
 */
import { 부르기 } from './사건통로.js';
import { 인증오류 } from './인증API.js';

/**
 * 폐기 사유 닫힌 어휘 — **정본은 DB CHECK**(`pipeline_jobs_discard_reason_c*` — 접미는
 * 현행 계약판 · 서버 배선은 like 패턴으로 읽어 접미를 안 탄다) 하나다.
 *
 * 🔴 여기 있는 것은 **네 번째 사본**이고, 그 사실을 숨기지 않는다. 없앨 수가 없다:
 *   검수자는 여섯 개 중 하나를 눌러야 하는데 서버는 이 어휘를 내주는 경로가 없고
 *   (`review` 는 넷뿐이다 · 🚫새 엔드포인트), 어휘를 모르면 폐기 버튼을 못 그린다.
 * 🔑 없앨 수 없는 사본은 **기계에 물린다** — `tests/폐기사유.test.js` 가 CHECK·산문 둘과
 *   이 상수를 한자리에서 대조한다. 갈라지면 증상은 400 이 아니라 **500**(서버가 CHECK 를
 *   읽어 대조하는데 목록에 없는 값이 오면 그 자리에서 죽는다)이라 더 늦게 발견된다.
 * ⚠ 조각이 안 부어진 DB 에서는 서버가 읽는 어휘가 0개라 **폐기가 전부 거부된다**(§5-2).
 *   그건 결함이 아니라 「사유 없는 폐기를 안 남긴다」는 선택이다 — 화면은 그 오류를 그대로 보인다.
 */
export const 폐기사유 = Object.freeze([
  '무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가',
]);

/**
 * 오류 태그 24종 — **정본은 `계약/수집_교정_계약.json` 의 `오류태그`** 다.
 *
 * 🔑 계약 JSON 을 import 하지 않는다 — 28KB 가 통째로 번들에 인라인된다(`src/과제API.js`·
 *   `src/교정API.js` 가 같은 근거로 손 상수를 뒀다). 여기 실리는 것은 24줄뿐이다.
 * 🔑 없앨 수 없는 사본은 기계에 물린다 — `tests/검수API.test.js` 가 계약 파일과 **순서까지**
 *   대조한다. 갈라져도 서버는 안 막는다(§5-3: 태그 어휘는 일부러 검증 안 한다 — AI 행도
 *   같은 수준으로 쓰므로 한쪽만 조이면 사람 라벨이 AI 라벨보다 좁아진다). 즉 이 사본이
 *   낡으면 **증상 없이** 사람 라벨만 조용히 다른 어휘가 된다. 그래서 검사가 유일한 방어선이다.
 * 🚫 자유 입력으로 바꾸지 않는다 — 그러면 정본 목록을 우회하는 문이 생긴다.
 */
export const 오류태그 = Object.freeze([
  '조사:주격(이/가·은/는)', '조사:목적격(을/를)', '조사:처소(에·에서)', '조사:여격(에게·한테)',
  '조사:도구·방향(로/으로)', '조사:접속(와/과·하고)', '조사:기타',
  '어미:시제', '어미:연결어미', '어미:불규칙활용', '어미:종결',
  '높임:주체', '높임:상대(존댓말 등급)',
  '어휘:유의어혼동', '어휘:연어(자연스러운 짝)', '어휘:없는말',
  '맞춤법:받침', '맞춤법:띄어쓰기', '맞춤법:기타',
  '어순', '누락:필수성분', '중복:불필요', '화용:공손성', '오류없음',
]);

/** 한 쪽에 몇 건을 받나. 계약 범위는 1~20 이고 **범위 밖은 서버가 깎지 않고 400** 이다(§3). */
export const 기본쪽크기 = 10;
/** 반 모드의 쪽 크기 = 계약 상한(§3). 정원이 16명이라 한 반이 대개 **한 쪽에 담긴다** —
 *  화면이 쪽을 이어 받기는 하지만(P1-②), 왕복이 적을수록 20분 순회가 덜 끊긴다. */
export const 반쪽크기 = 20;

/**
 * §3 `GET /v1/review/queue` — 검수 큐 한 쪽.
 *
 * 🔴 빈 배열은 오류가 아니다 — 검수할 것이 없는 날이 정상이고, 오늘은 **AI 교정 생산자가
 *   운영에 안 올라가 있어 구조적으로 0행**이다(대기열 P1). 화면은 그것을 「고장」으로 그리지 않는다.
 * 🔑 커서는 **받은 것을 그대로** 싣는다(서버가 모양을 본다 · `lib/검수커서.js`).
 *
 * @param {string} 토큰
 * @param {{개수?: number, 커서?: string|null}} [옵션]
 * @returns {Promise<{목록: object[], 다음커서: string|null}>}
 */
export async function 큐받기(토큰, 옵션 = {}) {
  const 질의 = [];
  if (옵션.개수) 질의.push(`limit=${encodeURIComponent(String(옵션.개수))}`);
  if (옵션.커서) 질의.push(`cursor=${encodeURIComponent(옵션.커서)}`);
  /* §3-2 반 모드 — 반 id 를 실으면 판·정렬·커서가 통째로 갈린다(교사 동선 순).
   * ⚠ 두 모드의 커서는 꼴이 달라 섞으면 400 이다 — 화면은 반을 바꿀 때 커서를 버린다. */
  if (옵션.반) 질의.push(`class=${encodeURIComponent(String(옵션.반))}`);
  const 본문 = await 부르기(`review/queue${질의.length ? `?${질의.join('&')}` : ''}`, 토큰);
  return {
    목록: Array.isArray(본문.data) ? 본문.data : [],
    다음커서: 본문.next_cursor ?? null,
  };
}

/**
 * §3-2 `GET /v1/review/classes` — 반 카드 목록 + 반마다 「기다리는 것 n」.
 *
 * 🔴 **빈 목록은 「전부 처리됨」이 아니다** — 반 다리(`roster-ingest` 신판)가 안 선 상태다.
 *   화면은 그 둘을 같은 모양으로 그리지 않는다(§3-2).
 * 🔑 `waiting` 은 목록을 그리는 순간의 스냅샷이다 — 반을 연 뒤의 수와 어긋나는 것이 정상이라
 *   화면이 두 수를 대조해 「고장」으로 읽지 않는다.
 */
export async function 반목록받기(토큰) {
  const 본문 = await 부르기('review/classes', 토큰);
  if (!Array.isArray(본문.classes)) {
    throw new 인증오류('CONTRACT_VIOLATION', '응답에 classes 칸이 없어요 — 서버와 앱의 판이 어긋났어요', false);
  }
  return 본문.classes.map((c) => {
    if (c.waiting === undefined) {
      throw new 인증오류('CONTRACT_VIOLATION', '응답에 waiting 칸이 없어요 — 서버와 앱의 판이 어긋났어요', false);
    }
    return {
      id: String(c.class_id),
      열쇠: c.class_key ?? '',
      이름: c.display_name ?? null,
      대기: Number(c.waiting) || 0,
    };
  });
}

/**
 * §4 `POST /v1/review/audio` — 비공개 버킷의 오디오를 **10분짜리 서명 URL**로 받는다.
 *
 * 🔴 이것 없이는 재생 자체가 불가능하다(버킷이 비공개다).
 * 🔑 **발급은 게이트를 안 연다**(§2 개정 2026-08-09) — 그 자리는 아래 `열어봤다알리기` 가
 *   진다. 그래서 프리로드로 미리 받아도 게이트가 0개 열린다. 다만 서명은 그 자체가 비공개
 *   버킷의 열쇠라 수명(10분)만큼 사는 꼬리가 남으므로, 화면은 여전히 아껴 부른다.
 *
 * @returns {Promise<{url: string, 만료: string|null}>}
 */
export async function 오디오서명받기(토큰, submission_id) {
  const 본문 = await 부르기('review/audio', 토큰, { submission_id });
  return { url: 본문.url, 만료: 본문.expires_at ?? null };
}

/**
 * §4-2 `POST /v1/review/played` — **재생이 실제로 시작됐다**를 알린다.
 *
 * 🔴 승인 게이트 ②의 **유일한** 증거다. 안 부르면 확정이 `GATE_NOT_MET` 으로 거절된다 —
 *   그것이 설계다(서명만 받고 안 들은 항목을 통과시키지 않는다).
 * 🔑 **아무것도 받아 오지 않는다**(응답은 `{ok:true}`뿐). 서명이 안 나가므로 이 호출은
 *   누수 위험이 0이고, 그래서 확정분(재검수 창)에도 열려 있다.
 * 🔑 **재생마다 부른다** — 게이트가 묻는 것은 「몇 번 열었나」가 아니라 「마지막이 언제인가」다
 *   (재검수는 마지막 판정 **이후**의 재생을 요구한다). 🚫 한 번만 보내고 캐싱하기: 그러면
 *   `Z` 진입 뒤 다시 들어도 서버가 모른다.
 */
export async function 열어봤다알리기(토큰, submission_id) {
  await 부르기('review/played', 토큰, { submission_id });
  return true;
}

/**
 * §5-1 `POST /v1/review/approve` — 확정.
 *
 * 🔑 `verdict` 를 **안 보낸다** — 서버가 세 텍스트에서 파생해 응답에 실어 준다.
 * 🔑 `promote` 를 안 보내면 **승격 안 함**이다(서버 기본값). 빠뜨린 요청이 승격으로 접히면
 *   「검수 완료 = 훈련 적격」이 이름만 바꿔 성립한다.
 * 🔴 응답의 `listen_gate.measured` 는 오늘 **항상 false** 다 — `stt_segments` 생산자가 0이라
 *   문턱이 늘 하한 3초로 접힌다. 화면은 그 사실을 검수자에게 그대로 보인다(미측정 ≠ 통과).
 *
 * @param {string} 토큰
 * @param {object} 요청 §5-1 표 그대로(`submission_id`·`reviewed_correction_id`·
 *   `transcript_verified`·`corrected_text`·`review_listened_ms` 필수)
 * @returns {Promise<{correction_id: string, verdict: string, promotion_intent: boolean,
 *   listen_gate: {required_ms: number, measured: boolean}}>}
 */
export async function 승인하기(토큰, 요청) {
  const 본문 = await 부르기('review/approve', 토큰, 요청);
  return {
    correction_id: 본문.correction_id,
    verdict: 본문.verdict,
    promotion_intent: 본문.promotion_intent === true,
    listen_gate: 본문.listen_gate ?? null,
  };
}

/**
 * §5-2 `POST /v1/review/discard` — 소프트 폐기. **파일은 남는다**(노이즈도 강건성 재료).
 * ⚠ 철회(학생이 동의를 거둔 것)는 **다른 사건**이고 파일을 지운다 — 이 경로가 아니다.
 */
export async function 폐기하기(토큰, submission_id, 사유) {
  const 본문 = await 부르기('review/discard', 토큰, { submission_id, reason: 사유 });
  return { 폐기됨: 본문.discarded === true, 사유: 본문.reason ?? 사유 };
}
