#!/usr/bin/env node
/* 앱시작 — `expo start` 앞에 `EXPO_NO_TYPESCRIPT_SETUP=1` 을 세운다.
 *
 * 🔴 왜 있나 (F176 · 2026-08-07 원격 실측에서 벽을 만났다):
 *   `expo start` 는 서버를 띄우기 전에 프로젝트 전체를 훑어 `.ts`·`.tsx` 가 있으면
 *   TypeScript 프로젝트라고 판정한다(@expo/cli TypeScriptProjectPrerequisite).
 *   그 무시 목록은 `node_modules` · `.d.ts` · `ios|android|web|web-build|dist` 로
 *   **박혀 있어 사용자가 넓힐 수 없다.** 그런데 이 저장소의 `supabase/functions` 아래
 *   `.ts` 7개는 앱 소스가 아니라 **Deno Edge Function** 이다 — 앱엔 TS 가 한 줄도 없는데도
 *   판정이 참이 되어 `typescript`·`@types/react` 설치를 요구하며 죽고 `tsconfig.json` 을
 *   멋대로 만든다. 08-07 에는 `npm install --no-save typescript` 로 넘겼는데 그건 저장소에
 *   안 남으므로 **새로 clone 하는 사람마다 같은 벽을 만난다.**
 *
 *   ✅ 처방은 「스캔에서 빼기」가 아니라(넓힐 수 없다) **판정을 끄기**다 — 앱은 실제로
 *   JS 전용이니 Expo 에게 사실을 말하는 것이지 우회가 아니다.
 *   🚫 「typescript 를 devDependencies 에 넣기」는 기각 — 스캔 오판 하나 때문에 컴파일러와
 *      아무도 안 쓰는 tsconfig.json 을 저장소에 들이는 일이다.
 *
 * `package.json` scripts 가 이 파일을 부른다. 직접 `npx expo start` 를 부르면 이 관문을
 * 건너뛰므로 `tests/앱시작.test.js` 가 그 회귀를 막는다.
 *   npm start → node tools/앱시작.js start   ·   npm run web → node tools/앱시작.js start --web
 */
'use strict';

process.env.EXPO_NO_TYPESCRIPT_SETUP = '1';

/* 별도 프로세스를 띄우지 않는다 — expo 의 bin 은 CJS 한 줄(`require('@expo/cli')`)이라
 * 같은 프로세스에서 require 하면 위 env 가 그대로 보이고, Ctrl-C·종료코드·플랫폼별 npx
 * 경로 문제가 전부 사라진다. 인자는 process.argv 로 그대로 넘어간다. */
require('expo/bin/cli');
