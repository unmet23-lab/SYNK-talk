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
  응답스키마, 상한_코드포인트,
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
