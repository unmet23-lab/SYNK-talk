/* 배달 배치 — P0 §6「하루 한 문장」. 전날 밤에 학생마다 1건을 큐에 넣는다.
 *
 * ■ 큐의 실체는 새 테이블이 아니다 (P0 §6-1 · F124)
 *   `task.assigned` 사건 + 그 `submissions.task_snapshot` 이 곧 큐다. 앱은 「오늘 날짜의 내
 *   `task.assigned` 1건」을 읽는다(C0 §4-3 ①). 발주가 여기서 테이블을 만들면 그게 정확히
 *   `발주_수집파이프라인` 이 한 번 겪은 사고다(새 3테이블이 전부 기존 테이블의 재발명).
 *
 * ■ `task_snapshot` 을 payload 가 아니라 `submissions` 에 싣는 이유
 *   계약(`수집_교정_계약.json` 필드층)이 `task_snapshot` 을 **「내용」층**에 두었고, 그 층의
 *   물리 자리는 `engine.submissions` 다. payload 로 옮기려면 C0 §4-1 의 허용 payload 목록
 *   개정(=계약 새 판)이 필요한데, **계약을 안 바꾸고 서는 길이 이미 있다.**
 *   ⚠ 대신 「제출 수」를 셀 때 반드시 `learning_events.event_type` 으로 걸러야 한다 —
 *     `count(submissions)` 로 세면 배정이 제출로 세어진다. 왕복시험이 그 자리를 지킨다.
 *
 * ■ 행의 `task_format` 은 비운다
 *   배정 1건에 ②낭독 + ③자유발화 두 형식이 들어간다(P0 §2-1). 한 칸에 담으면
 *   「낭독 데이터로 회화 모델을 학습」이 배정 단계에서 성립한다. 형식은 호흡마다 적는다.
 *
 * ■ AI 문장 생성은 c12 생성 트랙으로 가동 중 — 활성 학급 한정(`engine.gen_active_from` 게이트
 *   · 활성 «전» 날짜는 라이브 경로가 진 날) · 경로는 `생성모드.ts`(생성배달·구제배달 — 38행
 *   import 가 그 실물). 비활성·생성 실패는 §6-4 강등이 그대로 받는다: 전날 문장 → 없으면
 *   고정 도입 과제 · **`degraded=true`**. 판정은 `lib/오늘과제.js` 가 지고 회귀가 DB 없이 잰다.
 *
 * ■ 호출자
 *   `pg_cron` 이 `Authorization: Bearer <service_role>` 로 부른다. 학생 토큰은 여기 못 들어온다
 *   (`intervention.delivered`·`task.assigned` 는 `이벤트검증` 의 **서버사건**이다).
 */
import postgres from 'npm:postgres@3.4.4';
import 과제모듈 from './오늘과제.mjs';
import 출처모듈 from './사건출처.mjs';
import 토큰모듈 from './토큰.mjs';
import 상태모듈 from './학습자상태.mjs';
import 회수모듈 from './성과회수.mjs';
import 게임모듈 from './게임배정.mjs';
import 라디오태스크모듈 from './라디오태스크.mjs';
import 계약판모듈 from './계약판.mjs';
import CORS모듈 from './CORS.mjs';
import { 생성배달, 구제배달 } from './생성모드.ts';

const { 예비응답 } = CORS모듈 as {
  예비응답: (req: Request, 메서드?: string) => Response | null;
  머리: () => Record<string, string>;
};

const { 행들에서판 } = 계약판모듈 as { 행들에서판: (행들: unknown) => string | null };

/* 게임 갈래 — 판정은 전부 lib 이 지고(발주 §6-6 ⑩·⑪) 여기는 행만 만든다.
 * `재제출의사`·챌린지·앵커 목록은 H3 조인의 술어 값이다 — 리터럴을 여기 적으면 계약·팩과
 * 두 곳에 살고, 갈라진 날 재제출 조인은 오류 없이 0건이 된다.
 * `시드전부`·`G2재제출앵커들` 은 「⑤가 실제로 세울 수 있는 원 제출」의 정본 목록이다 — 조인이
 * limit 1 이라 세울 수 없는 원 제출(G2 대조 문항·팩에서 사라진 시드)이 최신이면 걷힐 수 있는
 * 재제출까지 그늘로 가리므로, SQL 이 그 목록으로 거른다(근거는 lib/게임배정.js 목록 머리말). */
const { 게임배정, 재제출의사, 게임챌린지, G2챌린지, 시드전부, G2재제출앵커들 } = 게임모듈 as {
  재제출의사: string;
  게임챌린지: string;
  G2챌린지: string;
  시드전부: readonly string[];
  G2재제출앵커들: readonly string[];
  게임배정: (재료: Record<string, unknown>) => {
    task_ref: string; task_type: string; task_snapshot: Record<string, unknown>;
    task_schema_ver: string; retry_of_event_id: string | null; degraded: boolean; 출처: string;
  } | null;
};

const { 서비스역할, 토큰주체, 발급시각 } = 토큰모듈 as {
  서비스역할: (req: Request) => boolean;
  토큰주체: (req: Request) => string | null;
  발급시각: (req: Request) => number | null;
};
const { 사건출처 } = 출처모듈 as { 사건출처: (event_type: string) => string | null };
/* 라디오 승격 제출을 **fetch 전에** 뺀다(재반박 새 치명 ① — 정본 lib/라디오태스크.js).
 * lib v6 필터는 fetch «뒤»라, 라디오 제출이 같은 event_type 칸(submission.created)의 종별
 * 상한을 먼저 채우면 앱 제출이 창에서 잘려 나간 «뒤에» 필터가 남은 라디오 행을 버린다 —
 * 제출률이 반대로(과소) 거짓말한다(재현: 라디오 20건/일 → 1.00 이 0.23). 어떤 축도 라디오
 * `submission.created` 를 안 쓰므로(리듬·끈기=앱만 · 작성과정=compose_meta 없음) 여기서
 * 빼는 것은 신호 손실 0 이고, lib 필터는 다른 호출자(성과계기판)의 방어로 남는다.
 * ⚠ where 절의 `task_type is not null` 은 장식이 아니다(3차 반박) — SQL 3값논리에서
 * `null = any(...)` 는 NULL 이고 `not (true and null)` 도 NULL 이라, 그 줄이 없으면
 * **task_type 없는 옛 앱 제출이 통째로 버려진다**(lib 필터의 `includes(null)=false` 와
 * 같은 뜻을 SQL 로 못박는 줄이다 — 회귀 v6 「옛 행은 그대로 센다」의 SQL 층 짝). */
const { 라디오태스크종 } = 라디오태스크모듈 as { 라디오태스크종: string[] };
/* 사슬 ⑦칸(엔진이 배운다)의 첫 소비자. 🔴 상태를 **저장하지 않는다** — 계산해서 그 개입
 * 사건에 스탬프한다(엔진도달_설계 §3 경로 A · 제품방향 불변식 6 「🚫C·D 파생 테이블 지금 신설」).
 * `창일수`·`쓰는사건` 은 아래 질의가 **가져다 쓴다**: 여기 다시 적으면 축을 늘린 날 코드는
 * 그 사건을 세려는데 질의가 안 실어 주고, 증상은 값이 조용히 낮아지는 것뿐이다. */
const { 학습자상태, 창일수 } = 상태모듈 as {
  창일수: number;
  쓰는사건: string[];
  학습자상태: (사건들: unknown[], 옵션: { as_of: string; ingested_as_of?: string; 시간대?: string }) => {
    estimator_version: string; estimator_confidence: number;
    evidence_refs: Record<string, unknown>; 축: Record<string, unknown>;
  };
};
/* 사슬 ⑦칸의 **남은 절반** — 개입이 실제로 닿았고 그 뒤에 무엇이 달라졌나.
 * 🔴 2026-08-12 까지 이 모듈의 런타임 호출부는 **0줄**이었다(손 CLI 하나뿐 · 엔진도달_설계 §2 ⑦행).
 *   그리고 부르려 해도 못 부르는 상태였다 — 아래 질의가 **닻(`intervention.delivered`)도
 *   관측(`content.viewed`)도 안 실었고, 고리 칸(`parent_event_id`)도 없었다.** 셋 다 증상이
 *   「효과 없음」 하나뿐인 조용한 실패라, 붙이는 김에 한 커밋에서 같이 닫는다.
 * 🔑 `걷는사건` 을 여기서 파생시키는 이유 = 그것이 **합집합의 정본**이기 때문이다
 *   (회수 = 닻 + 관측 + 상태가 쓰는 것 전량). 상태 쪽에 축을 하나 늘리면 그 목록이 저절로
 *   따라오고, 질의는 손댈 데가 없다. 여기에 배열을 다시 적으면 그 연결이 끊긴다. */
const { 회수요약, 쓰는사건: 걷는사건 } = 회수모듈 as {
  쓰는사건: string[];
  회수요약: (사건들: unknown[], 옵션: { 기준시각: string | Date }) => {
    개입: number; 닿음: number; 고리없음: number; 연결률: number | null;
    창별: Record<string, { 측정: number; 미도래: number; 표본0: number }>;
    기술: { 겨냥개입: number; 관측있음: number; 관측수: number };
  };
};
/* 🔴 `시간대` 를 **가져다 쓴다** — IANA 이름을 여기에 다시 적으면 그 순간 날짜 경계가 두 곳에
 *   살고, 갈라진 날 배치는 오늘에 쓰고 조회는 어제를 센다(절단문서 ①-14 · 회귀가 막는다). */
const { 몽골날짜, 멱등키, 오늘과제, 따라말하기문장, 따라말하기출처, 시간대 } = 과제모듈 as {
  시간대: string;
  몽골날짜: (때?: Date) => string;
  멱등키: (종류: string, learner_id: string, 날짜: string) => string;
  오늘과제: (재료: Record<string, unknown>) => {
    task_snapshot: Record<string, unknown>; task_ref: string; degraded: boolean; 출처: string;
    /* 고른 자가 서명한 «선택 규칙의 판». 🔴 상수를 여기서 import 해 박지 않는다 — 그러면
     * 「무슨 규칙이 골랐나」가 두 곳에 살고, 갈라진 날 행에는 고른 적 없는 이름이 찍힌다. */
    policy_ver: string;
  };
  따라말하기문장: (snap: unknown) => string | null;
  따라말하기출처: (snap: unknown) => string | null;
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 배정이 여는 통로는 「발화녹음」이다(계약 값목록). `submissions.task_type` 이 not null 이라
 * 배정 행도 통로를 말해야 하고, 그날 학생이 낼 것이 실제로 그것이다. */
const 통로 = '발화녹음';

/* 학생 한 명에게서 걷는 원신호 상한 — **사건 종류별**이다(반박 c757278 치명 ⑥). 전체 500 으로
 * 눌렀더니 하루 상한이 없는 라디오 명령(선호·정서)이 창을 채우면 오래된 task.assigned·제출이
 * 잘려 **리듬 분모가 조용히 줄었다** — 한 종의 폭주가 다른 종의 신호를 밀어내는 방향만 막으면
 * 되므로 칸을 종류로 가른다. 150 = 창 30일 × 하루 5건까지 전량(그 위는 최신 우선 — 값이 아니라
 * 방어라는 성격은 그대로다. 총량은 종 수 × 이 값으로 유계). */
const 종별상한 = 150;

const 봉투 = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS모듈.머리() } });

Deno.serve(async (req: Request) => {
  /* 🔴 preflight 는 **어떤 검사보다 앞**이다 — 커스텀 헤더를 안 싣고 오므로 계약판 검문에
   걸려 죽는다(08-27 실측: 그 400 은 게이트웨이가 아니라 우리 코드가 냈다 · `lib/CORS.js`). */
  const 예비 = 예비응답(req);
  if (예비) return 예비;
  /* 호출자는 **JWT 의 `role` 로** 가른다 — 키 문자열 비교가 아니다(정본 `lib/토큰.js`).
   * 서명 검증은 플랫폼이 이미 했지만(`verify_jwt=true`) 그건 **anon 키도 통과시킨다**. */
  const 오늘 = 몽골날짜();
  const 인자 = new URL(req.url).searchParams;
  const 점검 = 인자.has('점검');

  /* 쓰기(배달)는 `service_role` 하나다. **읽기(점검)만 원장에게 연다** — §6-5 가 정한 「보는 눈」이
   * 원장 화면인데 앱 토큰은 절대 `service_role` 이 아니라, 안 열면 미달은 영원히 함수 로그에만 뜬다
   * (그리고 그 로그를 보는 사람이 0이면 배치가 죽은 날과 안 죽은 날이 같은 모양이다).
   * 🔴 갈리는 자리를 **여기 하나**로 둔다 — 두 함수가 각자 재면 그 중 한 곳이 빠지는 날 배달까지
   *   원장에게 열리고, 새는 방향은 언제나 「통과」다.
   * 🔑 원장인지는 이 파일이 안 정한다 — `engine.current_staff()` 가 정본이고 폐기(`revoked_before`)
   *   까지 그 안에서 본다. 여기서 `engine.staff` 를 직접 읽으면 그 판정이 둘로 갈린다. */
  if (!서비스역할(req) && !(점검 && await 원장인가(req))) {
    return 봉투(401, { ok: false, error: { code: 'AUTH_REQUIRED', message: '배치 호출 권한이 없습니다' } });
  }

  /* 단건 모드 — 첫 등록 직후 `auth` 가 그 학생 하나만 세우려고 부른다(N23 · 유호님 확정 08-08).
   * 배치는 하루 1회라 등록 당일 낮에 앱을 켠 학생에게는 배정이 없고, 그때 앱은 폴백 화면으로
   * 내려가 **발화를 서버로 보내지 않는다**(lib/오늘과제.js 화면과제). 그 하루가 곧 「입학 첫날
   * 목소리」이고 소급이 안 된다.
   * 🔑 새 경로가 아니라 **같은 `한명()` 을 대상만 좁혀 부르는 것**이다 — 배정을 만드는 코드가
   *   둘이 되면 그 둘은 갈라지고, 갈라진 쪽이 낸 행은 계약 밖 모양이 된다. */
  const 한사람 = 인자.get('learner_id');
  if (한사람 !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(한사람)) {
    return 봉투(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'learner_id 가 uuid 가 아닙니다' } });
  }
  /* `맥락`(§3-1 v5.8 — 활성 뒤엔 «필수» · 누락도 목록 밖과 같이 400) — 검증은 활성 게이트 안에서
   * 한다(`배달하기`): 활성 «전» 라이브 호출자(cron·auth·왕복시험)는 이 인자를 아직 안 붙인다. */
  const 맥락 = 인자.get('맥락');
  if (맥락 !== null && 맥락 !== '배치' && 맥락 !== '구제') {
    return 봉투(400, { ok: false, error: { code: 'BAD_REQUEST', message: '맥락은 배치·구제 뿐입니다' } });
  }

  try {
    return 점검 ? await 점검하기(오늘) : await 배달하기(오늘, 한사람, 맥락);
  } catch (e) {
    const 글 = String((e as Error)?.message ?? e);
    console.error('[deliver] 실패', 글);
    return 봉투(500, { ok: false, date: 오늘, error: { code: 'SERVER_ERROR', message: 글.slice(0, 300) } });
  }
});

/* 이 토큰이 **원장인가** — `auth` 의 `/reset` 과 같은 절차다(L0 §4-5 · 판정 정본은 DB).
 *
 * 🔴 `set_config` 의 셋째 인자 `true` 는 **트랜잭션 지역**이다. 밖에서 부르면 커넥션이
 *   재사용될 때 남의 주장이 살아 있고, 그 다음 요청은 앞사람 권한으로 통과한다.
 * 🔑 `current_staff()` 는 못 찾아도 **전 칸이 null 인 행 하나**를 낸다 — 「행이 없다」가 아니다.
 *   그래서 존재가 아니라 `role` 값을 본다(행 유무로 재면 아무나 통과한다).
 * 🔑 실패는 전부 `false` 다 — 못 읽은 토큰·없는 직원·DB 오류가 「원장」이 되는 갈래를 안 만든다. */
async function 원장인가(req: Request): Promise<boolean> {
  const 주체 = 토큰주체(req);
  if (!주체) return false;
  const iat = 발급시각(req);
  try {
    return await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${
        JSON.stringify({ sub: 주체, role: 'authenticated', iat })}, true)`;
      const [직원] = await tx`select role from engine.current_staff()`;
      return !!직원 && 직원.role === 'director';
    });
  } catch (e) {
    console.error('[deliver] 원장 판정 실패', String((e as Error)?.message ?? e));
    return false;
  }
}

/* 🔴 §6-5 — 배치가 **안 돈 것**은 강등으로 잡히지 않는다.
 *   전원이 며칠 고정 과제로 돌아도 증상은 조용하고, 그걸 보는 눈은 원장 주 1회 화면뿐이다.
 *   배치 예정 시각 +30분에 이 모드로 한 번 더 부른다: 오늘 배정 수 < 재적 수면 미달이다.
 *   S1 구간의 수신자는 유호님 한 명이라 별도 발송 통로를 만들지 않는다 — 로그 1행 + 응답. */
async function 점검하기(오늘: string) {
  /* 🔴 **배정일의 정본은 `occurred_at` 이 아니라 멱등키의 셋째 마디다** (2026-08-22 수리).
   *   `멱등키` 정본 = `lib/오늘과제.js` 의 `종류:learner:날짜` 이고, 생성 트랙의 착지 SQL
   *   (마이그 20260821120000 jobs_land)도 같은 글자를 쓴다. `occurred_at` 은 «행이 실제로
   *   앉은 시각»이라 배정일과 갈릴 수 있고, 갈리는 순간 이 칸은 **조용히** 틀린다:
   *     · 배치가 자정을 넘겨 끝나면 뒤쪽 학생의 occurred_at 은 «내일»이라, 다 돈 날이 미달로
   *       뜬다. (마감 `due_at` 은 이미 이 함정을 피해 `오늘` 을 쓴다 — 점검만 남아 있었다.)
   *     · 반대로 오늘 앉았지만 «다른 날» 배정인 행(구제·재적재·픽스처)이 오늘 분자에 섞인다.
   *   🔑 실측이 그 둘째 갈래를 잡았다(2026-08-22 리허설): 생성왕복시험 픽스처가 배정일
   *     2030-01-xx 를 «지금» 시각으로 앉히자 분자 741 > 분모 693 이 되어 **미달이 영영
   *     false** 였다 — §6-5 의 유일한 눈이 꺼진 채로 「정상」을 보고했다. 새는 방향이 「통과」다.
   * 🔑 분자와 분모의 **단위**도 맞춘다 — 분모는 학생 수인데 분자는 행 수였다. 키는 학생·날짜당
   *   유일(`learning_events_learner_id_idempotency_key_key`)이라 이 셈이 곧 학생 수다.
   * ⚠ 키 글자를 여기 적는 이유 — 집합 질의라 학생마다 `멱등키()` 를 부를 수 없다(생성 트랙
   *   마이그가 같은 글자를 쓰는 것도 같은 사정이다). 셋이 갈리면 이 칸은 0 을 세고 미달이
   *   **항상 참**이 된다 — 그건 시끄러운 방향이라 조용히 죽지는 않는다.
   * ⚠ 천장: 이 술어는 인덱스를 못 탄다(두 열을 이어 붙인 식). 옛 판의 `at time zone` 식도
   *   같은 전량 스캔이라 지금 바뀐 것은 없고, 학급이 수십만 행이 되는 날 여기에 식 인덱스가
   *   필요해진다 — 그때는 스키마 레인의 일이다. */
  const [r] = await sql`
    select (select count(*) from engine.learners) as 재적,
           (select count(*) from engine.learning_events
             where event_type = 'task.assigned'
               and idempotency_key = 'task:' || learner_id::text || ':' || ${오늘}) as 배정,
           (select count(*) from engine.learning_events
             where event_type = 'task.assigned' and degraded
               and idempotency_key = 'task:' || learner_id::text || ':' || ${오늘}) as 강등`;
  const 재적 = Number(r.재적), 배정 = Number(r.배정), 강등 = Number(r.강등);
  const 미달 = 배정 < 재적;
  if (미달) console.error(`[deliver] 🔴 배치 미달 — ${오늘} 배정 ${배정}/${재적}`);
  return 봉투(200, { ok: true, mode: '점검', date: 오늘, 재적, 배정, 강등, 미달 });
}

/** 학급과 재료를 «한 번에» — 배달(현행)과 생성 모드(§3 ① 선판정)가 **같은 재료**로 같은
 *  결정을 내게 하는 자리다(두 벌로 적으면 「전원」과 「생성」이 다른 학급을 본다). */
/** 학급 전량을 **한 배열로** 받는다 — 소비자가 전량을 한꺼번에 봐야 하는 자리(생성 모드)용.
 *  🔑 전원 배달(현행)은 이걸 안 쓰고 아래 `대상질의` 를 커서로 «흘린다» — 이유는 그 자리 주석. */
async function 대상조회(스냅기준: string, 한사람: string | null) {
  return await 대상질의(스냅기준, 한사람);
}

/** 같은 질의를 **await 하지 않고** 낸다 — 부르는 쪽이 `.cursor()` 로 흘릴 수 있게.
 *  🔴 질의문이 여기 하나뿐인 것이 요점이다: 전원과 생성이 다른 SQL 을 보면 같은 학급을 두 재료로
 *    읽게 되고, 갈라진 쪽은 오류 없이 «다른 결정»을 낸다(위 `대상조회` 머리말과 같은 축). */
function 대상질의(스냅기준: string, 한사람: string | null,
                 쪽: { 뒤: string | null; 한도: number } | null = null) {
  /* 단건이면 대상만 좁힌다 — 재료를 만드는 lateral 셋은 **그대로 탄다**(첫날 판정·교정문·동의).
   * 좁히는 자리를 여기 하나로 두면 「전원」과 「한 명」이 같은 재료로 같은 결정을 낸다. */
  /* 꼬리 한 자리에서 «누구를» 을 정한다 — 단건이면 하나, 쪽이면 그 구간, 아니면 전량.
   * 🔑 세 갈래가 **같은 본문**을 지나는 것이 요점이다(위 머리말) — 여기만 갈린다.
   * 🔑 키셋(learner_id 오름차순)은 `learners_pkey` 를 그대로 탄다 — offset 처럼 앞쪽을
   *   다시 읽지 않으므로 쪽이 뒤로 갈수록 느려지지 않는다. */
  const 좁히기 = 한사람
    ? sql`where l.learner_id = ${한사람}::uuid`
    : 쪽
      ? sql`where l.learner_id > ${쪽.뒤 ?? '00000000-0000-0000-0000-000000000000'}::uuid
            order by l.learner_id limit ${쪽.한도}`
      : sql``;
  /* 학생과 재료를 **한 번에** 읽는다(학생 수만큼 왕복하지 않는다).
   * · 마지막 배정 = 「첫날인가」와 「전날 문장」의 근거
   * · 교정문 = **지난 배정 뒤에 새로 확정된 것**만. 「최신 1건」으로 잡으면 같은 교정문이
   *   매일 ②슬롯에 다시 오고, 그건 §6-3 이 말한 「어제 나간 교정」이 아니다.
   * · 동의 = 지금 유효한 것. 없으면 배정하지 않는다(consent_ver 는 not null) — 그 학생은
   *   건너뛴 채 §6-5 미달로 드러난다. 동의 없이 배정하는 우회로를 만들지 않는다. */
  return sql`
    select l.learner_id, l.level_current, l.goal_track,
           /* ㉢ 경로 A(08-22 · 엔진검토 Ⅰ-② 둘째 통로) — 배정 «날짜»를 덮는 시즌의, 그 학생
            * 나침반 답 하나. correct 의 첨삭 배선(08-20)과 같은 무늬이고 기준만 다르다: 그쪽은
            * 「그 제출의 날」(첨삭은 비동기), 여기는 「오늘」 — 이 질의가 짓는 것이 오늘 배정이다.
            * 날짜는 스냅기준에서 파생한다(같은 호출의 몽골날짜()와 같은 값 — 인자를 늘리면 세
            * 갈래 호출부가 같이 늘고, 둘이 갈리면 시즌 경계의 밤에 어제 시즌으로 오늘을 짓는다).
            * 겹침은 DDL(no_overlap)이 막아 덮는 시즌은 많아야 1 — limit 1 은 그 사실의 표기다.
            * 소비자는 생성 모드의 요약(과제요약 조각)뿐 — 현행(비생성) 경로는 이 칸을 안 읽는다. */
           (select c.answers->>'season_goal'
              from engine.season sn
              join engine.season_compass c
                on c.season_id = sn.season_id and c.learner_id = l.learner_id
             where sn.starts_on <= (${스냅기준}::timestamptz at time zone ${시간대})::date
               and (sn.ends_on is null or sn.ends_on >= (${스냅기준}::timestamptz at time zone ${시간대})::date)
             limit 1) as 시즌목표,
           입학나침반.왜배우나, 입학나침반.토픽쓸곳,
           배정.occurred_at as 마지막배정, 배정.task_snapshot as 마지막스냅샷,
           교정.corrected_text as 교정문, 교정.correction_id as 교정id, 교정.원사건,
           동의.consent_ver, 동의.consent_id,
           재제출.원제출사건, 재제출.원시드, 재제출.원챌린지,
           원신호.행들 as 원신호
      from engine.learners l
      left join lateral (
        /* ㉢ 입학 회차 나침반(2026-09-05 · 유호 픽 ㉮) — 「왜 배우나」·「토픽 쓸 곳」.
         *   바로 위 시즌목표와 **다른 행**을 본다: 그쪽은 「오늘을 덮는 시즌」이고 여기는
         *   「입학 그날」이다. 이 둘은 입학 회차에만 저장되고 이후 시즌 행에는 아예 없다 —
         *   DB CHECK(season_compass_answers_c11)가 회차별 키 집합을 못박고 있어서, 시즌 행에서
         *   찾으면 셋째 시즌부터 영원히 null 이 된다(값이 없는 게 아니라 «다른 행에» 있다).
         * 🔑 회차를 가르는 술어 = self_in_5y_changed is null. 회차 열을 따로 두지 않은 것이
         *   그 표의 설계이고(같은 판정이 두 칸에 앉으면 갈린다), 여기도 그 술어를 그대로 쓴다.
         * 🔑 order by recorded_at 은 고르기 규칙이 아니라 **입학 행이 하나**라는 사실의 표기다
         *   (learner_id, season_id 유일키 + 입학은 한 번). 인덱스 season_compass_learner_recorded
         *   가 이 정렬을 덮는다.
         * 🔒 판정하지 않는다 — 원값을 그대로 걷어 요약의 «맥락 줄»로만 간다(lib/시즌맥락.js
         *   목적줄들). 점수·태그로 바꾸는 것은 세 곳이 막아 둔 길이다.
         * ⚠ 이 주석에 백틱을 쓰지 않는다 — sql 템플릿 리터럴 «안»이라 거기서 끊긴다.
         *   09-05 에 실제로 밟았다(바로 위 교정 lateral 이 같은 경고를 이미 적어 두고 있었다). */
        select c.answers->>'why_learning' as 왜배우나,
               c.answers->>'topik_use'    as 토픽쓸곳
          from engine.season_compass c
         where c.learner_id = l.learner_id
           and c.self_in_5y_changed is null
         order by c.recorded_at
         limit 1) 입학나침반 on true
      left join lateral (
        select e.occurred_at, s.task_snapshot
          from engine.learning_events e
          join engine.submissions s on s.event_id = e.event_id
         where e.learner_id = l.learner_id and e.event_type = 'task.assigned'
         order by e.occurred_at desc limit 1) 배정 on true
      left join lateral (
        /* 🔑 event_id 를 함께 집는다 — **그 교정이 무엇에 대한 것이었나**(원 제출 사건).
         *   corrected_text 만 집으면 문장은 오늘 ②슬롯에 나가는데 「어느 제출의 교정인가」가
         *   여기서 끊기고, 그러면 앱은 재발화 행에 retry_of_event_id 를 채울 재료가 없다 —
         *   설계 전체의 **유일한 결과 변수**(L0 §9-2)가 생산자 0 인 채로 남는다. 조인은 이미
         *   걷고 있던 것이라 한 칸 더 집는 것이 전부다.
         * 🔴 **고리는 submission.created 일 때만 잇는다** — engine.submissions 에는 제출이 아닌
         *   행이 있다(배정 행도 여기 산다 · tools/교정확정.js:75 가 같은 자리를 같은 술어로 막는다).
         *   그 행을 가리키면 결과 변수가 「학생이 다시 낸 발화 → 어제의 배정」을 가리키게 되고,
         *   그건 틀린 게 아니라 **뜻이 없는** 값이다. 문장 배달은 그대로 나가고(기존 동작 불변)
         *   못 믿는 것은 고리뿐이라 null 로 둔다 — 「모른다」를 거짓말로 바꾸지 않는다.
         * ⚠ 이 주석은 sql 템플릿 리터럴 **안**이다 — 백틱을 쓰면 리터럴이 거기서 끊긴다
         *   (2026-08-08 실측: tests/화면구문 이 「Missing semicolon」으로 잡았다). */
        select c.corrected_text, c.correction_id,
               case when e.event_type = 'submission.created' then e.event_id end as 원사건
          from engine.corrections c
          join engine.submissions s on s.submission_id = c.submission_id
          join engine.learning_events e on e.event_id = s.event_id
         where e.learner_id = l.learner_id
           and c.corrected_text is not null
           and s.task_type = ${통로}
           and c.created_at > coalesce(배정.occurred_at, '-infinity'::timestamptz)
         order by c.created_at desc limit 1) 교정 on true
      /* H3(발주 §6-6 ⑩) — 「고쳐서 다시 보낼래요」가 눌린 게임(G1·G2) 교정 중 **재배정이 아직
       * 없는** 원 제출. 게임 교정은 위 ②슬롯을 안 탄다(바로 위 task_type 한정 — 메일 교정문을
       * 낭독 문장으로 내보내는 사고를 막는다 · C3) — 배달 통로가 답장 화면(/corrections)이라
       * 워터마크와 무관하고, 재제출 판은 다음 게임날 새 배정 행이 낸다.
       * · 닻은 시각이 아니라 「retry_of_event_id 로 잇는 배정의 부재」다 — 날을 놓쳐도 안
       *   사라진다(워터마크였다면 게임 미룬 날마다 증발했을 자리).
       * · 원 제출의 시드·챌린지를 함께 걷는다 — 재제출은 «같은 문항»을 다시 쓰는 것이라 새
       *   문항을 지어내면 고리의 뜻이 죽고, 모듈을 가르는 것은 지금 급수가 아니라 챌린지다.
       * · 시드를 목록으로 거른다 — 판정이 세울 수 없는 원 제출(G2 대조 문항·사라진 시드)이
       *   최신이면 limit 1 이 걷힐 수 있는 재제출을 그늘로 가린다(목록 정본 = lib).
       * ⚠ 이 주석은 sql 템플릿 리터럴 «안»이다 — 백틱을 쓰면 리터럴이 여기서 끊긴다(F180). */
      left join lateral (
        select e2.event_id as 원제출사건, s2.task_snapshot->>'prompt_seed' as 원시드,
               s2.task_snapshot->>'challenge_id' as 원챌린지
          from engine.learning_events r
          join engine.corrections c2 on c2.correction_id = r.correction_id
          join engine.submissions s2 on s2.submission_id = c2.submission_id
          join engine.learning_events e2 on e2.event_id = s2.event_id
         where r.learner_id = l.learner_id
           and r.event_type = 'correction.responded'
           and r.payload->>'learner_response' = ${재제출의사}
           and e2.event_type = 'submission.created'
           and ((s2.task_snapshot->>'challenge_id' = ${게임챌린지}
                 and s2.task_snapshot->>'prompt_seed' = any(${시드전부 as string[]}))
             or (s2.task_snapshot->>'challenge_id' = ${G2챌린지}
                 and s2.task_snapshot->>'prompt_seed' = any(${G2재제출앵커들 as string[]})))
           and not exists (
             select 1 from engine.learning_events t
              where t.learner_id = l.learner_id
                and t.event_type = 'task.assigned'
                and t.retry_of_event_id = e2.event_id)
         order by r.occurred_at desc limit 1) 재제출 on true
      /* 🔴 동의 술어는 lib/동의게이트.js 의 「지금유효술어」와 **같아야 한다** — 2026-08-07 실측:
       *   여기만 agreed_at 조건이 없고 revoked_at is null 이라 **양쪽으로 어긋나 있었다.**
       *   · 미래 날짜 동의 → 배정은 되는데 uploads 는 403 (과제를 보고도 못 올린다)
       *   · 철회를 미래로 예약한 학생 → 배정이 안 되는데 업로드는 통과 (화면이 비는데 이유가 없다)
       *   태그 질의를 못 쓰는 자리(lateral join)라 술어를 글자로 적되 tests/동의게이트.test.js 가
       *   정본 텍스트와 대조한다 — 갈라지면 빨개진다.
       *   ⚠ 이 주석은 SQL 템플릿 리터럴 **안**이다 — 백틱을 쓰면 문자열이 여기서 끝나고 함수가
       *   번들조차 안 된다(F180 · 방금 그렇게 한 번 빨개졌다). 강조는 「」로 한다. */
      left join lateral (
        select consent_id, consent_ver from engine.consents
         where learner_id = l.learner_id
           and agreed_at <= now()
           and (revoked_at is null or revoked_at > now())
         order by agreed_at desc limit 1) 동의 on true
      /* ⑦ 학습자 상태의 **원신호**. 사슬 마지막 칸의 첫 소비자이고, 여기서 걷지 않으면
       * 상태 계산은 읽을 것이 없다(도달의 정의는 「읽힌 것」이지 보이는 것이 아니다 · 설계 §5).
       * · 목록·창은 lib 이 정본이라 여기에 다시 안 적는다 — 갈라지면 축이 조용히 죽는다.
       * · 마감(due_at)은 submissions 에 사니 같이 걷는다. 배정 행에만 있고 나머지는 null 이다.
       * · task_type 을 싣는 것은 리듬·끈기축의 라디오 제외(lib v6 · 반박 ①)의 재료다.
       * · task_schema_ver 도 **같은 제외의 재료**다(lib v10 · 발전 트랙 ④ 낭독). 라디오 낭독은
       *   학생이 앱에서 녹음해 task_type 이 「발화녹음」(앱 어휘)이라 위 목록으로는 원리상 안
       *   걸린다 — 판(radio-*)이 그 축이다. 이 칸을 안 실으면 lib 필터는 조용히 무력해지고
       *   새는 방향은 「앱 제출로 센다」라, 숙제를 안 낸 날이 낸 날로 뒤집힌다.
       * · 🔑 아래 where 의 라디오 «드롭»에는 판을 안 얹었다 — 그 드롭은 종별 상한을 지키려는
       *   것이고(반박 ⑥), 낭독은 하루 한 장이라 창을 밀지 않는다. 판정을 SQL 에도 적으면 같은
       *   판정이 두 곳에 살아 갈라진다(제외의 정본은 lib/라디오태스크 하나다).
       * · 상한은 **사건 종류별**이다(반박 ⑥) — 전체 한 칸이면 하루 상한 없는 라디오 명령이
       *   창을 채울 때 오래된 배정·제출이 잘려 리듬 분모가 조용히 준다. 종류마다 최신 우선.
       * ⚠ 이 주석은 SQL 템플릿 리터럴 «안»이다 — 백틱을 쓰면 문자열이 여기서 끝나고 함수가
       *   번들조차 안 된다(F180). 강조는 「」로 한다. */
      left join lateral (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'event_id', x.event_id, 'event_type', x.event_type, 'occurred_at', x.occurred_at,
                 /* 늦적재 경계의 재료(§11-4 ㉤·C4) — 이 칸이 없으면 하류(학습자상태 v11)의
                  * ingested_as_of 필터는 검사할 값이 없어 전건 배제로 기운다(v11 규약). */
                 'ingested_at', x.ingested_at,
                 'retry_of_event_id', x.retry_of_event_id, 'correction_id', x.correction_id,
                 'task_type', x.task_type, 'task_schema_ver', x.task_schema_ver,
                 'payload', x.payload, 'due_at', x.due_at,
                 /* 관측 짝의 **유일한 고리**(계약 c9 — 「무엇을 봤나」). 이 칸이 없으면 회수는
                  * 개입을 세고도 관측을 하나도 못 잇고, 증상은 「아무도 안 본다」 하나뿐이다. */
                 'parent_event_id', x.parent_event_id,
                 /* 개입을 «고른» 규칙과 «상태를 잰» 판. 성과를 규칙별로 갈라 보는 짝이라
                  * 회수가 「evidence_refs」 에 그대로 싣는다(없으면 null 을 낸다 — 지어내지 않는다).
                  * ⚠ 이 주석은 sql 템플릿 리터럴 «안»이라 백틱 한 글자가 리터럴을 끊는다(F180 —
                  *   2026-08-12 에 이 자리에서 실제로 한 번 끊었다. 강조는 「」로 한다). */
                 'policy_ver', x.policy_ver, 'estimator_version', x.estimator_version,
                 /* 겨냥 기술(#7 — 생성 성공 착지에만 실린다 · E3). 회수의 기술 축이 읽는 첫 칸. */
                 'skill_ids', x.skill_ids,
                 /* correction.* → 배정의 다단 조인 끝(#7 · §6-0 F1 — 그 생산자엔 parent_event_id
                  * 가 0 이라 공급자가 홉을 걷는다: correction_id → corrections → 원 제출의
                  * task_ref → 같은 학생·같은 task_ref 의 배정 → 그 intervention_id). */
                 'assigned_intervention_id', x.assigned_intervention_id,
                 /* G4 강제산출 표식(challenge_id)의 원본. 이 칸이 안 실리던 동안 그 축은 서버
                  * 계산에서 구조적으로 null 이었다(08-20 수리 — lib 주석이 「이 층에 안 온다」로
                  * 자인하던 벽). «submission 으로 중첩»하는 이유: 소비자(G4행인가)가
                  * e.submission.task_snapshot 을 읽는다 — 평평하게 실으면 배선은 초록인데 축은
                  * 영원히 빈다. 없는 행은 null(지어내지 않는다 — 위 evidence_refs 와 같은 규율). */
                 'submission', case when x.task_snapshot is null then null
                                    else jsonb_build_object('task_snapshot', x.task_snapshot) end,
                 'intervention_id', x.intervention_id)
                 /* agg 순서도 같은 규율 — order by 없는 jsonb_agg 는 순서 미보장이라, 같은
                  * 원신호를 두 번 걷어도 행들 배열이 다른 모양일 수 있다(발견 4 의 둘째 절반). */
                 order by x.occurred_at desc, x.event_id desc), '[]'::jsonb) as 행들
          from (
            select y.event_id, y.event_type, y.occurred_at, y.ingested_at, y.retry_of_event_id,
                   y.correction_id, y.task_type, y.task_schema_ver, y.payload, y.due_at,
                   y.parent_event_id, y.policy_ver, y.estimator_version, y.intervention_id,
                   y.task_snapshot, y.skill_ids, 교정배정.assigned_intervention_id
              from (
                select e.event_id, e.event_type, e.occurred_at, e.ingested_at, e.retry_of_event_id,
                       e.correction_id, e.task_type, s.task_schema_ver, e.payload, s.due_at,
                       e.parent_event_id, e.policy_ver, e.estimator_version, e.intervention_id,
                       s.task_snapshot, e.skill_ids,
                       /* 둘째 키 event_id — 동시각 사건에서 절단이 비결정이면 「원래 개수 재현」
                        * (evidence_refs·근거상한의 소급 재현)이 깨진다. 설계 C2 가 진단한 병의
                        * 같은 형태가 이 자리에 실재했다(9회차 심문 발견 4 · 2026-08-20). */
                       row_number() over (partition by e.event_type
                                          order by e.occurred_at desc, e.event_id desc) as 몇째
                  from engine.learning_events e
                  left join engine.submissions s on s.event_id = e.event_id
                 where e.learner_id = l.learner_id
                   and e.event_type = any(${걷는사건}::text[])
                   and not (e.event_type = 'submission.created'
                            and e.task_type is not null
                            and e.task_type = any(${라디오태스크종}::text[]))
                   /* 창 cutoff 는 now() 가 아니라 스냅 기준이다(§11-4 D1) — 늦적재 경계까지
                    * 같은 시각으로 건다(㉤ 이중 cutoff · 여기서 걸어야 하류가 잴 값이 있다). */
                   and e.occurred_at >= ${스냅기준}::timestamptz - make_interval(days => ${창일수})
                   and e.occurred_at <= ${스냅기준}::timestamptz
                   and e.ingested_at <= ${스냅기준}::timestamptz) y
              /* correction.* 행에만 값이 앉는 다단 조인(#7 · 위 jsonb 칸 주석의 그 홉). 다른
               * 행은 correction_id 가 null 이라 lateral 이 0행 → null(비용도 그 행 수만큼만). */
              left join lateral (
                select 배정e.intervention_id as assigned_intervention_id
                  from engine.corrections c4
                  join engine.submissions 제출s on 제출s.submission_id = c4.submission_id
                  join engine.submissions 배정s on 배정s.task_ref = 제출s.task_ref
                  join engine.learning_events 배정e
                    on 배정e.event_id = 배정s.event_id
                   and 배정e.event_type = 'task.assigned'
                   and 배정e.learner_id = l.learner_id
                 where c4.correction_id = y.correction_id
                 order by 배정e.occurred_at desc limit 1) 교정배정 on y.correction_id is not null
             where y.몇째 <= ${종별상한}) x) 원신호 on true
      ${좁히기}`;
}

async function 배달하기(오늘: string, 한사람: string | null = null, 맥락: string | null = null) {
  /* 상태 스냅의 기준시각 — **배치 전체가 하나**(설계 §11-4 D1). 원신호 창을 SQL 의 now() 로
   * 자르면 「몇 시간 뒤 깨어난 워커」가 같은 as_of 를 넘겨도 다른 창을 받는다 — 창 cutoff 도
   * 상태 계산의 as_of 도 이 값 하나에서 나와야 「같은 as_of = 같은 표본」이 성립한다.
   * ⚠ 착지 스탬프(`한명()` 의 `지금`)와 축이 다르다 — 그건 «실시각·조작하지 않는다»(§11-4 A7)
   *   이고 이건 «읽기 스냅샷 기준»이다. 하나로 접으면 학생마다 스냅 기준이 갈린다. */
  const 스냅기준 = new Date().toISOString();

  /* 🔴 생성 모드 게이트(§3-2-a C5 · v5.13-b ⑤) — 활성 함수(`engine.gen_active_from()` · 활성
   * 조각이 세운다)가 «있고» 시작일이 오늘 이전이면 이 배달은 신구조가 진다:
   *   전원(맥락=배치) → 오케스트레이터(㉠) · 단건(맥락=구제) → ㉨ 구제. 함수가 없으면 현행
   * 그대로 — 배포 순서가 어긋나도 학생이 빈손이 되는 갈래가 없다.
   * 🔴 활성 뒤 `맥락` 은 «필수»다(§3-1 v5.8 — 누락도 400 · fail-closed): 호출자는 tasks·auth·
   *   cron 전부 우리 서버 층이라 앱 호환이 필수화를 막지 않고, 잊으면 배포 시점에 시끄럽게
   *   죽는다(활성 조각의 cron 마이그가 `&맥락=배치` 를 §12-21 대조 아래 명시로 박는 이유). */
  const 게이트 = await sql`
    select (to_regprocedure('engine.gen_active_from()') is not null) as 있음`;
  if (게이트[0]?.있음) {
    const 활성 = await sql`select engine.gen_active_from() <= ${오늘}::date as 켜짐`;
    if (활성[0]?.켜짐) {
      if (맥락 !== '배치' && 맥락 !== '구제') {
        return 봉투(400, { ok: false, date: 오늘, error: {
          code: 'BAD_REQUEST', message: '활성 뒤 deliver 는 맥락(배치·구제)이 필수입니다(§3-1)',
        } });
      }
      if (맥락 === '배치' && !한사람) {
        const 대상 = await 대상조회(스냅기준, null);
        return await 생성배달({ sql, 오늘, 스냅기준, 대상: 대상 as unknown as Record<string, unknown>[], 봉투, 게임갈래 });
      }
      if (맥락 === '구제' && 한사람) {
        const 대상 = await 대상조회(스냅기준, 한사람);
        if (!대상.length) {
          console.error('[deliver] 🔴 구제 대상 없음', 한사람);
          return 봉투(404, { ok: false, date: 오늘, mode: '구제', error: { code: 'NOT_FOUND', message: '그 학생이 없습니다' } });
        }
        return await 구제배달({ sql, 오늘, 스냅기준, 학생: 대상[0] as Record<string, unknown>, 봉투, 게임갈래 });
      }
      return 봉투(400, { ok: false, date: 오늘, error: {
        code: 'BAD_REQUEST', message: '배치=전원 · 구제=단건 조합만 받습니다(§3-1)',
      } });
    }
  }

  /* 0행 가드(반박 ⑮ 동축)는 `lib/계약판.js` 가 진다 — 빈 이력에서 죽으면 500 의 이유가 로그에 안 남는다.
   * 🔑 판을 **대상보다 먼저** 읽는다(옛 판은 뒤였다) — 아래 전원 갈래가 커서로 흘리는데, 첫 묶음이
   *   온 «뒤에» 판을 물으면 커서가 열린 채 질의를 하나 더 태우게 된다. 순서만 바꾼 것이고 판정은 같다. */
  const 판행 = await sql`
    select name as 최신조각 from engine.schema_migrations order by version desc limit 1`;
  const ver = 행들에서판(판행);
  if (!ver) {
    // events 와 같은 근거로 DB 에게 판을 묻는다 — 함수가 DB 보다 앞설 수 없게.
    console.error('[deliver] DB 계약판을 못 읽었다', 판행.length ? 판행[0].최신조각 : '(이력 0행)');
    return 봉투(500, { ok: false, date: 오늘, error: { code: 'SERVER_ERROR', message: '서버 설정 오류입니다' } });
  }

  /* 회수의 기준시각은 **배치 전체가 하나**를 쓴다 — 학생마다 새로 찍으면 루프가 자정을 넘는 날
   * 앞 학생과 뒤 학생의 「미도래」 경계가 갈리고, 그 차이는 값만 보고 알 수 없다. */
  const 기준시각 = new Date();

  const results: Record<string, unknown>[] = [];
  const 회수들: { 개입: number; 닿음: number; 고리없음: number;
    기술: { 겨냥개입: number; 관측있음: number; 관측수: number } }[] = [];
  /* 🔴 회수가 죽으면 아래 `사슬` 의 **분모가 조용히 줄어든다** — 「개입이 적었다」와 「세다가
   *   죽었다」가 같은 수로 접히고, 연결률은 그 위에서 계산된다. 세어서 봉투에 올려야 그 둘이 갈린다. */
  let 회수실패 = 0;

  /* 🔴 **학생을 한 줄로 세우지 않는다** (2026-08-22 · 리허설 504 실측).
   *   `한명()` 한 번은 DB 왕복 5회(BEGIN·개입·배정·제출·COMMIT)를 «기다리는» 일이고, 그
   *   기다림이 실측 553ms/명이다 — 그중 계산은 거의 0 이다(창 안 원신호 중앙 4건·최대 70건).
   *   한 줄로 세우면 그 대기가 전부 더해져 500명에 290초, Edge 벽시계(리허설 실측 120.0초에서
   *   절단)를 넘는다. 그러면 그날 배치는 **중간에서 잘린다**: 앞 학생은 받고 뒤 학생은 빈손인데
   *   부른 쪽에는 504 만 오고, 미달 경고(§6-5)도 그 응답 안에 있어서 같이 사라진다.
   *   🔑 학급이 크면 늦게 도는 게 아니라 **안 도는** 것이라, 이건 속도가 아니라 완결의 문제다.
   * 🔑 학생끼리 볼 것이 없어서 동시가 성립한다 — 한 명 = 한 트랜잭션이고, 루프가 공유하는
   *   `ver`·`스냅기준`·`기준시각` 은 전부 루프 «전»에 한 번 정해진 상수다(바로 위 세 줄).
   *   배정의 유일 제약도 학생 단위라 서로의 행을 기다리지 않는다.
   * 🔑 `results` 는 자리를 **미리 잡아 입력 순서대로** 채운다 — 끝나는 순서로 밀어 넣으면 같은
   *   학급이 실행마다 다른 순서의 「건너뜀·실패」 목록을 내고, 그 흔들림은 눈으로 대조하는
   *   사람에게 결함처럼 보인다. (`회수들` 은 아래 `사슬` 이 **합**으로만 읽으므로 순서가 없다.)
   * ⚠ 동시 수는 커넥션 풀(`postgres()` 기본 max 10)보다 **작아야** 한다 — 크면 남는 커넥션을
   *   기다리는 동안 트랜잭션이 열린 채 서고, 그건 순차보다 나쁘다. DB 쪽 여유도 재고 골랐다:
   *   리허설 `max_connections` 60 · 배치 밖 상시 사용 12(2026-08-22 실측)라 8 은 여유 안이다.
   *   🔑 올리기 전에 **두 상한을 같이** 본다 — 풀만 키우면 DB 가 거절하고, DB 만 보면 풀에서
   *     줄을 선다. 둘 중 낮은 쪽이 진짜 상한이다.
   * 🚫 **이 값으로 `546 WORKER_RESOURCE_LIMIT` 을 못 고친다** — 재적 823 실측(2026-08-22):
   *   동시 8 과 동시 5 가 **같은 자리에서** 죽고 성공한 1차만 52초→81초로 느려졌다. 동시 수는
   *   그 축이 아니다 — 여기를 내려 고쳐 보려는 다음 사람은 그 실험을 이미 한 셈이다.
   * 🔴 546 의 실체는 «누적»이 아니라 **가장자리**다(4연속 실측 200·200·546·546 — 앞의 둘은
   *   바로 이어 부른 것이고 셋째는 150초 쉬고 부른 것이라, 「두 번째 sweep 이 죽는다」도
   *   「워커가 쉬면 낫는다」도 아니다). 재적 823 의 이 sweep 은 자원 예산의 90% 언저리에
   *   앉아 있어 **같은 요청이 들쭉날쭉 성공·실패한다**. 성공은 50~52초에 완주하고 실패는
   *   45초에 끊긴다.
   * 🔑 그래서 고칠 자리는 이 상수가 아니라 «한 요청이 학급 전원을 한꺼번에 들어 올리는 것»
   *   자체다 — 그 구조를 바꾸는 것이 생성 트랙(생성모드.ts 의 벌크 적재)이 한 일이다.
   * 🚫 **메모리인지 CPU 인지는 여기서 못 잰다** — 막다른 길 둘을 이미 걸었다(2026-08-22):
   *   ① 함수 런타임 로그가 관리 API 로 안 읽힌다(`function_logs` 0행). ② Supabase Edge
   *   런타임에는 `Deno.memoryUsage()` 가 **없다**(v61 로 실제로 싣고 재보니 성공한 실행에서도
   *   null). 다음 사람은 이 둘을 다시 시도하지 않아도 된다 — 가르려면 밖에서(플랜·대시보드)
   *   보거나, 학급을 줄여 이 벽을 안 만나는 구조로 가야 한다.
   * ⚠ 한 학생이 던지면(예: `오늘과제` 가 못 고르는 날) 전건이 500 인 것은 **옛 판과 같다** —
   *   순차 때도 그 예외는 루프를 뚫고 나가 `Deno.serve` 의 catch 에서 500 이 됐다. 동시가
   *   바꾼 것은 그때 이미 시작된 다른 학생들의 행이 남는다는 것뿐이고, 그건 순차의 「앞
   *   학생들은 이미 받았다」와 같은 자리다. */
  const 동시 = 8;
  /* 🔴 **학급을 한 번에 들어 올리지 않는다** — 묶음씩 흘린다(2026-08-22 · 546 수리).
   *   옛 판은 `대상조회` 가 전원을 한 배열로 받아 배치가 끝날 때까지 들고 있었고, 그래서
   *   «살아 있는 힙»이 학급 크기에 비례했다. 재적 648 은 41초에 200 인데 823 에서 같은 함수가
   *   `546 WORKER_RESOURCE_LIMIT` 으로 죽었다 — 같은 요청이 들쭉날쭉(실측 200·200·546·546)한
   *   가장자리였다. 학생당 원신호를 놓는 것만으로는 0/2 → 4/9 로 나아졌을 뿐 가장자리를 못
   *   벗어났다. 흘리면 힙이 **학급이 아니라 묶음**에 비례한다.
   * 🔑 묶음 100 · 동시 8 — 쪽 질의는 트랜잭션과 겹치지 않으므로 커넥션은 최대 8(풀 기본 10 안).
   *   묶음을 키우면 힙이, 동시를 키우면 커넥션이 먼저 벽에 닿는다 — 두 손잡이의 벽이 다르다.
   * ⚠ 묶음 사이에는 벽(barrier)이 선다 — 앞 묶음이 다 끝나야 다음 쪽을 부른다. 완전 파이프라인
   *   보다 조금 느리지만, 그 벽이 곧 «힙이 다시 내려가는 자리»다.
   * 🚫 **묶음을 줄여도 546 은 안 줄어든다** — 25 로 내려 실측했다(재적 848 · 2026-08-22):
   *   1/5 성공 · 벽시계 64~73초(100 일 때는 2/5 · 53~56초). 쪽이 많아진 만큼 벽만 늘고
   *   가장자리는 그대로였다. 즉 546 은 «살아 있는 집합»에도 반응하지 않는다 — 동시 수(8·5),
   *   묶음 크기(100·25), 커서→쪽넘김까지 **내가 쥔 손잡이 셋이 전부 축 밖**이라는 실측이다.
   *   남은 축은 «한 요청이 하는 일의 총량» 하나뿐이고, 그것을 줄인 것이 생성 트랙의 벌크
   *   적재다. 100 은 셋 중 가장 나은 실측값이라 여기 둔다. */
  const 묶음크기 = 100;

  const 묶음처리 = async (학생들: Record<string, unknown>[]) => {
    const 묶음결과: Record<string, unknown>[] = new Array(학생들.length);
    let 다음 = 0;
    const 일꾼 = async () => {
      for (;;) {
        /* 단일 스레드라 이 한 줄 사이에 다른 일꾼이 끼어들 자리가 없다 — 락이 필요 없는 이유다. */
        const 몇째 = 다음++;
        if (몇째 >= 학생들.length) return;
        const 학생 = 학생들[몇째];
        묶음결과[몇째] = await 한명(학생, 오늘, ver, 스냅기준);
        /* 🔑 배달의 **부속이 아니라 나란한 일**이다 — 회수가 재는 것은 오늘 나가는 개입이 아니라
         *   «지난» 개입이라, 오늘 배달이 건너뛰거나 실패해도 회수는 그대로 성립한다. 그래서
         *   `한명()` 안에 넣지 않는다(반환 지점이 일곱이라 넣으면 반드시 몇 개를 빠뜨린다).
         * ⚠ 계산만 하고 아무것도 저장하지 않는다 — 저장하면 「이 개입은 효과 없음」이라는 틀린
         *   낙인이 굳는다(`lib/성과회수.js` 머리말 · 코어엔진 §원칙1). 내는 것은 계수뿐이다.
         * 🔑 `회수들` 은 순서를 안 지켜도 된다 — 아래 `사슬` 이 **합**으로만 읽는다. */
        try {
          const r = 회수요약((학생.원신호 ?? []) as unknown[], { 기준시각 });
          회수들.push({ 개입: r.개입, 닿음: r.닿음, 고리없음: r.고리없음, 기술: r.기술 });
        } catch (e) {
          console.error('[deliver] 성과 회수 실패(배달은 계속한다)',
            학생.learner_id, String((e as Error)?.message ?? e));
          회수실패 += 1;
        }
        /* 🔴 **다 쓴 원신호를 놓는다** — 이 학생의 raw 사건 배열은 바로 위 두 줄(`한명`·`회수요약`)이
         *   마지막 소비자이고 그 뒤로는 아무도 안 본다. 커서가 힙을 «묶음»으로 묶어 주지만,
         *   그 묶음 안에서도 100명분을 끝까지 들고 있을 이유가 없다 — 둘은 겹치는 장치가 아니라
         *   **같은 방향의 두 걸음**이다(묶음 밖은 쪽넘김이, 묶음 안은 이 두 줄이 놓는다).
         * ⚠ `학생들` 의 원소를 고쳐 쓴다 — 커서가 이 묶음에 준 배열이고 소비자가 여기뿐이다.
         *   밖에서 온 값이었다면 남의 것을 비우는 셈이라 하면 안 되는 짓이다. */
        학생.원신호 = null;
        학생.마지막스냅샷 = null;
      }
    };
    await Promise.all(Array.from({ length: Math.min(동시, 학생들.length) }, () => 일꾼()));
    /* 묶음이 순서대로 오고 묶음 안도 자리로 채웠으니 `results` 는 입력 순서 그대로다.
     * 🔑 일꾼이 던지면 위 `Promise.all` 이 먼저 거절해서 여기 안 온다 — 구멍이 안 생긴다. */
    results.push(...묶음결과);
  };

  if (한사람) {
    /* 단건은 흘릴 것이 없다(한 명) — 그리고 «없는 학생»을 여기서 가려야 한다.
     * 🔴 단건인데 0건 = 없는 learner_id 로 불렸다는 뜻이다. 200 으로 넘기면 「배정 0/재적 0」이라
     *   미달 경고에도 안 걸려 **조용히 아무 일도 안 한 것**이 된다. 부른 쪽이 알아야 한다. */
    const 대상 = await 대상조회(스냅기준, 한사람);
    if (!대상.length) {
      console.error('[deliver] 🔴 단건 대상 없음', 한사람);
      return 봉투(404, { ok: false, date: 오늘, mode: '단건', error: { code: 'NOT_FOUND', message: '그 학생이 없습니다' } });
    }
    await 묶음처리(대상 as unknown as Record<string, unknown>[]);
  } else {
    /* 🔴 **`.cursor()` 를 안 쓴다 — 실측이 그것을 배제했다**(2026-08-22). postgres.js 의
     *   `.cursor(100, fn)` 으로 흘렸더니 823명 중 **800명만** 처리됐다(= 8×100 · 마지막 자투리
     *   23명이 응답이 서기 «전»에 안 실렸다). 그 23명은 그날 배달을 못 받는데, 앞선 실행이
     *   이미 배정을 세워 둔 날에는 DB 가 멀쩡해 보여 **증상이 0 이다.** 새는 방향이 「통과」인
     *   그 모양이라, 라이브러리의 마지막-묶음 약속에 기대지 않는다.
     * 🔑 키셋 쪽넘김은 끝 판정을 **이 파일이 진다**: 받은 쪽이 한도보다 작으면 그게 끝이다.
     *   0행이어도 끝이다(마지막 쪽이 정확히 한도였던 날).
     * ⚠ 쪽마다 스냅샷이 다르다(커서는 한 벌이었다) — 도는 중에 «생긴» 학생은 그 id 가 아직
     *   안 지난 자리면 걸리고 지난 자리면 빠진다. 배치에는 무해하다: 빠진 학생은 §6-5 점검이
     *   미달로 잡고 다음 배치가 받는다. 원신호 창은 `스냅기준` 하나라 **신호 축은 안 흔들린다.** */
    let 뒤: string | null = null;
    for (;;) {
      const 쪽 = await 대상질의(스냅기준, null, { 뒤, 한도: 묶음크기 });
      if (!쪽.length) break;
      뒤 = String((쪽[쪽.length - 1] as unknown as { learner_id: string }).learner_id);
      await 묶음처리(쪽 as unknown as Record<string, unknown>[]);
      if (쪽.length < 묶음크기) break;
    }
  }

  const 센다 = (s: string) => results.filter((r) => r.status === s).length;
  /* 기술 축(#7 · §12-17 「닿았나의 증거」) — lib 이 이미 세는 값을 봉투에 «싣기만» 한다.
   * 이 칸이 응답에 없으면 왕복시험은 겨냥→후속 조인이 실제로 값을 내는지 밖에서 잴 수 없다
   * (위 사슬 칸과 같은 근거 — 「이 칸이 응답에 있어야 … 밖에서 잰다」). */
  const 사슬 = 회수들.reduce((a, r) => ({
    개입: a.개입 + r.개입, 닿음: a.닿음 + r.닿음, 고리없음: a.고리없음 + r.고리없음,
    기술: {
      겨냥개입: a.기술.겨냥개입 + (r.기술?.겨냥개입 ?? 0),
      관측있음: a.기술.관측있음 + (r.기술?.관측있음 ?? 0),
      관측수: a.기술.관측수 + (r.기술?.관측수 ?? 0),
    },
  }), { 개입: 0, 닿음: 0, 고리없음: 0, 기술: { 겨냥개입: 0, 관측있음: 0, 관측수: 0 } });
  /* 🔴 분모 0 은 `null` 이다 — 0% 로 접으면 «배달이 아직 없는 날»과 «나갔는데 아무도 안 본 날»이
   *   같은 값이 된다(`lib/성과회수.js` 의 일관 규칙). */
  const 잴수있는것 = 사슬.개입 - 사슬.고리없음;
  const 연결률 = 잴수있는것 > 0 ? Math.round((사슬.닿음 / 잴수있는것) * 1000) / 1000 : null;

  const 몸 = {
    ok: true, date: 오늘, contract_ver: ver, mode: 한사람 ? '단건' : '전원', 재적: results.length,
    배정: 센다('assigned') + 센다('duplicate'),
    신규: 센다('assigned'), 재실행: 센다('duplicate'),
    강등: results.filter((r) => r.degraded).length,
    건너뜀: results.filter((r) => r.status === 'skipped'),
    실패: results.filter((r) => r.status === 'failed'),
    /* 사슬 ⑦칸의 계수 — 이 칸이 응답에 있어야 왕복시험이 「사슬이 끝까지 도는가」를 밖에서 잰다. */
    사슬: { ...사슬, 연결률, 회수실패 },
    /* 🔑 성공했는데 근거 스탬프가 빈 배달의 수. 0 이 정상이고, 0 이 아니면 그날 배달은 나갔지만
     *   그 학생들의 「그때 상태」는 **영영 안 남는다**(소급 불가). status 로는 안 드러난다. */
    상태없음: results.filter((r) => r.상태없음).length,
  };
  if (몸.배정 < 몸.재적) console.error(`[deliver] 🔴 배정 미달 — ${오늘} ${몸.배정}/${몸.재적}`);
  console.log(`[deliver] 사슬 회수 — 개입 ${사슬.개입} · 관측 ${사슬.닿음} · 연결률 ${연결률 ?? '분모0'}`);
  /* ⚠ 경보 문구가 원인을 **가르지 않는다** — 관측 생산자가 아직 한 화면뿐이라(`lib/오늘과제.js`)
   *   그 화면을 안 거친 배달은 원리상 관측이 0건이다. 「학생이 무시했다」로 단정해 적으면
   *   거짓 경보가 매일 울리고, 매일 울리는 줄은 아무도 안 읽게 된다(F103 과 같은 병). */
  if (사슬.개입 > 0 && 사슬.닿음 === 0) {
    console.error(`[deliver] 🔴 개입 ${사슬.개입}건이 관측으로 하나도 안 이어졌다 — 미열람 xor 관측 생산자 미배선`);
  }
  return 봉투(200, 몸);
}

/** 게임(G1~G4) 갈래 — 판정+배정 한 벌. 게임이 «못 서면 null»(호출자의 다음 갈래가 받는다).
 *  배달(현행 말하기)과 생성 모드가 **같은 함수**를 먼저 시도한다 — 게임날 판정이 두 벌이 되면
 *  한쪽만 고친 날 같은 학생이 두 통로에서 다른 것을 받는다. */
async function 게임갈래(학생: Record<string, unknown>, 오늘: string, ver: string) {
  const learner_id = String(학생.learner_id);
  const 지금 = new Date().toISOString();
  const 공통 = {
    actor_kind: 'ai' as const,
    level_snapshot: (학생.level_current ?? null) as string | null,
    goal_snapshot: (학생.goal_track ?? null) as string | null,
    consent_ver: String(학생.consent_ver),
    consent_id: String(학생.consent_id),
  };
  /* ── 게임(G1) 갈래 — 배정 배선 ④ (발주 §6-6 ⑩·⑪) ──────────────────────────
   * 판정은 전부 `lib/게임배정.js` 가 진다(검수확정 게이트 · 게임날 · 첫날 · C3 교정문 우선 ·
   * 초급 제외 · H3 재제출). null 이면 호출자의 다음 경로가 그대로 받는다 — 게임이 못 서는 날
   * 학생이 빈손이 되는 갈래는 없다.
   * 🔴 판정도 학생별로 삼킨다 — 한 학생의 깨진 재료(못 펴는 시드 등)가 던지면 배치 전체가
   *   500 이 된다(C0 §4-1 head-of-line blocking · 배정 배선 기각 실측 W). 실패는 다음 경로로
   *   내려간다: 게임은 다음 게임날이 있지만 그날의 말하기 발화는 소급이 없다. */
  let 게임: ReturnType<typeof 게임배정> = null;
  try {
    게임 = 게임배정({
      learner_id,
      날짜: 오늘,
      첫날: !학생.마지막배정,
      교정문: 학생.교정문 ?? null,
      급수: 학생.level_current ?? null,
      재제출: 학생.원제출사건
        ? {
          원사건: String(학생.원제출사건),
          원시드: (학생.원시드 ?? null) as string | null,
          원챌린지: (학생.원챌린지 ?? null) as string | null,
        }
        : null,
    });
  } catch (e) {
    console.error('[deliver] 게임 판정 실패(다음 경로로 내려간다)', learner_id, String((e as Error)?.message ?? e));
  }

  if (게임) {
    const g = 게임;
    try {
      return await sql.begin(async (tx) => {
        /* 개입 행이 없다(발주 §8 — v1 답장은 대본이라 학습 신호 0 · 성과회수 닻 오염 방지).
         * 멱등키는 말하기와 **같은 자리**(`task:{learner}:{날짜}`)다 — 그래서 「그날 배정 1건」
         * (⑩ 전제)이 문서가 아니라 유일 제약으로 성립하고, 낮에 말하기가 먼저 섰던 날의
         * 재실행도 여기서 duplicate 로 접힌다. */
        const 배정 = await tx`
          insert into engine.learning_events (
            learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
            level_snapshot, goal_snapshot, consent_ver, consent_id, degraded,
            retry_of_event_id, source_kind, payload, schema_ver
          ) values (
            ${learner_id}::uuid, 'task.assigned', ${g.task_type}, ${공통.actor_kind},
            ${지금}::timestamptz, ${멱등키('task', learner_id, 오늘)},
            ${공통.level_snapshot}, ${공통.goal_snapshot},
            ${공통.consent_ver}, ${공통.consent_id}::uuid, ${g.degraded},
            ${g.retry_of_event_id}::uuid,
            ${사건출처('task.assigned')}::engine.source_kind, ${sql.json({ ver: 1 })}, ${ver}
          )
          on conflict (learner_id, idempotency_key) do nothing
          returning event_id`;

        if (!배정.length) {
          return { learner_id, status: 'duplicate', degraded: g.degraded, 출처: g.출처 };
        }

        /* 그날 학생이 볼 것 그대로 — 스냅샷은 배정·제출이 같은 조립(`G1스냅샷`)을 지난다
         * (§6-8 규칙 4). `task_schema_ver` 도 그 조립의 판이다(말하기 task.v1 과 다른 축).
         * due 규칙은 말하기와 같다 — 마감의 정의가 통로마다 갈리면 습관 축이 두 자로 재진다. */
        await tx`
          insert into engine.submissions (
            event_id, task_type, task_ref, task_snapshot, task_schema_ver, occurred_at, schema_ver,
            due_at, due_ver
          ) values (
            ${배정[0].event_id}::uuid, ${g.task_type}, ${g.task_ref},
            ${sql.json(g.task_snapshot)}, ${g.task_schema_ver}, ${지금}::timestamptz, ${ver},
            (${오늘}::date + 1)::timestamp at time zone ${시간대}::text, 'due.v1'
          )`;

        return {
          learner_id, status: 'assigned', event_id: 배정[0].event_id,
          intervention_id: null, degraded: g.degraded, 출처: g.출처,
        };
      });
    } catch (e) {
      const 글 = String((e as Error)?.message ?? e);
      console.error('[deliver] 게임 배정 실패', learner_id, 글);
      return { learner_id, status: 'failed', 사유: 글.slice(0, 200) };
    }
  }
  return null;
}

/** 한 학생 = 한 트랜잭션. 개입과 배정은 같이 서거나 같이 없다. */
async function 한명(학생: Record<string, unknown>, 오늘: string, ver: string, 스냅기준: string) {
  const learner_id = String(학생.learner_id);
  if (!학생.consent_ver) {
    return { learner_id, status: 'skipped', 사유: 'consent_missing' };
  }

  const 지금 = new Date().toISOString();
  const 공통 = {
    actor_kind: 'ai' as const,   // 배치가 만드는 사건의 행위자(§10-A-1 — `system` 을 새로 만들지 않는다)
    level_snapshot: (학생.level_current ?? null) as string | null,
    goal_snapshot: (학생.goal_track ?? null) as string | null,
    consent_ver: String(학생.consent_ver),
    // 동의 귀속(20260807120000) — 위 consent_ver 게이트가 무동의를 걸렀으니 여기선 항상 있다.
    consent_id: String(학생.consent_id),
  };

  const 게임결과 = await 게임갈래(학생, 오늘, ver);
  if (게임결과) return 게임결과;

  const 결정 = 오늘과제({
    날짜: 오늘,
    첫날: !학생.마지막배정,
    교정문: 학생.교정문 ?? null,
    전날문장: 따라말하기문장(학생.마지막스냅샷),
    /* 🔑 어제 그것이 «진짜 과제»였나 — 아니면 「전날」이 아니라 예비로 간다(08-26 유호 지시).
     *   안 넘기면 어제가 강등이어도 그 문장을 또 내고, 장애가 사흘이면 같은 문장이 사흘 나간다. */
    전날출처: 따라말하기출처(학생.마지막스냅샷),
    /* 급수 1~2·미정이면 ③이 「골라서 답하기」가 된다(설계 §6 · 판정은 `오늘과제` 안 `초급인가`).
     * 🔴 여기서 급수를 안 넘기면 **전원이 자유발화**가 된다 — 초급 학생은 말할 수 없어서
     *   아무것도 안 내고, 그날 발화는 소급 불가로 사라진다. 아래 `공통.level_snapshot` 과
     *   **같은 값**이어야 한다(행에 적히는 급수와 학생이 본 형식이 갈리면 안 된다). */
    급수: 학생.level_current ?? null,
    /* 예비 풀은 학생마다 다른 자리에서 시작한다 — 없으면 고를 수 없어 도입 폴백이 된다. */
    learner_id: 학생.learner_id ?? null,
  });

  /* 🔴 **결과 변수의 고리를 여기서 잇는다**(L0 §9-2 · C0 §4-1 `retry_of_event_id`).
   *   교정문이 오늘 ②슬롯에 나갔다면 오늘의 발화는 「그 교정을 받고 다시 낸 것」이다 —
   *   그 사실을 아는 곳은 배정을 정한 이 자리 하나뿐이고, 뒤로 갈수록 알 길이 없어진다
   *   (앱이 목록을 문장으로 대조하면 그건 추정이고, 같은 문장이 두 번 교정된 날 갈린다).
   * 🔑 판정은 `결정.출처` 에서 **파생**시킨다 — `학생.교정문` 을 다시 보면 첫날 규칙(교정문이
   *   있어도 도입이 이긴다 · `lib/오늘과제.js` §6-1)이 두 곳에 적히고 갈라진 쪽이 조용히 통과한다.
   * ⚠ 이 값은 `task.assigned` 행에 남고 `GET /v1/tasks` 가 그대로 앱에 준다. 성과 집계
   *   (`functions/progress` 교정재발화)는 `submission.created` 만 세므로 배정 행이 이 칸을
   *   들어도 숫자는 안 흔들린다 — 그 행은 **앱이 되돌려 실을 재료**로만 산다. */
  const 재발화고리 = 결정.출처 === '교정문' ? ((학생.원사건 ?? null) as string | null) : null;

  /* 개입 하나에 붙는 식별자다 — `event_id`(사건 채번)와 축이 다르다. 두 행이 **같은 값**을
   * 들어야 나중에 성과가 「어느 개입에 대한 것인가」를 이 값 하나로 잇는다(C0 §4-1 계승). */
  const intervention_id = crypto.randomUUID();

  /* 🔴 **사슬 ⑦칸이 여기서 처음 돈다** — 쌓인 원신호를 읽어 그 시점의 상태를 파생하고, 그
   *   결과를 개입 행에 스탬프한다(엔진도달_설계 §3 경로 A).
   * 🔑 `as_of` = **배치의 스냅 기준**이다(§11-4 D1 · 08-21) — 원신호를 자른 SQL 창과 같은
   *   시각이어야 「같은 as_of = 같은 표본」이 성립한다. 옛 판은 여기서 학생별 `지금` 을 써서
   *   창(now())과 상태(as_of)가 두 시점이었다. `ingested_as_of` 도 같은 값 — 늦적재(발생은
   *   창 안·적재는 기준 뒤)가 읽는 순간에 따라 끼는 것을 이중 cutoff 가 막는다(㉤).
   *   모듈이 기본값을 안 주는 이유는 «과거» 개입을 나중에 평가하는 자리에서 그 절단을
   *   빠뜨리면 미래가 섞이기 때문이고, 그 자리는 여기가 아니다.
   * 🔴 상태가 오늘의 과제를 **고르지는 않는다.** 지금 고르게 하면 그건 모델 없이 규칙을
   *   하드코딩하는 것이라 제품방향 불변식 5 의 「죽는 쪽」에 그대로 걸리고, 학생 0명이라
   *   그 규칙이 맞는지 잴 방법도 없다. 지금 남기는 것은 소급 불가한 것 — 「그때 그 학생이
   *   어떤 상태였고 그 판단의 근거가 무엇이었나」 — 뿐이고, 그것이 있어야 나중에 개입-효과
   *   짝(불변식 6)이 성립한다. 근거 없이 지나간 날은 되살릴 수 없다.
   * ⚠ 계산이 실패해도 배달은 나간다 — 스탬프는 부속이고 과제가 본체다. */
  let 상태: { estimator_version: string; estimator_confidence: number;
    evidence_refs: Record<string, unknown> } | null = null;
  try {
    /* 🔴 `시간대` 를 **넘겨준다** — 집중띠 축(v7)만 현지 시각을 쓰고, 안 넘기면 그 축은 조용히
     *   `null` 이다(모듈이 UTC 로 접는 것을 거부한다 · `lib/학습자상태.js` JSDoc). 여기서 IANA
     *   이름을 다시 적지 않는 이유는 이 파일 머리(93행)에 이미 적혀 있다. */
    상태 = 학습자상태((학생.원신호 ?? []) as unknown[], { as_of: 스냅기준, ingested_as_of: 스냅기준, 시간대 });
  } catch (e) {
    console.error('[deliver] 학습자 상태 계산 실패(배달은 계속한다)', learner_id, String((e as Error)?.message ?? e));
  }
  /* 🔴 **한 학생 = 한 왕복**(2026-08-22 수리). 옛 판은 `sql.begin` 안에서 다섯을 «차례로
   *   기다렸다»: BEGIN · 개입 · 배정 · 제출 · COMMIT. 그 기다림이 학생당 553ms 였고(실측),
   *   계산은 그중 거의 0 이었다 — 학급이 커지면 대기만으로 Edge 예산을 넘겼다.
   * 🔑 트랜잭션 껍데기를 안 연다 — **한 문장은 그 자체로 원자**라 「개입과 배정은 같이 서거나
   *   같이 없다」는 그대로다. `sql.begin` 은 여러 문장을 묶을 때 필요한 것이고, 문장이 하나면
   *   그 껍데기는 왕복 둘(BEGIN·COMMIT)만 더한다.
   * 🔑 CTE 는 전부 **같은 스냅샷**을 본다 — 그래서 아래 「있던 개입」 조회는 바로 위에서 넣은
   *   행을 못 본다. 그게 맞다: 그 갈래는 «넣기 전부터 있던» 행을 찾는 자리이고, 넣기에
   *   성공했으면 개입 CTE 가 값을 내므로 not exists 가 애초에 그 갈래를 막는다.
   * 🔑 배정이 고리를 **from 절로** 받는다(스칼라 부속질의가 아니라). 부속질의로 받으면 고리가
   *   비는 날 NULL 을 그대로 꽂지만, from 절이면 그날은 0행이라 아무 행도 안 선다 — 조용한
   *   오염 대신 «아무 일도 안 함»이고, 그건 아래 duplicate 갈래가 그대로 읽는다.
   * ⚠ 이 주석은 sql 템플릿 «밖»이다 — 안에 백틱이 한 글자라도 들어가면 리터럴이 끊기고 함수가
   *   번들조차 안 된다(F180). 템플릿 «안» 주석은 「」로만 강조한다. */
  try {
    const [r] = await sql`
      with 개입 as (
        /* 무엇을 배달했나 — 강등이면 ai + degraded 조합이 「AI 자리인데 AI가 못 했다」를 담는다.
         * 상태 스탬프 셋(판·신뢰도·근거)과 policy_ver 의 근거는 이 파일 머리말 ⑦ 절에 있다 —
         * 셋이 함께 있어야 나중에 다시 계산해 대조할 수 있고, policy_ver 는 「그 상태 위에서
         * 무엇을 골랐나」라 축이 다르다. 값은 결정이 들고 온다(고른 자가 서명한다). */
        insert into engine.learning_events (
          learner_id, event_type, actor_kind, occurred_at, idempotency_key,
          level_snapshot, goal_snapshot, intervention_id, consent_ver, consent_id, degraded,
          estimator_version, estimator_confidence, evidence_refs, policy_ver,
          source_kind, payload, schema_ver
        ) values (
          ${learner_id}::uuid, 'intervention.delivered', ${공통.actor_kind}, ${지금}::timestamptz,
          ${멱등키('intervention', learner_id, 오늘)},
          ${공통.level_snapshot}, ${공통.goal_snapshot}, ${intervention_id}::uuid,
          ${공통.consent_ver}, ${공통.consent_id}::uuid, ${결정.degraded},
          ${상태?.estimator_version ?? null}, ${상태?.estimator_confidence ?? null},
          ${상태 ? sql.json(상태.evidence_refs) : null}, ${결정.policy_ver},
          ${사건출처('intervention.delivered')}::engine.source_kind,
          ${sql.json({ ver: 1, output_text: 따라말하기문장(결정.task_snapshot) })}, ${ver}
        )
        on conflict (learner_id, idempotency_key) do nothing
        returning event_id, intervention_id
      ), 개입고리 as (
        /* 이미 오늘 것이 있으면 「그 개입을 잇는다」 — 새 uuid 로 갈아끼우면 재실행이 고리를 끊는다. */
        select intervention_id from 개입
        union all
        select e.intervention_id from engine.learning_events e
         where e.learner_id = ${learner_id}::uuid
           and e.idempotency_key = ${멱등키('intervention', learner_id, 오늘)}
           and not exists (select 1 from 개입)
      ), 배정 as (
        /* 「제출 안 함」의 분모(P0 §2-1). 없으면 「안 온 날」과 「낼 게 없던 날」이 같은 모양이다. */
        insert into engine.learning_events (
          learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
          level_snapshot, goal_snapshot, intervention_id, consent_ver, consent_id, degraded,
          retry_of_event_id, source_kind, payload, schema_ver
        )
        select ${learner_id}::uuid, 'task.assigned', ${통로}, ${공통.actor_kind}, ${지금}::timestamptz,
               ${멱등키('task', learner_id, 오늘)},
               ${공통.level_snapshot}, ${공통.goal_snapshot}, 고리.intervention_id,
               ${공통.consent_ver}, ${공통.consent_id}::uuid, ${결정.degraded},
               ${재발화고리}::uuid,
               ${사건출처('task.assigned')}::engine.source_kind, ${sql.json({ ver: 1 })}, ${ver}
          from 개입고리 고리
        on conflict (learner_id, idempotency_key) do nothing
        returning event_id
      ), 제출 as (
        /* 그날 학생이 볼 것 그대로 — task_format 은 비운다(호흡마다 다르다).
         * due_at·due_ver = 마감 시각·마감 판본(c10 · 소급 불가 · 유호님 승인 08-08). 습관 축의
         * 원신호는 「몇 시에 냈나」가 아니라 «마감까지 몇 분 남기고 냈나»다. 수업표가 바뀌면 그때
         * 그 학생의 마감은 다시 계산할 근거가 사라지므로 배정 순간에 박는다. 오프셋 상수를 안
         * 적고 DB 에게 시킨다(at time zone) — 여기서 JS 로 계산하면 절단문서 ①-14 의 재발이다.
         * 「오늘」은 배치가 도는 날이 아니라 몽골날짜()가 낸 배정 대상일이라, 배치가 자정을
         * 넘겨 돌아도 마감이 하루 밀리지 않는다. */
        insert into engine.submissions (
          event_id, task_type, task_ref, task_snapshot, task_schema_ver, occurred_at, schema_ver,
          due_at, due_ver
        )
        select 배정.event_id, ${통로}, ${결정.task_ref},
               ${sql.json(결정.task_snapshot)}, 'task.v1', ${지금}::timestamptz, ${ver},
               (${오늘}::date + 1)::timestamp at time zone ${시간대}::text, 'due.v1'
          from 배정
        returning submission_id
      )
      select (select intervention_id from 개입고리) as 개입id,
             (select event_id from 배정) as 배정id,
             (select count(*) from 제출)::int as 제출수`;

    if (!r || !r.배정id) {
      /* 재실행. 결정론적 키가 접었다 — 오류가 아니다(C0 §4-1 · §10-A-4).
       * 🔴 단 «빈 배정»(배정 사건은 있는데 submissions 0 — 아래 자인 주석의 「원리상 안 나는」
       *   그 행)이면 duplicate 로 접기 «전에» 제출 행만 보충한다(심문 T11): tasks 조인이 inner
       *   join 이라 그 행은 학생에게 영구 «없음»이고, 멱등 때문에 다음 배달도 구제도 그 자리를
       *   못 고친다 — 자가치유 경로가 여기 하나뿐이다. 보충은 그날 결정(같은 스코프)의 스냅샷
       *   그대로·not exists 게이트라 정상 재실행에는 0행(비용 = select 1회)이다. */
      const 보충 = await sql`
        with 빈배정 as (
          select e.event_id, e.intervention_id, e.degraded
            from engine.learning_events e
           where e.learner_id = ${learner_id}::uuid
             and e.idempotency_key = ${멱등키('task', learner_id, 오늘)}
             and not exists (select 1 from engine.submissions s where s.event_id = e.event_id)
        ), 보충제출 as (
          insert into engine.submissions (
            event_id, task_type, task_ref, task_snapshot, task_schema_ver, occurred_at, schema_ver,
            due_at, due_ver
          )
          select 빈배정.event_id, ${통로}, ${결정.task_ref},
                 ${sql.json(결정.task_snapshot)}, 'task.v1', ${지금}::timestamptz, ${ver},
                 (${오늘}::date + 1)::timestamp at time zone ${시간대}::text, 'due.v1'
            from 빈배정
          returning event_id
        )
        select b.event_id as 배정id, b.intervention_id as 개입id, b.degraded
          from 빈배정 b join 보충제출 on 보충제출.event_id = b.event_id`;
      if (보충.length) {
        console.error('[deliver] 🔴 빈 배정을 보충했다(T11 자가치유) — 이 로그가 반복되면 생산자를 조사하라', learner_id, 보충[0].배정id);
        return {
          learner_id, status: 'assigned', event_id: 보충[0].배정id,
          intervention_id: 보충[0].개입id, degraded: 보충[0].degraded, 출처: 결정.출처,
          상태없음: 상태 === null,
        };
      }
      return { learner_id, status: 'duplicate', degraded: 결정.degraded, 출처: 결정.출처 };
    }
    /* 🔴 배정은 섰는데 제출이 0 이면 큐가 «빈 배정»으로 선 것이다 — 앱이 그 행을 읽어도 보여줄
     *   것이 없고, 다음 배달은 멱등이라 그 자리를 못 고친다. 한 문장이라 원리상 안 나지만,
     *   그 「원리상」이 틀린 날을 조용히 넘기지 않는다. */
    if (r.제출수 !== 1) {
      console.error('[deliver] 🔴 배정은 섰는데 제출이 안 섰다', learner_id, r.배정id, r.제출수);
    }
    return {
      learner_id, status: 'assigned', event_id: r.배정id,
      intervention_id: r.개입id, degraded: 결정.degraded, 출처: 결정.출처,
      /* 🔴 스탬프가 빈 채로 나간 배달이다(위 `상태` catch). 배달 자체는 **성공**이라 어느
       *   status 로도 안 드러나는데, 못 적은 근거는 **소급 불가**다("근거 없이 지나간 날은
       *   되살릴 수 없다" — 위 주석). 그래서 성공 응답에 표식을 남긴다. */
      상태없음: 상태 === null,
    };
  } catch (e) {
    /* 한 학생이 실패해도 나머지는 배달한다 — 전건을 4xx 로 접으면 그 한 명이 반 전체의
     * 큐를 막는다(C0 §4-1 이 head-of-line blocking 으로 못박은 그 형태). */
    const 글 = String((e as Error)?.message ?? e);
    console.error('[deliver] 배정 실패', learner_id, 글);
    return { learner_id, status: 'failed', 사유: 글.slice(0, 200) };
  }
}
