/* 활성 조각 대기 파일 ↔ 코드 정본 대조 — §12-21 의 «cron 등록 SQL 대조» 순수 반쪽.
 *
 * ■ 무엇을 재나
 *   ① 활성 조각이 «정확히 한 곳»에 있다 — 대기 자리(supabase/활성조각_c12.sql · 마이그 폴더 밖)
 *      또는 착지 자리(supabase/migrations/*_gen_activate_c12.sql). 둘 다·둘 다 아님 = 사고.
 *   ② 크론식 4 == lib/생성상수.js `크론표`(코드 쪽 정본 — 그 파일 머리말이 이 대조를 예고한다).
 *      §12-21: 「실재만 재면 오과녁이 초록으로 지나간다」 — 스케줄·실행 주체·함수·인자 셋 전부.
 *   ③ 감시 7항이 deliver-check 등록 «본문»에 실재 + 활성일 머리 게이트 + 리더 여유 한 원천.
 *   ④ 두 정본 방지 — 대기 파일에 jobs_load 재정의가 없다(활성일 가드는 20260822090000 마이그
 *      «하나»가 진다). 가드 마이그 쪽엔 가드 블록이 실재한다.
 *   ⑤ 상태별 자리표 — 대기 중엔 자리표 3종+ZERO checksum, 착지 후엔 자리표 0+스탬프.
 *
 * ■ 원천: 설계 = appsscript docs/상태기반_과제선택_설계.md §3-2-a(cron 표·감시 7항·C5) ·
 *   코드 정본 = lib/생성상수.js 크론표 · 물리 = supabase/활성조각_c12.sql(대기) +
 *   supabase/migrations/20260822090000_gen_active_guard_c12.sql(가드). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 대기경로 = path.join(ROOT, 'supabase', '활성조각_c12.sql');
const 마이그폴더 = path.join(ROOT, 'supabase', 'migrations');
const 착지들 = fs.readdirSync(마이그폴더).filter((f) => /_gen_activate_c12\.sql$/.test(f));
const 대기실재 = fs.existsSync(대기경로);
const ZERO = '0'.repeat(64);

test('활성 조각 ① — 정확히 한 곳(대기 xor 착지)', () => {
  assert.ok(대기실재 || 착지들.length === 1,
    '활성 조각이 어디에도 없다 — 대기 파일이 지워졌으면 착지 마이그가 있어야 한다');
  assert.ok(!(대기실재 && 착지들.length > 0),
    `대기 파일과 착지 마이그가 «둘 다» 있다(${착지들.join(',')}) — 착지 절차 2(이동·사본 금지) 위반`);
  assert.ok(착지들.length <= 1, `착지 마이그가 여럿이다: ${착지들.join(',')}`);
});

const 경로 = 대기실재 ? 대기경로 : path.join(마이그폴더, 착지들[0] ?? '');
const 원문 = fs.existsSync(경로) ? fs.readFileSync(경로, 'utf8') : '';
const { 크론표 } = require('../lib/생성상수.js');

test('활성 조각 ② — 크론식 4 == lib/생성상수 크론표(코드 정본과 기계 대조)', () => {
  const 등록 = Object.fromEntries(
    [...원문.matchAll(/cron\.schedule\('([a-z-]+)', '([^']+)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(등록, { ...크론표 },
    '등록 SQL 의 이름=크론식이 크론표와 다르다 — 두 정본이 갈렸다(§12-21)');
});

test('활성 조각 ② — 실행 주체·함수·인자(스케줄만 맞고 다른 것을 부르는 오과녁 차단)', () => {
  const 잡몸 = (이름) => 원문.split(`cron.schedule('${이름}'`)[1].split('$job$);')[0];
  // deliver-daily → Edge `deliver` + 맥락=배치(퍼센트 인코딩을 «디코드»로 검증 — 오타도 잡는다).
  const daily = 잡몸('deliver-daily');
  const url = daily.match(/\/deliver\?([A-Za-z0-9%=&]+)/);
  assert.ok(url, 'deliver-daily 가 /deliver?<쿼리> 를 안 부른다');
  assert.equal(decodeURIComponent(url[1]), '맥락=배치',
    '활성 뒤 deliver 는 맥락(배치) 필수 — 누락도 400 이라 첫 배치가 통째로 죽는다(§3-1 v5.8)');
  // generate-worker → Edge `deliver-one`(워커 실물 이름 — §3-2-a 실행 주체 칸).
  assert.ok(잡몸('generate-worker').includes("|| '/deliver-one'"), 'generate-worker 가 deliver-one 을 안 부른다');
  // generate-deadline → SQL 직접 + 집합 RPC + UB 날짜 식(v5.5 B1 — UTC ::date 면 매일 전날로 귀속).
  const dl = 잡몸('generate-deadline');
  assert.ok(dl.includes("engine.jobs_finalize_due((now() at time zone 'Asia/Ulaanbaatar')::date)"),
    '마감 스윕의 함수·인자·UB 식이 계약과 다르다(§3-2-a v5.4 C1 · v5.5 B1)');
  assert.ok(!dl.includes('http_post'), '마감 스윕은 SQL 직접이다(벤더 0 · Edge Fn 불요)');
});

test('활성 조각 ③ — 감시 7항이 deliver-check «본문»에 실재(산문이면 ①만 재고도 초록)', () => {
  const 검 = 원문.split(`cron.schedule('deliver-check'`)[1].split('$job$);')[0];
  for (const 항 of ['① 남은 큐', '②-a 배치 완주', '②-b 죽은 실행', '③ 부분 결손', '④ 열린 시도', '⑤ 과거 고아', '⑥ 실행판 갈림']) {
    assert.ok(검.includes(항), `감시 항 «${항}» 이 등록 본문에 없다(§3-2-a v5.9 — 일곱)`);
  }
  assert.ok(검.includes('오늘 < 활성일'), '활성일 머리 게이트가 없다(v5.7 B9 — 배포~활성 사이 매일 거짓 적색)');
  assert.ok(검.includes('engine.gen_leader_grace()'), '②-b 여유가 리더 게이트와 «한 원천»(gen_leader_grace)이 아니다(v5.12)');
  assert.ok(검.includes('g.lease_until < now() or g.lease_until is null or g.outcome is not null'),
    '④ 의 세 갈래 명시 열거가 없다(v5.7 B7 — 회수가 비운 lease_until 이 표적 그 자체)');
  assert.ok(검.includes("status in ('대기','claimed','적재실패')"),
    '① 이 적재실패를 함께 안 센다(C4 — 그 상태는 착지 수로는 영원히 안 보인다)');
});

test('활성 조각 ④ — 두 정본 방지: jobs_load 는 가드 마이그 «하나»가 진다', () => {
  assert.ok(!원문.includes('create or replace function engine.jobs_load'),
    '활성 조각에 jobs_load 재정의가 있다 — 가드 마이그(20260822090000)와 두 정본이 된다');
  const 가드 = fs.readFileSync(
    path.join(마이그폴더, '20260822090000_gen_active_guard_c12.sql'), 'utf8');
  assert.ok(가드.includes('skipped_inactive') && 가드.includes("to_regprocedure('engine.gen_active_from()')"),
    '가드 마이그에 활성일 가드 블록(존재 판별 + 0건 적재)이 없다(§12-28 전환)');
  assert.ok(원문.includes('create or replace function engine.gen_active_from()')
    && 원문.includes('returns date'),
    '활성 게이트(engine.gen_active_from · v5.13-b ⑤)를 활성 조각이 안 세운다');
});

test('활성 조각 ⑤ — 멱등·무접촉·상태별 자리표', () => {
  const un = 원문.match(/jobname in \(([^)]+)\)/);
  assert.ok(un, 'unschedule 후 재등록(멱등 · c10 선례)이 없다');
  const 떼는잡 = [...un[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(떼는잡, Object.keys(크론표).sort(), 'unschedule 목록 ≠ schedule 목록(멱등이 깨진다)');
  for (const 남의잡 of ['transcribe-batch', 'radio-promote-hourly']) {
    assert.ok(!원문.includes(`'${남의잡}'`), `${남의잡} 을 건드린다 — 이 트랙 밖 잡 무접촉`);
  }
  assert.ok(원문.includes("vault.decrypted_secrets") && !/sb_secret|eyJ[A-Za-z0-9]/.test(원문),
    '자격증명은 Vault 참조뿐이다 — 리터럴 키가 파일에 있다');
  if (대기실재) {
    for (const 표 of ['__활성일__', '__버전__', '__기준선__']) {
      assert.ok(원문.includes(표), `대기 상태인데 자리표 ${표} 가 없다(누가 값을 미리 박았다)`);
    }
    assert.ok(원문.includes(ZERO), '대기 상태의 checksum 슬롯은 ZERO 다(스탬프는 착지 절차 3)');
  } else {
    assert.ok(!/__활성일__|__버전__|__기준선__/.test(원문), '착지된 마이그에 자리표가 남았다 — 절차 1 누락');
    assert.ok(!원문.includes(ZERO), '착지된 마이그의 checksum 이 ZERO 다 — 절차 3(스탬프) 누락');
  }
});
