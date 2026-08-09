#!/usr/bin/env node
'use strict';
/* 성과 계기판 — 「개입 → 효과」가 **실제로 이어졌는지**를 세어 한 장에 낸다.
 *
 * ■ 이 파일이 닫는 것 — ⑦ 의 «호출부 0»
 *   `lib/성과회수.js` 는 2026-08-09 에 섰고, `lib/이벤트검증.js` 의 엔진도달 장부가 그 파일을
 *   `intervention.delivered`·`content.viewed` 의 **소비자**로 지목하면서 래칫 둘이 내려갔다.
 *   그런데 그 파일을 **부르는 코드가 저장소에 0줄**이었다 — 장부는 초록인데 런타임 도달은 0.
 *   엔진도달_설계 §5 가 v1 에서 판정한 바로 그 병이다: *"뷰에 행이 보이는 것을 「엔진이 배웠다」로
 *   바꿔 불렀다 … 도달의 정의는 **읽힌 것**이지 보이는 것이 아니다."* 읽는 자리가 서기 전까지
 *   그 장부 줄은 **약속이지 사실이 아니었다.** 이 도구가 그 자리다.
 *
 * ■ 무엇을 내나 — 설계 §5 의 「개입→효과 연결률」(1급 계수 · 유호님 채택 2026-08-08)
 *   개입 한 건마다 `성과회수()` 를 돌려 ①즉시(관측 짝이 붙었나) ②1·7·30일 창을 계산하고,
 *   **개입 종류별·선택 규칙(`policy_ver`)별로 갈라** 센다. 규칙별로 가르는 것이 이 계수의 목적이다 —
 *   합쳐 놓으면 「무엇이 통했나」가 아니라 「평균적으로 그럭저럭」밖에 안 남는다.
 *
 * ■ 🔴 미도래는 **분모에서 뺀다** — 이 도구의 급소
 *   개입 이틀 뒤에 7일 창을 물으면 답은 0 이 아니라 「미도래」다(`lib/성과회수.js` 머리말).
 *   그 셋을 한 분모에 넣으면 개원 첫 달은 **구조적으로** 낮게 찍히고, 낮은 값을 본 사람은
 *   「개입이 효과 없다」고 읽는다. 그래서 연결률의 분모는 **잴 수 있었던 것**(측정+표본0)이고,
 *   미도래는 옆에 «따로» 적는다. 분모를 화면에 같이 내는 것도 같은 이유다(F207 — 초록은 분모와 함께).
 *
 * ■ 🔴 기준선이 잘린 개입은 **안 센다**
 *   창별 성과의 `이전` 은 개입 직전 30일 추세다. 질의 창 «시작 부근»의 개입은 그 30일이 통째로
 *   비어 있어 「활동이 없던 학생」과 「재료를 안 가져온 것」이 같은 모양이 된다. 그래서 개입 대상은
 *   질의 창 시작 + 기준선 30일 «이후» 것만 세고, 그 때문에 뺀 건수를 숨기지 않고 적는다.
 *
 * ■ 위험 — `tools/엔진뷰어.js` 와 **같은 형태**로 막는다(그 판정을 다시 하지 않는다)
 *   · 서버 0 · 배포 0 · 공개 URL 0 · 새 자격증명 0 · 쓰기 권한 0 · 원격 접근은 `lib/자격증명.js` 하나만
 *   · 쿼리를 인자로 안 받는다(아래 `질의` 상수가 나가는 전부 — 호출자가 문장을 못 넣으면 쓰기가 될 길이 없다)
 *   · 산출 HTML 은 네트워크를 안 탄다(fetch 도 키도 없다) · **미디어 사본 0**(집계만 낸다 — .wav 를 안 받는다)
 *   · 출력 폴더가 저장소 안이면 거부한다 — 판정을 베끼지 않고 엔진뷰어의 `출력검사` 를 그대로 부른다.
 *   · 화면에 `learner_id` 를 안 싣는다: 계기판이 답하는 질문은 「누가」가 아니라 「무엇이 통했나」다.
 *
 * 사용법
 *   node tools/성과계기판.js                  # 최근 90일 · 리허설(.env 과녁)
 *   node tools/성과계기판.js --운영           # 운영 과녁(읽기만)
 *   node tools/성과계기판.js --기간 180       # 질의 창(일) — 개입 대상 창은 여기서 30일을 뺀 만큼
 *   node tools/성과계기판.js --기준 2026-09-01T00:00:00Z   # 「지금 어디까지 아는가」(기본=현재)
 *   node tools/성과계기판.js --출력 <폴더>    # 기본 = OS 임시폴더/synk-성과계기판
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const 자격증명 = require('../lib/자격증명.js');
const { 출력검사 } = require('./엔진뷰어.js');
const {
  성과회수, 회수창, 쓰는사건, 닻사건, 기준선창, 회수판,
} = require('../lib/성과회수.js');

const API = 'https://api.supabase.com/v1/projects';
const 일 = 24 * 60 * 60 * 1000;

const die = (msg) => { console.error('[성과계기판] ' + msg); process.exit(1); };

/* 🔴 분모 0 은 `null` 이다 — `lib/학습자상태.js` 가 세운 규칙을 그대로 따른다. 0 으로 접으면
 *   「한 적이 없다」가 「못 한다」로 읽히고, 계기판에서는 그 오독이 곧 판단이 된다. */
const 자리 = (n, 몇 = 2) => (n == null ? null : Math.round(n * 10 ** 몇) / 10 ** 몇);
const 비율 = (분자, 분모) => (분모 > 0 ? 자리(분자 / 분모) : null);
/* 평균이 아닌 이유 = 한 건의 몰아치기가 평균을 통째로 끌고 간다(같은 파일의 같은 판정). */
const 중앙값 = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* ── 계산부(순수) — DB·네트워크 0. 테스트가 여기만 잡고 흔든다. ───────────────────── */

const 상태이름 = Object.freeze(['측정', '표본0', '미도래']);

const 빈칸 = () => ({
  개입: 0,
  닿음: 0,
  지연분: [],
  창: Object.fromEntries(회수창.map((d) => [`${d}일`,
    Object.fromEntries(상태이름.map((s) => [s, 0]))])),
});

function 담기(칸, r) {
  칸.개입 += 1;
  if (r.관측 && r.관측.닿음) {
    칸.닿음 += 1;
    if (r.관측.지연분 != null) 칸.지연분.push(r.관측.지연분);
  }
  for (const d of 회수창) {
    const k = `${d}일`;
    const 상태 = r.성과[k] && r.성과[k].상태;
    /* 모르는 상태 이름은 **버리지 않고 드러낸다** — 조용히 삼키면 창 하나가 통째로 0 이 되고
     * 그 0 은 「효과 없음」과 같은 모양이다. */
    if (!상태이름.includes(상태)) throw new Error(`성과계기판: 모르는 창 상태 «${상태}» (${k})`);
    칸.창[k][상태] += 1;
  }
}

function 정리(칸) {
  return {
    개입: 칸.개입,
    닿음: 칸.닿음,
    /* 즉시 계수 — 「배달했다」(추정)가 「눈이 닿았다」(관측)로 확인된 비율. */
    관측률: 비율(칸.닿음, 칸.개입),
    지연분_중앙: 자리(중앙값(칸.지연분), 1),
    창: Object.fromEntries(회수창.map((d) => {
      const k = `${d}일`;
      const c = 칸.창[k];
      /* 🔴 분모 = 측정 + 표본0. **미도래는 안 들어간다**(머리말 급소).
       *   `표본0` 은 분모에 있다 — 「잴 수 있었는데 그 창에 활동이 없었다」는 결과지 미도래가 아니다. */
      const 잴수있던것 = c.측정 + c.표본0;
      return [k, { ...c, 잴수있던것, 연결률: 비율(c.측정, 잴수있던것) }];
    })),
  };
}

/**
 * 원신호 행들 → 개입-효과 계수.
 *
 * @param {Array<object>} 행들 `성과회수.쓰는사건` 으로 걷은 `engine.learning_events` 행.
 * @param {{기준시각: string, 개입최소시각?: string|null}} 옵션
 *   `기준시각` **필수** — 「지금 어디까지 아는가」. 없으면 미도래 판정이 뜻을 잃는다.
 *   `개입최소시각` 이전의 개입은 기준선(30일)이 잘려 있으므로 세지 않고 `기준선부족` 으로 낸다.
 */
function 계수내기(행들, 옵션) {
  const 기준시각 = 옵션 && 옵션.기준시각;
  if (!기준시각 || !Number.isFinite(Date.parse(기준시각))) {
    throw new Error('성과계기판: 기준시각이 필요하다 — 없으면 「아직 안 왔다」를 「효과 0」과 못 가른다');
  }
  const 최소 = 옵션 && 옵션.개입최소시각 ? Date.parse(옵션.개입최소시각) : null;

  /* 학습자별 원신호 묶음 — 성과회수는 «그 학생의» 사건 배열을 받는다. 섞어 넣으면
   * 남의 활동이 남의 개입 효과로 적힌다. */
  const 학습자별 = new Map();
  for (const e of Array.isArray(행들) ? 행들 : []) {
    const id = e && e.learner_id != null ? String(e.learner_id) : null;
    if (id == null) continue;
    if (!학습자별.has(id)) 학습자별.set(id, []);
    학습자별.get(id).push(e);
  }

  const 전체 = 빈칸();
  const 규칙별 = new Map();
  const 제외 = { 학습자없음: 0, 기준선부족: 0, 계산실패: 0 };
  const 실패사유 = [];
  /* 🔑 「못 셌다」를 세는 자리는 **하나다.** 시각을 못 읽은 것과 회수가 던진 것은 원인이 다르지만
   *   결과는 같고, 두 곳에서 각자 세면 **한쪽만 덮은 검사가 초록으로 보인다** — 변이 시험이
   *   실제로 그 구멍으로 빠져나갔다(2026-08-09). 한 통로로 묶으면 그 변이가 둘 다 죽여 잡힌다. */
  const 못셌다 = (사유) => {
    제외.계산실패 += 1;
    /* 사유는 앞의 몇 건만 — 전량을 실으면 화면이 실패 목록이 되고 계수가 안 보인다.
     * 잘랐다는 것은 건수(`제외.계산실패`)가 옆에 있어 드러난다. */
    if (실패사유.length < 5) 실패사유.push(사유);
  };

  for (const e of Array.isArray(행들) ? 행들 : []) {
    if (!e || e.event_type !== 닻사건) continue;
    const id = e.learner_id != null ? String(e.learner_id) : null;
    if (id == null) { 제외.학습자없음 += 1; continue; }
    const 개입때 = Date.parse(e.occurred_at);
    if (!Number.isFinite(개입때)) { 못셌다(`occurred_at 을 못 읽었다: ${e.occurred_at}`); continue; }
    if (최소 != null && 개입때 < 최소) { 제외.기준선부족 += 1; continue; }

    let r;
    try {
      r = 성과회수(e, 학습자별.get(id) || [], { 기준시각 });
    } catch (err) {
      /* 한 건의 실패가 계기판 전체를 막지 않는다 — 대신 **몇 건 실패했는지 낸다**(미실행을
       * 통과와 같은 모양으로 두지 않는다 · F207). */
      못셌다(String((err && err.message) || err));
      continue;
    }
    담기(전체, r);
    /* 개입을 «고른» 규칙별로 가른다. 값이 없는 행은 규칙 이전에 배달된 것이라 그렇게 적는다 —
     * 다른 판과 한 칸에 섞으면 규칙별 비교가 그 순간 뜻을 잃는다. */
    const 판 = r.evidence_refs.policy_ver || '(규칙 미기록)';
    if (!규칙별.has(판)) 규칙별.set(판, 빈칸());
    담기(규칙별.get(판), r);
  }

  return {
    회수판,
    기준시각,
    기준선창,
    개입최소시각: 옵션 && 옵션.개입최소시각 ? 옵션.개입최소시각 : null,
    전체: 정리(전체),
    규칙별: Object.fromEntries([...규칙별.entries()].map(([k, v]) => [k, 정리(v)])),
    제외,
    실패사유,
    행수: Array.isArray(행들) ? 행들.length : 0,
    학습자수: 학습자별.size,
  };
}

/* ── 원격(읽기 전용) ───────────────────────────────────────────────────────── */

/* 나가는 SQL 은 이것이 전부다 — 인자로 문장을 못 받으므로 쓰기가 될 길이 없다.
 * `event_type` 목록은 **`성과회수.쓰는사건` 에서 파생**한다: 여기 다시 적으면 축을 하나 늘린
 * 날 코드는 그 사건을 세려는데 질의가 안 실어 주고, 증상은 값이 조용히 낮아지는 것뿐이다. */
const 질의 = (기간일, 상한) => {
  const 일수 = Math.max(1, Math.floor(Number(기간일) || 90));
  const 개수 = Math.max(1, Math.floor(Number(상한) || 20000));
  const 목록 = 쓰는사건.map((t) => `'${String(t).replace(/'/g, "''")}'`).join(', ');
  return `
select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at), '[]'::jsonb) as 값
  from (
    select * from engine.learning_events
     where event_type in (${목록})
       and occurred_at >= now() - interval '${일수} days'
     order by occurred_at desc
     limit ${개수}
  ) t;
`;
};

async function 질의실행(기간일, 상한) {
  const e = 자격증명.읽기('성과계기판');            // 과녁 게이트를 그대로 상속한다(--운영)
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다 (설정 절차 = tools/원격SQL.js)');
  console.error(`[성과계기판] 대상 ▸ ${ref}  읽기`);

  const res = await fetch(`${API}/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 질의(기간일, 상한) }),
  });
  if (!res.ok) die(`HTTP ${res.status} — ${(await res.text()).slice(0, 500)}`);
  const rows = JSON.parse(await res.text());
  const 값 = (rows && rows[0] && rows[0].값) || [];
  return { 행들: 값, ref };
}

/* ── 산출 ─────────────────────────────────────────────────────────────────── */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const 값표시 = (v) => (v == null ? '—' : String(v));

function 요약찍기(계수, { ref, 잘림 }) {
  const T = 계수.전체;
  console.log(`[성과계기판] ${ref} · 행 ${계수.행수} · 학습자 ${계수.학습자수} · 기준 ${계수.기준시각}`);
  console.log(`  개입 ${T.개입}건` + (계수.개입최소시각 ? ` (기준선 ${계수.기준선창}일이 온전한 것만)` : ''));
  console.log(`  즉시  닿음 ${T.닿음}/${T.개입} = ${값표시(T.관측률)} · 지연 중앙 ${값표시(T.지연분_중앙)}분`);
  for (const d of 회수창) {
    const c = T.창[`${d}일`];
    console.log(`  ${String(d).padStart(2)}일  측정 ${c.측정} · 표본0 ${c.표본0} · 미도래 ${c.미도래}`
      + `  → 연결률 ${값표시(c.연결률)} (분모 ${c.잴수있던것} · 미도래 제외)`);
  }
  /* 규칙별도 콘솔에 낸다 — 이 도구를 원격에서 돌려 «검증»하는 층은 HTML 이 아니라 여기다.
   * 규칙별 갈래가 화면에만 있으면 값이 갈렸는지 아닌지를 파일을 열어야만 알 수 있다. */
  for (const [판, 칸] of Object.entries(계수.규칙별)) {
    const 창들 = 회수창.map((d) => {
      const c = 칸.창[`${d}일`];
      return `${d}일 ${값표시(c.연결률)}/${c.잴수있던것}`;
    }).join(' · ');
    console.log(`  ▸ ${판}  개입 ${칸.개입} · 관측률 ${값표시(칸.관측률)} · ${창들}`);
  }
  const 뺀것 = Object.entries(계수.제외).filter(([, n]) => n > 0);
  if (뺀것.length) console.log('  제외 ' + 뺀것.map(([k, n]) => `${k} ${n}`).join(' · '));
  for (const s of 계수.실패사유) console.log(`    ↳ ${s}`);
  if (잘림) console.log(`  ⚠ 질의가 상한에 걸렸다 — 위 수는 **최근 ${계수.행수}행만** 본 값이다`);
}

/* 🔴 JS 로 그리지 않는다 — 스크립트를 안 돌리는 뷰어(앱 미리보기·메일·PDF)에서 빈 화면이 된다.
 *   `tools/엔진뷰어.js` 가 유호님 「안 보여」로 같은 자리를 이미 겪었다. */
function 창표(칸) {
  return 회수창.map((d) => {
    const c = 칸.창[`${d}일`];
    return `<tr><td>${d}일</td><td class="n">${c.측정}</td><td class="n">${c.표본0}</td>`
      + `<td class="n muted">${c.미도래}</td><td class="n"><b>${값표시(c.연결률)}</b>`
      + `<span class="muted"> / ${c.잴수있던것}</span></td></tr>`;
  }).join('');
}

function HTML만들기({ 계수, ref, 잘림 }) {
  const T = 계수.전체;
  const 규칙 = Object.entries(계수.규칙별);
  const 뺀것 = Object.entries(계수.제외).filter(([, n]) => n > 0);
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SYNK 성과 계기판 · ${esc(ref)}</title>
<style>
:root{--bg:#FBF7EE;--ink:#151A2E;--muted:#2A3358;--line:rgba(42,51,88,.18);--coral:#FF6B5C;--lime:#B8E836}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
h1{font-size:20px;font-weight:500;margin:0 0 4px}
h2{font-size:15px;font-weight:500;margin:24px 0 8px}
.sub{color:var(--muted);font-size:12px;margin-bottom:20px}
.warn{border-left:3px solid var(--coral);padding:8px 12px;background:#fff;font-size:12px;color:var(--muted);margin-bottom:16px}
.ext{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:8px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px}
.card .n{font-size:24px;font-weight:500}
.card .t{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:6px}
.dot{width:7px;height:7px;border-radius:50%;background:var(--lime);flex:none;outline:1px solid var(--muted)}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;font-size:13px;border-bottom:1px solid var(--line)}
th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:500}
tr:last-child td{border-bottom:none}
td.n{text-align:right;font-variant-numeric:tabular-nums}
.muted{color:var(--muted)}
.note{font-size:12px;color:var(--muted);margin:8px 0 0}
</style>
</head><body>
<h1>성과 계기판</h1>
<div class="sub">${esc(ref)} · 기준 ${esc(계수.기준시각)} · ${esc(계수.회수판)} · 행 ${계수.행수} · 학습자 ${계수.학습자수}</div>
<div class="warn">이 페이지는 네트워크를 타지 않습니다 — 데이터는 파일 안에 박혀 있고 키도 학생 식별자도 들어 있지 않습니다.</div>
${잘림 ? `<div class="warn">⚠ 질의가 상한에 걸렸습니다 — 아래 수는 최근 ${계수.행수}행만 본 값입니다.</div>` : ''}
<div class="ext">
  <div class="card"><div class="t"><span class="dot"></span>개입</div><div class="n">${T.개입}</div></div>
  <div class="card"><div class="t"><span class="dot"></span>닿음(관측 짝)</div><div class="n">${T.닿음}</div></div>
  <div class="card"><div class="t"><span class="dot"></span>관측률</div><div class="n">${값표시(T.관측률)}</div></div>
  <div class="card"><div class="t"><span class="dot"></span>열람까지(분·중앙)</div><div class="n">${값표시(T.지연분_중앙)}</div></div>
</div>
<p class="note">「닿음」은 배달(추정)이 열람(관측)으로 확인된 건수입니다. 확인이 0이어도 「학생이 무시했다」는 뜻이 아닙니다 — 관측을 내는 화면이 아직 한 곳뿐이라 그 화면을 안 거친 배달은 원리상 0건입니다.</p>

<h2>개입 뒤 창별 — 전체</h2>
<table><thead><tr><th>창</th><th class="n">측정</th><th class="n">표본0</th><th class="n">미도래</th><th class="n">연결률 / 분모</th></tr></thead>
<tbody>${창표(T)}</tbody></table>
<p class="note">🔴 <b>연결률의 분모에 미도래는 안 들어갑니다</b>(측정+표본0). 아직 안 온 창을 0으로 접으면 개원 첫 달의 모든 개입이 「효과 없음」으로 쌓이고, 그 오독은 소급으로 못 고칩니다. 「표본0」은 잴 수 있었는데 그 창에 활동이 없었던 것이라 분모에 들어갑니다.</p>
<p class="note">기준선(개입 직전 ${계수.기준선창}일 추세)과 이후 창은 <b>나란히</b>만 봅니다 — 창 길이가 달라 두 값을 빼면 산술적으로 뜻이 없습니다.</p>

<h2>선택 규칙별 <span class="muted">(무엇이 통했나)</span></h2>
${규칙.length ? 규칙.map(([판, 칸]) => `<h3 style="font-size:13px;font-weight:500;margin:16px 0 6px">${esc(판)} <span class="muted">· 개입 ${칸.개입} · 관측률 ${값표시(칸.관측률)}</span></h3>
<table><thead><tr><th>창</th><th class="n">측정</th><th class="n">표본0</th><th class="n">미도래</th><th class="n">연결률 / 분모</th></tr></thead>
<tbody>${창표(칸)}</tbody></table>`).join('')
    : '<p class="note">아직 없습니다 — 셀 개입이 0건입니다.</p>'}

${뺀것.length ? `<h2>세지 않은 개입</h2><table><tbody>${뺀것.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="n">${n}</td></tr>`).join('')}</tbody></table>
<p class="note">「기준선부족」은 질의 창 시작 부근이라 개입 직전 ${계수.기준선창}일이 통째로 비는 개입입니다 — 세면 「활동이 없던 학생」과 구별이 안 됩니다.</p>` : ''}
</body></html>`;
}

/* 🔴 못 읽는 수는 **기본값으로 접지 않고 던진다.** `Number('abc')` 는 `NaN` 이고 `|| 기본` 폴백은
 *   그것을 조용히 90 으로 바꾼다 — 그러면 `--기간 6O`(영문 O) 같은 오타가 「180일을 쟀다」는 말과
 *   함께 90일치 값을 낸다. 계기판에서 조용한 폴백은 곧 틀린 분모다. 회귀가 이 자리를 잡았다. */
function 수읽기(이름, 값, 기본, 최소, 최대) {
  if (값 == null || 값 === '') return 기본;
  const n = Number(값);
  if (!Number.isFinite(n)) throw new Error(`${이름} 을(를) 수로 못 읽었다: ${값}`);
  return Math.min(Math.max(Math.floor(n), 최소), 최대);
}

async function main() {
  const args = process.argv.slice(2);
  const 값 = (이름, 기본) => { const i = args.indexOf(이름); return i >= 0 && args[i + 1] ? args[i + 1] : 기본; };
  const 기간일 = 수읽기('--기간', 값('--기간', null), 90, 1, 3650);
  const 상한 = 수읽기('--상한', 값('--상한', null), 20000, 1, 100000);
  const 기준시각 = 값('--기준', new Date().toISOString());
  if (!Number.isFinite(Date.parse(기준시각))) die(`--기준 을 못 읽었다: ${기준시각}`);
  const 출력 = 출력검사(값('--출력', path.join(os.tmpdir(), 'synk-성과계기판')));

  const { 행들, ref } = await 질의실행(기간일, 상한);
  const 잘림 = 행들.length >= 상한;

  /* 개입 대상 창 = 질의 창에서 기준선 30일을 뺀 만큼(머리말). 기준시각이 아니라 «지금» 에서
   * 재는 이유: 질의의 `now()` 가 그렇게 잘랐기 때문이다 — 재는 층을 맞춘다. */
  const 개입최소시각 = new Date(Date.now() - (기간일 - 기준선창) * 일).toISOString();
  const 계수 = 계수내기(행들, { 기준시각, 개입최소시각: 기간일 > 기준선창 ? 개입최소시각 : null });

  요약찍기(계수, { ref, 잘림 });
  fs.mkdirSync(출력, { recursive: true });
  const 파일 = path.join(출력, '성과계기판.html');
  fs.writeFileSync(파일, HTML만들기({ 계수, ref, 잘림 }), 'utf8');
  console.log(`[성과계기판] ✅ ${파일}`);
}

if (require.main === module) main().catch((err) => die(String((err && err.message) || err)));

module.exports = { 계수내기, 질의, HTML만들기, 정리, 빈칸, 담기, 수읽기 };
