/* 배달 선택 회귀 — P0 §6 의 「무엇을 낼 것인가」가 계약대로 갈리는지 못박는다.
 *
 * 세 맹점(CLAUDE.md):
 *   ① 사람이 실제로 쓰는 표기 — 멱등키는 C0 §4-1 이 적은 문자열 그대로 비교한다.
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 픽스처로 걸고,
 *      실저장소(계약 json)에는 「지어낸 값목록이 없는가」 하나만 건다.
 *   ③ 자기 처방 — 강등으로 나온 배정을 다음 날 재료로 되먹여도 경로가 성립해야 한다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const { 몽골날짜, 멱등키, 오늘과제, 따라말하기문장, 화면과제, 제출사건, 열람사건, 되듣기사건,
  선택사건, 답하기선택지, 답하기차원, 도입,
  학생판스냅샷, 학생공개키, 구제할까, 생성중상태들, 창안생성중, 선택판, 판지문 } = require('../lib/오늘과제.js');
const { 차원들, 보기세우기, 선택payload } = require('../lib/선택로그.js');
const { 검증 } = require('../lib/이벤트검증.js');
/* 🔴 소스층 단언은 전부 **주석을 지우고** 잰다(F401 계열 · 대기열 P3 줄72). 이 파일의 소스층
 *   검사는 「금지한 표기가 남아 있나」 계열이라, 그 금지를 설명하는 주석 한 줄이 곧 거짓 적색이다.
 *   같은 파일을 여는 자리가 여럿이면 **전부 같이** 돌린다 — 하나만 남기면 `가드계수` 가 파일을
 *   한 스코프로 근사하고 첫 선언이 이겨서, 남은 원문 자리가 「정제됐다」로 잘못 세어진다. */
const { 코드만, 코드만픽스처 } = require('./lib/소스검사.js');

const 날짜 = '2026-08-07';
const 호흡 = (r, 차례) => r.task_snapshot.호흡.find((h) => h.차례 === 차례);

/* ── 날짜 ─────────────────────────────────────────────────────────
 * 🔴 UTC 로 끊으면 몽골 오전 8시까지가 「어제」다. 그 오독은 증상이 조용하다 —
 *   아침에 앱을 연 학생이 어제 과제를 오늘 것으로 받고, 배치는 「1건 냈다」고 보고한다. */
test('🔴 주석 제거기가 살아 있다 — 죽으면 이 파일의 소스층 금지 전부가 원문 검사로 되돌아간다', () => {
  /* 탐지력은 픽스처로 못박는다(CLAUDE.md 가드 맹점 ②). `코드만` 이 조용히 입력을 그대로
   * 돌려주게 되는 날 증상은 **적색이 아니라 초록**이라, 이 한 줄이 없으면 아무도 모른다. */
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다');
});

test('날짜는 몽골 달력으로 끊는다 — 16:00Z 가 경계다', () => {
  assert.equal(몽골날짜(new Date('2026-08-07T15:59:59Z')), '2026-08-07');
  assert.equal(몽골날짜(new Date('2026-08-07T16:00:00Z')), '2026-08-08');
  // 자정 UTC 는 몽골에서 이미 같은 날 오전 8시다 — UTC 로 끊으면 여기서 하루가 밀린다.
  assert.equal(몽골날짜(new Date('2026-08-07T00:00:00Z')), '2026-08-07');
});

test('몽골날짜는 날짜가 아닌 것을 조용히 삼키지 않는다', () => {
  assert.throws(() => 몽골날짜('어제'), TypeError);
});

/* ── 멱등키 ───────────────────────────────────────────────────────
 * C0 §4-1: 배치는 결정론적 키를 쓴다 — 두 번 돌면 두 번째가 `duplicate` 로 접힌다.
 * 모양이 바뀌면 그 접힘이 풀려 **하루 2건**이 조용히 선다(새 유일 제약이 없으므로). */
test('멱등키는 C0 §4-1 이 적은 모양 그대로다', () => {
  assert.equal(
    멱등키('task', '11111111-2222-4333-8444-555555555555', 날짜),
    'task:11111111-2222-4333-8444-555555555555:2026-08-07',
  );
});

test('같은 날 두 사건은 키가 갈린다 — 하나가 다른 하나를 접으면 안 된다', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  assert.notEqual(멱등키('task', id, 날짜), 멱등키('intervention', id, 날짜));
});

/* ── 네 갈래 ─────────────────────────────────────────────────────── */
test('첫날 = 도입 과제 · 강등 아님 (§4-5 유호님 확정)', () => {
  const r = 오늘과제({ 날짜, 첫날: true });
  assert.equal(호흡(r, 2).문장, 도입.따라말하기);
  assert.equal(r.출처, '도입');
  assert.equal(r.degraded, false, '첫날은 정상 경로다 — 강등으로 세면 원장 화면이 거짓말한다');
});

test('교정이 새로 확정됐으면 ②슬롯이 그 교정문이다 (§6-3)', () => {
  const r = 오늘과제({ 날짜, 교정문: '어제 친구를 만나서 밥을 먹었어요' });
  assert.equal(호흡(r, 2).문장, '어제 친구를 만나서 밥을 먹었어요');
  assert.equal(r.출처, '교정문');
  assert.equal(r.degraded, false, '교정문은 조회지 AI 호출이 아니다');
});

test('AI 자리가 비면 전날 문장으로 내려가고 **강등으로 남는다** (§6-4)', () => {
  const r = 오늘과제({ 날짜, 전날문장: '저는 학교에 갑니다' });
  assert.equal(호흡(r, 2).문장, '저는 학교에 갑니다');
  assert.equal(r.degraded, true, '강등을 안 적으면 「막힌 것이 통과한 것처럼」 보인다');
});

test('전날 문장도 없으면 고정 도입 과제 — 그래도 강등이다', () => {
  const r = 오늘과제({ 날짜 });
  assert.equal(호흡(r, 2).문장, 도입.따라말하기);
  assert.equal(r.degraded, true);
});

test('첫날이 교정문보다 앞선다 — 첫 발화 기준선은 소급이 안 된다', () => {
  const r = 오늘과제({ 날짜, 첫날: true, 교정문: '고쳐진 문장' });
  assert.equal(r.출처, '도입');
});

/* ── 오디오 타임캡슐 (N23 · 유호님 확정 2026-08-08) ───────────────── */
test('첫날 ③은 「6개월 뒤의 나에게」다 — 해봉 때 되돌려줄 다짐이 여기서 생긴다', () => {
  const r = 오늘과제({ 날짜, 첫날: true });
  assert.equal(호흡(r, 3).프롬프트, 도입.첫날답하기);
});

test('🔴 강등 날에는 그 질문이 새면 안 된다 — 6개월차가 「6개월 뒤의 나」를 다시 받는다', () => {
  for (const 재료 of [
    { 날짜, 전날문장: '저는 학교에 갑니다' },   // 강등 1단계
    { 날짜 },                                    // 강등 2단계(고정 도입으로 내려감)
    { 날짜, 교정문: '고쳐진 문장' },             // 정상 경로(교정문)
  ]) {
    const r = 오늘과제(재료);
    assert.equal(호흡(r, 3).프롬프트, 도입.답하기, `첫날이 아닌데 첫날 질문이 나갔다: ${JSON.stringify(재료)}`);
  }
});

test('②낭독 문장은 첫날도 강등도 같다 — 갈리면 종단 대조가 그날로 죽는다', () => {
  assert.equal(호흡(오늘과제({ 날짜, 첫날: true }), 2).문장, 호흡(오늘과제({ 날짜 }), 2).문장);
});

test('첫날 기준선은 출처+degraded 로 갈린다 — task_ref 는 날짜라 짝이 안 된다', () => {
  const 첫 = 오늘과제({ 날짜, 첫날: true });
  const 강등 = 오늘과제({ 날짜 });                       // 같은 도입 문장을 쓰는 유일한 다른 경로
  assert.equal(첫.출처, 강등.출처, '전제: 둘 다 출처가 도입이라 출처만으로는 못 가른다');
  assert.notEqual(첫.degraded, 강등.degraded, 'degraded 가 유일한 구분축이다');
  assert.equal(첫.task_ref, 강등.task_ref, 'task_ref 는 날짜라 같은 날이면 같다 — 짝의 키가 될 수 없다');
});

/* ── 형식 ────────────────────────────────────────────────────────── */
test('두 호흡의 형식이 갈려 있다 — 한 칸에 담으면 나중에 못 가른다 (§2-1)', () => {
  const r = 오늘과제({ 날짜, 첫날: true, 급수: 'Lv3' });
  assert.equal(호흡(r, 2).task_format, '낭독');
  assert.equal(호흡(r, 3).task_format, '자유발화');
  assert.equal(r.task_snapshot.task_format, undefined, '배정 1건에 형식이 둘이라 행에는 안 적는다');
});

/* ── 급수 갈래 (설계 §6 급수별 조정) ──────────────────────────────────
 * 🔴 이 갈래가 없던 동안 **전원이 자유발화**를 받았다. 급수 1~2 학생은 말할 수 없어서 아무것도
 *   안 내고, 그날 발화는 소급 불가로 사라진다 — 첫날만 고정편지에 보기가 있어 **이튿날부터**
 *   조용히 무너지는 모양이었다(그래서 실기기 관통에서도 안 보였다). */
test('급수 1~2·미정·모름은 「골라서 답하기」 — 보기 2개가 함께 나간다', () => {
  for (const 급수 of ['Lv1', 'Lv2', 'Lv0', '미정', '', null, undefined]) {
    const h = 호흡(오늘과제({ 날짜, 첫날: false, 급수 }), 3);
    assert.equal(h.task_format, '응답', `급수 ${JSON.stringify(급수)} 가 자유발화로 나갔다`);
    assert.equal(h.선택지.length, 2, `급수 ${JSON.stringify(급수)} 의 보기가 2개가 아니다`);
  }
});

test('급수 3 이상은 자유발화 — 보기 키 자체가 없다', () => {
  for (const 급수 of ['Lv3', 'Lv4', 'Lv5', 'Lv6', 3, '6']) {
    const h = 호흡(오늘과제({ 날짜, 첫날: false, 급수 }), 3);
    assert.equal(h.task_format, '자유발화', `급수 ${JSON.stringify(급수)} 가 응답으로 나갔다`);
    assert.ok(!('선택지' in h),
      `자유발화에 보기 키가 있다 — \`null\` 을 실으면 「보기 없는 응답」과 구분이 사라진다`);
  }
});

/* ☠️ 첫 판이 `Number(급수)` 로 재서 `'Lv3'` → `NaN` → 초급이 됐다. 실측 표기가 `Lv3` 인데
 *   스키마는 `text` 라 형식을 안 잡는다 — 표기가 늘면 여기서 먼저 빨개진다. */
test('급수 표기에서 숫자를 뽑는다 — `Lv3` 을 초급으로 접지 않는다', () => {
  assert.equal(호흡(오늘과제({ 날짜, 급수: 'Lv3' }), 3).task_format, '자유발화');
  assert.equal(호흡(오늘과제({ 날짜, 급수: 'Lv2' }), 3).task_format, '응답');
});

test('보기 하나는 `○○` 없이 통째로 말할 수 있다 — 빈칸조차 막히는 학생의 탈출구', () => {
  for (const 첫날 of [true, false]) {
    const 보기 = 호흡(오늘과제({ 날짜, 첫날, 급수: 'Lv1' }), 3).선택지;
    // 🔑 학생이 보는 것은 `label` 이다 — `option_id` 는 조인 키라 이 판정의 재료가 아니다.
    assert.ok(보기.some((c) => !c.label.includes('○○')),
      `${첫날 ? '첫날' : '평일'} 보기가 전부 빈칸 채우기다 — 그러면 다시 「아무것도 안 냄」이 된다: ${보기.map((c) => c.label).join(' / ')}`);
  }
});

test('보기는 학생판 필터를 통과한다 — 깎이면 그 학생 화면이 자유발화가 된다', () => {
  const snap = 오늘과제({ 날짜, 급수: 'Lv1' }).task_snapshot;
  const 판 = 학생판스냅샷(snap);
  assert.deepEqual(판.호흡.find((h) => h.차례 === 3).선택지,
    snap.호흡.find((h) => h.차례 === 3).선택지, '허용 목록에 `선택지` 가 빠졌다');
});

/* 🔴 실저장소 검사는 이것 하나 — 내가 값을 지어냈으면 빨개진다.
 *   `이벤트검증.test.js` 가 이름에 대해 하는 일을 값목록에 대해 한다. */
test('호흡이 쓰는 task_format 은 계약 값목록 안이다', () => {
  const 허용 = 계약.learning_events.값목록.task_format;
  for (const h of 오늘과제({ 날짜, 첫날: true }).task_snapshot.호흡) {
    assert.ok(허용.includes(h.task_format), `계약에 없는 task_format: ${h.task_format}`);
  }
});

/* ── 이어짐 ──────────────────────────────────────────────────────── */
test('오늘 스냅샷이 내일의 「전날 문장」이 된다 — 강등 경로가 자기 출력으로 돈다', () => {
  const 어제 = 오늘과제({ 날짜: '2026-08-06', 교정문: '제가 만든 문장이에요' });
  const 오늘 = 오늘과제({ 날짜, 전날문장: 따라말하기문장(어제.task_snapshot) });
  assert.equal(호흡(오늘, 2).문장, '제가 만든 문장이에요');
  assert.equal(오늘.degraded, true, '같은 문장을 다시 내는 것은 강등이다');
});

test('따라말하기문장은 모양이 어긋난 스냅샷에 null 을 준다', () => {
  assert.equal(따라말하기문장(null), null);
  assert.equal(따라말하기문장({ 호흡: [] }), null);
  assert.equal(따라말하기문장({ 호흡: [{ 차례: 3, 프롬프트: 'x' }] }), null, '③을 ②로 착각하면 안 된다');
});

test('task_ref 는 날짜를 물고 있다 — 제출이 어느 배정에 대한 것인지 잇는 유일한 끈', () => {
  assert.equal(오늘과제({ 날짜, 첫날: true }).task_ref, 'task-2026-08-07');
});

/* ── 화면이 읽는 자리 (S1-b) ─────────────────────────────────────────
 * 🔑 재료를 **`오늘과제()` 가 직접 만든 것**으로 쓴다 — 손으로 적은 픽스처를 쓰면 배치가
 *   호흡 키를 바꾸는 날 이 검사만 초록으로 남고, 그 조합이 정확히 「빈 화면」의 원인이다. */
/* 급수 기본값이 `'Lv3'` 인 이유: 아래 픽스처의 `level_snapshot` 이 이미 `Lv3` 이라, 스냅샷을
 * 급수 없이 만들면 **같은 픽스처 안에서 「Lv3 학생인데 화면은 급수 1~2 용」** 이 성립한다.
 * 그 모순은 조용해서(둘 다 값이 있다) 급수 갈래를 넣기 전까지 아무도 못 봤다. */
const 서버항목 = (덧 = {}, 급수 = 'Lv3') => {
  const r = 오늘과제({ 날짜, 첫날: true, 급수 });
  return {
    task_id: '11111111-1111-4111-8111-111111111111',
    task_snapshot: r.task_snapshot,
    task_format: null,
    degraded: r.degraded,
    /* 🔑 `event_id` ≠ `intervention_id`. 둘을 같은 값으로 적으면 아래 검사가 **둘을 바꿔 써도**
     *   초록이 되고, 그 오류의 증상은 「같은 개입을 두 번 낸 날 두 열람이 한 행으로 접히는 것」
     *   뿐이라 조용하다(C0 §4-3 ①). */
    intervention: {
      intervention_id: '22222222-2222-4222-8222-222222222222',
      event_id: '33333333-3333-4333-8333-333333333333',
      output_text: '오늘 온 말',
    },
    ...덧,
  };
};
const 폴백 = { id: 'seed-beginner-v1', 본문: '고정 본문', 핵심문장: '고정 문장', 질문: '고정 질문', 선택지: ['가', '나'] };

test('서버 과제를 받으면 화면이 그것을 쓴다 — ②③이 스냅샷에서 그대로 온다', () => {
  const v = 화면과제(서버항목(), 폴백);
  assert.equal(v.출처, '서버');
  assert.equal(v.사유, null);
  assert.equal(v.편지.핵심문장, 도입.따라말하기, '②는 스냅샷의 문장이다');
  // 이 항목은 `오늘과제({첫날:true})` 로 만든다 → ③은 타임캡슐 질문이다(N23). 요지는 그대로다:
  // 화면이 **스냅샷에서** 가져오는가(폴백 값이 새지 않는가)를 잰다.
  assert.equal(v.편지.질문, 도입.첫날답하기, '③은 스냅샷의 프롬프트다');
  assert.equal(v.편지.본문, '오늘 온 말', '①듣기는 AI 가 실제로 한 말이다');
  assert.equal(v.task_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(v.intervention_id, '22222222-2222-4222-8222-222222222222');
});

test('🔴 선택지는 서버가 낸 것만 — 폴백 보기가 새지 않는다', () => {
  // ⓐ 서버가 자유발화를 냈으면(급수 3+) 화면에도 보기가 없다 — 폴백의 `['가','나']` 가 안 샌다.
  assert.equal(화면과제(서버항목(), 폴백).편지.선택지, null,
    '폴백의 선택지가 서버 과제에 새어들면 급수 1~2 골라서 답하기가 거짓으로 뜬다');
  // ⓑ 서버가 보기를 냈으면(급수 1~2) **서버 것**이 뜬다 — 폴백 것으로 덮이지 않는다.
  const v = 화면과제(서버항목({}, 'Lv1'), 폴백);
  assert.notDeepEqual(v.편지.선택지, 폴백.선택지, '서버 보기가 폴백 보기로 덮였다');
  assert.deepEqual(v.편지.선택지, 도입.첫날답하기선택.보기들);
  assert.equal(v.편지.선택차원, 차원들.도입첫날, '보기는 첫날 것인데 축이 따라오지 않았다');
});

test('①듣기가 비면 ②문장이 그날 나간 말이다 — 강등 경로(§6-4)', () => {
  const v = 화면과제(서버항목({ intervention: null }), 폴백);
  assert.equal(v.편지.본문, 도입.따라말하기);
  assert.equal(v.intervention_id, null);
});

/* ── c9 `content.viewed` — 「귀에 실제로 닿았다」 ──────────────────────
 * 🔴 이 사건은 이름·물리·검증기가 다 선 채로 **생산자가 0**이었다. 막고 있던 것은 화면이 아니라
 *   `parent_event_id` 로 가리킬 값이었고(C0 §4-3 ① `intervention.event_id`), 그게 없는 동안
 *   `intervention.delivered` 는 배치의 **추정**인 채로 남았다 — 관측 짝이 없으면 네트워크 실패가
 *   「전달 완료」로 학습된다(절단문서 ①-12 · ①-2). 소급 불가라 개원 전에 서야 한다. */
test('🔑 배달 사건의 event_id 가 화면까지 온다 — 열람이 가리킬 유일한 값', () => {
  const v = 화면과제(서버항목(), 폴백);
  assert.equal(v.intervention_event_id, '33333333-3333-4333-8333-333333333333');
  assert.notEqual(v.intervention_event_id, v.intervention_id,
    '업무 키를 사건 id 자리에 넣으면 같은 개입을 두 번 낸 날 두 열람이 한 행으로 접힌다');
});

test('가리킬 배달이 없으면 화면도 빈손이다 — 폴백 날·개입 없는 배정', () => {
  assert.equal(화면과제(null, 폴백).intervention_event_id, null, '폴백 날엔 배달 사건이 없다');
  assert.equal(화면과제(서버항목({ intervention: null }), 폴백).intervention_event_id, null);
  // 개입은 붙었는데 배달 사건 행을 못 찾은 경우 — 서버가 `event_id: null` 로 보낸다.
  const 반쪽 = 서버항목({ intervention: { intervention_id: 'x', event_id: null, output_text: '말' } });
  assert.equal(화면과제(반쪽, 폴백).intervention_event_id, null);
});

test('🔑 열람사건이 계약을 지나는 `content.viewed` 를 만든다', () => {
  const e = 열람사건({
    parent_event_id: '33333333-3333-4333-8333-333333333333',
    idempotency_key: '44444444-4444-4444-8444-444444444444',
    correlation_id: '55555555-5555-4555-8555-555555555555',
    level_snapshot: 'Lv2',
    occurred_at: '2026-08-07T02:00:00.000Z',
  });
  assert.equal(e.event_type, 'content.viewed');
  assert.equal(e.parent_event_id, '33333333-3333-4333-8333-333333333333');
  const v = 검증(e, 계약);
  assert.ok(v.ok, v.오류들.join(' · '));
});

/* 🔴 급수 없는 학생(개원 첫 주 = 반 배정 전)도 열람은 보낼 수 있어야 한다 — 막으면 그 주의
 *   관측이 통째로 빈다. 「모른다(null)」와 「앱이 빠뜨렸다(키 없음)」는 갈라진 채다(§4-3 ① ⓑ). */
test('급수를 모르면 null 로 간다 — 키는 남는다', () => {
  const e = 열람사건({
    parent_event_id: 'p', idempotency_key: 'k', correlation_id: 'c',   // 형식 검사는 서버가 진다
  });
  assert.equal(e.level_snapshot, null);
  assert.ok('level_snapshot' in e, '키까지 빠지면 앱 결손이 「모른다」로 위장돼 들어온다');
});

/* 🔑 지어내지 않는다 — 없는 재료를 채우면 ①-10(가짜 앉음)·①-5(좌표 멱등키)로 되돌아간다.
 *   ⚠ 셋을 **따로** 잰다: 하나로 뭉뚱그리면 한 갈래만 살아 있어도 초록이 된다. */
test('재료가 없으면 사건을 안 만든다 — 셋 각각', () => {
  const 온전 = { parent_event_id: 'p', idempotency_key: 'k', correlation_id: 'c' };
  assert.ok(열람사건(온전), '온전한 재료가 null 이 되면 아래 검사가 전부 무의미하다');
  for (const 뺀것 of Object.keys(온전)) {
    assert.equal(열람사건({ ...온전, [뺀것]: null }), null, `${뺀것} 없이 사건이 만들어졌다`);
  }
  assert.equal(열람사건(), null, '인자 자체가 없어도 던지지 않고 null 이다');
});

/* ── ①-2 의 마지막 값 — 「내 목소리 되듣기」 ───────────────────────────────
 * 🔴 이 사건의 사활은 **부모**다. 되듣기의 대상은 배달물이 아니라 학생 자기 녹음이라, 부모를
 *   배달 사건으로 재사용하면 ①-12 가 세는 「배달 오디오가 귀에 닿았다」와 한 행으로 섞인다.
 *   그리고 그 부모는 제출이 **착지한 뒤에만** 존재한다 — 먼저 보내면 서버가 `retryable:false` 로
 *   접고 앱이 `send_final` 로 적어, 재시도가 아니라 **영구 소멸**이다(절단문서 ①-2). */
const 항목판 = (덧 = {}) => ({
  idempotency_key: '44444444-4444-4444-8444-444444444444',
  correlation_id: '55555555-5555-4555-8555-555555555555',
  task_meta: { level_snapshot: 'Lv2' },
  replayed_at: '2026-08-08T02:00:00.000Z',
  ...덧,
});

test('🔑 되듣기사건 — 부모는 **자기 제출 사건**이고 계약을 지난다', () => {
  const e = 되듣기사건(항목판(), '33333333-3333-4333-8333-333333333333');
  assert.equal(e.event_type, 'content.viewed');
  assert.equal(e.parent_event_id, '33333333-3333-4333-8333-333333333333',
    '부모가 제출 사건이 아니다 — 배달을 가리키면 ①-12 의 관측과 한 행으로 섞인다');
  assert.equal(e.occurred_at, '2026-08-08T02:00:00.000Z',
    '보낸 시각을 적었다 — 관측 시각은 되들은 그때고, 사흘 밀려 올라가도 그날이어야 한다');
  assert.equal(e.level_snapshot, 'Lv2', '항목이 들고 있던 그날 급수를 안 쓴다');
  const v = 검증(e, 계약);
  assert.ok(v.ok, v.오류들.join(' · '));
});

/* 🔴 **착지 전에는 만들어질 수가 없어야 한다.** 이 한 줄이 이 배선의 전부다 — 「먼저 보내기」의
 *   결과가 재시도가 아니라 영구 소멸이라, 막는 자리는 전송이 아니라 **조립**이어야 한다. */
test('🔴 제출이 아직 안 착지했으면 사건을 안 만든다 (부모 없는 되듣기 = 영구 소멸)', () => {
  for (const 없는부모 of [undefined, null, '']) {
    assert.equal(되듣기사건(항목판(), 없는부모), null,
      `event_id 가 ${JSON.stringify(없는부모)} 인데 사건이 만들어졌다 — 서버가 접고 앱은 send_final 로 적는다`);
  }
});

test('되듣기가 없던 시도는 사건이 없다 — 빈 관측을 지어내지 않는다', () => {
  assert.equal(되듣기사건(항목판({ replayed_at: null }), 'e'), null);
  assert.equal(되듣기사건(null, 'e'), null, '항목 자체가 없어도 던지지 않고 null 이다');
});

/* 🔑 멱등키는 **항목 키에서 판다**. 좌표 조립(`날짜:호흡:시도`)이 아니라 항목의 v4 uuid 파생이라
 *   재설치·로그 초기화로 되돌아가지 않는다(①-5). 같은 항목이 두 번 착지해도(`duplicate` 로 같은
 *   event_id 가 돌아온다) 키가 같아 되듣기가 두 벌 안 쌓인다 — 그리고 **제출 키와는 달라야** 한다. */
test('멱등키 — 항목마다 다르고, 같은 항목은 늘 같고, 제출 키와 겹치지 않는다', () => {
  const 항목 = 항목판();
  const a = 되듣기사건(항목, 'e');
  assert.equal(a.idempotency_key, 되듣기사건(항목, 'e').idempotency_key, '같은 항목이 두 벌로 쌓인다');
  assert.notEqual(a.idempotency_key, 항목.idempotency_key,
    '제출과 같은 키다 — 서버가 (learner_id, key) 로 접어 되듣기가 제출의 duplicate 로 사라진다');
  assert.notEqual(a.idempotency_key,
    되듣기사건(항목판({ idempotency_key: '66666666-6666-4666-8666-666666666666' }), 'e').idempotency_key,
    '다른 시도의 되듣기가 같은 키다 — 한 벌만 남는다');
  assert.equal(되듣기사건(항목판({ idempotency_key: null }), 'e'), null, '키 재료가 없는데 지어냈다');
});

/* 🔴 빈 상태·깨진 스냅샷은 **내려가되 말한다.** 조용히 폴백을 쓰면 배치가 며칠 안 돌아도
 *   화면은 늘 멀쩡해 보인다 — P0 §4-1 이 경계한 「막힌 것이 통과한 것처럼 보이는 상태」. */
test('배정이 없으면 고정 과제로 내려가고 그 사실을 낸다', () => {
  const v = 화면과제(null, 폴백);
  assert.equal(v.출처, '고정');
  assert.equal(v.편지, 폴백);
  assert.ok(v.사유 && v.사유.length > 0, '사유가 없으면 화면이 조용히 내려간다');
  assert.equal(v.degraded, true);
});

test('스냅샷이 반쪽이면 내려간다 — ②③은 쌍이라서 값이 있다(P0 §2-1)', () => {
  for (const 깨진 of [
    { ver: 1, 호흡: [] },
    { ver: 1, 호흡: [{ 차례: 2, 문장: '있다' }] },                 // ③이 없다
    { ver: 1, 호흡: [{ 차례: 3, 프롬프트: '있다' }] },              // ②가 없다
    { ver: 1, 호흡: [{ 차례: 2, 문장: '', 프롬프트: '' }] },
    null,
  ]) {
    const v = 화면과제(서버항목({ task_snapshot: 깨진 }), 폴백);
    assert.equal(v.출처, '고정', `깨진 스냅샷이 통과했다: ${JSON.stringify(깨진)}`);
    assert.ok(v.사유, '사유 없이 내려가면 원인이 화면에 안 남는다');
  }
});

test('폴백 없이는 부른 쪽이 즉시 안다 — 빈 화면을 내지 않는다', () => {
  assert.throws(() => 화면과제(null, null), /폴백/);
});

/* ── 제출 봉투 (S1-b 쓰기 절반 · C0 §4-1) ──────────────────────────────
 * 이 구역이 재는 것 하나: **앱이 조립한 사건이 계약 정본으로 검증을 통과하는가.**
 * 🔴 갈라져도 앱은 조용하다 — 증상은 「제출했는데 저장이 안 됐다」 하나뿐이고 이유는 서버에만 남는다.
 *   그래서 여기서는 계약 json 을 **실제로 넘겨** 값목록까지 대조한다(지어낸 이름은 여기서 죽는다).
 */
const 배정 = (덧 = {}) =>
  서버항목({ task_ref: `task-${날짜}`, level_snapshot: 'Lv3', goal_snapshot: '유학', ...덧 });

const 재료 = (덧) => 화면과제(배정(덧), 폴백).제출재료;

/* 한 앉음을 묶는 고리(P0 §3-1 ④) — c9 부터 **공통 필수**라 기본 항목이 들고 있어야
 * 「평범한 제출」이 된다(`lib/이벤트검증.js` 공통필수 · 절단문서 ①-10). */
const 흐름값 = '1f0c9c1e-6a2d-4c3b-8f11-2b7a5d9e0c44';

/* 멱등키도 **항목이 들고 온다**(C0 §4-1 · 절단문서 ①-5) — `lib/제출로그.js` 가 항목을 만들 때
 * 한 번 짓는다. 이 픽스처는 그 값을 손으로 박지만, 「진짜 통로가 실제로 박는가」는 손 픽스처로는
 * 못 재므로 아래 `항목추가` 를 태우는 검사를 따로 둔다. */
const 멱등값 = 'b6f1c0a2-0000-4000-8000-0000000000a5';

const 항목 = (덧 = {}) => ({
  id: `${날짜}-답하기-1`,
  date: 날짜,
  step: '답하기',
  attempt: 1,
  status: 'submitted',
  text: null,
  audio: 'file:///rec.m4a',
  created_at: '2026-08-07T02:00:00.000Z',
  correlation_id: 흐름값,
  idempotency_key: 멱등값,
  task_meta: 재료(),
  capture_app: { platform: 'android', extension: '.m4a', agc_requested: null },
  ...덧,
});

test('제출재료는 배정 행의 값 그대로다 — 앱이 지어내는 값이 하나도 없다', () => {
  const m = 재료();
  assert.equal(m.task_ref, `task-${날짜}`);
  assert.equal(m.level_snapshot, 'Lv3');
  assert.equal(m.goal_snapshot, '유학');
  /* 형식은 스냅샷의 호흡마다 다르다 — 한 칸으로 합치면 P0 §2-1 이 경계한 사고가 성립한다.
   * 🔑 `따라1~따라3` 은 ②를 문장 단위로 끊은 걸음들이라 형식이 ②와 **같다**(08-26 · 유호 확정
   *   08-23). 값은 여전히 스냅샷이 낸 것 하나고, 앱이 지어낸 형식은 여기 한 칸도 없다. */
  assert.deepEqual(m.형식, {
    따라: '낭독', 따라1: '낭독', 따라2: '낭독', 따라3: '낭독', 답하기: '자유발화',
  });
});

/* 🔴 `task_ref` 를 안 주는 서버(구 배포)에 앱이 `task-{날짜}` 를 지어내면, 배치가 작명 규칙을
 *   바꾸는 날 제출이 큐와 안 이어진다 — 그 어긋남은 어디에도 오류로 안 남는다. */
test('배정에 task_ref 가 없으면 제출재료는 null — 규칙을 사본으로 만들지 않는다', () => {
  assert.equal(화면과제(서버항목(), 폴백).제출재료, null);
  assert.equal(제출사건(항목({ task_meta: null })), null, '재료가 없으면 사건도 없다');
});

test('앱이 조립한 제출 사건이 계약 검증을 통과한다 — ②낭독·③자유발화 둘 다', () => {
  for (const [step, 형식] of [['따라', '낭독'], ['답하기', '자유발화']]) {
    const e = 제출사건(항목({ step, id: `${날짜}-${step}-1` }), 'voice/x/y.m4a');
    const v = 검증(e, 계약);
    assert.ok(v.ok, `${step}: ${v.오류들.join(' · ')}`);
    assert.equal(e.event_type, 'submission.created');
    assert.equal(e.task_type, '발화녹음');
    assert.equal(e.submission.task_format, 형식, '호흡이 자기 형식을 갖는다(P0 §2-1)');
    assert.equal(e.submission.audio_ref, 'voice/x/y.m4a');
    assert.equal(e.payload.attempt_no, 1, '재시도는 attempt 로 남는다(C0 §4-3 ③ retry_count)');
  }
});

/* 재시도가 새 행을 만들지 않는 근거는 「키가 좌표에서 나온다」가 아니라 **「항목이 키를 들고
 * 있다」**이다 — 같은 항목을 몇 번 조립해도 같은 값이 실린다. 좌표 조립으로 되돌아가면
 * `attempt` 가 로컬 로그에서 세는 값이라 재설치·다른 기기에서 1 로 되돌아가고, 그때 새 녹음이
 * 옛 행에 `duplicate` 로 접힌다(절단문서 ①-5). */
test('멱등키는 항목이 들고 온다 — 같은 항목을 두 번 조립하면 같은 키', () => {
  const 그항목 = 항목();
  const a = 제출사건(그항목, 'voice/x/1.m4a');
  const b = 제출사건(그항목, 'voice/x/2.m4a');
  assert.equal(a.idempotency_key, b.idempotency_key, '재전송이 접히는 것이 이 한 줄에 달렸다');
  assert.equal(a.idempotency_key, 멱등값, '여기서 짓지 않는다 — 항목의 값을 그대로 싣는다');
});

/* 🔴 이 검사가 ①-5 를 막는 자물쇠다. **좌표가 같고 발화가 다른** 두 항목 — 로그를 지우고
 * 다시 녹음한 그날이 정확히 이 모양이다. 좌표에서 키를 조립하면 둘이 같은 키가 되고,
 * 서버는 뒤엣것을 `duplicate` + 원래 event_id 로 **성공처럼** 돌려준다. */
test('🔴 좌표(날짜·호흡·시도)가 같아도 다른 항목이면 다른 키 — 로그 초기화가 발화를 안 지운다', () => {
  const 첫판 = 제출사건(항목({ idempotency_key: '00000000-0000-4000-8000-000000000001' }), 'voice/x/1.m4a');
  const 재설치후 = 제출사건(항목({ idempotency_key: '00000000-0000-4000-8000-000000000002' }), 'voice/x/2.m4a');
  assert.equal(첫판.payload.attempt_no, 재설치후.payload.attempt_no, '좌표는 같다(= 사고 조건)');
  assert.notEqual(첫판.idempotency_key, 재설치후.idempotency_key);
});

/* 없는 값을 지어내면 갈래가 하나 더 생기고, 그 갈래가 곧 옛 버그다(`correlation_id` 와 같은 규칙). */
test('멱등키가 없는 옛 큐 항목은 사건을 만들지 않는다 — 여기서 짓지 않는다', () => {
  assert.equal(제출사건(항목({ idempotency_key: null }), 'voice/x/1.m4a'), null);
  assert.equal(제출사건(항목({ idempotency_key: undefined, status: 'abandoned', audio: null })), null);
});

/* 무발화를 `submission.created` 로 보내면 검증을 못 지나거나(내용물 택1), 지나더라도
 * `submission_count` 가 「말 안 한 날」에 올라 「어제의 나」가 거짓말한다(C0 §4-3 ③). */
/* 🔴 2026-08-07 뒤집힘(절단문서 ①-6). 예전 이 검사는 「제출물 행을 만들지 않는다」로 위 뜻을
 *   지켰는데, 그 대가로 **어디서 막혔는지가 통째로 사라졌다** — 낭독 시작 전 이탈과 자유발화 중
 *   포기가 같은 행이 되고, 끈기·난이도 모델의 원신호는 그 둘의 차이다. 제출 수를 지키는 진짜
 *   지렛대는 행의 부재가 아니라 `event_type` 필터다: 하류 5곳(progress·tasks·deliver 둘·
 *   corrections)이 전부 그렇게 세고, `tools/배달왕복시험.js` ⑥ 이 그 자리를 지킨다. */
test('무발화는 session.abandoned — 어디서 막혔는지를 들고 가되 제출로 세어지지 않는다', () => {
  const e = 제출사건(항목({ status: 'abandoned', audio: null }));
  assert.equal(e.event_type, 'session.abandoned');
  assert.equal(e.submission.task_format, '자유발화', '어느 호흡에서 막혔는지가 없다');
  assert.equal(e.submission.task_ref, `task-${날짜}`, '어느 날 배정인지가 없으면 분모가 없다');
  assert.equal(e.submission.body_original, undefined, '내용물은 여전히 없다');
  // ⓐ 입을 안 뗀 무발화 — 올릴 파일이 없으니 참조도 없다. ⓑ(문턱 미달)는 아래 별도 회귀.
  assert.equal(e.submission.audio_ref, undefined, '올린 파일이 없는데 참조가 생겼다');
  assert.ok(검증(e, 계약).ok, 검증(e, 계약).오류들.join(' · '));
});

/* 🔴 무발화 두 갈래가 접히던 자리 — ①-6 의 한 층 아래.
 *   ⓐ 입을 안 뗐다(조각 0 · WAV 없음) / ⓑ 소리는 났는데 문턱 미달(WAV 있음 · **이미 업로드된다**).
 *   `제출사건` 이 `audio_ref` 를 버리면 두 행이 바이트 단위로 같아지고 올라간 파일은 고아가 된다.
 *   겁먹은 학생과 포기한 학생이 같은 행이 되는 것이라 이탈 예측(P0 S1-6)의 원신호가 죽는다.
 *   ⚠ 이 회귀는 **직전 테스트와 짝**이다 — 한쪽만 있으면 「늘 싣는다」·「늘 버린다」 둘 다 통과한다. */
test('문턱 미달 무발화는 자기 WAV 를 들고 간다 — ⓐ입 안 뗌과 ⓑ작게 말함이 갈린다 (①-2)', () => {
  const 작게말함 = 제출사건(항목({ status: 'abandoned' }), 'voice/x/작게말함.wav');
  assert.equal(작게말함.event_type, 'session.abandoned', '제출로 승격되면 안 된다');
  assert.equal(작게말함.submission.audio_ref, 'voice/x/작게말함.wav', '올린 파일을 가리키지 않으면 고아다');
  assert.equal(작게말함.submission.body_original, undefined, '낸 답은 여전히 없다');
  assert.ok(검증(작게말함, 계약).ok, 검증(작게말함, 계약).오류들.join(' · '));

  const 입안뗌 = 제출사건(항목({ status: 'abandoned', audio: null }));
  assert.notDeepEqual(입안뗌.submission, 작게말함.submission, '두 무발화가 같은 행이면 사후에 못 가른다');
});

test('무발화 두 호흡이 서로 다른 행이 된다 — 낭독 이탈 ≠ 자유발화 포기 (①-6)', () => {
  const 낭독 = 제출사건(항목({ step: '따라', status: 'abandoned', audio: null }));
  const 자유 = 제출사건(항목({ step: '답하기', status: 'abandoned', audio: null }));
  assert.equal(낭독.submission.task_format, '낭독');
  assert.equal(자유.submission.task_format, '자유발화');
  assert.notEqual(낭독.submission.task_format, 자유.submission.task_format);
  for (const e of [낭독, 자유]) assert.ok(검증(e, 계약).ok, 검증(e, 계약).오류들.join(' · '));
});

test('형식을 모르면 무발화도 안 보낸다 — 지어내면 그 자리가 영원히 거짓이다', () => {
  const 형식없음 = 재료();
  형식없음.형식 = { 따라: null, 답하기: null };
  assert.equal(제출사건(항목({ status: 'abandoned', audio: null, task_meta: 형식없음 })), null);
});

test('재시도(retried)도 제출 사건이다 — 자기수정이 서버에 남는다', () => {
  const e = 제출사건(항목({ status: 'retried', attempt: 2 }), 'voice/x/1.m4a');
  assert.equal(e.event_type, 'submission.created');
  assert.equal(e.payload.attempt_no, 2);
  assert.ok(검증(e, 계약).ok);
});

/* ✅ **유호님 확정 2026-08-07 = ⓑ**(C0 §4-3 ①) — 이 검사는 뒤집혔다. 08-07 실왕복에서 갓
 *   등록한 학생이 `필수 누락: level_snapshot` 으로 막혔고, 개원 첫 주(반 배정 전)가 정확히 그
 *   상태다. §4-1 이 급수를 요구한 이유가 「그때 화면이 알던 값을 그때 적는 것이 유일하게
 *   정확하다」이므로, 화면이 아무것도 몰랐으면 `null` 이 그 값이다.
 *   🔑 앱이 여기서 지는 몫은 **키를 빠뜨리지 않는 것**이다(`화면과제` 가 `|| null` 로 못박는다) —
 *   키 누락은 계속 400 이고, 그 경계의 회귀는 `tests/이벤트검증.test.js` 의 ⓑ 네 벌이 진다. */
test('ⓑ 배정에 급수가 없어도 제출은 나간다 — 첫 발화 기준선을 소급 불가로 잃지 않는다', () => {
  const e = 제출사건(항목({ task_meta: 재료({ level_snapshot: null }) }), 'voice/x/1.m4a');
  assert.equal(e.level_snapshot, null, '키가 사라지면 서버가 400 을 낸다');
  const v = 검증(e, 계약);
  assert.equal(v.ok, true, v.오류들.join(' · '));
});

test('capture_meta 는 app 만 — 잰 값은 서버 몫이다(C0 §4-2)', () => {
  const e = 제출사건(항목(), 'voice/x/1.m4a');
  assert.deepEqual(Object.keys(e.submission.capture_meta), ['app']);
  assert.ok(검증(e, 계약).ok);
  // 탐지력: `server` 를 얹으면 앱 주체 검증이 막는다(위조 방지가 실제로 도는지 여기서 잰다).
  e.submission.capture_meta.server = { sample_rate: 16000 };
  assert.equal(검증(e, 계약).ok, false, '앱이 잰 값을 선언하면 그 행은 관측이 아니라 주장이 된다');
});

test('내용물이 하나도 없으면 검증이 막는다 — 빈 제출 행을 만들지 않는다', () => {
  const e = 제출사건(항목({ audio: null, text: null }));
  assert.equal(검증(e, 계약).ok, false);
});

/* ── 한 앉음을 묶는 고리 (P0 §3-1 ④) ────────────────────────────────
 * 「②와 ③이 같은 세션에서 쌍으로 저장된다」는 **그 순간에만** 알 수 있다. 안 실어 보내면
 * 나중에 남는 근거가 `task_ref`(그날 배정)뿐인데, 그건 아침에 ②·저녁에 ③ 을 낸 날과
 * 한 흐름으로 낸 날을 같은 모양으로 만든다 — 소급 복구가 안 된다.
 * (`흐름값` 은 위 `항목` 기본값과 같은 상수다 — c9 부터 공통 필수라 기본이 들고 있다.) */

test('②③이 한 흐름이면 correlation_id 가 같고 task_format 은 다르다', () => {
  const 쌍 = ['따라', '답하기'].map((step) =>
    제출사건(항목({ step, id: `${날짜}-${step}-1`, correlation_id: 흐름값 }), `voice/x/${step}.m4a`));
  assert.equal(쌍[0].correlation_id, 흐름값);
  assert.equal(쌍[1].correlation_id, 흐름값);
  assert.notEqual(쌍[0].submission.task_format, 쌍[1].submission.task_format);
  for (const e of 쌍) assert.ok(검증(e, 계약).ok, 검증(e, 계약).오류들.join(' · '));
});

/* 무발화도 그 앉음의 일부다 — 빼면 「두 번 막히고 세 번째에 말했다」가 흐름 밖으로 흩어지고,
 * 이탈 예측(S1-6)이 보는 것이 「막힌 앉음」이 아니라 「막힌 학생」이 된다. */
test('무발화(session.abandoned)도 같은 흐름을 든다', () => {
  const e = 제출사건(항목({ status: 'abandoned', audio: null, correlation_id: 흐름값 }));
  assert.equal(e.correlation_id, 흐름값);
  assert.ok(검증(e, 계약).ok);
});

/* c9 판정 뒤집힘 — 예전엔 「없으면 `null` 로 나간다」였다(계약이 선택이었으므로).
 * 이제 공통 필수라 `null` 은 서버가 400 으로 돌려주고, 그 항목은 큐에서 영영 재시도한다.
 * 그래서 **아예 안 만든다** — 지어낸 키로 채우지도 않는다(흩어진 것을 한 앉음이라 거짓말한다). */
test('흐름이 없으면 사건을 안 만든다 — 400 루프도, 지어낸 앉음도 만들지 않는다', () => {
  assert.equal(제출사건(항목({ correlation_id: null }), 'voice/x/1.m4a'), null);
  assert.equal(제출사건(항목({ correlation_id: undefined, status: 'abandoned', audio: null })), null);
});

/* 그때 학생이 본 판을 되싣는다 (절단문서 ①-3) — `task_ref` 는 가리키기만 하고 문항은 개정된다. */
test('제출 사건은 화면이 그린 스냅샷을 그대로 되싣는다', () => {
  const e = 제출사건(항목(), 'voice/x/1.m4a');
  assert.deepEqual(e.submission.task_snapshot, 재료().task_snapshot);
  assert.equal(따라말하기문장(e.submission.task_snapshot), 도입.따라말하기);

  // 판을 못 들고 온 옛 큐 항목은 안 나간다 — 서버가 400 을 낼 사건을 만들지 않는다.
  const 판없음 = { ...재료() };
  delete 판없음.task_snapshot;
  assert.equal(제출사건(항목({ task_meta: 판없음 }), 'voice/x/1.m4a'), null);
});

/* ── 날짜 경계의 정본은 한 곳이다 (절단문서 ①-14) ───────────────────
 * 「몽골 시간대」가 네 곳에 각자 적혀 있었다: `lib/오늘과제.js` 의 `시간대`,
 * `deliver`·`tasks` 의 SQL 리터럴, 그리고 `말하기화면` 의 **기기 시계**.
 * 갈라진 날 증상은 조용하다 — 배치는 오늘에 쓰고 조회는 어제를 세며, 앱은
 * `다음시도번호` 를 남의 날 바구니에서 세어 첫 시도를 `attempt_no: 2` 로 내보낸다.
 * 그 값은 서버 행에 박혀 사후에 못 고친다(소급 불가).
 *
 * 세 맹점:
 *   ① 사람이 실제로 쓰는 표기 = IANA 이름 문자열 그대로.
 *   ② 탐지력은 **픽스처**가 진다 — 실저장소에는 「사본이 0인가」만 건다.
 *   ③ 자기 처방 — 차단 사유가 시키는 수리(`시간대` 를 가져다 쓴다)는 리터럴을
 *      안 적으므로 이 검사를 그대로 통과한다.
 * 🔑 `tools/` 는 일부러 뺀다: `배달왕복시험` 은 **대조자**라 자기 리터럴을 들어야
 *   `시간대` 가 틀린 날 같이 틀려서 초록이 되는 일이 없다(그 파일 주석에 근거를 적어 뒀다). */
const 시간대사본 = /Asia\/Ulaanbaatar/;
const 기기시계 = /getFullYear\(\)|getMonth\(\)|getDate\(\)|toLocaleDateString/;
const 출하뿌리 = ['src', 'lib', path.join('supabase', 'functions')];

function 소스들(뿌리) {
  const 나온것 = [];
  const 훑기 = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) 훑기(p);
      else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(e.name)) 나온것.push(p);
    }
  };
  훑기(path.join(ROOT, 뿌리));
  return 나온것;
}

test('픽스처 — 이 검사가 리터럴 사본과 기기 시계를 실제로 잡는다', () => {
  assert.ok(시간대사본.test("at time zone 'Asia/Ulaanbaatar'"));
  assert.ok(기기시계.test('`${d.getFullYear()}-${p(d.getMonth() + 1)}`'));
  // 처방(= 시간대를 가져다 쓴다)은 통과해야 한다 — 못 따를 처방은 우회를 정상 통로로 만든다.
  assert.equal(시간대사본.test('const { 몽골날짜, 시간대 } = 과제모듈;'), false);
  assert.equal(기기시계.test('let 그날 = 몽골날짜();'), false);
});

test('출하 코드에서 시간대를 손으로 적는 곳은 lib/몽골날짜.js 하나다', () => {
  const 정본 = path.join(ROOT, 'lib', '몽골날짜.js');
  const 사본 = 출하뿌리.flatMap(소스들)
    .filter((p) => p !== 정본 && 시간대사본.test(fs.readFileSync(p, 'utf8')))
    .map((p) => path.relative(ROOT, p));
  assert.deepEqual(사본, [],
    '시간대를 손으로 적었다 — `lib/몽골날짜.js` 의 `시간대` 를 가져다 써라(SQL 에도 ${시간대} 로 넣는다).');
});

test('앱은 날짜를 기기 시계로 끊지 않는다 — 정본은 몽골 달력이다', () => {
  const 화면 = 코드만(fs.readFileSync(path.join(ROOT, 'src', '말하기화면.js'), 'utf8'));
  assert.equal(기기시계.test(화면), false,
    '기기 시계로 날짜를 조립했다 — `몽골날짜()` 를 써라(attempt_no 가 남의 날 바구니에서 세어진다).');
  /* 🔴 `/몽골날짜/` 로는 부족하다 — **import 줄이 그대로 매치된다.** 호출을 지우고 날짜를
   *   손으로 박아도 초록이었다(변이 ④로 실측). 부르는 것까지 봐야 검사가 성립한다. */
  assert.ok(/몽골날짜\(/.test(화면), '`몽골날짜()` 를 안 부른다 — 서버를 못 받은 갈래의 날짜가 없다.');
});

/* ── c9 생산자 배선 — 「사건을 만드는 함수」와 「그것을 부르는 자리」는 다르다 ──────
 * 🔴 `열람사건()` 이 아무리 초록이어도 **아무도 안 부르면 수집은 0**이고, 그 상태의 증상은
 *   「열람이 한 건도 안 쌓인다」뿐이라 아무 데서도 안 빨개진다 — 새는 방향은 언제나 통과다.
 *   이 사건이 태어난 이유가 정확히 그 모양이었다(생산자 0 · `lib/이벤트검증.js` 생산자 장부).
 * ⚠ 천장을 알고 쓴다: RN 렌더러 없이는 **호출 여부 자체**를 못 재므로 소스 층에서 「어느
 *   콜백에 붙었나」까지만 본다(`tests/마이크권한.test.js` 통로 검사와 같은 자리).
 * 🔑 재는 것이 두 개다 — ⓐ카드에 넘겼는가 ⓑ **`onDone` 에만** 붙었는가. ⓑ 가 핵심이다:
 *   `onError` 에도 붙으면 「들었다」가 「띄웠다」로 조용히 뜻을 갈아탄다(재생이 안 된 기기도
 *   흐름은 진행되므로 그 갈래는 늘 돈다). */
const 열람배선 = (소스) => {
  const 시작 = /\bonDone:\s*\(\)\s*=>\s*\{/.exec(소스);
  const 끝 = /\bonError:\s*\(\)\s*=>\s*\{/.exec(소스);
  if (!시작 || !끝 || 끝.index < 시작.index) return { 넘김: false, 완료: false, 오류: true };
  return {
    넘김: /들었음알리기=\{열람알리기\}/.test(소스),
    완료: 소스.slice(시작.index, 끝.index).includes('들었음알리기'),
    // 🔴 `onError` 갈래는 **끝을 모른다** — 뒤 전부를 본다(닫는 괄호를 세는 순간 파서가 된다).
    오류: 소스.slice(끝.index).includes('들었음알리기'),
  };
};

test('탐지력 픽스처 — 배선이 빠지거나 엉뚱한 콜백에 붙으면 실제로 잡는다', () => {
  const 판 = (본문) => `<듣기카드 ${본문.넘김 ? '들었음알리기={열람알리기}' : ''} />
    onDone: () => { set들었다(true); ${본문.완료 ? '들었음알리기();' : ''} },
    onError: () => { set들었다(true); ${본문.오류 ? '들었음알리기();' : ''} },`;
  assert.deepEqual(열람배선(판({ 넘김: true, 완료: true, 오류: false })),
    { 넘김: true, 완료: true, 오류: false }, '온전한 배선을 통과로 못 읽으면 아래가 무의미하다');
  assert.equal(열람배선(판({ 넘김: false, 완료: true })).넘김, false, '프롭이 빠진 것을 못 잡는다');
  assert.equal(열람배선(판({ 넘김: true, 완료: false })).완료, false, '호출이 빠진 것을 못 잡는다');
  assert.equal(열람배선(판({ 넘김: true, 완료: true, 오류: true })).오류, true, 'onError 갈래를 못 잡는다');
  assert.deepEqual(열람배선('콜백이 아예 없다'), { 넘김: false, 완료: false, 오류: true },
    '모양을 못 읽었으면 통과가 아니라 미측정이다 — 그때는 빨개져야 한다');
});

test('🔴 실 화면 — 열람은 재생이 끝난 자리에만 붙어 있다 (c9 생산자)', () => {
  const r = 열람배선(fs.readFileSync(path.join(ROOT, 'src', '말하기화면.js'), 'utf8'));
  assert.equal(r.넘김, true, '듣기카드에 `들었음알리기` 를 안 넘긴다 — 카드가 알릴 길이 없다');
  assert.equal(r.완료, true, '재생 완료(onDone)에서 안 알린다 — 열람이 한 건도 안 쌓인다');
  assert.equal(r.오류, false, '재생 **실패**에서도 알린다 — 귀에 닿은 것이 없는데 열람으로 적힌다');
});

/* ── ①-2 마지막 값의 **배선** — 순수 함수가 못 보는 세 자리 ──────────────────
 * 위 `되듣기사건` 회귀는 인자를 받아 도므로 **그 인자가 어디서 오는지**는 못 본다. 셋 다 조용히
 * 샌다(새는 방향은 언제나 통과다):
 *   ⓐ 아무도 안 부르면 수집이 0 이다 — 증상은 「되듣기가 한 건도 안 쌓인다」뿐이다.
 *   ⓑ 녹음 카드에서 바로 보내면 부모(제출 사건)가 아직 없어 서버가 `retryable:false` 로 접고
 *      앱은 `send_final` 로 적는다 = 재시도가 아니라 **영구 소멸**이다.
 *   ⓒ 재생 **완주**가 아니라 버튼을 누른 순간을 세면 「들었다」가 「눌렀다」로 뜻을 갈아탄다.
 * ⚠ 흐름 순서(전송 실패 갈래에서 안 나가는가)는 여기서 **안 잰다** — 실패면 `r.event_id` 가 없고
 *   `되듣기사건` 이 `null` 을 내므로 순수 함수 층에서 이미 막힌다(위 「착지 전」 회귀가 그걸 못박는다).
 *   같은 것을 두 층에서 재면 한쪽만 낡는다. */
const 되듣기배선 = (소스) => {
  const 카드 = 소스.search(/^function 녹음카드\(/m);
  /* 🔑 **호출 자체**를 세지 인자 모양을 세지 않는다. 부모를 `r.event_id` 로 직접 받든 항목에
   *   실어 오든(§2-7 재전송 쓸이가 그렇게 부른다) ⓐⓑ 의 판정은 안 바뀐다 — 모양으로 재면
   *   리팩터가 곧 거짓 적색이고, 그 적색은 남의 배포 게이트까지 막는다.
   * ⚠ import 줄은 `되듣기사건` 뒤에 `(` 가 없어 안 걸린다(여는 괄호까지가 이 검사의 경계다). */
  const 부름 = 소스.indexOf('되듣기사건(');
  // `= null` 은 다음 시도를 위해 비우는 자리다 — 관측을 **적는** 대입만 센다.
  const 기록줄 = 소스.split('\n').filter((l) => /되들은때\.current\s*=/.test(l) && !/=\s*null/.test(l));
  return {
    부른다: 부름 >= 0,
    /* 카드 **밖**(부모)에서만 부른다 — 카드는 시각만 쥔다.
     * 🔑 모양을 못 읽었으면 통과가 아니라 미측정이다 → 나쁜 쪽 값을 낸다(위 `열람배선` 과 같은 규칙). */
    화면직송: 카드 < 0 || 부름 < 0 ? true : 부름 > 카드,
    완주만: 기록줄.length > 0 && 기록줄.every((l) => l.includes('didJustFinish')),
  };
};

test('탐지력 픽스처 — 되듣기가 안 나가거나 카드에서 바로 나가거나 누른 순간을 세면 잡는다', () => {
  const 판 = ({ 부른다 = true, 카드에서 = false, 완주 = true } = {}) => [
    'const 보내기 = async (항목) => {',
    부른다 && !카드에서 ? '  const 사건 = 되듣기사건(항목, 항목.event_id);' : '',
    '};',
    'function 녹음카드({ step }) {',
    완주 ? '  if (s.didJustFinish) 되들은때.current = new Date().toISOString();'
      : '  되들은때.current = new Date().toISOString();',
    '  되들은때.current = null;',
    부른다 && 카드에서 ? '  const 사건 = 되듣기사건(항목, 항목.event_id);' : '',
    '}',
  ].join('\n');
  assert.deepEqual(되듣기배선(판()), { 부른다: true, 화면직송: false, 완주만: true },
    '온전한 배선을 통과로 못 읽으면 아래 검사가 전부 무의미하다');
  assert.equal(되듣기배선(판({ 부른다: false })).부른다, false, '호출이 통째로 빠진 것을 못 잡는다');
  assert.equal(되듣기배선(판({ 카드에서: true })).화면직송, true, '카드에서 바로 보내는 것을 못 잡는다');
  assert.equal(되듣기배선(판({ 완주: false })).완주만, false, '누른 순간을 세는 것을 못 잡는다');
  assert.equal(되듣기배선('배선이 아예 없다').화면직송, true,
    '모양을 못 읽었으면 통과가 아니라 미측정이다 — 그때는 빨개져야 한다');
});

test('🔴 실 화면 — 되듣기는 제출이 착지한 뒤에 나가고, 완주에만 세어진다 (①-2 마지막 값)', () => {
  const r = 되듣기배선(fs.readFileSync(path.join(ROOT, 'src', '말하기화면.js'), 'utf8'));
  assert.equal(r.부른다, true, '되듣기를 아무도 안 낸다 — 수집이 0 이고 증상은 침묵뿐이다');
  assert.equal(r.화면직송, false, '녹음 카드에서 바로 보낸다 — 부모가 아직 없어 서버가 접고 영구 소멸한다');
  assert.equal(r.완주만, true, '누른 순간을 관측으로 적는다 — 「들었다」가 「눌렀다」로 갈아탄다');
});

/* ── ②-20 `/tasks` 응답이 답안지가 되지 않는다 ────────────────────────
 * 계약이 `task_snapshot` 안에 정답을 두었는데(C0 §4-1 예시 · L0 §3-3 필수 4) 서버는 그 객체를
 * 통째로 학생에게 준다. 오늘 새는 양은 0 이다 — 생산자가 따라말하기뿐이라서지 통로가 막혀서가
 * 아니다. 그래서 **탐지력은 픽스처가 진다**(맹점 ②: 버그가 아직 있을 것을 요구하지 않는다). */
const 퀴즈판 = () => ({
  ver: 1,
  날짜,
  지시문: '알맞은 것을 고르세요',
  문항: '밥을 ( ) 먹었어요',
  보기: ['먹다', '먹고'],
  정답: '먹고',
  호흡: [{ 차례: 2, 무엇: '따라 말하기', task_format: '낭독', 문장: '가', 출처: '도입', 정답: '가' }],
});

test('②-20 픽스처 — 정답은 최상위에서도 호흡 안에서도 안 나간다', () => {
  const 판 = 학생판스냅샷(퀴즈판());
  assert.equal('정답' in 판, false, '최상위 정답이 그대로 나갔다 — 응답이 답안지다.');
  assert.equal('정답' in 판.호흡[0], false, '호흡 안 정답이 그대로 나갔다.');
  // 허용된 것은 손대지 않는다(과잉 차단이면 화면이 빈다).
  assert.equal(판.ver, 1);
  assert.equal(판.날짜, 날짜);
  assert.deepEqual(판.호흡[0], { 차례: 2, 무엇: '따라 말하기', task_format: '낭독', 문장: '가', 출처: '도입' });
});

test('②-20 허용 목록이다 — 모르는 키는 적어 두지 않아도 기본 차단', () => {
  /* 🔑 이 검사가 차단 목록과 허용 목록을 가른다. 차단 목록이면 `힌트` 는 이름이 없어 그대로
   *   새고 증상은 「통과」다. 허용 목록이면 기본값이 「안 나감」이고 증상은 화면이 비는 것이다. */
  const 판 = 학생판스냅샷({ ...퀴즈판(), 힌트: '받침을 보세요', 채점기준: { 만점: 1 } });
  assert.equal('힌트' in 판, false);
  assert.equal('채점기준' in 판, false);
});

test('②-20 원본은 안 건드린다 — 거른 판을 만들 뿐이다', () => {
  const 원본 = 퀴즈판();
  학생판스냅샷(원본);
  assert.equal(원본.정답, '먹고', '입력을 파괴했다 — 배정 행에 쓸 원본이 함께 지워진다.');
  assert.equal(원본.호흡[0].정답, '가');
});

test('②-20 살아있는 생산자는 한 글자도 안 줄어든다 — 목록이 좁으면 화면이 빈다', () => {
  /* 반대 방향이다. 위 검사들은 「새면 빨갛다」를 재고, 이건 「너무 막아도 빨갛다」를 잰다.
   *   실제 배정이 통과 못 하면 학생 화면이 비는데 그 증상은 서버 로그에 안 남는다. */
  for (const 재료 of [{ 날짜, 첫날: true }, { 날짜, 교정문: '고친 문장' }, { 날짜, 전날문장: '어제 문장' }]) {
    const snap = 오늘과제(재료).task_snapshot;
    assert.deepEqual(학생판스냅샷(snap), snap, `배정이 필터에서 깎였다(${JSON.stringify(재료)}).`);
  }
});

test('②-20 걸러지지 않은 객체가 응답에 실려 나가지 않는다', () => {
  /* 필터는 최상위와 호흡 두 층만 본다. 허용 키 **안쪽**에 객체가 생기면 그 속은 아무도 안 보므로,
   *   그날 정답이 거기 숨으면 다시 샌다. 그래서 「거른 층 밖의 객체」 자체를 금지한다 —
   *   생기는 날 이 검사가 빨개지고, 목록에 층을 하나 더 낼지 그 자리에서 정하게 된다. */
  const 객체인가 = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const 평평한가 = (o, 자리) => Object.entries(o).forEach(([k, v]) => {
    const 값들 = Array.isArray(v) ? v : [v];
    값들.forEach((x) => assert.equal(객체인가(x), false,
      `${자리}.${k} 안에 거르지 않은 객체가 있다 — 학생공개키에 그 층을 내라(②-20).`));
  });
  const 판 = 학생판스냅샷(오늘과제({ 날짜, 첫날: true }).task_snapshot);
  평평한가({ ...판, 호흡: undefined }, '최상위');
  판.호흡.forEach((h, i) => {
    /* `선택지` 는 2026-08-10 부터 **걸러진 층**이다(`학생공개키.선택지`) — 그래서 그 안에 객체가
     * 있는 것이 정상이고, 대신 그 «안쪽»을 같은 규칙으로 한 층 더 잰다. 예외로 두기만 하면
     * 이 검사가 그 자리를 통째로 안 보게 되고, 그건 층을 낸 것이 아니라 눈을 감은 것이다. */
    평평한가({ ...h, 선택지: undefined }, `호흡[${i}]`);
    (h.선택지 || []).forEach((o, j) => { if (객체인가(o)) 평평한가(o, `호흡[${i}].선택지[${j}]`); });
  });
});

test('②-20 보기 «안»의 정답은 벗겨진다 — 게임 모듈이 그 모양을 낼 예정이다', () => {
  /* 탐지력을 픽스처로 못박는다(실저장소는 오늘 이 모양을 안 낸다 — 「버그가 아직 있을 것을
   * 요구하는 회귀」를 만들지 않기 위해서다). `발주_게임모듈.md` §342 가 보기와 **정답**을
   * 한 벌로 내기로 이미 정해 뒀으므로, 그날 이 검사가 아니라 **필터**가 먼저 막아야 한다. */
  const snap = {
    ver: 1, 날짜, 호흡: [{
      차례: 3, 무엇: '답하기', task_format: '응답', 프롬프트: '질문',
      선택지: [{ option_id: 'a', label: 'ㄱ', 정답: true, 오류태그: ['조사'] }, { option_id: 'b', label: 'ㄴ' }],
    }],
  };
  assert.deepEqual(학생판스냅샷(snap).호흡[0].선택지,
    [{ option_id: 'a', label: 'ㄱ' }, { option_id: 'b', label: 'ㄴ' }],
    '보기 안의 정답·오류태그가 학생 응답에 그대로 실려 나갔다');
  assert.equal(snap.호흡[0].선택지[0].정답, true, '입력을 파괴했다 — 배정 행에 쓸 원본이 함께 지워진다');
});

test('②-20 옛 판의 문자열 보기는 그대로 통과한다 — 조회가 옛 판을 고쳐 쓰지 않는다', () => {
  /* 리허설 DB 에 `선택판 v1` 이 만든 배정 행이 그대로 있고 `task_snapshot` 은 불변이다.
   * 여기서 문자열을 객체로 바꾸면 「그때 나간 판」을 조회가 되쓰는 셈이 된다. */
  const snap = { ver: 1, 날짜, 호흡: [{ 차례: 3, 무엇: '답하기', task_format: '응답', 프롬프트: 'q', 선택지: ['ㄱ', 'ㄴ'] }] };
  assert.deepEqual(학생판스냅샷(snap).호흡[0].선택지, ['ㄱ', 'ㄴ']);
});

test('②-20 목록이 비어 있지 않다 — 빈 목록은 무엇이든 통과처럼 보인다', () => {
  assert.ok(학생공개키.최상위.length > 0 && 학생공개키.호흡.length > 0);
});

test('②-20 `/tasks` 가 실제로 그 필터를 거쳐 응답한다', () => {
  /* 목록만 서고 호출부가 안 갈리면 증상이 0 이다(계약·회귀 다 초록인데 라이브만 샌다).
   *   그래서 출하 통로를 직접 읽는다 — 이 저장소가 F073·변이 ④ 로 이미 겪은 자리다. */
  const 통로 = 코드만(fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'tasks', 'index.ts'), 'utf8'));
  assert.ok(/task_snapshot:\s*학생판스냅샷\(/.test(통로),
    '`/tasks` 가 필터를 안 거친다 — `task_snapshot: 학생판스냅샷(r.task_snapshot)` 로 내보내라.');
  assert.equal(/task_snapshot:\s*r\.task_snapshot\b/.test(통로), false,
    '스냅샷을 통째로 돌려주는 줄이 남아 있다(②-20).');
});

/* 🔴 **c9 재료가 응답에서 빠지는 것을 파일 층에서 잡는 유일한 자리**(2026-08-07 변이 ⑥ 이
 *   실측한 구멍). 위 `열람배선` 은 앱만 보고, `열람사건` 회귀는 인자를 받아 도므로 **서버가
 *   그 칸을 안 실어도 둘 다 초록**이다 — 증상은 「열람이 한 건도 안 쌓인다」뿐이고 그건
 *   소급이 안 된다(개원 첫 주가 손실 창).
 * ⚠ 천장: 값이 **맞는지**는 못 잰다(배포된 판이 진짜 그 사건 id 를 싣는가는 `tools/배달왕복
 *   시험.js` ⑧ 이 진다). 여기가 잡는 것은 「칸이 통째로 사라진 것」 하나다.
 * 🔑 SQL 별칭만 봐서는 안 된다 — 변이 ⑥ 은 응답 줄만 지웠고 별칭은 남겼다. 둘을 **잇는 줄**을 본다. */
test('🔴 `/tasks` 가 배달 사건의 event_id 를 실제로 실어 보낸다 (c9 생산자의 유일한 재료)', () => {
  const 통로 = 코드만(fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'tasks', 'index.ts'), 'utf8'));
  assert.ok(/event_id:\s*r\.intervention_event_id\b/.test(통로),
    '`intervention.event_id` 가 응답에서 빠졌다 — 앱이 `parent_event_id` 로 쓸 값이 사라져 `content.viewed` 생산자가 다시 0이 된다(C0 §4-3 ①).');
  assert.ok(/개입\.event_id\s+as\s+intervention_event_id/.test(통로),
    '별칭이 사라졌다 — 위 줄이 남아 있어도 값이 늘 `undefined` 라, 증상은 「가리킬 대상이 없다」로 위장된다.');
});

/* ── 결과 변수 고리 `retry_of_event_id` (L0 §9-2 · C0 §4-1) ───────────────────
 *
 * 🔴 **설계 전체에서 결과 변수는 이것 하나다** — 없으면 엔진은 상관만 배우고 처방을 못 배운다.
 *   생산자가 0이던 이유는 이름·물리(FK)·검증기·서버 INSERT 어느 것도 아니었다. 넷 다 서 있었고
 *   끊긴 자리는 **배달**이다: `functions/deliver` 의 교정 lateral 이 `corrected_text` 만 집고
 *   그 교정이 어느 제출에 대한 것이었는지를 버렸다. 그래서 교정문이 다음 날 ②슬롯에 나가도
 *   앱에는 고리를 채울 재료 자체가 없었다(appsscript `docs/_ops/학습데이터_전층감사.md` 잔여 🔴).
 *
 * 🔑 이 네 검사는 **한 사슬의 네 마디**다 — deliver(집기·박기) → tasks(싣기) → 앱(되싣기).
 *   한 마디만 빠져도 나머지 셋은 전부 초록이고 증상은 「결과축이 늘 비어 있다」 하나뿐이다.
 *   그 모양은 「아직 재제출한 학생이 없다」와 구분되지 않는다 = 새는 방향이 통과다.
 * ⚠ 천장: 값이 **맞는지**는 여기서 못 잰다(배포된 판이 진짜 그 사건 id 를 싣는가는
 *   `tools/배달왕복시험.js` 몫). 여기가 잡는 것은 마디 하나가 통째로 사라지는 것이다.
 */
const 원사건값 = 'e1e1e1e1-0000-4000-8000-00000000beef';

test('교정문 날의 제출 사건이 원 제출을 가리킨다 — 결과 변수의 유일한 생산자', () => {
  const e = 제출사건(항목({ task_meta: 재료({ retry_of_event_id: 원사건값 }) }), 'voice/x/1.m4a');
  assert.equal(e.retry_of_event_id, 원사건값);
  // 지어낸 칸이 아니라 계약이 낸 이름인지까지 본다 — 아니면 서버가 400 으로 접고 그 발화는 사라진다.
  assert.ok(검증(e, 계약).ok, 검증(e, 계약).오류들.join(' · '));
});

test('교정문 날이 아니면 그 칸은 아예 없다 — null 을 박으면 「재시도 아님」과 「모름」이 한 모양이다', () => {
  assert.equal(재료().retry_of_event_id, null, '배정이 안 주면 재료도 null — 앱이 지어내지 않는다');
  const e = 제출사건(항목(), 'voice/x/1.m4a');
  assert.equal('retry_of_event_id' in e, false);
});

test('무발화는 재제출이 아니다 — `session.abandoned` 에는 안 싣는다', () => {
  const e = 제출사건(
    항목({ status: 'abandoned', audio: null, task_meta: 재료({ retry_of_event_id: 원사건값 }) }));
  assert.equal(e.event_type, 'session.abandoned');
  assert.equal('retry_of_event_id' in e, false, '받고 안 한 날은 이미 분모로 남는다 — 성과로 세면 안 된다');
});

test('🔴 배달·조회 두 마디가 실제로 서 있다 — 앱만 초록인 사슬은 값이 영영 안 온다', () => {
  const 배달 = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'deliver', 'index.ts'), 'utf8');
  assert.ok(/case\s+when\s+e\.event_type\s*=\s*'submission\.created'\s+then\s+e\.event_id\s+end\s+as\s+원사건/.test(배달),
    '교정 lateral 이 원 제출 사건을 안 집는다(또는 술어 없이 집는다) — 사슬이 첫 마디에서 끊기면 아래 셋은 전부 초록이고, 술어가 없으면 engine.submissions 의 **제출 아닌 행**(배정 행도 거기 산다 · tools/교정확정.js:75)을 가리켜 뜻 없는 값이 결과축에 들어온다.');
  assert.ok(/재발화고리\s*=\s*결정\.출처\s*===\s*'교정문'/.test(배달),
    '판정을 `결정.출처` 에서 파생시키지 않으면 첫날 규칙(교정문이 있어도 도입이 이긴다)이 두 곳에 적히고 갈라진 쪽이 조용히 통과한다.');
  assert.ok(/retry_of_event_id,\s*source_kind/.test(배달) && /\$\{재발화고리\}::uuid/.test(배달),
    '배정 INSERT 가 그 값을 안 박는다 — lateral 이 집어 와도 행에 안 남으면 `/tasks` 가 줄 것이 없다.');

  const 조회 = 코드만(fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'tasks', 'index.ts'), 'utf8'));
  assert.ok(/e\.retry_of_event_id/.test(조회) && /retry_of_event_id:\s*r\.retry_of_event_id\b/.test(조회),
    '`/tasks` 응답에서 고리가 빠졌다 — 별칭만 남고 응답 줄이 없으면 앱 값은 늘 `undefined` 다(위 c9 변이 ⑥ 과 같은 모양).');
});

/* ── B3 배정 0인 날 구제 (C0 심문 · 소급 불가) ────────────────────────────────
 * 🔴 무엇이 새고 있었나: 배치가 죽은 날·첫배정이 실패한 날 `/tasks` 는 빈 배열을 낸다. 그러면
 *   앱은 고정 도입 과제로 내려가고(`화면과제` → `제출재료: null`) `src/제출API.js` 가 `끝: true`
 *   로 접는다 — 그날 학생이 말한 것은 **기기에만 남고 사건이 되지 않는다.** 다음 날 배치가 돌아도
 *   어제 목소리는 소급되지 않는다.
 * 🔑 판정은 **행동으로** 잰다. 조건 셋을 `/tasks` 안에 인라인으로 적었으면 소스 글자로만 잴 수
 *   있고, 글자 검사는 조건 하나를 통째로 죽여도 초록이다(F287 · 같은 날 실측). */

test('🔴 B3 — 배정 0 · 동의 있음 · 오늘 이 셋이 다 맞을 때만 구제한다', () => {
  const 기본 = { 배정수: 0, 막힘: null, 날짜: '2026-08-09', 오늘: '2026-08-09' };
  assert.equal(구제할까(기본), true, '셋이 다 맞는데 안 부르면 그날 발화가 통째로 사라진다');

  assert.equal(구제할까({ ...기본, 배정수: 1 }), false, '이미 배정이 있는데 부르면 배치를 헛되이 때린다');
  assert.equal(구제할까({ ...기본, 막힘: { code: 'CONSENT_MISSING' } }), false,
    '동의 없는 학생은 deliver 가 skipped 라 결과가 같다 — 안 가르면 그 학생의 매 요청이 배치를 때린다');
  assert.equal(구제할까({ ...기본, 날짜: '2026-08-08' }), false,
    '어제를 조회하면서 부르면 **오늘** 배정이 서고 응답은 그대로 빈다 — 고친 것 없이 남의 날짜에 행을 만든다');
});

test('B3 — 못 재는 값을 「부른다」로 접지 않는다 (새는 방향은 늘 부르는 쪽이다)', () => {
  for (const 상황 of [undefined, null, {}, { 배정수: 0, 막힘: null, 날짜: '', 오늘: '' }]) {
    assert.equal(구제할까(상황), false, `${JSON.stringify(상황)} 을 통과시켰다`);
  }
  /* 막힘은 **모양이 아니라 있음**으로 본다 — `{}` 도 막힘이다(빈 객체를 「안 막힘」으로 읽으면
   * 동의 게이트가 모양을 바꾼 날 조용히 부르기 시작한다). */
  assert.equal(구제할까({ 배정수: 0, 막힘: {}, 날짜: 'x', 오늘: 'x' }), false);
});

test('🔴 B3 배선 — `/tasks` 가 그 판정을 **불러서** 쓰고, 새 배정 통로를 만들지 않는다', () => {
  const 조회 = 코드만(fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'tasks', 'index.ts'), 'utf8'));

  assert.ok(/구제할까\(\{[^}]*배정수:/.test(조회),
    '`구제할까` 를 안 부른다 — 조건을 인라인으로 다시 적으면 판정이 두 곳에 살고 갈라진 쪽이 통과한다');
  assert.ok(/deliver\?learner_id=/.test(조회),
    '기존 단건 통로를 안 쓴다 — 배정을 만드는 코드는 `deliver` 하나여야 한다');

  /* 🔴 배정을 여기서 직접 만들면 생성 통로가 셋이 된다(deliver · auth 첫배정 · 여기).
   *   갈라진 쪽이 낸 행은 계약 밖 모양이고, 증상은 「앱이 이상하다」뿐이다. */
  assert.equal(/insert\s+into\s+engine\.learning_events/i.test(조회), false,
    '`/tasks` 가 배정 행을 직접 만든다 — 조회가 쓰기를 겸하면 재시도 한 번이 곧 데이터 오염이다');

  /* ⚠ 루프 금지 — 불러도 여전히 0일 수 있다(오늘 대상이 아닌 학생). 다시 부르면 그건 재시도가
   *   아니라 매 요청마다 배치를 때리는 것이다. 재조회는 **정확히 한 번**이다. */
  assert.equal((조회.match(/await 배정읽기\(\)/g) || []).length, 2,
    '배정 재조회가 1회(최초 1 + 구제 뒤 1)가 아니다 — 루프가 생겼거나 구제가 사라졌다');
  assert.equal(/while\s*\(|for\s*\([^)]*배정읽기/.test(조회), false, '구제가 반복문 안에 들어갔다');

  /* 🔴 구제 실패가 200 을 깨면 안 된다 — 「빈 상태는 오류가 아니다」(C0 §4-3)가 이 함수의 계약이다.
   * ⚠ **함수 본문을 떼어내서** 본다. 처음엔 `/지금세우기[\s\S]{0,900}?catch/` 로 쟀는데
   *   `catch__없음` 으로 바꿔도 초록이었다(변이 M6) — 낱말이 **들어 있는지**만 보면 표기로 샌다. */
  const 세우기본문 = (조회.match(/async function 지금세우기[\s\S]*?\n\}/) || [''])[0];
  assert.ok(세우기본문.length > 200, '`지금세우기` 본문을 못 떼어냈다 — 못 잰 것을 통과로 접지 않는다');
  assert.ok(/\btry\s*\{/.test(세우기본문) && /\}\s*catch\s*\(/.test(세우기본문),
    '구제 호출이 예외를 안 삼킨다 — 네트워크가 한 번 흔들리면 정상 경로(빈 배열 200)가 500 이 된다');
  assert.ok(/결과: '실패'/.test(세우기본문),
    '삼키기만 하고 실패를 안 알린다 — 구제가 죽은 날과 안 죽은 날이 같은 모양이 된다');
  /* 🔑 08-15 에 **한 칸 더 세졌다**: 종전엔 `return '실패'` 하나였고, 그러면 「실패했다」는 알리되
   *   «왜»는 여전히 로그에만 남았다(그 로그는 무료 플랜에서 하루 뒤 사라진다). 이제 사유까지
   *   봉투로 나간다 — 이 줄이 없으면 이 함수는 옛 모양으로 조용히 되돌아갈 수 있다. */
  assert.ok(/사유: `deliver:\$\{r\.status\}/.test(세우기본문),
    '실패는 알리는데 «왜»가 없다 — 상태 없이 「실패」만 오면 고칠 사람이 누구인지가 응답에서 사라진다');
});

/* ── 선택 규칙의 판 (`policy_ver`) ────────────────────────────────────────────
 * 🔴 이 묶음이 닫는 것 = **생산자 0**. 열은 c6 부터 물리에 있었고 읽는 자(`lib/성과회수.js`)도
 *   서 있었는데 쓰는 코드가 0줄이라, 「무슨 규칙이 이걸 골랐나」가 행에 한 번도 안 남았다.
 *
 * ■ 여기서 «무엇을» 재는가 — 판 **이름**이 아니라 판이 내던 **행동**이다.
 *   이름만 재면 규칙을 고치고 이름을 안 올린 날 그대로 초록이고, 그때 두 규칙으로 낸 개입이
 *   같은 이름표를 달고 섞인다. 섞인 뒤에는 못 푼다 — 어느 행이 어느 규칙이었는지 아무 데도 없다.
 *
 * ■ 세 맹점(CLAUDE.md)
 *   ① 사람이 쓰는 표기 — 지문은 실제 `오늘과제()` 반환값에서 뽑는다(소스 글자가 아니다).
 *   ② 버그가 있을 것을 요구하지 않는다 — 「갈래를 전부 밟는가」를 따로 재서, 지문이 **원리상
 *      못 지키는 자리**(안 밟은 갈래)를 드러낸다. 안 재면 갈래가 죽어도 지문은 안정적이다.
 *   ③ 자기 처방 — 차단 사유가 시키는 길(판 올리고 장부에 줄 추가)이 실제로 통과하는지 밟아 본다.
 */
const crypto = require('node:crypto');

/* 판이 «무엇을 하던 판»이었나 — 결정 갈래를 전수로 돌려 그 «결과»만 모은다.
 * 🔑 `policy_ver` 자체는 재료에서 뺀다. 넣으면 이름만 바꿔도 지문이 움직여
 *   「규칙이 바뀌었다」와 「이름만 바뀌었다」가 같은 모양이 된다. */
const 결정목록 = () => {
  const 날 = '2026-01-02';
  const 상황들 = [
    {}, { 첫날: true }, { 첫날: true, 교정문: '고친 문장.' }, { 교정문: '고친 문장.' },
    { 전날문장: '어제 문장.' }, { 교정문: '고친 문장.', 전날문장: '어제 문장.' },
    { 첫날: true, 전날문장: '어제 문장.' },
  ];
  const 급수들 = [null, '', '미정', 'Lv1', 'Lv2', 'Lv3', 'Lv6', '중급', 0, 1, 2, 3, 6];
  const 목록 = [];
  for (const 상황 of 상황들) {
    for (const 급수 of 급수들) {
      const r = 오늘과제({ 날짜: 날, 급수, ...상황 });
      목록.push({
        상황, 급수,
        결정: { 출처: r.출처, degraded: r.degraded, task_ref: r.task_ref, task_snapshot: r.task_snapshot },
      });
    }
  }
  return 목록;
};
const 결정재료 = (목록) => (목록 || 결정목록()).map((x) => JSON.stringify([x.상황, x.급수, x.결정])).join('\n');
const 결정지문 = (목록) => crypto.createHash('sha256').update(결정재료(목록)).digest('hex').slice(0, 16);
const 답하기호흡 = (d) => d.task_snapshot.호흡.find((h) => h.차례 === 3);

test('오늘과제가 **자기 판에 서명한다** — 이 값이 곧 행의 policy_ver 다', () => {
  for (const 재료 of [{ 날짜, 첫날: true }, { 날짜 }, { 날짜, 교정문: '고친 문장.' }]) {
    assert.equal(오늘과제(재료).policy_ver, 선택판,
      '결정이 판을 안 들고 나온다 — 부르는 쪽이 상수를 따로 박으면 그 판정이 두 곳에 산다');
  }
  assert.match(선택판, /^오늘과제\.v\d+$/, '판 이름 규약(`오늘과제.vN`)을 벗어났다');
  assert.ok(선택판 in 판지문,
    `장부에 없는 판이 나간다: ${선택판} — 옛 줄을 고치지 말고 **새 줄을 추가**한다`);

  /* 장부에 새 줄만 넣고 `선택판` 을 안 올리면 **옛 판이 계속 나간다** — 그 상태는 지문 검사를
   * 지나간다(옛 판의 지문은 여전히 맞다). 「올렸다고 믿는데 안 올라간 것」이라 증상이 없다. */
  const 번호 = (v) => Number(/\d+$/.exec(v)[0]);
  const 최고 = Object.keys(판지문).reduce((a, b) => (번호(b) > 번호(a) ? b : a));
  assert.equal(선택판, 최고,
    `장부에는 ${최고} 가 있는데 나가는 것은 ${선택판} 이다 — 줄만 넣고 선택판을 안 올렸다`);
});

/* 🔑 변이 M5 가 뚫고 나간 자리(2026-08-09 실측). `policy_ver: 선택판` 을 `policy_ver: '오늘과제.v1'`
 *   로 베껴도 **오늘은 값이 같아** 위 검사가 전부 초록이었다. 갈라지는 날은 판을 올린 날이고,
 *   그때 행에는 고른 적 없는 이름이 찍히는데 아무 데서도 안 빨개진다 — 같은 판정을 두 곳에
 *   적으면 목록이 갈린다는 그 자리다(CLAUDE.md 가드 맹점 ④).
 * ⚠ 값 비교로는 원리상 못 잡는다(둘이 같으니까). 그래서 여기만 **소스**를 본다 — 단 파일
 *   어딘가가 아니라 그 함수 본문을 떼어내서(낱말 검사는 주석 한 줄로 샌다). */
test('② 판을 **상수로** 실어야 한다 — 리터럴을 베끼면 올린 날 조용히 갈린다 (변이 M5)', () => {
  const 소스 = 코드만(fs.readFileSync(path.join(ROOT, 'lib', '오늘과제.js'), 'utf8'));
  const 본문 = (소스.match(/function 오늘과제\([\s\S]*?\n\}/) || [''])[0];
  assert.ok(본문.length > 400, '`오늘과제` 본문을 못 떼어냈다 — 못 잰 것을 통과로 접지 않는다');
  /* ⚠ `선택판\b` 로 쓰면 **원리상 안 맞는다** — 한글은 JS 정규식의 word 문자가 아니라 그
   *   뒤의 경계가 성립하지 않는다(실측: 이 검사의 첫 판이 거짓양성이었다 · 맹점 ①). */
  assert.match(본문, /policy_ver:\s*선택판\s*,/,
    '결정이 `선택판` 상수를 안 싣는다 — 판을 올린 날 고른 규칙과 찍히는 이름이 갈린다');
  assert.equal(/policy_ver:\s*['"`]/.test(본문), false,
    '판 이름을 리터럴로 베꼈다 — 오늘은 값이 같아 초록이고, 갈라지는 것은 판을 올린 날이다');
});

test('🔴 규칙을 고치고 판을 안 올리면 빨개진다 — 두 규칙이 한 이름표로 섞이는 것을 막는다', () => {
  const 실측 = 결정지문();
  assert.equal(실측, 판지문[선택판], [
    `선택 규칙의 «행동»이 바뀌었는데 판은 ${선택판} 그대로다.`,
    `  장부: ${판지문[선택판]}    실측: ${실측}`,
    '→ 바꾼 것이 맞다면: `lib/오늘과제.js` 의 `선택판` 을 다음 번호로 올리고',
    `   \`판지문\` 에 새 줄을 **추가**한다('오늘과제.vN': '${실측}'). 옛 줄은 지우지 않는다 —`,
    '   옛 행이 그 이름을 그대로 들고 있다.',
    '→ 바꾼 적이 없다면 우선순위 네 갈래·`초급인가` 문턱·`도입` 문구 중 하나가 의도치 않게 움직였다.',
  ].join('\n'));
});

test('② 지문 재료가 갈래를 전부 밟는다 — 안 밟는 갈래는 이 지문이 **원리상** 못 지킨다', () => {
  const 결정 = 결정목록().map((x) => x.결정);
  const 뽑기 = (f) => new Set(결정.map(f));

  for (const 출처 of ['도입', '교정문', '전날']) {
    assert.ok(뽑기((d) => d.출처).has(출처), `우선순위 갈래 「${출처}」를 한 번도 안 밟는다`);
  }
  for (const v of [true, false]) {
    assert.ok(뽑기((d) => d.degraded).has(v), `강등 ${v} 인 결정이 재료에 없다`);
  }
  for (const f of ['응답', '자유발화']) {
    assert.ok(뽑기((d) => 답하기호흡(d).task_format).has(f),
      `③ 형식 「${f}」를 안 밟는다 — 급수 갈래가 죽어도 지문은 안정적이다`);
  }
  for (const p of [도입.답하기, 도입.첫날답하기]) {
    assert.ok(뽑기((d) => 답하기호흡(d).프롬프트).has(p), `프롬프트 「${p}」를 안 밟는다`);
  }
  // 재료가 통째로 한 답으로 접히면 지문은 무엇도 못 지킨다 — 그 자리를 숫자로 못박는다.
  assert.ok(뽑기((d) => JSON.stringify(d)).size >= 6,
    '서로 다른 결정이 6가지도 안 나온다 — 매트릭스가 갈래를 못 만들고 있다');
});

test('② 탐지력 — 규칙 하나만 바뀌어도 지문이 움직인다 (픽스처로 잰다)', () => {
  const 원본 = 결정목록();
  const 기준 = 결정지문(원본);

  /* 실저장소를 흔들지 않고 **결과만** 한 자리 바꿔 본다. 실제 규칙 변경이 만드는 것과 같은
   * 모양의 차이다(문구 한 글자·형식 한 칸·강등 한 건·우선순위 한 갈래). 넷 다 지문을 움직여야 한다. */
  const 흔들기 = [
    ['도입 문구 한 글자', (m) => { m[0].결정.task_snapshot.호흡[0].문장 += '.'; }],
    ['③ 형식 한 칸', (m) => { m[0].결정.task_snapshot.호흡[1].task_format = '낭독'; }],
    ['강등 한 건', (m) => { m[0].결정.degraded = !m[0].결정.degraded; }],
    ['우선순위 결과', (m) => { m[0].결정.출처 = '전날'; }],
  ];
  for (const [이름, 흔들] of 흔들기) {
    const 사본 = JSON.parse(JSON.stringify(원본));
    흔들(사본);
    assert.notEqual(결정지문(사본), 기준, `「${이름}」이 바뀌었는데 지문이 안 움직인다`);
  }
});

test('③ 자기 처방 — 「판을 올리고 장부에 줄을 추가한다」가 실제로 통과한다', () => {
  /* 차단 사유가 시키는 명령을 그 가드에 되먹인다(CLAUDE.md 가드 맹점 ③).
   * 따를 수 없는 처방은 우회를 정상 통로로 만든다 — 그래서 처방 자체를 밟아 본다. */
  const 바뀐목록 = JSON.parse(JSON.stringify(결정목록()));
  바뀐목록[0].결정.출처 = '전날';                       // 규칙이 바뀐 척
  const 새지문 = 결정지문(바뀐목록);
  const 새판 = '오늘과제.v2';
  const 새장부 = { ...판지문, [새판]: 새지문 };          // 처방: 새 줄을 **추가**한다

  assert.equal(새장부[새판], 새지문, '처방대로 고쳤는데 지문 검사가 여전히 빨갛다');
  assert.ok(새판 in 새장부 && 선택판 in 새장부,
    '새 줄을 더하면서 옛 줄이 사라졌다 — 옛 행이 그 이름을 그대로 들고 있다');
  assert.match(새판, /^오늘과제\.v\d+$/, '처방이 이름 규약을 못 지나간다');
});

test('🔴 배달이 그 판을 **행에 박는다** — 순수 함수만 서 있으면 칸은 여전히 빈다', () => {
  const 소스 = 코드만(fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'deliver', 'index.ts'), 'utf8'));
  /* 파일 어딘가에 낱말이 있는지가 아니라 **개입 insert 안**에 있는지를 본다 — 낱말 검사는
   * 주석에 이름만 남겨도 초록이 된다(이 파일이 이미 변이로 겪은 자리 · 이제 위에서 주석을
   * 지우고 열지만, 구간을 좁히는 이 수법은 그대로 둔다 — 둘은 서로를 대신하지 않는다).
   * 🔑 「첫 insert」 로 집지 않는다 — ④가 게임 배정 insert 를 개입 insert 앞에 두면서 위치
   *   앵커가 죽었다(엉뚱한 열 목록을 재고 빨개진다). 문서 위치가 아니라 내용으로 집는다. */
  const 개입insert = 소스.split(/insert into engine\.learning_events/)
    .filter((s) => s.includes("'intervention.delivered'"))
    .map((s) => `insert into engine.learning_events${s}`)[0] || '';
  assert.ok(개입insert.length > 400, '개입 insert 를 못 떼어냈다 — 못 잰 것을 통과로 접지 않는다');
  const 열목록 = (개입insert.match(/\(([\s\S]*?)\)\s*values/) || ['', ''])[1];
  assert.ok(/\bpolicy_ver\b/.test(열목록),
    '개입 행의 열 목록에 policy_ver 가 없다 — 칸은 c6 부터 있는데 writer 가 0이다');
  assert.ok(/\$\{결정\.policy_ver\}/.test(개입insert),
    'policy_ver 를 `결정` 에서 안 받는다 — 상수를 여기 다시 적으면 고른 규칙과 찍히는 이름이 갈린다');
});

test('policy_ver 는 서버칸이다 — 앱이 「내 개입은 v2 가 골랐다」를 선언할 수 없어야 한다', () => {
  const { 서버칸 } = require('../lib/이벤트검증.js');
  assert.ok(서버칸.includes('policy_ver'),
    '서버칸이 아니면 앱이 보낸 값이 그대로 저장되고, 규칙별 성과가 기기 주장 위에서 계산된다');
  const 필드 = Object.values(계약.learning_events.필드).flat();
  assert.ok(필드.includes('policy_ver'),
    '계약 필드 목록에 없다 — 계약만 읽는 소비자(Apps Script·n8n·다음 세션)는 이 값이 실재하는 줄 모른다');
});

/* ── `choice.selected` 생산자 (S1-5 · 2026-08-10) ─────────────────────────────
 * 🔑 **실계약 검증기를 직접 먹인다.** 조립기만 시험하면 「내가 낸 모양을 내가 읽는다」만
 *   증명되고, 1단계에서 두 가지(0-based position · 「안 골랐다」 거부)가 그렇게 잡혔다. */
const 고름항목 = (덧) => ({
  id: '2026-08-07-답하기-1',
  date: 날짜,
  step: '답하기',
  attempt: 1,
  status: 'submitted',
  created_at: '2026-08-07T10:00:00Z',
  correlation_id: '11111111-2222-4333-8444-555555555555',
  idempotency_key: '99999999-8888-4777-8666-555555555555',
  task_meta: { task_ref: `task-${날짜}`, level_snapshot: 1 },
  선택: 선택payload({
    차원: 차원들.도입평일,
    보기: 보기세우기([{ option_id: 'a', label: 'ㄱ' }, { option_id: 'b', label: 'ㄴ' }], null, (n) => Array.from({ length: n }, (_, i) => i)),
    고른것: 'a',
    시작: 0,
    끝: 1200,
  }),
  선택때: '2026-08-07T09:59:00Z',
  ...덧,
});

test('🔑 선택사건이 계약을 지나는 `choice.selected` 를 만든다', () => {
  const 사건 = 선택사건(고름항목());
  const v = 검증(사건, {});
  assert.equal(v.ok, true, `계약을 못 지난다: ${(v.오류들 || []).join(' · ')}`);
  assert.equal(사건.event_type, 'choice.selected');
  assert.equal(사건.payload.position, 1, 'position 은 1부터 센다(L0 §140) — 0부터 세면 전 행이 한 칸 밀린다');
  assert.equal(사건.payload.selected_option, 'a');
  assert.equal(사건.payload.recommended_option, null, '밀지 않은 날을 정직하게 안 적었다');
});

test('🔴 고름의 시각은 **고른 그 순간**이다 — 제출 시각으로 대신하지 않는다', () => {
  /* 그 사이 학생이 녹음을 몇 번 다시 하면 몇 분이 벌어지고, 그러면 「언제 마음을 정했나」가
   * 통째로 밀린다. `latency_ms` 가 재는 것과 다른 값이라 둘 다 필요하다. */
  assert.equal(선택사건(고름항목()).occurred_at, '2026-08-07T09:59:00Z');
  assert.equal(선택사건(고름항목({ 선택때: null })).occurred_at, '2026-08-07T10:00:00Z',
    '고른 때를 못 쥔 항목은 제출 시각으로 내려가야 한다 — 사건을 통째로 버리지 않는다');
});

test('🔴 멱등키는 항목에서 파고, 제출·되듣기 키와 겹치지 않는다', () => {
  const 항목 = 고름항목();
  const 키 = 선택사건(항목).idempotency_key;
  assert.equal(키, `${항목.idempotency_key}:choice`);
  assert.notEqual(키, 항목.idempotency_key, '제출과 같은 키면 서버가 둘 중 하나를 duplicate 로 접는다');
  assert.notEqual(키, `${항목.idempotency_key}:replay`, '되듣기와 키가 겹친다');
  // 같은 항목을 몇 번 조립해도 같은 값이라 재전송이 두 벌을 안 만든다.
  assert.equal(선택사건(고름항목()).idempotency_key, 키);
});

test('고른 적이 없거나 재료가 모자라면 사건을 안 만든다 — 지어내지 않는다', () => {
  assert.equal(선택사건(고름항목({ 선택: null })), null, '고른 적 없는 앉음에 사건을 지어냈다');
  assert.equal(선택사건(고름항목({ correlation_id: null })), null, '앉음 키 없이 보내면 400 이고 큐가 영원히 재시도한다');
  assert.equal(선택사건(고름항목({ idempotency_key: null })), null, '멱등키를 여기서 지으면 좌표 조립으로 되돌아간다');
  assert.equal(선택사건(null), null);
});

test('🔴 고름은 **제출과 독립**이다 — 부모를 달지 않는다', () => {
  /* 되듣기는 부모가 그 제출 사건이라 착지를 기다리지만(`되듣기사건`), 고름은 다르다.
   * 부모를 달면 제출이 영영 못 나가는 날(회선·동의 막힘) 그날의 「무엇에 끌렸나」까지 죽는다. */
  const 사건 = 선택사건(고름항목());
  assert.equal(사건.parent_event_id, undefined, '부모를 달았다 — 제출의 운명에 고름이 묶인다');
  assert.equal(검증(사건, {}).ok, true, '부모 없이는 계약을 못 지나는지 확인한다(지나야 맞다)');
});

test('급수는 그때 화면이 알던 값이다 — 사흘 밀려 올라가도 그날 값', () => {
  assert.equal(선택사건(고름항목()).level_snapshot, 1);
  assert.equal(선택사건(고름항목({ task_meta: null })).level_snapshot, null,
    '급수를 모르는 앉음은 null 이 유일하게 정확한 값이다 — 키는 남는다(C0 §4-3 ① ⓑ)');
});

/* ── 스냅샷의 보기 → `{option_id, label}` 정규화 ────────────────────────────── */
test('🔴 옛 판의 문자열 보기가 살아남는다 — 새 모양만 받으면 화면이 조용히 자유발화가 된다', () => {
  const snap = (선택지) => ({ ver: 1, 날짜, 호흡: [{ 차례: 3, 무엇: '답하기', task_format: '응답', 프롬프트: 'q', 선택지 }] });
  /* `선택판 v1` 이 만든 배정 행이 리허설 DB에 그대로 있고 `task_snapshot` 은 불변이다(L0 §3-3).
   * 그때 존재한 유일한 식별자가 문구뿐이므로 id 를 문구로 둔다 — 없는 값을 지어내지 않는다. */
  assert.deepEqual(답하기선택지(snap(['ㄱ', 'ㄴ'])), [{ option_id: 'ㄱ', label: 'ㄱ' }, { option_id: 'ㄴ', label: 'ㄴ' }]);
  assert.deepEqual(답하기선택지(snap([{ option_id: 'a', label: 'ㄱ' }, { option_id: 'b', label: 'ㄴ' }])),
    [{ option_id: 'a', label: 'ㄱ' }, { option_id: 'b', label: 'ㄴ' }]);
});

test('못 가리키는 보기는 버리고, id 가 겹치면 통째로 접는다', () => {
  const snap = (선택지) => ({ ver: 1, 날짜, 호흡: [{ 차례: 3, 무엇: '답하기', task_format: '응답', 프롬프트: 'q', 선택지 }] });
  /* id 가 겹치면 「무엇을 골랐나」가 두 곳을 가리킨다 — `lib/선택로그.보기세우기` 도 같은 판정으로
   * 조립을 거부하는데, 거기서 막히면 화면은 이미 그린 뒤다(학생이 고른 것이 통째로 사라진다). */
  assert.equal(답하기선택지(snap([{ option_id: 'a', label: 'ㄱ' }, { option_id: 'a', label: 'ㄴ' }])), null);
  // 보기가 하나뿐이면 조립기가 어차피 거부한다(2개 미만) — 고를 수 있는데 기록이 안 남는 화면을 안 그린다.
  assert.equal(답하기선택지(snap([{ option_id: 'a', label: 'ㄱ' }])), null);
  assert.equal(답하기선택지(snap([{ label: 'id 없음' }, { option_id: 'b', label: 'ㄴ' }])), null,
    'id 없는 보기를 버린 뒤 남은 하나로 화면을 그렸다');
  assert.equal(답하기선택지(snap(null)), null);
  assert.equal(답하기선택지(null), null);
});

/* ── 선택의 «차원»이 배정에서 앱까지 흐른다 (c9 ③ `choice_dimension`)
 *
 * 🔑 앱은 이 값을 **지어낼 수 없다** — 서버가 낸 보기와 앱이 붙인 축이 갈리면 그 행은
 *   어디서도 안 빨개진다. 그래서 스냅샷에 실려야 하고, 스냅샷은 불변이라 **나중에 넣을 자리가
 *   없다**(L0 §3-3). 아래는 그 통로가 끊기지 않았는가를 배정→필터→화면 순으로 잰다. */

test('🔴 배정이 보기와 «축»을 한 벌로 낸다 — 첫날과 평일이 서로 다른 축이다', () => {
  const 평일 = 호흡(오늘과제({ 날짜, 급수: 'Lv1' }), 3);
  assert.deepEqual(평일.선택지, 도입.평일답하기선택.보기들);
  assert.equal(평일.선택차원, 차원들.도입평일, '보기는 평일 것인데 축이 안 따라왔다');

  const 첫날 = 호흡(오늘과제({ 날짜, 급수: 'Lv1', 첫날: true }), 3);
  assert.deepEqual(첫날.선택지, 도입.첫날답하기선택.보기들);
  assert.equal(첫날.선택차원, 차원들.도입첫날);

  /* 자유발화 날엔 보기가 없으니 축도 없다 — `null` 을 실으면 「보기 없는 응답」과
   * 「애초에 자유발화」가 행에서 같은 모양이 된다(같은 자리의 `선택지` 규약). */
  assert.equal(호흡(오늘과제({ 날짜, 급수: 'Lv5' }), 3).선택차원, undefined);
});

test('🔴 학생 공개 필터가 축을 벗기지 않는다 — 벗기면 앱이 축을 몰라 `null` 로 적는다', () => {
  const snap = 학생판스냅샷(오늘과제({ 날짜, 급수: 'Lv1' }).task_snapshot);
  assert.equal(호흡({ task_snapshot: snap }, 3).선택차원, 차원들.도입평일,
    '허용 목록이 이 칸을 걸렀다 — 그 손실은 소급이 없다(스냅샷은 불변)');
});

test('🔑 옛 배정 행에는 축이 없다 — 「모른다」로 접고 사건은 살린다', () => {
  /* `선택판 v2` 이전 행에는 이 칸 자체가 없다. 여기서 거부하면 그 학생의 선택이 통째로
   * 안 나간다 — 차원 하나를 얻으려고 사건을 잃는 거래다(`lib/선택로그` 와 같은 판정). */
  const 옛판 = { ver: 1, 날짜, 호흡: [{ 차례: 3, 무엇: '답하기', task_format: '응답', 선택지: ['ㄱ', 'ㄴ'] }] };
  assert.equal(답하기차원(옛판), null);
  assert.ok(답하기선택지(옛판), '옛 행의 보기까지 같이 죽었다');

  /* 모르는 값도 **거부가 아니라 접기**다 — 서버가 준 데이터를 읽는 층이라 성격이 다르다
   * (조립기는 거부한다: 그쪽은 프로그래머 실수를 시험에서 죽이는 자리). */
  assert.equal(답하기차원({ ver: 1, 날짜, 호흡: [{ 차례: 3, 선택차원: 'intro-daily' }] }), null);
});

test('🔴 도입 보기가 안정 id 를 든다 — 문구를 다듬어도 옛 행이 살아남는 유일한 이유', () => {
  for (const [이름, 쌍] of [['평일답하기선택', 도입.평일답하기선택], ['첫날답하기선택', 도입.첫날답하기선택]]) {
    const 보기들 = 쌍.보기들;
    /* 🔴 보기와 축은 **한 객체**여야 한다 — 나란한 두 상수로 갈리면 「첫날 보기 + 평일 축」이
     *   조용히 성립하고, 그렇게 적힌 행은 어디서도 안 빨개진다(`lib/오늘과제.도입` 주석). */
    assert.ok(차원들 && Object.values(차원들).includes(쌍.차원), `${이름}: 축이 아는 차원이 아니다`);
    assert.equal(보기들.length, 2, `${이름} 이 둘이 아니다`);
    for (const o of 보기들) {
      assert.equal(typeof o.option_id, 'string', `${이름}: id 가 문자열이 아니다`);
      assert.ok(o.option_id && !o.option_id.includes('○'), `${이름}: id 에 문구를 넣었다 — 문구를 고치는 날 옛 행과 갈린다`);
      assert.equal(typeof o.label, 'string');
    }
    assert.notEqual(보기들[0].option_id, 보기들[1].option_id, `${이름}: 두 보기의 id 가 같다`);
  }
});

/* ── 창안생성중 — T8 재판정(유호 픽 C · 08-24 결정.md)의 판정 그 자체 ──────────────
 * 참 = 구제(폴백)가 잡을 잡아채지 않는다. 새는 방향은 「잡아챈다」(새벽형 매일 강등)라,
 * 값을 먹여 행동으로 잰다(구제할까와 같은 규칙 — 글자 검사는 조건을 죽여도 초록이다). */
test('창안생성중 — 마감 전 대기·claimed·적재실패만 참이다(생성중상태들과 같은 집합)', () => {
  for (const 상태 of 생성중상태들) {
    assert.equal(창안생성중({ 상태, 마감뒤: false }), true, `${상태}(마감 전)가 구제에 잡아채였다 — T8 그 병`);
    assert.equal(창안생성중({ 상태, 마감뒤: true }), false, `${상태}(마감 뒤)는 「못 왔다」다 — 구제가 접어야 한다`);
  }
  assert.deepEqual([...생성중상태들], ['대기', 'claimed', '적재실패'], '집합이 바뀌었다 — assignment_status 「생성중」과 한 몸인지 재확인하라');
});

test('창안생성중 — 잡 없음·터미널 상태는 거짓(구제 몫 그대로 · 전멸일 안전망 불변)', () => {
  assert.equal(창안생성중(null), false, '잡 없는 날(전멸일·활성 전)이 생성중으로 읽히면 구제가 통째로 죽는다');
  assert.equal(창안생성중(undefined), false);
  for (const 상태 of ['착지', '마감폴백', '대상아님']) {
    assert.equal(창안생성중({ 상태, 마감뒤: false }), false, `터미널 ${상태} 가 생성중으로 읽혔다 — 구제가 영영 안 돈다`);
  }
});
