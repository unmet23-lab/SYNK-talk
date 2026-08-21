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
 * ■ AI 문장 생성은 아직 없다 — 그리고 그 사실이 행에 남는다
 *   §6-1 셋째 갈래(급수·목적으로 생성)는 모델·프롬프트 계약이 없다. 그 자리는 §6-4 강등
 *   경로가 그대로 받는다: 전날 문장 → 없으면 고정 도입 과제 · **`degraded=true`**.
 *   판정은 `lib/오늘과제.js` 가 지고 회귀가 DB 없이 잰다.
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
import { 생성배달, 구제배달 } from './생성모드.ts';

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
const { 몽골날짜, 멱등키, 오늘과제, 따라말하기문장, 시간대 } = 과제모듈 as {
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
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
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
  const [r] = await sql`
    select (select count(*) from engine.learners) as 재적,
           (select count(*) from engine.learning_events
             where event_type = 'task.assigned'
               and (occurred_at at time zone ${시간대})::date = ${오늘}::date) as 배정,
           (select count(*) from engine.learning_events
             where event_type = 'task.assigned' and degraded
               and (occurred_at at time zone ${시간대})::date = ${오늘}::date) as 강등`;
  const 재적 = Number(r.재적), 배정 = Number(r.배정), 강등 = Number(r.강등);
  const 미달 = 배정 < 재적;
  if (미달) console.error(`[deliver] 🔴 배치 미달 — ${오늘} 배정 ${배정}/${재적}`);
  return 봉투(200, { ok: true, mode: '점검', date: 오늘, 재적, 배정, 강등, 미달 });
}

/** 학급과 재료를 «한 번에» — 배달(현행)과 생성 모드(§3 ① 선판정)가 **같은 재료**로 같은
 *  결정을 내게 하는 자리다(두 벌로 적으면 「전원」과 「생성」이 다른 학급을 본다). */
async function 대상조회(스냅기준: string, 한사람: string | null) {
  /* 단건이면 대상만 좁힌다 — 재료를 만드는 lateral 셋은 **그대로 탄다**(첫날 판정·교정문·동의).
   * 좁히는 자리를 여기 하나로 두면 「전원」과 「한 명」이 같은 재료로 같은 결정을 낸다. */
  const 좁히기 = 한사람 ? sql`where l.learner_id = ${한사람}::uuid` : sql``;
  /* 학생과 재료를 **한 번에** 읽는다(학생 수만큼 왕복하지 않는다).
   * · 마지막 배정 = 「첫날인가」와 「전날 문장」의 근거
   * · 교정문 = **지난 배정 뒤에 새로 확정된 것**만. 「최신 1건」으로 잡으면 같은 교정문이
   *   매일 ②슬롯에 다시 오고, 그건 §6-3 이 말한 「어제 나간 교정」이 아니다.
   * · 동의 = 지금 유효한 것. 없으면 배정하지 않는다(consent_ver 는 not null) — 그 학생은
   *   건너뛴 채 §6-5 미달로 드러난다. 동의 없이 배정하는 우회로를 만들지 않는다. */
  return await sql`
    select l.learner_id, l.level_current, l.goal_track,
           배정.occurred_at as 마지막배정, 배정.task_snapshot as 마지막스냅샷,
           교정.corrected_text as 교정문, 교정.correction_id as 교정id, 교정.원사건,
           동의.consent_ver, 동의.consent_id,
           재제출.원제출사건, 재제출.원시드, 재제출.원챌린지,
           원신호.행들 as 원신호
      from engine.learners l
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

  const 대상 = await 대상조회(스냅기준, 한사람);

  /* 🔴 단건인데 0건 = 없는 learner_id 로 불렸다는 뜻이다. 200 으로 넘기면 「배정 0/재적 0」이라
   *   미달 경고에도 안 걸려 **조용히 아무 일도 안 한 것**이 된다. 부른 쪽이 알아야 한다. */
  if (한사람 && !대상.length) {
    console.error('[deliver] 🔴 단건 대상 없음', 한사람);
    return 봉투(404, { ok: false, date: 오늘, mode: '단건', error: { code: 'NOT_FOUND', message: '그 학생이 없습니다' } });
  }

  /* 0행 가드(반박 ⑮ 동축)는 `lib/계약판.js` 가 진다 — 빈 이력에서 죽으면 500 의 이유가 로그에 안 남는다. */
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
  for (const 학생 of 대상) {
    results.push(await 한명(학생 as Record<string, unknown>, 오늘, ver, 스냅기준));
    /* 🔑 배달의 **부속이 아니라 나란한 일**이다 — 회수가 재는 것은 오늘 나가는 개입이 아니라
     *   «지난» 개입이라, 오늘 배달이 건너뛰거나 실패해도 회수는 그대로 성립한다. 그래서
     *   `한명()` 안에 넣지 않는다(반환 지점이 일곱이라 넣으면 반드시 몇 개를 빠뜨린다).
     * ⚠ 계산만 하고 아무것도 저장하지 않는다 — 저장하면 「이 개입은 효과 없음」이라는 틀린
     *   낙인이 굳는다(`lib/성과회수.js` 머리말 · 코어엔진 §원칙1). 내는 것은 계수뿐이다. */
    try {
      const r = 회수요약(((학생 as Record<string, unknown>).원신호 ?? []) as unknown[], { 기준시각 });
      회수들.push({ 개입: r.개입, 닿음: r.닿음, 고리없음: r.고리없음, 기술: r.기술 });
    } catch (e) {
      console.error('[deliver] 성과 회수 실패(배달은 계속한다)',
        (학생 as Record<string, unknown>).learner_id, String((e as Error)?.message ?? e));
      회수실패 += 1;
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
    ok: true, date: 오늘, contract_ver: ver, mode: 한사람 ? '단건' : '전원', 재적: 대상.length,
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
    /* 급수 1~2·미정이면 ③이 「골라서 답하기」가 된다(설계 §6 · 판정은 `오늘과제` 안 `초급인가`).
     * 🔴 여기서 급수를 안 넘기면 **전원이 자유발화**가 된다 — 초급 학생은 말할 수 없어서
     *   아무것도 안 내고, 그날 발화는 소급 불가로 사라진다. 아래 `공통.level_snapshot` 과
     *   **같은 값**이어야 한다(행에 적히는 급수와 학생이 본 형식이 갈리면 안 된다). */
    급수: 학생.level_current ?? null,
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
  try {
    return await sql.begin(async (tx) => {
      // ① 무엇을 배달했나 — 강등이면 `ai` + `degraded` 조합이 「AI 자리인데 AI가 못 했다」를 담는다.
      const 개입 = await tx`
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
          /* ⑦ 상태 스탬프. 계약이 이 셋을 「추정에 반드시 따라붙는 것」으로 정했다(코어엔진
           * §기록규격 · L0 스키마가 열까지 두고 writer 만 0 이던 자리). 셋이 함께 있어야
           * 나중에 **다시 계산해서 대조**할 수 있다 — 판·신뢰도·근거 중 하나만 빠져도 그때
           * 값이 왜 그랬는지 되짚을 길이 없다.
           * 🔴 policy_ver 는 **넷째 칸이지 추정메타가 아니다**(2026-08-09 · 이 자리가 「비운다」
           *   였던 것을 닫는다). 위 셋은 「상태를 **어떻게 쟀나**」고 이 칸은 「그 상태 위에서
           *   **무엇을 골랐나**」다 — 한 칸에 담으면 추정식만 고친 날과 선택 규칙만 고친 날이
           *   행에서 같은 모양이 되어, 개입-효과 짝(lib/성과회수.js)이 「무엇이 통했는지」를
           *   규칙 단위로 못 가른다.
           * ⚠ 백틱을 쓰지 않는다 — 이 주석은 sql 템플릿 리터럴 «안»이라 백틱 한 글자가 리터럴을
           *   끊고, 증상은 이 자리에서 한참 떨어진 「Missing semicolon」이다(2026-08-09 실측).
           * 🔑 값은 **결정이 들고 온다** — 고른 자가 서명한다. 여기서 상수를 다시 적으면
           *   같은 판정이 두 곳에 살고, 갈라진 날 행에는 고른 적 없는 규칙 이름이 찍힌다.
           * 🔑 상태 계산이 실패해도(위 try) 이 칸은 **그대로 찍힌다** — 상태를 못 쟀다는 것과
           *   무슨 규칙으로 골랐는지는 별개고, 실제로 그날도 규칙은 골랐다. */
          ${상태?.estimator_version ?? null}, ${상태?.estimator_confidence ?? null},
          ${상태 ? sql.json(상태.evidence_refs) : null}, ${결정.policy_ver},
          /* 이 두 행은 관측이 아니라 **추정**이다 — 오늘 이 문장을 준 것은 「이 학생에게
           * 이게 맞겠다」는 판단이고, 판단이 틀린 날의 저조를 학생 특성으로 읽지 않으려면
           * 그 사실이 행에 남아 있어야 한다(절단문서 ①-7 · lib/사건출처.js 가 표를 진다). */
          ${사건출처('intervention.delivered')}::engine.source_kind,
          ${sql.json({ ver: 1, output_text: 따라말하기문장(결정.task_snapshot) })}, ${ver}
        )
        on conflict (learner_id, idempotency_key) do nothing
        returning event_id, intervention_id`;

      // 이미 오늘 것이 있으면 **그 개입을 잇는다** — 새 uuid 로 갈아끼우면 재실행이 고리를 끊는다.
      const 개입id = 개입.length
        ? intervention_id
        : (await tx`select intervention_id from engine.learning_events
                     where learner_id = ${learner_id}::uuid
                       and idempotency_key = ${멱등키('intervention', learner_id, 오늘)}`)[0].intervention_id;

      // ② 배정 — 「제출 안 함」의 분모(P0 §2-1). 없으면 「안 온 날」과 「낼 게 없던 날」이 같은 모양이다.
      const 배정 = await tx`
        insert into engine.learning_events (
          learner_id, event_type, task_type, actor_kind, occurred_at, idempotency_key,
          level_snapshot, goal_snapshot, intervention_id, consent_ver, consent_id, degraded,
          retry_of_event_id, source_kind, payload, schema_ver
        ) values (
          ${learner_id}::uuid, 'task.assigned', ${통로}, ${공통.actor_kind}, ${지금}::timestamptz,
          ${멱등키('task', learner_id, 오늘)},
          ${공통.level_snapshot}, ${공통.goal_snapshot}, ${개입id}::uuid,
          ${공통.consent_ver}, ${공통.consent_id}::uuid, ${결정.degraded},
          ${재발화고리}::uuid,
          ${사건출처('task.assigned')}::engine.source_kind, ${sql.json({ ver: 1 })}, ${ver}
        )
        on conflict (learner_id, idempotency_key) do nothing
        returning event_id`;

      if (!배정.length) {
        // 재실행. 결정론적 키가 접었다 — 오류가 아니다(C0 §4-1 · §10-A-4).
        return { learner_id, status: 'duplicate', degraded: 결정.degraded, 출처: 결정.출처 };
      }

      /* ③ 그날 학생이 볼 것 그대로 — task_format 은 비운다(호흡마다 다르다).
       * 🔴 `due_at`·`due_ver` = **마감 시각·마감 판본**(c10 · 소급 불가 · 유호님 승인 08-08).
       *   습관 축의 원신호는 「몇 시에 냈나」가 아니라 «마감까지 몇 분 남기고 냈나»다. 수업표가
       *   바뀌면 그때 그 학생의 마감은 다시 계산할 근거가 사라지므로 **배정 순간에 박는다.**
       *   `due.v1` = 배정일의 끝 = 배정일 다음날 00:00. 🔑 오프셋 상수를 안 적고 **DB 에게
       *   시킨다**(`at time zone`) — 여기서 JS 로 계산하면 그 자리가 절단문서 ①-14 의 재발이다.
       *   ⚠ `오늘` 은 배치가 도는 날이 아니라 `몽골날짜()` 가 낸 **배정 대상일**이라, 배치가
       *   자정을 넘겨 돌아도 마감이 하루 밀리지 않는다. */
      await tx`
        insert into engine.submissions (
          event_id, task_type, task_ref, task_snapshot, task_schema_ver, occurred_at, schema_ver,
          due_at, due_ver
        ) values (
          ${배정[0].event_id}::uuid, ${통로}, ${결정.task_ref},
          ${sql.json(결정.task_snapshot)}, 'task.v1', ${지금}::timestamptz, ${ver},
          (${오늘}::date + 1)::timestamp at time zone ${시간대}::text, 'due.v1'
        )`;

      return {
        learner_id, status: 'assigned', event_id: 배정[0].event_id,
        intervention_id: 개입id, degraded: 결정.degraded, 출처: 결정.출처,
        /* 🔴 스탬프가 빈 채로 나간 배달이다(위 `상태` catch). 배달 자체는 **성공**이라 어느
         *   status 로도 안 드러나는데, 못 적은 근거는 **소급 불가**다("근거 없이 지나간 날은
         *   되살릴 수 없다" — 위 주석). 그래서 성공 응답에 표식을 남긴다. */
        상태없음: 상태 === null,
      };
    });
  } catch (e) {
    /* 한 학생이 실패해도 나머지는 배달한다 — 전건을 4xx 로 접으면 그 한 명이 반 전체의
     * 큐를 막는다(C0 §4-1 이 head-of-line blocking 으로 못박은 그 형태). */
    const 글 = String((e as Error)?.message ?? e);
    console.error('[deliver] 배정 실패', learner_id, 글);
    return { learner_id, status: 'failed', 사유: 글.slice(0, 200) };
  }
}
