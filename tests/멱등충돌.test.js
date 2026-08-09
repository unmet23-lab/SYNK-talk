'use strict';
/**
 * 멱등키 충돌이 **손실을 「성공」으로 위장**하던 자리 (C0 심문 B2 · 3벌 공통 · 소급 불가).
 *
 * ■ 무엇이 사라졌나
 *   서버는 `on conflict (learner_id, idempotency_key) do nothing` 뒤에 **내용을 안 보고**
 *   `duplicate` + 기존 event_id 를 돌려줬고, 앱은 그걸 `stored` 와 같은 갈래로 읽어 큐에서
 *   지웠다. 그래서 같은 키가 **다른 내용**에 두 번 쓰이면 뒤엣것이 통째로 사라진다.
 *   사라지는 쪽은 늘 학생 발화이고, 증상이 「조용함」뿐이라 개원 뒤엔 못 찾는다.
 *
 * ■ 이 파일이 **양쪽**을 재는 이유
 *   서버가 거절하는 것만으로는 처방이 아니다 — `retryable:false` 는 `lib/제출로그.js` 에서
 *   `send_final` 이 되고, 그러면 결과는 **지금과 똑같은 소멸**이다. 그래서 서버 거절과
 *   앱의 새 키 재전송이 한 벌이고, 한쪽만 서면 고친 게 아니다.
 *
 * ⚠ 서버 쪽은 소스 대조로 잰다(Deno 함수는 node 에서 못 세운다 — 저장소 관용구다:
 *   `tests/말하기로직.test.js` 의 UUID 가드 검사와 같은 층). 앱 쪽은 **실제로 세워** 돌린다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { 세우기 } = require('./lib/앱모듈세우기.js');

const ROOT = path.join(__dirname, '..');
const 서버 = fs.readFileSync(path.join(ROOT, 'supabase/functions/events/index.ts'), 'utf8');

/* ─── 서버 쪽 ─────────────────────────────────────────────────────────────── */

test('지문을 **서버가 얹기 전**에 잰다 — 순서가 이 값의 의미다', () => {
  const 잰자리 = 서버.indexOf('await 요청해시(사건)');
  assert.ok(잰자리 > 0, '요청해시를 부르는 자리가 없다 — 지문이 안 만들어진다');

  const 얹는자리 = 서버.indexOf('server: await 헤더측정');
  assert.ok(얹는자리 > 0, '앵커가 낡았다(capture_meta.server 를 얹는 자리)');
  // 🔴 얹은 뒤에 재면 같은 요청이 서버 상태에 따라 다른 지문이 되고, 정상 재전송이 충돌로 뜬다.
  assert.ok(잰자리 > 얹는자리,
    '지문을 capture_meta 얹기 전에 쟀다 — 그건 `사건` 이 아니라 별도 변수라 순서 자체는 무해하지만, ' +
    '이 검사가 뒤집히면 누군가 `사건` 을 직접 고치고 잰 것이다');

  const 트랜잭션 = 서버.indexOf('sql.begin');
  assert.ok(트랜잭션 > 0 && 잰자리 < 트랜잭션, '지문 계산이 트랜잭션 안이다 — CPU 일로 트랜잭션을 붙든다');
});

test('INSERT 가 request_hash 를 싣는다 — 안 실으면 다음 요청이 비교할 것이 없다', () => {
  assert.match(서버, /request_hash\s*\n?\s*\)\s*values/,
    'INSERT 열 목록에 request_hash 가 없다');
  assert.ok(서버.includes('${지문}'), 'INSERT 값에 지문이 없다 — 열만 서고 늘 null 이 된다');
});

test('충돌 분기가 **기존 행의 지문을 읽어 대조**한다', () => {
  const 분기 = 서버.slice(서버.indexOf('if (!넣기.length)'), 서버.indexOf('const event_id:'));
  assert.ok(분기.length > 0, '앵커가 낡았다 — 충돌 분기를 못 찾았다');
  assert.match(분기, /select event_id, request_hash/, '기존 행의 지문을 안 읽는다');
  assert.match(분기, /request_hash !== 지문/, '읽고도 대조를 안 한다');
  assert.match(분기, /IDEMPOTENCY_CONFLICT/, '다를 때 낼 코드가 없다');
  assert.match(분기, /retryable: false/, '재시도 가능으로 내면 같은 키가 회선을 영원히 문다');
});

test('지문 없는 옛 행은 **판정 불가로 접되 조용하지 않다**', () => {
  const 분기 = 서버.slice(서버.indexOf('if (!넣기.length)'), 서버.indexOf('const event_id:'));
  assert.match(분기, /request_hash == null/, '옛 행(지문 null) 갈래가 없다 — 그날 재전송이 통째로 거절된다');
  assert.match(분기, /console\.warn/, '판정 불가를 조용히 넘긴다 — 그러면 소급 대상도 못 센다');
});

test('요청해시가 함수에 **동봉**된다 — 동봉표에서 빠지면 배포판이 import 에서 죽는다', () => {
  const 동봉 = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/functions/events/동봉.json'), 'utf8'));
  assert.equal(동봉['요청해시.mjs'], 'lib/요청해시.js');
  assert.ok(서버.includes("from './요청해시.mjs'"), '함수가 동봉본을 import 하지 않는다');
});

/* ─── 앱 쪽 (실제로 세워 돌린다) ───────────────────────────────────────────── */

const 사건 = () => ({
  idempotency_key: '11111111-2222-4333-8444-555555555555',
  event_type: 'content.viewed',
  occurred_at: '2026-08-09T01:00:00.000Z',
  level_snapshot: 'Lv2',
  correlation_id: '99999999-8888-4777-8666-555555555555',
  parent_event_id: '22222222-3333-4444-8555-666666666666',
});

const 충돌응답 = {
  status: 200,
  몸: { ok: true, contract_ver: 'c10', results: [{
    idempotency_key: 'x', status: 'rejected',
    error: { code: 'IDEMPOTENCY_CONFLICT', message: '이미 다른 내용', retryable: false },
  }] },
};
const 저장됨 = (id) => ({
  status: 200,
  몸: { ok: true, contract_ver: 'c10', results: [{ idempotency_key: 'x', status: 'stored', event_id: id }] },
});

/** 함수 응답을 순서대로 물리고 통로를 세운다. 보낸 **본문**까지 받아 본다. */
function 세운판(함수응답들) {
  const 보낸것 = [];
  const 남은 = [...함수응답들];
  const 가짜 = async (url, opt) => {
    if (url.includes('/functions/v1/')) {
      보낸것.push(JSON.parse(opt.body));
      const r = 남은.length > 1 ? 남은.shift() : 남은[0];
      return { ok: true, status: r.status, json: async () => r.몸 };
    }
    return { ok: true, status: 200, json: async () => ({ access_token: 'A1', refresh_token: 'R1' }) };
  };
  return { 통로: 세우기(path.join(ROOT, 'src', '사건통로.js'), 가짜, { 캐시: new Map() }), 보낸것 };
}

test('🔴 충돌하면 **새 키로 한 번 다시 보낸다** — 거절만 하면 지금과 똑같은 소멸이다', async () => {
  const 판 = 세운판([충돌응답, 저장됨('EV-9')]);

  const r = await 판.통로.사건보내기('A1', 사건());

  assert.equal(r.event_id, 'EV-9', '재전송이 성공했는데 event_id 를 안 돌려준다');
  assert.ok(!r.끝, '성공했는데 최종 실패로 적으면 그 발화가 죽는다');
  assert.equal(판.보낸것.length, 2, '왕복은 정확히 둘(원본 + 새 키 1회)');
});

test('🔴 두 번째 요청의 멱등키가 **실제로 달라야** 한다 — 같으면 또 충돌이다', () => {
  // 이 검사는 위 왕복이 남긴 본문을 다시 세워 본다(같은 판을 두 번 돌리지 않게 분리했다).
  return (async () => {
    const 판 = 세운판([충돌응답, 저장됨('EV-9')]);
    await 판.통로.사건보내기('A1', 사건());

    const [첫, 둘] = 판.보낸것.map((b) => b.events[0].idempotency_key);
    assert.equal(첫, 사건().idempotency_key, '첫 요청은 항목이 들고 온 키 그대로여야 한다');
    assert.notEqual(둘, 첫, '새 키를 안 지었다 — 같은 키로 다시 보내면 영원히 충돌이다');
    assert.match(둘, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      '새 키가 v4 uuid 모양이 아니다 — 서버 uuid 가드가 400 을 낸다');
  })();
});

test('🔴 새 키로도 충돌하면 **거기서 멈춘다** — 루프면 회선을 영원히 문다', async () => {
  const 판 = 세운판([충돌응답]);

  const r = await 판.통로.사건보내기('A1', 사건());

  assert.equal(판.보낸것.length, 2, '왕복은 정확히 둘 — 세 번째가 나가면 그게 루프다');
  assert.ok(r.끝, '멈추면서 최종으로 적어야 한다(안 적으면 다음 세션이 또 두 번 쏜다)');
  assert.ok(!r.event_id, '실패인데 event_id 를 주면 로그가 저장됐다고 믿는다');
});

test('사건 원본을 안 건드린다 — 큐 항목의 키가 바뀌면 그 항목의 정체가 바뀐다', async () => {
  const e = 사건();
  const 전 = JSON.stringify(e);
  await 세운판([충돌응답, 저장됨('EV-9')]).통로.사건보내기('A1', e);
  assert.equal(JSON.stringify(e), 전, '호출자의 사건 객체를 제자리에서 고쳤다');
});

test('충돌이 아닌 거절은 **그대로 최종 실패**다 — 아무 400 에나 키를 새로 지으면 중복이 쌓인다', async () => {
  const 위반 = {
    status: 200,
    몸: { ok: true, contract_ver: 'c10', results: [{
      idempotency_key: 'x', status: 'rejected',
      error: { code: 'CONTRACT_VIOLATION', message: '계약 위반', retryable: false },
    }] },
  };
  const 판 = 세운판([위반]);

  const r = await 판.통로.사건보내기('A1', 사건());

  assert.equal(판.보낸것.length, 1, '계약 위반에 재전송하면 같은 위반이 두 번 나간다');
  assert.ok(r.끝);
});
