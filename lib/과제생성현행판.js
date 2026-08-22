/* 과제생성현행판 — §8-B 차단기 비교축 «현행 값» 7칸을 저장소 실물에서 읽는다 (2026-08-22)
 *
 * 도구(tools/과제생성평가.js --판정)와 차단기 회귀(tests/과제생성게이트.test.js)가 «같은 함수 하나»로
 * 현행 판을 읽는다 — 각자 계산하면 차단기가 다른 판을 보고 옛 초록을 살린다(V6-23 의 형태).
 * 값의 원천은 전부 기존 정본: prompt_ver = lib/과제생성.프롬프트지문 · skill_taxonomy_ver = lib/기술선택.분류판 ·
 * estimator_version = lib/학습자상태.추정판 · quality_ver = lib/판독기.품질지문(검문·오류분류 파일 해시 — D5
 * 「차단기 자체 계산」) · model = env GENERATION_MODEL(모델은 유호님이 고른다 — 미설정이면 빈 값 그대로 =
 * 비교에서 옛 결과와 «다르게» 읽혀 차단이 선다 · 리터럴 0) · 시험지_해시 = evals/과제생성_시험지.json 전체.
 * 「활성」 = prompts/과제생성.md 실재(V6-23 — 새 플래그 0). */
'use strict';
const fs = require('fs');
const path = require('path');
const { hex } = require('./sha256.js');
const { 프롬프트지문 } = require('./과제생성.js');
const { 분류판 } = require('./기술선택.js');
const { 추정판 } = require('./학습자상태.js');
const { 품질지문 } = require('./판독기.js');
const { 채점표판 } = require('./과제생성평가.js');

const ROOT = path.resolve(__dirname, '..');
const 경로 = Object.freeze({
  프롬프트: path.join(ROOT, 'prompts', '과제생성.md'),
  시험지: path.join(ROOT, 'evals', '과제생성_시험지.json'),
  결과: path.join(ROOT, 'evals', '과제생성_결과.json'),
  풀: path.join(ROOT, 'evals', '과제생성_스냅샷풀.json'),
  검문: path.join(ROOT, 'lib', '과제검문.js'),
  오류분류: path.join(ROOT, 'lib', '과제생성.js'),
});

const 파일해시 = (p) => hex(fs.readFileSync(p, 'utf8'));

/** 활성 판정 — prompts/과제생성.md 가 실재하면 활성(§8-B 「활성」의 값). */
const 활성인가 = () => fs.existsSync(경로.프롬프트);

/**
 * 현행 비교축 7칸. 시험지 파일이 없으면 시험지_해시 = null(차단기가 그 부재를 따로 말한다).
 * @param {{model?: string}} [옵션]  model 기본 = process.env.GENERATION_MODEL ?? ''
 */
function 현행판(옵션 = {}) {
  const 전문 = fs.readFileSync(경로.프롬프트, 'utf8');
  return {
    model: 옵션.model ?? process.env.GENERATION_MODEL ?? '',
    prompt_ver: 프롬프트지문({ 전문, 파서해시: 파일해시(경로.오류분류) }),
    skill_taxonomy_ver: 분류판,
    estimator_version: 추정판,
    시험지_해시: fs.existsSync(경로.시험지) ? 파일해시(경로.시험지) : null,
    채점표_판: 채점표판,
    quality_ver: 품질지문({ 검문: 파일해시(경로.검문), 오류분류: 파일해시(경로.오류분류) }),
  };
}

module.exports = { 경로, 파일해시, 활성인가, 현행판 };
