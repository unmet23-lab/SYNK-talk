'use strict';
/* 관통검증 회귀 — 관통왕복시험 「아니야」 N 계열(--아니야)의 순수 판정 조각을 리허설 없이 못박는다.
 *
 * 🔴 분모부터 잰다 — 부정할 카드가 애초에 없거나, 뺄 축 줄이 애초에 안 실린 픽스처면 「뺐다」와 「아무 일도
 *   없었다」가 같은 초록이다(F207). 그래서 매 검사가 «부정 전 실림»을 먼저 단언한다.
 * 🔑 재료는 손으로 지은 축 객체가 아니라 학습자상태() 를 실제로 돌린 실물이다(과제요약.test 와 같은 규율) —
 *   상류가 모양을 바꾼 날 여기서 같이 빨개진다. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const 관통검증 = require('../lib/관통검증.js');
const { 확인사건, 부정키들, 부정키, 후보순서 } = require('../lib/성향확인.js');
const { 과제요약 } = require('../lib/과제요약.js');
const { 코드만 } = require('./lib/소스검사.js');

const ROOT = path.resolve(__dirname, '..');
const 시간대 = 'Asia/Ulaanbaatar';
const 기준 = '2026-09-11T03:00:00.000Z';
const 오늘 = '2026-09-11';
const 일 = 86400000;
const 전 = (밀리) => new Date(Date.parse(기준) - 밀리).toISOString();
let 번호 = 0;
const 사건 = (t, at, 더 = {}) => ({ event_id: `E${(번호 += 1)}`, event_type: t, occurred_at: at, ingested_at: at, ...더 });

/** 관통왕복 아니야A 와 같은 무늬 — 배정 3(마감 있음) · 마감 전 제출 3 → 리듬 후보(여유제출·반복제출)가 선다. */
function 원행들() {
  const 행 = [];
  for (let d = 3; d >= 1; d -= 1) {
    행.push(사건('task.assigned', 전(d * 일), { due_at: 전(d * 일 - 12 * 3600000), task_type: '발화녹음' }));
    행.push(사건('submission.created', 전(d * 일 - 3600000), { task_type: '발화녹음', payload: null }));
  }
  return 행;
}
const 키들 = { correlation_id: 'c0ffee00-0000-4000-8000-0000000000a1', idempotency_key: 'k-아니야-1' };

test('확인카드파생 — 첫 카드가 lib 사슬(학습자상태 → 확인카드)로 서고 다섯 칸을 다 든다 (분모)', () => {
  const { 카드, 상태 } = 관통검증.확인카드파생(원행들(), { 기준, 시간대 });
  assert.ok(카드, '첫 카드가 없다 — 이 픽스처로는 부정할 것이 없다(분모 소실)');
  assert.deepEqual(관통검증.카드칸빠짐(카드, 관통검증.확인카드칸들), [], '카드가 다섯 칸을 다 안 든다');
  const 쌍 = 관통검증.카드쌍(카드);
  assert.equal(쌍.trait_axis, '리듬', '안 물은 축은 고정 우선순위(리듬 먼저)다 — 첫 카드의 축이 리듬이 아니다');
  assert.ok(후보순서.includes(쌍.shown_key), `키가 후보 공간 밖이다: ${쌍.shown_key}`);
  assert.equal(카드.estimate_as_of, 기준, 'estimate_as_of 는 파생 기준시각 그대로다(사건이 되싣는 값)');
  assert.ok(String(카드.estimator_version).startsWith(상태.estimator_version), '추정판이 상태의 판을 앞에 안 단다');
  // 재료 결함은 위로 던진다 — as_of 없이 조용히 카드를 지어내지 않는다(학습자상태 규율 그대로).
  assert.throws(() => 관통검증.확인카드파생(원행들(), { 시간대 }), /as_of/);
});

test('부정뒤이력 — 그 쌍에 「아니다」 뒤의 다음 카드는 같은 쌍이 아니고, 전부 부정되면 null 이다', () => {
  const { 카드: 첫 } = 관통검증.확인카드파생(원행들(), { 기준, 시간대 });
  assert.ok(첫, '분모 소실 — 첫 카드가 없다');
  const 이력 = 관통검증.부정뒤이력(첫, 오늘);
  assert.deepEqual(이력, {
    오늘답수: 1, 오늘답한키들: [부정키(첫.trait_axis, 첫.shown_key)], 부정키들: [부정키(첫.trait_axis, 첫.shown_key)],
    축별마지막날: { [첫.trait_axis]: 오늘 },
  }, 'progress 가 같은 행에서 조립하는 이력 모양과 다르다');
  const { 카드: 다음 } = 관통검증.확인카드파생(원행들(), { 기준, 시간대, 이력 });
  assert.ok(다음, '이 픽스처엔 다른 후보(반복제출·집중띠)가 있어야 한다 — 다음 카드가 null 이면 픽스처가 얇다');
  assert.equal(관통검증.같은쌍(다음, 첫), false, '부정된 쌍이 다시 나왔다 — 재노출 금지가 깨졌다');
  // 후보를 전부 부정하면 카드가 없다 — 그리고 «없음 = 없음»은 같다(둘 다 null).
  const 전부 = [];
  for (let 이력n = 관통검증.부정뒤이력(첫, 오늘), 카드 = 다음; 카드; ) {
    전부.push(부정키(카드.trait_axis, 카드.shown_key));
    이력n = { ...이력n, 부정키들: [...이력n.부정키들, ...전부] };
    카드 = 관통검증.확인카드파생(원행들(), { 기준, 시간대, 이력: 이력n }).카드;
    assert.ok(전부.length < 20, '후보가 끝나지 않는다');
  }
  assert.ok(전부.length >= 1, '분모 — 부정할 다음 후보가 하나는 있어야 한다');
  assert.equal(관통검증.같은쌍(null, null), true);
  assert.equal(관통검증.같은쌍(null, 첫), false);
  assert.equal(관통검증.같은쌍(첫, { trait_axis: 첫.trait_axis, shown_key: 첫.shown_key }), true, '쌍 객체로도 같다');
  assert.throws(() => 관통검증.부정뒤이력({ trait_axis: '리듬' }, 오늘), /쌍/);
});

test('사슬 — 확인사건(아니다) 행 → 부정키들 → 과제요약: 그 축 줄이 빠지고 axes_used 는 정확히 그 축 하나만 준다 (분모 먼저)', () => {
  const 행 = 원행들();
  const { 카드, 상태 } = 관통검증.확인카드파생(행, { 기준, 시간대 });
  assert.ok(카드, '분모 소실 — 첫 카드가 없다');
  const 축 = 카드.trait_axis;
  const 앞 = 과제요약(상태, { 목표: 'study' });
  assert.ok(관통검증.축줄있나(앞.요약, 축) && 앞.axes_used.includes(축), `분모 소실 — ${축} 줄이 애초에 안 실렸다: ${앞.요약}`);

  const 사건행 = 확인사건(카드, '아니다', 키들);               // 앱이 보내는 봉투 그대로
  assert.ok(사건행 && 사건행.payload.response === '아니다');
  const 키목록 = 부정키들([사건행]);                            // 도구의 SQL 심기 뒤 deliver 가 원신호에서 뽑는 그 규칙
  assert.deepEqual(키목록, [부정키(축, 카드.shown_key)], '부정 키가 정확히 하나여야 아래가 실측이다');
  const 뒤 = 과제요약(상태, { 목표: 'study', 부정키들: 키목록 });
  assert.equal(관통검증.축줄있나(뒤.요약, 축), false, `부정된 축의 줄이 벤더 입력에 남았다: ${뒤.요약}`);
  assert.deepEqual(관통검증.축차이(앞.axes_used, 뒤.axes_used), { 빠진: [축], 늘어난: [] },
    'B(부정 없음) 대비 A(부정) 의 axes_used 차가 «그 축 하나»가 아니다');
  // 「맞다」 는 부정이 아니다 — 같은 카드에 맞다로 답한 B 는 한 줄도 안 빠진다(N2 의 B 쪽 분모).
  assert.deepEqual(부정키들([확인사건(카드, '맞다', 키들)]), []);
});

test('축줄있나 — «줄» 이 단위다: 줄 시작 「{축}: 」 만 세고, 다른 줄 안의 낱말·접두 변형·빈 값은 안 센다', () => {
  assert.equal(관통검증.축줄있나('리듬: 제출률=1 n=3\n끈기: 완주율=1', '리듬'), true);
  assert.equal(관통검증.축줄있나('끈기: 완주율=1\n리듬: 제출률=1', '리듬'), true, '둘째 줄도 줄이다');
  assert.equal(관통검증.축줄있나('확인: 축=리듬 아니다수=1', '리듬'), false, '다른 줄 안의 축 이름을 줄로 셌다');
  assert.equal(관통검증.축줄있나('리듬률: 1', '리듬'), false, '접두가 같다고 그 축 줄이 아니다');
  assert.equal(관통검증.축줄있나('리듬:제출률=1', '리듬'), false, '과제요약 모양(콜론 뒤 공백)이 아니면 줄이 아니다');
  assert.equal(관통검증.축줄있나('', '리듬'), false);
  assert.equal(관통검증.축줄있나(null, '리듬'), false);
  assert.equal(관통검증.축줄있나('리듬: 1', ''), false, '빈 축 이름은 아무 줄도 아니다');
});

test('축차이 — 빠진·늘어난을 갈라 세고 순서를 지키며 중복은 접는다', () => {
  assert.deepEqual(관통검증.축차이(['리듬', '끈기', '확인'], ['끈기', '확인']), { 빠진: ['리듬'], 늘어난: [] });
  assert.deepEqual(관통검증.축차이(['끈기'], ['끈기', '확인', '리듬']), { 빠진: [], 늘어난: ['확인', '리듬'] });
  assert.deepEqual(관통검증.축차이(['리듬', '리듬'], []), { 빠진: ['리듬'], 늘어난: [] });
  assert.deepEqual(관통검증.축차이(null, undefined), { 빠진: [], 늘어난: [] });
});

test('카드칸빠짐 — 없는·null·빈 문자열·빈 배열 칸을 이름으로 돌려주고, 카드가 아니면 전부 빠짐이다', () => {
  const { 카드 } = 관통검증.확인카드파생(원행들(), { 기준, 시간대 });
  assert.deepEqual(관통검증.카드칸빠짐(카드, 관통검증.확인카드칸들), []);
  assert.deepEqual(관통검증.카드칸빠짐({ ...카드, shown_text: '' }, 관통검증.확인카드칸들), ['shown_text']);
  assert.deepEqual(관통검증.카드칸빠짐({ ...카드, estimate_as_of: null }, 관통검증.확인카드칸들), ['estimate_as_of']);
  assert.deepEqual(관통검증.카드칸빠짐(null, 관통검증.확인카드칸들), [...관통검증.확인카드칸들]);
  const 목표 = { class_date: 오늘, 키: '오늘목표', 문장: ['오늘 목표는 지켰어요?'], 답라벨: {}, card_version: 'v1' };
  assert.deepEqual(관통검증.카드칸빠짐(목표, 관통검증.목표카드칸들), []);
  assert.deepEqual(관통검증.카드칸빠짐({ ...목표, 문장: [] }, 관통검증.목표카드칸들), ['문장'], '빈 배열은 빈 칸이다');
  assert.deepEqual(관통검증.카드칸빠짐(카드, 관통검증.목표카드칸들), [...관통검증.목표카드칸들], '확인 카드는 목표 칸을 하나도 안 든다');
});

test('검증장부 — 검사 0건은 못쟀다(미실행 ≠ 통과) · ✗ 는 전부를 이기고 · 못쟀다는 ✓ 를 이긴다', () => {
  const 소리 = [];
  const 부름 = [];
  const 장부 = 관통검증.검증장부(['N1', 'N2', 'N3'], {
    확인: (이름, 조건) => { 부름.push(이름); return !!조건; },
    알림: (칸, 이유) => 소리.push(`${칸}|${이유}`),
  });
  // 분모 — 아무것도 안 잰 장부는 통과가 아니다.
  assert.deepEqual(장부.칸들, ['N1', 'N2', 'N3']);
  assert.equal(장부.상태('N1'), '못쟀다');
  assert.equal(장부.줄(), '???');
  assert.equal(장부.전부초록(), false, '0건인데 초록이다 — 미실행이 통과의 얼굴을 한다(F207)');
  assert.equal(장부.요약(), 'N1 못쟀다 · N2 못쟀다 · N3 못쟀다');

  assert.equal(장부.잰다('N1', '하나', true, {}), true);
  assert.equal(부름[0], 'N1 하나', '골격 확인에 「칸 이름」으로 안 넘긴다 — 출력에서 어느 검증점인지 안 보인다');
  assert.equal(장부.상태('N1'), '✓');
  assert.equal(장부.잰다('N2', '둘', 1, {}), true);
  assert.equal(장부.잰다('N2', '셋', 0, {}), false);
  assert.equal(장부.상태('N2'), '✗', '✗ 하나면 그 칸은 ✗ 다');
  장부.잰다('N3', '넷', true, {});
  장부.못쟀다('N3', '배포판 ≠ 소스');
  장부.못쟀다('N3', '토큰 없음');
  assert.equal(장부.상태('N3'), '못쟀다', '못쟀다 표식은 ✓ 를 이긴다');
  assert.equal(장부.못쟀다표.N3, '배포판 ≠ 소스 · 토큰 없음', '사유가 이어 붙지 않는다');
  assert.deepEqual(소리, ['N3|배포판 ≠ 소스', 'N3|토큰 없음'], '알림은 «새 사유»만 낸다(도구 출력 모양)');
  assert.equal(장부.줄(), '✓✗?');
  assert.equal(장부.요약(), 'N1 ✓ · N2 ✗ · N3 못쟀다');
  assert.equal(장부.전부초록(), false);
  // 확인 없이도 같은 규칙 · 전부 ✓ 면 초록.
  const 민 = 관통검증.검증장부(['V1']);
  민.잰다('V1', '', 'truthy');
  assert.equal(민.전부초록(), true);
  assert.equal(민.줄(), '✓');
  // 재료 결함은 던진다 — 모르는 칸·빈 칸·겹친 칸을 조용히 삼키면 그 검증점은 영원히 «못쟀다»로도 안 남는다.
  assert.throws(() => 장부.잰다('V9', 'x', true), /모르는 칸/);
  assert.throws(() => 장부.못쟀다('V9', 'x'), /모르는 칸/);
  assert.throws(() => 관통검증.검증장부([]), /0개/);
  assert.throws(() => 관통검증.검증장부(['N1', 'N1']), /겹친다/);
});

/* ── 도구 등록층 — 순수 조각이 있어도 도구가 안 물면 리허설에서 옛 판정이 돈다 ── */
test('관통왕복시험 — N 계열은 --아니야 뒤에만 서고, 장부·연성 게이트를 lib·골격에서 문다', () => {
  const 소스 = fs.readFileSync(path.join(ROOT, 'tools', '관통왕복시험.js'), 'utf8');
  const 코드 = 코드만(소스);
  assert.match(코드, /const 아니야 = process\.argv\.includes\('--아니야'\)/, '플래그 판독이 없다');
  assert.match(코드, /const N = 아니야 \? 관통검증\.검증장부\(\['N1', 'N2', 'N3'\]/, 'N 장부가 플래그 뒤에 안 선다');
  assert.ok((코드.match(/관통검증\.검증장부\(/g) || []).length >= 2, 'V 장부가 lib 을 안 쓴다 — 판정이 두 벌이다');
  assert.match(코드, /const 연성게이트함수들 = \['progress'\]/, 'progress 연성 스코프 선언이 없다');
  assert.match(코드, /연성함수목록: 아니야 \? 연성게이트함수들 : \[\]/, '연성 스코프가 플래그 없이도 실리거나 아예 안 실린다');
  assert.match(코드, /배포판낡음\.progress/, '연성 낡음을 N1·N3 못쟀다로 안 접는다');
  assert.match(코드, /확인사건\(카드, 응답/, '부정 행을 앱 봉투(확인사건)로 안 짓는다 — 키를 손으로 적는 자리가 생긴다');
  assert.ok(!/V[6-9]/.test(코드), 'V6~V9 는 엔진 v3 §3-5-1 예약 번호다 — N 계열에 쓰지 않는다');
});
