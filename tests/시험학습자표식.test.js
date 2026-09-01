'use strict';
/* 시험 학습자 표식 회귀 — 2026-09-02 (유호 지시 「마감없는배정 259도 표식 정해서 정리해줘」)
 *
 * ■ 무엇을 지키나: **감시 자가 시험 데이터를 실학생으로 세지 않는다.**
 *   리허설 확인 쿼리의 `마감없는배정` 이 259 였는데(운영 0) 전부 왕복시험이 심은 학생들의
 *   과제였다. 표식이 없어 자가 그것을 실학생 결함으로 셌다.
 *   ⇒ `engine.learners.is_test` 를 세우고 **도구가 만들 때 명시로 박는다.**
 *
 * ■ 🔑 왜 「이름 규약」을 자로 안 쓰나 — 사람이 이름을 바꾸는 날 조용히 샌다.
 *   이름 꼴은 마이그레이션의 «소급 보정 한 번»에만 쓰이고, 앞으로의 정본은 이 칸이다.
 *
 * ■ 🚫 `명부등록.js` 는 여기서 안 잰다 — 상담에서 받은 «실학생»을 올리는 도구다(is_test=false 가 맞다).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { 코드만, 파일소스 } = require('./lib/소스검사.js');

const ROOT = path.join(__dirname, '..');

/** 학습자를 만드는 «시험» 도구 전량. 새 왕복시험이 생기면 여기 더한다. */
const 시험도구 = [
  '관찰왕복시험', '관통왕복시험', '교정왕복시험', '라디오승격왕복시험',
  '반피드백왕복시험', '배달왕복시험', '생성왕복시험',
];

test('🔴 시험 도구가 학습자를 만들 때 is_test 를 «명시로» 박는다', () => {
  for (const n of 시험도구) {
    const src = 코드만(파일소스(path.join(ROOT, 'tools', `${n}.js`)));
    const 자리 = [...src.matchAll(/insert into engine\.learners \(([^)]*)\)/g)];
    assert.ok(자리.length > 0, `${n} 이 학습자를 안 만든다 — 목록이 낡았다(분모 확인)`);
    for (const m of 자리) {
      assert.ok(m[1].includes('is_test'),
        `${n} 의 insert 열 목록에 is_test 가 없다 — 그 학생이 만든 사건이 실학생 결함으로 세어진다`);
    }
  }
});

test('🚫 명부등록은 «실학생» 통로다 — 여기에 is_test 를 박으면 실학생이 감시 밖으로 빠진다', () => {
  const src = 코드만(파일소스(path.join(ROOT, 'tools', '명부등록.js')));
  const m = /insert into engine\.learners \(([^)]*)\)/.exec(src);
  assert.ok(m, '명부등록이 학습자를 안 만든다 — 이 시험의 전제가 틀렸다');
  assert.ok(!m[1].includes('is_test'),
    '실학생 통로가 시험 표식을 박고 있다 — 새는 방향이 «조용한 쪽»이라 제일 나쁘다');
});

test('🔑 자가 표식으로 좁혀졌다 — 「마감없는배정」이 시험 학습자를 뺀다', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', '확인_적용후상태.sql'), 'utf8')
    .replace(/\r\n/g, '\n');
  const i = sql.indexOf('마감없는배정');
  assert.ok(i > 0, '확인 쿼리에서 마감없는배정을 못 찾았다');
  const 앞 = sql.slice(Math.max(0, i - 700), i);
  assert.match(앞, /left join engine\.learners l/,
    '시험 학습자를 뺄 join 이 없다');
  assert.match(앞, /not coalesce\(l\.is_test, false\)/,
    'is_test 로 안 좁혔다');
  /* 🔴 inner join 이면 learner_id 없는 사건을 조용히 떨어뜨려 이 자가 «덜 세는» 쪽으로 샌다. */
  assert.ok(!/\n\s+join engine\.learners l on/.test(앞),
    'inner join 으로 좁혔다 — learner_id 없는 사건이 분모에서 사라진다');
});

test('열이 기대 목록에 등재됐다 — 없으면 「빠진열」이 이 칸을 원리상 못 본다', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', '확인_적용후상태.sql'), 'utf8');
  assert.match(sql, /\('learners','is_test'\)/, '기대열에 learners.is_test 가 없다');
});

test('🔴 기본값은 false 다 — 반대로 두면 실학생이 감시 밖으로 빠진다', () => {
  const mig = fs.readFileSync(
    path.join(ROOT, 'supabase', 'migrations', '20260902300000_test_learner_flag_c16.sql'), 'utf8');
  assert.match(mig, /is_test boolean not null default false/,
    '기본값이 false 가 아니다 — 모르는 학생은 «실학생»으로 봐야 한다');
  /* 소급 보정은 멱등이어야 한다 — 두 번 돌아도 같은 결과. */
  assert.match(mig, /where is_test = false/, '소급 update 가 멱등하지 않다');
});
