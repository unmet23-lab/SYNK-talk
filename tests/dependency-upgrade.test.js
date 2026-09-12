'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');
const { 코드만, 파일소스 } = require('./lib/소스검사.js');
const { latestStable } = require('../tools/dependency-upgrade-audit');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const manifest = json('package.json');
const lock = json('package-lock.json');
const pkg = name => json(`node_modules/${name}/package.json`);

test('배포일 감사는 기준일 이후·시험판·폐기판·시각 불명을 최신 정식으로 세지 않는다', () => {
  const versions = {
    '1.9.0': {}, '1.10.0': {}, '2.0.0-beta.1': {}, '2.0.0': {},
    '1000.0.0': { deprecated: 'accidental publication' }, '999.0.0': {},
  };
  const time = {
    '1.9.0': '2026-09-10T00:00:00Z', '1.10.0': '2026-09-11T14:59:59Z',
    '2.0.0-beta.1': '2026-09-01T00:00:00Z', '2.0.0': '2026-09-11T15:00:00Z',
    '1000.0.0': '2024-01-01T00:00:00Z',
  };
  assert.equal(latestStable({ versions, time }), '1.10.0');
  assert.throws(() => latestStable({ versions, time }, 'wrong date'));
});

test('모든 직접 의존성의 선언·잠금·설치본이 같은 허용범위 안에 있다', () => {
  for (const [name, range] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
    const installed = pkg(name).version;
    assert.equal(installed, lock.packages[`node_modules/${name}`].version, name);
    assert.ok(semver.satisfies(installed, range), `${name}@${installed} vs ${range}`);
  }
});

test('Expo core·Reanimated·Worklets·Skia의 실제 peer 계약을 모두 만족한다', () => {
  for (const name of ['expo-modules-core', 'react-native-reanimated', 'react-native-worklets', '@shopify/react-native-skia']) {
    for (const peer of ['react', 'react-native', 'react-native-reanimated', 'react-native-worklets']) {
      const range = pkg(name).peerDependencies?.[peer];
      if (range) assert.ok(semver.satisfies(pkg(peer).version, range), `${name}: ${peer} ${range}`);
    }
  }
  const compatibility = json('node_modules/react-native-reanimated/compatibility.json').fabric;
  const version = pkg('react-native-reanimated').version;
  const row = Object.entries(compatibility).find(([range]) => semver.validRange(range) && semver.satisfies(version, range))[1];
  assert.ok(row['react-native'].includes(semver.major(pkg('react-native').version) + '.' + semver.minor(pkg('react-native').version)));
  assert.ok(row['react-native-worklets'].some(range => semver.satisfies(pkg('react-native-worklets').version, range)));
});

test('React는 넓은 peer 범위가 아닌 실제 Fabric renderer 버전과 일치한다', () => {
  const renderer = 코드만(파일소스(path.join(root, 'node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-dev.js')));
  const expected = renderer.match(/version:\s*"([^"]+)",\s*rendererPackageName:\s*"react-native-renderer"/);
  assert.ok(expected, 'renderer version must be inspectable');
  assert.equal(pkg('react').version, expected[1]);
  assert.equal(pkg('react-dom').version, expected[1]);
});

test('Expo Babel 기본 설정이 worklet 함수를 직렬화 코드로 변환한다', () => {
  const { transformSync } = require('@babel/core');
  const result = transformSync("export function step(v) { 'worklet'; return v + 1; }", {
    // 개발 sourcemap이 원본 파일을 읽으므로 실재하는 fixture인 이 파일을 사용한다.
    filename: __filename,
    babelrc: false, configFile: false,
    presets: [require.resolve('babel-preset-expo')],
    caller: { name: 'metro', platform: 'android', isDev: true },
  });
  assert.match(result.code, /__workletHash/);
  assert.match(result.code, /__closure/);
});

test('Skia upstream 수정으로 필요 없어진 로컬 패치를 다시 postinstall하지 않는다', () => {
  assert.doesNotMatch(manifest.scripts.postinstall, /스키아패치/);
  const video = 코드만(파일소스(path.join(root, 'node_modules/@shopify/react-native-skia/src/external/reanimated/useVideoLoading.ts')));
  assert.match(video, /const getRuntime = \(\) =>/);
  assert.match(video, /runOnRuntime\(getRuntime\(\)/);
});

test('DB가 아닌 빌드 도구의 xmldom도 수정된 patch 범위를 잠근다', () => {
  const xml = Object.entries(lock.packages).filter(([name]) => name.endsWith('/@xmldom/xmldom'));
  assert.ok(xml.length > 0);
  for (const [name, value] of xml) assert.ok(semver.satisfies(value.version, '^0.8.15 || >=0.9.12'), name);
});

test('관측의 익명화·네이티브/녹화/로그 금지는 Sentry 최신화 이후에도 유지된다', () => {
  const source = 코드만(파일소스(path.join(root, 'src/관측.js')));
  for (const option of ['sendDefaultPii', 'enableNative', 'autoInitializeNativeSdk', 'enableAutoSessionTracking', 'enableLogs', 'sendClientReports']) {
    assert.match(source, new RegExp(`${option}: false`));
  }
  assert.equal(typeof require('@sentry/browser').makeFetchTransport, 'function');
  assert.equal(pkg('@sentry/react-native').dependencies['@sentry/browser'], pkg('@sentry/browser').version);
});
