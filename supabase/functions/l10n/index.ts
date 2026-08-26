/* `l10n` — 몽골어 문구 감수자 통로. 정본 = `docs/검수_내부계약.md` §1 의 «외부 검수자» 갈래.
 *
 * ■ 🔴 왜 `review` 에 경로를 더하지 않고 함수를 «따로» 세웠나 — 이 파일의 절반이 그 판단이다
 *   `review` 는 `['inspector','director']` 로 문 하나를 지킨다. 몽골어 감수자에게 `inspector` 를
 *   주면 **학생 발화 큐에도 그대로 통과한다** — 그 사람은 외부 계약자다.
 *   경로별로 역할을 갈라 막을 수도 있지만, 그것은 검수 계약 §0 이 「새는 방향이 언제나 통과」라며
 *   기각한 구조다: 경로가 하나 늘 때마다 «이 경로엔 누구까지» 를 사람이 기억해야 하고,
 *   빠뜨린 쪽은 조용히 열린다.
 *   👉 그래서 **자원부터 가른다.** 이 함수가 닿는 표(`l10n_strings`·`l10n_reviews`)에는 학생
 *      식별자가 한 칸도 없다(20260826130000). 감수자는 학생 데이터에 **원리상** 못 닿는다 —
 *      권한 설정이 아니라 스키마가 그것을 진다. 이 파일에 `submissions`·`learners`·`corrections`
 *      라는 낱말이 없는 것이 그 증거이고, 🚫 앞으로도 넣지 않는다.
 *
 * ■ 🔴 조회 감사(`staff_access_log`)를 **안 남긴다** — 빠뜨린 것이 아니라 판정이다
 *   그 장부의 존재 이유는 「학생 데이터를 누가 열었나」다(L0 §4-5 ④). 여기엔 학생 데이터가
 *   없으므로 행을 남기면 그 장부의 뜻이 흐려진다 — 「열람 감사」가 곧 「학생 접근」이라는 등식이
 *   깨지고, 그 등식 위에 선 승인 게이트·감사 표본 판정이 함께 무뎌진다.
 *   🔑 대신 **판정 이력은 `l10n_reviews` 가 append-only 로 쥔다**(누가·언제·무엇을·왜).
 *      잃는 것은 「누가 큐를 읽기만 했나」 하나이고, 그것은 이 자원에서 위험이 아니다.
 *
 * ■ 함수는 하나, 경로가 셋
 *   `GET  /v1/l10n/queue`   감수할 문장 (정렬축 = string_id 하나 · 커서도 하나)
 *   `POST /v1/l10n/verify`  확정 (판정 1행 + 문장 상태 전이 — 한 트랜잭션)
 *   `GET  /v1/l10n/export`  확정본 (도구가 부른다 — 파일로 내리는 마지막 한 칸)
 *   🚫 `action` 파라미터로 가르지 않는다(경로가 이미 그 일을 한다 · 검수 계약 §0 과 같은 축).
 *
 * ■ 🔑 `export` 가 이 통로의 «완결»이다
 *   감수 결과가 DB 에만 남으면 마지막 한 칸이 사람 손이 된다 — 그것이 슬랙 감수를 기각한
 *   바로 그 이유였다(결정.md 08-26 「수집은 엔진 도달까지 한 벌」). 이 경로가 있어야
 *   `tools/문구내보내기.js` 한 줄로 파일까지 간다.
 */

import postgres from 'npm:postgres@3.4.4';
import 토큰모듈 from './토큰.mjs';
import 계약판모듈 from './계약판.mjs';
import 감수모듈 from './문구감수.mjs';

const { 토큰주체 } = 토큰모듈 as { 토큰주체: (req: Request) => string | null };
const { 행들에서판, 앞선판인가 } = 계약판모듈 as {
  행들에서판: (행들: unknown) => string | null;
  앞선판인가: (앞: unknown, 뒤: unknown) => boolean;
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

const { 발급시각, 살아있는직원 } = 토큰모듈 as {
  발급시각: (req: Request) => number | null;
  살아있는직원: (질의: typeof sql, 주체: string, iat: number | null) => ReturnType<typeof sql>;
};

type 요청검증 = { 값: Record<string, never> | null; 이유: string | null; 칸: string | null };
const { 쪽크기, 커서, 확정요청, 상태전이, 내보내기질의 } = 감수모듈 as {
  쪽크기: (raw: string | null) => { 값: number | null; 이유: string | null };
  커서: (raw: string | null) => { 값: string | null; 이유: string | null };
  확정요청: (본문: unknown) => 요청검증;
  상태전이: (verdict: string) => string;
  /* 내보내기 질의는 이 함수와 `tools/문구내보내기.js` 가 **같은 문자열**을 돌린다 —
     문은 둘이되(세션 있는 화면 · 세션 없는 CLI) 질의는 하나다. */
  내보내기질의: string;
};

/* 🔑 **허용 목록**이다(차단 목록이 아니다 — 못 적은 역할이 새는 방향은 언제나 「통과」다).
 *   `director` 가 있는 까닭은 `review` 와 같다: 감수자 확보는 9~10월이고 그때까지 이 통로를
 *   쓸 사람이 원장 본인뿐이다. 빼면 오늘 이 문을 열 수 있는 사람이 0명이다.
 *   🚫 `inspector` 는 **안 넣는다** — 학생 발화 검수자와 문구 감수자는 다른 사람이고, 넣는
 *      순간 「자원부터 가른다」는 이 함수의 전제가 반대편에서 무너진다. */
const 감수역할 = ['l10n_reviewer', 'director'];

type 오류 = { code: string; message: string; retryable: boolean; field?: string };

/* 코드→상태를 **한 자리에 리터럴로** 둔다(`review` 와 같은 사유 둘 — 같은 판정을 두 곳에 적으면
 * 갈라지고, 변수로 흘리면 계약 대조 검사가 리터럴을 못 세어 눈이 먼다). */
const 거절상태 = {
  NOT_FOUND: 404,
  CONTRACT_VIOLATION: 400,
  SUPERSEDE_CONFLICT: 409,
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
const 거절 = (code: 거절코드, message: string, ver: string, field?: string) =>
  실패(거절상태[code], { code, message, retryable: code === 'INTERNAL', field }, ver);

async function 본문읽기(req: Request): Promise<unknown | undefined> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

Deno.serve(async (req: Request) => {
  const 선언 = req.headers.get('X-Contract-Ver') ?? '';
  if (!선언) {
    return 실패(400, { code: 'CONTRACT_VER_MISSING', message: 'X-Contract-Ver 헤더가 없습니다', retryable: false }, 선언);
  }
  if (!/^c\d+$/.test(선언)) {
    return 실패(426, { code: 'CONTRACT_VER_UNSUPPORTED', message: `계약판 형식이 아닙니다: ${선언}`, retryable: false }, 선언);
  }

  /* 뒷마디로 가른다 — 안 보면 `/l10n/아무거나` 가 전부 큐 조회로 동작한다(`review` 와 같은 축). */
  const url = new URL(req.url);
  const 경로 = url.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  const 아는경로 = ['queue', 'verify', 'export'];
  if (!아는경로.includes(경로)) {
    return 실패(404, {
      code: 'CONTRACT_VIOLATION', retryable: false,
      message: '없는 경로입니다 — GET /v1/l10n/{queue,export} · POST /v1/l10n/verify',
    }, 선언);
  }
  const 기대메서드 = 경로 === 'verify' ? 'POST' : 'GET';
  if (req.method !== 기대메서드) {
    return 실패(405, { code: 'CONTRACT_VIOLATION', message: `${기대메서드} 만 받는다`, retryable: false }, 선언);
  }

  const 주체 = 토큰주체(req);
  if (!주체) return 실패(401, { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다', retryable: false }, 선언);

  /* 직원 확정과 DB 계약판을 한 번에 읽는다(왕복 1회 · `review` 와 같은 사슬).
   * 🔴 `service_role` 은 RLS 를 우회하므로 이 사슬이 유일한 방어선이다. */
  const [행] = await sql`
    select (select staff_id from engine.staff
             where ${살아있는직원(sql, 주체, 발급시각(req))}
               and role = any(${감수역할}::text[])) as staff_id,
           (select name from engine.schema_migrations order by version desc limit 1) as 최신조각`;

  const ver = 행들에서판(행);
  if (!ver) {
    console.error('[l10n] DB 계약판을 못 읽었다', 행?.최신조각);
    return 실패(500, { code: 'INTERNAL', message: '서버 설정 오류입니다', retryable: true }, 선언);
  }
  if (앞선판인가(선언, ver)) {
    return 실패(426, {
      code: 'CONTRACT_VER_UNSUPPORTED', retryable: false,
      message: `서버가 아직 ${선언} 을 모릅니다(현재 ${ver}) — 잠시 뒤 다시 시도해 주세요`,
    }, ver);
  }

  /* 🔑 「직원이 아니다」와 「폐기됐다」와 「역할이 다르다」를 **같은 코드**로 묶는다 —
   *   가르면 응답 자체가 「그 계정은 있다」를 말한다(`review` §1 과 같은 판정). */
  if (!행?.staff_id) {
    return 실패(403, { code: 'NOT_STAFF', message: '문구 감수 권한이 없습니다', retryable: false }, ver);
  }
  const staff_id: string = 행.staff_id;

  try {
    if (경로 === 'queue') return await 큐읽기(url, ver);
    if (경로 === 'export') return await 확정본(ver);
    const 본문 = await 본문읽기(req);
    if (본문 === undefined) {
      return 거절('CONTRACT_VIOLATION', 'JSON 이 아닙니다', ver);
    }
    return await 확정(본문, staff_id, ver);
  } catch (e) {
    console.error(`[l10n/${경로}] 실패`, String((e as Error)?.message ?? e));
    return 실패(500, { code: 'INTERNAL', message: '잠시 뒤 다시 시도해 주세요', retryable: true }, ver);
  }
});

/* ── GET /v1/l10n/queue ──────────────────────────────────────────────────
 * 정렬축은 **`string_id` 하나**다. 검수 큐처럼 감사표본·저신뢰 축이 없기 때문이기도 하지만,
 * 그보다 id 순이면 **같은 화면의 문구가 붙어 나온다** — 감수자가 맥락을 쥔 채 판정한다
 * (「이 버튼과 저 버튼이 같은 말을 다르게 하고 있다」는 그렇게만 보인다).
 * 축이 하나라 커서도 하나이고, PK 라 동률이 원리상 없다. */
async function 큐읽기(url: URL, ver: string) {
  const 쪽 = 쪽크기(url.searchParams.get('limit'));
  if (쪽.값 === null) return 거절('CONTRACT_VIOLATION', 쪽.이유!, ver, 'limit');
  const c = 커서(url.searchParams.get('after'));
  if (c.이유) return 거절('CONTRACT_VIOLATION', c.이유, ver, 'after');

  /* 🔴 판(`engine.l10n_queue`)을 읽는다 — 원표가 아니다. 판에 없는 열이 정말 필요하면
     뷰와 회귀를 같이 고친다(그 자리가 「감수자가 봐도 되나」의 판정 지점이다). */
  const 행들 = c.값
    ? await sql`select * from engine.l10n_queue where string_id > ${c.값} order by string_id limit ${쪽.값}`
    : await sql`select * from engine.l10n_queue order by string_id limit ${쪽.값}`;

  const 마지막 = 행들.length ? 행들[행들.length - 1].string_id : null;
  return 봉투(200, {
    ok: true,
    data: 행들,
    /* 🔑 다음 쪽이 «있는지»를 서버가 단정하지 않는다 — 한 쪽을 꽉 채웠을 때만 커서를 준다.
       (마지막 쪽이 정확히 limit 개면 빈 쪽을 한 번 더 받는데, 그것이 「없다」를 잘못 말하는
       것보다 싸다 — 화면은 빈 응답을 끝으로 읽으면 된다.) */
    next: 행들.length === 쪽.값 ? 마지막 : null,
  }, ver);
}

/* ── POST /v1/l10n/verify ────────────────────────────────────────────────
 * 한 트랜잭션에 둘: ①판정 1행 insert ②문장 상태 전이. 나누면 「판정은 남았는데 큐에 그대로」
 * 또는 그 반대가 되고, 둘 다 사람이 눈으로만 발견한다. */
async function 확정(본문: unknown, staff_id: string, ver: string) {
  const v = 확정요청(본문);
  if (!v.값) return 거절('CONTRACT_VIOLATION', v.이유!, ver, v.칸 ?? undefined);
  const 요청 = v.값 as unknown as {
    string_id: string; verdict: string; final_mn: string | null;
    note: string | null; supersedes: string | null;
  };

  try {
    const 결과 = await sql.begin(async (tx) => {
      /* 🔴 문장 행을 **먼저 잠근다** — 같은 문장에 대한 동시 확정이 직렬화된다.
         두 번째 요청은 상태를 다시 읽어 「이미 끝난 문장」으로 떨어진다. */
      const [문장] = await tx`
        select string_id, status from engine.l10n_strings
         where string_id = ${요청.string_id} for update`;
      if (!문장) return { 코드: 'NOT_FOUND' as const };
      if (문장.status !== 'pending') return { 코드: 'NOT_FOUND' as const };

      if (요청.supersedes) {
        /* 재감수 — 대체 대상이 그 문장의 것이어야 하고, **아직 대체되지 않았어야** 한다.
           계보가 갈리면 「마지막 한 행」이 둘이 된다(검수 계약 §5-1 과 같은 사고 모양). */
        const [앞] = await tx`
          select review_id from engine.l10n_reviews
           where review_id = ${요청.supersedes} and string_id = ${요청.string_id}`;
        if (!앞) return { 코드: 'NOT_FOUND' as const };
        const [이미] = await tx`
          select 1 from engine.l10n_reviews where supersedes = ${요청.supersedes}`;
        if (이미) return { 코드: 'SUPERSEDE_CONFLICT' as const };
      }

      const [난것] = await tx`
        insert into engine.l10n_reviews (string_id, reviewer, verdict, final_mn, note, supersedes)
        values (${요청.string_id}, ${staff_id}, ${요청.verdict},
                ${요청.final_mn}, ${요청.note}, ${요청.supersedes})
        returning review_id, created_at`;

      const 새상태 = 상태전이(요청.verdict);
      await tx`
        update engine.l10n_strings
           set status = ${새상태}, updated_at = now()
         where string_id = ${요청.string_id}`;

      return { 코드: 'OK' as const, review_id: 난것.review_id, created_at: 난것.created_at, 새상태 };
    });

    if (결과.코드 === 'NOT_FOUND') {
      return 거절('NOT_FOUND', '그 문장이 지금 큐에 없습니다(이미 끝났거나 없는 id 입니다)', ver, 'string_id');
    }
    if (결과.코드 === 'SUPERSEDE_CONFLICT') {
      return 거절('SUPERSEDE_CONFLICT', '그 판정은 이미 다른 재감수로 대체됐습니다', ver, 'supersedes');
    }
    return 봉투(200, {
      ok: true,
      data: { review_id: 결과.review_id, created_at: 결과.created_at, status: 결과.새상태 },
    }, ver);
  } catch (e) {
    /* DB CHECK 가 막은 것(배타성·닫힌 어휘)은 우리 잘못이 아니라 요청의 모양 문제다 —
       500 으로 삼키면 부르는 쪽이 무엇을 고쳐야 할지 모른다. */
    const 메시지 = String((e as Error)?.message ?? e);
    if (/l10n_reviews_(verdict|final_paired|supersedes_not_self)_c13/.test(메시지)) {
      return 거절('CONTRACT_VIOLATION', '요청이 판정 규칙에 어긋납니다', ver);
    }
    throw e;
  }
}

/* ── GET /v1/l10n/export ─────────────────────────────────────────────────
 * 문장마다 **마지막 판정 한 행**만 낸다(append-only 라 여러 행이 산다).
 * 🔑 「원문을 고쳐야 한다」로 끝난 것도 싣는다 — 그것을 빼면 내보내기 파일만 보는 사람에게는
 *   그 문장이 **아직 감수 전인 것처럼** 보인다. 대신 verdict 를 실어 갈래를 알린다. */
async function 확정본(ver: string) {
  /* 🔑 질의는 `lib/문구감수.js` 가 쥔다 — `tools/문구내보내기.js` 가 **같은 문자열**을 돌린다.
   *   여기 리터럴로 되돌리면 두 벌이 되고, 갈라진 쪽은 조용하다(회귀 ⑪ 이 그것을 막는다). */
  const 행들 = await sql.unsafe(내보내기질의);
  return 봉투(200, { ok: true, data: 행들, count: 행들.length }, ver);
}
