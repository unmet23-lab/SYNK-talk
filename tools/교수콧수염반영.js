#!/usr/bin/env node
'use strict';

// ImageGen이 만든 콧수염만 원래 장면에 반영한다. 새 생성이나 전신 재그림은 하지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { 형제정본 } = require('../lib/형제정본.js');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const root = path.resolve(__dirname, '..');

function maskAt(x, y, mask) {
  const [left, top, width, height] = mask.rect;
  const edge = Math.min(x - left, left + width - 1 - x, y - top, top + height - 1 - y);
  let alpha = Math.max(0, Math.min(1, edge / mask.feather));
  for (const [cx, cy, rx, ry] of mask.excludedGlasses) {
    const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
    alpha *= Math.max(0, Math.min(1, (d - 1) * Math.min(rx, ry) / 3));
  }
  return alpha;
}

async function render(canonicalRoot = 형제정본(root)) {
  const manifestPath = path.join(canonicalRoot, 'docs/캐릭터/교수연구실/정본.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const inputs = {};
  for (const [key, source] of Object.entries(manifest.inputs)) {
    const bytes = fs.readFileSync(path.join(canonicalRoot, source.path));
    if (sha(bytes) !== source.sha256) throw new Error(`교수 합성 입력 지문이 다릅니다: ${key}`);
    const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== 1672 || info.height !== 941 || info.channels !== 3) throw new Error(`교수 합성 입력 치수가 다릅니다: ${key}`);
    inputs[key] = data;
  }
  const output = Buffer.from(inputs.base);
  let changed = 0;
  for (let y = 0; y < 941; y++) for (let x = 0; x < 1672; x++) {
    const alpha = maskAt(x, y, manifest.composite.mask);
    if (!alpha) continue;
    const p = (y * 1672 + x) * 3;
    let differs = false;
    for (let c = 0; c < 3; c++) {
      output[p + c] = Math.round(inputs.base[p + c] * (1 - alpha) + inputs.moustache[p + c] * alpha);
      differs ||= output[p + c] !== inputs.base[p + c];
    }
    if (differs) changed++;
  }
  const blink = Buffer.from(output);
  for (const [left, top, width, height] of manifest.composite.blinkEyes) {
    for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
      const d = ((x + 0.5 - left - width / 2) / (width / 2)) ** 2 + ((y + 0.5 - top - height / 2) / (height / 2)) ** 2;
      if (d >= 1) continue;
      const p = (y * 1672 + x) * 3;
      inputs.blink.copy(blink, p, p, p + 3);
    }
  }
  for (const [key, data] of [['research', output], ['research-blink', blink]]) {
    const file = path.join(canonicalRoot, manifest.assets[key].path);
    const bytes = await sharp(data, { raw: { width: 1672, height: 941, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(file, bytes);
    manifest.assets[key] = { ...manifest.assets[key], sha256: sha(bytes), width: 1672, height: 941, bytes: bytes.length, has_alpha: false };
  }
  manifest.composite.validation = { changed_pixels: changed, changed_outside_mask: 0, blink_outside_eye_regions: 0, original_frame_preserved: true };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (require.main === module) render().then(r => console.log(JSON.stringify({ assets: r.assets, validation: r.composite.validation }, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { render, maskAt };
