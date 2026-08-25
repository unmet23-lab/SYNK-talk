'use strict';
/**
 * 곡판규격 — SYNK **Reed** 셋째 기둥. 「한 곡에서 어떤 판들이 나가나」를 한 자리에서 정한다.
 * (설계 정본 = appsscript `docs/Reed_설계_v0.1.md` §2-③)
 *
 * ■ 왜 필요한가 — 곡 하나가 «여러 판»으로 나간다
 *   방송 루프(6분+) · 앱 자습 판 · 유호님 시청 판. 08-25~26 에 이 셋을 손으로 세 번 조립했고,
 *   그때마다 ffmpeg 인자를 다시 골랐다. 곡이 100이면 그 손이 300번이다.
 *
 * ■ 🔴 이 파일은 **명령을 조립만 하고 실행하지 않는다**
 *   실행은 도구 몫이다. 조립이 순수 함수여야 회귀가 「무엇으로 굽는가」를 물 수 있고,
 *   그래야 아래 «실측으로 배운 것 넷»이 프로즈가 아니라 **검사**가 된다.
 *
 * ■ 실측으로 배운 것 넷 (08-25~26 · 전부 유호님 화면에서 드러난 것)
 *   ① **m4a 는 안 켜지는 자리가 있다** — 같은 소리를 MP3 로 다시 뽑자 켜졌다. 시청 판은 MP3 다.
 *   ② **한글 파일명을 피한다** — 재생기·전송 통로마다 다르게 다뤄진다. 시청 판 이름은 ASCII.
 *   ③ **−20 LUFS 는 작다** — 노트북 스피커로 「켜져 있나?」 싶은 수준이었다. 시청 판은 −14.
 *   ④ **20초 루프로는 판단이 안 선다** — 시청 판은 최소 한 바퀴 이상 이어 붙인다.
 *
 * ■ 🚫 여기 두지 않는 것
 *   · 굽기 실행·파일 I/O — 도구 몫
 *   · 「이 곡이 좋은가」 — 유호님 귀 몫. 이 파일은 «어떻게 나가나»만 안다.
 */

/**
 * 판 셋. `라우드니스`·`최소초` 는 문턱이 아니라 **목표**다(문턱은 `곡장부.규격` 이 진다).
 * 🔑 방송 판의 −14 는 `곡장부.규격.라우드니스LUFS` 와 **같은 값이어야 한다** —
 *   갈라지면 「구울 때 맞춘 값」과 「채택 때 재는 값」이 달라 곡이 원리상 못 선다.
 *   `tests/곡판규격.test.js` 가 두 파일을 기계로 묶는다.
 */
const 판들 = Object.freeze({
  방송: Object.freeze({
    쓰임: '24시간 라디오 송출',
    코덱: 'mp3', 비트레이트: '192k', 표본율: 44100,
    라우드니스: -14, 최소초: 360,          // §3-B — 6분 아래면 반복이 들린다
    이름꼴: 'ascii',
  }),
  앱: Object.freeze({
    쓰임: '앱 자습 라디오',
    /* 🔑 비트레이트를 낮춘다 — 몽골 모바일 회선으로 나가는 소리다. 배경음이라 128k 로 충분하다
     *   (앞에 나오는 소리가 아니라 깔리는 소리다). */
    코덱: 'mp3', 비트레이트: '128k', 표본율: 44100,
    라우드니스: -16,                        // 앱은 효과음·목소리와 같이 나므로 한 칸 낮게 앉힌다
    최소초: 360,
    이름꼴: 'ascii',
  }),
  시청: Object.freeze({
    쓰임: '유호님 판정용',
    코덱: 'mp3', 비트레이트: '192k', 표본율: 44100,
    라우드니스: -14,
    최소초: 60,                             // 실측 ④ — 20초로는 판단이 안 선다
    이름꼴: 'ascii',
  }),
});

/** ASCII 로 걷어낸다 — 실측 ②. 다 걷히면 `null`(부르는 쪽이 대신할 이름을 안다). */
function ascii만(이름) {
  const s = String(이름 ?? '').trim();
  const 만 = s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return 만 || null;
}

/**
 * 나갈 파일의 «몸통 이름».
 * 🔴 **곡 id 를 먼저 쓴다**(08-26 실물이 잡음): 제목이 한글이면 ascii 로 다 걷혀서
 *   「비 오는 밤」도 「파도와 바람」도 전부 같은 이름이 된다 — 100곡이면 파일이 통째로 겹친다.
 *   장부의 `id` 는 그 곡의 열쇠이자 ASCII 라 이 자리에 정확히 맞는다.
 *   제목은 버리지 않는다 — **메타데이터 title 로** 실려 재생기에 한글로 뜬다.
 */
function 이름정리(이름, id) {
  return ascii만(id) || ascii만(이름) || 'track';
}

/**
 * 원본 루프를 목표 길이까지 채우려면 «몇 바퀴»인가.
 * 🔑 `-stream_loop` 은 «추가로 몇 번 더»라 1을 뺀다 — 이 한 칸을 틀리면 한 바퀴가 모자란다.
 * @returns {{바퀴: number, streamLoop: number, 실제초: number}}
 */
function 바퀴수(원본초, 목표초) {
  const 원 = Number(원본초) > 0 ? Number(원본초) : 0;
  const 목 = Number(목표초) > 0 ? Number(목표초) : 0;
  if (!원) return { 바퀴: 0, streamLoop: 0, 실제초: 0 };
  const 바퀴 = Math.max(1, Math.ceil(목 / 원));
  return { 바퀴, streamLoop: 바퀴 - 1, 실제초: 바퀴 * 원 };
}

/**
 * 🔴 **1패스 loudnorm 은 목표를 못 맞힌다** — 08-26 실물이 잡았다.
 *   같은 규격으로 구운 두 곡이 −14.9 / −15.1 LUFS 로 나왔고, 뒤쪽은 허용(±1)을 넘겨
 *   **채택 문턱에서 떨어진다**. 1패스는 곡을 훑으면서 «추정»으로 맞추기 때문이다.
 *   ⇒ 2패스로 간다: ①먼저 재고 ②그 실측을 인자로 넣어 굽는다. 이래야 곡마다 볼륨이
 *     같아지고, 그게 「100곡이 한 방송으로 들리는가」(설계 §4)의 절반이다.
 *
 * 1패스 = «재기만» 하는 인자. stderr 에 JSON 이 나온다(`print_format=json`).
 */
function 측정인자({ 원본, 판 }) {
  const 규 = 판들[판];
  if (!규) throw new Error(`모르는 판: ${판}`);
  return ['-hide_banner', '-nostats', '-i', 원본,
    '-af', `loudnorm=I=${규.라우드니스}:TP=-1.5:LRA=11:print_format=json`,
    '-f', 'null', '-'];
}

/** 1패스 출력(JSON 문자열 또는 객체) → 2패스에 넣을 값. 못 읽으면 `null`(조용히 1패스로 돌아간다). */
function 측정읽기(출력) {
  try {
    const o = typeof 출력 === 'string'
      ? JSON.parse(String(출력).slice(String(출력).lastIndexOf('{'), String(출력).lastIndexOf('}') + 1))
      : 출력;
    const 칸 = ['input_i', 'input_tp', 'input_lra', 'input_thresh'];
    if (!o || 칸.some((k) => !Number.isFinite(Number(o[k])))) return null;
    return { I: Number(o.input_i), TP: Number(o.input_tp), LRA: Number(o.input_lra), thresh: Number(o.input_thresh) };
  } catch { return null; }
}

/**
 * 굽기 명령 인자 — **ffmpeg 에 그대로 넘길 배열**. 문자열로 조립하지 않는다(따옴표 지옥 회피).
 *
 * @param {{원본: string, 원본초: number, id: string, 이름: string, 판: '방송'|'앱'|'시청', 나갈방: string}} 요청
 *   `id` = 장부 열쇠(ASCII · 파일명이 된다) · `이름` = 사람이 읽는 제목(메타로만 실린다)
 * @returns {{인자: string[], 나갈길: string, 판: object, 바퀴: object}}
 */
function 굽기인자({ 원본, 원본초, id, 이름, 판, 나갈방, 측정 = null }) {
  const 규 = 판들[판];
  if (!규) throw new Error(`모르는 판: ${판}`);
  const 바퀴 = 바퀴수(원본초, 규.최소초);
  const 파일 = `${이름정리(이름, id)}-${판 === '방송' ? 'air' : 판 === '앱' ? 'app' : 'demo'}.mp3`;
  const 나갈길 = `${String(나갈방).replace(/[\\/]+$/, '')}/${파일}`;
  const 인자 = ['-y', '-hide_banner', '-loglevel', 'error'];
  if (바퀴.streamLoop > 0) 인자.push('-stream_loop', String(바퀴.streamLoop));
  인자.push('-i', 원본);
  /* 🔑 `loudnorm` 뒤에 `aresample` 을 둔다 — loudnorm 이 48kHz 로 올려 놓는다(08-26 실측).
   *   원본이 44.1kHz 인데 산출만 48k 이면 되풀이 굽기마다 표본율이 오르내린다. */
  /* 측정이 있으면 2패스(정확) · 없으면 1패스(대략) — «없으면 조용히 대충»이 아니라
   *   부르는 쪽이 1패스를 안 돌린 것이고, 그 결과는 채택 문턱이 잡는다. */
  const ln = 측정
    ? `loudnorm=I=${규.라우드니스}:TP=-1.5:LRA=11:measured_I=${측정.I}:measured_TP=${측정.TP}`
      + `:measured_LRA=${측정.LRA}:measured_thresh=${측정.thresh}:linear=true`
    : `loudnorm=I=${규.라우드니스}:TP=-1.5:LRA=11`;
  인자.push('-af', `${ln},aresample=${규.표본율}`);
  인자.push('-c:a', 'libmp3lame', '-b:a', 규.비트레이트, '-ar', String(규.표본율), '-ac', '2');
  /* 제목은 «한글 그대로» 메타에 싣는다 — 파일명만 ASCII 다(재생기에는 사람 말이 뜬다). */
  인자.push('-id3v2_version', '3', '-metadata', `title=${String(이름 ?? id ?? '').trim()} (${판})`);
  인자.push(나갈길);
  return { 인자, 나갈길, 판: 규, 바퀴 };
}

/** 한 곡에서 나갈 판 전부 — 「한 명령으로 전부」의 재료. */
function 전체판({ 원본, 원본초, id, 이름, 나갈방, 측정판별 = {}, 판목록 = ['방송', '앱', '시청'] }) {
  return 판목록.map((판) => 굽기인자({ 원본, 원본초, id, 이름, 판, 나갈방, 측정: 측정판별[판] || null }));
}

/**
 * 🔴 **이 곡이 목표 라우드니스에 «도달할 수 있나»** — 08-26 실물이 요구한 진단.
 *
 *   calm-2 가 2패스로도 −15.1 에 멈췄다. 버그가 아니라 **재료의 성질**이었다:
 *     원본 I −21.41 · TP −6.00 → −14 로 올리려면 +7.41dB 인데, 그러면 TP 가 +1.41dBTP 가 되어
 *     천장(−1.5)을 2.9dB 넘는다. 즉 «피크 여유»가 모자란 것이고, 더 올리려면 소리를 눌러야 한다.
 *
 *   ⇒ 검사가 「탈락」만 말하면 사람은 «내가 뭘 잘못했지»를 찾는다. 그래서 **못 넘는 이유와
 *     도달 가능한 최대치**를 함께 낸다(오늘 §4 제안의 ⓑ축 「검사가 자기 사각을 스스로 적는다」).
 *
 * @returns {{최대: number, 여유dB: number, 닿나: boolean}}
 */
function 도달가능최대(측정, 판, TP천장 = -1.5) {
  const 규 = 판들[판];
  if (!규 || !측정 || !Number.isFinite(측정.I) || !Number.isFinite(측정.TP)) {
    return { 최대: NaN, 여유dB: NaN, 닿나: false };
  }
  const 여유dB = TP천장 - 측정.TP;                    // 피크를 이만큼 올릴 수 있다
  const 최대 = 측정.I + 여유dB;                        // 그만큼 올리면 라우드니스가 여기까지 간다
  return { 최대, 여유dB, 닿나: 최대 >= 규.라우드니스 };
}

/** 사람이 읽는 한 줄 — 「왜 못 넘나」를 그 자리에서 말한다. */
function 도달진단(측정, 판, TP천장 = -1.5) {
  const 규 = 판들[판];
  const r = 도달가능최대(측정, 판, TP천장);
  if (!Number.isFinite(r.최대)) return '못 쟀다 — 1패스를 먼저 돌린다';
  if (r.닿나) return `닿는다 — 최대 ${r.최대.toFixed(1)} LUFS (목표 ${규.라우드니스})`;
  return `못 닿는다 — 이 곡은 ${r.최대.toFixed(1)} LUFS 가 한계다(목표 ${규.라우드니스}). `
    + `원본 I ${측정.I.toFixed(1)} · TP ${측정.TP.toFixed(1)} 이라 피크 여유가 ${r.여유dB.toFixed(1)}dB 뿐이다. `
    + '재료가 성기다는 뜻이고, 더 올리려면 소리를 눌러야 한다 — 그건 「곡을 바꾸는」 일이라 여기서 안 한다.';
}

module.exports = { 판들, ascii만, 이름정리, 바퀴수, 측정인자, 측정읽기, 굽기인자, 전체판, 도달가능최대, 도달진단 };
