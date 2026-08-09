'use strict';
/**
 * 검수 화면 판정 회귀 — **틀려도 조용한 자리**만 잰다.
 *
 * ■ 왜 렌더 회귀로 안 되나 (`tests/화면렌더.test.js` ⑨ 와 층이 다르다)
 *   그 통로는 **첫 렌더**만 본다 — 큐 조회가 `useEffect` 라 항목 카드가 아예 안 선다.
 *   그런데 이 화면에서 실제로 위험한 것은 그려지는 모양이 아니라 **항목을 열 때 채우는 값**이다.
 *   잠긴 버튼·틀린 문턱 표시는 검수자 눈앞에서 바로 드러나지만, 초기값은 그럴듯하게 틀린다.
 *
 * ■ 🔴 이 파일이 지키는 한 문장
 *   재검수(`Z`)에서 앞 검수자가 고쳐 둔 `transcript_verified` 를 기계 전사(`transcript`)로
 *   덮으면, 화면은 멀쩡한 채 **확정하는 순간 앞 판정이 소리 없이 되돌려진다**(발주 §3 UX ③ 🔴 ·
 *   그 teacher 행의 verdict 가 근거를 잃는다). 그 자리는 회귀 말고 잡을 것이 없다.
 *
 * ⚠ `src/검수화면.js` 는 react-native 를 끌고 온다 — 그래서 `tests/lib/화면세우기.js` 를 먼저
 *   불러 그 치환을 켜 두고 모듈을 연다(그 통로가 `Module._load` 를 갈아 끼운다).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ROOT } = require('./lib/화면세우기.js'); // ← 먼저 불러 react-native 치환을 켠다
const { 편집초기값, 여는값 } = require(path.join(ROOT, 'src', '검수화면.js'));

const 항목 = (덮을것) => ({
  submission_id: 's1',
  transcript: '기계가 들은 말',
  transcript_verified: null,
  ai_corrected_text: 'AI 가 고친 말',
  ai_explanation: 'Тайлбар',
  ai_error_tags: ['조사:주격(이/가·은/는)'],
  ...덮을것,
});

test('처음 여는 항목은 기계 전사에서 시작한다', () => {
  assert.equal(편집초기값(항목()).검증전사, '기계가 들은 말');
});

test('🔴 이미 검증된 전사가 있으면 그것이 이긴다 — 재검수가 앞 판정을 되돌리면 안 된다', () => {
  const v = 편집초기값(항목({ transcript_verified: '사람이 고친 말' }));
  assert.equal(v.검증전사, '사람이 고친 말');
});

test('빈 문자열은 「없음」이 아니다 — 앞 검수자가 지운 것도 판정이다', () => {
  /* `??` 여야 하고 `||` 면 안 된다. `||` 로 적으면 앞 검수자가 비워 둔 칸이 기계 전사로
     되살아나는데, 그건 「고쳐 놓은 것을 되돌린다」의 가장 조용한 형태다. */
  const v = 편집초기값(항목({ transcript_verified: '' }));
  assert.equal(v.검증전사, '');
});

test('교정문은 AI 교정문에서 시작한다 (빈 칸에서 시작하면 매번 다시 친다)', () => {
  assert.equal(편집초기값(항목()).교정문, 'AI 가 고친 말');
});

test('AI 교정이 없으면 빈 칸이다 — 기계 전사를 교정문에 흘려 넣지 않는다', () => {
  /* 흘려 넣으면 아무것도 안 고친 확정이 서버에서 `원문이 이미 맞다` 로 파생된다 —
     사람이 판정하지 않은 라벨이 정답으로 쌓인다. */
  const v = 편집초기값(항목({ ai_corrected_text: null }));
  assert.equal(v.교정문, '');
});

test('AI 태그는 사본을 준다 — 화면에서 토글해도 원 항목이 안 바뀐다', () => {
  const it = 항목();
  const v = 편집초기값(it);
  v.태그.push('어순');
  assert.deepEqual(it.ai_error_tags, ['조사:주격(이/가·은/는)'], '원 항목이 오염됐다');
});

test('태그가 배열이 아니면 빈 배열이다', () => {
  assert.deepEqual(편집초기값(항목({ ai_error_tags: null })).태그, []);
  assert.deepEqual(편집초기값(항목({ ai_error_tags: '조사' })).태그, []);
});

test('항목이 없어도 죽지 않는다 — 큐가 빈 날이 정상이다', () => {
  assert.deepEqual(편집초기값(null), { 검증전사: '', 교정문: '', 해설: '', 태그: [] });
  assert.deepEqual(편집초기값(undefined).태그, []);
});

/* ── 재검수(`Z`) — 여는 값이 어디서 오는가 ──────────────────────────── */

const 보낸값 = () => ({
  검증전사: '사람이 고친 전사',
  교정문: '사람이 고친 교정문',
  해설: 'Хүний тайлбар',
  태그: ['어순'],
  승격: true,
});

test('첫 검수는 항목에서 파생한다', () => {
  const v = 여는값(항목(), null);
  assert.equal(v.검증전사, '기계가 들은 말');
  assert.equal(v.승격, false, '승격 기본값은 「안 함」이다');
});

test('🔴 재검수는 **보낸 값**에서 잇는다 — 항목에서 다시 파생하면 앞 판정이 뒤집힌다', () => {
  /* 항목 객체는 큐를 읽던 시점의 사본이라 서버가 방금 갱신한 `transcript_verified` 를 모른다.
     여기서 항목을 보면 「사람이 고친 전사」가 「기계가 들은 말」로 되돌아가고, 그대로 확정하면
     앞 teacher 행의 verdict 가 근거를 잃는다(UX ③ 🔴). 다시 조회할 길도 없다(큐 밖 = NOT_FOUND). */
  const v = 여는값(항목(), { 보낸값: 보낸값() });
  assert.equal(v.검증전사, '사람이 고친 전사');
  assert.equal(v.교정문, '사람이 고친 교정문');
  assert.deepEqual(v.태그, ['어순']);
  assert.equal(v.승격, true, '승격 의사도 이어야 한다 — 다시 안 물어보는 값이다');
});

test('재검수가 보낸 값의 태그를 사본으로 준다 — 되돌린 화면이 원 기록을 못 고친다', () => {
  const 쥔것 = 보낸값();
  const v = 여는값(항목(), { 보낸값: 쥔것 });
  v.태그.push('어휘:없는말');
  assert.deepEqual(쥔것.태그, ['어순'], '직전 기록이 화면 편집에 오염됐다');
});

test('보낸 값이 없는 재검수는 항목에서 파생하되 승격은 안 물려받는다', () => {
  const v = 여는값(항목({ transcript_verified: '앞서 고친 것' }), { 보낸값: null });
  assert.equal(v.검증전사, '앞서 고친 것');
  assert.equal(v.승격, false);
});
