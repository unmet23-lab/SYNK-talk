#!/usr/bin/env node
'use strict';
/**
 * 예비과제 굽기 — 유호님이 «전 축에 O» 를 준 산출만 골라 `contents/예비과제풀.js` 로 굳힌다.
 *
 * 🔴 이름이 «예비과제풀» 인 까닭 — 동봉(Edge Fn 번들)이 **파일 «이름»만 보고** require 를 잇는다
 *   (`원격배포.require풀기`: 경로를 basename 으로 줄여 표에서 찾는다). `lib/예비과제.js` 와
 *   `contents/예비과제.js` 를 같이 두면 둘 다 `예비과제.mjs` 가 되어 **Map 에서 하나가 조용히 덮인다** —
 *   배포는 성공하고 함수는 엉뚱한 모듈을 받는다. 이름을 갈라 그 자리를 원리상 없앤다.
 *
 *   node tools/예비과제굽기.js            # 굽는다
 *   node tools/예비과제굽기.js --확인      # 굽지 않고 「지금 구우면 달라지나」만 본다(0=같다)
 *
 * ■ 왜 있나 (유호 지시 2026-08-26 「혹시나 버그나 오류 때문에 개인화 숙제를 못 받으면
 *   예비용 과제라도 지급해야 한다」)
 *   실측한 구멍: 강등 사다리의 마지막 칸이 **1일차 자기소개 문장 하나**였다 —
 *   「안녕하세요. 저는 (이름)입니다. 몽골에서 왔습니다.」. 6개월 차 Lv6 학생도 그것을 받는다.
 *   게다가 「전날」 갈래가 **어제도 강등이었는지를 안 봐서**, 장애가 사흘이면 같은 문장이 사흘 나갔다.
 *
 * ■ 재료는 «이미 있는 것»이다 — 새로 쓰지 않는다
 *   §8-B 회전 1~3 의 결과 240행 중 유호님이 여덟 축(⑦ 절제축 제외 일곱)에 **전부 O** 를 준 것.
 *   즉 이 풀은 **원장이 한 벌씩 눈으로 통과시킨 문장**이고, 새 콘텐츠를 쓰는 비용이 0 이다.
 *   ⚠ ⑦(goal_use)은 «절제 축»이라 O/X 가 품질이 아니다 — 그래서 판정에서 뺀다(채점표 v2 명문).
 *
 * ■ 무엇을 «안» 하나
 *   · 겨냥 문법은 안 딸려 온다 — 예비는 그날의 «학습 겨냥»이 아니라 «빈손 방지»다.
 *   · 초급(Lv1~2)·미정 몫은 **굽지 않는다.** §8-B 표본이 Lv3~6 뿐이라(§7-1 초급은 생성 대상 밖)
 *     검증된 초급 문장이 0벌이다. 없는 것을 지어내지 않는다 — 그 갈래는 도입 폴백이 그대로 진다.
 *
 * ■ 낡음 — 생성물에 원본 파일 + 그 파일의 커밋을 함께 굽는다(강사지식빌드와 같은 무늬).
 *   회전이 하나 더 돌면 이 도구를 다시 돌려 풀을 늘린다.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { 인자게이트 } = require('../lib/플래그.js');

const ROOT = path.resolve(__dirname, '..');
const 생성물경로 = path.join(ROOT, 'contents', '예비과제풀.js');

/* 판정 축 — ⑦ goal_use 는 절제 축이라 뺀다(채점표 v2: 「⑦=0 은 이유를 안 묻는다 · 절제이지 흠이 아니다」). */
const 품질축 = Object.freeze(['connect', 'answerable', 'level_fit', 'fresh', 'fun', 'accuracy', 'state_use']);

/* 걷을 회전 — 🔴 **3회전(v5) 하나뿐이다**(유호 확정 2026-08-26).
 *
 *   처음에 셋을 다 걷어 120벌을 냈는데 유호님이 판정하셨다: 「나머지보다 3회전 것을 쓰는 게 제일
 *   좋을 것 같아. 3회전이 52벌밖에 안 되긴 하지만 **이게 제일 퀄리티가 괜찮았어**」.
 *   ⇒ 벌 수보다 «질»을 택했다. 근거도 그 방향이다 — ⑥정확성이 v3 0.23 → v4 0.33 → v5 0.50 으로
 *   올라왔으니 옛 회전 산출은 «전 축 O» 를 받았어도 지금 기준에서 낡은 판의 것이다.
 *   ⚠ 그래서 **한 바퀴가 짧아진다**(급수당 ≈13벌). 장애가 길면 2주쯤 뒤에 한 번 되돌아온다 —
 *   「매일 같은 문장」에 비하면 비교가 안 되고, 4회전이 착지하면 여기 한 줄 늘려 길어진다.
 *   되돌리려면 아래 배열에 옛 판을 다시 넣고 다시 구우면 된다(값 0). */
const 회전들 = Object.freeze([
  { 판: 'v5', 파일: 'evals/과제생성_결과_v5판보관.json' },
]);

const argv = process.argv.slice(2);
const 막힘 = 인자게이트('예비과제굽기', argv, ['--확인']);
if (막힘) { console.error(막힘); process.exit(2); }

/** 그 파일을 마지막으로 만진 커밋. 못 읽으면 `'(모름)'` — 없는 것을 지어내지 않는다. */
function 커밋해시(상대) {
  try {
    return execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%H', '--', 상대], { encoding: 'utf8' }).trim() || '(모름)';
  } catch { return '(모름)'; }
}

/* 급수 지도 — 사례 id → 급수. 시험지가 판올림돼도 «사례의 급수»는 안 바뀐다(풀 순서 그대로 · E4). */
const 시험지 = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', '과제생성_시험지.json'), 'utf8'));
const 급수map = new Map(시험지.사례.map((c) => [c.case_base_id, c.level]));

function 걷기() {
  const 본것 = new Set();      // 문장 중복 제거(회전을 넘어 같은 문장이 난 적이 있다)
  const 급수별 = {};
  const 출처장부 = [];
  let 훑은행 = 0, 채점된행 = 0;

  for (const { 판, 파일 } of 회전들) {
    const p = path.join(ROOT, 파일);
    if (!fs.existsSync(p)) { console.error(`[예비과제] 회전 파일이 없다: ${파일}`); process.exit(1); }
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const 행 = j.행 || [];
    훑은행 += 행.length;
    let 뽑음 = 0;
    for (const r of 행) {
      if (!r.axis_scores || !r.grader_note || r.grader_note === '미채점') continue;
      채점된행 += 1;
      if (!품질축.every((k) => r.axis_scores[k] === 1)) continue;
      const 문장 = String(r.sentence || '').trim();
      const 질문 = String(r.question || '').trim();
      if (!문장 || !질문) continue;
      if (본것.has(문장)) continue;
      본것.add(문장);
      const 급수 = 급수map.get(String(r.case_id).split('#')[0]);
      if (!급수) continue;                     // 시험지에 없는 사례 — 급수를 모르면 안 싣는다
      (급수별[급수] ||= []).push({ 문장, 질문, 판, case_id: r.case_id });
      뽑음 += 1;
    }
    출처장부.push({ 판, 파일, 커밋: 커밋해시(파일), 행: 행.length, 뽑음 });
  }

  /* 순서를 못박는다 — 굽기가 결정적이어야 `--확인` 이 뜻을 갖는다. */
  for (const k of Object.keys(급수별)) {
    급수별[k].sort((a, b) => (a.판 === b.판 ? a.case_id.localeCompare(b.case_id) : a.판.localeCompare(b.판)));
  }
  const 정렬된 = {};
  for (const k of Object.keys(급수별).sort()) 정렬된[k] = 급수별[k];
  return { 급수별: 정렬된, 출처장부, 훑은행, 채점된행 };
}

const { 급수별, 출처장부, 훑은행, 채점된행 } = 걷기();
const 총 = Object.values(급수별).reduce((a, v) => a + v.length, 0);
if (!총) { console.error('[예비과제] 뽑힌 것이 0벌이다 — 채점 파일이 비었거나 축 이름이 갈렸다'); process.exit(1); }

const 표 = Object.entries(급수별).map(([k, v]) => `${k} ${v.length}벌`).join(' · ');
const 장부표 = 출처장부.map((d) => ` *   · ${d.판}  ${d.파일}\n *       커밋 ${d.커밋} · 행 ${d.행} → 뽑음 ${d.뽑음}`).join('\n');

const 새글 = `/* 예비과제 — «빈손 방지» 풀 (생성물 · 손으로 고치지 않는다)
 *
 * 🔴 이 파일은 \`tools/예비과제굽기.js\` 가 굽는다. 고치려면 원본(채점된 회전 결과)을 고치고 다시 굽는다.
 *
 * ■ 무엇인가 — 개인화 생성이 실패한 날 학생이 «빈손»이 되지 않게 내는 과제.
 *   유호님이 §8-B 회전 채점에서 **일곱 축 전부에 O** 를 준 산출만 골랐다(⑦ 절제축 제외).
 *   즉 여기 있는 문장은 전부 원장이 한 벌씩 눈으로 통과시킨 것이다.
 *
 * ■ 실린 것 — 전체 ${총}벌 (${표})
 *   훑은 행 ${훑은행} · 그중 채점된 행 ${채점된행} · 문장 중복 제거 뒤
${장부표}
 *
 * ■ 초급(Lv1~2)·미정은 **없다** — §8-B 표본이 Lv3~6 뿐이라(§7-1) 검증된 초급 문장이 0벌이다.
 *   그 갈래는 도입 폴백이 그대로 진다(없는 것을 지어내지 않는다).
 */
'use strict';

const 예비과제 = Object.freeze(${JSON.stringify(급수별, null, 2)});

module.exports = { 예비과제 };
`;

if (argv.includes('--확인')) {
  const 옛 = fs.existsSync(생성물경로) ? fs.readFileSync(생성물경로, 'utf8') : '';
  /* 커밋 해시 줄만 다른 것도 드리프트다 — 원본이 움직였다는 뜻이라 여기선 통째로 대조한다. */
  if (옛 === 새글) { console.log(`[예비과제] 같다 — ${총}벌 (${표})`); process.exit(0); }
  console.error('[예비과제] 다르다 — `node tools/예비과제굽기.js` 로 다시 구워야 한다.');
  process.exit(1);
}

fs.writeFileSync(생성물경로, 새글, 'utf8');
console.log(`[예비과제] 구웠다 — ${총}벌 (${표}) → ${path.relative(ROOT, 생성물경로)}`);
for (const d of 출처장부) console.log(`  · ${d.판.padEnd(3)} 행 ${String(d.행).padStart(3)} → 뽑음 ${String(d.뽑음).padStart(3)}  ${d.커밋.slice(0, 8)}`);
