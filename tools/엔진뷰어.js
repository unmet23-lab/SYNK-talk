#!/usr/bin/env node
'use strict';
/* 엔진 뷰어 — 수집된 학습 데이터를 **확장자·형태별로** 한 장에 펼쳐 본다.
 *
 * ■ 유호님 지시 (2026-08-07)
 *   「음성·텍스트 등 각 확장자마다 시각화를 직관화시키고 싶어. 당연히 수집한 데이터에 영향이
 *    절대 가지 않도록 구현해야 해. 조금이라도 위험이 가는 거라면 안 할게.」
 *   → **그 조건이 기능보다 위다.** 아래 설계는 전부 그 한 줄에서 나왔다.
 *
 * ■ 위험이 어디서 오는지 — 「보는 것」이 아니라 「보려고 새로 여는 문」이다
 *   선례가 있다: `_보류_두뇌_웹화면.js`(appsscript)는 **읽기 화면**이었는데 라이브 직전에 빠졌다.
 *   화면 자체는 아무것도 안 바꿨지만 그 화면이 만든 브릿지가 프로젝트 전역 함수 171개를 열었다.
 *   노출 단위가 「내가 부르려던 것」이 아니라 「프로젝트 전체」였다 — 코드를 고쳐서 되는 문제가 아니었다.
 *   그래서 이 도구는 **문을 새로 열지 않는다**:
 *     · 서버 0 · 배포 0 · 공개 URL 0 · 새 자격증명 0 · 쓰기 권한 0
 *     · 산출물 HTML 은 **네트워크를 타지 않는다**(fetch 도 키도 없다 — 데이터는 파일 안에 박혀 나간다)
 *     · 원격 접근은 기존 공용 통로 `lib/자격증명.js` 하나만 지난다 = 과녁 게이트(운영이면 `--운영`)를 그대로 상속
 *
 * ■ 읽기 전용을 **말이 아니라 형태로** 지킨다
 *   쿼리를 인자로 받지 않는다. 아래 `질의` 상수에 박힌 select 만 나간다 — 호출자가 문장을 못 넣으면
 *   쓰기가 될 길이 없다. (`원격SQL.js` 처럼 파일을 받아 판정하는 층을 또 만들면 판정이 두 곳에서 갈린다.)
 *
 * ■ 남는 위험 1개는 숨기지 않는다 — **사본**
 *   `--미디어` 를 주면 학생 음성 .wav 가 유호님 PC 에 내려온다. 원본은 안 건드리지만 **사본이 는다.**
 *   그래서 ①기본값이 아니고 ②출력 폴더가 저장소 안이면 거부한다(git 에 실려 영구화되는 것을 막는다).
 *
 * 사용법
 *   node tools/엔진뷰어.js                       # 메타데이터만 — 사본 0
 *   node tools/엔진뷰어.js --미디어              # + .wav 내려받아 재생 가능 (사본 늘어남)
 *   node tools/엔진뷰어.js --출력 <폴더>         # 기본 = OS 임시폴더/synk-엔진뷰어
 *   node tools/엔진뷰어.js --건수 40             # 샘플 행 수 (기본 25)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API = 'https://api.supabase.com/v1/projects';
const 자격증명 = require('../lib/자격증명.js');

const die = (msg) => { console.error('[엔진뷰어] ' + msg); process.exit(1); };

/* 나가는 SQL 은 여기 있는 것이 전부다 — 인자로 문장을 못 받으므로 쓰기가 될 길이 없다.
 * `to_jsonb(t)` 로 통째로 받는 이유: 컬럼이 늘어도 뷰어가 안 깨진다(스키마를 두 곳에 안 적는다). */
/* 표본을 최신순으로만 뽑으면 소수 확장자가 통째로 안 보인다(실측: wav 44/360 이라 최신 25 에 0건).
 * 그래서 **음성 있는 것과 없는 것을 반씩** 뽑는다 — 확장자별로 보는 것이 이 도구의 목적이다. */
const 질의 = (건수) => {
  const 반 = Math.max(1, Math.floor(건수 / 2));
  return `
select 'events_by_type' as 갈래,
       jsonb_agg(jsonb_build_object('k', event_type, 'n', n) order by n desc) as 값
  from (select event_type, count(*) n from engine.learning_events group by 1) s
union all
select 'totals',
       (select jsonb_build_object(
          'submissions',  count(*),
          'wav',          count(*) filter (where audio_ref is not null),
          'image',        count(*) filter (where array_length(image_refs, 1) > 0),
          'text',         count(*) filter (where body_original is not null),
          'transcript',   count(*) filter (where transcript is not null),
          'events',       (select count(*) from engine.learning_events)
        ) from engine.submissions)
union all
select 'submissions_sample',
       (select jsonb_agg(to_jsonb(t)) from (
          (select * from engine.submissions where audio_ref is not null order by occurred_at desc limit ${반})
          union all
          (select * from engine.submissions where audio_ref is null order by occurred_at desc limit ${건수 - 반})
        ) t)
union all
select 'events_sample',
       (select jsonb_agg(to_jsonb(t)) from (
          select * from engine.learning_events order by occurred_at desc limit ${건수}
        ) t);
`;
};

/** 값 안에서 파일 참조를 긁어낸다 — 확장자가 곧 분류축이다. */
function 참조수집(값, 모음 = []) {
  if (값 == null) return 모음;
  if (typeof 값 === 'string') {
    const m = 값.match(/[\w./-]+\.(wav|m4a|mp3|png|jpg|jpeg|webp|txt|json)/gi);
    if (m) 모음.push(...m);
    return 모음;
  }
  if (Array.isArray(값)) { 값.forEach((v) => 참조수집(v, 모음)); return 모음; }
  if (typeof 값 === 'object') { Object.values(값).forEach((v) => 참조수집(v, 모음)); return 모음; }
  return 모음;
}

const 확장자 = (p) => (String(p).split('.').pop() || '').toLowerCase();

/** 저장소 안이면 거부 — 학생 음성이 git 에 실려 영구화되는 것을 형태로 막는다. */
function 출력검사(폴더) {
  const abs = path.resolve(폴더);
  for (const repo of [ROOT, path.join(ROOT, '..', 'SYNK-appsscript')]) {
    const r = path.resolve(repo);
    if (abs === r || abs.startsWith(r + path.sep)) {
      die(`출력 폴더가 저장소 안이다 — 학생 음성이 git 에 실릴 수 있어 거부한다.\n  ${abs}\n` +
          `  저장소 밖을 주거나 기본값을 쓴다: node tools/엔진뷰어.js`);
    }
  }
  return abs;
}

async function 질의실행(건수) {
  const e = 자격증명.읽기('엔진뷰어');          // 과녁 게이트를 그대로 상속한다
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다 (설정 절차 = tools/원격SQL.js)');
  console.error(`[엔진뷰어] 대상 ▸ ${ref}  읽기`);

  const res = await fetch(`${API}/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 질의(건수) }),
  });
  if (!res.ok) die(`HTTP ${res.status} — ${(await res.text()).slice(0, 500)}`);
  const rows = JSON.parse(await res.text());
  const 갈래 = {};
  for (const r of rows) 갈래[r.갈래] = r.값;
  return { 갈래, ref, e };
}

async function 미디어받기(참조들, 출력, e) {
  const ref = e.SUPABASE_PROJECT_REF;
  const 키 = e.SUPABASE_SERVICE_ROLE || e.SUPABASE_SERVICE_KEY || e.SUPABASE_ANON_KEY;
  if (!키) { console.error('[엔진뷰어] ⚠ 스토리지 키가 .env 에 없어 미디어는 건너뛴다 (메타데이터는 그대로 나온다)'); return {}; }
  const dir = path.join(출력, 'media');
  fs.mkdirSync(dir, { recursive: true });
  const 지도 = {};
  for (const p of 참조들) {
    const 이름 = path.basename(p);
    try {
      const r = await fetch(`https://${ref}.supabase.co/storage/v1/object/learner-media/${p}`,
        { headers: { Authorization: `Bearer ${키}`, apikey: 키 } });
      if (!r.ok) continue;
      fs.writeFileSync(path.join(dir, 이름), Buffer.from(await r.arrayBuffer()));
      지도[p] = `media/${이름}`;
    } catch { /* 한 건 실패가 전체를 막지 않는다 — 못 받은 것은 지도에 안 실려 「참조만」으로 보인다 */ }
  }
  console.error(`[엔진뷰어] 미디어 ${Object.keys(지도).length}/${참조들.length} 내려받음 — ⚠ 사본이 늘었다: ${dir}`);
  return 지도;
}

function HTML만들기({ 갈래, ref, 미디어지도, 참조통계 }) {
  const 자료 = JSON.stringify({ 갈래, ref, 미디어지도, 참조통계, 만든때: new Date().toISOString() })
    .replace(/</g, '\\u003c');   // </script> 조기 종료 차단
  return `<meta charset="utf-8"><title>SYNK 엔진 뷰어 · ${ref}</title>
<style>
:root{--bg:#FBF7EE;--ink:#151A2E;--muted:#2A3358;--line:rgba(42,51,88,.18);--coral:#FF6B5C;--lime:#B8E836}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
h1{font-size:20px;font-weight:500;margin:0 0 4px}
.sub{color:var(--muted);font-size:12px;margin-bottom:20px}
.kinds{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
.chip{border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:12px;background:#fff}
.chip b{font-weight:500}
.ext{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:24px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px}
.card .n{font-size:24px;font-weight:500}
.card .t{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:6px}
.dot{width:7px;height:7px;border-radius:50%;background:var(--coral);flex:none;outline:1px solid var(--muted)}
.dot.audio{background:var(--lime)}
h2{font-size:15px;font-weight:500;margin:24px 0 8px}
.row{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px}
.row summary{cursor:pointer;font-size:13px;list-style:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.row summary::-webkit-details-marker{display:none}
.tag{font-size:11px;padding:1px 8px;border-radius:999px;background:#F1EFE8;color:var(--muted)}
pre{margin:8px 0 0;padding:10px;background:#F7F4EC;border-radius:6px;overflow:auto;font-size:12px;max-height:340px}
audio{width:100%;margin-top:8px}
.warn{border-left:3px solid var(--coral);padding:8px 12px;background:#fff;border-radius:0;font-size:12px;color:var(--muted);margin-bottom:20px}
</style>
<h1>엔진 뷰어</h1>
<div class="sub" id="sub"></div>
<div class="warn">이 페이지는 네트워크를 타지 않습니다 — 데이터는 파일 안에 박혀 있고 키는 들어 있지 않습니다.</div>
<div class="kinds" id="kinds"></div>
<h2>확장자별</h2>
<div class="ext" id="ext"></div>
<h2>제출 <span id="sn" class="tag"></span></h2>
<div id="subs"></div>
<h2>사건 <span id="en" class="tag"></span></h2>
<div id="evts"></div>
<script>
const D = ${자료};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
$('sub').textContent = D.ref + ' · ' + new Date(D.만든때).toLocaleString('ko-KR') + ' 기준';

$('kinds').innerHTML = (D.갈래.events_by_type || [])
  .map(x => '<span class="chip">' + esc(x.k) + ' <b>' + x.n + '</b></span>').join('');

const T = D.갈래.totals || {};
$('ext').innerHTML = [
  ['음성 .wav', T.wav, 1], ['텍스트 본문', T.text, 0], ['이미지', T.image, 0],
  ['전사문', T.transcript, 0], ['제출 전체', T.submissions, 0], ['사건 전체', T.events, 0],
].map(([이름, n, 소리]) => '<div class="card"><div class="t"><span class="dot' +
    (소리 ? ' audio' : '') + '"></span>' + esc(이름) + '</div><div class="n">' +
    (n == null ? '—' : n) + '</div></div>').join('');

function 그리기(칸, 행들, 라벨) {
  const rows = 행들 || [];
  $(칸 === 'subs' ? 'sn' : 'en').textContent = rows.length + '건';
  $(칸).innerHTML = rows.map((r, i) => {
    const refs = JSON.stringify(r).match(/[\\w./-]+\\.(wav|m4a|mp3|png|jpg|jpeg|webp)/gi) || [];
    const 재생 = refs.filter(p => D.미디어지도[p]).map(p =>
      '<audio controls preload="none" src="' + D.미디어지도[p] + '"></audio>').join('');
    const 태그 = [r.event_type, r.task_type, r.task_format, r.source_kind]
      .filter(Boolean).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
    return '<details class="row"><summary><b>' + (i+1) + '</b>' + 태그 +
      (refs.length ? '<span class="tag">' + refs.length + ' 파일</span>' : '') +
      '</summary>' + 재생 + '<pre>' + esc(JSON.stringify(r, null, 2)) + '</pre></details>';
  }).join('') || '<div class="row">' + 라벨 + ' 없음</div>';
}
그리기('subs', D.갈래.submissions_sample);
그리기('evts', D.갈래.events_sample);
</script>`;
}

async function main() {
  const args = process.argv.slice(2);
  const 값 = (이름, 기본) => { const i = args.indexOf(이름); return i >= 0 && args[i+1] ? args[i+1] : 기본; };
  const 건수 = Math.min(Number(값('--건수', 25)) || 25, 200);
  const 출력 = 출력검사(값('--출력', path.join(os.tmpdir(), 'synk-엔진뷰어')));

  const { 갈래, ref, e } = await 질의실행(건수);

  const 모든참조 = [...new Set(참조수집(갈래))];
  const 참조통계 = {};
  for (const p of 모든참조) { const x = 확장자(p); 참조통계[x] = (참조통계[x] || 0) + 1; }

  fs.mkdirSync(출력, { recursive: true });
  const 미디어지도 = args.includes('--미디어')
    ? await 미디어받기(모든참조.filter((p) => ['wav','m4a','mp3','png','jpg','jpeg','webp'].includes(확장자(p))), 출력, e)
    : {};

  const 파일 = path.join(출력, '뷰어.html');
  fs.writeFileSync(파일, HTML만들기({ 갈래, ref, 미디어지도, 참조통계 }), 'utf8');
  console.log(`[엔진뷰어] ✅ ${파일}`);
  if (!args.includes('--미디어')) console.log('[엔진뷰어] 메타데이터만 — 사본 0. 음성까지 보려면 --미디어 (사본이 늘어난다)');
}

/* 자가검사 — 원격 없이 잴 수 있는 것만 본다(질의가 읽기전용인가 · 참조를 긁는가 · 저장소를 거부하는가). */
function 자가검사() {
  const assert = require('assert');
  assert.ok(!/\b(insert|update|delete|drop|truncate|alter|create)\b/i.test(질의(5)), '질의에 쓰기어가 있다');
  assert.deepStrictEqual(참조수집({ a: 'voice/x/1.wav', b: [{ c: 'image/y/2.png' }], d: 3 }).sort(),
    ['image/y/2.png', 'voice/x/1.wav']);
  assert.strictEqual(확장자('voice/x/1.WAV'), 'wav');
  // 저장소 안 거부는 die() 로 프로세스를 끝내므로 자식으로 돌려서 종료코드로 잰다.
  const r = require('child_process').spawnSync(process.execPath,
    [__filename, '--출력', path.join(ROOT, 'tmp')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1, '저장소 안 출력이 거부되지 않았다');
  assert.match(r.stderr, /저장소 안이다/);
  console.log('[엔진뷰어] 자가검사 통과 — 질의 읽기전용 · 참조수집 · 확장자 정규화 · 저장소 출력 거부');
}

if (process.argv.includes('--자가검사')) 자가검사();
else main().catch((err) => die(String(err && err.message || err)));

module.exports = { 참조수집, 확장자, 질의, 출력검사 };
