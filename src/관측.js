/**
 * 관측 통로 — 기기 위에서 앱이 실제로 어떻게 죽는가를 남기는 자리 하나.
 *
 * ■ 왜 지금 짓나 (실유저가 0명인데)
 *   계기는 첫 사용자보다 **먼저** 서 있어야 첫날 데이터가 잡힌다. 개원 전 「학원 관계자만」
 *   출시가 첫 실사용이고, 그날 SDK 를 심으면 그날은 못 잰다. 그리고 유호님이 한국에 계셔서
 *   몽골 실유저 모집이 까다롭다 — 그래서 이 통로를 실제로 먹이는 것은 당분간 **합성 밟기**
 *   (`.maestro/`)다. 둘은 한 벌이다: 밟는 것이 없으면 여기 들어올 이벤트도 0이다.
 *
 * ■ 🔴 이 파일이 지키는 한 문장
 *   **DSN 이 없어서 안 도는 상태가 「켰다」의 얼굴을 하지 않게 한다.**
 *   관측 장치의 고전적 실패는 안 도는 쪽이 아니라 *안 도는데 돈다고 믿는 쪽*이다(지침 맹점 ④).
 *   그래서 여기서는 두 가지를 강제한다 — ①`관측상태()` 가 왜 안 켜졌는지를 낱말로 돌려준다
 *   ②`도착확인` 화면이 그 낱말을 그대로 보여준다(「내가 민 것이 여기 왔는가」를 보는 창).
 *
 * ■ 🔑 합성과 실사용을 **처음부터** 가른다
 *   Maestro 합성 학생이 미는 이벤트와 진짜 학생의 이벤트가 한 통에 섞이면, 실유저가 온 뒤
 *   크래시율·영향 사용자 수가 통째로 오염된다. **이 태그는 소급이 안 된다** — 나중에 붙이면
 *   그 전 이벤트는 영원히 구분 불가다. 그래서 첫 판에 심는다.
 *
 * ■ 대가 (틀릴 때의 모습)
 *   - DSN 을 넣었는데 네트워크가 막히면 Sentry 는 조용히 큐에 쌓고 버린다 — 「이벤트 0건」이
 *     «안 죽었다»로 읽힌다. 그래서 0건을 근거로 「안정적이다」라고 쓰지 않는다(분모 규칙).
 *   - 오류 원문 대신 종류·허용된 호출 위치·번들 줄번호만 보낸다. 원문 메시지·기기 정보가
 *     없으므로 상세 진단은 로컬 재현이 필요하다. 정제하지 못한 이벤트는 보내지 않는다.
 *   ▶ 닫을 것 1개: 없다. 이 통로는 새 층이고 대체하는 옛 통로가 없다(추가임을 밝힌다).
 */

/* 번들에 인라인되는 값들. Metro 는 `process.env.EXPO_PUBLIC_*` 을 빌드 시점에 문자열로
   갈아 끼우므로, 여기서 구조분해하지 않고 **통째로 적어야** 치환이 걸린다. */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
const 커밋 = process.env.EXPO_PUBLIC_COMMIT || '';
/* 합성 밟기(Maestro)가 세우는 빌드만 이 값을 갖는다 — `eas.json` 의 `합성밟기` 프로필이 박는다.
   🔑 이름이 ASCII 인 이유(2026-08-17 · F501): 이 값은 EAS 빌드 워커(리눅스)의 **환경변수**로
      들어온다 — 셸이 못 세우는 이름이면 번들에 «조용히 안 박히고», 그러면 합성 크래시가
      Sentry 에 실사용으로 쌓인다(소급으로 못 가른다 · tools/앱밟기.js 머리말 ②). */
const 합성 = process.env.EXPO_PUBLIC_SYNTHETIC_RUN === '1';

const 오류종류 = new Set([
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
  'URIError', 'EvalError', 'AggregateError', '인증오류',
]);
const 호출위치 = new Set(['error_boundary', 'game_enqueue']);
const 게임종류 = new Set(['G1', 'G2', 'G4']);
const 오류안내 = 'Application error (details omitted).';

/** 원본 URL·기기 경로·함수명·소스 문맥은 내보내지 않고, 알려진 번들의 위치만 남긴다. */
function 프레임정리(frame) {
  if (!frame || typeof frame !== 'object') return null;
  const 파일 = frame.filename;
  const 경로 = typeof 파일 === 'string' ? 파일 : '';
  const 이름 = /(?:^|\/)(index\.android\.bundle|index\.ios\.bundle|main\.jsbundle|main\.js|index\.js)(?:[?#].*)?$/.exec(경로);
  if (!이름) return null;
  const 결과 = { filename: `app:///${이름[1]}` };
  for (const 칸 of ['lineno', 'colno']) {
    const 값 = frame[칸];
    if (Number.isSafeInteger(값) && 값 > 0 && 값 < 100_000_000) 결과[칸] = 값;
  }
  const 앱내부 = frame.in_app;
  if (typeof 앱내부 === 'boolean') 결과.in_app = 앱내부;
  return 결과;
}

/**
 * 전송 허용목록. 알려진 필드만 새 객체에 옮겨 SDK가 새로 붙인 필드도 기본으로 제외한다.
 * 메시지·extra·breadcrumbs·request·user·contexts·tags의 임의 값·첨부는 보내지 않는다.
 */
export function 관측정리(event, hint) {
  try {
    if (!event || typeof event !== 'object') return null;
    const 유형 = event.type;
    if (유형 && 유형 !== 'error') return null;
    // 첨부는 event 밖의 봉투에도 실린다. 지우지 못하면 이벤트 전체를 버린다.
    if (hint) hint.attachments = [];
    const 심각도 = event.level;
    const 결과 = {
      platform: 'javascript',
      level: ['fatal', 'error', 'warning'].includes(심각도) ? 심각도 : 'error',
      tags: { origin: 합성 ? '합성밟기' : '실사용' },
    };
    const 식별자 = event.event_id;
    const 시각 = event.timestamp;
    if (typeof 식별자 === 'string' && /^[a-f0-9]{32}$/i.test(식별자)) 결과.event_id = 식별자;
    if (typeof 시각 === 'number' && Number.isFinite(시각)) 결과.timestamp = 시각;
    if (/^[a-f0-9]{7,40}$/i.test(커밋)) 결과.release = 커밋;
    const 맥락 = event.extra;
    // 최종 전송 단계에서 다시 정제해도 이미 허용한 태그는 유지한다.
    const 태그 = event.tags;
    const 위치 = (맥락 && 맥락.spot) || (태그 && 태그.spot);
    const 게임 = (맥락 && 맥락.game) || (태그 && 태그.game);
    if (호출위치.has(위치)) 결과.tags.spot = 위치;
    if (게임종류.has(게임)) 결과.tags.game = 게임;
    const 예외묶음 = event.exception;
    const 예외들 = 예외묶음 && 예외묶음.values;
    if (Array.isArray(예외들) && 예외들.length) {
      결과.exception = { values: 예외들.slice(0, 5).map((예외) => {
        const 종류 = 예외.type;
        const 정리 = { type: 오류종류.has(종류) ? 종류 : 'Error', value: 오류안내 };
        const 호출기록 = 예외.stacktrace;
        const frames = 호출기록 && 호출기록.frames;
        if (Array.isArray(frames)) {
          const 남음 = frames.slice(-64).map(프레임정리).filter(Boolean);
          if (남음.length) 정리.stacktrace = { frames: 남음 };
        }
        return 정리;
      }) };
    } else 결과.message = 오류안내;
    return 결과;
  } catch {
    return null;
  }
}

/** SDK 내부 예외는 beforeSend를 건너뛴다. 봉투 헤더와 첨부까지 마지막에 새로 만든다. */
export function 관측봉투정리(봉투, sdk판) {
  try {
    if (!Array.isArray(봉투) || 봉투.length !== 2) return null;
    const 항목들 = 봉투[1];
    if (!Array.isArray(항목들) || !항목들.length || 항목들.length > 64) return null;
    let 오류 = null;
    for (let i = 0; i < 항목들.length; i++) {
      const 항목 = 항목들[i];
      if (!Array.isArray(항목) || 항목.length !== 2) return null;
      // 미지원 항목은 본문을 읽지도 않는다. 첨부·세션·리플레이·로그·성능 자료를 모두 버린다.
      if (!항목[0] || 항목[0].type !== 'event') continue;
      if (오류) return null; // event_id 하나에 여러 오류를 섞은 비정상 봉투는 보내지 않는다.
      오류 = 관측정리(항목[1]);
      if (!오류) return null;
    }
    if (!오류) return null;
    // 원본 sdk/trace/DSN 헤더는 복사하지 않는다. 서버의 IP 추론 금지는 최종 봉투에도 남긴다.
    오류.sdk = {
      name: 'sentry.javascript.react-native',
      version: typeof sdk판 === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(sdk판) ? sdk판 : 'unknown',
      settings: { infer_ip: 'never' },
    };
    const 헤더 = { sent_at: new Date().toISOString() };
    if (오류.event_id) 헤더.event_id = 오류.event_id;
    return [헤더, [[{ type: 'event' }, 오류]]];
  } catch {
    return null;
  }
}

/** SDK의 공개 Transport(send/flush) 계약만 감싼다. SDK 큐·직렬화·전송 제한은 기존 전송기가 맡는다. */
export function 관측전송(옵션, 기본전송만들기, sdk판) {
  const 전송 = 기본전송만들기(옵션);
  let 전송진입중 = false;
  return {
    send(봉투) {
      // 정제 getter나 전송기 오류가 다시 관측을 부르더라도 재귀 전송으로 번지지 않는다.
      if (전송진입중) return Promise.resolve({});
      전송진입중 = true;
      try {
        const 정리 = 관측봉투정리(봉투, sdk판);
        if (!정리) return Promise.resolve({});
        return Promise.resolve(전송.send(정리)).catch(() => ({}));
      } catch {
        return Promise.resolve({});
      } finally {
        전송진입중 = false;
      }
    },
    flush(시한) {
      try { return Promise.resolve(전송.flush(시한)).then(Boolean, () => false); }
      catch { return Promise.resolve(false); }
    },
  };
}


let 켜짐 = false;
let 사유 = 'not_initialized';
let Sentry = null;

/** 지금 관측이 어떤 상태인지 — 화면·테스트가 읽는 유일한 창. */
export function 관측상태() {
  return {
    켜짐,
    사유,
    합성,
    /* DSN 자체는 절대 돌려주지 않는다(화면에 뜬다). 있는지만 말한다. */
    dsn있음: Boolean(DSN),
    커밋: 커밋 || null,
  };
}

/**
 * 앱이 뜰 때 한 번 부른다(`index.js`). **던지지 않는다** — 관측 장치가 앱을 죽이면
 * 그건 관측이 아니라 사고다. 실패는 `관측상태().사유` 로만 드러낸다.
 */
export function 관측세우기() {
  if (켜짐) return 관측상태();

  if (!DSN) {
    /* 가장 흔한 자리다. 「아직 계정을 안 만들었다」와 「환경변수를 빠뜨렸다」가 같은 모양이라
       사유를 낱말로 남긴다 — 도착확인 화면이 이걸 그대로 보여준다. */
    사유 = 'dsn_없음';
    return 관측상태();
  }

  try {
    /* 지연 require 다. DSN 이 없는 판(=테스트·개발 대부분)에서는 이 모듈을 **아예 안 연다** —
       `@sentry/react-native` 는 네이티브를 끌고 오므로 node 회귀에서 열면 그 자리가 깨진다.
       정적 import 로 두면 관측을 안 쓰는 테스트까지 전부 이 모듈을 물게 된다. */
    // eslint-disable-next-line global-require
    Sentry = require('@sentry/react-native');
    // enableNative:false일 때 RN SDK 자신이 쓰는 공식 Fetch 전송기. 별도 네트워크 구현을 만들지 않는다.
    const { makeFetchTransport } = require('@sentry/browser');

    Sentry.init({
      dsn: DSN,
      // 기본값에 기대지 않는다. 접속 자체의 서버 로그까지 제거한다는 뜻은 아니다.
      sendDefaultPii: false,
      release: /^[a-f0-9]{7,40}$/i.test(커밋) ? 커밋 : undefined,
      // JS beforeSend를 거치지 않는 네이티브·세션·성능·리플레이·로그 전송은 사용하지 않는다.
      enableNative: false,
      enableNativeCrashHandling: false,
      autoInitializeNativeSdk: false,
      enableAutoSessionTracking: false,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      enableLogs: false,
      sendClientReports: false,
      beforeBreadcrumb: () => null,
      beforeSendTransaction: () => null,
      beforeSendLog: () => null,
      beforeSend: 관측정리,
      transport: 옵션 => 관측전송(옵션, makeFetchTransport, Sentry.SDK_VERSION),
    });

    켜짐 = true;
    사유 = 'ok';
  } catch (e) {
    /* 네이티브 모듈이 없는 판(Expo Go·웹 미리보기)에서 여기로 온다. 앱은 그대로 산다. */
    사유 = `init_실패:${e && e.message ? e.message : '알수없음'}`;
    Sentry = null;
  }

  return 관측상태();
}

/**
 * 삼킨 예외를 손으로 올리는 자리. 앱 곳곳의 `catch {}` 가 조용히 먹는 것들 중
 * **올릴 값이 있는 것만** 여기로 보낸다(전부 보내면 잡음이 되어 아무도 안 본다).
 * 관측이 안 켜져 있으면 아무 일도 안 일어난다 — 부르는 쪽이 상태를 확인할 필요는 없다.
 */
export function 관측보고(오류, 맥락) {
  if (!켜짐 || !Sentry) return false;
  try {
    Sentry.captureException(오류, 맥락 ? { extra: 맥락 } : undefined);
    return true;
  } catch {
    return false;
  }
}
