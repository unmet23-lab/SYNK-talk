'use strict';
/* 문구 감수 판정 회귀 — `lib/문구감수.js` 는 **문이 둘**에서 쓰이므로 규칙이 한 벌인지 여기서 못박는다.
 *
 * 🔴 이 파일이 지키는 가장 큰 것 = **없앨 수 없는 사본이 갈라지지 않는 것**
 *   `VERDICT` 는 DB CHECK(`l10n_reviews_verdict_c13`)의 둘째 사본이다. 없앨 수가 없다 —
 *   화면이 버튼 셋을 그리려면 어휘를 알아야 하는데 서버는 그것을 내주는 경로가 없다.
 *   갈라지면 증상은 400 이 아니라 **500** 이다(DB 가 CHECK 에 없는 값을 받고 그 자리에서 죽는다).
 *   그래서 마이그레이션 원문과 상수를 **한자리에서** 대조한다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { VERDICT, 원문결함, ID꼴, 쪽크기, 커서, 확정요청, 상태전이, 쪽기본, 쪽상한 } =
  require('../lib/문구감수.js');

const 조각 = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '20260826130000_l10n_c13.sql'), 'utf8');

/** 마이그레이션에서 CHECK 값목록을 뽑는다 — 이름으로 찾고 첫 `))` 까지의 리터럴을 센다. */
function CHECK값목록(제약이름) {
  const i = 조각.search(new RegExp(`constraint ${제약이름}\\s+check`));
  assert.notEqual(i, -1, `조각에서 ${제약이름} 을 못 찾았다 — 이름이 바뀌었다면 이 검사도 함께 옮겨라`);
  const 끝 = 조각.indexOf('))', i);
  assert.notEqual(끝, -1, `${제약이름} 의 괄호가 안 닫힌다`);
  return [...조각.slice(i, 끝).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('① verdict 어휘가 DB CHECK 와 한 글자도 안 다르다 — 갈라지면 500 이 난다', () => {
  assert.deepEqual(VERDICT, CHECK값목록('l10n_reviews_verdict_c13'),
    'lib 상수와 마이그레이션 CHECK 가 갈라졌다 — 앱이 보내는 값을 DB 가 거절한다');
  /* 탐지력 — 목록을 흔들면 반드시 빨개야 한다(이 검사가 살아 있다는 증거). */
  assert.notDeepEqual([...VERDICT, '없는판정'], CHECK값목록('l10n_reviews_verdict_c13'),
    '대조가 죽었다 — 목록을 늘려도 통과한다');
});

test('② 문장 상태 어휘도 CHECK 와 같다 — 전이 함수가 없는 값을 내면 update 가 죽는다', () => {
  const 상태들 = CHECK값목록('l10n_strings_status_c13');
  assert.deepEqual(상태들, ['pending', 'verified', 'discarded']);
  for (const v of VERDICT) {
    assert.ok(상태들.includes(상태전이(v)), `상태전이(${v}) = ${상태전이(v)} 가 CHECK 에 없다`);
  }
});

test('③ 「원문을 고쳐야 한다」는 번역을 못 싣는다 — 두 말을 한 번에 할 수 없다', () => {
  const 막힘 = 확정요청({ string_id: 'app.login.title', verdict: 원문결함, final_mn: 'Нэвтрэх', note: '까닭' });
  assert.equal(막힘.값, null);
  assert.equal(막힘.칸, 'final_mn');

  /* 그 판정에는 **까닭이 필수**다 — 그것이 이 판정의 유일한 산출물이라, 없으면 우리 카피를
     무엇으로 고쳐야 할지 아무도 모른다(받을 자리만 있고 내용이 없는 상태). */
  const 까닭없음 = 확정요청({ string_id: 'app.login.title', verdict: 원문결함 });
  assert.equal(까닭없음.값, null);
  assert.equal(까닭없음.칸, 'note');

  const 통과 = 확정요청({ string_id: 'app.login.title', verdict: 원문결함, note: '「싱크」가 몽골어에 대응어가 없다' });
  assert.ok(통과.값, 통과.이유);
  assert.equal(통과.값.final_mn, null);
});

test('④ 나머지 두 판정에는 번역이 반드시 있다 — 빈 문자·공백만도 거절', () => {
  for (const v of VERDICT.filter((x) => x !== 원문결함)) {
    for (const 빈것 of [undefined, null, '', '   ']) {
      const r = 확정요청({ string_id: 'app.login.title', verdict: v, final_mn: 빈것 });
      assert.equal(r.값, null, `${v} + ${JSON.stringify(빈것)} 이 통과했다`);
      assert.equal(r.칸, 'final_mn');
    }
  }
  const ok = 확정요청({ string_id: 'app.login.title', verdict: '고쳤다', final_mn: '  Нэвтрэх  ' });
  assert.ok(ok.값, ok.이유);
  assert.equal(ok.값.final_mn, 'Нэвтрэх', '앞뒤 공백을 안 접었다 — 화면에 보이는 것과 저장된 것이 갈린다');
});

test('⑤ string_id 는 ASCII 만 — 한글 키는 바깥에서 조용히 버려진다(08-26 실측)', () => {
  /* Sentry 태그 키가 한글이라 이벤트는 200 으로 통과하고 태그만 사라진 그 사고와 같은 계열이다.
     이 id 는 앱·문서·내보내기 파일을 오가는 «바깥으로 나가는 키»라 같은 자리에 선다. */
  for (const 나쁜것 of ['앱.로그인.제목', 'App.Login', 'app', 'app..title', '', 'app.title!', 'app_title ']) {
    assert.equal(ID꼴.test(나쁜것), false, `${JSON.stringify(나쁜것)} 을 통과시켰다`);
  }
  for (const 좋은것 of ['app.login.title', 'notice-2026.body', 'guide.ai_use.step1']) {
    assert.equal(ID꼴.test(좋은것), true, `${좋은것} 을 막았다`);
  }
  /* 🔑 값은 한글·키릴이어도 산다 — 막히는 것은 언제나 키다. */
  const r = 확정요청({ string_id: 'app.login.title', verdict: '고쳤다', final_mn: 'Сайн байна уу' });
  assert.ok(r.값, r.이유);
});

test('⑥ 마이그레이션의 id 제약과 lib 의 정규식이 같은 것을 막는다', () => {
  /* 같은 규칙이 두 곳(DB CHECK · lib)에 산다. 갈리면 **한쪽만 통과하는 id** 가 생기고,
     그건 「반입은 됐는데 앱에서 안 보인다」로 나타나 원인이 안 보인다. */
  const i = 조각.indexOf('l10n_strings_id_ascii_c13');
  assert.notEqual(i, -1);
  const 조각정규식 = /check \(string_id ~ '([^']+)'\)/.exec(조각.slice(i))?.[1];
  assert.ok(조각정규식, '조각에서 id 정규식을 못 뽑았다 — 앵커가 낡았다');
  assert.equal(조각정규식, ID꼴.source, 'DB 와 lib 의 id 규칙이 갈라졌다');
});

test('⑦ limit 판정 — 없으면 기본, 범위 밖이면 이유가 선다', () => {
  assert.deepEqual(쪽크기(null), { 값: 쪽기본, 이유: null });
  assert.deepEqual(쪽크기(''), { 값: 쪽기본, 이유: null });
  assert.equal(쪽크기('1').값, 1);
  assert.equal(쪽크기(String(쪽상한)).값, 쪽상한);
  for (const 나쁜것 of ['0', String(쪽상한 + 1), '-1', 'abc', '1.5']) {
    assert.equal(쪽크기(나쁜것).값, null, `limit=${나쁜것} 이 통과했다`);
    assert.ok(쪽크기(나쁜것).이유, '막았는데 이유가 없다 — 부르는 쪽이 무엇을 고칠지 모른다');
  }
});

test('⑧ 커서는 string_id 하나다 — 다른 꼴은 거절한다', () => {
  assert.deepEqual(커서(null), { 값: null, 이유: null });
  assert.equal(커서('app.login.title').값, 'app.login.title');
  /* 🔑 검수 큐의 복합 커서(`1||시각|uuid`)를 여기 먹여도 안 통해야 한다 — 두 커서가 서로를
     통과하면 목록이 조용히 빠진다(반 커서가 실제로 그랬다 · 검수 계약 §3-2). */
  for (const 남의것 of ['1||2026-08-26T00:00:00Z|abc', 'g|1|2|시각|id', '앱.제목']) {
    assert.equal(커서(남의것).값, null, `${남의것} 이 통과했다`);
    assert.ok(커서(남의것).이유);
  }
});

test('⑨ supersedes 는 uuid 여야 한다', () => {
  const 바른것 = 확정요청({
    string_id: 'app.login.title', verdict: '고쳤다', final_mn: 'x',
    supersedes: '0f9c1a2b-3d4e-5f60-8a9b-0c1d2e3f4a5b',
  });
  assert.ok(바른것.값, 바른것.이유);
  const 틀린것 = 확정요청({
    string_id: 'app.login.title', verdict: '고쳤다', final_mn: 'x', supersedes: 'not-a-uuid',
  });
  assert.equal(틀린것.값, null);
  assert.equal(틀린것.칸, 'supersedes');
});

test('⑩ 🔴 l10n 함수가 학생 자원에 닿는 낱말을 한 번도 안 쓴다 — 격리의 기계 증거', () => {
  /* 이 함수의 전제는 「자원부터 가른다」이고, 그 전제가 깨지는 모습은 단 하나다:
     누군가 편의를 위해 학생 표를 조인하는 것. 그때 증상은 **없다**(잘 돌아간다) —
     그래서 사람 눈이 아니라 회귀가 지킨다. */
  const fn = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'functions', 'l10n', 'index.ts'), 'utf8');
  const 금지 = ['submissions', 'learners', 'corrections', 'learning_events', 'staff_access_log', 'review_queue'];
  const 걸린것 = 금지.filter((n) => new RegExp(`engine\\.${n}\\b`).test(fn));
  assert.deepEqual(걸린것, [],
    `l10n 함수가 학생 자원에 닿는다: ${걸린것.join(', ')}\n`
    + '  이 통로는 외부 계약자가 쓴다 — 자원 격리가 이 함수의 존재 이유다.');
  /* 탐지력 — 검사가 살아 있나(가짜 소스에 넣으면 반드시 잡혀야 한다). */
  assert.ok(금지.some((n) => new RegExp(`engine\\.${n}\\b`).test('select * from engine.submissions')),
    '검사가 죽었다 — 금지 낱말을 넣어도 안 걸린다');
});
