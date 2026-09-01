#!/usr/bin/env node
/* 라디오24 채팅봇 — VPS 에서 24/7 도는 전달자. (설계 §5-P0 · §4-3 · §8-2-1)
 *
 * ■ 이 파일에 판정이 없다
 *   고를 것·거를 것·얼마나 자주 칠 것인가는 전부 순수 lib(회귀 있음)에 있다.
 *   여기 있는 것은 왕복뿐이다 — VPS 코드는 회귀가 원리상 못 닿아서, 판정이 여기 있으면
 *   그것이 틀렸다는 사실이 **송출 첫날 새벽**에야 드러난다.
 *     · 읽기 리듬·거르기 = `lib/라디오수집.js`   · 출제 리듬·상태 = `lib/라디오출제.js`
 *     · 문항·문안(200자) = `lib/라디오라운드.js`(Fn `radio-round` 가 들고 판정한다)
 *
 * ■ 🔴 v2 (2026-09-01) — 「읽기 전용」이 아니게 됐다
 *   유호 확정 08-25 ① 로 퀴즈가 화면에서 **채팅으로** 내려갔다(§8-2-1). 그래서 봇이
 *   `liveChatMessages.insert` 로 «쓴다» — 라운드당 세 줄(출제·마감·정답).
 *   ⇒ 그 쓰기가 이 봇을 `radio.quiz_round.shown_at` 의 **유일한 증인**으로 만든다:
 *      출제줄이 실제로 채팅에 오른 시각만이 「나갔다」이고, 그것을 Fn 에 ack 로 보내야
 *      원장 행이 앉는다. 안 보내면 행이 안 생긴다(안 보여준 것을 적지 않는다).
 *   ⇒ 쓰기는 **50유닛**으로 읽기(최악 5)의 열 배다. 그래서 여는 판정이 쿼터를 함께 본다.
 *      🔑 모자라면 **출제부터 줄인다** — 수집이 죽으면 그날 원장이 통째로 비고 소급이 안 된다.
 *
 * ■ 봇이 드는 비밀은 하나뿐이다
 *   `RADIO_INGEST_SECRET` — 인제스트 Fn **한 문**만 연다. `service_role` 은 이 호스트에
 *   두지 않는다(설계 §4-3). `SUPABASE_ANON_KEY` 는 비밀이 아니다 — 플랫폼 `verify_jwt` 를
 *   지나기 위한 공개 키이고, 판정은 위 시크릿이 진다.
 *
 * ■ 죽는 방식 (§6-3 · §6-5)
 *   · 401 = OAuth 토큰 만료 → 갱신. **앱이 「테스트」 상태면 7일마다 refresh_token 자체가
 *     죽는다** — 그때는 갱신도 실패하고, 그 사실이 남는 곳은 `ingest_heartbeat` 의 «구멍»뿐이다.
 *   · 403/404 = 채팅방이 끝났다 → `search.list` 부터 **재발견**. 같은 liveChatId 로 다시 치면
 *     영원히 404 이고 증상은 「봇은 살아 있는데 수집만 0」이다.
 *   · 그 밖 = 다음 폴링에서 다시 시도. 크래시로 죽여 systemd 가 되살리게 두지 않는다 —
 *     되살아난 봇은 재발견부터 다시 하느라 그 구간을 통째로 흘린다.
 *
 * 실행: node bots/라디오수집봇.js            (환경변수는 프로세스 env — .env 를 안 읽는다)
 *       node bots/라디오수집봇.js --한번      (1회 폴링 후 종료 — 개통 확인용)
 */
'use strict';

const 수집 = require('../lib/라디오수집.js');
const 출제 = require('../lib/라디오출제.js');
/* 🚫 `라디오채팅파서` 를 여기서 부르지 않는다 — 회귀(`라디오수집.test.js`)가 그걸 문다.
 *   봇이 파서를 물면 봇의 판과 원장에 박히는 판이 두 벌이 되고, 갈라진 것은
 *   「원장 판대로 재파싱하면 될 것」처럼 보여서 아무도 못 본다(이 파일 머리말).
 *   ⇒ 「!답 이 몇 건인가」도 봇이 세지 않는다. 원장에 이미 박힌 값을 **Fn 이 센다**. */

const YT = 'https://www.googleapis.com/youtube/v3';
const 토큰끝점 = 'https://oauth2.googleapis.com/token';

function 환경(이름) {
  const v = process.env[이름];
  if (!v) {
    console.error(`[라디오봇] 환경변수 ${이름} 가 없다 — 봇을 켜지 않는다.`);
    process.exit(1);
  }
  return v;
}

const 설정 = {
  채널: 환경('RADIO_CHANNEL_ID'),
  클라이언트: 환경('RADIO_YT_CLIENT_ID'),
  비밀: 환경('RADIO_YT_CLIENT_SECRET'),
  갱신토큰: 환경('RADIO_YT_REFRESH_TOKEN'),
  supabase: 환경('SUPABASE_URL').replace(/\/+$/, ''),
  anon: 환경('SUPABASE_ANON_KEY'),
  인제스트키: 환경('RADIO_INGEST_SECRET'),
  /* 라운드 문의 좁은 시크릿. **없으면 출제를 안 한다**(수집은 그대로 돈다) —
   * 미설정을 「통과」로 읽으면 설정을 빠뜨린 날 문이 열리는 쪽으로 샌다. */
  라운드키: process.env.RADIO_ROUND_SECRET || null,
};

const 잠깐 = (밀리) => new Promise((r) => setTimeout(r, 밀리));

let 접근토큰 = null;

/** OAuth 접근 토큰 갱신. 실패하면 `null` — 부른 쪽이 다음 회차에 다시 시도한다. */
async function 토큰갱신() {
  const body = new URLSearchParams({
    client_id: 설정.클라이언트, client_secret: 설정.비밀,
    refresh_token: 설정.갱신토큰, grant_type: 'refresh_token',
  });
  const r = await fetch(토큰끝점, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  if (!r.ok) {
    /* 🔴 여기가 「7일째 새벽」이 드러나는 유일한 자리다 — 로그에 원문을 남긴다.
     *   `invalid_grant` 면 앱이 테스트 상태라 refresh_token 이 만료된 것이고,
     *   그건 코드가 아니라 **GCP 콘솔에서 프로덕션 게시**로만 풀린다(설계 §5-P0). */
    console.error(`[라디오봇] 🔴 토큰 갱신 실패 HTTP ${r.status} — ${String(await r.text()).slice(0, 300)}`);
    return null;
  }
  const j = await r.json();
  접근토큰 = j.access_token || null;
  return 접근토큰;
}

/** YouTube GET. `{ ok, status, 몸 }` — 던지지 않는다(상태로 갈래를 가르는 것이 이 봇의 전부다). */
async function yt(경로, 질의) {
  if (!접근토큰 && !(await 토큰갱신())) return { ok: false, status: 401, 몸: null };
  const url = `${YT}/${경로}?${new URLSearchParams(질의)}`;
  const 치기 = () => fetch(url, { headers: { Authorization: `Bearer ${접근토큰}` } })
    .catch((e) => ({ ok: false, status: 0, json: async () => ({ 오류: String(e) }) }));
  let r = await 치기();
  if (수집.토큰갱신필요(r.status) && (await 토큰갱신())) r = await 치기();
  return { ok: !!r.ok, status: r.status, 몸: r.ok ? await r.json() : null };
}

/** 활성 방송을 처음부터 찾는다 — 방송이 끊기면 videoId·liveChatId 가 새것이 된다(설계 §5). */
async function 재발견() {
  const s = await yt('search', {
    part: 'id', channelId: 설정.채널, eventType: 'live', type: 'video', maxResults: '5',
  });
  const video_id = s.ok ? 수집.방송고르기(s.몸 && s.몸.items) : null;
  if (!video_id) return null;
  const v = await yt('videos', { part: 'liveStreamingDetails', id: video_id });
  const 상세 = v.ok ? 수집.방송상세(v.몸 && v.몸.items) : null;
  return 상세 ? { video_id, ...상세 } : null;
}

/** 원장에 붓는다 — 봇이 DB 에 닿는 유일한 자리. */
async function 인제스트(짐) {
  const r = await fetch(`${설정.supabase}/functions/v1/radio-ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${설정.anon}`,       // 플랫폼 verify_jwt 통과용(공개 키)
      apikey: 설정.anon,
      'x-radio-ingest-key': 설정.인제스트키,      // 🔑 진짜 자물쇠
    },
    body: JSON.stringify(짐),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  if (!r.ok) {
    console.error(`[라디오봇] 인제스트 실패 HTTP ${r.status} — ${String(await r.text()).slice(0, 300)}`);
    return null;
  }
  return r.json();
}

/**
 * 채팅에 한 줄 쓴다 — **이 봇이 「나갔다」를 아는 유일한 자리**(v2 · §8-2-1).
 * @returns {string|null} 성공 시각(ISO). 실패면 null — 실패한 줄로 ack 를 보내지 않는다.
 */
async function 채팅쓰기(liveChatId, 글) {
  if (!접근토큰 && !(await 토큰갱신())) return null;
  const url = `${YT}/liveChatMessages?part=snippet`;
  const 짐 = {
    snippet: {
      liveChatId, type: 'textMessageEvent',
      textMessageDetails: { messageText: 글 },
    },
  };
  const 치기 = () => fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${접근토큰}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(짐),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  let r = await 치기();
  if (수집.토큰갱신필요(r.status) && (await 토큰갱신())) r = await 치기();
  if (!r.ok) {
    console.error(`[라디오봇] 채팅 쓰기 실패 HTTP ${r.status} — ${String(await r.text()).slice(0, 200)}`);
    return null;
  }
  /* 🔑 시각은 **우리 시계**로 적는다 — API 응답의 publishedAt 을 쓰면 그 값이 없거나 모양이
   *   바뀌는 날 ack 가 통째로 막힌다. 노출해석이 시계 어긋남을 관용으로 이미 흡수한다. */
  return new Date().toISOString();
}

/** 라운드 문(`radio-round`). 키가 없으면 아예 안 부른다 — 출제는 «있으면 하는 것»이다. */
async function 라운드문(문, 짐) {
  if (!설정.라운드키) return null;
  const r = await fetch(`${설정.supabase}/functions/v1/radio-round`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${설정.anon}`,
      apikey: 설정.anon,
      'x-radio-round-key': 설정.라운드키,
    },
    body: JSON.stringify({ 문, ...짐 }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  if (!r.ok) {
    console.error(`[라디오봇] 라운드문(${문}) 실패 HTTP ${r.status} — ${String(await r.text()).slice(0, 200)}`);
    return null;
  }
  return r.json();
}

const 지금 = () => Date.now();

/* 라운드 진행 상태 — 프로세스 안에만 산다.
 * 🔑 **재시작하면 잊는다.** 그래도 잃는 것은 「진행 중이던 라운드의 마감·정답줄」뿐이고,
 *   원장은 이미 출제 ack 로 앉아 있다(그 라운드의 `closed_at` 이 null 로 남는다 = 정직한 빈칸).
 *   상태를 DB 에 두면 「제안됐지만 안 나간 라운드」를 청소할 사람이 필요해진다
 *   (`라디오라운드.js` 머리말 「제안을 어디에도 저장하지 않는 이유」와 같은 축). */
const 라운드 = {
  진행: null,      // { 제안id, round_id, 출제ms, 마감초, 채팅, 마감침, 정답침, 재도전냄, 깊이 }
  오늘: { 날짜: null, 연수: 0 },
  마지막출제ms: null,
};

/** 몽골 날짜가 바뀌면 하루 카운터를 되돌린다 — 날짜 경계는 방송 시각축과 같아야 한다. */
function 하루경계(지금ms) {
  const 오늘 = new Date(지금ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 10); // UB = UTC+8
  if (라운드.오늘.날짜 !== 오늘) 라운드.오늘 = { 날짜: 오늘, 연수: 0 };
}

/** 제안 → 출제줄 채팅 쓰기 → 노출 ack. 성공하면 진행 상태가 선다. */
async function 라운드열기(방송, 지금ms, 부모round_id = null, 깊이 = 0) {
  const 제안 = await 라운드문('제안', {
    씨앗: `${방송.video_id}:${지금ms}`,
    부모round_id,
  });
  if (!제안 || !제안.ok) return;
  if (!제안.제안id) {
    console.log(`[라디오봇] 제안 0 — ${JSON.stringify(제안.분모 || {})}`);
    return;
  }
  const 글 = 제안.채팅 && 제안.채팅.출제;
  if (!글) {
    /* Fn 이 200자에 못 드는 문항을 이미 후보에서 뺐으므로 여기 오면 규격이 어긋난 것이다. */
    console.error('[라디오봇] 🔴 제안에 출제줄이 없다 — 라운드를 열지 않는다');
    return;
  }

  const 오른때 = await 채팅쓰기(방송.live_chat_id, 글);
  if (!오른때) return;   // 못 썼으면 ack 를 안 보낸다 = 원장 행도 안 생긴다

  const ack = await 라운드문('노출', { 제안id: 제안.제안id, at: 오른때 });
  if (!ack || !ack.ok) {
    /* 🔴 채팅엔 나갔는데 원장엔 못 앉았다 — 학생은 문제를 봤고 우리는 그 사실을 못 적었다.
     *   그래도 진행은 세운다(마감·정답줄은 나가야 한다). 승격은 원장 행이 없어 안 되고,
     *   그 손실은 이 로그가 유일한 증거다. */
    console.error('[라디오봇] 🔴 출제는 나갔는데 노출 ack 실패 — 이 라운드는 원장에 안 앉는다');
  }

  라운드.진행 = {
    제안id: 제안.제안id,
    round_id: (ack && ack.round_id) || null,
    출제ms: Date.parse(오른때),
    마감초: (제안.채팅 && 제안.마감초) || 60,
    채팅: 제안.채팅,
    마감침: false, 정답침: false, 재도전냄: false, 깊이,
  };
  라운드.마지막출제ms = 지금ms;
  라운드.오늘.연수 += 1;
  console.log(`[라디오봇] 라운드 열었다 · ${제안.제안id} · 오늘 ${라운드.오늘.연수}회`);
}

/** 매 폴링 회차마다 한 번 — 열 때인지, 칠 차례인지 판정층에 묻고 그대로 한다. */
async function 출제돌리기(방송, 지금ms) {
  if (!설정.라운드키) return;          // 출제는 «있으면 하는 것»(수집은 그대로 돈다)
  하루경계(지금ms);

  const 진행 = 라운드.진행;
  if (!진행) {
    const 판정 = 출제.열까({
      동시시청: 방송.concurrent_viewers,
      오늘연수: 라운드.오늘.연수,
      마지막출제ms: 라운드.마지막출제ms,
      지금ms,
      쿼터상한: 수집.라운드상한(수집.폴링하한밀리),
    });
    if (판정.열다) await 라운드열기(방송, 지금ms);
    return;
  }

  const { 동작 } = 출제.다음동작({ ...진행, 지금ms });
  if (동작 === '대기') return;

  if (동작 === '마감') {
    const 때 = await 채팅쓰기(방송.live_chat_id, 진행.채팅.마감);
    진행.마감침 = true;                                   // 못 써도 상태는 넘긴다(정답이 막히면 안 된다)
    if (때 && 진행.round_id) await 라운드문('마감', { 제안id: 진행.제안id, at: 때 });
    return;
  }

  if (동작 === '정답') {
    /* 🔑 정답줄은 **Fn 에 다시 묻는다** — 「함께 푼 사람 N」의 N 은 라운드가 끝나야 알고,
     *   제안 때 받은 문안을 봇이 문자열 치환으로 고치면 문안이 바뀌는 날 조용히 안 먹는다.
     *   문안은 끝까지 lib·Fn 이 만든다(200자 규율·정답 자리 검사도 거기 산다). */
    /* 🔑 응답수를 **안 보낸다** — Fn 이 원장(`radio.chat_message`)에서 «이미 파서판대로 박힌»
     *   `!답` 을 센다. 봇이 세면 파서가 두 벌이 되고, 갈라진 것은 아무도 못 본다. */
    const 문안 = await 라운드문('정답문안', { 제안id: 진행.제안id, round_id: 진행.round_id });
    const 글 = (문안 && 문안.ok && 문안.정답) || 진행.채팅.정답;   // 못 물으면 제안 때 것(응답 0판)
    if (!문안 || !문안.ok) console.error('[라디오봇] 정답문안 못 받음 — 제안 때 문안으로 나간다(응답수 빠짐)');
    await 채팅쓰기(방송.live_chat_id, 글);
    진행.정답침 = true;
    return;
  }

  if (동작 === '재도전') {
    진행.재도전냄 = true;
    await 라운드열기(방송, 지금ms, 진행.round_id, 진행.깊이 + 1);
    return;
  }

  if (동작 === '끝') 라운드.진행 = null;
}

async function 돌기() {
  const 한번 = process.argv.includes('--한번');
  let 방송 = null;
  let 다음쪽 = null;
  let 간격 = 수집.폴링하한밀리;
  /* 🔴 못 찾은 횟수 — `search.list` 가 **100유닛**이라 이걸 안 세면 방송 없는 날
   *   60초×100 = 하루 144,000 유닛(한도의 14배)을 태운다. 물러섬은 lib 이 계산한다. */
  let 못찾음 = 0;

  console.log(`[라디오봇] 시작 · 폴링 하한 ${수집.폴링하한밀리 / 1000}초 · 하루 최대 ${수집.하루유닛(수집.폴링하한밀리)} 유닛`
    + ` · 재발견 물러섬 최대 ${수집.재발견상한밀리 / 60000}분(못 찾는 날 최악 ${수집.재발견유닛최악()} 유닛)`);

  for (;;) {
    if (!방송) {
      방송 = await 재발견();
      다음쪽 = null;
      if (!방송) {
        못찾음 += 1;
        const 쉼 = 수집.재발견간격밀리(못찾음);
        console.log(`[라디오봇] 활성 방송 없음(${못찾음}회) — ${Math.round(쉼 / 1000)}초 뒤에 다시 찾는다`
          + ' (search.list 는 100유닛이라 물러선다 · 방송이 없으면 잃을 것도 없다)');
        if (한번) return;
        await 잠깐(쉼);
        continue;
      }
      못찾음 = 0;   // 찾았으니 되돌린다 — 다음 끊김은 다시 빠르게 잡는다
      console.log(`[라디오봇] 방송 물었다 · video=${방송.video_id}`);
    }

    const 질의 = { liveChatId: 방송.live_chat_id, part: 'snippet,authorDetails', maxResults: '2000' };
    if (다음쪽) 질의.pageToken = 다음쪽;
    const c = await yt('liveChatMessages', 질의);

    if (!c.ok) {
      if (수집.재발견필요(c.status)) {
        console.log(`[라디오봇] 채팅방이 끝났다(HTTP ${c.status}) — 재발견으로 돌아간다`);
        방송 = null;
        if (한번) return;
        await 잠깐(간격);
        continue;
      }
      console.error(`[라디오봇] 채팅 조회 실패 HTTP ${c.status} — 다음 회차에 재시도`);
      if (한번) return;
      await 잠깐(간격);
      continue;
    }

    const { 행, 본수, 거른 } = 수집.수집대상(c.몸.items);
    다음쪽 = c.몸.nextPageToken || null;
    간격 = 수집.다음간격밀리(c.몸.pollingIntervalMillis);

    /* 시청자 수는 채팅 응답에 없다 — 맥박에 실으려면 따로 물어야 한다.
     * 매 회차 묻지 않는다(유닛이 배로 든다): 방송을 물었을 때의 값을 그대로 실어 보낸다. */
    const 결과 = await 인제스트({
      video_id: 방송.video_id,
      polled_at: new Date().toISOString(),
      messages_seen: 본수,
      concurrent_viewers: 방송.concurrent_viewers,
      messages: 행,
    });
    if (결과) {
      console.log(`[라디오봇] 본 ${본수} · 보냄 ${행.length} · 새로 ${결과.새로} · 중복 ${결과.중복}`
        + ` · 거름(유형 ${거른.유형}/결측 ${거른.결측}) · 다음 ${간격 / 1000}초`);
    }

    /* ── 출제 (v2) — 수집이 끝난 «뒤»에 한다 ────────────────────────────────
     * 순서가 이 방향인 이유: 출제가 실패해도 그 회차 수집은 이미 원장에 들어가 있다.
     * 반대로 두면 출제에서 던진 날 그 회차 채팅이 통째로 사라진다(소급 불가). */
    try {
      await 출제돌리기(방송, 지금());
    } catch (e) {
      /* 출제는 «있으면 하는 것»이다 — 여기서 죽으면 수집까지 멈춘다. */
      console.error('[라디오봇] 출제 중 오류(수집은 계속) —', e && e.message ? e.message : e);
    }

    if (한번) return;
    await 잠깐(간격);
  }
}

if (require.main === module) {
  돌기().catch((e) => {
    console.error('[라디오봇] 예상 못 한 오류 —', e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
