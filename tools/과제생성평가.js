#!/usr/bin/env node
'use strict';
/**
 * 과제생성 평가 실행기·채점·판정 — §8-B 의 «실행층»(I2) 세 갈래를 한 도구에 둔다.
 *
 *   node tools/과제생성평가.js --드라이런                 # 벤더 0 — 렌더·input_hash·결과 «초안» 뼈대(evals/과제생성_결과_초안.json)
 *   node tools/과제생성평가.js --원격                     # ⛔ 지금은 거절 — 벤더 통로는 #6 착수 때 한 벌(아래)
 *   node tools/과제생성평가.js --채점 evals/과제생성_결과.json --채점자 유호   # 사람 채점(CLI · 사례마다 8축 + note)
 *   node tools/과제생성평가.js --판정 evals/과제생성_결과.json    # 기계 계약 검증 → 사례 단위 AND 집계 → 통과/미통과(exit 0/1)
 *
 * ■ 왜 «원격» 이 지금 거절인가 — 오프라인 평가는 운영 큐(generation_jobs·attempts)를 «안 지난다»(§8-B E5 —
 *   지나면 운영 장부가 평가로 오염된다). 그래서 워커(deliver-one)의 claim 경로를 못 쓰고, 교정 eval 의
 *   `correct?평가=1` 선례처럼 **DB 무접촉 평가 갈래**가 deliver-one 에 서야 한다. 그 갈래는 벤더 키·모델
 *   (GENERATION_MODEL — 유호님 몫)과 한 벌이라 #6(크레딧·모델 픽·사람 채점 80회) 착수 때 함께 짓는다.
 *   로컬엔 벤더 키가 없다(eval-run 머리말 실측) — 키를 끌어오지 않는다.
 * ■ 드라이런의 초안 파일은 «정본 이름이 아니다» — 결과 정본 evals/과제생성_결과.json 은 벤더 실물 +
 *   사람 채점이 끝난 파일뿐이다. 초안은 공갈 응답 + 축 전부 0 + note '미채점' 이라 어떤 집계로도 통과가 안 된다.
 * ■ 산술·계약은 전부 lib/과제생성평가.js(순수) — 여기는 파일 I/O·대화·종료코드만 진다.
 */
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { 인자게이트 } = require('../lib/플래그.js');
const 평가 = require('../lib/과제생성평가.js');
const { 경로, 파일해시, 활성인가, 현행판 } = require('../lib/과제생성현행판.js');

const ROOT = path.resolve(__dirname, '..');
const 아는플래그 = ['--드라이런', '--원격', '--채점', '--판정', '--채점자', '--출력'];
const argv = process.argv.slice(2);
const 막힘 = 인자게이트('과제생성평가', argv, 아는플래그);
if (막힘) { console.error(막힘); process.exit(2); }
const 값 = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const 읽기 = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const 쓰기 = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 1) + '\n');

if (!활성인가()) {
  console.log('[과제생성평가] prompts/과제생성.md 가 없다 — 생성 경로가 원리상 안 돈다(§8-B 「활성」 아님 · 적용 안 함).');
  process.exit(0);
}
const 전문 = fs.readFileSync(경로.프롬프트, 'utf8');

/* ── 드라이런 ─────────────────────────────────────────────────────────────── */
if (argv.includes('--드라이런')) {
  const 시험지 = 읽기(경로.시험지);
  const 현 = 현행판();
  const 행 = [];
  for (const c of 시험지.사례) {
    const { 본문 } = 평가.사례본문(전문, c);
    const ih = 평가.input_hash(본문);
    for (const 회차 of [1, 2]) {
      /* 공갈 응답 — 벤더 0. 파서가 읽히는 모양이라 결속 ②가 «같은 파서»로 sentence·question 을 재산출한다. */
      const raw = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ sentence: '(드라이런 문장)', question: '(드라이런 질문)?' }) }], usage: { output_tokens: 0 } });
      행.push({
        case_id: 평가.case_id(c.case_base_id, 회차),
        axis_scores: Object.fromEntries(평가.축키들.map((k) => [k, (k === 평가.null허용축 && c.goal == null) ? null : 0])),
        grader_note: '미채점(드라이런 — 벤더 0 · 공갈 응답 · 축 전부 0)',
        sentence: '(드라이런 문장)', question: '(드라이런 질문)?',
        raw_response: raw, raw_response_hash: 평가.응답해시(raw), input_hash: ih,
      });
    }
  }
  const 출력 = 값('--출력') ? path.resolve(값('--출력')) : path.join(ROOT, 'evals', '과제생성_결과_초안.json');
  쓰기(출력, {
    판: '§8-B 결과 «초안»(드라이런) — 정본 아님: 벤더 0 · 채점 0. 정본 = evals/과제생성_결과.json(실물 응답 + 사람 채점)',
    /* model 은 GENERATION_MODEL(유호님 몫) — 미설정이면 빈 값이라 존재 검사에 걸린다. 초안은 정본이 아니므로
     * 표식으로 채워 «구조» 검증만 통과시킨다(비교축에선 현행 '' 과 달라 차단이 선다 — 그게 맞다). */
    동봉: { ...현, model: 현.model || '(드라이런 — GENERATION_MODEL 미설정)', policy_ver: '(드라이런 — 실행판조립은 DB 재료라 미산출)', 채점자: '(미채점)', 시각: new Date().toISOString() },
    행,
  });
  const 사유 = 평가.결과검증(읽기(출력), 시험지, 전문);
  console.log(`[과제생성평가] 드라이런 → ${path.relative(ROOT, 출력)} · 행 ${행.length} · 기계 계약 ${사유.length ? '❌ ' + 사유.slice(0, 5).join(' / ') : '✅ 유효(뼈대)'} · 집계 통과 ${평가.집계(읽기(출력), 시험지).통과 ? '⚠ 초안이 통과로 읽힌다(결함)' : '✅ 미통과(의도 — 축 전부 0)'}`);
  console.log(`  현행 비교축: model=${현.model || '(GENERATION_MODEL 미설정)'} · prompt_ver=${현.prompt_ver} · quality_ver=${현.quality_ver} · 시험지_해시=${String(현.시험지_해시).slice(0, 12)}…`);
  process.exit(사유.length ? 1 : 0);
}

/* ── 원격(거절) ───────────────────────────────────────────────────────────── */
if (argv.includes('--원격')) {
  console.error('[과제생성평가] ⛔ --원격 은 아직 통로가 없다 — 오프라인 평가는 운영 큐를 안 지나므로(§8-B E5) deliver-one 에'
    + ' DB 무접촉 «평가 갈래»(correct?평가=1 선례)가 서야 하고, 그 갈래는 벤더 키·GENERATION_MODEL(유호님 몫)과 한 벌이라'
    + ' #6 착수 때 함께 짓는다. 로컬 키는 끌어오지 않는다.');
  process.exit(2);
}

/* ── 채점(CLI · 사람) ─────────────────────────────────────────────────────── */
if (값('--채점')) {
  const 파일 = path.resolve(값('--채점'));
  const 채점자 = 값('--채점자');
  if (!채점자) { console.error('--채점자 <이름> 이 필요하다(존재축 — 비면 무효)'); process.exit(2); }
  const 결과 = 읽기(파일);
  const 시험지 = 읽기(경로.시험지);
  const 사례맵 = new Map(시험지.사례.map((c) => [c.case_base_id, c]));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const 물음 = (q) => new Promise((res) => rl.question(q, (a) => res(a.trim())));
  (async () => {
    console.log(`■ 채점 — ${결과.행.length}행 · 축 여덟(①connect ②answerable ③level_fit ④fresh ⑤fun ⑥accuracy ⑦goal_use ⑧state_use) · 값 0/1 · ⑦은 goal 없는 사례에서 자동 null`);
    console.log(`  ⑤ 채점자 질문: ${평가.앵커.채점자질문} · 0점 조건 Z1~Z3 · 1점 앵커 A1~A3 · 중간: ${평가.앵커.중간사례기준}`);
    console.log('  빈 입력 = 그 행 건너뜀(나중에 이어서) · q = 저장하고 종료');
    for (const 행 of 결과.행) {
      const base = 행.case_id.replace(/#[12]$/, '');
      const c = 사례맵.get(base);
      console.log(`\n▸ ${행.case_id} · ${c ? `${c.칸} · goal=${c.goal ?? '(없음)'} · 기술=${(c.기술들 || []).join(' / ')}` : '(시험지에 없는 사례)'}`);
      console.log(`  문장: ${행.sentence}\n  질문: ${행.question}`);
      const 입력 = await 물음('  8축 0/1 (예: 1 1 1 1 0 1 1 1 · ⑦ 자리는 goal 없으면 아무 값) > ');
      if (입력 === 'q') break;
      if (!입력) continue;
      const v = 입력.split(/\s+/).map(Number);
      if (v.length !== 8 || v.some((x) => x !== 0 && x !== 1)) { console.log('  ✗ 여덟 개의 0/1 이어야 한다 — 건너뜀'); continue; }
      행.axis_scores = Object.fromEntries(평가.축키들.map((k, i) => [k, (k === 평가.null허용축 && c && c.goal == null) ? null : v[i]]));
      const note = await 물음('  grader_note(0점 축이 있으면 필수 · 없으면 빈 줄) > ');
      행.grader_note = note;
      결과.동봉 = { ...(결과.동봉 || {}), 채점자, 시각: new Date().toISOString() };
      쓰기(파일, 결과);   // 중간 저장 — 80회는 하루에 안 끝난다(F3)
    }
    rl.close();
    const 사유 = 평가.결과검증(결과, 시험지, 전문);
    console.log(`\n저장됨 → ${path.relative(ROOT, 파일)} · 기계 계약 ${사유.length ? '❌ 남은 사유 ' + 사유.length + '건(예: ' + 사유[0] + ')' : '✅ 유효'}`);
  })();
}

/* ── 판정 ─────────────────────────────────────────────────────────────────── */
if (값('--판정')) {
  const 파일 = path.resolve(값('--판정'));
  const 결과 = 읽기(파일);
  const 시험지 = 읽기(경로.시험지);
  const 사유 = 평가.결과검증(결과, 시험지, 전문);
  if (사유.length) {
    console.log(`[과제생성평가] ❌ 결과 파일 무효(${사유.length}건 — 한 행만 버리지 않는다 · E2):`);
    for (const s of 사유.slice(0, 20)) console.log('   · ' + s);
    process.exit(1);
  }
  const 집 = 평가.집계(결과, 시험지);
  const 현 = 현행판();
  const 다름 = 평가.비교축차이(결과.동봉, 현);
  console.log(`[과제생성평가] 판정 — ${path.relative(ROOT, 파일)} · 채점자 ${결과.동봉.채점자} · ${결과.동봉.시각}`);
  for (const k of 평가.축키들) {
    const a = 집.축[k];
    console.log(`  ${a.통과 ? '✅' : '❌'} ${k.padEnd(11)} ${a.합}/${a.분모} = ${a.비율 == null ? '—' : a.비율.toFixed(2)}  (통과선 ${평가.통과선[k]})`);
  }
  console.log(`  ⑥ 셀(급수별 accuracy): ${평가.급수들.map((l) => `${l} ${집.셀.accuracy[l].합}/${집.셀.accuracy[l].분모}`).join(' · ')}${집.셀미달.length ? ' — ❌ 미달 ' + 집.셀미달.join(',') + '(V6-26 전체 미통과)' : ''}`);
  console.log(`  커버리지 ${시험지.커버리지.선조합}/${시험지.커버리지.전체} · 안 선 조합 ${시험지.커버리지.안선목록.length}`);
  console.log(`  비교축 7 ↔ 현행: ${다름.length ? '❌ 다른 칸 ' + 다름.join(',') + ' — 이 결과는 «옛 실행판»의 것이라 지금 초록의 근거가 아니다(V6-23)' : '✅ 같은 실행판'}`);
  console.log(`  ⇒ ${집.통과 && !다름.length ? '✅ §8-B 통과 — 첫 생성 행 «전» 필수 #6 의 결과 1벌이 섰다' : '❌ §8-B 미통과'}`);
  process.exit(집.통과 && !다름.length ? 0 : 1);
}

if (!argv.length) console.log('사용법: --드라이런 | --원격 | --채점 <파일> --채점자 <이름> | --판정 <파일>');
