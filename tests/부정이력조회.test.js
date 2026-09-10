'use strict';
/* 실제 대상질의 함수를 호출해 만들어진 SQL과 매개변수를 검사한다. DB 실행 시험은 아니며,
 * 활동 창과 부정 이력의 분리·스냅 기준 바인딩을 지키는 로컬 회귀다. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const 소스 = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/deliver/index.ts'), 'utf8');
const 시작 = 소스.indexOf('function 대상질의(');
const 끝 = 소스.indexOf('\nasync function 배달하기(', 시작);
assert.ok(시작 >= 0 && 끝 > 시작, '대상질의 실제 함수를 찾지 못했다');
const 함수 = 소스.slice(시작, 끝).replace(
  /^function 대상질의[\s\S]*?\{\n(?=  \/\* 단건이면)/,
  'function 대상질의(스냅기준, 한사람, 쪽 = null) {\n').replace(/ as string\[\]/g, '');

function 질의(기준, 학생 = null, 쪽 = null) {
  const 값들 = [];
  function sql(부분, ...값) {
    return { sql: 부분.reduce((s, t, i) => {
      if (!i) return t;
      const v = 값[i - 1];
      const 자리 = v && typeof v.sql === 'string' ? v.sql : `__인자${값들.push(v) - 1}__`;
      return s + 자리 + t;
    }, '') };
  }
  const 실행 = new Function('sql', '시간대', '걷는사건', '라디오태스크종', '창일수', '종별상한', '시드전부', 'G2재제출앵커들',
    '통로', '재제출의사', '게임챌린지', 'G2챌린지', `${함수}\nreturn 대상질의;`)(
    sql, 'Asia/Ulaanbaatar', ['estimate.responded'], [], 30, 150, [], [], '발화녹음', [], '합성', '합성G2');
  const query = 실행(기준, 학생, 쪽).sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const 부정 = query.match(/left join lateral \(\s*select coalesce\(jsonb_agg\(jsonb_build_object\([\s\S]*?\) 부정응답 on true/);
  assert.ok(부정, '별도 부정 이력 질의가 사라졌다');
  return { query, 부정: 부정[0], 값들 };
}

test('부정 이력은 전원·단건·쪽 조회 모두 활동 창·종별 150건과 독립한다', () => {
  for (const [학생, 쪽] of [[null, null], ['합성학생', null], [null, { 뒤: null, 한도: 16 }]]) {
    const { query, 부정 } = 질의('2026-10-01T00:00:00Z', 학생, 쪽);
    assert.match(query, /부정응답\.행들 as 부정이력/);
    assert.match(부정, /select distinct e\.payload->>'trait_axis' as 축, e\.payload->>'shown_key' as 키/);
    assert.match(부정, /e\.learner_id = l\.learner_id/);
    assert.match(부정, /e\.event_type = 'estimate\.responded'/);
    assert.match(부정, /e\.payload->>'response' = '아니다'/);
    assert.doesNotMatch(부정, /\blimit\b|\brow_number\b|몇째|make_interval|interval\s*'/i);
    assert.doesNotMatch(부정, /e\.(?:occurred_at|ingested_at)\s*>/);
    assert.match(query, /make_interval\(days =>/); // 활동 창은 그대로 있다.
    assert.match(query, /몇째 <=/);              // 활동 종별 상한도 그대로 있다.
  }
});

test('과거 재생은 발생·적재 두 시각을 같은 스냅 기준으로 잘라 미래 부정을 읽지 않는다', () => {
  for (const 기준 of ['2026-08-31T00:00:00Z', '2026-10-01T00:00:00Z']) {
    const { 부정, 값들 } = 질의(기준);
    for (const 열 of ['occurred_at', 'ingested_at']) {
      const 조건 = 부정.match(new RegExp(`e\\.${열} <= __인자(\\d+)__::timestamptz`));
      assert.ok(조건, `${열} 미래 경계가 빠졌거나 비교 방향이 바뀌었다`);
      assert.equal(값들[Number(조건[1])], 기준, `${열} 경계가 호출자의 과거 스냅 기준이 아니다`);
    }
    assert.doesNotMatch(부정, /now\(\)|current_timestamp/i);
  }
});

test('부정 질의는 빈 배열을 명시하고 원문 대신 부정 쌍의 최소 봉투만 싣는다', () => {
  const { 부정 } = 질의('2026-10-01T00:00:00Z');
  assert.match(부정, /'\[\]'::jsonb\) as 행들/);
  assert.match(부정, /'event_type', 'estimate\.responded'/);
  assert.match(부정, /'payload', jsonb_build_object\('response', '아니다', 'trait_axis', b\.축, 'shown_key', b\.키\)/);
  assert.doesNotMatch(부정, /shown_text|jsonb_agg\(e\)|to_jsonb\(e\)/);
});
