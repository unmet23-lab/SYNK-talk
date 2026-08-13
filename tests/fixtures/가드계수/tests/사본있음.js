'use strict';
/* 픽스처 — `tools/가드계수.js` 의 «탐지력»을 값으로 못박는 재료다. 돌아가지 않는다(파일명에
 * `.test.js` 를 안 붙인 것도 그래서다 — 붙이면 러너가 실행하려 든다).
 * 한 파일에 네 모양을 일부러 섞어 둔다: 세야 하는 둘, 세면 «안 되는» 둘. */

const fs = require('fs');
const assert = require('assert');

// ① 세야 한다 — 주석 제거기 지역 사본 1벌
const 주석제거 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

// ② 세면 «안 된다» — base64url 인코더다(급조 계수기가 이걸 사본으로 셌다 · F401)
const b64 = (o) => String(o).replace(/\+/g, '-').replace(/\//g, '_');

const 소스 = fs.readFileSync('없는파일.js', 'utf8');

// ③ 세야 한다 — 부정 단언 × 파일 원문 «직접»
assert.ok(!소스.includes('평균'));

// ④ 세야 한다(안전 쪽) — 부정 단언 × 정제 경유
assert.equal(주석제거(소스).includes('등수'), false);

// ⑤ 세면 «안 된다» — 수신자가 문자열 상수다(급조 계수기가 이걸 위험으로 셌다)
assert.ok(!'등수는 안 쓴다'.includes('평균'));

// ⑥ 세면 «안 된다» — 긍정 단언이다(이 축은 «부정»만 센다)
assert.ok(소스.includes('export'));

module.exports = { b64 };
