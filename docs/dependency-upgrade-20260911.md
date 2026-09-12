# 의존성 최신화 결과 — 2026-09-11 기준

확인 시각: 2026-09-12T13:04:26.491Z. 기준은 2026-09-11 KST 하루 끝, 즉 `2026-09-11T15:00:00.000Z` 미만의 npm 배포다. prerelease·deprecated·배포일 불명은 후보에서 제외했다. 설치와 로컬 회귀 검증 결과이며 실기기/스토어/배포 검증 완료가 아니다.

## 실제 선택

| 패키지 | 설치·잠금 버전 | 기준일 최고 정식 버전 | 차이가 나는 이유 |
|---|---|---|---|
| [@sentry/react-native](https://registry.npmjs.org/%40sentry%2Freact-native) | 8.26.0 | 8.26.0 | 같음 |
| [@shopify/react-native-skia](https://registry.npmjs.org/%40shopify%2Freact-native-skia) | 2.11.2 | 2.11.2 | 같음 |
| [expo](https://registry.npmjs.org/expo) | 57.0.22 | 57.0.22 | 같음 |
| [expo-asset](https://registry.npmjs.org/expo-asset) | 57.0.17 | 58.0.0 | SDK 57 묶음 유지 |
| [expo-audio](https://registry.npmjs.org/expo-audio) | 57.0.5 | 58.0.0 | SDK 57 묶음 유지 |
| [expo-file-system](https://registry.npmjs.org/expo-file-system) | 57.0.7 | 58.0.0 | SDK 57 묶음 유지 |
| [expo-font](https://registry.npmjs.org/expo-font) | 57.0.4 | 58.0.0 | SDK 57 묶음 유지 |
| [expo-haptics](https://registry.npmjs.org/expo-haptics) | 57.0.3 | 58.0.0 | SDK 57 묶음 유지 |
| [expo-secure-store](https://registry.npmjs.org/expo-secure-store) | 57.0.4 | 58.0.0 | SDK 57 묶음 유지 |
| [expo-speech](https://registry.npmjs.org/expo-speech) | 57.0.3 | 58.0.0 | SDK 57 묶음 유지 |
| [expo-splash-screen](https://registry.npmjs.org/expo-splash-screen) | 57.0.9 | 58.0.0 | SDK 57 묶음 유지 |
| [expo-status-bar](https://registry.npmjs.org/expo-status-bar) | 57.0.1 | 58.0.0 | SDK 57 묶음 유지 |
| [expo-updates](https://registry.npmjs.org/expo-updates) | 57.0.22 | 58.0.0 | SDK 57 묶음 유지 |
| [react](https://registry.npmjs.org/react) | 19.2.3 | 19.3.0 | RN renderer 정확 일치 |
| [react-dom](https://registry.npmjs.org/react-dom) | 19.2.3 | 19.3.0 | RN renderer 정확 일치 |
| [react-native](https://registry.npmjs.org/react-native) | 0.86.3 | 0.87.1 | Expo 57 대상 .86 유지 |
| [react-native-gesture-handler](https://registry.npmjs.org/react-native-gesture-handler) | 3.3.0 | 3.3.0 | 같음 |
| [react-native-reanimated](https://registry.npmjs.org/react-native-reanimated) | 4.5.5 | 4.6.0 | Expo core Worklets 범위 |
| [react-native-web](https://registry.npmjs.org/react-native-web) | 0.21.2 | 0.21.2 | 같음 |
| [react-native-worklets](https://registry.npmjs.org/react-native-worklets) | 0.10.4 | 0.12.2 | Expo core Worklets 범위 |
| [ts-fsrs](https://registry.npmjs.org/ts-fsrs) | 5.4.2 | 5.4.2 | 같음 |
| [opentype.js](https://registry.npmjs.org/opentype.js) | 2.0.0 | 2.0.0 | 같음 |
| [sharp](https://registry.npmjs.org/sharp) | 0.35.4 | 0.35.4 | 같음 |

23개 직접 의존성 전체를 대조했다. 기존의 Expo 57 라이브러리들은 이미 해당 SDK 범위의 최신 patch였다. Sentry 7.11.0 → 8.26.0, Gesture Handler 3.3.0·Reanimated 4.5.5·Worklets 0.10.4를 추가했고 package-lock.json까지 반영했다. Node 실행은 로컬 24.18.0에서 확인했고 `engines.node`를 RN/Metro 실제 지원 범위로 맞췄다. 설치 이후 새로운 Node 배포를 찾아 시스템 전체를 교체한 것은 아니다.

## 최신 후보를 그대로 쓰지 않은 실제 근거

- Reanimated 4.6.0 + Worklets 0.12.2를 설치 후보로 검증했으나 **expo-modules-core 57.0.18**의 `peerOptional`은 `^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0`이다. 실제 npm peer 경고를 확인해 .12.2 후보를 철회했다. core 57.0.18도 기준일 SDK 57 최신 patch다.
- 최종 Reanimated 4.5.5 peer는 Worklets `0.10.x - 0.11.x`, RN `0.83 - 0.86`. 따라서 세 라이브러리의 지원 범위가 겹치는 최신 조합인 4.5.5 + 0.10.4를 사용한다. `--force`, `--legacy-peer-deps`, `overrides`로 경고를 숨기지 않았다.
- React 19.3.0은 RN의 넓은 peer 범위에는 들어가지만, 설치된 RN 0.86.3의 `ReactFabric-{dev,prod,profiling}.js`는 renderer 19.2.3이다. React와 react-dom도 19.2.3을 유지했다.
- Expo 하위 패키지 58.0.0이 기준일에 개별 게시돼 있지만 Expo SDK 58 자체는 기준일까지 정식 배포되지 않았다. 57.0.22의 공식 SDK 계약은 RN 0.86/React 19.2다. 하위 모듈만 58로 섞지 않았다.
- React Native 1000.0.0은 잘못 배포된 deprecated 버전이다. 단순 버전 숫자 정렬을 최신 판단으로 쓰지 않도록 감사 시험에 회귀 사례를 넣었다.

공식 근거: [Expo 57](https://expo.dev/changelog/sdk-57), [Reanimated 호환표](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/), [Gesture Handler 3.3 릴리스](https://github.com/software-mansion/react-native-gesture-handler/releases/tag/v3.3.0), [Sentry 8 이전](https://github.com/getsentry/sentry-react-native/releases/tag/8.0.0), [Sentry 8.26](https://github.com/getsentry/sentry-react-native/releases/tag/8.26.0). 최종 판단은 현재 문서만이 아니라 설치된 패키지의 peer·compatibility.json 및 실제 renderer 원문과 대조했다.

## 제거·보안·개인정보

- `tools/스키아패치.js`와 그 postinstall 호출을 제거했다. [Skia 2.11.2 공식 태그 원문](https://github.com/Shopify/react-native-skia/blob/v2.11.2/packages/skia/src/external/reanimated/useVideoLoading.ts)에 이미 lazy runtime 수정이 있어 로컬 패치를 유지할 이유가 사라졌다. 제거 파일은 Git 이력으로 복구 가능하다.
- `@xmldom/xmldom` 전이 의존성 0.8.13 → 0.8.15, 0.9.10 → 0.9.12를 기존 요구 범위 안에서 갱신했다. `npm audit`의 high 1건이 0건으로 줄었다.
- 남은 audit는 moderate 12개 패키지 경고이며 대부분 같은 `xcode → uuid@7.0.3` 빌드 도구 경로를 따라 전파된다. 공식 수정판 없는 xcode@3.0.1의 UUID 범위를 강제로 바꾸지 않았다. audit가 제시한 Expo 46 다운그레이드는 채택하지 않았다. 안전하다고 판정한 것이 아니라 남은 위험이다.
- Sentry 8의 iOS15 최소 요구는 현재 RN의15.1보다 낮다. 새 native init·리플레이·로그·PII 수집을 켜지 않았고 기존 `src/관측.js`의 비식별화 및 최종 전송 정제를 재검증했다.
- npm이 Sentry CLI 3.7.0·2.58.6의 설치 스크립트 승인 대기를 경고했다. 보호 설정을 바꾸거나 미승인 스크립트를 직접 실행하지 않았다. 해당 CLI를 사용하는 소스맵 업로드/원격 빌드는 별도 실행 확인이 필요하다.

## 실행한 검증과 남은 경계

- `npm install --no-fund`: 최종 peer 충돌 없이 완료. 기존 BGM 재생성 바이트 대조 및 audio 내부 경로 검사 통과.
- `npm ls --all --parseable`: 의존성 트리 종료 코드 0.
- `node --test tests/dependency-upgrade.test.js tests/관측.test.js`: 23/23 통과. manifest/lock/설치 일치, Expo core 포함 peer, 실제 renderer, Babel worklet 직렬화 변환, SDK 최종 Fetch 전송 정제 포함.
- `EXPO_NO_DOTENV=1 npx expo-doctor@1.21.0`: 20/21 통과. 유일한 실패는 Expo 기본 권장 버전 비교의 5개 차이(Sentry8.26, Skia2.11.2, GH3.3, Reanimated4.5.5, Worklets0.10.4)다. doctor 검사를 exclude로 억제하지 않았다.
- 네이티브 binary·기기 FPS/발열·게임 통합 번들·스토어 도착은 이 의존성 단위 검증만으로 증명되지 않는다. 새 native 라이브러리 때문에 기존 설치 앱에 JS OTA만 보내서는 안 되며 새 binary/runtime이 필요하다.
- 재조회: `node tools/dependency-upgrade-audit.js`. 다른 기준일이면 ISO exclusive cutoff를 첫 인수로 전달한다. 읽기 전용이며 패키지를 설치하거나 앱 설정을 변경하지 않는다.

## 통합 회귀 후 보완·로컬 빌드 준비 확인

- 새 회귀의 소스 문자열 검사 3곳을 기존 `tests/lib/소스검사.js`의 `코드만(파일소스(...))`로 연결했다. 주석이 실제 코드인 것처럼 통과시키지 않는다. 검사 조건은 완화하지 않았다.
- 감사 CLI도 기존 `lib/플래그.js`의 `인자게이트`를 사용한다. 위치 인수 하나만 허용하며 알 수 없는 플래그는 공개 registry 조회 전에 종료한다. `--운영` 거절을 실제 실행으로 확인했다.
- `dependency-upgrade + 소스검사통로 + 플래그게이트` 44개 중 42개 통과. 남은 2개는 이 변경과 무관한 기존 `가이드장면자산반입.js`·`가이드장면표정반입.js`의 플래그 통로 미사용이었다. 그 도구나 기준 명단을 수정해 전체 초록으로 만들지 않았다.
- 로컬 Android SDK 실재: API 35/36, Build Tools 35.0.0/36.0.0, NDK 27.1.12297006, CMake 3.22.1. RN 0.86.3의 실제 카탈로그 요구 API36/Build Tools36/동일 NDK와 일치한다. JDK17.0.20, Gradle9.3.1 캐시 및 `android/gradlew.bat`도 있다.
- SDK 경로는 `C:/Users/q1212/AppData/Local/Android/Sdk`. PATH에서 adb는 발견되지 않았지만 절대경로로 실행했고 연결 기기 수는 0이다. 앱 조립 시 경로 설정을 명시할 수 있다. 이 준비 확인에서 Gradle build나 앱 설치를 실행하지 않았다.
- EAS CLI는 글로벌 npm 및 표준 npm 실행 캐시에서 발견하지 못했다. 기존 preview/합성밟기 APK 설정은 있지만 이것은 원격 빌드 성공·무료 잔여량·로그인 확인의 증거가 아니다.
