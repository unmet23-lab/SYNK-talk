/* 교정 배치 — 학생 발화에 **AI 1차 교정안**을 붙인다. (대기열 P1 · L0 §679 `ai_processing_logs`)
 *
 * ■ 이 자리가 무엇을 닫나 — 「생산자 0」
 *   `engine.review_queue` 는 「학생 제출 행 + **AI 교정이 섰음**」을 inner join 으로 요구한다.
 *   그런데 저장소 전체에 `engine.corrections` INSERT 가 **0줄**이라, 학생 발화에는 그 교정이
 *   영원히 안 붙고 큐는 **구조적으로 0행**이었다(리허설 실측: 제출 704 · AI 교정 462 · 큐 0 —
 *   462건은 전부 배달 사건에 붙은 것이라 검수 대상이 아니다). 큐가 0이면 검수·승격·엔진
 *   도달이 전부 0이다. 그 첫 마디가 여기다.
 *
 * ■ 두 통로 — 기본은 **배치**, `?즉시=1` 이면 그 자리에서 (유호 승인 08-09 「캐싱 + 배치」)
 *   ① **배치**(기본): 벤더의 Message Batches 로 절반 값에 돌린다. 비동기라 한 번의 호출이
 *      두 마디를 한다 — **먼저 회수, 그다음 제출.** 야간 cron 이 매일 한 번 부르면 어젯밤
 *      제출분을 걷고 오늘치를 내보낸다. 왕복은 최대 24시간까지 걸릴 수 있다.
 *   ② **즉시**(`?즉시=1`): 종전대로 한 건씩 동기 왕복. 값은 정가지만 **지금 결과가 필요한
 *      자리**(키를 넣은 날의 첫 확인, 검수자가 급히 한 건)가 남아야 해서 지운 게 아니라 뒀다.
 *   두 통로는 같은 `요청몸통()` 을 쓴다 — 프롬프트·모델·캐시 설정이 갈리면 「배치로 만든 것」과
 *   「즉시 만든 것」의 품질이 달라지는데 그 차이는 행 어디에도 안 남는다.
 *
 * ■ 🔴 회수가 **설정 검사보다 먼저** 온다
 *   프롬프트 판을 못 읽거나 값목록이 갈라진 상태여도, 이미 벤더에 **돈을 낸 결과**는 걷는다.
 *   그 검사들은 「내보내도 되는가」를 묻는 것이지 「걷어도 되는가」가 아니다. 순서를 반대로
 *   두면 설정 실수 하나가 이미 지불한 배치를 통째로 버린다.
 *
 * ■ 🔴 못 하는 이유는 **행을 안 건드리고** 응답에 적는다 (`transcribe` 와 같은 판단)
 *   키 없음·프롬프트 못 읽음·값목록 어긋남은 그 발화의 문제가 아니라 **우리 설정 문제**다.
 *   그때 행을 실패로 못박으면 설정이 고쳐지는 날 그 발화들은 두 번 다시 안 집어진다.
 *   그래서 세지 못한 이유를 응답에 적고 끝낸다. 🔑 **분모를 먼저 센다** — 「0건 처리」가
 *   「대기가 0」인지 「집다가 죽었다」인지 갈려야 한다(F207: 미실행은 통과와 같은 모양으로 온다).
 *
 * ■ 🔴 동의는 **`engine.consents` 를 직접 본다** — `pipeline_jobs.status='revoked'` 를 안 믿는다
 *   그 값은 값목록에만 있고 **아무도 쓰지 않는다**(실측: writer 0). 그것으로 철회를 막으면
 *   가드는 늘 통과하고, 새는 방향은 학생 발화가 **벤더로 나가는** 쪽이다. 술어의 정본은
 *   `lib/동의게이트.js 지금유효술어` 하나이고 `tests/동의게이트.test.js` 가 이 파일을 묶는다.
 *
 * ■ 락을 안 건다 (`transcribe` 와 같은 근거)
 *   벤더 왕복 내내 트랜잭션을 열어 두는 값이 크다. 대신 INSERT 자체에 「이미 AI 교정이 있으면
 *   넣지 않는다」를 걸었다 — 두 배치가 같은 행을 집어도 두 번째는 0행이 된다.
 *   ⚠ 완전한 상호배제는 아니다(부분 유니크 인덱스가 있어야 원리상 닫힌다 — 그건 마이그레이션
 *     이라 이 배선의 몫이 아니다). 겹쳐서 두 벌이 서더라도 검수 뷰가 **가장 최근 하나**를
 *     고르므로 화면은 안 깨진다. 남는 것은 지워야 할 행 하나뿐이고 그건 되돌릴 수 있다.
 */
import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';
import 교정모듈 from './교정엔진.mjs';
import 계약 from './계약.mjs';
import 지시문 from './교정프롬프트.mjs';
import 계약판모듈 from './계약판.mjs';

const { 서비스역할 } = 토큰모듈 as { 서비스역할: (req: Request) => boolean };

type 성적 = { 입력: number; 캐시생성: number; 캐시읽음: number };
type 교정칸 = {
  corrected_text?: string; error_tags?: string[]; explanation?: string | null; 사유: string | null;
};

const {
  모델, 왕복제한밀리, 메시지경로, 배치경로, 벤더헤더,
  프롬프트판, 태그어긋남, 요청몸통, 응답글, 교정값, 재시도가능, 벤더사유,
  배치몸통, 배치키어긋남, 배치줄해석, 캐시성적, 성적합,
} = 교정모듈 as {
  모델: string;
  왕복제한밀리: number;
  메시지경로: string;
  배치경로: string;
  벤더헤더: (키: string) => Record<string, string>;
  프롬프트판: (지시문: string) => string | null;
  태그어긋남: (지시문: string, 태그목록: string[]) => { 프롬프트에없음: string[]; 계약에없음: string[] };
  요청몸통: (a: { 지시문: string; 문장: string; 급수: string | null; 맥락?: string }) => Record<string, unknown>;
  응답글: (본문: unknown) => string | null;
  교정값: (글: string, 태그목록: string[]) => 교정칸;
  재시도가능: (status: number) => boolean;
  벤더사유: (글: string, 상한?: number) => string | null;
  배치몸통: (행들: unknown[], 지시문: string, 판: string) => Record<string, unknown>;
  배치키어긋남: (행들: unknown[], 판: string) => string[];
  배치줄해석: (줄: string) => {
    submission_id?: string; 판?: string; 글?: string; 모델?: string;
    사용량?: Record<string, number> | null; 사유: string | null;
  };
  캐시성적: (usage: unknown) => 성적;
  성적합: (성적들: 성적[]) => 성적;
};

/* 🔴 오류태그 값목록의 **정본은 계약 JSON 하나**다(L0 §237 — DB CHECK 를 안 걸고 검증을
 *   서버에 맡겼다). 여기서 배열을 다시 적으면 그게 세 번째 사본이 된다. */
const 태그목록: string[] = ((계약 as Record<string, unknown>).오류태그 as string[]) ?? [];

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 한 번에 집는 수. **즉시**는 Edge Function 벽시계 안에서 왕복이 끝나야 하므로 작다 — 크게
 * 잡으면 마지막 몇 건이 매번 잘리고, 그 잘림은 「대기가 안 줄어든다」로만 보인다.
 * **배치**는 우리가 기다리지 않으므로 그 제약이 없다(한 벌에 10만 건까지 실린다). */
const 기본배치 = 5;
const 최대배치 = 25;
const 배치기본 = 100;
const 배치최대 = 500;

/* 한 호출에서 걷는 **끝난 배치**의 수. 우리는 회차당 한 벌만 내보내므로 5면 닷새치다.
 * 이미 걷은 배치를 다시 걷어도 INSERT 가 0행이라 값은 안 깨지지만, 결과 파일을 매번 다시
 * 받는 것은 낭비라 여기서 끊는다. 🔑 끊었다는 사실은 **응답에 센다**(F207 — 조용한 절단은
 * 「전부 걷었다」와 같은 모양으로 온다). */
const 회수상한 = 5;
/* 목록을 몇 개까지 보나. 도는 배치가 있는지 판단하는 근거라 넉넉히 본다. */
const 목록상한 = 20;

const { 행들에서판 } = 계약판모듈 as { 행들에서판: (행들: unknown) => string | null };

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function 센다(칸: Record<string, number>, 이름: string) {
  칸[이름] = (칸[이름] ?? 0) + 1;
}

/**
 * **이 함수의 유일한 쓰기.** 동기 통로와 배치 회수가 같은 문을 쓴다 — 두 곳에 적으면 열
 * 목록·자물쇠 조건이 갈리고, 갈린 뒤엔 한쪽만 고쳐도 초록이 된다.
 *
 * 🔑 `where not exists` — 자물쇠와 **같은 방향**이다(`transcribe` 의 `transcript is null`).
 *   두 배치가 겹쳐도 두 번째 INSERT 가 0행이 된다.
 * 🔑 `모델이름`·`판` 을 인자로 받는다: 배치는 **벤더가 실제로 태운 모델**과 **제출 당시의
 *   프롬프트 판**을 적어야 하고, 그 둘은 회수 시점의 상수·파일과 다를 수 있다.
 */
async function 적기(
  submissionId: string, 값: 교정칸, 모델이름: string, 판: string, ver: string,
): Promise<boolean> {
  const 쓴것 = await sql`
    insert into engine.corrections (
      submission_id, actor_kind, corrected_text, error_tags, explanation,
      model, prompt_ver, schema_ver
    )
    select ${submissionId}::uuid, 'ai'::engine.actor_kind,
           ${값.corrected_text!}, ${값.error_tags!}, ${값.explanation ?? null},
           ${모델이름}, ${판}, ${ver}
     where not exists (
             select 1 from engine.corrections c
              where c.submission_id = ${submissionId}::uuid and c.actor_kind = 'ai')
    returning correction_id`;
  return 쓴것.length > 0;
}

/* 대기 술어 — 분모 세기와 실제로 집기가 **같은 조건**을 봐야 한다. 두 벌로 적으면 「대기는
 * 12인데 집히는 건 0」 같은 모양이 나고, 그때 의심할 곳이 두 배가 된다.
 * ⚠ 조각을 **상수가 아니라 함수로** 둔다 — 같은 조각 인스턴스를 두 질의에 끼우는 것이
 *   드라이버에서 안전한지는 여기서 확인할 방법이 없고(DB 가 필요하다), 확인 못 하는 것을
 *   전제로 쓰면 증상은 「한쪽 질의만 이상하다」로 온다. 부를 때마다 새로 짓는다.
 * ⚠ 동의 술어의 정본 = `lib/동의게이트.js 지금유효술어`(`tests/동의게이트.test.js` 가 묶는다).
 * ⚠ 마지막 `not (…)` 의 정본 = `lib/보고서교정.js 맞음술어`(`tests/보고서교정.test.js` 가 묶는다).
 *   G2 에서 **정답대로 고쳐 낸 제출**을 벤더에 안 보낸다 — 보내면 벤더가 무언가를 만들어 내고,
 *   그 행이 골든 풀에 들어 **과교정률이 G2 정답 문장 때문에 나빠진 것처럼 보인다**(설계 §7).
 *   여기 세우는 이유: 검수 큐의 AI 조인이 inner 라 **AI 행이 안 생기면 큐가 알아서 뺀다**
 *   (새 표 0 · 새 열 0 · 새 상태값 0). 🚫 이 텍스트를 손으로 고치지 않는다 — 정본은 lib 이다. */
const 대기조건 = () => sql`
      from engine.submissions s
      join engine.learning_events e
        on e.event_id = s.event_id and e.event_type = 'submission.created'
      join engine.pipeline_jobs j on j.submission_id = s.submission_id
     where j.status not in ('discarded', 'revoked', 'verified')
       and coalesce(s.body_original, s.transcript) is not null
       and btrim(coalesce(s.body_original, s.transcript)) <> ''
       and exists (
             select 1 from engine.consents k
              where k.learner_id = e.learner_id
                and agreed_at <= now()
                and (revoked_at is null or revoked_at > now()))
       and not exists (
             select 1 from engine.corrections c
              where c.submission_id = s.submission_id and c.actor_kind = 'ai')
       and not (
             s.task_snapshot -> '정답' ->> '교정문' is not null
       and e.payload ->> 'selected_option' = s.task_snapshot -> '정답' ->> '오류자리'
       and btrim(regexp_replace(regexp_replace(btrim(s.body_original), '[[:space:]]+', ' ', 'g'), '[.]$', ''))
         = btrim(regexp_replace(regexp_replace(btrim(s.task_snapshot -> '정답' ->> '교정문'), '[[:space:]]+', ' ', 'g'), '[.]$', '')))`;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return 봉투(405, { error: 'method_not_allowed' });
  if (!서비스역할(req)) return 봉투(401, { error: 'service_role 만 부를 수 있습니다' });

  const 키 = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const url = new URL(req.url);

  /* ── 평가 통로 (`?평가=1`) — **DB 무접촉** · eval 실행기 전용 ─────────────────────
   * 픽스처를 DB 에 넣지 않고(리허설도 append-only 라 지울 수 없는 행이 된다) **같은 동봉·같은
   * 조립기**로 벤더만 왕복한다. `evals/결과.md` 가 「실제 엔진 경로가 아니다」로 남겨 둔 구멍을
   * 닫는 자리 — 로컬에 벤더 키를 두지 않는다(키는 여기 있고, Management API 는 값 대신
   * 다이제스트만 준다 · 08-12 실측 401). 해석·채점은 부르는 쪽(tools/eval-run.js)이 같은
   * `lib/교정엔진.js` 로 한다 — 이 갈래는 원자재(글·usage·model)만 돌려준다.
   * 🔑 상한은 즉시 통로와 같다(벽시계) — 102문항은 부르는 쪽이 잘라 여러 번 온다. */
  if (url.searchParams.get('평가') === '1') {
    /* 설정 실패는 **5xx + error 칸**이다 — 배치 경로가 200+`이유` 로 넘어가는 것은 「행을 안
     * 건드리고 다음 회차가 다시 집는」 cron 의 사정이고, 평가는 도구가 그 자리에서 부르는
     * 왕복이라 실패를 실패로 받아야 한다(200 으로 주면 부르는 쪽 재시도·중단 판단이 못 선다).
     * `이유` 칸을 안 쓰므로 배치 응답 회귀(분모·회수 동반)가 이 갈래를 집지 않는다. */
    if (!키) return 봉투(503, { error: 'eval_no_api_key' });
    const 판 = 프롬프트판(지시문 as string);
    if (!판) return 봉투(503, { error: 'eval_no_prompt_ver' });
    let 몸: { 항목?: { id?: string; 문장?: string; 급수?: string | null; 맥락?: string }[] };
    try { 몸 = await req.json(); } catch { return 봉투(400, { error: 'body 가 JSON 이 아니다' }); }
    const 항목들 = Array.isArray(몸.항목) ? 몸.항목 : [];
    if (!항목들.length || 항목들.length > 최대배치) {
      return 봉투(400, { error: `항목은 1~${최대배치}건이어야 한다`, 받음: 항목들.length });
    }
    const 결과: Record<string, unknown>[] = [];
    const 평가성적: 성적[] = [];
    for (const 항 of 항목들) {
      if (!항 || typeof 항.문장 !== 'string' || !항.문장.trim()) {
        결과.push({ id: 항?.id ?? null, 사유: '문장없음' }); continue;
      }
      try {
        const r = await fetch(메시지경로, {
          method: 'POST',
          headers: 벤더헤더(키),
          body: JSON.stringify(요청몸통({
            지시문: 지시문 as string, 문장: 항.문장, 급수: 항.급수 ?? null, 맥락: 항.맥락,
          })),
          signal: AbortSignal.timeout(왕복제한밀리),
        });
        if (!r.ok) {
          결과.push({ id: 항.id, 사유: `벤더:${r.status}`, 재시도가능: 재시도가능(r.status) });
          continue;
        }
        const 본문 = await r.json();
        평가성적.push(캐시성적((본문 as { usage?: unknown }).usage));
        const 글 = 응답글(본문);
        if (!글) { 결과.push({ id: 항.id, 사유: '응답형식밖' }); continue; }
        결과.push({
          id: 항.id, 글,
          model: (본문 as { model?: string }).model ?? null,
          usage: (본문 as { usage?: unknown }).usage ?? null,
        });
      } catch (e) {
        결과.push({ id: 항.id, 사유: `예외:${String((e as Error)?.name ?? e).slice(0, 40)}` });
      }
    }
    return 봉투(200, { prompt_ver: 판, 모델, 결과, 캐시: 성적합(평가성적) });
  }

  const 즉시 = url.searchParams.get('즉시') === '1';
  const 상한 = 즉시 ? 최대배치 : 배치최대;
  const 기본 = 즉시 ? 기본배치 : 배치기본;
  const 뽑을수 = Math.min(상한, Math.max(1, Number(url.searchParams.get('limit')) || 기본));

  /* 🔑 **분모를 먼저 센다.** 아래 어느 갈래로 빠지든 「몇 건이 기다리고 있었나」는 나온다 —
   *   그래야 「0건 처리」를 「할 게 없었다」로 오독하지 않는다(F207). */
  const [{ count: 대기수 }] = await sql`select count(*)::int as count ${대기조건()}`;

  let 적음 = 0; let 미룸 = 0;
  /* 버린 것은 **사유별로** 센다 — 합쳐 세면 「모델이 형식을 어긴다」와 「계약 밖 태그를 붙인다」가
   * 한 숫자가 되는데, 처방이 정반대다(응답 파싱을 고쳐라 / 프롬프트·계약을 맞춰라). */
  const 버림: Record<string, number> = {};
  const 성적들: 성적[] = [];

  if (!키) {
    console.error('[correct] ANTHROPIC_API_KEY 미설정 — 행을 건드리지 않고 끝낸다');
    return 봉투(200, { 대기: 대기수, 적음: 0, 이유: 'no_api_key' });
  }

  // 계약판은 **DB 에게 묻는다** — 손 상수를 두면 마이그레이션마다 사람이 같이 올려야 한다.
  const 판행 = await sql`select name from engine.schema_migrations order by version desc limit 1`;
  const ver = 행들에서판(판행);
  if (!ver) {
    console.error('[correct] DB 계약판을 못 읽었다', 판행.length ? 판행[0].name : '(이력 0행)');
    return 봉투(500, { 대기: 대기수, 적음: 0, 이유: 'no_contract_ver' });
  }

  /* ── ① 회수 (배치 통로에서만) ──────────────────────────────────────────
   * 이미 값을 치른 결과를 걷는 일이라 **설정 검사보다 앞**이다. 여기서 나오는 실패는 전부
   * 「다음 회차가 다시 집는다」로 끝난다 — 행을 실패로 못박는 자리가 없다. */
  let 회수: Record<string, unknown> | null = null;
  let 도는배치 = 0;
  if (!즉시) {
    const 목록r = await fetch(`${배치경로}?limit=${목록상한}`, {
      headers: 벤더헤더(키), signal: AbortSignal.timeout(왕복제한밀리),
    });
    if (!목록r.ok) {
      const 글 = (await 목록r.text()).slice(0, 300);
      console.error('[correct] 배치 목록 실패', 목록r.status, 글);
      return 봉투(200, {
        대기: 대기수, 적음: 0, 이유: 'batch_list_failed',
        status: 목록r.status, 벤더사유: 벤더사유(글),
      });
    }
    const 목록 = (await 목록r.json()) as {
      data?: { id: string; processing_status: string; created_at?: string }[];
    };
    const 배치들 = 목록.data ?? [];
    /* `ended` 가 아니면 아직 도는 중이다(`in_progress`·`canceling`). 그 사이엔 새로 안 내보낸다 —
     * 같은 발화가 두 벌 나가면 값을 두 번 치른다(행은 자물쇠가 막지만 돈은 이미 나갔다). */
    도는배치 = 배치들.filter((b) => b.processing_status !== 'ended').length;
    /* 🔑 목록이 어느 순서로 오는지를 **전제하지 않는다.** 최신순일 것 같지만 확인할 방법이
     *   여기 없고, 틀렸다면 증상은 「새 배치가 며칠째 안 걷힌다」다 — 오류가 아니라 지연이라
     *   아무도 안 본다. 우리가 직접 최신순으로 세운다. */
    const 끝난것 = 배치들
      .filter((b) => b.processing_status === 'ended')
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    const 걷을것 = 끝난것.slice(0, 회수상한);

    let 줄수 = 0;
    for (const b of 걷을것) {
      const r = await fetch(`${배치경로}/${b.id}/results`, {
        headers: 벤더헤더(키), signal: AbortSignal.timeout(왕복제한밀리),
      });
      if (!r.ok) {
        console.error('[correct] 결과 회수 실패', b.id, r.status);
        센다(버림, `회수실패:${r.status}`);
        continue;
      }
      for (const 줄 of (await r.text()).split('\n')) {
        if (!줄.trim()) continue;
        줄수 += 1;
        const 해석 = 배치줄해석(줄);
        /* 🔑 여기서는 사유를 **자르지 않는다.** `배치오류:invalid_request` 와 `배치expired` 는
         *   처방이 반대다(요청을 고쳐라 / 그냥 다시 내보내라). 앞머리만 세면 그 둘이 한 숫자가
         *   된다. 아래 `교정값()` 쪽은 반대로 자른다 — 거긴 뒤에 태그 목록이 통째로 붙어서
         *   안 자르면 사유 칸이 값목록으로 부푼다. */
        if (해석.사유) { console.error('[correct] 회수 버림', b.id, 해석.사유); 센다(버림, 해석.사유); 미룸 += 1; continue; }
        if (해석.사용량) 성적들.push(캐시성적(해석.사용량));
        const 값 = 교정값(해석.글!, 태그목록);
        if (값.사유) { console.error('[correct] 버림', 해석.submission_id, 값.사유); 센다(버림, 값.사유.split(':')[0]); 미룸 += 1; continue; }
        try {
          if (await 적기(해석.submission_id!, 값, 해석.모델!, 해석.판!, ver)) 적음 += 1; else 미룸 += 1;
        } catch (e) {
          console.error('[correct] 적기 예외', 해석.submission_id, String((e as Error)?.message ?? e));
          센다(버림, '예외'); 미룸 += 1;
        }
      }
    }
    회수 = { 배치: 걷을것.length, 줄: 줄수, 도는배치, 건너뛴배치: Math.max(0, 끝난것.length - 걷을것.length) };
  }

  /* ── ② 내보내기 전 검사 ──────────────────────────────────────────────── */

  /* 🔴 **어느 프롬프트가 만들었는지 모르면 안 적는다.** `prompt_ver` 가 빈 교정문은 나중에
   *   「v1 이 v2 보다 나았나」를 물을 때 갈라낼 근거가 없다 — 그 오염은 소급이 안 된다. */
  const 판 = 프롬프트판(지시문 as string);
  if (!판) {
    console.error('[correct] prompts/교정.md 에서 「현재 vN」을 못 읽었다');
    return 봉투(200, { 대기: 대기수, 적음, 미룸, 버림, 이유: 'no_prompt_ver', 회수 });
  }

  /* 🔴 프롬프트의 통제 어휘와 계약 값목록이 갈라지면 **내보내기 전에** 멈춘다.
   *   `prompts/교정.md` 가 스스로 「갈라지면 2년치 집계가 깨진다」고 적어 둔 경고를 기계로
   *   옮긴 자리다 — 산문으로 남은 경고는 지켜지지 않는다. 갈라진 채 돌면 증상이 **없다**:
   *   모델이 못 붙이는 태그가 생기거나(축 소실), 붙여도 전량 폐기된다. */
  const 어긋남 = 태그어긋남(지시문 as string, 태그목록);
  if (어긋남.프롬프트에없음.length || 어긋남.계약에없음.length) {
    console.error('[correct] 🔴 값목록이 갈라졌다', JSON.stringify(어긋남));
    return 봉투(200, { 대기: 대기수, 적음, 미룸, 버림, 이유: 'tag_drift', 어긋남, 회수 });
  }

  /* ── ③ 내보내기 ───────────────────────────────────────────────────────
   * 방금 걷은 것 때문에 대기가 줄었을 수 있으므로 **조회는 지금 다시 한다**(위의 `대기수`는
   * 분모를 위한 스냅샷이다). 두 번 나가면 두 번 청구된다. */
  if (!즉시 && 도는배치 > 0) {
    return 봉투(200, { 대기: 대기수, 적음, 미룸, 버림, 이유: 'batch_in_flight', 회수, 캐시: 성적합(성적들) });
  }

  const 행들 = await sql<{ submission_id: string; 문장: string; 급수: string | null }[]>`
    select s.submission_id,
           btrim(coalesce(s.body_original, s.transcript)) as 문장,
           e.level_snapshot as 급수
    ${대기조건()}
     order by s.occurred_at
     limit ${뽑을수}`;

  if (!즉시) {
    if (!행들.length) {
      return 봉투(200, { 대기: 대기수, 적음, 미룸, 버림, 이유: 'nothing_to_submit', 회수, 캐시: 성적합(성적들) });
    }
    /* 🔴 `custom_id` 규격은 **내보내기 전에** 본다 — `tag_drift` 와 같은 자리다. 어기면 벤더가
     *   배치 한 벌을 통째로 400 으로 튕기는데, 그 실패는 아래에서 `봉투(200, …)` 으로 나가므로
     *   cron 이 켜지는 날 매 회차 조용히 0건이 된다. 여기서 물으면 0원이고, 안 물으면 왕복 한 번.
     *   ⚠ 왕복이 아니라 **규격**을 재는 자리다 — 통과가 「벤더가 받아 준다」의 증명은 아니다. */
    const 키어긋남 = 배치키어긋남(행들, 판);
    if (키어긋남.length) {
      console.error('[correct] 🔴 custom_id 규격 밖', 키어긋남.length, 키어긋남.slice(0, 3).join(','));
      센다(버림, '키규격밖');
      return 봉투(200, {
        대기: 대기수, 적음, 미룸, 버림, 이유: 'batch_key_invalid',
        규격밖: 키어긋남.length, 보기: 키어긋남.slice(0, 3), 회수,
      });
    }

    const r = await fetch(배치경로, {
      method: 'POST',
      headers: 벤더헤더(키),
      body: JSON.stringify(배치몸통(행들, 지시문 as string, 판)),
      signal: AbortSignal.timeout(왕복제한밀리),
    });
    if (!r.ok) {
      const 글 = (await r.text()).slice(0, 300);
      console.error('[correct] 배치 제출 실패', r.status, 글);
      센다(버림, 재시도가능(r.status) ? `제출_재시도:${r.status}` : `제출_영구:${r.status}`);
      /* 🔑 **벤더가 말한 사유를 응답에 싣는다.** 여기 없으면 「400 이다」까지만 알고 «왜»는
       *   Edge 로그를 따로 열어야 나온다 — 그 한 칸이 없어서 #Q83 이 며칠 늦었다. 로그에 이미
       *   같은 글이 나가므로 새로 드러나는 것은 없고(노출 층이 안 늘어난다), 길이만 자른다. */
      return 봉투(200, {
        대기: 대기수, 적음, 미룸, 버림, 이유: 'batch_submit_failed',
        status: r.status, 벤더사유: 벤더사유(글), 회수,
      });
    }
    const 만든것 = (await r.json()) as { id?: string };
    return 봉투(200, {
      대기: 대기수, 적음, 미룸, 버림, 회수,
      제출: 행들.length, 배치id: 만든것.id ?? null,
      캐시: 성적합(성적들), 모델, prompt_ver: 판,
    });
  }

  /* ── ③' 즉시 통로 — 한 건씩 동기 왕복 ─────────────────────────────────── */
  for (const 행 of 행들) {
    try {
      const r = await fetch(메시지경로, {
        method: 'POST',
        headers: 벤더헤더(키),
        body: JSON.stringify(요청몸통({ 지시문: 지시문 as string, 문장: 행.문장, 급수: 행.급수 })),
        signal: AbortSignal.timeout(왕복제한밀리),
      });

      if (!r.ok) {
        const 글 = (await r.text()).slice(0, 300);
        console.error('[correct] 벤더 실패', 행.submission_id, r.status, 글);
        /* 🔴 영구 실패도 **못박을 칸이 없다**(`corrections` 에 상태 열이 없다) — 다음 배치가
         *   다시 집는다. 지금 할 수 있는 것은 그 사실을 세어 드러내는 것뿐이고, 이 수가 배치
         *   크기에 가까워지면 앞머리가 막힌 것이다(`lib/교정엔진.js 재시도가능` 머리말). */
        센다(버림, 재시도가능(r.status) ? `벤더_재시도:${r.status}` : `벤더_영구:${r.status}`);
        미룸 += 1;
        continue;
      }

      const 본문 = await r.json();
      성적들.push(캐시성적((본문 as { usage?: unknown }).usage));
      const 글 = 응답글(본문);
      if (!글) {
        console.error('[correct] 응답 형식 밖', 행.submission_id);
        센다(버림, '응답형식밖');
        미룸 += 1;
        continue;
      }

      const 값 = 교정값(글, 태그목록);
      if (값.사유) {
        /* 🔴 **빈 행을 만들지 않는다.** 교정문도 태그도 없는 행을 적으면 검수 뷰가 그 행 때문에
         *   큐에 뜨고 검수자 화면엔 빈 카드가 뜬다 — `functions/corrections` 가 학생 쪽에서
         *   막으려던 그 모양이다. 안 적으면 다음 배치가 다시 집는다. */
        console.error('[correct] 버림', 행.submission_id, 값.사유);
        센다(버림, 값.사유.split(':')[0]);
        미룸 += 1;
        continue;
      }

      if (await 적기(행.submission_id, 값, 모델, 판, ver)) 적음 += 1; else 미룸 += 1;
    } catch (e) {
      console.error('[correct] 예외', 행.submission_id, String((e as Error)?.message ?? e));
      센다(버림, '예외');
      미룸 += 1;
    }
  }

  return 봉투(200, {
    대기: 대기수, 집음: 행들.length, 적음, 미룸, 버림,
    캐시: 성적합(성적들), 모델, prompt_ver: 판,
  });
});
