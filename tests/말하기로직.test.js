'use strict';
/** 「말하기」 순수 로직 회귀 — 화면보다 먼저 데이터의 뼈대를 못박는다. 정본 = docs/말하기_설계.md */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { 발화문턱_DB, 무음_DB, 데시벨, 머뭇거림추적, 호흡순서, 다음호흡 } = require('../lib/세호흡.js');
const { 흐름id, 다음시도번호, 항목추가, 직렬화, 역직렬화, 학습출석, 전송기록, 밀린것, 배달상태 } = require('../lib/제출로그.js');

// ── 머뭇거림 (설계 §5 — 퀴즈 확신도의 대체물) ──────────────────

test('머뭇거림: 첫 발화 시각을 잡는다', () => {
  const t = 머뭇거림추적();
  t.표본(100, -60);
  t.표본(700, -50);
  t.표본(1300, -20); // 첫 발화
  t.표본(1400, -10);
  assert.deepEqual(t.결과(5000), { 발화있음: true, 머뭇거림_ms: 1300 });
});

test('머뭇거림: 무발화면 머뭇거림 = 총길이 (연속값 — 이진 아님)', () => {
  const t = 머뭇거림추적();
  t.표본(500, -60);
  t.표본(2500, -55);
  assert.deepEqual(t.결과(3000), { 발화있음: false, 머뭇거림_ms: 3000 });
});

test('머뭇거림: 문턱 정확히 그 값은 발화가 아니다(초과만)', () => {
  const t = 머뭇거림추적();
  t.표본(200, 발화문턱_DB);
  assert.equal(t.결과(1000).발화있음, false);
});

test('머뭇거림: null·undefined 미터링 표본은 무시한다(웹은 미터링이 없을 수 있다)', () => {
  const t = 머뭇거림추적();
  t.표본(100, null);
  t.표본(200, undefined);
  t.표본(300, -10);
  assert.equal(t.결과(1000).머뭇거림_ms, 300);
});

// ── 마이크 세기 (배선① · PCM 스트림에는 metering 칸이 없어 우리가 잰다) ──

/** int16 리틀엔디언으로 표본을 싼다 — `useAudioStream` 이 주는 것과 같은 모양. */
const pcm = (값들) => {
  const b = new Uint8Array(값들.length * 2);
  const dv = new DataView(b.buffer);
  값들.forEach((v, i) => dv.setInt16(i * 2, v, true));
  return b;
};

test('세기: 최대진폭은 0dBFS 근처, 무음은 바닥값', () => {
  assert.ok(Math.abs(데시벨(pcm([32767, -32767, 32767, -32767]))) < 0.1);
  assert.equal(데시벨(pcm([0, 0, 0, 0])), 무음_DB);
});

/* 🔴 바이트 순서를 거꾸로 읽으면 큰 소리가 작게 잰다 — 말한 학생이 「무발화」로 남는다.
 * 0x4000(=진폭 0.5 · 약 -6dB)은 거꾸로 읽으면 0x0040(≈ -54dB)이라 문턱의 반대편이다. */
test('세기: 표본을 리틀엔디언으로 읽는다', () => {
  const dB = 데시벨(Uint8Array.from([0x00, 0x40, 0x00, 0x40]));
  assert.ok(dB > -7 && dB < -5, `기대 ≈-6dB, 실제 ${dB}`);
  assert.ok(dB > 발화문턱_DB);
});

test('세기: 문턱 양쪽을 실제로 가른다', () => {
  assert.ok(데시벨(pcm([3277, -3277, 3277, -3277])) > 발화문턱_DB); // 진폭 0.1 ≈ -20dB
  assert.ok(데시벨(pcm([328, -328, 328, -328])) < 발화문턱_DB); // 진폭 0.01 ≈ -40dB
});

/* 표본이 없을 때 0 을 돌려주면 그건 dBFS 에서 **최대 음량**이라 무발화가 발화로 뒤집힌다. */
test('세기: 표본이 없으면 null 이고, 머뭇거림추적이 그것을 무시한다', () => {
  assert.equal(데시벨(new Uint8Array(0)), null);
  assert.equal(데시벨(Uint8Array.from([0x7f])), null); // 반쪽 표본 하나뿐

  const t = 머뭇거림추적();
  t.표본(100, 데시벨(new Uint8Array(0)));
  assert.equal(t.결과(1000).발화있음, false);
});

test('세기: 프레임을 못 채운 꼬리 바이트는 세지 않는다', () => {
  const 온전 = 데시벨(pcm([20000, -20000]));
  const 꼬리 = 데시벨(Uint8Array.from([...pcm([20000, -20000]), 0x7f]));
  assert.equal(꼬리, 온전);
});

// ── 호흡 순서 (설계 §6) ────────────────────────────────────────

test('호흡: 듣기→따라→답하기→완료', () => {
  assert.deepEqual(호흡순서, ['듣기', '따라', '답하기']);
  assert.equal(다음호흡('듣기'), '따라');
  assert.equal(다음호흡('따라'), '답하기');
  assert.equal(다음호흡('답하기'), '완료');
  assert.throws(() => 다음호흡('퀴즈')); // 흡수됐다 — 되살아나면 여기가 빨간불
});

// ── 제출 로그 (설계 §3 — 지우지 않는다) ───────────────────────

const 기본 = {
  date: '2026-08-03',
  step: '따라',
  status: 'submitted',
  duration_ms: 4200,
  hesitation_ms: 800,
  spoke: true,
  threshold_db: 발화문턱_DB,
  created_at: '2026-08-03T12:00:00Z',
};

/* ── 한 앉음을 묶는 고리 (P0 §3-1 ④) ──────────────────────────────
 * 🔑 서버는 이 칸의 **모양을 먼저** 본다(uuid 아니면 400 `retryable:false` — 그 발화는 다시
 *   보내지지도 않는다). 그래서 판정 기준을 여기 베껴 적지 않고 **그 가드에서 읽어 온다** —
 *   서버가 규칙을 조이면 이 검사가 따라 조여지고, 갈라지는 일이 없다. */
const 서버모양 = (() => {
  const 원문 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'events', 'index.ts'), 'utf8');
  const m = 원문.match(/const UUID = \/(.+?)\/([a-z]*);/);
  assert.ok(m, 'functions/events 의 UUID 가드를 못 찾았다 — 이름이 바뀌었으면 이 검사가 헛돈다');
  return new RegExp(m[1], m[2]);
})();

test('흐름id: 서버 uuid 가드를 통과한다 — 기기에 crypto 가 없어도', () => {
  // 탐지력은 픽스처로 못박는다(버그가 아직 있을 것을 요구하지 않는다):
  // 읽히는 키를 쓰고 싶어지는 자리라, 그게 실제로 막히는지 먼저 보인다.
  assert.equal(서버모양.test(`submission:2026-08-03:따라:1`), false);
  assert.equal(서버모양.test('1f0c9c1e6a2d4c3b8f112b7a5d9e0c44'), false, '하이픈 없는 32자도 uuid 가 아니다');

  const 값 = 흐름id();
  assert.ok(서버모양.test(값), `uuid 가 아니다: ${값}`);
  assert.notEqual(값, 흐름id(), '두 앉음이 같은 값을 들면 남의 발화가 내 흐름에 묶인다');
});

/* 이 로그가 곧 오프라인 큐다 — 3일 뒤에 올라가는 항목이 있다. 보낼 때 「지금 흐름」을 붙이면
 * 그 항목이 남의 앉음에 묶이고, 오류 없이 조회할 때에야 어긋나 보인다. */
test('흐름은 항목이 들고 간다 — 같은 앉음의 ②③이 한 값을 든다', () => {
  const 흐름 = 흐름id();
  let r = 항목추가([], { ...기본, correlation_id: 흐름 });
  r = 항목추가(r.로그, { ...기본, step: '답하기', correlation_id: 흐름 });
  assert.equal(r.로그[0].correlation_id, 흐름);
  assert.equal(r.로그[1].correlation_id, 흐름);

  // 왕복(직렬화→역직렬화)에서 살아남아야 오프라인 큐에서 의미가 있다.
  assert.equal(역직렬화(직렬화(r.로그)).로그[1].correlation_id, 흐름);

  // 안 주면 지어내지 않는다 — 옛 판 항목이 큐에 남아 있을 수 있다.
  assert.equal(항목추가([], 기본).항목.correlation_id, null);
});

test('재시도는 attempt 를 올린 새 항목 — 이전 항목이 그대로 남는다', () => {
  let r = 항목추가([], 기본);
  r = 항목추가(r.로그, { ...기본, duration_ms: 3100 });
  assert.equal(r.로그.length, 2);
  assert.equal(r.로그[0].attempt, 1);
  assert.equal(r.로그[1].attempt, 2);
  assert.equal(r.로그[0].duration_ms, 4200, '이전 시도가 변형됐다 — 데이터 파괴');
});

test('무발화(abandoned)도 시도로 센다', () => {
  let r = 항목추가([], { ...기본, status: 'abandoned', spoke: false });
  r = 항목추가(r.로그, 기본);
  assert.equal(r.로그[1].attempt, 2, 'abandoned 를 안 세면 「한 번에 말했다」로 둔갑한다');
});

test('attempt 번호는 날짜·호흡별로 독립', () => {
  let r = 항목추가([], 기본);
  r = 항목추가(r.로그, { ...기본, step: '답하기' });
  r = 항목추가(r.로그, { ...기본, date: '2026-08-04' });
  assert.equal(r.로그[1].attempt, 1);
  assert.equal(r.로그[2].attempt, 1);
});

test('원본 배열을 변형하지 않는다', () => {
  const 원본 = [];
  항목추가(원본, 기본);
  assert.equal(원본.length, 0);
});

test('녹음이 없는 호흡(듣기)·모르는 status 는 거부한다', () => {
  assert.throws(() => 항목추가([], { ...기본, step: '듣기' }));
  assert.throws(() => 항목추가([], { ...기본, status: 'deleted' }));
});

test('retried — 대체된 시도가 음성과 함께 남고, 최종 제출과 나란히 선다', () => {
  let r = 항목추가([], { ...기본, status: 'retried', audio: 'a1.m4a' });
  r = 항목추가(r.로그, { ...기본, status: 'submitted', audio: 'a2.m4a' });
  assert.equal(r.로그[0].status, 'retried');
  assert.equal(r.로그[0].audio, 'a1.m4a', '대체된 녹음의 음성이 사라졌다 — 자기수정 데이터 파괴');
  assert.equal(r.로그[1].attempt, 2);
});

test('JSONL 왕복 — 항목이 그대로 돌아온다', () => {
  let r = 항목추가([], 기본);
  r = 항목추가(r.로그, { ...기본, step: '답하기', text: '저는 몽골에서 왔어요' });
  const { 로그, 깨진줄 } = 역직렬화(직렬화(r.로그));
  assert.deepEqual(로그, r.로그);
  assert.equal(깨진줄, 0);
});

test('JSONL 중간 줄이 깨져도 나머지는 살고, 깨진 수를 보고한다', () => {
  const r = 항목추가([], 기본);
  const text = 직렬화(r.로그) + '{깨진 json\n' + 직렬화(항목추가(r.로그, 기본).로그.slice(-1));
  const { 로그, 깨진줄 } = 역직렬화(text);
  assert.equal(로그.length, 2);
  assert.equal(깨진줄, 1, '깨진 줄을 조용히 삼키면 「모름」이 「정상」이 된다');
});

test('학습 출석 = 답하기 submitted (설계 §2)', () => {
  let r = 항목추가([], 기본); // 따라만 제출
  assert.equal(학습출석(r.로그, '2026-08-03'), false, '따라 말하기만으로는 출석이 아니다');
  r = 항목추가(r.로그, { ...기본, step: '답하기', status: 'abandoned', spoke: false });
  assert.equal(학습출석(r.로그, '2026-08-03'), false, '무발화는 출석이 아니다');
  r = 항목추가(r.로그, { ...기본, step: '답하기' });
  assert.equal(학습출석(r.로그, '2026-08-03'), true);
  assert.equal(학습출석(r.로그, '2026-08-04'), false);
});

// ── 서버 전송 상태 (S1-b 쓰기 절반 · C0 §4-1) ─────────────────────
// 이 로그가 사실상 오프라인 큐다. 세 칸이 각각 다른 사실을 지므로 합칠 수 없다.

/* 🔴 오늘 재료로 3일 밀린 항목을 보내면 **어제 발화가 오늘 과제에 붙는다** — 오류 없이,
 *   조회할 때에야 어긋나 보인다. 그래서 봉투 재료는 항목이 자기 것을 들고 간다(C0 §4-1). */
test('항목이 그때의 봉투 재료와 녹음 설정을 들고 간다', () => {
  const 재료 = { task_ref: 'task-2026-08-03', level_snapshot: 'Lv2' };
  const { 항목 } = 항목추가([], { ...기본, task_meta: 재료, capture_app: { platform: 'ios' } });
  assert.deepEqual(항목.task_meta, 재료);
  assert.equal(항목.capture_app.platform, 'ios');
  // 안 넘기면 null 이다 — `{}` 로 채우면 「재료가 있다」와 「없다」가 같은 모양이 된다.
  assert.equal(항목추가([], 기본).항목.task_meta, null);
});

test('새 항목은 아직 서버에 닿지 않은 상태로 선다', () => {
  const { 항목 } = 항목추가([], 기본);
  assert.equal(항목.event_id, null);
  assert.equal(항목.send_error, null);
  assert.equal(항목.send_final, false);
});

test('전송기록은 그 항목만 고친다 — 나머지는 글자 하나 안 바뀐다', () => {
  let r = 항목추가([], 기본);
  r = 항목추가(r.로그, { ...기본, step: '답하기' });
  const 앞 = JSON.stringify(r.로그[0]);
  const 새 = 전송기록(r.로그, r.로그[1].id, { event_id: 'e-1' });
  assert.equal(JSON.stringify(새[0]), 앞, '남의 항목이 바뀌었다 — 데이터 파괴');
  assert.equal(새[1].event_id, 'e-1');
  assert.notEqual(새, r.로그, '원본 배열을 그대로 돌려주면 화면이 갱신을 못 본다');
});

/* 🔴 계약 위반은 100번 보내도 계약 위반이다. `send_final` 이 없으면 그 항목이 앱을 열 때마다
 *   재전송돼 몽골 모바일 회선을 태우고, 실패는 매번 같은 자리에서 난다. */
test('밀린 것 = 아직 안 닿았고 다시 보낼 값이 있는 것 — 순서 그대로', () => {
  let r = 항목추가([], 기본);                                   // ① 보낼 것
  r = 항목추가(r.로그, { ...기본, step: '답하기' });              // ② 이미 닿음
  r = 항목추가(r.로그, { ...기본, step: '답하기' });              // ③ 영구 실패
  let 로그 = 전송기록(r.로그, r.로그[1].id, { event_id: 'e-1' });
  로그 = 전송기록(로그, r.로그[2].id, { 오류: '계약 위반', 끝: true });

  assert.deepEqual(밀린것(로그).map((e) => e.id), [r.로그[0].id]);

  // 재시도 가능한 실패는 다시 대상이 된다 — 사유는 남기되 포기하지 않는다.
  const 재시도 = 전송기록(로그, r.로그[0].id, { 오류: '인터넷 연결을 확인해 주세요' });
  assert.deepEqual(밀린것(재시도).map((e) => e.id), [r.로그[0].id]);
  assert.equal(재시도[0].send_error, '인터넷 연결을 확인해 주세요', '사유 없이 실패하면 원인이 안 남는다');
});

/* 🔴 화면이 「목소리가 도착했어요」라고 말해도 되는지의 근거. 이게 없으면 전송이 통째로 실패해도
 *   완료 카드는 늘 도착을 선언하고, 우리는 몇 주 뒤 빈 테이블을 보고서야 안다(P0 §4-1). */
test('배달상태: 기기 저장을 도착으로 세지 않는다 — 셋을 각각 센다', () => {
  let r = 항목추가([], 기본);                                    // ① 아직 안 보냄
  r = 항목추가(r.로그, { ...기본, step: '답하기' });               // ② 닿음
  r = 항목추가(r.로그, { ...기본, step: '답하기' });               // ③ 영구 실패
  r = 항목추가(r.로그, { ...기본, date: '2026-08-04' });           // ④ 다른 날
  let 로그 = 전송기록(r.로그, r.로그[1].id, { event_id: 'e-1' });
  로그 = 전송기록(로그, r.로그[2].id, { 오류: '계약 위반', 끝: true });

  assert.deepEqual(배달상태(로그, '2026-08-03'), { 도착: 1, 보내는중: 1, 못보냄: 1 });
  assert.deepEqual(배달상태(로그, '2026-08-04'), { 도착: 0, 보내는중: 1, 못보냄: 0 }, '다른 날을 섞어 세면 안 된다');

  // 재시도 가능한 실패는 「못 보냄」이 아니라 「보내는 중」이다 — 다음에 앱을 열면 다시 간다.
  const 재시도 = 전송기록(로그, r.로그[0].id, { 오류: '인터넷 연결을 확인해 주세요' });
  assert.deepEqual(배달상태(재시도, '2026-08-03'), { 도착: 1, 보내는중: 1, 못보냄: 1 });

  // 닿은 항목에 `끝` 이 함께 붙어도 「못 보냄」이 아니다 — 도착이 이긴다.
  // (오늘 `발화보내기` 는 그 조합을 안 만들지만, 성공에 `끝: true` 를 붙이는 건 자연스러운 다음 수다.)
  const 닿고끝 = 전송기록(로그, r.로그[1].id, { event_id: 'e-1', 끝: true });
  assert.deepEqual(배달상태(닿고끝, '2026-08-03'), { 도착: 1, 보내는중: 1, 못보냄: 1 }, '닿은 것을 못 보냄으로 셌다');

  // 하나도 안 닿은 상태를 「다 닿음」으로 읽으면 카드가 거짓말을 한다.
  const 전부밀림 = 배달상태(항목추가([], 기본).로그, '2026-08-03');
  assert.equal(전부밀림.도착, 0);
  assert.equal(전부밀림.보내는중 === 0 && 전부밀림.못보냄 === 0, false, '미도착인데 「다 닿음」으로 읽혔다');
});
