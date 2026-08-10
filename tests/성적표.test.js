/* 성적표(N12) — `tools/성적표.js` 의 계수 규칙 (M2 설계 §5).
 *
 * ■ 무엇을 지키나
 *   ① **세 값을 세 값으로 센다** — ① 「원문이 이미 맞다」를 패에 합치면 **과교정률 계기판이
 *      사라진다**(「21/21≠100%」 실패모드를 상시 감시하는 유일한 숫자다).
 *   ② **전사 기반 두 층 + 낡음은 분모 밖** — 섞으면 과교정률이 거짓이 된다(반박 H3).
 *   ③ **분모 0 은 0% 가 아니다** — 「안 쟀다」와 「0이었다」를 안 뭉갠다(F207).
 *   ④ **풀 술어가 두 소비자에서 같은가** — 이 트랙의 급소 하나. 문과 도구가 다른 풀을 세면
 *      완료율의 분모와 분자가 다른 표본을 가리키고, 그 어긋남은 어디서도 안 빨개진다.
 *   ⑤ **검수 확정 행이 안 섞이는가**(인수 조건 ⓑ · 반박 L2) — 골든 소속을 감사에서만 읽는지
 *      질의를 실제로 파싱해 본다. ⓐ「강사가 5건 판정」만으로는 N12 가 뜻 없는 숫자를 내도 통과였다.
 *   ⑥ **학생 원문이 도구 출력에 안 실리는가** — 재판정 후보도 id 만이다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const 뿌리 = path.resolve(__dirname, '..');
const 성적표경로 = path.join(뿌리, 'tools', '성적표.js');
const 문경로 = path.join(뿌리, 'supabase', 'functions', 'teach', 'index.ts');

assert.ok(fs.existsSync(성적표경로), 'tools/성적표.js 가 없다 — 이 검사가 통째로 미실행이다');
const {
  계수내기, 기반, 합, 율, 질의, 풀질의, 승, 패, 과교정,
} = require(성적표경로);
const { 풀술어 } = require(path.join(뿌리, 'lib', '골든표본.js'));

/** 판정 행 한 줄. `tv` = 지금의 transcript_verified · `ar` = 판정 때 본 전사. */
const 행 = ({ v = 승, tv = '말한 것', ar = '말한 것', model = 'claude', prompt = 'p1', lv = '3급', 사유 = true, id = 'g1' } = {}) => ({
  verdict: v, transcript_verified: tv, transcript_at_review: ar,
  model, prompt_ver: prompt, level_snapshot: lv, 사유있음: 사유,
  gold_id: id, ai_id: `ai-${id}`, 판정시각: '2026-08-10T00:00:00Z',
});

/* ── ① 세 값 ──────────────────────────────────────────────────────── */

test('① 승·패·과교정을 «따로» 센다 — ① 을 패에 합치지 않는다', () => {
  const c = 계수내기([행({ v: 승, id: 'a' }), 행({ v: 패, id: 'b' }), 행({ v: 과교정, id: 'c' })]);
  assert.deepEqual(
    { 승: c.층.확정.승, 패: c.층.확정.패, 과교정: c.층.확정.과교정 },
    { 승: 1, 패: 1, 과교정: 1 },
  );
});

test('① 승률의 분모는 셋 전부다 — 과교정도 AI 가 틀린 것이다', () => {
  const c = 계수내기([행({ v: 승, id: 'a' }), 행({ v: 패, id: 'b' }), 행({ v: 과교정, id: 'c' })]);
  assert.equal(합(c.층.확정), 3);
  assert.equal(율(c.층.확정.승, 합(c.층.확정)), 33.3);
  assert.equal(율(c.층.확정.과교정, 합(c.층.확정)), 33.3);
});

test('① 어휘가 `lib/검수확정.js` 의 VERDICT 와 같다(도구가 자기 문자열을 안 만든다)', () => {
  const { VERDICT } = require(path.join(뿌리, 'lib', '검수확정.js'));
  assert.equal(승, VERDICT.AI);
  assert.equal(패, VERDICT.수정);
  assert.equal(과교정, VERDICT.원문);
});

/* ── ② 전사 기반 두 층 · 낡음은 분모 밖 ────────────────────────────── */

test('② 확정 기반 = 판정 때 본 전사가 «지금의» 검증 전사와 같다', () => {
  assert.equal(기반(행({ tv: '가나다', ar: '가나다' })), '확정');
});

test('② 기계 기반 = 아직 검수 안 됐다(transcript_verified 가 null)', () => {
  assert.equal(기반(행({ tv: null, ar: '가나다' })), '기계');
  /* ⚠ 헬퍼를 안 쓴다 — 기본 인자가 `undefined` 를 삼켜 이 갈래가 통째로 안 재진다
   *   (실제로 그 미실행이 「낡음」으로 빨개져 여기서 드러났다). 열이 아예 없는 행도 같은 축이다. */
  assert.equal(기반({ transcript_verified: undefined, transcript_at_review: '가나다' }), '기계');
  assert.equal(기반({ transcript_at_review: '가나다' }), '기계');
});

test('② 낡음 = 판정 «후» 전사가 바뀐 행', () => {
  assert.equal(기반(행({ tv: '고친 전사', ar: '옛 전사' })), '낡음');
});

test('② NFC 로 비교한다 — 조합형 차이로 멀쩡한 행이 「낡음」이 되지 않는다', () => {
  const 조합형 = '\u1100\u1161\u1102\u1161'; // 「가나」의 조합형 — 글자로 박으면 정규화에 죽는다
  assert.notEqual(조합형, '가나', '픽스처가 NFD 가 아니면 이 검사는 아무것도 안 잰다');
  assert.equal(기반(행({ tv: '가나', ar: 조합형 })), '확정');
});

test('② 낡음은 model·급수 분모에서 «빠지고» 재판정 후보로 나온다', () => {
  const c = 계수내기([
    행({ v: 승, id: 'a' }),
    행({ v: 과교정, tv: '바뀐 전사', ar: '옛 전사', id: 'b' }),
  ]);
  assert.equal(합(c.층.낡음), 1);
  assert.equal(c.재판정후보.length, 1);
  assert.equal(c.재판정후보[0].gold_id, 'b');
  /* model·급수 칸은 낡음을 안 센다 — 그 행의 판정 기반이 이미 사라졌다. */
  assert.equal(합([...c.판.values()][0]), 1);
  assert.equal(합([...c.급수.values()][0]), 1);
});

test('② 층별 분모를 각자 센다 — 확정과 기계를 한 칸에 뭉치지 않는다', () => {
  const c = 계수내기([행({ id: 'a' }), 행({ tv: null, id: 'b' })]);
  assert.equal(합(c.층.확정), 1);
  assert.equal(합(c.층.기계), 1);
});

/* ── ③ 분모 0 ─────────────────────────────────────────────────────── */

test('③ 분모 0 이면 율은 null 이다 — 0% 로 적으면 「쟀는데 0」이 된다', () => {
  assert.equal(율(0, 0), null);
  assert.equal(율(0, 3), 0);
});

test('③ 행이 0건이어도 안 죽고 빈 계수를 낸다', () => {
  const c = 계수내기([]);
  assert.equal(c.전체행, 0);
  assert.equal(합(c.층.확정), 0);
  assert.equal(c.판.size, 0);
});

test('③ 0건 안내가 「상류의 상태」 셋을 가려 말한다 — 침묵으로 뭉개지 않는다', () => {
  const 소스 = fs.readFileSync(성적표경로, 'utf8');
  assert.match(소스, /ANTHROPIC_API_KEY/);
  assert.match(소스, /미배포/);
  assert.match(소스, /판정하지 않음/);
});

/* ── ④ 풀 술어 공유 (급소) ────────────────────────────────────────── */

test('④ 문과 도구가 «같은» 풀 술어를 쓴다 — 각자 적으면 다른 풀을 센다', () => {
  assert.ok(fs.existsSync(문경로), 'functions/teach/index.ts 가 없다 — ④ 가 미실행이다');
  const 문소스 = fs.readFileSync(문경로, 'utf8');
  const 도구소스 = fs.readFileSync(성적표경로, 'utf8');
  /* 문은 태그 질의라 술어를 «글자로» 담고, 도구는 상수를 보간한다 — 두 모양을 각각 잰다. */
  assert.ok(문소스.includes(풀술어), '문의 풀 질의가 풀술어와 글자까지 같지 않다');
  assert.match(도구소스, /where \$\{풀술어\}/, '도구가 풀술어 상수를 안 쓴다');
});

test('④ 풀 술어가 «학생 목록에 서는 행»의 식을 담는다(빈 카드 필터와 같은 축)', () => {
  assert.match(풀술어, /actor_kind = 'ai'/);
  assert.match(풀술어, /corrected_text is not null/);
  assert.match(풀술어, /array_length\(c\.error_tags, 1\) is not null/);
});

test('④ 완료율의 풀 질의가 반열린 구간을 쓴다(자정 정각 행이 두 주에 안 든다)', () => {
  const s = 풀질의('2026-08-03T00:00:00.000Z', '2026-08-10T00:00:00.000Z');
  assert.match(s, /created_at >= '2026-08-03/);
  assert.match(s, /created_at <  '2026-08-10/);
  assert.ok(!/created_at <=/.test(s), '닫힌 구간이다');
});

/* ── ⑤ 검수 확정 행 오염 0 (인수 조건 ⓑ) ──────────────────────────── */

test('⑤ 골든 소속을 `teach.gold.judge` 감사에서만 읽는다 — 역할 조인이 아니다', () => {
  const s = 질의('2026-01-01T00:00:00Z');
  assert.match(s, /action = 'teach\.gold\.judge'/);
  /* 🔴 `actor_kind='teacher'` 로 골든을 찾으면 검수 확정 행이 통째로 섞인다(반박 C1·L2).
   *   오늘 두 문을 지나는 사람은 원장 한 명이라 역할로는 안 갈린다. */
  assert.ok(!/actor_kind\s*=\s*'teacher'/.test(s), "질의가 actor_kind='teacher' 로 골든을 찾는다");
  assert.ok(!/reviewer\s*=/.test(s), '질의가 reviewer 로 골든을 찾는다 — 원장이 양쪽이라 안 갈린다');
});

test('⑤ 감사 행의 target_ids 를 [평가 대상, 골든 행] 순서로 읽는다(순서가 계약이다)', () => {
  const s = 질의('2026-01-01T00:00:00Z');
  assert.match(s, /target_ids\[1\] as ai_id/);
  assert.match(s, /target_ids\[2\] as gold_id/);
  /* 두 칸짜리가 아닌 감사 행(큐 조회 등)이 섞이면 조인이 엉뚱한 것을 가리킨다. */
  assert.match(s, /array_length\(l\.target_ids, 1\) = 2/);
});

test('⑤ 승률은 «골든 행» 의 verdict 로 센다 — AI 행이나 검수 행이 아니다', () => {
  const s = 질의('2026-01-01T00:00:00Z');
  assert.match(s, /join engine\.corrections t on t\.correction_id = g\.gold_id/);
  assert.match(s, /join engine\.corrections a on a\.correction_id = g\.ai_id/);
  assert.match(s, /t\.verdict/);
  assert.match(s, /a\.model/);
  assert.ok(!/a\.verdict/.test(s), 'AI 행의 verdict 를 센다 — 그 칸은 라벨이 아니다');
});

/* ── ⑥ 학생 원문을 안 싣는다 ──────────────────────────────────────── */

test('⑥ 재판정 후보에 전사·교정문이 안 실린다(id 와 시각만)', () => {
  const c = 계수내기([행({ tv: '바뀐 전사', ar: '옛 전사', id: 'x' })]);
  assert.deepEqual(Object.keys(c.재판정후보[0]).sort(), ['ai_id', 'gold_id', '판정시각']);
});

test('⑥ 질의가 학생 원문 칸을 «세는 데 필요한 만큼만» 끌어온다', () => {
  const s = 질의('2026-01-01T00:00:00Z');
  /* 전사 두 칸은 층화에 필요하다(NFC 비교) — 교정문·해설은 필요 없다. */
  assert.ok(!/t\.corrected_text|a\.corrected_text|explanation/.test(s),
    '교정문·해설을 끌어온다 — 세는 것은 판정 분포지 문장이 아니다');
  /* 사유는 «있나 없나»만 — 자유 서술 원문을 도구로 끌어오지 않는다. */
  assert.match(s, /verdict_reason is not null as 사유있음/);
  assert.ok(!/t\.verdict_reason,/.test(s), '사유 원문을 끌어온다');
});

test('⑥ 급수 층화가 열 추가 0 으로 선다(부모 사건의 level_snapshot)', () => {
  const s = 질의('2026-01-01T00:00:00Z');
  assert.match(s, /e\.level_snapshot/);
  assert.match(s, /join engine\.learning_events e on e\.event_id = s\.event_id/);
});
