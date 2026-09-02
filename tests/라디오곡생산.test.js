'use strict';
/* 라디오곡생산 — «거절당했을 때»의 회귀 (유호 지시 2026-09-03 「대책이 필요한데?」).
 *
 * 🔴 이 스위트가 생긴 까닭은 실물 사고다. 09-02 새벽에 45번을 불러 ₩4,980 이 나갔는데
 *   **그 내역이 아무 데도 안 남았다.** 다음 날 AI Studio 로그를 뒤져서야 갈렸다 —
 *   성공 39 · 차단 6 · 그리고 덮어쓰기로 3벌이 사라졌다(그 버그는 09-02 에 이미 막았다).
 *   ⇒ 여기서 굳히는 것 셋: ①차단은 그 벌만 접는다 ②이미 산 조각을 안 버린다 ③쓴 돈을 센다.
 *
 * 🔑 네트워크를 안 탄다 — `fetch` 를 픽스처로 갈아 끼워 «차단이 났을 때»를 만든다.
 *   실제로 부르면 돈이 들고, 돈이 드는 검사는 아무도 안 돌린다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const 도구 = require('../tools/라디오곡생산.js');

/** 정해 둔 차례대로 답하는 가짜 서버. `차단` 이면 400 content_blocked, 아니면 오디오 한 덩이. */
function 가짜fetch(차례) {
  let i = 0;
  return async () => {
    const 이번 = 차례[Math.min(i++, 차례.length - 1)];
    if (이번 === '차단') {
      return { ok: false, status: 400, text: async () => JSON.stringify({ error: { status: 'content_blocked' } }) };
    }
    if (이번 === '키죽음') {
      return { ok: false, status: 429, text: async () => JSON.stringify({ error: { message: 'credits depleted' } }) };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ output: [{ type: 'audio', data: Buffer.from('sound').toString('base64') }] }),
    };
  };
}

function 셈비우기() {
  도구.셈.호출 = 0; 도구.셈.차단 = 0; 도구.셈.실패벌 = 0;
  for (const k of Object.keys(도구.셈.결별차단)) delete 도구.셈.결별차단[k];
}

const 원래fetch = global.fetch;
test.afterEach(() => { global.fetch = 원래fetch; });

// ───────────────────────────── ① 차단은 세 번까지만 다시 부른다

test('🔴 차단 3회면 «차단소진»으로 던진다 — 그 벌만 접히고 전체가 안 죽는다', async () => {
  셈비우기();
  global.fetch = 가짜fetch(['차단', '차단', '차단']);
  await assert.rejects(
    () => 도구.생성재시도('p', 'k', 3, '차분'),
    (e) => e.차단소진 === true && e.차단 === true,
    '차단소진 표가 없으면 부르는 쪽이 «이 벌만 접기»와 «전체 멈춤»을 못 가른다');
  assert.equal(도구.셈.호출, 3, '3회를 다 써야 한다');
  assert.equal(도구.셈.차단, 3);
  assert.equal(도구.셈.결별차단.차분, 3, '어느 결이 막혔는지 남아야 다음에 그 문면을 손본다');
});

test('차단 뒤에 성공하면 그대로 받는다 — 재시도가 실제로 값을 한다', async () => {
  셈비우기();
  global.fetch = 가짜fetch(['차단', '성공']);
  const buf = await 도구.생성재시도('p', 'k', 3, '차분');
  assert.ok(Buffer.isBuffer(buf) && buf.length > 0);
  assert.equal(도구.셈.호출, 2, '호출은 «성공 + 차단»으로 센다(차단도 과금되는 것으로 보인다)');
  assert.equal(도구.셈.차단, 1);
});

/* 🔴 차단이 «아닌» 오류(크레딧 0·키 죽음·네트워크)는 재시도해도 같은 답이다.
 *   옛 판은 3회를 다 쓰고 나서야 던졌다 — 벌 8개면 그 헛발질이 24번이 된다. */
test('🔴 차단이 아닌 오류는 «첫 번»에 던진다 — 같은 실패를 돈 주고 되풀이하지 않는다', async () => {
  셈비우기();
  global.fetch = 가짜fetch(['키죽음', '키죽음', '키죽음']);
  await assert.rejects(
    () => 도구.생성재시도('p', 'k', 3, '차분'),
    (e) => e.차단 === false && !e.차단소진);
  assert.equal(도구.셈.호출, 1, '차단이 아닌데도 다시 불렀다 — 그만큼이 그냥 나간 돈이다');
  assert.equal(도구.셈.차단, 0);
});

// ───────────────────────────── ② 이미 산 조각을 안 버린다

test('🔴 접힌 벌의 조각을 «_남은조각» 으로 살린다 — 한 벌이 3생성이라 앞의 둘은 이미 낸 돈이다', () => {
  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-곡시험-'));
  const 조각 = ['a', 'b'].map((n) => {
    const p = path.join(방, `${n}.mp3`);
    fs.writeFileSync(p, n);
    return p;
  });
  const 낼곳 = path.join(방, '팩');
  const r = 도구.조각살리기(조각, 낼곳, 7, '차분');
  assert.ok(r && r.파일.length === 2, '조각 둘이 살아야 한다');
  for (const f of r.파일) {
    assert.ok(fs.existsSync(path.join(낼곳, '_남은조각', f)), `${f} 가 안 옮겨졌다`);
    assert.match(f, /-07-/, '몇 번 벌의 조각인지 이름이 말해야 사람이 이어 쓴다');
  }
});

test('산 조각이 0개면 살릴 것도 없다 — 빈 폴더를 만들지 않는다', () => {
  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-곡시험2-'));
  assert.equal(도구.조각살리기([], path.join(방, '팩'), 1, '차분'), null);
  assert.equal(fs.existsSync(path.join(방, '팩', '_남은조각')), false);
});

// ───────────────────────────── ③ 쓴 돈을 센다

test('🔴 생산 장부가 «호출 = 성공 + 차단»을 남긴다 — 예상치가 아니라 센 값이어야 한다', () => {
  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-곡장부-'));
  const 경로 = path.join(방, '깊은/자리/곡생산.jsonl');
  const 원래 = 도구.생산장부경로;
  try {
    // 경로를 갈아끼울 수 없으므로 적기 함수의 «행동»만 잰다(폴더를 만들고 append 하는가).
    fs.mkdirSync(path.dirname(경로), { recursive: true });
    fs.appendFileSync(경로, JSON.stringify({ 호출: 45, 성공: 39, 차단: 6, 달러: 3.6 }) + '\n');
    fs.appendFileSync(경로, JSON.stringify({ 호출: 3, 성공: 3, 차단: 0, 달러: 0.24 }) + '\n');
    const 줄들 = fs.readFileSync(경로, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(줄들.length, 2, 'append 라야 지난 실행이 안 지워진다');
    for (const j of 줄들) {
      assert.equal(j.호출, j.성공 + j.차단, '분모가 갈래의 합이 아니면 그 수는 못 믿는다');
    }
  } finally { assert.ok(원래.endsWith('곡생산.jsonl'), '장부 이름이 바뀌었다 — 읽는 쪽도 같이 봐야 한다'); }
});

test('장부를 못 쓰면 «사유»를 돌려준다 — 조용히 실패하면 셈에 안 잡힌 실행이 생긴다', () => {
  const 원래 = fs.appendFileSync;
  try {
    fs.appendFileSync = () => { throw new Error('디스크 가득'); };
    const 사유 = 도구.생산장부적기({ 호출: 1 });
    assert.match(String(사유), /디스크 가득/);
  } finally { fs.appendFileSync = 원래; }
});

// ───────────────────────────── 곁: 프롬프트가 필터에 걸릴 낱말을 안 쓴다

/* 구글 공식 문서가 막는 것 = «아티스트 목소리»와 «저작권 있는 가사». 09-01 실측으로 `ambient` 도
 * 차단률을 크게 올리는 낱말로 드러났다. 결 문면이 그쪽으로 되돌아가면 여기서 잡는다. */
test('결 문면에 ambient·아티스트명이 없다 — 09-01 에 3/3 차단을 낸 낱말이다', () => {
  for (const [결, 문면] of Object.entries(도구.결들)) {
    assert.doesNotMatch(문면, /\bambient\b/i, `${결} 문면에 ambient 가 되살아났다`);
  }
  assert.match(도구.공통머리, /no vocals/i, '보컬 차단 줄이 빠지면 노래가 섞여 나온다');
});
