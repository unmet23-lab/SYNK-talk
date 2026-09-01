/* 라디오 라운드 문 — 문항 팩·노출 이력 → «제안», 봇 ack → `radio.quiz_round` 행.
 * (라디오24_설계 §2-J·§4-5 · P3 · 2026-08-15 · 대기열 P1 #Q48 ②)
 *
 * ■ 이 문이 닫는 칸
 *   08-13 판정이 「지금 세우면 안 된다」로 막았던 마지막 한 칸이다. 막은 이유는 둘이었고
 *   둘 다 08-15 에 풀렸다: ①오버레이(표시층) 코드 0벌 → `bots/오버레이/전광판.html` 이 섰다
 *   ②`shown_at` 은 「화면에 나간 시각」이라 송출 없이 적으면 **안 보여준 것을 보여줬다고 적는
 *   행**이 된다 → 그래서 이 함수는 **두 문**이다.
 *
 * ■ 🔴 v2 (2026-09-01) — 「내보내는 쪽」이 전광판에서 **채팅 봇**으로 바뀌었다
 *   유호 확정 08-25 ① 로 퀴즈가 화면에서 **채팅으로 내려갔다**(라디오24 §8-2-1). 전광판은
 *   라운드를 안 그리므로 같은 날 «내보내는 문»을 닫았다 — 안 그린 것을 그렸다고 되쏘면
 *   그것이야말로 이 구조가 막으려던 행이기 때문이다.
 *   ⇒ ack 의 근거는 이제 봇의 **`liveChatMessages.insert` 성공 응답**(채팅에 오른 시각)이다.
 *   ⇒ **두 문은 그대로 산다.** 바뀐 것은 「누가 «나갔다»를 아는가」 하나이고, `노출해석` 의
 *      계약은 한 줄도 안 바뀌었다. 아래 ㉡㉢ 의 「화면/전광판」을 「봇」으로 읽으면 그대로 맞다.
 *
 * ■ 두 문 (판정은 전부 `라디오라운드.mjs` — fetch 옆의 판정은 회귀가 원리상 못 닿는다)
 *   ㉠ `제안` — 팩·검수장부·노출이력·승격요약을 읽어 문항 하나를 고른다. **DB 를 안 만진다.**
 *              돌려주는 **`채팅` 세 줄(출제·마감·정답)이 문안 정본**이고 봇이 그대로 친다.
 *              `화면` 도 함께 주지만 그건 마스코트 반응 신호일 뿐 문안이 아니다(v2).
 *              정답·해설은 `채팅.출제`·`화면` 어디에도 안 실린다(`채팅.정답` 은 공개 시점 것이다).
 *   ㉡ `노출` — 봇이 출제줄을 실제로 «친 뒤» 보내는 `{제안id, at}` 을 받아 그때서야
 *              `radio.quiz_round` 에 앉힌다. `shown_at = ack.at` = insert 성공 시각이다.
 *   ㉢ `마감` — `{종류:'마감확인'}` 을 받아 `closed_at` 을 적는다. 이게 없으면 승격기의
 *              「마감후」 제외(`라디오승격` 216행)가 **영원히 안 걸려** 늦은 답이 승격된다.
 *              🔑 시간 만료는 봇의 «추정»이라 ack 를 안 보낸다 ⇒ `closed_at` 은 그대로
 *              null 이고, 승격기는 null 을 「안 닫혔다」로 읽는다(정직한 빈칸).
 *
 * ■ 내용은 **팩에서 다시 조립한다** — 부르는 쪽 문안을 안 믿는다
 *   ack 가 실어 오는 것은 제안표(`제안id`) 하나뿐이고, 원장에 앉는 스냅샷은 이 함수가 든
 *   팩에서 다시 만든다. 그래서 봇이 고를 수 있는 것은 «어느 문항인가»뿐이고, 그마저
 *   검수확정 문항으로 좁혀진다(`검수확정=false` 인 문항은 송출 라운드에 못 쓴다 — 설계 게이트).
 *   제안↔ack 를 잇는 표는 **어디에도 저장하지 않는다**(사유 = `lib/라디오라운드.js` 머리말).
 *
 * ■ 🔴 좁은 시크릿 — `RADIO_ROUND_SECRET` (radio-ingest 와 같은 근거·같은 형태)
 *   부르는 쪽은 VPS 송출 런타임이다. `service_role` 을 들려 보내면 그 하나로 운영 DB 전체가
 *   열린다. 그리고 `verify_jwt` 는 자물쇠가 아니다 — anon 키도 유효한 JWT 라 앱 번들에서
 *   주워 온 키로 통과한다. **미설정이면 503 이다** — 없는 자물쇠를 「통과」로 읽으면 설정을
 *   빠뜨린 날 문이 통째로 열린다(새는 방향은 언제나 통과).
 *   ⚠ `radio-ingest` 와 시크릿을 **안 나눠 쓴다** — 수집봇과 송출 런타임은 다른 프로세스고,
 *     한쪽이 새면 다른 쪽까지 여는 자리를 안 만든다.
 *
 * ■ 멱등 — 재전송은 정상 동작이다
 *   ack 는 BroadcastChannel·postMessage 두 통로로 나가고(전광판 `내보내기`), 봇이 재시작하며
 *   다시 보낼 수도 있다. 같은 `제안id` 의 행이 이미 있으면 **그 round_id 를 그대로 돌려준다**
 *   (`task_snapshot->>'제안id'`). ⚠ 유일 인덱스가 아직 없어 동시 두 건이면 경합 창이 남는다 —
 *   v1 은 송출 런타임이 하나라 실질 0 이고, 정공은 다음 radio 조각의 부분 유일 인덱스다(잔여).
 */
import postgres from 'npm:postgres@3.4.4';
import 라운드모듈 from './라디오라운드.mjs';
import 팩모듈 from './토픽퀴즈문항.mjs';
import 장부모듈 from './토픽퀴즈검수장부.mjs';
import 편성모듈 from './라디오편성.mjs';
import 계약판모듈 from './계약판.mjs';

const { 제안조립, 노출해석, 마감초기본, 제안판, 제안id읽기, 송출가능문항, 정답줄 } = 라운드모듈 as {
  마감초기본: number;
  제안판: string;
  /* v2 — `정답문안` 문이 쓰는 셋. 문안을 봇이 조립하지 않게 하는 자리다. */
  제안id읽기: (값: string) => null | { 문항id: string; 발급ms: number; 부모round_id: number | null; 지문: string };
  송출가능문항: (문항들: unknown[], 장부: unknown) => { 문항들: { 문항id: string }[]; 분모: unknown };
  정답줄: (문항: unknown, 응답수: number | null) => string | null;
  제안조립: (재료: Record<string, unknown>) => {
    제안: null | {
      제안id: string; task_ref: string; 부모round_id: number | null;
      화면: Record<string, unknown>; 채팅: Record<string, unknown>;
      스냅샷: Record<string, unknown>;
      가중: number; 후보수: number; 총가중: number; 생성판: string;
    };
    분모: Record<string, unknown>;
  };
  노출해석: (재료: Record<string, unknown>) =>
    | { ok: true; task_ref: string; 부모round_id: number | null; 스냅샷: Record<string, unknown>; shown_at: string }
    | { ok: false; 사유: string };
};
const 팩 = 팩모듈 as { 문항판: string; 스킬판: string; 문항들: Array<Record<string, unknown>> };
const 장부 = 장부모듈 as Record<string, unknown>;
const { 승격요약, 창기본, 퀴즈통로 } = 편성모듈 as {
  창기본: number;
  퀴즈통로: string;
  승격요약: (행들: unknown[], 재료: Record<string, unknown>) => {
    요약: Record<string, { 응답: number; 오답: number }>;
    분모: Record<string, unknown>;
  };
};
const { 판번호, 행들에서판 } = 계약판모듈 as {
  판번호: (판: unknown) => number | null;
  행들에서판: (행들: unknown) => string | null;
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* `radio.quiz_round` 가 선 판. 승격(c11)과 다르다 — 이 문은 원장에만 적는다. */
const 최소판 = 10;

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** 길이를 먼저 흘리지 않는 비교 — 시크릿 비교의 기본형(radio-ingest 와 같은 함수). */
function 같은비밀(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let 다름 = 0;
  for (let i = 0; i < a.length; i += 1) 다름 |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return 다름 === 0;
}

const 판 = { 문항판: 팩.문항판, 스킬판: 팩.스킬판 };

/** 재고 축(§4-5 규칙 ①) — 창을 안 자른다. 「미노출 우선」은 통산 노출이 기준이다. */
async function 노출수읽기(): Promise<Record<string, number>> {
  const 행들 = await sql`select task_ref, count(*)::int as n from radio.quiz_round group by task_ref`;
  const out: Record<string, number> = {};
  for (const r of 행들) out[String(r.task_ref)] = Number(r.n);
  return out;
}

/**
 * 집단 되돌림 재료 — 승격된 라디오 퀴즈 응답 + 그 행의 제출 스냅샷.
 * 🔑 정오는 **저장값이 아니라 파생값**이라(계약이 `is_correct` 를 막았다) 두 칸을 맞대야
 *   나온다: `payload.selected_option` ↔ `submissions.task_snapshot.정답`. 그 맞댐은
 *   `라디오편성.승격요약` 하나가 지고, 여기는 재료만 걷는다.
 */
async function 승격행걷기(창일수: number) {
  /* ⚠ `occurred_at` 은 **ISO 문자열로** 받는다 — 드라이버가 timestamptz 를 JS Date 로 주면
   * `승격요약` 의 `Date.parse(행.occurred_at)` 이 ToString 을 거치며 **ms 를 조용히 깎는다**
   * (실측: .123 → .000). 창 경계에서만 드러나는 어긋남이라 증상이 거의 없다 — 그래서 문다.
   * (`radio-promote` 가 커서 sent_at 을 text 로 받는 것과 같은 계열의 처방이다.) */
  return await sql`
    select to_char(e.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as occurred_at,
           e.task_type, e.skill_ids, e.payload, s.task_snapshot
      from engine.learning_events e
      join engine.submissions s on s.event_id = e.event_id
     where e.event_type = 'quiz.answered' and e.task_type = ${퀴즈통로}
       and e.occurred_at > now() - make_interval(days => ${창일수})`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return 봉투(405, { error: 'method_not_allowed' });

  const 비밀 = Deno.env.get('RADIO_ROUND_SECRET');
  if (!비밀) {
    console.error('[radio-round] RADIO_ROUND_SECRET 미설정 — 문을 열지 않는다');
    return 봉투(503, { error: 'secret_unset' });
  }
  const 온것 = req.headers.get('x-radio-secret') ?? '';
  if (!같은비밀(온것, 비밀)) return 봉투(401, { error: 'bad_secret' });

  let 몸: Record<string, unknown>;
  try { 몸 = await req.json(); } catch { return 봉투(400, { error: 'bad_json' }); }
  const 문 = String(몸.문 ?? '');

  /* 계약판은 DB 에게 묻는다(events·deliver·radio-ingest 와 같은 근거) — 못 읽은 것은 못 읽었다고
   * 말한다. `radio.*` 가 없는 판에서 insert 하면 42P01 이 500 으로만 나가고 이유가 안 남는다. */
  const 판행 = await sql`select name as 최신조각 from engine.schema_migrations order by version desc limit 1`;
  const ver = 행들에서판(판행);
  if (!ver) {
    console.error('[radio-round] schema_migrations 에서 계약판을 못 읽었다');
    return 봉투(500, { error: 'schema_ver_unreadable' });
  }
  if ((판번호(ver) ?? 0) < 최소판) return 봉투(503, { error: 'contract_below_c10', ver });

  const 지금 = Date.now();

  /* ── ㉠ 제안 — DB 를 **안 만진다**(읽기만) ────────────────────────────────── */
  if (문 === '제안') {
    /* 씨앗은 부르는 쪽이 준다 — 여기서 시각을 읽어 만들면 「어느 씨앗이 이 문항을 냈나」가
     * 아무 데도 안 남아 재현이 죽는다(결정적 추첨을 고른 이유가 통째로 사라진다). */
    const 씨앗 = 몸.씨앗;
    if (typeof 씨앗 !== 'string' || !씨앗) return 봉투(400, { error: 'seed_required' });
    const 마감초 = Number.isInteger(몸.마감초) ? Number(몸.마감초) : 마감초기본;

    /* 재도전 짝 = «같은 skill 다른 문항»(스키마 `retry_of_round_id`). 부모 라운드에서 축과
     * 제외를 끌어온다 — 부르는 쪽이 축을 손으로 주면 짝의 정의가 두 곳에 살게 된다. */
    let 제외: string[] = [];
    let 축한정: string[] | null = null;
    let 부모round_id: number | null = null;
    if (몸.부모round_id != null) {
      const n = Number(몸.부모round_id);
      if (!Number.isInteger(n) || n <= 0) return 봉투(400, { error: 'bad_parent_round' });
      const 부모 = await sql`
        select round_id, task_ref, task_snapshot from radio.quiz_round where round_id = ${n} limit 1`;
      if (!부모.length) return 봉투(404, { error: 'parent_round_not_found', 부모round_id: n });
      부모round_id = n;
      제외 = [String(부모[0].task_ref)];
      const s = 부모[0].task_snapshot as Record<string, unknown> | null;
      const ids = s && Array.isArray(s.skill_ids) ? (s.skill_ids as string[]) : [];
      축한정 = ids.length ? ids : null;
    }

    const [노출수, 승격행] = await Promise.all([노출수읽기(), 승격행걷기(창기본 + 1)]);
    const 요약 = 승격요약(승격행 as unknown as unknown[], {
      기준시각: new Date(지금).toISOString(), 창일수: 창기본,
    });

    const { 제안, 분모 } = 제안조립({
      문항들: 팩.문항들, 판, 장부, 노출수, 승격요약: 요약.요약,
      씨앗, 제외, 축한정, 부모round_id, 지금, 마감초,
    });

    /* 팩이 마른 것과 「안 재봤다」를 분모가 가른다(F207) — 라운드가 안 나가는 날 방송에서
     * 보이는 것은 «아무 일도 없음»이라, 여기 사유가 없으면 원인을 아무도 못 읽는다. */
    if (!제안) {
      console.error('[radio-round] 제안 0 — ' + JSON.stringify(분모));
      return 봉투(200, { ok: true, ver, 제안: null, 분모, 되돌림분모: 요약.분모, 제안판 });
    }
    return 봉투(200, {
      ok: true, ver, 제안판,
      제안id: 제안.제안id, task_ref: 제안.task_ref, 부모round_id: 제안.부모round_id,
      /* 🔴 봇이 실제로 칠 세 줄 — 이것이 문안 정본이다(v2 · 200자 안이 보증된다).
       *   봇은 `채팅.출제` 를 친 뒤 그 성공 시각으로 ㉡`노출` ack 를 보낸다. */
      채팅: 제안.채팅,
      화면: 제안.화면,   // 마스코트 반응 신호(문안 아님 — v2)
      추첨: { 가중: 제안.가중, 후보수: 제안.후보수, 총가중: 제안.총가중, 생성판: 제안.생성판 },
      분모, 되돌림분모: 요약.분모,
    });
  }

  /* ── ㉠-2 정답문안 — 응답수를 실은 정답줄. **DB 를 안 만진다**(읽기만) ─────────
   * 왜 별도 문인가: 정답줄은 「함께 푼 사람 N」을 실어야 하는데 그 N 은 라운드가 끝나야 안다.
   * 봇이 제안 때 받은 문안을 **문자열 치환으로 고치면** 문안이 바뀌는 날 조용히 안 먹는다 —
   * 그래서 문안은 끝까지 이쪽이 만든다(이 파일의 「내용은 팩에서 다시 조립한다」와 같은 축).
   * 200자 규율·정답 자리 검사도 `정답줄` 이 그대로 진다. */
  if (문 === '정답문안') {
    const 표 = 제안id읽기(String(몸.제안id ?? ''));
    if (!표) return 봉투(400, { error: 'offer_id_malformed' });
    const { 문항들: 통과 } = 송출가능문항(팩.문항들, 장부);
    const 문항 = 통과.find((q: { 문항id: string }) => q && q.문항id === 표.문항id);
    if (!문항) return 봉투(400, { error: 'item_missing_or_unreviewed' });

    /* 🔴 응답수는 **부르는 쪽이 세지 않는다** — 봇이 세면 파서가 두 벌이 되고(회귀
     *   `라디오수집.test.js` 가 그걸 문다), 갈라진 것은 「원장 판대로 재파싱하면 될 것」처럼
     *   보여서 아무도 못 본다. 여기서 세는 것은 **원장에 이미 박힌** `command_kind` 다.
     *   창은 그 라운드의 `shown_at` 부터 `closed_at`(없으면 지금)까지.
     *   round_id 가 없으면(노출 ack 가 실패한 라운드) 세지 않는다 — 0 이 아니라 «모름»이다. */
    let 응답수: number | null = null;
    const rid = Number(몸.round_id);
    if (Number.isInteger(rid) && rid > 0) {
      const 센행 = await sql`
        select count(*)::int as n
          from radio.chat_message m
          join radio.quiz_round r on r.round_id = ${rid}::bigint
         where m.command_kind = '답'
           and m.sent_at >= r.shown_at
           and m.sent_at <= coalesce(r.closed_at, now())`;
      const n = 센행 && 센행[0] ? Number((센행[0] as { n: number }).n) : NaN;
      if (Number.isInteger(n) && n >= 0) 응답수 = n;
    }

    const 줄 = 정답줄(문항, 응답수);
    if (!줄) return 봉투(400, { error: 'answer_line_unbuildable' });
    return 봉투(200, { ok: true, ver, 정답: 줄, 응답수 });
  }

  /* ── ㉡ 노출 ack — **여기서만** 원장 행이 생긴다 ──────────────────────────── */
  if (문 === '노출') {
    const 해석 = 노출해석({
      제안id: 몸.제안id, at: 몸.at, 문항들: 팩.문항들, 판, 장부, 지금,
    });
    if (!해석.ok) return 봉투(400, { error: 'ack_rejected', 사유: 해석.사유 });

    /* 멱등 — 같은 제안표의 행이 이미 있으면 그것을 돌려준다. `where not exists` 를 insert 와
     * **한 문장**에 두어 왕복 사이의 창을 없앤다(그래도 유일 인덱스가 아니라 동시 두 건이면
     * 둘 다 앉는다 — 잔여로 적었다). */
    /* 🔴 `insert … select` 의 매개변수는 **전부 명시 캐스트**다. `values` 절과 달리 대상 열
     * 타입이 추론에 항상 닿는다고 볼 수 없고, 어긋나면 그 실패는 **첫 호출에서만** 난다
     * (배포는 성공한다 — 이 저장소가 반복해 겪은 그 모양). */
    const 넣기 = await sql`
      insert into radio.quiz_round (task_ref, task_snapshot, shown_at, retry_of_round_id, schema_ver)
      select ${해석.task_ref}::text, ${sql.json(해석.스냅샷)}::jsonb, ${해석.shown_at}::timestamptz,
             ${해석.부모round_id}::bigint, ${ver}::text
       where not exists (
         select 1 from radio.quiz_round where task_snapshot->>'제안id' = ${String(몸.제안id)})
      returning round_id, shown_at`;
    if (넣기.length) {
      return 봉투(200, { ok: true, ver, round_id: String(넣기[0].round_id), shown_at: 해석.shown_at, 새로: true });
    }
    const 이미 = await sql`
      select round_id, shown_at from radio.quiz_round
       where task_snapshot->>'제안id' = ${String(몸.제안id)} limit 1`;
    if (!이미.length) {
      /* 넣지도 못했고 찾지도 못했다 — 「없는 것을 있다고」 하지 않는다. */
      console.error('[radio-round] 노출 ack: insert 0행인데 기존 행도 없다 — ' + String(몸.제안id));
      return 봉투(500, { error: 'ack_insert_lost' });
    }
    return 봉투(200, {
      ok: true, ver, round_id: String(이미[0].round_id),
      shown_at: new Date(이미[0].shown_at as string).toISOString(), 새로: false,
    });
  }

  /* ── ㉢ 마감 ack — closed_at. 한 번 닫힌 것은 안 되돌린다 ────────────────── */
  if (문 === '마감') {
    const n = Number(몸.round_id);
    if (!Number.isInteger(n) || n <= 0) return 봉투(400, { error: 'bad_round_id' });
    const t = Date.parse(String(몸.at ?? ''));
    if (!Number.isFinite(t)) return 봉투(400, { error: 'bad_at' });
    /* 마감이 노출보다 앞설 수는 없다 — 그런 행은 승격기의 「마감후」 판정을 **전건 참**으로
     * 만들어 그 라운드의 응답을 통째로 지운다. DB 술어로 문다(왕복 사이 경합 없음). */
    const 닫기 = await sql`
      update radio.quiz_round set closed_at = ${new Date(t).toISOString()}::timestamptz
       where round_id = ${n} and closed_at is null and shown_at <= ${new Date(t).toISOString()}::timestamptz
      returning round_id, closed_at`;
    if (닫기.length) return 봉투(200, { ok: true, ver, round_id: String(n), closed_at: 닫기[0].closed_at, 새로: true });

    const 있나 = await sql`select round_id, shown_at, closed_at from radio.quiz_round where round_id = ${n} limit 1`;
    if (!있나.length) return 봉투(404, { error: 'round_not_found', round_id: String(n) });
    if (있나[0].closed_at != null) {
      return 봉투(200, { ok: true, ver, round_id: String(n), closed_at: 있나[0].closed_at, 새로: false });
    }
    return 봉투(400, { error: 'close_before_shown', round_id: String(n), shown_at: 있나[0].shown_at });
  }

  return 봉투(400, { error: 'unknown_door', 문: 문 || null, 아는문: ['제안', '노출', '마감'] });
});
