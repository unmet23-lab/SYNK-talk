/* 회차 장부 — cron 이 «무엇을 냈는지»를 남기는 배선의 회귀 (조용한 실패 장부 ④)
 *
 * ■ 이 절이 지키는 것 셋
 *   ① **본업 우선** — 장부 기입이 http_post 를 막으면 안 된다(순서·예외 격리).
 *   ② **어휘 일치** — 코드가 쓸 수 있는 outcome 과 CHECK 가 갈리면 런타임에 제약 위반으로 죽는다.
 *      그 죽음은 `ops.발사` 안이라 **cron 은 succeeded 로 보인다** — 정확히 이 장부가 없애려던 모양.
 *   ③ **등록층 사각** — 새 잡 `ops-harvest` 는 URL 이 없어 `조용한실패.test.js` 의 slug 추출에
 *      **안 잡힌다**. 잡이 늘었는데 아무 검사도 안 빨개지는 자리를 여기서 막는다.
 *
 * ⚠ 낱말이 파일 어딘가 있는지로 검사하지 않는다 — 같은 장부 ②의 회귀 초판이 그렇게 짜여
 *   변이 4 중 2 를 놓쳤다. 함수 몸통·CHECK 구역을 **떼어** 그 안에서만 본다.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.SYNK_TEST_SRC_ROOT || path.resolve(__dirname, '..');
const 마이그방 = path.join(ROOT, 'supabase', 'migrations');
const 조각이름 = '20260815080000_cron_ledger_c11.sql';
const SQL = fs.readFileSync(path.join(마이그방, 조각이름), 'utf8');

/** `$fn$ … $fn$` 로 감싼 함수 몸통 하나를 떼어 온다(파일 전문 grep 금지 · 맹점 ④). */
function 함수몸통(이름) {
  const 시작표식 = `create or replace function ops.${이름}(`;
  const i = SQL.indexOf(시작표식);
  assert.notEqual(i, -1, `ops.${이름} 정의를 못 찾았다 — 앵커가 낡으면 이 절이 무엇이든 통과시킨다`);
  const 여는 = SQL.indexOf('$fn$', i);
  const 닫는 = SQL.indexOf('$fn$', 여는 + 4);
  assert.ok(여는 !== -1 && 닫는 !== -1, `ops.${이름} 의 $fn$ 경계를 못 찾았다`);
  return SQL.slice(여는 + 4, 닫는);
}

/** 주석을 지운 몸통 — 「주석에 그 낱말이 있다」가 「코드가 그렇게 한다」로 읽히지 않게. */
const 코드만 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

// ── ① 본업 우선 ────────────────────────────────────────────────────────────

test('🔑 발사는 http_post 를 **먼저** 하고 장부는 그 뒤다 — 장부가 본업을 못 막는다', () => {
  const 몸통 = 코드만(함수몸통('발사'));
  const i호출 = 몸통.indexOf('net.http_post');
  const i기입 = 몸통.indexOf('insert into ops.cron_runs');
  assert.ok(i호출 !== -1, '발사가 net.http_post 를 안 부른다 — 이 함수의 본업이 사라졌다');
  assert.ok(i기입 !== -1, '발사가 장부에 아무것도 안 적는다');
  assert.ok(i호출 < i기입,
    '장부 기입이 http_post 보다 앞이다 — 장부가 터지면 cron 이 함수를 아예 못 부르게 된다');
});

test('🔑 장부 기입은 **자기 예외 블록** 안에 있다 — 기입 실패가 호출을 되돌리지 못한다', () => {
  const 몸통 = 코드만(함수몸통('발사'));
  const i기입 = 몸통.indexOf('insert into ops.cron_runs');
  /* 기입 «직전»에 begin 이 있고 «직후»에 exception 이 와야 안쪽 블록이다.
   * 바깥 handler 하나로 뭉치면, 기입 실패가 http_post 까지 롤백시킨다(서브트랜잭션). */
  const 앞 = 몸통.slice(0, i기입);
  const 뒤 = 몸통.slice(i기입);
  const i안쪽begin = 앞.lastIndexOf('begin');
  const i선언끝 = 앞.indexOf('begin');           // 함수 본체를 여는 첫 begin
  assert.ok(i안쪽begin > i선언끝,
    '장부 기입을 감싸는 안쪽 begin 이 없다 — 기입 실패가 http_post 를 되돌린다');
  assert.match(뒤.slice(0, 400), /exception\s+when\s+others/,
    '장부 기입 뒤에 자기 exception 핸들러가 없다');
});

test('🔴 발사 자체가 못 나간 경우를 «발사실패» 로 적는다 — 응답 표에 도달조차 못 하는 갈래', () => {
  /* 리허설 실측(08-15): radio 잡이 url NULL 로 16회 전부 죽었고 `net._http_response` 에는
   * 한 줄도 안 남았다. 그 갈래는 여기서만 잡힌다. */
  const 몸통 = 코드만(함수몸통('발사'));
  const 바깥 = 몸통.slice(몸통.lastIndexOf('exception'));
  assert.match(바깥, /insert into ops\.cron_runs/,
    '바깥 예외 핸들러가 장부에 아무것도 안 적는다 — 발사 실패가 통째로 사라진다');
  assert.match(바깥, /'발사실패'/, '바깥 핸들러가 «발사실패» 갈래를 안 적는다');
  assert.match(바깥, /sqlerrm/, '사유(sqlerrm)를 안 싣는다 — 「실패했다」만 알고 「왜」는 다시 모른다');
});

// ── ② 어휘 일치 ────────────────────────────────────────────────────────────

test('🔑 CHECK 어휘 = 코드가 실제로 쓰는 outcome 과 정확히 같다 (양쪽 다 검사한다)', () => {
  /* ⚠ `in` 과 `(` 사이는 **줄바꿈일 수 있다** — 값이 길면 그렇게 쓰게 된다. 공백 한 칸만 보면
   *   구역을 못 떼고, 못 떼면 위 「0개밖에 못 뽑았다」로 죽는다(초판이 정확히 그랬다).
   *   L0스키마.test.js 가 CHECK 정규식에서 배운 그 함정과 같은 계열이라 여기서도 \s* 로 받는다. */
  const 제약 = /constraint cron_runs_outcome_c11\s+check\s*\(\s*outcome\s+in\s*\(([\s\S]*?)\)/.exec(SQL);
  assert.ok(제약, 'outcome CHECK 제약 구역을 못 떼었다 — 앵커가 낡으면 이 절이 무엇이든 통과시킨다');
  const 허용 = new Set([...제약[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  assert.ok(허용.size >= 5, `CHECK 에서 값을 ${허용.size}개밖에 못 뽑았다 — 파싱이 낡았다`);

  /* 코드가 outcome 자리에 넣는 문자열 전량 — 발사·수확 두 몸통에서만 뽑는다. */
  const 쓰는것 = new Set();
  for (const 이름 of ['발사', '수확']) {
    const 몸통 = 코드만(함수몸통(이름));
    for (const m of 몸통.matchAll(/outcome\s*=\s*'([^']+)'/g)) 쓰는것.add(m[1]);           // update … set outcome = '…'
    for (const m of 몸통.matchAll(/then\s+'([^']+)'/g)) 쓰는것.add(m[1]);                  // case … then '…'
    for (const m of 몸통.matchAll(/else\s+'([^']+)'\s*\n?\s*end/g)) 쓰는것.add(m[1]);      // case … else '…' end
    for (const m of 몸통.matchAll(/values\s*\([^)]*?'(대기|발사실패)'/g)) 쓰는것.add(m[1]); // insert … values (…, '…')
  }
  assert.ok(쓰는것.size >= 5, `코드에서 outcome 값을 ${쓰는것.size}개밖에 못 뽑았다 — 파싱이 낡았다`);

  const 못들어감 = [...쓰는것].filter((v) => !허용.has(v));
  assert.deepEqual(못들어감, [],
    `코드가 쓰는 outcome 이 CHECK 에 없다: ${못들어감.join(', ')} — 런타임에 제약 위반으로 죽고, `
    + '그 죽음은 ops.발사 안이라 **cron 은 succeeded 로 보인다**(이 장부가 없애려던 그 모양).');
});

test('🔑 수확은 «대기» 만 건드린다 — 이미 판정된 행을 덮어쓰지 않는다', () => {
  const 몸통 = 코드만(함수몸통('수확'));
  const i첫update = 몸통.indexOf('update ops.cron_runs');
  const 첫구역 = 몸통.slice(i첫update, 몸통.indexOf(';', i첫update));
  assert.match(첫구역, /outcome\s*=\s*'대기'/,
    '수확이 «대기» 로 안 좁힌다 — 성공/실패로 이미 판정된 행을 다시 덮는다');
});

test('🔑 응답이 끝내 안 오면 «유실» 로 못박는다 — 대기가 영원히 대기로 남지 않는다', () => {
  const 몸통 = 코드만(함수몸통('수확'));
  const i유실 = 몸통.indexOf("'유실'");
  assert.notEqual(i유실, -1, '유실 갈래가 없다 — 응답 없는 발사가 영원히 «대기» 로 남는다');
  const 구역 = 몸통.slice(Math.max(0, i유실 - 200), i유실 + 400);
  assert.match(구역, /queued_at\s*<\s*now\(\)\s*-\s*interval/,
    '유실 판정에 시간 문턱이 없다 — 방금 쏜 것까지 유실로 적는다(거짓 경보)');
});

test('🔑 수확은 몇 건을 옮겼는지 돌려준다 — 0이 «없었다» 인지 «안 돌았다» 인지 갈린다', () => {
  const 몸통 = 코드만(함수몸통('수확'));
  assert.match(몸통, /get diagnostics/, '갱신 건수를 안 센다 — 수확이 0인 이유를 밖에서 못 가른다');
  assert.match(몸통, /jsonb_build_object\([^)]*'수확'/, '수확 건수를 반환값에 안 싣는다');
});

// ── ③ 등록층 — 잡이 늘면 여기서 드러난다 ──────────────────────────────────

/** 마이그레이션 전량에서 `cron.schedule('<이름>'` 의 잡 이름을 뽑는다(URL 유무와 무관). */
function 걸린잡이름들() {
  const 찾음 = new Set();
  for (const 이름 of fs.readdirSync(마이그방).filter((n) => n.endsWith('.sql'))) {
    const src = fs.readFileSync(path.join(마이그방, 이름), 'utf8');
    for (const m of src.matchAll(/cron\.schedule\s*\(\s*'([^']+)'/g)) 찾음.add(m[1]);
  }
  return [...찾음].sort();
}

test('🔴 등록층 사각 — URL 없는 cron 도 센다 (slug 추출은 이 잡을 원리상 못 본다)', () => {
  /* `tests/조용한실패.test.js` 는 `|| '/slug'` 로 cron 을 센다. `ops-harvest` 는 순수 SQL 이라
   * 거기 안 잡힌다 — 즉 그 회귀만으로는 **잡이 늘어도 아무것도 안 빨개진다**.
   * 이 검사가 그 분모를 따로 지고 있다. 새 잡을 걸면 여기서 한 번 답해야 한다. */
  const 아는잡 = [
    'deliver-check',          // → /deliver?점검
    'deliver-daily',          // → /deliver
    'ops-harvest',            // 순수 SQL — URL 없음(그래서 이 검사가 필요하다)
    'radio-promote-hourly',   // → /radio-promote
    'transcribe-batch',       // → /transcribe
  ];
  const 실제 = 걸린잡이름들();
  assert.ok(실제.length > 0, '잡을 하나도 못 뽑았다 — 0건은 통과가 아니라 뽑기가 죽은 것이다');
  assert.deepEqual(실제, 아는잡,
    `마이그레이션이 거는 잡 목록이 바뀌었다.\n  실제: ${실제.join(' · ')}\n  아는것: ${아는잡.join(' · ')}\n`
    + '  새 잡을 걸었으면 「그 잡의 실패는 어디에 남나」를 답하고 이 목록에 적어라.');
});

test('🔴 물려받은 판정 블록이 «내» 판을 단언한다 — 앞 조각 version 이 남으면 영원히 ❌ 를 낸다', () => {
  /* 마지막 조각은 앞 조각의 「확인 (한 번에)」 블록을 통째로 물려받는다(330줄). 그때 안에 박힌
   * `현재이력.version` 은 **앞 조각 것**이라, 안 고치면 내 판을 부은 뒤에도 판정이 ❌ 로 나온다.
   * 실측(08-15): 이 조각 초판이 정확히 그 상태였고, checksum 만 동기화돼 **두 파일이 서로는
   * 일치하는데 둘 다 틀린** 모양이었다 — 사본 대조 검사가 통과해 버리는 자리다. */
  const 판 = /migration_version constant text := '(\d{14})'/.exec(SQL);
  assert.ok(판, 'migration_version 을 못 읽었다');
  const 단언 = [...SQL.matchAll(/\(select version from 현재이력\)\s*=\s*'(\d{14})'/g)].map((m) => m[1]);
  assert.ok(단언.length >= 1, '판정 블록에서 version 단언을 못 찾았다 — 앵커가 낡았다');
  assert.deepEqual([...new Set(단언)], [판[1]],
    `판정 블록이 단언하는 version(${[...new Set(단언)].join(',')})이 이 조각(${판[1]})과 다르다 — `
    + '물려받은 블록의 앞 조각 값이 그대로 남았다(부으면 판정이 영원히 ❌ 다).');
});

test('🔑 수확 주기가 pg_net 보존(6시간)보다 촘촘하다 — 넘으면 결과가 먼저 사라진다', () => {
  const i = SQL.indexOf("cron.schedule('ops-harvest'");
  assert.notEqual(i, -1, 'ops-harvest 등록을 못 찾았다');
  const 주기 = /'(\*\/(\d+) \* \* \* \*)'/.exec(SQL.slice(i, i + 200));
  assert.ok(주기, 'ops-harvest 주기가 «N분마다» 꼴이 아니다 — 보존 창과 못 비교한다');
  const 분 = Number(주기[2]);
  assert.ok(분 > 0 && 분 <= 60,
    `수확 주기가 ${분}분이다 — pg_net.ttl 6시간(실측) 안에 여러 번 돌아야 결과를 놓치지 않는다`);
});

// ── ④ 안전 — 리허설 정책·권한 ─────────────────────────────────────────────

test('⛔ 잡을 «새로» 만들지 않는다 — 이미 걸린 게 0이면 스케줄 구역을 통째로 건너뛴다', () => {
  /* 두 옛 cron 조각은 「리허설엔 일부러 안 붓는다」를 정책으로 적어 뒀다(옆 세션 왕복시험 보호).
   * 이 조각이 그 정책을 조용히 깨면, 리허설에 스케줄러가 돌기 시작하고 아무도 그걸 안 본다. */
  const i센다 = SQL.indexOf('select count(*) into 걸린잡수');
  const i분기 = SQL.indexOf('if 걸린잡수 = 0 then');
  const i첫등록 = SQL.indexOf("cron.schedule('deliver-daily'");
  assert.ok(i센다 !== -1 && i분기 !== -1, '걸린 잡 수를 세는 가드가 없다 — 리허설에 잡이 새로 생긴다');
  assert.ok(i센다 < i분기 && i분기 < i첫등록, '가드가 등록보다 뒤에 있다 — 순서상 아무것도 못 막는다');
});

test('🔒 장부 표는 닫힌 채로 태어난다 — RLS 켜짐 · 정책 0 · anon/authenticated 회수', () => {
  const 구역 = SQL.slice(SQL.indexOf('create table if not exists ops.cron_runs'),
                        SQL.indexOf('create or replace function ops.발사'));
  assert.match(구역, /alter table ops\.cron_runs enable row level security/,
    '새 표에 RLS 를 안 켰다 — 운영 관측치가 토큰에게 열릴 수 있다');
  assert.match(구역, /revoke all on schema ops from anon, authenticated/, 'ops 스키마 권한을 안 회수했다');
  assert.match(구역, /revoke all on ops\.cron_runs from anon, authenticated/, '표 권한을 안 회수했다');
  assert.doesNotMatch(구역, /create policy/,
    '정책을 만들었다 — 이 표는 service_role 만 보는 것이 설계다(정책 0 이 곧 그 뜻)');
});

test('🔑 URL 조립을 잡 몸통에 그대로 둔다 — 함수 안으로 감추면 옆 회귀의 분모가 조용히 낡는다', () => {
  /* `tests/조용한실패.test.js` 가 마이그레이션의 `|| '/slug'` 에서 cron 함수 목록을 뽑는다.
   * 이 조각이 URL 을 ops.발사 안으로 옮기면 그 목록이 **옛 조각 것만** 남아 낡은 채 초록이 된다. */
  const slug = [...SQL.matchAll(/\|\|\s*'\/([a-z][a-z0-9-]*)/g)].map((m) => m[1]).sort();
  /* 🔴 **집합이 아니라 건수로 본다** — 변이 시험에서 이 검사가 유일하게 뚫렸다(08-15):
   *   `deliver` 는 잡이 둘(daily·check)이라, 한쪽의 URL 조립을 함수 안으로 감춰도
   *   distinct 집합은 그대로였다. 「하나가 사라졌다」와 「종류가 사라졌다」는 다른 사실이다. */
  assert.deepEqual(slug, ['deliver', 'deliver', 'radio-promote', 'transcribe'],
    `잡 몸통의 URL 조립이 바뀌었다(건수 포함) — 옆 회귀(조용한실패)가 세는 분모가 여기서 갈린다.\n`
    + `  실제: ${slug.join(' · ')}`);
});
