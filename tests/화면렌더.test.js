/* 화면렌더 회귀 — 화면을 **실제로 그려 본다**.
 *
 * ■ 왜 있나 (2026-08-09 · F268 의 남은 절반)
 *   `useState(오늘)` — 어디에도 없는 이름을 화면이 불렀는데 그때 저장소는 **550/550 초록**이었다.
 *   그 뒤 `tests/미정의심볼.test.js` 가 정적으로 그 형태를 잡게 됐지만, 정적 검사가 원리상
 *   못 보는 것이 남는다: 값 모양이 어긋나 `undefined.오늘` 로 죽는 것, 훅 순서, 없는 prop.
 *   판정을 lib 으로 빼 온 것(`lib/견줌.js`)은 **판정**을 잰 것이지 화면이 그것을 옳게 쓰는지가
 *   아니다 — 그 사이가 이 파일이 처음 재는 자리다.
 *
 * ■ 통로는 `tests/lib/화면세우기.js` 하나 (새 의존성 0)
 *   조립을 여기서 손으로 하면 `tests/스폰통로.test.js` 가 막는다 — 사본이 갈라지는 자리라서다.
 *
 * ■ 탐지력은 픽스처가 진다 (CLAUDE.md 가드 세 맹점 ②)
 *   `tests/fixtures/깨진화면.js` 가 F268 그 모양이고, ⑤가 「이 하네스는 그것을 잡는다」를
 *   못박는다. 실화면 검사는 거짓양성만 본다 — 저장소가 성한 동안 초록이어야 한다.
 *
 * 🔴 아직 못 재는 화면 = 말하기·답장·도착확인(`expo-*` 를 끌고 온다 · 통로 머리말 참조).
 *    F268 이 난 곳이 말하기화면이라 **여기가 이 회귀의 가장 큰 남은 구멍**이다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 그리기, ROOT } = require('./lib/화면세우기.js');

test('① 「어제의 나」가 정본 값을 그대로 글자로 낸다 (판정과 화면이 갈리지 않는다)', () => {
  /* 🔑 픽스처를 손으로 짓지 않고 **정본**(`lib/견줌.js`)에 접게 한다 — 화면이 읽는 모양을
     여기서 또 적으면 그게 두 벌이고, 갈라지는 날 이 회귀가 거짓 초록이 된다. */
  const { 견줌 } = require(path.join(ROOT, 'lib', '견줌.js'));
  const 값 = 견줌({
    date: '2026-08-09',
    data: [{
      today: { submission_count: 3, retry_count: 1, correction_retry: true },
      yesterday: { submission_count: 1, retry_count: 0, correction_retry: false },
    }],
  });
  assert.ok(값, '견줌이 null 이면 화면은 아예 안 뜬다 — 픽스처가 첫날 모양이 됐다');

  const 글 = 그리기('src/어제의나.js', { 값, 돌아가기() {} });
  assert.match(글, /3/, '오늘 낸 수가 화면에 없다');
  assert.match(글, /어제보다 2개 더 냈어요/, '늘어난 말이 화면에 안 붙었다(정본은 붙인다고 한다)');
});

test('② 줄어든 날에는 말이 안 붙는다 — 화면이 정본의 「평가하지 않는다」를 지킨다', () => {
  const { 견줌 } = require(path.join(ROOT, 'lib', '견줌.js'));
  const 값 = 견줌({
    date: '2026-08-09',
    data: [{
      today: { submission_count: 1, retry_count: 0, correction_retry: false },
      yesterday: { submission_count: 2, retry_count: 0, correction_retry: false },
    }],
  });
  const 글 = 그리기('src/어제의나.js', { 값, 돌아가기() {} });
  assert.doesNotMatch(글, /더 냈어요|적어요/, '줄어든 날에 말이 붙었다 — 그건 동기가 아니라 평가다');
});

test('③ 막힘카드가 막힘 사유를 학생이 읽을 글자로 편다', () => {
  const { 막힘안내 } = require(path.join(ROOT, 'contents', '문구_동의.js'));
  const 막힘 = { code: '없는코드라도' };
  assert.ok(막힘안내(막힘), '정본이 안내를 안 낸다 — 픽스처 모양이 틀렸다');

  const 글 = 그리기('src/막힘카드.js', { 막힘, 학생번호: 'SYNK-042' });
  assert.match(글, /선생님께/, '막힌 학생이 무엇을 할지가 화면에 없다');
  assert.match(글, /SYNK-042/, '학생번호가 안 떴다 — 안내가 「이 번호를 보여 주세요」로 끝나는데 그 번호가 없다(F176 ①)');
});

test('④ 로그인 화면·원장 초기화가 그리다 죽지 않는다 (학생이 처음 만나는 두 화면)', () => {
  const 로그인 = 그리기('src/인증화면.js', { 로그인성공() {}, 닫기() {} });
  assert.match(로그인, /들어가기/, '로그인 화면에 들어가는 버튼이 없다');

  const 초기화 = 그리기('src/원장초기화.js', { 토큰: 'x', 닫기() {} });
  assert.ok(초기화.length > 0, '원장 초기화가 빈 화면을 냈다');
});

test('⑤ 이 하네스는 F268 그 모양을 실제로 잡는다 (탐지력은 픽스처가 진다)', () => {
  /* `tests/fixtures/깨진화면.js` 는 선언 없는 이름을 그릴 때 부른다 — 구문검사·번들링은
     통과하고 **그리는 순간** 죽는 그 형태다. 여기서 안 죽으면 위 ①~④ 의 초록은
     「화면을 안 그렸다」와 구별이 안 된다(미실행이 통과와 같은 모양 · F207). */
  assert.throws(
    () => 그리기('tests/fixtures/깨진화면.js'),
    /없는이름|is not defined/,
    '깨진 화면이 그려졌다 — 이 하네스가 화면을 실제로 실행하지 않고 있다',
  );
});
