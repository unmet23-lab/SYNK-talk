/**
 * C0 API 계약(docs/C0_API계약.md) ↔ 수집 계약(계약/수집_교정_계약.json) 대조
 *
 * 왜 있나 — C0는 「앱이 무엇을 보내나」의 정본이라 예시에 값이 박힌다.
 *   그 값이 계약 값목록 밖으로 새면 **Codex가 문서대로 만들었는데 서버가 거부한다** —
 *   그리고 그건 화면을 다 만든 뒤에야 드러난다.
 *
 * 🔴 실측 근거: c1→c3에서 L0 초안과 계약 파일이 정확히 이렇게 갈라졌다(이름 4건 ·
 *   과업종류/task_type · 급수/level_snapshot · 강등여부/degraded · confidence 의미 충돌).
 *   그때는 사람이 대조해서 잡았다. 사람이 읽어야 발동하는 장치는 안 돈다.
 *
 * 파일이 따로인 이유 — `계약.test.js`는 교정 어휘 담당이고 여기는 API 문서 담당이다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const C0경로 = path.join(ROOT, 'docs', 'C0_API계약.md');

// JSON 예시에 실제로 박히는 표기만 뽑는다 — 설명 문장의 백틱 단어를 값으로 세지 않으려고
const 뽑기 = (text, 키) => [...new Set(
  [...text.matchAll(new RegExp(`"${키}"\\s*:\\s*"([^"]+)"`, 'g'))].map((m) => m[1]))];

test('뽑기 정규식이 살아 있다 (실문서가 깨끗한 것과 검사가 죽은 것이 같은 모양이면 안 된다)', () => {
  const 가짜 = '{ "event_type": "quiz.dropped", "task_type": "받아쓰기" }';
  assert.deepEqual(뽑기(가짜, 'event_type'), ['quiz.dropped']);
  assert.deepEqual(뽑기(가짜, 'task_type'), ['받아쓰기']);
  // 백틱 표기는 값이 아니다(§9의 c4 제안 3종이 여기 걸리면 안 된다)
  assert.deepEqual(뽑기('`event_type`은 무슨 일이 일어났나다', 'event_type'), []);
});

test('C0 예시의 event_type·task_type이 전부 계약 값목록 안에 있다', () => {
  const md = fs.readFileSync(C0경로, 'utf8');
  const 값목록 = 계약.learning_events.값목록;
  let 예시수 = 0;

  for (const 키 of ['event_type', 'task_type']) {
    const 쓰인 = 뽑기(md, 키);
    예시수 += 쓰인.length;
    assert.deepEqual(쓰인.filter((v) => !값목록[키].includes(v)), [],
      `C0 예시의 ${키}가 계약 값목록에 없다 — 문서대로 만든 앱이 보내는 값을 서버가 거부한다.\n` +
      '  고치는 법: 계약 파일에 값을 넣고(c4 개정) **두 저장소 모두에 같은 바이트로** 넣는다 — 문서만 고치지 않는다');
  }

  assert.ok(예시수 >= 2,
    `C0에서 값목록 예시를 ${예시수}개밖에 못 뽑았다 — 예시가 사라졌거나 문서 경로가 바뀌었다`);
});

test('C0가 값목록을 통째로 복사하지 않았다 (복사본은 계약이 개정되는 날 갈라진다)', () => {
  const md = fs.readFileSync(C0경로, 'utf8');
  const 값목록 = 계약.learning_events.값목록;
  for (const [키, 값들] of Object.entries(값목록)) {
    const 등장 = 값들.filter((v) => md.includes(v)).length;
    assert.ok(등장 < 값들.length,
      `C0에 ${키} 값목록 ${값들.length}종이 전부 적혀 있다 — 계약 파일이 개정되면 이 문서만 낡는다.\n` +
      '  고치는 법: 목록을 지우고 계약 파일을 가리킨다(예시 1~2개는 괜찮다)');
  }
});
