#!/usr/bin/env node
/* 라디오곡생산 — 24시간 라디오의 «방송 판»을 Lyria 3 Pro 로 물량 생산한다.
 *   (유호 확정 2026-09-02 「일단 처음이니 1시간것만 생산해서 24시간 무한반복하자」)
 *
 * ■ 왜 이 파일이 생겼나 — **생산 통로가 코드로 없었다.**
 *   09-01 시험 3곡과 6분 방송판 첫 완주는 «세션 안의 일회용 스크립트»가 했고, 두 저장소에
 *   `lyria` 라는 낱말이 0줄이었다(09-01 전수조사 실측). 그래서 「물량 생산은 채널 열리는 날」이라
 *   적어 둔 트랙 줄이, 정작 그날 **돌릴 것이 없는** 상태였다.
 *
 * ■ 규격은 여기서 «다시 정하지 않는다» — `lib/곡판규격.js` 의 `방송` 판 하나가 정본이다.
 *   (mp3 · 192k · 44100 · −14 LUFS · 최소 360초 · ascii 이름). 🔑 이 파일이 그 값을 복제하면
 *   그 순간 「구울 때 맞춘 값」과 「채택 때 재는 값」이 갈린다 — 곡판규격 머리말이 경고하는 자리다.
 *
 * ■ 공정 (한 벌 = 방송 판 1개)
 *   ① Lyria 3 Pro 로 «서로 다른 생성물 3개»를 뽑는다(Pro 상한 ≈3분이라 6분+ 를 한 번에 못 만든다)
 *   ② 크로스페이드 4초로 잇는다 → ③ loudnorm 으로 −14 LUFS 에 앉힌다 → ④ ebur128 로 **실측 확인**
 *   ⚠ ④를 빼면 안 된다 — loudnorm 1패스는 오차가 있다(09-01 실측 0.3 LU 차).
 *
 * ■ 🔴 실측으로 배운 함정 (memory `lyria-music-generation-pitfalls` 정본 · 여기 요약만)
 *   · 차분·조용 계열은 필터 «경계선»이다 — 같은 문면이 400·400·200 을 낸다(확률 차단).
 *     ⇒ 처방은 낱말 수술이 아니라 **문면 그대로 재시도**부터다. 이 파일이 3회까지 그렇게 한다.
 *   · `ambient` 는 차단률을 크게 올리는 낱말이라 프롬프트에서 쓰지 않는다(소리 서술로 푼다).
 *   · 아티스트명·곡명은 필터 대상 — 결을 «소리»로만 적는다.
 *
 * ■ 크레딧 장부를 «자동으로» 적는다 (`bots/송출/크레딧.md`)
 *   그 장부는 원래 남의 음원의 저작자 표시 자리였는데, 09-01 에 자체 생성곡으로 확정되면서
 *   의무가 사라졌다. **게이트는 없애지 않고 다시 쓴다** — 곡마다 «프롬프트·모델·생성일»을 적으면
 *   허위 클레임이 오는 날 「우리가 만들었다」는 증거가 되고, SynthID 워터마크가 그것을 뒷받침한다.
 *
 * 쓰기:
 *   node tools/라디오곡생산.js --벌 8 --낼곳 <폴더>     방송 판 8벌(≈1시간) 생산
 *   node tools/라디오곡생산.js --벌 1 --낼곳 <폴더>     통로 시험(한 벌만)
 *   node tools/라디오곡생산.js --벌 8 --낼곳 <폴더> --결 시티팝   한 결로만
 *   node tools/라디오곡생산.js --셈만                    돈·시간만 셈하고 끝낸다(호출 0)
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const 곡판규격 = require('../lib/곡판규격.js');
const { 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)

/* 🔑 이 목록은 «손으로 맞추는 자리»가 아니다 — `tests/플래그게이트.test.js` 가 소스에 실제로
 *   쓰이는 `--낱말` 전량을 이 선언이 덮는지 기계로 센다. 첫 판이 이 줄을 빼먹고 회귀에 잡혔다
 *   (09-02 · 「명단 undefined ≠ 실측 ②」). 낱말을 늘리면 여기도 늘린다. */
const 아는플래그 = ['--벌', '--낼곳', '--결', '--셈만'];

const ROOT = path.resolve(__dirname, '..');
const 키경로 = process.env.GEMINI_KEY_PATH || 'C:/Users/q1212/SYNK_보안/제미나이.txt';
const 모델 = 'lyria-3-pro-preview';
const 엔드포인트 = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const 크레딧경로 = path.join(ROOT, 'bots/송출/크레딧.md');

/* ── 결 셋 — 09-01 시험에서 유호님 귀 판정을 통과한 세 갈래 ────────────────
 * 🔑 앞머리 두 줄은 **모든 결에 공통**이다(실측: 3곡 전부 보컬 0으로 나왔다).
 *   ①보컬 차단 ②「한 결로 계속 · 고조·낙차 없음 · 이음매 없이 반복」 = 공부 배경의 요건.
 * ⚠ 결 이름은 파일명에 안 쓴다(한글) — ascii 이름은 곡판규격이 만든다. */
const 공통머리 = 'Instrumental only, absolutely no vocals, no lyrics, no voice. '
  + 'Stays at one consistent energy level, no risers, no drops, loops seamlessly. '
  + 'Full length around three minutes.';

const 결들 = {
  시티팝: '1980s Japanese city pop instrumental: warm electric piano with maj7 and 9th chords, '
    + 'clean chorus-effect guitar, round fretless bass, soft brushed drums, gentle night-drive groove.',
  전자: 'Warm French house instrumental: filtered disco groove, soft sidechain pulse, '
    + 'muted rhodes stabs, analog bass, light shaker, steady mid-tempo pocket.',
  차분: 'Soft study-room instrumental: slow felt piano, warm tape hiss, distant rain outside a window, '
    + 'low sustained strings, no percussion, very gentle and unhurried.',
};

/* 1시간(3600초)을 여덟 벌로 — 한 벌이 ≈450초라 8벌이면 3,600초 남짓에 앉는다.
 *
 * 🔑 **장르 블록**이다 — 한 결을 쭉 틀고 다음 결로 넘어간다(유호 확정 09-02
 *   「한 장르 쭉 하고 한 장르 쭉 하고 … 장르마다 마스코트를 변경」).
 *   첫 판(결을 돌려가며 섞는 배치)을 그날 걷었다: 섞으면 «라디오»가 아니라 셔플이 되고,
 *   무엇보다 **마스코트가 곡마다 튀어** 화면이 산만해진다.
 * 🔑 이 배치가 곧 화면 배치다 — 팩을 «곡마다 그 장르의 배경»으로 인코딩하므로(인코딩.sh 의 배경 인자),
 *   블록으로 묶으면 마스코트가 블록 단위로 한 번씩만 바뀐다. 재인코딩 0 을 지키면서 DJ 가 교대한다. */
const { 결차례, 결ascii } = require('../lib/라디오곡차례.js');   // 결의 차례·이름은 곡차례가 주인이다(09-02)

/* 파일 이름에 결을 박는다 — `인코딩.sh` 가 **이름에서 장르를 읽어** 그 장르의 배경을 고르고,
 * `bots/송출/재생목록.js` 가 같은 이름에서 결을 읽어 **블록 차례**를 세운다.
 * 🔑 그래서 이름 규칙(`synk-radio-NN-<결>-air`)이 세 곳의 접점이다 — 주인은 `lib/라디오곡차례.js` 하나.
 *   (⚠ `lib/라디오편성.js` 와 헷갈리지 않는다 — 그쪽은 퀴즈 문항 추첨 가중이다.) */

function 키() {
  const raw = fs.readFileSync(키경로, 'utf8');
  const m = raw.match(/AQ\.[A-Za-z0-9_\-.]+/) || raw.match(/AIza[A-Za-z0-9_\-]{20,}/);
  return m ? m[0] : raw.trim().split(/\r?\n/).filter(Boolean).pop();
}

/** 응답 JSON 안 어디에 있든 첫 오디오 블록을 찾아낸다 — 구조가 깊어 재귀가 안전하다(09-01 실측). */
function 오디오찾기(x) {
  if (!x || typeof x !== 'object') return null;
  if (x.type === 'audio' && typeof x.data === 'string') return x.data;
  for (const v of Array.isArray(x) ? x : Object.values(x)) {
    const r = 오디오찾기(v);
    if (r) return r;
  }
  return null;
}

/** 한 생성. 차단은 던지고, 부르는 쪽이 **문면 그대로** 재시도한다(낱말 수술은 마지막 수단). */
async function 한생성(프롬프트, k) {
  const res = await fetch(엔드포인트, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': k },
    body: JSON.stringify({ model: 모델, input: 프롬프트 }),
  });
  const 본문 = await res.text();
  if (!res.ok) {
    const 차단 = /content_blocked/i.test(본문);
    const e = new Error(`${res.status} ${차단 ? 'content_blocked' : 본문.slice(0, 160)}`);
    e.차단 = 차단;
    throw e;
  }
  const b64 = 오디오찾기(JSON.parse(본문));
  if (!b64) throw new Error('응답에 audio 블록이 없다');
  return Buffer.from(b64, 'base64');
}

async function 생성재시도(프롬프트, k, 회 = 3) {
  let 마지막;
  for (let i = 1; i <= 회; i++) {
    try { return await 한생성(프롬프트, k); } catch (e) {
      마지막 = e;
      if (!e.차단 && i === 회) throw e;
      process.stdout.write(`  ↻ ${i}/${회} (${e.message.slice(0, 40)})\n`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw 마지막;
}

const ff = (args) => execFileSync('ffmpeg', args, { encoding: 'utf8' });

/* 🔴 `execFileSync` 는 **stdout 만** 돌려준다 — ffmpeg 는 측정 JSON 도 ebur128 요약도 전부
 *   **stderr** 로 낸다. 첫 판이 그걸 몰라 「측정 1패스 실패 · LUFS null」이 났다(09-02 시험 1벌 실측).
 *   ⇒ `spawnSync` 로 두 통로를 다 받아 이어 붙인다. 성공/실패 어느 쪽이든 같은 자리에서 읽힌다. */
function ff측정(args) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return `${r.stdout || ''}\n${r.stderr || ''}`;
}

/** 구운 뒤 «정말 그 값인가»를 다시 잰다 — 2패스도 완벽하지는 않다. */
function 라우드니스실측(파일) {
  const out = ff측정(['-hide_banner', '-nostats', '-i', 파일,
    '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-']);
  const m = String(out).match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
  return m ? parseFloat(m[m.length - 1].match(/-?\d+(?:\.\d+)?/)[0]) : null;
}

function 초(파일) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', 파일], { encoding: 'utf8' });
  return parseFloat(out.trim());
}

/** 크레딧 장부에 한 줄 — 인코딩.sh 게이트가 이 표를 읽는다. */
function 크레딧적기(줄들) {
  if (!fs.existsSync(크레딧경로)) return;
  const 원 = fs.readFileSync(크레딧경로, 'utf8');
  fs.writeFileSync(크레딧경로, 원.replace(/\s*$/, '\n') + 줄들.join('\n') + '\n', 'utf8');
}

async function 한벌(n, 결, 낼곳, k, 규격) {
  const 프롬프트 = `${공통머리} ${결들[결]}`;
  const 조각 = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-radio-'));
  for (let i = 0; i < 3; i++) {
    process.stdout.write(`  · ${결} 생성 ${i + 1}/3 … `);
    const buf = await 생성재시도(프롬프트, k);
    const p = path.join(tmp, `${i}.mp3`);
    fs.writeFileSync(p, buf);
    조각.push(p);
    process.stdout.write(`${(buf.length / 1024).toFixed(0)}KB\n`);
  }
  /* ① 이음만 여기서 한다(크로스페이드 4초 ×2) — 정규화·표본율·비트레이트·파일명은 손대지 않는다.
   *    🔑 09-01 첫 완주는 이음과 정규화를 한 사슬에 넣었는데, 그러면 규격의 주인이 둘이 된다.
   *    `lib/곡판규격.js` 가 이미 **2패스 loudnorm + aresample** 을 알고 있다(1패스가 목표를
   *    못 맞힌다는 08-26 실측 위에 서 있다) — 그것을 안 쓰고 여기서 1패스로 구우면
   *    「구울 때 맞춘 값」과 「채택 때 재는 값」이 갈린다. */
  const 이은것 = path.join(tmp, 'joined.mp3');
  ff(['-y', '-hide_banner', '-loglevel', 'error', '-i', 조각[0], '-i', 조각[1], '-i', 조각[2],
    '-filter_complex',
    '[0:a][1:a]acrossfade=d=4:c1=tri:c2=tri[ab];[ab][2:a]acrossfade=d=4:c1=tri:c2=tri[out]',
    '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '320k', 이은것]);
  const 이은초 = 초(이은것);

  /* ② 1패스 측정 → ③ 2패스 굽기 — 둘 다 곡판규격이 인자를 낸다. */
  const 측정 = 곡판규격.측정읽기(ff측정(곡판규격.측정인자({ 원본: 이은것, 판: '방송' })));
  const id = `synk-radio-${String(n).padStart(2, '0')}-${결ascii[결] || 'mix'}`;
  const { 인자, 나갈길 } = 곡판규격.굽기인자({
    원본: 이은것, 원본초: 이은초, id, 이름: `SYNK 라디오 ${결} ${n}`, 판: '방송', 나갈방: 낼곳, 측정,
  });
  ff(인자);
  조각.concat([이은것]).forEach((p) => { try { fs.unlinkSync(p); } catch {} });
  try { fs.rmdirSync(tmp); } catch {}

  const d = 초(나갈길); const l = 라우드니스실측(나갈길);
  const 규격밖 = [];
  if (d < 규격.최소초) 규격밖.push(`길이 ${d.toFixed(0)}s < ${규격.최소초}s`);
  if (l != null && Math.abs(l - 규격.라우드니스) > 1) 규격밖.push(`라우드니스 ${l} LUFS`);
  if (!측정) 규격밖.push('측정 1패스 실패(2패스 못 씀)');
  return { 이름: path.basename(나갈길), 결, 초: d, LUFS: l, 규격밖, 프롬프트 };
}

async function main() {
  const argv = process.argv.slice(2);
  const 플래그오류 = 인자게이트('라디오곡생산', argv, 아는플래그);
  if (플래그오류) { console.error(`[라디오곡생산] ${플래그오류}`); process.exit(1); }
  /* 🔑 낱말을 «도우미 함수»로 읽지 않고 `argv.indexOf` 로 곧장 읽는다 — 09-02 실측:
   *   화살표 도우미(`const 값 = (f,d)=>…`)로 감싸면 `tests/플래그게이트.test.js` ④가 그 낱말을
   *   «자식 프로세스에 넘기는 인자»로 오인해 적색을 낸다(이 도구는 ffmpeg 를 부르므로 자식이 있다).
   *   회귀가 옳다 — 자기 낱말인지 자식 낱말인지는 «argv 와 직접 비교하는가»로만 갈린다. */
  const i벌 = argv.indexOf('--벌');
  const i결 = argv.indexOf('--결');
  const i낼곳 = argv.indexOf('--낼곳');
  const 벌 = i벌 >= 0 && argv[i벌 + 1] ? parseInt(argv[i벌 + 1], 10) : 8;
  const 한결 = i결 >= 0 ? argv[i결 + 1] : null;
  const 낼곳 = i낼곳 >= 0 && argv[i낼곳 + 1]
    ? argv[i낼곳 + 1]
    : path.join(os.homedir(), 'OneDrive/Desktop/SYNK 자산/라디오팩');
  const 규격 = 곡판규격.판들 ? 곡판규격.판들.방송 : 곡판규격.방송;
  if (!규격) throw new Error('곡판규격에서 «방송» 판을 못 찾았다 — 규격의 주인이 바뀌었는지 본다');

  const 생성수 = 벌 * 3;
  console.log(`[라디오곡생산] ${벌}벌 × 3생성 = ${생성수}생성 · ≈$${(생성수 * 0.08).toFixed(2)} · ≈${Math.round(생성수 * 35 / 60)}분`);
  console.log(`  규격(lib/곡판규격 방송): ${규격.비트레이트} · ${규격.표본율}Hz · ${규격.라우드니스} LUFS · 최소 ${규격.최소초}s`);
  /* 🔴 번호를 «이어서» 매긴다 — 09-02 실측 결함: 늘 n=1 부터 시작해서, 곡이 든 폴더에
   *   한 번 더 돌리면 **말없이 덮어썼다.** 곡 한 벌은 3생성($0.24)+몇 분이라 되살릴 수도 없다.
   *   ⇒ 폴더(그리고 «보류» 같은 한 칸 아래 방까지) 를 훑어 쓰인 가장 큰 번호 다음에서 시작한다.
   *     한 칸 아래까지 보는 까닭 = 마린 대기로 뺀 07·08 이 거기 살아 있고, 그 번호를 다시 쓰면
   *     마린이 오는 날 이름이 부딪힌다. */
  const 쓰인번호 = (방) => {
    const 본 = [];
    const 훑기 = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) continue;
        const m = /^synk-radio-(\d+)-/.exec(e.name);
        if (m) 본.push(parseInt(m[1], 10));
      }
    };
    훑기(방);
    for (const e of fs.readdirSync(방, { withFileTypes: true })) {
      if (e.isDirectory()) 훑기(path.join(방, e.name));
    }
    return 본;
  };
  const 이미 = fs.existsSync(낼곳) ? 쓰인번호(낼곳) : [];   // 셈만일 때 폴더를 만들지 않는다
  const 시작 = 이미.length ? Math.max(...이미) + 1 : 1;
  console.log(`  번호: ${시작} ~ ${시작 + 벌 - 1}`
    + (시작 > 1 ? ` (이미 ${이미.length}벌 있어 이어서 매긴다 — 덮어쓰지 않는다)` : ''));
  if (argv.includes('--셈만')) return;

  fs.mkdirSync(낼곳, { recursive: true });
  const k = 키();
  const 결과 = []; const 크레딧줄 = [];
  /* 🔴 `toISOString()` 은 **UTC** 다 — KST 자정 직후에 구우면 장부에 «어제»가 박힌다
   *   (09-02 00:2x 에 구운 8벌이 전부 09-01 로 찍혔다). 장부는 「우리가 언제 만들었나」의
   *   증거라 로컬 날짜여야 한다. `sv-SE` 로케일이 YYYY-MM-DD 를 그대로 준다. */
  const 오늘 = new Date().toLocaleDateString('sv-SE');
  for (let i = 0; i < 벌; i++) {
    const n = 시작 + i;
    /* 결차례는 «번호»가 아니라 «이번 실행의 차례»를 탄다 — 이어서 매길 때도 블록이 처음부터 돈다.
     * (번호로 타면 07 부터 시작할 때 전자 블록 한복판에 떨어진다) */
    const 결 = 한결 || 결차례[i % 결차례.length];
    console.log(`\n[${i + 1}/${벌}] ${결} → ${String(n).padStart(2, '0')}번`);
    const r = await 한벌(n, 결, 낼곳, k, 규격);
    결과.push(r);
    console.log(`  → ${r.이름} · ${r.초.toFixed(0)}s · ${r.LUFS} LUFS ${r.규격밖.length ? `🔴 ${r.규격밖.join(' · ')}` : '✅'}`);
    크레딧줄.push(`| \`${r.이름}\` | ${결} 결 | **SYNK 자체 생성**(${모델}) | Lyria 3 Pro · SynthID 워터마크 | 표시 의무 없음 | ${오늘} |`);
  }
  크레딧적기(크레딧줄);
  const 총초 = 결과.reduce((a, b) => a + b.초, 0);
  const 밖 = 결과.filter((r) => r.규격밖.length);
  console.log(`\n[라디오곡생산] ${결과.length}벌 · 총 ${(총초 / 60).toFixed(1)}분 · 규격밖 ${밖.length}벌`);
  console.log(`  낼곳 = ${낼곳}`);
  console.log(`  크레딧 장부 = ${path.relative(ROOT, 크레딧경로)} (인코딩.sh 게이트가 읽는다)`);
  if (밖.length) process.exitCode = 1;
}

main().catch((e) => { console.error('🔴', e.message); process.exit(1); });
