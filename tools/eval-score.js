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

  /* 🔴 출력 «자체»가 없는 항목은 채점에서 뺀다 — 「안 돌았다」와 「틀렸다」는 다른 사건이다.
   *   이 분기가 없으면 무응답이 아래 정상 분기로 흘러 **「거짓양성 — 맞는 문장을 고쳤다」로 집계된다**.
   *   하필 거짓양성은 이 채점기가 가장 중요하게 보는 축이라(제품에서 더 나쁜 실패), 모델 선발 판정이
   *   그대로 뒤집힌다: 응답을 빠뜨린 모델이 「과교정이 심한 모델」로 보인다.
   *   2026-08-08 실측 — 픽스처를 26→100으로 늘리자 옛 출력에 없는 74건이 전부 거짓양성으로 찍혔다.
   *   ⚠빈 문자열(`고친문장: ''`)은 여기서 빼지 않는다 — 그건 모델이 실제로 낸 답이고 진짜 실패다. */
  if (out == null) {
    r.판정불가 = true;
    r.판정불가사유 = '출력없음';
    r.통과 = null;
    r.메모.push('판정불가 — 이 id의 출력이 없다(모델을 안 돌렸거나 응답이 누락됐다). 채점에서 뺀다.');
    return r;
  }

  // `종류: '정상'`도 거짓양성 검사다 — `불변` 하나에만 기대면 그 필드를 빠뜨린 픽스처가
  // **오류 항목으로 채점되고**, 오류 채점은 포함·불포함·기대태그가 모두 비면 무조건 통과라
  // 「멀쩡한 문장을 건드렸는가」가 자동 만점이 된다. 실제로 수집층이 08-04까지 `불변`을
  // 안 만들고 있었다(계약 c1 목록에 없어서 양쪽 회귀가 둘 다 못 봤다 → c2에서 추가).
  // 둘 중 하나만 맞아도 거짓양성 검사로 가는 편이, 놓치는 쪽보다 안전하다.
  if (fx.불변 || fx.종류 === '정상') {
    r.판정.불변 = 고친 === norm(fx.입력);
    r.판정.태그 = 태그.length === 1 && 태그[0] === '오류없음';
    if (!r.판정.불변) r.메모.push(`거짓양성 — 맞는 문장을 고쳤다: "${고친}"`);
    if (!r.판정.태그) r.메모.push(`태그가 '오류없음' 하나여야 하는데 [${태그.join(', ')}]`);
    r.통과 = r.판정.불변 && r.판정.태그;
    return r;
  }

  /* 🔴 대조할 근거가 하나도 없는 오류 항목은 **채점에서 뺀다**. 아래 검사들은 전부
   *   「기대한 것이 없으면 통과」 모양이라, 셋이 다 비면 무엇을 내놓든 통과가 된다
   *   (08-04 실측: 엔진이 「바나나」를 내놔도 통과였다). 픽스처 문서는 빈 배열을
   *   "그 검사를 건너뛴다"고 적어 두었는데, 건너뜀이 통과와 같은 모양이면 **점수를 부풀린다**.
   *   수집층은 전면 재작성이면 포함·불포함을 일부러 비우므로(추측을 확신처럼 적지 않는다),
   *   오류태그까지 비어 있는 행이 실제로 나온다. 통과도 실패도 아닌 제3의 상태로 세고 분모에서 뺀다. */
  const 근거수 = (fx.포함 || []).length + (fx.불포함 || []).length + (fx.기대태그 || []).length;
  if (근거수 === 0) {
    r.판정불가 = true;
    r.판정불가사유 = '근거없음';
    r.통과 = null;
    r.메모.push('판정불가 — 포함·불포함·기대태그가 모두 비어 대조할 근거가 없다. 채점에서 뺀다(강사 교정을 더 받아야 한다).');
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
  /* 픽스처를 골라 쓴다 — 합성(evals/픽스처.json)과 실학생(수집층이 올리는 것)은 **다른 질문에 답한다**:
   * 합성은 「23개 오류 유형을 다 잡는가」(유형 커버리지), 실학생은 「우리 학생이 실제로 무너지는 곳을
   * 잡는가」(분포). 하나로 덮으면 덮인 쪽 질문을 영영 못 묻는다. 그래서 기본값은 합성 그대로 두고
   * 수집층은 다른 경로에 올린다. */
  const fi = argv.indexOf('--fixture');
  const fixturePath = fi !== -1 && argv[fi + 1] ? path.resolve(ROOT, argv[fi + 1]) : FIXTURE;
  // fi === -1 이면 fi+1 === 0 이라, 조건을 그냥 `i !== fi + 1`로 쓰면 **출력 경로 자신이 걸러진다**
  const outPath = argv.filter((a, i) => !a.startsWith('--') && !(fi !== -1 && i === fi + 1))[0];
  if (!outPath) {
    console.error('사용: node tools/eval-score.js evals/출력_v0.json [--json] [--fixture evals/픽스처_실학생.json]');
    return 2;
  }
  if (!fs.existsSync(fixturePath)) {
    console.error(`픽스처가 없다: ${path.relative(ROOT, fixturePath)}\n` +
      '  실학생 픽스처는 수집층(SYNK-appsscript) 시트 메뉴 「🚀 골든셋 → SYNK-talk 저장소로 바로 보내기」가 올린다.');
    return 2;
  }
  const fixture = load(fixturePath);
  const outputs = load(path.resolve(ROOT, outPath));
  const byId = new Map(outputs.항목.map((o) => [o.id, o]));

  const rows = fixture.항목.map((fx) => scoreOne(fx, byId.get(fx.id)));
  const 판정불가 = rows.filter((r) => r.판정불가);
  const 채점대상 = rows.filter((r) => !r.판정불가);
  const 정상 = 채점대상.filter((r) => r.종류 === '정상');
  const 오류 = 채점대상.filter((r) => r.종류 === '오류');

  const 요약 = {
    항목수: 채점대상.length,
    // 판정불가는 **분모에서 빼고 따로 센다**. 0으로 감추면 「표본이 부족하다」가 「점수가 좋다」로 보인다.
    판정불가: 판정불가.length,
    // 🔑 사유를 가르는 이유는 **처방이 정반대**여서다: 출력없음 = 모델을 돌려라 / 근거없음 = 강사 교정을 받아라.
    //    한 숫자로 뭉치면 「74건 판정불가」를 보고 있지도 않은 강사 교정을 기다리게 된다.
    판정불가내역: {
      출력없음: 판정불가.filter((r) => r.판정불가사유 === '출력없음').length,
      근거없음: 판정불가.filter((r) => r.판정불가사유 === '근거없음').length,
    },
    거짓양성: {
      // 「고치지 말았어야 하는데 고친」 건수
      건수: 정상.filter((r) => !r.판정.불변).length,
      분모: 정상.length,
    },
    교정정확: { 건수: 오류.filter((r) => r.판정.교정).length, 분모: 오류.length },
    태그정확: { 건수: 오류.filter((r) => r.판정.태그).length, 분모: 오류.length },
    전체통과: 채점대상.filter((r) => r.통과 === true).length,
  };

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ 요약, 항목: rows }, null, 2));
    return 요약.거짓양성.건수 === 0 && 요약.전체통과 === 요약.항목수 ? 0 : 1;
  }

  const pct = (a, b) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`);
  console.log(`\n교정 엔진 채점 — ${path.basename(outPath)}\n`);
  for (const r of rows) {
    console.log(`${r.판정불가 ? '—' : r.통과 ? '✔' : '✖'} ${r.id}  ${r.입력}`);
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
  console.log(`전체 통과  ${요약.전체통과}/${요약.항목수}`);
  // 침묵하면 「표본이 부족하다」가 「점수가 좋다」로 읽힌다 — 0이어도 한 줄은 낸다.
  console.log(
    `판정불가  ${요약.판정불가}건  — 출력없음 ${요약.판정불가내역.출력없음}(모델을 안 돌렸다) · ` +
    `근거없음 ${요약.판정불가내역.근거없음}(강사 교정을 더 받아야 한다)`
  );
  // 위 세 비율의 분모는 **채점한 것**뿐이다. 안 돌린 문항이 있는데 「전체 통과」만 읽으면 초록으로 오독한다.
  if (요약.판정불가내역.출력없음 > 0) {
    console.log(
      `⚠ 시험지 ${rows.length}문항 중 ${요약.판정불가내역.출력없음}문항은 출력이 없어 **안 재졌다** — 위 점수는 ${요약.항목수}문항짜리다.`
    );
  }
  console.log('');

  return 요약.거짓양성.건수 === 0 && 요약.전체통과 === 요약.항목수 ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { scoreOne, main };
