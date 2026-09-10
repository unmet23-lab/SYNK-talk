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
 *      두 마디를 한다 — **먼저 회수, 그다음 제출.** 야간 cron이 새 배치를 내보내고,
 *      10분 간격 회수-only가 완료 결과를 걷는다. 벤더 처리는 최대 24시간까지 걸릴 수 있다.
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
 * ■ 🔑 **건 단위** 실패는 봉투에 더해 `engine.pipeline_jobs.last_error` 에도 적는다 (조용한 실패 ③)
 *   위 문단은 여전히 옳다 — 다만 그것은 **설정 실패**(회차 전체가 못 도는 자리)의 규칙이다.
 *   「이 발화 하나가 왜 못 갔나」는 회차와 수명이 달라서 봉투로는 안 남는다: cron 은 `net.http_post`
 *   라 응답을 아무도 안 읽고, 로그 보존은 무료 플랜 **1일**이다. 그래서 건별 사유는 표에 적는다.
 *   🔴 적는 것은 `last_error`·`attempt_count` **둘뿐이고 `status` 는 안 건드린다** — 이유(두 차단
 *   목록 실측)는 `lib/처리장부.js` 머리말에 있다. 결과는 `장부` 계수기로 봉투에 드러난다.
 *
 * ■ 🔴 동의는 **`engine.consents` 를 직접 본다** — `pipeline_jobs.status='revoked'` 를 안 믿는다
 *   그 값은 값목록에만 있고 **아무도 쓰지 않는다**(실측: writer 0). 그것으로 철회를 막으면
 *   가드는 늘 통과하고, 새는 방향은 학생 발화가 **벤더로 나가는** 쪽이다. 술어의 정본은
 *   `lib/동의게이트.js 지금유효술어` 하나이고 `tests/동의게이트.test.js` 가 이 파일을 묶는다.
 *
 * ■ 기존 pipeline 잡의 lease와 짧은 저장 잠금을 쓴다.
 *   HTTP 동안 DB 트랜잭션은 열지 않는다. 전송 전 lease가 겹친 유료 제출을 막고,
 *   저장할 때만 같은 잡을 잠근 뒤 AI 교정 부재·현재 동의·삭제 상태를 다시 검사한다.
 *   기존 append-only 교정/재검수 이력은 보존한다. 이 저장 통로를 우회하는 다른 writer까지
 *   전역 UNIQUE로 제한하는 변경은 아니다.
 */
import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';
import 교정모듈 from './교정엔진.mjs';
import 계약 from './계약.mjs';
import 지시문 from './교정프롬프트.mjs';
import 계약판모듈 from './계약판.mjs';
import 장부모듈 from './처리장부.mjs';
import 시즌맥락모듈 from './시즌맥락.mjs';
import 몽골날짜모듈 from './몽골날짜.mjs';

const { 서비스역할 } = 토큰모듈 as { 서비스역할: (req: Request) => boolean };
const { 시즌줄 } = 시즌맥락모듈 as { 시즌줄: (v: unknown) => string | null };
const { 시간대 } = 몽골날짜모듈 as { 시간대: string };

type 성적 = { 입력: number; 캐시생성: number; 캐시읽음: number };
type 교정칸 = {
  corrected_text?: string; error_tags?: string[]; explanation?: string | null; 사유: string | null;
};

const {
  모델, 왕복제한밀리, 메시지경로, 배치경로, 벤더헤더,
  교정요청판: 프롬프트판, 태그어긋남, 요청몸통, 응답글, 교정값, 재시도가능,
  배치몸통, 배치키어긋남, 배치줄해석, 캐시성적, 성적합,
} = 교정모듈 as {
  모델: string;
  왕복제한밀리: number;
  메시지경로: string;
  배치경로: string;
  벤더헤더: (키: string) => Record<string, string>;
  교정요청판: (지시문: string) => string | null;
  태그어긋남: (지시문: string, 태그목록: string[]) => { 프롬프트에없음: string[]; 계약에없음: string[] };
  요청몸통: (a: { 지시문: string; 문장: string; 급수: string | null; 맥락?: string }) => Record<string, unknown>;
  응답글: (본문: unknown) => string | null;
  교정값: (글: string, 태그목록: string[]) => 교정칸;
  재시도가능: (status: number) => boolean;
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
const 접수미확정 = 'submitting';
const uuid꼴 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 시도 도장은 custom_id에만 붙인다. 요청 품질 지문/저장 prompt_ver는 바꾸지 않는다.
function 결과해석(줄: string, 영수증: { submission_id: string; attempt_id: string }[]) {
  let 본;
  try { 본 = JSON.parse(줄); } catch { return { 사유: '결과형식밖' } as any; }
  const m = typeof 본?.custom_id === 'string' && 본.custom_id.match(/^a([0-9a-f]{32})_(.+)$/i);
  if (!m) return { 사유: '키형식밖' } as any;
  const h = m[1];
  const attempt_id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  const row = 영수증.find((r) => r.attempt_id === attempt_id);
  if (!row) return { 사유: '키형식밖' } as any;
  본.custom_id = `${row.submission_id}_${m[2]}`;
  return { ...배치줄해석(JSON.stringify(본)), attempt_id };
}

const { 행들에서판 } = 계약판모듈 as { 행들에서판: (행들: unknown) => string | null };

/* 건 단위 실패의 «왜» 를 `engine.pipeline_jobs.last_error` 에 남기는 **공용 통로**(조용한 실패 ③).
 * 🔴 `status` 는 안 건드린다 — 이유 전문은 `lib/처리장부.js` 머리말(두 차단 목록 실측). */
const { 실패적기, 성공적기 } = 장부모듈 as {
  실패적기: (sql: unknown, id: string | null | undefined, 갈래: string, 벤더말?: string | null)
    => Promise<string>;
  성공적기: (sql: unknown, id: string | null | undefined) => Promise<string>;
};

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function 센다(칸: Record<string, number>, 이름: string) {
  칸[이름] = (칸[이름] ?? 0) + 1;
}

function 안전사유(값: unknown): string {
  const 앞 = String(값 ?? '').split(':')[0];
  return ['형식밖', '교정문없음', '태그없음', '계약밖태그', '상충태그', '옛글자',
    '결과형식밖', '키형식밖', '응답형식밖', '모델없음', '배치오류', '배치canceled',
    '배치expired', '배치알수없음'].includes(앞) ? 앞 : '응답형식밖';
}

/**
 * **교정 행의 유일한 쓰기.** 동기 통로와 배치 회수가 같은 문을 쓴다 — 두 곳에 적으면 열
 * 목록·자물쇠 조건이 갈리고, 갈린 뒤엔 한쪽만 고쳐도 초록이 된다.
 *
 * 🔑 `where not exists` — 자물쇠와 **같은 방향**이다(`transcribe` 의 `transcript is null`).
 *   두 배치가 겹쳐도 두 번째 INSERT 가 0행이 된다.
 * 🔑 `모델이름`·`판` 을 인자로 받는다: 배치는 **벤더가 실제로 태운 모델**과 **제출 당시의
 *   프롬프트 판**을 적어야 하고, 그 둘은 회수 시점의 상수·파일과 다를 수 있다.
 */
async function 적기(
  submissionId: string, 값: 교정칸, 모델이름: string, 판: string, ver: string,
  attemptId: string, batchId: string | null,
): Promise<boolean> {
  // 외부 HTTP 동안에는 잠그지 않는다. 같은 제출의 회수/즉시 저장만 짧게 직렬화한다.
  return sql.begin(async (tx) => {
  const 잠금 = await tx`
    select job_id from engine.pipeline_jobs
     where submission_id = ${submissionId}::uuid
     for update`;
  if (!잠금.length) return false;
  const 쓴것 = await tx`
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
       and exists (
             select 1 from engine.submissions s
             join engine.learning_events e on e.event_id = s.event_id
             join engine.pipeline_jobs j on j.submission_id = s.submission_id
              where s.submission_id = ${submissionId}::uuid
                and e.event_type = 'submission.created'
                and j.status not in ('discarded', 'revoked', 'verified')
                and j.attempt_id = ${attemptId}::uuid
                and j.correction_batch_id is not distinct from ${batchId}::text
                and s.audio_deleted_at is null
                and exists (select 1 from engine.consents k
                             where k.learner_id = e.learner_id
                               and agreed_at <= now()
                               and (revoked_at is null or revoked_at > now())))
    returning correction_id`;
  return 쓴것.length > 0;
  });
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
       and s.audio_deleted_at is null
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

// 이미 있는 잡의 lease만 쓴다. HTTP 불확실 응답은 소유권을 유지해 같은 날 재과금을 막는다.
// 23시간 뒤에도 진행 중인 벤더 배치가 있으면 목록 확인이 새 제출을 계속 막는다.
async function 전송차례(ids: string[], 즉시: boolean) {
  if (!ids.length) return [];
  return sql<{ submission_id: string; attempt_id: string }[]>`
    update engine.pipeline_jobs p
       set attempt_id = gen_random_uuid(),
           lease_until = now() + make_interval(secs => ${즉시 ? 180 : 23 * 3600}),
           correction_batch_id = ${즉시 ? null : 접수미확정},
           updated_at = now()
     where p.submission_id = any(${ids}::uuid[])
       and (p.lease_until is null or p.lease_until <= now())
       and p.correction_batch_id is null
       and p.submission_id in (select s.submission_id ${대기조건()})
    returning p.submission_id, p.attempt_id`;
}

async function 전송유효(차례: { submission_id: string; attempt_id: string }[]) {
  if (!차례.length) return new Set<string>();
  const 허용 = await sql<{ submission_id: string }[]>`
    select s.submission_id ${대기조건()}
       and s.submission_id = any(${차례.map((r) => r.submission_id)}::uuid[])
       and j.attempt_id = any(${차례.map((r) => r.attempt_id)}::uuid[])
       and j.lease_until > now()`;
  return new Set(허용.map((r) => r.submission_id));
}

// fetch 호출 전 미전송이 확정된 시도만 해제한다. 이미 시작한 네트워크의 불확실 접수에는 쓰지 않는다.
async function 미전송해제(차례: { submission_id: string; attempt_id: string }[]) {
  for (const 행 of 차례) {
    await sql`update engine.pipeline_jobs set correction_batch_id = null, lease_until = null, updated_at = now()
      where submission_id = ${행.submission_id}::uuid and attempt_id = ${행.attempt_id}::uuid
        and correction_batch_id = ${접수미확정}`;
  }
}

async function 처리(req: Request): Promise<Response> {
  if (req.method !== 'POST') return 봉투(405, { error: 'method_not_allowed' });
  if (!서비스역할(req)) return 봉투(401, { error: 'service_role 만 부를 수 있습니다' });

  const 마감 = Date.now() + 115_000;
  const 가져오기 = (주소: string, 설정: RequestInit = {}, 전송시작?: () => void) => {
    const 남음 = 마감 - Date.now();
    if (남음 <= 0) throw new Error('request_deadline');
    전송시작?.();
    return fetch(주소, { ...설정, redirect: 'error',
      signal: AbortSignal.timeout(Math.min(왕복제한밀리, 남음)) });
  };

  const 키 = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const url = new URL(req.url);
  const 시험제출 = url.searchParams.get('시험제출');
  if (시험제출 !== null && !uuid꼴.test(시험제출)) return 봉투(400, { error: 'test_submission_invalid' });
  if (시험제출 !== null && url.searchParams.get('평가') === '1') return 봉투(400, { error: 'test_scope_conflict' });
  if (시험제출 !== null) {
    const 시험 = await sql`select s.submission_id from engine.submissions s
      join engine.learning_events e on e.event_id = s.event_id
      join engine.learners l on l.learner_id = e.learner_id
      where s.submission_id = ${시험제출}::uuid and l.is_test = true`;
    if (!시험.length) return 봉투(403, { error: 'test_submission_only' });
  }

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
        const r = await 가져오기(메시지경로, {
          method: 'POST',
          headers: 벤더헤더(키),
          body: JSON.stringify(요청몸통({
            지시문: 지시문 as string, 문장: 항.문장, 급수: 항.급수 ?? null, 맥락: 항.맥락,
          })),
          signal: AbortSignal.timeout(왕복제한밀리),
        });
        if (!r.ok) {
          /* 🔑 벤더가 말한 «왜»를 같이 싣는다(#Q83 — 상태 코드만으로는 처방이 안 나온다 · 배치
           * 통로의 그 규율). 08-20 실측: 59×400 이 사유 없이 «벤더:400» 으로만 남아, 크레딧
           * 소진인지 요청 결함인지 밖에서 가릴 수 없었다. */
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
        결과.push({ id: 항.id, 사유: 'vendor_request_failed' });
      }
    }
    return 봉투(200, { prompt_ver: 판, 모델, 결과, 캐시: 성적합(평가성적) });
  }

  /* ── `?회수=1` — **걷기만 하고 안 내보낸다** (2026-08-17 · 유호 승인) ────────────────
   * 왜 생겼나: 이 함수엔 「이미 값을 치른 배치의 결과만 보는」 문이 없었다. 흐름이 회수를
   * 먼저 하고 **이어서 새 배치를 내므로**, 지난 회차의 사용량(=단가)을 보러 부르는 순간
   * 대기분이 또 나간다 — 「얼마 들었나」를 묻는 값이 「또 그만큼」이었다. 재는 행위가 값을
   * 치르면 그 계기는 못 쓴다(**F452** 와 같은 축 · 08-17 에 396건 일괄의 단가를 못 재서 막혔다).
   *
   * 🔑 **즉시(정가 통로)를 이긴다.** `즉시=1&회수=1` 을 400 으로 거절하지 않는 이유는 새는
   *   방향이다 — 거절당한 쪽은 `회수` 를 떼고 재시도하기 쉽고 그건 곧 지출이다. 다만 조용히
   *   바꾸면 그것대로 거짓말이라 **무시했다는 사실을 봉투에 싣는다**(`무시한즉시`).
   * ⚠ 이 갈래는 회수 블록이 `!즉시` 에 걸려 있다는 사실에 **기대고 있다** — 그래서 아래
   *   문지기를 회수 블록 «밖»에 둔다(그 결합이 끊기는 날 새는 쪽이 「내보내기」다). */
  const 회수만 = url.searchParams.get('회수') === '1';
  const 즉시요청 = url.searchParams.get('즉시') === '1';
  const 즉시 = 즉시요청 && !회수만;
  const 상한 = 즉시 ? 최대배치 : 배치최대;
  const 기본 = 즉시 ? 기본배치 : 배치기본;
  const 뽑을수 = Math.min(상한, Math.max(1, Number(url.searchParams.get('limit')) || 기본));

  /* 🔑 **분모를 먼저 센다.** 아래 어느 갈래로 빠지든 「몇 건이 기다리고 있었나」는 나온다 —
   *   그래야 「0건 처리」를 「할 게 없었다」로 오독하지 않는다(F207). */
  const [{ count: 대기수 }] = await sql`select count(*)::int as count ${대기조건()}
    and (${시험제출}::uuid is null or s.submission_id = ${시험제출}::uuid)`;
  if (!대기수) return 봉투(200, { 대기: 0, 적음: 0,
    이유: 회수만 ? 'nothing_to_collect' : 'nothing_to_submit' });

  let 적음 = 0; let 미룸 = 0;
  /* 버린 것은 **사유별로** 센다 — 합쳐 세면 「모델이 형식을 어긴다」와 「계약 밖 태그를 붙인다」가
   * 한 숫자가 되는데, 처방이 정반대다(응답 파싱을 고쳐라 / 프롬프트·계약을 맞춰라). */
  const 버림: Record<string, number> = {};
  const 성적들: 성적[] = [];

  /* 🔑 장부에 **적으려 한 결과**를 갈래별로 센다(`적힘`·`잡없음`·`대상없음`·`장부실패`).
   *   장부가 조용히 죽는 것을 막는 자리다 — 「사유를 DB 에 남긴다」를 지어 놓고 그 쓰기가
   *   매번 실패하면, 봉투는 여전히 예쁘고 흔적은 그대로 0이다(맹점 ④: 장치가 새는 방향은
   *   안 도는 쪽이 아니라 «맞는 얼굴로 틀린 값» 쪽이다).
   * ⚠ `버림` 과 갈래 이름을 **일부러 안 겹치게** 뒀다 — 겹치면 「무엇이 죽었나」와
   *   「그걸 적었나」가 한 숫자로 접힌다. */
  const 장부: Record<string, number> = {};
  const 장부에 = async (id: string | undefined | null, 갈래: string, 벤더말?: string | null) => {
    센다(장부, await 실패적기(sql, id, 갈래, 벤더말 ?? null));
  };
  const 장부정리 = async (id: string | undefined | null) => {
    센다(장부, await 성공적기(sql, id));
  };

  if (!키) {
    console.error('[correct] ANTHROPIC_API_KEY 미설정 — 행을 건드리지 않고 끝낸다');
    return 봉투(503, { 대기: 대기수, 적음: 0, 이유: 'no_api_key' });
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
   * DB 쓰기/조회 실패는 다음 회차가 같은 결과를 다시 걷는다. 확정 결과 거절은 receipt를
   * 보존하고 주의를 요청한다. 자동 재과금하지 않으며 수리 후 같은 결과의 재해석은 가능하다. */
  let 회수: Record<string, unknown> | null = null;
  let 도는배치 = 0;
  let 회수HTTP실패 = false;
  let 미확정수 = 0;
  let 결과실패수 = 0;
  if (!즉시) {
    // 같은 Anthropic workspace의 다른 프로젝트/서비스 배치는 정상 경로에서 조회하지 않는다.
    const 영수증 = await sql`select s.submission_id, j.attempt_id, j.correction_batch_id
      ${대기조건()} and j.correction_batch_id is not null
      and (${시험제출}::uuid is null or s.submission_id = ${시험제출}::uuid)
      order by j.updated_at, s.submission_id`;
    const 미확정 = 영수증.filter((r) => r.correction_batch_id === 접수미확정);
    const 복구됨 = new Set<string>();
    // 접수 응답을 잃은 시도만 페이지를 재탐색한다. 도장을 확인 못하면 자동 재과금하지 않는다.
    if (미확정.length) {
      let cursor: string | null = null;
      const 본커서 = new Set<string>();
      for (let page = 0; page < 목록상한 && Date.now() < 마감 - 5000; page++) {
        const rr = await 가져오기(`${배치경로}?limit=100${cursor ? `&after_id=${encodeURIComponent(cursor)}` : ''}`,
          { headers: 벤더헤더(키) });
        if (!rr.ok) { 회수HTTP실패 = true; 센다(버림, `회수실패:${rr.status}`); break; }
        const list = await rr.json();
        if (!Array.isArray(list.data)) throw new Error('batch_list_invalid');
        for (const b of list.data.filter((b: any) => b.processing_status === 'ended')) {
          const result = await 가져오기(`${배치경로}/${encodeURIComponent(b.id)}/results`, { headers: 벤더헤더(키) });
          if (!result.ok) { 회수HTTP실패 = true; continue; }
          for (const line of (await result.text()).split('\n')) {
            if (!line.trim()) continue;
            const parsed = 결과해석(line, 미확정);
            const match = 미확정.find((r) => r.submission_id === parsed.submission_id && r.attempt_id === parsed.attempt_id);
            if (!match || 복구됨.has(match.submission_id)) continue;
            const changed = await sql`update engine.pipeline_jobs set correction_batch_id = ${b.id}, updated_at = now()
              where submission_id = ${match.submission_id}::uuid and attempt_id = ${match.attempt_id}::uuid
                and correction_batch_id = ${접수미확정} returning submission_id`;
            if (changed.length) { match.correction_batch_id = b.id; 복구됨.add(match.submission_id); }
          }
        }
        if (복구됨.size === 미확정.length || !list.has_more) break;
        const next = list.last_id ?? list.data.at(-1)?.id;
        if (typeof next !== 'string' || !next || 본커서.has(next)) break;
        본커서.add(next); cursor = next;
      }
    }
    미확정수 = 미확정.length - 복구됨.size;
    const 배치들 = [];
    for (const id of new Set(영수증.map((r) => r.correction_batch_id).filter((id) => id !== 접수미확정))) {
      const r = await 가져오기(`${배치경로}/${encodeURIComponent(id)}`, { headers: 벤더헤더(키) });
      if (!r.ok) { 회수HTTP실패 = true; 센다(버림, `회수실패:${r.status}`); continue; }
      const batch = await r.json();
      if (batch.id !== id || typeof batch.processing_status !== 'string') throw new Error('batch_receipt_invalid');
      배치들.push(batch);
    }
    도는배치 = 배치들.filter((b) => b.processing_status !== 'ended').length;
    // 영수증 기반이므로 최신 목록 밖으로 밀려도 매 회차 직접 찾아간다.
    const 끝난것 = 배치들.filter((b) => b.processing_status === 'ended');
    const 걷을것 = 끝난것.slice(0, 회수상한);

    let 줄수 = 0;
    for (const b of 걷을것) {
      const r = await 가져오기(`${배치경로}/${encodeURIComponent(b.id)}/results`, {
        headers: 벤더헤더(키), signal: AbortSignal.timeout(왕복제한밀리),
      });
      if (!r.ok) {
        회수HTTP실패 = true;
        console.error('[correct] batch_results_failed', r.status);
        센다(버림, `회수실패:${r.status}`);
        continue;
      }
      for (const 줄 of (await r.text()).split('\n')) {
        if (!줄.trim()) continue;
        줄수 += 1;
        const 해석 = 결과해석(줄, 영수증);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(해석.submission_id ?? '')) {
          센다(버림, '키형식밖'); 미룸 += 1; continue;
        }
        if (시험제출 !== null && 해석.submission_id !== 시험제출) continue;
        const 현재대상 = await sql`select s.submission_id ${대기조건()}
          and s.submission_id = ${해석.submission_id}::uuid
          and j.attempt_id = ${해석.attempt_id}::uuid and j.correction_batch_id = ${b.id}`;
        if (!현재대상.length) { 미룸 += 1; continue; }
        // 벤더 사유/태그의 자유 문자열은 학생 정보가 섞일 수 있어 고정 코드만 기록한다.
        if (해석.사유) {
          const 사유 = 안전사유(해석.사유);
          console.error('[correct] batch_result_rejected', 사유);
          센다(버림, 사유);
          await 장부에(해석.submission_id, 사유);
          결과실패수 += 1;
          미룸 += 1; continue;
        }
        if (해석.사용량) 성적들.push(캐시성적(해석.사용량));
        const 값 = 교정값(해석.글!, 태그목록);
        if (값.사유) {
          const 사유 = 안전사유(값.사유);
          console.error('[correct] correction_rejected', 사유);
          센다(버림, 사유);
          await 장부에(해석.submission_id, 사유);
          결과실패수 += 1;
          미룸 += 1; continue;
        }
        try {
          if (await 적기(해석.submission_id!, 값, 해석.모델!, 해석.판!, ver, 해석.attempt_id, b.id)) {
            적음 += 1;
            /* 🔑 **성공했을 때 지운다.** 안 지우면 어제 죽었다가 오늘 살아난 행이 영원히
             *   실패로 보인다. 부르는 자리를 INSERT 가 실제로 쓴 갈래로 좁혀서, 재실행의
             *   no-op(0행)에는 이 쓰기가 안 붙는다. */
            await 장부정리(해석.submission_id);
          } else 미룸 += 1;
        } catch (e) {
          console.error('[correct] correction_write_failed');
          센다(버림, '예외');
          await 장부에(해석.submission_id, '예외');
          결과실패수 += 1;
          미룸 += 1;
        }
      }
    }
    회수 = { 배치: 걷을것.length, 줄: 줄수, 도는배치, 건너뛴배치: Math.max(0, 끝난것.length - 걷을것.length) };
  }

  /* 🔴 **문지기 — 여기서 끝낸다. 아래로 한 줄이라도 내려가면 새 배치가 나간다.**
   *   이 자리가 「걷기」와 「내보내기」의 경계다(바로 아래 ② 부터는 전부 내보내기 준비다).
   *   회수 블록 «안»이 아니라 «밖»에 두는 이유는 위 주석의 ⚠ 와 같다 — 블록 조건이 바뀌어도
   *   이 문은 서 있어야 한다. `캐시` 를 같이 싣는 것이 이 통로의 존재 이유다(단가). */
  if (회수만) {
    return 봉투(회수HTTP실패 || 미확정수 || 결과실패수 ? 502 : 200, {
      대기: 대기수, 적음, 미룸, 버림, 장부, 이유: '회수만', 회수,
      needs_attention: 회수HTTP실패 || 미확정수 > 0 || 결과실패수 > 0,
      접수미확정: 미확정수, 결과실패: 결과실패수,
      캐시: 성적합(성적들), ...(즉시요청 ? { 무시한즉시: true } : {}),
    });
  }
  if (회수HTTP실패) return 봉투(502, { 대기: 대기수, 적음, 미룸, 버림, 장부,
    이유: 'batch_results_failed', 회수 });

  /* ── ② 내보내기 전 검사 ──────────────────────────────────────────────── */

  /* 🔴 **어느 프롬프트가 만들었는지 모르면 안 적는다.** `prompt_ver` 가 빈 교정문은 나중에
   *   「v1 이 v2 보다 나았나」를 물을 때 갈라낼 근거가 없다 — 그 오염은 소급이 안 된다. */
  const 판 = 프롬프트판(지시문 as string);
  if (!판) {
    console.error('[correct] prompts/교정.md 에서 「현재 vN」을 못 읽었다');
    return 봉투(503, { 대기: 대기수, 적음, 미룸, 버림, 장부, 이유: 'no_prompt_ver', 회수 });
  }

  /* 🔴 프롬프트의 통제 어휘와 계약 값목록이 갈라지면 **내보내기 전에** 멈춘다.
   *   `prompts/교정.md` 가 스스로 「갈라지면 2년치 집계가 깨진다」고 적어 둔 경고를 기계로
   *   옮긴 자리다 — 산문으로 남은 경고는 지켜지지 않는다. 갈라진 채 돌면 증상이 **없다**:
   *   모델이 못 붙이는 태그가 생기거나(축 소실), 붙여도 전량 폐기된다. */
  const 어긋남 = 태그어긋남(지시문 as string, 태그목록);
  if (어긋남.프롬프트에없음.length || 어긋남.계약에없음.length) {
    console.error('[correct] 🔴 값목록이 갈라졌다', JSON.stringify(어긋남));
    return 봉투(503, { 대기: 대기수, 적음, 미룸, 버림, 장부, 이유: 'tag_drift', 회수 });
  }

  /* ── ③ 내보내기 ───────────────────────────────────────────────────────
   * 방금 걷은 것 때문에 대기가 줄었을 수 있으므로 **조회는 지금 다시 한다**(위의 `대기수`는
   * 분모를 위한 스냅샷이다). 두 번 나가면 두 번 청구된다. */
  // 이미 접수된 행은 receipt가 막는다. 다른 배치가 도는 중이어도 새 제출 자체를 막지 않는다.

  const 조회행들 = await sql<{ submission_id: string; 문장: string; 급수: string | null; 시즌목표: string | null }[]>`
    select s.submission_id,
           btrim(coalesce(s.body_original, s.transcript)) as 문장,
           e.level_snapshot as 급수,
           /* ㉢ 경로 A(2026-08-20) — 제출 «시각»을 덮는 시즌의, 그 학생 나침반 답 하나.
            * current_date 가 아닌 이유: 첨삭은 비동기다(밤 배치가 어제 제출을 고친다) — 달력
            * 기준이면 시즌 경계의 밤에 다음 시즌 목표로 어제 문장을 설명한다. 겹침은 DDL
            * (season_no_overlap_c11)이 막아 덮는 시즌은 많아야 1 — limit 1 은 「고르기 규칙」이
            * 아니라 그 사실의 표기다(둘째 판정을 안 만든다 · teach 이번시즌()과 술어가 다른
            * 이유도 이것: 그쪽은 「오늘」, 여기는 「그 제출의 날」이다). */
           (select c.answers->>'season_goal'
              from engine.season sn
              join engine.season_compass c
                on c.season_id = sn.season_id and c.learner_id = e.learner_id
             where sn.starts_on <= (e.occurred_at at time zone ${시간대})::date
               and (sn.ends_on is null or sn.ends_on >= (e.occurred_at at time zone ${시간대})::date)
             limit 1) as 시즌목표
    ${대기조건()}
       and (j.lease_until is null or j.lease_until <= now())
       and j.correction_batch_id is null
       and (${시험제출}::uuid is null or s.submission_id = ${시험제출}::uuid)
     order by s.occurred_at
     limit ${뽑을수}`;
  /* 맥락은 **여기 한 곳**에서 조립한다 — 즉시·배치가 같은 값을 들게(하나만 고치면 「즉시로 만든
   * 것」과 「배치로 만든 것」이 갈린다 — 이 파일 머리 :16 의 그 경고). 없으면 null 이고, 그때
   * 요청몸통은 v1 과 바이트 동일이다(맥락 없음 폴백의 정본 = lib/교정엔진.js :140). */
  let 행들 = 조회행들.map((행) => ({ ...행, 맥락: 시즌줄(행.시즌목표) }));

  if (!즉시) {
    if (!행들.length) {
      return 봉투(미확정수 || 결과실패수 ? 502 : 200, { 대기: 대기수, 적음, 미룸, 버림, 장부,
        이유: 미확정수 ? 'batch_receipt_unresolved' : 결과실패수 ? 'batch_result_needs_attention' : 'nothing_to_submit',
        needs_attention: 미확정수 > 0 || 결과실패수 > 0,
        접수미확정: 미확정수, 결과실패: 결과실패수, 회수, 캐시: 성적합(성적들) });
    }
    /* 🔴 `custom_id` 규격은 **내보내기 전에** 본다 — `tag_drift` 와 같은 자리다. 어기면 벤더가
     *   배치 한 벌을 통째로 400 으로 튕긴다. 실패는 5xx로 회차 장부에 남기지만,
     *   여기서 먼저 물으면 유료 제출 왕복을 하지 않는다.
     *   ⚠ 왕복이 아니라 **규격**을 재는 자리다 — 통과가 「벤더가 받아 준다」의 증명은 아니다. */
    const 키어긋남 = 배치키어긋남(행들, 판);
    if (키어긋남.length) {
      console.error('[correct] batch_key_invalid', 키어긋남.length);
      센다(버림, '키규격밖');
      return 봉투(503, {
        대기: 대기수, 적음, 미룸, 버림, 장부, 이유: 'batch_key_invalid',
        규격밖: 키어긋남.length, 회수,
      });
    }

    const 차례 = await 전송차례(행들.map((r) => r.submission_id), false);
    let 허용: Set<string>;
    try { 허용 = await 전송유효(차례); }
    catch { await 미전송해제(차례); throw new Error('batch_preflight_failed'); }
    await 미전송해제(차례.filter((r) => !허용.has(r.submission_id)));
    행들 = 행들.filter((r) => 허용.has(r.submission_id));
    if (!행들.length) return 봉투(200, { 대기: 대기수, 적음, 미룸, 버림, 장부,
      이유: 'nothing_claimed', 회수 });

    let 실제전송시작 = false;
    let r: Response;
    try {
    const 몸통 = 배치몸통(행들, 지시문 as string, 판) as { requests: { custom_id: string }[] };
    for (let i = 0; i < 행들.length; i++) {
      const attempt = 차례.find((r) => r.submission_id === 행들[i].submission_id)!.attempt_id;
      몸통.requests[i].custom_id = `a${attempt.replace(/-/g, '')}_${판}`;
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(몸통.requests[i].custom_id)) {
        // Anthropic custom_id 최대 64자. 짧은 지문+UUID 조합도 항상 실제 규격을 다시 검사한다.
        throw new Error('batch_attempt_key_invalid');
      }
    }

    r = await 가져오기(배치경로, {
      method: 'POST',
      headers: 벤더헤더(키),
      body: JSON.stringify(몸통),
      signal: AbortSignal.timeout(왕복제한밀리),
    }, () => { 실제전송시작 = true; });
    } catch {
      if (!실제전송시작) await 미전송해제(차례);
      throw new Error('batch_submit_interrupted');
    }
    if (!r.ok) {
      console.error('[correct] batch_submit_failed', r.status);
      // 접수 거절이 확정된 상태만 다음 예약에서 다시 집는다. timeout/5xx는 미확정 유지.
      if ([400, 401, 403, 404, 413, 422, 429].includes(r.status)) {
        await sql`update engine.pipeline_jobs set correction_batch_id = null, lease_until = null, updated_at = now()
          where submission_id = any(${행들.map((r) => r.submission_id)}::uuid[])
            and attempt_id = any(${차례.map((r) => r.attempt_id)}::uuid[])
            and correction_batch_id = ${접수미확정}`;
      }
      센다(버림, 재시도가능(r.status) ? `제출_재시도:${r.status}` : `제출_영구:${r.status}`);
      // 응답·로그·회차 장부에는 단계와 HTTP 상태만 남기고 벤더 본문은 남기지 않는다.
      return 봉투(502, {
        대기: 대기수, 적음, 미룸, 버림, 장부, 이유: 'batch_submit_failed',
        status: r.status, 회수,
      });
    }
    const 만든것 = (await r.json()) as { id?: string };
    if (typeof 만든것.id !== 'string' || !만든것.id) throw new Error('batch_response_invalid');
    const 기록 = await sql`update engine.pipeline_jobs set correction_batch_id = ${만든것.id}, updated_at = now()
      where submission_id = any(${행들.map((r) => r.submission_id)}::uuid[])
        and attempt_id = any(${차례.map((r) => r.attempt_id)}::uuid[])
        and correction_batch_id = ${접수미확정} returning submission_id`;
    if (기록.length !== 행들.length) throw new Error('batch_receipt_write_failed');
    return 봉투(미확정수 || 결과실패수 ? 502 : 200, {
      대기: 대기수, 적음, 미룸, 버림, 장부, 회수,
      제출: 행들.length, 접수기록: true, needs_attention: 미확정수 > 0 || 결과실패수 > 0,
      접수미확정: 미확정수, 결과실패: 결과실패수,
      캐시: 성적합(성적들), 모델, prompt_ver: 판,
    });
  }

  /* ── ③' 즉시 통로 — 한 건씩 동기 왕복 ─────────────────────────────────── */
  for (const 행 of 행들) {
    try {
      const 차례 = await 전송차례([행.submission_id], true);
      if (!(await 전송유효(차례)).has(행.submission_id)) { 미룸 += 1; continue; }
      const r = await 가져오기(메시지경로, {
        method: 'POST',
        headers: 벤더헤더(키),
        body: JSON.stringify(요청몸통({ 지시문: 지시문 as string, 문장: 행.문장, 급수: 행.급수, 맥락: 행.맥락 })),
        signal: AbortSignal.timeout(왕복제한밀리),
      });

      if (!r.ok) {
        console.error('[correct] vendor_failed', r.status);
        /* 🔴 **행은 여전히 실패로 못박지 않는다** — 다음 회차가 다시 집는 자기치유가 기본값이고,
         *   영구 실패는 대신 같은 자리를 매번 먹는다. 그 수가 배치 크기에 가까워지면 앞머리가
         *   막힌 것이다(`lib/교정엔진.js 재시도가능` 머리말).
         * ⚠ 여기 옛 주석은 「영구 실패도 **못박을 칸이 없다**」였는데 그건 **틀렸다.**
         *   `corrections` 에 상태 열이 없는 것은 맞지만, `engine.pipeline_jobs` 는 08-06 부터
         *   `last_error`·`attempt_count` 를 들고 있었고 저장소 전체에서 **writer 0** 이었다
         *   (조용한 실패 ③ 실측). 옆 표를 안 본 단정이 사유를 하루짜리 로그에 가둬 왔다.
         *   그래서 지금은 **세고 + 적는다** — 못박기(`status`)와 적기(`last_error`)는 다른 일이다. */
        const 갈래 = 재시도가능(r.status) ? `벤더_재시도:${r.status}` : `벤더_영구:${r.status}`;
        센다(버림, 갈래);
        await 장부에(행.submission_id, 갈래);
        미룸 += 1;
        continue;
      }

      const 본문 = await r.json();
      성적들.push(캐시성적((본문 as { usage?: unknown }).usage));
      const 글 = 응답글(본문);
      if (!글) {
        console.error('[correct] vendor_response_invalid');
        센다(버림, '응답형식밖');
        await 장부에(행.submission_id, '응답형식밖');
        미룸 += 1;
        continue;
      }

      const 값 = 교정값(글, 태그목록);
      if (값.사유) {
        /* 🔴 **빈 행을 만들지 않는다.** 교정문도 태그도 없는 행을 적으면 검수 뷰가 그 행 때문에
         *   큐에 뜨고 검수자 화면엔 빈 카드가 뜬다 — `functions/corrections` 가 학생 쪽에서
         *   막으려던 그 모양이다. 안 적으면 다음 배치가 다시 집는다. */
        const 사유 = 안전사유(값.사유);
        console.error('[correct] correction_rejected', 사유);
        센다(버림, 사유);
        await 장부에(행.submission_id, 사유);
        미룸 += 1;
        continue;
      }

      if (await 적기(행.submission_id, 값, 모델, 판, ver, 차례[0].attempt_id, null)) {
        적음 += 1;
        await 장부정리(행.submission_id);
      } else 미룸 += 1;
    } catch (e) {
      console.error('[correct] correction_request_failed');
      센다(버림, '예외');
      await 장부에(행.submission_id, '예외');
      미룸 += 1;
    }
  }

  return 봉투(200, {
    대기: 대기수, 집음: 행들.length, 적음, 미룸, 버림, 장부,
    캐시: 성적합(성적들), 모델, prompt_ver: 판,
  });
}

// 런타임의 기본 예외 로그에 DB/벤더 원문이 넘어가지 않게 고정 코드로 끝낸다.
Deno.serve(async (req: Request) => {
  try { return await 처리(req); }
  catch { return 봉투(503, { error: 'correction_request_failed', needs_attention: true }); }
});
