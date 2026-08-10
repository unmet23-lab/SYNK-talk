/* 골든 판정의 순수 규칙 — `lib/검수확정.js` 의 `골든판정요청`·`골든정합` (M2 설계 §3).
 *
 * ■ 무엇을 지키나
 *   ① **어휘가 DB CHECK 와 같은가** — verdict 는 사람이 고르는 값이라 사본을 피할 수 없다.
 *      없앨 수 없는 사본은 기계에 물린다(`검수확정.test.js` ②와 같은 판정).
 *   ② **①② 에 텍스트를 안 싣는가** — 이 파일의 급소. 실으면 학생의 **최신 1건 답장 화면**을
 *      옛 문장의 확인 카드가 점거하고, ① 에는 「선생님이 고쳐 줬어요」가 안 고친 행 위에 찍힌다.
 *      조용히 버리지 않고 **거절**하는 것까지가 처방이다(강사의 입력이 말없이 사라지지 않는다).
 *   ③ **③ 의 사유가 필수인가** — AI 가 틀렸다는 판정은 왜 틀렸는지가 곧 라벨의 값이다.
 *   ④ **정합이 부호를 지키는가** — ③ 인데 AI 교정과 같은 문장이면 그건 ② 다. 그대로 받으면
 *      성적표에서 「AI 가 틀렸다」로 세어져 **승률이 거짓으로 내려간다**(부호가 뒤집히는 오염).
 *   ⑤ **서버가 아무것도 자동 기입하지 않는가** — 빈 사유는 `null` 이지 「사유 없음」이 아니다
 *      (검수 계약 :277 「사람이 적는 칸」 그대로).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const 뿌리 = path.resolve(__dirname, '..');
const {
  VERDICT, 텍스트내는판정, 골든판정요청, 골든정합,
} = require(path.join(뿌리, 'lib', '검수확정.js'));

const AI행 = '11111111-2222-3333-4444-555555555555';
const 기본 = (덧 = {}) => ({ reviewed_correction_id: AI행, verdict: VERDICT.AI, ...덧 });
const 통과 = (본문) => {
  const r = 골든판정요청(본문);
  assert.equal(r.이유, null, `거절됐다: ${r.이유}`);
  return r.값;
};
const 거절 = (본문, 칸) => {
  const r = 골든판정요청(본문);
  assert.notEqual(r.이유, null, '통과했다 — 거절돼야 한다');
  if (칸) assert.equal(r.칸, 칸);
  return r;
};

/* ── ① 어휘 = DB CHECK ────────────────────────────────────────────── */

test('① verdict 세 값이 마이그레이션의 CHECK 와 글자까지 같다', () => {
  const 조각 = path.join(뿌리, 'supabase', 'migrations', '20260806150000_engine_c6.sql');
  assert.ok(fs.existsSync(조각), '조각이 없다 — 이 검사가 통째로 미실행이다');
  const sql = fs.readFileSync(조각, 'utf8');
  const m = /corrections_verdict_c6 check \(verdict is null or verdict in \(([\s\S]*?)\)\)/.exec(sql);
  assert.ok(m, 'CHECK 정의를 못 찾았다 — 이름이 바뀌었으면 이 검사부터 고친다');
  const DB어휘 = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(Object.values(VERDICT).slice().sort(), DB어휘);
});

test('① 텍스트내는판정 = 「고칠 곳이 있다」 — 텍스트를 싣는 갈래는 하나뿐이다', () => {
  assert.equal(텍스트내는판정, VERDICT.수정);
});

test('① 어휘 밖의 verdict 는 거절', () => {
  거절(기본({ verdict: '맞다' }), 'verdict');
  거절(기본({ verdict: '' }), 'verdict');
  거절(기본({ verdict: null }), 'verdict');
  거절(기본({ verdict: 3 }), 'verdict');
});

test('① reviewed_correction_id 는 uuid 필수 (평가 대상이 없는 라벨은 뜻이 없다)', () => {
  거절({ verdict: VERDICT.AI }, 'reviewed_correction_id');
  거절(기본({ reviewed_correction_id: 'c123' }), 'reviewed_correction_id');
});

/* ── ② ①② 에는 텍스트를 안 싣는다 (급소) ──────────────────────────── */

for (const v of [VERDICT.AI, VERDICT.원문]) {
  test(`② 「${v}」 에 corrected_text 를 실으면 거절 — 조용히 버리지 않는다`, () => {
    거절(기본({ verdict: v, corrected_text: '밥을 먹었습니다' }), 'corrected_text');
  });
  test(`② 「${v}」 에 error_tags 를 실으면 거절`, () => {
    거절(기본({ verdict: v, error_tags: ['조사'] }), 'error_tags');
  });
  test(`② 「${v}」 에 rubric_scores·l1_source_phrase 를 실으면 거절`, () => {
    거절(기본({ verdict: v, rubric_scores: { 문법: 3 } }), 'rubric_scores');
    거절(기본({ verdict: v, l1_source_phrase: 'би' }), 'l1_source_phrase');
  });
  test(`② 「${v}」 는 저장 모양이 «빈 값»이다 — corrected_text=null · error_tags=[]`, () => {
    const 값 = 통과(기본({ verdict: v }));
    assert.equal(값.corrected_text, null);
    /* 🔴 `error_tags` 는 not null default '{}'(c6 :466) — null 이 아니라 빈 배열이어야
     *   DB 가 받고, 빈 배열은 학생 조회의 빈 카드 필터를 통과 못 한다(설계대로). */
    assert.deepEqual(값.error_tags, []);
    assert.equal(값.rubric_scores, null);
    assert.equal(값.l1_source_phrase, null);
  });
  test(`② 「${v}」 는 사유가 선택이다 (v1 — 기입률 실측이 쌓이면 게이트를 판정한다)`, () => {
    assert.equal(통과(기본({ verdict: v })).verdict_reason, null);
    assert.equal(통과(기본({ verdict: v, verdict_reason: '자연스럽다' })).verdict_reason, '자연스럽다');
  });
}

/* ── ③ ③ 의 필수 칸 ──────────────────────────────────────────────── */

const 수정 = (덧 = {}) => 기본({
  verdict: VERDICT.수정, corrected_text: '밥을 먹었어요', verdict_reason: '높임이 과하다', ...덧,
});

test('③ 고침 문장이 없으면 거절 (빈 문자열·공백만도)', () => {
  거절(수정({ corrected_text: '' }), 'corrected_text');
  거절(수정({ corrected_text: '   ' }), 'corrected_text');
  거절({ reviewed_correction_id: AI행, verdict: VERDICT.수정, verdict_reason: 'x' }, 'corrected_text');
});

test('③ 사유가 없으면 거절 — 왜 틀렸는지가 곧 라벨의 값이다', () => {
  거절(수정({ verdict_reason: '' }), 'verdict_reason');
  거절(수정({ verdict_reason: '  ' }), 'verdict_reason');
});

test('③ 태그·점수·모국어 출처는 선택이고, 실으면 그대로 실린다', () => {
  const 값 = 통과(수정({ error_tags: ['조사', ' 어미 ', ''], rubric_scores: { 문법: 3 }, l1_source_phrase: 'би' }));
  assert.deepEqual(값.error_tags, ['조사', '어미']); // trim + 빈 값 제거 (AI 라벨과 같은 수준)
  assert.deepEqual(값.rubric_scores, { 문법: 3 });
  assert.equal(값.l1_source_phrase, 'би');
});

test('③ 텍스트는 NFC 로 굳어 나온다 — 조합형 입력이 라벨을 뒤집지 못한다', () => {
  /* 🔑 NFD 를 소스에 «글자로» 박지 않는다 — 편집기·git 이 파일을 NFC 로 정규화하면
   *   픽스처가 조용히 NFC 가 되고 이 검사는 초록인 채 아무것도 안 재게 된다. */
  const 조합형 = '\u1107\u1161\u11B8을 먹었어요'; // 「밥을 먹었어요」의 조합형
  assert.notEqual(조합형, '밥을 먹었어요', '픽스처가 NFD 가 아니면 이 검사는 아무것도 안 잰다');
  const 값 = 통과(수정({ corrected_text: 조합형 }));
  assert.equal(값.corrected_text, 값.corrected_text.normalize('NFC'));
  assert.equal(값.corrected_text, '밥을 먹었어요');
});

/* ── ④ 정합 (부호를 지킨다) ───────────────────────────────────────── */

test('④ ③ 인데 AI 교정과 같은 문장 → 어긋남 (그건 ② 다 · 승률이 거짓으로 내려간다)', () => {
  const 이유 = 골든정합({
    verdict: VERDICT.수정, corrected_text: '밥을 먹었습니다',
    ai교정문: '밥을 먹었습니다', 전사: '밥을 먹었어',
  });
  assert.match(String(이유), /AI 교정과 같은 문장/);
});

test('④ ③ 인데 원문 전사와 같은 문장 → 어긋남 (그건 ① 이다 · 과교정률이 낮게 나온다)', () => {
  const 이유 = 골든정합({
    verdict: VERDICT.수정, corrected_text: '밥을 먹었어',
    ai교정문: '밥을 먹었습니다', 전사: '밥을 먹었어',
  });
  assert.match(String(이유), /학생이 말한 문장/);
});

test('④ NFC 로 비교한다 — 조합형/완성형 차이로 어긋남을 놓치지 않는다', () => {
  const 이유 = 골든정합({
    verdict: VERDICT.수정, corrected_text: '밥을 먹었습니다'.normalize('NFD'),
    ai교정문: '밥을 먹었습니다', 전사: '밥을 먹었어',
  });
  assert.match(String(이유), /AI 교정과 같은 문장/);
});

test('④ 진짜 새 교정이면 정합 통과', () => {
  assert.equal(골든정합({
    verdict: VERDICT.수정, corrected_text: '밥을 먹었어요',
    ai교정문: '밥을 먹었습니다', 전사: '밥을 먹었어',
  }), null);
});

test('④ ①② 는 정합 검사 대상이 아니다 (텍스트를 아예 안 싣는다)', () => {
  for (const v of [VERDICT.AI, VERDICT.원문]) {
    assert.equal(골든정합({ verdict: v, corrected_text: null, ai교정문: '무엇', 전사: '무엇' }), null);
  }
});

/* ── ⑤ 서버가 자동 기입하지 않는다 ────────────────────────────────── */

test('⑤ 빈 사유는 null 이다 — 「사유 없음」 같은 기계 문자열을 만들지 않는다', () => {
  const 값 = 통과(기본({ verdict: VERDICT.AI, verdict_reason: '   ' }));
  assert.equal(값.verdict_reason, null);
});

test('⑤ 반환 모양에 없는 칸을 만들지 않는다 — 저장 열이 곧 이 목록이다', () => {
  const 값 = 통과(수정());
  assert.deepEqual(Object.keys(값).sort(), [
    'corrected_text', 'error_tags', 'l1_source_phrase',
    'reviewed_correction_id', 'rubric_scores', 'verdict', 'verdict_reason',
  ]);
});

test('⑤ 모양이 틀린 입력은 통째로 거절한다(본문이 객체가 아니어도 안 죽는다)', () => {
  for (const 나쁨 of [null, undefined, '문자열', 42, []]) {
    assert.notEqual(골든판정요청(나쁨).이유, null, `${JSON.stringify(나쁨)} 이 통과했다`);
  }
  거절(기본({ error_tags: '조사' }), 'error_tags');
  거절(수정({ rubric_scores: [1, 2] }), 'rubric_scores');
  거절(기본({ verdict_reason: 5 }), 'verdict_reason');
});
