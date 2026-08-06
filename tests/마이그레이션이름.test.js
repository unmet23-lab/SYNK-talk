/* 마이그레이션 **파일 이름**이 API 4개의 단일 장애점이다 — 그걸 여기서 막는다.
 *
 * ■ 무엇이 걸려 있나 (2026-08-07 실측)
 *   `functions/auth`·`events`·`uploads`·`deliver` 넷 다 계약판을 **DB 에게 묻는다**:
 *       select name from engine.schema_migrations order by version desc limit 1
 *       → 그 이름에서 `_(c\d+)\.sql$` 로 판을 뽑는다
 *   손 상수를 두지 않으려고 그렇게 짰고 그 판단 자체는 옳다. 그런데 **그 규칙이 파일 이름에만
 *   살아 있다** — 다음 마이그레이션을 `..._cron_deliver.sql` 처럼 판 없이 이름 지으면
 *   정규식이 빗나가고, 넷이 **동시에 500** 이 된다. 앱 전체가 죽는데 원인은 파일 이름이다.
 *
 * ■ 왜 함수 쪽이 아니라 여기서 막나
 *   함수는 「모르는 이름」에 500 을 주는 것이 옳다(모르면서 짐작하면 그게 더 큰 사고다).
 *   고칠 자리는 **이름을 짓는 순간**이고, 그건 커밋 시점 = CI 다.
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 실제로 쓰는 표기 — 실제 디렉터리를 읽는다(픽스처 이름만 검사하지 않는다).
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 **픽스처 문자열**로 걸고,
 *      실저장소에는 「지금 전부 규칙 안인가」만 건다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const 디렉터리 = path.resolve(__dirname, '..', 'supabase', 'migrations');

/* 네 함수가 쓰는 것과 **같은** 정규식이다. 여기가 갈리면 검사가 통과인데 런타임이 죽는다 —
 * 바꿀 일이 생기면 `supabase/functions` 아래 넷을 함께 본다. */
const 판정 = /_(c\d+)\.sql$/;

test('마이그레이션 파일이 있다 — 0건이면 이 검사가 조용히 무력해진다', () => {
  const 목록 = fs.readdirSync(디렉터리).filter((f) => f.endsWith('.sql'));
  assert.ok(목록.length > 0, `${디렉터리} 에 .sql 이 없다`);
});

test('🔴 모든 마이그레이션 이름이 계약판을 물고 있다 — 안 그러면 API 4개가 동시에 500', () => {
  const 어긋난 = fs.readdirSync(디렉터리)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => !판정.test(f));
  assert.deepEqual(어긋난, [], `이름이 \`_c<숫자>.sql\` 로 끝나야 한다: ${어긋난.join(', ')}`);
});

/* 탐지력 — 실저장소가 지금 깨끗하다는 것만으로는 이 검사가 도는지 알 수 없다.
 * 「통과」와 「미실행」이 같은 모양이면 안 된다. */
test('탐지력 픽스처 — 판 없는 이름을 실제로 잡는다', () => {
  assert.equal(판정.test('20260807050000_cron_deliver.sql'), false, '이 이름이 통과하면 검사가 죽은 것이다');
  assert.equal(판정.test('20260807050000_engine_c9.sql'), true);
  assert.equal(판정.test('20260807050000_engine_c9.sql.bak'), false, '끝이 .sql 이어야 한다');
});

test('시간 순서와 판 순서가 어긋나지 않는다 — 최신 파일이 곧 최신 판이어야 한다', () => {
  /* 함수는 `order by version desc limit 1` 로 **하나만** 본다. 파일 이름이 시간순인데 판이
   * 거꾸로면(뒤 파일에 낮은 판) 함수가 낡은 판을 최신으로 읽고, 새 앱이 426 으로 거절된다. */
  const 판들 = fs.readdirSync(디렉터리)
    .filter((f) => 판정.test(f))
    .sort()
    .map((f) => Number(판정.exec(f)[1].slice(1)));
  for (let i = 1; i < 판들.length; i++) {
    assert.ok(판들[i] >= 판들[i - 1], `판이 뒤로 갔다: ${판들[i - 1]} → ${판들[i]}`);
  }
});
