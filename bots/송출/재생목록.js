#!/usr/bin/env node
'use strict';
/* 재생목록 — 인코딩된 .ts 팩 폴더 → ffconcat 목록(playlist.txt) + 편성표(재생목록.json)
 *
 * 사용: node 재생목록.js <팩폴더> [출력폴더=팩폴더]
 *
 * 왜 목록 파일인가(README 「한 파일 루프가 아니라 목록 루프」): 트랙 교체가 파일 1개 단위가
 * 되고, 트랙 경계가 곧 broadcast_segment·「지금 나오는 곡」(P3 오버레이)의 재료가 된다.
 * 편성표(json)는 그 재료의 기계가독 판이다 — 사람이 목록을 두 벌로 관리하지 않는다.
 *
 * 🔴 순서는 «파일 이름»이 아니라 `lib/라디오곡차례.js` 가 정한다(09-02).
 *   (⚠ `lib/라디오편성.js` 는 **다른 파일**이다 — 그쪽은 퀴즈 문항 추첨 가중이다.)
 *   옛 판은 `.sort()` 라 이름순이었고, 곡을 더하면(09·10) 그 곡이 제 블록 뒤가 아니라
 *   목록 «맨 끝»에 붙어 블록이 쪼개졌다. 블록을 지키려고 팩 전체를 다시 번호 매기면
 *   .ts·크레딧 장부·목록이 전부 딸려 온다 — 그래서 순서의 주인을 옮겼다.
 *   ⇒ 번호는 «언제 만들었나»만 뜻하고, «언제 나가나»는 편성이 안다.
 */
const fs = require('fs');
const path = require('path');
const 곡차례 = require('../../lib/라디오곡차례.js');

const 팩 = process.argv[2];
const 출력 = process.argv[3] || 팩;
if (!팩 || !fs.existsSync(팩)) { console.error('[재생목록] 팩 폴더를 달라'); process.exit(1); }

const 파일들 = fs.readdirSync(팩).filter((f) => f.endsWith('.ts'));
if (!파일들.length) { console.error('[재생목록] .ts 트랙이 0개다 — 인코딩.sh 를 먼저 돌린다(0개는 통과가 아니다)'); process.exit(2); }

const { 차례, 블록, 모름 } = 곡차례.차례세우기(파일들);

/* ffconcat v1 — 송출.sh 의 -stream_loop -1 이 이 목록 «전체»를 무한 반복한다. */
const 목록 = ['ffconcat version 1.0', ...차례.map((f) => `file '${f.replace(/'/g, "'\\''")}'`), ''].join('\n');
fs.writeFileSync(path.join(출력, 'playlist.txt'), 목록);

const 편성표 = 차례.map((f) => {
  const t = 곡차례.트랙읽기(f);
  return { 파일: f, 결: t ? t.결 : null, 이름: t ? t.이름 : null };
});
fs.writeFileSync(path.join(출력, '재생목록.json'),
  JSON.stringify({ 만든때: new Date().toISOString(), 블록: 블록.map((b) => ({ 결: b.결, 이름: b.이름, 벌: b.트랙.length })), 트랙: 편성표 }, null, 2));

/* 합계 = 갈래 + 갈래로 적는다 — 「6개」만 적으면 «어느 블록이 몇 벌인지»가 안 보인다. */
console.log(`[재생목록] 트랙 ${차례.length} = ${블록.map((b) => `${b.이름} ${b.트랙.length}`).join(' + ')}`
  + (모름.length ? ` + 이름을 못 읽음 ${모름.length}` : '') + ` → playlist.txt · 재생목록.json (${출력})`);
for (const b of 블록) console.log(`  ${b.이름.padEnd(4)} ${b.트랙.join(' · ')}`);
/* 🔑 못 읽은 것은 «버리지 않고» 맨 뒤에 붙였다 — 다만 큰 소리로 말한다.
 *   조용히 빠지면 목록이 짧아진 것을 아무도 못 본다. */
if (모름.length) console.log(`  ⚠ 이름 규칙(synk-radio-NN-<결>-air.ts)에 안 맞아 맨 뒤로: ${모름.join(' · ')}`);
