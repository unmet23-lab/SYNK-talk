#!/usr/bin/env node
/* 회차 장부 읽기 — cron 이 «무엇을 냈는지»를 사람이 읽는 자리 (조용한 실패 장부 ④)
 *
 * ■ 왜 도구가 따로 있나 — ③(건 단위 사유)은 `pipeline_jobs.last_error` 에 **writer 만 세우고
 *   reader 0** 으로 끝났다. 적히는데 아무도 안 보면 그건 여전히 조용한 실패다. 그 반복을 막는다.
 *
 * 🔑 **대조를 먼저 찍는다.** 요약(`ops.회차_요약`)만 보면 「조용하다 = 문제없다」로 읽히는데,
 *   장부 자신이 안 불려서 비어 있어도 똑같이 조용하다. `ops.회차_대조` 가
 *   `cron.job_run_details`(cron 이 스스로 남기는 회차 기록)와 건수를 맞대 그 침묵을 드러낸다.
 *
 * 🔑 0은 분모와 함께 쓴다 — 「전체 = 성공 + 실패 + … + 대기」를 한 줄로 쪼갠다.
 *   좋은 0(=실패 0)과 안 재본 0(=발사 0)이 같은 모양이면 이 도구는 거짓말을 하게 된다.
 *
 * 종료 코드 — 「초록」과 「못 쟀다」를 절대 같은 값으로 두지 않는다:
 *   0 = 재봤고 이상 없음 · 1 = 이상 있음(실패·유실·발사실패·안적힌회차) · 2 = **못 쟀다**(판 미적용)
 *
 * 안전: 읽기 전용(select 만). 과녁은 `lib/자격증명.js` 게이트를 그대로 상속한다 —
 *   운영을 읽으려면 `SUPABASE_PROJECT_REF=<운영ref>` 로 덮어쓴다(F462: 읽기에 `--운영` 을 안 붙인다).
 *
 * 사용:
 *   node tools/회차장부.js                 # 요약 + 대조
 *   node tools/회차장부.js --자세히         # 최근 이상 행의 사유·봉투까지
 *   node tools/회차장부.js --json          # 형제 저장소(as)가 읽는 한 줄 (사람글 0)
 *
 * ■ `--json` 이 왜 있나 (조용한 실패 장부 ④-㉡ · 「스스로 알리는」 층)
 *   위 두 통로는 **부르면 답할 뿐이다.** 아무도 안 부르면 cron 이 죽어도 장부는 조용하고,
 *   그 침묵은 「이상 0」과 **같은 모양**이다 — 이 도구가 고치려는 병 그 자체다. 그래서
 *   형제 저장소(`SYNK-appsscript`)의 세션시작 부패 점검이 6시간마다 이 한 줄을 읽는다.
 *   ⚠ **판정은 여기가 진다** — 부르는 쪽은 `판정`·`안적힘`·`이상` 을 **옮기기만** 한다.
 *     같은 판정을 두 곳에 적으면 갈라지고, 갈라진 쪽의 증상은 언제나 「통과」다.
 *   ⚠ 종료 코드 1·2 는 **고장이 아니라 판정**이다 — 부르는 쪽이 `status!==0` 을 「못 잼」으로
 *     번역하면 진짜 적색이 통째로 사라진다. 갈라내는 재료는 stdout 의 JSON 유무 하나뿐이다.
 *   ⚠ 봉투(응답 본문)는 **안 싣는다** — 사람이 `--자세히` 로 볼 자리이고, 기계 통로에 실으면
 *     세션 시작 화면에 벤더 응답이 통째로 쏟아진다.
 */
'use strict';

const 자격증명 = require('../lib/자격증명.js');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');

const API = 'https://api.supabase.com/v1/projects';
const 아는플래그 = [...공용플래그, '--자세히', '--json'];

/* `--json` 일 때 사람글을 죽인다 — stdout 에 한 글자라도 섞이면 부르는 쪽 `JSON.parse` 가
 * 던지고, 그건 「이상 0」이 아니라 「못 잼」으로 읽힌다(그쪽에선 그게 옳다). 진단 줄은
 * `console.error` 라 stderr 로 나가므로 그대로 둔다 — 사람은 여전히 왜인지 본다. */
let 조용 = false;
let json찍음 = false;
const 말 = (...a) => { if (!조용) console.log(...a); };
const json내기 = (o) => { json찍음 = true; process.stdout.write(`${JSON.stringify(o)}\n`); };

/* ⚠ `process.exit()` 를 안 쓴다 — fetch 가 아직 물려 있는 채로 끊으면 Windows 에서
 *   libuv 어설션(`UV_HANDLE_CLOSING`)이 찍혀 **정상 판정이 고장처럼 보인다**(실측 08-15).
 *   종료 코드는 `exitCode` 로 예약하고 자연 종료시킨다 — 그래서 die 는 던지고, main 이 받는다. */
class 멈춤 extends Error {
  constructor(코드, 말) { super(말); this.코드 = 코드; }
}
const die = (m) => { throw new 멈춤(2, m); };

/* 한 문장으로 접는다 — Supabase query API 는 마지막 문장 결과만 준다(실측 08-15). */
const 질의 = (자세히) => `
with 판 as (
  select to_regclass('ops.cron_runs') is not null as 섰나
), 요약 as (
  select coalesce(jsonb_agg(to_jsonb(v) order by v.jobname), '[]'::jsonb) as v
    from ops.회차_요약 v
), 대조 as (
  select coalesce(jsonb_agg(to_jsonb(v) order by v.jobname), '[]'::jsonb) as v
    from ops.회차_대조 v
), 이상 as (
  select coalesce(jsonb_agg(to_jsonb(t) order by t.queued_at desc), '[]'::jsonb) as v from (
    select jobname, outcome, status_code, queued_at,
           left(coalesce(error_msg, ''), 200) as 사유,
           left(coalesce(body, ''), 300)      as 봉투
      from ops.cron_runs
     where outcome not in ('성공', '대기')
     order by queued_at desc
     limit ${자세히 ? 20 : 5}
  ) t
)
select jsonb_build_object(
  '섰나', (select 섰나 from 판),
  '요약', (select v from 요약),
  '대조', (select v from 대조),
  '이상', (select v from 이상)) as 값;
`;

/* 판이 아직 없으면 위 질의는 «오류»로 죽는다(ops.회차_요약 이 없다) — 그건 「이상 0」이 아니라
 * 「못 쟀다」다. 그래서 존재부터 따로 묻는다: 두 질문을 한 문장에 접으면 못 잰 것이 0으로 보인다. */
const 존재질의 = `select to_regclass('ops.cron_runs') is not null as 섰나;`;

async function 쏘기(sql, ref, 토큰) {
  자격증명.질의전용(sql, '회차장부');   // 질의읽기 약속의 런타임 반쪽 — 어기면 여기서 던진다
  const res = await fetch(`${API}/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const 본문 = await res.text();
  if (!res.ok) die(`HTTP ${res.status} — ${본문.slice(0, 400)}`);
  return JSON.parse(본문);
}

const 숫자 = (v) => Number(v || 0);

function 요약찍기(행들) {
  if (!행들.length) {
    말('  (발사 기록 0건 — 잡이 아직 안 돌았거나 장부 경유로 안 걸렸다)');
    return 0;
  }
  let 이상합 = 0;
  for (const r of 행들) {
    const 갈래 = ['성공', '실패', '타임아웃', '전송오류', '상태없음', '발사실패', '유실', '대기'];
    const 이상 = 숫자(r.실패) + 숫자(r.타임아웃) + 숫자(r.전송오류) + 숫자(r.상태없음)
               + 숫자(r.발사실패) + 숫자(r.유실);
    이상합 += 이상;
    말(`  ${이상 ? '🔴' : '✅'} ${r.jobname}`);
    말(`     ${숫자(r.전체)} = ${갈래.map((k) => `${k} ${숫자(r[k])}`).join(' + ')}`);
    말(`     마지막 발사 ${r.마지막발사 || '—'}${r.마지막이상 ? ` · 마지막 이상 ${r.마지막이상}` : ''}`);
  }
  return 이상합;
}

function 대조찍기(행들) {
  if (!행들.length) {
    말('  (최근 24시간에 돈 회차 0 — cron 이 안 걸렸거나 방금 부었다)');
    return 0;
  }
  let 안적힘합 = 0;
  for (const r of 행들) {
    const 안적힘 = 숫자(r.안적힌횟수);
    안적힘합 += Math.max(0, 안적힘);
    const 표식 = 안적힘 > 0 ? '🔴' : (숫자(r.SQL층실패) > 0 ? '🟡' : '✅');
    /* 🔑 음수를 «안 적힌 -1» 로 찍지 않는다 — 뜻이 뒤집힌 숫자는 읽는 사람을 오도한다.
     *   적힌 쪽이 더 많은 것은 결함이 아니라 **cron 밖에서 부른 것**이다(손 시험·왕복시험). */
    const 꼬리 = 안적힘 > 0 ? `안적힌 ${안적힘}`
      : 안적힘 < 0 ? `cron 밖 호출 ${-안적힘}`
      : '어긋남 0';
    말(`  ${표식} ${r.jobname} — 돈 ${숫자(r.돈횟수)} · 적힌 ${숫자(r.적힌횟수)}`
      + ` · ${꼬리}${숫자(r.SQL층실패) ? ` · SQL층 실패 ${숫자(r.SQL층실패)}` : ''}`);
  }
  return 안적힘합;
}

async function main() {
  const args = process.argv.slice(2);
  /* 🔴 이 줄은 답을 **버리고 있었다**(08-15 변이 시험이 잡았다 · 이 저장소 40개 도구 중 유일).
   *   `인자게이트` 는 던지지 않고 «문장»을 돌려준다 — 안 받으면 모르는 낱말이 조용히 무시되고,
   *   그게 F400·F435 가 신고한 「딴 과녁을 재고 초록」 그 자체다. 나머지 12개 도구와 같은 모양으로 맞춘다. */
  const 플래그오류 = 인자게이트('회차장부', args, 아는플래그);
  if (플래그오류) die(플래그오류);
  const 자세히 = args.includes('--자세히');
  const json = args.includes('--json');
  조용 = json;

  /* `{질의읽기:true}`(08-24 신설) — 질의 API 로 «select 만» 보내는 도구의 읽기 선언.
   *   `{읽기:true}` 는 못 쓴다: 그 약속이 「fetch 에 POST 도 database/query 도 없다」라 질의 도구는
   *   원리상 못 지킨다. 그 모순 탓에 이 도구가 운영을 못 읽었고, **운영 장부(447행)는 reader 0**
   *   이었다 — c11 이 고치려던 「writer 만 세우고 reader 0」이 한 층 위에서 재발한 모양.
   *   약속의 두 반쪽: 런타임 = 쏘기() 첫 줄 `질의전용()` · 소스 = tests/자격증명.test.js 스캔.
   *   운영을 읽을 땐 `SUPABASE_PROJECT_REF` 덮어쓰기다 — `--운영` 은 쓰기 승인이라 안 붙인다(F462). */
  const e = 자격증명.읽기('회차장부', { 질의읽기: true });
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다 (설정 절차 = tools/원격SQL.js)');
  console.error(`[회차장부] 대상 ▸ ${ref}  읽기`);

  const 존재 = await 쏘기(존재질의, ref, 토큰);
  if (!(존재 && 존재[0] && 존재[0].섰나)) {
    console.error('[회차장부] 🔴 **못 쟀다** — 이 DB 에 `ops.cron_runs` 가 없다(20260815080000 미적용).');
    console.error('          이것은 「이상 0」이 아니다. 판을 먼저 부어라.');
    if (json) json내기({ 도구: '회차장부', 과녁: ref, 판: false, 판정: 2, 안적힘: 0, 이상: 0, 요약: [], 대조: [], 최근이상: [] });
    return 2;
  }

  const rows = await 쏘기(질의(자세히), ref, 토큰);
  const 값 = (rows && rows[0] && rows[0].값) || {};

  /* 🔑 대조가 먼저다 — 요약이 조용한 것이 「문제없음」인지 「장부가 안 불림」인지 여기서 갈린다. */
  말('\n■ 대조 — cron 이 돈 횟수 vs 장부에 적힌 횟수 (최근 24시간)');
  const 안적힘 = 대조찍기(값.대조 || []);

  말('\n■ 요약 — 무엇을 냈나 (최근 7일)');
  const 이상 = 요약찍기(값.요약 || []);

  const 이상행 = 값.이상 || [];
  if (이상행.length) {
    말(`\n■ 최근 이상 ${이상행.length}건${자세히 ? '' : ' (전량은 --자세히)'}`);
    for (const r of 이상행) {
      말(`  · ${r.queued_at} ${r.jobname} → ${r.outcome}`
        + `${r.status_code == null ? '' : ` (HTTP ${r.status_code})`}`);
      if (r.사유) 말(`      사유: ${r.사유}`);
      if (자세히 && r.봉투) 말(`      봉투: ${r.봉투}`);
    }
  }

  말('');
  if (json) {
    json내기({
      도구: '회차장부', 과녁: ref, 판: true,
      판정: (안적힘 > 0 || 이상 > 0) ? 1 : 0,
      안적힘, 이상,
      요약: 값.요약 || [], 대조: 값.대조 || [],
      /* 봉투는 뺀다(머리말 ⚠) · 사유는 한 줄에 얹힐 만큼만 자른다. */
      최근이상: 이상행.slice(0, 5).map((r) => ({
        jobname: r.jobname, outcome: r.outcome, queued_at: r.queued_at,
        사유: String(r.사유 || '').slice(0, 120),
      })),
    });
  }
  if (안적힘 > 0) {
    console.error(`[회차장부] 🔴 장부 자신이 침묵했다 — 안 적힌 회차 ${안적힘}건.`
      + ' cron 은 돌았는데 `ops.발사` 를 안 지났다(요약만 보면 이 결함이 안 보인다).');
    return 1;
  }
  if (이상 > 0) {
    console.error(`[회차장부] 🔴 이상 ${이상}건 — 위 갈래를 본다.`);
    return 1;
  }
  console.error('[회차장부] ✅ 재봤고 이상 0 — 위 «전체 = 갈래+갈래» 줄이 그 분모다.');
  return 0;
}

if (require.main === module) {
  main()
    .then((코드) => { process.exitCode = 코드; })
    .catch((err) => {
      console.error(`[회차장부] ${(err && err.message) || err}`);
      /* 🔑 `--json` 이면 **터진 자리에서도 한 줄을 낸다.** 안 내면 부르는 쪽엔 빈 stdout 만
       *   남고, 그쪽은 그걸 「도구가 통째로 고장」으로 읽어 «판을 아직 안 부었다»(⏳유호 · 조용해도
       *   되는 상태)와 «네트워크가 끊겼다»를 못 가른다 — 둘을 뭉치면 경보가 매일 울리고,
       *   매일 우는 경보는 꺼진다(F113). 판정 2 = 못 쟀다, 그 이상은 말하지 않는다. */
      if (process.argv.includes('--json') && !json찍음) {
        json내기({ 도구: '회차장부', 판: null, 판정: 2, 안적힘: 0, 이상: 0, 사유: String((err && err.message) || err).slice(0, 200) });
      }
      process.exitCode = (err && err.코드) || 2;
    });
}

module.exports = { main };
