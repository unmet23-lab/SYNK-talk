/* 감사 R1B20 회귀 — S2-2·S2-4·S2-5 의 배선 앵커 (생성종단 T1 무늬 · 배포대조 본체판정 규율)
 *
 * ■ 이 시험이 재는 것 = «배선»뿐이다 — 처방이 소스에 사는지를 바이트 앵커로 잰다.
 *   앵커가 사라지면 그 처방이 걷힌 것이니 여기가 먼저 빨개진다. 실행 의미(반납이 실제로 다음
 *   회차에 잡히는가)는 왕복시험·라이브 몫이다.
 * ■ S2-2 — 일과성 벤더 실패(재시도가능 429·5xx + 타임아웃)는 즉시 폴백이 아니라 jobs_release
 *   반납으로 다음 10분 회차에 넘긴다(마감 전 · job 당 시도 2회 상한). 🚫검문탈락 재시도 금지 그대로.
 * ■ S2-4 — 감시 ④(열린 시도)는 처분 도장(acked_at) 찍힌 시도를 뺀다 — 워커 사망 1건이 상시
 *   적색이 되면 신호로서 죽는다(F103).
 * ■ S2-5 — deliver-check 적색은 로그(수명 1일)만이 아니라 정본 실행 행(deliver_check_reds)에
 *   도장으로 착지하고, 그 도장 문은 raise 보다 앞에 있다(같은 트랜잭션 롤백에 안 쓸리게 commit 동반). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { 코드만 } = require('./lib/소스검사.js');

/* 활성 조각은 대기(supabase/활성조각_c12.sql) 또는 착지(migrations/*_gen_activate_c12.sql)
 * 한 곳에 산다 — tests/활성조각.test.js ① 의 그 규약(둘 다·둘 다 아님은 거기가 잡는다). */
const 대기경로 = path.join(ROOT, 'supabase', '활성조각_c12.sql');
const 착지들 = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations'))
  .filter((f) => /_gen_activate_c12\.sql$/.test(f));
const 조각경로 = fs.existsSync(대기경로)
  ? 대기경로 : path.join(ROOT, 'supabase', 'migrations', 착지들[0] ?? '');
const 조각 = fs.existsSync(조각경로) ? fs.readFileSync(조각경로, 'utf8') : '';

test('S2-2 — 일과성 반납 분기가 attempt_close 뒤·착지 앞에 서고 세 앵커를 한 분기에 품는다', () => {
  const 워커 = 코드만(fs.readFileSync(
    path.join(ROOT, 'supabase', 'functions', 'deliver-one', 'index.ts'), 'utf8'));
  const i닫기경합 = 워커.indexOf("'닫기경합'");
  const i반납 = 워커.indexOf("'일과성반납'");
  assert.ok(i닫기경합 !== -1, '닫기경합 앵커가 사라졌다 — attempt_close 경합 처리가 걷혔거나 이름이 바뀌었다');
  assert.ok(i반납 > i닫기경합, '일과성반납 분기가 attempt_close(닫기경합) 뒤에 없다 — 시도를 안 닫고 반납하면 열린 시도가 는다');
  const 분기 = 워커.slice(i닫기경합, i반납);
  for (const 앵커 of ['재시도가능(', 'engine.gen_deadline(', 'engine.jobs_release(']) {
    assert.ok(분기.includes(앵커),
      `일과성 반납 분기에 ${앵커} 앵커가 없다 — 일과성 판정·마감 게이트·반납 셋이 한 분기여야 한다(S2-2)`);
  }
  assert.ok(!분기.includes('검문탈락'),
    '반납 분기가 검문탈락을 문다 — 같은 프롬프트 재시도 금지(§4-2)가 깨질 자리');
  assert.ok(분기.includes('=== 1'),
    '반납 분기에 시도 수 상한(job 당 2회 = 기존 시도 1건일 때만 반납)이 없다');
});

test('S2-4 — 감시 ④ 가 처분 도장(acked_at) 찍힌 시도를 뺀다', () => {
  assert.ok(조각.length > 0, '활성 조각을 못 읽었다 — 경로 규약이 낡았다(0건은 통과가 아니다)');
  const 검 = 조각.split(`cron.schedule('deliver-check'`)[1].split('$job$);')[0];
  assert.ok(검.includes('a.acked_at is null'),
    '감시 ④ 에 acked_at is null 술어가 없다 — 워커 사망 1건이 상시 적색이 되어 신호가 죽는다(F103 · S2-4)');
  assert.ok(검.includes('g.lease_until < now() or g.lease_until is null or g.outcome is not null'),
    '④ 의 세 갈래 명시 열거가 사라졌다 — 술어를 더하며 기존 갈래를 걷었다면 사고다');
});

test('S2-5 — deliver-check 적색 착지 문이 raise 보다 앞에 있고 commit 으로 굳는다', () => {
  const 검 = 조각.split(`cron.schedule('deliver-check'`)[1].split('$job$);')[0];
  const i착지 = 검.indexOf('deliver_check_reds');
  const i커밋 = 검.indexOf('commit;');
  const i적색raise = 검.indexOf("raise exception 'deliver-check 적색");
  assert.ok(i착지 !== -1, '적색 착지 문(deliver_check_reds)이 deliver-check 본문에 없다(S2-5)');
  assert.ok(i적색raise !== -1, 'deliver-check 적색 raise 가 사라졌다 — 잡 실패 신호가 걷혔다');
  assert.ok(i착지 < i적색raise, '착지 문이 raise 뒤다 — 적색 날엔 영영 안 찍힌다');
  assert.ok(i커밋 > i착지 && i커밋 < i적색raise,
    '착지와 raise 사이에 commit 이 없다 — 같은 트랜잭션이면 raise 가 도장을 되돌려 적색일수록 안 남는다');
  assert.ok(검.includes('deliver_check_at'), '도장 시각(deliver_check_at)을 같이 안 찍는다 — 빈 배열과 「안 돌았다」가 다시 섞인다');
});

test('S2-4·S2-5 — 새 물리 칸 셋이 마이그 조각에 실재한다(조각이 걷히면 술어·착지가 헛발이다)', () => {
  const ack = fs.readFileSync(
    path.join(ROOT, 'supabase', 'migrations', '20260901000000_attempt_ack_c14.sql'), 'utf8');
  assert.ok(/add column if not exists acked_at timestamptz/.test(ack),
    'acked_at 열 추가가 마이그에 없다 — 감시 ④ 술어가 없는 칸을 읽게 된다');
  const reds = fs.readFileSync(
    path.join(ROOT, 'supabase', 'migrations', '20260901010000_check_reds_c14.sql'), 'utf8');
  assert.ok(/add column if not exists deliver_check_reds text\[\]/.test(reds)
    && /add column if not exists deliver_check_at timestamptz/.test(reds),
    '착지 칸 둘의 추가가 마이그에 없다');
  assert.ok(/'deliver_check_reds','deliver_check_at'\]/.test(reds),
    'freeze 화이트리스트에 착지 칸 둘이 없다 — 도장 update 가 freeze 트리거에 즉사한다');
});
