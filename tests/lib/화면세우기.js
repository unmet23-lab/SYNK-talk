// 앱 **화면**을 테스트에서 실제로 그리는 공용 통로 — `react-native` 만 웹 판으로 바뀐다.
//
// 왜 있나 (2026-08-09 · F268 의 남은 절반)
//   `useState(오늘)` — 어디에도 없는 이름을 화면이 불렀는데 그때 저장소는 550/550 초록이었다.
//   구문검사는 문법만 보고 나머지 테스트는 순수 함수만 부른다. **아무도 화면을 안 그렸다.**
//   저장소는 이 자리를 「원리상 못 한다」고 적어 왔다(`lib/견줌.js` 머리말: *화면 파일은
//   react-native 를 끌고 와서 node 회귀가 열지 못한다*). 그래서 판정을 lib 으로 빼 왔는데,
//   그건 **판정**을 잰 것이지 화면이 그것을 옳게 쓰는지를 잰 것이 아니다.
//
// 🔑 새 의존성 0 — `react-native-web`·`react-dom` 은 이미 dependencies 에 있고(Expo 웹),
//   JSX·ESM 변환은 Expo 가 들고 온 `@babel/core` 로 한다. 설치를 요구하는 순간 유호님 손이
//   필요해지고(상시 지시) CI 도 같이 무거워진다.
//
// ⚠ `앱모듈세우기.js` 와 **재는 층이 다르다** — 저쪽은 API 모듈(fetch 가짜·vm 격리)이고
//   react-native 를 못 연다고 스스로 못박았다. 이쪽은 화면이라 그 모듈이 실제로 필요하다.
//   합치지 않는 이유가 그것이다: vm 격리와 require 후킹을 한 통로에 섞으면 둘 다 약해진다.
//
// 쓰는 법:
//   const { 그리기 } = require('./lib/화면세우기.js');
//   const 글 = 그리기('src/어제의나.js', { 값, 돌아가기() {} });
//
// 무엇을 재나 / 안 재나
//   ✅ 그리다 죽지 않는가 · 화면이 정본 값을 옳게 읽어 **글자로 내는가**.
//   🚫 픽셀·레이아웃·애니메이션(웹 판은 기기가 아니다 — 그건 실기기 몫이다).
//   🚫 `useEffect` — 서버 렌더에서 안 돈다. 조회·전송 층은 `앱모듈세우기` 계열이 진다.
//      이 통로는 **첫 렌더**만 본다.
//   🔴 `expo-*` 를 끌고 오는 화면(말하기·답장·도착확인)은 아직 못 연다 — 그 모듈들은 node 에
//      없다. 스텁을 여기 두는 것은 되지만, 스텁이 화면 코드를 베끼기 시작하면 갈라지므로
//      **첫 소비자가 생기는 판에서** 최소로 짓는다(지금 지어 두면 쓰는 사람이 없다).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const ROOT = path.join(__dirname, '..', '..');

/* 앱 모듈은 번들에 인라인되는 `EXPO_PUBLIC_*` 을 읽는다 — 없으면 빈 문자열로 서지만,
   여기서 세워 두면 「설정이 없다」가 렌더 실패로 오해되지 않는다. 값은 가짜다(왕복 0). */
process.env.EXPO_PUBLIC_SUPABASE_URL ||= 'https://x.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||= 'anon';

/* ① `react-native` → `react-native-web`. 앱 소스는 전자를 부르고 node 는 그것을 못 연다
   (Flow 문법). Expo 웹이 하는 바로 그 치환이다. */
const 원래해석 = Module._resolveFilename;
Module._resolveFilename = function (요청, ...나머지) {
  return 원래해석.call(this, 요청 === 'react-native' ? 'react-native-web' : 요청, ...나머지);
};

/* ② 앱 소스(JSX + ESM)만 바꿔 싣는다. `node_modules` 는 손대지 않는다 — 거기까지 변환하면
   느려지기만 하고, 그 안은 이미 CJS 로 배포돼 있다. */
const 원래로더 = require.extensions['.js'];
require.extensions['.js'] = function (m, 파일) {
  if (파일.includes('node_modules')) return 원래로더(m, 파일);
  const { code } = babel.transformSync(fs.readFileSync(파일, 'utf8'), {
    filename: 파일,
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs',
    ],
    babelrc: false,
    configFile: false,
  });
  m._compile(code, 파일);
};

/* ③ `expo-*` 네이티브 모듈 — node 에 **없다**(바인딩이 기기에만 있고, 배럴은 TS 소스를 가리켜
   node 의 타입 스트립이 node_modules 안에서 거부한다 · 2026-08-09 실측 3종이 서로 다른 이유로
   죽었다). 그래서 이름만 가로채 빈 판을 준다.
   🔑 **값을 지어내지 않는다.** 스텁이 화면 코드를 베끼기 시작하면 이 통로는 화면이 아니라
     자기 자신을 재게 된다. 첫 렌더가 실제로 부르는 것만 세우고, 안 부르는 자리는 비워 둔다 —
     화면이 새로 부르는 날 `undefined is not a function` 으로 **드러나는** 편이 옳다(조용한 통과 ✗).
   ⚠ 그래서 이 목록은 **늘어나는 게 정상**이다. 늘릴 때 채우는 것은 「그 화면이 첫 렌더에서
     실제로 쓰는 값」뿐이고, 그 근거는 화면 소스에 있다(짐작으로 채우면 위 규칙이 깨진다). */
const expo스텁 = {
  'expo-secure-store': {},
  'expo-updates': {},
  'expo-speech': {},
  /* 🔑 훅 둘만 세운다 — `src/검수화면.js` 가 **첫 렌더에서 실제로 부르는 것**이 그 둘뿐이다.
     · `useAudioPlayer()` → 빈 판. 재생기의 메서드(`replace`·`play`·`seekTo`)는 전부 effect·
       콜백에서만 불리는데 서버 렌더는 그것을 안 돌린다. 미리 채우면 「안 부르는 자리」를
       채우는 것이라 이 통로가 화면이 아니라 자기 자신을 재게 된다(머리말 🔑).
     · `useAudioPlayerStatus()` → **`null`**. 지어낸 값이 아니라 실제로 있는 상태다(재생기에
       소스가 붙기 전). 화면이 그 자리를 안 지키면 여기서 드러난다. */
  'expo-audio': {
    useAudioPlayer: () => ({}),
    useAudioPlayerStatus: () => null,
  },
  /* `useAudioStream()` — 첫 소비자는 `알바변명화면` 의 녹음 단계 렌더(2026-08-13 · G3 가
     녹음카드를 실제로 그린다). 첫 렌더가 쓰는 것은 `{ stream }` 구조분해뿐이고 stream 의
     메서드(start·stop)는 전부 핸들러·effect 안이다 — 그래서 빈 판 하나만 준다(머리말 🔑:
     안 부르는 자리를 채우면 이 통로가 화면이 아니라 자기 자신을 재게 된다). */
  'expo-audio/build/AudioStream': { useAudioStream: () => ({}) },
};
const 원래로드 = Module._load;
Module._load = function (요청, ...나머지) {
  if (Object.prototype.hasOwnProperty.call(expo스텁, 요청)) return expo스텁[요청];
  return 원래로드.call(this, 요청, ...나머지);
};

const React = require('react');
const { renderToString } = require('react-dom/server');

/** 화면을 실제로 그려 **글자만** 낸다 — 태그·클래스는 검사 대상이 아니다(그건 픽셀 쪽이다).
 * @param 상대경로 저장소 뿌리 기준(`src/어제의나.js`)
 * @returns {string} 화면에 보이는 글자를 한 줄로 편 것 */
function 그리기(상대경로, props = {}) {
  const 모듈 = require(path.join(ROOT, 상대경로));
  const 화면 = 모듈.default || 모듈;
  return renderToString(React.createElement(화면, props))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { 그리기, ROOT };
