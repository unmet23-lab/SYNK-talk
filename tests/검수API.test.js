'use strict';
/**
 * 검수 API 회귀 (검수_내부계약 §3·§4·§5) — **앱이 직원 통로를 계약대로 부르나**.
 *
 * 왜 있나: `review` 함수 셋은 서 있는데 부르는 코드가 0줄이었다(대기열 P1 ⑥ 착수순서 4).
 *   부르는 코드가 처음 생기는 자리라, 여기서 갈라지면 증상이 **검수자에게만** 보인다 —
 *   경로가 틀리면 404, 값목록이 낡으면 500, 봉투를 잘못 읽으면 「빈 큐」로 조용히 접힌다.
 *   셋 다 서버 테스트가 못 잡는다(서버는 자기가 옳다).
 *
 * ⚠ 네트워크는 안 탄다 — `fetch` 를 가짜로 심고 **보낸 요청을 그대로 받아 본다**.
 *   `src/사건통로.js` 를 재귀로 같이 세운다(봉투 해석·401 재갱신이 거기 산다 · 그 사본을
 *   가짜로 바꿔치면 정작 재려는 것이 한 번도 안 재진다 · `앱모듈세우기.js` 머리말).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { 세우기: 앱모듈 } = require('./lib/앱모듈세우기.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', '검수API.js');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));

/** 응답 하나를 주는 가짜 fetch + 보낸 요청 기록 */
function 세운판(몸, status = 200) {
  const 요청들 = [];
  const 가짜 = async (url, opt) => {
    요청들.push({
      url,
      메서드: (opt && opt.method) || 'GET',
      헤더: (opt && opt.headers) || {},
      몸통: opt && opt.body ? JSON.parse(opt.body) : null,
    });
    return { ok: status < 400, status, json: async () => 몸 };
  };
  return { 모듈: 앱모듈(SRC, 가짜), 요청들 };
}

const SID = '11111111-2222-4333-8444-555555555555';
const AI = '99999999-8888-4777-8666-555555555555';

/* ─── 값목록: 손 상수가 정본과 갈라지는 자리 ─────────────────────────── */

test('오류태그가 계약 정본과 순서까지 같다', () => {
  const { 모듈 } = 세운판({ ok: true, data: [] });
  /* 🔴 순서까지 보는 이유: 화면이 이 배열을 그대로 그린다. 순서가 바뀌면 검수자가 눈으로
     외운 자리가 어긋나고, 그건 「틀린 태그를 빠르게 누르는」 결과로 나온다. */
  assert.deepEqual([...모듈.오류태그], 계약.오류태그);
});

test('폐기사유가 여섯이고 산문·CHECK 와 같은 어휘다', () => {
  const { 모듈 } = 세운판({ ok: true, data: [] });
  /* 정본(CHECK)·산문 둘과의 대조는 `tests/폐기사유.test.js` 가 한자리에서 진다 —
     여기서는 **개수와 모양**만 못박는다(그 파일이 사라져도 6이 5가 되면 여기서 빨개진다). */
  assert.equal(모듈.폐기사유.length, 6);
  assert.ok(모듈.폐기사유.every((v) => typeof v === 'string' && v.trim() === v && v !== ''));
});

/* ─── §3 큐 ──────────────────────────────────────────────────────────── */

test('큐받기는 GET 이고 review/queue 를 부른다', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, data: [{ submission_id: SID }], next_cursor: 'c1' });
  const r = await 모듈.큐받기('T', { 개수: 5 });
  assert.equal(요청들.length, 1);
  assert.equal(요청들[0].메서드, 'GET');
  assert.ok(요청들[0].url.endsWith('/functions/v1/review/queue?limit=5'), 요청들[0].url);
  assert.equal(r.목록.length, 1);
  assert.equal(r.다음커서, 'c1');
});

test('커서는 URL 인코딩해 싣는다 — 정렬키 짝이라 구분자가 섞여 온다', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, data: [] });
  await 모듈.큐받기('T', { 커서: 'a b|c/d' });
  assert.ok(요청들[0].url.includes(`cursor=${encodeURIComponent('a b|c/d')}`), 요청들[0].url);
  assert.ok(!요청들[0].url.includes('limit='), '개수를 안 주면 limit 을 안 붙인다(서버 기본값)');
});

test('data 가 없어도 빈 배열이다 — 빈 큐가 정상이라 여기서 죽으면 안 된다', async () => {
  const { 모듈 } = 세운판({ ok: true });
  const r = await 모듈.큐받기('T');
  assert.deepEqual(r.목록, []);
  assert.equal(r.다음커서, null);
});

/* ─── §4 서명 ────────────────────────────────────────────────────────── */

test('오디오서명받기는 POST 로 submission_id 하나만 보낸다', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, url: 'https://x/sign', expires_at: '2026-08-09T00:10:00Z' });
  const r = await 모듈.오디오서명받기('T', SID);
  assert.equal(요청들[0].메서드, 'POST');
  assert.ok(요청들[0].url.endsWith('/functions/v1/review/audio'));
  assert.deepEqual(요청들[0].몸통, { submission_id: SID });
  assert.equal(r.url, 'https://x/sign');
  assert.equal(r.만료, '2026-08-09T00:10:00Z');
});

/* ─── §5 승인·폐기 ───────────────────────────────────────────────────── */

test('승인하기는 verdict 를 안 보내고 서버가 낸 것을 그대로 받는다', async () => {
  const { 모듈, 요청들 } = 세운판({
    ok: true,
    correction_id: 'cc',
    verdict: '고칠 곳이 있다',
    promotion_intent: true,
    listen_gate: { required_ms: 3000, measured: false },
  });
  const r = await 모듈.승인하기('T', {
    submission_id: SID,
    reviewed_correction_id: AI,
    transcript_verified: '학생 말',
    corrected_text: '고친 말',
    review_listened_ms: 3200,
    promote: true,
  });
  /* 🔴 요청에 verdict 가 있으면 화면이 라벨을 고르는 것이다 — 서버 파생이라는 계약이 깨진다. */
  assert.ok(!('verdict' in 요청들[0].몸통), 'verdict 를 보내면 안 된다');
  assert.equal(요청들[0].몸통.review_listened_ms, 3200);
  assert.equal(r.verdict, '고칠 곳이 있다');
  assert.equal(r.promotion_intent, true);
  assert.deepEqual(r.listen_gate, { required_ms: 3000, measured: false });
});

test('promotion_intent 는 true 일 때만 true 다 — 빠진 응답을 승격으로 접지 않는다', async () => {
  const { 모듈 } = 세운판({ ok: true, correction_id: 'cc', verdict: 'v' });
  const r = await 모듈.승인하기('T', { submission_id: SID });
  assert.equal(r.promotion_intent, false);
  assert.equal(r.listen_gate, null);
});

test('폐기하기는 reason 을 그대로 싣는다', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, discarded: true, reason: '무음' });
  const r = await 모듈.폐기하기('T', SID, '무음');
  assert.ok(요청들[0].url.endsWith('/functions/v1/review/discard'));
  assert.deepEqual(요청들[0].몸통, { submission_id: SID, reason: '무음' });
  assert.equal(r.폐기됨, true);
  assert.equal(r.사유, '무음');
});

/* ─── 봉투·오류 ──────────────────────────────────────────────────────── */

test('X-Contract-Ver 를 매번 싣는다 — 없으면 서버가 400 이다', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, data: [] });
  await 모듈.큐받기('T');
  await 모듈.오디오서명받기('T', SID).catch(() => {});
  assert.ok(요청들.every((r) => typeof r.헤더['X-Contract-Ver'] === 'string' && r.헤더['X-Contract-Ver']));
});

test('GET 에는 Content-Type 을 안 붙인다 — 웹에서만 preflight 로 죽는 종류다', async () => {
  const { 모듈, 요청들 } = 세운판({ ok: true, data: [] });
  await 모듈.큐받기('T');
  assert.ok(!('Content-Type' in 요청들[0].헤더));
});

test('NOT_STAFF 는 코드를 그대로 들고 올라온다 — 화면이 말로 바꿀 수 있어야 한다', async () => {
  const { 모듈 } = 세운판(
    { ok: false, error: { code: 'NOT_STAFF', message: '검수 권한이 없습니다', retryable: false } },
    403,
  );
  await assert.rejects(() => 모듈.큐받기('T'), (e) => e.code === 'NOT_STAFF');
});

test('GATE_NOT_MET 의 message 가 살아 온다 — 얼마나 더 들어야 하는지가 거기 있다', async () => {
  const { 모듈 } = 세운판(
    { ok: false, error: { code: 'GATE_NOT_MET', message: '아직 충분히 듣지 않았습니다(3000ms 필요 · 들은 900ms)', retryable: false } },
    409,
  );
  await assert.rejects(
    () => 모듈.승인하기('T', { submission_id: SID }),
    (e) => e.code === 'GATE_NOT_MET' && /900ms/.test(e.message),
  );
});
