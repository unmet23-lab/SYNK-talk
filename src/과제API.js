'use strict';
/**
 * 과제 API — 앱이 **오늘 낼 것**을 읽는 자리 하나 (C0 §4-3 ①).
 *
 * ■ 이 파일이 닫는 것
 *   배치(`functions/deliver`)가 전날 밤 큐에 넣은 것을 화면이 꺼낸다. 이게 없으면 화면은
 *   `contents/첫편지.js` 의 **고정 문장**으로 돌고, 그 채로 실기기 데모가 통과한다 —
 *   P0 §4-3 이 「배달 경로 먼저」로 순서를 뒤집은 이유가 정확히 그 상태다.
 *
 * ■ 🔴 빈 상태는 오류가 아니다 (C0 §4-3 공통)
 *   `data: []` + 200 은 **첫날·배치 실패·동의 없음**이 전부 정상 경로라는 뜻이다. 여기서
 *   던지면 학생 화면이 「고장」이 된다. 그래서 빈 배열은 그대로 내고, 내려갈지는 화면이 정한다.
 *   🔑 대신 **왜 비었는지**(`blocked`)를 함께 낸다 — 원인이 셋인데 응답이 하나면 화면은
 *   전부에 대해 「오늘 받은 과제가 아직 없어요」만 말하게 되고, 동의가 없어 막힌 학생은
 *   자기가 무엇을 하면 되는지 영영 못 듣는다(F176 이 정확히 그 모양이었다).
 *
 * ⚠ `EXPO_PUBLIC_*` 는 번들에 인라인된다 — 여기 있어도 되는 것은 **anon 키뿐**이다.
 */
import { 인증오류 } from './인증API.js';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * 앱이 선언하는 계약판(C0 §6).
 *
 * 🔑 **계약 JSON 을 import 하지 않는다.** 그 파일은 28KB 짜리 개정 이력이고 앱이 쓰는 것은
 *   이 두 글자뿐인데, import 하면 그 28KB 가 통째로 번들에 인라인돼 몽골 모바일 회선으로 나간다.
 *   대신 손 상수를 두고 **`tests/계약.test.js` 가 정본과 같은지 기계로 묶는다** — 갈라지면
 *   CI 가 빨개진다. 갈라진 채 나가면 증상은 426 이고 학생 눈에는 「업데이트하래요」로 보인다.
 */
export const 계약판 = 'c9';

/**
 * 오늘(또는 지정한 날)의 과제를 읽는다.
 *
 * @param {string} 토큰  학생 세션 토큰(access_token)
 * @param {string} [날짜] `YYYY-MM-DD`(몽골 기준). 생략하면 **서버가 정한다** — 기기 시계를 안 믿는다(C0 §3).
 * @returns {Promise<{항목: object|null, 막힘: {code: string}|null, contract_ver: string}>}
 */
export async function 오늘과제받기(토큰, 날짜) {
  if (!URL_ || !ANON) throw new 인증오류('CONFIG', '서버 설정이 없어요', false);

  const 질의 = 날짜 ? `?date=${encodeURIComponent(날짜)}` : '';
  let r;
  try {
    r = await fetch(`${URL_}/functions/v1/tasks${질의}`, {
      method: 'GET',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${토큰}`,
        'X-Contract-Ver': 계약판,
      },
    });
  } catch {
    // 네트워크 없음은 서버 오류와 **다른 사건**이다 — 다르게 말해야 다시 시도할 수 있다.
    throw new 인증오류('NETWORK', '인터넷 연결을 확인해 주세요', true);
  }

  const 몸 = await r.json().catch(() => ({}));
  if (!r.ok || 몸.ok === false) {
    const e = 몸.error || {};
    throw new 인증오류(e.code, e.message, e.retryable);
  }
  const data = Array.isArray(몸.data) ? 몸.data : [];
  /* 🔑 `data` 가 있어도 그대로 싣는다 — 배정 뒤에 철회한 학생은 **과제를 보면서 업로드만 막힌다.**
   *   「비었을 때만」 읽으면 `막힘: null` 이 측정이 아니라 추측이 된다(동의게이트 정본과 같은 규칙). */
  return {
    항목: data.length ? data[0] : null,
    막힘: 몸.blocked || null,
    contract_ver: 몸.contract_ver || null,
  };
}
