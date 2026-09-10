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

/** 실제 초기화·콜백을 실행하되 SDK 전송만 가짜로 바꾼다. 네트워크·학생 자료를 사용하지 않는다. */
function 가짜관측(환경 = {}, 전송만들기 = () => { throw new Error('전송기는 시험에서 명시적으로 주입한다'); }) {
  let 옵션;
  const 전송 = [];
  const sdk = {
    SDK_VERSION: require('@sentry/react-native/package.json').version,
    init(값) { 옵션 = 값; },
    captureException(오류, 맥락) {
      const result = 옵션.beforeSend({
        exception: { values: [{ type: 오류.name, value: 오류.message }] },
        extra: 맥락 && 맥락.extra,
      }, {});
      if (result) 전송.push(result);
    },
  };
  const 가짜경로 = path.join(ROOT, 'src', '__관측시험_sentry.js');
  const 전송경로 = path.join(ROOT, 'src', '__관측시험_browser.js');
  const 바꾼소스 = new Map([[관측경로,
    원문.replace("require('@sentry/react-native')", "require('./__관측시험_sentry.js')")
      .replace("require('@sentry/browser')", "require('./__관측시험_browser.js')")]]);
  const 모듈 = 세우기(관측경로, () => { throw new Error('합성 시험은 네트워크를 쓰지 않는다'); }, {
    캐시: new Map([[가짜경로, sdk], [전송경로, { makeFetchTransport: 전송만들기 }]]), 바꾼소스,
    환경: { EXPO_PUBLIC_SENTRY_DSN: 'https://synthetic@o0.ingest.sentry.io/0',
      EXPO_PUBLIC_COMMIT: 'a'.repeat(40), EXPO_PUBLIC_SYNTHETIC_RUN: '1', ...환경 },
  });
  모듈.관측세우기();
  return { 모듈, 옵션, 전송 };
}

/* 검사를 **함수로** 둔다 — 그래야 같은 검사를 가짜 소스에도 먹여 탐지력을 잴 수 있다.
   실저장소에서만 부르면 「검사가 죽었다」와 「위반이 없다」가 같은 초록이 된다. */
const 검사 = {
  PII차단: (s) => /sendDefaultPii\s*:\s*false/.test(s),
  /* 🔴 **키가 ASCII 여야 한다** — 옛 판은 `/출처\s*:/` 였고 내내 초록이었는데, 그 초록의 뜻은
     「소스에 그 낱말이 있다」였지 「Sentry 에 태그가 선다」가 아니었다(가드가 자기 주장의 자리를
     원리상 못 보는 무늬). 2026-08-26 실측: 같은 이벤트에 한글 키와 ASCII 키를 나란히 보내니
     **도착지에 ASCII 쪽만** 남았다 — 이벤트는 200 으로 통과하고 태그만 조용히 사라진다.
     그래서 이 검사는 이제 **키가 ASCII 인 것까지** 요구한다(값은 한글이어도 산다 · 같은 실측). */
  출처태그: (s) => /\borigin\s*:\s*합성\s*\?/.test(s),
};

test('① PII 기본 전송이 꺼져 있다 — 지우면 회귀가 잡는다', () => {
  assert.ok(검사.PII차단(코드), 'src/관측.js 에 sendDefaultPii: false 가 없다');
  /* 탐지력 — 그 줄을 뺀 소스는 반드시 빨개야 한다 */
  assert.equal(검사.PII차단(코드.replace(/sendDefaultPii\s*:\s*false/, 'sendDefaultPii: true')), false,
    '검사가 죽었다 — sendDefaultPii 를 true 로 바꿔도 통과한다');
});

test('② 자유서술·기기 경로·인증값을 모든 오류 위치에 넣어도 전송 결과에 남지 않는다', () => {
  const { 모듈, 옵션 } = 가짜관측();
  const 원문발화 = '합성 학생의 비공개 연습 문장입니다';
  const 이메일 = 'synthetic.learner@example.invalid';
  const 토큰 = 'synthetic-token-never-valid';
  const 음성경로 = 'file:///synthetic/learner-01/voice-only.wav';
  const 개인정보 = { 원문발화, 이메일, 토큰, 음성경로 };
  const event = {
    event_id: 'a'.repeat(32), timestamp: 1789060000, level: 'fatal',
    user: 개인정보, message: 원문발화, logentry: { formatted: 이메일 },
    request: { url: 음성경로, headers: { authorization: 토큰 }, data: 원문발화 },
    contexts: { device: 개인정보 }, tags: 개인정보,
    extra: { ...개인정보, spot: 'game_enqueue', game: 'G2', screen: 원문발화 },
    breadcrumbs: [{ category: 'console', message: 원문발화, data: 개인정보 }],
    threads: { values: [개인정보] }, debug_meta: 개인정보,
    transaction: 이메일, fingerprint: [원문발화], unknown_future_field: 개인정보,
    exception: { values: [{
      type: 'TypeError', value: `${원문발화} ${이메일} ${토큰}`, mechanism: { data: 개인정보 },
      stacktrace: { frames: [
        { filename: 음성경로, lineno: 8, vars: 개인정보 },
        { filename: `https://synthetic.invalid/index.android.bundle?token=${토큰}`,
          abs_path: 음성경로, function: 이메일, lineno: 120, colno: 4, in_app: true,
          vars: 개인정보, pre_context: [원문발화], context_line: 이메일 },
      ] },
    }] },
  };
  const hint = { attachments: [{ filename: 음성경로, data: 원문발화 }] };
  const result = 옵션.beforeSend(event, hint);
  assert.ok(result);
  const 출력 = JSON.stringify(result);
  for (const 값 of Object.values(개인정보)) assert.equal(출력.includes(값), false, '합성 민감값이 전송 결과에 남음');
  assert.equal(hint.attachments.length, 0, '첨부는 event 밖으로도 전송되므로 비워야 한다');
  assert.deepEqual(JSON.parse(출력), {
    platform: 'javascript', level: 'fatal',
    tags: { origin: '합성밟기', spot: 'game_enqueue', game: 'G2' },
    event_id: 'a'.repeat(32), timestamp: 1789060000, release: 'a'.repeat(40),
    exception: { values: [{ type: 'TypeError', value: 'Application error (details omitted).',
      stacktrace: { frames: [{ filename: 'app:///index.android.bundle', lineno: 120, colno: 4, in_app: true }] } }] },
  });
  assert.equal(event.user, 개인정보, '소비자가 가진 원본 객체는 수정하지 않는다');
  assert.equal(모듈.관측상태().켜짐, true);
});

test('③ 합성/실사용 출처 태그가 «ASCII 키»로 붙는다 — 소급이 안 되는 자리다', () => {
  assert.ok(검사.출처태그(코드), '이벤트에 origin 태그를 안 붙인다');
  assert.equal(검사.출처태그(코드.replace(/\borigin\s*:/g, '__없앰:')), false,
    '검사가 죽었다 — origin 태그를 빼도 통과한다');
  /* 🔑 탐지력 둘째 — **한글 키로 되돌리면 반드시 빨개야 한다.** 08-15~08-26 을 살아남은 그
     버그가 정확히 이 모양이었고(키만 한글), 옛 검사는 그것을 통과시켰다. */
  assert.equal(검사.출처태그(코드.replace(/\borigin\s*:/g, '출처:')), false,
    '검사가 죽었다 — 키를 한글로 되돌려도 통과한다(Sentry 는 비ASCII 태그 키를 조용히 버린다)');
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

test('최종 봉투는 허용된 오류 한 건만 남기고 헤더·첨부·로그·세션을 버린다', () => {
  const { 모듈 } = 가짜관측();
  let 첨부읽음 = 0;
  const 첨부 = [{ type: 'attachment', filename: 'SYNTHETIC_PRIVATE_ATTACHMENT' }, null];
  Object.defineProperty(첨부, 1, { get() { 첨부읽음++; throw new Error('본문을 읽으면 안 된다'); } });
  const event = {
    event_id: 'b'.repeat(32), extra: { spot: 'game_enqueue', game: 'G2' },
    message: 'SYNTHETIC_PRIVATE_BODY', user: { email: 'synthetic@example.invalid' },
    sdk: { name: 'SYNTHETIC_PRIVATE_SDK', settings: { infer_ip: 'auto' } },
  };
  event.cycle = event;
  const 결과 = 모듈.관측봉투정리([
    { trace: { transaction: 'SYNTHETIC_PRIVATE_HEADER' }, dsn: 'SYNTHETIC_PRIVATE_DSN' },
    [[{ type: 'event', filename: 'SYNTHETIC_PRIVATE_ITEM_HEADER' }, event], 첨부,
      [{ type: 'session' }, event], [{ type: 'log' }, event], [{ type: 'span' }, event]],
  ], '7.11.0');
  assert.ok(결과);
  assert.equal(첨부읽음, 0);
  assert.equal(JSON.stringify(결과).includes('SYNTHETIC_PRIVATE'), false);
  assert.equal(결과[1].length, 1);
  assert.deepEqual(Object.keys(결과[0]).sort(), ['event_id', 'sent_at']);
  assert.equal(결과[1][0][1].sdk.settings.infer_ip, 'never');
  assert.equal(결과[1][0][1].tags.spot, 'game_enqueue');
  const 두번째 = 모듈.관측봉투정리(결과, '7.11.0');
  assert.deepEqual(JSON.parse(JSON.stringify(두번째[1])), JSON.parse(JSON.stringify(결과[1])), '두 번째 정제도 허용된 태그를 유지해야 한다');
  for (const 유형 of ['attachment', 'session', 'sessions', 'replay_event', 'replay_recording', 'log', 'span', 'transaction', 'client_report', 'feedback']) {
    assert.equal(모듈.관측봉투정리([{}, [[{ type: 유형 }, event]]]), null);
  }
});

test('비정상·과대 봉투와 정제 예외는 전송하지 않고 재귀 호출도 끊는다', async () => {
  const { 모듈 } = 가짜관측();
  let 전송수 = 0;
  const 기본 = () => ({ send() { 전송수++; return Promise.resolve({}); }, flush() { return Promise.resolve(true); } });
  const 전송 = 모듈.관측전송({}, 기본, '7.11.0');
  const 정상 = [{ type: 'event' }, { message: 'synthetic' }];
  const 정제실패 = [{ type: 'event' }, { get type() { throw new Error('private'); } }];
  for (const 봉투 of [null, {}, [{}, []], [{}, Array(65).fill(정상)], [{}, [정상, 정상]], [{}, ['bad']], [{}, [정제실패]]]) {
    await 전송.send(봉투);
  }
  assert.equal(전송수, 0);
  await 전송.send([{}, [[{ type: 'event' }, { get type() { 전송.send([{}, [정상]]); return undefined; } }]]]);
  assert.equal(전송수, 1, '재진입한 호출은 외부로 나가면 안 된다');
  assert.equal(await 전송.flush(1), true);
  for (const 실패 of [() => { throw new Error('synthetic'); }, () => Promise.reject(new Error('synthetic'))]) {
    const 실패전송 = 모듈.관측전송({}, () => ({ send: 실패, flush: 실패 }), '7.11.0');
    assert.deepEqual(JSON.parse(JSON.stringify(await 실패전송.send([{}, [정상]]))), {});
    assert.equal(await 실패전송.flush(1), false);
  }
});

test('설치된 SDK 내부 오류의 beforeSend 우회를 실제 Fetch 직렬화 경계에서 정제한다', async () => {
  const { BrowserClient, makeFetchTransport } = require('@sentry/browser');
  const marker = 'SYNTHETIC_PRIVATE_PROCESSOR_MESSAGE';
  async function 실행(최종정제, 늦은첨부 = false) {
    const 요청본문 = [];
    let beforeSend수 = 0;
    const 전송만들기 = options => makeFetchTransport(options, async (_url, request) => {
      요청본문.push(String(request.body));
      return { status: 200, headers: { get: () => null } };
    });
    const { 옵션 } = 가짜관측({}, 전송만들기);
    const client = new BrowserClient({
      ...옵션, defaultIntegrations: [], integrations: [], stackParser: () => [],
      transport: 최종정제 ? 옵션.transport : 전송만들기,
      beforeSend(event, hint) { beforeSend수++; return 옵션.beforeSend(event, hint); },
    });
    client.init();
    if (늦은첨부) {
      client.on('beforeSendEvent', (event, hint) => {
        event.user = { email: marker };
        event.sdkProcessingMetadata = { dynamicSamplingContext: { transaction: marker } };
        hint.attachments = [{ filename: `${marker}.txt`, data: marker }];
      });
    } else {
      client.addEventProcessor((event, hint) => {
        if (!(hint.data && hint.data.__sentry__)) throw new Error(marker);
        return event;
      });
    }
    client.captureException(new Error('synthetic-original-error'));
    assert.equal(await client.flush(2000), true);
    assert.equal(요청본문.length, 1);
    await client.close(2000);
    return { beforeSend수, body: 요청본문[0] };
  }
  const 구경계 = await 실행(false);
  assert.equal(구경계.beforeSend수, 0, 'SDK 내부 오류는 beforeSend를 실제로 건너뛴다');
  assert.ok(구경계.body.includes(marker), '허용목록만 둔 구 경계에서 우회가 재현돼야 한다');
  for (const 늦은첨부 of [false, true]) {
    const 새경계 = await 실행(true, 늦은첨부);
    assert.equal(새경계.beforeSend수, 늦은첨부 ? 1 : 0);
    assert.equal(새경계.body.includes(marker), false);
    assert.equal(새경계.body.includes('synthetic-original-error'), false);
    const 줄 = 새경계.body.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(줄.length, 3, '최종 봉투에는 오류 한 건만 있고 첨부는 없어야 한다');
    assert.equal(줄[1].type, 'event');
    assert.equal(줄[2].sdk.settings.infer_ip, 'never');
    assert.equal(줄[2].exception.values[0].value, 'Application error (details omitted).');
    assert.deepEqual(Object.keys(줄[0]).sort(), ['event_id', 'sent_at']);
  }
});

test('⑨ beforeSend를 거치지 않는 전송 경로와 breadcrumb·첨부를 사용하지 않는다', () => {
  const { 옵션 } = 가짜관측();
  assert.equal(옵션.enableNative, false);
  assert.equal(옵션.enableNativeCrashHandling, false);
  assert.equal(옵션.autoInitializeNativeSdk, false);
  assert.equal(옵션.enableAutoSessionTracking, false);
  assert.equal(옵션.tracesSampleRate, 0);
  assert.equal(옵션.replaysSessionSampleRate, 0);
  assert.equal(옵션.replaysOnErrorSampleRate, 0);
  assert.equal(옵션.enableLogs, false);
  assert.equal(옵션.sendClientReports, false);
  const privateData = { message: '합성 발화', extra: { token: 'synthetic-token' } };
  assert.equal(옵션.beforeBreadcrumb(privateData), null);
  assert.equal(옵션.beforeSendTransaction(privateData), null);
  assert.equal(옵션.beforeSendLog(privateData), null);
});

test('⑩ 정제 오류·잠긴 첨부·오류 외 이벤트는 원본을 보내는 대신 버린다', () => {
  const { 옵션 } = 가짜관측();
  const broken = Object.defineProperty({}, 'exception', { get() { throw new Error('합성 원문'); } });
  assert.equal(옵션.beforeSend(broken, {}), null);
  assert.equal(옵션.beforeSend({ message: '합성 원문' }, Object.freeze({ attachments: ['synthetic-audio'] })), null);
  for (const event of [null, undefined, '합성 원문', { type: 'transaction' }, { type: 'replay_event' }]) {
    assert.equal(옵션.beforeSend(event, {}), null);
  }
});

test('⑪ 수동 오류 보고도 같은 정제를 거치며 허용되지 않은 값은 제거한다', () => {
  const { 모듈, 전송 } = 가짜관측({ EXPO_PUBLIC_SYNTHETIC_RUN: '0', EXPO_PUBLIC_COMMIT: 'synthetic@example.invalid' });
  const error = new Error('합성 학생 답안: synthetic@example.invalid');
  error.name = 'synthetic-sensitive-name';
  assert.equal(모듈.관측보고(error, { spot: 'error_boundary', game: 'synthetic-game', screen: '합성 학생 답안' }), true);
  assert.equal(전송.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(전송[0])), {
    platform: 'javascript', level: 'error', tags: { origin: '실사용', spot: 'error_boundary' },
    exception: { values: [{ type: 'Error', value: 'Application error (details omitted).' }] },
  });
});

test('⑫ 예상 밖 이름과 프레임 데이터는 제거하고 오류 크기를 제한한다', () => {
  const { 옵션 } = 가짜관측();
  const result = 옵션.beforeSend({
    extra: { spot: 'synthetic-private-value', game: 'synthetic-private-value' },
    exception: { values: Array.from({ length: 8 }, () => ({
      type: 'RangeError', value: '합성 원문',
      stacktrace: { frames: Array.from({ length: 90 }, () => ({
        filename: 'file:///synthetic/index.ios.bundle', lineno: 'synthetic-secret', colno: Infinity,
        function: 'synthetic-secret', vars: { token: 'synthetic-secret' },
      })) },
    })) },
  }, {});
  assert.equal(result.exception.values.length, 5);
  assert.equal(result.exception.values[0].stacktrace.frames.length, 64);
  assert.deepEqual(JSON.parse(JSON.stringify(result.exception.values[0].stacktrace.frames[0])), {
    filename: 'app:///index.ios.bundle',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.tags)), { origin: '합성밟기' });
});
