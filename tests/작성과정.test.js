/* 작성과정 회귀 — 쓰기 3종(G1·G2·G4)이 낼 `payload.compose_meta` 조립기.
 *
 * 세 맹점을 의식하고 짰다(CLAUDE.md):
 *   ① 사람이 실제로 쓰는 표기 — 입력은 RN `onChangeText` 가 주는 **전체 텍스트**다(증분 아님).
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 「봉투 최상위도 검증기를 통과한다」는 검증기의
 *      성질이지 고칠 결함이 아니므로 회귀로 못박지 않는다. 여기가 지는 것은 **조립기가
 *      반쪽 객체를 안 만든다**는 것 하나다.
 *   ③ 자기 처방 — 조립기가 `null` 로 거부한 재료를 그 사유대로 고치면 통과해야 한다.
 *
 * 🔑 **탐지력은 픽스처가 진다** — 「4칸 한 벌」 검사가 실제로 반쪽을 잡는지 가짜 객체로 먼저
 *   증명하고, 실조립 결과에는 거짓양성이 0인지만 본다. 그러지 않으면 검사가 아무것도 안 재도
 *   초록이 된다(§6-6 ⑨ 규칙 1이 이 파일에 걸어 둔 유일한 강제라 여기가 새면 판정이 종이가 된다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const { 검증 } = require('../lib/이벤트검증.js');
const { 칸들, 계측시작, 타건, 계측payload, 글자수 } = require('../lib/작성과정.js');

/** 「4칸 한 벌」 판정 — 넷이 다 정수이고, 그 밖의 키가 없다. */
function 한벌인가(o) {
  return !!o && typeof o === 'object'
    && 칸들.every((k) => Number.isInteger(o[k]))
    && Object.keys(o).length === 칸들.length;
}

/** 글자를 한 자씩 이어 붙이며 타건을 먹인다(시각은 100ms 간격). */
function 타이핑(상태, 글자들, 시작시각 = 100) {
  let s = 상태;
  let 누적 = '';
  글자들.forEach((g, i) => {
    누적 += g;
    s = 타건(s, 누적, 시작시각 + i * 100);
  });
  return { 상태: s, 글: 누적 };
}

/* ─────────────────────── ① 탐지력 — 픽스처가 먼저 진다 ─────────────────────── */

test('한벌인가 — 반쪽 객체를 실제로 잡는다(탐지력 픽스처)', () => {
  const 온전 = { first_keystroke_ms: 1, total_compose_ms: 2, revision_count: 3, input_burst_max: 4 };
  assert.equal(한벌인가(온전), true);

  /* 되돌림이 이 자리의 급소다 — 「안 쟀다」를 0 으로 채우면 «한 번도 안 고친 학생»이 된다. */
  assert.equal(한벌인가({ ...온전, revision_count: null }), false, 'null 로 채운 칸을 잡아야 한다');
  const { input_burst_max: _빠짐, ...세칸 } = 온전;
  assert.equal(한벌인가(세칸), false, '칸이 빠진 객체를 잡아야 한다');
  assert.equal(한벌인가({ ...온전, total_compose_ms: '183000' }), false, '문자열을 잡아야 한다');
  assert.equal(한벌인가({ ...온전, 덤: 1 }), false, '모르는 칸이 붙은 것을 잡아야 한다');
  assert.equal(한벌인가(null), false);
});

/* ─────────────────────── ② 한 벌 규칙 — 못 재면 통째로 없다 ─────────────────────── */

test('계측payload — 넷을 다 재면 한 벌로 나온다', () => {
  const s = 계측시작(0);
  const { 상태 } = 타이핑(s, ['교', '수', '님'], 1000);
  const p = 계측payload(상태, 5000);
  assert.equal(한벌인가(p), true);
  assert.equal(p.first_keystroke_ms, 1000, '진입→첫 타건');
  assert.equal(p.total_compose_ms, 4000, '첫 타건→제출');
});

test('계측payload — 한 칸이라도 못 재면 넷이 다 없다(§6-6 ⑨ 규칙 1)', () => {
  /* ⓐ 시작 시각을 못 받았다 */
  const 시작없음 = 타이핑(계측시작(undefined), ['가'], 1000).상태;
  assert.equal(계측payload(시작없음, 5000), null);

  /* ⓑ 한 글자도 안 쳤다 — 첫 타건이 없다 */
  assert.equal(계측payload(계측시작(0), 5000), null);

  /* ⓒ 제출 시각을 못 받았다 */
  const 정상 = 타이핑(계측시작(0), ['가'], 1000).상태;
  assert.equal(계측payload(정상, undefined), null);

  /* ③ 자기 처방 — 위 ⓒ 를 사유대로 고치면 통과한다 */
  assert.equal(한벌인가(계측payload(정상, 5000)), true);
});

test('계측payload — 시계가 뒤로 가면 접지 않고 버린다', () => {
  const s = 타이핑(계측시작(1000), ['가'], 500).상태;   // 첫 타건이 진입보다 «이르다»
  assert.equal(계측payload(s, 5000), null, '음수를 0 으로 접으면 «즉답»으로 읽힌다');

  const s2 = 타이핑(계측시작(0), ['가'], 1000).상태;
  assert.equal(계측payload(s2, 500), null, '제출이 첫 타건보다 이른 것도 같다');
});

/* ─────────────────────── ③ 되돌림 — 횟수가 아니라 «구간» ─────────────────────── */

test('되돌림 — 연속 삭제는 한 구간이다', () => {
  let s = 계측시작(0);
  s = 타건(s, '가나다라', 100);
  s = 타건(s, '가나다', 200);
  s = 타건(s, '가나', 300);
  s = 타건(s, '가', 400);          // 세 번 지웠지만 한 구간
  const p = 계측payload(s, 1000);
  assert.equal(p.revision_count, 1, '글자마다 세면 «길게 지운 사람»과 «자주 고친 사람»이 같아진다');
});

test('되돌림 — 줄었다 늘었다 다시 줄면 두 구간이다', () => {
  let s = 계측시작(0);
  s = 타건(s, '가나다', 100);
  s = 타건(s, '가나', 200);        // 구간 1
  s = 타건(s, '가나다라', 300);    // 닫힘
  s = 타건(s, '가나다', 400);      // 구간 2
  assert.equal(계측payload(s, 1000).revision_count, 2);
});

test('되돌림 — 한 번도 안 지우면 0 이고, 그 0 은 «쟀는데 0» 이다', () => {
  const s = 타이핑(계측시작(0), ['가', '나', '다'], 100).상태;
  const p = 계측payload(s, 1000);
  assert.equal(p.revision_count, 0);
  assert.equal(한벌인가(p), true, '못 잰 것과 달리 한 벌이 온전하다');
});

/* ─────────────────────── ④ 덩어리 — 붙여넣기 휴리스틱 ─────────────────────── */

test('input_burst_max — 한 번에 들어온 최대 증가분', () => {
  let s = 계측시작(0);
  s = 타건(s, '교수님께', 100);                                   // +4
  s = 타건(s, '교수님께 안녕하세요 죄송합니다 부탁드립니다', 200);  // 덩어리
  const p = 계측payload(s, 1000);
  assert.equal(p.input_burst_max, 19);   // 23자 − 4자
  /* 🚫 이 값은 라벨이 아니다 — 조립기는 판정을 안 하고 정수만 싣는다(§7 천장).
   *   임계를 코드에 숨기면 나중에 임계를 바꿔도 과거분이 재판정되지 않는다. */
  assert.equal(typeof p.input_burst_max, 'number');
});

test('input_burst_max — 지운 것은 덩어리가 아니다(음수가 최대를 오염시키지 않는다)', () => {
  let s = 계측시작(0);
  s = 타건(s, '가나다라마', 100);   // +5
  s = 타건(s, '가', 200);           // -4
  assert.equal(계측payload(s, 1000).input_burst_max, 5);
});

/* ─────────────────────── ⑤ 첫 타건 — 무엇을 「시작」으로 치나 ─────────────────────── */

test('첫 타건 — 빈 문자열 초기화는 시작이 아니다', () => {
  let s = 계측시작(0);
  s = 타건(s, '', 100);      // 화면이 초기화하며 부른 것
  s = 타건(s, '가', 900);    // 진짜 첫 글자
  const p = 계측payload(s, 5000);
  assert.equal(p.first_keystroke_ms, 900, '초기화를 시작으로 치면 «바로 시작했다»가 공짜로 생긴다');
});

test('첫 타건 — 한글 조합 중 길이가 안 변하는 전이는 안 센다', () => {
  let s = 계측시작(0);
  s = 타건(s, 'ㅇ', 100);
  s = 타건(s, '아', 200);   // 1 → 1
  s = 타건(s, '안', 300);   // 1 → 1
  s = 타건(s, '안ㄴ', 400);
  const p = 계측payload(s, 1000);
  assert.equal(p.first_keystroke_ms, 100, '조합의 첫 자모가 시작이다');
  assert.equal(p.revision_count, 0, '조합 내 수정은 «지웠다 다시 썼다»가 아니다');
  assert.equal(p.input_burst_max, 1);
});

test('글자수 — 코드포인트로 센다(이모지가 둘로 안 갈린다)', () => {
  assert.equal(글자수('🙂'), 1);
  assert.equal(글자수('안녕'), 2);
  assert.equal(글자수(null), 0);
  let s = 계측시작(0);
  s = 타건(s, '🙂', 100);
  s = 타건(s, '', 200);
  assert.equal(계측payload(s, 1000).revision_count, 1, '이모지 한 글자 삭제 = 되돌림 1');
});

/* ─────────────────────── ⑥ 실계약 — 진짜 검증기에 태운다 ─────────────────────── */

test('실계약 — compose_meta 를 실은 G1 제출이 검증을 통과한다', () => {
  const s = 타이핑(계측시작(0), ['교', '수', '님'], 1000).상태;
  const compose_meta = 계측payload(s, 5000);
  assert.equal(한벌인가(compose_meta), true);

  const 사건 = {
    event_type: 'submission.created',
    occurred_at: '2026-08-10T10:00:00Z',
    client_ts: '2026-08-10T10:00:00Z',
    idempotency_key: 'g1:L-1:2026-08-10:1',
    task_type: '숙제제출',
    correlation_id: 'c-1',
    level_snapshot: 'TOPIK3',
    goal_snapshot: '유학',
    submission: {
      task_ref: 'g1-mail-001',
      task_format: '쓰기첨삭',
      body_original: '교수님께 드립니다.',
      task_snapshot: { 지시문: '메일을 써라', 상황: '마감 초과', challenge_id: 'g1-mail-001', addressee_level: '합쇼체', prompt_seed: 7, 판: 1 },
      task_schema_ver: 1,
    },
    /* 🔴 자리는 `payload` 안이다(§6-6 ⑨ 규칙 3) — 검증기는 봉투 최상위도 통과시키므로
     *   그 구멍을 회귀로 못박지 못한다. 여기서 지는 것은 **이 자리가 실제로 통과한다**까지다. */
    payload: { ver: 1, attempt_no: 1, compose_meta },
  };
  const r = 검증(사건, 계약, { 주체: 'app' });
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

test('실계약 — 못 잰 날은 키가 아예 없고, 그래도 제출은 선다', () => {
  const compose_meta = 계측payload(계측시작(0), 5000);   // 한 글자도 안 쳤다
  assert.equal(compose_meta, null);
  const payload = { ver: 1, attempt_no: 1 };
  if (compose_meta) payload.compose_meta = compose_meta;   // 화면이 쓸 모양 그대로
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'compose_meta'), false,
    'null 을 실으면 「안 쟀다」가 「0 이었다」로 적힌다');

  const r = 검증({
    event_type: 'submission.created',
    occurred_at: '2026-08-10T10:00:00Z',
    client_ts: '2026-08-10T10:00:00Z',
    idempotency_key: 'g1:L-1:2026-08-10:2',
    task_type: '숙제제출',
    correlation_id: 'c-2',
    level_snapshot: 'TOPIK3',
    goal_snapshot: '유학',
    submission: {
      task_ref: 'g1-mail-001', task_format: '쓰기첨삭', body_original: '가',
      task_snapshot: { 지시문: 'x', 상황: 'y', challenge_id: 'g1-mail-001', addressee_level: '합쇼체', prompt_seed: 1, 판: 1 },
      task_schema_ver: 1,
    },
    payload,
  }, 계약, { 주체: 'app' });
  assert.equal(r.ok, true, r.오류들.join(' / '));
});

/* ─────────────────────── ⑦ 목록은 하나에서 파생된다 ─────────────────────── */

test('칸들 — 조립기 반환 키와 목록이 갈리지 않는다', () => {
  const s = 타이핑(계측시작(0), ['가'], 100).상태;
  const p = 계측payload(s, 1000);
  assert.deepEqual(Object.keys(p).sort(), [...칸들].sort(),
    '두 곳에 적으면 갈라지고, 갈라진 쪽은 「통과」가 된다');
});
