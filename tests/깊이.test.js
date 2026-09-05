'use strict';
/* 4D 깊이 반입 회귀 — `contents/깊이.json` 이 **정본과 갈라지지 않았는가**.
 *
 * ■ 왜 이 파일이 있나 — 반입 사본은 조용히 갈라진다
 *   깊이 수식의 정본은 형제 저장소(SYNK-appsscript)의 `tools/lib/깊이격자.js` 이고, 여기 있는
 *   것은 **사본**이다(만드는 통로 = `node tools/깊이반입.js`). 사본은 「여기서 한 줄만 고치면
 *   되는데」로 시작해서 갈라지고, 갈라진 뒤엔 양쪽이 다 초록이다 — 각자 자기 파일만 보기 때문이다
 *   (`tests/혼잣말.test.js`·소리 바이트 대조와 같은 규율).
 *   🔴 이 층에서 갈라지면 증상이 특히 고약하다: **학생 손의 앱과 릴이 다른 각도로 고개를 돌린다.**
 *
 * ■ 🔴 「z 가 전부 0」을 여기서 다시 잰다 — 그 사고가 실제로 났다
 *   08-26 에 4D 층이 **한 번도 돈 적이 없었다**(`v` 정의 한 줄이 없어 통째로 죽어 있었고,
 *   구조 검사 열 개는 «있나»만 봐서 못 잡았다). 0 은 «성공한 얼굴»을 한다 —
 *   그림은 그대로 나오고 종료코드도 0 이다. 그래서 값 자체를 센다.
 *
 * ■ 형제가 없으면 skip (fail 아님)
 *   Actions 는 자기 저장소만 checkout 한다 — fail 로 짜면 CI 에서 남의 배포를 막는다
 *   (tests/혼잣말.test.js·소리.test.js ③ 과 같은 규율). 대신 **skip 과 통과가 같은 모양이
 *   되지 않게** 찍는다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const 뿌리 = path.resolve(__dirname, '..');
const 사본 = require('../contents/깊이.json');
const 형제 = path.resolve(뿌리, '..', 'SYNK-appsscript');

test('반입 — 스키마와 격자 크기(칸 수가 어긋나면 겹선형 읽기가 조용히 딴 데를 짚는다)', () => {
  assert.ok(Number.isInteger(사본.N) && 사본.N > 0, 'N 이 없다 — 격자 칸 수의 주인이 사라졌다');
  assert.match(사본._주, /반입 사본/, '「여기는 반입 사본」이라는 머리말이 사라졌다 — 다음 사람이 여기를 정본으로 읽는다');
  assert.match(사본._주, /깊이격자\.js/, '머리말이 정본 수식 경로를 안 가리킨다');

  const 칸 = (사본.N + 1) * (사본.N + 1);
  const 가이드들 = Object.keys(사본.가이드 || {});
  assert.ok(가이드들.includes('몽글'), '몽글 격자가 없다 — 앱의 폴백 대상이라 이것만은 늘 있어야 한다');
  for (const g of 가이드들) {
    assert.equal(사본.가이드[g].length, 칸, `${g}: 격자 길이가 ${칸} 이 아니다(${사본.가이드[g].length})`);
    assert.ok(typeof 사본.기준?.[g] === 'number', `${g}: 「기준」이 없다 — 앱은 max(0, z − 기준) 으로 민다`);
  }
});

test('🔴 z 가 전부 0 이 아니다 — 08-26 에 이 층이 통째로 죽어 있었다', () => {
  for (const [g, z] of Object.entries(사본.가이드 || {})) {
    const 최대 = z.reduce((a, b) => Math.max(a, b), 0);
    assert.ok(최대 > 0.5, `${g}: z 최대가 ${최대} 다 — 깊이 함수가 죽었다는 뜻이다`);

    /* 눈은 +0.30 을 더해 1 을 넘는다. 그 봉우리가 없으면 «눈이 먼저 움직이는» 자리가 사라진 것이고,
       그게 사라지면 4D 는 그림이 통째로 미끄러지는 것과 구별되지 않는다. */
    assert.ok(최대 > 1.0, `${g}: z 최대가 ${최대} — 눈 봉우리(+0.30)가 없다`);

    const 산것 = z.filter((v) => v > 0).length;
    assert.ok(산것 > 100, `${g}: 몸이 있는 칸이 ${산것} 뿐이다 — 누끼가 비었거나 알파 문턱이 틀렸다`);
    assert.ok(산것 < z.length, `${g}: 모든 칸에 몸이 있다 — 누끼(투명 배경)가 아니라는 뜻이다`);
  }
});

test('🔴 기준 — 실루엣이 못 박히고 눈이 앞선다 (09-02 「찌그러져 보인다」의 수리를 지키는 자리)', () => {
  /* 첫 판은 «평균 대비 편차»로 밀었다. 실측(84px 화면 · 앱 격자 12×14):
       실루엣 가장자리 3.09px 흔들림 · 눈 0.97px 이동 — **찌그러짐만 보이고 4D 는 안 보였다.**
     지금은 max(0, z − 기준) 이라 가장자리 0px · 눈 2.88px 다. 그 성질을 여기서 문다. */
  for (const [g, z] of Object.entries(사본.가이드 || {})) {
    const 기준 = 사본.기준[g];
    const 산것 = z.filter((v) => v > 0).sort((a, b) => a - b);
    const 평균 = 산것.reduce((a, b) => a + b, 0) / 산것.length;

    /* ① 기준은 «몸 안 하위 10%» 여야 한다 — 평균이면 가장자리가 음수가 되어 반대로 밀린다. */
    const 하위10 = 산것[Math.floor(산것.length * 0.1)];
    assert.ok(Math.abs(기준 - 하위10) < 0.02,
      `${g}: 기준 ${기준} 이 하위 10%(${하위10.toFixed(3)})와 다르다 — 반입이 딴 값을 실었다`);
    assert.ok(기준 < 평균,
      `${g}: 기준(${기준})이 평균(${평균.toFixed(3)}) 이상이다 — 몸 대부분이 0 으로 잘려 4D 가 죽는다`);

    /* ② 실루엣 쪽 칸의 «밀기»가 0 이어야 한다 — 이게 「테두리가 안 흔들린다」의 정의다. */
    const 가장자리들 = 산것.slice(0, Math.floor(산것.length * 0.1));
    for (const v of 가장자리들) {
      assert.equal(Math.max(0, v - 기준), 0, `${g}: 실루엣 칸(z=${v})이 밀린다 — 테두리가 출렁인다`);
    }

    /* ③ 눈이 몸보다 충분히 앞서야 한다 — 아니면 4D 는 「통째로 미끄러지는 그림」이 된다. */
    const 눈대몸 = (산것[산것.length - 1] - 기준) / (평균 - 기준);
    assert.ok(눈대몸 >= 1.3, `${g}: 눈 대 몸 대비가 ${눈대몸.toFixed(2)}배뿐이다 — 고개 돌림이 안 읽힌다`);
  }
});

test('부드럽게 — 이웃 칸 z 점프가 완만하다 (급변한 칸 하나가 「튀어나온 혹」이 된다)', () => {
  /* 생것 격자는 가로 이웃 점프가 0.592 였다(09-02 실측). 29칸을 앱 격자 12칸으로 읽으면
     그 급변이 확대되어 몸에 혹이 솟는다. 반입이 부드럽게 2회를 지나 0.194 로 내려왔다. */
  for (const [g, z] of Object.entries(사본.가이드 || {})) {
    const N = 사본.N;
    let 최대점프 = 0;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i < N; i++) {
        const a = z[j * (N + 1) + i], b = z[j * (N + 1) + i + 1];
        if (a > 0 && b > 0) 최대점프 = Math.max(최대점프, Math.abs(a - b));
      }
    }
    assert.ok(최대점프 < 0.30,
      `${g}: 이웃 칸 z 점프가 ${최대점프.toFixed(3)} 이다 — 부드럽게를 안 지났거나 회수가 줄었다`);
  }
});

test('앱 그림이 정사각·무크롭이다 — 깊이 격자는 정규화 좌표라 이 전제 위에 산다', () => {
  /* ⚠ 정본은 4096² PNG 이고(09-05 판올림 전에는 1024²) 앱 그림은 336² webp 다.
     축소만이라 격자가 그대로 맞는데,
     언젠가 webp 를 «잘라서» 만들면 그 전제가 깨진다 — z 가 딴 자리를 짚게 된다.
     그때 이 줄이 먼저 운다(SYNK-appsscript tools/깊이반입.js 머리말이 여기를 가리킨다). */
  const 잴것 = [['몽글', '몽글_본체.webp'], ['까몽', '까몽_본체.webp'], ['마린', '마린_본체.webp']];
  for (const [가이드, 파일] of 잴것) {
    const p = path.join(뿌리, 'assets', '마스코트', 파일);
    if (!fs.existsSync(p)) continue;   // 컷이 아직 없는 가이드는 이 축에서 잴 것이 없다
    const b = fs.readFileSync(p);
    assert.equal(b.toString('ascii', 8, 12), 'WEBP', `${파일}: WEBP 가 아니다`);
    const 청크 = b.toString('ascii', 12, 16);
    let w = 0, h = 0;
    if (청크 === 'VP8X') { w = 1 + b.readUIntLE(24, 3); h = 1 + b.readUIntLE(27, 3); }
    else if (청크 === 'VP8 ') { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; }
    else if (청크 === 'VP8L') { const v = b.readUInt32LE(21); w = (v & 0x3fff) + 1; h = ((v >> 14) & 0x3fff) + 1; }
    else continue;   // 모르는 꼴이면 «안 재봤다» — 틀린 초록보다 낫다
    assert.equal(w, h, `${가이드}(${파일}): ${w}×${h} 로 정사각이 아니다 — 깊이 격자가 딴 자리를 짚는다`);
  }
});

test('드리프트 — 형제 저장소가 있으면 정본 수식이 내는 값과 전량이 같다', (t) => {
  const 격자모듈 = path.join(형제, 'tools', 'lib', '깊이격자.js');
  const 자산모듈 = path.join(형제, 'tools', 'lib', '마스코트자산.js');
  if (!fs.existsSync(격자모듈) || !fs.existsSync(자산모듈)) {
    return t.skip('형제 저장소 부재 — 정본 대조는 로컬에서만');
  }
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { 앱용뽑기 } = require(격자모듈);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const 마스코트 = require(자산모듈);

  /* 반입 도구(tools/깊이반입.js)와 **같은 그림**을 짚는다 — 앱이 기본으로 그리는 누끼 본체다. */
  const 원본 = {
    몽글: 마스코트.절대경로('본체', { 누끼: true }),
    까몽: path.join(형제, 마스코트.까몽경로('본체', { 누끼: true })),
    마린: path.join(형제, 마스코트.마린경로('본체')), // 09-05 반입 · 마린은 누끼 인자가 없다
  };

  for (const [가이드, z] of Object.entries(사본.가이드 || {})) {
    const p = 원본[가이드];
    if (!p || !fs.existsSync(p)) {
      assert.fail(`${가이드}: 반입 사본에는 있는데 정본 그림이 없다 — 사본이 유령을 들고 있다`);
    }
    /* 🔑 «앱용» 뽑기와 대조한다 — 릴은 생것 z 를 쓰고 앱은 부드럽게 2회 + 기준을 쓴다.
       생것과 비교하면 이 검사는 늘 빨갛고, 그러면 곧 꺼진다. */
    const 정본 = 앱용뽑기(p, { N: 사본.N });
    assert.equal(정본.z.length, z.length, `${가이드}: 격자 길이가 정본과 다르다`);
    assert.equal(사본.기준[가이드], 정본.기준, `${가이드}: 기준이 정본과 다르다 — node tools/깊이반입.js 를 다시 돌려라`);
    for (let i = 0; i < z.length; i++) {
      assert.equal(z[i], 정본.z[i], `${가이드}: ${i}번 칸이 정본과 다르다(${z[i]} ≠ ${정본.z[i]}) — node tools/깊이반입.js 를 다시 돌려라`);
    }
  }
});
