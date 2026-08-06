'use strict';
/**
 * 앱 시작 통로 회귀 — `expo start` 를 직접 부르는 자리를 막는다.
 *
 * 🔴 **왜 생겼나 (F176)** — `expo start` 는 프로젝트 전체를 훑어 `.ts` 가 하나라도 있으면
 *   TypeScript 프로젝트로 판정하고 `typescript` 설치를 요구하며 죽는다. 이 저장소의 `.ts` 는
 *   앱 소스가 아닌 Deno Edge Function 7개인데, 그 스캔의 무시 목록은 @expo/cli 안에 박혀 있어
 *   넓힐 수 없다. 처방은 `EXPO_NO_TYPESCRIPT_SETUP=1` 이고 그 값을 저장소에 담을 수 있는 곳은
 *   **`tools/앱시작.js` 뿐**이다 — `.env` 는 `.gitignore` 가 영원히 막으므로(자격증명 규칙)
 *   거기 넣으면 새로 clone 하는 사람에게 안 간다.
 *
 * 🔑 **그래서 이 검사가 무엇을 지키나** — 통로는 하나여야 한다. 스크립트 하나가 `expo start`
 *   로 되돌아가면 그 스크립트만 조용히 옛 벽을 만난다(증상은 「내 컴퓨터에서만 안 됨」).
 *   `--android` 같은 새 스크립트가 나중에 추가될 때가 실제 위험이라, **네 이름을 열거하지 않고
 *   scripts 값 전부**를 본다(라우팅은 가드보다 넓어야 한다).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const 뿌리 = path.join(__dirname, '..');
const 시작기 = path.join('tools', '앱시작.js');

/**
 * 순수 판정 — 부르는 쪽이 파일을 읽는다(픽스처로 탐지력을 못박기 위해).
 * @param {object} pkg  package.json 파싱 결과
 * @param {string} 시작기소스  tools/앱시작.js 원문
 * @returns {string[]} 위반 목록. 빈 배열이면 통과.
 */
function 검사(pkg, 시작기소스) {
  const 위반 = [];
  for (const [이름, 명령] of Object.entries((pkg && pkg.scripts) || {})) {
    if (/(^|[^\w-])(npx\s+)?expo\s+start\b/.test(명령)) {
      위반.push(`scripts.${이름} 이 expo start 를 직접 부른다 — ${시작기} 를 거쳐야 한다`);
    }
  }
  if (!/EXPO_NO_TYPESCRIPT_SETUP\s*=\s*['"]?1/.test(시작기소스)) {
    위반.push(`${시작기} 가 EXPO_NO_TYPESCRIPT_SETUP 를 세우지 않는다 — 통로가 빈 껍데기다`);
  }
  if (!/require\(['"]expo\/bin\/cli['"]\)/.test(시작기소스)) {
    위반.push(`${시작기} 가 expo CLI 로 넘기지 않는다 — 앱이 아예 안 뜬다`);
  }
  return 위반;
}

// ── 실저장소: 거짓양성만 본다(탐지력은 아래 픽스처가 진다) ──
test('실저장소 — 앱 시작 통로가 하나이고 그 통로가 판정을 끈다', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(뿌리, 'package.json'), 'utf8'));
  const 소스 = fs.readFileSync(path.join(뿌리, 시작기), 'utf8');
  assert.deepEqual(검사(pkg, 소스), [], '실저장소 위반');
});

test('실저장소 — 앱 스캔이 훑는 .ts 가 실제로 supabase/ 아래에만 있다', () => {
  /* 전제가 바뀌면(앱에 진짜 TS 가 들어오면) 처방 자체를 다시 판정해야 한다. */
  const 앱소스 = ['src', 'lib', 'contents']
    .flatMap((d) => fs.readdirSync(path.join(뿌리, d), { recursive: true }))
    .filter((f) => typeof f === 'string' && /\.tsx?$/.test(f));
  assert.deepEqual(앱소스, [], '앱 소스에 TS 가 생겼다 — EXPO_NO_TYPESCRIPT_SETUP 처방을 재판정할 것');
});

// ── 픽스처: 탐지력을 여기서 못박는다(양방향) ──
const 온전한시작기 = "process.env.EXPO_NO_TYPESCRIPT_SETUP = '1';\nrequire('expo/bin/cli');";

test('픽스처 — expo start 로 되돌아간 스크립트를 잡는다', () => {
  for (const 명령 of ['expo start', 'expo start --web', 'npx expo start --port 8099']) {
    const 결과 = 검사({ scripts: { web: 명령 } }, 온전한시작기);
    assert.equal(결과.length, 1, `못 잡았다: ${명령}`);
    assert.match(결과[0], /scripts\.web/);
  }
});

test('픽스처 — 나중에 추가된 이름도 본다(열거가 아니라 전수)', () => {
  const 결과 = 검사({ scripts: { start: `node ${시작기} start`, 실험: 'expo start --dev-client' } }, 온전한시작기);
  assert.equal(결과.length, 1);
  assert.match(결과[0], /scripts\.실험/);
});

test('픽스처 — 통로가 빈 껍데기가 되면 잡는다', () => {
  const 온전한pkg = { scripts: { start: `node ${시작기} start` } };
  assert.match(검사(온전한pkg, "require('expo/bin/cli');")[0], /EXPO_NO_TYPESCRIPT_SETUP/);
  assert.match(검사(온전한pkg, "process.env.EXPO_NO_TYPESCRIPT_SETUP = '1';")[0], /expo CLI 로 넘기지/);
});

test('픽스처 — 거짓양성: 통로를 거치는 스크립트와 무관한 스크립트는 통과', () => {
  const pkg = {
    scripts: {
      start: `node ${시작기} start`,
      web: `node ${시작기} start --web`,
      test: 'node --test',
      guard: 'node tools/precommit.js',
      배포: 'node tools/원격배포.js supabase/functions/tasks --적용',
    },
  };
  assert.deepEqual(검사(pkg, 온전한시작기), []);
});
