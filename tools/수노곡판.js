#!/usr/bin/env node
/* 수노곡판 — 유호님이 Suno 에서 골라 두신 곡을 24시간 라디오 «방송 판»으로 만든다.
 *   (유호 확정 2026-09-07 「노래는 내가 골라서 보내줄게」 · 09-08 「이제 6곡됬는데 조금만 기다려줘」)
 *
 * ■ 왜 `라디오곡생산.js` 를 안 쓰나 — 그 도구는 «Lyria 로 만드는» 통로다.
 *   여기는 «이미 있는 소리»를 받는 통로라 생성·크레딧·재시도가 없고, 대신 둘이 있다:
 *   ①짧은 곡을 6분 넘게 «이어 붙이기»(수노는 2~4분) ②유호님 폴더의 «칸 이름»에서 결을 읽기.
 *
 * ■ 규격은 여기서 «다시 정하지 않는다» — `lib/곡판규격.js` 의 `방송` 판 하나가 정본이다
 *   (mp3 · 192k · 44100 · −14 LUFS · 최소 360초 · ascii 이름). 2패스 loudnorm 도 그 파일이 낸다.
 *
 * ■ 공정 (한 곡 = 방송 판 1개)
 *   ① 길이를 재고, 360초에 모자라면 같은 곡을 «크로스페이드 4초»로 N번 잇는다
 *      (`-stream_loop` 는 이음새가 툭 튄다 — 곡 끝과 처음이 다르기 때문이다)
 *   ② 1패스 측정 → 2패스 loudnorm 으로 −14 LUFS 에 앉힌다 → ③ ebur128 로 실측 확인
 *   ④ `bots/송출/크레딧.md` 에 한 줄(출처 = 유호님 픽 · Suno) · `docs/_ops/곡생산.jsonl` 에 한 줄
 *   ⑤ 원본 WAV 는 `<받은곳>/_올린것/<칸>/` 으로 옮긴다 — 다시 돌려도 두 번 안 굽는다
 *
 * ■ 폴더 = 결 (유호님 안내문 「여기에_넣으시면_됩니다.txt」 그대로)
 *   시티팝_몽글 → citypop · 차분_까몽 → calm · 전자_마린 → house
 *   «모르겠음»과 폴더 밖(뿌리)에 있는 파일은 굽지 않고 이름만 보고한다 — 결은 유호님이 정하신다.
 *
 * 쓰기:
 *   node tools/수노곡판.js --낼곳 <폴더>                받은곳 기본값(바탕화면 SYNK 자산/음악/수노_받은것)
 *   node tools/수노곡판.js --받은곳 <폴더> --낼곳 <폴더>
 *   node tools/수노곡판.js --낼곳 <폴더> --번호 13      첫 번호를 손으로(기본 = 크레딧.md 최대 번호 + 1)
 *   node tools/수노곡판.js --그냥보기                    무엇을 어떻게 구울지만 찍고 끝낸다(ffmpeg 0회)
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const 곡판규격 = require('../lib/곡판규격.js');
const { 결ascii } = require('../lib/라디오곡차례.js');
const { 인자게이트 } = require('../lib/플래그.js');

const 아는플래그 = ['--받은곳', '--낼곳', '--번호', '--그냥보기'];

const ROOT = path.resolve(__dirname, '..');
const 크레딧경로 = path.join(ROOT, 'bots/송출/크레딧.md');
const 생산장부경로 = path.join(ROOT, 'docs/_ops/곡생산.jsonl');
const 기본받은곳 = path.join(os.homedir(), 'OneDrive', 'Desktop', 'SYNK 자산', '음악', '수노_받은것');

/** 폴더 이름 → 결(한글). 안내문의 칸 셋만 안다 — 늘리면 안내문도 같이 고친다. */
const 칸결 = { '시티팝_몽글': '시티팝', '차분_까몽': '차분', '전자_마린': '전자' };
const 소리확장자 = new Set(['.wav', '.mp3', '.flac', '.m4a', '.ogg']);

const ff = (args) => execFileSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
/* ffmpeg 는 측정도 요약도 stderr 로 낸다 — 두 통로를 다 받는다(라디오곡생산.js 의 09-02 실측). */
function ff측정(args) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return `${r.stdout || ''}\n${r.stderr || ''}`;
}
function 초(파일) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 파일], { encoding: 'utf8' });
  const v = parseFloat(out.trim());
  return Number.isFinite(v) ? v : 0;
}
function 라우드니스실측(파일) {
  const out = ff측정(['-hide_banner', '-nostats', '-i', 파일, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-']);
  const m = String(out).match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
  return m ? parseFloat(m[m.length - 1].match(/-?\d+(?:\.\d+)?/)[0]) : null;
}

/** 크레딧.md 의 트랙 줄에서 가장 큰 번호 — 새 곡은 그 다음부터. 줄이 없으면 0. */
function 크레딧최대번호() {
  if (!fs.existsSync(크레딧경로)) return 0;
  const 원 = fs.readFileSync(크레딧경로, 'utf8');
  let 최대 = 0;
  for (const m of 원.matchAll(/^\| `synk-radio-(\d+)-[a-z_]+-air\.mp3`/gm)) 최대 = Math.max(최대, parseInt(m[1], 10));
  return 최대;
}

/**
 * 짧은 곡을 «같은 곡 N개 + 크로스페이드 4초»로 잇는다. 이은 길이 ≈ N×원본 − 4×(N−1).
 * 🔑 4초 겹침을 빼고 셈한다 — 안 빼면 정확히 360초 언저리에서 한 바퀴가 모자란다.
 */
function 바퀴셈(원본초, 최소초, 겹침 = 4) {
  if (원본초 >= 최소초) return 1;
  let n = 1;
  while (n * 원본초 - 겹침 * (n - 1) < 최소초) n += 1;
  return n;
}
function 잇기필터(n, 겹침 = 4) {
  if (n === 1) return null;
  let 식 = `[0:a][1:a]acrossfade=d=${겹침}:c1=tri:c2=tri[a1]`;
  for (let i = 2; i < n; i++) 식 += `;[a${i - 1}][${i}:a]acrossfade=d=${겹침}:c1=tri:c2=tri[a${i}]`;
  return { 식, 출구: `[a${n - 1}]` };
}

/** 받은곳을 훑는다 — 칸 셋은 «구울 것», 나머지는 «여쭐 것». */
function 훑기(받은곳) {
  const 구울것 = []; const 여쭐것 = [];
  const 뿌리파일 = fs.readdirSync(받은곳, { withFileTypes: true });
  for (const d of 뿌리파일) {
    const p = path.join(받은곳, d.name);
    if (d.isFile() && 소리확장자.has(path.extname(d.name).toLowerCase())) { 여쭐것.push({ 파일: p, 어디: '뿌리' }); continue; }
    if (!d.isDirectory() || d.name.startsWith('_')) continue;
    const 결 = 칸결[d.name];
    for (const f of fs.readdirSync(p)) {
      const q = path.join(p, f);
      if (!fs.statSync(q).isFile() || !소리확장자.has(path.extname(f).toLowerCase())) continue;
      if (결) 구울것.push({ 파일: q, 결, 칸: d.name });
      else 여쭐것.push({ 파일: q, 어디: d.name });
    }
  }
  /* 같은 이름의 wav 와 mp3 가 함께 있으면 wav 만 굽는다(mp3 는 깎인 판). */
  const 몸통 = new Set(구울것.filter((x) => path.extname(x.파일).toLowerCase() === '.wav').map((x) => path.join(path.dirname(x.파일), path.basename(x.파일, '.wav'))));
  return {
    구울것: 구울것.filter((x) => path.extname(x.파일).toLowerCase() === '.wav' || !몸통.has(path.join(path.dirname(x.파일), path.basename(x.파일, path.extname(x.파일))))),
    여쭐것,
  };
}

function 한곡({ 파일, 결, 칸 }, 번호, 낼곳, 그냥보기) {
  const 규 = 곡판규격.판들.방송;
  const 원본초 = 초(파일);
  const n = 바퀴셈(원본초, 규.최소초);
  const id = `synk-radio-${String(번호).padStart(2, '0')}-${결ascii[결]}`;
  const 제목 = path.basename(파일, path.extname(파일));
  if (그냥보기) {
    return { id, 제목, 결, 원본초, 바퀴: n, 그냥보기: true };
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-suno-'));
  let 재료 = 파일;
  if (n > 1) {
    const 이은것 = path.join(tmp, 'joined.wav');
    const 입력 = []; for (let i = 0; i < n; i++) 입력.push('-i', 파일);
    const { 식, 출구 } = 잇기필터(n);
    ff(['-y', '-hide_banner', '-loglevel', 'error', ...입력, '-filter_complex', 식, '-map', 출구, '-c:a', 'pcm_s16le', 이은것]);
    재료 = 이은것;
  }
  const 재료초 = 초(재료);
  const 측정 = 곡판규격.측정읽기(ff측정(곡판규격.측정인자({ 원본: 재료, 판: '방송' })));
  const { 인자, 나갈길 } = 곡판규격.굽기인자({ 원본: 재료, 원본초: 재료초, id, 이름: 제목, 판: '방송', 나갈방: 낼곳, 측정 });
  fs.mkdirSync(낼곳, { recursive: true });
  ff(인자);
  try { if (재료 !== 파일) fs.unlinkSync(재료); fs.rmdirSync(tmp); } catch {}
  const d = 초(나갈길); const l = 라우드니스실측(나갈길);
  const 규격밖 = [];
  if (d < 규.최소초) 규격밖.push(`길이 ${d.toFixed(0)}s < ${규.최소초}s`);
  if (l != null && Math.abs(l - 규.라우드니스) > 1) 규격밖.push(`라우드니스 ${l} LUFS`);
  if (!측정) 규격밖.push('측정 1패스 실패(2패스 못 씀)');
  return { id, 제목, 결, 칸, 원본초, 바퀴: n, 파일명: path.basename(나갈길), 나갈길, 초: d, LUFS: l, 규격밖, 원본: 파일 };
}

function 크레딧적기(줄들) {
  if (!줄들.length || !fs.existsSync(크레딧경로)) return;
  const 원 = fs.readFileSync(크레딧경로, 'utf8');
  fs.writeFileSync(크레딧경로, 원.replace(/\s*$/, '\n') + 줄들.join('\n') + '\n', 'utf8');
}
function 장부적기(줄) {
  try { fs.mkdirSync(path.dirname(생산장부경로), { recursive: true }); fs.appendFileSync(생산장부경로, JSON.stringify(줄) + '\n', 'utf8'); return null; }
  catch (e) { return String((e && e.message) || e); }
}
/** 원본을 `_올린것/<칸>/` 으로 옮긴다 — 유호님 폴더에서 «이미 방송에 간 것»이 눈에 보인다. */
function 원본옮기기(받은곳, 칸, 파일) {
  const 방 = path.join(받은곳, '_올린것', 칸);
  fs.mkdirSync(방, { recursive: true });
  const 새길 = path.join(방, path.basename(파일));
  fs.renameSync(파일, 새길);
  return 새길;
}

function main() {
  const argv = process.argv.slice(2);
  const 오류 = 인자게이트('수노곡판', argv, 아는플래그);
  if (오류) { console.error(오류); return 2; }
  const 값 = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const 받은곳 = 값('--받은곳') || 기본받은곳;
  const 그냥보기 = argv.includes('--그냥보기');
  const 낼곳 = 값('--낼곳');
  if (!fs.existsSync(받은곳)) { console.error(`받은곳이 없다: ${받은곳}`); return 2; }
  if (!낼곳 && !그냥보기) { console.error('--낼곳 <폴더> 를 달라(방송 판이 여기로 나간다). 보기만 하려면 --그냥보기'); return 2; }

  const { 구울것, 여쭐것 } = 훑기(받은곳);
  let 번호 = 값('--번호') ? parseInt(값('--번호'), 10) : 크레딧최대번호() + 1;
  console.log(`[수노곡판] 받은곳 = ${받은곳}`);
  console.log(`  구울 것 ${구울것.length} · 여쭐 것 ${여쭐것.length} · 첫 번호 ${String(번호).padStart(2, '0')}`);
  for (const q of 여쭐것) console.log(`  ❔ ${path.relative(받은곳, q.파일)} — ${q.어디 === '뿌리' ? '칸 밖(뿌리)에 있다' : `«${q.어디}» 칸`} · 결을 정해 주셔야 굽는다`);
  if (!구울것.length) { console.log('  구울 것이 0 — 시티팝_몽글 · 차분_까몽 · 전자_마린 칸에 넣어 주시면 굽는다'); return 0; }

  const 낸것 = []; const 크레딧줄 = []; const 때 = new Date().toISOString().slice(0, 10);
  for (const x of 구울것) {
    process.stdout.write(`  · ${x.칸}/${path.basename(x.파일)} → `);
    const r = 한곡(x, 번호, 낼곳, 그냥보기);
    번호 += 1;
    if (r.그냥보기) { console.log(`${r.id} (${r.원본초.toFixed(0)}s × ${r.바퀴}바퀴)`); continue; }
    console.log(`${r.파일명} · ${r.초.toFixed(0)}s · ${r.LUFS} LUFS${r.규격밖.length ? ` · ⚠ ${r.규격밖.join(' · ')}` : ' · ✅'}`);
    낸것.push(r);
    크레딧줄.push(`| \`${r.파일명}\` | ${r.결} 결 | **유호님 픽**(Suno · 원본 «${r.제목}») | Suno Pro · 상업 이용 · 워터마크 없음 | 표시 의무 없음 | ${때} |`);
    const 실패 = 장부적기({ 종류: '수노곡판', 시각: new Date().toISOString(), id: r.id, 제목: r.제목, 결: r.결, 원본초: r.원본초, 바퀴: r.바퀴, 초: r.초, LUFS: r.LUFS, 규격밖: r.규격밖, 원본: path.relative(받은곳, r.원본) });
    if (실패) console.log(`    ⚠ 생산 장부를 못 남겼다(${실패})`);
    if (!r.규격밖.length) {
      const 옮긴곳 = 원본옮기기(받은곳, r.칸, r.원본);
      console.log(`    원본 → ${path.relative(받은곳, 옮긴곳)}`);
    }
  }
  if (!그냥보기) {
    크레딧적기(크레딧줄);
    console.log(`\n  방송 판 ${낸것.length}벌 → ${낼곳} · 크레딧.md +${크레딧줄.length}줄 · 장부 = ${path.relative(ROOT, 생산장부경로)}`);
    console.log('  다음 = 서버 음원 폴더로 올리고 인코딩.sh → 재생목록.js (README 「그날의 순서」 1~2)');
  }
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { 바퀴셈, 잇기필터, 훑기, 크레딧최대번호, 칸결 };
