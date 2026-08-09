/* 교정 배치 — 학생 발화에 **AI 1차 교정안**을 붙인다. (대기열 P1 · L0 §679 `ai_processing_logs`)
 *
 * ■ 이 자리가 무엇을 닫나 — 「생산자 0」
 *   `engine.review_queue` 는 「학생 제출 행 + **AI 교정이 섰음**」을 inner join 으로 요구한다.
 *   그런데 저장소 전체에 `engine.corrections` INSERT 가 **0줄**이라, 학생 발화에는 그 교정이
 *   영원히 안 붙고 큐는 **구조적으로 0행**이었다(리허설 실측: 제출 704 · AI 교정 462 · 큐 0 —
 *   462건은 전부 배달 사건에 붙은 것이라 검수 대상이 아니다). 큐가 0이면 검수·승격·엔진
 *   도달이 전부 0이다. 그 첫 마디가 여기다.
 *
 * ■ 호출자
 *   `pg_cron` 이 `Authorization: Bearer <service_role>` 로 부른다(`deliver`·`transcribe` 와 같은
 *   통로). 학생 토큰은 못 들어온다 — 이 함수는 **남의 행도** 읽고 쓴다.
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

const { 서비스역할 } = 토큰모듈 as { 서비스역할: (req: Request) => boolean };
const { 모델, 왕복제한밀리, 프롬프트판, 태그어긋남, 요청몸통, 응답글, 교정값, 재시도가능 } = 교정모듈 as {
  모델: string;
  왕복제한밀리: number;
  프롬프트판: (지시문: string) => string | null;
  태그어긋남: (지시문: string, 태그목록: string[]) => { 프롬프트에없음: string[]; 계약에없음: string[] };
  요청몸통: (a: { 지시문: string; 문장: string; 급수: string | null }) => Record<string, unknown>;
  응답글: (본문: unknown) => string | null;
  교정값: (글: string, 태그목록: string[]) => {
    corrected_text?: string; error_tags?: string[]; explanation?: string | null; 사유: string | null;
  };
  재시도가능: (status: number) => boolean;
};

/* 🔴 오류태그 값목록의 **정본은 계약 JSON 하나**다(L0 §237 — DB CHECK 를 안 걸고 검증을
 *   서버에 맡겼다). 여기서 배열을 다시 적으면 그게 세 번째 사본이 된다. */
const 태그목록: string[] = ((계약 as Record<string, unknown>).오류태그 as string[]) ?? [];

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 한 번에 집는 수. Edge Function 벽시계 안에서 왕복이 끝나야 한다 — 크게 잡으면 마지막
 * 몇 건이 매번 잘리고, 그 잘림은 「대기가 안 줄어든다」로만 보인다(`transcribe` 와 같은 축). */
const 기본배치 = 5;
const 최대배치 = 25;

const 계약판 = /^c(\d+)$/;

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return 봉투(405, { error: 'method_not_allowed' });
  if (!서비스역할(req)) return 봉투(401, { error: 'service_role 만 부를 수 있습니다' });

  const 키 = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const url = new URL(req.url);
  const 배치 = Math.min(최대배치, Math.max(1, Number(url.searchParams.get('limit')) || 기본배치));

  /* 🔑 **분모를 먼저 센다.** 아래 어느 갈래로 빠지든 「몇 건이 기다리고 있었나」는 나온다 —
   *   그래야 「0건 처리」를 「할 게 없었다」로 오독하지 않는다(F207).
   *   ⚠ 동의 술어의 정본 = `lib/동의게이트.js 지금유효술어`(`tests/동의게이트.test.js` 가 묶는다). */
  const [{ count: 대기수 }] = await sql`
    select count(*)::int as count
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
              where c.submission_id = s.submission_id and c.actor_kind = 'ai')`;

  if (!키) {
    console.error('[correct] ANTHROPIC_API_KEY 미설정 — 행을 건드리지 않고 끝낸다');
    return 봉투(200, { 대기: 대기수, 적음: 0, 이유: 'no_api_key' });
  }

  /* 🔴 **어느 프롬프트가 만들었는지 모르면 안 적는다.** `prompt_ver` 가 빈 교정문은 나중에
   *   「v1 이 v2 보다 나았나」를 물을 때 갈라낼 근거가 없다 — 그 오염은 소급이 안 된다. */
  const 판 = 프롬프트판(지시문 as string);
  if (!판) {
    console.error('[correct] prompts/교정.md 에서 「현재 vN」을 못 읽었다');
    return 봉투(200, { 대기: 대기수, 적음: 0, 이유: 'no_prompt_ver' });
  }

  /* 🔴 프롬프트의 통제 어휘와 계약 값목록이 갈라지면 **돌기 전에** 멈춘다.
   *   `prompts/교정.md` 가 스스로 「갈라지면 2년치 집계가 깨진다」고 적어 둔 경고를 기계로
   *   옮긴 자리다 — 산문으로 남은 경고는 지켜지지 않는다. 갈라진 채 돌면 증상이 **없다**:
   *   모델이 못 붙이는 태그가 생기거나(축 소실), 붙여도 전량 폐기된다. */
  const 어긋남 = 태그어긋남(지시문 as string, 태그목록);
  if (어긋남.프롬프트에없음.length || 어긋남.계약에없음.length) {
    console.error('[correct] 🔴 값목록이 갈라졌다', JSON.stringify(어긋남));
    return 봉투(200, { 대기: 대기수, 적음: 0, 이유: 'tag_drift', 어긋남 });
  }

  // 계약판은 **DB 에게 묻는다** — 손 상수를 두면 마이그레이션마다 사람이 같이 올려야 한다.
  const [판행] = await sql`select name from engine.schema_migrations order by version desc limit 1`;
  const ver = 계약판.exec(String(판행?.name ?? '').match(/_(c\d+)\.sql$/)?.[1] ?? '')?.[0];
  if (!ver) {
    console.error('[correct] DB 계약판을 못 읽었다', 판행?.name);
    return 봉투(500, { 대기: 대기수, 적음: 0, 이유: 'no_contract_ver' });
  }

  const 행들 = await sql<{ submission_id: string; 문장: string; 급수: string | null }[]>`
    select s.submission_id,
           btrim(coalesce(s.body_original, s.transcript)) as 문장,
           e.level_snapshot as 급수
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
     order by s.occurred_at
     limit ${배치}`;

  let 적음 = 0; let 미룸 = 0;
  /* 버린 것은 **사유별로** 센다 — 합쳐 세면 「모델이 형식을 어긴다」와 「계약 밖 태그를 붙인다」가
   * 한 숫자가 되는데, 처방이 정반대다(응답 파싱을 고쳐라 / 프롬프트·계약을 맞춰라). */
  const 버림: Record<string, number> = {};

  for (const 행 of 행들) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': 키,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(요청몸통({ 지시문: 지시문 as string, 문장: 행.문장, 급수: 행.급수 })),
        signal: AbortSignal.timeout(왕복제한밀리),
      });

      if (!r.ok) {
        const 글 = (await r.text()).slice(0, 300);
        console.error('[correct] 벤더 실패', 행.submission_id, r.status, 글);
        /* 🔴 영구 실패도 **못박을 칸이 없다**(`corrections` 에 상태 열이 없다) — 다음 배치가
         *   다시 집는다. 지금 할 수 있는 것은 그 사실을 세어 드러내는 것뿐이고, 이 수가 배치
         *   크기에 가까워지면 앞머리가 막힌 것이다(`lib/교정엔진.js 재시도가능` 머리말). */
        버림[재시도가능(r.status) ? `벤더_재시도:${r.status}` : `벤더_영구:${r.status}`] =
          (버림[재시도가능(r.status) ? `벤더_재시도:${r.status}` : `벤더_영구:${r.status}`] ?? 0) + 1;
        미룸 += 1;
        continue;
      }

      const 글 = 응답글(await r.json());
      if (!글) {
        console.error('[correct] 응답 형식 밖', 행.submission_id);
        버림['응답형식밖'] = (버림['응답형식밖'] ?? 0) + 1;
        미룸 += 1;
        continue;
      }

      const 값 = 교정값(글, 태그목록);
      if (값.사유) {
        /* 🔴 **빈 행을 만들지 않는다.** 교정문도 태그도 없는 행을 적으면 검수 뷰가 그것 때문에
         *   큐에 뜨고 검수자 화면엔 빈 카드가 뜬다 — `functions/corrections` 가 학생 쪽에서
         *   막으려던 그 모양이다. 안 적으면 다음 배치가 다시 집는다. */
        console.error('[correct] 버림', 행.submission_id, 값.사유);
        const 키이름 = 값.사유.split(':')[0];
        버림[키이름] = (버림[키이름] ?? 0) + 1;
        미룸 += 1;
        continue;
      }

      /* 🔑 `where not exists` — 자물쇠와 **같은 방향**이다(`transcribe` 의 `transcript is null`).
       *   두 배치가 겹쳐도 두 번째 INSERT 가 0행이 된다. */
      const 쓴것 = await sql`
        insert into engine.corrections (
          submission_id, actor_kind, corrected_text, error_tags, explanation,
          model, prompt_ver, schema_ver
        )
        select ${행.submission_id}::uuid, 'ai'::engine.actor_kind,
               ${값.corrected_text!}, ${값.error_tags!}, ${값.explanation ?? null},
               ${모델}, ${판}, ${ver}
         where not exists (
                 select 1 from engine.corrections c
                  where c.submission_id = ${행.submission_id}::uuid and c.actor_kind = 'ai')
        returning correction_id`;
      if (쓴것.length) 적음 += 1; else 미룸 += 1;
    } catch (e) {
      console.error('[correct] 예외', 행.submission_id, String((e as Error)?.message ?? e));
      버림['예외'] = (버림['예외'] ?? 0) + 1;
      미룸 += 1;
    }
  }

  return 봉투(200, { 대기: 대기수, 집음: 행들.length, 적음, 미룸, 버림, 모델, prompt_ver: 판 });
});
