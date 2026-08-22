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
import { 부르기 } from './사건통로.js';
import { 계약판 } from './계약판.js';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/* 상수의 정본은 `src/계약판.js` 다 — 여기 살면 통로가 이 파일을 import 해야 해서 과제 조회가
   통로를 거꾸로 못 쓴다(순환). 옛 호출부를 위해 이름만 그대로 다시 낸다. */
export { 계약판 };

/**
 * 오늘(또는 지정한 날)의 과제를 읽는다.
 *
 * @param {string} 토큰  학생 세션 토큰(access_token)
 * @param {string} [날짜] `YYYY-MM-DD`(몽골 기준). 생략하면 **서버가 정한다** — 기기 시계를 안 믿는다(C0 §3).
 * @returns {Promise<{항목: object|null, 막힘: {code: string}|null, contract_ver: string}>}
 */
export async function 오늘과제받기(토큰, 날짜) {
  const 질의 = 날짜 ? `?date=${encodeURIComponent(날짜)}` : '';
  /* 🔑 **자기 사본을 안 쓰고 통로를 지난다**(`src/사건통로.js`). 여기 있던 사본은 봉투 해석·
   *   계약판 헤더·네트워크 구분까지 통로와 똑같았는데, **만료 갱신(§7 왕복 6-⑥)만 없었다** —
   *   갈라진 쪽 증상은 「한 시간 지나면 오늘 과제가 안 뜬다」다. 학생이 매일 처음 만나는 화면이다. */
  const 몸 = await 부르기(`tasks${질의}`, 토큰);
  const data = Array.isArray(몸.data) ? 몸.data : [];
  /* 🔑 `data` 가 있어도 그대로 싣는다 — 배정 뒤에 철회한 학생은 **과제를 보면서 업로드만 막힌다.**
   *   「비었을 때만」 읽으면 `막힘: null` 이 측정이 아니라 추측이 된다(동의게이트 정본과 같은 규칙). */
  return {
    항목: data.length ? data[0] : null,
    막힘: 몸.blocked || null,
    /* 🔑 `assignment_status`(있음|없음|생성중|오류 · c12 §3-1) — 빈 배정의 두 사실(「없다」·「곧 온다」)을
     *   가르는 칸이다. 값을 **그대로** 싣는다(모르는 값도 — 화면이 「괜찮다」로 접지 않게). 칸이 없으면
     *   null = 구앱 규칙(`data` 만으로 그린다)과 같은 동작이라 기존 소비자에 무영향이다. */
    assignment_status: typeof 몸.assignment_status === 'string' ? 몸.assignment_status : null,
    contract_ver: 몸.contract_ver || null,
  };
}

/**
 * 오늘 배치가 **덜 돌았나** — 원장만 답을 받는다(P0 §6-5 · 서버 `deliver?점검`).
 *
 * ■ 왜 앱이 이걸 부르나
 *   배치가 죽으면 학생 전원이 조용히 고정 과제로 돌아간다 — **강등으로도 안 잡히고**
 *   증상이 없다. 계약이 정한 수신자는 유호님 한 명이라 별도 발송 통로(메일·푸시)를
 *   만들지 않는다: **화면에 뜨는 것이 알림이다.**
 *
 * 🔑 **던지지 않는다.** 이 자리는 학생 전원이 지나가고 그들은 전부 401 을 받는다(원장이
 *   아니므로 — 권한은 화면이 아니라 서버가 정한다 · `원장초기화` 와 같은 규칙). 던지면
 *   호출부가 학생의 401 을 오류로 다루게 되고, 최악은 그걸 세션 만료로 읽어 **멀쩡한
 *   학생을 로그아웃**시키는 것이다. 볼 것이 없으면 `null` — 그게 이 함수의 전부다.
 * 🔑 미달이 아닐 때도 `null` 이다: 호출부가 「값이 있으면 그린다」 하나로 끝나 조건이
 *   두 곳(여기와 화면)으로 갈리지 않는다.
 * 🔴 **이 하나만 통로(`부르기`)를 안 지난다** — 위 두 줄이 그 이유다. 여기서 401 은 사고가
 *   아니라 **학생 전원의 정상 응답**이라, 통로에 얹으면 앱을 켠 학생마다 만료도 아닌 401 에
 *   토큰 갱신이 한 번씩 붙는다(§7 왕복 6-⑥ 이 그 401 을 만료로 읽는다). 통로에 「이 길만
 *   예외」를 다는 대신 사본을 남긴 것이고, 사본이라도 **판정이 없다** — 무슨 일이 나든 `null`
 *   하나라 갈라질 값이 없다. 곁들여 이 길은 **본문 없는 POST** 라 `부르기` 의 GET/POST 규약과도 안 맞는다.
 *
 * @param {string} 토큰 access_token
 * @returns {Promise<{날짜: string, 재적: number, 배정: number, 강등: number}|null>}
 */
export async function 배치미달받기(토큰) {
  if (!URL_ || !ANON || !토큰) return null;

  let r;
  try {
    r = await fetch(`${URL_}/functions/v1/deliver?${encodeURIComponent('점검')}`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${토큰}`,
        'X-Contract-Ver': 계약판,
      },
    });
  } catch {
    return null; // 회선 없음 — 미달과 구별할 재료가 없으니 아무 말도 하지 않는다
  }

  if (!r.ok) return null; // 401(원장 아님)·500 전부 여기로 — 조용한 것이 정상이다
  const 몸 = await r.json().catch(() => null);
  if (!몸 || 몸.미달 !== true) return null;

  /* 🔴 판정(`미달`)은 **서버 값을 그대로 쓴다** — 여기서 `배정 < 재적` 을 다시 계산하면
     그 부등호가 두 곳에 살고, 갈라지는 날 화면은 조용히 「정상」 쪽으로 눕는다. */
  return {
    날짜: String(몸.date || ''),
    재적: Number(몸.재적) || 0,
    배정: Number(몸.배정) || 0,
    강등: Number(몸.강등) || 0,
  };
}
