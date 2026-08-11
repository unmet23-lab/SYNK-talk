#!/usr/bin/env node
/* 라디오24 채팅 수집봇 — VPS 에서 24/7 도는 **읽기 전용** 전달자. (설계 §5-P0 · §4-3)
 *
 * ■ 이 파일에 판정이 없다
 *   고를 것·거를 것·얼마나 자주 칠 것인가는 전부 `lib/라디오수집.js`(순수·회귀 있음)에 있다.
 *   여기 있는 것은 왕복뿐이다 — VPS 코드는 회귀가 원리상 못 닿아서, 판정이 여기 있으면
 *   그것이 틀렸다는 사실이 **송출 첫날 새벽**에야 드러난다.
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

async function 돌기() {
  const 한번 = process.argv.includes('--한번');
  let 방송 = null;
  let 다음쪽 = null;
  let 간격 = 수집.폴링하한밀리;

  console.log(`[라디오봇] 시작 · 폴링 하한 ${수집.폴링하한밀리 / 1000}초 · 하루 최대 ${수집.하루유닛(수집.폴링하한밀리)} 유닛`);

  for (;;) {
    if (!방송) {
      방송 = await 재발견();
      다음쪽 = null;
      if (!방송) {
        console.log('[라디오봇] 활성 방송 없음 — 다음 회차에 다시 찾는다');
        if (한번) return;
        await 잠깐(간격);
        continue;
      }
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
