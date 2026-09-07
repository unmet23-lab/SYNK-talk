/* sunday-bundle 의 불변식 — 일요일 자율일 «재료»를 받는 문이 규칙 한 벌 아래 있는지 잰다.
 *
 * 🔑 재는 것 넷:
 *   ① 판정(`lib/자율일재료.js`) — 봉투 거절과 행별 거절이 «무엇이 없나»로 갈리는가.
 *   ② 🔴 발행 뒤 불변 — 이미 있는 재료를 갈아 끼우는 갈래가 «딱 하나»인가(설계 §③-㉠).
 *   ③ 함수 소스 불변식 — 시크릿 미설정이 503 인가 · 이 문이 «큐»(task.assigned·submissions)를 안 건드리는가
 *     · 받은 묶음을 벗기지 않고 그대로 싣는가(정답 원본이 여기 말고는 없다 · 설계 §⑥).
 *   ④ 동봉 완결성 — 규칙 lib 과 `schema_ver` 정본(계약 JSON)이 표에 다 실렸는가.
 *
 * 행동(멱등·경쟁·분모 응답)은 실제 DB 왕복이 증명한다 — 리허설에 부은 뒤 잰다(아직 안 재봤다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { 코드만 } = require('./lib/소스검사.js');

const ROOT = path.resolve(__dirname, '..');
const 규칙 = require('../lib/자율일재료.js');
const FN디렉터리 = path.join(ROOT, 'supabase', 'functions', 'sunday-bundle');
const 소스 = fs.readFileSync(path.join(FN디렉터리, 'index.ts'), 'utf8');
const 주석뺀소스 = 코드만(소스);

const 자율일 = '2026-12-06';
const 항목하나 = [{ 항목ID: 'S1|2026-12-06#굳히기1', 종류: '굳히기', 목표: 'G713', 문항: { 문장: 'a ___', 보기: ['1', '2', '3', '4'], 정답: 0 } }];
const 성한묶음 = (배정ID, 학생ID) => ({ 배정ID, 학생ID, 자율일, 차시: 1, 주유형: ['문형없음'], 목표: ['요목:말투두벌'], 항목: 항목하나 });

/* ── ① 판정 ── */

test('봉투가 깨지면 전량 거절이다 — 한 학생의 문제가 아니라서 행별로 안 내린다', () => {
  assert.deepEqual(규칙.봉투검증({ 자율일, 차시판: 'c1w-2026-09-07', 묶음: [] }).오류, []);
  assert.deepEqual(규칙.봉투검증({ 자율일: '2026/12/06', 차시판: 'v1', 묶음: [] }).오류, ['자율일이 yyyy-MM-dd 가 아니다']);
  assert.match(규칙.봉투검증({ 자율일, 차시판: '', 묶음: [] }).오류[0], /차시판이 없다/);
  assert.deepEqual(규칙.봉투검증({ 자율일, 차시판: 'v1' }).오류, ['묶음이 배열이 아니다']);
  const 넘침 = 규칙.봉투검증({ 자율일, 차시판: 'v1', 묶음: new Array(규칙.최대묶음 + 1).fill({}) });
  assert.match(넘침.오류[0], /상한/, '상한을 넘으면 잘라 넣지 않고 통째로 거절한다');
});

test('묶음 하나가 깨지면 그 묶음만 떨어진다 — 성한 학생은 흘러간다(F103 · 무인 배치에서 전량 거절 금지)', () => {
  const 판 = [
    성한묶음('S1|2026-12-06', 'SYNK-001'),
    { 학생ID: 'SYNK-002', 차시: 1, 항목: 항목하나 },                                   // 배정ID 없음
    { 배정ID: 'S3|2026-12-06', 차시: 1, 항목: 항목하나 },                              // 학생ID 없음
    { 배정ID: 'S4|2026-12-06', 학생ID: 'SYNK-004', 차시: 0, 항목: 항목하나 },          // 차시 밖
    { 배정ID: 'S5|2026-12-06', 학생ID: 'SYNK-005', 차시: 1, 항목: [] },                // 항목 0
    { 배정ID: 'S6|2026-12-06', 학생ID: 'SYNK-006', 차시: 1, 항목: 항목하나, 자율일: '2026-12-13' }, // 남의 날
    성한묶음('S7|2026-12-06', 'SYNK-007'),
  ];
  const { 정상, 문제들 } = 규칙.행별가르기(판, 자율일);
  assert.deepEqual(정상.map((r) => r.배정ID), ['S1|2026-12-06', 'S7|2026-12-06']);
  assert.deepEqual(문제들.map((x) => x.사유), [
    '배정ID 없음', '학생ID 없음', '차시가 정수 1~99 가 아니다', '항목 0',
    '묶음의 자율일(2026-12-13)이 봉투와 다르다',
  ], '사유가 «무엇이 없나»로 안 적히면 알림을 읽고도 무엇을 고칠지 모른다');
});

test('같은 판에 배정ID 가 둘이면 뒤엣것을 버린다 — 어느 쪽이 이겼는지 모르는 채로 두지 않는다', () => {
  const { 정상, 문제들 } = 규칙.행별가르기([성한묶음('같음', 'SYNK-001'), 성한묶음('같음', 'SYNK-002')], 자율일);
  assert.equal(정상.length, 1);
  assert.equal(정상[0].원본.학생ID, 'SYNK-001', '먼저 온 것이 남는다');
  assert.deepEqual(문제들, [{ 배정ID: '같음', 사유: '같은 판에 배정ID 중복' }]);
});

test('학생번호 표기형은 여기서 안 만진다 — 그 규칙은 lib/학생계정.js 하나가 진다(같은 학생이 두 사람이 되는 자리)', () => {
  const { 정상 } = 규칙.행별가르기([성한묶음('S1|2026-12-06', 'synk001')], 자율일);
  assert.equal(정상[0].학생번호, 'synk001', '재료 규칙이 번호를 손대면 표기 규칙이 두 벌이 된다');
});

/* ── ② 🔴 발행 뒤 불변 ── */

test('🔴 이미 있는 재료는 안 갈아 끼운다 — 채우는 갈래는 «항목 0 이었고 아직 안 낸» 하나뿐', () => {
  const 새것 = { 항목: 항목하나 };
  assert.equal(규칙.채워도되나({ bundle: { 항목: [] }, delivered_event_id: null }, 새것), true,
    '공급 실패가 늦게 나은 날은 받는다(배포 검수 P3 21f680c14c40)');
  assert.equal(규칙.채워도되나({ bundle: { 항목: 항목하나 }, delivered_event_id: null }, 새것), false,
    '항목이 이미 있는 재료를 덮으면 학생이 어제 본 것과 갈린다');
  assert.equal(규칙.채워도되나({ bundle: { 항목: [] }, delivered_event_id: 'e1' }, 새것), false,
    '🔴 이미 낸 재료는 항목이 0 이었어도 안 바꾼다 — 학생이 본 것을 뒤에서 못 바꾼다');
  assert.equal(규칙.채워도되나({ bundle: { 항목: [] }, delivered_event_id: null }, { 항목: [] }), false,
    '새것도 비었으면 바꿀 것이 없다');
  assert.equal(규칙.채워도되나(null, 새것), false, '없던 것은 이 판정의 대상이 아니다(삽입이 진다)');
});

/* ── ③ 함수 소스 불변식 ── */

test('🔴 시크릿 미설정은 503 이다 — 없는 자물쇠를 「통과」로 읽으면 문이 통째로 열린다', () => {
  assert.match(주석뺀소스, /SUNDAY_BUNDLE_SECRET/, '이 문의 자물쇠 이름이 소스에 없다');
  assert.match(주석뺀소스, /503[\s\S]{0,80}ingest_secret_unset|ingest_secret_unset[\s\S]{0,80}503/,
    '시크릿 미설정이 503 이 아니다(401·200 이면 설정을 빠뜨린 날 증상이 아무 데도 안 남는다)');
  assert.match(주석뺀소스, /같은비밀\(/, '시크릿 비교가 길이를 먼저 흘리지 않는 꼴이어야 한다');
});

test('🔴 이 문은 «큐»를 안 건드린다 — 배정 사건 조립은 functions/deliver 하나가 진다', () => {
  assert.doesNotMatch(주석뺀소스, /task\.assigned/, '받는 문이 배정 사건을 직접 쓰면 조립이 두 곳에 산다');
  assert.doesNotMatch(주석뺀소스, /engine\.learning_events|engine\.submissions/,
    '큐 표에 직접 쓰면 동의판·급수 스냅샷 조립이 갈라진다(이 저장소가 가장 크게 데인 유형)');
  assert.match(주석뺀소스, /engine\.sunday_bundles/, '재료 표에 놓는 자리가 없다');
});

test('🔴 받은 묶음을 벗기지 않고 그대로 싣는다 — 정답 원본이 여기 말고는 없다(설계 §⑥)', () => {
  assert.match(주석뺀소스, /sql\.json\(r\.원본/, '원본을 통째로 안 실으면 서버가 베껴 채운 판이 남는다');
  assert.doesNotMatch(주석뺀소스, /delete\s+[a-zA-Z가-힣.]*정답|정답:\s*undefined/, '정답을 벗기면 채점 원본이 사라진다');
});

test('판정을 문 안에 다시 적지 않는다 — 규칙은 lib 한 벌이다(소스 글자를 지키는 자가 결함도 지킨다)', () => {
  assert.match(주석뺀소스, /from '\.\/자율일재료\.mjs'/, '규칙 lib 을 동봉으로 안 쓴다');
  assert.doesNotMatch(주석뺀소스, /function\s+묶음검증|function\s+행별가르기/, '문 안에 판정 사본이 산다');
});

/* ── ④ 동봉 완결성 ── */

test('동봉표가 import 를 다 덮는다 — 배포 시점이 아니라 여기서 잡는다', () => {
  const 동봉 = JSON.parse(fs.readFileSync(path.join(FN디렉터리, '동봉.json'), 'utf8'));
  const 지역import = [...소스.matchAll(/from '\.\/([^']+)'/gu)].map((m) => m[1]);
  지역import.forEach((이름) => {
    assert.ok(동봉[이름], `동봉표에 ${이름} 이 없다 — 배포하면 함수가 그 파일 없이 뜬다`);
    assert.ok(fs.existsSync(path.join(ROOT, 동봉[이름])), `동봉 원본이 없다: ${동봉[이름]}`);
  });
  assert.ok(동봉['수집_교정_계약.json'], 'schema_ver 정본(계약 JSON)이 안 실렸다 — 판이 DB 이름으로 대신 세어지면 문마다 도장이 갈린다');
});

/* ── ⑤ 내는 쪽 — 재료 → 배정 조립 ── */

const 재료행 = (덮기 = {}) => ({
  assignment_id: 'S1|2026-12-06', autonomy_date: 자율일, week_no: 1, week_ver: 'c1w-2026-09-07',
  delivered_event_id: null,
  bundle: { 배정ID: 'S1|2026-12-06', 학생ID: 'SYNK-001', 자율일, 차시: 1, 주유형: ['문형없음'], 목표: ['요목:말투두벌'], 항목: 항목하나 },
  ...덮기,
});

test('낼 수 없으면 null 이다 — 자율일이 못 서는 날 학생이 빈손이 되지 않는다(다음 갈래가 받는다)', () => {
  assert.equal(규칙.자율일배정(null), null, '재료가 없는 날(평일)');
  assert.equal(규칙.자율일배정(재료행({ delivered_event_id: 'e1' })), null, '이미 낸 재료 — 하루 1건');
  assert.equal(규칙.자율일배정(재료행({ bundle: { 배정ID: 'x', 항목: [] } })), null, '항목 0 — 공급 실패는 appsscript 가 이미 적었다');
  assert.equal(규칙.자율일배정({ ...재료행({ bundle: { 항목: 항목하나 } }), assignment_id: '' }), null,
    '배정ID 가 어디에도 없으면 제출이 무엇을 가리킬지 모른다 — 그런 배정은 안 낸다');
  assert.ok(규칙.자율일배정(재료행()), '성한 재료는 서야 한다');
});

test('묶음 안에 배정ID 가 없으면 표의 기본키로 선다 — 둘은 받는 문이 같은 값으로 넣은 한 자다', () => {
  const 낼것 = 규칙.자율일배정(재료행({ bundle: { 항목: 항목하나 } }));
  assert.equal(낼것.task_ref, 'S1|2026-12-06');
  assert.equal(낼것.task_snapshot.배정ID, 'S1|2026-12-06');
});

test('배정 한 건이 가리키는 것은 «묶음»이다 — 항목ID 는 제출이 가리킨다(설계 §⑥)', () => {
  const 낼것 = 규칙.자율일배정(재료행());
  assert.equal(낼것.task_ref, 'S1|2026-12-06');
  assert.equal(낼것.task_type, '숙제제출', '계약 task_type 아홉 중 하나여야 한다(CHECK 가 강제한다)');
  assert.equal(낼것.task_schema_ver, '자율일.v1');
  assert.equal(낼것.degraded, false, '자율일은 강등이 아니다 — 못 내면 아예 null 이다');
  assert.equal(낼것.task_snapshot.차시, 1);
  assert.equal(낼것.task_snapshot.차시판, 'c1w-2026-09-07', '표가 바뀌어도 옛 묶음은 옛 판을 쥔다');
  assert.equal(낼것.task_snapshot.항목.length, 1);
});

test('🔴 학생에게 나가는 판에서 정답과 원오답이 벗겨진다 — 새면 되돌릴 수 없다', () => {
  const 스냅 = 규칙.자율일배정(재료행({
    bundle: {
      배정ID: 'S1|2026-12-06', 항목: [
        { 항목ID: 'a#굳히기1', 종류: '굳히기', 목표: 'G713', 문항: { 문장: 'a ___', 보기: ['1', '2'], 정답: 0, 판: 'ai:x' } },
        { 항목ID: 'a#오답1', 종류: '오답', 목표: 'G705', 문항: { 문장: 'b ___', 보기: ['1'], 정답: 1 }, 원오답: { 퀴즈ID: 'Q9', 제출일ms: 1 } },
        { 항목ID: 'a#낭독1', 종류: '낭독', 목표: 'G713', 문장: '읽을 문장' },
        { 항목ID: 'a#진단1', 종류: '진단', 역할: '중간' },
      ],
    },
  })).task_snapshot;
  const 학생판 = 규칙.학생판자율일스냅샷(스냅);
  const 글 = JSON.stringify(학생판);
  assert.doesNotMatch(글, /정답/, '🔴 정답이 나갔다 — 채점은 appsscript quiz_log 가 한다(앱은 고른 답만 되돌린다)');
  assert.doesNotMatch(글, /원오답|퀴즈ID/, '🔴 «언제 무엇을 틀렸나»의 고리가 나갔다');
  assert.equal(학생판.항목.length, 4, '항목 수는 그대로여야 화면이 빈칸 없이 선다');
  assert.deepEqual(학생판.항목[0].문항, { 문장: 'a ___', 보기: ['1', '2'] }, '문항 속도 허용 목록으로 거른다 — 허용 키 «안»이 사각이다');
  assert.equal(학생판.항목[2].문장, '읽을 문장', '낭독 문장은 나가야 한다');
  assert.equal(학생판.항목[3].역할, '중간', '진단 역할은 나가야 화면이 어느 회차인지 안다');
  assert.equal(스냅.항목[0].문항.정답, 0, '원본은 안 건드린다 — 채점 원본이 배정 행에 남아야 한다');
});

test('거름망은 «판 이름»으로 갈린다 — 뒤에 생길 다른 판이 조용히 이 망을 타면 무엇이 새는지 아무도 안 본다', () => {
  assert.equal(규칙.자율일스냅샷인가({ ver: '자율일.v1', 항목: [] }), true);
  assert.equal(규칙.자율일스냅샷인가({ ver: '다른판.v1', 항목: [] }), false);
  assert.equal(규칙.자율일스냅샷인가({ 항목: [] }), false, '「항목이 있나」로 가르면 안 된다');
  const 남의판 = { ver: '다른판.v1', 항목: [{ 정답: 1 }] };
  assert.deepEqual(규칙.학생판자율일스냅샷(남의판), 남의판, '제 판이 아니면 안 건드린다(호출자의 다른 망이 받는다)');
});

test('오늘과제의 거름망이 자율일 판을 태운다 — 안 태우면 말하기 목록에 걸려 통째로 벗겨진다', () => {
  const { 학생판스냅샷 } = require('../lib/오늘과제.js');
  const 스냅 = 규칙.자율일배정(재료행()).task_snapshot;
  const 판 = 학생판스냅샷(스냅);
  assert.ok(Array.isArray(판.항목) && 판.항목.length === 1, '자율일 판이 말하기 거름망에 걸려 빈 판이 됐다');
  assert.equal(판.ver, '자율일.v1');
});

/* ── ⑥ 배달 배선 ── */

test('🔴 일요일 자율일이 게임보다 «먼저»다 · 두 통로가 같은 앞선 갈래를 지난다', () => {
  const 배달 = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'deliver', 'index.ts'), 'utf8');
  const 배달코드 = 코드만(배달);
  const 먼저 = 배달코드.indexOf('async function 먼저갈래');
  assert.ok(먼저 > -1, '앞선 갈래를 한 자리로 묶지 않았다 — 순서가 두 곳에 적히면 통로마다 다른 것을 받는다');
  const 본문 = 배달코드.slice(먼저, 배달코드.indexOf('async function', 먼저 + 10) + 1);
  const 자 = 본문.indexOf('자율일갈래'), 게 = 본문.indexOf('게임갈래');
  assert.ok(자 > -1 && 게 > -1 && 자 < 게, '자율일이 게임보다 먼저 서지 않는다');
  assert.match(배달코드, /생성배달\([^)]*먼저갈래/, '생성 경로가 앞선 갈래를 안 받으면 활성 학급의 일요일만 조용히 샌다');
  assert.match(배달코드, /구제배달\([^)]*먼저갈래/, '구제 경로도 같은 갈래를 지나야 한다');
  const 생성 = 코드만(fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'deliver', '생성모드.ts'), 'utf8'));
  assert.doesNotMatch(생성, /게임갈래/, '생성 모드가 옛 이름을 들고 있으면 실물과 어긋난 채로 산다');
});

test('🔴 낸 뒤 재료에 사건 id 를 적는다 — 그 칸이 「이미 냈다」의 유일한 표시다', () => {
  const 배달 = 코드만(fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'deliver', 'index.ts'), 'utf8'));
  const i = 배달.indexOf('async function 자율일갈래');
  assert.ok(i > -1, '자율일 갈래가 없다');
  const 본문 = 배달.slice(i, 배달.indexOf('async function', i + 10) + 1);
  assert.match(본문, /update engine\.sunday_bundles[\s\S]{0,200}delivered_event_id/, '재료에 낸 표시를 안 남긴다');
  assert.match(본문, /멱등키\('task', learner_id, 오늘\)/, '배정 멱등키가 말하기·게임과 같은 자리가 아니다 — 「그날 1건」이 깨진다');
  assert.match(본문, /자율일배정\(/, '조립을 lib 에서 안 가져온다 — 받은 판과 낸 판이 갈린다');
  assert.doesNotMatch(본문, /insert into engine\.sunday_bundles/, '내는 자리가 재료를 새로 만들면 받는 문과 두 벌이 된다');
});

test('표를 세운 마이그레이션이 확인 블록의 기대열에 칸을 다 올렸다', () => {
  const 조각 = path.join(ROOT, 'supabase', 'migrations', '20260907200000_sunday_bundles_c16.sql');
  const sql = fs.readFileSync(조각, 'utf8');
  ['assignment_id', 'learner_id', 'autonomy_date', 'week_no', 'week_ver', 'bundle', 'received_at', 'delivered_event_id', 'schema_ver']
    .forEach((c) => assert.ok(sql.includes(`('sunday_bundles','${c}')`), `확인 블록 기대열에 ${c} 가 없다`));
  assert.match(sql, /create unique index[\s\S]{0,120}sunday_bundles \(learner_id, autonomy_date\)/,
    '하루 한 벌 제약이 없다 — 배정 사건은 하루 1건인데 재료가 여럿이면 둘이 어긋난다');
});
