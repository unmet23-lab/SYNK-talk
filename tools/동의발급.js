#!/usr/bin/env node
'use strict';
/**
 * 동의 행 생성기 — P0 §7-2 · §403 (운영 도구 트리오의 마지막 칸)
 *
 *   node tools/동의발급.js --현황                       # 누가 동의가 있고 없는지(읽기)
 *   node tools/동의발급.js --현황 --학생 SYNK-001
 *   node tools/동의발급.js SYNK-001 --판 v18.9 --확정자 "유호" [--받은날 2026-08-05] \
 *        [--문서 docs/동의_문구_v1.md] [--적용]
 *
 * ■ 이 자리가 무엇을 닫나
 *   P0 §403 이 **동의 행 생성기·학생 계정 발급기·교정 확정기**를 「같은 도구」로 지목했는데,
 *   뒤 둘만 서 있었다(`로그인코드발급.js`·`교정확정.js`). 그래서 갓 등록한 학생은 계정은
 *   있는데 `engine.consents` 행이 없어 **두 곳에서 동시에 막힌다**:
 *     · `functions/uploads` — 서명 발급 전 동의 게이트 → **403 `CONSENT_MISSING`**
 *     · `functions/deliver` — 「동의 없는 학생은 배정하지 않는다」(P0 §345) → 과제가 안 온다
 *   즉 등록만으로는 아무것도 못 한다. 그 행을 넣는 통로가 **어디에도 없었다** — 지금까지
 *   `consents` 에 행을 만든 코드는 왕복시험 시딩과 마이그레이션 검증뿐이다(둘 다 시험용).
 *
 * ■ S1 에서 앱은 동의를 **받지 않는다**(P0 §238)
 *   앱은 확인만 하고 막는다. 행 생성은 service_role 운영 도구 몫이다 — S1 학생은 상담에서
 *   대면 동의하고, 그 사실을 운영자가 여기로 옮겨 적는다.
 *   ⛔ **앱 내 동의 화면은 이 도구가 대신하는 게 아니다** — 파일럿(오픈 이벤트) 참가자는
 *      상담을 안 거쳐 앱 내 동의가 유일한 근거고(`동의_문구 §0`), 그 화면은 **몽골어 검수
 *      완료가 선행**이다(P0 §185·§191). 그날이 오면 이 로직이 그 화면의 서버 함수가 된다.
 *
 * ■ 안전 — 이 도구는 **법적 근거가 되는 행**을 운영 DB 에 넣는다
 *   · 기본은 **미리보기**. `--적용` 없이는 아무것도 안 들어간다(형제 둘과 같은 규칙).
 *   · 과녁이 운영이면 `lib/자격증명.js` 가 `--운영` 을 한 번 더 요구한다(2026-08-07 실사고).
 *   · 🔴 **`agreed_at` 이 미래면 거절한다.** 서버 게이트는 `agreed_at <= now()` 라, 미래 날짜는
 *     행이 멀쩡히 생기는데 학생은 계속 403 을 받는다 — 증상이 「동의를 넣었는데 안 된다」뿐이라
 *     원인이 안 보인다. 판정은 **서버 시계**로 한다(내 시계·시간대를 안 믿는다).
 *   · 🔴 되돌리기는 여기 없다. 철회는 `revoked_at` 이고 **다른 절차**다(D5: 학원 연락 → 수동
 *     삭제 · P0 §192 「동의 수집과 철회 통로를 같은 규칙으로 묶지 않는다」).
 *
 * ⚠ `doc_hash` — 「그 학생이 **어느 글**에 동의했나」의 유일한 증거다. 저장소에 동의문 사본이
 *    아직 없어(P0 §4 미해소 차단자) 기본값은 비어 있다. `--문서 <경로>` 를 주면 그 파일의
 *    sha256 을 박는다. 사본이 붙는 날 이 자리가 그대로 쓰인다 — 소급은 안 되니 비운 채 넣은
 *    행은 영영 그 증거가 없다(그래서 비면 화면이 경고한다).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const API = 'https://api.supabase.com/v1/projects';

/* 🔴 `process.exit()` 를 부르지 않는다 — fetch 소켓이 닫히는 중에 부르면 Node 가 abort 하고
 *   종료코드가 **127**(「그런 명령이 없다」)로 나가 정상적인 거절이 설치 사고로 읽힌다.
 *   2026-08-07 `교정확정.js` 에서 실측된 그 자리다. */
class 중단 extends Error {}
const die = (m) => { console.error('[동의발급] ' + m); process.exitCode = 1; throw new 중단(m); };

const 자격증명 = require('../lib/자격증명.js');   // .env 읽기 + 토큰 만료 + 과녁 게이트(공용 통로)
const { 공용플래그, 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)

/* 이 도구가 아는 낱말 — `공용플래그`(=`--운영`)는 어느 도구에서든 뜻을 가지므로 펴 넣는다.
 * 빠뜨리면 되던 명령이 죽는다(F103) — `tests/플래그게이트.test.js` 가 소스 전량과 대조한다. */
const 아는플래그 = [...공용플래그, '--현황', '--적용', '--학생', '--판', '--확정자', '--받은날', '--문서'];

/** 스키마 판은 계약 정본에서 읽는다 — 여기 박으면 계약이 올라갈 때 조용히 낡는다(형제와 같은 규칙). */
function 계약() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
}

/** SQL 문자열 리터럴 — 작은따옴표를 겹쳐 막는다. 신뢰 경계라 검증과 이스케이프를 **둘 다** 한다. */
const 따옴표 = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * 동의 판 꼴. 정본 목록이 저장소에 없어(동의문 사본 미해소) **목록 대조는 못 한다** —
 * 대신 꼴만 본다. 공백이 섞인 값·문장이 판 이름으로 들어가면 그 행이 어느 판인지 영영 모른다.
 */
const 판꼴 = (s) => /^v\d[\w.-]{0,30}$/.test(String(s || ''));

/** 학생 코드 꼴 — `로그인코드발급.js` 와 같은 규칙(영숫자·하이픈·밑줄 1~32자). */
const 학생꼴 = (s) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(String(s || ''));

/**
 * 동의 시각 식. 안 주면 `now()` — **서버 시계**다.
 * 날짜만 주면 그날 자정(서버 시간대)이고, 그건 상담이 있었던 날을 옮겨 적는 통상 경우다.
 */
const 시각식 = (받은날) => (받은날 ? `${따옴표(받은날)}::timestamptz` : 'now()');

/**
 * 동의 현황 — **유효한 동의가 없는 학생을 먼저** 띄운다.
 * 왜 이 순서인가: `deliver?점검` 이 「미달=true」만 내고 **누구인지는 안 낸다**(P0 §371).
 * 그 한 명을 찾는 통로가 지금까지 없었다.
 * 유효 판정은 서버 게이트(`functions/uploads`·`deliver`)와 **같은 조건**이어야 한다 —
 * 여기서 갈라지면 화면은 초록인데 학생은 403 이고, 그 둘을 대조할 방법이 없다.
 */
function 현황SQL(학생) {
  return `
    select l.student_code, l.display_name,
           c.consent_ver, c.agreed_at, c.revoked_at
      from engine.learners l
      left join lateral (
        select consent_ver, agreed_at, revoked_at
          from engine.consents
         where learner_id = l.learner_id
           and agreed_at <= now()
           and (revoked_at is null or revoked_at > now())
         order by agreed_at desc limit 1) c on true
     ${학생 ? `where l.student_code = ${따옴표(학생)}` : ''}
     order by (c.consent_ver is null) desc, l.student_code
     limit 200`;
}

/**
 * 넣기 직전 대조 — **그 대상을 지금 DB 에서 직접 연다**(기억·행 번호가 아니라).
 * `미래` 는 서버가 판정한다: 내 시계와 서버 시계·시간대가 다르면 내 쪽 검사는 거짓 초록이 된다.
 */
function 대조SQL(학생, 받은날) {
  return `
    select l.learner_id, l.student_code, l.display_name,
           (${시각식(받은날)} > now()) as 미래,
           (select consent_ver from engine.consents
             where learner_id = l.learner_id
               and agreed_at <= now()
               and (revoked_at is null or revoked_at > now())
             order by agreed_at desc limit 1) as 현재판,
           (select count(*) from engine.consents where learner_id = l.learner_id) as 이력
      from engine.learners l
     where l.student_code = ${따옴표(학생)}`;
}

/**
 * 동의 1건 insert. `doc_hash` 는 없으면 null — 있으면 「어느 글에 동의했나」의 증거가 된다.
 *
 * 🔑 `recorded_by` = `--확정자`. 이 값은 **2026-08-07 부터 08-10 까지 화면에만 찍혔다** —
 *   넣을 칸이 없어서였고(그때는 정말 없었다), 그 사이 `20260807140000` 이 열을 열면서
 *   머리말에 「강제는 다음 조각 몫」이라 적어 뒀다. 도구가 그 열을 모르고 있었을 뿐이다.
 *   동의는 법적 근거고 근거에 출처가 없으면 「이 동의는 누가 받았나」에 아무도 답할 수 없다.
 *   ⚠ 소급은 없다 — 이 커밋 **전에** 선 행은 영영 `null` 이다(없는 사실을 지어내는 것이 백필이다).
 */
function 삽입SQL({ learner_id, 판, 해시, 받은날, 스키마판, 확정자 }) {
  return `
    insert into engine.consents (learner_id, consent_ver, doc_hash, agreed_at, schema_ver, recorded_by)
    values (${따옴표(learner_id)}::uuid, ${따옴표(판)}, ${해시 ? 따옴표(해시) : 'null'},
            ${시각식(받은날)}, ${따옴표(스키마판)}, ${따옴표(String(확정자 || '').trim())})
    returning consent_id, agreed_at, recorded_by`;
}

/** 넣은 뒤 **서버 게이트와 같은 질의**로 되읽는다 — 넣었다는 응답이 아니라 게이트가 보는 값을 본다. */
function 확인SQL(learner_id) {
  return `
    select consent_ver, agreed_at from engine.consents
     where learner_id = ${따옴표(learner_id)}::uuid
       and agreed_at <= now()
       and (revoked_at is null or revoked_at > now())
     order by agreed_at desc limit 1`;
}

/** 동의문 사본의 sha256. 경로가 틀리면 조용히 null 이 되면 안 된다 — 호출부가 거절한다. */
function 문서해시(절대경로) {
  return crypto.createHash('sha256').update(fs.readFileSync(절대경로)).digest('hex');
}

/** `--이름 값` 한 쌍을 꺼낸다. 값이 없거나 다음 깃발이면 없는 것으로 본다. */
function 값(args, 깃발) {
  const i = args.indexOf(깃발);
  if (i === -1) return null;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : null;
}

function 인자파싱(argv) {
  const args = argv.slice();
  const 깃발값 = new Set();
  ['--학생', '--판', '--확정자', '--받은날', '--문서'].forEach((f) => {
    const v = 값(args, f);
    if (v !== null) 깃발값.add(v);
  });
  return {
    현황: args.includes('--현황'),
    적용: args.includes('--적용'),
    학생: 값(args, '--학생'),
    판: 값(args, '--판'),
    확정자: 값(args, '--확정자'),
    받은날: 값(args, '--받은날'),
    문서: 값(args, '--문서'),
    대상: args.find((a) => !a.startsWith('--') && !깃발값.has(a)) || null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const 플래그오류 = 인자게이트('동의발급', args, 아는플래그);   // 모르는 낱말은 여기서 죽는다(F435)
  if (플래그오류) die(플래그오류);
  const opt = 인자파싱(args);
  const e = 자격증명.읽기('동의발급');
  if (!e.SUPABASE_ACCESS_TOKEN || !e.SUPABASE_PROJECT_REF) {
    die('.env 에 SUPABASE_ACCESS_TOKEN·SUPABASE_PROJECT_REF 가 필요하다 (tools/원격SQL.js 안내 참조)');
  }
  const M = { Authorization: `Bearer ${e.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
  const ref = e.SUPABASE_PROJECT_REF;

  const sql = async (query) => {
    const r = await fetch(`${API}/${ref}/database/query`, {
      method: 'POST', headers: M, body: JSON.stringify({ query }),
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`SQL HTTP ${r.status} — ${t.slice(0, 400)}`);
    return JSON.parse(t);
  };

  /* 🔴 대상부터 찍는다 — 리허설과 운영이 같은 명령으로 갈리는 유일한 값이 .env 한 줄이다. */
  const pr = await fetch(`${API}/${ref}`, { headers: M });
  const 이름 = pr.ok ? JSON.parse(await pr.text()).name : '(이름을 못 읽었다)';
  console.log(`[동의발급] 대상 ▸ ${이름}  (${ref})\n`);

  /* ── 읽기: 동의 현황 ──────────────────────────────────────────── */
  if (opt.현황) {
    const 행들 = await sql(현황SQL(opt.학생 || opt.대상));
    if (!행들.length) {
      console.log(opt.학생 || opt.대상 ? '그런 학생이 없다.' : '학생이 0명이다.');
      return;
    }
    const 없음 = 행들.filter((r) => !r.consent_ver);
    console.log(`학생 ${행들.length}명 · 유효 동의 없음 **${없음.length}명**\n`);
    행들.forEach((r) => {
      const 이름칸 = `${r.student_code}${r.display_name ? ` (${r.display_name})` : ''}`;
      console.log(r.consent_ver
        ? `  ✅ ${이름칸}  판 ${r.consent_ver}  동의 ${String(r.agreed_at).slice(0, 16)}`
        : `  ❌ ${이름칸}  — 업로드 403 · 배정 제외`);
    });
    if (없음.length) {
      console.log('\n이 학생들은 계정만 있고 아무것도 못 한다(P0 §345 · uploads 동의 게이트).');
      console.log('발급: node tools/동의발급.js <학생코드> --판 v18.9 --확정자 "유호" --적용');
    }
    return;
  }

  /* ── 쓰기: 동의 1건 ───────────────────────────────────────────── */
  const 학생 = opt.대상 || opt.학생;
  if (!학생) {
    die('학생 코드를 달라 (현황: --현황).\n'
      + '     예: node tools/동의발급.js SYNK-001 --판 v18.9 --확정자 "유호" --적용');
  }
  if (!학생꼴(학생)) die(`학생 코드 형식이 아니다: ${학생} (영숫자·하이픈·밑줄 1~32자)`);
  if (!opt.판) {
    die('--판 이 필요하다 (동의한 문구의 판 · 예 v18.9).\n'
      + '     이 값이 없으면 그 행이 **어느 동의 아래** 수집을 허가했는지 영영 모른다.');
  }
  if (!판꼴(opt.판)) {
    die(`--판 이 판 이름 꼴이 아니다: ${opt.판}\n`
      + '     꼴 = v + 숫자로 시작하는 한 낱말(예 v18.9 · v2). 문장·공백은 판 이름이 아니다.');
  }
  if (!opt.확정자 || !opt.확정자.trim()) {
    die('--확정자 가 필요하다 (누가 이 동의를 받았는지 · 행의 `recorded_by` 에 박힌다).');
  }
  if (opt.받은날 && !/^\d{4}-\d{2}-\d{2}([ T].+)?$/.test(opt.받은날)) {
    die(`--받은날 꼴이 아니다: ${opt.받은날} (YYYY-MM-DD 또는 YYYY-MM-DD HH:MM)`);
  }

  /* 동의문 사본이 있으면 해시를 박는다 — 「어느 글에 동의했나」는 소급되지 않는다. */
  let 해시 = null;
  if (opt.문서) {
    const p = path.resolve(ROOT, opt.문서);
    if (!fs.existsSync(p)) die(`--문서 를 못 찾았다: ${p}`);
    해시 = 문서해시(p);
  }

  /* 🔴 넣기 직전 **그 대상을 직접 연다** — 지금 DB 의 값을 본다(F030). */
  const [대상] = await sql(대조SQL(학생, opt.받은날));
  if (!대상) {
    die(`그런 학생이 없다: ${학생}\n`
      + '     명부 등록이 먼저다: node tools/명부등록.js ' + 학생 + ' --전화 "상담 때 받은 번호" --적용');
  }
  if (대상.미래) {
    die(`--받은날 이 **미래**다(서버 시계 기준): ${opt.받은날}\n`
      + '     서버 게이트는 agreed_at <= now() 라, 이 행은 만들어져도 학생은 계속 403 을 받는다.\n'
      + '     증상이 「동의를 넣었는데 안 된다」뿐이라 원인이 안 보인다 — 그래서 여기서 막는다.');
  }
  if (대상.현재판 === opt.판) {
    die(`${학생} 는 이미 판 ${opt.판} 에 유효하게 동의돼 있다 — 같은 판을 또 넣지 않는다.\n`
      + '     (현황: node tools/동의발급.js --현황 --학생 ' + 학생 + ')');
  }

  console.log(`  대상 학생 ▸ ${대상.student_code}${대상.display_name ? ` (${대상.display_name})` : ''}`);
  console.log(`    동의 판 : ${opt.판}${대상.현재판 ? `   ⚠ 지금 유효한 판은 «${대상.현재판}» — 새 판이 최신이 된다` : ''}`);
  console.log(`    받은 때 : ${opt.받은날 || '지금(서버 시계)'}   확정자: ${opt.확정자}`);
  console.log(`    문서해시: ${해시 ? `${해시.slice(0, 16)}… (${opt.문서})` : '(없음)'}`);
  if (!해시) {
    console.log('      ⚠ 이 행은 **어느 글에 동의했는지** 증명할 수 없다 — 저장소에 동의문 사본이');
    console.log('        붙으면 --문서 로 준다. 이미 넣은 행에는 소급되지 않는다.');
  }
  if (Number(대상.이력) > 0) {
    console.log(`    이 학생의 동의 이력 ${대상.이력}건 — 지우지 않고 **새 것이 최신이 된다**.`);
  }

  if (!opt.적용) {
    console.log('\n[미리보기] 아무것도 넣지 않았다. 위 학생·판이 맞으면 --적용 을 붙인다.');
    return;
  }

  const c = 계약();
  const [난것] = await sql(삽입SQL({
    learner_id: 대상.learner_id, 판: opt.판, 해시, 받은날: opt.받은날, 스키마판: c.버전,
    확정자: opt.확정자,
  }));
  /* 🔴 넣었다는 응답이 아니라 **게이트가 보는 값**을 되읽는다 — 조용한 미적용은 통과와 같은 모양이다. */
  const [게이트] = await sql(확인SQL(대상.learner_id));

  console.log(`\n✅ 동의 기록 — consent_id ${난것.consent_id}  (agreed_at ${String(난것.agreed_at).slice(0, 16)})`);
  if (!게이트 || 게이트.consent_ver !== opt.판) {
    console.log(`   🔴 그런데 서버 게이트가 보는 판은 «${게이트 ? 게이트.consent_ver : '없음'}» 이다`
      + ' — 행은 들어갔는데 유효 동의로 안 잡힌다. 넣은 값을 다시 본다.');
    process.exitCode = 1;
    return;
  }
  console.log(`   ${대상.student_code} 가 이제 할 수 있는 것: **녹음 업로드**(uploads 403 해제)`
    + ' · **오늘의 과제 배정**(deliver 대상에 든다 · 다음 배치부터)');
  console.log(`   📌 기록: ${new Date().toISOString()} · 확정자 ${opt.확정자.trim()} · 판 ${opt.판}`);
  /* 🔴 되읽기와 같은 이유로 **응답을 믿지 않고 값을 본다** — `recorded_by` 는 열이 없는 DB 에서도
   *   조용히 실패하지 않고 에러를 내지만, 빈 문자열이 박히는 경로(공백만 준 --확정자)는 통과와
   *   같은 모양이다. 출처 없는 동의는 이 도구가 막으려던 바로 그것이다. */
  if (!난것.recorded_by) {
    console.log('   🔴 그런데 행의 recorded_by 가 비었다 — 출처 없는 동의가 섰다. 이 행을 확인한다.');
    process.exitCode = 1;
    return;
  }
  console.log(`      출처 recorded_by=«${난것.recorded_by}» 가 행에 박혔다 — 「누가 이 동의를 받았나」에 답할 수 있다.`);
  console.log('   철회는 여기 없다 — 학원 연락 → 수동 처리가 유일 경로다(D5 · P0 §192).');
}

if (require.main === module) {
  main().catch((err) => {
    if (err instanceof 중단) return;                       // die() 가 이미 찍고 코드를 세웠다
    console.error('[동의발급] ' + err.message);
    process.exitCode = 1;
  });
}

module.exports = {
  따옴표, 판꼴, 학생꼴, 시각식, 인자파싱, 현황SQL, 대조SQL, 삽입SQL, 확인SQL, 문서해시,
};
