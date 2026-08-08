'use strict';
/**
 * 저장 어댑터 — 로그(JSONL)·음성 파일·로그인 세션을 기기에 남긴다.
 *
 * 네이티브: expo-file-system (문서 폴더 · 앱을 지우기 전까지 영구).
 * 웹: 파일시스템이 없다 → 메모리 폴백. **지속되지 않음을 숨기지 않는다** — 지속여부() 로 화면에 알린다.
 *   웹은 디자인 확인용이고 실사용은 APK 다(배포 경로 판정).
 *
 * 원본 음성은 지우지 않는다(설계 §3-2) — 이 모듈에 삭제 함수가 아예 없는 것은 의도다.
 * 🔑 세션만 예외로 지우는 함수가 있다 — 만료된 토큰은 자산이 아니라 쓰레기이고, 남겨 두면
 *   다음 실행이 매번 그것으로 갱신을 시도해 실패한다.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { 직렬화, 역직렬화 } from '../lib/제출로그.js';

const 웹 = Platform.OS === 'web';

let FS = null;
if (!웹) {
  // eslint-disable-next-line global-require
  FS = require('expo-file-system');
}

let 메모리로그 = [];

/** @returns {boolean} 이 기기에서 저장이 앱 종료 후에도 남는가 */
export function 지속저장() {
  return !웹;
}

export async function 로그읽기() {
  if (웹) return { 로그: 메모리로그, 깨진줄: 0 };
  try {
    const f = new FS.File(FS.Paths.document, 'talk_log.jsonl');
    if (!f.exists) return { 로그: [], 깨진줄: 0 };
    return 역직렬화(f.textSync());
  } catch (e) {
    // 읽기 실패를 빈 로그로 둔갑시키지 않는다 — 호출부가 오류를 화면에 띄운다
    throw new Error('기록을 읽지 못했어요: ' + (e && e.message));
  }
}

export async function 로그쓰기(로그) {
  if (웹) {
    메모리로그 = 로그;
    return;
  }
  const f = new FS.File(FS.Paths.document, 'talk_log.jsonl');
  f.write(직렬화(로그));
}

/**
 * 조립된 WAV 바이트를 기기에 쓴다(배선① — 앱이 컨테이너를 직접 만든다 · `lib/wav조립.js`).
 *
 * 🔑 옛 통로(`음성보관`)는 레코더의 임시 파일을 복사했다. PCM 스트림에는 임시 파일이 없다 —
 *   바이트가 곧 원본이라 여기가 그 원본이 **처음 디스크에 닿는 자리**다.
 *
 * @param {Uint8Array} 바이트
 * @param {string} 이름 예: 2026-08-03-따라-1.wav
 * @returns {Promise<string|null>} 파일 uri(웹은 null — 파일 지속 불가)
 */
export async function 음성쓰기(바이트, 이름) {
  if (웹) return null;
  const dir = new FS.Directory(FS.Paths.document, 'recordings');
  if (!dir.exists) dir.create();
  const f = new FS.File(dir, 이름);
  f.write(바이트);
  return f.uri;
}

/**
 * 파일 바이트 수 — `uploads/sign` 이 `byte_size` 를 요구한다(C0 §4-2).
 * 없거나 못 읽으면 `null`. 🔴 0 이나 추정값을 돌려주지 않는다 — 서명은 나오는데 올라간 것이
 * 다른 크기면, 그 어긋남은 아무 데도 안 남고 나중에 「업로드가 왜 실패하지」로만 보인다.
 */
export async function 음성크기(경로) {
  if (웹 || !경로) return null;
  try {
    const f = new FS.File(경로);
    return f.exists ? f.size ?? null : null;
  } catch {
    return null;
  }
}

/**
 * 서명 URL 로 파일을 **그대로** 올린다(PUT · C0 §4-2).
 * 🔑 `fetch` 에 바이트를 실어 보내지 않는다 — 25MB 상한짜리 녹음을 통째로 메모리에 올리면
 *   저가 안드로이드에서 그 순간 앱이 죽고, 증상은 「제출하면 꺼져요」가 된다.
 *   `File.upload` 는 네이티브가 스트리밍으로 보낸다(기본 `BINARY_CONTENT`).
 */
export async function 음성올리기(경로, url, content_type) {
  if (웹) throw new Error('이 기기에서는 녹음 파일을 올릴 수 없어요 — 앱에서 해주세요');
  const r = await new FS.File(경로).upload(url, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': content_type },
  });
  // 2xx 가 아니면 던진다 — `upload` 는 4xx·5xx 도 **정상 resolve** 한다(그게 이 API 의 규약이다).
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`업로드 실패 HTTP ${r.status} — ${String(r.body || '').slice(0, 120)}`);
  }
}

/* ── 로그인 세션 ──────────────────────────────────────────────────────────────
 * 🔴 **파일에 쓰지 않는다.** `talk_log.jsonl` 옆에 평문으로 두면 기기 백업·로그 수집에 딸려
 *   나가고, 토큰 하나면 그 학생의 쓰기 통로가 전부 열린다. 키체인(iOS)·키스토어(Android)에 둔다.
 * 🔑 저장하는 것은 **refresh_token 과 학생번호뿐**이다 — access_token 은 한 시간이면 죽어서
 *   다음 실행에 못 쓴다. 갱신하면 새로 온다(`인증API.갱신`). 학생번호를 함께 두는 것은
 *   토큰에 그 번호가 없기 때문이다(합성 이메일뿐 · 인증API 78행).
 * ⚠ 웹은 SecureStore 가 없다 — 저장하지 않는다. `지속저장()` 이 이미 그 사실을 말하고 있다. */
const 세션키 = 'synk_session_v1';

export async function 세션쓰기(세션) {
  if (웹 || !세션 || !세션.refresh_token) return;
  await SecureStore.setItemAsync(
    세션키,
    JSON.stringify({ refresh_token: 세션.refresh_token, 학생번호: 세션.학생번호 || '' }),
  );
}

/** @returns {Promise<{refresh_token:string,학생번호:string}|null>} 없거나 깨졌으면 null */
export async function 세션읽기() {
  if (웹) return null;
  const 글 = await SecureStore.getItemAsync(세션키);
  if (!글) return null;
  try {
    const s = JSON.parse(글);
    return s && s.refresh_token ? s : null;
  } catch {
    // 깨진 값은 없는 것과 같다 — 던지면 앱이 로그인 화면에도 못 닿는다
    return null;
  }
}

export async function 세션지우기() {
  if (웹) return;
  await SecureStore.deleteItemAsync(세션키);
}
