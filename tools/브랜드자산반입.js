#!/usr/bin/env node
'use strict';

// 승인 원본에서 앱 전송용 파생만 만든다. 원본 재생성·재염색은 하지 않는다.
// 내부 로고의 형상·색·재질은 appsscript의 실행 정본이 전부 소유한다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const at = process.argv.indexOf('--정본');
const canonical = path.resolve(at >= 0 ? process.argv[at + 1] : path.join(root, '..', 'SYNK-appsscript'));
const out = path.join(root, 'assets', '브랜드');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const logoPath = path.join(canonical, 'tools', 'lib', '로고정본.js');
  const tokensPath = path.join(canonical, 'docs', '디자인_토큰.json');
  const logo = require(logoPath);
  const mascot = require(path.join(canonical, 'tools', 'lib', '마스코트자산.js'));
  const mascotSources = {
    몽글: mascot.절대경로('본체'),
    까몽: path.join(canonical, mascot.까몽경로('본체')),
    마린: path.join(canonical, mascot.마린경로('본체')),
  };
  const sources = {};
  const svg = logo.워드마크({ 판: '다크', 신호: '꺾쇠', 표현: '펠트' });
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const width = 4096;
  const height = Math.round(width * viewBox[3] / viewBox[2]);
  const sizedSvg = svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `);
  fs.writeFileSync(path.join(out, '내부로고.svg'), sizedSvg);
  const largeLogo = path.join(out, '내부로고_4K.png');
  // appsscript tools/앱로고굽기.js와 같은 Chrome SVG 렌더 경로다.
  // libvips의 SVG 필터 해석으로 현재 펠트 표현을 바꾸지 않는다.
  const renderRoot = path.join(root, 'tmp', '브랜드자산렌더');
  fs.mkdirSync(renderRoot, { recursive: true });
  const renderDir = fs.mkdtempSync(path.join(renderRoot, 'run-'));
  const renderedLogo = path.join(renderDir, '내부로고_4K.png');
  const htmlPath = path.join(renderDir, '내부로고.html');
  fs.writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style>${sizedSvg}`);
  console.log('Rendering current internal logo at 4096px with the existing Chrome path.');
  execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--force-device-scale-factor=1', '--default-background-color=00000000',
    `--user-data-dir=${path.join(renderDir, 'profile')}`, `--screenshot=${renderedLogo}`,
    `--window-size=${width},${height}`, `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { stdio: 'pipe', windowsHide: true, timeout: 120000 });
  fs.copyFileSync(renderedLogo, largeLogo);
  const smallLogo = path.join(out, '내부로고.webp');
  const alpha = await sharp(largeLogo).extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha.data[y * width + x] > 0) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left) throw new Error('Internal logo render has no visible alpha');
  const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const margin = Math.ceil(bounds.width * 0.01);
  const cropped = await sharp(largeLogo).extract(bounds).png().toBuffer();
  const padded = await sharp(cropped).extend({
    top: margin, bottom: margin, left: margin, right: margin,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
  await sharp(padded).resize({ width: 1024 }).webp({ quality: 96, effort: 6 }).toFile(smallLogo);
  const logoOutput = await sharp(smallLogo).metadata();
  sources.내부로고 = {
    source: logoPath, sourceSha256: sha(fs.readFileSync(logoPath)),
    tokens: tokensPath, tokensSha256: sha(fs.readFileSync(tokensPath)),
    options: { 판: '다크', 신호: '꺾쇠', 표현: '펠트' },
    master: 'assets/브랜드/내부로고_4K.png', masterSize: [width, height],
    masterSha256: sha(fs.readFileSync(largeLogo)),
    output: 'assets/브랜드/내부로고.webp', outputSize: [logoOutput.width, logoOutput.height],
    alphaBounds: bounds, paddingAtMasterScale: margin,
    outputSha256: sha(fs.readFileSync(smallLogo)),
    transform: 'canonical SVG rasterized at 4096px; derivative trimmed to nonzero alpha plus 1% width padding; proportional WebP; no shape edits',
  };
  for (const character of ['몽글', '까몽', '마린']) {
    const source = mascotSources[character];
    const metadata = await sharp(source).metadata();
    if (metadata.width !== 4096 || metadata.height !== 4096 || !metadata.hasAlpha) {
      throw new Error(`${character}: 4096 square transparent source required`);
    }
    const output = path.join(out, `${character}_본체.webp`);
    await sharp(source).resize(1024, 1024, { kernel: 'lanczos3' }).webp({ quality: 96, effort: 6 }).toFile(output);
    sources[character] = {
      source, sourceSize: [metadata.width, metadata.height], sourceSha256: sha(fs.readFileSync(source)),
      output: `assets/브랜드/${character}_본체.webp`, outputSize: [1024, 1024],
      outputSha256: sha(fs.readFileSync(output)), transform: 'LANCZOS3; WebP quality=96; source frame and alpha preserved',
    };
  }
  fs.writeFileSync(path.join(out, '출처.json'), JSON.stringify(sources, null, 2) + '\n');
  console.log('Current canonical sources imported: internal logo, Mongle, Kkamong, Marin. See assets/브랜드/출처.json.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
