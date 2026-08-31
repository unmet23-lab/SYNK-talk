'use strict';
/**
 * 감사 회귀 R1B22 (감사 G1-10) — **«값이 0»과 «칸이 없다»를 가르나**.
 *
 * 왜 있나: `Number(x) || 0` 접기는 서버가 칸을 빼먹은 형태 위반을 「대기 0」이라는 멀쩡한
 *   숫자로 바꿔 화면에 올린다 — 조용한 0 대신 시끄러운 CONTRACT_VIOLATION 이어야
 *   직원 화면 오류칸에 그대로 뜬다. 봉투 규약은 통로(`src/사건통로.js`) 몫이고
 *   **칸 규약은 각 문 몫**이라, 그 throw 가 해석 자리에 사는지를 여기서 잰다.
 *
 * ⚠ 네트워크는 안 탄다 — `검수API.test.js` 의 세운판 무늬 그대로 `fetch` 를 가짜로 심는다.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { 세우기: 앱모듈 } = require('./lib/앱모듈세우기.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', '검수API.js');

/** 응답 하나를 주는 가짜 fetch (`검수API.test.js` 세운판의 축소판 — 요청 기록은 여기 불필요) */
function 세운판(몸, status = 200) {
  const 가짜 = async () => ({ ok: status < 400, status, json: async () => 몸 });
  return 앱모듈(SRC, 가짜);
}

test('G1-10 반목록받기 — classes 칸이 아예 없으면 CONTRACT_VIOLATION 으로 죽는다(조용한 [] 접기 금지)', async () => {
  const 모듈 = 세운판({ ok: true });
  await assert.rejects(
    () => 모듈.반목록받기('T'),
    (e) => e.code === 'CONTRACT_VIOLATION' && /classes/.test(e.message),
    '칸 없는 응답이 빈 배열로 접혔다 — 형태 위반이 「검수할 것 없음」 얼굴로 화면에 오른다',
  );
});
