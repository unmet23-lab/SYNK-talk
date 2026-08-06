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

/* ── 합본은 체인이다 ────────────────────────────────────────────────────────
 * L0_스키마.sql 은 migrations/ 조각을 **이어붙인** 생성물이라, 옛 조각의 add 문·확인 블록·
 * 안내 주석이 그대로 남는다 — 그 조각들은 고칠 수 없다(checksum 이 봉인한다).
 * 그래서 「지금 DB 에 무엇이 서 있는가」를 보는 검사는 둘을 지켜야 한다:
 *   ① 뒤 조각이 drop 한 제약은 최종 상태에 없다 — 세면 「옛 이름이 살아 있다」는 **거짓 판정**이 된다.
 *   ② 확인 블록·안내 주석은 **마지막 조각의 것**이 현행이다.
 * 2026-08-06 c7(체인의 첫 두 번째 조각) 착지에서 실측: 안 지키면 3개가 빨개진다.
 * 탐지력은 안 깎인다 — 뒤 조각이 옛 제약을 drop 하지 않으면 그 이름이 그대로 살아 남아 잡힌다. */
const drop된제약 = new Set(
  [...SQL.matchAll(/drop constraint (?:if exists )?(\w+)/g)].map((m) => m[1]));
/* ⚠ 이름과 `check` 사이는 **줄바꿈일 수 있다** — 값목록이 길면 그렇게 쓰게 된다.
 * 옛 정규식은 공백 한 칸만 봐서 그런 제약을 통째로 못 봤고, 못 보면 아래 「이름이 계약 버전을
 * 달고 있다」가 그 제약에 대해 **영원히 통과**한다(빠진 것은 위반이 아니라 무존재로 보인다).
 * 2026-08-06 실측: `staff_role_c7` 을 두 줄로 적었더니 탐지에서 사라졌다. 픽스처로 못박는다. */
const CHECK정의 = /constraint (\w+)\s+check/g;
const 살아있는CHECK = (원천 = SQL) =>
  [...원천.matchAll(CHECK정의)].map((m) => m[1]).filter((n) => !drop된제약.has(n));
const 꼬리시작 = 원문.lastIndexOf('확인 (한 번에)');
const 최종꼬리 = 꼬리시작 === -1 ? '' : 원문.slice(꼬리시작);

function CHECK값목록_(제약이름) {
  const i = SQL.search(new RegExp(`constraint ${제약이름}\\s+check`));
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
  const 이름들 = 살아있는CHECK();
  assert.ok(이름들.length >= 3,
    `살아 있는 CHECK 제약을 ${이름들.length}개밖에 못 찾았다 — 정규식이 낡았거나 뒤 조각이 전부 drop 했다`);
  const 안맞는 = 이름들.filter((n) => !n.endsWith(`_${계약.버전}`));
  assert.deepEqual(안맞는, [],
    `제약 이름이 계약 버전(${계약.버전})과 안 맞는다: ${안맞는.join(', ')}\n` +
    '  계약이 올랐다면 SQL 의 CHECK 를 새 값목록으로 고치고 **이름도 새 버전으로 바꾼 뒤**,\n' +
    '  이미 선 DB 에는 alter table drop constraint / add constraint 를 따로 돌린다(재실행으론 안 바뀐다)');
});

test('탐지력 픽스처 — 이름과 check 가 줄바꿈으로 갈린 제약도 잡는다', () => {
  /* 실저장소를 픽스처로 쓰지 않는다(버그가 아직 있을 것을 요구하게 된다) — 여기서 못박는 것은
   * **탐지기 자체**다. 이 검사가 없으면 위 테스트는 「두 줄로 적힌 옛 이름」을 영원히 통과시킨다. */
  const 두줄 = "  role text not null constraint stale_name_c1\n    check (role in ('a'))";
  assert.deepEqual(살아있는CHECK(두줄), ['stale_name_c1'],
    '줄바꿈으로 갈린 CHECK 를 탐지기가 못 본다 — 못 보는 제약은 위반이 아니라 무존재로 보인다');
  assert.deepEqual(살아있는CHECK('constraint oneline_c1 check (x in (1))'), ['oneline_c1'],
    '한 줄짜리를 놓치면 넓힌 정규식이 옛 형태를 깨뜨린 것이다');
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
  const 시작 = 최종꼬리.indexOf('with 기대열');
  const 끝 = 최종꼬리.indexOf('from 셈;', 시작);
  assert.ok(시작 !== -1 && 끝 !== -1, '확인 쿼리 블록을 못 찾았다 — 앵커가 낡았다(이 검사는 무엇이든 통과시킨다)');
  const 블록 = 최종꼬리.slice(시작, 끝);
  const 정의 = new Set([...블록.matchAll(/\bas ([가-힣A-Za-z_][가-힣A-Za-z_0-9]*)/g)].map((m) => m[1]));
  // CTE 이름도 정의다: `with 이름(...) as (` · `), 이름 as (`
  for (const m of 블록.matchAll(/(?:with|,)\s*([가-힣A-Za-z_][가-힣A-Za-z_0-9]*)\s*(?:\([^)]*\))?\s*as\s*\(/g)) {
    정의.add(m[1]);
  }
  /* ⚠ **마지막** `case when` 이 판정절이다. 처음 것을 잡으면 CTE 안의 case(2026-08-07:
   *   빠진트리거가 「없음/꺼짐」을 가르느라 하나 들였다)부터 끝까지가 조건절이 되고,
   *   그러면 `where schemaname='engine'` 같은 컬럼명이 전부 「미정의 참조」로 잡혀 거짓 적색이 된다. */
  const 조건절 = 블록.slice(블록.lastIndexOf('case when'));
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
  const 기대 = /테이블수=(\d+) and RLS켜짐=(\d+)/.exec(최종꼬리);
  assert.ok(기대, '꼬리 확인 쿼리의 판정 조건을 못 찾았다 — 앵커가 낡았다');
  assert.equal(Number(기대[1]), 테이블수, `확인 쿼리는 테이블 ${기대[1]}개를 기대하는데 SQL은 ${테이블수}개를 만든다`);
  assert.equal(Number(기대[2]), 테이블수, `RLS 기대값(${기대[2]})이 테이블 수(${테이블수})와 다르다 — 모든 테이블에 RLS를 켠다`);
  const 안내 = /기대: (\d+)·(\d+)·/.exec(최종꼬리);
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
  const 실제 = 살아있는CHECK().filter((n) => /_c\d+$/.test(n)).sort();
  assert.ok(실제.length >= 3, `버전 접미사 제약을 ${실제.length}개밖에 못 찾았다 — 정규식이 낡았다`);
  const 시작 = 최종꼬리.lastIndexOf('기대:');
  assert.ok(시작 !== -1, '확인 ④의 「기대:」 줄을 못 찾았다 — 앵커가 낡았다(이 검사는 무엇이든 통과시킨다)');
  const 적힌것 = [...new Set([...최종꼬리.slice(시작).matchAll(/(\w+_c\d+)/g)].map((m) => m[1]))].sort();
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
  /* 체인: 옛 조각의 확인 블록이 앞에 그대로 남아 있다 — **마지막** 조각의 것이 현행이다.
   * 첫 블록을 잡으면 사후 확인 파일을 갱신해도 영원히 「갈라졌다」가 나온다(c7 착지에서 실측). */
  const 시작 = sql.lastIndexOf('확인 (한 번에)');
  if (시작 === -1) return null;
  const m = sql.slice(시작).match(/\/\*([\s\S]*?)\*\//);
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

/* ── 확인 쿼리가 「꺼진 트리거」를 보는가 ───────────────────────────────────
 * 2026-08-07 리허설 변이 실측: c8 트리거를 실제로 끄고 확인_적용후상태.sql 을 돌렸더니
 * 「✅ 전부 통과」가 나왔다. `pg_trigger` 는 **꺼진 트리거의 행을 그대로 들고 있어서**
 * 존재 검사(not exists)에는 안 걸린다 — 새는 방향은 언제나 「통과」다.
 * 걸린 것은 c8 하나가 아니다: 기대트리거 5개 중 넷이 append-only 를 지는 불변식 트리거라,
 * 그것들이 꺼진 DB 를 이 확인이 초록으로 보고한다. 다음 조각이 옛 블록을 베끼면 같은 자리로
 * 돌아가므로(「베낄 곳은 바로 앞 조각」 사고와 같은 형태) 파일 층에 못을 박는다. */
const 트리거상태를보는가 = (sql) => /tgenabled/.test(sql.replace(/^\s*--.*$/gm, ''));

test('사후 확인이 트리거의 「꺼짐」을 본다 — 존재만 물으면 disable 이 초록으로 지나간다', () => {
  const 사후 = fs.readFileSync(path.join(ROOT, 'supabase', '확인_적용후상태.sql'), 'utf8');
  assert.ok(트리거상태를보는가(사후),
    '확인 쿼리가 tgenabled 를 안 본다 — 꺼진 트리거가 「빠진트리거 없음」으로 보고된다.\n'
    + '  정본은 마지막 마이그레이션 조각의 꼬리다. 거기서 고치고 합본을 다시 만들어라.');
});

test('탐지력 픽스처 — tgenabled 를 안 보는 옛 블록을 실제로 잡는다', () => {
  assert.equal(트리거상태를보는가('select 1 from pg_trigger g where g.tgname=e.n'), false,
    '존재 검사만 하는 블록을 통과시키면 이 검사는 무엇이든 통과시킨다');
  assert.equal(트리거상태를보는가('-- tgenabled 를 봐야 한다\nselect 1 from pg_trigger'), false,
    '주석에 적힌 것을 실제 검사로 세면 「고치겠다는 메모」가 픽스를 대신한다');
  assert.equal(트리거상태를보는가("select g.tgenabled from pg_trigger g"), true);
});

/* ── 체인 무결성 ─────────────────────────────────────────────────────────────
 * 두 번째 조각부터는 「앞 판이 서 있어야 한다」를 자기 안에 적는다(base_version).
 * 그 값이 실제 앞 조각의 version 과 어긋나면 **파일은 멀쩡해 보이는데 원격에서만** 터진다
 * (「이력에 그 판이 없다 — 부분·혼합·불명이라 중단한다」). 파일로 잴 수 있는 것을 Run 에 미루지 않는다.
 * 파일명 ↔ migration_version 도 같이 본다: 합본 순서는 **파일명**으로 정해지는데 이력에 남는 것은
 * **변수 값**이라, 둘이 갈리면 적용 순서와 기록이 서로 다른 이야기를 한다. */
const 조각추출 = (s, 이름) => (new RegExp(`${이름} constant text := '(\\d{14})'`).exec(s) || [])[1];

test('마이그레이션 체인: 파일명·version·base_version 이 한 줄로 이어진다', () => {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const 조각 = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(조각.length >= 1, '마이그레이션 조각이 0개다 — 합본의 원천이 사라졌다');
  let 앞 = null;
  for (const 이름 of 조각) {
    const s = fs.readFileSync(path.join(dir, 이름), 'utf8');
    assert.equal(조각추출(s, 'migration_version'), 이름.slice(0, 14),
      `${이름}: 파일명과 migration_version 이 다르다 — 적용 순서(파일명)와 이력(변수)이 갈린다`);
    const base = 조각추출(s, 'base_version');
    if (앞 === null) {
      assert.equal(base, undefined, `${이름}: 첫 조각은 기준선이라 base_version 을 갖지 않는다`);
    } else {
      assert.equal(base, 앞,
        `${이름}: base_version 이 앞 조각(${앞})과 다르다 — 로컬은 초록인데 원격에서만 중단된다`);
    }
    앞 = 조각추출(s, 'migration_version');
  }
});

test('탐지력 픽스처 — 체인이 끊기면 잡는다', () => {
  /* 실저장소가 지금 이어져 있는 것과 검사가 도는 것은 다르다. */
  const 끊긴조각 = "  migration_version constant text := '20260806210000';\n"
    + "  base_version constant text := '19990101000000';";
  assert.equal(조각추출(끊긴조각, 'base_version'), '19990101000000',
    '추출기가 죽었다 — 그러면 위 검사는 무엇이든 통과시킨다');
  assert.equal(조각추출('base_version 을 쓰지 않는 기준선 조각', 'base_version'), undefined,
    '없는 것을 있다고 뽑으면 첫 조각 검사가 거짓 경보를 낸다');
});

/* ── c8: 「어느 교정인가」의 판정이 두 곳에 있다 ────────────────────────────────
 * DB CHECK(learning_events_correction_target_c8)와 앱·서버 검증기(lib/이벤트검증.js)가
 * **각자** 「어느 event_type 에 correction_id 가 필수인가」를 적는다. 한쪽은 SQL 이고 한쪽은
 * JS 라 목록을 하나에서 파생시킬 수 없는 자리다 — 그러면 갈라졌을 때 빨개지게 만든다.
 * 갈라진 상태의 증상은 조용하다: 검증기가 통과시킨 사건을 DB 가 거절하거나(보이는 건 「저장 실패」뿐),
 * 반대로 DB 는 받는데 검증기가 막는다. 이 파일 머리말의 c4 사고와 정확히 같은 형태다. */
test('c8 — correction_id 를 요구하는 event_type 이 SQL CHECK 와 검증기에서 같다', () => {
  const { 이벤트별필수 } = require('../lib/이벤트검증.js');

  const i = SQL.search(/constraint learning_events_correction_target_c8\s+check/);
  assert.notEqual(i, -1, 'c8 CHECK 를 SQL 에서 못 찾았다 — 이름이 바뀌었다면 이 검사도 함께 옮겨라');
  const 끝 = SQL.indexOf(' end', i);
  assert.notEqual(끝, -1, 'c8 CHECK 의 case 문이 안 닫힌다');
  const SQL쪽 = [...SQL.slice(i, 끝).matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

  const 검증기쪽 = Object.entries(이벤트별필수)
    .filter(([, 필수]) => 필수.some((f) => (Array.isArray(f) ? f : [f]).includes('correction_id')))
    .map(([type]) => type)
    .sort();

  assert.deepEqual(SQL쪽, 검증기쪽,
    `DB 와 검증기가 다른 목록을 든다 — SQL=${SQL쪽.join(',')} / 검증기=${검증기쪽.join(',')}\n`
    + '  갈라지면 증상은 「저장이 안 된다」뿐이고 원인이 안 보인다');
  assert.ok(SQL쪽.length > 0, '양쪽이 나란히 비었다 — 그건 일치가 아니라 검사 대상 소실이다');
});

test('탐지력 픽스처 — c8 CHECK 목록 추출기가 실제로 값을 집는다', () => {
  /* 위 검사는 양쪽이 「똑같이 비면」 통과한다. 추출기가 죽어 빈 배열을 내는 것과
   * 목록이 진짜 비어 있는 것이 같은 모양이라, 추출 자체를 여기서 못박는다. */
  const 견본 = "constraint x_c8 check (\n  case when event_type in ('a.b', 'c.d')\n"
    + '       then correction_id is not null\n       else correction_id is null\n  end\n)';
  const j = 견본.search(/constraint x_c8\s+check/);
  const 값 = [...견본.slice(j, 견본.indexOf(' end', j)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(값, ['a.b', 'c.d'], '추출기가 죽었다 — 그러면 위 검사는 빈 배열끼리 비교해 늘 초록이다');
});
