/* 태그기술표 회귀 — S6 확정(유호 08-24)의 «분할·실재»를 상시 기계로.
 *
 * ① 표 + 대응없음 = 계약 태그 23(오류없음 제외)의 **정확한 분할** — 빠짐도 겹침도 없다.
 *    분할이 깨지는 날은 계약이 늘었거나 표를 반쪽만 고친 날이다 — 어느 쪽이든 시끄러워야 한다.
 * ② 표의 skill_id 가 문항 팩 스킬표에 **실재**한다 — 없는 기술로 카드를 만들면 그 카드는
 *    어느 어휘에도 없는 유령 축이 된다.
 * ③ 카드키 — 매핑은 skill, 대응없음은 태그 그대로, 모르는 문자열도 그대로(지어내지 않는다). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { 표, 대응없음, 카드키 } = require('../lib/태그기술표.js');
const { 스킬표 } = require('../contents/토픽퀴즈문항.js');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));

test('① 분할 — 표 + 대응없음 = 계약 태그 23(오류없음 제외), 빠짐도 겹침도 없다', () => {
  const 태그들 = 계약.오류태그.filter((t) => t !== '오류없음');
  assert.equal(태그들.length, 23, `계약 태그가 ${태그들.length}개다 — 늘었으면 표 판정부터(빠짐은 아래서 잡힌다)`);
  const 덮음 = [...Object.keys(표), ...대응없음].sort();
  assert.deepEqual(덮음, [...태그들].sort(),
    '표∪대응없음 ≠ 계약 태그 — 계약이 늘었거나 표를 반쪽만 고쳤다(어느 쪽이든 여기서 시끄럽게)');
  const 겹침 = Object.keys(표).filter((t) => 대응없음.includes(t));
  assert.deepEqual(겹침, [], '한 태그가 표와 대응없음 양쪽에 있다');
});

test('② 실재 — 표의 skill_id 전량이 문항 팩 스킬표에 있다 · 서로 다른 기술이다(합쳐 접지 않는다)', () => {
  const 실재 = new Set(스킬표.map((s) => s.skill_id));
  for (const [태그, 기술] of Object.entries(표)) {
    assert.ok(실재.has(기술), `${태그} → ${기술} — 스킬표에 없는 유령 기술이다`);
  }
  const 값들 = Object.values(표);
  assert.equal(new Set(값들).size, 값들.length, '두 태그가 같은 기술로 접혔다 — 확정 8쌍은 전부 서로 다른 기술이다');
});

test('③ 카드키 — 매핑은 skill · 대응없음·모르는 값은 그대로(지어내지 않는다)', () => {
  assert.equal(카드키('조사:주격(이/가·은/는)'), 'skill-ko-grammar-particle-topic');
  assert.equal(카드키('맞춤법:받침'), '맞춤법:받침', '대응없음 태그가 변형됐다 — 그 카드는 태그 키 그대로 산다');
  assert.equal(카드키('처음보는축'), '처음보는축', '모르는 문자열을 지어내 바꿨다');
});
