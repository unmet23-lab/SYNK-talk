#!/usr/bin/env node
'use strict';
/**
 * 과제생성 시험지 생성기 — §8-B E4 절차로 `evals/과제생성_시험지.json` 을 «결정적으로» 낸다.
 *
 *   node tools/과제생성시험지.js                       # 균등 배분(분포 재료 0 — 첫 시험지 · v5.13-e)
 *   node tools/과제생성시험지.js --분포 Lv3=12,Lv4=5,Lv5=2,Lv6=1    # 그날 정본 실행 행의 level_distribution
 *   node tools/과제생성시험지.js --확인                # 디스크 시험지 == 같은 재료로 재조립한 바이트(재현 대조)
 *
 * ■ 재료(전부 저장소 실물 — DB 0 · 벤더 0): 풀 evals/과제생성_스냅샷풀.json(불변·추가만) · grammar 18기술
 *   = 시드 마이그 20260812120000_engine_c11.sql 의 행 그대로(두 정본 0 — L0 도 같은 바이트) · 앵커 =
 *   lib/과제생성평가.앵커(채점표 판의 일부). 산술은 전부 lib/과제생성평가.시험지조립(순수).
 * ■ 시험지 해시 = 파일 «전체» SHA-256 — 파일 안에는 적지 않는다(순환). 결과 파일 동봉 칸이 든다.
 * ■ 재생성 시점(E8 ③) = 배분 함수의 출력(칸당 수 벡터)이 실제로 바뀔 때만. 같은 분포는 항상 같은 파일.
 *   🚫 매 실행마다 다시 뽑기(통과선이 표본 운에 흔들린다) · 🚫 실학생 스냅샷(§10).
 */
const fs = require('node:fs');
const path = require('node:path');
const { 인자게이트 } = require('../lib/플래그.js');
const 평가 = require('../lib/과제생성평가.js');
const { 경로, 파일해시 } = require('../lib/과제생성현행판.js');

const ROOT = path.resolve(__dirname, '..');
const 시드경로 = path.join(ROOT, 'supabase', 'migrations', '20260812120000_engine_c11.sql');
const 기준일 = '2026-09-01';   // 가상 배정일의 시작점(회전 날짜 후보는 여기서 +k · 파일에 사례별로 박힌다)

const 아는플래그 = ['--분포', '--확인', '--출력'];
const argv = process.argv.slice(2);
const 막힘 = 인자게이트('과제생성시험지', argv, 아는플래그);
if (막힘) { console.error(막힘); process.exit(2); }
const 값 = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

/** 시드 마이그에서 grammar 18행 — `('skill-ko-grammar-…', '라벨', 'grammar', 'c11')`. */
function 기술후보읽기() {
  const 원문 = fs.readFileSync(시드경로, 'utf8');
  const 행들 = [...원문.matchAll(/\('([a-z0-9-]+)',\s*'([^']+)',\s*'grammar',\s*'c\d+'\)/g)]
    .map((m) => ({ skill_id: m[1], label_ko: m[2] }));
  if (행들.length !== 18) throw new Error(`grammar 시드 행이 18이 아니다(${행들.length}) — §6-0 v5.3-a 원천 칸과 갈렸다`);
  return 행들;
}

function 분포파싱(s) {
  if (!s) return null;
  const 분포 = {};
  for (const 조각 of s.split(',')) {
    const [k, v] = 조각.split('=').map((x) => x.trim());
    if (!/^Lv[1-6]$|^null$/.test(k) || !/^\d+$/.test(v)) throw new Error(`--분포 형식: Lv3=12,Lv4=5 … (${조각})`);
    분포[k] = Number(v);
  }
  return 분포;
}

const 풀 = JSON.parse(fs.readFileSync(경로.풀, 'utf8'));
const 분포 = 분포파싱(값('--분포'));
const 시험지 = 평가.시험지조립(풀, 분포, { 기술후보: 기술후보읽기(), 앵커: 평가.앵커, 기준일 });
const 바이트 = JSON.stringify(시험지, null, 1) + '\n';
const 출력 = 값('--출력') ? path.resolve(값('--출력')) : 경로.시험지;

if (argv.includes('--확인')) {
  if (!fs.existsSync(출력)) { console.error(`[시험지] ❌ ${path.relative(ROOT, 출력)} 가 없다`); process.exit(1); }
  const 디스크 = fs.readFileSync(출력, 'utf8');
  if (디스크 !== 바이트) {
    console.error(`[시험지] ❌ 디스크 시험지 ≠ 재조립(같은 풀·분포·절차면 같은 바이트여야 한다 — E4 ⑤) · 디스크 해시 ${파일해시(출력).slice(0, 12)}…`);
    process.exit(1);
  }
  console.log(`[시험지] ✅ 재현 일치 · 해시 ${파일해시(출력)} · 사례 ${시험지.사례.length} · 커버리지 ${시험지.커버리지.선조합}/${시험지.커버리지.전체}`);
  process.exit(0);
}

fs.writeFileSync(출력, 바이트);
const 해시 = 파일해시(출력);
console.log(`[시험지] ${path.relative(ROOT, 출력)} — ${시험지.사례.length}사례 · 배분 ${시험지.배분재료.균등 ? '균등' : '분포 우선'} ${JSON.stringify(시험지.배분재료.급수당)}`);
console.log(`  goal ${시험지.goal유무.있음}/${시험지.goal유무.없음} · 층화 18기술 ≥2회 ${시험지.층화.미달.length ? '❌ 미달 ' + 시험지.층화.미달.join(',') : '✅'} · 같은 급수 칸만인 기술 ${시험지.층화.같은칸만.length}`);
console.log(`  커버리지 ${시험지.커버리지.선조합}/${시험지.커버리지.전체} (안 선 조합 ${시험지.커버리지.안선목록.length} — 운영 노출은 §8-B E5-ⓑ «미검증 노출» 로 센다)`);
console.log(`  시험지 해시 ${해시}`);
