'use strict';
/* 마이그레이션 조각의 **블록 주석이 닫히는가** — 안 닫히면 DB 가 파일을 통째로 삼킨다.
 *
 * 🔴 실사건 (2026-08-12). `season_c11`·`season_review_c11` 두 조각이 리허설에 부어지지 않았다.
 *   원인은 스키마도 권한도 아니고 **주석 안의 두 글자**였다 — 「생산자 = `functions/teach` 의
 *   `compass/…` 두 경로」에서 그 꼬리를 슬래시+별표로 적었고, **Postgres 블록 주석은 중첩되므로**
 *   그것이 새 주석을 열어 파일 끝까지 닫히지 않았다. 증상은 `42601: unterminated comment`,
 *   즉 **파싱조차 안 됐다.** 두 조각은 저장소에 「✅종결」로 커밋돼 있었고 회귀 1518개가 초록이었다 —
 *   아무도 그 SQL 을 **실제 파서에 먹여본 적이 없었기 때문**이다(F371 계열: 장부와 배관이 갈렸는데
 *   둘이 같은 모양이다).
 *
 * 🔑 왜 `grep` 으로 개수를 세면 안 되나 — 실측으로 거짓양성이 나왔다. `cron_c10` 은 «닫는 글자»가
 *   하나 많은데 **정상이고 이미 두 DB 에 앉아 있다**(그 글자가 줄주석 안에 있다). 여는 쪽만 세도
 *   같은 문제가 반대로 난다. 그래서 이 검사는 Postgres 가 실제로 하는 일을 따라한다:
 *   줄주석(`--`)·문자열(`'…'`)·달러 인용(`$tag$…$tag$`) 안은 주석이 아니고, **주석 안에서는
 *   그 셋이 전부 무의미하다**(주석은 주석끼리만 중첩된다).
 *
 * ⚠ 이 검사는 「닫히는가」만 본다 — SQL 이 옳은지는 안 본다. 그건 이 층이 질 수 없는 것이고,
 *   여기서 재는 것은 **파서에 닿기도 전에 죽는 한 가지 방식**이다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS = path.join(__dirname, '..', 'supabase', 'migrations');

/**
 * Postgres 규칙대로 블록 주석 깊이를 센다. 0 이면 전부 닫힌 것이다.
 * @param {string} sql
 * @returns {{깊이: number, 마지막연자리: number}}  마지막연자리 = 안 닫힌 주석이 열린 offset(-1=없음)
 */
function 주석깊이(sql) {
  let 깊이 = 0;
  let 마지막연자리 = -1;
  const 연스택 = [];

  for (let i = 0; i < sql.length; i += 1) {
    /* 주석 «안» — 여기서는 문자열도 줄주석도 없다. 주석끼리만 중첩된다. */
    if (깊이 > 0) {
      if (sql.startsWith('/*', i)) { 깊이 += 1; 연스택.push(i); i += 1; continue; }
      if (sql.startsWith('*/', i)) { 깊이 -= 1; 연스택.pop(); i += 1; continue; }
      continue;
    }

    /* 주석 «밖» — 주석을 여는 글자를 삼켜버리는 셋을 먼저 건너뛴다. */
    if (sql.startsWith('--', i)) {                       // 줄주석: 개행까지
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (sql[i] === "'") {                                // 문자열: '' 는 이스케이프라 이어진다
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") break;
        i += 1;
      }
      continue;
    }
    const 달러 = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));    // 달러 인용: $migration$ … $migration$
    if (달러) {
      const 태그 = 달러[0];
      const 끝 = sql.indexOf(태그, i + 태그.length);
      i = 끝 === -1 ? sql.length : 끝 + 태그.length - 1;
      continue;
    }
    if (sql.startsWith('/*', i)) { 깊이 += 1; 연스택.push(i); i += 1; continue; }
  }

  if (연스택.length) 마지막연자리 = 연스택[0];
  return { 깊이, 마지막연자리 };
}

/** offset 을 사람이 찾아갈 수 있는 「줄 번호 + 그 줄」로 바꾼다 — 처방이 없는 적색은 안 고쳐진다. */
function 자리설명(sql, offset) {
  if (offset < 0) return '';
  const 앞 = sql.slice(0, offset);
  const 줄번호 = 앞.split('\n').length;
  const 줄 = sql.slice(offset - (offset - (앞.lastIndexOf('\n') + 1)), sql.indexOf('\n', offset));
  return ` — ${줄번호}번째 줄에서 열렸다: ${줄.trim().slice(0, 90)}`;
}

test('탐지력 픽스처 — 안 닫힌 블록 주석을 반드시 잡는다', () => {
  assert.equal(주석깊이('/* 정상 */ select 1;').깊이, 0);
  assert.equal(주석깊이('select 1;').깊이, 0);

  /* 🔴 실사건 그 모양 — 주석 «안»의 슬래시+별표가 새 주석을 연다. */
  assert.equal(주석깊이('/* 생산자 = `compass/*` 두 경로 */ select 1;').깊이, 1,
    '실제로 두 조각을 죽인 모양을 못 잡으면 이 검사는 없는 것과 같다');

  /* Postgres 는 주석을 **중첩**한다 — 짝만 맞으면 정상이다(C 와 다르다). */
  assert.equal(주석깊이('/* 바깥 /* 안쪽 */ 다시 바깥 */ select 1;').깊이, 0);
  assert.equal(주석깊이('/* 하나 더 열림 /* */').깊이, 1);
});

test('탐지력 픽스처 — 주석이 아닌 자리의 글자를 세면 거짓양성이다', () => {
  /* 🔑 실측으로 나온 거짓양성 셋. 이걸 못 거르면 멀쩡한 조각이 빨개지고, 그런 가드는 곧 꺼진다. */
  assert.equal(주석깊이("-- 줄주석 안의 */ 와 /* 는 주석이 아니다\nselect 1;").깊이, 0,
    'cron_c10 이 실제로 이 모양이다(닫힘이 하나 많은데 정상)');
  assert.equal(주석깊이("select '/*' as t;").깊이, 0, '문자열 안');
  assert.equal(주석깊이("select 'it''s /*' as t;").깊이, 0, "'' 이스케이프를 넘어야 한다");
  assert.equal(주석깊이('do $migration$ begin /* 안 */ end $migration$;').깊이, 0, '달러 인용 안');
  assert.equal(주석깊이('do $migration$ /* $migration$; select 1;').깊이, 0,
    '달러 인용 «안»의 여는 글자는 주석이 아니다');
});

test('실저장소 — 마이그레이션 조각은 전부 블록 주석이 닫힌다', () => {
  const 조각들 = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const 깨진것 = [];
  for (const 이름 of 조각들) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, 이름), 'utf8');
    const { 깊이, 마지막연자리 } = 주석깊이(sql);
    if (깊이 !== 0) 깨진것.push(`${이름}: 깊이 ${깊이}${자리설명(sql, 마지막연자리)}`);
  }
  // 🔴 분모부터 밝힌다 — 0건을 잰 것과 통과는 같은 모양이다(F207).
  assert.ok(조각들.length >= 25, `조각을 ${조각들.length}개만 읽었다 — 디렉터리를 못 읽었을 수 있다`);
  assert.deepEqual(깨진것, [],
    `블록 주석이 안 닫힌 조각이 있다(DB 가 42601 로 거부한다):\n  ${깨진것.join('\n  ')}`);
});

test('실저장소 — 합본도 닫힌다 (조각은 멀쩡한데 이음에서 깨지는 자리가 있다)', () => {
  /* 🔑 조각을 이어붙인 합본이 실제로 부어지는 물건이다. 조각 하나하나가 0 이어도 이음이
   *   깨질 수 있으므로(누가 조각 꼬리의 닫는 글자를 지우면) 여기서 한 번 더 잰다. */
  const 합본 = path.join(__dirname, '..', 'supabase', 'L0_스키마.sql');
  if (!fs.existsSync(합본)) return;   // 아직 안 만들었으면 이 검사 밖 — 없는 것을 fail 로 적지 않는다
  const sql = fs.readFileSync(합본, 'utf8');
  const { 깊이, 마지막연자리 } = 주석깊이(sql);
  assert.equal(깊이, 0, `L0 합본의 블록 주석이 안 닫힌다${자리설명(sql, 마지막연자리)}`);
});
