#!/usr/bin/env node
'use strict';
/**
 * 교정 「사람 확정」 CLI — P0 §7-2 (차단자 A-7 이 명세만 두고 구현을 비워 둔 자리)
 *
 *   node tools/교정확정.js --대기                      # 확정 안 된 제출 목록(읽기)
 *   node tools/교정확정.js --대기 --학생 SYNK-001
 *   node tools/교정확정.js <submission_id> --교정문 "어제 친구를 만났어요" \
 *        --태그 "어미:시제,조사:목적격(을/를)" --확정자 "유호" [--적용]
 *
 * ■ 이 자리가 무엇을 닫나
 *   c8 이 `correction_id` 라는 **이름**을 냈고(P0 §10-A-11), `GET /v1/corrections` 가 그걸
 *   앱에 **읽어 준다**. 그런데 운영에서 그 행을 **만드는** 통로가 없었다 — 즉 S1 의 교정 고리는
 *   양끝이 다 서 있는데 가운데가 비어 있었다. 학생 화면은 영원히 `data: []` 고, 그 상태는
 *   「아직 교정이 없다」와 **구분되지 않는다**(둘 다 빈 배열이다).
 *   🔴 S1-8(교정 열람·응답)은 「학습이 일어났다」의 **유일한 직접 신호**라, 이 통로가 없으면
 *   그 신호가 첫날부터 0 이고 그건 지표가 아니라 미구현이다.
 *
 * ■ 왜 화면이 아니라 CLI 인가 (P0 §7-2)
 *   S1 에 검수 화면이 없고, 시트를 쓰면 §7-3 의 역방향 쓰기 금지와 충돌한다. 학생 수가
 *   한 자리인 구간에서 CLI 로 족하고, M2 검수 화면이 서면 **이 로직이 그 화면의 서버 함수**가
 *   된다(버릴 코드가 아니다). 동의 행 생성기·`tools/로그인코드발급.js` 와 같은 계열이다.
 *
 * ■ 안전 — 이 도구는 **운영 DB 에 사람 이름으로 행을 넣는다**
 *   · 기본은 **미리보기**. `--적용` 없이는 아무것도 안 들어간다(`원격SQL`·발급기와 같은 규칙).
 *   · **대상 프로젝트 이름을 먼저 찍는다** — 리허설인지 운영인지 모르고 넣는 것이 가장 흔한 사고다.
 *   · 🔴 **넣기 직전 그 제출의 주인을 화면에 띄운다.** `submission_id` 한 글자가 틀리면 오답이
 *     아니라 **오귀속**이고, corrections 는 지울 수 없다(append-only · 되돌리기 = 새 교정).
 *   · 되돌리기는 삭제가 아니다 — 잘못 넣었으면 **새 교정을 넣고 그것이 최신이 된다**(P0 §7-2).
 *
 * ⛔ `--초안`(reviewed_correction_id)은 **안 낸다.** S1 에는 AI 초안이 0 이라 가리킬 대상이
 *    없고(§7-1 「초안 없이 사람 확정 큐에만」), 초안을 가리키려면 `verdict`(골든판정 3값)가
 *    짝으로 필요한데 그 판정은 M2 검수 화면의 입력이다. 짝 없이 한쪽만 받으면 「평가했다는데
 *    무엇으로 평가했는지 없는」 행이 남는다.
 *    ponytail: AI 초안이 생기는 M2 에서 `--초안`+`--판정` 을 **한 쌍으로** 붙인다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API = 'https://api.supabase.com/v1/projects';
/* 🔴 `process.exit()` 를 부르지 않는다 — fetch 가 연 소켓이 닫히는 중에 부르면 Node 가
 *   libuv assertion 으로 **abort** 하고 종료코드가 **127** 로 나간다(2026-08-07 실측 · win).
 *   127 은 셸에서 「그런 명령이 없다」는 뜻이라, 호출부·CI 는 이 도구의 정상적인 거절을
 *   **설치 사고**로 읽는다. 코드만 세우고 흐름을 끊으면 fetch 가 정리된 뒤 1 로 나간다(318ms). */
class 중단 extends Error {}
const die = (m) => { console.error('[교정확정] ' + m); process.exitCode = 1; throw new 중단(m); };

const 자격증명 = require('../lib/자격증명.js');   // .env 읽기 + 토큰 만료 게이트(공용 통로)

/** 계약은 정본에서 읽는다 — 여기 박으면 계약이 올라갈 때 조용히 낡는다(발급기와 같은 규칙). */
function 계약() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
}

/** SQL 문자열 리터럴 — 작은따옴표를 겹쳐 막는다. 신뢰 경계라 검증과 이스케이프를 **둘 다** 한다. */
const 따옴표 = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** uuid 꼴인가. 안 보면 오타가 Postgres 까지 내려가 `22P02` 로 죽고 원인이 안 보인다. */
const uuid꼴 = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));

/**
 * 오류태그 검증 — **정본은 계약 파일**이다(L0 §3-4: 배열 CHECK 를 DB 에 걸지 않기로 한 대가로
 * 검증을 서버·도구가 진다). 하나라도 모르는 태그면 통째로 거부한다 — 반만 넣으면 그 행은
 * 나중에 「태그가 원래 그것뿐이었나, 오타가 지워진 건가」를 구분할 수 없다.
 */
function 태그검증(태그들, 허용) {
  const 목록 = (Array.isArray(태그들) ? 태그들 : String(태그들 || '').split(','))
    .map((t) => String(t).trim()).filter(Boolean);
  return { 목록, 모름: 목록.filter((t) => !허용.includes(t)) };
}

/**
 * 확정 안 된 제출 목록.
 * 🔴 `event_type = 'submission.created'` 가 이 질의의 급소다 — `submissions` 에는 **제출이 아닌
 *   행**(배치가 넣는 `task.assigned` 의 `task_snapshot`)이 산다(P0 §6-1). 안 걸면 오늘 나간
 *   **배정**이 「교정 대기 중인 학생 문장」으로 보이고, 강사가 그 자리에 교정을 달게 된다.
 */
function 대기SQL(학생) {
  return `
    select s.submission_id, l.student_code, e.occurred_at, s.task_type,
           coalesce(s.transcript_verified, s.transcript, s.body_original) as 원문
      from engine.submissions s
      join engine.learning_events e on e.event_id = s.event_id
      join engine.learners l on l.learner_id = e.learner_id
     where e.event_type = 'submission.created'
       ${학생 ? `and l.student_code = ${따옴표(학생)}` : ''}
       and not exists (select 1 from engine.corrections c
                        where c.submission_id = s.submission_id)
     order by e.occurred_at desc limit 30`;
}

/** 넣기 직전 대조용 — 이 제출이 **누구 것이고 무슨 문장인가**, 이미 교정이 몇 건 달렸나. */
function 대조SQL(submission_id) {
  return `
    select l.student_code, l.display_name, e.event_type, e.occurred_at,
           coalesce(s.transcript_verified, s.transcript, s.body_original) as 원문,
           (select count(*) from engine.corrections c
             where c.submission_id = s.submission_id) as 기존교정
      from engine.submissions s
      join engine.learning_events e on e.event_id = s.event_id
      join engine.learners l on l.learner_id = e.learner_id
     where s.submission_id = ${따옴표(submission_id)}::uuid`;
}

/**
 * 교정 1건 insert. `actor_kind = 'teacher'` 가 이 도구의 정의다 — 사람이 확정한 것만 여기서 난다.
 * `schema_ver` 는 계약 파일에서 온다(손으로 안 적는다).
 */
function 삽입SQL({ submission_id, 교정문, 태그, 확정자, 판 }) {
  const 배열 = `array[${태그.map(따옴표).join(', ')}]::text[]`;
  return `
    insert into engine.corrections
      (submission_id, actor_kind, corrected_text, error_tags, reviewer, schema_ver)
    values (${따옴표(submission_id)}::uuid, 'teacher', ${따옴표(교정문)}, ${배열},
            ${따옴표(확정자)}, ${따옴표(판)})
    returning correction_id, created_at`;
}

/** 넣은 것이 그 학생이 **다음에 볼** 교정인가 (P0 §7-2 「출력」). 최신 판정은 확정 시각으로 한다. */
function 최신SQL(submission_id, correction_id) {
  return `
    select c.correction_id = ${따옴표(correction_id)}::uuid as 최신, l.student_code
      from engine.corrections c
      join engine.submissions s on s.submission_id = c.submission_id
      join engine.learning_events e on e.event_id = s.event_id
      join engine.learners l on l.learner_id = e.learner_id
     where e.learner_id = (select e2.learner_id
                             from engine.submissions s2
                             join engine.learning_events e2 on e2.event_id = s2.event_id
                            where s2.submission_id = ${따옴표(submission_id)}::uuid)
     order by c.created_at desc limit 1`;
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
  ['--학생', '--교정문', '--태그', '--확정자'].forEach((f) => {
    const v = 값(args, f);
    if (v !== null) 깃발값.add(v);
  });
  return {
    대기: args.includes('--대기'),
    적용: args.includes('--적용'),
    학생: 값(args, '--학생'),
    교정문: 값(args, '--교정문'),
    태그: 값(args, '--태그'),
    확정자: 값(args, '--확정자'),
    submission_id: args.find((a) => !a.startsWith('--') && !깃발값.has(a)) || null,
  };
}

async function main() {
  const opt = 인자파싱(process.argv.slice(2));
  const e = 자격증명.읽기('교정확정');
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
  console.log(`[교정확정] 대상 ▸ ${이름}  (${ref})\n`);

  /* ── 읽기: 확정 대기 목록 ─────────────────────────────────────── */
  if (opt.대기) {
    const 행들 = await sql(대기SQL(opt.학생));
    if (!행들.length) {
      console.log(opt.학생 ? `대기 0건 — ${opt.학생} 의 제출이 전부 확정됐거나 제출이 없다.`
        : '대기 0건 — 확정 안 된 제출이 없다.');
      return;
    }
    console.log(`확정 대기 ${행들.length}건${행들.length === 30 ? ' (상한 30 — 더 있을 수 있다)' : ''}\n`);
    행들.forEach((r) => {
      console.log(`  ${r.submission_id}  ${r.student_code}  ${String(r.occurred_at).slice(0, 16)}  [${r.task_type}]`);
      console.log(`    원문: ${r.원문 === null ? '(없음 — 음성만 · 전사 전)' : String(r.원문).slice(0, 120)}`);
    });
    console.log('\n확정: node tools/교정확정.js <submission_id> --교정문 "…" --태그 "…" --확정자 "…" --적용');
    return;
  }

  /* ── 쓰기: 교정 1건 확정 ──────────────────────────────────────── */
  const c = 계약();
  if (!opt.submission_id) {
    /* 예시의 태그도 **계약에서 뽑는다** — 손으로 적으면 계약이 올라가는 날 없는 태그를 안내한다. */
    die('submission_id 를 달라 (대기 목록: --대기).\n'
      + `     예: node tools/교정확정.js <submission_id> --교정문 "…" --태그 "${c.오류태그[0]}" --확정자 "유호" --적용`);
  }
  if (!uuid꼴(opt.submission_id)) die(`submission_id 가 uuid 꼴이 아니다: ${opt.submission_id}`);
  if (!opt.교정문 || !opt.교정문.trim()) die('--교정문 이 필요하다 (학생에게 돌아갈 문장이다).');
  if (!opt.확정자 || !opt.확정자.trim()) die('--확정자 가 필요하다 (누가 확정했는지 없으면 골든셋의 주인이 없다).');

  const { 목록: 태그, 모름 } = 태그검증(opt.태그, c.오류태그);
  if (!태그.length) {
    die(`--태그 가 필요하다. 오류가 없었다면 «오류없음» 을 준다 — 빈 칸은 「태그를 안 붙였다」와\n`
      + '     「오류가 없었다」를 구분 못 해 엔진 쪽에서 둘이 같은 모양이 된다.');
  }
  if (모름.length) {
    die(`계약에 없는 오류태그: ${모름.join(', ')}\n     허용 ${c.오류태그.length}종 = ${c.오류태그.join(' · ')}`);
  }

  /* 🔴 넣기 직전 **그 대상을 직접 연다** — 행 번호·기억이 아니라 지금 DB 의 값을 본다. */
  const [대상] = await sql(대조SQL(opt.submission_id));
  if (!대상) die(`그런 제출이 없다: ${opt.submission_id}\n     (--대기 로 목록을 먼저 본다)`);
  if (대상.event_type !== 'submission.created') {
    die(`이 행은 제출이 아니라 «${대상.event_type}» 이다 — 배정 행에는 교정을 달지 않는다(P0 §6-1).`);
  }

  console.log(`  대상 제출 ▸ ${대상.student_code}${대상.display_name ? ` (${대상.display_name})` : ''}`
    + `  ${String(대상.occurred_at).slice(0, 16)}`);
  console.log(`    원문   : ${대상.원문 === null ? '(없음 — 음성만 · 전사 전)' : 대상.원문}`);
  console.log(`    교정문 : ${opt.교정문}`);
  console.log(`    태그   : ${태그.join(' · ')}   확정자: ${opt.확정자}   판: ${c.버전}`);
  if (Number(대상.기존교정) > 0) {
    console.log(`    ⚠ 이 제출에 이미 교정 ${대상.기존교정}건이 있다 — 지우지 않고 **새 것이 최신이 된다**.`);
  }

  if (!opt.적용) {
    console.log('\n[미리보기] 아무것도 넣지 않았다. 위 학생·문장이 맞으면 --적용 을 붙인다.');
    return;
  }

  const [난것] = await sql(삽입SQL({
    submission_id: opt.submission_id, 교정문: opt.교정문.trim(), 태그, 확정자: opt.확정자.trim(), 판: c.버전,
  }));
  const [최신] = await sql(최신SQL(opt.submission_id, 난것.correction_id));

  console.log(`\n✅ 확정 — correction_id ${난것.correction_id}`);
  console.log(`   ${대상.student_code} 가 다음에 볼 것: ${최신 && 최신.최신
    ? `**이 교정** — 「${opt.교정문.trim()}」`
    : '⚠ 이 교정이 아니다 — 같은 학생에게 더 최신인 교정이 있다(그쪽이 화면에 온다)'}`);
  console.log('   되돌리기: 행을 지우지 않는다 — 잘못 넣었으면 새 교정을 넣고 그것이 최신이 된다(P0 §7-2).');
}

if (require.main === module) {
  main().catch((err) => {
    if (err instanceof 중단) return;                       // die() 가 이미 찍고 코드를 세웠다
    console.error('[교정확정] ' + err.message);
    process.exitCode = 1;
  });
}

module.exports = { 따옴표, uuid꼴, 태그검증, 인자파싱, 대기SQL, 대조SQL, 삽입SQL, 최신SQL };
