#!/usr/bin/env node
'use strict';

// 장면 정본에 등록된 슬픈 렌즈·눈물만 반입한다. 몸과 배경은 생성 원본에서 가져오지 않는다.
// 사용: node tools/가이드장면표정반입.js [--정본 <SYNK-appsscript 경로>]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { 형제정본 } = require('../lib/형제정본.js');
const ROOT = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function 반입(canonical = 형제정본(ROOT)) {
  const manifestPath = path.join(ROOT, 'assets/브랜드/가이드눈마스크.json');
  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  const spec = manifest.sceneExpressions.마린_속상함;
  const sourceManifestBytes = fs.readFileSync(path.join(canonical, spec.sourceManifest));
  const sourceManifest = JSON.parse(sourceManifestBytes.toString('utf8'));
  const entry = sourceManifest.expressions?.[spec.sceneExpressionId];
  if (!entry?.source) throw Error('현재 장면 정본에서 슬픈 마린의 출처를 찾지 못했다.');
  const sourcePath = entry.source.path;
  const source = fs.readFileSync(path.join(canonical, sourcePath));
  const metadata = await sharp(source).metadata();
  if (sha(source) !== entry.source.sha256 || metadata.width !== entry.source.width || metadata.height !== entry.source.height) {
    throw Error('슬픈 마린 원본과 장면 정본의 지문·치수가 다르다.');
  }
  const [width, height] = spec.frameSize;
  const raw = Buffer.alloc(width * height * 4);
  // 원본은 재구도로 눈 위치가 달라졌다. 얼굴 전체를 늘리지 않고 렌즈별 사각을 현재 눈에 등록한다.
  for (const { sourceRect: [sx, sy, sw, sh], targetRect: [tx, ty, tw, th] } of spec.patches) {
    if (sx < 0 || sy < 0 || sx + sw > metadata.width || sy + sh > metadata.height || tx < 0 || ty < 0 || tx + tw > width || ty + th > height) {
      throw Error('슬픈 렌즈의 반입 좌표가 원본 또는 앱 캔버스를 벗어났다.');
    }
    const patch = await sharp(source).extract({ left: sx, top: sy, width: sw, height: sh })
      .resize(tw, th, { fit: 'fill', kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
    for (let y = 0; y < th; y++) patch.copy(raw, ((ty + y) * width + tx) * 4, y * tw * 4, (y + 1) * tw * 4);
  }
  // 타원 경계의 한 픽셀 안쪽에서만 부드럽게 닫는다. 바깥 털·몸·의상은 복사하지 않는다.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let coverage = 0;
    for (const { shape, rect: [left, top, w, h] } of spec.regions) {
      if (shape !== 'ellipse') throw Error('지원하지 않는 표정 마스크');
      const nx = (x + 0.5 - left - w / 2) / (w / 2);
      const ny = (y + 0.5 - top - h / 2) / (h / 2);
      const distance = (1 - Math.sqrt(nx * nx + ny * ny)) * Math.min(w, h) / 2;
      coverage = Math.max(coverage, Math.max(0, Math.min(1, distance)));
    }
    const i = (y * width + x) * 4;
    raw[i + 3] = Math.round(raw[i + 3] * coverage);
    if (!raw[i + 3]) raw[i] = raw[i + 1] = raw[i + 2] = 0;
  }
  const output = path.join(ROOT, spec.frame);
  await sharp(raw, { raw: { width, height, channels: 4 } }).webp({ lossless: true, effort: 6 }).toFile(output);
  spec.sourceSha256 = sha(source);
  spec.source = sourcePath;
  spec.sourceManifestSha256 = sha(sourceManifestBytes);
  spec.sourceSize = [metadata.width, metadata.height];
  spec.frameSha256 = sha(fs.readFileSync(output));
  const start = manifestText.indexOf('  "sceneExpressions": {');
  const end = manifestText.indexOf('  "characters": {');
  if (start < 0 || end <= start) throw Error('장면 표정 출처 칸의 위치를 확인한다.');
  const block = JSON.stringify({ sceneExpressions: manifest.sceneExpressions }, null, 2).slice(2, -2) + ',\n';
  fs.writeFileSync(manifestPath, manifestText.slice(0, start) + block + manifestText.slice(end));
  console.log(`${spec.frame}: 현재 장면의 렌즈·눈물 영역 반입 완료. 본체·전역 감정 어휘 유지.`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--정본' || args[1].startsWith('--'))) {
    console.error('사용법: node tools/가이드장면표정반입.js [--정본 <저장소 경로>]');
    process.exitCode = 2;
  } else 반입(args[1] && path.resolve(args[1])).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { 반입 };
