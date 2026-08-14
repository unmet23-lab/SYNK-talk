/* 명부 인제스트 — 아침 스윕(appsscript `명부스윕_`)이 `engine.learners` 에 닿는 문.
 * (E² · 철학정합 §3-E-2 · 유호 「전부 채택」 2026-08-11 — 「수집은 엔진 도달까지가 한 벌이다」)
 *
 * ■ 무엇을 자동화하나 — 사람 게이트는 그대로다
 *   크루카드 접수→반배정(사람 확인)→학생ID 발급→profiles 까지는 이미 자동이고, 남은 손일이
 *   「`tools/명부등록.js` 를 사람이 돌리는 것」 하나였다. 이 함수는 그 마지막 손을 옮긴다 —
 *   판정을 새로 만들지 않는다. **판정은 CLI 와 같은 `명부규칙.mjs`(동봉) 하나다**(F269 —
 *   문이 둘이어도 규칙은 한 벌. `tests/명부통로.test.js` 허용목록에 역할과 함께 등재).
 *
 * ■ 왜 시트가 DB 를 직접 안 쓰나 (radio-ingest 와 같은 축)
 *   Apps Script 에 놓인 비밀은 앱 전체 열쇠면 안 된다 — `service_role` 을 들려 보내면 그
 *   하나로 운영 DB 전체가 열린다. 스윕이 드는 것은 이 함수 하나만 여는 **좁은 시크릿**이고,
 *   DB 접속은 이 함수 안에만 산다.
 *
 * ■ 🔴 `verify_jwt` 는 이 문의 자물쇠가 아니다
 *   플랫폼 검증은 anon 키로도 통과한다(`lib/토큰.js` 머리말). 판정은 `ROSTER_INGEST_SECRET`
 *   하나가 진다. 🔴 시크릿 **미설정이면 503** — 401 도 200 도 아니다. 없는 자물쇠를 「통과」로
 *   읽으면 설정을 빠뜨린 날 문이 통째로 열리고 증상은 아무 데도 안 남는다(radio-ingest 동형).
 *
 * ■ 거절의 단위 — CLI 는 전량, 스윕은 행별 (판정은 같다 · lib/명부규칙.js 검증 절)
 *   CLI 는 사람이 그 자리에서 파일을 고칠 수 있어 「한 줄이라도 틀리면 전량 거절」이 안전이다.
 *   무인 스윕에서 전량 거절은 남의 오타 하나가 **신입 전원을 영원히 막는** 모양이 된다(F103) —
 *   문제 행은 행별로 걸러 응답에 **이름과 사유**로 싣고(호출자가 알림으로 소리 낸다), 멀쩡한
 *   행은 흘린다. 매 스윕이 전량을 다시 보내므로 고쳐지면 다음 아침 스스로 낫는다.
 *   ⛔ 연락처 어긋남(막힘)은 여기서도 **덮지 않는다** — 대조값을 갈 수 있는 것은 사람뿐이다.
 *
 * ■ 멱등은 두 겹이다
 *   ①같은 판을 다시 보내는 것이 정상 동작이다(스윕은 「어디까지 보냈나」 상태를 안 만든다 —
 *   그 상태가 곧 유실 지점이다) — `계획()` 이 기존 행을 건너뛴다. ②경쟁 삽입(CLI 와 같은 아침)은
 *   `on conflict (student_code) do nothing` 이 흡수한다 — `student_code` 는 c6 이 unique 로
 *   못박았고, 두 문 다 `학생번호표기()` 표기형만 넣으므로 exact unique 로 충분하다.
 *
 * ■ `schema_ver` 는 CLI 와 같은 정본에서 온다
 *   CLI 는 `계약/수집_교정_계약.json` 의 `버전` 을 읽는다. 이 함수도 **같은 파일**을 동봉으로
 *   실어 같은 칸을 읽는다 — DB 마이그레이션 이름으로 대신 세면 두 문의 도장이 갈라진다
 *   (repo 가 DB 보다 앞선 날, CLI=c10 · 함수=c9). 동봉 사본의 낡음은 커밋 훅(`동봉신호`)과
 *   `배포대조` 가 잡는다.
 *
 * ■ 이 함수는 계정을 만들지 않는다 (⛔ F269)
 *   계정이 서는 자리는 첫 등록(`functions/auth`) 하나다. 여기는 학생이 첫 등록에서 대조할
 *   **재료(명부 행)** 를 놓는 것까지다. 동의도 만들지 않는다 — 받은 사실이 없는데 만들면
 *   위조다(`tools/동의발급.js` 하나). 동의 0건 학생은 세어서 응답에 싣기만 한다.
 */
import postgres from 'npm:postgres@3.4.4';
import 명부규칙 from './명부규칙.mjs';
import 학생계정 from './학생계정.mjs';
import 로그인코드 from './로그인코드.mjs';
import 계약 from './수집_교정_계약.json' with { type: 'json' };

const { 머리글자리, 표읽기, 행별가르기, 반미배정, 계획 } = 명부규칙 as {
  머리글자리: (표: string[][]) => { 오류: string[] };
  표읽기: (표: string[][]) => {
    행들: Array<{ 번호: string; 전화: string; 이름: string; 역할: string; 반: string; 줄: number }>;
    대상아닌행?: Array<{ 역할: string }>;
    오류: string[];
  };
  행별가르기: (행들: unknown[]) => {
    정상: Array<{ 번호: string; 전화: string; 이름: string; 반: string; 줄: number }>;
    문제들: Array<{ 줄: number; 번호: string; 사유: string }>;
  };
  반미배정: (행들: unknown[]) => Array<{ 줄: number; 번호: string }>;
  계획: (행들: unknown[], 있는행들: unknown[]) => {
    넣을것: Array<{ 번호: string; 전화: string; 이름: string }>;
    건너뛴것: Array<{ 번호: string }>;
    막힌것: Array<{ 번호: string; 사유: string }>;
  };
};
const { 학생번호표기 } = 학생계정 as { 학생번호표기: (입력: string) => string };
const { 정규형 } = 로그인코드 as { 정규형: (입력: string) => string };

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 한 판의 상한. 명부는 방송 채팅이 아니다 — 넘치면 자르지 않고 **통째로 거절한다.**
 * 잘라 넣으면 「완료」 얼굴로 일부만 서고, 빠진 학생은 개원 첫날에야 드러난다(전량 거절과 같은 축). */
const 최대행 = 1000;

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** 길이를 먼저 흘리지 않는 비교 — 시크릿 비교의 기본형(radio-ingest 와 같은 꼴 · 셋째 사본이 생기면 lib 으로). */
function 같은비밀(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let 다름 = 0;
  for (let i = 0; i < a.length; i += 1) 다름 |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return 다름 === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return 봉투(405, { error: 'method_not_allowed' });

  const 비밀 = Deno.env.get('ROSTER_INGEST_SECRET') ?? '';
  if (!비밀) {
    console.error('[roster-ingest] ROSTER_INGEST_SECRET 미설정 — 문을 열지 않는다');
    return 봉투(503, { error: 'ingest_secret_unset' });
  }
  const 들고온 = req.headers.get('x-roster-ingest-key') ?? '';
  if (!같은비밀(들고온, 비밀)) return 봉투(401, { error: 'unauthorized' });

  let 몸: Record<string, unknown>;
  try { 몸 = await req.json(); } catch { return 봉투(400, { error: 'bad_json' }); }

  const 원본표 = Array.isArray(몸.표) ? (몸.표 as unknown[][]) : null;
  if (!원본표) return 봉투(400, { error: 'bad_body', 설명: '{ 표: 칸들의 2차원 배열 } 이 필요하다 — 첫 행은 머리글' });
  if (원본표.length > 최대행) {
    return 봉투(400, { error: 'too_many_rows', 받은행: 원본표.length, 상한: 최대행 });
  }

  /* 시트 API 가 숫자·null 을 낼 수 있다 — 규칙 lib 은 CLI 의 문자열 세계를 살므로 여기서 접는다. */
  const 표 = 원본표.map((행) => (Array.isArray(행) ? 행 : []).map((c) => String(c == null ? '' : c)));

  /* 머리글이 안 서면 표 전체가 읽기 불가다 — 행 하나의 문제가 아니라서 여기서는 스윕도 멈춘다
   * (위치로 짐작하면 이름을 전화로 읽는다 · lib 머리말). 호출자는 이 오류를 그대로 알림에 싣는다. */
  const 머리 = 머리글자리(표);
  if (머리.오류.length) return 봉투(400, { error: 'bad_header', 오류: 머리.오류 });

  const { 행들, 대상아닌행, 오류: 역할오류들 } = 표읽기(표);
  const { 정상, 문제들 } = 행별가르기(행들);

  const 접힌번호 = 정상.map((r) => 정규형(r.번호));
  const 있는것 = 접힌번호.length
    ? await sql`select student_code, contact, auth_user_id from engine.learners
        where upper(replace(student_code, '-', '')) in ${sql(접힌번호)}`
    : [];
  const { 넣을것, 건너뛴것, 막힌것 } = 계획(정상, 있는것 as unknown[]);

  /* ── 반 (설계 §3 · §8-1) ─────────────────────────────────────────────────────
   * 시트 5열(`class_name`)이 여기서 **처음** 읽힌다 — 그동안 열별칭에 없어 통째로 버려졌다.
   * 두 걸음이다: ①좌표를 `engine.classes` 에 세우고 ②학생에 매단다.
   *
   * ⛔ 연락처가 어긋난 행(`막힌것`)은 아예 뺀다 — 같은 사람인지 모르는 행에 반을 적으면
   *   그 학생을 **남의 반에 넣는 것**이고, 그러면 강사가 남의 학생 원문을 보게 된다.
   * 🔑 반이 빈 칸이면 거절이 아니라 **셈**이다(`반미배정` · lib 머리말) — 여기서 거절하면
   *   반 배정이 앱 접속의 선행 조건이 되어, 배정 전 학생이 통째로 잠긴다. */
  const 막힌번호 = new Set((막힌것 as Array<{ 번호: string }>).map((m) => 정규형(m.번호)));
  const 반있는행 = 정상.filter((r) => (r.반 || '') !== '' && !막힌번호.has(정규형(r.번호)));
  const 반좌표들 = [...new Set(반있는행.map((r) => r.반))];

  const 반지도 = new Map<string, string>();
  let 새반: string[] = [];
  if (반좌표들.length) {
    /* 열린 시즌 = `ends_on is null`(겹침은 `season_no_overlap_c11` 이 막으므로 최대 하나).
     * 없으면 null = 「시즌 밖」이고, 미개원 지금이 정확히 그 상태다. */
    const [시즌] = await sql`select season_id from engine.season
      where ends_on is null order by starts_on desc limit 1`;
    const 시즌id = (시즌 as { season_id: string } | undefined)?.season_id ?? null;
    const 반값들 = 반좌표들.map((k) => ({
      class_key: k,
      display_name: k,          // 시트엔 좌표 하나뿐이다 — 사람이 부르는 이름은 뒤에 갈린다
      season_id: 시즌id,
      schema_ver: (계약 as { 버전: string }).버전,
    }));
    /* 🔑 `on conflict do nothing` 에 **대상을 안 적는다** — 유일성이 부분 인덱스 «둘»이라
     *   (시즌 안 / 시즌 밖) 어느 하나를 지목하면 다른 쪽 충돌이 그대로 터진다. */
    const 만든것 = await sql`
      insert into engine.classes ${sql(반값들 as unknown as Record<string, never>[], 'class_key', 'display_name', 'season_id', 'schema_ver')}
      on conflict do nothing
      returning class_key`;
    새반 = (만든것 as unknown as Array<{ class_key: string }>).map((r) => r.class_key);
    const 있는반 = await sql`select class_id, class_key from engine.classes
      where class_key in ${sql(반좌표들)} and season_id is not distinct from ${시즌id}`;
    for (const r of 있는반 as unknown as Array<{ class_id: string; class_key: string }>) {
      반지도.set(r.class_key, r.class_id);
    }
  }

  let 새로: string[] = [];
  if (넣을것.length) {
    const 행값들 = 넣을것.map((r) => ({
      student_code: 학생번호표기(r.번호),
      contact: r.전화,
      display_name: r.이름 || null,
      class_id: 반지도.get(r.반) ?? null,
      schema_ver: (계약 as { 버전: string }).버전,
    }));
    const 결과 = await sql`
      insert into engine.learners ${sql(행값들 as unknown as Record<string, never>[], 'student_code', 'contact', 'display_name', 'class_id', 'schema_ver')}
      on conflict (student_code) do nothing
      returning student_code`;
    새로 = (결과 as unknown as Array<{ student_code: string }>).map((r) => r.student_code);
  }

  /* 🔴 **이미 있는 학생의 반은 위 insert 가 못 고친다** — `계획()` 이 기존 행을 `건너뛴것` 으로
   *   빼 두므로 그 행은 insert 에 아예 안 실리고, `on conflict do update` 를 달아도 경쟁
   *   삽입에서만 발화한다. 반은 시즌마다 바뀌는 값이라 그러면 첫 배정 이후 영원히 안 바뀐다.
   *   그래서 갱신은 **별도 한 문장**으로 낸다.
   * ⚠ 갱신 대상은 `class_id` **한 칸뿐**이다(설계 §3 ⚠) — 전체 upsert 로 넓히면 시트 오타
   *   한 번에 이름·연락처가 원본에서 덮인다. 연락처는 어느 문도 안 덮는다(lib `대조판정`).
   * 🔑 `is distinct from` 으로 **바뀐 행만** 센다 — 안 그러면 매 스윕이 전원 갱신으로 뜨고,
   *   그 수는 「무엇이 달라졌나」를 하나도 못 알려준다. */
  let 반갱신: string[] = [];
  const 짝들 = 반있는행
    .map((r) => ({ code: 학생번호표기(r.번호), id: 반지도.get(r.반) ?? null }))
    .filter((p): p is { code: string; id: string } => p.id !== null);
  if (짝들.length) {
    const 결과 = await sql`
      update engine.learners l set class_id = v.class_id
        from (select unnest(${짝들.map((p) => p.code)}::text[]) as student_code,
                     unnest(${짝들.map((p) => p.id)}::uuid[]) as class_id) v
       where l.student_code = v.student_code
         and l.class_id is distinct from v.class_id
      returning l.student_code`;
    반갱신 = (결과 as unknown as Array<{ student_code: string }>).map((r) => r.student_code);
  }

  /* ── 조·좌석 (숙제서클 §10-3 · 20260814100000) ──────────────────────────
   * `조편성` 은 시트 `groups` 의 **현 시즌 전체 스냅샷**이다([[학생번호, 조, 좌석]]).
   * 있으면 스냅샷 의미로 받는다: 실린 학생은 그 값으로, 안 실린 학생은 **비운다** —
   * 재편성에서 빠진 학생의 옛 조가 남으면 검수 콘솔이 그 학생을 남의 조에 계속 그린다.
   * 키가 아예 없으면 옛 스윕이다 — 아무것도 안 한다(호환의 방향은 「무동작」이지
   * 「전부 비움」이 아니다 · 빈 배열만이 「편성이 없다」다).
   * ⛔ 연락처 어긋남(`막힌것`)은 반과 같은 이유로 뺀다 — 같은 사람인지 모르는 행의 조는
   *   적지 않는다. 빠진 학생은 스냅샷 미언급과 같은 길로 비워져 화면에 「조 미편성」으로
   *   **보인다**(조용히 남의 조에 앉는 것보다 낫다). */
  let 조갱신: string[] = [];
  let 조해제 = 0;
  const 조편성문제: Array<{ 줄: number; 번호: string; 사유: string }> = [];
  if (Array.isArray(몸.조편성)) {
    const 짝지도 = new Map<string, { g: number; s: number; 줄: number; 원번호: string }>();
    (몸.조편성 as unknown[]).forEach((원행, i) => {
      const [sid, 조글, 좌석글] = (Array.isArray(원행) ? 원행 : [])
        .map((c) => String(c == null ? '' : c).trim());
      const 줄 = i + 1;
      if (!sid) { 조편성문제.push({ 줄, 번호: '', 사유: '학생 번호가 비었다' }); return; }
      const 조 = Number(조글);
      const 좌석 = Number(좌석글);
      if (!Number.isInteger(조) || 조 < 1 || 조 > 20 || !Number.isInteger(좌석) || 좌석 < 1 || 좌석 > 20) {
        /* DB CHECK(1~20)와 같은 못 — 여기서 걸러야 한 행의 쓰레기가 판 전체 갱신을 못 막는다. */
        조편성문제.push({ 줄, 번호: sid, 사유: `조·좌석이 1~20 정수가 아니다(조=${조글} 좌석=${좌석글})` });
        return;
      }
      if (막힌번호.has(정규형(sid))) {
        조편성문제.push({ 줄, 번호: sid, 사유: '연락처 대조가 막힌 학생 — 조를 적지 않는다' });
        return;
      }
      // 같은 학생 두 줄 = 뒤가 이긴다(시트 최신판) · 줄·원번호는 되돌릴 때 사람이 찾을 재료다
      짝지도.set(학생번호표기(sid), { g: 조, s: 좌석, 줄, 원번호: sid });
    });
    const 코드들 = [...짝지도.keys()];
    if (코드들.length) {
      /* `is distinct from` 으로 바뀐 행만 센다 — 반갱신과 같은 이유(매 스윕 전원 갱신이 되면
       * 이 수는 아무것도 못 알려준다). */
      const 갱신 = await sql`
        update engine.learners l
           set group_no = v.g, seat_no = v.s
          from (select unnest(${코드들}::text[]) as student_code,
                       unnest(${코드들.map((c) => 짝지도.get(c)!.g)}::smallint[]) as g,
                       unnest(${코드들.map((c) => 짝지도.get(c)!.s)}::smallint[]) as s) v
         where l.student_code = v.student_code
           and (l.group_no is distinct from v.g or l.seat_no is distinct from v.s)
        returning l.student_code`;
      조갱신 = (갱신 as unknown as Array<{ student_code: string }>).map((r) => r.student_code);

      /* 🔴 **명부에 없는 번호는 여태 아무 데도 안 적히고 아무 말도 안 했다**(반박 P2-③).
       * `update … where student_code = v.student_code` 는 0행 매치를 오류로 안 낸다 — 그리고
       * 바로 아래 해제가 그 학생을 「스냅샷에 안 실린 사람」으로 보고 **실물 학생의 조를 지운다.**
       * groups 시트의 번호 한 글자 오타가 매일 아침 되풀이되고, 알림은 0이며, 증상은 그 학생만
       * 「조 미편성」으로 뜨는 것뿐이다 — 편성 전과 **같은 모양**이라 아무도 못 가른다.
       * 🔑 그래서 **짝 수와 매치 수를 대조한다**: 안 맞은 번호는 조편성문제로 되돌려, 시트를
       *   고칠 사람에게 줄·번호·사유로 간다(갱신 0행 = 「값이 같았다」이지 「없다」가 아니므로
       *   `조갱신` 의 길이로는 이 구분을 원리상 못 한다). */
      const 없는것 = await sql`
        select v.student_code from (select unnest(${코드들}::text[]) as student_code) v
         where not exists (select 1 from engine.learners l where l.student_code = v.student_code)`;
      (없는것 as unknown as Array<{ student_code: string }>).forEach((r) => {
        const 짝 = 짝지도.get(r.student_code);
        조편성문제.push({
          줄: 짝 ? 짝.줄 : 0,
          번호: 짝 ? 짝.원번호 : r.student_code,
          사유: '명부에 없는 학생 번호 — 조를 적지 못했다(번호 오타이거나 아직 명부에 안 선 학생)',
        });
      });
    }
    const 해제 = await sql`
      update engine.learners
         set group_no = null, seat_no = null
       where (group_no is not null or seat_no is not null)
         and ${코드들.length ? sql`student_code not in ${sql(코드들)}` : sql`true`}
      returning student_code`;
    조해제 = 해제.length;
  }

  /* 다음 한 걸음 = 동의 (유호 확정: 등록 직후). 여기서 만들지 않는다 — 세어서 부르기만 한다.
   * 이름을 다 부른다: 숫자만 주면 원장이 누구인지 찾으러 DB 를 열고, 그 왕복이 곧 「나중에」가 된다. */
  let 무동의: string[] = [];
  if (새로.length) {
    const 동의수 = await sql`select l.student_code, count(c.learner_id)::int as n
      from engine.learners l left join engine.consents c on c.learner_id = l.learner_id
      where l.student_code in ${sql(새로)} group by 1`;
    const 센것 = new Map((동의수 as unknown as Array<{ student_code: string; n: number }>).map((r) => [r.student_code, r.n]));
    무동의 = 새로.filter((code) => !((센것.get(code) ?? 0) > 0));
  }

  /* 분모부터 말한다(F207) — 「0건 처리」와 「안 읽었다」가 같은 모양이면 안 된다. */
  return 봉투(200, {
    ok: true,
    읽은행: 행들.length + (대상아닌행 || []).length,
    대상아님: (대상아닌행 || []).length,
    역할오류들,
    문제들,
    막힘: 막힌것,
    넣음: 새로.length,
    넣은명단: 새로,
    경쟁흡수: 넣을것.length - 새로.length,   // on conflict 가 삼킨 수 — CLI 와 같은 아침에 돌면 0 이 아니다
    건너뜀: 건너뛴것.length,
    무동의,
    /* 반(§8-1). 🔑 `반미배정` 은 거절이 아니라 **매 판 반복되는 셈**이다 — 반이 안 적힌
     * 학생은 그대로 들어오되(앱은 써야 한다) 강사 큐엔 안 뜨므로, 여기서 이름을 계속 부른다.
     * 반 열을 아직 안 쓰는 시트에서는 빈 목록이다(전량 비면 무시 · lib). */
    반미배정: 반미배정(정상),
    새반,
    반갱신,
    /* 조·좌석(숙제서클 §10-3) — `조편성` 키가 없던 판에서는 셋 다 0·빈 배열이다. */
    조갱신,
    조해제,
    조편성문제,
    schema_ver: (계약 as { 버전: string }).버전,
  });
});
