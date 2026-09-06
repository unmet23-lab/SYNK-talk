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
 * ■ 🔴🔴 **밀기(guidance) 기본값을 1.7 → 3 으로 옮겼다** (2026-09-06 · 유호 지시
 *   「저번에 엄청 좋다고 한 씨앗 없는 곡처럼, 똑같은 세팅으로 앞으로 뽑고 싶다」)
 *
 *   ⚠ 앞 판은 여기를 **1.7 로 못 박아** 두었다. 그 값을 고른 자는 «음질»이었다 —
 *   밀기를 올리면 소리가 천장에 부딪혀 잘린다(09-04 실측: 밀기 3 → 잘린 지점 3,385곳 · 1.7 → 2.5곳).
 *   🔴 **그런데 유호님 귀는 반대로 골랐다.** 같은 문면·같은 결에서 손잡이만 갈린 두 판의 판정:
 *   | 판 | 밀기 | 잘린 지점 | 유호 판정 |
 *   |---|---|---|---|
 *   | `_씨앗없음_citypop_vocal` | **3** | 3,385곳 | ✅ **「훌륭한데?」 · 「너무 마음에 들어」** |
 *   | `A_기본값그대로` | 1.7 | 2.5곳 | 🔴 **「별로」**(음질은 최고였다) |
 *   ⇒ 음질을 지키느라 유호님이 좋다 하신 결을 **도구가 못 내고 있었다.** 그래서 자를 바꾼다.
 *   🔑 밀기가 하는 일 = 「문면을 얼마나 세게 따라가나」. 3 은 시티팝의 결(브라스·슬랩베이스·리버브)을
 *      더 세게 붙잡고, 그 대가로 소리가 커져 천장을 친다.
 *
 * ■ ✅ 그 대가는 **도구가 스스로 치른다** — 굽고 나면 잘림을 자동으로 고친다.
 *   유호님이 「너무 좋은데??」 하신 판은 사실 «구운 것 그대로»가 아니라 그 잘림을 고친 판이었다
 *   (`_씨앗없음_citypop_vocal_고친판` · 3,385곳 → 1곳 · −11.4 → −13.9 LUFS = 방송 규격).
 *   ⇒ 그 두 걸음을 한 명령에 묶었다. 원본(`_원본.wav`)도 같이 남긴다 — 다듬기는 «추정»이라 되돌릴 길을 둔다.
 *   ⚠ ffmpeg 이 없으면 다듬기만 건너뛰고 곡은 그대로 낸다(굽는 몫을 버리지 않는다).
 *
 * 쓰기:
 *   node tools/미니맥스곡생산.js --결 여름시티팝 --벌 3               새로 굽고 씨앗을 남긴다
 *   node tools/미니맥스곡생산.js --결 여름시티팝 --씨앗 1234          그 씨앗을 그대로 다시 굽는다(재현)
 *   node tools/미니맥스곡생산.js --되살리기 <곡.json>                 사이드카를 읽어 그 곡을 그대로 다시 만든다
 *   node tools/미니맥스곡생산.js --결목록                             쓸 수 있는 결과 그 문면을 보여준다
 *   옵션: --길이 <초 · 기본 240> · --낼곳 <폴더> · --연주곡(목소리 없이)
 *         --통로 simple|studio (기본 simple = 모델이 가사를 짓는다 · 유호님이 제일 좋다 하신 판이 이쪽)
 *         --밀기 <수 · 기본 3>  문면을 얼마나 세게 따라가나. 1.7 이 모델 기본값(음질은 그쪽이 낫다)
 *         --안다듬기            잘림 고치기를 건너뛴다(구운 소리 그대로 견줄 때만)
 *         --노랫말시도 <수 · 기본 5>  길이에 맞는 노랫말이 나올 때까지 몇 번 다시 지을까(몫 0)
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

const 아는플래그 = ['--결', '--벌', '--씨앗', '--길이', '--낼곳', '--연주곡', '--결목록', '--되살리기', '--통로',
  '--밀기', '--안다듬기', '--노랫말시도'];

const ROOT = path.resolve(__dirname, '..');
const SPACE = 'https://minimaxai-minimax-music3.hf.space';
const 장부경로 = path.join(ROOT, 'docs/_ops/곡씨앗.jsonl');
const 기본낼곳 = 'C:/Users/q1212/OneDrive/Desktop/SYNK 자산/음악/_보기용';

/* 🔴 **이 셋이 소리의 성격을 정한다.** 부르는 쪽이 제각기 정하면 곡마다 결이 갈리므로 여기가 주인이다.
 *   `guidance`(밀기) 3 = 유호님이 좋다 하신 `_씨앗없음_citypop_vocal` 과 같은 값(위 머리말의 표).
 *   나머지 둘은 모델 기본값 그대로다 — 09-04~09-06 에 좋다고 나온 곡이 전부 이 값이었다. */
const 기본손잡이 = { headroom: 0, steps: 30, guidance: 3 };

/** 🔑 밀기만 갈아 끼운 손잡이 한 벌. 되살릴 때는 **사이드카에 박힌 값**을 그대로 되돌려야 하므로
 *   손잡이를 전역에서 읽지 않고 언제나 인자로 들고 다닌다(옛 곡은 1.7 로 구워졌다). */
function 손잡이만들기(밀기) {
  const g = Number(밀기);
  if (!Number.isFinite(g) || g <= 0) throw new Error(`밀기는 0보다 큰 수라야 한다 — 받은 것: ${밀기}`);
  return { ...기본손잡이, guidance: g };
}

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

/** 🔑 **곡을 굽기 «전»에 노랫말과 세 칸을 받아 온다** (09-06 신설 · 이 도구가 되살아나게 된 까닭).
 *   `compose_assist` 는 딥시크(남의 글쓰기 모델)를 불러 네 칸을 지어 돌려준다.
 *   ✅ 그래픽카드를 안 쓰므로 **허깅페이스 실행 몫을 한 톨도 안 먹는다.**
 *   ⇒ 이 넷을 받아 적어 두면, 다음부터는 씨앗과 함께 그대로 다시 넘겨 **한 바이트까지 같은 곡**을 만든다.
 * 🔴 이것을 안 하고 `/simple_generate` 로 곧장 구우면, 그 안쪽에서 네 칸을 «매번 새로» 짓고
 *   그 글은 어디에도 안 남는다(09-06 실측: 같은 씨앗 두 번 → 닮음 0.07 = 남남). */
async function 짓기(state, 길이) {
  const t = 토큰();
  const 머리 = { 'content-type': 'application/json' };
  if (t) 머리.authorization = `Bearer ${t}`;
  const 던짐 = await fetch(`${SPACE}/gradio_api/call/compose_assist`, {
    method: 'POST', headers: 머리,
    body: JSON.stringify({ data: [{ ...state, assist: 'all' }, 길이] }),
  });
  if (!던짐.ok) throw new Error(`짓기 던지기 실패 ${던짐.status}: ${(await 던짐.text()).slice(0, 200)}`);
  const { event_id } = await 던짐.json();
  if (!event_id) throw new Error('짓기 event_id 가 안 왔다 — Space 가 바뀐 것으로 보인다');
  const 흐름 = await 긴GET(`${SPACE}/gradio_api/call/compose_assist/${event_id}`, 머리);
  if (!흐름.ok) throw new Error(`짓기 받기 실패 ${흐름.status}`);
  let 끝 = null; let 오류 = null;
  for (const 덩이 of 흐름.본문.split('\n\n')) {
    const 종류 = (덩이.match(/^event:\s*(\S+)/m) || [])[1];
    const 자료 = (덩이.match(/^data:\s*(.*)$/m) || [])[1];
    if (!자료) continue;
    if (종류 === 'error') { 오류 = 자료; continue; }
    if (종류 === 'complete') { try { 끝 = JSON.parse(자료); } catch { /* 조각난 줄은 버린다 */ } }
  }
  if (오류) throw new Error(`짓기를 거절당했다: ${String(오류).slice(0, 300)}`);
  const 지은 = 끝 && 끝[0];
  if (!지은 || !String(지은.lyrics || '').trim()) throw new Error('노랫말이 안 돌아왔다 — 짓는 자리가 막힌 것으로 보인다');
  /* generate 1111~1115줄이 요구하는 둘: 세 칸 중 하나라도 있어야 하고, 노랫말이 비면 안 된다. */
  if (!['global_meta', 'vocals', 'arrangement'].some((k) => String(지은[k] || '').trim())) {
    throw new Error('소리 설명 세 칸이 전부 비었다 — 이대로 구우면 서버가 거절한다');
  }
  return { ...state, ...지은, mode: 'studio' };
}

/* ── 노랫말이 길이에 맞나 ──────────────────────────────────────────
 * 🔴 **곡이 왜 2분에 끝나나 — 길이 손잡이가 아니라 노랫말 분량이 정한다.**
 *   (2026-09-06 실측 · 유호 지시 「4분 중간에 곡 흐름에 따라 자연스럽게 마무리까지」)
 *   소스에 규칙이 박혀 있다(app.py `_LYRICS_RULES` 481줄): "Roughly 12-16 sung words per 10 seconds"
 *   ⇒ 120초면 144~192 낱말 · 240초면 288~384 낱말.
 *
 * 🔴 그런데 **같은 240초를 주문해도 지어지는 분량이 매번 갈린다**(09-06 실측 · 세 번 불러 봤다):
 *   | 시도 | 낱말 | 마무리 | 구역 |
 *   |---|---|---|---|
 *   | 1 | 284 | 🔴 없다 | 🔴 구역 표시가 통째로 없다 |
 *   | 2 | **165**(2분치) | 있다 | 11개 |
 *   | 3 | 411 | 있다 | 13개 |
 *   ⇒ 둘째 판이 유호님이 겪으신 자리다. 4분을 주문했는데 노랫말이 2분치라 곡도 2분에 끝난다.
 *   노랫말을 짓는 것은 딥시크(남의 글쓰기 모델)이고 씨앗도 온도도 안 넘기므로 매번 다르다.
 *
 * ✅ 처방 = **재고, 모자라면 다시 짓는다.** 짓는 문은 그래픽카드를 안 써서 **몫이 0** 이라 공짜다.
 *   조건을 다 채운 판이 나오면 즉시 쓰고, 끝까지 안 나오면 그중 가장 나은 것을 쓰면서 무엇이 모자랐는지 말한다. */

/** 지은 노랫말을 잰다. 구역 표시(`[verse]`·`[outro]` …)와 낱말 수가 판정 재료다. */
function 노랫말재기(노랫말, 길이) {
  const L = String(노랫말 || '');
  const 구역 = [...L.matchAll(/\[([a-z-]+)\]/g)].map((m) => m[1]);
  const 낱말 = L.replace(/\[[a-z-]+\]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  /* 아래는 규칙의 하한(10초에 12낱말), 위는 상한(16낱말)에서 조금 늘린 값 —
   * 넘치는 쪽은 곡이 길어질 뿐이라 모자라는 쪽보다 덜 나쁘다. */
  const 아래 = Math.round(길이 * 1.2);
  const 위 = Math.round(길이 * 1.8);
  const 마무리있나 = 구역.includes('outro');
  const 분량맞나 = 낱말 >= 아래 && 낱말 <= 위;
  /* 120초 넘는 곡은 소스가 「bridge 와 outro 를 갖춘 온전한 구성」을 요구한다 ⇒ 구역이 여덟은 돼야 한다. */
  const 구성섰나 = 구역.length >= (길이 >= 120 ? 8 : 4);
  return {
    구역, 낱말, 아래, 위, 마무리있나, 분량맞나, 구성섰나,
    쓸만한가: 마무리있나 && 분량맞나 && 구성섰나,
  };
}

/** 조건에 얼마나 가까운가. 다 채운 판이 끝내 안 나올 때 «가장 나은 것»을 고르는 자다. */
function 노랫말점수(판정) {
  let 점 = 0;
  if (판정.마무리있나) 점 += 1000;      // 마무리가 제일 무겁다 — 유호님이 아쉬워하신 자리다
  if (판정.구성섰나) 점 += 500;
  if (판정.분량맞나) 점 += 500;
  else 점 -= (판정.낱말 < 판정.아래 ? 판정.아래 - 판정.낱말 : 판정.낱말 - 판정.위);
  return 점;
}

/** 쓸 만한 노랫말이 나올 때까지 다시 짓는다. 🔑 짓기는 몫이 0이라 여러 번 불러도 손해가 없다. */
async function 쓸만한노랫말짓기(state, 길이, 시도수, 알림) {
  let 최고 = null;
  for (let i = 1; i <= 시도수; i++) {
    const 지은 = await 짓기(state, 길이);
    const 판정 = 노랫말재기(지은.lyrics, 길이);
    const 점 = 노랫말점수(판정);
    if (알림) {
      알림(`${i}/${시도수} 낱말 ${판정.낱말}(목표 ${판정.아래}~${판정.위}) · 구역 ${판정.구역.length} · `
        + `마무리 ${판정.마무리있나 ? '○' : '×'}${판정.쓸만한가 ? ' → 쓴다' : ''}`);
    }
    if (판정.쓸만한가) return { state: 지은, 판정, 시도: i, 채웠나: true };
    if (!최고 || 점 > 최고.점) 최고 = { state: 지은, 판정, 시도: i, 점 };
  }
  return { ...최고, 채웠나: false };
}

/** gradio 한 번 부르기. 던지고(POST) → 흘러오는 것을 읽어(GET) 마지막 결과를 집는다.
 *  🔑 두 통로의 «인자 모양이 똑같다»(09-05 실측) — 그래서 이름만 갈아 끼우면 된다. */
async function 한번굽기(state, { 길이, 씨앗, 무작위, 통로 = 'simple', 손잡이 = 기본손잡이 }) {
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
   *   이것을 안 적으면 「무슨 노랫말로 불렸나」가 곡 안에만 남고 글로는 사라진다(09-04 사고의 자리).
   * 🔴 09-06 정정 — 다섯째는 «글자»가 아니라 **state 통째**다(app.py 1566~1578: `yield ..., state, ...`).
   *   글자만 받던 첫 판은 언제나 null 을 적었다(09-06 실측: 씨앗8888 사이드카의 지은가사 칸이 비었다).
   *   그래서 둘 다 받는다 — 글자면 그대로, state 면 그 안의 `lyrics` 칸을 꺼낸다. */
  const 다섯째 = 마지막[4];
  const 돌아온state = (다섯째 && typeof 다섯째 === 'object' && typeof 다섯째.lyrics === 'string') ? 다섯째 : null;
  const 지은가사 = typeof 다섯째 === 'string' ? 다섯째 : (돌아온state ? 돌아온state.lyrics : null);
  if (!소리 || !(소리.url || 소리.path)) throw new Error(`소리가 안 왔다: ${JSON.stringify(마지막).slice(0, 200)}`);
  const url = 소리.url || `${SPACE}/gradio_api/file=${소리.path}`;
  const 받음 = await fetch(url, { headers: t ? { authorization: `Bearer ${t}` } : {} });
  if (!받음.ok) throw new Error(`내려받기 실패 ${받음.status}`);
  return { 소리: Buffer.from(await 받음.arrayBuffer()), 씨앗: 쓴씨앗, 지은가사, 돌아온state };
}

/* ── 다듬기 ────────────────────────────────────────────────────────
 * 🔑 **밀기 3 의 대가를 여기서 치른다.** 밀기를 올리면 소리가 커져 천장(0dB)에 부딪혀 잘리고,
 *   그 잘린 자리가 「지지직」으로 들린다. `adeclip` 이 잘려 나간 파형을 앞뒤 소리로 **추정해 메운다.**
 * ⚠ «되살리는» 것이 아니라 «추정»이다 — 숫자가 좋아져도 귀로 한 번 더 확인한다.
 * 🔴 `-ar 44100` 을 빼면 안 된다 — `loudnorm` 이 표본율을 192kHz 로 올려 파일이 4배가 된다(09-04 실측 88MB).
 * 값 넷은 09-04 에 실제로 재서 고른 것이고, 그 결과가 유호님 「너무 좋은데??」 판이다. */
const 다듬는필터 = 'adeclip=window=55:overlap=75:arorder=8:threshold=10:hsize=1000:method=add,'
  + 'loudnorm=I=-14:TP=-1.5:LRA=11';

/** 소리가 몇 곳에서 천장을 쳤나(=잘렸나)를 센다. 🔑 **귀 판정 «전»에 숫자가 먼저 답한다.**
 *  못 재면 null 을 돌려준다 — 못 잰 것을 「0곳」으로 적으면 거짓 초록이 된다. */
function 잘림세기(파일) {
  try {
    const { spawnSync } = require('node:child_process');
    /* 🔴 `execFileSync` 로는 못 읽는다 — 그것은 **stdout 만** 돌려주는데 astats 는 stderr 로 쓴다.
     *   첫 판이 그래서 언제나 null 을 냈다(09-06 실측). 그래서 둘 다 받는 `spawnSync` 를 쓴다.
     *   소리 자체는 버린다(`-f null -`) — 재기만 할 뿐 파일을 만들지 않는다. */
    const 판 = spawnSync('ffmpeg', ['-hide_banner', '-i', 파일, '-af', 'astats', '-f', 'null', '-'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const 글 = String(판.stderr || '');
    /* 🔑 **자를 09-04 판정과 같은 것으로 쓴다** = astats 의 «Overall» 줄(채널 평균).
     *   장부의 「2.5곳 · 4.5곳 · 14.5곳」 같은 소수가 그 자리에서 나온 값이다(채널 합이면 정수가 된다).
     * ⚠ 정규식 앞의 `\]` 가 «Abs Peak count» 를 걸러 낸다 — 그것까지 세면 수가 두 배로 부푼다. */
    const 곳 = [...글.matchAll(/\]\s*Peak count:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    if (!곳.length) return null;
    return 곳[곳.length - 1];   // 채널들 다음에 Overall 이 마지막으로 온다
  } catch { return null; }
}

/** 잘린 곡을 고친다. 성공하면 `{됐나:true, 전, 후}`, ffmpeg 이 없거나 죽으면 `{됐나:false, 까닭}`.
 *  🔑 **못 고쳐도 곡은 살린다** — 굽는 데 쓴 남의 실행 몫을 다듬기 실패로 버리지 않는다. */
function 잘림고치기(원본, 낼곳) {
  const { execFileSync } = require('node:child_process');
  const 전 = 잘림세기(원본);
  try {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', 원본, '-af', 다듬는필터,
      '-ar', '44100', '-c:a', 'pcm_s16le', 낼곳], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    const 까닭 = /ENOENT/.test(String(e.message)) ? 'ffmpeg 이 없다' : String(e.stderr || e.message).slice(0, 200);
    return { 됐나: false, 까닭, 전 };
  }
  if (!fs.existsSync(낼곳) || fs.statSync(낼곳).size === 0) return { 됐나: false, 까닭: '빈 파일이 나왔다', 전 };
  return { 됐나: true, 전, 후: 잘림세기(낼곳) };
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
    /* 🔴 **손잡이도 사이드카에서 가져온다.** 09-06 에 기본 밀기를 1.7 → 3 으로 옮겼으므로,
     *   전역 기본값으로 되살리면 그 «전»에 구운 곡이 다른 소리로 나온다(재현이 아니라 신곡이 된다).
     *   손잡이 칸이 없던 아주 옛 사이드카는 그 시절 값(1.7)으로 읽는다. */
    const 되살릴손잡이 = j.손잡이 && Number.isFinite(Number(j.손잡이.guidance))
      ? { ...기본손잡이, ...j.손잡이 }
      : { ...기본손잡이, guidance: 1.7 };
    console.log(`되살린다: 결 ${j.결} · 씨앗 ${j.씨앗} · 길이 ${j.길이}초 · 통로 ${통로} · 밀기 ${되살릴손잡이.guidance}`);
    const 낼곳 = 인자값(argv, '--낼곳', path.dirname(되살릴것));
    const r = await 한번굽기(j.state, { 길이: j.길이, 씨앗: j.씨앗, 무작위: false, 통로, 손잡이: 되살릴손잡이 });
    const 이름 = `${j.결}_씨앗${j.씨앗}_되살림`;
    const p = path.join(낼곳, `${이름}.wav`);
    fs.writeFileSync(p, r.소리);
    console.log(`✅ ${p} (${(r.소리.length / 1024 / 1024).toFixed(1)}MB · 돌아온 씨앗 ${r.씨앗})`);
    if (String(r.씨앗) !== String(j.씨앗)) {
      console.log(`⚠ 돌려준 씨앗이 다르다(${r.씨앗}) — 재현이 «안 된» 것이다. 이 줄이 보이면 그대로 보고한다.`);
    }
    /* 🔑 되살리기는 «구운 소리»를 견주는 자리다 — 다듬으면 원본과 sha256 이 안 맞아 재현을 못 잰다.
     *   그래서 여기서는 다듬지 않는다. 다듬은 판이 필요하면 --되살리기 뒤에 따로 돌린다. */
    return;
  }

  const 결 = 인자값(argv, '--결', '여름시티팝');
  if (!결들[결]) throw new Error(`모르는 결 "${결}" — 가능: ${Object.keys(결들).join(' · ')} (--결목록 으로 문면을 본다)`);
  const 벌 = Number(인자값(argv, '--벌', '1'));
  /* 🔄 기본 길이 120 → 240 (09-06 · 유호 「보통 좋은 노래들은 3~4분 이상이니까」).
   *   ⚠ 4분 곡은 몫을 486초 먹는다(2분은 258초) — 하루에 뽑을 수 있는 곡 수가 절반쯤으로 준다. */
  const 길이 = Number(인자값(argv, '--길이', '240'));
  const 낼곳 = 인자값(argv, '--낼곳', 기본낼곳);
  const 연주곡 = argv.includes('--연주곡');
  const 정한씨앗 = 인자값(argv, '--씨앗', null);
  const 통로 = 인자값(argv, '--통로', 'simple');
  if (통로 !== 'simple' && 통로 !== 'studio') throw new Error(`모르는 통로 "${통로}" — simple(모델이 가사를 짓는다 · 기본) 또는 studio(우리 가사를 지킨다)`);
  const 손잡이 = 손잡이만들기(인자값(argv, '--밀기', 기본손잡이.guidance));
  const 다듬나 = !argv.includes('--안다듬기');
  /* 노랫말을 몇 번까지 다시 지어 볼 것인가. 한 번에 20~30초 걸리고 **몫은 안 먹는다.**
   * 09-06 실측으로는 세 판 중 하나꼴로 조건을 채웠다 ⇒ 다섯이면 대개 걸린다. */
  const 노랫말시도수 = Math.max(1, Number(인자값(argv, '--노랫말시도', '5')));

  fs.mkdirSync(낼곳, { recursive: true });
  console.log(`결 ${결} · ${벌}벌 · ${길이}초 · ${연주곡 ? '연주곡' : '노래'} · 씨앗 ${정한씨앗 || '무작위(받아서 적는다)'}`);
  console.log(`통로 ${통로}${통로 === 'simple' ? ' (모델이 가사를 짓는다 — 유호님이 제일 좋다 하신 씨앗8888 이 이 통로다)' : ' (우리 가사를 지킨다)'}`);
  console.log(`밀기 ${손잡이.guidance}${손잡이.guidance === 기본손잡이.guidance ? ' (유호님이 좋다 하신 _씨앗없음_citypop_vocal 과 같은 값)' : ' (기본값에서 옮겼다)'}`);
  console.log(`다듬기 ${다듬나 ? '한다 (잘림 고치기 + 방송 음량 −14 LUFS)' : '건너뛴다 — 구운 소리 그대로 낸다'}`);
  console.log(`낼곳: ${낼곳}\n`);

  for (let i = 1; i <= 벌; i++) {
    let state = state만들기(결들[결].설명, { 연주곡 });
    let 노랫말판정 = null;
    const t0 = Date.now();
    let r;
    let 굽는문 = 통로;
    try {
      /* 🔴 **먼저 짓고, 그 다음에 굽는다** (09-06 · 이 두 걸음이 나뉘어야 곡이 되살아난다).
       *   `simple` 한 발로 구우면 안쪽에서 네 칸을 새로 짓고 그 글이 사라진다. 그래서 밖에서 짓는다.
       *   짓기는 그래픽카드를 안 쓰니 몫이 안 들고, 소리는 어차피 네 칸만 보므로 결과는 같은 결이다. */
      if (통로 === 'simple') {
        console.log(`  · ${i}/${벌} 노랫말 짓는 중 (길이에 맞을 때까지 다시 짓는다 · 몫 0)`);
        const 글 = await 쓸만한노랫말짓기(state, 길이, 노랫말시도수, (줄) => console.log(`      ${줄}`));
        state = 글.state;
        노랫말판정 = 글.판정;
        if (!글.채웠나) {
          console.log(`      ⚠ ${노랫말시도수}번 지었는데 조건을 다 채운 판이 없다. 그중 가장 나은 것으로 간다`
            + ` (낱말 ${글.판정.낱말} · 마무리 ${글.판정.마무리있나 ? '있다' : '없다'}).`);
          console.log('      ⇒ 이 곡은 주문한 길이보다 짧게 끝날 수 있다.');
        }
        굽는문 = 'studio';   // 지은 넷을 손대지 않고 그대로 넘기는 문
        process.stdout.write(`      굽는 중 … `);
      } else {
        process.stdout.write(`  · ${i}/${벌} 굽는 중 … `);
      }
      r = await 한번굽기(state, {
        길이,
        씨앗: 정한씨앗 ? Number(정한씨앗) : 0,
        무작위: !정한씨앗,
        통로: 굽는문,
        손잡이,
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

    /* 🔑 **다듬기.** 유호님이 듣는 파일이 «최종본»이라야 하므로 다듬은 판이 본 이름을 갖고,
     *   구운 그대로는 `_원본.wav` 로 옆에 남는다(다듬기는 추정이라 되돌릴 길을 둔다).
     * 🔴 못 다듬으면 원본을 본 이름으로 되돌린다 — 굽는 데 쓴 남의 실행 몫을 버리지 않는다. */
    let 다듬음 = null;
    if (다듬나) {
      const 원본경로 = 곡경로.replace(/\.wav$/, '_원본.wav');
      fs.renameSync(곡경로, 원본경로);
      다듬음 = 잘림고치기(원본경로, 곡경로);
      if (!다듬음.됐나) {
        fs.renameSync(원본경로, 곡경로);   // 되돌린다 — 곡은 살린다
      }
    }
    /* 🔴 **씨앗만으로는 못 되살린다** (09-06 실측 · 이 도구의 첫 판이 놓쳤던 자리).
     *   `simple` 통로는 굽기 «전»에 노랫말과 세 칸을 매번 **새로 쓴다**(app.py 544~552 · 1566~1578).
     *   그 글을 짓는 것은 딥시크(남의 글쓰기 모델)이고, 부를 때 씨앗도 온도도 안 넘긴다 ⇒ 매번 다른 글.
     *   그리고 소리를 만드는 자리(generate 1110~1123)는 **문면을 아예 안 본다** — 그 넷만 본다.
     *   ⇒ 같은 씨앗으로 두 번 구우면 남남이 나온다(09-06 실측: 닮음 0.07 · 남남 바닥값과 같다).
     * ✅ 그래서 **돌아온 네 칸을 그대로 적고, 되살릴 때는 `studio` 로 넘긴다.**
     *   그 문은 넷을 손대지 않고 그대로 넘기므로 씨앗이 곡을 붙잡는다.
     *   09-06 실측: 같은 넷 + 같은 씨앗으로 두 번 구운 곡의 sha256 이 **한 바이트도 다르지 않았다.** */
    const 되살릴state = r.돌아온state || state;   // 밖에서 지었으면 state 가 이미 네 칸을 쥔다
    const 네칸있나 = ['global_meta', 'vocals', 'arrangement'].some((k) => String(되살릴state[k] || '').trim())
      && String(되살릴state.lyrics || '').trim().length > 0;
    const 적을것 = {
      결, 씨앗: r.씨앗, 길이, 연주곡, 손잡이,
      문면: 결들[결].설명,
      state: 되살릴state,
      통로문: 네칸있나 ? 'studio' : 통로,   // 🔑 되살리기는 언제나 넷을 지키는 문으로 간다
      처음통로: 통로,                        // 무엇으로 «처음» 구웠나는 따로 남긴다
      통로: `${SPACE} /${굽는문}_generate`,
      되살아나나: 네칸있나
        ? '된다 — 이 사이드카의 네 칸 + 씨앗이면 한 바이트까지 같다(09-06 실측)'
        : '🔴 안 된다 — 네 칸이 없다. 씨앗만으로는 다른 곡이 나온다',
      지은가사: r.지은가사 || null,   // simple 통로만 준다 — 무슨 노랫말로 불렸나가 글로도 남는다
      /* 🔑 곡이 왜 그 길이로 끝났나의 답이 여기 있다 — 길이 손잡이가 아니라 노랫말 분량이 정한다. */
      노랫말: 노랫말판정 ? {
        낱말: 노랫말판정.낱말,
        목표낱말: `${노랫말판정.아래}~${노랫말판정.위}`,
        구역: 노랫말판정.구역.join(' → '),
        마무리있나: 노랫말판정.마무리있나,
        쓸만한가: 노랫말판정.쓸만한가,
      } : null,
      /* 🔑 다듬기는 «되살리기»의 일부가 아니다 — 되살리면 원본이 나오고, 그 다음에 다듬는다.
       *   그래도 무엇을 했는지는 적어 둔다. 안 적으면 곡마다 무엇이 손댄 판인지 못 가른다. */
      다듬음: !다듬나 ? '건너뛰었다(--안다듬기)'
        : (다듬음 && 다듬음.됐나
          ? `했다 — 잘린 지점 ${다듬음.전 ?? '못 잼'}곳 → ${다듬음.후 ?? '못 잼'}곳 · 원본은 ${path.basename(곡경로).replace(/\.wav$/, '_원본.wav')}`
          : `🔴 못 했다(${다듬음 ? 다듬음.까닭 : '까닭 모름'}) — 이 파일은 구운 그대로다`),
      다듬는법: `ffmpeg -y -i <원본> -af "${다듬는필터}" -ar 44100 -c:a pcm_s16le <낼곳>`,
      구운날: new Date().toLocaleDateString('sv-SE'),
      되살리는법: `node tools/미니맥스곡생산.js --되살리기 "${곡경로.replace(/\.wav$/, '.json')}"`,
    };
    const 사이드카 = 사이드카적기(곡경로, 적을것);
    const 탈 = 장부적기({ 때: new Date().toISOString(), 곡: path.basename(곡경로), ...적을것, state: undefined });
    const 낸크기 = (fs.statSync(곡경로).size / 1024 / 1024).toFixed(1);
    console.log(`✅ ${낸크기}MB · ${초}초 · 씨앗 ${r.씨앗} · 밀기 ${손잡이.guidance}`);
    console.log(`     ${곡경로}`);
    if (다듬음 && 다듬음.됐나) {
      console.log(`     🩹 다듬었다 — 잘린 지점 ${다듬음.전 ?? '못 잼'}곳 → ${다듬음.후 ?? '못 잼'}곳 (구운 그대로는 옆에 _원본.wav)`);
    } else if (다듬음) {
      console.log(`     🔴 다듬기를 못 했다(${다듬음.까닭}) — 이 파일은 구운 그대로다. 지지직이 들리면 그 탓이다`);
    }
    console.log(`     씨앗을 적었다 → ${path.basename(사이드카)}${탈 ? ` (장부는 못 썼다: ${탈})` : ''}`);
    if (r.지은가사) console.log(`     모델이 지은 노랫말도 적었다(${r.지은가사.length}자)`);
    console.log(네칸있나
      ? '     ✅ 되살릴 네 칸도 적었다 — 이 곡은 한 바이트까지 다시 만들 수 있다'
      : '     🔴 되살릴 네 칸이 없다 — 씨앗만 있고, 이 곡은 다시 못 만든다');
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const 플래그오류 = 인자게이트('미니맥스곡생산', argv, 아는플래그);
  if (플래그오류) { console.error(`[미니맥스곡생산] ${플래그오류}`); process.exit(1); }
  본체(argv).catch((e) => { console.error(`실패: ${e.message}`); process.exit(1); });
}

module.exports = {
  결들, 기본손잡이, 손잡이만들기, state만들기, 사이드카적기, 장부경로, 한번굽기,
  잘림세기, 잘림고치기, 다듬는필터,
  노랫말재기, 노랫말점수, 쓸만한노랫말짓기,
};
