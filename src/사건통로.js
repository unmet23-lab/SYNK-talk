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
import { 인증오류 } from './인증API.js';
import { 계약판 } from './과제API.js';
import { 검증 } from '../lib/이벤트검증.js';

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
 *   갈라진 쪽은 조용하다. `과제API`·`교정API` 가 이미 각자 한 벌씩 적어 뒀고 이게 세 번째였다.
 *   ponytail: 그 둘은 아직 자기 사본을 쓴다 — `계약판` 이 `과제API` 에 살아 지금 바꾸면
 *   순환 import 가 된다. 그 상수를 옮기는 날 함께 이 문으로 들인다.
 */
export async function 부르기(길, 토큰, 몸) {
  if (!URL_ || !ANON) throw new 인증오류('CONFIG', '서버 설정이 없어요', false);
  const 읽기 = 몸 === undefined;
  let r;
  try {
    r = await fetch(`${URL_}/functions/v1/${길}`, {
      method: 읽기 ? 'GET' : 'POST',
      headers: 헤더(토큰, 읽기),
      ...(읽기 ? {} : { body: JSON.stringify(몸) }),
    });
  } catch {
    throw new 인증오류('NETWORK', '인터넷 연결을 확인해 주세요', true);
  }
  const 본문 = await r.json().catch(() => ({}));
  if (!r.ok || 본문.ok === false) {
    const e = 본문.error || {};
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
  if (!토큰) return { 오류: '로그인이 풀렸어요', 끝: false };
  if (!사건) return { 오류: '보낼 내용을 만들지 못했어요', 끝: true };

  const v = 검증(사건, {});
  if (!v.ok) return { 오류: `계약 위반: ${v.오류들.join(' · ')}`, 끝: true };

  let 본문;
  try {
    본문 = await 부르기('events', 토큰, { events: [사건] });
  } catch (e) {
    return { 오류: String(e.message || e), 끝: e.retryable === false };
  }

  const 한건 = 본문.results && 본문.results[0];
  // `duplicate` 는 실패가 아니라 **재전송이 접힌 것**이다 — 사건이 멱등키를 들고 있어서 안전하다
  // (같은 사건 객체는 몇 번 보내도 같은 키다 · C0 §4-1).
  if (한건 && (한건.status === 'stored' || 한건.status === 'duplicate')) {
    return { event_id: 한건.event_id };
  }
  const e = (한건 && 한건.error) || {};
  return { 오류: e.message || '서버가 받지 않았어요', 끝: e.retryable === false };
}
