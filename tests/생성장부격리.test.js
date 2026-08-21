/* 생성 실행 장부 격리 — §12-13 (설계 §3-5 목록이 정본 · 여기는 그 목록을 «기계로» 못박는다)
 *
 * 규격: 상태 축·성과 창을 계산하는 어떤 파일도 `generation_jobs`·`generation_attempts` 를
 * 안 읽는다. 장부는 실행 조율(큐·시도)이지 학습 신호가 아니라서, 상태·성과가 그 표를 읽는
 * 순간 「측정용 새 표 금지」(불변식 6)가 뒷문으로 뚫린다.
 *
 * 허용 = §3-5 목록(정본은 설계문 — 여기는 가리킨다): 과제생성 lib · deliver·deliver-one·tasks
 * Edge Fn(과 그 동봉 사본) · deliver-check 등록 SQL(활성 조각 몫 · 아직 0) · §12-8 진단 SQL ·
 * §8-B 조립 스크립트. tools·tests 는 시험·진단층이라 이 검사의 대상이 아니다(§12-8 몫).
 *
 * ⚠ 마이그레이션(supabase/migrations)은 장부의 «정의 자리»라 검사 대상이 아니다. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 장부이름 = /generation_(jobs|attempts)\b/;

/* 파일 경로(ROOT 기준 · posix 구분자)가 허용 자리인가. */
const 허용인가 = (상대) =>
  상대 === 'lib/과제생성.js'
  || 상대.startsWith('supabase/functions/deliver/')
  || 상대.startsWith('supabase/functions/deliver-one/')
  || 상대.startsWith('supabase/functions/tasks/');

function* 걷기(디렉토리) {
  for (const 항목 of fs.readdirSync(디렉토리, { withFileTypes: true })) {
    const 전체 = path.join(디렉토리, 항목.name);
    if (항목.isDirectory()) yield* 걷기(전체);
    else if (/\.(js|mjs|ts)$/.test(항목.name)) yield 전체;
  }
}

test('§12-13 — 상태·성과 계산층(lib·src·functions)에서 실행 장부를 읽는 파일은 허용 목록뿐이다', () => {
  const 위반 = [];
  for (const 층 of ['lib', 'src', path.join('supabase', 'functions')]) {
    for (const 파일 of 걷기(path.join(ROOT, 층))) {
      const 상대 = path.relative(ROOT, 파일).split(path.sep).join('/');
      if (!장부이름.test(fs.readFileSync(파일, 'utf8'))) continue;
      if (!허용인가(상대)) 위반.push(상대);
    }
  }
  assert.deepEqual(위반, [],
    '실행 장부(generation_jobs·attempts)를 §3-5 목록 밖 파일이 읽는다 — 상태·성과가 큐를 읽기 시작하면 불변식 6 이 뒷문으로 뚫린다');
});

test('격리의 핵심 소비자 — 학습자상태·성과회수·과제요약은 장부 이름 0회(직접 못박기)', () => {
  for (const 이름 of ['학습자상태.js', '성과회수.js', '과제요약.js']) {
    const 글 = fs.readFileSync(path.join(ROOT, 'lib', 이름), 'utf8');
    assert.ok(!장부이름.test(글), `lib/${이름} 이 실행 장부를 읽는다`);
  }
});

test('탐지력 — 장부 이름이 든 가짜 소스를 허용 밖 자리로 주면 위반으로 잡힌다', () => {
  /* 검사 술어 자체를 픽스처로 잰다 — 정규식이 느슨해지면(예: 표 이름 오타) 이 시험이 먼저 죽는다. */
  assert.ok(장부이름.test('select * from engine.generation_jobs where 1=1'));
  assert.ok(장부이름.test('update engine.generation_attempts set x=1'));
  assert.ok(!장부이름.test('generation_batch_runs'), 'batch_runs 는 이 격리의 대상이 아니다(§3-5-b 실행 표식)');
  assert.ok(!허용인가('lib/학습자상태.js') && !허용인가('src/과제API.js'));
  assert.ok(허용인가('supabase/functions/deliver/생성모드.ts') && 허용인가('lib/과제생성.js'));
});
