'use strict';
/* 감사회귀 R1B8 — D3-4: `season_goal` 만 `역할: '목표'` 표식을 단다.
 *
 * 회고 확정 카드의 「그때 스스로 말한 것」 한 줄은 문항키 사본 없이 이 표식 하나로 그 답을
 * 집는다(어휘 사본 0 규칙). 표식이 다른 문항으로 번지면 확정 카드가 엉뚱한 답을 «그때의
 * 목표»로 내고, 통째로 사라지면 그 줄이 조용히 빠진다 — 둘 다 화면에선 증상이 없다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { 종류, 물을것 } = require('../lib/나침반문항.js');

test('D3-4 물을것 출력에서 역할=「목표」는 season_goal 하나뿐이다', () => {
  for (const 회차 of [종류.입학, 종류.시즌]) {
    const 목록 = 물을것(회차, null);
    assert.deepEqual(
      목록.filter((q) => q.역할 === '목표').map((q) => q.키),
      ['season_goal'],
      `${회차} 회차에서 역할=목표 문항이 season_goal 하나가 아니다`,
    );
    for (const q of 목록) {
      if (q.키 !== 'season_goal') {
        assert.equal(q.역할, null, `${q.키} 에 역할 표식이 번졌다 — 확정 카드가 엉뚱한 답을 집는다`);
      }
    }
  }
});
