#!/usr/bin/env node
/* 전사 대조 — 온디바이스 STT 후보를 현행 클라우드 전사(whisper-1)와 «기계로» 가른다.
 *
 * ■ 왜 (정찰 S1 · SYNK-appsscript docs/AI기능_정찰_2026-08.md · 유호 08-24 「정찰은 수용까지가 한 벌」):
 *   온디바이스 전사(iOS 26 SpeechAnalyzer · Android ML Kit)는 전사비 0 · 오프라인 · 원음성 미반출이라
 *   이기면 크게 이긴다. 지는지 이기는지는 감이 아니라 **한국어 CER** 로 잰다 — 특히 우리 학생축
 *   (몽골 화자의 비원어민 억양)에서. 이 도구가 그 판정의 자리다.
 *
 * ■ 기준 진실(ground truth)을 어디서 얻나 — **낭독 대본이 곧 정답이다.**
 *   자유 발화는 사람이 다시 받아써야 정답이 생기지만, «아는 문장 30개를 읽게» 하면 대본이 정답이다.
 *   비원어민 억양 축이 목적이므로 이 설계로 충분하다(자유 발화 일반화는 2차 — 이 파일 머리에 남긴다).
 *
 * ■ 눈금 — 한국어는 WER(어절)이 아니라 **CER(음절)** 이 정본이다: 띄어쓰기 유무가 어절 수를 흔들어
 *   WER 은 같은 발음을 다르게 센다. 그래서 ①NFC 정규화 ②문장부호 제거 ③공백 제거 후 음절 편집거리.
 *   참고로 공백 보존 CER 도 같이 낸다(띄어쓰기 성능이 따로 궁금할 때).
 *
 * ■ 판정 규약(정찰 S1 그대로): 온디바이스 CER 열세가 클라우드 대비 **절대 5%p 이하**면 갈아탄다
 *   (전사비 0·오프라인·㉣ 가 그 값을 넘는다). 5%p 는 시작값이고 바꾸면 이 머리말과 정찰 문서를 같이 고친다.
 *
 * 사용:
 *   node tools/전사대조.js <표본.json>
 *   표본.json = [{ "id": "s01", "대본": "…", "온디바이스": "…", "클라우드": "…" }, …]
 *   (수집 절차: 대본 30문장을 실기기에서 낭독 녹음 → 같은 음성을 두 경로로 전사해 한 파일에 담는다)
 */
'use strict';

const fs = require('fs');
const { 인자게이트 } = require('../lib/플래그.js');

/* 아는 낱말 — 조준축(--운영) 없음: 이 도구는 로컬 파일만 읽고 쓴다. 나머지 인자는 위치 인자
 * (표본.json · 대본길 · 저장길)라 `--` 로 안 시작해 게이트에 안 걸린다(플래그게이트 ② 그대로). */
const 아는플래그 = ['--뼈대'];

/** 한국어 CER 용 정규화 — NFC · 문장부호/기호 제거 · (옵션) 공백 제거. */
function 정규화(글, { 공백유지 = false } = {}) {
  let s = String(글).normalize('NFC').toLowerCase();
  s = s.replace(/[.,!?;:"'`~()\[\]{}<>…·—\-_/\\|@#$%^&*+=]/g, ' ');
  s = s.replace(/\s+/g, 공백유지 ? ' ' : '').trim();
  return s;
}

/** 음절(코드포인트) 편집거리 — 삽입·삭제·치환 각 1. */
function 편집거리(a, b) {
  const A = Array.from(a); const B = Array.from(b);
  if (!A.length) return B.length;
  if (!B.length) return A.length;
  let 앞 = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const 줄 = [i];
    for (let j = 1; j <= B.length; j++) {
      줄[j] = Math.min(앞[j] + 1, 줄[j - 1] + 1, 앞[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    }
    앞 = 줄;
  }
  return 앞[B.length];
}

/** CER = 편집거리 / 정답 길이. 정답이 빈 문자열이면 null(못 잼 — 0 과 다르다). */
function CER(정답, 후보, opt) {
  const r = 정규화(정답, opt); const h = 정규화(후보, opt);
  const n = Array.from(r).length;
  if (!n) return null;
  return 편집거리(r, h) / n;
}

const 퍼 = (v) => (v == null ? '  못잼' : `${(v * 100).toFixed(1).padStart(5)}%`);

function 대조(표본) {
  const 행들 = [];
  for (const s of 표본) {
    if (!s || typeof s.대본 !== 'string') throw new Error(`표본 ${s && s.id} 에 대본이 없다 — 기준 진실 없이는 판정이 안 된다`);
    행들.push({
      id: s.id,
      온: CER(s.대본, s.온디바이스 ?? ''),
      클: CER(s.대본, s.클라우드 ?? ''),
      온공백: CER(s.대본, s.온디바이스 ?? '', { 공백유지: true }),
      클공백: CER(s.대본, s.클라우드 ?? '', { 공백유지: true }),
    });
  }
  const 값들 = (k) => 행들.map((r) => r[k]).filter((v) => v != null);
  const 평균 = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { 행들, 온평균: 평균(값들('온')), 클평균: 평균(값들('클')) };
}

/** 표본 자체가 성한가 — 클라우드(성숙한 기준선)조차 CER 25% 를 넘으면 전사기 대결이 아니라
 *  낭독·녹음이 무너진 것이다. 그 표본의 판정은 두 후보를 «같이 나쁘게» 만들어 차이를 지운다. */
function 표본경고(클평균) {
  if (클평균 != null && 클평균 > 0.25) {
    return '⚠표본 의심 — 클라우드 CER ' + (클평균 * 100).toFixed(1)
      + '% (> 25%). 낭독이 무너졌거나 녹음이 깨졌을 수 있다. 판정 전에 녹음을 귀로 듣고, 무너진 문장은 다시 읽어 채운다.';
  }
  return null;
}

/** 판정 — 정찰 S1 규약(≤5%p). 표본이 30 미만이면 «참고»로 강등한다(작은 표본으로 단정 금지). */
function 판정(온평균, 클평균, 표본수, 문턱 = 0.05) {
  if (온평균 == null || 클평균 == null) return { 말: '못 잼(빈 표본)', 코드: 2 };
  const 차 = 온평균 - 클평균;
  const 통과 = 차 <= 문턱;
  const 등급 = 표본수 >= 30 ? '판정' : `참고(표본 ${표본수} < 30)`;
  return {
    말: `${등급}: 온디바이스 ${퍼(온평균)} vs 클라우드 ${퍼(클평균)} · 차 ${(차 * 100).toFixed(1)}%p → ${통과 ? '✅ 갈아탈 값' : '🔴 열세 초과'}`,
    코드: 표본수 >= 30 ? (통과 ? 0 : 1) : 2,
  };
}

function main() {
  /* 모르는 낱말은 여기서 죽는다(F435) — 안 받으면 오타 플래그가 조용히 무시되고, 그건
   * 「딴 과녁을 재고 초록」의 모양이다(플래그게이트 ③ 부착 처방 그대로 · 08-24). */
  const 플래그오류 = 인자게이트('전사대조', process.argv.slice(2), 아는플래그);
  if (플래그오류) { console.error('[전사대조] ' + 플래그오류); process.exit(2); }
  /* --뼈대: 대본(docs/전사대조_대본_v1.json)을 빈 표본으로 펼친다 — 실기기 날 두 전사 결과만 채우면 된다. */
  if (process.argv[2] === '--뼈대') {
    /* 둘째 인자 = 대본 경로(선택) · 셋째 인자 = **저장 경로**(선택 · 권장).
     * 셸 리디렉션(> 표본.json)은 Windows 에서 셸 코드페이지(CP949)를 타 한글이 깨질 수 있다 —
     * 이 기계에서 두 번 실측한 함정이라, 파일은 도구가 직접 UTF-8 로 쓴다. */
    const 대본길 = process.argv[3] || 'docs/전사대조_대본_v1.json';
    const 저장길 = process.argv[4] || null;
    const 대본 = JSON.parse(fs.readFileSync(대본길, 'utf8'));
    const 뼈대 = 대본.문장.map((s2) => ({ id: s2.id, 대본: s2.대본, 온디바이스: '', 클라우드: '' }));
    const 몸 = JSON.stringify(뼈대, null, 2) + '\n';
    if (저장길) {
      fs.writeFileSync(저장길, 몸, 'utf8');
      console.error('[전사대조] 뼈대 ' + 뼈대.length + '문장 → ' + 저장길 + ' (UTF-8 직접 저장)');
    } else {
      process.stdout.write(몸);
    }
    return;
  }
  const 길 = process.argv[2];
  if (!길 || !fs.existsSync(길)) {
    console.error('사용: node tools/전사대조.js <표본.json>  |  --뼈대 [대본.json]  — 형식은 파일 머리말.');
    process.exit(2);
  }
  const 표본 = JSON.parse(fs.readFileSync(길, 'utf8'));
  const { 행들, 온평균, 클평균 } = 대조(표본);
  console.log('id      온디바이스   클라우드   (공백 보존: 온 · 클)');
  for (const r of 행들) {
    console.log(`${String(r.id).padEnd(7)} ${퍼(r.온)}    ${퍼(r.클)}    (${퍼(r.온공백)} · ${퍼(r.클공백)})`);
  }
  const 경고 = 표본경고(클평균);
  if (경고) console.log('\n' + 경고);
  const v = 판정(온평균, 클평균, 행들.length);
  console.log(`\n${v.말}`);
  process.exit(v.코드);
}

if (require.main === module) main();
module.exports = { 정규화, 편집거리, CER, 대조, 판정, 표본경고 };
