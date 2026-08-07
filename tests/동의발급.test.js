'use strict';
/**
 * 동의 행 생성기 회귀 — P0 §7-2 · §403
 *
 * 왜 있나 — 이 도구가 조용히 틀리는 자리는 셋이고, 셋 다 **증상이 「안 된다」뿐**이다:
 *   ① 유효 동의 판정이 **서버 게이트와 갈라지면** 도구 화면은 ✅인데 학생은 403 을 받는다.
 *      두 판정을 대조할 통로가 없어, 갈라진 걸 아는 유일한 방법은 학생이 못 쓰는 것이다.
 *   ② `agreed_at` 이 미래면 행은 멀쩡히 생기는데 게이트는 계속 막는다(`agreed_at <= now()`).
 *      내 시계로 재면 서버 시간대가 다를 때 그 검사가 **거짓 초록**이 된다 — 서버가 판정해야 한다.
 *   ③ 학생 코드·판은 **사람이 손으로 치는 값**이고 `--현황` 경로는 꼴 검사 없이 SQL 로 간다.
 *      여기는 신뢰 경계다.
 *
 * 🔑 SQL 은 원격에서만 도는 문자열이라 여기서 실행할 수 없다. 그래서 **실행 결과가 아니라
 *   질의문의 급소**를 못박는다 — 실제로 서는지는 리허설 왕복이 따로 잰다(교정확정과 같은 규칙).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  따옴표, 판꼴, 학생꼴, 시각식, 인자파싱, 현황SQL, 대조SQL, 삽입SQL, 확인SQL, 문서해시,
} = require('../tools/동의발급.js');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const LID = '11111111-2222-4333-8444-555555555555';

/* ── ① 서버 게이트와 같은 조건인가 ────────────────────────────────────────────
 * 기대값을 여기 손으로 적지 않고 **서버 파일에서 뽑는다**. 손으로 적으면 서버가 조건을
 * 바꾸는 날 이 검사가 옛 조건을 지키며 초록으로 남는다(= 갈라짐을 못 본다). */
test('🔴 유효 동의 판정이 서버 게이트(functions/uploads)와 같은 조건이다', () => {
  const 서버 = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'uploads', 'index.ts'), 'utf8');
  const 구역 = 서버.slice(서버.indexOf('engine.consents'));
  assert.ok(구역, 'uploads 가 engine.consents 를 안 읽는다 — 게이트 자체가 사라졌는지 먼저 본다');

  /* 서버가 실제로 쓰는 두 술어를 그대로 뽑아 온다. */
  const 술어 = [
    /agreed_at\s*<=\s*now\(\)/,
    /\(\s*revoked_at is null or revoked_at\s*>\s*now\(\)\s*\)/,
    /order by agreed_at desc limit 1/,
  ];
  술어.forEach((re) => {
    assert.match(구역, re, `기대한 서버 술어가 uploads 에 없다: ${re}`);
    [현황SQL(null), 대조SQL('SYNK-001', null), 확인SQL(LID)].forEach((q) => {
      assert.match(q, re,
        `도구 질의가 서버 술어를 안 쓴다: ${re}\n`
        + '     갈라지면 도구는 ✅ 인데 학생은 403 이고, 그 둘을 대조할 방법이 없다');
    });
  });
});

test('🔴 철회된 동의는 유효로 세지 않는다 — 「철회 후 수집 0건」이 여기서도 걸린다', () => {
  [현황SQL(null), 대조SQL('SYNK-001', null), 확인SQL(LID)].forEach((q) => {
    assert.match(q, /revoked_at/,
      '철회를 안 보면 철회한 학생이 「동의 있음」으로 뜨고, 운영자가 다시 안 넣는다');
  });
});

/* ── ② 미래 동의 ──────────────────────────────────────────────────────────── */
test('🔴 미래 판정은 **서버 시계**가 한다 — 내 시계로 재면 시간대가 다를 때 거짓 초록이다', () => {
  assert.match(대조SQL('SYNK-001', '2030-01-01'), /\(\s*'2030-01-01'::timestamptz\s*>\s*now\(\)\s*\)\s*as\s*미래/,
    '미래 여부를 질의에 실어 서버가 답하게 한다');
});

test('시각식 — 안 주면 now(), 주면 timestamptz 리터럴(따옴표를 통과시키지 않는다)', () => {
  assert.equal(시각식(null), 'now()', '기본은 서버 시계다 — 내 시계를 문자열로 굳히지 않는다');
  assert.equal(시각식(undefined), 'now()');
  assert.equal(시각식('2026-08-05'), "'2026-08-05'::timestamptz");
  assert.equal(시각식("2026-08-05'; drop table engine.consents; --"),
    "'2026-08-05''; drop table engine.consents; --'::timestamptz");
});

/* ── ③ 신뢰 경계 ──────────────────────────────────────────────────────────── */
test('🔴 `--현황 --학생` 은 꼴 검사 없이 SQL 로 간다 — 따옴표가 거기서 막는다', () => {
  const q = 현황SQL("SYNK-001'; drop table engine.learners; --");
  assert.match(q, /'SYNK-001''; drop table engine\.learners; --'/);
  assert.ok(!/;\s*drop/i.test(q.replace(/'[^']*(?:''[^']*)*'/g, "''")),
    '리터럴 밖으로 새는 문장이 없다');
});

test('현황 — 학생을 안 주면 필터 절 자체가 안 붙고, 동의 없는 학생이 **먼저** 온다', () => {
  const 전체 = 현황SQL(null);
  assert.ok(!/where l\.student_code/.test(전체), '학생을 안 주면 전원이 대상이다');
  assert.match(전체, /order by \(c\.consent_ver is null\) desc/,
    'deliver?점검 은 「미달=true」만 내고 누구인지는 안 낸다(P0 §371) — 그 한 명이 맨 위에 와야 한다');
  assert.match(현황SQL('SYNK-001'), /where l\.student_code = 'SYNK-001'/);
});

test('학생꼴·판꼴 — 애매하면 거절한다', () => {
  assert.ok(학생꼴('SYNK-001'));
  assert.ok(!학생꼴("SYNK-001'"), '따옴표가 든 코드는 코드가 아니다');
  assert.ok(!학생꼴(''));

  assert.ok(판꼴('v18.9'), '왕복시험·상담폼이 쓰는 실제 판 이름');
  assert.ok(판꼴('v2'));
  assert.ok(!판꼴('18.9'), 'v 로 시작하지 않으면 판 이름이 아니다');
  assert.ok(!판꼴('v18.9 동의문'), '공백이 섞이면 그 행이 어느 판인지 영영 모른다');
  assert.ok(!판꼴(''));
  assert.ok(!판꼴(null));
});

/* ── ④ 삽입 ──────────────────────────────────────────────────────────────── */
test('삽입 — 판은 인자에서, 스키마 판은 계약 파일에서 온다(손으로 안 적는다)', () => {
  const q = 삽입SQL({ learner_id: LID, 판: 'v18.9', 해시: null, 받은날: null, 스키마판: 계약.버전 });
  assert.match(q, new RegExp(`'${LID}'::uuid`));
  assert.match(q, /'v18\.9'/);
  assert.match(q, new RegExp(`'${계약.버전}'`), 'schema_ver 는 계약 정본에서 온다');
  assert.match(q, /values \([^)]*null,\s*now\(\)/s, '문서 사본이 없으면 doc_hash 는 null 이다');
  assert.match(q, /returning consent_id/, '만든 id 를 못 돌려주면 사람이 확인할 게 없다');
  assert.ok(!/revoked_at/.test(q), '이 도구는 철회를 만들지 않는다(D5 · P0 §192 — 다른 절차다)');
});

test('삽입 — `--문서` 를 주면 그 해시가 행에 박힌다(「어느 글에 동의했나」는 소급되지 않는다)', () => {
  const q = 삽입SQL({ learner_id: LID, 판: 'v2', 해시: 'a'.repeat(64), 받은날: '2026-08-05', 스키마판: 'c8' });
  assert.match(q, new RegExp(`'${'a'.repeat(64)}'`));
  assert.match(q, /'2026-08-05'::timestamptz/);
});

test('문서해시 — 같은 내용이면 같은 값, 한 글자만 달라도 다른 값', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), '동의-'));
  const a = path.join(dir, 'a.md'); const b = path.join(dir, 'b.md'); const c = path.join(dir, 'c.md');
  fs.writeFileSync(a, '음성을 모읍니다'); fs.writeFileSync(b, '음성을 모읍니다'); fs.writeFileSync(c, '음성을 모읍니다.');
  assert.equal(문서해시(a), 문서해시(b));
  assert.notEqual(문서해시(a), 문서해시(c));
  assert.match(문서해시(a), /^[0-9a-f]{64}$/);
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ── ⑤ 넣은 뒤 되읽기 ────────────────────────────────────────────────────── */
test('🔴 넣은 뒤 **게이트가 보는 값**을 되읽는다 — 조용한 미적용은 통과와 같은 모양이다', () => {
  const 소스 = fs.readFileSync(path.join(ROOT, 'tools', '동의발급.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(소스, /확인SQL\(대상\.learner_id\)/,
    'insert 의 returning 만 믿으면 「행은 들어갔는데 게이트가 못 본다」를 못 잡는다');
  assert.match(소스, /게이트\.consent_ver !== opt\.판/, '되읽은 값을 실제로 대조해야 되읽기다');
});

/* ── ⑥ 인자·종료코드 ─────────────────────────────────────────────────────── */
test('🔴 인자 파싱 — 깃발 값이 학생 코드로 잡히지 않는다', () => {
  const o = 인자파싱(['SYNK-001', '--판', 'v18.9', '--확정자', '유호', '--적용']);
  assert.equal(o.대상, 'SYNK-001');
  assert.equal(o.판, 'v18.9');
  assert.equal(o.확정자, '유호');
  assert.equal(o.적용, true);

  const 앞뒤바뀜 = 인자파싱(['--판', 'v18.9', 'SYNK-002', '--확정자', '유호']);
  assert.equal(앞뒤바뀜.대상, 'SYNK-002',
    '깃발이 먼저 와도 자유 인자는 하나다 — 판 이름이 학생 코드로 잡히면 엉뚱한 학생에게 동의가 붙는다');
  assert.equal(앞뒤바뀜.적용, false, '기본은 미리보기다');
});

test('깃발 뒤에 값이 없으면 다음 깃발을 값으로 삼지 않는다', () => {
  const o = 인자파싱(['--판', '--적용']);
  assert.equal(o.판, null, "'--적용' 이 판 이름이 되면 그 행이 어느 동의인지 모르게 된다");
  assert.equal(o.적용, true);
});

test('🔴 거절은 종료코드 1 로 나간다 — process.exit() 는 fetch 중에 127(abort)을 낸다', () => {
  const 소스 = fs.readFileSync(path.join(ROOT, 'tools', '동의발급.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/process\.exit\s*\(/.test(소스), 'process.exit() 대신 process.exitCode 를 세운다');
  assert.match(소스, /process\.exitCode\s*=\s*1/);
});

/* ── ⑦ 과녁 게이트를 탄다 ────────────────────────────────────────────────── */
test('🔴 과녁 게이트를 탄다 — 이 도구는 운영 DB 에 법적 근거가 되는 행을 넣는다', () => {
  const 소스 = fs.readFileSync(path.join(ROOT, 'tools', '동의발급.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(소스, /자격증명\.읽기\('동의발급'\)/,
    '.env 를 직접 읽으면 과녁 게이트(--운영)를 통째로 우회한다 — 2026-08-07 실사고 자리다');
  assert.ok(!/process\.env\.SUPABASE/.test(소스), '공용 통로 밖에서 자격증명을 집지 않는다');
});

test('따옴표 — null·숫자도 리터럴로 만든다(호출부가 실수해도 SQL 이 안 깨진다)', () => {
  assert.equal(따옴표(null), "'null'");
  assert.equal(따옴표(12), "'12'");
});
