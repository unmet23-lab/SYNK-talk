#!/usr/bin/env node
/* 미니맥스곡생산 — 노래(가사 붙은 곡)를 굽고 **씨앗을 반드시 남긴다**.
 *   (2026-09-05 · 유호 지시 「씨앗 남기는 통로 만들어줘」 · 「전에 minimax로 만든 느낌으로만 계속 만들수있으면 나는 만족해」)
 *
 * ■ 🔴 왜 이 파일이 생겼나 — **좋은 곡을 하나 잃었다.**
 *   09-04 에 유호님이 「너무 마음에 들어」 하신 `_씨앗없음_citypop_vocal.wav` 는 씨앗을 안 적어서
 *   **되만들 수 없다.** 그때는 곡을 세션 안의 일회용 스크립트로 구웠고, 씨앗을 적는 자리가 없었다.
 *   🔑 그리고 이 통로의 기본값이 `randomize_seed: true` 다 — 아무것도 안 하면 매번 씨앗이 굴러가고
 *      그 값은 화면에만 잠깐 떴다가 사라진다. **그래서 「안 적었다」가 아니라 「적을 자리가 없었다」가 맞다.**
 *
 * ■ ✅ 되는 까닭 = 굽고 나면 **쓴 씨앗이 돌아온다**(두 통로 모두 넷째 반환값이 `Seed` · 09-05 실측).
 *   ⇒ 무작위로 굽더라도 그 값을 받아 적으면 같은 곡을 다시 만들 수 있다.
 *   이 도구는 그 값을 **곡 파일 옆에 사이드카(`<곡이름>.json`)로 박고** 장부에도 한 줄 적는다.
 *   🔑 사이드카를 쓰는 까닭: 곡을 다른 폴더로 옮겨도 씨앗이 **따라간다.** 장부만 있으면 옮기는 순간 끊긴다.
 *
 * ■ 🔴 통로가 **둘**이고, 무엇을 지키느냐가 다르다 (09-05 저녁에 이 자리를 다시 갈랐다)
 *   | 통로 | 가사 | 유호 판정 |
 *   |---|---|---|
 *   | `/simple_generate` | 모델이 **스스로 짓는다**(우리 가사를 버린다) | ✅ **「노래 느낌은 이게 제일 나아」**(씨앗8888) |
 *   | `/studio_generate` | 우리 것을 **그대로 지킨다** | — |
 *   🔴 첫 판은 `/studio_generate` 하나만 쓰도록 못 박았는데, **그것이 틀렸다.**
 *      유호님이 제일 좋다고 하신 곡(`씨앗8888_긴가사`)이 바로 «가사를 버리는» 쪽에서 나왔다.
 *      ⇒ 모델이 스스로 짠 구성이 우리가 넣은 것보다 나았다는 뜻이고, 그 길을 막으면 좋은 곡을 막는다.
 *   🔑 그래서 기본은 `simple` 이다. 우리가 쓴 가사를 꼭 지켜야 할 때만 `--통로 studio`.
 *   ⚠ 09-04 에 한국어 가사가 전부 영어로 불린 사고는 이 통로 탓이 맞다(설명만 보고 새로 짓는다).
 *      그러니 «우리 가사»가 목적이면 studio, «좋은 노래»가 목적이면 simple 이다. 목적이 갈린다.
 *   ✅ 곁수확: `simple` 은 반환값이 하나 더 온다 — **모델이 지은 가사**. 사이드카에 같이 박는다.
 *
 * ■ 🔴 손잡이는 기본값을 안 건드린다 — `guidance 1.7 · steps 30 · headroom 0`
 *   올리면 소리가 천장에 부딪혀 잘린다(09-04 실측: 밀기 3 → 잘린 지점 3,385곳 · 기본값 → 0곳).
 *
 * 쓰기:
 *   node tools/미니맥스곡생산.js --결 여름시티팝 --벌 3               새로 굽고 씨앗을 남긴다
 *   node tools/미니맥스곡생산.js --결 여름시티팝 --씨앗 1234          그 씨앗을 그대로 다시 굽는다(재현)
 *   node tools/미니맥스곡생산.js --되살리기 <곡.json>                 사이드카를 읽어 그 곡을 그대로 다시 만든다
 *   node tools/미니맥스곡생산.js --결목록                             쓸 수 있는 결과 그 문면을 보여준다
 *   옵션: --길이 <초 · 기본 120> · --낼곳 <폴더> · --연주곡(목소리 없이)
 *         --통로 simple|studio (기본 simple = 모델이 가사를 짓는다 · 유호님이 제일 좋다 하신 판이 이쪽)
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { 인자게이트 } = require('../lib/플래그.js');

/* 🔴 **긴 기다림은 `fetch` 로 못 한다** (09-05 실측 · 240초 곡을 굽다가 `terminated` 로 죽었다).
 *   Node 내장 fetch 는 몸통을 기다리는 한도가 **5분**으로 박혀 있고 늘릴 자리가 없다
 *   (`undici` 를 따로 깔면 되지만, 그 하나 때문에 저장소에 짐을 늘리지 않는다).
 *   그런데 4분짜리 곡은 굽는 데 **8분**쯤 걸린다 ⇒ 반드시 그 한도에 걸린다.
 * ⚠ 이때 나는 말이 `terminated` 뿐이라 «몫이 없어서 거절당한 것»으로 오해하기 쉽다.
 *   실은 정반대다 — **몫이 있어서 굽기 시작했는데 우리가 먼저 끊은 것**이고, 그러면 그 몫은 그냥 날아간다.
 * ✅ 그래서 오래 기다리는 쪽(GET)만 `node:https` 로 내린다. 여기는 한도를 우리가 정한다. */
const 기다림한도 = 20 * 60 * 1000;   // 20분. 상한 300초 곡이 ~10분이라 두 배로 잡는다

function 긴GET(url, 머리) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: 머리 }, (res) => {
      let 모음 = '';
      res.setEncoding('utf8');
      res.on('data', (조각) => { 모음 += 조각; });
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, 본문: 모음 }));
      res.on('error', reject);
    });
    req.setTimeout(기다림한도, () => req.destroy(new Error(`${기다림한도 / 60000}분을 기다렸는데 안 끝났다`)));
    req.on('error', reject);
  });
}

const 아는플래그 = ['--결', '--벌', '--씨앗', '--길이', '--낼곳', '--연주곡', '--결목록', '--되살리기', '--통로'];

const ROOT = path.resolve(__dirname, '..');
const SPACE = 'https://minimaxai-minimax-music3.hf.space';
const 장부경로 = path.join(ROOT, 'docs/_ops/곡씨앗.jsonl');
const 기본낼곳 = 'C:/Users/q1212/OneDrive/Desktop/SYNK 자산/음악/_보기용';

/* 🔴 **손잡이 셋은 기본값에서 안 움직인다**(위 머리말의 09-04 실측). 바꿀 일이 생기면
 *   여기 한 줄을 고치고 그 까닭을 적는다 — 부르는 쪽이 제각기 정하면 곡마다 음질이 갈린다. */
const 손잡이 = { headroom: 0, steps: 30, guidance: 1.7 };

/* ── 결(문면) 정본 ────────────────────────────────────────────────
 * 🔑 **이 상수가 문면의 주인이다.** appsscript `docs/음악자산_장부.md` 의 §문면 절은 이 자리를 가리킨다.
 *   09-05 에 내가 장부를 안 열고 문면을 새로 지어 한 판을 버렸다(유호 「시티팝이 아니라 kpop같고 뻔하다」).
 *   빠졌던 결정적인 말 셋: `80s` · `wide analog reverb` · `clean vintage mix`.
 * ⚠ 결을 늘리면 위 `아는플래그` 가 아니라 여기만 고치면 된다. */
const 결들 = {
  여름시티팝: {
    설명: '80s japanese city pop, bright summer seaside mood, sparkling electric piano, punchy slap bass, '
      + 'warm brass stabs, breezy airy female vocal, mid-up tempo around 112 bpm, wide analog reverb, '
      + 'nostalgic golden-hour warmth, clean vintage mix',
    뭐냐: '유호님이 「너무 마음에 들어」 하신 정본(_씨앗없음_citypop_vocal)과 같은 문면',
  },
  담백한한국어시티팝: {
    설명: 'warm korean city pop, gentle female vocal, bright piano and soft synth, mid tempo, hopeful morning mood',
    뭐냐: '유호님 「너무 좋은데?」 판(_씨앗없음_ko_vocal)과 같은 문면',
  },

  /* ── 새 무대 넷의 결 (2026-09-05 · 유호 지시 「그 장르 곡도 만들자」) ────────────────
   * 🔑 문면을 «무대 사진»에서 뽑았다 — 화면이 곡에 박혀 나가므로 소리와 그림이 어긋나면
   *   학생은 그 어긋남을 먼저 듣는다. 형제 저장소 `docs/라디오/무대/<결>.png` 가 그 그림이다.
   * 🔑 넷 다 «가사 없는 결»로 잡았다. 시티팝 둘이 이미 목소리를 쥐고 있어서, 새 넷까지
   *   노래하면 24시간 내내 사람 목소리가 끊이지 않는다. 자습·새벽 자리를 남긴다.
   * ⚠ 아직 «시험 판»이다 — 유호님이 들으시고 고르신 뒤에야 방송 판(6분+)으로 늘린다. */
  도시: {
    설명: 'lo-fi korean city pop, rainy evening rooftop mood, mellow rhodes piano, soft brushed drums, '
      + 'warm upright bass, distant city hum, no vocals, slow tempo around 88 bpm, wet plate reverb, '
      + 'streetlight glow through mist, nostalgic and calm',
    뭐냐: '무대 = 비 갠 저녁의 골목 옥상(city.png) · 창문 불빛과 젖은 지붕의 온도',
  },
  드림하늘: {
    설명: 'ethereal dream pop instrumental, floating above soft clouds, airy pad textures, gentle music box, '
      + 'breathy wordless humming, no lyrics, very slow tempo around 68 bpm, wide shimmering reverb, '
      + 'weightless pastel light',
    뭐냐: '무대 = 구름 위의 계단(dream_sky.png) · 파스텔과 양털 구름의 떠 있는 결',
  },
  드림물: {
    설명: 'minimal ambient instrumental, endless mirror water at sunset, sparse piano notes with long decay, '
      + 'slow synth swells, faint water ripples, no vocals, very slow tempo around 60 bpm, '
      + 'deep spacious reverb, serene and glassy',
    뭐냐: '무대 = 끝없는 거울 물(dream_water.png) · 해가 수면에 비치는 정면 역광',
  },
  드림들판: {
    설명: 'warm folk ambient instrumental, glowing meadow at dusk, soft acoustic guitar arpeggio, '
      + 'gentle string pad, distant humming, small twinkling bells like fireflies, no vocals, '
      + 'slow tempo around 72 bpm, golden and tender',
    뭐냐: '무대 = 빛나는 들판(dream_field.png) · 초록 언덕과 반딧불, 뒤로 주황 노을',
  },
};

function 인자값(argv, 이름, 기본) {
  const i = argv.indexOf(이름);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : 기본;
}

/** 허깅페이스 토큰. PRO 구독의 실행 몫(ZeroGPU)을 쓰려면 있어야 한다. */
function 토큰() {
  const p = process.env.HF_TOKEN_PATH || path.join(os.homedir(), '.cache', 'huggingface', 'token');
  if (!fs.existsSync(p)) return null;
  const t = String(fs.readFileSync(p, 'utf8')).replace(/^\uFEFF/, '').trim().split(/\s+/).find((x) => x.startsWith('hf_'));
  return t || null;
}

/** 굽는 데 넘길 state. 다섯 칸 중 우리가 채우는 것은 설명·가사·제목뿐이고
 *  나머지(global_meta·vocals·arrangement)는 빈 값으로 둬 모델이 설명에서 뽑게 한다. */
function state만들기(설명, { 연주곡 = false, 제목 = '', 가사 = '' } = {}) {
  return {
    mode: 'studio',
    description: 설명,
    instrumental: !!연주곡,
    title: 제목,
    lyrics: 가사,
    global_meta: '',
    vocals: '',
    arrangement: '',
  };
}

/** gradio 한 번 부르기. 던지고(POST) → 흘러오는 것을 읽어(GET) 마지막 결과를 집는다.
 *  🔑 두 통로의 «인자 모양이 똑같다»(09-05 실측) — 그래서 이름만 갈아 끼우면 된다. */
async function 한번굽기(state, { 길이, 씨앗, 무작위, 통로 = 'simple' }) {
  const 문 = 통로 === 'studio' ? 'studio_generate' : 'simple_generate';
  const t = 토큰();
  const 머리 = { 'content-type': 'application/json' };
  if (t) 머리.authorization = `Bearer ${t}`;

  const 던짐 = await fetch(`${SPACE}/gradio_api/call/${문}`, {
    method: 'POST',
    headers: 머리,
    body: JSON.stringify({
      data: [state, 길이, 씨앗, 무작위, 손잡이.headroom, 손잡이.steps, 손잡이.guidance],
    }),
  });
  if (!던짐.ok) throw new Error(`던지기 실패 ${던짐.status}: ${(await 던짐.text()).slice(0, 200)}`);
  const { event_id } = await 던짐.json();
  if (!event_id) throw new Error('event_id 가 안 왔다 — Space 가 바뀐 것으로 보인다');

  /* 🔑 결과는 «흘러서» 온다(SSE). 한 번에 안 오므로 조각을 모아 마지막 `complete` 를 읽는다.
   *   ⚠ 2분 곡에 3분 반쯤 걸린다 — 중간에 끊으면 남의 실행 자리만 쓰고 빈손이다. */
  const 흐름 = await 긴GET(`${SPACE}/gradio_api/call/${문}/${event_id}`, 머리);
  if (!흐름.ok) throw new Error(`받기 실패 ${흐름.status}`);
  const 본문 = 흐름.본문;

  /* 🔴 **`error` 를 먼저 본다.** 첫 판이 이걸 뒤로 미뤄서 「소리가 안 왔다」라는 쓸모없는 말만 냈다 —
   *   실제로는 서버가 까닭을 또박또박 말하고 있었다(09-05 실측: 남의 실행 자리 몫이 바닥).
   *   🔑 `generating` 은 «중간 상태»라 소리 자리가 null 이다. 완성본은 `complete` 에만 온다. */
  let 마지막 = null;
  let 오류 = null;
  for (const 덩이 of 본문.split('\n\n')) {
    const 종류 = (덩이.match(/^event:\s*(\S+)/m) || [])[1];
    const 자료 = (덩이.match(/^data:\s*(.*)$/m) || [])[1];
    if (!자료) continue;
    if (종류 === 'error') { 오류 = 자료; continue; }
    if (종류 === 'complete') {
      try { 마지막 = JSON.parse(자료); } catch { /* 조각난 줄은 버린다 */ }
    }
  }
  if (오류) {
    let 말 = 오류;
    try { 말 = JSON.parse(오류).error || 오류; } catch { /* 글자 그대로 쓴다 */ }
    /* 가장 자주 걸리는 벽에는 «무엇을 하면 되는지»를 붙인다 — 「초과했다」만으로는 다음 수를 모른다. */
    const 몫 = 말.match(/Try again in ([\d:]+)/);
    if (/ZeroGPU quota/i.test(말)) {
      throw new Error(`허깅페이스 실행 몫이 바닥났다${몫 ? ` — ${몫[1]} 뒤에 다시 찬다` : ''}.\n`
        + `   길 셋: ① 그때까지 기다린다 ② 곡 길이를 줄인다(몫은 길이에 비례한다) `
        + `③ 몫을 산다($1 = 10분치 · 유호님 손 · huggingface.co/settings/billing).\n`
        + `   원문: ${말.slice(0, 200)}`);
    }
    throw new Error(`서버가 거절했다: ${말.slice(0, 300)}`);
  }
  if (!마지막) throw new Error('완성 신호가 안 왔다 — 흐름이 중간에 끊긴 것으로 보인다(다시 부른다)');

  /* 돌아오는 넷: [상태글, 상태글, 소리파일, **씨앗**] — 넷째가 이 도구가 존재하는 까닭이다. */
  const 소리 = 마지막[2];
  const 쓴씨앗 = 마지막[3];
  /* 🔑 `simple` 만 다섯째를 준다 = **모델이 스스로 지은 가사**. 우리 가사를 버린 자리라
   *   이것을 안 적으면 「무슨 노랫말로 불렸나」가 곡 안에만 남고 글로는 사라진다(09-04 사고의 자리). */
  const 지은가사 = typeof 마지막[4] === 'string' ? 마지막[4] : null;
  if (!소리 || !(소리.url || 소리.path)) throw new Error(`소리가 안 왔다: ${JSON.stringify(마지막).slice(0, 200)}`);
  const url = 소리.url || `${SPACE}/gradio_api/file=${소리.path}`;
  const 받음 = await fetch(url, { headers: t ? { authorization: `Bearer ${t}` } : {} });
  if (!받음.ok) throw new Error(`내려받기 실패 ${받음.status}`);
  return { 소리: Buffer.from(await 받음.arrayBuffer()), 씨앗: 쓴씨앗, 지은가사 };
}

/** 🔑 이 도구의 존재 이유 — 곡 옆에 «다시 만드는 법»을 통째로 박는다. */
function 사이드카적기(곡경로, 적을것) {
  const p = 곡경로.replace(/\.[^.]+$/, '.json');
  fs.writeFileSync(p, JSON.stringify(적을것, null, 2), 'utf8');
  return p;
}

function 장부적기(줄) {
  try {
    fs.mkdirSync(path.dirname(장부경로), { recursive: true });
    fs.appendFileSync(장부경로, `${JSON.stringify(줄)}\n`, 'utf8');
    return null;
  } catch (e) { return e.message; }   // 장부를 못 써도 곡은 살린다 — 사이드카가 이미 씨앗을 쥔다
}

async function 본체(argv) {
  if (argv.includes('--결목록')) {
    console.log('쓸 수 있는 결:\n');
    for (const [이름, v] of Object.entries(결들)) {
      console.log(`  ${이름}\n    ${v.뭐냐}\n    문면: ${v.설명}\n`);
    }
    return;
  }

  /* 되살리기 = 사이드카 하나로 그 곡을 통째로 재현한다. 씨앗을 남긴 값이 여기서 드러난다. */
  const 되살릴것 = 인자값(argv, '--되살리기', null);
  if (되살릴것) {
    const j = JSON.parse(fs.readFileSync(되살릴것, 'utf8'));
    /* 🔑 통로도 사이드카에서 가져온다 — 씨앗이 같아도 «다른 문»으로 던지면 다른 곡이 나온다.
     *   옛 사이드카(통로 칸이 없던 판)는 `simple` 로 읽는다(그 시절 기본값). */
    const 통로 = j.통로문 || 인자값(argv, '--통로', 'simple');
    console.log(`되살린다: 결 ${j.결} · 씨앗 ${j.씨앗} · 길이 ${j.길이}초 · 통로 ${통로}`);
    const 낼곳 = 인자값(argv, '--낼곳', path.dirname(되살릴것));
    const r = await 한번굽기(j.state, { 길이: j.길이, 씨앗: j.씨앗, 무작위: false, 통로 });
    const 이름 = `${j.결}_씨앗${j.씨앗}_되살림`;
    const p = path.join(낼곳, `${이름}.wav`);
    fs.writeFileSync(p, r.소리);
    console.log(`✅ ${p} (${(r.소리.length / 1024 / 1024).toFixed(1)}MB · 돌아온 씨앗 ${r.씨앗})`);
    if (String(r.씨앗) !== String(j.씨앗)) {
      console.log(`⚠ 돌려준 씨앗이 다르다(${r.씨앗}) — 재현이 «안 된» 것이다. 이 줄이 보이면 그대로 보고한다.`);
    }
    return;
  }

  const 결 = 인자값(argv, '--결', '여름시티팝');
  if (!결들[결]) throw new Error(`모르는 결 "${결}" — 가능: ${Object.keys(결들).join(' · ')} (--결목록 으로 문면을 본다)`);
  const 벌 = Number(인자값(argv, '--벌', '1'));
  const 길이 = Number(인자값(argv, '--길이', '120'));
  const 낼곳 = 인자값(argv, '--낼곳', 기본낼곳);
  const 연주곡 = argv.includes('--연주곡');
  const 정한씨앗 = 인자값(argv, '--씨앗', null);
  const 통로 = 인자값(argv, '--통로', 'simple');
  if (통로 !== 'simple' && 통로 !== 'studio') throw new Error(`모르는 통로 "${통로}" — simple(모델이 가사를 짓는다 · 기본) 또는 studio(우리 가사를 지킨다)`);

  fs.mkdirSync(낼곳, { recursive: true });
  console.log(`결 ${결} · ${벌}벌 · ${길이}초 · ${연주곡 ? '연주곡' : '노래'} · 씨앗 ${정한씨앗 || '무작위(받아서 적는다)'}`);
  console.log(`통로 ${통로}${통로 === 'simple' ? ' (모델이 가사를 짓는다 — 유호님이 제일 좋다 하신 씨앗8888 이 이 통로다)' : ' (우리 가사를 지킨다)'}`);
  console.log(`낼곳: ${낼곳}\n`);

  for (let i = 1; i <= 벌; i++) {
    const state = state만들기(결들[결].설명, { 연주곡 });
    process.stdout.write(`  · ${i}/${벌} 굽는 중 … `);
    const t0 = Date.now();
    let r;
    try {
      r = await 한번굽기(state, {
        길이,
        씨앗: 정한씨앗 ? Number(정한씨앗) : 0,
        무작위: !정한씨앗,
        통로,
      });
    } catch (e) {
      console.log(`✗ ${e.message}`);
      continue;   // 한 벌이 죽어도 나머지는 굽는다
    }
    const 초 = ((Date.now() - t0) / 1000).toFixed(0);
    /* 🔑 이름에 통로도 박는다 — 씨앗이 같아도 통로가 다르면 다른 곡이라, 이름만 보고 갈려야 한다. */
    const 이름 = `${결}_씨앗${r.씨앗}_${통로}`;
    const 곡경로 = path.join(낼곳, `${이름}.wav`);
    fs.writeFileSync(곡경로, r.소리);
    const 적을것 = {
      결, 씨앗: r.씨앗, 길이, 연주곡, 손잡이,
      문면: 결들[결].설명,
      state,
      통로문: 통로,
      통로: `${SPACE} /${통로}_generate`,
      지은가사: r.지은가사 || null,   // simple 통로만 준다 — 무슨 노랫말로 불렸나가 글로도 남는다
      구운날: new Date().toLocaleDateString('sv-SE'),
      되살리는법: `node tools/미니맥스곡생산.js --되살리기 "${곡경로.replace(/\.wav$/, '.json')}"`,
    };
    const 사이드카 = 사이드카적기(곡경로, 적을것);
    const 탈 = 장부적기({ 때: new Date().toISOString(), 곡: path.basename(곡경로), ...적을것, state: undefined });
    console.log(`✅ ${(r.소리.length / 1024 / 1024).toFixed(1)}MB · ${초}초 · 씨앗 ${r.씨앗}`);
    console.log(`     ${곡경로}`);
    console.log(`     씨앗을 적었다 → ${path.basename(사이드카)}${탈 ? ` (장부는 못 썼다: ${탈})` : ''}`);
    if (r.지은가사) console.log(`     모델이 지은 노랫말도 적었다(${r.지은가사.length}자)`);
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const 플래그오류 = 인자게이트('미니맥스곡생산', argv, 아는플래그);
  if (플래그오류) { console.error(`[미니맥스곡생산] ${플래그오류}`); process.exit(1); }
  본체(argv).catch((e) => { console.error(`실패: ${e.message}`); process.exit(1); });
}

module.exports = { 결들, 손잡이, state만들기, 사이드카적기, 장부경로, 한번굽기 };
