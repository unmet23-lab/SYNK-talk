#!/usr/bin/env node
'use strict';
/**
 * 교정 엔진 채점기.
 *
 * 왜 기계로 채점하는가: 모델이 자기 출력을 채점하면 후한 쪽으로 기운다.
 * 기대값(`evals/픽스처.json`)을 **먼저 고정**하고, 대조는 문자열 규칙으로만 한다.
 *
 * 사용: node tools/eval-score.js evals/출력_v0.json [--json]
 *
 * 채점 축 3개 — 셋을 **따로** 낸다. 합산 점수 하나로 뭉치면
 * 거짓양성(맞는 문장을 고침)이 탐지율에 묻힌다. 제품에서 더 나쁜 실패는 거짓양성 쪽이다.
 *   ① 거짓양성  — 정상 문장을 고쳤는가 (낮을수록 좋다)
 *   ② 교정 정확 — 오류 문장을 기대대로 고쳤는가
 *   ③ 태그 정확 — 오류 유형을 맞게 분류했는가 (집계의 근거라 교정과 별개로 잰다)
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(ROOT, 'evals', '픽스처.json');

function load(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 공백 차이는 무시하지 않는다 — 띄어쓰기 자체가 채점 대상이다. 앞뒤 공백만 턴다. */
function norm(s) {
  return String(s == null ? '' : s).trim();
}

function scoreOne(fx, out) {
  const 고친 = norm(out && out.고친문장);
  const 태그 = Array.isArray(out && out.오류태그) ? out.오류태그.map(norm) : [];
  const r = { id: fx.id, 종류: fx.종류, 입력: fx.입력, 출력: 고친, 태그, 판정: {}, 메모: [] };

  if (fx.불변) {
    r.판정.불변 = 고친 === norm(fx.입력);
    r.판정.태그 = 태그.length === 1 && 태그[0] === '오류없음';
    if (!r.판정.불변) r.메모.push(`거짓양성 — 맞는 문장을 고쳤다: "${고친}"`);
    if (!r.판정.태그) r.메모.push(`태그가 '오류없음' 하나여야 하는데 [${태그.join(', ')}]`);
    r.통과 = r.판정.불변 && r.판정.태그;
    return r;
  }

  const 포함 = (fx.포함 || []).filter((s) => !고친.includes(s));
  const 불포함 = (fx.불포함 || []).filter((s) => 고친.includes(s));
  r.판정.교정 = 포함.length === 0 && 불포함.length === 0;
  if (포함.length) r.메모.push(`빠짐: ${포함.map((s) => `"${s}"`).join(', ')}`);
  if (불포함.length) r.메모.push(`남음: ${불포함.map((s) => `"${s}"`).join(', ')}`);

  // v1 방침(2026-08-03 유호님 결정: 틀린 것은 전부 고친다) 이후로는 기대 태그를
  // **전부** 요구한다. some() 이었다면 오류 3개 중 1개만 잡아도 통과해서,
  // 방침을 바꾼 것이 채점에 하나도 반영되지 않는다.
  const 기대 = fx.기대태그 || [];
  const 놓친 = 기대.filter((t) => !태그.includes(t));
  r.판정.태그 = 놓친.length === 0;
  if (!r.판정.태그) r.메모.push(`태그 놓침: ${놓친.join(', ')} / 실제 [${태그.join(', ')}]`);

  const 초과 = 태그.filter((t) => !기대.includes(t));
  if (초과.length) r.메모.push(`추가 태그(감점 아님): ${초과.join(', ')}`);

  r.통과 = r.판정.교정 && r.판정.태그;
  return r;
}

function main(argv) {
  const outPath = argv[0];
  if (!outPath) {
    console.error('사용: node tools/eval-score.js evals/출력_v0.json [--json]');
    return 2;
  }
  const fixture = load(FIXTURE);
  const outputs = load(path.resolve(ROOT, outPath));
  const byId = new Map(outputs.항목.map((o) => [o.id, o]));

  const rows = fixture.항목.map((fx) => scoreOne(fx, byId.get(fx.id)));
  const 정상 = rows.filter((r) => r.종류 === '정상');
  const 오류 = rows.filter((r) => r.종류 === '오류');

  const 요약 = {
    항목수: rows.length,
    거짓양성: {
      // 「고치지 말았어야 하는데 고친」 건수
      건수: 정상.filter((r) => !r.판정.불변).length,
      분모: 정상.length,
    },
    교정정확: { 건수: 오류.filter((r) => r.판정.교정).length, 분모: 오류.length },
    태그정확: { 건수: 오류.filter((r) => r.판정.태그).length, 분모: 오류.length },
    전체통과: rows.filter((r) => r.통과).length,
  };

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ 요약, 항목: rows }, null, 2));
    return 요약.거짓양성.건수 === 0 && 요약.전체통과 === rows.length ? 0 : 1;
  }

  const pct = (a, b) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`);
  console.log(`\n교정 엔진 채점 — ${path.basename(outPath)}\n`);
  for (const r of rows) {
    console.log(`${r.통과 ? '✔' : '✖'} ${r.id}  ${r.입력}`);
    if (!r.통과 || r.메모.length) {
      console.log(`    → ${r.출력}`);
      r.메모.forEach((m) => console.log(`    · ${m}`));
    }
  }
  console.log('\n── 요약 ─────────────────────────────');
  console.log(
    `거짓양성  ${요약.거짓양성.건수}/${요약.거짓양성.분모}  (맞는 문장을 고친 건수 — 0이어야 한다)`
  );
  console.log(
    `교정 정확  ${요약.교정정확.건수}/${요약.교정정확.분모}  ${pct(요약.교정정확.건수, 요약.교정정확.분모)}`
  );
  console.log(
    `태그 정확  ${요약.태그정확.건수}/${요약.태그정확.분모}  ${pct(요약.태그정확.건수, 요약.태그정확.분모)}`
  );
  console.log(`전체 통과  ${요약.전체통과}/${요약.항목수}\n`);

  return 요약.거짓양성.건수 === 0 && 요약.전체통과 === rows.length ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { scoreOne, main };
