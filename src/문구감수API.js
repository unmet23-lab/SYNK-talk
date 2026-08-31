'use strict';
/**
 * 문구 감수 API — **외부 감수자 통로**(`l10n`)를 앱에서 부르는 자리.
 *
 * ■ 이 파일이 닫는 것 — 함수는 섰는데 **부르는 코드가 0**이었다
 *   `src/검수API.js` 가 닫은 것과 같은 모양의 구멍이다: 표 둘·뷰 하나·경로 셋이 서 있어도
 *   부르는 코드가 없으면 **감수 처리량은 원리상 0**이고, 그러면 몽골어는 영영 안 온다.
 *
 * ■ 학생 통로와 **같은 문**을 지난다 (`src/사건통로.js 부르기`)
 *   봉투 해석(`ok:false`·`error`)·계약판 헤더·401 재갱신·네트워크 구분이 여기에도 똑같이
 *   필요하다. `fetch` 를 따로 쓰면 그 넷이 두 벌이 되고 갈라진 쪽은 조용하다.
 *   🔑 그래서 **이 파일에는 주소도 키도 없다.**
 *
 * ■ 🔴 학생 자원에 한 칸도 안 닿는다 — 이 통로의 존재 이유가 그것이다
 *   감수자는 외부 계약자다. `review`(발화 검수)에 얹지 않고 문을 따로 낸 것은 역할 설정이
 *   아니라 **자원을 가르기 위해서**였다(마이그레이션 머리말). 화면·API 도 그 선을 지킨다 —
 *   `tests/문구감수화면.test.js` 가 소스에서 기계로 잰다.
 *
 * ■ 🚫 재제안 금지
 *   · 오디오·학생번호를 큐에 싣기 — 그 순간 이 통로를 «따로 낸 이유»가 사라진다.
 *   · `verdict` 를 서버가 파생하게 하기 — 「원문을 고쳐야 한다」는 텍스트 비교로 안 나온다
 *     (옮길 수 없는 한국어라는 뜻이고 사람만 안다 · l10n Fn 머리말).
 */
import { 부르기 } from './사건통로.js';

/* 🚫 어휘·판정을 여기서 **되팔지 않는다** — 화면이 `lib/문구감수.js` 에서 곧바로 가져간다.
 *   재수출을 두면 「어휘의 출처가 API 인가 lib 인가」가 두 답이 되고, 실제로 아무도 안 썼다
 *   (08-27 검토 실측 0건). 갈라지는 날 증상은 400 이 아니라 **500** 이다 — DB 가 CHECK 밖 값을
 *   받고 그 자리에서 죽는다. 회귀 = `tests/문구감수화면.test.js` ④ 가 화면이 lib 을 쓰는지 문다. */

/** 한 번에 받아 오는 줄 수. 서버 상한(`쪽상한`)보다 작게 잡는다 — 감수는 한 화면에서 훑는 일이다. */
export const 감수쪽크기 = 20;

/**
 * `GET /v1/l10n/queue` — 감수 대기 문장 한 쪽.
 *
 * 🔴 **빈 배열은 오류가 아니다.** 오늘은 반입 전이라 구조적으로 0줄이고, 감수가 다 끝난 날도
 *   0줄이다. 그 둘은 다른 사건인데 화면에서 같은 모양이 되기 쉬워, 화면이 「끝났다」와
 *   「아직 안 들어왔다」를 가르는 말을 따로 쥔다(`src/문구감수화면.js` 빈 자리).
 * 🔑 커서(`after`)는 **string_id 하나**다 — 정렬축이 PK 하나라 동률이 원리상 없다.
 *   남의 커서 꼴(검수 큐의 복합 커서)을 실으면 서버가 400 으로 거절한다(`lib/문구감수.js 커서`).
 *
 * @param {string} 토큰
 * @param {{개수?: number, 커서?: string|null}} [옵션]
 * @returns {Promise<{목록: object[], 다음커서: string|null, 총대기: number|null}>}
 */
export async function 큐받기(토큰, 옵션 = {}) {
  const 질의 = [];
  질의.push(`limit=${encodeURIComponent(String(옵션.개수 || 감수쪽크기))}`);
  if (옵션.커서) 질의.push(`after=${encodeURIComponent(옵션.커서)}`);
  const 본문 = await 부르기(`l10n/queue?${질의.join('&')}`, 토큰);
  return {
    목록: Array.isArray(본문.data) ? 본문.data : [],
    /* 서버는 한 쪽을 꽉 채웠을 때만 커서를 준다 — 마지막 쪽이 정확히 limit 개면 빈 쪽을 한 번
       더 받는다. 화면은 **빈 응답을 끝으로 읽는다**(「없다」를 잘못 말하는 것보다 싸다). */
    다음커서: 본문.next ?? null,
    /* 옛 서버 응답(total 없음)엔 null 로 접힌다 — 하위호환. */
    총대기: Number.isFinite(본문.total) ? 본문.total : null,
  };
}

/**
 * `POST /v1/l10n/verify` — 판정 하나를 확정한다. 한 트랜잭션에 둘(판정 insert · 상태 전이).
 *
 * 🔑 보내기 «전»에 `lib/문구감수.js 확정요청` 으로 한 번 거른다 — 서버가 어차피 다시 보지만,
 *   여기서 거르면 감수자가 **왕복 없이** 무엇을 고칠지 안다(칸 이름까지 돌려준다).
 *   같은 함수를 쓰므로 두 층의 규칙이 갈라질 수가 없다.
 *
 * @param {string} 토큰
 * @param {{string_id: string, verdict: string, final_mn?: string|null,
 *          note?: string|null, supersedes?: string|null}} 요청
 * @returns {Promise<{review_id: string, created_at: string, status: string}>}
 */
export async function 확정하기(토큰, 요청) {
  const 본문 = await 부르기('l10n/verify', 토큰, 요청);
  const d = 본문.data || {};
  return { review_id: d.review_id, created_at: d.created_at, status: d.status };
}
