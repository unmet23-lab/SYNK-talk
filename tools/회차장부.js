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
 */
'use strict';

const 자격증명 = require('../lib/자격증명.js');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');

const API = 'https://api.supabase.com/v1/projects';
const 아는플래그 = [...공용플래그, '--자세히'];

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
    console.log('  (발사 기록 0건 — 잡이 아직 안 돌았거나 장부 경유로 안 걸렸다)');
    return 0;
  }
  let 이상합 = 0;
  for (const r of 행들) {
    const 갈래 = ['성공', '실패', '타임아웃', '전송오류', '상태없음', '발사실패', '유실', '대기'];
    const 이상 = 숫자(r.실패) + 숫자(r.타임아웃) + 숫자(r.전송오류) + 숫자(r.상태없음)
               + 숫자(r.발사실패) + 숫자(r.유실);
    이상합 += 이상;
    console.log(`  ${이상 ? '🔴' : '✅'} ${r.jobname}`);
    console.log(`     ${숫자(r.전체)} = ${갈래.map((k) => `${k} ${숫자(r[k])}`).join(' + ')}`);
    console.log(`     마지막 발사 ${r.마지막발사 || '—'}${r.마지막이상 ? ` · 마지막 이상 ${r.마지막이상}` : ''}`);
  }
  return 이상합;
}

function 대조찍기(행들) {
  if (!행들.length) {
    console.log('  (최근 24시간에 돈 회차 0 — cron 이 안 걸렸거나 방금 부었다)');
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
    console.log(`  ${표식} ${r.jobname} — 돈 ${숫자(r.돈횟수)} · 적힌 ${숫자(r.적힌횟수)}`
      + ` · ${꼬리}${숫자(r.SQL층실패) ? ` · SQL층 실패 ${숫자(r.SQL층실패)}` : ''}`);
  }
  return 안적힘합;
}

async function main() {
  const args = process.argv.slice(2);
  인자게이트('회차장부', args, 아는플래그);
  const 자세히 = args.includes('--자세히');

  /* ⚠ `{읽기:true}` 를 **안 붙인다.** 그 선언은 「fetch 에 POST 도 `database/query` 도 없다」는
   *   약속인데(`tests/자격증명.test.js`), Supabase 질의 API 는 원리상 그 둘을 다 쓴다 —
   *   붙이면 지킬 수 없는 약속이 되고 그 가드가 곧 꺼진다(F103). 그래서 `성과계기판` 과 같이
   *   과녁 게이트를 그대로 상속한다. 안전은 「이 파일의 SQL 이 select 뿐」이 진다(위 두 상수).
   *   운영을 읽을 땐 `SUPABASE_PROJECT_REF` 덮어쓰기다 — `--운영` 은 쓰기 승인이라 안 붙인다(F462). */
  const e = 자격증명.읽기('회차장부');
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다 (설정 절차 = tools/원격SQL.js)');
  console.error(`[회차장부] 대상 ▸ ${ref}  읽기`);

  const 존재 = await 쏘기(존재질의, ref, 토큰);
  if (!(존재 && 존재[0] && 존재[0].섰나)) {
    console.error('[회차장부] 🔴 **못 쟀다** — 이 DB 에 `ops.cron_runs` 가 없다(20260815080000 미적용).');
    console.error('          이것은 「이상 0」이 아니다. 판을 먼저 부어라.');
    return 2;
  }

  const rows = await 쏘기(질의(자세히), ref, 토큰);
  const 값 = (rows && rows[0] && rows[0].값) || {};

  /* 🔑 대조가 먼저다 — 요약이 조용한 것이 「문제없음」인지 「장부가 안 불림」인지 여기서 갈린다. */
  console.log('\n■ 대조 — cron 이 돈 횟수 vs 장부에 적힌 횟수 (최근 24시간)');
  const 안적힘 = 대조찍기(값.대조 || []);

  console.log('\n■ 요약 — 무엇을 냈나 (최근 7일)');
  const 이상 = 요약찍기(값.요약 || []);

  const 이상행 = 값.이상 || [];
  if (이상행.length) {
    console.log(`\n■ 최근 이상 ${이상행.length}건${자세히 ? '' : ' (전량은 --자세히)'}`);
    for (const r of 이상행) {
      console.log(`  · ${r.queued_at} ${r.jobname} → ${r.outcome}`
        + `${r.status_code == null ? '' : ` (HTTP ${r.status_code})`}`);
      if (r.사유) console.log(`      사유: ${r.사유}`);
      if (자세히 && r.봉투) console.log(`      봉투: ${r.봉투}`);
    }
  }

  console.log('');
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
      process.exitCode = (err && err.코드) || 2;
    });
}

module.exports = { main };
