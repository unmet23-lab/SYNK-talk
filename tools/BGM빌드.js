#!/usr/bin/env node
/* BGM빌드 — 미니게임 측정 스테이지 BGM 제작 통로 (게임층 설계 §3-2 기본안 · 유호 확정 08-11).
 *
 * ■ 왜 새 통로인가 — 사운드킷 통로(tools 아님 · as `사운드킷빌드.js`)는 「한 소리 400ms 이하」를
 *   테스트로 기계 강제해 곡을 원리상 못 만든다. 그래서 기본안의 정직한 비용이 「새 통로 신설」이었고
 *   유호님이 08-11 「기본안으로 이어서 하되 효과음+햅틱도 · 양질의 퀄리티로」로 승인했다.
 *
 * ■ 규칙 4 적용 범위 (결정록 #25 — 위임 판정):
 *   ① 400ms 상한 = 효과음 전용 → BGM 비적용. 그 자리는 「공통 1곡 · 측정 템포 고정」이 진다.
 *   ② 실패음 없음 → 승계(이 통로는 하강 버저·불협을 만들지 않는다).
 *   ③ 사인·트라이앵글만 → 「사인 배음 가산 합성까지」로 승계(모든 음색이 사인 부분음의 합 —
 *      톱니·사각·노이즈 원파형 금지 · 타악 없음).
 *   ④ C 펜타토닉 안 → 승계 그대로(전 성부 {C,D,E,G,A}만 · 아래 음표 데이터가 실측 대상).
 *
 * ■ 급소 셋:
 *   · 🔴 측정 템포는 `측정템포BPM` 하나가 정본이다 — 회차·모듈 간 템포가 갈리면 숨은 시계(확정 ③)의
 *     압박 대조가 오염된다(§3-2 ⓓ). 시간 리터럴을 곡 데이터에 흩뿌리지 않는다.
 *   · 🔴 이 통로의 산출물은 「후보」다 — 라이브 편입은 **유호님 시청 확정 후**(ⓑ 순서 밖 금지).
 *   · 결정적 렌더 — 같은 코드는 같은 바이트를 낸다(시드 고정 · `--check` 가 재렌더 대조로
 *     손 편집을 막는다 · 사운드킷 「손 편집 금지」 승계).
 *
 * 쓰기:
 *   node tools/BGM빌드.js          # assets/bgm/ 에 후보 2곡 렌더
 *   node tools/BGM빌드.js --check  # 재렌더 바이트 대조 (CI · 손 편집 탐지)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/* ── 정본 상수 ─────────────────────────────────────────────── */
const 측정템포BPM = 72;              // 🔴 측정 스테이지 템포 정본 — 이 한 곳(§3-2 ⓓ)
const SR = 44100;
const 박 = 60 / 측정템포BPM;         // 0.8333…s
const 마디 = 박 * 4;
const 루프마디 = 8;
const 루프초 = 마디 * 루프마디;      // 26.667s
const N = Math.round(루프초 * SR);   // 1,176,000 — 정확히 떨어진다

const 뿌리 = path.resolve(__dirname, '..');
const 폴더 = path.join(뿌리, 'assets', 'bgm');

/* ── 음정 — C 펜타토닉(④)만. 이름→주파수는 12평균율 한 곳에서 ── */
const 반음 = { C: -9, D: -7, E: -5, G: -2, A: 0 };   // A4 기준
function 주파수(이름) {
  const m = /^([CDEGA])(\d)$/.exec(이름);
  if (!m) throw new Error(`펜타토닉 밖 음: ${이름}`);
  return 440 * Math.pow(2, (반음[m[1]] + (Number(m[2]) - 4) * 12) / 12);
}

/* ── 결정적 난수(시드 LCG) — 미세 휴먼라이즈 전용 ─────────────── */
function 씨앗난수(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ── 신디시스 — 전부 사인 부분음의 합(③) ──────────────────────── */
/** buf(L/R Float64) 에 음 하나를 원형(loop-wrap)으로 쓴다. */
function 음쓰기(L, R, opt) {
  const { 시작초, 길이초, 주파수: f, 부분음, 어택, 릴리즈, 세기, 팬, 디튠 = 0 } = opt;
  const 시작 = Math.round(시작초 * SR);
  const 전체 = Math.round((길이초 + 릴리즈) * SR);
  const gL = 세기 * Math.cos((팬 + 1) * Math.PI / 4);
  const gR = 세기 * Math.sin((팬 + 1) * Math.PI / 4);
  const w = 2 * Math.PI * f * Math.pow(2, 디튠 / 1200) / SR;
  for (let i = 0; i < 전체; i++) {
    const t = i / SR;
    let env;
    if (t < 어택) env = 0.5 - 0.5 * Math.cos((t / 어택) * Math.PI);
    else if (t < 길이초) env = 1;
    else env = Math.exp(-3 * (t - 길이초) / 릴리즈) * (1 - (t - 길이초) / 릴리즈);
    if (env <= 0) continue;
    let s = 0;
    for (const [배, 진폭] of 부분음) s += Math.sin(w * 배 * i) * 진폭;
    const n = (시작 + i) % N;
    L[n] += s * env * gL;
    R[n] += s * env * gR;
  }
}

const 패부분음 = [[1, 1], [2, 0.32], [4, 0.07]];
const 종부분음 = [[1, 1], [3, 0.14], [5, 0.05]];   // 트라이앵글 계열(홀수 배음)
const 저음부분음 = [[1, 1], [2, 0.12]];

/* ── 화성 — 2마디씩 4화음(전부 ④ 안 · 하강 종지 없음 ②) ────────── */
const 진행 = [
  { 저음: 'C2', 패: ['C3', 'E3', 'G3', 'D4'] },
  { 저음: 'A2', 패: ['A2', 'C3', 'E3', 'G3'] },
  { 저음: 'D2', 패: ['D3', 'E3', 'A3', 'C4'] },
  { 저음: 'G2', 패: ['G2', 'A2', 'D3', 'E3'] },
];

/* ── 곡 조립 ──────────────────────────────────────────────── */
function 렌더(후보) {
  const L = new Float64Array(N);
  const R = new Float64Array(N);
  const 난수 = 씨앗난수(후보 === 'a' ? 20260811 : 20260812);

  // ① 패드 — 화음마다 성부 디튠쌍(±6센트)을 좌우로 벌린다. 어택이 느려 「깔림」이 된다.
  for (let ci = 0; ci < 4; ci++) {
    const 시작 = ci * 2 * 마디;
    const 세기 = 후보 === 'a' ? 0.062 : 0.038;
    진행[ci].패.forEach((음, vi) => {
      const f = 주파수(음);
      const 팬폭 = 0.55 - vi * 0.12;
      음쓰기(L, R, { 시작초: 시작, 길이초: 2 * 마디 - 0.4, 주파수: f, 부분음: 패부분음,
        어택: 1.4, 릴리즈: 1.6, 세기, 팬: -팬폭, 디튠: +6 });
      음쓰기(L, R, { 시작초: 시작, 길이초: 2 * 마디 - 0.4, 주파수: f, 부분음: 패부분음,
        어택: 1.4, 릴리즈: 1.6, 세기, 팬: +팬폭, 디튠: -6 });
    });
  }

  // ② 저음 — 4분 맥동(타악 없는 세계의 심장 박동 · 사인).
  for (let 박째 = 0; 박째 < 루프마디 * 4; 박째++) {
    const ci = Math.floor(박째 / 8);
    const f = 주파수(진행[ci].저음);
    const 강 = 박째 % 4 === 0 ? 1 : 0.72;
    음쓰기(L, R, { 시작초: 박째 * 박, 길이초: 박 * 0.55, 주파수: f, 부분음: 저음부분음,
      어택: 0.03, 릴리즈: 0.22, 세기: 0.085 * 강, 팬: 0 });
  }

  // ③ 종(펜타토닉 멜로디) — 후보 a=드문 물결(2분·4분) · b=8분 아르페지오.
  const 멜로디풀 = ['G4', 'A4', 'C5', 'D5', 'E5', 'G5'];
  if (후보 === 'a') {
    const 자리들 = [0, 3, 6, 10, 14, 16, 19, 22, 25, 28];  // 32박 안 드문 배치
    const 선율 = ['E5', 'D5', 'C5', 'A4', 'G4', 'C5', 'D5', 'E5', 'G5', 'D5'];
    자리들.forEach((박째, i) => {
      const 흔들 = (난수() - 0.5) * 0.012;
      음쓰기(L, R, { 시작초: 박째 * 박 + 흔들, 길이초: 0.05, 주파수: 주파수(선율[i]),
        부분음: 종부분음, 어택: 0.004, 릴리즈: 1.9, 세기: 0.075 * (0.9 + 난수() * 0.1),
        팬: i % 2 === 0 ? -0.3 : 0.3 });
    });
  } else {
    const 형 = [0, 2, 4, 5, 4, 2];                       // 상행-하행 아치(하강 종지 아님)
    for (let 박째 = 0; 박째 < 루프마디 * 4; 박째++) {
      for (const 반 of [0, 0.5]) {
        const idx = (박째 * 2 + 반 * 2) % 형.length;
        if ((박째 + 반) % 2 === 1.5) continue;            // 숨 자리 — 빽빽함 방지
        const 흔들 = (난수() - 0.5) * 0.010;
        음쓰기(L, R, { 시작초: (박째 + 반) * 박 + 흔들, 길이초: 0.04,
          주파수: 주파수(멜로디풀[형[idx]]), 부분음: 종부분음, 어택: 0.003, 릴리즈: 1.1,
          세기: 0.052 * (0.88 + 난수() * 0.12), 팬: 반 === 0 ? -0.25 : 0.25 });
      }
    }
  }

  // ④ 에코 — 점8분 순환 딜레이(핑퐁). 루프를 3바퀴 돌려 정상 상태의 마지막 바퀴만 취한다.
  const D = Math.round(박 * 0.75 * SR);
  const fb = 0.30, mix = 0.26;
  const 긴L = new Float64Array(N * 3), 긴R = new Float64Array(N * 3);
  for (let k = 0; k < 3; k++) { 긴L.set(L, k * N); 긴R.set(R, k * N); }
  for (let n = D; n < N * 3; n++) {
    긴L[n] += 긴R[n - D] * fb * mix;
    긴R[n] += 긴L[n - D] * fb * mix;
  }
  for (let n = 0; n < N; n++) { L[n] = 긴L[N * 2 + n]; R[n] = 긴R[N * 2 + n]; }

  // ⑤ 마스터 — 1폴 저역통과(온기) → 부드러운 새추레이션 → 피크 −6dBFS 정규화(효과음 −3 아래).
  const a = Math.exp(-2 * Math.PI * 6500 / SR);
  let zl = 0, zr = 0, 피크 = 0;
  for (let n = 0; n < N; n++) {
    zl = (1 - a) * L[n] + a * zl; L[n] = zl;
    zr = (1 - a) * R[n] + a * zr; R[n] = zr;
    L[n] = Math.tanh(L[n] * 1.15) / 1.15;
    R[n] = Math.tanh(R[n] * 1.15) / 1.15;
    피크 = Math.max(피크, Math.abs(L[n]), Math.abs(R[n]));
  }
  const 목표 = Math.pow(10, -6 / 20) / 피크;
  for (let n = 0; n < N; n++) { L[n] *= 목표; R[n] *= 목표; }
  return { L, R };
}

/* ── WAV(16bit 스테레오) ──────────────────────────────────── */
function WAV(L, R) {
  const 데이터 = Buffer.alloc(N * 4);
  for (let n = 0; n < N; n++) {
    데이터.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[n] * 32767))), n * 4);
    데이터.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[n] * 32767))), n * 4 + 2);
  }
  const 머리 = Buffer.alloc(44);
  머리.write('RIFF', 0); 머리.writeUInt32LE(36 + 데이터.length, 4); 머리.write('WAVE', 8);
  머리.write('fmt ', 12); 머리.writeUInt32LE(16, 16); 머리.writeUInt16LE(1, 20);
  머리.writeUInt16LE(2, 22); 머리.writeUInt32LE(SR, 24); 머리.writeUInt32LE(SR * 4, 28);
  머리.writeUInt16LE(4, 32); 머리.writeUInt16LE(16, 34);
  머리.write('data', 36); 머리.writeUInt32LE(데이터.length, 40);
  return Buffer.concat([머리, 데이터]);
}

/* ── 실행 ─────────────────────────────────────────────────── */
const 산출 = [
  { 후보: 'a', 파일: 'synk-bgm-candidate-a.wav', 이름: '물결 — 패드 중심·드문 종' },
  { 후보: 'b', 파일: 'synk-bgm-candidate-b.wav', 이름: '별빛 — 8분 아르페지오 중심' },
];

function main() {
  const 검사 = process.argv.includes('--check');
  if (!검사) fs.mkdirSync(폴더, { recursive: true });
  let 실패 = 0;
  for (const { 후보, 파일, 이름 } of 산출) {
    const { L, R } = 렌더(후보);
    const buf = WAV(L, R);
    const 경로 = path.join(폴더, 파일);
    if (검사) {
      const 실물 = fs.existsSync(경로) ? fs.readFileSync(경로) : null;
      const 같다 = 실물 && 실물.equals(buf);
      console.log(`${같다 ? '✅' : '❌'} ${파일} ${같다 ? '재렌더 일치' : '불일치/없음 — 손 편집이거나 미생성'}`);
      if (!같다) 실패++;
    } else {
      fs.writeFileSync(경로, buf);
      console.log(`✅ ${파일}  ${이름} · ${루프초.toFixed(1)}s · ${측정템포BPM}BPM · ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
    }
  }
  if (검사 && 실패) process.exit(1);
  if (!검사) console.log(`⚠ 후보다 — 라이브 편입은 유호님 시청 확정 후(§3-2 ⓑ). 선정되면 한 곡만 남긴다.`);
}
main();
