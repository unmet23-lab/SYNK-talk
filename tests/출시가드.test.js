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
    'run: eas build --platform android --profile preview --non-interactive --no-wait',
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
