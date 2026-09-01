/* 라디오24 수집봇 판정층 + 인제스트 Fn 회귀 — 설계 §5-P0 · §4-3 · §9.
 *
 * 여기서 재는 것: 화이트리스트와 **분모**(본수 ≠ 저장수) · 결측 칸 처리 · 방송 재발견 갈래 ·
 *   폴링 하한의 **근거를 계산으로**(주석이 아니라) · Fn 의 자물쇠 세 성질(좁은 시크릿·미설정
 *   503·service_role 부재) · 파생 두 칸을 Fn 만 만든다는 것.
 * 여기서 안 재는 것: 원장 왕복(= `tools/라디오왕복시험.js` 가 실 DB 로 잰다) · 파서 어휘
 *   (= `tests/라디오채팅파서.test.js`) · 승격(= Lane B).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { 코드만 } = require('./lib/소스검사.js');

const 수집 = require('../lib/라디오수집.js');
const ROOT = path.join(__dirname, '..');
const 읽기 = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const FN = 읽기('supabase', 'functions', 'radio-ingest', 'index.ts');
const 봇 = 읽기('bots', '라디오수집봇.js');
const 동봉 = JSON.parse(읽기('supabase', 'functions', 'radio-ingest', '동봉.json'));

/* 픽스처 — 유튜브가 실제로 한 배열에 섞어 주는 모양(§9 픽스처 세트의 봇 층). */
const 채팅 = (id, body, extra = {}) => ({
  id,
  snippet: { type: 'textMessageEvent', publishedAt: '2026-08-11T13:00:00Z', displayMessage: body, ...extra },
  authorDetails: { channelId: `UC-${id}`, displayName: `학생${id}` },
});

test('화이트리스트 — textMessageEvent 만 원장에 오르고, 본수는 유튜브가 준 전량이다', () => {
  const items = [
    채팅('m1', '!출석 오늘도 화이팅'),
    { id: 'm2', snippet: { type: 'superChatEvent', publishedAt: '2026-08-11T13:00:01Z' }, authorDetails: { channelId: 'UC-2', displayName: '후원자' } },
    { id: 'm3', snippet: { type: 'messageDeletedEvent', publishedAt: '2026-08-11T13:00:02Z' }, authorDetails: { channelId: 'UC-3', displayName: '운영' } },
    채팅('m4', 'Багшаа сайн байна уу'),   // 키릴 — 명령이 아니어도 원장에 오른다
  ];
  const { 행, 본수, 거른 } = 수집.수집대상(items);
  assert.strictEqual(본수, 4, '맥박이 세는 것은 받은 전량이다');
  assert.strictEqual(행.length, 2);
  assert.strictEqual(거른.유형, 2);
  assert.strictEqual(거른.결측, 0);
  assert.deepEqual(행.map((r) => r.message_id), ['m1', 'm4']);
});

test('🔴 본수와 저장수를 같은 값으로 만들지 않는다 — 조용한 구간과 후원만 온 구간이 갈려야 한다', () => {
  const 후원만 = [{ id: 'x', snippet: { type: 'superChatEvent' }, authorDetails: {} }];
  const r = 수집.수집대상(후원만);
  assert.strictEqual(r.본수, 1);
  assert.strictEqual(r.행.length, 0);
  const 조용 = 수집.수집대상([]);
  assert.strictEqual(조용.본수, 0);
  assert.strictEqual(조용.행.length, 0);
});

test('NOT NULL 칸이 비면 그 건만 버린다 — 나머지는 그 폴링에서 살아 나간다', () => {
  const items = [
    채팅('ok', '정상'),
    { id: 'no-author', snippet: { type: 'textMessageEvent', publishedAt: '2026-08-11T13:00:00Z', displayMessage: 'x' }, authorDetails: {} },
    { snippet: { type: 'textMessageEvent', publishedAt: '2026-08-11T13:00:00Z', displayMessage: 'x' }, authorDetails: { channelId: 'c', displayName: 'd' } },
    채팅('empty', ''),                                   // 빈 본문은 본문이 아니다
    채팅('no-time', 'x', { publishedAt: undefined }),
  ];
  const { 행, 거른 } = 수집.수집대상(items);
  assert.deepEqual(행.map((r) => r.message_id), ['ok']);
  assert.strictEqual(거른.결측, 4);
});

test('본문은 displayMessage 가 정본이고 textMessageDetails 가 폴백이다', () => {
  const 폴백 = {
    id: 'f1',
    snippet: { type: 'textMessageEvent', publishedAt: '2026-08-11T13:00:00Z', textMessageDetails: { messageText: '!답 2' } },
    authorDetails: { channelId: 'UC-f1', displayName: '학생' },
  };
  assert.strictEqual(수집.행세우기(폴백).body, '!답 2');
  assert.strictEqual(수집.행세우기(채팅('f2', '!답 3')).body, '!답 3');
});

test('raw 를 통째로 싣는다 — 파서를 고치는 날의 재파싱 근거(§4-2 보증)', () => {
  const it = 채팅('r1', '!질문 은/는 차이');
  const 행 = 수집.행세우기(it);
  assert.strictEqual(행.raw, it, '가공하지 않은 원 항목 그대로여야 한다');
});

test('🔴 봇은 파생 두 칸을 만들지 않는다 — 파서판이 갈라지는 자리를 원천 차단', () => {
  const 행 = 수집.행세우기(채팅('p1', '!출석 하이'));
  assert.ok(!('command_kind' in 행), 'command_kind 를 봇이 실으면 원장 parser_ver 와 갈라진다');
  assert.ok(!('command_arg' in 행));
  assert.ok(!('parser_ver' in 행));
  const 봇코드 = 코드만(봇);
  assert.ok(!/라디오채팅파서/.test(봇코드), '봇이 파서를 직접 물면 Fn 과 두 벌이 된다');
});

test('방송 고르기 — 없으면 null(재발견 루프가 계속 돈다)', () => {
  assert.strictEqual(수집.방송고르기([{ id: { videoId: 'v1' } }, { id: { videoId: 'v2' } }]), 'v1');
  assert.strictEqual(수집.방송고르기([]), null);
  assert.strictEqual(수집.방송고르기(null), null);
  assert.strictEqual(수집.방송고르기([{ id: { channelId: 'c' } }]), null);
});

test('🔴 시청자 수가 없으면 null 이다 — 0 으로 적으면 「아무도 안 봤다」가 원장에 굳는다', () => {
  assert.deepEqual(수집.방송상세([{ liveStreamingDetails: { activeLiveChatId: 'lc1', concurrentViewers: '42' } }]),
    { live_chat_id: 'lc1', concurrent_viewers: 42 });
  assert.deepEqual(수집.방송상세([{ liveStreamingDetails: { activeLiveChatId: 'lc1' } }]),
    { live_chat_id: 'lc1', concurrent_viewers: null });
  assert.strictEqual(수집.방송상세([{ liveStreamingDetails: {} }]), null, '채팅방 id 가 없으면 물 것이 없다');
  assert.strictEqual(수집.방송상세([]), null);
});

test('폴링 하한의 근거를 계산으로 못박는다 — 60초는 한도 안, 30초는 밖(설계 §5 쿼터)', () => {
  assert.strictEqual(수집.하루유닛(60_000), 7_200);
  assert.ok(수집.쿼터안전(60_000), '60초 = 7,200 유닛 ≤ 10,000');
  assert.ok(!수집.쿼터안전(30_000), '30초 = 14,400 유닛 — 넘은 날의 증상은 「조용히 수집 0」이다');
  assert.ok(수집.쿼터안전(수집.폴링하한밀리), '하한 자체가 안전권 밖이면 봇이 매일 죽는다');
});

test('유튜브가 더 느리게 치라면 따른다 — 빨리 치라고 해도 하한은 우리 것이다', () => {
  assert.strictEqual(수집.다음간격밀리(120_000), 120_000);
  assert.strictEqual(수집.다음간격밀리(1_000), 수집.폴링하한밀리);
  assert.strictEqual(수집.다음간격밀리(undefined), 수집.폴링하한밀리);
  assert.strictEqual(수집.다음간격밀리('빠르게'), 수집.폴링하한밀리);
});

test('죽는 갈래 둘을 섞지 않는다 — 401=갱신 · 403/404=재발견', () => {
  assert.ok(수집.재발견필요(403) && 수집.재발견필요(404));
  assert.ok(!수집.재발견필요(401), '401 에 재발견을 돌리면 토큰 만료를 영원히 못 본다');
  assert.ok(수집.토큰갱신필요(401));
  assert.ok(!수집.토큰갱신필요(404));
  assert.ok(!수집.재발견필요(500) && !수집.토큰갱신필요(500));
});

/* ── 인제스트 Fn — 자물쇠 세 성질(소스 검사이므로 주석을 지우고 본다) ────────────── */

test('🔴 봇 통로에 service_role 이 없다 — 설계 §4-3 「봇은 원장 전달자일 뿐」', () => {
  assert.ok(!/SERVICE_ROLE/.test(코드만(봇)), '봇 호스트에 service_role 을 두면 그 하나로 운영 DB 전체가 열린다');
  assert.match(코드만(봇), /x-radio-ingest-key/, '봇이 드는 자물쇠는 좁은 시크릿 하나여야 한다');
});

test('🔴 시크릿 미설정은 503 이다 — 없는 자물쇠를 통과로 읽으면 문이 통째로 열린다', () => {
  const 코드 = 코드만(FN);
  assert.match(코드, /RADIO_INGEST_SECRET/);
  assert.match(코드, /if \(!비밀\)[\s\S]{0,200}?503/, '미설정에서 503 으로 끊어야 한다');
  assert.match(코드, /같은비밀\(들고온, 비밀\)[\s\S]{0,80}?401/, '불일치는 401');
});

test('verify_jwt 를 자물쇠로 쓰지 않는다 — anon 키도 유효한 JWT 다', () => {
  const 코드 = 코드만(FN);
  assert.ok(!/토큰주체|서비스역할/.test(코드), '이 문의 판정은 좁은 시크릿 하나가 진다');
});

test('멱등을 DB 가 진다 — on conflict do nothing + 응답에 분모', () => {
  const 코드 = 코드만(FN);
  assert.match(코드, /on conflict \(message_id\) do nothing/);
  assert.match(코드, /returning message_id/, '실제로 늘어난 수를 세야 「받았다」와 「남았다」가 갈린다');
  assert.match(코드, /받은, 저장: 행들\.length, 새로, 중복/);
});

test('맥박은 0건이어도 남는다 — 조용한 구간과 죽은 구간을 가르는 유일한 증거', () => {
  const 코드 = 코드만(FN);
  const i = 코드.indexOf('insert into radio.ingest_heartbeat');
  assert.ok(i > 0, '맥박 삽입이 있어야 한다');
  const 앞 = 코드.slice(0, i);
  assert.ok(!/if \(!행들\.length\) return/.test(앞), '행 0건에 조기 반환하면 맥박이 안 남는다');
});

test('계약판은 DB 에게 묻는다 — 함수가 DB 보다 앞설 수 없게(events·deliver 와 같은 근거)', () => {
  const 코드 = 코드만(FN);
  assert.match(코드, /engine\.schema_migrations order by version desc limit 1/);
  assert.ok(!/schema_ver.*=.*'c\d+'/.test(코드), '계약판 손 상수를 두지 않는다');
});

test('파서 정본을 동봉으로 그대로 쓴다 — 사본이 서면 원장 parser_ver 가 거짓이 된다', () => {
  assert.strictEqual(동봉['라디오파서.mjs'], 'lib/라디오채팅파서.js');
  for (const m of FN.matchAll(/^\s*import\s+[^'"]*from\s+'\.\/([^']+\.mjs)'/gm)) {
    assert.ok(동봉[m[1]], `index.ts 가 import 하는 ${m[1]} 이 동봉 표에 없다 — 배포는 ✅ 로 끝나고 첫 호출에서 죽는다`);
  }
  assert.match(코드만(FN), /파서판, 파싱/, 'parser_ver 는 파서 정본이 내는 값이어야 한다');
});

test('승격을 여기서 하지 않는다 — 오귀속이 불변 테이블에 굳는 자리(§4-3)', () => {
  const 코드 = 코드만(FN);
  assert.ok(!/learning_events/.test(코드), '원장은 재파싱되고 승격은 안 된다 — 게이트 뒤로 미룬다');
});

/* ── 탐지력 픽스처 — 위 소스 검사가 실제로 무언가를 잡는가(주석에 눈멀지 않는가) ──── */

test('탐지력 — 주석으로만 적힌 성질은 통과시키지 않는다', () => {
  const 가짜 = [
    '/* on conflict (message_id) do nothing 이라고 설명만 한다 */',
    'const x = 1;',
  ].join('\n');
  assert.ok(!/on conflict \(message_id\) do nothing/.test(코드만(가짜)),
    '주석 제거가 안 되면 이 파일의 검사 전부가 설명을 코드로 읽는다');
});

/* ══ 재발견 물러섬 — 09-02 신설. 쿼터 모델의 «구멍»을 값으로 못박는다. ═══════════
 *
 * 막는 사고: 봇이 방송을 못 찾으면 폴링 간격(60초)으로 `search.list` 를 다시 쳤다.
 * 그런데 그 한 번이 **100유닛**이라 하루 144,000 = 한도(10,000)의 14배다.
 * ⇒ 첫 송출 «전»에 봇을 켜 두면 100분 만에 그날 쿼터가 바닥나고, 정작 방송이 켜졌을 때
 *   찾을 유닛이 없다. 증상은 「봇은 살아 있는데 수집만 0」이고 그날 원장은 소급이 안 된다.
 */

test('재발견 — 못 찾을수록 느리게 찾는다(지수 물러섬 · 상한에 눌린다)', () => {
  assert.strictEqual(수집.재발견간격밀리(0), 수집.폴링하한밀리, '첫 시도까지 늦추면 켜자마자 먹통으로 보인다');
  assert.strictEqual(수집.재발견간격밀리(1), 120_000);
  assert.strictEqual(수집.재발견간격밀리(2), 240_000);
  assert.strictEqual(수집.재발견간격밀리(5), 수집.재발견상한밀리, '상한(30분)에 눌려야 한다');
  assert.strictEqual(수집.재발견간격밀리(999), 수집.재발견상한밀리, '아무리 오래 못 찾아도 상한을 안 넘는다');
});

test('재발견 — 이상한 입력은 하한으로(지어내지 않는다)', () => {
  for (const 나쁜 of [null, undefined, NaN, -3, '많이']) {
    assert.strictEqual(수집.재발견간격밀리(나쁜), 수집.폴링하한밀리, `${String(나쁜)} 에서 갈렸다`);
  }
});

test('🔴 재발견이 하루 종일 헛돌아도 한도 안이다 — 옛 판은 14배였다', () => {
  const 최악 = 수집.재발견유닛최악();
  assert.ok(최악 <= 수집.일일한도,
    `못 찾는 날 ${최악} 유닛 > 한도 ${수집.일일한도} — 방송이 켜졌을 때 찾을 유닛이 안 남는다`);
  const 옛판 = Math.ceil((24 * 60 * 60 * 1000) / 수집.폴링하한밀리) * 수집.재발견단가;
  assert.ok(옛판 > 수집.일일한도 * 10,
    '옛 판이 한도를 크게 넘지 않았다면 이 회귀가 지키는 사고가 없는 것이다(전제 확인)');
});

test('search.list 단가는 읽기·쓰기와 견줄 수 있게 같은 자리에 산다', () => {
  assert.strictEqual(수집.재발견단가, 100, '공식 표값 — 읽기 최악 5 · 쓰기 50 과 견주는 자리다');
  assert.ok(수집.재발견단가 > 수집.출제단가 && 수집.출제단가 > 수집.단가최악,
    '세 단가의 크기 관계가 뒤집히면 「무엇부터 줄이나」의 근거가 바뀐다');
});
