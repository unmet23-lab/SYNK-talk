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

const { 머리글자리, 표읽기, 행별가르기, 계획 } = 명부규칙 as {
  머리글자리: (표: string[][]) => { 오류: string[] };
  표읽기: (표: string[][]) => {
    행들: Array<{ 번호: string; 전화: string; 이름: string; 역할: string; 줄: number }>;
    대상아닌행?: Array<{ 역할: string }>;
    오류: string[];
  };
  행별가르기: (행들: unknown[]) => {
    정상: Array<{ 번호: string; 전화: string; 이름: string; 줄: number }>;
    문제들: Array<{ 줄: number; 번호: string; 사유: string }>;
  };
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

  let 새로: string[] = [];
  if (넣을것.length) {
    const 행값들 = 넣을것.map((r) => ({
      student_code: 학생번호표기(r.번호),
      contact: r.전화,
      display_name: r.이름 || null,
      schema_ver: (계약 as { 버전: string }).버전,
    }));
    const 결과 = await sql`
      insert into engine.learners ${sql(행값들 as unknown as Record<string, never>[], 'student_code', 'contact', 'display_name', 'schema_ver')}
      on conflict (student_code) do nothing
      returning student_code`;
    새로 = (결과 as unknown as Array<{ student_code: string }>).map((r) => r.student_code);
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
    schema_ver: (계약 as { 버전: string }).버전,
  });
});
