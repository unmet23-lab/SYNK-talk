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
 * ■ 경계 (README 재확인 08-24 — 1판의 두 오류를 여기서 잡았다):
 *   ① 파일 전사는 **Android 13+(API 33) · iOS 17+** 다 — 1판이 「iOS 전 버전」이라 적었던 것은
 *      틀렸다. 미달 기기는 `지원되나()` 가 막고, 호출자는 현행 클라우드 경로 그대로 간다.
 *   ② Android `audioEncoding` 은 **문자열이 아니라 상수**다(`AudioEncodingAndroid.ENCODING_PCM_16BIT`) —
 *      1판의 'pcm_s16le' 는 조용히 무시되거나 죽었을 자리다. 돌려보지 못한 코드는 이렇게 배신한다.
 *   ③ `requiresOnDeviceRecognition: true` 로 연다 — «오프라인·미반출» 주장은 이 플래그가 실물이다.
 *      Android 는 언어 모델을 먼저 내려받아야 한다(`오프라인모델준비()` — Wi-Fi 에서 1회) ·
 *      `getSupportedLocales()` 로 ko-KR 실재를 먼저 묻는다(`로케일확인()`).
 *   ④ 이 모듈은 **개발 빌드 전용**이다(Expo Go 에 네이티브 모듈이 없다). require 를 함수 안으로
 *      미뤄 — 모듈이 없는 환경에서 화면이 통째로 죽지 않게 한다.
 *
 * ■ 실기기 날 준비물 (그날 이 머리말만 보면 되게):
 *   1) `npm i expo-speech-recognition` + app.json plugins 에:
 *      ["expo-speech-recognition", { "microphonePermission": "말하기 숙제 녹음에 씁니다",
 *        "speechRecognitionPermission": "발음을 글자로 바꾸는 데 씁니다",
 *        "androidSpeechServicePackages": ["com.google.android.as", "com.google.android.tts"] }]
 *   2) `npx expo run:android` / `run:ios` (개발 빌드 재생성)
 *   3) Android 면 Wi-Fi 에서 `오프라인모델준비()` 1회 → `로케일확인()` 으로 ko-KR 확인
 *   4) 대본 30문장 = docs/전사대조_대본_v1.json · 표본틀 = `node tools/전사대조.js --뼈대`
 *
 * ■ 대조 절차: 같은 WAV 를 ①이 어댑터 ②기존 제출→whisper 로 전사 → 표본에 채워
 *   `node tools/전사대조.js 표본.json` 판정(≤5%p 규약 · 표본<30 은 참고 강등).
 */
'use strict';

import { Platform } from 'react-native';

/** 네이티브 패키지 — 지연 로드(경계 ④). 없으면 null: 호출자가 클라우드로 간다. */
function 꾸러미() {
  try {
    // eslint-disable-next-line global-require
    return require('expo-speech-recognition');
  } catch (_) {
    return null;
  }
}

/** 이 기기에서 파일 전사가 서나 — 경계 ①·④ 를 한 물음으로. */
export function 지원되나() {
  const p = 꾸러미();
  if (!p || !p.ExpoSpeechRecognitionModule) return { 지원: false, 왜: '네이티브 모듈 없음(개발 빌드 필요)' };
  if (Platform.OS === 'android' && Number(Platform.Version) < 33) {
    return { 지원: false, 왜: `Android API ${Platform.Version} — 파일 전사는 13(API 33)+` };
  }
  if (Platform.OS === 'ios' && parseFloat(String(Platform.Version)) < 17) {
    return { 지원: false, 왜: `iOS ${Platform.Version} — 파일 전사는 17+` };
  }
  return { 지원: true, 왜: null };
}

/** ko-KR 이 이 기기 인식기에 실재하나 — 실기기 날 첫 물음(경계 ③). */
export async function 로케일확인() {
  const p = 꾸러미();
  if (!p) return { 있음: false, 왜: '모듈 없음', 온디바이스목록: [] };
  const r = await p.getSupportedLocales({
    androidRecognitionServicePackage: Platform.OS === 'android' ? 'com.google.android.as' : undefined,
  });
  const 전체 = r?.locales ?? [];
  const 설치됨 = r?.installedLocales ?? [];
  const 잰다 = (xs) => xs.some((l) => String(l).toLowerCase().startsWith('ko'));
  return { 있음: 잰다(전체) || 잰다(설치됨), 왜: null, 온디바이스목록: 설치됨 };
}

/** Android 오프라인 한국어 모델 준비 — Wi-Fi 에서 1회. iOS 는 OS 가 알아서 진다. */
export async function 오프라인모델준비() {
  const p = 꾸러미();
  if (!p || Platform.OS !== 'android') return { 한: false, 왜: 'android 아님/모듈 없음' };
  await p.ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: 'ko-KR' });
  return { 한: true, 왜: null };
}

/**
 * WAV 파일 하나를 온디바이스로 전사한다.
 * @param {string} uri  녹음 파일 경로(우리 정본 16kHz·16bit·mono PCM WAV · file:// 붙은 경로)
 * @param {{제한ms?: number, 온디바이스강제?: boolean}} [opt]
 * @returns {Promise<{transcript: string, 소요ms: number, 엔진: string}>}
 *   실패는 reject — 호출자(대조 수집 화면)가 «클라우드로 폴백»할지 정한다. 여기서 삼키면
 *   「온디바이스가 빈 문자열을 냈다」와 「아예 못 돌았다」가 같은 모양이 된다(그 구분이 판정 재료다).
 */
export function 파일전사(uri, opt = {}) {
  const p = 꾸러미();
  const 지원 = 지원되나();
  if (!p || !지원.지원) return Promise.reject(new Error(`온디바이스 전사 불가 — ${지원.왜}`));
  const m = p.ExpoSpeechRecognitionModule;

  const 제한 = opt.제한ms ?? 30000;
  const 시작 = Date.now();

  return new Promise((resolve, reject) => {
    let 마지막 = '';
    let 끝남 = false;
    const 구독들 = [];
    const 걷기 = () => 구독들.forEach((s) => { try { s.remove(); } catch (_) { /* 이미 걷힘 */ } });
    const 맺기 = (값, 오류) => {
      if (끝남) return;
      끝남 = true; clearTimeout(시계); 걷기();
      if (오류) reject(오류); else resolve(값);
    };
    const 시계 = setTimeout(() => {
      const 죽어도끝 = 끝남;
      맺기(null, new Error(`온디바이스 전사 시간 초과(${제한}ms)`));
      if (!죽어도끝) { try { m.abort(); } catch (_) { /* 이미 닫힘 */ } }   // abort 의 'aborted' 오류는 끝남 가드가 삼킨다
    }, 제한);

    구독들.push(m.addListener('result', (e) => {
      const 글 = e?.results?.[0]?.transcript ?? '';
      if (글) 마지막 = 글;              // 파일 전사는 부분 결과가 여러 번 온다 — 마지막이 전체다
      if (e?.isFinal) 맺기({ transcript: 마지막, 소요ms: Date.now() - 시작, 엔진: `${Platform.OS}-ondevice` });
    }));
    /* isFinal 없이 end 만 오는 판(짧은 파일 대비) — 마지막 부분 결과로 맺는다.
     * nomatch(말을 못 알아들음)도 end 로 이어지므로 빈 transcript 로 맺힌다 — CER 100% 로 정직하게 든다. */
    구독들.push(m.addListener('end', () =>
      맺기({ transcript: 마지막, 소요ms: Date.now() - 시작, 엔진: `${Platform.OS}-ondevice` })));
    구독들.push(m.addListener('error', (e) =>
      맺기(null, new Error(`온디바이스 전사 실패 — ${e?.error ?? '?'}: ${e?.message ?? ''}`))));

    m.start({
      lang: 'ko-KR',
      interimResults: true,
      requiresOnDeviceRecognition: opt.온디바이스강제 ?? true,   // «미반출» 주장의 실물
      addsPunctuation: false,        // 대조 눈금(CER)이 부호를 지우므로 켤 이유가 없다
      audioSource: {
        uri,
        /* Android 전용 힌트 — 값은 녹음 정본(16kHz·16bit·mono)에서. iOS 는 무시한다.
         * ⚠audioEncoding 은 문자열이 아니라 **라이브러리 상수**다(경계 ② — 1판의 실수 자리). */
        audioEncoding: p.AudioEncodingAndroid?.ENCODING_PCM_16BIT,
        sampleRate: 16000,
        audioChannels: 1,
        // chunkDelayMillis 는 기본값(온디바이스 15ms)을 쓴다 — 네트워크 인식이 아니라 조일 이유가 없다
      },
    });
  });
}
