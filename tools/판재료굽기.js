#!/usr/bin/env node
'use strict';
/**
 * 판재료굽기 — `policy_ver` 판독기(lib/판독기.js)의 «저장소 산출물» 재료를 굽는다.
 *
 * ■ 왜 굽나 (D3 · §5-1): 판독기 재료 13 중 일곱이 «파일 내용 해시»인데, Edge Fn 은 배포된
 *   번들만 들고 저장소를 못 읽는다. 동봉(.mjs 변환)은 원문 보존이 아니라 해시 원천이 못 된다 —
 *   그래서 **빌드 시점에 원문 해시를 계산해 상수 모듈로 굽는다**(강사지식빌드와 같은 무늬).
 *   배포 커밋 = 빌드 커밋이므로 「배포된 번들의 판」과 「저장소 파일의 판」이 같은 하나다.
 *
 * ■ 재료 13 중 이 도구가 굽는 것 = 파일 해시 7(재료 1·2·7·8·11·12·13) + 폴백순서(3).
 *   상수 4·5·9(타임아웃·예산·cron)와 회전식(6)은 `lib/생성상수.js` 가 실행 시 낸다(굽지 않는다 —
 *   같은 번들 안의 코드라 갈릴 자리가 없다). rpc(10)는 DB 산출이라 오케스트레이터가 질의한다.
 *
 * ■ 쓰는 법
 *   node tools/판재료굽기.js          # 굽는다
 *   node tools/판재료굽기.js --확인   # 굽지 않고 «지금 구우면 달라지나»만 본다(0=같다)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { 인자게이트 } = require('../lib/플래그.js');

const 플래그오류 = 인자게이트('판재료굽기', process.argv.slice(2), ['--확인']);
if (플래그오류) { console.error(플래그오류); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'contents', '판재료.js');

/* 재료 이름 → 파일(§5-1 표 그대로 — 목록의 정본은 lib/판독기.js 의 `재료이름` 주석). */
const 파일재료 = Object.freeze({
  요약조립: 'lib/과제요약.js',
  검문: 'lib/과제검문.js',
  갈래판정: 'lib/갈래판정.js',
  기술선택: 'lib/기술선택.js',
  오류분류: 'lib/과제생성.js',
  폴백조립: 'lib/오늘과제.js',
  추정기: 'lib/학습자상태.js',
});

const hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function 굽기() {
  const 해시들 = {};
  for (const [이름, 상대] of Object.entries(파일재료)) {
    const p = path.join(ROOT, 상대);
    if (!fs.existsSync(p)) {
      console.error(`[판재료] 재료 파일이 없다: ${상대} — §5-1 재료 «${이름}» 의 원천이다`);
      process.exit(1);
    }
    해시들[이름] = hex(fs.readFileSync(p));   // 원문 UTF-8 바이트 그대로(v5.9 표)
  }
  const { 갈래순서 } = require('../lib/갈래판정.js');
  let 커밋 = '(git 없음)';
  try { 커밋 = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { /* CI 등 */ }

  return `'use strict';
/* 판재료 — **생성물이다. 손으로 안 고친다.** (node tools/판재료굽기.js 가 굽는다)
 * 원본 커밋 ${커밋} · 재료 = §5-1 파일 해시 7 + 폴백순서. 드리프트는 tests/판재료.test.js 가 잰다. */
const 파일해시 = Object.freeze(${JSON.stringify(해시들, null, 2)});
const 폴백순서원소 = ${JSON.stringify(JSON.stringify(갈래순서))};
module.exports = { 파일해시, 폴백순서원소 };
`;
}

const 새것 = 굽기();
if (process.argv.includes('--확인')) {
  const 지금 = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  /* 커밋 해시 줄만 다른 것은 드리프트가 아니다 — 내용(해시·순서)만 대조한다. */
  const 몸 = (s) => s.replace(/원본 커밋 [0-9a-f()git 없음]+/u, '');
  if (몸(지금) === 몸(새것)) { console.log('[판재료] 같다'); process.exit(0); }
  console.error('[판재료] 다르다 — node tools/판재료굽기.js 로 다시 굽는다');
  process.exit(1);
}
fs.writeFileSync(OUT, 새것);
console.log(`[판재료] 구움 → contents/판재료.js (파일 ${Object.keys(파일재료).length})`);
