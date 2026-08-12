'use strict';
/* 왕복골격 — 왕복시험 5종이 5벌로 복사해 들던 머리를 한 통로로 (2026-08-09).
 *
 * ■ 왜 — 같은 머리(환경 → 과녁 → 리허설 게이트 → 배포판 게이트 → 키 → 판정)가 5벌 복사돼
 *   이미 3갈래로 갈라져 있었다: `--운영승인` 탈출구가 1곳에만 있었고, 판정 시그니처가 3종이었다.
 *   갈라진 골격은 다음 수리가 몇 곳에만 적용되는 사고를 예약한다 — `lib/자격증명.js` 가
 *   env 읽기 6벌을 모은 것과 같은 이유다: **빠뜨린 곳은 「통과」로 보인다.**
 * ■ 옛 통로 금지 — `tests/왕복골격.test.js` 가 왕복도구 안의 골격 복제(관리 API 리터럴·토큰
 *   직접 읽기·리허설 정규식·키 fetch·게이트 직접 호출)를 적색으로 만든다.
 */
const 자격증명 = require('./자격증명.js');

const API = 'https://api.supabase.com/v1/projects';

/**
 * 왕복시험의 공통 머리. 반환된 손잡이만으로 시나리오가 돈다.
 * @param {string} 도구 표시 이름 — 자격증명·배포판 게이트에 그대로 전달된다
 * @param {object} [opt]
 * @param {boolean} [opt.운영승인가능] `--운영승인` 으로 리허설 게이트를 뚫을 수 있는가(왕복시험뿐)
 * @param {boolean} [opt.키] api-keys 를 가져올 것인가(교정왕복시험은 함수를 안 불러 필요 없다)
 * @param {string} [opt.사유] 리허설 거부문에 넣을 이 시험의 위험(기본: 지울 수 없는 행)
 * @param {string[]} [opt.함수목록] 배포판 게이트를 이 함수들로 한정한다(기본: 전 함수).
 *        시험과 무관한 함수의 낡음이 시험을 막지 않게 하는 손잡이다 — ⚠ 시험이 부르는
 *        함수보다 좁으면 게이트가 옛 판을 초록으로 재므로(새는 방향은 통과), 스코프를 쓰는
 *        도구는 「부르는 함수 ⊆ 목록」 회귀를 같이 둔다(`tests/왕복골격.test.js`).
 */
async function 열기(도구, { 운영승인가능 = false, 키 = true, 사유 = '이 시험은 지울 수 없는 행을 남긴다', 함수목록 = null } = {}) {
  const die = (m) => { console.error(`[${도구}] ${m}`); process.exit(1); };

  const e = 자격증명.읽기(도구);
  const 토큰 = e.SUPABASE_ACCESS_TOKEN, ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다');
  const M = { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' };

  const pr = await fetch(`${API}/${ref}`, { headers: M });
  const 이름 = pr.ok ? (JSON.parse(await pr.text()).name || '(모름)') : '(모름)';
  console.log(`[${도구}] 대상 ▸ ${이름}  (${ref})\n`);
  const 리허설이다 = /rehearsal/i.test(이름);
  if (!리허설이다 && !(운영승인가능 && process.argv.includes('--운영승인'))) {
    die(`「${이름}」 은 리허설이 아니다 — ${사유}.`
      + (운영승인가능 ? '\n     유호님 승인 뒤에만: --운영승인' : ''));
  }
  // 발화점 — 배포판 ≠ 소스(HEAD)면 이 왕복의 초록은 옛 판을 잰 것이다(다르면 여기서 죽는다).
  await require('../tools/배포대조.js').왕복전게이트(도구, e, 함수목록 ? { 목록: 함수목록 } : {});

  /* Management API 로 SQL. 거절도 결과라(교정왕복의 절반) 던지지 않는 `실행` 이 바닥이고,
   * 대부분의 자리는 실패가 곧 시험 파손이라 던지는 `sql` 을 쓴다. */
  const 실행 = async (q) => {
    const r = await fetch(`${API}/${ref}/database/query`, { method: 'POST', headers: M, body: JSON.stringify({ query: q }) });
    const t = await r.text();
    return r.ok ? { ok: true, 행: JSON.parse(t) } : { ok: false, status: r.status, 메시지: t };
  };
  const sql = async (q) => {
    const r = await 실행(q);
    if (!r.ok) throw new Error(`SQL HTTP ${r.status} ${r.메시지.slice(0, 400)}\n  질의: ${q.slice(0, 200)}`);
    return r.행;
  };

  let anon = null, service_role = null;
  if (키) {
    const kr = await fetch(`${API}/${ref}/api-keys`, { headers: M });
    if (!kr.ok) die(`api-keys HTTP ${kr.status}`);
    const 키들 = JSON.parse(await kr.text());
    anon = (키들.find((k) => k.name === 'anon') || {}).api_key;
    service_role = (키들.find((k) => k.name === 'service_role') || {}).api_key;
    if (!anon || !service_role) die('anon·service_role 키를 못 찾았다');
  }

  let 통과 = 0, 실패 = 0;
  /** 세고 계속 간다 — 독립 검사들의 기본형. 판정을 되돌려 주므로 갈래 차단에 쓸 수 있다. */
  const 확인 = (이름_, 조건, 실제) => {
    if (조건) { 통과++; console.log(`  ✅ ${이름_}`); }
    else { 실패++; console.log(`  ❌ ${이름_}\n     실제: ${JSON.stringify(실제)}`); }
    return !!조건;
  };
  /** 첫 실패에서 멈춘다 — 뒤 단계가 앞 결과 위에 서는 시험(인증왕복)용.
   *  계속 가면 다음 ❌ 전부가 첫 것의 메아리라 원인이 숫자에 묻힌다. */
  const 치명확인 = (이름_, 조건) => {
    if (조건) { 통과++; console.log(`  ✅ ${이름_}`); }
    else die(`❌ ${이름_}`);
    return true;
  };
  /** 분모와 함께 끝낸다 — 초록은 분모와 함께만 읽는다(F207). */
  const 보고 = (꼬리) => {
    console.log(`\n[${도구}] ${통과}/${통과 + 실패} 통과${꼬리 ? ` · ${꼬리}` : ''}`);
    process.exit(실패 ? 1 : 0);
  };

  return { e, ref, 이름, 리허설이다, M, sql, 실행, anon, service_role, 확인, 치명확인, 보고 };
}

module.exports = { 열기 };
