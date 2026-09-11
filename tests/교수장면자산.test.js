'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { 형제정본 } = require('../lib/형제정본.js');
const { maskAt } = require('../tools/교수콧수염반영.js');
const root = path.resolve(__dirname, '..');
const canonicalRoot = 형제정본(root);
const manifestPath = path.join(canonicalRoot, 'docs/캐릭터/교수연구실/정본.json');
const available = fs.existsSync(manifestPath);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = () => JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const pixels = file => sharp(path.join(canonicalRoot, file)).removeAlpha().raw().toBuffer();

test('현재 교수 원천·반입 결과는 정본 지문과 실제 1672×941 화폭이 일치한다', { skip: !available }, async () => {
  const m = read();
  const imported = JSON.parse(fs.readFileSync(path.join(root, 'assets/교수작업실/출처.json'), 'utf8'));
  for (const source of [...Object.values(m.inputs), ...Object.values(m.assets)]) {
    const bytes = fs.readFileSync(path.join(canonicalRoot, source.path));
    assert.equal(sha(bytes), source.sha256, source.path);
    const metadata = await sharp(bytes).metadata();
    assert.deepEqual([metadata.width, metadata.height], [1672, 941]);
  }
  for (const name of ['research', 'research-blink']) {
    const entry = imported.assets.find(a => a.name === name);
    assert.equal(entry.source.sha256, m.assets[name].sha256);
    assert.equal(entry.source.canonical_manifest.sha256, sha(fs.readFileSync(manifestPath)));
    assert.equal(sha(fs.readFileSync(path.join(root, entry.output.path))), entry.output.sha256);
    assert.equal(entry.preserved_source, null, '현재 교수 원천은 임시 사본에 의존하지 않는다');
  }
});

test('콧수염 합성은 안경과 허용 영역 밖의 원래 사진 픽셀을 보존한다', { skip: !available }, async () => {
  const m = read();
  const [base, current] = await Promise.all([pixels(m.inputs.base.path), pixels(m.assets.research.path)]);
  let changed = 0;
  for (let y = 0; y < 941; y++) for (let x = 0; x < 1672; x++) {
    const p = (y * 1672 + x) * 3;
    const differs = base[p] !== current[p] || base[p + 1] !== current[p + 1] || base[p + 2] !== current[p + 2];
    if (differs) {
      changed++;
      assert.ok(maskAt(x, y, m.composite.mask) > 0, `허용 영역 밖 변화: ${x},${y}`);
    }
  }
  assert.ok(changed > 10000, '실제 콧수염이 반영되어야 한다');
  assert.equal(changed, m.composite.validation.changed_pixels);
});

test('눈감음 두 눈을 제외한 장면은 같은 픽셀이며 콧수염도 고정된다', { skip: !available }, async () => {
  const m = read();
  const [current, blink] = await Promise.all([pixels(m.assets.research.path), pixels(m.assets['research-blink'].path)]);
  const changed = [0, 0];
  for (let y = 0; y < 941; y++) for (let x = 0; x < 1672; x++) {
    const p = (y * 1672 + x) * 3;
    if (current[p] === blink[p] && current[p + 1] === blink[p + 1] && current[p + 2] === blink[p + 2]) continue;
    const eye = m.composite.blinkEyes.findIndex(([l, t, w, h]) => ((x + 0.5 - l - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - t - h / 2) / (h / 2)) ** 2 < 1);
    assert.notEqual(eye, -1, `눈감음이 몸 또는 콧수염을 바꾸면 안 된다: ${x},${y}`);
    changed[eye]++;
  }
  assert.ok(changed.every(count => count > 100), '양쪽 눈 모두 실제 눈감음 원천을 사용한다');
});

test('예전 콧수염 없는 원본으로 반입을 시도하면 봉투를 포함한 쓰기 전에 거절한다', { skip: !available }, () => {
  const m = read();
  const outputs = ['research.webp', 'research-blink.webp', 'envelope.webp', '출처.json', 'README.md'];
  const before = outputs.map(file => sha(fs.readFileSync(path.join(root, 'assets/교수작업실', file))));
  const result = spawnSync(process.execPath, ['tools/교수장면자산반입.js', '--원본', path.join(canonicalRoot, m.inputs.base.path)], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /선택된 원본 지문이 다릅니다: research/);
  assert.deepEqual(outputs.map(file => sha(fs.readFileSync(path.join(root, 'assets/교수작업실', file)))), before);
});
