'use strict';
/**
 * 사건 통로 — 앱이 만든 학습 사건이 **서버에 닿는 자리 하나** (C0 §4-1).
 *
 * ■ 왜 파일이 따로인가
 *   원래 이 코드는 `src/제출API.js` 안에 있었고, 거기서는 생산자가 하나뿐이라 문제가 없었다.
 *   결과축 생산자(`src/교정API.js`)를 지으면서 둘이 됐고, 그때 두 가지가 한꺼번에 걸렸다:
 *   ① **판정이 두 곳에 적히면 갈라진다** — 자가검증(계약 위반 = 재시도 무의미)과 `duplicate`
 *      해석은 잊으면 조용히 새는 종류다. 새는 방향은 언제나 「통과」다.
 *   ② `제출API.js` 는 `./저장.js` 를 거쳐 **react-native 를 끌고 온다.** 통로가 거기 있으면
 *      게이트를 그 자체로 세워 재는 회귀를 쓸 수 없고(node 가 그 모듈을 못 연다), 회귀가
 *      게이트를 가짜로 바꿔치기하면 **정작 게이트는 한 번도 안 재진다.**
 *   👉 통로를 여기 두면 두 생산자가 같은 문 하나를 지나고, 그 문이 회귀에 그대로 선다.
 *
 * ⚠ `EXPO_PUBLIC_*` 는 번들에 인라인된다 — 여기 있어도 되는 것은 **anon 키뿐**이다.
 */
import { 인증오류, 토큰되살리기, 현재토큰 } from './인증API.js';
import { 계약판 } from './계약판.js';
import { 검증 } from '../lib/이벤트검증.js';
// 멱등 충돌 때 지을 새 키. **키를 짓는 규칙은 저장소에 하나뿐이어야** 한다 — 여기서 따로
// 지으면 기기에 `crypto` 가 없는 갈래(Hermes)가 이 자리에서만 조용히 깨진다(제출로그 머리말).
import { 흐름id } from '../lib/제출로그.js';
/* 🔑 학생이 읽는 글은 여기 안 박는다 — 정본은 `contents/문구_오류.js` 하나다.
 *   까닭: 몽골어가 붙는 날 문장이 화면 파일마다 흩어져 있으면 번역이 그만큼 갈라진다
 *   (`contents/문구_동의.js` 가 같은 이유로 먼저 그 길을 냈다). 키는 `l10n` 의 string_id 라
 *   감수가 끝나면 그 파일의 `mn` 만 차면 이 자리가 그대로 병기로 선다. */
import { 말 } from '../contents/문구_오류.js';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/* 🔴 읽기에는 `Content-Type` 을 안 붙인다 — `application/json` 은 CORS 안전목록 밖이라
 *   그것 하나 때문에 GET 이 **preflight(OPTIONS)** 를 부르고, 조회 함수들엔 OPTIONS 자리가 없다.
 *   기기(RN)에서는 CORS 가 없어 안 드러나고 **웹에서만** 죽는 종류라 더 늦게 발견된다. */
const 헤더 = (토큰, 읽기) => ({
  apikey: ANON,
  Authorization: `Bearer ${토큰}`,
  ...(읽기 ? {} : { 'Content-Type': 'application/json' }),
  'X-Contract-Ver': 계약판,
});

/**
 * 공통 왕복 — 네트워크 없음은 서버 오류와 **다른 사건**이라 다르게 말한다(다시 시도할 수 있다).
 *
 * 🔑 **`몸` 을 안 주면 GET 이다.** 조회를 같은 문으로 들인 이유: 봉투 해석(`ok:false`·`error`)·
 *   계약판 헤더·네트워크 구분이 조회에도 똑같이 필요한데, 엔드포인트마다 따로 적으면 갈라지고
 *   갈라진 쪽은 조용하다. `과제API`·`교정API` 가 각자 한 벌씩 적어 뒀고 이게 세 번째였다 —
 *   **만료 갱신(§7 왕복 6-⑥)이 서면서 그 셋이 갈라진 값이 됐고**, 그래서 셋을 여기로 모았다.
 *   (`계약판` 을 `src/계약판.js` 로 뗀 것이 그 순환 import 를 푼 한 수다.)
 */
async function 한번(길, 토큰, 몸, 읽기) {
  try {
    return await fetch(`${URL_}/functions/v1/${길}`, {
      method: 읽기 ? 'GET' : 'POST',
      headers: 헤더(토큰, 읽기),
      ...(읽기 ? {} : { body: JSON.stringify(몸) }),
    });
  } catch {
    throw new 인증오류('NETWORK', 말('err.network'), true);
  }
}

export async function 부르기(길, 토큰, 몸) {
  if (!URL_ || !ANON) throw new 인증오류('CONFIG', 말('err.config'), false);
  const 읽기 = 몸 === undefined;
  /* 🔑 첫 발사 «전에» 가장 새 토큰을 고른다(08-31 감사 S1-3·G1-4) — prop 토큰은 갱신 뒤에도
   *   낡은 채라, 이 한 줄이 없으면 만료 이후 모든 호출이 401 한 번을 먼저 사는 이중 왕복이 된다. */
  const 쓸토큰 = 현재토큰(토큰);
  let r = await 한번(길, 쓸토큰, 몸, 읽기);

  /* ── 만료 갱신 (C0 §7 왕복 6-⑥) ────────────────────────────────────────────
   * 🔴 갱신이 **앱 시작 때 한 번뿐**이라, 한 시간을 넘긴 학생은 그 뒤 모든 요청이 401 이었다.
   * 🔴 방아쇠는 **HTTP 401 이지 `AUTH_EXPIRED` 가 아니다** — `verify_jwt=true` 라 만료 토큰은
   *   게이트웨이가 우리 함수 앞에서 자르고, 그 응답에는 우리 봉투가 없다(`error.code` 가 비어 온다).
   *   코드로 가르려 하면 이 통로는 **한 번도 안 돈다**.
   * 🔑 **재시도는 한 번뿐**이다(§7-6 「무한 루프 없음」) — 두 번째 401 은 그대로 아래로 내린다.
   *   갱신 자체의 단일 비행·기억 갱신은 `인증API.토큰되살리기` 가 진다. */
  if (r.status === 401) {
    const 새토큰 = await 토큰되살리기(쓸토큰);
    if (새토큰) r = await 한번(길, 새토큰, 몸, 읽기);
  }

  const 본문 = await r.json().catch(() => ({}));
  if (!r.ok || 본문.ok === false) {
    const e = 본문.error || {};
    /* 🔴 게이트웨이의 401 에는 코드 칸이 없고, 빈 칸은 `SERVER_ERROR`·`retryable:false` 로 접힌다.
     *   그러면 `lib/제출로그.js` 가 그 발화를 `send_final` 로 적고 **`밀린것` 에서 영영 뺀다** —
     *   다시 로그인하면 나갈 수 있었던 발화를 버리는 셈이다. 그 한 칸만 메운다(우리 함수가
     *   낸 401 `AUTH_REQUIRED`(`retryable:false`)는 그대로 둔다 — 그건 재시도가 무의미한 게 맞다). */
    if (r.status === 401 && !e.code) {
      throw new 인증오류('AUTH_EXPIRED', 말('err.auth_expired'), true);
    }
    throw new 인증오류(e.code, e.message, e.retryable);
  }
  return 본문;
}

/**
 * 이미 만들어진 사건 하나를 `POST /v1/events` 로 보낸다.
 *
 * 🔴 **여기서 사건을 만들지 않는다.** `idempotency_key` 는 항목이 들고 온다(C0 §4-1 ·
 *   절단문서 ①-5) — 보낼 때 지으면 재시도마다 새 키가 나고, 그때부터 회선이 끊길 때마다
 *   같은 것이 여러 벌 쌓인다. 이 함수가 인자로 **사건**을 받는 것이 그 규약의 형태다.
 *
 * 🔑 계약 위반은 **보내기 전에** 접는다(`끝: true`). 100번 보내도 계약 위반이라, 안 가르면
 *   몽골 모바일 회선으로 같은 요청이 영원히 나간다. 값목록 검사는 서버가 지고 여기서는
 *   조합·필수·위조 금지만 본다(`lib/이벤트검증.js` 는 의존성 0 이라 번들에도 얹힌다).
 *
 * @returns {Promise<{event_id?: string, 오류?: string, 끝?: boolean}>}
 */
export async function 사건보내기(토큰, 사건) {
  if (!토큰) return { 오류: 말('err.no_token'), 끝: false };
  /* 말투 = 시스템 말투 상시 규칙(유호 확정 08-22) — 영구 실패도 «선생님과 함께 챙기는» 프레임으로.
   * 「끝: true」(서버에 안 갔다)라는 사실은 화면 흐름이 지고, 학생 문장은 다음 걸음만 준다. */
  if (!사건) return { 오류: 말('err.kept.answer'), 끝: true };

  const v = 검증(사건, {});
  // 학생 오류칸에 그대로 뜬다 — 개발 어휘를 앞세우지 않고, 학생이 할 수 있는 다음 걸음을 먼저 준다.
  // 실패 가시성(P0 §4-1)은 괄호로 보존한다: 원인 문자열을 지우면 강사·개발이 못 쫓는다.
  if (!v.ok) {
    return { 오류: `${말('err.kept.record')} (계약 위반: ${v.오류들.join(' · ')})`, 끝: true };
  }

  const 첫판 = await 한벌쏘기(토큰, 사건);
  if (!첫판.충돌) return 첫판.결과;

  /* 🔴 `IDEMPOTENCY_CONFLICT` = **이 키는 이미 다른 내용으로 저장돼 있다**(C0 심문 B2).
   *   서버가 거절하는 것만으로는 처방이 아니다 — `retryable:false` 라 `lib/제출로그.js` 가
   *   `send_final` 로 적고, 그러면 결과는 지금과 **똑같은 소멸**이다. 그래서 앱이 짝을 진다:
   *   키를 새로 지어 **한 번** 다시 보낸다. 새 키라 같은 충돌은 원리상 안 난다.
   * 🔑 재시도는 1회뿐이다. 새 키로도 충돌하면 그건 우리가 모르는 고장이고, 그때 루프를
   *   돌면 몽골 모바일 회선으로 같은 발화가 영원히 나간다.
   * 🔑 새 키는 로그 항목에 되적지 않는다 — 성공하면 그 자리에서 `event_id` 가 적히고, 이후
   *   인과 참조는 전부 그 event_id 로 간다(서버 고리풀기는 event_id 를 먼저 본다). */
  const 다시 = { ...사건, idempotency_key: 흐름id() };
  const 둘째판 = await 한벌쏘기(토큰, 다시);
  if (둘째판.충돌) {
    return { 오류: 말('err.kept.speech'), 끝: true };
  }
  return 둘째판.결과;
}

/** 한 번 쏘고 **충돌인지**를 갈라 돌려준다. 충돌 판정을 두 곳에 적으면 갈라지므로 여기 하나다.
 *  ⚠ 이름이 `한번` 이 아닌 이유: 위 46행에 같은 이름의 HTTP 왕복 함수가 이미 있다. */
async function 한벌쏘기(토큰, 사건) {
  let 본문;
  try {
    본문 = await 부르기('events', 토큰, { events: [사건] });
  } catch (e) {
    return { 충돌: false, 결과: { 오류: String(e.message || e), 끝: e.retryable === false } };
  }

  const 한건 = 본문.results && 본문.results[0];
  // `duplicate` 는 실패가 아니라 **재전송이 접힌 것**이다 — 이제 서버가 **내용까지 대조하고**
  // 같을 때만 그렇게 부른다(다르면 아래 `IDEMPOTENCY_CONFLICT` · C0 §4-1).
  if (한건 && (한건.status === 'stored' || 한건.status === 'duplicate')) {
    return { 충돌: false, 결과: { event_id: 한건.event_id } };
  }
  const e = (한건 && 한건.error) || {};
  if (e.code === 'IDEMPOTENCY_CONFLICT') return { 충돌: true, 결과: null };
  return { 충돌: false, 결과: { 오류: e.message || 말('err.delivery_slow'), 끝: e.retryable === false } };
}
