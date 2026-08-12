/* `teach` — 강사(직원) 통로. 정본 = `docs/M2_라벨회로_설계.md`.
 *
 * ■ 이 자리가 무엇을 닫나
 *   Glide 폐기로 죽는 **유일한 라벨 입구**(AS `엔진_수집.js goldenSampleWeekly_`)의 talk 이관이다.
 *   강사가 폰에서 매주 무작위 5건의 AI 첨삭을 판정하면 그 행이 그대로 모델·프롬프트 채점표와
 *   파인튜닝 쌍의 재료가 된다 — 사람 손은 **확정 한 번**뿐이다.
 *   🔴 라벨은 소급이 비싸다: 지금 안 모으면 그 주의 판정은 두 번 다시 못 만든다.
 *
 * ■ 🔴 `review` 문을 넓히지 않고 **새 문**을 세운 이유 (설계 §2)
 *   `review` 의 `검수역할` 에 teacher 를 넣으면 강사가 골든셋 **승인·폐기 권한**까지 얻고,
 *   approve 는 `transcript_verified` 도 갱신하므로 **전사 덮어쓰기**까지 열린다. 실왕복
 *   `검수왕복시험:230` 이 teacher→403 을 핀으로 박았다 — 그 핀을 뒤집는 설계는 내지 않는다.
 *   역할 경계가 곧 축의 경계다: 검수자 = 전사 축(무엇을 말했나) · 강사 = 교정 축(교정이
 *   교육적으로 맞나). 같은 제출물에 두 행이 다 서는 것이 **정상이다**.
 *
 * ■ 🔴 골든 소속의 정본은 **감사 원장**이다 (설계 §3 · 반박 C1)
 *   approve 행도 `actor_kind='teacher'`·`reviewed_correction_id`·`verdict` 를 싣고, 오늘 두 문을
 *   지나는 사람은 **원장 한 명**이라(양쪽 허용 목록에 `director`) 역할 조인으로는 두 행을
 *   못 가른다. 그래서 judge 는 골든 행 insert 와 **같은 트랜잭션**에 `teach.gold.judge` 감사를
 *   남기고, 골든 판별·완료 표시·중복 검사·N12 조인이 **전부 그 조인 하나에서** 나온다
 *   (같은 판정을 두 곳에 적으면 갈라진다). 감사를 판정 근거로 쓰는 선례 = 청취 게이트 ②.
 *
 * ■ 🔴 표본은 저장하지 않고 **재현**한다 (설계 §4 · `lib/골든표본.js`)
 *   소비자 둘(이 문 · `tools/성적표.js`)이 같은 lib 를 쓴다. 각자 뽑으면 다른 5건이 나오고
 *   완료율·승률의 분모와 분자가 다른 표본을 센다. 풀은 **지난 완결 UTC 주**라 주중에 안 변한다.
 *
 * ■ 🔴 「어느 주의 표본인가」는 그 행의 `created_at` 이 정한다
 *   judge 가 「이번 주」를 묻지 않는 이유: 주말에 큐를 열고 월요일에 마치면 「이번 주」가
 *   갈려 **판정하던 5건이 통째로 사라진다**. 대상 행이 속한 주를 역산해 그 주의 표본과
 *   대조하면, 지난 주 표본은 다음 주에도 그대로 판정된다(늦게 끝내는 것을 막을 이유가 없다).
 *
 * ■ 게이트 상수 0 (설계 §3)
 *   청취·시간 게이트를 걸지 않는다 — **텍스트 판정**이다. 도장찍기(전건 ② 원클릭)는 막지 않고
 *   **먼저 센다**: verdict 분포와 사유 기입률 자체가 감사 재료다(관찰태그 §2 선례).
 *
 * ■ 접근층
 *   `review` 처럼 `SUPABASE_DB_URL` 직결이라 **RLS 를 우회한다** — 방어선은 RLS 가 아니라
 *   문(역할 검사)+감사다. 그래서 teacher SELECT RLS 신설이 불요다(설계 §1-③).
 *
 * ■ ⏳ 관찰 경로(`/v1/teach/observe`)는 **여기 없다**
 *   `관찰태그_자동화_설계.md` 가 정본이고 선행이 유호님 계약 판정(`observation.noted`+물리칸 2
 *   +RLS 개정)이다. 골든 경로는 그 판정과 독립이라 먼저 선다 — 판정 전에 짓지 않는다.
 */
import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';
import 확정모듈 from './검수확정.mjs';
import 표본모듈 from './골든표본.mjs';
import 동의모듈 from './동의게이트.mjs';
import 나침반모듈 from './나침반문항.mjs';
import 회고모듈 from './회고.mjs';
import 상태모듈 from './학습자상태.mjs';
import 라디오태스크모듈 from './라디오태스크.mjs';
import 반피드백모듈 from './반피드백.mjs';

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

const { 발급시각, 살아있는직원 } = 토큰모듈 as {
  발급시각: (req: Request) => number | null;
  살아있는직원: (질의: typeof sql, 주체: string, iat: number | null) => ReturnType<typeof sql>;
};

type 요청검증 = { 값: Record<string, never> | null; 이유: string | null; 칸: string | null };
const { 골든판정요청, 골든정합 } = 확정모듈 as {
  골든판정요청: (본문: unknown) => 요청검증;
  골든정합: (셋: {
    verdict: string; corrected_text: unknown; ai교정문: unknown; 전사: unknown;
  }) => string | null;
};

type 풀행 = { correction_id: string };
const { 표본, 지난주키, 주범위, 키, iso주, 주당건수 } = 표본모듈 as {
  표본: (풀: 풀행[], 주키: string, n?: number) => 풀행[] | null;
  지난주키: (지금?: Date) => string;
  주범위: (주키: string) => { 시작: string; 끝: string } | null;
  키: (연: number, 주: number) => string;
  iso주: (when: Date) => { 연: number; 주: number };
  주당건수: number;
};

/* 나침반 — 문항 정본은 `lib/나침반문항.js` 하나다. 이 파일에 문항키·라벨 **사본을 두지 않는다**
 * (`강사API` 머리말의 「어휘 사본이 0개다」와 같은 축 — 사본이 없으면 갈릴 일도 없다). */
type 문항표시 = { 키: string; 라벨: string; 라벨_mn: string | null; 상한: number };
const { 종류: 회차종류, 물을것, 답검사 } = 나침반모듈 as {
  종류: { 입학: string; 시즌: string };
  물을것: (회차: string, 목적: string | null) => 문항표시[];
  답검사: (회차: string, 답: unknown, 바꿨나: unknown) => { 필드: string; 사유: string } | null;
};

/* 회고 — 판정 어휘·구간 가르기·굳히기의 정본은 `lib/회고.js` 하나다. 이 파일은 3갈래 값도
 * 「어디를 반으로 가르나」도 모른다(사본이 없으면 갈릴 일도 없다). */
type 판정표시 = {
  코드: string; 라벨: string; 라벨_학생: string;
  라벨_mn: string | null; 라벨_mn_학생: string | null;
};
const { 판정검사, 자기판정검사, 굳히기, 집계정리, 판정보기, 사유상한 } = 회고모듈 as {
  판정검사: (판정: unknown, 사유: unknown) => { 필드: string; 사유: string } | null;
  자기판정검사: (판정: unknown) => { 필드: string; 사유: string } | null;
  굳히기: (사건들: unknown[], 시즌: unknown, 집계: unknown, 지금: Date) => Record<string, unknown>;
  집계정리: (행: unknown) => Record<string, unknown>;
  판정보기: 판정표시[];
  사유상한: number;
};

/* 원신호 목록·라디오 제외는 **축 모듈이 정본**이다(`deliver` 와 같은 사슬 · 여기 다시 안 적는다 —
 * 갈라지면 회고가 굳힌 근거와 매일 도는 상태가 다른 사건을 보게 된다). */
/* 강사 한 마디 — 어휘·검사의 정본은 `lib/반피드백.js` 다. 여기서 다시 적지 않는다
 * (같은 판정을 두 곳에 적으면 갈리고, 갈린 쪽은 조용히 틀린다 · 가드 맹점 ④). */
const { 한마디검사, 카드요약, uuid읽기 } = 반피드백모듈 as {
  한마디검사: (몸: unknown) => { 거절?: string; 문구?: string; 칸?: string; 값?: {
    submission_id: string; body: string; origin: string; disposition: string;
  } };
  카드요약: (반: { 학생수: number; 기다림: number }) => { 학생수: number; 기다림: number; 모양: string };
  uuid읽기: (값: unknown) => string | null;
};

const { 쓰는사건 } = 상태모듈 as { 쓰는사건: string[] };
const { 라디오태스크종 } = 라디오태스크모듈 as { 라디오태스크종: string[] };

/* 회고가 걷는 원신호 상한 — **사건 종류별**이다(`deliver` 종별상한 150 과 같은 사유: 한 종의
 * 폭주가 다른 종의 신호를 밀어내는 방향만 막는다). 창이 30일이 아니라 **시즌 2달**이라 그
 * 비례로 올려 잡는다(2달 × 하루 5건 = 300 을 덮는다). 잘림은 최신 우선이고, 잘렸다는 사실은
 * `evidence_refs.잘림` 에 그대로 남는다(굳힌 근거가 스스로 그 한계를 말한다). */
const 회고종별상한 = 400;

const { 지금유효, 그때유효, 거절몸통 } = 동의모듈 as {
  지금유효: (질의: unknown, learner_id: string) => Promise<Array<{ consent_id: string }>>;
  그때유효: (질의: unknown, learner_id: string, occurred_at: string) => Promise<Array<{ consent_id: string }>>;
  거절몸통: { code: string; field: string; retryable: boolean };
};

const 계약판 = /^c(\d+)$/;

/* 🔑 **경로·메서드·안내문을 한 곳에서 파생시킨다**(가드 맹점 ④ — 같은 판정을 두 곳에 적으면
 *   갈라지고, 갈라진 쪽은 조용히 틀린다). 옛 판은 목록 하나(`아는경로`)와 삼항 하나
 *   (`=== 'gold/queue' ? 'GET' : 'POST'`)와 손으로 적은 안내문 하나가 따로 있었다 —
 *   경로가 둘일 땐 안 보였지만, 넷이 되는 순간 삼항의 `else` 가 **새 GET 경로를 POST 로**
 *   요구하게 된다(그 실패는 405 라 「막혔다」로 보이지 조준 실패로 안 보인다).
 * 🔴 뒷 **두 마디**로 가른다 — 마지막 마디만 보면 `/v1/teach/아무거나/queue` 가 전부 큐 조회로
 *   동작한다. 새는 방향이 「통과」인 자리는 좁게 연다. */
const 경로표 = {
  'gold/queue': 'GET',
  'gold/judge': 'POST',
  'compass/open': 'GET',
  'compass/save': 'POST',
  /* 회고 — 세 경로다. 하나로 합치면 「학생 먼저」가 **화면 규약**으로만 남는다(설계 §7):
   *   `retro/open` 이 굳히고 · `retro/self` 를 학생이 누르고 · `retro/judge` 를 강사가 누른다.
   * 🔴 순서가 규격인 이유 — 강사 판정을 보고 학생이 고르면 그 칸은 대조군이 아니라 메아리다. */
  'retro/open': 'GET',
  'retro/self': 'POST',
  'retro/judge': 'POST',
  /* 강사 반 단위 피드백 — 셋이다(설계 §4). 하나로 합치지 않는 이유가 앞의 회고와 다르다:
   *   여기선 **권한의 결이 갈린다**. 앞 둘은 「내 반이 무엇인가」를 서버가 정하고, 마지막
   *   하나는 호출자가 준 산출물이 정말 내 반 것인지를 서버가 되묻는다. */
  'feedback/classes': 'GET',
  'feedback/queue': 'GET',
  'feedback/give': 'POST',
} as const;
type 아는경로 = keyof typeof 경로표;
const 안내 = Object.entries(경로표).map(([p, m]) => `${m} /v1/teach/${p}`).join(' · ');

/* 🔑 **허용 목록**이다(차단 목록이 아니다 — 못 적은 역할이 새는 방향은 언제나 「통과」다).
 *   `director` 가 있는 이유는 `review` 와 같다: 오늘 이 통로를 쓸 사람이 원장 본인뿐이다.
 *   ⚠ 그래서 **역할로는 두 문을 못 가른다** — 골든 소속은 감사가 진다(머리말 🔴). */
const 강사역할 = ['teacher', 'director'];

type 오류 = { code: string; message: string; retryable: boolean; field?: string };

/* 코드→상태를 **한 자리에 리터럴로**(`review` 와 같은 사유 — 두 경로가 각자 삼항으로 정하면
 * 같은 `else` 가 한쪽은 409, 한쪽은 400 이 된다). */
const 거절상태 = {
  NOT_FOUND: 404,
  CONTRACT_VIOLATION: 400,
  NOT_IN_SAMPLE: 409,
  ALREADY_JUDGED: 409,
  VERDICT_TEXT_MISMATCH: 409,
  /* 나침반 — 둘 다 「지금은 안 된다」이지 「틀렸다」가 아니라 409 다.
   * `SEASON_NOT_OPEN` = 오늘을 덮는 `engine.season` 행이 없다(운영이 아직 안 열었다).
   * `SEASON_ROLLED`  = 화면이 든 시즌과 오늘의 시즌이 다르다(여는 사이에 경계가 넘어갔다). */
  SEASON_NOT_OPEN: 409,
  SEASON_ROLLED: 409,
  /* 회고 — 셋 다 「지금은 안 된다」이지 「틀렸다」가 아니라 409 다.
   * `RETRO_NOT_DUE`     = 회고할 시즌이 없다(나침반 행이 없거나 전부 확정됐다).
   * `RETRO_NOT_OPENED`  = 열지 않고 판정하려 한다(굳힌 근거가 없는 라벨은 라벨이 아니다).
   * `SELF_AFTER_JUDGE`  = 강사 판정 «뒤»에 학생 칸을 쓰려 한다(메아리 차단 · 설계 §7). */
  RETRO_NOT_DUE: 409,
  RETRO_NOT_OPENED: 409,
  SELF_AFTER_JUDGE: 409,
  /* 강사 한 마디 — 「지금은 안 된다」라 409 다.
   * `NOTE_BY_OTHER` = 같은 산출물에 **다른 강사**가 이미 한 마디를 남겼다(한 반에 강사 둘이
   *   정상이라 실제로 난다 · 설계 §1 ⓐ). 자기 것 개서는 이 코드로 안 온다. */
  NOTE_BY_OTHER: 409,
  CONSENT_MISSING: 403,
  INTERNAL: 500,
} as const;
type 거절코드 = keyof typeof 거절상태;

function 봉투(status: number, body: Record<string, unknown>, ver: string) {
  return new Response(JSON.stringify({ contract_ver: ver, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const 실패 = (status: number, e: 오류, ver: string) => 봉투(status, { ok: false, error: e }, ver);

/** 카드 상태 — 화면이 그리는 세 모양. `blocked` 는 **숨기지 않는다**(설계 §4). */
const 상태 = { 열림: 'open', 판정됨: 'judged', 막힘: 'blocked' } as const;

Deno.serve(async (req: Request) => {
  const 선언 = req.headers.get('X-Contract-Ver') ?? '';
  if (!선언) return 실패(400, { code: 'CONTRACT_VER_MISSING', message: 'X-Contract-Ver 헤더가 없습니다', retryable: false }, 선언);
  const 선언판 = 계약판.exec(선언);
  if (!선언판) {
    return 실패(426, { code: 'CONTRACT_VER_UNSUPPORTED', message: `계약판 형식이 아닙니다: ${선언}`, retryable: false }, 선언);
  }

  /* 🔴 **뒷 두 마디**로 가른다(`review` 는 한 마디였다 — 여기는 경로가 `gold/queue` 라 두 마디다).
   *   마지막 마디만 보면 `/v1/teach/아무거나/queue` 가 전부 큐 조회로 동작하고, 관찰 경로가
   *   서는 날 옛 오타 경로가 **이미 돌던 것**이 된다. 새는 방향이 「통과」인 자리는 좁게 연다. */
  const url = new URL(req.url);
  const 마디 = url.pathname.replace(/\/+$/, '').split('/');
  const 경로 = 마디.slice(-2).join('/');
  if (!(경로 in 경로표)) {
    return 실패(404, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: `없는 경로입니다 — ${안내}`,
    }, 선언);
  }
  const 기대메서드 = 경로표[경로 as 아는경로];
  if (req.method !== 기대메서드) {
    return 실패(405, { code: 'CONTRACT_VIOLATION', message: `${기대메서드} 만 받는다`, retryable: false }, 선언);
  }

  const 주체 = 토큰주체(req);
  if (!주체) return 실패(401, { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false }, 선언);

  /* 직원 확정과 DB 계약판을 한 번에(왕복 1회) — `review` §1 사슬 그대로.
   * 🔴 `service_role` 은 RLS 를 우회하므로 이 사슬이 유일한 방어선이다. */
  const [행] = await sql`
    select (select staff_id from engine.staff
             where ${살아있는직원(sql, 주체, 발급시각(req))}
               and role = any(${강사역할}::text[])) as staff_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const db판 = 계약판.exec(String(행?.최신조각 ?? '').match(/_(c\d+)\.sql$/)?.[1] ?? '');
  if (!db판) {
    console.error('[teach] DB 계약판을 못 읽었다', 행?.최신조각);
    return 실패(500, { code: 'INTERNAL', message: '서버 설정 오류입니다', retryable: true }, 선언);
  }
  const ver = db판[0];

  if (Number(선언판[1]) > Number(db판[1])) {
    return 실패(426, {
      code: 'CONTRACT_VER_UNSUPPORTED', retryable: false,
      message: `서버가 아직 ${선언} 을 모릅니다(현재 ${ver}) — 잠시 뒤 다시 시도해 주세요`,
    }, ver);
  }

  /* 🔑 「직원이 아니다」와 「폐기됐다」를 **같은 코드**로 묶는다 — 가르면 응답 자체가
   *   「그 계정은 있다」를 말한다. 역할이 `inspector` 인 사람도 여기서 걸린다. */
  if (!행?.staff_id) {
    return 실패(403, { code: 'NOT_STAFF', message: '강사 권한이 없습니다', retryable: false }, ver);
  }
  const staff_id: string = 행.staff_id;

  try {
    if (경로 === 'gold/queue') return await 큐읽기(url, staff_id, ver);
    if (경로 === 'compass/open') return await 나침반열기(url, staff_id, ver);
    if (경로 === 'retro/open') return await 회고열기(url, staff_id, ver);
    if (경로 === 'feedback/classes') return await 내반목록(staff_id, ver);
    if (경로 === 'feedback/queue') return await 반큐읽기(url, staff_id, ver);
    const 본문 = await 본문읽기(req);
    if (본문 === undefined) {
      return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'JSON 이 아닙니다', retryable: false }, ver);
    }
    if (경로 === 'compass/save') return await 나침반저장(본문, staff_id, ver);
    if (경로 === 'retro/self') return await 자기판정(본문, staff_id, ver);
    if (경로 === 'retro/judge') return await 회고판정(본문, staff_id, ver);
    if (경로 === 'feedback/give') return await 한마디주기(본문, staff_id, ver);
    return await 판정하기(본문, staff_id, ver);
  } catch (e) {
    console.error(`[teach/${경로}] 실패`, String((e as Error)?.message ?? e));
    return 실패(500, { code: 'INTERNAL', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});

/** 본문 파서 — 통로를 하나로 둔다(`review` 와 같은 사유: 경로마다 try/catch 를 쓰면 새 경로가
 *  그것을 안 두고 500 이 된다). */
async function 본문읽기(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch (_) {
    return undefined;
  }
}

/* ── 풀 ─────────────────────────────────────────────────────────────── */

/**
 * 그 주의 **풀** — `correction_id` 만 읽는다.
 *
 * 🔑 상세를 여기서 안 읽는 이유: 풀은 주당 수백~수천 행이 될 수 있는데 화면에 서는 것은 5건이다.
 *   전량을 끌어와 5건만 쓰면 그 왕복이 통째로 낭비고, 그 낭비는 학생이 늘수록 커진다.
 *
 * 🔴 앞 두 줄이 `lib/골든표본.풀술어` 와 **글자까지 같아야 한다**(그래서 순서가 이렇다 —
 *   시각 경계가 그 사이에 끼면 텍스트가 끊겨 대조가 불가능해진다). 소비자가 두 모양이라
 *   (여기는 태그 질의 · `tools/성적표.js` 는 문자열 SQL) 사본을 피할 수 없고, 없앨 수 없는
 *   사본은 기계에 물린다 — `tests/골든표본.test.js` 가 두 소스를 그 텍스트로 대조한다.
 *   그 둘째 줄이 **「학생 목록에 서는 행」**이다(`functions/corrections:167` 의 빈 카드 필터와
 *   같은 식 · AS 원형 「노출분만 평가」의 talk 번역). 갈라지면 학생이 못 본 교정을 강사가
 *   판정하게 되고, 그 라벨은 「학생에게 먹혔나」와 짝이 안 맞는다.
 *   🚫 `sql.unsafe` 로 술어를 끼워 넣지 않는다 — 런타임에서 깨지면 수집이 멈춘다.
 */
function 풀질의(tx: unknown, 범위: { 시작: string; 끝: string }) {
  const q = tx as typeof sql;
  return q`
    select c.correction_id
      from engine.corrections c
     where c.actor_kind = 'ai'
       and (c.corrected_text is not null or array_length(c.error_tags, 1) is not null)
       and c.created_at >= ${범위.시작}::timestamptz
       and c.created_at <  ${범위.끝}::timestamptz
     order by c.correction_id`;
}

/* ── GET /v1/teach/gold/queue ────────────────────────────────────────── */

async function 큐읽기(url: URL, staff_id: string, ver: string) {
  /* 주는 **서버가 정한다** — 파라미터로 받으면 강사가 임의의 주를 열어 표본을 「골라」 볼 수
   * 있고, 그 순간 무작위가 깨진다(설계 §4 의 심장). 화면은 어느 주인지 응답으로 안다. */
  const 주키 = 지난주키();
  const 범위 = 주범위(주키)!;

  const { 항목들, 풀크기 } = await sql.begin(async (tx) => {
    const 풀 = (await 풀질의(tx, 범위)) as unknown as 풀행[];
    const 뽑힘 = 표본(풀, 주키) ?? [];
    const ids = 뽑힘.map((r) => r.correction_id);

    /* ⚠ **0건도 감사 1행 남긴다**(`review` §2 와 같은 판정) — 「아무것도 안 왔다」도 읽은
     *   것이고, 빈 응답에만 장부가 없으면 조회 횟수의 분모가 조용히 달라진다. */
    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.gold.queue', ${ids}::uuid[])`;

    if (!ids.length) return { 항목들: [], 풀크기: 풀.length };

    const 상세 = await tx`
      select c.correction_id, c.submission_id,
             c.corrected_text as ai_corrected_text,
             c.error_tags     as ai_error_tags,
             c.explanation    as ai_explanation,
             coalesce(s.transcript_verified, s.transcript) as transcript,
             (s.transcript_verified is not null) as transcript_confirmed,
             e.learner_id, e.occurred_at,
             /* 골든 소속의 정본 = 감사 원장(머리말 🔴). 「이미 판정됨」도 여기서 나온다 —
              * «corrections» 를 뒤지면 검수 확정 행과 구분이 안 된다.
              * ⚠ 이 주석은 템플릿 리터럴 «안»이다 — 백틱을 쓰면 SQL 이 거기서 끊긴다
              *   (review:460 이 남긴 경고 · 실제로 한 번 밟았다). */
             exists (select 1 from engine.staff_access_log l
                      where l.action = 'teach.gold.judge'
                        and c.correction_id = any(l.target_ids)) as 이미판정됨
        from engine.corrections c
        join engine.submissions s on s.submission_id = c.submission_id
        join engine.learning_events e on e.event_id = s.event_id
       where c.correction_id = any(${ids}::uuid[])`;

    /* 🔴 동의는 **표본이 아니라 판정에 건다**(설계 §4 · 반박 C3). 추첨은 이미 불변 풀에서
     *   끝났으므로 철회 한 건이 남의 표본을 재배열하지 못한다 — 여기서는 카드의 «상태»만 바꾼다.
     *   두 뜻을 다 건다: `그때유효`(발화 시점) ∧ `지금유효`(지금) — 사후 동의는 과거를 유효하게
     *   만들지 못한다. 🚫 세 번째 뜻을 만들지 않는다. */
    const 상세맵 = new Map(상세.map((r: Record<string, unknown>) => [String(r.correction_id), r]));
    const 항목들 = [];
    for (const id of ids) {
      const r = 상세맵.get(id);
      if (!r) continue; // 풀에는 있었는데 상세가 없다 = 조인 대상이 사라진 것. 지어내지 않는다.
      const [그때] = await 그때유효(tx, String(r.learner_id), new Date(r.occurred_at as string).toISOString());
      const [지금] = await 지금유효(tx, String(r.learner_id));
      const 막힘 = !그때 || !지금;

      항목들.push(막힘
        /* 막힌 카드에는 **전사·교정 내용을 싣지 않는다**(설계 §4). 숨기지도 않는다 —
         * 숨기면 「이번 주 끝」이 거짓이 되고 강사는 4건만 보고도 다 했다고 믿는다. */
        ? { correction_id: id, submission_id: r.submission_id, status: 상태.막힘 }
        : {
          correction_id: id,
          submission_id: r.submission_id,
          transcript: r.transcript,
          transcript_confirmed: r.transcript_confirmed,
          ai_corrected_text: r.ai_corrected_text,
          ai_error_tags: r.ai_error_tags,
          ai_explanation: r.ai_explanation,
          /* 🚫 `model`·`prompt_ver` 는 **안 싣는다** — 판정 전에 어느 모델인지 보이면 강사의
           *   판정에 편향이 생기고, 그 편향은 N12 승률에 그대로 들어간다(성적표가 사후 조인한다). */
          status: r.이미판정됨 ? 상태.판정됨 : 상태.열림,
        });
    }
    return { 항목들, 풀크기: 풀.length };
  });

  const 남음 = 항목들.filter((it) => it.status === 상태.열림).length;
  return 봉투(200, {
    ok: true,
    week: 주키,
    /* 화면이 「남은 건수」를 상시 표시한다(P0 §2-3 ③ 선례) — 다 끝나면 「이번 주 끝」.
     * 분모를 같이 싣는 이유: 5건이 안 되는 주는 **풀이 작은 것**이지 화면이 빠뜨린 게 아니다. */
    remaining: 남음,
    sample_size: 주당건수,
    pool_size: 풀크기,
    data: 항목들,
  }, ver);
}

/* ── POST /v1/teach/gold/judge ───────────────────────────────────────── */

/** 거절 봉투 — 상태는 `거절상태` 하나에서 온다. */
function 거절응답(결과: { 거절: 거절코드; 문구: string; 칸?: string }, ver: string) {
  return 실패(거절상태[결과.거절], {
    code: 결과.거절,
    message: 결과.문구,
    /* 재시도가 뜻이 있는 것은 서버 쪽 사정뿐이다 — 표본·동의·정합 거절은 다시 눌러도 같다. */
    retryable: 결과.거절 === 'INTERNAL',
    ...(결과.칸 ? { field: 결과.칸 } : {}),
  }, ver);
}

/**
 * 판정 1건 = 골든 행 + 감사 1행이 **한 쓰기**에.
 *
 * 🔴 감사를 뒤로 미루면 그 사이 실패에 **소속이 증발**한다 — 골든 행은 남는데 그것이 골든인지
 *   검수 확정인지 아무도 못 가른다(역할 조인은 director 겹침으로 불가). 성적표가 그 행을
 *   조용히 빠뜨리거나 잘못 세고, 어느 쪽이든 증상이 없다.
 */
async function 판정하기(본문: unknown, staff_id: string, ver: string) {
  const 검증 = 골든판정요청(본문);
  if (검증.이유) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: 검증.이유, ...(검증.칸 ? { field: 검증.칸 } : {}),
    }, ver);
  }
  const q = 검증.값 as unknown as {
    reviewed_correction_id: string; verdict: string;
    corrected_text: string | null; error_tags: string[];
    l1_source_phrase: string | null; rubric_scores: unknown; verdict_reason: string | null;
  };

  const 결과 = await sql.begin(async (tx) => {
    /* ① **먼저 잠근다.** 같은 AI 행에 대한 동시 판정을 직렬화한다 — 두 번째 요청은 잠금이
     *   풀린 뒤 감사를 다시 읽어 「이미 판정됨」으로 떨어진다(중복 골든 행이 원리상 안 생긴다).
     *   ⚠ 검수 approve 는 `pipeline_jobs` 를 잠그는 **다른 장치**고 쓰는 행이 달라 서로 막을
     *     것이 없다 — 「선례」라 부르지 않는다(설계 §3). */
    const [ai] = await tx`
      select c.correction_id, c.submission_id, c.corrected_text, c.created_at,
             coalesce(s.transcript_verified, s.transcript) as 전사,
             e.learner_id, e.occurred_at
        from engine.corrections c
        join engine.submissions s on s.submission_id = c.submission_id
        join engine.learning_events e on e.event_id = s.event_id
       where c.correction_id = ${q.reviewed_correction_id}::uuid
         and c.actor_kind = 'ai'
       for update of c`;
    /* 🔑 「없다」와 「AI 행이 아니다」를 같은 코드로 묶는다 — 가르면 응답이 「그 행은 있다」를
     *   말한다. teacher 행을 평가 대상으로 가리키면 **사람이 사람을 평가한 라벨**이 된다. */
    if (!ai) {
      return { 거절: 'NOT_FOUND' as const, 문구: '평가할 AI 교정을 찾을 수 없습니다' };
    }

    /* ② **그 행이 속한 주의 표본인가** — 「이번 주」를 안 묻는 이유는 머리말 🔴.
     *   표본 밖의 행을 받으면 강사가 고르고 싶은 것만 판정할 수 있고, 그 순간 무작위가 깨져
     *   승률이 「AI 가 틀린 것만 모은」 반쪽 채점표가 된다. */
    const 속한주 = ((w) => 키(w.연, w.주))(iso주(new Date(ai.created_at as string)));
    const 범위 = 주범위(속한주)!;
    const 풀 = (await 풀질의(tx, 범위)) as unknown as 풀행[];
    const 뽑힘 = (표본(풀, 속한주) ?? []).map((r) => String(r.correction_id));
    if (!뽑힘.includes(String(ai.correction_id))) {
      return {
        거절: 'NOT_IN_SAMPLE' as const,
        문구: `${속한주} 주의 표본에 없는 항목입니다 — 큐에 있는 것만 판정할 수 있습니다`,
      };
    }

    /* ③ 이미 판정됨 — 소속과 같은 조인에서 나온다(같은 판정을 두 곳에 적지 않는다). */
    const [중복] = await tx`
      select exists (select 1 from engine.staff_access_log l
                      where l.action = 'teach.gold.judge'
                        and ${ai.correction_id}::uuid = any(l.target_ids)) as 있다`;
    if (중복?.있다) {
      return { 거절: 'ALREADY_JUDGED' as const, 문구: '이미 판정한 항목입니다' };
    }

    /* ④ 동의 두 뜻 — 큐가 `blocked` 로 그렸어도 여기서 **다시 잰다**(화면만 막으면 직접
     *   호출로 그대로 통과한다 · 게이트의 주체는 화면이 아니라 이 함수다). */
    const [그때] = await 그때유효(tx, String(ai.learner_id), new Date(ai.occurred_at as string).toISOString());
    const [지금] = await 지금유효(tx, String(ai.learner_id));
    if (!그때 || !지금) {
      return {
        거절: 'CONSENT_MISSING' as const, 칸: 거절몸통.field,
        문구: '이 학생의 동의가 유효하지 않아 판정할 수 없습니다',
      };
    }

    /* ⑤ 정합 — 순수 규칙은 `lib/검수확정.js` 한 곳에서 파생한다(설계 §3). */
    const 어긋남 = 골든정합({
      verdict: q.verdict,
      corrected_text: q.corrected_text,
      ai교정문: ai.corrected_text,
      전사: ai.전사,
    });
    if (어긋남) {
      return { 거절: 'VERDICT_TEXT_MISMATCH' as const, 칸: 'corrected_text', 문구: 어긋남 };
    }

    /* ⑥ 골든 행. 🔑 `transcript_at_review` 는 **서버가 채운다** — 강사가 무엇을 보고
     *   판정했는지가 행에 남아야 N12 가 전사 기반을 층화할 수 있다(설계 §5).
     *   🚫 `promotion_intent` 는 건드리지 않는다 — 승격은 검수 축의 판단이고 기본값 false 다. */
    const [골든] = await tx`
      insert into engine.corrections (
        submission_id, reviewed_correction_id, actor_kind, corrected_text, error_tags,
        reviewer, verdict, verdict_reason, l1_source_phrase, rubric_scores,
        transcript_at_review, schema_ver
      ) values (
        ${ai.submission_id}::uuid, ${ai.correction_id}::uuid, 'teacher'::engine.actor_kind,
        ${q.corrected_text}, ${q.error_tags},
        ${staff_id}, ${q.verdict}, ${q.verdict_reason}, ${q.l1_source_phrase},
        ${q.rubric_scores as never},
        ${ai.전사}, ${ver}
      ) returning correction_id`;

    /* ⑦ 감사 = **소속의 정본**. `target_ids` 에 둘을 담는 것이 설계다:
     *   [AI 행] 으로 「이미 판정됨」과 N12 조인이 서고, [골든 행] 으로 그 teacher 행이
     *   검수 확정이 아니라 골든임을 가른다. 순서도 계약이다(0=평가 대상 · 1=골든 행). */
    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.gold.judge',
              array[${ai.correction_id}::uuid, ${골든.correction_id}::uuid])`;

    return {
      correction_id: 골든.correction_id as string,
      reviewed_correction_id: String(ai.correction_id),
      verdict: q.verdict,
      week: 속한주,
    };
  });

  if ('거절' in 결과) return 거절응답(결과, ver);
  return 봉투(200, { ok: true, ...결과 }, ver);
}

/* ── 나침반 (시즌회고_설계 §8 ①②) ───────────────────────────────────────
 *
 * 이 두 경로가 닫는 것: 대외로 **이미 약속 중인** 「입학할 때, 그리고 시즌마다 나침반 세션을
 * 엽니다」(상담AI FAQ Q11 `확정: true`)를 받을 자리가 두 저장소에 **0줄**이었다(08-12 실측).
 * 🔴 왼쪽은 **소급이 원리상 불가능**하다 — 그날 안 물으면 그 학생의 회고는 영원히 반쪽이다.
 *
 * ■ 왜 학생 문(`C0`)이 아니라 **강사 문**인가
 *   나침반은 설계가 「강사가 촉진하는 워크숍」으로 못박은 세션이고(§9-2 ㉤ · §3-1 `recorded_by`
 *   가 대필을 정상 경로로 적는다), 급수 1 학생도 지난다. 그리고 C0 는 지금 **동결 판정 대기**
 *   중이라(만장일치 `failed_p0`) 거기에 새 경로를 내는 것은 남의 트랙 위에 짓는 일이다.
 *   ⏭ 학생 본인 통로가 서는 날 `recorded_by` 에 `'self'` 가 들어온다(그래서 그 칸이 text 다).
 *
 * ■ 🔴 서버가 정하는 것 셋 — 앱이 못 고른다
 *   ① **시즌**: 오늘을 덮는 `engine.season` 행. 앱이 고르면 강사가 지난 시즌에 소급 기입할 수
 *      있고, 그 순간 이 설계의 전제(그때 그 시점의 선언)가 무너진다.
 *   ② **회차**(입학/시즌): 그 학생에게 «다른 시즌» 나침반 행이 있나로 정한다. 앱이 보내면
 *      입학 행을 시즌 행으로 위장 저장할 수 있고, 그러면 `self_in_5y_changed` 가 있지도 않은
 *      지난 답을 가리킨다.
 *   ③ **`goal_track_at_open`**: 저장 시점 `learners.goal_track`. 앱이 보내면 화면에 없던 값이
 *      그날의 목적으로 굳는다.
 *   🔑 앱이 보내는 `season_id` 는 **조준 확인용**이다 — 화면이 들고 있던 시즌과 오늘의 시즌이
 *     다르면 409(`SEASON_ROLLED`). 「승인은 행위에 대한 것이지 조준이 아니다」의 코드층 번역:
 *     화면을 열어 둔 사이에 경계가 넘어가면 그 저장은 **다음 시즌 행**이 되어야 한다.
 *
 * 🚫 나침반 답을 `preference.stated` 사건으로 흘리지 않는다(c11 ⑦ 가드를 깎아야 하고 그
 *   가드는 G2 통로까지 덮는다 · 설계 §10). 🚫 새 `event_type` 신설.
 * 🚫 답을 자동 채점·판정하지 않는다(「목표 런타임 자동 판정 🚫」 유호 확정 승계).
 */

/** 오늘을 덮는 시즌 한 행. **겹침은 DDL 이 막는다**(`season_no_overlap_c11`) — 그래서 여기서
 *  여러 행을 어떻게 고를지 정하지 않는다(고르는 규칙을 두면 그게 두 번째 판정이 된다). */
function 이번시즌(tx: unknown) {
  const q = tx as typeof sql;
  return q`
    select season_id, code, textbook, starts_on, ends_on
      from engine.season
     where starts_on <= current_date
       and (ends_on is null or ends_on >= current_date)`;
}

/** 그 학생의 회차 — **이 시즌 행은 세지 않는다.**
 *  안 빼면 같은 시즌에 두 번째로 저장할 때(강사가 오타를 고치는 그 자리) 회차가 입학→시즌으로
 *  뒤집히고, 그러면 답 키 집합이 달라져 CHECK 가 거절한다. 「고치려다 막힌다」는 우회를 정상
 *  통로로 만드는 자리다(F103). */
async function 회차판정(tx: unknown, learner_id: string, season_id: string): Promise<string> {
  const q = tx as typeof sql;
  const [행] = await q`
    select 1 as 있음
      from engine.season_compass
     where learner_id = ${learner_id}::uuid
       and season_id <> ${season_id}::uuid
     limit 1`;
  return 행 ? 회차종류.시즌 : 회차종류.입학;
}

/* ── GET /v1/teach/compass/open ──────────────────────────────────────── */

async function 나침반열기(url: URL, staff_id: string, ver: string) {
  /* 🔑 **학생번호로도 연다.** 강사가 손에 들고 있는 것은 uuid 가 아니라 `SYNK-001` 이다
   *   (L0 §4-1 — `student_code` 는 사람이 부르는 이름표이고 비밀이 아니다). uuid 만 받으면
   *   이 화면은 원리상 못 쓰이고, 그러면 나침반은 「나중에 옮겨 적기」가 된다 — 그 순간
   *   자동화 축이 그 자리에서 죽는다(설계 §8 ①). 응답이 `learner_id` 를 돌려주고, 저장은
   *   그 값을 그대로 쓴다(화면이 두 번 조회하지 않는다). */
  const 넘긴id = (url.searchParams.get('learner_id') || '').trim();
  const 학생번호 = (url.searchParams.get('student_code') || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(넘긴id) && !학생번호) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', field: 'learner_id', retryable: false,
      message: 'learner_id 또는 student_code 가 필요합니다',
    }, ver);
  }

  const 결과 = await sql.begin(async (tx) => {
    const [시즌] = await 이번시즌(tx);
    if (!시즌) {
      /* 처방을 **그대로 실행할 수 있게** 적는다 — 「시즌이 없다」만 내면 강사는 앱이 고장난
       * 줄 안다. 시즌 행을 여는 것은 운영의 일이고, 그 사실을 말하는 자리가 여기뿐이다. */
      return { 거절: 'SEASON_NOT_OPEN' as const,
        문구: '오늘이 속한 시즌이 아직 열려 있지 않습니다 — 교재 1권 단위로 시즌 행을 먼저 엽니다' };
    }
    const [학생] = /^[0-9a-f-]{36}$/i.test(넘긴id)
      ? await tx`
          select learner_id, student_code, display_name, goal_track
            from engine.learners where learner_id = ${넘긴id}::uuid`
      : await tx`
          select learner_id, student_code, display_name, goal_track
            from engine.learners where student_code = ${학생번호}`;
    if (!학생) return { 거절: 'NOT_FOUND' as const, 칸: 'learner_id', 문구: '없는 학생입니다' };
    const learner_id = String(학생.learner_id);

    const 회차 = await 회차판정(tx, learner_id, String(시즌.season_id));

    /* 지난 답 — **[그대로]/[바꿀래] 버튼의 재료**다(설계 §9-2 ㉤).
     * 🔑 이 시즌 행은 뺀다(위 회차판정과 같은 이유 — 고쳐 쓰는 자리에서 자기 답이 「지난
     *   답」으로 다시 뜨면 화면이 자기 자신을 지난 시즌으로 그린다). */
    const [지난] = 회차 === 회차종류.시즌
      ? await tx`
          select answers ->> 'self_in_5y' as 답, recorded_at
            from engine.season_compass
           where learner_id = ${learner_id}::uuid
             and season_id <> ${시즌.season_id}::uuid
           order by recorded_at desc
           limit 1`
      : [];

    const [이미] = await tx`
      select recorded_at from engine.season_compass
       where learner_id = ${learner_id}::uuid and season_id = ${시즌.season_id}::uuid`;

    /* ⚠ **0건도 감사 1행 남긴다** — `gold/queue` 와 같은 판정이다. 나침반은 학생 한 명의
     *   선언을 여는 자리라 「누가 언제 열었나」가 그 자체로 재료다. */
    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.compass.open', array[${learner_id}::uuid])`;

    return {
      learner_id,
      student_code: 학생.student_code ?? null,
      display_name: 학생.display_name ?? null,
      season: {
        season_id: String(시즌.season_id), code: 시즌.code, textbook: 시즌.textbook,
        starts_on: 시즌.starts_on, ends_on: 시즌.ends_on,
      },
      round: 회차,
      goal_track: 학생.goal_track ?? null,
      questions: 물을것(회차, (학생.goal_track as string | null) ?? null),
      previous_self_in_5y: (지난?.답 as string | undefined) ?? null,
      already_recorded_at: (이미?.recorded_at as string | undefined) ?? null,
    };
  });

  if ('거절' in 결과) return 거절응답(결과, ver);
  return 봉투(200, { ok: true, ...결과 }, ver);
}

/* ── POST /v1/teach/compass/save ─────────────────────────────────────── */

async function 나침반저장(본문: unknown, staff_id: string, ver: string) {
  const b = (본문 && typeof 본문 === 'object' ? 본문 : {}) as Record<string, unknown>;
  const learner_id = typeof b.learner_id === 'string' ? b.learner_id.trim() : '';
  const 화면시즌 = typeof b.season_id === 'string' ? b.season_id.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(learner_id) || !/^[0-9a-f-]{36}$/i.test(화면시즌)) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: 'learner_id · season_id 가 필요합니다',
    }, ver);
  }

  const 결과 = await sql.begin(async (tx) => {
    const [시즌] = await 이번시즌(tx);
    if (!시즌) {
      return { 거절: 'SEASON_NOT_OPEN' as const,
        문구: '오늘이 속한 시즌이 아직 열려 있지 않습니다 — 교재 1권 단위로 시즌 행을 먼저 엽니다' };
    }
    if (String(시즌.season_id) !== 화면시즌) {
      return { 거절: 'SEASON_ROLLED' as const, 칸: 'season_id',
        문구: '화면을 연 뒤 시즌 경계가 넘어갔습니다 — 다시 열어 이번 시즌으로 적습니다' };
    }
    const [학생] = await tx`
      select goal_track from engine.learners where learner_id = ${learner_id}::uuid`;
    if (!학생) return { 거절: 'NOT_FOUND' as const, 칸: 'learner_id', 문구: '없는 학생입니다' };

    const 회차 = await 회차판정(tx, learner_id, String(시즌.season_id));
    /* 🔑 회차는 서버가 정했으므로 검사도 **그 회차로** 돈다. 앱이 보낸 답 묶음이 다른 회차의
     *   것이면 여기서 갈린다 — 그리고 DB CHECK(`season_compass_answers_c11`)가 같은 판정을
     *   한 번 더 진다. 두 층이 같은 lib 를 못 쓰므로(하나는 JS·하나는 DDL) **회귀가 그 둘을
     *   대조한다**(`tests/나침반문항.test.js`). */
    const 바꿨나 = 회차 === 회차종류.시즌 ? b.self_in_5y_changed : null;
    const 흠 = 답검사(회차, b.answers, 바꿨나);
    if (흠) return { 거절: 'CONTRACT_VIOLATION' as const, 칸: 흠.필드, 문구: 흠.사유 };

    /* 개서를 허용한다 — 촉진 세션 «그 자리»에서 오타를 고치는 통로다(마이그레이션 머리말).
     * 🔑 지난 시즌 답이 덮이는 일은 원리상 없다: 시즌이 다르면 **다른 행**이다.
     * 🔑 `recorded_at` 을 갱신한다 — 마지막으로 확정한 시각이 그 행의 시각이다. */
    const [행] = await tx`
      insert into engine.season_compass
        (learner_id, season_id, answers, self_in_5y_changed, goal_track_at_open,
         recorded_by, schema_ver)
      values (${learner_id}::uuid, ${시즌.season_id}::uuid, ${tx.json(b.answers as object)},
              ${바꿨나 as boolean | null}, ${(학생.goal_track as string | null) ?? null},
              ${staff_id}, ${ver})
      on conflict (learner_id, season_id) do update
        set answers            = excluded.answers,
            self_in_5y_changed = excluded.self_in_5y_changed,
            goal_track_at_open = excluded.goal_track_at_open,
            recorded_by        = excluded.recorded_by,
            recorded_at        = now(),
            schema_ver         = excluded.schema_ver
      returning compass_id, recorded_at`;

    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.compass.save', array[${learner_id}::uuid])`;

    return {
      compass_id: String(행.compass_id),
      season_id: String(시즌.season_id),
      round: 회차,
      recorded_at: 행.recorded_at,
    };
  });

  if ('거절' in 결과) return 거절응답(결과, ver);
  return 봉투(200, { ok: true, ...결과 }, ver);
}

/* ── 시즌 회고 ③④ ─────────────────────────────────────────────────────
 *
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §3-2·§4·§6·§7.
 *
 * 🔴 **여는 그 순간에 굳힌다.** 판정할 때 다시 계산하면 창(30일)이 밀려 다른 숫자가 나오고,
 *   그러면 「가까워졌다」 옆에 붙은 숫자는 그 판정을 낸 사람이 **본 적 없는 숫자**가 된다.
 *   그래서 retro/open 이 행을 만들며 record_snapshot 을 쓰고, 그 뒤로는 DB 트리거가 그 칸을
 *   못 바꾸게 막는다. 다시 열면 **굳힌 것을 그대로** 돌려준다(재계산 0).
 *
 * 🔴 **굳힌 근거를 앱에서 받지 않는다.** 앱이 보낸 근거는 근거가 아니다 — 조립도 저장도
 *   서버가 한다(lib/회고.js 하나가 구간을 가르고 두 번 부른다).
 *
 * 🔑 **어느 시즌을 회고하나도 서버가 정한다** — 「그 학생의 나침반이 있는데 회고가 아직 확정
 *   안 된, 가장 오래된 시즌」이다. 앱이 고르게 하면 강사가 지난 시즌을 골라 소급 판정할 수
 *   있고, 그 순간 「그 시점의 판정」이라는 전제가 죽는다(나침반 season_id 와 같은 축).
 *   ⚠ 그래서 밀린 회고는 **오래된 것부터** 열린다(건너뛰기 없음 — 건너뛴 시즌은 영영 라벨 0이고,
 *     라벨 0인 시즌은 엔진에서 존재하지 않는 것과 같다).
 *
 * 🚫 회고 화면에서 8축 실시간 조회(설계 §10) · 🚫 판정 눈금 5단계·점수화 ·
 * 🚫 답·판정 자동 채점(「목표 런타임 자동 판정 🚫」 유호님 확정 승계) ·
 * 🚫 새 event_type 신설(시즌당 1회·사람이 읽는 자료라 사건 층에 넣으면 엔진이 못 센다).
 */

/** 회고할 시즌 한 행 + 이미 열려 있으면 그 행까지. **한 번의 조회**로 둘 다 가져온다 —
 *  나눠 읽으면 그 틈에 다른 강사가 열어 두 세션이 서로 다른 굳힘을 본다. */
function 회고대상(tx: unknown, learner_id: string) {
  const q = tx as typeof sql;
  return q`
    select s.season_id, s.code, s.textbook, s.starts_on, s.ends_on,
           c.answers, c.self_in_5y_changed, c.goal_track_at_open, c.recorded_at,
           r.review_id, r.record_snapshot, r.verdict, r.verdict_by_self, r.note,
           r.decided_by, r.decided_at, r.opened_at
      from engine.season_compass c
      join engine.season s on s.season_id = c.season_id
      left join engine.season_review r
        on r.learner_id = c.learner_id and r.season_id = c.season_id
     where c.learner_id = ${learner_id}::uuid
       and s.starts_on <= current_date
       and (r.review_id is null or r.verdict is null)
     order by s.starts_on
     limit 1
       for update of c`;
}

/* ── GET /v1/teach/retro/open ────────────────────────────────────────── */

async function 회고열기(url: URL, staff_id: string, ver: string) {
  /* 나침반과 **같은 문**으로 연다 — 강사 손에 있는 것은 uuid 가 아니라 SYNK-001 이다. */
  const 넘긴id = (url.searchParams.get('learner_id') || '').trim();
  const 학생번호 = (url.searchParams.get('student_code') || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(넘긴id) && !학생번호) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', field: 'learner_id', retryable: false,
      message: 'learner_id 또는 student_code 가 필요합니다',
    }, ver);
  }

  const 결과 = await sql.begin(async (tx) => {
    const [학생] = /^[0-9a-f-]{36}$/i.test(넘긴id)
      ? await tx`
          select learner_id, student_code, display_name, goal_track
            from engine.learners where learner_id = ${넘긴id}::uuid`
      : await tx`
          select learner_id, student_code, display_name, goal_track
            from engine.learners where student_code = ${학생번호}`;
    if (!학생) return { 거절: 'NOT_FOUND' as const, 칸: 'learner_id', 문구: '없는 학생입니다' };
    const learner_id = String(학생.learner_id);

    const [대상] = await 회고대상(tx, learner_id);
    if (!대상) {
      /* 처방을 **그대로 실행할 수 있게** 적는다 — 「없다」만 내면 강사는 앱을 의심한다.
       * 이 자리는 둘 중 하나다: 나침반을 아직 안 적었거나, 밀린 회고가 없거나. */
      return { 거절: 'RETRO_NOT_DUE' as const,
        문구: '회고할 시즌이 없습니다 — 이 학생의 나침반이 아직 없거나, 지난 시즌 회고가 모두 확정됐습니다' };
    }

    let 굳힌것 = 대상.record_snapshot as Record<string, unknown> | null;
    /* 🔴 **이미 굳혔으면 다시 계산하지 않는다.** 다시 계산하면 창이 밀려 어제 본 숫자와 오늘
     *   본 숫자가 갈리고, 학생이 이미 자기 칸을 누른 뒤라면 그 판정은 **다른 근거**를 보고
     *   누른 것이 된다. 이어서 여는 자리가 곧 이 보장을 지키는 자리다. */
    if (!굳힌것) {
      const [원신호] = await tx`
        select coalesce(jsonb_agg(jsonb_build_object(
                 'event_id', x.event_id, 'event_type', x.event_type, 'occurred_at', x.occurred_at,
                 'retry_of_event_id', x.retry_of_event_id, 'correction_id', x.correction_id,
                 'task_type', x.task_type, 'payload', x.payload, 'due_at', x.due_at)), '[]'::jsonb) as 행들
          from (
            select y.event_id, y.event_type, y.occurred_at, y.retry_of_event_id,
                   y.correction_id, y.task_type, y.payload, y.due_at
              from (
                select e.event_id, e.event_type, e.occurred_at, e.retry_of_event_id,
                       e.correction_id, e.task_type, e.payload, s.due_at,
                       row_number() over (partition by e.event_type
                                          order by e.occurred_at desc) as 몇째
                  from engine.learning_events e
                  left join engine.submissions s on s.event_id = e.event_id
                 where e.learner_id = ${learner_id}::uuid
                   and e.event_type = any(${쓰는사건}::text[])
                   and not (e.event_type = 'submission.created'
                            and e.task_type is not null
                            and e.task_type = any(${라디오태스크종}::text[]))
                   and e.occurred_at >= ${대상.starts_on}::date
                   and e.occurred_at < coalesce(${대상.ends_on}::date + 1, now())) y
             where y.몇째 <= ${회고종별상한}) x`;

      /* 시즌 구간 «전체» 집계 — 8축이 못 보는 자리다(축은 창 안만 본다).
       * ⚠ 교정열람률의 분모는 그 시즌에 «난» 교정이라, 끝자락 교정을 다음 시즌에 보면 비율이
       *   실제보다 낮게 나온다. 분자·분모를 둘 다 굳혀 나중에 다시 잴 수 있게 둔다. */
      const [집계] = await tx`
        with 범위 as (
          select ${대상.starts_on}::date as 시작,
                 coalesce(${대상.ends_on}::date + 1, now()) as 끝)
        select
          (select count(*) from engine.learning_events e, 범위 b
            where e.learner_id = ${learner_id}::uuid and e.event_type = 'submission.created'
              and (e.task_type is null or not (e.task_type = any(${라디오태스크종}::text[])))
              and e.occurred_at >= b.시작 and e.occurred_at < b.끝) as 제출수,
          (select count(*) from engine.learning_events e, 범위 b
            where e.learner_id = ${learner_id}::uuid and e.event_type = 'task.assigned'
              and e.occurred_at >= b.시작 and e.occurred_at < b.끝) as 배정수,
          (select count(*) from engine.corrections co
             join engine.submissions su on su.submission_id = co.submission_id
             join engine.learning_events ev on ev.event_id = su.event_id, 범위 b
            where ev.learner_id = ${learner_id}::uuid and co.actor_kind = 'ai'
              and co.created_at >= b.시작 and co.created_at < b.끝) as 교정수,
          (select count(*) from engine.learning_events e, 범위 b
            where e.learner_id = ${learner_id}::uuid and e.event_type = 'correction.viewed'
              and e.occurred_at >= b.시작 and e.occurred_at < b.끝) as 열람수,
          (select e.level_snapshot from engine.learning_events e, 범위 b
            where e.learner_id = ${learner_id}::uuid and e.level_snapshot is not null
              and e.occurred_at >= b.시작 and e.occurred_at < b.끝
            order by e.occurred_at asc limit 1) as 급수_시작,
          (select e.level_snapshot from engine.learning_events e, 범위 b
            where e.learner_id = ${learner_id}::uuid and e.level_snapshot is not null
              and e.occurred_at >= b.시작 and e.occurred_at < b.끝
            order by e.occurred_at desc limit 1) as 급수_끝,
          (select jsonb_build_object('occurred_at', e.occurred_at, 'payload', e.payload)
             from engine.learning_events e, 범위 b
            where e.learner_id = ${learner_id}::uuid and e.event_type = 'exam.result'
              and e.occurred_at >= b.시작 and e.occurred_at < b.끝
            order by e.occurred_at desc limit 1) as 시험_최신`;

      굳힌것 = 굳히기(
        (원신호?.행들 ?? []) as unknown[],
        {
          season_id: String(대상.season_id), code: 대상.code, textbook: 대상.textbook,
          starts_on: 대상.starts_on, ends_on: 대상.ends_on,
        },
        집계정리(집계),
        new Date(),
      );

      /* 🔑 위 `for update of c` 가 같은 학생의 두 세션을 직렬화하므로 여기 도달한 쪽이
       *   유일하게 굳히는 쪽이다. `do nothing` 은 그 위의 안전벨트다(경합이 나도 먼저 굳힌
       *   것이 이긴다 — 나중 것이 덮으면 판정과 근거가 갈린다). */
      await tx`
        insert into engine.season_review
          (learner_id, season_id, record_snapshot, opened_by, schema_ver)
        values (${learner_id}::uuid, ${대상.season_id}::uuid, ${tx.json(굳힌것)},
                ${staff_id}, ${ver})
        on conflict (learner_id, season_id) do nothing`;
    }

    /* ⚠ 0건도 감사 1행 남긴다 — 회고는 학생 한 명의 기록 전부를 여는 자리라 「누가 언제
     *   열었나」가 그 자체로 재료다(compass/open 과 같은 판정). */
    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.retro.open', array[${learner_id}::uuid])`;

    return {
      learner_id,
      student_code: 학생.student_code ?? null,
      display_name: 학생.display_name ?? null,
      season: {
        season_id: String(대상.season_id), code: 대상.code, textbook: 대상.textbook,
        starts_on: 대상.starts_on, ends_on: 대상.ends_on,
      },
      /* 왼쪽 — 그 시즌 «시작»에 학생이 스스로 선언한 것. 병치의 반쪽이다(설계 §1).
       * 🔑 문구도 **서버가** 준다. 답은 문항키→서술이라 그것만 보내면 화면이 키→라벨 표를
       *   손으로 들게 되고, 그 순간 정본이 둘이 된다(나침반 화면이 피한 바로 그 사본).
       * 🔑 **그날의 목적**(`goal_track_at_open`)으로 문구를 고른다 — 오늘의 목적으로 고르면
       *   목적을 바꾼 학생의 회고에 그 시즌에 없던 질문이 뜬다(`culture` 갈래 · 설계 §9-2 ㉦-1). */
      compass: {
        answers: 대상.answers, self_in_5y_changed: 대상.self_in_5y_changed,
        goal_track_at_open: 대상.goal_track_at_open, recorded_at: 대상.recorded_at,
        questions: 물을것(
          대상.self_in_5y_changed == null ? 회차종류.입학 : 회차종류.시즌,
          (대상.goal_track_at_open as string | null) ?? null,
        ),
      },
      /* 오른쪽 — 굳힌 것 그대로(화면이 다시 계산할 여지를 안 남긴다). 근거 ID 만 벗긴다. */
      record_snapshot: 근거벗기기(굳힌것),
      verdict_by_self: 대상.verdict_by_self ?? null,
      /* 🔑 여기서 verdict 는 **항상 null** 이다(위 조회가 확정된 행을 안 고른다) — 그래도 칸을
       *   내보낸다: 화면이 「강사 칸이 열렸나」를 이 값으로만 판단하게 해 두면, 확정 행을 여는
       *   통로가 나중에 생겨도 화면이 안 갈린다. */
      verdict: 대상.verdict ?? null,
      note: 대상.note ?? null,
      /* 어휘는 서버가 준다 — 화면에 코드값·문구 사본이 0개다(나침반화면 과 같은 규칙). */
      verdict_options: 판정보기,
      note_max: 사유상한,
    };
  });

  if ('거절' in 결과) return 거절응답(결과, ver);
  return 봉투(200, { ok: true, ...결과 }, ver);
}

/**
 * 굳힌 것에서 **근거 ID 를 벗겨** 내보낸다 — 저장된 행에는 그대로 남는다.
 *
 * 🔴 `evidence_refs.사건` 은 `event_id` 목록이다. 굳혀 두는 이유는 나중에 **같은 근거로 다시
 *   계산해 대조**하기 위해서고(설계 §4), 그건 서버·감사의 일이지 화면의 일이 아니다.
 *   화면이 그리는 것은 축과 집계뿐이라 이 값은 나가도 쓸 데가 없고, 나가면 식별자만 샌다
 *   (`gold/queue` 가 `event_id` 를 안 내보내는 것과 같은 축 · `tests/강사통로.test.js` ⑦).
 * 🔑 창 경계(`as_of`·`창일수`)는 **남긴다** — 화면이 「어느 구간을 잰 값인가」를 말해야 한다.
 */
function 근거벗기기(굳힌것: Record<string, unknown>) {
  const 층벗기기 = (v: unknown) => {
    if (!v || typeof v !== 'object') return v;
    const { evidence_refs: _버림, ...나머지 } = v as Record<string, unknown>;
    return 나머지;
  };
  return { ...굳힌것, axes_전반: 층벗기기(굳힌것.axes_전반), axes_후반: 층벗기기(굳힌것.axes_후반) };
}

/** 회고 행 하나를 잠그고 집는다 — self·judge 가 같은 사슬을 쓴다(두 곳에 적으면 갈린다). */
async function 회고행(tx: unknown, learner_id: string, season_id: string) {
  const q = tx as typeof sql;
  const [행] = await q`
    select review_id, verdict, verdict_by_self
      from engine.season_review
     where learner_id = ${learner_id}::uuid and season_id = ${season_id}::uuid
       for update`;
  return 행 ?? null;
}

/** 두 판정 통로가 같이 쓰는 입구 검사 — 형식이 다르면 여기서 끝난다. */
function 대상읽기(본문: unknown) {
  const b = (본문 && typeof 본문 === 'object' ? 본문 : {}) as Record<string, unknown>;
  const learner_id = typeof b.learner_id === 'string' ? b.learner_id.trim() : '';
  const season_id = typeof b.season_id === 'string' ? b.season_id.trim() : '';
  const 맞나 = /^[0-9a-f-]{36}$/i.test(learner_id) && /^[0-9a-f-]{36}$/i.test(season_id);
  return { b, learner_id, season_id, 맞나 };
}

/* ── POST /v1/teach/retro/self ───────────────────────────────────────── */

/**
 * 학생 자기 판정 — **클릭 하나**(사유 없음).
 *
 * 🔴 이 통로가 강사 통로와 갈라져 있는 것이 곧 설계 §7 의 「학생이 먼저」다. 하나로 합치면
 *   순서가 화면 규약으로만 남고, 화면은 언젠가 갈린다. DB 트리거가 같은 판정을 한 번 더 진다.
 * 🔑 개서는 허용한다(강사 판정 «전»까지) — 학생이 눌렀다 생각을 바꾸는 것은 정상이고, 막으면
 *   남는 통로가 「행을 지우고 다시 열기」인데 삭제는 금지라 아예 길이 없다(F103).
 */
async function 자기판정(본문: unknown, staff_id: string, ver: string) {
  const { b, learner_id, season_id, 맞나 } = 대상읽기(본문);
  if (!맞나) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: 'learner_id · season_id 가 필요합니다',
    }, ver);
  }
  const 흠 = 자기판정검사(b.verdict_by_self);
  if (흠) return 거절응답({ 거절: 'CONTRACT_VIOLATION', 칸: 흠.필드, 문구: 흠.사유 }, ver);

  const 결과 = await sql.begin(async (tx) => {
    const 행 = await 회고행(tx, learner_id, season_id);
    if (!행) {
      return { 거절: 'RETRO_NOT_OPENED' as const, 칸: 'season_id',
        문구: '회고를 먼저 열어야 합니다 — 굳힌 근거 없이 판정만 적지 않습니다' };
    }
    if (행.verdict != null) {
      return { 거절: 'SELF_AFTER_JUDGE' as const, 칸: 'verdict_by_self',
        문구: '강사 판정이 이미 끝났습니다 — 학생 판정은 그 전에만 적습니다(뒤에 적으면 메아리입니다)' };
    }

    const [갱신] = await tx`
      update engine.season_review
         set verdict_by_self = ${String(b.verdict_by_self)}
       where review_id = ${행.review_id}
      returning review_id, verdict_by_self`;

    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.retro.self', array[${learner_id}::uuid])`;

    return { review_id: String(갱신.review_id), verdict_by_self: 갱신.verdict_by_self };
  });

  if ('거절' in 결과) return 거절응답(결과, ver);
  return 봉투(200, { ok: true, ...결과 }, ver);
}

/* ── POST /v1/teach/retro/judge ──────────────────────────────────────── */

/**
 * 강사 판정 — **클릭 하나 + 한 줄**. 이 한 행이 엔진의 유일한 「부호」 라벨이다(설계 §7).
 *
 * 🔑 개서를 허용한다(마이그레이션 머리말 ③) — 잘못 누른 강사에게 남는 통로가 「지우고 다시」
 *   뿐이면 그 우회가 정상 통로가 되는데, 삭제는 트리거가 막으므로 길이 아예 없다.
 *   고친 사실은 decided_at 갱신과 감사 한 줄로 남는다.
 * 🔴 verdict_by_self 는 **여기서 안 건드린다** — 같은 요청으로 둘 다 쓸 수 있게 두면 강사가
 *   학생 칸까지 대신 눌러 대조군이 그 자리에서 죽는다(설계 §7 도전안의 값 전부).
 */
async function 회고판정(본문: unknown, staff_id: string, ver: string) {
  const { b, learner_id, season_id, 맞나 } = 대상읽기(본문);
  if (!맞나) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: 'learner_id · season_id 가 필요합니다',
    }, ver);
  }
  const 흠 = 판정검사(b.verdict, b.note);
  if (흠) return 거절응답({ 거절: 'CONTRACT_VIOLATION', 칸: 흠.필드, 문구: 흠.사유 }, ver);

  const 결과 = await sql.begin(async (tx) => {
    const 행 = await 회고행(tx, learner_id, season_id);
    if (!행) {
      return { 거절: 'RETRO_NOT_OPENED' as const, 칸: 'season_id',
        문구: '회고를 먼저 열어야 합니다 — 굳힌 근거 없이 판정만 적지 않습니다' };
    }

    const [갱신] = await tx`
      update engine.season_review
         set verdict     = ${String(b.verdict)},
             note        = ${String(b.note).trim()},
             decided_by  = ${staff_id},
             decided_at  = now()
       where review_id = ${행.review_id}
      returning review_id, verdict, verdict_by_self, decided_at`;

    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.retro.judge', array[${learner_id}::uuid])`;

    return {
      review_id: String(갱신.review_id),
      verdict: 갱신.verdict,
      /* 🔑 둘을 함께 돌려준다 — 「갈렸나」는 이 그릇의 가장 값진 신호라(설계 §7 도전안) 화면이
       *   그 자리에서 보여 줄 수 있어야 한다(다시 조회하면 그 순간이 지나간다). */
      verdict_by_self: 갱신.verdict_by_self ?? null,
      decided_at: 갱신.decided_at,
    };
  });

  if ('거절' in 결과) return 거절응답(결과, ver);
  return 봉투(200, { ok: true, ...결과 }, ver);
}

/* ── 강사 반 단위 피드백 (설계 §4·§5) ───────────────────────────────────────
 *
 * 🔴 **권한은 라우트가 아니라 `staff_classes` 가 건다.** `service_role` 은 RLS 를 우회하므로
 *   이 조인이 유일한 방어선이다 — 「내 반만 보인다」를 화면 규약으로 두면 서버가 안 지킨다.
 *   그래서 `class_id` 를 인자로 받되 **믿지 않는다**(받은 값으로 바로 조인하는 게 아니라, 내 반
 *   목록과의 교집합을 먼저 낸다).
 *
 * 🔑 **`target_ids` 의 단위는 라우트마다 다르다** — 그 라우트가 «무엇에 대해» 일했는지를 적는다
 *   (`gold/queue` 는 correction · `compass/open` 은 learner). 단위는 `action` 이름이 들고 있다.
 */

/**
 * 「기다리는 것」의 **유일한 정의**. 두 라우트가 이 함수 하나를 쓴다.
 *
 * 🔴 카드의 셈(`feedback/classes`)과 목록(`feedback/queue`)이 각자 술어를 적으면 갈리고,
 *   갈린 증상은 **「● 4 인데 들어가면 3건」**이다 — 강사는 자기가 뭘 놓쳤는지 찾다 시간을 쓴다.
 *   `correct/index.ts:140` 이 「대기 12인데 집히는 건 0」을 막으려고 쓴 것과 같은 처방이다.
 *
 * 정의 두 조각:
 *   ① **AI 교정이 이미 났다** — 강사가 반응할 대상이 있어야 큐에 선다. 곁들여 G2 「맞음」
 *      자동 하강(설계 §7)이 앞단에서 빼 준 것은 여기 자동으로 안 들어온다(같은 축이다).
 *   ② **강사 한 마디가 아직 없다** — `teacher_notes` 가 상태의 정본이다(감사 원장이 아니라).
 *
 * @param class_id null 이면 내 반 전부.
 */
function 기다림질의(tx: unknown, staff_id: string, class_id: string | null) {
  const q = tx as typeof sql;
  return q`
    select l.class_id, l.learner_id, l.display_name, l.student_code,
           s.submission_id, s.task_type, s.task_format, s.occurred_at
      from engine.staff_classes sc
      join engine.learners l        on l.class_id = sc.class_id and l.active
      join engine.learning_events e on e.learner_id = l.learner_id
      join engine.submissions s     on s.event_id = e.event_id
     where sc.staff_id = ${staff_id}::uuid
       and (${class_id}::uuid is null or sc.class_id = ${class_id}::uuid)
       and exists (select 1 from engine.corrections c
                    where c.submission_id = s.submission_id and c.actor_kind = 'ai')
       and not exists (select 1 from engine.teacher_notes n
                        where n.submission_id = s.submission_id)
     order by s.occurred_at`;
}

/* ── GET /v1/teach/feedback/classes ──────────────────────────────────────── */

async function 내반목록(staff_id: string, ver: string) {
  /* 주는 **서버가 정한다** — `gold/queue` 와 같은 사유다. 골든표본의 ISO 주 셈을 그대로 쓴다
   * (시간대 리터럴을 여기 다시 적지 않는다 — 재기입한 사본은 갈리는 날 조용히 틀린다). */
  const 이번주 = iso주(new Date());
  const 주 = 주범위(키(이번주.연, 이번주.주))!;

  const 결과 = await sql.begin(async (tx) => {
    const 반들 = await tx`
      select c.class_id, c.class_key, c.display_name,
             (select count(*) from engine.learners l
               where l.class_id = c.class_id and l.active) as 학생수
        from engine.staff_classes sc
        join engine.classes c on c.class_id = sc.class_id and c.active
       where sc.staff_id = ${staff_id}::uuid
       order by c.class_key`;

    const ids = 반들.map((r: Record<string, unknown>) => String(r.class_id));

    /* ⚠ **0건도 감사 1행 남긴다** — `gold/queue` 와 같은 판정이다. */
    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.feedback.classes', ${ids}::uuid[])`;

    if (!ids.length) return { classes: [], quiet: [] };

    const 기다림 = await 기다림질의(tx, staff_id, null) as unknown as Array<{ class_id: string }>;
    const 반별 = new Map<string, number>();
    for (const r of 기다림) {
      const k = String(r.class_id);
      반별.set(k, (반별.get(k) ?? 0) + 1);
    }

    /* 🎯 **이번 주 한 마디를 한 번도 못 받은 학생**(설계 §5 한 수 더 · 채택).
     * 🔑 설계는 이 신호를 `staff_access_log`(누가 어느 «행»을 열었나)에서 뽑자고 적었는데,
     *   세워 보니 큐를 한 번 열면 그 반 학생이 **전원** 열린 것이 되어 목록이 영구히 빈다 —
     *   재는 층이 목적과 어긋난다. 그래서 **한 마디를 줬나**로 잰다: 화면을 연 것은 주의가
     *   아니고, 말을 건 것이 주의다. 곁들여 **아무것도 안 낸 학생도 여기 뜬다**(낼 것이 없으니
     *   한 마디도 없다) — 조용한 학생이 조용한 채로 지나가는 것을 막는 것이 이 칸의 목적이라
     *   그게 맞는 동작이다. 🚫 학생에게 보여주지 않는다(강사 자신의 행동 기록이다). */
    const 조용한 = await tx`
      select l.class_id, l.learner_id, l.display_name
        from engine.staff_classes sc
        join engine.learners l on l.class_id = sc.class_id and l.active
       where sc.staff_id = ${staff_id}::uuid
         and not exists (
           select 1 from engine.teacher_notes n
             join engine.submissions s2     on s2.submission_id = n.submission_id
             join engine.learning_events e2 on e2.event_id = s2.event_id
            where n.staff_id = ${staff_id}::uuid
              and e2.learner_id = l.learner_id
              and n.created_at >= ${주.시작}::timestamptz
              and n.created_at <  ${주.끝}::timestamptz)
       order by l.display_name`;

    return {
      classes: 반들.map((r: Record<string, unknown>) => ({
        class_id: String(r.class_id),
        class_key: r.class_key,
        display_name: r.display_name ?? null,
        ...카드요약({ 학생수: Number(r.학생수), 기다림: 반별.get(String(r.class_id)) ?? 0 }),
      })),
      quiet: 조용한.map((r: Record<string, unknown>) => ({
        class_id: String(r.class_id),
        learner_id: String(r.learner_id),
        display_name: r.display_name ?? null,
      })),
    };
  });

  /* 🔴 **빈 화면과 권한 없음이 같은 모양이면 안 된다**(설계 §5). 담당 반이 0개인 강사는
   *   「아무것도 없다」가 아니라 「배정된 반이 없다」를 본다 — 원장이 배정을 안 한 것이지
   *   그가 일을 다 끝낸 것이 아니다. */
  return 봉투(200, {
    ok: true,
    week: { starts_at: 주.시작, ends_at: 주.끝 },
    ...결과,
    ...(결과.classes.length ? {} : { empty_reason: 'no_classes_assigned' }),
  }, ver);
}

/* ── GET /v1/teach/feedback/queue?class_id= ──────────────────────────────── */

async function 반큐읽기(url: URL, staff_id: string, ver: string) {
  const class_id = uuid읽기(url.searchParams.get('class_id'));
  if (!class_id) {
    return 실패(400, {
      code: 'CONTRACT_VIOLATION', message: 'class_id 가 uuid 가 아닙니다',
      retryable: false, field: 'class_id',
    }, ver);
  }

  const 결과 = await sql.begin(async (tx) => {
    /* 🔴 내 반인지 **먼저** 판정한다 — 「0행이니 빈 반이겠지」로 접으면 남의 반을 조회한 것과
     *   내 빈 반이 같은 응답이 되고, 그 순간 이 통로가 「그 반이 있느냐」를 알려주는 통로가 된다. */
    const [내반] = await tx`
      select c.class_id, c.class_key, c.display_name
        from engine.staff_classes sc
        join engine.classes c on c.class_id = sc.class_id
       where sc.staff_id = ${staff_id}::uuid and sc.class_id = ${class_id}::uuid`;
    if (!내반) return { 거절: 'NOT_FOUND' as 거절코드, 문구: '담당 반이 아닙니다', 칸: 'class_id' };

    const 항목들 = await 기다림질의(tx, staff_id, class_id) as unknown as Array<Record<string, unknown>>;

    /* ⚠ 0건도 감사 1행. 단위는 **학생**이다 — 「이 반에서 내가 누구를 봤나」가 그 축이다. */
    const 학생들 = [...new Set(항목들.map((r) => String(r.learner_id)))];
    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.feedback.queue', ${학생들}::uuid[])`;

    return {
      class: { class_id, class_key: 내반.class_key, display_name: 내반.display_name ?? null },
      /* 🔴 정렬 축은 **「오래 기다린 순」 하나**다(질의의 `order by occurred_at`). 점수·정답률·
       *   진도로 정렬하는 순간 이 화면이 등수표가 되고 철학 ㉢ 을 정면으로 깬다. 기다린 시간은
       *   학생의 속성이 아니라 **내 일감의 나이**다. 🚫 평균·상위·배지 어느 자리에도. */
      items: 항목들.map((r) => ({
        submission_id: String(r.submission_id),
        learner_id: String(r.learner_id),
        display_name: r.display_name ?? null,
        student_code: r.student_code ?? null,
        task_type: r.task_type,
        task_format: r.task_format ?? null,
        occurred_at: r.occurred_at,
      })),
    };
  });

  if ('거절' in 결과) return 거절응답(결과 as { 거절: 거절코드; 문구: string; 칸?: string }, ver);
  return 봉투(200, { ok: true, ...결과 }, ver);
}

/* ── POST /v1/teach/feedback/give ────────────────────────────────────────── */

async function 한마디주기(본문: unknown, staff_id: string, ver: string) {
  const 검사 = 한마디검사(본문);
  if (검사.거절) {
    return 거절응답({ 거절: 검사.거절 as 거절코드, 문구: String(검사.문구), 칸: 검사.칸 }, ver);
  }
  const 값 = 검사.값!;

  const 결과 = await sql.begin(async (tx) => {
    /* 🔴 호출자가 준 `submission_id` 를 **믿지 않는다** — 담당 반 밖 학생의 산출물이면 여기서
     *   0행으로 막힌다. 「없다」와 「내 것이 아니다」를 **같은 코드**로 묶는 것도 뜻이 있다:
     *   가르면 응답 자체가 「그 산출물은 있다」를 말한다(:239 NOT_STAFF 와 같은 판단). */
    const [권한] = await tx`
      select s.submission_id
        from engine.submissions s
        join engine.learning_events e on e.event_id = s.event_id
        join engine.learners l        on l.learner_id = e.learner_id and l.active
        join engine.staff_classes sc  on sc.class_id = l.class_id
       where s.submission_id = ${값.submission_id}::uuid
         and sc.staff_id = ${staff_id}::uuid`;
    if (!권한) {
      return { 거절: 'NOT_FOUND' as 거절코드, 문구: '담당 반의 산출물이 아닙니다', 칸: 'submission_id' };
    }

    /* 개서는 연다 — 단 **자기 것만**. 한 반에 강사 둘이 정상이라(설계 §1 ⓐ) 남의 한 마디를
     * 조용히 덮는 길을 열면, 학생에게 간 말이 누구 말인지 아무도 모르게 된다.
     * ⚠ `where` 가 안 맞으면 `on conflict do update` 는 **0행을 돌려준다** — 그 침묵을
     *   「성공」으로 읽지 않는다(아래 `if (!행)`). */
    const [행] = await tx`
      insert into engine.teacher_notes
             (submission_id, staff_id, body, origin, disposition, schema_ver)
      values (${값.submission_id}::uuid, ${staff_id}::uuid,
              ${값.body}, ${값.origin}, ${값.disposition}, ${ver})
      on conflict on constraint teacher_notes_once_c11 do update
         set body = excluded.body, origin = excluded.origin,
             disposition = excluded.disposition, updated_at = now()
       where engine.teacher_notes.staff_id = ${staff_id}::uuid
      returning note_id, created_at, updated_at`;
    if (!행) {
      return {
        거절: 'NOTE_BY_OTHER' as 거절코드,
        문구: '다른 선생님이 이미 한 마디를 남겼습니다', 칸: 'submission_id',
      };
    }

    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'teach.feedback.give', array[${값.submission_id}::uuid])`;

    return {
      note_id: String(행.note_id),
      created_at: 행.created_at,
      /* 고쳐 쓴 것인지 처음 쓴 것인지를 화면이 그 자리에서 안다 — 다시 조회하면 못 가른다. */
      updated_at: 행.updated_at ?? null,
      disposition: 값.disposition,
      origin: 값.origin,
    };
  });

  if ('거절' in 결과) return 거절응답(결과 as { 거절: 거절코드; 문구: string; 칸?: string }, ver);
  return 봉투(200, { ok: true, ...결과 }, ver);
}
