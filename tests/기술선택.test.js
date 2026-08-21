/* 기술선택 회귀 — §6-0 회전 규격을 «독립 구현»과 대조해 못박는다.
 *
 * 🔴 이 파일의 존재 이유는 재현이다: 첫 처치 의도는 append-only 사건에 남아 나중에 못 고친다 —
 *   해시·결합·개수 어느 하나라도 구현마다 갈리면 그 학생의 겨냥 이력이 두 규칙으로 갈린다(D6).
 *   그래서 시작 위치는 이 파일이 node:crypto 로 **따로 계산해** 대조한다(자기 구현 참조 금지 —
 *   lib 이 틀리게 바뀌면 같은 틀림으로 초록이 되는 것을 막는다 · tests/sha256.test.js 와 같은 규칙). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { 기술선택, 앞8바이트BE } = require('../lib/기술선택.js');

const 학생 = 'b6f1c0a2-0000-4000-8000-0000000000aa';
const 날 = '2026-08-21';
const 후보18 = Array.from({ length: 18 }, (_, i) => `skill-ko-test-${String(i).padStart(2, '0')}`);

/** §6-0 해시 규격의 독립 구현 — SHA-256 앞 8바이트 big-endian BigInt. */
const 독립시작위치 = (learner, date, n) => {
  const d = crypto.createHash('sha256').update(Buffer.from(`${learner}:${date}`, 'utf8')).digest();
  return Number(d.readBigUInt64BE(0) % BigInt(n));
};

test('해시 규격 — node:crypto 독립 계산과 시작 위치가 같다 (SHA-256 · 앞 8바이트 · BE · BigInt)', () => {
  for (const [l, d] of [[학생, 날], [학생, '2027-01-01'], ['other-learner', 날]]) {
    assert.equal(
      Number(앞8바이트BE(`${l}:${d}`) % 18n), 독립시작위치(l, d, 18),
      `해시가 규격과 갈린다: ${l}:${d} — 구현마다 다른 기술을 집으면 겨냥 이력이 두 규칙으로 갈린다`);
  }
});

test('결정성 — 같은 입력은 언제나 같은 출력이다 (무작위 금지 · 재현이 안 되면 §8-B 채점을 못 한다)', () => {
  const a = 기술선택({ learner_id: 학생, assign_date: 날, 후보: 후보18 });
  const b = 기술선택({ learner_id: 학생, assign_date: 날, 후보: 후보18 });
  assert.deepEqual(a, b);
  assert.equal(a.skill_ids.length, 2, '안 겨냥이 18개면 목표는 2다');
});

test('정렬은 함수가 다시 건다 — 뒤섞인 후보·행 객체 입력도 같은 답이다 (조회층의 잊음이 비결정이 되지 않게)', () => {
  const 정순 = 기술선택({ learner_id: 학생, assign_date: 날, 후보: 후보18 });
  const 뒤섞 = 기술선택({
    learner_id: 학생, assign_date: 날,
    후보: [...후보18].reverse().map((skill_id) => ({ skill_id })),
  });
  assert.deepEqual(뒤섞, 정순);
});

test('결합 ⓐ — 겨냥분은 «건너뛴다»(부분집합 mod ⓑ 가 아니다 · v5.7 C1)', () => {
  const 시작 = 독립시작위치(학생, 날, 18);
  const 첫후보 = 후보18[시작];
  /* 시작 위치의 기술이 이미 겨냥됐으면 ⓐ 는 «그 다음 안 겨냥»을 집는다.
   * ⓑ(안 겨냥 17개로 mod)는 분모가 달라 일반적으로 다른 자리를 낸다 — 같은 자리가 우연히
   * 나올 수 있는 픽스처면 이 검사는 아무것도 못 가르므로, 건너뛰기의 «직접 증거»(다음 칸)를 잰다. */
  const r = 기술선택({ learner_id: 학생, assign_date: 날, 후보: 후보18, 최근겨냥: [첫후보] });
  assert.ok(!r.skill_ids.includes(첫후보), '겨냥된 기술이 다시 뽑혔다 — 회전이 신선함을 안 지킨다');
  assert.equal(r.skill_ids[0], 후보18[(시작 + 1) % 18],
    '시작 위치 다음 칸이 아니다 — ⓐ(건너뛰기)가 아니라 다른 결합을 쓰고 있다');
  assert.equal(r.skill_ids.length, 2);
});

test('개수 3갈래 — 안 겨냥 ≥2 → 2 · 1 → 1 · 0 → 시작 위치부터 2 (재량 금지)', () => {
  const 시작 = 독립시작위치(학생, 날, 18);
  const 하나만남김 = 후보18.filter((s) => s !== 후보18[(시작 + 5) % 18]);
  const r1 = 기술선택({ learner_id: 학생, assign_date: 날, 후보: 후보18, 최근겨냥: 하나만남김 });
  assert.deepEqual(r1.skill_ids, [후보18[(시작 + 5) % 18]], '안 겨냥 1개면 그 1개다');

  const r0 = 기술선택({ learner_id: 학생, assign_date: 날, 후보: 후보18, 최근겨냥: 후보18 });
  assert.deepEqual(r0.skill_ids, [후보18[시작], 후보18[(시작 + 1) % 18]],
    '창 안에 다 돌았으면 시작 위치부터 순서대로 2개다');
});

test('「[]」 의 뜻은 «후보 0(시드 깨짐)» 하나다 — 던지지 않고 빈 값으로 드러낸다', () => {
  assert.deepEqual(기술선택({ learner_id: 학생, assign_date: 날, 후보: [] }),
    { skill_ids: [], 시작위치: 0 });
});

test('재료 결함은 값으로 안 뭉갠다 — 날짜 꼴·learner 부재·중복 후보는 던진다', () => {
  assert.throws(() => 기술선택({ learner_id: 학생, assign_date: '08-21', 후보: 후보18 }), /YYYY-MM-DD/);
  assert.throws(() => 기술선택({ assign_date: 날, 후보: 후보18 }), /learner_id/);
  assert.throws(() => 기술선택({ learner_id: 학생, assign_date: 날, 후보: [...후보18, 후보18[0]] }), /중복/);
});

test('학생·날짜가 다르면 시작 위치가 도는 표본이 있다 — 회전이 상수가 아니라는 최소 증거', () => {
  const 자리들 = new Set();
  for (let d = 1; d <= 9; d += 1) {
    자리들.add(기술선택({ learner_id: 학생, assign_date: `2026-09-0${d}`, 후보: 후보18 }).시작위치);
  }
  assert.ok(자리들.size > 1, '아흐레 연속 같은 자리면 해시가 죽은 것이다');
});
