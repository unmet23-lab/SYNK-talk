/* 과제생성 회귀 — §5-3 응답 계약 전 갈래·§4-2 상한 경계·요청 몸통 옵션을 못박는다.
 * ㉤ SQL 파서(engine.gen_parse_sentence)와의 봉투 경로 동치는 마이그 원문 검사로 잰다 —
 * 벤더를 갈면 두 층을 같이 갈아야 한다는 계약이 기계에 물린다. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  생성요청몸통, 생성응답읽기, 입력초과인가, 응답초과인가,
  응답스키마, 상한_코드포인트, 프롬프트지문, 본문템플릿, 렌더,
} = require('../lib/과제생성.js');

const 봉투 = (글) => ({ content: [{ type: 'text', text: 글 }], usage: { output_tokens: 1 } });
const 정상글 = '{"sentence":"주말에 등산을 갔어요.","question":"주말에 뭐 했어요?"}';

test('정상 응답 — 두 키를 그대로 꺼낸다', () => {
  assert.deepEqual(생성응답읽기(봉투(정상글)),
    { 값: { sentence: '주말에 등산을 갔어요.', question: '주말에 뭐 했어요?' } });
});

test('§5-3 갈래 전부 «응답파손» 하나로 접는다 — 새 자유 문자열 금지(§4-2)', () => {
  const 갈래들 = [
    [null, 'text 블록 0개'],
    [봉투('멀쩡한 JSON 아님'), 'JSON'],
    [봉투('[1,2]'), '객체'],
    [봉투('{"sentence":"문장뿐이에요."}'), 'question'],
    [봉투('{"sentence":"","question":"질문?"}'), 'sentence'],
    [봉투('{"sentence":"문장.","question":"질문?","extra":1}'), '미지 키'],
  ];
  for (const [입력, 사유조각] of 갈래들) {
    const r = 생성응답읽기(입력);
    assert.equal(r.오류, '응답파손', JSON.stringify(r));
    assert.match(r.사유, new RegExp(사유조각), `사유가 갈래를 안 가리킨다: ${r.사유}`);
  }
});

test('복수 오류는 첫 오류 하나 — 표 순서(필수 키가 미지 키보다 먼저)', () => {
  const r = 생성응답읽기(봉투('{"question":"질문?","extra":1}'));
  assert.match(r.사유, /sentence/, '순서를 안 정하면 같은 응답이 실행마다 다른 사유로 남는다');
});

test('상한 경계 — 정확히 8000 은 통과, 8001 은 초과(입력·응답이 같은 상수 하나)', () => {
  const 딱 = '가'.repeat(상한_코드포인트);
  assert.equal(입력초과인가(딱), false);
  assert.equal(입력초과인가(딱 + '가'), true);
  assert.equal(응답초과인가(딱), false);
  assert.equal(응답초과인가(딱 + '가'), true);
  assert.equal(상한_코드포인트, 8000, '상한이 §11-2 와 갈렸다');
});

test('요청 몸통 — model 필수(리터럴 0 · 유호님 몫) · thinking 명시 off · 구조화 출력 새 이름', () => {
  assert.throws(() => 생성요청몸통({ 본문: 'x' }), /model/);
  const b = 생성요청몸통({ 본문: '[학생 맥락] …', model: 'claude-test-1' });
  assert.equal(b.model, 'claude-test-1');
  assert.deepEqual(b.thinking, { type: 'disabled' },
    'adaptive thinking 이 조용히 켜지면 생각이 예산을 먹어 응답파손의 얼굴이 된다(08-12 실측)');
  assert.equal(b.output_config.format.type, 'json_schema',
    '⓪ 정찰(08-21)의 새 이름 output_config.format 이다 — 전환기 옛 이름에 안 기댄다');
  assert.equal(b.output_config.format.schema, 응답스키마);
  assert.equal(b.messages.length, 1, '렌더된 본문 1개가 계약이다(§5-3)');
  const 소스 = fs.readFileSync(path.join(__dirname, '..', 'lib', '과제생성.js'), 'utf8');
  assert.ok(!/claude-[a-z0-9-]+/.test(소스.replace(/claude-test-1/g, '')),
    '파일에 모델 리터럴이 있다 — 모델은 유호님이 고른다');
});

test('응답 스키마 — 재귀 0 · 길이 제약 0 · additionalProperties false (정찰 미지원 목록 안 밟기)', () => {
  const s = JSON.stringify(응답스키마);
  assert.ok(!/minLength|maxLength|minimum|maximum/.test(s));
  assert.equal(응답스키마.additionalProperties, false);
});

test('SQL 파서와 봉투 경로가 같다 — content[0].text 의 JSON (벤더를 갈면 둘을 같이 간다)', () => {
  const 마이그 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations',
    '20260821120000_generation_c12.sql'), 'utf8');
  assert.ok(/content'\s*->\s*0\s*->>\s*'text'/.test(마이그),
    'gen_parse_sentence 의 봉투 경로가 바뀌었다 — lib 파서와 같이 갈아야 한다(㉤ 대조 ⑥)');
  const 조각 = 생성응답읽기(봉투(정상글));
  assert.equal(조각.값.sentence, '주말에 등산을 갔어요.',
    '같은 봉투에서 JS 파서가 sentence 를 못 읽으면 SQL 대조 ⑥ 과 갈린다');
});

test('SQL 파서가 §8 정규화를 진다(v5.13-b ③) — JS 검문과 같은 공백 목록·NFC', () => {
  const 마이그 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations',
    '20260821120000_generation_c12.sql'), 'utf8');
  assert.ok(/normalize\((s|q), NFC\)/.test(마이그),
    'gen_parse_sentence 에 NFC 정규화가 없다 — §7 「검문이 본 바이트」와 대조 ⑥ 이 갈린다');
  assert.ok(마이그.includes('\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'),
    'SQL 공백 클래스가 JS \\s 목록과 다르다 — 같은 정규화가 로케일 거짓이 된다');
});

/* ── 프롬프트지문(v5.13-b ①) — 형식·재료 민감성 ── */
const 시험전문 = '# 과제 생성 프롬프트\n\n> **현재 v1** (이력)\n\n## 본문 템플릿\n\n```\n머리\n[학생 상태]\n{{요약}}\n\n[겨냥]\n{{기술들}}\n꼬리\n```\n';

test('프롬프트지문 — 형식 `과제생성.v<N>+<hex12>` · 재료 하나만 바뀌어도 지문이 다르다', () => {
  const a = 프롬프트지문({ 전문: 시험전문, 파서해시: 'a'.repeat(64) });
  assert.match(a, /^과제생성\.v1\+[0-9a-f]{12}$/);
  assert.equal(a, 프롬프트지문({ 전문: 시험전문, 파서해시: 'a'.repeat(64) }), '같은 재료 = 같은 지문(결정적)');
  assert.notEqual(a, 프롬프트지문({ 전문: 시험전문 + ' ', 파서해시: 'a'.repeat(64) }), '전문 1바이트');
  assert.notEqual(a, 프롬프트지문({ 전문: 시험전문, 파서해시: 'b'.repeat(64) }), '파서 판');
  assert.equal(프롬프트지문({ 전문: '판 머리말이 없다', 파서해시: 'a'.repeat(64) }), null,
    '머리말 판을 못 읽으면 null — 모르는 판으로 쌓지 않는다(교정 선례)');
  assert.throws(() => 프롬프트지문({ 전문: '', 파서해시: 'a' }), /전문/);
  assert.throws(() => 프롬프트지문({ 전문: 시험전문, 파서해시: '' }), /파서해시/);
});

test('렌더 — 자리 둘 치환 · $ 가 든 요약도 그대로 · 실물 프롬프트 파일에서도 돈다', () => {
  const r = 렌더(시험전문, { 요약: '리듬: $& 제출률=1', 기술들: ['은/는 (주제)', '-았/었-'] });
  assert.ok(r.includes('리듬: $& 제출률=1'), '문자열 대체의 $& 해석이 본문을 조용히 바꾼다');
  assert.ok(r.includes('- 은/는 (주제)\n- -았/었-'), '기술들은 `- <label>` 줄들이다(§5-3 C2)');
  assert.ok(!r.includes('{{'), '자리가 남았다');
  assert.equal(본문템플릿('펜스가 없다'), null, '펜스를 못 찾으면 null — 내부오류 갈래');
  const 실물 = fs.readFileSync(path.join(__dirname, '..', 'prompts', '과제생성.md'), 'utf8');
  const 실렌더 = 렌더(실물, { 요약: '급수: Lv3', 기술들: ['은/는 (주제)'] });
  assert.ok(실렌더 && 실렌더.includes('급수: Lv3') && !실렌더.includes('{{'),
    '실물 프롬프트의 펜스·자리 표기가 렌더 규칙과 어긋났다');
  assert.ok(!실렌더.includes('## 본문 템플릿'), '문서 머리말이 모델 본문에 섞였다');
  /* §12-22 축 — 상태(요약)·기술 하나만 바꿔도 input 이 다르다(호출 0 · 우리 입력을 잰다). */
  assert.notEqual(실렌더, 렌더(실물, { 요약: '급수: Lv4', 기술들: ['은/는 (주제)'] }));
  assert.notEqual(실렌더, 렌더(실물, { 요약: '급수: Lv3', 기술들: ['-았/었-'] }));
});

/* §12-22 본체 — «상태 축 하나만 바꾼 두 요청»을 전체 사슬(상태 → 과제요약 → 렌더)로 잰다.
 * 렌더 단(위 시험)은 요약 문자열을 손으로 줬다 — 여기는 상태 객체에서 출발해, 어느 «상태 축»을
 * 바꿔도 벤더에 갈 입력이 실제로 달라짐을 축 전량 루프로 못박는다(벤더 호출 0 · 비결정 0).
 * + v5.5 F5: goal_snapshot 이 있는 픽스처의 입력에 목표 조각이 «존재»한다 — «차이»만 재면
 *   목표를 통째로 안 싣는 조립도(차이의 원인이 딴 축이면) 초록이다. */
test('§12-22 — 상태 축 하나만 바꾼 두 요청의 입력이 축마다 다르다 + 목표 조각이 실린다', () => {
  const { 과제요약 } = require('../lib/과제요약.js');
  const 실물 = fs.readFileSync(path.join(__dirname, '..', 'prompts', '과제생성.md'), 'utf8');
  const 기준상태 = () => ({
    estimator_version: 'v-시험', estimator_confidence: 0.7,
    evidence_refs: { 사건: [], as_of: '2026-08-22T00:00:00Z', 창일수: 30 },
    축: {
      리듬: { 제출률: 0.5, 마감내: 0.25 },
      끈기: { 재도전: 2 },
      취향: { 선호: '음식' },
    },
  });
  const 입력 = (상태) => {
    const 산출 = 과제요약(상태, { 목표: '대학 진학', 급수: 'Lv3' });
    return 렌더(실물, { 요약: 산출.요약, 기술들: ['은/는 (주제)'] });
  };
  const 기준입력 = 입력(기준상태());
  assert.ok(기준입력 && !기준입력.includes('{{'), '렌더가 서지 않으면 아래 비교가 전부 공허하다');
  /* 목표 조각 존재(F5) — 급수·목적 둘 다 입력 문자열에 실물로 있다. */
  assert.ok(기준입력.includes('급수: Lv3'), '급수 조각이 입력에 없다');
  assert.ok(기준입력.includes('목표: 대학 진학'), '목표 조각이 입력에 없다 — §6-2 「목표 조각 필수」');
  /* 축 전량 루프 — 하위 지표 하나만 바꿔도 입력이 갈린다(픽스처 상태의 축 3 전부). */
  for (const 축이름 of Object.keys(기준상태().축)) {
    const 변주 = 기준상태();
    const 키 = Object.keys(변주.축[축이름])[0];
    const v = 변주.축[축이름][키];
    변주.축[축이름][키] = typeof v === 'number' ? v + 1 : `${v}-다름`;
    assert.notEqual(입력(변주), 기준입력,
      `상태 축 «${축이름}» 을 바꿨는데 벤더 입력이 같다 — 상태를 안 읽는 일반 문장이 §8 을 전부 통과한다`);
  }
  /* 축을 통째로 비우면(널) 그 축이 입력에서 사라진다 — 「있음」과 「없음」도 갈린다. */
  const 빈축 = 기준상태();
  빈축.축.리듬 = null;
  assert.notEqual(입력(빈축), 기준입력);
});
