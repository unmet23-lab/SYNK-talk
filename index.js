import { registerRootComponent } from 'expo';

import App from './App';
import { 관측세우기 } from './src/관측';

// 🔑 **앱보다 먼저 선다** — 뜨는 도중에 죽는 사고(폰트 로드·키체인 복원)가 실제로 가장
//   위험한 자리인데, 관측을 App 안에서 세우면 그 구간이 통째로 사각지대가 된다.
//   DSN 이 없으면 이 호출은 아무 일도 안 하고 사유만 남긴다(`src/관측.js` 머리말).
관측세우기();

// registerRootComponent 는 AppRegistry.registerComponent('main', () => App) 을 부르고,
// Expo Go / 네이티브 빌드 양쪽에서 환경을 알맞게 잡아준다.
registerRootComponent(App);
