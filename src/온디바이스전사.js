/* 온디바이스 전사 어댑터 — 녹음된 WAV 파일을 «기기 안에서» 글자로 바꾼다 (정찰 S1).
 *
 * ■ 왜 (SYNK-appsscript docs/AI기능_정찰_2026-08.md · 유호 08-24 「정찰은 수용까지가 한 벌」):
 *   현행 전사는 클라우드(whisper-1 · supabase/functions/transcribe)다 — 건당 과금·회선 필요·
 *   원음성이 서버로 간다. 온디바이스가 이기면 셋 다 뒤집힌다(0원·오프라인·소리가 폰을 안 떠남).
 *   이기는지는 감이 아니라 `tools/전사대조.js`(한국어 CER · 열세 ≤5%p 규약)가 가른다 —
 *   이 파일은 그 대조의 «온디바이스 쪽 다리»다.
 *
 * ■ 규격 궁합 (실측 08-24): 우리 녹음 정본(lib/음성헤더.js) = 16kHz·16bit·mono PCM WAV.
 *   expo-speech-recognition 의 파일 전사(`audioSource`)가 **검증한 형식이 정확히 그것**이다 —
 *   변환 층이 0 이라는 뜻이고, 변환이 없으면 변환 버그도 없다.
 *
 * ■ 경계 셋 (넘겨짚지 않게 여기 못박는다):
 *   ① 파일 전사는 **Android 13+ · iOS 전 버전**이다 — 12 이하 Android 는 이 다리가 없다(호출자가
 *      `지원되나()` 로 먼저 묻고, 안 되면 현행 클라우드 경로 그대로 간다).
 *   ② `requiresOnDeviceRecognition: true` 로 연다 — «오프라인·미반출» 주장은 이 플래그가 실물이다.
 *      Android 는 언어 모델을 먼저 내려받아야 한다(`오프라인모델준비()` — Wi-Fi 에서 1회).
 *   ③ 이 모듈은 **개발 빌드 전용**이다(Expo Go 에 네이티브 모듈이 없다). 그래서 require 를
 *      함수 안으로 미뤄 — 모듈이 없는 환경에서 화면이 통째로 죽지 않게 한다.
 *
 * ■ 대조 절차(실기기 날): docs/전사대조_대본_v1.json 30문장 낭독 → 같은 WAV 를
 *   ①이 어댑터 ②기존 제출→whisper 로 전사 → tools/전사대조.js --뼈대 로 만든 표본에 채워 판정.
 */
'use strict';

import { Platform } from 'react-native';

/** 네이티브 모듈 — 지연 로드(경계 ③). 없으면 null 을 돌려주고 호출자가 클라우드로 간다. */
function 모듈() {
  try {
    // eslint-disable-next-line global-require
    return require('expo-speech-recognition').ExpoSpeechRecognitionModule;
  } catch (_) {
    return null;
  }
}

/** 이 기기에서 파일 전사가 서나 — 경계 ①·③ 을 한 물음으로. */
export function 지원되나() {
  if (!모듈()) return { 지원: false, 왜: '네이티브 모듈 없음(개발 빌드 필요)' };
  if (Platform.OS === 'android' && Number(Platform.Version) < 33) {
    return { 지원: false, 왜: `Android ${Platform.Version} — 파일 전사는 13(API 33)+` };
  }
  return { 지원: true, 왜: null };
}

/** Android 오프라인 한국어 모델 준비 — Wi-Fi 에서 1회. iOS 는 OS 가 알아서 진다. */
export async function 오프라인모델준비() {
  const m = 모듈();
  if (!m || Platform.OS !== 'android') return { 한: false, 왜: 'android 아님/모듈 없음' };
  await m.androidTriggerOfflineModelDownload({ locale: 'ko-KR' });
  return { 한: true, 왜: null };
}

/**
 * WAV 파일 하나를 온디바이스로 전사한다.
 * @param {string} uri  녹음 파일 경로(우리 정본 16kHz·16bit·mono PCM WAV)
 * @param {{제한ms?: number, 온디바이스강제?: boolean}} [opt]
 * @returns {Promise<{transcript: string, 소요ms: number, 엔진: string}>}
 *   실패는 reject — 호출자(대조 수집 화면)가 «클라우드로 폴백»할지 정한다. 여기서 삼키면
 *   「온디바이스가 빈 문자열을 냈다」와 「아예 못 돌았다」가 같은 모양이 된다(그 구분이 판정 재료다).
 */
export function 파일전사(uri, opt = {}) {
  const m = 모듈();
  const 지원 = 지원되나();
  if (!m || !지원.지원) return Promise.reject(new Error(`온디바이스 전사 불가 — ${지원.왜}`));

  const 제한 = opt.제한ms ?? 30000;
  const 시작 = Date.now();

  return new Promise((resolve, reject) => {
    let 마지막 = '';
    let 끝남 = false;
    const 구독들 = [];
    const 걷기 = () => 구독들.forEach((s) => { try { s.remove(); } catch (_) { /* 이미 걷힘 */ } });
    const 시계 = setTimeout(() => {
      if (끝남) return;
      끝남 = true; 걷기();
      try { m.abort(); } catch (_) { /* 이미 닫힘 */ }
      reject(new Error(`온디바이스 전사 시간 초과(${제한}ms)`));
    }, 제한);

    구독들.push(m.addListener('result', (e) => {
      const 글 = e?.results?.[0]?.transcript ?? '';
      if (글) 마지막 = 글;              // 파일 전사는 부분 결과가 여러 번 온다 — 마지막이 전체다
      if (e?.isFinal && !끝남) {
        끝남 = true; clearTimeout(시계); 걷기();
        resolve({ transcript: 마지막, 소요ms: Date.now() - 시작, 엔진: `${Platform.OS}-ondevice` });
      }
    }));
    구독들.push(m.addListener('end', () => {
      /* isFinal 없이 end 만 오는 판(짧은 파일 실측 대비) — 마지막 부분 결과로 맺는다. */
      if (끝남) return;
      끝남 = true; clearTimeout(시계); 걷기();
      resolve({ transcript: 마지막, 소요ms: Date.now() - 시작, 엔진: `${Platform.OS}-ondevice` });
    }));
    구독들.push(m.addListener('error', (e) => {
      if (끝남) return;
      끝남 = true; clearTimeout(시계); 걷기();
      reject(new Error(`온디바이스 전사 실패 — ${e?.error ?? '?'}: ${e?.message ?? ''}`));
    }));

    m.start({
      lang: 'ko-KR',
      interimResults: true,
      requiresOnDeviceRecognition: opt.온디바이스강제 ?? true,   // «미반출» 주장의 실물
      addsPunctuation: false,        // 대조 눈금(CER)이 부호를 지우므로 켤 이유가 없다
      audioSource: {
        uri,
        /* Android 전용 힌트 — 값은 녹음 정본에서(두 곳에 적으면 갈라진다). iOS 는 무시한다. */
        audioEncoding: 'pcm_s16le',
        sampleRate: 16000,
        audioChannels: 1,
      },
    });
  });
}
