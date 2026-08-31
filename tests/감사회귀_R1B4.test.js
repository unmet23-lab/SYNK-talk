'use strict';
/* 감사 R1B4 회귀 — 화면 셋의 시공 세 가지를 **소스·lib 층에서** 잰다
 * (RN 렌더가 못 닿는 자리라 `tests/감사회귀_R1B5.test.js` 와 같은 방식이다).
 *
 * · D8-1  보고서교정 「고침」 — 어절을 짚는 순간 입력 ref 가 defaultValue 와 같은 라벨을 쥔다
 *         (짚고 무타이핑 제출 = 원문 보존 · 빈 칸 = 지우는 교정은 그대로 산다)
 * · D5-8  어절 쫀득 — transform 만 만지고 어절 색 스타일(신호 1점)은 불변이다
 * · D3-14 반피드백 ③ 메타 줄 — 남은 대기 조각은 남은 0 이면 안 뜬다
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { 코드만, 구간, 코드만픽스처, 파일소스 } = require('./lib/소스검사.js');

const 뿌리 = path.resolve(__dirname, '..');
const 원문읽기 = (p) => 파일소스(path.join(뿌리, ...p.split('/')));
const 교정화면원문 = 원문읽기('src/보고서교정화면.js');
const 교정화면 = 코드만(교정화면원문);
const 반피드백 = 코드만(원문읽기('src/반피드백화면.js'));

test('탐지력 — 주석 제거기가 산다(안 지우면 아래 검사가 설명을 코드로 읽는다)', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다');
});

test('D8-1 어절짚기가 입력 ref 를 그 어절 라벨로 세운다 — 화면(defaultValue)과 ref 가 같은 값에서 출발', () => {
  const 짚기몸 = 구간(교정화면원문, 'const 어절짚기', 'const 고칠곳없음');
  assert.match(짚기몸, /입력참조\.current = 칸 \? 칸\.label : ''/,
    '어절짚기에 입력참조 대입이 없다 — 짚고 무타이핑 제출이 빈 문장(전어절 삭제 교정)으로 나간다');
  /* 되짚기(「다른 데를 짚을래요」)가 ref·상태참조를 같이 비운다 — A어절에 친 글이 B어절
     제출에 실리는 길과, 이탈사건이 낡은 단계·글을 읽는 길을 닫는 그 자리다. */
  assert.match(교정화면, /입력참조\.current = ''; 상태참조\.current = \{ \.\.\.상태참조\.current, 단계: '짚기', 글: '' \}; set짚은것\(null\)/,
    '되짚기가 ref·상태참조를 안 비운다');
  /* key 재마운트 — 고침 단계에서 다른 어절을 바로 짚어도 defaultValue 가 새 라벨로 선다. */
  assert.match(교정화면, /<TextInput\s+key=\{짚은것\}/, 'TextInput 에 key={짚은것} 가 없다 — 화면은 A라벨, ref 는 B가 된다');
});

test('D8-1 lib 조합 — 짚고 무타이핑 제출은 원문 보존이다(교정문만들기(보기, 고른것, 라벨) === 원문)', () => {
  const 팩 = require(path.join(뿌리, 'contents', '보고서교정문항.js'));
  const { G2스냅샷 } = require(path.join(뿌리, 'lib', '게임스냅샷.js'));
  const { 교정문만들기 } = require(path.join(뿌리, 'lib', '보고서교정.js'));
  const 문항id = 팩.문항목록().find((id) => !팩.대조문항인가(id));
  assert.ok(문항id, '팩에 오류 문항이 없다 — 픽스처 전제가 깨졌다');
  const 스냅샷 = G2스냅샷(문항id);
  assert.ok(스냅샷 && Array.isArray(스냅샷.보기) && 스냅샷.보기.length > 0, '스냅샷 보기를 못 폈다');
  const 원문 = 스냅샷.보기.map((o) => o.label).join(' ');
  for (const o of 스냅샷.보기) {
    assert.equal(교정문만들기(스냅샷.보기, o.option_id, o.label), 원문,
      `${o.option_id}: ref 가 라벨을 쥔 채 무타이핑 제출해도 원문이 보존되지 않는다`);
  }
});

test('D5-8 어절 쫀득은 transform 만 만진다 — 어절 색 스타일(신호 1점)은 불변', () => {
  const 단추몸 = 구간(교정화면원문, 'function 어절단추', 'function 머리');
  assert.match(단추몸, /transform: \[\{ scale: 쫀득\.interpolate/, '쫀득이 transform(scale) 을 안 만든다');
  /* 마스코트.js 쫀득 계보 그대로 — 눌림 90ms timing → spring friction 3.6 · tension 160. */
  assert.match(단추몸, /duration: 90/, '눌림 90ms 가 아니다 — 쫀득 계보(마스코트.js)에서 갈렸다');
  assert.match(단추몸, /friction: 3\.6, tension: 160/, '복원 스프링 값이 쫀득 계보에서 갈렸다');
  /* 색·면·신호 1점 무접촉 — 단추 몸에 색 속성이 하나도 없어야 한다(스타일은 s.* 참조뿐). */
  assert.ok(!/backgroundColor|borderColor|color:|색\./.test(단추몸),
    '어절단추가 색을 만진다 — 코랄(짚은 어절) 신호 1점은 기존 스타일 몫이다');
  /* reduce-motion 게이트 — 줄임이면 애니메이션 0(정지 화면 원칙 · lib/모션.js). */
  assert.match(단추몸, /if \(줄임\) return;/, '쫀득에 reduce-motion 게이트가 없다');
  /* 어절 스타일 자체가 그대로다 — 짚힘 코랄 면·글자색(테마 규칙)이 한 글자도 안 갈렸다. */
  assert.match(교정화면, /어절_짚힘: \{ backgroundColor: 색\.신호, borderColor: 색\.신호 \}/, '짚힘 코랄 면이 갈렸다');
  assert.match(교정화면, /어절글_짚힘: \{ fontFamily: 폰트\.강조, color: 색\.바탕 \}/, '짚힘 글자색이 갈렸다');
});

test('D3-14 반피드백 ③ 메타 줄 — 남은 0 이면 대기 조각이 안 뜬다(소스의 그 식을 그대로 돌린다)', () => {
  assert.match(반피드백, /const 남은 = Math\.max\(0, \(반\?\.항목들\?\.length \?\? 1\) - 1\)/,
    '남은 셈이 없다 — 자신(보내기 성공 전까지 항목들에 남는다)을 빼는 -1 이 정본이다');
  const m = 반피드백.match(/남은 > 0 \? (`[^`]+`) : ''/);
  assert.ok(m, '메타 줄의 남은 조각(남은 > 0 게이트)이 없다');
  // eslint-disable-next-line no-new-func
  const 조각 = new Function('남은', `return 남은 > 0 ? ${m[1]} : '';`);
  assert.equal(조각(0), '', '남은 0 인데 조각이 뜬다 — 마지막 한 건을 보는 강사에게 거짓 대기를 말한다');
  assert.equal(조각(2), ' · 이 반에 2건 더 기다려요', '조각 문구가 갈렸다 — 단위는 «건»이다(항목들은 산출물 단위)');
});
