#!/usr/bin/env node
'use strict';
/**
 * 교정1건왕복 — #Q83 ② : `?limit=1` 로 **딱 한 건**을 벤더까지 왕복시켜
 * 「벤더가 우리 배치를 받아 준다」를 증명한다.
 *
 *   SUPABASE_PROJECT_REF=<리허설ref> node tools/교정1건왕복.js          ← 조준만(0원)
 *   SUPABASE_PROJECT_REF=<리허설ref> node tools/교정1건왕복.js --발사    ← 실제 제출(≈5원)
 *
 * ■ 왜 도구가 새로 필요한가
 *   기존 왕복 5종은 **일부러** 이 함수를 안 부른다 — 그 호출 자체가 벤더 유료 경로다(F452).
 *   그래서 「규격을 지켰나」(소스 대조·0원)까지는 `368603a` 가 이미 증명했고, 남은
 *   「벤더가 실제로 받아 주나」는 왕복으로만 열린다. 유호님 승인 2026-08-17 「5원 왕복 승인할게」.
 *
 * ■ 🔴 이 도구가 지키는 두 가지 — 둘 다 «새는 방향이 통과»라 기계로 막는다
 *   ① **한 건을 넘지 않는다.** `배치기본` 이 100 이라 `limit` 을 안 붙이면 대기 전량이 나간다
 *      (`correct/index.ts:102`). 그래서 쿼리를 손으로 안 적고 여기서 조립하며, 발사 «전»에
 *      DB 에서 분모를 세어 「몇 건이 기다리는데 몇 건을 보낼 것인가」를 눈에 보이게 찍는다.
 *      승인은 행위에 대한 것이지 조준이 아니다 — 조준은 발사 직전에 다시 읽는다.
 *   ② **기본이 «안 쏨»이다.** `--발사` 가 없으면 과녁·게이트·분모까지만 재고 멈춘다.
 *      되돌릴 수 없는 지출을 기본값으로 두지 않는다.
 *
 * ■ 리허설 전용 — 골격이 프로젝트 이름에 `rehearsal` 이 없으면 거부한다(`운영승인가능:false`
 *   라 탈출구 자체가 없다). 배포판 게이트는 `correct` 하나로 좁힌다 — 남의 트랙(라디오·오늘과제)
 *   낡음이 이 왕복을 막지 않게 하되, 이 도구가 부르는 함수는 정확히 그 하나다.
 */
const 골격 = require('../lib/왕복골격.js');

const 한건 = 1;

async function main() {
  const { ref, 이름, sql, service_role, 확인, 치명확인, 보고 } = await 골격.열기('교정1건왕복', {
    키: true,
    운영승인가능: false,
    사유: '이 호출은 벤더에 **유료 제출**을 낸다(되돌릴 수 없다)',
    함수목록: ['correct'],
  });
  const base = `https://${ref}.supabase.co`;
  const 발사 = process.argv.includes('--발사');
  const 회수모드 = process.argv.includes('--회수');

  /* 벤더 자격은 **한 곳에서** 만든다 — `correct` 는 앞단에서 anon 을 401 로 거절한다
   * (`correct/index.ts` 인증 게이트 · 2026-08-17 실측: 「service_role 만 부를 수 있습니다」로
   * 튕겨 **벤더에 닿지도 않는다**). cron 이 도는 자격도 그것이라 과녁이 맞다. */
  const 부르기 = async (질의) => {
    const r = await fetch(`${base}/functions/v1/correct?${질의}`, {
      method: 'POST',
      headers: {
        apikey: service_role, Authorization: `Bearer ${service_role}`,
        'Content-Type': 'application/json',
      },
    });
    const 원문 = await r.text();
    let 몸 = {};
    try { 몸 = JSON.parse(원문 || '{}'); } catch { 몸 = { 원문: 원문.slice(0, 400) }; }
    return { status: r.status, 몸 };
  };

  /* ── ⓪ 분모 — 몇 건이 기다리는가 ─────────────────────────────────
   * 술어를 여기 다시 적지 않는다(사본을 만들면 사본끼리 대조하고 「맞다」고 하게 된다).
   * 생산자가 쓰는 `대기조건()` 원문을 소스에서 꺼내 그대로 태운다 — 반피드백왕복시험의 선례. */
  const 소스경로 = require('path').join(__dirname, '..', 'supabase', 'functions', 'correct', 'index.ts');
  const 생산자소스 = require('fs').readFileSync(소스경로, 'utf8');
  const 뽑음 = 생산자소스.match(/const 대기조건 = \(\) => sql`([\s\S]*?)`;/);
  치명확인('생산자 소스에서 `대기조건` 원문을 꺼냈다', !!뽑음);
  const 술어 = 뽑음[1];
  /* 값 끼움이 생기면 이 추출은 **깨진 SQL** 을 만든다 — 조용히 0을 내는 대신 여기서 죽는다. */
  치명확인('원문에 값 끼움이 없다 — 그대로 태울 수 있다', !술어.includes('${'));
  const [행] = await sql(`select count(*)::int as c ${술어}`);
  const 대기수 = Number(행.c);
  console.log(`■ ⓪ 분모 — 대기 ${대기수}건 (생산자 술어 원문 · 벤더 미호출 · 0원)`);
  확인('대기가 1건 이상이다 — 0이면 이 왕복은 아무것도 증명 못 한다', 대기수 >= 1, { 대기수 });

  /* ── ① 조준 재대조 — 무엇이 나갈 것인가 ───────────────────────── */
  const 과녁 = `${base}/functions/v1/correct?limit=${한건}`;
  console.log(`\n■ ① 조준\n  대상 프로젝트 : ${이름} (${ref})\n  URL           : ${과녁}\n`
    + `  보낼 건수     : ${한건} / 대기 ${대기수}  ← limit 을 빼면 ${대기수 > 100 ? 100 : 대기수}건이 나간다(배치기본=100)\n`
    + `  범위 밖       : 396건 일괄은 **별도 승인**이라 이 도구엔 통로가 없다`);

  /* ── ①-b 회수만 (`--회수` · 0원) ────────────────────────────────
   * 이미 값을 치른 배치의 결과만 걷고 **새 배치는 안 낸다**(`?회수=1` · 함수 v30 · 08-17).
   * 여기가 «단가»를 보는 유일한 공짜 자리다 — 이 문이 없던 동안은 사용량을 보러 부르는 것이
   * 곧 또 한 벌의 제출이었다(F452 와 같은 축). */
  if (회수모드) {
    console.log('\n■ ①-b 회수만 — POST ?회수=1 (걷기만 · 새 배치 0 · 0원)');
    const { status, 몸 } = await 부르기('회수=1');
    console.log(`  HTTP ${status}\n  봉투: ${JSON.stringify(몸, null, 2)}`);
    확인('HTTP 200', status === 200, { status });
    /* 🔴 갈래 이름을 확인한다 — 이 문이 «없는» 판(v29 이하)에 대고 부르면 `회수=1` 은 그냥
     *   무시되고 **정상 배치 회차가 돌아 새 제출이 나간다**. 그때도 HTTP 는 200 이라, 이름을
     *   안 보면 「공짜로 걷었다」와 「돈 내고 또 냈다」가 화면에서 같은 모양이다. */
    확인("`이유: '회수만'` — 걷기만 한 회차다(이게 없으면 새 제출이 나갔다는 뜻)",
      몸.이유 === '회수만', { 이유: 몸.이유 ?? null, 제출: 몸.제출 ?? null, 배치id: 몸.배치id ?? null });
    console.log(`  ▸ 회수=${JSON.stringify(몸.회수 ?? null)}\n  ▸ 캐시(사용량)=${JSON.stringify(몸.캐시 ?? null)}`);
    보고('회수만 · 0원');
    return;
  }

  if (!발사) {
    console.log('\n[교정1건왕복] 조준만 하고 멈췄다 — 쏘려면 `--발사`(≈5원) · 걷기만 하려면 `--회수`(0원).');
    보고('조준만');
    return;
  }

  /* ── ② 발사 ──────────────────────────────────────────────────── */
  console.log('\n■ ② 발사 — POST (되돌릴 수 없다)');
  const { status, 몸 } = await 부르기(`limit=${한건}`);
  console.log(`  HTTP ${status}\n  봉투: ${JSON.stringify(몸, null, 2)}`);
  const r = { status };

  /* ── ③ 판정 ──────────────────────────────────────────────────────
   * 🔴 `HTTP 200` 은 판정이 아니다 — 이 결함의 정체가 바로 「200 얼굴로 0건」이었다.
   *   봉투 안의 `이유` 와 배치 수를 본다. */
  console.log('\n■ ③ 판정');
  /* 🔴 **봉투가 없으면 아래 둘은 «판정할 수 없다» — 「아니다」가 아니다.**
   *   첫 실사격(2026-08-17 · anon 401)에서 이 자리가 정확히 새로 나갔다: 몸통이 `{error:…}`
   *   라 `이유` 가 undefined 였고, `!== 'batch_submit_failed'` 가 **참**이 되어 「벤더가 몸통을
   *   받았다 ✅」를 찍었다 — 벤더에 닿지도 않았는데. 가드가 「통과」 쪽으로 샌 자리라(맹점 ④)
   *   분모를 먼저 세우고, 못 잰 것은 못 쟀다고 적는다. */
  const 봉투왔나 = r.status === 200 && Object.prototype.hasOwnProperty.call(몸, '대기');
  확인('HTTP 200 + 생산자 봉투가 왔다 — 아래 판정의 분모다', 봉투왔나,
    { status: r.status, 몸: JSON.stringify(몸).slice(0, 200) });
  const 이유 = 몸.이유 ?? null;
  if (!봉투왔나) {
    console.log('  ⏭ 벤더 판정 2건 — **못 쟀다**(봉투가 없다). 「통과」로 세지 않는다.');
  } else {
    확인('`batch_submit_failed` 가 아니다 — 벤더가 몸통을 받았다', 이유 !== 'batch_submit_failed',
      { 이유, 벤더사유: 몸.벤더사유 ?? null });
    확인('`batch_key_invalid` 가 아니다 — custom_id 규격 통과(368603a 의 처방)', 이유 !== 'batch_key_invalid',
      { 이유, 벤더사유: 몸.벤더사유 ?? null });
  }
  const 낸배치 = 몸.낸배치 ?? 몸.제출 ?? (몸.회수 && 몸.회수.배치) ?? null;
  console.log(`  ▸ 이유=${JSON.stringify(이유)} · 낸배치=${JSON.stringify(낸배치)} · 회수=${JSON.stringify(몸.회수 ?? null)}`);
  보고(`대기 ${대기수} 중 ${한건}건 제출 시도`);
}

main().catch((e) => { console.error('[교정1건왕복] ' + (e && e.stack || e)); process.exit(1); });
