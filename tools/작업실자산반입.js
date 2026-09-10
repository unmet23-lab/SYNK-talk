#!/usr/bin/env node
'use strict';

// 선택된 생성 원본을 앱 전송 형식으로만 바꾼다. 생성/편집 프롬프트는 장면 출처에 있다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const record = JSON.parse(fs.readFileSync(path.join(root, 'assets/장면/편지작업실_출처.json'), 'utf8'));
const at = process.argv.indexOf('--원본');
const source = at >= 0 ? path.resolve(process.argv[at + 1]) : record.source;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

(async () => {
  const bytes = fs.readFileSync(source);
  if (sha(bytes) !== record.source_sha256) throw new Error('Selected studio source differs from recorded image');
  const meta = await sharp(bytes).metadata();
  if (meta.width !== record.width || meta.height !== record.height) throw new Error('Studio source dimensions differ');
  const output = await sharp(bytes).webp({ quality: 90, effort: 6 }).toBuffer();
  if (sha(output) !== record.output_sha256) throw new Error('Encoded image differs; inspect encoder/source before replacing the app asset');
  fs.writeFileSync(path.join(root, record.output), output);
  console.log(`Letter studio imported: ${meta.width}x${meta.height}, ${output.length} bytes, no upscaling`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
