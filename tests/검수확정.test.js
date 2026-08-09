/* 검수 확정 순수 규칙 — `lib/검수확정.js` (계약 §5).
 *
 * ■ 무엇을 지키나
 *   ① **verdict 판정 순서** — 이 파일의 급소. 순서를 바꾸면 두 오답이 각각 **조용히** 성립하고,
 *      틀린 라벨은 2년 뒤 그 라벨로 학습한 모델에서만 드러난다(그때는 어느 행인지 못 가린다).
 *   ② **verdict 세 값이 DB CHECK 와 같은가** — 코드가 계산해 넣는 값이라 사본을 피할 수 없다.
 *      없앨 수 없는 사본은 기계에 물린다(`tests/폐기사유.test.js` 와 같은 판정).
 *   ③ **청취 문턱** — 재료가 없을 때 「하한 3초」로 접히는 것이 **사실대로 드러나는가**.
 *      오늘 `stt_segments` 생산자가 0이라 그 경로가 유일하게 도는 경로다(미측정≠통과).
 *   ④ **요청 검증** — 빈 전사·빈 교정문이 「원문이 이미 맞다」로 접히는 자리를 막는가.
 *   ⑤ **폐기 어휘 파서** — CHECK 정의에서 상태값을 안 섞어 뽑는가.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const 뿌리 = path.resolve(__dirname, '..');
const {
  VERDICT, 하한ms, 저신뢰문턱, 정규화, 판정, 청취문턱, 폐기어휘, 승인요청, 폐기요청,
} = require(path.join(뿌리, 'lib', '검수확정.js'));

/* ── ① verdict 판정 순서 ──────────────────────────────────────────── */

const 셋 = (검증전사, ai교정문, 최종교정문) => 판정({ 검증전사, ai교정문, 최종교정문 });

test('①「원문이 이미 맞다」 — 최종 교정문이 학생이 말한 그대로다', () => {
  assert.equal(셋('밥을 먹었어요', '밥을 먹었습니다', '밥을 먹었어요'), VERDICT.원문);
});

test('②「AI 교정이 맞다」 — 최종이 AI 교정과 같다', () => {
  assert.equal(셋('밥를 먹었어요', '밥을 먹었어요', '밥을 먹었어요'), VERDICT.AI);
});

test('③「고칠 곳이 있다」 — 셋이 다 다르다', () => {
  assert.equal(셋('밥를 먹었어요', '밥을 먹었습니다', '밥을 먹었어요'), VERDICT.수정);
});

test('🔴 순서가 급소다 — AI 가 원문을 그대로 반환한 정상 문장은 「원문이 이미 맞다」다', () => {
  /* 학생이 처음부터 맞게 말했고 AI 도 손댈 것이 없어 같은 문장을 돌려준 경우.
   * 검수자는 아무것도 안 고쳤다 — 「변경 여부」로 재면 `AI 교정이 맞다` 로 접힌다.
   * 그건 「AI 가 고쳐 준 것이 맞다」는 뜻이라, 고칠 게 없었던 발화가 **교정 사례**로 남는다. */
  assert.equal(셋('밥을 먹었어요', '밥을 먹었어요', '밥을 먹었어요'), VERDICT.원문,
    'AI 교정과 원문이 같을 때 ②가 먼저 걸리면 안 된다 — ①이 먼저다');
});

test('🔴 순서가 급소다 — 사람이 AI 교정을 원문으로 되돌린 것은 「원문이 이미 맞다」다', () => {
  /* AI 가 멀쩡한 문장을 잘못 「고쳐」 놓았고 검수자가 되돌렸다. 편집이 **있었으므로**
   * 두 칸 비교로는 `고칠 곳이 있다` 가 된다 — 그건 **학생이 틀렸다**는 라벨인데
   * 사실은 **AI 가 틀렸다**. 라벨의 주어가 뒤집히는 자리다. */
  assert.equal(셋('학교에 갔어요', '학교를 갔어요', '학교에 갔어요'), VERDICT.원문,
    '되돌린 편집이 「고칠 곳이 있다」로 적히면 AI 오류가 학생 오류로 학습된다');
});

test('NFC 정규화 — 조합형으로 온 같은 글자를 다르다고 하지 않는다', () => {
  const 완성형 = '학교';
  const 조합형 = 완성형.normalize('NFD');
  assert.notEqual(조합형, 완성형, '이 환경에서 NFD 가 NFC 와 같다면 이 검사는 아무것도 안 잰다');
  assert.equal(셋(조합형, 'AI 문장', 완성형), VERDICT.원문,
    'NFD 로 온 전사를 못 접는다 — 아무것도 안 고친 확정이 「고칠 곳이 있다」로 적힌다');
});

test('앞뒤 공백은 접고 그 이상은 안 접는다', () => {
  assert.equal(셋('  밥을 먹었어요 ', 'x', '밥을 먹었어요'), VERDICT.원문);
  /* 가운데 공백을 접으면 「다른 것을 같다고」 판정하기 시작한다 — 라벨이 화면과 갈린다. */
  assert.equal(셋('밥을  먹었어요', 'x', '밥을 먹었어요'), VERDICT.수정,
    '가운데 공백까지 접는다 — 사람이 화면에서 본 차이가 라벨에서 사라진다');
});

/* ── ② verdict 세 값이 DB CHECK 와 같은가 ────────────────────────── */

test('🔴 verdict 세 값이 DB CHECK 와 정확히 같다 (사본이 낡으면 insert 가 죽는다)', () => {
  const SQL = fs.readFileSync(path.join(뿌리, 'supabase', 'L0_스키마.sql'), 'utf8');
  /* 살아 있는 정의는 **마지막** 것이다(합본은 조각을 이어붙인 것이라 옛 판이 위에 남아 있다). */
  const 전부 = [...SQL.matchAll(/add constraint corrections_verdict_c\d+ check[\s\S]*?\)\);/gu)];
  assert.ok(전부.length, 'corrections_verdict_c* CHECK 를 합본에서 못 찾았다 — 이 대조가 통째로 미실행이다');
  const 값 = [...전부[전부.length - 1][0].matchAll(/'([^']+)'/gu)].map((m) => m[1]);
  assert.deepEqual(값.slice().sort(), Object.values(VERDICT).slice().sort(),
    `DB 가 받는 verdict 와 코드가 내는 verdict 가 갈렸다.\n  DB=${값.join('·')}\n  코드=${Object.values(VERDICT).join('·')}\n`
    + '  → 갈린 채로 배포하면 승인이 전부 23514 로 죽는다(증상은 500 이라 원인이 안 보인다)');
});

/* ── ③ 청취 문턱 ─────────────────────────────────────────────────── */

test('재료가 없으면 하한 3초로 접히고, **그 사실이 드러난다**', () => {
  for (const 없음 of [null, undefined, [], '아무것', {}]) {
    const r = 청취문턱(없음);
    assert.equal(r.ms, 하한ms);
    assert.equal(r.재료, false, '재료 없음을 `재료:true` 로 보고하면 미측정이 통과로 읽힌다');
  }
});

test('🔴 오늘 실제로 도는 경로가 이 하나다 — `stt_segments` 생산자가 0줄이다', () => {
  /* 실측(2026-08-09): 이 저장소에서 그 열에 **쓰는** 코드가 0줄이다(읽는 곳만 셋).
   * 생산자가 서면 이 검사가 빨개져 사람을 부른다 — 그 날 저신뢰 경계값과 시간 단위를
   * 실측으로 정해야 하고, 그 전까지 게이트 ①이 막는 것은 0초 승인뿐이다. */
  const 훑을곳 = ['lib', 'src', 'supabase/functions', 'tools'];
  const 쓰는곳 = [];
  const 걷기 = (디렉터리) => {
    for (const 항목 of fs.readdirSync(디렉터리, { withFileTypes: true })) {
      const 길 = path.join(디렉터리, 항목.name);
      if (항목.isDirectory()) { 걷기(길); continue; }
      if (!/\.(js|ts|mjs)$/u.test(항목.name)) continue;
      const 본문 = fs.readFileSync(길, 'utf8');
      /* 「쓴다」의 모양 = insert 의 열 목록에 있거나 `set stt_segments =`. */
      if (/set\s+stt_segments\s*=|stt_segments\s*,[\s\S]{0,400}?\)\s*values/u.test(본문)) 쓰는곳.push(길);
    }
  };
  for (const d of 훑을곳) {
    const 길 = path.join(뿌리, d);
    if (fs.existsSync(길)) 걷기(길);
  }
  assert.deepEqual(쓰는곳, [],
    `\`stt_segments\` 에 쓰는 코드가 생겼다: ${쓰는곳.join(', ')}\n`
    + '  → 게이트 ①의 재료가 실재하게 됐다. 이제 정해야 하는 것 둘:\n'
    + `     ①저신뢰 경계값(지금 ${저신뢰문턱} · 미측정 상수) ②세그먼트 시간 단위(초 vs ms)\n`
    + '  실측으로 정한 뒤 이 검사를 「재료가 실제로 온다」 쪽으로 바꿔라(지우지 말 것)');
});

test('저신뢰 구간이 있으면 그 길이 합이 문턱이다 (초 단위)', () => {
  const r = 청취문턱([
    { start: 0, end: 2, confidence: 0.95 },
    { start: 2, end: 5.5, confidence: 0.4 },
  ]);
  assert.equal(r.재료, true);
  assert.equal(r.ms, 3500, '저신뢰 구간(2~5.5초)만 세야 한다 — 발화 전체가 아니다');
});

test('밀리초로 온 세그먼트도 받는다 — 단위를 한쪽으로 가정하지 않는다', () => {
  const r = 청취문턱([{ start_ms: 0, end_ms: 4000, confidence: 0.2 }]);
  assert.deepEqual(r, { ms: 4000, 재료: true });
});

test('신뢰도가 없는 조각은 저신뢰로 세지 않는다', () => {
  /* 「안 잰 것」을 「나쁜 것」으로 읽으면 문턱이 발화 전체로 부풀고, 그 순간
   * UX ②(거기만 듣게)와 게이트 ①이 서로를 무효화한다. */
  const r = 청취문턱([{ start: 0, end: 20 }]);
  assert.deepEqual(r, { ms: 하한ms, 재료: true }, '신뢰도 없는 조각이 문턱을 20초로 부풀렸다');
});

test('전부 또렷하면 하한으로 되돌린다 (발주 §3 「0이면 하한 3초」)', () => {
  const r = 청취문턱([{ start: 0, end: 30, confidence: 0.99 }]);
  assert.deepEqual(r, { ms: 하한ms, 재료: true });
});

test('망가진 조각(끝≤시작·숫자 아님)은 건너뛴다', () => {
  const r = 청취문턱([
    { start: 5, end: 5, confidence: 0.1 },
    { start: 'x', end: 3, confidence: 0.1 },
    null,
  ]);
  assert.deepEqual(r, { ms: 하한ms, 재료: false }, '망가진 것만 있으면 「잰 것 0」이라 재료가 없는 것이다');
});

/* ── ④ 요청 검증 ─────────────────────────────────────────────────── */

const 정상승인 = () => ({
  submission_id: '11111111-1111-1111-1111-111111111111',
  reviewed_correction_id: '22222222-2222-2222-2222-222222222222',
  transcript_verified: '밥을 먹었어요',
  corrected_text: '밥을 먹었습니다',
  review_listened_ms: 5000,
});

test('정상 요청이 통과하고 기본값이 안전한 쪽이다', () => {
  const r = 승인요청(정상승인());
  assert.equal(r.이유, null);
  assert.equal(r.값.promote, false, '🚫 승격 기본값이 true 면 「검수 완료 = 훈련 적격」이 이름만 바꿔 성립한다');
  assert.deepEqual(r.값.error_tags, []);
  assert.equal(r.값.supersedes, null);
});

test('🔴 빈 전사·빈 교정문을 거절한다 — 안 그러면 빈 것끼리 같아 「원문이 이미 맞다」가 된다', () => {
  for (const 칸 of ['transcript_verified', 'corrected_text']) {
    for (const 빈값 of ['', '   ']) {
      const r = 승인요청({ ...정상승인(), [칸]: 빈값 });
      assert.equal(r.칸, 칸, `${칸}='${빈값}' 가 통과했다 — 사람이 아무것도 안 한 확정이 정답 라벨이 된다`);
    }
  }
  /* 실제로 그 조합이 어떤 라벨을 내는지도 못박는다(검증이 없으면 이 값이 저장된다). */
  assert.equal(셋('', 'AI 문장', ''), VERDICT.원문, '이 판정 자체는 옳다 — 그래서 입구에서 막는 것이다');
});

test('uuid 아닌 식별자·음수 청취·잘못된 타입을 거절한다', () => {
  const 거절해야 = [
    ['submission_id', 'not-a-uuid'],
    ['reviewed_correction_id', ''],
    ['supersedes', '123'],
    ['review_listened_ms', -1],
    ['review_listened_ms', 1.5],
    ['review_listened_ms', '5000'],
    ['reviewer_confidence', 1.5],
    ['error_tags', '직역'],
    ['promote', 'true'],
    ['rubric_scores', []],
  ];
  for (const [칸, 값] of 거절해야) {
    const r = 승인요청({ ...정상승인(), [칸]: 값 });
    assert.equal(r.칸, 칸, `${칸}=${JSON.stringify(값)} 가 통과했다`);
    assert.equal(r.값, null);
  }
});

test('태그는 trim·빈 값 제거까지만 한다 (AI 행과 같은 수준)', () => {
  const r = 승인요청({ ...정상승인(), error_tags: [' 조사:주격(이/가·은/는) ', '', '  '] });
  assert.deepEqual(r.값.error_tags, ['조사:주격(이/가·은/는)']);
});

test('폐기 요청 — submission_id 와 사유가 필요하다 (어휘 대조는 DB 몫)', () => {
  assert.equal(폐기요청({ submission_id: '11111111-1111-1111-1111-111111111111', reason: '무음' }).이유, null);
  assert.equal(폐기요청({ submission_id: 'x', reason: '무음' }).칸, 'submission_id');
  assert.equal(폐기요청({ submission_id: '11111111-1111-1111-1111-111111111111', reason: '  ' }).칸, 'reason');
  /* 🔑 **없는 사유를 여기서 안 막는다** — 어휘의 정본은 DB CHECK 하나이고, 코드가 목록을
   *   들면 넷째 사본이 된다(§5-2). 통과시키는 것이 아니라 **판정 지점을 옮긴** 것이다. */
  assert.equal(폐기요청({ submission_id: '11111111-1111-1111-1111-111111111111', reason: '그냥' }).이유, null);
});

/* ── ⑤ 폐기 어휘 파서 ────────────────────────────────────────────── */

test('CHECK 정의에서 사유만 뽑는다 — 상태값 `discarded` 가 안 섞인다', () => {
  /* PostgreSQL 이 정규화해 돌려주는 실제 모양(캐스트가 붙는다). */
  const 정의 = "CHECK (((discard_reason IS NULL) OR (((status = 'discarded'::engine.job_status)"
    + " AND (discard_reason = ANY (ARRAY['무음'::text, '손상'::text, '중복'::text,"
    + " '과제 불일치'::text, '타인 음성'::text, '판정 불가'::text]))))))";
  assert.deepEqual(폐기어휘(정의),
    ['무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가']);
});

test('CHECK 가 없으면 빈 배열이다 — 배선이 그것을 거절로 읽는다', () => {
  /* 조각이 안 부어진 DB 에서 통과시키면 **사유 없는 폐기**가 남고, 그건 나중에
   * 「강건성 재료」와 「오염 데이터」를 구별할 수 없게 만든다. fail-closed 가 맞다. */
  for (const 없음 of [null, undefined, '', 'CHECK (true)']) {
    assert.deepEqual(폐기어휘(없음), []);
  }
});

test('작은따옴표가 든 값도 안 깨진다', () => {
  assert.deepEqual(폐기어휘("ARRAY['a''b'::text, '무음'::text]"), ["a'b", '무음']);
});

test('정규화는 문자열 아닌 것도 안 던진다', () => {
  assert.equal(정규화(null), '');
  assert.equal(정규화(undefined), '');
  assert.equal(정규화(123), '123');
});
