'use strict';
/* 몽골어 감수 1차 목록 회귀 — `contents/문구_1차.js` 가 **썩지 않게** 하는 자리.
 *
 * 🔴 이 파일이 막는 사고는 증상이 없다
 *   누가 `인증화면.js` 의 버튼 글자를 다듬으면, 1차 목록은 조용히 **옛 문장**을 감수자에게
 *   보낸다. 감수는 잘 끝나고, 번역도 잘 오고, 앱에 붙이는 날에야 「이 문장 우리 앱에 없는데」가
 *   된다. 그때는 이미 감수자 시간을 썼다. 그래서 사람 눈이 아니라 여기서 매 커밋 대조한다.
 *
 * 🔑 대조의 방향이 중요하다 — **목록 → 원문**이다(목록이 인용한 문장이 그 파일에 실제로 있나).
 *   반대 방향(원문의 모든 문장이 목록에 있나)은 일부러 안 잰다: 1차는 «고른 것»이라
 *   빠진 것이 정상이다. 무엇을 왜 뺐는지는 `contents/문구_1차.js` 머리말이 진다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { 문구_1차, 반입칸, 아이막초벌 } = require('../contents/문구_1차.js');
const { ID꼴 } = require('../lib/문구감수.js');
const { 아이막 } = require('../lib/가입문항.js');

const 뿌리 = path.join(__dirname, '..');
const 원문캐시 = new Map();

/** 원문을 읽어 **대조용으로 고른다**: `${...}` 자리는 목록과 같은 `{n}` 으로 접는다. */
function 원문(상대경로) {
  if (!원문캐시.has(상대경로)) {
    const p = path.join(뿌리, ...상대경로.split('/'));
    assert.ok(fs.existsSync(p), `${상대경로} 가 없다 — 파일이 옮겨졌다면 목록의 source_file 도 함께 옮겨라`);
    원문캐시.set(상대경로, fs.readFileSync(p, 'utf8').replace(/\$\{[^}]*\}/g, '{n}'));
  }
  return 원문캐시.get(상대경로);
}

/** 목록의 문장을 **소스에 적힌 모양**으로 되돌린다 — 줄바꿈은 소스에서 두 글자(`\n`)다. */
const 소스꼴 = (s) => s.replace(/\n/g, '\\n');

test('① string_id 는 전부 ID꼴을 지킨다 — 반입이 DB CHECK 에서 죽지 않게', () => {
  /* 같은 규칙이 셋(이 목록·lib·DB CHECK)에 산다. 앞의 둘을 여기서 묶어 두면 반입 도구가
     서기 전에 이미 「DB 가 받아 줄 id 인가」가 판정돼 있다. */
  for (const e of 문구_1차) {
    assert.equal(ID꼴.test(e.string_id), true, `${e.string_id} 가 ID꼴을 어긴다 — 소문자 ASCII·구분자(.  _ -)만`);
  }
});

test('② string_id 가 겹치지 않는다 — 겹치면 뒤엣것이 앞엣것을 조용히 덮는다', () => {
  const 본것 = new Set();
  const 겹친것 = 문구_1차.map((e) => e.string_id).filter((id) => (본것.has(id) ? true : (본것.add(id), false)));
  assert.deepEqual(겹친것, [], `겹치는 id: ${겹친것.join(', ')}`);
});

test('③ 칸이 정확히 여섯이다 — 반입 다섯 + source_file(반입 때 버려진다)', () => {
  const 기대 = [...반입칸, 'source_file'].sort();
  assert.equal(반입칸.includes('source_file'), false,
    'source_file 이 반입칸에 들어갔다 — DB 에 없는 열이라 insert 가 죽는다');
  for (const e of 문구_1차) {
    assert.deepEqual(Object.keys(e).sort(), 기대, `${e.string_id} 의 칸이 다르다`);
  }
});

test('④ source_ko·context 는 찬 글, draft_mn 은 null 이거나 찬 글', () => {
  for (const e of 문구_1차) {
    assert.ok(typeof e.source_ko === 'string' && e.source_ko.trim(), `${e.string_id}: source_ko 가 비었다`);
    /* 맥락이 없으면 감수자가 「이 문장이 어디에 뜨는지」를 모른 채 옮긴다 — 그러면 길이도
       말투도 맞출 수가 없다. 이 칸은 선택이 아니다. */
    assert.ok(typeof e.context === 'string' && e.context.trim().length >= 10, `${e.string_id}: context 가 너무 짧다`);
    assert.ok(e.draft_mn === null || (typeof e.draft_mn === 'string' && e.draft_mn.trim()),
      `${e.string_id}: draft_mn 은 null 이거나 찬 글이어야 한다(빈 문자열은 「번역이 왔다」로 오해된다)`);
  }
});

test('⑤ max_len 은 null(줄바꿈 자유) 이거나 양의 정수다', () => {
  for (const e of 문구_1차) {
    if (e.max_len === null) continue;
    assert.ok(Number.isInteger(e.max_len) && e.max_len > 0, `${e.string_id}: max_len = ${e.max_len}`);
    /* 예산이 원문보다 좁으면 그 자리는 **한국어일 때 이미 넘친다** — 예산을 잘못 잰 것이다.
       (키릴이 한국어보다 글자수가 많으므로 원문 길이는 하한이지 상한이 아니다.) */
    assert.ok(e.max_len >= e.source_ko.length,
      `${e.string_id}: max_len(${e.max_len}) 이 한국어 원문(${e.source_ko.length}자)보다 좁다`);
  }
});

test('⑥ 🔴 인용한 원문이 그 파일에 실제로 있다 — 목록이 썩는 유일한 길을 막는다', () => {
  const 없는것 = 문구_1차
    .filter((e) => !원문(e.source_file).includes(소스꼴(e.source_ko)))
    .map((e) => `${e.string_id} ← ${e.source_file}`);
  assert.deepEqual(없는것, [],
    `아래 문장이 원문에서 사라졌다(고쳤거나 옮겼다). 목록도 같이 고쳐라 — 안 고치면 감수자가 없는 문장을 옮긴다:\n  ${없는것.join('\n  ')}`);

  /* 탐지력 — 이 대조가 살아 있나. 죽으면 위 목록은 영원히 초록이고, 그게 이 사고의 모양이다. */
  assert.equal(원문('src/인증화면.js').includes('있을 리 없는 문장 ZZQ'), false,
    '대조가 죽었다 — 아무 문장이나 통과한다');
});

test('⑦ 초벌(draft_mn)은 지어낸 것이 아니라 **원문에서 온 것**이다', () => {
  /* 목록에 초벌이 실릴 수 있는 길은 둘뿐이다: 이미 코드에 붙어 있던 몽골어(app.json 권한 문구),
     또는 이 파일이 원천인 아이막 음역표. 셋째 길(기계 번역 붙여넣기)을 여기서 막는다 —
     `contents/문구_동의.js` 머리말: **틀린 몽골어는 없는 것보다 나쁘다.** */
  const 아이막값 = new Set(Object.values(아이막초벌));
  for (const e of 문구_1차) {
    if (e.draft_mn === null || 아이막값.has(e.draft_mn)) continue;
    assert.ok(원문(e.source_file).includes(e.draft_mn),
      `${e.string_id}: 초벌이 ${e.source_file} 에 없다 — 어디서 왔나? 출처 없는 번역은 큐에 안 넣는다`);
  }
});

test('⑧ 아이막 22가 lib/가입문항.js 와 한 벌이다 — 늘거나 줄면 여기서 걸린다', () => {
  const 코드쪽 = 아이막.map((b) => b.값).sort();
  const 목록쪽 = 문구_1차
    .filter((e) => e.string_id.startsWith('signup.aimag.'))
    .map((e) => e.source_ko).sort();
  assert.deepEqual(목록쪽, 코드쪽,
    '아이막 목록이 갈라졌다 — 코드에 아이막이 늘면 그 학생의 고향은 로마자로 남는다(증상 없음)');
  /* 표기표에도 빠짐이 없어야 한다: 하나라도 비면 그 칩만 로마자로 뜬다. */
  assert.deepEqual(Object.keys(아이막초벌).sort(), 코드쪽, '아이막초벌 표에 빠진 값이 있다');
});
