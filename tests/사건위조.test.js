'use strict';
/**
 * 학생 토큰이 **서버·교사 사건을 주장**할 수 있는가 (C0 심문 B1 · 3벌 공통 지적).
 *
 * ■ 심문의 지적은 절반이 오독이었다 — 실측으로 갈랐다
 *   「역할별 `event_type` 허용표가 0」이라 했지만 표는 `lib/이벤트검증.js` 에 **있었고**
 *   단위 회귀도 있었다(`tests/이벤트검증.test.js`). 심문 대상이 문서(`docs/C0_API계약.md`)라
 *   문서에 표가 없는 것을 「표가 없다」로 읽은 것이다.
 *
 * ■ 그러나 절반은 참이었다 — **두 자리가 열려 있었다**
 *   ① 표가 있어도 **그 표를 이 통로가 부른다는 보장이 0**이었다. `functions/events` 는
 *      `검증(사건, 계약)` 을 주체 인자 **없이** 부르고, 막는 힘은 전적으로 그 기본값(`'app'`)에
 *      기댄다. 누가 `{주체:'server'}` 를 넘기도록 고치면 위조 방어가 통째로 조용히 열린다.
 *      가드는 로직보다 **등록층에서 새고, 새는 방향은 언제나 통과**다(CLAUDE.md).
 *   ② 판정이 **차단 목록**이었다. 계약 값목록에 새 `event_type` 을 늘리는 날 앱이 그것을
 *      자동으로 낼 수 있게 된다 — 늘린 사람이 차단 목록을 같이 고칠 이유가 어디에도 없다.
 *      그래서 `앱사건`(허용 목록)으로 뒤집었고, 이 파일이 **분류 누락**을 잡는다.
 *
 * ⚠ 이 파일은 「막히나」가 아니라 **「막는 것이 실제로 불리나」**를 잰다 — 앞의 것은
 *   `tests/이벤트검증.test.js` 몫이고, 둘을 한 파일에 두면 통로가 빠져도 초록이 된다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { 검증, 앱사건, 서버사건 } = require('../lib/이벤트검증.js');

const ROOT = path.join(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약/수집_교정_계약.json'), 'utf8'));
const 값목록 = 계약.learning_events.값목록.event_type;

/* ─── ① 통로가 그 표를 부르는가 ────────────────────────────────────────────── */

test('🔴 `functions/events` 는 검증을 **앱 주체로** 부른다 — 여기가 열리면 위조 방어가 통째로 죽는다', () => {
  const 서버 = fs.readFileSync(path.join(ROOT, 'supabase/functions/events/index.ts'), 'utf8');
  const m = /const\s+r\s*=\s*검증\(([^)]*)\)/.exec(서버);
  assert.ok(m, '검증을 부르는 자리를 못 찾았다 — 앵커가 낡았으면 이 검사는 무엇이든 통과시킨다');

  const 인자 = m[1];
  // 주체를 안 넘기면 기본이 'app' 이다. 넘기더라도 'app' 이면 된다 — 금지되는 건 'server' 다.
  assert.ok(!/주체/.test(인자) || /주체\s*:\s*'app'/.test(인자),
    `학생 통로가 검증에 주체를 실어 보낸다: 검증(${인자})\n` +
    "  이 통로로 들어오는 건 전부 학생 기기다 — 'server' 를 넘기면 앱이 배정·시험결과·개입배달을 주장할 수 있다");
});

test('학생 통로는 actor_kind 를 **토큰이 아니라 상수**로 박는다 — 앱이 「선생이 했다」를 못 쓴다', () => {
  const 서버 = fs.readFileSync(path.join(ROOT, 'supabase/functions/events/index.ts'), 'utf8');
  assert.match(서버, /'learner',\s*\$\{occurred_at\}/,
    "INSERT 의 actor_kind 가 'learner' 상수가 아니다 — 앱 값이 들어오면 그 칸이 자기 증명이 된다");
});

/* ─── ② 분류가 빠짐없는가 (허용 목록의 급소) ───────────────────────────────── */

test('🔴 계약의 모든 event_type 이 **앱사건·서버사건 중 정확히 하나**로 분류돼 있다', () => {
  const 분류안됨 = 값목록.filter((et) => !앱사건.includes(et) && !서버사건.includes(et));
  assert.deepEqual(분류안됨, [],
    `분류를 안 한 event_type: ${분류안됨.join(', ')}\n` +
    '  허용 목록이라 런타임은 안전한 쪽(앱 차단)으로 막히지만, 그게 의도인지 잊은 것인지는 여기서만 갈린다.\n' +
    '  앱이 내야 하는 값이면 `앱사건` 에, 서버·배치·운영 도구 몫이면 `서버사건` 에 사유와 함께 넣어라.');

  const 양쪽 = 앱사건.filter((et) => 서버사건.includes(et));
  assert.deepEqual(양쪽, [], `앱사건과 서버사건에 동시에 있다: ${양쪽.join(', ')} — 두 목록이 갈리기 시작한 것이다`);
});

test('두 목록에 계약 밖 이름이 없다 — 오타는 「아무도 못 내는 사건」으로 조용히 산다', () => {
  const 밖 = [...앱사건, ...서버사건].filter((et) => !값목록.includes(et));
  assert.deepEqual(밖, [], `계약 값목록에 없는 이름: ${밖.join(', ')}`);
});

/* ─── ③ 심문이 지목한 넷이 실제로 막히는가 ─────────────────────────────────── */

const 사건 = (et) => ({
  idempotency_key: '11111111-2222-4333-8444-555555555555',
  event_type: et,
  occurred_at: '2026-08-09T01:00:00.000Z',
  level_snapshot: 'Lv2',
  correlation_id: '99999999-8888-4777-8666-555555555555',
});

test('🔴 심문이 지목한 넷은 앱 주체로 전건 거절된다 (B1 의 알맹이)', () => {
  for (const et of ['task.assigned', 'exam.result', 'intervention.delivered', 'data_use.granted']) {
    const r = 검증(사건(et), 계약);
    assert.ok(r.오류들.some((m) => m.includes('앱이 만들 수 없는 사건')),
      `${et} 가 앱에서 통과했다 — append-only 에 위조가 섞이면 소급해서 못 가른다`);
  }
});

test('탐지력 픽스처 — 계약에 새 값이 늘어도 앱이 자동으로 낼 수 없다', () => {
  // 🔑 실제 계약을 안 건드린다(실저장소를 변이시키면 그게 다음 사고다) — 사본으로 잰다.
  const 늘린계약 = JSON.parse(JSON.stringify(계약));
  늘린계약.learning_events.값목록.event_type.push('teacher.note');

  const r = 검증(사건('teacher.note'), 늘린계약);
  assert.ok(r.오류들.some((m) => m.includes('앱이 만들 수 없는 사건')),
    '차단 목록 시절엔 여기가 통과였다 — 값목록만 늘리면 학생 기기가 그 사건을 주장할 수 있었다');
});

test('앱사건은 그대로 통과한다 — 뒤집은 판정이 정상 발화를 막으면 그게 더 큰 사고다', () => {
  for (const et of 앱사건) {
    const r = 검증(사건(et), 계약);
    assert.ok(!r.오류들.some((m) => m.includes('앱이 만들 수 없는 사건')),
      `${et} 가 앱에서 막혔다 — 이 값은 학생이 내는 것이다`);
  }
});
