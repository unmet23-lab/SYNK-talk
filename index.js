import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent 는 AppRegistry.registerComponent('main', () => App) 을 부르고,
// Expo Go / 네이티브 빌드 양쪽에서 환경을 알맞게 잡아준다.
registerRootComponent(App);
