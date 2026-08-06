/* 동봉이 **진짜 import 되는지**를 잰다.
 *
 * 왜 이 검사인가: 동봉의 목적은 「정본 한 벌」이다. 그런데 감싸기가 조금만 틀려도 배포는 성공하고
 * 함수는 **런타임에** 죽는다 — 그때는 라이브다. 껍데기가 맞는지는 여기서, 네트워크 없이 가른다.
 * 껍데기만 흉내내지 않고 **실제로 import 해서 계약 검증이 도는 것까지** 확인한다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { 동봉묶기 } = require('../tools/원격배포.js');

const 함수디렉터리 = path.join(__dirname, '..', 'supabase', 'functions', 'events');

/** 문자열을 .mjs 로 떨궈 실제 import 한다(Deno 가 할 일을 Node 로 미리 해 본다). */
async function 임시import(이름, 내용) {
  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-동봉-'));
  const p = path.join(방, 이름);
  fs.writeFileSync(p, 내용);
  try {
    return await import(require('url').pathToFileURL(p).href);
  } finally {
    fs.rmSync(방, { recursive: true, force: true });
  }
}

test('동봉 — CJS 검증기가 ESM 으로 감싸여 실제로 import 된다', async () => {
  const 묶음 = 동봉묶기(함수디렉터리);
  const m = await 임시import('이벤트검증.mjs', 묶음['이벤트검증.mjs']);
  assert.strictEqual(typeof m.default.검증, 'function', '검증 함수가 default 로 나와야 한다');
});

test('동봉 — 계약 JSON 이 ESM 으로 감싸여 값목록을 그대로 낸다', async () => {
  const 묶음 = 동봉묶기(함수디렉터리);
  const m = await 임시import('계약.mjs', 묶음['계약.mjs']);
  assert.ok(Array.isArray(m.default.learning_events.값목록.event_type), 'event_type 값목록이 있어야 한다');
});

test('동봉 — 감싼 둘을 붙이면 계약 검증이 실제로 돈다(통과·거절 양쪽)', async () => {
  const 묶음 = 동봉묶기(함수디렉터리);
  const { default: 검증모듈 } = await 임시import('이벤트검증.mjs', 묶음['이벤트검증.mjs']);
  const { default: 계약 } = await 임시import('계약.mjs', 묶음['계약.mjs']);

  const 온전 = {
    idempotency_key: 'b6f1c0a2-0000-4000-8000-000000000001',
    event_type: 'submission.created',
    occurred_at: '2026-08-05T13:20:11.412Z',
    level_snapshot: 'Lv3',
    task_type: '숙제제출',
    submission: { task_ref: 'hw-1', task_format: '자유발화', body_original: '어제 밥을 먹었어요' },
  };
  assert.deepStrictEqual(검증모듈.검증(온전, 계약), { ok: true, 오류들: [] });

  // 서버 칸을 앱이 보내면 막혀야 한다 — 이게 뚫리면 위조가 통과처럼 보인다.
  const 위조 = { ...온전, learner_id: '00000000-0000-4000-8000-000000000000' };
  assert.strictEqual(검증모듈.검증(위조, 계약).ok, false);
});

test('동봉 — 배포되는 것은 작업본이 아니라 HEAD 다', () => {
  const 묶음 = 동봉묶기(함수디렉터리);
  const head = require('child_process')
    .execFileSync('git', ['show', 'HEAD:계약/수집_교정_계약.json'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.strictEqual(
    묶음['계약.mjs'].replace(/^export default /, '').replace(/;\n$/, '').replace(/\r\n/g, '\n'),
    head.replace(/\r\n/g, '\n'),
    '동봉된 계약이 HEAD 와 한 글자도 달라선 안 된다(옆 세션 미커밋 편집이 라이브로 나가는 자리)',
  );
});
