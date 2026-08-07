/* 배포대조 회귀 — 「배포된 것과 소스가 같은가」를 재는 자가 **자기 눈이 성한지** 못박는다.
 *
 * 이 도구는 첫 판에서 두 번 거짓말을 했고(2026-08-07 실측), 둘 다 증상이 반대 방향이었다:
 *   ① 인코딩 — eszip 본문을 `latin1` 로 읽어 한글이 바이트로 흩어졌다. 로컬 문자열과 영영 안 맞아
 *      멀쩡한 함수 셋이 **거짓 적색**으로 나왔다(도구가 자기 버그를 격차로 보고했다).
 *   ② 표본 — 지문을 「파일 끝 160자」로 잡았다. 수리 커밋은 파일 **중간**을 고치므로 끝은 그대로다.
 *      옛 판이 배포돼 있는데 ✅ 로 나오는 **거짓 초록**이고, 이쪽이 훨씬 나쁘다.
 *
 * 세 맹점(CLAUDE.md):
 *   ① 사람이 실제로 쓰는 표기 — 픽스처 소스에 한글 주석·식별자를 넣는다(이 저장소가 실제로 그렇다).
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 전부 픽스처가 지고, 원격은 안 친다
 *      (자격증명·네트워크에 기대면 CI 에서 깨진다).
 *   ③ 자기 처방 — 「전체를 비교하라」는 처방을 그대로 따른 판이 통과하는지 함께 본다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { 정규, 펴기, 평평하게 } = require('../tools/배포대조.js');

/* 배포본을 흉내낸다 — eszip 은 바이너리 껍데기 안에 소스를 **UTF-8 평문**으로 담는다.
 * 앞뒤 쓰레기 바이트는 실제 포맷이 그렇기 때문에 넣는다(0x00 이 소스 조각을 감싼다). */
const 배포본흉내 = (...소스들) =>
  펴기(Buffer.concat([
    Buffer.from('ESZIP2.3'), Buffer.from([0, 0, 0, 4]),
    ...소스들.map((s) => Buffer.concat([Buffer.from([0, 0]), Buffer.from(s, 'utf8'), Buffer.from([0])])),
  ]));

/* 픽스처 소스는 **일부러 길다.** 변경 지점(위쪽 상수) 뒤에 160자 넘는 꼬리가 있어야
 * 「끝 160자만 보면 못 잡는다」를 잴 수 있다 — 짧은 픽스처는 끝 표본이 변경 지점까지 닿아
 * 옛 방식으로도 적색이 나고, 그러면 이 회귀가 아무것도 안 막는다(첫 판이 그래서 죽었다). */
const 원본 = [
  '/* 오늘 낼 것을 고른다 — 한글 주석이 실제로 이 저장소의 기본이다. */',
  "const 시간대 = 'Asia/Ulaanbaatar';",
  'function 몽골날짜(때) {',
  '  const d = 때 == null ? new Date() : new Date(때);',
  "  if (Number.isNaN(d.getTime())) throw new TypeError('몽골날짜: 날짜가 아니다');",
  '  return d.toISOString().slice(0, 10);',
  '}',
  'function 오늘과제(재료) {',
  '  const { 날짜, 첫날 = false } = 재료 || {};',
  '  return { task_ref: `task-${날짜}`, degraded: !첫날 };',
  '}',
  'module.exports = { 오늘과제, 시간대 };',
].join('\n');

test('① 한글이 든 소스가 UTF-8 배포본에서 찾아진다 (latin1 회귀 — 멀쩡한 판을 격차로 보고하던 자리)', () => {
  assert.ok(배포본흉내(원본).includes(정규(원본)),
    '같은 판인데 못 찾았다 — 본문을 UTF-8 로 안 읽으면 한글이 바이트로 흩어진다');

  /* 변이: 도구가 latin1 로 되돌아가면 이 단언이 죽는다. 같은 버퍼를 latin1 로 읽어
   * **못 찾는다**는 것을 여기서 못박아 둔다(그게 그날의 거짓 적색이었다). */
  const latin1판 = 평평하게(Buffer.from(원본, 'utf8').toString('latin1'));
  assert.equal(latin1판.includes(정규(원본)), false,
    '이 픽스처가 latin1 로도 통과하면 ①을 재는 힘이 없다 — 한글이 없는 픽스처를 쓴 것이다');
});

test('② 파일 **앞쪽**만 바뀐 옛 판은 「다르다」로 잡힌다 (끝 160자 표본이 내던 거짓 초록)', () => {
  /* 수리 커밋의 전형 — 끝(`module.exports`)은 손도 안 대고 위쪽 상수 한 줄을 고친다.
   * 실측이 그랬다: `ac3f646`(날짜 경계)이 `deliver/index.ts` 중간을 고쳤는데 끝은 그대로였다. */
  const 새판 = 원본.replace("'Asia/Ulaanbaatar'", "'Asia/Seoul'");
  assert.notEqual(새판, 원본);

  const 끝지문 = (s) => 정규(s).slice(-160);
  assert.equal(끝지문(새판), 끝지문(원본),
    '픽스처가 약하다 — 변경이 끝 160자 안에 들어가면 옛 방식으로도 잡혀서 ②를 재는 힘이 없다');

  const 옛판배포 = 배포본흉내(원본);
  // 🔴 옛 방식(끝 160자 지문)이면 **이 옛 판 배포본이 새 판을 「같다」로 통과시킨다.** 그게 거짓 초록이었다.
  assert.ok(옛판배포.includes(끝지문(새판)),
    '이 픽스처가 옛 방식으로도 적색이면 회귀가 아무것도 안 막는다');
  assert.equal(옛판배포.includes(정규(새판)), false,
    '옛 판이 배포돼 있는데 새 판을 찾았다 — 표본추출로 돌아가면 이 자리가 통째로 샌다');
  assert.ok(배포본흉내(새판).includes(정규(새판)), '새 판을 배포하면 같다고 나와야 한다');
});

test('③ 줄바꿈·들여쓰기가 달라도 같은 판은 같다고 본다 (양쪽을 한 함수로 편다)', () => {
  const 들여쓴판 = 원본.replace(/\n/g, '\r\n  ');
  assert.ok(배포본흉내(들여쓴판).includes(정규(원본)),
    '공백만 다른데 다르다고 했다 — 한쪽만 정규화하면 모든 파일이 영원히 적색이다');
});

test('④ 동봉된 파일이 여럿이어도 각각 따로 잡힌다 (lib 하나만 옛 판인 실제 모양)', () => {
  const lib새판 = 원본.replace('const 시간대', 'const 시간대_v2 = null; const 시간대');
  // index 는 새 판, lib 은 옛 판인 배포본 — 실측에서 deliver·tasks·progress 가 정확히 이 꼴이었다.
  const 섞인배포 = 배포본흉내('export default 1; // index.ts 새 판', 원본);
  assert.equal(섞인배포.includes(정규(lib새판)), false, 'lib 이 옛 판인데 못 잡았다');
  assert.ok(섞인배포.includes(정규(원본)), '옛 판 자체는 배포본에 있으므로 찾아져야 한다');
});
