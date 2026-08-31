/* 문법급수 회귀 — 계약(정본 파생)과 `lib/문법급수.js`(사본)가 갈라지지 않는다 (2026-08-12).
 *
 * ■ 왜 기계로 막나 — 이 사본은 **저쪽 저장소가 정본**이다
 *   급수 정본은 SYNK-appsscript `GRAMMAR_BANK` 고, 이쪽에 오는 길은 `계약/문법급수_계약.json`
 *   하나뿐이다. 동봉 기전이 CJS 에서 JSON `require` 를 안 풀어(`tools/원격배포.js` REQUIRE문)
 *   lib 은 값을 베껴 든다 — 즉 **갈라짐이 기본값**이고 증상은 「Lv3 학생에게 1급 문항만」처럼
 *   화면에 안 나온다. 여기가 그 손을 부르는 자리다(`tests/계약.test.js` SCHEMA_VER 절과 같은 축).
 *
 * ■ 세 맹점 (CLAUDE.md)
 *   ①탐지력은 픽스처가 진다 — 판정(최댓값·세 칸 분리)을 가짜 문항으로 실증한다.
 *   ②실저장소엔 거짓양성만 — 「계약과 같은가」 하나. 버그가 남아 있기를 요구하지 않는다.
 *   ③자기 처방 — 실패 문구가 시키는 명령이 실제로 이 상태를 고치는 명령인지 본다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const G = require('../lib/문법급수.js');
const 팩 = require('../contents/토픽퀴즈문항.js');

const 계약 = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '계약', '문법급수_계약.json'), 'utf8'));

/* ── ① 탐지력 (픽스처) ─────────────────────────────────────────── */

const 가짜문항 = (skill_ids) => ({ 문항id: 'fx', skill_ids });

test('① 문항 급수는 «최댓값»이다 — 가장 늦게 배우는 문법이 문턱', () => {
  // connective-reason = G308(1급)+G410(2급) 을 실제로 걸친 스킬. 최솟값이면 1이 나온다.
  assert.equal(G.문항급수(가짜문항(['skill-ko-grammar-connective-reason'])), 2,
    '두 급에 걸친 스킬이 낮은 쪽으로 접혔다 — 초급자가 못 푸는 문항을 받는다');
  // 1급 스킬 + 3급 스킬을 섞으면 3이어야 한다(급수표에 3급이 있는 것을 골라 태운다).
  assert.equal(G.문항급수(가짜문항(['skill-ko-grammar-particle-object', 'skill-ko-grammar-tense-progressive'])), 2);
  assert.equal(G.문항급수(가짜문항(['skill-ko-grammar-particle-object'])), 1);
});

test('① 대응이 하나도 없으면 «미상»(null)이다 — 0 이나 1 로 접지 않는다', () => {
  assert.equal(G.문항급수(가짜문항(['skill-ko-vocab-antonym'])), null,
    '어휘 스킬이 급을 얻었다 — 문법 뱅크엔 어휘 축이 없다(지어낸 값)');
  assert.equal(G.문항급수(가짜문항([])), null);
  assert.equal(G.급수('G999'), null, '뱅크 밖 ID 가 값을 냈다');
});

test('① 「미상」과 「밴드 밖」은 갈려 나온다 — 합치면 팩의 30%가 사유 없이 사라진다', () => {
  const 대상 = [가짜문항(['skill-ko-grammar-particle-object']),   // 1급
    가짜문항(['skill-ko-grammar-connective-condition']),          // 2급
    가짜문항(['skill-ko-vocab-antonym'])];                        // 미상
  대상.forEach((q, i) => { q.문항id = `fx${i}`; });
  const r = G.밴드나누기(1, 대상);
  assert.deepEqual(r.밴드안, ['fx0']);
  assert.deepEqual(r.밴드밖, ['fx1']);
  assert.deepEqual(r.미상, ['fx2'], '미상이 밴드 밖으로 접혔다 — 모르는 것과 안 맞는 것은 다른 판정이다');
});

test('① 모르는 레벨은 «빈 밴드»로 접힌다 — 던지지 않는다(배정이 통째로 죽지 않게)', () => {
  assert.deepEqual(G.밴드(9), []);
  const r = G.밴드나누기(9, [가짜문항(['skill-ko-grammar-particle-object'])]);
  assert.equal(r.밴드안.length, 0);
  assert.equal(r.밴드밖.length, 1);
});

/* ── ② 실저장소 (거짓양성만) ───────────────────────────────────── */

/* 제목의 분모는 «읽어서» 적는다 — 손으로 적은 72 는 08-31 에 뱅크가 75 로 자라며 낡았다. */
test(`② 급수표가 계약과 글자까지 같다 — 분모: 문법 ${G.급수표.length}`, () => {
  assert.equal(G.급수판, 계약.판,
    `급수판(${G.급수판})이 계약 판(${계약.판})과 다르다 — 저쪽에서 판을 올렸으면 lib/문법급수.js 도 같이 올려라`);
  const 계약꼴 = 계약.문법.map((g) => [g.id, g.도입급, g.재출현급]);
  assert.deepEqual(G.급수표, 계약꼴,
    '급수표가 계약과 갈라졌다 — 고치는 법: 계약 파일을 열어 [id, 도입급, 재출현급] 로 lib/문법급수.js 표를 맞춘다\n'
    + '  (계약 자체가 낡았다면 저쪽에서: node tools/문법급수계약.js && node tools/계약동기화.js)');
  assert.ok(G.급수표.length >= 72, `분모가 비었다 — 문법 ${G.급수표.length}개(미실행은 통과와 같은 모양이다)`);
});

test('② 레벨 밴드가 계약과 같다 — 레벨↔급 대응이 두 곳에서 갈리지 않는다', () => {
  for (const lv of Object.keys(계약.레벨밴드)) {
    assert.deepEqual(G.밴드(lv), 계약.레벨밴드[lv], `Lv${lv} 밴드가 계약과 다르다`);
  }
  assert.equal(Object.keys(G.레벨밴드).length, Object.keys(계약.레벨밴드).length,
    '밴드 레벨 수가 계약과 다르다 — 한쪽에만 레벨이 생겼다');
});

test('② 팩의 문법 대응이 전부 계약에 실재한다 (지어낸 ID 0 · 분모: 대응 있는 스킬)', () => {
  const 없는 = [];
  let 대응있음 = 0;
  for (const [skill, gids] of Object.entries(팩.문법대응)) {
    if (gids.length) 대응있음 += 1;
    for (const gid of gids) if (!G.급수(gid)) 없는.push(`${skill} → ${gid}`);
  }
  assert.deepEqual(없는, [],
    '팩이 계약에 없는 문법 ID 를 가리킨다 — 그 스킬의 문항은 조용히 「급수 미상」이 된다');
  assert.ok(대응있음 >= 20, `분모가 비었다 — 대응 있는 스킬 ${대응있음}개`);
});

test('② 대응 키 집합 = 스킬표 30 (빠진 스킬이 조용히 미상으로 접히지 않게)', () => {
  assert.deepEqual(Object.keys(팩.문법대응).sort(), 팩.스킬표.map((s) => s.skill_id).sort());
  assert.equal(팩.스킬표.length, 30);
});

test('② 두 급에 걸치는 스킬은 «지금 하나»다 — 최댓값의 대가가 조용히 늘지 않게', () => {
  const 걸침 = Object.entries(팩.문법대응)
    .filter(([, gids]) => new Set(gids.map((g) => (G.급수(g) || {}).도입).filter((x) => x != null)).size > 1)
    .map(([s]) => s);
  assert.deepEqual(걸침, ['skill-ko-grammar-connective-reason'],
    '걸치는 스킬이 바뀌었다 — 최댓값 규칙은 그 스킬의 쉬운 문항을 «어렵게» 올려 잡는다.\n'
    + '  늘려도 되지만 그 대가(몇 문항이 올려 잡히나)를 알고 늘려라 — lib/문법급수.js 머리말의 그 문단을 같이 고친다');
});

test('② 세 칸이 전 문항을 정확히 한 번씩 담는다 — 분모 100 (조용한 결손 0)', () => {
  for (let lv = 1; lv <= 6; lv += 1) {
    const r = G.밴드나누기(lv);
    const 합 = r.밴드안.length + r.밴드밖.length + r.미상.length;
    assert.equal(합, 팩.문항들.length, `Lv${lv}: 세 칸 합 ${합} ≠ 문항 ${팩.문항들.length} — 어딘가로 샜다`);
    assert.equal(new Set([...r.밴드안, ...r.밴드밖, ...r.미상]).size, 합, `Lv${lv}: 같은 문항이 두 칸에 들었다`);
  }
  const 분포 = G.급수분포();
  const 세어진 = Object.values(분포).reduce((a, b) => a + b, 0);
  assert.equal(세어진, 팩.문항들.length, `급수 분포 합 ${세어진} ≠ 문항 ${팩.문항들.length}`);
});
