'use strict';
/**
 * 브랜드 아이콘 회귀 — **문자열이 아니라 렌더 픽셀로** 검사한다.
 *
 * 이 프로젝트가 색에서 배운 것: 소스에 적힌 hex가 맞아도 실제로 칠해진 픽셀이 다를 수 있고
 * (변환·프로파일·안티앨리어싱), 반대로 소스를 고쳐도 그림 파일은 옛 색 그대로 남는다.
 * 그래서 검사 대상은 `tools/make-icons.js` 의 상수가 아니라 **`assets/*.png` 의 픽셀**이다.
 *
 * 함께 검사하는 것:
 *  · R1 2색 원칙 — 신호색(Coral) 면적이 5% 미만인가
 *  · app.json 이 가리키는 배경색이 정본 Ink Deep 과 같은가(그림과 설정이 갈라지면 테두리가 뜬다)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const A = (f) => path.join(ROOT, 'assets', f);

// 브랜드 정본 (SYNK-appsscript docs/디자인_토큰.json 「시맨틱 · 다크」축 — 「양모 밤」 · 유호 확정 2026-08-20 · 조항 ⓚ)
const NAVY2 = '#080605'; // Ink Deep(바탕)
const CREAM = '#FBF7F0'; // Paper(잉크)
const CORAL = '#F96859'; // Coral(신호)
const CORAL_SOFT = '#FBB7A3'; // Coral Soft — 알록판 색실의 코랄 계열(펠트 램프 색)

let sharp;
try {
  sharp = require('sharp');
} catch (_) {
  sharp = null;
}

const hex = (r, g, b) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

async function 픽셀통계(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const cnt = Object.create(null);
  let 투명 = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) {
      투명++;
      continue;
    }
    const k = hex(data[i], data[i + 1], data[i + 2]);
    cnt[k] = (cnt[k] || 0) + 1;
  }
  const 근방 = (c, tol = 26) => {
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    let 합 = 0;
    for (const k in cnt) {
      if (Math.abs(parseInt(k.slice(1, 3), 16) - r) < tol
        && Math.abs(parseInt(k.slice(3, 5), 16) - g) < tol
        && Math.abs(parseInt(k.slice(5, 7), 16) - b) < tol) 합 += cnt[k];
    }
    return 합 / n;
  };
  return { cnt, n, 투명, w: info.width, h: info.height, 비율: (c) => (cnt[c] || 0) / n, 근방 };
}

const 파일들 = [
  { f: 'icon.png', size: 1024, 배경: NAVY2 },
  { f: 'android-icon-foreground.png', size: 1024, 배경: null },
  { f: 'android-icon-background.png', size: 1024, 배경: NAVY2 },
  { f: 'android-icon-monochrome.png', size: 1024, 배경: null },
  { f: 'splash-icon.png', size: 1024, 배경: null, 알록: true },
  { f: 'favicon.png', size: 64, 배경: NAVY2 },
];

test('아이콘 6종이 모두 있다', () => {
  for (const { f } of 파일들) {
    assert.ok(fs.existsSync(A(f)), `${f} 없음 — node tools/make-icons.js 를 돌려라`);
  }
});

test('app.json 의 배경색이 정본 Ink Deep 과 같다', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  assert.equal(app.expo.android.adaptiveIcon.backgroundColor, NAVY2);
  const splash = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  assert.ok(splash, 'expo-splash-screen 플러그인 설정이 없다');
  assert.equal(splash[1].backgroundColor, NAVY2);
});

// sharp 가 없는 환경에서는 픽셀 검사를 건너뛴다 — 다만 **조용히 통과시키지 않고 skip 으로 남긴다**.
const 픽셀검사 = sharp ? test : test.skip;

for (const { f, size, 배경, 알록 } of 파일들) {
  픽셀검사(`${f} — 규격·정본색·R1`, async () => {
    const s = await 픽셀통계(A(f));
    assert.equal(s.w, size, `${f} 가로 규격`);
    assert.equal(s.h, size, `${f} 세로 규격`);

    if (배경) {
      assert.ok(
        s.비율(배경) > 0.5,
        `${f} 의 배경이 ${배경} 이 아니다 (상위색: ${Object.entries(s.cnt)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([c]) => c)
          .join(', ')})`
      );
    } else {
      assert.ok(s.투명 / s.n > 0.5, `${f} 는 투명 배경이어야 한다`);
    }

    /* R1 — 신호색은 한 점, 면적 5% 미만.
       🔑 **알록판은 «근방»으로 잰다**(유호 확정 08-25 — 스플래시 = 알록). 알록의 신호는 색실이고
          실땀에는 펠트 필터(feTurbulence + feDisplacementMap)가 걸려 있어 **정확한 hex 가
          한 픽셀도 안 남는다**(08-25 실측: #F96859 0개 · 근방 ±26 은 2.13%). 그래도 브랜드
          색은 살아 있으므로 눈금을 근방으로 옮기되, 면적 규율(5% 미만)은 그대로 건다. */
    /* 알록 «소프트» 정본(유호 08-25)은 색실이 전부 파스텔이라 **원색 코랄이 한 픽셀도 없다**
       (실측: Coral 근방 0 · Coral Soft 근방 0.09%). 코랄 계열이면 신호가 산 것으로 본다. */
    const 신호면적 = 알록 ? s.근방(CORAL) + s.근방(CORAL_SOFT) : s.비율(CORAL);
    assert.ok(신호면적 < 0.05, `${f} Coral 면적 ${(신호면적 * 100).toFixed(2)}% — R1 위반`);

    // monochrome 은 OS 가 칠하므로 브랜드색이 없는 게 정상
    if (f !== 'android-icon-monochrome.png' && f !== 'android-icon-background.png') {
      assert.ok((알록 ? s.근방(CREAM) : s.비율(CREAM)) > 0, `${f} 에 잉크 ${CREAM} 이 없다`);
      assert.ok(신호면적 > 0, `${f} 에 신호 ${CORAL} 이 없다`);
    }
  });
}

픽셀검사('monochrome 은 단색 흰 도형이다 (OS 가 테마색으로 칠한다)', async () => {
  const s = await 픽셀통계(A('android-icon-monochrome.png'));
  assert.equal(s.비율(CORAL), 0, '테마 아이콘에 브랜드색이 남아 있으면 안 된다');
  assert.ok(s.비율('#FFFFFF') > 0, '흰 도형이 없다');
});
