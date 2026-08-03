'use strict';
/**
 * 저장 어댑터 — 로그(JSONL)와 음성 파일을 기기에 남긴다.
 *
 * 네이티브: expo-file-system (문서 폴더 · 앱을 지우기 전까지 영구).
 * 웹: 파일시스템이 없다 → 메모리 폴백. **지속되지 않음을 숨기지 않는다** — 지속여부() 로 화면에 알린다.
 *   웹은 디자인 확인용이고 실사용은 APK 다(배포 경로 판정).
 *
 * 원본 음성은 지우지 않는다(설계 §3-2) — 이 모듈에 삭제 함수가 아예 없는 것은 의도다.
 */
import { Platform } from 'react-native';
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
    throw new Error('로그 읽기 실패: ' + (e && e.message));
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
 * 녹음 임시 파일을 영구 위치로 옮긴다.
 * @param {string} uri 레코더가 준 임시 uri
 * @param {string} 이름 예: 2026-08-03-따라-1.m4a
 * @returns {Promise<string|null>} 영구 경로(웹은 null — 파일 지속 불가)
 */
export async function 음성보관(uri, 이름) {
  if (웹) return null;
  const dir = new FS.Directory(FS.Paths.document, 'recordings');
  if (!dir.exists) dir.create();
  const src = new FS.File(uri);
  const dst = new FS.File(dir, 이름);
  src.copy(dst); // move 가 아니라 copy — 레코더의 임시 파일 수명은 레코더에게 맡긴다
  return dst.uri;
}
