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
 *   · 유호 피드백 08-11(a·b 시청): 「깔리는 소리 너무 좋아 · 게임소리같이 튀는 소리는 빼자」
 *     → 종·아르페지오 층 **전면 제거**(멜로디는 효과음 3종의 몫 — BGM 은 깔림만) ·
 *     빈 자리는 패드 소폭 증량 + 16초 주기 저역 「숨쉬기」(LFO)가 진다. 튀는 층 복원 금지.
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
const { 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)

/* 🎯 조준 축은 **없다** — 이 도구는 파일을 굽기만 한다(자격증명·네트워크 0). 그러니
 *   `공용플래그`(`--운영`)를 펴지 않는다. 받아 주고 아무것도 갈아타지 않는 것이 곧 F592 다
 *   (#Q111 이 `배포빚.js` 에서 일부러 뺀 그 자리). */
const 아는플래그 = ['--check'];

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
const 저음부분음 = [[1, 1], [2, 0.12]];

/* ── 화성 — 2마디씩 4화음(전부 ④ 안 · 하강 종지 없음 ②) ────────── */
const 진행 = [
  { 저음: 'C2', 패: ['C3', 'E3', 'G3', 'D4'] },
  { 저음: 'A2', 패: ['A2', 'C3', 'E3', 'G3'] },
  { 저음: 'D2', 패: ['D3', 'E3', 'A3', 'C4'] },
  { 저음: 'G2', 패: ['G2', 'A2', 'D3', 'E3'] },
];

/* ── 곡 조립 — 깔림판(유호 08-11: 튀는 층 0) ─────────────────── */
function 렌더() {
  const L = new Float64Array(N);
  const R = new Float64Array(N);

  // ① 패드 — 화음마다 성부 디튠쌍(±6센트)을 좌우로 벌린다. 어택이 느려 「깔림」이 된다.
  //    종 층이 빠진 자리는 증량(0.062→0.075)이 진다 — 새 층을 얹지 않는다(튀는 층 복원 금지).
  for (let ci = 0; ci < 4; ci++) {
    const 시작 = ci * 2 * 마디;
    const 세기 = 0.075;
    진행[ci].패.forEach((음, vi) => {
      const f = 주파수(음);
      const 팬폭 = 0.55 - vi * 0.12;
      음쓰기(L, R, { 시작초: 시작, 길이초: 2 * 마디 - 0.4, 주파수: f, 부분음: 패부분음,
        어택: 1.4, 릴리즈: 1.6, 세기, 팬: -팬폭, 디튠: +6 });
      음쓰기(L, R, { 시작초: 시작, 길이초: 2 * 마디 - 0.4, 주파수: f, 부분음: 패부분음,
        어택: 1.4, 릴리즈: 1.6, 세기, 팬: +팬폭, 디튠: -6 });
    });
  }

  // ② 저음 — 4분 맥동(타악 없는 세계의 심장 박동 · 사인). 어택을 느슨하게 — 「툭」이 아니라 「둥」.
  for (let 박째 = 0; 박째 < 루프마디 * 4; 박째++) {
    const ci = Math.floor(박째 / 8);
    const f = 주파수(진행[ci].저음);
    const 강 = 박째 % 4 === 0 ? 1 : 0.72;
    음쓰기(L, R, { 시작초: 박째 * 박, 길이초: 박 * 0.55, 주파수: f, 부분음: 저음부분음,
      어택: 0.06, 릴리즈: 0.26, 세기: 0.085 * 강, 팬: 0 });
  }

  // ③ 마스터 — 저역통과가 16초 주기로 아주 얕게 「숨」을 쉰다(정적인 깔림이 죽은 소리가 되지
  //    않게 — 새 음이 아니라 밝기의 호흡이라 튀지 않는다) → 새추레이션 → 피크 −6dBFS.
  //    LFO 주기 = 루프초/√... 가 아니라 루프의 정수 분할(26.67/2=13.33s ×2 상)으로 이음새 연속.
  let zl = 0, zr = 0, 피크 = 0;
  for (let n = 0; n < N; n++) {
    const 컷 = 5800 + 1400 * Math.sin(2 * Math.PI * 2 * n / N);   // 루프당 정확히 2주기 — 경계 연속
    const a = Math.exp(-2 * Math.PI * 컷 / SR);
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
// ✅ 선정 완료(유호 08-11 「너무 마음에 들어. 23번으로 커밋할게」) — 깔림판이 정식 측정 트랙이다.
const 산출 = [
  { 파일: 'synk-bgm-measure.wav', 이름: '측정 스테이지 정식 트랙 — 깔림(패드+맥동 · 유호 선정 08-11)' },
];
const 은퇴한후보 = [
  'synk-bgm-candidate-a.wav', 'synk-bgm-candidate-b.wav',  // 종 층이 있던 판(유호 「튀는 소리 빼자」)
  'synk-bgm-candidate-c.wav',                              // 선정되어 measure 로 승격 — 후보명 은퇴
];

function main() {
  const args = process.argv.slice(2);
  const 플래그오류 = 인자게이트('BGM빌드', args, 아는플래그);   // 모르는 낱말은 여기서 죽는다(F435)
  /* 🔴 게이트가 «렌더 앞»이다 — 뒤에 두면 `--chek` 오타 하나에 후보 2곡을 다 굽고 파일을
   *   덮어쓴 뒤에야 죽는다. 대조하려던 사람이 대조 대상을 잃는다. */
  if (플래그오류) { console.error(`[BGM빌드] ${플래그오류}`); process.exit(1); }
  const 검사 = args.includes('--check');
  if (!검사) fs.mkdirSync(폴더, { recursive: true });
  let 실패 = 0;
  for (const { 파일, 이름 } of 산출) {
    const { L, R } = 렌더();
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
  for (const 옛 of 은퇴한후보) {
    const 경로 = path.join(폴더, 옛);
    if (fs.existsSync(경로)) { fs.unlinkSync(경로); console.log(`🗑 ${옛} (은퇴판 정리)`); }
  }
  if (검사 && 실패) process.exit(1);
}
main();
