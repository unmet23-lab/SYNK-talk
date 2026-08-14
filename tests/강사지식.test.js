/* 강사 지식 빌드 — 경로 가드가 실제로 물고, 생성물이 낡지 않았나 (계약 §3·§5).
 *
 * ■ 두 층을 갈라 잰다 (CLAUDE.md 신뢰성 절 ②「버그가 아직 있을 것을 요구하는 회귀 금지」)
 *   ㉠ **탐지력은 픽스처가 진다** — 가짜 경로·가짜 문서를 순수 함수에 먹여 「막는가」를 잰다.
 *      실저장소에 `_ops` 경로를 남겨 두고 「죽는지 보자」로 재면, 고치는 날 회귀가 같이 죽는다.
 *   ㉡ **실저장소는 거짓양성만 검사한다** — 멀쩡한 매니페스트가 통과하는가, 생성물이 최신인가.
 *
 * ■ 형제 저장소(appsscript)가 없는 CI 에서는 **skip 으로 드러낸다**(F296)
 *   `as:` 항목 9벌이 형제 저장소에서 온다. 없는 것을 fail 로 적으면 남의 배포가 막히고,
 *   조용히 통과시키면 초록이 분모 없이 읽힌다. skip 은 「안 쟀다」를 말하는 유일한 모양이다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { 코드만 } = require('./lib/소스검사.js');

const 뿌리 = path.resolve(__dirname, '..');
const 빌더경로 = path.join(뿌리, 'tools', '강사지식빌드.js');
const 매니페스트경로 = path.join(뿌리, 'contents', '강사지식_목록.json');
const 생성물경로 = path.join(뿌리, 'contents', '강사지식.js');
const 계약경로 = path.join(뿌리, 'docs', '컴패니언_내부계약.md');
const 형제뿌리 = path.resolve(뿌리, '..', 'SYNK-appsscript');

assert.ok(fs.existsSync(빌더경로), 'tools/강사지식빌드.js 가 없다 — 이 검사가 통째로 미실행이다');
assert.ok(fs.existsSync(매니페스트경로), 'contents/강사지식_목록.json 이 없다 — 미실행이다');

const { 막힌조각, 주제만걸기, 금지조각 } = require(빌더경로);
const 매니페스트 = JSON.parse(fs.readFileSync(매니페스트경로, 'utf8'));
const 형제있나 = fs.existsSync(형제뿌리);

/* ── ㉠ 탐지력 픽스처 — 경로 가드 ────────────────────────────────── */

test('픽스처: `_ops` 경로를 실제로 잡는다 (안 잡으면 아래 검사 전부가 장식이다)', () => {
  assert.equal(막힌조각('docs/_ops/보드/abc.md'), '_ops');
  assert.equal(막힌조각('docs/_archive/옛판.md'), '_archive');
  assert.equal(막힌조각('docs/정본/SYNK 보안/키.md'), '정본/SYNK 보안');
  assert.equal(막힌조각('docs/급여_설계.md'), '급여');
  assert.equal(막힌조각('docs/재무_계획.md'), '재무');
  /* 윈도 역슬래시로 와도 같은 판정 — 사람이 쓰는 표기 그대로 센다(맹점 ①). */
  assert.equal(막힌조각('docs\\_ops\\보드\\abc.md'), '_ops');
});

test('픽스처: 멀쩡한 경로는 안 잡는다 (거짓양성 = 따를 수 없는 처방 · F103)', () => {
  assert.equal(막힌조각('docs/강사_교수법_매뉴얼_v1.md'), null);
  assert.equal(막힌조각('prompts/교정.md'), null);
  assert.equal(막힌조각('docs/정본/SYNK/SYNK FAQ.txt'), null);
});

test('금지조각 목록이 비지 않았다 — 비면 가드가 아무것도 안 막는다', () => {
  assert.ok(Array.isArray(금지조각) && 금지조각.length >= 5,
    `금지조각이 ${금지조각 && 금지조각.length}개다 — 목록이 비면 위 픽스처만 초록이고 실물은 안 막힌다`);
});

test('가드가 «배선»돼 있다 — 순수 함수가 멀쩡해도 안 부르면 안 막는다', () => {
  const 소스 = 코드만(fs.readFileSync(빌더경로, 'utf8'));
  const m = /function 매니페스트읽기\(\)[\s\S]*?\n}/.exec(소스);
  assert.ok(m, '매니페스트읽기 를 못 찾았다 — 앵커가 낡았다(이 검사는 무엇이든 통과시킨다)');
  assert.ok(/막힌조각\(/.test(m[0]), '매니페스트읽기 가 경로 가드를 안 부른다');
  assert.ok(/die\(/.test(m[0]), '걸려도 안 죽는다 — 경고만 하면 그 빌드는 나간다');
});

/* ── ㉠ 탐지력 픽스처 — ⛔ 게이트 ───────────────────────────────── */

test('픽스처: ⛔ 절은 몸을 버리고 제목만 남긴다', () => {
  const 가짜 = [
    '# FAQ',
    '### ⛔ Q1. 수강료가 얼마인가요?',
    '월 55만₮ 입니다.',
    '더 적힌 줄.',
    '### ✅ Q2. 언제 여나요?',
    '2027년 2월입니다.',
  ].join('\n');
  const 결과 = 주제만걸기(가짜);
  assert.ok(!결과.includes('55만'), '⛔ 절의 몸이 살아남았다 — 확정 전 숫자가 강사 입으로 나간다');
  assert.ok(결과.includes('### ⛔ Q1. 수강료가 얼마인가요?'), '⛔ 절의 제목까지 지웠다 — 인계가 부정확해진다');
  assert.ok(결과.includes('2027년 2월'), '✅ 절의 몸까지 지웠다 — 게이트가 문서를 삼켰다');
});

test('픽스처: ⛔ 하나가 뒤 문서를 삼키지 않는다 (버리기가 새 제목에서 끝난다)', () => {
  const 가짜 = ['### ⛔ A', '비밀', '## 2장', '살아야 한다', '### ✅ B', '이것도'].join('\n');
  const 결과 = 주제만걸기(가짜);
  assert.ok(!결과.includes('비밀'));
  assert.ok(결과.includes('살아야 한다'), '⛔ 뒤의 다른 장까지 삼켰다 — 새는 방향이 「덜 실림」이라 조용하다');
  assert.ok(결과.includes('이것도'));
});

/* ── ㉡ 실저장소 — 계약과 매니페스트가 갈라졌나 ─────────────────── */

test('매니페스트는 12벌이고 계약 §3 도 12벌이라고 말한다', () => {
  assert.equal(매니페스트.항목.length, 12,
    `매니페스트가 ${매니페스트.항목.length}벌이다 — 계약 §3 은 「12벌이 v0 의 전부」다`);
  assert.ok(fs.existsSync(계약경로), 'docs/컴패니언_내부계약.md 가 없다 — 이 검사가 미실행이다');
  const 계약 = fs.readFileSync(계약경로, 'utf8');
  assert.ok(/\*\*12벌이 v0 의 전부\*\*/.test(계약),
    '계약 §3 의 「12벌이 v0 의 전부」 문구가 없다 — 계약을 고쳤으면 이 검사와 매니페스트도 함께 고친다');
});

test('계약 §3 이 «제외 확정»한 문서가 매니페스트에 없다', () => {
  const 계약 = fs.readFileSync(계약경로, 'utf8');
  const 제외절 = 계약.slice(계약.indexOf('🚫 제외 확정'));
  assert.ok(제외절.length > 50, '계약에서 「🚫 제외 확정」 절을 못 찾았다 — 앵커가 낡았다');
  const 제외경로 = [...제외절.matchAll(/`([^`]*\.(?:md|txt))`/g)].map((m) => m[1]);
  assert.ok(제외경로.length >= 2, `제외 경로를 ${제외경로.length}개밖에 못 찾았다 — 추출기가 낡았다`);
  const 실린것 = new Set(매니페스트.항목.map((it) => it.경로));
  const 샌것 = 제외경로.filter((p) => 실린것.has(p));
  assert.deepEqual(샌것, [], `계약이 제외한 문서가 실렸다: ${샌것.join(', ')}`);
});

test('매니페스트 전 항목이 경로 가드를 통과한다 (거짓양성 검사)', () => {
  const 걸린것 = 매니페스트.항목
    .map((it) => ({ 이름: it.이름, 걸림: 막힌조각(it.경로) }))
    .filter((x) => x.걸림);
  assert.deepEqual(걸린것, [], `가드에 걸리는 항목이 매니페스트에 있다: ${JSON.stringify(걸린것)}`);
});

test('문서 이름이 겹치지 않는다 — cited_refs 화이트리스트 값이라 유일해야 한다', () => {
  const 이름 = 매니페스트.항목.map((it) => it.이름);
  assert.equal(new Set(이름).size, 이름.length, `이름이 겹친다: ${이름.join(' | ')}`);
});

/* ── ㉡ 실저장소 — 생성물이 낡지 않았나 (형제 없으면 skip) ───────── */

test('생성물이 있고 화이트리스트가 매니페스트와 같다', () => {
  assert.ok(fs.existsSync(생성물경로), 'contents/강사지식.js 가 없다 — `node tools/강사지식빌드.js` 를 돌린다');
  const { 문서이름, 출처대장, 강사지식 } = require(생성물경로);
  assert.deepEqual(문서이름, 매니페스트.항목.map((it) => it.이름),
    '생성물의 문서이름이 매니페스트와 다르다 — 다시 구워야 한다');
  assert.equal(출처대장.length, 매니페스트.항목.length);
  assert.ok(강사지식.length > 10000, `지식이 ${강사지식.length}자다 — 통째로 비었거나 잘렸다`);
});

test('생성물이 손으로 안 고쳐졌다 — 「손으로 안 고친다」 표기가 살아 있다', () => {
  const 글 = fs.readFileSync(생성물경로, 'utf8');
  assert.ok(/\*\*생성물이다\. 손으로 안 고친다\.\*\*/.test(글),
    '생성물 머리말의 표기가 사라졌다 — 사람이 여기를 고치기 시작하면 매니페스트가 정본이 아니게 된다');
});

test('생성물이 원본과 같다 (형제 저장소 없으면 skip · F296)', (t) => {
  if (!형제있나) {
    t.skip(`형제 저장소가 없다(${형제뿌리}) — as: 9벌을 못 읽는다. 낡음은 «안 쟀다».`);
    return;
  }
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [빌더경로, '--확인'], { cwd: 뿌리, stdio: 'pipe' });
  } catch (e) {
    assert.fail('생성물이 원본과 다르다 — `node tools/강사지식빌드.js` 로 다시 구워라.\n'
      + `  ${String(e.stderr || e.stdout || e.message).trim()}`);
  }
});
