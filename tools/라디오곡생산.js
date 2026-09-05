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
const { 벌텍스머리, 벌텍스프로젝트 } = require('../lib/벌텍스토큰.js');
const 모델 = 'lyria-3-pro-preview';
/* 🚪 **클라우드 창구로 부른다**(2026-09-05 · 유호 지시 「응 옮겨줘」).
 *   구글 공식: `The $300 credit can't pay for Gemini API in AI Studio costs.`
 *   ⇒ 같은 `lyria-3-pro-preview` 라도 개인용 창구(`generativelanguage`)로 부르면 무료 크레딧이
 *     못 내고, 클라우드 창구(`aiplatform`)로 부르면 낸다. 09-05 실측: 사흘에 ₩4,980 이 새고 있었다.
 * 🔑 옮겨도 **모델은 그대로**다 — 목록 조회로 `lyria-3-pro-preview` 가 양쪽에 다 있음을 확인했다(09-05).
 *   그래서 곡 품질이 안 내려간다. 인증만 API 키 → OAuth 토큰으로 바뀐다(`lib/벌텍스토큰.js` 가 왜인지 안다).
 * 🔴 주소를 찾는 데 **두 번 헛짚었다** — 자를 남긴다:
 *   · 리전 호스트(`us-central1-aiplatform…`) → 400 `Unsupported location: us-central1`
 *   · 리전 호스트 + `/locations/global` → 400 `Lyria 3 is only supported in the global location`
 *   ✅ 전역 호스트 + `/locations/global` 이라야 통과한다(호스트와 경로가 **둘 다** global 이어야 한다).
 * ⚠ `:predict` 가 아니다 — Lyria 3 은 `interactions` 문이다(`:predict` 로 던지면 404 · 09-05 실측).
 *   구세대 `lyria-002` 만 `:predict` 를 쓴다. 둘을 섞으면 조용히 404 다. */
const 엔드포인트 = () => `https://aiplatform.googleapis.com/v1beta1/projects/${벌텍스프로젝트()}/locations/global/interactions`;
const 크레딧경로 = path.join(ROOT, 'bots/송출/크레딧.md');
/* 🔴 **생산 장부** — 「몇 번 불렀고 몇 번 막혔고 얼마 썼나」 (유호 지시 2026-09-03 「대책이 필요한데?」).
 *
 * 왜 생겼나: 09-02 새벽에 45번을 불러 ₩4,980 이 나갔는데, **그 내역이 아무 데도 안 남았다.**
 *   화면에 `↻ 1/3` 만 찍히고 사라져서, 다음 날 「왜 이렇게 썼지」를 AI Studio 로그를 뒤져서야
 *   알아냈다(성공 39 · 차단 6). 🔑 **끝나고 나면 못 세는 것은 그때 세어 적어야 한다.**
 * 🚫 `lib/곡장부.js` 와 겹치지 않는다 — 그쪽은 «곡 하나»가 자기에 대해 답하는 칸(재현·판정)이고,
 *   여기는 «실행 한 번»의 비용과 차단이다. 한 줄 = 한 번 돌린 것. */
const 생산장부경로 = path.join(ROOT, 'docs/_ops/곡생산.jsonl');
const 곡값달러 = 0.08;   // Lyria 3 Pro 한 생성(구글 공식 가격표 2026-09-03 조회 · $0.08/song)

/* 이 실행에서 실제로 무슨 일이 있었나 — 예상이 아니라 «센 값»이다.
 * 🔑 차단도 과금되는 것으로 보인다(09-02 실측: 요청 45회분 금액 ≈ 실제 청구 ₩4,980 · 성공은 39회였다).
 *   그래서 «성공»이 아니라 «호출»로 값을 센다 — 적게 세면 다음 판단이 헐거워진다. */
const 셈 = { 호출: 0, 차단: 0, 실패벌: 0, 결별차단: {} };

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

/* 🗑 옛 `키()` 는 09-05 에 걷었다 — 클라우드 창구는 API 키를 «원리상» 안 받는다.
 *   (조직 밖 프로젝트라 키 제한을 넓힐 자리가 없다 · 까닭은 `lib/벌텍스토큰.js` 머리말)
 *   인증 머리를 만드는 곳은 이제 `벌텍스머리()` 하나다. */

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
async function 한생성(프롬프트, 머리, 결) {
  셈.호출 += 1;   // 성공·차단을 가리지 않고 «부른 것»을 센다(차단도 과금되는 것으로 보인다)
  const res = await fetch(엔드포인트(), {
    method: 'POST',
    headers: 머리,
    body: JSON.stringify({ model: 모델, input: 프롬프트 }),
  });
  const 본문 = await res.text();
  if (!res.ok) {
    const 차단 = /content_blocked/i.test(본문);
    if (차단) {
      셈.차단 += 1;
      if (결) 셈.결별차단[결] = (셈.결별차단[결] || 0) + 1;
    }
    const e = new Error(`${res.status} ${차단 ? 'content_blocked' : 본문.slice(0, 160)}`);
    e.차단 = 차단;
    throw e;
  }
  const b64 = 오디오찾기(JSON.parse(본문));
  if (!b64) throw new Error('응답에 audio 블록이 없다');
  return Buffer.from(b64, 'base64');
}

async function 생성재시도(프롬프트, 머리, 회 = 3, 결) {
  let 마지막;
  for (let i = 1; i <= 회; i++) {
    try { return await 한생성(프롬프트, 머리, 결); } catch (e) {
      마지막 = e;
      /* 🔴 차단이 «아닌» 오류(키 죽음·네트워크·크레딧 0)는 재시도해도 같은 답이다 —
       *   그 자리에서 던져 전체를 멈춘다. 계속 돌면 같은 실패를 벌 수만큼 반복하며 돈만 센다. */
      if (!e.차단) throw e;
      if (i === 회) break;
      process.stdout.write(`  ↻ ${i}/${회} (${e.message.slice(0, 40)})\n`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  마지막.차단소진 = true;   // 3회를 차단으로 다 쓴 것 — 부르는 쪽이 «이 벌만» 접는다
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

/** 생산 장부에 한 줄(append). @returns {string|null} 실패 사유 — **삼키지 않는다**(조용히 실패하면 「셈에 안 잡힌 실행」이 생긴다). */
function 생산장부적기(줄) {
  try {
    fs.mkdirSync(path.dirname(생산장부경로), { recursive: true });
    fs.appendFileSync(생산장부경로, JSON.stringify(줄) + '\n', 'utf8');
    return null;
  } catch (e) { return String((e && e.message) || e); }
}

/** 크레딧 장부에 한 줄 — 인코딩.sh 게이트가 이 표를 읽는다. */
function 크레딧적기(줄들) {
  if (!fs.existsSync(크레딧경로)) return;
  const 원 = fs.readFileSync(크레딧경로, 'utf8');
  fs.writeFileSync(크레딧경로, 원.replace(/\s*$/, '\n') + 줄들.join('\n') + '\n', 'utf8');
}

/* 🔴 **이미 산 조각을 버리지 않는다** (유호 지시 09-03).
 *   한 벌은 조각 셋인데, 셋째에서 차단이 소진되면 앞의 둘은 «이미 돈을 낸 것»이다.
 *   옛 판은 그것을 임시 폴더에 둔 채 죽어서 통째로 사라졌다 — 한 벌이 3생성이니 최대 ₩220 이
 *   말없이 없어진다. ⇒ 낼곳 밑 `_남은조각/` 으로 옮겨 두고, 사람이 다음에 이어 쓸 수 있게 한다. */
function 조각살리기(조각, 낼곳, n, 결) {
  if (!조각.length) return null;
  const 방 = path.join(낼곳, '_남은조각');
  try {
    fs.mkdirSync(방, { recursive: true });
    const 때 = new Date().toLocaleDateString('sv-SE');
    const 낸것 = 조각.map((p, i) => {
      const 새길 = path.join(방, `${때}-${String(n).padStart(2, '0')}-${결ascii[결] || 'mix'}-${i + 1}.mp3`);
      fs.copyFileSync(p, 새길);
      return path.basename(새길);
    });
    return { 방, 파일: 낸것 };
  } catch (_) { return null; }   // 살리기 실패가 생산 전체를 죽이지는 않는다
}

async function 한벌(n, 결, 낼곳, 규격) {
  const 프롬프트 = `${공통머리} ${결들[결]}`;
  const 조각 = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-radio-'));
  for (let i = 0; i < 3; i++) {
    process.stdout.write(`  · ${결} 생성 ${i + 1}/3 … `);
    let buf;
    try {
      /* 🔑 머리를 **생성마다** 새로 얻는다 — 토큰이 1시간짜리라 여덟 벌(24생성 · 20분+)을
       *   한 번 얻은 토큰으로 돌면 뒤쪽이 만료로 죽는다. 캐시가 있어 대부분 파일 읽기 한 번이다. */
      buf = await 생성재시도(프롬프트, await 벌텍스머리(), 3, 결);
    } catch (e) {
      /* 차단이 «아닌» 오류(키·네트워크·크레딧 0)는 다음 벌도 똑같이 죽는다 — 그대로 던져 전체를 멈춘다. */
      if (!e.차단소진) {
        조각.forEach((p) => { try { fs.unlinkSync(p); } catch {} });
        try { fs.rmdirSync(tmp); } catch {}
        throw e;
      }
      const 살린것 = 조각살리기(조각, 낼곳, n, 결);
      조각.forEach((p) => { try { fs.unlinkSync(p); } catch {} });
      try { fs.rmdirSync(tmp); } catch {}
      셈.실패벌 += 1;
      process.stdout.write('\n');
      return { 실패: `차단 3회 소진 (${i + 1}번째 조각에서)`, 결, 산조각: 조각.length, 살린것 };
    }
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
  /* 🔑 첫 토큰을 **여기서 미리** 받는다 — 자격이 죽었으면 곡을 한 개도 굽기 전에 알아야 한다
   *   (한 벌 굽고 나서 알면 그만큼이 그냥 나간 돈이다). 값은 안 쓰고 «되나»만 본다. */
  await 벌텍스머리();
  const 결과 = []; const 크레딧줄 = []; const 실패들 = [];
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
    const r = await 한벌(n, 결, 낼곳, 규격);
    /* 🔴 차단으로 접힌 벌은 «건너뛰고 계속»한다 — 전체를 멈추면 이미 성공한 벌까지 크레딧 장부에
     *   안 적히고, 다음 실행이 또 1번부터 시작한다. 다만 **조용히 넘어가지 않는다**(아래 요약이 센다). */
    if (r.실패) {
      console.log(`  🔴 이 벌은 접었다 — ${r.실패} · 산 조각 ${r.산조각}개`
        + (r.살린것 ? ` → 살려 둠: ${r.살린것.파일.join(' · ')}` : ' → 살리기 실패'));
      실패들.push({ 번호: n, 결, 사유: r.실패, 산조각: r.산조각 });
      continue;
    }
    결과.push(r);
    console.log(`  → ${r.이름} · ${r.초.toFixed(0)}s · ${r.LUFS} LUFS ${r.규격밖.length ? `🔴 ${r.규격밖.join(' · ')}` : '✅'}`);
    크레딧줄.push(`| \`${r.이름}\` | ${결} 결 | **SYNK 자체 생성**(${모델}) | Lyria 3 Pro · SynthID 워터마크 | 표시 의무 없음 | ${오늘} |`);
  }
  크레딧적기(크레딧줄);
  const 총초 = 결과.reduce((a, b) => a + b.초, 0);
  const 밖 = 결과.filter((r) => r.규격밖.length);
  console.log(`\n[라디오곡생산] ${결과.length}벌 · 총 ${(총초 / 60).toFixed(1)}분 · 규격밖 ${밖.length}벌`);

  /* 🔴 **쓴 돈은 «예상»이 아니라 «센 값»으로 적는다** (유호 지시 09-03).
   *   맨 위 줄의 `≈$…` 는 차단·재시도를 모르는 예상치다. 09-02 에 그 예상(8벌=24생성=$1.92)과
   *   실제(45호출)가 갈렸는데 아무도 몰랐다 — 다음 날 AI Studio 로그를 뒤져서야 알았다.
   *   ⇒ 분모를 함께 적는다: 호출 = 성공 + 차단. */
  const 성공호출 = 셈.호출 - 셈.차단;
  const 달러 = 셈.호출 * 곡값달러;
  console.log(`  호출 ${셈.호출}회 = 성공 ${성공호출} + 차단 ${셈.차단}`
    + ` · ≈$${달러.toFixed(2)}${셈.차단 ? ` (그중 차단에 ≈$${(셈.차단 * 곡값달러).toFixed(2)} — 결과물 0)` : ''}`);
  if (셈.차단) {
    const 결별 = Object.entries(셈.결별차단).map(([g, c]) => `${g} ${c}`).join(' · ');
    console.log(`  차단이 난 결: ${결별} — 같은 결이 되풀이 막히면 그 결의 문면을 손볼 자리다`);
  }
  if (실패들.length) {
    console.log(`  🔴 접힌 벌 ${실패들.length} — ${실패들.map((f) => `${f.번호}번(${f.결})`).join(' · ')}`
      + ` · 산 조각은 ${path.join(낼곳, '_남은조각')} 에 있다`);
  }
  console.log(`  낼곳 = ${낼곳}`);
  console.log(`  크레딧 장부 = ${path.relative(ROOT, 크레딧경로)} (인코딩.sh 게이트가 읽는다)`);
  const 장부실패 = 생산장부적기({
    때: new Date().toISOString(), 날: 오늘, 벌요청: 벌, 벌완성: 결과.length,
    호출: 셈.호출, 성공: 성공호출, 차단: 셈.차단, 결별차단: 셈.결별차단,
    실패벌: 실패들, 달러: Number(달러.toFixed(2)), 모델,
    곡: 결과.map((r) => r.이름), 규격밖: 밖.length, 낼곳,
  });
  console.log(장부실패
    ? `  ⚠ 생산 장부를 못 남겼다(${장부실패}) — 이 실행은 «셈에 안 잡힌다»: ${path.relative(ROOT, 생산장부경로)}`
    : `  생산 장부 = ${path.relative(ROOT, 생산장부경로)} (몇 번 불렀고 얼마 썼나)`);
  if (밖.length || 실패들.length) process.exitCode = 1;
}

/* 🔑 조각을 밖으로 낸다 — 회귀가 «차단 대책»을 픽스처로 재기 위해서다(09-03).
 *   CLI 동작은 그대로다: 직접 부르면 main 이 돈다, require 로 실어도 안 돈다. */
module.exports = { 조각살리기, 생산장부적기, 생성재시도, 셈, 곡값달러, 생산장부경로, 결들, 공통머리 };

if (require.main === module) {
  main().catch((e) => { console.error('🔴', e.message); process.exit(1); });
}
