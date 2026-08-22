/* deliver-one — 상태기반 과제 생성의 **단건 워커** (§3 ② · 벤더 호출의 «유일한 자리»)
 *
 * ■ 왜 갈라져 있나(§3 뼈대) — Edge Fn 은 150초를 진다. 한 HTTP 호출 안에 벤더 대기를 여러
 *   학생 몫 쌓으면 마지막 학생들이 매일 잘린다. 그래서 오케스트레이터(deliver · 벤더 0)가
 *   큐를 만들고, 이 워커가 **한 번에 `워커학생상한` 명**만 집어 생성한다. 스케줄러가 10분마다
 *   재호출하는 «재진입»이 병렬을 대신한다 — 진행 상태는 메모리가 아니라 장부(`generation_jobs`)가
 *   기억하므로 중간에 죽어도 다음 회차가 이어받는다.
 *
 * ■ 순수/부수 경계(§3) — 판정·조립은 전부 lib(동봉)이 지고, 이 파일은 **왕복과 착지 순서**만
 *   진다: claim → 이력 조회 → 렌더 → attempt_open → fetch → attempt_close → 검문 → 원자 착지.
 *   요약은 **재계산하지 않는다**(D2 — `event_draft.요약` 를 렌더에 끼울 뿐 · 상태 생산자는
 *   오케스트레이터 하나다).
 *
 * ■ 실행판 — 워커는 «자기 판» 여섯을 계산해 `attempt_open` 에 넘기고, job 판과의 대조는
 *   **함수가** 진다(㉢ — 판정을 여기 다시 적으면 두 곳이 갈린다). 배치 «중» 배포로 갈리면
 *   `판불일치` 거절이 오고, 워커는 벤더를 안 부르고 폴백으로 닫는다(§4-1).
 *   · model = env `GENERATION_MODEL`(v5.13-b ④ — 모델은 유호님이 고른다 · 코드 리터럴 0.
 *     미설정이면 빈 문자열이라 ㉢ 이 판불일치로 접는다 — 별도 갈래를 안 만든다)
 *   · prompt_ver = `과제생성.프롬프트지문`(v5.13-b ① — 오케스트레이터와 같은 함수 하나)
 *   · policy_ver = `판독기.정책지문`(재료 13 — 파일 해시·폴백순서는 빌드 산출 `판재료`,
 *     상수·회전식·cron 은 `생성상수`, rpc 는 DB `pg_get_functiondef` 질의)
 *   · estimator_version = `학습자상태.추정판` · schema_ver = 마이그 이력(deliver 와 같은 통로)
 *   · skill_taxonomy_ver = `기술선택.분류판`(v5.13-b ②)
 *
 * ■ 🔴 못 하는 이유의 층을 가른다(correct 선례):
 *   · `ANTHROPIC_API_KEY` 없음 = 그날 생성이 **원리상 불가** — 집은 job 을 즉시 `키없음` 폴백으로
 *     닫는다(마감까지 기다릴 이유가 0 — 즉시 폴백이 학생 경험에 낫고, «예산소진» 으로 가려지면
 *     배포 사고가 예산의 얼굴을 쓴다 · §4-1 이 값을 둔 이유).
 *   · 워커 예산이 마르면 남은 job 을 **반납**(㉦)하고 끝낸다 — 행을 안 만든다(§3-2 · 다음 회차 몫).
 *   · `중복열림` 거절 = 앞 워커가 부르다 죽어 «받았는지 모르는» 열린 시도가 있다(갈래 12) —
 *     다시 부르면 중복 과금이라 **건너뛴다**(반납도 안 한다 — 반납하면 다음 회차가 같은 벽을
 *     10분마다 두드린다. 임대가 끝나도 같은 거절이라, 그 job 은 마감 스윕이 닫는 것이 정본).
 *
 * ■ B3 재호출(§3-2-a) — 집을 것이 0인데 그 날짜 정본 실행이 미완이거나(시작 행 0 · finished_at
 *   null) `적재실패`(load_retry_count<3) 가 남아 있으면, 마감 «전» + 그날 배치 실행 행 수가
 *   `배치실행상한_일` 미만일 때만 오케스트레이터를 재호출한다. 통로는 cron 과 같은
 *   `net.http_post`(Vault 참조) — 워커가 fetch 로 직접 기다리면 자기 예산이 오케스트레이터
 *   벽시계에 묶인다. 상한 소진 거절은 사유를 로그에 남긴다(새 감시 항은 안 만든다 · v5.13).
 *
 * ■ 착지 봉투(㉤ · §3-5-b) — 함수 몫 19칸은 싣지 않는다(A12 — job 에서 함수가 읽는다).
 *   폴백의 task_snapshot 은 **`event_draft` 에 굳힌 그대로**(§7-2 — 재호출 0 · §12-28 스파이 축),
 *   성공은 `오늘과제.스냅샷` 으로 새로 조립하되 문장·질문은 **검문이 낸 정규화 후 값**(§7 표 —
 *   「검문이 본 것과 같은 바이트」 · SQL 대조 ⑥ 파서가 같은 정규화를 진다 · v5.13-b ③). */
import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';
import 교정모듈 from './교정엔진.mjs';
import 과제생성모듈 from './과제생성.mjs';
import 과제검문모듈 from './과제검문.mjs';
import 실행판모듈 from './실행판.mjs';
import 생성상수모듈 from './생성상수.mjs';
import 판재료모듈 from './판재료.mjs';
import 오늘과제모듈 from './오늘과제.mjs';
import 착지봉투모듈 from './착지봉투.mjs';
import 계약판모듈 from './계약판.mjs';
import 프롬프트전문 from './과제생성프롬프트.mjs';

const { 서비스역할 } = 토큰모듈 as { 서비스역할: (req: Request) => boolean };
const { 메시지경로, 벤더헤더 } = 교정모듈 as {
  메시지경로: string; 벤더헤더: (키: string) => Record<string, string>;
};
const {
  생성요청몸통, 생성응답읽기, 입력초과인가, 응답초과인가, 렌더, 재시도가능, 벤더사유,
} = 과제생성모듈 as {
  생성요청몸통: (a: { 본문: string; model: string }) => Record<string, unknown>;
  생성응답읽기: (봉투: unknown) => { 값?: { sentence: string; question: string }; 오류?: string; 사유?: string };
  입력초과인가: (본문: string) => boolean;
  응답초과인가: (원문: string) => boolean;
  렌더: (전문: string, a: { 요약: string; 기술들: string[] }) => string | null;
  재시도가능: (status: number) => boolean;
  벤더사유: (실패글: string) => string | null;
};
const { 검문, 중복창_일 } = 과제검문모듈 as {
  검문: (재료: Record<string, unknown>) =>
    { ok: boolean; 사유: string | null; 사유들: string[]; 문장: string; 질문: string };
  중복창_일: number;
};
const { 실행판조립, RPC질의문, 판질의문 } = 실행판모듈 as {
  실행판조립: (재료: Record<string, unknown>) => Record<string, string>;
  RPC질의문: () => string;
  판질의문: () => string;
};
const {
  생성타임아웃_MS, 워커예산_MS, 워커학생상한, 임대_초, 배치실행상한_일, 폴백여유_MS,
} = 생성상수모듈 as {
  생성타임아웃_MS: number; 워커예산_MS: number; 워커학생상한: number; 임대_초: number;
  배치실행상한_일: number; 폴백여유_MS: number;
};
const { 스냅샷, 시간대 } = 오늘과제모듈 as {
  스냅샷: (날짜: string, 문장: string, 출처: string, 프롬프트: string, 선택?: unknown) => Record<string, unknown>;
  시간대: string;
};
const { 착지봉투, 폴백봉투 } = 착지봉투모듈 as {
  착지봉투: (재료: Record<string, unknown>) => Record<string, unknown>;
  폴백봉투: (재료: Record<string, unknown>) => Record<string, unknown>;
};
const { 행들에서판 } = 계약판모듈 as { 행들에서판: (행들: unknown) => string | null };

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

type Job = {
  job_id: string; learner_id: string; assign_date: unknown; fence: string | number;
  status: string; branch_snapshot: Record<string, unknown>;
  event_draft: Record<string, unknown> | null; snapshot_as_of: unknown;
  skill_ids: string[]; skill_taxonomy_ver: string;
  model: string; prompt_ver: string; policy_ver: string;
  estimator_version: string; schema_ver: string;
};

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function 센다(칸: Record<string, number>, 이름: string) {
  칸[이름] = (칸[이름] ?? 0) + 1;
}

/* ── 자기 실행판(호출당 1회) — 조립은 lib/실행판 하나(오케스트레이터와 같은 함수) · 대조는
 * ㉢ 가 진다. DB 산출 둘(rpc 전문·schema_ver)만 여기서 조달한다. 실패는 빈 문자열 → 판불일치. */
async function 자기실행판(): Promise<Record<string, string>> {
  let rpc전문 = '';
  try {
    rpc전문 = (await sql.unsafe(RPC질의문()))[0]?.전문 ?? '';
  } catch (e) { console.error('[deliver-one] rpc 재료 조회 실패', String((e as Error)?.message ?? e)); }
  let schema_ver = '';
  try {
    schema_ver = 행들에서판(await sql.unsafe(판질의문())) ?? '';
  } catch (e) { console.error('[deliver-one] schema_ver 산출 실패', String((e as Error)?.message ?? e)); }
  return 실행판조립({
    model: Deno.env.get('GENERATION_MODEL') ?? '',
    프롬프트전문: 프롬프트전문 as unknown as string,
    rpc전문, schema_ver, 판재료: 판재료모듈,
  });
}

/* ── ②' 중복 이력(워커 몫 · claim 직후) — §3 의 쿼리 규격 그대로 ──────────────────
 * 이중 cutoff(occurred·ingested ≤ as_of) + 성공 + 발화녹음 + 출처='생성'(호흡 ② 행).
 * 질문은 같은 intervention 의 배정 사건 → submissions → 호흡 «③답하기(차례 3)» 행 하나 —
 * 없으면 그 배정은 질문 축의 비교 대상이 아니다(빈 문자열로 채우지 않는다 · v5.6 C3). */
async function 중복이력(learner_id: string, as_of: unknown) {
  const 행들 = await sql`
    select e.payload ->> 'output_text' as 문장,
           (select h ->> '프롬프트'
              from jsonb_array_elements(s.task_snapshot -> '호흡') h
             where (h ->> '차례')::int = 3 limit 1) as 질문
      from engine.learning_events e
      join engine.learning_events a
        on a.intervention_id = e.intervention_id
       and a.event_type = 'task.assigned'
       and a.learner_id = e.learner_id
      join engine.submissions s on s.event_id = a.event_id
     where e.learner_id = ${learner_id}::uuid
       and e.event_type = 'intervention.delivered'
       and e.task_type = '발화녹음'
       and e.payload ->> 'generation_outcome' = '성공'
       and e.occurred_at >  ${as_of as string}::timestamptz - make_interval(days => ${중복창_일})
       and e.occurred_at <= ${as_of as string}::timestamptz
       and e.ingested_at <= ${as_of as string}::timestamptz
       and exists (
             select 1 from jsonb_array_elements(s.task_snapshot -> '호흡') h2
              where (h2 ->> '차례')::int = 2 and h2 ->> '출처' = '생성')`;
  return {
    최근문장들: 행들.map((r) => r.문장 as string).filter((x) => typeof x === 'string' && x.length > 0),
    최근질문들: 행들.map((r) => r.질문 as string).filter((x) => typeof x === 'string' && x.length > 0),
  };
}

/* 식별자 역유입 검사 대상(§10 표의 「안 나간다」 열 중 그 학생의 실물) — 검문이 trim·빈값을 거른다. */
async function 식별자들(learner_id: string): Promise<string[]> {
  const r = await sql`
    select student_code, display_name, contact, birth_year
      from engine.learners where learner_id = ${learner_id}::uuid`;
  const l = r[0] ?? {};
  return [learner_id, l.student_code, l.display_name, l.contact,
    l.birth_year == null ? null : String(l.birth_year)]
    .filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/* ── ㉤ 봉투 조립 — lib/착지봉투 한 원천(구제 경로와 같은 조립 · A12 함수 몫 규칙도 거기) ── */
async function 폴백착지(j: Job, _오늘: string, a: {
  outcome: string; deciding: string | null; gate_failed: string | null; input_text: string | null;
}) {
  const 봉 = 폴백봉투({
    estimator_version: j.estimator_version, draft: j.event_draft,
    outcome: a.outcome, gate_failed: a.gate_failed, input_text: a.input_text,
  });
  const r = await sql`
    select * from engine.jobs_finalize(
      ${j.job_id}::uuid, ${j.fence as string}::bigint, ${a.outcome}, ${sql.json(봉 as never)},
      null, ${a.deciding}::uuid, '정상')`;
  return r[0];
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return 봉투(405, { error: 'method_not_allowed' });
  if (!서비스역할(req)) return 봉투(401, { error: 'service_role 만 부를 수 있습니다' });

  const 시작 = Date.now();
  const 키 = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const owner = `deliver-one:${crypto.randomUUID()}`;
  const 계수: Record<string, number> = {};
  const 오류들: string[] = [];

  /* ── 평가 통로 (`?평가=1`) — **운영 큐 무접촉**(§8-B E5 — 평가가 generation_jobs·attempts 에 행을 만들면
   * 운영 장부가 평가로 오염된다 · `attempt_id` 금지의 그 논거) · `correct?평가=1` 선례 그대로:
   * 렌더된 요청 본문(= generation_input_text · tools/과제생성평가.js 가 같은 lib 로 조립)을 받아 **같은 동봉·같은
   * 요청 몸통·같은 타임아웃**으로 벤더만 왕복하고 원자재(원문·model·usage)를 돌려준다. 해석·검문·채점은
   * 부르는 쪽(같은 lib)이 한다. DB 는 «읽기»(자기 실행판 — rpc 전문·schema_ver)만 닿는다.
   * 🔑 실행판은 워커와 «같은 함수 하나»(자기실행판)로 낸다 — 실행기가 응답 `prompt_ver` 를 로컬 파일 판과 대조하는
   *    이중 자물쇠가 여기 걸린다(배포판 ≠ HEAD 면 평가 전체 무효). 설정 실패는 5xx+error(200+`이유` 가 아니다 —
   *    도구가 그 자리에서 부르는 왕복이라 실패를 실패로 받아야 재시도·중단 판단이 선다).
   * ⚠ 모델은 env GENERATION_MODEL(유호님 몫) — 없으면 503. 여기 리터럴 0. */
  const url = new URL(req.url);
  if (url.searchParams.get('평가') === '1') {
    if (!키) return 봉투(503, { error: 'eval_no_api_key' });
    const 모델 = Deno.env.get('GENERATION_MODEL') ?? '';
    if (!모델.trim()) return 봉투(503, { error: 'eval_no_model', 힌트: 'GENERATION_MODEL 은 유호님이 고른다(v5.13-b ④)' });
    /* 묶음 상한 = 워커 자기 예산 ÷ 학생당 타임아웃(생성상수 재료 둘에서 파생 — 손 숫자 0). */
    const 최대묶음 = Math.max(1, Math.floor(워커예산_MS / 생성타임아웃_MS));
    let 몸: { 사례?: { case_id?: string; 본문?: string }[] };
    try { 몸 = await req.json(); } catch { return 봉투(400, { error: 'body 가 JSON 이 아니다' }); }
    const 사례들 = Array.isArray(몸.사례) ? 몸.사례 : [];
    if (!사례들.length || 사례들.length > 최대묶음) {
      return 봉투(400, { error: `사례는 1~${최대묶음}건이어야 한다`, 받음: 사례들.length });
    }
    const 실행판 = await 자기실행판();
    const 결과: Record<string, unknown>[] = [];
    for (const 사 of 사례들) {
      if (!사 || typeof 사.본문 !== 'string' || !사.본문.trim()) { 결과.push({ case_id: 사?.case_id ?? null, 사유: '본문없음' }); continue; }
      if (입력초과인가(사.본문)) { 결과.push({ case_id: 사.case_id, 사유: '입력초과' }); continue; }
      try {
        const r = await fetch(메시지경로, {
          method: 'POST',
          headers: 벤더헤더(키),
          body: JSON.stringify(생성요청몸통({ 본문: 사.본문, model: 모델 })),
          signal: AbortSignal.timeout(생성타임아웃_MS),
        });
        const 원문 = await r.text();
        if (!r.ok) {
          결과.push({ case_id: 사.case_id, 사유: `벤더:${r.status}`, 벤더사유: 벤더사유(원문.slice(0, 300)), 재시도가능: 재시도가능(r.status) });
          continue;
        }
        if (응답초과인가(원문)) { 결과.push({ case_id: 사.case_id, 사유: '응답초과' }); continue; }
        let 본문: { model?: string; usage?: unknown } = {};
        try { 본문 = JSON.parse(원문); } catch { /* 원문은 그대로 싣는다 — 파서(응답파손)는 부르는 쪽 */ }
        결과.push({ case_id: 사.case_id, raw: 원문, model: 본문.model ?? null, usage: 본문.usage ?? null });
      } catch (e) {
        const 이름 = String((e as Error)?.name ?? e);
        결과.push({ case_id: 사.case_id, 사유: 이름 === 'TimeoutError' || 이름 === 'AbortError' ? '타임아웃' : `예외:${이름.slice(0, 40)}` });
      }
    }
    return 봉투(200, { 평가: true, 실행판, 결과 });
  }

  /* 「오늘」의 원천은 SQL 식 하나(§3-2-a B1 — UTC ::date 로 접으면 워커 시간대가 통째로 전날이다). */
  const 오늘 = (await sql`
    select ((now() at time zone ${시간대})::date)::text as d`)[0].d as string;

  /* 회수 — 임대 만료 job 을 큐로(별도 잡을 안 만든다 — 집기 직전 워커 자신이 · §3-2-a). */
  const 회수 = (await sql`select engine.jobs_reclaim(${오늘}::date) as n`)[0].n as number;

  const jobs = (await sql`
    select * from engine.jobs_claim(
      ${오늘}::date, ${owner}, ${워커학생상한}, ${임대_초}, null)`) as unknown as Job[];

  /* ── 집을 것 0 — B3 재호출 판정(§3-2-a v5.7 B3 · v5.8 셋째 갈래 · v5.12 · v5.13) ── */
  if (jobs.length === 0) {
    const b = (await sql`
      select (select count(*)::int from engine.generation_batch_runs r
               where r.assign_date = ${오늘}::date and r.run_kind = '배치') as 배치수,
             (select count(*)::int from engine.generation_batch_runs r
               where r.assign_date = ${오늘}::date and r.run_kind = '배치'
                 and r.finished_at is not null) as 완주수,
             (select count(*)::int from engine.generation_jobs g
               where g.assign_date = ${오늘}::date and g.status = '적재실패'
                 and g.load_retry_count < 3) as 재적재수,
             (now() < engine.gen_deadline(${오늘}::date)) as 마감전`)[0];
    const 사유 = b.완주수 === 0 ? '정본 실행 미완' : b.재적재수 > 0 ? '적재실패 재적재' : null;
    let 재호출 = '불요';
    if (사유 && b.마감전) {
      if ((b.배치수 as number) >= 배치실행상한_일) {
        재호출 = '상한소진';
        console.error(`[deliver-one] 재호출 거절 — 그날 배치 실행 ${b.배치수}/${배치실행상한_일} (ⓒ-12 · 감시 ②-b 가 이미 적색이다)`);
      } else {
        try {
          await sql`
            select net.http_post(
              url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver',
              headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
              body := '{}'::jsonb)`;
          재호출 = 사유;
        } catch (e) {
          재호출 = '실패';
          오류들.push(`재호출 실패(${사유}): ${String((e as Error)?.message ?? e)}`);
        }
      }
    }
    return 봉투(200, { 날짜: 오늘, 회수, 집음: 0, 재호출, 계수, 오류: 오류들 });
  }

  /* ── 자기 실행판(호출당 1회 — job 마다 다시 계산하면 한 회차 안에서 판이 갈릴 수 있다) ── */
  const 판 = await 자기실행판();

  for (const j of jobs) {
    /* 예산 — 다음 학생 몫(벤더 대기 + 폴백 여유)이 안 남으면 반납하고 끝낸다(§3-2 — 행 0). */
    if (Date.now() - 시작 > 워커예산_MS - 생성타임아웃_MS - 폴백여유_MS) {
      const ok = (await sql`
        select engine.jobs_release(${j.job_id}::uuid, ${j.fence as string}::bigint) as ok`)[0].ok;
      센다(계수, ok ? '반납' : '반납실패');
      continue;
    }
    try {
      const draft = j.event_draft ?? {};

      /* 키 없음 — 원리상 그날 생성 불가. 즉시 키없음 폴백(벤더 0 · attempt 0 · 머리말 참조). */
      if (!키) {
        const r = await 폴백착지(j, 오늘, { outcome: '키없음', deciding: null, gate_failed: null, input_text: null });
        센다(계수, r?.landed ? '키없음' : `키없음/${r?.reason ?? '?'}`);
        continue;
      }

      /* 상태없음(§4-3) — 판정식 = «draft 에 굳은» axes_used 의 길이 0 하나(쓸축수와 같은 수 ·
       * §6-1 C5). 재계산이 아니라 읽기다(D2) — 상태 없는 학생에게 「읽은 척하는」 생성을 안 낸다. */
      const 축들 = (draft.evidence_refs as Record<string, unknown> | undefined)?.axes_used;
      if (Array.isArray(축들) && 축들.length === 0) {
        const r = await 폴백착지(j, 오늘, { outcome: '상태없음', deciding: null, gate_failed: null, input_text: null });
        센다(계수, r?.landed ? '상태없음' : `상태없음/${r?.reason ?? '?'}`);
        continue;
      }

      /* ③ 렌더 — 요약은 draft 에서 «읽기만»(D2 · 재계산 금지). 기술 이름은 DB 의 label_ko. */
      const 요약 = draft['요약'];
      if (typeof 요약 !== 'string' || !요약.length) throw new Error('draft 에 요약이 없다(v5.13-a — 생성 대상 필수 칸)');
      const 라벨행 = await sql`
        select skill_id, label_ko from engine.skills where skill_id = any(${j.skill_ids})`;
      const 라벨 = new Map(라벨행.map((r) => [r.skill_id as string, r.label_ko as string]));
      const 기술들 = j.skill_ids.map((id) => 라벨.get(id)).filter((x): x is string => !!x);
      if (기술들.length !== j.skill_ids.length) throw new Error('겨냥 기술의 label_ko 를 못 읽었다(적재 대조 ⑦ 를 지난 ID 다 — 시드 사고)');
      const 본문 = 렌더(프롬프트전문 as unknown as string, { 요약, 기술들 });
      if (본문 == null) throw new Error('프롬프트 본문 템플릿을 못 찾았다(prompts/과제생성.md 펜스)');

      /* ②' 중복 이력 + 식별자(검문 입력) — as_of 경계는 job 에 굳힌 값 하나(D1). */
      const 이력 = await 중복이력(j.learner_id, j.snapshot_as_of);
      const 식별 = await 식별자들(j.learner_id);

      /* ㉢ 시도 열기 — 부르기 «전». 판 대조·중복 과금 차단은 함수가 진다. */
      const 초과전 = 입력초과인가(본문);
      const 열기 = (await sql`
        select * from engine.attempt_open(
          ${j.job_id}::uuid, ${j.fence as string}::bigint,
          ${판.model}, ${판.prompt_ver}, ${판.policy_ver},
          ${판.estimator_version}, ${판.schema_ver}, ${판.skill_taxonomy_ver}, ${본문})`)[0];
      if (열기.reject_reason === '판불일치') {
        const r = await 폴백착지(j, 오늘, { outcome: '판불일치', deciding: null, gate_failed: null, input_text: null });
        센다(계수, r?.landed ? '판불일치' : `판불일치/${r?.reason ?? '?'}`);
        continue;
      }
      if (열기.reject_reason === '중복열림') {
        /* 갈래 12 — 받았는지 모르는 열린 시도. 다시 부르면 중복 과금 → 건너뛴다(머리말). */
        센다(계수, '중복열림건너뜀');
        continue;
      }
      if (열기.reject_reason != null) { 센다(계수, `열기거절/${열기.reject_reason}`); continue; }
      const attempt_id = 열기.attempt_id as string;

      /* 입력초과 — 부르기 «전» 실패(비용 0). 행은 남긴다(§4-1 C2 — 전문은 request_body 에). */
      if (초과전) {
        await sql`select engine.attempt_close(${attempt_id}::uuid, null, '입력초과', null) as ok`;
        const r = await 폴백착지(j, 오늘, { outcome: '입력초과', deciding: attempt_id, gate_failed: null, input_text: null });
        센다(계수, r?.landed ? '입력초과' : `입력초과/${r?.reason ?? '?'}`);
        continue;
      }

      /* ④ 벤더 왕복 — 타임아웃은 학생 예산 하나(§3-2). model 은 job 실행판(적용하려던 판). */
      let 원문: string | null = null;
      let 결과: string | null = null;   // attempts.result (부분집합 7)
      try {
        const r = await fetch(메시지경로, {
          method: 'POST',
          headers: 벤더헤더(키),
          body: JSON.stringify(생성요청몸통({ 본문, model: j.model })),
          signal: AbortSignal.timeout(생성타임아웃_MS),
        });
        원문 = await r.text();
        if (!r.ok) 결과 = '벤더오류';
      } catch (e) {
        결과 = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError'
          ? '타임아웃' : '벤더오류';
        원문 = null;   // 받은 것이 없다(§4-2 — 타임아웃·전송 실패의 raw 는 null)
      }
      if (결과 == null && 원문 != null && 응답초과인가(원문)) 결과 = '응답초과';

      let 성공값: { sentence: string; question: string } | null = null;
      let 사유들: string[] | null = null;
      if (결과 == null && 원문 != null) {
        let 벤더봉투: unknown = null;
        try { 벤더봉투 = JSON.parse(원문); } catch { /* 아래 파서가 응답파손으로 접는다 */ }
        const 읽음 = 생성응답읽기(벤더봉투);
        if (읽음.값) 성공값 = 읽음.값; else 결과 = '응답파손';
      }
      let 검문값: { ok: boolean; 사유: string | null; 사유들: string[]; 문장: string; 질문: string } | null = null;
      if (결과 == null && 성공값) {
        검문값 = 검문({
          문장: 성공값.sentence, 질문: 성공값.question,
          식별자들: 식별, 최근문장들: 이력.최근문장들, 최근질문들: 이력.최근질문들,
        });
        if (검문값.ok) { 결과 = '성공'; } else { 결과 = '검문탈락'; 사유들 = 검문값.사유들; }
      }

      const 닫힘 = (await sql`
        select engine.attempt_close(
          ${attempt_id}::uuid, ${원문}, ${결과}, ${사유들}) as ok`)[0].ok;
      if (!닫힘) { 센다(계수, '닫기경합'); continue; }   // 낡은 세대 — 착지도 남의 몫이다

      if (결과 === '성공' && 검문값) {
        /* ⑥ 성공 착지 — 문장·질문은 검문 «정규화 후» 값(§7 표 · 대조 ⑥ 파서와 동치). */
        const snap = 스냅샷(오늘, 검문값.문장, '생성', 검문값.질문);
        const 봉 = 착지봉투({
          estimator_version: j.estimator_version, draft: j.event_draft,
          outcome: '성공', snap, output_text: 검문값.문장, gate_failed: null, input_text: 본문,
        });
        const r = (await sql`
          select * from engine.jobs_finalize(
            ${j.job_id}::uuid, ${j.fence as string}::bigint, '성공', ${sql.json(봉 as never)},
            ${attempt_id}::uuid, null, '정상')`)[0];
        센다(계수, r?.landed ? '성공' : `성공/${r?.reason ?? '?'}`);
      } else {
        const r = await 폴백착지(j, 오늘, {
          outcome: 결과 as string, deciding: attempt_id,
          gate_failed: 결과 === '검문탈락' ? (검문값?.사유 ?? null) : null,
          input_text: 본문,   // 여기 오는 갈래는 전부 «부른 뒤»다(§11-2 — 입력초과만 null)
        });
        센다(계수, r?.landed ? (결과 as string) : `${결과}/${r?.reason ?? '?'}`);
      }
    } catch (e) {
      /* 우리 코드가 죽었다 — 내부오류 폴백을 «시도»한다(§4-1). 그것도 죽으면 로그만 남고
       * job 은 claimed 로 남아 임대 만료 → 다음 회차 또는 마감 스윕이 닫는다. */
      오류들.push(`job ${j.job_id}: ${String((e as Error)?.message ?? e)}`);
      try {
        const r = await 폴백착지(j, 오늘, { outcome: '내부오류', deciding: null, gate_failed: null, input_text: null });
        센다(계수, r?.landed ? '내부오류' : `내부오류/${r?.reason ?? '?'}`);
      } catch (e2) {
        센다(계수, '내부오류착지실패');
        오류들.push(`job ${j.job_id} 내부오류 착지 실패: ${String((e2 as Error)?.message ?? e2)}`);
      }
    }
  }

  return 봉투(200, { 날짜: 오늘, 회수, 집음: jobs.length, 계수, 오류: 오류들 });
});
