#!/usr/bin/env node
/* 문항 검수 통로 — 팩 100문항을 한 장씩 확정하는 로컬 화면 + 장부 저장 (발전 트랙 ① · 유호 확정 08-14)
 *
 * ■ 왜 로컬 서버인가
 *   브라우저 단독 HTML 은 파일에 못 쓴다 — 그러면 「JSON 을 내려받아 사람이 폴더로 옮긴다」가
 *   되고, 그건 사람 손을 늘리는 해법(철학 ㉡)이다. 서버가 저장까지 져서 사람이 누르는 칸을
 *   **확정 하나**로 남긴다.
 *
 * ■ 쓰는 법
 *   node tools/문항검수.js            # http://localhost:8438 이 열린다(브라우저는 손으로)
 *   node tools/문항검수.js --현황     # 화면 없이 지금 몇 건 섰는지만 (분모와 함께)
 *
 * ■ 저장
 *   `contents/토픽퀴즈검수장부.json` — 확정할 때마다 즉시 쓴다(임시 파일 → rename 이라
 *   중간에 죽어도 반쪽 JSON 이 남지 않는다). 판정은 전부 `lib/토픽퀴즈검수.js` 몫이고
 *   이 파일은 읽기·쓰기·서빙만 한다(판정을 여기 두면 회귀가 못 닿는다).
 *
 * ■ 경계
 *   · 로컬 전용 — 127.0.0.1 에만 바인딩한다(방송·외부 노출 아님).
 *   · 학생 데이터를 안 읽는다. 장부에 남는 사람 표기는 검수자 이름 한 칸뿐이다.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const 팩 = require('../contents/토픽퀴즈문항.js');
const 검수 = require('../lib/토픽퀴즈검수.js');

const ROOT = path.dirname(__dirname);
const 장부경로 = path.join(ROOT, 'contents', '토픽퀴즈검수장부.json');
const 화면경로 = path.join(__dirname, '문항검수화면.html');
const 포트 = 8438;

function 장부읽기() {
  try {
    const 원문 = fs.readFileSync(장부경로, 'utf8');
    const 값 = JSON.parse(원문);
    return 값 && typeof 값 === 'object' && !Array.isArray(값) ? 값 : {};
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    /* 깨진 장부를 «빈 장부»로 접으면 확정 100건이 조용히 사라진다 — 죽는 쪽이 맞다. */
    throw new Error(`장부를 읽을 수 없다(${장부경로}): ${e.message}`);
  }
}

function 장부쓰기(장부) {
  const 임시 = 장부경로 + '.tmp';
  fs.writeFileSync(임시, JSON.stringify(장부, null, 2) + '\n', 'utf8');
  fs.renameSync(임시, 장부경로); // 반쪽 JSON 이 남지 않게
}

function 현황(장부) {
  const r = 검수.검수판정({ 문항들: 팩.문항들, 장부 });
  return r;
}

function 재료() {
  const 장부 = 장부읽기();
  const r = 현황(장부);
  const 스킬이름 = new Map(팩.스킬표.map((s) => [s.skill_id, s.label_ko]));
  return {
    검수판: 검수.검수판,
    문항판: 팩.문항판,
    범주표: 검수.범주표,
    분모: r.분모,
    문항들: 팩.문항들.map((q) => ({
      문항id: q.문항id,
      지시문: q.지시문,
      질문: q.질문,
      보기: q.보기,
      정답: q.정답,
      스킬: q.skill_ids.map((id) => 스킬이름.get(id) || id),
      초안: 검수.범주초안(q.skill_ids),
      칸: 장부[q.문항id] || null,
      사유: 검수.칸사유(장부[q.문항id], q),
    })),
  };
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

function 판정처리(몸) {
  const 문항 = 팩.찾기(몸 && 몸.문항id);
  if (!문항) throw new Error(`모르는 문항: ${몸 && 몸.문항id}`);
  const 지금 = new Date().toISOString();
  const 장부 = 장부읽기();
  const 새장부 = 몸.판정 === '확정'
    ? 검수.확정얹기({ 장부, 문항, 범주: 몸.범주, 근거_ko: 몸.근거 || '', 검수자: 몸.검수자 || '', 지금 })
    : 검수.반려얹기({ 장부, 문항, 사유: 몸.사유 || '', 검수자: 몸.검수자 || '', 지금 });
  장부쓰기(새장부);
  const r = 현황(새장부);
  return { ok: true, 문항id: 문항.문항id, 칸: 새장부[문항.문항id], 분모: r.분모 };
}

function 보내기(res, 코드, 값) {
  const 몸 = JSON.stringify(값);
  res.writeHead(코드, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(몸);
}

if (process.argv.includes('--현황')) {
  const r = 현황(장부읽기());
  const 사유 = Object.entries(r.분모.사유별).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음';
  console.log(`검수 현황 — 팩 ${r.분모.팩} = 송출가능 ${r.분모.송출가능} + 막힘 ${r.분모.팩 - r.분모.송출가능}`);
  console.log(`  막힌 사유: ${사유}`);
  console.log(`  장부: ${장부경로}`);
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
    /* 경로만 ASCII 다 — 브라우저가 URL 을 퍼센트 인코딩해 보내서 한글 경로는 문자열 비교가
     * 조용히 어긋난다(실측 08-14: 화면이 「없는 경로」를 받았다). 파일·식별자는 한글 그대로. */
    if (req.method === 'GET' && url.pathname === '/api/data') return 보내기(res, 200, 재료());
    if (req.method === 'POST' && url.pathname === '/api/verdict') {
      const 몸 = await 본문읽기(req);
      return 보내기(res, 200, 판정처리(몸));
    }
    보내기(res, 404, { ok: false, 오류: '없는 경로' });
  } catch (e) {
    보내기(res, 400, { ok: false, 오류: String(e.message || e) });
  }
});

서버.listen(포트, '127.0.0.1', () => {
  const r = 현황(장부읽기());
  console.log(`문항 검수 — http://localhost:${포트}`);
  console.log(`  팩 ${r.분모.팩} = 송출가능 ${r.분모.송출가능} + 막힘 ${r.분모.팩 - r.분모.송출가능}`);
  console.log('  브라우저에서 열어 한 장씩 확정한다(Enter=확정 · 1~4=범주 · R=반려). Ctrl+C 로 끝낸다.');
});

module.exports = { 재료, 판정처리, 장부경로 };
