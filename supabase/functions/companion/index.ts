/**
 * `functions/companion` — 마스코트 두뇌 v0 (강사 전용).
 *
 * 정본 사슬: appsscript `docs/캐릭터/마스코트_말할순간_설계.md` v1.1(행동) →
 *   `docs/캐릭터/마스코트_배선_설계.md` v1(물리) → talk `docs/컴패니언_내부계약.md` v0(이 문의 계약).
 *   앱층은 `6fc57ae`(강사화면 ㉮)에서 이미 착지했다. 이 파일은 그 §2·§3·§4 의 구현이다.
 *
 * ■ 🔴 왜 `teach` 를 안 넓히고 **새 문**인가 (계약 §1 · M2 §2 선례 승계)
 *   `teach` 의 하위 경로는 전부 **판정·기록**(쓰기 권위)이고, companion 은 **읽고 답하는 문**이다.
 *   한 문에 섞으면 「강사 문 = 라벨 권위」의 경계(검수왕복시험:230 의 teacher→403 핀)가 흐려진다.
 *   C0 에는 v0 에서 등재하지 않는다 — `teach` 자체가 C0 §4 여덟 문 밖이라는 선례를 따른다.
 *   **C0 개정은 2단계(학생판)가 연다.**
 *
 * ■ 🔴 이 문이 «답한다»의 뜻 — 지어내지 않는 것이 기능이다
 *   강사가 묻는 것은 대부분 「그 규칙이 뭐였더라」다. 틀린 답은 «모른다»보다 나쁘다 —
 *   강사는 그걸 학생 앞에서 그대로 말하고, 그 순간 정본이 둘이 된다. 그래서 이 문의 기본값은
 *   **인계**고, 답은 예외다: 스키마가 `handoff` 를 강제하고, 출처가 목록 밖이면 버리고,
 *   옛글자가 걸리면 응답 자체를 폐기한다(정제 ✗ · 상담AI:240 승계).
 *
 * ■ 🔴 빈칸 로그가 이 문의 **산출물**이다 (계약 §4 · 배선 §4)
 *   「출처 0 으로 답한 질문」·「인계한 질문」이 곧 «문서에 없는 것» 목록이다. 그래서 로그 실패는
 *   응답 실패다 — qa 행과 감사 행이 **한 트랜잭션**이고, 못 남기면 200 을 안 낸다.
 *   ⚠ 이건 아직 «모였나»까지다. 원장이 그 목록을 읽는 통로는 2단계다(④ = ✓✗✗).
 */

import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';
import 계약판모듈 from './계약판.mjs';
import 옛글자모듈 from './옛글자.mjs';
import 교정엔진모듈 from './교정엔진.mjs';
import 지식모듈 from './강사지식.mjs';

const { 토큰주체, 발급시각, 살아있는직원 } = 토큰모듈 as {
  토큰주체: (req: Request) => string | null;
  발급시각: (req: Request) => number | null;
  살아있는직원: (질의: unknown, 주체: string, iat: number | null) => unknown;
};
const { 판번호, 행들에서판, 앞선판인가 } = 계약판모듈 as {
  판번호: (s: string) => number | null;
  행들에서판: (행: unknown) => string | null;
  앞선판인가: (선언: string, 서버: string) => boolean;
};
const { 첫걸림: 옛글자걸림 } = 옛글자모듈 as { 첫걸림: (칸들: unknown[]) => unknown };
const { 모델, 메시지경로, 벤더헤더, 왕복제한밀리 } = 교정엔진모듈 as {
  모델: string; 메시지경로: string; 벤더헤더: (키: string) => Record<string, string>; 왕복제한밀리: number;
};
const { 강사지식, 문서이름 } = 지식모듈 as { 강사지식: string; 문서이름: string[] };

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 🔑 **경로표** — 경로가 하나라도 표로 둔다(`teach:147` 과 같은 사유). 둘째 경로가 서는 날
 *   메서드 삼항과 안내문이 갈라지고, 갈라진 쪽은 조용히 405 를 낸다. 파생은 한 곳에서. */
const 경로표 = { 'companion/ask': 'POST' } as const;
type 아는경로 = keyof typeof 경로표;
const 안내 = Object.entries(경로표).map(([p, m]) => `${m} /v1/${p}`).join(' · ');

/* 🔑 **허용 목록**이다(차단 목록이 아니다 — 못 적은 역할이 새는 방향은 언제나 「통과」다).
 *   `director` 가 있는 이유는 `teach` 와 같다: 오늘 이 통로를 쓸 사람이 원장 본인뿐이다.
 *   🚫 `inspector` 는 여기 없다 — 검수자는 전사 축이고, 이 문은 «수업하는 사람»의 문이다. */
const 강사역할 = ['teacher', 'director'];

/** 이 문의 프롬프트 판본. 프롬프트를 고치면 **여기를 함께 올린다** — 안 올리면 새 프롬프트의
 *  답이 옛 판 이름으로 쌓이고, 그 오염은 소급이 안 된다(교정엔진 `프롬프트판` 주석과 같은 사유).
 *  🔑 교정과 달리 파일에서 못 읽는다 — 이 문의 지시문은 아래 `지시문()` 이 조립한다. */
const 프롬프트판 = 'companion-v0';

type 오류 = { code: string; message: string; retryable: boolean; field?: string };

function 봉투(status: number, body: Record<string, unknown>, ver: string) {
  return new Response(JSON.stringify({ contract_ver: ver, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const 실패 = (status: number, e: 오류, ver: string) => 봉투(status, { ok: false, error: e }, ver);

/* 코드→상태를 **한 자리에 리터럴로**(`teach:177` 과 같은 사유 — 두 경로가 각자 삼항으로 정하면
 * 같은 `else` 가 한쪽은 409, 한쪽은 400 이 된다). */
const 거절상태 = {
  CONTRACT_VIOLATION: 400,
  INTERNAL: 500,
} as const;
type 거절코드 = keyof typeof 거절상태;

Deno.serve(async (req: Request) => {
  const 선언 = req.headers.get('X-Contract-Ver') ?? '';
  if (!선언) return 실패(400, { code: 'CONTRACT_VER_MISSING', message: 'X-Contract-Ver 헤더가 없습니다', retryable: false }, 선언);
  if (판번호(선언) === null) {
    return 실패(426, { code: 'CONTRACT_VER_UNSUPPORTED', message: `계약판 형식이 아닙니다: ${선언}`, retryable: false }, 선언);
  }

  /* 🔴 **뒷 두 마디**로 가른다 — `teach` 와 같은 사유(마지막 마디만 보면 `/v1/아무거나/ask` 가
   *   전부 이 문으로 들어온다). 새는 방향이 「통과」인 자리는 좁게 연다. */
  const url = new URL(req.url);
  const 마디 = url.pathname.replace(/\/+$/, '').split('/');
  const 경로 = 마디.slice(-2).join('/');
  if (!(경로 in 경로표)) {
    return 실패(404, { code: 'CONTRACT_VIOLATION', retryable: false, message: `없는 경로입니다 — ${안내}` }, 선언);
  }
  const 기대메서드 = 경로표[경로 as 아는경로];
  if (req.method !== 기대메서드) {
    return 실패(405, { code: 'CONTRACT_VIOLATION', message: `${기대메서드} 만 받는다`, retryable: false }, 선언);
  }

  const 주체 = 토큰주체(req);
  if (!주체) return 실패(401, { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false }, 선언);

  /* 직원 확정과 DB 계약판을 한 번에(왕복 1회) — `teach:242` 사슬 그대로.
   * 🔴 `SUPABASE_DB_URL` 직결이라 RLS 를 우회한다 — 이 사슬이 유일한 방어선이다.
   * 🔴 본문의 역할 주장은 안 믿는다(events 선례). 역할은 **DB 가 말하는 것**만 쓴다. */
  const [행] = await sql`
    select (select staff_id from engine.staff
             where ${살아있는직원(sql, 주체, 발급시각(req))}
               and role = any(${강사역할}::text[])) as staff_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const ver = 행들에서판(행);
  if (!ver) {
    console.error('[companion] DB 계약판을 못 읽었다', (행 as { 최신조각?: string })?.최신조각);
    return 실패(500, { code: 'INTERNAL', message: '서버 설정 오류입니다', retryable: true }, 선언);
  }

  if (앞선판인가(선언, ver)) {
    return 실패(426, {
      code: 'CONTRACT_VER_UNSUPPORTED', retryable: false,
      message: `서버가 아직 ${선언} 을 모릅니다(현재 ${ver}) — 잠시 뒤 다시 시도해 주세요`,
    }, ver);
  }

  /* 🔑 「직원이 아니다」와 「폐기됐다」를 **같은 코드**로 묶는다 — 가르면 응답 자체가
   *   「그 계정은 있다」를 말한다. 역할이 `inspector` 인 사람도 여기서 걸린다. */
  if (!(행 as { staff_id?: string })?.staff_id) {
    return 실패(403, { code: 'NOT_STAFF', message: '강사 권한이 없습니다', retryable: false }, ver);
  }
  const staff_id = (행 as { staff_id: string }).staff_id;

  try {
    const 본문 = await 본문읽기(req);
    if (본문 === undefined) {
      return 실패(400, { code: 'CONTRACT_VIOLATION', message: 'JSON 이 아닙니다', retryable: false }, ver);
    }
    return await 묻기(본문, staff_id, ver);
  } catch (e) {
    console.error(`[companion/${경로}] 실패`, String((e as Error)?.message ?? e));
    return 실패(500, { code: 'INTERNAL', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});

/** 본문 파서 — 통로를 하나로 둔다(`teach:293` 과 같은 사유). */
async function 본문읽기(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch (_) {
    return undefined;
  }
}

/* ── 벤더 ─────────────────────────────────────────────────────────── */

/** 질문·화면 상한 — 넘치면 자르지 않고 **거절**한다(자르면 강사는 자기가 물은 것과 다른 답을 받는다). */
const 질문상한 = 2000;
const 화면상한 = 100;

/**
 * 답 스키마 — **`output_config.format` 으로 API 층에서 강제한다**(계약 §2 「handoff 필수」).
 *
 * 🔑 프롬프트로 「JSON 만 내라」고 부탁하는 길(교정엔진의 `응답덩이꺼내기`)을 안 쓴다:
 *   그쪽은 2026-08-12 실측에서 **102문항 중 8건(7.8%)**이 산문에 둘러싸여 통째로 버려졌고,
 *   내용은 여덟 개 다 정확했다 — 즉 잃던 것이 모델이 아니라 파서였다. 스키마 강제는 그 손실
 *   갈래를 아예 없앤다. 그래서 여기엔 **파서 폴백을 두지 않는다** — 안 도는 장치는 결함이다.
 * ⚠ 그래도 파싱이 실패하면(형식 밖) 갈래는 하나다: **인계**. 지어내는 것보다 항상 낫다.
 */
const 답스키마 = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: '강사에게 보일 답. 모르면 빈 문자열.' },
    cited_refs: { type: 'array', items: { type: 'string' }, description: '근거로 쓴 문서 이름들. 동봉 목록 밖 이름은 서버가 버린다.' },
    handoff: { type: 'boolean', description: '원장에게 넘겨야 하는가. 애매하면 true.' },
    handoff_reason: { type: 'string', description: '넘기는 사유. 안 넘기면 빈 문자열.' },
  },
  required: ['reply', 'cited_refs', 'handoff', 'handoff_reason'],
  additionalProperties: false,
} as const;

/**
 * 지시문 — 지식이 **앞**, 규칙이 **뒤**. 이 순서가 캐시의 전제다(변하는 것은 전부 user 쪽).
 *
 * 🔴 「애매하면 넘긴다 — 지어내는 것보다 항상 낫다」는 상담AI 조항을 그대로 승계한다.
 *    상담AI 는 학부모에게 틀린 말이 나가는 것을 막는 조항이었고, 여기서는 **강사의 입을 통해**
 *    학생·학부모에게 닿는다 — 한 다리 건널 뿐 도착지가 같다.
 */
function 지시문(): string {
  return `당신은 SYNK LAB 강사를 돕는 비서입니다. 강사가 수업·숙제·반편성·검수에 대해 물으면, 아래 동봉된 학원 문서에 **적혀 있는 것만** 근거로 답합니다.

${강사지식}

━━━ 답하는 규칙 ━━━

1. 문서에 적힌 것만 답한다. 추측·일반론·다른 학원 이야기를 섞지 않는다.
2. 애매하면 넘긴다 — 지어내는 것보다 항상 낫다. 확신이 없으면 handoff=true, reply="" 로 답한다.
3. 근거로 쓴 문서 이름을 cited_refs 에 그대로 적는다. 위 문서 경계(━━━ 이름 ━━━)에 있는 이름만 쓴다.
4. 「⛔ 유호님 확정 전」이라고 적힌 항목은 **답하지 않는다** — 주제만 알고 있으므로, 그 주제를 물으면 "아직 확정 전이라 원장님께 확인이 필요하다"로 넘긴다.
5. 한국어로 답한다. 일본어 한자·간체자를 쓰지 않는다(한국 한자·한글만).
6. 짧게 답한다. 강사는 수업 중이거나 수업 직전이다 — 결론 먼저, 근거는 한 줄.`;
}

type 벤더답 = { reply: string; cited_refs: string[]; handoff: boolean; handoff_reason: string };

/**
 * 벤더 왕복. 실패·키부재는 **던지지 않고** 인계로 접는다.
 *
 * 🔴 `ANTHROPIC_API_KEY` 가 없을 때 행동은 「모르면 인계」와 **같다**(계약 §2) —
 *   `functions/correct:251` 의 「설정 문제를 발화 실패로 못박지 않는다」의 이 문 판이다.
 *   500 을 내면 화면이 「고장」을 그리고 강사는 다시 안 누른다. 인계면 사람에게 간다.
 *   ⚠ 대신 **로그는 남는다** — 키가 없어 못 답한 질문도 빈칸 로그의 재료다.
 */
async function 벤더왕복(질문: string, 화면: string | null): Promise<벤더답> {
  const 키 = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!키) {
    console.error('[companion] ANTHROPIC_API_KEY 가 없다 — 인계로 접는다(로그는 남긴다)');
    return { reply: '', cited_refs: [], handoff: true, handoff_reason: '답변 엔진이 아직 연결되지 않았습니다' };
  }

  const 맥락 = 화면 ? `[강사가 보고 있는 화면] ${화면}\n\n` : '';
  const 몸통 = {
    model: 모델,
    /* 답 하나에 2048 이면 넉넉하다(짧게 답하라는 규칙 6 과 짝). 잘리면 여기를 올린다 —
     * 아래 `thinking` 이 꺼져 있으므로 이 상한은 **전부 본문 몫**이다. */
    max_tokens: 2048,
    /* 🔴 thinking 은 **명시적으로 끈다** — sonnet-5 는 필드를 생략하면 adaptive 가 조용히 켜지고,
     *   max_tokens 는 thinking+본문 **합산** 상한이라 생각이 예산을 다 먹으면 text 블록 0개가
     *   온다. 여기서 그 모습은 「빈 답」이고, 빈 답은 이 문에서 **거짓 인계**로 보인다
     *   (교정엔진:146 이 같은 이유로 껐고 그쪽은 08-12 eval 6문항이 그 모양으로 죽었다). */
    thinking: { type: 'disabled' },
    /* 🔑 캐시는 지시문 블록 **하나**에 건다 — 렌더 순서(tools→system→messages)상 변하는 것
     *   (질문·화면)이 전부 뒤에 오므로 앞은 매번 바이트로 같다.
     * 🔴 **ttl 을 1시간으로 둔다**(기본 5분이 아니다). 실측 2026-08-14: 동봉 지식이 173,638자다.
     *   강사 질문은 5분보다 드물게 오므로 기본 TTL 이면 **거의 매 호출이 캐시 «쓰기»**가 되고,
     *   쓰기는 정가의 1.25배다 — 「캐시가 비용을 진다」(계약 §2)는 전제가 그 조건에선 안 선다.
     *   1시간은 쓰기가 2배지만 회차와 회차 사이가 살아 있어 한 수업에 1쓰기+N읽기가 된다.
     *   ⚠ **재 본 적이 없다** — 강사 0명이라 질문 간격이 미실측이다. 첫 주 `usage` 의
     *     cache_read 가 계속 0이면 걸린 게 아니라 안 걸린 것이고, 처방은 TTL 이 아니라
     *     **간격을 재는 것**이다(교정엔진:121 의 캐시 문턱 주석과 같은 규율). */
    system: [{ type: 'text', text: 지시문(), cache_control: { type: 'ephemeral', ttl: '1h' } }],
    /* 🔑 강사 질문은 **user 로만** 넣는다 — 지시문에 끼워 넣으면 「위 지시를 무시하고…」가
     *   지시로 읽힌다(교정엔진:110 과 같은 사유). 강사에게 악의가 없어도 사고는 악의를 요구하지 않는다. */
    messages: [{ role: 'user', content: `${맥락}[강사 질문] ${질문}` }],
    output_config: { format: { type: 'json_schema', schema: 답스키마 } },
  };

  const 중단 = AbortSignal.timeout(왕복제한밀리);
  let 응답: Response;
  try {
    응답 = await fetch(메시지경로, { method: 'POST', headers: 벤더헤더(키), body: JSON.stringify(몸통), signal: 중단 });
  } catch (e) {
    console.error('[companion] 벤더 왕복 실패', String((e as Error)?.message ?? e));
    return { reply: '', cited_refs: [], handoff: true, handoff_reason: '답변 엔진에 닿지 못했습니다' };
  }

  if (!응답.ok) {
    console.error('[companion] 벤더 오류', 응답.status, (await 응답.text()).slice(0, 300));
    return { reply: '', cited_refs: [], handoff: true, handoff_reason: '답변 엔진이 응답하지 않았습니다' };
  }

  const 본문 = await 응답.json().catch(() => null);
  /* 🔑 거절(`stop_reason: "refusal"`)도 형식 밖과 **같은 갈래**로 접는다 — 어느 쪽이든
   *   우리가 쓸 답이 없다는 사실은 같고, 갈래를 늘리면 안 도는 가지가 생긴다. */
  const 글 = 응답글(본문);
  if (!글) {
    console.error('[companion] 응답에서 글을 못 꺼냈다', JSON.stringify(본문)?.slice(0, 200));
    return { reply: '', cited_refs: [], handoff: true, handoff_reason: '답변 형식이 예상과 달랐습니다' };
  }

  try {
    const 답 = JSON.parse(글) as 벤더답;
    return {
      reply: String(답.reply ?? ''),
      cited_refs: Array.isArray(답.cited_refs) ? 답.cited_refs.map(String) : [],
      handoff: Boolean(답.handoff),
      handoff_reason: String(답.handoff_reason ?? ''),
    };
  } catch (_) {
    console.error('[companion] 스키마 강제인데 JSON 이 아니다 — 벤더 계약이 바뀌었는지 본다');
    return { reply: '', cited_refs: [], handoff: true, handoff_reason: '답변 형식이 예상과 달랐습니다' };
  }
}

/** 벤더 응답에서 text 블록만 이어붙인다. 모양이 다르면 `null`(형식 추측 금지 · 교정엔진:160 승계). */
function 응답글(본문: unknown): string | null {
  const 조각 = 본문 && Array.isArray((본문 as { content?: unknown[] }).content)
    ? (본문 as { content: { type?: string; text?: string }[] }).content
    : null;
  if (!조각) return null;
  const 글 = 조각.filter((c) => c && c.type === 'text').map((c) => String(c.text || '')).join('');
  return 글.trim() ? 글 : null;
}

/* ── 문 ──────────────────────────────────────────────────────────── */

function 거절응답(결과: { 거절: 거절코드; 문구: string; 칸?: string }, ver: string) {
  return 실패(거절상태[결과.거절], {
    code: 결과.거절, message: 결과.문구, retryable: false, ...(결과.칸 ? { field: 결과.칸 } : {}),
  }, ver);
}

function 몸읽기(본문: unknown): { question: string; screen: string | null } | { 거절: 거절코드; 문구: string; 칸: string } {
  const b = (본문 ?? {}) as Record<string, unknown>;
  const question = typeof b.question === 'string' ? b.question.trim() : '';
  if (!question) return { 거절: 'CONTRACT_VIOLATION', 문구: '질문이 비었습니다', 칸: 'question' };
  if ([...question].length > 질문상한) {
    return { 거절: 'CONTRACT_VIOLATION', 문구: `질문은 ${질문상한}자까지입니다`, 칸: 'question' };
  }
  /* `screen` 은 맥락일 뿐이라 없어도 된다 — 다만 «있는데 이상한 것»은 안 받는다.
   * 자유 문자열이므로 뜻은 안 따지고 길이만 본다(앱 화면 이름은 짧다). */
  const raw = typeof b.screen === 'string' ? b.screen.trim() : '';
  if ([...raw].length > 화면상한) {
    return { 거절: 'CONTRACT_VIOLATION', 문구: `screen 은 ${화면상한}자까지입니다`, 칸: 'screen' };
  }
  return { question, screen: raw || null };
}

async function 묻기(본문: unknown, staff_id: string, ver: string) {
  const 몸 = 몸읽기(본문);
  if ('거절' in 몸) return 거절응답(몸, ver);

  const 원답 = await 벤더왕복(몸.question, 몸.screen);

  /* ① **옛글자 게이트 — 코드층이다**(모델 판단 밖 · 상담AI:240 승계).
   *   일본어 한자·간체자가 섞인 답은 **정제하지 않고 폐기**한다. 정제는 「거의 맞는 답」을
   *   남기는데, 이 문에서 거의 맞는 답은 강사가 학생 앞에서 그대로 말하는 답이다. */
  const 걸림 = 옛글자걸림([원답.reply]);
  const 옛글자탈락 = Boolean(걸림);

  /* ② **cited_refs 화이트리스트** — 동봉 목록 밖 이름은 버린다(계약 §2).
   *   🔴 막는 것: 모델이 지어낸 문서명이 «출처 있는 답»의 얼굴을 쓰는 것. 사람은 출처가 붙은
   *     답을 더 믿으므로, 가짜 출처는 틀린 답보다 멀리 간다. c6 이 「자리만 내고 채우기는
   *     RAG 도입일부터」라 적어 둔 그 칸의 첫 실물이다(배선 §4). */
  const 허용 = new Set(문서이름);
  const 버린출처 = 원답.cited_refs.filter((r) => !허용.has(r));
  const 출처 = 원답.cited_refs.filter((r) => 허용.has(r));
  if (버린출처.length) console.error('[companion] 목록 밖 출처를 버렸다', 버린출처.join(' · '));

  /* ③ 접기 — 위 둘 중 하나라도 걸리면 인계다. `reply` 빈 문자열도 인계다(계약 §2). */
  const 인계 = 원답.handoff || 옛글자탈락 || !원답.reply.trim();
  const reply = 인계 ? '' : 원답.reply.trim();
  const 사유 = 옛글자탈락
    ? '답변에 쓸 수 없는 글자가 섞여 폐기했습니다'
    : (원답.handoff_reason.trim() || (인계 ? '문서에서 근거를 찾지 못했습니다' : ''));

  /* ④ **qa 행 + 감사 한 트랜잭션**(계약 §4 · teach 판정+감사 선례).
   *   🔴 나누면 답은 나갔는데 빈칸 로그에는 없는 행이 생긴다 — 그 손실은 증상이 없다
   *     (「그 질문은 안 왔다」와 「로그가 실패했다」가 같은 모양이다). 그래서 로그 실패 = 응답 실패다. */
  const [qa] = await sql.begin(async (tx) => {
    const [행] = await tx`
      insert into engine.companion_qa (
        staff_id, screen, question, answer, cited_refs, handoff, handoff_reason, model, prompt_ver
      ) values (
        ${staff_id}::uuid, ${몸.screen}, ${몸.question}, ${reply},
        ${출처}::text[], ${인계}, ${인계 ? 사유 : null}, ${모델}, ${프롬프트판}
      ) returning qa_id`;

    /* 🔑 `target_ids` 는 빈 배열이다 — 이 문은 **학생 자원을 안 건드린다**. 감사표가 그 사실을
     *   말하게 두고, 질문·답·출처는 자기 표(`companion_qa`)가 진다(계약 §4 · 새 표가 정직하다). */
    await tx`
      insert into engine.staff_access_log (staff_id, action, target_ids)
      values (${staff_id}::uuid, 'companion.ask', '{}'::uuid[])`;

    return [행];
  });

  return 봉투(200, {
    ok: true,
    qa_id: (qa as { qa_id: string }).qa_id,
    reply,
    cited_refs: 출처,
    handoff: 인계,
    handoff_reason: 인계 ? 사유 : '',
  }, ver);
}
