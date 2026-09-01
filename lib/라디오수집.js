/* 라디오24 수집봇의 **판정층** — 네트워크가 없는 순수 함수만 산다.
 *
 * ■ 왜 봇 본체와 갈라 두나 (`tools/원격배포.js` 머리말과 같은 이유)
 *   봇은 VPS 에서 24/7 돈다 — 거기서 도는 코드는 회귀가 원리상 못 닿는다. 판정을 fetch 옆에
 *   적으면 「빗나간 판정」이 실측될 자리가 **송출 첫날 새벽**밖에 없다. 그래서 고를 것·거를 것·
 *   얼마나 자주 칠 것인가를 전부 여기로 내리고, `bots/라디오수집봇.js` 는 이 표를 읽어 왕복만 한다.
 *
 * ■ 🔴 파생값(`command_kind`·`parser_ver`)은 여기서 **안 만든다**
 *   봇이 파싱해 보내면 봇의 파서판과 원장에 박히는 판이 갈라진다 — 그리고 갈라진 것은
 *   「원장에 박힌 판대로 재파싱하면 될 것」처럼 보여서 **아무도 못 본다.** 원장 두 칸을 쓰는 것은
 *   인제스트 Fn 하나다(`supabase/functions/radio-ingest`). 봇은 **원문 전달자**다(설계 §4-3
 *   「봇은 원장 전달자일 뿐」의 코드 실체 — service_role 을 안 드는 것과 같은 축).
 *
 * ■ 원칙 7(화이트리스트)의 자리
 *   `liveChatMessages.list` 는 후원·멤버십·삭제 통보를 같은 배열에 섞어 준다. 원장이 받는 것은
 *   `textMessageEvent` 뿐이고, **거른 수를 세어 돌려준다** — 분모 없는 초록을 만들지 않는다(F207).
 */
'use strict';

/* 폴링 하한. 🔴 근거는 취향이 아니라 쿼터다(설계 §5 쿼터 설계).
 *   `liveChatMessages.list` 단가가 공식 표에 없어 **최악값 5유닛**을 가정한다 —
 *   60초 간격이면 하루 1,440회 × 5 = 7,200 유닛으로 기본 일일 한도(10,000) 안이다.
 *   30초로 내리면 14,400 유닛이라 **한도를 넘고, 넘은 날의 증상은 「조용히 수집 0」**이다.
 *   유튜브가 더 느리게 치라고 하면(`pollingIntervalMillis`) 그 말을 따른다 — 하한만 우리 것이다. */
const 폴링하한밀리 = 60_000;
const 단가최악 = 5;
const 일일한도 = 10_000;

/** 하루에 쓸 유닛 — 간격을 바꾸는 사람이 **한도와 함께** 보게 하는 자리. */
function 하루유닛(간격밀리, 단가 = 단가최악) {
  const 간격 = Number(간격밀리);
  if (!Number.isFinite(간격) || 간격 <= 0) return null;
  return Math.ceil((24 * 60 * 60 * 1000) / 간격) * 단가;
}

/** 이 간격의 **폴링만으로** 하루를 버티나. 회귀가 하한의 근거를 **계산으로** 못박는다(주석이 아니라).
 *  ⚠ v2 부터 봇은 «쓰기»도 한다(아래 출제 몫) — 이 함수만 보고 「안전」이라 읽으면 안 된다.
 *  둘을 합쳐 보는 자는 `쿼터안전전체`다. */
function 쿼터안전(간격밀리, 단가 = 단가최악) {
  const u = 하루유닛(간격밀리, 단가);
  return u != null && u <= 일일한도;
}

/* ══ 출제 몫 — v2 에서 처음 «쓰는» 쿼터가 생겼다 ════════════════════════════════════
 *
 * 라디오24 v1.5(유호 확정 08-25 ①)가 퀴즈 라운드를 **화면에서 채팅으로** 내렸다.
 * 그래서 봇이 라운드마다 채팅에 «쓴다» — `liveChatMessages.insert` 는 **50유닛**으로
 * 읽기(최악 5)보다 **열 배 비싸다.** 폴링만 재던 자로는 이제 하루를 못 잰다.
 *
 * 🔴 **부족하면 출제부터 줄인다** — 수집이 죽으면 그날 원장이 통째로 비고 그건 소급이 안 된다.
 *   출제가 줄면 그날 라운드가 적어질 뿐이다. `라운드상한` 이 그 우선순위를 계산으로 박는다.
 * 🔑 상한을 **손으로 안 적는다** — 간격이 바뀌면 상한도 같이 움직여야 하는데, 손으로 적으면
 *   한쪽만 바뀌는 날이 온다([[constant-known-in-two-places]] 계열).
 */

/** `liveChatMessages.insert` 단가(공식 표). 읽기와 달리 실측이 아니라 **문서값**이다. */
const 출제단가 = 50;

/** 라운드 하나가 채팅에 쓰는 줄 수 — 출제·마감·정답(설계 §2-J). */
const 라운드줄수 = 3;

/** 라운드 n 회가 하루에 쓸 유닛. 재도전 짝도 «한 라운드»로 센다(같은 3줄이 나간다). */
function 출제유닛(라운드수, 줄수 = 라운드줄수, 단가 = 출제단가) {
  const n = Number(라운드수);
  if (!Number.isInteger(n) || n < 0) return null;
  return n * 줄수 * 단가;
}

/** 폴링 + 출제를 **합쳐** 하루를 버티나. 봇이 실제로 쓰는 유닛은 이 합이다. */
function 쿼터안전전체(간격밀리, 라운드수, 단가 = 단가최악) {
  const 읽기 = 하루유닛(간격밀리, 단가);
  const 쓰기 = 출제유닛(라운드수);
  if (읽기 == null || 쓰기 == null) return false;
  return 읽기 + 쓰기 <= 일일한도;
}

/**
 * 이 폴링 간격에서 **하루에 열 수 있는 라운드 수**. 남는 유닛을 줄수×단가로 나눈다.
 * 60초 폴링(7,200)이면 남는 2,800 ÷ 150 = **18 라운드**가 상한이고,
 * 설계가 쓰는 4~6회(+재도전) = 최대 12 는 그 안이다 — 여유가 6 라운드 있다는 뜻이다.
 * 못 재면 `null`(0 이 아니다 — 「한 판도 못 연다」와 「모른다」는 다른 말이다).
 */
function 라운드상한(간격밀리, 단가 = 단가최악) {
  const 읽기 = 하루유닛(간격밀리, 단가);
  if (읽기 == null) return null;
  const 남음 = 일일한도 - 읽기;
  if (남음 <= 0) return 0;
  return Math.floor(남음 / (라운드줄수 * 출제단가));
}

/** 다음 폴링까지 기다릴 시간. 유튜브 권고와 우리 하한 중 **더 느린 쪽**을 고른다. */
function 다음간격밀리(권고밀리, 하한 = 폴링하한밀리) {
  const v = Number(권고밀리);
  return Number.isFinite(v) && v > 하한 ? Math.floor(v) : 하한;
}

/* ══ 재발견 몫 — 🔴 쿼터 모델의 «구멍»이었다 (2026-09-02) ═══════════════════════════
 *
 * 위 두 자(읽기·쓰기)는 **방송을 이미 물었을 때**의 하루를 잰다. 그런데 봇은 방송을 못 찾으면
 * 같은 폴링 간격으로 `search.list` 를 다시 친다 — 그리고 **`search.list` 는 100유닛**이다.
 *   60초 × 100유닛 = 하루 **144,000 유닛** (한도 10,000의 **14배**).
 * 즉 **첫 송출 전에 봇을 켜 두면 100분 만에 그날 쿼터가 바닥난다.** 그러면 정작 방송이
 * 켜졌을 때 찾을 유닛이 없고, 증상은 「봇은 살아 있는데 수집만 0」이다(§6-3 그 무늬).
 * 그날 원장은 통째로 비고 **소급이 안 된다.**
 *
 * 🔑 처방 = **못 찾으면 점점 느리게 찾는다.** 방송이 없을 때는 잃을 데이터가 없으므로
 *   늦게 발견해도 값이 안 준다 — 반대로 빨리 찾겠다고 쿼터를 태우면 «찾은 뒤»를 잃는다.
 *   찾는 순간 0 으로 되돌린다(다음 끊김은 다시 빠르게 잡는다).
 * 🔑 이 상수를 lib 에 두는 까닭 = 봇에 두면 회귀가 원리상 못 닿는다(그 층의 규약 그대로).
 */

/** `search.list` 단가(공식 표). 읽기 5·쓰기 50과 견주는 자리라 같이 둔다. */
const 재발견단가 = 100;

/** 재발견 상한 — 30분. 하루 최악 48회 × 100 = 4,800 유닛(한도의 절반 아래). */
const 재발견상한밀리 = 30 * 60_000;

/**
 * 연속으로 못 찾은 횟수 → 다음 재발견까지 기다릴 시간(지수 물러섬 · 상한 30분).
 * 0회(=방금 찾았다/처음)면 폴링 하한과 같다 — 첫 시도는 늦추지 않는다.
 * @param {number} 연속실패 0,1,2,…
 */
function 재발견간격밀리(연속실패, 하한 = 폴링하한밀리, 상한 = 재발견상한밀리) {
  const n = Number(연속실패);
  if (!Number.isFinite(n) || n <= 0) return 하한;
  return Math.min(상한, 하한 * (2 ** Math.min(n, 20)));
}

/** 이 물러섬으로 하루 종일 «못 찾을» 때 쓰는 최악 유닛 — 상한에 눌린 뒤가 지배한다. */
function 재발견유닛최악(하한 = 폴링하한밀리, 상한 = 재발견상한밀리, 단가 = 재발견단가) {
  let t = 0; let n = 0; let 회 = 0;
  while (t < 24 * 60 * 60 * 1000 && 회 < 100_000) {
    t += 재발견간격밀리(n, 하한, 상한);
    n += 1; 회 += 1;
  }
  return 회 * 단가;
}

/** `search.list`(eventType=live) 결과에서 활성 방송 하나. 없으면 `null`(재발견 루프가 계속 돈다). */
function 방송고르기(items) {
  if (!Array.isArray(items)) return null;
  for (const it of items) {
    const id = it && it.id && it.id.videoId;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

/** `videos.list(part=liveStreamingDetails)` 결과 → 채팅방 id 와 그때 동시 시청자.
 *
 *  🔑 `concurrentViewers` 는 **없을 수 있다**(비공개 집계·방송 시작 직후). 없는 것을 0 으로
 *    적으면 「아무도 안 봤다」가 되고, 그 0 은 노출 분모로 쓰이는 순간 되돌릴 수 없다 —
 *    원장 칸이 nullable 인 이유가 이것이라 여기서도 `null` 로 넘긴다. */
function 방송상세(items) {
  const d = Array.isArray(items) && items[0] && items[0].liveStreamingDetails;
  if (!d || typeof d.activeLiveChatId !== 'string' || !d.activeLiveChatId) return null;
  const v = Number(d.concurrentViewers);
  return {
    live_chat_id: d.activeLiveChatId,
    concurrent_viewers: Number.isFinite(v) ? Math.trunc(v) : null,
  };
}

/* NOT NULL 인 원장 칸들 — 하나라도 비면 그 항목은 **안 보낸다**(Fn 이 통째로 거절하는 대신
 * 여기서 세어 버린다: 한 건 때문에 그 폴링의 나머지가 통째로 날아가는 것이 더 큰 손실이다). */
const 필수칸 = ['message_id', 'channel_id', 'display_name', 'body', 'sent_at'];

/** liveChat 항목 하나 → 원장 행 모양(파생 없음). 못 세우면 `null`. */
function 행세우기(it) {
  if (!it || typeof it !== 'object') return null;
  const s = it.snippet || {};
  const a = it.authorDetails || {};
  const 행 = {
    message_id: typeof it.id === 'string' ? it.id : null,
    channel_id: typeof a.channelId === 'string' ? a.channelId : null,
    display_name: typeof a.displayName === 'string' ? a.displayName : null,
    /* `displayMessage` 가 정본 — `textMessageDetails.messageText` 는 그 원재료다.
     * 둘 다 없으면 본문이 없는 것이고, 빈 문자열도 본문이 아니다(NOT NULL 을 ''로 만족시키면
     * 원장에 「내용 없는 발화」가 쌓이고 그건 재파싱으로도 복원이 안 된다). */
    body: typeof s.displayMessage === 'string' && s.displayMessage !== ''
      ? s.displayMessage
      : (typeof (s.textMessageDetails || {}).messageText === 'string' ? s.textMessageDetails.messageText : null),
    sent_at: typeof s.publishedAt === 'string' ? s.publishedAt : null,
    raw: it,
  };
  for (const k of 필수칸) if (행[k] == null || 행[k] === '') return null;
  return 행;
}

/** 한 폴링의 항목 배열 → { 행, 본수, 거른 }.
 *
 *  `본수` 는 **유튜브가 준 전량**이다 — 맥박(`messages_seen`)이 세는 것이 이것이고,
 *  「원장에 몇 줄 늘었나」와 다른 숫자다. 둘을 같은 값으로 적으면 「조용한 구간」과
 *  「후원만 온 구간」이 영영 안 갈린다(설계 §4-1 맥박의 존재 이유). */
function 수집대상(items) {
  const 목록 = Array.isArray(items) ? items : [];
  const 행 = [];
  const 거른 = { 유형: 0, 결측: 0 };
  for (const it of 목록) {
    const 유형 = it && it.snippet && it.snippet.type;
    if (유형 !== 'textMessageEvent') { 거른.유형 += 1; continue; }   // 원칙 7 화이트리스트
    const r = 행세우기(it);
    if (!r) { 거른.결측 += 1; continue; }
    행.push(r);
  }
  return { 행, 본수: 목록.length, 거른 };
}

/* 채팅방이 죽는 두 모양 — 방송이 끝났거나(404 liveChatEnded) 권한이 끊겼거나(403).
 * 🔴 이때 **다시 같은 `liveChatId` 로 치면 영원히 404 다.** 재발견(=`search.list` 부터)이
 *   유일한 출구이고, 그러지 않으면 증상은 「봇은 살아 있는데 수집만 0」이다(설계 §5 재발견 루프).
 * ⚠ 401 은 여기 없다 — 그건 토큰 만료라 **재발견이 아니라 갱신**이 답이다(§6-3 OAuth 7일). */
const 재발견필요 = (status) => status === 403 || status === 404;
const 토큰갱신필요 = (status) => status === 401;

module.exports = {
  폴링하한밀리, 단가최악, 일일한도, 출제단가, 라운드줄수,
  재발견단가, 재발견상한밀리,
  하루유닛, 쿼터안전, 출제유닛, 쿼터안전전체, 라운드상한, 다음간격밀리,
  재발견간격밀리, 재발견유닛최악,
  방송고르기, 방송상세, 행세우기, 수집대상,
  재발견필요, 토큰갱신필요,
};
