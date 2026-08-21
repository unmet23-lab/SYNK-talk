/* 과제생성 — 생성 벤더 호출의 «순수 층»: 요청 조립 · 응답 파싱(§5-3) · 오류 분류(§4-1)
 *   (정본 = appsscript docs/상태기반_과제선택_설계.md §5-3·§4-1·§4-2·§11-2 · 2026-08-21).
 *
 * ■ 이 파일이 `policy_ver` 재료 11 이고 `quality_ver` 재료다(§5-1·§5-1-a — 파일 해시).
 *   벤더 응답·예외를 result 7값·outcome 행값으로 «가르는» 자리라, 매핑이 바뀌면 같은 실패가
 *   다른 이름으로 세어지고 §12-8 분포 비교가 판을 가로질러 거짓이 된다(D2).
 * ■ fetch 는 여기 없다 — `교정엔진` 과 같은 무늬(순수 조립·파싱 / 왕복은 워커 몫). 그래서
 *   Node 회귀와 Edge 런타임이 같은 값을 낸다.
 * ■ 🔴 모델 리터럴이 이 파일에 «없다» — 모델은 유호님이 고른다(모델정책 · AI 는 정하지도
 *   제안하지도 않는다). `model` 은 필수 인자이고 원천은 job 실행판(§5-2 — 불변 ID · alias 금지).
 * ■ 구조화 출력(⓪ 정찰 08-15 채택 · 08-21 재확인): `output_config.format = json_schema` —
 *   constrained decoding 으로 스키마 위반이 원리상 불가. ⚠ 파서·`응답파손` 갈래는 그대로
 *   산다 — 벤더 보증을 신뢰하지 않고 검증한다(벤더를 갈면 보증이 사라지는 층이다).
 *   호출 «옵션»(스키마·max_tokens·thinking)은 `prompt_ver` 파생에 들어간다(§4-2 — 새 칸 0).
 * ■ ㉤ 대조 ⑥의 SQL 쪽(`engine.gen_parse_sentence` — 20260821120000)과 «같은 봉투 모양»을
 *   읽는다(content[0].text 의 JSON). 벤더를 갈면 둘을 같이 간다 — §12 픽스처가 동치를 잰다. */
'use strict';
const { 응답글, 재시도가능, 벤더사유 } = require('./교정엔진.js');

/* 상한 하나 — 입력·응답이 «같은 상수»를 쓴다(§4-2 B2 — 두 개면 갈라진다).
 * 측정 시점: 입력은 부르기 «전» 렌더 본문, 응답은 파싱 «전» 원문(§4-2). */
const 상한_코드포인트 = 8000;

/* 출력 예산 — {sentence, question} 두 칸 JSON 한 덩이. thinking 은 명시로 끈다(교정엔진 실측
 * 08-12: adaptive 가 조용히 켜지면 생각이 예산을 먹어 text 0개 응답 → 응답파손의 얼굴). */
const 최대토큰 = 300;

/* §5-3 응답 스키마 — 두 키 필수 · 미지 키 거절. 구조화 출력의 그래머이자 파서의 기대다. */
const 응답스키마 = Object.freeze({
  type: 'object',
  properties: {
    sentence: { type: 'string' },
    question: { type: 'string' },
  },
  required: ['sentence', 'question'],
  additionalProperties: false,
});

const 코드포인트수 = (s) => Array.from(String(s ?? '')).length;

/** 부르기 «전» 판정(§11-2 P1-Z) — 초과면 절단하지 않고 `입력초과`(비용 0 · 호출 0). */
const 입력초과인가 = (본문) => 코드포인트수(본문) > 상한_코드포인트;

/** 부른 «뒤» 판정(§4-2 B2) — 파싱 «전» 원문으로 잰다(파싱 뒤에 재면 응답파손과 안 갈린다). */
const 응답초과인가 = (원문) => 코드포인트수(원문) > 상한_코드포인트;

/**
 * 벤더 요청 몸통 — 렌더된 프롬프트 본문 1개(문자열 · 상태 요약이 이미 박혀 있다 · §5-3).
 * @param {{본문: string, model: string}} 재료
 */
function 생성요청몸통({ 본문, model }) {
  if (typeof model !== 'string' || !model.trim()) {
    throw new TypeError('생성요청몸통: model 이 필요하다 — 원천은 job 실행판이다(모델은 유호님이 고른다)');
  }
  return {
    model,
    max_tokens: 최대토큰,
    thinking: { type: 'disabled' },
    output_config: { format: { type: 'json_schema', schema: 응답스키마 } },
    messages: [{ role: 'user', content: String(본문) }],
  };
}

/**
 * 벤더 응답 «본문»(JSON 파싱된 봉투)에서 §5-3 계약대로 {sentence, question} 을 꺼낸다.
 * 복수 오류는 «첫 오류 하나만»(표 순서 위→아래 — 순서를 안 정하면 같은 응답이 실행마다
 * 다른 사유로 남는다). 실패는 전부 `{오류: '응답파손'}` 하나로 접는다 — §4-1 값목록 밖의
 * 새 자유 문자열을 만들지 않는다(§4-2).
 * @returns {{값: {sentence: string, question: string}} | {오류: '응답파손', 사유: string}}
 */
function 생성응답읽기(봉투) {
  const 글 = 응답글(봉투);
  if (글 == null) return { 오류: '응답파손', 사유: 'text 블록 0개' };
  let j;
  try { j = JSON.parse(글); } catch { return { 오류: '응답파손', 사유: 'JSON 파싱 실패' }; }
  if (j === null || typeof j !== 'object' || Array.isArray(j)) {
    return { 오류: '응답파손', 사유: '객체가 아니다' };
  }
  for (const k of ['sentence', 'question']) {
    if (!(k in j)) return { 오류: '응답파손', 사유: `필수 키 누락: ${k}` };
    if (typeof j[k] !== 'string' || j[k].trim() === '') {
      return { 오류: '응답파손', 사유: `${k} 가 비어 있지 않은 문자열이 아니다` };
    }
  }
  for (const k of Object.keys(j)) {
    if (k !== 'sentence' && k !== 'question') {
      /* 미지 키는 «거절»(무시 아님) — 조용히 무시하면 모델이 몰래 늘린 칸이 영원히 안 보인다. */
      return { 오류: '응답파손', 사유: `미지 키: ${k}` };
    }
  }
  return { 값: { sentence: j.sentence, question: j.question } };
}

/**
 * HTTP 실패 → `attempts.result` 값(§4-1 부분집합 7 의 벤더 갈래). 타임아웃(AbortError)은
 * 워커가 직접 `타임아웃` 으로 접는다 — 여기는 «응답이 온» 실패만 가른다.
 */
const 벤더실패결과 = () => '벤더오류';

module.exports = {
  생성요청몸통, 생성응답읽기, 입력초과인가, 응답초과인가, 벤더실패결과,
  응답스키마, 상한_코드포인트, 최대토큰,
  재시도가능, 벤더사유,   // 한 원천 재수출(교정엔진 선례 — 두 곳에 적힌 판정은 갈라진다)
};
