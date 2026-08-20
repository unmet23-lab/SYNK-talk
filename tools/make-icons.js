#!/usr/bin/env node
'use strict';
/**
 * 앱 아이콘 생성기.
 *
 * 아이콘을 손으로 그려 넣지 않는다. **브랜드 정본의 색이 바뀌면 이 스크립트를 다시 돌린다.**
 * 그림 파일만 교체하는 방식은 다음 개정 때 반드시 낡는다(사본은 스스로 낡음을 모른다).
 *
 *   node tools/make-icons.js
 *
 * ── 브랜드 정본 (SYNK-appsscript `docs/디자인_토큰.json` 「시맨틱 · 다크」축 · `docs/브랜드_폰트_정본.md`)
 *   · 바탕 Ink Deep #080605 · 잉크 Paper #FBF7F0 · 신호 Coral #F96859 (「양모 밤」· 유호 확정 2026-08-20 · 조항 ⓚ)
 *   · R1 2색 원칙 — 한 화면에 바탕 1 + 잉크 1 + **신호 1점(면적 5% 미만)**
 *   · R3 타이포 불가침 — 글자에 그림자·투명도·왜곡 금지. 100% 크리스프
 *   · 워드마크 = DM Mono **500**. DM Mono는 로마자·숫자·기호 **전용**(키릴·한글 글리프가 없다)
 *
 * ── 이 아이콘이 왜 이 모양인가
 *   글자는 「S」 하나다. 앱 아이콘 크기에서 SYNK 네 글자는 읽히지 않는다.
 *   코랄 점은 장식이 아니라 **모노스페이스의 다음 칸**에 놓인다 — DM Mono를 고른 이유가
 *   「격자 위에 자란 서체」이므로, 신호 1점을 그 격자 위에 얹는 것은 발명이 아니라 서체 논리의 연장이다.
 *   ⚠ 오브제(유성·게르 천창 등)는 3주째 미확정이고 「의식 모드 전용」이라 아이콘에 쓰지 않았다.
 *
 * ── 글자를 폰트 이름으로 지정하지 않고 **패스로 변환**하는 이유
 *   SVG에 font-family를 쓰면 렌더러가 시스템 폰트로 대체할 수 있고, 그러면 워드마크가 조용히 무너진다.
 *   (같은 계열 사고: 「Cyrillic 지원」이라던 서체에 몽골 고유자 ө·ү가 없었다.)
 */

const fs = require('node:fs');
const path = require('node:path');
const opentype = require('opentype.js');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets');
const FONT = path.join(OUT, 'fonts', 'DMMono-Medium.ttf');

const NAVY2 = '#080605'; // 바탕 — Ink Deep(「양모 밤」)
const CREAM = '#FBF7F0'; // 잉크 — Paper
const CORAL = '#F96859'; // 신호 1점 — Coral(양모 밤 값)

const font = opentype.parse(fs.readFileSync(FONT).buffer);

/**
 * 「S + 다음 칸의 점」 묶음을 그린다.
 * @param {number} size 캔버스 한 변
 * @param {number} 차지 묶음이 캔버스에서 차지할 가로 비율(안전영역 대응)
 * @param {string} 글자색
 * @param {string} 점색
 */
function 마크(size, 차지, 글자색, 점색) {
  const F = size; // 글자 크기 기준값 — 아래에서 실측해 다시 맞춘다
  const glyph = font.charToGlyph('S');
  const p0 = glyph.getPath(0, 0, F);
  const bb = p0.getBoundingBox();

  // 모노스페이스 한 칸 = advanceWidth/unitsPerEm. 점은 그 「다음 칸」 한가운데에 놓는다.
  const 칸 = (glyph.advanceWidth / font.unitsPerEm) * F;
  const 점반지름 = F * 0.075;
  // 다음 칸 **안쪽**. 칸 한가운데(1.5)에 두면 눈에는 S와 무관한 두 번째 요소로 읽힌다(실측·육안).
  // 마침표가 실제로 앉는 자리도 칸의 앞쪽이다.
  const 점중심x = 칸 * 1.22;
  const 점중심y = 0 - 점반지름; // baseline 바로 위(마침표 자리)

  // 묶음 전체의 경계 — 글자와 점을 함께 감싼다
  const minX = Math.min(bb.x1, 점중심x - 점반지름);
  const maxX = Math.max(bb.x2, 점중심x + 점반지름);
  const minY = Math.min(bb.y1, 점중심y - 점반지름);
  const maxY = Math.max(bb.y2, 점중심y + 점반지름);
  const w = maxX - minX;
  const h = maxY - minY;

  // 목표 가로폭에 맞춰 축척하고 캔버스 정중앙에 놓는다
  const 목표 = size * 차지;
  const s = 목표 / w;
  const dx = (size - w * s) / 2 - minX * s;
  const dy = (size - h * s) / 2 - minY * s;

  const d = p0.toPathData(3);
  return `
  <g transform="translate(${dx.toFixed(3)} ${dy.toFixed(3)}) scale(${s.toFixed(6)})">
    <path d="${d}" fill="${글자색}"/>
    <circle cx="${점중심x.toFixed(3)}" cy="${점중심y.toFixed(3)}" r="${점반지름.toFixed(3)}" fill="${점색}"/>
  </g>`;
}

function svg(size, { 배경, 차지, 글자색, 점색 }) {
  const bg = 배경 ? `<rect width="${size}" height="${size}" fill="${배경}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${마크(
    size,
    차지,
    글자색,
    점색
  )}</svg>`;
}

async function 쓰기(name, size, opts) {
  const buf = Buffer.from(svg(size, opts));
  const file = path.join(OUT, name);
  await sharp(buf).png({ compressionLevel: 9 }).toFile(file);
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`  ✔ ${name.padEnd(32)} ${size}px  ${kb}KB`);
}

async function main() {
  console.log('\n브랜드 아이콘 생성 — Ink Deep / Paper / Coral 1점(양모 밤)\n');

  // 일반 아이콘(iOS·스토어). 배경 전면 Navy 2.
  await 쓰기('icon.png', 1024, { 배경: NAVY2, 차지: 0.56, 글자색: CREAM, 점색: CORAL });

  // Android adaptive — foreground는 **중앙 66% 안전영역**을 넘으면 잘린다.
  await 쓰기('android-icon-foreground.png', 1024, { 배경: null, 차지: 0.36, 글자색: CREAM, 점색: CORAL });
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: NAVY2 },
  })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, 'android-icon-background.png'));
  console.log(`  ✔ ${'android-icon-background.png'.padEnd(32)} 1024px  단색 ${NAVY2}`);

  // monochrome — OS가 테마 색으로 칠한다. 알파만 쓰이므로 전부 흰색 한 도형으로.
  await 쓰기('android-icon-monochrome.png', 1024, {
    배경: null,
    차지: 0.36,
    글자색: '#FFFFFF',
    점색: '#FFFFFF',
  });

  // 스플래시 — 배경색은 app.json 이 칠한다.
  await 쓰기('splash-icon.png', 1024, { 배경: null, 차지: 0.44, 글자색: CREAM, 점색: CORAL });

  // 파비콘 — 작아서 배경을 깔아야 읽힌다.
  await 쓰기('favicon.png', 64, { 배경: NAVY2, 차지: 0.56, 글자색: CREAM, 점색: CORAL });

  console.log('\n색 원천 = SYNK-appsscript docs/디자인_토큰.json (「양모 밤」 · 유호 확정 2026-08-20 · 조항 ⓚ)\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
