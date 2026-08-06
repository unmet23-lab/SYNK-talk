/**
 * L0 물리 스키마(supabase/L0_스키마.sql) 회귀
 *
 * 왜 있나 — DDL이 값목록을 CHECK로 박는 순간 **정본이 두 곳**이 된다(계약 JSON + SQL).
 *   c4에서 event_type이 늘었는데 SQL만 안 고치면 **서버는 보내고 DB는 조용히 거절한다** —
 *   증상은 「저장이 안 된다」뿐이라 원인이 안 보인다.
 *   목록은 하나에서 파생시키거나, 갈라지면 빨개지게 만든다 — 여기선 후자다.
 *
 * 🔑 RLS 검사가 여기 있는 이유: `engine`은 지금 API에 노출되지 않아 정책 실수가 무해하다.
 *   그래서 **잊기 좋고**, 노출하는 날 한꺼번에 드러난다. 무해할 때 못박아 둔다.
 *
 * 탐지력 실측(2026-08-05) — 변이 5/5 전량 빨개짐: 값 오타 · 값 삭제 · 순서 뒤집기 ·
 *   골든판정 문구 변조 · RLS 한 줄 삭제. 원본은 초록(거짓양성 0).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
/* 주석을 벗기고 센다 — 헤더의 c4 마이그레이션 **예시**가 실제 제약으로 세어져서
 * 버전 검사가 빨개졌다(2026-08-05 실측). 검사가 자기 문서를 위반으로 잡으면 곧 꺼진다.
 * 두 종류 다 벗긴다: 줄 주석 `--` 과 블록 주석(확인 쿼리를 담아둔 자리).
 * ⚠ 천장: 문자열 리터럴 안의 `--`·`/*` 는 구분하지 못한다(지금 이 파일엔 없다). */
const 원문 = fs.readFileSync(path.join(ROOT, 'supabase', 'L0_스키마.sql'), 'utf8');
const SQL = 원문.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

function CHECK값목록_(제약이름) {
  const i = SQL.indexOf(`constraint ${제약이름} check`);
  assert.notEqual(i, -1, `SQL에서 제약 ${제약이름}을 못 찾았다 — 이름이 바뀌었다면 이 테스트도 함께 옮겨라`);
  const 끝 = SQL.indexOf('))', i);
  assert.notEqual(끝, -1, `${제약이름}의 괄호가 안 닫힌다`);
  return [...SQL.slice(i, 끝).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/* 제약 이름의 버전은 계약에서 파생시킨다 — 손으로 적으면 개정마다 세 곳을 따로 고쳐야 하고,
 * 하나를 빠뜨리면 「이름이 갈렸다」가 아니라 「제약을 못 찾았다」로 나와 원인이 흐려진다.
 * 「이름이 계약 버전을 달고 있는가」는 아래 전용 테스트 하나가 전담한다(판정을 두 곳에 적지 않는다). */
const 제약 = (기본이름) => `${기본이름}_${계약.버전}`;

test('event_type CHECK가 계약 값목록과 같다', () => {
  assert.deepEqual(CHECK값목록_(제약('learning_events_event_type')),
    계약.learning_events.값목록.event_type,
    'DDL과 계약이 갈라졌다 — 서버는 보내는데 DB가 조용히 거절하는 상태가 된다.\n' +
    '  고치는 법: 계약 파일을 먼저 고치고(c4 개정) SQL의 CHECK를 그것에 맞춘다');
});

test('task_type CHECK가 계약 값목록과 같다', () => {
  assert.deepEqual(CHECK값목록_(제약('learning_events_task_type')),
    계약.learning_events.값목록.task_type, 'DDL과 계약이 갈라졌다');
});

test('task_format CHECK가 계약 값목록과 같다 (c5 — task_type과 다른 축)', () => {
  /* 🔴 이름이 비슷해 실제로 한 번 섞였다: 발주 §1이 `task_type`에 낭독·자유발화를 넣었다.
   * 섞이면 섀도잉 데이터와 자유발화 데이터를 나중에 못 가르고,
   * 낭독으로 회화 모델을 학습시키는 사고가 조용히 성립한다. */
  assert.deepEqual(CHECK값목록_(제약('submissions_task_format')),
    계약.learning_events.값목록.task_format, 'DDL과 계약이 갈라졌다');
});

test('verdict CHECK가 계약 골든판정 3값과 같다', () => {
  assert.deepEqual(CHECK값목록_(제약('corrections_verdict')), 계약.골든판정, 'DDL과 계약이 갈라졌다');
});

test('오류태그 23종은 DB CHECK로 복제하지 않는다 (배열 CHECK = 이중 정본)', () => {
  // 태그 어휘는 아직 다듬어지는 중이라 DB 제약으로 굳히면 마이그레이션만 잦아진다.
  // 검증은 서버(계약 파일이 정본) — 문서 §3-4 v1.2 정정.
  const 태그가_SQL에 = 계약.오류태그.filter((t) => SQL.includes(`'${t}'`));
  assert.deepEqual(태그가_SQL에, [],
    `오류태그가 DDL에 박혔다: ${태그가_SQL에.join(', ')} — 계약 파일과 이중 정본이 된다`);
});

test('CHECK 제약 이름이 계약 버전을 달고 있다 (c4 개정이 조용히 미적용되는 것을 막는다)', () => {
  /* `create table if not exists` 는 테이블이 이미 있으면 문장 전체를 건너뛴다 —
   * CHECK 를 고치고 재실행해도 **아무 일도 안 일어나는데 초록으로 보인다.**
   * 이름에 버전을 박아두면 ①계약이 c4로 오를 때 이 테스트가 빨개져 rename 을 강제하고
   * ②DB 쪽은 확인 ④ 가 옛 이름을 드러낸다. 파일과 DB 양쪽에 눈을 하나씩 둔다. */
  const 이름들 = [...SQL.matchAll(/constraint (\w+) check/g)].map((m) => m[1]);
  assert.ok(이름들.length >= 3, `CHECK 제약을 ${이름들.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  const 안맞는 = 이름들.filter((n) => !n.endsWith(`_${계약.버전}`));
  assert.deepEqual(안맞는, [],
    `제약 이름이 계약 버전(${계약.버전})과 안 맞는다: ${안맞는.join(', ')}\n` +
    '  계약이 올랐다면 SQL 의 CHECK 를 새 값목록으로 고치고 **이름도 새 버전으로 바꾼 뒤**,\n' +
    '  이미 선 DB 에는 alter table drop constraint / add constraint 를 따로 돌린다(재실행으론 안 바뀐다)');
});

test('확인 쿼리가 참조하는 이름이 전부 정의된 별칭이다 (별칭만 고치고 참조를 안 고치면 Run 이 깨진다)', () => {
  /* 실측 2026-08-06: c3→c4 개정에서 `as c3제약`만 `as c4제약`으로 고치고
   * `case when ... and c3제약=3` 참조를 안 고쳤다. 위 「제약 이름」 테스트는 초록이었다 —
   * 그건 constraint 이름만 보지 확인 쿼리 안을 안 본다. 유호님이 Run 하면 그때서야
   * 「column c3제약 does not exist」가 뜬다. 텍스트 검사로 잡을 수 있는 것을 사람 손에 미루지 않는다. */
  /* ⚠ `SQL`이 아니라 `원문`을 본다 — 확인 쿼리는 **블록 주석 안**에 살고, 위 SQL 상수는
   *   그 주석을 벗겨낸 것이라 여기선 아무것도 안 보인다(그러면 이 검사는 영원히 통과한다). */
  /* c6: 확인 쿼리가 「개수 세기」에서 「이름 대조」(CTE)로 바뀌면서 옛 앵커(`) t;`)가 죽었다.
   * 앵커를 넓히면서 참조 검사도 함께 넓힌다 — CTE 이름은 `from 빠진열` 처럼 `=` 없이 참조되므로
   * `=` 만 보던 옛 정규식은 그것을 통째로 놓쳤다(별칭을 지워도 통과했다). */
  const 시작 = 원문.indexOf('with 기대열');
  const 끝 = 원문.indexOf('from 셈;', 시작);
  assert.ok(시작 !== -1 && 끝 !== -1, '확인 쿼리 블록을 못 찾았다 — 앵커가 낡았다(이 검사는 무엇이든 통과시킨다)');
  const 블록 = 원문.slice(시작, 끝);
  const 정의 = new Set([...블록.matchAll(/\bas ([가-힣A-Za-z_][가-힣A-Za-z_0-9]*)/g)].map((m) => m[1]));
  // CTE 이름도 정의다: `with 이름(...) as (` · `), 이름 as (`
  for (const m of 블록.matchAll(/(?:with|,)\s*([가-힣A-Za-z_][가-힣A-Za-z_0-9]*)\s*(?:\([^)]*\))?\s*as\s*\(/g)) {
    정의.add(m[1]);
  }
  const 조건절 = 블록.slice(블록.indexOf('case when'));
  const 참조 = [...조건절.matchAll(/([가-힣A-Za-z_][가-힣A-Za-z_0-9]*)\s*=/g)].map((m) => m[1]);
  for (const m of 조건절.matchAll(/from\s+([가-힣A-Za-z_][가-힣A-Za-z_0-9]*)/g)) 참조.push(m[1]);
  assert.ok(참조.length >= 5, `판정 조건에서 참조를 ${참조.length}개밖에 못 뽑았다 — 정규식이 낡았다`);
  const 미정의 = 참조.filter((n) => !정의.has(n));
  assert.deepEqual(미정의, [],
    `확인 쿼리가 정의되지 않은 이름을 참조한다: ${미정의.join(', ')}\n` +
    `  정의된 별칭: ${[...정의].join(', ')}\n` +
    '  별칭을 바꿨으면 `case when` 절의 참조도 함께 바꿔라 — 아니면 이 SQL 은 실행 자체가 실패한다');
});

test('확인 쿼리의 기대 테이블·RLS 수가 실제 create table 수와 같다', () => {
  /* 실측 2026-08-06(c5): 테이블을 2개 늘리고 꼬리 확인의 `테이블수=6`을 손으로 8로 고쳤다.
   * 손으로 고치는 자리 = 다음번에 빠뜨리는 자리다. 빠뜨리면 유호님 화면에 ❌가 뜨는데
   * **스키마는 멀쩡하다** — 「기대값이 낡았다」와 「적용이 덜 됐다」가 같은 모양으로 보인다.
   * 진짜 미적용을 못 믿게 만드는 게 더 큰 손해라 여기서 못박는다. */
  const 테이블수 = [...SQL.matchAll(/create table if not exists engine\.\w+/g)].length;
  const 기대 = /테이블수=(\d+) and RLS켜짐=(\d+)/.exec(원문);
  assert.ok(기대, '꼬리 확인 쿼리의 판정 조건을 못 찾았다 — 앵커가 낡았다');
  assert.equal(Number(기대[1]), 테이블수, `확인 쿼리는 테이블 ${기대[1]}개를 기대하는데 SQL은 ${테이블수}개를 만든다`);
  assert.equal(Number(기대[2]), 테이블수, `RLS 기대값(${기대[2]})이 테이블 수(${테이블수})와 다르다 — 모든 테이블에 RLS를 켠다`);
  const 안내 = /기대: (\d+)·(\d+)·/.exec(원문);
  assert.ok(안내 && Number(안내[1]) === 테이블수 && Number(안내[2]) === 테이블수,
    `❌ 안내문의 기대값이 낡았다(${안내 && 안내[0]}) — 유호님이 읽는 숫자라 판정 조건보다 더 틀리면 안 된다`);
});

test('모든 engine 테이블에 RLS가 켜져 있다 (잊은 테이블 = 노출하는 날의 구멍)', () => {
  const 테이블 = [...SQL.matchAll(/create table if not exists engine\.(\w+)/g)].map((m) => m[1]);
  assert.ok(테이블.length >= 6, `engine 테이블을 ${테이블.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  const RLS = new Set([...SQL.matchAll(/alter table engine\.(\w+)\s+enable row level security/g)]
    .map((m) => m[1]));
  const 빠진 = 테이블.filter((t) => !RLS.has(t));
  assert.deepEqual(빠진, [],
    `RLS 없는 테이블: ${빠진.join(', ')} — engine을 API에 노출하는 날 통째로 읽힌다`);
});

test('학생에게 쓰기 정책을 열지 않았다 (쓰기는 전부 Edge Function을 지난다 · §4-3)', () => {
  const 정책 = [...SQL.matchAll(/create policy \w+ on engine\.\w+ for (\w+)/g)].map((m) => m[1]);
  assert.ok(정책.length >= 5, `정책을 ${정책.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  assert.deepEqual([...new Set(정책)], ['select'],
    `select 아닌 정책이 있다: ${[...new Set(정책)].join(', ')} — 학생 토큰이 DB에 직접 쓰면 payload 검증을 건너뛴다`);
});

/* ── supabase/확인_적용전상태.sql — 유호님이 직접 붙여넣는 파일이라 성질이 다르다 ──
 * 「읽기만 한다」고 적어두고 Run 하시게 하는 파일이다. 여기에 쓰기 문장이 한 줄이라도 섞이면
 * **재려던 「실행 전 상태」를 재는 행위가 오염시킨다** — 그러면 무엇이 원래 있었는지 영영 모른다.
 * 프로즈로 "읽기 전용"이라 적는 것으로는 안 지켜지므로 기계로 막는다. */
/* ── F124: 스키마 정본은 L0 하나다 ──────────────────────────────────────────
 * 2026-08-06 실측: 발주서가 `student_homeworks`·`ai_processing_logs`·
 * `verified_learning_datasets` 3테이블을 DDL 로 신설했는데 **셋 다 이미 있는
 * submissions·corrections 의 재발명**이었다(GPT 이종 검수 `failed_p0`).
 * 원인은 「L0 를 Grep 조각으로만 읽고 **이 테이블이 존재해야 하는가**를 한 번도 안 물은 것」이다 —
 * 사람이 물어야 발동하는 규칙이라 안 돌았다. 그래서 기계로 옮긴다:
 * **발주서는 스키마를 정의하지 않는다.** 정의가 필요하면 L0 를 고치는 것이 유일한 통로다.
 *
 * ⚠ 검수의뢰 문서는 제외한다 — 「무엇을 검수에 부쳤나」의 기록이라 원문이 남아야 하고,
 *   머리말에 ⛔ 스탬프가 붙어 있다. 잡는 것은 **구현자가 읽는 문서**뿐이다(F103: 거짓 경보를 내는 가드는 꺼진다). */
test('발주서가 테이블을 정의하지 않는다 (스키마 정본은 L0 하나 · F124)', () => {
  const 발주경로 = path.join(ROOT, 'docs', '발주_수집파이프라인.md');
  if (!fs.existsSync(발주경로)) return;
  const sql블록 = (fs.readFileSync(발주경로, 'utf8').match(/```sql[\s\S]*?```/g) || []).join('\n');
  const 정의 = [...sql블록.matchAll(/create table (?:if not exists )?([\w.]+)/gi)].map((m) => m[1]);
  assert.deepEqual(정의, [],
    `발주서가 테이블을 정의한다: ${정의.join(', ')}\n` +
    '  스키마 정본은 supabase/L0_스키마.sql 하나다 — 발주서가 따로 정의하면 정본이 둘이 되고,\n' +
    '  어긋나는 날 어느 쪽이 진실인지 알 방법이 없다(F124). 필요한 테이블이면 L0 를 고쳐라.');
});

test('탐지력 픽스처 — 발주서에 DDL 이 되살아나면 잡는다', () => {
  /* 실저장소가 깨끗한 것과 검사가 도는 것은 다르다. 위 검사가 쓰는 바로 그 추출을 픽스처로 확인한다. */
  const 되살아난판 = '```sql\ncreate table student_homeworks (\n  id uuid primary key\n);\n```';
  const 뽑힘 = [...되살아난판.matchAll(/create table (?:if not exists )?([\w.]+)/gi)].map((m) => m[1]);
  assert.deepEqual(뽑힘, ['student_homeworks'], '추출기가 죽었다 — 그러면 위 검사는 무엇이든 통과시킨다');
  const 산문만 = '`create table` 을 여기 쓰지 않는다는 규칙이 있다';
  assert.deepEqual((산문만.match(/```sql[\s\S]*?```/g) || []), [], '산문을 sql 블록으로 잡으면 거짓 경보가 된다');
});

/* ── 낡은 기대값 3회 ─────────────────────────────────────────────────────────
 * 증상이 세 번 다 똑같았다: **정상 적용이 ❌로 보인다.** 스키마는 멀쩡한데 유호님 화면만 빨갛다.
 *   ① c3→c4: 확인 ④ 「기대:」 줄이 옛 접미사를 그대로 적었다(발주서 §2-1)
 *   ② 이력 테이블: 테이블 수 기대가 안 올랐다 — 위 「기대 테이블·RLS 수」 검사가 그 자리를 막았다
 *   ③ c4→c5: **발주서**가 `계약 c4`·기대 튜플을 손으로 들고 있어 c5 기준선과 갈라졌다 (2026-08-06 실측)
 * 세 번째라 고치는 대신 **쓸 수 없게** 만든다 — 숫자는 기준선 파일에만 살고 발주서는 가리키기만 한다.
 * 🔑 이 검사가 없으면 낡음이 **조용하다**: 문서는 읽히고, 사람은 그 숫자를 믿고, DB는 멀쩡하다. */
const 튜플 = /\d+·\d+·\d+·\d+·\d+/g;

test('발주 문서가 확인 기대값을 손으로 들고 있지 않다 (숫자 정본은 기준선 파일 하나)', () => {
  const docs = path.join(ROOT, 'docs');
  const 걸린것 = fs.readdirSync(docs)
    .filter((f) => f.startsWith('발주_') && f.endsWith('.md'))
    .flatMap((f) => (fs.readFileSync(path.join(docs, f), 'utf8').match(튜플) || []).map((t) => `${f}: ${t}`));
  assert.deepEqual(걸린것, [],
    `발주 문서가 기대값 튜플을 적고 있다: ${걸린것.join(' / ')}\n` +
    '  그 숫자의 정본은 supabase/L0_스키마.sql 꼬리 확인 하나다. 문서에 복사하면 다음 계약 개정 때\n' +
    '  **정상 적용이 ❌로 보인다** — 같은 형태로 세 번 났다. 숫자를 지우고 파일을 가리켜라.');
});

test('탐지력 픽스처 — 발주 문서에 기대값 튜플이 되살아나면 잡는다', () => {
  /* 실저장소가 깨끗한 것과 검사가 도는 것은 다르다(위 검사는 지금 0건을 보고 통과한다). */
  assert.deepEqual('꼬리 확인 「✅ 전부 통과」(**8·8·5·0·4**)'.match(튜플), ['8·8·5·0·4'],
    '추출기가 죽었다 — 그러면 위 검사는 무엇이든 통과시킨다');
  assert.equal('기대값은 기준선 파일이 정본이다'.match(튜플), null, '산문을 튜플로 잡으면 거짓 경보가 된다');
});

/* ── §2-1이 요구했으나 없던 회귀 ─────────────────────────────────────────────
 * 위 「기대 테이블·RLS 수」는 **숫자**만 본다. 확인 ④의 「기대:」 줄에 적힌 **제약 이름**은 아무도 안 봤다 —
 * 그런데 그 줄이 정확히 ①에서 낡았던 자리다. 유호님이 ❌를 받았을 때 붙여넣는 화면이라,
 * 여기가 낡으면 **정상 DB를 「고장」으로 보고**하게 만든다(판정을 뒤집어 보여주는 유일한 창). */
test('확인 ④ 「기대:」 줄의 제약 이름이 실제 CHECK 이름과 정확히 같다', () => {
  const 실제 = [...SQL.matchAll(/constraint (\w+_c\d+) check/g)].map((m) => m[1]).sort();
  assert.ok(실제.length >= 3, `버전 접미사 제약을 ${실제.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  const 시작 = 원문.lastIndexOf('기대:');
  assert.ok(시작 !== -1, '확인 ④의 「기대:」 줄을 못 찾았다 — 앵커가 낡았다(이 검사는 무엇이든 통과시킨다)');
  const 적힌것 = [...new Set([...원문.slice(시작).matchAll(/(\w+_c\d+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(적힌것, 실제,
    `「기대:」 줄이 적은 이름과 실제 제약이 다르다\n  적힘: ${적힌것.join(' · ')}\n  실제: ${실제.join(' · ')}\n` +
    `  계약은 지금 ${계약.버전}다. 제약을 새 버전으로 바꿨으면 이 안내 줄도 함께 바꿔라 —\n` +
    '  안 바꾸면 유호님이 정상 DB를 「고장」으로 보고하게 된다(발주서 §2-1의 실사고).');
});

test('확인_적용전상태.sql 은 읽기 전용이다 (쓰기 동사 0)', () => {
  const 확인원문 = fs.readFileSync(path.join(ROOT, 'supabase', '확인_적용전상태.sql'), 'utf8');
  const 확인본문 = 확인원문.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
  const 쓰기동사 = /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|refresh|call|do)\b/i;
  const 걸린것 = 확인본문.match(쓰기동사);
  assert.equal(걸린것, null,
    `확인 파일 본문에 쓰기 동사 "${걸린것 && 걸린것[0]}" 가 있다 — 이 파일은 상태를 재기만 해야 한다`);
  assert.ok(/^\s*with\b|^\s*select\b/im.test(확인본문),
    '확인 파일에 조회문이 없다 — 주석만 남았거나 본문이 통째로 사라졌다(빈 파일도 「쓰기 0」으로 통과한다)');
});

/* ── 사후 확인 쿼리는 스키마 꼬리의 사본이다 ────────────────────────────────
 * 발주 §5 표가 사후 확인을 **합본 밖**에 두라고 해서(⑤ 철회 조항) 같은 쿼리가 두 곳에 산다:
 *   ① supabase/L0_스키마.sql 꼬리의 블록 주석 안 — 정본. 본체를 Run 해도 안 돈다.
 *   ② supabase/확인_적용후상태.sql — 실제로 돌리는 파일.
 * 갈라지면 **「✅ 전부 통과」가 낡은 기준으로 나온다** — 판정을 뒤집어 보여주는 형태라 제일 나쁘다.
 * SQL 엔 include 가 없어 하나에서 파생시킬 수 없으니, 갈라지면 빨개지게 만든다.
 * 2026-08-06 기준선 적용 때 이 사본을 신설하면서 함께 넣었다(사본을 만든 커밋이 가드도 낸다). */
function 꼬리확인쿼리(sql) {
  const m = sql.match(/확인 \(한 번에\)[\s\S]*?\/\*([\s\S]*?)\*\//);
  return m ? m[1] : null;
}
const 쿼리정규화 = (s) => s.replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ').trim();

test('사후 확인 쿼리 = 스키마 꼬리 사본 (두 곳이 갈라지면 빨개진다)', () => {
  const 스키마 = fs.readFileSync(path.join(ROOT, 'supabase', 'L0_스키마.sql'), 'utf8');
  const 사후 = fs.readFileSync(path.join(ROOT, 'supabase', '확인_적용후상태.sql'), 'utf8');
  const 꼬리 = 꼬리확인쿼리(스키마);
  assert.ok(꼬리, '스키마 꼬리에서 「확인 (한 번에)」 블록을 못 찾았다 — 추출기가 죽으면 이 검사는 무의미하다');
  assert.equal(쿼리정규화(사후), 쿼리정규화(꼬리),
    '확인_적용후상태.sql 이 스키마 꼬리와 다르다.\n'
    + '  둘 중 하나만 고쳤다 — 정본은 스키마 꼬리다. 꼬리를 고치고 그대로 복사해라.');
});

test('탐지력 픽스처 — 사본이 한 글자라도 어긋나면 잡는다', () => {
  const 원본 = '확인 (한 번에)\n-- 머리말\n/* select 1 as 판정 from 셈; */';
  assert.equal(쿼리정규화(꼬리확인쿼리(원본)), 'select 1 as 판정 from 셈;',
    '추출기가 죽었다 — 그러면 위 검사는 무엇이든 통과시킨다');
  assert.notEqual(쿼리정규화('select 1 as 판정 from 셈2;'), 쿼리정규화(꼬리확인쿼리(원본)),
    '비교가 죽었다 — 한 글자 차이를 못 잡으면 갈라짐이 조용히 지나간다');
  assert.equal(쿼리정규화('select 1 as 판정\n  from 셈;'), 쿼리정규화('select   1 as 판정 from 셈;'),
    '공백·줄바꿈 차이를 불일치로 잡으면 거짓 경보가 된다');
});
