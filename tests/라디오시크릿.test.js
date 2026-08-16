/* 라디오시크릿 착지 — **어느 시크릿을 착지시키는가**의 회귀 (대기열 P1 라디오24 · #Q48 ▶다음).
 *
 * 왜 생겼나 (2026-08-16 실측): `radio-round` 가 리허설·운영 **둘 다 404(미배포)** 였고,
 * 막고 있던 것은 값이 아니라 이 도구의 `const 시크릿이름 = 'RADIO_INGEST_SECRET'` **상수** 하나였다.
 * 값은 도구가 난수로 만든다 — 사람이 줄 것이 애초에 없었다.
 *
 * 이 회귀가 지는 것 셋:
 *   ㉠ **기본값이 안 움직인다** — 갈래를 안 고르면 예전 그대로 인제스트. 상수를 푼 판에서
 *      가장 조용히 깨지는 자리다(기존 호출자는 전부 무플래그다).
 *   ㉡ **둘을 같이 고르면 죽는다** — 조용히 하나가 이기면 「고른 것과 다른 시크릿이 돌아갔다」가
 *      되고 증상은 401 뿐이라 갈라낼 자리가 없다.
 *   ㉢ **등록층** — `시크릿들` 에 이름을 늘리고 `아는플래그` 에 안 넣으면 `인자게이트` 가 그 낱말을
 *      모르는 것으로 죽인다(F435·F103). 가드는 로직보다 등록층에서 새고, 새는 방향은 언제나
 *      「통과」다 — 그래서 손 목록이 아니라 **소스에서 파생해** 대조한다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const 착지 = require('../tools/라디오시크릿_착지.js');

test('㉠ 갈래를 안 고르면 예전 그대로 — 인제스트', () => {
  assert.equal(착지.이름판정([]).이름, 'RADIO_INGEST_SECRET');
  assert.equal(착지.이름판정(['--적용']).이름, 'RADIO_INGEST_SECRET');
  assert.equal(착지.이름판정(undefined).이름, 'RADIO_INGEST_SECRET');
});

test('㉠-2 고른 갈래가 그대로 나온다 — 다른 플래그에 안 흔들린다', () => {
  assert.equal(착지.이름판정(['--라운드']).이름, 'RADIO_ROUND_SECRET');
  assert.equal(착지.이름판정(['--적용', '--라운드', '--회전']).이름, 'RADIO_ROUND_SECRET');
  assert.equal(착지.이름판정(['--인제스트', '--적용']).이름, 'RADIO_INGEST_SECRET');
});

test('㉡ 둘을 같이 고르면 오류다 — 조용히 하나가 이기지 않는다', () => {
  const r = 착지.이름판정(['--인제스트', '--라운드']);
  assert.equal(r.이름, undefined);
  assert.match(r.오류, /둘 이상/);
  /* 사유에 **고른 낱말이 그대로** 실려야 사람이 무엇을 지울지 안다(따를 수 있는 처방 · F103). */
  assert.match(r.오류, /--인제스트/);
  assert.match(r.오류, /--라운드/);
});

test('㉢ 등록층 — `시크릿들` 의 갈래 낱말 전량이 `아는플래그` 에 있다', () => {
  /* 손 목록 0 — 실물에서 파생한다. 여기 이름을 적어 두면 갈라진 날 이 검사가 먼저 거짓말한다. */
  for (const 낱말 of Object.keys(착지.시크릿들)) {
    assert.ok(착지.아는플래그.includes(낱말),
      `${낱말} 이 아는플래그에 없다 — 인자게이트가 이 낱말을 모르는 것으로 죽인다(F435)`);
  }
  assert.ok(착지.아는플래그.includes(착지.기본갈래), '기본갈래도 사람이 직접 칠 수 있어야 한다');
});

test('㉢-2 시크릿 «이름» 은 자유 문자열이 아니다 — 아는 것만 돌려준다', () => {
  /* 오타·주입으로 없는 이름이 착지하면 증상이 조용함이다(Fn 은 제 이름만 읽어 401). */
  const 아는이름 = new Set(Object.values(착지.시크릿들));
  for (const args of [[], ['--라운드'], ['--인제스트'], ['--적용'], ['RADIO_FAKE_SECRET'], ['--운영']]) {
    const r = 착지.이름판정(args);
    if (r.이름 !== undefined) assert.ok(아는이름.has(r.이름), `모르는 이름이 나왔다: ${r.이름}`);
  }
});

test('㉣ 실물 대조 — Fn 이 실제로 읽는 이름이 `시크릿들` 에 있다', () => {
  /* 이 도구가 넣는 이름과 Fn 이 `Deno.env.get` 으로 읽는 이름이 갈리면 전건 401 이고,
   * 그 갈라짐은 어느 테스트에도 안 잡힌다(양쪽 다 자기 이름으로는 초록이다). */
  const 아는이름 = new Set(Object.values(착지.시크릿들));
  const 볼것 = [
    ['radio-round', 'RADIO_ROUND_SECRET'],
    ['radio-ingest', 'RADIO_INGEST_SECRET'],
  ];
  for (const [fn, 이름] of 볼것) {
    const p = path.join(__dirname, '..', 'supabase', 'functions', fn, 'index.ts');
    if (!fs.existsSync(p)) continue;          // 아직 없는 Fn 은 이 검사의 대상이 아니다(skip)
    const src = fs.readFileSync(p, 'utf8');
    if (!src.includes(`Deno.env.get('${이름}')`)) continue;
    assert.ok(아는이름.has(이름), `${fn} 이 읽는 ${이름} 을 이 도구가 착지시킬 수 없다`);
  }
});
