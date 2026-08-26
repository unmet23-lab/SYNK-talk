'use strict';
/**
 * 스키아패치 — Skia 의 «비디오 한 줄»이 Reanimated 없는 앱을 죽이는 것을 막는다 (2026-08-27).
 *
 * ■ 병 — @shopify/react-native-skia 2.6.2 `useVideoLoading` 이 **모듈 최상위에서**
 *   `Rea.createWorkletRuntime(...)` 을 부른다. Rea 는 지연 프록시라 «속성을 만지는 순간»
 *   react-native-reanimated 를 require 하고, 우리는 그걸 안 쓰기로 판정했으므로(모션 스택 ②
 *   보류 · 결정 08-27) 그 자리에서 `react-native-reanimated is not installed!` 가 터진다.
 *   Skia 의 다른 프록시 접근은 전부 훅·메서드 안이고(안 부르면 안 던진다), 컨테이너도
 *   Reanimated 없으면 StaticContainer 로 가게 돼 있다 — 어긴 것은 이 한 줄뿐이다.
 *   증상: `require('@shopify/react-native-skia')` 가 던져 개발 빌드는 레드박스,
 *   프로덕션은 마스코트몸이 조용히 폴백(Animated.Image)으로 내려간다 — ①채택이 무동작이 된다.
 *
 * ■ 처방 — 그 줄을 «처음 쓸 때 만드는» 게으른 꼴로 바꾼다. 비디오 기능은 안 쓰므로 잃는 것이
 *   없고, 쓰는 날엔 같은 오류가 그 자리(useVideoLoading 첫 호출)에서 나므로 숨는 병이 아니다.
 *
 * ■ 왜 node_modules 를 직접 안 고치나 — 새 체크아웃 + npm install 이 수정을 지운다
 *   (fresh-checkout 함정). 그래서 이 스크립트가 postinstall 에 걸려 매번 다시 바른다. 멱등.
 *
 * ■ 🔴 Skia 를 올린 날 — 파일에서 병도 처방도 못 찾으면 **빨갛게 실패한다**(조용히 넘어가면
 *   업그레이드가 미패치로 «성공처럼» 찍힌다). 위 버전이 이 병을 고쳤으면 이 스크립트와
 *   postinstall 의 호출을 같이 걷어내면 된다.
 */
const fs = require('fs');
const path = require('path');

const 뿌리 = path.join(__dirname, '..', 'node_modules', '@shopify', 'react-native-skia');

/* 세 벌을 전부 바른다 — Metro 는 `react-native` 필드(src/index.ts)를 읽지만,
   jest·번들러 설정에 따라 lib 두 벌이 뽑힐 수 있다. 하나만 바르면 「어느 판이 실리나」에
   따라 병이 되살아난다(one-flag-two-protocols 와 같은 얼굴). */
const 과녁들 = [
  {
    파일: path.join(뿌리, 'src', 'external', 'reanimated', 'useVideoLoading.ts'),
    병: 'const runtime = Rea.createWorkletRuntime("video-metadata-runtime");',
    처방: [
      'let runtime: ReturnType<typeof Rea.createWorkletRuntime> | undefined;',
      'const getRuntime = () => {',
      '  if (runtime === undefined) {',
      '    runtime = Rea.createWorkletRuntime("video-metadata-runtime");',
      '  }',
      '  return runtime;',
      '};',
    ].join('\n'),
    쓰는곳: { 병: 'Rea.runOnRuntime(runtime, cb)(source);', 처방: 'Rea.runOnRuntime(getRuntime(), cb)(source);' },
  },
  {
    파일: path.join(뿌리, 'lib', 'module', 'external', 'reanimated', 'useVideoLoading.js'),
    병: 'const runtime = Rea.createWorkletRuntime("video-metadata-runtime");',
    처방: [
      'let runtime;',
      'const getRuntime = () => {',
      '  if (runtime === undefined) {',
      '    runtime = Rea.createWorkletRuntime("video-metadata-runtime");',
      '  }',
      '  return runtime;',
      '};',
    ].join('\n'),
    쓰는곳: { 병: 'Rea.runOnRuntime(runtime, cb)(source);', 처방: 'Rea.runOnRuntime(getRuntime(), cb)(source);' },
  },
  {
    파일: path.join(뿌리, 'lib', 'commonjs', 'external', 'reanimated', 'useVideoLoading.js'),
    병: 'const runtime = _ReanimatedProxy.default.createWorkletRuntime("video-metadata-runtime");',
    처방: [
      'let runtime;',
      'const getRuntime = () => {',
      '  if (runtime === undefined) {',
      '    runtime = _ReanimatedProxy.default.createWorkletRuntime("video-metadata-runtime");',
      '  }',
      '  return runtime;',
      '};',
    ].join('\n'),
    쓰는곳: {
      병: '_ReanimatedProxy.default.runOnRuntime(runtime, cb)(source);',
      처방: '_ReanimatedProxy.default.runOnRuntime(getRuntime(), cb)(source);',
    },
  },
];

if (!fs.existsSync(뿌리)) {
  // Skia 자체가 없으면 바를 것도 없다 — npm install 이 아직인 기계에서 조용히 지나간다.
  console.log('[스키아패치] @shopify/react-native-skia 없음 — 건너뜀');
  process.exit(0);
}

let 바름 = 0;
let 이미 = 0;
const 실패 = [];

for (const 과녁 of 과녁들) {
  const 원문 = fs.readFileSync(과녁.파일, 'utf8');
  if (원문.includes('getRuntime')) {
    이미 += 1;
    continue;
  }
  if (!원문.includes(과녁.병) || !원문.includes(과녁.쓰는곳.병)) {
    실패.push(과녁.파일);
    continue;
  }
  const 고침 = 원문.replace(과녁.병, 과녁.처방).replace(과녁.쓰는곳.병, 과녁.쓰는곳.처방);
  fs.writeFileSync(과녁.파일, 고침);
  바름 += 1;
}

if (실패.length > 0) {
  console.error('[스키아패치] 🔴 병도 처방도 못 찾은 파일 — Skia 버전이 바뀌었다. 위 머리말대로 재판정할 것:');
  for (const f of 실패) console.error('  · ' + path.relative(path.join(__dirname, '..'), f));
  process.exit(1);
}
console.log(`[스키아패치] 완료 — 새로 바름 ${바름} · 이미 발라짐 ${이미} (합 ${바름 + 이미}/3)`);
