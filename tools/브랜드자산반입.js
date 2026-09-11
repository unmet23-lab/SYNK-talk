#!/usr/bin/env node
'use strict';

// 승인 원본에서 앱 전송용 파생만 만든다. 원본 재생성·재염색은 하지 않는다.
// 학생 접점 LAB 로고는 현재 브랜드킷의 완성 조합을 그대로 반입한다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { 인자게이트 } = require('../lib/플래그.js');
const args = process.argv.slice(2);
const 아는플래그 = ['--정본'];
const 플래그오류 = 인자게이트('브랜드자산반입', args, 아는플래그);
if (플래그오류 || (args.length && (args.length !== 2 || args[0] !== '--정본' || args[1].startsWith('--')))) {
  console.error(플래그오류 || '사용법: node tools/브랜드자산반입.js [--정본 <저장소 경로>]');
  process.exit(2);
}
const root = path.resolve(__dirname, '..');
const at = process.argv.indexOf('--정본');
const canonical = path.resolve(at >= 0 ? process.argv[at + 1] : path.join(root, '..', 'SYNK-appsscript'));
const out = path.join(root, 'assets', '브랜드');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const kit = path.join(canonical, 'docs', '홍보물', '마케팅실행_20260909', '브랜드킷');
  const manifestPath = path.join(kit, '배치명세.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const approved = manifest.items.find(item => item.brand === 'LAB' && item.variant === 'Paper');
  if (!approved) throw new Error('Current brand kit has no approved LAB Paper combination');
  const logoPath = path.join(kit, approved.file);
  const logoBytes = fs.readFileSync(logoPath);
  if (sha(logoBytes) !== approved.sha256) throw new Error('LAB source differs from the current placement manifest');
  const logoMetadata = await sharp(logoBytes).metadata();
  if (logoMetadata.width !== approved.width || logoMetadata.height !== approved.height || !logoMetadata.hasAlpha) {
    throw new Error('LAB source dimensions or alpha differ from the current placement manifest');
  }
  const mascot = require(path.join(canonical, 'tools', 'lib', '마스코트자산.js'));
  const edgePath = path.join(canonical, 'docs/캐릭터/정본_4K/외곽교정_정본.json');
  const edgeManifest = fs.existsSync(edgePath) ? JSON.parse(fs.readFileSync(edgePath, 'utf8')) : null;
  const mascotSources = {
    몽글: mascot.절대경로('본체'),
    까몽: path.join(canonical, mascot.까몽경로('본체')),
    마린: path.join(canonical, mascot.마린경로('본체')),
  };
  const sources = {};
  const smallLogo = path.join(out, 'SYNK-LAB-Paper.webp');
  await sharp(logoBytes).resize({ width: 1024, withoutEnlargement: true, kernel: 'lanczos3' })
    .webp({ quality: 96, effort: 6 }).toFile(smallLogo);
  const logoOutput = await sharp(smallLogo).metadata();
  sources.LAB로고 = {
    source: logoPath, sourceSize: [logoMetadata.width, logoMetadata.height], sourceSha256: sha(logoBytes),
    placementManifest: manifestPath, placementManifestSha256: sha(fs.readFileSync(manifestPath)),
    variant: 'LAB Paper; SYNK without stitches; original coral LAB with stitches',
    output: 'assets/브랜드/SYNK-LAB-Paper.webp', outputSize: [logoOutput.width, logoOutput.height],
    outputSha256: sha(fs.readFileSync(smallLogo)),
    transform: 'approved photographic LAB composition; proportional LANCZOS3; WebP quality=96; original frame, alpha, spacing, colors and shapes preserved; no upscaling',
    sourceResolutionNote: 'Placement composition is 3468x1082; kit documents edited surface inputs of 1804x872 and 1788x880. Canvas size does not establish native 4K surface detail.',
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
    const edge = edgeManifest?.files.find(item => item.path.endsWith(`/${character}_본체.png`));
    if (edge?.outputSha256 === sources[character].sourceSha256) {
      sources[character].edgeCorrection = {
        manifest: edgePath, manifestSha256: sha(fs.readFileSync(edgePath)),
        generator: edgeManifest.generator, resolutionNote: edgeManifest.resolutionNote,
        method: 'Current source already contains verified exterior white-matte RGB and alpha repair; import keeps that contour.',
      };
    }
  }
  fs.writeFileSync(path.join(out, '출처.json'), JSON.stringify(sources, null, 2) + '\n');
  console.log('Current canonical sources imported: approved LAB Paper composition, Mongle, Kkamong, Marin. See assets/브랜드/출처.json.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
