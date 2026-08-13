#!/usr/bin/env node
'use strict';
/**
 * 라디오왕복시험 — `functions/radio-ingest` 가 원장에 무엇을 남기는지 **실제 DB 왕복으로** 증명한다.
 * (라디오24_설계 §9 「왕복시험」 + 「원장 보증 검증」 두 항목을 한 도구가 진다.)
 *
 *   SUPABASE_PROJECT_REF=<리허설ref> RADIO_INGEST_SECRET=<배포에 넣은 값> node tools/라디오왕복시험.js
 *
 * ■ 왜 코드 읽기로는 안 되나
 *   §4-2 가 「원장이 보증하는 것」을 소급불가 절단으로 못박았다 — 그 보증이 깨져도 증상이
 *   **송출 몇 주 뒤 승격을 켜는 날**에야 나온다. 그때는 그 구간 원문이 이미 없다.
 *   그래서 여기서 재는 것은 「함수가 도는가」가 아니라 **「승격기가 나중에 필요로 할 전 필드가
 *   지금 원장에서 재구성되는가」**다(설계 §9 둘째 항목 = 「승격을 늦춰도 손실 0」의 기계 증거).
 *
 * ■ 🔴 리허설 전용
 *   `radio.chat_message` 는 지우지 않는다(원장이다). 프로젝트 이름에 `rehearsal` 이 없으면 거부한다.
 *
 * ■ 분모를 말한다 (F207)
 *   픽스처를 «몇 건 넣어 몇 건이 남았나»를 마지막 줄에 적는다 — 통과 수만으로는
 *   「거의 다 걸러졌는데 검사만 초록」이 구별되지 않는다.
 */
const path = require('path');
const 골격 = require(path.join(__dirname, '..', 'lib', '왕복골격.js'));
// 파서 정본 — 답해석 기대값을 여기 베끼면 판이 갈린다(원장 parser_ver 의 의미가 사라진다).
const { 파서판, 답해석 } = require(path.join(__dirname, '..', 'lib', '라디오채팅파서.js'));

/* 회차마다 다른 채널·메시지 id — 원장은 append 라 이전 실행분과 섞이면 분모가 거짓이 된다. */
const 회차 = `wt${Date.now().toString(36)}`;
const 채널 = (n) => `UC-${회차}-${n}`;
const 아이디 = (n) => `${회차}-${n}`;

const 채팅 = (n, body, opt = {}) => ({
  message_id: 아이디(n),
  channel_id: opt.channel_id ?? 채널(n),
  display_name: opt.display_name ?? `학생${n}`,
  body,
  sent_at: opt.sent_at ?? new Date().toISOString(),
  raw: { id: 아이디(n), snippet: { type: 'textMessageEvent', displayMessage: body }, 회차 },
});

/* §9 픽스처 세트 — 「정상·중복 id·전각 숫자·`!답 2번` 변형·마감 후 응답·비링크 학생·키릴 혼입」.
 * 🔑 마감 후·비링크는 **원장에 남아야 한다** — 그 둘을 거르는 것은 승격기(Lane B)이고,
 *   원장이 미리 걸러 버리면 나중에 「왜 안 남았나」를 되짚을 재료가 통째로 없다(§4-2). */
const 픽스처 = [
  채팅('a1', '!출석 오늘도 화이팅'),                      // 정상 · 필수 인자 있음
  채팅('a2', '!목표 단어 20개'),                          // 정상
  채팅('a3', '!답 ２번'),                                 // 전각 숫자 + 「번」
  채팅('a4', '!답 3??'),                                  // 확신도 표기(찍음)
  채팅('a5', '!질문 Багшаа "은/는" хэзээ хэрэглэх вэ?'),  // 키릴 혼입 — 인자 원문 보존
  채팅('a6', '선생님 안녕하세요'),                        // 자발 발화 — 명령 아님(c10 ⑤ 재료)
  채팅('a7', '!답 2', { sent_at: new Date(Date.now() - 3600_000).toISOString() }), // 마감 후 가정
  채팅('a8', '!빗소리'),                                  // ②축 · 인자 없음(마찰 0)
  채팅('a9', '!연동 SYNK-0001'),                          // 🔴 인자를 파생에 실으면 안 되는 자리
  채팅('a10', '!랭킹 보여줘'),                            // 화이트리스트 밖 — 명령 아님
];

async function main() {
  const { ref, sql, anon, 확인, 보고 } = await 골격.열기('라디오왕복시험', {
    사유: '이 시험은 원장(radio.chat_message)에 지우지 않는 행을 남긴다',
  });

  const 비밀 = process.env.RADIO_INGEST_SECRET || '';
  if (!비밀) {
    console.error('[라디오왕복시험] RADIO_INGEST_SECRET 가 없다 — 배포에 넣은 값과 같은 것을 주어야 한다.');
    console.error('       (없는 채로 도는 것은 「못 쟀다」이지 「통과」가 아니다)');
    process.exit(2);
  }

  const 부르기 = (짐, 키 = 비밀) => fetch(`https://${ref}.supabase.co/functions/v1/radio-ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon, Authorization: `Bearer ${anon}`,
      ...(키 == null ? {} : { 'x-radio-ingest-key': 키 }),
    },
    body: JSON.stringify(짐),
  }).then(async (r) => ({ status: r.status, 몸: await r.json().catch(() => null) }));

  /* ── ① 자물쇠 ─────────────────────────────────────────────────────── */
  console.log('\n■ ① 좁은 시크릿');
  const 키없이 = await 부르기({ messages: [] }, null);
  const 살았나 = 확인('키 없이 부르면 401 — anon 키(공개물)만으로는 원장에 못 쓴다',
    키없이.status === 401, 키없이);
  확인('틀린 키도 401', (await 부르기({ messages: [] }, `${비밀}x`)).status === 401);
  if (!살았나) {
    console.error('\n🔴 자물쇠가 열려 있다 — 뒤 검사를 돌리는 것보다 이것이 먼저다.');
    보고(`픽스처 ${픽스처.length}건 미투입`);
  }

  /* ── ② 첫 투입 ────────────────────────────────────────────────────── */
  console.log('\n■ ② 첫 투입 — 분모');
  const video = `${회차}-video`;
  const 첫 = await 부르기({
    video_id: video, polled_at: new Date().toISOString(),
    messages_seen: 픽스처.length + 3,          // 봇이 «본» 수(후원 3건이 섞여 있었다고 가정)
    concurrent_viewers: 17, messages: 픽스처,
  });
  확인('200 으로 받는다', 첫.status === 200, 첫);
  확인(`받은 ${픽스처.length} · 저장 ${픽스처.length} · 결측 0`,
    첫.몸 && 첫.몸.받은 === 픽스처.length && 첫.몸.저장 === 픽스처.length && 첫.몸.결측 === 0, 첫.몸);
  확인(`새로 ${픽스처.length} · 중복 0`,
    첫.몸 && 첫.몸.새로 === 픽스처.length && 첫.몸.중복 === 0, 첫.몸);
  확인('parser_ver 는 저장소 정본이 낸 값이다(사본이 서면 여기서 갈린다)',
    첫.몸 && 첫.몸.parser_ver === 파서판, { 응답: 첫.몸 && 첫.몸.parser_ver, 정본: 파서판 });
  확인('schema_ver 는 DB 계약판 모양이다', /^c\d+$/.test(String(첫.몸 && 첫.몸.schema_ver)), 첫.몸);

  /* ── ③ 멱등 ───────────────────────────────────────────────────────── */
  console.log('\n■ ③ 멱등 — 재전송이 정상 동작이다');
  const 다시 = await 부르기({
    video_id: video, polled_at: new Date().toISOString(),
    messages_seen: 픽스처.length, concurrent_viewers: 17, messages: 픽스처,
  });
  확인(`같은 것을 다시 보내면 새로 0 · 중복 ${픽스처.length}`,
    다시.몸 && 다시.몸.새로 === 0 && 다시.몸.중복 === 픽스처.length, 다시.몸);
  /* ⚠ 골격.sql 은 문자열 하나를 받는다 — 태그드 템플릿(postgres.js 풍)으로 부르면 배열이 가서
   *   Management API 가 400 을 낸다(2026-08-13 첫 실측이 이 도구 자신에게서 잡음 · F207).
   *   회차·video 는 내부 생성 토큰([a-z0-9-])이라 리터럴 삽입이 안전하다. */
  const [{ n: 행수 }] = await sql(
    `select count(*)::int as n from radio.chat_message where message_id like '${회차}-%'`);
  확인(`원장 행 수가 안 늘었다 — ${픽스처.length}건 그대로`, 행수 === 픽스처.length, { 행수 });

  /* ── ④ 원장이 무엇을 남겼나 ───────────────────────────────────────── */
  console.log('\n■ ④ 원장 보증(§4-2)');
  const 행들 = await sql(`
    select message_id, channel_id, display_name, body, raw, sent_at,
           command_kind, command_arg, parser_ver, schema_ver
      from radio.chat_message where message_id like '${회차}-%' order by message_id`);
  const 찾기 = (n) => 행들.find((r) => r.message_id === 아이디(n));

  확인('원문 그대로 남는다 — 키릴을 깎지 않는다',
    찾기('a5').body === '!질문 Багшаа "은/는" хэзээ хэрэглэх вэ?', 찾기('a5').body);
  확인('raw 가 통째로 남는다 — 파서를 고치는 날의 재파싱 근거',
    찾기('a5').raw && 찾기('a5').raw.snippet && 찾기('a5').raw.snippet.type === 'textMessageEvent', 찾기('a5').raw);
  확인('명령이 아닌 자발 발화도 남는다(command_kind = null)',
    찾기('a6').command_kind === null && 찾기('a6').body === '선생님 안녕하세요', 찾기('a6'));
  확인('화이트리스트 밖 「!랭킹」은 명령이 아니다 — 그래도 원문은 남는다',
    찾기('a10').command_kind === null && 찾기('a10').body === '!랭킹 보여줘', 찾기('a10'));
  확인('🔴 `!연동` 인자는 파생에 안 실린다(식별자 누출 자리) — 원문은 body 에 남는다',
    찾기('a9').command_kind === '연동' && 찾기('a9').command_arg === null
      && /SYNK-0001/.test(찾기('a9').body), 찾기('a9'));
  확인('②축 명령은 인자 없이도 든다', 찾기('a8').command_kind === '빗소리' && 찾기('a8').command_arg === null, 찾기('a8'));
  확인('마감 후 응답도 원장에는 남는다 — 거르는 것은 승격기(Lane B)다',
    찾기('a7').command_kind === '답' && 찾기('a7').command_arg === '2', 찾기('a7'));
  확인('비링크 채널도 남는다 — 링크는 원장의 조건이 아니다',
    행들.every((r) => typeof r.channel_id === 'string' && r.channel_id.startsWith('UC-')), null);
  확인('전 행에 parser_ver·schema_ver 가 박힌다',
    행들.every((r) => r.parser_ver === 파서판 && /^c\d+$/.test(String(r.schema_ver))), null);

  /* 🔑 승격기가 나중에 필요로 하는 것이 **지금 원장에서 재구성되는가**(§9 둘째 항목).
   *   여기서 답해석을 원장 `command_arg` 로 돌린다 — 승격기가 그날 할 일을 미리 해 보는 것이다. */
  확인('전각 「２번」이 원장 값에서 선택 2 로 재구성된다',
    JSON.stringify(답해석(찾기('a3').command_arg)) === JSON.stringify({ 선택: '2', 확신도: null }),
    { 원장: 찾기('a3').command_arg, 해석: 답해석(찾기('a3').command_arg) });
  확인('확신도 「??」가 guess 로 재구성된다',
    JSON.stringify(답해석(찾기('a4').command_arg)) === JSON.stringify({ 선택: '3', 확신도: 'guess' }),
    { 원장: 찾기('a4').command_arg, 해석: 답해석(찾기('a4').command_arg) });

  /* ── ⑤ 맥박 ───────────────────────────────────────────────────────── */
  console.log('\n■ ⑤ 수집 맥박 — 조용한 구간과 죽은 구간을 가른다');
  const 맥박 = await sql(`
    select messages_seen, concurrent_viewers, video_id, schema_ver
      from radio.ingest_heartbeat where video_id = '${video}' order by id`);
  확인('호출마다 맥박 1행 — 두 번 불렀으니 2행', 맥박.length === 2, { 맥박: 맥박.length });
  확인(`messages_seen 은 봇이 «본» 전량(${픽스처.length + 3})이지 저장 수가 아니다`,
    맥박[0] && 맥박[0].messages_seen === 픽스처.length + 3, 맥박[0]);
  확인('concurrent_viewers 가 그대로 남는다 — 노출 분모의 유일한 그날 증거',
    맥박[0] && 맥박[0].concurrent_viewers === 17, 맥박[0]);

  const 빈 = await 부르기({ video_id: `${video}-quiet`, polled_at: new Date().toISOString(), messages_seen: 0, messages: [] });
  const [{ n: 조용 }] = await sql(
    `select count(*)::int as n from radio.ingest_heartbeat where video_id = '${video}-quiet'`);
  확인('🔴 채팅 0건이어도 맥박이 남는다 — 이것이 없으면 「봇이 죽은 구간」이 영영 안 보인다',
    빈.status === 200 && 조용 === 1, { status: 빈.status, 조용 });
  확인('시청자 수를 안 주면 null 이다 — 0 으로 적으면 「아무도 안 봤다」가 굳는다',
    (await sql(`select concurrent_viewers as v from radio.ingest_heartbeat where video_id = '${video}-quiet'`))[0].v === null);

  /* ── ⑥ 결측 ───────────────────────────────────────────────────────── */
  console.log('\n■ ⑥ 결측 — 한 건 때문에 그 폴링이 통째로 날아가지 않는다');
  const 섞임 = await 부르기({
    video_id: video, polled_at: new Date().toISOString(), messages_seen: 3,
    messages: [
      채팅('b1', '!출석 정상'),
      { message_id: 아이디('b2'), channel_id: 채널('b2'), display_name: '이름', body: '', sent_at: new Date().toISOString() },
      { message_id: 아이디('b3'), channel_id: 채널('b3'), body: '본문만', sent_at: new Date().toISOString() },
    ],
  });
  확인('정상 1건은 살고 결측 2건만 버려진다',
    섞임.몸 && 섞임.몸.받은 === 3 && 섞임.몸.저장 === 1 && 섞임.몸.새로 === 1 && 섞임.몸.결측 === 2, 섞임.몸);

  보고(`픽스처 ${픽스처.length}건 투입 · 원장 ${행수}행 · 맥박 ${맥박.length + 1}행 · 회차 ${회차}`);
}

main().catch((e) => { console.error('[라디오왕복시험] ' + (e && e.stack ? e.stack : e)); process.exit(1); });
