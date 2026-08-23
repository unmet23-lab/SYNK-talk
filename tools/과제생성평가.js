#!/usr/bin/env node
'use strict';
/**
 * 과제생성 평가 실행기·채점·판정 — §8-B 의 «실행층»(I2) 세 갈래를 한 도구에 둔다.
 *
 *   node tools/과제생성평가.js --드라이런                 # 벤더 0 — 렌더·input_hash·결과 «초안» 뼈대(evals/과제생성_결과_초안.json)
 *   node tools/과제생성평가.js --원격                     # ⛔ 지금은 거절 — 벤더 통로는 #6 착수 때 한 벌(아래)
 *   node tools/과제생성평가.js --채점 evals/과제생성_결과.json --채점자 유호   # 사람 채점(CLI · 사례마다 8축 + note)
 *   node tools/과제생성평가.js --판정 evals/과제생성_결과.json    # 기계 계약 검증 → 사례 단위 AND 집계 → 통과/미통과(exit 0/1)
 *
 * ■ 왜 «원격» 이 지금 거절인가 — 오프라인 평가는 운영 큐(generation_jobs·attempts)를 «안 지난다»(§8-B E5 —
 *   지나면 운영 장부가 평가로 오염된다). 그래서 워커(deliver-one)의 claim 경로를 못 쓰고, 교정 eval 의
 *   `correct?평가=1` 선례처럼 **DB 무접촉 평가 갈래**가 deliver-one 에 서야 한다. 그 갈래는 벤더 키·모델
 *   (GENERATION_MODEL — 유호님 몫)과 한 벌이라 #6(크레딧·모델 픽·사람 채점 80회) 착수 때 함께 짓는다.
 *   로컬엔 벤더 키가 없다(eval-run 머리말 실측) — 키를 끌어오지 않는다.
 * ■ 드라이런의 초안 파일은 «정본 이름이 아니다» — 결과 정본 evals/과제생성_결과.json 은 벤더 실물 +
 *   사람 채점이 끝난 파일뿐이다. 초안은 공갈 응답 + 축 전부 0 + note '미채점' 이라 어떤 집계로도 통과가 안 된다.
 * ■ 산술·계약은 전부 lib/과제생성평가.js(순수) — 여기는 파일 I/O·대화·종료코드만 진다.
 */
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)
const 평가 = require('../lib/과제생성평가.js');
const { 경로, 파일해시, 활성인가, 현행판 } = require('../lib/과제생성현행판.js');

const { 검문 } = require('../lib/과제검문.js');
const { 생성응답읽기 } = require('../lib/과제생성.js');
const { 워커예산_MS, 생성타임아웃_MS } = require('../lib/생성상수.js');

const ROOT = path.resolve(__dirname, '..');
/* 배포판 게이트 스코프 — 이 도구가 부르는 Edge Fn 은 deliver-one 하나(tests/왕복골격.test.js 가 「소스가 부르는
 * 함수 ⊆ 선언」을 잰다). 평가 갈래는 운영 큐 무접촉이라 다른 함수를 안 부른다. */
const 게이트함수들 = ['deliver-one'];
/* 묶음 = 워커 자기 예산 ÷ 학생당 타임아웃 — 서버(평가 갈래)와 같은 두 상수에서 파생(손 숫자 0 · 서버 상한과 같다). */
const 묶음크기 = Math.max(1, Math.floor(워커예산_MS / 생성타임아웃_MS));
/* 🎯 조준축 — `--원격` 이 왕복골격.열기를 지나 자격증명.읽기()로 조준한다(한 겹 건너 · eval-run 선례). 그래서
 * `공용플래그`(--운영)를 편다 — 받으면 왕복골격의 리허설 강제가 거절한다(받고 아무것도 안 바꾸는 F592 가 아니다). */
const 아는플래그 = [...공용플래그, '--드라이런', '--원격', '--채점', '--판정', '--채점자', '--출력'];
const argv = process.argv.slice(2);
const 막힘 = 인자게이트('과제생성평가', argv, 아는플래그);
if (막힘) { console.error(막힘); process.exit(2); }
const 값 = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const 읽기 = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const 쓰기 = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 1) + '\n');

if (!활성인가()) {
  console.log('[과제생성평가] prompts/과제생성.md 가 없다 — 생성 경로가 원리상 안 돈다(§8-B 「활성」 아님 · 적용 안 함).');
  process.exit(0);
}
const 전문 = fs.readFileSync(경로.프롬프트, 'utf8');

/* ── 드라이런 ─────────────────────────────────────────────────────────────── */
if (argv.includes('--드라이런')) {
  const 시험지 = 읽기(경로.시험지);
  const 현 = 현행판();
  const 행 = [];
  for (const c of 시험지.사례) {
    const { 본문 } = 평가.사례본문(전문, c);
    const ih = 평가.input_hash(본문);
    for (const 회차 of [1, 2]) {
      /* 공갈 응답 — 벤더 0. 파서가 읽히는 모양이라 결속 ②가 «같은 파서»로 sentence·question 을 재산출한다. */
      const raw = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ sentence: '(드라이런 문장)', question: '(드라이런 질문)?' }) }], usage: { output_tokens: 0 } });
      행.push({
        case_id: 평가.case_id(c.case_base_id, 회차),
        axis_scores: Object.fromEntries(평가.축키들.map((k) => [k, (k === 평가.null허용축 && c.goal == null) ? null : 0])),
        grader_note: '미채점(드라이런 — 벤더 0 · 공갈 응답 · 축 전부 0)',
        sentence: '(드라이런 문장)', question: '(드라이런 질문)?',
        raw_response: raw, raw_response_hash: 평가.응답해시(raw), input_hash: ih,
      });
    }
  }
  const 출력 = 값('--출력') ? path.resolve(값('--출력')) : path.join(ROOT, 'evals', '과제생성_결과_초안.json');
  쓰기(출력, {
    판: '§8-B 결과 «초안»(드라이런) — 정본 아님: 벤더 0 · 채점 0. 정본 = evals/과제생성_결과.json(실물 응답 + 사람 채점)',
    /* model 은 GENERATION_MODEL(유호님 몫) — 미설정이면 빈 값이라 존재 검사에 걸린다. 초안은 정본이 아니므로
     * 표식으로 채워 «구조» 검증만 통과시킨다(비교축에선 현행 '' 과 달라 차단이 선다 — 그게 맞다). */
    동봉: { ...현, model: 현.model || '(드라이런 — GENERATION_MODEL 미설정)', policy_ver: '(드라이런 — 실행판조립은 DB 재료라 미산출)', 채점자: '(미채점)', 시각: new Date().toISOString() },
    행,
  });
  const 사유 = 평가.결과검증(읽기(출력), 시험지, 전문);
  console.log(`[과제생성평가] 드라이런 → ${path.relative(ROOT, 출력)} · 행 ${행.length} · 기계 계약 ${사유.length ? '❌ ' + 사유.slice(0, 5).join(' / ') : '✅ 유효(뼈대)'} · 집계 통과 ${평가.집계(읽기(출력), 시험지).통과 ? '⚠ 초안이 통과로 읽힌다(결함)' : '✅ 미통과(의도 — 축 전부 0)'}`);
  console.log(`  현행 비교축: model=${현.model || '(GENERATION_MODEL 미설정)'} · prompt_ver=${현.prompt_ver} · quality_ver=${현.quality_ver} · 시험지_해시=${String(현.시험지_해시).slice(0, 12)}…`);
  process.exit(사유.length ? 1 : 0);
}

/* ── 원격 — 리허설 deliver-one?평가=1 (벤더는 거기서 · 로컬 키 0 · 운영 큐 무접촉) ──────────────
 * 🔴 유료 제출이다 — 게이트(왕복골격.열기: 리허설 강제 · 배포판=소스 · 키)가 맨 앞이다. 재개 가능: 출력 파일에 이미
 * «성공» 행(raw 가 있고 파서가 읽히는 행)이 있으면 건너뛴다. 사례 × 2회차 = 80 호출을 묶음으로 자른다.
 * 결과 행은 «채점 전» 상태로 쓴다(axis_scores 전부 0 · grader_note '미채점') — 채점 CLI 가 채운다. 호출 실패·
 * 응답파손·검문탈락은 §8-B 「호출 실패·누락 출력 0점(재시도 없음)」 규율대로 0점 «고정»이고 note 에 사유가 남는다
 * (그 문장은 런타임이면 학생에게 안 나갔을 문장이라 채점 대상이 아니다 · v5.13-e). */
if (argv.includes('--원격')) {
  (async () => {
    const 골격 = require('../lib/왕복골격.js');
    const { ref, service_role } = await 골격.열기('과제생성평가', {
      키: true, 사유: '이 시험은 벤더 비용을 쓴다(운영 큐엔 행을 안 남긴다)', 함수목록: 게이트함수들,
    });
    const 시험지 = 읽기(경로.시험지);
    const 현 = 현행판();
    const 출력 = 값('--출력') ? path.resolve(값('--출력')) : 경로.결과;
    let 기존 = { 동봉: {}, 행: [] };
    if (fs.existsSync(출력)) {
      기존 = 읽기(출력);
      /* 다른 시험지·다른 프롬프트 판의 결과에 이어 붙이면 한 파일에 두 판이 섞인다 — 재개 거부. */
      if (기존.동봉 && (기존.동봉.시험지_해시 !== 현.시험지_해시 || 기존.동봉.prompt_ver !== 현.prompt_ver)) {
        console.error(`[과제생성평가] 재개 거부 — 기존 파일의 시험지_해시·prompt_ver 가 현행과 다르다. 파일을 갈라라(--출력).`);
        process.exit(1);
      }
    }
    const 행맵 = new Map((기존.행 || []).map((r) => [r.case_id, r]));
    const 읽힌다 = (raw) => { try { return !!생성응답읽기(JSON.parse(raw)).값; } catch { return false; } };
    const 성공행 = (r) => !!(r && typeof r.raw_response === 'string' && r.raw_response.length && 읽힌다(r.raw_response));

    /* 일감 = 사례 × 회차 중 성공 행이 아닌 것(재개 — 제품의 「다음 회차가 다시 집는다」와 같은 방향). */
    const 일감 = [];
    for (const c of 시험지.사례) {
      const { 본문 } = 평가.사례본문(전문, c);
      for (const 회차 of [1, 2]) {
        const id = 평가.case_id(c.case_base_id, 회차);
        if (!성공행(행맵.get(id))) 일감.push({ id, c, 본문 });
      }
    }
    const 전체 = 시험지.사례.length * 2;
    console.log(`[과제생성평가] 원격 — ${시험지.사례.length}사례 × 2회차 = ${전체} · 건너뜀 ${전체 - 일감.length} · 돌릴 것 ${일감.length} · 묶음 ${묶음크기}`);
    const 주소 = `https://${ref}.supabase.co/functions/v1/deliver-one?%ED%8F%89%EA%B0%80=1`;
    let 서버실행판 = null;
    /* 행이 하나도 없으면 안 쓴다 — 첫 묶음이 503(모델 미설정 등)으로 죽은 날 «빈 정본»이 정본 경로에 남아
     * 차단기가 「존재하는데 80건 누락」 빨강을 내는 것을 막는다(빈 파일은 미실행이지 결과가 아니다). */
    const 저장 = () => 행맵.size && 쓰기(출력, {
      판: '§8-B 결과 — 실물 응답. 채점은 --채점 이 채운다(미채점 행은 집계 0 → 차단기 빨강: 실행과 채점은 한 벌이다)',
      동봉: {
        ...현,
        ...(서버실행판 ? {
          model: 서버실행판.model, prompt_ver: 서버실행판.prompt_ver, policy_ver: 서버실행판.policy_ver,
          estimator_version: 서버실행판.estimator_version, skill_taxonomy_ver: 서버실행판.skill_taxonomy_ver,
        } : { policy_ver: 기존.동봉?.policy_ver ?? '(미수신)' }),
        채점자: 기존.동봉?.채점자 || '(미채점)', 시각: new Date().toISOString(),
      },
      행: 시험지.사례.flatMap((c) => [1, 2].map((r) => 행맵.get(평가.case_id(c.case_base_id, r))).filter(Boolean)),
    });
    const 축0 = (c) => Object.fromEntries(평가.축키들.map((k) => [k, (k === 평가.null허용축 && c.goal == null) ? null : 0]));
    const 행 = (x, raw, note, 값) => ({
      case_id: x.id, axis_scores: 축0(x.c), grader_note: note,
      sentence: 값 ? 값.sentence : '', question: 값 ? 값.question : '',
      raw_response: raw, raw_response_hash: 평가.응답해시(raw), input_hash: 평가.input_hash(x.본문),
    });
    for (let i = 0; i < 일감.length; i += 묶음크기) {
      const 조각 = 일감.slice(i, i + 묶음크기);
      const r = await fetch(주소, {
        method: 'POST',
        headers: { apikey: service_role, Authorization: `Bearer ${service_role}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 사례: 조각.map((x) => ({ case_id: x.id, 본문: x.본문 })) }),
        /* 서버 최악(묶음 전체가 타임아웃까지)보다 길게 — 짧으면 서버가 답을 만드는데 먼저 끊어 벤더 비용이 증발한다. */
        signal: AbortSignal.timeout(생성타임아웃_MS * 묶음크기 + 30_000),
      });
      if (!r.ok) { console.error(`[과제생성평가] 평가 통로 HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`); 저장(); process.exit(1); }
      const 본 = await r.json();
      if (!서버실행판) {
        서버실행판 = 본.실행판 || null;
        /* 이중 자물쇠 — 배포된 동봉의 판이 로컬 파일 판과 다르면 이 실행 전체가 무효다. */
        if (!서버실행판 || 서버실행판.prompt_ver !== 현.prompt_ver) {
          console.error(`[과제생성평가] 판 불일치 — 원격 ${서버실행판 && 서버실행판.prompt_ver} ≠ 로컬 ${현.prompt_ver}. 재배포부터(원격배포.js deliver-one --적용).`);
          process.exit(1);
        }
      }
      for (const 줄 of 본.결과 || []) {
        const x = 조각.find((y) => y.id === 줄.case_id);
        if (!x) continue;
        if (줄.사유) {
          행맵.set(x.id, 행(x, '', `0점 고정 — ${줄.사유}${줄.벤더사유 ? ' · ' + 줄.벤더사유 : ''}`, null));
          console.log(`  ✗ ${x.id} ${줄.사유}${줄.벤더사유 ? ' · ' + 줄.벤더사유 : ''}`);
          continue;
        }
        const raw = String(줄.raw ?? '');
        let 봉투 = null; try { 봉투 = JSON.parse(raw); } catch { /* 파서가 응답파손으로 접는다 */ }
        const 읽 = 생성응답읽기(봉투);
        if (!읽.값) { 행맵.set(x.id, 행(x, raw, `0점 고정 — 응답파손: ${읽.사유}`, null)); console.log(`  ✗ ${x.id} 응답파손 ${읽.사유}`); continue; }
        const 검 = 검문({ 문장: 읽.값.sentence, 질문: 읽.값.question, 식별자들: [], 최근문장들: [], 최근질문들: [] });
        행맵.set(x.id, 행(x, raw, 검.ok ? '미채점' : `0점 고정 — 검문탈락: ${검.사유들.join(',')}`, 읽.값));
        console.log(`  ${검.ok ? '·' : '✗'} ${x.id} ${검.ok ? '응답 받음' : '검문탈락 ' + 검.사유들.join(',')}`);
      }
      저장();
      console.log(`  … ${Math.min(i + 묶음크기, 일감.length)}/${일감.length}`);
    }
    const 사유 = 평가.결과검증(읽기(출력), 시험지, 전문);
    console.log(`[과제생성평가] 저장 → ${path.relative(ROOT, 출력)} · 기계 계약 ${사유.length ? '❌ ' + 사유.slice(0, 3).join(' / ') : '✅'} · 다음 = --채점 ${path.relative(ROOT, 출력)} --채점자 <이름>`);
  })().catch((e) => { console.error('[과제생성평가] 원격 실패:', e && e.message ? e.message : e); process.exit(1); });
}

/* ── 채점(CLI · 사람) ─────────────────────────────────────────────────────── */
if (값('--채점')) {
  const 파일 = path.resolve(값('--채점'));
  const 채점자 = 값('--채점자');
  if (!채점자) { console.error('--채점자 <이름> 이 필요하다(존재축 — 비면 무효)'); process.exit(2); }
  const 결과 = 읽기(파일);
  const 시험지 = 읽기(경로.시험지);
  const 사례맵 = new Map(시험지.사례.map((c) => [c.case_base_id, c]));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const 물음 = (q) => new Promise((res) => rl.question(q, (a) => res(a.trim())));
  /* 축 한국어 이름 — 화면 전용(기계 이름의 정본은 lib 의 `축키들`이고 여기는 사람이 읽는 자리다). */
  const 축이름 = ['①연결성', '②답변가능', '③수준적합', '④신선함', '⑤재미', '⑥정확성', '⑦목표활용', '⑧상태활용'];
  /* 모델이 «실제로 본» 상태 블록 — ⑧상태활용은 이걸 안 보면 원리상 못 매긴다(요약에 실린 값이
   * 산출에 쓰였나를 재는 축이라, 요약을 못 보면 채점자는 무엇이 쓰였는지 모른다). 렌더된 요청
   * 본문에서 그 절만 잘라 보여준다 — 시험지 칸을 다시 조립하지 않는다(두 벌이 되면 갈라진다). */
  const 상태블록 = (c) => {
    try {
      const { 본문 } = 평가.사례본문(전문, c);
      const m = /\[학생 상태\]\r?\n([\s\S]*?)(?=\r?\n\[|$)/.exec(본문);
      return m ? m[1].trim() : null;
    } catch { return null; }
  };
  /* 채점 대상 = «미채점» 행뿐. 0점 고정(검문탈락·응답파손)은 채점할 문장이 아니고(§8-B 규율 —
   * 런타임이면 학생에게 안 나갔을 문장), 이미 매긴 행을 다시 묻으면 이어서 하기가 80번 엔터가 된다. */
  const 미채점인가 = (행) => 행.grader_note === '미채점';
  /* 「1 1 1 1 0 1 1 1」도 「11110111」도 받는다 — 80번 반복되는 입력이라 형식으로 튕기지 않는다. */
  const 여덟자리 = (s) => {
    const t = String(s).replace(/\s+/g, '');
    return /^[01]{8}$/.test(t) ? [...t].map(Number) : null;
  };
  (async () => {
    const 대상 = 결과.행.filter(미채점인가);
    const 고정 = 결과.행.filter((행) => String(행.grader_note).startsWith('0점 고정')).length;
    const 마침 = 결과.행.length - 대상.length - 고정;
    console.log(`■ 채점 — 전체 ${결과.행.length}행 = 매길 것 ${대상.length} + 이미 매김 ${마침} + 0점 고정 ${고정}(검문탈락·응답파손 — 채점 대상이 아니다)`);
    console.log(`  축 여덟을 0/1 로: ${축이름.join(' ')}   ← 넣는 순서가 이 순서다`);
    console.log(`  ⑤ 채점자 질문: ${평가.앵커.채점자질문}`);
    console.log(`     0점 조건 Z1~Z3 · 1점 앵커 A1~A3 · 중간이면 ${평가.앵커.중간사례기준}`);
    console.log('  빈 입력 = 그 행은 나중에 · q = 저장하고 종료(매긴 데까지 남는다)');
    let 셈 = 0;
    for (const 행 of 대상) {
      셈 += 1;
      const base = 행.case_id.replace(/#[12]$/, '');
      const c = 사례맵.get(base);
      const 목표없음 = !c || c.goal == null;
      console.log(`\n▸ [${셈}/${대상.length}] ${행.case_id} · ${c ? `${c.칸} · 목표=${c.goal ?? '(없음)'}` : '(시험지에 없는 사례)'}`);
      if (c) console.log(`  겨냥 문법: ${(c.기술들 || []).join(' / ')}`);
      const 상태 = c && 상태블록(c);
      console.log(상태 ? `  [모델이 본 학생 상태]\n${상태.split('\n').map((l) => '    ' + l).join('\n')}`
        : '  [모델이 본 학생 상태] (못 읽었다 — 본문 템플릿이 바뀌었을 수 있다 · ⑧은 이 사례에서 판단 보류)');
      /* 학생이 받는 순서 «그대로» 보여준다 — 앱 실물(src/말하기화면.js: 듣기 → 따라 → 답하기)의
       * 순서·안내 리터럴이다. 「문장:/질문:」만 덜렁 내면 채점자가 학생 맥락 없이 매기게 된다
       * (유호 실측 08-22 「이게 도대체 뭘 하라는거야」 — 원장이 못 읽는 화면은 도구 결함이다). */
      console.log('  ── 학생 앱에 나가는 모양(오늘의 말하기 · 세 걸음) ──');
      console.log('  01듣기·02따라 「오늘의 문장이에요 — 딱 세 걸음이에요: 듣고, 따라 말하고, 내 말로 답해요!」');
      console.log(`      ${행.sentence}`);
      console.log('  03답하기 「이번엔 내 말로 답해요 — 방금 따라 말한 문장처럼 하면 딱 좋아요!」');
      console.log(`      ${행.question}`);
      if (목표없음) console.log('  ⓘ 이 사례는 목표가 없다 — ⑦ 자리엔 아무 값이나 넣으면 «분모에서 뺌»으로 기록된다(0점이 아니다).');
      /* 🔴 «쌍둥이 회차» — 같은 사례의 다른 회차가 글자까지 같으면 두 번 매기는 것이 낭비다
       * (유호 실측 08-23: 40쌍 중 1쌍이 완전 동일 · 하필 첫 사례라 「1,2번이 똑같은 질문」).
       * 규격을 안 건드린다 — 행은 그대로 둘이고 «사람이 여는 횟수»만 준다(§8-B F3 이 센 그 수).
       * 자기 불일치 방지이기도 하다: 같은 문장에 다른 점수가 나오면 그게 채점자 흔들림이다. */
      const 짝 = 결과.행.find((x) => x !== 행 && x.case_id.split('#')[0] === base
        && x.sentence === 행.sentence && x.question === 행.question && x.grader_note !== '미채점'
        && !String(x.grader_note).startsWith('0점 고정'));
      if (짝) {
        console.log(`  ⓘ ${짝.case_id} 과 문장·질문이 «글자까지 같다» — 그 회차의 점수를 그대로 잇는다(다시 안 묻는다).`);
        행.axis_scores = { ...짝.axis_scores };
        행.grader_note = 짝.grader_note;
        결과.동봉 = { ...(결과.동봉 || {}), 채점자, 시각: new Date().toISOString() };
        쓰기(파일, 결과);
        continue;
      }
      const 입력 = await 물음(`  여덟 자리 > `);
      if (입력 === 'q') break;
      if (!입력) continue;
      const v = 여덟자리(입력);
      if (!v) { console.log('  ✗ 0 과 1 을 여덟 개 넣어야 한다(「1 1 1 1 0 1 1 1」 또는 「11110111」) — 이 행은 나중에'); continue; }
      const 매김 = Object.fromEntries(평가.축키들.map((k, i) => [k, (k === 평가.null허용축 && 목표없음) ? null : v[i]]));
      const 영점 = 평가.축키들.filter((k) => 매김[k] === 0).map((k) => 축이름[평가.축키들.indexOf(k)]);
      let note = await 물음(영점.length ? `  0점: ${영점.join(' ')} — 이유를 적는다(필수) > ` : '  메모(없으면 빈 줄) > ');
      if (영점.length && !note) {
        console.log('  ⚠ 0점이 있는데 이유가 비었다 — 안 적히면 결과 파일 전체가 무효가 된다(한 행만 버리는 처분은 없다).');
        note = await 물음('  이유 > ');
        if (!note) { console.log('  ↩ 이 사례는 «안 매긴 것»으로 되돌린다 — 나중에 다시 만난다.'); continue; }
      }
      행.axis_scores = 매김;
      행.grader_note = note;
      결과.동봉 = { ...(결과.동봉 || {}), 채점자, 시각: new Date().toISOString() };
      쓰기(파일, 결과);   // 중간 저장 — 80회는 하루에 안 끝난다(F3)
    }
    rl.close();
    const 사유 = 평가.결과검증(결과, 시험지, 전문);
    console.log(`\n저장됨 → ${path.relative(ROOT, 파일)} · 기계 계약 ${사유.length ? '❌ 남은 사유 ' + 사유.length + '건(예: ' + 사유[0] + ')' : '✅ 유효'}`);
  })();
}

/* ── 판정 ─────────────────────────────────────────────────────────────────── */
if (값('--판정')) {
  const 파일 = path.resolve(값('--판정'));
  const 결과 = 읽기(파일);
  const 시험지 = 읽기(경로.시험지);
  const 사유 = 평가.결과검증(결과, 시험지, 전문);
  if (사유.length) {
    console.log(`[과제생성평가] ❌ 결과 파일 무효(${사유.length}건 — 한 행만 버리지 않는다 · E2):`);
    for (const s of 사유.slice(0, 20)) console.log('   · ' + s);
    process.exit(1);
  }
  const 집 = 평가.집계(결과, 시험지);
  const 현 = 현행판();
  const 다름 = 평가.비교축차이(결과.동봉, 현);
  console.log(`[과제생성평가] 판정 — ${path.relative(ROOT, 파일)} · 채점자 ${결과.동봉.채점자} · ${결과.동봉.시각}`);
  for (const k of 평가.축키들) {
    const a = 집.축[k];
    console.log(`  ${a.통과 ? '✅' : '❌'} ${k.padEnd(11)} ${a.합}/${a.분모} = ${a.비율 == null ? '—' : a.비율.toFixed(2)}  (통과선 ${평가.통과선[k]})`);
  }
  console.log(`  ⑥ 셀(급수별 accuracy): ${평가.급수들.map((l) => `${l} ${집.셀.accuracy[l].합}/${집.셀.accuracy[l].분모}`).join(' · ')}${집.셀미달.length ? ' — ❌ 미달 ' + 집.셀미달.join(',') + '(V6-26 전체 미통과)' : ''}`);
  console.log(`  커버리지 ${시험지.커버리지.선조합}/${시험지.커버리지.전체} · 안 선 조합 ${시험지.커버리지.안선목록.length}`);
  console.log(`  비교축 7 ↔ 현행: ${다름.length ? '❌ 다른 칸 ' + 다름.join(',') + ' — 이 결과는 «옛 실행판»의 것이라 지금 초록의 근거가 아니다(V6-23)' : '✅ 같은 실행판'}`);
  console.log(`  ⇒ ${집.통과 && !다름.length ? '✅ §8-B 통과 — 첫 생성 행 «전» 필수 #6 의 결과 1벌이 섰다' : '❌ §8-B 미통과'}`);
  process.exit(집.통과 && !다름.length ? 0 : 1);
}

if (!argv.length) console.log('사용법: --드라이런 | --원격 | --채점 <파일> --채점자 <이름> | --판정 <파일>');
