#!/usr/bin/env node
/* 전사배치태우기 — 전사 배치를 «한 번» 손으로 태우고, 돈 뒤 «행에 값이 앉았는지»를 직접 연다.
 *
 * ■ 왜 있나 (2026-09-03)
 *   `stt_model`·`stt_lang` 을 세운 날, 「함수가 뜬다」까지는 쟀지만 **그 UPDATE 가 실제로 그 칸을
 *   채우는지**는 못 쟀다. 10분 주기 cron 을 기다려도 되지만, 기다림은 **안 돌았다와 같은 모양**이라
 *   눈으로 한 번 보는 통로가 필요하다. `세그먼트재료.js` 는 새 제출을 «만들어» 재는 도구라
 *   재료를 남긴다 — 이 도구는 **아무것도 안 만들고** 이미 대기 중인 행만 태운다.
 *
 * ■ 무엇을 재나 — 세 사실을 «따로» 낸다(섞으면 0이 성공 얼굴을 한다)
 *   ① 배치가 돌았나(HTTP·봉투) ② 무엇을 집었나(집음·전사·미룸·사유) ③ **행에 값이 앉았나**(직접 select).
 *   ①②가 초록인데 ③이 비면 그것이 바로 찾던 결함이다.
 *
 * ■ ✅ 첫 실측 (2026-09-03 · 리허설 3건)
 *   집음 3 = 전사 2 + 못박음 1(벤더 400 「Audio file is too short. Minimum audio length is 0.1 seconds.」 —
 *   0.1초 무음 시험 파일이라 «재시도해도 같은 것»이고, 그래서 `failed` 로 못박히는 것이 옳다).
 *   새 두 행에 `stt_model='openai:whisper-1:ko'`·`stt_lang='korean'` 이 앉았고, 그 «전»에 전사된
 *   옛 행들은 null 그대로였다 — 설계대로다(null = 「이 장부가 서기 전」 · 소급 안 한다).
 *   🔑 **`ko` 와 `korean` 은 다른 낱말이다** — 요청은 우리가 못박은 코드(`ko`)고, `stt_lang` 은
 *     벤더가 제 말로 돌려준 이름(`korean`)이다. 나중에 「요청 언어 ↔ 들은 언어」를 맞대 보는 사람이
 *     문자열을 그냥 비교하면 **늘 안 맞는다**. 코드로 접어 비교하든지, 「다르다」의 뜻을 먼저 정하라.
 *
 * ■ 🔴 벤더를 부른다 = 돈이 든다. 그래서 `--적용` 없이는 안 태운다(기본은 세기만 한다).
 *   상한은 대기 수에 맞추되 `--상한 N` 으로 줄일 수 있다 — 처음에는 작게 태워 보는 것이 옳다.
 * ■ 🔴 리허설 기본. 운영은 `--운영` 이 필요하다(공용 플래그).
 *
 * 사용:
 *   node tools/전사배치태우기.js              # 읽기만 — 대기·장부 현황
 *   node tools/전사배치태우기.js --적용 --상한 3
 */
'use strict';
const 골격 = require('../lib/왕복골격.js');
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');

const 아는플래그 = [...공용플래그, '--적용', '--상한'];
const args = process.argv.slice(2);
/* 모르는 낱말은 여기서 죽는다(F435) — 조용히 무시하면 「딴 과녁을 재고 초록」이 된다. */
const 플래그오류 = 인자게이트('전사배치태우기', args, 아는플래그);
if (플래그오류) { console.error(`[전사배치] ${플래그오류}`); process.exit(2); }
const 적용 = args.includes('--적용');
const 상한인자 = args.includes('--상한') ? Number(args[args.indexOf('--상한') + 1]) : null;

/** 장부 칸이 앉은 행을 «갈래별로» 센다 — 「0건」이 무엇의 0인지 갈리게. */
const 현황SQL = `
  select transcript_state as 상태,
         count(*)::int as 행,
         count(transcript)::int as 전사있음,
         count(stt_model)::int as 장부있음,
         count(stt_lang)::int as 언어있음
    from engine.submissions
   group by transcript_state
   order by 행 desc`;

async function main() {
  const { ref, sql, service_role: svc, 리허설이다 } = await 골격.열기('전사배치태우기', {});
  const base = `https://${ref}.supabase.co`;

  console.log(`[전사배치] 대상 ▸ ${ref} ${리허설이다 ? '(리허설)' : '🔴 (운영)'}`);

  const 전 = await sql(현황SQL);
  console.log('\n── 태우기 «전» ──');
  console.table(전);

  const [{ 대기 }] = await sql(
    "select count(*)::int as 대기 from engine.submissions where transcript_state = 'pending' and audio_ref is not null and transcript is null");
  console.log(`대기(오디오 있고 전사 없는 행) = ${대기}건`);

  if (!적용) {
    console.log('\n읽기만 했다 — 태우려면 `--적용` (벤더를 부르므로 돈이 든다).');
    return 0;
  }
  if (!대기) {
    console.log('\n태울 것이 없다 — 대기 0건이다. 「돌았는데 0」이 아니라 「집을 것이 없다」다.');
    return 0;
  }

  const 상한 = Math.min(25, Math.max(1, 상한인자 || 대기));
  console.log(`\n── 배치를 태운다 (limit=${상한}) ──`);
  const r = await fetch(`${base}/functions/v1/transcribe?limit=${상한}`, {
    method: 'POST',
    headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
  });
  const 봉투 = await r.json().catch(() => ({}));
  console.log(`HTTP ${r.status}`);
  console.log(JSON.stringify(봉투, null, 2));
  if (r.status !== 200) { console.error('배치가 안 돌았다 — 위 응답이 이유다.'); return 1; }

  /* 🔑 「돌았다」와 「행에 값이 있다」는 다른 사실이다 — 행을 직접 연다. */
  const 후 = await sql(현황SQL);
  console.log('\n── 태운 «뒤» ──');
  console.table(후);

  const 표본 = await sql(`
    select left(coalesce(transcript,''), 24) as 전사앞머리, stt_model, stt_lang, stt_confidence
      from engine.submissions
     where transcript is not null
     order by occurred_at desc
     limit 5`);
  console.log('\n── 최근 전사 행 다섯 ──');
  console.table(표본);

  const 채워짐 = 표본.filter((r) => r.stt_model).length;
  console.log(`\n판정: 최근 다섯 중 장부 칸이 «찬» 행 = ${채워짐}/${표본.length}`);
  if (!채워짐) {
    console.log('🔴 배치는 돌았는데 칸이 비었다 — UPDATE 가 그 칸에 안 닿는다. 그게 이 도구가 찾던 결함이다.');
    return 1;
  }
  console.log('✅ 칸이 찼다 — 전사와 «같은 UPDATE» 로 나간 것이 실물로 확인됐다.');
  return 0;
}

main().then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 2; });
