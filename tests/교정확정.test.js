'use strict';
/**
 * 교정 확정 CLI 회귀 — P0 §7-2
 *
 * 왜 있나 — 이 도구가 조용히 틀리는 자리는 셋이고, 셋 다 증상이 **없다**:
 *   ① `submissions` 에는 제출이 아닌 행(배치의 `task.assigned`)이 산다(P0 §6-1). 대기 목록이
 *      그걸 안 거르면 **오늘 나간 배정**이 「교정 대기 중인 학생 문장」으로 보이고, 강사가
 *      거기에 교정을 단다. 그 행은 append-only 라 지워지지 않는다.
 *   ② 오류태그 정본은 계약 파일이다(L0 §3-4 — 배열 CHECK 를 DB 에 안 걸기로 한 대가).
 *      도구가 목록을 자기 안에 베끼면 계약이 올라가는 날 조용히 갈라진다.
 *   ③ 교정문은 **사람이 자유롭게 쓰는 한국어**다. 작은따옴표 하나가 SQL 을 깨거나(운이 좋은 쪽)
 *      바꾼다(나쁜 쪽) — 이건 신뢰 경계다.
 *
 * 🔑 SQL 은 원격에서만 도는 문자열이라 여기서 실행할 수 없다. 그래서 **실행 결과가 아니라
 *   질의문의 급소**를 못박는다 — 실제로 서는지는 리허설 왕복이 따로 잰다.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  따옴표, uuid꼴, 태그검증, 인자파싱, 대기SQL, 대조SQL, 삽입SQL, 최신SQL,
} = require('../tools/교정확정.js');

const { 코드만 } = require('./lib/소스검사.js');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const SUB = '11111111-2222-4333-8444-555555555555';

test('🔴 대기 목록은 제출만 센다 — 배정 행(task.assigned)이 섞이면 강사가 배정에 교정을 단다', () => {
  const q = 대기SQL(null);
  assert.match(q, /e\.event_type\s*=\s*'submission\.created'/,
    'submissions 에는 배치가 쓴 task.assigned 행도 산다(P0 §6-1) — 안 거르면 대기 목록이 거짓이다');
  assert.match(q, /not exists\s*\(select 1 from engine\.corrections/,
    '이미 확정된 제출이 대기 목록에 남으면 같은 문장에 교정이 겹쳐 쌓인다');
});

test('대기 목록의 학생 필터는 값을 따옴표로 감싼다 — 없으면 필터 절 자체가 안 붙는다', () => {
  assert.match(대기SQL("SYNK-001'; drop table engine.learners; --"), /'SYNK-001''; drop table/);
  assert.ok(!/l\.student_code\s*=/.test(대기SQL(null)),
    '학생을 안 주면 필터 절 자체가 안 붙는다(목록에 학생 이름은 그대로 나온다)');
});

test('🔴 오류태그의 정본은 계약 파일이다 — 도구 안에 목록 사본이 없다', () => {
  /* 주석은 먼저 지운다 — 쓰는 법 예시의 «어미:시제» 는 사본이 아니다(그게 갈려도 아무 일도
   * 안 난다). 안 지우면 이 가드가 **거짓양성**으로 서고, 거짓양성 가드는 다음 사람이 끈다. */
  const 소스 = 코드만(fs.readFileSync(path.join(ROOT, 'tools', '교정확정.js'), 'utf8'));
  const 베낀것 = 계약.오류태그.filter((t) => 소스.includes(`'${t}'`) || 소스.includes(`"${t}"`));
  assert.deepEqual(베낀것, [],
    `태그가 도구에 박혔다: ${베낀것.join(', ')} — 계약이 올라가는 날 조용히 갈라진다`);
});

test('태그검증 — 계약에 있는 것만 통과하고, 하나라도 모르면 그 목록을 낸다', () => {
  const 있는것 = 계약.오류태그[0];
  assert.deepEqual(태그검증(`${있는것}, ${계약.오류태그[1]}`, 계약.오류태그).모름, []);
  assert.deepEqual(태그검증(`${있는것},어미:시재`, 계약.오류태그).모름, ['어미:시재'],
    '오타 태그 하나가 통과하면 그 행은 나중에 오타인지 원래 그런지 구분이 안 된다');
  assert.deepEqual(태그검증(' 어순 , , 어순 ', ['어순']).목록, ['어순', '어순'],
    '공백·빈 칸은 걷어내되 값 자체는 안 바꾼다');
  assert.deepEqual(태그검증('', 계약.오류태그).목록, [], '빈 입력은 빈 목록 — 호출부가 막는다');
});

test('🔴 교정문의 작은따옴표가 SQL 을 바꾸지 못한다 — 사람이 쓰는 한국어가 여기 들어온다', () => {
  const q = 삽입SQL({
    submission_id: SUB, 교정문: "친구가 '안녕' 했어요", 태그: ["조사:기타'; drop--"], 확정자: "유호'", 판: 'c8',
  });
  assert.match(q, /'친구가 ''안녕'' 했어요'/);
  assert.match(q, /'조사:기타''; drop--'/);
  assert.match(q, /'유호'''/);
  assert.ok(!/;\s*drop/i.test(q.replace(/'[^']*(?:''[^']*)*'/g, "''")),
    '리터럴 밖으로 새는 문장이 없다');
});

test('삽입은 사람 확정으로 고정되고 판은 계약에서 받는다', () => {
  const q = 삽입SQL({ submission_id: SUB, 교정문: '가', 태그: ['어순'], 확정자: '유호', 판: 계약.버전 });
  assert.match(q, /'teacher'/, "actor_kind='teacher' 가 이 도구의 정의다(AI 초안은 여기서 안 난다)");
  assert.match(q, new RegExp(`'${계약.버전}'`), 'schema_ver 는 손으로 안 적는다');
  assert.match(q, /array\['어순'\]::text\[\]/);
  assert.match(q, /returning correction_id/, '만든 id 를 못 돌려주면 사람이 확인할 게 없다');
  assert.ok(!/reviewed_correction_id/.test(q),
    'S1 엔 AI 초안이 0 이라 가리킬 대상이 없다 — verdict 짝 없이 한쪽만 넣지 않는다');
});

test('넣기 직전 대조는 「누구 것인가」를 함께 읽는다 — 오타 한 글자는 오답이 아니라 오귀속이다', () => {
  const q = 대조SQL(SUB);
  assert.match(q, /l\.student_code/);
  assert.match(q, /e\.event_type/, '제출이 아닌 행을 골랐는지 호출부가 판정할 수 있어야 한다');
  assert.match(q, /기존교정/, '이미 달린 교정 수를 안 보면 겹쳐 넣고도 모른다');
  assert.match(q, new RegExp(`'${SUB}'::uuid`));
});

test('「다음에 볼 것」은 같은 학생의 최신 1건으로 판정한다', () => {
  const q = 최신SQL(SUB, '99999999-8888-4777-8666-555555555555');
  assert.match(q, /order by c\.created_at desc limit 1/);
  assert.match(q, /e\.learner_id\s*=\s*\(select e2\.learner_id/,
    '제출이 아니라 **학생** 단위로 최신을 본다 — 화면은 학생에게 하나를 보여준다');
});

test('uuid 꼴 — 애매하면 거절한다(오타가 Postgres 22P02 로 내려가면 원인이 안 보인다)', () => {
  assert.ok(uuid꼴(SUB));
  assert.ok(!uuid꼴('11111111-2222-4333-8444-55555555555'), '한 자 짧다');
  assert.ok(!uuid꼴(''));
  assert.ok(!uuid꼴(null));
});

test('🔴 인자 파싱 — 깃발 값이 submission_id 로 잡히지 않는다', () => {
  const o = 인자파싱([SUB, '--교정문', '어제 친구를 만났어요', '--태그', '어미:시제', '--확정자', '유호', '--적용']);
  assert.equal(o.submission_id, SUB);
  assert.equal(o.교정문, '어제 친구를 만났어요');
  assert.equal(o.확정자, '유호');
  assert.equal(o.적용, true);

  const 앞뒤바뀜 = 인자파싱(['--교정문', '밥을 먹었어요', SUB, '--확정자', '유호']);
  assert.equal(앞뒤바뀜.submission_id, SUB,
    '깃발이 먼저 와도 자유 인자는 하나뿐이다 — 교정문이 대상 id 로 잡히면 엉뚱한 제출을 연다');
  assert.equal(앞뒤바뀜.적용, false, '기본은 미리보기다');
});

test('깃발 뒤에 값이 없으면 다음 깃발을 값으로 삼지 않는다', () => {
  const o = 인자파싱(['--교정문', '--적용']);
  assert.equal(o.교정문, null, "'--적용' 이 교정문이 되면 그 문장이 학생에게 간다");
  assert.equal(o.적용, true);
});

test('🔴 거절은 종료코드 1 로 나간다 — process.exit() 는 fetch 중에 127(abort)을 낸다', () => {
  /* 2026-08-07 실측: 거절 경로가 `종료코드=127` 로 나갔다. 셸에서 127 은 「그런 명령이 없다」라
   * 정상적인 거절이 **설치 사고**로 읽힌다. 원인은 소켓이 닫히는 중의 process.exit 이다. */
  const 소스 = 코드만(fs.readFileSync(path.join(ROOT, 'tools', '교정확정.js'), 'utf8'));
  assert.ok(!/process\.exit\s*\(/.test(소스), 'process.exit() 대신 process.exitCode 를 세운다');
  assert.match(소스, /process\.exitCode\s*=\s*1/);
});

test('따옴표 — null·숫자도 리터럴로 만든다(호출부가 실수해도 SQL 이 안 깨진다)', () => {
  assert.equal(따옴표(null), "'null'");
  assert.equal(따옴표(12), "'12'");
});
