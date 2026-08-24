#!/usr/bin/env node
/* 과제 채점 화면 통로 — §8-B 생성 결과 80행을 클릭으로 매기는 로컬 화면 + 결과 파일 저장 (2026-08-25)
 *
 * ■ 왜 있나 — 채점 CLI(tools/과제생성평가.js --채점)는 행마다 여덟 자리를 «타이핑»한다.
 *   유호님이 v3 에서 79건을 그 통로로 완주했고(08-23), v4 80행이 미채점으로 남았다.
 *   비개발자 원장에게 CLI 80행은 「천천히」가 아니라 「사실상 안 하게 되는」 무게다 —
 *   화면은 같은 규칙(lib/과제채점.js)을 클릭 여덟 + 저장 하나로 바꾼다. 껍데기만 다르고
 *   파일 포맷·계약은 CLI 와 같아서 완주 후 판정은 그대로 `--판정` 이 읽는다.
 *
 * ■ 왜 로컬 서버인가 (tools/문항검수.js 선례 · 유호 확정 08-14 구도 그대로)
 *   브라우저 단독 HTML 은 파일에 못 쓴다 — 「JSON 내려받아 사람이 옮긴다」는 사람 손을
 *   늘리는 해법(철학 ㉡)이다. 서버가 저장까지 져서 사람이 누르는 칸을 최소로 남긴다.
 *
 * ■ 쓰는 법
 *   node tools/과제채점.js              # http://localhost:8439 (브라우저는 손으로 · 바탕화면 bat 은 자동)
 *   node tools/과제채점.js --현황       # 화면 없이 진행 분모만(전체 = 매김 + 미채점 + 0점 고정)
 *   node tools/과제채점.js --파일 <경로> # 결과 파일 과녁 교체(기본 = evals/과제생성_결과.json — 검증·리허설용)
 *
 * ■ 저장 — 저장 버튼마다 즉시 쓴다(임시 파일 → rename · 반쪽 JSON 이 안 남는다). 포맷은
 *   CLI 와 같은 눈금(JSON.stringify(…, null, 1) + '\n') — diff 가 행 단위로 읽힌다.
 *
 * ■ 경계
 *   · 로컬 전용 — 127.0.0.1 에만 바인딩한다(방송·외부 노출 아님).
 *   · 학생 데이터를 안 읽는다 — 시험지는 «가상» 스냅샷 풀(§8-B E4)이고, 남는 사람 표기는
 *     채점자 이름 한 칸뿐이다.
 *   · 판정(축키·⑦ null·0점→이유·쌍둥이 이음)은 전부 lib 몫 — 여기는 읽기·쓰기·서빙만.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const 평가 = require('../lib/과제생성평가.js');
const 채점 = require('../lib/과제채점.js');
const { 경로, 활성인가 } = require('../lib/과제생성현행판.js');
const { 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)

/* 🎯 조준 축은 **없다** — 127.0.0.1 에만 붙는 로컬 서버고 원격·운영 어디에도 안 닿는다. */
const 아는플래그 = ['--현황', '--파일', '--열기'];

const ROOT = path.dirname(__dirname);
const 화면경로 = path.join(__dirname, '과제채점화면.html');
const 포트 = 8439;   // 문항검수 8438 옆자리

const args = process.argv.slice(2);
/* 게이트가 «서버 앞»이다 — 뒤에 두면 오타 하나에 포트가 열리고, 현황을 물어본 사람은
 * 답 대신 떠 있는 서버를 본다(문항검수와 같은 자리). */
const 플래그오류 = 인자게이트('과제채점', args, 아는플래그);
if (플래그오류) { console.error(`[과제채점] ${플래그오류}`); process.exit(1); }

const 값 = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const 결과경로 = 값('--파일') ? path.resolve(값('--파일')) : 경로.결과;

if (!활성인가()) {
  console.log('[과제채점] prompts/과제생성.md 가 없다 — 생성 경로가 원리상 안 돈다(§8-B 「활성」 아님).');
  process.exit(0);
}
if (!fs.existsSync(결과경로)) {
  console.error(`[과제채점] 결과 파일이 없다: ${path.relative(ROOT, 결과경로)} — 실행(--원격)이 먼저다(tools/과제생성평가.js).`);
  process.exit(1);
}

const 읽기 = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
/* CLI(과제생성평가.js 쓰기)와 같은 눈금 — 들여쓰기 1 · 꼬리 개행. 다르면 채점 한 번에 80행 diff 가 난다. */
function 원자쓰기(p, o) {
  const 임시 = p + '.tmp';
  fs.writeFileSync(임시, JSON.stringify(o, null, 1) + '\n', 'utf8');
  fs.renameSync(임시, p);
}

const 전문 = fs.readFileSync(경로.프롬프트, 'utf8');
const 시험지 = 읽기(경로.시험지);
const 사례맵 = new Map(시험지.사례.map((c) => [c.case_base_id, c]));
/* 축 한국어 이름 — 화면 전용(기계 이름의 정본은 lib 의 축키들 · CLI 와 같은 여덟). */
const 축이름 = ['①연결성', '②답변가능', '③수준적합', '④신선함', '⑤재미', '⑥정확성', '⑦목표활용', '⑧상태활용'];

function 재료() {
  const 결과 = 읽기(결과경로);
  const 진행 = 채점.진행(결과);
  /* 학생 상태 블록은 사례(base) 단위 — 두 회차가 같은 본문을 받았다(input_hash 동일). */
  const 상태들 = {};
  for (const c of 시험지.사례) 상태들[c.case_base_id] = 채점.상태블록(전문, c);
  const 행들 = (결과.행 || []).map((r) => {
    const base = String(r.case_id).split('#')[0];
    const c = 사례맵.get(base);
    return {
      case_id: r.case_id,
      칸: c ? c.칸 : '(시험지에 없는 사례)',
      goal: c ? c.goal : null,
      기술들: c ? c.기술들 || [] : [],
      목표없음: !c || c.goal == null,
      sentence: r.sentence, question: r.question,
      grader_note: r.grader_note,
      axis_scores: r.axis_scores,
      미채점: 채점.미채점인가(r), 고정: 채점.고정인가(r),
    };
  });
  const 몸 = {
    파일: path.relative(ROOT, 결과경로),
    동봉: { 채점자: 결과.동봉 && 결과.동봉.채점자, 시각: 결과.동봉 && 결과.동봉.시각, model: 결과.동봉 && 결과.동봉.model },
    진행, 축이름, 축키들: 평가.축키들, null허용축: 평가.null허용축, 통과선: 평가.통과선,
    앵커: 평가.앵커, 상태들, 행들,
  };
  /* 완주한 날만 집계를 싣는다 — 도중 집계는 「깨졌다」와 「아직 안 쟀다」가 같은 얼굴이 된다
   * (미채점 = 0 으로 접혀 전 축이 빨갛게 보인다 · 결과한벌이 미채점을 앞세우는 그 이유). */
  if (진행.전체 && !진행.미채점) {
    몸.집계 = 평가.집계(결과, 시험지);
    몸.계약사유 = 평가.결과검증(결과, 시험지, 전문).slice(0, 5);
  }
  return 몸;
}

function 본문읽기(req) {
  return new Promise((끝, 실패) => {
    let 쌓임 = '';
    req.on('data', (c) => {
      쌓임 += c;
      if (쌓임.length > 64 * 1024) { 실패(new Error('본문이 너무 크다')); req.destroy(); }
    });
    req.on('end', () => { try { 끝(JSON.parse(쌓임 || '{}')); } catch (e) { 실패(e); } });
    req.on('error', 실패);
  });
}

function 매김처리(몸) {
  const 결과 = 읽기(결과경로);   // 요청마다 다시 읽는다 — CLI·딴 세션과 같은 파일을 나눠 쓴다
  const r = 채점.매김적용({
    결과, 시험지,
    case_id: 몸 && 몸.case_id,
    점수들: 몸 && 몸.점수들,
    note: 몸 && 몸.note,
    채점자: 몸 && 몸.채점자,
    지금: new Date().toISOString(),
  });
  if (!r.ok) return { ok: false, 오류: r.오류 };
  원자쓰기(결과경로, 결과);
  return { ok: true, 적용: r.적용, 진행: 채점.진행(결과) };
}

function 보내기(res, 코드, 값들) {
  res.writeHead(코드, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(값들));
}

const 현황줄 = (p) => `전체 ${p.전체} = 매김 ${p.매김} + 미채점 ${p.미채점} + 0점 고정 ${p.고정}`;

if (args.includes('--현황')) {
  const p = 채점.진행(읽기(결과경로));
  console.log(`채점 현황 — ${현황줄(p)}`);
  console.log(`  파일: ${path.relative(ROOT, 결과경로)}`);
  if (!p.미채점 && p.전체) console.log('  완주 — 판정은: node tools/과제생성평가.js --판정 ' + path.relative(ROOT, 결과경로).replace(/\\/g, '/'));
  process.exit(0);
}

const 서버 = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = fs.readFileSync(화면경로);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }
    /* 경로만 ASCII — 한글 경로는 퍼센트 인코딩으로 문자열 비교가 어긋난다(문항검수 실측 08-14). */
    if (req.method === 'GET' && url.pathname === '/api/data') return 보내기(res, 200, 재료());
    if (req.method === 'POST' && url.pathname === '/api/score') {
      const 몸 = await 본문읽기(req);
      const 답 = 매김처리(몸);
      return 보내기(res, 답.ok ? 200 : 400, 답);
    }
    보내기(res, 404, { ok: false, 오류: '없는 경로' });
  } catch (e) {
    보내기(res, 400, { ok: false, 오류: String(e.message || e) });
  }
});

서버.listen(포트, '127.0.0.1', () => {
  const p = 채점.진행(읽기(결과경로));
  console.log(`과제 채점 — http://localhost:${포트}`);
  console.log(`  ${현황줄(p)} · 파일 ${path.relative(ROOT, 결과경로)}`);
  console.log('  브라우저에서 열어 한 장씩 매긴다(1~8 축 뒤집기 · Enter 저장 · S 나중에). Ctrl+C 로 끝낸다.');
  /* 바탕화면 바로가기의 문 — .bat 은 코드페이지(CP949/65001)에 따라 한글 경로 파싱이 깨져서
   * 은퇴했다(08-25 실측 · 두 콘솔 모두). 브라우저 열기는 노드가 직접 진다(인코딩 무관). */
  if (args.includes('--열기') && process.platform === 'win32') {
    require('node:child_process').exec(`start "" http://localhost:${포트}`, () => {});
  }
});

module.exports = { 재료, 매김처리, 결과경로 };
