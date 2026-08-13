'use strict';
/**
 * 테마 «면» 회귀 — 카드 면을 바꿀 때 조용히 죽는 글자 층을 잡는다.
 *
 * 발단(유호님 확정 2026-08-14 「면 2단 보강」): 바탕(Navy 2)과 카드(Navy Ink)가 ΔL* **1.48** 뿐이라
 * 카드가 사실상 안 떠 있었다. Navy 로 올려 5.98 을 만들었는데, 이 트랙에서 실측한 함정이 하나 있다:
 *
 *   🔴 **더 띄우려고 Navy 3 으로 올리면 두 색이 그 면에서 죽는다** — `잉크_보조`(Slate) 4.00 ·
 *      `신호`(Coral) 4.38. 둘 다 본문 기준 4.5 미달인데, **화면은 멀쩡해 보인다.**
 *      「카드를 더 띄우자」는 다음 사람이 집을 가장 자연스러운 수라, 프로즈로만 적어 두면 안 막힌다.
 *
 * 그래서 검사 대상은 「어떤 hex 를 썼나」가 아니라 **「그 면 위에서 글자가 사나」**다.
 *
 * ■ 이 검사의 대가(틀릴 때의 모습):
 *   맞는 얼굴로 틀릴 자리는 «파싱»이다 — `테마.js` 가 색 정의 문법을 바꾸면(상수 참조·객체 전개)
 *   칸을 못 읽는다. 그래서 **못 읽으면 던진다**(빠진 칸 이름을 대고 죽는다) — 그 칸만 빼고
 *   초록을 내지 않는다. 그리고 탐지력은 아래 «픽스처» 절이 못박는다: 실제 값이 통과하는 것만
 *   검사하면 판정식이 망가져도 초록이라, **알려진 나쁜 면(Navy 3)을 실제로 잡는지**를 함께 건다.
 * ■ 닫을 것: 없다 — 순수 계산이라 repo 밖 환경(시간대·홈·자격증명·네트워크)에 안 기댄다.
 *   ⚠ WCAG 대비 «수식»은 appsscript `tools/모드대비계측.js` 와 겹친다. 값(정본)이 아니라 공식이라
 *     갈라질 판정이 없고, 저장소가 둘이라 공유 통로가 없다(합치려면 패키지를 새로 내야 한다).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const 테마경로 = path.join(__dirname, '..', 'src', '테마.js');

/* ── 색 계산 (WCAG 2.x 상대휘도 · CIE L*) ── */
const srgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const 선형 = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const 광도 = (h) => { const v = srgb(h).map(선형); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const 대비 = (a, b) => {
  const x = 광도(a), y = 광도(b);
  return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
};
const Lstar = (h) => { const y = 광도(h); return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; };
const 합성 = (fg, bg, a) => {
  const F = srgb(fg), B = srgb(bg);
  return '#' + F.map((c, i) => Math.round((c * a + B[i] * (1 - a)) * 255).toString(16).padStart(2, '0'))
    .join('').toUpperCase();
};

/** rgba(…) / #RRGGBB → { hex, 알파 } */
function 색풀기(v) {
  const m = String(v).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (m) {
    const hex = '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
    return { hex, 알파: m[4] === undefined ? 1 : Number(m[4]) };
  }
  return { hex: String(v).toUpperCase(), 알파: 1 };
}

/** 🔴 못 읽으면 «던진다» — 그 칸만 빼고 초록을 내지 않는다(머리말 「대가」). */
function 테마읽기() {
  const 블록 = fs.readFileSync(테마경로, 'utf8').match(/export const 색 = \{([\s\S]*?)\n\};/);
  assert.ok(블록, `테마.js 에서 \`export const 색\` 블록을 못 찾았다 — ${테마경로}`);
  const 값 = {};
  for (const m of 블록[1].matchAll(/^\s*([가-힣_]+):\s*'([^']+)'/gm)) 값[m[1]] = m[2];
  const 필수 = ['바탕', '바탕띄움', '잉크', '신호', '잉크_태그', '잉크_서브', '잉크_메타', '잉크_보조'];
  const 빠짐 = 필수.filter((k) => !값[k]);
  assert.equal(빠짐.length, 0, `테마.js 에서 못 읽은 칸: ${빠짐.join(', ')}`);
  return 값;
}

/**
 * 한 면 위에서 «글자가 사나» — 이 파일의 판정식 하나.
 * 알파 층은 그 면에 합성해서 잰다(rgba 로 적힌 글자의 실제 대비는 합성색으로만 나온다).
 * 🚫 `잉크_희미` 는 안 센다 — 테마가 「선·비활성 도형 전용(글자 금지)」로 못박은 칸이다.
 */
function 죽은층(면, 값, 기준 = 4.5) {
  const 잉크 = 색풀기(값.잉크).hex;
  const 검사 = [
    ['잉크', 잉크, 1],
    ['잉크_태그', 잉크, 색풀기(값.잉크_태그).알파],
    ['잉크_서브', 잉크, 색풀기(값.잉크_서브).알파],
    ['잉크_메타', 잉크, 색풀기(값.잉크_메타).알파],
    ['잉크_보조', 색풀기(값.잉크_보조).hex, 1],
    ['신호', 색풀기(값.신호).hex, 1],
  ];
  const 죽음 = [];
  for (const [이름, 색, a] of 검사) {
    const c = 대비(합성(색, 면, a), 면);
    if (c < 기준) 죽음.push(`${이름} ${c}`);
  }
  return 죽음;
}

test('카드 면 위에서 글자 층이 «전부» 산다 — 신호(Coral)와 3번째 층(Slate)까지', () => {
  const 값 = 테마읽기();
  const 카드 = 색풀기(값.바탕띄움).hex;
  const 죽음 = 죽은층(카드, 값);
  assert.deepEqual(죽음, [], `카드 면 ${카드} 위에서 죽는 층: ${죽음.join(' · ')}`);
});

test('바탕 면 위에서도 글자 층이 전부 산다', () => {
  const 값 = 테마읽기();
  const 바탕 = 색풀기(값.바탕).hex;
  const 죽음 = 죽은층(바탕, 값);
  assert.deepEqual(죽음, [], `바탕 면 ${바탕} 위에서 죽는 층: ${죽음.join(' · ')}`);
});

test('카드가 실제로 «떠 있다» — 유호님 확정 2026-08-14 「면 2단 보강」', () => {
  const 값 = 테마읽기();
  const 들림 = Math.abs(Lstar(색풀기(값.바탕띄움).hex) - Lstar(색풀기(값.바탕).hex));
  /* 문턱 3.0 의 근거는 «실측 사이»다(브랜드렌더린트 임계 12 와 같은 규율):
     되돌리면 안 되는 옛 값 Navy Ink = 1.48 · 확정 값 Navy = 5.98. 그 사이에 둔다. */
  assert.ok(들림 >= 3.0, `카드가 안 떠 있다 — ΔL* ${들림.toFixed(2)} (문턱 3.0 · 옛 Navy Ink 가 1.48 이었다)`);
});

/* ── 픽스처 — «탐지력»을 못박는다 ────────────────────────────────────────────
 * 위 세 검사는 실제 값이 통과하는 것만 본다. 판정식이 망가져도 초록일 수 있어(예: 기준을 0 으로
 * 떨어뜨리면 전부 통과) **알려진 나쁜 면을 실제로 잡는지**를 함께 건다.
 * 🚫 실저장소가 나쁜 값을 갖고 있기를 요구하지 않는다 — 나쁜 면은 여기 상수로만 산다. */
test('픽스처: Navy 3 카드는 «잡힌다» — Slate·Coral 이 그 면에서 죽는다', () => {
  const 값 = 테마읽기();
  const 죽음 = 죽은층('#2A3358', 값); // Navy 3 — 더 띄우려 할 때 집기 쉬운 그 단
  assert.ok(죽음.some((d) => d.startsWith('잉크_보조')), `Slate 미달을 못 잡았다 (잡은 것: ${죽음.join(' · ')})`);
  assert.ok(죽음.some((d) => d.startsWith('신호')), `Coral 미달을 못 잡았다 (잡은 것: ${죽음.join(' · ')})`);
});

test('픽스처: 옛 값(Navy Ink)으로 되돌리면 «안 떠 있다»가 잡힌다', () => {
  const 들림 = Math.abs(Lstar('#131A32') - Lstar('#0F1730'));
  assert.ok(들림 < 3.0, `옛 값이 문턱을 넘어 버렸다 — ΔL* ${들림.toFixed(2)}`);
});
