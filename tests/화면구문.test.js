'use strict';
/**
 * 화면 구문 검사 — `src/*.js` 가 **실제로 파싱되는가**.
 *
 * 🔴 **왜 새로 만드나 — `node --check` 는 이 파일들을 검사하지 못한다.**
 *   2026-08-07 실측: 함수 안에 든 JSX 를 `node --check` 가 **그대로 통과시켰다**(exit 0).
 *   즉 화면 파일에 대해서는 「구문검사를 돌렸다」가 **아무것도 안 본 것**과 같은 모양이었고,
 *   `src/` 540줄짜리 화면이 여태 그 상태로 있었다. 통과와 미실행이 같은 모양이면 안 된다.
 *   그래서 JSX 를 아는 파서(@babel/parser · Expo 가 이미 들고 있다)로 직접 판다.
 *
 * ⚠ 이건 **구문**만 본다. 렌더가 맞는지는 화면을 띄워야 안다(다른 층이다).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const SRC = path.join(__dirname, '..', 'src');
const 옵션 = { sourceType: 'module', plugins: ['jsx'] };

const 화면들 = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));

test('src 화면이 하나 이상 있다 (0개면 아래 검사가 무엇이든 통과한다)', () => {
  assert.ok(화면들.length >= 4, `src/*.js 가 ${화면들.length}개다 — 목록 규칙이 낡았다`);
});

for (const 이름 of 화면들) {
  test(`구문: src/${이름}`, () => {
    const src = fs.readFileSync(path.join(SRC, 이름), 'utf8');
    assert.doesNotThrow(() => parser.parse(src, 옵션), `src/${이름} 가 파싱되지 않는다`);
  });
}

test('탐지력 픽스처 — 깨진 JSX 를 실제로 잡는다', () => {
  /* 실저장소를 픽스처로 쓰지 않는다. 여기서 못박는 것은 **파서가 실제로 판다**는 사실이다 —
   * 이 단언이 없으면 위 검사들은 파서가 무엇이든 삼켜도 초록이다. */
  assert.throws(() => parser.parse('export default () => (<View><Text>안녕</View>);', 옵션),
    '닫는 태그가 어긋났는데 통과했다 — 파서가 JSX 를 안 보고 있다');
  assert.throws(() => parser.parse('const a = {;', 옵션),
    '평범한 구문 오류도 못 잡는다');
  assert.doesNotThrow(() => parser.parse('export default () => (<View><Text>안녕</Text></View>);', 옵션),
    '멀쩡한 JSX 를 막으면 위 검사가 거짓 경보가 된다');
});
