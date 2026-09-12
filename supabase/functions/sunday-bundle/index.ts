/* 일요일 자율일 묶음 인제스트 — 토요일 밤 배치(appsscript `자율일다리_`)가 `engine.sunday_bundles` 에 닿는 문.
 * (appsscript `docs/자율일_설계_v1.md` v1.3 §⑧ 「다리의 몸통」 · 유호 확정 09-07 「일요일은 자율」)
 *
 * ■ 이 문이 놓는 것은 «재료»이지 «큐»가 아니다
 *   과제 큐는 `task.assigned` 사건 + 그 `submissions.task_snapshot` 이다(P0 §6-1 · F124). 이 함수는 거기 손대지
 *   않는다 — 배정 사건에 함께 실려야 하는 동의판·급수 스냅샷·목표 스냅샷·consent_id 의 조립은 `functions/deliver`
 *   하나가 알고, 그 조립이 두 곳에 살면 갈라진다. ⇒ 여기는 표에 놓기까지, 일요일 배치가 그 행을 읽어 평소와
 *   같은 길로 낸다. 🔴 그래서 이 함수가 200 을 내도 «학생이 받았다»는 뜻이 아니다(다음 배치가 낸다).
 *
 * ■ 🔴 `verify_jwt` 는 이 문의 자물쇠가 아니다 (roster-ingest·radio-ingest 동형)
 *   플랫폼 검증은 anon 키로도 통과한다. 판정은 `SUNDAY_BUNDLE_SECRET` 하나가 진다. 🔴 시크릿 **미설정이면 503** —
 *   401 도 200 도 아니다. 없는 자물쇠를 「통과」로 읽으면 설정을 빠뜨린 날 문이 통째로 열리고 증상이 아무 데도 안 남는다.
 *
 * ■ 거절의 단위 — 묶음별 (스윕과 같은 축 · F103)
 *   무인 배치에서 전량 거절은 학생 하나의 문제가 «반 전원»을 막는 모양이 된다. 문제 묶음은 행별로 걸러 응답에
 *   배정ID 와 사유로 싣고(호출자가 알림으로 소리 낸다), 멀쩡한 것은 흘린다. 🔑 다만 **봉투가 아니라 몸통이
 *   깨진 경우**(자율일 날짜 없음 · 묶음이 배열이 아님)는 전량 거절이다 — 그건 한 학생의 문제가 아니다.
 *
 * ■ 🔴 발행 뒤 불변 — 같은 배정ID 가 다시 와도 안 갈아 끼운다 (자율일 설계 §③-㉠)
 *   토요일 밤 배치는 「어디까지 보냈나」 상태를 안 만든다(그 상태가 곧 유실 지점이다) — 그래서 같은 판을 다시
 *   보내는 것이 정상 동작이고, 여기서 `do nothing` 이 흡수한다. 예외 하나: **항목이 0 이던 재료가 채워져 오면
 *   받는다**(공급 실패가 늦게 나은 날 · 배포 검수 P3 21f680c14c40). 그 갈래만 갱신이고, 이미 낸 재료
 *   (`delivered_event_id is not null`)는 그때도 안 건드린다 — 학생이 이미 본 것을 뒤에서 바꾸지 않는다.
 *
 * ■ 학생을 잇는 자 = `student_code` 하나
 *   시트의 학생번호를 `학생계정.학생번호표기` 로 표기형으로 맞춰 `engine.learners` 와 잇는다(roster-ingest 와
 *   **같은 함수**를 동봉해 쓴다 — 표기 규칙이 두 곳에 살면 같은 학생이 두 사람이 된다). 못 찾은 학생은 행별 거절이다.
 *   🔑 못 찾음은 흔한 정상이다(앱 미가입·퇴소). 그 학생의 일요일은 appsscript 쪽에서 «미집계»로 남는다.
 *
 * ■ 정답이 들어온다 — 앱으로는 안 나간다
 *   굳히기·오답 항목의 문항 스냅샷에는 정답 자리가 있다(채점은 appsscript `quiz_log` · 설계 §⑥). 학생에게
 *   나가는 것은 `lib/오늘과제.js` 의 **허용 목록**이 가르므로, 여기서 벗기지 않고 **받은 그대로** 둔다
 *   (서버가 베껴 채우지 않는다 · C0 §task_snapshot 규약). 벗기면 채점 원본이 어디에도 안 남는다.
 */
import postgres from 'npm:postgres@3.4.9';
import 재료규칙 from './자율일재료.mjs';
import 학생계정 from './학생계정.mjs';
import 계약 from './수집_교정_계약.json' with { type: 'json' };

/* 🔑 판정은 이 문이 아니라 `lib/자율일재료.js` 하나가 진다 — 문 안에 두면 시험이 못 태우고,
 *   그때부터 재는 것이 «행동»이 아니라 «소스 글자»가 된다(명부 통로와 같은 축 · F269). */
const { 봉투검증, 행별가르기, 채워도되나 } = 재료규칙 as {
  봉투검증: (몸: unknown) => { 자율일: string; 차시판: string; 묶음: unknown[]; 오류: string[] };
  행별가르기: (묶음들: unknown[], 자율일: string) => {
    정상: Array<{ 배정ID: string; 학생번호: string; 차시: number; 원본: Record<string, unknown> }>;
    문제들: Array<{ 배정ID: string; 사유: string }>;
  };
  채워도되나: (있던: unknown, 새묶음: unknown) => boolean;
};
const { 학생번호표기 } = 학생계정 as { 학생번호표기: (입력: string) => string };
const schema_ver = String((계약 as { 버전?: string }).버전 ?? '');

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** 길이를 먼저 흘리지 않는 비교 — 시크릿 비교의 기본형(roster-ingest·radio-ingest 와 같은 꼴). */
function 같은비밀(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let 다름 = 0;
  for (let i = 0; i < a.length; i += 1) 다름 |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return 다름 === 0;
}

/** GET — 그 자율일의 «찬 항목»을 배정별로 되돌려 준다(appsscript `자율일말하기제출_` 이 읽는다).
 *
 * ■ 왜 되돌리나 — 낭독·답하기는 talk 에만 남는다
 *   굳히기·오답은 appsscript `quiz_log` 가, 진단은 진단 세션이 쥔다. 낭독·답하기만 이쪽이라,
 *   이 답이 없으면 월요일 완주 판정에서 그 둘이 «미집계»로 남는다(설계 §④ — 조용히 완주로 접지 않는다).
 *
 * ■ 🔴 충족 조건은 «제출 존재»가 아니라 **전사 글자 수 > 0** (설계 §⑥ · 2회차 아스트라 P1)
 *   무음 녹음도 제출 행은 만든다. 그것을 찼다고 세면 「냈는데 아무 말도 안 한 날」이 완주가 된다.
 *   ⚠ 아직 전사가 안 붙은 제출은 «안 찬 것»으로 센다 — 화요일 재집계가 그 사이 붙은 것을 다시 센다.
 *
 * ■ 학생 식별자를 안 싣는다
 *   배정ID 안에 학생번호가 들어 있어 그 자체가 식별자다. 그래서 이름·이메일·learner_id 는 안 낸다 —
 *   appsscript 는 배정ID 로 제 시트 행을 찾으므로 더 줄 이유가 없다(적게 주는 쪽이 늘 안전하다).
 */
async function 되돌리기(day: string) {
  if (!날짜꼴받기(day)) return 봉투(400, { error: 'bad_day', 설명: 'day=yyyy-MM-dd 가 필요하다' });
  const 행들 = await sql`
    select b.assignment_id, b.bundle
      from engine.sunday_bundles b
     where b.autonomy_date = ${day}::date`;
  const 배정: Record<string, string[]> = {};
  for (const r of 행들) {
    const 묶음 = (r.bundle ?? {}) as { 항목?: Array<Record<string, unknown>> };
    const 항목ID들 = (묶음.항목 ?? [])
      .filter((a) => a && (a.종류 === '낭독' || a.종류 === '답하기'))
      .map((a) => String(a.항목ID ?? ''))
      .filter(Boolean);
    if (!항목ID들.length) { 배정[String(r.assignment_id)] = []; continue; }
    /* 제출인 행만 센다 — `submissions` 에는 배치가 쓴 배정 행도 산다(P0 §6-1). 안 걸면 «내기만 하면
     * 찬 것»이 되어 배정 1건이 제출 1건으로 세어진다(tasks·progress 가 지키는 그 자리와 같은 축). */
    const 찬것 = await sql`
      select distinct s.task_ref
        from engine.submissions s
        join engine.learning_events e on e.event_id = s.event_id
       where e.event_type = 'submission.created'
         and s.task_ref = any(${항목ID들}::text[])
         and coalesce(length(btrim(coalesce(s.body_original, s.transcript, ''))), 0) > 0`;
    배정[String(r.assignment_id)] = 찬것.map((x) => String(x.task_ref));
  }
  return 봉투(200, { ok: true, 자율일: day, 배정 });
}

const 날짜꼴받기 = (s: string) => /^\d{4}-\d{2}-\d{2}$/u.test(String(s ?? ''));

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') return 봉투(405, { error: 'method_not_allowed' });

  const 비밀 = Deno.env.get('SUNDAY_BUNDLE_SECRET') ?? '';
  if (!비밀) {
    console.error('[sunday-bundle] SUNDAY_BUNDLE_SECRET 미설정 — 문을 열지 않는다');
    return 봉투(503, { error: 'ingest_secret_unset' });
  }
  const 들고온 = req.headers.get('x-sunday-bundle-key') ?? '';
  if (!같은비밀(들고온, 비밀)) return 봉투(401, { error: 'unauthorized' });

  /* 🔑 GET 도 같은 자물쇠를 지난다 — 되돌려 주는 값에 배정ID(= 학생번호가 든 글자)가 실려서다.
   *   anon 키만으로 열면 밖에서 「그날 누가 무엇을 냈나」를 통째로 읽는다. */
  if (req.method === 'GET') {
    try {
      return await 되돌리기(new URL(req.url).searchParams.get('day') ?? '');
    } catch (e) {
      console.error('[sunday-bundle] 되돌리기 실패', e);
      return 봉투(500, { error: 'db_error', 설명: String((e as Error)?.message ?? e).slice(0, 300) });
    }
  }

  let 몸: Record<string, unknown>;
  try { 몸 = await req.json(); } catch { return 봉투(400, { error: 'bad_json' }); }

  /* 봉투가 깨진 것은 한 학생의 문제가 아니다 — 전량 거절이다(행별 거절은 그 아래부터). */
  const { 자율일, 차시판, 묶음, 오류: 봉투오류 } = 봉투검증(몸);
  if (봉투오류.length) return 봉투(400, { error: 'bad_body', 오류: 봉투오류 });

  const { 정상: 넣을것, 문제들 } = 행별가르기(묶음, 자율일);

  const 받음: string[] = [];
  const 건너뜀: string[] = [];   // 이미 있던 재료(발행 뒤 불변) — 정상이다
  const 채움: string[] = [];     // 항목 0 이던 재료가 채워져 온 갈래

  try {
    for (const r of 넣을것) {
      /* 표기형 맞추기는 `lib/학생계정.js` 하나가 진다 — 규칙이 두 곳에 살면 같은 학생이 두 사람이 된다. */
      const 학생코드 = 학생번호표기(r.학생번호);
      const 학생 = await sql`
        select learner_id from engine.learners where student_code = ${학생코드} limit 1`;
      if (!학생.length) { 문제들.push({ 배정ID: r.배정ID, 사유: `학생 없음(${학생코드})` }); continue; }
      const learner_id = 학생[0].learner_id as string;

      const 넣기 = await sql`
        insert into engine.sunday_bundles (
          assignment_id, learner_id, autonomy_date, week_no, week_ver, bundle, schema_ver
        ) values (
          ${r.배정ID}, ${learner_id}::uuid, ${자율일}::date, ${r.차시}, ${차시판},
          ${sql.json(r.원본 as unknown as Record<string, unknown>)}, ${schema_ver}
        )
        on conflict (assignment_id) do nothing
        returning assignment_id`;
      if (넣기.length) { 받음.push(r.배정ID); continue; }

      /* 이미 있다 — 기본은 그대로 둔다(발행 뒤 불변). 갱신해도 되는 갈래인지는 `채워도되나` 하나가 판정한다.
       * 🔑 `where` 에 같은 조건을 남기는 것은 규칙을 두 벌 두려는 게 아니라 **경쟁 보호**다(판정과
       *   쓰기 사이에 배치가 그 재료를 내면, 이미 낸 것을 뒤에서 바꾸게 된다). */
      const 있던 = await sql`
        select bundle, delivered_event_id from engine.sunday_bundles where assignment_id = ${r.배정ID} limit 1`;
      if (!채워도되나(있던[0], r.원본)) { 건너뜀.push(r.배정ID); continue; }
      const 채우기 = await sql`
        update engine.sunday_bundles
           set bundle = ${sql.json(r.원본 as unknown as Record<string, unknown>)},
               week_no = ${r.차시}, week_ver = ${차시판}, received_at = now(), schema_ver = ${schema_ver}
         where assignment_id = ${r.배정ID}
           and delivered_event_id is null
        returning assignment_id`;
      if (채우기.length) 채움.push(r.배정ID);
      else 건너뜀.push(r.배정ID);
    }
  } catch (e) {
    console.error('[sunday-bundle] 적재 실패', e);
    return 봉투(500, { error: 'db_error', 설명: String((e as Error)?.message ?? e).slice(0, 300) });
  }

  /* 🔑 `ok:true` 는 «표에 놓았다»는 뜻이지 «학생이 받았다»가 아니다 — 내는 것은 일요일 배치다.
   * 호출자(appsscript)는 이 봉투를 보고 성공을 판정한다(HTTP 200 만으로는 안 읽는다 · 명부스윕_ 규약). */
  return 봉투(200, {
    ok: true, 자율일, 차시판, schema_ver,
    받음: 받음.length, 채움: 채움.length, 건너뜀: 건너뜀.length, 문제: 문제들.length,
    문제들: 문제들.slice(0, 50),
  });
});
