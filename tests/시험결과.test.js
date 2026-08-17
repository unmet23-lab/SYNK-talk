'use strict';
/**
 * `lib/시험결과.js` — `exam.result`(TOPIK 실성적) 조립기의 회귀.
 *
 * ■ 이 시험이 지는 몫
 *   조립기가 **순수 함수**라 DB·화면 없이 규격 전량을 돌 수 있다. 그래서 생산자(강사 화면)가
 *   서기 전인 지금도 이 규격은 이빨을 갖는다 — 화면을 짓는 세션은 여기 적힌 거절을 그대로
 *   화면 문구로 쓰면 되고, 규격이 바뀌면 여기가 먼저 빨개진다.
 *
 * ■ 🔑 검사의 축은 「막느냐」가 아니라 **「무엇이 조용히 통과하느냐」**다
 *   이 사건의 위험은 거부가 아니라 **맞는 얼굴로 틀린 값**이다: 미래 응시일·모의고사에 붙은
 *   정식 회차·오타 난 영역 이름은 전부 «저장은 되고 나중에 안 읽히는» 모양이라, 강사도
 *   엔진도 아무 신호를 못 받는다. 아래 항목들이 그 자리를 하나씩 짚는다.
 */

const test = require('node:test');
const assert = require('node:assert');

const { 시험payload, 멱등키, 종류들, 영역들, 급수최소, 급수최대 } = require('../lib/시험결과.js');

/** 통과하는 최소 입력 — 각 검사는 여기서 **한 칸만** 흔든다(둘을 같이 흔들면 무엇이 잡았는지 모른다). */
const 온전한 = () => ({ exam_kind: 'topik_official', exam_date: '2026-08-01', exam_level: 4 });
const 지금 = '2026-08-17T00:00:00.000Z';

test('필수 셋이 다 있으면 payload 가 나온다 — 선택 칸은 «없는 채로» 나온다', () => {
  const r = 시험payload(온전한(), { 지금 });
  assert.ok('payload' in r, `온전한 입력이 거부됐다: ${JSON.stringify(r)}`);
  assert.deepEqual(r.payload, { exam_kind: 'topik_official', exam_date: '2026-08-01', exam_level: 4 });
  /* 🔴 빈 값을 «만들어» 넣지 않는다 — `exam_round: null` 을 채우면 「1회차」·「0점」과 헷갈리는
   *   자리가 생기고, 나중에 「안 적었다」와 「모른다고 적었다」를 못 가른다. */
  assert.ok(!('exam_round' in r.payload) && !('section_scores' in r.payload),
    '안 준 선택 칸이 payload 에 만들어졌다 — 없는 것과 비운 것이 같은 모양이 된다');
});

test('필수 셋은 하나씩 다 막는다 — 그리고 막힌 칸의 이름을 댄다', () => {
  for (const 칸 of ['exam_kind', 'exam_date', 'exam_level']) {
    const 입력 = 온전한();
    delete 입력[칸];
    const r = 시험payload(입력, { 지금 });
    assert.ok('흠' in r, `${칸} 없이 통과했다`);
    assert.equal(r.흠.필드, 칸, `막긴 막았는데 다른 칸 이름을 댔다 — 화면이 엉뚱한 칸을 빨갛게 만든다`);
  }
});

test('🔴 급수 0 은 «값»이다 — 「안 봤다」와 「봤는데 급수가 안 나왔다」를 접지 않는다', () => {
  const r = 시험payload({ ...온전한(), exam_level: 0 }, { 지금 });
  assert.ok('payload' in r, '0 을 「빈 값」으로 읽어 거부했다 — 불합격이 이 학생에 대한 가장 강한 정보 중 하나다');
  assert.equal(r.payload.exam_level, 0);
});

test('급수는 범위 밖·정수 아님을 막는다', () => {
  for (const v of [-1, 7, 3.5, '4', null]) {
    assert.ok('흠' in 시험payload({ ...온전한(), exam_level: v }, { 지금 }), `급수 ${JSON.stringify(v)} 가 통과했다`);
  }
  for (let v = 급수최소; v <= 급수최대; v += 1) {
    assert.ok('payload' in 시험payload({ ...온전한(), exam_level: v }, { 지금 }), `급수 ${v} 가 막혔다`);
  }
});

test('🔴 모르는 시험 종류는 막는다 — 오타가 조용히 새 종류를 만들면 집계가 영영 갈린다', () => {
  const r = 시험payload({ ...온전한(), exam_kind: 'topik_offical' }, { 지금 });
  assert.ok('흠' in r && r.흠.필드 === 'exam_kind');
  for (const k of Object.keys(종류들)) {
    assert.ok('payload' in 시험payload({ ...온전한(), exam_kind: k }, { 지금 }), `아는 종류 ${k} 가 막혔다`);
  }
});

test('🔴 미래 응시일을 막는다 — 그 오타는 «조용히» 산다', () => {
  /* 시즌 구간 필터에 안 걸려 「성적이 없는 시즌」이 되고, 강사는 분명히 넣었으므로 아무도 안 찾는다. */
  const r = 시험payload({ ...온전한(), exam_date: '2026-08-18' }, { 지금 });
  assert.ok('흠' in r && r.흠.필드 === 'exam_date', '내일 본 시험이 통과했다');
  assert.ok('payload' in 시험payload({ ...온전한(), exam_date: '2026-08-17' }, { 지금 }), '오늘 응시가 막혔다');
});

test('없는 날짜·틀린 꼴을 막는다 — `Date` 가 조용히 굴리는 자리', () => {
  for (const d of ['2026-02-31', '2026-13-01', '2026-8-1', '20260801', '', '어제']) {
    assert.ok('흠' in 시험payload({ ...온전한(), exam_date: d }, { 지금 }), `응시일 "${d}" 이 통과했다`);
  }
});

test('🔴 회차는 정식 응시에만 붙는다 — 모의에 붙으면 난도 보정이 엉뚱한 기준에 맞춘다', () => {
  assert.ok('payload' in 시험payload({ ...온전한(), exam_round: 93 }, { 지금 }));
  const r = 시험payload({ exam_kind: 'topik_mock', exam_date: '2026-08-01', exam_level: 3, exam_round: 93 }, { 지금 });
  assert.ok('흠' in r && r.흠.필드 === 'exam_round', '모의고사에 정식 회차가 붙었다');
  /* 모의고사 자체는 회차 없이 그대로 지난다 — 막는 것은 회차지 모의가 아니다. */
  assert.ok('payload' in 시험payload({ exam_kind: 'topik_mock', exam_date: '2026-08-01', exam_level: 3 }, { 지금 }));
});

test('🔴 모르는 영역 이름을 막는다 — `writting` 이 통과하면 그 뒤 집계는 두 이름을 따로 센다', () => {
  const r = 시험payload({ ...온전한(), section_scores: { writting: 70 } }, { 지금 });
  assert.ok('흠' in r && r.흠.필드 === 'section_scores', '오타 난 영역이 통과했다');
  const ok = 시험payload({ ...온전한(), section_scores: { listening: 80, reading: 75 } }, { 지금 });
  assert.ok('payload' in ok, '아는 영역 일부만 준 것이 막혔다 — 성적표의 한 칸만 아는 날이 정상이다');
  assert.deepEqual(Object.keys(ok.payload.section_scores).sort(), ['listening', 'reading']);
  for (const 이름 of 영역들) {
    assert.ok('payload' in 시험payload({ ...온전한(), section_scores: { [이름]: 50 } }, { 지금 }), `아는 영역 ${이름} 이 막혔다`);
  }
});

test('영역 점수는 0~100 정수 · 빈 객체는 「모른다」가 아니라 흠이다', () => {
  for (const v of [-1, 101, 70.5, '70']) {
    assert.ok('흠' in 시험payload({ ...온전한(), section_scores: { reading: v } }, { 지금 }), `점수 ${v} 가 통과했다`);
  }
  assert.ok('흠' in 시험payload({ ...온전한(), section_scores: {} }, { 지금 }),
    '빈 객체가 통과했다 — 모르면 칸 자체를 비우는 것과 「비어 있다고 적는 것」은 다르다');
});

test('payload 는 입력 객체를 물고 가지 않는다 — 나중에 호출부가 고쳐도 안 흔들린다', () => {
  const 점수 = { listening: 80 };
  const r = 시험payload({ ...온전한(), section_scores: 점수 }, { 지금 });
  점수.listening = 10;
  assert.equal(r.payload.section_scores.listening, 80, '조립된 payload 가 호출부의 객체를 참조로 들고 있다');
});

test('🔴 멱등키 — 같은 학생·같은 시험·같은 날은 한 번이다(시각을 안 섞는다)', () => {
  const a = 멱등키('L1', 'topik_official', '2026-08-01');
  assert.equal(a, 멱등키('L1', 'topik_official', '2026-08-01'), '같은 입력이 다른 키를 냈다 — 두 번 누르면 두 번 응시로 쌓인다');
  /* 세 축이 각각 키를 가른다 — 하나라도 안 가르면 다른 시험이 한 행으로 접힌다. */
  assert.notEqual(a, 멱등키('L2', 'topik_official', '2026-08-01'));
  assert.notEqual(a, 멱등키('L1', 'topik_mock', '2026-08-01'));
  assert.notEqual(a, 멱등키('L1', 'topik_official', '2026-08-02'));
});

test('계약과 붙어 있다 — 필수 셋·선택 둘이 계약 「시험」 그룹의 이름 그대로다', () => {
  /* 🔑 이름이 갈리면 조립기가 만든 payload 를 계약 소비자가 못 찾는다. 그 갈림은 런타임에
   *   아무 오류도 안 내고(payload 는 자유 jsonb 다) 읽는 쪽에서 조용히 `undefined` 로 나온다. */
  const 계약 = require('../계약/수집_교정_계약.json');
  const 그룹 = 계약.learning_events.필드.시험;
  assert.deepEqual([...그룹].sort(), ['exam_date', 'exam_kind', 'exam_level', 'exam_round', 'section_scores'].sort(),
    '계약 「시험」 그룹과 조립기가 아는 이름이 갈렸다');

  const 전부 = 시험payload({ ...온전한(), exam_round: 93, section_scores: { writing: 60 } }, { 지금 });
  assert.ok('payload' in 전부);
  for (const 이름 of Object.keys(전부.payload)) {
    assert.ok(그룹.includes(이름), `조립기가 계약에 없는 이름 ${이름} 을 냈다`);
  }
});

test('생산자 장부가 아직 «사유»다 — 화면이 서면 이 줄이 먼저 빨개진다', () => {
  /* 🔑 이 검사는 **낡음 탐지**다. 강사 화면이 서는 커밋은 장부를 파일로 바꾸는데, 그때 이
   *   줄을 안 고치면 여기서 잡힌다. 반대로 지금 초록인 것은 「조립기만 섰다」가 참이라는 뜻이다
   *   (`lib/선택로그.js` 가 지나온 자리와 같은 형태). */
  const { 생산자 } = require('../lib/이벤트검증.js');
  const 줄 = 생산자['exam.result'];
  assert.ok(줄 && 줄.사유 && !줄.파일,
    '생산자가 파일로 바뀌었다 — 그러면 이 시험의 전제(조립기만 섰다)가 낡았다: 이 줄과 엔진도달 장부를 함께 갱신하라');
  assert.ok(/시험결과/.test(줄.사유),
    '사유가 조립기를 안 가리킨다 — 다음 주자가 「무엇이 이미 섰는지」를 못 찾는다');
});
