'use strict';
/**
 * 관측 통로 회귀 — **조용히 틀리는 자리**만 잰다.
 *
 * ■ 🔴 이 파일이 지키는 두 문장
 *   ① 관측이 앱을 죽이지 않는다. DSN 이 없든, 네이티브 모듈이 없든, 던지면 안 된다 —
 *      관측 장치가 앱을 떨어뜨리면 그건 관측이 아니라 사고다.
 *   ② **PII 차단이 사라지는 것을 사람 눈으로는 못 잡는다.** `sendDefaultPii: false` 한 줄이
 *      지워져도 앱은 똑같이 돌고 화면도 똑같고 테스트도 (이 파일이 없으면) 전부 초록이다.
 *      달라지는 것은 Sentry 서버에 쌓이는 것뿐이라 **기기 위에서는 영원히 안 보인다.**
 *
 * ■ 탐지력은 픽스처가 진다 (지침 신뢰성 ②)
 *   실저장소에서 「있다」만 확인하면 검사가 죽어도 초록이다. 그래서 각 검사마다 **그 줄을 뺀
 *   가짜 소스**를 같이 먹여 빨개지는지 본다. 실저장소 쪽은 거짓양성만 검사한다.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 코드만 } = require('./lib/소스검사.js');
const { 세우기 } = require('./lib/앱모듈세우기.js');

const ROOT = path.join(__dirname, '..');
const 관측경로 = path.join(ROOT, 'src', '관측.js');
const 원문 = fs.readFileSync(관측경로, 'utf8');
const 코드 = 코드만(원문);

/* 검사를 **함수로** 둔다 — 그래야 같은 검사를 가짜 소스에도 먹여 탐지력을 잴 수 있다.
   실저장소에서만 부르면 「검사가 죽었다」와 「위반이 없다」가 같은 초록이 된다. */
const 검사 = {
  PII차단: (s) => /sendDefaultPii\s*:\s*false/.test(s),
  사용자삭제: (s) => /delete\s+event\.user/.test(s),
  출처태그: (s) => /출처\s*:/.test(s),
};

test('① PII 기본 전송이 꺼져 있다 — 지우면 회귀가 잡는다', () => {
  assert.ok(검사.PII차단(코드), 'src/관측.js 에 sendDefaultPii: false 가 없다');
  /* 탐지력 — 그 줄을 뺀 소스는 반드시 빨개야 한다 */
  assert.equal(검사.PII차단(코드.replace(/sendDefaultPii\s*:\s*false/, 'sendDefaultPii: true')), false,
    '검사가 죽었다 — sendDefaultPii 를 true 로 바꿔도 통과한다');
});

test('② 나가기 직전 user 블록을 지운다 — 지우면 회귀가 잡는다', () => {
  assert.ok(검사.사용자삭제(코드), 'beforeSend 에서 event.user 를 안 지운다');
  assert.equal(검사.사용자삭제(코드.replace(/delete\s+event\.user;?/, '')), false,
    '검사가 죽었다 — delete event.user 를 빼도 통과한다');
});

test('③ 합성/실사용 출처 태그가 붙는다 — 소급이 안 되는 자리다', () => {
  assert.ok(검사.출처태그(코드), '이벤트에 출처 태그를 안 붙인다');
  assert.equal(검사.출처태그(코드.replace(/출처\s*:/g, '__없앰:')), false,
    '검사가 죽었다 — 출처 태그를 빼도 통과한다');
});

test('④ DSN 이 없으면 조용히 꺼지되, «왜» 꺼졌는지를 낱말로 남긴다', () => {
  const m = 세우기(관측경로, () => {
    throw new Error('관측 세우기는 네트워크를 쓰지 않는다');
  }, { 환경: {} });

  const 처음 = m.관측상태();
  assert.equal(처음.켜짐, false);
  assert.equal(처음.사유, 'not_initialized', '부르기 전 상태가 「안 부름」이어야 한다');

  const 뒤 = m.관측세우기(); // 던지면 이 줄에서 죽는다 — 그게 이 검사의 본체다
  assert.equal(뒤.켜짐, false);
  assert.equal(뒤.사유, 'dsn_없음', 'DSN 이 없을 때 사유가 낱말로 서야 한다');
  assert.equal(뒤.dsn있음, false);
});

test('⑤ 꺼진 채로 관측보고를 불러도 던지지 않는다 — 부르는 쪽이 상태를 몰라도 된다', () => {
  const m = 세우기(관측경로, () => {
    throw new Error('네트워크 없음');
  }, { 환경: {} });
  m.관측세우기();
  assert.equal(m.관측보고(new Error('아무거나')), false);
  assert.equal(m.관측보고(new Error('맥락도'), { 어디: '테스트' }), false);
});

test('⑥ DSN 이 있어도 네이티브가 없는 판에서 앱을 죽이지 않는다', () => {
  const m = 세우기(관측경로, () => {
    throw new Error('네트워크 없음');
  }, { 환경: { EXPO_PUBLIC_SENTRY_DSN: 'https://x@o0.ingest.sentry.io/0' } });

  /* node 에는 react-native 네이티브가 없다 — `init` 이 죽든 살든 **던지지만 않으면** 된다.
     여기서 죽는 쪽이 실제 기기에서는 정상 경로이므로 결과값을 못박지 않는다. */
  const 상태 = m.관측세우기();
  assert.equal(상태.dsn있음, true);
  assert.equal(typeof 상태.사유, 'string');
  assert.ok(상태.켜짐 === true || 상태.사유.startsWith('init_실패'),
    `켜지거나 사유가 남아야 한다 — 받은 값: ${상태.사유}`);
});

test('⑦ index.js 가 앱보다 «먼저» 관측을 세운다', () => {
  const idx = 코드만(fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8'));
  assert.ok(/관측세우기\s*\(\s*\)/.test(idx), 'index.js 가 관측세우기() 를 안 부른다');
  /* 순서가 급소다 — 뜨는 도중(폰트·키체인)에 죽는 사고가 가장 위험한데
     registerRootComponent 뒤에 세우면 그 구간이 통째로 사각지대가 된다. */
  assert.ok(idx.indexOf('관측세우기()') < idx.indexOf('registerRootComponent(App)'),
    '관측세우기() 가 registerRootComponent 뒤에 있다 — 부팅 구간이 사각지대가 된다');
});

test('⑧ 도착확인 화면이 관측 상태를 그린다 — 「켰다고 믿는 상태」를 기기에서 가른다', () => {
  const 화면 = 코드만(fs.readFileSync(path.join(ROOT, 'src', '도착확인.js'), 'utf8'));
  assert.ok(/관측상태\s*\(\s*\)/.test(화면), '도착확인이 관측상태() 를 안 읽는다');
  /* DSN 자체를 그리면 유출이다 — 그 자리를 막아 둔다 */
  assert.equal(/EXPO_PUBLIC_SENTRY_DSN/.test(화면), false,
    '도착확인 화면이 DSN 값에 직접 손을 댄다 — 화면에 뜨면 그게 유출이다');
});
