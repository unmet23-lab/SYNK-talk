#!/usr/bin/env node
'use strict';

// 현재 장면 정본을 읽어 앱용 WebP를 만든다. 원본 밖 생성 경로로 폴백하지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { 형제정본 } = require('../lib/형제정본.js');

const root = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  if (process.argv.length > 2) throw new Error('사용법: node tools/마린전략자산반입.js');
  const canonicalRoot = 형제정본(root);
  const manifestPath = 'docs/캐릭터/편지전략장면/정본.json';
  const manifestBytes = fs.readFileSync(path.join(canonicalRoot, manifestPath));
  const manifest = JSON.parse(manifestBytes);
  const expected = ['marin-plan', 'marin-notes', 'marin-letter'];
  if (manifest.assets.length !== expected.length || expected.some(name => !manifest.assets.some(a => a.name === name))) {
    throw new Error('마린 전략 장면 정본에 계획·기록·편지 세 장이 필요합니다.');
  }
  const prepared = await Promise.all(manifest.assets.map(async asset => {
    const source = path.resolve(canonicalRoot, asset.source.path);
    const relative = path.relative(canonicalRoot, source);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('원본이 정본 저장소 밖을 가리킵니다.');
    const bytes = fs.readFileSync(source);
    const meta = await sharp(bytes).metadata();
    if (sha(bytes) !== asset.source.sha256 || meta.width !== asset.source.width || meta.height !== asset.source.height) {
      throw new Error(`현재 정본 지문·치수가 다릅니다: ${asset.name}`);
    }
    const output = await sharp(bytes).resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 96, alphaQuality: 100, effort: 6 }).toBuffer();
    const out = await sharp(output).metadata();
    return { output, record: { name: asset.name, option_id: asset.option_id, meaning: asset.meaning,
      source: asset.source, output: { path: `assets/교수작업실/${asset.name}.webp`,
        sha256: sha(output), width: out.width, height: out.height, bytes: output.length },
      transform: { upscale: false, crop: false, recolor: false, webp_quality: 96 } } };
  }));
  const outputDir = path.join(root, 'assets/교수작업실');
  fs.mkdirSync(outputDir, { recursive: true });
  for (const asset of prepared) fs.writeFileSync(path.join(root, asset.record.output.path), asset.output);
  fs.writeFileSync(path.join(outputDir, '마린전략출처.json'), JSON.stringify({
    date: '2026-09-11', generator: 'tools/마린전략자산반입.js',
    canonical: { path: manifestPath, sha256: sha(manifestBytes) },
    scope: '마린의 편지 전략별 상황 연기. 다른 가이드나 전역 본체를 대체하지 않는다.',
    encoder: { sharp: sharp.versions.sharp, webp: sharp.versions.webp },
    assets: prepared.map(a => a.record),
  }, null, 2) + '\n');
  for (const asset of prepared) console.log(`${asset.record.name}: ${asset.record.output.width}×${asset.record.output.height} (${asset.output.length}B)`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
