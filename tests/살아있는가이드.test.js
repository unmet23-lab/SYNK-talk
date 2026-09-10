'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { 세우기: 앱세우기 } = require('./lib/앱모듈세우기.js');
const ROOT = path.resolve(__dirname, '..');
const 마스크 = require('../assets/브랜드/가이드눈마스크.json');

// 실제 훅의 효과·상태·타이머를 가짜 시계로 실행한다. RN 화면/벤더/오디오 호출은 없다.
function 세우기() {
  let 시각 = 0, 번호 = 0, 커서 = 0, 바뀜 = false, 렌더, 값;
  let 줄임 = false, 녹음 = false, 시작 = 0, 정지 = 0;
  const 칸 = [], 할효과 = [], 예약 = new Map(), 앱구독 = new Set(), 문서구독 = new Set();
  const document = { visibilityState: 'visible', addEventListener: (_, fn) => 문서구독.add(fn), removeEventListener: (_, fn) => 문서구독.delete(fn) };
  const AppState = { currentState: 'active', addEventListener: (_, fn) => { 앱구독.add(fn); return { remove: () => 앱구독.delete(fn) }; } };
  const React = {
    useState(init) {
      const i = 커서++;
      if (!칸[i]) 칸[i] = { 값: typeof init === 'function' ? init() : init };
      return [칸[i].값, (v) => { const next = typeof v === 'function' ? v(칸[i].값) : v; if (next !== 칸[i].값) { 칸[i].값 = next; 바뀜 = true; } }];
    },
    useRef(init) { const i = 커서++; 칸[i] ||= { current: init }; return 칸[i]; },
    useEffect(fn, deps) {
      const i = 커서++;
      if (!칸[i] || deps.some((v, n) => v !== 칸[i].deps[n])) {
        const old = 칸[i]; 칸[i] = { deps };
        할효과.push(() => { old?.정리?.(); 칸[i].정리 = fn(); });
      }
    },
  };
  const jsx = (type, props, key) => typeof type === 'function' ? type(props) : { type, props: props || {}, key };
  const Animated = {
    View: 'Animated.View',
    Value: class { constructor(v) { this.value = v; } setValue(v) { this.value = v; } interpolate(v) { return { animation: this, ...v }; } },
    timing: () => ({}), sequence: () => ({}), loop: () => ({ start: () => 시작++, stop: () => 정지++ }),
  };
  const 모듈가짜 = new Map([
    ['react', React], ['react/jsx-runtime', { jsx, jsxs: jsx }],
    ['react-native', { Animated, AppState, Image: 'Image', View: 'View', Easing: { inOut: () => null, sin: null }, Platform: { OS: 'web' } }],
    ['../lib/모션.js', { use줄임: () => 줄임 }], ['./소리.js', { 지금녹음중: () => 녹음 }],
    ['./브랜드자산.js', { 가이드그림: Object.fromEntries(['몽글', '까몽', '마린'].map(n => [n, `브랜드/${n}_본체.webp`])) }],
    ['../assets/브랜드/가이드눈마스크.json', 마스크],
    ...['몽글', '까몽', '마린'].map(n => { const file = `../assets/마스코트/${n}_눈감음.webp`; return [file, file]; }),
  ]);
  const exports = 앱세우기(path.join(ROOT, 'src/살아있는가이드.js'), () => { throw new Error('원격 호출 금지'); }, {
    모듈가짜,
    전역: {
      document,
      setTimeout: (fn, ms) => { const id = ++번호; 예약.set(id, { fn, at: 시각 + ms }); return id; },
      clearTimeout: (id) => 예약.delete(id),
    },
  });
  const 돌림 = () => {
    do { 바뀜 = false; 커서 = 0; 값 = 렌더(); while (할효과.length) 할효과.shift()(); } while (바뀜);
    return 값;
  };
  return {
    exports, render(fn) { 렌더 = fn; return 돌림(); },
    tick(ms) {
      const 끝 = 시각 + ms;
      while (true) {
        const next = [...예약].filter(([, v]) => v.at <= 끝).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        시각 = next[1].at; 예약.delete(next[0]); next[1].fn(); 돌림();
      }
      시각 = 끝; return 값;
    },
    reduced(v) { 줄임 = v; return 돌림(); },
    recording(v) { 녹음 = v; return 돌림(); },
    background(v) { AppState.currentState = v ? 'background' : 'active'; for (const fn of 앱구독) fn(); return 돌림(); },
    hidden(v) { document.visibilityState = v ? 'hidden' : 'visible'; for (const fn of 문서구독) fn(); return 돌림(); },
    unmount() { for (const c of 칸) c?.정리?.(); },
    stats: () => ({ timers: 예약.size, appListeners: 앱구독.size, documentListeners: 문서구독.size, breathingStarted: 시작, breathingStopped: 정지 }),
  };
}

test('공용 깜빡임: 최초 지연·140ms 닫힘·다음 예약·unmount 정리', () => {
  const h = 세우기();
  assert.equal(h.render(() => h.exports.use장면깜빡임()), false);
  assert.equal(h.tick(2399), false);
  assert.equal(h.tick(1), true);
  assert.equal(h.tick(139), true);
  assert.equal(h.tick(1), false);
  assert.equal(h.tick(6399), false);
  h.unmount();
  assert.deepEqual(h.stats(), { timers: 0, appListeners: 0, documentListeners: 0, breathingStarted: 0, breathingStopped: 0 });
});

test('줄임·앱 배경·브라우저 숨김·명시 멈춤은 닫힌 눈을 즉시 풀고 예약을 걷는다', () => {
  for (const gate of ['reduced', 'background', 'hidden', 'prop']) {
    const h = 세우기(); let 멈춤 = false;
    const render = () => h.exports.use장면깜빡임({ 멈춤 });
    h.render(render); assert.equal(h.tick(2400), true);
    const result = gate === 'prop' ? (멈춤 = true, h.render(render)) : h[gate](true);
    assert.equal(result, false, gate);
    assert.equal(h.stats().timers, 0, gate);
    if (gate === 'prop') { 멈춤 = false; h.render(render); } else h[gate](false);
    assert.equal(h.tick(2400), true, `${gate} 해제 뒤 다시 시작`);
    h.unmount();
  }
});

test('예약 후 켜진 전역 녹음 중에는 눈감음이 시작되지 않는다', () => {
  const h = 세우기();
  h.render(() => h.exports.use장면깜빡임()); h.recording(true);
  assert.equal(h.tick(30000), false);
  h.unmount(); assert.equal(h.stats().timers, 0);
});

test('선택 없는 가이드는 null이며 유효한 가이드의 몸은 깜빡여도 같은 이미지다', () => {
  for (const 이름 of [undefined, null, '', '교수', '__proto__']) {
    const h = 세우기(); assert.equal(h.render(() => h.exports.살아있는가이드({ 이름 })), null); assert.equal(h.stats().timers, 0);
  }
  for (const 이름 of ['몽글', '까몽', '마린']) {
    const h = 세우기(); let 멈춤 = false;
    const render = () => h.exports.살아있는가이드({ 이름, 멈춤 });
    const before = h.render(render).props.children;
    const after = h.tick({ 몽글: 2600, 까몽: 2800, 마린: 3000 }[이름]).props.children;
    assert.equal(before.props.children[0].props.source, after.props.children[0].props.source);
    assert.equal(after.props.children[0].props.source, `브랜드/${이름}_본체.webp`);
    const eyes = after.props.children[1];
    assert.equal(eyes.length, 2);
    for (const eye of eyes) {
      assert.equal(eye.props.style.opacity, 1);
      assert.equal(eye.props.style.overflow, 'hidden');
      assert.equal(eye.props.style.borderRadius, '50%');
      assert.ok(eye.props.style.width < 13 && eye.props.style.height < 14, '88px 몸에서 얼굴 사각 교체 금지');
      assert.equal(eye.props.children.props.fadeDuration, 0);
    }
    멈춤 = true; h.render(render);
    assert.equal(h.stats().breathingStopped, 1);
    assert.equal(h.stats().timers, 0);
    h.unmount(); assert.equal(h.stats().appListeners, 0);
  }
});

test('마스크가 참조하는 기존 눈감음 원본 지문과 앱 파일 크기가 유효하다', async () => {
  const sharp = require('sharp');
  for (const c of Object.values(마스크.characters)) {
    const bytes = fs.readFileSync(path.join(ROOT, c.frame));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), c.frameSha256);
    const m = await sharp(bytes).metadata();
    assert.deepEqual([m.width, m.height], 마스크.expressionResolution);
    assert.equal(m.hasAlpha, true);
  }
});
