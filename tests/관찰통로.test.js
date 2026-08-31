/* 교실 관찰 회귀 (c14 · M2 강사 화면) — 어휘·초안·대조를 행동으로 못박는다.
 *   정본 = appsscript `docs/관찰태그_자동화_설계.md` v1.1 · 유호 확정 08-31 「웅 그대로 가」.
 * 🔑 이 파일이 지는 것 셋
 *   ① **값록 사본**을 계약과 글자로 대조한다 — `lib/관찰초안.js` 는 teach 에 `.mjs` 로 동봉되는데
 *      계약 JSON 은 동봉 목록에 없어 서버에서 require 할 수 없다. 없앨 수 없는 사본은 기계에 문다
 *      (`tests/반피드백.test.js` 가 DB CHECK 를 무는 것과 같은 규율).
 *   ② **분모 규칙** — `draft_modified` 의 셋째 값(`null` = 분모 밖)이 둘로 접히지 않는지.
 *      접히면 무수정 통과율이 조용히 부풀려지고, 그건 감사가 아니라 자기 확인이 된다.
 *   ③ **㉯ 기각의 물리** — 프롬프트에 앱 축 데이터가 한 칸도 안 들어가는지. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const 관찰 = require('../lib/관찰초안.js');
const { 사건출처, 운영기록계열, 운영기록판, 동의게이트지나나 } = require('../lib/사건출처.js');
const { 물리칸, 생산자, 엔진도달, 이벤트별필수, 서버사건, 앱사건 } = require('../lib/이벤트검증.js');

const 계약 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '계약', '수집_교정_계약.json'), 'utf8'));

/* ── ① 값록 사본 — 갈리면 JS 는 통과시키고 검증기가 거절한다(증상이 조용하다) ────────── */

test('영역 9종이 계약 「관찰영역」과 글자로 같다 — 순서까지', () => {
  assert.deepEqual([...관찰.영역들], 계약.learning_events.값목록.관찰영역);
});

test('오류태그가 계약 최상위 「오류태그」와 글자로 같다 — 순서까지', () => {
  assert.deepEqual([...관찰.태그들], 계약.오류태그);
  assert.equal(관찰.태그들.length, 24, '23종 + 오류없음 (설계 §3)');
});

test('태그가 실리는 영역 넷은 «영역 9종의 부분집합»이다 — 오타 하나가 축을 통째로 죽인다', () => {
  for (const a of 관찰.태그실리는영역) {
    assert.ok(관찰.영역들.includes(a), `${a} 는 영역 값록에 없다 — 그 영역엔 태그가 영원히 안 실린다`);
  }
  /* 🔴 발음·태도가 여기 «없는» 것이 규격이다(설계 §3): 23종은 텍스트 교정 축이라 그 관찰이
   *   실리면 「기타」로 뭉개진다. 「발음:*」 태그 신설은 개원 후 실측이 답한다. */
  for (const a of ['발음', '태도', '듣기', '말하기']) {
    assert.ok(!관찰.태그실리는영역.includes(a), `${a} 에 오류태그를 열었다 — 축이 다른 관찰이 교정 축에 섞인다`);
  }
});

/* ── ② 초안 읽기 — 지어낸 값이 통과하면 그 축이 사라진다 ──────────────────────── */

test('초안읽기 — 값록 밖 태그·영역은 조용히 버린다', () => {
  const d = 관찰.초안읽기('{"area":"문법","tags":["조사:주격(이/가·은/는)","지어낸태그"],"confidence":0.7}');
  assert.equal(d.area, '문법');
  assert.deepEqual(d.tags, ['조사:주격(이/가·은/는)'], '값록 밖 태그가 통과했다');
  assert.equal(d.draft_ver, 관찰.판정판, '어느 판이 뽑았나가 안 실렸다 — 되싣기 대조가 못 선다');

  assert.equal(관찰.초안읽기('{"area":"없는영역","tags":[]}').area, null);
});

test('초안읽기 — 태그가 안 실리는 영역이면 태그를 통째로 버린다(순서가 뜻이다)', () => {
  const d = 관찰.초안읽기('{"area":"발음","tags":["맞춤법:받침"],"confidence":0.9}');
  assert.equal(d.area, '발음');
  assert.deepEqual(d.tags, [], '발음 관찰에 텍스트 교정 태그가 실렸다');
});

test('초안읽기 — 상한을 넘겨 오면 앞에서 자른다', () => {
  const 셋 = '{"area":"어휘","tags":["어순","중복:불필요","누락:필수성분"],"confidence":1}';
  assert.equal(관찰.초안읽기(셋).tags.length, 관찰.태그상한);
});

test('초안읽기 — 못 읽으면 «던지지 않고» 빈 초안이다(사유를 달고)', () => {
  for (const 글 of ['', '설명만 잔뜩', '{망가진 json']) {
    const d = 관찰.초안읽기(글);
    assert.equal(d.area, null);
    assert.deepEqual(d.tags, []);
    assert.equal(d.사유, '응답형식밖', '왜 비었는지를 안 적으면 「안 뽑힌 것」과 「못 읽은 것」이 같아진다');
  }
  /* 🔑 초안 실패로 확정을 막지 않는 것이 §3 의 규격 — 강사는 언제나 비운 채 확정할 수 있다. */
  assert.equal(관찰.비었나(관찰.빈초안('키없음')), true);
});

test('초안읽기 — confidence 는 0~1 로 접고, 숫자가 아니면 null 이다', () => {
  assert.equal(관찰.초안읽기('{"area":"어휘","tags":[],"confidence":5}').confidence, 1);
  assert.equal(관찰.초안읽기('{"area":"어휘","tags":[],"confidence":-3}').confidence, 0);
  assert.equal(관찰.초안읽기('{"area":"어휘","tags":[]}').confidence, null,
    '모르는 확신도를 0 으로 적으면 「확신이 없었다」는 거짓 사실이 된다');
});

/* ── ③ 분모 규칙 — 셋째 값이 살아 있나 ────────────────────────────────────── */

test('고쳤나 — 세 값이다: 고쳤다·안 고쳤다·«분모 밖»', () => {
  const 초안 = 관찰.초안읽기('{"area":"문법","tags":["어순"],"confidence":0.5}');
  assert.equal(관찰.고쳤나(초안, { area: '문법', tags: ['어순'] }), false);
  assert.equal(관찰.고쳤나(초안, { area: '어휘', tags: [] }), true);
  /* 🔴 빈 초안 확정은 「무수정」이 아니다 — 분모 밖이다(설계 §2). 이걸 false 로 접으면
   *   AI 가 아무것도 못 뽑은 날이 전부 「강사가 그대로 통과시켰다」로 세어진다. */
  assert.equal(관찰.고쳤나(관찰.빈초안(), { area: '발음', tags: [] }), null);
  assert.equal(관찰.고쳤나(null, { area: '발음', tags: [] }), null);
});

test('고쳤나 — 태그 «순서»만 다른 것은 고친 게 아니다', () => {
  const 초안 = { area: '문법', tags: ['어순', '맞춤법:받침'] };
  assert.equal(관찰.고쳤나(초안, { area: '문법', tags: ['맞춤법:받침', '어순'] }), false,
    '순서는 모델의 버릇이지 뜻이 아니다 — 세면 무수정 통과율이 조용히 부풀려진다');
});

/* ── ④ 확정 검사 — 강사가 무엇으로 확정하든 값록 안 ──────────────────────────── */

test('확정검사 — 영역은 필수, 값록 밖은 거절', () => {
  assert.ok(관찰.확정검사(null, []).거절);
  assert.ok(관찰.확정검사('없는영역', []).거절);
  assert.deepEqual(관찰.확정검사('태도', []), { area: '태도', tags: [] });
});

test('확정검사 — 태그가 안 실리는 영역에 «다는» 것은 막고, «지우는» 것은 언제나 된다', () => {
  const r = 관찰.확정검사('발음', ['어순']);
  assert.ok(r.거절, '발음 관찰에 교정 태그가 통과했다');
  assert.equal(r.칸, 'tags');
  assert.deepEqual(관찰.확정검사('발음', []), { area: '발음', tags: [] });
});

test('확정검사 — 모르는 태그·상한 초과는 거절, 중복은 접는다', () => {
  assert.ok(관찰.확정검사('문법', ['지어낸것']).거절);
  assert.ok(관찰.확정검사('문법', ['어순', '중복:불필요', '맞춤법:받침']).거절);
  assert.deepEqual(관찰.확정검사('문법', ['어순', '어순']).tags, ['어순']);
});

test('원문검사 — 빈 줄과 상한 초과를 가른다(잘라 보내지 않는다)', () => {
  assert.ok(관찰.원문검사('   ').거절);
  assert.ok(관찰.원문검사(null).거절);
  assert.ok(관찰.원문검사('ㄱ'.repeat(관찰.원문상한 + 1)).거절, '상한을 넘겼는데 통과했다');
  assert.equal(관찰.원문검사('  받침이 샜다  ').값, '받침이 샜다');
});

/* ── ⑤ ㉯ 기각의 물리 — 프롬프트에 앱 축 데이터가 없다 ───────────────────────── */

test('🔴 지시문에 앱 축 데이터가 한 칸도 없다 — 있으면 관찰이 앱의 확증 표본이 된다', () => {
  const 글 = 관찰.지시문();
  for (const 금지 of ['퀴즈', '오답', '급수', '진도', '첨삭', 'error_tags', 'learner']) {
    assert.ok(!글.includes(금지), `지시문이 앱 축을 흘린다: ${금지}`);
  }
  /* 🔑 「구조화만」이 지시문의 전부다 — 모델이 관찰을 덧붙이면 그 행의 teacher 등급이 거짓이 된다. */
  assert.ok(/구조화/.test(글) && /새로 만들지 마라|없는 것은 뽑지 않는다/.test(글),
    '지시문이 「덧붙이지 마라」를 안 말한다');
  /* 값록을 프롬프트가 통째로 든다 — 모델이 목록 밖을 고르면 `초안읽기` 가 버리지만,
   * 애초에 안 보여 주면 버리는 비율만 늘어난다. */
  for (const a of 관찰.영역들) assert.ok(글.includes(a), `지시문에 영역 ${a} 가 없다`);
  for (const t of 관찰.태그들) assert.ok(글.includes(t), `지시문에 태그 ${t} 가 없다`);
});

test('사용자글은 강사 원문 하나뿐이다 — 학생을 안 가리킨다', () => {
  const 글 = 관찰.사용자글('받침이 샜다');
  assert.ok(글.includes('받침이 샜다'));
  assert.ok(!/uuid|learner|학번|SYNK-/.test(글), '초안 왕복이 학생을 가리킨다');
});

/* ── ⑥ 장부 — 「등재를 잊었다」가 조용한 자리들 ─────────────────────────────── */

test('물리칸 둘이 장부에 사유와 함께 있다 — c14 가 물리만 세우고 등재를 남겼던 자리', () => {
  for (const 칸 of ['observer_staff_id', 'draft_modified']) {
    assert.ok(물리칸[칸], `${칸} 이 물리칸 장부에 없다 — 계약만 읽는 소비자가 그 값을 못 본다`);
    assert.ok(물리칸[칸].length > 80, `${칸} 의 사유가 너무 짧다 — 「계약 밖인 이유」를 적는 칸이다`);
  }
  /* 🔴 계약과 물리칸에 «둘 다» 있으면 안 된다(두 곳 등재 금지 · 계약역방향 회귀와 같은 축). */
  const 필드 = JSON.stringify(계약.learning_events.필드);
  for (const 칸 of ['observer_staff_id', 'draft_modified']) {
    assert.ok(!필드.includes(칸), `${칸} 이 계약 필드에도 있다 — 두 곳에 등재됐다`);
  }
});

test('🔴 도달 래칫 — 생산자가 섰으면 소비자도 서 있다(exam.result 가 1년 굳은 그 자리)', () => {
  assert.ok(생산자['observation.noted'].파일, '생산자가 아직 «사유»다 — 화면이 섰으면 파일이어야 한다');
  assert.equal(생산자['observation.noted'].파일, 'supabase/functions/teach/index.ts',
    '서버사건이라 생산자는 앱이 아니라 함수다');
  const 도달 = 엔진도달['observation.noted'];
  assert.ok(도달 && Array.isArray(도달.도달) && 도달.도달.length > 0, '소비자가 0이다 — 래칫이 깨졌다');
});

test('서버사건이다 — 앱이 「강사가 나를 이렇게 봤다」를 선언할 수 없다', () => {
  assert.ok(서버사건.includes('observation.noted'));
  assert.ok(!앱사건.includes('observation.noted'), '앱이 관찰을 만들 수 있으면 teacher 등급이 자기 증명이 된다');
  assert.equal(사건출처('observation.noted'), 'teacher');
});

test('필수는 area·note_text 둘이고 tags 는 «아니다» — 태그 없는 관찰이 정상이다', () => {
  const 필수 = 이벤트별필수['observation.noted'];
  assert.deepEqual([...필수].sort(), ['payload.area', 'payload.note_text']);
  assert.ok(!필수.includes('payload.tags'),
    'tags 를 필수로 걸면 발음·태도 관찰이 지어낸 태그를 달고 통과한다(설계 §3)');
});

/* ── ⑦ 동의 계열 — c14 ③ 이 명문화했지만 물리 값은 안 정했던 자리 ──────────────── */

test('관찰은 동의 게이트를 «안» 지나고, 그 사실을 행이 말한다', () => {
  assert.equal(동의게이트지나나('observation.noted'), false);
  assert.ok(운영기록계열.includes('exam.result'),
    'exam.result 도 같은 계열이다 — 그 생산자가 서는 날 같은 자리에서 값을 얻는다');
  /* 🔑 값이 동의판 형식(`v18.9`)과 «다른» 것이 이 설계의 전부다 — 같은 형식이면 조용히 섞이고,
   *   섞이면 동의 아래 모이지 않은 행이 동의판을 달고 집계된다(소급 불가). */
  assert.ok(!/^v\d/.test(운영기록판), '운영기록판이 동의판 형식이다 — 섞여도 아무도 모른다');
});

test('🔴 모르는 사건은 게이트를 «지난다» — 새는 방향이 면제인 자리는 좁게 연다', () => {
  assert.equal(동의게이트지나나('goal.responded'), true, '학생 산출은 게이트를 그대로 지난다(c14 ③)');
  assert.equal(동의게이트지나나('아직.없는사건'), true,
    '모르는 사건을 면제로 접으면 계약을 늘린 사람이 여기를 안 만져도 통과한다');
});
