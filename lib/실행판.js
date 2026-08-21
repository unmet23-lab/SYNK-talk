/* 실행판 — 배치 실행판 여섯 칸을 «한 곳에서» 조립한다 (§5-2 · v5.13-b)
 *
 * ■ 왜 제 파일인가 — 여섯 칸의 «재료 정본»은 전부 따로 산다(model=env · prompt_ver=프롬프트지문 ·
 *   policy_ver=판독기 · estimator=추정판 · schema=마이그 이력 · taxonomy=분류판). 조립 «순서와
 *   배선»을 오케스트레이터(⓪ 굳힘)와 워커(㉢ 자기 판 대조)가 각자 적으면 재료 하나를 한쪽만
 *   빠뜨린 날 매일 `판불일치` 다 — 두 Edge 가 이 함수 하나를 부른다.
 * ■ 순수 — 파일·DB·env 를 «읽지 않는다». DB 산출 둘(rpc 전문·schema_ver)과 env(model)는
 *   호출자가 조달한다(판독기와 같은 규율 — Node 회귀가 전 갈래를 잰다).
 * ■ 실패는 빈 문자열로 접는다 — ㉢ 이 `판불일치` 로 거절하고 그 이름이 행에 남는다(§4-1 —
 *   배포 사고가 「예산」의 얼굴을 쓰지 않게 하는 그 값). 던지면 배치 전체가 500 이고
 *   사유가 행 어디에도 안 남는다. */
'use strict';
const { 정책지문 } = require('./판독기.js');
const { 프롬프트지문 } = require('./과제생성.js');
const { 추정판 } = require('./학습자상태.js');
const { 분류판 } = require('./기술선택.js');
const {
  RPC열, 회전식, 타임아웃상수원소, 예산상수원소, cron원소,
} = require('./생성상수.js');

/** 재료 10(rpc)의 질의 SQL 텍스트 — 두 Edge 가 «같은 문자열»을 태운다(§5-1 v5.9 표:
 *  함수명 오름차순 collate "C" · \n 연결 전문). RPC열은 고정 상수라 인젝션 표면이 0 이다. */
function RPC질의문() {
  const 목록 = RPC열.map((n) => `'${n}'`).join(',');
  return `select string_agg(pg_get_functiondef(p.oid), E'\\n' order by p.proname collate "C") as 전문
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'engine' and p.proname in (${목록})`;
}

/** schema_ver 재료의 질의 — deliver 실물과 같은 문장(계약판.행들에서판이 「최신조각」 별칭을 읽는다). */
function 판질의문() {
  return 'select name as 최신조각 from engine.schema_migrations order by version desc limit 1';
}

/**
 * 실행판 여섯 칸 조립.
 * @param {object} 재료
 * @param {string} 재료.model        env `GENERATION_MODEL`(없으면 '' — 모델은 유호님이 고른다)
 * @param {string} 재료.프롬프트전문  prompts/과제생성.md 원문(동봉)
 * @param {string} 재료.rpc전문      `RPC질의문()` 결과(DB 산출)
 * @param {string} 재료.schema_ver   마이그 이력에서 읽은 판(`계약판.행들에서판`)
 * @param {{파일해시: Record<string,string>, 폴백순서원소: string}} 재료.판재료  빌드 산출
 * @returns {{model: string, prompt_ver: string, policy_ver: string,
 *            estimator_version: string, schema_ver: string, skill_taxonomy_ver: string}}
 */
function 실행판조립({ model, 프롬프트전문, rpc전문, schema_ver, 판재료 }) {
  const 해시 = (판재료 && 판재료.파일해시) || {};
  let prompt_ver = '';
  try {
    prompt_ver = 프롬프트지문({ 전문: String(프롬프트전문 ?? ''), 파서해시: 해시['오류분류'] }) ?? '';
  } catch { /* 빈 값 → ㉢ 판불일치 — 머리말 */ }
  let policy_ver = '';
  try {
    policy_ver = 정책지문({
      요약조립: 해시['요약조립'], 검문: 해시['검문'], 폴백순서: 판재료.폴백순서원소,
      타임아웃상수: 타임아웃상수원소(), 예산상수: 예산상수원소(), 회전식,
      갈래판정: 해시['갈래판정'], 기술선택: 해시['기술선택'], cron: cron원소(),
      rpc: String(rpc전문 ?? ''), 오류분류: 해시['오류분류'], 폴백조립: 해시['폴백조립'],
      추정기: 해시['추정기'],
    });
  } catch { /* 〃 */ }
  return {
    model: String(model ?? ''), prompt_ver, policy_ver,
    estimator_version: 추정판, schema_ver: String(schema_ver ?? ''),
    skill_taxonomy_ver: 분류판,
  };
}

module.exports = { 실행판조립, RPC질의문, 판질의문 };
