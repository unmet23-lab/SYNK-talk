#!/usr/bin/env node
'use strict';
/* 합성 교정 20문항의 구독 모델 선별. 실제 학생·API 키·서비스 DB는 사용하지 않는다.
 * 20문항을 한 묶음으로 보내는 선별 시험이므로 단건 제품 API 평가를 대체하지 않는다.
 * node tools/교정구독비교.js --run
 * 출력은 evals/교정구독비교_20260911. 기존 결과가 있으면 재사용하며 유료 폴백은 없다. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { hex } = require('../lib/sha256.js');
const { 교정지시문, 교정요청판, 교정응답스키마, 교정값 } = require('../lib/교정엔진.js');
const { 채점하기 } = require('./eval-score.js');
const { 인자게이트 } = require('../lib/플래그.js');
const 아는플래그 = ['--run'];

const ROOT = path.resolve(__dirname, '..');
const IDS = ['C01', 'C04', 'C11', 'C14', 'C15', 'C19', 'C26', 'C29', 'C35', 'C40',
  'E02', 'E08', 'E10', 'E12', 'E34', 'E35', 'E44', 'E46', 'M02', 'M03'];
const MODEL = 'gemini-3.1-pro-preview';
const WRAPPER = 'C:/Users/q1212/Documents/SYNK-appsscript/tools/lib/제미나이구독호출.js';

function main(argv) {
  const 플래그오류 = 인자게이트('교정구독비교', argv, 아는플래그);
  if (플래그오류) throw new Error(플래그오류);
  if (!argv.includes('--run') || argv.length !== 1) {
    console.log('사용: node tools/교정구독비교.js --run (구독 4회; 합성 문항; 별도 종량제 API 호출 없음)');
    return;
  }
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals/픽스처.json'), 'utf8'));
  if (!String(fixture.출처).startsWith('합성')) throw new Error('합성 시험지만 허용한다');
  const selected = { ...fixture, 항목: IDS.map(id => fixture.항목.find(x => x.id === id)) };
  if (selected.항목.some(x => !x)) throw new Error('선별 문항 누락');
  const prompt = fs.readFileSync(path.join(ROOT, 'prompts/교정.md'), 'utf8');
  const tags = require('../계약/수집_교정_계약.json').오류태그;
  const dir = path.join(ROOT, 'evals/교정구독비교_20260911');
  fs.mkdirSync(dir, { recursive: true });
  const schemaPath = path.join(dir, 'schema.json');
  const itemSchema = { ...교정응답스키마,
    properties: { id: { type: 'string' }, ...교정응답스키마.properties },
    required: ['id', ...교정응답스키마.required] };
  fs.writeFileSync(schemaPath, JSON.stringify({ type: 'object', properties: {
    항목: { type: 'array', items: itemSchema } }, required: ['항목'], additionalProperties: false }), 'utf8');
  const receipts = [];
  for (const variant of ['full', 'current']) for (const repeat of [1, 2]) {
    const system = variant === 'full' ? prompt : 교정지시문(prompt);
    const input = '아래 규칙을 적용하여 서로 독립적인 합성 한국어 문장 20개를 각각 교정한다. '
      + '도구를 사용하지 않는다. 기대 정답은 제공하지 않는다. 각 항목의 id를 그대로 반환하고 빠뜨리거나 추가하지 않는다. '
      + '문항 간 맥락을 섞지 않는다. 응답은 지정 JSON만 반환한다.\n\n<교정규칙>\n'
      + system + '\n</교정규칙>\n\n<합성문항>\n'
      + JSON.stringify(selected.항목.map(x => ({ id: x.id, 급수: '미정', 문장: x.입력 })))
      + '\n</합성문항>';
    const outPath = path.join(dir, `${variant}-r${repeat}.json`);
    const stampPath = path.join(dir, `${variant}-r${repeat}.meta.json`);
    const inputHash = hex(input);
    if (!fs.existsSync(outPath) || !fs.existsSync(stampPath)
      || JSON.parse(fs.readFileSync(stampPath, 'utf8')).inputHash !== inputHash) {
      console.log(`[교정구독비교] ${variant} r${repeat} · ${MODEL}/high · 20 합성 문항`);
      const result = spawnSync(process.execPath, [WRAPPER, '--model', MODEL, '--thinking', 'high',
        '--schema', schemaPath, '--timeout', '240000', '-o', outPath], {
        input, encoding: 'utf8', windowsHide: true, timeout: 275000, maxBuffer: 1024 * 1024 * 8,
      });
      if (result.status !== 0) throw new Error(`구독 호출 실패: ${String(result.stderr || result.stdout).slice(-1000)}`);
      fs.writeFileSync(stampPath, JSON.stringify({ inputHash, variant, repeat,
        fixtureHash: hex(JSON.stringify(selected)), promptVersion: 교정요청판(prompt),
        screeningOnly: true, providerApiEquivalent: false, generatedAt: new Date().toISOString() }), 'utf8');
    }
    const raw = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const outputs = JSON.parse(raw.text);
    const found = (outputs.항목 || []).map(x => x.id).sort();
    if (JSON.stringify(found) !== JSON.stringify([...IDS].sort())) throw new Error('구독 결과의 문항 집합이 다르다');
    for (const row of outputs.항목) {
      const validation = 교정값(JSON.stringify(row), tags);
      if (validation.사유) row.검증사유 = validation.사유;
    }
    const rows = 채점하기(selected, outputs);
    const bad = rows.filter(x => x.통과 !== true);
    const summary = { variant, repeat, model: raw.modelVersion, route: raw.route,
      total: rows.length, passed: rows.filter(x => x.통과 === true).length,
      failures: bad.map(x => ({ id: x.id, reasons: x.메모 })),
      noResponse: rows.filter(x => x.무응답).length, instructionChars: system.length };
    receipts.push(summary);
    console.log(JSON.stringify(summary));
  }
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ date: '2026-09-11', ids: IDS,
    caveat: '합성 20문항 묶음 구독 선별. 실제 단건 Claude/Gemini API 품질·지연·과금의 대조가 아님.',
    results: receipts }, null, 2), 'utf8');
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { main, IDS };

