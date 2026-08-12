#!/usr/bin/env node
'use strict';
/**
 * 교정 eval 실행기 — 픽스처 전량을 **실제 엔진 경로**로 벤더에 돌려 채점 가능한 출력을 만든다.
 * (`evals/결과.md` 「다음에 할 것」 0·2 — 손 출력이 아니라 API 실측이 첫 진짜 기준선이다.)
 *
 *   node tools/eval-run.js --원격 --출력 evals/출력_v1api.json
 *   node tools/eval-run.js --원격 --출력 evals/출력_v2맥락.json --맥락 evals/맥락표본.json --표본 12
 *
 * ■ 왜 **원격**(리허설 `correct?평가=1`)이 기본 통로인가 — 로컬에 벤더 키가 없다:
 *   `ANTHROPIC_API_KEY` 는 리허설 Edge Fn 시크릿에만 있고 Management API 는 값 대신
 *   다이제스트(64자)를 준다(08-12 실측 — 그 값으로 치면 401). 키를 로컬로 끌어오는 대신
 *   **키가 있는 곳에서 돌린다.** 평가 통로는 DB 무접촉이라 리허설 append-only 를 오염시키지
 *   않고, 왕복골격을 타므로 **배포판 ≠ HEAD 면 여기서 죽는다** — 프롬프트를 고쳐 놓고 옛
 *   판이 배포된 채 재는 사고(재평가 무효)를 기계가 막는다. 응답의 `prompt_ver` 도 로컬 파일
 *   판과 대조한다(이중 자물쇠).
 * ■ 조립·해석은 `lib/교정엔진.js` 를 **그대로** 쓴다(Fn 쪽은 동봉으로 같은 파일) — 버리는
 *   것도 제품 규칙(`교정값`)으로 버리고 사유를 항목에 남긴다. 채점기는 그 항목을 실패로
 *   세는데 그게 맞다: 제품에서도 그 응답으로는 행이 안 선다.
 * ■ 재개 가능 — 출력 파일에 이미 있는 **성공** 항목은 건너뛴다(사유 항목은 다시 돈다 —
 *   제품의 「다음 배치가 다시 집는다」와 같은 방향). 묶음마다 중간 저장하고, 부분 실행은
 *   머리의 `완주: false` 로 드러난다(F207 — 조용한 절단은 「전부 돌았다」와 같은 모양으로 온다).
 * ■ `--로컬` 은 `.env` 에 `ANTHROPIC_API_KEY` 가 실제로 놓인 날을 위한 갈래로 남긴다.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const 자격증명 = require('../lib/자격증명.js');
const {
  모델, 왕복제한밀리, 메시지경로, 벤더헤더,
  프롬프트판, 요청몸통, 응답글, 울타리벗기기, 교정값, 재시도가능, 캐시성적, 성적합,
} = require('../lib/교정엔진.js');
const 계약 = require(path.join(ROOT, '계약', '수집_교정_계약.json'));

const die = (m) => { console.error('[eval실행] ' + m); process.exit(1); };

function 인자(이름, 기본 = null) {
  const i = process.argv.indexOf(이름);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : 기본;
}

/* 25로 잡았다가 죽었고(08-12 아침), 「12건 ≈ 72초 — 절반 여유」로 줄인 것도 같은 날 다시
 * 죽었다(49~60번째 묶음 504 실측). 평균(~6초)으로 고른 숫자는 **분산**에 진다 — 항목 하나가
 * 왕복제한(60초)까지 걸리는 것이 합법이라 묶음 12의 최악은 720초다. 손튜닝을 접고 최악으로
 * 증명되는 크기를 한계에서 **파생**시킨다: 묶음크기 × 왕복제한 ≤ 유휴한계 − 여유.
 * 60초 기준 2건 = 최악 120초 < 150초 — 왕복제한을 늘리면 묶음이 저절로 준다(회귀가 못박는다). */
const 엣지유휴한계밀리 = 150_000;   // Supabase Edge Fn IDLE_TIMEOUT — 08-12 하루 두 번 실측
const 묶음크기 = Math.max(1, Math.floor((엣지유휴한계밀리 - 20_000) / 왕복제한밀리));
const 대기들 = [5_000, 15_000, 45_000];    // 429·5xx — 잠시 뒤가 답이다
const 잠깐 = (ms) => new Promise((r) => setTimeout(r, ms));

/** 모델 원문(칭찬·다음미션 포함)과 제품 검증(교정값)을 **같은 글**에서 뽑아 항목 하나로. */
function 항목만들기(id, 글) {
  let 원형 = null;
  try { 원형 = JSON.parse(울타리벗기기(글)); } catch { /* 형식밖 — 교정값이 사유를 낸다 */ }
  const 검증 = 교정값(글, 계약.오류태그 || []);
  const 항목 = { id };
  if (원형 && typeof 원형 === 'object' && !Array.isArray(원형)) Object.assign(항목, 원형);
  if (검증.사유) 항목.검증사유 = 검증.사유;
  return 항목;
}

/* ── 로컬 갈래 — 벤더 직행(키가 .env 에 있는 날만) ─────────────────────────── */
async function 로컬한건(키, 지시문, fx, 맥락) {
  for (let 회 = 0; ; 회++) {
    let r;
    try {
      r = await fetch(메시지경로, {
        method: 'POST',
        headers: 벤더헤더(키),
        body: JSON.stringify(요청몸통({ 지시문, 문장: fx.입력, 급수: null, 맥락 })),
        signal: AbortSignal.timeout(왕복제한밀리),
      });
    } catch (e) {
      if (회 < 대기들.length) { await 잠깐(대기들[회]); continue; }
      return { 사유: `네트워크:${String((e && e.name) || e).slice(0, 40)}` };
    }
    if (!r.ok) {
      if (재시도가능(r.status) && 회 < 대기들.length) { await 잠깐(대기들[회]); continue; }
      return { 사유: `벤더:${r.status}` };
    }
    const 본문 = await r.json();
    const 글 = 응답글(본문);
    if (!글) return { 사유: '응답형식밖' };
    return { 글, 사용량: 본문.usage || null };
  }
}

async function main() {
  const 출력경로 = 인자('--출력');
  if (!출력경로) die('--출력 <파일> 이 필요하다 (예: --출력 evals/출력_v1api.json)');
  const 프롬프트경로 = 인자('--프롬프트', 'prompts/교정.md');
  const 표본수 = Number(인자('--표본', '0')) || 0;
  const 맥락경로 = 인자('--맥락');
  const 원격 = process.argv.includes('--원격');
  const 로컬 = process.argv.includes('--로컬');
  if (원격 === 로컬) die('--원격 또는 --로컬 중 하나를 골라라(평가가 어디서 도는지는 결과의 신원이다).');

  const 지시문 = fs.readFileSync(path.join(ROOT, 프롬프트경로), 'utf8');
  const 판 = 프롬프트판(지시문);
  if (!판) die(`${프롬프트경로} 머리에서 「현재 vN」을 못 읽었다 — 판 없는 출력은 비교 근거가 못 된다.`);

  const 픽스처 = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', '픽스처.json'), 'utf8'));
  let 항목들 = 픽스처.항목 || [];
  if (표본수 > 0) 항목들 = 항목들.slice(0, 표본수);

  /* 맥락 표본: { "<픽스처id>": "<학생 맥락 블록 문자열>" }. 없는 id 는 맥락 없이 돈다. */
  const 맥락표 = 맥락경로 ? JSON.parse(fs.readFileSync(path.resolve(ROOT, 맥락경로), 'utf8')) : {};

  const 출력전체 = path.resolve(ROOT, 출력경로);
  let 기존 = { 항목: [] };
  if (fs.existsSync(출력전체)) {
    기존 = JSON.parse(fs.readFileSync(출력전체, 'utf8'));
    /* 🔴 다른 판의 출력에 이어 붙이면 두 판이 한 파일에 섞인다 — 그 오염은 파일만 봐서는 안 보인다. */
    if (기존.prompt_ver && 기존.prompt_ver !== 판) {
      die(`재개 거부 — 기존 파일은 ${기존.prompt_ver}, 지금 프롬프트는 ${판}이다. 파일을 갈라라.`);
    }
  }
  /* 성공 항목만 스킵한다 — 사유 항목은 다시 돈다(제품의 「다음 배치가 다시 집는다」와 같은 방향). */
  const 끝난것 = new Map((기존.항목 || []).filter((o) => !o.사유 && !o.검증사유 && o.고친문장 !== undefined)
    .map((o) => [o.id, o]));

  let 원격머리 = null;   // { 부르기(조각항목들) → {prompt_ver, 결과, 캐시} }
  let 로컬키 = null;
  if (원격) {
    const 골격 = require('../lib/왕복골격.js');
    const { ref, service_role } = await 골격.열기('eval실행', {
      키: true, 사유: '이 시험은 벤더 비용을 쓴다(행은 안 남긴다)',
    });
    const 주소 = `https://${ref}.supabase.co/functions/v1/correct?%ED%8F%89%EA%B0%80=1`;
    원격머리 = async (조각) => {
      const r = await fetch(주소, {
        method: 'POST',
        headers: {
          apikey: service_role, Authorization: `Bearer ${service_role}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          항목: 조각.map((fx) => ({ id: fx.id, 문장: fx.입력, 급수: null, 맥락: 맥락표[fx.id] })),
        }),
        /* 서버 최악(묶음 전체가 왕복제한까지)보다 **길게** 기다린다 — 짧으면 서버가 답을
         * 만들고 있는데 클라이언트가 먼저 끊어 그 묶음의 벤더 비용이 통째로 증발한다. */
        signal: AbortSignal.timeout(왕복제한밀리 * 묶음크기 + 30_000),
      });
      if (!r.ok) throw new Error(`평가 통로 HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
      const 본 = await r.json();
      /* 🔑 이중 자물쇠 — 배포된 동봉의 판이 로컬 파일 판과 다르면 이 실행 전체가 무효다. */
      if (본.prompt_ver !== 판) {
        throw new Error(`판 불일치 — 원격 동봉 ${본.prompt_ver} ≠ 로컬 ${판}. 재배포부터.`);
      }
      return 본;
    };
  } else {
    const env = { ...자격증명.파일읽기(), ...process.env };
    로컬키 = env.ANTHROPIC_API_KEY || '';
    if (!로컬키) die('.env 에 ANTHROPIC_API_KEY 가 없다 — 리허설 통로를 쓰려면 --원격.');
  }

  const 결과맵 = new Map(끝난것);            // id → 항목 (성공 스킵분 포함, 이번 실행분이 덮는다)
  const 성적들 = [];
  let 출력토큰 = 0, 새로돌림 = 0, 사유수 = 0;

  const 저장 = (완주) => {
    const 항목배열 = 항목들.map((fx) => 결과맵.get(fx.id)).filter(Boolean);
    const 몸 = {
      프롬프트: `${프롬프트경로} (${판})`,
      prompt_ver: 판,
      돌린날: new Date().toISOString().slice(0, 10),
      실행자: `tools/eval-run.js ${원격 ? '--원격(리허설 correct?평가=1)' : '--로컬'} (${모델})`,
      완주,
      새로돌림,
      건너뜀: 끝난것.size,
      사용량합: { ...성적합(성적들), 출력: 출력토큰 },
      맥락시험: 맥락경로 ? `${맥락경로} (${Object.keys(맥락표).length}건)` : null,
      항목: 항목배열,
    };
    fs.mkdirSync(path.dirname(출력전체), { recursive: true });
    fs.writeFileSync(출력전체, JSON.stringify(몸, null, 2) + '\n', 'utf8');
  };

  const 돌릴것 = 항목들.filter((fx) => !끝난것.has(fx.id));
  console.log(`[eval실행] ${프롬프트경로} (${판}) · 항목 ${항목들.length} · 성공 ${끝난것.size}건 있음 → 건너뜀 · 돌릴 것 ${돌릴것.length}`);

  if (원격) {
    for (let i = 0; i < 돌릴것.length; i += 묶음크기) {
      const 조각 = 돌릴것.slice(i, i + 묶음크기);
      const 본 = await 원격머리(조각);
      for (const 줄 of 본.결과 || []) {
        새로돌림++;
        if (줄.사유) {
          결과맵.set(줄.id, { id: 줄.id, 사유: 줄.사유 });
          사유수++;
          console.log(`  ✗ ${줄.id} ${줄.사유}`);
          continue;
        }
        if (줄.usage) { 성적들.push(캐시성적(줄.usage)); 출력토큰 += Number(줄.usage.output_tokens || 0); }
        const 항목 = 항목만들기(줄.id, 줄.글);
        if (줄.model && 줄.model !== 모델) 항목.모델실측 = 줄.model;   // 요청과 다른 모델이 태워졌다면 드러낸다
        if (항목.검증사유) 사유수++;
        결과맵.set(줄.id, 항목);
      }
      저장(false);
      console.log(`  … ${Math.min(i + 묶음크기, 돌릴것.length)}/${돌릴것.length}`);
    }
  } else {
    for (const [i, fx] of 돌릴것.entries()) {
      const r = await 로컬한건(로컬키, 지시문, fx, 맥락표[fx.id]);
      새로돌림++;
      if (r.사유) {
        결과맵.set(fx.id, { id: fx.id, 사유: r.사유 });
        사유수++;
        console.log(`  ✗ ${fx.id} ${r.사유}`);
      } else {
        if (r.사용량) { 성적들.push(캐시성적(r.사용량)); 출력토큰 += Number(r.사용량.output_tokens || 0); }
        const 항목 = 항목만들기(fx.id, r.글);
        if (항목.검증사유) 사유수++;
        결과맵.set(fx.id, 항목);
      }
      if ((i + 1) % 10 === 0) { 저장(false); console.log(`  … ${i + 1}/${돌릴것.length}`); }
    }
  }

  저장(true);
  const 합 = 성적합(성적들);
  console.log(`[eval실행] 종결 — 새로 돌림 ${새로돌림} · 건너뜀 ${끝난것.size} · 사유 ${사유수}`);
  console.log(`  사용량: 입력 ${합.입력} · 캐시생성 ${합.캐시생성} · 캐시읽음 ${합.캐시읽음} · 출력 ${출력토큰}`);
  console.log(`  채점: node tools/eval-score.js ${출력경로}`);
}

main().catch((e) => die(String((e && e.stack) || e)));
