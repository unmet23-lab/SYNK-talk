#!/usr/bin/env node
'use strict';
/* 재생목록 — 인코딩된 .ts 팩 폴더 → ffconcat 목록(playlist.txt) + 편성표(재생목록.json)
 *
 * 사용: node 재생목록.js <팩폴더> [출력폴더=팩폴더]
 *
 * 왜 목록 파일인가(README 「한 파일 루프가 아니라 목록 루프」): 트랙 교체가 파일 1개 단위가
 * 되고, 트랙 경계가 곧 broadcast_segment·「지금 나오는 곡」(P3 오버레이)의 재료가 된다.
 * 편성표(json)는 그 재료의 기계가독 판이다 — 사람이 목록을 두 벌로 관리하지 않는다.
 */
const fs = require('fs');
const path = require('path');

const 팩 = process.argv[2];
const 출력 = process.argv[3] || 팩;
if (!팩 || !fs.existsSync(팩)) { console.error('[재생목록] 팩 폴더를 달라'); process.exit(1); }

const 트랙들 = fs.readdirSync(팩).filter((f) => f.endsWith('.ts')).sort();
if (!트랙들.length) { console.error('[재생목록] .ts 트랙이 0개다 — 인코딩.sh 를 먼저 돌린다(0개는 통과가 아니다)'); process.exit(2); }

/* ffconcat v1 — 송출.sh 의 -stream_loop -1 이 이 목록 전체를 무한 반복한다. */
const 목록 = ['ffconcat version 1.0', ...트랙들.map((f) => `file '${f.replace(/'/g, "'\\''")}'`), ''].join('\n');
fs.writeFileSync(path.join(출력, 'playlist.txt'), 목록);

const 편성 = 트랙들.map((f) => ({ 파일: f, 제목: f.replace(/\.ts$/, '').replace(/_/g, ' ') }));
fs.writeFileSync(path.join(출력, '재생목록.json'), JSON.stringify({ 만든때: new Date().toISOString(), 트랙: 편성 }, null, 2));

console.log(`[재생목록] 트랙 ${트랙들.length}개 → playlist.txt · 재생목록.json (${출력})`);
