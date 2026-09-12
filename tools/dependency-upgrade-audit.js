'use strict';
// 읽기 전용: npm latest 태그 대신 날짜·정식판·폐기 여부를 함께 대조한다.
const fs = require('node:fs');
const path = require('node:path');
const { 인자게이트 } = require('../lib/플래그.js');
// 네트워크는 npm 공개 메타데이터만 읽는다. 환경/운영 조준 플래그는 받지 않는다.
const 아는플래그 = [];

const CUTOFF = '2026-09-11T15:00:00.000Z'; // 2026-09-12 00:00 KST, exclusive
const ROOT = path.resolve(__dirname, '..');

function latestStable(packument, cutoff = CUTOFF) {
  const before = Date.parse(cutoff);
  if (!Number.isFinite(before)) throw new Error('유효한 ISO 기준 시각이 필요합니다.');
  return Object.keys(packument.versions || {})
    .filter(version => /^\d+\.\d+\.\d+$/.test(version)
      && !packument.versions[version].deprecated
      && Date.parse(packument.time?.[version]) < before)
    .sort((a, b) => {
      const x = a.split('.').map(Number);
      const y = b.split('.').map(Number);
      return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
    })[0] || null;
}

async function audit(cutoff = CUTOFF) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const specs = { ...manifest.dependencies, ...manifest.devDependencies };
  const packages = await Promise.all(Object.entries(specs).map(async ([name, requested]) => {
    const source = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
    const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${name}: registry HTTP ${response.status}`);
    const data = await response.json();
    const latest = latestStable(data, cutoff);
    const installed = lock.packages[`node_modules/${name}`]?.version || null;
    return {
      name, requested, installed, latest,
      installedPublishedAt: data.time?.[installed] || null,
      latestPublishedAt: data.time?.[latest] || null,
      installedPeers: data.versions?.[installed]?.peerDependencies || {},
      source,
    };
  }));
  return { cutoffExclusive: cutoff, checkedAt: new Date().toISOString(), packages };
}

module.exports = { CUTOFF, latestStable, audit };
if (require.main === module) {
  const args = process.argv.slice(2);
  const 플래그오류 = 인자게이트('dependency-upgrade-audit', args, 아는플래그);
  if (플래그오류) { console.error(플래그오류); process.exit(1); }
  if (args.length > 1) { console.error('기준 ISO 시각 위치 인수 하나만 받습니다.'); process.exit(1); }
  audit(args[0] || CUTOFF)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
