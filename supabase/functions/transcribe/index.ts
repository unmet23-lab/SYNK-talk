/* 전사 배치 — `submissions.transcript` 를 채운다. (P0 §6-4 · L0 §9-2 · `lib/전사.js` 머리말)
 *
 * ■ 호출자
 *   `pg_cron` 이 `Authorization: Bearer <service_role>` 로 부른다(`deliver` 와 같은 통로).
 *   학생 토큰은 여기 못 들어온다 — 이 함수는 **남의 행도** 읽고 쓴다.
 *
 * ■ 🔴 키가 없으면 **행을 안 건드린다**
 *   `OPENAI_API_KEY` 미설정은 그 발화의 문제가 아니라 우리 설정 문제다. 그때 행을 `failed` 로
 *   못박으면 키가 오는 날 그 발화들은 **두 번 다시 안 집어진다** — 원본 음성은 남는데 자동
 *   통로에서는 영구 소멸한 것과 같다. 그래서 여기서는 세지 못한 이유를 응답에 적고 끝낸다.
 *
 * ■ 락을 안 건다 (ponytail: 중복 호출은 Whisper 한 번 낭비로 끝난다)
 *   `for update skip locked` 로 잠그려면 Whisper 왕복(수 초~수십 초) 내내 트랜잭션이 열려 있어야
 *   한다. 대신 UPDATE 에 `transcript is null` 을 걸었다 — 두 배치가 같은 행을 집어도 두 번째
 *   UPDATE 가 0행이 되어 **덮어쓰기는 원리상 못 일어난다**(DB 트리거와 같은 방향).
 *   ponytail: 락 없음 — 배치가 겹칠 만큼 잦아지면 `skip locked` + 선점 상태값으로 올린다.
 */
import postgres from 'npm:postgres@3.4.4';
import 전사모듈 from './전사.mjs';
import 경로모듈 from './업로드경로.mjs';
import 토큰모듈 from './토큰.mjs';

const { 서비스역할 } = 토큰모듈 as { 서비스역할: (req: Request) => boolean };
const { 버킷 } = 경로모듈 as { 버킷: string };
const { 상태, 전사값, 전사실패 } = 전사모듈 as {
  상태: Record<string, string>;
  전사값: (본문: unknown) => { transcript: string; 언어: string | null } | null;
  전사실패: (status: number) => { state: string | null; 재시도: boolean };
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 계약이 지목한 모델(`검수의뢰_엔진수집설계` §224 · `L0_데이터계약` §698 「Whisper 가 고쳐 듣는다」).
 * 🔑 두 칸 설계(`transcript` / `transcript_verified`)가 **이 모델의 「고쳐 듣기」를 전제로** 서 있다.
 * ponytail: 모델 버전을 남기는 열이 아직 없다 — 벤더가 **둘째**로 늘어나기 전에 추가한다
 *   (하나뿐인 지금은 손실 0이고, 그날부터는 옛 전사와 새 전사가 영영 안 갈린다). */
const 모델 = 'whisper-1';

/* 한국어로 못박는다 — 한국어 학원의 과제 발화다. 자동 감지에 맡기면 **짧고 발음이 서툰**
 * 초급 발화가 다른 언어로 넘어가고, 그 행의 전사는 통째로 쓰레기가 된다.
 * ⚠ 코드스위칭(몽골어 섞임)은 그대로 나온다 — 그것도 우리가 모으려는 관측이다. */
const 언어 = 'ko';

/* 한 번에 집는 수. Edge Function 벽시계 안에서 다운로드+왕복이 끝나야 한다 —
 * 크게 잡으면 마지막 몇 건이 매번 잘리고, 그 잘림은 「pending 이 안 줄어든다」로만 보인다. */
const 기본배치 = 5;
const 최대배치 = 25;

/* 벤더 왕복 상한. 25MB 상한 파일이 몽골 회선이 아니라 **서버↔벤더** 사이를 가는 값이다. */
const 왕복제한밀리 = 120_000;

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Storage 원본을 통째로 읽는다 — 전사는 앞머리로 안 된다(`events` 의 헤더 측정과 다른 자리다). */
async function 원본받기(ref: string): Promise<{ bytes: Uint8Array } | { 오류: string }> {
  const base = Deno.env.get('SUPABASE_URL') ?? '';
  const 키 = Deno.env.get('STORAGE_SIGN_KEY') ?? '';
  /* 모양을 **먼저** 본다 — `SUPABASE_SERVICE_ROLE_KEY`(새 형식 `sb_secret_…`)를 넣으면 Storage 가
   * 거절하고 증상은 「전사만 안 됨」이라 원인이 어디에도 안 남는다(events·uploads 와 같은 자리). */
  if (!base || 키.split('.').length !== 3) return { 오류: 'storage_key' };
  const r = await fetch(`${base}/storage/v1/object/${버킷}/${ref}`, {
    headers: { Authorization: `Bearer ${키}` },
    signal: AbortSignal.timeout(왕복제한밀리),
  });
  if (!r.ok) return { 오류: `storage_${r.status}` };
  return { bytes: new Uint8Array(await r.arrayBuffer()) };
}

/** 확장자는 **실제 그것**으로 넘긴다 — m4a 를 .wav 로 적으면 벤더가 앞머리부터 오판한다. */
const 확장자 = (ref: string) => (ref.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? 'wav').toLowerCase();

Deno.serve(async (req) => {
  if (req.method !== 'POST') return 봉투(405, { error: 'method_not_allowed' });
  if (!서비스역할(req)) return 봉투(401, { error: 'service_role 만 부를 수 있습니다' });

  const 키 = Deno.env.get('OPENAI_API_KEY') ?? '';
  const url = new URL(req.url);
  const 배치 = Math.min(최대배치, Math.max(1, Number(url.searchParams.get('limit')) || 기본배치));

  /* 🔑 **분모를 먼저 센다.** 「0건 처리」가 「대기가 0」인지 「집다가 죽었다」인지 갈려야 한다
   *   (F207 — 미실행은 통과와 같은 모양으로 온다). */
  const [{ count: 대기수 }] = await sql`
    select count(*)::int as count from engine.submissions
     where transcript_state = ${상태.대기}`;

  if (!키) {
    console.error('[transcribe] OPENAI_API_KEY 미설정 — 행을 건드리지 않고 끝낸다');
    return 봉투(200, { 대기: 대기수, 처리: 0, 이유: 'no_api_key' });
  }

  const 행들 = await sql<{ event_id: string; audio_ref: string }[]>`
    select event_id, audio_ref from engine.submissions
     where transcript_state = ${상태.대기} and audio_ref is not null and transcript is null
     order by occurred_at
     limit ${배치}`;

  let 성공 = 0; let 못박음 = 0; let 미룸 = 0;
  for (const 행 of 행들) {
    try {
      const 받음 = await 원본받기(행.audio_ref);
      if ('오류' in 받음) {
        /* Storage 가 안 주는 것은 **우리 쪽**이다 — 못박지 않는다(다음 배치가 다시 집는다). */
        console.error('[transcribe] 원본 실패', 행.event_id, 받음.오류);
        미룸 += 1;
        continue;
      }
      const fd = new FormData();
      fd.append('file', new Blob([받음.bytes]), `발화.${확장자(행.audio_ref)}`);
      fd.append('model', 모델);
      fd.append('response_format', 'verbose_json');
      fd.append('language', 언어);

      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${키}` },
        body: fd,
        signal: AbortSignal.timeout(왕복제한밀리),
      });

      if (!r.ok) {
        const 글 = (await r.text()).slice(0, 300);
        const 판정 = 전사실패(r.status);
        console.error('[transcribe] 벤더 실패', 행.event_id, r.status, 글);
        if (판정.state) {
          await sql`update engine.submissions set transcript_state = ${판정.state} where event_id = ${행.event_id}::uuid`;
          못박음 += 1;
        } else 미룸 += 1;
        continue;
      }

      const 값 = 전사값(await r.json());
      if (!값) {
        /* 우리가 아는 모양이 아니다 — 벤더가 형식을 바꿨거나 딴것을 줬다. 못박으면 그 배포
         * 구간의 발화가 전부 죽으므로 미룬다(고칠 사람은 우리다). */
        console.error('[transcribe] 응답 형식 밖', 행.event_id);
        미룸 += 1;
        continue;
      }
      /* 🔴 `transcript is null` — 자물쇠와 **같은 방향**이다. 이게 없으면 두 배치가 겹친 날
       *   DB 트리거가 예외를 던지고 그 예외가 배치를 통째로 세운다. */
      const 쓴것 = await sql`
        update engine.submissions
           set transcript = ${값.transcript}, transcript_state = ${상태.기계}
         where event_id = ${행.event_id}::uuid and transcript is null
         returning event_id`;
      if (쓴것.length) 성공 += 1; else 미룸 += 1;
    } catch (e) {
      console.error('[transcribe] 예외', 행.event_id, String((e as Error)?.message ?? e));
      미룸 += 1;
    }
  }

  return 봉투(200, { 대기: 대기수, 집음: 행들.length, 전사: 성공, 못박음, 미룸 });
});
