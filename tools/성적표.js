#!/usr/bin/env node
'use strict';
/* 성적표 — N12. **`model`·`prompt_ver` × 골든 판정 승률**을 한 장에 낸다 (M2 설계 §5).
 *
 * ■ 이 파일이 닫는 것 — 골든 생산자의 «소비자 0»
 *   `functions/teach` 가 라벨을 만들어도 그것을 **읽는 자리**가 없으면 엔진 도달은 0이다
 *   (엔진도달_설계 §5: *"도달의 정의는 «읽힌 것»이지 보이는 것이 아니다"*). 그래서 생산자와
 *   **같은 커밋에 동봉**한다 — 도달 래칫이 생산자만 있는 커밋을 그 자리에서 막는다.
 *
 * ■ 🔴 골든 소속은 **감사 원장**이 정한다 (설계 §3 · 반박 C1)
 *   approve 행도 `actor_kind='teacher'`·`reviewed_correction_id`·`verdict` 를 싣고, 오늘 두 문을
 *   지나는 사람은 원장 한 명이라 **역할로는 못 가른다**. `teach.gold.judge` 감사의 `target_ids`
 *   [평가 대상, 골든 행] 조인이 유일한 판별식이다 — 이게 틀리면 검수 확정 행이 승률에 섞인다.
 *   ⚠ 그래서 인수 조건 둘째가 「검수 확정 행을 **일부러 심어 놓고** 오염 0을 증명」이다(설계 §7).
 *
 * ■ 🔴 세 값이지 두 값이 아니다 — ① 이 과교정률 계기판이다
 *   승 = 「AI 교정이 맞다」 · 패 = 「고칠 곳이 있다」 · **① 「원문이 이미 맞다」 = 과교정**
 *   (AI 가 맞는 문장을 고친 사건). ① 을 패에 합치면 「21/21≠100%」 실패모드를 감시하는 숫자가
 *   사라진다. 승률의 분모는 셋 전부다 — ① 도 AI 가 틀린 것이다.
 *
 * ■ 🔴 전사 기반을 **두 층으로 갈라 낸다** (반박 H3)
 *   기계 전사는 Whisper 가 오발음을 정타로 「고쳐 들은」 문자열일 수 있다. 그 위의 ① 은
 *   「AI 가 맞는 문장을 고쳤다」가 아니라 「Whisper 가 이미 고쳐 들은 문장을 AI 가 고쳤다」일 수
 *   있어, 확정 기반과 섞으면 과교정률이 거짓이 된다.
 *     · **확정 기반** = 판정 때 본 전사 == 지금의 `transcript_verified`(NFC)
 *     · **기계 기반(참고)** = 아직 검수 안 된 것(`transcript_verified` is null)
 *     · **낡음** = 판정 «후» 전사가 바뀐 것 → **분모에서 빼고** 「재판정 후보」로 낸다
 *
 * ■ 🔴 급수 층화 — 열 추가 0
 *   부모 사건의 `level_snapshot` 으로 가른다. 층화 없는 단일 승률은 **학생 구성이 바뀌면**
 *   모델 성능이 바뀐 것처럼 보인다(강7 「급수는 조인으로」의 talk 번역).
 *
 * ■ 정직한 분모 (F207)
 *   주 5건이라 표본이 작다 — 그 한계를 **산출물에 같이 적는다**(「믿음이 아니라 숫자」).
 *   0건이면 0건이라고 말한다: `ANTHROPIC_API_KEY` 가 없어 AI 교정 실풀이 0인 것은 **상류의
 *   상태**지 이 회로의 결함이 아니고, 그 둘을 같은 침묵으로 뭉개지 않는다.
 *
 * ■ 안전
 *   · 읽기 전용. 쿼리를 인자로 안 받는다(아래 `질의` 가 나가는 전부).
 *   · 학생 원문(전사·교정문)을 **출력하지 않는다** — 세는 것은 판정 «분포»지 문장이 아니다.
 *     재판정 후보도 id 만 낸다.
 *
 * 사용:
 *   node tools/성적표.js                 # 최근 12주
 *   node tools/성적표.js --주 26         # 창을 늘린다
 *   node tools/성적표.js --json          # 기계용
 */
const path = require('path');

const 자격증명 = require('../lib/자격증명.js');
const { 정규화 } = require('../lib/검수확정.js');
const { 풀술어, 표본, 주범위, 키, iso주, 주당건수 } = require('../lib/골든표본.js');

const API = 'https://api.supabase.com/v1/projects';
const 기본주수 = 12;

const die = (m) => { console.error(`[성적표] ${m}`); process.exit(1); };

/* ── 질의 ─────────────────────────────────────────────────────────────────
 *
 * 🔑 **한 번에 다 읽고 JS 에서 센다.** SQL 안에서 층화·NFC 비교까지 하면 그 판정이 두 곳
 *   (여기와 `lib/검수확정.정규화`)에 살고, NFC 는 정확히 두 사본이 갈리면 라벨이 뒤집히는 자리다.
 *   행 수는 「주 5건 × 주 수」라 원리상 작다(12주 = 60행) — 끌어와도 싸다.
 */
const 질의 = (시작ISO) => `
  with 골든 as (
    /* 소속의 정본 — 감사 원장. target_ids = [평가 대상 AI 행, 골든 행](순서가 계약이다). */
    select distinct l.target_ids[1] as ai_id, l.target_ids[2] as gold_id, l.at as 판정시각
      from engine.staff_access_log l
     where l.action = 'teach.gold.judge'
       and array_length(l.target_ids, 1) = 2
  )
  select coalesce(json_agg(row_to_json(x)), '[]'::json) as 값 from (
    select g.ai_id::text, g.gold_id::text, g.판정시각,
           t.verdict, t.verdict_reason is not null as 사유있음,
           t.transcript_at_review,
           a.model, a.prompt_ver, a.created_at as ai시각,
           s.transcript_verified,
           e.level_snapshot
      from 골든 g
      join engine.corrections t on t.correction_id = g.gold_id
      join engine.corrections a on a.correction_id = g.ai_id
      join engine.submissions  s on s.submission_id = t.submission_id
      join engine.learning_events e on e.event_id = s.event_id
     where g.판정시각 >= '${시작ISO}'::timestamptz
     order by g.판정시각
  ) x`;

/* 완료율의 «분모» = 그 주에 실제로 물어본 것. 문과 **같은 술어**를 써야 한다(`풀술어` 머리말). */
const 풀질의 = (시작ISO, 끝ISO) => `
  select coalesce(json_agg(c.correction_id order by c.correction_id), '[]'::json) as 값
    from engine.corrections c
   where ${풀술어}
     and c.created_at >= '${시작ISO}'::timestamptz
     and c.created_at <  '${끝ISO}'::timestamptz`;

async function 실행(sql, 토큰, ref) {
  const res = await fetch(`${API}/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) die(`HTTP ${res.status} — ${(await res.text()).slice(0, 500)}`);
  const rows = JSON.parse(await res.text());
  return (rows && rows[0] && rows[0].값) || [];
}

/* ── 계수 ─────────────────────────────────────────────────────────────── */

const 승 = 'AI 교정이 맞다';
const 패 = '고칠 곳이 있다';
const 과교정 = '원문이 이미 맞다';

/** 판정 행 → 전사 기반 층. 세 값이고 **낡음은 분모 밖**이다(머리말 🔴). */
function 기반(행) {
  if (행.transcript_verified === null || 행.transcript_verified === undefined) return '기계';
  return 정규화(행.transcript_at_review) === 정규화(행.transcript_verified) ? '확정' : '낡음';
}

const 빈칸 = () => ({ 승: 0, 패: 0, 과교정: 0, 사유있음: 0 });

function 담기(칸, 행) {
  if (행.verdict === 승) 칸.승 += 1;
  else if (행.verdict === 패) 칸.패 += 1;
  else if (행.verdict === 과교정) 칸.과교정 += 1;
  if (행.사유있음) 칸.사유있음 += 1;
}

const 합 = (c) => c.승 + c.패 + c.과교정;
/** 승률·과교정률 — **분모가 0이면 null**이다(0% 가 아니다 · 「안 쟀다」와 「0이었다」를 안 뭉갠다). */
const 율 = (분자, 분모) => (분모 > 0 ? Math.round((분자 / 분모) * 1000) / 10 : null);

function 계수내기(행들) {
  const 층 = { 확정: 빈칸(), 기계: 빈칸(), 낡음: 빈칸() };
  const 판 = new Map();   // `model ▸ prompt_ver` → 칸 (확정+기계 · 낡음 제외)
  const 급수 = new Map(); // level_snapshot → 칸
  const 재판정후보 = [];

  for (const 행 of 행들) {
    const b = 기반(행);
    담기(층[b], 행);
    if (b === '낡음') {
      /* 🔑 id 만 낸다 — 세는 것은 판정 분포지 문장이 아니다(학생 원문을 도구 출력에 안 싣는다). */
      재판정후보.push({ gold_id: 행.gold_id, ai_id: 행.ai_id, 판정시각: 행.판정시각 });
      continue;
    }
    const 판키 = `${행.model ?? '(모름)'} ▸ ${행.prompt_ver ?? '(모름)'}`;
    if (!판.has(판키)) 판.set(판키, 빈칸());
    담기(판.get(판키), 행);

    const 급키 = 행.level_snapshot ?? '(미상)';
    if (!급수.has(급키)) 급수.set(급키, 빈칸());
    담기(급수.get(급키), 행);
  }
  return { 층, 판, 급수, 재판정후보, 전체행: 행들.length };
}

/* ── 완료율 (표본을 재현해서 «물어본 것» 을 센다) ─────────────────────── */

async function 완료율(주키들, 판정된AI, 토큰, ref) {
  const 표 = [];
  for (const 주 of 주키들) {
    const r = 주범위(주);
    const 풀ids = await 실행(풀질의(r.시작, r.끝), 토큰, ref);
    const 풀 = 풀ids.map((id) => ({ correction_id: String(id) }));
    const 뽑힘 = (표본(풀, 주) ?? []).map((x) => String(x.correction_id));
    표.push({
      주,
      풀: 풀.length,
      물어봄: 뽑힘.length,
      판정됨: 뽑힘.filter((id) => 판정된AI.has(id)).length,
    });
  }
  return 표;
}

/* ── 출력 ─────────────────────────────────────────────────────────────── */

const 칸글 = (c) => {
  const n = 합(c);
  const w = 율(c.승, n);
  const o = 율(c.과교정, n);
  return `n=${String(n).padStart(3)}  승률 ${w === null ? '  —  ' : `${String(w).padStart(5)}%`}` +
         `  과교정 ${o === null ? '  —  ' : `${String(o).padStart(5)}%`}` +
         `  (승 ${c.승} · 패 ${c.패} · 과교정 ${c.과교정})`;
};

function 찍기(계수, 완료, { ref, 주수 }) {
  const L = (s = '') => console.log(s);
  L(`\n■ 골든 성적표 — 최근 ${주수}주  ▸ ${ref}`);
  L('─'.repeat(78));

  const 셀수있는 = 합(계수.층.확정) + 합(계수.층.기계);
  if (계수.전체행 === 0) {
    L('\n판정 행이 **0건**이다.');
    L('  이것은 회로의 결함이 아니라 상류의 상태일 수 있다 — 셋 중 하나를 먼저 본다:');
    L('   ① AI 교정 실풀 0 (ANTHROPIC_API_KEY 미설정 = 유호님 몫 · 돈)');
    L('   ② functions/teach 미배포');
    L('   ③ 강사가 아직 아무것도 판정하지 않음');
    L('  ⚠ 셋은 서로 다른 일이고, 이 도구는 그것을 대신 판정하지 않는다.\n');
    return;
  }

  L('\n▸ 전사 기반 층 (섞으면 과교정률이 거짓이 된다)');
  L(`  확정 기반          ${칸글(계수.층.확정)}`);
  L(`  기계 기반(참고)    ${칸글(계수.층.기계)}`);
  if (합(계수.층.낡음)) {
    L(`  🔴 낡음(분모 밖)   ${칸글(계수.층.낡음)}  ← 판정 «후» 전사가 바뀐 행`);
  }

  L('\n▸ model × prompt_ver  (낡음 제외 · 분모 = 확정+기계)');
  const 판정렬 = [...계수.판.entries()].sort((a, b) => 합(b[1]) - 합(a[1]));
  for (const [키명, c] of 판정렬) L(`  ${키명.padEnd(34)} ${칸글(c)}`);
  if (!판정렬.length) L('  (없다)');

  L('\n▸ 급수 층화 (층화 없는 단일 승률은 학생 구성이 바뀌면 성능이 바뀐 것처럼 보인다)');
  for (const [키명, c] of [...계수.급수.entries()].sort()) L(`  ${String(키명).padEnd(34)} ${칸글(c)}`);

  L('\n▸ 주별 완료율 (물어본 것 = 표본 재현 · 문과 같은 lib)');
  for (const r of 완료) {
    const 경고 = r.풀 > 0 && r.물어봄 < 주당건수 ? `  ⚠ 풀이 ${r.풀}건뿐이라 ${r.물어봄}건만 물었다` : '';
    L(`  ${r.주}   물어봄 ${r.물어봄}/${주당건수}  판정됨 ${r.판정됨}  (그 주 풀 ${r.풀})${경고}`);
  }

  const 사유 = 계수.층.확정.사유있음 + 계수.층.기계.사유있음;
  L(`\n▸ 사유 기입률  ${사유}/${셀수있는}` +
    `${셀수있는 ? ` (${율(사유, 셀수있는)}%)` : ''}   ← ③ 은 필수 · ①② 는 v1 선택(게이트는 실측 뒤 판정)`);

  if (계수.재판정후보.length) {
    L(`\n▸ 재판정 후보 ${계수.재판정후보.length}건 — 판정 후 전사가 바뀌어 분모에서 뺐다`);
    for (const r of 계수.재판정후보.slice(0, 10)) L(`  gold=${r.gold_id}  ai=${r.ai_id}  ${r.판정시각}`);
    if (계수.재판정후보.length > 10) L(`  … 외 ${계수.재판정후보.length - 10}건`);
  }

  /* 🔑 통계력 한계를 **산출물에 같이 적는다**(설계 §5 · 「믿음이 아니라 숫자」). */
  L('\n─'.repeat(78));
  L(`분모 ${셀수있는}건 — 주 ${주당건수}건 표본이라 작다.`);
  if (셀수있는 < 30) {
    L('⚠ **30건 미만이면 승률 차이를 모델 차이로 읽지 않는다** — 한 건이 몇 %를 흔든다.');
  }
  L('⚠ 분모는 무작위 층만이다(저확신 층은 confidence 생산자 0 이라 아직 없다 — 열리는 날');
  L('   표본 출처 표기가 선행이다. 섞으면 정확도 추정 분모가 오염된다).');
  L('');
}

/* ── main ─────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const 값 = (이름, 기본) => {
    const i = args.indexOf(이름);
    return i >= 0 && args[i + 1] ? args[i + 1] : 기본;
  };
  const 주수 = Math.max(1, Number(값('--주', String(기본주수))) || 기본주수);

  const e = 자격증명.읽기('성적표');   // 과녁 게이트를 그대로 상속한다(--운영)
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다 (설정 절차 = tools/원격SQL.js)');
  console.error(`[성적표] 대상 ▸ ${ref}  읽기`);

  /* 창의 시작 = 지금에서 주수만큼 뒤. 판정 시각으로 자른다(AI 행 시각이 아니다 — 늦게 판정한
   * 지난 주 표본도 그 판정이 창 안이면 센다). */
  const 지금 = new Date();
  const 시작 = new Date(지금.getTime() - 주수 * 7 * 86400000).toISOString();

  const 행들 = await 실행(질의(시작), 토큰, ref);
  const 계수 = 계수내기(행들);
  const 판정된AI = new Set(행들.map((r) => String(r.ai_id)));

  /* 완료율은 «지난 완결 주» 부터 거슬러 센다 — 이번 주는 아직 물어본 적이 없다. */
  const 주키들 = [];
  for (let i = 1; i <= 주수; i += 1) {
    const d = new Date(지금.getTime() - i * 7 * 86400000);
    const w = iso주(d);
    const k = 키(w.연, w.주);
    if (!주키들.includes(k)) 주키들.push(k);
  }
  const 완료 = await 완료율(주키들.slice(0, 주수), 판정된AI, 토큰, ref);

  if (args.includes('--json')) {
    console.log(JSON.stringify({
      ref,
      주수,
      층: 계수.층,
      판: Object.fromEntries(계수.판),
      급수: Object.fromEntries(계수.급수),
      완료,
      재판정후보: 계수.재판정후보,
      분모: 합(계수.층.확정) + 합(계수.층.기계),
    }, null, 2));
    return;
  }
  찍기(계수, 완료, { ref, 주수 });
}

if (require.main === module) {
  main().catch((err) => die(String(err && err.message ? err.message : err)));
}

module.exports = { 계수내기, 기반, 담기, 빈칸, 합, 율, 질의, 풀질의, 완료율, 승, 패, 과교정 };
