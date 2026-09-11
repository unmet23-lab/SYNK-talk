#!/usr/bin/env node
'use strict';

// 선택된 원본을 복사·형식 변환·단순 축소한다. 생성·재색칠·크롭·배경 제거는 하지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { 인자게이트 } = require('../lib/플래그.js');
const { 형제정본 } = require('../lib/형제정본.js');

const args = process.argv.slice(2);
const 아는플래그 = ['--원본'];
const 플래그오류 = 인자게이트('교수장면자산반입', args, 아는플래그);
if (플래그오류 || (args.length && (args.length !== 2 || args[0] !== '--원본' || args[1].startsWith('--')))) {
  console.error(플래그오류 || '사용법: node tools/교수장면자산반입.js [--원본 <연구실 PNG 경로>]');
  process.exit(2);
}

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'assets/교수작업실');
const professorManifest = 'docs/캐릭터/교수연구실/정본.json';
const originalCutout = 'C:/Users/q1212/.codex/generated_images/01a08bec-1f1d-7903-b772-c36f94a712f1/exec-f237abae-15b7-434e-85e8-42fd66c779a0.png';
const preservedCutout = path.join(root, 'tmp/교수작업실소스/notebook-cutout-source.png');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const slash = value => value.replace(/\\/g, '/');

const sources = [
  { name: 'research', canonical: 'docs/캐릭터/교수연구실/research.png',
    canonicalManifest: professorManifest, professorKey: 'research', native: true,
    ...(args.length ? { source: path.resolve(args[1]) } : {}),
    usage: 'PC G1 교수 연구실의 현재 장면. 작은 펠트 콧수염을 추가하고 원본 전체 화폭을 유지한다.' },
  { name: 'research-blink', canonical: 'docs/캐릭터/교수연구실/research-blink.png',
    canonicalManifest: professorManifest, professorKey: 'research-blink', native: true,
    usage: '같은 콧수염을 가진 교수 눈감음 참조. 안경 안쪽 두 눈만 국소 표시하며 전체 장면은 교체하지 않는다.' },
  { name: 'envelope', canonical: 'docs/Loom_자산/구움/공방_편지봉투.avif',
    canonicalManifest: 'docs/Loom_자산/구움/공방_편지봉투.출처.json',
    usage: '현재 정본의 온전한 펠트 봉투. 간결한 부탁·편지 책갈피에 사용한다.' },
  { name: 'notebook', canonical: 'docs/Loom_자산/구움/공방_공책과연필.avif',
    sha256: '4d5b4df9ec676c4d0bec63269d70e4f3a78bc8708dd75abfac725a285fa079d4', width: 4096, height: 4096,
    usage: '배경 제거 ImageGen의 참조 전용. 불투명 사각 이미지이며 현재 UI에서는 사용하지 않는다.' },
  { name: 'notebook-cutout', source: fs.existsSync(preservedCutout) ? preservedCutout : originalCutout,
    original: originalCutout, native: true, requireAlpha: true,
    preserved: 'tmp/교수작업실소스/notebook-cutout-source.png',
    sha256: 'e1f4acffc768c73b7691ab373a6c71f406ee2351b5630d14f1d142a8b70e0a09', width: 1254, height: 1254,
    usage: '현재 PC G1 UI의 편지 작성·기록 소품. 공책과 연필만 남긴 투명 이미지.',
    generation: {
      tool: 'Codex built-in ImageGen', operation: '참조 이미지의 밝은 천 배경 제거',
      model_label: '정확한 모델명은 이 반입 작업에서 확인하지 않음',
      instruction_from_task: 'coralwoolfelt notebook+creamelasticstrap+onewoodpencilexactidentity, removeonlycreamfabricground, fullobjectcentered,RGBAtransparent,maxnativeres,noextrashapes.',
      references: [{ path: 'assets/교수작업실/notebook.webp', width: 1536, height: 1536,
        sha256: '899dd290cc7995eb98e6d9e9472184c014b60175149eee8ff62c62f4da0a034a' }],
      resolution_note: '편집 원본 실제 1254×1254. 원래 4096px 소품이나 1536px 참조의 해상도를 유지했다고 표기하지 않는다.',
    } },
  { name: 'calendar', canonical: 'docs/Loom_자산/구움/공방_달력.avif',
    sha256: '57879d05405193dbde49561deed502d20be2fdab05397725e33047a95c22f85d', width: 2470, height: 2970,
    usage: '일정·기한을 가리키는 펠트 달력 소품.' },
];
const referenceSources = [
  { path: 'assets/장면/편지작업실.webp', role: '기존 펠트 스튜디오의 재질·조명 참조',
    sha256: 'f638c65421a3057d20e7dda0bb3c4d517c1ffd90a8c1fc6a29bcdba5434a5461' },
  { path: 'assets/npc/prof-calm.webp', role: '교수의 형태·색·안경·눈 참조',
    sha256: '1f8f5ad7471b33a8617e5d08dad2c15e3b3824c303c01be0707af21aac2a0740' },
];

(async () => {
  const canonicalRoot = 형제정본(root);
  const currentSources = sources.map(entry => {
    if (!entry.canonicalManifest) return entry;
    const manifestBytes = fs.readFileSync(path.join(canonicalRoot, entry.canonicalManifest));
    const record = JSON.parse(manifestBytes.toString('utf8'));
    if (entry.professorKey) {
      const current = record.assets?.[entry.professorKey];
      if (record.id !== '교수연구실' || record.status !== 'current' || current?.path !== entry.canonical ||
          !/^[a-f0-9]{64}$/.test(current.sha256) || current.width !== 1672 || current.height !== 941 ||
          !Number.isInteger(current.bytes) || current.bytes <= 0 || current.has_alpha !== false ||
          typeof record.generation?.prompt !== 'string') {
        throw new Error('교수 연구실의 현재 정본 출처가 유효하지 않습니다. 과거 콧수염 없는 사본으로 대체하지 않습니다.');
      }
      return { ...entry, sha256: current.sha256, width: current.width, height: current.height,
        expectedBytes: current.bytes, generation: { ...record.generation, composite: record.composite },
        canonicalRecord: { manifest_sha256: sha(manifestBytes), encoding: 'PNG lossless; native 1672×941', source: record.inputs.moustache } };
    }
    const canonical = record.canonical;
    if (record.id !== '공방_편지봉투' || record.status !== 'current' ||
        !canonical || canonical.path !== entry.canonical ||
        !/^[a-f0-9]{64}$/.test(canonical.sha256) ||
        !Number.isInteger(canonical.width) || canonical.width <= 0 ||
        !Number.isInteger(canonical.height) || canonical.height <= 0 ||
        !Number.isInteger(canonical.bytes) || canonical.bytes <= 0 || canonical.has_alpha !== true ||
        !record.generation || typeof record.generation.prompt !== 'string' ||
        typeof record.generation.cleanup_prompt !== 'string') {
      throw new Error('봉투의 현재 정본 출처가 유효하지 않습니다. 과거 봉투로 대체하지 않습니다.');
    }
    return { ...entry, sha256: canonical.sha256, width: canonical.width, height: canonical.height,
      expectedBytes: canonical.bytes, requireAlpha: true, generation: record.generation,
      canonicalRecord: { manifest_sha256: sha(manifestBytes), encoding: record.encoding, source: record.source } };
  });
  const references = await Promise.all(referenceSources.map(async entry => {
    const bytes = fs.readFileSync(path.join(root, entry.path));
    if (sha(bytes) !== entry.sha256) throw new Error(`참조 자산 지문이 다릅니다: ${entry.path}`);
    const meta = await sharp(bytes).metadata();
    return { ...entry, width: meta.width, height: meta.height };
  }));
  const prepared = await Promise.all(currentSources.map(async entry => {
    const sourcePath = entry.source || path.join(canonicalRoot, entry.canonical);
    const bytes = fs.readFileSync(sourcePath);
    if (sha(bytes) !== entry.sha256) throw new Error(`선택된 원본 지문이 다릅니다: ${entry.name}`);
    if (entry.expectedBytes && bytes.length !== entry.expectedBytes) throw new Error(`원본 바이트 수가 다릅니다: ${entry.name}`);
    const meta = await sharp(bytes).metadata();
    if (meta.width !== entry.width || meta.height !== entry.height) throw new Error(`원본 치수가 다릅니다: ${entry.name}`);
    if (entry.requireAlpha && !meta.hasAlpha) throw new Error(`투명 원본이 아닙니다: ${entry.name}`);
    let pipeline = sharp(bytes);
    if (!entry.native) pipeline = pipeline.resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true });
    const output = await pipeline.webp({ quality: 96, alphaQuality: 100, effort: 6 }).toBuffer();
    const outMeta = await sharp(output).metadata();
    if (outMeta.width > meta.width || outMeta.height > meta.height || outMeta.hasAlpha !== meta.hasAlpha) {
      throw new Error(`무확대·알파 보존 조건이 깨졌습니다: ${entry.name}`);
    }
    return { bytes, output, record: {
      name: entry.name,
      usage: entry.usage,
      source: { path: slash(entry.original || sourcePath), canonical_path: entry.canonical || null,
        sha256: entry.sha256, width: meta.width, height: meta.height, bytes: bytes.length,
        format: meta.format, has_alpha: meta.hasAlpha,
        ...(entry.canonicalRecord ? {
          canonical_manifest: { path: entry.canonicalManifest, sha256: entry.canonicalRecord.manifest_sha256 },
          canonical_encoding: entry.canonicalRecord.encoding, generated_source: entry.canonicalRecord.source,
        } : {}) },
      preserved_source: entry.preserved || null,
      ...(entry.generation ? { generation: entry.generation } : {}),
      output: { path: `assets/교수작업실/${entry.name}.webp`, sha256: sha(output),
        width: outMeta.width, height: outMeta.height, bytes: output.length, format: outMeta.format, has_alpha: outMeta.hasAlpha },
      transform: { webp_quality: 96, alpha_quality: 100, effort: 6,
        resize: entry.native ? null : { max_width: 1536, max_height: 1536, fit: 'inside', without_enlargement: true },
        crop: false, recolor: false, background_removal: false, upscale: false },
    } };
  }));
  const cutoutReference = sources.find(entry => entry.name === 'notebook-cutout').generation.references[0];
  if (prepared.find(item => item.record.name === 'notebook').record.output.sha256 !== cutoutReference.sha256) {
    throw new Error('공책 생성 참조의 지문이 달라졌습니다. 인코더와 원본을 확인하세요.');
  }
  const manifest = {
    date: '2026-09-11',
    usage: 'PC G1 펠트 게임용 연구실과 소품. Android 빌드·배포와 무관하다.',
    generator: 'tools/교수장면자산반입.js',
    encoder: { sharp: sharp.versions.sharp, libvips: sharp.versions.vips, webp: sharp.versions.webp },
    generation: { ...currentSources.find(entry => entry.name === 'research').generation,
      model_label: '정확한 모델명은 이 반입 작업에서 확인하지 않음', native_width: 1672, native_height: 941, references },
    assets: prepared.map(item => item.record),
  };
  fs.mkdirSync(outputDir, { recursive: true });
  for (const item of prepared) {
    if (item.record.preserved_source) {
      const preserved = path.join(root, item.record.preserved_source);
      fs.mkdirSync(path.dirname(preserved), { recursive: true });
      fs.writeFileSync(preserved, item.bytes);
    }
    fs.writeFileSync(path.join(root, item.record.output.path), item.output);
  }
  fs.writeFileSync(path.join(outputDir, '출처.json'), JSON.stringify(manifest, null, 2) + '\n');
  const readmePath = path.join(outputDir, 'README.md');
  const sceneParagraph = fs.existsSync(readmePath)
    ? fs.readFileSync(readmePath, 'utf8').split(/\r?\n\r?\n/).find(p => p.includes('[가이드장면출처.json]')) : null;
  fs.writeFileSync(readmePath, [
    '# 교수 작업실 자산', '',
    'PC G1 펠트 게임용 장면과 소품. 출처·지문·치수·인코더 판은 [출처.json](출처.json)에 있다.', '',
    ...(sceneParagraph ? [sceneParagraph, ''] : []),
    '- 연구실: Apps Script `docs/캐릭터/교수연구실/정본.json`이 지정한 작은 펠트 콧수염의 현재 원본을 읽는다. 내장 ImageGen의 콧수염 영역만 원래 사진에 반영했으며 화폭·안경·방은 유지했다. 실제 1672×941이며 4K 원본이 아니다.',
    '- 교수 눈감음: research-blink.webp도 같은 콧수염의 1672×941 원천이다. 살아있는교수연구실은 안경 안 두 눈만 좁은 타원으로 잘라 표시한다. 콧수염·몸·털·책상·방은 고정되고 눈감음 때 전체 장면을 갈아끼우지 않는다.',
    '- 봉투는 Apps Script의 `docs/Loom_자산/구움/공방_편지봉투.출처.json`이 current로 지정한 AVIF를 읽는다. 지문·치수·바이트 수·알파를 확인하고 무확대 WebP로 변환한다. 출처가 없거나 실물과 다르면 쓰기 전에 멈추며, 거부된 봉투의 옛 사본으로 대체하지 않는다.',
    '- 공책 참조·달력은 기존 Loom AVIF를 긴 변 최대 1536px로만 축소했다. 봉투·달력의 알파는 보존한다.',
    '- 현재 UI는 notebook-cutout.webp를 사용한다. 내장 ImageGen이 notebook.webp의 밝은 천 배경을 제거한 RGBA 원본을 1254×1254 그대로 WebP 품질 96으로 변환했다. 원본 알파를 보존한다.',
    '- notebook.webp는 그 편집의 참조 전용이다. 원래 불투명한 4096×4096 소품을 1536×1536으로 변환한 파일이며 현재 UI에서는 사용하지 않는다.',
    '- 교수 원본·생성 재료·정확한 국소 합성 좌표는 Apps Script `docs/캐릭터/교수연구실/`에 보존한다. 예전 tmp 연구실은 현재 반입 원천이 아니다. 투명 공책의 PNG 바이트 사본은 Git 제외 경로 `tmp/교수작업실소스/notebook-cutout-source.png`에 보존한다.',
    '- 이 반입 단계는 형식 변환·단순 축소만 한다. 크롭·재색칠·배경 제거·확대는 호출하지 않는다. 앞선 ImageGen 배경 제거와 반입 단계는 출처에서 구분한다.', '',
    '| 파일 | 실제 크기 | 바이트 | 용도 |', '|---|---|---:|---|',
    ...prepared.map(({ record: r }) => `| ${r.name}.webp | ${r.output.width}×${r.output.height} | ${r.output.bytes} | ${r.usage} |`), '',
    '재생성: `node tools/교수장면자산반입.js`. 교수·봉투는 현재 정본 출처에서 읽으며 임시·과거 사본으로 돌아가지 않는다. 다른 위치의 현재 연구실과 동일한 PNG만 `--원본 <경로>`로 지정할 수 있다. 교수 국소 합성 자체의 재현은 `node tools/교수콧수염반영.js`를 먼저 실행한다. 투명 공책 PNG를 옮겼다면 기록된 `tmp/교수작업실소스/notebook-cutout-source.png` 위치에 동일 바이트를 둔다. Apps Script 정본 위치는 기존 `SYNK_APPSSCRIPT_ROOT`를 따른다.', '',
    '이 도구는 새 이미지 생성·의미 편집을 호출하지 않는다. 실제 화면 배치·상호작용 검증은 화면 담당이 수행한다.', '',
  ].join('\n'));
  const envelope = prepared.find(item => item.record.name === 'envelope').record;
  const promptPath = path.join(outputDir, '제작프롬프트.md');
  const promptStart = '<!-- current-envelope:start -->';
  const promptEnd = '<!-- current-envelope:end -->';
  const promptSection = [promptStart, '## 현재 봉투 교체', '',
    '찢긴 가장자리를 지적받은 봉투를 온전한 윤곽의 새 원본으로 교체했다. 이전 봉투는 현재 참조·반입 목록에서 사용하지 않는다.', '',
    `현재 원천: Apps Script \`${envelope.source.canonical_path}\`. 담당 출처: \`${envelope.source.canonical_manifest.path}\`. 아래 요청은 그 출처의 generation에서 읽는다.`, '',
    `실제 반입 원천 ${envelope.source.width}×${envelope.source.height} AVIF, SHA-256 \`${envelope.source.sha256}\`. Talk 출력은 ${envelope.output.width}×${envelope.output.height} WebP 품질 96이다. 확대·크롭·추가 이미지 편집은 하지 않는다.`, '',
    '### 생성 요청', '', '```text', envelope.generation.prompt, '```', '',
    '### 외곽 교정 요청', '', '```text', envelope.generation.cleanup_prompt, '```', '',
    '새 생성·교정은 내장 ImageGen으로 수행했다. 이 반입 도구는 위 AI 호출을 반복하지 않으며, 현재 정본 파일의 형식 변환만 수행한다.',
    promptEnd].join('\n');
  const previousPrompts = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : '# 교수 작업실 · 실제 ImageGen 요청\n';
  const startAt = previousPrompts.indexOf(promptStart);
  const endAt = previousPrompts.indexOf(promptEnd);
  if ((startAt < 0) !== (endAt < 0) || (startAt >= 0 && endAt < startAt)) throw new Error('봉투 제작 프롬프트 구간 표식이 잘못됐습니다.');
  fs.writeFileSync(promptPath, startAt >= 0
    ? previousPrompts.slice(0, startAt) + promptSection + previousPrompts.slice(endAt + promptEnd.length)
    : previousPrompts.trimEnd() + '\n\n' + promptSection + '\n');
  const professor = prepared.find(item => item.record.name === 'research').record;
  const professorStart = '<!-- current-professor:start -->';
  const professorEnd = '<!-- current-professor:end -->';
  const professorSection = [professorStart, '## 현재 교수 콧수염', '',
    `현재 원천: Apps Script \`${professor.source.canonical_path}\`. 담당 출처: \`${professor.source.canonical_manifest.path}\`.`, '',
    '안경 아래에 작은 펠트 콧수염을 추가했다. 내장 ImageGen 생성 그림에서 정본에 기록한 좁은 영역만 반영하여 기존 방·몸·안경·화폭을 보존한다. 눈감음 원천도 같은 콧수염을 유지한다. 이전 교수 생성 요청은 편집 전 이력이며 현재 원천 선택에 사용하지 않는다.', '',
    '```text', professor.generation.prompt, '```', '',
    '실제 생성과 현재 원천은 1672×941이다. 4K 생성·확대는 하지 않았다. 국소 합성은 tools/교수콧수염반영.js, 현재 원천의 형식 변환은 이 반입 도구가 담당한다.', professorEnd].join('\n');
  const withEnvelope = fs.readFileSync(promptPath, 'utf8');
  const profStartAt = withEnvelope.indexOf(professorStart);
  const profEndAt = withEnvelope.indexOf(professorEnd);
  if ((profStartAt < 0) !== (profEndAt < 0) || (profStartAt >= 0 && profEndAt < profStartAt)) throw new Error('교수 제작 프롬프트 구간 표식이 잘못됐습니다.');
  fs.writeFileSync(promptPath, profStartAt >= 0
    ? withEnvelope.slice(0, profStartAt) + professorSection + withEnvelope.slice(profEndAt + professorEnd.length)
    : withEnvelope.trimEnd() + '\n\n' + professorSection + '\n');
  console.log(JSON.stringify({ professor_source_sha256: manifest.assets.find(a => a.name === 'research').source.sha256, assets: manifest.assets }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
