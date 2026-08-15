'use strict';
/**
 * 벤더 실패 본문 → 응답에 실을 **한 줄 사유**.
 *
 * ■ 왜 lib 으로 나왔나 (2026-08-15 · 유호 승인 「전부 진행」)
 *   이 함수는 `lib/교정엔진.js` 안에서 태어났고 `correct` 두 자리에서만 쓰였다. 그런데 실측하니
 *   **같은 모양이 여섯 곳**이었다 — `transcribe`·`auth`·`tasks`·`uploads` 는 벤더 본문을 이미
 *   `.slice(0, N)` 해서 **변수에 쥔 채** `console.error` 에만 넣고 버린다. 손에 든 것을 버리는
 *   자리라 호출 한 줄이면 붙는데, 그러려면 이 함수가 교정 전용 파일 밖에 있어야 한다.
 *
 * ■ 🔴 왜 「로그에 있으니 됐다」가 아닌가
 *   무료 플랜의 Edge 로그 보존은 **1일**이다(Pro 7 · Team 28 — 2026-08-15 가격표 실측).
 *   그리고 `pg_cron` 이 부르는 넷(`deliver`·`deliver-check`·`transcribe`·`radio-promote`)은
 *   `net.http_post` 라 응답을 아무도 안 읽는다. 즉 **사유가 봉투에 안 실리면 하루 뒤 흔적이 0**이다.
 *   #Q83(교정 배치 400 전량 튕김)이 며칠 늦은 자리가 정확히 이것이었다.
 *
 * 🔑 상태 코드만으로는 처방이 안 나온다 — 400 은 「몸통을 고쳐라」인데 «어디를»이 빠져 있다.
 *   벤더는 그 «어디를»을 본문 `error.message` 에 적어 준다.
 * 🔑 JSON 이 아니어도(게이트웨이 HTML 같은 것) **빈손으로 돌아오지 않는다** — 모양이 다르면
 *   앞머리를 그대로 자른다. 「형식이 아니라 못 읽었다」와 「사유가 없다」가 같은 모양이면 안 된다.
 *
 * ⚠ 이 함수는 **자르기만 한다** — 상태 코드를 바꾸지도, DB 에 적지도 않는다. 봉투를 두껍게 할 뿐이다.
 *   「200 인데 실패」를 4xx 로 바꾸는 것은 계약(C0)이 지는 판정이라 이 배선의 몫이 아니다.
 *
 * @param {*} 글 벤더 응답 본문(문자열이 아니어도 받는다 — 호출부가 `await r.text()` 를 놓쳐도 안 죽는다)
 * @param {number} [상한=200] 자를 길이. 봉투는 로그가 아니라 **응답**이라 길면 그 자체가 사고다.
 * @returns {string|null} 한 줄 사유 · 본문이 비었으면 null(「사유가 없다」를 빈 문자열로 위장하지 않는다)
 */
function 벤더사유(글, 상한 = 200) {
  const s = String(글 == null ? '' : 글).trim();
  if (!s) return null;
  let 본;
  try { 본 = JSON.parse(s); } catch { return s.slice(0, 상한); }
  const e = 본 && typeof 본 === 'object' ? 본.error : null;
  const 말 = e && typeof e.message === 'string' ? e.message : '';
  const 갈래 = e && typeof e.type === 'string' ? e.type : '';
  const 합 = [갈래, 말].filter(Boolean).join(': ');
  return (합 || s).slice(0, 상한);
}

module.exports = { 벤더사유 };
