'use strict';
/* 혼잣말 반입 회귀 — `contents/혼잣말.json` 이 **정본과 갈라지지 않았는가**.
 *
 * ■ 왜 이 파일이 있나 — 반입 사본은 조용히 갈라진다
 *   문구의 정본은 형제 저장소(SYNK-appsscript)의 `docs/캐릭터/혼잣말_정본.json` 이고, 여기 있는
 *   것은 **사본**이다. 사본은 「여기서 한 줄만 고치면 되는데」로 시작해서 갈라지고, 갈라진 뒤엔
 *   양쪽이 다 초록이다 — 각자 자기 파일만 보기 때문이다(SFX 바이트 대조가 있는 이유와 같다).
 *
 * ■ 형제가 없으면 skip (fail 아님)
 *   Actions 는 자기 저장소만 checkout 한다 — fail 로 짜면 CI 에서 남의 배포를 막는다
 *   (tests/소리.test.js ③ 과 같은 규율). 대신 **skip 과 통과가 같은 모양이 되지 않게** 찍는다.
 *
 * ■ 여기서 «안» 재는 것 — 문구의 규격(어절·금지 패턴)은 tests/마스코트생명.test.js 몫이다.
 *   그쪽은 「앱이 고르는 풀」을 재고, 여기는 「사본이 정본인가」를 잰다. 축이 다르다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const 뿌리 = path.resolve(__dirname, '..');
const 사본 = require('../contents/혼잣말.json');

test('반입 — 사본이 스키마를 갖췄고 id 가 안 겹친다(§8 수집 계약의 line_id 가 이 id 다)', () => {
  assert.ok(Array.isArray(사본.문구), '문구 배열이 없다');
  /* 09-02: 478 → 511 (재회 자리 셋 × 캐릭터 셋 = 33벌 · 기억감 층 축 A · 통로 = 형제 저장소
     `node tools/혼잣말반입.js`). 분모를 못박는 까닭은 아래 드리프트 검사와 다르다 —
     저것은 «정본과 같은가»를 보고 이것은 «반입이 잘리지 않았나»를 본다(형제가 없어도 돈다). */
  assert.equal(사본.문구.length, 511, `분모가 511 이 아니다(${사본.문구.length}) — 반입이 잘렸다`);
  assert.match(사본._주, /반입 사본/, '「여기는 반입 사본」이라는 머리말이 사라졌다 — 다음 사람이 여기를 정본으로 읽는다');
  assert.match(사본._주, /혼잣말_정본\.json/, '머리말이 정본 경로를 안 가리킨다');

  const 필드 = ['id', '캐릭터', '자리', '갈래', '급수', '소재', '문구'];
  const ids = new Set();
  for (const r of 사본.문구) {
    for (const f of 필드) assert.ok(r[f] !== undefined, `${r.id}: 칸 「${f}」 이 없다`);
    assert.ok(!ids.has(r.id), `id 중복: ${r.id} — id 는 동결이다(수정은 문구만, 삭제는 결번)`);
    ids.add(r.id);
    assert.ok(Array.isArray(r.소재) && r.소재.length >= 1, `${r.id}: 소재 태그가 없다 — 수집(§8)의 재료다`);
    assert.ok(r.급수 >= 1 && r.급수 <= 6, `${r.id}: TOPIK 급수가 범위 밖(${r.급수})`);
    assert.ok(typeof r.문구 === 'string' && r.문구.trim().length > 0, `${r.id}: 문구가 비었다`);
  }
});

test('반입 — 형제 저장소가 있으면 정본과 문구 전량이 같다(사본 드리프트 탐지)', (t) => {
  const 정본경로 = path.resolve(뿌리, '..', 'SYNK-appsscript', 'docs', '캐릭터', '혼잣말_정본.json');
  if (!fs.existsSync(정본경로)) return t.skip('형제 저장소 부재 — 정본 대조는 로컬에서만');
  const 정본 = JSON.parse(fs.readFileSync(정본경로, 'utf8'));
  assert.equal(정본.문구.length, 사본.문구.length,
    `정본 ${정본.문구.length}벌 · 사본 ${사본.문구.length}벌 — 정본이 늘거나 줄었다. 사본을 다시 옮긴다`);
  /* 줄 단위로 대조한다 — 통짜 deepEqual 은 「어디가 갈렸는지」를 안 말해 주고, 그러면
     다음 사람이 478줄 diff 를 눈으로 훑는다(그러다 그냥 사본을 덮어쓴다). */
  for (let i = 0; i < 정본.문구.length; i++) {
    assert.deepEqual(사본.문구[i], 정본.문구[i],
      `${정본.문구[i].id} 줄이 정본과 다르다 — 여기서 고치지 말고 정본을 고친 뒤 다시 옮긴다`);
  }
});
