/* 마스코트몸 — 몽글이의 «그림 한 장»을 고무판처럼 다루는 층 (유호 확정 08-27 ①).
 *
 * ■ 왜 있나
 *   지금까지 몽글이의 표정은 **컷을 갈아끼워** 만들었다(재염색_본체·눈웃음·놀람·눈감음 넷).
 *   컷 교체는 «있는 표정»만 낼 수 있고, 새 표정은 블렌더에서 다시 구워야 나온다.
 *   이 층은 같은 그림을 **격자로 잘라 정점을 밀어** 변형한다 — 컷이 안 늘어도 결이 늘어난다.
 *   유호님이 08-26에 세우신 「4D 워프 위의 국소 변형」을 앱 «안에서 실시간으로» 도는 자리다.
 *
 * ■ 무엇을 하나 (컷이 못 하던 둘)
 *   ① 숨 — 몸이 아주 천천히 부푼다. 위아래가 «같이» 움직이지 않는다(아래가 먼저 · 위가 늦게).
 *      균일 scale 로는 이게 안 난다. 그건 풍선이고, 이건 몸이다.
 *   ② 쫀득의 관성 — 탭에 눌릴 때 발치가 먼저 퍼지고 머리가 뒤늦게 따라온다.
 *      기존 transform scaleX/scaleY 는 온몸이 동시에 눌린다 — 젤리가 아니라 고무 도장이다.
 *
 * ■ 규율 — 마스코트.js 와 «같은» 게이트를 지난다(두 곳에서 따로 판정하지 않는다)
 *   · `멈춤` 이 참이면 루프를 아예 안 돈다. reduce-motion 이면 정지 화면이고,
 *     녹음 중이면 학습을 방해하지 않는다(생명감 §1-3). 이 판정은 호출자가 넘긴다.
 *   · 이 파일은 표정을 **고르지 않는다.** 어느 컷을 그릴지는 마스코트.js 가 정하고
 *     여기는 받은 그림 한 장을 변형만 한다 — 별눈 게이트를 우회할 통로가 원리적으로 없다.
 *
 * ■ 폴백이 기본값이다
 *   Skia 는 네이티브 모듈이라 **Expo Go 와 웹에는 없다.** 없으면 이 컴포넌트는 `null` 을 돌려주고
 *   마스코트.js 가 쓰던 <Animated.Image> 가 그대로 선다 — 화면이 죽지 않는다.
 *   ⚠ 「Skia 가 있는데 안 쓰는」 조용한 실패를 막으려고, 왜 못 썼는지는 `쓸수있나()` 가 답한다.
 *
 * ■ 왜 Reanimated 를 안 부르나 (유호 판정 08-27 ②)
 *   Skia 의 Reanimated 는 **optional peer** 다(실측 — peerDependenciesMeta.optional true).
 *   Expo 57 릴리스 노트가 경고한 Hermes V1 메모리 25~30% 를 안 내고 이 층을 세울 수 있다.
 *   대신 시간은 rAF 로 직접 민다. 숨은 3.6초 주기라 30fps 로 충분하고, 그 이상은 낭비다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';

/* Skia 를 «있으면» 쓴다 — 없는 환경(Expo Go·웹)에서 import 만으로 화면이 죽으면 안 된다.
   그래서 정적 import 가 아니라 한 번만 시도하는 지연 로드다. */
let SK = null;
let 못쓴까닭 = null;
function 스키아() {
  if (SK || 못쓴까닭) return SK;
  try {
    // eslint-disable-next-line global-require
    const m = require('@shopify/react-native-skia');
    if (!m || !m.Canvas || !m.Vertices || !m.ImageShader || !m.useImage) {
      못쓴까닭 = 'Skia 는 있는데 필요한 부품(Canvas·Vertices·ImageShader·useImage)이 없다';
      return null;
    }
    SK = m;
  } catch (e) {
    못쓴까닭 = '이 환경에 Skia 네이티브 모듈이 없다(Expo Go·웹이면 정상)';
  }
  return SK;
}

/** 왜 폴백으로 갔는지 — 조용한 실패를 만들지 않기 위한 창구. */
export function 쓸수있나() {
  스키아();
  return { 된다: !!SK, 까닭: 못쓴까닭 };
}

/* 격자 — 촘촘할수록 결이 곱지만 정점이 제곱으로 는다.
   7×9 = 63정점 · 96삼각형. 몽글이 하나에는 이 정도가 «곱고 싼» 자리다(08-27 눈대중, 재볼 것). */
const 가로칸 = 6;
const 세로칸 = 8;

/** 격자의 삼각형 인덱스 — 정점 배치가 안 바뀌므로 한 번만 만든다. */
function 인덱스만들기() {
  const idx = [];
  for (let y = 0; y < 세로칸; y++) {
    for (let x = 0; x < 가로칸; x++) {
      const a = y * (가로칸 + 1) + x;
      const b = a + 1;
      const c = a + (가로칸 + 1);
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return idx;
}

/**
 * @param {object} props
 * @param {any} props.그림 require() 된 마스코트 컷 한 장 — «어느 컷인가»는 호출자가 정한다.
 * @param {number} props.너비
 * @param {number} props.높이
 * @param {boolean} props.멈춤 참이면 변형 없이 선다(reduce-motion · 녹음 중) — 판정은 호출자 몫.
 * @param {boolean} [props.졸림] 숨을 더 얕고 느리게 쉰다(방치·밤).
 * @param {number} [props.탭시각] 마지막 탭의 Date.now(). 눌림 «곡선»은 여기서 만든다.
 *   ⚠ 왜 Animated 값을 안 받나(08-27 실측): 마스코트.js 의 쫀득은 useNativeDriver 로 돈다.
 *   네이티브 드라이버는 값을 JS 로 **안 돌려준다** — addListener 를 달아도 안 불린다.
 *   값을 받으려면 그 애니메이션을 JS 스레드로 내려야 하는데, 그건 이미 얻은 부드러움을
 *   내주는 짓이다. 그래서 «언제 눌렸나» 한 숫자만 받고 감쇠는 여기서 센다.
 * @param {number} [props.기지개시각] 마지막 기지개(잠깸 몸짓)의 Date.now() — 탭시각과 같은
 *   원리의 한 숫자. 늘어남도 발치부터 든다(눌림과 같은 관성 · 방향만 반대).
 */
export default function 마스코트몸({ 그림, 너비, 높이, 멈춤, 졸림 = false, 탭시각 = 0, 기지개시각 = 0 }) {
  const sk = 스키아();
  // 훅은 조건 밖에서 부른다 — Skia 가 없어도 훅 순서가 흔들리면 안 된다.
  const 이미지 = sk ? sk.useImage(그림) : null;
  const [시각, set시각] = useState(0);
  const 시작 = useRef(0);
  const 프레임 = useRef(null);

  useEffect(() => {
    if (!sk || 멈춤) { set시각(0); return undefined; }   // 멈추면 «정지 화면»이다 — 루프를 안 돈다
    let 살아있음 = true;
    let 지난번 = 0;
    const 돌기 = (t) => {
      if (!살아있음) return;
      if (!시작.current) 시작.current = t;
      // 30fps 로 민다 — 숨은 3.6초 주기라 그 이상은 눈에 안 보이고 배터리만 먹는다.
      if (t - 지난번 >= 33) { 지난번 = t; set시각((t - 시작.current) / 1000); }
      프레임.current = requestAnimationFrame(돌기);
    };
    프레임.current = requestAnimationFrame(돌기);
    return () => {
      살아있음 = false;
      if (프레임.current) cancelAnimationFrame(프레임.current);
      시작.current = 0;
    };
  }, [sk, 멈춤]);

  const 인덱스 = useMemo(() => 인덱스만들기(), []);

  /* 텍스처 좌표 — 원본 그림 위의 격자. 변형과 무관하게 고정이다. */
  const 텍스처 = useMemo(() => {
    if (!sk) return null;
    const t = [];
    for (let y = 0; y <= 세로칸; y++) {
      for (let x = 0; x <= 가로칸; x++) t.push(sk.vec((x / 가로칸) * 너비, (y / 세로칸) * 높이));
    }
    return t;
  }, [sk, 너비, 높이]);

  /* 정점 — 매 프레임 여기서 몸이 만들어진다. */
  const 정점 = useMemo(() => {
    if (!sk) return null;
    const 주기 = 졸림 ? 5.2 : 3.6;          // 마스코트.js 의 부유/졸림 주기와 같은 결
    const 숨세기 = (졸림 ? 0.4 : 1) * (멈춤 ? 0 : 1);

    /* 눌림 곡선 — 탭 순간 1 에서 시작해 스프링처럼 튀며 잦아든다(0.42초).
       마스코트.js 의 쫀득(friction 3.6 · tension 160)과 눈으로 같은 결이 되게 맞췄다. */
    let 눌림 = 0;
    if (탭시각 && !멈춤) {
      const 지난 = (Date.now() - 탭시각) / 1000;
      if (지난 >= 0 && 지난 < 0.42) {
        눌림 = Math.cos(지난 * Math.PI * 2 / 0.34) * Math.exp(-지난 * 7.5);
        눌림 = Math.max(-0.35, Math.min(1, 눌림));   // 되튐은 얕게 — 몸이 늘어지면 인형이 아니라 젤리다
      }
    }
    /* 기지개(잠깸) 곡선 — 음수 = 늘어남. 눌림과 같은 감쇠 무늬라 아래에서 «합산»한다(0.5초). */
    let 늘림 = 0;
    if (기지개시각 && !멈춤) {
      const 지난 = (Date.now() - 기지개시각) / 1000;
      if (지난 >= 0 && 지난 < 0.5) 늘림 = -0.5 * Math.exp(-지난 * 5);
    }
    const v = [];
    for (let y = 0; y <= 세로칸; y++) {
      const yr = y / 세로칸;                 // 0 = 머리끝 · 1 = 발치
      for (let x = 0; x <= 가로칸; x++) {
        const xr = x / 가로칸;
        const 가운데서 = (xr - 0.5) * 2;      // -1..1

        /* ① 숨 — 위상을 «아래에서 위로» 지연시킨다. 그래야 몸이 한 덩어리로 안 움직인다.
              발치(yr=1)가 먼저 부풀고 머리(yr=0)가 0.35주기 늦게 따라온다. */
        const 위상 = (시각 / 주기) * Math.PI * 2 - (1 - yr) * 0.35 * Math.PI * 2;
        const 숨 = Math.sin(위상) * 숨세기;
        const 숨세로 = 숨 * 0.9 * yr;         // 아래가 더 흔들린다(발치가 무겁다)
        const 숨가로 = 숨 * 0.5 * (1 - Math.abs(가운데서)) * (0.4 + yr * 0.6);

        /* ② 쫀득의 관성 — 눌림도 늘어남(기지개)도 발치부터 든다. 머리는 0.35 만큼만 따라온다. */
        const 눌림세기 = (눌림 + 늘림) * (0.35 + yr * 0.65);
        const 세로눌림 = -(높이 * yr) * 0.12 * 눌림세기;                  // 위로 당겨 키가 준다
        const 가로퍼짐 = 가운데서 * (너비 * 0.5) * 0.10 * 눌림세기;        // 옆으로 퍼진다

        v.push(sk.vec(
          xr * 너비 + 숨가로 + 가로퍼짐,
          yr * 높이 + 숨세로 + 세로눌림,
        ));
      }
    }
    return v;
  }, [sk, 시각, 너비, 높이, 졸림, 탭시각, 기지개시각, 멈춤]);

  // Skia 가 없거나 그림이 아직 안 왔으면 호출자가 <Image> 로 그린다.
  if (!sk || !이미지 || !정점 || !텍스처) return null;

  const { Canvas, Vertices, ImageShader } = sk;
  return (
    <Canvas style={{ width: 너비, height: 높이 }} pointerEvents="none">
      <Vertices vertices={정점} textures={텍스처} indices={인덱스}>
        <ImageShader
          image={이미지}
          fit="contain"
          rect={{ x: 0, y: 0, width: 너비, height: 높이 }}
        />
      </Vertices>
    </Canvas>
  );
}
