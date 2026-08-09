'use strict';
/**
 * 사건 통로의 **만료 갱신** — C0 §7 왕복 6-⑥ 「갱신 후 1회 재시도로 성공 · 무한 루프 없음」.
 *
 * ■ 왜 여기서 재나
 *   §7 은 1·2·3·4 를 `tools/왕복시험.js` 가 재고 **5·6 은 안 잰다**고 못 박았다 — 6 은 서버가
 *   아니라 **앱 쪽 동작**이라서다. 실제 만료를 재려면 한 시간을 기다려야 하므로, 그 자리를
 *   재는 유일한 방법이 이 회귀다(재지 않으면 「동결 판정 6칸」 중 한 칸이 영원히 미측정이다).
 *
 * ■ 🔴 방아쇠는 HTTP 401 이지 `AUTH_EXPIRED` 가 아니다
 *   `verify_jwt=true` 라 만료 토큰은 게이트웨이가 **우리 함수 앞에서** 자른다. 그 응답은 우리
 *   봉투가 아니라 `error.code` 가 비어 오고, `AUTH_EXPIRED` 를 내는 서버 코드는 저장소에 0줄이다
 *   (§5 표에는 그 코드가 적혀 있다 — 표를 믿고 코드로 가르면 이 통로는 **한 번도 안 돈다**).
 *
 * ■ 🔴 만료를 「최종 실패」로 적으면 발화가 사라진다
 *   빈 코드 칸은 `SERVER_ERROR`·`retryable:false` 로 접히고, `lib/제출로그.js` 는 그걸
 *   `send_final` 로 적어 **`밀린것` 에서 영영 뺀다.** 다시 로그인하면 나갈 수 있었던 발화다.
 *   그래서 이 파일은 「되나」보다 **「안 되면 무엇이 사라지나」**를 잰다(§7 ⚠ 와 같은 축).
 *
 * 🔑 통로를 가짜로 바꿔치지 않는다 — `src/사건통로.js` 와 `src/인증API.js` 를 **같은 캐시로
 *   함께 세워** 모듈 상태(기억·단일 비행)를 실제 그대로 돌린다. 둘 다 react-native 를 안 끌고
 *   오는 것이 통로를 파일로 가른 이유다(`src/사건통로.js` 머리말).
 * ⚠ 네트워크는 안 탄다 — `fetch` 를 가짜로 심고 **어디로 몇 번 갔는지**를 그대로 받아 본다.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { 세우기 } = require('./lib/앱모듈세우기.js');

const ROOT = path.join(__dirname, '..');

const 갱신길 = 'grant_type=refresh_token';
const 로그인길 = 'grant_type=password';

/**
 * 판 하나 — 응답을 **URL 갈래별로** 정한다.
 * @param {object} 응답  `{ 함수: [응답…] | 응답, 갱신: 응답, 로그인: 응답 }`
 *   함수 응답이 배열이면 부를 때마다 앞에서 하나씩 꺼낸다(마지막 것은 계속 쓴다).
 */
function 세운판(응답) {
  const 요청들 = [];
  const 함수응답 = Array.isArray(응답.함수) ? [...응답.함수] : [응답.함수];
  const 가짜 = async (url, opt) => {
    const 헤더 = (opt && opt.headers) || {};
    요청들.push({ url, 토큰: String(헤더.Authorization || '').replace(/^Bearer\s+/, ''), opt });
    const 만들기 = (r) => ({ ok: (r.status || 200) < 400, status: r.status || 200, json: async () => r.몸 || {} });
    if (url.includes(갱신길)) return 만들기(응답.갱신 || { 몸: {} });
    if (url.includes(로그인길)) return 만들기(응답.로그인 || { 몸: { access_token: 'A1', refresh_token: 'R1' } });
    return 만들기(함수응답.length > 1 ? 함수응답.shift() : 함수응답[0]);
  };
  const 캐시 = new Map();
  const 통로 = 세우기(path.join(ROOT, 'src', '사건통로.js'), 가짜, { 캐시 });
  const 인증 = 캐시.get(path.join(ROOT, 'src', '인증API.js'));
  return { 통로, 인증, 요청들, 함수왕복: () => 요청들.filter((r) => r.url.includes('/functions/v1/')),
    갱신왕복: () => 요청들.filter((r) => r.url.includes(갱신길)) };
}

/** 로그인 한 번으로 기억을 세운다 — 앱에서 세션이 서는 것과 같은 통로다. */
async function 로그인해둔판(응답) {
  const 판 = 세운판(응답);
  await 판.인증.로그인('SYNK-001', 'pw');
  판.요청들.length = 0;
  return 판;
}

const 만료 = { status: 401, 몸: { code: 401, message: 'Invalid JWT' } }; // 게이트웨이 — 우리 봉투가 아니다
const 성공 = { status: 200, 몸: { ok: true, contract_ver: 'c10', data: [] } };
const 갱신됨 = { status: 200, 몸: { access_token: 'A2', refresh_token: 'R2' } };

/* ─── §7-6 본문 ───────────────────────────────────────────────────────────── */

test('🔴 만료(401) → 갱신 → **1회 재시도로 성공** (§7 왕복 6-⑥)', async () => {
  const 판 = await 로그인해둔판({ 함수: [만료, 성공], 갱신: 갱신됨 });

  const 본문 = await 판.통로.부르기('progress', 'A1');

  assert.equal(본문.ok, true);
  assert.equal(판.갱신왕복().length, 1, '갱신이 한 번 나야 한다');
  assert.deepEqual(판.함수왕복().map((r) => r.토큰), ['A1', 'A2'],
    '재시도는 **새 토큰**으로 가야 한다 — 낡은 것으로 다시 가면 영원히 401 이다');
});

test('🔴 재시도도 401 이면 거기서 멈춘다 — 무한 루프 없음 (§7-6 뒷조건)', async () => {
  const 판 = await 로그인해둔판({ 함수: 만료, 갱신: 갱신됨 });

  const e = await 판.통로.부르기('progress', 'A1').then(() => null, (x) => x);

  assert.ok(e, '두 번째 401 은 던져야 한다');
  assert.equal(판.함수왕복().length, 2, '함수 왕복은 **정확히 둘**(원본 + 재시도 1회)');
  assert.equal(판.갱신왕복().length, 1, '갱신도 한 번뿐 — 401 마다 갱신하면 그게 루프다');
});

test('🔴 만료를 최종 실패로 적지 않는다 — `send_final` 이 되면 그 발화는 영영 안 나간다', async () => {
  const 판 = await 로그인해둔판({ 함수: 만료, 갱신: { status: 400, 몸: {} } }); // 갱신도 거절

  const e = await 판.통로.부르기('progress', 'A1').then(() => null, (x) => x);

  assert.equal(e.code, 'AUTH_EXPIRED');
  assert.equal(e.retryable, true,
    'retryable:false 면 lib/제출로그.js 가 send_final 로 적고 밀린것에서 영영 뺀다 — 다시 로그인하면 나갈 발화다');
});

test('🔴 우리 함수가 낸 401(AUTH_REQUIRED)은 그대로 둔다 — 그건 재시도가 무의미한 게 맞다', async () => {
  const 몸 = { ok: false, error: { code: 'AUTH_REQUIRED', message: '학생 계정이 아닙니다', retryable: false } };
  const 판 = await 로그인해둔판({ 함수: { status: 401, 몸 }, 갱신: 갱신됨 });

  const e = await 판.통로.부르기('progress', 'A1').then(() => null, (x) => x);

  assert.equal(e.code, 'AUTH_REQUIRED');
  assert.equal(e.retryable, false, '봉투가 온 401 까지 AUTH_EXPIRED 로 덮으면 폐기된 계정이 영원히 재시도된다');
});

test('되살릴 재료가 없으면 갱신 왕복 0 — 로그인도 안 한 채 만료를 만나는 자리', async () => {
  const 판 = 세운판({ 함수: 만료, 갱신: 갱신됨 }); // 로그인 안 함 = 기억 없음

  const e = await 판.통로.부르기('progress', 'A1').then(() => null, (x) => x);

  assert.equal(e.code, 'AUTH_EXPIRED');
  assert.equal(판.갱신왕복().length, 0, '재료도 없이 갱신을 부르면 그건 그냥 한 번 더 실패하는 왕복이다');
  assert.equal(판.함수왕복().length, 1);
});

/* ─── 갱신 자체의 규약 ────────────────────────────────────────────────────── */

test('🔴 동시에 셋이 만료를 맞아도 갱신은 **한 번**이다 (refresh_token 은 회전한다)', async () => {
  const 판 = await 로그인해둔판({ 함수: [만료, 만료, 만료, 성공], 갱신: 갱신됨 });

  const 결과 = await Promise.all([
    판.통로.부르기('progress', 'A1'),
    판.통로.부르기('corrections', 'A1'),
    판.통로.부르기('tasks', 'A1'),
  ]);

  assert.equal(판.갱신왕복().length, 1,
    '셋이 각자 갱신하면 뒤 둘은 **이미 쓴 refresh_token** 으로 부른다 — 증상은 「가끔 로그인이 풀린다」다');
  for (const r of 결과) assert.equal(r.ok, true);
});

test('🔴 회전한 refresh_token 이 기기에 남는다 — 안 남기면 다음 실행이 이미 쓴 토큰으로 시작한다', async () => {
  const 판 = await 로그인해둔판({ 함수: [만료, 성공], 갱신: 갱신됨 });
  const 남긴것 = [];
  판.인증.세션남기기세움((s) => { 남긴것.push(s); });

  await 판.통로.부르기('progress', 'A1');

  assert.equal(남긴것.length, 1);
  assert.equal(남긴것[0].refresh_token, 'R2', '회전한 **새** refresh_token 이어야 한다');
  assert.equal(남긴것[0].학생번호, 'SYNK-001', '토큰엔 학생번호가 없다 — 기억이 실어 줘야 한다');
});

test('이미 새 토큰을 쥐고 있으면 왕복 없이 그것을 쓴다 — 화면이 든 props 는 낡은 채로 남는다', async () => {
  const 판 = await 로그인해둔판({ 함수: [만료, 성공, 만료, 성공], 갱신: 갱신됨 });
  await 판.통로.부르기('progress', 'A1');   // 여기서 A2 로 갱신된다
  const 갱신횟수 = 판.갱신왕복().length;

  await 판.통로.부르기('corrections', 'A1'); // 화면은 여전히 낡은 A1 을 넘긴다

  assert.equal(판.갱신왕복().length, 갱신횟수, '기억이 이미 더 새것이면 갱신 왕복을 한 번 더 살 이유가 없다');
  assert.equal(판.함수왕복().slice(-1)[0].토큰, 'A2');
});

test('🔴 로그아웃하면 기억이 비워져 다음 학생의 401 이 앞 학생으로 되살아나지 않는다', async () => {
  const 판 = await 로그인해둔판({ 함수: 만료, 갱신: 갱신됨 });

  판.인증.세션잊기();
  const e = await 판.통로.부르기('progress', 'A1').then(() => null, (x) => x);

  assert.equal(e.code, 'AUTH_EXPIRED');
  assert.equal(판.갱신왕복().length, 0,
    '기억이 남아 있으면 다음 학생의 발화가 앞 학생 learner_id 로 저장된다 — append-only 라 소급 복구가 없다');
});

/* ─── 통로가 통로인지 (한 문으로 모였나) ─────────────────────────────────── */

test('교정 조회도 같은 문을 지난다 — 만료 갱신이 답장에서만 빠지지 않는다', async () => {
  const 캐시 = new Map();
  let 갱신수 = 0;
  const 응답 = [만료, { status: 200, 몸: { ok: true, data: [{ id: 'x' }], next_cursor: null } }];
  const 가짜 = async (url) => {
    if (url.includes(갱신길)) { 갱신수 += 1; return { ok: true, status: 200, json: async () => 갱신됨.몸 }; }
    if (url.includes(로그인길)) return { ok: true, status: 200, json: async () => ({ access_token: 'A1', refresh_token: 'R1' }) };
    const r = 응답.length > 1 ? 응답.shift() : 응답[0];
    return { ok: r.status < 400, status: r.status, json: async () => r.몸 };
  };
  const 교정 = 세우기(path.join(ROOT, 'src', '교정API.js'), 가짜, { 캐시 });
  const 인증 = 캐시.get(path.join(ROOT, 'src', '인증API.js'));
  await 인증.로그인('SYNK-001', 'pw');

  const { 목록 } = await 교정.교정목록받기('A1');

  assert.equal(갱신수, 1, '교정 조회가 자기 사본으로 부르면 여기서 갱신이 0 이다');
  assert.equal(목록.length, 1);
});

/* ─── 탐지력 픽스처 — 이 회귀가 실제로 잡는지 ───────────────────────────── */

const 통로경로 = path.join(ROOT, 'src', '사건통로.js');

/**
 * 두 방어를 **실제 소스에서 도려낸** 판 — 고치기 전이 정확히 이 모양이었다.
 * ① 갱신·재시도 분기 ② 코드 없는 401 을 `AUTH_EXPIRED`(재시도 가능)로 메우는 칸.
 * 🔑 둘을 한 픽스처로 뗀다 — 실제로 함께 없던 상태라, 나눠 떼면 없던 중간 판을 지키게 된다.
 */
function 옛판소스() {
  const 원문 = fs.readFileSync(통로경로, 'utf8');
  const 갱신뗌 = 원문.replace(/\n  if \(r\.status === 401\) \{[\s\S]*?\n  \}\n/, '\n');
  assert.notEqual(갱신뗌, 원문, '갱신 분기를 못 찾았다 — 모양이 바뀌었으면 이 픽스처도 따라가야 한다');
  const 봉투뗌 = 갱신뗌.replace(/\n    if \(r\.status === 401 && !e\.code\) \{[\s\S]*?\n    \}\n/, '\n');
  assert.notEqual(봉투뗌, 갱신뗌, '빈 코드 401 을 메우는 칸을 못 찾았다 — 픽스처가 따라가야 한다');
  return 봉투뗌;
}

test('탐지력 — 두 방어를 도려내면 위 검사들이 실제로 빨개진다', async () => {
  const 요청들 = [];
  const 응답 = [만료, 성공];
  const 가짜 = async (url, opt) => {
    요청들.push({ url, 토큰: String(((opt && opt.headers) || {}).Authorization || '') });
    if (url.includes(갱신길)) return { ok: true, status: 200, json: async () => 갱신됨.몸 };
    if (url.includes(로그인길)) return { ok: true, status: 200, json: async () => ({ access_token: 'A1', refresh_token: 'R1' }) };
    const r = 응답.length > 1 ? 응답.shift() : 응답[0];
    return { ok: r.status < 400, status: r.status, json: async () => r.몸 };
  };
  const 캐시 = new Map();
  const 바꾼소스 = new Map([[통로경로, 옛판소스()]]);
  const 통로 = 세우기(통로경로, 가짜, { 캐시, 바꾼소스 });
  await 캐시.get(path.join(ROOT, 'src', '인증API.js')).로그인('SYNK-001', 'pw');
  요청들.length = 0;

  const e = await 통로.부르기('progress', 'A1').then(() => null, (x) => x);

  // 갱신도, 재시도도 안 난다 — 그리고 **최종 실패**로 접힌다(발화가 사라지던 그 경로).
  assert.equal(요청들.filter((r) => r.url.includes(갱신길)).length, 0);
  assert.equal(요청들.filter((r) => r.url.includes('/functions/v1/')).length, 1);
  assert.equal(e.code, 'SERVER_ERROR');
  assert.equal(e.retryable, false, '옛 판이 이 모양이 아니었다면 이 회귀는 없던 병을 지키는 것이다');
});
