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
import 동의모듈 from './동의게이트.mjs';

const { 서비스역할 } = 토큰모듈 as { 서비스역할: (req: Request) => boolean };
const { 지금유효 } = 동의모듈 as {
  지금유효: (db: unknown, learner: string) => Promise<unknown[]>;
};
const { 버킷, 저장소헤더, 저장소키흠 } = 경로모듈 as {
  버킷: string;
  저장소헤더: (키: string) => Record<string, string>;
  저장소키흠: (키: string) => string | null;
};
const { 상태, 전사값, 세그먼트값, 전사실패 } = 전사모듈 as {
  상태: Record<string, string>;
  전사값: (본문: unknown) => { transcript: string; 언어: string | null } | null;
  세그먼트값: (본문: unknown) => { stt_segments: unknown[]; stt_confidence: number | null } | null;
  전사실패: (status: number) => { state: string | null; 재시도: boolean };
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 계약이 지목한 모델(`검수의뢰_엔진수집설계` §224 · `L0_데이터계약` §698 「Whisper 가 고쳐 듣는다」).
 * 🔑 두 칸 설계(`transcript` / `transcript_verified`)가 **이 모델의 「고쳐 듣기」를 전제로** 서 있다.
 * ✅ 2026-09-02 — 위 빚(「모델 버전을 남기는 열이 없다」)을 갚았다: `stt_model` 열과 아래 `전사판`.
 *   벤더가 둘째로 늘기 전에 넣었으므로 옛 전사와 새 전사가 갈린다. */
const 모델 = 'whisper-1';

/* 한국어로 못박는다 — 한국어 학원의 과제 발화다. 자동 감지에 맡기면 **짧고 발음이 서툰**
 * 초급 발화가 다른 언어로 넘어가고, 그 행의 전사는 통째로 쓰레기가 된다.
 * ⚠ 코드스위칭(몽골어 섞임)은 그대로 나온다 — 그것도 우리가 모으려는 관측이다.
 * 🔑 **이 값과 `stt_lang` 은 낱말이 다르다**(09-03 실측): 우리가 보내는 것은 코드 `ko` 인데
 *   벤더가 `verbose_json.language` 로 돌려주는 것은 이름 `korean` 이다. 두 칸을 문자열로 그냥
 *   맞대면 **늘 안 맞는다** — 「요청 ↔ 들은 것」을 견줄 사람은 코드로 접고 나서 견줘라. */
const 언어 = 'ko';

/* 행에 남기는 «요청판» 한 줄 — 요청(`fd.append`)과 장부(`stt_model`)가 **같은 상수**에서 나온다.
 * 두 곳이 각자 알면 모델을 바꾼 날 요청만 바뀌고 장부는 옛 이름을 계속 적는다 — 그때 장부는
 * 거짓말을 하고, 거짓말인 줄 아무도 모른다(형제 appsscript `교재연동.js` 가 같은 이유로 상수를 올렸다).
 * 꼴은 형제의 `voice_log.전사엔진판`(`gcp-stt:default:ko-KR`)과 나란히 읽히게 맞췄다.
 * ⚠ «서빙된» 판이 아니다 — 벤더는 실제로 돌린 판을 응답에 안 싣는다. 이 칸이 말할 수 있는 것은
 *   「우리 쪽 조건은 안 바뀌었다」까지다(형제 규격 ㉡ · L0 §15). */
const 전사판 = `openai:${모델}:${언어}`;

/* 한 번에 집는 수. Edge Function 벽시계 안에서 다운로드+왕복이 끝나야 한다 —
 * 크게 잡으면 마지막 몇 건이 매번 잘리고, 그 잘림은 「pending 이 안 줄어든다」로만 보인다. */
const 기본배치 = 5;
const 최대배치 = 25;

/* 벤더 왕복 상한. 25MB 상한 파일이 몽골 회선이 아니라 **서버↔벤더** 사이를 가는 값이다. */
const 왕복제한밀리 = 120_000;

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/* 🔴 **왜 세어서 봉투에 싣나** (2026-08-15)
 *   이 함수는 실패 갈래가 넷인데 넷 다 `미룸`·`못박음` 이라는 **정수 하나로 접혔다**. 그래서
 *   「대기 40, 전사 0, 미룸 40」 을 받아도 저장소가 죽은 건지·키가 틀린 건지·벤더가 형식을
 *   바꾼 건지 갈리지 않았고, 갈라 줄 유일한 글(`console.error`)은 **무료 플랜 로그 보존 1일**이라
 *   하루 뒤 사라졌다. 게다가 이 함수는 `pg_cron` 이 **10분마다(하루 144회)** 부르고 그 응답은
 *   `net.http_post` 라 아무도 안 읽는다 — 즉 봉투에 안 실으면 그 사유는 어디에도 안 남는다.
 *   #Q83(교정 배치가 400 으로 전량 튕긴 것)이 며칠 늦은 자리가 정확히 같은 모양이었다.
 * 🔑 오류에는 짧은 고정 코드·HTTP 상태만 남긴다. 벤더 본문·예외 메시지에는 학생 원문이나
 *   음성 경로가 섞일 수 있으므로 로그와 응답에 싣지 않는다. 상세 원인은 합성 입력으로 재현한다. */
function 센다(칸: Record<string, number>, 이름: string) {
  칸[이름] = (칸[이름] ?? 0) + 1;
}

/** Storage 원본을 통째로 읽는다 — 전사는 앞머리로 안 된다(`events` 의 헤더 측정과 다른 자리다). */
async function 원본받기(ref: string): Promise<{ bytes: Uint8Array } | { 오류: string }> {
  const base = Deno.env.get('SUPABASE_URL') ?? '';
  const 키 = Deno.env.get('STORAGE_SIGN_KEY') ?? '';
  /* 모양을 **먼저** 본다 — 읽기 갈래의 인증 실패는 `Bucket not found` 로 위장해서(2026-08-22 실측)
   * 사람이 버킷부터 뒤진다 — 형식 표의 정본은 `lib/업로드경로.js` 머리말이다(events·uploads 와 같은 자리). */
  if (!base || 저장소키흠(키)) return { 오류: 'storage_key' };
  const r = await fetch(`${base}/storage/v1/object/${버킷}/${ref}`, {
    headers: 저장소헤더(키),
    signal: AbortSignal.timeout(왕복제한밀리),
  });
  if (!r.ok) return { 오류: `storage_${r.status}` };
  return { bytes: new Uint8Array(await r.arrayBuffer()) };
}

/** 확장자는 **실제 그것**으로 넘긴다 — m4a 를 .wav 로 적으면 벤더가 앞머리부터 오판한다. */
const 확장자 = (ref: string) => (ref.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? 'wav').toLowerCase();

/* 정본 = lib/동의게이트.js 지금유효술어. 목록·DB 쓰기는 같은 조각을 쓰고,
 * 다운로드·전송 직전은 정본 지금유효()를 다시 호출한다. pipeline_jobs의 상태로 대신하지 않는다. */
const 동의조건 = () => sql`exists (
  select 1 from engine.learning_events e
  join engine.consents k on k.learner_id = e.learner_id
  where e.event_id = s.event_id and e.event_type = 'submission.created'
    and agreed_at <= now()
    and (revoked_at is null or revoked_at > now()))`;

const 대기조건 = () => sql`
  from engine.submissions s
  join engine.learning_events e on e.event_id = s.event_id
  where s.transcript_state = ${상태.대기} and s.audio_ref is not null
    and s.audio_deleted_at is null and s.transcript is null
    and ${동의조건()}`;

type 전사행 = { event_id: string; audio_ref: string; learner_id: string };

async function 사용가능(행: 전사행): Promise<boolean> {
  if (!(await 지금유효(sql, 행.learner_id)).length) return false;
  const 남음 = await sql`
    select s.event_id from engine.submissions s
    where s.event_id = ${행.event_id}::uuid and s.audio_ref = ${행.audio_ref}
      and s.audio_deleted_at is null and s.transcript is null
      and ${동의조건()}`;
  return 남음.length > 0;
}

async function 처리(req: Request) {
  if (req.method !== 'POST') return 봉투(405, { error: 'method_not_allowed' });
  if (!서비스역할(req)) return 봉투(401, { error: 'service_role 만 부를 수 있습니다' });

  const 키 = Deno.env.get('OPENAI_API_KEY') ?? '';
  const url = new URL(req.url);
  const 배치 = Math.min(최대배치, Math.max(1, Number(url.searchParams.get('limit')) || 기본배치));

  /* 🔑 **분모를 먼저 센다.** 「0건 처리」가 「대기가 0」인지 「집다가 죽었다」인지 갈려야 한다
   *   (F207 — 미실행은 통과와 같은 모양으로 온다). */
  const [{ count: 대기수 }] = await sql`
    select count(*)::int as count ${대기조건()}`;

  if (!키) {
    console.error('[transcribe]', 'no_api_key');
    return 봉투(200, { 대기: 대기수, 처리: 0, 이유: 'no_api_key' });
  }

  const 행들 = await sql<전사행[]>`
    select s.event_id, s.audio_ref, e.learner_id ${대기조건()}
     order by s.occurred_at
     limit ${배치}`;

  /* 🔑 구간을 **따로 센다**(F207). 전사만 세면 「전사 5」가 「구간도 5」로 읽히는데, 세그먼트
   *   형식이 바뀐 날엔 전사만 들어오고 검수 게이트는 조용히 하한으로 되돌아간다 — 그 차이가
   *   응답 두 수의 차이로 그 자리에서 보여야 한다. */
  let 성공 = 0; let 구간실림 = 0; let 못박음 = 0; let 미룸 = 0;
  /* 호환 필드 벤더사유에는 원문 대신 첫 고정 코드만 싣는다. */
  const 사유: Record<string, number> = {};
  let 첫벤더말: string | null = null;
  for (const 행 of 행들) {
    try {
      if (!(await 사용가능(행))) { 센다(사유, '이용중단'); 미룸 += 1; continue; }
      const 받음 = await 원본받기(행.audio_ref);
      if ('오류' in 받음) {
        /* Storage 가 안 주는 것은 **우리 쪽**이다 — 못박지 않는다(다음 배치가 다시 집는다). */
        console.error('[transcribe]', 받음.오류);
        센다(사유, `원본:${받음.오류}`);
        미룸 += 1;
        continue;
      }
      const fd = new FormData();
      fd.append('file', new Blob([받음.bytes]), `발화.${확장자(행.audio_ref)}`);
      fd.append('model', 모델);
      fd.append('response_format', 'verbose_json');
      fd.append('language', 언어);

      // 다운로드 중 철회·파일 삭제를 다시 본다. 이 확인과 외부 HTTP 전송은 원자적이지 않다.
      if (!(await 사용가능(행))) { 센다(사유, '이용중단'); 미룸 += 1; continue; }
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${키}` },
        body: fd,
        signal: AbortSignal.timeout(왕복제한밀리),
      });

      if (!r.ok) {
        await r.body?.cancel();
        const 판정 = 전사실패(r.status);
        console.error('[transcribe]', 'vendor_http', r.status);
        센다(사유, `벤더:${r.status}`);
        첫벤더말 ??= `vendor_http_${r.status}`;
        if (판정.state) {
          const 실패표식 = await sql`
            update engine.submissions s set transcript_state = ${판정.state}
             where event_id = ${행.event_id}::uuid and transcript is null
               and audio_ref = ${행.audio_ref} and audio_deleted_at is null
               and ${동의조건()}
             returning event_id`;
          if (실패표식.length) 못박음 += 1;
          else { 센다(사유, '저장제외'); 미룸 += 1; }
        } else 미룸 += 1;
        continue;
      }

      const 본문 = await r.json();
      const 값 = 전사값(본문);
      if (!값) {
        /* 우리가 아는 모양이 아니다 — 벤더가 형식을 바꿨거나 딴것을 줬다. 못박으면 그 배포
         * 구간의 발화가 전부 죽으므로 미룬다(고칠 사람은 우리다). */
        console.error('[transcribe]', 'invalid_response');
        센다(사유, '응답형식밖');
        미룸 += 1;
        continue;
      }
      /* 🔴 구간은 **전사와 같은 UPDATE 로** 나간다 — 나누면 둘 사이에서 죽은 행이 「전사는
       *   있는데 구간은 없는」 반쪽으로 남고, 그 행은 `transcript is null` 이 아니라서 다음
       *   배치가 두 번 다시 안 집는다(구간만 영구 소멸한다).
       * 🔑 형식 밖이면 **그 칸을 안 건드린다** — `[]` 로 적으면 「쟀는데 구간이 없었다」가 되고,
       *   무발화(진짜 `[]`)와 벤더 형식 변경이 같은 모양으로 접힌다. */
      const 구간 = 세그먼트값(본문);
      /* 🔴 이 갈래는 **행을 실패로 안 만든다** — 전사는 들어가고 구간만 빈다. 그래서 위 세 갈래보다
       *   더 조용하다: 「전사 5 · 구간 0」 이 정상처럼 보이고, 검수 게이트만 조용히 하한으로 내려간다.
       *   세는 이유가 그것이다(수치 둘의 차이는 사람이 눈치채야 하지만, 갈래 이름은 안 그렇다). */
      if (!구간) { console.error('[transcribe]', 'invalid_segments'); 센다(사유, '구간형식밖'); }
      /* 🔴 `transcript is null` — 자물쇠와 **같은 방향**이다. 이게 없으면 두 배치가 겹친 날
       *   DB 트리거가 예외를 던지고 그 예외가 배치를 통째로 세운다. */
      const 쓴것 = await sql`
        update engine.submissions s
           set transcript = ${값.transcript}, transcript_state = ${상태.기계},
               stt_model = ${전사판}, stt_lang = ${값.언어}${구간
             ? sql`, stt_segments = ${sql.json(구간.stt_segments as never)}, stt_confidence = ${구간.stt_confidence}`
             : sql``}
         where event_id = ${행.event_id}::uuid and transcript is null
           and audio_ref = ${행.audio_ref} and audio_deleted_at is null
           and ${동의조건()}
         returning event_id`;
      /* 0행은 다른 배치가 먼저 썼거나, 철회·파일 삭제가 확인된 경우다. 이미 보낸 HTTP 요청은
       * 되돌리지 못한다. DB 쓰기의 조건은 각 문장 시작 시점을 보며 철회와 완전한 직렬화는 아니다. */
      if (쓴것.length) {
        성공 += 1; if (구간 && 구간.stt_segments.length) 구간실림 += 1;
        /* c16 09-06 — 원신호 «불변» 보관(engine.stt_raw · append-only). submissions 의 stt_segments 는 재전사가 덮을 수 있는 «최신 판»이고,
         *   여기 남는 것은 벤더 응답 그대로다 — 모델이 바뀌어 다시 채점할 사슬은 원본이 있어야 산다(철학 A-1 v1.23 · 4회차 심문 G3 · 5회차 G1).
         *   전사 UPDATE 와 «다른» 문장이라 실패해도 전사는 들어간다 — 그 실패는 사유로 센다(조용히 0건이 되면 안 되는 자리). */
        try {
          const 원신호 = await sql`
            insert into engine.stt_raw (event_id, stt_model, stt_lang, vendor_response)
            select ${행.event_id}::uuid, ${전사판}, ${값.언어}, ${sql.json(본문 as never)}
             from engine.submissions s
             where s.event_id = ${행.event_id}::uuid and s.audio_ref = ${행.audio_ref}
               and s.audio_deleted_at is null and ${동의조건()}
             returning event_id`;
          if (!원신호.length) 센다(사유, '원신호저장제외');
        } catch {
          console.error('[transcribe]', 'raw_store_failed');
          센다(사유, '원신호보관실패');
        }
      } else { 센다(사유, '저장제외'); 미룸 += 1; }
    } catch {
      console.error('[transcribe]', 'unexpected_error');
      센다(사유, '예외');
      첫벤더말 ??= 'unexpected_error';
      미룸 += 1;
    }
  }

  /* 🔑 `사유` 는 **비어 있어도 싣는다** — 「사유 칸이 없다」와 「사유가 0건이다」가 같은 모양이면
   *   이 배선이 배포됐는지조차 응답으로 못 가른다(F207 · 미실행은 통과와 같은 얼굴로 온다). */
  return 봉투(200, {
    대기: 대기수, 집음: 행들.length, 전사: 성공, 구간: 구간실림, 못박음, 미룸,
    사유, 벤더사유: 첫벤더말,
  });
}

Deno.serve(async (req: Request) => {
  try { return await 처리(req); }
  catch {
    // 대기 조회 등 배치 바깥 DB 실패도 런타임의 미처리 예외 로그로 원문을 흘리지 않는다.
    console.error('[transcribe]', 'batch_failed');
    return 봉투(503, { error: 'batch_failed' });
  }
});
