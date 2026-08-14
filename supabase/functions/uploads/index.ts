/* POST /v1/uploads/sign — C0 §4-2. 음성·이미지 원본을 **비공개 버킷**에 올릴 서명을 낸다.
 *
 * 순서: ①여기서 서명을 받고 → ②앱이 Storage 로 **직접** PUT → ③성공하면 참조를 `/v1/events` 로.
 *   업로드가 **먼저**인 이유: 반대로 하면 참조가 가리키는 파일이 없는 행이 남고, 그건 나중에
 *   「전사 실패」와 구분되지 않는다.
 *
 * ■ 이 함수가 지는 것 셋 — 전부 「나중에 못 고치는」 것들이다
 *   ① **경로**(L0 §9-3-1) — `{voice|image}/{learner_id}/{uuid}.{ext}`. 앱이 경로를 정하지 않는다.
 *      규칙은 `lib/업로드경로.js` 정본을 **동봉**해서 쓴다(베끼면 갈라지고, 갈라지는 방향은 통과다).
 *      규칙 밖으로 한 번 나간 파일은 규칙을 고쳐도 안 옮겨지고, 그날 동의문의 「모두 삭제」가
 *      거짓이 된다.
 *   ② **동의** — 서명을 내주는 것이 곧 수집 허가다. `events` 에만 동의 게이트를 두면 동의 없는
 *      학생의 음성이 **Storage 에는 이미 올라간 뒤** 행만 거절되고, 파일은 남는다.
 *      🔑 게이트는 문 뒤가 아니라 **문에** 있어야 한다.
 *   ③ **학생** — 토큰에서 확정한다. 본문의 learner_id 는 받지 않는다(service_role 은 RLS 를
 *      우회하므로 본문을 믿는 순간 남의 폴더에 쓰는 서명을 발급한다).
 *
 * ■ 규격 밖(m4a·aac)이어도 서명을 내준다
 *   C0 §4-2 가 못박은 대로다 — 거부하면 학생의 발화가 **영영 사라진다.** 규격은 사람이 지키는
 *   약속이 아니라 행마다 붙는 관측값이어야 하고, 그 관측은 파일이 올라온 뒤 헤더에서 잰다.
 *   🔑 그래서 확장자만은 **실제 그것**으로 적는다(m4a 를 .wav 로 적으면 뒤에서 전부 오판한다).
 */
import postgres from 'npm:postgres@3.4.4';
import 경로모듈 from './업로드경로.mjs';
import 토큰모듈 from './토큰.mjs';
import 계약판모듈 from './계약판.mjs';

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };
const { 버킷, 경로만들기 } = 경로모듈 as {
  버킷: string;
  경로만들기: (a: Record<string, unknown>) => { ref: string | null; 이유: string | null };
};

/* 상한 25MB(C0 §4-2). 음성은 **보존 무제한**이라 용량 실수의 비용이 영구적이다. */
const 최대바이트 = 25 * 1024 * 1024;

/* 서명 수명 1시간. 몽골 모바일 회선에서 25MB 를 올리는 데 15분은 빠듯하고, 만료된 서명은
 * 「업로드 실패」로만 보여서 원인이 안 드러난다. 경로에 매번 새 uuid 가 들어가므로
 * 재사용 위험은 그 한 파일 자리뿐이다. */
// 10분 — 25MB 상한 업로드에 충분하다. 1시간에서 줄였다: 서명은 동의 게이트를 **발급 시점에** 통과한
// 허가증이라, 철회 뒤에도 수명만큼 살아 있는 「꼬리」가 그대로 수집 창이 된다(「철회 후 수집 0건」 · sol P0).
const 서명수명초 = 600;

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 「누구인가」 다음은 「아직 살아 있는가」 — 정본은 `lib/토큰.js` 하나다(절단문서 ②-15).
 * `sql` 뒤에서 꺼낸다: 조각의 타입이 이 클라이언트에 매여 있다. */
const { 발급시각, 살아있는학생 } = 토큰모듈 as {
  발급시각: (req: Request) => number | null;
  살아있는학생: (질의: typeof sql, 주체: string, iat: number | null) => ReturnType<typeof sql>;
};
const { 판번호, 행들에서판, 앞선판인가 } = 계약판모듈 as {
  판번호: (판: unknown) => number | null;
  행들에서판: (행들: unknown) => string | null;
  앞선판인가: (앞: unknown, 뒤: unknown) => boolean;
};

type 오류 = { code: string; message: string; retryable: boolean; field?: string };

function 봉투(status: number, body: Record<string, unknown>, ver: string) {
  return new Response(JSON.stringify({ contract_ver: ver, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const 실패 = (status: number, e: 오류, ver: string) => 봉투(status, { ok: false, error: e }, ver);

Deno.serve(async (req: Request) => {
  const 선언 = req.headers.get('X-Contract-Ver') ?? '';
  if (!선언) return 실패(400, { code: 'CONTRACT_VER_MISSING', message: 'X-Contract-Ver 헤더가 없습니다', retryable: false }, 선언);
  if (판번호(선언) === null) {
    return 실패(426, { code: 'CONTRACT_VER_UNSUPPORTED', message: `계약판 형식이 아닙니다: ${선언}`, retryable: false }, 선언);
  }
  if (req.method !== 'POST') return 실패(405, { code: 'CONTRACT_VIOLATION', message: 'POST 만 받는다', retryable: false }, 선언);

  /* 함수 이름은 `uploads` 고 C0 가 적은 경로는 `/v1/uploads/sign` 이다 — 뒷마디까지 본다.
   * 안 보면 `/uploads/아무거나` 가 전부 서명 발급으로 동작하고, 나중에 `/uploads/…` 형제를
   * 만드는 날 옛 오타 경로가 **이미 돌고 있던 것**이 된다. */
  if (!new URL(req.url).pathname.replace(/\/+$/, '').endsWith('/sign')) {
    return 실패(404, { code: 'CONTRACT_VIOLATION', message: '없는 경로입니다 — POST /v1/uploads/sign', retryable: false }, 선언);
  }

  const 주체 = 토큰주체(req);
  if (!주체) return 실패(401, { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false }, 선언);

  let 본문: { kind?: unknown; content_type?: unknown; byte_size?: unknown };
  try {
    본문 = JSON.parse((await req.text()) || '{}');
  } catch {
    return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'JSON 이 아닙니다', retryable: false }, 선언);
  }

  // 학생 확정 · DB 계약판을 한 번에 읽는다(왕복 1회). 계약판은 **DB 에게 묻는다** — 함수가
  // DB 보다 앞설 수 없어야 하고, 손 상수를 두면 마이그레이션마다 사람이 같이 올려야 한다.
  const [행] = await sql`
    select (select learner_id from engine.learners where ${살아있는학생(sql, 주체, 발급시각(req))}) as learner_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const ver = 행들에서판(행);
  if (!ver) {
    console.error('[uploads-sign] DB 계약판을 못 읽었다', 행?.최신조각);
    return 실패(500, { code: 'SERVER_ERROR', message: '서버 설정 오류입니다', retryable: true }, 선언);
  }

  if (앞선판인가(선언, ver)) {
    return 실패(426, {
      code: 'CONTRACT_VER_UNSUPPORTED', retryable: false,
      message: `서버가 아직 ${선언} 을 모릅니다(현재 ${ver}) — 잠시 뒤 다시 시도해 주세요`,
    }, ver);
  }

  if (!행?.learner_id) {
    return 실패(401, { code: 'AUTH_REQUIRED', message: '학생 계정이 아닙니다', retryable: false }, ver);
  }
  const learner_id: string = 행.learner_id;

  /* 🔴 동의 게이트 — **서명을 내주는 것이 곧 수집 허가다.**
   * `events` 에만 두면 파일은 이미 Storage 에 있고 행만 거절돼, 동의 없이 모은 녹음이 남는다.
   * 🔑 술어의 **정본은 `lib/동의게이트.js 지금유효술어`** 다(2026-08-07: 같은 술어가 네 곳에
   *   네 가지로 적혀 있었고 `deliver` 는 양쪽으로 어긋나 있었다). 이 파일이 그 텍스트와 갈라지면
   *   `tests/동의게이트.test.js` 가 빨개진다.
   *   ⚠ 정본 함수를 **직접 부르는 형태**로 바꾸는 것은 이 함수를 든 트랙 몫이다 — 지금 옆 세션이
   *   `functions/events` 와 그 회귀를 들고 있어 여기서 모양을 바꾸면 남의 검사가 빨개진다(F073). */
  const 동의 = await sql`
    select consent_ver from engine.consents
     where learner_id = ${learner_id}::uuid
       and agreed_at <= now()
       and (revoked_at is null or revoked_at > now())
     order by agreed_at desc limit 1`;
  if (!동의.length) {
    return 실패(403, {
      code: 'CONSENT_MISSING', field: 'consent_ver', retryable: false,
      message: '유효한 동의가 없습니다 — 동의 화면을 먼저 띄워야 합니다',
    }, ver);
  }

  // 크기는 앱이 말한 값이다(서버는 아직 파일을 못 봤다). 그래도 **먼저** 막는다 —
  // 25MB 상한을 Storage 에 도착한 뒤에 재면 그때는 이미 올라간 뒤다.
  const byte_size = Number(본문.byte_size);
  if (!Number.isFinite(byte_size) || byte_size <= 0) {
    return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'byte_size(양의 정수)가 필요합니다', field: 'byte_size', retryable: false }, ver);
  }
  if (byte_size > 최대바이트) {
    return 실패(413, {
      code: 'PAYLOAD_TOO_LARGE', field: 'byte_size', retryable: false,
      message: `파일이 너무 큽니다(${Math.round(최대바이트 / 1024 / 1024)}MB 까지)`,
    }, ver);
  }

  // 경로는 **정본 규칙이 만든다.** 앱이 준 이름은 쓰지 않는다.
  const { ref, 이유 } = 경로만들기({
    kind: 본문.kind, content_type: 본문.content_type, learner_id, uuid: crypto.randomUUID(),
  });
  if (!ref) {
    return 실패(400, { code: 'CONTRACT_VIOLATION', message: String(이유), field: 'content_type', retryable: false }, ver);
  }

  /* 서명 발급 — Storage REST. `engine` 스키마 미노출과 무관하다(Storage 는 PostgREST 를 안 지난다).
   *
   * 🔴 **`SUPABASE_SERVICE_ROLE_KEY` 를 쓰지 않는다.** 2026-08-06 리허설 실측:
   *   플랫폼이 그 이름에 넣어주는 값이 **새 형식(`sb_secret_…`)** 이고, Storage 는 그걸 거절한다
   *   (`Invalid Compact JWS`). 헤더 조합 5가지를 전부 쏴 봤고 통과한 것은 **레거시 JWT 키뿐**이다
   *   (`Authorization` 단독·`apikey`+`Authorization` 둘 다 200 · 새 키는 세 조합 모두 400).
   *   그래서 **명시 시크릿**으로 받는다 — 이름이 뜻하는 바가 플랫폼 사정으로 조용히 바뀌는 것을
   *   그대로 맞는 대신, 우리가 이름을 정하고 모양까지 검사한다(`tools/스토리지키_설정.js`).
   */
  const base = Deno.env.get('SUPABASE_URL')!;
  const 키 = Deno.env.get('STORAGE_SIGN_KEY') ?? '';
  /* 모양을 **먼저** 본다. 안 그러면 증상이 「업로드만 안 됨」이고 원인이 키 형식이라는 게
   * 어디에도 안 적힌다 — 오늘 그걸로 한 바퀴 돌았다. 같은 실수를 기계가 막는다. */
  if (키.split('.').length !== 3) {
    console.error('[uploads-sign] STORAGE_SIGN_KEY 가 JWT 형태가 아니다 — 레거시 service_role 키여야 한다');
    return 실패(500, {
      code: 'SERVER_ERROR', retryable: false,
      message: 'STORAGE_SIGN_KEY 설정 오류입니다 — 레거시 service_role(JWT) 키가 필요합니다',
    }, ver);
  }
  const r = await fetch(`${base}/storage/v1/object/upload/sign/${버킷}/${ref}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${키}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 서명수명초 }),
  });
  if (!r.ok) {
    /* 🔑 상류 상태를 **응답에도** 싣는다(본문은 아니다 — 거기엔 키가 섞일 수 있다).
     * 「업로드 주소를 만들지 못했습니다」만 있으면 버킷이 없는 것과 키가 틀린 것과 경로가
     * 잘못된 것이 전부 같은 모양이 된다. 로그는 지연·유실되지만 응답은 그 자리에 있다. */
    const 본문글 = (await r.text()).slice(0, 200);
    console.error('[uploads-sign] 서명 실패', r.status, 본문글);
    return 실패(502, {
      code: 'SERVER_ERROR', retryable: true,
      message: `업로드 주소를 만들지 못했습니다 (storage ${r.status})`,
    }, ver);
  }
  const { url } = JSON.parse(await r.text()) as { url: string };

  return 봉투(200, {
    ok: true,
    upload_url: `${base}/storage/v1${url}`,
    // 이름을 갈래대로 준다 — 앱이 그대로 submission 의 audio_ref·image_refs 에 싣는다.
    ...(본문.kind === 'audio' ? { audio_ref: ref } : { image_ref: ref }),
    expires_at: new Date(Date.now() + 서명수명초 * 1000).toISOString(),
  }, ver);
});
