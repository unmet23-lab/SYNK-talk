'use strict';
/**
 * 강사 골든 판정 화면 회귀 — M2 §7-1.
 *
 * ■ 이 파일이 지키는 것 셋
 *   ① **입력을 버리지 않는다** — ①② 를 골랐을 때 편집기의 글을 화면이 조용히 지워 보내면,
 *      강사 입력이 말없이 사라지고 「저장됐다」가 돌아온다(`lib/검수확정.js:262` 의 처방).
 *      이 병은 화면에 **아무 증상이 없다** — 저장은 성공하고 라벨만 반쪽이 된다. 그래서 문다.
 *   ② **검증 규칙의 사본이 0개다** — 화면이 자기 판단을 새로 적으면 서버와 갈리고, 갈린 날
 *      강사는 화면이 통과시킨 것을 서버가 400 으로 되받는 것을 본다.
 *   ③ **막힘을 분모에서 빼지 않는다** — 빼면 「이번 주 끝」이 거짓이 된다(설계 §4).
 *
 * ⚠ `src/강사화면.js` 는 react-native 를 끌고 온다 — `tests/lib/화면세우기.js` 를 먼저
 *   불러 치환을 켠 뒤에 require 한다(`검수화면.test.js` 와 같은 순서).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 코드만, 코드만픽스처 } = require('./lib/소스검사.js');
const { ROOT } = require('./lib/화면세우기.js'); // ← 먼저 불러 react-native 치환을 켠다
const {
  큐상태, 편집초기값, 보낼것, 막는이유, 다음열림, 진행,
} = require(path.join(ROOT, 'src', '강사화면.js'));
const { VERDICT, 텍스트내는판정, 골든판정요청 } = require(path.join(ROOT, 'lib', '검수확정.js'));

const 항목 = (덮을것) => ({
  correction_id: '11111111-1111-4111-8111-111111111111',
  submission_id: '22222222-2222-4222-8222-222222222222',
  transcript: '저는 학교에 가요',
  transcript_confirmed: false,
  ai_corrected_text: '저는 학교에 갑니다',
  ai_error_tags: ['어미:종결'],
  status: 큐상태.열림,
  ...덮을것,
});

/* ── 편집 → 요청 ─────────────────────────────────────────────────────────── */

test('빈 편집 상태에는 고른 판정이 없다 — 화면이 기본값을 골라 주지 않는다', () => {
  /* 기본값을 주면 강사가 «안 고른 채» 저장을 누를 수 있고, 그 라벨은 사람이 판단한 것이
     아니라 화면이 넣은 것이다. 골든셋 전체가 그 한 줄로 오염된다. */
  assert.equal(편집초기값().verdict, '');
  assert.deepEqual(편집초기값().태그, []);
});

test('🔴 ①② 를 골라도 편집기의 글을 **버리지 않는다** — 조용히 지우면 입력이 사라진다', () => {
  const 요청 = 보낼것({
    항목: 항목(), verdict: VERDICT.AI,
    고침: '저는 학교에 다닙니다', 사유: '', 태그: ['어순'], 출처: '',
  });
  assert.equal(요청.corrected_text, '저는 학교에 다닙니다',
    '①② 에서 고친 문장을 화면이 지웠다 — 강사 입력이 말없이 사라지고 「저장됐다」가 돌아온다');
  assert.deepEqual(요청.error_tags, ['어순'],
    '①② 에서 태그를 화면이 지웠다 — 위와 같은 병이다');
});

test('그 버리지 않은 값이 **거절로 이어진다** — 화면이 이유를 말할 수 있는 근거', () => {
  /* ①에 붙은 짝 검사다. 버리지 않기만 하고 거절이 안 되면 반쪽 라벨이 그대로 저장된다. */
  const 요청 = 보낼것({
    항목: 항목(), verdict: VERDICT.AI, 고침: '뭔가 썼다', 사유: '', 태그: [], 출처: '',
  });
  assert.match(String(막는이유(요청)), /고친 문장을 싣지 않습니다/u);
});

test('빈 문자열은 `null` 로 접는다 — 저장된 행에 빈 문자열이 안 남는다', () => {
  const 요청 = 보낼것({ 항목: 항목(), verdict: VERDICT.원문, 고침: '  ', 사유: '', 태그: [], 출처: '  ' });
  assert.equal(요청.corrected_text, null);
  assert.equal(요청.verdict_reason, null);
  assert.equal(요청.l1_source_phrase, null);
});

test('🔴 `rubric_scores`·`transcript_at_review` 를 **안 싣는다**', () => {
  /* rubric = 축 어휘 정본이 0이라(계약 JSON 은 이름만 싣는다) 화면이 축을 지으면 그것이
     사실상 정본이 되고, 진짜 루브릭이 서는 날 옛 행이 다른 축 체계로 굳은 채 섞인다.
     transcript_at_review = 서버가 판정 시점 전사를 직접 박는다(`teach:426`) — 앱이 보내면
     화면에 없던 문자열이 라벨의 근거로 굳을 수 있다. 둘 다 소급이 안 된다. */
  const 요청 = 보낼것({ 항목: 항목(), ...편집초기값(), verdict: VERDICT.AI });
  assert.ok(!('rubric_scores' in 요청), '`rubric_scores` 를 싣는다 — 축 어휘 정본이 아직 없다');
  assert.ok(!('transcript_at_review' in 요청), '`transcript_at_review` 를 앱이 보낸다');
});

test('항목이 없어도 죽지 않는다 — 큐가 빈 주가 정상이다', () => {
  const 요청 = 보낼것({ 항목: null, ...편집초기값() });
  assert.equal(요청.reviewed_correction_id, '');
});

/* ── 막는 이유 = 서버 검증기 그 자체 ──────────────────────────────────────── */

test('판정을 안 고르면 저장이 잠긴다', () => {
  assert.match(String(막는이유(보낼것({ 항목: 항목(), ...편집초기값() }))), /골라 주세요/u);
});

test('🔴 막는 문구는 **서버 검증기가 낸 그 문장**이다 — 사본이 0개다', () => {
  /* 화면이 자기 문구를 따로 적으면 서버와 갈린다. 갈린 쪽은 조용하다 — 화면은 통과시키고
     서버가 400 을 내는 날에만 드러나고, 그때 강사는 무엇이 틀렸는지 모른다.
     🔑 이 검사는 두 층을 **같은 입력**으로 돌려 문구가 글자까지 같은지 본다. */
  const 갈래들 = [
    { verdict: 텍스트내는판정, 고침: '', 사유: '', 태그: [], 출처: '' },       // ③ 고침 없음
    { verdict: 텍스트내는판정, 고침: '고쳤다', 사유: '', 태그: [], 출처: '' },  // ③ 사유 없음
    { verdict: VERDICT.원문, 고침: '', 사유: '', 태그: ['어순'], 출처: '' },    // ① 태그 실림
    { verdict: VERDICT.AI, 고침: '', 사유: '', 태그: [], 출처: '몽골어' },      // ② 출처 실림
  ];
  for (const 편집 of 갈래들) {
    const 요청 = 보낼것({ 항목: 항목(), ...편집 });
    const 서버 = 골든판정요청(요청).이유;
    assert.ok(서버, `이 갈래를 서버가 통과시킨다 — 검사 자체가 뜻이 없다: ${JSON.stringify(편집)}`);
    assert.equal(막는이유(요청), 서버, '화면 문구가 서버 문구와 다르다 — 사본이 생겼다');
  }
});

test('제대로 채운 ③ 과 ①② 는 통과한다 — 「버그가 있을 것을 요구하는 회귀」가 아니다', () => {
  const 셋 = [
    { verdict: 텍스트내는판정, 고침: '저는 학교에 갑니다', 사유: '종결어미가 반말이었다', 태그: ['어미:종결'], 출처: '' },
    { verdict: VERDICT.원문, 고침: '', 사유: '', 태그: [], 출처: '' },
    { verdict: VERDICT.AI, 고침: '', 사유: '', 태그: [], 출처: '' },
  ];
  for (const 편집 of 셋) {
    assert.equal(막는이유(보낼것({ 항목: 항목(), ...편집 })), null, JSON.stringify(편집));
  }
});

/* ── 큐 진행 ──────────────────────────────────────────────────────────────── */

test('다음 판정 대상은 **열린 것만** — 막힘·판정됨은 건너뛴다', () => {
  const 목록 = [
    항목({ correction_id: 'a', status: 큐상태.판정됨 }),
    항목({ correction_id: 'b', status: 큐상태.막힘 }),
    항목({ correction_id: 'c', status: 큐상태.열림 }),
  ];
  assert.equal(다음열림(목록, null).correction_id, 'c');
});

test('방금 판정한 것은 건너뛴다 — 안 그러면 같은 카드에 갇힌다', () => {
  const 목록 = [항목({ correction_id: 'c' }), 항목({ correction_id: 'd' })];
  assert.equal(다음열림(목록, 'c').correction_id, 'd');
  assert.equal(다음열림([항목({ correction_id: 'c' })], 'c'), null);
});

test('🔴 막힘은 **분모에 남는다** — 빼면 「이번 주 끝」이 거짓이 된다', () => {
  /* 「5건 중 4건」이 「4건 중 4건」이 되면 강사는 막힌 한 건이 있었다는 사실 자체를 모른 채
     주를 닫는다. 그 한 건은 다음 주에 다시 안 뜬다(주 시드가 갈린다). */
  const 셈 = 진행([
    항목({ correction_id: 'a', status: 큐상태.판정됨 }),
    항목({ correction_id: 'b', status: 큐상태.막힘 }),
    항목({ correction_id: 'c', status: 큐상태.열림 }),
  ]);
  assert.deepEqual(셈, { 전체: 3, 남음: 1, 판정됨: 1, 막힘: 1 });
});

test('목록이 없어도 죽지 않는다', () => {
  assert.deepEqual(진행(null), { 전체: 0, 남음: 0, 판정됨: 0, 막힘: 0 });
  assert.equal(다음열림(null, null), null);
});

/* ── 없앨 수 없는 사본을 기계에 문다 ──────────────────────────────────────── */

test('🔴 큐 상태 3값이 `functions/teach` 의 리터럴과 같다', () => {
  /* 서버가 이 어휘를 내주는 경로가 없어 사본을 피할 수 없다(`검수API` 의 폐기사유와 같은 자리).
     갈리면 증상은 오류가 아니라 **모든 카드가 「막힘」으로 보이는 것**이다 — 강사는 이번 주가
     통째로 막힌 줄 알고 닫는다. */
  const 서버소스 = fs.readFileSync(
    path.join(ROOT, 'supabase', 'functions', 'teach', 'index.ts'), 'utf8',
  );
  const m = 서버소스.match(/const 상태 = \{([^}]+)\}/u);
  assert.ok(m, '`teach` 에서 상태 리터럴을 못 찾았다 — 검사가 눈이 멀었다');
  const 서버값 = [...m[1].matchAll(/'([^']+)'/gu)].map((x) => x[1]);
  assert.deepEqual(Object.values(큐상태), 서버값, '큐 상태 어휘가 서버와 갈렸다');
});

/* ── 소스 검사 ────────────────────────────────────────────────────────────── */

const 화면소스 = 코드만(fs.readFileSync(path.join(ROOT, 'src', '강사화면.js'), 'utf8'));
const API소스 = 코드만(fs.readFileSync(path.join(ROOT, 'src', '강사API.js'), 'utf8'));

test('탐지력 픽스처 — 주석 제거기가 「설명 속의 코드」를 실제로 지운다', () => {
  /* 이 두 파일의 주석은 `rubric_scores`·`fetch`·`week` 를 여러 번 **설명**한다. 제거기가
     놓치면 아래 검사들이 설명을 코드로 읽고 영원히 초록이 된다. */
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석을 안 지운다 — 아래 검사가 눈이 먼다');
});

test('🔴 코드층에도 `rubric_scores` 가 없다 — 반환 키 검사와 짝이다', () => {
  /* 위 반환 키 검사는 `보낼것` 만 본다. 화면이 다른 자리에서 요청에 얹으면 그 검사는 초록이다. */
  assert.ok(!/rubric_scores/u.test(화면소스), '화면 코드가 `rubric_scores` 를 만진다');
  assert.ok(!/rubric_scores/u.test(API소스), 'API 코드가 `rubric_scores` 를 만진다');
});

test('🔴 주(week)를 서버에 **안 보낸다** — 강사가 주를 고르면 무작위가 깨진다', () => {
  /* 표본을 「골라」 볼 수 있게 되는 순간 승률이 「AI 가 틀린 것만 모은」 반쪽 채점표가 된다
     (설계 §4 · `teach:229` 가 서버에서 같은 판정을 냈다). */
  assert.ok(!/week=|[?&]week|week:/u.test(API소스), 'API 가 주를 파라미터로 싣는다');
  assert.match(API소스, /부르기\('teach\/gold\/queue', 토큰\)/u,
    '큐 호출에 인자가 붙었다 — 주·필터가 실린 자리인지 본다');
});

test('🔑 통로가 하나다 — 자체 `fetch`·주소·키가 없다', () => {
  /* 봉투 해석·계약판 헤더·401 재갱신·네트워크 구분이 두 벌이 되면 갈라진 쪽이 조용하다
     (`검수API` 머리말의 실측). */
  assert.ok(!/fetch\(|https?:\/\//u.test(API소스), '`사건통로` 밖에서 직접 부른다');
  assert.ok(!/fetch\(/u.test(화면소스), '화면이 직접 `fetch` 한다');
});

test('🔴 판정 저장은 서버 200 **뒤에** 상태를 바꾼다 — 낙관적 반영 금지', () => {
  /* 골든 행은 append-only 고 재판정은 `ALREADY_JUDGED` 로 거절된다. 미리 「판정됨」으로
     그리면 실패한 건이 끝난 것처럼 보이고, 그 항목은 다음 주에 다시 안 뜬다. */
  assert.match(화면소스, /await 판정하기\([\s\S]{0,400}?set목록\(/u,
    '`판정하기` 응답 전에 목록 상태를 바꾼다');
});

test('🔑 저장 버튼이 막는 이유를 조건에 든다 — 눌러야 거절을 아는 일이 없다', () => {
  assert.match(화면소스, /disabled=\{!!막힘문구 \|\| 보내는중\}/u,
    '막는 이유가 있는데 저장이 열려 있다');
});
