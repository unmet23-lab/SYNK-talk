#!/usr/bin/env node
/* 원격SQL — Supabase Management API 로 SQL 을 원격 실행한다.
 *
 * 왜 있나 (유호님 지시 2026-08-06 「전부 원격으로 해줘」):
 *   발주 §6 은 「A = 유호님이 SQL Editor 에 붙여넣고 Run」으로 확정돼 있었고, 그 대가가
 *   **유호님 손 4회**(확인 Run → 본체 붙여넣기 → 확인 Run → RLS 재확인)였다.
 *   이 도구는 그 4회를 **1회(액세스 토큰 1개 발급)**로 줄인다 — 한 번 넣으면 그 뒤의
 *   확인·적용·재확인이 전부 원격에서 돈다. 유호님 PC 에는 아무것도 설치하지 않는다
 *   (발주 §3-1 ③ 이 금지한 것은 「유호님께」 CLI·Docker 를 요구하는 것이고, 이건 AI 쪽 도구다).
 *
 * 자격증명은 `.env` 에만 산다 — `.gitignore` 의 `.env.*` 가 막는다. 인자로 받지 않고
 * (셸 이력에 남는다) stdout·에러에도 찍지 않는다.
 *
 * ⚠ 그런데 **범위는 못 좁힌다** — Supabase 개인 액세스 토큰에 스코프가 없어 계정 전체에 닿는다.
 *   L0 메모리가 「AI 불가」로 못박은 DB 비밀번호보다 오히려 **넓다**. 숨기지 않고 안내문에 적어
 *   유호님이 알고 고르게 하고, 권한 대신 **시간으로 가둔다**(작업이 끝나면 폐기 요청).
 *   지금 프로젝트가 하나뿐이라 실질 범위가 하나인 것이지, 설계가 좁은 게 아니다.
 *
 * 안전 — 이 도구의 존재 이유이자 그 자체가 위험이다:
 *   · 기본은 **읽기 전용**. 쓰기(DDL·DML)로 판정되면 `--적용` 없이 거부한다.
 *   · 판정이 애매하면 **쓰기로 본다**. 「애매하면 통과」하는 가드는 가드가 아니다.
 *   · `--적용` 은 비가역이다. 유호님 명시 승인 뒤에만 붙인다.
 *
 * 사용:
 *   node tools/원격SQL.js supabase/확인_적용전상태.sql        # 읽기 — 그대로 실행
 *   node tools/원격SQL.js supabase/L0_스키마.sql --적용        # 쓰기 — 명시 승인 필요
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API = 'https://api.supabase.com/v1/projects';

const 자격증명 = require('../lib/자격증명.js');   // .env 읽기 + 토큰 만료 게이트(공용 통로)

/* 주석 안의 단어가 판정을 흔들지 않게 먼저 지운다 — 실제 SQL 에 `-- 학생=자기 행 insert` 같은
 * 설명이 있고, 그걸 그대로 세면 읽기 쿼리가 영원히 쓰기로 잡힌다. */
const 주석제거 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
/* ⚠ `into`·`copy` 가 목록에 있는 이유 — **`select` 로 시작하는데 쓰는** 두 형태다.
 *   · `select * into 새표 from auth.users`  → Postgres 에서 **테이블을 만든다**
 *   · `copy engine.learners from '...'`      → **데이터를 넣는다**
 *   둘 다 `create`·`insert` 가 한 글자도 없어서 옛 목록을 그냥 통과했다(2026-08-06 실측:
 *   「읽기로 판정」). 즉 **승인 없이 나가는 쓰기**였다 — 이 도구가 막겠다고 한 바로 그것이다.
 *   거짓양성(문자열 안의 into 등)은 「막힘」 방향이라 안전하다 — 애매하면 쓰기로 본다. */
const 쓰기어 = /\b(create|alter|drop|insert|update|delete|truncate|grant|revoke|do|call|vacuum|reindex|refresh|into|copy|comment\s+on|security\s+label)\b/i;

/* 홑따옴표 안의 **한 낱말짜리** 리터럴만 지운다 — `'INSERT'`·`'TRUNCATE'` 는 SQL 문장이 아니라
 * **권한 이름**이다. 실측 2026-08-06: `확인_적용후상태.sql` 이 「anon·authenticated 에 권한이 0인가」를
 * 재려고 권한 이름 7개를 나열하는데, 그 때문에 **쓰기가 없는지 확인하는 쿼리가 쓰기로 잡혔다.**
 * 그러면 검증을 돌리는 유일한 길이 `--적용` 이 되고, 그건 승인 플래그를 습관으로 만든다(F103 계열 —
 * 따를 수 없는 처방은 우회를 정상 통로로 만든다).
 * ⚠ **여러 낱말 리터럴은 그대로 둔다** — 동적 SQL(`'insert into ...'`)이 거기 숨는다.
 *   `''` 이스케이프도 한 낱말 규칙 밖이라 안 지워진다. */
const 권한이름제거 = (s) => s.replace(/'[A-Za-z_]+'/g, ' ');

/** 읽기 전용인가 — **애매하면 false**(쓰기로 본다). */
function 읽기전용(sql) {
  return !쓰기어.test(권한이름제거(주석제거(sql)));
}

const die = (msg) => { console.error('[원격SQL] ' + msg); process.exit(1); };

/** 자격증명이 없을 때 — 유호님이 그대로 밟을 수 있는 클릭 절차만 낸다. */
function 안내() {
  console.error(`[원격SQL] 아직 원격으로 못 돕니다 — .env 에 값 2개가 필요합니다.

유호님 손 1회 (약 2분 · 설치할 것 없음):
  1. https://supabase.com/dashboard/account/tokens 를 엽니다
  2. [Generate new token] → 이름에 아무거나(예: claude-remote) → [Generate token]
  3. 나오는 \`sbp_\` 로 시작하는 값을 복사합니다 (창을 닫으면 다시 못 봅니다)
  4. Supabase 에서 「synk talk」 프로젝트를 열고, 주소창의 \`/project/\` 뒤 문자열을 복사합니다
  5. ${path.join(ROOT, '.env')} 파일에 아래 두 줄을 붙여넣고 저장합니다

     SUPABASE_ACCESS_TOKEN=sbp_붙여넣기
     SUPABASE_PROJECT_REF=주소창에서_복사한_문자열

이 파일은 .gitignore 가 막아 git 에 올라가지 않습니다.
그 뒤로는 확인·적용·재확인이 전부 원격에서 돕니다.

🔴 이 토큰의 범위를 알고 주십시오 — 좁힐 수단이 Supabase 쪽에 없습니다:
   · 계정 전체 권한입니다. 지금 계정에는 프로젝트가 **둘**이고(운영 Synk Core · 리허설),
     같은 토큰이 **둘 다**에 닿습니다 — 삭제까지 됩니다.
   · 그래서 권한이 아니라 시간으로 가둡니다. 이건 이제 부탁이 아니라 **장치**입니다 —
     \`.env\` 의 SUPABASE_TOKEN_EXPIRES 가 지나면 이 도구들이 멈추고 폐기 절차를 냅니다.
     폐기는 같은 화면(account/tokens)에서 그 토큰 줄의 [Revoke] 입니다.
   · 폐기해도 이 도구는 안 망가집니다. 다음에 필요할 때 새로 발급하면 그대로 돕니다.`);
  process.exit(2);
}

/** 대상 프로젝트를 이름으로 확인시킨다 — ref 문자열만 보면 사람은 두 개를 못 가른다. */
async function 대상알림(ref, 토큰, 쓰기) {
  let 이름 = '(이름 조회 실패)';
  try {
    const r = await fetch(`${API}/${ref}`, { headers: { Authorization: `Bearer ${토큰}` } });
    if (r.ok) 이름 = JSON.parse(await r.text()).name ?? 이름;
  } catch { /* 조회 실패가 실행을 막지는 않는다 — 알림이지 가드가 아니다 */ }
  console.error(`[원격SQL] 대상 ▸ ${이름}  (${ref})${쓰기 ? '  ⚠ 쓰기(--적용)' : '  읽기'}`);
}

async function main() {
  const args = process.argv.slice(2);
  const 적용 = args.includes('--적용');
  const 파일 = args.find((a) => !a.startsWith('--'));
  if (!파일) die('실행할 .sql 파일 경로를 달라. 예: node tools/원격SQL.js supabase/확인_적용전상태.sql');

  const 절대 = path.resolve(ROOT, 파일);
  if (!fs.existsSync(절대)) die(`파일이 없다: ${절대}`);
  const sql = fs.readFileSync(절대, 'utf8');

  if (!읽기전용(sql) && !적용) {
    die(`이 SQL 은 상태를 바꾼다(쓰기). 되돌리기 어려우므로 --적용 없이는 안 보낸다.
     유호님 승인을 받은 뒤: node tools/원격SQL.js ${파일} --적용`);
  }

  /* 이 실행이 읽기인지는 **바로 위에서 이미 판정했다** — 그 결과를 과녁에 그대로 넘긴다(사본 금지).
   * `--적용` 이 붙었으면 SQL 이 읽기로 보여도 쓰기로 본다: 플래그가 곧 의도이고, 둘 중 하나라도
   * 쓰기를 가리키면 쓰기다(「애매하면 쓰기」 — 이 파일 머리 §안전). */
  const e = 자격증명.읽기('원격SQL', { 읽기: 읽기전용(sql) && !적용 });
  const 토큰 = e.SUPABASE_ACCESS_TOKEN;
  const ref = e.SUPABASE_PROJECT_REF;
  if (!토큰 || !ref) 안내();

  // 🔴 **쏘기 직전에 과녁을 소리 내어 읽는다.** 프로젝트가 둘 이상이면(리허설·운영) 환경변수
  //    하나로 대상이 조용히 바뀐다 — 틀린 곳에 DDL 을 부어도 증상은 「성공」뿐이다.
  await 대상알림(ref, 토큰, 적용);

  const res = await fetch(`${API}/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${토큰}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const 본문 = await res.text();
  if (!res.ok) {
    // 토큰은 헤더에만 있어 여기 안 찍힌다. 본문은 잘라서 낸다(대량 덤프 방지).
    console.error(`[원격SQL] HTTP ${res.status} — 실행되지 않았다`);
    console.error(본문.slice(0, 2000));
    process.exit(1);
  }
  console.log(본문);
}

module.exports = { 읽기전용 };
if (require.main === module) main().catch((err) => die(String(err && err.message || err)));
