'use strict';
/**
 * 저장 어댑터 — 로그(JSONL)·음성 파일·로그인 세션을 기기에 남긴다.
 *
 * 네이티브: expo-file-system (문서 폴더 · 앱을 지우기 전까지 영구).
 * 웹: 파일시스템이 없다 → 메모리 폴백. **지속되지 않음을 숨기지 않는다** — 지속여부() 로 화면에 알린다.
 *   웹은 디자인 확인용이고 실사용은 APK 다(배포 경로 판정).
 *
 * 원본 음성은 지우지 않는다(설계 §3-2) — **지우는 함수는 「학생 귀속」에만 있다**(`기기비우기`).
 * 🔑 세션이 첫 예외였다 — 만료된 토큰은 자산이 아니라 쓰레기이고, 남겨 두면 다음 실행이
 *   매번 그것으로 갱신을 시도해 실패한다. 로그아웃이 그 예외를 세 칸으로 넓혔다(맨 아래).
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { 직렬화, 역직렬화, 밀린것 } from '../lib/제출로그.js';
import { 세션남기기세움, 세션잊기 } from './인증API.js';

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

/* ── 교정 사건 로그 ───────────────────────────────────────────────────────────
 * 🔴 **제출 로그와 같은 파일에 섞지 않는다**(`lib/교정로그.js` 머리말) — `학습출석`·`배달상태`
 *   가 `talk_log.jsonl` 의 모든 항목을 발화로 세므로, 교정 열람 한 건이 제출 수를 늘린다.
 * 🔑 직렬화는 같은 것을 쓴다(JSONL · 한 줄 한 항목) — 파일이 중간에 깨져도 앞 줄들은 산다. */
let 메모리교정로그 = [];

export async function 교정로그읽기() {
  if (웹) return { 로그: 메모리교정로그, 깨진줄: 0 };
  try {
    const f = new FS.File(FS.Paths.document, 'correction_log.jsonl');
    if (!f.exists) return { 로그: [], 깨진줄: 0 };
    return 역직렬화(f.textSync());
  } catch (e) {
    // 읽기 실패를 빈 로그로 둔갑시키지 않는다 — 빈 로그로 보면 이미 본 교정을 다시 「처음」으로
    // 취급해 열람 사건이 두 벌 나간다(그게 이 로그가 막는 것이다).
    throw new Error('교정 기록을 읽지 못했어요: ' + (e && e.message));
  }
}

export async function 교정로그쓰기(로그) {
  if (웹) {
    메모리교정로그 = 로그;
    return;
  }
  const f = new FS.File(FS.Paths.document, 'correction_log.jsonl');
  f.write(직렬화(로그));
}

/* ── 게임 사건 로그 (G1 · `lib/게임로그.js`) ─────────────────────────────────
 * 🔴 제출 로그와 같은 파일에 섞지 않는다 — `학습출석`·`배달상태` 가 `talk_log.jsonl` 의 모든
 *   항목을 발화로 세므로, 메일 한 통이 발화 수를 늘린다(교정 로그와 같은 이유·같은 형태). */
let 메모리게임로그 = [];

export async function 게임로그읽기() {
  if (웹) return { 로그: 메모리게임로그, 깨진줄: 0 };
  try {
    const f = new FS.File(FS.Paths.document, 'game_log.jsonl');
    if (!f.exists) return { 로그: [], 깨진줄: 0 };
    return 역직렬화(f.textSync());
  } catch (e) {
    // 읽기 실패를 빈 로그로 둔갑시키지 않는다 — 빈 로그로 보면 같은 앉음의 사건이 두 벌 나간다
    throw new Error('게임 기록을 읽지 못했어요: ' + (e && e.message));
  }
}

export async function 게임로그쓰기(로그) {
  if (웹) {
    메모리게임로그 = 로그;
    return;
  }
  const f = new FS.File(FS.Paths.document, 'game_log.jsonl');
  f.write(직렬화(로그));
}

/* ── 마스코트 발화 기록 (강사판 ㉮ 상한의 기억층 · lib/마스코트강사말) ─────────
 * 🔴 **큐가 아니다** — 서버로 나가는 것이 0이라 `못보낸수` 에 안 더한다(더하면 마스코트
 *   기억이 「나갈 수 없어요」 게이트를 잠근다). 모양도 로그가 아니라 «키 → 말한 날» 지도다.
 * 🔑 깨진 기록은 빈 것으로 접는다 — 로그들과 반대 방향인 이유: 여기의 최악은 「같은 말을
 *   한 번 더」지 사건 이중 전송이 아니다. 던지면 마스코트 때문에 화면이 죽는다(보조 원칙 ③:
 *   마스코트의 실패 모드는 조용함이지 오류 화면이 아니다). */
let 메모리마스코트기록 = {};

export async function 마스코트기록읽기() {
  if (웹) return 메모리마스코트기록;
  try {
    const f = new FS.File(FS.Paths.document, 'mascot_said.json');
    if (!f.exists) return {};
    const 값 = JSON.parse(f.textSync());
    return 값 && typeof 값 === 'object' && !Array.isArray(값) ? 값 : {};
  } catch {
    return {};
  }
}

export async function 마스코트기록쓰기(기록) {
  if (웹) {
    메모리마스코트기록 = 기록 || {};
    return;
  }
  try {
    const f = new FS.File(FS.Paths.document, 'mascot_said.json');
    f.write(JSON.stringify(기록 || {}));
  } catch {
    /* 못 쓰면 다음에 같은 말이 한 번 더 나올 뿐이다 — 마스코트가 화면을 죽이지 않는다 */
  }
}

/**
 * 아직 서버에 닿지 않은 것의 수 — **모든 큐를 합산한다**(나가기 게이트의 유일한 근거 · B1).
 *
 * 🔴 한 큐만 세면 나머지 큐의 미전송분이 「보낸 것은 서버에 그대로 있어요」로 읽히고
 *   `기기비우기` 가 지운다 — 그 소실은 소급이 없다. 새 큐 파일이 생기면 **여기에 더하는 것**이
 *   그 큐의 착수 조건이다(게이트가 모르는 큐는 전부 그 사고 모양이다).
 *   ↳ 교정 큐 합류(08-31).
 * 🔴 못 읽으면 던진다 — 「모른다」를 0 으로 접는 짐작의 대가가 발화 소멸이다(도착확인이 받아
 *   「나갈 수 없어요」로 세운다).
 */
export async function 못보낸수() {
  const 제출 = await 로그읽기();
  const 게임 = await 게임로그읽기();
  const 교정 = await 교정로그읽기();
  return 밀린것(제출.로그).length + 밀린것(게임.로그).length + 밀린것(교정.로그).length;
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

/* 🔑 **갱신이 회전시킨 refresh_token 을 남기는 손을 여기서 건다**(C0 §7 왕복 6-⑥).
 *   만료 갱신은 `인증API` 안에서 나는데 그 파일은 키체인을 모른다 — 알게 하면 react-native 가
 *   통로 사슬에 들어와 `tests/사건통로.test.js` 가 원리상 못 돈다(`src/사건통로.js` 머리말).
 * ⚠ **이 한 줄이 등록층이다.** 빠지면 갱신은 되는데 다음 실행이 이미 쓴 토큰으로 시작하고,
 *   증상은 「가끔 로그인이 풀린다」뿐이다 — 새는 방향이 「통과」라 `tests/기기비우기.test.js`
 *   가 이 줄의 존재를 기계로 잰다. */
세션남기기세움(세션쓰기);

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

/**
 * 이 기기에서 **한 학생에게 귀속된 상태를 전부** 지운다 — 로그아웃의 실체.
 *
 * 🔴 **셋을 한 함수 안에 둔 것이 요건이다.** 호출부가 나열하면 넷째가 생기는 날 조용히 새고,
 *   새는 방향은 언제나 「나간 것처럼 보인다」다. 하나씩 남았을 때 각각 이렇게 샌다:
 *   · 세션      — 다음 학생이 **앞 학생으로 로그인된 채** 시작한다.
 *   · 제출 로그 — `밀린것` 재전송이 앞 학생의 발화를 **다음 학생 토큰으로** 올린다. 서버는
 *                 본문이 아니라 **토큰에서** learner_id 를 정하므로(`functions/events` ①)
 *                 그 행은 남의 것이 되고, `learning_events` 는 append-only 라 **소급 복구가
 *                 없다.** 학습자 모델이 두 사람을 한 사람으로 배운다.
 *                 곁들여 `학습출석`·`다음시도번호` 도 앞 학생의 오늘을 다음 학생의 오늘로 읽는다.
 *   · 교정 로그 — 「이미 본 교정」으로 읽혀 다음 학생의 `correction.viewed` 가 **안 나간다**
 *                 (열람은 그날에만 존재하는 관측이라 이것도 소급 불가다).
 * 🔑 **순서가 규약이다** — 세션을 마지막에 지운다. 먼저 지우면 앞이 실패했을 때 로그가 남은
 *   채로 로그아웃이 끝나고, 그게 바로 위에서 막으려던 그 상태다.
 * 🔑 **음성 원본은 안 지운다**(위 머리말) — 파일명이 uuid 라 학생끼리 섞이지 않고, 로그가
 *   사라지면 참조도 함께 끊긴다. 지우는 것은 «귀속»이지 «증거»가 아니다.
 */
export async function 기기비우기() {
  await 로그쓰기([]);
  await 교정로그쓰기([]);
  /* 게임 로그도 귀속이다 — 남기면 다음 학생의 G1 화면이 앞 학생의 「이미 보냈다」를 읽고,
   * `밀린것` 재전송이 앞 학생의 메일을 다음 학생 토큰으로 올린다(제출 로그와 같은 사고). */
  await 게임로그쓰기([]);
  /* 마스코트 발화 기록도 귀속이다 — 남기면 다음 사람이 첫 안내(T10)를 영영 못 받는다.
   * 서버로 나가는 것이 없어 소실 축은 없다(위 머리말 「큐가 아니다」). */
  await 마스코트기록쓰기({});
  await 세션지우기();
  /* 🔴 **키체인만 지우면 절반이다** — 만료 갱신이 세션을 메모리에도 쥐고 있고(`인증API`),
   *   안 비우면 다음 학생의 첫 401 이 **앞 학생의 refresh_token 으로** 되살아난다. 그 뒤 발화는
   *   앞 학생 `learner_id` 로 저장되고 `learning_events` 는 append-only 라 소급 복구가 없다 —
   *   이 함수가 막으려던 바로 그 상태가 새 통로로 되돌아오는 자리다. */
  세션잊기();
}
