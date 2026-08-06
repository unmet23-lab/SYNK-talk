'use strict';
/**
 * 출시 가드 회귀 — 운영 배포는 CI가 자동 실행하지 못한다 (분업 §3 · 유호님 승인 전용).
 *
 * 원칙 (SYNK 공용 지침 「신뢰성」):
 *  - 탐지 능력은 **픽스처**로 못박고, 실워크플로에는 거짓양성 0만 검사한다.
 *  - 통과 목록(preview 빌드)도 차단 목록과 같은 무게로 검사한다 — 과잉 차단은 BYPASS 습관을 만든다.
 *  - 운영 배포 절차가 생기는 날에는 여기에 명시적 허용 경로를 추가하는 커밋과 함께 온다(docs/배포_경로.md).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// 운영으로 나가는 명령 — 사람이 실제로 쓰는 표기 변형까지 (--profile production · --profile=production · profile: production)
const FORBIDDEN = [
  { label: 'EAS production 빌드', re: /--profile[=\s]+production|profile:\s*production/ },
  { label: 'EAS 스토어 제출', re: /\beas\s+submit\b/ },
  { label: 'EAS OTA(eas update)', re: /\beas\s+update\b/ },
  { label: 'Supabase 마이그레이션', re: /\bsupabase\s+db\s+push\b/ },
  { label: 'Supabase Edge Fn 배포', re: /\bsupabase\s+functions\s+deploy\b/ },
];

const scan = (text) => FORBIDDEN.filter(({ re }) => re.test(text)).map(({ label }) => label);

// ── 탐지 능력 (픽스처) ─────────────────────────────────────────
test('출시가드: 운영 명령 표기 변형을 전부 잡는다', () => {
  const fixtures = [
    ['run: eas build --platform android --profile production --non-interactive', 'EAS production 빌드'],
    ['run: eas build --profile=production', 'EAS production 빌드'],
    ['          profile: production', 'EAS production 빌드'],
    ['run: eas submit -p android', 'EAS 스토어 제출'],
    ['run: eas update --channel production', 'EAS OTA(eas update)'],
    ['run: supabase db push', 'Supabase 마이그레이션'],
    ['run: supabase functions deploy ingest', 'Supabase Edge Fn 배포'],
  ];
  for (const [line, expected] of fixtures) {
    assert.ok(scan(line).includes(expected), `못 잡음: ${line}`);
  }
});

// ── 통과 목록 — preview·일상 명령은 열려 있어야 한다 ──────────
test('출시가드: preview 빌드·일반 명령은 통과', () => {
  const ok = [
    'run: eas build --platform android --profile preview --non-interactive',
    'channel: preview',
    'run: npm test',
    'run: npm run eval',
  ];
  for (const line of ok) assert.deepStrictEqual(scan(line), [], `과잉 차단: ${line}`);
});

/* ── EAS 프로젝트 링크 — CI 에서 여기로 옮겨 왔다 (2026-08-06) ──────────────
 * 원래 이 검사는 ci.yml `build` 잡 안에 살았는데, build 를 push 게이트에서 빼면서
 * **매 push 마다 돌던 것이 손으로 부를 때만 도는 것**이 될 뻔했다. 정적 파일 단언이라
 * 애초에 CI YAML 이 아니라 테스트의 몫이다 — 여기 있으면 로컬에서도 돈다.
 * projectId 가 사라지면 빌드는 「토큰이 잘못됐나」로 오독되는 낯선 오류로 죽는다. */
test('app.json 에 EAS projectId 가 있다 (없으면 빌드가 엉뚱한 원인으로 죽는다)', () => {
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  const id = app.expo && app.expo.extra && app.expo.extra.eas && app.expo.extra.eas.projectId;
  assert.ok(id, 'app.json 에 extra.eas.projectId 가 없다 — 이 앱이 EAS 프로젝트와 연결돼 있지 않다. ' +
    '토큰 문제가 아니다. 로컬에서 eas init 을 1회 돌려 나온 값을 커밋한다(docs/배포_경로.md)');
});

test('탐지력 픽스처 — projectId 가 빠지면 잡는다', () => {
  const 빠진판 = { expo: { extra: { eas: {} } } };
  const id = 빠진판.expo && 빠진판.expo.extra && 빠진판.expo.extra.eas && 빠진판.expo.extra.eas.projectId;
  assert.ok(!id, '추출기가 죽었다 — 그러면 위 검사는 무엇이든 통과시킨다');
});

/* ── `--no-wait` 부활 차단 (2026-08-06) ───────────────────────────────────
 * 붙어 있으면 이 잡은 **제출에 성공한 순간 초록**이 되고 진짜 빌드 실패는 Expo 화면에만
 * 남는다 — CI 가 영원히 초록이라 「9/1·1/25에 켜서 빨간 것을 수리한다」는 계획이 통째로
 * 성립하지 않는다. 실패가 **초록으로 보이는** 형태라 사람 눈으로는 영원히 안 잡힌다.
 * 무해해 보이는 플래그 하나가 눈을 감기므로 기계로 막는다. */
test('빌드 명령에 --no-wait 가 없다 (붙으면 CI 초록이 「제출됨」까지만 뜻한다)', () => {
  const dir = path.join(__dirname, '..', '.github', 'workflows');
  const 빌드줄 = fs.readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').map((l) => [f, l]))
    .filter(([, l]) => /^\s*(run:\s*)?eas build\b/.test(l));
  assert.ok(빌드줄.length > 0, 'eas build 줄을 못 찾았다 — 스캔 대상 소실은 통과가 아니다');
  const 걸린것 = 빌드줄.filter(([, l]) => /--no-wait\b/.test(l)).map(([f, l]) => `${f}: ${l.trim()}`);
  assert.deepStrictEqual(걸린것, [],
    `빌드가 결과를 안 기다린다: ${걸린것.join(' / ')}\n` +
    '  그러면 CI 초록 = 「제출됐다」뿐이고 빌드 실패는 CI 에 영원히 안 나타난다.\n' +
    '  손으로 부를 때만 도는 잡이라 기다려도 된다(ci.yml timeout-minutes 참조).');
});

test('탐지력 픽스처 — --no-wait 가 되살아나면 잡는다', () => {
  const 줄인식 = (l) => /^\s*(run:\s*)?eas build\b/.test(l);
  const 되살아난판 = '        run: eas build --platform android --profile preview --no-wait';
  const 정상판 = '        run: eas build --platform android --profile preview --non-interactive';
  assert.ok(줄인식(되살아난판) && 줄인식(정상판), '줄 인식이 죽었다 — 그러면 스캔 대상이 0이 된다');
  assert.ok(/--no-wait\b/.test(되살아난판), '추출기가 죽었다 — 그러면 위 검사는 무엇이든 통과시킨다');
  assert.ok(!/--no-wait\b/.test(정상판), '정상 명령을 위반으로 잡으면 거짓 경보가 된다(F103)');
});

// ── 실워크플로 — 운영 명령 0 (들어오는 날 여기가 빨개진다) ────
test('출시가드: .github/workflows 전체에 운영 배포 명령 0', () => {
  const dir = path.join(__dirname, '..', '.github', 'workflows');
  const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length > 0, '워크플로 파일이 없다 — 스캔 대상 소실은 통과가 아니다');
  for (const f of files) {
    const hits = scan(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.deepStrictEqual(
      hits, [],
      `${f}: 운영 배포는 CI 자동 실행 금지(분업 §3 · 유호님 승인 — 절차 docs/배포_경로.md) — ${hits.join(', ')}`
    );
  }
});
