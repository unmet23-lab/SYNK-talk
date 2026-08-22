/* 생성모드 — 상태기반 과제 생성의 **오케스트레이터** (§3 ① · 벤더 호출 0 · 빠르다)
 *
 * ■ 왜 벤더 0 인가(§3) — 이 함수도 150초를 진다. 선판정(순수)·상태 굳히기·큐 적재(DB)만 하고,
 *   벤더 대기는 전부 단건 워커(deliver-one)의 몫이다. 학급 17명이 한 호출에 다 들어가는 근거.
 * ■ 진입 = index.ts 배달하기의 활성 게이트(전원 모드만) — 재료(학급·교정문·원신호)는 현행
 *   배달과 **같은 조회 하나**(`대상조회`)를 지나고, 게임 갈래도 **같은 함수**(`게임갈래`)를
 *   먼저 탄다(두 벌이면 같은 학생이 두 통로에서 다른 것을 받는다).
 * ■ 상태의 생산자는 여기 «하나»다(D2 · §3-5-b A8) — `학습자상태()` 1회 + `과제요약()` 으로
 *   draft(스냅샷·요약·근거)를 굳혀 job 에 싣는다. 워커는 그 draft 를 «렌더만» 한다.
 * ■ 실행판(§5-2·D3)은 여기서 산출해 ⓪ 시작 행에 굳힌다 — 조립은 lib/실행판 하나(워커의
 *   자기 판 대조와 같은 함수 — 각자 조립하면 매일 판불일치다).
 * ■ 적재 예산(§3-2 `적재예산_MS`) — 소진되면 ㉠ 를 «안 부르고» 끝낸다(행 0 · 시작 행은 미완으로
 *   남아 B3 재호출이 다음 회차에 이어받는다). 부분 적재를 만들지 않는다.
 * ■ 명단 등식(㉠ 갈래 5) — 재적 전원이 targets ∪ skipped_game 어느 한쪽에 있어야 한다.
 *   동의 없음·상태 계산 실패·게임 배정 실패는 «건너뛰기»가 아니라 `load_error` 원소로 넣는다
 *   (적재실패 행이 서고 B4 재적재·감시 ①이 받는다 — 조용히 빈손이 되는 학생이 없다). */
import 실행판모듈 from './실행판.mjs';
import 과제모듈 from './오늘과제.mjs';
import 갈래모듈 from './갈래판정.mjs';
import 기술모듈 from './기술선택.mjs';
import 요약모듈 from './과제요약.mjs';
import 상태모듈 from './학습자상태.mjs';
import 검문모듈 from './과제검문.mjs';
import 상수모듈 from './생성상수.mjs';
import 판재료모듈 from './판재료.mjs';
import 게임배정모듈 from './게임배정.mjs';
import 착지봉투모듈 from './착지봉투.mjs';
import 계약판모듈 from './계약판.mjs';
import 프롬프트전문 from './과제생성프롬프트.mjs';

const { 실행판조립, RPC질의문, 판질의문 } = 실행판모듈 as {
  실행판조립: (재료: Record<string, unknown>) => Record<string, string>;
  RPC질의문: () => string;
  판질의문: () => string;
};
const { 오늘과제, 따라말하기문장, 시간대 } = 과제모듈 as {
  오늘과제: (재료: Record<string, unknown>) => Record<string, unknown>;
  따라말하기문장: (snap: unknown) => string | null;
  시간대: string;
};
const { 갈래판정 } = 갈래모듈 as {
  갈래판정: (재료: Record<string, unknown>) => { 갈래: string; 출처: string; degraded: boolean };
};
const { 기술선택 } = 기술모듈 as {
  기술선택: (재료: Record<string, unknown>) => { skill_ids: string[]; 시작위치: number };
};
const { 과제요약 } = 요약모듈 as {
  과제요약: (상태: Record<string, unknown>, 조각: Record<string, unknown>) =>
    { 요약: string; 쓸축수: number; axes_used: string[]; evidence_refs: Record<string, unknown> };
};
const { 학습자상태 } = 상태모듈 as {
  학습자상태: (행들: unknown[], 옵션: Record<string, unknown>) => Record<string, unknown>;
};
const { 중복창_일 } = 검문모듈 as { 중복창_일: number };
const { 적재예산_MS, 임대_초 } = 상수모듈 as { 적재예산_MS: number; 임대_초: number };
const { 폴백봉투 } = 착지봉투모듈 as {
  폴백봉투: (재료: Record<string, unknown>) => Record<string, unknown>;
};
const { 게임날인가 } = 게임배정모듈 as { 게임날인가: (날짜: string) => boolean };
const { 행들에서판 } = 계약판모듈 as { 행들에서판: (행들: unknown) => string | null };

type Sql = {
  (strings: TemplateStringsArray, ...args: unknown[]): Promise<Record<string, unknown>[]>;
  unsafe: (q: string) => Promise<Record<string, unknown>[]>;
  json: (v: unknown) => unknown;
};

const 급수꼴 = /^Lv[1-6]$/;

/* ── 학생 하나의 선판정·draft 조립(벤더 0 · 순수 재료만) — 전원(㉠)과 구제(㉨)가 같은 함수 하나.
 * 반환 = { target, 계수키 } — 실패도 target 이다(load_error 원소 · 명단 등식과 B4 재적재 몫). */
function 학생조립(학생: Record<string, unknown>, 재료: {
  오늘: string; 스냅기준: string; 후보: string[]; 최근겨냥: string[];
}): { target: Record<string, unknown>; 계수키: string } {
  const learner_id = String(학생.learner_id);
  const { 오늘, 스냅기준, 후보, 최근겨냥 } = 재료;
  try {
    const 전날문장 = 따라말하기문장(학생.마지막스냅샷);
    const 첫날 = !학생.마지막배정;
    const 교정문 = (학생.교정문 ?? null) as string | null;
    const 판정 = 갈래판정({ 첫날, 교정문, 전날문장 });

    /* 급수 정규화(A11 ⑤ — 값목록 밖은 null 로 접는다 · «중급» 류가 적재를 죽이지 않게)
     * + §7-1 게이트: 첫날·교정문이 아닌 학생만 급수로 가른다(갈래 우선순위가 먼저다). */
    const 원급수 = (학생.level_current ?? null) as string | null;
    const lvl = 원급수 && 급수꼴.test(원급수) ? 원급수 : null;
    let 사유: string | null = null;
    if (판정.갈래 === '첫날') 사유 = '첫날';
    else if (판정.갈래 === '교정문') 사유 = '교정문';
    else if (lvl === null) 사유 = '미정';
    else if (lvl === 'Lv1' || lvl === 'Lv2') 사유 = '초급';

    /* 그날 조립기 출력을 draft 에 굳힌다(§7-2 — 폴백·비대상이 그대로 쓴다 · 재호출 0). */
    const 결정 = 오늘과제({ 날짜: 오늘, 첫날, 교정문, 전날문장, 급수: 원급수 });

    /* 상태 1회(D2 — 생산자 하나) → §6 요약·근거. 실패는 load_error(§4-3 상태오류). */
    const 상태 = 학습자상태(((학생.원신호 ?? []) as unknown[]),
      { as_of: 스냅기준, ingested_as_of: 스냅기준, 시간대 });
    const 요약산출 = 과제요약(상태, {
      목표: (학생.goal_track ?? null) as string | null, 급수: 원급수,
      /* ㉢ 나침반(경로 A) — 대상조회가 배정 날짜의 시즌에서 걷어 온 season_goal.
       * 없으면 null → 요약에 안 실린다(널 규칙 · 나침반 0행이 개원 전 정상 상태). */
      시즌목표: (학생.시즌목표 ?? null) as string | null,
    });

    /* 겨냥(§6-0) — 대상만. 비대상은 빈 배열(A11 ⑦ 존재 대조는 빈 배열 면제). */
    const skill_ids = 사유 === null
      ? 기술선택({ learner_id, assign_date: 오늘, 후보, 최근겨냥 }).skill_ids
      : [];

    return {
      계수키: 사유 === null ? '대상' : `비대상/${사유}`,
      target: {
        learner_id,
        branch_snapshot: {
          ver: 1,
          is_first_day: 첫날,
          correction_ref: 사유 === '교정문' ? (학생.교정id ?? null) : null,
          is_game_day: false,
          level: lvl,
          goal: (학생.goal_track ?? null) as string | null,
        },
        skill_ids,
        ...(사유 !== null ? { not_target_reason: 사유 } : {}),
        event_draft: {
          task_ref: `task-${오늘}`,
          task_snapshot: 결정.task_snapshot,
          estimator_version: String(상태.estimator_version ?? ''),
          estimator_confidence: 상태.estimator_confidence ?? null,
          evidence_refs: 요약산출.evidence_refs,
          요약: 요약산출.요약,
        },
      },
    };
  } catch (e) {
    return {
      계수키: '상태오류',
      target: { learner_id, load_error: `상태오류: ${String((e as Error)?.message ?? e)}`.slice(0, 200) },
    };
  }
}

export async function 생성배달(ctx: {
  sql: Sql; 오늘: string; 스냅기준: string;
  대상: Record<string, unknown>[];
  봉투: (status: number, body: Record<string, unknown>) => Response;
  게임갈래: (학생: Record<string, unknown>, 오늘: string, ver: string) => Promise<Record<string, unknown> | null>;
}): Promise<Response> {
  const { sql, 오늘, 스냅기준, 대상, 봉투, 게임갈래 } = ctx;
  const 시작 = Date.now();

  /* ── 실행판(⓪ 에 굳는다 · 워커의 자기 판과 같은 조립 하나) ── */
  let rpc전문 = '';
  try {
    rpc전문 = String((await sql.unsafe(RPC질의문()))[0]?.전문 ?? '');
  } catch (e) { console.error('[deliver/생성] rpc 재료 조회 실패', String((e as Error)?.message ?? e)); }
  let schema_ver = '';
  try {
    schema_ver = 행들에서판(await sql.unsafe(판질의문())) ?? '';
  } catch (e) { console.error('[deliver/생성] schema_ver 조회 실패', String((e as Error)?.message ?? e)); }
  const 판 = 실행판조립({
    model: Deno.env.get('GENERATION_MODEL') ?? '',
    프롬프트전문: 프롬프트전문 as unknown as string,
    rpc전문, schema_ver, 판재료: 판재료모듈,
  });
  if (!판.schema_ver) {
    /* deliver 현행과 같은 규칙 — DB 판을 못 읽으면 아무 행도 안 만든다(함수가 DB 보다 앞설 수 없다). */
    console.error('[deliver/생성] DB 계약판을 못 읽었다 — 행 무접촉으로 끝낸다');
    return 봉투(500, { ok: false, date: 오늘, mode: '생성', error: { code: 'SERVER_ERROR', message: '서버 설정 오류입니다' } });
  }
  if (!판.model) {
    /* v5.13-b ④ — 모델은 유호님이 고른다. env 가 서기 전에는 행 무접촉(correct 「키 없음」 선례):
     * 여기서 ⓪ 를 세우면 워커가 전 학생을 판불일치 폴백으로 닫는다 — 설정 미비가 폴백 강행이 된다. */
    console.error('[deliver/생성] GENERATION_MODEL 미설정 — 행을 건드리지 않고 끝낸다');
    return 봉투(200, { ok: true, date: 오늘, mode: '생성', 재적: 대상.length, 이유: 'no_model' });
  }

  /* ── 명단 봉투(㉠ 등식의 왼변 — «재적 전원») — SQL 로 계산해 구제 갈래(⓪ ㉯)와 동치 보장 ── */
  const 명단 = (await sql`
    select count(*)::int as 재적,
           encode(extensions.digest(convert_to(
             coalesce(string_agg(lid, E'\n' order by lid collate "C"), ''), 'UTF8'), 'sha256'), 'hex') as 해시
      from (select learner_id::text as lid from engine.learners) m`)[0];
  const 분포 = (await sql`
    select jsonb_object_agg(k, coalesce(d.수, 0)) as 값
      from unnest(array['Lv1','Lv2','Lv3','Lv4','Lv5','Lv6','null']) k
      left join (
        select coalesce(l.level_current, 'null') as 급수, count(*)::int as 수
          from engine.learners l group by 1) d on d.급수 = k`)[0];

  const run행 = await sql`
    select engine.batch_run_start(
      ${오늘}::date, '배치',
      ${sql.json({
        snapshot_as_of: 스냅기준,
        calendar_game_day: 게임날인가(오늘),
        model: 판.model, prompt_ver: 판.prompt_ver, policy_ver: 판.policy_ver,
        estimator_version: 판.estimator_version, schema_ver: 판.schema_ver,
        skill_taxonomy_ver: 판.skill_taxonomy_ver,
      })},
      ${sql.json({
        enrolled_count: 명단.재적, roster_hash: 명단.해시, level_distribution: 분포.값,
      })}) as run_id`;
  const run_id = run행[0]?.run_id as string | null;
  if (!run_id) {
    /* 리더 게이트(갈래 11) — 살아 있는 미완 실행이 있다. 물러남은 사고가 아니다(조용히 끝낸다). */
    return 봉투(200, { ok: true, date: 오늘, mode: '생성', 재적: 대상.length, 이유: '리더 존재' });
  }

  /* ── 겨냥 이력(§6-0 · ②' 의 오케스트레이터 몫) — 배치 1회 · 이중 cutoff ──
   * E3(폴백 행엔 skill_ids 가 안 실린다 — '{}')가 자연 필터라 성공 행만 남는다.
   * task_type 은 이 트랙의 통로 상수(§3 C3) — 다른 생산자의 개입이 회전에 안 낀다. */
  const 겨냥행들 = await sql`
    select e.learner_id::text as lid, x.skill_id
      from engine.learning_events e, unnest(e.skill_ids) x(skill_id)
     where e.event_type = 'intervention.delivered'
       and e.task_type = '발화녹음'
       and e.occurred_at >  ${스냅기준}::timestamptz - make_interval(days => ${중복창_일})
       and e.occurred_at <= ${스냅기준}::timestamptz
       and e.ingested_at <= ${스냅기준}::timestamptz`;
  const 겨냥맵 = new Map<string, string[]>();
  for (const r of 겨냥행들) {
    const k = String(r.lid);
    if (!겨냥맵.has(k)) 겨냥맵.set(k, []);
    겨냥맵.get(k)!.push(String(r.skill_id));
  }
  /* 후보 = engine.skills domain='grammar' 전량(§6-0 원천 — 급수 필터는 이번 판 0 · §7-1). */
  const 후보 = (await sql`
    select skill_id from engine.skills where domain = 'grammar' order by skill_id`)
    .map((r) => String(r.skill_id));

  /* ── 학생 루프 — 선판정·draft 조립(벤더 0 · 예산 게이트) ── */
  const targets: Record<string, unknown>[] = [];
  const skipped_game: string[] = [];
  const 계수: Record<string, number> = {};
  const 센다 = (k: string) => { 계수[k] = (계수[k] ?? 0) + 1; };
  let 예산소진 = false;

  for (const 학생 of 대상) {
    if (Date.now() - 시작 > 적재예산_MS) { 예산소진 = true; break; }
    const learner_id = String(학생.learner_id);

    if (!학생.consent_ver) {
      /* 명단 등식 몫 — 건너뛰면 등식이 깨진다. 적재실패 행이 서고 감시 ①이 본다(머리말). */
      targets.push({ learner_id, load_error: '동의없음 — 동의가 서는 날 B4 재적재가 집는다' });
      센다('동의없음');
      continue;
    }

    /* 게임 갈래 — 현행과 같은 함수 하나. 서면 job 0(§3-4 · A11 ①), 실패는 load_error 로. */
    const 게임 = await 게임갈래(학생, 오늘, 판.schema_ver);
    if (게임) {
      if (게임.status === 'failed') {
        targets.push({ learner_id, load_error: `게임배정실패: ${String(게임.사유 ?? '')}`.slice(0, 200) });
        센다('게임실패');
      } else {
        skipped_game.push(learner_id);
        센다('게임');
      }
      continue;
    }

    const 조립 = 학생조립(학생, { 오늘, 스냅기준, 후보, 최근겨냥: 겨냥맵.get(learner_id) ?? [] });
    targets.push(조립.target);
    센다(조립.계수키);
  }

  if (예산소진) {
    /* ㉠ 를 «안 부른다»(§3-2 — 부분 적재 0). 시작 행은 미완으로 남고 B3 가 이어받는다. */
    console.error(`[deliver/생성] 적재 예산 소진 — ${targets.length + skipped_game.length}/${대상.length} 조립 뒤 중단(행 0)`);
    return 봉투(200, {
      ok: true, date: 오늘, mode: '생성', run_id, 재적: 대상.length,
      이유: '적재예산소진', 계수,
    });
  }

  const 적재 = (await sql`
    select engine.jobs_load(
      ${오늘}::date, ${run_id}::uuid, ${sql.json(targets)}, ${skipped_game}::uuid[]) as r`)[0].r;

  console.log(`[deliver/생성] ⓪ ${run_id} · 적재 ${JSON.stringify(적재)} · 계수 ${JSON.stringify(계수)}`);
  return 봉투(200, {
    ok: true, date: 오늘, mode: '생성', run_id, 재적: 대상.length,
    적재, 계수,
  });
}

/* ── ㉨ 구제 — 학생 조회가 부른다(tasks · §3-1). 생성을 «안» 부른다(P0-E) · claim 은 «잡는다»
 * (A군 ㉢ — 안 잡으면 워커와의 경쟁을 최종 유일키가 사후에 정한다). 벤더 0 은 ㉤ 구제 모드가
 * 물리로 강제한다(B1 — attempts 있으면 예외 → 반납하고 «생성중»으로 물러난다). */
export async function 구제배달(ctx: {
  sql: Sql; 오늘: string; 스냅기준: string;
  학생: Record<string, unknown>;
  봉투: (status: number, body: Record<string, unknown>) => Response;
  게임갈래: (학생: Record<string, unknown>, 오늘: string, ver: string) => Promise<Record<string, unknown> | null>;
}): Promise<Response> {
  const { sql, 오늘, 스냅기준, 학생, 봉투, 게임갈래 } = ctx;
  const learner_id = String(학생.learner_id);
  const 응답 = (결과: string, 나머지: Record<string, unknown> = {}) =>
    봉투(200, { ok: true, date: 오늘, mode: '구제', 결과, ...나머지 });

  if (!학생.consent_ver) return 응답('동의없음');

  /* 구제의 실행판 = 그 날짜 «정본 실행 행»의 값(v5.7 D3 · A1 — 완주 우선 · 없으면 마지막 시작 행).
   * 그날 배치 행이 0 이면(전멸일) ㉯: 현행 조립로 직접 짓는다(ⓓ-14 — 🚫 「가장 최근 행 차용」). */
  const 정본 = (await sql`
    select model, prompt_ver, policy_ver, estimator_version, schema_ver, skill_taxonomy_ver
      from engine.generation_batch_runs r
     where r.assign_date = ${오늘}::date and r.run_kind = '배치'
     order by (r.finished_at is not null) desc, r.started_at desc limit 1`)[0] ?? null;
  let 실행판: Record<string, string>;
  if (정본) {
    실행판 = {
      model: String(정본.model), prompt_ver: String(정본.prompt_ver),
      policy_ver: String(정본.policy_ver), estimator_version: String(정본.estimator_version),
      schema_ver: String(정본.schema_ver), skill_taxonomy_ver: String(정본.skill_taxonomy_ver),
    };
  } else {
    let rpc전문 = ''; let schema_ver = '';
    try { rpc전문 = String((await sql.unsafe(RPC질의문()))[0]?.전문 ?? ''); } catch { /* 아래 검사 */ }
    try { schema_ver = 행들에서판(await sql.unsafe(판질의문())) ?? ''; } catch { /* 아래 검사 */ }
    실행판 = 실행판조립({
      model: Deno.env.get('GENERATION_MODEL') ?? '',
      프롬프트전문: 프롬프트전문 as unknown as string,
      rpc전문, schema_ver, 판재료: 판재료모듈,
    });
    if (Object.values(실행판).some((v) => !v)) {
      /* ⓪ 의 비공백 CHECK 를 못 지난다 — 구제 run 자체가 못 선다. 학생은 빈 배정으로(다음 회차 몫). */
      console.error('[deliver/구제] 전멸일 ㉯ 인데 실행판을 못 조립했다 — 구제 run 없이 물러난다', learner_id);
      return 응답('실행판없음');
    }
  }

  /* 게임 갈래 — 현행과 같은 함수 하나(게임이 서면 job 0 그대로 그 배정을 반환한다). */
  const 게임 = await 게임갈래(학생, 오늘, 실행판.schema_ver);
  if (게임) {
    if (게임.status === 'failed') return 응답('게임실패', { 사유: 게임.사유 ?? null });
    return 응답('게임', { event_id: 게임.event_id ?? null });
  }

  const run_id = (await sql`
    select engine.batch_run_start(
      ${오늘}::date, '구제',
      ${sql.json({
        snapshot_as_of: 스냅기준, calendar_game_day: 게임날인가(오늘), ...실행판,
      })}, null) as run_id`)[0].run_id as string;

  /* 조립 재료(단건) — 전원 루프와 같은 함수·같은 원천. */
  const 후보 = (await sql`
    select skill_id from engine.skills where domain = 'grammar' order by skill_id`)
    .map((r) => String(r.skill_id));
  const 최근겨냥 = (await sql`
    select distinct x.skill_id
      from engine.learning_events e, unnest(e.skill_ids) x(skill_id)
     where e.learner_id = ${learner_id}::uuid
       and e.event_type = 'intervention.delivered'
       and e.task_type = '발화녹음'
       and e.occurred_at >  ${스냅기준}::timestamptz - make_interval(days => ${중복창_일})
       and e.occurred_at <= ${스냅기준}::timestamptz
       and e.ingested_at <= ${스냅기준}::timestamptz`)
    .map((r) => String(r.skill_id));
  const 조립 = 학생조립(학생, { 오늘, 스냅기준, 후보, 최근겨냥 });

  /* ⚠ `job` 은 복합 타입(행) — 드라이버가 문자열로 접으므로 SQL 에서 칸을 편다(안 펴면
   * status 가 undefined 라 모든 갈래가 조용히 «생성중»이 된다 — 08-22 리허설 실측). */
  const ld = (await sql`
    select kind, (job).status as job_status, assigned_event_id
      from engine.jobs_load_one(
        ${오늘}::date, ${run_id}::uuid, ${sql.json(조립.target)})`)[0];
  if (!ld) return 응답('생성중');
  if (ld.kind === '이미배정') return 응답('이미배정', { event_id: ld.assigned_event_id });
  if (ld.kind === '조립실패') return 응답('조립실패', { 조립: 조립.계수키 });
  if (ld.assigned_event_id) return 응답('이미착지', { event_id: ld.assigned_event_id });
  if (ld.job_status !== '대기') return 응답('생성중');

  /* claim → ㉤ 구제 착지(원자) — 못 잡으면 워커가 쥔 것(§3-1: 생성도 폴백도 안 하고 물러난다). */
  const 잡음 = (await sql`
    select * from engine.jobs_claim(
      ${오늘}::date, ${'deliver-구제:' + crypto.randomUUID()}, 1, ${임대_초}, ${learner_id}::uuid)`)[0];
  if (!잡음) return 응답('생성중');
  try {
    const 봉 = 폴백봉투({
      estimator_version: String(잡음.estimator_version), draft: 잡음.event_draft,
      outcome: '구제경로', gate_failed: null, input_text: null,
    });
    const fin = (await sql`
      select * from engine.jobs_finalize(
        ${잡음.job_id}::uuid, ${잡음.fence as string}::bigint, '구제경로', ${sql.json(봉 as never)},
        null, null, '구제')`)[0];
    if (fin?.landed) return 응답('구제착지', { event_id: fin.assigned_event_id });
    if (fin?.reason === '멱등') return 응답('이미착지', { event_id: fin.assigned_event_id });
    await sql`select engine.jobs_release(${잡음.job_id}::uuid, ${잡음.fence as string}::bigint)`;
    return 응답('생성중', { 사유: fin?.reason ?? null });
  } catch (e) {
    /* B1(attempts 있는 job — 마감 뒤 벤더 경합 방지) 등 — 반납하고 물러난다(워커·스윕 몫). */
    console.error('[deliver/구제] 착지 예외 — 반납하고 물러난다', learner_id, String((e as Error)?.message ?? e));
    try {
      await sql`select engine.jobs_release(${잡음.job_id}::uuid, ${잡음.fence as string}::bigint)`;
    } catch { /* 반납 실패는 임대 만료가 받는다(㉥) */ }
    return 응답('생성중');
  }
}
